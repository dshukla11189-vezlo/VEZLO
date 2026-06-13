"""
QC Orders and QC Customers Routes
=================================
Extracted from server.py for modular organization.
Handles QC order management and QC customer management.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime
from typing import List

from dependencies import (
    db,
    get_current_user,
)
from models import (
    QCOrder,
    QCOrderCreate,
    QCCustomer,
    QCCustomerCreate,
    CustomerProductSetting,
    CustomerProductSettingCreate,
)
from ocr_processor import process_excel_image

router = APIRouter(tags=["qc_orders"])


# ============================================================================
# QC ORDERS ROUTES
# ============================================================================
@router.get("/qc-orders", response_model=List[QCOrder])
async def get_qc_orders(
    from_date: str = None,
    to_date: str = None,
    limit: int = 200,
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
        query["order_date"] = date_filter
    
    orders = await db.qc_orders.find(query, {"_id": 0}).sort("order_date", -1).to_list(limit)
    for o in orders:
        if isinstance(o['order_date'], str):
            o['order_date'] = datetime.fromisoformat(o['order_date'])
        if o.get('delivery_date') and isinstance(o['delivery_date'], str):
            o['delivery_date'] = datetime.fromisoformat(o['delivery_date'])
        if isinstance(o['created_at'], str):
            o['created_at'] = datetime.fromisoformat(o['created_at'])
    return [QCOrder(**o) for o in orders]


@router.post("/qc-orders", response_model=QCOrder)
async def create_qc_order(input: QCOrderCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    order_dict = input.model_dump()
    order_dict["recorded_by"] = current_user["user_id"]
    order = QCOrder(**order_dict)
    
    # Reduce stock
    for item in order.products:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"current_stock": -item.quantity}}
        )
    
    doc = order.model_dump()
    doc['order_date'] = doc['order_date'].isoformat()
    if doc.get('delivery_date'):
        doc['delivery_date'] = doc['delivery_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_orders.insert_one(doc)
    return order


@router.post("/qc-orders/ocr")
async def ocr_qc_order(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    allowed_types = ["image/jpeg", "image/png", "image/bmp", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPG, PNG, BMP, WEBP")
    
    try:
        content = await file.read()
        extracted_data = await process_excel_image(content)
        return {"status": "success", "data": extracted_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


# ============================================================================
# QC CUSTOMERS ROUTES
# ============================================================================
@router.get("/qc-customers")
async def get_qc_customers(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    customers = await db.qc_customers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return customers


@router.post("/qc-customers")
async def create_qc_customer(input: QCCustomerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    customer = QCCustomer(**input.model_dump())
    doc = customer.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_customers.insert_one(doc)
    return {"id": customer.id, "name": customer.name}


@router.put("/qc-customers/{customer_id}")
async def update_qc_customer(customer_id: str, input: QCCustomerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = input.model_dump()
    result = await db.qc_customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"message": "Customer updated successfully"}


@router.delete("/qc-customers/{customer_id}")
async def delete_qc_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"message": "Customer deleted successfully"}


# ============================================================================
# CUSTOMER PRODUCT SETTINGS (Lot Size per Customer-Product)
# ============================================================================
@router.get("/customer-product-settings")
async def get_customer_product_settings(
    customer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if customer_id:
        query["customer_id"] = customer_id
    
    settings = await db.customer_product_settings.find(query, {"_id": 0}).to_list(1000)
    return settings


@router.post("/customer-product-settings")
async def create_or_update_customer_product_setting(
    input: CustomerProductSettingCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    from datetime import timezone
    
    # Check if setting already exists for this customer-product-packaging combo
    existing = await db.customer_product_settings.find_one({
        "customer_id": input.customer_id,
        "product_id": input.product_id,
        "packaging_id": input.packaging_id or None
    }, {"_id": 0})
    
    if existing:
        # Update existing
        await db.customer_product_settings.update_one(
            {"id": existing["id"]},
            {"$set": {
                "lot_size": input.lot_size,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        return {"id": existing["id"], "message": "Setting updated successfully"}
    else:
        # Create new
        setting = CustomerProductSetting(**input.model_dump())
        doc = setting.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        await db.customer_product_settings.insert_one(doc)
        return {"id": setting.id, "message": "Setting created successfully"}


@router.delete("/customer-product-settings/{setting_id}")
async def delete_customer_product_setting(setting_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.customer_product_settings.delete_one({"id": setting_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"message": "Setting deleted successfully"}
