"""
Procurement Routes
"""
from fastapi import APIRouter, HTTPException, Depends, status
from dependencies import db, get_current_user
from models import Procurement, ProcurementCreate, ProcurementTemplate, ProcurementTemplateCreate
from typing import List
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/api", tags=["procurement"])


@router.get("/procurement", response_model=List[Procurement])
async def get_procurements(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    procurements = await db.procurements.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    for p in procurements:
        if isinstance(p['date'], str):
            p['date'] = datetime.fromisoformat(p['date'])
        if isinstance(p['created_at'], str):
            p['created_at'] = datetime.fromisoformat(p['created_at'])
    return [Procurement(**p) for p in procurements]


@router.get("/procurement/previous-day")
async def get_previous_day_procurements(
    reference_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get procurements from the day before reference_date to use as template for entry.
    If no reference_date provided, defaults to today (so shows yesterday's data).
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Determine the reference date (date for which we want to record purchases)
    if reference_date:
        try:
            ref_date = datetime.strptime(reference_date, '%Y-%m-%d')
        except ValueError:
            ref_date = datetime.now(timezone.utc)
    else:
        ref_date = datetime.now(timezone.utc)
    
    # Get the day before reference date
    target_date = (ref_date - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Find procurements from target date
    all_procurements = await db.procurements.find({}, {"_id": 0}).to_list(1000)
    
    target_procs = []
    for p in all_procurements:
        proc_date = p.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str == target_date:
            target_procs.append(p)
    
    # Convert to template format (remove IDs and payment status)
    templates = []
    for p in target_procs:
        templates.append({
            "farmer_id": p.get("farmer_id"),
            "farmer_name": p.get("farmer_name"),
            "products": p.get("products", []),
            "total_amount": p.get("total_amount", 0),
            "date": target_date
        })
    
    return templates


@router.post("/procurement", response_model=Procurement, status_code=status.HTTP_201_CREATED)
async def create_procurement(input: ProcurementCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    procurement_dict = input.model_dump()
    procurement_dict["recorded_by"] = current_user["user_id"]
    procurement = Procurement(**procurement_dict)
    
    # Update product stock
    for item in procurement.products:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"current_stock": item.quantity}}
        )
    
    doc = procurement.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.procurements.insert_one(doc)
    
    # Real-time sync: Update stock status for each product
    proc_date = procurement.date.strftime('%Y-%m-%d') if hasattr(procurement.date, 'strftime') else str(procurement.date)[:10]
    for item in procurement.products:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if not product:
            continue
            
        # Check if stock status entry exists for this product/date
        existing = await db.daily_stock_status.find_one({
            "product_id": item.product_id,
            "date": proc_date
        })
        
        # Use rate as the price per kg
        item_price = item.rate if hasattr(item, 'rate') else 0
        
        if existing:
            # Update existing entry - add to purchase_qty
            new_purchase = existing.get("purchase_qty", 0) + item.quantity
            new_avg_price = item_price if item_price else existing.get("avg_price", 0)
            await db.daily_stock_status.update_one(
                {"id": existing["id"]},
                {"$set": {"purchase_qty": new_purchase, "avg_price": new_avg_price}}
            )
        else:
            # Create new stock status entry
            # Get previous day's closing as opening
            yesterday = (procurement.date - timedelta(days=1)).strftime('%Y-%m-%d') if hasattr(procurement.date, 'strftime') else (datetime.strptime(str(procurement.date)[:10], '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
            prev_status = await db.daily_stock_status.find_one({
                "product_id": item.product_id,
                "date": yesterday,
                "status": "closed"
            })
            opening_qty = prev_status.get("closing_qty", 0) if prev_status else 0
            
            new_status = {
                "id": str(uuid.uuid4()),
                "date": proc_date,
                "product_id": item.product_id,
                "product_name": product["name"],
                "opening_qty": opening_qty,
                "purchase_qty": item.quantity,
                "dispatch_qty": 0,
                "wastage_qty": 0,
                "wastage_value": 0,
                "avg_price": item_price,
                "status": "open",
                "closed_at": None
            }
            await db.daily_stock_status.insert_one(new_status)
    
    return procurement


@router.put("/procurement/{procurement_id}")
async def update_procurement(procurement_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Get existing procurement first
    existing = await db.procurements.find_one({"id": procurement_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    old_date = existing.get("date")
    
    # Allow updating payment-related fields and date
    update_fields = {}
    if "paid_amount" in input:
        update_fields["paid_amount"] = input["paid_amount"]
    if "pending_amount" in input:
        update_fields["pending_amount"] = input["pending_amount"]
    if "payment_status" in input:
        update_fields["payment_status"] = input["payment_status"]
    if "date" in input:
        # Convert date string to ISO format if needed
        new_date = input["date"]
        if isinstance(new_date, str) and len(new_date) == 10:
            # Simple date like "2026-04-05", add time component
            new_date = f"{new_date}T00:00:00+00:00"
        update_fields["date"] = new_date
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    result = await db.procurements.find_one_and_update(
        {"id": procurement_id},
        {"$set": update_fields},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    # If date changed, update stock status for both old and new dates
    if "date" in update_fields and old_date != update_fields["date"]:
        old_date_str = str(old_date)[:10] if old_date else None
        new_date_str = str(update_fields["date"])[:10]
        
        # Update stock status for products on both dates
        for item in existing.get("products", []):
            product_id = item.get("product_id")
            if not product_id:
                continue
            
            qty = float(item.get("quantity", 0) or 0)
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            
            # Convert to Kg
            qty_kg = qty
            if unit == "Bunch" and unit_size:
                try:
                    qty_kg = (qty * float(unit_size)) / 1000
                except:
                    pass
            
            total_value = float(item.get("total", 0) or 0)
            
            # Subtract from old date's stock status
            if old_date_str:
                await db.daily_stock_status.update_one(
                    {"date": old_date_str, "product_id": product_id},
                    {"$inc": {"purchase_qty": -qty_kg, "purchase_value": -total_value}}
                )
            
            # Add to new date's stock status
            await db.daily_stock_status.update_one(
                {"date": new_date_str, "product_id": product_id},
                {"$inc": {"purchase_qty": qty_kg, "purchase_value": total_value}},
                upsert=False  # Only update if exists
            )
    
    return {"message": "Procurement updated successfully", "procurement": result}


@router.delete("/procurement/{procurement_id}")
async def delete_procurement(procurement_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Get procurement details first
    procurement = await db.procurements.find_one({"id": procurement_id}, {"_id": 0})
    if not procurement:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    # Reverse stock changes
    for item in procurement.get("products", []):
        await db.products.update_one(
            {"id": item["product_id"]},
            {"$inc": {"current_stock": -item["quantity"]}}
        )
    
    # Delete procurement
    result = await db.procurements.delete_one({"id": procurement_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    return {"message": "Procurement deleted successfully"}


# ============================================================================
# PROCUREMENT TEMPLATES
# ============================================================================
@router.get("/procurement-templates")
async def get_procurement_templates(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    templates = await db.procurement_templates.find({}, {"_id": 0}).to_list(100)
    return templates


@router.post("/procurement-templates")
async def create_procurement_template(input: ProcurementTemplateCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    template = ProcurementTemplate(
        name=input.name,
        farmer_id=input.farmer_id,
        farmer_name=input.farmer_name,
        items=input.items,
        created_by=current_user["user_id"]
    )
    
    doc = template.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.procurement_templates.insert_one(doc)
    
    return {"id": template.id, "message": "Template created successfully"}


@router.delete("/procurement-templates/{template_id}")
async def delete_procurement_template(template_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.procurement_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template deleted successfully"}
