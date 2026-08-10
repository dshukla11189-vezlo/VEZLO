"""
Labour Management Routes - Daily Variable Labour Costs
=====================================================
Handles:
- Labour CRUD (create, read, update, soft-delete labourers)
- Labour Attendance tracking
- Labour Costs Summary

Moved from server.py as part of codebase refactoring.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from datetime import datetime, timezone, timedelta
import uuid

from dependencies import get_current_user, get_db

router = APIRouter(prefix="/api", tags=["Labour Management"])


# --- Helper Functions ---

def get_rate_for_date(labourer: dict, target_date: str) -> dict:
    """
    Get the applicable daily_rate and overtime_rate for a specific date.
    Uses salary_history to find the correct rate based on effective dates.
    Falls back to default rates if no history exists.
    """
    salary_history = labourer.get("salary_history", [])
    
    # If no salary history, use current default rates
    if not salary_history:
        return {
            "daily_rate": labourer.get("default_daily_rate", 0) or 0,
            "overtime_rate": labourer.get("default_overtime_rate", 0) or 0,
            "monthly_salary": labourer.get("monthly_salary", 0) or 0
        }
    
    # Find the rate entry that was active on target_date
    # Sort by effective_from descending to find the most recent applicable rate
    sorted_history = sorted(salary_history, key=lambda x: x.get("effective_from", ""), reverse=True)
    
    for entry in sorted_history:
        effective_from = entry.get("effective_from", "")
        effective_to = entry.get("effective_to")
        
        # Check if target_date falls within this period
        # effective_to is None means it's the current rate
        if effective_from <= target_date:
            if effective_to is None or target_date <= effective_to:
                return {
                    "daily_rate": entry.get("daily_rate", 0) or 0,
                    "overtime_rate": entry.get("overtime_rate", 0) or 0,
                    "monthly_salary": entry.get("monthly_salary", 0) or 0
                }
    
    # Fallback: if target_date is before any recorded history, use the earliest rate
    if sorted_history:
        earliest = sorted_history[-1]  # Last in descending order = earliest
        return {
            "daily_rate": earliest.get("daily_rate", 0) or 0,
            "overtime_rate": earliest.get("overtime_rate", 0) or 0,
            "monthly_salary": earliest.get("monthly_salary", 0) or 0
        }
    
    # Final fallback
    return {
        "daily_rate": labourer.get("default_daily_rate", 0) or 0,
        "overtime_rate": labourer.get("default_overtime_rate", 0) or 0,
        "monthly_salary": labourer.get("monthly_salary", 0) or 0
    }


# --- Labour CRUD Routes ---

@router.get("/labours")
async def list_labours(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get all labourers, optionally including inactive ones"""
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    labours = await db.labours.find(query, {"_id": 0}).sort("name", 1).to_list(100)
    return labours


@router.post("/labours")
async def create_labour(
    labour: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Create a new labourer with optional monthly salary"""
    # Check for duplicate name
    existing = await db.labours.find_one({"name": {"$regex": f"^{labour.get('name', '')}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="A labourer with this name already exists")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily_rate = float(labour.get("default_daily_rate", 0))
    overtime_rate = float(labour.get("default_overtime_rate", 0))
    monthly_salary = float(labour.get("monthly_salary", 0))
    
    # Initialize salary history with the starting rates
    salary_history = [{
        "daily_rate": daily_rate,
        "overtime_rate": overtime_rate,
        "monthly_salary": monthly_salary,
        "effective_from": labour.get("joining_date") or today,
        "effective_to": None,  # Current rate
        "changed_at": datetime.now(timezone.utc).isoformat()
    }]
    
    doc = {
        "id": str(uuid.uuid4()),
        "name": labour.get("name"),
        "phone": labour.get("phone"),
        "monthly_salary": monthly_salary,
        "default_daily_rate": daily_rate,
        "default_overtime_rate": overtime_rate,
        "bank_account_number": labour.get("bank_account_number"),
        "ifsc_code": labour.get("ifsc_code"),
        "joining_date": labour.get("joining_date"),
        "is_active": labour.get("is_active", True),
        "salary_history": salary_history,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.labours.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/labours/{labour_id}")
async def update_labour(
    labour_id: str,
    labour: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update a labourer's details. Rate changes are tracked in salary_history."""
    existing = await db.labours.find_one({"id": labour_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    update_data = {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Track salary/rate changes in history
    rate_changed = False
    old_daily_rate = existing.get("default_daily_rate", 0)
    old_overtime_rate = existing.get("default_overtime_rate", 0)
    old_monthly_salary = existing.get("monthly_salary", 0)
    
    new_daily_rate = float(labour.get("default_daily_rate", old_daily_rate)) if "default_daily_rate" in labour else old_daily_rate
    new_overtime_rate = float(labour.get("default_overtime_rate", old_overtime_rate)) if "default_overtime_rate" in labour else old_overtime_rate
    new_monthly_salary = float(labour.get("monthly_salary", old_monthly_salary)) if "monthly_salary" in labour else old_monthly_salary
    
    # Check if any rate has changed
    if (new_daily_rate != old_daily_rate or 
        new_overtime_rate != old_overtime_rate or
        new_monthly_salary != old_monthly_salary):
        rate_changed = True
    
    if "name" in labour:
        update_data["name"] = labour["name"]
    if "phone" in labour:
        update_data["phone"] = labour["phone"]
    if "default_daily_rate" in labour:
        update_data["default_daily_rate"] = float(labour["default_daily_rate"])
    if "default_overtime_rate" in labour:
        update_data["default_overtime_rate"] = float(labour["default_overtime_rate"])
    if "monthly_salary" in labour:
        update_data["monthly_salary"] = float(labour["monthly_salary"])
    if "bank_account_number" in labour:
        update_data["bank_account_number"] = labour["bank_account_number"]
    if "ifsc_code" in labour:
        update_data["ifsc_code"] = labour["ifsc_code"]
    if "joining_date" in labour:
        update_data["joining_date"] = labour["joining_date"]
    if "is_active" in labour:
        update_data["is_active"] = labour["is_active"]
    
    # If rate changed, update salary history
    if rate_changed:
        # Get existing salary history or create new
        salary_history = existing.get("salary_history", [])
        
        # If there's an existing current entry (no effective_to), close it
        for entry in salary_history:
            if entry.get("effective_to") is None:
                entry["effective_to"] = today
        
        # Add new rate entry effective from today
        salary_history.append({
            "daily_rate": new_daily_rate,
            "overtime_rate": new_overtime_rate,
            "monthly_salary": new_monthly_salary,
            "effective_from": today,
            "effective_to": None,  # Current rate
            "changed_at": datetime.now(timezone.utc).isoformat()
        })
        
        update_data["salary_history"] = salary_history
    
    if update_data:
        await db.labours.update_one({"id": labour_id}, {"$set": update_data})
    
    updated = await db.labours.find_one({"id": labour_id}, {"_id": 0})
    return updated


@router.post("/labours/{labour_id}/salary-revision")
async def revise_labour_salary(
    labour_id: str,
    revision: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """
    Create a salary revision with a specific effective date.
    This allows backdating or future-dating salary changes.
    
    Request body:
    {
        "monthly_salary": 15000,  # Optional
        "daily_rate": 500,        # Required
        "overtime_rate": 55,      # Required
        "effective_from": "2026-08-01"  # Required - when this rate becomes effective
    }
    """
    existing = await db.labours.find_one({"id": labour_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    # Validate required fields
    if "daily_rate" not in revision or "overtime_rate" not in revision:
        raise HTTPException(status_code=400, detail="daily_rate and overtime_rate are required")
    if "effective_from" not in revision:
        raise HTTPException(status_code=400, detail="effective_from date is required")
    
    new_daily_rate = float(revision["daily_rate"])
    new_overtime_rate = float(revision["overtime_rate"])
    new_monthly_salary = float(revision.get("monthly_salary", 0))
    effective_from = revision["effective_from"]  # YYYY-MM-DD format
    
    # Get existing salary history or create new
    salary_history = existing.get("salary_history", [])
    
    # Check if this is updating the current rate or inserting a historical revision
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    if effective_from >= today:
        # Future or current date - close any current entry and add new
        for entry in salary_history:
            if entry.get("effective_to") is None:
                # Close the previous current entry at the day before the new effective date
                close_date = (datetime.strptime(effective_from, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
                entry["effective_to"] = close_date
        
        # Add new rate entry
        salary_history.append({
            "daily_rate": new_daily_rate,
            "overtime_rate": new_overtime_rate,
            "monthly_salary": new_monthly_salary,
            "effective_from": effective_from,
            "effective_to": None,  # Current rate
            "changed_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Also update the current default rates
        update_data = {
            "default_daily_rate": new_daily_rate,
            "default_overtime_rate": new_overtime_rate,
            "monthly_salary": new_monthly_salary,
            "salary_history": salary_history
        }
    else:
        # Historical/backdated revision - insert into history maintaining chronological order
        # Find where to insert this entry
        inserted = False
        for i, entry in enumerate(salary_history):
            entry_from = entry.get("effective_from", "")
            entry_to = entry.get("effective_to")
            
            # If the new effective_from falls within this entry's period
            if entry_from <= effective_from and (entry_to is None or entry_to >= effective_from):
                # Split this entry
                if entry_from < effective_from:
                    # Create a new entry for the period before
                    new_entry_end = (datetime.strptime(effective_from, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
                    entry["effective_to"] = new_entry_end
                
                # Insert the new revision
                new_revision_entry = {
                    "daily_rate": new_daily_rate,
                    "overtime_rate": new_overtime_rate,
                    "monthly_salary": new_monthly_salary,
                    "effective_from": effective_from,
                    "effective_to": entry_to,  # Takes the original end date
                    "changed_at": datetime.now(timezone.utc).isoformat()
                }
                salary_history.insert(i + 1, new_revision_entry)
                inserted = True
                break
        
        if not inserted:
            # No existing history, just add it
            salary_history.append({
                "daily_rate": new_daily_rate,
                "overtime_rate": new_overtime_rate,
                "monthly_salary": new_monthly_salary,
                "effective_from": effective_from,
                "effective_to": None,
                "changed_at": datetime.now(timezone.utc).isoformat()
            })
        
        # Sort salary history by effective_from date
        salary_history = sorted(salary_history, key=lambda x: x.get("effective_from", ""))
        
        # Don't update current rates for historical revisions unless it's the latest
        latest_entry = max(salary_history, key=lambda x: x.get("effective_from", ""))
        if latest_entry.get("effective_to") is None:
            update_data = {
                "default_daily_rate": latest_entry["daily_rate"],
                "default_overtime_rate": latest_entry["overtime_rate"],
                "monthly_salary": latest_entry.get("monthly_salary", 0),
                "salary_history": salary_history
            }
        else:
            update_data = {"salary_history": salary_history}
    
    await db.labours.update_one({"id": labour_id}, {"$set": update_data})
    
    updated = await db.labours.find_one({"id": labour_id}, {"_id": 0})
    return {
        "message": f"Salary revision effective from {effective_from} saved successfully",
        "labourer": updated
    }


@router.delete("/labours/{labour_id}")
async def delete_labour(
    labour_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete a labourer (soft delete - marks as inactive if has attendance history)"""
    existing = await db.labours.find_one({"id": labour_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    # Check if labourer has attendance records
    has_attendance = await db.labour_attendance.find_one({"labour_id": labour_id})
    if has_attendance:
        # Soft delete - just mark as inactive
        await db.labours.update_one({"id": labour_id}, {"$set": {"is_active": False}})
        return {"message": "Labourer marked as inactive (has attendance history)"}
    else:
        # Hard delete if no attendance records
        await db.labours.delete_one({"id": labour_id})
        return {"message": "Labourer deleted"}


# --- Labour Attendance Routes ---

@router.get("/labour-attendance")
async def get_labour_attendance(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get attendance records for a specific date"""
    # Get all active labourers
    labours = await db.labours.find({"is_active": {"$ne": False}}, {"_id": 0}).sort("name", 1).to_list(100)
    
    # Get existing attendance records for this date
    attendance_records = await db.labour_attendance.find(
        {"date": date}, {"_id": 0}
    ).to_list(100)
    attendance_map = {rec["labour_id"]: rec for rec in attendance_records}
    
    # Merge: For each labourer, return attendance if exists, else default values
    result = []
    for labour in labours:
        if labour["id"] in attendance_map:
            # Use existing attendance record
            record = attendance_map[labour["id"]]
            # Ensure labour_name is updated (in case labour name changed)
            record["labour_name"] = labour["name"]
            # Ensure working_hours has a default
            if "working_hours" not in record:
                record["working_hours"] = 9 if record.get("present") else 0
            # Ensure paid_leave has a default
            if "paid_leave" not in record:
                record["paid_leave"] = False
            result.append(record)
        else:
            # Return default attendance entry (not saved yet)
            daily_rate = labour.get("default_daily_rate", 0)
            result.append({
                "id": None,  # Not saved yet
                "date": date,
                "labour_id": labour["id"],
                "labour_name": labour["name"],
                "present": False,
                "working_hours": 9,  # Default 9 hours
                "overtime_hours": 0,
                "paid_leave": False,  # Default no paid leave
                "daily_rate": daily_rate,
                "hourly_rate": round(daily_rate / 9, 2) if daily_rate > 0 else 0,
                "overtime_rate": labour.get("default_overtime_rate", 0),
                "total_payment": 0,
                "remarks": None
            })
    
    return result


@router.post("/labour-attendance")
async def save_labour_attendance(
    attendance_data: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Save or update attendance for a labourer on a specific date"""
    date = attendance_data.get("date")
    labour_id = attendance_data.get("labour_id")
    labour_name = attendance_data.get("labour_name")
    present = attendance_data.get("present", False)
    overtime_hours = float(attendance_data.get("overtime_hours", 0))
    daily_rate = float(attendance_data.get("daily_rate", 0))
    overtime_rate = float(attendance_data.get("overtime_rate", 0))
    remarks = attendance_data.get("remarks")
    
    # Vertical allocation - hours spent on each vertical
    working_hours = float(attendance_data.get("working_hours", 9))
    retail_hours = float(attendance_data.get("retail_hours", 0))
    qc_hours = float(attendance_data.get("qc_hours", 0))
    retail_ot_hours = float(attendance_data.get("retail_ot_hours", 0))
    qc_ot_hours = float(attendance_data.get("qc_ot_hours", 0))
    
    # If no vertical split provided, default all hours to retail
    if retail_hours == 0 and qc_hours == 0 and present:
        retail_hours = working_hours
    if retail_ot_hours == 0 and qc_ot_hours == 0 and overtime_hours > 0:
        retail_ot_hours = overtime_hours
    
    # Calculate total payment
    total_payment = 0
    if present:
        total_payment = daily_rate + (overtime_hours * overtime_rate)
    
    # Check if record exists for this date + labour combo
    existing = await db.labour_attendance.find_one({"date": date, "labour_id": labour_id})
    
    if existing:
        # Update existing
        await db.labour_attendance.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "present": present,
                "working_hours": working_hours,
                "overtime_hours": overtime_hours,
                "retail_hours": retail_hours,
                "qc_hours": qc_hours,
                "retail_ot_hours": retail_ot_hours,
                "qc_ot_hours": qc_ot_hours,
                "daily_rate": daily_rate,
                "overtime_rate": overtime_rate,
                "total_payment": total_payment,
                "remarks": remarks,
                "recorded_by": current_user.get("user_id"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        updated = await db.labour_attendance.find_one({"_id": existing["_id"]}, {"_id": 0})
        return updated
    else:
        # Create new
        doc = {
            "id": str(uuid.uuid4()),
            "date": date,
            "labour_id": labour_id,
            "labour_name": labour_name,
            "present": present,
            "working_hours": working_hours,
            "overtime_hours": overtime_hours,
            "retail_hours": retail_hours,
            "qc_hours": qc_hours,
            "retail_ot_hours": retail_ot_hours,
            "qc_ot_hours": qc_ot_hours,
            "daily_rate": daily_rate,
            "overtime_rate": overtime_rate,
            "total_payment": total_payment,
            "remarks": remarks,
            "recorded_by": current_user.get("user_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.labour_attendance.insert_one(doc)
        doc.pop("_id", None)
        return doc


@router.post("/labour-attendance/bulk")
async def save_bulk_labour_attendance(
    data: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Save multiple attendance records at once"""
    date = data.get("date")
    records = data.get("records", [])
    
    saved_count = 0
    for record in records:
        labour_id = record.get("labour_id")
        labour_name = record.get("labour_name")
        present = record.get("present", False)
        working_hours = float(record.get("working_hours", 9))  # Default 9 hours
        overtime_hours = float(record.get("overtime_hours", 0))
        daily_rate = float(record.get("daily_rate", 0))
        overtime_rate = float(record.get("overtime_rate", 0))
        paid_leave = record.get("paid_leave", False)  # New field for paid leave
        remarks = record.get("remarks")
        
        # Vertical allocation
        retail_hours = float(record.get("retail_hours", 0))
        qc_hours = float(record.get("qc_hours", 0))
        retail_ot_hours = float(record.get("retail_ot_hours", 0))
        qc_ot_hours = float(record.get("qc_ot_hours", 0))
        
        # If no vertical split provided, default all hours to retail
        if retail_hours == 0 and qc_hours == 0 and (present or paid_leave):
            retail_hours = working_hours
        if retail_ot_hours == 0 and qc_ot_hours == 0 and overtime_hours > 0:
            retail_ot_hours = overtime_hours
        
        # Calculate hourly rate (daily rate / 9 hours standard)
        hourly_rate = daily_rate / 9 if daily_rate > 0 else 0
        
        # Calculate total payment based on working hours
        total_payment = 0
        if present:
            # Payment = (hourly rate * working hours) + (overtime rate * overtime hours)
            total_payment = (hourly_rate * working_hours) + (overtime_hours * overtime_rate)
        elif paid_leave:
            # Paid leave = full daily rate (as if worked 9 hours)
            total_payment = daily_rate
        
        # Calculate vertical-wise payment allocation
        total_regular_hours = retail_hours + qc_hours
        retail_regular_payment = (retail_hours / total_regular_hours * (hourly_rate * working_hours)) if total_regular_hours > 0 else 0
        qc_regular_payment = (qc_hours / total_regular_hours * (hourly_rate * working_hours)) if total_regular_hours > 0 else 0
        
        total_ot = retail_ot_hours + qc_ot_hours
        retail_ot_payment = (retail_ot_hours * overtime_rate) if total_ot > 0 else 0
        qc_ot_payment = (qc_ot_hours * overtime_rate) if total_ot > 0 else 0
        
        # Upsert attendance record
        await db.labour_attendance.update_one(
            {"date": date, "labour_id": labour_id},
            {"$set": {
                "labour_name": labour_name,
                "present": present,
                "working_hours": working_hours,
                "overtime_hours": overtime_hours,
                "retail_hours": retail_hours,
                "qc_hours": qc_hours,
                "retail_ot_hours": retail_ot_hours,
                "qc_ot_hours": qc_ot_hours,
                "retail_payment": round(retail_regular_payment + retail_ot_payment, 2),
                "qc_payment": round(qc_regular_payment + qc_ot_payment, 2),
                "daily_rate": daily_rate,
                "hourly_rate": round(hourly_rate, 2),
                "overtime_rate": overtime_rate,
                "paid_leave": paid_leave,
                "total_payment": round(total_payment, 2),
                "remarks": remarks,
                "recorded_by": current_user.get("user_id"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "date": date,
                "labour_id": labour_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        saved_count += 1
    
    return {"message": f"Saved {saved_count} attendance records", "saved_count": saved_count}


# --- Labour Costs Summary Routes ---

@router.get("/labour-costs/summary")
async def get_labour_costs_summary(
    from_date: str = Query(..., description="Start date YYYY-MM-DD"),
    to_date: str = Query(..., description="End date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get labour costs summary for a date range.
    
    Uses salary_history to apply correct rates for each date.
    """
    # Get all attendance records in date range
    attendance = await db.labour_attendance.find(
        {"date": {"$gte": from_date, "$lte": to_date}},
        {"_id": 0}
    ).sort("date", 1).to_list(5000)
    
    # Get ALL labourers (including inactive) for rate lookup
    labours = await db.labours.find({}, {"_id": 0}).to_list(200)
    labour_map = {lab["id"]: lab for lab in labours}
    # Also create a name-based map for legacy records
    labour_name_map = {lab["name"]: lab for lab in labours}
    
    # Calculate daily totals
    daily_totals = {}
    labour_totals = {}
    
    for record in attendance:
        date = record["date"][:10]  # Ensure YYYY-MM-DD format
        labour_id = record.get("labour_id")
        labour_name = record.get("labour_name", "Unknown")
        
        # Get labourer details (for salary history and rates)
        labourer = labour_map.get(labour_id) or labour_name_map.get(labour_name) or {}
        
        # Get the applicable rate for this specific date using salary history
        applicable_rate = get_rate_for_date(labourer, date)
        date_daily_rate = applicable_rate["daily_rate"]
        date_ot_rate = applicable_rate["overtime_rate"]
        
        # Get recorded values
        overtime_hours = record.get("overtime_hours", 0) or 0
        
        # Calculate regular payment using date-specific rate
        regular_payment = date_daily_rate
        
        # Calculate OT payment using date-specific rate
        ot_payment = overtime_hours * date_ot_rate
        
        # Total payment = regular + OT
        effective_payment = regular_payment + ot_payment
        
        # Daily totals
        if date not in daily_totals:
            daily_totals[date] = {
                "date": date,
                "total_present": 0,
                "total_paid_leave": 0,
                "total_overtime_hours": 0,
                "total_payment": 0,
                "total_regular_payment": 0,
                "total_ot_payment": 0,
                "records": []
            }
        
        is_present = record.get("present", False)
        is_paid_leave = record.get("paid_leave", False)
        
        if is_present:
            daily_totals[date]["total_present"] += 1
            daily_totals[date]["total_overtime_hours"] += overtime_hours
            daily_totals[date]["total_payment"] += effective_payment
            daily_totals[date]["total_regular_payment"] += regular_payment
            daily_totals[date]["total_ot_payment"] += ot_payment
            daily_totals[date]["records"].append(record)
        elif is_paid_leave:
            # Paid leave - count as paid but not present
            daily_totals[date]["total_paid_leave"] += 1
            daily_totals[date]["total_payment"] += regular_payment  # Full day rate for paid leave
            daily_totals[date]["total_regular_payment"] += regular_payment
            daily_totals[date]["records"].append(record)
        
        # Labour totals
        if labour_id not in labour_totals:
            labour_totals[labour_id] = {
                "labour_id": labour_id,
                "labour_name": labour_name,
                "days_present": 0,
                "paid_leave_days": 0,
                "total_overtime_hours": 0,
                "total_payment": 0,
                "total_regular_payment": 0,
                "total_ot_payment": 0,
                "retail_hours": 0,
                "qc_hours": 0,
                "retail_ot_hours": 0,
                "qc_ot_hours": 0,
                "retail_payment": 0,
                "qc_payment": 0,
                "is_active": labourer.get("is_active", True)
            }
        
        if is_present:
            labour_totals[labour_id]["days_present"] += 1
            labour_totals[labour_id]["total_overtime_hours"] += overtime_hours
            labour_totals[labour_id]["total_payment"] += effective_payment
            labour_totals[labour_id]["total_regular_payment"] += regular_payment
            labour_totals[labour_id]["total_ot_payment"] += ot_payment
            
            # Add vertical hours and payment
            rec_retail_hours = record.get("retail_hours", 0) or 0
            rec_qc_hours = record.get("qc_hours", 0) or 0
            rec_retail_ot = record.get("retail_ot_hours", 0) or 0
            rec_qc_ot = record.get("qc_ot_hours", 0) or 0
            
            # If no vertical split in record, default to retail
            working_hours = record.get("working_hours", 9) or 9
            if rec_retail_hours == 0 and rec_qc_hours == 0:
                rec_retail_hours = working_hours
            if rec_retail_ot == 0 and rec_qc_ot == 0 and overtime_hours > 0:
                rec_retail_ot = overtime_hours
            
            labour_totals[labour_id]["retail_hours"] += rec_retail_hours
            labour_totals[labour_id]["qc_hours"] += rec_qc_hours
            labour_totals[labour_id]["retail_ot_hours"] += rec_retail_ot
            labour_totals[labour_id]["qc_ot_hours"] += rec_qc_ot
            
            # Calculate vertical-wise payment using date-specific rates
            total_hrs = rec_retail_hours + rec_qc_hours
            if total_hrs > 0:
                labour_totals[labour_id]["retail_payment"] += (rec_retail_hours / total_hrs) * regular_payment
                labour_totals[labour_id]["qc_payment"] += (rec_qc_hours / total_hrs) * regular_payment
            else:
                labour_totals[labour_id]["retail_payment"] += regular_payment
            
            total_ot = rec_retail_ot + rec_qc_ot
            if total_ot > 0:
                labour_totals[labour_id]["retail_payment"] += rec_retail_ot * date_ot_rate
                labour_totals[labour_id]["qc_payment"] += rec_qc_ot * date_ot_rate
        elif is_paid_leave:
            # Paid leave - add to payment but track separately
            labour_totals[labour_id]["paid_leave_days"] += 1
            labour_totals[labour_id]["total_payment"] += regular_payment
            labour_totals[labour_id]["total_regular_payment"] += regular_payment
            # Paid leave defaults to retail vertical
            labour_totals[labour_id]["retail_payment"] += regular_payment
    
    # Get all labour payments for this date range
    all_payments = await db.labour_payments.find({
        "$or": [
            {"period_from": {"$lte": to_date}, "period_to": {"$gte": from_date}},
            {"payment_date": {"$gte": from_date, "$lte": to_date}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Group payments by labour_id
    payments_by_labour = {}
    for payment in all_payments:
        lid = payment.get("labour_id")
        if lid not in payments_by_labour:
            payments_by_labour[lid] = []
        payments_by_labour[lid].append(payment)
    
    # Add payment info to labour totals
    for labour_id, totals in labour_totals.items():
        payments = payments_by_labour.get(labour_id, [])
        total_paid = sum(p.get("amount", 0) for p in payments)
        totals["total_paid"] = total_paid
        totals["net_payable"] = totals["total_payment"] - total_paid
        totals["payments"] = payments
    
    # Sort daily totals by date
    daily_list = sorted(daily_totals.values(), key=lambda x: x["date"], reverse=True)
    
    # Sort labour totals by total payment (descending)
    labour_list = sorted(labour_totals.values(), key=lambda x: x["total_payment"], reverse=True)
    
    # Enrich labour_list with current rates and salary history
    for lb in labour_list:
        labourer = labour_map.get(lb["labour_id"]) or {}
        lb["current_daily_rate"] = labourer.get("default_daily_rate", 0)
        lb["current_ot_rate"] = labourer.get("default_overtime_rate", 0)
        lb["monthly_salary"] = labourer.get("monthly_salary", 0)
        lb["salary_history"] = labourer.get("salary_history", [])
        lb["is_active"] = labourer.get("is_active", True)
    
    # Calculate grand totals
    grand_total_payment = sum(lb["total_payment"] for lb in labour_list)
    grand_total_paid = sum(lb.get("total_paid", 0) for lb in labour_list)
    grand_total_regular = sum(lb.get("total_regular_payment", 0) for lb in labour_list)
    grand_total_ot = sum(lb.get("total_ot_payment", 0) for lb in labour_list)
    total_days = len(daily_list)
    total_man_days = sum(d["total_present"] for d in daily_list)
    total_paid_leave_days = sum(d.get("total_paid_leave", 0) for d in daily_list)
    total_overtime_hours = sum(d["total_overtime_hours"] for d in daily_list)
    
    # Vertical totals
    total_retail_hours = sum(lb.get("retail_hours", 0) for lb in labour_list)
    total_qc_hours = sum(lb.get("qc_hours", 0) for lb in labour_list)
    total_retail_ot = sum(lb.get("retail_ot_hours", 0) for lb in labour_list)
    total_qc_ot = sum(lb.get("qc_ot_hours", 0) for lb in labour_list)
    total_retail_payment = sum(lb.get("retail_payment", 0) for lb in labour_list)
    total_qc_payment = sum(lb.get("qc_payment", 0) for lb in labour_list)
    
    return {
        "from_date": from_date,
        "to_date": to_date,
        "summary": {
            "total_payment": grand_total_payment,
            "total_regular_payment": round(grand_total_regular, 2),
            "total_ot_payment": round(grand_total_ot, 2),
            "total_paid": grand_total_paid,
            "net_payable": grand_total_payment - grand_total_paid,
            "total_days": total_days,
            "total_man_days": total_man_days,
            "total_paid_leave_days": total_paid_leave_days,
            "total_overtime_hours": total_overtime_hours,
            "daily_avg_cost": grand_total_payment / total_days if total_days > 0 else 0,
            # Vertical breakdown
            "retail_hours": total_retail_hours,
            "qc_hours": total_qc_hours,
            "retail_ot_hours": total_retail_ot,
            "qc_ot_hours": total_qc_ot,
            "retail_payment": round(total_retail_payment, 2),
            "qc_payment": round(total_qc_payment, 2)
        },
        "daily_breakdown": daily_list,
        "labour_breakdown": labour_list
    }



@router.get("/labour-attendance/bulk")
async def get_labour_attendance_bulk(
    from_date: str = Query(None, description="Start date YYYY-MM-DD"),
    to_date: str = Query(None, description="End date YYYY-MM-DD"),
    limit: int = Query(50000, description="Max records to return"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """
    Bulk fetch all labour attendance records for sync purposes.
    If from_date/to_date provided, filters by date range.
    Returns raw attendance records from the database.
    """
    query = {}
    if from_date and to_date:
        query["date"] = {"$gte": from_date, "$lte": to_date}
    elif from_date:
        query["date"] = {"$gte": from_date}
    elif to_date:
        query["date"] = {"$lte": to_date}
    
    records = await db.labour_attendance.find(query, {"_id": 0}).sort("date", -1).to_list(limit)
    return records



@router.get("/labour-costs/detail/{labour_id}")
async def get_labour_payroll_detail(
    labour_id: str,
    from_date: str = Query(..., description="Start date YYYY-MM-DD"),
    to_date: str = Query(..., description="End date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """
    Get detailed payroll breakdown for a specific labourer.
    Shows day-by-day attendance with regular hours, overtime, and payment calculation.
    Uses salary_history to apply correct rates for each date.
    """
    # Get labourer details
    labourer = await db.labours.find_one({"id": labour_id}, {"_id": 0})
    if not labourer:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    # Get attendance records for the date range
    attendance = await db.labour_attendance.find({
        "labour_id": labour_id,
        "date": {"$gte": from_date, "$lte": to_date}
    }, {"_id": 0}).sort("date", 1).to_list(500)
    
    # Process records
    daily_records = []
    days_present = 0
    days_under_9_hours = []
    days_with_overtime = []
    paid_leave_days = []
    
    total_working_hours = 0
    total_overtime_hours = 0
    total_regular_payment = 0
    total_overtime_payment = 0
    total_paid_leave_payment = 0
    
    for record in attendance:
        is_present = record.get("present", False)
        is_paid_leave = record.get("paid_leave", False)
        
        # Skip if neither present nor paid leave
        if not is_present and not is_paid_leave:
            continue
        
        date = record.get("date", "")[:10]  # Ensure YYYY-MM-DD format
        
        # Get the applicable rate for this specific date using salary history
        applicable_rate = get_rate_for_date(labourer, date)
        date_daily_rate = applicable_rate["daily_rate"]
        date_ot_rate = applicable_rate["overtime_rate"]
        
        if is_present:
            days_present += 1
            working_hours = record.get("working_hours", 9) or 9
            overtime_hours = record.get("overtime_hours", 0) or 0
            
            # Calculate regular payment (daily rate)
            regular_payment = date_daily_rate
            
            # Calculate OT payment
            ot_payment = overtime_hours * date_ot_rate
            
            # Total for this day = regular + OT
            day_total = regular_payment + ot_payment
            
            total_working_hours += working_hours
            total_overtime_hours += overtime_hours
            total_regular_payment += regular_payment
            total_overtime_payment += ot_payment
            
            day_record = {
                "date": date,
                "working_hours": working_hours,
                "overtime_hours": overtime_hours,
                "daily_rate": regular_payment,
                "overtime_rate": date_ot_rate,
                "regular_payment": regular_payment,
                "overtime_payment": ot_payment,
                "total_payment": day_total,
                "is_paid_leave": False,
                "is_under_9_hours": working_hours < 9
            }
            daily_records.append(day_record)
            
            # Track anomalies
            if working_hours < 9:
                days_under_9_hours.append(date)
            if overtime_hours > 0:
                days_with_overtime.append({"date": date, "hours": overtime_hours})
        
        elif is_paid_leave:
            # Paid leave - gets full daily rate
            total_paid_leave_payment += date_daily_rate
            total_regular_payment += date_daily_rate
            paid_leave_days.append(date)
            
            day_record = {
                "date": date,
                "working_hours": 0,
                "overtime_hours": 0,
                "daily_rate": date_daily_rate,
                "overtime_rate": date_ot_rate,
                "regular_payment": date_daily_rate,
                "overtime_payment": 0,
                "total_payment": date_daily_rate,
                "is_paid_leave": True,
                "is_under_9_hours": False
            }
            daily_records.append(day_record)
    
    # Get current rates (for display in return)
    current_daily_rate = labourer.get("default_daily_rate", 0) or 0
    current_ot_rate = labourer.get("default_overtime_rate", 0) or 0
    salary_history = labourer.get("salary_history", [])
    
    return {
        "labour_id": labour_id,
        "labour_name": labourer.get("name"),
        "is_active": labourer.get("is_active", True),
        "current_daily_rate": current_daily_rate,
        "current_overtime_rate": current_ot_rate,
        "monthly_salary": labourer.get("monthly_salary", 0),
        "salary_history": salary_history,
        "from_date": from_date,
        "to_date": to_date,
        "summary": {
            "days_present": days_present,
            "paid_leave_days": len(paid_leave_days),
            "total_working_hours": total_working_hours,
            "total_overtime_hours": total_overtime_hours,
            "total_regular_payment": total_regular_payment,
            "total_overtime_payment": total_overtime_payment,
            "total_paid_leave_payment": total_paid_leave_payment,
            "final_payable": total_regular_payment + total_overtime_payment
        },
        "highlights": {
            "days_under_9_hours": days_under_9_hours,
            "days_with_overtime": days_with_overtime,
            "paid_leave_days": paid_leave_days
        },
        "daily_records": daily_records
    }



# --- Labour Payment Recording ---

@router.get("/labour-payments")
async def list_labour_payments(
    labour_id: str = Query(None, description="Filter by labour ID"),
    from_date: str = Query(None, description="Filter from date YYYY-MM-DD"),
    to_date: str = Query(None, description="Filter to date YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get all labour payments with optional filters"""
    query = {}
    if labour_id:
        query["labour_id"] = labour_id
    if from_date and to_date:
        query["payment_date"] = {"$gte": from_date, "$lte": to_date}
    elif from_date:
        query["payment_date"] = {"$gte": from_date}
    elif to_date:
        query["payment_date"] = {"$lte": to_date}
    
    payments = await db.labour_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments


@router.post("/labour-payments")
async def create_labour_payment(
    payment: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Record a payment made to a labourer"""
    # Validate required fields
    required_fields = ["labour_id", "amount", "payment_date"]
    for field in required_fields:
        if field not in payment or payment[field] is None:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
    
    # Verify labourer exists
    labourer = await db.labours.find_one({"id": payment["labour_id"]})
    if not labourer:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    # Create payment record
    payment_record = {
        "id": str(uuid.uuid4()),
        "labour_id": payment["labour_id"],
        "labour_name": labourer.get("name", "Unknown"),
        "amount": float(payment["amount"]),
        "payment_date": payment["payment_date"],
        "transaction_id": payment.get("transaction_id", ""),
        "payment_mode": payment.get("payment_mode", "Bank Transfer"),
        "notes": payment.get("notes", ""),
        "period_from": payment.get("period_from"),
        "period_to": payment.get("period_to"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("email", "unknown")
    }
    
    await db.labour_payments.insert_one(payment_record)
    
    # Remove _id before returning
    payment_record.pop("_id", None)
    return payment_record


@router.put("/labour-payments/{payment_id}")
async def update_labour_payment(
    payment_id: str,
    payment: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update a labour payment record"""
    existing = await db.labour_payments.find_one({"id": payment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Update allowed fields
    update_fields = {}
    if "amount" in payment:
        update_fields["amount"] = float(payment["amount"])
    if "payment_date" in payment:
        update_fields["payment_date"] = payment["payment_date"]
    if "transaction_id" in payment:
        update_fields["transaction_id"] = payment["transaction_id"]
    if "payment_mode" in payment:
        update_fields["payment_mode"] = payment["payment_mode"]
    if "notes" in payment:
        update_fields["notes"] = payment["notes"]
    if "period_from" in payment:
        update_fields["period_from"] = payment["period_from"]
    if "period_to" in payment:
        update_fields["period_to"] = payment["period_to"]
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_fields["updated_by"] = current_user.get("email", "unknown")
    
    await db.labour_payments.update_one({"id": payment_id}, {"$set": update_fields})
    
    # Return updated record
    updated = await db.labour_payments.find_one({"id": payment_id}, {"_id": 0})
    return updated


@router.delete("/labour-payments/{payment_id}")
async def delete_labour_payment(
    payment_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete a labour payment record"""
    existing = await db.labour_payments.find_one({"id": payment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.labour_payments.delete_one({"id": payment_id})
    return {"message": "Payment deleted successfully", "id": payment_id}


@router.get("/labour-payments/summary/{labour_id}")
async def get_labour_payment_summary(
    labour_id: str,
    from_date: str = Query(None, description="Period from date"),
    to_date: str = Query(None, description="Period to date"),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get payment summary for a specific labourer for a date range"""
    # Get labourer details
    labourer = await db.labours.find_one({"id": labour_id}, {"_id": 0})
    if not labourer:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    # Get payments for this labourer in the date range
    query = {"labour_id": labour_id}
    if from_date and to_date:
        # Get payments where period overlaps with the requested range
        query["$or"] = [
            {"period_from": {"$lte": to_date}, "period_to": {"$gte": from_date}},
            {"payment_date": {"$gte": from_date, "$lte": to_date}}
        ]
    
    payments = await db.labour_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(100)
    
    total_paid = sum(p.get("amount", 0) for p in payments)
    
    return {
        "labour_id": labour_id,
        "labour_name": labourer.get("name"),
        "total_paid": total_paid,
        "payment_count": len(payments),
        "payments": payments
    }
