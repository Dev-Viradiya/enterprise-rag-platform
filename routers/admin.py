from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId

from database import db
from auth import get_current_user_payload, require_role, hash_password
from models import RoleEnum, Organization, User, DEFAULT_ORG_ROLES

router = APIRouter(prefix="/admin", tags=["Central Platform Admin"])

# --- Request & Response Schemas ---

class OrgCreate(BaseModel):
    name: str
    domain: str

class QuickOrgProvisionRequest(BaseModel):
    org_name: str
    domain: str
    admin_email: EmailStr
    admin_password: str

class UserProvisionRequest(BaseModel):
    email: EmailStr
    password: str
    organization_id: str
    role: str = "end_user"

class OrgMemberCreateRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "end_user"
    organization_id: Optional[str] = None

class RoleCreateRequest(BaseModel):
    role_name: str

class PasswordResetRequest(BaseModel):
    new_password: str

# Helper to serialize Mongo documents
def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc["_id"] = str(doc["_id"])
    return doc

# ==============================================================================
# SECTION 1: CENTRAL SUPER ADMIN ENDPOINTS (PLATFORM-WIDE)
# ==============================================================================

@router.get("/stats")
async def get_platform_stats(
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """Platform-wide analytics for Central Admin."""
    total_orgs = await db.organizations.count_documents({})
    total_users = await db.users.count_documents({})
    org_admins = await db.users.count_documents({"role": RoleEnum.ORG_ADMIN})
    end_users = await db.users.count_documents({"role": RoleEnum.END_USER})
    super_admins = await db.users.count_documents({"role": RoleEnum.SUPER_ADMIN})
    
    total_docs = await db.documents.count_documents({})
    
    # Aggregate total chunks & file size
    pipeline = [
        {"$group": {
            "_id": None,
            "total_chunks": {"$sum": "$chunk_count"},
            "total_bytes": {"$sum": "$file_size"}
        }}
    ]
    agg_result = await db.documents.aggregate(pipeline).to_list(1)
    total_chunks = agg_result[0]["total_chunks"] if agg_result else 0
    total_bytes = agg_result[0]["total_bytes"] if agg_result else 0
    
    total_conversations = await db.conversations.count_documents({})
    total_messages = await db.chat_messages.count_documents({})

    return {
        "organizations_count": total_orgs,
        "users_count": total_users,
        "org_admins_count": org_admins,
        "end_users_count": end_users,
        "super_admins_count": super_admins,
        "documents_count": total_docs,
        "total_chunks": total_chunks,
        "total_bytes": total_bytes,
        "conversations_count": total_conversations,
        "messages_count": total_messages
    }

@router.get("/organizations")
async def list_organizations(
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """List all organizations with associated user and document counts."""
    cursor = db.organizations.find().sort("created_at", -1)
    orgs = await cursor.to_list(length=200)
    
    enriched_orgs = []
    for org in orgs:
        org_id_str = str(org["_id"])
        user_count = await db.users.count_documents({"organization_id": org_id_str})
        doc_count = await db.documents.count_documents({"organization_id": org_id_str})
        enriched_orgs.append({
            "_id": org_id_str,
            "name": org.get("name", "Unnamed Org"),
            "domain": org.get("domain", ""),
            "roles": org.get("roles", list(DEFAULT_ORG_ROLES)),
            "created_at": org.get("created_at", ""),
            "user_count": user_count,
            "doc_count": doc_count
        })
    return enriched_orgs

@router.post("/organizations")
async def create_organization(
    org_in: OrgCreate,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """Central Admin provisions a new organization tenant."""
    clean_domain = org_in.domain.strip().lower()
    clean_name = org_in.name.strip()
    
    if not clean_domain or not clean_name:
        raise HTTPException(status_code=400, detail="Organization name and domain are required.")
    
    # Check if domain is already registered
    existing = await db.organizations.find_one({"domain": clean_domain})
    if existing:
        raise HTTPException(status_code=400, detail=f"Organization with domain '{clean_domain}' already exists.")
    
    new_org = Organization(name=clean_name, domain=clean_domain, roles=list(DEFAULT_ORG_ROLES))
    res = await db.organizations.insert_one(new_org.model_dump(by_alias=True, exclude={"id"}))
    
    return {
        "message": "Organization provisioned successfully",
        "organization": {
            "_id": str(res.inserted_id),
            "name": clean_name,
            "domain": clean_domain,
            "roles": list(DEFAULT_ORG_ROLES)
        }
    }

@router.post("/organizations/quick-provision")
async def quick_provision_organization_and_admin(
    payload: QuickOrgProvisionRequest,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """
    1-Click B2B Onboarding: Central Admin provisions an Organization AND its primary Org Admin credentials.
    Returns a ready-to-share credential packet for client handover.
    """
    clean_domain = payload.domain.strip().lower()
    clean_name = payload.org_name.strip()
    clean_email = payload.admin_email.strip().lower()
    
    if not clean_domain or not clean_name:
        raise HTTPException(status_code=400, detail="Organization name and domain are required.")
    if len(payload.admin_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    # Check duplicate domain
    if await db.organizations.find_one({"domain": clean_domain}):
        raise HTTPException(status_code=400, detail=f"Organization with domain '{clean_domain}' already exists.")
        
    # Check duplicate admin email
    if await db.users.find_one({"email": clean_email}):
        raise HTTPException(status_code=400, detail=f"User with email '{clean_email}' already exists.")
        
    # 1. Create Organization
    new_org = Organization(name=clean_name, domain=clean_domain, roles=list(DEFAULT_ORG_ROLES))
    org_res = await db.organizations.insert_one(new_org.model_dump(by_alias=True, exclude={"id"}))
    org_id = str(org_res.inserted_id)
    
    # 2. Create Org Admin User
    admin_user = User(
        email=clean_email,
        hashed_password=hash_password(payload.admin_password),
        organization_id=org_id,
        role=RoleEnum.ORG_ADMIN.value
    )
    user_res = await db.users.insert_one(admin_user.model_dump(by_alias=True, exclude={"id"}))
    user_id = str(user_res.inserted_id)
    
    return {
        "message": f"Successfully onboarded {clean_name} and provisioned Org Admin credentials.",
        "organization": {
            "_id": org_id,
            "name": clean_name,
            "domain": clean_domain,
            "roles": list(DEFAULT_ORG_ROLES)
        },
        "admin_user": {
            "_id": user_id,
            "email": clean_email,
            "role": RoleEnum.ORG_ADMIN.value
        },
        "credentials": {
            "organization_name": clean_name,
            "organization_domain": clean_domain,
            "organization_id": org_id,
            "email": clean_email,
            "password": payload.admin_password,
            "role": "Organization Admin (org_admin)"
        }
    }

@router.get("/organizations/{org_id}/roles")
async def get_organization_roles(
    org_id: str,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN, RoleEnum.ORG_ADMIN]))
):
    """Fetch all available user roles configured for a specific organization tenant."""
    try:
        oid = ObjectId(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization ID format.")
    
    org = await db.organizations.find_one({"_id": oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    
    roles = org.get("roles")
    if not roles or not isinstance(roles, list) or len(roles) == 0:
        roles = list(DEFAULT_ORG_ROLES)
        await db.organizations.update_one({"_id": oid}, {"$set": {"roles": roles}})
        
    return {
        "organization_id": org_id,
        "organization_name": org.get("name"),
        "roles": roles
    }

@router.post("/organizations/{org_id}/roles")
async def add_organization_role(
    org_id: str,
    role_data: RoleCreateRequest,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN, RoleEnum.ORG_ADMIN]))
):
    """Central Admin or Org Admin adds a custom role to an organization."""
    user_role = user_payload.get("role")
    user_org_id = user_payload.get("org_id")
    if user_role != RoleEnum.SUPER_ADMIN and user_org_id != org_id:
        raise HTTPException(status_code=403, detail="You can only manage roles for your own organization.")
        
    try:
        oid = ObjectId(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization ID format.")
        
    org = await db.organizations.find_one({"_id": oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
        
    clean_role = role_data.role_name.strip().lower().replace(" ", "_")
    if not clean_role or len(clean_role) < 2 or len(clean_role) > 30:
        raise HTTPException(status_code=400, detail="Role name must be between 2 and 30 characters.")
    if clean_role == RoleEnum.SUPER_ADMIN.value:
        raise HTTPException(status_code=400, detail="Cannot create super_admin as an organization role.")
        
    current_roles = org.get("roles")
    if not current_roles or not isinstance(current_roles, list):
        current_roles = list(DEFAULT_ORG_ROLES)
        
    if clean_role not in current_roles:
        current_roles.append(clean_role)
        await db.organizations.update_one({"_id": oid}, {"$set": {"roles": current_roles}})
        
    return {
        "message": f"Role '{clean_role}' added successfully.",
        "organization_id": org_id,
        "roles": current_roles,
        "added_role": clean_role
    }

@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: str,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """Central Admin deletes an organization and cleans up users, documents, and conversations."""
    try:
        oid = ObjectId(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization ID format.")
    
    org = await db.organizations.find_one({"_id": oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    
    # Cascade delete users, documents, conversations, chat messages
    await db.users.delete_many({"organization_id": org_id})
    await db.documents.delete_many({"organization_id": org_id})
    await db.conversations.delete_many({"organization_id": org_id})
    await db.chat_messages.delete_many({"organization_id": org_id})
    await db.organizations.delete_one({"_id": oid})
    
    return {"message": f"Organization '{org.get('name')}' and all associated records deleted successfully."}

@router.get("/users")
async def list_all_users(
    organization_id: Optional[str] = None,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """Central Admin lists all users across all organizations with tenant details."""
    filter_query = {}
    if organization_id:
        filter_query["organization_id"] = organization_id
        
    cursor = db.users.find(filter_query).sort("created_at", -1)
    users = await cursor.to_list(length=500)
    
    # Pre-fetch org map for fast lookup
    all_orgs = await db.organizations.find().to_list(length=300)
    org_map = {str(o["_id"]): o.get("name", "Unknown Org") for o in all_orgs}
    org_domain_map = {str(o["_id"]): o.get("domain", "") for o in all_orgs}
    
    user_list = []
    for u in users:
        u_org_id = str(u.get("organization_id", ""))
        user_list.append({
            "_id": str(u["_id"]),
            "email": u.get("email"),
            "role": u.get("role", RoleEnum.END_USER),
            "organization_id": u_org_id,
            "org_name": org_map.get(u_org_id, "Central Platform" if u.get("role") == RoleEnum.SUPER_ADMIN else "Unknown Org"),
            "org_domain": org_domain_map.get(u_org_id, "platform" if u.get("role") == RoleEnum.SUPER_ADMIN else ""),
            "created_at": u.get("created_at", "")
        })
    return user_list

@router.post("/users")
async def provision_user(
    user_data: UserProvisionRequest,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """
    Central Admin provisions credentials for an Org Admin or End User in any organization.
    Returns complete credential handover summary for copy/share.
    """
    clean_email = user_data.email.strip().lower()
    
    if len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    # Check duplicate email
    if await db.users.find_one({"email": clean_email}):
        raise HTTPException(status_code=400, detail=f"User with email '{clean_email}' already exists.")
        
    # Verify target organization exists
    try:
        oid = ObjectId(user_data.organization_id)
        org = await db.organizations.find_one({"_id": oid})
    except Exception:
        org = None
        
    clean_role = user_data.role.strip().lower()
    if not clean_role:
        clean_role = "end_user"

    if not org and clean_role != RoleEnum.SUPER_ADMIN.value:
        raise HTTPException(status_code=400, detail="Target organization does not exist.")
        
    org_name = org.get("name") if org else "Central Platform"
    org_domain = org.get("domain") if org else "ragplatform.com"
    
    # Auto-register role in organization's role directory if not present
    if org and clean_role != RoleEnum.SUPER_ADMIN.value:
        org_roles = org.get("roles")
        if not org_roles or not isinstance(org_roles, list):
            org_roles = list(DEFAULT_ORG_ROLES)
        if clean_role not in org_roles:
            org_roles.append(clean_role)
            await db.organizations.update_one({"_id": oid}, {"$set": {"roles": org_roles}})

    db_user = User(
        email=clean_email,
        hashed_password=hash_password(user_data.password),
        organization_id=user_data.organization_id,
        role=clean_role
    )
    
    res = await db.users.insert_one(db_user.model_dump(by_alias=True, exclude={"id"}))
    
    role_label = clean_role.replace("_", " ").title()
    if clean_role == RoleEnum.ORG_ADMIN.value:
        role_label = "Organization Admin"
    elif clean_role == RoleEnum.SUPER_ADMIN.value:
        role_label = "Super Admin"
    elif clean_role == RoleEnum.END_USER.value:
        role_label = "End User"
    
    return {
        "message": f"Successfully provisioned {role_label} credentials for {clean_email}",
        "user": {
            "_id": str(res.inserted_id),
            "email": clean_email,
            "role": clean_role,
            "organization_id": user_data.organization_id,
            "organization_name": org_name,
            "organization_domain": org_domain
        },
        "credentials": {
            "organization_name": org_name,
            "organization_domain": org_domain,
            "organization_id": user_data.organization_id,
            "email": clean_email,
            "password": user_data.password,
            "role": role_label
        }
    }

@router.patch("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    reset_data: PasswordResetRequest,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """Central Admin resets credentials for any user in any organization."""
    if len(reset_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    hashed = hash_password(reset_data.new_password)
    await db.users.update_one({"_id": uid}, {"$set": {"hashed_password": hashed}})
    
    return {
        "message": f"Password reset successfully for {user.get('email')}.",
        "email": user.get("email"),
        "new_password": reset_data.new_password
    }

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user_payload: dict = Depends(require_role([RoleEnum.SUPER_ADMIN]))
):
    """Central Admin removes any user account."""
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    if str(user["_id"]) == user_payload["sub"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own super admin account.")
        
    await db.users.delete_one({"_id": uid})
    await db.conversations.delete_many({"user_id": user_id})
    await db.chat_messages.delete_many({"user_id": user_id})
    
    return {"message": f"User {user.get('email')} removed successfully."}

# ==============================================================================
# SECTION 2: ORG ADMIN ENDPOINTS (TENANT-SCOPED)
# Allows Tenant Admins to manage end-users within their own organization ONLY.
# ==============================================================================

@router.get("/org/roles")
async def get_my_org_roles(
    user_payload: dict = Depends(get_current_user_payload)
):
    """Org Admin or member retrieves available user roles configured for their tenant."""
    org_id = user_payload.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization linked to user.")
        
    try:
        oid = ObjectId(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization ID.")
        
    org = await db.organizations.find_one({"_id": oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
        
    roles = org.get("roles")
    if not roles or not isinstance(roles, list) or len(roles) == 0:
        roles = list(DEFAULT_ORG_ROLES)
        await db.organizations.update_one({"_id": oid}, {"$set": {"roles": roles}})
        
    return {
        "organization_id": org_id,
        "organization_name": org.get("name"),
        "roles": roles
    }

@router.post("/org/roles")
async def add_my_org_role(
    role_data: RoleCreateRequest,
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    """Org Admin adds a new custom role to their organization."""
    org_id = user_payload.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization linked to user.")
        
    try:
        oid = ObjectId(org_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid organization ID.")
        
    org = await db.organizations.find_one({"_id": oid})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
        
    clean_role = role_data.role_name.strip().lower().replace(" ", "_")
    if not clean_role or len(clean_role) < 2 or len(clean_role) > 30:
        raise HTTPException(status_code=400, detail="Role name must be between 2 and 30 characters.")
    if clean_role == RoleEnum.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Cannot create super_admin as an organization role.")
        
    current_roles = org.get("roles")
    if not current_roles or not isinstance(current_roles, list):
        current_roles = list(DEFAULT_ORG_ROLES)
        
    if clean_role not in current_roles:
        current_roles.append(clean_role)
        await db.organizations.update_one({"_id": oid}, {"$set": {"roles": current_roles}})
        
    return {
        "message": f"Role '{clean_role}' added successfully to organization.",
        "organization_id": org_id,
        "roles": current_roles,
        "added_role": clean_role
    }

@router.get("/org/users")
async def list_org_users(
    organization_id: Optional[str] = None,
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    """
    Org Admin lists members belonging to their own organization.
    Super Admin can view any organization by supplying organization_id.
    """
    user_role = user_payload.get("role")
    if user_role == RoleEnum.SUPER_ADMIN and organization_id:
        org_id = organization_id
    else:
        org_id = user_payload.get("org_id")
        
    org = None
    if org_id:
        try:
            org = await db.organizations.find_one({"_id": ObjectId(org_id)})
        except Exception:
            pass

    cursor = db.users.find({"organization_id": org_id}).sort("created_at", -1)
    users = await cursor.to_list(length=300)
    
    org_name = org.get("name") if org else user_payload.get("org_name", "Organization")
    org_domain = org.get("domain") if org else user_payload.get("org_domain", "")
    org_roles = org.get("roles") if org else None
    if not org_roles or not isinstance(org_roles, list) or len(org_roles) == 0:
        org_roles = list(DEFAULT_ORG_ROLES)

    user_list = [
        {
            "_id": str(u["_id"]),
            "email": u.get("email"),
            "role": u.get("role", RoleEnum.END_USER.value),
            "organization_id": str(u.get("organization_id", org_id)),
            "created_at": u.get("created_at", "")
        }
        for u in users
    ]

    role_counts = {}
    for u in user_list:
        r = u.get("role", "end_user")
        role_counts[r] = role_counts.get(r, 0) + 1

    total_members = len(user_list)
    end_users = role_counts.get(RoleEnum.END_USER.value, 0)
    org_admins = role_counts.get(RoleEnum.ORG_ADMIN.value, 0)

    return {
        "organization": {
            "_id": org_id,
            "name": org_name,
            "domain": org_domain,
            "roles": org_roles
        },
        "users": user_list,
        "roles": org_roles,
        "stats": {
            "total_members": total_members,
            "end_users": end_users,
            "org_admins": org_admins,
            "role_counts": role_counts
        }
    }

@router.post("/org/users")
async def create_org_member(
    member_data: OrgMemberCreateRequest,
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    """
    Org Admin provisions a new member with any assigned organization role in their own organization ONLY.
    - Strict Tenant Boundary: Org Admin CANNOT provision users in other organizations.
    - Privilege Boundary: Org Admin can assign any tenant role, but CANNOT create Super Admins.
    - Returns full credential packet for handover.
    """
    clean_email = member_data.email.strip().lower()
    user_role = user_payload.get("role")
    
    # 1. Strict Tenant Isolation:
    if user_role == RoleEnum.SUPER_ADMIN and member_data.organization_id:
        org_id = member_data.organization_id
    else:
        org_id = user_payload.get("org_id")
        
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization identifier in session.")
        
    # Verify organization exists in database
    try:
        oid = ObjectId(org_id)
        org = await db.organizations.find_one({"_id": oid})
    except Exception:
        org = None
        
    if not org:
        raise HTTPException(status_code=404, detail="Target organization does not exist.")
        
    org_name = org.get("name", "Organization")
    org_domain = org.get("domain", "")

    # 2. Role Assignment:
    requested_role = (member_data.role or "end_user").strip().lower()
    if requested_role == RoleEnum.SUPER_ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail="Organization Admins cannot create Super Admin accounts."
        )
    target_role = requested_role

    # Auto-register role in organization roles list if not present
    org_roles = org.get("roles")
    if not org_roles or not isinstance(org_roles, list):
        org_roles = list(DEFAULT_ORG_ROLES)
    if target_role not in org_roles:
        org_roles.append(target_role)
        await db.organizations.update_one({"_id": oid}, {"$set": {"roles": org_roles}})

    # 3. Password Validation
    if len(member_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    # 4. Check for duplicate email across the platform
    if await db.users.find_one({"email": clean_email}):
        raise HTTPException(status_code=400, detail=f"User with email '{clean_email}' already exists.")
        
    # 5. Cross-Tenant Domain Conflict Protection:
    email_domain = clean_email.split("@")[-1]
    conflicting_org = await db.organizations.find_one({"domain": email_domain})
    if conflicting_org and str(conflicting_org["_id"]) != str(org_id):
        raise HTTPException(
            status_code=400, 
            detail=f"Email domain '@{email_domain}' belongs to organization '{conflicting_org.get('name')}'. Organization Admins can only add users for their own organization."
        )

    # 6. Save new user strictly scoped to this organization
    new_user = User(
        email=clean_email,
        hashed_password=hash_password(member_data.password),
        organization_id=org_id,
        role=target_role
    )
    res = await db.users.insert_one(new_user.model_dump(by_alias=True, exclude={"id"}))
    user_id = str(res.inserted_id)
    
    role_label = target_role.replace("_", " ").title()
    if target_role == RoleEnum.ORG_ADMIN.value:
        role_label = "Organization Admin"
    elif target_role == RoleEnum.END_USER.value:
        role_label = "End User"
    
    return {
        "message": f"Successfully added {role_label} '{clean_email}' to {org_name}.",
        "user": {
            "_id": user_id,
            "email": clean_email,
            "role": target_role,
            "organization_id": org_id,
            "organization_name": org_name,
            "organization_domain": org_domain
        },
        "credentials": {
            "organization_name": org_name,
            "organization_domain": org_domain,
            "organization_id": org_id,
            "email": clean_email,
            "password": member_data.password,
            "role": role_label
        }
    }

@router.patch("/org/users/{user_id}/reset-password")
async def reset_org_member_password(
    user_id: str,
    reset_data: PasswordResetRequest,
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    """
    Org Admin resets password for a member in their own organization.
    """
    if len(reset_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        
    user_role = user_payload.get("role")
    org_id = user_payload.get("org_id")
    
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    # Tenant boundary enforcement: If Org Admin, target user must be within their own organization
    query = {"_id": uid}
    if user_role != RoleEnum.SUPER_ADMIN:
        query["organization_id"] = org_id
        
    user = await db.users.find_one(query)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organization.")
        
    # Prevent resetting Super Admin accounts
    if user_role != RoleEnum.SUPER_ADMIN and user.get("role") == RoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot reset password for Super Admin accounts.")
        
    org = await db.organizations.find_one({"_id": ObjectId(user.get("organization_id"))}) if user.get("organization_id") else None
    org_name = org.get("name") if org else "Organization"
    org_domain = org.get("domain") if org else ""
    role_label = "Organization Admin" if user.get("role") == RoleEnum.ORG_ADMIN else "End User"

    hashed = hash_password(reset_data.new_password)
    await db.users.update_one({"_id": uid}, {"$set": {"hashed_password": hashed}})
    
    return {
        "message": f"Password reset successfully for {user.get('email')}.",
        "credentials": {
            "organization_name": org_name,
            "organization_domain": org_domain,
            "organization_id": user.get("organization_id"),
            "email": user.get("email"),
            "password": reset_data.new_password,
            "role": role_label
        }
    }

@router.delete("/org/users/{user_id}")
async def remove_org_member(
    user_id: str,
    user_payload: dict = Depends(require_role([RoleEnum.ORG_ADMIN, RoleEnum.SUPER_ADMIN]))
):
    """
    Org Admin removes a team member from their organization.
    """
    user_role = user_payload.get("role")
    org_id = user_payload.get("org_id")
    
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
        
    query = {"_id": uid}
    if user_role != RoleEnum.SUPER_ADMIN:
        query["organization_id"] = org_id
        
    user = await db.users.find_one(query)
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your organization.")
        
    # Prevent deleting own account
    if str(user["_id"]) == user_payload["sub"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")
        
    # Prevent deleting Super Admin
    if user.get("role") == RoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot remove Super Admin accounts.")
        
    await db.users.delete_one({"_id": uid})
    await db.conversations.delete_many({"user_id": user_id})
    await db.chat_messages.delete_many({"user_id": user_id})
    
    return {"message": f"User {user.get('email')} removed from organization successfully."}
