from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from typing import List, Optional
import tempfile
import os
import json
from bson import ObjectId
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone

from auth import get_current_user_payload, require_role
from models import RoleEnum, AccessLevelEnum, DocumentMetadata
from database import db

router = APIRouter(prefix="/documents", tags=["Documents"])

# Initialize Embeddings model (Downloads a lightweight open-source model locally)
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    allowed_roles: Optional[str] = Form(None), # JSON string or comma-separated list of allowed tenant roles
    access_level: Optional[str] = Form(None),  # Backward compatibility parameter
    target_org_id: Optional[str] = Form(None),
    # Only Org Admins and Super Admins can upload documents
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    user_role = user_payload.get("role")
    if user_role == RoleEnum.SUPER_ADMIN and target_org_id and target_org_id not in ("default", "all", "", "null"):
        org_id = target_org_id
    else:
        org_id = user_payload["org_id"]

    # Parse allowed_roles list
    allowed_roles_list = []
    if allowed_roles:
        try:
            parsed = json.loads(allowed_roles)
            if isinstance(parsed, list):
                allowed_roles_list = [str(r).strip().lower() for r in parsed if str(r).strip()]
            elif isinstance(parsed, str):
                allowed_roles_list = [r.strip().lower() for r in parsed.split(",") if r.strip()]
        except Exception:
            allowed_roles_list = [r.strip().lower() for r in allowed_roles.split(",") if r.strip()]

    # If no allowed_roles were specified or list was empty, deduce from access_level or organization roles
    if not allowed_roles_list:
        if access_level == "private":
            allowed_roles_list = ["org_admin"]
        else:
            try:
                org = await db.organizations.find_one({"_id": ObjectId(org_id)})
                if org and org.get("roles"):
                    allowed_roles_list = [r.strip().lower() for r in org["roles"] if r.strip()]
            except Exception:
                pass
            if not allowed_roles_list:
                allowed_roles_list = ["org_admin", "end_user"]

    # Deduplicate while preserving order
    seen = set()
    allowed_roles_list = [r for r in allowed_roles_list if not (r in seen or seen.add(r))]

    effective_access_level = "private" if (len(allowed_roles_list) == 1 and allowed_roles_list[0] == "org_admin") else "public"
    
    # Save the uploaded file temporarily to process it
    content = await file.read()
    file_size = len(content)
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}") as temp_file:
        temp_file.write(content)
        temp_path = temp_file.name

    try:
        # 1. Parse Document based on file extension
        ext = file.filename.split(".")[-1].lower()
        if ext == "pdf":
            loader = PyPDFLoader(temp_path)
        elif ext == "docx":
            loader = Docx2txtLoader(temp_path)
        elif ext == "txt":
            loader = TextLoader(temp_path)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
        
        raw_docs = loader.load()

        # 2. Split text into manageable chunks for the LLM context window
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = text_splitter.split_documents(raw_docs)

        # 3. Inject strict metadata for RBAC Document-Level Security
        for chunk in chunks:
            chunk.metadata = {
                "source": file.filename,
                "access_level": effective_access_level,
                "allowed_roles": allowed_roles_list,
                "organization_id": org_id,
                "uploaded_by": user_payload["sub"]
            }

        # 4. Upsert to Pinecone using org_id as the Namespace
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        index_name = os.getenv("PINECONE_INDEX_NAME", "enterprise-rag")
        
        PineconeVectorStore.from_documents(
            documents=chunks,
            embedding=embeddings,
            index_name=index_name,
            namespace=org_id  # This physically isolates tenant data!
        )
        
        # 5. Save document metadata to MongoDB for listing
        doc_meta = DocumentMetadata(
            title=file.filename,
            file_type=ext,
            organization_id=org_id,
            uploaded_by=user_payload["sub"],
            uploaded_by_email=user_payload.get("email", ""),
            access_level=effective_access_level,
            allowed_roles=allowed_roles_list,
            pinecone_namespace=org_id,
            chunk_count=len(chunks),
            file_size=file_size,
        )
        await db.documents.insert_one(doc_meta.model_dump(by_alias=True, exclude={"id"}))
        
        return {
            "message": f"Successfully ingested {file.filename}", 
            "chunks_created": len(chunks),
            "namespace": org_id,
            "access_level": effective_access_level,
            "allowed_roles": allowed_roles_list,
            "file_size": file_size,
        }
        
    finally:
        # Clean up the temp file
        os.remove(temp_path)


@router.get("/list")
async def list_documents(
    organization_id: Optional[str] = None,
    user_payload: dict = Depends(get_current_user_payload)
):
    """
    List documents.
    - Super Admins see all documents across all tenants (or filter by org).
    - Org Admins see all documents within their organization.
    - End users / custom roles see ONLY documents permitted for their specific assigned role.
    """
    user_role = user_payload.get("role", "end_user")
    user_org_id = user_payload.get("org_id")
    
    query = {}
    if user_role == RoleEnum.SUPER_ADMIN:
        if organization_id and organization_id not in ("all", "", "[object Object]", "undefined", "null"):
            query["organization_id"] = organization_id
    elif user_role == RoleEnum.ORG_ADMIN:
        query["organization_id"] = user_org_id
    else:
        # Tenant member with specific role: only documents where their role is allowed
        query["organization_id"] = user_org_id
        query["$or"] = [
            {"allowed_roles": {"$in": [user_role]}},
            {"allowed_roles": {"$exists": False}, "access_level": "public"}
        ]
    
    cursor = db.documents.find(query).sort("created_at", -1)
    documents = await cursor.to_list(length=500)
    
    # Enrich documents with organization name & domain
    orgs_cursor = db.organizations.find()
    orgs_list = await orgs_cursor.to_list(length=200)
    org_map = {str(o["_id"]): o for o in orgs_list}
    
    for doc in documents:
        doc["_id"] = str(doc["_id"])
        doc_org_id = doc.get("organization_id")
        if doc_org_id in org_map:
            doc["organization_name"] = org_map[doc_org_id].get("name", "Unknown Org")
            doc["organization_domain"] = org_map[doc_org_id].get("domain", "")
        else:
            doc["organization_name"] = "Platform Central"
            doc["organization_domain"] = ""
            
        if not doc.get("allowed_roles"):
            doc["allowed_roles"] = ["org_admin"] if doc.get("access_level") == "private" else ["org_admin", "end_user"]
            
    return documents


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    """Delete a document's metadata from MongoDB. (Pinecone vectors are retained for simplicity.)"""
    user_role = user_payload.get("role")
    user_org_id = user_payload.get("org_id")
    
    try:
        oid = ObjectId(document_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID format.")
    
    if user_role == RoleEnum.SUPER_ADMIN:
        doc = await db.documents.find_one({"_id": oid})
    else:
        doc = await db.documents.find_one({"_id": oid, "organization_id": user_org_id})
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    await db.documents.delete_one({"_id": oid})
    return {"message": f"Document '{doc['title']}' removed from records"}