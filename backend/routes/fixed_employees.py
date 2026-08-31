"""
Fixed Employees Management Routes
=================================
Handles employee management for Fixed Expenses module:
- Employee CRUD (create, read, update, delete)
- Employee listing with filters
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from dependencies import get_current_user, get_db

router = APIRouter(prefix="/api", tags=["Fixed Employees"])


# --- Pydantic Models ---

class EmployeeCreate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    ctc: float = 0
    doj: str  # Date of Joining (YYYY-MM-DD)
    lwd: Optional[str] = None  # Last Working Day
    aadhar_number: Optional[str] = None
    pan_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    department: str
    city: Optional[str] = None
    vertical: str = "Central"  # Retail, QC, or Central
    designation: Optional[str] = None
    status: str = "active"  # active, inactive, terminated
    # Bank Details
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    ctc: Optional[float] = None
    doj: Optional[str] = None
    lwd: Optional[str] = None
    aadhar_number: Optional[str] = None
    pan_number: Optional[str] = None
    emergency_contact: Optional[str] = None
    department: Optional[str] = None
    city: Optional[str] = None
    vertical: Optional[str] = None
    designation: Optional[str] = None
    status: Optional[str] = None
    # Bank Details
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: str
    employee_id: str
    name: str
    phone: str
    address: Optional[str]
    ctc: float
    doj: str
    lwd: Optional[str]
    aadhar_number: Optional[str]
    pan_number: Optional[str]
    emergency_contact: Optional[str]
    department: str
    city: Optional[str]
    vertical: str
    designation: Optional[str]
    status: str
    created_at: str
    updated_at: str


# --- Helper Functions ---

def generate_employee_id(db) -> str:
    """Generate a unique employee ID like EMP001, EMP002, etc."""
    # This will be called within async context, but count_documents is sync
    # We'll handle this in the route
    return "EMP001"  # Placeholder, will be updated in route


async def async_generate_employee_id(db) -> str:
    """Generate a unique employee ID like EMP001, EMP002, etc."""
    count = await db.fixed_employees.count_documents({})
    new_id = f"EMP{str(count + 1).zfill(3)}"
    
    # Make sure it's unique
    while await db.fixed_employees.find_one({"employee_id": new_id}):
        count += 1
        new_id = f"EMP{str(count + 1).zfill(3)}"
    
    return new_id


# --- Routes ---

@router.get("/fixed-employees")
async def list_fixed_employees(
    status: Optional[str] = None,
    department: Optional[str] = None,
    vertical: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """List all fixed employees with optional filters"""
    try:
        query = {}
        
        if status:
            query["status"] = status
        
        if department:
            query["department"] = department
            
        if vertical:
            query["vertical"] = vertical
            
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"employee_id": {"$regex": search, "$options": "i"}}
            ]
        
        employees = await db.fixed_employees.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        return employees
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fixed-employees/{employee_id}")
async def get_fixed_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get a single employee by ID"""
    try:
        employee = await db.fixed_employees.find_one(
            {"$or": [{"id": employee_id}, {"employee_id": employee_id}]},
            {"_id": 0}
        )
        
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
            
        return employee
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fixed-employees")
async def create_fixed_employee(
    employee: EmployeeCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Create a new fixed employee"""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        employee_data = {
            "id": str(uuid.uuid4()),
            "employee_id": await async_generate_employee_id(db),
            "name": employee.name,
            "phone": employee.phone,
            "address": employee.address,
            "ctc": employee.ctc,
            "doj": employee.doj,
            "lwd": employee.lwd,
            "aadhar_number": employee.aadhar_number,
            "pan_number": employee.pan_number,
            "emergency_contact": employee.emergency_contact,
            "department": employee.department,
            "city": employee.city,
            "vertical": employee.vertical,
            "designation": employee.designation,
            "status": employee.status,
            # Bank Details
            "bank_name": employee.bank_name,
            "bank_account_number": employee.bank_account_number,
            "ifsc_code": employee.ifsc_code,
            "created_at": now,
            "updated_at": now,
            "created_by": current_user.get("id")
        }
        
        await db.fixed_employees.insert_one(employee_data)
        
        # Return without _id
        employee_data.pop("_id", None)
        return employee_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/fixed-employees/{employee_id}")
async def update_fixed_employee(
    employee_id: str,
    employee: EmployeeUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Update an existing fixed employee"""
    try:
        existing = await db.fixed_employees.find_one(
            {"$or": [{"id": employee_id}, {"employee_id": employee_id}]}
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        update_data = {k: v for k, v in employee.dict().items() if v is not None}
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.fixed_employees.update_one(
            {"id": existing["id"]},
            {"$set": update_data}
        )
        
        updated = await db.fixed_employees.find_one({"id": existing["id"]}, {"_id": 0})
        return updated
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/fixed-employees/{employee_id}")
async def delete_fixed_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete a fixed employee (soft delete by setting status to 'deleted')"""
    try:
        existing = await db.fixed_employees.find_one(
            {"$or": [{"id": employee_id}, {"employee_id": employee_id}]}
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        # Soft delete
        await db.fixed_employees.update_one(
            {"id": existing["id"]},
            {"$set": {
                "status": "deleted",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        return {"success": True, "message": "Employee deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fixed-employees-departments")
async def get_departments(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Get list of unique departments"""
    try:
        departments = await db.fixed_employees.distinct("department")
        return [d for d in departments if d]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Department Management Routes ---

@router.get("/departments")
async def list_departments(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """List all departments"""
    try:
        departments = await db.departments.find({}, {"_id": 0}).sort("name", 1).to_list(100)
        return departments
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/departments")
async def create_department(
    data: dict,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Create a new department"""
    try:
        name = data.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Department name is required")
        
        # Check if already exists
        existing = await db.departments.find_one({"name": name})
        if existing:
            raise HTTPException(status_code=400, detail="Department already exists")
        
        now = datetime.now(timezone.utc).isoformat()
        dept_data = {
            "id": str(uuid.uuid4()),
            "name": name,
            "created_at": now
        }
        
        await db.departments.insert_one(dept_data)
        dept_data.pop("_id", None)
        return dept_data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/departments/{dept_name}")
async def delete_department(
    dept_name: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Delete a department"""
    try:
        result = await db.departments.delete_one({"name": dept_name})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Department not found")
        return {"success": True, "message": "Department deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
