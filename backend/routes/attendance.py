"""
Attendance Management Routes
============================
Handles daily attendance tracking for fixed employees:
- Mark attendance (present/absent)
- Track working hours, retail hours, QC hours
- Overtime tracking
- Paid leave management
- Copy attendance to multiple dates
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone, date
from typing import Optional, List
import uuid

from dependencies import get_current_user, get_db

router = APIRouter(prefix="/api", tags=["Attendance"])


# --- Pydantic Models ---

class AttendanceRecord(BaseModel):
    employee_id: str
    date: str  # YYYY-MM-DD
    status: str = "absent"  # present, absent, half_day, paid_leave
    working_hours: float = 0
    retail_hours: float = 0
    qc_hours: float = 0
    ot_total: float = 0
    retail_ot: float = 0
    qc_ot: float = 0
    paid_leave: bool = False


class BulkAttendanceUpdate(BaseModel):
    date: str
    records: List[AttendanceRecord]


class CopyAttendanceRequest(BaseModel):
    source_date: str
    target_dates: List[str]


# --- Routes ---

@router.get("/attendance/{date_str}")
async def get_attendance(
    date_str: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get attendance records for a specific date with all employees"""
    try:
        # Get all active fixed employees
        employees = await db.fixed_employees.find(
            {"status": {"$ne": "deleted"}},
            {"_id": 0}
        ).sort("name", 1).to_list(500)
        
        # Get existing attendance records for the date
        existing_records = await db.attendance.find(
            {"date": date_str},
            {"_id": 0}
        ).to_list(500)
        
        # Create a map of employee_id to attendance record
        attendance_map = {r["employee_id"]: r for r in existing_records}
        
        # Build response with all employees
        result = []
        for emp in employees:
            emp_id = emp.get("id") or emp.get("employee_id")
            if emp_id in attendance_map:
                record = attendance_map[emp_id]
            else:
                # Default attendance record (absent)
                record = {
                    "employee_id": emp_id,
                    "employee_name": emp.get("name"),
                    "date": date_str,
                    "status": "absent",
                    "working_hours": 0,
                    "retail_hours": 0,
                    "qc_hours": 0,
                    "ot_total": 0,
                    "retail_ot": 0,
                    "qc_ot": 0,
                    "paid_leave": False
                }
            
            # Add employee details
            record["employee_name"] = emp.get("name")
            record["department"] = emp.get("department")
            record["vertical"] = emp.get("vertical")
            result.append(record)
        
        # Calculate summary
        summary = {
            "total_employees": len(employees),
            "present": sum(1 for r in result if r.get("status") == "present"),
            "absent": sum(1 for r in result if r.get("status") == "absent"),
            "half_day": sum(1 for r in result if r.get("status") == "half_day"),
            "paid_leave": sum(1 for r in result if r.get("paid_leave")),
            "total_working_hours": sum(r.get("working_hours", 0) for r in result),
            "total_retail_hours": sum(r.get("retail_hours", 0) for r in result),
            "total_qc_hours": sum(r.get("qc_hours", 0) for r in result),
            "total_ot": sum(r.get("ot_total", 0) for r in result),
            "total_retail_ot": sum(r.get("retail_ot", 0) for r in result),
            "total_qc_ot": sum(r.get("qc_ot", 0) for r in result)
        }
        
        return {
            "date": date_str,
            "records": result,
            "summary": summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance/save")
async def save_attendance(
    data: BulkAttendanceUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Save attendance records for a date (bulk upsert)"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        saved_count = 0
        
        for record in data.records:
            attendance_data = {
                "employee_id": record.employee_id,
                "date": data.date,
                "status": record.status,
                "working_hours": record.working_hours,
                "retail_hours": record.retail_hours,
                "qc_hours": record.qc_hours,
                "ot_total": record.ot_total,
                "retail_ot": record.retail_ot,
                "qc_ot": record.qc_ot,
                "paid_leave": record.paid_leave,
                "updated_at": now,
                "updated_by": current_user.get("id")
            }
            
            # Upsert - update if exists, insert if not
            result = await db.attendance.update_one(
                {"employee_id": record.employee_id, "date": data.date},
                {
                    "$set": attendance_data,
                    "$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "created_at": now
                    }
                },
                upsert=True
            )
            saved_count += 1
        
        return {
            "success": True,
            "message": f"Saved {saved_count} attendance records for {data.date}",
            "saved_count": saved_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance/mark-all")
async def mark_all_attendance(
    date_str: str,
    status: str,  # present or absent
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Mark all employees as present or absent for a date"""
    try:
        if status not in ["present", "absent"]:
            raise HTTPException(status_code=400, detail="Status must be 'present' or 'absent'")
        
        # Get all active employees with their vertical info
        employees = await db.fixed_employees.find(
            {"status": {"$ne": "deleted"}},
            {"_id": 0, "id": 1, "vertical": 1}
        ).to_list(500)
        
        now = datetime.now(timezone.utc).isoformat()
        updated_count = 0
        
        for emp in employees:
            emp_id = emp.get("id")
            if not emp_id:
                continue
            
            vertical = emp.get("vertical", "Central")
            
            if status == "present":
                # Default 9 hours, allocated based on vertical
                working_hours = 9
                if vertical == "Retail":
                    retail_hours = 9
                    qc_hours = 0
                elif vertical == "QC":
                    retail_hours = 0
                    qc_hours = 9
                else:
                    # Central - split equally
                    retail_hours = 4.5
                    qc_hours = 4.5
            else:
                working_hours = 0
                retail_hours = 0
                qc_hours = 0
            
            await db.attendance.update_one(
                {"employee_id": emp_id, "date": date_str},
                {
                    "$set": {
                        "status": status,
                        "working_hours": working_hours,
                        "retail_hours": retail_hours,
                        "qc_hours": qc_hours,
                        "updated_at": now,
                        "updated_by": current_user.get("id")
                    },
                    "$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "employee_id": emp_id,
                        "date": date_str,
                        "ot_total": 0,
                        "retail_ot": 0,
                        "qc_ot": 0,
                        "paid_leave": False,
                        "created_at": now
                    }
                },
                upsert=True
            )
            updated_count += 1
        
        return {
            "success": True,
            "message": f"Marked {updated_count} employees as {status}",
            "updated_count": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/attendance/copy")
async def copy_attendance(
    data: CopyAttendanceRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Copy attendance from one date to multiple target dates"""
    try:
        # Get source attendance records
        source_records = await db.attendance.find(
            {"date": data.source_date},
            {"_id": 0}
        ).to_list(500)
        
        if not source_records:
            raise HTTPException(status_code=404, detail=f"No attendance records found for {data.source_date}")
        
        now = datetime.now(timezone.utc).isoformat()
        copied_count = 0
        
        for target_date in data.target_dates:
            for record in source_records:
                new_record = {
                    "id": str(uuid.uuid4()),
                    "employee_id": record["employee_id"],
                    "date": target_date,
                    "status": record.get("status", "absent"),
                    "working_hours": record.get("working_hours", 0),
                    "retail_hours": record.get("retail_hours", 0),
                    "qc_hours": record.get("qc_hours", 0),
                    "ot_total": record.get("ot_total", 0),
                    "retail_ot": record.get("retail_ot", 0),
                    "qc_ot": record.get("qc_ot", 0),
                    "paid_leave": record.get("paid_leave", False),
                    "created_at": now,
                    "updated_at": now,
                    "copied_from": data.source_date,
                    "updated_by": current_user.get("id")
                }
                
                # Upsert
                await db.attendance.update_one(
                    {"employee_id": record["employee_id"], "date": target_date},
                    {"$set": new_record},
                    upsert=True
                )
                copied_count += 1
        
        return {
            "success": True,
            "message": f"Copied attendance to {len(data.target_dates)} dates ({copied_count} records)",
            "copied_count": copied_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/attendance/summary/{year}/{month}")
async def get_monthly_summary(
    year: int,
    month: int,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get monthly attendance summary for all employees"""
    try:
        # Build date range
        start_date = f"{year}-{month:02d}-01"
        if month == 12:
            end_date = f"{year + 1}-01-01"
        else:
            end_date = f"{year}-{month + 1:02d}-01"
        
        # Aggregate attendance by employee
        pipeline = [
            {
                "$match": {
                    "date": {"$gte": start_date, "$lt": end_date}
                }
            },
            {
                "$group": {
                    "_id": "$employee_id",
                    "present_days": {"$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}},
                    "absent_days": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
                    "half_days": {"$sum": {"$cond": [{"$eq": ["$status", "half_day"]}, 1, 0]}},
                    "paid_leave_days": {"$sum": {"$cond": ["$paid_leave", 1, 0]}},
                    "total_working_hours": {"$sum": "$working_hours"},
                    "total_retail_hours": {"$sum": "$retail_hours"},
                    "total_qc_hours": {"$sum": "$qc_hours"},
                    "total_ot": {"$sum": "$ot_total"}
                }
            }
        ]
        
        results = await db.attendance.aggregate(pipeline).to_list(500)
        
        # Get employee details
        employees = await db.fixed_employees.find(
            {"status": {"$ne": "deleted"}},
            {"_id": 0}
        ).to_list(500)
        
        emp_map = {emp.get("id"): emp for emp in employees}
        
        summary = []
        for r in results:
            emp = emp_map.get(r["_id"], {})
            summary.append({
                "employee_id": r["_id"],
                "employee_name": emp.get("name", "Unknown"),
                "department": emp.get("department"),
                "present_days": r["present_days"],
                "absent_days": r["absent_days"],
                "half_days": r["half_days"],
                "paid_leave_days": r["paid_leave_days"],
                "total_working_hours": r["total_working_hours"],
                "total_retail_hours": r["total_retail_hours"],
                "total_qc_hours": r["total_qc_hours"],
                "total_ot": r["total_ot"]
            })
        
        return {
            "year": year,
            "month": month,
            "summary": summary
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/payroll/calculate")
async def calculate_payroll(
    date_from: str,
    date_to: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Calculate payroll for a date range based on attendance and CTC"""
    try:
        # Get all active fixed employees
        employees = await db.fixed_employees.find(
            {"status": {"$ne": "deleted"}},
            {"_id": 0}
        ).to_list(500)
        
        emp_map = {emp.get("id"): emp for emp in employees}
        
        # Aggregate attendance by employee for the date range
        pipeline = [
            {
                "$match": {
                    "date": {"$gte": date_from, "$lte": date_to}
                }
            },
            {
                "$group": {
                    "_id": "$employee_id",
                    "days_present": {"$sum": {"$cond": [{"$eq": ["$status", "present"]}, 1, 0]}},
                    "days_absent": {"$sum": {"$cond": [{"$eq": ["$status", "absent"]}, 1, 0]}},
                    "half_days": {"$sum": {"$cond": [{"$eq": ["$status", "half_day"]}, 1, 0]}},
                    "paid_leave_days": {"$sum": {"$cond": ["$paid_leave", 1, 0]}},
                    "total_working_hours": {"$sum": "$working_hours"},
                    "total_retail_hours": {"$sum": "$retail_hours"},
                    "total_qc_hours": {"$sum": "$qc_hours"},
                    "total_ot": {"$sum": "$ot_total"}
                }
            }
        ]
        
        attendance_results = await db.attendance.aggregate(pipeline).to_list(500)
        attendance_map = {r["_id"]: r for r in attendance_results}
        
        # Get payments for employees in date range
        payments_pipeline = [
            {
                "$match": {
                    "payment_date": {"$gte": date_from, "$lte": date_to},
                    "payment_type": "salary"
                }
            },
            {
                "$group": {
                    "_id": "$employee_id",
                    "total_paid": {"$sum": "$amount"}
                }
            }
        ]
        payment_results = await db.employee_payments.aggregate(payments_pipeline).to_list(500)
        payment_map = {r["_id"]: r.get("total_paid", 0) for r in payment_results}
        
        # Calculate number of days in the period for daily rate calculation
        from datetime import datetime
        d1 = datetime.strptime(date_from, "%Y-%m-%d")
        d2 = datetime.strptime(date_to, "%Y-%m-%d")
        days_in_period = (d2 - d1).days + 1
        
        # Build payroll breakdown
        payroll_breakdown = []
        summary = {
            "total_payroll": 0,
            "total_paid": 0,
            "net_payable": 0,
            "employee_count": 0,
            "total_paid_leaves": 0,
            "total_man_days": 0,
            "total_ot_hours": 0
        }
        
        for emp in employees:
            emp_id = emp.get("id")
            emp_name = emp.get("name", "Unknown")
            ctc = emp.get("ctc", 0) or 0
            
            # Calculate daily rate from annual CTC
            # Assuming 26 working days per month
            monthly_salary = ctc / 12
            daily_rate = monthly_salary / 26
            
            # Get attendance data
            att = attendance_map.get(emp_id, {})
            days_present = att.get("days_present", 0)
            days_absent = att.get("days_absent", 0)
            half_days = att.get("half_days", 0)
            paid_leave_days = att.get("paid_leave_days", 0)
            total_ot = att.get("total_ot", 0)
            
            # Calculate payable days (present + paid leaves + half days as 0.5)
            payable_days = days_present + paid_leave_days + (half_days * 0.5)
            
            # Calculate salary
            regular_salary = daily_rate * payable_days
            ot_rate = daily_rate / 8  # Hourly OT rate
            ot_amount = total_ot * ot_rate
            total_amount = regular_salary + ot_amount
            
            # Get payments
            total_paid = payment_map.get(emp_id, 0)
            net_payable = total_amount - total_paid
            
            payroll_breakdown.append({
                "employee_id": emp_id,
                "employee_name": emp_name,
                "department": emp.get("department"),
                "vertical": emp.get("vertical"),
                "bank_account": emp.get("bank_account_number") or emp.get("aadhar_number", ""),
                "ifsc": emp.get("ifsc_code", ""),
                "ctc": ctc,
                "monthly_salary": monthly_salary,
                "daily_rate": daily_rate,
                "days_present": days_present,
                "days_absent": days_absent,
                "half_days": half_days,
                "paid_leave_days": paid_leave_days,
                "payable_days": payable_days,
                "ot_hours": total_ot,
                "regular_salary": round(regular_salary, 2),
                "ot_amount": round(ot_amount, 2),
                "total_amount": round(total_amount, 2),
                "total_paid": round(total_paid, 2),
                "net_payable": round(net_payable, 2)
            })
            
            # Update summary
            summary["total_payroll"] += total_amount
            summary["total_paid"] += total_paid
            summary["total_paid_leaves"] += paid_leave_days
            summary["total_man_days"] += payable_days
            summary["total_ot_hours"] += total_ot
            summary["employee_count"] += 1
        
        summary["net_payable"] = summary["total_payroll"] - summary["total_paid"]
        
        # Round summary values
        for key in ["total_payroll", "total_paid", "net_payable"]:
            summary[key] = round(summary[key], 2)
        
        return {
            "date_from": date_from,
            "date_to": date_to,
            "summary": summary,
            "breakdown": payroll_breakdown
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/employee-payments")
async def record_employee_payment(
    data: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Record a salary payment for an employee"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        payment_data = {
            "id": str(uuid.uuid4()),
            "employee_id": data.get("employee_id"),
            "amount": float(data.get("amount", 0)),
            "payment_date": data.get("payment_date", now.split("T")[0]),
            "payment_type": data.get("payment_type", "salary"),
            "payment_mode": data.get("payment_mode", "bank_transfer"),
            "reference": data.get("reference", ""),
            "notes": data.get("notes", ""),
            "period_from": data.get("period_from"),
            "period_to": data.get("period_to"),
            "created_at": now,
            "created_by": current_user.get("id")
        }
        
        await db.employee_payments.insert_one(payment_data)
        payment_data.pop("_id", None)
        
        return payment_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/employee-payments/{employee_id}")
async def get_employee_payments(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get payment history for an employee"""
    try:
        payments = await db.employee_payments.find(
            {"employee_id": employee_id},
            {"_id": 0}
        ).sort("payment_date", -1).to_list(100)
        
        return payments
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
