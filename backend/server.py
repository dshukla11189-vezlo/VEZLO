from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import bcrypt
import jwt
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import io
import csv
import uuid

from models import *
from ocr_processor import process_excel_image
from pdf_generator import generate_invoice_pdf

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'freshflow-secret-key-change-in-production')
ALGORITHM = "HS256"

# Create the main app
app = FastAPI(title="FreshFlow API")
api_router = APIRouter(prefix="/api")

# Auth Helper Functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Auth Routes
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(input: RegisterRequest):
    existing = await db.users.find_one({"email": input.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = input.model_dump()
    user_dict["password"] = hash_password(user_dict.pop("password"))
    user = User(**user_dict)
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    token = create_token(user.id, user.email, user.role)
    return AuthResponse(token=token, user=UserResponse(**user.model_dump()))

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(input: LoginRequest):
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user or not verify_password(input.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["email"], user["role"])
    user.pop("password")
    return AuthResponse(token=token, user=UserResponse(**user))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)

# Product Routes
@api_router.get("/products", response_model=List[Product])
async def get_products(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    return [Product(**p) for p in products]

@api_router.post("/products", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(input: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    product = Product(**input.model_dump())
    doc = product.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.products.insert_one(doc)
    return product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, input: ProductUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.products.find_one_and_update(
        {"id": product_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return Product(**result)

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {"message": "Product deleted successfully"}

# Farmer Routes
@api_router.get("/farmers", response_model=List[Farmer])
async def get_farmers(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    farmers = await db.farmers.find({}, {"_id": 0}).to_list(1000)
    return [Farmer(**f) for f in farmers]

@api_router.post("/farmers", response_model=Farmer, status_code=status.HTTP_201_CREATED)
async def create_farmer(input: FarmerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    farmer = Farmer(**input.model_dump())
    doc = farmer.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.farmers.insert_one(doc)
    return farmer

@api_router.put("/farmers/{farmer_id}", response_model=Farmer)
async def update_farmer(farmer_id: str, input: FarmerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    update_data = input.model_dump()
    result = await db.farmers.find_one_and_update(
        {"id": farmer_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Farmer not found")
    
    return Farmer(**result)

@api_router.delete("/farmers/{farmer_id}")
async def delete_farmer(farmer_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    result = await db.farmers.delete_one({"id": farmer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Farmer not found")
    
    return {"message": "Farmer deleted successfully"}

# Procurement Routes
@api_router.get("/procurement", response_model=List[Procurement])
async def get_procurements(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    procurements = await db.procurements.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    for p in procurements:
        if isinstance(p['date'], str):
            p['date'] = datetime.fromisoformat(p['date'])
        if isinstance(p['created_at'], str):
            p['created_at'] = datetime.fromisoformat(p['created_at'])
    return [Procurement(**p) for p in procurements]

@api_router.post("/procurement", response_model=Procurement, status_code=status.HTTP_201_CREATED)
async def create_procurement(input: ProcurementCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    procurement_dict = input.model_dump()
    procurement_dict["recorded_by"] = current_user["user_id"]
    procurement = Procurement(**procurement_dict)
    
    # Update product stock
    for item in procurement.products:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"current_stock": item.quantity}}
        )
    
    doc = procurement.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.procurements.insert_one(doc)
    return procurement

@api_router.put("/procurement/{procurement_id}")
async def update_procurement(procurement_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Only update payment-related fields
    update_fields = {}
    if "paid_amount" in input:
        update_fields["paid_amount"] = input["paid_amount"]
    if "pending_amount" in input:
        update_fields["pending_amount"] = input["pending_amount"]
    if "payment_status" in input:
        update_fields["payment_status"] = input["payment_status"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    result = await db.procurements.find_one_and_update(
        {"id": procurement_id},
        {"$set": update_fields},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    return {"message": "Procurement updated successfully", "procurement": result}

@api_router.delete("/procurement/{procurement_id}")
async def delete_procurement(procurement_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Get procurement details first
    procurement = await db.procurements.find_one({"id": procurement_id}, {"_id": 0})
    if not procurement:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    # Reverse stock changes
    for item in procurement.get("products", []):
        await db.products.update_one(
            {"id": item["product_id"]},
            {"$inc": {"current_stock": -item["quantity"]}}
        )
    
    # Delete procurement
    result = await db.procurements.delete_one({"id": procurement_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Procurement not found")
    
    return {"message": "Procurement deleted successfully"}

# QC Order Routes
@api_router.get("/qc-orders", response_model=List[QCOrder])
async def get_qc_orders(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    orders = await db.qc_orders.find({}, {"_id": 0}).sort("order_date", -1).to_list(1000)
    for o in orders:
        if isinstance(o['order_date'], str):
            o['order_date'] = datetime.fromisoformat(o['order_date'])
        if o.get('delivery_date') and isinstance(o['delivery_date'], str):
            o['delivery_date'] = datetime.fromisoformat(o['delivery_date'])
        if isinstance(o['created_at'], str):
            o['created_at'] = datetime.fromisoformat(o['created_at'])
    return [QCOrder(**o) for o in orders]

@api_router.post("/qc-orders", response_model=QCOrder)
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

@api_router.post("/qc-orders/ocr")
async def ocr_qc_order(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    allowed_types = ["image/jpeg", "image/png", "image/bmp", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: JPG, PNG, BMP, WEBP")
    
    try:
        content = await file.read()
        extracted_data = await process_excel_image(content)
        return {"status": "success", "data": extracted_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

# QC Customer Routes
@api_router.get("/qc-customers")
async def get_qc_customers(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    customers = await db.qc_customers.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return customers

@api_router.post("/qc-customers")
async def create_qc_customer(input: QCCustomerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    customer = QCCustomer(**input.model_dump())
    doc = customer.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_customers.insert_one(doc)
    return {"id": customer.id, "name": customer.name}

@api_router.put("/qc-customers/{customer_id}")
async def update_qc_customer(customer_id: str, input: QCCustomerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = input.model_dump()
    result = await db.qc_customers.update_one({"id": customer_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"message": "Customer updated successfully"}

@api_router.delete("/qc-customers/{customer_id}")
async def delete_qc_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_customers.delete_one({"id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"message": "Customer deleted successfully"}

# QC Indent Routes
@api_router.get("/qc-indents")
async def get_qc_indents(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    indents = await db.qc_indents.find({}, {"_id": 0}).sort("indent_date", -1).to_list(1000)
    for i in indents:
        if isinstance(i.get('indent_date'), str):
            i['indent_date'] = datetime.fromisoformat(i['indent_date'])
        if isinstance(i.get('created_at'), str):
            i['created_at'] = datetime.fromisoformat(i['created_at'])
    return indents

@api_router.post("/qc-indents")
async def create_qc_indent(input: QCIndentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    indent_dict = input.model_dump()
    indent_dict["recorded_by"] = current_user["user_id"]
    indent = QCIndent(**indent_dict)
    
    doc = indent.model_dump()
    doc['indent_date'] = doc['indent_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_indents.insert_one(doc)
    return {"id": indent.id, "message": "Indent created successfully"}

@api_router.put("/qc-indents/{indent_id}")
async def update_qc_indent(indent_id: str, input: QCIndentUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if 'indent_date' in update_data:
        update_data['indent_date'] = update_data['indent_date'].isoformat()
    
    result = await db.qc_indents.update_one({"id": indent_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    return {"message": "Indent updated successfully"}

@api_router.delete("/qc-indents/{indent_id}")
async def delete_qc_indent(indent_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_indents.delete_one({"id": indent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    return {"message": "Indent deleted successfully"}

# QC Dispatch Routes
@api_router.get("/qc-dispatches")
async def get_qc_dispatches(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    dispatches = await db.qc_dispatches.find({}, {"_id": 0}).sort("dispatch_date", -1).to_list(1000)
    for d in dispatches:
        if isinstance(d.get('dispatch_date'), str):
            d['dispatch_date'] = datetime.fromisoformat(d['dispatch_date'])
        if isinstance(d.get('created_at'), str):
            d['created_at'] = datetime.fromisoformat(d['created_at'])
    return dispatches

@api_router.post("/qc-dispatches")
async def create_qc_dispatch(input: QCDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    dispatch_dict = input.model_dump()
    dispatch_dict["recorded_by"] = current_user["user_id"]
    dispatch = QCDispatch(**dispatch_dict)
    
    doc = dispatch.model_dump()
    doc['dispatch_date'] = doc['dispatch_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_dispatches.insert_one(doc)
    
    # Check if all indent qty is dispatched to update status
    indent = await db.qc_indents.find_one({"id": input.indent_id})
    if indent:
        # Get all dispatches for this indent
        all_dispatches = await db.qc_dispatches.find({"indent_id": input.indent_id}, {"_id": 0}).to_list(100)
        
        # Calculate total dispatched per product
        total_dispatched = {}
        for d in all_dispatches:
            for item in d.get('items', []):
                key = item['product_id']
                total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
        
        # Check if fully dispatched
        fully_dispatched = True
        for item in indent.get('items', []):
            dispatched = total_dispatched.get(item['product_id'], 0)
            if dispatched < item['required_qty']:
                fully_dispatched = False
                break
        
        # Update indent status
        new_status = "dispatched" if fully_dispatched else "partial"
        await db.qc_indents.update_one({"id": input.indent_id}, {"$set": {"status": new_status}})
    
    return {"id": dispatch.id, "message": "Dispatch created successfully"}

@api_router.put("/qc-dispatches/{dispatch_id}")
async def update_qc_dispatch(dispatch_id: str, input: QCDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.qc_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    update_data = input.model_dump()
    update_data['dispatch_date'] = update_data['dispatch_date'].isoformat()
    
    await db.qc_dispatches.update_one(
        {"id": dispatch_id},
        {"$set": update_data}
    )
    
    return {"id": dispatch_id, "message": "Dispatch updated successfully"}

@api_router.delete("/qc-dispatches/{dispatch_id}")
async def delete_qc_dispatch(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the dispatch to find the indent_id
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    indent_id = dispatch.get("indent_id")
    
    # Delete the dispatch
    result = await db.qc_dispatches.delete_one({"id": dispatch_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Check if there are any remaining dispatches for this indent
    if indent_id:
        remaining_dispatches = await db.qc_dispatches.count_documents({"indent_id": indent_id})
        
        if remaining_dispatches == 0:
            # No more dispatches - reset indent status to pending
            await db.qc_indents.update_one(
                {"id": indent_id},
                {"$set": {"status": "pending"}}
            )
        else:
            # Check if indent is fully dispatched or partial
            indent = await db.qc_indents.find_one({"id": indent_id}, {"_id": 0})
            if indent:
                dispatches_for_indent = await db.qc_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
                
                # Calculate total dispatched per product
                dispatched_by_product = {}
                for d in dispatches_for_indent:
                    for item in d.get("items", []):
                        product_id = item.get("product_id")
                        if product_id:
                            dispatched_by_product[product_id] = dispatched_by_product.get(product_id, 0) + item.get("supplied_qty", 0)
                
                # Check if all items are fully dispatched
                all_dispatched = True
                for item in indent.get("items", []):
                    product_id = item.get("product_id")
                    required = item.get("required_qty", 0)
                    dispatched = dispatched_by_product.get(product_id, 0)
                    if dispatched < required:
                        all_dispatched = False
                        break
                
                new_status = "dispatched" if all_dispatched else "partial"
                await db.qc_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"status": new_status}}
                )
    
    return {"message": "Dispatch deleted successfully"}

@api_router.delete("/qc-dispatches/{dispatch_id}/items/{product_id}")
async def delete_qc_dispatch_item(dispatch_id: str, product_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a single item from a dispatch record"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the dispatch
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    items = dispatch.get("items", [])
    original_count = len(items)
    
    # Filter out the item with matching product_id
    items = [item for item in items if item.get("product_id") != product_id]
    
    if len(items) == original_count:
        raise HTTPException(status_code=404, detail="Item not found in dispatch")
    
    if len(items) == 0:
        # If no items left, delete the entire dispatch
        await db.qc_dispatches.delete_one({"id": dispatch_id})
        
        # Update indent status
        indent_id = dispatch.get("indent_id")
        if indent_id:
            remaining_dispatches = await db.qc_dispatches.count_documents({"indent_id": indent_id})
            if remaining_dispatches == 0:
                await db.qc_indents.update_one({"id": indent_id}, {"$set": {"status": "pending"}})
        
        return {"message": "Dispatch deleted (no items remaining)"}
    
    # Update the dispatch with remaining items
    await db.qc_dispatches.update_one(
        {"id": dispatch_id},
        {"$set": {"items": items}}
    )
    
    return {"message": "Item removed from dispatch"}

# QC GRN Routes
@api_router.get("/qc-grns")
async def get_qc_grns(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    grns = await db.qc_grns.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for g in grns:
        if isinstance(g.get('grn_date'), str):
            g['grn_date'] = datetime.fromisoformat(g['grn_date'])
        if isinstance(g.get('created_at'), str):
            g['created_at'] = datetime.fromisoformat(g['created_at'])
    return grns

@api_router.post("/qc-grns")
async def create_qc_grn(input: QCGRNCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    grn_dict = input.model_dump()
    grn_dict["recorded_by"] = current_user["user_id"]
    grn = QCGRN(**grn_dict)
    
    doc = grn.model_dump()
    doc['grn_date'] = doc['grn_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_grns.insert_one(doc)
    
    return {"id": grn.id, "message": "GRN created successfully"}

@api_router.delete("/qc-grns/{grn_id}")
async def delete_qc_grn(grn_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_grns.delete_one({"id": grn_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    return {"message": "GRN deleted successfully"}

@api_router.delete("/qc-grns/{grn_id}/items/{item_index}")
async def delete_qc_grn_item(grn_id: str, item_index: int, current_user: dict = Depends(get_current_user)):
    """Delete a single item from a GRN record"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the GRN
    grn = await db.qc_grns.find_one({"id": grn_id}, {"_id": 0})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    items = grn.get("items", [])
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item index")
    
    # Remove the item
    items.pop(item_index)
    
    if len(items) == 0:
        # If no items left, delete the entire GRN
        await db.qc_grns.delete_one({"id": grn_id})
        return {"message": "GRN deleted (no items remaining)"}
    
    # Recalculate totals
    total_supplied = sum(item.get("supplied_qty", 0) for item in items)
    total_grn = sum(item.get("grn_qty", 0) for item in items)
    total_difference = sum(item.get("difference", 0) for item in items)
    
    # Update the GRN
    await db.qc_grns.update_one(
        {"id": grn_id},
        {"$set": {
            "items": items,
            "total_supplied": total_supplied,
            "total_grn": total_grn,
            "total_difference": total_difference
        }}
    )
    
    return {"message": "Item removed from GRN"}

@api_router.post("/qc-grns/upload-ninjacart-csv")
async def upload_ninjacart_grn_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Upload Ninjacart GRN CSV file and match with our dispatches.
    The CSV contains: PO_DeliveryDate, Sku Name, GRNQuantity, GRNPrice, WeightUnit
    
    STRICT VALIDATION: Only processes CSV rows if a dispatch exists for that exact date.
    Returns warnings for skipped rows (no matching dispatch).
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    # Read and parse CSV
    content = await file.read()
    decoded = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(decoded))
    
    # Get all Ninjacart dispatches
    ninjacart_dispatches = await db.qc_dispatches.find(
        {"customer_name": {"$regex": "ninja", "$options": "i"}},
        {"_id": 0}
    ).to_list(1000)
    
    # Build a set of dates that have dispatches for quick lookup
    dispatch_dates_set = set()
    for dispatch in ninjacart_dispatches:
        dispatch_date = dispatch.get('dispatch_date', '')
        if isinstance(dispatch_date, str):
            dispatch_dates_set.add(dispatch_date[:10])  # YYYY-MM-DD
        else:
            dispatch_dates_set.add(dispatch_date.strftime('%Y-%m-%d'))
    
    # Get packaging variants for weight lookup
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    packaging_map = {p['name'].lower(): p for p in packaging_variants}
    
    # Parse CSV rows and validate against dispatch dates
    csv_data_by_date = {}
    skipped_rows = []  # Track rows skipped due to no matching dispatch
    total_csv_rows = 0
    
    for row in reader:
        total_csv_rows += 1
        try:
            # Parse date (format: DD/MM/YY)
            date_str = row.get('PO_DeliveryDate', '')
            if not date_str:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': 'Missing date',
                    'sku': row.get('Sku Name', 'Unknown')
                })
                continue
            
            day, month, year = date_str.split('/')
            # Handle 2-digit year
            if len(year) == 2:
                year = '20' + year
            parsed_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            
            sku_name = row.get('Sku Name', '').strip()
            grn_qty_raw = row.get('GRNQuantity', '0')
            grn_qty = float(grn_qty_raw) if grn_qty_raw else 0
            grn_price = float(row.get('GRNPrice', '0') or '0')
            weight_unit = row.get('WeightUnit', 'Kg').strip()
            
            if not sku_name or grn_qty == 0:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': 'Empty SKU or zero quantity',
                    'sku': sku_name or 'Empty',
                    'date': date_str
                })
                continue
            
            # STRICT VALIDATION: Check if dispatch exists for this date
            if parsed_date not in dispatch_dates_set:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': f'No dispatch found for date {date_str}',
                    'sku': sku_name,
                    'date': date_str
                })
                continue
            
            # Store by date (only if dispatch exists)
            if parsed_date not in csv_data_by_date:
                csv_data_by_date[parsed_date] = []
            
            csv_data_by_date[parsed_date].append({
                'sku_name': sku_name,
                'grn_qty': grn_qty,
                'grn_price': grn_price,
                'weight_unit': weight_unit
            })
        except Exception as e:
            logging.error(f"Error parsing CSV row {total_csv_rows}: {e}")
            skipped_rows.append({
                'row': total_csv_rows,
                'reason': f'Parse error: {str(e)}',
                'sku': row.get('Sku Name', 'Unknown')
            })
            continue
    
    # Match CSV data with dispatches
    matched_items = []
    
    for dispatch in ninjacart_dispatches:
        dispatch_date = dispatch.get('dispatch_date', '')
        if isinstance(dispatch_date, str):
            dispatch_date_str = dispatch_date[:10]  # Get YYYY-MM-DD part
        else:
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        
        # Check if we have CSV data for this date
        if dispatch_date_str not in csv_data_by_date:
            continue
        
        csv_rows = csv_data_by_date[dispatch_date_str]
        
        for item in dispatch.get('items', []):
            product_name = item.get('product_name', '').lower()
            packaging_name = item.get('packaging_name', '') or ''
            packaging_weight_gm = 0
            
            # Try to find packaging weight from DB
            if packaging_name:
                pkg = packaging_map.get(packaging_name.lower())
                if pkg:
                    packaging_weight_gm = pkg.get('weight_gm', 0)
            
            # Determine if this dispatch item's packaging is Kg-based or PCS-based
            packaging_upper = packaging_name.upper()
            dispatch_is_kg_based = 'KG' in packaging_upper or 'KGS' in packaging_upper
            dispatch_is_pcs_based = 'PCS' in packaging_upper or 'PACK' in packaging_upper
            
            # Try to match with CSV data - must match BOTH product name AND pricing type
            best_match = None
            best_match_score = 0
            
            # Variant/color words that MUST match exactly if present in product name
            variant_words = {'red', 'green', 'yellow', 'white', 'black', 'purple', 'orange', 
                           'small', 'large', 'big', 'baby', 'mini', 'jumbo', 'local', 'hybrid',
                           'english', 'indian', 'desi', 'organic', 'fresh'}
            
            for csv_row in csv_rows:
                sku_name = csv_row['sku_name'].lower()
                sku_name_original = csv_row['sku_name']
                
                # Check product name match - ALL significant words of product must be in SKU
                product_words = [w.lower() for w in product_name.split() if len(w) > 2]  # Skip short words
                sku_words = sku_name.replace('-', ' ').replace('(', ' ').replace(')', ' ').split()
                
                # STRICT CHECK: If product has variant words, they MUST be in SKU
                product_variants = [w for w in product_words if w in variant_words]
                if product_variants:
                    # Check each variant word is present in SKU
                    variant_match = all(
                        any(pv in sw or sw in pv for sw in sku_words) 
                        for pv in product_variants
                    )
                    if not variant_match:
                        # Variant word missing from SKU - skip this match
                        continue
                
                # Count how many product words match in SKU
                match_count = sum(1 for pw in product_words if any(pw in sw or sw in pw for sw in sku_words))
                
                # Require at least first word (product type) to match
                if product_words and not any(product_words[0] in sw or sw in product_words[0] for sw in sku_words):
                    continue
                
                # Calculate match score (higher is better)
                match_score = match_count / len(product_words) if product_words else 0
                
                # If product has multiple words, require ALL to match (100%)
                if len(product_words) > 1 and match_score < 1.0:
                    continue
                
                # Detect SKU pricing type from SKU name: (Kg)/(Kgs) = Kg-based, (PCS) = piece-based
                sku_upper = sku_name_original.upper()
                sku_is_kg_based = '(KG)' in sku_upper or '(KGS)' in sku_upper or sku_upper.endswith('KG') or sku_upper.endswith('KGS') or ' KG ' in sku_upper or '-KG-' in sku_upper or ' KGS ' in sku_upper or '-KGS-' in sku_upper
                sku_is_pcs_based = '(PCS)' in sku_upper
                
                # Match type: Kg-based SKU should match Kg-based packaging, PCS-based should match PCS-based
                type_match = False
                if sku_is_kg_based and dispatch_is_kg_based:
                    type_match = True
                elif sku_is_pcs_based and dispatch_is_pcs_based:
                    type_match = True
                elif not sku_is_kg_based and not sku_is_pcs_based:
                    # SKU doesn't specify type - allow flexible matching
                    type_match = True
                elif not dispatch_is_kg_based and not dispatch_is_pcs_based:
                    # Packaging doesn't specify type - allow flexible matching
                    type_match = True
                
                if not type_match:
                    continue
                
                # This is a potential match - track it if it's better than current best
                if match_score > best_match_score:
                    best_match_score = match_score
                    best_match = {
                        'csv_row': csv_row,
                        'sku_name_original': sku_name_original,
                        'sku_is_kg_based': sku_is_kg_based,
                        'sku_is_pcs_based': sku_is_pcs_based
                    }
            
            # Process the best match if found
            if best_match:
                csv_row = best_match['csv_row']
                sku_name_original = best_match['sku_name_original']
                sku_is_kg_based = best_match['sku_is_kg_based']
                sku_is_pcs_based = best_match['sku_is_pcs_based']
                
                grn_qty_raw = csv_row['grn_qty']
                csv_rate = csv_row['grn_price']
                weight_unit = csv_row['weight_unit']
                
                # Determine GRN units and amount based on SKU type
                if sku_is_kg_based:
                    # SKU is Kg-based: GRN qty is in Kg, Rate is per Kg
                    # Convert Kg to units: units = Kg * 1000 / packaging_weight_gm
                    if packaging_weight_gm > 0:
                        grn_qty_units = (grn_qty_raw * 1000) / packaging_weight_gm
                        rate_per_unit = csv_rate * (packaging_weight_gm / 1000)
                    else:
                        # Fallback if no packaging weight - assume 100gm
                        grn_qty_units = grn_qty_raw * 10
                        rate_per_unit = csv_rate / 10
                    
                    # Amount = GRN in Kg × Rate per Kg
                    amount = grn_qty_raw * csv_rate
                    rate_type = 'per_kg'
                    
                elif sku_is_pcs_based:
                    # SKU is PCS-based: GRN qty is already in pieces, Rate is per piece
                    grn_qty_units = grn_qty_raw
                    rate_per_unit = csv_rate
                    amount = grn_qty_units * csv_rate
                    rate_type = 'per_pcs'
                    
                else:
                    # Fallback: use WeightUnit from CSV column
                    if weight_unit.lower() == 'kg' and packaging_weight_gm > 0:
                        grn_qty_units = (grn_qty_raw * 1000) / packaging_weight_gm
                        rate_per_unit = csv_rate * (packaging_weight_gm / 1000)
                        amount = grn_qty_raw * csv_rate
                    else:
                        grn_qty_units = grn_qty_raw
                        rate_per_unit = csv_rate
                        amount = grn_qty_units * csv_rate
                    rate_type = 'unknown'
                
                supplied_qty = item.get('supplied_qty', 0)
                difference = grn_qty_units - supplied_qty
                
                # Calculate loss/gain amount based on rate type
                if sku_is_kg_based and packaging_weight_gm > 0:
                    # Loss/Gain: convert unit difference to Kg, then multiply by rate/Kg
                    diff_weight_kg = difference * packaging_weight_gm / 1000
                    loss_gain_amount = diff_weight_kg * csv_rate
                else:
                    # Loss/Gain in pieces/units
                    loss_gain_amount = difference * rate_per_unit
                
                matched_items.append({
                    'dispatch_id': dispatch.get('id'),
                    'dispatch_date': dispatch_date_str,
                    'product_id': item.get('product_id'),
                    'product_name': item.get('product_name'),
                    'product_unit': item.get('product_unit'),
                    'packaging_id': item.get('packaging_id'),
                    'packaging_name': packaging_name,
                    'packaging_weight_gm': packaging_weight_gm,
                    'supplied_qty': supplied_qty,
                    'grn_qty': round(grn_qty_units, 2),
                    'grn_qty_kg': grn_qty_raw if sku_is_kg_based else None,
                    'difference': round(difference, 2),
                    'rate_per_kg': csv_rate if sku_is_kg_based else None,
                    'rate_per_unit': round(rate_per_unit, 2),
                    'rate_type': rate_type,
                    'sku_name': sku_name_original,
                    'amount': round(amount, 2),
                    'loss_gain_amount': round(loss_gain_amount, 2)
                })
                # Mark the CSV row as used (remove from list to prevent reuse)
                csv_rows.remove(csv_row)
    
    # Build response with warnings
    warnings = []
    if skipped_rows:
        # Group skipped rows by reason
        no_dispatch_rows = [r for r in skipped_rows if 'No dispatch found' in r.get('reason', '')]
        other_skipped = [r for r in skipped_rows if 'No dispatch found' not in r.get('reason', '')]
        
        if no_dispatch_rows:
            dates_skipped = list(set([r.get('date', 'Unknown') for r in no_dispatch_rows]))
            warnings.append(f"{len(no_dispatch_rows)} row(s) skipped - No dispatch found for dates: {', '.join(dates_skipped)}")
        
        if other_skipped:
            warnings.append(f"{len(other_skipped)} row(s) skipped due to invalid data")
    
    return {
        "file_name": file.filename,
        "total_csv_rows": total_csv_rows,
        "rows_processed": sum(len(rows) for rows in csv_data_by_date.values()),
        "rows_skipped": len(skipped_rows),
        "dates_found": list(csv_data_by_date.keys()),
        "matched_items": matched_items,
        "warnings": warnings,
        "skipped_details": skipped_rows[:10] if skipped_rows else [],  # Show first 10 skipped
        "message": f"Processed {len(matched_items)} matching items" + (f" ({len(skipped_rows)} rows skipped)" if skipped_rows else "")
    }

@api_router.get("/qc-grns/dispatch-summary")
async def get_dispatch_summary_for_grn(current_user: dict = Depends(get_current_user)):
    """Get all Ninjacart dispatches for GRN table - excludes items already in saved GRNs"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all Ninjacart dispatches
    dispatches = await db.qc_dispatches.find(
        {"customer_name": {"$regex": "ninja", "$options": "i"}},
        {"_id": 0}
    ).sort("dispatch_date", -1).to_list(1000)
    
    # Get all saved GRNs to exclude already processed items
    saved_grns = await db.qc_grns.find({}, {"_id": 0}).to_list(1000)
    
    # Build a set of processed dispatch_id + product_id combinations
    processed_items = set()
    for grn in saved_grns:
        for item in grn.get('items', []):
            # Create a unique key for each processed item
            key = f"{item.get('dispatch_id')}_{item.get('product_id')}"
            processed_items.add(key)
    
    # Flatten items with dispatch info, excluding already processed
    items = []
    for dispatch in dispatches:
        dispatch_date = dispatch.get('dispatch_date', '')
        for item in dispatch.get('items', []):
            item_key = f"{dispatch.get('id')}_{item.get('product_id')}"
            
            # Skip if already processed in a GRN
            if item_key in processed_items:
                continue
                
            items.append({
                'dispatch_id': dispatch.get('id'),
                'dispatch_date': dispatch_date,
                'dispatch_time': dispatch.get('dispatch_time', ''),
                'customer_name': dispatch.get('customer_name'),
                'product_id': item.get('product_id'),
                'product_name': item.get('product_name'),
                'product_unit': item.get('product_unit'),
                'packaging_id': item.get('packaging_id'),
                'packaging_name': item.get('packaging_name'),
                'supplied_qty': item.get('supplied_qty', 0),
                'grn_qty': None,
                'difference': None,
                'rate_per_unit': item.get('rate'),
            })
    
    return items

# QC Invoice Routes
@api_router.get("/qc-invoices")
async def get_qc_invoices(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoices = await db.qc_invoices.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for inv in invoices:
        if isinstance(inv.get('invoice_date'), str):
            inv['invoice_date'] = datetime.fromisoformat(inv['invoice_date'])
        if isinstance(inv.get('created_at'), str):
            inv['created_at'] = datetime.fromisoformat(inv['created_at'])
        if isinstance(inv.get('updated_at'), str):
            inv['updated_at'] = datetime.fromisoformat(inv['updated_at'])
    return invoices

@api_router.get("/qc-invoices/next-number/{customer_name}/{invoice_date}")
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

@api_router.post("/qc-invoices")
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

@api_router.put("/qc-invoices/{invoice_id}")
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

@api_router.delete("/qc-invoices/{invoice_id}")
async def delete_qc_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_invoices.delete_one({"id": invoice_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return {"message": "Invoice deleted successfully"}

# Retailer Order Routes
@api_router.get("/retailer-orders", response_model=List[RetailerOrder])
async def get_retailer_orders(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "retailer":
        query = {"retailer_id": current_user["user_id"]}
    elif current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    orders = await db.retailer_orders.find(query, {"_id": 0}).sort("order_date", -1).to_list(1000)
    for o in orders:
        if isinstance(o['order_date'], str):
            o['order_date'] = datetime.fromisoformat(o['order_date'])
        if o.get('delivery_date') and isinstance(o['delivery_date'], str):
            o['delivery_date'] = datetime.fromisoformat(o['delivery_date'])
        if isinstance(o['created_at'], str):
            o['created_at'] = datetime.fromisoformat(o['created_at'])
    return [RetailerOrder(**o) for o in orders]

@api_router.post("/retailer-orders", response_model=RetailerOrder)
async def create_retailer_order(input: RetailerOrderCreate, current_user: dict = Depends(get_current_user)):
    order_dict = input.model_dump()
    
    if current_user["role"] == "retailer":
        order_dict["retailer_id"] = current_user["user_id"]
    elif current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    order = RetailerOrder(**order_dict)
    
    # Reduce stock for approved orders
    if order.status == "approved":
        for item in order.products:
            await db.products.update_one(
                {"id": item.product_id},
                {"$inc": {"current_stock": -item.packets}}
            )
    
    doc = order.model_dump()
    doc['order_date'] = doc['order_date'].isoformat()
    if doc.get('delivery_date'):
        doc['delivery_date'] = doc['delivery_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.retailer_orders.insert_one(doc)
    return order

@api_router.put("/retailer-orders/{order_id}/status")
async def update_order_status(order_id: str, input: OrderStatusUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    order = await db.retailer_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Update stock if status changes to approved
    if order["status"] == "pending" and input.status == "approved":
        for item in order["products"]:
            await db.products.update_one(
                {"id": item["product_id"]},
                {"$inc": {"current_stock": -item["packets"]}}
            )
    
    result = await db.retailer_orders.find_one_and_update(
        {"id": order_id},
        {"$set": {"status": input.status}},
        return_document=True,
        projection={"_id": 0}
    )
    
    return {"message": "Order status updated", "order": result}

# Rejection Routes
@api_router.get("/rejections", response_model=List[Rejection])
async def get_rejections(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "retailer":
        query = {"retailer_id": current_user["user_id"]}
    elif current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    rejections = await db.rejections.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    for r in rejections:
        if isinstance(r['date'], str):
            r['date'] = datetime.fromisoformat(r['date'])
        if isinstance(r['created_at'], str):
            r['created_at'] = datetime.fromisoformat(r['created_at'])
    return [Rejection(**r) for r in rejections]

@api_router.post("/rejections", response_model=Rejection)
async def create_rejection(input: RejectionCreate, current_user: dict = Depends(get_current_user)):
    rejection_dict = input.model_dump()
    
    if current_user["role"] == "retailer":
        rejection_dict["retailer_id"] = current_user["user_id"]
    
    rejection = Rejection(**rejection_dict)
    
    doc = rejection.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.rejections.insert_one(doc)
    return rejection

# Wastage Routes
@api_router.get("/wastage", response_model=List[Wastage])
async def get_wastage(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    wastages = await db.wastage.find({}, {"_id": 0}).sort("date", -1).to_list(1000)
    for w in wastages:
        if isinstance(w['date'], str):
            w['date'] = datetime.fromisoformat(w['date'])
        if isinstance(w['created_at'], str):
            w['created_at'] = datetime.fromisoformat(w['created_at'])
    return [Wastage(**w) for w in wastages]

@api_router.post("/wastage", response_model=Wastage)
async def create_wastage(input: WastageCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    wastage_dict = input.model_dump()
    wastage_dict["recorded_by"] = current_user["user_id"]
    wastage = Wastage(**wastage_dict)
    
    # Reduce stock
    for item in wastage.products:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"current_stock": -item.quantity}}
        )
    
    doc = wastage.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.wastage.insert_one(doc)
    return wastage

# Payment Routes
@api_router.get("/payments", response_model=List[Payment])
async def get_payments(party_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "retailer":
        query = {"party_type": "retailer", "party_id": current_user["user_id"]}
    elif current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    elif party_type:
        query["party_type"] = party_type
    
    payments = await db.payments.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    for p in payments:
        if isinstance(p['date'], str):
            p['date'] = datetime.fromisoformat(p['date'])
        if isinstance(p['created_at'], str):
            p['created_at'] = datetime.fromisoformat(p['created_at'])
    return [Payment(**p) for p in payments]

@api_router.post("/payments", response_model=Payment)
async def create_payment(input: PaymentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payment_dict = input.model_dump()
    payment_dict["recorded_by"] = current_user["user_id"]
    payment = Payment(**payment_dict)
    
    doc = payment.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.payments.insert_one(doc)
    return payment

# Invoice Routes
@api_router.get("/invoices", response_model=List[Invoice])
async def get_invoices(current_user: dict = Depends(get_current_user)):
    query = {}
    if current_user["role"] == "retailer":
        query = {"party_type": "retailer", "party_id": current_user["user_id"]}
    elif current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoices = await db.invoices.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    for inv in invoices:
        if isinstance(inv['date'], str):
            inv['date'] = datetime.fromisoformat(inv['date'])
        if isinstance(inv['created_at'], str):
            inv['created_at'] = datetime.fromisoformat(inv['created_at'])
    return [Invoice(**inv) for inv in invoices]

@api_router.post("/invoices/generate", response_model=Invoice)
async def generate_invoice(input: InvoiceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get next invoice number
    last_invoice = await db.invoices.find_one({}, {"_id": 0, "invoice_number": 1}, sort=[("invoice_number", -1)])
    next_number = 1001
    if last_invoice:
        try:
            next_number = int(last_invoice["invoice_number"].split("-")[1]) + 1
        except:
            next_number = 1001
    
    invoice_dict = input.model_dump()
    invoice_dict["invoice_number"] = f"FF-{next_number}"
    invoice = Invoice(**invoice_dict)
    
    doc = invoice.model_dump()
    doc['date'] = doc['date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.invoices.insert_one(doc)
    return invoice

@api_router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: str, current_user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Check access
    if current_user["role"] == "retailer" and invoice["party_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get party details
    party_name = ""
    if invoice["party_type"] == "retailer":
        user = await db.users.find_one({"id": invoice["party_id"]}, {"_id": 0})
        party_name = user.get("name", "") if user else ""
    elif invoice["party_type"] == "qc":
        order = await db.qc_orders.find_one({"id": invoice["order_id"]}, {"_id": 0})
        party_name = order.get("company_name", "") if order else ""
    
    pdf_buffer = generate_invoice_pdf(invoice, party_name)
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice['invoice_number']}.pdf"}
    )

# Dashboard/Analytics Routes
@api_router.get("/reports/dashboard")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Total products
    total_products = await db.products.count_documents({})
    
    # Total stock value
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    total_stock_value = sum((p.get("current_stock", 0) or 0) * (p.get("price_per_kg", 0) or 0) for p in products)
    
    # Today's orders
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_qc = await db.qc_orders.count_documents({"order_date": {"$gte": today.isoformat()}})
    today_retailer = await db.retailer_orders.count_documents({"order_date": {"$gte": today.isoformat()}})
    
    # Pending payments
    invoices = await db.invoices.find({}, {"_id": 0}).to_list(1000)
    pending_payments = sum(inv.get("pending_amount", 0) for inv in invoices)
    
    # Today's wastage
    wastages = await db.wastage.find({"date": {"$gte": today.isoformat()}}, {"_id": 0}).to_list(1000)
    today_wastage = sum(sum(item.get("quantity", 0) for item in w.get("products", [])) for w in wastages)
    
    return {
        "total_products": total_products,
        "total_stock_value": round(total_stock_value, 2),
        "today_qc_orders": today_qc,
        "today_retailer_orders": today_retailer,
        "pending_payments": round(pending_payments, 2),
        "today_wastage": round(today_wastage, 2)
    }

# ==================== STOCK STATUS ROUTES ====================

@api_router.get("/stock-status/today")
async def get_today_stock_status(current_user: dict = Depends(get_current_user)):
    """Get today's stock status for all products with opening qty, purchases, dispatches"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all products
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    
    # Get yesterday's closing stock (for opening)
    yesterday_status = await db.daily_stock_status.find(
        {"date": yesterday, "status": "closed"},
        {"_id": 0}
    ).to_list(1000)
    yesterday_map = {s["product_id"]: s for s in yesterday_status}
    
    # Get today's existing status
    today_status = await db.daily_stock_status.find(
        {"date": today},
        {"_id": 0}
    ).to_list(1000)
    today_map = {s["product_id"]: s for s in today_status}
    
    # Get today's procurements (purchases from farmers)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    procurements = await db.procurements.find({
        "procurement_date": {"$gte": today_start.isoformat()}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate purchases by product
    purchases_by_product = {}
    for proc in procurements:
        for item in proc.get("items", []):
            product_id = item.get("product_id")
            qty = item.get("quantity", 0)  # in Kg
            rate = item.get("rate", 0)
            value = qty * rate
            if product_id not in purchases_by_product:
                purchases_by_product[product_id] = {"qty": 0, "value": 0}
            purchases_by_product[product_id]["qty"] += qty
            purchases_by_product[product_id]["value"] += value
    
    # Get today's QC dispatches
    qc_dispatches = await db.qc_dispatches.find({
        "dispatch_date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(1000)
    
    # Get today's retailer dispatches (if exists)
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(1000)
    
    # Get packaging weights for unit conversion
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    packaging_map = {p['name'].lower(): p.get('weight_gm', 100) for p in packaging_variants}
    
    # Calculate dispatches by product (convert units to Kg)
    dispatches_by_product = {}
    for dispatch in qc_dispatches + retailer_dispatches:
        for item in dispatch.get("items", []):
            product_name = item.get("product_name", "").lower()
            product_id = item.get("product_id")
            supplied_qty = item.get("supplied_qty", 0)  # in units
            packaging_name = item.get("packaging_name", "").lower()
            
            # Convert units to Kg based on packaging weight
            weight_gm = packaging_map.get(packaging_name, 100)
            qty_kg = (supplied_qty * weight_gm) / 1000
            
            rate = item.get("rate", 0)
            value = supplied_qty * rate
            
            if product_id not in dispatches_by_product:
                dispatches_by_product[product_id] = {"qty": 0, "value": 0}
            dispatches_by_product[product_id]["qty"] += qty_kg
            dispatches_by_product[product_id]["value"] += value
    
    # Build stock status for each product
    result = []
    for product in products:
        product_id = product["id"]
        product_name = product["name"]
        
        # Get or create today's status
        if product_id in today_map:
            status = today_map[product_id]
        else:
            # Calculate opening from yesterday's closing or start with 0
            if product_id in yesterday_map:
                opening_qty = yesterday_map[product_id].get("closing_qty", 0) or 0
                opening_price = yesterday_map[product_id].get("avg_price", 0) or 0
            else:
                opening_qty = 0
                opening_price = product.get("price_per_kg", 0) or 0
            
            purchase_data = purchases_by_product.get(product_id, {"qty": 0, "value": 0})
            dispatch_data = dispatches_by_product.get(product_id, {"qty": 0, "value": 0})
            
            # Calculate weighted average price
            total_qty = opening_qty + purchase_data["qty"]
            if total_qty > 0:
                opening_value = opening_qty * opening_price
                avg_price = (opening_value + purchase_data["value"]) / total_qty
            else:
                avg_price = opening_price or purchase_data["value"] / purchase_data["qty"] if purchase_data["qty"] > 0 else 0
            
            status = {
                "id": str(uuid.uuid4()),
                "date": today,
                "product_id": product_id,
                "product_name": product_name,
                "product_unit": product.get("unit", "Kg"),
                "opening_qty": round(opening_qty, 2),
                "opening_price": round(opening_price, 2),
                "purchase_qty": round(purchase_data["qty"], 2),
                "purchase_value": round(purchase_data["value"], 2),
                "dispatch_qty": round(dispatch_data["qty"], 2),
                "dispatch_value": round(dispatch_data["value"], 2),
                "closing_qty": None,
                "wastage_qty": 0,
                "wastage_value": 0,
                "wastage_percent": 0,
                "avg_price": round(avg_price, 2),
                "status": "open"
            }
            
            # Save to database (creates a copy internally, but mutates status with _id)
            await db.daily_stock_status.insert_one(status.copy())
        
        # Ensure no _id field in response (MongoDB insert_one mutates the dict)
        if "_id" in status:
            del status["_id"]
        result.append(status)
    
    return result

@api_router.post("/stock-status/close")
async def close_stock_status(entries: StockClosingBulkEntry, current_user: dict = Depends(get_current_user)):
    """Staff enters closing quantities for products"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    updated = []
    
    for entry in entries.entries:
        # Get today's status for this product
        status = await db.daily_stock_status.find_one(
            {"date": today, "product_id": entry.product_id},
            {"_id": 0}
        )
        
        if not status:
            continue
        
        closing_qty = entry.closing_qty
        opening_qty = status.get("opening_qty", 0)
        purchase_qty = status.get("purchase_qty", 0)
        dispatch_qty = status.get("dispatch_qty", 0)
        avg_price = status.get("avg_price", 0)
        
        # Calculate wastage: Opening + Purchase - Dispatch - Closing
        total_available = opening_qty + purchase_qty - dispatch_qty
        wastage_qty = max(0, total_available - closing_qty)
        wastage_value = wastage_qty * avg_price
        
        # Calculate wastage percentage
        total_input = opening_qty + purchase_qty
        wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
        
        # Update status
        update_data = {
            "closing_qty": round(closing_qty, 2),
            "wastage_qty": round(wastage_qty, 2),
            "wastage_value": round(wastage_value, 2),
            "wastage_percent": round(wastage_percent, 2),
            "status": "closed",
            "closed_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.daily_stock_status.update_one(
            {"date": today, "product_id": entry.product_id},
            {"$set": update_data}
        )
        
        updated.append({
            "product_id": entry.product_id,
            "product_name": status.get("product_name"),
            **update_data
        })
    
    return {"message": f"Closed {len(updated)} products", "updated": updated}

@api_router.get("/stock-status/history")
async def get_stock_status_history(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    product_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get historical stock status data"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if from_date:
        query["date"] = {"$gte": from_date}
    if to_date:
        if "date" in query:
            query["date"]["$lte"] = to_date
        else:
            query["date"] = {"$lte": to_date}
    if product_id:
        query["product_id"] = product_id
    
    history = await db.daily_stock_status.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return history

@api_router.get("/stock-status/wastage-dashboard")
async def get_wastage_dashboard(
    days: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Get wastage dashboard data with trends"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get data for the specified number of days
    end_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    start_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime('%Y-%m-%d')
    
    history = await db.daily_stock_status.find(
        {"date": {"$gte": start_date, "$lte": end_date}, "status": "closed"},
        {"_id": 0}
    ).to_list(5000)
    
    # Aggregate by date
    daily_totals = {}
    product_totals = {}
    
    for record in history:
        date = record["date"]
        product_name = record["product_name"]
        wastage_qty = record.get("wastage_qty", 0)
        wastage_value = record.get("wastage_value", 0)
        wastage_percent = record.get("wastage_percent", 0)
        opening_qty = record.get("opening_qty", 0)
        purchase_qty = record.get("purchase_qty", 0)
        
        # Daily totals
        if date not in daily_totals:
            daily_totals[date] = {
                "date": date,
                "total_wastage_kg": 0,
                "total_wastage_value": 0,
                "total_input": 0,
                "avg_wastage_percent": 0
            }
        daily_totals[date]["total_wastage_kg"] += wastage_qty
        daily_totals[date]["total_wastage_value"] += wastage_value
        daily_totals[date]["total_input"] += opening_qty + purchase_qty
        
        # Product totals
        if product_name not in product_totals:
            product_totals[product_name] = {
                "product_name": product_name,
                "total_wastage_kg": 0,
                "total_wastage_value": 0,
                "avg_wastage_percent": 0,
                "days_count": 0
            }
        product_totals[product_name]["total_wastage_kg"] += wastage_qty
        product_totals[product_name]["total_wastage_value"] += wastage_value
        product_totals[product_name]["days_count"] += 1
    
    # Calculate averages
    for date in daily_totals:
        total_input = daily_totals[date]["total_input"]
        if total_input > 0:
            daily_totals[date]["avg_wastage_percent"] = round(
                (daily_totals[date]["total_wastage_kg"] / total_input) * 100, 2
            )
        daily_totals[date]["total_wastage_kg"] = round(daily_totals[date]["total_wastage_kg"], 2)
        daily_totals[date]["total_wastage_value"] = round(daily_totals[date]["total_wastage_value"], 2)
    
    # Sort daily data by date
    daily_data = sorted(daily_totals.values(), key=lambda x: x["date"])
    
    # Top wastage products
    product_data = sorted(product_totals.values(), key=lambda x: x["total_wastage_kg"], reverse=True)[:10]
    
    # Overall summary
    total_wastage_kg = sum(d["total_wastage_kg"] for d in daily_data)
    total_wastage_value = sum(d["total_wastage_value"] for d in daily_data)
    total_input = sum(d["total_input"] for d in daily_data)
    avg_daily_wastage = total_wastage_kg / len(daily_data) if daily_data else 0
    overall_wastage_percent = (total_wastage_kg / total_input * 100) if total_input > 0 else 0
    
    return {
        "period_days": days,
        "start_date": start_date,
        "end_date": end_date,
        "summary": {
            "total_wastage_kg": round(total_wastage_kg, 2),
            "total_wastage_value": round(total_wastage_value, 2),
            "avg_daily_wastage_kg": round(avg_daily_wastage, 2),
            "overall_wastage_percent": round(overall_wastage_percent, 2)
        },
        "daily_trend": daily_data,
        "top_wastage_products": product_data
    }

@api_router.put("/stock-status/{status_id}")
async def update_stock_status(status_id: str, updates: dict, current_user: dict = Depends(get_current_user)):
    """Update a stock status entry"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Remove protected fields
    updates.pop("id", None)
    updates.pop("_id", None)
    updates.pop("date", None)
    updates.pop("product_id", None)
    
    result = await db.daily_stock_status.update_one(
        {"id": status_id},
        {"$set": updates}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stock status not found")
    
    return {"message": "Stock status updated"}

@api_router.delete("/stock-status/{status_id}")
async def delete_stock_status(status_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a stock status entry"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.daily_stock_status.delete_one({"id": status_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Stock status not found")
    
    return {"message": "Stock status deleted"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()