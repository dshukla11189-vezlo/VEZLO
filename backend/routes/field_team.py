"""
Field Team Routes
=================
Handles Field Team dashboard, assigned retailers,
aggregate views, and order placement on behalf of retailers.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from collections import defaultdict

from dependencies import (
    db,
    get_current_user,
    logger,
)
from models import RetailerIndentCreate, RetailerIndentItem
from routes.retailer_portal import compute_retailer_payment_details, compute_retailer_payment_summary, attach_credit_notes_to_rejections

router = APIRouter(tags=["field_team"])


def get_ist_today():
    """Get today's date in IST"""
    ist = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist).date()


async def get_field_team_assigned_retailer_ids(field_team_id: str) -> List[str]:
    """
    Get list of retailer IDs assigned to a field team member.
    Retailers have 'assigned_to' field pointing to the field team user's ID.
    """
    # Find all retailers where assigned_to equals the field team user's ID
    retailers = await db.users.find(
        {"role": "retailer", "assigned_to": field_team_id},
        {"_id": 0, "id": 1}
    ).to_list(500)
    
    return [r["id"] for r in retailers]


async def verify_retailer_assigned_to_field_team(retailer_id: str, field_team_id: str) -> dict:
    """
    Verify a retailer is assigned to the field team member and return the retailer doc.
    Raises HTTPException if not found or not assigned.
    """
    # Query retailer directly - check both ID and assigned_to
    retailer = await db.users.find_one(
        {"id": retailer_id, "role": "retailer", "assigned_to": field_team_id},
        {"_id": 0, "password": 0}
    )
    
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found or not assigned to you")
    
    return retailer


@router.get("/field-team/assigned-retailers")
async def get_assigned_retailers(current_user: dict = Depends(get_current_user)):
    """
    Get list of retailers assigned to the current Field Team member.
    Returns basic retailer info for dropdown selection.
    
    Note: Retailers have 'assigned_to' field pointing to the field team user's ID.
    """
    if current_user.get("role") != "field_team":
        raise HTTPException(status_code=403, detail="Only field team members can access this endpoint")
    
    field_team_id = current_user.get("user_id")
    
    # Find all retailers assigned to this field team member
    retailers = await db.users.find(
        {"role": "retailer", "assigned_to": field_team_id},
        {"_id": 0, "password": 0}
    ).to_list(500)
    
    return {
        "field_team_id": field_team_id,
        "assigned_count": len(retailers),
        "retailers": retailers
    }


@router.get("/field-team/portfolio-summary")
async def get_field_team_portfolio_summary(
    current_user: dict = Depends(get_current_user)
):
    """
    Get aggregated portfolio summary for Field Team member.
    Shows cumulative metrics across all assigned retailers.
    
    Note: Retailers have 'assigned_to' field pointing to the field team user's ID.
    """
    if current_user.get("role") != "field_team":
        raise HTTPException(status_code=403, detail="Only field team members can access this endpoint")
    
    field_team_id = current_user.get("user_id")
    today = get_ist_today()
    
    # Get all retailers assigned to this field team member
    retailers = await db.users.find(
        {"role": "retailer", "assigned_to": field_team_id},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1, "upfront_collection_percentage": 1, "commission_percentage": 1, "status": 1}
    ).to_list(500)
    
    if not retailers:
        return {
            "field_team_id": field_team_id,
            "total_retailers": 0,
            "active_retailers": 0,
            "churned_retailers": 0,
            "summary": {
                "total_outstanding": 0,
                "immediately_payable": 0,
                "overdue": 0,
                "pending_indents": 0,
                "today_dispatches": 0,
                "today_dispatch_value": 0
            },
            "retailer_summaries": []
        }
    
    retailer_ids = [r["id"] for r in retailers]
    retailer_map = {r["id"]: r for r in retailers}
    
    # Get upfront percentage for each retailer
    retailer_upfront_map = {r["id"]: r.get("upfront_collection_percentage", 50) for r in retailers}
    
    # Fetch pending/partial invoices for all assigned retailers
    invoices = await db.retailer_invoices.find(
        {"retailer_id": {"$in": retailer_ids}, "status": {"$in": ["pending", "partial"]}},
        {"_id": 0}
    ).to_list(10000)
    
    # Fetch pending indents for today onwards
    today_str = today.isoformat()
    pending_indents = await db.retailer_indents.find(
        {
            "retailer_id": {"$in": retailer_ids},
            "status": "pending",
            "indent_date": {"$gte": today_str}
        },
        {"_id": 0, "retailer_id": 1, "id": 1}
    ).to_list(1000)
    
    # Fetch today's dispatches
    today_dispatches = await db.retailer_dispatches.find(
        {
            "retailer_id": {"$in": retailer_ids},
            "dispatch_date": {"$gte": today_str, "$lte": today_str + "T23:59:59"}
        },
        {"_id": 0, "retailer_id": 1, "total_mrp_value": 1}
    ).to_list(1000)
    
    # Aggregate by retailer
    retailer_summaries = []
    total_outstanding = 0
    total_immediately_payable = 0
    total_overdue = 0
    
    # Group invoices by retailer
    invoices_by_retailer = defaultdict(list)
    for inv in invoices:
        invoices_by_retailer[inv.get("retailer_id")].append(inv)
    
    # Group indents by retailer
    indents_by_retailer = defaultdict(int)
    for indent in pending_indents:
        indents_by_retailer[indent.get("retailer_id")] += 1
    
    # Group dispatches by retailer
    dispatches_by_retailer = defaultdict(lambda: {"count": 0, "value": 0})
    for disp in today_dispatches:
        rid = disp.get("retailer_id")
        dispatches_by_retailer[rid]["count"] += 1
        dispatches_by_retailer[rid]["value"] += disp.get("total_mrp_value", 0) or 0
    
    for retailer in retailers:
        rid = retailer["id"]
        shop_name = retailer.get("company_name") or retailer.get("name", "Unknown")
        upfront_pct = retailer_upfront_map.get(rid, 50)
        is_full_upfront = upfront_pct == 100
        
        # Calculate outstanding and immediately payable for this retailer
        retailer_outstanding = 0
        retailer_immediately_payable = 0
        retailer_overdue = 0
        
        for inv in invoices_by_retailer.get(rid, []):
            # Parse invoice date
            inv_date = inv.get("invoice_date")
            if isinstance(inv_date, str):
                inv_date_obj = datetime.fromisoformat(inv_date[:10]).date()
            elif isinstance(inv_date, datetime):
                inv_date_obj = inv_date.date()
            else:
                continue
            
            # Calculate pending amount
            gross_value = inv.get("gross_value", 0) or inv.get("total_mrp_value", 0) or 0
            rejection_amount = inv.get("rejection_amount", 0) or 0
            commission_amount = inv.get("commission_amount", 0) or 0
            paid_amount = inv.get("paid_amount", 0) or 0
            total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
            
            net_payable = inv.get("net_payable", 0) or 0
            if net_payable <= 0:
                net_payable = gross_value - rejection_amount - commission_amount
            
            final_payable = net_payable - total_credit_adjusted
            pending_amount = max(0, final_payable - paid_amount)
            
            if pending_amount <= 0:
                continue
            
            retailer_outstanding += pending_amount
            
            # Calculate days since invoice
            days_since = (today - inv_date_obj).days
            
            if is_full_upfront:
                # 100% upfront: all pending is immediately payable
                retailer_immediately_payable += pending_amount
                if days_since > 0:
                    retailer_overdue += pending_amount
            else:
                # Standard logic
                upfront_portion = final_payable * (upfront_pct / 100)
                unpaid_upfront = max(0, upfront_portion - paid_amount)
                
                if days_since == 0:
                    # Today's invoice: upfront portion due
                    retailer_immediately_payable += min(upfront_portion, pending_amount)
                elif days_since >= 1 and days_since <= 4:
                    # 1-4 days: unpaid upfront is due
                    if unpaid_upfront > 0:
                        retailer_immediately_payable += unpaid_upfront
                elif days_since >= 5:
                    # 5+ days: full pending is due and overdue
                    retailer_immediately_payable += pending_amount
                    retailer_overdue += pending_amount
        
        total_outstanding += retailer_outstanding
        total_immediately_payable += retailer_immediately_payable
        total_overdue += retailer_overdue
        
        retailer_summaries.append({
            "retailer_id": rid,
            "retailer_name": shop_name,
            "status": retailer.get("status", "active"),
            "upfront_percentage": upfront_pct,
            "commission_percentage": retailer.get("commission_percentage", 0),
            "outstanding": round(retailer_outstanding, 2),
            "immediately_payable": round(retailer_immediately_payable, 2),
            "overdue": round(retailer_overdue, 2),
            "pending_indents": indents_by_retailer.get(rid, 0),
            "today_dispatches": dispatches_by_retailer.get(rid, {}).get("count", 0),
            "today_dispatch_value": round(dispatches_by_retailer.get(rid, {}).get("value", 0), 2)
        })
    
    # Sort by outstanding (descending)
    retailer_summaries.sort(key=lambda x: x["outstanding"], reverse=True)
    
    # Count active vs churned
    active_count = sum(1 for r in retailers if r.get("status", "active") == "active")
    churned_count = len(retailers) - active_count
    
    return {
        "field_team_id": field_team_id,
        "total_retailers": len(retailers),
        "active_retailers": active_count,
        "churned_retailers": churned_count,
        "summary": {
            "total_outstanding": round(total_outstanding, 2),
            "immediately_payable": round(total_immediately_payable, 2),
            "overdue": round(total_overdue, 2),
            "pending_indents": sum(indents_by_retailer.values()),
            "today_dispatches": sum(d["count"] for d in dispatches_by_retailer.values()),
            "today_dispatch_value": round(sum(d["value"] for d in dispatches_by_retailer.values()), 2)
        },
        "retailer_summaries": retailer_summaries
    }


@router.get("/field-team/retailer/{retailer_id}/dashboard")
async def get_retailer_dashboard_for_field_team(
    retailer_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get full dashboard data for a specific retailer (for Field Team view).
    This mimics the retailer portal's dashboard endpoint but for field team access.
    """
    if current_user.get("role") != "field_team":
        raise HTTPException(status_code=403, detail="Only field team members can access this endpoint")
    
    field_team_id = current_user.get("user_id")
    
    # Verify this retailer is assigned to the field team member
    retailer = await verify_retailer_assigned_to_field_team(retailer_id, field_team_id)
    
    today = get_ist_today()
    today_str = today.isoformat()
    
    # Default date range: last 30 days
    if not start_date:
        start_date = (today - timedelta(days=30)).isoformat()
    if not end_date:
        end_date = today_str
    
    # Fetch all relevant data for this retailer
    # Indents
    indents = await db.retailer_indents.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("indent_date", -1).to_list(500)
    
    # Dispatches
    dispatches = await db.retailer_dispatches.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("dispatch_date", -1).to_list(500)
    
    # Invoices
    invoices = await db.retailer_invoices.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("invoice_date", -1).to_list(500)
    
    # Rejections
    rejections = await db.retailer_rejections.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("rejection_date", -1).to_list(1000)
    
    # Payments
    payments = await db.retailer_payments.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(500)
    
    # Credit Notes
    credit_notes = await db.retailer_credit_notes.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    
    # Calculate summary metrics
    upfront_pct = retailer.get("upfront_collection_percentage", 50)
    is_full_upfront = upfront_pct == 100
    
    total_outstanding = 0
    immediately_payable = 0
    overdue = 0
    
    for inv in invoices:
        if inv.get("status") not in ["pending", "partial"]:
            continue
            
        inv_date = inv.get("invoice_date")
        if isinstance(inv_date, str):
            inv_date_obj = datetime.fromisoformat(inv_date[:10]).date()
        elif isinstance(inv_date, datetime):
            inv_date_obj = inv_date.date()
        else:
            continue
        
        gross_value = inv.get("gross_value", 0) or inv.get("total_mrp_value", 0) or 0
        rejection_amount = inv.get("rejection_amount", 0) or 0
        commission_amount = inv.get("commission_amount", 0) or 0
        paid_amount = inv.get("paid_amount", 0) or 0
        total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        
        net_payable = inv.get("net_payable", 0) or 0
        if net_payable <= 0:
            net_payable = gross_value - rejection_amount - commission_amount
        
        final_payable = net_payable - total_credit_adjusted
        pending_amount = max(0, final_payable - paid_amount)
        
        if pending_amount <= 0:
            continue
        
        total_outstanding += pending_amount
        days_since = (today - inv_date_obj).days
        
        if is_full_upfront:
            immediately_payable += pending_amount
            if days_since > 0:
                overdue += pending_amount
        else:
            upfront_portion = final_payable * (upfront_pct / 100)
            unpaid_upfront = max(0, upfront_portion - paid_amount)
            
            if days_since == 0:
                immediately_payable += min(upfront_portion, pending_amount)
            elif days_since >= 1 and days_since <= 4:
                if unpaid_upfront > 0:
                    immediately_payable += unpaid_upfront
            elif days_since >= 5:
                immediately_payable += pending_amount
                overdue += pending_amount
    
    # Calculate total sales (from dispatches in date range)
    total_sales = 0
    total_rejection_value = 0
    
    for disp in dispatches:
        disp_date = disp.get("dispatch_date", "")[:10]
        if start_date and disp_date < start_date:
            continue
        if end_date and disp_date > end_date:
            continue
        total_sales += disp.get("total_mrp_value", 0) or 0
    
    for rej in rejections:
        rej_date = rej.get("rejection_date", "")[:10]
        if start_date and rej_date < start_date:
            continue
        if end_date and rej_date > end_date:
            continue
        total_rejection_value += rej.get("rejection_value", 0) or 0
    
    net_sales = total_sales - total_rejection_value
    rejection_pct = (total_rejection_value / total_sales * 100) if total_sales > 0 else 0
    
    return {
        "retailer": retailer,
        "date_range": {
            "start": start_date,
            "end": end_date
        },
        "summary": {
            "total_outstanding": round(total_outstanding, 2),
            "immediately_payable": round(immediately_payable, 2),
            "overdue": round(overdue, 2),
            "total_sales": round(total_sales, 2),
            "total_rejection_value": round(total_rejection_value, 2),
            "net_sales": round(net_sales, 2),
            "rejection_percentage": round(rejection_pct, 2)
        },
        "counts": {
            "indents": len(indents),
            "dispatches": len(dispatches),
            "invoices": len(invoices),
            "rejections": len(rejections),
            "payments": len(payments),
            "credit_notes": len(credit_notes)
        },
        "indents": indents[:50],  # Limit for performance
        "dispatches": dispatches[:50],
        "invoices": invoices[:50],
        "rejections": rejections[:100],
        "payments": payments[:50],
        "credit_notes": credit_notes[:50]
    }


@router.post("/field-team/retailer/{retailer_id}/indent")
async def create_indent_for_retailer(
    retailer_id: str,
    input: RetailerIndentCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create an indent on behalf of a retailer (Field Team functionality).
    """
    if current_user.get("role") != "field_team":
        raise HTTPException(status_code=403, detail="Only field team members can access this endpoint")
    
    field_team_id = current_user.get("user_id")
    
    # Verify this retailer is assigned to the field team member
    retailer = await verify_retailer_assigned_to_field_team(retailer_id, field_team_id)
    
    # Get packagings for variant lookup
    all_packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
    packaging_map = {p.get("name", "").strip().lower(): p.get("id", "") for p in all_packagings}
    
    # Resolve variant IDs
    resolved_items = []
    for item in input.items:
        item_dict = item.model_dump()
        variant_id = item_dict.get("variant_id") or ""
        variant_name = item_dict.get("variant_name") or ""
        
        if not variant_id and variant_name:
            variant_name_lower = variant_name.strip().lower()
            variant_id = packaging_map.get(variant_name_lower, "")
            if variant_id:
                item_dict["variant_id"] = variant_id
        
        if not item_dict.get("variant_id"):
            item_dict["variant_id"] = ""
            if not item_dict.get("variant_name"):
                item_dict["variant_name"] = "Kg"
        
        resolved_items.append(item_dict)
    
    import uuid
    from models import RetailerIndent
    
    indent = RetailerIndent(
        retailer_id=retailer_id,
        retailer_name=retailer.get("company_name") or retailer.get("name", "Unknown"),
        indent_date=input.indent_date,
        items=[RetailerIndentItem(**item) for item in resolved_items],
        remarks=input.remarks,
        created_by=current_user["user_id"],
        created_by_role="field_team"
    )
    
    doc = indent.model_dump()
    # Store indent_date as YYYY-MM-DD string
    if isinstance(doc["indent_date"], datetime):
        doc["indent_date"] = doc["indent_date"].strftime("%Y-%m-%d")
    else:
        doc["indent_date"] = str(doc["indent_date"])[:10]
    doc["created_at"] = doc["created_at"].isoformat()
    doc["created_by_field_team"] = True
    doc["field_team_id"] = field_team_id
    
    await db.retailer_indents.insert_one(doc)
    
    logger.info(f"Field team {field_team_id} created indent {indent.id} for retailer {retailer_id}")
    
    return {"id": indent.id, "message": "Indent created successfully on behalf of retailer"}


@router.get("/field-team/retailer/{retailer_id}/payment-details")
async def get_retailer_payment_details_for_field_team(
    retailer_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment details for a specific retailer (for Field Team view).
    Uses the shared compute_retailer_payment_details function to ensure
    consistency with the retailer portal view.
    """
    if current_user.get("role") != "field_team":
        raise HTTPException(status_code=403, detail="Only field team members can access this endpoint")
    
    field_team_id = current_user.get("user_id")
    
    # Verify this retailer is assigned to the field team member
    retailer = await verify_retailer_assigned_to_field_team(retailer_id, field_team_id)
    
    # Use the shared computation function - same as retailer portal
    result = await compute_retailer_payment_details(retailer_id, start_date, end_date)
    
    # Add retailer info to the response for Field Team context
    result["retailer_id"] = retailer_id
    result["retailer_name"] = retailer.get("company_name") or retailer.get("name")
    result["date_range"] = {"start": start_date, "end": end_date}
    
    return result


@router.get("/field-team/retailer/{retailer_id}/payment-ledger")
async def get_retailer_payment_ledger_for_field_team(
    retailer_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment ledger for a specific retailer (for Field Team view).
    Shows all payments received date-wise with invoice adjustments.
    """
    retailer = await verify_field_team_retailer_access(current_user, retailer_id)
    
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
                "payment_groups": {},
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
        adjusted_invoices = payment.get("adjusted_invoices", [])
        for adj in adjusted_invoices:
            inv_id = adj.get("invoice_id")
            inv_info = invoice_map.get(inv_id, {})
            group["invoice_adjustments"].append({
                "invoice_id": inv_id,
                "invoice_number": inv_info.get("invoice_number", ""),
                "invoice_date": inv_info.get("invoice_date", ""),
                "amount": adj.get("amount", 0)
            })
    
    # Convert to list format
    result = []
    for date_key in sorted(date_groups.keys(), reverse=True):
        date_data = date_groups[date_key]
        payment_list = list(date_data["payment_groups"].values())
        result.append({
            "date": date_data["date"],
            "total_amount": round(date_data["total_amount"], 2),
            "payments": payment_list
        })
    
    return {
        "retailer_id": retailer_id,
        "retailer_name": retailer.get("company_name") or retailer.get("name"),
        "date_range": {"start": start_date, "end": end_date},
        "entries": result,
        "total_payments": round(sum(p.get("amount", 0) for p in payments), 2)
    }



# ============================================================
# PROXY ENDPOINTS FOR FIELD TEAM TO ACCESS RETAILER DATA
# These endpoints allow field team to access retailer-specific 
# data as if they were the retailer (for viewing retailer portal)
# ============================================================

async def verify_field_team_retailer_access(current_user: dict, retailer_id: str):
    """Helper to verify field team has access to the specified retailer"""
    if current_user.get("role") != "field_team":
        raise HTTPException(status_code=403, detail="Only field team members can access this endpoint")
    
    field_team_id = current_user.get("user_id")
    
    # Verify this retailer is assigned to the field team member
    retailer = await verify_retailer_assigned_to_field_team(retailer_id, field_team_id)
    
    return retailer


@router.get("/field-team/retailer/{retailer_id}/dashboard-data")
async def get_retailer_dashboard_data_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard data for a specific retailer (mimics /api/retailer-dashboard)"""
    retailer = await verify_field_team_retailer_access(current_user, retailer_id)
    
    # Return dashboard data in the same format as retailer-dashboard endpoint
    return {
        "retailer": retailer,
        "summary": {
            "total_orders": 0,
            "pending_orders": 0,
            "total_spent": 0
        }
    }


@router.get("/field-team/retailer/{retailer_id}-indents")
async def get_retailer_indents_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get indents for a specific retailer"""
    await verify_field_team_retailer_access(current_user, retailer_id)
    
    indents = await db.retailer_indents.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("indent_date", -1).to_list(1000)
    
    return indents


@router.get("/field-team/retailer/{retailer_id}-dispatches")
async def get_retailer_dispatches_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get dispatches for a specific retailer"""
    await verify_field_team_retailer_access(current_user, retailer_id)
    
    dispatches = await db.retailer_dispatches.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("dispatch_date", -1).to_list(1000)
    
    return dispatches


@router.get("/field-team/retailer/{retailer_id}-invoices")
async def get_retailer_invoices_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoices for a specific retailer"""
    await verify_field_team_retailer_access(current_user, retailer_id)
    
    invoices = await db.retailer_invoices.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("invoice_date", -1).to_list(1000)
    
    return invoices


@router.get("/field-team/retailer/{retailer_id}-rejections")
async def get_retailer_rejections_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get rejections for a specific retailer with credit note info attached"""
    await verify_field_team_retailer_access(current_user, retailer_id)
    
    rejections = await db.retailer_rejections.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("rejection_date", -1).to_list(5000)
    
    # Attach credit note info using shared helper
    await attach_credit_notes_to_rejections(rejections)
    
    return rejections


@router.get("/field-team/retailer/{retailer_id}-grn")
async def get_retailer_grn_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get GRN records for a specific retailer"""
    await verify_field_team_retailer_access(current_user, retailer_id)
    
    grns = await db.retailer_grn.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    return grns


@router.get("/field-team/retailer/{retailer_id}-payments")
async def get_retailer_payments_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get payments for a specific retailer"""
    await verify_field_team_retailer_access(current_user, retailer_id)
    
    payments = await db.retailer_payments.find(
        {"retailer_id": retailer_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(500)
    
    return payments


@router.get("/field-team/retailer/{retailer_id}/immediately-payable")
async def get_retailer_immediately_payable_for_field_team(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get immediately payable amount for a specific retailer"""
    retailer = await verify_field_team_retailer_access(current_user, retailer_id)
    
    today = get_ist_today()
    upfront_pct = retailer.get("upfront_collection_percentage", 50)
    is_full_upfront = upfront_pct == 100
    
    # Fetch pending/partial invoices
    invoices = await db.retailer_invoices.find(
        {"retailer_id": retailer_id, "status": {"$in": ["pending", "partial"]}},
        {"_id": 0}
    ).to_list(500)
    
    immediately_payable = 0
    total_outstanding = 0
    
    for inv in invoices:
        inv_date = inv.get("invoice_date")
        if isinstance(inv_date, str):
            inv_date_obj = datetime.fromisoformat(inv_date[:10]).date()
        elif isinstance(inv_date, datetime):
            inv_date_obj = inv_date.date()
        else:
            continue
        
        gross_value = inv.get("gross_value", 0) or inv.get("total_mrp_value", 0) or 0
        rejection_amount = inv.get("rejection_amount", 0) or 0
        commission_amount = inv.get("commission_amount", 0) or 0
        paid_amount = inv.get("paid_amount", 0) or 0
        total_credit_adjusted = inv.get("total_credit_adjusted", 0) or 0
        
        net_payable = inv.get("net_payable", 0) or 0
        if net_payable <= 0:
            net_payable = gross_value - rejection_amount - commission_amount
        
        final_payable = net_payable - total_credit_adjusted
        pending_amount = max(0, final_payable - paid_amount)
        
        if pending_amount <= 0:
            continue
        
        total_outstanding += pending_amount
        days_since = (today - inv_date_obj).days
        
        if is_full_upfront:
            immediately_payable += pending_amount
        else:
            upfront_portion = final_payable * (upfront_pct / 100)
            unpaid_upfront = max(0, upfront_portion - paid_amount)
            
            if days_since == 0:
                immediately_payable += min(upfront_portion, pending_amount)
            elif days_since >= 1 and days_since <= 4:
                if unpaid_upfront > 0:
                    immediately_payable += unpaid_upfront
            elif days_since >= 5:
                immediately_payable += pending_amount
    
    return {
        "immediately_payable": round(immediately_payable, 2),
        "total_outstanding": round(total_outstanding, 2),
        "upfront_percentage": upfront_pct
    }



@router.get("/field-team/retailer/{retailer_id}/payment-summary")
async def get_retailer_payment_summary_for_field_team(
    retailer_id: str,
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment summary for a specific retailer (for Field Team view).
    Uses the shared compute_retailer_payment_summary function to ensure
    consistency with the retailer portal view.
    """
    retailer = await verify_field_team_retailer_access(current_user, retailer_id)
    
    # Use the shared computation function - same as retailer portal
    result = await compute_retailer_payment_summary(retailer_id, start_date, end_date)
    
    # Add retailer info to the response for Field Team context
    result["retailer_name"] = retailer.get("company_name") or retailer.get("name")
    result["upfront_percentage"] = retailer.get("upfront_collection_percentage", 50)
    result["commission_percentage"] = retailer.get("commission_percentage", 0)
    result["date_range"] = {"start": start_date, "end": end_date}
    
    return result
