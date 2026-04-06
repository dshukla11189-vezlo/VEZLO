"""
Expenses Routes - Variable and Fixed Expenses
"""
from fastapi import APIRouter, HTTPException, Depends
from dependencies import db, get_current_user
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api", tags=["expenses"])


# ============================================================================
# VARIABLE EXPENSES
# ============================================================================
@router.get("/expenses/variable")
async def get_variable_expenses(
    from_date: str = None,
    to_date: str = None,
    category: str = None,
    settled: str = None,
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
            "settlement_date": settlement_date,
            "settlement_remarks": settlement_remarks,
            "settled_by": current_user["email"],
            "settled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": f"Settled {result.modified_count} expenses", "count": result.modified_count}


# ============================================================================
# FIXED EXPENSES
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
