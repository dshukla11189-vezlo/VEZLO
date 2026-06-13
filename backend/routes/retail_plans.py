"""
Retail Plans Routes
===================
Extracted from server.py for modular organization.
Handles retail plan management, product assignments, and retailer subscriptions.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import List
import uuid

from dependencies import (
    db,
    get_current_user,
)
from models import (
    RetailPlanCreate,
    RetailPlanUpdate,
    PlanProductAdd,
    PlanProductUpdate,
    RetailerPlanAssignment,
    GenerateOrdersRequest,
)

router = APIRouter(tags=["retail_plans"])


# Initialize default plans on startup
async def initialize_default_plans():
    """Create default retail plans if they don't exist"""
    default_plans = [
        {"name": "Starter", "description": "Basic plan with essential products - ideal for small retailers", "is_default": True},
        {"name": "Medium", "description": "Standard plan with more variety - suitable for medium-sized stores", "is_default": True},
        {"name": "High", "description": "Premium plan with extensive selection - for high-volume retailers", "is_default": True},
        {"name": "Advanced", "description": "Complete plan with full product range - for large retail operations", "is_default": True},
    ]
    
    for plan in default_plans:
        existing = await db.retail_plans.find_one({"name": plan["name"], "is_default": True})
        if not existing:
            plan_doc = {
                "id": str(uuid.uuid4()),
                "name": plan["name"],
                "description": plan["description"],
                "is_default": True,
                "products": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.retail_plans.insert_one(plan_doc)


@router.get("/retail-plans")
async def get_retail_plans(current_user: dict = Depends(get_current_user)):
    """Get all retail plans"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    plans = await db.retail_plans.find({}, {"_id": 0}).to_list(100)
    
    # Sort: default plans first (Starter, Medium, High, Advanced), then custom plans
    default_order = {"Starter": 1, "Medium": 2, "High": 3, "Advanced": 4}
    plans.sort(key=lambda p: (0 if p.get("is_default") else 1, default_order.get(p.get("name"), 99), p.get("name", "")))
    
    return plans


@router.post("/retail-plans")
async def create_retail_plan(plan: RetailPlanCreate, current_user: dict = Depends(get_current_user)):
    """Create a new custom retail plan"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create plans")
    
    # Check if plan name already exists
    existing = await db.retail_plans.find_one({"name": plan.name})
    if existing:
        raise HTTPException(status_code=400, detail="Plan with this name already exists")
    
    plan_doc = {
        "id": str(uuid.uuid4()),
        "name": plan.name,
        "description": plan.description,
        "is_default": False,
        "products": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.retail_plans.insert_one(plan_doc)
    
    return {k: v for k, v in plan_doc.items() if k != "_id"}


@router.put("/retail-plans/{plan_id}")
async def update_retail_plan(plan_id: str, plan: RetailPlanUpdate, current_user: dict = Depends(get_current_user)):
    """Update a retail plan"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update plans")
    
    existing = await db.retail_plans.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    update_data = {k: v for k, v in plan.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.retail_plans.update_one({"id": plan_id}, {"$set": update_data})
    
    updated = await db.retail_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.delete("/retail-plans/{plan_id}")
async def delete_retail_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a custom retail plan (default plans cannot be deleted)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete plans")
    
    existing = await db.retail_plans.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    if existing.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default plans")
    
    # Check if any retailer is subscribed to this plan
    subscribed = await db.users.find_one({"subscribed_plan_id": plan_id})
    if subscribed:
        raise HTTPException(status_code=400, detail="Cannot delete plan with subscribed retailers")
    
    await db.retail_plans.delete_one({"id": plan_id})
    return {"message": "Plan deleted successfully"}


@router.post("/retail-plans/{plan_id}/products")
async def add_product_to_plan(plan_id: str, product: PlanProductAdd, current_user: dict = Depends(get_current_user)):
    """Add a product to a retail plan"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify plans")
    
    existing = await db.retail_plans.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Check if product+variant already exists in plan
    products = existing.get("products", [])
    for p in products:
        if p.get("product_id") == product.product_id and p.get("variant_id") == product.variant_id:
            raise HTTPException(status_code=400, detail="This product+variant is already in the plan")
    
    product_doc = product.model_dump()
    await db.retail_plans.update_one(
        {"id": plan_id},
        {
            "$push": {"products": product_doc},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    updated = await db.retail_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.put("/retail-plans/{plan_id}/products/{product_id}/{variant_id}")
async def update_product_in_plan(plan_id: str, product_id: str, variant_id: str, update: PlanProductUpdate, current_user: dict = Depends(get_current_user)):
    """Update product quantity in a plan"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify plans")
    
    result = await db.retail_plans.update_one(
        {"id": plan_id, "products.product_id": product_id, "products.variant_id": variant_id},
        {
            "$set": {
                "products.$.quantity": update.quantity,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Product not found in plan")
    
    updated = await db.retail_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.delete("/retail-plans/{plan_id}/products/{product_id}/{variant_id}")
async def remove_product_from_plan(plan_id: str, product_id: str, variant_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a product from a plan"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify plans")
    
    result = await db.retail_plans.update_one(
        {"id": plan_id},
        {
            "$pull": {"products": {"product_id": product_id, "variant_id": variant_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Product not found in plan")
    
    updated = await db.retail_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.post("/retail-plans/assign")
async def assign_plan_to_retailer(assignment: RetailerPlanAssignment, current_user: dict = Depends(get_current_user)):
    """Assign a retail plan to a retailer"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can assign plans")
    
    # Verify retailer exists
    retailer = await db.users.find_one({"id": assignment.retailer_id, "role": "retailer"})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # Verify plan exists
    plan = await db.retail_plans.find_one({"id": assignment.plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Update retailer with plan subscription
    await db.users.update_one(
        {"id": assignment.retailer_id},
        {"$set": {"subscribed_plan_id": assignment.plan_id}}
    )
    
    return {"message": f"Plan '{plan['name']}' assigned to retailer successfully"}


@router.delete("/retail-plans/unassign/{retailer_id}")
async def unassign_plan_from_retailer(retailer_id: str, current_user: dict = Depends(get_current_user)):
    """Remove plan subscription from a retailer"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can unassign plans")
    
    result = await db.users.update_one(
        {"id": retailer_id, "role": "retailer"},
        {"$unset": {"subscribed_plan_id": ""}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Retailer not found or no plan assigned")
    
    return {"message": "Plan unassigned from retailer successfully"}


@router.get("/retail-plans/subscribed-retailers")
async def get_subscribed_retailers(current_user: dict = Depends(get_current_user)):
    """Get all retailers with their subscribed plans"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    retailers = await db.users.find(
        {"role": "retailer"},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "subscribed_plan_id": 1}
    ).to_list(500)
    
    # Get plan names
    plans = await db.retail_plans.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    plan_map = {p["id"]: p["name"] for p in plans}
    
    for r in retailers:
        plan_id = r.get("subscribed_plan_id")
        r["plan_name"] = plan_map.get(plan_id) if plan_id else None
    
    return retailers


@router.post("/retail-plans/generate-orders")
async def generate_orders_from_plans(request: GenerateOrdersRequest, current_user: dict = Depends(get_current_user)):
    """Generate indent orders for subscribed retailers based on their plans"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get retailers with subscribed plans
    query = {"role": "retailer", "subscribed_plan_id": {"$exists": True, "$ne": None}}
    if request.retailer_ids:
        query["id"] = {"$in": request.retailer_ids}
    
    retailers = await db.users.find(query, {"_id": 0}).to_list(500)
    
    if not retailers:
        return {"message": "No subscribed retailers found", "orders_created": 0}
    
    # Get all plans
    plans = await db.retail_plans.find({}, {"_id": 0}).to_list(100)
    plan_map = {p["id"]: p for p in plans}
    
    orders_created = 0
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    for retailer in retailers:
        plan = plan_map.get(retailer.get("subscribed_plan_id"))
        if not plan or not plan.get("products"):
            continue
        
        # Check if indent already exists for today
        existing = await db.retailer_indents.find_one({
            "retailer_id": retailer["id"],
            "indent_date": {"$regex": f"^{today}"}
        })
        if existing:
            continue  # Skip if already has indent for today
        
        # Create indent from plan
        indent_items = []
        for product in plan["products"]:
            indent_items.append({
                "product_id": product["product_id"],
                "product_name": product["product_name"],
                "variant_id": product["variant_id"],
                "variant_name": product["variant_name"],
                "quantity": product["quantity"]
            })
        
        indent_doc = {
            "id": str(uuid.uuid4()),
            "retailer_id": retailer["id"],
            "retailer_name": retailer.get("company_name") or retailer.get("name"),
            "indent_date": datetime.now(timezone.utc).isoformat(),
            "items": indent_items,
            "status": "pending",
            "source": "auto_plan",  # Mark as auto-generated from plan
            "plan_id": plan["id"],
            "plan_name": plan["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("name", "System")
        }
        
        await db.retailer_indents.insert_one(indent_doc)
        orders_created += 1
    
    return {
        "message": f"Generated {orders_created} orders from plans",
        "orders_created": orders_created,
        "date": today
    }
