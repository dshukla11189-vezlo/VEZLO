"""
User Management Routes
======================
Extracted from server.py for modular organization.
Handles user CRUD operations - Admin only (except employees endpoint).
"""
from fastapi import APIRouter, HTTPException, Depends
import re
import random
import string

from dependencies import (
    db,
    get_current_user,
    hash_password,
)
from models import (
    User,
    RegisterRequest,
    UserUpdate,
)

router = APIRouter(tags=["users"])


@router.get("/employees")
async def get_employees(current_user: dict = Depends(get_current_user)):
    """Get list of employees (staff and admin users) for dropdowns - accessible by all authenticated users"""
    users = await db.users.find(
        {"role": {"$in": ["staff", "admin"]}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(1000)
    return users


@router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage users")
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users


@router.post("/users")
async def create_user(input: RegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    
    # Case-insensitive email check (escape special characters)
    escaped_email = re.escape(input.email)
    existing = await db.users.find_one(
        {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}}, 
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = input.model_dump()
    user_dict["password"] = hash_password(user_dict.pop("password"))
    
    # Normalize contact number - remove spaces, dashes, and +91/91 prefix
    if user_dict.get("contact"):
        contact = user_dict["contact"].replace(" ", "").replace("-", "").replace("+91", "")
        if contact.startswith("91") and len(contact) > 10:
            contact = contact[2:]
        user_dict["contact"] = contact
    
    # Store email in lowercase for consistent searching
    if user_dict.get("email"):
        user_dict["email"] = user_dict["email"].lower()
    
    # Generate 5-digit referral code for retailers
    if user_dict.get("role") == "retailer":
        referral_code = ''.join(random.choices(string.digits, k=5))
        # Ensure uniqueness
        while await db.users.find_one({"referral_code": referral_code}):
            referral_code = ''.join(random.choices(string.digits, k=5))
        user_dict["referral_code"] = referral_code
    
    user = User(**user_dict)
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    return {"id": user.id, "message": "User created successfully"}


@router.put("/users/{user_id}")
async def update_user(user_id: str, input: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update users")
    
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update data
    update_data = {}
    if input.name:
        update_data["name"] = input.name
    if input.email:
        # Check if email is already taken by another user (case-insensitive)
        escaped_email = re.escape(input.email)
        email_check = await db.users.find_one({
            "email": {"$regex": f"^{escaped_email}$", "$options": "i"}, 
            "id": {"$ne": user_id}
        })
        if email_check:
            raise HTTPException(status_code=400, detail="Email already in use")
        # Store email in lowercase
        update_data["email"] = input.email.lower()
    if input.password:
        update_data["password"] = hash_password(input.password)
    if input.role:
        update_data["role"] = input.role
    if input.company_name is not None:
        update_data["company_name"] = input.company_name
    if input.contact is not None:
        # Normalize contact number
        contact = input.contact.replace(" ", "").replace("-", "").replace("+91", "")
        if contact.startswith("91") and len(contact) > 10:
            contact = contact[2:]
        update_data["contact"] = contact
    if input.address is not None:
        update_data["address"] = input.address
    if input.commission_percentage is not None:
        update_data["commission_percentage"] = input.commission_percentage
    if input.upfront_collection_percentage is not None:
        update_data["upfront_collection_percentage"] = input.upfront_collection_percentage
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    return {"id": user_id, "message": "User updated successfully"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    
    # Prevent deleting self
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}


@router.post("/users/normalize-contacts")
async def normalize_user_contacts(current_user: dict = Depends(get_current_user)):
    """Admin-only endpoint to normalize all users' contact numbers and emails"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run this")
    
    users = await db.users.find({}, {"_id": 0, "id": 1, "contact": 1, "email": 1}).to_list(10000)
    updated_count = 0
    
    for user in users:
        update_data = {}
        
        # Normalize contact number
        if user.get("contact"):
            contact = user["contact"].replace(" ", "").replace("-", "").replace("+91", "")
            if contact.startswith("91") and len(contact) > 10:
                contact = contact[2:]
            if contact != user["contact"]:
                update_data["contact"] = contact
        
        # Normalize email to lowercase
        if user.get("email") and user["email"] != user["email"].lower():
            update_data["email"] = user["email"].lower()
        
        if update_data:
            await db.users.update_one({"id": user["id"]}, {"$set": update_data})
            updated_count += 1
    
    return {"message": f"Normalized {updated_count} user records"}
