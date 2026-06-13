"""
QC Invoice Routes
=================
Extracted from server.py for modular organization.
Handles QC invoice management.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
from typing import List

from dependencies import (
    db,
    get_current_user,
)
from models import (
    QCInvoice,
    QCInvoiceCreate,
    QCInvoiceUpdate,
)

router = APIRouter(tags=["qc_invoices"])


@router.get("/qc-invoices")
async def get_qc_invoices(
    from_date: str = None,
    to_date: str = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if from_date or to_date:
        date_filter = {}
        if from_date:
            date_filter["$gte"] = from_date
        if to_date:
            date_filter["$lte"] = to_date + "T23:59:59"
        query["invoice_date"] = date_filter
    
    invoices = await db.qc_invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for inv in invoices:
        if isinstance(inv.get('invoice_date'), str):
            inv['invoice_date'] = datetime.fromisoformat(inv['invoice_date'])
        if isinstance(inv.get('created_at'), str):
            inv['created_at'] = datetime.fromisoformat(inv['created_at'])
        if isinstance(inv.get('updated_at'), str):
            inv['updated_at'] = datetime.fromisoformat(inv['updated_at'])
    return invoices


@router.get("/qc-invoices/next-number/{customer_name}/{invoice_date}")
async def get_next_invoice_number(customer_name: str, invoice_date: str, current_user: dict = Depends(get_current_user)):
    """Generate next invoice number in format: CUS-DDMMMYYYY-001"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get first 3 letters of customer name (uppercase)
    prefix = customer_name[:3].upper()
    
    # Parse date and format
    date_obj = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
    date_str = date_obj.strftime("%d%b%Y").upper()
    
    # Find existing invoices for this customer on this date
    pattern = f"^{prefix}-{date_str}-"
    existing = await db.qc_invoices.find(
        {"invoice_number": {"$regex": pattern}},
        {"invoice_number": 1, "_id": 0}
    ).to_list(100)
    
    # Get next sequence number
    if existing:
        numbers = [int(inv['invoice_number'].split('-')[-1]) for inv in existing]
        next_num = max(numbers) + 1
    else:
        next_num = 1
    
    invoice_number = f"{prefix}-{date_str}-{str(next_num).zfill(3)}"
    return {"invoice_number": invoice_number}


@router.post("/qc-invoices")
async def create_qc_invoice(input: QCInvoiceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Generate invoice number
    prefix = input.customer_name[:3].upper()
    date_str = input.invoice_date.strftime("%d%b%Y").upper()
    
    # Find existing invoices for this customer on this date
    pattern = f"^{prefix}-{date_str}-"
    existing = await db.qc_invoices.find(
        {"invoice_number": {"$regex": pattern}},
        {"invoice_number": 1, "_id": 0}
    ).to_list(100)
    
    if existing:
        numbers = [int(inv['invoice_number'].split('-')[-1]) for inv in existing]
        next_num = max(numbers) + 1
    else:
        next_num = 1
    
    invoice_number = f"{prefix}-{date_str}-{str(next_num).zfill(3)}"
    
    invoice_dict = input.model_dump()
    invoice_dict["invoice_number"] = invoice_number
    invoice_dict["recorded_by"] = current_user["user_id"]
    invoice = QCInvoice(**invoice_dict)
    
    doc = invoice.model_dump()
    doc['invoice_date'] = doc['invoice_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    await db.qc_invoices.insert_one(doc)
    
    return {"id": invoice.id, "invoice_number": invoice_number, "message": "Invoice created successfully"}


@router.put("/qc-invoices/{invoice_id}")
async def update_qc_invoice(invoice_id: str, input: QCInvoiceUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.qc_invoices.find_one({"id": invoice_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if 'invoice_date' in update_data:
        update_data['invoice_date'] = update_data['invoice_date'].isoformat()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.qc_invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    return {"id": invoice_id, "message": "Invoice updated successfully"}


@router.delete("/qc-invoices/{invoice_id}")
async def delete_qc_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_invoices.delete_one({"id": invoice_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return {"message": "Invoice deleted successfully"}
