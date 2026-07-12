"""
Retailer Portal Routes
======================
Extracted from server.py for modular organization.
Handles retailer management, retailer indents, dispatches, GRN, 
rejections, payments, invoices, catalogue, and related operations.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any
import uuid
import asyncio
import io
import re
import csv
import os
import random
import string
from collections import defaultdict

from dependencies import (
    db,
    get_current_user,
    logger,
    HINDI_PRODUCT_NAMES,
    MARATHI_PRODUCT_NAMES,
)
from pymongo import ReturnDocument
from models import (
    RetailerIndent,
    RetailerIndentCreate,
    RetailerIndentItem,
    RetailerDispatch,
    RetailerDispatchCreate,
    RetailerInvoice,
    RetailerInvoiceCreate,
    RetailerInvoiceItem,
    RetailerGRN,
    RetailerGRNCreate,
    RetailerRejection,
    RetailerRejectionCreate,
    RetailerPayment,
    RetailerPaymentCreate,
    RetailerCreditNote,
    StockClosingEntry,
    StockClosingBulkEntry,
)

router = APIRouter(tags=["retailer_portal"])


# ============================================================================
# ATOMIC CREDIT NOTE NUMBER GENERATOR
# ============================================================================
async def get_next_credit_note_number(db_instance, retailer_prefix: str) -> str:
    """
    Generate the next credit note number atomically using a counter collection.
    This prevents duplicate credit note numbers when multiple requests are processed concurrently.
    """
    result = await db_instance.counters.find_one_and_update(
        {"_id": f"credit_note:{retailer_prefix}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"CN-{retailer_prefix}-{str(result['seq']).zfill(4)}"


def normalize_dispatch_ids(dispatch_ids) -> list:
    """
    Normalize dispatch_ids to always be a proper list.
    Handles cases where it's stored as a stringified list like "['id1','id2']".
    
    Args:
        dispatch_ids: Could be a list, string, or None
        
    Returns:
        A proper list of dispatch IDs (empty list if invalid)
    """
    if dispatch_ids is None:
        return []
    
    if isinstance(dispatch_ids, list):
        return dispatch_ids
    
    if isinstance(dispatch_ids, str):
        # Check if it looks like a stringified list
        stripped = dispatch_ids.strip()
        if stripped.startswith('[') and stripped.endswith(']'):
            try:
                import ast
                parsed = ast.literal_eval(stripped)
                if isinstance(parsed, list):
                    return parsed
            except (ValueError, SyntaxError):
                pass
        # Single dispatch_id string
        if stripped:
            return [stripped]
    
    return []


def compute_invoice_payment_buckets(
    invoice: dict,
    today_date,
    upfront_pct: float = 50,
    retailer_upfront_map: dict = None
) -> dict:
    """
    Shared helper to compute invoice payment buckets with overdue-aware logic.
    
    Used by both retailer portal and admin endpoints for consistent payment calculations.
    
    Args:
        invoice: Invoice document from retailer_invoices
        today_date: Today's date (date object)
        upfront_pct: Retailer's upfront collection percentage (default 50)
        retailer_upfront_map: Optional map of retailer_id -> upfront_pct for admin endpoints
    
    Returns:
        {
            "upfront_due": float,      # Amount due in upfront bucket
            "final_due": float,        # Amount due in final/credit bucket  
            "paid": float,             # Total paid amount
            "outstanding": float,      # Total outstanding (pending_amount)
            "pending_amount": float,   # Same as outstanding (alias)
            "days_since": int,         # Days since invoice
            "is_overdue": bool,        # True if days_since >= 5
            "upfront_portion": float,  # Calculated upfront portion of final_payable
            "final_payable": float,    # Net payable after credit adjustment
            "is_all_clear": bool       # True if no outstanding amount
        }
    """
    # Parse invoice date
    inv_date = invoice.get("invoice_date")
    if isinstance(inv_date, str):
        inv_date_obj = datetime.fromisoformat(inv_date[:10]).date()
    elif isinstance(inv_date, datetime):
        inv_date_obj = inv_date.date()
    else:
        # Default to today if date invalid
        inv_date_obj = today_date
    
    # Get retailer-specific upfront percentage if map provided
    if retailer_upfront_map:
        retailer_id = invoice.get("retailer_id")
        upfront_pct = retailer_upfront_map.get(retailer_id, upfront_pct)
    
    is_full_upfront = upfront_pct == 100
    
    # Get invoice values
    gross_value = invoice.get("gross_value", 0) or invoice.get("total_mrp_value", 0) or 0
    rejection_amount = invoice.get("rejection_amount", 0) or 0
    commission_pct = invoice.get("commission_percentage", 0) or 0
    commission_amount = invoice.get("commission_amount", 0) or 0
    paid_amount = invoice.get("paid_amount", 0) or 0
    total_credit_adjusted = invoice.get("total_credit_adjusted", 0) or 0
    
    # Calculate net_payable based on retailer model
    if is_full_upfront:
        # 100% upfront: net_payable = gross - commission (rejections handled via Credit Notes)
        net_payable = gross_value - (gross_value * commission_pct / 100)
    else:
        # Standard: use stored net_payable or calculate with rejection
        net_payable = invoice.get("net_payable", 0) or 0
        if net_payable <= 0:
            net_payable = gross_value - rejection_amount - commission_amount
    
    # (a) Subtract total_credit_adjusted from net_payable BEFORE computing pending_amount
    final_payable = net_payable - total_credit_adjusted
    
    # Pending amount = final payable - paid
    pending_amount = max(0, final_payable - paid_amount)
    is_all_clear = pending_amount <= 0
    
    # Calculate days since invoice
    days_since = (today_date - inv_date_obj).days
    
    # Upfront portion based on credit-adjusted final_payable
    upfront_portion = final_payable * (upfront_pct / 100)
    
    # (b) Overdue-aware split logic
    upfront_due = 0
    final_due = 0
    
    if not is_all_clear:
        if is_full_upfront:
            # 100% upfront: ALL pending amount is due immediately
            upfront_due = pending_amount
        else:
            # Calculate unpaid upfront portion
            unpaid_upfront = max(0, upfront_portion - paid_amount)
            
            if days_since == 0:
                # Today's invoice: upfront portion due, remainder in final bucket
                upfront_due = min(unpaid_upfront, pending_amount)
                final_due = max(0, pending_amount - upfront_due)
            elif days_since >= 1 and days_since <= 4:
                # 1-4 days ago: split into upfront and final buckets
                # This ensures grand_total = upfront_due + final_due = total_pending
                if unpaid_upfront > 0:
                    upfront_due = unpaid_upfront
                    final_due = max(0, pending_amount - unpaid_upfront)
                else:
                    # Upfront was fully paid, all remaining goes to final
                    final_due = pending_amount
            elif days_since >= 5:
                # 5+ days (overdue): split unpaid_upfront into upfront bucket,
                # put only the remainder into final bucket
                if unpaid_upfront > 0:
                    upfront_due = unpaid_upfront
                    # Remaining after upfront goes to final
                    remaining = pending_amount - unpaid_upfront
                    if remaining > 0:
                        final_due = remaining
                else:
                    # Upfront was paid, full pending is final/overdue
                    final_due = pending_amount
    
    return {
        "upfront_due": round(upfront_due, 2),
        "final_due": round(final_due, 2),
        "paid": round(paid_amount, 2),
        "outstanding": round(pending_amount, 2),
        "pending_amount": round(pending_amount, 2),
        "days_since": days_since,
        "is_overdue": days_since >= 5,
        "upfront_portion": round(upfront_portion, 2),
        "final_payable": round(final_payable, 2),
        "is_all_clear": is_all_clear
    }


# SECTION: RETAILER PORTAL ROUTES (Lines ~3368-4100)
# Includes: Retailers, Indents, Dispatches, GRN, Rejections, Payments, Invoices
# ============================================================================

# Get all retailers (for dropdowns)
@router.get("/retailers")
async def get_retailers(current_user: dict = Depends(get_current_user)):
    retailers = await db.users.find({"role": "retailer"}, {"_id": 0, "password": 0}).to_list(500)
    return retailers

# ------------ RETAILER INDENTS ------------
@router.get("/retailer-indents")
async def get_retailer_indents(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    # If retailer, only show their own indents
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    # Date filtering for performance
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["indent_date"] = date_query
    
    indents = await db.retailer_indents.find(query, {"_id": 0}).sort("indent_date", -1).to_list(limit)
    return indents

@router.post("/retailer-indents")
async def create_retailer_indent(input: RetailerIndentCreate, current_user: dict = Depends(get_current_user)):
    # Get packagings for variant lookup
    all_packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
    packaging_map = {p.get("name", "").strip().lower(): p.get("id", "") for p in all_packagings}
    
    # Validate and resolve variant_ids from variant_names if needed
    resolved_items = []
    for item in input.items:
        item_dict = item.model_dump()
        variant_id = item_dict.get("variant_id") or ""
        variant_name = item_dict.get("variant_name") or ""
        
        # If no variant_id but have variant_name, try to look it up
        if not variant_id and variant_name:
            variant_name_lower = variant_name.strip().lower()
            variant_id = packaging_map.get(variant_name_lower, "")
            if variant_id:
                item_dict["variant_id"] = variant_id
        
        # If still no variant_id, set a default or leave empty (don't block indent creation)
        # This allows indents to be created even without specific packaging
        if not item_dict.get("variant_id"):
            item_dict["variant_id"] = ""  # Allow empty variant
            if not item_dict.get("variant_name"):
                item_dict["variant_name"] = "Kg"  # Default to Kg
        
        resolved_items.append(item_dict)
    
    # Get retailer info
    if current_user["role"] == "retailer":
        retailer_id = current_user["user_id"]
    else:
        retailer_id = input.retailer_id
    
    retailer = await db.users.find_one({"id": retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # Use resolved items instead of raw input items
    indent = RetailerIndent(
        retailer_id=retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        indent_date=input.indent_date,
        items=[RetailerIndentItem(**item) for item in resolved_items],
        remarks=input.remarks,
        created_by=current_user["user_id"],
        created_by_role=current_user["role"]
    )
    
    doc = indent.model_dump()
    # Store indent_date as YYYY-MM-DD string for consistent date matching
    # This avoids timezone issues where IST dates become different UTC dates
    if isinstance(doc["indent_date"], datetime):
        doc["indent_date"] = doc["indent_date"].strftime("%Y-%m-%d")
    else:
        doc["indent_date"] = str(doc["indent_date"])[:10]
    doc["created_at"] = doc["created_at"].isoformat()
    
    # Mark if created by retailer
    doc["created_by_retailer"] = current_user["role"] == "retailer"
    
    await db.retailer_indents.insert_one(doc)
    return {"id": indent.id, "message": "Indent created successfully"}

@router.put("/retailer-indents/{indent_id}")
async def update_retailer_indent(indent_id: str, input: RetailerIndentCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.retailer_indents.find_one({"id": indent_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Get packagings for variant lookup
    all_packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
    packaging_map = {p.get("name", "").strip().lower(): p.get("id", "") for p in all_packagings}
    
    # Validate and resolve variant_ids from variant_names if needed
    resolved_items = []
    for item in input.items:
        item_dict = item.model_dump()
        variant_id = item_dict.get("variant_id") or ""
        variant_name = item_dict.get("variant_name") or ""
        
        # If no variant_id but have variant_name, try to look it up
        if not variant_id and variant_name:
            variant_name_lower = variant_name.strip().lower()
            variant_id = packaging_map.get(variant_name_lower, "")
            if variant_id:
                item_dict["variant_id"] = variant_id
        
        # If still no variant_id, set a default (don't block update)
        if not item_dict.get("variant_id"):
            item_dict["variant_id"] = ""
            if not item_dict.get("variant_name"):
                item_dict["variant_name"] = "Kg"
        
        resolved_items.append(item_dict)
    
    # Retailers can only update their own pending indents
    if current_user["role"] == "retailer":
        if existing["retailer_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized")
        if existing["status"] != "pending":
            raise HTTPException(status_code=400, detail="Cannot edit non-pending indent")
        # Note: Time restriction removed - retailers can edit anytime while status is pending
    
    # Get all dispatches for this indent to recalculate status
    all_dispatches = await db.retailer_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
    
    # Calculate total dispatched per product+variant
    total_dispatched = {}
    for d in all_dispatches:
        for item in d.get('items', []):
            key = f"{item.get('product_id', '')}|{item.get('variant_id', '')}"
            total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
    
    # Check if all new items are fully dispatched
    new_items = resolved_items  # Use resolved items with variant_ids looked up
    fully_dispatched = True
    has_any_dispatch = len(all_dispatches) > 0
    
    for item in new_items:
        key = f"{item.get('product_id', '')}|{item.get('variant_id', '')}"
        dispatched = total_dispatched.get(key, 0)
        if dispatched < item.get('quantity', 0):
            fully_dispatched = False
            break
    
    # Determine new status
    if not has_any_dispatch:
        new_status = "pending"
    elif fully_dispatched:
        new_status = "dispatched"
    else:
        new_status = "partial"
    
    # Get the new retailer info if retailer_id changed
    new_retailer_id = input.retailer_id
    new_retailer_name = existing.get("retailer_name", "Unknown")
    
    if new_retailer_id and new_retailer_id != existing.get("retailer_id"):
        # Retailer is being changed - get new retailer name
        new_retailer = await db.users.find_one({"id": new_retailer_id, "role": "retailer"}, {"_id": 0})
        if not new_retailer:
            raise HTTPException(status_code=404, detail="New retailer not found")
        new_retailer_name = new_retailer.get("company_name") or new_retailer.get("name") or "Unknown"
    else:
        new_retailer_id = existing.get("retailer_id")
    
    update_data = {
        "retailer_id": new_retailer_id,
        "retailer_name": new_retailer_name,
        "indent_date": input.indent_date.strftime("%Y-%m-%d") if isinstance(input.indent_date, datetime) else str(input.indent_date)[:10],
        "items": new_items,
        "remarks": input.remarks,
        "status": new_status  # Update status based on dispatch completeness
    }
    
    await db.retailer_indents.update_one({"id": indent_id}, {"$set": update_data})
    return {"id": indent_id, "message": "Indent updated successfully", "new_status": new_status}


@router.post("/retailer-indents/{indent_id}/mark-items-done")
async def mark_indent_items_done(indent_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Mark specific indent items as 'done' (supply complete, even if partial)
    
    Input format:
    {
        "done_items": [
            {"product_id": "xxx", "variant_id": "yyy"},
            ...
        ]
    }
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.retailer_indents.find_one({"id": indent_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    done_items = input.get("done_items", [])
    if not done_items:
        return {"message": "No items to mark as done"}
    
    # Create a set of done item keys for quick lookup
    done_keys = {f"{item['product_id']}|{item.get('variant_id', '')}" for item in done_items}
    
    # Update items in the indent
    updated_items = []
    for item in existing.get("items", []):
        key = f"{item.get('product_id', '')}|{item.get('variant_id', '')}"
        item_copy = dict(item)
        if key in done_keys:
            item_copy["marked_done"] = True
        updated_items.append(item_copy)
    
    await db.retailer_indents.update_one(
        {"id": indent_id},
        {"$set": {"items": updated_items}}
    )
    
    return {"message": f"Marked {len(done_keys)} item(s) as done", "indent_id": indent_id}


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

# ------------ RETAILER DISPATCHES ------------
@router.get("/retailer-dispatches")
async def get_retailer_dispatches(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    # Date filtering for performance
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["dispatch_date"] = date_query
    
    dispatches = await db.retailer_dispatches.find(query, {"_id": 0}).sort("dispatch_date", -1).to_list(limit)
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
    dispatch_date_str = doc["dispatch_date"].isoformat() if hasattr(doc["dispatch_date"], 'isoformat') else str(doc["dispatch_date"])
    doc["dispatch_date"] = dispatch_date_str
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_dispatches.insert_one(doc)
    
    # Update indent status based on dispatch completeness
    # Get all dispatches for this indent
    all_dispatches = await db.retailer_dispatches.find({"indent_id": input.indent_id}, {"_id": 0}).to_list(100)
    
    # Calculate total dispatched per product using product_id + variant_id for precise matching
    total_dispatched_precise = {}  # key: product_id_variant_id
    total_dispatched_product = {}  # key: product_id only (fallback)
    for d in all_dispatches:
        for item in d.get('items', []):
            product_id = item.get('product_id', '')
            variant_id = item.get('variant_id') or item.get('indent_variant_id') or ''
            # Precise key
            precise_key = f"{product_id}_{variant_id}"
            total_dispatched_precise[precise_key] = total_dispatched_precise.get(precise_key, 0) + item.get('supplied_qty', 0)
            # Fallback key
            total_dispatched_product[product_id] = total_dispatched_product.get(product_id, 0) + item.get('supplied_qty', 0)
    
    # Check if fully dispatched - use precise matching
    fully_dispatched = True
    for item in indent.get('items', []):
        product_id = item.get('product_id', '')
        variant_id = item.get('variant_id', '')
        precise_key = f"{product_id}_{variant_id}"
        # Try precise key first, fallback to product-only
        dispatched = total_dispatched_precise.get(precise_key, total_dispatched_product.get(product_id, 0))
        if dispatched < item.get('quantity', 0):
            fully_dispatched = False
            break
    
    new_status = "dispatched" if fully_dispatched else "partial"
    await db.retailer_indents.update_one(
        {"id": input.indent_id},
        {"$set": {"status": new_status}}
    )
    
    # AUTO-SYNC: If stock is already closed for this date, recalculate dispatches
    dispatch_date_only = dispatch_date_str[:10]
    closed_status_exists = await db.daily_stock_status.find_one({
        "date": dispatch_date_only,
        "status": "closed"
    })
    
    stock_synced = False
    if closed_status_exists:
        try:
            # Import and call the recalculate function
            from routes.dashboard_analytics import recalculate_dispatches_for_date
            result = await recalculate_dispatches_for_date(dispatch_date_only)
            stock_synced = True
            logger.info(f"Auto-synced stock status for {dispatch_date_only} after retailer dispatch creation")
        except Exception as e:
            logger.error(f"Failed to auto-sync stock status for {dispatch_date_only}: {e}")
    
    return {"id": dispatch.id, "message": "Dispatch created successfully", "stock_synced": stock_synced}

# Edit Retailer Dispatch
@router.put("/retailer-dispatches/{dispatch_id}")
async def update_retailer_dispatch(dispatch_id: str, input: RetailerDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update dispatches")
    
    existing = await db.retailer_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    indent_id = existing.get("indent_id")
    
    # Capture old dispatch date for sync
    old_dispatch_date = str(existing.get("dispatch_date", ""))[:10]
    
    # Track items that existed before the edit (for done status management)
    old_item_keys = {f"{item.get('product_id')}|{item.get('variant_id', '')}" for item in existing.get("items", [])}
    new_item_keys = {f"{item.product_id}|{item.variant_id or ''}" for item in input.items}
    removed_item_keys = old_item_keys - new_item_keys
    
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
    
    dispatch_date_str = input.dispatch_date.isoformat() if hasattr(input.dispatch_date, 'isoformat') else str(input.dispatch_date)
    new_dispatch_date = dispatch_date_str[:10]
    
    update_data = {
        "dispatch_date": dispatch_date_str,
        "items": items_with_totals,
        "total_mrp_value": round(total_mrp_value, 2),
        "commission_percentage": commission,
        "net_payable": round(net_payable, 2),
        "transport_charges": input.transport_charges or 0,
        "remarks": input.remarks
    }
    
    await db.retailer_dispatches.update_one({"id": dispatch_id}, {"$set": update_data})
    
    # If items were removed, check if they should be unmarked as "Done"
    if removed_item_keys and indent_id:
        # Get all OTHER dispatches for this indent (excluding current one)
        other_dispatches = await db.retailer_dispatches.find(
            {"indent_id": indent_id, "id": {"$ne": dispatch_id}}, 
            {"_id": 0, "items": 1}
        ).to_list(100)
        
        # Build set of product+variant keys that have dispatches in OTHER dispatches
        other_dispatch_keys = set()
        for d in other_dispatches:
            for item in d.get("items", []):
                key = f"{item.get('product_id')}|{item.get('variant_id', '')}"
                other_dispatch_keys.add(key)
        
        # Find removed items that have NO other dispatches
        items_to_unmark = removed_item_keys - other_dispatch_keys
        
        if items_to_unmark:
            # Get the indent and unmark those items as done
            indent = await db.retailer_indents.find_one({"id": indent_id})
            if indent:
                updated_items = []
                for item in indent.get("items", []):
                    item_key = f"{item.get('product_id')}|{item.get('variant_id', '')}"
                    item_copy = dict(item)
                    if item_key in items_to_unmark:
                        # Remove marked_done flag so it appears in future dispatches
                        item_copy.pop("marked_done", None)
                    updated_items.append(item_copy)
                
                await db.retailer_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"items": updated_items}}
                )
    
    # AUTO-SYNC: If stock is already closed for either date, recalculate dispatches
    stock_synced = []
    dates_to_sync = set([old_dispatch_date, new_dispatch_date])
    
    for sync_date in dates_to_sync:
        if sync_date:
            closed_status_exists = await db.daily_stock_status.find_one({
                "date": sync_date,
                "status": "closed"
            })
            
            if closed_status_exists:
                try:
                    from routes.dashboard_analytics import recalculate_dispatches_for_date
                    await recalculate_dispatches_for_date(sync_date)
                    stock_synced.append(sync_date)
                    logger.info(f"Auto-synced stock status for {sync_date} after retailer dispatch update")
                except Exception as e:
                    logger.error(f"Failed to auto-sync stock status for {sync_date}: {e}")
    
    return {"id": dispatch_id, "message": "Dispatch updated successfully", "stock_synced": stock_synced}

# Delete Retailer Dispatch
@router.delete("/retailer-dispatches/{dispatch_id}")
async def delete_retailer_dispatch(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete dispatches")
    
    existing = await db.retailer_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Check if dispatch is part of an invoice
    invoice = await db.retailer_invoices.find_one({"dispatch_ids": dispatch_id})
    if invoice:
        raise HTTPException(status_code=400, detail="Cannot delete dispatch that is part of an invoice")
    
    indent_id = existing.get("indent_id")
    
    # Track items that were in this dispatch (for unmarking done status)
    deleted_item_keys = {f"{item.get('product_id')}|{item.get('variant_id', '')}" for item in existing.get("items", [])}
    
    await db.retailer_dispatches.delete_one({"id": dispatch_id})
    
    # Recalculate indent status based on remaining dispatches
    if indent_id:
        remaining_dispatches = await db.retailer_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
        
        # Build set of product+variant keys that still have dispatches
        remaining_dispatch_keys = set()
        for d in remaining_dispatches:
            for item in d.get("items", []):
                key = f"{item.get('product_id')}|{item.get('variant_id', '')}"
                remaining_dispatch_keys.add(key)
        
        # Find deleted items that now have NO dispatches
        items_to_unmark = deleted_item_keys - remaining_dispatch_keys
        
        if len(remaining_dispatches) == 0:
            # No dispatches left - set back to pending and unmark all done items
            indent = await db.retailer_indents.find_one({"id": indent_id})
            if indent:
                updated_items = []
                for item in indent.get("items", []):
                    item_copy = dict(item)
                    item_copy.pop("marked_done", None)  # Remove done flag
                    updated_items.append(item_copy)
                
                await db.retailer_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"status": "pending", "items": updated_items}}
                )
        else:
            # Check if partially or fully dispatched
            indent = await db.retailer_indents.find_one({"id": indent_id})
            if indent:
                total_dispatched = {}
                for d in remaining_dispatches:
                    for item in d.get('items', []):
                        key = item.get('product_id', '')
                        total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
                
                fully_dispatched = True
                for item in indent.get('items', []):
                    dispatched = total_dispatched.get(item.get('product_id', ''), 0)
                    if dispatched < item.get('quantity', 0):
                        fully_dispatched = False
                        break
                
                new_status = "dispatched" if fully_dispatched else "partial"
                
                # Also unmark items that no longer have dispatches
                updated_items = []
                for item in indent.get("items", []):
                    item_key = f"{item.get('product_id')}|{item.get('variant_id', '')}"
                    item_copy = dict(item)
                    if item_key in items_to_unmark:
                        item_copy.pop("marked_done", None)
                    updated_items.append(item_copy)
                
                await db.retailer_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"status": new_status, "items": updated_items}}
                )
    
    # AUTO-SYNC: If stock is already closed for this date, recalculate dispatches
    dispatch_date_str = str(existing.get("dispatch_date", ""))[:10]
    stock_synced = False
    
    if dispatch_date_str:
        closed_status_exists = await db.daily_stock_status.find_one({
            "date": dispatch_date_str,
            "status": "closed"
        })
        
        if closed_status_exists:
            try:
                from routes.dashboard_analytics import recalculate_dispatches_for_date
                await recalculate_dispatches_for_date(dispatch_date_str)
                stock_synced = True
                logger.info(f"Auto-synced stock status for {dispatch_date_str} after retailer dispatch deletion")
            except Exception as e:
                logger.error(f"Failed to auto-sync stock status for {dispatch_date_str}: {e}")
    
    return {"message": "Dispatch deleted successfully", "stock_synced": stock_synced}

@router.get("/retailer-dispatches/yesterday-mrp")
async def get_yesterday_mrp(current_user: dict = Depends(get_current_user)):
    """Get yesterday's MRP for all products by variant from retailer dispatches.
    PRIORITY: sticker_mrp_overrides > yesterday's dispatch MRP
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # First, get all sticker MRP overrides (these take priority)
    overrides = await db.sticker_mrp_overrides.find({}, {"_id": 0}).to_list(1000)
    override_map = {}
    for ov in overrides:
        key = f"{ov.get('product_id', '')}|{ov.get('variant_id', '')}"
        override_map[key] = {
            "product_id": ov.get("product_id", ""),
            "variant_id": ov.get("variant_id", ""),
            "variant_name": ov.get("variant_name", ""),
            "mrp": ov.get("mrp", 0),
            "source": "override"
        }
    
    # Get yesterday's date range
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today - timedelta(days=1)
    yesterday_end = today
    
    # Get dispatches from yesterday
    dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$gte": yesterday_start.isoformat(), "$lt": yesterday_end.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    # Build MRP map: product_id + variant_id -> mrp
    # Start with overrides, then fill in from dispatches where no override exists
    mrp_map = dict(override_map)
    
    for dispatch in dispatches:
        for item in dispatch.get('items', []):
            product_id = item.get('product_id', '')
            variant_id = item.get('variant_id', '')
            mrp = item.get('mrp', 0)
            
            if product_id and mrp > 0:
                key = f"{product_id}|{variant_id or ''}"
                # Only add from dispatch if no override exists for this product+variant
                if key not in mrp_map:
                    mrp_map[key] = {
                        "product_id": product_id,
                        "variant_id": variant_id,
                        "variant_name": item.get('variant_name', ''),
                        "mrp": mrp,
                        "source": "dispatch"
                    }
    
    return list(mrp_map.values())

# ------------ STICKER MRP OVERRIDES ------------
@router.get("/sticker-mrp-overrides")
async def get_sticker_mrp_overrides(current_user: dict = Depends(get_current_user)):
    """Get all sticker MRP overrides"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    overrides = await db.sticker_mrp_overrides.find({}, {"_id": 0}).to_list(1000)
    return overrides

@router.post("/sticker-mrp-overrides")
async def create_sticker_mrp_override(data: dict, current_user: dict = Depends(get_current_user)):
    """Create or update a sticker MRP override for a product+variant"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    product_id = data.get("product_id")
    variant_id = data.get("variant_id", "")
    variant_name = data.get("variant_name", "")
    mrp = data.get("mrp", 0)
    product_name = data.get("product_name", "")
    
    if not product_id:
        raise HTTPException(status_code=400, detail="product_id is required")
    
    try:
        mrp = float(mrp) if mrp else 0
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid MRP value")
    
    # Check if override already exists for this product+variant
    existing = await db.sticker_mrp_overrides.find_one({
        "product_id": product_id,
        "variant_id": variant_id
    })
    
    if existing:
        # Update existing override
        await db.sticker_mrp_overrides.update_one(
            {"product_id": product_id, "variant_id": variant_id},
            {"$set": {
                "mrp": mrp,
                "variant_name": variant_name,
                "product_name": product_name,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": current_user.get("user_id")
            }}
        )
        return {"message": "Override updated", "id": existing.get("id")}
    else:
        # Create new override
        override_id = str(uuid.uuid4())
        override = {
            "id": override_id,
            "product_id": product_id,
            "product_name": product_name,
            "variant_id": variant_id,
            "variant_name": variant_name,
            "mrp": mrp,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("user_id"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user.get("user_id")
        }
        await db.sticker_mrp_overrides.insert_one(override)
        return {"message": "Override created", "id": override_id}

@router.put("/sticker-mrp-overrides/{override_id}")
async def update_sticker_mrp_override(override_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a specific sticker MRP override"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.sticker_mrp_overrides.find_one({"id": override_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Override not found")
    
    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("user_id")
    }
    
    if "mrp" in data:
        try:
            update_data["mrp"] = float(data["mrp"]) if data["mrp"] else 0
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid MRP value")
    
    if "variant_id" in data:
        update_data["variant_id"] = data["variant_id"]
    if "variant_name" in data:
        update_data["variant_name"] = data["variant_name"]
    if "product_name" in data:
        update_data["product_name"] = data["product_name"]
    
    await db.sticker_mrp_overrides.update_one(
        {"id": override_id},
        {"$set": update_data}
    )
    
    return {"message": "Override updated"}

@router.delete("/sticker-mrp-overrides/{override_id}")
async def delete_sticker_mrp_override(override_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a sticker MRP override"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.sticker_mrp_overrides.delete_one({"id": override_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Override not found")
    
    return {"message": "Override deleted"}

# ------------ RETAILER GRN ------------
@router.get("/retailer-grn")
async def get_retailer_grn(
    retailer_id: str = None,
    dispatch_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    if dispatch_id:
        query["dispatch_id"] = dispatch_id
    
    grns = await db.retailer_grn.find(query, {"_id": 0}).sort("grn_date", -1).to_list(1000)
    return grns

@router.post("/retailer-grn")
async def create_retailer_grn(input: RetailerGRNCreate, current_user: dict = Depends(get_current_user)):
    # Get dispatch
    dispatch = await db.retailer_dispatches.find_one({"id": input.dispatch_id})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Retailers can only create GRN for their own dispatches
    if current_user["role"] == "retailer" and dispatch["retailer_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if GRN already exists
    existing = await db.retailer_grn.find_one({"dispatch_id": input.dispatch_id})
    if existing:
        raise HTTPException(status_code=400, detail="GRN already exists for this dispatch")
    
    # Calculate differences
    items_with_diff = []
    for item in input.items:
        item_dict = item.model_dump()
        item_dict["difference"] = item.received_qty - item.supplied_qty
        items_with_diff.append(item_dict)
    
    grn = RetailerGRN(
        dispatch_id=input.dispatch_id,
        retailer_id=dispatch["retailer_id"],
        retailer_name=dispatch["retailer_name"],
        grn_date=datetime.now(timezone.utc),
        items=items_with_diff,
        confirmed_by=current_user["user_id"],
        remarks=input.remarks
    )
    
    doc = grn.model_dump()
    doc["grn_date"] = doc["grn_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_grn.insert_one(doc)
    
    # Update indent status to received
    await db.retailer_indents.update_one(
        {"id": dispatch["indent_id"]},
        {"$set": {"status": "received"}}
    )
    
    return {"id": grn.id, "message": "GRN confirmed successfully"}

# ------------ RETAILER REJECTIONS ------------
@router.get("/retailer-rejections")
async def get_retailer_rejections(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 2000,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    # Date filtering for performance
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["rejection_date"] = date_query
    
    rejections = await db.retailer_rejections.find(query, {"_id": 0}).sort("rejection_date", -1).to_list(limit)
    
    # Bulk lookup credit notes for these rejections
    if rejections:
        rejection_ids = [r.get("id") for r in rejections if r.get("id")]
        if rejection_ids:
            credit_notes = await db.retailer_credit_notes.find(
                {"rejection_id": {"$in": rejection_ids}},
                {"_id": 0, "rejection_id": 1, "id": 1, "credit_note_number": 1, "amount": 1, "status": 1}
            ).to_list(len(rejection_ids))
            
            # Create a map of rejection_id -> credit note info
            cn_map = {
                cn.get("rejection_id"): {
                    "credit_note_id": cn.get("id"),
                    "credit_note_number": cn.get("credit_note_number"),
                    "credit_note_amount": cn.get("amount"),
                    "credit_note_status": cn.get("status", "pending")
                }
                for cn in credit_notes if cn.get("rejection_id")
            }
            
            # Attach credit note info to rejections
            for rejection in rejections:
                rej_id = rejection.get("id")
                if rej_id and rej_id in cn_map:
                    rejection.update(cn_map[rej_id])
        
        # Calculate COGS for each rejection
        # Get dispatch items to find purchase price
        dispatch_ids = list(set(r.get("dispatch_id") for r in rejections if r.get("dispatch_id")))
        dispatch_items_map = {}
        if dispatch_ids:
            dispatches = await db.retailer_dispatches.find(
                {"id": {"$in": dispatch_ids}},
                {"_id": 0, "id": 1, "items": 1}
            ).to_list(len(dispatch_ids))
            for d in dispatches:
                for item in d.get("items", []):
                    key = f"{d['id']}_{item.get('product_id')}_{item.get('variant_id', '')}"
                    dispatch_items_map[key] = item
        
        # Calculate rejection_cogs for each rejection
        for rejection in rejections:
            qty = rejection.get("quantity", 0) or 0
            mrp = rejection.get("mrp", 0) or 0
            dispatch_id = rejection.get("dispatch_id")
            product_id = rejection.get("product_id")
            variant_id = rejection.get("variant_id", "")
            
            # Try to find purchase price from dispatch item
            cogs_price = 0
            if dispatch_id and product_id:
                key = f"{dispatch_id}_{product_id}_{variant_id}"
                dispatch_item = dispatch_items_map.get(key)
                if dispatch_item:
                    cogs_price = dispatch_item.get("purchase_price", 0) or dispatch_item.get("cogs_price", 0) or 0
            
            # Calculate COGS value
            rejection["rejection_cogs"] = round(qty * cogs_price, 2) if cogs_price else 0
    
    return rejections

@router.post("/retailer-rejections")
async def create_retailer_rejection(input: RetailerRejectionCreate, current_user: dict = Depends(get_current_user)):
    # Only admin/staff can create rejections
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can record rejections")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # CRITICAL VALIDATION: Ensure rejection qty doesn't exceed supplied qty
    rejection_date_str = input.rejection_date.strftime("%Y-%m-%d") if isinstance(input.rejection_date, datetime) else str(input.rejection_date)[:10]
    
    # Find dispatches for this retailer and date to get supplied quantity
    dispatches = await db.retailer_dispatches.find({
        "retailer_id": input.retailer_id,
        "dispatch_date": {"$regex": f"^{rejection_date_str}"}
    }, {"_id": 0, "items": 1}).to_list(100)
    
    # Find supplied quantity for this specific product + variant
    supplied_qty = 0
    for dispatch in dispatches:
        for item in (dispatch.get("items") or []):
            # Match by product_id
            if item.get("product_id") == input.product_id:
                # Also match by variant_id if specified
                if input.variant_id:
                    if item.get("variant_id") == input.variant_id:
                        supplied_qty += float(item.get("supplied_qty", 0) or 0)
                else:
                    # No variant specified, just match by product
                    supplied_qty += float(item.get("supplied_qty", 0) or 0)
    
    # Get existing rejections for this product+variant on this date
    existing_query = {
        "retailer_id": input.retailer_id,
        "product_id": input.product_id,
        "rejection_date": {"$regex": f"^{rejection_date_str}"}
    }
    if input.variant_id:
        existing_query["variant_id"] = input.variant_id
    
    existing_rejections = await db.retailer_rejections.find(existing_query, {"_id": 0, "quantity": 1}).to_list(500)
    already_rejected_qty = sum(r.get("quantity", 0) or 0 for r in existing_rejections)
    
    # Validate: new rejection + already rejected cannot exceed supplied
    max_allowed = supplied_qty - already_rejected_qty
    if input.quantity > max_allowed:
        raise HTTPException(
            status_code=400, 
            detail=f"Rejection qty ({input.quantity}) exceeds maximum allowed ({max_allowed}). Supplied: {supplied_qty}, Already rejected: {already_rejected_qty}"
        )
    
    rejection_value = input.quantity * input.mrp
    
    rejection = RetailerRejection(
        retailer_id=input.retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        rejection_date=input.rejection_date,
        product_id=input.product_id,
        product_name=input.product_name,
        variant_id=input.variant_id,
        variant_name=input.variant_name,
        quantity=input.quantity,
        reason=input.reason,
        dispatch_id=input.dispatch_id,
        recorded_by=current_user["user_id"],
        mrp=input.mrp,
        rejection_value=round(rejection_value, 2),
        remarks=input.remarks
    )
    
    doc = rejection.model_dump()
    doc["rejection_date"] = doc["rejection_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_rejections.insert_one(doc)
    
    # Get retailer to check payment model
    retailer = await db.users.find_one({"id": input.retailer_id}, {"_id": 0})
    
    # Determine if this rejection falls under the 100% upfront model
    # If model_changed_at is set, only treat as 100% upfront if rejection date >= model_changed_at
    is_100_upfront = retailer and retailer.get("upfront_collection_percentage") == 100
    model_changed_at = retailer.get("model_changed_at") if retailer else None
    
    # Sync rejection to invoice ONLY for non-100% upfront retailers
    # For 100% upfront model: Invoice amounts remain fixed once created. Rejections create credit notes instead.
    rejection_date_str = input.rejection_date.strftime("%Y-%m-%d") if isinstance(input.rejection_date, datetime) else str(input.rejection_date)[:10]
    
    # Check if rejection falls under 100% upfront rules based on model_changed_at
    rejection_is_100_upfront = is_100_upfront
    if is_100_upfront and model_changed_at:
        # Only apply 100% upfront rules if rejection date >= model_changed_at
        rejection_is_100_upfront = rejection_date_str >= model_changed_at
        if not rejection_is_100_upfront:
            logger.info(f"Rejection date {rejection_date_str} is before model_changed_at {model_changed_at} - using 50% rules")
    
    # For 50% upfront retailers, we need to decide BEFORE syncing whether to:
    # 1. Reduce the invoice payable (if not fully paid yet) - sync_invoice_rejection_amount
    # 2. Create a credit note (if already fully paid) - refund via credit
    # This prevents double-compensation (reducing payable AND issuing credit note)
    
    # Pre-fetch invoice and payment status BEFORE any sync for 50% model
    original_net_payable = None
    original_total_paid = None
    pre_sync_invoice = None
    
    if not rejection_is_100_upfront and rejection_value > 0:
        # Find the invoice BEFORE sync to capture original values
        if input.dispatch_id:
            pre_sync_invoice = await db.retailer_invoices.find_one({
                "retailer_id": input.retailer_id,
                "dispatch_ids": input.dispatch_id
            }, {"_id": 0})
            
            if not pre_sync_invoice:
                potential_invoices = await db.retailer_invoices.find({
                    "retailer_id": input.retailer_id
                }, {"_id": 0}).to_list(500)
                
                for inv in potential_invoices:
                    raw_dispatch_ids = inv.get("dispatch_ids")
                    normalized = normalize_dispatch_ids(raw_dispatch_ids)
                    if input.dispatch_id in normalized:
                        pre_sync_invoice = inv
                        break
        
        if not pre_sync_invoice:
            pre_sync_invoice = await db.retailer_invoices.find_one({
                "retailer_id": input.retailer_id,
                "invoice_date": {"$regex": f"^{rejection_date_str}"}
            }, {"_id": 0})
        
        if pre_sync_invoice:
            original_net_payable = pre_sync_invoice.get("net_payable", 0) or 0
            invoice_id = pre_sync_invoice.get("id")
            
            # Calculate total paid BEFORE sync
            payments = await db.retailer_payments.find(
                {"invoice_id": invoice_id},
                {"_id": 0, "amount": 1}
            ).to_list(100)
            original_total_paid = sum(p.get("amount", 0) or 0 for p in payments)
            
            logger.info(f"Pre-sync check: paid={original_total_paid}, payable={original_net_payable}")
    
    # For 50% upfront retailers: Only sync if NOT already fully paid
    # If already fully paid, we'll create a credit note instead (no sync needed)
    if not rejection_is_100_upfront:
        # Determine if we should sync or create credit note
        should_sync = True
        if original_net_payable is not None and original_total_paid is not None:
            if original_total_paid >= original_net_payable and original_net_payable > 0:
                # Already fully paid - don't sync, will create credit note instead
                should_sync = False
                logger.info(f"Skipping sync - already fully paid. Will create credit note instead.")
        
        if should_sync:
            await sync_invoice_rejection_amount(input.retailer_id, rejection_date_str)
    
    # AUTO-CREATE CREDIT NOTE for 100% upfront retailers
    auto_credit_note = None
    
    # Credit note logic:
    # - For 100% upfront (rejection date >= model_changed_at): ALWAYS create credit note
    # - For 50% model (or rejection date < model_changed_at): Only if paid >= payable
    
    if rejection_value > 0:
        # Find the invoice for this rejection
        # For 50% model, we already have pre_sync_invoice from earlier
        # For 100% upfront, we need to fetch it now
        invoice = pre_sync_invoice  # May be None for 100% upfront
        
        if invoice is None:
            # Need to find invoice (100% upfront case or pre_sync didn't find one)
            if input.dispatch_id:
                # First, try standard array query
                invoice = await db.retailer_invoices.find_one({
                    "retailer_id": input.retailer_id,
                    "dispatch_ids": input.dispatch_id
                }, {"_id": 0})
                
                # If not found, search for stringified dispatch_ids (legacy data issue)
                if not invoice:
                    # Find all invoices for this retailer and check if dispatch_id is in stringified array
                    potential_invoices = await db.retailer_invoices.find({
                        "retailer_id": input.retailer_id
                    }, {"_id": 0}).to_list(500)
                    
                    for inv in potential_invoices:
                        raw_dispatch_ids = inv.get("dispatch_ids")
                        normalized = normalize_dispatch_ids(raw_dispatch_ids)
                        if input.dispatch_id in normalized:
                            invoice = inv
                            logger.info(f"Found invoice {inv.get('invoice_number')} via normalized dispatch_ids lookup")
                            break
                
                if invoice:
                    logger.info(f"Found invoice {invoice.get('invoice_number')} via dispatch_id {input.dispatch_id}")
            
            if not invoice:
                # Fallback: Find invoice by rejection date (legacy behavior for backward compatibility)
                invoice = await db.retailer_invoices.find_one({
                    "retailer_id": input.retailer_id,
                    "invoice_date": {"$regex": f"^{rejection_date_str}"}
                }, {"_id": 0})
                if invoice:
                    logger.info(f"Found invoice {invoice.get('invoice_number')} via date match {rejection_date_str}")
        
        should_create_credit_note = False
        
        if invoice:
            invoice_id = invoice.get("id")
            
            # For 50% model: Use pre-captured values (BEFORE sync)
            # For 100% upfront: Fetch current values (no sync was done)
            if not rejection_is_100_upfront and original_net_payable is not None:
                # Use pre-sync values to avoid double-compensation
                net_payable = original_net_payable
                total_paid = original_total_paid
                logger.info(f"Using pre-sync values: paid={total_paid}, payable={net_payable}")
            else:
                # Fetch current values (100% upfront case)
                net_payable = invoice.get("net_payable", 0) or 0
                payments = await db.retailer_payments.find(
                    {"invoice_id": invoice_id},
                    {"_id": 0, "amount": 1}
                ).to_list(100)
                total_paid = sum(p.get("amount", 0) or 0 for p in payments)
            
            # For 100% upfront retailers (rejection date >= model_changed_at): ALWAYS create credit note
            # (Payment happens at delivery time, so rejections always need credit notes)
            if rejection_is_100_upfront:
                should_create_credit_note = True
                logger.info(f"Creating credit note for 100% upfront retailer (rejection date {rejection_date_str} >= model_changed_at {model_changed_at or 'N/A'})")
            # For other retailers (50% model): Only create credit note if ALREADY fully paid BEFORE sync
            # If not fully paid, sync already reduced the payable - no credit note needed
            elif total_paid >= net_payable and net_payable > 0:
                should_create_credit_note = True
                logger.info(f"Creating credit note - paid ({total_paid}) >= original payable ({net_payable}). Already fully paid, refund via credit.")
            else:
                # Paid < Payable: No credit note needed for non-100% upfront
                # Sync already reduced the payable, retailer pays the reduced amount
                logger.info(f"Skipping credit note - paid ({total_paid}) < original payable ({net_payable}). Invoice payable reduced instead.")
        elif rejection_is_100_upfront:
            # For 100% upfront retailers: Create CN even if invoice not found yet
            # The CN will be created with pending linkage status
            should_create_credit_note = True
            logger.info(f"Creating credit note for 100% upfront retailer without invoice match - will be linked later")
        
        if should_create_credit_note:
            # Generate credit note number with retailer prefix (e.g., CN-TAM-0001)
            retailer_name = retailer.get("company_name", retailer.get("name", ""))
            retailer_prefix = ''.join(c for c in retailer_name.upper() if c.isalpha())[:3] or "RET"
            credit_note_number = await get_next_credit_note_number(db, retailer_prefix)
            
            # Calculate credit amount after deducting commission
            # Credit = Rejection Value × (1 - Commission%)
            # Because retailer was paying (100% - commission%) of MRP
            commission_pct = retailer.get("commission_percentage", 0) or 0
            credit_amount = rejection_value * (1 - commission_pct / 100)
            
            # Determine if invoice is linked or pending linkage
            has_invoice = invoice is not None
            
            credit_note = {
                "id": str(uuid.uuid4()),
                "credit_note_number": credit_note_number,
                "retailer_id": input.retailer_id,
                "retailer_name": retailer.get("company_name", retailer.get("name", "")),
                "original_invoice_id": invoice.get("id") if has_invoice else None,
                "original_invoice_number": invoice.get("invoice_number") if has_invoice else None,
                "rejection_id": rejection.id,
                "rejection_date": doc["rejection_date"],
                "rejection_value": round(rejection_value, 2),  # Original MRP value
                "commission_percentage": commission_pct,
                "commission_deducted": round(rejection_value * commission_pct / 100, 2),
                "amount": round(credit_amount, 2),  # Net credit after commission
                "rejection_details": [{
                    "product_name": input.product_name,
                    "variant_name": input.variant_name,
                    "quantity": input.quantity,
                    "mrp": input.mrp,
                    "value": round(rejection_value, 2),
                    "reason": input.reason
                }],
                "status": "pending",
                "adjusted_amount": 0,
                "pending_amount": round(credit_amount, 2),
                "adjusted_against_invoices": [],
                "remarks": f"Auto-generated: Rejection on {rejection_date_str}" + (" - pending invoice linkage" if not has_invoice else " after invoice was fully paid"),
                "created_by": current_user["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "auto_generated": True,
                "invoice_linked": has_invoice  # Track if invoice was linked at creation time
            }
            
            await db.retailer_credit_notes.insert_one(credit_note)
            auto_credit_note = {
                "id": credit_note["id"],
                "credit_note_number": credit_note_number,
                "amount": credit_note["amount"],
                "invoice_linked": has_invoice
            }
            logger.info(f"Auto-created credit note {credit_note_number} for retailer {retailer.get('company_name', retailer.get('name'))} - Rejection: {rejection_value}, Commission: {commission_pct}%, Credit: {credit_amount}, Invoice linked: {has_invoice}")
    
    response = {"id": rejection.id, "message": "Rejection recorded successfully"}
    if auto_credit_note:
        response["auto_credit_note"] = auto_credit_note
        response["message"] = f"Rejection recorded and Credit Note {auto_credit_note['credit_note_number']} auto-generated"
    
    return response

async def sync_invoice_rejection_amount(retailer_id: str, date_str: str):
    """
    Sync rejection amounts from retailer_rejections to the corresponding invoice.
    This ensures Payment Summary shows correct rejection values AND item-level rejections.
    
    NOTE: For 100% upfront retailers, rejections should NOT modify the invoice.
    Instead, they only generate credit notes.
    """
    try:
        # First check if this is a 100% upfront retailer - if so, skip syncing
        retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0})
        if retailer and retailer.get("upfront_collection_percentage") == 100:
            logger.info(f"Skipping invoice rejection sync for 100% upfront retailer {retailer.get('company_name', retailer.get('name'))}")
            return
        
        # Get all rejections for this retailer and date
        rejections = await db.retailer_rejections.find({
            "retailer_id": retailer_id,
            "rejection_date": {"$regex": f"^{date_str}"}
        }, {"_id": 0}).to_list(500)
        
        total_rejection_value = sum(r.get("rejection_value", 0) or 0 for r in rejections)
        
        # Group rejections by MULTIPLE keys for flexible matching
        # Key 1: product_id + variant_id (exact match)
        # Key 2: product_id + variant_name (fallback)
        rejection_by_exact = {}  # product_id + variant_id
        rejection_by_name = {}   # product_id + variant_name
        
        for rej in rejections:
            product_id = rej.get('product_id', '') or ''
            variant_id = rej.get('variant_id', '') or ''
            variant_name = rej.get('variant_name', '') or ''
            
            rej_data = {"qty": rej.get("quantity", 0) or 0, "value": rej.get("rejection_value", 0) or 0}
            
            # Store by exact variant_id if it's a valid ID
            if variant_id and variant_id not in ['N/A', 'None', 'null', '', 'undefined']:
                exact_key = f"{product_id}_{variant_id}"
                if exact_key not in rejection_by_exact:
                    rejection_by_exact[exact_key] = {"qty": 0, "value": 0}
                rejection_by_exact[exact_key]["qty"] += rej_data["qty"]
                rejection_by_exact[exact_key]["value"] += rej_data["value"]
            
            # Also store by variant_name for fallback matching
            if variant_name:
                name_key = f"{product_id}_{variant_name}"
                if name_key not in rejection_by_name:
                    rejection_by_name[name_key] = {"qty": 0, "value": 0}
                rejection_by_name[name_key]["qty"] += rej_data["qty"]
                rejection_by_name[name_key]["value"] += rej_data["value"]
        
        # Find the invoice for this date and retailer
        invoice = await db.retailer_invoices.find_one({
            "retailer_id": retailer_id,
            "invoice_date": {"$regex": f"^{date_str}"}
        }, {"_id": 0})
        
        if invoice:
            gross_value = invoice.get("gross_value", 0) or 0
            commission_pct = invoice.get("commission_percentage", 0) or 0
            
            # Recalculate: net_mrp = gross - rejections, then apply commission
            net_mrp_value = gross_value - total_rejection_value
            commission_amount = net_mrp_value * (commission_pct / 100)
            net_payable = net_mrp_value - commission_amount
            
            # Update item-level rejections in the invoice
            updated_items = []
            for item in invoice.get("items", []):
                item_product_id = item.get('product_id', '') or ''
                item_variant_id = item.get('variant_id', '') or ''
                item_variant_name = item.get('variant_name', '') or ''
                
                rej_data = {"qty": 0, "value": 0}
                
                # Try to match by exact variant_id first (if invoice item has valid variant_id)
                if item_variant_id and item_variant_id not in ['N/A', 'None', 'null', '', 'undefined']:
                    exact_key = f"{item_product_id}_{item_variant_id}"
                    if exact_key in rejection_by_exact:
                        rej_data = rejection_by_exact[exact_key]
                
                # If no match by variant_id, try matching by variant_name
                if rej_data["qty"] == 0 and item_variant_name:
                    name_key = f"{item_product_id}_{item_variant_name}"
                    if name_key in rejection_by_name:
                        rej_data = rejection_by_name[name_key]
                
                # Update rejection_qty and recalculate billable_qty
                supplied_qty = item.get("supplied_qty", item.get("quantity", 0)) or 0
                rejection_qty = rej_data["qty"]
                billable_qty = max(0, supplied_qty - rejection_qty)
                mrp = item.get("mrp", 0) or 0
                amount = billable_qty * mrp
                
                updated_item = {
                    **item,
                    "rejected_qty": rejection_qty,  # Use consistent field name
                    "rejection_qty": rejection_qty,  # Keep both for backwards compatibility
                    "billable_qty": billable_qty,
                    "amount": round(amount, 2)
                }
                updated_items.append(updated_item)
            
            # Update the invoice with both totals and item-level rejections
            await db.retailer_invoices.update_one(
                {"id": invoice["id"]},
                {"$set": {
                    "rejection_amount": round(total_rejection_value, 2),
                    "total_mrp_value": round(net_mrp_value, 2),
                    "commission_amount": round(commission_amount, 2),
                    "net_payable": round(net_payable, 2),
                    "items": updated_items
                }}
            )
            logger.info(f"Synced rejection amount ₹{total_rejection_value} and {len(updated_items)} item rejections to invoice {invoice.get('invoice_number')}")
    except Exception as e:
        logger.error(f"Failed to sync invoice rejection amount: {e}")

@router.post("/admin/sync-invoice-rejections")
async def sync_all_invoice_rejections(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Sync all rejection amounts from retailer_rejections to corresponding invoices.
    This fixes invoices that have rejection_amount=0 but should have rejection values.
    Also syncs item-level rejection data.
    """
    if current_user.get("role") not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all rejections grouped by retailer_id and date
    query = {}
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    rejections = await db.retailer_rejections.find(query, {"_id": 0}).to_list(10000)
    
    # Group rejections by (retailer_id, date)
    rejection_keys = set()
    for rej in rejections:
        rej_date = rej.get("rejection_date", "")[:10]
        ret_id = rej.get("retailer_id")
        if ret_id and rej_date:
            rejection_keys.add((ret_id, rej_date))
    
    # Call the proper sync function for each retailer+date combination
    # This does both totals AND item-level sync
    updated_count = 0
    for (ret_id, date_str) in rejection_keys:
        try:
            await sync_invoice_rejection_amount(ret_id, date_str)
            updated_count += 1
        except Exception as e:
            logger.error(f"Failed to sync for retailer {ret_id} date {date_str}: {e}")
    
    return {
        "message": f"Synced rejection amounts to {updated_count} invoices",
        "updated_count": updated_count,
        "total_rejection_entries": len(rejection_keys)
    }

@router.delete("/retailer-rejections/{rejection_id}")
async def delete_retailer_rejection(rejection_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete rejections")
    
    # Get the rejection first to know which invoice to re-sync
    rejection = await db.retailer_rejections.find_one({"id": rejection_id}, {"_id": 0})
    if not rejection:
        raise HTTPException(status_code=404, detail="Rejection not found")
    
    # Find and delete any credit note linked to this rejection
    credit_note = await db.retailer_credit_notes.find_one({"rejection_id": rejection_id}, {"_id": 0})
    credit_note_deleted = False
    if credit_note:
        # Check if credit note has been adjusted (used against invoices)
        if credit_note.get("adjusted_amount", 0) > 0:
            # Credit note has been partially/fully adjusted - we can't delete it
            # Instead, mark it as void or reduce its amount
            await db.retailer_credit_notes.update_one(
                {"id": credit_note["id"]},
                {"$set": {
                    "status": "voided",
                    "voided_reason": f"Source rejection {rejection_id} was deleted",
                    "amount": 0,
                    "pending_amount": 0
                }}
            )
        else:
            # Credit note hasn't been used - safe to delete
            await db.retailer_credit_notes.delete_one({"id": credit_note["id"]})
            credit_note_deleted = True
    
    # Delete the rejection
    result = await db.retailer_rejections.delete_one({"id": rejection_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rejection not found")
    
    # Re-sync the invoice for this rejection's date/retailer (ONLY for non-100% upfront retailers)
    rej_date = rejection.get("rejection_date", "")[:10]
    retailer_id = rejection.get("retailer_id")
    if rej_date and retailer_id:
        retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0})
        is_100_upfront = retailer and retailer.get("upfront_collection_percentage") == 100
        if not is_100_upfront:
            await sync_invoice_rejection_amount(retailer_id, rej_date)
    
    message = "Rejection deleted successfully"
    if credit_note:
        if credit_note_deleted:
            message += f". Credit note {credit_note.get('credit_note_number')} also deleted."
        else:
            message += f". Credit note {credit_note.get('credit_note_number')} voided (was partially adjusted)."
    
    return {"message": message, "credit_note_deleted": credit_note_deleted}


@router.get("/retailer-rejections/daily-summary")
async def get_rejection_daily_summary(
    retailer_id: str = None,
    date: str = None,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get daily rejection summary grouped by the date rejections were RECORDED (created_at).
    
    This is different from the existing view which shows rejections against invoice dates.
    This view answers: "On June 12, what products were rejected and what was the total amount?"
    
    Query params:
    - retailer_id: Filter by retailer (required for admin, auto-filled for retailer role)
    - date: Single date to filter (YYYY-MM-DD)
    - start_date, end_date: Date range filter (YYYY-MM-DD)
    
    Returns daily breakdown with:
    - Date (when rejection was recorded)
    - Per retailer: list of products rejected with qty, value, reason
    - Daily totals
    """
    if current_user["role"] not in ["admin", "staff", "retailer"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Build query
    query = {}
    
    # Handle retailer filtering
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    # Date filtering on created_at (when rejection was recorded)
    if date:
        # Single date
        query["created_at"] = {"$regex": f"^{date}"}
    elif start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["created_at"] = date_query
    
    # Fetch rejections sorted by created_at
    rejections = await db.retailer_rejections.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Get unique retailer IDs and fetch their company names
    retailer_ids = list(set(r.get("retailer_id") for r in rejections if r.get("retailer_id")))
    retailers_data = await db.users.find(
        {"id": {"$in": retailer_ids}}, 
        {"_id": 0, "id": 1, "company_name": 1, "name": 1}
    ).to_list(500)
    retailer_company_map = {
        r["id"]: r.get("company_name") or r.get("name") or "Unknown" 
        for r in retailers_data
    }
    
    # Group by date (from created_at)
    daily_summary = {}
    
    for rej in rejections:
        created_at = rej.get("created_at", "")
        if isinstance(created_at, str):
            record_date = created_at[:10]  # Extract YYYY-MM-DD
        else:
            record_date = created_at.strftime("%Y-%m-%d") if created_at else "Unknown"
        
        if record_date not in daily_summary:
            daily_summary[record_date] = {
                "date": record_date,
                "retailers": {},
                "total_qty": 0,
                "total_value": 0,
                "rejection_count": 0
            }
        
        # Group by retailer within each date
        ret_id = rej.get("retailer_id")
        # Use company_name from lookup, fallback to stored name
        ret_name = retailer_company_map.get(ret_id) or rej.get("retailer_name", "Unknown")
        
        if ret_id not in daily_summary[record_date]["retailers"]:
            daily_summary[record_date]["retailers"][ret_id] = {
                "retailer_id": ret_id,
                "retailer_name": ret_name,
                "items": [],
                "total_qty": 0,
                "total_value": 0
            }
        
        # Add item to retailer's list
        qty = rej.get("quantity", 0) or 0
        value = rej.get("rejection_value", 0) or 0
        
        daily_summary[record_date]["retailers"][ret_id]["items"].append({
            "id": rej.get("id"),
            "product_id": rej.get("product_id"),
            "product_name": rej.get("product_name"),
            "variant_name": rej.get("variant_name"),
            "quantity": qty,
            "rejection_value": value,
            "reason": rej.get("reason", ""),
            "mrp": rej.get("mrp", 0),
            "invoice_date": rej.get("rejection_date", "")[:10] if rej.get("rejection_date") else "",
            "recorded_by": rej.get("recorded_by")
        })
        
        # Update retailer totals
        daily_summary[record_date]["retailers"][ret_id]["total_qty"] += qty
        daily_summary[record_date]["retailers"][ret_id]["total_value"] += value
        
        # Update daily totals
        daily_summary[record_date]["total_qty"] += qty
        daily_summary[record_date]["total_value"] += value
        daily_summary[record_date]["rejection_count"] += 1
    
    # Convert to list and sort by date descending
    result = []
    for date_key in sorted(daily_summary.keys(), reverse=True):
        day_data = daily_summary[date_key]
        # Convert retailers dict to list
        day_data["retailers"] = list(day_data["retailers"].values())
        # Round totals
        day_data["total_value"] = round(day_data["total_value"], 2)
        for ret in day_data["retailers"]:
            ret["total_value"] = round(ret["total_value"], 2)
        result.append(day_data)
    
    # Calculate grand totals
    grand_total_qty = sum(d["total_qty"] for d in result)
    grand_total_value = sum(d["total_value"] for d in result)
    
    return {
        "daily_summary": result,
        "grand_totals": {
            "total_qty": round(grand_total_qty, 2),
            "total_value": round(grand_total_value, 2),
            "total_rejection_count": sum(d["rejection_count"] for d in result),
            "days_with_rejections": len(result)
        }
    }


@router.get("/retailer-rejections/history")
async def get_rejection_history(
    dispatch_id: str = None,
    product_id: str = None,
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get rejection history for a specific dispatch/product/retailer combination.
    Returns all previous rejections with dates to show cumulative history.
    NOTE: dispatch_id is IGNORED to fetch all rejections for this product/retailer
    regardless of which dispatch date the rejection was originally recorded against.
    """
    if current_user["role"] not in ["admin", "staff", "retailer"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    # IMPORTANT: Do NOT filter by dispatch_id - we want ALL rejections for this product/retailer
    # to show proper history even if rejections were recorded against different dispatch dates
    if product_id:
        query["product_id"] = product_id
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    # Get all rejections matching the criteria, sorted by date
    rejections = await db.retailer_rejections.find(query, {"_id": 0}).sort("rejection_date", 1).to_list(100)
    
    # Calculate total rejection
    total_qty = sum(r.get("quantity", 0) for r in rejections)
    total_value = sum(r.get("rejection_value", 0) for r in rejections)
    
    return {
        "rejections": rejections,
        "total_quantity": round(total_qty, 2),
        "total_value": round(total_value, 2),
        "count": len(rejections)
    }


@router.post("/retailer-rejections/history-batch")
async def get_rejection_history_batch(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Get rejection history for multiple products at once (batch API).
    This is much faster than making separate calls for each product.
    
    Input: { 
        "retailer_id": "...", 
        "product_ids": ["prod1", "prod2", ...],
        "variant_ids": ["var1", "var2", ...],  # Optional - for variant-level tracking
        "rejection_date": "YYYY-MM-DD" (optional - if provided, filters to only this date)
    }
    
    Returns: {
        "history": {
            "product_id_1": { "rejections": [...], "total_quantity": 0, "total_value": 0 },
            "product_id_1|variant_id_1": { "rejections": [...], "total_quantity": 0, "total_value": 0 },
            ...
        }
    }
    
    Note: Returns BOTH product-level and product+variant level aggregations.
    Frontend should prefer the more specific product+variant key when available.
    """
    if current_user["role"] not in ["admin", "staff", "retailer"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    retailer_id = input.get("retailer_id")
    product_ids = input.get("product_ids", [])
    variant_ids = input.get("variant_ids", [])  # NEW: variant IDs for precise tracking
    rejection_date = input.get("rejection_date")  # The dispatch date we're recording rejections for
    
    if not retailer_id or not product_ids:
        return {"history": {}}
    
    # Build query - filter by retailer and products
    query = {
        "retailer_id": retailer_id,
        "product_id": {"$in": product_ids}
    }
    
    # IMPORTANT: Filter by rejection_date to only show rejections for THIS SPECIFIC DATE
    # This ensures "Previous Rej." only shows rejections already recorded for this dispatch date
    if rejection_date:
        # Match rejection_date that starts with the given date (handles ISO datetime strings)
        query["rejection_date"] = {"$regex": f"^{rejection_date}"}
    
    all_rejections = await db.retailer_rejections.find(query, {"_id": 0}).sort("created_at", 1).to_list(500)
    
    # Initialize history - both product-level and product+variant level
    history = {}
    
    # Initialize product-level entries
    for product_id in product_ids:
        history[product_id] = {
            "rejections": [],
            "total_quantity": 0,
            "total_value": 0
        }
    
    # Process rejections and group by BOTH product_id AND product_id+variant_id
    for rej in all_rejections:
        pid = rej.get("product_id")
        vid = rej.get("variant_id") or ""
        qty = rej.get("quantity", 0) or 0
        val = rej.get("rejection_value", 0) or 0
        
        # Add to product-level aggregation
        if pid in history:
            history[pid]["rejections"].append(rej)
            history[pid]["total_quantity"] += qty
            history[pid]["total_value"] += val
        
        # Also add to product+variant-level aggregation (more specific key)
        composite_key = f"{pid}|{vid}" if vid else pid
        if composite_key not in history:
            history[composite_key] = {
                "rejections": [],
                "total_quantity": 0,
                "total_value": 0
            }
        history[composite_key]["rejections"].append(rej)
        history[composite_key]["total_quantity"] += qty
        history[composite_key]["total_value"] += val
    
    # Round the totals
    for key in history:
        history[key]["total_quantity"] = round(history[key]["total_quantity"], 2)
        history[key]["total_value"] = round(history[key]["total_value"], 2)
    
    return {"history": history}




@router.put("/retailer-rejections/{rejection_id}")
async def update_retailer_rejection(rejection_id: str, rejection: RetailerRejection, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update rejections")
    
    # Check if rejection exists
    existing = await db.retailer_rejections.find_one({"id": rejection_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Rejection not found")
    
    # Update the rejection
    update_data = {
        "retailer_id": rejection.retailer_id,
        "rejection_date": rejection.rejection_date,
        "product_id": rejection.product_id,
        "product_name": rejection.product_name,
        "variant_id": rejection.variant_id,
        "variant_name": rejection.variant_name,
        "quantity": rejection.quantity,
        "mrp": rejection.mrp,
        "reason": rejection.reason,
        "remarks": rejection.remarks,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.retailer_rejections.update_one(
        {"id": rejection_id},
        {"$set": update_data}
    )
    
    # Re-sync the invoice for both old and new dates (ONLY for non-100% upfront retailers)
    old_date = existing.get("rejection_date", "")[:10]
    old_retailer = existing.get("retailer_id")
    new_date = rejection.rejection_date[:10] if rejection.rejection_date else ""
    new_retailer = rejection.retailer_id
    
    # Check if old retailer is 100% upfront
    if old_date and old_retailer:
        old_retailer_data = await db.users.find_one({"id": old_retailer}, {"_id": 0})
        old_is_100_upfront = old_retailer_data and old_retailer_data.get("upfront_collection_percentage") == 100
        if not old_is_100_upfront:
            await sync_invoice_rejection_amount(old_retailer, old_date)
    
    # Check if new retailer is 100% upfront (if different from old)
    if new_date and new_retailer and (new_date != old_date or new_retailer != old_retailer):
        new_retailer_data = await db.users.find_one({"id": new_retailer}, {"_id": 0})
        new_is_100_upfront = new_retailer_data and new_retailer_data.get("upfront_collection_percentage") == 100
        if not new_is_100_upfront:
            await sync_invoice_rejection_amount(new_retailer, new_date)
    
    return {"id": rejection_id, "message": "Rejection updated successfully"}


# ------------ RETAILER PAYMENTS ------------
@router.get("/retailer-payments")
async def get_retailer_payments(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 500,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    # Date filtering for performance
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["payment_date"] = date_query
    
    payments = await db.retailer_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(limit)
    return payments

@router.post("/retailer-payments")
async def create_retailer_payment(input: RetailerPaymentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can record payments")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    payment = RetailerPayment(
        retailer_id=input.retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        payment_date=input.payment_date,
        amount=input.amount,
        payment_mode=input.payment_mode,
        reference_number=input.reference_number,
        recorded_by=current_user["user_id"],
        remarks=input.remarks
    )
    
    doc = payment.model_dump()
    doc["payment_date"] = doc["payment_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_payments.insert_one(doc)
    return {"id": payment.id, "message": "Payment recorded successfully"}

@router.put("/retailer-payments/{payment_id}")
async def update_retailer_payment(payment_id: str, payment_data: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing payment"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update payments")
    
    # Get the original payment
    original_payment = await db.retailer_payments.find_one({"id": payment_id})
    if not original_payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    invoice_id = original_payment.get("invoice_id")
    old_amount = original_payment.get("amount", 0)
    new_amount = payment_data.get("amount", old_amount)
    
    # Validate new amount
    if new_amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    # Update the payment
    update_data = {
        "amount": round(new_amount, 2),
        "payment_mode": payment_data.get("payment_mode", original_payment.get("payment_mode")),
        "reference_number": payment_data.get("reference_number", original_payment.get("reference_number")),
        "remarks": payment_data.get("remarks", original_payment.get("remarks")),
        "payment_date": payment_data.get("payment_date", original_payment.get("payment_date")),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["user_id"]
    }
    
    await db.retailer_payments.update_one(
        {"id": payment_id},
        {"$set": update_data}
    )
    
    # If payment was linked to an invoice, recalculate invoice paid_amount and status
    if invoice_id:
        invoice = await db.retailer_invoices.find_one({"id": invoice_id})
        if invoice:
            # Recalculate total paid from all payments
            all_payments = await db.retailer_payments.find({"invoice_id": invoice_id}).to_list(100)
            new_paid_amount = sum(p.get("amount", 0) for p in all_payments)
            net_payable = invoice.get("net_payable", 0)
            
            # Determine new status (use tolerance for floating point comparison)
            if new_paid_amount >= net_payable - 0.01:
                new_status = "paid"
            elif new_paid_amount > 0:
                new_status = "partial"
            else:
                new_status = "pending"
            
            # Update invoice
            await db.retailer_invoices.update_one(
                {"id": invoice_id},
                {"$set": {"paid_amount": round(new_paid_amount, 2), "status": new_status}}
            )
    
    return {"message": "Payment updated successfully"}

@router.delete("/retailer-payments/{payment_id}")
async def delete_retailer_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete payments")
    
    # Get the payment first to know which invoice to update
    payment = await db.retailer_payments.find_one({"id": payment_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    invoice_id = payment.get("invoice_id")
    payment_amount = payment.get("amount", 0)
    
    # Delete the payment
    result = await db.retailer_payments.delete_one({"id": payment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # If payment was linked to an invoice, fully recalculate invoice totals
    if invoice_id:
        invoice = await db.retailer_invoices.find_one({"id": invoice_id})
        if invoice:
            retailer_id = invoice.get("retailer_id")
            
            # Recalculate total paid from remaining payments
            remaining_payments = await db.retailer_payments.find({"invoice_id": invoice_id}).to_list(100)
            new_paid_amount = sum(p.get("amount", 0) for p in remaining_payments)
            
            # Get rejection amount for this invoice
            dispatch_ids = invoice.get("dispatch_ids", [])
            if isinstance(dispatch_ids, str):
                try:
                    import ast
                    dispatch_ids = ast.literal_eval(dispatch_ids)
                except:
                    dispatch_ids = []
            
            total_rejection_value = 0
            if dispatch_ids and retailer_id:
                dispatches = await db.retailer_dispatches.find(
                    {"id": {"$in": dispatch_ids}},
                    {"_id": 0, "dispatch_date": 1}
                ).to_list(100)
                dispatch_dates = list(set([d.get("dispatch_date", "")[:10] for d in dispatches if d.get("dispatch_date")]))
                
                if dispatch_dates:
                    rejection_query = {
                        "retailer_id": retailer_id,
                        "rejection_date": {"$regex": f"^({'|'.join(dispatch_dates)})"}
                    }
                    rejections = await db.retailer_rejections.find(rejection_query, {"_id": 0}).to_list(500)
                    total_rejection_value = sum(r.get("rejection_value", 0) or 0 for r in rejections)
            
            # Recalculate net values
            gross_value = float(invoice.get("gross_value", 0) or 0)
            if gross_value == 0:
                # Calculate from items if not stored
                items = invoice.get("items", [])
                gross_value = sum(
                    (item.get("supplied_qty", item.get("quantity", 0)) or 0) * (item.get("mrp", 0) or 0)
                    for item in items
                )
            
            net_mrp_value = gross_value - total_rejection_value
            commission_pct = float(invoice.get("commission_percentage", 0) or 0)
            commission_amount = net_mrp_value * (commission_pct / 100)
            net_payable = net_mrp_value - commission_amount
            
            # Account for credit note adjustments
            total_credit_adjusted = sum(
                adj.get("amount", 0) for adj in invoice.get("credit_note_adjustments", [])
            )
            final_payable = net_payable - total_credit_adjusted
            remaining_amount = max(0, final_payable - new_paid_amount)
            
            # Determine new status
            if final_payable <= 0.01 or new_paid_amount >= final_payable - 0.01:
                new_status = "paid"
            elif new_paid_amount > 0 or total_credit_adjusted > 0:
                new_status = "partial"
            else:
                new_status = "pending"
            
            # Update invoice with all recalculated values
            await db.retailer_invoices.update_one(
                {"id": invoice_id},
                {"$set": {
                    "paid_amount": round(new_paid_amount, 2),
                    "remaining_amount": round(remaining_amount, 2),
                    "status": new_status,
                    "payment_status": new_status,
                    "total_mrp_value": round(net_mrp_value, 2),  # Net after rejections
                    "rejection_amount": round(total_rejection_value, 2),
                    "commission_amount": round(commission_amount, 2),
                    "net_payable": round(net_payable, 2),
                    "final_payable": round(final_payable, 2)
                }}
            )
            
            logger.info(f"Deleted payment {payment_id}, recalculated invoice {invoice.get('invoice_number')}: paid={new_paid_amount}, rejection={total_rejection_value}, net_payable={net_payable}, status={new_status}")
    
    return {"message": "Payment deleted successfully"}


@router.get("/retailer-payments/orphans")
async def get_orphan_payments(current_user: dict = Depends(get_current_user)):
    """Find payments that are not linked to any existing invoice"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view orphan payments")
    
    # Get all payments
    all_payments = await db.retailer_payments.find({}, {"_id": 0}).to_list(10000)
    
    # Get all invoice numbers
    all_invoices = await db.retailer_invoices.find({}, {"_id": 0, "invoice_number": 1}).to_list(10000)
    invoice_numbers = {inv["invoice_number"] for inv in all_invoices if inv.get("invoice_number")}
    
    # Find orphan payments (not linked to any existing invoice)
    orphan_payments = []
    for payment in all_payments:
        invoice_num = payment.get("invoice_number")
        if invoice_num and invoice_num not in invoice_numbers:
            orphan_payments.append(payment)
    
    return {
        "total_payments": len(all_payments),
        "orphan_count": len(orphan_payments),
        "orphan_payments": orphan_payments
    }


@router.get("/retailer-payments/detailed/{retailer_id}")
async def get_retailer_payments_detailed(retailer_id: str, current_user: dict = Depends(get_current_user)):
    """Get ALL payments for a specific retailer with full details - for debugging"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view detailed payments")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0, "name": 1, "email": 1})
    
    # Get all payments for this retailer
    payments = await db.retailer_payments.find({"retailer_id": retailer_id}, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    
    # Get all invoices for this retailer to cross-reference
    invoices = await db.retailer_invoices.find({"retailer_id": retailer_id}, {"_id": 0, "id": 1, "invoice_number": 1, "net_payable": 1, "paid_amount": 1, "status": 1}).to_list(1000)
    invoice_map = {inv["id"]: inv for inv in invoices}
    
    # Enrich payments with invoice info and identify orphans
    enriched_payments = []
    total_amount = 0
    for payment in payments:
        invoice_id = payment.get("invoice_id")
        invoice_info = invoice_map.get(invoice_id) if invoice_id else None
        
        enriched_payments.append({
            **payment,
            "linked_invoice": invoice_info,
            "is_orphan": invoice_id and not invoice_info
        })
        total_amount += payment.get("amount", 0)
    
    return {
        "retailer": retailer,
        "retailer_id": retailer_id,
        "total_payments_count": len(payments),
        "total_amount": round(total_amount, 2),
        "payments": enriched_payments
    }


# ------------ RETAILER CREDIT NOTES ------------

@router.get("/retailer-credit-notes")
async def get_retailer_credit_notes(
    retailer_id: str = None,
    status: str = None,
    original_invoice_id: str = None,
    adjusted_against_invoice: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all credit notes, optionally filtered by retailer, status, or invoice"""
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    if status:
        query["status"] = status
    
    # Filter by original invoice (credit notes CREATED FROM this invoice)
    if original_invoice_id:
        query["original_invoice_id"] = original_invoice_id
    
    # Filter by adjusted against invoice (credit notes APPLIED TO this invoice)
    if adjusted_against_invoice:
        query["adjusted_against_invoices.invoice_id"] = adjusted_against_invoice
    
    credit_notes = await db.retailer_credit_notes.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return credit_notes

@router.get("/retailer-credit-notes/pending/{retailer_id}")
async def get_pending_credit_notes(retailer_id: str, current_user: dict = Depends(get_current_user)):
    """Get pending and partial credit notes for a retailer (for payment collection)"""
    credit_notes = await db.retailer_credit_notes.find(
        {"retailer_id": retailer_id, "status": {"$in": ["pending", "partial"]}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    total_pending = sum(cn.get("pending_amount", cn.get("amount", 0)) for cn in credit_notes)
    
    return {
        "credit_notes": credit_notes,
        "total_pending_credit": round(total_pending, 2),
        "count": len(credit_notes)
    }


@router.get("/retailer-credit-notes/my-summary")
async def get_my_credit_notes_summary(current_user: dict = Depends(get_current_user)):
    """Get credit notes summary for the logged-in retailer grouped by INVOICE (supply date)"""
    if current_user["role"] != "retailer":
        raise HTTPException(status_code=403, detail="Only retailers can access this endpoint")
    
    retailer_id = current_user["user_id"]
    
    # Fetch all credit notes for this retailer
    credit_notes = await db.retailer_credit_notes.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Calculate summary totals
    total_issued = sum(cn.get("amount", 0) or 0 for cn in credit_notes)
    total_adjusted = sum(cn.get("adjusted_amount", 0) or 0 for cn in credit_notes)
    # Calculate pending properly: amount - adjusted_amount (not using stored pending_amount which may be stale)
    total_pending = sum((cn.get("amount", 0) or 0) - (cn.get("adjusted_amount", 0) or 0) for cn in credit_notes)
    
    # Group credit notes by INVOICE (original_invoice_number)
    # This shows all rejections for a particular supply/invoice together
    from collections import defaultdict
    invoice_groups = defaultdict(lambda: {"credit_notes": [], "total_credit": 0, "invoice_date": None})
    
    for cn in credit_notes:
        invoice_num = cn.get("original_invoice_number") or "Unknown Invoice"
        invoice_groups[invoice_num]["credit_notes"].append(cn)
        invoice_groups[invoice_num]["total_credit"] += cn.get("amount", 0)
        
        # Extract invoice date from invoice number (format: XXX-INV-DDMMMYYYY-NNN)
        # e.g., SAV-INV-01JUN2026-001 -> 2026-06-01
        if not invoice_groups[invoice_num]["invoice_date"]:
            try:
                # Try to extract date from invoice number
                parts = invoice_num.split('-')
                if len(parts) >= 3:
                    date_part = parts[2]  # e.g., "01JUN2026"
                    if len(date_part) >= 9:
                        day = date_part[:2]
                        month_str = date_part[2:5].upper()
                        year = date_part[5:9]
                        month_map = {'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 
                                     'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
                                     'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'}
                        month = month_map.get(month_str, '01')
                        invoice_groups[invoice_num]["invoice_date"] = f"{year}-{month}-{day}"
            except:
                pass
    
    # Convert to sorted list (newest invoice first)
    invoices_list = []
    for invoice_num, group in sorted(invoice_groups.items(), key=lambda x: x[1].get("invoice_date") or "0000-00-00", reverse=True):
        # Enhance each credit note with calculated pending amount
        enhanced_credit_notes = []
        for cn in group["credit_notes"]:
            # Calculate actual pending amount
            cn_amount = cn.get("amount", 0) or 0
            cn_adjusted = cn.get("adjusted_amount", 0) or 0
            cn_pending = cn_amount - cn_adjusted
            
            # Add calculated pending to the CN data
            enhanced_cn = dict(cn)
            enhanced_cn["pending_amount"] = round(cn_pending, 2)
            enhanced_cn["is_fully_adjusted"] = cn_pending <= 0
            enhanced_credit_notes.append(enhanced_cn)
        
        invoices_list.append({
            "invoice_number": invoice_num,
            "invoice_date": group["invoice_date"],
            "credit_amount": round(group["total_credit"], 2),
            "credit_note_count": len(group["credit_notes"]),
            "credit_notes": enhanced_credit_notes
        })
    
    return {
        "summary": {
            "total_issued": round(total_issued, 2),
            "total_adjusted": round(total_adjusted, 2),
            "total_pending": round(max(0, total_pending), 2),
            "total_count": len(credit_notes)
        },
        "invoices": invoices_list
    }


@router.post("/retailer-credit-notes")
async def create_retailer_credit_note(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a credit note from a rejection"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can create credit notes")
    
    # Get the original invoice
    original_invoice = await db.retailer_invoices.find_one({"id": input.get("original_invoice_id")})
    if not original_invoice:
        raise HTTPException(status_code=404, detail="Original invoice not found")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.get("retailer_id")})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # Generate credit note number with retailer prefix (e.g., CN-TAM-0001)
    retailer_name = retailer.get("company_name", retailer.get("name", ""))
    retailer_prefix = ''.join(c for c in retailer_name.upper() if c.isalpha())[:3] or "RET"
    credit_note_number = await get_next_credit_note_number(db, retailer_prefix)
    
    # Calculate credit amount after deducting commission
    # Credit = Rejection Value × (1 - Commission%)
    rejection_value = input.get("amount", 0)
    commission_pct = retailer.get("commission_percentage", 0) or 0
    credit_amount = rejection_value * (1 - commission_pct / 100)
    
    # Create credit note
    credit_note = {
        "id": str(uuid.uuid4()),
        "credit_note_number": credit_note_number,
        "retailer_id": input.get("retailer_id"),
        "retailer_name": retailer.get("company_name") or retailer.get("name", "Unknown"),
        "original_invoice_id": input.get("original_invoice_id"),
        "original_invoice_number": original_invoice.get("invoice_number", ""),
        "rejection_id": input.get("rejection_id"),
        "rejection_date": datetime.now(timezone.utc),
        "rejection_value": round(rejection_value, 2),  # Original MRP value
        "commission_percentage": commission_pct,
        "commission_deducted": round(rejection_value * commission_pct / 100, 2),
        "amount": round(credit_amount, 2),  # Net credit after commission
        "rejection_details": input.get("rejection_details", []),
        "status": "pending",
        "adjusted_amount": 0,
        "pending_amount": round(credit_amount, 2),
        "adjusted_against_invoices": [],
        "remarks": input.get("remarks"),
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.retailer_credit_notes.insert_one(credit_note)
    
    # Update the original invoice to mark it has a credit note
    await db.retailer_invoices.update_one(
        {"id": input.get("original_invoice_id")},
        {
            "$set": {
                "has_credit_note": True,
                "credit_note_amount": round(credit_amount, 2),
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Credit note created successfully",
        "credit_note": {k: v for k, v in credit_note.items() if k != "_id"}
    }

@router.post("/retailer-credit-notes/from-excess")
async def create_credit_note_from_excess(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create a credit note from excess payment on an invoice"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can create credit notes")
    
    invoice_id = input.get("invoice_id")
    excess_amount = input.get("excess_amount", 0)
    remarks = input.get("remarks", "")
    
    if excess_amount <= 0:
        raise HTTPException(status_code=400, detail="Excess amount must be greater than 0")
    
    # Get the invoice
    invoice = await db.retailer_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    retailer_id = invoice.get("retailer_id")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": retailer_id})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # Check if credit note already exists for this invoice's excess
    existing_cn = await db.retailer_credit_notes.find_one({
        "original_invoice_id": invoice_id,
        "source": "excess_payment"
    })
    if existing_cn:
        raise HTTPException(status_code=400, detail=f"Credit note {existing_cn.get('credit_note_number')} already exists for this invoice's excess payment")
    
    # Generate credit note number
    retailer_name = retailer.get("company_name", retailer.get("name", ""))
    retailer_prefix = ''.join(c for c in retailer_name.upper() if c.isalpha())[:3] or "RET"
    credit_note_number = await get_next_credit_note_number(db, retailer_prefix)
    
    # Create credit note - no commission deduction for excess payments (already collected)
    credit_note = {
        "id": str(uuid.uuid4()),
        "credit_note_number": credit_note_number,
        "retailer_id": retailer_id,
        "retailer_name": retailer.get("company_name") or retailer.get("name", "Unknown"),
        "original_invoice_id": invoice_id,
        "original_invoice_number": invoice.get("invoice_number", ""),
        "source": "excess_payment",  # Mark as excess payment credit note
        "rejection_id": None,
        "rejection_date": None,
        "rejection_value": 0,  # No rejection value - this is from excess payment
        "commission_percentage": 0,  # No commission deduction
        "commission_deducted": 0,
        "amount": round(excess_amount, 2),  # Full excess amount as credit
        "rejection_details": [],
        "status": "pending",
        "adjusted_amount": 0,
        "pending_amount": round(excess_amount, 2),
        "adjusted_against_invoices": [],
        "remarks": remarks or f"Excess payment on invoice {invoice.get('invoice_number', '')}",
        "created_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.retailer_credit_notes.insert_one(credit_note)
    
    # Update the invoice to mark it has excess credit note
    await db.retailer_invoices.update_one(
        {"id": invoice_id},
        {
            "$set": {
                "has_excess_credit_note": True,
                "excess_credit_note_id": credit_note["id"],
                "excess_credit_note_amount": round(excess_amount, 2),
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    logger.info(f"Created excess payment credit note {credit_note_number} for {retailer_name} - Amount: {excess_amount}")
    
    return {
        "message": f"Credit note {credit_note_number} created for excess amount ₹{excess_amount}",
        "credit_note": {k: v for k, v in credit_note.items() if k != "_id"}
    }

@router.post("/retailer-credit-notes/adjust")
async def adjust_credit_note(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Adjust credit note(s) against an invoice during payment collection"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can adjust credit notes")
    
    invoice_id = input.get("invoice_id")
    adjustments = input.get("adjustments", [])  # [{credit_note_id, amount}]
    
    # Get the invoice
    invoice = await db.retailer_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    total_adjusted = 0
    adjustment_records = []
    
    for adj in adjustments:
        cn_id = adj.get("credit_note_id")
        adj_amount = adj.get("amount", 0)
        
        credit_note = await db.retailer_credit_notes.find_one({"id": cn_id})
        if not credit_note:
            continue
        
        pending = credit_note.get("pending_amount", credit_note.get("amount", 0))
        actual_adj = min(adj_amount, pending)
        
        if actual_adj <= 0:
            continue
        
        # Update credit note
        new_adjusted = credit_note.get("adjusted_amount", 0) + actual_adj
        new_pending = credit_note.get("amount", 0) - new_adjusted
        new_status = "adjusted" if new_pending <= 0 else "partial"
        
        adjustment_record = {
            "invoice_id": invoice_id,
            "invoice_number": invoice.get("invoice_number", ""),
            "amount": actual_adj,
            "date": datetime.now(timezone.utc).isoformat()
        }
        
        await db.retailer_credit_notes.update_one(
            {"id": cn_id},
            {
                "$set": {
                    "adjusted_amount": round(new_adjusted, 2),
                    "pending_amount": round(max(0, new_pending), 2),
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc)
                },
                "$push": {
                    "adjusted_against_invoices": adjustment_record
                }
            }
        )
        
        total_adjusted += actual_adj
        adjustment_records.append({
            "credit_note_id": cn_id,
            "credit_note_number": credit_note.get("credit_note_number"),
            "amount_adjusted": actual_adj
        })
    
    # Update invoice with credit adjustment info
    if total_adjusted > 0:
        await db.retailer_invoices.update_one(
            {"id": invoice_id},
            {
                "$set": {
                    "credit_adjusted": True,
                    "credit_adjustment_amount": total_adjusted,
                    "credit_adjustments": adjustment_records,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    
    return {
        "message": f"Credit adjustment of ₹{total_adjusted} applied successfully",
        "total_adjusted": round(total_adjusted, 2),
        "adjustments": adjustment_records
    }

@router.delete("/retailer-credit-notes/{credit_note_id}")
async def delete_credit_note(credit_note_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a credit note (only if not adjusted)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete credit notes")
    
    credit_note = await db.retailer_credit_notes.find_one({"id": credit_note_id})
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    if credit_note.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Cannot delete adjusted credit notes")
    
    # Remove credit note
    await db.retailer_credit_notes.delete_one({"id": credit_note_id})
    
    # Update original invoice
    await db.retailer_invoices.update_one(
        {"id": credit_note.get("original_invoice_id")},
        {
            "$set": {
                "has_credit_note": False,
                "credit_note_amount": 0,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"message": "Credit note deleted successfully"}

@router.put("/retailer-credit-notes/{credit_note_id}")
async def update_credit_note(credit_note_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Update a credit note (only if pending or partial - not fully adjusted)"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update credit notes")
    
    credit_note = await db.retailer_credit_notes.find_one({"id": credit_note_id}, {"_id": 0})
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    # Don't allow editing fully adjusted credit notes
    if credit_note.get("status") == "adjusted":
        raise HTTPException(status_code=400, detail="Cannot edit fully adjusted credit notes")
    
    update_data = {}
    
    # Updatable fields
    if "amount" in input:
        new_amount = float(input["amount"])
        adjusted_amount = credit_note.get("adjusted_amount", 0)
        
        # New amount must be >= already adjusted amount
        if new_amount < adjusted_amount:
            raise HTTPException(
                status_code=400, 
                detail=f"New amount (₹{new_amount}) cannot be less than already adjusted amount (₹{adjusted_amount})"
            )
        
        update_data["amount"] = round(new_amount, 2)
        update_data["pending_amount"] = round(new_amount - adjusted_amount, 2)
        
        # Update status if needed
        if update_data["pending_amount"] <= 0.01:
            update_data["status"] = "adjusted"
        elif adjusted_amount > 0:
            update_data["status"] = "partial"
        else:
            update_data["status"] = "pending"
    
    if "remarks" in input:
        update_data["remarks"] = input["remarks"]
    
    if "rejection_details" in input:
        update_data["rejection_details"] = input["rejection_details"]
    
    if not update_data:
        return {"message": "No changes to update", "credit_note": credit_note}
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.retailer_credit_notes.update_one(
        {"id": credit_note_id},
        {"$set": update_data}
    )
    
    # Update invoice credit_note_amount if amount changed
    if "amount" in input:
        await db.retailer_invoices.update_one(
            {"id": credit_note.get("original_invoice_id")},
            {"$set": {"credit_note_amount": update_data["amount"]}}
        )
    
    # Fetch updated credit note
    updated_cn = await db.retailer_credit_notes.find_one({"id": credit_note_id}, {"_id": 0})
    
    return {"message": "Credit note updated successfully", "credit_note": updated_cn}

@router.get("/retailer-credit-notes/summary/{retailer_id}")
async def get_retailer_credit_summary(retailer_id: str, current_user: dict = Depends(get_current_user)):
    """Get credit note summary for a retailer"""
    all_cns = await db.retailer_credit_notes.find({"retailer_id": retailer_id}, {"_id": 0}).to_list(500)
    
    total_credit_issued = sum(cn.get("amount", 0) for cn in all_cns)
    total_adjusted = sum(cn.get("adjusted_amount", 0) for cn in all_cns)
    total_pending = sum(cn.get("pending_amount", cn.get("amount", 0)) for cn in all_cns if cn.get("status") in ["pending", "partial"])
    
    return {
        "total_credit_issued": round(total_credit_issued, 2),
        "total_adjusted": round(total_adjusted, 2),
        "total_pending": round(total_pending, 2),
        "pending_count": len([cn for cn in all_cns if cn.get("status") in ["pending", "partial"]]),
        "adjusted_count": len([cn for cn in all_cns if cn.get("status") == "adjusted"])
    }


@router.post("/retailer-credit-notes/backfill-missing")
async def backfill_missing_credit_notes(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Find rejections that don't have credit notes and create them.
    This is useful for fixing historical data where credit notes should have been generated.
    
    Logic:
    - Find all rejections (optionally filtered by retailer_id)
    - For each rejection, check if a credit note exists (via rejection_id link)
    - If no credit note exists, find the correct invoice and create the credit note
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can backfill credit notes")
    
    # Build query - ONLY process rejections CREATED from June 15, 2026 onwards
    # Earlier rejections were already adjusted through other means
    # Filter by created_at (when rejection was entered), not rejection_date (invoice date)
    cutoff_date = "2026-06-15"
    
    query = {
        "$or": [
            {"created_at": {"$gte": cutoff_date}},  # Simple date string comparison
            {"created_at": {"$regex": "^2026-06-1[5-9]"}},  # June 15-19
            {"created_at": {"$regex": "^2026-06-2"}},  # June 20-29
            {"created_at": {"$regex": "^2026-06-3"}},  # June 30
            {"created_at": {"$regex": "^2026-0[7-9]"}},  # July onwards
            {"created_at": {"$regex": "^2026-1"}},  # Oct-Dec
            {"created_at": {"$regex": "^202[7-9]"}},  # 2027+
        ]
    }
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    # Get rejections created from June 15 onwards only
    rejections = await db.retailer_rejections.find(query, {"_id": 0}).to_list(10000)
    logger.info(f"Found {len(rejections)} rejections created from {cutoff_date} onwards to check")
    
    created_count = 0
    skipped_already_exists = 0
    skipped_no_invoice = 0
    skipped_not_fully_paid = 0
    errors = []
    created_details = []
    
    for rejection in rejections:
        rejection_id = rejection.get("id")
        retailer_id_rej = rejection.get("retailer_id")
        
        # Check if credit note already exists for this rejection
        existing_cn = await db.retailer_credit_notes.find_one({"rejection_id": rejection_id})
        if existing_cn:
            skipped_already_exists += 1
            continue
        
        # Get rejection value
        rejection_value = rejection.get("rejection_value", 0)
        if not rejection_value:
            rejection_value = rejection.get("quantity", 0) * rejection.get("mrp", 0)
        
        if rejection_value <= 0:
            continue
        
        # Get retailer info
        retailer = await db.users.find_one({"id": retailer_id_rej}, {"_id": 0})
        if not retailer:
            errors.append(f"Retailer not found for rejection {rejection_id}")
            continue
        
        # Find the correct invoice for this rejection
        invoice = None
        rejection_date_str = str(rejection.get("rejection_date", ""))[:10]
        
        # Strategy 1: Find invoice via dispatch_id
        dispatch_id = rejection.get("dispatch_id")
        if dispatch_id:
            # First try standard array query
            invoice = await db.retailer_invoices.find_one({
                "retailer_id": retailer_id_rej,
                "dispatch_ids": dispatch_id
            }, {"_id": 0})
            
            # If not found, search for stringified dispatch_ids (legacy data issue)
            if not invoice:
                potential_invoices = await db.retailer_invoices.find({
                    "retailer_id": retailer_id_rej
                }, {"_id": 0}).to_list(500)
                
                for inv in potential_invoices:
                    raw_dispatch_ids = inv.get("dispatch_ids")
                    normalized = normalize_dispatch_ids(raw_dispatch_ids)
                    if dispatch_id in normalized:
                        invoice = inv
                        break
        
        # Strategy 2: Find invoice by date match (rejection date = invoice date)
        if not invoice:
            invoice = await db.retailer_invoices.find_one({
                "retailer_id": retailer_id_rej,
                "invoice_date": {"$regex": f"^{rejection_date_str}"}
            }, {"_id": 0})
        
        # Strategy 3: Try to find invoice that contains matching product/variant
        if not invoice:
            product_id = rejection.get("product_id")
            variant_id = rejection.get("variant_id")
            
            # Find invoices for this retailer and look for matching items
            potential_invoices = await db.retailer_invoices.find(
                {"retailer_id": retailer_id_rej},
                {"_id": 0}
            ).sort("invoice_date", -1).to_list(50)
            
            for inv in potential_invoices:
                items = inv.get("items", [])
                for item in items:
                    if item.get("product_id") == product_id:
                        if not variant_id or item.get("variant_id") == variant_id:
                            invoice = inv
                            break
                if invoice:
                    break
        
        if not invoice:
            skipped_no_invoice += 1
            continue
        
        # Check if invoice is fully paid (credit note only makes sense for settled invoices)
        invoice_id = invoice.get("id")
        net_payable = invoice.get("net_payable", 0) or 0
        
        payments = await db.retailer_payments.find(
            {"invoice_id": invoice_id},
            {"_id": 0, "amount": 1}
        ).to_list(100)
        total_paid = sum(p.get("amount", 0) or 0 for p in payments)
        
        # For 100% upfront retailers, invoice is considered paid by default (they pay before delivery)
        # For other retailers, check if invoice is fully paid
        upfront_pct = retailer.get("upfront_collection_percentage", 0) or 0
        is_upfront_retailer = upfront_pct >= 100
        
        if not is_upfront_retailer and total_paid < net_payable and net_payable > 0:
            skipped_not_fully_paid += 1
            continue
        
        # Generate credit note number
        retailer_name = retailer.get("company_name", retailer.get("name", ""))
        retailer_prefix = ''.join(c for c in retailer_name.upper() if c.isalpha())[:3] or "RET"
        credit_note_number = await get_next_credit_note_number(db, retailer_prefix)
        
        # Calculate credit amount after deducting commission
        commission_pct = retailer.get("commission_percentage", 0) or 0
        credit_amount = rejection_value * (1 - commission_pct / 100)
        
        # Create credit note
        credit_note = {
            "id": str(uuid.uuid4()),
            "credit_note_number": credit_note_number,
            "retailer_id": retailer_id_rej,
            "retailer_name": retailer.get("company_name", retailer.get("name", "")),
            "original_invoice_id": invoice.get("id"),
            "original_invoice_number": invoice.get("invoice_number"),
            "rejection_id": rejection_id,
            "rejection_date": rejection.get("rejection_date"),
            "rejection_value": round(rejection_value, 2),
            "commission_percentage": commission_pct,
            "commission_deducted": round(rejection_value * commission_pct / 100, 2),
            "amount": round(credit_amount, 2),
            "rejection_details": [{
                "product_name": rejection.get("product_name"),
                "variant_name": rejection.get("variant_name"),
                "quantity": rejection.get("quantity"),
                "mrp": rejection.get("mrp"),
                "value": round(rejection_value, 2),
                "reason": rejection.get("reason")
            }],
            "status": "pending",
            "adjusted_amount": 0,
            "pending_amount": round(credit_amount, 2),
            "adjusted_against_invoices": [],
            "remarks": f"Backfill: Auto-generated for rejection on {rejection_date_str}",
            "created_by": current_user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_generated": True,
            "backfilled": True
        }
        
        await db.retailer_credit_notes.insert_one(credit_note)
        created_count += 1
        
        created_details.append({
            "credit_note_number": credit_note_number,
            "retailer": retailer_name,
            "invoice": invoice.get("invoice_number"),
            "rejection_value": round(rejection_value, 2),
            "credit_amount": round(credit_amount, 2),
            "product": rejection.get("product_name"),
            "variant": rejection.get("variant_name")
        })
        
        logger.info(f"Backfill: Created credit note {credit_note_number} for rejection {rejection_id} - Amount: ₹{credit_amount}")
    
    return {
        "message": f"Backfill complete. Created {created_count} credit notes.",
        "summary": {
            "total_rejections_checked": len(rejections),
            "credit_notes_created": created_count,
            "skipped_already_has_cn": skipped_already_exists,
            "skipped_no_invoice_found": skipped_no_invoice,
            "skipped_invoice_not_fully_paid": skipped_not_fully_paid
        },
        "created": created_details,
        "errors": errors[:10]  # Limit errors shown
    }


@router.post("/retailer-credit-notes/reconcile-100-upfront")
async def reconcile_100_upfront_credit_notes(
    retailer_id: Optional[str] = None,
    dry_run: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """
    Find all rejections for 100% upfront retailers that don't have credit notes
    and create them. Unlike the regular backfill, this creates CNs even if
    no invoice is found (with pending linkage status).
    
    Query params:
        dry_run=true (default): Preview mode - shows what WOULD be created without creating
        dry_run=false: Actually creates the credit notes
    
    This is the manual trigger for the daily scheduled reconciliation job.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can run reconciliation")
    
    # Get all 100% upfront retailers
    retailer_query = {
        "role": "retailer",
        "upfront_collection_percentage": 100
    }
    if retailer_id:
        retailer_query["id"] = retailer_id
    
    upfront_retailers = await db.users.find(retailer_query, {"_id": 0, "id": 1, "company_name": 1, "name": 1, "commission_percentage": 1, "model_changed_at": 1}).to_list(None)
    
    if not upfront_retailers:
        return {"message": "No 100% upfront retailers found", "would_create": 0, "dry_run": dry_run}
    
    retailer_ids = [r.get("id") for r in upfront_retailers]
    retailer_map = {r.get("id"): r for r in upfront_retailers}
    
    # Get all rejections for these retailers
    rejections = await db.retailer_rejections.find({
        "retailer_id": {"$in": retailer_ids}
    }, {"_id": 0}).to_list(None)
    
    # Get all credit notes (to check which rejections already have CNs)
    credit_notes = await db.retailer_credit_notes.find({
        "retailer_id": {"$in": retailer_ids}
    }, {"_id": 0, "rejection_id": 1}).to_list(None)
    
    rejection_ids_with_cn = set(cn.get("rejection_id") for cn in credit_notes if cn.get("rejection_id"))
    
    # Find rejections without credit notes
    rejections_without_cn = [r for r in rejections if r.get("id") not in rejection_ids_with_cn]
    
    # First pass: collect all CNs that would be created (for both dry_run and actual run)
    cns_to_create = []
    skipped_before_model_change = 0
    skipped_zero_value = 0
    per_retailer_counts = {}  # retailer_name -> count
    
    for rejection in rejections_without_cn:
        ret_id = rejection.get("retailer_id")
        retailer = retailer_map.get(ret_id)
        
        if not retailer:
            continue
        
        rej_id = rejection.get("id")
        rejection_date = rejection.get("rejection_date", "")
        rejection_date_str = str(rejection_date)[:10]
        dispatch_id = rejection.get("dispatch_id")
        rejection_value = rejection.get("rejection_value", 0) or 0
        
        if rejection_value <= 0:
            skipped_zero_value += 1
            continue
        
        # Check if rejection falls under 100% upfront rules based on model_changed_at
        model_changed_at = retailer.get("model_changed_at")
        if model_changed_at and rejection_date_str < model_changed_at:
            # Rejection is before model change - use 50% rule (needs invoice + fully paid check)
            skipped_before_model_change += 1
            continue
        
        retailer_name = retailer.get("company_name", retailer.get("name", ""))
        commission_pct = retailer.get("commission_percentage", 0) or 0
        credit_amount = rejection_value * (1 - commission_pct / 100)
        
        # Track per-retailer counts
        if retailer_name not in per_retailer_counts:
            per_retailer_counts[retailer_name] = 0
        per_retailer_counts[retailer_name] += 1
        
        cns_to_create.append({
            "retailer_id": ret_id,
            "retailer": retailer,
            "rejection": rejection,
            "dispatch_id": dispatch_id,
            "rejection_date_str": rejection_date_str,
            "rejection_value": rejection_value,
            "credit_amount": credit_amount
        })
    
    # If dry_run, return preview without creating
    if dry_run:
        return {
            "dry_run": True,
            "message": f"Would create {len(cns_to_create)} credit notes",
            "would_create": len(cns_to_create),
            "per_retailer": per_retailer_counts,
            "summary": {
                "retailers_checked": len(upfront_retailers),
                "total_rejections": len(rejections),
                "rejections_without_cn": len(rejections_without_cn),
                "would_create": len(cns_to_create),
                "skipped_before_model_change": skipped_before_model_change,
                "skipped_zero_value": skipped_zero_value
            }
        }
    
    # Actually create the credit notes
    created_count = 0
    linked_count = 0
    unlinked_count = 0
    created_details = []
    
    for cn_data in cns_to_create:
        ret_id = cn_data["retailer_id"]
        retailer = cn_data["retailer"]
        rejection = cn_data["rejection"]
        dispatch_id = cn_data["dispatch_id"]
        rejection_date_str = cn_data["rejection_date_str"]
        rejection_value = cn_data["rejection_value"]
        credit_amount = cn_data["credit_amount"]
        
        rej_id = rejection.get("id")
        rejection_date = rejection.get("rejection_date", "")
        
        # Try to find matching invoice
        invoice = None
        
        if dispatch_id:
            # First try standard array query
            invoice = await db.retailer_invoices.find_one({
                "retailer_id": ret_id,
                "dispatch_ids": dispatch_id
            }, {"_id": 0})
            
            # If not found, try normalized lookup
            if not invoice:
                potential_invoices = await db.retailer_invoices.find({
                    "retailer_id": ret_id
                }, {"_id": 0}).to_list(500)
                
                for inv in potential_invoices:
                    raw_dispatch_ids = inv.get("dispatch_ids")
                    normalized = normalize_dispatch_ids(raw_dispatch_ids)
                    if dispatch_id in normalized:
                        invoice = inv
                        break
        
        # Fallback: find by date
        if not invoice:
            invoice = await db.retailer_invoices.find_one({
                "retailer_id": ret_id,
                "invoice_date": {"$regex": f"^{rejection_date_str}"}
            }, {"_id": 0})
        
        # Generate credit note
        retailer_name = retailer.get("company_name", retailer.get("name", ""))
        retailer_prefix = ''.join(c for c in retailer_name.upper() if c.isalpha())[:3] or "RET"
        credit_note_number = await get_next_credit_note_number(db, retailer_prefix)
        
        commission_pct = retailer.get("commission_percentage", 0) or 0
        
        has_invoice = invoice is not None
        
        credit_note = {
            "id": str(uuid.uuid4()),
            "credit_note_number": credit_note_number,
            "retailer_id": ret_id,
            "retailer_name": retailer_name,
            "original_invoice_id": invoice.get("id") if has_invoice else None,
            "original_invoice_number": invoice.get("invoice_number") if has_invoice else None,
            "rejection_id": rej_id,
            "rejection_date": rejection_date,
            "rejection_value": round(rejection_value, 2),
            "commission_percentage": commission_pct,
            "commission_deducted": round(rejection_value * commission_pct / 100, 2),
            "amount": round(credit_amount, 2),
            "rejection_details": [{
                "product_name": rejection.get("product_name"),
                "variant_name": rejection.get("variant_name"),
                "quantity": rejection.get("quantity"),
                "mrp": rejection.get("mrp"),
                "value": round(rejection_value, 2),
                "reason": rejection.get("reason")
            }],
            "status": "pending",
            "adjusted_amount": 0,
            "pending_amount": round(credit_amount, 2),
            "adjusted_against_invoices": [],
            "remarks": f"Reconciliation: Rejection on {rejection_date_str}" + (" - pending invoice linkage" if not has_invoice else ""),
            "created_by": current_user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_generated": True,
            "invoice_linked": has_invoice
        }
        
        await db.retailer_credit_notes.insert_one(credit_note)
        created_count += 1
        if has_invoice:
            linked_count += 1
        else:
            unlinked_count += 1
        
        created_details.append({
            "credit_note_number": credit_note_number,
            "retailer": retailer_name,
            "invoice": invoice.get("invoice_number") if has_invoice else "PENDING LINKAGE",
            "rejection_value": round(rejection_value, 2),
            "credit_amount": round(credit_amount, 2),
            "product": rejection.get("product_name")
        })
    
    return {
        "dry_run": False,
        "message": f"Reconciliation complete. Created {created_count} credit notes.",
        "created_count": created_count,
        "per_retailer": per_retailer_counts,
        "summary": {
            "retailers_checked": len(upfront_retailers),
            "total_rejections": len(rejections),
            "rejections_without_cn": len(rejections_without_cn),
            "credit_notes_created": created_count,
            "with_invoice_linkage": linked_count,
            "pending_invoice_linkage": unlinked_count,
            "skipped_before_model_change": skipped_before_model_change
        },
        "created": created_details[:50]  # Limit to first 50
    }


@router.post("/retailer-credit-notes/cleanup-bogus-reconciliation")
async def cleanup_bogus_reconciliation_credit_notes(
    confirm: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    ONE-TIME CLEANUP: Delete bogus credit notes created on June 26, 2026 at 10:58 UTC
    for Jai Bhawani and Savtamali retailers.
    
    These credit notes were wrongly created by the reconciliation process before
    model_changed_at dates were set on these retailers.
    
    Query params:
        confirm=false (default): Dry run - only counts, doesn't delete
        confirm=true: Actually deletes the bogus credit notes
    
    IMPORTANT: created_at is stored as ISO string, not Date object.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run cleanup")
    
    # The two retailers whose credit notes were wrongly created
    # (they switched from 50% to 100% upfront on June 18, but model_changed_at wasn't set)
    bogus_retailer_ids = [
        "f77940fb-3852-4155-9ad1-d90e5d7120ab",  # Jai Bhawani
        "d36a4f17-bed0-4d8e-bb35-3e83825a0ce8"   # Savtamali
    ]
    
    # Cutoff timestamp - credit notes created at or after this are bogus
    # Using string comparison since created_at is stored as ISO string
    cutoff_timestamp = "2026-06-26T10:58:00"
    
    # Filter criteria for bogus credit notes
    filter_criteria = {
        "auto_generated": True,
        "status": "pending",
        "created_at": {"$gte": cutoff_timestamp},
        "retailer_id": {"$in": bogus_retailer_ids}
    }
    
    # Count bogus credit notes
    bogus_count = await db.retailer_credit_notes.count_documents(filter_criteria)
    
    # Count per retailer for details
    jai_bhawani_count = await db.retailer_credit_notes.count_documents({
        **filter_criteria,
        "retailer_id": "f77940fb-3852-4155-9ad1-d90e5d7120ab"
    })
    savtamali_count = await db.retailer_credit_notes.count_documents({
        **filter_criteria,
        "retailer_id": "d36a4f17-bed0-4d8e-bb35-3e83825a0ce8"
    })
    
    # Current total
    current_total = await db.retailer_credit_notes.count_documents({})
    
    if not confirm:
        # Dry run - just return the count
        return {
            "dry_run": True,
            "message": f"Found {bogus_count} bogus credit notes to delete",
            "bogus_count": bogus_count,
            "breakdown": {
                "jai_bhawani": jai_bhawani_count,
                "savtamali": savtamali_count
            },
            "current_total": current_total,
            "expected_total_after_delete": current_total - bogus_count
        }
    
    # Actually delete
    if bogus_count == 0:
        return {
            "dry_run": False,
            "message": "No bogus credit notes found. Nothing to delete.",
            "deleted_count": 0,
            "new_total": current_total
        }
    
    result = await db.retailer_credit_notes.delete_many(filter_criteria)
    deleted_count = result.deleted_count
    
    # Verify new total
    new_total = await db.retailer_credit_notes.count_documents({})
    
    return {
        "dry_run": False,
        "message": f"Successfully deleted {deleted_count} bogus credit notes",
        "deleted_count": deleted_count,
        "breakdown": {
            "jai_bhawani": jai_bhawani_count,
            "savtamali": savtamali_count
        },
        "previous_total": current_total,
        "new_total": new_total
    }


@router.post("/admin/set-model-change-dates")
async def set_model_change_dates(
    current_user: dict = Depends(get_current_user)
):
    """
    ONE-TIME SETUP: Set model_changed_at date for Jai Bhawani and Savtamali.
    
    These retailers switched from 50% to 100% upfront model on June 18, 2026.
    This endpoint sets the model_changed_at field so the system knows to use:
    - 50% rule (reduce invoice) for rejections BEFORE June 18
    - 100% rule (instant credit note) for rejections ON or AFTER June 18
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can set model change dates")
    
    # The two retailers and their switch date
    retailers_to_update = [
        {"id": "f77940fb-3852-4155-9ad1-d90e5d7120ab", "name": "Jai Bhawani Traders Mundhwa"},
        {"id": "d36a4f17-bed0-4d8e-bb35-3e83825a0ce8", "name": "Savtamali"}
    ]
    model_change_date = "2026-06-18"
    
    results = []
    
    for retailer in retailers_to_update:
        # Update the retailer
        result = await db.users.update_one(
            {"id": retailer["id"]},
            {"$set": {"model_changed_at": model_change_date}}
        )
        
        # Verify the update
        updated_user = await db.users.find_one(
            {"id": retailer["id"]},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1, "model_changed_at": 1, "upfront_collection_percentage": 1}
        )
        
        results.append({
            "retailer_id": retailer["id"],
            "retailer_name": retailer["name"],
            "matched": result.matched_count,
            "modified": result.modified_count,
            "current_model_changed_at": updated_user.get("model_changed_at") if updated_user else None,
            "upfront_percentage": updated_user.get("upfront_collection_percentage") if updated_user else None
        })
    
    all_success = all(r["modified"] == 1 or r["current_model_changed_at"] == model_change_date for r in results)
    
    return {
        "success": all_success,
        "message": f"Set model_changed_at to {model_change_date} for Jai Bhawani and Savtamali",
        "model_change_date": model_change_date,
        "results": results
    }


@router.post("/retailer-credit-notes/fix-orphaned")
async def fix_orphaned_credit_notes(
    input: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """
    Fix credit notes that are marked as 'adjusted' but reference deleted invoices.
    This resets them to 'pending' status so they can be adjusted against new invoices.
    
    Use this after deleting invoices that had credit notes adjusted against them.
    
    Body (optional): {"retailer_id": "xxx"} to fix only for a specific retailer
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can fix orphaned credit notes")
    
    retailer_id = input.get("retailer_id") if input else None
    
    # Build query for credit notes that are adjusted
    query = {"status": {"$in": ["adjusted", "partial"]}}
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    credit_notes = await db.retailer_credit_notes.find(query, {"_id": 0}).to_list(1000)
    
    fixed_count = 0
    fixed_details = []
    
    for cn in credit_notes:
        adjusted_in_invoices = cn.get("adjusted_in_invoices", [])
        if not adjusted_in_invoices:
            continue
        
        # Check if any of the invoices the CN was adjusted against still exist
        orphaned_adjustments = []
        valid_adjustments = []
        total_orphaned_amount = 0
        
        for adj in adjusted_in_invoices:
            invoice_id = adj.get("invoice_id")
            invoice_number = adj.get("invoice_number")
            adj_amount = adj.get("adjusted_amount", adj.get("amount", 0))
            
            # Check if invoice exists
            invoice = await db.retailer_invoices.find_one({"id": invoice_id})
            if invoice:
                valid_adjustments.append(adj)
            else:
                orphaned_adjustments.append(adj)
                total_orphaned_amount += adj_amount
                logger.info(f"Found orphaned adjustment: CN {cn.get('credit_note_number')} -> deleted invoice {invoice_number}")
        
        if orphaned_adjustments:
            # Recalculate amounts
            total_amount = cn.get("amount", 0) or 0
            current_adjusted = cn.get("adjusted_amount", 0) or 0
            new_adjusted = max(0, current_adjusted - total_orphaned_amount)
            new_pending = total_amount - new_adjusted
            
            # Determine new status
            if new_adjusted <= 0:
                new_status = "pending"
            elif new_adjusted >= total_amount:
                new_status = "adjusted"
            else:
                new_status = "partial"
            
            # Update credit note
            await db.retailer_credit_notes.update_one(
                {"id": cn.get("id")},
                {"$set": {
                    "adjusted_amount": round(new_adjusted, 2),
                    "pending_amount": round(new_pending, 2),
                    "status": new_status,
                    "adjusted_in_invoices": valid_adjustments,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            fixed_count += 1
            fixed_details.append({
                "credit_note_number": cn.get("credit_note_number"),
                "retailer": cn.get("retailer_name"),
                "old_status": cn.get("status"),
                "new_status": new_status,
                "amount_freed": round(total_orphaned_amount, 2),
                "new_pending": round(new_pending, 2),
                "orphaned_invoices": [a.get("invoice_number") for a in orphaned_adjustments]
            })
    
    return {
        "message": f"Fixed {fixed_count} orphaned credit notes.",
        "fixed_count": fixed_count,
        "fixed_details": fixed_details
    }


@router.get("/retailer-credit-notes/diagnose-sync-issues")
async def diagnose_cn_invoice_sync_issues(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Diagnose credit notes that show as 'adjusted' but the corresponding invoice
    doesn't have the adjustment recorded (total_credit_adjusted / credit_note_adjustments).
    
    This finds data mismatches where:
    - CN has adjusted_in_invoices or adjusted_against_invoices pointing to an invoice
    - But the invoice's credit_note_adjustments doesn't include this CN
    - Or invoice's total_credit_adjusted doesn't match sum of CN adjustments
    
    Returns list of mismatches that need fixing.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can diagnose sync issues")
    
    # Find credit notes that have adjustments
    query = {
        "$or": [
            {"adjusted_in_invoices": {"$exists": True, "$ne": []}},
            {"adjusted_against_invoices": {"$exists": True, "$ne": []}}
        ]
    }
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    credit_notes = await db.retailer_credit_notes.find(query, {"_id": 0}).to_list(10000)
    
    mismatches = []
    invoices_checked = set()
    
    for cn in credit_notes:
        cn_id = cn.get("id")
        cn_number = cn.get("credit_note_number")
        cn_amount = cn.get("amount", 0)
        
        # Get all adjustments (from both field names)
        adjustments = cn.get("adjusted_in_invoices", []) + cn.get("adjusted_against_invoices", [])
        
        for adj in adjustments:
            invoice_id = adj.get("invoice_id")
            invoice_number = adj.get("invoice_number", "")
            adjusted_amount = adj.get("adjusted_amount", adj.get("amount", 0))
            
            if not invoice_id:
                continue
            
            # Get the invoice - try by id first, then by invoice_number
            invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
            
            # If not found by id, try by invoice_number
            if not invoice and invoice_number:
                invoice = await db.retailer_invoices.find_one({"invoice_number": invoice_number}, {"_id": 0})
            
            if not invoice:
                # Invoice doesn't exist - this is an orphan (handled by fix-orphaned)
                mismatches.append({
                    "type": "INVOICE_NOT_FOUND",
                    "credit_note_id": cn_id,
                    "credit_note_number": cn_number,
                    "invoice_id": invoice_id,
                    "invoice_number": invoice_number,
                    "adjusted_amount": adjusted_amount,
                    "retailer": cn.get("retailer_name"),
                    "issue": f"Invoice {invoice_number} not found in database"
                })
                continue
            
            # Check if invoice has this CN in credit_note_adjustments
            inv_cn_adjustments = invoice.get("credit_note_adjustments", [])
            inv_credit_adjustments = invoice.get("credit_adjustments", [])  # Alternative field name
            
            cn_found_in_invoice = False
            cn_amount_in_invoice = 0
            
            # Check credit_note_adjustments (primary field)
            for inv_adj in inv_cn_adjustments:
                # Handle both dict and string formats
                if isinstance(inv_adj, dict):
                    if inv_adj.get("credit_note_id") == cn_id or inv_adj.get("credit_note_number") == cn_number:
                        cn_found_in_invoice = True
                        cn_amount_in_invoice = inv_adj.get("adjusted_amount", inv_adj.get("amount", 0))
                        break
                elif isinstance(inv_adj, str) and (inv_adj == cn_id or inv_adj == cn_number):
                    cn_found_in_invoice = True
                    # Amount unknown when stored as string
                    break
            
            # Check credit_adjustments (alternative field)
            if not cn_found_in_invoice:
                for inv_adj in inv_credit_adjustments:
                    if isinstance(inv_adj, dict):
                        if inv_adj.get("credit_note_id") == cn_id or inv_adj.get("credit_note_number") == cn_number:
                            cn_found_in_invoice = True
                            cn_amount_in_invoice = inv_adj.get("amount_adjusted", inv_adj.get("amount", 0))
                            break
                    elif isinstance(inv_adj, str) and (inv_adj == cn_id or inv_adj == cn_number):
                        cn_found_in_invoice = True
                        break
            
            if not cn_found_in_invoice:
                # CN says adjusted against invoice, but invoice doesn't have this CN
                mismatches.append({
                    "type": "CN_NOT_IN_INVOICE",
                    "credit_note_id": cn_id,
                    "credit_note_number": cn_number,
                    "invoice_id": invoice_id,
                    "invoice_number": invoice.get("invoice_number"),
                    "adjusted_amount": adjusted_amount,
                    "retailer": cn.get("retailer_name"),
                    "invoice_total_credit_adjusted": invoice.get("total_credit_adjusted", 0),
                    "invoice_credit_note_adjustments": len(inv_cn_adjustments),
                    "issue": f"CN {cn_number} claims adjustment of ₹{adjusted_amount} against {invoice.get('invoice_number')}, but invoice doesn't have this CN recorded"
                })
            elif abs(cn_amount_in_invoice - adjusted_amount) > 0.01:
                # Amount mismatch
                mismatches.append({
                    "type": "AMOUNT_MISMATCH",
                    "credit_note_id": cn_id,
                    "credit_note_number": cn_number,
                    "invoice_id": invoice_id,
                    "invoice_number": invoice.get("invoice_number"),
                    "cn_says_adjusted": adjusted_amount,
                    "invoice_says_adjusted": cn_amount_in_invoice,
                    "retailer": cn.get("retailer_name"),
                    "issue": f"Amount mismatch: CN says ₹{adjusted_amount}, invoice says ₹{cn_amount_in_invoice}"
                })
            
            # Track invoice for total check
            invoices_checked.add(invoice_id)
    
    # Also check invoices where total_credit_adjusted doesn't match sum of credit_note_adjustments
    total_mismatch_count = 0
    for inv_id in invoices_checked:
        invoice = await db.retailer_invoices.find_one({"id": inv_id}, {"_id": 0})
        if not invoice:
            continue
        
        stored_total = invoice.get("total_credit_adjusted", 0) or 0
        adjustments = invoice.get("credit_note_adjustments", [])
        calculated_total = sum(
            (adj.get("adjusted_amount", adj.get("amount", 0)) or 0) if isinstance(adj, dict) else 0
            for adj in adjustments
        )
        
        if abs(stored_total - calculated_total) > 0.01:
            total_mismatch_count += 1
            mismatches.append({
                "type": "TOTAL_MISMATCH",
                "invoice_id": inv_id,
                "invoice_number": invoice.get("invoice_number"),
                "retailer": invoice.get("retailer_name"),
                "stored_total_credit_adjusted": stored_total,
                "calculated_from_adjustments": calculated_total,
                "issue": f"Invoice total_credit_adjusted (₹{stored_total}) doesn't match sum of adjustments (₹{calculated_total})"
            })
    
    # Summary by type
    summary = {
        "total_mismatches": len(mismatches),
        "by_type": {
            "CN_NOT_IN_INVOICE": len([m for m in mismatches if m["type"] == "CN_NOT_IN_INVOICE"]),
            "INVOICE_NOT_FOUND": len([m for m in mismatches if m["type"] == "INVOICE_NOT_FOUND"]),
            "AMOUNT_MISMATCH": len([m for m in mismatches if m["type"] == "AMOUNT_MISMATCH"]),
            "TOTAL_MISMATCH": len([m for m in mismatches if m["type"] == "TOTAL_MISMATCH"])
        },
        "credit_notes_checked": len(credit_notes),
        "invoices_checked": len(invoices_checked)
    }
    
    return {
        "message": f"Found {len(mismatches)} sync issues",
        "summary": summary,
        "mismatches": mismatches
    }


@router.post("/retailer-credit-notes/fix-sync-issues")
async def fix_cn_invoice_sync_issues(
    input: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """
    Fix credit note / invoice sync issues found by diagnose-sync-issues.
    
    This updates invoices to include credit note adjustments that are missing.
    It ensures that if a CN says it's adjusted against an invoice, the invoice
    also has the corresponding credit_note_adjustments and total_credit_adjusted.
    
    Body (optional): 
    - {"retailer_id": "xxx"} to fix only for a specific retailer
    - {"dry_run": true} to see what would be fixed without making changes
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix sync issues")
    
    retailer_id = input.get("retailer_id") if input else None
    dry_run = input.get("dry_run", False) if input else False
    
    # Find credit notes that have adjustments
    query = {
        "$or": [
            {"adjusted_in_invoices": {"$exists": True, "$ne": []}},
            {"adjusted_against_invoices": {"$exists": True, "$ne": []}}
        ]
    }
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    credit_notes = await db.retailer_credit_notes.find(query, {"_id": 0}).to_list(10000)
    
    # Build a map of invoice_id -> list of CN adjustments that should be on it
    invoice_cn_map = {}  # invoice_id -> [{cn_id, cn_number, adjusted_amount, cn_data...}]
    
    for cn in credit_notes:
        cn_id = cn.get("id")
        cn_number = cn.get("credit_note_number")
        
        # Get all adjustments (from both field names)
        adjustments = cn.get("adjusted_in_invoices", []) + cn.get("adjusted_against_invoices", [])
        
        for adj in adjustments:
            invoice_id = adj.get("invoice_id")
            invoice_number = adj.get("invoice_number", "")
            if not invoice_id:
                continue
            
            adjusted_amount = adj.get("adjusted_amount", adj.get("amount", 0))
            adjusted_at = adj.get("adjusted_at", adj.get("date", ""))
            
            # Use a composite key to track both id and number for later lookup
            map_key = f"{invoice_id}|{invoice_number}"
            if map_key not in invoice_cn_map:
                invoice_cn_map[map_key] = {
                    "invoice_id": invoice_id,
                    "invoice_number": invoice_number,
                    "adjustments": []
                }
            
            invoice_cn_map[map_key]["adjustments"].append({
                "credit_note_id": cn_id,
                "credit_note_number": cn_number,
                "credit_note_date": cn.get("created_at", ""),
                "original_invoice_id": cn.get("original_invoice_id", ""),
                "original_invoice_number": cn.get("original_invoice_number", ""),
                "original_amount": cn.get("amount", 0),
                "adjusted_amount": adjusted_amount,
                "rejection_details": cn.get("rejection_details", []),
                "rejection_id": cn.get("rejection_id"),
                "rejection_date": cn.get("rejection_date", ""),
                "source": cn.get("source", "rejection"),
                "adjusted_at": adjusted_at
            })
    
    fixed_count = 0
    fixed_details = []
    skipped_not_found = 0
    skipped_already_correct = 0
    
    for map_key, data in invoice_cn_map.items():
        invoice_id = data["invoice_id"]
        invoice_number = data["invoice_number"]
        cn_adjustments = data["adjustments"]
        
        # Get the invoice - try by id first, then by invoice_number
        invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
        
        # If not found by id, try by invoice_number
        if not invoice and invoice_number:
            invoice = await db.retailer_invoices.find_one({"invoice_number": invoice_number}, {"_id": 0})
        
        if not invoice:
            skipped_not_found += 1
            continue
        
        # Get existing adjustments on the invoice
        existing_adjustments = invoice.get("credit_note_adjustments", [])
        # Handle both dict and string formats in existing adjustments
        existing_cn_ids = set()
        for adj in existing_adjustments:
            if isinstance(adj, dict):
                cn_id_val = adj.get("credit_note_id")
                if cn_id_val:
                    existing_cn_ids.add(cn_id_val)
            elif isinstance(adj, str):
                existing_cn_ids.add(adj)
        
        # Find CN adjustments that are missing from the invoice
        missing_adjustments = []
        for cn_adj in cn_adjustments:
            if cn_adj["credit_note_id"] not in existing_cn_ids:
                missing_adjustments.append(cn_adj)
        
        if not missing_adjustments:
            skipped_already_correct += 1
            continue
        
        # Merge existing + missing adjustments
        # First, normalize existing_adjustments to dict format if they're strings
        normalized_existing = []
        for adj in existing_adjustments:
            if isinstance(adj, dict):
                normalized_existing.append(adj)
            # Skip string entries - they'll be replaced by the missing_adjustments with proper data
        
        merged_adjustments = normalized_existing + missing_adjustments
        
        # Calculate new total
        new_total_credit_adjusted = sum(
            (adj.get("adjusted_amount", adj.get("amount", 0)) or 0) if isinstance(adj, dict) else 0
            for adj in merged_adjustments
        )
        
        # Calculate new final_payable
        net_payable = invoice.get("net_payable", 0) or 0
        paid_amount = invoice.get("paid_amount", 0) or 0
        new_final_payable = net_payable - new_total_credit_adjusted
        
        # Determine new payment status
        old_status = invoice.get("payment_status", "pending")
        if new_final_payable <= 0.01:
            new_payment_status = "paid"
        elif paid_amount > 0 or new_total_credit_adjusted > 0:
            new_payment_status = "partial"
        else:
            new_payment_status = "pending"
        
        fix_detail = {
            "invoice_id": invoice.get("id"),  # Use the actual found invoice's id
            "invoice_number": invoice.get("invoice_number"),
            "retailer": invoice.get("retailer_name"),
            "missing_cn_count": len(missing_adjustments),
            "missing_cns": [adj["credit_note_number"] for adj in missing_adjustments],
            "missing_amount": sum(adj["adjusted_amount"] for adj in missing_adjustments),
            "old_total_credit_adjusted": invoice.get("total_credit_adjusted", 0),
            "new_total_credit_adjusted": round(new_total_credit_adjusted, 2),
            "old_final_payable": invoice.get("final_payable", net_payable),
            "new_final_payable": round(new_final_payable, 2),
            "old_payment_status": old_status,
            "new_payment_status": new_payment_status
        }
        
        if not dry_run:
            # Update the invoice using its actual id from the found document
            actual_invoice_id = invoice.get("id")
            update_result = await db.retailer_invoices.update_one(
                {"id": actual_invoice_id},
                {"$set": {
                    "credit_note_adjustments": merged_adjustments,
                    "total_credit_adjusted": round(new_total_credit_adjusted, 2),
                    "final_payable": round(new_final_payable, 2),
                    "payment_status": new_payment_status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "cn_sync_fixed_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            fix_detail["update_matched"] = update_result.matched_count
            fix_detail["update_modified"] = update_result.modified_count
        
        fixed_count += 1
        fixed_details.append(fix_detail)
    
    action = "Would fix" if dry_run else "Fixed"
    return {
        "message": f"{action} {fixed_count} invoices with CN sync issues",
        "dry_run": dry_run,
        "summary": {
            "invoices_fixed": fixed_count,
            "invoices_not_found": skipped_not_found,
            "invoices_already_correct": skipped_already_correct,
            "total_invoices_checked": len(invoice_cn_map)
        },
        "fixed_details": fixed_details
    }


@router.post("/retailer-invoices/fix-rejection-data")
async def fix_invoice_rejection_data(
    input: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """
    Fix invoices that have incorrect rejection_amount stored.
    This recalculates rejection_amount from actual retailer_rejections records.
    
    GUARD: Skips 100% upfront retailers - their rejections are handled via Credit Notes, not invoice deductions.
    
    Body (optional): {"retailer_id": "xxx", "invoice_id": "yyy"} to fix specific retailer/invoice
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix invoice rejection data")
    
    retailer_id = input.get("retailer_id") if input else None
    invoice_id = input.get("invoice_id") if input else None
    
    # Build query
    query = {}
    if retailer_id:
        query["retailer_id"] = retailer_id
    if invoice_id:
        query["id"] = invoice_id
    
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).to_list(500)
    
    # Pre-fetch all retailer data for upfront percentage check
    retailer_ids = list(set(inv.get("retailer_id") for inv in invoices if inv.get("retailer_id")))
    retailers_data = {}
    for rid in retailer_ids:
        retailer = await db.users.find_one({"id": rid}, {"_id": 0, "id": 1, "upfront_collection_percentage": 1, "company_name": 1})
        if retailer:
            retailers_data[rid] = retailer
    
    fixed_count = 0
    skipped_100_upfront = 0
    fixed_details = []
    
    for inv in invoices:
        inv_id = inv.get("id")
        inv_retailer_id = inv.get("retailer_id")
        dispatch_ids = inv.get("dispatch_ids", [])
        old_rejection = inv.get("rejection_amount", 0) or 0
        old_gross = inv.get("gross_value", 0) or 0
        old_total_mrp = inv.get("total_mrp_value", 0) or 0
        
        # GUARD: Skip 100% upfront retailers - their rejections are handled via Credit Notes
        retailer_data = retailers_data.get(inv_retailer_id, {})
        is_100_upfront = (retailer_data.get("upfront_collection_percentage", 0) or 0) == 100
        if is_100_upfront:
            skipped_100_upfront += 1
            continue
        
        # Calculate actual rejection from retailer_rejections that match this invoice's dispatches
        actual_rejection = 0
        rejection_details = []
        
        for dispatch_id in dispatch_ids:
            # Find rejections that reference this dispatch
            rejections = await db.retailer_rejections.find({
                "dispatch_id": dispatch_id
            }, {"_id": 0}).to_list(100)
            
            for rej in rejections:
                for item in rej.get("items", []):
                    item_value = item.get("value", 0) or (item.get("quantity", 0) * item.get("mrp", 0))
                    actual_rejection += item_value
                    rejection_details.append({
                        "product": item.get("product_name"),
                        "qty": item.get("quantity"),
                        "value": item_value
                    })
        
        # Check if there's a mismatch
        if abs(old_rejection - actual_rejection) > 0.01:
            # Recalculate total_mrp_value
            new_total_mrp = old_gross - actual_rejection
            
            # Update the invoice
            await db.retailer_invoices.update_one(
                {"id": inv_id},
                {"$set": {
                    "rejection_amount": round(actual_rejection, 2),
                    "total_mrp_value": round(new_total_mrp, 2),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "rejection_data_fixed": True,
                    "rejection_fix_details": {
                        "old_rejection": old_rejection,
                        "new_rejection": actual_rejection,
                        "fixed_at": datetime.now(timezone.utc).isoformat(),
                        "fixed_by": current_user["user_id"]
                    }
                }}
            )
            
            fixed_count += 1
            fixed_details.append({
                "invoice_number": inv.get("invoice_number"),
                "retailer": inv.get("retailer_name"),
                "old_rejection": old_rejection,
                "new_rejection": round(actual_rejection, 2),
                "difference": round(old_rejection - actual_rejection, 2),
                "rejection_items": rejection_details[:5]  # Show first 5 items
            })
    
    return {
        "message": f"Fixed {fixed_count} invoices with incorrect rejection data. Skipped {skipped_100_upfront} invoices for 100% upfront retailers (handled via Credit Notes).",
        "fixed_count": fixed_count,
        "skipped_100_upfront": skipped_100_upfront,
        "fixed_details": fixed_details
    }



@router.post("/retailer-invoices/cleanup-100-upfront-rejections")
async def cleanup_100_upfront_rejections(
    current_user: dict = Depends(get_current_user)
):
    """
    One-time cleanup endpoint: Finds all invoices for 100% upfront retailers that have
    rejection_amount > 0, and resets them to:
      - rejection_amount = 0
      - total_mrp_value = gross_value
      - Recalculates commission_amount and net_payable
    
    For 100% upfront retailers, rejections are handled via Credit Notes, not invoice deductions.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run this cleanup")
    
    # Find all 100% upfront retailers
    upfront_retailers = await db.users.find(
        {"role": "retailer", "upfront_collection_percentage": 100},
        {"_id": 0, "id": 1, "company_name": 1, "name": 1, "commission_percentage": 1}
    ).to_list(100)
    
    upfront_retailer_ids = [r["id"] for r in upfront_retailers]
    retailer_commission_map = {r["id"]: r.get("commission_percentage", 0) or 0 for r in upfront_retailers}
    retailer_name_map = {r["id"]: r.get("company_name") or r.get("name", "Unknown") for r in upfront_retailers}
    
    if not upfront_retailer_ids:
        return {
            "message": "No 100% upfront retailers found.",
            "fixed_count": 0,
            "fixed_details": []
        }
    
    # Find invoices for these retailers with rejection_amount > 0
    invoices_to_fix = await db.retailer_invoices.find({
        "retailer_id": {"$in": upfront_retailer_ids},
        "rejection_amount": {"$gt": 0}
    }, {"_id": 0}).to_list(500)
    
    fixed_count = 0
    fixed_details = []
    
    for inv in invoices_to_fix:
        inv_id = inv.get("id")
        retailer_id = inv.get("retailer_id")
        retailer_name = retailer_name_map.get(retailer_id, inv.get("retailer_name", "Unknown"))
        
        old_rejection = inv.get("rejection_amount", 0) or 0
        gross_value = inv.get("gross_value", 0) or 0
        old_total_mrp = inv.get("total_mrp_value", 0) or 0
        old_commission = inv.get("commission_amount", 0) or 0
        old_net_payable = inv.get("net_payable", 0) or 0
        
        # Recalculate with rejection_amount = 0
        new_total_mrp = gross_value  # No rejection deducted
        commission_pct = retailer_commission_map.get(retailer_id, inv.get("commission_percentage", 0) or 0)
        new_commission = round(gross_value * commission_pct / 100, 2)
        new_net_payable = round(gross_value - new_commission, 2)
        
        # Update the invoice
        await db.retailer_invoices.update_one(
            {"id": inv_id},
            {"$set": {
                "rejection_amount": 0,
                "total_mrp_value": round(new_total_mrp, 2),
                "commission_amount": new_commission,
                "net_payable": new_net_payable,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "upfront_rejection_cleanup": {
                    "cleaned_at": datetime.now(timezone.utc).isoformat(),
                    "cleaned_by": current_user["user_id"],
                    "old_rejection": old_rejection,
                    "old_total_mrp": old_total_mrp,
                    "old_commission": old_commission,
                    "old_net_payable": old_net_payable
                }
            }}
        )
        
        fixed_count += 1
        fixed_details.append({
            "invoice_number": inv.get("invoice_number"),
            "retailer": retailer_name,
            "invoice_date": inv.get("invoice_date", "")[:10],
            "old_rejection": old_rejection,
            "gross_value": gross_value,
            "old_total_mrp": old_total_mrp,
            "new_total_mrp": new_total_mrp,
            "old_commission": old_commission,
            "new_commission": new_commission,
            "old_net_payable": old_net_payable,
            "new_net_payable": new_net_payable
        })
        
        logger.info(f"[100% UPFRONT CLEANUP] Invoice {inv.get('invoice_number')}: rejection ₹{old_rejection} -> ₹0, net_payable ₹{old_net_payable} -> ₹{new_net_payable}")
    
    return {
        "message": f"Cleaned up {fixed_count} invoices for 100% upfront retailers. Rejection amounts reset to 0, values recalculated.",
        "fixed_count": fixed_count,
        "upfront_retailers_count": len(upfront_retailer_ids),
        "fixed_details": fixed_details
    }


class RemoveCreditAdjustmentInput(BaseModel):
    invoice_id: str

@router.post("/retailer-credit-notes/backfill-rejection-details")
async def backfill_credit_note_rejection_details(current_user: dict = Depends(get_current_user)):
    """Backfill rejection_details for credit notes that have linked rejections but missing details"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    updated_count = 0
    skipped_count = 0
    no_rejection_link = 0
    
    # Find all credit notes
    credit_notes = await db.retailer_credit_notes.find({}, {"_id": 0}).to_list(1000)
    
    for cn in credit_notes:
        # Check if rejection_details are complete
        existing_details = cn.get("rejection_details", [])
        first_detail = existing_details[0] if existing_details else {}
        
        # If details are already complete, skip
        qty = first_detail.get("quantity") or first_detail.get("rejected_qty")
        rate = first_detail.get("mrp") or first_detail.get("rate")
        if qty and rate:
            skipped_count += 1
            continue
        
        # Try to find the linked rejection
        rejection_id = cn.get("rejection_id")
        if not rejection_id:
            no_rejection_link += 1
            continue
        
        rejection = await db.retailer_rejections.find_one({"id": rejection_id}, {"_id": 0})
        if not rejection:
            no_rejection_link += 1
            continue
        
        # Build proper rejection_details from the rejection record
        new_details = [{
            "product_id": rejection.get("product_id"),
            "product_name": rejection.get("product_name"),
            "variant_id": rejection.get("variant_id"),
            "variant_name": rejection.get("variant_name"),
            "rejected_qty": rejection.get("quantity"),
            "quantity": rejection.get("quantity"),
            "rate": rejection.get("mrp"),
            "mrp": rejection.get("mrp"),
            "rejected_amount": rejection.get("quantity", 0) * (rejection.get("mrp") or 0),
            "value": rejection.get("quantity", 0) * (rejection.get("mrp") or 0),
            "reason": rejection.get("reason")
        }]
        
        # Update the credit note
        await db.retailer_credit_notes.update_one(
            {"id": cn.get("id")},
            {"$set": {"rejection_details": new_details}}
        )
        updated_count += 1
    
    return {
        "message": f"Backfill completed. Updated: {updated_count}, Skipped (complete): {skipped_count}, No rejection link: {no_rejection_link}",
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "no_rejection_link": no_rejection_link
    }

@router.post("/retailer-credit-notes/{credit_note_id}/remove-adjustment")
async def remove_credit_adjustment(
    credit_note_id: str,
    input: RemoveCreditAdjustmentInput,
    current_user: dict = Depends(get_current_user)
):
    """Remove a credit note adjustment from an invoice and restore the credit"""
    credit_note = await db.retailer_credit_notes.find_one({"id": credit_note_id}, {"_id": 0})
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    # Find the adjustment record for this invoice
    adjustments = credit_note.get("adjusted_against_invoices", [])
    adjustment = next((adj for adj in adjustments if adj.get("invoice_id") == input.invoice_id), None)
    
    if not adjustment:
        raise HTTPException(status_code=404, detail="No adjustment found for this invoice")
    
    adj_amount = adjustment.get("amount", 0)
    
    # Get the invoice
    invoice = await db.retailer_invoices.find_one({"id": input.invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Remove the adjustment from credit note and restore pending amount
    new_adjustments = [adj for adj in adjustments if adj.get("invoice_id") != input.invoice_id]
    new_adjusted_amount = max(0, (credit_note.get("adjusted_amount", 0) or 0) - adj_amount)
    new_pending = (credit_note.get("amount", 0) or 0) - new_adjusted_amount
    
    # Determine new status
    if new_adjusted_amount <= 0.01:
        new_status = "pending"
    elif new_pending <= 0.01:
        new_status = "adjusted"
    else:
        new_status = "partial"
    
    await db.retailer_credit_notes.update_one(
        {"id": credit_note_id},
        {
            "$set": {
                "adjusted_against_invoices": new_adjustments,
                "adjusted_amount": round(new_adjusted_amount, 2),
                "pending_amount": round(new_pending, 2),
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Update the invoice paid_amount (reduce by the credit amount that was removed)
    new_paid = max(0, (invoice.get("paid_amount", 0) or 0) - adj_amount)
    net_payable = invoice.get("net_payable", 0) or 0
    
    # Determine new invoice payment status
    if new_paid >= net_payable - 0.01:
        inv_status = "paid"
    elif new_paid > 0:
        inv_status = "partial"
    else:
        inv_status = "pending"
    
    await db.retailer_invoices.update_one(
        {"id": input.invoice_id},
        {
            "$set": {
                "paid_amount": round(new_paid, 2),
                "payment_status": inv_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": "Credit adjustment removed successfully",
        "restored_amount": adj_amount,
        "credit_note_pending": round(new_pending, 2),
        "invoice_paid_amount": round(new_paid, 2),
        "invoice_status": inv_status
    }


# ------------ RETAILER INVOICES ------------
@router.get("/retailer-invoices")
async def get_retailer_invoices(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    # Date filtering for performance
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["invoice_date"] = date_query
    
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).sort("invoice_date", -1).to_list(limit)
    
    # PERFORMANCE: Check if items need enrichment with rejected_qty
    # An invoice needs enrichment if:
    # 1. It has rejection_amount but items don't have rejected_qty, OR
    # 2. It doesn't have rejection_amount but has dispatch_ids (old invoice)
    def needs_item_enrichment(inv):
        items = inv.get("items", [])
        has_rejection_amount = (inv.get("rejection_amount") or 0) > 0
        has_item_rejections = any(item.get("rejected_qty", 0) > 0 for item in items)
        has_dispatch_ids = bool(inv.get("dispatch_ids"))
        
        # If has rejection amount but no item-level rejections, needs enrichment
        if has_rejection_amount and not has_item_rejections and has_dispatch_ids:
            return True
        # If no rejection amount but has dispatch_ids, might need enrichment (old invoice)
        if not has_rejection_amount and has_dispatch_ids:
            return True
        return False
    
    invoices_needing_enrichment = [inv for inv in invoices if needs_item_enrichment(inv)]
    
    # Limit enrichment to only 10 invoices per request to avoid timeout
    if len(invoices_needing_enrichment) > 10:
        invoices_needing_enrichment = invoices_needing_enrichment[:10]
    
    # Enrich invoices with rejection data if not already present
    # This handles older invoices that don't have rejection_amount or rejected_qty in items
    for invoice in invoices_needing_enrichment:
        # Get all dispatch_ids for this invoice
        dispatch_ids = invoice.get("dispatch_ids", [])
        
        # Handle case where dispatch_ids is stored as a string (e.g., "['id1', 'id2']")
        if isinstance(dispatch_ids, str):
            try:
                import ast
                dispatch_ids = ast.literal_eval(dispatch_ids)
            except:
                dispatch_ids = []
        
        if not dispatch_ids or not isinstance(dispatch_ids, list) or len(dispatch_ids) == 0:
            continue
        
        # Get dispatches to find the dispatch dates and retailer
        try:
            dispatches = await db.retailer_dispatches.find(
                {"id": {"$in": dispatch_ids}},
                {"_id": 0, "dispatch_date": 1, "retailer_id": 1}
            ).to_list(100)
        except:
            continue
        
        if not dispatches:
            continue
        
        retailer_id = invoice.get("retailer_id") or dispatches[0].get("retailer_id")
        dispatch_dates = list(set([d.get("dispatch_date", "")[:10] for d in dispatches if d.get("dispatch_date")]))
        
        if not dispatch_dates:
            continue
        
        # Fetch rejections for these dispatch dates and retailer
        rejection_query = {
            "retailer_id": retailer_id,
            "rejection_date": {"$regex": f"^({'|'.join(dispatch_dates)})"}
        }
        rejections = await db.retailer_rejections.find(rejection_query, {"_id": 0}).to_list(500)
        
        # Group rejections by product AND date (key = product_id_date) to avoid cross-date summing
        rejections_by_product_date = {}
        for rej in rejections:
            product_id = rej.get("product_id")
            product_name = rej.get("product_name", "").strip()
            rejection_date = rej.get("rejection_date", "")[:10]  # YYYY-MM-DD
            key = f"{product_id or product_name}_{rejection_date}"
            if key not in rejections_by_product_date:
                rejections_by_product_date[key] = {"qty": 0, "value": 0}
            rejections_by_product_date[key]["qty"] += rej.get("quantity", 0) or 0
            rejections_by_product_date[key]["value"] += rej.get("rejection_value", 0) or 0
        
        # Build dispatch_id to date mapping from the dispatches we fetched
        dispatch_id_to_date = {}
        for d in dispatches:
            dispatch_id_to_date[d.get("id")] = d.get("dispatch_date", "")[:10]
        
        # Also need to get the full dispatch data to know which items came from which dispatch
        full_dispatches = await db.retailer_dispatches.find(
            {"id": {"$in": dispatch_ids}},
            {"_id": 0}
        ).to_list(100)
        
        # Build a map of dispatch items by dispatch_id for matching
        dispatch_items_map = {}
        for d in full_dispatches:
            dispatch_items_map[d.get("id")] = {
                "date": d.get("dispatch_date", "")[:10],
                "items": d.get("items", [])
            }
        
        # Update invoice items with rejected_qty - match by product AND dispatch date
        total_rejection_value = 0
        for item in invoice.get("items", []):
            product_id = item.get("product_id")
            product_name = item.get("product_name", "").strip()
            product_key = product_id or product_name
            
            # Find which dispatch this item came from (via dispatch_id if stored, or by matching)
            item_dispatch_date = None
            item_dispatch_id = item.get("dispatch_id")
            if item_dispatch_id and item_dispatch_id in dispatch_id_to_date:
                item_dispatch_date = dispatch_id_to_date[item_dispatch_id]
            else:
                # Fallback: use the first dispatch date (may not be accurate for multi-dispatch invoices)
                if dispatch_dates:
                    item_dispatch_date = dispatch_dates[0]
            
            # Look up rejection by product + date
            if item_dispatch_date:
                lookup_key = f"{product_key}_{item_dispatch_date}"
                if lookup_key in rejections_by_product_date:
                    item["rejected_qty"] = rejections_by_product_date[lookup_key]["qty"]
                    item["rejection_value"] = rejections_by_product_date[lookup_key]["value"]
                    total_rejection_value += rejections_by_product_date[lookup_key]["value"]
        
        # Update invoice-level rejection amount
        if total_rejection_value > 0:
            invoice["rejection_amount"] = round(total_rejection_value, 2)
            # Recalculate gross_value (if needed)
            if invoice.get("gross_value", 0) == 0:
                invoice["gross_value"] = round((invoice.get("total_mrp_value", 0) or 0) + total_rejection_value, 2)
            
            # IMPORTANT: Recalculate net_payable to account for rejection
            # net_payable = gross_value - rejection_amount - commission_amount
            gross_value = invoice.get("gross_value", 0) or invoice.get("total_mrp_value", 0) or 0
            commission_percentage = invoice.get("commission_percentage", 0) or 0
            
            # Net MRP after rejections
            net_mrp_value = gross_value - total_rejection_value
            commission_amount = net_mrp_value * (commission_percentage / 100)
            new_net_payable = net_mrp_value - commission_amount
            
            # Update the invoice fields
            invoice["total_mrp_value"] = round(net_mrp_value, 2)
            invoice["commission_amount"] = round(commission_amount, 2)
            invoice["net_payable"] = round(new_net_payable, 2)
    
    # Calculate total_credit_adjusted for each invoice
    invoice_ids = [inv.get("id") for inv in invoices if inv.get("id")]
    if invoice_ids:
        # Get all credit notes that have been adjusted against these invoices
        credit_notes = await db.retailer_credit_notes.find({
            "adjusted_in_invoices.invoice_id": {"$in": invoice_ids}
        }, {"_id": 0, "adjusted_in_invoices": 1}).to_list(1000)
        
        # Build a map of invoice_id -> total_credit_adjusted
        credit_by_invoice = {}
        for cn in credit_notes:
            for adj in cn.get("adjusted_in_invoices", []):
                inv_id = adj.get("invoice_id")
                if inv_id and inv_id in invoice_ids:
                    adj_amount = adj.get("adjusted_amount", adj.get("amount", 0)) or 0
                    credit_by_invoice[inv_id] = credit_by_invoice.get(inv_id, 0) + adj_amount
        
        # Update each invoice with total_credit_adjusted
        for invoice in invoices:
            inv_id = invoice.get("id")
            if inv_id:
                # Use stored value if present, otherwise use calculated value
                stored_credit = invoice.get("total_credit_adjusted", 0) or 0
                calculated_credit = credit_by_invoice.get(inv_id, 0)
                invoice["total_credit_adjusted"] = round(max(stored_credit, calculated_credit), 2)
    
    return invoices

# Final Summary API - shows complete reconciliation view (MUST be before /{invoice_id} route)
@router.get("/retailer-invoices/final-summary")
async def get_invoice_final_summary(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get detailed invoice summary with rejections, credit notes reconciliation.
    Uses invoice's stored rejection data for accurate linking.
    Includes item-level details for expandable rows showing supply vs rejection.
    """
    if current_user["role"] not in ["admin", "staff", "retailer"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # For retailer role, restrict to own data
    if current_user["role"] == "retailer":
        retailer_id = current_user["user_id"]
    
    # Default date range
    if not end_date:
        end_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime('%Y-%m-%d')
    
    query = {"invoice_date": {"$gte": start_date, "$lte": end_date + "T23:59:59"}}
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).sort("invoice_date", -1).to_list(1000)
    
    # Get retailer info for names and upfront percentage
    retailer_ids = list(set(inv.get("retailer_id") for inv in invoices if inv.get("retailer_id")))
    retailers_data = await db.users.find(
        {"id": {"$in": retailer_ids}},
        {"_id": 0, "id": 1, "company_name": 1, "name": 1, "upfront_collection_percentage": 1}
    ).to_list(100)
    retailer_map = {r["id"]: r for r in retailers_data}
    
    # Get qc_packaging for variant name lookup
    packaging_docs = await db.qc_packaging.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    packaging_map = {p["id"]: p.get("name", "") for p in packaging_docs}
    
    # Get credit notes adjusted against each invoice
    credit_notes = await db.retailer_credit_notes.find({
        "retailer_id": {"$in": retailer_ids} if retailer_ids else {"$exists": True},
        "status": {"$ne": "voided"}
    }, {"_id": 0}).to_list(10000)
    
    # Build credit note map by adjusted invoice
    cn_by_invoice = {}
    for cn in credit_notes:
        for adj in cn.get("adjusted_against_invoices", []):
            inv_id = adj.get("invoice_id")
            if inv_id:
                if inv_id not in cn_by_invoice:
                    cn_by_invoice[inv_id] = 0
                cn_by_invoice[inv_id] += adj.get("amount", 0)
    
    # Build summary rows using invoice's stored data
    rows = []
    totals = {
        "gross_value": 0,
        "rejections": 0,
        "total_mrp": 0,
        "commission": 0,
        "payable": 0,
        "credit_notes": 0,
        "paid": 0,
        "final_payable": 0
    }
    
    for idx, inv in enumerate(invoices, 1):
        retailer = retailer_map.get(inv.get("retailer_id"), {})
        inv_date = inv.get("invoice_date", "")[:10]
        
        # Check if retailer is 100% upfront
        is_100_percent_upfront = (retailer.get("upfront_collection_percentage", 0) or 0) == 100
        
        # Get the rejection amount from invoice
        rejection_amount = inv.get("rejection_amount", 0) or 0
        
        # Build item-level details from invoice items (which already have rejection data)
        items = []
        item_totals = {
            "supplied_qty": 0,
            "rejected_qty": 0,
            "billable_qty": 0,
            "supply_value": 0,
            "rejection_value": 0,
            "billable_value": 0
        }
        
        for inv_item in inv.get("items", []):
            supplied_qty = inv_item.get("supplied_qty", 0) or inv_item.get("quantity", 0) or 0
            rejected_qty = inv_item.get("rejected_qty", 0) or inv_item.get("rejection_qty", 0) or 0
            # ALWAYS calculate billable_qty dynamically - stored value may be incorrect
            billable_qty = supplied_qty - rejected_qty
            mrp = inv_item.get("mrp", 0) or inv_item.get("rate", 0) or 0
            
            supply_value = supplied_qty * mrp
            rejection_value = rejected_qty * mrp
            billable_value = billable_qty * mrp
            
            # Look up actual variant name from qc_packaging
            variant_id = inv_item.get("variant_name", "") or inv_item.get("variant_id", "")
            variant_name = packaging_map.get(variant_id, variant_id) if variant_id else ""
            # If still looks like a UUID, try to get a cleaner display
            if variant_name and len(variant_name) > 30 and "-" in variant_name:
                variant_name = ""  # Clear it if it's still a UUID
            
            items.append({
                "product_name": inv_item.get("product_name", ""),
                "variant_name": variant_name,
                "supplied_qty": supplied_qty,
                "rate": mrp,
                "supply_value": round(supply_value, 2),
                "rejected_qty": rejected_qty,
                "rejection_value": round(rejection_value, 2),
                "billable_qty": billable_qty,
                "billable_value": round(billable_value, 2)
            })
            
            # Update item totals
            item_totals["supplied_qty"] += supplied_qty
            item_totals["rejected_qty"] += rejected_qty
            item_totals["billable_qty"] += billable_qty
            item_totals["supply_value"] += supply_value
            item_totals["rejection_value"] += rejection_value
            item_totals["billable_value"] += billable_value
        
        # Round item totals
        for key in ["supply_value", "rejection_value", "billable_value"]:
            item_totals[key] = round(item_totals[key], 2)
        
        # Sort items by product name
        items.sort(key=lambda x: x["product_name"])
        
        # Calculate values using invoice's stored data
        # gross_value is the INITIAL invoice amount (before rejections)
        gross_value = inv.get("gross_value", 0) or inv.get("total_mrp_value", 0) or 0
        
        # Net MRP = Gross - Rejections
        total_mrp = gross_value - rejection_amount
        
        commission = inv.get("commission_amount", 0) or inv.get("commission_value", 0) or inv.get("total_commission", 0) or 0
        payable = inv.get("net_payable", 0) or 0
        credit_adjusted = cn_by_invoice.get(inv.get("id"), 0) or inv.get("total_credit_adjusted", 0) or 0
        paid = inv.get("paid_amount", 0) or 0
        final_payable = payable - credit_adjusted - paid
        
        # Determine status
        if final_payable <= 0:
            status = "settled"
        elif paid > 0:
            status = "partial"
        else:
            status = "pending"
        
        row = {
            "sno": idx,
            "date": inv_date,
            "invoice_number": inv.get("invoice_number", ""),
            "invoice_id": inv.get("id"),
            "retailer_id": inv.get("retailer_id"),
            "retailer_name": retailer.get("company_name", retailer.get("name", "Unknown")),
            "gross_value": round(gross_value, 2),
            "rejections": round(rejection_amount, 2),
            "total_mrp": round(total_mrp, 2),
            "commission": round(commission, 2),
            "payable": round(payable, 2),
            "credit_notes": round(credit_adjusted, 2),
            "paid": round(paid, 2),
            "final_payable": round(final_payable, 2),
            "status": status,
            "items": items,  # Item-level details from invoice
            "item_totals": item_totals  # Totals for items row
        }
        rows.append(row)
        
        # Update totals
        totals["gross_value"] += gross_value
        totals["rejections"] += rejection_amount
        totals["total_mrp"] += total_mrp
        totals["commission"] += commission
        totals["payable"] += payable
        totals["credit_notes"] += credit_adjusted
        totals["paid"] += paid
        # For final_payable total: Don't count negative values (overpayments)
        # because overpayments have already been converted to credit notes 
        # and adjusted against other invoices - counting them would be double-deduction
        totals["final_payable"] += max(0, final_payable)
    
    # Round totals
    for key in totals:
        totals[key] = round(totals[key], 2)
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "retailer_id": retailer_id,
        "rows": rows,
        "totals": totals,
        "row_count": len(rows)
    }

@router.get("/retailer-invoices/{invoice_id}")
async def get_retailer_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Retailers can only see their own invoices
    if current_user["role"] == "retailer" and invoice["retailer_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return invoice

@router.post("/retailer-invoices")
async def create_retailer_invoice(input: RetailerInvoiceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can create invoices")
    
    if not input.dispatch_ids:
        raise HTTPException(status_code=400, detail="At least one dispatch is required")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.retailer_id}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    commission = retailer.get("commission_percentage", 0)
    
    # Get all dispatches for validation
    dispatches = await db.retailer_dispatches.find(
        {"id": {"$in": input.dispatch_ids}},
        {"_id": 0}
    ).to_list(100)
    
    if len(dispatches) != len(input.dispatch_ids):
        raise HTTPException(status_code=400, detail="Some dispatches not found")
    
    # Check if any dispatch is already in another invoice
    for dispatch in dispatches:
        existing_invoice = await db.retailer_invoices.find_one({"dispatch_ids": dispatch["id"]})
        if existing_invoice:
            raise HTTPException(
                status_code=400, 
                detail=f"Dispatch is already in invoice {existing_invoice.get('invoice_number')}"
            )
    
    # Use selected_items if provided (includes rejection adjustments), otherwise fall back to dispatch items
    all_items = []
    gross_value = 0  # Total before rejections
    rejection_amount = 0  # Total rejection value
    
    if input.selected_items and len(input.selected_items) > 0:
        # Use the item-level selection with rejection data
        # First, combine items with same product_id + variant_name
        combined_items = {}
        
        for item in input.selected_items:
            # Create a key for combining (product_id + variant_name)
            combine_key = f"{item.product_id}|{item.variant_name or ''}"
            
            if combine_key in combined_items:
                # Combine with existing item
                existing = combined_items[combine_key]
                existing['net_qty'] += item.net_qty
                existing['supplied_qty'] += item.supplied_qty
                existing['rejected_qty'] += item.rejected_qty if item.rejected_qty is not None else 0
                existing['total_value'] += item.total_value
                existing['dispatch_ids'].append(item.dispatch_id)
            else:
                # Create new entry
                combined_items[combine_key] = {
                    'dispatch_id': item.dispatch_id,
                    'dispatch_ids': [item.dispatch_id],
                    'product_id': item.product_id,
                    'product_name': item.product_name,
                    'variant_name': item.variant_name,
                    'net_qty': item.net_qty,
                    'supplied_qty': item.supplied_qty,
                    'rejected_qty': item.rejected_qty if item.rejected_qty is not None else 0,
                    'mrp': item.mrp,
                    'total_value': item.total_value
                }
        
        # Create invoice items from combined data
        for item_data in combined_items.values():
            all_items.append(RetailerInvoiceItem(
                dispatch_id=item_data['dispatch_ids'][0],  # Use first dispatch_id for reference
                product_id=item_data['product_id'],
                product_name=item_data['product_name'],
                variant_name=item_data['variant_name'],
                quantity=item_data['net_qty'],  # Use net_qty (after rejection deduction)
                supplied_qty=item_data['supplied_qty'],
                rejected_qty=item_data['rejected_qty'] if item_data.get('rejected_qty') is not None else 0,
                mrp=item_data['mrp'],
                total_value=item_data['total_value']  # This is net_value from frontend
            ))
            # Calculate gross (supplied_qty * mrp)
            item_gross = item_data['supplied_qty'] * item_data['mrp']
            gross_value += item_gross
            # Calculate rejection value (rejected_qty * mrp)
            item_rejection = (item_data.get('rejected_qty') or 0) * item_data['mrp']
            rejection_amount += item_rejection
    else:
        # Fallback: aggregate items from all dispatches (legacy behavior)
        for dispatch in dispatches:
            for item in dispatch.get("items", []):
                all_items.append(RetailerInvoiceItem(
                    dispatch_id=dispatch["id"],
                    product_id=item.get("product_id", ""),
                    product_name=item.get("product_name", ""),
                    variant_name=item.get("variant_name"),
                    quantity=item.get("supplied_qty", 0),
                    mrp=item.get("mrp", 0),
                    total_value=item.get("total_value", 0)
                ))
                gross_value += item.get("total_value", 0)
    
    # Check if retailer is 100% upfront
    is_100_percent_upfront = (retailer.get("upfront_collection_percentage", 0) or 0) == 100
    
    # For 100% upfront retailers:
    # - Invoice amount is based on GROSS value (what was dispatched)
    # - Rejections do NOT reduce the invoice amount
    # - Rejections create credit notes separately
    # For regular retailers:
    # - Invoice amount is based on NET value (after rejections)
    
    if is_100_percent_upfront:
        # 100% Upfront: Commission on GROSS value, rejections don't reduce invoice
        # Store rejection_amount for reference but don't deduct it
        total_mrp_value = gross_value  # Use gross for 100% upfront
        commission_amount = gross_value * commission / 100
        net_payable = gross_value - commission_amount
    else:
        # Regular retailers: Net MRP value = Gross - Rejections
        total_mrp_value = gross_value - rejection_amount
        # Commission on NET value (after rejections)
        commission_amount = total_mrp_value * commission / 100
        net_payable = total_mrp_value - commission_amount
    
    # Generate invoice number: XXX-INV-DDMMMYYYY-NNN (XXX = first 3 letters of shop/retailer name)
    # Use company_name (shop name) if available, otherwise use retailer name
    shop_name = retailer.get("company_name") or retailer.get("name") or "RET"
    # Get first 3 letters, uppercase, remove special chars
    prefix = ''.join(c for c in shop_name[:3] if c.isalnum()).upper()
    if len(prefix) < 3:
        prefix = (prefix + "XXX")[:3]  # Pad if needed
    
    today = input.invoice_date.strftime("%d%b%Y").upper()
    
    # Count existing invoices for THIS retailer on this date (not all invoices)
    date_pattern = f"^{prefix}-INV-{today}-"
    existing_count = await db.retailer_invoices.count_documents({
        "invoice_number": {"$regex": date_pattern}
    })
    invoice_number = f"{prefix}-INV-{today}-{str(existing_count + 1).zfill(3)}"
    
    invoice = RetailerInvoice(
        invoice_number=invoice_number,
        retailer_id=input.retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        invoice_date=input.invoice_date,
        dispatch_ids=input.dispatch_ids,
        items=[item.model_dump() for item in all_items],
        gross_value=round(gross_value, 2),
        rejection_amount=round(rejection_amount, 2),
        total_mrp_value=round(total_mrp_value, 2),
        commission_percentage=commission,
        commission_amount=round(commission_amount, 2),
        net_payable=round(net_payable, 2),
        created_by=current_user["user_id"],
        remarks=input.remarks
    )
    
    # Auto-adjust pending credit notes for this retailer
    # Query for CNs with pending status OR with pending_amount > 0
    pending_credit_notes = await db.retailer_credit_notes.find({
        "retailer_id": input.retailer_id,
        "$or": [
            {"status": {"$in": ["pending", "partial"]}},
            {"pending_amount": {"$gt": 0}}
        ]
    }, {"_id": 0}).sort("created_at", 1).to_list(100)  # Sort by date (oldest first)
    
    logger.info(f"[CN-AUTO-ADJUST] Found {len(pending_credit_notes)} pending CNs for retailer {input.retailer_id}")
    
    credit_note_adjustments = []
    total_credit_adjusted = 0
    
    for cn in pending_credit_notes:
        if total_credit_adjusted >= net_payable:
            break  # Don't adjust more than the invoice amount
        
        # Get pending amount - prefer pending_amount field, fallback to calculating from amount - adjusted_amount
        pending_amount = cn.get("pending_amount")
        if pending_amount is None or pending_amount <= 0:
            # Calculate pending from amount - adjusted_amount
            total_cn_amount = cn.get("amount", 0) or 0
            adjusted_so_far = cn.get("adjusted_amount", 0) or 0
            pending_amount = total_cn_amount - adjusted_so_far
        
        if pending_amount <= 0:
            logger.info(f"[CN-AUTO-ADJUST] Skipping CN {cn.get('credit_note_number')} - no pending amount")
            continue
            
        # Calculate how much to adjust
        remaining_payable = net_payable - total_credit_adjusted
        adjust_amount = min(pending_amount, remaining_payable)
        
        if adjust_amount > 0:
            # Record the adjustment with full details including original invoice
            adjustment = {
                "credit_note_id": cn.get("id"),
                "credit_note_number": cn.get("credit_note_number"),
                "credit_note_date": cn.get("created_at", ""),  # When CN was created
                "original_invoice_id": cn.get("original_invoice_id", ""),
                "original_invoice_number": cn.get("original_invoice_number", ""),
                "original_amount": cn.get("amount", 0),
                "adjusted_amount": adjust_amount,
                "rejection_details": cn.get("rejection_details", []),
                "rejection_id": cn.get("rejection_id"),
                "rejection_date": cn.get("rejection_date", ""),  # When rejection was recorded
                "source": cn.get("source", "rejection")
            }
            credit_note_adjustments.append(adjustment)
            total_credit_adjusted += adjust_amount
            
            # Update the credit note
            new_pending = pending_amount - adjust_amount
            new_adjusted = cn.get("adjusted_amount", 0) + adjust_amount  # Track total adjusted
            new_status = "adjusted" if new_pending <= 0 else "partial"
            
            # Add to adjusted_in_invoices array
            adjusted_invoices = cn.get("adjusted_in_invoices", [])
            adjusted_invoices.append({
                "invoice_id": invoice.id,
                "invoice_number": invoice_number,
                "adjusted_amount": adjust_amount,
                "adjusted_at": datetime.now(timezone.utc).isoformat()
            })
            
            await db.retailer_credit_notes.update_one(
                {"id": cn.get("id")},
                {"$set": {
                    "adjusted_amount": round(new_adjusted, 2),  # Update adjusted_amount
                    "pending_amount": round(new_pending, 2),
                    "status": new_status,
                    "adjusted_in_invoices": adjusted_invoices
                }}
            )
    
    # Add credit note adjustments to invoice
    invoice_dict = invoice.model_dump()
    invoice_dict["credit_note_adjustments"] = credit_note_adjustments
    invoice_dict["total_credit_adjusted"] = round(total_credit_adjusted, 2)
    invoice_dict["final_payable"] = round(net_payable - total_credit_adjusted, 2)
    
    # If invoice is fully covered by credit notes, mark as paid
    if invoice_dict["final_payable"] <= 0.01:
        invoice_dict["payment_status"] = "paid"
        invoice_dict["status"] = "paid"
    
    doc = invoice_dict
    doc["invoice_date"] = invoice.invoice_date.isoformat()
    doc["created_at"] = invoice.created_at.isoformat()
    
    await db.retailer_invoices.insert_one(doc)
    
    # Update dispatches with invoice number
    await db.retailer_dispatches.update_many(
        {"id": {"$in": input.dispatch_ids}},
        {"$set": {"invoice_number": invoice_number, "invoice_id": invoice.id}}
    )
    
    return {
        "id": invoice.id, 
        "invoice_number": invoice_number, 
        "message": "Invoice created successfully",
        "net_payable": round(net_payable, 2),
        "credit_note_adjustments": credit_note_adjustments,
        "total_credit_adjusted": round(total_credit_adjusted, 2),
        "final_payable": round(net_payable - total_credit_adjusted, 2)
    }


@router.put("/retailer-invoices/{invoice_id}")
async def update_retailer_invoice(invoice_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing retailer invoice"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update invoices")
    
    invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get retailer to check payment model
    retailer = await db.users.find_one({"id": invoice.get("retailer_id")}, {"_id": 0})
    is_100_upfront = retailer and retailer.get("upfront_collection_percentage") == 100
    
    # Enforce same-day edit rule for non-admin users ONLY for 100% upfront retailers
    # Admin can edit any invoice, staff can only edit same-day invoices for 100% upfront retailers
    if current_user["role"] != "admin" and is_100_upfront:
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        invoice_date = invoice.get("invoice_date", "")[:10]
        if invoice_date != today:
            raise HTTPException(status_code=403, detail="Staff can only edit same-day invoices for 100% upfront retailers. Contact admin for older invoices.")
    
    # Process items if provided
    items = input.get("items", invoice.get("items", []))
    total_mrp_value = sum(item.get("total_value", 0) for item in items)
    
    # Use already-fetched retailer for commission calculation
    commission_percentage = retailer.get("commission_percentage", 0) if retailer else invoice.get("commission_percentage", 0)
    commission_amount = total_mrp_value * (commission_percentage / 100)
    net_payable = total_mrp_value - commission_amount
    
    # Update invoice
    update_data = {
        "invoice_date": input.get("invoice_date", invoice.get("invoice_date")),
        "items": items,
        "total_mrp_value": round(total_mrp_value, 2),
        "commission_percentage": commission_percentage,
        "commission_amount": round(commission_amount, 2),
        "net_payable": round(net_payable, 2),
        "remarks": input.get("remarks", invoice.get("remarks", ""))
    }
    
    await db.retailer_invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    return {"id": invoice_id, "message": "Invoice updated successfully"}


@router.delete("/retailer-invoices/{invoice_id}")
async def delete_retailer_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete invoices")
    
    invoice = await db.retailer_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get retailer to check payment model
    retailer = await db.users.find_one({"id": invoice.get("retailer_id")}, {"_id": 0})
    is_100_upfront = retailer and retailer.get("upfront_collection_percentage") == 100
    
    # Enforce same-day delete rule for non-admin users ONLY for 100% upfront retailers
    # Admin can delete any invoice, staff can only delete same-day invoices for 100% upfront retailers
    if current_user["role"] != "admin" and is_100_upfront:
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        invoice_date = invoice.get("invoice_date", "")[:10]
        if invoice_date != today:
            raise HTTPException(status_code=403, detail="Staff can only delete same-day invoices for 100% upfront retailers. Contact admin for older invoices.")
    
    # Remove invoice reference from dispatches
    await db.retailer_dispatches.update_many(
        {"id": {"$in": invoice.get("dispatch_ids", [])}},
        {"$set": {"invoice_number": None, "invoice_id": None}}
    )
    
    # Reset credit notes that were adjusted against this invoice
    # Get credit note adjustments from the invoice
    credit_note_adjustments = invoice.get("credit_note_adjustments", [])
    invoice_number = invoice.get("invoice_number", "")
    cn_reset_count = 0
    
    for cn_adj in credit_note_adjustments:
        cn_id = cn_adj.get("credit_note_id")
        # Check both field names since they may vary
        adj_amount = cn_adj.get("adjusted_amount", 0) or cn_adj.get("amount", 0) or 0
        
        if cn_id and adj_amount > 0:
            # Get the credit note
            credit_note = await db.retailer_credit_notes.find_one({"id": cn_id}, {"_id": 0})
            if credit_note:
                current_adjusted = credit_note.get("adjusted_amount", 0) or 0
                new_adjusted = max(0, current_adjusted - adj_amount)
                total_amount = credit_note.get("amount", 0) or 0
                
                # Calculate new pending amount
                new_pending = total_amount - new_adjusted
                
                # Determine new status
                if new_adjusted <= 0:
                    new_status = "pending"
                elif new_adjusted >= total_amount:
                    new_status = "adjusted"
                else:
                    new_status = "partial"
                
                # Remove this invoice from adjusted_in_invoices array
                adjusted_in_invoices = credit_note.get("adjusted_in_invoices", [])
                adjusted_in_invoices = [
                    inv for inv in adjusted_in_invoices 
                    if inv.get("invoice_number") != invoice_number and inv.get("invoice_id") != invoice_id
                ]
                
                # Update credit note - reset to pending with full amount available
                await db.retailer_credit_notes.update_one(
                    {"id": cn_id},
                    {"$set": {
                        "adjusted_amount": round(new_adjusted, 2),
                        "pending_amount": round(new_pending, 2),
                        "status": new_status,
                        "adjusted_in_invoices": adjusted_in_invoices,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                cn_reset_count += 1
                logger.info(f"Reset credit note {credit_note.get('credit_note_number')} - adjusted: {current_adjusted} -> {new_adjusted}, pending: {new_pending}, status: {new_status}")
    
    await db.retailer_invoices.delete_one({"id": invoice_id})
    return {"message": "Invoice deleted successfully", "credit_notes_reset": cn_reset_count}

# Record payment against an invoice
@router.post("/retailer-invoices/{invoice_id}/payment")
async def record_invoice_payment(invoice_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Record payment against a retailer invoice with optional credit note adjustments"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can record payments")
    
    invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    amount = input.get("amount", 0)
    payment_mode = input.get("payment_mode", "cash")
    received_by = input.get("received_by", current_user.get("user_id", ""))
    received_by_name = input.get("received_by_name", current_user.get("name", ""))
    reference_number = input.get("reference_number", "")
    remarks = input.get("remarks", "")
    payment_date = input.get("payment_date", datetime.now(timezone.utc).isoformat())
    credit_adjustments = input.get("credit_adjustments", [])  # [{credit_note_id, credit_note_number, amount}]
    
    # Process credit note adjustments first
    total_credit_applied = 0
    credit_adjustment_records = []
    
    for adj in credit_adjustments:
        cn_id = adj.get("credit_note_id")
        adj_amount = float(adj.get("amount", 0))
        
        if adj_amount <= 0:
            continue
            
        credit_note = await db.retailer_credit_notes.find_one({"id": cn_id}, {"_id": 0})
        if not credit_note:
            continue
            
        # Calculate actual adjustment (can't exceed pending amount)
        pending = credit_note.get("pending_amount", credit_note.get("amount", 0))
        actual_adj = min(adj_amount, pending)
        
        if actual_adj <= 0:
            continue
            
        # Update credit note
        new_adjusted = credit_note.get("adjusted_amount", 0) + actual_adj
        new_pending = credit_note.get("amount", 0) - new_adjusted
        new_status = "adjusted" if new_pending <= 0.01 else "partial"
        
        # Add adjustment record to credit note
        adjustment_record = {
            "invoice_id": invoice_id,
            "invoice_number": invoice.get("invoice_number"),
            "amount": actual_adj,
            "date": payment_date
        }
        
        await db.retailer_credit_notes.update_one(
            {"id": cn_id},
            {
                "$set": {
                    "adjusted_amount": round(new_adjusted, 2),
                    "pending_amount": round(new_pending, 2),
                    "status": new_status,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                },
                "$push": {
                    "adjusted_against_invoices": adjustment_record
                }
            }
        )
        
        total_credit_applied += actual_adj
        credit_adjustment_records.append({
            "credit_note_id": cn_id,
            "credit_note_number": adj.get("credit_note_number") or credit_note.get("credit_note_number"),
            "amount_adjusted": actual_adj
        })
    
    # Calculate new paid amount (cash + credit adjustments)
    current_paid = invoice.get("paid_amount", 0)
    new_paid = current_paid + amount + total_credit_applied
    net_payable = invoice.get("net_payable", 0)
    total_credit_adjusted = invoice.get("total_credit_adjusted", 0) or 0
    
    # Final payable after credit adjustments
    final_payable_after_credit = net_payable - total_credit_adjusted - total_credit_applied
    
    # Determine payment status (use tolerance for floating point comparison)
    # Check against credit-adjusted final_payable, not raw net_payable
    if new_paid >= final_payable_after_credit - 0.01:  # Tolerance of 0.01 for floating point precision
        new_status = "paid"
    elif new_paid > 0:
        new_status = "partial"
    else:
        new_status = "pending"
    
    # Record the payment in retailer_payments collection
    payment_id = str(uuid.uuid4())
    retailer = await db.users.find_one({"id": invoice.get("retailer_id")}, {"_id": 0})
    payment_doc = {
        "id": payment_id,
        "retailer_id": invoice.get("retailer_id"),
        "retailer_name": retailer.get("company_name", retailer.get("name", "")) if retailer else "",
        "invoice_id": invoice_id,
        "invoice_number": invoice.get("invoice_number"),
        "payment_date": payment_date,
        "amount": amount,  # Cash amount
        "credit_applied": total_credit_applied,  # Credit note amount
        "total_settled": amount + total_credit_applied,  # Total amount settled
        "credit_adjustments": credit_adjustment_records,  # Details of credit notes used
        "payment_mode": payment_mode,
        "received_by": received_by,
        "received_by_name": received_by_name,
        "reference_number": reference_number,
        "remarks": remarks,
        "recorded_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.retailer_payments.insert_one(payment_doc)
    
    # Update the invoice with new paid amount, status, and payment_date
    invoice_update = {
        "paid_amount": round(new_paid, 2),
        "status": new_status,
        "payment_date": payment_date  # Track when payment was received
    }
    
    # If credit notes were applied, track them on the invoice too
    if total_credit_applied > 0:
        invoice_update["credit_adjusted"] = True
        invoice_update["credit_adjustment_amount"] = total_credit_applied
        invoice_update["credit_adjustments"] = credit_adjustment_records
    
    await db.retailer_invoices.update_one(
        {"id": invoice_id},
        {"$set": invoice_update}
    )
    
    return {
        "id": payment_id,
        "invoice_id": invoice_id,
        "cash_amount": round(amount, 2),
        "credit_applied": round(total_credit_applied, 2),
        "paid_amount": round(new_paid, 2),
        "status": new_status,
        "credit_adjustments": credit_adjustment_records,
        "message": "Payment recorded successfully"
    }

# Fix invoice statuses - recalculate from payments
@router.post("/retailer-invoices/fix-statuses")
async def fix_invoice_statuses(current_user: dict = Depends(get_current_user)):
    """Recalculate and fix invoice payment statuses based on actual payments and recalculated net_payable"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix statuses")
    
    # Get all retailer invoices
    invoices = await db.retailer_invoices.find({}, {"_id": 0}).to_list(10000)
    
    fixed_count = 0
    fixed_invoices = []
    
    for inv in invoices:
        invoice_id = inv.get('id')
        current_status = inv.get('status', 'pending')
        stored_paid = float(inv.get('paid_amount', 0) or 0)
        stored_net_payable = float(inv.get('net_payable', 0) or 0)
        
        # Recalculate net_payable accounting for rejections (same logic as GET endpoint)
        effective_net_payable = stored_net_payable
        
        # Get dispatch IDs for this invoice to find rejections
        dispatch_ids = inv.get("dispatch_ids", [])
        if isinstance(dispatch_ids, str):
            try:
                import ast
                dispatch_ids = ast.literal_eval(dispatch_ids)
            except:
                dispatch_ids = []
        
        # Calculate rejection-adjusted net_payable if we have dispatch info
        if dispatch_ids and isinstance(dispatch_ids, list) and len(dispatch_ids) > 0:
            try:
                # Get dispatches to find dispatch dates
                dispatches = await db.retailer_dispatches.find(
                    {"id": {"$in": dispatch_ids}},
                    {"_id": 0, "dispatch_date": 1, "retailer_id": 1}
                ).to_list(100)
                
                if dispatches:
                    retailer_id = inv.get("retailer_id") or dispatches[0].get("retailer_id")
                    dispatch_dates = list(set([d.get("dispatch_date", "")[:10] for d in dispatches if d.get("dispatch_date")]))
                    
                    if dispatch_dates and retailer_id:
                        # Fetch rejections for these dispatch dates
                        rejection_query = {
                            "retailer_id": retailer_id,
                            "rejection_date": {"$regex": f"^({'|'.join(dispatch_dates)})"}
                        }
                        rejections = await db.retailer_rejections.find(rejection_query, {"_id": 0}).to_list(500)
                        total_rejection_value = sum(r.get("rejection_value", 0) or 0 for r in rejections)
                        
                        # Recalculate net_payable
                        gross_value = float(inv.get("gross_value", 0) or inv.get("total_mrp_value", 0) or 0)
                        if gross_value == 0:
                            gross_value = float(inv.get("total_mrp_value", 0) or 0) + total_rejection_value
                        
                        net_mrp_value = gross_value - total_rejection_value
                        commission_percentage = float(inv.get("commission_percentage", 0) or 0)
                        commission_amount = net_mrp_value * (commission_percentage / 100)
                        effective_net_payable = net_mrp_value - commission_amount
            except Exception as e:
                # If rejection calculation fails, use stored net_payable
                pass
        
        # Get paid amount from payments collection
        all_payments = await db.retailer_payments.find({"invoice_id": invoice_id}).to_list(100)
        actual_paid = sum(float(p.get("amount", 0) or 0) for p in all_payments)
        
        # Use the higher of actual payments vs stored paid_amount
        effective_paid = max(actual_paid, stored_paid)
        
        # Compute final_payable LIVE instead of trusting stored value
        # final_payable = net_payable - total_credit_adjusted
        credit_adjusted = float(inv.get("total_credit_adjusted", 0) or 0)
        final_payable = effective_net_payable - credit_adjusted
        
        # Determine correct status with tolerance for floating point
        # If final_payable (after credit adjustments) is <=0, it's paid via credit notes
        if final_payable <= 0.01:
            correct_status = 'paid'
        elif effective_net_payable > 0 and effective_paid >= final_payable - 0.01:
            correct_status = 'paid'
        elif effective_paid > 0 or credit_adjusted > 0:
            correct_status = 'partial'
        else:
            correct_status = 'pending'
        
        # Check if update needed
        current_payment_status = inv.get('payment_status', current_status)
        if current_status != correct_status or current_payment_status != correct_status:
            await db.retailer_invoices.update_one(
                {'id': invoice_id},
                {'$set': {
                    'status': correct_status,
                    'payment_status': correct_status,
                    'paid_amount': round(effective_paid, 2),
                    'net_payable': round(effective_net_payable, 2)  # Also update stored net_payable
                }}
            )
            fixed_invoices.append({
                'invoice_number': inv.get('invoice_number'),
                'old_status': current_status,
                'new_status': correct_status,
                'stored_net_payable': stored_net_payable,
                'effective_net_payable': effective_net_payable,
                'credit_adjusted': credit_adjusted,
                'final_payable': final_payable,
                'stored_paid': stored_paid,
                'effective_paid': effective_paid
            })
            fixed_count += 1
    
    return {
        "message": f"Fixed {fixed_count} invoices",
        "total_checked": len(invoices),
        "fixed_invoices": fixed_invoices[:100]
    }

# Get payment history for an invoice
@router.get("/retailer-invoices/{invoice_id}/payments")
async def get_invoice_payments(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Get all payments for a specific invoice"""
    payments = await db.retailer_payments.find(
        {"invoice_id": invoice_id}, 
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    return payments

@router.post("/retailer-invoices/{invoice_id}/recalculate")
async def recalculate_invoice_totals(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """Recalculate invoice totals (gross, net, rejection, commission, payable) from scratch"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    retailer_id = invoice.get("retailer_id")
    invoice_date = invoice.get("invoice_date", "")[:10]
    
    # Step 1: Calculate gross value from items (sum of supplied_qty * mrp)
    items = invoice.get("items", [])
    gross_value = sum(
        (item.get("supplied_qty", item.get("quantity", 0)) or 0) * (item.get("mrp", 0) or 0)
        for item in items
    )
    
    # Step 2: Get rejections for this invoice's dispatch dates
    dispatch_ids = invoice.get("dispatch_ids", [])
    if isinstance(dispatch_ids, str):
        try:
            import ast
            dispatch_ids = ast.literal_eval(dispatch_ids)
        except:
            dispatch_ids = []
    
    total_rejection_value = 0
    rejection_by_item = {}
    
    if dispatch_ids:
        dispatches = await db.retailer_dispatches.find(
            {"id": {"$in": dispatch_ids}},
            {"_id": 0, "dispatch_date": 1}
        ).to_list(100)
        dispatch_dates = list(set([d.get("dispatch_date", "")[:10] for d in dispatches if d.get("dispatch_date")]))
        
        if dispatch_dates:
            rejection_query = {
                "retailer_id": retailer_id,
                "rejection_date": {"$regex": f"^({'|'.join(dispatch_dates)})"}
            }
            rejections = await db.retailer_rejections.find(rejection_query, {"_id": 0}).to_list(500)
            total_rejection_value = sum(r.get("rejection_value", 0) or 0 for r in rejections)
            
            # Build rejection lookup
            for rej in rejections:
                key = f"{rej.get('product_id')}_{rej.get('variant_id') or rej.get('variant_name')}"
                if key not in rejection_by_item:
                    rejection_by_item[key] = {"qty": 0, "value": 0}
                rejection_by_item[key]["qty"] += rej.get("quantity", 0) or 0
                rejection_by_item[key]["value"] += rej.get("rejection_value", 0) or 0
    
    # Step 3: Calculate net MRP value (gross - rejections)
    net_mrp_value = gross_value - total_rejection_value
    
    # Step 4: Calculate commission
    commission_pct = invoice.get("commission_percentage", 0) or 0
    commission_amount = net_mrp_value * (commission_pct / 100)
    
    # Step 5: Calculate net payable
    net_payable = net_mrp_value - commission_amount
    
    # Step 6: Get credit note adjustments
    total_credit_adjusted = sum(
        adj.get("amount", 0) for adj in invoice.get("credit_note_adjustments", [])
    )
    final_payable = net_payable - total_credit_adjusted
    
    # Step 7: Get actual paid amount from payments
    payments = await db.retailer_payments.find({"invoice_id": invoice_id}).to_list(100)
    paid_amount = sum(p.get("amount", 0) for p in payments)
    
    # Step 8: Determine status
    if final_payable <= 0.01 or paid_amount >= final_payable - 0.01:
        status = "paid"
    elif paid_amount > 0 or total_credit_adjusted > 0:
        status = "partial"
    else:
        status = "pending"
    
    remaining_amount = max(0, final_payable - paid_amount)
    
    # Step 9: Update item-level rejections
    updated_items = []
    for item in items:
        item_key = f"{item.get('product_id')}_{item.get('variant_id') or item.get('variant_name')}"
        rej_data = rejection_by_item.get(item_key, {"qty": 0, "value": 0})
        
        supplied_qty = item.get("supplied_qty", item.get("quantity", 0)) or 0
        rejected_qty = rej_data["qty"]
        billable_qty = max(0, supplied_qty - rejected_qty)
        mrp = item.get("mrp", 0) or 0
        amount = billable_qty * mrp
        
        updated_item = {
            **item,
            "rejected_qty": rejected_qty,
            "rejection_qty": rejected_qty,
            "billable_qty": billable_qty,
            "amount": round(amount, 2)
        }
        updated_items.append(updated_item)
    
    # Step 10: Save all recalculated values
    update_data = {
        "gross_value": round(gross_value, 2),
        "rejection_amount": round(total_rejection_value, 2),
        "total_mrp_value": round(net_mrp_value, 2),  # This is the NET value after rejections
        "commission_amount": round(commission_amount, 2),
        "net_payable": round(net_payable, 2),
        "final_payable": round(final_payable, 2),
        "total_credit_adjusted": round(total_credit_adjusted, 2),
        "paid_amount": round(paid_amount, 2),
        "remaining_amount": round(remaining_amount, 2),
        "status": status,
        "payment_status": status,
        "items": updated_items
    }
    
    await db.retailer_invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    logger.info(f"Recalculated invoice {invoice.get('invoice_number')}: gross={gross_value}, rejection={total_rejection_value}, net_mrp={net_mrp_value}, commission={commission_amount}, net_payable={net_payable}, paid={paid_amount}, status={status}")
    
    return {
        "message": "Invoice recalculated successfully",
        "invoice_number": invoice.get("invoice_number"),
        "old_values": {
            "gross_value": invoice.get("gross_value"),
            "total_mrp_value": invoice.get("total_mrp_value"),
            "net_payable": invoice.get("net_payable"),
            "paid_amount": invoice.get("paid_amount"),
            "status": invoice.get("status")
        },
        "new_values": update_data
    }

@router.post("/retailer-invoices/fix-status")
async def fix_invoice_statuses(current_user: dict = Depends(get_current_user)):
    """Utility to fix invoice statuses where paid_amount equals net_payable but status is not 'paid'"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run this fix")
    
    # Get all invoices via the main API (which calculates net_payable correctly)
    # We'll simulate this by getting all invoices including rejections
    fixed_count = 0
    
    # First, get all partial/pending invoices from the database
    raw_invoices = await db.retailer_invoices.find(
        {"status": {"$in": ["partial", "pending"]}},
        {"_id": 0}
    ).to_list(1000)
    
    logger.info(f"Found {len(raw_invoices)} partial/pending invoices to check")
    
    for invoice in raw_invoices:
        invoice_id = invoice.get("id")
        paid_amount = float(invoice.get("paid_amount", 0) or 0)
        
        # Get dispatch IDs for this invoice
        dispatch_ids = invoice.get("dispatch_ids", [])
        if not dispatch_ids or not isinstance(dispatch_ids, list):
            # Try to get dispatches by invoice_id reference
            dispatches = await db.retailer_dispatches.find(
                {"invoice_id": invoice_id},
                {"_id": 0}
            ).to_list(100)
        else:
            # Get dispatches by IDs
            dispatches = await db.retailer_dispatches.find(
                {"id": {"$in": dispatch_ids}},
                {"_id": 0}
            ).to_list(100)
        
        if not dispatches:
            continue
        
        retailer_id = invoice.get("retailer_id") or dispatches[0].get("retailer_id")
        dispatch_dates = list(set([d.get("dispatch_date", "")[:10] for d in dispatches if d.get("dispatch_date")]))
        
        if not dispatch_dates:
            continue
        
        # Fetch rejections for these dispatch dates and retailer
        rejection_query = {
            "retailer_id": retailer_id,
            "rejection_date": {"$regex": f"^({'|'.join(dispatch_dates)})"}
        }
        rejections = await db.retailer_rejections.find(rejection_query, {"_id": 0}).to_list(500)
        
        # Calculate total rejection value
        total_rejection_value = sum(r.get("rejection_value", 0) or 0 for r in rejections)
        
        # Recalculate net_payable
        gross_value = float(invoice.get("gross_value", 0) or invoice.get("total_mrp_value", 0) or 0)
        commission_percentage = float(invoice.get("commission_percentage", 0) or 0)
        
        # If no gross_value stored, calculate from total_mrp + rejections
        if gross_value == 0:
            gross_value = (invoice.get("total_mrp_value", 0) or 0) + total_rejection_value
        
        # Net MRP after rejections
        net_mrp_value = gross_value - total_rejection_value
        commission_amount = net_mrp_value * (commission_percentage / 100)
        net_payable = net_mrp_value - commission_amount
        
        logger.info(f"Checking invoice {invoice.get('invoice_number')}: paid={paid_amount}, rejection={total_rejection_value}, calculated_net={net_payable}")
        
        # Check if paid_amount >= net_payable (with tolerance)
        if paid_amount >= net_payable - 0.01 and net_payable > 0:
            result = await db.retailer_invoices.update_one(
                {"id": invoice_id},
                {"$set": {"status": "paid"}}
            )
            logger.info(f"Updated invoice {invoice.get('invoice_number')} to PAID")
            if result.modified_count > 0:
                fixed_count += 1
    
    return {
        "message": f"Fixed {fixed_count} invoices",
        "fixed_count": fixed_count
    }

# Fix rejection sync for 100% upfront retailers
@router.post("/retailer-invoices/fix-100-upfront-rejection")
async def fix_100_upfront_rejection(current_user: dict = Depends(get_current_user)):
    """
    Fix invoices for 100% upfront retailers where rejection was synced but no payment made.
    For these invoices, reset rejection_amount to 0 so net_payable = pending_amount.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run this fix")
    
    # Get 100% upfront retailers
    retailers = await db.users.find({
        "role": "retailer",
        "$or": [
            {"upfront_collection_percentage": 100},
            {"upfront_collection_percentage": 100.0}
        ]
    }).to_list(100)
    
    upfront_ids = [r["id"] for r in retailers]
    logger.info(f"Found {len(upfront_ids)} 100% upfront retailers")
    
    # Find invoices with rejection_amount > 0 and either no payment or paid_amount = 0/None
    fixed_count = 0
    invoices = await db.retailer_invoices.find({
        "retailer_id": {"$in": upfront_ids},
        "rejection_amount": {"$gt": 0},
        "$or": [
            {"paid_amount": 0},
            {"paid_amount": None},
            {"paid_amount": {"$exists": False}}
        ]
    }).to_list(1000)
    
    for inv in invoices:
        # Reset rejection_amount to 0 and recalculate pending
        net_payable = inv.get("net_payable", 0) or 0
        total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        
        # Clear rejection data from items array as well
        items = inv.get("items", [])
        for item in items:
            item["rejected_qty"] = 0
            item["rejection_value"] = 0
        
        update_data = {
            "rejection_amount": 0,
            "final_payable": net_payable - total_credit_adjusted,
            "pending_amount": net_payable - total_credit_adjusted,
            "items": items  # Update items with cleared rejection data
        }
        
        await db.retailer_invoices.update_one(
            {"id": inv["id"]},
            {"$set": update_data}
        )
        fixed_count += 1
        logger.info(f"Fixed invoice {inv.get('invoice_number')}: reset rejection_amount and item rejections, set pending={net_payable - total_credit_adjusted}")
    
    return {
        "message": f"Fixed {fixed_count} invoices for 100% upfront retailers",
        "fixed_count": fixed_count,
        "retailer_count": len(upfront_ids)
    }

# ==================== RETAILER STATEMENT/LEDGER ====================
@router.get("/retailer-statement")
async def get_retailer_statement(
    retailer_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get retailer statement (ledger) with all debits and credits.
    
    Entries include:
    - Invoices: DEBIT (payable amount)
    - Rejections (without credit note): CREDIT (reduces what retailer owes)  
    - Credit Notes: CREDIT (credit to retailer) - excluded from totals for 100% upfront retailers
    - Payments: CREDIT (payment received)
    
    Returns date-wise sorted entries with running balance.
    """
    if current_user["role"] not in ["admin", "staff", "retailer"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # For retailer role, restrict to own data
    if current_user["role"] == "retailer":
        retailer_id = current_user["user_id"]
    
    if not retailer_id:
        raise HTTPException(status_code=400, detail="retailer_id is required")
    
    # Get retailer info including upfront collection percentage
    retailer = await db.users.find_one(
        {"id": retailer_id}, 
        {"_id": 0, "company_name": 1, "name": 1, "upfront_collection_percentage": 1}
    )
    retailer_name = retailer.get("company_name", retailer.get("name", "Unknown")) if retailer else "Unknown"
    is_100_percent_upfront = (retailer.get("upfront_collection_percentage", 0) or 0) == 100 if retailer else False
    
    # Default date range: last 90 days
    if not end_date:
        end_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now(timezone.utc) - timedelta(days=90)).strftime('%Y-%m-%d')
    
    entries = []
    
    # 1. Get Invoices (DEBIT entries - amount retailer owes)
    invoices = await db.retailer_invoices.find({
        "retailer_id": retailer_id,
        "invoice_date": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    for inv in invoices:
        invoice_date = inv.get("invoice_date", "")[:10]
        
        # For 100% upfront retailers: Invoice amount should be based on GROSS value
        # (rejections don't reduce invoice, they create credit notes instead)
        # The stored net_payable might be incorrect for older invoices, so recalculate
        if is_100_percent_upfront:
            gross_value = inv.get("gross_value", 0) or 0
            commission_pct = inv.get("commission_percentage", 0) or 0
            # Invoice amount = gross value - commission (NO rejection deduction)
            amount = gross_value * (1 - commission_pct / 100)
        else:
            # Regular retailers: Use net_payable (after rejections, before credit adjustments)
            amount = inv.get("net_payable", 0) or 0
        
        entries.append({
            "date": invoice_date,
            "type": "invoice",
            "reference": inv.get("invoice_number", ""),
            "description": f"Invoice {inv.get('invoice_number', '')}",
            "debit": round(amount, 2),
            "credit": 0,
            "id": inv.get("id"),
            "created_at": inv.get("created_at", invoice_date)
        })
    
    # 2. Get Rejections WITHOUT credit notes (CREDIT entries - reduces retailer's debt)
    # These are rejections where auto_credit_note_id is null/empty
    rejections = await db.retailer_rejections.find({
        "retailer_id": retailer_id,
        "rejection_date": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        "$or": [
            {"auto_credit_note_id": {"$exists": False}},
            {"auto_credit_note_id": None},
            {"auto_credit_note_id": ""}
        ]
    }, {"_id": 0}).to_list(1000)
    
    for rej in rejections:
        rej_date = rej.get("rejection_date", "")[:10]
        amount = rej.get("total_value", 0) or 0
        if amount > 0:
            entries.append({
                "date": rej_date,
                "type": "rejection",
                "reference": rej.get("id", "")[:8],
                "description": f"Rejection (reduces payable)",
                "debit": 0,
                "credit": round(amount, 2),
                "id": rej.get("id"),
                "created_at": rej.get("created_at", rej_date)
            })
    
    # 3. Get Credit Notes (CREDIT entries)
    # Credit notes are shown as separate entries to reduce retailer's debt
    # For 100% upfront: Invoice shows full amount, credit notes reduce balance separately
    credit_notes = await db.retailer_credit_notes.find({
        "retailer_id": retailer_id,
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        "status": {"$ne": "voided"}
    }, {"_id": 0}).to_list(1000)
    
    for cn in credit_notes:
        cn_date = cn.get("created_at", "")[:10]
        amount = cn.get("amount", 0) or 0
        
        if amount > 0:
            entries.append({
                "date": cn_date,
                "type": "credit_note",
                "reference": cn.get("credit_note_number", ""),
                "description": f"Credit Note {cn.get('credit_note_number', '')} - {cn.get('reason', '')}",
                "debit": 0,
                "credit": round(amount, 2),
                "id": cn.get("id"),
                "created_at": cn.get("created_at", cn_date)
            })
    
    # 4. Get Payments (CREDIT entries - money received from retailer)
    payments = await db.retailer_payments.find({
        "retailer_id": retailer_id,
        "payment_date": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    for pmt in payments:
        pmt_date = pmt.get("payment_date", "")[:10]
        amount = pmt.get("amount", 0) or 0
        entries.append({
            "date": pmt_date,
            "type": "payment",
            "reference": pmt.get("reference_number", "") or pmt.get("id", "")[:8],
            "description": f"Payment received ({pmt.get('payment_mode', 'cash')})",
            "debit": 0,
            "credit": round(amount, 2),
            "id": pmt.get("id"),
            "created_at": pmt.get("created_at", pmt_date)
        })
    
    # Sort by date and created_at
    entries.sort(key=lambda x: (x["date"], x.get("created_at", "")))
    
    # Calculate running balance (Debit - Credit = Amount retailer owes)
    running_balance = 0
    for entry in entries:
        running_balance += entry["debit"] - entry["credit"]
        entry["balance"] = round(running_balance, 2)
    
    # Calculate totals
    # For 100% upfront retailers: Invoice debit = gross value, so credit notes balance naturally
    total_debit = sum(e["debit"] for e in entries)
    total_credit = sum(e["credit"] for e in entries)
    closing_balance = total_debit - total_credit
    
    # Get retailer info
    retailer_name = retailer.get("company_name", retailer.get("name", "Unknown")) if retailer else "Unknown"
    
    return {
        "retailer_id": retailer_id,
        "retailer_name": retailer_name,
        "start_date": start_date,
        "end_date": end_date,
        "entries": entries,
        "summary": {
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "closing_balance": round(closing_balance, 2),  # Positive = retailer owes, Negative = excess paid
            "entry_count": len(entries),
            "is_100_percent_upfront": is_100_percent_upfront
        }
    }

# ==================== DAILY MRP MANAGEMENT ====================
@router.get("/daily-mrp")
async def get_daily_mrp(
    date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get daily MRP entries for a specific date (auto-deduplicates on fetch)"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if date:
        query["date"] = date
    else:
        # Default to today
        from datetime import date as date_type
        query["date"] = date_type.today().isoformat()
    
    entries = await db.daily_mrp.find(query, {"_id": 0}).to_list(1000)
    
    # Auto-deduplicate: keep only first occurrence of each product+variant
    seen = set()
    unique_entries = []
    duplicates_found = []
    
    for entry in entries:
        key = (entry.get("product_id"), entry.get("variant_id"))
        if key not in seen:
            seen.add(key)
            unique_entries.append(entry)
        else:
            duplicates_found.append(entry.get("id"))
    
    # Auto-cleanup duplicates in background (delete them from DB)
    if duplicates_found:
        for dup_id in duplicates_found:
            await db.daily_mrp.delete_one({"id": dup_id})
    
    return unique_entries

@router.post("/daily-mrp")
async def save_daily_mrp(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save/update daily MRP entries with Blinkit prices for historical tracking"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    date = input.get("date")
    items = input.get("items", [])
    
    if not date:
        raise HTTPException(status_code=400, detail="Date is required")
    
    # Delete existing entries for this date and save new ones
    await db.daily_mrp.delete_many({"date": date})
    
    if items:
        for item in items:
            item["date"] = date
            item["id"] = str(uuid.uuid4())
            item["updated_by"] = current_user["user_id"]
            item["updated_at"] = datetime.now(timezone.utc).isoformat()
            # Ensure blinkit_price is stored (default to 0 if not provided)
            if "blinkit_price" not in item:
                item["blinkit_price"] = 0
            await db.daily_mrp.insert_one(item)
    
    return {"message": f"Saved {len(items)} MRP entries for {date}"}

@router.post("/daily-mrp/entry")
async def add_mrp_entry(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add a single MRP entry with Blinkit price. Prevents duplicates by date+product+variant."""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    date = input.get("date")
    product_id = input.get("product_id")
    variant_id = input.get("variant_id")
    
    # Check for existing entry with same date + product + variant
    existing = await db.daily_mrp.find_one({
        "date": date,
        "product_id": product_id,
        "variant_id": variant_id
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Entry already exists for {input.get('product_name')} ({input.get('variant_name')}) on {date}"
        )
    
    entry = {
        "id": str(uuid.uuid4()),
        "date": date,
        "product_id": product_id,
        "product_name": input.get("product_name"),
        "category": input.get("category"),
        "variant_id": variant_id,
        "variant_name": input.get("variant_name"),
        "mrp": input.get("mrp", 0),
        "blinkit_price": input.get("blinkit_price", 0),
        "updated_by": current_user["user_id"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.daily_mrp.insert_one(entry)
    entry.pop("_id", None)
    return entry

@router.put("/daily-mrp/{entry_id}")
async def update_mrp_entry(
    entry_id: str,
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a single MRP entry with Blinkit price"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {
        "variant_id": input.get("variant_id"),
        "variant_name": input.get("variant_name"),
        "mrp": input.get("mrp", 0),
        "blinkit_price": input.get("blinkit_price", 0),
        "updated_by": current_user["user_id"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    result = await db.daily_mrp.update_one(
        {"id": entry_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    return {"message": "MRP entry updated"}

@router.delete("/daily-mrp/{entry_id}")
async def delete_mrp_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a single MRP entry"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.daily_mrp.delete_one({"id": entry_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    return {"message": "MRP entry deleted"}


@router.post("/daily-mrp/cleanup-duplicates")
async def cleanup_mrp_duplicates(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Remove duplicate MRP entries for a date, keeping only the first occurrence"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    date = input.get("date")
    if not date:
        raise HTTPException(status_code=400, detail="Date is required")
    
    # Get all entries for this date
    entries = await db.daily_mrp.find({"date": date}, {"_id": 0}).to_list(1000)
    
    # Find duplicates
    seen = {}  # (product_id, variant_id) -> first entry id
    duplicates_to_delete = []
    
    for entry in entries:
        key = (entry.get("product_id"), entry.get("variant_id"))
        if key in seen:
            # This is a duplicate, mark for deletion
            duplicates_to_delete.append(entry.get("id"))
        else:
            seen[key] = entry.get("id")
    
    # Delete duplicates
    deleted_count = 0
    for entry_id in duplicates_to_delete:
        result = await db.daily_mrp.delete_one({"id": entry_id})
        deleted_count += result.deleted_count
    
    return {
        "message": f"Removed {deleted_count} duplicate entries for {date}",
        "duplicates_removed": deleted_count
    }


@router.get("/daily-mrp/last-variants")
async def get_last_sold_variants(
    current_user: dict = Depends(get_current_user)
):
    """Get last sold variant for each product from recent dispatches"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get recent dispatches (last 30 days)
    from datetime import timedelta
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    dispatches = await db.retailer_dispatches.find(
        {"dispatch_date": {"$gte": thirty_days_ago}},
        {"_id": 0, "items": 1, "dispatch_date": 1}
    ).sort("dispatch_date", -1).to_list(500)
    
    # Build a map of product_id -> last variant
    last_variants = {}
    for dispatch in dispatches:
        for item in dispatch.get("items", []):
            product_id = item.get("product_id")
            if product_id and product_id not in last_variants:
                last_variants[product_id] = {
                    "variant_id": item.get("variant_id"),
                    "variant_name": item.get("variant_name") or item.get("packaging_name")
                }
    
    return last_variants


@router.get("/daily-mrp/for-dispatch")
async def get_mrp_for_dispatch(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get MRP entries for a dispatch date, keyed by product_id+variant_id"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get MRP entries for the given date
    mrp_entries = await db.daily_mrp.find(
        {"date": date},
        {"_id": 0}
    ).to_list(1000)
    
    # Create a map keyed by product_id+variant_id for quick lookup
    mrp_map = {}
    for entry in mrp_entries:
        key = f"{entry.get('product_id')}_{entry.get('variant_id')}"
        mrp_map[key] = entry.get('mrp', 0)
    
    return mrp_map


# ==================== BLINKIT PRICE SCRAPER ====================

@router.get("/blinkit-prices")
async def get_blinkit_prices(
    date: str = None,
    pincode: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get scraped Blinkit prices for a date"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    query = {"date": date}
    if pincode:
        query["pincode"] = pincode
    
    prices = await db.blinkit_prices.find(query, {"_id": 0}).to_list(1000)
    return prices


@router.get("/blinkit-prices/latest")
async def get_latest_blinkit_prices(
    pincode: str = "411045",
    current_user: dict = Depends(get_current_user)
):
    """Get the most recent Blinkit prices for each product"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the latest prices using aggregation
    pipeline = [
        {"$match": {"pincode": pincode}},
        {"$sort": {"scraped_at": -1}},
        {"$group": {
            "_id": "$product_id",
            "product_id": {"$first": "$product_id"},
            "product_name": {"$first": "$product_name"},
            "blinkit_name": {"$first": "$blinkit_name"},
            "blinkit_price": {"$first": "$blinkit_price"},
            "quantity": {"$first": "$quantity"},
            "pincode": {"$first": "$pincode"},
            "date": {"$first": "$date"},
            "scraped_at": {"$first": "$scraped_at"}
        }},
        {"$project": {"_id": 0}}
    ]
    
    prices = await db.blinkit_prices.aggregate(pipeline).to_list(1000)
    
    # Convert to dict keyed by product_id for easy lookup
    price_map = {p["product_id"]: p for p in prices}
    return price_map


@router.post("/blinkit-prices/scrape")
async def trigger_blinkit_scrape(
    pincode: str = "411045",
    background_tasks: BackgroundTasks = None,
    current_user: dict = Depends(get_current_user)
):
    """Trigger a manual Blinkit price scrape"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can trigger scrape")
    
    # Get all active products
    products = await db.products.find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "category": 1}
    ).to_list(500)
    
    if not products:
        raise HTTPException(status_code=400, detail="No products found")
    
    # Start scraping in background
    if background_tasks:
        background_tasks.add_task(run_blinkit_scrape, pincode, products)
        return {"message": f"Scrape started for {len(products)} products with pincode {pincode}", "status": "started"}
    else:
        # Run synchronously if no background tasks available
        result = await run_blinkit_scrape_async(pincode, products)
        return result


async def run_blinkit_scrape_async(pincode: str, products: list):
    """Run Blinkit scrape asynchronously"""
    from blinkit_scraper import scrape_blinkit_prices
    
    product_names = [p["name"] for p in products]
    product_map = {p["name"]: p for p in products}
    
    try:
        results = await scrape_blinkit_prices(pincode, product_names)
        
        return {
            "results": results,
            "product_map": product_map,
            "pincode": pincode,
            "total_products": len(products)
        }
        
    except Exception as e:
        logger.error(f"Blinkit scrape failed: {e}")
        return {"error": str(e)}


def run_blinkit_scrape(pincode: str, products: list):
    """Wrapper to run async scrape in background task and save results"""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # Run the scraper
        scrape_result = loop.run_until_complete(run_blinkit_scrape_async(pincode, products))
        
        if "error" in scrape_result:
            logger.error(f"Blinkit scrape error: {scrape_result['error']}")
            return
        
        results = scrape_result.get("results", {})
        product_map = scrape_result.get("product_map", {})
        
        if not results:
            logger.warning("No Blinkit prices found")
            return
        
        # Save results to database synchronously
        async def save_results():
            # Create a new MongoDB connection for this loop
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'freshflow_db')
            client = AsyncIOMotorClient(mongo_url)
            local_db = client[db_name]
            
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            scraped_at = datetime.now(timezone.utc).isoformat()
            saved_count = 0
            
            for product_name, data in results.items():
                if product_name in product_map:
                    product = product_map[product_name]
                    
                    price_doc = {
                        "id": str(uuid.uuid4()),
                        "product_id": product["id"],
                        "product_name": product_name,
                        "category": product.get("category"),
                        "blinkit_name": data.get("blinkit_name"),
                        "blinkit_price": data.get("price"),
                        "quantity": data.get("quantity"),
                        "pincode": pincode,
                        "date": date_str,
                        "scraped_at": scraped_at
                    }
                    
                    await local_db.blinkit_prices.update_one(
                        {"product_id": product["id"], "date": date_str, "pincode": pincode},
                        {"$set": price_doc},
                        upsert=True
                    )
                    saved_count += 1
            
            client.close()
            return saved_count
        
        saved = loop.run_until_complete(save_results())
        logger.info(f"Blinkit scrape completed: {len(results)} prices found, {saved} saved")
        
    except Exception as e:
        logger.error(f"Blinkit background scrape failed: {e}")
    finally:
        loop.close()


@router.get("/blinkit-prices/mapping")
async def get_product_mapping(
    current_user: dict = Depends(get_current_user)
):
    """Get product name mappings for Blinkit search"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    mappings = await db.blinkit_product_mapping.find({}, {"_id": 0}).to_list(500)
    return mappings


@router.put("/blinkit-prices/mapping/{product_id}")
async def update_product_mapping(
    product_id: str,
    mapping: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update Blinkit search term mapping for a product"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update mappings")
    
    update_data = {
        "product_id": product_id,
        "blinkit_search_term": mapping.get("blinkit_search_term"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    
    await db.blinkit_product_mapping.update_one(
        {"product_id": product_id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Mapping updated", "product_id": product_id}


@router.post("/blinkit-prices/manual")
async def save_manual_blinkit_price(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save manually entered Blinkit price"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    price_doc = {
        "id": str(uuid.uuid4()),
        "product_id": data.get("product_id"),
        "product_name": data.get("product_name"),
        "category": data.get("category"),
        "blinkit_name": f"{data.get('product_name')} (Manual)",
        "blinkit_price": float(data.get("blinkit_price", 0)),
        "quantity": None,
        "pincode": data.get("pincode", "411045"),
        "date": data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "manual_entry": True
    }
    
    await db.blinkit_prices.update_one(
        {"product_id": data.get("product_id"), "date": price_doc["date"], "pincode": price_doc["pincode"]},
        {"$set": price_doc},
        upsert=True
    )
    
    return {"message": "Blinkit price saved", "product_id": data.get("product_id")}


def run_blinkit_scrape_scheduled():
    """Scheduled job to scrape Blinkit prices daily at 6 AM IST"""
    import asyncio
    
    async def _run_scheduled_scrape():
        try:
            # Get all active retailers with pincodes
            retailers = await db.retailers.find(
                {"is_active": {"$ne": False}},
                {"_id": 0, "id": 1, "pincode": 1, "name": 1}
            ).to_list(100)
            
            # Get unique pincodes
            pincodes = list(set([r.get("pincode", "411045") for r in retailers if r.get("pincode")]))
            if not pincodes:
                pincodes = ["411045"]  # Default pincode
            
            # Get all active products
            products = await db.products.find(
                {"is_active": {"$ne": False}},
                {"_id": 0, "id": 1, "name": 1, "category": 1}
            ).to_list(500)
            
            if not products:
                logger.warning("No products found for Blinkit scrape")
                return
            
            logger.info(f"Starting scheduled Blinkit scrape for {len(products)} products across {len(pincodes)} pincodes")
            
            # Scrape for each pincode (limit to first 3 to avoid overload)
            for pincode in pincodes[:3]:
                try:
                    result = await run_blinkit_scrape_async(pincode, products)
                    logger.info(f"Blinkit scrape for pincode {pincode}: {result}")
                except Exception as e:
                    logger.error(f"Blinkit scrape failed for pincode {pincode}: {e}")
                    
        except Exception as e:
            logger.error(f"Scheduled Blinkit scrape failed: {e}")
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_scheduled_scrape())
    except Exception as e:
        logger.error(f"Blinkit scheduled job error: {e}")
    finally:
        loop.close()


# Get uninvoiced dispatches for a retailer (for creating invoices)
# Now returns items that haven't been invoiced yet (item-level filtering)
@router.get("/retailer-dispatches/uninvoiced")
async def get_uninvoiced_dispatches(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can view uninvoiced dispatches")
    
    # Get all dispatches for this retailer
    dispatches = await db.retailer_dispatches.find({
        "retailer_id": retailer_id
    }, {"_id": 0}).sort("dispatch_date", -1).to_list(500)
    
    # Get all invoices for this retailer to find which items are already invoiced
    invoices = await db.retailer_invoices.find({
        "retailer_id": retailer_id
    }, {"_id": 0, "items": 1}).to_list(500)
    
    # Build a set of already invoiced items (dispatch_id + product_id combo)
    # Use multiple key formats for robust matching
    invoiced_item_keys = set()
    for invoice in invoices:
        for item in invoice.get("items", []):
            dispatch_id = item.get("dispatch_id", "")
            product_id = item.get("product_id", "")
            variant_name = item.get("variant_name", "") or ""
            variant_id = item.get("variant_id", "") or ""
            if dispatch_id and product_id:
                # Add multiple key formats for matching
                # Key 1: dispatch_id + product_id + variant_name
                invoiced_item_keys.add(f"{dispatch_id}_{product_id}_{variant_name}")
                # Key 2: dispatch_id + product_id + variant_id (in case variant_name stores variant_id)
                if variant_id:
                    invoiced_item_keys.add(f"{dispatch_id}_{product_id}_{variant_id}")
                # Key 3: dispatch_id + product_id only (most robust)
                invoiced_item_keys.add(f"{dispatch_id}_{product_id}")
    
    # Filter dispatches to only include uninvoiced items
    result = []
    for dispatch in dispatches:
        uninvoiced_items = []
        for item in dispatch.get("items", []):
            product_id = item.get("product_id", "")
            variant_name = item.get("variant_name", "") or ""
            variant_id = item.get("variant_id", "") or ""
            
            # Check all possible key formats
            key1 = f"{dispatch['id']}_{product_id}_{variant_name}"
            key2 = f"{dispatch['id']}_{product_id}_{variant_id}" if variant_id else None
            key3 = f"{dispatch['id']}_{product_id}"
            
            # Item is uninvoiced if none of the keys match
            # Use the most specific match available: try variant-level first, then product-level
            is_invoiced = (
                key1 in invoiced_item_keys or 
                (key2 and key2 in invoiced_item_keys) or
                key3 in invoiced_item_keys
            )
            
            if not is_invoiced:
                uninvoiced_items.append(item)
        
        # Only include dispatch if it has uninvoiced items
        if uninvoiced_items:
            dispatch_copy = dict(dispatch)
            dispatch_copy["items"] = uninvoiced_items
            result.append(dispatch_copy)
    
    return result

# ------------ RETAILER DASHBOARD ------------
@router.get("/retailer-dashboard")
async def get_retailer_dashboard(
    retailer_id: str = None,
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    # Determine which retailer's data to show
    if current_user["role"] == "retailer":
        target_retailer_id = current_user["user_id"]
    elif retailer_id:
        target_retailer_id = retailer_id
    else:
        raise HTTPException(status_code=400, detail="Retailer ID required")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": target_retailer_id}, {"_id": 0, "password": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # Build date filter for queries
    dispatch_date_filter = {"retailer_id": target_retailer_id}
    rejection_date_filter = {"retailer_id": target_retailer_id}
    payment_date_filter = {"retailer_id": target_retailer_id}
    
    if from_date:
        dispatch_date_filter["dispatch_date"] = {"$gte": from_date}
        rejection_date_filter["rejection_date"] = {"$gte": from_date}
        payment_date_filter["payment_date"] = {"$gte": from_date}
    
    if to_date:
        if "dispatch_date" in dispatch_date_filter:
            dispatch_date_filter["dispatch_date"]["$lte"] = to_date
        else:
            dispatch_date_filter["dispatch_date"] = {"$lte": to_date}
        
        if "rejection_date" in rejection_date_filter:
            rejection_date_filter["rejection_date"]["$lte"] = to_date
        else:
            rejection_date_filter["rejection_date"] = {"$lte": to_date}
        
        if "payment_date" in payment_date_filter:
            payment_date_filter["payment_date"]["$lte"] = to_date
        else:
            payment_date_filter["payment_date"] = {"$lte": to_date}
    
    # Get all dispatches for this retailer (filtered by date if provided)
    dispatches = await db.retailer_dispatches.find(
        dispatch_date_filter, 
        {"_id": 0}
    ).to_list(1000)
    
    # Get all rejections (filtered by date if provided)
    rejections = await db.retailer_rejections.find(
        rejection_date_filter,
        {"_id": 0}
    ).to_list(1000)
    
    # Get all payments (filtered by date if provided)
    payments = await db.retailer_payments.find(
        payment_date_filter,
        {"_id": 0}
    ).to_list(1000)
    
    # Get pending indents
    pending_indents = await db.retailer_indents.count_documents({
        "retailer_id": target_retailer_id,
        "status": {"$in": ["pending", "partial"]}
    })
    
    # Calculate totals
    total_mrp_value = sum(d.get("total_mrp_value", 0) for d in dispatches)
    total_net_payable = sum(d.get("net_payable", 0) for d in dispatches)
    total_rejection_value = sum(r.get("rejection_value", 0) for r in rejections)
    total_paid = sum(p.get("amount", 0) for p in payments)
    
    # Adjusted payable after rejections
    adjusted_payable = total_net_payable - total_rejection_value
    pending_amount = max(0, adjusted_payable - total_paid)
    
    # Total items received
    total_items_received = 0
    for d in dispatches:
        for item in d.get("items", []):
            total_items_received += item.get("supplied_qty", 0)
    
    # Total items rejected
    total_items_rejected = sum(r.get("quantity", 0) for r in rejections)
    
    return {
        "retailer": {
            "id": retailer.get("id"),
            "name": retailer.get("name"),
            "email": retailer.get("email"),
            "contact": retailer.get("contact"),
            "address": retailer.get("address"),
            "company_name": retailer.get("company_name"),
            "commission_percentage": retailer.get("commission_percentage", 0),
            "upfront_collection_percentage": retailer.get("upfront_collection_percentage", 50),
            "referral_code": retailer.get("referral_code")
        },
        "summary": {
            "total_mrp_value": round(total_mrp_value, 2),
            "total_net_payable": round(total_net_payable, 2),
            "total_rejection_value": round(total_rejection_value, 2),
            "adjusted_payable": round(adjusted_payable, 2),
            "total_paid": round(total_paid, 2),
            "pending_amount": round(pending_amount, 2),
            "total_items_received": total_items_received,
            "total_items_rejected": total_items_rejected,
            "pending_indents": pending_indents,
            "total_dispatches": len(dispatches),
            "total_payments": len(payments)
        }
    }

# ============================================================================
# ============================================================================
# SECTION: BACKUP & DATA MANAGEMENT ROUTES - MOVED TO routes/backup_data.py
# ============================================================================
# The following routes have been extracted to routes/backup_data.py:
# - POST /backup/trigger
# - GET /backup/download
# - GET /backup/status
# - POST /admin/reset-data
# - POST /sync-from-production
# - POST /admin/run-migration/fix-uuid-variants
# - POST /admin/run-migration/sync-product-translations
# Import: from routes import backup_data_router
# Include: app.include_router(backup_data_router, prefix="/api")
# ============================================================================

# ============================================================================
# SECTION: GMAIL INTEGRATION ROUTES - MOVED TO routes/gmail_integration.py
# ============================================================================
# The following routes have been extracted to routes/gmail_integration.py:
# - GET /gmail/auth-url
# - GET /gmail/callback
# - GET /gmail/status
# - DELETE /gmail/disconnect
# - POST /gmail/auto-sync
# Import: from routes import gmail_integration_router
# Include: app.include_router(gmail_integration_router, prefix="/api")
# ============================================================================



# ==================== AUTO INDENT GENERATION ====================

def extract_weight_from_variant(variant_name: str) -> str:
    """
    Extract normalized weight from variant name for grouping.
    Handles formats like: '1kg', '1 kg', '500g', '500 gm', '1 Kg', '500 GM', '250gm', '2.5kg', '500+ gm'
    Also handles range formats: '240-260 gm' (uses average), '300-350gm'
    Returns a normalized weight string like '1000g', '500g', etc.
    If no weight found, returns empty string.
    """
    if not variant_name:
        return ""
    
    variant_lower = variant_name.lower().strip()
    
    # First, try to match range format: "240-260 gm", "300-350gm", "190-210 gm Packet"
    range_pattern = r'(\d+)\s*[-–]\s*(\d+)\s*\+?\s*(kg|kgs|g|gm|gms|gram|grams)'
    range_match = re.search(range_pattern, variant_lower)
    if range_match:
        low = float(range_match.group(1))
        high = float(range_match.group(2))
        unit = range_match.group(3)
        # Use average of range
        avg = (low + high) / 2
        if unit in ('kg', 'kgs'):
            grams = int(avg * 1000)
        else:
            grams = int(avg)
        return f"{grams}g"
    
    # Pattern to match single weight: number (with optional decimal) followed by optional + and unit
    # Handles: 1kg, 1 kg, 500g, 500gm, 500 gm, 2.5kg, 500+ gm, etc.
    weight_pattern = r'(\d+(?:\.\d+)?)\s*\+?\s*(kg|kgs|kilogram|kilograms|g|gm|gms|gram|grams)'
    
    match = re.search(weight_pattern, variant_lower)
    if not match:
        return ""
    
    number = float(match.group(1))
    unit = match.group(2)
    
    # Normalize to grams
    if unit in ('kg', 'kgs', 'kilogram', 'kilograms'):
        grams = int(number * 1000)
    else:  # g, gm, gms, gram, grams
        grams = int(number)
    
    return f"{grams}g"


def normalize_weight_to_bucket(weight_gm: float) -> int:
    """
    Normalize weight to a standard bucket for grouping similar weights.
    This groups weights that are close to each other into the same bucket.
    
    Standard buckets are chosen based on common produce packaging sizes.
    The algorithm finds the closest bucket to the given weight.
    
    Examples:
    - 475g, 450g, 500g → 500g bucket (all ~500g category)
    - 325g, 350g, 300g → 300g bucket (all ~300g category)
    - 1000g → 1000g bucket
    """
    if weight_gm <= 0:
        return 0
    
    # Define standard weight buckets (in grams) based on common produce packaging
    # These represent typical weight categories used in retail
    standard_buckets = [
        50, 75, 100, 150, 200, 250, 300, 400, 500, 
        700, 750, 1000, 1500, 2000, 2500, 3000, 5000
    ]
    
    # Find the closest bucket
    closest_bucket = standard_buckets[0]
    min_distance = abs(weight_gm - closest_bucket)
    
    for bucket in standard_buckets:
        distance = abs(weight_gm - bucket)
        if distance < min_distance:
            min_distance = distance
            closest_bucket = bucket
    
    return closest_bucket


def merge_close_weight_variants(product_weight_totals: dict, max_gap_gm: int = 300) -> dict:
    """
    Post-process product_weight_totals to merge variants of the same product
    that have weights close together (within max_gap_gm).
    
    For example:
    - Broccoli 200g, 300g, 400g → Merge into one (all within 200g of each other)
    - Potato 500g, 1000g → Keep separate (500g gap is too large)
    - Fresh Mint 75g, 100g → Merge into one (25g gap)
    
    Args:
        product_weight_totals: Dict keyed by "product_id_weightg" with aggregation data
        max_gap_gm: Maximum gap between adjacent weights to consider them "close" (default 300g)
    
    Returns:
        Merged dict with combined entries
    """
    from collections import defaultdict
    
    # Group entries by product_id to merge weight variants of the SAME product
    product_entries = defaultdict(list)
    for key, data in product_weight_totals.items():
        product_id = data["product_id"]
        weight_bucket = data.get("weight_bucket", 0)
        product_entries[product_id].append({
            "key": key,
            "weight_bucket": weight_bucket,
            "data": data
        })
    
    merged_result = {}
    
    for product_id, entries in product_entries.items():
        if len(entries) == 1:
            # Only one entry, keep as-is
            merged_result[entries[0]["key"]] = entries[0]["data"]
            continue
        
        # Sort by weight bucket
        entries.sort(key=lambda x: x["weight_bucket"])
        
        # Find clusters of close weights
        clusters = []
        current_cluster = [entries[0]]
        
        for i in range(1, len(entries)):
            prev_weight = entries[i-1]["weight_bucket"]
            curr_weight = entries[i]["weight_bucket"]
            
            # If gap is small enough, add to current cluster
            if curr_weight - prev_weight <= max_gap_gm:
                current_cluster.append(entries[i])
            else:
                # Gap too large, start new cluster
                clusters.append(current_cluster)
                current_cluster = [entries[i]]
        
        # Don't forget the last cluster
        clusters.append(current_cluster)
        
        # Process each cluster
        for cluster in clusters:
            if len(cluster) == 1:
                # Single entry cluster, keep as-is
                merged_result[cluster[0]["key"]] = cluster[0]["data"]
            else:
                # Multiple entries in cluster - merge them
                # Find the middle weight variant
                weights = [e["weight_bucket"] for e in cluster]
                mid_weight = weights[len(weights) // 2]  # Use median weight
                
                # Find the entry closest to mid weight
                mid_entry = min(cluster, key=lambda x: abs(x["weight_bucket"] - mid_weight))
                
                # Combine all data
                combined_total_qty = sum(e["data"]["total_qty"] for e in cluster)
                combined_dates = set()
                for e in cluster:
                    combined_dates.update(e["data"]["dates"])
                
                # Find the latest variant across all entries
                latest_entry = max(cluster, key=lambda x: x["data"]["latest_invoice_date"])
                
                # Create merged entry using mid variant's key but latest variant name
                merged_key = mid_entry["key"]
                merged_data = mid_entry["data"].copy()
                merged_data["total_qty"] = combined_total_qty
                merged_data["dates"] = combined_dates
                merged_data["latest_variant_name"] = latest_entry["data"]["latest_variant_name"]
                merged_data["latest_variant_id"] = latest_entry["data"]["latest_variant_id"]
                merged_data["latest_invoice_date"] = latest_entry["data"]["latest_invoice_date"]
                
                merged_result[merged_key] = merged_data
    
    return merged_result


async def generate_auto_indents_for_tomorrow():
    """
    Auto-generate retailer indents for the next day based on invoice history.
    Runs at 11 PM daily.
    
    Logic:
    1. Calculate tomorrow's day of week (e.g., Monday)
    2. For each retailer, find invoice quantities on the same weekday in the last 7 weeks
    3. Group products by product_id + actual weight (from packaging database)
    4. Calculate average based on count of days with data and increase by 10%
    5. Create auto-generated indent
    
    Note: Invoice quantity = Dispatch - Rejections (the net final number)
    """
    try:
        logger.info("Starting auto-indent generation for tomorrow (using invoice data)...")
        
        # Get tomorrow's date
        now = datetime.now(timezone.utc)
        tomorrow = now + timedelta(days=1)
        tomorrow_str = tomorrow.strftime('%Y-%m-%d')
        tomorrow_weekday = tomorrow.weekday()  # 0=Monday, 6=Sunday
        weekday_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        
        # Get all retailers
        retailers = await db.users.find({"role": "retailer"}, {"_id": 0}).to_list(500)
        logger.info(f"Found {len(retailers)} retailers to process")
        
        # Get all products for reference
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        product_map = {p["id"]: p for p in products}
        
        # Get packaging variants for weight lookup
        packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
        packaging_weight_map = {}
        for p in packaging_variants:
            name = p.get('name', '').strip().lower()
            weight = p.get('weight_gm', 0)
            if name and weight:
                packaging_weight_map[name] = weight
        
        auto_indents_created = 0
        
        for retailer in retailers:
            retailer_id = retailer["id"]
            retailer_name = retailer.get("company_name") or retailer.get("name", "Unknown")
            
            try:
                # Check if indent already exists for tomorrow
                existing_indent = await db.retailer_indents.find_one({
                    "retailer_id": retailer_id,
                    "indent_date": {"$regex": f"^{tomorrow_str}"}
                })
                
                if existing_indent:
                    logger.info(f"Indent already exists for {retailer_name} on {tomorrow_str}, skipping")
                    continue
                
                # Get all invoices for this retailer
                invoices = await db.retailer_invoices.find({
                    "retailer_id": retailer_id
                }).to_list(500)
                
                if not invoices:
                    logger.info(f"No invoice history for {retailer_name}, skipping")
                    continue
                
                # Filter invoices for the same weekday in the last 7 weeks
                same_weekday_invoices = []
                cutoff_date = tomorrow.date() - timedelta(days=49)  # 7 weeks
                
                for inv in invoices:
                    try:
                        inv_date_str = inv.get("invoice_date", "")
                        if isinstance(inv_date_str, str):
                            inv_date = datetime.fromisoformat(inv_date_str.replace('Z', '+00:00')).date()
                        else:
                            inv_date = inv_date_str.date() if hasattr(inv_date_str, 'date') else None
                        
                        if inv_date and inv_date.weekday() == tomorrow_weekday:
                            if inv_date >= cutoff_date and inv_date < tomorrow.date():
                                same_weekday_invoices.append(inv)
                    except Exception as e:
                        continue
                
                if not same_weekday_invoices:
                    logger.info(f"No {weekday_names[tomorrow_weekday]} invoices for {retailer_name} in last 7 weeks, skipping")
                    continue
                
                logger.info(f"Analyzing {len(same_weekday_invoices)} {weekday_names[tomorrow_weekday]}s invoices for {retailer_name}")
                
                # Calculate average invoice quantity per product+weight combination
                # Group by product_id + actual weight from packaging database
                product_weight_totals = {}
                
                for inv in same_weekday_invoices:
                    inv_date_str = inv.get("invoice_date", "")[:10]
                    # Parse invoice date and ensure timezone awareness for comparisons
                    raw_inv_date = inv.get("invoice_date", "")
                    if raw_inv_date:
                        parsed_dt = datetime.fromisoformat(raw_inv_date.replace('Z', '+00:00'))
                        # Ensure timezone awareness - add UTC if naive
                        if parsed_dt.tzinfo is None:
                            inv_date = parsed_dt.replace(tzinfo=timezone.utc)
                        else:
                            inv_date = parsed_dt
                    else:
                        inv_date = datetime.now(timezone.utc)
                    
                    for item in inv.get("items", []):
                        product_id = item.get("product_id")
                        product_name = item.get("product_name", "")
                        variant_id = item.get("variant_id") or ""
                        variant_name = item.get("variant_name") or ""
                        # Invoice quantity = final dispatched qty after rejections
                        invoice_qty = item.get("quantity", 0) or 0
                        
                        if product_id and invoice_qty > 0:
                            # Get actual weight - first try packaging database, then extract from name
                            variant_key = variant_name.strip().lower()
                            actual_weight_gm = packaging_weight_map.get(variant_key, 0)
                            
                            # If not found in DB, try extracting from variant name
                            if actual_weight_gm == 0:
                                extracted_weight = extract_weight_from_variant(variant_name)
                                if extracted_weight:
                                    # Parse extracted weight (e.g., "250g" -> 250)
                                    actual_weight_gm = int(extracted_weight.replace('g', ''))
                            
                            # Key by product_id + normalized weight bucket
                            # Normalize weight to a standard bucket (e.g., 475g → 500g bucket)
                            # This groups similar weights (within 15%) together
                            if actual_weight_gm > 0:
                                weight_bucket = normalize_weight_to_bucket(actual_weight_gm)
                                key = f"{product_id}_{weight_bucket}g"
                            else:
                                key = f"{product_id}_{variant_name}"
                            
                            if key not in product_weight_totals:
                                product_weight_totals[key] = {
                                    "product_id": product_id,
                                    "product_name": product_name,
                                    "variant_id": variant_id,
                                    "variant_name": variant_name,
                                    "actual_weight_gm": actual_weight_gm,
                                    "weight_bucket": weight_bucket if actual_weight_gm > 0 else 0,
                                    "total_qty": 0,
                                    "dates": set(),
                                    "latest_invoice_date": inv_date,
                                    "latest_variant_name": variant_name,
                                    "latest_variant_id": variant_id
                                }
                            
                            product_weight_totals[key]["total_qty"] += invoice_qty
                            product_weight_totals[key]["dates"].add(inv_date_str)
                            
                            # Track the most recent variant name for display
                            if inv_date > product_weight_totals[key]["latest_invoice_date"]:
                                product_weight_totals[key]["latest_invoice_date"] = inv_date
                                product_weight_totals[key]["latest_variant_name"] = variant_name
                                product_weight_totals[key]["latest_variant_id"] = variant_id
                
                if not product_weight_totals:
                    logger.info(f"No invoice items for {retailer_name}, skipping")
                    continue
                
                # Merge close weight variants (within 300g of each other)
                # This combines entries like Broccoli 200g, 300g, 400g into one
                # But keeps Potato 500g and 1000g separate (500g gap)
                product_weight_totals = merge_close_weight_variants(product_weight_totals, max_gap_gm=300)
                
                # Fetch retailer catalogue to get purchase_unit info for each product
                catalogue_items = await db.retailer_catalogue.find({}, {"_id": 0}).to_list(500)
                catalogue_map = {}
                for cat in catalogue_items:
                    catalogue_map[cat.get("product_id")] = {
                        "purchase_unit": cat.get("purchase_unit", ""),
                        "purchase_weight_variant": cat.get("purchase_weight_variant", "")
                    }
                
                # Build packaging name map for resolving weight variant names
                packaging_name_map = {p.get("id"): p.get("name", "") for p in packaging_variants}
                
                # ============================================
                # GET YESTERDAY'S CLOSING WITH TIMING ADJUSTMENT
                # ============================================
                today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                yesterday_str = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
                
                # Get yesterday's closing inventory for this retailer
                closing_records = await db.retailer_closing_inventory.find({
                    "retailer_id": retailer_id,
                    "closing_date": yesterday_str
                }, {"_id": 0}).to_list(500)
                
                # Get yesterday's dispatches for this retailer
                yesterday_dispatches = await db.retailer_dispatches.find({
                    "retailer_id": retailer_id,
                    "dispatch_date": {"$regex": f"^{yesterday_str}"}
                }, {"_id": 0}).to_list(100)
                
                # Build closing map (product_id + variant_id -> closing_qty)
                closing_map = {}
                dispatch_adjustment_applied = False
                last_closing_time = ""
                last_dispatch_time = ""
                
                if closing_records:
                    # Find max closing timestamp
                    closing_timestamps = [r.get("created_at", "") for r in closing_records if r.get("created_at")]
                    last_closing_time = max(closing_timestamps) if closing_timestamps else ""
                    
                    # Find max dispatch timestamp
                    dispatch_timestamps = []
                    for d in yesterday_dispatches:
                        created = d.get("created_at", "")
                        updated = d.get("updated_at", "")
                        ts = max(created, updated) if updated else created
                        if ts:
                            dispatch_timestamps.append(ts)
                    last_dispatch_time = max(dispatch_timestamps) if dispatch_timestamps else ""
                    
                    # Build closing map
                    for record in closing_records:
                        product_id = record.get("product_id")
                        variant_id = record.get("variant_id") or ""
                        closing_qty = record.get("closing_qty", 0) or 0
                        key = f"{product_id}_{variant_id}"
                        closing_map[key] = closing_qty
                    
                    # If closing was recorded BEFORE dispatch, add dispatch items to get true ending inventory
                    if last_closing_time and last_dispatch_time and last_closing_time < last_dispatch_time:
                        dispatch_adjustment_applied = True
                        for dispatch in yesterday_dispatches:
                            for item in dispatch.get("items", []):
                                product_id = item.get("product_id")
                                variant_id = item.get("variant_id") or item.get("packaging_id") or ""
                                supplied_qty = item.get("supplied_qty", 0) or 0
                                
                                key = f"{product_id}_{variant_id}"
                                if key in closing_map:
                                    closing_map[key] += supplied_qty
                                else:
                                    key_default = f"{product_id}_"
                                    if key_default in closing_map:
                                        closing_map[key_default] += supplied_qty
                                    else:
                                        closing_map[key] = supplied_qty
                
                has_closing_data = len(closing_map) > 0
                
                # Calculate average (NO 10% buffer anymore)
                # Then subtract closing inventory to get actual requirement
                indent_items = []
                for key, data in product_weight_totals.items():
                    days_count = len(data["dates"])
                    avg_qty = data["total_qty"] / days_count
                    base_qty = round(avg_qty)  # Removed 10% buffer
                    
                    # Subtract closing inventory if available
                    product_id = data["product_id"]
                    variant_id = data["latest_variant_id"] or ""
                    closing_key = f"{product_id}_{variant_id}"
                    closing_qty = closing_map.get(closing_key, 0)
                    
                    # Also try without variant for generic match
                    if closing_qty == 0:
                        for ck, cq in closing_map.items():
                            if ck.startswith(f"{product_id}_"):
                                closing_qty = cq
                                break
                    
                    # Calculate final quantity needed: average - closing
                    recommended_qty = max(0, base_qty - closing_qty)
                    
                    if recommended_qty > 0:
                        product = product_map.get(data["product_id"], {})
                        product_id = data["product_id"]
                        
                        # Check catalogue for this product - override variant for Piece/Packet products
                        cat_info = catalogue_map.get(product_id, {})
                        purchase_unit = cat_info.get("purchase_unit", "")
                        
                        if purchase_unit == "Piece":
                            final_variant_id = "unit_piece"
                            final_variant_name = "Pieces"
                        elif purchase_unit == "Packet":
                            final_variant_id = "unit_packet"
                            final_variant_name = "Packets"
                        else:
                            # Keep original variant but resolve UUID if needed
                            final_variant_id = data["latest_variant_id"]
                            final_variant_name = data["latest_variant_name"]
                            # If variant_name looks like UUID, try to resolve it
                            if final_variant_name and len(final_variant_name) == 36 and '-' in final_variant_name:
                                resolved = packaging_name_map.get(final_variant_name, "")
                                if resolved:
                                    final_variant_name = resolved
                        
                        indent_items.append({
                            "product_id": product_id,
                            "product_name": product.get("name", data["product_name"]),
                            "variant_id": final_variant_id,
                            "variant_name": final_variant_name,
                            "quantity": recommended_qty,
                            "status": "pending"
                        })
                
                if not indent_items:
                    logger.info(f"No items to indent for {retailer_name}, skipping")
                    continue
                
                # Build remarks with closing adjustment info
                base_remarks = f"Auto-generated based on last {len(same_weekday_invoices)} {weekday_names[tomorrow_weekday]}s invoice data"
                if has_closing_data:
                    base_remarks += f" (Closing: {yesterday_str})"
                    if dispatch_adjustment_applied:
                        base_remarks += " [Dispatch items added to closing]"
                else:
                    base_remarks += " (No closing data - full historical avg)"
                
                # Create the auto-generated indent
                indent_doc = {
                    "id": str(uuid.uuid4()),
                    "retailer_id": retailer_id,
                    "retailer_name": retailer_name,
                    "indent_date": tomorrow.isoformat(),
                    "items": indent_items,
                    "status": "pending",
                    "created_by": "system",
                    "created_by_role": "system",
                    "remarks": base_remarks,
                    "is_auto_generated": True,
                    "generation_basis": "sales",  # Sales-based
                    "closing_date_used": yesterday_str if has_closing_data else None,
                    "dispatch_adjustment_applied": dispatch_adjustment_applied,
                    "last_closing_time": last_closing_time if has_closing_data else None,
                    "last_dispatch_time": last_dispatch_time if dispatch_adjustment_applied else None,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                await db.retailer_indents.insert_one(indent_doc)
                auto_indents_created += 1
                logger.info(f"Created auto-indent for {retailer_name} with {len(indent_items)} items")
                
            except Exception as e:
                logger.error(f"Error processing retailer {retailer_name}: {e}")
                import traceback
                traceback.print_exc()
                continue
        
        logger.info(f"Auto-indent generation completed. Created {auto_indents_created} indents.")
        return {"indents_created": auto_indents_created}
        
    except Exception as e:
        logger.error(f"Auto-indent generation error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


def generate_auto_indents_wrapper():
    """Wrapper to run async auto-indent generation from scheduler"""
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(generate_auto_indents_for_tomorrow())
    finally:
        loop.close()


@router.post("/admin/generate-auto-indents")
async def trigger_auto_indent_generation(current_user: dict = Depends(get_current_user)):
    """Manually trigger auto-indent generation for testing"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can trigger auto-indent generation")
    
    result = await generate_auto_indents_for_tomorrow()
    return result


@router.post("/admin/generate-auto-indent")
async def generate_single_auto_indent(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """Generate auto-indent for a single retailer based on sales history OR retail plan"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can generate auto indents")
    
    retailer_id = request.get("retailer_id")
    target_date_str = request.get("target_date")
    basis = request.get("basis", "sales")  # 'sales' or 'plan'
    
    if not retailer_id:
        raise HTTPException(status_code=400, detail="retailer_id is required")
    
    try:
        # Parse target date
        if target_date_str:
            target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        else:
            target_date = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        
        # Get retailer info
        retailer = await db.users.find_one({"id": retailer_id, "role": "retailer"}, {"_id": 0})
        if not retailer:
            raise HTTPException(status_code=404, detail="Retailer not found")
        
        retailer_name = retailer.get("company_name") or retailer.get("name", "Unknown")
        
        # Check if indent already exists for this retailer and date
        existing_indent = await db.retailer_indents.find_one({
            "retailer_id": retailer_id,
            "indent_date": target_date.isoformat()
        })
        
        if existing_indent:
            return {
                "success": False,
                "message": f"An indent already exists for {retailer_name} on {target_date.isoformat()}. Delete it first to regenerate."
            }
        
        # Handle Plan-based generation
        if basis == "plan":
            return await generate_plan_based_indent(retailer, retailer_name, target_date, current_user)
        
        # Otherwise, proceed with Sales-based generation (existing logic)
        
        # Get packaging variants for weight lookup
        packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
        packaging_weight_map = {}
        for p in packaging_variants:
            name = p.get('name', '').strip().lower()
            weight = p.get('weight_gm', 0)
            if name and weight:
                packaging_weight_map[name] = weight
        
        # Get the target weekday (0=Monday, 6=Sunday)
        target_weekday = target_date.weekday()
        weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        # Calculate the dates for the last 7 identical weekdays
        historical_dates = []
        check_date = target_date - timedelta(days=7)  # Start from 1 week ago
        while len(historical_dates) < 7 and check_date >= target_date - timedelta(days=56):  # Max 8 weeks back
            if check_date.weekday() == target_weekday:
                historical_dates.append(check_date.isoformat())
            check_date -= timedelta(days=1)
        
        # Find invoices for this retailer on those weekdays
        # Invoice dates are stored as ISO datetime strings
        invoices = await db.retailer_invoices.find({
            "retailer_id": retailer_id
        }).to_list(500)
        
        # Filter invoices for the same weekday in the last 7 weeks
        same_weekday_invoices = []
        for inv in invoices:
            try:
                inv_date_str = inv.get("invoice_date", "")
                if isinstance(inv_date_str, str):
                    inv_date = datetime.fromisoformat(inv_date_str.replace('Z', '+00:00')).date()
                else:
                    inv_date = inv_date_str.date() if hasattr(inv_date_str, 'date') else None
                
                if inv_date and inv_date.weekday() == target_weekday and inv_date < target_date:
                    # Only consider last 7 weeks
                    if inv_date >= target_date - timedelta(days=49):
                        same_weekday_invoices.append(inv)
            except Exception as e:
                logger.warning(f"Error parsing invoice date: {e}")
                continue
        
        # Use whatever data is available (even 1 invoice is fine)
        if len(same_weekday_invoices) == 0:
            return {
                "success": False,
                "message": f"No historical invoice data found for {retailer_name} on this weekday. The retailer needs to have at least one invoice for a {weekday_names[target_weekday]}."
            }
        
        # Calculate average invoice quantity per product+weight combination
        # Group by product_id + actual weight from packaging database
        # Invoice quantity = Dispatch - Rejections (the net final number)
        product_weight_totals = {}
        dates_with_data = set()
        
        for inv in same_weekday_invoices:
            inv_date_str = inv.get("invoice_date", "")[:10]
            # Parse invoice date and ensure timezone awareness for comparisons
            raw_inv_date = inv.get("invoice_date", "")
            if raw_inv_date:
                parsed_dt = datetime.fromisoformat(raw_inv_date.replace('Z', '+00:00'))
                # Ensure timezone awareness - add UTC if naive
                if parsed_dt.tzinfo is None:
                    inv_date = parsed_dt.replace(tzinfo=timezone.utc)
                else:
                    inv_date = parsed_dt
            else:
                inv_date = datetime.now(timezone.utc)
            
            for item in inv.get("items", []):
                product_id = item.get("product_id")
                product_name = item.get("product_name", "")
                variant_id = item.get("variant_id") or ""
                variant_name = item.get("variant_name") or ""
                # Use quantity from invoice (this is the final dispatched qty after rejections)
                invoice_qty = item.get("quantity", 0) or 0
                
                if product_id and invoice_qty > 0:
                    # Get actual weight - first try packaging database, then extract from name
                    variant_key = variant_name.strip().lower()
                    actual_weight_gm = packaging_weight_map.get(variant_key, 0)
                    
                    # If not found in DB, try extracting from variant name
                    if actual_weight_gm == 0:
                        extracted_weight = extract_weight_from_variant(variant_name)
                        if extracted_weight:
                            # Parse extracted weight (e.g., "250g" -> 250)
                            actual_weight_gm = int(extracted_weight.replace('g', ''))
                    
                    # Key by product_id + normalized weight bucket
                    # Normalize weight to a standard bucket (e.g., 475g → 500g bucket)
                    # This groups similar weights (within 15%) together
                    if actual_weight_gm > 0:
                        weight_bucket = normalize_weight_to_bucket(actual_weight_gm)
                        key = f"{product_id}_{weight_bucket}g"
                    else:
                        key = f"{product_id}_{variant_name}"
                    
                    if key not in product_weight_totals:
                        product_weight_totals[key] = {
                            "product_id": product_id,
                            "product_name": product_name,
                            "variant_id": variant_id,
                            "variant_name": variant_name,
                            "actual_weight_gm": actual_weight_gm,
                            "weight_bucket": weight_bucket if actual_weight_gm > 0 else 0,
                            "total_qty": 0,
                            "dates": set(),
                            "latest_invoice_date": inv_date,
                            "latest_variant_name": variant_name,
                            "latest_variant_id": variant_id
                        }
                    
                    product_weight_totals[key]["total_qty"] += invoice_qty
                    product_weight_totals[key]["dates"].add(inv_date_str)
                    dates_with_data.add(inv_date_str)
                    
                    # Track the most recent variant name for display
                    if inv_date > product_weight_totals[key]["latest_invoice_date"]:
                        product_weight_totals[key]["latest_invoice_date"] = inv_date
                        product_weight_totals[key]["latest_variant_name"] = variant_name
                        product_weight_totals[key]["latest_variant_id"] = variant_id
        
        if not product_weight_totals:
            return {
                "success": False,
                "message": f"No invoice data found for {retailer_name} on this weekday"
            }
        
        # Merge close weight variants (within 300g of each other)
        # This combines entries like Broccoli 200g, 300g, 400g into one
        # But keeps Potato 500g and 1000g separate (500g gap)
        product_weight_totals = merge_close_weight_variants(product_weight_totals, max_gap_gm=300)
        
        # ============================================
        # GET YESTERDAY'S CLOSING WITH TIMING ADJUSTMENT
        # ============================================
        yesterday_date = target_date - timedelta(days=1)
        yesterday_str = yesterday_date.isoformat()
        
        # Get yesterday's closing inventory for this retailer
        closing_records = await db.retailer_closing_inventory.find({
            "retailer_id": retailer_id,
            "closing_date": yesterday_str
        }, {"_id": 0}).to_list(500)
        
        # Get yesterday's dispatches for this retailer
        yesterday_dispatches = await db.retailer_dispatches.find({
            "retailer_id": retailer_id,
            "dispatch_date": {"$regex": f"^{yesterday_str}"}
        }, {"_id": 0}).to_list(100)
        
        # Build closing map (product_id + variant_id -> closing_qty)
        closing_map = {}
        dispatch_adjustment_applied = False
        last_closing_time = ""
        last_dispatch_time = ""
        
        if closing_records:
            # Find max closing timestamp
            closing_timestamps = [r.get("created_at", "") for r in closing_records if r.get("created_at")]
            last_closing_time = max(closing_timestamps) if closing_timestamps else ""
            
            # Find max dispatch timestamp
            dispatch_timestamps = []
            for d in yesterday_dispatches:
                created = d.get("created_at", "")
                updated = d.get("updated_at", "")
                ts = max(created, updated) if updated else created
                if ts:
                    dispatch_timestamps.append(ts)
            last_dispatch_time = max(dispatch_timestamps) if dispatch_timestamps else ""
            
            # Build closing map
            for record in closing_records:
                product_id = record.get("product_id")
                variant_id = record.get("variant_id") or ""
                closing_qty = record.get("closing_qty", 0) or 0
                key = f"{product_id}_{variant_id}"
                closing_map[key] = closing_qty
            
            # If closing was recorded BEFORE dispatch, add dispatch items to get true ending inventory
            if last_closing_time and last_dispatch_time and last_closing_time < last_dispatch_time:
                dispatch_adjustment_applied = True
                for dispatch in yesterday_dispatches:
                    for item in dispatch.get("items", []):
                        product_id = item.get("product_id")
                        variant_id = item.get("variant_id") or item.get("packaging_id") or ""
                        supplied_qty = item.get("supplied_qty", 0) or 0
                        
                        key = f"{product_id}_{variant_id}"
                        if key in closing_map:
                            closing_map[key] += supplied_qty
                        else:
                            key_default = f"{product_id}_"
                            if key_default in closing_map:
                                closing_map[key_default] += supplied_qty
                            else:
                                closing_map[key] = supplied_qty
        
        has_closing_data = len(closing_map) > 0
        
        # Create indent items: average - closing (NO 10% buffer)
        indent_items = []
        for key, data in product_weight_totals.items():
            days_count = len(data["dates"])
            avg_qty = data["total_qty"] / days_count
            base_qty = round(avg_qty)  # Removed 10% buffer
            
            # Subtract closing inventory if available
            product_id = data["product_id"]
            variant_id = data["latest_variant_id"] or ""
            closing_key = f"{product_id}_{variant_id}"
            closing_qty = closing_map.get(closing_key, 0)
            
            # Also try without variant for generic match
            if closing_qty == 0:
                for ck, cq in closing_map.items():
                    if ck.startswith(f"{product_id}_"):
                        closing_qty = cq
                        break
            
            # Calculate final quantity needed: average - closing
            recommended_qty = max(0, base_qty - closing_qty)
            
            if recommended_qty > 0:
                final_variant_id = data["latest_variant_id"] or ""
                final_variant_name = data["latest_variant_name"] or ""
                
                # If no variant_id but have variant_name, look it up
                if not final_variant_id and final_variant_name:
                    variant_name_lower = final_variant_name.strip().lower()
                    for pkg in packaging_variants:
                        if pkg.get("name", "").strip().lower() == variant_name_lower:
                            final_variant_id = pkg.get("id", "")
                            break
                
                indent_items.append({
                    "product_id": product_id,
                    "product_name": data["product_name"],
                    "variant_id": final_variant_id,
                    "variant_name": final_variant_name,
                    "quantity": recommended_qty,
                    "status": "pending"
                })
        
        if not indent_items:
            return {
                "success": False,
                "message": f"No products with positive quantities found for {retailer_name}" + (" (all items fully stocked per closing)" if has_closing_data else "")
            }
        
        # Sort by product name
        indent_items.sort(key=lambda x: x["product_name"])
        
        # Build remarks with closing adjustment info
        base_remarks = f"Auto-generated based on {len(same_weekday_invoices)} weeks of {weekday_names[target_weekday]} invoice data"
        if has_closing_data:
            base_remarks += f" (Closing: {yesterday_str})"
            if dispatch_adjustment_applied:
                base_remarks += " [Dispatch items added to closing]"
        else:
            base_remarks += " (No closing data - full historical avg)"
        
        # Create the indent
        new_indent = {
            "id": str(uuid.uuid4()),
            "retailer_id": retailer_id,
            "retailer_name": retailer_name,
            "indent_date": target_date.isoformat(),
            "items": indent_items,
            "total_qty": sum(item["quantity"] for item in indent_items),
            "status": "pending",
            "remarks": base_remarks,
            "is_auto_generated": True,
            "generation_basis": "sales",  # Historical sales based
            "closing_date_used": yesterday_str if has_closing_data else None,
            "dispatch_adjustment_applied": dispatch_adjustment_applied,
            "last_closing_time": last_closing_time if has_closing_data else None,
            "last_dispatch_time": last_dispatch_time if dispatch_adjustment_applied else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.retailer_indents.insert_one(new_indent)
        
        return {
            "success": True,
            "message": f"Auto indent created for {retailer_name} with {len(indent_items)} products (Sales Based)",
            "retailer_name": retailer_name,
            "indent_id": new_indent["id"],
            "products_count": len(indent_items),
            "total_qty": new_indent["total_qty"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating auto indent: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def generate_plan_based_indent(retailer: dict, retailer_name: str, target_date, current_user: dict):
    """Generate indent based on retailer's subscribed plan minus closing inventory"""
    retailer_id = retailer.get("id")
    
    # Check if retailer has a subscribed plan
    subscribed_plan_id = retailer.get("subscribed_plan_id")
    if not subscribed_plan_id:
        return {
            "success": False,
            "message": f"{retailer_name} is not subscribed to any Retail Plan. Please assign a plan first."
        }
    
    # Get the subscribed plan
    plan = await db.retail_plans.find_one({"id": subscribed_plan_id}, {"_id": 0})
    if not plan:
        return {
            "success": False,
            "message": f"Subscribed plan not found. Please reassign a plan to {retailer_name}."
        }
    
    plan_products = plan.get("products", [])
    if not plan_products:
        return {
            "success": False,
            "message": f"Plan '{plan.get('name')}' has no products configured."
        }
    
    # Get yesterday's closing inventory
    yesterday = (target_date - timedelta(days=1)).isoformat()
    yesterday_date_only = yesterday[:10]  # YYYY-MM-DD format
    
    closing_records = await db.retailer_closing_inventory.find({
        "retailer_id": retailer_id,
        "closing_date": yesterday_date_only
    }, {"_id": 0}).to_list(500)
    
    if not closing_records:
        return {
            "success": False,
            "message": f"No closing inventory found for {retailer_name} on {yesterday_date_only}. Closing inventory is mandatory for Plan-based orders."
        }
    
    # TIMING-BASED ADJUSTMENT:
    # 1. Find the last closing record timestamp (when closing was recorded)
    # 2. Find the last dispatch timestamp for yesterday
    # 3. If closing_time < dispatch_time: Add dispatch items to closing (dispatch arrived after closing was recorded)
    # 4. If dispatch_time <= closing_time: Use closing as-is (closing already includes dispatch)
    
    # Find max closing timestamp
    closing_timestamps = [r.get("created_at", "") for r in closing_records if r.get("created_at")]
    last_closing_time = max(closing_timestamps) if closing_timestamps else ""
    
    # Get yesterday's dispatches for this retailer
    yesterday_dispatches = await db.retailer_dispatches.find({
        "retailer_id": retailer_id,
        "dispatch_date": {"$regex": f"^{yesterday_date_only}"}
    }, {"_id": 0}).to_list(100)
    
    # Find max dispatch timestamp (use created_at or updated_at, whichever is later)
    dispatch_timestamps = []
    for d in yesterday_dispatches:
        created = d.get("created_at", "")
        updated = d.get("updated_at", "")
        # Use the later of created_at or updated_at
        ts = max(created, updated) if updated else created
        if ts:
            dispatch_timestamps.append(ts)
    
    last_dispatch_time = max(dispatch_timestamps) if dispatch_timestamps else ""
    
    # Create a map of closing inventory by product_id + variant_id
    closing_map = {}
    for record in closing_records:
        product_id = record.get("product_id")
        variant_id = record.get("variant_id") or ""
        closing_qty = record.get("closing_qty", 0)
        key = f"{product_id}_{variant_id}"
        closing_map[key] = closing_qty
    
    # If closing was recorded BEFORE dispatch, we need to add dispatch items to get true ending inventory
    # This handles the case where retailer recorded closing, then received dispatch later same day
    dispatch_adjustment_applied = False
    dispatch_items_added = []
    if last_closing_time and last_dispatch_time and last_closing_time < last_dispatch_time:
        dispatch_adjustment_applied = True
        # Add dispatch items to closing to get true ending inventory
        for dispatch in yesterday_dispatches:
            for item in dispatch.get("items", []):
                product_id = item.get("product_id")
                variant_id = item.get("variant_id") or item.get("packaging_id") or ""
                supplied_qty = item.get("supplied_qty", 0) or 0
                product_name = item.get("product_name", "")
                
                # Try multiple key formats for matching
                key = f"{product_id}_{variant_id}"
                key_empty = f"{product_id}_"
                key_unit_piece = f"{product_id}_unit_piece"
                key_unit_packet = f"{product_id}_unit_packet"
                
                key_matched = None
                if key in closing_map:
                    key_matched = key
                elif key_empty in closing_map:
                    key_matched = key_empty
                elif key_unit_piece in closing_map:
                    key_matched = key_unit_piece
                elif key_unit_packet in closing_map:
                    key_matched = key_unit_packet
                
                if key_matched:
                    closing_map[key_matched] += supplied_qty
                    dispatch_items_added.append(f"{product_name}: +{supplied_qty}")
                else:
                    # New item not in closing - add it with both original and normalized keys
                    closing_map[key] = supplied_qty
                    # Also add to empty variant key for better matching
                    if key_empty not in closing_map:
                        closing_map[key_empty] = supplied_qty
                    dispatch_items_added.append(f"{product_name}: +{supplied_qty} (new)")
    
    # Fetch retailer catalogue to get purchase_unit info for each product
    catalogue_items = await db.retailer_catalogue.find({}, {"_id": 0}).to_list(500)
    catalogue_map = {}
    for cat in catalogue_items:
        catalogue_map[cat.get("product_id")] = {
            "purchase_unit": cat.get("purchase_unit", ""),
            "purchase_weight_variant": cat.get("purchase_weight_variant", "")
        }
    
    # Build packaging name map for resolving UUID variant names
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    packaging_name_map = {p.get("id"): p.get("name", "") for p in packaging_variants}
    
    # De-duplicate plan products using BOTH product_id AND product_name as composite key
    # This ensures distinct products with similar names (e.g., "Green Chilli" vs "Light Green Chilli")
    # are NOT merged even if they accidentally share the same product_id
    # If plan has exact same product_id + product_name twice, keep FIRST occurrence only
    deduplicated_plan = {}
    for plan_item in plan_products:
        product_id = plan_item.get("product_id")
        product_name = plan_item.get("product_name", "Unknown")
        variant_id = plan_item.get("variant_id") or ""
        variant_name = plan_item.get("variant_name") or ""
        plan_qty = plan_item.get("quantity", 0)
        
        # CRITICAL FIX: Use composite key of product_id + product_name to prevent merging
        # distinct products that may accidentally share the same product_id
        composite_key = f"{product_id}|{product_name.strip()}"
        
        if composite_key not in deduplicated_plan:
            deduplicated_plan[composite_key] = {
                "product_id": product_id,
                "product_name": product_name,
                "variant_id": variant_id,
                "variant_name": variant_name,
                "quantity": plan_qty
            }
        # Skip exact duplicates (same product_id AND product_name) - don't add/sum quantities
    
    # Calculate pending quantities from de-duplicated plan
    indent_items = []
    for composite_key, plan_item in deduplicated_plan.items():
        product_id = plan_item.get("product_id")  # Extract from plan_item since key is composite
        product_name = plan_item.get("product_name", "Unknown")
        variant_id = plan_item.get("variant_id") or ""
        variant_name = plan_item.get("variant_name") or ""
        plan_qty = plan_item.get("quantity", 0)
        
        # Check catalogue for this product - override variant for Piece/Packet products
        cat_info = catalogue_map.get(product_id, {})
        purchase_unit = cat_info.get("purchase_unit", "")
        purchase_variant = cat_info.get("purchase_weight_variant", "")
        
        if purchase_unit == "Piece":
            final_variant_id = "unit_piece"
            final_variant_name = "Pieces"
        elif purchase_unit == "Packet":
            final_variant_id = "unit_packet"
            # Use the purchase_weight_variant if available for better variant name
            final_variant_name = f"Packets ({purchase_variant})" if purchase_variant else "Packets"
        else:
            # Keep original variant but resolve UUID if needed
            final_variant_id = variant_id
            final_variant_name = variant_name
            # If variant_name looks like UUID, try to resolve it
            if final_variant_name and len(final_variant_name) == 36 and '-' in final_variant_name:
                resolved = packaging_name_map.get(final_variant_name, "")
                if resolved:
                    final_variant_name = resolved
        
        # Get closing inventory for this product - try multiple key formats
        # 1. Original variant_id
        # 2. Normalized variant_id (unit_piece/unit_packet)
        # 3. Empty variant
        # 4. Just product_id prefix match
        closing_qty = 0
        
        keys_to_try = [
            f"{product_id}_{variant_id}",
            f"{product_id}_{final_variant_id}",
            f"{product_id}_",
            f"{product_id}_unit_piece",
            f"{product_id}_unit_packet"
        ]
        
        for key in keys_to_try:
            if key in closing_map and closing_map[key] > 0:
                closing_qty = closing_map[key]
                break
        
        # Also check if any key starting with product_id has stock
        if closing_qty == 0:
            for k, v in closing_map.items():
                if k.startswith(f"{product_id}_") and v > 0:
                    closing_qty = v
                    break
        
        # Calculate pending qty (Plan qty - Closing qty)
        pending_qty = max(0, plan_qty - closing_qty)
        
        if pending_qty > 0:
            indent_items.append({
                "product_id": product_id,
                "product_name": product_name,
                "variant_id": final_variant_id,
                "variant_name": final_variant_name,
                "quantity": round(pending_qty),
                "plan_qty": plan_qty,
                "closing_qty": closing_qty,
                "status": "pending"
            })
    
    if not indent_items:
        return {
            "success": False,
            "message": "All products in plan are fully stocked (closing inventory >= plan qty). No indent needed."
        }
    
    # Sort by product name
    indent_items.sort(key=lambda x: x["product_name"])
    
    # Build remarks with timing info
    remarks_base = f"Plan-based indent from '{plan.get('name')}' (Closing date: {yesterday_date_only})"
    if dispatch_adjustment_applied:
        dispatch_summary = ", ".join(dispatch_items_added[:5])
        if len(dispatch_items_added) > 5:
            dispatch_summary += f"... +{len(dispatch_items_added) - 5} more"
        remarks_base += f" [Late dispatch adjustment: {dispatch_summary}]"
    
    # Create the indent
    new_indent = {
        "id": str(uuid.uuid4()),
        "retailer_id": retailer_id,
        "retailer_name": retailer_name,
        "indent_date": target_date.isoformat(),
        "items": indent_items,
        "total_qty": sum(item["quantity"] for item in indent_items),
        "status": "pending",
        "remarks": remarks_base,
        "is_auto_generated": True,
        "generation_basis": "plan",  # Plan based
        "plan_id": subscribed_plan_id,
        "plan_name": plan.get("name"),
        "closing_date_used": yesterday_date_only,
        "dispatch_adjustment_applied": dispatch_adjustment_applied,  # Track if dispatch was added to closing
        "last_closing_time": last_closing_time,
        "last_dispatch_time": last_dispatch_time,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.retailer_indents.insert_one(new_indent)
    
    return {
        "success": True,
        "message": f"Plan-based indent created for {retailer_name} with {len(indent_items)} products",
        "retailer_name": retailer_name,
        "indent_id": new_indent["id"],
        "products_count": len(indent_items),
        "total_qty": new_indent["total_qty"],
        "plan_name": plan.get("name")
    }


@router.post("/admin/populate-hindi-names")
async def populate_hindi_product_names(current_user: dict = Depends(get_current_user)):
    """Populate Hindi names for all products in the database"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can populate Hindi names")
    
    try:
        products = await db.products.find({}).to_list(1000)
        updated_count = 0
        missing = []
        
        for product in products:
            name = product.get("name", "")
            product_id = product.get("id")
            
            if name in HINDI_PRODUCT_NAMES:
                hindi_name = HINDI_PRODUCT_NAMES[name]
                result = await db.products.update_one(
                    {"id": product_id},
                    {"$set": {"name_hi": hindi_name}}
                )
                if result.modified_count > 0:
                    updated_count += 1
            else:
                missing.append(name)
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_products": len(products),
            "missing_translations": missing[:10] if missing else [],
            "message": f"Updated {updated_count} products with Hindi names"
        }
    except Exception as e:
        print(f"Error populating Hindi names: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/populate-marathi-names")
async def populate_marathi_product_names(current_user: dict = Depends(get_current_user)):
    """Populate Marathi names for all products in the database"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can populate Marathi names")
    
    try:
        products = await db.products.find({}).to_list(1000)
        updated_count = 0
        missing = []
        
        for product in products:
            name = product.get("name", "")
            product_id = product.get("id")
            
            if name in MARATHI_PRODUCT_NAMES:
                marathi_name = MARATHI_PRODUCT_NAMES[name]
                result = await db.products.update_one(
                    {"id": product_id},
                    {"$set": {"name_mr": marathi_name}}
                )
                if result.modified_count > 0:
                    updated_count += 1
            else:
                missing.append(name)
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_products": len(products),
            "missing_translations": missing[:10] if missing else [],
            "message": f"Updated {updated_count} products with Marathi names"
        }
    except Exception as e:
        print(f"Error populating Marathi names: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/populate-all-translations")
async def populate_all_translations(current_user: dict = Depends(get_current_user)):
    """Populate both Hindi and Marathi names for all products in one call"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can populate translations")
    
    try:
        products = await db.products.find({}).to_list(1000)
        updated_hindi = 0
        updated_marathi = 0
        missing_hindi = []
        missing_marathi = []
        
        for product in products:
            name = product.get("name", "").strip()
            product_id = product.get("id")
            update_fields = {}
            
            # Check Hindi translation
            current_hi = product.get("name_hi", "") or ""
            if not current_hi:
                # Try exact match first, then try with/without trailing spaces
                hindi_name = HINDI_PRODUCT_NAMES.get(name) or HINDI_PRODUCT_NAMES.get(name + " ") or HINDI_PRODUCT_NAMES.get(name.rstrip())
                if hindi_name:
                    update_fields["name_hi"] = hindi_name
                else:
                    missing_hindi.append(name)
            
            # Check Marathi translation
            current_mr = product.get("name_mr", "") or ""
            if not current_mr:
                marathi_name = MARATHI_PRODUCT_NAMES.get(name) or MARATHI_PRODUCT_NAMES.get(name + " ") or MARATHI_PRODUCT_NAMES.get(name.rstrip())
                if marathi_name:
                    update_fields["name_mr"] = marathi_name
                else:
                    missing_marathi.append(name)
            
            # Update if we have any new translations
            if update_fields:
                result = await db.products.update_one(
                    {"id": product_id},
                    {"$set": update_fields}
                )
                if result.modified_count > 0:
                    if "name_hi" in update_fields:
                        updated_hindi += 1
                    if "name_mr" in update_fields:
                        updated_marathi += 1
        
        return {
            "success": True,
            "total_products": len(products),
            "updated_hindi": updated_hindi,
            "updated_marathi": updated_marathi,
            "missing_hindi": missing_hindi[:20] if missing_hindi else [],
            "missing_marathi": missing_marathi[:20] if missing_marathi else [],
            "message": f"Updated {updated_hindi} Hindi and {updated_marathi} Marathi translations"
        }
    except Exception as e:
        print(f"Error populating translations: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# Hindi translation dictionary for common vegetables, fruits, and produce
HINDI_TRANSLATIONS = {
    # Leafy Vegetables
    "amaranthus green": "हरा चौलाई",
    "amaranthus red": "लाल चौलाई",
    "spinach": "पालक",
    "palak": "पालक",
    "fenugreek": "मेथी",
    "methi": "मेथी",
    "coriander": "धनिया",
    "mint": "पुदीना",
    "pudina": "पुदीना",
    "curry leaves": "कड़ी पत्ता",
    "lettuce": "सलाद पत्ता",
    "iceberg lettuce": "आइसबर्ग सलाद पत्ता",
    "cabbage": "पत्ता गोभी",
    "cauliflower": "फूल गोभी",
    
    # Root Vegetables
    "potato": "आलू",
    "onion": "प्याज",
    "garlic": "लहसुन",
    "ginger": "अदरक",
    "carrot": "गाजर",
    "radish": "मूली",
    "beetroot": "चुकंदर",
    "sweet potato": "शकरकंद",
    "turnip": "शलगम",
    "raw groundnut": "कच्ची मूंगफली",
    
    # Gourds
    "bottle gourd": "लौकी",
    "lauki": "लौकी",
    "bitter gourd": "करेला",
    "karela": "करेला",
    "ridge gourd": "तोरई",
    "tori": "तोरई",
    "sponge gourd": "नेनुआ",
    "snake gourd": "चिचिंडा",
    "ash gourd": "पेठा",
    "ivy gourd": "कुंदरू",
    "pointed gourd": "परवल",
    "parwal": "परवल",
    
    # Beans & Legumes
    "french beans": "फ्रेंच बीन्स",
    "cluster beans": "ग्वार फली",
    "broad beans": "सेम",
    "green peas": "हरी मटर",
    "chana": "चना",
    
    # Brinjal Family
    "brinjal": "बैंगन",
    "eggplant": "बैंगन",
    "brinjal bharta": "भरता बैंगन",
    "brinjal green": "हरा बैंगन",
    
    # Tomatoes & Peppers
    "tomato": "टमाटर",
    "cherry tomato": "चेरी टमाटर",
    "capsicum": "शिमला मिर्च",
    "green capsicum": "हरी शिमला मिर्च",
    "red capsicum": "लाल शिमला मिर्च",
    "yellow capsicum": "पीली शिमला मिर्च",
    "red yellow capsicum": "लाल पीली शिमला मिर्च",
    "green chilli": "हरी मिर्च",
    "red chilli": "लाल मिर्च",
    
    # Cucumbers
    "cucumber": "खीरा",
    "green cucumber": "हरा खीरा",
    "english cucumber": "अंग्रेजी खीरा",
    
    # Other Vegetables
    "drumstick": "सहजन",
    "moringa": "सहजन",
    "ladyfinger": "भिंडी",
    "okra": "भिंडी",
    "bhindi": "भिंडी",
    "pumpkin": "कद्दू",
    "zucchini": "जुकिनी",
    "green & yellow zucchini": "हरी और पीली जुकिनी",
    "broccoli": "ब्रोकली",
    "baby corn": "बेबी कॉर्न",
    "sweet corn": "स्वीट कॉर्न",
    "mushroom": "मशरूम",
    "green onion": "हरा प्याज",
    "spring onion": "स्प्रिंग प्याज",
    
    # Fruits
    "apple": "सेब",
    "apple - royal gala": "रॉयल गाला सेब",
    "banana": "केला",
    "elaichi banana": "इलायची केला",
    "mango": "आम",
    "mango - hapus": "हापुस आम",
    "mango - kesar": "केसर आम",
    "orange": "संतरा",
    "mini orange": "मिनी संतरा",
    "papaya": "पपीता",
    "guava": "अमरूद",
    "watermelon": "तरबूज",
    "muskmelon": "खरबूजा",
    "grapes": "अंगूर",
    "pomegranate": "अनार",
    "pineapple": "अनानास",
    "coconut": "नारियल",
    "lemon": "नींबू",
    "lime": "नींबू",
    "kiwi": "कीवी",
    "strawberry": "स्ट्रॉबेरी",
    "fig": "अंजीर",
    "custard apple": "सीताफल",
    "jackfruit": "कटहल",
    "chikoo": "चीकू",
    "sapota": "चीकू",
}

# Marathi translation dictionary
MARATHI_TRANSLATIONS = {
    # Leafy Vegetables
    "amaranthus green": "हिरवी माठ",
    "amaranthus red": "लाल माठ",
    "spinach": "पालक",
    "palak": "पालक",
    "fenugreek": "मेथी",
    "methi": "मेथी",
    "coriander": "कोथिंबीर",
    "mint": "पुदिना",
    "curry leaves": "कढीपत्ता",
    "lettuce": "सलाद पत्ता",
    "iceberg lettuce": "आइसबर्ग सलाद पत्ता",
    "cabbage": "कोबी",
    "cauliflower": "फुलकोबी",
    
    # Root Vegetables
    "potato": "बटाटा",
    "onion": "कांदा",
    "garlic": "लसूण",
    "ginger": "आले",
    "carrot": "गाजर",
    "radish": "मुळा",
    "beetroot": "बीट",
    "sweet potato": "रताळे",
    "turnip": "सलगम",
    "raw groundnut": "कच्चा शेंगदाणा",
    
    # Gourds
    "bottle gourd": "दुधी भोपळा",
    "lauki": "दुधी भोपळा",
    "bitter gourd": "कारले",
    "karela": "कारले",
    "ridge gourd": "दोडका",
    "tori": "दोडका",
    "sponge gourd": "घोसाळे",
    "snake gourd": "पडवळ",
    "ash gourd": "कोहळा",
    "ivy gourd": "तोंडली",
    "pointed gourd": "परवर",
    "parwal": "परवर",
    
    # Beans & Legumes
    "french beans": "फ्रेंच बीन्स",
    "cluster beans": "गवार",
    "broad beans": "पावटा",
    "green peas": "हिरवे वाटाणे",
    
    # Brinjal Family
    "brinjal": "वांगे",
    "eggplant": "वांगे",
    "brinjal bharta": "भरीत वांगे",
    "brinjal green": "हिरवे वांगे",
    
    # Tomatoes & Peppers
    "tomato": "टोमॅटो",
    "cherry tomato": "चेरी टोमॅटो",
    "capsicum": "ढोबळी मिरची",
    "green capsicum": "हिरवी ढोबळी मिरची",
    "red capsicum": "लाल ढोबळी मिरची",
    "yellow capsicum": "पिवळी ढोबळी मिरची",
    "red yellow capsicum": "लाल पिवळी ढोबळी मिरची",
    "green chilli": "हिरवी मिरची",
    
    # Cucumbers
    "cucumber": "काकडी",
    "green cucumber": "हिरवी काकडी",
    
    # Other Vegetables
    "drumstick": "शेवगा",
    "moringa": "शेवगा",
    "ladyfinger": "भेंडी",
    "okra": "भेंडी",
    "bhindi": "भेंडी",
    "pumpkin": "भोपळा",
    "zucchini": "झुकिनी",
    "green & yellow zucchini": "हिरवी आणि पिवळी झुकिनी",
    "broccoli": "ब्रोकोली",
    "baby corn": "बेबी कॉर्न",
    "sweet corn": "गोड मका",
    "mushroom": "अळंबी",
    
    # Fruits
    "apple": "सफरचंद",
    "apple - royal gala": "रॉयल गाला सफरचंद",
    "banana": "केळे",
    "elaichi banana": "वेलची केळे",
    "mango": "आंबा",
    "mango - hapus": "हापूस आंबा",
    "mango - kesar": "केशर आंबा",
    "orange": "संत्रे",
    "mini orange": "लहान संत्रे",
    "papaya": "पपई",
    "guava": "पेरू",
    "watermelon": "कलिंगड",
    "muskmelon": "खरबूज",
    "grapes": "द्राक्षे",
    "pomegranate": "डाळिंब",
    "pineapple": "अननस",
    "coconut": "नारळ",
    "lemon": "लिंबू",
    "kiwi": "किवी",
    "strawberry": "स्ट्रॉबेरी",
    "fig": "अंजीर",
    "custard apple": "सीताफळ",
    "jackfruit": "फणस",
    "chikoo": "चिक्कू",
    "sapota": "चिक्कू",
}


@router.post("/admin/auto-translate-products")
async def auto_translate_products(current_user: dict = Depends(get_current_user)):
    """
    Automatically translate product names to Hindi and Marathi using built-in dictionary.
    Updates both the products table and retailer_catalogue.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can auto-translate")
    
    try:
        # Get all products
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        
        updated_products = 0
        translations_applied = []
        
        for product in products:
            product_name = product.get("name", "").lower().strip()
            product_id = product.get("id")
            current_name_hi = product.get("name_hi")
            current_name_mr = product.get("name_mr")
            
            update_fields = {}
            
            # Check if Hindi translation is missing
            if not current_name_hi:
                # Try exact match first
                if product_name in HINDI_TRANSLATIONS:
                    update_fields["name_hi"] = HINDI_TRANSLATIONS[product_name]
                else:
                    # Try partial match
                    for key, value in HINDI_TRANSLATIONS.items():
                        if key in product_name or product_name in key:
                            update_fields["name_hi"] = value
                            break
            
            # Check if Marathi translation is missing
            if not current_name_mr:
                if product_name in MARATHI_TRANSLATIONS:
                    update_fields["name_mr"] = MARATHI_TRANSLATIONS[product_name]
                else:
                    for key, value in MARATHI_TRANSLATIONS.items():
                        if key in product_name or product_name in key:
                            update_fields["name_mr"] = value
                            break
            
            # Update product if translations found
            if update_fields:
                await db.products.update_one(
                    {"id": product_id},
                    {"$set": update_fields}
                )
                updated_products += 1
                translations_applied.append({
                    "product": product.get("name"),
                    "hindi": update_fields.get("name_hi"),
                    "marathi": update_fields.get("name_mr")
                })
        
        # Now sync to retailer_catalogue
        catalogue_items = await db.retailer_catalogue.find({}, {"_id": 0}).to_list(1000)
        updated_catalogue = 0
        
        # Re-fetch updated products
        products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "name_hi": 1, "name_mr": 1}).to_list(1000)
        product_map = {p.get("id"): p for p in products}
        product_name_map = {p.get("name", "").lower().strip(): p for p in products}
        
        for item in catalogue_items:
            product_id = item.get("product_id")
            product_name = item.get("product_name", "").lower().strip()
            
            product = product_map.get(product_id) or product_name_map.get(product_name)
            
            if product:
                update_fields = {}
                if product.get("name_hi") and not item.get("product_name_hi"):
                    update_fields["product_name_hi"] = product["name_hi"]
                if product.get("name_mr") and not item.get("product_name_mr"):
                    update_fields["product_name_mr"] = product["name_mr"]
                
                if update_fields:
                    await db.retailer_catalogue.update_one(
                        {"product_id": item.get("product_id")},
                        {"$set": update_fields}
                    )
                    updated_catalogue += 1
        
        return {
            "success": True,
            "updated_products": updated_products,
            "updated_catalogue": updated_catalogue,
            "translations_applied": translations_applied[:30],  # Show first 30
            "message": f"Auto-translated {updated_products} products and synced {updated_catalogue} catalogue items"
        }
    except Exception as e:
        logger.error(f"Auto-translate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
async def sync_catalogue_translations(current_user: dict = Depends(get_current_user)):
    """Sync Hindi and Marathi translations from products table to retailer_catalogue"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can sync translations")
    
    try:
        # Get all products with translations
        products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "name_hi": 1, "name_mr": 1}).to_list(1000)
        product_map = {p.get("id"): p for p in products}
        product_name_map = {p.get("name", "").lower().strip(): p for p in products}
        
        # Get all catalogue items
        catalogue_items = await db.retailer_catalogue.find({}, {"_id": 0}).to_list(1000)
        
        updated_count = 0
        for item in catalogue_items:
            product_id = item.get("product_id")
            product_name = item.get("product_name", "")
            
            # Find matching product
            product = product_map.get(product_id) or product_name_map.get(product_name.lower().strip())
            
            if product:
                update_fields = {}
                
                # Update Hindi if missing or empty
                if product.get("name_hi") and not item.get("product_name_hi"):
                    update_fields["product_name_hi"] = product["name_hi"]
                
                # Update Marathi if missing or empty
                if product.get("name_mr") and not item.get("product_name_mr"):
                    update_fields["product_name_mr"] = product["name_mr"]
                
                # Also update translations object if it exists
                if update_fields:
                    translations = item.get("translations", {})
                    if product.get("name_hi"):
                        translations["hi"] = product["name_hi"]
                    if product.get("name_mr"):
                        translations["mr"] = product["name_mr"]
                    update_fields["translations"] = translations
                    
                    await db.retailer_catalogue.update_one(
                        {"product_id": product_id},
                        {"$set": update_fields}
                    )
                    updated_count += 1
                    print(f"Updated catalogue: {product_name} -> Hi: {update_fields.get('product_name_hi', 'N/A')}")
        
        return {
            "success": True,
            "total_catalogue_items": len(catalogue_items),
            "updated_count": updated_count,
            "message": f"Synced translations for {updated_count} catalogue items"
        }
    except Exception as e:
        print(f"Error syncing catalogue translations: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/populate-referral-codes")
async def populate_retailer_referral_codes(current_user: dict = Depends(get_current_user)):
    """Populate referral codes for all retailers that don't have one"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can populate referral codes")
    
    try:
        # Find all retailers without referral codes
        retailers = await db.users.find({
            "role": "retailer",
            "$or": [
                {"referral_code": {"$exists": False}},
                {"referral_code": None},
                {"referral_code": ""}
            ]
        }).to_list(1000)
        
        updated_count = 0
        
        for retailer in retailers:
            # Generate unique 5-digit referral code
            referral_code = ''.join(random.choices(string.digits, k=5))
            
            # Make sure it's unique
            while await db.users.find_one({"referral_code": referral_code}):
                referral_code = ''.join(random.choices(string.digits, k=5))
            
            result = await db.users.update_one(
                {"id": retailer["id"]},
                {"$set": {"referral_code": referral_code}}
            )
            
            if result.modified_count > 0:
                updated_count += 1
        
        # Count total retailers
        total_retailers = await db.users.count_documents({"role": "retailer"})
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_retailers": total_retailers,
            "message": f"Generated referral codes for {updated_count} retailers"
        }
    except Exception as e:
        print(f"Error populating referral codes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/reset-all-referral-codes")
async def reset_all_retailer_referral_codes(current_user: dict = Depends(get_current_user)):
    """Reset ALL retailer referral codes to 5-digit format"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reset referral codes")
    
    try:
        # Find ALL retailers
        retailers = await db.users.find({"role": "retailer"}).to_list(1000)
        
        updated_count = 0
        used_codes = set()
        
        for retailer in retailers:
            # Generate unique 5-digit referral code
            referral_code = ''.join(random.choices(string.digits, k=5))
            
            # Make sure it's unique (check both DB and already-assigned in this batch)
            while referral_code in used_codes or await db.users.find_one({"referral_code": referral_code, "id": {"$ne": retailer["id"]}}):
                referral_code = ''.join(random.choices(string.digits, k=5))
            
            used_codes.add(referral_code)
            
            result = await db.users.update_one(
                {"id": retailer["id"]},
                {"$set": {"referral_code": referral_code}}
            )
            
            if result.modified_count > 0:
                updated_count += 1
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_retailers": len(retailers),
            "message": f"Reset referral codes for {updated_count} retailers to 5-digit format"
        }
    except Exception as e:
        print(f"Error resetting referral codes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/run-migration/fix-uuid-variants")
async def run_uuid_variant_migration(current_user: dict = Depends(get_current_user)):
    """
    Admin endpoint to run the UUID variant fix migration.
    This fixes existing data where variant_name was stored as a UUID.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run migrations")
    
    import re
    UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
    
    results = {
        "plans_fixed": 0,
        "products_fixed": 0,
        "indents_fixed": 0,
        "indent_items_fixed": 0,
        "dispatches_fixed": 0,
        "dispatch_items_fixed": 0,
        "details": []
    }
    
    try:
        # Step 1: Build packaging lookup
        packagings = await db.qc_packaging.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        packaging_map = {p.get("id"): p.get("name", "") for p in packagings}
        results["details"].append(f"Loaded {len(packaging_map)} packaging variants")
        
        # Step 2: Fix retail_plans
        plans = await db.retail_plans.find({}, {"_id": 0}).to_list(500)
        for plan in plans:
            plan_updated = False
            products = plan.get("products", [])
            
            for product in products:
                variant_name = product.get("variant_name", "")
                variant_id = product.get("variant_id", "")
                
                if variant_name and UUID_PATTERN.match(str(variant_name)):
                    resolved = packaging_map.get(variant_name, "") or packaging_map.get(variant_id, "")
                    if resolved:
                        product["variant_name"] = resolved
                        plan_updated = True
                        results["products_fixed"] += 1
            
            if plan_updated:
                await db.retail_plans.update_one(
                    {"id": plan.get("id")},
                    {"$set": {"products": products}}
                )
                results["plans_fixed"] += 1
        
        # Step 3: Fix retailer_indents (auto-generated)
        indents = await db.retailer_indents.find({"is_auto_generated": True}, {"_id": 0}).to_list(10000)
        for indent in indents:
            indent_updated = False
            items = indent.get("items", [])
            
            for item in items:
                variant_name = item.get("variant_name", "")
                variant_id = item.get("variant_id", "")
                
                if variant_name and UUID_PATTERN.match(str(variant_name)):
                    resolved = packaging_map.get(variant_name, "") or packaging_map.get(variant_id, "")
                    if resolved:
                        item["variant_name"] = resolved
                        indent_updated = True
                        results["indent_items_fixed"] += 1
            
            if indent_updated:
                await db.retailer_indents.update_one(
                    {"id": indent.get("id")},
                    {"$set": {"items": items}}
                )
                results["indents_fixed"] += 1
        
        # Step 4: Fix retailer_dispatches
        dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(10000)
        for dispatch in dispatches:
            dispatch_updated = False
            items = dispatch.get("items", [])
            
            for item in items:
                variant_name = item.get("variant_name", "")
                variant_id = item.get("variant_id", "")
                
                if variant_name and UUID_PATTERN.match(str(variant_name)):
                    resolved = packaging_map.get(variant_name, "") or packaging_map.get(variant_id, "")
                    if resolved:
                        item["variant_name"] = resolved
                        dispatch_updated = True
                        results["dispatch_items_fixed"] += 1
            
            if dispatch_updated:
                await db.retailer_dispatches.update_one(
                    {"id": dispatch.get("id")},
                    {"$set": {"items": items}}
                )
                results["dispatches_fixed"] += 1
        
        results["success"] = True
        results["message"] = f"Migration complete! Fixed {results['products_fixed']} plan products, {results['indent_items_fixed']} indent items, {results['dispatch_items_fixed']} dispatch items"
        
    except Exception as e:
        results["success"] = False
        results["error"] = str(e)
        logger.error(f"Migration error: {e}")
    
    return results


@router.post("/admin/run-migration/fix-dispatch-ids")
async def fix_dispatch_ids_migration(current_user: dict = Depends(get_current_user)):
    """
    One-time migration to fix dispatch_ids stored as stringified arrays.
    Converts "['id1','id2']" to proper arrays ['id1', 'id2'].
    
    Also ensures all dispatch_ids are always proper arrays going forward.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can run migrations")
    
    results = {
        "invoices_checked": 0,
        "invoices_fixed": 0,
        "examples_before": [],
        "examples_after": []
    }
    
    try:
        import ast
        
        # Find all invoices
        invoices = await db.retailer_invoices.find({}, {"_id": 0, "id": 1, "invoice_number": 1, "dispatch_ids": 1}).to_list(None)
        results["invoices_checked"] = len(invoices)
        
        for inv in invoices:
            invoice_id = inv.get("id")
            raw_dispatch_ids = inv.get("dispatch_ids")
            
            # Check if it needs fixing
            if isinstance(raw_dispatch_ids, str):
                # Store example before
                if len(results["examples_before"]) < 5:
                    results["examples_before"].append({
                        "invoice_number": inv.get("invoice_number"),
                        "dispatch_ids_before": raw_dispatch_ids
                    })
                
                # Normalize the dispatch_ids
                normalized = normalize_dispatch_ids(raw_dispatch_ids)
                
                # Update the invoice
                await db.retailer_invoices.update_one(
                    {"id": invoice_id},
                    {"$set": {"dispatch_ids": normalized}}
                )
                
                results["invoices_fixed"] += 1
                
                # Store example after
                if len(results["examples_after"]) < 5:
                    results["examples_after"].append({
                        "invoice_number": inv.get("invoice_number"),
                        "dispatch_ids_after": normalized
                    })
        
        results["success"] = True
        results["message"] = f"Fixed {results['invoices_fixed']} out of {results['invoices_checked']} invoices"
        
    except Exception as e:
        results["success"] = False
        results["error"] = str(e)
        logger.error(f"Migration error: {e}")
    
    return results
async def get_retailer_immediately_payable(
    retailer_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate immediately payable amounts based on 5-day credit period:
    1. 50% of today's invoice amounts (delivery today)
    2. Remaining 50% of invoices delivered 5 days ago (adjusted for rejections/commission)
    3. Any overdue amounts (>5 days with pending/partial status)
    
    NOTE: Final payable = gross_value - rejection_amount - commission_amount
    Rejections are fetched from retailer_rejections collection by date+retailer
    """
    from datetime import timedelta
    
    # Determine retailer ID
    if current_user.get("role") == "retailer":
        retailer_id = current_user.get("user_id")
    elif not retailer_id:
        pass
    
    # Get today's date in IST
    ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(ist).date()
    
    # Build query for invoices
    query = {"status": {"$in": ["pending", "partial"]}}
    if retailer_id:
        query["retailer_id"] = retailer_id
    
    # Fetch all invoices
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).to_list(1000)
    
    # Fetch all rejections for these retailers to calculate actual rejection amounts
    retailer_ids = list(set(inv.get("retailer_id") for inv in invoices if inv.get("retailer_id")))
    
    # Fetch upfront_collection_percentage for all retailers involved
    retailers_data = await db.users.find(
        {"id": {"$in": retailer_ids}},
        {"_id": 0, "id": 1, "upfront_collection_percentage": 1}
    ).to_list(1000)
    retailer_upfront_map = {r["id"]: r.get("upfront_collection_percentage", 50) for r in retailers_data}
    rejections = await db.retailer_rejections.find(
        {"retailer_id": {"$in": retailer_ids}},
        {"_id": 0, "retailer_id": 1, "rejection_date": 1, "rejection_value": 1}
    ).to_list(10000)
    
    # Group rejections by retailer_id and date
    rejection_map = {}  # (retailer_id, date_str) -> total_rejection
    for rej in rejections:
        rej_date = rej.get("rejection_date")
        if isinstance(rej_date, datetime):
            rej_date_str = rej_date.date().isoformat()
        elif isinstance(rej_date, str):
            rej_date_str = rej_date[:10]
        else:
            continue
        
        key = (rej.get("retailer_id"), rej_date_str)
        if key not in rejection_map:
            rejection_map[key] = 0
        rejection_map[key] += (rej.get("rejection_value", 0) or 0)
    
    # Initialize result structure
    result = {
        "today_50_percent": [],
        "pending_50_percent_recent": [],  # 50% not paid from last 1-4 days
        "due_today_remaining": [],
        "overdue": [],
        "totals": {
            "today_50_percent_total": 0,
            "pending_50_percent_recent_total": 0,
            "due_today_remaining_total": 0,
            "overdue_total": 0,
            "grand_total": 0
        }
    }
    
    for inv in invoices:
        # Parse invoice date
        inv_date = inv.get("invoice_date")
        if isinstance(inv_date, str):
            inv_date_str = inv_date[:10]
            inv_date = datetime.fromisoformat(inv_date_str).date()
        elif isinstance(inv_date, datetime):
            inv_date_str = inv_date.date().isoformat()
            inv_date = inv_date.date()
        else:
            continue
        
        # Use the invoice's stored values for consistency with Payment Summary
        gross_value = inv.get("gross_value", 0) or 0
        rejection_amount = inv.get("rejection_amount", 0) or 0
        commission_amount = inv.get("commission_amount", 0) or 0
        paid_amount = inv.get("paid_amount", 0) or 0
        total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        
        # Use stored net_payable if available, otherwise calculate
        net_payable = inv.get("net_payable", 0) or 0
        if net_payable <= 0:
            # Fallback calculation
            net_payable = gross_value - rejection_amount - commission_amount
        
        # Final payable after credit notes adjustment
        final_payable = net_payable - total_credit_adjusted
        
        # Pending amount
        pending_amount = max(0, final_payable - paid_amount)
        if pending_amount <= 0:
            continue
        
        # Get retailer's upfront percentage (100 = 100% upfront, 50 = standard 50% upfront)
        upfront_pct = retailer_upfront_map.get(inv.get("retailer_id"), 50)
        is_full_upfront = upfront_pct == 100
        
        # Days since invoice
        days_since = (today - inv_date).days
        upfront_portion = final_payable * (upfront_pct / 100)
        
        entry = {
            "invoice_id": inv.get("id"),
            "invoice_number": inv.get("invoice_number"),
            "invoice_date": inv_date_str,
            "retailer_id": inv.get("retailer_id"),
            "retailer_name": inv.get("retailer_name"),
            "gross_value": gross_value,
            "rejection_amount": rejection_amount,
            "commission_amount": round(commission_amount, 2),
            "net_payable": round(net_payable, 2),
            "credit_adjusted": round(total_credit_adjusted, 2),
            "final_payable": round(final_payable, 2),
            "paid_amount": paid_amount,
            "pending_amount": round(pending_amount, 2),
            "status": inv.get("status"),
            "days_since_invoice": days_since
        }
        
        # For 100% upfront retailers: ALL pending amount is due immediately
        if is_full_upfront:
            entry["due_amount"] = round(pending_amount, 2)
            if days_since == 0:
                entry["reason"] = "100% upfront on delivery"
            else:
                entry["reason"] = f"100% upfront - {days_since} day(s) overdue"
                entry["overdue_days"] = days_since
            result["today_50_percent"].append(entry)
            result["totals"]["today_50_percent_total"] += pending_amount
        else:
            # Standard logic for partial upfront (50% or other)
            # First, always check if upfront portion was paid
            unpaid_upfront = max(0, upfront_portion - paid_amount)
            
            if days_since == 0:
                due_amount = min(upfront_portion, pending_amount)
                entry["due_amount"] = round(due_amount, 2)
                entry["reason"] = f"{upfront_pct}% upfront on delivery"
                result["today_50_percent"].append(entry)
                result["totals"]["today_50_percent_total"] += due_amount
            
            elif days_since >= 1 and days_since <= 4:
                # Check if upfront was paid
                if unpaid_upfront > 0:
                    entry["due_amount"] = round(unpaid_upfront, 2)
                    entry["reason"] = f"Unpaid {upfront_pct}% from {days_since} day(s) ago"
                    entry["days_ago"] = days_since
                    result["pending_50_percent_recent"].append(entry)
                    result["totals"]["pending_50_percent_recent_total"] += unpaid_upfront
                
            elif days_since == 5:
                # Day 5: Credit period ends
                # If upfront was never paid, it still counts as pending upfront
                if unpaid_upfront > 0:
                    entry_upfront = {**entry}
                    entry_upfront["due_amount"] = round(unpaid_upfront, 2)
                    entry_upfront["reason"] = f"Unpaid {upfront_pct}% from {days_since} day(s) ago (credit period ended)"
                    entry_upfront["days_ago"] = days_since
                    result["pending_50_percent_recent"].append(entry_upfront)
                    result["totals"]["pending_50_percent_recent_total"] += unpaid_upfront
                    # The remaining credit portion is due today
                    remaining_credit = pending_amount - unpaid_upfront
                    if remaining_credit > 0:
                        entry_credit = {**entry}
                        entry_credit["due_amount"] = round(remaining_credit, 2)
                        entry_credit["reason"] = "Remaining credit after 5-day period"
                        result["due_today_remaining"].append(entry_credit)
                        result["totals"]["due_today_remaining_total"] += remaining_credit
                else:
                    # Upfront was paid, only credit portion is due
                    entry["due_amount"] = round(pending_amount, 2)
                    entry["reason"] = "Remaining amount after 5-day credit period"
                    result["due_today_remaining"].append(entry)
                    result["totals"]["due_today_remaining_total"] += pending_amount
                    
            elif days_since > 5:
                # Overdue: If upfront was never paid, track it separately
                if unpaid_upfront > 0:
                    entry_upfront = {**entry}
                    entry_upfront["due_amount"] = round(unpaid_upfront, 2)
                    entry_upfront["reason"] = f"Unpaid {upfront_pct}% from {days_since} day(s) ago (overdue)"
                    entry_upfront["days_ago"] = days_since
                    result["pending_50_percent_recent"].append(entry_upfront)
                    result["totals"]["pending_50_percent_recent_total"] += unpaid_upfront
                    # The remaining is overdue credit
                    remaining_overdue = pending_amount - unpaid_upfront
                    if remaining_overdue > 0:
                        entry_overdue = {**entry}
                        entry_overdue["due_amount"] = round(remaining_overdue, 2)
                        entry_overdue["reason"] = f"Overdue credit by {days_since - 5} days"
                        entry_overdue["overdue_days"] = days_since - 5
                        result["overdue"].append(entry_overdue)
                        result["totals"]["overdue_total"] += remaining_overdue
                else:
                    # Upfront was paid, full pending is overdue credit
                    entry["due_amount"] = round(pending_amount, 2)
                    entry["reason"] = f"Overdue by {days_since - 5} days"
                    entry["overdue_days"] = days_since - 5
                    result["overdue"].append(entry)
                    result["totals"]["overdue_total"] += pending_amount
    
    # Sort
    result["today_50_percent"].sort(key=lambda x: x["invoice_date"], reverse=True)
    result["pending_50_percent_recent"].sort(key=lambda x: x.get("days_ago", 0))  # Sort by days ago (oldest first)
    result["due_today_remaining"].sort(key=lambda x: x["invoice_date"], reverse=True)
    result["overdue"].sort(key=lambda x: x.get("overdue_days", 0), reverse=True)
    
    # Calculate grand total (include pending 50% from recent days)
    result["totals"]["grand_total"] = round(
        result["totals"]["today_50_percent_total"] + 
        result["totals"]["pending_50_percent_recent_total"] +
        result["totals"]["due_today_remaining_total"] + 
        result["totals"]["overdue_total"], 2
    )
    result["totals"]["today_50_percent_total"] = round(result["totals"]["today_50_percent_total"], 2)
    result["totals"]["pending_50_percent_recent_total"] = round(result["totals"]["pending_50_percent_recent_total"], 2)
    result["totals"]["due_today_remaining_total"] = round(result["totals"]["due_today_remaining_total"], 2)
    result["totals"]["overdue_total"] = round(result["totals"]["overdue_total"], 2)
    
    return result


@router.get("/retailer-payment-details")
async def get_retailer_payment_details(
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment details aggregated by date for the retailer portal.
    Shows dates where payment is pending (either 50% upfront or final payment).
    Each row: Date, 50% Upfront Payment, Final Payment
    Click on a row to see item-level breakdown.
    """
    from datetime import timedelta
    
    # Get retailer ID from current user
    if current_user.get("role") != "retailer":
        raise HTTPException(status_code=403, detail="Only retailers can access this endpoint")
    
    retailer_id = current_user.get("user_id")
    if not retailer_id:
        raise HTTPException(status_code=400, detail="Retailer ID not found")
    
    # Get retailer info for commission percentage and upfront collection percentage
    retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0, "commission_percentage": 1, "upfront_collection_percentage": 1})
    commission_percentage = retailer.get("commission_percentage", 0) if retailer else 0
    upfront_pct = retailer.get("upfront_collection_percentage", 50) if retailer else 50
    is_full_upfront = upfront_pct == 100
    
    # Get today's date in IST
    ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(ist).date()
    
    # Build query - include all invoices if date filter is applied, otherwise only pending/partial
    query = {
        "retailer_id": retailer_id
    }
    
    # If date filters are provided, show all invoices in that range (including paid ones)
    # Otherwise, only show pending/partial invoices
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["invoice_date"] = date_query
    else:
        # Default: only pending/partial invoices
        query["status"] = {"$in": ["pending", "partial"]}
    
    # Fetch invoices
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).sort("invoice_date", -1).to_list(500)
    
    # Fetch all rejections for this retailer to enrich item data
    all_rejections = await db.retailer_rejections.find(
        {"retailer_id": retailer_id},
        {"_id": 0, "product_id": 1, "product_name": 1, "rejection_date": 1, "quantity": 1, "rejection_value": 1}
    ).to_list(10000)
    
    # Group rejections by date and product for quick lookup
    rejection_map = {}  # (date_str, product_id_or_name) -> {qty, value}
    for rej in all_rejections:
        rej_date = rej.get("rejection_date")
        if isinstance(rej_date, datetime):
            rej_date_str = rej_date.date().isoformat()
        elif isinstance(rej_date, str):
            rej_date_str = rej_date[:10]
        else:
            continue
        
        product_key = rej.get("product_id") or rej.get("product_name", "").strip()
        if not product_key:
            continue
            
        key = (rej_date_str, product_key)
        if key not in rejection_map:
            rejection_map[key] = {"qty": 0, "value": 0}
        rejection_map[key]["qty"] += rej.get("quantity", 0) or 0
        rejection_map[key]["value"] += rej.get("rejection_value", 0) or 0
    
    # Also fetch payments for this retailer to show payment history
    all_payments = await db.retailer_payments.find(
        {"retailer_id": retailer_id},
        {"_id": 0, "invoice_id": 1, "amount": 1, "payment_date": 1, "payment_mode": 1, "remarks": 1}
    ).to_list(10000)
    
    # Group payments by invoice_id
    payments_map = {}  # invoice_id -> [{amount, date, mode, remarks}]
    for pmt in all_payments:
        inv_id = pmt.get("invoice_id")
        if not inv_id:
            continue
        if inv_id not in payments_map:
            payments_map[inv_id] = []
        payments_map[inv_id].append({
            "amount": pmt.get("amount", 0),
            "payment_date": pmt.get("payment_date"),
            "payment_mode": pmt.get("payment_mode", ""),
            "remarks": pmt.get("remarks", "")
        })
    
    # Fetch pending credit notes for ALL retailers (not just 100% upfront)
    credit_notes = await db.retailer_credit_notes.find(
        {"retailer_id": retailer_id, "status": {"$in": ["pending", "partial"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Group invoices by date and aggregate
    date_aggregates = {}  # date_str -> {invoices: [...], totals: {...}}
    
    for inv in invoices:
        # Parse invoice date
        inv_date = inv.get("invoice_date")
        if isinstance(inv_date, str):
            date_str = inv_date[:10]
        elif isinstance(inv_date, datetime):
            date_str = inv_date.date().isoformat()
        else:
            continue
        
        # Get invoice values for display
        gross_value = inv.get("gross_value", 0) or 0
        rejection_amount = inv.get("rejection_amount", 0) or 0
        commission_amount = inv.get("commission_amount", 0) or 0
        paid_amount = inv.get("paid_amount", 0) or 0
        
        # Use shared helper for payment bucket calculation (includes credit adjustment and overdue-aware logic)
        buckets = compute_invoice_payment_buckets(inv, today, upfront_pct)
        
        upfront_due = buckets["upfront_due"]
        final_due = buckets["final_due"]
        pending_amount = buckets["pending_amount"]
        final_payable = buckets["final_payable"]
        days_since = buckets["days_since"]
        is_all_clear = buckets["is_all_clear"]
        
        # Initialize date entry if not exists
        if date_str not in date_aggregates:
            date_aggregates[date_str] = {
                "date": date_str,
                "invoices": [],
                "upfront_50_total": 0,
                "final_payment_total": 0,
                "total_pending": 0
            }
        
        # Enrich items with rejection data - PRIORITY: item's own data first, then lookup
        enriched_items = []
        for item in inv.get("items", []):
            product_id = item.get("product_id")
            product_name = (item.get("product_name") or "").strip()
            supplied_qty = item.get("supplied_qty") or item.get("quantity") or 0
            
            # Clone item
            enriched_item = dict(item)
            
            # PRIORITY 1: Use item's own rejection data if it exists (from invoice sync)
            # Check both field names: rejected_qty and rejection_qty (inconsistency in codebase)
            item_rejected_qty = item.get("rejected_qty") or item.get("rejection_qty")
            item_rejection_value = item.get("rejection_value")
            
            if item_rejected_qty is not None and item_rejected_qty > 0:
                # Use the synced data from the invoice item itself
                # Cap at supplied qty to prevent negative billable
                enriched_item["rejected_qty"] = min(float(item_rejected_qty), float(supplied_qty))
                enriched_item["rejection_value"] = item_rejection_value or 0
            else:
                # PRIORITY 2: Look up rejection by product_id first, then by name
                item_rejection = None
                if product_id:
                    item_rejection = rejection_map.get((date_str, product_id))
                if not item_rejection and product_name:
                    item_rejection = rejection_map.get((date_str, product_name))
                
                if item_rejection:
                    # Cap rejection at supplied qty - never more than what was supplied
                    rejected_qty = min(float(item_rejection["qty"]), float(supplied_qty))
                    enriched_item["rejected_qty"] = rejected_qty
                    # Recalculate rejection value based on capped qty
                    mrp = item.get("mrp", 0) or 0
                    enriched_item["rejection_value"] = rejected_qty * mrp
                else:
                    enriched_item["rejected_qty"] = 0
                    enriched_item["rejection_value"] = 0
            
            enriched_items.append(enriched_item)
        
        # Get payment history for this invoice
        invoice_payments = payments_map.get(inv.get("id"), [])
        
        # Add invoice to the date
        date_aggregates[date_str]["invoices"].append({
            "invoice_id": inv.get("id"),
            "invoice_number": inv.get("invoice_number"),
            "gross_value": round(gross_value, 2),
            "rejection_amount": round(rejection_amount, 2),
            "net_value": round(gross_value - rejection_amount, 2),
            "commission_amount": round(commission_amount, 2),
            "final_payable": round(final_payable, 2),
            "paid_amount": round(paid_amount, 2),
            "pending_amount": round(pending_amount, 2),
            "upfront_due": round(upfront_due, 2),
            "final_due": round(final_due, 2),
            "days_since": days_since,
            "items": enriched_items,
            "payments": invoice_payments,
            "is_all_clear": is_all_clear
        })
        
        date_aggregates[date_str]["upfront_50_total"] += upfront_due
        date_aggregates[date_str]["final_payment_total"] += final_due
        date_aggregates[date_str]["total_pending"] += pending_amount
    
    # Convert to list and sort by date descending
    result_list = []
    for date_str, data in date_aggregates.items():
        # Check if all invoices for this date are all_clear
        all_invoices_clear = all(inv.get("is_all_clear", False) for inv in data["invoices"])
        result_list.append({
            "date": date_str,
            "upfront_50_total": round(data["upfront_50_total"], 2),
            "final_payment_total": round(data["final_payment_total"], 2),
            "total_pending": round(data["total_pending"], 2),
            "invoice_count": len(data["invoices"]),
            "invoices": data["invoices"],
            "is_all_clear": all_invoices_clear
        })
    
    # Sort by date descending
    result_list.sort(key=lambda x: x["date"], reverse=True)
    
    # Calculate grand totals
    grand_upfront = sum(d["upfront_50_total"] for d in result_list)
    grand_final = sum(d["final_payment_total"] for d in result_list)
    grand_pending = sum(d["total_pending"] for d in result_list)
    
    # Calculate total pending credit from credit notes
    total_pending_credit = sum(cn.get("pending_amount", 0) or 0 for cn in credit_notes)
    
    return {
        "dates": result_list,
        "totals": {
            "upfront_50_total": round(grand_upfront, 2),
            "final_payment_total": round(grand_final, 2),
            "grand_total": round(grand_upfront + grand_final, 2),
            "total_pending": round(grand_pending, 2),
            "total_pending_credit": round(total_pending_credit, 2),
            "net_payable": round(max(0, grand_upfront + grand_final - total_pending_credit), 2)
        },
        "commission_percentage": commission_percentage,
        "upfront_collection_percentage": upfront_pct,
        "is_full_upfront": is_full_upfront,
        "credit_notes": credit_notes
    }


@router.get("/retailer-payment-summary")
async def get_retailer_payment_summary(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment summary for a retailer with all invoices and their payment status.
    Used by both admin and retailer portal.
    Returns full invoice breakdown: Gross, Reject, MRP, Comm, Payable, Paid, Net Due
    """
    # Determine retailer_id based on role
    if current_user.get("role") == "retailer":
        retailer_id = current_user.get("user_id")
    elif not retailer_id:
        raise HTTPException(status_code=400, detail="retailer_id is required for admin")
    
    # Build query
    query = {"retailer_id": retailer_id}
    
    # Date filtering
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["invoice_date"] = date_query
    
    # Fetch invoices with full details
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).sort("invoice_date", -1).to_list(500)
    
    # Calculate totals - use final_payable if credit notes were adjusted
    total_gross = sum(inv.get("gross_value", 0) or 0 for inv in invoices)
    total_reject = sum(inv.get("rejection_amount", 0) or 0 for inv in invoices)
    total_mrp = sum(inv.get("total_mrp_value", 0) or 0 for inv in invoices)
    total_commission = sum(inv.get("commission_amount", 0) or 0 for inv in invoices)
    total_credit_adjusted = sum(inv.get("total_credit_adjusted", 0) or 0 for inv in invoices)
    # Use final_payable (after credit notes) if available, otherwise net_payable
    total_payable = sum((inv.get("final_payable") if inv.get("final_payable") is not None else inv.get("net_payable", 0)) or 0 for inv in invoices)
    total_paid = sum(inv.get("paid_amount", 0) or 0 for inv in invoices)
    total_net_due = total_payable - total_paid
    
    # Full invoice data for table display
    invoice_list = []
    for idx, inv in enumerate(invoices):
        gross = inv.get("gross_value", 0) or 0
        reject = inv.get("rejection_amount", 0) or 0
        mrp = inv.get("total_mrp_value", 0) or 0
        commission = inv.get("commission_amount", 0) or 0
        credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        # Use final_payable (after credit notes) if available, otherwise net_payable
        payable = (inv.get("final_payable") if inv.get("final_payable") is not None else inv.get("net_payable", 0)) or 0
        paid = inv.get("paid_amount", 0) or 0
        net_due = payable - paid
        
        invoice_list.append({
            "serial_num": idx + 1,
            "id": inv.get("id"),
            "invoice_number": inv.get("invoice_number"),
            "invoice_date": inv.get("invoice_date"),
            "dispatch_date": inv.get("dispatch_date") or inv.get("invoice_date"),
            "gross_value": round(gross, 2),
            "rejection_amount": round(reject, 2),
            "total_mrp_value": round(mrp, 2),
            "commission_amount": round(commission, 2),
            "net_payable": round(inv.get("net_payable", 0) or 0, 2),
            "total_credit_adjusted": round(credit_adjusted, 2),
            "final_payable": round(payable, 2),
            "paid_amount": round(paid, 2),
            "net_due": round(net_due, 2),
            "payment_status": inv.get("payment_status", inv.get("status", "pending")),
            "payment_date": inv.get("payment_date")
        })
    
    return {
        "retailer_id": retailer_id,
        "total_invoices": len(invoice_list),
        "totals": {
            "gross_value": round(total_gross, 2),
            "rejection_amount": round(total_reject, 2),
            "total_mrp_value": round(total_mrp, 2),
            "commission_amount": round(total_commission, 2),
            "total_credit_adjusted": round(total_credit_adjusted, 2),
            "net_payable": round(total_payable, 2),
            "paid_amount": round(total_paid, 2),
            "net_due": round(total_net_due, 2)
        },
        "invoices": invoice_list
    }


@router.get("/retailer-payment-ledger")
async def get_retailer_payment_ledger(
    retailer_id: str = None,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment ledger for a retailer showing all payments received date-wise.
    Payments with same reference number are grouped together.
    Also shows which invoices each payment was adjusted against.
    """
    # Determine retailer_id based on role
    if current_user.get("role") == "retailer":
        retailer_id = current_user.get("user_id")
    elif not retailer_id:
        raise HTTPException(status_code=400, detail="retailer_id is required for admin")
    
    # Build query for payments
    query = {"retailer_id": retailer_id}
    
    # Date filtering on payment_date
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        query["payment_date"] = date_query
    
    # Fetch all payments for this retailer
    payments = await db.retailer_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    
    # Also fetch credit note adjustments
    credit_notes = await db.retailer_credit_notes.find(
        {"retailer_id": retailer_id, "status": {"$in": ["adjusted", "partial"]}},
        {"_id": 0}
    ).to_list(500)
    
    # Fetch all invoices for this retailer to get invoice numbers
    invoices = await db.retailer_invoices.find(
        {"retailer_id": retailer_id},
        {"_id": 0, "id": 1, "invoice_number": 1, "invoice_date": 1, "net_payable": 1}
    ).to_list(1000)
    invoice_map = {inv["id"]: inv for inv in invoices}
    
    # Group payments by date and then by reference number
    date_groups = {}
    
    for payment in payments:
        payment_date = payment.get("payment_date", "")[:10] if payment.get("payment_date") else "Unknown"
        ref_num = payment.get("reference_number") or payment.get("remarks") or "No Reference"
        
        if payment_date not in date_groups:
            date_groups[payment_date] = {
                "date": payment_date,
                "total_amount": 0,
                "payment_groups": {},  # Grouped by reference number
                "credit_notes": []
            }
        
        # Group by reference number
        if ref_num not in date_groups[payment_date]["payment_groups"]:
            date_groups[payment_date]["payment_groups"][ref_num] = {
                "reference_number": ref_num,
                "payment_mode": payment.get("payment_mode", ""),
                "total_amount": 0,
                "payments": [],
                "invoice_adjustments": []
            }
        
        group = date_groups[payment_date]["payment_groups"][ref_num]
        group["total_amount"] += payment.get("amount", 0)
        date_groups[payment_date]["total_amount"] += payment.get("amount", 0)
        
        # Add invoice adjustment info
        invoice_id = payment.get("invoice_id")
        if invoice_id and invoice_id in invoice_map:
            inv = invoice_map[invoice_id]
            group["invoice_adjustments"].append({
                "invoice_id": invoice_id,
                "invoice_number": inv.get("invoice_number"),
                "invoice_date": inv.get("invoice_date"),
                "invoice_payable": inv.get("net_payable", 0),
                "amount_adjusted": payment.get("amount", 0),
                "payment_date": payment.get("payment_date"),
                "payment_mode": payment.get("payment_mode", "")
            })
        
        group["payments"].append({
            "id": payment.get("id"),
            "amount": payment.get("amount", 0),
            "payment_mode": payment.get("payment_mode", ""),
            "payment_date": payment.get("payment_date"),
            "invoice_id": invoice_id,
            "invoice_number": invoice_map.get(invoice_id, {}).get("invoice_number") if invoice_id else None,
            "remarks": payment.get("remarks", "")
        })
    
    # Add credit notes to respective dates
    total_credit_notes_applied = 0
    for cn in credit_notes:
        # Try both field names for backward compatibility
        adjustments = cn.get("adjusted_in_invoices", []) or cn.get("adjusted_against_invoices", [])
        for adj in adjustments:
            adj_date = adj.get("adjusted_at", "")[:10] if adj.get("adjusted_at") else None
            adj_amount = adj.get("adjusted_amount", adj.get("amount", 0)) or 0
            total_credit_notes_applied += adj_amount
            
            if adj_date and adj_date in date_groups:
                date_groups[adj_date]["credit_notes"].append({
                    "credit_note_id": cn.get("id"),
                    "credit_note_number": cn.get("credit_note_number"),
                    "original_invoice": cn.get("original_invoice_number"),
                    "amount": adj_amount,
                    "adjusted_against_invoice_id": adj.get("invoice_id"),
                    "adjusted_against_invoice_number": adj.get("invoice_number") or invoice_map.get(adj.get("invoice_id"), {}).get("invoice_number"),
                    "adjusted_at": adj.get("adjusted_at")
                })
    
    # Convert to list and sort by date descending
    result_list = []
    for date_str, data in sorted(date_groups.items(), reverse=True):
        # Convert payment_groups dict to list
        payment_groups_list = list(data["payment_groups"].values())
        result_list.append({
            "date": date_str,
            "total_amount": round(data["total_amount"], 2),
            "payment_count": sum(len(pg["payments"]) for pg in payment_groups_list),
            "payment_groups": payment_groups_list,
            "credit_notes": data["credit_notes"]
        })
    
    # Calculate grand totals
    grand_total = sum(d["total_amount"] for d in result_list)
    # Use the tracked total_credit_notes_applied (already calculated above)
    
    return {
        "retailer_id": retailer_id,
        "date_range": {
            "start": start_date,
            "end": end_date
        },
        "grand_total": round(grand_total, 2),
        "total_credit_notes_applied": round(total_credit_notes_applied, 2),
        "total_transactions": sum(d["payment_count"] for d in result_list),
        "dates": result_list
    }


@router.get("/admin/all-retailers-immediately-payable")
async def get_all_retailers_immediately_payable(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get immediately payable summary for all retailers OR a specific retailer (Admin only)
    Uses dynamic rejection lookup to calculate actual final payable amounts.
    Final payable = gross_value - rejections - commission (on net after rejections)
    """
    # Check if admin
    if current_user.get("role") not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    from datetime import timedelta
    
    # Get today's date in IST
    ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(ist).date()
    
    # Fetch all retailers to get company_name (shop name) and upfront_collection_percentage
    all_retailers = await db.users.find({"role": "retailer"}, {"_id": 0, "id": 1, "name": 1, "company_name": 1, "upfront_collection_percentage": 1}).to_list(1000)
    retailer_map = {r["id"]: r.get("company_name") or r.get("name", "Unknown") for r in all_retailers}
    retailer_upfront_map = {r["id"]: r.get("upfront_collection_percentage", 50) for r in all_retailers}
    
    # Build invoice query - filter by retailer if specified
    invoice_query = {"status": {"$in": ["pending", "partial"]}}
    if retailer_id:
        invoice_query["retailer_id"] = retailer_id
    
    # Fetch unpaid/partial invoices
    invoices = await db.retailer_invoices.find(
        invoice_query,
        {"_id": 0}
    ).to_list(10000)
    
    # Fetch all rejections to calculate actual rejection amounts per date+retailer
    retailer_ids = list(set(inv.get("retailer_id") for inv in invoices if inv.get("retailer_id")))
    rejections = await db.retailer_rejections.find(
        {"retailer_id": {"$in": retailer_ids}},
        {"_id": 0, "retailer_id": 1, "rejection_date": 1, "rejection_value": 1}
    ).to_list(10000)
    
    # Group rejections by (retailer_id, date_str)
    rejection_map = {}
    for rej in rejections:
        rej_date = rej.get("rejection_date")
        if isinstance(rej_date, datetime):
            rej_date_str = rej_date.date().isoformat()
        elif isinstance(rej_date, str):
            rej_date_str = rej_date[:10]
        else:
            continue
        
        key = (rej.get("retailer_id"), rej_date_str)
        if key not in rejection_map:
            rejection_map[key] = 0
        rejection_map[key] += (rej.get("rejection_value", 0) or 0)
    
    # Group by retailer AND collect detailed entries for expandable breakdown
    retailer_payables = {}
    detailed_entries = {
        "upfront": [],      # Today's 50% + pending 50% from 1-4 days
        "credit_due": [],   # 5-day credit due
        "overdue": []       # Overdue > 5 days
    }
    
    for inv in invoices:
        retailer_id = inv.get("retailer_id")
        if not retailer_id:
            continue
            
        shop_name = retailer_map.get(retailer_id) or inv.get("retailer_name", "Unknown")
        
        if retailer_id not in retailer_payables:
            retailer_payables[retailer_id] = {
                "retailer_id": retailer_id,
                "retailer_name": shop_name,
                "today_50_percent": 0,
                "pending_50_recent": 0,  # Unpaid 50% from days 1-4
                "due_today_remaining": 0,
                "overdue": 0,
                "total": 0,
                "invoice_count": 0
            }
        
        # Parse invoice date
        inv_date = inv.get("invoice_date")
        if isinstance(inv_date, str):
            inv_date_str = inv_date[:10]
            inv_date = datetime.fromisoformat(inv_date_str).date()
        elif isinstance(inv_date, datetime):
            inv_date_str = inv_date.date().isoformat()
            inv_date = inv_date.date()
        else:
            continue
        
        # Use the invoice's stored values for consistency with Payment Summary
        gross_value = inv.get("gross_value", 0) or inv.get("total_mrp_value", 0) or 0
        rejection_amount = inv.get("rejection_amount", 0) or 0
        commission_pct = inv.get("commission_percentage", 0) or 0
        commission_amount = inv.get("commission_amount", 0) or 0
        paid_amount = inv.get("paid_amount", 0) or 0
        total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        
        # Get retailer's upfront percentage to determine calculation method
        upfront_pct = retailer_upfront_map.get(retailer_id, 50)
        is_full_upfront = upfront_pct == 100
        
        # For 100% upfront retailers: net_payable = gross - commission (no rejection deduction)
        # Rejections are handled via Credit Notes for 100% upfront model
        if is_full_upfront:
            # Recalculate from gross for consistency with frontend
            net_payable = gross_value - (gross_value * commission_pct / 100)
        else:
            # For standard retailers, use stored net_payable or calculate with rejection
            net_payable = inv.get("net_payable", 0) or 0
            if net_payable <= 0:
                # Fallback calculation if net_payable not stored
                net_payable = gross_value - rejection_amount - commission_amount
        
        # Final payable after credit notes adjustment
        final_payable = net_payable - total_credit_adjusted
        
        # Pending amount = final payable - paid
        pending_amount = max(0, final_payable - paid_amount)
        
        if pending_amount <= 0:
            continue
        
        upfront_portion = final_payable * (upfront_pct / 100)
        days_since = (today - inv_date).days
        
        retailer_payables[retailer_id]["invoice_count"] += 1
        
        # Create entry for detailed breakdown
        entry = {
            "retailer_id": retailer_id,
            "retailer_name": shop_name,
            "invoice_date": inv_date_str,
            "invoice_number": inv.get("invoice_number", "N/A"),
            "days_since": days_since
        }
        
        # For 100% upfront retailers: ALL pending amount is due immediately regardless of days
        if is_full_upfront:
            # Full amount is due on delivery day itself
            if pending_amount > 0:
                retailer_payables[retailer_id]["today_50_percent"] += pending_amount
                entry["amount"] = round(pending_amount, 2)
                entry["type"] = "today" if days_since == 0 else "pending"
                if days_since > 0:
                    entry["overdue_days"] = days_since  # Any day past delivery is technically overdue for 100% upfront
                detailed_entries["upfront"].append(entry)
        else:
            # Standard logic for partial upfront (50% or other)
            # First, always check if upfront portion was paid
            unpaid_upfront = max(0, upfront_portion - paid_amount)
            
            if days_since == 0:
                # Today's invoice: upfront % is due
                if unpaid_upfront > 0:
                    retailer_payables[retailer_id]["today_50_percent"] += unpaid_upfront
                    entry["amount"] = round(unpaid_upfront, 2)
                    entry["type"] = "today"
                    detailed_entries["upfront"].append(entry)
            elif days_since >= 1 and days_since <= 4:
                # Check if upfront portion was paid
                if unpaid_upfront > 0:
                    retailer_payables[retailer_id]["pending_50_recent"] += unpaid_upfront
                    entry["amount"] = round(unpaid_upfront, 2)
                    entry["type"] = "pending"
                    detailed_entries["upfront"].append(entry)
            elif days_since == 5:
                # Day 5: Credit period ends
                # If 50% upfront was never paid, it still counts as pending upfront
                if unpaid_upfront > 0:
                    retailer_payables[retailer_id]["pending_50_recent"] += unpaid_upfront
                    entry_upfront = {**entry, "amount": round(unpaid_upfront, 2), "type": "pending", "overdue_days": 1}
                    detailed_entries["upfront"].append(entry_upfront)
                    # The remaining credit portion (after upfront) is due today
                    remaining_credit = pending_amount - unpaid_upfront
                    if remaining_credit > 0:
                        entry_credit = {**entry, "amount": round(remaining_credit, 2)}
                        retailer_payables[retailer_id]["due_today_remaining"] += remaining_credit
                        detailed_entries["credit_due"].append(entry_credit)
                else:
                    # Upfront was paid, only credit portion is due
                    retailer_payables[retailer_id]["due_today_remaining"] += pending_amount
                    entry["amount"] = round(pending_amount, 2)
                    detailed_entries["credit_due"].append(entry)
            elif days_since > 5:
                # Overdue: If 50% upfront was never paid, track it separately
                if unpaid_upfront > 0:
                    retailer_payables[retailer_id]["pending_50_recent"] += unpaid_upfront
                    entry_upfront = {**entry, "amount": round(unpaid_upfront, 2), "type": "pending", "overdue_days": days_since - 4}
                    detailed_entries["upfront"].append(entry_upfront)
                    # The remaining is overdue credit
                    remaining_overdue = pending_amount - unpaid_upfront
                    if remaining_overdue > 0:
                        entry_overdue = {**entry, "amount": round(remaining_overdue, 2), "overdue_days": days_since - 5}
                        retailer_payables[retailer_id]["overdue"] += remaining_overdue
                        detailed_entries["overdue"].append(entry_overdue)
                else:
                    # Upfront was paid, full pending is overdue credit
                    retailer_payables[retailer_id]["overdue"] += pending_amount
                    entry["amount"] = round(pending_amount, 2)
                    entry["overdue_days"] = days_since - 5
                    detailed_entries["overdue"].append(entry)
    
    # Sort detailed entries by amount descending
    detailed_entries["upfront"].sort(key=lambda x: x["amount"], reverse=True)
    detailed_entries["credit_due"].sort(key=lambda x: x["amount"], reverse=True)
    detailed_entries["overdue"].sort(key=lambda x: x.get("overdue_days", 0), reverse=True)
    
    # Calculate totals and sort
    result = []
    for data in retailer_payables.values():
        data["total"] = round(
            data["today_50_percent"] + data["pending_50_recent"] + data["due_today_remaining"] + data["overdue"], 2
        )
        data["today_50_percent"] = round(data["today_50_percent"], 2)
        data["pending_50_recent"] = round(data["pending_50_recent"], 2)
        data["due_today_remaining"] = round(data["due_today_remaining"], 2)
        data["overdue"] = round(data["overdue"], 2)
        if data["total"] > 0:
            result.append(data)
    
    # Sort by total (highest first)
    result.sort(key=lambda x: x["total"], reverse=True)
    
    # Grand totals
    grand_totals = {
        "today_50_percent": round(sum(r["today_50_percent"] for r in result), 2),
        "pending_50_recent": round(sum(r["pending_50_recent"] for r in result), 2),
        "due_today_remaining": round(sum(r["due_today_remaining"] for r in result), 2),
        "overdue": round(sum(r["overdue"] for r in result), 2),
        "total": round(sum(r["total"] for r in result), 2),
        # Combined totals for simplified 2-block view
        "upfront_50_total": round(sum(r["today_50_percent"] + r["pending_50_recent"] for r in result), 2),
        "final_payment_total": round(sum(r["due_today_remaining"] + r["overdue"] for r in result), 2)
    }
    
    # Add combined totals to each retailer for "By Outlet" display
    for r in result:
        r["upfront_50_total"] = round(r["today_50_percent"] + r["pending_50_recent"], 2)
        r["final_payment_total"] = round(r["due_today_remaining"] + r["overdue"], 2)
    
    return {
        "retailers": result,
        "grand_totals": grand_totals,
        "detailed_entries": detailed_entries
    }


# ==================== RETAILER CATALOGUE API ====================
# This manages the product catalogue available for retailers to order from

@router.get("/retailer-catalogue")
async def get_retailer_catalogue(
    include_images: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get all products in the retailer catalogue with their allowed variants"""
    items = await db.retailer_catalogue.find({}, {"_id": 0}).to_list(1000)
    
    # Only fetch product images if explicitly requested (for performance)
    if include_images:
        product_ids = [item.get("product_id") for item in items if item.get("product_id")]
        products = await db.products.find(
            {"id": {"$in": product_ids}}, 
            {"_id": 0, "id": 1, "image_url": 1}
        ).to_list(1000)
        product_image_map = {p["id"]: p.get("image_url", "") for p in products}
        
        # Add image_url from products if not present in catalogue
        for item in items:
            if not item.get("image_url") and item.get("product_id"):
                item["image_url"] = product_image_map.get(item["product_id"], "")
    else:
        # Remove any existing image_url to reduce payload size
        for item in items:
            item.pop("image_url", None)
    
    return items

@router.get("/retailer-catalogue/mrp")
async def get_retailer_catalogue_mrp(current_user: dict = Depends(get_current_user)):
    """Get MRP data for retailer catalogue products - checks today first, then yesterday"""
    from datetime import timedelta
    
    # Get today and yesterday dates
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Fetch today's MRP entries
    today_mrp = await db.daily_mrp.find({"date": today}, {"_id": 0}).to_list(1000)
    yesterday_mrp = await db.daily_mrp.find({"date": yesterday}, {"_id": 0}).to_list(1000)
    
    # Build MRP lookup: key = "product_id_variant_id" -> mrp
    mrp_lookup = {}
    
    # First, add yesterday's MRP (will be overwritten by today's if exists)
    for entry in yesterday_mrp:
        product_id = entry.get("product_id", "")
        variant_id = entry.get("variant_id", "")
        mrp = entry.get("mrp", 0)
        if product_id and variant_id and mrp and mrp > 0:
            key = f"{product_id}_{variant_id}"
            mrp_lookup[key] = {
                "mrp": mrp,
                "date": yesterday,
                "product_name": entry.get("product_name", ""),
                "variant_name": entry.get("variant_name", "")
            }
    
    # Then, add/overwrite with today's MRP
    for entry in today_mrp:
        product_id = entry.get("product_id", "")
        variant_id = entry.get("variant_id", "")
        mrp = entry.get("mrp", 0)
        if product_id and variant_id and mrp and mrp > 0:
            key = f"{product_id}_{variant_id}"
            mrp_lookup[key] = {
                "mrp": mrp,
                "date": today,
                "product_name": entry.get("product_name", ""),
                "variant_name": entry.get("variant_name", "")
            }
    
    return {
        "mrp_data": mrp_lookup,
        "today": today,
        "yesterday": yesterday,
        "today_count": len([e for e in today_mrp if e.get("mrp", 0) > 0]),
        "yesterday_count": len([e for e in yesterday_mrp if e.get("mrp", 0) > 0])
    }

@router.post("/retailer-catalogue")
async def add_catalogue_item(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add or update a product in the retailer catalogue"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    product_id = input.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="Product ID is required")
    
    # Check if product already exists in catalogue
    existing = await db.retailer_catalogue.find_one({"product_id": product_id})
    
    catalogue_item = {
        "product_id": product_id,
        "product_name": input.get("product_name", ""),
        "product_name_hi": input.get("product_name_hi", ""),
        "product_name_mr": input.get("product_name_mr", ""),
        "category": input.get("category", ""),
        "image_url": input.get("image_url", ""),
        "variants": input.get("variants", []),  # List of variant IDs (Customer Display Variant) - can include unit_piece, unit_packet
        "purchase_unit": input.get("purchase_unit", ""),  # Unit for purchasing (e.g., Pieces, Box)
        "purchase_weights": input.get("purchase_weights", []),  # Multiple weight variant IDs
        "display_unit": input.get("display_unit", ""),  # Unit shown as variant on portal (Piece/Packet)
        "purchase_weight_variant": input.get("purchase_weight_variant", ""),  # Legacy: single weight (deprecated)
        "is_active": input.get("is_active", True),
        "show_on_portal": input.get("show_on_portal", True),  # Visibility on retailer portal
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["user_id"]
    }
    
    if existing:
        # Update existing
        await db.retailer_catalogue.update_one(
            {"product_id": product_id},
            {"$set": catalogue_item}
        )
        return {"message": "Catalogue item updated", "item": catalogue_item}
    else:
        # Create new
        catalogue_item["id"] = str(uuid.uuid4())
        catalogue_item["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.retailer_catalogue.insert_one(catalogue_item)
        catalogue_item.pop("_id", None)
        return {"message": "Catalogue item created", "item": catalogue_item}

@router.put("/retailer-catalogue/{product_id}")
async def update_catalogue_item(
    product_id: str,
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a specific product in the retailer catalogue"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.retailer_catalogue.find_one({"product_id": product_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    
    update_data = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["user_id"]
    }
    
    # Update fields if provided
    if "variants" in input:
        update_data["variants"] = input["variants"]
    if "is_active" in input:
        update_data["is_active"] = input["is_active"]
    if "show_on_portal" in input:
        update_data["show_on_portal"] = input["show_on_portal"]
    if "product_name" in input:
        update_data["product_name"] = input["product_name"]
    if "product_name_hi" in input:
        update_data["product_name_hi"] = input["product_name_hi"]
    if "product_name_mr" in input:
        update_data["product_name_mr"] = input["product_name_mr"]
    if "category" in input:
        update_data["category"] = input["category"]
    if "image_url" in input:
        update_data["image_url"] = input["image_url"]
    if "purchase_unit" in input:
        update_data["purchase_unit"] = input["purchase_unit"]
    if "purchase_weights" in input:
        update_data["purchase_weights"] = input["purchase_weights"]
    if "purchase_weight_variant" in input:
        update_data["purchase_weight_variant"] = input["purchase_weight_variant"]
    
    await db.retailer_catalogue.update_one(
        {"product_id": product_id},
        {"$set": update_data}
    )
    
    updated = await db.retailer_catalogue.find_one({"product_id": product_id}, {"_id": 0})
    return updated

@router.delete("/retailer-catalogue/{product_id}")
async def delete_catalogue_item(
    product_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a product from the retailer catalogue"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.retailer_catalogue.delete_one({"product_id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catalogue item not found")
    
    return {"message": "Catalogue item deleted", "product_id": product_id}

@router.post("/retailer-catalogue/bulk-add")
async def bulk_add_catalogue_items(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add multiple products to catalogue at once"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    items = input.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="No items provided")
    
    added_count = 0
    updated_count = 0
    
    for item in items:
        product_id = item.get("product_id")
        if not product_id:
            continue
        
        existing = await db.retailer_catalogue.find_one({"product_id": product_id})
        
        catalogue_item = {
            "product_id": product_id,
            "product_name": item.get("product_name", ""),
            "product_name_hi": item.get("product_name_hi", ""),
            "product_name_mr": item.get("product_name_mr", ""),
            "category": item.get("category", ""),
            "image_url": item.get("image_url", ""),
            "variants": item.get("variants", []),
            "is_active": item.get("is_active", True),
            "show_on_portal": item.get("show_on_portal", True),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_user["user_id"]
        }
        
        if existing:
            await db.retailer_catalogue.update_one(
                {"product_id": product_id},
                {"$set": catalogue_item}
            )
            updated_count += 1
        else:
            catalogue_item["id"] = str(uuid.uuid4())
            catalogue_item["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.retailer_catalogue.insert_one(catalogue_item)
            added_count += 1
    
    return {"message": f"Added {added_count}, updated {updated_count} catalogue items"}



# ============================================================================
# ONE-TIME CLEANUP: Savtamali Retailer (50% to 100% Upfront Migration)
# ============================================================================
# This section handles a one-time cleanup for Savtamali retailer who moved
# from 50% upfront to 100% upfront model. All invoices before and including
# June 7, 2025 are marked as paid with a cleanup flag.
#
# TO ROLLBACK: Set SAVTAMALI_CLEANUP_ENABLED = False and run the rollback endpoint
# ============================================================================

SAVTAMALI_CLEANUP_ENABLED = True
SAVTAMALI_RETAILER_ID = "d36a4f17-bed0-4d8e-bb35-3e83825a0ce8"
SAVTAMALI_CLEANUP_CUTOFF_DATE = "2026-06-07"  # Invoices on or before this date

@router.post("/admin/savtamali-cleanup/execute")
async def execute_savtamali_cleanup(current_user: dict = Depends(get_current_user)):
    """
    One-time cleanup for Savtamali retailer.
    Marks all invoices on or before June 7, 2025 as paid with cleanup flag.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not SAVTAMALI_CLEANUP_ENABLED:
        raise HTTPException(status_code=400, detail="Savtamali cleanup is disabled")
    
    cutoff_date = datetime.strptime(SAVTAMALI_CLEANUP_CUTOFF_DATE, "%Y-%m-%d")
    cutoff_date_end = cutoff_date.replace(hour=23, minute=59, second=59)
    
    # Find all invoices for Savtamali on or before cutoff date
    invoices = await db.retailer_invoices.find({
        "retailer_id": SAVTAMALI_RETAILER_ID,
        "invoice_date": {"$lte": cutoff_date_end.isoformat()}
    }).to_list(length=None)
    
    updated_count = 0
    total_pending_cleared = 0
    
    for inv in invoices:
        # Calculate pending amount
        net_payable = inv.get("net_payable", 0) or 0
        total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        paid_amount = inv.get("paid_amount", 0) or 0
        pending_amount = (net_payable - total_credit_adjusted) - paid_amount
        
        if pending_amount > 0 or inv.get("status") != "paid":
            # Store original values for potential rollback
            original_paid_amount = paid_amount
            original_status = inv.get("status", "pending")
            
            # Update invoice to mark as paid
            await db.retailer_invoices.update_one(
                {"id": inv["id"]},
                {
                    "$set": {
                        "status": "paid",
                        "paid_amount": net_payable - total_credit_adjusted,  # Set paid = receivable
                        "savtamali_cleanup": True,
                        "savtamali_cleanup_date": datetime.now(timezone.utc).isoformat(),
                        "savtamali_cleanup_original_paid": original_paid_amount,
                        "savtamali_cleanup_original_status": original_status,
                        "savtamali_cleanup_note": "One-time cleanup: 50% to 100% upfront migration. Pending amount adjusted."
                    }
                }
            )
            updated_count += 1
            total_pending_cleared += max(0, pending_amount)
    
    return {
        "success": True,
        "message": f"Savtamali cleanup completed",
        "invoices_updated": updated_count,
        "total_pending_cleared": round(total_pending_cleared, 2),
        "cutoff_date": SAVTAMALI_CLEANUP_CUTOFF_DATE
    }


@router.post("/admin/savtamali-cleanup/rollback")
async def rollback_savtamali_cleanup(current_user: dict = Depends(get_current_user)):
    """
    Rollback the Savtamali cleanup - restore original paid amounts and statuses.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Find all invoices that were cleaned up
    invoices = await db.retailer_invoices.find({
        "retailer_id": SAVTAMALI_RETAILER_ID,
        "savtamali_cleanup": True
    }).to_list(length=None)
    
    rolled_back_count = 0
    
    for inv in invoices:
        original_paid = inv.get("savtamali_cleanup_original_paid", 0)
        original_status = inv.get("savtamali_cleanup_original_status", "pending")
        
        await db.retailer_invoices.update_one(
            {"id": inv["id"]},
            {
                "$set": {
                    "status": original_status,
                    "paid_amount": original_paid
                },
                "$unset": {
                    "savtamali_cleanup": "",
                    "savtamali_cleanup_date": "",
                    "savtamali_cleanup_original_paid": "",
                    "savtamali_cleanup_original_status": "",
                    "savtamali_cleanup_note": ""
                }
            }
        )
        rolled_back_count += 1
    
    return {
        "success": True,
        "message": f"Savtamali cleanup rolled back",
        "invoices_restored": rolled_back_count
    }


@router.get("/admin/savtamali-cleanup/status")
async def get_savtamali_cleanup_status(current_user: dict = Depends(get_current_user)):
    """
    Check the status of Savtamali cleanup.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Count cleaned up invoices
    cleaned_count = await db.retailer_invoices.count_documents({
        "retailer_id": SAVTAMALI_RETAILER_ID,
        "savtamali_cleanup": True
    })
    
    # Get cutoff date invoices count
    cutoff_date = datetime.strptime(SAVTAMALI_CLEANUP_CUTOFF_DATE, "%Y-%m-%d")
    cutoff_date_end = cutoff_date.replace(hour=23, minute=59, second=59)
    
    total_eligible = await db.retailer_invoices.count_documents({
        "retailer_id": SAVTAMALI_RETAILER_ID,
        "invoice_date": {"$lte": cutoff_date_end.isoformat()}
    })
    
    return {
        "enabled": SAVTAMALI_CLEANUP_ENABLED,
        "retailer_id": SAVTAMALI_RETAILER_ID,
        "cutoff_date": SAVTAMALI_CLEANUP_CUTOFF_DATE,
        "total_eligible_invoices": total_eligible,
        "cleaned_up_invoices": cleaned_count,
        "cleanup_executed": cleaned_count > 0
    }



# ============================================================================
# ONE-TIME CLEANUP: Narang Super Mart (Fix 100% Upfront Model)
# ============================================================================
# Create individual CNs for each rejection item that doesn't have a CN yet.
# Don't touch existing CNs that are already created/adjusted.
#
# TO ROLLBACK: Run the rollback endpoint to delete cleanup CNs
# ============================================================================

NARANG_CLEANUP_ENABLED = True
NARANG_RETAILER_ID = "c15885f6-01dc-4516-aa9c-ffb29fd4849c"
NARANG_COMMISSION_PERCENTAGE = 20  # Narang's commission percentage


@router.get("/admin/narang-cleanup/status")
async def get_narang_cleanup_status(current_user: dict = Depends(get_current_user)):
    """Check status of Narang Super Mart cleanup - shows rejections without CNs."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all rejections for Narang
    rejections = await db.retailer_rejections.find({
        "retailer_id": NARANG_RETAILER_ID
    }, {"_id": 0}).to_list(length=None)
    
    # Get all CNs and their linked rejection_ids
    cns = await db.retailer_credit_notes.find({
        "retailer_id": NARANG_RETAILER_ID
    }, {"_id": 0}).to_list(length=None)
    
    cn_rejection_ids = {cn.get("rejection_id") for cn in cns if cn.get("rejection_id")}
    
    # Find rejections without CNs
    missing_cns = [r for r in rejections if r.get("id") not in cn_rejection_ids]
    
    # Group by date
    by_date = {}
    for r in missing_cns:
        date = str(r.get("rejection_date", ""))[:10]
        if date not in by_date:
            by_date[date] = {"count": 0, "value": 0}
        by_date[date]["count"] += 1
        rej_value = r.get("rejection_value", 0) or (r.get("quantity", 0) * r.get("mrp", 0))
        by_date[date]["value"] += rej_value
    
    # Calculate totals
    total_missing_value = sum(d["value"] for d in by_date.values())
    
    # Check if cleanup was already executed
    cleanup_cn_count = await db.retailer_credit_notes.count_documents({
        "retailer_id": NARANG_RETAILER_ID,
        "narang_cleanup": True
    })
    
    return {
        "enabled": NARANG_CLEANUP_ENABLED,
        "retailer_id": NARANG_RETAILER_ID,
        "total_rejections": len(rejections),
        "rejections_with_cn": len(cn_rejection_ids),
        "rejections_without_cn": len(missing_cns),
        "missing_cn_value": round(total_missing_value, 2),
        "by_date": by_date,
        "cleanup_cns_created": cleanup_cn_count,
        "cleanup_executed": cleanup_cn_count > 0
    }


@router.post("/admin/narang-cleanup/execute")
async def execute_narang_cleanup(current_user: dict = Depends(get_current_user)):
    """
    Create individual CNs for each rejection item that doesn't have a CN yet.
    Each CN is linked to its rejection item via rejection_id.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not NARANG_CLEANUP_ENABLED:
        raise HTTPException(status_code=400, detail="Narang cleanup is disabled")
    
    # Get all rejections for Narang
    rejections = await db.retailer_rejections.find({
        "retailer_id": NARANG_RETAILER_ID
    }, {"_id": 0}).to_list(length=None)
    
    # Get all CNs and their linked rejection_ids
    cns = await db.retailer_credit_notes.find({
        "retailer_id": NARANG_RETAILER_ID
    }, {"_id": 0}).to_list(length=None)
    
    cn_rejection_ids = {cn.get("rejection_id") for cn in cns if cn.get("rejection_id")}
    
    # Find rejections without CNs
    missing_cns = [r for r in rejections if r.get("id") not in cn_rejection_ids]
    
    if not missing_cns:
        return {
            "success": True,
            "message": "No rejections without CNs found",
            "cns_created": 0
        }
    
    # Get current max CN number for this retailer
    last_cn = await db.retailer_credit_notes.find_one(
        {"retailer_id": NARANG_RETAILER_ID},
        sort=[("credit_note_number", -1)]
    )
    if last_cn:
        cn_num_str = last_cn.get("credit_note_number", "CN-NAR-0000")
        try:
            current_cn_num = int(cn_num_str.split("-")[-1])
        except:
            current_cn_num = 85
    else:
        current_cn_num = 0
    
    # Get retailer info
    retailer = await db.retailers.find_one({"id": NARANG_RETAILER_ID}, {"_id": 0})
    retailer_name = retailer.get("company_name", "Narang Super Mart") if retailer else "Narang Super Mart"
    
    # Create CN for each rejection item
    cns_created = []
    total_cn_amount = 0
    
    for rej in missing_cns:
        current_cn_num += 1
        cn_number = f"CN-NAR-{str(current_cn_num).zfill(4)}"
        cn_id = str(uuid.uuid4())
        
        # Calculate rejection value
        rejection_value = rej.get("rejection_value", 0) or (rej.get("quantity", 0) * rej.get("mrp", 0))
        commission_deducted = rejection_value * NARANG_COMMISSION_PERCENTAGE / 100
        cn_amount = rejection_value - commission_deducted  # Net CN amount after commission
        
        # Get the invoice linked to this rejection's dispatch
        dispatch_id = rej.get("dispatch_id")
        linked_invoice = None
        if dispatch_id:
            linked_invoice = await db.retailer_invoices.find_one({
                "retailer_id": NARANG_RETAILER_ID,
                "dispatch_id": dispatch_id
            }, {"_id": 0})
        
        rejection_date = rej.get("rejection_date", "")
        if isinstance(rejection_date, str):
            rejection_date_str = rejection_date[:10]
        else:
            rejection_date_str = rejection_date.strftime("%Y-%m-%d") if rejection_date else ""
        
        cn_doc = {
            "id": cn_id,
            "credit_note_number": cn_number,
            "retailer_id": NARANG_RETAILER_ID,
            "retailer_name": retailer_name,
            "original_invoice_id": linked_invoice.get("id") if linked_invoice else None,
            "original_invoice_number": linked_invoice.get("invoice_number") if linked_invoice else None,
            "rejection_id": rej.get("id"),
            "rejection_date": rej.get("rejection_date"),  # This is used for date grouping in frontend
            "date": rej.get("rejection_date"),  # Also set date field
            "original_invoice_date": rej.get("rejection_date"),  # For grouping by invoice date
            "rejection_value": rejection_value,
            "commission_percentage": NARANG_COMMISSION_PERCENTAGE,
            "commission_deducted": commission_deducted,
            "amount": cn_amount,
            "rejection_details": [{
                "product_name": rej.get("product_name", "Unknown"),
                "variant_name": rej.get("variant_name", ""),
                "quantity": rej.get("quantity", 0),
                "mrp": rej.get("mrp", 0),
                "value": rejection_value,
                "reason": rej.get("reason", "")
            }],
            "status": "pending",
            "adjusted_amount": 0,
            "pending_amount": cn_amount,
            "adjusted_against_invoices": [],
            "adjusted_in_invoices": [],
            "remarks": f"100% Upfront Model Correction: CN for rejection on {rejection_date_str}",
            "created_by": current_user.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_generated": True,
            "narang_cleanup": True,
            "narang_cleanup_date": datetime.now(timezone.utc).isoformat()
        }
        
        await db.retailer_credit_notes.insert_one(cn_doc)
        cns_created.append({
            "cn_number": cn_number,
            "rejection_date": rejection_date_str,
            "product": rej.get("product_name"),
            "rejection_value": rejection_value,
            "cn_amount": cn_amount
        })
        total_cn_amount += cn_amount
    
    # Update first 5 invoices to show they have been corrected
    cutoff_date = datetime.strptime("2026-06-09", "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    await db.retailer_invoices.update_many(
        {
            "retailer_id": NARANG_RETAILER_ID,
            "invoice_date": {"$lte": cutoff_date.isoformat()},
            "status": "paid"
        },
        {
            "$set": {
                "status": "partial",
                "narang_cleanup": True,
                "narang_cleanup_date": datetime.now(timezone.utc).isoformat(),
                "narang_cleanup_note": "100% upfront model correction: Individual CNs created for rejection items"
            }
        }
    )
    
    return {
        "success": True,
        "message": f"Created {len(cns_created)} individual CNs for rejection items",
        "cns_created": len(cns_created),
        "total_cn_amount": round(total_cn_amount, 2),
        "sample_cns": cns_created[:10]
    }


@router.post("/admin/narang-cleanup/rollback")
async def rollback_narang_cleanup(current_user: dict = Depends(get_current_user)):
    """
    Rollback the Narang cleanup:
    1. Delete CNs created during cleanup
    2. Restore original invoice statuses
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Delete CNs created during cleanup
    cn_delete_result = await db.retailer_credit_notes.delete_many({
        "retailer_id": NARANG_RETAILER_ID,
        "narang_cleanup": True
    })
    
    # Restore invoice statuses
    await db.retailer_invoices.update_many(
        {
            "retailer_id": NARANG_RETAILER_ID,
            "narang_cleanup": True
        },
        {
            "$set": {"status": "paid"},
            "$unset": {
                "narang_cleanup": "",
                "narang_cleanup_date": "",
                "narang_cleanup_note": ""
            }
        }
    )
    
    return {
        "success": True,
        "message": "Narang cleanup rolled back",
        "cns_deleted": cn_delete_result.deleted_count
    }

