from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from database import db
from dotenv import load_dotenv
import os
from contextlib import asynccontextmanager
from routers import documents, chat, admin
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId

from models import User, Organization, RoleEnum
from auth import (
    hash_password, verify_password, create_access_token, 
    require_role, get_current_user_payload
)

load_dotenv()

# --- Central Super Admin Automatic Seeding ---
async def seed_super_admin():
    """Ensure platform always has a Master Central Admin on boot."""
    try:
        admin_email = os.getenv("CENTRAL_ADMIN_EMAIL", "superadmin@ragplatform.com").strip().lower()
        admin_pass = os.getenv("CENTRAL_ADMIN_PASSWORD", "CentralAdmin123!")

        # Check or create system root organization
        system_org = await db.organizations.find_one({"domain": "ragplatform.com"})
        if not system_org:
            new_org = Organization(name="Central Platform Master", domain="ragplatform.com")
            res = await db.organizations.insert_one(new_org.model_dump(by_alias=True, exclude={"id"}))
            system_org_id = str(res.inserted_id)
        else:
            system_org_id = str(system_org["_id"])
            
        admin_user = await db.users.find_one({"email": admin_email})
        if not admin_user:
            super_admin = User(
                email=admin_email,
                hashed_password=hash_password(admin_pass),
                organization_id=system_org_id,
                role=RoleEnum.SUPER_ADMIN
            )
            await db.users.insert_one(super_admin.model_dump(by_alias=True, exclude={"id"}))
            print(f">>> [SEED] Central Super Admin provisioned: {admin_email} / {admin_pass}")
        else:
            if admin_user.get("role") != RoleEnum.SUPER_ADMIN:
                await db.users.update_one({"_id": admin_user["_id"]}, {"$set": {"role": RoleEnum.SUPER_ADMIN}})
            print(f">>> [BOOT] Central Super Admin verified: {admin_user.get('email')}")
    except Exception as e:
        print(f">>> [WARNING] Error checking/seeding super admin: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_super_admin()
    yield

app = FastAPI(title="Enterprise RAG SaaS", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class VerifyPasswordRequest(BaseModel):
    email: EmailStr
    old_password: str

class ChangePasswordRequest(BaseModel):
    email: EmailStr
    old_password: str
    new_password: str

ALLOW_PUBLIC_SIGNUP = os.getenv("ALLOW_PUBLIC_SIGNUP", "false").lower() in ("true", "1", "yes")

@app.post("/signup")
async def signup(user_data: UserCreate):
    if not ALLOW_PUBLIC_SIGNUP:
        raise HTTPException(
            status_code=403, 
            detail="Direct self-registration is disabled. Accounts are provisioned exclusively by Central Platform Administrators."
        )

    # 1. Domain Matching Logic
    clean_email = user_data.email.strip().lower()
    domain = clean_email.split("@")[-1]
    
    # Restrict direct signups on platform system domain
    if domain == "ragplatform.com":
        raise HTTPException(status_code=403, detail="Direct registration on platform system domain is restricted. Contact Central Admin.")
    
    # 2. Check if Organization exists for this domain
    org = await db.organizations.find_one({"domain": domain})
    
    if not org:
        # Auto-provision Org: First user from a domain becomes the Org Admin
        new_org = Organization(name=domain.split(".")[0].upper(), domain=domain)
        org_result = await db.organizations.insert_one(new_org.model_dump(by_alias=True, exclude={"id"}))
        org_id = str(org_result.inserted_id)
        role = RoleEnum.ORG_ADMIN 
    else:
        # Subsequent users from the domain become End Users
        org_id = str(org["_id"])
        role = RoleEnum.END_USER

    # 3. Prevent duplicate emails
    if await db.users.find_one({"email": clean_email}):
        raise HTTPException(status_code=400, detail="Email already registered")
        
    # 4. Hash Password & Save User
    db_user = User(
        email=clean_email,
        hashed_password=hash_password(user_data.password),
        organization_id=org_id,
        role=role
    )
    
    await db.users.insert_one(db_user.model_dump(by_alias=True, exclude={"id"}))
    return {"message": "User created successfully", "role": role, "organization_id": org_id}

@app.post("/auth/verify-password")
async def verify_user_old_password(req: VerifyPasswordRequest):
    """
    Step 1 of Change Password:
    Verifies that the user exists and their old/temporary password is correct.
    """
    clean_email = req.email.strip().lower()
    user = await db.users.find_one({"email": clean_email})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email address.")
    
    if not verify_password(req.old_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current / old password is incorrect. Please verify your credentials.")
    
    return {
        "status": "success",
        "message": "Current password verified successfully.",
        "email": clean_email,
        "role": user.get("role", RoleEnum.END_USER)
    }

@app.post("/auth/change-password")
async def change_user_password(req: ChangePasswordRequest):
    """
    Step 2 of Change Password:
    Verifies old password again for security, then updates database with the new hashed password.
    """
    clean_email = req.email.strip().lower()
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")
    
    user = await db.users.find_one({"email": clean_email})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email address.")
    
    if not verify_password(req.old_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current / old password verification failed.")
    
    hashed = hash_password(req.new_password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"hashed_password": hashed}}
    )

    # If this is the Central Super Admin, keep system credentials in sync for the quick-fill button
    admin_email = os.getenv("CENTRAL_ADMIN_EMAIL", "superadmin@ragplatform.com").strip().lower()
    if clean_email == admin_email:
        await db.system_config.update_one(
            {"key": "central_admin_creds"},
            {"$set": {"email": clean_email, "password": req.new_password}},
            upsert=True
        )
    
    return {
        "status": "success",
        "message": "Password successfully updated in the database. You can now sign in with your new credentials."
    }

@app.get("/auth/central-admin-credentials")
async def get_central_admin_credentials():
    """Returns the current active Central Super Admin credentials."""
    admin_email = os.getenv("CENTRAL_ADMIN_EMAIL", "superadmin@ragplatform.com").strip().lower()
    config = await db.system_config.find_one({"key": "central_admin_creds"})
    current_pass = config.get("password") if config else "123456"
    return {
        "email": admin_email,
        "password": current_pass
    }

@app.post("/auth/central-admin-quick-login")
async def central_admin_quick_login():
    """
    Directly authenticates the Central Super Admin, returning updated credentials and JWT access token.
    Enables one-click instant sign in with updated details.
    """
    admin_email = os.getenv("CENTRAL_ADMIN_EMAIL", "superadmin@ragplatform.com").strip().lower()
    admin_user = await db.users.find_one({"email": admin_email})
    if not admin_user:
        raise HTTPException(status_code=404, detail="Central Super Admin account not found.")

    org_domain = "ragplatform.com"
    org_name = "Central Platform Master"
    if admin_user.get("organization_id"):
        try:
            org = await db.organizations.find_one({"_id": ObjectId(admin_user["organization_id"])})
            if org:
                org_domain = org.get("domain", "ragplatform.com")
                org_name = org.get("name", "Central Platform Master")
        except Exception:
            pass

    access_token = create_access_token(data={
        "sub": str(admin_user["_id"]),
        "email": admin_user["email"],
        "role": admin_user["role"],
        "org_id": admin_user["organization_id"],
        "org_domain": org_domain,
        "org_name": org_name
    })

    config = await db.system_config.find_one({"key": "central_admin_creds"})
    current_pass = config.get("password") if config else "123456"

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": admin_user["role"],
        "email": admin_user["email"],
        "org_id": admin_user["organization_id"],
        "org_domain": org_domain,
        "org_name": org_name,
        "filled_password": current_pass
    }

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    clean_username = form_data.username.strip().lower()
    user = await db.users.find_one({"email": clean_username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    # Fetch organization domain for display
    org_domain = "ragplatform.com"
    org_name = "Central Platform"
    if user.get("organization_id"):
        try:
            org = await db.organizations.find_one({"_id": ObjectId(user["organization_id"])})
            if org:
                org_domain = org.get("domain", "")
                org_name = org.get("name", "")
        except Exception:
            pass

    # Embed RBAC and Tenant info directly into the JWT for fast validation later
    access_token = create_access_token(data={
        "sub": str(user["_id"]),
        "email": user["email"],
        "role": user["role"],
        "org_id": user["organization_id"],
        "org_domain": org_domain,
        "org_name": org_name
    })
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user["role"],
        "email": user["email"],
        "org_id": user["organization_id"],
        "org_domain": org_domain,
        "org_name": org_name
    }

# --- Profile Route ---

@app.get("/me")
async def get_my_profile(user_payload: dict = Depends(get_current_user_payload)):
    org = None
    if user_payload.get("org_id"):
        try:
            org = await db.organizations.find_one({"_id": ObjectId(user_payload["org_id"])})
        except Exception:
            pass
    return {
        "user_data": user_payload,
        "organization": {
            "name": org.get("name") if org else user_payload.get("org_name", "Central Platform"),
            "domain": org.get("domain") if org else user_payload.get("org_domain", "ragplatform.com")
        }
    }

# --- Include Routers ---
app.include_router(admin.router)
app.include_router(documents.router)
app.include_router(chat.router)