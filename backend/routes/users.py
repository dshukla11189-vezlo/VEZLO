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
import uuid
import logging
from datetime import datetime, timezone, timedelta

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

logger = logging.getLogger(__name__)

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
        
        # Initialize status and commission_history for retailers
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        user_dict['status'] = input.status if hasattr(input, 'status') and input.status else 'active'
        user_dict['commission_history'] = [{
            'rate': user_dict.get('commission_percentage', 0.0),
            'effective_from': today,
            'effective_to': None
        }]
    
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
        
        # Z2: When renaming a retailer, propagate the name change to all historical records
        # This prevents creating a "fork" where old records have old name and new records have new name
        if existing.get('role') == 'retailer':
            old_company_name = existing.get('company_name') or existing.get('name', '')
            new_company_name = input.company_name
            
            if old_company_name and new_company_name and old_company_name != new_company_name:
                logger.info(f"Retailer rename: {old_company_name} -> {new_company_name}. Propagating to historical records...")
                
                # Collections that store retailer_name
                collections_to_update = [
                    "retailer_dispatches",
                    "retailer_invoices",
                    "retailer_rejections",
                    "retailer_indents",
                    "retailer_payments",
                    "retailer_credit_notes",
                    "retailer_daily_requirements",
                    "retailer_daily_sales",
                    "retailer_grn"
                ]
                
                total_updated = 0
                for coll_name in collections_to_update:
                    coll = db[coll_name]
                    result = await coll.update_many(
                        {"retailer_id": user_id},
                        {"$set": {"retailer_name": new_company_name}}
                    )
                    if result.modified_count > 0:
                        total_updated += result.modified_count
                        logger.info(f"  Updated {result.modified_count} records in {coll_name}")
                
                if total_updated > 0:
                    logger.info(f"Total {total_updated} records updated with new retailer name")
    if input.contact is not None:
        # Normalize contact number
        contact = input.contact.replace(" ", "").replace("-", "").replace("+91", "")
        if contact.startswith("91") and len(contact) > 10:
            contact = contact[2:]
        update_data["contact"] = contact
    if input.address is not None:
        update_data["address"] = input.address
    if input.city is not None:
        update_data["city"] = input.city
    # Retailer-specific location fields
    if input.area is not None:
        update_data["area"] = input.area
    if input.state is not None:
        update_data["state"] = input.state
    if input.zone is not None:
        update_data["zone"] = input.zone
    if input.latitude is not None:
        update_data["latitude"] = input.latitude
    if input.longitude is not None:
        update_data["longitude"] = input.longitude
    # Retailer business fields
    if input.category is not None:
        update_data["category"] = input.category
    if input.shop_type is not None:
        update_data["shop_type"] = input.shop_type
    if input.shop_type_remark is not None:
        update_data["shop_type_remark"] = input.shop_type_remark
    if input.assigned_to is not None:
        update_data["assigned_to"] = input.assigned_to
    if input.commission_percentage is not None:
        update_data["commission_percentage"] = input.commission_percentage
        
        # Track commission history for retailers
        if existing.get('role') == 'retailer':
            old_commission = existing.get('commission_percentage', 0) or 0
            if old_commission != input.commission_percentage:
                today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
                hist = existing.get('commission_history') or []
                # Close the current open row
                if hist and hist[-1].get('effective_to') is None:
                    yesterday = (datetime.strptime(today, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
                    hist[-1]['effective_to'] = yesterday
                # Append new open row with the new rate
                hist.append({
                    'rate': input.commission_percentage,
                    'effective_from': today,
                    'effective_to': None
                })
                update_data['commission_history'] = hist
                logger.info(f"Commission change: {existing.get('company_name', existing.get('name'))} changed from {old_commission}% to {input.commission_percentage}%")
    
    # Handle status changes for retailers (active/churned)
    if input.status is not None:
        if input.status == 'churned' and existing.get('status') != 'churned':
            update_data['status'] = 'churned'
            update_data['churned_at'] = datetime.now(timezone.utc).isoformat()
            logger.info(f"Retailer {existing.get('company_name', existing.get('name'))} marked as churned")
        elif input.status == 'active' and existing.get('status') == 'churned':
            update_data['status'] = 'active'
            update_data['churned_at'] = None
            logger.info(f"Retailer {existing.get('company_name', existing.get('name'))} reactivated")
    
    # Track upfront percentage changes for retailers
    upfront_change_log = None
    if input.upfront_collection_percentage is not None:
        old_upfront = existing.get("upfront_collection_percentage", 0) or 0
        new_upfront = input.upfront_collection_percentage
        
        # If upfront percentage is changing, record the event
        if old_upfront != new_upfront:
            upfront_change_log = {
                "id": str(uuid.uuid4()),
                "retailer_id": user_id,
                "retailer_name": existing.get("company_name") or existing.get("name"),
                "old_upfront_percentage": old_upfront,
                "new_upfront_percentage": new_upfront,
                "changed_by": current_user["user_id"],
                "changed_by_name": current_user.get("name", "Admin"),
                "changed_at": datetime.now(timezone.utc).isoformat(),
                "reason": f"Admin changed upfront from {old_upfront}% to {new_upfront}%"
            }
            
            # Store the change log in a separate collection
            await db.retailer_upfront_changes.insert_one(upfront_change_log)
            
            # Log the change
            logger.info(f"Upfront percentage change: {existing.get('company_name', existing.get('name'))} changed from {old_upfront}% to {new_upfront}% by {current_user.get('name')}")
        
        update_data["upfront_collection_percentage"] = new_upfront
    
    # Handle model_changed_at (date when retailer switched to 100% upfront model)
    if input.model_changed_at is not None:
        update_data["model_changed_at"] = input.model_changed_at
        logger.info(f"Model changed at set to {input.model_changed_at} for {existing.get('company_name', existing.get('name'))}")
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    response = {"id": user_id, "message": "User updated successfully"}
    
    # Include info about upfront change if it occurred
    if upfront_change_log:
        response["upfront_change"] = {
            "old_percentage": upfront_change_log["old_upfront_percentage"],
            "new_percentage": upfront_change_log["new_upfront_percentage"],
            "message": f"Upfront collection changed from {upfront_change_log['old_upfront_percentage']}% to {upfront_change_log['new_upfront_percentage']}%. All future transactions will use the new model."
        }
    
    return response


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



@router.get("/users/{user_id}/upfront-history")
async def get_upfront_change_history(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get the history of upfront percentage changes for a retailer"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can view upfront history")
    
    # Get change history
    history = await db.retailer_upfront_changes.find(
        {"retailer_id": user_id},
        {"_id": 0}
    ).sort("changed_at", -1).to_list(100)
    
    # Get current user info
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "company_name": 1, "name": 1, "upfront_collection_percentage": 1})
    
    return {
        "retailer_id": user_id,
        "retailer_name": user.get("company_name") or user.get("name") if user else "Unknown",
        "current_upfront_percentage": user.get("upfront_collection_percentage", 0) if user else 0,
        "change_history": history
    }



@router.post("/users/migrate-retailer-status-and-commission-history")
async def migrate_retailer_status_and_commission_history(current_user: dict = Depends(get_current_user)):
    """
    One-shot migration endpoint to add status and commission_history to existing retailers.
    Run ONCE after deploying the schema changes.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run this migration")
    
    retailers = await db.users.find({"role": "retailer"}, {"_id": 0}).to_list(10000)
    
    status_added = 0
    commission_history_added = 0
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    for retailer in retailers:
        update_data = {}
        
        # If status is missing, set to 'active'
        if not retailer.get('status'):
            update_data['status'] = 'active'
            status_added += 1
        
        # If commission_history is missing, initialize it
        if not retailer.get('commission_history'):
            created_date = retailer.get('created_at', '')[:10] if retailer.get('created_at') else today
            update_data['commission_history'] = [{
                'rate': retailer.get('commission_percentage', 0) or 0,
                'effective_from': created_date,
                'effective_to': None
            }]
            commission_history_added += 1
        
        if update_data:
            await db.users.update_one({"id": retailer["id"]}, {"$set": update_data})
            logger.info(f"Migrated retailer {retailer.get('company_name', retailer.get('name'))}: {list(update_data.keys())}")
    
    return {
        "message": "Migration completed",
        "total_retailers": len(retailers),
        "status_added": status_added,
        "commission_history_added": commission_history_added
    }



@router.get("/assignable-users")
async def get_assignable_users(current_user: dict = Depends(get_current_user)):
    """
    Get list of Staff and Field Team users for "Assigned To" dropdown.
    Returns users with id, name, role for selection.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    users = await db.users.find(
        {"role": {"$in": ["staff", "field_team"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "city": 1}
    ).to_list(1000)
    
    return users



@router.get("/retailer-stats")
async def get_retailer_stats(current_user: dict = Depends(get_current_user)):
    """
    Get retailer summary statistics for admin dashboard.
    Returns:
    - total_onboarded: Total count of all retailers
    - active_retailers: Retailers with status="active"
    - live_retailers: Active retailers with at least 1 invoice
    - churned_retailers: Retailers with status="churned"
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all retailers
    retailers = await db.users.find(
        {"role": "retailer"},
        {"_id": 0, "id": 1, "status": 1}
    ).to_list(10000)
    
    total_onboarded = len(retailers)
    retailer_ids = [r["id"] for r in retailers]
    
    # Count active and churned
    active_retailers = sum(1 for r in retailers if r.get("status", "active") == "active")
    churned_retailers = sum(1 for r in retailers if r.get("status") == "churned")
    
    # Get retailers with at least 1 invoice (for live count)
    retailers_with_invoices = await db.retailer_invoices.distinct(
        "retailer_id",
        {"retailer_id": {"$in": retailer_ids}}
    )
    retailers_with_invoices_set = set(retailers_with_invoices)
    
    # Live = active + has invoice
    live_retailers = sum(
        1 for r in retailers
        if r.get("status", "active") == "active" and r["id"] in retailers_with_invoices_set
    )
    
    return {
        "total_onboarded": total_onboarded,
        "active_retailers": active_retailers,
        "live_retailers": live_retailers,
        "churned_retailers": churned_retailers
    }
