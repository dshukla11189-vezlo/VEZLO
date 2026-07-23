"""
COGS Snapshot API
Provides a daily snapshot of Purchase Price (PP/kg), QC Selling Price, and Retail Selling Price
for all products on a given date, with carry-forward logic for missing data.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timedelta
from typing import Optional
import logging

router = APIRouter(prefix="/api/cogs", tags=["COGS Snapshot"])

# Dependency to get database
async def get_db():
    from server import db
    return db

# Import get_current_user for auth
from dependencies import get_current_user


@router.get("/snapshot")
async def get_cogs_snapshot(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get COGS snapshot for all products on a given date.
    
    Returns:
    - product_name: Name of the product
    - pp_per_kg: Purchase Price per kg from daily_cogs (with carry-forward)
    - qc_sp_per_kg: QC Selling Price per kg from qc_grns (weighted avg, with carry-forward)
    - retail_sp_per_kg: Retail Selling Price per kg from retailer_dispatches (weighted avg, with carry-forward)
    - unit: Product unit
    - last_updated: Most recent update timestamp
    - pp_change: Change in PP vs previous day (positive = increase, negative = decrease)
    """
    
    # Verify admin access (same as backfill endpoint)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d")
        target_date_str = date
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get previous day for delta calculation
    prev_date = (target_date - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Get all products
    products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1}).to_list(500)
    product_map = {p["name"]: {"id": p.get("id"), "unit": p.get("unit", "Kg")} for p in products}
    
    # Also get product names from daily_cogs that might not be in products collection
    cogs_products = await db.daily_cogs.distinct("product_name")
    for pname in cogs_products:
        if pname not in product_map:
            product_map[pname] = {"id": None, "unit": "Kg"}
    
    # Get PP/kg from daily_cogs for target date and previous dates (for carry-forward)
    # We look back up to 30 days
    start_lookback = (target_date - timedelta(days=30)).strftime("%Y-%m-%d")
    
    cogs_records = await db.daily_cogs.find(
        {"date": {"$gte": start_lookback, "$lte": target_date_str}},
        {"_id": 0, "product_name": 1, "date": 1, "daily_cogs": 1, "updated_at": 1}
    ).sort("date", -1).to_list(10000)
    
    # Build PP map with carry-forward
    pp_by_product = {}  # {product_name: {"value": pp, "date": date, "updated_at": ts}}
    pp_prev_by_product = {}  # Previous day's PP for delta calculation
    
    for cogs in cogs_records:
        pname = cogs.get("product_name")
        cogs_date = cogs.get("date", "")
        pp = cogs.get("daily_cogs", 0) or 0
        updated = cogs.get("updated_at", "")
        
        if pp <= 0:
            continue
            
        # For target date or earlier (carry-forward)
        if cogs_date <= target_date_str and pname not in pp_by_product:
            pp_by_product[pname] = {"value": pp, "date": cogs_date, "updated_at": updated}
        
        # For previous day PP (for delta)
        if cogs_date <= prev_date and pname not in pp_prev_by_product:
            pp_prev_by_product[pname] = pp
    
    # Get QC Selling Price from qc_grns
    # We need weighted average of rate_per_kg for the product on the date
    qc_grns = await db.qc_grns.find(
        {},
        {"_id": 0, "items": 1}
    ).to_list(5000)
    
    # Build QC SP map with carry-forward
    qc_sp_by_product_date = {}  # {(product_name, date): {"total_value": x, "total_qty": y}}
    
    for grn in qc_grns:
        for item in grn.get("items", []):
            pname = item.get("product_name")
            dispatch_date = (item.get("dispatch_date") or "")[:10]
            rate_per_kg = item.get("rate_per_kg", 0) or 0
            qty_kg = item.get("grn_qty_kg", 0) or 0
            
            if not pname or not dispatch_date or rate_per_kg <= 0 or qty_kg <= 0:
                continue
            
            key = (pname, dispatch_date)
            if key not in qc_sp_by_product_date:
                qc_sp_by_product_date[key] = {"total_value": 0, "total_qty": 0}
            qc_sp_by_product_date[key]["total_value"] += rate_per_kg * qty_kg
            qc_sp_by_product_date[key]["total_qty"] += qty_kg
    
    # Find QC SP for each product with carry-forward
    qc_sp_by_product = {}
    all_qc_dates = sorted(set(d for (_, d) in qc_sp_by_product_date.keys()), reverse=True)
    
    for pname in product_map.keys():
        # Find most recent date <= target_date with QC data
        for d in all_qc_dates:
            if d <= target_date_str:
                key = (pname, d)
                if key in qc_sp_by_product_date:
                    data = qc_sp_by_product_date[key]
                    if data["total_qty"] > 0:
                        qc_sp_by_product[pname] = {
                            "value": round(data["total_value"] / data["total_qty"], 2),
                            "date": d
                        }
                        break
    
    # Get Retail Selling Price from retailer_dispatches
    # We need weighted average of sell price per kg
    retail_dispatches = await db.retailer_dispatches.find(
        {"dispatch_date": {"$lte": target_date_str + "T23:59:59"}},
        {"_id": 0, "dispatch_date": 1, "items": 1}
    ).to_list(5000)
    
    # Get packaging weights for kg conversion
    packagings = await db.qc_packaging.find({}, {"_id": 0, "name": 1, "weight_gm": 1}).to_list(500)
    packaging_weights = {p["name"].lower().strip(): p.get("weight_gm", 0) for p in packagings}
    
    # Build Retail SP map
    retail_sp_by_product_date = {}  # {(product_name, date): {"total_value": x, "total_qty_kg": y}}
    
    for dispatch in retail_dispatches:
        dispatch_date = (dispatch.get("dispatch_date") or "")[:10]
        if not dispatch_date:
            continue
            
        for item in dispatch.get("items", []):
            pname = item.get("product_name")
            mrp = item.get("mrp", 0) or 0
            qty = item.get("supplied_qty", 0) or 0
            variant_name = (item.get("variant_name") or "").lower().strip()
            
            if not pname or mrp <= 0 or qty <= 0:
                continue
            
            # Convert to kg
            weight_gm = packaging_weights.get(variant_name, 0)
            if weight_gm <= 0:
                # Try to extract from variant name
                import re
                match = re.search(r'(\d+)\s*(?:gm|g|gram)', variant_name, re.IGNORECASE)
                if match:
                    weight_gm = int(match.group(1))
                else:
                    weight_gm = 1000  # Default to 1 kg
            
            qty_kg = (qty * weight_gm) / 1000
            total_value = item.get("total_value", 0) or (mrp * qty)
            
            key = (pname, dispatch_date)
            if key not in retail_sp_by_product_date:
                retail_sp_by_product_date[key] = {"total_value": 0, "total_qty_kg": 0}
            retail_sp_by_product_date[key]["total_value"] += total_value
            retail_sp_by_product_date[key]["total_qty_kg"] += qty_kg
    
    # Find Retail SP for each product with carry-forward
    retail_sp_by_product = {}
    all_retail_dates = sorted(set(d for (_, d) in retail_sp_by_product_date.keys()), reverse=True)
    
    for pname in product_map.keys():
        for d in all_retail_dates:
            if d <= target_date_str:
                key = (pname, d)
                if key in retail_sp_by_product_date:
                    data = retail_sp_by_product_date[key]
                    if data["total_qty_kg"] > 0:
                        retail_sp_by_product[pname] = {
                            "value": round(data["total_value"] / data["total_qty_kg"], 2),
                            "date": d
                        }
                        break
    
    # ====================================================================
    # AA-backend: Get Retail Invoice Date from retailer_invoices
    # This is used by frontend's Retail sub-tab to filter "sold today" by invoice date
    # Keep retail_sp_date (dispatch-based) intact for other consumers
    # ====================================================================
    retail_invoices = await db.retailer_invoices.find(
        {"invoice_date": {"$regex": f"^{target_date_str}"}},
        {"_id": 0, "invoice_date": 1, "items": 1}
    ).to_list(length=None)
    
    # Build Retail Invoice SP map (same weighted-average pattern as dispatches)
    retail_invoice_sp_by_product = {}  # {product_name: {"total_value": x, "total_qty_kg": y}}
    retail_invoice_date_by_product = {}  # {product_name: invoice_date}
    
    for invoice in retail_invoices:
        invoice_date = (invoice.get("invoice_date") or "")[:10]
        if not invoice_date:
            continue
        
        for item in invoice.get("items", []):
            pname = item.get("product_name")
            # Use item's value fields - try multiple field names for compatibility
            mrp = item.get("mrp", 0) or item.get("rate", 0) or 0
            qty = item.get("supplied_qty", 0) or item.get("quantity", 0) or 0
            variant_name = (item.get("variant_name") or item.get("packaging_name") or "").lower().strip()
            
            if not pname or mrp <= 0 or qty <= 0:
                continue
            
            # Convert to kg using same logic as dispatches
            weight_gm = packaging_weights.get(variant_name, 0)
            if weight_gm <= 0:
                # Try to extract from variant name
                import re
                match = re.search(r'(\d+)\s*(?:gm|g|gram)', variant_name, re.IGNORECASE)
                if match:
                    weight_gm = int(match.group(1))
                else:
                    weight_gm = 1000  # Default to 1 kg
            
            qty_kg = (qty * weight_gm) / 1000
            total_value = item.get("total_value", 0) or item.get("amount", 0) or (mrp * qty)
            
            if pname not in retail_invoice_sp_by_product:
                retail_invoice_sp_by_product[pname] = {"total_value": 0, "total_qty_kg": 0}
            retail_invoice_sp_by_product[pname]["total_value"] += total_value
            retail_invoice_sp_by_product[pname]["total_qty_kg"] += qty_kg
            
            # Track the invoice date for this product
            retail_invoice_date_by_product[pname] = invoice_date
    
    # Build result
    result = []
    
    for pname, pinfo in sorted(product_map.items()):
        pp_data = pp_by_product.get(pname, {})
        qc_data = qc_sp_by_product.get(pname, {})
        retail_data = retail_sp_by_product.get(pname, {})
        
        pp_value = pp_data.get("value", 0)
        pp_prev = pp_prev_by_product.get(pname, 0)
        pp_change = round(pp_value - pp_prev, 2) if pp_value > 0 and pp_prev > 0 else None
        
        # Determine last updated (most recent of all sources)
        dates = []
        if pp_data.get("date"):
            dates.append(pp_data["date"])
        if qc_data.get("date"):
            dates.append(qc_data["date"])
        if retail_data.get("date"):
            dates.append(retail_data["date"])
        
        last_updated = max(dates) if dates else None
        
        # Only include products that have at least one data point
        if pp_value > 0 or qc_data.get("value", 0) > 0 or retail_data.get("value", 0) > 0:
            result.append({
                "product_name": pname,
                "product_id": pinfo.get("id"),
                "unit": pinfo.get("unit", "Kg"),
                "pp_per_kg": round(pp_value, 2) if pp_value > 0 else None,
                "pp_date": pp_data.get("date"),
                "pp_change": pp_change,
                "qc_sp_per_kg": qc_data.get("value"),
                "qc_sp_date": qc_data.get("date"),
                "retail_sp_per_kg": retail_data.get("value"),
                "retail_sp_date": retail_data.get("date"),
                "retail_invoice_date": retail_invoice_date_by_product.get(pname),  # AA-backend: invoice-based date for Retail tab
                "last_updated": last_updated
            })
    
    # Sort by product name
    result.sort(key=lambda x: x["product_name"])
    
    return {
        "date": target_date_str,
        "products": result,
        "total_products": len(result)
    }
