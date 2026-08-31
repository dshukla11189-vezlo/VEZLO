"""
Procurement Routes
==================
Extracted from server.py for modular organization.
Handles procurement management, procurement payments, and procurement templates.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
import re

from dependencies import (
    db,
    get_current_user,
    logger,
)
from models import (
    Procurement,
    ProcurementCreate,
    ProcurementTemplate,
    ProcurementTemplateCreate,
)

router = APIRouter(tags=["procurement"])

# SECTION: PROCUREMENT ROUTES (Lines ~425-590)
# ============================================================================
@router.get("/procurement", response_model=List[Procurement])
async def get_procurements(
    from_date: str = None,
    to_date: str = None,
    filter_by: str = "date",  # 'date' (default) or 'payment_date'
    limit: int = 1000,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Build query with optional date filters
    # Note: Dates in DB are stored as strings in ISO format
    query = {}
    
    # Choose which field to filter by
    date_field = "payment_date" if filter_by == "payment_date" else "date"
    
    if from_date or to_date:
        date_filter = {}
        if from_date:
            # For payment_date field (YYYY-MM-DD format), use simple string comparison
            # For date field (ISO format with T), add time component
            if filter_by == "payment_date":
                date_filter["$gte"] = from_date  # payment_date is stored as YYYY-MM-DD
            else:
                date_filter["$gte"] = from_date + "T00:00:00" if 'T' not in from_date else from_date
        if to_date:
            if filter_by == "payment_date":
                date_filter["$lte"] = to_date  # payment_date is stored as YYYY-MM-DD
            else:
                date_filter["$lte"] = to_date + "T23:59:59" if 'T' not in to_date else to_date
        query[date_field] = date_filter
    
    procurements = await db.procurements.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    
    # Get all procurement IDs to fetch payments in bulk
    proc_ids = [p.get('id') for p in procurements if p.get('id')]
    
    # Fetch all payments for these procurements in one query
    all_payments = await db.procurement_payments.find(
        {"procurement_id": {"$in": proc_ids}},
        {"_id": 0}
    ).to_list(10000)
    
    # Group payments by procurement_id
    payments_by_proc = {}
    for payment in all_payments:
        proc_id = payment.get('procurement_id')
        if proc_id not in payments_by_proc:
            payments_by_proc[proc_id] = []
        payments_by_proc[proc_id].append({
            "id": payment.get("id"),
            "amount": payment.get("amount", 0),
            "payment_date": payment.get("payment_date", ""),
            "payment_mode": payment.get("payment_mode", ""),
            "payment_reference": payment.get("payment_reference"),
            "paid_by_type": payment.get("paid_by_type", "company"),
            "paid_by": payment.get("paid_by"),
            "paid_by_employee_id": payment.get("paid_by_employee_id"),
            "settlement_status": payment.get("settlement_status"),
            "is_reimbursement": payment.get("is_reimbursement", False)
        })
    
    # Add payments to each procurement
    for p in procurements:
        if isinstance(p['date'], str):
            p['date'] = datetime.fromisoformat(p['date'].replace('Z', '+00:00'))
        if isinstance(p['created_at'], str):
            p['created_at'] = datetime.fromisoformat(p['created_at'].replace('Z', '+00:00'))
        # Attach payments array
        p['payments'] = payments_by_proc.get(p.get('id'), [])
    
    return [Procurement(**p) for p in procurements]


@router.get("/procurement/previous-day")
async def get_previous_day_procurements(
    reference_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get unique procurements from the 7 days before reference_date to use as template for entry.
    If no reference_date provided, defaults to today.
    Returns unique farmer-product combinations from the last 7 days.
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
    
    # Get the date range: 7 days before reference date (exclusive of reference date)
    end_date = (ref_date - timedelta(days=1)).strftime('%Y-%m-%d')  # Day before reference
    start_date = (ref_date - timedelta(days=7)).strftime('%Y-%m-%d')  # 7 days before reference
    
    # Find procurements in the date range (use indexed query)
    query = {
        "date": {
            "$gte": start_date + "T00:00:00",
            "$lte": end_date + "T23:59:59"
        }
    }
    all_procurements = await db.procurements.find(query, {"_id": 0}).to_list(500)
    
    # Collect unique farmer-product combinations
    unique_items = {}  # Key: "farmer_id|product_id" -> latest procurement item
    
    for p in all_procurements:
        proc_date = p.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        farmer_id = p.get("farmer_id", "")
        farmer_name = p.get("farmer_name", "")
        
        for product in p.get("products", []):
                product_id = product.get("product_id", "")
                # Create unique key for farmer-product combination
                key = f"{farmer_id}|{product_id}"
                
                # Keep the most recent entry for each unique combination
                if key not in unique_items or proc_date_str > unique_items[key].get("date", ""):
                    unique_items[key] = {
                        "farmer_id": farmer_id,
                        "farmer_name": farmer_name,
                        "product_id": product_id,
                        "product_name": product.get("product_name", ""),
                        "quantity": product.get("quantity", 0),
                        "unit": product.get("unit", "Kg"),
                        "unit_size": product.get("unit_size", ""),
                        "rate": product.get("rate", 0),
                        "total": product.get("total", 0),
                        "date": proc_date_str
                    }
    
    # Group items by farmer for the response format
    farmer_items = {}
    for item in unique_items.values():
        farmer_id = item["farmer_id"]
        if farmer_id not in farmer_items:
            farmer_items[farmer_id] = {
                "farmer_id": farmer_id,
                "farmer_name": item["farmer_name"],
                "products": [],
                "date": f"{start_date} to {end_date}"
            }
        farmer_items[farmer_id]["products"].append({
            "product_id": item["product_id"],
            "product_name": item["product_name"],
            "quantity": item["quantity"],
            "unit": item["unit"],
            "unit_size": item["unit_size"],
            "rate": item["rate"],
            "total": item["total"]
        })
    
    # Calculate totals for each farmer
    templates = []
    for farmer_data in farmer_items.values():
        farmer_data["total_amount"] = sum(p.get("total", 0) for p in farmer_data["products"])
        templates.append(farmer_data)
    
    # Sort by farmer name
    templates.sort(key=lambda x: x.get("farmer_name", ""))
    
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
        
        # Convert quantity to kg based on unit type
        qty_kg = item.quantity
        unit = getattr(item, 'unit', 'Kg')
        unit_size = getattr(item, 'unit_size', '')
        
        # Convert Bunch, Packet, Piece, Box etc. to kg using unit_size (in grams)
        if unit.lower() in ["bunch", "packet", "piece", "box", "crate", "dozen", "pack"] and unit_size:
            try:
                qty_kg = (item.quantity * float(unit_size)) / 1000
            except (ValueError, TypeError):
                pass  # Keep original quantity if conversion fails
            
        # Check if stock status entry exists for this product/date
        existing = await db.daily_stock_status.find_one({
            "product_id": item.product_id,
            "date": proc_date
        })
        
        # Use rate as the price per kg
        item_price = item.rate if hasattr(item, 'rate') else 0
        item_total = getattr(item, 'total', qty_kg * item_price)
        
        # Calculate avg_price per kg
        avg_price_per_kg = item_total / qty_kg if qty_kg > 0 else item_price
        
        if existing:
            # Update existing entry - add to purchase_qty (in kg)
            new_purchase = existing.get("purchase_qty", 0) + qty_kg
            new_purchase_value = existing.get("purchase_value", 0) + item_total
            new_avg_price = new_purchase_value / new_purchase if new_purchase > 0 else avg_price_per_kg
            await db.daily_stock_status.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "purchase_qty": round(new_purchase, 2),
                    "purchase_value": round(new_purchase_value, 2),
                    "avg_price": round(new_avg_price, 2)
                }}
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
                "purchase_qty": round(qty_kg, 2),
                "purchase_value": round(item_total, 2),
                "dispatch_qty": 0,
                "wastage_qty": 0,
                "wastage_value": 0,
                "avg_price": round(avg_price_per_kg, 2),
                "status": "open",
                "closed_at": None
            }
            await db.daily_stock_status.insert_one(new_status)
    
    # SELF-HEALING: Trigger daily COGS recompute from this procurement date forward
    try:
        from routes.daily_cogs import trigger_cogs_recompute_from_date
        import asyncio
        asyncio.create_task(trigger_cogs_recompute_from_date(db, proc_date))
        logger.info(f"[PROCUREMENT] Triggered COGS recompute from {proc_date}")
    except Exception as e:
        logger.warning(f"[PROCUREMENT] Could not trigger COGS recompute: {e}")
    
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
    old_products = existing.get("products", [])
    
    # Build update fields - allow updating all relevant fields
    update_fields = {}
    
    # Payment-related fields
    if "paid_amount" in input:
        update_fields["paid_amount"] = input["paid_amount"]
    if "pending_amount" in input:
        update_fields["pending_amount"] = input["pending_amount"]
    if "payment_status" in input:
        update_fields["payment_status"] = input["payment_status"]
    if "total_amount" in input:
        update_fields["total_amount"] = input["total_amount"]
    if "remark" in input:
        update_fields["remark"] = input["remark"]
    if "status" in input:
        update_fields["status"] = input["status"]
    
    # Payment detail fields (for tracking who paid and settlement)
    if "payment_date" in input:
        update_fields["payment_date"] = input["payment_date"]
    if "payment_mode" in input:
        update_fields["payment_mode"] = input["payment_mode"]
    if "payment_reference" in input:
        update_fields["payment_reference"] = input["payment_reference"]
    if "paid_by_type" in input:
        update_fields["paid_by_type"] = input["paid_by_type"]
    if "paid_by" in input:
        update_fields["paid_by"] = input["paid_by"]
    if "paid_by_employee_id" in input:
        update_fields["paid_by_employee_id"] = input["paid_by_employee_id"]
    if "settlement_status" in input:
        update_fields["settlement_status"] = input["settlement_status"]
    if "settlement_date" in input:
        update_fields["settlement_date"] = input["settlement_date"]
    if "settlement_mode" in input:
        update_fields["settlement_mode"] = input["settlement_mode"]
    if "settlement_reference" in input:
        update_fields["settlement_reference"] = input["settlement_reference"]
    if "settlement_remarks" in input:
        update_fields["settlement_remarks"] = input["settlement_remarks"]
    if "is_settled" in input:
        update_fields["is_settled"] = input["is_settled"]
    
    # Reimbursement fields for partial/excess reimbursement tracking
    if "reimbursement_amount" in input:
        update_fields["reimbursement_amount"] = input["reimbursement_amount"]
    if "employee_credit_amount" in input:
        update_fields["employee_credit_amount"] = input["employee_credit_amount"]
    
    # Date field
    new_date = None
    if "date" in input:
        new_date = input["date"]
        if isinstance(new_date, str) and len(new_date) == 10:
            new_date = f"{new_date}T00:00:00+00:00"
        update_fields["date"] = new_date
    
    # Products array - this is critical for updating rates and totals
    if "products" in input:
        update_fields["products"] = input["products"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    # Calculate stock status changes if products or date changed
    products_changed = "products" in update_fields
    date_changed = "date" in update_fields and old_date != update_fields.get("date")
    
    result = await db.procurements.find_one_and_update(
        {"id": procurement_id},
        {"$set": update_fields},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    # When settlement_status changes to 'settled', also update all associated procurement_payments
    if "settlement_status" in update_fields:
        new_settlement_status = update_fields.get("settlement_status")
        payment_update = {"settlement_status": new_settlement_status}
        if "settlement_date" in update_fields:
            payment_update["settlement_date"] = update_fields["settlement_date"]
        if "is_settled" in update_fields:
            payment_update["is_settled"] = update_fields["is_settled"]
        
        # Update all procurement_payments for this procurement
        await db.procurement_payments.update_many(
            {"procurement_id": procurement_id, "paid_by_type": "employee"},
            {"$set": payment_update}
        )
    
    # Update stock status when products or date changes
    if products_changed or date_changed:
        old_date_str = str(old_date)[:10] if old_date else None
        new_date_str = str(update_fields.get("date", old_date))[:10] if update_fields.get("date") or old_date else None
        new_products = update_fields.get("products", old_products)
        
        # Build maps of old and new product data
        old_product_map = {}
        for item in old_products:
            product_id = item.get("product_id")
            if product_id:
                qty = float(item.get("quantity", 0) or 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                qty_kg = qty
                # Convert Bunch, Packet, Piece, Box etc. to kg using unit_size
                if unit.lower() in ["bunch", "packet", "piece", "box", "crate", "dozen", "pack"] and unit_size:
                    try:
                        qty_kg = (qty * float(unit_size)) / 1000
                    except:
                        pass
                total_value = float(item.get("total", 0) or 0)
                old_product_map[product_id] = {"qty_kg": qty_kg, "total_value": total_value}
        
        new_product_map = {}
        for item in new_products:
            product_id = item.get("product_id")
            if product_id:
                qty = float(item.get("quantity", 0) or 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                qty_kg = qty
                # Convert Bunch, Packet, Piece, Box etc. to kg using unit_size
                if unit.lower() in ["bunch", "packet", "piece", "box", "crate", "dozen", "pack"] and unit_size:
                    try:
                        qty_kg = (qty * float(unit_size)) / 1000
                    except:
                        pass
                total_value = float(item.get("total", 0) or 0)
                new_product_map[product_id] = {"qty_kg": qty_kg, "total_value": total_value}
        
        # Get all affected product IDs
        all_product_ids = set(old_product_map.keys()) | set(new_product_map.keys())
        
        for product_id in all_product_ids:
            old_data = old_product_map.get(product_id, {"qty_kg": 0, "total_value": 0})
            new_data = new_product_map.get(product_id, {"qty_kg": 0, "total_value": 0})
            
            if date_changed:
                # Date changed: subtract from old date, add to new date
                if old_date_str:
                    await db.daily_stock_status.update_one(
                        {"date": old_date_str, "product_id": product_id},
                        {"$inc": {"purchase_qty": -old_data["qty_kg"], "purchase_value": -old_data["total_value"]}}
                    )
                    # Recalculate wastage_value for old date
                    old_stock = await db.daily_stock_status.find_one(
                        {"date": old_date_str, "product_id": product_id},
                        {"_id": 0}
                    )
                    if old_stock and old_stock.get("wastage_qty", 0) > 0:
                        old_pq = old_stock.get("purchase_qty", 0) - old_data["qty_kg"]
                        old_pv = old_stock.get("purchase_value", 0) - old_data["total_value"]
                        old_avg = old_pv / old_pq if old_pq > 0 else 0
                        new_wv = round(old_stock.get("wastage_qty", 0) * old_avg, 2)
                        await db.daily_stock_status.update_one(
                            {"date": old_date_str, "product_id": product_id},
                            {"$set": {"wastage_value": new_wv}}
                        )
                        
                if new_date_str:
                    await db.daily_stock_status.update_one(
                        {"date": new_date_str, "product_id": product_id},
                        {"$inc": {"purchase_qty": new_data["qty_kg"], "purchase_value": new_data["total_value"]}},
                        upsert=False
                    )
                    # Recalculate wastage_value for new date
                    new_stock = await db.daily_stock_status.find_one(
                        {"date": new_date_str, "product_id": product_id},
                        {"_id": 0}
                    )
                    if new_stock and new_stock.get("wastage_qty", 0) > 0:
                        new_pq = new_stock.get("purchase_qty", 0) + new_data["qty_kg"]
                        new_pv = new_stock.get("purchase_value", 0) + new_data["total_value"]
                        new_avg = new_pv / new_pq if new_pq > 0 else 0
                        new_wv = round(new_stock.get("wastage_qty", 0) * new_avg, 2)
                        await db.daily_stock_status.update_one(
                            {"date": new_date_str, "product_id": product_id},
                            {"$set": {"wastage_value": new_wv}}
                        )
            elif products_changed and new_date_str:
                # Only products changed: update the difference on the same date
                qty_diff = new_data["qty_kg"] - old_data["qty_kg"]
                value_diff = new_data["total_value"] - old_data["total_value"]
                if qty_diff != 0 or value_diff != 0:
                    await db.daily_stock_status.update_one(
                        {"date": new_date_str, "product_id": product_id},
                        {"$inc": {"purchase_qty": qty_diff, "purchase_value": value_diff}}
                    )
                
                # Recalculate wastage for closed stock status
                # Get the current stock status
                stock_status = await db.daily_stock_status.find_one(
                    {"date": new_date_str, "product_id": product_id},
                    {"_id": 0}
                )
                if stock_status:
                    # Get updated purchase values (after the increment above)
                    updated_purchase_qty = stock_status.get("purchase_qty", 0) + qty_diff
                    updated_purchase_value = stock_status.get("purchase_value", 0) + value_diff
                    
                    # Calculate new avg_price
                    new_avg_price = updated_purchase_value / updated_purchase_qty if updated_purchase_qty > 0 else 0
                    
                    # For CLOSED entries, recalculate wastage_qty as well
                    # Wastage = Opening + Purchase - Dispatch - Closing
                    if stock_status.get("status") == "closed":
                        opening_qty = stock_status.get("opening_qty", 0) or 0
                        dispatch_qty = stock_status.get("dispatch_qty", 0) or 0
                        closing_qty = stock_status.get("closing_qty", 0) or 0
                        
                        # Recalculate wastage based on new purchase qty
                        new_wastage_qty = max(0, opening_qty + updated_purchase_qty - dispatch_qty - closing_qty)
                        total_input = opening_qty + updated_purchase_qty
                        new_wastage_pct = (new_wastage_qty / total_input * 100) if total_input > 0 else 0
                        new_wastage_value = round(new_wastage_qty * new_avg_price, 2)
                        
                        # Update wastage fields
                        await db.daily_stock_status.update_one(
                            {"date": new_date_str, "product_id": product_id},
                            {"$set": {
                                "wastage_qty": round(new_wastage_qty, 2),
                                "wastage_value": new_wastage_value,
                                "wastage_percent": round(new_wastage_pct, 2),
                                "avg_price": round(new_avg_price, 2)
                            }}
                        )
                    elif stock_status.get("wastage_qty", 0) > 0:
                        # For open entries with existing wastage, just update wastage_value
                        wastage_qty = stock_status.get("wastage_qty", 0)
                        new_wastage_value = round(wastage_qty * new_avg_price, 2)
                        
                        await db.daily_stock_status.update_one(
                            {"date": new_date_str, "product_id": product_id},
                            {"$set": {"wastage_value": new_wastage_value}}
                        )
    
    # SELF-HEALING: Trigger daily COGS recompute from the earlier of old/new procurement date
    try:
        from routes.daily_cogs import trigger_cogs_recompute_from_date
        import asyncio
        # Determine the earliest affected date
        if isinstance(old_date, datetime):
            old_date_str = old_date.strftime('%Y-%m-%d')
        else:
            old_date_str = str(old_date)[:10] if old_date else None
        
        new_date_str = input.get("date")
        if new_date_str:
            if isinstance(new_date_str, datetime):
                new_date_str = new_date_str.strftime('%Y-%m-%d')
            else:
                new_date_str = str(new_date_str)[:10]
        
        # Recompute from the earlier date
        recompute_from = old_date_str
        if new_date_str and (not old_date_str or new_date_str < old_date_str):
            recompute_from = new_date_str
        
        if recompute_from:
            asyncio.create_task(trigger_cogs_recompute_from_date(db, recompute_from))
            logger.info(f"[PROCUREMENT] Triggered COGS recompute from {recompute_from}")
    except Exception as e:
        logger.warning(f"[PROCUREMENT] Could not trigger COGS recompute: {e}")
    
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


@router.post("/procurement/migrate-paid-by-type")
async def migrate_procurement_paid_by_type(current_user: dict = Depends(get_current_user)):
    """Migration endpoint to allow setting paid_by_type for paid procurements without it"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Find paid procurements without paid_by_type
    paid_without_type = await db.procurements.count_documents({
        "payment_status": "paid",
        "paid_by_type": {"$exists": False}
    })
    
    paid_with_null_type = await db.procurements.count_documents({
        "payment_status": "paid",
        "paid_by_type": None
    })
    
    return {
        "message": "Migration check completed",
        "paid_procurements_without_type": paid_without_type,
        "paid_procurements_with_null_type": paid_with_null_type,
        "note": "Use the Edit Purchase dialog to set paid_by_type for each procurement"
    }


# ============================================================================
# SECTION: PROCUREMENT PAYMENTS
# ============================================================================


@router.get("/procurement-payments")
async def get_all_procurement_payments(
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all procurement payments with optional date filtering"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if from_date and to_date:
        query["payment_date"] = {"$gte": from_date, "$lte": to_date}
    elif from_date:
        query["payment_date"] = {"$gte": from_date}
    elif to_date:
        query["payment_date"] = {"$lte": to_date}
    
    payments = await db.procurement_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments


@router.get("/procurement/{procurement_id}/payments")
async def get_procurement_payments(procurement_id: str, current_user: dict = Depends(get_current_user)):
    """Get all payments for a procurement"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payments = await db.procurement_payments.find(
        {"procurement_id": procurement_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return payments

@router.post("/procurement/{procurement_id}/payments")
async def create_procurement_payment(procurement_id: str, payment_data: dict, current_user: dict = Depends(get_current_user)):
    """Record a new payment for a procurement"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the procurement
    procurement = await db.procurements.find_one({"id": procurement_id}, {"_id": 0})
    if not procurement:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    amount = payment_data.get("amount", 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    # Get paid_by value
    paid_by_type = payment_data.get("paid_by_type", "company")
    paid_by_employee_id = payment_data.get("paid_by_employee_id")
    paid_by = payment_data.get("paid_by", "Company")
    
    if paid_by_type == "employee" and paid_by_employee_id:
        user = await db.users.find_one({"id": paid_by_employee_id}, {"_id": 0})
        if user:
            paid_by = user.get("name") or user.get("email")
    
    # Create payment record
    payment_id = str(uuid.uuid4())
    payment_doc = {
        "id": payment_id,
        "procurement_id": procurement_id,
        "vendor_id": procurement.get("vendor_id"),
        "vendor_name": procurement.get("vendor_name"),
        "amount": round(amount, 2),
        "payment_date": payment_data.get("payment_date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "payment_mode": payment_data.get("payment_mode", "cash"),
        "reference_number": payment_data.get("reference_number"),
        "remarks": payment_data.get("remarks"),
        "paid_by_type": paid_by_type,
        "paid_by": paid_by,
        "paid_by_employee_id": paid_by_employee_id,
        "settlement_status": "pending_reimbursement" if paid_by_type == "employee" else "settled",
        "is_bulk_payment": payment_data.get("is_bulk_payment", False),
        "bulk_payment_reference": payment_data.get("bulk_payment_reference"),
        "recorded_by": current_user["user_id"],
        "recorded_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None
    }
    
    await db.procurement_payments.insert_one(payment_doc)
    
    # Recalculate procurement totals from all payments
    all_payments = await db.procurement_payments.find({"procurement_id": procurement_id}).to_list(100)
    new_paid_amount = sum(p.get("amount", 0) for p in all_payments)
    total_amount = procurement.get("total_amount", 0)
    # Allow negative pending amount to indicate overpayment
    pending_amount = total_amount - new_paid_amount
    
    # Determine payment status
    if new_paid_amount >= total_amount:
        payment_status = "paid"  # Fully paid or overpaid
    elif new_paid_amount > 0:
        payment_status = "partial"
    else:
        payment_status = "pending"
    
    # Determine settlement status and paid_by fields based on all payments
    has_pending_reimbursement = any(p.get("settlement_status") == "pending_reimbursement" for p in all_payments)
    settlement_status = "pending_reimbursement" if has_pending_reimbursement else "settled"
    
    # Determine paid_by_type and paid_by for the procurement based on ALL payments
    # If ANY payment was made by an employee, mark the procurement as employee-paid
    employee_payments = [p for p in all_payments if p.get("paid_by_type") == "employee"]
    if employee_payments:
        # Use the latest employee payment's paid_by info
        latest_employee_payment = max(employee_payments, key=lambda x: x.get("created_at", ""))
        procurement_paid_by_type = "employee"
        procurement_paid_by = latest_employee_payment.get("paid_by", "Employee")
    else:
        procurement_paid_by_type = "company"
        procurement_paid_by = "Company"
    
    # Update procurement with all relevant fields
    # Get the latest payment info for display purposes
    latest_payment = max(all_payments, key=lambda x: x.get("created_at", ""))
    
    await db.procurements.update_one(
        {"id": procurement_id},
        {"$set": {
            "paid_amount": round(new_paid_amount, 2),
            "pending_amount": round(pending_amount, 2),
            "payment_status": payment_status,
            "settlement_status": settlement_status,
            "paid_by_type": procurement_paid_by_type,
            "paid_by": procurement_paid_by,
            # Add payment details for Cashflow display
            "payment_date": latest_payment.get("payment_date"),
            "payment_mode": latest_payment.get("payment_mode"),
            "payment_reference": latest_payment.get("reference_number"),
            "last_payment_date": latest_payment.get("payment_date"),
            "last_payment_amount": latest_payment.get("amount"),
            "last_payment_mode": latest_payment.get("payment_mode"),
            "last_payment_reference": latest_payment.get("reference_number"),
            "is_bulk_payment": latest_payment.get("is_bulk_payment", False),
            "bulk_payment_reference": latest_payment.get("bulk_payment_reference")
        }}
    )
    
    return {"id": payment_id, "message": "Payment recorded successfully"}

@router.put("/procurement-payments/{payment_id}")
async def update_procurement_payment(payment_id: str, payment_data: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing procurement payment"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update payments")
    
    # Get the original payment
    original_payment = await db.procurement_payments.find_one({"id": payment_id})
    if not original_payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    procurement_id = original_payment.get("procurement_id")
    new_amount = payment_data.get("amount", original_payment.get("amount", 0))
    
    # Validate new amount
    if new_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    # Get paid_by value
    paid_by_type = payment_data.get("paid_by_type", original_payment.get("paid_by_type", "company"))
    paid_by_employee_id = payment_data.get("paid_by_employee_id", original_payment.get("paid_by_employee_id"))
    paid_by = payment_data.get("paid_by", original_payment.get("paid_by", "Company"))
    
    if paid_by_type == "employee" and paid_by_employee_id:
        user = await db.users.find_one({"id": paid_by_employee_id}, {"_id": 0})
        if user:
            paid_by = user.get("name") or user.get("email")
    
    # Update the payment
    update_data = {
        "amount": round(new_amount, 2),
        "payment_mode": payment_data.get("payment_mode", original_payment.get("payment_mode")),
        "reference_number": payment_data.get("reference_number", original_payment.get("reference_number")),
        "remarks": payment_data.get("remarks", original_payment.get("remarks")),
        "payment_date": payment_data.get("payment_date", original_payment.get("payment_date")),
        "paid_by_type": paid_by_type,
        "paid_by": paid_by,
        "paid_by_employee_id": paid_by_employee_id,
        "settlement_status": "pending_reimbursement" if paid_by_type == "employee" else "settled",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["user_id"]
    }
    
    await db.procurement_payments.update_one(
        {"id": payment_id},
        {"$set": update_data}
    )
    
    # Recalculate procurement totals
    if procurement_id:
        procurement = await db.procurements.find_one({"id": procurement_id}, {"_id": 0})
        if procurement:
            all_payments = await db.procurement_payments.find({"procurement_id": procurement_id}).to_list(100)
            new_paid_amount = sum(p.get("amount", 0) for p in all_payments)
            total_amount = procurement.get("total_amount", 0)
            # Allow negative pending amount to indicate overpayment
            pending_amount = total_amount - new_paid_amount
            
            if new_paid_amount >= total_amount:
                payment_status = "paid"  # Fully paid or overpaid
            elif new_paid_amount > 0:
                payment_status = "partial"
            else:
                payment_status = "pending"
            
            has_pending_reimbursement = any(p.get("settlement_status") == "pending_reimbursement" for p in all_payments)
            settlement_status = "pending_reimbursement" if has_pending_reimbursement else "settled"
            
            # Determine paid_by_type and paid_by based on ALL payments
            employee_payments = [p for p in all_payments if p.get("paid_by_type") == "employee"]
            if employee_payments:
                latest_employee_payment = max(employee_payments, key=lambda x: x.get("created_at", ""))
                procurement_paid_by_type = "employee"
                procurement_paid_by = latest_employee_payment.get("paid_by", "Employee")
            else:
                procurement_paid_by_type = "company"
                procurement_paid_by = "Company"
            
            await db.procurements.update_one(
                {"id": procurement_id},
                {"$set": {
                    "paid_amount": round(new_paid_amount, 2),
                    "pending_amount": round(pending_amount, 2),
                    "payment_status": payment_status,
                    "settlement_status": settlement_status,
                    "paid_by_type": procurement_paid_by_type,
                    "paid_by": procurement_paid_by
                }}
            )
    
    return {"message": "Payment updated successfully"}

@router.delete("/procurement-payments/{payment_id}")
async def delete_procurement_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a procurement payment"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete payments")
    
    # Get the payment first
    payment = await db.procurement_payments.find_one({"id": payment_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    procurement_id = payment.get("procurement_id")
    
    # Delete the payment
    await db.procurement_payments.delete_one({"id": payment_id})
    
    # Recalculate procurement totals
    if procurement_id:
        procurement = await db.procurements.find_one({"id": procurement_id}, {"_id": 0})
        if procurement:
            remaining_payments = await db.procurement_payments.find({"procurement_id": procurement_id}).to_list(100)
            new_paid_amount = sum(p.get("amount", 0) for p in remaining_payments)
            total_amount = procurement.get("total_amount", 0)
            # Allow negative pending amount to indicate overpayment
            pending_amount = total_amount - new_paid_amount
            
            if new_paid_amount >= total_amount:
                payment_status = "paid"  # Fully paid or overpaid
            elif new_paid_amount > 0:
                payment_status = "partial"
            else:
                payment_status = "pending"
            
            has_pending_reimbursement = any(p.get("settlement_status") == "pending_reimbursement" for p in remaining_payments)
            settlement_status = "pending_reimbursement" if has_pending_reimbursement else "settled"
            
            # Determine paid_by_type and paid_by based on remaining payments
            employee_payments = [p for p in remaining_payments if p.get("paid_by_type") == "employee"]
            if employee_payments:
                latest_employee_payment = max(employee_payments, key=lambda x: x.get("created_at", ""))
                procurement_paid_by_type = "employee"
                procurement_paid_by = latest_employee_payment.get("paid_by", "Employee")
            elif remaining_payments:
                procurement_paid_by_type = "company"
                procurement_paid_by = "Company"
            else:
                # No payments remaining - reset to null
                procurement_paid_by_type = None
                procurement_paid_by = None
            
            await db.procurements.update_one(
                {"id": procurement_id},
                {"$set": {
                    "paid_amount": round(new_paid_amount, 2),
                    "pending_amount": round(pending_amount, 2),
                    "payment_status": payment_status,
                    "settlement_status": settlement_status if remaining_payments else None,
                    "paid_by_type": procurement_paid_by_type,
                    "paid_by": procurement_paid_by
                }}
            )
    
    return {"message": "Payment deleted successfully"}



@router.post("/procurement/fix-legacy-employee-payments")
async def fix_legacy_employee_payments(current_user: dict = Depends(get_current_user)):
    """
    Migration endpoint to fix legacy procurements that have employee payments
    but missing paid_by_type on the parent document.
    This ensures purple highlighting works for historical data.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    fixed_count = 0
    skipped_count = 0
    
    # Get all procurements that have paid_amount > 0 but no paid_by_type set
    procurements = await db.procurements.find(
        {"paid_amount": {"$gt": 0}},
        {"_id": 0, "id": 1, "paid_by_type": 1, "paid_by": 1, "settlement_status": 1}
    ).to_list(10000)
    
    for proc in procurements:
        proc_id = proc.get("id")
        
        # Get all payments for this procurement
        payments = await db.procurement_payments.find(
            {"procurement_id": proc_id},
            {"_id": 0}
        ).to_list(100)
        
        if not payments:
            skipped_count += 1
            continue
        
        # Check if any payment was made by employee
        employee_payments = [p for p in payments if p.get("paid_by_type") == "employee"]
        
        if employee_payments:
            # Use the latest employee payment info
            latest_emp_payment = max(employee_payments, key=lambda x: x.get("created_at", ""))
            
            # Determine settlement status
            has_pending_reimbursement = any(
                p.get("settlement_status") == "pending_reimbursement" 
                for p in payments if p.get("paid_by_type") == "employee"
            )
            settlement_status = "pending_reimbursement" if has_pending_reimbursement else "settled"
            
            # Update procurement with employee payment info
            await db.procurements.update_one(
                {"id": proc_id},
                {"$set": {
                    "paid_by_type": "employee",
                    "paid_by": latest_emp_payment.get("paid_by", "Employee"),
                    "settlement_status": settlement_status
                }}
            )
            fixed_count += 1
        else:
            # All payments are company payments
            current_paid_by_type = proc.get("paid_by_type")
            if not current_paid_by_type:
                await db.procurements.update_one(
                    {"id": proc_id},
                    {"$set": {
                        "paid_by_type": "company",
                        "paid_by": "Company",
                        "settlement_status": "settled"
                    }}
                )
                fixed_count += 1
            else:
                skipped_count += 1
    
    return {
        "message": f"Migration complete. Fixed {fixed_count} procurements, skipped {skipped_count}.",
        "fixed": fixed_count,
        "skipped": skipped_count
    }



# ============================================================================
# SECTION: PROCUREMENT TEMPLATES
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

