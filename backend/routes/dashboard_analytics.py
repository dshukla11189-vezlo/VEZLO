"""
Dashboard & Analytics Routes
============================
Extracted from server.py for modular organization.
Handles dashboard stats, reports, analytics, daily purchase requirements,
retailer indents, dispatches, invoices, closing inventory, stickers & MRP,
auto-indent generation, and more.
"""
from fastapi import APIRouter, HTTPException, Depends, Response, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any
import uuid
import asyncio
import io
import re
import calendar
from collections import defaultdict

from dependencies import (
    db,
    get_current_user,
    logger,
    HINDI_PRODUCT_NAMES,
    MARATHI_PRODUCT_NAMES,
)
from models import StockClosingEntry, StockClosingBulkEntry
from routes.qc_grn import calculate_grn_loss
from routes.products_packaging import extract_weight_from_packaging_name
from routes.daily_cogs import get_daily_cogs_map
from routes.combo_utils import (
    is_combo_product,
    parse_combo_product,
    calculate_combo_cogs,
    calculate_combo_wastage_share,
)

router = APIRouter(tags=["dashboard_analytics"])

# SECTION: DASHBOARD & ANALYTICS ROUTES (Lines ~1839-2480)
# ============================================================================
@router.get("/reports/dashboard")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Total products
    total_products = await db.products.count_documents({})
    
    # Total stock value
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    total_stock_value = sum((p.get("current_stock", 0) or 0) * (p.get("price_per_kg", 0) or 0) for p in products)
    
    # Today's orders
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_qc = await db.qc_orders.count_documents({"order_date": {"$gte": today.isoformat()}})
    today_retailer = await db.retailer_orders.count_documents({"order_date": {"$gte": today.isoformat()}})
    
    # Pending payments
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)
    pending_payments = sum(inv.get("pending_amount", 0) for inv in invoices)
    
    # Today's wastage
    wastages = await db.wastage.find({"date": {"$gte": today.isoformat()}}, {"_id": 0}).to_list(1000)
    today_wastage = sum(sum(item.get("quantity", 0) for item in w.get("products", [])) for w in wastages)
    
    return {
        "total_products": total_products,
        "total_stock_value": round(total_stock_value, 2),
        "today_qc_orders": today_qc,
        "today_retailer_orders": today_retailer,
        "pending_payments": round(pending_payments, 2),
        "today_wastage": round(today_wastage, 2)
    }

@router.get("/reports/today-summary")
async def get_today_summary(current_user: dict = Depends(get_current_user)):
    """Get today's quick summary for dashboard widget"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Today's dispatches
    dispatches = await db.qc_dispatches.find({
        "dispatch_date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(500)
    
    today_dispatch_count = len(dispatches)
    today_dispatch_value = 0
    product_sales = {}  # Track top selling products
    
    for d in dispatches:
        for item in d.get('items', []):
            qty = item.get('supplied_qty', 0) or 0
            rate = item.get('rate', 0) or 0
            amount = qty * rate
            today_dispatch_value += amount
            
            product_name = item.get('product_name', 'Unknown')
            if product_name not in product_sales:
                product_sales[product_name] = {"qty": 0, "amount": 0}
            product_sales[product_name]["qty"] += qty
            product_sales[product_name]["amount"] += amount
    
    # Today's Retailer Dispatches
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(500)
    
    today_retailer_dispatch_count = len(retailer_dispatches)
    today_retailer_value = sum(d.get('net_payable', 0) or 0 for d in retailer_dispatches)
    
    # Add retailer products to top products
    for d in retailer_dispatches:
        for item in d.get('items', []):
            qty = item.get('supplied_qty', 0) or 0
            amount = item.get('total_value', 0) or 0
            product_name = item.get('product_name', 'Unknown')
            if product_name not in product_sales:
                product_sales[product_name] = {"qty": 0, "amount": 0}
            product_sales[product_name]["qty"] += qty
            product_sales[product_name]["amount"] += amount
    
    # Pending indents (QC + Retailer)
    pending_qc_indents = await db.qc_indents.count_documents({
        "status": {"$in": ["pending", "partial"]}
    })
    pending_retailer_indents = await db.retailer_indents.count_documents({
        "status": {"$in": ["pending", "partial"]}
    })
    pending_indents = pending_qc_indents + pending_retailer_indents
    
    # Today's procurements
    procurements = await db.procurements.find({
        "date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(500)
    
    today_procurement_count = len(procurements)
    today_procurement_value = sum(p.get('total_amount', 0) or 0 for p in procurements)
    
    # Top 5 selling products today
    top_products = sorted(
        [{"name": k, **v} for k, v in product_sales.items()],
        key=lambda x: x["amount"],
        reverse=True
    )[:5]
    
    # Recent activity - last 5 dispatches/procurements
    recent_activity = []
    
    for d in dispatches[:3]:
        total_items = sum(item.get('supplied_qty', 0) for item in d.get('items', []))
        recent_activity.append({
            "type": "dispatch",
            "customer": d.get('customer_name', 'Unknown'),
            "items": total_items,
            "time": d.get('dispatch_time', '')
        })
    
    for p in procurements[:2]:
        recent_activity.append({
            "type": "procurement",
            "farmer": p.get('farmer_name', 'Unknown'),
            "amount": p.get('total_amount', 0),
            "time": ""
        })
    
    return {
        "today_dispatches": today_dispatch_count,
        "today_dispatch_value": round(today_dispatch_value, 2),
        "pending_indents": pending_indents,
        "today_procurements": today_procurement_count,
        "today_procurement_value": round(today_procurement_value, 2),
        "top_products": top_products,
        "recent_activity": recent_activity[:5]
    }

@router.get("/reports/pnl")
async def get_pnl_report(
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get comprehensive P&L report with daily breakdown and customer-wise analysis"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Default to current month if no dates provided
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(day=1).strftime('%Y-%m-%d')
    if not to_date:
        to_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Fetch daily COGS map for the date range (persisted daily snapshots)
    # This gives us date-specific COGS instead of overall average
    # Use a wider date range (30 days before from_date) to ensure fallback data for combo COGS
    from datetime import datetime, timedelta
    try:
        from_date_obj = datetime.strptime(from_date, "%Y-%m-%d")
        extended_from_date = (from_date_obj - timedelta(days=30)).strftime("%Y-%m-%d")
    except:
        extended_from_date = from_date
    daily_cogs_map = await get_daily_cogs_map(db, extended_from_date, to_date)
    
    # Sales by customer
    sales_by_customer = {}
    sales_by_date = {}
    sales_by_product = {}
    # Product-level breakdown per date with customer info
    product_by_date = {}  # {date: {product: {sales, purchase, wastage, qty, customers: []}}}
    # NEW: Detailed line items per date for Customer->Product breakdown
    line_items_by_date = {}  # {date: [line_item, ...]}
    # Track GRN loss per date (difference between dispatched and received)
    grn_loss_by_date = {}  # {date: {value: X, qty_kg: Y}}
    total_sales = 0
    total_sales_qty = 0
    
    # ========== QC SALES (from GRN - actual received values) ==========
    qc_grns = await db.qc_grns.find({}, {"_id": 0}).to_list(1000)
    
    for grn in qc_grns:
        customer = grn.get("customer_name", "Unknown")
        
        for item in grn.get("items", []):
            # Use dispatch_date from item (actual delivery date) instead of grn_date (recording date)
            item_dispatch_date = item.get("dispatch_date", "")[:10]
            
            # Skip if outside date range
            if not item_dispatch_date or item_dispatch_date < from_date or item_dispatch_date > to_date:
                continue
            
            # Use GRN amount (actual received value)
            amount = item.get("amount", 0) or 0
            qty = item.get("grn_qty", 0) or item.get("supplied_qty", 0) or 0
            supplied_qty_units = item.get("supplied_qty", 0) or qty
            product = item.get("product_name", "Unknown")
            unit = item.get("packaging_name", "") or item.get("product_unit", "Kg")
            packaging_weight_gm = item.get("packaging_weight_gm", 0) or 0
            
            # If packaging_weight_gm not set, try to extract from packaging name
            if not packaging_weight_gm and unit:
                import re
                weight_match = re.search(r'(\d+)(?:\s*-\s*\d+)?\s*(?:gm|g)\b', unit.lower())
                if weight_match:
                    packaging_weight_gm = float(weight_match.group(1))
            
            rate_per_kg = item.get("rate_per_kg", 0) or 0
            rate_per_unit = item.get("rate_per_unit", 0) or 0
            
            # Initialize date bucket if needed
            if item_dispatch_date not in sales_by_date:
                sales_by_date[item_dispatch_date] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "variable_exp": 0, "fixed_exp": 0, "qc_sales": 0, "retail_sales": 0}
            if item_dispatch_date not in product_by_date:
                product_by_date[item_dispatch_date] = {}
            if item_dispatch_date not in line_items_by_date:
                line_items_by_date[item_dispatch_date] = []
            
            if customer not in sales_by_customer:
                sales_by_customer[customer] = {"amount": 0, "qty": 0, "invoices": 0, "type": "QC", "sales_dates": set()}
            
            # Calculate kg from DISPATCH qty (what was sent), not GRN qty (what was received)
            # Use supplied_qty for wastage distribution as it represents what was dispatched
            dispatch_qty_units = item.get("supplied_qty", 0) or qty
            if packaging_weight_gm > 0:
                # Convert dispatch units to kg
                supplied_kg = (dispatch_qty_units * packaging_weight_gm) / 1000
            else:
                # If no packaging weight, assume supplied_qty is already in kg
                supplied_kg = dispatch_qty_units
            
            # Also track GRN qty for loss calculation
            grn_qty_kg = item.get("grn_qty_kg", 0) or 0
            grn_qty_pcs = item.get("grn_qty", 0) or 0
            
            # Calculate grn_qty_kg if not directly available
            if grn_qty_kg == 0 and packaging_weight_gm > 0:
                # Use grn_qty (piece count) to calculate kg if available
                if grn_qty_pcs > 0:
                    grn_qty_kg = (grn_qty_pcs * packaging_weight_gm) / 1000
                else:
                    # If no grn_qty, assume no loss (grn_qty_kg = supplied_kg)
                    grn_qty_kg = supplied_kg
            
            total_sales += amount
            total_sales_qty += supplied_kg  # Use kg for consistent comparison with purchase_qty
            sales_by_customer[customer]["amount"] += amount
            sales_by_customer[customer]["qty"] += supplied_kg  # Normalize to kg
            sales_by_customer[customer]["sales_dates"].add(item_dispatch_date)  # Track unique sales dates
            sales_by_date[item_dispatch_date]["sales"] += amount
            sales_by_date[item_dispatch_date]["sales_qty"] += supplied_kg  # Normalize to kg
            sales_by_date[item_dispatch_date]["qc_sales"] = sales_by_date[item_dispatch_date].get("qc_sales", 0) + amount
            
            if product not in sales_by_product:
                sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
            sales_by_product[product]["sales_amount"] += amount
            sales_by_product[product]["sales_qty"] += supplied_kg  # Normalize to kg
            
            # Product breakdown per date with customer tracking
            if product not in product_by_date[item_dispatch_date]:
                product_by_date[item_dispatch_date][product] = {"sales": 0, "sales_qty": 0, "sales_kg": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
            product_by_date[item_dispatch_date][product]["sales"] += amount
            product_by_date[item_dispatch_date][product]["sales_qty"] += supplied_kg  # Normalize to kg
            product_by_date[item_dispatch_date][product]["sales_kg"] += supplied_kg  # Use supplied kg for SP/Kg calculation
            # Track sales by customer for this product on this date
            if customer not in product_by_date[item_dispatch_date][product]["customers"]:
                product_by_date[item_dispatch_date][product]["customers"][customer] = {"sales": 0, "qty": 0}
            product_by_date[item_dispatch_date][product]["customers"][customer]["sales"] += amount
            product_by_date[item_dispatch_date][product]["customers"][customer]["qty"] += supplied_kg  # Normalize to kg
            
            # Add detailed line item for this customer-product combination
            # Check if this is a combo product
            qc_is_combo = is_combo_product(product)
            qc_combo_info = None
            qc_combo_cogs = 0
            qc_combo_cogs_breakdown = None
            
            if qc_is_combo:
                qc_combo_info = parse_combo_product(product)
                if qc_combo_info:
                    # Calculate combo COGS using daily_cogs_map
                    combo_cogs_result = calculate_combo_cogs(qc_combo_info, daily_cogs_map, item_dispatch_date)
                    if combo_cogs_result and combo_cogs_result.get('total_cogs_per_pack', 0) > 0:
                        qc_combo_cogs = combo_cogs_result['total_cogs_per_pack'] * dispatch_qty_units
                        qc_combo_cogs_breakdown = combo_cogs_result.get('ingredients_breakdown')
                        import logging
                        logging.info(f"[QC_COMBO_COGS] Product: {product[:50]}, Qty: {dispatch_qty_units}, COGS/pack: {combo_cogs_result['total_cogs_per_pack']}, Total COGS: {qc_combo_cogs}")
                        
                        # Update product_by_date purchase for combo products
                        product_by_date[item_dispatch_date][product]["purchase"] += qc_combo_cogs
                        product_by_date[item_dispatch_date][product]["purchase_qty"] += dispatch_qty_units
                        
                        # Update daily purchase totals for combo
                        sales_by_date[item_dispatch_date]["purchase"] = sales_by_date[item_dispatch_date].get("purchase", 0) + qc_combo_cogs
                        sales_by_date[item_dispatch_date]["purchase_qty"] = sales_by_date[item_dispatch_date].get("purchase_qty", 0) + dispatch_qty_units
                        
                        # Update product-level purchase tracking
                        if product not in sales_by_product:
                            sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
                        sales_by_product[product]["purchase_amount"] += qc_combo_cogs
                        sales_by_product[product]["purchase_qty"] += dispatch_qty_units
            
            line_items_by_date[item_dispatch_date].append({
                "customer": customer,
                "customer_type": "QC",
                "product": product,
                "unit": unit,
                "supplied_qty": round(dispatch_qty_units, 2),
                "supplied_kg": round(supplied_kg, 3),
                "revenue": round(amount, 2),
                "rate_per_kg": round(rate_per_kg, 2),
                "rate_per_unit": round(rate_per_unit, 2),
                # COGS - for combos use pre-calculated, for others will be calculated later
                "cogs": round(qc_combo_cogs, 2) if qc_is_combo else 0,
                "wastage_kg": 0,
                "wastage_value": 0,
                # Combo product detection for QC items
                "is_combo": qc_is_combo,
                "combo_info": qc_combo_info,
                "combo_cogs_breakdown": qc_combo_cogs_breakdown
            })
            # Note: GRN loss is now calculated by the shared calculate_grn_loss() function
        
        # Only count invoice if this customer had items in the date range
        if customer in sales_by_customer:
            sales_by_customer[customer]["invoices"] = sales_by_customer[customer].get("invoices", 0) + 1
    
    # ========== PRE-CALCULATE AVERAGE PURCHASE PRICES (for COGS) ==========
    # First, load products to get cost_alias mappings
    all_products = await db.products.find({}, {"_id": 0}).to_list(500)
    product_id_to_name = {p.get("id"): p.get("name") for p in all_products}
    product_name_to_id = {p.get("name"): p.get("id") for p in all_products}
    
    # Load packaging variants for weight lookup
    all_packaging = await db.qc_packaging.find({}, {"_id": 0}).to_list(500)
    packaging_weight_map = {}
    for pkg in all_packaging:
        pkg_name = (pkg.get("name") or "").strip().lower()
        pkg_weight = pkg.get("weight_gm", 0) or 0
        if pkg_name and pkg_weight > 0:
            packaging_weight_map[pkg_name] = pkg_weight
    
    # Build cost alias map: {product_name: aliased_product_name}
    # e.g., {"Spinach": "Palak"} means Spinach uses Palak's purchase cost
    cost_alias_map = {}
    # Also build reverse alias map: {aliased_product: [products_that_alias_to_it]}
    # e.g., {"Palak": ["Spinach"]} means Spinach is aliased to Palak
    reverse_alias_map = {}
    for p in all_products:
        alias_id = p.get("cost_alias_product_id")
        if alias_id and alias_id in product_id_to_name:
            alias_name = product_id_to_name[alias_id]
            cost_alias_map[p.get("name")] = alias_name
            # Build reverse map
            if alias_name not in reverse_alias_map:
                reverse_alias_map[alias_name] = []
            reverse_alias_map[alias_name].append(p.get("name"))
    
    # Fetch all procurements to calculate average purchase price per product
    all_procurements = await db.procurements.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    product_purchase_totals = {}  # {product: {amount: X, qty: Y}}
    for proc in all_procurements:
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
            
            if product not in product_purchase_totals:
                product_purchase_totals[product] = {"amount": 0, "qty": 0}
            product_purchase_totals[product]["amount"] += total_amt
            product_purchase_totals[product]["qty"] += qty
    
    # Calculate average price per Kg for each product
    avg_price_by_product = {}
    for product, data in product_purchase_totals.items():
        if data["qty"] > 0:
            avg_price_by_product[product] = data["amount"] / data["qty"]
        else:
            avg_price_by_product[product] = 0
    
    # ========== RETAILER SALES (from Retailer Dispatches - GROSS MRP) ==========
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    # Fetch all retailers to get company names
    all_retailers = await db.users.find({"role": "retailer"}, {"_id": 0}).to_list(500)
    retailer_company_map = {r.get("id"): r.get("company_name", r.get("name", "Unknown")) for r in all_retailers}
    
    # Fetch packagings to resolve UUID variant names
    all_packagings = await db.qc_packaging.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    packaging_id_to_name = {p.get("id"): p.get("name", "") for p in all_packagings}
    
    # Helper function to resolve variant name (handle UUIDs)
    def resolve_variant_name(variant_name_raw):
        if not variant_name_raw:
            return "Kg"
        # Check if it looks like a UUID
        import re
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
        if uuid_pattern.match(str(variant_name_raw)):
            # Try to resolve from packagings
            resolved = packaging_id_to_name.get(variant_name_raw, "")
            return resolved if resolved else variant_name_raw
        return variant_name_raw
    
    # Track QC vs Retail sales for bifurcation
    qc_sales_total = total_sales  # QC sales already calculated above
    qc_sales_qty = total_sales_qty
    retail_sales_total = 0
    retail_sales_qty = 0
    
    # Track retail-specific data
    retail_gross_mrp_by_date = {}  # Gross MRP before rejection/commission
    retail_rejection_by_date = {}  # Rejection value by date
    retail_commission_by_date = {}  # Commission by date
    retail_cogs_by_date = {}  # COGS for retail
    
    # Fetch all retailer rejections for the date range
    retailer_rejections = await db.retailer_rejections.find({
        "rejection_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    # Helper function to parse packaging weight from variant name (same logic as dispatch items)
    def get_packaging_weight_gm(unit_str):
        if not unit_str:
            return 0
        unit_lower = str(unit_str).lower()
        import re
        # Try to find explicit weight in variant name
        # Pattern: "500+ gm", "1 Kg", "250+gm", etc.
        gm_match = re.search(r'(\d+)\+?\s*gm', unit_lower)
        if gm_match:
            return int(gm_match.group(1))
        kg_match = re.search(r'(\d+(?:\.\d+)?)\s*kg', unit_lower)
        if kg_match:
            return float(kg_match.group(1)) * 1000
        # Fallback patterns
        if 'bunch' in unit_lower:
            return 100  # Bunch is typically ~100gm
        return 0
    
    # Group rejections by date AND by retailer_id for accurate per-customer tracking
    # Also calculate rejection at COGS using actual product purchase prices
    rejection_by_retailer = {}  # retailer_id -> rejection_value (at MRP)
    rejection_cogs_by_retailer = {}  # retailer_id -> rejection_cogs (at purchase price)
    rejection_by_date_retailer = {}  # {date}_{retailer_id} -> {value: mrp_value, cogs: cogs_value}
    rejection_by_product_line = {}  # {date}_{retailer_id}_{product}_{variant} -> {value, cogs, qty}
    
    # Helper to normalize product/variant key for matching
    def normalize_key(s):
        if not s:
            return ""
        # Convert to lowercase, strip whitespace, remove extra spaces
        return " ".join(str(s).lower().strip().split())
    
    for rej in retailer_rejections:
        rej_date = rej.get("rejection_date", "")[:10]
        product = rej.get("product_name", "")
        variant_name_raw = rej.get("variant_name", "")
        # Resolve variant_name in case it's stored as UUID
        variant_name = resolve_variant_name(variant_name_raw)
        quantity = rej.get("quantity", 0) or 0
        rejection_value = rej.get("rejection_value", 0) or 0
        retailer_id = rej.get("retailer_id", "")
        
        # Debug: Log rejection key components
        import logging
        logging.info(f"[REJECTION] date={rej_date}, retailer={retailer_id}, product='{product}', variant='{variant_name}' (raw: '{variant_name_raw}'), value={rejection_value}")
        
        # Calculate COGS for this rejection item
        packaging_weight_gm = get_packaging_weight_gm(variant_name)
        if packaging_weight_gm > 0:
            kg_rejected = quantity * (packaging_weight_gm / 1000)
        else:
            kg_rejected = quantity  # Fallback: assume qty is in kg
        
        # Look up purchase price - prioritize daily_cogs_map for date-specific COGS
        lookup_product = cost_alias_map.get(product, product)
        daily_cogs_key = (lookup_product, rej_date)
        if daily_cogs_key in daily_cogs_map and daily_cogs_map[daily_cogs_key] > 0:
            avg_purchase_price = daily_cogs_map[daily_cogs_key]
        else:
            # Fallback to avg_price_by_product
            avg_purchase_price = avg_price_by_product.get(lookup_product, 0)
            if avg_purchase_price == 0 and lookup_product != product:
                avg_purchase_price = avg_price_by_product.get(product, 0)
        
        rejection_cogs = kg_rejected * avg_purchase_price
        
        # Track by date (for daily_pnl totals)
        if rej_date not in retail_rejection_by_date:
            retail_rejection_by_date[rej_date] = {"qty": 0, "value": 0, "cogs": 0}
        retail_rejection_by_date[rej_date]["qty"] += quantity
        retail_rejection_by_date[rej_date]["value"] += rejection_value
        retail_rejection_by_date[rej_date]["cogs"] += rejection_cogs
        
        # Track by retailer_id (for customer_pnl totals)
        if retailer_id:
            if retailer_id not in rejection_by_retailer:
                rejection_by_retailer[retailer_id] = 0
                rejection_cogs_by_retailer[retailer_id] = 0
            rejection_by_retailer[retailer_id] += rejection_value
            rejection_cogs_by_retailer[retailer_id] += rejection_cogs
            
            # Track by date+retailer for exact customer-date lookup
            key = f"{rej_date}_{retailer_id}"
            if key not in rejection_by_date_retailer:
                rejection_by_date_retailer[key] = {"value": 0, "cogs": 0, "qty": 0}
            rejection_by_date_retailer[key]["value"] += rejection_value
            rejection_by_date_retailer[key]["cogs"] += rejection_cogs
            rejection_by_date_retailer[key]["qty"] += quantity
            
            # Track by date+retailer+product+variant for product-level line item lookup
            # Use normalized keys for consistent matching
            norm_product = normalize_key(product)
            norm_variant = normalize_key(variant_name)
            product_key = f"{rej_date}_{retailer_id}_{norm_product}_{norm_variant}"
            
            # Debug: Log the key being created
            import logging
            logging.info(f"[REJECTION_KEY] key='{product_key}', cogs={rejection_cogs}")
            
            if product_key not in rejection_by_product_line:
                rejection_by_product_line[product_key] = {"value": 0, "cogs": 0, "qty": 0}
            rejection_by_product_line[product_key]["value"] += rejection_value
            rejection_by_product_line[product_key]["cogs"] += rejection_cogs
            rejection_by_product_line[product_key]["qty"] += quantity
    
    for dispatch in retailer_dispatches:
        # Use company_name instead of retailer_name (owner's name)
        retailer_id = dispatch.get("retailer_id", "")
        company_name = retailer_company_map.get(retailer_id, dispatch.get("retailer_name", "Unknown"))
        customer = company_name + " (Retail)"
        dispatch_date = dispatch.get("dispatch_date", "")[:10]
        
        # Get GROSS MRP value (before commission deduction)
        gross_mrp = dispatch.get("total_mrp_value", 0) or 0
        commission_pct = dispatch.get("commission_percentage", 0) or 0
        
        # Calculate commission on gross MRP
        commission_amount = gross_mrp * commission_pct / 100
        
        if customer not in sales_by_customer:
            sales_by_customer[customer] = {"amount": 0, "qty": 0, "invoices": 0, "type": "Retail", "sales_dates": set(), "retailer_id": retailer_id}
        if dispatch_date not in sales_by_date:
            sales_by_date[dispatch_date] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "variable_exp": 0, "fixed_exp": 0, "qc_sales": 0, "retail_sales": 0, "retail_gross_mrp": 0, "retail_rejection": 0, "retail_rejection_qty": 0, "retail_commission": 0, "retail_cogs": 0}
        if dispatch_date not in product_by_date:
            product_by_date[dispatch_date] = {}
        if dispatch_date not in line_items_by_date:
            line_items_by_date[dispatch_date] = []
        
        # Initialize retail tracking for this date
        if dispatch_date not in retail_gross_mrp_by_date:
            retail_gross_mrp_by_date[dispatch_date] = 0
            retail_commission_by_date[dispatch_date] = 0
            retail_cogs_by_date[dispatch_date] = 0
        
        dispatch_qty = 0
        dispatch_cogs = 0
        for item in dispatch.get("items", []):
            qty = item.get("supplied_qty", 0) or 0
            product = item.get("product_name", "Unknown")
            # Resolve UUID variant names to proper names
            raw_variant = item.get("variant_name", "") or "Kg"
            unit = resolve_variant_name(raw_variant)
            item_value = item.get("total_value", 0) or 0  # MRP * qty
            mrp = item.get("mrp", 0) or 0
            
            # Calculate supplied_kg - need to convert pieces to kg for packet items
            # Get packaging weight from item or extract from variant_name
            packaging_weight_gm = item.get("packaging_weight", 0) or item.get("packaging_weight_gm", 0)
            
            if not packaging_weight_gm and unit:
                # First, try to lookup weight from qc_packaging table
                variant_key = (unit or '').strip().lower()
                if variant_key in packaging_weight_map:
                    packaging_weight_gm = packaging_weight_map[variant_key]
                else:
                    # Try to extract weight from variant_name like "240-260 gm" or "200 gm"
                    import re
                    weight_match = re.search(r'(\d+)(?:\s*-\s*\d+)?\s*(?:gm|g)\b', unit.lower())
                    if weight_match:
                        packaging_weight_gm = float(weight_match.group(1))
                    else:
                        # Handle common unit names without explicit weight
                        unit_lower = unit.lower().strip()
                        if 'half dozen' in unit_lower or 'half-dozen' in unit_lower:
                            # Half dozen of banana/similar is typically ~500gm
                            packaging_weight_gm = 500
                        elif 'dozen' in unit_lower and 'half' not in unit_lower:
                            # Full dozen is typically ~1000gm (1kg)
                            packaging_weight_gm = 1000
                        elif 'bunch' in unit_lower:
                            # Bunch is typically used for leafy items, ~100gm
                            packaging_weight_gm = 100
                        # Note: For "X Kg Loose" variants (e.g., "10 Kg Loose"), we assume supplied_qty
                        # is already in kg, not in units. This is because loose items are typically
                        # weighed and sold by actual weight, not by pre-packaged units.
            
            # If we have packaging weight in gm, convert qty to kg; otherwise assume qty is already in kg
            if packaging_weight_gm > 0:
                supplied_kg = qty * (packaging_weight_gm / 1000)
            else:
                supplied_kg = qty  # Assume qty is already in kg
            
            dispatch_qty += qty
            
            # Calculate COGS using average purchase price from the product
            # If product has a cost_alias (e.g., Spinach -> Palak), use aliased product's price
            lookup_product = cost_alias_map.get(product, product)
            avg_purchase_price = avg_price_by_product.get(lookup_product, 0)
            
            # If no price found for lookup product, try original product
            if avg_purchase_price == 0 and lookup_product != product:
                avg_purchase_price = avg_price_by_product.get(product, 0)
            
            # Check if this is a combo product (contains ":" with ingredient list)
            combo_cogs_info = None
            if is_combo_product(product):
                combo_info = parse_combo_product(product)
                if combo_info:
                    # Calculate COGS from ingredients
                    combo_cogs_info = calculate_combo_cogs(combo_info, daily_cogs_map, dispatch_date)
                    if combo_cogs_info and combo_cogs_info['total_cogs_per_pack'] > 0:
                        # Use combo COGS: total_cogs_per_pack × qty
                        item_cogs = combo_cogs_info['total_cogs_per_pack'] * qty
                        import logging
                        logging.info(f"[COMBO_COGS] Product: {product}, Qty: {qty}, COGS/pack: {combo_cogs_info['total_cogs_per_pack']}, Total COGS: {item_cogs}")
                    else:
                        # Fallback to regular COGS calculation
                        item_cogs = supplied_kg * avg_purchase_price
                else:
                    # Couldn't parse combo - use regular COGS
                    item_cogs = supplied_kg * avg_purchase_price
            else:
                # Regular product - COGS based on kg
                item_cogs = supplied_kg * avg_purchase_price
            
            dispatch_cogs += item_cogs
            
            if product not in sales_by_product:
                sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
            sales_by_product[product]["sales_amount"] += item_value  # Use gross MRP value
            sales_by_product[product]["sales_qty"] += qty
            
            # Product breakdown per date with customer tracking
            if product not in product_by_date[dispatch_date]:
                product_by_date[dispatch_date][product] = {"sales": 0, "sales_qty": 0, "sales_kg": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
            product_by_date[dispatch_date][product]["sales"] += item_value  # Gross MRP
            product_by_date[dispatch_date][product]["sales_qty"] += qty
            product_by_date[dispatch_date][product]["sales_kg"] += supplied_kg
            if customer not in product_by_date[dispatch_date][product]["customers"]:
                product_by_date[dispatch_date][product]["customers"][customer] = {"sales": 0, "qty": 0}
            product_by_date[dispatch_date][product]["customers"][customer]["sales"] += item_value
            product_by_date[dispatch_date][product]["customers"][customer]["qty"] += qty
            
            # Add detailed line item for retailer (include commission % for later calculation)
            # Look up if there's a rejection for this specific product line using normalized keys
            norm_product = normalize_key(product)
            norm_unit = normalize_key(unit)
            product_rej_key = f"{dispatch_date}_{retailer_id}_{norm_product}_{norm_unit}"
            product_rejection = rejection_by_product_line.get(product_rej_key, {"value": 0, "cogs": 0, "qty": 0})
            
            # Debug: Log line item lookup if rejection expected (log only when there's rejection in the map for this retailer)
            if any(retailer_id in k for k in rejection_by_product_line.keys()):
                import logging
                logging.info(f"[LINE_ITEM] key='{product_rej_key}', found={product_rejection['cogs'] > 0}")
            
            line_items_by_date[dispatch_date].append({
                "customer": customer,
                "customer_type": "Retail",
                "retailer_id": retailer_id,  # Add retailer_id for lookups
                "product": product,
                "unit": unit,
                "supplied_qty": round(qty, 2),
                "supplied_kg": round(supplied_kg, 3),  # Converted to kg based on packaging weight
                "revenue": round(item_value, 2),  # Gross MRP
                "rate_per_kg": round(mrp / (packaging_weight_gm / 1000) if packaging_weight_gm > 0 else mrp, 2),
                "rate_per_unit": round(mrp, 2),
                "cogs": round(item_cogs, 2),
                "wastage_kg": 0,
                "wastage_value": 0,
                "commission_pct": commission_pct,  # Store commission % for proportional allocation
                "rejection_qty": product_rejection["qty"],
                "rejection_value": round(product_rejection["value"], 2),  # Rejection at MRP
                "rejection_cogs": round(product_rejection["cogs"], 2),  # Rejection at COGS/purchase price
                "is_combo": combo_cogs_info is not None,
                "combo_cogs_breakdown": combo_cogs_info.get('ingredients_breakdown') if combo_cogs_info else None
            })
        
        # Track gross MRP for retail (before any deductions)
        retail_gross_mrp_by_date[dispatch_date] += gross_mrp
        retail_commission_by_date[dispatch_date] += commission_amount
        retail_cogs_by_date[dispatch_date] += dispatch_cogs
        
        total_sales += gross_mrp  # Use gross MRP for total sales
        total_sales_qty += dispatch_qty
        retail_sales_total += gross_mrp
        retail_sales_qty += dispatch_qty
        sales_by_customer[customer]["amount"] += gross_mrp
        sales_by_customer[customer]["qty"] += dispatch_qty
        sales_by_customer[customer]["sales_dates"].add(dispatch_date)  # Track unique sales dates
        sales_by_date[dispatch_date]["sales"] += gross_mrp
        sales_by_date[dispatch_date]["sales_qty"] += dispatch_qty
        sales_by_date[dispatch_date]["retail_sales"] = sales_by_date[dispatch_date].get("retail_sales", 0) + gross_mrp
        sales_by_date[dispatch_date]["retail_gross_mrp"] = sales_by_date[dispatch_date].get("retail_gross_mrp", 0) + gross_mrp
        sales_by_date[dispatch_date]["retail_commission"] = sales_by_date[dispatch_date].get("retail_commission", 0) + commission_amount
        sales_by_date[dispatch_date]["retail_cogs"] = sales_by_date[dispatch_date].get("retail_cogs", 0) + dispatch_cogs
        sales_by_customer[customer]["invoices"] += 1
    
    # Add rejection data to sales_by_date
    for rej_date, rej_data in retail_rejection_by_date.items():
        if rej_date in sales_by_date:
            sales_by_date[rej_date]["retail_rejection"] = rej_data["value"]
            sales_by_date[rej_date]["retail_rejection_qty"] = rej_data["qty"]
            sales_by_date[rej_date]["retail_rejection_cogs"] = rej_data["cogs"]
    
    # ========== PURCHASES (from Procurements) ==========
    procurements = await db.procurements.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    purchase_by_farmer = {}
    total_purchase = 0
    total_purchase_qty = 0
    
    for proc in procurements:
        farmer = proc.get("farmer_name", "Unknown")
        proc_date = proc.get("date", "")[:10]
        
        if farmer not in purchase_by_farmer:
            purchase_by_farmer[farmer] = {"amount": 0, "qty": 0}
        if proc_date not in sales_by_date:
            sales_by_date[proc_date] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "variable_exp": 0, "fixed_exp": 0}
        if proc_date not in product_by_date:
            product_by_date[proc_date] = {}
        
        for item in proc.get("products", []):
            qty = item.get("quantity", 0) or 0
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            total_item = item.get("total", 0) or 0
            product = item.get("product_name", "Unknown")
            
            # Convert bunch/piece/pack quantities to Kg for proper COGS calculation
            # This ensures purchase_qty is always in Kg regardless of how it was purchased
            unit_needs_conversion = unit.lower() in ['bunch', 'piece', 'pack', 'packet', 'box', 'crate', 'dozen', 'pcs']
            if unit_needs_conversion and unit_size:
                try:
                    qty_kg = (qty * float(unit_size)) / 1000  # unit_size is in grams
                except (ValueError, TypeError):
                    qty_kg = qty  # Fallback if unit_size is not a valid number
            else:
                qty_kg = qty  # Already in Kg or no conversion needed
            
            total_purchase += total_item
            total_purchase_qty += qty_kg
            purchase_by_farmer[farmer]["amount"] += total_item
            purchase_by_farmer[farmer]["qty"] += qty_kg
            sales_by_date[proc_date]["purchase"] += total_item
            sales_by_date[proc_date]["purchase_qty"] += qty_kg
            
            if product not in sales_by_product:
                sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
            sales_by_product[product]["purchase_amount"] += total_item
            sales_by_product[product]["purchase_qty"] += qty_kg
            
            # Product breakdown per date
            if product not in product_by_date[proc_date]:
                product_by_date[proc_date][product] = {"sales": 0, "sales_qty": 0, "sales_kg": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
            product_by_date[proc_date][product]["purchase"] += total_item
            product_by_date[proc_date][product]["purchase_qty"] += qty_kg
    
    # ========== Build fresh purchases lookup for wastage recalculation ==========
    # Get all procurements in date range to calculate fresh purchase_qty per product/date
    fresh_purchases_by_date_product = {}  # {date: {product_id: {qty: X, value: Y}}}
    for proc in procurements:
        proc_date = proc.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str < from_date or proc_date_str > to_date:
            continue
        
        if proc_date_str not in fresh_purchases_by_date_product:
            fresh_purchases_by_date_product[proc_date_str] = {}
        
        for item in proc.get("products", []):
            product_id = item.get("product_id")
            qty = item.get("quantity", 0)
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            total_value = item.get("total", qty * item.get("rate", 0))
            
            # Convert bunch/piece/pack quantities to Kg for proper wastage calculation
            unit_needs_conversion = unit.lower() in ['bunch', 'piece', 'pack', 'packet', 'box', 'crate', 'dozen', 'pcs']
            if unit_needs_conversion and unit_size:
                try:
                    qty_kg = (qty * float(unit_size)) / 1000  # unit_size is in grams
                except (ValueError, TypeError):
                    qty_kg = qty  # Fallback if unit_size is not a valid number
            else:
                qty_kg = qty  # Already in Kg or no conversion needed
            
            if product_id not in fresh_purchases_by_date_product[proc_date_str]:
                fresh_purchases_by_date_product[proc_date_str][product_id] = {"qty": 0, "value": 0}
            fresh_purchases_by_date_product[proc_date_str][product_id]["qty"] += qty_kg
            fresh_purchases_by_date_product[proc_date_str][product_id]["value"] += total_value
    
    # ========== WASTAGE (from Daily Stock Status - recalculated with fresh procurement data) ==========
    # Only include CLOSED stock status records - this ensures proper accountability
    stock_status = await db.daily_stock_status.find({
        "date": {"$gte": from_date, "$lte": to_date},
        "status": "closed"
    }, {"_id": 0}).to_list(2000)
    
    total_wastage_qty = 0
    total_wastage_value = 0
    
    # Build a map of most recent prices by product for fallback
    product_recent_prices = {}
    
    # Track unsold wastage by date (products with wastage but no dispatch)
    unsold_wastage_by_date = {}  # date -> {product_name: {qty, value, avg_price}}
    
    for status in stock_status:
        status_date = status.get("date", "")[:10]
        product = status.get("product_name", "Unknown")
        product_id = status.get("product_id")
        opening_qty = status.get("opening_qty", 0) or 0
        dispatch_qty = status.get("dispatch_qty", 0) or 0
        closing_qty = status.get("closing_qty", 0) or 0
        
        # Use FRESH procurement data instead of stored purchase_qty to prevent corruption
        fresh_purchase = {}
        if status_date in fresh_purchases_by_date_product and product_id:
            fresh_purchase = fresh_purchases_by_date_product[status_date].get(product_id, {"qty": 0, "value": 0})
        purchase_qty = round(fresh_purchase.get("qty", 0), 2)
        purchase_value = round(fresh_purchase.get("value", 0), 2)
        
        # Recalculate wastage using fresh procurement data
        total_available = opening_qty + purchase_qty - dispatch_qty
        wastage_qty = max(0, total_available - closing_qty)
        
        # Calculate wastage_value dynamically from current procurement rate
        avg_price = purchase_value / purchase_qty if purchase_qty > 0 else 0
        
        # Store this price for future fallback
        if avg_price > 0 and product_id:
            product_recent_prices[product_id] = avg_price
        
        # If no purchase today, use the most recent price we've seen
        if avg_price == 0 and product_id:
            avg_price = product_recent_prices.get(product_id, 0)
        
        # If still no price, use the stored wastage_value from stock status
        if avg_price == 0:
            wastage_value = status.get("wastage_value", 0) or 0
            # Try to get avg_price from the stored value
            stored_wastage_qty = status.get("wastage_qty", 0) or 0
            if stored_wastage_qty > 0 and wastage_value > 0:
                avg_price = wastage_value / stored_wastage_qty
            wastage_value = round(wastage_qty * avg_price, 2) if avg_price > 0 else 0
        else:
            wastage_value = round(wastage_qty * avg_price, 2)
        
        total_wastage_qty += wastage_qty
        total_wastage_value += wastage_value
        
        if status_date in sales_by_date:
            sales_by_date[status_date]["wastage"] += wastage_value
        
        if product in sales_by_product:
            sales_by_product[product]["wastage_amount"] += wastage_value
        
        # Product breakdown per date - ensure entry exists even without procurement
        if status_date not in product_by_date:
            product_by_date[status_date] = {}
        if product not in product_by_date[status_date]:
            product_by_date[status_date][product] = {"sales": 0, "sales_qty": 0, "sales_kg": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
        product_by_date[status_date][product]["wastage"] += wastage_value
        
        # Track unsold wastage (products with wastage but NO dispatch on this day)
        if wastage_qty > 0 and dispatch_qty == 0:
            if status_date not in unsold_wastage_by_date:
                unsold_wastage_by_date[status_date] = {}
            unsold_wastage_by_date[status_date][product] = {
                "qty": wastage_qty,
                "value": wastage_value,
                "avg_price": avg_price
            }
    
    # ========== COMBO PROPORTIONAL WASTAGE DISTRIBUTION ==========
    # For combo products, distribute wastage from base ingredients proportionally
    # based on how much of each ingredient was used in combos vs total supplied
    
    # Build ingredient totals for wastage distribution
    # {date: {ingredient_name: {'supplied_kg': X, 'wastage_kg': Y, 'wastage_value': Z}}}
    ingredient_totals_by_date = {}
    
    for status in stock_status:
        status_date = status.get("date", "")[:10]
        product = status.get("product_name", "Unknown")
        
        # Skip combo products for totals (we only want base ingredients)
        if is_combo_product(product):
            continue
        
        dispatch_qty = status.get("dispatch_qty", 0) or 0
        wastage_qty_ing = status.get("wastage_qty", 0) or 0
        wastage_value_ing = status.get("wastage_value", 0) or 0
        
        if status_date not in ingredient_totals_by_date:
            ingredient_totals_by_date[status_date] = {}
        
        # Normalize ingredient name for matching
        ing_key = product.lower().strip()
        if ing_key not in ingredient_totals_by_date[status_date]:
            ingredient_totals_by_date[status_date][ing_key] = {
                'supplied_kg': 0,
                'wastage_kg': 0,
                'wastage_value': 0
            }
        
        ingredient_totals_by_date[status_date][ing_key]['supplied_kg'] += dispatch_qty
        ingredient_totals_by_date[status_date][ing_key]['wastage_kg'] += wastage_qty_ing
        ingredient_totals_by_date[status_date][ing_key]['wastage_value'] += wastage_value_ing
    
    # Now update combo line items with their proportional wastage share
    for date_key, line_items in line_items_by_date.items():
        date_ingredient_totals = ingredient_totals_by_date.get(date_key, {})
        
        for line_item in line_items:
            if line_item.get('is_combo') and line_item.get('combo_cogs_breakdown'):
                combo_info = parse_combo_product(line_item['product'])
                if combo_info:
                    combo_qty_supplied = line_item.get('supplied_qty', 0)
                    
                    # Calculate proportional wastage for this combo
                    total_combo_wastage_kg = 0
                    total_combo_wastage_value = 0
                    combo_wastage_breakdown = []
                    
                    for ingredient in combo_info['ingredients']:
                        ing_name = ingredient['name'].lower().strip()
                        weight_gm = ingredient['weight_gm']
                        
                        # How much of this ingredient was used in this combo
                        used_in_combo_kg = (combo_qty_supplied * weight_gm) / 1000
                        
                        # Find matching ingredient in totals (try various name matches)
                        ing_totals = None
                        for key in date_ingredient_totals.keys():
                            if ing_name in key or key in ing_name:
                                ing_totals = date_ingredient_totals[key]
                                break
                        
                        if ing_totals and ing_totals['supplied_kg'] > 0:
                            proportion = used_in_combo_kg / ing_totals['supplied_kg']
                            wastage_share_kg = ing_totals['wastage_kg'] * proportion
                            wastage_share_value = ing_totals['wastage_value'] * proportion
                            
                            total_combo_wastage_kg += wastage_share_kg
                            total_combo_wastage_value += wastage_share_value
                            
                            combo_wastage_breakdown.append({
                                'ingredient': ingredient['name'],
                                'used_kg': round(used_in_combo_kg, 4),
                                'proportion': round(proportion, 4),
                                'wastage_share_kg': round(wastage_share_kg, 4),
                                'wastage_share_value': round(wastage_share_value, 2)
                            })
                    
                    # Update line item with proportional wastage
                    line_item['wastage_kg'] = round(total_combo_wastage_kg, 4)
                    line_item['wastage_value'] = round(total_combo_wastage_value, 2)
                    line_item['combo_wastage_breakdown'] = combo_wastage_breakdown

    # ========== VARIABLE EXPENSES ==========
    variable_expenses = await db.variable_expenses.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    variable_by_category = {}
    total_variable = 0
    # Track variable expenses by vertical
    variable_qc = 0
    variable_retail = 0
    variable_all = 0  # Will be split equally
    
    for exp in variable_expenses:
        category = exp.get("category", "Other")
        amount = exp.get("amount", 0) or 0
        exp_date = exp.get("date", "")[:10]
        vertical = exp.get("vertical", "all")  # 'qc', 'retail', or 'all'
        
        total_variable += amount
        if category not in variable_by_category:
            variable_by_category[category] = 0
        variable_by_category[category] += amount
        
        # Track by vertical
        if vertical == "qc":
            variable_qc += amount
        elif vertical == "retail":
            variable_retail += amount
        else:
            variable_all += amount
        
        if exp_date in sales_by_date:
            sales_by_date[exp_date]["variable_exp"] += amount
    
    # ========== LABOUR COSTS (Variable Daily Costs) ==========
    labour_attendance = await db.labour_attendance.find({
        "date": {"$gte": from_date, "$lte": to_date}
    }, {"_id": 0}).to_list(5000)
    
    total_labour_cost = 0
    labour_cost_by_date = {}
    
    for record in labour_attendance:
        if not record.get("present", False):
            continue
        
        att_date = record.get("date", "")[:10]
        daily_rate = float(record.get("daily_rate", 0) or 0)
        overtime_hours = float(record.get("overtime_hours", 0) or 0)
        overtime_rate = float(record.get("overtime_rate", 0) or 0)
        
        day_cost = daily_rate + (overtime_hours * overtime_rate)
        total_labour_cost += day_cost
        
        if att_date not in labour_cost_by_date:
            labour_cost_by_date[att_date] = 0
        labour_cost_by_date[att_date] += day_cost
        
        # Add to daily breakdown
        if att_date in sales_by_date:
            if "labour_cost" not in sales_by_date[att_date]:
                sales_by_date[att_date]["labour_cost"] = 0
            sales_by_date[att_date]["labour_cost"] += day_cost
    
    # Add Labour to variable category for display
    if total_labour_cost > 0:
        variable_by_category["Labour"] = total_labour_cost
        total_variable += total_labour_cost
        variable_all += total_labour_cost  # Labour is shared across all verticals
    
    # ========== FIXED EXPENSES ==========
    # Get fixed expenses for the selected period based on date field or month/year
    # Parse the from_date and to_date to get the month range
    from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
    to_date_obj = datetime.strptime(to_date, '%Y-%m-%d')
    
    # Query fixed expenses that fall within the date range
    # Match by either the date field (if set) OR the month/year combination
    fixed_expenses = await db.fixed_expenses.find({
        "$or": [
            # Match by date field (new format with exact date)
            {"date": {"$gte": from_date, "$lte": to_date}},
            # Match by month/year (legacy format) - include all months in range
            {"$and": [
                {"$or": [
                    {"year": {"$gt": from_date_obj.year}},
                    {"$and": [
                        {"year": from_date_obj.year},
                        {"month": {"$gte": from_date_obj.month}}
                    ]}
                ]},
                {"$or": [
                    {"year": {"$lt": to_date_obj.year}},
                    {"$and": [
                        {"year": to_date_obj.year},
                        {"month": {"$lte": to_date_obj.month}}
                    ]}
                ]}
            ]}
        ]
    }, {"_id": 0}).to_list(100)
    
    fixed_by_category = {}
    total_fixed = 0
    
    for exp in fixed_expenses:
        category = exp.get("category", "Other")
        amount = exp.get("amount", 0) or 0
        
        total_fixed += amount
        if category not in fixed_by_category:
            fixed_by_category[category] = 0
        fixed_by_category[category] += amount
    
    # Distribute fixed expenses across days in period
    days_in_period = max(1, len(sales_by_date))
    daily_fixed = total_fixed / days_in_period
    for date_key in sales_by_date:
        sales_by_date[date_key]["fixed_exp"] = round(daily_fixed, 2)
    
    # ========== CALCULATE TOTAL REJECTION AND COMMISSION ==========
    total_retail_rejection = sum(day_data.get("retail_rejection", 0) for day_data in sales_by_date.values())
    total_retail_rejection_cogs = sum(day_data.get("retail_rejection_cogs", 0) for day_data in sales_by_date.values())
    total_retail_commission = sum(day_data.get("retail_commission", 0) for day_data in sales_by_date.values())
    
    # ========== CALCULATE P&L (using rejection at COGS for accurate calculations) ==========
    gross_profit = total_sales - total_purchase - total_wastage_value - total_retail_rejection_cogs - total_retail_commission
    gross_margin = (gross_profit / total_sales * 100) if total_sales > 0 else 0
    
    net_profit = gross_profit - total_variable - total_fixed
    net_margin = (net_profit / total_sales * 100) if total_sales > 0 else 0
    
    # Daily P&L breakdown with product details
    daily_pnl = []
    for date_key in sorted(sales_by_date.keys()):
        day_data = sales_by_date[date_key]
        
        # Get retail-specific deductions for this date (use COGS-based rejection)
        day_retail_rejection_cogs = day_data.get("retail_rejection_cogs", 0)
        day_retail_commission = day_data.get("retail_commission", 0)
        
        # Gross profit = Sales - Purchase - Wastage - Rejection (COGS) - Commission
        day_gross = day_data["sales"] - day_data["purchase"] - day_data["wastage"] - day_retail_rejection_cogs - day_retail_commission
        day_net = day_gross - day_data["variable_exp"] - day_data["fixed_exp"]
        day_sales_qty = day_data.get("sales_qty", 0)
        day_gross_margin = (day_gross / day_data["sales"] * 100) if day_data["sales"] > 0 else 0
        day_profit_per_unit = (day_gross / day_sales_qty) if day_sales_qty > 0 else 0
        
        # Product breakdown for this date (legacy - kept for backward compatibility)
        products_detail = []
        if date_key in product_by_date:
            for prod_name, prod_data in sorted(product_by_date[date_key].items(), key=lambda x: x[1]["sales"], reverse=True):
                prod_gross = prod_data["sales"] - prod_data["purchase"] - prod_data["wastage"]
                prod_margin = (prod_gross / prod_data["sales"] * 100) if prod_data["sales"] > 0 else 0
                prod_profit_per_unit = (prod_gross / prod_data["sales_qty"]) if prod_data["sales_qty"] > 0 else 0
                # Get customer names for this product
                customers_list = list(prod_data.get("customers", {}).keys())
                customers_str = ", ".join(customers_list) if customers_list else "-"
                products_detail.append({
                    "product": prod_name,
                    "customers": customers_str,
                    "sales": round(prod_data["sales"], 2),
                    "sales_qty": round(prod_data["sales_qty"], 2),
                    "sales_kg": round(prod_data.get("sales_kg", 0), 3),
                    "purchase": round(prod_data["purchase"], 2),
                    "purchase_qty": round(prod_data["purchase_qty"], 2),
                    "wastage": round(prod_data["wastage"], 2),
                    "gross_profit": round(prod_gross, 2),
                    "gross_margin": round(prod_margin, 1),
                    "profit_per_unit": round(prod_profit_per_unit, 2)
                })
        
        # NEW: Generate detailed line items (Customer → Product) with calculated metrics
        detailed_line_items = []
        if date_key in line_items_by_date:
            # Group by customer first, then by product
            customer_product_map = {}
            for line in line_items_by_date[date_key]:
                key = (line["customer"], line["product"], line["unit"])
                if key not in customer_product_map:
                    customer_product_map[key] = {
                        "customer": line["customer"],
                        "customer_type": line["customer_type"],
                        "product": line["product"],
                        "unit": line["unit"],
                        "supplied_qty": 0,
                        "supplied_kg": 0,
                        "revenue": 0,
                        "rate_per_kg": line["rate_per_kg"],
                        "rate_per_unit": line["rate_per_unit"],
                        "commission_pct": line.get("commission_pct", 0),  # Track commission % for retail
                        "rejection_qty": 0,
                        "rejection_value": 0,
                        "rejection_cogs": 0,
                        # Combo product fields
                        "is_combo": line.get("is_combo", False),
                        "combo_cogs_breakdown": line.get("combo_cogs_breakdown"),
                        "combo_wastage_breakdown": line.get("combo_wastage_breakdown"),
                        "combo_cogs_per_unit": line.get("cogs", 0) / line["supplied_qty"] if line.get("is_combo") and line["supplied_qty"] > 0 else 0
                    }
                customer_product_map[key]["supplied_qty"] += line["supplied_qty"]
                customer_product_map[key]["supplied_kg"] += line["supplied_kg"]
                customer_product_map[key]["revenue"] += line["revenue"]
                customer_product_map[key]["rejection_qty"] += line.get("rejection_qty", 0)
                customer_product_map[key]["rejection_value"] += line.get("rejection_value", 0)
                customer_product_map[key]["rejection_cogs"] += line.get("rejection_cogs", 0)
            
            # Now calculate COGS and wastage allocation per line item
            # Get product-level COGS rate using:
            # 1. Daily COGS snapshot (preferred - accounts for inventory carryover)
            # 2. Fallback to closest available date's daily COGS
            # 3. Final fallback to avg_price_by_product (overall average for the date range)
            product_cogs_rate = {}
            
            # Build sorted list of available dates for fallback
            available_cogs_dates = sorted(set(d for (p, d) in daily_cogs_map.keys()), reverse=True)
            
            if date_key in product_by_date:
                for prod_name, prod_data in product_by_date[date_key].items():
                    # First try daily_cogs_map (persisted daily snapshot with inventory carryover)
                    daily_cogs_key = (prod_name, date_key)
                    if daily_cogs_key in daily_cogs_map and daily_cogs_map[daily_cogs_key] > 0:
                        product_cogs_rate[prod_name] = daily_cogs_map[daily_cogs_key]
                    else:
                        # Try to find the closest available date's COGS for this product
                        fallback_found = False
                        for fallback_date in available_cogs_dates:
                            if fallback_date <= date_key:  # Only use dates up to the requested date
                                fallback_key = (prod_name, fallback_date)
                                if fallback_key in daily_cogs_map and daily_cogs_map[fallback_key] > 0:
                                    product_cogs_rate[prod_name] = daily_cogs_map[fallback_key]
                                    fallback_found = True
                                    break
                        
                        if not fallback_found:
                            # Final fallback: overall average price
                            product_cogs_rate[prod_name] = avg_price_by_product.get(prod_name, 0)
            
            # Calculate total supplied kg per product for proportional wastage allocation
            # For aliased products, we need combined totals for proper wastage distribution
            product_total_supplied_kg = {}
            product_total_supplied_kg_with_alias = {}  # Combined totals for aliased products
            
            for key, item in customer_product_map.items():
                product = item["product"]
                if product not in product_total_supplied_kg:
                    product_total_supplied_kg[product] = 0
                product_total_supplied_kg[product] += item["supplied_kg"]
                
                # Also track combined totals for aliased products
                # e.g., both Palak and Spinach (aliased to Palak) contribute to "Palak" pool
                alias_product = cost_alias_map.get(product, product)
                if alias_product not in product_total_supplied_kg_with_alias:
                    product_total_supplied_kg_with_alias[alias_product] = 0
                product_total_supplied_kg_with_alias[alias_product] += item["supplied_kg"]
            
            # Get product-level total wastage (value) for this date
            product_total_wastage = {}
            if date_key in product_by_date:
                for prod_name, prod_data in product_by_date[date_key].items():
                    product_total_wastage[prod_name] = prod_data.get("wastage", 0)
            
            # Build detailed line items sorted by customer then by product
            for key in sorted(customer_product_map.keys(), key=lambda x: (x[0], x[1])):
                item = customer_product_map[key]
                product = item["product"]
                
                # Calculate COGS for this line item
                # Special handling for combo products - use pre-calculated combo COGS
                is_combo = item.get("is_combo", False)
                cogs_rate = 0  # Initialize cogs_rate
                if is_combo and item.get("combo_cogs_per_unit", 0) > 0:
                    # For combo products, use the pre-calculated COGS (per-unit × supplied_qty)
                    cogs = item["combo_cogs_per_unit"] * item["supplied_qty"]
                    # For combo, calculate an effective COGS rate per kg for consistency
                    cogs_rate = (cogs / item["supplied_kg"]) if item["supplied_kg"] > 0 else 0
                else:
                    # Regular products: use cost alias if defined (e.g., Spinach uses Palak's cost)
                    lookup_product = cost_alias_map.get(product, product)
                    cogs_rate = product_cogs_rate.get(lookup_product, 0)
                    # Fallback to original product if alias has no cost
                    if cogs_rate == 0 and lookup_product != product:
                        cogs_rate = product_cogs_rate.get(product, 0)
                    cogs = item["supplied_kg"] * cogs_rate
                
                # Calculate wastage proportionally based on kg supplied ratio
                # If there are 3 supplies in the ratio of 50:30:20 kg, wastage is divided in same ratio
                # For aliased products, use the alias product's wastage pool
                wastage_lookup_product = cost_alias_map.get(product, product)
                
                # For wastage distribution, use the COMBINED total of aliased products
                # e.g., if Spinach (10 kg) is aliased to Palak (100 kg), 
                # total pool is 110 kg and wastage is distributed proportionally
                total_kg_for_alias_group = product_total_supplied_kg_with_alias.get(wastage_lookup_product, 0)
                
                # For COMBO products: use the pre-calculated wastage from combo_wastage_breakdown
                # This was calculated earlier by distributing ingredient wastage proportionally
                if is_combo and item.get("combo_wastage_breakdown"):
                    # Sum up the wastage from all ingredients in the combo
                    wastage_kg = sum(w.get('wastage_share_kg', 0) for w in item["combo_wastage_breakdown"])
                    wastage_value = sum(w.get('wastage_share_value', 0) for w in item["combo_wastage_breakdown"])
                else:
                    # Regular products: distribute wastage from total pool
                    # For wastage, combine quantities of aliased products
                    # e.g., if Spinach is aliased to Palak, Spinach dispatches share Palak's wastage pool
                    total_wastage_for_product = product_total_wastage.get(wastage_lookup_product, 0)
                    if total_wastage_for_product == 0 and wastage_lookup_product != product:
                        total_wastage_for_product = product_total_wastage.get(product, 0)
                    
                    if total_kg_for_alias_group > 0:
                        # Proportional wastage = (this_line_kg / total_alias_group_kg) * total_wastage
                        kg_ratio = item["supplied_kg"] / total_kg_for_alias_group
                        wastage_value = kg_ratio * total_wastage_for_product
                        wastage_kg = (wastage_value / cogs_rate) if cogs_rate > 0 else 0
                    else:
                        wastage_value = 0
                        wastage_kg = 0
                
                # Calculate commission for retail items (proportional to revenue)
                commission_pct = item.get("commission_pct", 0)
                commission_value = 0
                if item["customer_type"] == "Retail" and commission_pct > 0:
                    commission_value = item["revenue"] * commission_pct / 100
                
                # Calculate gross profit and margins for this line item
                # For retail: Gross Profit = Revenue - COGS - Wastage - Commission
                line_gross_profit = item["revenue"] - cogs - wastage_value - commission_value
                line_gross_margin = (line_gross_profit / item["revenue"] * 100) if item["revenue"] > 0 else 0
                
                # Calculate price/kg metrics using supplied_kg
                selling_price_per_kg = (item["revenue"] / item["supplied_kg"]) if item["supplied_kg"] > 0 else 0
                purchase_price_per_kg = cogs_rate
                profit_per_qty = (line_gross_profit / item["supplied_qty"]) if item["supplied_qty"] > 0 else 0
                
                detailed_line_items.append({
                    "customer": item["customer"],
                    "customer_type": item["customer_type"],
                    "product": product,
                    "unit": item["unit"],
                    "supplied_qty": round(item["supplied_qty"], 2),
                    "supplied_kg": round(item["supplied_kg"], 3),
                    "revenue": round(item["revenue"], 2),
                    "cogs": round(cogs, 2),
                    "wastage_kg": round(wastage_kg, 3),
                    "wastage_value": round(wastage_value, 2),
                    "commission": round(commission_value, 2),  # Commission amount for this product
                    "rejection_qty": round(item.get("rejection_qty", 0), 2),
                    "rejection_value": round(item.get("rejection_value", 0), 2),  # Rejection at MRP
                    "rejection_cogs": round(item.get("rejection_cogs", 0), 2),  # Rejection at COGS
                    "gross_profit": round(line_gross_profit, 2),
                    "gross_margin": round(line_gross_margin, 1),
                    "selling_price_per_kg": round(selling_price_per_kg, 2),
                    "purchase_price_per_kg": round(purchase_price_per_kg, 2),
                    "profit_per_qty": round(profit_per_qty, 2),
                    # Combo product fields
                    "is_combo": is_combo,
                    "combo_cogs_breakdown": item.get("combo_cogs_breakdown") if is_combo else None,
                    "combo_wastage_breakdown": item.get("combo_wastage_breakdown") if is_combo else None
                })
        
        # Get unsold wastage for this date (products with wastage but no dispatch)
        date_unsold_wastage = unsold_wastage_by_date.get(date_key, {})
        unsold_wastage_items = []
        unsold_wastage_total = 0
        for prod_name, wastage_data in date_unsold_wastage.items():
            unsold_wastage_items.append({
                "product": prod_name,
                "qty": round(wastage_data["qty"], 2),
                "value": round(wastage_data["value"], 2),
                "avg_price": round(wastage_data["avg_price"], 2)
            })
            unsold_wastage_total += wastage_data["value"]
        
        # Build product-level wastage summary with correct wastage % calculation
        # Get wastage data from daily_stock_status which has opening, purchase, wastage, and wastage_percent
        # Use FRESH procurement data to prevent showing corrupted values
        product_wastage_summary = {}
        date_stock_statuses = [s for s in stock_status if s.get("date") == date_key]
        
        for stock in date_stock_statuses:
            prod_name = stock.get("product_name", "")
            product_id = stock.get("product_id", "")
            if not prod_name:
                continue
            
            opening_qty = stock.get("opening_qty", 0) or 0
            dispatch_qty = stock.get("dispatch_qty", 0) or 0
            closing_qty = stock.get("closing_qty", 0) or 0
            
            # Use FRESH procurement data instead of stored values
            fresh_purchase = {}
            if date_key in fresh_purchases_by_date_product and product_id:
                fresh_purchase = fresh_purchases_by_date_product[date_key].get(product_id, {"qty": 0, "value": 0})
            purchase_qty = round(fresh_purchase.get("qty", 0), 2)
            purchase_value = round(fresh_purchase.get("value", 0), 2)
            
            # Recalculate wastage using fresh procurement data
            total_available = opening_qty + purchase_qty - dispatch_qty
            wastage_qty = max(0, total_available - closing_qty)
            
            # Calculate wastage_value from avg_price
            avg_price = purchase_value / purchase_qty if purchase_qty > 0 else 0
            if avg_price == 0 and product_id:
                avg_price = product_recent_prices.get(product_id, 0)
            wastage_value = round(wastage_qty * avg_price, 2)
            
            # Wastage % = Wastage / (Opening + Purchase) - matches Wastage Dashboard
            total_input = opening_qty + purchase_qty
            wastage_pct = (wastage_qty / total_input * 100) if total_input > 0 else 0
            
            product_wastage_summary[prod_name] = {
                "opening_qty": round(opening_qty, 3),
                "purchase_qty": round(purchase_qty, 3),
                "dispatch_qty": round(dispatch_qty, 3),
                "wastage_qty": round(wastage_qty, 3),
                "wastage_value": round(wastage_value, 2),
                "total_input": round(total_input, 3),
                "wastage_pct": round(wastage_pct, 1)
            }
        
        daily_pnl.append({
            "date": date_key,
            "sales": round(day_data["sales"], 2),
            "sales_qty": round(day_sales_qty, 2),
            "qc_sales": round(day_data.get("qc_sales", 0), 2),
            "retail_sales": round(day_data.get("retail_sales", 0), 2),
            "retail_gross_mrp": round(day_data.get("retail_gross_mrp", 0), 2),
            "retail_rejection": round(day_data.get("retail_rejection", 0), 2),
            "retail_rejection_qty": round(day_data.get("retail_rejection_qty", 0), 2),
            "retail_rejection_cogs": round(day_data.get("retail_rejection_cogs", 0), 2),  # Rejection at COGS/purchase price
            "retail_commission": round(day_data.get("retail_commission", 0), 2),
            "retail_cogs": round(day_data.get("retail_cogs", 0), 2),
            "purchase": round(day_data["purchase"], 2),
            "purchase_qty": round(day_data.get("purchase_qty", 0), 2),
            "wastage": round(day_data["wastage"], 2),
            "gross_profit": round(day_gross, 2),
            "gross_margin": round(day_gross_margin, 1),
            "profit_per_unit": round(day_profit_per_unit, 2),
            "variable_exp": round(day_data["variable_exp"], 2),
            "fixed_exp": round(day_data["fixed_exp"], 2),
            "labour_cost": round(day_data.get("labour_cost", 0), 2),
            "net_profit": round(day_net, 2),
            "products": products_detail,
            "line_items": detailed_line_items,  # Customer→Product breakdown
            "product_wastage_summary": product_wastage_summary,  # Product-level wastage with correct %
            "unsold_wastage": unsold_wastage_items,  # Products with wastage but no sales
            "unsold_wastage_total": round(unsold_wastage_total, 2)
        })
    
    # Customer P&L - calculate GRN loss later after we have total_grn_loss
    customer_pnl_data = []
    for customer, data in sorted(sales_by_customer.items(), key=lambda x: x[1]["amount"], reverse=True):
        customer_pnl_data.append({
            "customer": customer,
            "sales_amount": round(data["amount"], 2),
            "sales_qty": round(data["qty"], 2),
            "invoices": data["invoices"],
            "type": data.get("type", "QC"),  # Include customer type
            "sales_days": len(data.get("sales_dates", set())),  # Count unique sales days
            "retailer_id": data.get("retailer_id", ""),  # For rejection mapping
            "rejection_cogs": round(rejection_cogs_by_retailer.get(data.get("retailer_id", ""), 0), 2)  # Rejection at COGS
        })
    
    # Product P&L with additional metrics
    product_pnl = []
    for product, data in sorted(sales_by_product.items(), key=lambda x: x[1]["sales_amount"], reverse=True):
        profit = data["sales_amount"] - data["purchase_amount"] - data["wastage_amount"]
        margin = (profit / data["sales_amount"] * 100) if data["sales_amount"] > 0 else 0
        profit_per_unit = (profit / data["sales_qty"]) if data["sales_qty"] > 0 else 0
        product_pnl.append({
            "product": product,
            "sales_amount": round(data["sales_amount"], 2),
            "sales_qty": round(data["sales_qty"], 2),
            "purchase_amount": round(data["purchase_amount"], 2),
            "purchase_qty": round(data["purchase_qty"], 2),
            "wastage_amount": round(data["wastage_amount"], 2),
            "profit": round(profit, 2),
            "margin": round(margin, 1),
            "profit_per_unit": round(profit_per_unit, 2)
        })
    
    # Calculate QC vs Retail bifurcation totals
    total_qc_sales = sum(day.get("qc_sales", 0) for day in daily_pnl)
    total_retail_sales = sum(day.get("retail_sales", 0) for day in daily_pnl)
    
    # Calculate ACTUAL QC and Retail COGS and Wastage from line items
    # (instead of proportional allocation by sales %)
    actual_qc_cogs = 0
    actual_retail_cogs = 0
    actual_qc_wastage = 0
    actual_retail_wastage = 0
    
    for day in daily_pnl:
        for item in day.get("line_items", []):
            if item.get("customer_type") == "QC":
                actual_qc_cogs += item.get("cogs", 0)
                actual_qc_wastage += item.get("wastage_value", 0)
            else:  # Retail
                actual_retail_cogs += item.get("cogs", 0)
                actual_retail_wastage += item.get("wastage_value", 0)
    
    # Count QC and Retail orders and quantities
    qc_order_count = 0
    qc_qty_total = 0
    retail_order_count = 0
    retail_qty_total = 0
    
    for customer, data in sales_by_customer.items():
        if data.get("type") == "QC":
            qc_order_count += data.get("invoices", 0)
            qc_qty_total += data.get("qty", 0)
        else:
            retail_order_count += data.get("invoices", 0)
            retail_qty_total += data.get("qty", 0)
    
    # Calculate QC and Retail specific P&L metrics
    # Use ACTUAL COGS and wastage from line items (not proportional allocation)
    qc_sales_pct = (total_qc_sales / total_sales * 100) if total_sales > 0 else 0
    retail_sales_pct = (total_retail_sales / total_sales * 100) if total_sales > 0 else 0
    
    # Use actual calculated values from line items
    qc_purchase = actual_qc_cogs
    retail_purchase = actual_retail_cogs
    
    qc_wastage = actual_qc_wastage
    retail_wastage = actual_retail_wastage
    
    # Variable expenses: QC-specific + half of "all" expenses
    # Retail-specific + half of "all" expenses
    qc_variable_exp = variable_qc + (variable_all / 2)
    retail_variable_exp = variable_retail + (variable_all / 2)
    
    # Fixed expenses: Always divided equally between QC and Retail
    qc_fixed_exp = total_fixed / 2
    retail_fixed_exp = total_fixed / 2
    
    # Calculate total GRN loss using the shared function (ensures consistency with GRN Loss Summary)
    grn_loss_data = await calculate_grn_loss(from_date, to_date)
    total_grn_loss = grn_loss_data["total_loss"]
    total_grn_loss_qty = grn_loss_data["total_qty_diff"]
    
    # Also build grn_loss_by_date for daily P&L breakdown
    grn_loss_by_date = {}
    for item in grn_loss_data.get("items", []):
        date = item.get("date", "Unknown")
        if date not in grn_loss_by_date:
            grn_loss_by_date[date] = {"value": 0, "qty_kg": 0}
        grn_loss_by_date[date]["value"] += item.get("loss_amount", 0)
        grn_loss_by_date[date]["qty_kg"] += abs(item.get("difference", 0))
    
    # Calculate QC P&L (GRN Loss affects net profit)
    qc_gross_profit = total_qc_sales - qc_purchase - qc_wastage
    # Gross Margin % = (Gross Profit / Sales) * 100 - MUST use Sales as denominator, not cost base
    qc_gross_margin = (qc_gross_profit / total_qc_sales * 100) if total_qc_sales > 0 else 0
    # QC Net Profit = Gross Profit - GRN Loss - Variable Exp - Fixed Exp
    qc_net_profit = qc_gross_profit - total_grn_loss - qc_variable_exp - qc_fixed_exp
    qc_net_margin = (qc_net_profit / total_qc_sales * 100) if total_qc_sales > 0 else 0
    
    # Calculate Retail P&L (using rejection at COGS for accurate profit calculation)
    # Gross Profit = Sales - COGS - Wastage - Rejection (at COGS) - Commission
    retail_gross_profit = total_retail_sales - retail_purchase - retail_wastage - total_retail_rejection_cogs - total_retail_commission
    retail_cost_base = retail_purchase + retail_wastage + total_retail_rejection_cogs + total_retail_commission
    retail_gross_margin = (retail_gross_profit / total_retail_sales * 100) if total_retail_sales > 0 else 0
    retail_net_profit = retail_gross_profit - retail_variable_exp - retail_fixed_exp
    retail_net_margin = (retail_net_profit / total_retail_sales * 100) if total_retail_sales > 0 else 0
    
    # Also calculate overall gross margin %
    total_cost_base = total_purchase + total_wastage_value + total_retail_rejection_cogs + total_retail_commission
    overall_gross_margin_pct = (gross_profit / total_sales * 100) if total_sales > 0 else 0
    
    # Total COGS from line items (sum of QC + Retail COGS)
    total_cogs = actual_qc_cogs + actual_retail_cogs
    total_wastage_from_items = actual_qc_wastage + actual_retail_wastage
    
    # Recalculate gross profit using actual COGS and wastage from line items (using rejection at COGS)
    gross_profit_actual = total_sales - total_cogs - total_wastage_from_items - total_retail_rejection_cogs - total_retail_commission
    gross_margin_actual = (gross_profit_actual / total_sales * 100) if total_sales > 0 else 0
    
    # Recalculate net profit (including GRN Loss which affects QC)
    # Net Profit = Gross Profit - GRN Loss - Variable Expenses - Fixed Expenses
    net_profit_actual = gross_profit_actual - total_grn_loss - total_variable - total_fixed
    net_margin_actual = (net_profit_actual / total_sales * 100) if total_sales > 0 else 0
    
    # Now allocate GRN loss proportionally to QC customers based on their sales contribution
    # This ensures customer-level P&L aligns with QC-level P&L
    customer_pnl = []
    for cust_data in customer_pnl_data:
        customer_entry = cust_data.copy()
        customer_sales = cust_data["sales_amount"]
        customer_type = cust_data["type"]
        
        # Calculate proportional share of expenses and losses
        if customer_type == "QC" and total_qc_sales > 0:
            customer_share = customer_sales / total_qc_sales
            # Allocate QC-specific costs proportionally
            customer_entry["grn_loss_share"] = round(total_grn_loss * customer_share, 2)
            customer_entry["rejection_share"] = 0  # QC doesn't have rejection
            customer_entry["commission"] = 0  # QC doesn't have commission
            # Allocate ONLY QC-specific variable expenses (NOT including "all" expenses)
            customer_entry["variable_expenses"] = round(variable_qc * customer_share, 2)
            # NOTE: Fixed expenses removed from customer-level P&L as per user request
            customer_entry["fixed_expenses"] = 0
            # Calculate customer's COGS share and wastage share
            customer_entry["cogs_share"] = round(actual_qc_cogs * customer_share, 2)
            customer_entry["wastage_share"] = round(actual_qc_wastage * customer_share, 2)
        elif customer_type == "Retail" and total_retail_sales > 0:
            customer_share = customer_sales / total_retail_sales
            # Allocate Retail-specific costs proportionally
            customer_entry["grn_loss_share"] = 0  # Retail doesn't have GRN loss
            
            # Use ACTUAL rejection at COGS for this retailer if available
            retailer_id = cust_data.get("retailer_id", "")
            actual_rejection_cogs = rejection_cogs_by_retailer.get(retailer_id, 0) if retailer_id else 0
            customer_entry["rejection_share"] = round(actual_rejection_cogs, 2)
            
            customer_entry["commission"] = round(total_retail_commission * customer_share, 2)
            # Allocate ONLY Retail-specific variable expenses (NOT including "all" expenses)
            customer_entry["variable_expenses"] = round(variable_retail * customer_share, 2)
            # NOTE: Fixed expenses removed from customer-level P&L as per user request
            customer_entry["fixed_expenses"] = 0
            # Calculate customer's COGS share and wastage share
            customer_entry["cogs_share"] = round(actual_retail_cogs * customer_share, 2)
            customer_entry["wastage_share"] = round(actual_retail_wastage * customer_share, 2)
        else:
            customer_entry["grn_loss_share"] = 0
            customer_entry["rejection_share"] = 0
            customer_entry["commission"] = 0
            customer_entry["variable_expenses"] = 0
            customer_entry["fixed_expenses"] = 0
            customer_entry["cogs_share"] = 0
            customer_entry["wastage_share"] = 0
        
        # Calculate Gross Profit = Sales - COGS
        gross_profit = customer_sales - customer_entry["cogs_share"]
        customer_entry["gross_profit"] = round(gross_profit, 2)
        customer_entry["gross_margin_pct"] = round((gross_profit / customer_sales * 100) if customer_sales > 0 else 0, 1)
        
        # Calculate Net Profit = Gross - GRN Loss - Rejection - Commission - Variable Expenses
        # NOTE: Fixed expenses NOT included in customer-level Net P/L
        net_profit = (gross_profit - customer_entry["grn_loss_share"] - 
                      customer_entry["rejection_share"] - customer_entry["commission"] -
                      customer_entry["variable_expenses"])
        customer_entry["net_profit"] = round(net_profit, 2)
        customer_entry["net_margin_pct"] = round((net_profit / customer_sales * 100) if customer_sales > 0 else 0, 1)
        
        customer_pnl.append(customer_entry)
    
    return {
        "period": {"from": from_date, "to": to_date},
        "summary": {
            "total_sales": round(total_sales, 2),
            "total_sales_qty": round(total_sales_qty, 2),
            "total_purchase": round(total_purchase, 2),
            "total_purchase_qty": round(total_purchase_qty, 2),
            "total_cogs": round(total_cogs, 2),  # Sum of line item COGS
            "total_wastage_qty": round(total_wastage_qty, 2),
            "total_wastage_value": round(total_wastage_value, 2),
            "total_wastage_from_items": round(total_wastage_from_items, 2),  # Sum of line item wastage
            "total_retail_rejection": round(total_retail_rejection, 2),
            "total_retail_commission": round(total_retail_commission, 2),
            "gross_profit": round(gross_profit_actual, 2),  # Using actual COGS
            "gross_margin": round(gross_margin_actual, 1),
            "gross_margin_pct": round(gross_margin_actual, 1),
            "total_variable_expenses": round(total_variable, 2),
            "total_fixed_expenses": round(total_fixed, 2),
            "total_labour_cost": round(total_labour_cost, 2),
            "net_profit": round(net_profit_actual, 2),
            "net_margin": round(net_margin_actual, 1)
        },
        "vertical_bifurcation": {
            "qc": {
                "sales": round(total_qc_sales, 2),
                "percentage": round(qc_sales_pct, 1),
                "qty": round(qc_qty_total, 2),
                "orders": qc_order_count,
                "purchase": round(qc_purchase, 2),
                "wastage": round(qc_wastage, 2),
                "grn_loss": round(total_grn_loss, 2),  # GRN Loss (dispatched - received)
                "gross_profit": round(qc_gross_profit, 2),
                "gross_margin_pct": round(qc_gross_margin, 1),
                "variable_exp": round(qc_variable_exp, 2),
                "fixed_exp": round(qc_fixed_exp, 2),
                "net_profit": round(qc_net_profit, 2),
                "net_margin": round(qc_net_margin, 1)
            },
            "retail": {
                "sales": round(total_retail_sales, 2),
                "percentage": round(retail_sales_pct, 1),
                "qty": round(retail_qty_total, 2),
                "orders": retail_order_count,
                "purchase": round(retail_purchase, 2),
                "wastage": round(retail_wastage, 2),
                "rejection": round(total_retail_rejection, 2),  # At MRP for reference
                "rejection_cogs": round(total_retail_rejection_cogs, 2),  # At purchase price for P&L
                "commission": round(total_retail_commission, 2),
                "gross_profit": round(retail_gross_profit, 2),
                "gross_margin_pct": round(retail_gross_margin, 1),
                "variable_exp": round(retail_variable_exp, 2),
                "fixed_exp": round(retail_fixed_exp, 2),
                "net_profit": round(retail_net_profit, 2),
                "net_margin": round(retail_net_margin, 1)
            }
        },
        "daily_pnl": daily_pnl,
        "customer_pnl": customer_pnl,
        "product_pnl": product_pnl,
        "rejection_by_date_retailer": rejection_by_date_retailer,  # {date}_{retailer_id} -> {value, cogs, qty}
        "rejection_by_product_line": rejection_by_product_line,  # {date}_{retailer_id}_{product}_{variant} -> {value, cogs, qty}
        "expenses": {
            "variable_by_category": variable_by_category,
            "fixed_by_category": fixed_by_category
        },
        "purchase_by_farmer": [
            {"farmer": f, "amount": round(d["amount"], 2), "qty": round(d["qty"], 2)} 
            for f, d in sorted(purchase_by_farmer.items(), key=lambda x: x[1]["amount"], reverse=True)
        ]
    }


# ============================================================================
# P&L EXCEL EXPORT - Detailed audit report with customer/product breakdown
# ============================================================================

@router.get("/reports/pnl/export-excel")
async def export_pnl_excel(
    from_date: str = Query(..., description="Start date YYYY-MM-DD"),
    to_date: str = Query(..., description="End date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user)
):
    """Export detailed P&L report as Excel for audit purposes"""
    import xlsxwriter
    from io import BytesIO
    
    # Call the main P&L endpoint logic to get properly calculated data
    pnl_data = await get_pnl_report(from_date=from_date, to_date=to_date, current_user=current_user)
    
    # Extract data from P&L response
    daily_pnl = pnl_data.get("daily_pnl", [])
    customer_pnl = pnl_data.get("customer_pnl", [])
    product_pnl = pnl_data.get("product_pnl", [])
    summary = pnl_data.get("summary", {})
    purchase_by_farmer = pnl_data.get("purchase_by_farmer", [])
    vertical_bif = pnl_data.get("vertical_bifurcation", {})
    
    # Fetch procurements in date range for purchase detail sheet
    date_procurements = await db.procurements.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    # Create Excel workbook
    output = BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # Define formats
    header_format = workbook.add_format({
        'bold': True, 'bg_color': '#14532D', 'font_color': 'white',
        'border': 1, 'align': 'center', 'valign': 'vcenter'
    })
    currency_format = workbook.add_format({'num_format': '₹#,##0.00', 'border': 1})
    number_format = workbook.add_format({'num_format': '#,##0.00', 'border': 1})
    text_format = workbook.add_format({'border': 1})
    total_format = workbook.add_format({
        'bold': True, 'bg_color': '#E5E7EB', 'border': 1, 'num_format': '₹#,##0.00'
    })
    qc_format = workbook.add_format({'bg_color': '#DBEAFE', 'border': 1})
    retail_format = workbook.add_format({'bg_color': '#DCFCE7', 'border': 1})
    
    # Sheet 1: Summary
    summary_sheet = workbook.add_worksheet("Summary")
    summary_sheet.set_column('A:A', 25)
    summary_sheet.set_column('B:D', 18)
    
    row = 0
    summary_sheet.write(row, 0, f"P&L Report: {from_date} to {to_date}", workbook.add_format({'bold': True, 'font_size': 14}))
    row += 2
    
    # Overall summary
    summary_sheet.write(row, 0, "Metric", header_format)
    summary_sheet.write(row, 1, "Total", header_format)
    summary_sheet.write(row, 2, "QC", header_format)
    summary_sheet.write(row, 3, "Retail", header_format)
    row += 1
    
    qc = vertical_bif.get("qc", {})
    retail = vertical_bif.get("retail", {})
    
    metrics = [
        ("Sales", summary.get("total_sales", 0), qc.get("sales", 0), retail.get("sales", 0)),
        ("Purchase (COGS)", summary.get("total_cogs", 0), qc.get("purchase", 0), retail.get("purchase", 0)),
        ("Wastage", summary.get("total_wastage", 0), qc.get("wastage", 0), retail.get("wastage", 0)),
        ("Commission", retail.get("commission", 0), 0, retail.get("commission", 0)),
        ("Gross Profit", summary.get("gross_profit", 0), qc.get("gross_profit", 0), retail.get("gross_profit", 0)),
        ("Gross Margin %", summary.get("gross_margin", 0), qc.get("gross_margin", 0), retail.get("gross_margin", 0)),
    ]
    
    for metric, total, qc_val, retail_val in metrics:
        summary_sheet.write(row, 0, metric, text_format)
        if "%" in metric:
            summary_sheet.write(row, 1, f"{total:.1f}%", text_format)
            summary_sheet.write(row, 2, f"{qc_val:.1f}%", text_format)
            summary_sheet.write(row, 3, f"{retail_val:.1f}%", text_format)
        else:
            summary_sheet.write(row, 1, total, currency_format)
            summary_sheet.write(row, 2, qc_val, currency_format)
            summary_sheet.write(row, 3, retail_val, currency_format)
        row += 1
    
    # Sheet 2: Daily P&L Breakdown with line items
    daily_sheet = workbook.add_worksheet("Daily P&L")
    daily_sheet.set_column('A:A', 12)
    daily_sheet.set_column('B:B', 10)
    daily_sheet.set_column('C:C', 25)
    daily_sheet.set_column('D:D', 20)
    daily_sheet.set_column('E:L', 12)
    
    headers = ["Date", "Type", "Customer", "Product", "Qty", "Sales", "COGS", "Wastage", "Commission", "Gross P/L", "GM%"]
    row = 0
    for col, header in enumerate(headers):
        daily_sheet.write(row, col, header, header_format)
    row += 1
    
    for day in sorted(daily_pnl, key=lambda x: x.get("date", "")):
        date = day.get("date", "")
        line_items = day.get("line_items", [])
        
        for item in line_items:
            customer = item.get("customer", "Unknown")
            customer_type = item.get("customer_type", "")
            product = item.get("product", "Unknown")
            qty = item.get("supplied_qty", 0) or 0
            revenue = item.get("revenue", 0) or 0
            cogs = item.get("cogs", 0) or 0
            wastage = item.get("wastage_value", 0) or 0
            commission = item.get("commission", 0) or 0
            gross = item.get("gross_profit", 0) or 0
            gm = item.get("gross_margin", 0) or 0
            
            row_format = qc_format if customer_type == "QC" else retail_format
            
            daily_sheet.write(row, 0, date, text_format)
            daily_sheet.write(row, 1, customer_type, row_format)
            daily_sheet.write(row, 2, customer, text_format)
            daily_sheet.write(row, 3, product, text_format)
            daily_sheet.write(row, 4, qty, number_format)
            daily_sheet.write(row, 5, revenue, currency_format)
            daily_sheet.write(row, 6, cogs, currency_format)
            daily_sheet.write(row, 7, wastage, currency_format)
            daily_sheet.write(row, 8, commission, currency_format)
            daily_sheet.write(row, 9, gross, currency_format)
            daily_sheet.write(row, 10, f"{gm:.1f}%", text_format)
            row += 1
    
    # Aggregate customer data from line_items for Customer P&L sheet
    customer_totals = {}
    for day in daily_pnl:
        for item in day.get("line_items", []):
            customer = item.get("customer", "Unknown")
            customer_type = item.get("customer_type", "")
            if customer not in customer_totals:
                customer_totals[customer] = {
                    "type": customer_type,
                    "qty": 0, "sales": 0, "cogs": 0, 
                    "wastage": 0, "commission": 0
                }
            customer_totals[customer]["qty"] += item.get("supplied_qty", 0) or 0
            customer_totals[customer]["sales"] += item.get("revenue", 0) or 0
            customer_totals[customer]["cogs"] += item.get("cogs", 0) or 0
            customer_totals[customer]["wastage"] += item.get("wastage_value", 0) or 0
            customer_totals[customer]["commission"] += item.get("commission", 0) or 0
    
    # Sheet 3: Customer-wise P&L
    customer_sheet = workbook.add_worksheet("Customer P&L")
    customer_sheet.set_column('A:A', 30)
    customer_sheet.set_column('B:I', 15)
    
    headers = ["Customer", "Type", "Qty", "Sales", "COGS", "Wastage", "Commission", "Gross P/L", "GM%"]
    row = 0
    for col, header in enumerate(headers):
        customer_sheet.write(row, col, header, header_format)
    row += 1
    
    for customer, data in sorted(customer_totals.items(), key=lambda x: x[1].get("sales", 0), reverse=True):
        gross = data["sales"] - data["cogs"] - data["wastage"] - data["commission"]
        gm = (gross / data["sales"] * 100) if data["sales"] > 0 else 0
        
        customer_sheet.write(row, 0, customer, text_format)
        customer_sheet.write(row, 1, data["type"], text_format)
        customer_sheet.write(row, 2, data["qty"], number_format)
        customer_sheet.write(row, 3, data["sales"], currency_format)
        customer_sheet.write(row, 4, data["cogs"], currency_format)
        customer_sheet.write(row, 5, data["wastage"], currency_format)
        customer_sheet.write(row, 6, data["commission"], currency_format)
        customer_sheet.write(row, 7, gross, currency_format)
        customer_sheet.write(row, 8, f"{gm:.1f}%", text_format)
        row += 1
    
    # Aggregate product data from line_items for Product P&L sheet
    product_totals = {}
    for day in daily_pnl:
        for item in day.get("line_items", []):
            product = item.get("product", "Unknown")
            if product not in product_totals:
                product_totals[product] = {
                    "qty": 0, "sales": 0, "cogs": 0, "wastage": 0
                }
            product_totals[product]["qty"] += item.get("supplied_qty", 0) or 0
            product_totals[product]["sales"] += item.get("revenue", 0) or 0
            product_totals[product]["cogs"] += item.get("cogs", 0) or 0
            product_totals[product]["wastage"] += item.get("wastage_value", 0) or 0
    
    # Sheet 4: Product-wise P&L
    product_sheet = workbook.add_worksheet("Product P&L")
    product_sheet.set_column('A:A', 25)
    product_sheet.set_column('B:H', 15)
    
    headers = ["Product", "Qty Sold", "Sales", "COGS", "Wastage", "Gross P/L", "GM%"]
    row = 0
    for col, header in enumerate(headers):
        product_sheet.write(row, col, header, header_format)
    row += 1
    
    for product, data in sorted(product_totals.items(), key=lambda x: x[1].get("sales", 0), reverse=True):
        gross = data["sales"] - data["cogs"] - data["wastage"]
        gm = (gross / data["sales"] * 100) if data["sales"] > 0 else 0
        
        product_sheet.write(row, 0, product, text_format)
        product_sheet.write(row, 1, data["qty"], number_format)
        product_sheet.write(row, 2, data["sales"], currency_format)
        product_sheet.write(row, 3, data["cogs"], currency_format)
        product_sheet.write(row, 4, data["wastage"], currency_format)
        product_sheet.write(row, 5, gross, currency_format)
        product_sheet.write(row, 6, f"{gm:.1f}%", text_format)
        row += 1
    
    # Sheet 5: Purchases by Farmer
    purchase_sheet = workbook.add_worksheet("Purchases")
    purchase_sheet.set_column('A:A', 12)
    purchase_sheet.set_column('B:B', 20)
    purchase_sheet.set_column('C:C', 25)
    purchase_sheet.set_column('D:G', 12)
    
    headers = ["Date", "Farmer", "Product", "Qty", "Unit", "Rate", "Total"]
    row = 0
    for col, header in enumerate(headers):
        purchase_sheet.write(row, col, header, header_format)
    row += 1
    
    for proc in sorted(date_procurements, key=lambda x: x.get("date", "")):
        farmer = proc.get("farmer_name", "Unknown")
        proc_date = str(proc.get("date", ""))[:10]
        
        for item in proc.get("products", []):
            purchase_sheet.write(row, 0, proc_date, text_format)
            purchase_sheet.write(row, 1, farmer, text_format)
            purchase_sheet.write(row, 2, item.get("product_name", ""), text_format)
            purchase_sheet.write(row, 3, item.get("quantity", 0) or 0, number_format)
            purchase_sheet.write(row, 4, item.get("unit", "Kg"), text_format)
            purchase_sheet.write(row, 5, item.get("rate", 0) or 0, currency_format)
            purchase_sheet.write(row, 6, item.get("total", 0) or 0, currency_format)
            row += 1
    
    # Sheet 6: Purchase Summary by Farmer
    farmer_sheet = workbook.add_worksheet("Farmer Summary")
    farmer_sheet.set_column('A:A', 25)
    farmer_sheet.set_column('B:C', 15)
    
    headers = ["Farmer", "Total Qty", "Total Amount"]
    row = 0
    for col, header in enumerate(headers):
        farmer_sheet.write(row, col, header, header_format)
    row += 1
    
    for farmer in purchase_by_farmer:
        farmer_sheet.write(row, 0, farmer.get("farmer", ""), text_format)
        farmer_sheet.write(row, 1, farmer.get("qty", 0), number_format)
        farmer_sheet.write(row, 2, farmer.get("amount", 0), currency_format)
        row += 1
    
    workbook.close()
    output.seek(0)
    
    filename = f"PnL_Report_{from_date}_to_{to_date}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ============================================================================

@router.get("/stock-status")
async def get_all_stock_status(
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all stock status records for sync purposes"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        query = {}
        
        # Default to last 6 months if no dates provided
        if not from_date:
            from_date = (datetime.now(timezone.utc) - timedelta(days=180)).strftime('%Y-%m-%d')
        if not to_date:
            to_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        query["date"] = {"$gte": from_date, "$lte": to_date}
        
        logger.info(f"Fetching stock status from {from_date} to {to_date}")
        stock_status = await db.daily_stock_status.find(query, {"_id": 0}).to_list(10000)
        logger.info(f"Found {len(stock_status)} stock status records")
        
        return stock_status
    except Exception as e:
        logger.error(f"Error in get_all_stock_status: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch stock status: {str(e)}")

@router.get("/stock-status/today")
async def get_today_stock_status(current_user: dict = Depends(get_current_user)):
    """Get today's stock status for all products with opening qty, purchases, dispatches"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        logger.info(f"Fetching today's stock status for date: {today}")
        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Get all products - only fetch needed fields
        products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1, "price_per_kg": 1, "cost_alias_product_id": 1}).to_list(1000)
    
        # Get yesterday's closing stock (for opening)
        yesterday_status = await db.daily_stock_status.find(
            {"date": yesterday, "status": "closed"},
            {"_id": 0}
        ).to_list(1000)
        yesterday_map = {s["product_id"]: s for s in yesterday_status}
        
        # Get today's existing status
        today_status = await db.daily_stock_status.find(
            {"date": today},
            {"_id": 0}
        ).to_list(1000)
        today_map = {s["product_id"]: s for s in today_status}
        
        # Get today's procurements (purchases from farmers)
        procurements = await db.procurements.find({
            "date": {"$regex": f"^{today}"}
        }, {"_id": 0}).to_list(1000)
        
        # Calculate purchases by product
        purchases_by_product = {}
        for proc in procurements:
            for item in proc.get("products", []):
                product_id = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                rate = item.get("rate", 0)
                total_value = item.get("total", qty * rate)
                
                unit_lower = unit.lower().strip()
                if unit_lower in ["bunch", "piece", "pack", "packet", "box", "crate", "dozen", "pcs"]:
                    weight_gm = None
                    if unit_size:
                        try:
                            weight_gm = float(unit_size)
                        except (ValueError, TypeError):
                            pass
                    if not weight_gm:
                        defaults = {'packet': 200, 'pack': 200, 'bunch': 250, 'piece': 100, 'pcs': 100}
                        weight_gm = defaults.get(unit_lower)
                    if weight_gm:
                        qty_kg = (qty * weight_gm) / 1000
                    else:
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                if product_id not in purchases_by_product:
                    purchases_by_product[product_id] = {"qty": 0, "value": 0}
                purchases_by_product[product_id]["qty"] += qty_kg
                purchases_by_product[product_id]["value"] += total_value
        
        # Get today's dispatches - optimized queries
        qc_dispatches = await db.qc_dispatches.find({
            "dispatch_date": {"$regex": f"^{today}"}
        }, {"_id": 0, "items": 1}).to_list(200)
        
        retailer_dispatches = await db.retailer_dispatches.find({
            "dispatch_date": {"$regex": f"^{today}"}
        }, {"_id": 0, "items": 1}).to_list(200)
        
        # Get packaging weights
        packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
        packaging_map = {}
        for p in packaging_variants:
            name = p['name']
            name_lower = name.lower().strip()
            weight = p.get('weight_gm') or extract_weight_from_packaging_name(name)
            if weight > 0:
                packaging_map[name_lower] = weight
                if 'packet' in name_lower:
                    packaging_map[name_lower.replace('packet', '').strip()] = weight
                number_match = re.search(r'^(\d+)\s*(gm|g)?', name_lower)
                if number_match:
                    packaging_map[number_match.group(1)] = weight
        
        # Build cost_alias mapping
        cost_alias_id_map = {}
        for product in products:
            alias_id = product.get("cost_alias_product_id")
            if alias_id:
                cost_alias_id_map[product["id"]] = alias_id
        
        # Get historical prices - OPTIMIZED: only last 7 days
        seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
        historical_prices = await db.daily_stock_status.find(
            {"avg_price": {"$gt": 0}, "date": {"$gte": seven_days_ago}},
            {"_id": 0, "product_id": 1, "date": 1, "avg_price": 1}
        ).sort("date", -1).to_list(1000)
        
        product_historical_price = {}
        for h in historical_prices:
            pid = h.get("product_id")
            if pid and pid not in product_historical_price:
                product_historical_price[pid] = h.get("avg_price", 0)
        
        # Calculate dispatches by product
        dispatches_by_product = {}
        for dispatch in qc_dispatches + retailer_dispatches:
            for item in dispatch.get("items", []):
                product_id = item.get("product_id")
                target_product_id = cost_alias_id_map.get(product_id, product_id)
                supplied_qty = item.get("supplied_qty", 0)
                packaging_name = (item.get("packaging_name") or item.get("variant_name") or "").lower().strip()
                
                weight_gm = packaging_map.get(packaging_name)
                if not weight_gm:
                    weight_gm = extract_weight_from_packaging_name(packaging_name)
                if not weight_gm:
                    weight_gm = 1000
                
                qty_kg = (supplied_qty * weight_gm) / 1000
                rate = item.get("rate") or 0
                value = supplied_qty * rate
                
                if target_product_id not in dispatches_by_product:
                    dispatches_by_product[target_product_id] = {"qty": 0, "value": 0}
                dispatches_by_product[target_product_id]["qty"] += qty_kg
                dispatches_by_product[target_product_id]["value"] += value
        
        # Build stock status for each product
        result = []
        for product in products:
            product_id = product["id"]
            product_name = product["name"]
            
            purchase_data = purchases_by_product.get(product_id, {"qty": 0, "value": 0})
            dispatch_data = dispatches_by_product.get(product_id, {"qty": 0, "value": 0})
            
            if product_id in today_map:
                status = today_map[product_id]
                
                if status.get("status") == "open":
                    opening_qty = status.get("opening_qty", 0) or 0
                    opening_price = status.get("opening_price", 0) or 0
                    
                    total_qty = opening_qty + purchase_data["qty"]
                    if total_qty > 0:
                        opening_value = opening_qty * opening_price
                        avg_price = (opening_value + purchase_data["value"]) / total_qty
                    else:
                        avg_price = opening_price or (purchase_data["value"] / purchase_data["qty"] if purchase_data["qty"] > 0 else 0)
                    
                    if avg_price == 0:
                        avg_price = product_historical_price.get(product_id, 0)
                    
                    update_data = {
                        "purchase_qty": round(purchase_data["qty"], 2),
                        "purchase_value": round(purchase_data["value"], 2),
                        "dispatch_qty": round(dispatch_data["qty"], 2),
                        "dispatch_value": round(dispatch_data["value"], 2),
                        "avg_price": round(avg_price, 2)
                    }
                    
                    await db.daily_stock_status.update_one(
                        {"id": status["id"]},
                        {"$set": update_data}
                    )
                    status.update(update_data)
            else:
                if product_id in yesterday_map:
                    opening_qty = yesterday_map[product_id].get("closing_qty", 0) or 0
                    opening_price = yesterday_map[product_id].get("avg_price", 0) or 0
                else:
                    opening_qty = 0
                    opening_price = product.get("price_per_kg", 0) or 0
                
                total_qty = opening_qty + purchase_data["qty"]
                if total_qty > 0:
                    opening_value = opening_qty * opening_price
                    avg_price = (opening_value + purchase_data["value"]) / total_qty
                else:
                    avg_price = opening_price or (purchase_data["value"] / purchase_data["qty"] if purchase_data["qty"] > 0 else 0)
                
                if avg_price == 0:
                    avg_price = product_historical_price.get(product_id, 0)
                
                status = {
                    "id": str(uuid.uuid4()),
                    "date": today,
                    "product_id": product_id,
                    "product_name": product_name,
                    "product_unit": product.get("unit", "Kg"),
                    "opening_qty": round(opening_qty, 2),
                    "opening_price": round(opening_price, 2),
                    "purchase_qty": round(purchase_data["qty"], 2),
                    "purchase_value": round(purchase_data["value"], 2),
                    "dispatch_qty": round(dispatch_data["qty"], 2),
                    "dispatch_value": round(dispatch_data["value"], 2),
                    "closing_qty": None,
                    "wastage_qty": 0,
                    "wastage_value": 0,
                    "wastage_percent": 0,
                    "avg_price": round(avg_price, 2),
                    "status": "open"
                }
                
                await db.daily_stock_status.insert_one(status.copy())
            
            if "_id" in status:
                del status["_id"]
            result.append(status)
        
        logger.info(f"Successfully fetched {len(result)} stock status records for today")
        return result
    except Exception as e:
        logger.error(f"Error in get_today_stock_status: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load stock status: {str(e)}")

@router.post("/stock-status/close")
async def close_stock_status(entries: StockClosingBulkEntry, date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Staff enters closing quantities for products. Accepts optional date parameter for historical closes.
    VALIDATION: All products with opening stock OR purchases MUST have closing values - no partial closes allowed."""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_date = date if date else datetime.now(timezone.utc).strftime('%Y-%m-%d')
    yesterday = (datetime.strptime(target_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all products
    all_products = await db.products.find({}, {"_id": 0}).to_list(1000)
    product_map = {p["id"]: p for p in all_products}
    
    # Get yesterday's closing (for opening stock)
    yesterday_status = await db.daily_stock_status.find(
        {"date": yesterday, "status": "closed"},
        {"_id": 0}
    ).to_list(1000)
    yesterday_map = {s["product_id"]: s for s in yesterday_status}
    
    # Get existing status for target date
    existing_status = await db.daily_stock_status.find(
        {"date": target_date},
        {"_id": 0}
    ).to_list(1000)
    existing_map = {s["product_id"]: s for s in existing_status}
    
    # Get procurements for target date
    procurements = await db.procurements.find({}, {"_id": 0}).to_list(1000)
    purchases_by_product = {}
    for proc in procurements:
        proc_date = proc.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str == target_date:
            for item in proc.get("products", []):
                product_id = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                
                # Convert to Kg for Packet, Bunch, Piece, Box etc.
                unit_lower = unit.lower().strip()
                if unit_lower in ["bunch", "piece", "pack", "packet", "box", "crate", "dozen", "pcs"]:
                    weight_gm = None
                    if unit_size:
                        try:
                            weight_gm = float(unit_size)
                        except (ValueError, TypeError):
                            pass
                    if not weight_gm:
                        defaults = {'packet': 200, 'pack': 200, 'bunch': 250, 'piece': 100, 'pcs': 100}
                        weight_gm = defaults.get(unit_lower)
                    if weight_gm:
                        qty_kg = (qty * weight_gm) / 1000
                    else:
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                purchases_by_product[product_id] = purchases_by_product.get(product_id, 0) + qty_kg
    
    # Build list of all products that REQUIRE closing (opening > 0 OR purchase > 0 OR dispatch > 0, and not already closed)
    products_requiring_closing = []
    
    for product in all_products:
        product_id = product["id"]
        existing = existing_map.get(product_id, {})
        
        # Skip if already closed
        if existing.get("status") == "closed":
            continue
        
        opening_qty = existing.get("opening_qty", 0)
        if opening_qty == 0:
            # Check yesterday's closing for opening
            opening_qty = yesterday_map.get(product_id, {}).get("closing_qty", 0)
        
        purchase_qty = purchases_by_product.get(product_id, 0)
        dispatch_qty = existing.get("dispatch_qty", 0) or 0
        
        # If has opening OR purchase OR dispatch activity, it requires closing
        if opening_qty > 0 or purchase_qty > 0 or dispatch_qty != 0:
            products_requiring_closing.append({
                "product_id": product_id,
                "product_name": product.get("name", "Unknown")
            })
    
    # Validate: All required products must be in the entries
    submitted_product_ids = {e.product_id for e in entries.entries}
    required_product_ids = {p["product_id"] for p in products_requiring_closing}
    
    missing_products = required_product_ids - submitted_product_ids
    if missing_products:
        missing_names = [p["product_name"] for p in products_requiring_closing if p["product_id"] in missing_products]
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot save! Missing closing values for: {', '.join(missing_names)}"
        )
    
    updated = []
    
    for entry in entries.entries:
        # Get status for this product on the target date
        status = await db.daily_stock_status.find_one(
            {"date": target_date, "product_id": entry.product_id},
            {"_id": 0}
        )
        
        if not status:
            # Create a new record if it doesn't exist
            product = await db.products.find_one({"id": entry.product_id}, {"_id": 0})
            if not product:
                continue
            status = {
                "product_id": entry.product_id,
                "product_name": product.get("name", "Unknown"),
                "date": target_date,
                "opening_qty": 0,
                "purchase_qty": 0,
                "dispatch_qty": 0,
                "avg_price": 0,
                "status": "open"
            }
        
        closing_qty = entry.closing_qty
        opening_qty = status.get("opening_qty", 0)
        # Use FRESH procurement data instead of stored value to prevent corruption from duplicate API calls
        purchase_qty = round(purchases_by_product.get(entry.product_id, 0), 2)
        dispatch_qty = status.get("dispatch_qty", 0)
        avg_price = status.get("avg_price", 0)
        
        # If no purchase today (avg_price = 0), get the most recent purchase price for this product
        if avg_price == 0:
            # Look for the most recent stock status with a non-zero avg_price
            recent_status = await db.daily_stock_status.find_one(
                {
                    "product_id": entry.product_id,
                    "date": {"$lt": target_date},
                    "avg_price": {"$gt": 0}
                },
                {"_id": 0},
                sort=[("date", -1)]
            )
            if recent_status:
                avg_price = recent_status.get("avg_price", 0)
            else:
                # Fallback: check procurements directly
                recent_proc = await db.procurements.find(
                    {},
                    {"_id": 0}
                ).sort("date", -1).to_list(100)
                
                for proc in recent_proc:
                    for prod in proc.get("products", []):
                        if prod.get("product_id") == entry.product_id or prod.get("product_name") == status.get("product_name"):
                            if prod.get("quantity", 0) > 0:
                                avg_price = prod.get("rate_per_kg", 0) or (prod.get("total_value", 0) / prod.get("quantity", 1))
                                break
                    if avg_price > 0:
                        break
        
        # Calculate wastage: Opening + Purchase - Dispatch - Closing
        total_available = opening_qty + purchase_qty - dispatch_qty
        wastage_qty = max(0, total_available - closing_qty)
        wastage_value = wastage_qty * avg_price
        
        # Calculate wastage percentage
        total_input = opening_qty + purchase_qty
        wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
        
        # Update status - include purchase_qty to ensure correct value is stored (prevents corruption from duplicate API calls)
        update_data = {
            "purchase_qty": purchase_qty,  # Store the fresh calculated value
            "closing_qty": round(closing_qty, 2),
            "wastage_qty": round(wastage_qty, 2),
            "wastage_value": round(wastage_value, 2),
            "wastage_percent": round(wastage_percent, 2),
            "status": "closed",
            "closed_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.daily_stock_status.update_one(
            {"date": target_date, "product_id": entry.product_id},
            {"$set": {**status, **update_data}},
            upsert=True
        )


@router.post("/stock-status/recalculate-dispatches")
async def recalculate_stock_dispatches(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate dispatch quantities for ALL stock status entries on a specific date.
    This fixes closed entries that have incorrect dispatch values.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can recalculate dispatches")
    
    # Get packaging weights from QC packaging table
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    packaging_map = {}
    for p in packaging_variants:
        name = p['name']
        name_lower = name.lower().strip()
        weight = p.get('weight_gm') or extract_weight_from_packaging_name(name)
        if weight > 0:
            packaging_map[name_lower] = weight
            if 'packet' in name_lower:
                packaging_map[name_lower.replace('packet', '').strip()] = weight
            number_match = re.search(r'^(\d+)\s*(gm|g)?', name_lower)
            if number_match:
                packaging_map[number_match.group(1)] = weight
    
    # Get all products to build cost_alias mapping
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    cost_alias_id_map = {}
    for product in products:
        alias_id = product.get("cost_alias_product_id")
        if alias_id:
            cost_alias_id_map[product["id"]] = alias_id
    
    # Get all dispatches for the target date
    all_qc_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(1000)
    all_retailer_dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate dispatch totals by product (use cost_alias mapping)
    dispatches_by_product = {}
    for d in all_qc_dispatches + all_retailer_dispatches:
        dispatch_date = d.get("dispatch_date", "")
        if isinstance(dispatch_date, datetime):
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        else:
            dispatch_date_str = str(dispatch_date)[:10]
        
        if dispatch_date_str == date:
            for item in d.get("items", []):
                product_id = item.get("product_id")
                # Map to aliased product if applicable (e.g., Spinach → Palak)
                target_product_id = cost_alias_id_map.get(product_id, product_id)
                
                supplied_qty = item.get("supplied_qty", 0)
                packaging_name = (item.get("packaging_name") or item.get("variant_name") or "").lower().strip()
                
                # Get weight from packaging map
                weight_gm = packaging_map.get(packaging_name)
                if not weight_gm:
                    weight_gm = extract_weight_from_packaging_name(packaging_name)
                if not weight_gm:
                    weight_gm = 1000  # Default 1kg
                
                qty_kg = (supplied_qty * weight_gm) / 1000
                
                # Use target_product_id (mapped from alias) for aggregation
                if target_product_id not in dispatches_by_product:
                    dispatches_by_product[target_product_id] = {"qty": 0, "value": 0}
                dispatches_by_product[target_product_id]["qty"] += qty_kg
                dispatches_by_product[target_product_id]["value"] += supplied_qty * (item.get("rate") or 0)
    
    # Get all stock status entries for the date
    stock_entries = await db.daily_stock_status.find({"date": date}, {"_id": 0}).to_list(500)
    
    updated_count = 0
    updates = []
    
    for entry in stock_entries:
        product_id = entry.get("product_id")
        old_dispatch = entry.get("dispatch_qty", 0)
        
        # Get new dispatch value
        dispatch_data = dispatches_by_product.get(product_id, {"qty": 0, "value": 0})
        new_dispatch = round(dispatch_data["qty"], 2)
        
        # Only update if there's a change
        if abs(new_dispatch - old_dispatch) > 0.001:
            # Recalculate wastage if entry is closed
            update_data = {
                "dispatch_qty": new_dispatch,
                "dispatch_value": round(dispatch_data["value"], 2)
            }
            
            # If closed, recalculate wastage
            if entry.get("status") == "closed" and entry.get("closing_qty") is not None:
                opening_qty = entry.get("opening_qty", 0)
                purchase_qty = entry.get("purchase_qty", 0)
                closing_qty = entry.get("closing_qty", 0)
                avg_price = entry.get("avg_price", 0)
                
                total_available = opening_qty + purchase_qty - new_dispatch
                wastage_qty = max(0, total_available - closing_qty)
                wastage_value = wastage_qty * avg_price
                total_input = opening_qty + purchase_qty
                wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
                
                update_data.update({
                    "wastage_qty": round(wastage_qty, 2),
                    "wastage_value": round(wastage_value, 2),
                    "wastage_percent": round(wastage_percent, 2)
                })
            
            await db.daily_stock_status.update_one(
                {"date": date, "product_id": product_id},
                {"$set": update_data}
            )
            
            updates.append({
                "product_name": entry.get("product_name"),
                "old_dispatch": old_dispatch,
                "new_dispatch": new_dispatch
            })
            updated_count += 1
    
    return {
        "message": f"Recalculated {updated_count} entries for {date}",
        "updates": updates
    }



@router.post("/stock-status/recalculate-wastage-from-procurement")
async def recalculate_wastage_from_procurement(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate wastage_qty for all closed stock status entries on a specific date
    based on current procurement data.
    
    Use this when procurement was updated but wastage wasn't recalculated automatically.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all procurements for this date
    procurements = await db.procurements.find({
        "date": {"$regex": f"^{date}"}
    }, {"_id": 0}).to_list(100)
    
    # Build procurement totals per product
    procurement_by_product = {}  # product_id -> {qty_kg, value}
    for proc in procurements:
        for item in proc.get("items", []):
            product_id = item.get("product_id")
            if not product_id:
                continue
            
            qty = float(item.get("quantity", 0) or 0)
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            total_value = float(item.get("total", 0) or 0)
            
            # Convert to kg
            qty_kg = qty
            if unit in ["Bunch", "Packet", "Piece"] and unit_size:
                try:
                    qty_kg = (qty * float(unit_size)) / 1000
                except:
                    pass
            
            if product_id not in procurement_by_product:
                procurement_by_product[product_id] = {"qty_kg": 0, "value": 0}
            procurement_by_product[product_id]["qty_kg"] += qty_kg
            procurement_by_product[product_id]["value"] += total_value
    
    # Get all closed stock status for this date
    stock_entries = await db.daily_stock_status.find({
        "date": date,
        "status": "closed"
    }, {"_id": 0}).to_list(500)
    
    updated = []
    for entry in stock_entries:
        product_id = entry.get("product_id")
        record_id = entry.get("id")
        if not record_id:
            continue
        
        # Get procurement data for this product
        proc_data = procurement_by_product.get(product_id, {"qty_kg": 0, "value": 0})
        
        opening_qty = entry.get("opening_qty", 0) or 0
        current_purchase_qty = entry.get("purchase_qty", 0) or 0
        dispatch_qty = entry.get("dispatch_qty", 0) or 0
        closing_qty = entry.get("closing_qty", 0) or 0
        old_wastage_qty = entry.get("wastage_qty", 0) or 0
        
        # Calculate new purchase from procurement
        new_purchase_qty = proc_data["qty_kg"]
        new_purchase_value = proc_data["value"]
        
        # Calculate new average price
        new_avg_price = new_purchase_value / new_purchase_qty if new_purchase_qty > 0 else entry.get("avg_price", 0)
        
        # Recalculate wastage: Opening + Purchase - Dispatch - Closing
        new_wastage_qty = max(0, opening_qty + new_purchase_qty - dispatch_qty - closing_qty)
        total_input = opening_qty + new_purchase_qty
        new_wastage_pct = (new_wastage_qty / total_input * 100) if total_input > 0 else 0
        new_wastage_value = round(new_wastage_qty * new_avg_price, 2)
        
        # Only update if there's a change
        if abs(new_purchase_qty - current_purchase_qty) > 0.001 or abs(new_wastage_qty - old_wastage_qty) > 0.001:
            await db.daily_stock_status.update_one(
                {"id": record_id},
                {"$set": {
                    "purchase_qty": round(new_purchase_qty, 2),
                    "purchase_value": round(new_purchase_value, 2),
                    "wastage_qty": round(new_wastage_qty, 2),
                    "wastage_value": new_wastage_value,
                    "wastage_percent": round(new_wastage_pct, 2),
                    "avg_price": round(new_avg_price, 2)
                }}
            )
            updated.append({
                "product": entry.get("product_name"),
                "old_purchase": round(current_purchase_qty, 2),
                "new_purchase": round(new_purchase_qty, 2),
                "old_wastage": round(old_wastage_qty, 2),
                "new_wastage": round(new_wastage_qty, 2)
            })
    
    return {
        "message": f"Recalculated {len(updated)} stock entries for {date}",
        "updates": updated
    }


@router.post("/stock-status/recalculate-wastage")
async def recalculate_wastage(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate wastage_qty for all closed stock status entries on a specific date
    based on current stock status values (Opening + Purchase - Dispatch - Closing).
    
    Use this when stock status was updated directly but wastage wasn't recalculated.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all closed stock status for this date
    stock_entries = await db.daily_stock_status.find({
        "date": date,
        "status": "closed"
    }, {"_id": 0}).to_list(500)
    
    updated = []
    for entry in stock_entries:
        record_id = entry.get("id")
        if not record_id:
            continue
        
        opening_qty = entry.get("opening_qty", 0) or 0
        purchase_qty = entry.get("purchase_qty", 0) or 0
        dispatch_qty = entry.get("dispatch_qty", 0) or 0
        closing_qty = entry.get("closing_qty", 0) or 0
        old_wastage_qty = entry.get("wastage_qty", 0) or 0
        avg_price = entry.get("avg_price", 0) or 0
        
        # Recalculate wastage: Opening + Purchase - Dispatch - Closing
        new_wastage_qty = max(0, opening_qty + purchase_qty - dispatch_qty - closing_qty)
        total_input = opening_qty + purchase_qty
        new_wastage_pct = (new_wastage_qty / total_input * 100) if total_input > 0 else 0
        new_wastage_value = round(new_wastage_qty * avg_price, 2)
        
        # Only update if there's a change
        if abs(new_wastage_qty - old_wastage_qty) > 0.001:
            await db.daily_stock_status.update_one(
                {"id": record_id},
                {"$set": {
                    "wastage_qty": round(new_wastage_qty, 2),
                    "wastage_value": new_wastage_value,
                    "wastage_percent": round(new_wastage_pct, 2)
                }}
            )
            updated.append({
                "product": entry.get("product_name"),
                "opening": round(opening_qty, 2),
                "purchase": round(purchase_qty, 2),
                "dispatch": round(dispatch_qty, 2),
                "closing": round(closing_qty, 2),
                "old_wastage": round(old_wastage_qty, 2),
                "new_wastage": round(new_wastage_qty, 2)
            })
    
    return {
        "message": f"Recalculated {len(updated)} stock entries for {date}",
        "updates": updated
    }



@router.post("/stock-status/recalculate-purchase-from-procurement")
async def recalculate_purchase_from_procurement(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate purchase_qty for all stock status entries on a specific date
    by applying proper unit conversion (Bunch/Packet/Piece to kg) from procurement records.
    
    Use this to fix historical data where purchase was stored in units instead of kg.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all procurements for this date
    procurements = await db.procurements.find({
        "date": {"$regex": f"^{date}"}
    }, {"_id": 0}).to_list(100)
    
    # Build purchase totals per product with proper unit conversion
    purchase_by_product = {}  # product_id -> {qty_kg, value}
    
    for proc in procurements:
        for item in proc.get("items", []):
            product_id = item.get("product_id")
            if not product_id:
                continue
            
            qty = float(item.get("quantity", 0) or 0)
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            total_value = float(item.get("total", 0) or 0)
            rate = float(item.get("rate", 0) or 0)
            
            # Convert to kg based on unit type (Packet, Bunch, Piece, Box, etc.)
            qty_kg = qty
            if unit.lower() in ["bunch", "packet", "piece", "box", "crate", "dozen", "pack"] and unit_size:
                try:
                    qty_kg = (qty * float(unit_size)) / 1000
                except (ValueError, TypeError):
                    pass  # Keep original if conversion fails
            
            # Recalculate total value if not provided
            if total_value == 0 and rate > 0:
                total_value = qty_kg * rate
            
            if product_id not in purchase_by_product:
                purchase_by_product[product_id] = {"qty_kg": 0, "value": 0}
            purchase_by_product[product_id]["qty_kg"] += qty_kg
            purchase_by_product[product_id]["value"] += total_value
    
    # Update stock status records
    stock_entries = await db.daily_stock_status.find({"date": date}, {"_id": 0}).to_list(500)
    
    updated = []
    for entry in stock_entries:
        product_id = entry.get("product_id")
        record_id = entry.get("id")
        product_name = entry.get("product_name")
        
        if not record_id or not product_id:
            continue
        
        # Get procurement data for this product
        proc_data = purchase_by_product.get(product_id)
        if not proc_data:
            continue  # Skip if no procurement for this product
        
        current_purchase_qty = entry.get("purchase_qty", 0) or 0
        new_purchase_qty = proc_data["qty_kg"]
        new_purchase_value = proc_data["value"]
        
        # Skip if no significant change
        if abs(new_purchase_qty - current_purchase_qty) < 0.01:
            continue
        
        # Calculate new average price
        new_avg_price = new_purchase_value / new_purchase_qty if new_purchase_qty > 0 else entry.get("avg_price", 0)
        
        # Also recalculate wastage if status is closed
        opening_qty = entry.get("opening_qty", 0) or 0
        dispatch_qty = entry.get("dispatch_qty", 0) or 0
        closing_qty = entry.get("closing_qty", 0) or 0
        status = entry.get("status")
        
        update_data = {
            "purchase_qty": round(new_purchase_qty, 2),
            "purchase_value": round(new_purchase_value, 2),
            "avg_price": round(new_avg_price, 2)
        }
        
        if status == "closed" and closing_qty is not None:
            new_wastage_qty = max(0, opening_qty + new_purchase_qty - dispatch_qty - closing_qty)
            total_input = opening_qty + new_purchase_qty
            new_wastage_pct = (new_wastage_qty / total_input * 100) if total_input > 0 else 0
            new_wastage_value = round(new_wastage_qty * new_avg_price, 2)
            
            update_data.update({
                "wastage_qty": round(new_wastage_qty, 2),
                "wastage_value": new_wastage_value,
                "wastage_percent": round(new_wastage_pct, 2)
            })
        
        await db.daily_stock_status.update_one(
            {"id": record_id},
            {"$set": update_data}
        )
        
        updated.append({
            "product": product_name,
            "old_purchase": round(current_purchase_qty, 2),
            "new_purchase_kg": round(new_purchase_qty, 2)
        })
    
    return {
        "message": f"Recalculated {len(updated)} purchase quantities for {date}",
        "updates": updated
    }

@router.post("/stock-status/convert-purchase-to-kg")
async def convert_purchase_to_kg(
    date: str,
    product_name: str,
    unit_size_gm: float,
    current_user: dict = Depends(get_current_user)
):
    """
    Convert a product's purchase quantity from units (bunches/packets/pieces) to kg.
    
    Example: If purchase shows 150 (bunches) and unit_size is 500gm:
    New purchase = 150 * 500 / 1000 = 75 kg
    
    Args:
        date: Date in YYYY-MM-DD format
        product_name: Name of the product
        unit_size_gm: Size of each unit in grams
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find the stock status record
    record = await db.daily_stock_status.find_one({
        "date": date,
        "product_name": product_name
    }, {"_id": 0})
    
    if not record:
        raise HTTPException(status_code=404, detail=f"Stock status not found for {product_name} on {date}")
    
    record_id = record.get("id")
    current_purchase = record.get("purchase_qty", 0) or 0
    current_purchase_value = record.get("purchase_value", 0) or 0
    
    # Convert to kg
    new_purchase_kg = (current_purchase * unit_size_gm) / 1000
    
    # Recalculate avg_price (value stays same, qty changes)
    new_avg_price = current_purchase_value / new_purchase_kg if new_purchase_kg > 0 else record.get("avg_price", 0)
    
    # Also recalculate wastage if status is closed
    opening_qty = record.get("opening_qty", 0) or 0
    dispatch_qty = record.get("dispatch_qty", 0) or 0
    closing_qty = record.get("closing_qty", 0) or 0
    status = record.get("status")
    
    update_data = {
        "purchase_qty": round(new_purchase_kg, 2),
        "avg_price": round(new_avg_price, 2)
    }
    
    new_wastage_qty = 0
    if status == "closed" and closing_qty is not None:
        new_wastage_qty = max(0, opening_qty + new_purchase_kg - dispatch_qty - closing_qty)
        total_input = opening_qty + new_purchase_kg
        new_wastage_pct = (new_wastage_qty / total_input * 100) if total_input > 0 else 0
        new_wastage_value = round(new_wastage_qty * new_avg_price, 2)
        
        update_data.update({
            "wastage_qty": round(new_wastage_qty, 2),
            "wastage_value": new_wastage_value,
            "wastage_percent": round(new_wastage_pct, 2)
        })
    
    await db.daily_stock_status.update_one(
        {"id": record_id},
        {"$set": update_data}
    )
    
    return {
        "message": f"Converted {product_name} purchase from {current_purchase} units to {round(new_purchase_kg, 2)} kg",
        "product": product_name,
        "date": date,
        "old_purchase_units": round(current_purchase, 2),
        "new_purchase_kg": round(new_purchase_kg, 2),
        "unit_size_gm": unit_size_gm,
        "new_wastage_kg": round(new_wastage_qty, 2) if status == "closed" else None
    }


@router.post("/stock-status/recalculate-wastage-values")
async def recalculate_wastage_values(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Recalculate wastage values for stock status entries where wastage_qty > 0 but wastage_value = 0.
    Uses the most recent purchase price for that product.
    If date is provided, only recalculates for that date. Otherwise, recalculates all.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can recalculate wastage values")
    
    # Build query
    query = {"wastage_qty": {"$gt": 0}, "wastage_value": {"$in": [0, None]}}
    if date:
        query["date"] = date
    
    # Get entries with wastage but no value
    entries_to_fix = await db.daily_stock_status.find(query, {"_id": 0}).to_list(1000)
    
    if not entries_to_fix:
        return {"message": "No entries need fixing", "updated_count": 0}
    
    # Get all historical stock status to build price history
    all_status = await db.daily_stock_status.find(
        {"avg_price": {"$gt": 0}},
        {"_id": 0, "product_id": 1, "date": 1, "avg_price": 1}
    ).sort("date", -1).to_list(5000)
    
    # Build price history map: product_id -> list of {date, price} sorted by date desc
    price_history = {}
    for status in all_status:
        pid = status.get("product_id")
        if pid not in price_history:
            price_history[pid] = []
        price_history[pid].append({
            "date": status.get("date"),
            "price": status.get("avg_price", 0)
        })
    
    updated_count = 0
    updates = []
    
    for entry in entries_to_fix:
        product_id = entry.get("product_id")
        entry_date = entry.get("date")
        wastage_qty = entry.get("wastage_qty", 0)
        
        # Find the most recent price for this product before or on this date
        avg_price = 0
        if product_id in price_history:
            for price_entry in price_history[product_id]:
                if price_entry["date"] <= entry_date:
                    avg_price = price_entry["price"]
                    break
        
        if avg_price > 0:
            wastage_value = round(wastage_qty * avg_price, 2)
            
            await db.daily_stock_status.update_one(
                {"date": entry_date, "product_id": product_id},
                {"$set": {"wastage_value": wastage_value, "avg_price": avg_price}}
            )
            
            updates.append({
                "product_name": entry.get("product_name"),
                "date": entry_date,
                "wastage_qty": wastage_qty,
                "avg_price": avg_price,
                "wastage_value": wastage_value
            })
            updated_count += 1
    
    return {
        "message": f"Recalculated wastage values for {updated_count} entries",
        "updates": updates
    }


@router.post("/stock-status/fix-all-historical-dispatches")
async def fix_all_historical_dispatches(
    current_user: dict = Depends(get_current_user)
):
    """
    Fix dispatch calculations for ALL historical dates.
    This recalculates dispatches for every date in daily_stock_status,
    properly combining aliased products (e.g., Spinach → Palak).
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix historical dispatches")
    
    # Get all unique dates from daily_stock_status
    all_dates = await db.daily_stock_status.distinct("date")
    all_dates = sorted(all_dates)  # Sort chronologically
    
    if not all_dates:
        return {"message": "No stock status records found", "dates_fixed": 0, "total_updates": 0}
    
    # Get packaging weights from QC packaging table
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    packaging_map = {}
    for p in packaging_variants:
        name = p['name']
        name_lower = name.lower().strip()
        weight = p.get('weight_gm') or extract_weight_from_packaging_name(name)
        if weight > 0:
            packaging_map[name_lower] = weight
            if 'packet' in name_lower:
                packaging_map[name_lower.replace('packet', '').strip()] = weight
            number_match = re.search(r'^(\d+)\s*(gm|g)?', name_lower)
            if number_match:
                packaging_map[number_match.group(1)] = weight
    
    # Get all products to build cost_alias mapping
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    cost_alias_id_map = {}
    for product in products:
        alias_id = product.get("cost_alias_product_id")
        if alias_id:
            cost_alias_id_map[product["id"]] = alias_id
    
    # Get ALL dispatches (we'll filter by date in memory)
    all_qc_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(5000)
    all_retailer_dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(5000)
    
    # Build dispatch data by date and product
    dispatches_by_date = {}
    for d in all_qc_dispatches + all_retailer_dispatches:
        dispatch_date = d.get("dispatch_date", "")
        if isinstance(dispatch_date, datetime):
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        else:
            dispatch_date_str = str(dispatch_date)[:10]
        
        if dispatch_date_str not in dispatches_by_date:
            dispatches_by_date[dispatch_date_str] = {}
        
        for item in d.get("items", []):
            product_id = item.get("product_id")
            # Map to aliased product if applicable (e.g., Spinach → Palak)
            target_product_id = cost_alias_id_map.get(product_id, product_id)
            
            supplied_qty = item.get("supplied_qty", 0)
            packaging_name = (item.get("packaging_name") or item.get("variant_name") or "").lower().strip()
            
            # Get weight from packaging map
            weight_gm = packaging_map.get(packaging_name)
            if not weight_gm:
                weight_gm = extract_weight_from_packaging_name(packaging_name)
            if not weight_gm:
                weight_gm = 1000  # Default 1kg
            
            qty_kg = (supplied_qty * weight_gm) / 1000
            
            if target_product_id not in dispatches_by_date[dispatch_date_str]:
                dispatches_by_date[dispatch_date_str][target_product_id] = {"qty": 0, "value": 0}
            dispatches_by_date[dispatch_date_str][target_product_id]["qty"] += qty_kg
            dispatches_by_date[dispatch_date_str][target_product_id]["value"] += supplied_qty * (item.get("rate") or 0)
    
    # Process each date
    total_updated = 0
    dates_fixed = 0
    summary = []
    
    for date in all_dates:
        stock_entries = await db.daily_stock_status.find({"date": date}, {"_id": 0}).to_list(500)
        date_dispatches = dispatches_by_date.get(date, {})
        date_updates = 0
        
        for entry in stock_entries:
            product_id = entry.get("product_id")
            old_dispatch = entry.get("dispatch_qty", 0)
            
            # Get new dispatch value
            dispatch_data = date_dispatches.get(product_id, {"qty": 0, "value": 0})
            new_dispatch = round(dispatch_data["qty"], 2)
            
            # Only update if there's a change
            if abs(new_dispatch - old_dispatch) > 0.001:
                update_data = {
                    "dispatch_qty": new_dispatch,
                    "dispatch_value": round(dispatch_data["value"], 2)
                }
                
                # If closed, recalculate wastage
                if entry.get("status") == "closed" and entry.get("closing_qty") is not None:
                    opening_qty = entry.get("opening_qty", 0)
                    purchase_qty = entry.get("purchase_qty", 0)
                    closing_qty = entry.get("closing_qty", 0)
                    avg_price = entry.get("avg_price", 0)
                    
                    total_available = opening_qty + purchase_qty - new_dispatch
                    wastage_qty = max(0, total_available - closing_qty)
                    wastage_value = wastage_qty * avg_price
                    total_input = opening_qty + purchase_qty
                    wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
                    
                    update_data.update({
                        "wastage_qty": round(wastage_qty, 2),
                        "wastage_value": round(wastage_value, 2),
                        "wastage_percent": round(wastage_percent, 2)
                    })
                
                await db.daily_stock_status.update_one(
                    {"date": date, "product_id": product_id},
                    {"$set": update_data}
                )
                date_updates += 1
                total_updated += 1
        
        if date_updates > 0:
            dates_fixed += 1
            summary.append(f"{date}: {date_updates} products updated")
    
    return {
        "message": f"Fixed dispatches for {dates_fixed} dates, {total_updated} total product entries updated",
        "dates_fixed": dates_fixed,
        "total_updates": total_updated,
        "summary": summary[-10:] if len(summary) > 10 else summary  # Return last 10 dates for brevity
    }


@router.post("/stock-status/fix-all-purchase-quantities")
async def fix_all_purchase_quantities(
    current_user: dict = Depends(get_current_user)
):
    """
    Fix corrupted purchase_qty values in daily_stock_status.
    This recalculates purchase_qty by summing qty from raw procurements collection.
    Use this when Excel backup imports have bloated/incorrect purchase values.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix purchase quantities")
    
    import ast
    
    def parse_products(products):
        """Parse products array, handling string corruption from Excel imports."""
        if isinstance(products, list):
            return products
        if isinstance(products, str):
            try:
                return ast.literal_eval(products)
            except (ValueError, SyntaxError):
                return []
        return []
    
    def calculate_qty_kg(item):
        """Convert quantity to Kg based on unit type."""
        try:
            qty = float(item.get('quantity', 0) or 0)
        except (ValueError, TypeError):
            qty = 0
        unit = item.get('unit', 'Kg')
        unit_size = item.get('unit_size', '')
        
        # Convert Bunch, Packet, Piece, Box etc. to kg using unit_size (in grams)
        if unit.lower() in ['bunch', 'packet', 'piece', 'box', 'crate', 'dozen', 'pack'] and unit_size:
            try:
                weight_gm = float(unit_size)
                return (qty * weight_gm) / 1000  # Convert to kg
            except (ValueError, TypeError):
                pass
        return qty
    
    def extract_date_string(date_val):
        """Extract YYYY-MM-DD string from various date formats."""
        if date_val is None:
            return None
        if isinstance(date_val, datetime):
            return date_val.strftime('%Y-%m-%d')
        date_str = str(date_val)
        # Handle ISO format with timezone: "2026-04-05T00:00:00+00:00"
        if 'T' in date_str:
            return date_str[:10]
        # Handle simple date: "2026-04-05"
        if len(date_str) >= 10:
            return date_str[:10]
        return date_str
    
    try:
        # Step 1: Get all unique dates from daily_stock_status
        all_dates = await db.daily_stock_status.distinct("date")
        # Filter out None/empty dates and sort
        all_dates = [d for d in all_dates if d]
        all_dates = sorted(all_dates, key=lambda x: str(x) if x else "")
        
        # Step 2: Get all procurements
        all_procurements = await db.procurements.find({}).to_list(10000)
        
        # Load packaging weights for fallback lookup
        packaging_list = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
        packaging_weight_map = {}
        for p in packaging_list:
            name = p.get('name', '').strip().lower()
            weight = p.get('weight_gm', 0)
            if name and weight:
                packaging_weight_map[name] = weight
        # Add common aliases
        packaging_weight_map['packet'] = 200  # Default packet weight
        packaging_weight_map['pack'] = 200
        packaging_weight_map['bunch'] = 250  # Default bunch weight
        packaging_weight_map['piece'] = 100  # Default piece weight
        packaging_weight_map['pcs'] = 100
        
        def calculate_qty_kg_with_fallback(item):
            """Convert quantity to Kg based on unit type with fallback lookup."""
            try:
                qty = float(item.get('quantity', 0) or 0)
            except (ValueError, TypeError):
                qty = 0
            unit = item.get('unit', 'Kg')
            unit_size = item.get('unit_size', '')
            
            unit_lower = unit.lower().strip()
            
            # Convert Bunch, Packet, Piece, Box etc. to kg using unit_size (in grams)
            if unit_lower in ['bunch', 'packet', 'piece', 'box', 'crate', 'dozen', 'pack', 'pcs']:
                weight_gm = None
                
                # First try unit_size from item
                if unit_size:
                    try:
                        weight_gm = float(unit_size)
                    except (ValueError, TypeError):
                        pass
                
                # Fallback to packaging lookup
                if not weight_gm:
                    weight_gm = packaging_weight_map.get(unit_lower, None)
                
                if weight_gm:
                    return (qty * weight_gm) / 1000  # Convert to kg
            
            return qty
        
        # Build lookup: date -> product_id -> {qty_kg, total_value}
        purchases_by_date_product = {}
        
        for proc in all_procurements:
            try:
                proc_date = extract_date_string(proc.get('date'))
                if not proc_date:
                    continue
                
                if proc_date not in purchases_by_date_product:
                    purchases_by_date_product[proc_date] = {}
                
                products = parse_products(proc.get('products', []))
                
                for item in products:
                    if not item or not isinstance(item, dict):
                        continue
                    product_id = item.get('product_id', '')
                    if not product_id:
                        continue
                    
                    qty_kg = calculate_qty_kg_with_fallback(item)
                    
                    try:
                        total_value = float(item.get('total', 0) or 0)
                    except (ValueError, TypeError):
                        total_value = 0
                    
                    if product_id not in purchases_by_date_product[proc_date]:
                        purchases_by_date_product[proc_date][product_id] = {
                            'qty_kg': 0,
                            'total_value': 0
                        }
                    
                    purchases_by_date_product[proc_date][product_id]['qty_kg'] += qty_kg
                    purchases_by_date_product[proc_date][product_id]['total_value'] += total_value
            except Exception as proc_error:
                print(f"Error processing procurement {proc.get('id')}: {proc_error}")
                continue
        
        # Step 3: Fix each daily_stock_status record
        total_fixed = 0
        total_unchanged = 0
        fixes_summary = []
        
        for date in all_dates:
            try:
                stock_entries = await db.daily_stock_status.find({"date": date}).to_list(500)
                date_purchases = purchases_by_date_product.get(str(date), {})
                date_fixes = []
                
                for entry in stock_entries:
                    try:
                        product_id = entry.get('product_id')
                        product_name = entry.get('product_name')
                        try:
                            current_purchase_qty = float(entry.get('purchase_qty', 0) or 0)
                        except (ValueError, TypeError):
                            current_purchase_qty = 0
                        
                        # Calculate correct purchase_qty from procurements
                        product_purchase = date_purchases.get(product_id, {'qty_kg': 0, 'total_value': 0})
                        correct_purchase_qty = round(product_purchase['qty_kg'], 2)
                        correct_purchase_value = round(product_purchase['total_value'], 2)
                        
                        # Get current purchase_value
                        try:
                            current_purchase_value = float(entry.get('purchase_value', 0) or 0)
                        except (ValueError, TypeError):
                            current_purchase_value = 0
                        
                        # Check if update needed (compare both qty and value)
                        qty_diff = abs(current_purchase_qty - correct_purchase_qty)
                        value_diff = abs(current_purchase_value - correct_purchase_value)
                        
                        # Compare with stock_status
                        if qty_diff > 0.01 or value_diff > 0.01:  # Significant difference in qty OR value
                            # Log what we're fixing
                            print(f"FIXING: {product_name} on {date}: {current_purchase_qty} -> {correct_purchase_qty}")
                            
                            # Calculate new avg_price
                            avg_price = 0
                            if correct_purchase_qty > 0:
                                avg_price = round(correct_purchase_value / correct_purchase_qty, 2)
                            
                            # Recalculate wastage_value based on new avg_price
                            wastage_qty = float(entry.get('wastage_qty', 0) or 0)
                            new_wastage_value = round(wastage_qty * avg_price, 2)
                            
                            # Update record
                            await db.daily_stock_status.update_one(
                                {"id": entry['id']},
                                {"$set": {
                                    "purchase_qty": correct_purchase_qty,
                                    "purchase_value": correct_purchase_value,
                                    "avg_price": avg_price,
                                    "wastage_value": new_wastage_value
                                }}
                            )
                            
                            date_fixes.append({
                                "product": product_name,
                                "old": current_purchase_qty,
                                "new": correct_purchase_qty,
                                "new_wastage_value": new_wastage_value
                            })
                            total_fixed += 1
                        else:
                            total_unchanged += 1
                    except Exception as entry_error:
                        print(f"Error processing entry {entry.get('id')}: {entry_error}")
                        continue
            
                if date_fixes:
                    fixes_summary.append({"date": str(date), "fixes": date_fixes[:5]})  # Limit to 5 per date
            except Exception as date_error:
                print(f"Error processing date {date}: {date_error}")
                continue
        
        return {
            "message": f"Fixed {total_fixed} records, {total_unchanged} unchanged",
            "total_fixed": total_fixed,
            "total_unchanged": total_unchanged,
            "summary": fixes_summary[-5:]  # Return last 5 dates
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in fix_all_purchase_quantities: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error fixing purchase quantities: {str(e)}")


@router.get("/stock-status/history")
async def get_stock_status_history(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    product_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get historical stock status data with proper opening stock and purchases calculated.
    Opening stock = previous day's closing stock
    Purchases = from procurements for that date
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # If viewing a single specific date, calculate opening and purchases dynamically
    if from_date and to_date and from_date == to_date:
        target_date = from_date
        # Calculate previous day for opening stock
        from datetime import datetime, timedelta
        target_dt = datetime.strptime(target_date, '%Y-%m-%d')
        previous_day = (target_dt - timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Get previous day's closed stock status (for opening)
        previous_status = await db.daily_stock_status.find(
            {"date": previous_day, "status": "closed"},
            {"_id": 0}
        ).to_list(1000)
        previous_map = {s["product_id"]: s for s in previous_status}
        
        # Get target date's status
        target_status = await db.daily_stock_status.find(
            {"date": target_date},
            {"_id": 0}
        ).to_list(1000)
        target_map = {s["product_id"]: s for s in target_status}
        
        # Get procurements for target date (purchases from farmers)
        procurements = await db.procurements.find({
            "date": {"$regex": f"^{target_date}"}
        }, {"_id": 0}).to_list(1000)
        
        # Calculate purchases by product
        purchases_by_product = {}
        for proc in procurements:
            for item in proc.get("products", []):
                product_id_item = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                rate = item.get("rate", 0)
                total_value = item.get("total", qty * rate)
                
                # Convert to Kg for Packet, Bunch, Piece, Box etc.
                unit_lower = unit.lower().strip()
                if unit_lower in ["bunch", "piece", "pack", "packet", "box", "crate", "dozen", "pcs"]:
                    weight_gm = None
                    if unit_size:
                        try:
                            weight_gm = float(unit_size)
                        except (ValueError, TypeError):
                            pass
                    if not weight_gm:
                        defaults = {'packet': 200, 'pack': 200, 'bunch': 250, 'piece': 100, 'pcs': 100}
                        weight_gm = defaults.get(unit_lower)
                    if weight_gm:
                        qty_kg = (qty * weight_gm) / 1000
                    else:
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                if product_id_item not in purchases_by_product:
                    purchases_by_product[product_id_item] = {"qty": 0, "value": 0}
                purchases_by_product[product_id_item]["qty"] += qty_kg
                purchases_by_product[product_id_item]["value"] += total_value
        
        # Get all products
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        products_map = {p["id"]: p for p in products}
        
        # Build result with proper opening and purchases
        result = []
        processed_products = set()
        
        # First, process products that have data in target_status
        for prod_id, status in target_map.items():
            processed_products.add(prod_id)
            prev_status = previous_map.get(prod_id, {})
            purchase_data = purchases_by_product.get(prod_id, {"qty": 0, "value": 0})
            
            # Opening = previous day's closing (if closed)
            opening_qty = prev_status.get("closing_qty", 0) or 0
            opening_value = prev_status.get("closing_value", 0) or 0
            
            # If status has opening but prev doesn't have closing, use the status opening
            if opening_qty == 0 and status.get("opening_qty", 0) > 0:
                opening_qty = status.get("opening_qty", 0)
                opening_value = status.get("opening_value", 0)
            
            # Use fresh purchase data
            fresh_purchase_qty = round(purchase_data["qty"], 2)
            
            # Build result object
            result_item = {
                **status,
                "opening_qty": round(opening_qty, 2),
                "opening_value": round(opening_value, 2),
                "purchase_qty": fresh_purchase_qty,
                "purchase_value": round(purchase_data["value"], 2)
            }
            
            # For CLOSED entries, recalculate wastage using fresh purchase data
            # This prevents showing corrupted wastage values from database
            if status.get("status") == "closed":
                dispatch_qty = status.get("dispatch_qty", 0) or 0
                closing_qty = status.get("closing_qty", 0) or 0
                avg_price = status.get("avg_price", 0) or 0
                
                total_available = opening_qty + fresh_purchase_qty - dispatch_qty
                wastage_qty = max(0, total_available - closing_qty)
                total_input = opening_qty + fresh_purchase_qty
                wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
                wastage_value = wastage_qty * avg_price
                
                result_item["wastage_qty"] = round(wastage_qty, 2)
                result_item["wastage_value"] = round(wastage_value, 2)
                result_item["wastage_percent"] = round(wastage_percent, 2)
            
            result.append(result_item)
        
        # Then, add products that have purchases but no status record
        for prod_id, purchase_data in purchases_by_product.items():
            if prod_id not in processed_products and purchase_data["qty"] > 0:
                processed_products.add(prod_id)
                product = products_map.get(prod_id, {})
                prev_status = previous_map.get(prod_id, {})
                
                opening_qty = prev_status.get("closing_qty", 0) or 0
                opening_value = prev_status.get("closing_value", 0) or 0
                
                result.append({
                    "id": f"{target_date}-{prod_id}",
                    "date": target_date,
                    "product_id": prod_id,
                    "product_name": product.get("name", "Unknown"),
                    "unit": product.get("default_unit", "Kg"),
                    "opening_qty": round(opening_qty, 2),
                    "opening_value": round(opening_value, 2),
                    "purchase_qty": round(purchase_data["qty"], 2),
                    "purchase_value": round(purchase_data["value"], 2),
                    "dispatch_qty": 0,
                    "dispatch_value": 0,
                    "wastage_qty": 0,
                    "wastage_value": 0,
                    "closing_qty": 0,
                    "closing_value": 0,
                    "status": "open"
                })
        
        # Finally, add products that have opening from previous day but no activity today
        for prod_id, prev_status in previous_map.items():
            if prod_id not in processed_products:
                closing_qty = prev_status.get("closing_qty", 0) or 0
                if closing_qty > 0:
                    processed_products.add(prod_id)
                    product = products_map.get(prod_id, {})
                    
                    result.append({
                        "id": f"{target_date}-{prod_id}",
                        "date": target_date,
                        "product_id": prod_id,
                        "product_name": product.get("name", prev_status.get("product_name", "Unknown")),
                        "unit": product.get("default_unit", prev_status.get("unit", "Kg")),
                        "opening_qty": round(closing_qty, 2),
                        "opening_value": round(prev_status.get("closing_value", 0) or 0, 2),
                        "purchase_qty": 0,
                        "purchase_value": 0,
                        "dispatch_qty": 0,
                        "dispatch_value": 0,
                        "wastage_qty": 0,
                        "wastage_value": 0,
                        "closing_qty": 0,
                        "closing_value": 0,
                        "status": "open"
                    })
        
        return result
    
    # For date ranges, return raw historical data
    query = {}
    if from_date:
        query["date"] = {"$gte": from_date}
    if to_date:
        if "date" in query:
            query["date"]["$lte"] = to_date
        else:
            query["date"] = {"$lte": to_date}
    if product_id:
        query["product_id"] = product_id
    
    history = await db.daily_stock_status.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return history


@router.post("/procurement/bulk-update-rate")
async def bulk_update_procurement_rate(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Bulk update procurement rate for a product across multiple dates.
    This updates both procurement and daily_stock_status (including wastage_value).
    
    Input:
    {
        "product_name": "Curry Leaves",
        "new_rate": 75,
        "from_date": "2026-04-01",  // Optional, defaults to all time
        "to_date": "2026-04-08"     // Optional, defaults to today
    }
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can bulk update rates")
    
    product_name = input.get("product_name")
    new_rate = input.get("new_rate")
    from_date = input.get("from_date")
    to_date = input.get("to_date")
    
    if not product_name or new_rate is None:
        raise HTTPException(status_code=400, detail="product_name and new_rate are required")
    
    try:
        new_rate = float(new_rate)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="new_rate must be a number")
    
    # Find procurements with this product
    proc_query = {}
    if from_date:
        proc_query["date"] = {"$gte": from_date}
    if to_date:
        if "date" in proc_query:
            proc_query["date"]["$lte"] = to_date + "T23:59:59Z"
        else:
            proc_query["date"] = {"$lte": to_date + "T23:59:59Z"}
    
    procurements = await db.procurements.find(proc_query, {"_id": 0}).to_list(1000)
    
    updated_procurements = 0
    updated_stock_status = 0
    
    for proc in procurements:
        products = proc.get("products", [])
        proc_updated = False
        
        for product in products:
            if product.get("product_name") == product_name:
                # Update rate and total
                old_total = product.get("total", 0)
                qty = product.get("quantity", 0)
                new_total = round(qty * new_rate, 2)
                
                product["rate"] = new_rate
                product["total"] = new_total
                proc_updated = True
        
        if proc_updated:
            # Update procurement in database
            await db.procurements.update_one(
                {"id": proc["id"]},
                {"$set": {"products": products}}
            )
            updated_procurements += 1
            
            # Also update daily_stock_status
            proc_date = proc.get("date", "")[:10]  # Extract date part
            
            # Find product_id
            product_doc = await db.products.find_one({"name": product_name}, {"_id": 0})
            if product_doc:
                product_id = product_doc.get("id")
                
                # Calculate new purchase_value from updated procurement
                new_purchase_value = 0
                new_purchase_qty = 0
                for product in products:
                    if product.get("product_name") == product_name:
                        new_purchase_qty += product.get("quantity", 0)
                        new_purchase_value += product.get("total", 0)
                
                # Calculate new avg_price and wastage_value
                avg_price = new_purchase_value / new_purchase_qty if new_purchase_qty > 0 else 0
                
                # Get wastage_qty from current stock status
                stock_status = await db.daily_stock_status.find_one(
                    {"date": proc_date, "product_id": product_id},
                    {"_id": 0}
                )
                
                if stock_status:
                    wastage_qty = stock_status.get("wastage_qty", 0) or 0
                    new_wastage_value = round(wastage_qty * avg_price, 2)
                    
                    await db.daily_stock_status.update_one(
                        {"date": proc_date, "product_id": product_id},
                        {"$set": {
                            "purchase_value": new_purchase_value,
                            "avg_price": avg_price,
                            "wastage_value": new_wastage_value
                        }}
                    )
                    updated_stock_status += 1
    
    return {
        "message": f"Updated {updated_procurements} procurements and {updated_stock_status} stock status records",
        "product_name": product_name,
        "new_rate": new_rate,
        "updated_procurements": updated_procurements,
        "updated_stock_status": updated_stock_status
    }


@router.post("/stock-status/fix-all-wastage-values")
async def fix_all_wastage_values(
    current_user: dict = Depends(get_current_user)
):
    """
    Fix all historical wastage_value in daily_stock_status based on avg_price.
    If no purchase exists for that day, uses historical price from recent purchases.
    
    Use this to sync wastage values after any procurement rate changes or to fix
    past records where wastage_value was incorrectly set to 0.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix wastage values")
    
    try:
        # Get all stock status records sorted by date
        all_status = await db.daily_stock_status.find({}, {"_id": 0}).sort("date", 1).to_list(10000)
        
        # Build historical price cache per product (most recent purchase price)
        historical_prices = {}  # product_id -> {price, date}
        
        # First pass: collect all prices from records with purchases
        for status in all_status:
            product_id = status.get("product_id", "")
            purchase_qty = status.get("purchase_qty", 0) or 0
            purchase_value = status.get("purchase_value", 0) or 0
            date = status.get("date", "")
            
            if purchase_qty > 0 and product_id:
                avg_price = purchase_value / purchase_qty
                # Always update to track the most recent
                historical_prices[product_id] = {"price": avg_price, "date": date}
        
        updated_count = 0
        unchanged_count = 0
        fixes_by_product = {}
        
        # Build a running historical price tracker for fallback
        running_prices = {}  # product_id -> most recent price up to current date
        
        for status in all_status:
            record_id = status.get("id")
            product_id = status.get("product_id", "")
            if not record_id:
                continue
                
            wastage_qty = status.get("wastage_qty", 0) or 0
            purchase_qty = status.get("purchase_qty", 0) or 0
            purchase_value = status.get("purchase_value", 0) or 0
            current_wastage_value = status.get("wastage_value", 0) or 0
            product_name = status.get("product_name", "Unknown")
            date = status.get("date", "")
            
            # Update running prices if this record has purchases
            if purchase_qty > 0 and product_id:
                running_prices[product_id] = purchase_value / purchase_qty
            
            # Calculate avg_price - use current day's price or fallback to historical
            if purchase_qty > 0:
                avg_price = purchase_value / purchase_qty
            elif product_id in running_prices:
                # Fallback to most recent historical price
                avg_price = running_prices[product_id]
            elif product_id in historical_prices:
                # Fallback to any known historical price
                avg_price = historical_prices[product_id]["price"]
            else:
                avg_price = 0
            
            correct_wastage_value = round(wastage_qty * avg_price, 2)
            
            # Check if update needed
            diff = abs(current_wastage_value - correct_wastage_value)
            if diff > 0.01 and wastage_qty > 0:
                # Update the record
                await db.daily_stock_status.update_one(
                    {"id": record_id},
                    {"$set": {
                        "wastage_value": correct_wastage_value,
                        "avg_price": round(avg_price, 2)
                    }}
                )
                updated_count += 1
                
                # Track by product
                if product_name not in fixes_by_product:
                    fixes_by_product[product_name] = []
                fixes_by_product[product_name].append({
                    "date": date,
                    "wastage_qty": wastage_qty,
                    "old_value": current_wastage_value,
                    "new_value": correct_wastage_value,
                    "avg_price": round(avg_price, 2),
                    "used_historical": purchase_qty == 0
                })
            else:
                unchanged_count += 1
        
        return {
            "message": f"Fixed {updated_count} records, {unchanged_count} unchanged",
            "total_fixed": updated_count,
            "total_unchanged": unchanged_count,
            "fixes_by_product": {k: v for k, v in list(fixes_by_product.items())[:10]}  # Limit output
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in fix_all_wastage_values: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error fixing wastage values: {str(e)}")



@router.post("/stock-status/fix-corrupted-purchase-qty")
async def fix_corrupted_purchase_qty(
    target_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Fix corrupted purchase_qty in daily_stock_status by recalculating from actual procurement records.
    This fixes issues where purchase_qty was incorrectly multiplied due to duplicate API calls.
    
    If target_date is provided, only fixes that date. Otherwise fixes all dates.
    Also recalculates wastage_qty and wastage_percent for closed entries.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix stock status data")
    
    try:
        # Get all procurements
        all_procurements = await db.procurements.find({}, {"_id": 0}).to_list(10000)
        
        # Build purchases_by_date_product: {date: {product_id: {qty: X, value: Y}}}
        purchases_by_date_product = {}
        for proc in all_procurements:
            proc_date = proc.get("date", "")
            if isinstance(proc_date, datetime):
                proc_date_str = proc_date.strftime('%Y-%m-%d')
            else:
                proc_date_str = str(proc_date)[:10]
            
            if target_date and proc_date_str != target_date:
                continue
            
            if proc_date_str not in purchases_by_date_product:
                purchases_by_date_product[proc_date_str] = {}
            
            for item in proc.get("products", []):
                product_id = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                total_value = item.get("total", qty * item.get("rate", 0))
                
                # Convert to Kg
                if unit.lower() in ["bunch", "piece", "pack"] and unit_size:
                    try:
                        weight_per_unit_gm = float(unit_size)
                        qty_kg = (qty * weight_per_unit_gm) / 1000
                    except (ValueError, TypeError):
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                if product_id not in purchases_by_date_product[proc_date_str]:
                    purchases_by_date_product[proc_date_str][product_id] = {"qty": 0, "value": 0}
                purchases_by_date_product[proc_date_str][product_id]["qty"] += qty_kg
                purchases_by_date_product[proc_date_str][product_id]["value"] += total_value
        
        # Get all stock status records to fix
        query = {"date": target_date} if target_date else {}
        all_statuses = await db.daily_stock_status.find(query, {"_id": 0}).to_list(10000)
        
        fixed_count = 0
        corrupted_found = []
        
        for status in all_statuses:
            date = status.get("date", "")
            product_id = status.get("product_id", "")
            product_name = status.get("product_name", "Unknown")
            stored_purchase_qty = status.get("purchase_qty", 0) or 0
            
            # Get expected purchase_qty from procurements
            expected_purchase = 0
            if date in purchases_by_date_product and product_id in purchases_by_date_product[date]:
                expected_purchase = round(purchases_by_date_product[date][product_id]["qty"], 2)
            
            # Check if corrupted (difference > 0.01)
            if abs(stored_purchase_qty - expected_purchase) > 0.01:
                corrupted_found.append({
                    "date": date,
                    "product_name": product_name,
                    "stored": stored_purchase_qty,
                    "expected": expected_purchase
                })
                
                # Build update
                update_data = {"purchase_qty": expected_purchase}
                
                # If closed, also recalculate wastage
                if status.get("status") == "closed":
                    opening_qty = status.get("opening_qty", 0) or 0
                    dispatch_qty = status.get("dispatch_qty", 0) or 0
                    closing_qty = status.get("closing_qty", 0) or 0
                    avg_price = status.get("avg_price", 0) or 0
                    
                    total_available = opening_qty + expected_purchase - dispatch_qty
                    wastage_qty = max(0, total_available - closing_qty)
                    total_input = opening_qty + expected_purchase
                    wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
                    wastage_value = wastage_qty * avg_price
                    
                    update_data["wastage_qty"] = round(wastage_qty, 2)
                    update_data["wastage_value"] = round(wastage_value, 2)
                    update_data["wastage_percent"] = round(wastage_percent, 2)
                
                # Use product_id + date as unique identifier if id is missing
                if status.get("id"):
                    await db.daily_stock_status.update_one(
                        {"id": status["id"]},
                        {"$set": update_data}
                    )
                else:
                    await db.daily_stock_status.update_one(
                        {"date": date, "product_id": product_id},
                        {"$set": update_data}
                    )
                fixed_count += 1
        
        return {
            "message": f"Fixed {fixed_count} corrupted stock status records",
            "corrupted_records": corrupted_found,
            "total_scanned": len(all_statuses)
        }
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in fix_corrupted_purchase_qty: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error fixing corrupted data: {str(e)}")


@router.get("/stock-status/closable-products")
async def get_closable_products_for_date(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get products that need closing for a specific date - products with activity (opening > 0, purchased, or dispatched)"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_date = date
    yesterday = (datetime.strptime(target_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all products
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    
    # Get yesterday's closing stock (for opening)
    yesterday_status = await db.daily_stock_status.find(
        {"date": yesterday, "status": "closed"},
        {"_id": 0}
    ).to_list(1000)
    yesterday_map = {s["product_id"]: s for s in yesterday_status}
    
    # Get existing status for target date (from daily_stock_status table)
    existing_status = await db.daily_stock_status.find(
        {"date": target_date},
        {"_id": 0}
    ).to_list(1000)
    existing_map = {s["product_id"]: s for s in existing_status}
    
    # Get procurements for target date (check multiple date formats)
    procurements = await db.procurements.find({}, {"_id": 0}).to_list(1000)
    purchases_by_product = {}
    for proc in procurements:
        proc_date = proc.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str == target_date:
            for item in proc.get("products", []):
                product_id = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                
                # Convert to Kg
                if unit.lower() in ["bunch", "piece", "pack"] and unit_size:
                    try:
                        weight_per_unit_gm = float(unit_size)
                        qty_kg = (qty * weight_per_unit_gm) / 1000
                    except (ValueError, TypeError):
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                purchases_by_product[product_id] = purchases_by_product.get(product_id, 0) + qty_kg
    
    # Get dispatches for target date
    all_qc_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(1000)
    all_retailer_dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(1000)
    
    # Get packaging weights from QC packaging table
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    # Build packaging map: name -> weight_gm
    packaging_map = {}
    for p in packaging_variants:
        name = p['name']
        name_lower = name.lower().strip()
        # Use stored weight_gm if available, otherwise extract from name
        weight = p.get('weight_gm') or extract_weight_from_packaging_name(name)
        if weight > 0:
            packaging_map[name_lower] = weight
            # Also store without common suffixes for flexible matching
            if 'packet' in name_lower:
                packaging_map[name_lower.replace('packet', '').strip()] = weight
            # Store just the number version (e.g., "500 gm" also stored as "500")
            number_match = re.search(r'^(\d+)\s*(gm|g)?', name_lower)
            if number_match:
                packaging_map[number_match.group(1)] = weight
    
    dispatches_by_product = {}
    
    # Build cost_alias mapping: product_id -> alias_target_id
    # If a product has cost_alias_product_id, its dispatches should count under the alias target
    cost_alias_id_map = {}
    for product in products:
        alias_id = product.get("cost_alias_product_id")
        if alias_id:
            cost_alias_id_map[product["id"]] = alias_id
    
    for d in all_qc_dispatches + all_retailer_dispatches:
        dispatch_date = d.get("dispatch_date", "")
        if isinstance(dispatch_date, datetime):
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        else:
            dispatch_date_str = str(dispatch_date)[:10]
        
        if dispatch_date_str == target_date:
            for item in d.get("items", []):
                product_id = item.get("product_id")
                # Map to aliased product if applicable (e.g., Spinach dispatches → count under Palak)
                target_product_id = cost_alias_id_map.get(product_id, product_id)
                
                supplied_qty = item.get("supplied_qty", 0)
                # Check both packaging_name (QC) and variant_name (Retail)
                packaging_name = (item.get("packaging_name") or item.get("variant_name") or "").lower().strip()
                
                # Look up weight from packaging map first
                weight_gm = packaging_map.get(packaging_name)
                
                # If not found, try extracting from the packaging name
                if not weight_gm:
                    weight_gm = extract_weight_from_packaging_name(packaging_name)
                
                # If still not found, assume bulk (1kg)
                if not weight_gm:
                    weight_gm = 1000
                
                qty_kg = (supplied_qty * weight_gm) / 1000
                # Use target_product_id (mapped from alias) for aggregation
                dispatches_by_product[target_product_id] = dispatches_by_product.get(target_product_id, 0) + qty_kg
    
    # Build closable products list
    closable_products = []
    
    # First, include all products that have existing status records for this date
    for product_id, existing in existing_map.items():
        product = next((p for p in products if p["id"] == product_id), None)
        if not product:
            continue
            
        product_name = product["name"]
        status = existing.get("status", "open")
        closing_qty = existing.get("closing_qty", None)
        
        # For opening_qty, ALWAYS use yesterday's closing if available
        # This ensures opening stock is correctly carried over from previous day
        if product_id in yesterday_map:
            opening_qty = yesterday_map[product_id].get("closing_qty", 0) or 0
        else:
            opening_qty = existing.get("opening_qty", 0) or 0
        
        # For OPEN entries, always use FRESH procurement and dispatch data (real-time sync)
        if status == "open":
            purchase_qty = round(purchases_by_product.get(product_id, 0), 2)
            dispatch_qty = round(dispatches_by_product.get(product_id, 0), 2)
            
            # Skip products with no activity (opening=0, purchase=0, dispatch=0)
            # Include products with non-zero dispatch (even negative for corrections)
            if opening_qty == 0 and purchase_qty == 0 and dispatch_qty == 0:
                continue
            
            # Update the stored entry with fresh data AND correct opening
            await db.daily_stock_status.update_one(
                {"id": existing["id"]},
                {"$set": {"purchase_qty": purchase_qty, "dispatch_qty": dispatch_qty, "opening_qty": opening_qty}}
            )
        else:
            # For CLOSED entries, also use fresh procurement data (prevents showing corrupted values)
            purchase_qty = round(purchases_by_product.get(product_id, 0), 2)
            dispatch_qty = round(dispatches_by_product.get(product_id, 0), 2)
        
        closable_products.append({
            "product_id": product_id,
            "product_name": product_name,
            "opening_qty": round(opening_qty, 2),
            "purchase_qty": round(purchase_qty, 2),
            "dispatch_qty": round(dispatch_qty, 2),
            "closing_qty": closing_qty,
            "status": status
        })
    
    # Then, add any products with activity that don't have existing status records
    for product in products:
        product_id = product["id"]
        if product_id in existing_map:
            continue  # Already added above
            
        product_name = product["name"]
        
        # Opening = yesterday's closing
        opening_qty = yesterday_map.get(product_id, {}).get("closing_qty", 0)
        
        # Purchase and dispatch quantities from today's transactions
        purchase_qty = round(purchases_by_product.get(product_id, 0), 2)
        dispatch_qty = round(dispatches_by_product.get(product_id, 0), 2)
        
        # Only include if there's activity (opening > 0, purchased, or dispatched)
        if opening_qty > 0 or purchase_qty > 0 or dispatch_qty > 0:
            closable_products.append({
                "product_id": product_id,
                "product_name": product_name,
                "opening_qty": round(opening_qty, 2),
                "purchase_qty": purchase_qty,
                "dispatch_qty": dispatch_qty,
                "closing_qty": None,
                "status": "open"
            })
    
    return closable_products


@router.get("/stock-status/wastage-dashboard")
async def get_wastage_dashboard(
    days: int = 7,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get wastage dashboard data with trends"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Use custom dates if provided, otherwise use days parameter
    if from_date and to_date:
        start_date = from_date
        end_date = to_date
    else:
        end_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d')
    
    history = await db.daily_stock_status.find(
        {"date": {"$gte": start_date, "$lte": end_date}, "status": "closed"},
        {"_id": 0}
    ).to_list(5000)
    
    # Aggregate by date
    daily_totals = {}
    product_totals = {}
    
    for record in history:
        date = record["date"]
        product_name = record["product_name"]
        wastage_qty = record.get("wastage_qty", 0)
        wastage_percent = record.get("wastage_percent", 0)
        opening_qty = record.get("opening_qty", 0)
        purchase_qty = record.get("purchase_qty", 0)
        purchase_value = record.get("purchase_value", 0)
        
        # Calculate wastage_value dynamically based on current avg_price
        # This ensures wastage value reflects latest procurement rate
        avg_price = purchase_value / purchase_qty if purchase_qty > 0 else 0
        wastage_value = round(wastage_qty * avg_price, 2)
        
        # Daily totals
        if date not in daily_totals:
            daily_totals[date] = {
                "date": date,
                "total_wastage_kg": 0,
                "total_wastage_value": 0,
                "total_input": 0,
                "avg_wastage_percent": 0
            }
        daily_totals[date]["total_wastage_kg"] += wastage_qty
        daily_totals[date]["total_wastage_value"] += wastage_value
        daily_totals[date]["total_input"] += opening_qty + purchase_qty
        
        # Product totals
        if product_name not in product_totals:
            product_totals[product_name] = {
                "product_name": product_name,
                "total_wastage_kg": 0,
                "total_wastage_value": 0,
                "total_input": 0,
                "wastage_percent": 0,
                "days_count": 0
            }
        product_totals[product_name]["total_wastage_kg"] += wastage_qty
        product_totals[product_name]["total_wastage_value"] += wastage_value
        product_totals[product_name]["total_input"] += opening_qty + purchase_qty
        product_totals[product_name]["days_count"] += 1
    
    # Calculate averages for daily data
    for date in daily_totals:
        total_input = daily_totals[date]["total_input"]
        if total_input > 0:
            daily_totals[date]["avg_wastage_percent"] = round(
                (daily_totals[date]["total_wastage_kg"] / total_input) * 100, 2
            )
        daily_totals[date]["total_wastage_kg"] = round(daily_totals[date]["total_wastage_kg"], 2)
        daily_totals[date]["total_wastage_value"] = round(daily_totals[date]["total_wastage_value"], 2)
    
    # Sort daily data by date
    daily_data = sorted(daily_totals.values(), key=lambda x: x["date"])
    
    # Calculate wastage_percent for each product
    for product_name in product_totals:
        total_input = product_totals[product_name]["total_input"]
        if total_input > 0:
            product_totals[product_name]["wastage_percent"] = round(
                (product_totals[product_name]["total_wastage_kg"] / total_input) * 100, 2
            )
        product_totals[product_name]["total_wastage_kg"] = round(product_totals[product_name]["total_wastage_kg"], 2)
        product_totals[product_name]["total_wastage_value"] = round(product_totals[product_name]["total_wastage_value"], 2)
    
    # Top wastage products - sorted by wastage_percent descending
    product_data = sorted(product_totals.values(), key=lambda x: x["wastage_percent"], reverse=True)[:15]
    
    # Overall summary
    total_wastage_kg = sum(d["total_wastage_kg"] for d in daily_data)
    total_wastage_value = sum(d["total_wastage_value"] for d in daily_data)
    total_input = sum(d["total_input"] for d in daily_data)
    avg_daily_wastage = total_wastage_kg / len(daily_data) if daily_data else 0
    overall_wastage_percent = (total_wastage_kg / total_input * 100) if total_input > 0 else 0
    
    return {
        "period_days": days,
        "start_date": start_date,
        "end_date": end_date,
        "summary": {
            "total_wastage_kg": round(total_wastage_kg, 2),
            "total_wastage_value": round(total_wastage_value, 2),
            "avg_daily_wastage_kg": round(avg_daily_wastage, 2),
            "overall_wastage_percent": round(overall_wastage_percent, 2)
        },
        "daily_trend": daily_data,
        "top_wastage_products": product_data
    }

@router.get("/stock-status/yesterday-wastage")
async def get_yesterday_wastage(current_user: dict = Depends(get_current_user)):
    """Get product-wise wastage for previous day (includes closed entries and pending entries with calculated wastage)"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all stock status for yesterday (both closed and pending)
    yesterday_records = await db.daily_stock_status.find(
        {"date": yesterday},
        {"_id": 0}
    ).to_list(500)
    
    # Aggregate wastage by product (sum up QC + Retail entries for same product)
    product_wastage = {}
    
    for record in yesterday_records:
        product_name = record.get("product_name", "Unknown")
        product_id = record.get("product_id", "")
        
        # Get values
        wastage_qty = record.get("wastage_qty", 0) or 0
        opening_qty = record.get("opening_qty", 0) or 0
        purchase_qty = record.get("purchase_qty", 0) or 0
        purchase_value = record.get("purchase_value", 0) or 0
        dispatch_qty = record.get("dispatch_qty", 0) or 0
        closing_qty = record.get("closing_qty", 0) or 0
        status = record.get("status", "pending")
        
        # Calculate avg_price from current procurement data
        avg_price = purchase_value / purchase_qty if purchase_qty > 0 else 0
        
        # Calculate wastage_value dynamically based on current avg_price
        wastage_value = round(wastage_qty * avg_price, 2)
        
        # For pending entries, calculate potential wastage if not closed
        if status != "closed" and wastage_qty == 0:
            # Available = opening + purchase
            available = opening_qty + purchase_qty
            # If no closing recorded, estimate wastage as available - dispatch
            if available > 0 and closing_qty == 0:
                wastage_qty = max(0, available - dispatch_qty)
                # Estimate value using average procurement price
                wastage_value = round(wastage_qty * avg_price, 2)
        
        if wastage_qty > 0:
            if product_name not in product_wastage:
                product_wastage[product_name] = {
                    "product_name": product_name,
                    "product_id": product_id,
                    "opening_qty": 0,
                    "purchase_qty": 0,
                    "dispatch_qty": 0,
                    "closing_qty": 0,
                    "wastage_qty": 0,
                    "wastage_value": 0,
                    "status": status
                }
            
            # Aggregate values
            product_wastage[product_name]["opening_qty"] += opening_qty
            product_wastage[product_name]["purchase_qty"] += purchase_qty
            product_wastage[product_name]["dispatch_qty"] += dispatch_qty
            product_wastage[product_name]["closing_qty"] += closing_qty
            product_wastage[product_name]["wastage_qty"] += wastage_qty
            product_wastage[product_name]["wastage_value"] += wastage_value
            # Update status to closed if any entry is closed
            if status == "closed":
                product_wastage[product_name]["status"] = "closed"
    
    # Calculate wastage percent and avg_price
    wastage_products = []
    total_wastage_kg = 0
    total_wastage_value = 0
    
    for product_name, data in product_wastage.items():
        available = data["opening_qty"] + data["purchase_qty"]
        wastage_percent = (data["wastage_qty"] / available * 100) if available > 0 else 0
        avg_price = data["wastage_value"] / data["wastage_qty"] if data["wastage_qty"] > 0 else 0
        
        wastage_products.append({
            "product_name": product_name,
            "product_id": data["product_id"],
            "opening_qty": round(data["opening_qty"], 2),
            "purchase_qty": round(data["purchase_qty"], 2),
            "dispatch_qty": round(data["dispatch_qty"], 2),
            "closing_qty": round(data["closing_qty"], 2),
            "wastage_qty": round(data["wastage_qty"], 2),
            "wastage_value": round(data["wastage_value"], 2),
            "wastage_percent": round(wastage_percent, 1),
            "avg_price": round(avg_price, 2),
            "status": data["status"]
        })
        total_wastage_kg += data["wastage_qty"]
        total_wastage_value += data["wastage_value"]
    
    # Sort by wastage percent descending (highest wastage % first)
    wastage_products.sort(key=lambda x: x.get("wastage_percent", 0), reverse=True)
    
    return {
        "date": yesterday,
        "total_wastage_kg": round(total_wastage_kg, 2),
        "total_wastage_value": round(total_wastage_value, 2),
        "products": wastage_products
    }


@router.get("/stock-status/wastage-by-date")
async def get_wastage_by_date(date: str, current_user: dict = Depends(get_current_user)):
    """Get product-wise wastage for a specific date"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get fresh purchase data from procurements
    procurements = await db.procurements.find({}, {"_id": 0}).to_list(10000)
    purchases_by_product = {}
    for proc in procurements:
        proc_date = proc.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str == date:
            for item in proc.get("products", []):
                product_id = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                total_value = item.get("total", qty * item.get("rate", 0))
                
                # Convert to Kg for Packet, Bunch, Piece, Box etc.
                unit_lower = unit.lower().strip()
                if unit_lower in ["bunch", "piece", "pack", "packet", "box", "crate", "dozen", "pcs"]:
                    weight_gm = None
                    # Try unit_size first
                    if unit_size:
                        try:
                            weight_gm = float(unit_size)
                        except (ValueError, TypeError):
                            pass
                    # Fallback to standard weights
                    if not weight_gm:
                        defaults = {'packet': 200, 'pack': 200, 'bunch': 250, 'piece': 100, 'pcs': 100}
                        weight_gm = defaults.get(unit_lower)
                    
                    if weight_gm:
                        qty_kg = (qty * weight_gm) / 1000
                    else:
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                if product_id not in purchases_by_product:
                    purchases_by_product[product_id] = {"qty": 0, "value": 0}
                purchases_by_product[product_id]["qty"] += qty_kg
                purchases_by_product[product_id]["value"] += total_value
    
    # Get all stock status for the given date
    day_records = await db.daily_stock_status.find(
        {"date": date},
        {"_id": 0}
    ).to_list(500)
    
    # Build historical price cache from recent dates (last 30 days)
    historical_prices = {}
    historical_records = await db.daily_stock_status.find(
        {
            "date": {"$lte": date},
            "purchase_qty": {"$gt": 0}
        },
        {"_id": 0, "product_id": 1, "purchase_qty": 1, "purchase_value": 1, "date": 1}
    ).sort("date", -1).to_list(2000)
    
    for rec in historical_records:
        pid = rec.get("product_id")
        if pid and pid not in historical_prices:
            pqty = rec.get("purchase_qty", 0) or 0
            pval = rec.get("purchase_value", 0) or 0
            if pqty > 0:
                historical_prices[pid] = pval / pqty
    
    # Aggregate wastage by product
    product_wastage = {}
    
    for record in day_records:
        product_name = record.get("product_name", "Unknown")
        product_id = record.get("product_id", "")
        
        # Use FRESH purchase data from procurements instead of stored values
        fresh_purchase = purchases_by_product.get(product_id, {"qty": 0, "value": 0})
        purchase_qty = round(fresh_purchase["qty"], 2)
        purchase_value = round(fresh_purchase["value"], 2)
        
        # Get other values from stored record
        opening_qty = record.get("opening_qty", 0) or 0
        dispatch_qty = record.get("dispatch_qty", 0) or 0
        closing_qty = record.get("closing_qty", 0) or 0
        status = record.get("status", "pending")
        
        # Recalculate wastage using fresh purchase data
        if status == "closed":
            total_available = opening_qty + purchase_qty - dispatch_qty
            wastage_qty = max(0, total_available - closing_qty)
        else:
            wastage_qty = record.get("wastage_qty", 0) or 0
        
        # Calculate avg_price from fresh procurement data, or fallback to historical
        avg_price = purchase_value / purchase_qty if purchase_qty > 0 else 0
        
        # FALLBACK: Use historical price if no purchases today
        if avg_price == 0 and product_id:
            avg_price = historical_prices.get(product_id, 0)
        
        # Calculate wastage_value dynamically based on avg_price
        wastage_value = round(wastage_qty * avg_price, 2)
        
        # For pending entries, calculate potential wastage if not closed
        if status != "closed" and wastage_qty == 0:
            available = opening_qty + purchase_qty
            if available > 0 and closing_qty == 0:
                wastage_qty = max(0, available - dispatch_qty)
                wastage_value = round(wastage_qty * avg_price, 2)
        
        if wastage_qty > 0:
            if product_name not in product_wastage:
                product_wastage[product_name] = {
                    "product_name": product_name,
                    "product_id": product_id,
                    "opening_qty": 0,
                    "purchase_qty": 0,
                    "dispatch_qty": 0,
                    "closing_qty": 0,
                    "wastage_qty": 0,
                    "wastage_value": 0,
                    "status": status
                }
            
            # Aggregate values
            product_wastage[product_name]["opening_qty"] += opening_qty
            product_wastage[product_name]["purchase_qty"] += purchase_qty
            product_wastage[product_name]["dispatch_qty"] += dispatch_qty
            product_wastage[product_name]["closing_qty"] += closing_qty
            product_wastage[product_name]["wastage_qty"] += wastage_qty
            product_wastage[product_name]["wastage_value"] += wastage_value
            if status == "closed":
                product_wastage[product_name]["status"] = "closed"
    
    # Calculate wastage percent
    wastage_products = []
    total_wastage_kg = 0
    total_wastage_value = 0
    
    for product_name, data in product_wastage.items():
        available = data["opening_qty"] + data["purchase_qty"]
        wastage_percent = (data["wastage_qty"] / available * 100) if available > 0 else 0
        
        wastage_products.append({
            "product_name": product_name,
            "product_id": data["product_id"],
            "opening_qty": round(data["opening_qty"], 2),
            "purchase_qty": round(data["purchase_qty"], 2),
            "dispatch_qty": round(data["dispatch_qty"], 2),
            "closing_qty": round(data["closing_qty"], 2),
            "wastage_qty": round(data["wastage_qty"], 2),
            "wastage_value": round(data["wastage_value"], 2),
            "wastage_percent": round(wastage_percent, 1),
            "status": data["status"]
        })
        
        total_wastage_kg += data["wastage_qty"]
        total_wastage_value += data["wastage_value"]
    
    # Sort by wastage percent descending
    wastage_products.sort(key=lambda x: x.get("wastage_percent", 0), reverse=True)
    
    return {
        "date": date,
        "total_wastage_kg": round(total_wastage_kg, 2),
        "total_wastage_value": round(total_wastage_value, 2),
        "products": wastage_products
    }


@router.put("/stock-status/{status_id}")
async def update_stock_status(status_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a stock status entry"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Remove protected fields
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("date", None)
    updates.pop("product_id", None)
    
    # Get the current record to check if wastage needs recalculation
    current = await db.daily_stock_status.find_one({"id": status_id}, {"_id": 0})
    if not current:
        raise HTTPException(status_code=404, detail="Stock status not found")
    
    # Check if this is a closed entry and purchase/dispatch/closing changed
    fields_affecting_wastage = ['purchase_qty', 'dispatch_qty', 'closing_qty', 'opening_qty']
    needs_wastage_recalc = current.get("status") == "closed" and any(f in updates for f in fields_affecting_wastage)
    
    if needs_wastage_recalc:
        # Get the updated values (use new value if provided, else keep current)
        opening_qty = updates.get("opening_qty", current.get("opening_qty", 0)) or 0
        purchase_qty = updates.get("purchase_qty", current.get("purchase_qty", 0)) or 0
        dispatch_qty = updates.get("dispatch_qty", current.get("dispatch_qty", 0)) or 0
        closing_qty = updates.get("closing_qty", current.get("closing_qty", 0)) or 0
        purchase_value = updates.get("purchase_value", current.get("purchase_value", 0)) or 0
        
        # Calculate new average price
        avg_price = purchase_value / purchase_qty if purchase_qty > 0 else current.get("avg_price", 0)
        
        # Recalculate wastage: Opening + Purchase - Dispatch - Closing
        new_wastage_qty = max(0, opening_qty + purchase_qty - dispatch_qty - closing_qty)
        total_input = opening_qty + purchase_qty
        new_wastage_pct = (new_wastage_qty / total_input * 100) if total_input > 0 else 0
        new_wastage_value = round(new_wastage_qty * avg_price, 2)
        
        # Add wastage fields to updates
        updates["wastage_qty"] = round(new_wastage_qty, 2)
        updates["wastage_value"] = new_wastage_value
        updates["wastage_percent"] = round(new_wastage_pct, 2)
        if avg_price > 0:
            updates["avg_price"] = round(avg_price, 2)
    
    result = await db.daily_stock_status.update_one(
        {"id": status_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stock status not found")
    
    return {"message": "Stock status updated", "wastage_recalculated": needs_wastage_recalc}

@router.delete("/stock-status/{status_id}")
async def delete_stock_status(status_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a stock status entry"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.daily_stock_status.delete_one({"id": status_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Stock status not found")
    
    return {"message": "Stock status deleted"}


# ============================================================================
# ============================================================================
# SECTION: VARIABLE & FIXED EXPENSES ROUTES - MOVED TO routes/expenses_new.py
# ============================================================================
# The following routes have been extracted to routes/expenses_new.py:
# VARIABLE EXPENSES:
# - GET /expenses/variable
# - POST /expenses/variable
# - PUT /expenses/variable/{expense_id}
# - DELETE /expenses/variable/{expense_id}
# - GET /expenses/variable/categories
# - POST /expenses/variable/migrate-to-settled
# FIXED EXPENSES:
# - GET /expenses/fixed
# - POST /expenses/fixed
# - PUT /expenses/fixed/{expense_id}
# - DELETE /expenses/fixed/{expense_id}
# - GET /expenses/fixed/categories
# - POST /expenses/fixed/generate-monthly
# Import: from routes import expenses_router
# Include: app.include_router(expenses_router, prefix="/api")
# ============================================================================

# ============================================================================
