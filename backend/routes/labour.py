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
from datetime import datetime, timezone
import uuid

from dependencies import get_current_user, get_db

router = APIRouter(prefix="/api", tags=["Labour Management"])


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
    """Create a new labourer"""
    # Check for duplicate name
    existing = await db.labours.find_one({"name": {"$regex": f"^{labour.get('name', '')}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="A labourer with this name already exists")
    
    doc = {
        "id": str(uuid.uuid4()),
        "name": labour.get("name"),
        "phone": labour.get("phone"),
        "default_daily_rate": float(labour.get("default_daily_rate", 0)),
        "default_overtime_rate": float(labour.get("default_overtime_rate", 0)),
        "bank_account_number": labour.get("bank_account_number"),
        "ifsc_code": labour.get("ifsc_code"),
        "joining_date": labour.get("joining_date"),
        "is_active": labour.get("is_active", True),
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
    """Update a labourer's details"""
    existing = await db.labours.find_one({"id": labour_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Labourer not found")
    
    update_data = {}
    if "name" in labour:
        update_data["name"] = labour["name"]
    if "phone" in labour:
        update_data["phone"] = labour["phone"]
    if "default_daily_rate" in labour:
        update_data["default_daily_rate"] = float(labour["default_daily_rate"])
    if "default_overtime_rate" in labour:
        update_data["default_overtime_rate"] = float(labour["default_overtime_rate"])
    if "bank_account_number" in labour:
        update_data["bank_account_number"] = labour["bank_account_number"]
    if "ifsc_code" in labour:
        update_data["ifsc_code"] = labour["ifsc_code"]
    if "joining_date" in labour:
        update_data["joining_date"] = labour["joining_date"]
    if "is_active" in labour:
        update_data["is_active"] = labour["is_active"]
    
    if update_data:
        await db.labours.update_one({"id": labour_id}, {"$set": update_data})
    
    updated = await db.labours.find_one({"id": labour_id}, {"_id": 0})
    return updated


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
                "overtime_hours": overtime_hours,
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
            "overtime_hours": overtime_hours,
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
        
        # Upsert attendance record
        await db.labour_attendance.update_one(
            {"date": date, "labour_id": labour_id},
            {"$set": {
                "labour_name": labour_name,
                "present": present,
                "working_hours": working_hours,
                "overtime_hours": overtime_hours,
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
    """Get labour costs summary for a date range"""
    # Get all attendance records in date range
    attendance = await db.labour_attendance.find(
        {"date": {"$gte": from_date, "$lte": to_date}},
        {"_id": 0}
    ).sort("date", 1).to_list(1000)
    
    # Get all labourers for reference
    labours = await db.labours.find({}, {"_id": 0}).to_list(100)
    labour_map = {lab["id"]: lab for lab in labours}
    
    # Calculate daily totals
    daily_totals = {}
    labour_totals = {}
    
    for record in attendance:
        date = record["date"]
        labour_id = record["labour_id"]
        
        # Daily totals
        if date not in daily_totals:
            daily_totals[date] = {
                "date": date,
                "total_present": 0,
                "total_overtime_hours": 0,
                "total_payment": 0,
                "records": []
            }
        
        if record.get("present"):
            daily_totals[date]["total_present"] += 1
            daily_totals[date]["total_overtime_hours"] += record.get("overtime_hours", 0)
            daily_totals[date]["total_payment"] += record.get("total_payment", 0)
            daily_totals[date]["records"].append(record)
        
        # Labour totals
        if labour_id not in labour_totals:
            labour_name = record.get("labour_name") or labour_map.get(labour_id, {}).get("name", "Unknown")
            labour_totals[labour_id] = {
                "labour_id": labour_id,
                "labour_name": labour_name,
                "days_present": 0,
                "total_overtime_hours": 0,
                "total_payment": 0
            }
        
        if record.get("present"):
            labour_totals[labour_id]["days_present"] += 1
            labour_totals[labour_id]["total_overtime_hours"] += record.get("overtime_hours", 0)
            labour_totals[labour_id]["total_payment"] += record.get("total_payment", 0)
    
    # Sort daily totals by date
    daily_list = sorted(daily_totals.values(), key=lambda x: x["date"], reverse=True)
    
    # Sort labour totals by total payment
    labour_list = sorted(labour_totals.values(), key=lambda x: x["total_payment"], reverse=True)
    
    # Calculate grand totals
    grand_total_payment = sum(d["total_payment"] for d in daily_list)
    total_days = len(daily_list)
    total_man_days = sum(d["total_present"] for d in daily_list)
    total_overtime_hours = sum(d["total_overtime_hours"] for d in daily_list)
    
    return {
        "from_date": from_date,
        "to_date": to_date,
        "summary": {
            "total_payment": grand_total_payment,
            "total_days": total_days,
            "total_man_days": total_man_days,
            "total_overtime_hours": total_overtime_hours,
            "daily_avg_cost": grand_total_payment / total_days if total_days > 0 else 0
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
