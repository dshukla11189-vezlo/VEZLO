"""
Daily COGS Tracking Module

This module implements a persisted daily COGS snapshot system that tracks:
- Leftover inventory from previous day
- Today's procurements
- Combined COGS calculation using weighted average
- End of day stock after sales

Collection: daily_cogs
Document structure:
{
    "product_name": "Guava",
    "date": "2026-06-17",
    "leftover_qty": 10.0,      # Carried over from previous day
    "leftover_price": 50.0,    # COGS rate from previous day
    "today_qty": 20.0,         # Procured today (in Kg)
    "today_amount": 1200.0,    # Procurement cost today
    "combined_qty": 30.0,      # leftover_qty + today_qty
    "combined_amount": 1700.0, # leftover_qty*leftover_price + today_amount
    "daily_cogs": 56.67,       # combined_amount / combined_qty (per Kg)
    "sales_qty": 15.0,         # Sold today (in Kg)
    "end_of_day_stock": 15.0,  # combined_qty - sales_qty (clamped >= 0)
    "updated_at": "2026-06-17T23:59:59"
}
"""

from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timedelta
import logging

router = APIRouter(prefix="/api/daily-cogs", tags=["Daily COGS"])

# Dependency to get database
async def get_db():
    from server import db
    return db

# Import get_current_user for auth
from dependencies import get_current_user


async def get_all_products(db: AsyncIOMotorDatabase) -> list:
    """Get all unique product names from procurements and dispatches."""
    products = set()
    
    # From procurements
    procurements = await db.procurements.find({}, {"products.product_name": 1, "_id": 0}).to_list(10000)
    for proc in procurements:
        for item in proc.get("products", []):
            if item.get("product_name"):
                products.add(item["product_name"])
    
    # From retailer dispatches
    dispatches = await db.retailer_dispatches.find({}, {"items.product_name": 1, "_id": 0}).to_list(10000)
    for disp in dispatches:
        for item in disp.get("items", []):
            if item.get("product_name"):
                products.add(item["product_name"])
    
    # From ninjacart dispatches
    nc_dispatches = await db.ninjacart_dispatches.find({}, {"items.product_name": 1, "_id": 0}).to_list(10000)
    for disp in nc_dispatches:
        for item in disp.get("items", []):
            if item.get("product_name"):
                products.add(item["product_name"])
    
    # From QC GRNs
    qc_grns = await db.qc_grns.find({}, {"items.product_name": 1, "_id": 0}).to_list(10000)
    for grn in qc_grns:
        for item in grn.get("items", []):
            if item.get("product_name"):
                products.add(item["product_name"])
    
    return sorted(list(products))


async def get_procurements_by_date(db: AsyncIOMotorDatabase, date_str: str) -> dict:
    """Get procurement totals by product for a specific date."""
    procurements = await db.procurements.find({
        "date": {"$regex": f"^{date_str}"}
    }, {"_id": 0}).to_list(1000)
    
    product_totals = {}  # {product: {qty_kg: X, amount: Y}}
    
    for proc in procurements:
        for item in proc.get("products", []):
            product = item.get("product_name", "Unknown")
            qty = item.get("quantity", 0) or 0
            total_amt = item.get("total", 0) or 0
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            
            # Convert to Kg if unit is Bunch/Piece/Packet etc.
            if unit.lower() in ["bunch", "piece", "pack", "packet", "box", "crate", "dozen"] and unit_size:
                try:
                    weight_per_unit_gm = float(unit_size)
                    qty = (qty * weight_per_unit_gm) / 1000
                except (ValueError, TypeError):
                    pass
            
            if product not in product_totals:
                product_totals[product] = {"qty_kg": 0, "amount": 0}
            product_totals[product]["qty_kg"] += qty
            product_totals[product]["amount"] += total_amt
    
    return product_totals


async def get_sales_by_date(db: AsyncIOMotorDatabase, date_str: str) -> dict:
    """Get sales qty (in Kg) by product for a specific date."""
    product_sales = {}  # {product: qty_kg}
    
    # Helper to parse packaging weight from variant name
    def get_packaging_weight_gm(unit_str):
        if not unit_str:
            return 0
        unit_lower = str(unit_str).lower()
        import re
        gm_match = re.search(r'(\d+)\+?\s*gm', unit_lower)
        if gm_match:
            return int(gm_match.group(1))
        kg_match = re.search(r'(\d+(?:\.\d+)?)\s*kg', unit_lower)
        if kg_match:
            return float(kg_match.group(1)) * 1000
        if 'bunch' in unit_lower:
            return 100
        return 0
    
    # Retailer dispatches
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$regex": f"^{date_str}"}
    }, {"_id": 0}).to_list(1000)
    
    for dispatch in retailer_dispatches:
        for item in dispatch.get("items", []):
            product = item.get("product_name", "Unknown")
            qty = item.get("quantity", 0) or 0
            variant = item.get("variant_name", "") or item.get("unit", "")
            
            # Convert to Kg
            packaging_gm = get_packaging_weight_gm(variant)
            if packaging_gm > 0:
                qty_kg = qty * (packaging_gm / 1000)
            else:
                qty_kg = qty  # Assume already in Kg
            
            if product not in product_sales:
                product_sales[product] = 0
            product_sales[product] += qty_kg
    
    # Ninjacart dispatches
    nc_dispatches = await db.ninjacart_dispatches.find({
        "dispatch_date": {"$regex": f"^{date_str}"}
    }, {"_id": 0}).to_list(1000)
    
    for dispatch in nc_dispatches:
        for item in dispatch.get("items", []):
            product = item.get("product_name", "Unknown")
            qty_kg = item.get("total_weight", 0) or item.get("quantity", 0) or 0
            
            if product not in product_sales:
                product_sales[product] = 0
            product_sales[product] += qty_kg
    
    # QC GRNs - iterate each grn's items, filter by dispatch_date matching date_str
    qc_grns = await db.qc_grns.find({}, {"_id": 0}).to_list(5000)
    
    for grn in qc_grns:
        for item in grn.get("items", []):
            # Filter by dispatch_date matching date_str
            item_dispatch_date = item.get("dispatch_date", "")
            if not item_dispatch_date or not item_dispatch_date.startswith(date_str):
                continue
            
            product = item.get("product_name", "Unknown")
            grn_qty = item.get("grn_qty", 0) or 0
            packaging_weight_gm = item.get("packaging_weight_gm", 0) or 0
            grn_qty_kg = item.get("grn_qty_kg", 0) or 0
            
            # Calculate qty_kg: (grn_qty × packaging_weight_gm) / 1000
            # Fallback chain: packaging_weight_gm -> grn_qty_kg -> grn_qty as-is
            if packaging_weight_gm > 0:
                qty_kg = (grn_qty * packaging_weight_gm) / 1000
            elif grn_qty_kg > 0:
                qty_kg = grn_qty_kg
            else:
                qty_kg = grn_qty  # Assume already in Kg
            
            if product not in product_sales:
                product_sales[product] = 0
            product_sales[product] += qty_kg
    
    return product_sales


async def compute_daily_cogs_for_date(db: AsyncIOMotorDatabase, date_str: str, products: list = None) -> dict:
    """
    Compute daily COGS for all products on a specific date.
    
    Formula:
    - leftover_qty, leftover_price = from previous day's end_of_day_stock and daily_cogs
    - today_qty, today_amount = from today's procurements
    - combined_qty = leftover_qty + today_qty
    - combined_amount = leftover_qty * leftover_price + today_amount
    - daily_cogs = combined_amount / combined_qty (if combined_qty > 0)
    - end_of_day_stock = max(0, combined_qty - sales_qty)
    """
    if products is None:
        products = await get_all_products(db)
    
    # Get previous day
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    prev_date_str = (date_obj - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Get previous day's data
    prev_day_data = {}
    prev_records = await db.daily_cogs.find({"date": prev_date_str}, {"_id": 0}).to_list(1000)
    for rec in prev_records:
        prev_day_data[rec["product_name"]] = rec
    
    # Get today's procurements and sales
    today_procurements = await get_procurements_by_date(db, date_str)
    today_sales = await get_sales_by_date(db, date_str)
    
    results = {}
    
    for product in products:
        # Previous day data
        prev = prev_day_data.get(product, {})
        leftover_qty = prev.get("end_of_day_stock", 0) or 0
        leftover_price = prev.get("daily_cogs", 0) or 0
        
        # Today's procurement
        proc = today_procurements.get(product, {})
        today_qty = proc.get("qty_kg", 0) or 0
        today_amount = proc.get("amount", 0) or 0
        
        # Combined
        combined_qty = leftover_qty + today_qty
        combined_amount = (leftover_qty * leftover_price) + today_amount
        
        # Daily COGS (weighted average)
        if combined_qty > 0:
            daily_cogs = combined_amount / combined_qty
        else:
            # No inventory - use previous COGS or 0
            daily_cogs = leftover_price if leftover_price > 0 else 0
        
        # Sales and end of day stock
        sales_qty = today_sales.get(product, 0) or 0
        end_of_day_stock = max(0, combined_qty - sales_qty)
        
        results[product] = {
            "product_name": product,
            "date": date_str,
            "leftover_qty": round(leftover_qty, 3),
            "leftover_price": round(leftover_price, 2),
            "today_qty": round(today_qty, 3),
            "today_amount": round(today_amount, 2),
            "combined_qty": round(combined_qty, 3),
            "combined_amount": round(combined_amount, 2),
            "daily_cogs": round(daily_cogs, 2),
            "sales_qty": round(sales_qty, 3),
            "end_of_day_stock": round(end_of_day_stock, 3),
            "updated_at": datetime.utcnow().isoformat()
        }
    
    return results


async def save_daily_cogs(db: AsyncIOMotorDatabase, cogs_data: dict):
    """Save/update daily COGS records for a date."""
    for product, data in cogs_data.items():
        await db.daily_cogs.update_one(
            {"product_name": product, "date": data["date"]},
            {"$set": data},
            upsert=True
        )


@router.post("/backfill")
async def backfill_daily_cogs(
    from_date: str = None,
    to_date: str = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Backfill the daily_cogs collection for a date range.
    Processes dates sequentially to ensure proper carryover.
    Requires admin role.
    """
    # Check admin role
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        # Default to last 90 days if not specified
        if not to_date:
            to_date = datetime.utcnow().strftime("%Y-%m-%d")
        if not from_date:
            from_date = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
        
        # Get all products
        products = await get_all_products(db)
        logging.info(f"[BACKFILL] Found {len(products)} products")
        
        # Generate date range
        start_date = datetime.strptime(from_date, "%Y-%m-%d")
        end_date = datetime.strptime(to_date, "%Y-%m-%d")
        
        dates_processed = 0
        current_date = start_date
        
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            
            # Compute and save daily COGS
            cogs_data = await compute_daily_cogs_for_date(db, date_str, products)
            await save_daily_cogs(db, cogs_data)
            
            dates_processed += 1
            current_date += timedelta(days=1)
        
        # Create index for efficient lookups
        await db.daily_cogs.create_index([("product_name", 1), ("date", 1)], unique=True)
        await db.daily_cogs.create_index([("date", 1)])
        
        return {
            "success": True,
            "from_date": from_date,
            "to_date": to_date,
            "dates_processed": dates_processed,
            "products_count": len(products)
        }
    except Exception as e:
        logging.error(f"[BACKFILL] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update/{date_str}")
async def update_daily_cogs_for_date(
    date_str: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update daily COGS for a specific date and all subsequent dates. Requires admin role."""
    # Check admin role
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        products = await get_all_products(db)
        
        # Also update subsequent dates since carryover changes
        today = datetime.utcnow().strftime("%Y-%m-%d")
        start_date = datetime.strptime(date_str, "%Y-%m-%d")
        end_date = datetime.strptime(today, "%Y-%m-%d")
        
        dates_updated = 0
        current_date = start_date
        
        while current_date <= end_date:
            d_str = current_date.strftime("%Y-%m-%d")
            cogs_data = await compute_daily_cogs_for_date(db, d_str, products)
            await save_daily_cogs(db, cogs_data)
            dates_updated += 1
            current_date += timedelta(days=1)
        
        return {
            "success": True,
            "date": date_str,
            "dates_updated": dates_updated
        }
    except Exception as e:
        logging.error(f"[UPDATE] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lookup/{date_str}")
async def get_daily_cogs_for_date(
    date_str: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get daily COGS for all products on a specific date."""
    records = await db.daily_cogs.find({"date": date_str}, {"_id": 0}).to_list(1000)
    return {
        "date": date_str,
        "products": {rec["product_name"]: rec for rec in records}
    }


@router.get("/product/{product_name}")
async def get_product_cogs_history(
    product_name: str,
    from_date: str = None,
    to_date: str = None,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get COGS history for a specific product."""
    query = {"product_name": product_name}
    if from_date or to_date:
        query["date"] = {}
        if from_date:
            query["date"]["$gte"] = from_date
        if to_date:
            query["date"]["$lte"] = to_date
    
    records = await db.daily_cogs.find(query, {"_id": 0}).sort("date", -1).to_list(365)
    return {
        "product_name": product_name,
        "records": records
    }


# Helper function to be used by dashboard_analytics.py
async def get_daily_cogs_map(db: AsyncIOMotorDatabase, from_date: str, to_date: str) -> dict:
    """
    Get a map of daily COGS for all products in the date range.
    Returns: {(product_name, date): daily_cogs_rate}
    """
    records = await db.daily_cogs.find({
        "date": {"$gte": from_date, "$lte": to_date}
    }, {"_id": 0, "product_name": 1, "date": 1, "daily_cogs": 1}).to_list(10000)
    
    cogs_map = {}
    for rec in records:
        key = (rec["product_name"], rec["date"])
        cogs_map[key] = rec["daily_cogs"]
    
    return cogs_map
