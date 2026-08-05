"""
Expenses Routes (Variable & Fixed)
==================================
Extracted from server.py for modular organization.
Handles variable expenses, fixed expenses, and expense categories.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
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
    """Get variable expenses with optional filters.
    
    If no date filter is provided, defaults to last 90 days to prevent
    unbounded result sets. Use explicit from_date/to_date for different ranges.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    
    # Apply default date filter (last 90 days) if no date filter provided
    if not from_date and not to_date:
        default_from = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
        query["date"] = {"$gte": default_from}
    else:
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
    
    # Increased limit from 500 to 2000 for date-bounded queries
    expenses = await db.variable_expenses.find(query, {"_id": 0}).sort("date", -1).to_list(2000)
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
    from_date: str = None,
    to_date: str = None,
    category: str = None,
    status: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get fixed expenses with optional filters.
    
    Supports two filter modes:
    1. Month/Year mode: Uses month and year params (legacy)
    2. Date Range mode: Uses from_date and to_date params (new)
    
    If date range params are provided, they take priority over month/year.
    If no filters provided, defaults to current month and year.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    
    # Date range mode takes priority
    if from_date or to_date:
        date_query = {}
        if from_date:
            date_query["$gte"] = from_date
        if to_date:
            date_query["$lte"] = to_date + "T23:59:59"
        if date_query:
            query["date"] = date_query
    # Fall back to month/year mode
    elif month is None and year is None:
        # Default to current month/year if no filters provided
        now = datetime.now(timezone.utc)
        query["month"] = now.month
        query["year"] = now.year
    else:
        if month is not None:
            query["month"] = month
        if year is not None:
            query["year"] = year
    
    if category:
        query["category"] = category
    if status:
        query["status"] = status
    
    # Increased limit from 500 to 2000 for filtered queries
    expenses = await db.fixed_expenses.find(query, {"_id": 0}).sort([("date", -1), ("due_date", 1)]).to_list(2000)
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
    """Generate recurring expenses for a given month based on:
    1. Previous month's recurring entries
    2. Active recurring expense templates
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_month = data.get("month", datetime.now().month)
    target_year = data.get("year", datetime.now().year)
    
    # Calculate previous month (months are 1-12)
    if target_month == 1:
        prev_month = 12
        prev_year = target_year - 1
    else:
        prev_month = target_month - 1
        prev_year = target_year
    
    # Get recurring expenses from previous month
    prev_expenses = await db.fixed_expenses.find({
        "month": prev_month,
        "year": prev_year,
        "is_recurring": True
    }, {"_id": 0}).to_list(100)
    
    # Get active recurring expense templates
    templates = await db.recurring_expense_templates.find({
        "is_active": {"$ne": False}
    }, {"_id": 0}).to_list(500)
    
    # Check which ones already exist for target month
    existing = await db.fixed_expenses.find({
        "month": target_month,
        "year": target_year
    }, {"_id": 0, "category": 1, "description": 1, "template_id": 1}).to_list(500)
    
    existing_keys = set((e.get("category", "") + e.get("description", "")) for e in existing)
    existing_template_ids = set(e.get("template_id") for e in existing if e.get("template_id"))
    
    # Calculate target date for the expense record
    target_date = f"{target_year}-{str(target_month).zfill(2)}-01"
    
    created_count = 0
    from_templates = 0
    from_prev_month = 0
    
    # 1. Generate from templates first
    for tmpl in templates:
        if tmpl.get("id") in existing_template_ids:
            continue  # Already generated from this template
        
        key = tmpl.get("category", "") + tmpl.get("description", "")
        if key in existing_keys:
            continue  # Similar expense already exists
        
        new_expense = {
            "id": str(uuid.uuid4()),
            "template_id": tmpl.get("id"),  # Link back to template
            "date": target_date,
            "month": target_month,
            "year": target_year,
            "category": tmpl.get("category"),
            "description": tmpl.get("description"),
            "amount": tmpl.get("amount"),
            "due_date": tmpl.get("due_date", 1),
            "vendor": tmpl.get("vendor", ""),
            "invoice_number": tmpl.get("invoice_number", ""),
            "linked_employee_id": tmpl.get("linked_employee_id"),
            "linked_employee_name": tmpl.get("linked_employee_name", ""),
            "expense_type": tmpl.get("expense_type", "general"),
            "is_recurring": True,
            "status": "Pending",
            "paid_by": "Company",
            "paid_by_type": "company",
            "is_settled": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user["email"],
            "generated_from": "template"
        }
        await db.fixed_expenses.insert_one(new_expense.copy())
        existing_keys.add(key)
        created_count += 1
        from_templates += 1
    
    # 2. Generate from previous month's recurring entries
    for exp in prev_expenses:
        key = exp.get("category", "") + exp.get("description", "")
        if key not in existing_keys:
            new_expense = {
                "id": str(uuid.uuid4()),
                "date": target_date,
                "month": target_month,
                "year": target_year,
                "category": exp.get("category"),
                "description": exp.get("description"),
                "amount": exp.get("amount"),
                "due_date": exp.get("due_date"),
                "vendor": exp.get("vendor", ""),
                "invoice_number": exp.get("invoice_number", ""),
                "is_recurring": True,
                "status": "Pending",
                "paid_by": "Company",
                "paid_by_type": "company",
                "is_settled": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user["email"],
                "generated_from": "previous_month"
            }
            await db.fixed_expenses.insert_one(new_expense.copy())
            existing_keys.add(key)
            created_count += 1
            from_prev_month += 1
    
    return {
        "message": f"Generated {created_count} recurring entries ({from_templates} from templates, {from_prev_month} from previous month)",
        "count": created_count,
        "from_templates": from_templates,
        "from_prev_month": from_prev_month
    }

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

# ============================================================================
# SECTION: CORPORATE EMPLOYEES (For recurring expense templates)
# ============================================================================

@router.get("/corporate-employees")
async def get_corporate_employees(current_user: dict = Depends(get_current_user)):
    """Get all corporate employees for expense management"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    employees = await db.corporate_employees.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("name", 1).to_list(500)
    return employees

@router.post("/corporate-employees")
async def create_corporate_employee(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a corporate employee for expense tracking"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage corporate employees")
    
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="Employee name is required")
    
    employee = {
        "id": str(uuid.uuid4()),
        "name": data.get("name"),
        "role": data.get("role", ""),
        "department": data.get("department", ""),
        "monthly_allowances": data.get("monthly_allowances", []),  # [{type: "Travel", amount: 5000}, ...]
        "notes": data.get("notes", ""),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["email"]
    }
    
    await db.corporate_employees.insert_one(employee.copy())
    if "_id" in employee:
        del employee["_id"]
    
    return employee

@router.put("/corporate-employees/{employee_id}")
async def update_corporate_employee(employee_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a corporate employee"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage corporate employees")
    
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = current_user["email"]
    
    # Remove id from update data if present
    if "id" in data:
        del data["id"]
    
    result = await db.corporate_employees.update_one(
        {"id": employee_id},
        {"$set": data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"message": "Employee updated"}

@router.delete("/corporate-employees/{employee_id}")
async def delete_corporate_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a corporate employee"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage corporate employees")
    
    result = await db.corporate_employees.update_one(
        {"id": employee_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    return {"message": "Employee deactivated"}

# ============================================================================
# SECTION: RECURRING EXPENSE TEMPLATES (For auto-generating fixed expenses)
# ============================================================================

@router.get("/recurring-expense-templates")
async def get_recurring_expense_templates(current_user: dict = Depends(get_current_user)):
    """Get all recurring expense templates"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    templates = await db.recurring_expense_templates.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("category", 1).to_list(500)
    return templates

@router.post("/recurring-expense-templates")
async def create_recurring_expense_template(data: dict, current_user: dict = Depends(get_current_user)):
    """Create a recurring expense template"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage templates")
    
    if not data.get("category") or not data.get("amount"):
        raise HTTPException(status_code=400, detail="Category and amount are required")
    
    template = {
        "id": str(uuid.uuid4()),
        "category": data.get("category"),
        "description": data.get("description", ""),
        "amount": float(data.get("amount", 0)),
        "due_date": int(data.get("due_date", 1)),  # Day of month (1-31)
        "vendor": data.get("vendor", ""),
        "invoice_number": data.get("invoice_number", ""),
        "linked_employee_id": data.get("linked_employee_id"),  # For allowances tied to employees
        "linked_employee_name": data.get("linked_employee_name", ""),
        "expense_type": data.get("expense_type", "general"),  # 'general', 'allowance', 'asset_emi', 'subscription'
        "notes": data.get("notes", ""),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["email"]
    }
    
    await db.recurring_expense_templates.insert_one(template.copy())
    if "_id" in template:
        del template["_id"]
    
    return template

@router.put("/recurring-expense-templates/{template_id}")
async def update_recurring_expense_template(template_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    """Update a recurring expense template"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage templates")
    
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = current_user["email"]
    
    if "id" in data:
        del data["id"]
    
    result = await db.recurring_expense_templates.update_one(
        {"id": template_id},
        {"$set": data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template updated"}

@router.delete("/recurring-expense-templates/{template_id}")
async def delete_recurring_expense_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """Soft-delete a recurring expense template"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage templates")
    
    result = await db.recurring_expense_templates.update_one(
        {"id": template_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template deactivated"}

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
    
    # Fetch first dispatch date for each retailer using aggregation (more efficient)
    first_dispatch_pipeline = [
        {"$group": {
            "_id": "$retailer_id",
            "first_dispatch_date": {"$min": "$date"}
        }}
    ]
    first_dispatch_results = await db.retailer_dispatches.aggregate(first_dispatch_pipeline).to_list(500)
    retailer_first_dispatch = {
        r["_id"]: str(r["first_dispatch_date"])[:10] if r.get("first_dispatch_date") else None
        for r in first_dispatch_results
    }
    
    # Enrich retailers with first_dispatch_date
    for r in all_retailers:
        rid = r.get("id")
        if rid and rid in retailer_first_dispatch:
            r["first_dispatch_date"] = retailer_first_dispatch[rid]
    
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
        
        # First check: Is the retailer active on the expense date?
        active_ids = get_active_retailers_on_date(all_retailers, exp_date)
        retailer_was_active = retailer_id in active_ids
        
        if split_type == "selected":
            # Only selected retailers - but also must be active on that date
            if retailer_id in selected_retailer_ids and retailer_was_active:
                # Filter selected_retailer_ids to only those active on that date
                active_selected = [rid for rid in selected_retailer_ids if rid in active_ids]
                if active_selected:
                    share = round(amount / len(active_selected), 2)
                    included = True
                    retailers_count = len(active_selected)
        elif split_type == "all_equal":
            # All active retailers on expense date
            if retailer_was_active:
                share = round(amount / len(active_ids), 2) if active_ids else 0
                included = True
                retailers_count = len(active_ids)
        else:
            # proportional - this retailer's share depends on sales proportion
            # BUT only include if retailer was active on the expense date
            if retailer_was_active:
                included = True
                share = 0  # Will be calculated based on sales proportion
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


# ==================== VENDOR MANAGEMENT ====================

@router.get("/vendors")
async def get_vendors(current_user: dict = Depends(get_current_user)):
    """Get all vendors"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    vendors = await db.vendors.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return vendors

@router.post("/vendors")
async def create_vendor(vendor: dict, current_user: dict = Depends(get_current_user)):
    """Create a new vendor"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Validate required fields
    if not vendor.get("name"):
        raise HTTPException(status_code=400, detail="Vendor name is required")
    
    # Check for duplicate name (case-insensitive)
    existing = await db.vendors.find_one({"name": {"$regex": f"^{vendor.get('name')}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Vendor with this name already exists")
    
    vendor["id"] = str(uuid.uuid4())
    vendor["created_at"] = datetime.now(timezone.utc).isoformat()
    vendor["created_by"] = current_user["email"]
    vendor["is_active"] = True
    
    await db.vendors.insert_one(vendor.copy())
    if "_id" in vendor:
        del vendor["_id"]
    
    return vendor

@router.put("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a vendor"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check for duplicate name if name is being updated
    if updates.get("name"):
        existing = await db.vendors.find_one({
            "name": {"$regex": f"^{updates.get('name')}$", "$options": "i"},
            "id": {"$ne": vendor_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Vendor with this name already exists")
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current_user["email"]
    
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    return {"message": "Vendor updated"}

@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a vendor"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if vendor is used in any expenses
    expense_with_vendor = await db.variable_expenses.find_one({"vendor_id": vendor_id})
    if expense_with_vendor:
        # Soft delete - mark as inactive
        result = await db.vendors.update_one(
            {"id": vendor_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Vendor not found")
        return {"message": "Vendor deactivated (has associated expenses)"}
    
    result = await db.vendors.delete_one({"id": vendor_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    return {"message": "Vendor deleted"}

@router.post("/vendors/migrate-from-expenses")
async def migrate_vendors_from_expenses(current_user: dict = Depends(get_current_user)):
    """One-time migration to create vendors from existing expense paid_to values"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Get all unique paid_to values from variable_expenses
    pipeline = [
        {"$match": {"paid_to": {"$exists": True, "$nin": [None, ""]}}},
        {"$group": {"_id": "$paid_to"}},
        {"$sort": {"_id": 1}}
    ]
    paid_to_values = await db.variable_expenses.aggregate(pipeline).to_list(1000)
    
    created_count = 0
    for item in paid_to_values:
        vendor_name = item["_id"]
        if not vendor_name or not vendor_name.strip():
            continue
        
        # Check if vendor already exists
        existing = await db.vendors.find_one({"name": {"$regex": f"^{vendor_name}$", "$options": "i"}})
        if not existing:
            new_vendor = {
                "id": str(uuid.uuid4()),
                "name": vendor_name.strip(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user["email"],
                "is_active": True,
                "migrated": True
            }
            await db.vendors.insert_one(new_vendor)
            created_count += 1
    
    return {"message": f"Created {created_count} vendors from existing expenses"}

