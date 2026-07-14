"""
Expenses Routes (Variable & Fixed)
==================================
Extracted from server.py for modular organization.
Handles variable expenses, fixed expenses, and expense categories.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import Optional
import uuid

from dependencies import (
    db,
    get_current_user,
)
from utils.retailers import get_active_retailers_on_date

router = APIRouter(tags=["expenses"])

# SECTION: VARIABLE EXPENSES ROUTES (Lines ~3104-3210)
# ============================================================================

@router.get("/expenses/variable")
async def get_variable_expenses(
    from_date: str = None,
    to_date: str = None,
    category: str = None,
    settled: str = None,
    paid_by: str = None,
    paid_to: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get variable expenses with optional filters"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    
    if from_date:
        query["date"] = {"$gte": from_date}
    if to_date:
        if "date" in query:
            query["date"]["$lte"] = to_date + "T23:59:59"
        else:
            query["date"] = {"$lte": to_date + "T23:59:59"}
    if category:
        query["category"] = category
    if settled:
        query["is_settled"] = settled.lower() == "true"
    if paid_by:
        query["paid_by"] = paid_by
    if paid_to:
        # Case-insensitive partial match for paid_to (vendor name)
        query["paid_to"] = {"$regex": paid_to, "$options": "i"}
    
    expenses = await db.variable_expenses.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return expenses

@router.post("/expenses/variable")
async def create_variable_expense(expense: dict, current_user: dict = Depends(get_current_user)):
    """Create a new variable expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    expense["id"] = str(uuid.uuid4())
    expense["created_at"] = datetime.now(timezone.utc).isoformat()
    expense["created_by"] = current_user["email"]
    
    # Set settlement_status based on paid_by and payment_status
    is_employee_paid = expense.get("paid_by_type") == "employee" or \
        (expense.get("paid_by") and expense.get("paid_by") != "Company" and \
         "company" not in expense.get("paid_by", "").lower() and \
         expense.get("paid_by") != "Vendor")
    
    if is_employee_paid and expense.get("payment_status") == "pending":
        expense["settlement_status"] = "pending_reimbursement"
        expense["is_settled"] = False
    elif expense.get("payment_status") == "paid":
        expense["settlement_status"] = "settled"
        expense["is_settled"] = True
    
    await db.variable_expenses.insert_one(expense.copy())
    if "_id" in expense:
        del expense["_id"]
    
    return expense

@router.put("/expenses/variable/{expense_id}")
async def update_variable_expense(expense_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a variable expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current_user["email"]
    
    # If payment_status is being changed to 'pending', check if employee-paid and reset settlement_status
    if updates.get("payment_status") == "pending":
        # Fetch the existing expense to check paid_by_type
        existing = await db.variable_expenses.find_one({"id": expense_id})
        if existing:
            is_employee_paid = existing.get("paid_by_type") == "employee" or \
                (existing.get("paid_by") and existing.get("paid_by") != "Company" and \
                 "company" not in existing.get("paid_by", "").lower())
            
            if is_employee_paid:
                # Reset settlement status for employee-paid expenses when changing to pending
                updates["settlement_status"] = "pending_reimbursement"
                updates["is_settled"] = False
    
    result = await db.variable_expenses.update_one(
        {"id": expense_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense updated"}

@router.delete("/expenses/variable/{expense_id}")
async def delete_variable_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a variable expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.variable_expenses.delete_one({"id": expense_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted"}

@router.post("/expenses/variable/bulk-settle")
async def bulk_settle_variable_expenses(data: dict, current_user: dict = Depends(get_current_user)):
    """Bulk settle employee expenses"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    expense_ids = data.get("expense_ids", [])
    settlement_date = data.get("settlement_date", datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    settlement_remarks = data.get("settlement_remarks", "")
    
    result = await db.variable_expenses.update_many(
        {"id": {"$in": expense_ids}},
        {"$set": {
            "is_settled": True,
            "payment_status": "paid",  # Update new payment_status field
            "settlement_date": settlement_date,
            "settlement_remarks": settlement_remarks,
            "settled_by": current_user["email"],
            "settled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": f"Settled {result.modified_count} expenses", "count": result.modified_count}

@router.post("/expenses/variable/migrate-paid-by-type")
async def migrate_variable_expenses_paid_by_type(current_user: dict = Depends(get_current_user)):
    """One-time migration to add paid_by_type field to variable expenses based on paid_by value"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Update expenses where paid_by is 'Company' or 'Vendor' -> paid_by_type = 'company'
    company_result = await db.variable_expenses.update_many(
        {"paid_by_type": {"$exists": False}, "paid_by": {"$in": ["Company", "Vendor", None, ""]}},
        {"$set": {"paid_by_type": "company", "settlement_status": "settled"}}
    )
    
    # Update expenses where paid_by is an employee name -> paid_by_type = 'employee'
    employee_result = await db.variable_expenses.update_many(
        {"paid_by_type": {"$exists": False}, "paid_by": {"$nin": ["Company", "Vendor", None, ""]}},
        {"$set": {"paid_by_type": "employee", "settlement_status": "settled", "is_settled": True}}
    )
    
    return {
        "message": "Migration completed",
        "company_expenses_updated": company_result.modified_count,
        "employee_expenses_updated": employee_result.modified_count
    }


@router.post("/expenses/variable/fix-settlement-status")
async def fix_settlement_status_for_pending(current_user: dict = Depends(get_current_user)):
    """Fix settlement_status for employee-paid expenses that have payment_status=pending but settlement_status=settled"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Find and fix employee-paid expenses where:
    # - payment_status is 'pending'
    # - settlement_status is 'settled' (which is wrong - should be pending_reimbursement)
    result = await db.variable_expenses.update_many(
        {
            "payment_status": "pending",
            "settlement_status": "settled",
            "$or": [
                {"paid_by_type": "employee"},
                {"paid_by": {"$nin": ["Company", "Vendor", None, ""]}}
            ]
        },
        {
            "$set": {
                "settlement_status": "pending_reimbursement",
                "is_settled": False
            }
        }
    )
    
    return {
        "message": f"Fixed {result.modified_count} expenses (settlement_status: settled -> pending_reimbursement)",
        "fixed_count": result.modified_count
    }

# ============================================================================
# SECTION: FIXED EXPENSES ROUTES (Lines ~3208-3370)
# ============================================================================

@router.get("/expenses/fixed")
async def get_fixed_expenses(
    month: int = None,
    year: int = None,
    category: str = None,
    status: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get fixed expenses with optional filters"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    
    if month is not None:
        query["month"] = month
    if year is not None:
        query["year"] = year
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    
    expenses = await db.fixed_expenses.find(query, {"_id": 0}).sort([("due_date", 1)]).to_list(500)
    return expenses

@router.post("/expenses/fixed")
async def create_fixed_expense(expense: dict, current_user: dict = Depends(get_current_user)):
    """Create a new fixed expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    expense["id"] = str(uuid.uuid4())
    expense["created_at"] = datetime.now(timezone.utc).isoformat()
    expense["created_by"] = current_user["email"]
    
    await db.fixed_expenses.insert_one(expense.copy())
    if "_id" in expense:
        del expense["_id"]
    
    return expense

@router.put("/expenses/fixed/{expense_id}")
async def update_fixed_expense(expense_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a fixed expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current_user["email"]
    
    result = await db.fixed_expenses.update_one(
        {"id": expense_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense updated"}

@router.delete("/expenses/fixed/{expense_id}")
async def delete_fixed_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a fixed expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.fixed_expenses.delete_one({"id": expense_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted"}

@router.post("/expenses/fixed/generate-recurring")
async def generate_recurring_expenses(data: dict, current_user: dict = Depends(get_current_user)):
    """Generate recurring expenses for a given month based on previous month's recurring entries"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_month = data.get("month", datetime.now().month)
    target_year = data.get("year", datetime.now().year)
    
    # Calculate previous month
    if target_month == 0:
        prev_month = 11
        prev_year = target_year - 1
    else:
        prev_month = target_month - 1 if target_month > 0 else 11
        prev_year = target_year if target_month > 0 else target_year - 1
    
    # Get recurring expenses from previous month
    prev_expenses = await db.fixed_expenses.find({
        "month": prev_month,
        "year": prev_year,
        "is_recurring": True
    }, {"_id": 0}).to_list(100)
    
    # Check which ones already exist for target month
    existing = await db.fixed_expenses.find({
        "month": target_month,
        "year": target_year
    }, {"_id": 0, "category": 1, "description": 1}).to_list(100)
    
    existing_keys = set((e.get("category", "") + e.get("description", "")) for e in existing)
    
    # Create new entries for target month
    created_count = 0
    for exp in prev_expenses:
        key = exp.get("category", "") + exp.get("description", "")
        if key not in existing_keys:
            new_expense = {
                "id": str(uuid.uuid4()),
                "month": target_month,
                "year": target_year,
                "category": exp.get("category"),
                "description": exp.get("description"),
                "amount": exp.get("amount"),
                "due_date": exp.get("due_date"),
                "is_recurring": True,
                "status": "Pending",
                "paid_by": "Company",
                "is_settled": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user["email"]
            }
            await db.fixed_expenses.insert_one(new_expense.copy())
            created_count += 1
    
    return {"message": f"Generated {created_count} recurring entries", "count": created_count}

@router.post("/expenses/fixed/bulk-settle")
async def bulk_settle_fixed_expenses(data: dict, current_user: dict = Depends(get_current_user)):
    """Bulk settle employee expenses"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    expense_ids = data.get("expense_ids", [])
    settlement_date = data.get("settlement_date", datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    settlement_remarks = data.get("settlement_remarks", "")
    
    result = await db.fixed_expenses.update_many(
        {"id": {"$in": expense_ids}},
        {"$set": {
            "is_settled": True,
            "settlement_date": settlement_date,
            "settlement_remarks": settlement_remarks,
            "settled_by": current_user["email"],
            "settled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": f"Settled {result.modified_count} expenses", "count": result.modified_count}

# ==================== VARIABLE EXPENSE BY RETAILER BREAKDOWN ====================

@router.get("/expenses/variable/by-retailer/{retailer_id}")
async def get_variable_expenses_by_retailer(
    retailer_id: str,
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get variable expense breakdown for a specific retailer.
    Returns VE shares based on split_type: all_equal, selected, proportional.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {"vertical": "retail"}
    if from_date:
        query["date"] = {"$gte": from_date}
    if to_date:
        if "date" in query:
            query["date"]["$lte"] = to_date + "T23:59:59"
        else:
            query["date"] = {"$lte": to_date + "T23:59:59"}
    
    expenses = await db.variable_expenses.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # Fetch all retailers for "all_equal" split type
    all_retailers = await db.users.find({"role": "retailer"}, {"_id": 0}).to_list(500)
    
    # Note: get_active_retailers_on_date is imported from utils.retailers
    
    # Build retailer shares
    retailer_shares = []
    total_share = 0
    
    for exp in expenses:
        exp_date = exp.get("date", "")[:10]
        amount = exp.get("amount", 0) or 0
        split_type = exp.get("split_type", "proportional")
        selected_retailer_ids = exp.get("retailer_ids", []) or []
        
        share = 0
        included = False
        retailers_count = 0
        
        if split_type == "selected":
            # Only selected retailers
            if retailer_id in selected_retailer_ids:
                share = round(amount / len(selected_retailer_ids), 2) if selected_retailer_ids else 0
                included = True
                retailers_count = len(selected_retailer_ids)
        elif split_type == "all_equal":
            # All active retailers on expense date
            active_ids = get_active_retailers_on_date(all_retailers, exp_date)
            if retailer_id in active_ids:
                share = round(amount / len(active_ids), 2) if active_ids else 0
                included = True
                retailers_count = len(active_ids)
        else:
            # proportional - this retailer's share depends on sales proportion
            # For now, mark as proportional (calculated in P&L)
            included = True
            share = 0  # Will be calculated based on sales
            retailers_count = -1  # Indicates proportional
        
        if included:
            total_share += share
            retailer_shares.append({
                "expense_id": exp.get("id"),
                "date": exp_date,
                "category": exp.get("category", "Other"),
                "description": exp.get("description", ""),
                "original_amount": amount,
                "split_type": split_type,
                "retailers_included": retailers_count,
                "retailer_share": round(share, 2),
                "paid_to": exp.get("paid_to", "")
            })
    
    return {
        "retailer_id": retailer_id,
        "total_share": round(total_share, 2),
        "expenses": retailer_shares
    }


# ==================== RETAILER PORTAL APIs ====================

