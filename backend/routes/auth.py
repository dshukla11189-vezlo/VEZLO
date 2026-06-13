"""
Authentication Routes
====================
Handles user registration, login, and session management.
Extracted from server.py - preserves exact functionality.
"""
from fastapi import APIRouter, HTTPException, Depends
import re

from dependencies import (
    db, 
    get_current_user, 
    hash_password, 
    verify_password, 
    create_token,
    logger
)
from models import (
    User,
    RegisterRequest,
    LoginRequest,
    UserResponse,
    AuthResponse
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthResponse)
async def register(input: RegisterRequest):
    existing = await db.users.find_one({"email": input.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = input.model_dump()
    user_dict["password"] = hash_password(user_dict.pop("password"))
    user = User(**user_dict)
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    token = create_token(user.id, user.email, user.role)
    return AuthResponse(token=token, user=UserResponse(**user.model_dump()))


@router.post("/login", response_model=AuthResponse)
async def login(input: LoginRequest):
    # Check if identifier is email or mobile number
    identifier = input.identifier.strip()
    
    # Search by email first (case-insensitive)
    # Escape special regex characters in email
    escaped_email = re.escape(identifier)
    user = await db.users.find_one(
        {"email": {"$regex": f"^{escaped_email}$", "$options": "i"}}, 
        {"_id": 0}
    )
    
    if not user:
        # Try searching by mobile/contact number
        # Normalize the input: remove spaces, dashes, and handle +91 prefix
        normalized_contact = identifier.replace(" ", "").replace("-", "").replace("+91", "")
        # If number starts with 91 and is longer than 10 digits, strip 91
        if normalized_contact.startswith("91") and len(normalized_contact) > 10:
            normalized_contact = normalized_contact[2:]
        
        # Search with exact match first
        user = await db.users.find_one({"contact": identifier}, {"_id": 0})
        
        # If not found, try normalized version
        if not user and normalized_contact != identifier:
            user = await db.users.find_one({"contact": normalized_contact}, {"_id": 0})
        
        # Also try searching with stored contact that may have different format
        # by normalizing both sides before comparison
        if not user:
            # Use aggregation pipeline to normalize stored contacts and compare
            pipeline = [
                {
                    "$addFields": {
                        "normalized_contact": {
                            "$replaceAll": {
                                "input": {
                                    "$replaceAll": {
                                        "input": {
                                            "$replaceAll": {
                                                "input": {"$ifNull": ["$contact", ""]},
                                                "find": " ",
                                                "replacement": ""
                                            }
                                        },
                                        "find": "-",
                                        "replacement": ""
                                    }
                                },
                                "find": "+91",
                                "replacement": ""
                            }
                        }
                    }
                },
                {
                    "$match": {
                        "$expr": {
                            "$or": [
                                {"$eq": ["$normalized_contact", normalized_contact]},
                                {"$regexMatch": {"input": "$normalized_contact", "regex": f"{normalized_contact}$"}}
                            ]
                        }
                    }
                },
                {"$project": {"_id": 0}}
            ]
            
            try:
                result = await db.users.aggregate(pipeline).to_list(1)
                if result:
                    user = result[0]
            except Exception as e:
                logger.error(f"Phone aggregation error: {e}")
                # Fallback to regex if aggregation fails
                escaped_contact = re.escape(normalized_contact)
                user = await db.users.find_one(
                    {"contact": {"$regex": f"{escaped_contact}$"}}, 
                    {"_id": 0}
                )
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("password"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    if not verify_password(input.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"], user["role"])
    user.pop("password")
    return AuthResponse(token=token, user=UserResponse(**user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)
