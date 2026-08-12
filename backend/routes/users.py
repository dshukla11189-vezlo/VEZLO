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
        "churned_retailers": churned_retailers,
        "pending_to_go_live": active_retailers - live_retailers
    }


@router.get("/retailers-pending-to-go-live")
async def get_retailers_pending_to_go_live(current_user: dict = Depends(get_current_user)):
    """
    Get list of active retailers who don't have any invoice yet.
    These are retailers who are onboarded but haven't made their first order.
    """
    if current_user["role"] not in ["admin", "staff", "field_team"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all active retailers
    retailers = await db.users.find(
        {"role": "retailer", "status": {"$ne": "churned"}},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "email": 1, "contact": 1, "city": 1, "area": 1, "zone": 1, "assigned_to": 1, "created_at": 1}
    ).to_list(10000)
    
    retailer_ids = [r["id"] for r in retailers]
    
    # Get retailers with at least 1 invoice
    retailers_with_invoices = await db.retailer_invoices.distinct(
        "retailer_id",
        {"retailer_id": {"$in": retailer_ids}}
    )
    retailers_with_invoices_set = set(retailers_with_invoices)
    
    # For admin/staff, resolve assigned_to to field team member names
    field_team_map = {}
    if current_user["role"] in ["admin", "staff"]:
        field_team_members = await db.users.find(
            {"role": "field_team"},
            {"_id": 0, "id": 1, "email": 1, "name": 1}
        ).to_list(1000)
        for ft in field_team_members:
            field_team_map[ft["id"]] = ft.get("name") or ft.get("email", "")
            field_team_map[ft.get("email", "")] = ft.get("name") or ft.get("email", "")
    
    # Filter to get only those WITHOUT invoices
    pending_retailers = []
    for r in retailers:
        if r["id"] not in retailers_with_invoices_set:
            assigned_to_raw = r.get("assigned_to", "")
            # Resolve assigned_to to actual name for admin/staff
            if current_user["role"] in ["admin", "staff"]:
                if isinstance(assigned_to_raw, list):
                    assigned_names = [field_team_map.get(a, a) for a in assigned_to_raw if a]
                    assigned_to_display = ", ".join(assigned_names) if assigned_names else ""
                else:
                    assigned_to_display = field_team_map.get(assigned_to_raw, assigned_to_raw) if assigned_to_raw else ""
            else:
                assigned_to_display = assigned_to_raw
            
            pending_retailers.append({
                "id": r["id"],
                "name": r.get("name", ""),
                "company_name": r.get("company_name", ""),
                "email": r.get("email", ""),
                "contact": r.get("contact", ""),
                "city": r.get("city", ""),
                "area": r.get("area", "") or "",
                "zone": r.get("zone", "") or "",
                "assigned_to": assigned_to_display,
                "created_at": r.get("created_at", "")
            })
    
    # Sort by created_at descending (newest first)
    pending_retailers.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "count": len(pending_retailers),
        "retailers": pending_retailers
    }


@router.get("/retailers-zero-orders-yesterday")
async def get_retailers_zero_orders_yesterday(current_user: dict = Depends(get_current_user)):
    """
    Get list of active retailers who did not place any order (indent) yesterday.
    Returns different data based on user role:
    - Admin/Staff: All retailers with area, zone, and assigned_to (field team name)
    - Field Team: Only their assigned retailers with area
    """
    if current_user["role"] not in ["admin", "staff", "field_team"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Calculate yesterday's date
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    yesterday_str = yesterday.strftime('%Y-%m-%d')
    
    # Build retailer query based on role
    retailer_query = {"role": "retailer", "status": {"$ne": "churned"}}
    
    if current_user["role"] == "field_team":
        # Field team only sees their assigned retailers
        retailer_query["assigned_to"] = {"$in": [current_user["user_id"], current_user.get("email", "")]}
    
    # Get all active retailers (or assigned retailers for field team)
    retailers = await db.users.find(
        retailer_query,
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "area": 1, "zone": 1, "assigned_to": 1}
    ).to_list(10000)
    
    retailer_ids = [r["id"] for r in retailers]
    
    # Get retailers who placed indents yesterday
    retailers_with_orders_yesterday = await db.retailer_indents.distinct(
        "retailer_id",
        {
            "retailer_id": {"$in": retailer_ids},
            "indent_date": {"$regex": f"^{yesterday_str}"}
        }
    )
    retailers_with_orders_set = set(retailers_with_orders_yesterday)
    
    # For admin/staff, we need to resolve assigned_to (user_id) to actual field team member name
    field_team_map = {}
    if current_user["role"] in ["admin", "staff"]:
        # Get all field team members
        field_team_members = await db.users.find(
            {"role": "field_team"},
            {"_id": 0, "id": 1, "email": 1, "name": 1}
        ).to_list(1000)
        for ft in field_team_members:
            field_team_map[ft["id"]] = ft.get("name") or ft.get("email", "")
            field_team_map[ft.get("email", "")] = ft.get("name") or ft.get("email", "")
    
    # Filter to get only those WITHOUT orders yesterday
    zero_order_retailers = []
    for r in retailers:
        if r["id"] not in retailers_with_orders_set:
            entry = {
                "id": r["id"],
                "name": r.get("company_name") or r.get("name", ""),
                "area": r.get("area", "") or "",
            }
            
            # For admin/staff, include zone and assigned_to (resolved name)
            if current_user["role"] in ["admin", "staff"]:
                entry["zone"] = r.get("zone", "") or ""
                assigned_to_raw = r.get("assigned_to", "")
                # Handle array assigned_to
                if isinstance(assigned_to_raw, list):
                    assigned_names = [field_team_map.get(a, a) for a in assigned_to_raw if a]
                    entry["assigned_to"] = ", ".join(assigned_names) if assigned_names else ""
                else:
                    entry["assigned_to"] = field_team_map.get(assigned_to_raw, assigned_to_raw) if assigned_to_raw else ""
            
            zero_order_retailers.append(entry)
    
    # Sort by zone priority: Pune East, Pune West, Pune South, Pune North, then others alphabetically
    zone_priority = {"Pune East": 0, "Pune West": 1, "Pune South": 2, "Pune North": 3}
    
    def get_sort_key(retailer):
        zone = retailer.get("zone", "") or ""
        zone_order = zone_priority.get(zone, 99)  # Unknown zones get 99
        name = retailer.get("name", "").lower()
        return (zone_order, zone.lower() if zone_order == 99 else "", name)
    
    zero_order_retailers.sort(key=get_sort_key)
    
    return {
        "count": len(zero_order_retailers),
        "date": yesterday_str,
        "retailers": zero_order_retailers
    }



@router.get("/retailers-pending-payments")
async def get_retailers_pending_payments(current_user: dict = Depends(get_current_user)):
    """
    Get list of retailers with more than 2 invoices in partial or pending status.
    Returns the count of pending invoices and total amount (excluding latest 2 invoices).
    """
    if current_user["role"] not in ["admin", "staff", "field_team"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Build retailer query based on role
    retailer_query = {"role": "retailer", "status": {"$ne": "churned"}}
    
    if current_user["role"] == "field_team":
        # Field team only sees their assigned retailers
        retailer_query["assigned_to"] = {"$in": [current_user["user_id"], current_user.get("email", "")]}
    
    # Get all retailers
    retailers = await db.users.find(
        retailer_query,
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "area": 1, "zone": 1, "assigned_to": 1}
    ).to_list(10000)
    
    retailer_ids = [r["id"] for r in retailers]
    retailer_map = {r["id"]: r for r in retailers}
    
    # Get all invoices for these retailers that have pending payments
    # An invoice has pending payment if: 
    # - payment_status is 'pending' or 'partial', OR
    # - payment_status is null/None AND paid_amount is 0/null (meaning not fully paid)
    pending_invoices = await db.retailer_invoices.find(
        {
            "retailer_id": {"$in": retailer_ids},
            "$or": [
                {"payment_status": {"$in": ["pending", "partial"]}},
                {
                    "payment_status": {"$in": [None, ""]},
                    "$or": [
                        {"paid_amount": {"$in": [None, 0]}},
                        {"paid_amount": {"$exists": False}}
                    ]
                }
            ]
        },
        {"_id": 0, "retailer_id": 1, "invoice_number": 1, "invoice_date": 1, "net_receivable": 1, "amount_payable": 1, "paid_amount": 1, "net_payable": 1, "final_payable": 1}
    ).sort("invoice_date", -1).to_list(50000)
    
    # Group invoices by retailer
    retailer_invoices = {}
    for inv in pending_invoices:
        rid = inv["retailer_id"]
        if rid not in retailer_invoices:
            retailer_invoices[rid] = []
        retailer_invoices[rid].append(inv)
    
    # For admin/staff, resolve assigned_to to field team member names
    field_team_map = {}
    if current_user["role"] in ["admin", "staff"]:
        field_team_members = await db.users.find(
            {"role": "field_team"},
            {"_id": 0, "id": 1, "email": 1, "name": 1}
        ).to_list(1000)
        for ft in field_team_members:
            field_team_map[ft["id"]] = ft.get("name") or ft.get("email", "")
            field_team_map[ft.get("email", "")] = ft.get("name") or ft.get("email", "")
    
    # Filter retailers with more than 2 pending invoices
    pending_payment_retailers = []
    for rid, invoices in retailer_invoices.items():
        if len(invoices) > 2:
            retailer = retailer_map.get(rid, {})
            
            # Calculate amount excluding latest 2 invoices
            # Invoices are already sorted by date descending, so skip first 2
            older_invoices = invoices[2:]
            total_pending_amount = sum(
                (inv.get("net_receivable") or inv.get("final_payable") or inv.get("net_payable") or inv.get("amount_payable") or 0) - (inv.get("paid_amount") or 0)
                for inv in older_invoices
            )
            
            # Resolve assigned_to for admin/staff
            assigned_to_raw = retailer.get("assigned_to", "")
            if current_user["role"] in ["admin", "staff"]:
                if isinstance(assigned_to_raw, list):
                    assigned_names = [field_team_map.get(a, a) for a in assigned_to_raw if a]
                    assigned_to_display = ", ".join(assigned_names) if assigned_names else ""
                    # Store first assigned_to for grouping
                    assigned_to_key = assigned_to_raw[0] if assigned_to_raw else ""
                else:
                    assigned_to_display = field_team_map.get(assigned_to_raw, assigned_to_raw) if assigned_to_raw else ""
                    assigned_to_key = assigned_to_raw or ""
            else:
                assigned_to_display = ""
                assigned_to_key = ""
            
            entry = {
                "id": rid,
                "name": retailer.get("company_name") or retailer.get("name", ""),
                "area": retailer.get("area", "") or "",
                "zone": retailer.get("zone", "") or "",
                "assigned_to": assigned_to_display,
                "assigned_to_key": assigned_to_key,  # For grouping
                "pending_invoices_count": len(invoices),
                "amount": round(total_pending_amount, 2)
            }
            pending_payment_retailers.append(entry)
    
    # Group retailers by field team member and calculate group totals
    from collections import defaultdict
    field_team_groups = defaultdict(lambda: {"retailers": [], "total": 0})
    
    for retailer in pending_payment_retailers:
        key = retailer.get("assigned_to", "") or "Unassigned"
        field_team_groups[key]["retailers"].append(retailer)
        field_team_groups[key]["total"] += retailer.get("amount", 0)
    
    # Sort groups by total amount descending
    sorted_groups = sorted(field_team_groups.items(), key=lambda x: x[1]["total"], reverse=True)
    
    # Build final sorted list with group info
    final_retailers = []
    groups_info = []
    
    for field_team_name, group_data in sorted_groups:
        # Sort retailers within group by amount descending
        group_data["retailers"].sort(key=lambda x: x.get("amount", 0), reverse=True)
        
        group_start_index = len(final_retailers)
        for retailer in group_data["retailers"]:
            # Remove internal key before sending to frontend
            retailer_copy = {k: v for k, v in retailer.items() if k != "assigned_to_key"}
            final_retailers.append(retailer_copy)
        
        groups_info.append({
            "field_team_name": field_team_name,
            "start_index": group_start_index,
            "count": len(group_data["retailers"]),
            "total": round(group_data["total"], 2)
        })
    
    return {
        "count": len(final_retailers),
        "retailers": final_retailers,
        "groups": groups_info
    }

