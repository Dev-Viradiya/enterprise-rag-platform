from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import os
import json
import asyncio
from datetime import datetime, timezone

from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_classic.chains import create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain

from auth import get_current_user_payload
from models import RoleEnum, ChatMessage, Conversation
from database import db  # <-- Import the database connection

from bson import ObjectId

router = APIRouter(prefix="/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[str] = None  # If None, create a new conversation
    target_org_id: Optional[str] = None    # Central Admin can target a specific org or "all"

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


# --- Conversation Management ---

@router.get("/conversations")
async def list_conversations(user_payload: dict = Depends(get_current_user_payload)):
    """List all conversations for the current user, sorted by most recent."""
    user_id = user_payload["sub"]
    cursor = db.conversations.find({"user_id": user_id}).sort("updated_at", -1)
    conversations = await cursor.to_list(length=100)
    
    for conv in conversations:
        conv["_id"] = str(conv["_id"])
    
    return conversations

@router.post("/conversations")
async def create_conversation(user_payload: dict = Depends(get_current_user_payload)):
    """Create a new empty conversation."""
    user_id = user_payload["sub"]
    org_id = user_payload["org_id"]
    
    conv = Conversation(
        user_id=user_id,
        organization_id=org_id,
        title="New conversation"
    )
    result = await db.conversations.insert_one(conv.model_dump(by_alias=True, exclude={"id"}))
    return {"_id": str(result.inserted_id), "title": "New conversation"}

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user_payload: dict = Depends(get_current_user_payload)):
    """Delete a conversation and all its messages."""
    user_id = user_payload["sub"]
    
    conv = await db.conversations.find_one({"_id": ObjectId(conversation_id), "user_id": user_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    await db.chat_history.delete_many({"conversation_id": conversation_id})
    await db.conversations.delete_one({"_id": ObjectId(conversation_id)})
    
    return {"message": "Conversation deleted"}

@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str, user_payload: dict = Depends(get_current_user_payload)):
    """Get all messages for a specific conversation."""
    user_id = user_payload["sub"]
    
    # Verify the conversation belongs to this user
    conv = await db.conversations.find_one({"_id": ObjectId(conversation_id), "user_id": user_id})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    cursor = db.chat_history.find({"conversation_id": conversation_id}).sort("created_at", 1)
    messages = await cursor.to_list(length=200)
    
    for msg in messages:
        msg["_id"] = str(msg["_id"])
    
    return messages


# --- Legacy endpoint kept for backward compatibility ---
@router.get("/history")
async def get_chat_history(user_payload: dict = Depends(get_current_user_payload)):
    user_id = user_payload["sub"]
    
    # Fetch the last 50 messages for this specific user, sorted chronologically
    cursor = db.chat_history.find({"user_id": user_id}).sort("created_at", 1).limit(50)
    messages = await cursor.to_list(length=50)
    
    # Convert MongoDB ObjectIds to strings for the JSON response
    for msg in messages:
        msg["_id"] = str(msg["_id"])
        
    return messages


@router.post("/stream")
async def chat_with_agent_stream(
    request: ChatRequest,
    user_payload: dict = Depends(get_current_user_payload)
):
    org_id = user_payload["org_id"]
    user_role = user_payload["role"]
    user_id = user_payload["sub"]

    # --- Conversation management ---
    conversation_id = request.conversation_id
    
    if not conversation_id:
        # Create a new conversation with the first query as title (truncated)
        title = request.query[:80] + ("..." if len(request.query) > 80 else "")
        conv = Conversation(
            user_id=user_id,
            organization_id=org_id,
            title=title
        )
        result = await db.conversations.insert_one(conv.model_dump(by_alias=True, exclude={"id"}))
        conversation_id = str(result.inserted_id)
    else:
        # Verify conversation belongs to user
        conv = await db.conversations.find_one({"_id": ObjectId(conversation_id), "user_id": user_id})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")

    # Update the conversation's updated_at timestamp
    await db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"updated_at": datetime.now(timezone.utc)}}
    )

    # Model configuration
    llm = ChatGroq(
        api_key=os.getenv("GROQ_API_KEY"),
        model_name="openai/gpt-oss-120b",
        temperature=0.1
    )

    vectorstore = PineconeVectorStore(
        index_name=os.getenv("PINECONE_INDEX_NAME", "enterprise-rag"),
        embedding=embeddings,
        namespace=org_id,
        pinecone_api_key=os.getenv("PINECONE_API_KEY")
    )

    query_text = request.query.strip()
    query_lower = query_text.lower()

    # --- STRICT ACCESS CONTROL & RELEVANCE ENFORCEMENT ---
    # 1. Fetch private documents registered in MongoDB for this tenant
    private_docs_cursor = db.documents.find({"organization_id": org_id, "access_level": "private"})
    private_docs = await private_docs_cursor.to_list(length=100)
    
    # Extract private document titles and stems (e.g. "unit 2", "unit2", "unit2.pdf")
    private_stems = []
    for d in private_docs:
        title = d.get("title", "").lower()
        if title:
            private_stems.append(title)
            stem = title.rsplit(".", 1)[0]
            if len(stem) >= 3:
                private_stems.append(stem)
                # Also handle spacing variations (e.g. "unit2" -> "unit 2")
                private_stems.append(stem.replace(" ", ""))

    # Evaluate query security and context relevance
    security_blocked_reason = None
    is_unavailable = False
    context_docs = []

    if user_role == RoleEnum.SUPER_ADMIN:
        # Central Platform Admin: Search across all active tenant knowledge bases or a selected target organization
        if request.target_org_id and request.target_org_id != "all":
            search_namespaces = [request.target_org_id]
        else:
            active_orgs = await db.documents.distinct("organization_id")
            search_namespaces = list(active_orgs) if active_orgs else [org_id]

        all_matches = []
        for ns in search_namespaces:
            try:
                vs = PineconeVectorStore(
                    index_name=os.getenv("PINECONE_INDEX_NAME", "enterprise-rag"),
                    embedding=embeddings,
                    namespace=ns,
                    pinecone_api_key=os.getenv("PINECONE_API_KEY")
                )
                matches = await asyncio.to_thread(vs.similarity_search_with_score, query_text, k=4)
                all_matches.extend(matches)
            except Exception as e:
                print(f"[Pinecone Search Error ns={ns}]: {e}")

        # Rank all retrieved chunks across all namespaces
        all_matches.sort(key=lambda x: x[1], reverse=True)
        # Select top relevant chunks with reasonable threshold
        context_docs = [doc for doc, score in all_matches[:6] if score >= 0.25]
        if not context_docs:
            is_unavailable = True

    elif user_role == RoleEnum.ORG_ADMIN:
        # Organization Admin: Search all public and private documents within their organization
        all_matches = await asyncio.to_thread(
            vectorstore.similarity_search_with_score,
            query_text, k=5
        )
        context_docs = [doc for doc, score in all_matches if score >= 0.25]
        if not context_docs:
            is_unavailable = True

    else:
        # End User: Strict RBAC Document Isolation (Public only, private strictly forbidden)
        mentions_private_doc = any(stem in query_lower for stem in private_stems if len(stem) >= 3)
        mentions_private_terms = any(kw in query_lower for kw in ["private document", "private doc", "confidential document", "restricted document"])

        if mentions_private_doc or mentions_private_terms:
            security_blocked_reason = (
                "🔒 **Access Restricted**: The requested information references a restricted private document. "
                "End-user accounts are strictly prohibited from viewing or querying private organization records."
            )
        else:
            priv_matches = await asyncio.to_thread(
                vectorstore.similarity_search_with_score,
                query_text, k=1, filter={"access_level": "private"}
            )
            pub_matches = await asyncio.to_thread(
                vectorstore.similarity_search_with_score,
                query_text, k=4, filter={"access_level": "public"}
            )

            priv_score = priv_matches[0][1] if priv_matches else 0.0
            pub_score = pub_matches[0][1] if pub_matches else 0.0
            
            if priv_score >= 0.40 and (pub_score < 0.38 or priv_score > (pub_score + 0.12)):
                source_name = priv_matches[0][0].metadata.get("source", "Private Document")
                security_blocked_reason = (
                    f"🔒 **Access Restricted**: The requested information is contained in a private document (`{source_name}`). "
                    "End-user accounts do not have permission to access private organization files."
                )
            elif pub_score < 0.28:
                is_unavailable = True
            else:
                context_docs = [doc for doc, score in pub_matches if score >= 0.28]

    # --- LLM CHAIN SETUP (Only used if not blocked or unavailable) ---
    system_prompt = (
        "You are an expert AI Knowledge Assistant for an enterprise educational institution.\n\n"
        "STRICT GROUNDING DIRECTIVES:\n"
        "1. You MUST answer STRICTLY and ONLY based on the provided Context below.\n"
        "2. Do NOT use any prior training data, outside knowledge, or assumptions.\n"
        "3. If the context does not explicitly provide the facts to answer the question, respond EXACTLY with:\n"
        "'The requested information is unavailable in your organization\\'s documents.'\n\n"
        "PROFESSIONAL FORMATTING & PRESENTATION GUIDELINES:\n"
        "- Structure your answer logically with clean headings, bold highlights, and spacious formatting.\n"
        "- Begin with a concise bold summary or direct answer.\n"
        "- Use Markdown headings (### Section Title) to organize explanations into distinct sections.\n"
        "- Use bullet points (- **Key Term**: concise explanation) to make core details scannable.\n"
        "- Use blockquotes (> **Key Note**: ...) for important takeaways or definitions.\n"
        "- When comparing concepts, definitions, components, or tabular data, ALWAYS use a valid Markdown table.\n"
        "  CRITICAL TABLE RULES:\n"
        "  * Always include the header delimiter row with hyphens (e.g. `| Feature | Description |\n| :--- | :--- |`).\n"
        "  * Put each table row on its own line. NEVER merge multiple rows on one line or join rows with `||`.\n"
        "  * Leave an empty newline before and after the table.\n"
        "  * Example:\n"
        "    | Component | Role |\n"
        "    | :--- | :--- |\n"
        "    | Term | The token extracted from text |\n"
        "    | Posting List | List of document identifiers |\n"
        "- Use formatted code blocks with language identifiers (```python, ```sql, etc.) where appropriate.\n"
        "- Keep paragraphs short (2-3 sentences max) with empty lines between sections for readability.\n"
        "- Never output an unbroken wall of text.\n\n"
        "Context:\n{context}"
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}"),
    ])

    question_answer_chain = create_stuff_documents_chain(llm, prompt)

    async def generate_stream():
        # First send conversation_id so client knows which conversation this belongs to
        yield f"data: {json.dumps({'conversation_id': conversation_id})}\n\n"

        # 1. Save user message to database
        await db.chat_history.insert_one(
            ChatMessage(
                user_id=user_id,
                organization_id=org_id,
                conversation_id=conversation_id,
                role="user",
                content=request.query
            ).model_dump(by_alias=True, exclude={"id"})
        )

        full_ai_response = ""

        # Case A: Blocked by Access Control (Private Document Protection)
        if security_blocked_reason:
            full_ai_response = security_blocked_reason
            yield f"data: {json.dumps({'content': security_blocked_reason})}\n\n"
            yield "data: [DONE]\n\n"

        # Case B: Context unavailable in authorized documents
        elif is_unavailable or not context_docs:
            full_ai_response = "The requested information is unavailable in your organization's documents."
            yield f"data: {json.dumps({'content': full_ai_response})}\n\n"
            yield "data: [DONE]\n\n"

        # Case C: Context available - Stream generated answer from LLM
        else:
            try:
                async for chunk in question_answer_chain.astream({"context": context_docs, "input": request.query}):
                    if chunk:
                        full_ai_response += chunk
                        yield f"data: {json.dumps({'content': chunk})}\n\n"
            except Exception as e:
                # Graceful fallback to 20b model if 120b is temporarily rate-limited
                fallback_llm = ChatGroq(
                    api_key=os.getenv("GROQ_API_KEY"),
                    model_name="openai/gpt-oss-20b",
                    temperature=0.1
                )
                fallback_chain = create_stuff_documents_chain(fallback_llm, prompt)
                async for chunk in fallback_chain.astream({"context": context_docs, "input": request.query}):
                    if chunk:
                        full_ai_response += chunk
                        yield f"data: {json.dumps({'content': chunk})}\n\n"

            yield "data: [DONE]\n\n"

        # 2. Save final AI message to database
        await db.chat_history.insert_one(
            ChatMessage(
                user_id=user_id,
                organization_id=org_id,
                conversation_id=conversation_id,
                role="ai",
                content=full_ai_response
            ).model_dump(by_alias=True, exclude={"id"})
        )

    return StreamingResponse(generate_stream(), media_type="text/event-stream")