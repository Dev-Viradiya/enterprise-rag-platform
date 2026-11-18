from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timezone
from enum import Enum

# --- Enums for RBAC and Security ---
class RoleEnum(str, Enum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"
    END_USER = "end_user"

class AccessLevelEnum(str, Enum):
    PUBLIC = "public"   # Accessible by all users in the organization
    PRIVATE = "private" # Accessible only by Org Admins or specific roles

# --- Database Schemas ---

class Organization(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    name: str
    domain: str  # The trigger for domain matching (e.g., "pdeu.ac.in")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class User(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    email: EmailStr
    hashed_password: str
    role: RoleEnum = RoleEnum.END_USER
    organization_id: str  # Links user to their tenant
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DocumentMetadata(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    title: str
    file_type: str # pdf, docx, txt, etc.
    organization_id: str # Crucial for tenant isolation
    uploaded_by: str # User ID of the Org Admin
    uploaded_by_email: str = "" # Email of uploader for display
    access_level: AccessLevelEnum = AccessLevelEnum.PUBLIC
    pinecone_namespace: str # Organizes vectors logically in Pinecone
    chunk_count: int = 0 # Number of chunks created from this document
    file_size: int = 0 # File size in bytes
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Conversation(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    organization_id: str
    title: str = "New conversation"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatMessage(BaseModel):
    id: Optional[str] = Field(alias="_id", default=None)
    user_id: str
    organization_id: str
    conversation_id: str  # Links message to a conversation
    role: str # "user" or "ai"
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))