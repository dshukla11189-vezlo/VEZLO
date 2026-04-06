"""
Retailer Indents and Dispatches Routes
"""
from fastapi import APIRouter, HTTPException, Depends
from dependencies import db, get_current_user
from models import (
    RetailerIndent, RetailerIndentCreate,
    RetailerDispatch, RetailerDispatchCreate
)
from datetime import datetime

router = APIRouter(prefix="/api", tags=["retailer_indents"])


# ============================================================================
# RETAILER INDENTS
# ============================================================================
@router.get("/retailer-indents")
async def get_retailer_indents(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    # If retailer, only show their own indents
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    indents = await db.retailer_indents.find(query, {"_id": 0}).sort("indent_date", -1).to_list(1000)
    return indents


@router.post("/retailer-indents")
async def create_retailer_indent(input: RetailerIndentCreate, current_user: dict = Depends(get_current_user)):
    # Get retailer info
    if current_user["role"] == "retailer":
        retailer_id = current_user["user_id"]
    else:
        retailer_id = input.retailer_id
    
    retailer = await db.users.find_one({"id": retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    indent = RetailerIndent(
        retailer_id=retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        indent_date=input.indent_date,
        items=input.items,
        remarks=input.remarks,
        created_by=current_user["user_id"],
        created_by_role=current_user["role"]
    )
    
    doc = indent.model_dump()
    doc["indent_date"] = doc["indent_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_indents.insert_one(doc)
    return {"id": indent.id, "message": "Indent created successfully"}


@router.put("/retailer-indents/{indent_id}")
async def update_retailer_indent(indent_id: str, input: RetailerIndentCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.retailer_indents.find_one({"id": indent_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Retailers can only update their own pending indents
    if current_user["role"] == "retailer":
        if existing["retailer_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized")
        if existing["status"] != "pending":
            raise HTTPException(status_code=400, detail="Cannot edit non-pending indent")
    
    update_data = {
        "indent_date": input.indent_date.isoformat(),
        "items": [item.model_dump() for item in input.items],
        "remarks": input.remarks
    }
    
    await db.retailer_indents.update_one({"id": indent_id}, {"$set": update_data})
    return {"id": indent_id, "message": "Indent updated successfully"}


@router.delete("/retailer-indents/{indent_id}")
async def delete_retailer_indent(indent_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.retailer_indents.find_one({"id": indent_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Retailers can only delete their own indents
    if current_user["role"] == "retailer" and existing["retailer_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if there are any dispatches for this indent
    dispatches = await db.retailer_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
    if len(dispatches) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete indent with existing dispatches. Delete dispatches first.")
    
    await db.retailer_indents.delete_one({"id": indent_id})
    return {"message": "Indent deleted successfully"}


@router.get("/retailer-indents/previous/{retailer_id}")
async def get_previous_retailer_indent(retailer_id: str, current_user: dict = Depends(get_current_user)):
    """Get the most recent indent for a retailer to use as template"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find the most recent indent for this retailer
    indent = await db.retailer_indents.find_one(
        {"retailer_id": retailer_id},
        {"_id": 0},
        sort=[("indent_date", -1), ("created_at", -1)]
    )
    
    if not indent:
        return {"indent": None, "message": "No previous indent found"}
    
    return {"indent": indent, "message": "Previous indent found"}


# ============================================================================
# RETAILER DISPATCHES
# ============================================================================
@router.get("/retailer-dispatches")
async def get_retailer_dispatches(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    dispatches = await db.retailer_dispatches.find(query, {"_id": 0}).sort("dispatch_date", -1).to_list(1000)
    return dispatches


@router.post("/retailer-dispatches")
async def create_retailer_dispatch(input: RetailerDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can create dispatches")
    
    # Get indent
    indent = await db.retailer_indents.find_one({"id": input.indent_id})
    if not indent:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Get retailer info for commission
    retailer = await db.users.find_one({"id": indent["retailer_id"]}, {"_id": 0})
    commission = retailer.get("commission_percentage", 0) if retailer else 0
    
    # Calculate totals
    total_mrp_value = 0
    items_with_totals = []
    for item in input.items:
        item_dict = item.model_dump()
        item_dict["total_value"] = item.supplied_qty * item.mrp
        total_mrp_value += item_dict["total_value"]
        items_with_totals.append(item_dict)
    
    net_payable = total_mrp_value * (1 - commission / 100)
    
    dispatch = RetailerDispatch(
        indent_id=input.indent_id,
        retailer_id=indent["retailer_id"],
        retailer_name=indent["retailer_name"],
        dispatch_date=input.dispatch_date,
        items=items_with_totals,
        total_mrp_value=round(total_mrp_value, 2),
        commission_percentage=commission,
        net_payable=round(net_payable, 2),
        transport_charges=input.transport_charges or 0,
        dispatched_by=current_user["user_id"],
        invoice_number=None,  # Invoice created separately
        remarks=input.remarks
    )
    
    doc = dispatch.model_dump()
    doc["dispatch_date"] = doc["dispatch_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_dispatches.insert_one(doc)
    
    # Update indent status based on dispatch completeness
    # Get all dispatches for this indent
    all_dispatches = await db.retailer_dispatches.find({"indent_id": input.indent_id}, {"_id": 0}).to_list(100)
    
    # Calculate total dispatched per product
    total_dispatched = {}
    for d in all_dispatches:
        for item in d.get('items', []):
            key = item.get('product_id', '')
            total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
    
    # Check if fully dispatched
    fully_dispatched = True
    for item in indent.get('items', []):
        dispatched = total_dispatched.get(item.get('product_id', ''), 0)
        if dispatched < item.get('quantity', 0):
            fully_dispatched = False
            break
    
    new_status = "dispatched" if fully_dispatched else "partial"
    await db.retailer_indents.update_one(
        {"id": input.indent_id},
        {"$set": {"status": new_status}}
    )
    
    return {"id": dispatch.id, "message": "Dispatch created successfully"}


@router.put("/retailer-dispatches/{dispatch_id}")
async def update_retailer_dispatch(dispatch_id: str, input: RetailerDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update dispatches")
    
    existing = await db.retailer_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Get retailer info for commission
    retailer = await db.users.find_one({"id": existing["retailer_id"]}, {"_id": 0})
    commission = retailer.get("commission_percentage", 0) if retailer else 0
    
    # Calculate totals
    total_mrp_value = 0
    items_with_totals = []
    for item in input.items:
        item_dict = item.model_dump()
        item_dict["total_value"] = item.supplied_qty * item.mrp
        total_mrp_value += item_dict["total_value"]
        items_with_totals.append(item_dict)
    
    net_payable = total_mrp_value * (1 - commission / 100)
    
    update_data = {
        "dispatch_date": input.dispatch_date.isoformat(),
        "items": items_with_totals,
        "total_mrp_value": round(total_mrp_value, 2),
        "commission_percentage": commission,
        "net_payable": round(net_payable, 2),
        "transport_charges": input.transport_charges or 0,
        "remarks": input.remarks
    }
    
    await db.retailer_dispatches.update_one({"id": dispatch_id}, {"$set": update_data})
    return {"id": dispatch_id, "message": "Dispatch updated successfully"}


@router.delete("/retailer-dispatches/{dispatch_id}")
async def delete_retailer_dispatch(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete dispatches")
    
    existing = await db.retailer_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    indent_id = existing.get("indent_id")
    
    # Delete the dispatch
    await db.retailer_dispatches.delete_one({"id": dispatch_id})
    
    # Check if there are remaining dispatches for this indent
    if indent_id:
        remaining_dispatches = await db.retailer_dispatches.count_documents({"indent_id": indent_id})
        
        if remaining_dispatches == 0:
            # Reset indent status to pending
            await db.retailer_indents.update_one(
                {"id": indent_id},
                {"$set": {"status": "pending"}}
            )
        else:
            # Recalculate if fully dispatched
            indent = await db.retailer_indents.find_one({"id": indent_id}, {"_id": 0})
            if indent:
                dispatches_for_indent = await db.retailer_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
                
                dispatched_by_product = {}
                for d in dispatches_for_indent:
                    for item in d.get("items", []):
                        product_id = item.get("product_id")
                        if product_id:
                            dispatched_by_product[product_id] = dispatched_by_product.get(product_id, 0) + item.get("supplied_qty", 0)
                
                all_dispatched = True
                for item in indent.get("items", []):
                    product_id = item.get("product_id")
                    required = item.get("quantity", 0)
                    dispatched = dispatched_by_product.get(product_id, 0)
                    if dispatched < required:
                        all_dispatched = False
                        break
                
                new_status = "dispatched" if all_dispatched else "partial"
                await db.retailer_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"status": new_status}}
                )
    
    return {"message": "Dispatch deleted successfully"}


@router.get("/retailer-dispatches/uninvoiced")
async def get_uninvoiced_retailer_dispatches(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get retailer dispatches that don't have an invoice yet"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {"invoice_number": {"$in": [None, ""]}}
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    dispatches = await db.retailer_dispatches.find(query, {"_id": 0}).sort("dispatch_date", -1).to_list(500)
    return dispatches
