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
    from fastapi import HTTPException
    products = set()
    
    try:
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
    except Exception as e:
        logging.error(f"Database error in get_all_products: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable - failed to fetch products")
    
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
    """Get sales qty (in Kg) by product for a specific date.
    
    For combo products, this decomposes them into their base ingredients
    and adds the ingredient quantities to the base products instead of
    recording under the combo name. This prevents double-counting and
    ensures base product stock/wastage calculations are correct.
    """
    from routes.combo_utils import is_combo_product, parse_combo_product, normalize_ingredient_name
    
    product_sales = {}  # {product: qty_kg}
    
    # Helper to parse packaging weight from variant name
    # For ranges like "90-110 gm", use the midpoint instead of lower bound
    def get_packaging_weight_gm(unit_str):
        if not unit_str:
            return 0
        unit_lower = str(unit_str).lower()
        import re
        
        # Check for range pattern first (e.g., "90-110 gm", "200-250 gm")
        range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(?:gm|g)\b', unit_lower)
        if range_match:
            low = int(range_match.group(1))
            high = int(range_match.group(2))
            return (low + high) // 2  # Use midpoint
        
        # Single value with optional + (e.g., "100+ gm", "250 gm")
        gm_match = re.search(r'(\d+)\+?\s*(?:gm|g)\b', unit_lower)
        if gm_match:
            return int(gm_match.group(1))
        
        # Kg pattern
        kg_match = re.search(r'(\d+(?:\.\d+)?)\s*kg', unit_lower)
        if kg_match:
            return float(kg_match.group(1)) * 1000
        
        # Handle Half Dozen and Dozen variants
        if 'half dozen' in unit_lower or 'half-dozen' in unit_lower:
            return 500
        elif 'dozen' in unit_lower and 'half' not in unit_lower:
            return 1000
        
        if 'bunch' in unit_lower:
            return 100
        return 0
    
    # Helper to add sales quantity, decomposing combos into base ingredients
    def add_sales_qty(product_name: str, qty_packs: float, variant_name: str):
        """Add sales quantity to the appropriate products.
        
        For combo products, decompose into base ingredients.
        For regular products, add directly.
        """
        if is_combo_product(product_name):
            # Decompose combo into base ingredients
            combo_info = parse_combo_product(product_name)
            if combo_info and combo_info.get('ingredients'):
                for ingredient in combo_info['ingredients']:
                    ing_name = ingredient.get('name', '')
                    weight_gm = ingredient.get('weight_gm', 0)
                    
                    if ing_name and weight_gm > 0:
                        # Calculate ingredient kg: qty_packs * (weight_gm / 1000)
                        ingredient_qty_kg = qty_packs * (weight_gm / 1000)
                        
                        if ing_name not in product_sales:
                            product_sales[ing_name] = 0
                        product_sales[ing_name] += ingredient_qty_kg
            # Do NOT add combo to product_sales - it has no base stock
        else:
            # Regular product - convert to Kg based on packaging
            packaging_gm = get_packaging_weight_gm(variant_name)
            if packaging_gm > 0:
                qty_kg = qty_packs * (packaging_gm / 1000)
            else:
                qty_kg = qty_packs  # Assume already in Kg
            
            if product_name not in product_sales:
                product_sales[product_name] = 0
            product_sales[product_name] += qty_kg
    
    # Retailer dispatches
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$regex": f"^{date_str}"}
    }, {"_id": 0}).to_list(1000)
    
    for dispatch in retailer_dispatches:
        for item in dispatch.get("items", []):
            product = item.get("product_name", "Unknown")
            qty = item.get("supplied_qty", 0) or 0
            variant = item.get("variant_name", "") or item.get("unit", "")
            add_sales_qty(product, qty, variant)
    
    # Ninjacart dispatches
    nc_dispatches = await db.ninjacart_dispatches.find({
        "dispatch_date": {"$regex": f"^{date_str}"}
    }, {"_id": 0}).to_list(1000)
    
    for dispatch in nc_dispatches:
        for item in dispatch.get("items", []):
            product = item.get("product_name", "Unknown")
            qty_kg = item.get("total_weight", 0) or item.get("quantity", 0) or 0
            
            # For ninjacart, already in Kg, but still check for combos
            if is_combo_product(product):
                # For combo in ninjacart, we need to estimate packs from total weight
                combo_info = parse_combo_product(product)
                if combo_info and combo_info.get('total_weight_gm', 0) > 0:
                    # qty_kg is total combo weight, convert to packs
                    pack_weight_kg = combo_info['total_weight_gm'] / 1000
                    qty_packs = qty_kg / pack_weight_kg if pack_weight_kg > 0 else 0
                    add_sales_qty(product, qty_packs, "")
            else:
                if product not in product_sales:
                    product_sales[product] = 0
                product_sales[product] += qty_kg
    
    # QC Dispatches - use dispatches instead of GRNs to match close_stock_status
    # NOTE: Do NOT decompose combos here - daily_stock_status already includes
    # combo ingredient dispatches via add_combo_ingredient_dispatches()
    qc_dispatches = await db.qc_dispatches.find({
        "dispatch_date": {"$regex": f"^{date_str}"}
    }, {"_id": 0}).to_list(10000)
    
    for dispatch in qc_dispatches:
        for item in dispatch.get("items", []):
            product = item.get("product_name", "Unknown")
            supplied_qty = item.get("supplied_qty", 0) or 0
            packaging_name = item.get("packaging_name", "") or item.get("product_unit", "")
            
            # Skip combo products - their ingredients are already counted in stock_status.dispatch_qty
            if is_combo_product(product):
                continue
            
            # Calculate qty_kg from packaging_name
            packaging_gm = get_packaging_weight_gm(packaging_name)
            if packaging_gm > 0:
                qty_kg = (supplied_qty * packaging_gm) / 1000
            else:
                qty_kg = supplied_qty  # Assume already in Kg
            
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
        # Previous day data - first try daily_stock_status for ground truth
        prev_date = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
        prev_stock_status = await db.daily_stock_status.find_one({
            "date": prev_date,
            "product_name": product,
            "status": "closed"
        })
        
        if prev_stock_status and prev_stock_status.get("closing_qty") is not None:
            # Use ground truth from daily_stock_status
            leftover_qty = prev_stock_status.get("closing_qty", 0) or 0
        else:
            # Fall back to computed end_of_day_stock from previous day
            prev = prev_day_data.get(product, {})
            leftover_qty = prev.get("end_of_day_stock", 0) or 0
        
        # Get previous COGS for pricing
        prev = prev_day_data.get(product, {})
        leftover_price = prev.get("daily_cogs", 0) or 0
        
        # Today's procurement
        proc = today_procurements.get(product, {})
        today_qty = proc.get("qty_kg", 0) or 0
        today_amount = proc.get("amount", 0) or 0
        
        # Combined
        combined_qty = leftover_qty + today_qty
        combined_amount = (leftover_qty * leftover_price) + today_amount
        
        # Daily COGS (weighted average) with sanity check
        # Maximum reasonable COGS for F&V business is Rs 5000/kg
        MAX_REASONABLE_COGS = 5000
        
        if combined_qty > 0:
            raw_cogs = combined_amount / combined_qty
            # Sanity check: cap absurd values that indicate data issues
            if raw_cogs > MAX_REASONABLE_COGS:
                logging.warning(f"[COGS_SANITY] {product} on {date_str}: raw COGS Rs {raw_cogs:.2f}/kg exceeds max. Using fallback.")
                daily_cogs = leftover_price if 0 < leftover_price <= MAX_REASONABLE_COGS else 0
            else:
                daily_cogs = raw_cogs
        else:
            # No inventory - use previous COGS or 0
            daily_cogs = leftover_price if 0 < leftover_price <= MAX_REASONABLE_COGS else 0
        
        # Sales and end of day stock
        sales_qty = today_sales.get(product, 0) or 0
        
        # Fetch wastage_qty from daily_stock_status for closed records
        wastage_qty = 0
        stock_status_record = await db.daily_stock_status.find_one({
            "date": date_str,
            "product_name": product,
            "status": "closed"
        })
        if stock_status_record:
            wastage_qty = stock_status_record.get("wastage_qty", 0) or 0
        
        end_of_day_stock = max(0, combined_qty - sales_qty - wastage_qty)
        
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
            "wastage_qty": round(wastage_qty, 3),
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


@router.get("")
async def get_all_daily_cogs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all daily_cogs records for sync purposes."""
    if current_user.get("role") not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    records = await db.daily_cogs.find({}, {"_id": 0}).to_list(50000)
    return records


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
    }, {"_id": 0, "product_name": 1, "date": 1, "daily_cogs": 1}).to_list(None)
    
    cogs_map = {}
    for rec in records:
        key = (rec["product_name"], rec["date"])
        cogs_map[key] = rec["daily_cogs"]
    
    return cogs_map



async def trigger_cogs_recompute_from_date(db: AsyncIOMotorDatabase, from_date: str):
    """
    Trigger COGS recompute from a specific date through today.
    Used for self-healing when procurements or stock status changes.
    
    Args:
        db: Database connection
        from_date: Start date in YYYY-MM-DD format
    
    This function runs asynchronously and logs errors but doesn't raise exceptions
    to avoid blocking the calling operation.
    """
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Don't process future dates
        if from_date > today:
            logging.info(f"[COGS_TRIGGER] Skipping future date {from_date}")
            return
        
        logging.info(f"[COGS_TRIGGER] Starting recompute from {from_date} to {today}")
        
        # Get all products once
        products = await get_all_products(db)
        
        # Recompute each day sequentially (order matters for carry-forward)
        current = datetime.strptime(from_date, "%Y-%m-%d")
        end = datetime.strptime(today, "%Y-%m-%d")
        dates_processed = 0
        
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            cogs_data = await compute_daily_cogs_for_date(db, date_str, products)
            await save_daily_cogs(db, cogs_data)
            dates_processed += 1
            current += timedelta(days=1)
        
        logging.info(f"[COGS_TRIGGER] Completed: recomputed {dates_processed} days from {from_date}")
        
    except Exception as e:
        logging.error(f"[COGS_TRIGGER] Error recomputing COGS from {from_date}: {e}")
        import traceback
        traceback.print_exc()
