"""
FreshFlow API Server
====================

TABLE OF CONTENTS (Search for SECTION: to jump to each section)
================================================================
1. HEALTH & DIAGNOSTICS ROUTES     (~Line 145)
2. AUTHENTICATION ROUTES           (~Line 195)
3. USER MANAGEMENT ROUTES          (~Line 230)
4. PRODUCTS & PACKAGING ROUTES     (~Line 315)
5. FARMER ROUTES                   (~Line 385)
6. PROCUREMENT ROUTES              (~Line 435)
7. PROCUREMENT TEMPLATES           (~Line 560)
8. QC ORDERS ROUTES                (~Line 600)
9. QC CUSTOMER ROUTES              (~Line 675)
10. QC INDENT ROUTES               (~Line 780)
11. QC DISPATCH ROUTES             (~Line 835)
12. QC GRN ROUTES                  (~Line 1010)
13. QC INVOICE ROUTES              (~Line 1465)
14. RETAILER ORDER ROUTES          (~Line 1590)
15. WASTAGE ROUTES                 (~Line 1695)
16. DASHBOARD & ANALYTICS ROUTES   (~Line 1850)
17. STOCK STATUS ROUTES            (~Line 2500)
18. VARIABLE EXPENSES ROUTES       (~Line 3115)
19. FIXED EXPENSES ROUTES          (~Line 3220)
20. RETAILER PORTAL ROUTES         (~Line 3380)
    - Retailer Indents
    - Retailer Dispatches
    - Retailer GRN
    - Retailer Rejections
    - Retailer Payments
    - Retailer Invoices
    - Retailer Dashboard
21. BACKUP & DATA MANAGEMENT       (~Line 4140)
================================================================
"""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import bcrypt
import jwt
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import io
import csv
import uuid
import traceback
import time

from models import *
from ocr_processor import process_excel_image
from pdf_generator import generate_invoice_pdf
from backup_system import setup_backup_scheduler, trigger_manual_backup, generate_backup_excel
from gmail_integration import (
    get_authorization_url, exchange_code_for_tokens, get_gmail_service,
    search_ninjacart_emails, get_email_content, download_attachment,
    parse_ninjacart_csv, parse_ninjacart_email_body, mark_email_as_read,
    add_label_to_email
)
from starlette.responses import RedirectResponse
from apscheduler.triggers.cron import CronTrigger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Enhanced logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("freshflow")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Setup backup scheduler on startup
backup_scheduler = None

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'freshflow-secret-key-change-in-production')
ALGORITHM = "HS256"

# Create the main app
app = FastAPI(title="FreshFlow API")
api_router = APIRouter(prefix="/api")

# Store recent errors for diagnostics (in-memory, last 50 errors)
recent_errors = []
MAX_ERROR_LOG = 50

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    request_id = str(uuid.uuid4())[:8]
    
    # Log request
    logger.info(f"[{request_id}] {request.method} {request.url.path} - Started")
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log response
        log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(log_level, f"[{request_id}] {request.method} {request.url.path} - {response.status_code} ({process_time:.3f}s)")
        
        # Store errors
        if response.status_code >= 400:
            error_entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "request_id": request_id,
                "method": request.method,
                "path": str(request.url.path),
                "status_code": response.status_code,
                "process_time": round(process_time, 3)
            }
            recent_errors.append(error_entry)
            if len(recent_errors) > MAX_ERROR_LOG:
                recent_errors.pop(0)
        
        return response
    except Exception as e:
        process_time = time.time() - start_time
        error_msg = str(e)
        tb = traceback.format_exc()
        
        logger.error(f"[{request_id}] {request.method} {request.url.path} - EXCEPTION: {error_msg}")
        logger.error(f"[{request_id}] Traceback: {tb}")
        
        # Store error
        error_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
            "method": request.method,
            "path": str(request.url.path),
            "status_code": 500,
            "error": error_msg,
            "traceback": tb[:500],  # Truncate traceback
            "process_time": round(process_time, 3)
        }
        recent_errors.append(error_entry)
        if len(recent_errors) > MAX_ERROR_LOG:
            recent_errors.pop(0)
        
        raise

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

# ============================================================================
# SECTION: HEALTH & DIAGNOSTICS ROUTES (Lines ~140-190)
# ============================================================================
@api_router.get("/health")
async def health_check():
    """Basic health check endpoint"""
    try:
        # Test MongoDB connection
        await db.command("ping")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "version": "1.0.0"
    }

@api_router.get("/diagnostics")
async def get_diagnostics(current_user: dict = Depends(get_current_user)):
    """Get recent error logs and system diagnostics (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        # Test MongoDB
        await db.command("ping")
        db_status = "connected"
        
        # Get collection stats
        collections = await db.list_collection_names()
        collection_counts = {}
        for coll in collections[:10]:  # Limit to 10 collections
            count = await db[coll].count_documents({})
            collection_counts[coll] = count
    except Exception as e:
        db_status = f"error: {str(e)}"
        collection_counts = {}
    
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": {
            "status": db_status,
            "collections": collection_counts
        },
        "recent_errors": recent_errors[-20:],  # Last 20 errors
        "error_count": len(recent_errors),
        "uptime_note": "Errors are stored in-memory and reset on server restart"
    }

# ============================================================================
# SECTION: AUTHENTICATION ROUTES (Lines ~190-305)
# ============================================================================
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

# ============================================================================
# SECTION: USER MANAGEMENT ROUTES - Admin Only (Lines ~225-305)
# ============================================================================
@api_router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can manage users")
    
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return users

@api_router.post("/users")
async def create_user(input: RegisterRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    
    existing = await db.users.find_one({"email": input.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_dict = input.model_dump()
    user_dict["password"] = hash_password(user_dict.pop("password"))
    user = User(**user_dict)
    
    doc = user.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.users.insert_one(doc)
    
    return {"id": user.id, "message": "User created successfully"}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, input: UserUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update users")
    
    existing = await db.users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Build update data
    update_data = {}
    if input.name:
        update_data["name"] = input.name
    if input.email:
        # Check if email is already taken by another user
        email_check = await db.users.find_one({"email": input.email, "id": {"$ne": user_id}})
        if email_check:
            raise HTTPException(status_code=400, detail="Email already in use")
        update_data["email"] = input.email
    if input.password:
        update_data["password"] = hash_password(input.password)
    if input.role:
        update_data["role"] = input.role
    if input.company_name is not None:
        update_data["company_name"] = input.company_name
    if input.contact is not None:
        update_data["contact"] = input.contact
    if input.address is not None:
        update_data["address"] = input.address
    if input.commission_percentage is not None:
        update_data["commission_percentage"] = input.commission_percentage
    
    if update_data:
        await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    return {"id": user_id, "message": "User updated successfully"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    
    # Prevent deleting self
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted successfully"}

# ============================================================================
# SECTION: PRODUCTS & PACKAGING ROUTES (Lines ~310-375)
# ============================================================================
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

# ============================================================================
# SECTION: QC PACKAGING ROUTES
# ============================================================================
@api_router.get("/qc-packaging")
async def get_qc_packaging(current_user: dict = Depends(get_current_user)):
    packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    return packagings

@api_router.post("/qc-packaging")
async def create_qc_packaging(name: str, weight_gm: float = 0, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    packaging = {
        "id": str(uuid.uuid4()),
        "name": name,
        "weight_gm": weight_gm
    }
    await db.qc_packaging.insert_one(packaging)
    return {"id": packaging["id"], "message": "Packaging created"}

# ============================================================================
# SECTION: FARMER ROUTES (Lines ~375-425)
# ============================================================================
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

# ============================================================================
# SECTION: PROCUREMENT ROUTES (Lines ~425-590)
# ============================================================================
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


@api_router.get("/procurement/previous-day")
async def get_previous_day_procurements(current_user: dict = Depends(get_current_user)):
    """Get previous day's procurements to use as template for today's entry"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get yesterday's date
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Find procurements from yesterday
    all_procurements = await db.procurements.find({}, {"_id": 0}).to_list(1000)
    
    yesterday_procs = []
    for p in all_procurements:
        proc_date = p.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str == yesterday:
            yesterday_procs.append(p)
    
    # Convert to template format (remove IDs and payment status)
    templates = []
    for p in yesterday_procs:
        templates.append({
            "farmer_id": p.get("farmer_id"),
            "farmer_name": p.get("farmer_name"),
            "products": p.get("products", []),
            "total_amount": p.get("total_amount", 0),
            "date": yesterday
        })
    
    return templates


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


# ============================================================================
# SECTION: PROCUREMENT TEMPLATES
# ============================================================================
@api_router.get("/procurement-templates")
async def get_procurement_templates(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    templates = await db.procurement_templates.find({}, {"_id": 0}).to_list(100)
    return templates

@api_router.post("/procurement-templates")
async def create_procurement_template(input: ProcurementTemplateCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    template = ProcurementTemplate(
        name=input.name,
        farmer_id=input.farmer_id,
        farmer_name=input.farmer_name,
        items=input.items,
        created_by=current_user["user_id"]
    )
    
    doc = template.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.procurement_templates.insert_one(doc)
    
    return {"id": template.id, "message": "Template created successfully"}

@api_router.delete("/procurement-templates/{template_id}")
async def delete_procurement_template(template_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.procurement_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {"message": "Template deleted successfully"}


# ============================================================================
# SECTION: QC ORDERS ROUTES (Lines ~592-650)
# ============================================================================
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

# ============================================================================
# SECTION: QC CUSTOMER ROUTES (Lines ~666-770)
# ============================================================================
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

# Customer Product Settings (Lot Size per Customer-Product)
@api_router.get("/customer-product-settings")
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

@api_router.post("/customer-product-settings")
async def create_or_update_customer_product_setting(
    input: CustomerProductSettingCreate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
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

@api_router.delete("/customer-product-settings/{setting_id}")
async def delete_customer_product_setting(setting_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.customer_product_settings.delete_one({"id": setting_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"message": "Setting deleted successfully"}

# ============================================================================
# SECTION: QC INDENT ROUTES (Lines ~770-825)
# ============================================================================
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

# ============================================================================
# SECTION: QC DISPATCH ROUTES (Lines ~825-1000)
# ============================================================================
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

# ============================================================================
# SECTION: QC GRN ROUTES (Lines ~999-1450)
# ============================================================================
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
    Upload Ninjacart GRN CSV or Excel file and match with our dispatches.
    The file contains: PO_DeliveryDate, Sku Name, GRNQuantity, GRNPrice, WeightUnit
    
    STRICT VALIDATION: Only processes rows if a dispatch exists for that exact date.
    Returns warnings for skipped rows (no matching dispatch).
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.csv') or filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx, .xls) files are allowed")
    
    # Read file content
    content = await file.read()
    
    # Parse based on file type
    rows_data = []
    if filename_lower.endswith('.csv'):
        # Parse CSV
        decoded = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))
        rows_data = list(reader)
        logger.info(f"CSV headers: {reader.fieldnames if hasattr(reader, 'fieldnames') else 'N/A'}")
    else:
        # Parse Excel (.xlsx or .xls)
        import openpyxl
        from io import BytesIO
        from datetime import datetime as dt
        
        try:
            workbook = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
            sheet = workbook.active
            
            # Get headers from first row - try to find the actual header row
            headers = []
            header_row = 1
            
            # Check first few rows to find header row (in case there's a title row)
            for check_row in range(1, 4):
                potential_headers = []
                for cell in sheet[check_row]:
                    val = str(cell.value).strip() if cell.value else ''
                    potential_headers.append(val)
                
                # Check if this looks like a header row (contains expected column names)
                header_str = ' '.join(potential_headers).lower()
                if 'podate' in header_str or 'sku' in header_str or 'grn' in header_str or 'po_deliverydate' in header_str:
                    headers = potential_headers
                    header_row = check_row
                    break
            
            # If no header row found, use first row
            if not headers:
                for cell in sheet[1]:
                    headers.append(str(cell.value).strip() if cell.value else '')
            
            logger.info(f"Excel headers found at row {header_row}: {headers}")
            
            # Parse data rows (starting after header row)
            for row_idx, row in enumerate(sheet.iter_rows(min_row=header_row+1, values_only=True), start=header_row+1):
                row_dict = {}
                for col_idx, value in enumerate(row):
                    if col_idx < len(headers):
                        header = headers[col_idx]
                        # Handle datetime objects specially
                        if isinstance(value, dt):
                            row_dict[header] = value.strftime('%Y-%m-%d')
                        elif value is not None:
                            row_dict[header] = str(value).strip()
                        else:
                            row_dict[header] = ''
                if any(row_dict.values()):  # Skip completely empty rows
                    rows_data.append(row_dict)
            
            # Log first row for debugging
            if rows_data:
                logger.info(f"First Excel row parsed: {rows_data[0]}")
            else:
                logger.warning(f"No data rows found in Excel file")
            
            workbook.close()
        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    
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
    
    # Parse rows and validate against dispatch dates
    # Support both old format (PO_DeliveryDate, Sku Name, GRNQuantity, GRNPrice, WeightUnit)
    # and new format (podate, Sku, GRN_Qty, Total_Value, Kgs_Pcs)
    csv_data_by_date = {}
    skipped_rows = []  # Track rows skipped due to no matching dispatch
    total_csv_rows = 0
    
    for row in rows_data:
        total_csv_rows += 1
        try:
            # Detect format and extract date
            # New format: podate (YYYY-MM-DD)
            # Old format: PO_DeliveryDate (DD/MM/YY)
            date_str = row.get('podate', '') or row.get('PO_DeliveryDate', '')
            
            if not date_str:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': 'Missing date',
                    'sku': row.get('Sku', row.get('Sku Name', 'Unknown'))
                })
                continue
            
            # Parse date based on format
            parsed_date = None
            if '-' in str(date_str):
                # New format: YYYY-MM-DD or datetime object
                if hasattr(date_str, 'strftime'):
                    # It's a datetime object from Excel
                    parsed_date = date_str.strftime('%Y-%m-%d')
                else:
                    # It's a string like "2026-03-29"
                    parsed_date = str(date_str)[:10]  # Take first 10 chars (YYYY-MM-DD)
            elif '/' in str(date_str):
                # Old format: DD/MM/YY
                day, month, year = str(date_str).split('/')
                if len(year) == 2:
                    year = '20' + year
                parsed_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            else:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': f'Invalid date format: {date_str}',
                    'sku': row.get('Sku', row.get('Sku Name', 'Unknown'))
                })
                continue
            
            # Extract SKU name (new format: Sku, old format: Sku Name)
            sku_name = (row.get('Sku', '') or row.get('Sku Name', '')).strip()
            
            # Extract GRN quantity (new format: GRN_Qty, old format: GRNQuantity)
            grn_qty_raw = row.get('GRN_Qty', '') or row.get('GRNQuantity', '0')
            grn_qty = float(grn_qty_raw) if grn_qty_raw else 0
            
            # Extract price/value (new format: Total_Value, old format: GRNPrice)
            # For new format, we may need to calculate rate from Total_Value / GRN_Qty
            total_value_raw = row.get('Total_Value', '') or row.get('GRNPrice', '0')
            total_value = float(total_value_raw) if total_value_raw else 0
            
            # Calculate rate per unit
            if grn_qty > 0 and total_value > 0:
                grn_price = total_value / grn_qty
            else:
                grn_price = float(row.get('GRNPrice', '0') or '0')
            
            # Extract unit (new format: Kgs_Pcs, old format: WeightUnit)
            weight_unit = (row.get('Kgs_Pcs', '') or row.get('WeightUnit', 'Kg')).strip()
            
            if not sku_name or grn_qty == 0:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': 'Empty SKU or zero quantity',
                    'sku': sku_name or 'Empty',
                    'date': str(date_str)
                })
                continue
            
            # STRICT VALIDATION: Check if dispatch exists for this date
            if parsed_date not in dispatch_dates_set:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': f'No dispatch found for date {parsed_date}',
                    'sku': sku_name,
                    'date': str(date_str)
                })
                continue
            
            # Store by date (only if dispatch exists)
            if parsed_date not in csv_data_by_date:
                csv_data_by_date[parsed_date] = []
            
            csv_data_by_date[parsed_date].append({
                'sku_name': sku_name,
                'grn_qty': grn_qty,
                'grn_price': grn_price,
                'total_value': total_value,
                'weight_unit': weight_unit
            })
        except Exception as e:
            logger.error(f"Error parsing row {total_csv_rows}: {e}")
            skipped_rows.append({
                'row': total_csv_rows,
                'reason': f'Parse error: {str(e)}',
                'sku': row.get('Sku', row.get('Sku Name', 'Unknown'))
            })
            continue
    
    # Match CSV data with dispatches
    matched_items = []
    
    # Log parsed data for debugging
    logger.info(f"GRN Upload: Parsed {total_csv_rows} rows, {len(csv_data_by_date)} dates with data")
    logger.info(f"GRN Upload: Dispatch dates available: {list(dispatch_dates_set)[:5]}...")
    logger.info(f"GRN Upload: CSV dates parsed: {list(csv_data_by_date.keys())}")
    
    # Variant/color words that MUST match exactly if present in product name
    variant_words = {'red', 'green', 'yellow', 'white', 'black', 'purple', 'orange', 
                   'small', 'large', 'big', 'baby', 'mini', 'jumbo', 'local', 'hybrid',
                   'english', 'indian', 'desi', 'organic', 'fresh'}
    
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
            product_name_original = item.get('product_name', '')
            packaging_name = item.get('packaging_name', '') or ''
            packaging_weight_gm = 0
            
            # Try to find packaging weight from DB
            if packaging_name:
                pkg = packaging_map.get(packaging_name.lower())
                if pkg:
                    packaging_weight_gm = pkg.get('weight_gm', 0)
            
            # If no weight from DB, try to parse from packaging name (e.g., "200 gm", "100 gm")
            if packaging_weight_gm == 0:
                weight_match = re.search(r'(\d+)\s*(gm|g|gram)', packaging_name.lower())
                if weight_match:
                    packaging_weight_gm = int(weight_match.group(1))
            
            # Determine if this dispatch item's packaging is Kg-based or PCS-based
            packaging_upper = packaging_name.upper()
            packaging_lower = packaging_name.lower()
            
            # Check if packaging is PCS-based (pieces):
            # 1. Explicit "(PCS)" or "PCS" markers
            # 2. "With Roots" or "Without Roots" packaging (these are sold as pieces)
            dispatch_is_pcs_based = ('(PCS)' in packaging_upper or 
                                     ' PCS ' in packaging_upper or
                                     packaging_upper.endswith(' PCS') or
                                     packaging_upper.endswith('(PCS)') or
                                     packaging_upper.startswith('PCS ') or
                                     'with roots' in packaging_lower or
                                     'without roots' in packaging_lower)
            
            # Kg-based: weight-based packaging without PCS indicators
            dispatch_is_kg_based = not dispatch_is_pcs_based
            
            logger.info(f"Matching dispatch item: {product_name_original} | {packaging_name} | weight={packaging_weight_gm}gm | pcs={dispatch_is_pcs_based}")
            
            # Try to match with CSV data
            best_match = None
            best_match_score = 0
            
            for csv_row in csv_rows:
                sku_name = csv_row['sku_name'].lower()
                sku_name_original = csv_row['sku_name']
                
                # Remove common suffixes like "- FK", "- MH", etc. for better matching
                sku_name_cleaned = sku_name.replace(' - fk', '').replace('-fk', '').replace(' fk', '')
                sku_name_cleaned = sku_name_cleaned.replace(' - mh', '').replace('-mh', '').replace(' mh', '')
                
                # Get base product name from SKU (remove everything after (Kg) or (PCS))
                sku_base = re.sub(r'\s*\([^)]*\)\s*', ' ', sku_name_cleaned).strip()
                sku_base = re.sub(r'\s+', ' ', sku_base)  # Normalize spaces
                
                # Check product name match
                product_words = [w.lower() for w in product_name.split() if len(w) > 2]
                sku_words = sku_base.replace('-', ' ').split()
                
                # STRICT CHECK: If product has variant words, they MUST be in SKU
                product_variants = [w for w in product_words if w in variant_words]
                if product_variants:
                    variant_match = all(
                        any(pv in sw or sw in pv for sw in sku_words) 
                        for pv in product_variants
                    )
                    if not variant_match:
                        continue
                
                # Check if first word (main product) matches
                if product_words and not any(product_words[0] in sw or sw in product_words[0] for sw in sku_words):
                    continue
                
                # Count matching words
                match_count = sum(1 for pw in product_words if any(pw in sw or sw in pw for sw in sku_words))
                match_score = match_count / len(product_words) if product_words else 0
                
                # Detect SKU pricing type
                sku_upper = sku_name_original.upper()
                csv_unit = csv_row.get('weight_unit', '').upper()
                
                # Kg-based: has (KG), (KGS), or unit is KGS/KG
                sku_is_kg_based = ('(KG)' in sku_upper or '(KGS)' in sku_upper or 
                                   'KG)' in sku_upper or  # e.g., "(Kg)"
                                   csv_unit in ['KGS', 'KG', 'KILO', 'KILOS'])
                
                # PCS-based: has (PCS) in SKU or unit is PCS
                sku_is_pcs_based = ('(PCS)' in sku_upper or 'PACK)(PCS)' in sku_upper or
                                   csv_unit in ['PCS', 'PIECES', 'PIECE'])
                
                logger.info(f"  Checking SKU: {sku_name_original} | sku_kg={sku_is_kg_based}, sku_pcs={sku_is_pcs_based} | match_score={match_score}")
                
                # Match type validation
                type_match = False
                if sku_is_kg_based and dispatch_is_kg_based:
                    type_match = True
                elif sku_is_pcs_based and dispatch_is_pcs_based:
                    type_match = True
                
                if not type_match:
                    logger.info(f"    Type mismatch: sku_kg={sku_is_kg_based}, sku_pcs={sku_is_pcs_based}, dispatch_kg={dispatch_is_kg_based}, dispatch_pcs={dispatch_is_pcs_based}")
                    continue
                
                # Track best match
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
    
    # Include debug info about what was parsed
    first_row_sample = rows_data[0] if rows_data else {}
    
    return {
        "file_name": file.filename,
        "total_csv_rows": total_csv_rows,
        "rows_processed": sum(len(rows) for rows in csv_data_by_date.values()),
        "rows_skipped": len(skipped_rows),
        "dates_found": list(csv_data_by_date.keys()),
        "matched_items": matched_items,
        "warnings": warnings,
        "skipped_details": skipped_rows[:10] if skipped_rows else [],
        "debug_first_row": first_row_sample,  # Show what was actually parsed
        "debug_columns_found": list(first_row_sample.keys()) if first_row_sample else [],
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

# ============================================================================
# SECTION: QC INVOICE ROUTES (Lines ~1453-1570)
# ============================================================================
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

# ============================================================================
# SECTION: RETAILER ORDER ROUTES (Lines ~1578-1670)
# ============================================================================
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

# ============================================================================
# SECTION: WASTAGE ROUTES (Lines ~1684-1720)
# ============================================================================
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
    party_address = ""
    is_ninjacart = False
    
    if invoice["party_type"] == "retailer":
        user = await db.users.find_one({"id": invoice["party_id"]}, {"_id": 0})
        if user:
            party_name = user.get("name", "")
            party_address = user.get("address", "")
    elif invoice["party_type"] == "qc":
        # Try to get from qc_customers first
        customer = await db.qc_customers.find_one({"id": invoice.get("customer_id")}, {"_id": 0})
        if customer:
            party_name = customer.get("name", "")
            party_address = customer.get("address", "")
        else:
            # Fallback to qc_orders
            order = await db.qc_orders.find_one({"id": invoice["order_id"]}, {"_id": 0})
            party_name = order.get("company_name", "") if order else ""
        
        # Check if Ninjacart
        is_ninjacart = 'ninjacart' in party_name.lower() if party_name else False
    
    pdf_buffer = generate_invoice_pdf(invoice, party_name, party_address, is_ninjacart)
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{invoice['invoice_number']}.pdf"}
    )

# ============================================================================
# SECTION: DASHBOARD & ANALYTICS ROUTES (Lines ~1839-2480)
# ============================================================================
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

@api_router.get("/reports/today-summary")
async def get_today_summary(current_user: dict = Depends(get_current_user)):
    """Get today's quick summary for dashboard widget"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Today's dispatches
    dispatches = await db.qc_dispatches.find({
        "dispatch_date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(500)
    
    today_dispatch_count = len(dispatches)
    today_dispatch_value = 0
    product_sales = {}  # Track top selling products
    
    for d in dispatches:
        for item in d.get('items', []):
            qty = item.get('supplied_qty', 0) or 0
            rate = item.get('rate', 0) or 0
            amount = qty * rate
            today_dispatch_value += amount
            
            product_name = item.get('product_name', 'Unknown')
            if product_name not in product_sales:
                product_sales[product_name] = {"qty": 0, "amount": 0}
            product_sales[product_name]["qty"] += qty
            product_sales[product_name]["amount"] += amount
    
    # Today's Retailer Dispatches
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(500)
    
    today_retailer_dispatch_count = len(retailer_dispatches)
    today_retailer_value = sum(d.get('net_payable', 0) or 0 for d in retailer_dispatches)
    
    # Add retailer products to top products
    for d in retailer_dispatches:
        for item in d.get('items', []):
            qty = item.get('supplied_qty', 0) or 0
            amount = item.get('total_value', 0) or 0
            product_name = item.get('product_name', 'Unknown')
            if product_name not in product_sales:
                product_sales[product_name] = {"qty": 0, "amount": 0}
            product_sales[product_name]["qty"] += qty
            product_sales[product_name]["amount"] += amount
    
    # Pending indents (QC + Retailer)
    pending_qc_indents = await db.qc_indents.count_documents({
        "status": {"$in": ["pending", "partial"]}
    })
    pending_retailer_indents = await db.retailer_indents.count_documents({
        "status": {"$in": ["pending", "partial"]}
    })
    pending_indents = pending_qc_indents + pending_retailer_indents
    
    # Today's procurements
    procurements = await db.procurements.find({
        "date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(500)
    
    today_procurement_count = len(procurements)
    today_procurement_value = sum(p.get('total_amount', 0) or 0 for p in procurements)
    
    # Top 5 selling products today
    top_products = sorted(
        [{"name": k, **v} for k, v in product_sales.items()],
        key=lambda x: x["amount"],
        reverse=True
    )[:5]
    
    # Recent activity - last 5 dispatches/procurements
    recent_activity = []
    
    for d in dispatches[:3]:
        total_items = sum(item.get('supplied_qty', 0) for item in d.get('items', []))
        recent_activity.append({
            "type": "dispatch",
            "customer": d.get('customer_name', 'Unknown'),
            "items": total_items,
            "time": d.get('dispatch_time', '')
        })
    
    for p in procurements[:2]:
        recent_activity.append({
            "type": "procurement",
            "farmer": p.get('farmer_name', 'Unknown'),
            "amount": p.get('total_amount', 0),
            "time": ""
        })
    
    return {
        "today_dispatches": today_dispatch_count,
        "today_dispatch_value": round(today_dispatch_value, 2),
        "pending_indents": pending_indents,
        "today_procurements": today_procurement_count,
        "today_procurement_value": round(today_procurement_value, 2),
        "top_products": top_products,
        "recent_activity": recent_activity[:5]
    }

@api_router.get("/reports/pnl")
async def get_pnl_report(
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get comprehensive P&L report with daily breakdown and customer-wise analysis"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Default to current month if no dates provided
    if not from_date:
        from_date = datetime.now(timezone.utc).replace(day=1).strftime('%Y-%m-%d')
    if not to_date:
        to_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    # Sales by customer
    sales_by_customer = {}
    sales_by_date = {}
    sales_by_product = {}
    # Product-level breakdown per date with customer info
    product_by_date = {}  # {date: {product: {sales, purchase, wastage, qty, customers: []}}}
    # NEW: Detailed line items per date for Customer->Product breakdown
    line_items_by_date = {}  # {date: [line_item, ...]}
    total_sales = 0
    total_sales_qty = 0
    
    # ========== QC SALES (from GRN - actual received values) ==========
    qc_grns = await db.qc_grns.find({
        "grn_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    for grn in qc_grns:
        customer = grn.get("customer_name", "Unknown")
        grn_date = grn.get("grn_date", "")[:10]
        
        if customer not in sales_by_customer:
            sales_by_customer[customer] = {"amount": 0, "qty": 0, "invoices": 0, "type": "QC"}
        if grn_date not in sales_by_date:
            sales_by_date[grn_date] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "variable_exp": 0, "fixed_exp": 0, "qc_sales": 0, "retail_sales": 0}
        if grn_date not in product_by_date:
            product_by_date[grn_date] = {}
        if grn_date not in line_items_by_date:
            line_items_by_date[grn_date] = []
        
        for item in grn.get("items", []):
            # Use GRN amount (actual received value)
            amount = item.get("grn_amount", 0) or item.get("amount", 0) or 0
            qty = item.get("grn_qty", 0) or item.get("supplied_qty", 0) or 0
            supplied_qty_units = item.get("supplied_qty", 0) or qty
            product = item.get("product_name", "Unknown")
            unit = item.get("packaging_name", "") or item.get("product_unit", "Kg")
            packaging_weight_gm = item.get("packaging_weight_gm", 0) or 0
            rate_per_kg = item.get("rate_per_kg", 0) or 0
            rate_per_unit = item.get("rate_per_unit", 0) or 0
            
            # Calculate kg from units if packaging weight available
            supplied_kg = qty
            if packaging_weight_gm > 0:
                supplied_kg = (qty * packaging_weight_gm) / 1000
            
            total_sales += amount
            total_sales_qty += qty
            sales_by_customer[customer]["amount"] += amount
            sales_by_customer[customer]["qty"] += qty
            sales_by_date[grn_date]["sales"] += amount
            sales_by_date[grn_date]["sales_qty"] += qty
            sales_by_date[grn_date]["qc_sales"] = sales_by_date[grn_date].get("qc_sales", 0) + amount
            
            if product not in sales_by_product:
                sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
            sales_by_product[product]["sales_amount"] += amount
            sales_by_product[product]["sales_qty"] += qty
            
            # Product breakdown per date with customer tracking
            if product not in product_by_date[grn_date]:
                product_by_date[grn_date][product] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
            product_by_date[grn_date][product]["sales"] += amount
            product_by_date[grn_date][product]["sales_qty"] += qty
            # Track sales by customer for this product on this date
            if customer not in product_by_date[grn_date][product]["customers"]:
                product_by_date[grn_date][product]["customers"][customer] = {"sales": 0, "qty": 0}
            product_by_date[grn_date][product]["customers"][customer]["sales"] += amount
            product_by_date[grn_date][product]["customers"][customer]["qty"] += qty
            
            # Add detailed line item for this customer-product combination
            line_items_by_date[grn_date].append({
                "customer": customer,
                "customer_type": "QC",
                "product": product,
                "unit": unit,
                "supplied_qty": round(supplied_qty_units, 2),
                "supplied_kg": round(supplied_kg, 3),
                "revenue": round(amount, 2),
                "rate_per_kg": round(rate_per_kg, 2),
                "rate_per_unit": round(rate_per_unit, 2),
                # COGS and wastage will be calculated after we aggregate procurements
                "cogs": 0,
                "wastage_kg": 0,
                "wastage_value": 0
            })
        
        sales_by_customer[customer]["invoices"] += 1
    
    # ========== RETAILER SALES (from Retailer Dispatches - net_payable) ==========
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    # Fetch all retailers to get company names
    all_retailers = await db.users.find({"role": "retailer"}, {"_id": 0}).to_list(500)
    retailer_company_map = {r.get("id"): r.get("company_name", r.get("name", "Unknown")) for r in all_retailers}
    
    # Track QC vs Retail sales for bifurcation
    qc_sales_total = total_sales  # QC sales already calculated above
    qc_sales_qty = total_sales_qty
    retail_sales_total = 0
    retail_sales_qty = 0
    
    for dispatch in retailer_dispatches:
        # Use company_name instead of retailer_name (owner's name)
        retailer_id = dispatch.get("retailer_id", "")
        company_name = retailer_company_map.get(retailer_id, dispatch.get("retailer_name", "Unknown"))
        customer = company_name + " (Retail)"
        dispatch_date = dispatch.get("dispatch_date", "")[:10]
        # Use net_payable (after commission deduction) as the actual sales value
        net_payable = dispatch.get("net_payable", 0) or 0
        commission_pct = dispatch.get("commission_percentage", 0) or 0
        
        if customer not in sales_by_customer:
            sales_by_customer[customer] = {"amount": 0, "qty": 0, "invoices": 0, "type": "Retail"}
        if dispatch_date not in sales_by_date:
            sales_by_date[dispatch_date] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "variable_exp": 0, "fixed_exp": 0, "qc_sales": 0, "retail_sales": 0}
        if dispatch_date not in product_by_date:
            product_by_date[dispatch_date] = {}
        if dispatch_date not in line_items_by_date:
            line_items_by_date[dispatch_date] = []
        
        dispatch_qty = 0
        for item in dispatch.get("items", []):
            qty = item.get("supplied_qty", 0) or 0
            product = item.get("product_name", "Unknown")
            unit = item.get("variant_name", "") or "Kg"
            item_value = item.get("total_value", 0) or 0
            mrp = item.get("mrp", 0) or 0
            # Calculate proportional net value after commission
            item_net_value = item_value * (1 - commission_pct / 100)
            
            dispatch_qty += qty
            
            if product not in sales_by_product:
                sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
            sales_by_product[product]["sales_amount"] += item_net_value
            sales_by_product[product]["sales_qty"] += qty
            
            # Product breakdown per date with customer tracking
            if product not in product_by_date[dispatch_date]:
                product_by_date[dispatch_date][product] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
            product_by_date[dispatch_date][product]["sales"] += item_net_value
            product_by_date[dispatch_date][product]["sales_qty"] += qty
            if customer not in product_by_date[dispatch_date][product]["customers"]:
                product_by_date[dispatch_date][product]["customers"][customer] = {"sales": 0, "qty": 0}
            product_by_date[dispatch_date][product]["customers"][customer]["sales"] += item_net_value
            product_by_date[dispatch_date][product]["customers"][customer]["qty"] += qty
            
            # Add detailed line item for retailer
            line_items_by_date[dispatch_date].append({
                "customer": customer,
                "customer_type": "Retail",
                "product": product,
                "unit": unit,
                "supplied_qty": round(qty, 2),
                "supplied_kg": round(qty, 3),  # Retailers typically use Kg directly
                "revenue": round(item_net_value, 2),
                "rate_per_kg": round(mrp, 2),  # MRP as rate
                "rate_per_unit": round(mrp, 2),
                "cogs": 0,
                "wastage_kg": 0,
                "wastage_value": 0
            })
        
        total_sales += net_payable
        total_sales_qty += dispatch_qty
        retail_sales_total += net_payable
        retail_sales_qty += dispatch_qty
        sales_by_customer[customer]["amount"] += net_payable
        sales_by_customer[customer]["qty"] += dispatch_qty
        sales_by_date[dispatch_date]["sales"] += net_payable
        sales_by_date[dispatch_date]["sales_qty"] += dispatch_qty
        sales_by_date[dispatch_date]["retail_sales"] = sales_by_date[dispatch_date].get("retail_sales", 0) + net_payable
        sales_by_customer[customer]["invoices"] += 1
    
    # ========== PURCHASES (from Procurements) ==========
    procurements = await db.procurements.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    purchase_by_farmer = {}
    total_purchase = 0
    total_purchase_qty = 0
    
    for proc in procurements:
        farmer = proc.get("farmer_name", "Unknown")
        proc_date = proc.get("date", "")[:10]
        
        if farmer not in purchase_by_farmer:
            purchase_by_farmer[farmer] = {"amount": 0, "qty": 0}
        if proc_date not in sales_by_date:
            sales_by_date[proc_date] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "variable_exp": 0, "fixed_exp": 0}
        if proc_date not in product_by_date:
            product_by_date[proc_date] = {}
        
        for item in proc.get("products", []):
            qty = item.get("quantity", 0) or 0
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")
            total_item = item.get("total", 0) or 0
            product = item.get("product_name", "Unknown")
            
            # Convert to Kg if unit is Bunch/Piece with unit_size
            if unit.lower() in ["bunch", "piece", "pack"] and unit_size:
                try:
                    weight_per_unit_gm = float(unit_size)
                    qty_kg = (qty * weight_per_unit_gm) / 1000
                except (ValueError, TypeError):
                    qty_kg = qty
            else:
                qty_kg = qty
            
            total_purchase += total_item
            total_purchase_qty += qty_kg
            purchase_by_farmer[farmer]["amount"] += total_item
            purchase_by_farmer[farmer]["qty"] += qty_kg
            sales_by_date[proc_date]["purchase"] += total_item
            sales_by_date[proc_date]["purchase_qty"] += qty_kg
            
            if product not in sales_by_product:
                sales_by_product[product] = {"sales_amount": 0, "sales_qty": 0, "purchase_amount": 0, "purchase_qty": 0, "wastage_amount": 0}
            sales_by_product[product]["purchase_amount"] += total_item
            sales_by_product[product]["purchase_qty"] += qty_kg
            
            # Product breakdown per date
            if product not in product_by_date[proc_date]:
                product_by_date[proc_date][product] = {"sales": 0, "sales_qty": 0, "purchase": 0, "purchase_qty": 0, "wastage": 0, "customers": {}}
            product_by_date[proc_date][product]["purchase"] += total_item
            product_by_date[proc_date][product]["purchase_qty"] += qty_kg
    
    # ========== WASTAGE (from Daily Stock Status) ==========
    stock_status = await db.daily_stock_status.find({
        "date": {"$gte": from_date, "$lte": to_date},
        "status": "closed"
    }, {"_id": 0}).to_list(1000)
    
    total_wastage_qty = 0
    total_wastage_value = 0
    
    for status in stock_status:
        wastage_qty = status.get("wastage_qty", 0) or 0
        wastage_value = status.get("wastage_value", 0) or 0
        status_date = status.get("date", "")[:10]
        product = status.get("product_name", "Unknown")
        
        total_wastage_qty += wastage_qty
        total_wastage_value += wastage_value
        
        if status_date in sales_by_date:
            sales_by_date[status_date]["wastage"] += wastage_value
        
        if product in sales_by_product:
            sales_by_product[product]["wastage_amount"] += wastage_value
        
        # Product breakdown per date
        if status_date in product_by_date and product in product_by_date[status_date]:
            product_by_date[status_date][product]["wastage"] += wastage_value
    
    # ========== VARIABLE EXPENSES ==========
    variable_expenses = await db.variable_expenses.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    variable_by_category = {}
    total_variable = 0
    
    for exp in variable_expenses:
        category = exp.get("category", "Other")
        amount = exp.get("amount", 0) or 0
        exp_date = exp.get("date", "")[:10]
        
        total_variable += amount
        if category not in variable_by_category:
            variable_by_category[category] = 0
        variable_by_category[category] += amount
        
        if exp_date in sales_by_date:
            sales_by_date[exp_date]["variable_exp"] += amount
    
    # ========== FIXED EXPENSES ==========
    # Get current month's fixed expenses
    current_month = datetime.now(timezone.utc).month - 1  # 0-indexed
    current_year = datetime.now(timezone.utc).year
    
    fixed_expenses = await db.fixed_expenses.find({
        "month": current_month,
        "year": current_year
    }, {"_id": 0}).to_list(100)
    
    fixed_by_category = {}
    total_fixed = 0
    
    for exp in fixed_expenses:
        category = exp.get("category", "Other")
        amount = exp.get("amount", 0) or 0
        
        total_fixed += amount
        if category not in fixed_by_category:
            fixed_by_category[category] = 0
        fixed_by_category[category] += amount
    
    # Distribute fixed expenses across days in period
    days_in_period = max(1, len(sales_by_date))
    daily_fixed = total_fixed / days_in_period
    for date_key in sales_by_date:
        sales_by_date[date_key]["fixed_exp"] = round(daily_fixed, 2)
    
    # ========== CALCULATE P&L ==========
    gross_profit = total_sales - total_purchase - total_wastage_value
    gross_margin = (gross_profit / total_sales * 100) if total_sales > 0 else 0
    
    net_profit = gross_profit - total_variable - total_fixed
    net_margin = (net_profit / total_sales * 100) if total_sales > 0 else 0
    
    # Daily P&L breakdown with product details
    daily_pnl = []
    for date_key in sorted(sales_by_date.keys()):
        day_data = sales_by_date[date_key]
        day_gross = day_data["sales"] - day_data["purchase"] - day_data["wastage"]
        day_net = day_gross - day_data["variable_exp"] - day_data["fixed_exp"]
        day_sales_qty = day_data.get("sales_qty", 0)
        day_gross_margin = (day_gross / day_data["sales"] * 100) if day_data["sales"] > 0 else 0
        day_profit_per_unit = (day_gross / day_sales_qty) if day_sales_qty > 0 else 0
        
        # Product breakdown for this date (legacy - kept for backward compatibility)
        products_detail = []
        if date_key in product_by_date:
            for prod_name, prod_data in sorted(product_by_date[date_key].items(), key=lambda x: x[1]["sales"], reverse=True):
                prod_gross = prod_data["sales"] - prod_data["purchase"] - prod_data["wastage"]
                prod_margin = (prod_gross / prod_data["sales"] * 100) if prod_data["sales"] > 0 else 0
                prod_profit_per_unit = (prod_gross / prod_data["sales_qty"]) if prod_data["sales_qty"] > 0 else 0
                # Get customer names for this product
                customers_list = list(prod_data.get("customers", {}).keys())
                customers_str = ", ".join(customers_list) if customers_list else "-"
                products_detail.append({
                    "product": prod_name,
                    "customers": customers_str,
                    "sales": round(prod_data["sales"], 2),
                    "sales_qty": round(prod_data["sales_qty"], 2),
                    "purchase": round(prod_data["purchase"], 2),
                    "purchase_qty": round(prod_data["purchase_qty"], 2),
                    "wastage": round(prod_data["wastage"], 2),
                    "gross_profit": round(prod_gross, 2),
                    "gross_margin": round(prod_margin, 1),
                    "profit_per_unit": round(prod_profit_per_unit, 2)
                })
        
        # NEW: Generate detailed line items (Customer → Product) with calculated metrics
        detailed_line_items = []
        if date_key in line_items_by_date:
            # Group by customer first, then by product
            customer_product_map = {}
            for line in line_items_by_date[date_key]:
                key = (line["customer"], line["product"], line["unit"])
                if key not in customer_product_map:
                    customer_product_map[key] = {
                        "customer": line["customer"],
                        "customer_type": line["customer_type"],
                        "product": line["product"],
                        "unit": line["unit"],
                        "supplied_qty": 0,
                        "supplied_kg": 0,
                        "revenue": 0,
                        "rate_per_kg": line["rate_per_kg"],
                        "rate_per_unit": line["rate_per_unit"]
                    }
                customer_product_map[key]["supplied_qty"] += line["supplied_qty"]
                customer_product_map[key]["supplied_kg"] += line["supplied_kg"]
                customer_product_map[key]["revenue"] += line["revenue"]
            
            # Now calculate COGS and wastage allocation per line item
            # Get product-level COGS rate (purchase_amount / purchase_qty)
            product_cogs_rate = {}
            if date_key in product_by_date:
                for prod_name, prod_data in product_by_date[date_key].items():
                    purch_qty = prod_data.get("purchase_qty", 0)
                    purch_amt = prod_data.get("purchase", 0)
                    if purch_qty > 0:
                        product_cogs_rate[prod_name] = purch_amt / purch_qty
                    else:
                        product_cogs_rate[prod_name] = 0
            
            # Calculate total supplied kg per product for proportional wastage allocation
            product_total_supplied_kg = {}
            for key, item in customer_product_map.items():
                product = item["product"]
                if product not in product_total_supplied_kg:
                    product_total_supplied_kg[product] = 0
                product_total_supplied_kg[product] += item["supplied_kg"]
            
            # Get product-level total wastage (value) for this date
            product_total_wastage = {}
            if date_key in product_by_date:
                for prod_name, prod_data in product_by_date[date_key].items():
                    product_total_wastage[prod_name] = prod_data.get("wastage", 0)
            
            # Build detailed line items sorted by customer then by product
            for key in sorted(customer_product_map.keys(), key=lambda x: (x[0], x[1])):
                item = customer_product_map[key]
                product = item["product"]
                
                # Calculate COGS for this line item
                cogs_rate = product_cogs_rate.get(product, 0)
                cogs = item["supplied_kg"] * cogs_rate
                
                # Calculate wastage proportionally based on kg supplied ratio
                # If there are 3 supplies in the ratio of 50:30:20 kg, wastage is divided in same ratio
                total_kg_for_product = product_total_supplied_kg.get(product, 0)
                total_wastage_for_product = product_total_wastage.get(product, 0)
                
                if total_kg_for_product > 0:
                    # Proportional wastage = (this_line_kg / total_product_kg) * total_wastage
                    kg_ratio = item["supplied_kg"] / total_kg_for_product
                    wastage_value = kg_ratio * total_wastage_for_product
                    wastage_kg = (wastage_value / cogs_rate) if cogs_rate > 0 else 0
                else:
                    wastage_value = 0
                    wastage_kg = 0
                
                # Calculate gross profit and margins for this line item
                line_gross_profit = item["revenue"] - cogs - wastage_value
                line_gross_margin = (line_gross_profit / item["revenue"] * 100) if item["revenue"] > 0 else 0
                
                # Calculate price/kg metrics
                selling_price_per_kg = (item["revenue"] / item["supplied_kg"]) if item["supplied_kg"] > 0 else 0
                purchase_price_per_kg = cogs_rate
                profit_per_qty = (line_gross_profit / item["supplied_qty"]) if item["supplied_qty"] > 0 else 0
                
                detailed_line_items.append({
                    "customer": item["customer"],
                    "customer_type": item["customer_type"],
                    "product": product,
                    "unit": item["unit"],
                    "supplied_qty": round(item["supplied_qty"], 2),
                    "supplied_kg": round(item["supplied_kg"], 3),
                    "revenue": round(item["revenue"], 2),
                    "cogs": round(cogs, 2),
                    "wastage_kg": round(wastage_kg, 3),
                    "wastage_value": round(wastage_value, 2),
                    "gross_profit": round(line_gross_profit, 2),
                    "gross_margin": round(line_gross_margin, 1),
                    "selling_price_per_kg": round(selling_price_per_kg, 2),
                    "purchase_price_per_kg": round(purchase_price_per_kg, 2),
                    "profit_per_qty": round(profit_per_qty, 2)
                })
        
        daily_pnl.append({
            "date": date_key,
            "sales": round(day_data["sales"], 2),
            "sales_qty": round(day_sales_qty, 2),
            "qc_sales": round(day_data.get("qc_sales", 0), 2),
            "retail_sales": round(day_data.get("retail_sales", 0), 2),
            "purchase": round(day_data["purchase"], 2),
            "wastage": round(day_data["wastage"], 2),
            "gross_profit": round(day_gross, 2),
            "gross_margin": round(day_gross_margin, 1),
            "profit_per_unit": round(day_profit_per_unit, 2),
            "variable_exp": round(day_data["variable_exp"], 2),
            "fixed_exp": round(day_data["fixed_exp"], 2),
            "net_profit": round(day_net, 2),
            "products": products_detail,
            "line_items": detailed_line_items  # NEW: Customer→Product breakdown
        })
    
    # Customer P&L
    customer_pnl = []
    for customer, data in sorted(sales_by_customer.items(), key=lambda x: x[1]["amount"], reverse=True):
        customer_pnl.append({
            "customer": customer,
            "sales_amount": round(data["amount"], 2),
            "sales_qty": round(data["qty"], 2),
            "invoices": data["invoices"]
        })
    
    # Product P&L with additional metrics
    product_pnl = []
    for product, data in sorted(sales_by_product.items(), key=lambda x: x[1]["sales_amount"], reverse=True):
        profit = data["sales_amount"] - data["purchase_amount"] - data["wastage_amount"]
        margin = (profit / data["sales_amount"] * 100) if data["sales_amount"] > 0 else 0
        profit_per_unit = (profit / data["sales_qty"]) if data["sales_qty"] > 0 else 0
        product_pnl.append({
            "product": product,
            "sales_amount": round(data["sales_amount"], 2),
            "sales_qty": round(data["sales_qty"], 2),
            "purchase_amount": round(data["purchase_amount"], 2),
            "purchase_qty": round(data["purchase_qty"], 2),
            "wastage_amount": round(data["wastage_amount"], 2),
            "profit": round(profit, 2),
            "margin": round(margin, 1),
            "profit_per_unit": round(profit_per_unit, 2)
        })
    
    # Calculate QC vs Retail bifurcation totals
    total_qc_sales = sum(day.get("qc_sales", 0) for day in daily_pnl)
    total_retail_sales = sum(day.get("retail_sales", 0) for day in daily_pnl)
    
    return {
        "period": {"from": from_date, "to": to_date},
        "summary": {
            "total_sales": round(total_sales, 2),
            "total_sales_qty": round(total_sales_qty, 2),
            "total_purchase": round(total_purchase, 2),
            "total_purchase_qty": round(total_purchase_qty, 2),
            "total_wastage_qty": round(total_wastage_qty, 2),
            "total_wastage_value": round(total_wastage_value, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_margin": round(gross_margin, 1),
            "total_variable_expenses": round(total_variable, 2),
            "total_fixed_expenses": round(total_fixed, 2),
            "net_profit": round(net_profit, 2),
            "net_margin": round(net_margin, 1)
        },
        "vertical_bifurcation": {
            "qc": {
                "sales": round(total_qc_sales, 2),
                "percentage": round((total_qc_sales / total_sales * 100) if total_sales > 0 else 0, 1)
            },
            "retail": {
                "sales": round(total_retail_sales, 2),
                "percentage": round((total_retail_sales / total_sales * 100) if total_sales > 0 else 0, 1)
            }
        },
        "daily_pnl": daily_pnl,
        "customer_pnl": customer_pnl,
        "product_pnl": product_pnl,
        "expenses": {
            "variable_by_category": variable_by_category,
            "fixed_by_category": fixed_by_category
        },
        "purchase_by_farmer": [
            {"farmer": f, "amount": round(d["amount"], 2), "qty": round(d["qty"], 2)} 
            for f, d in sorted(purchase_by_farmer.items(), key=lambda x: x[1]["amount"], reverse=True)
        ]
    }

# ============================================================================
# SECTION: STOCK STATUS ROUTES (Lines ~2486-3100)
# ============================================================================

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
    # Use regex to match today's date (handles different timezone formats)
    procurements = await db.procurements.find({
        "date": {"$regex": f"^{today}"}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate purchases by product
    purchases_by_product = {}
    for proc in procurements:
        # Note: Procurement uses 'products' field, not 'items'
        for item in proc.get("products", []):
            product_id = item.get("product_id")
            qty = item.get("quantity", 0)
            unit = item.get("unit", "Kg")
            unit_size = item.get("unit_size", "")  # e.g., "350" for 350gm per bunch
            rate = item.get("rate", 0)  # rate per unit (per Kg or per Bunch)
            total_value = item.get("total", qty * rate)
            
            # Convert to Kg if unit is Bunch/Piece with a unit_size (weight in grams)
            if unit.lower() in ["bunch", "piece", "pack"] and unit_size:
                try:
                    weight_per_unit_gm = float(unit_size)  # grams per bunch/piece
                    qty_kg = (qty * weight_per_unit_gm) / 1000  # convert to Kg
                except (ValueError, TypeError):
                    qty_kg = qty  # fallback if unit_size is not a number
            else:
                qty_kg = qty  # already in Kg
            
            if product_id not in purchases_by_product:
                purchases_by_product[product_id] = {"qty": 0, "value": 0}
            purchases_by_product[product_id]["qty"] += qty_kg
            purchases_by_product[product_id]["value"] += total_value
    
    # Get today's QC dispatches - handle both string dates and datetime objects
    # First, get all dispatches and filter by date in Python for reliability
    all_qc_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(1000)
    qc_dispatches = []
    for d in all_qc_dispatches:
        dispatch_date = d.get("dispatch_date", "")
        if isinstance(dispatch_date, datetime):
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        else:
            dispatch_date_str = str(dispatch_date)[:10]  # Get YYYY-MM-DD part
        if dispatch_date_str == today:
            qc_dispatches.append(d)
    
    # Get today's retailer dispatches (if exists)
    all_retailer_dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(1000)
    retailer_dispatches = []
    for d in all_retailer_dispatches:
        dispatch_date = d.get("dispatch_date", "")
        if isinstance(dispatch_date, datetime):
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        else:
            dispatch_date_str = str(dispatch_date)[:10]
        if dispatch_date_str == today:
            retailer_dispatches.append(d)
    
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
            
            # Handle None rate
            rate = item.get("rate") or 0
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
        
        # Always get fresh purchase and dispatch data
        purchase_data = purchases_by_product.get(product_id, {"qty": 0, "value": 0})
        dispatch_data = dispatches_by_product.get(product_id, {"qty": 0, "value": 0})
        
        # Get or create today's status
        if product_id in today_map:
            status = today_map[product_id]
            
            # For open entries, always update purchase and dispatch values (real-time sync)
            if status.get("status") == "open":
                opening_qty = status.get("opening_qty", 0)
                opening_price = status.get("opening_price", 0)
                
                # Calculate weighted average price
                total_qty = opening_qty + purchase_data["qty"]
                if total_qty > 0:
                    opening_value = opening_qty * opening_price
                    avg_price = (opening_value + purchase_data["value"]) / total_qty
                else:
                    avg_price = opening_price or (purchase_data["value"] / purchase_data["qty"] if purchase_data["qty"] > 0 else 0)
                
                # Update the status with fresh data
                update_data = {
                    "purchase_qty": round(purchase_data["qty"], 2),
                    "purchase_value": round(purchase_data["value"], 2),
                    "dispatch_qty": round(dispatch_data["qty"], 2),
                    "dispatch_value": round(dispatch_data["value"], 2),
                    "avg_price": round(avg_price, 2)
                }
                
                # Update in database
                await db.daily_stock_status.update_one(
                    {"id": status["id"]},
                    {"$set": update_data}
                )
                
                # Update local status for response
                status.update(update_data)
        else:
            # Calculate opening from yesterday's closing or start with 0
            if product_id in yesterday_map:
                opening_qty = yesterday_map[product_id].get("closing_qty", 0) or 0
                opening_price = yesterday_map[product_id].get("avg_price", 0) or 0
            else:
                opening_qty = 0
                opening_price = product.get("price_per_kg", 0) or 0
            
            # Calculate weighted average price
            total_qty = opening_qty + purchase_data["qty"]
            if total_qty > 0:
                opening_value = opening_qty * opening_price
                avg_price = (opening_value + purchase_data["value"]) / total_qty
            else:
                avg_price = opening_price or (purchase_data["value"] / purchase_data["qty"] if purchase_data["qty"] > 0 else 0)
            
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
async def close_stock_status(entries: StockClosingBulkEntry, date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Staff enters closing quantities for products. Accepts optional date parameter for historical closes."""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_date = date if date else datetime.now(timezone.utc).strftime('%Y-%m-%d')
    updated = []
    
    for entry in entries.entries:
        # Get status for this product on the target date
        status = await db.daily_stock_status.find_one(
            {"date": target_date, "product_id": entry.product_id},
            {"_id": 0}
        )
        
        if not status:
            # Create a new record if it doesn't exist
            product = await db.products.find_one({"id": entry.product_id}, {"_id": 0})
            if not product:
                continue
            status = {
                "product_id": entry.product_id,
                "product_name": product.get("name", "Unknown"),
                "date": target_date,
                "opening_qty": 0,
                "purchase_qty": 0,
                "dispatch_qty": 0,
                "avg_price": 0,
                "status": "open"
            }
        
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
            {"date": target_date, "product_id": entry.product_id},
            {"$set": {**status, **update_data}},
            upsert=True
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


@api_router.get("/stock-status/closable-products")
async def get_closable_products_for_date(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get products that need closing for a specific date - products with activity (opening > 0, purchased, or dispatched)"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    target_date = date
    yesterday = (datetime.strptime(target_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all products
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    
    # Get yesterday's closing stock (for opening)
    yesterday_status = await db.daily_stock_status.find(
        {"date": yesterday, "status": "closed"},
        {"_id": 0}
    ).to_list(1000)
    yesterday_map = {s["product_id"]: s for s in yesterday_status}
    
    # Get existing status for target date (from daily_stock_status table)
    existing_status = await db.daily_stock_status.find(
        {"date": target_date},
        {"_id": 0}
    ).to_list(1000)
    existing_map = {s["product_id"]: s for s in existing_status}
    
    # Get procurements for target date (check multiple date formats)
    procurements = await db.procurements.find({}, {"_id": 0}).to_list(1000)
    purchases_by_product = {}
    for proc in procurements:
        proc_date = proc.get("date", "")
        if isinstance(proc_date, datetime):
            proc_date_str = proc_date.strftime('%Y-%m-%d')
        else:
            proc_date_str = str(proc_date)[:10]
        
        if proc_date_str == target_date:
            for item in proc.get("products", []):
                product_id = item.get("product_id")
                qty = item.get("quantity", 0)
                unit = item.get("unit", "Kg")
                unit_size = item.get("unit_size", "")
                
                # Convert to Kg
                if unit.lower() in ["bunch", "piece", "pack"] and unit_size:
                    try:
                        weight_per_unit_gm = float(unit_size)
                        qty_kg = (qty * weight_per_unit_gm) / 1000
                    except (ValueError, TypeError):
                        qty_kg = qty
                else:
                    qty_kg = qty
                
                purchases_by_product[product_id] = purchases_by_product.get(product_id, 0) + qty_kg
    
    # Get dispatches for target date
    all_qc_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(1000)
    all_retailer_dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(1000)
    
    # Get packaging weights
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    packaging_map = {p['name'].lower(): p.get('weight_gm', 100) for p in packaging_variants}
    
    dispatches_by_product = {}
    for d in all_qc_dispatches + all_retailer_dispatches:
        dispatch_date = d.get("dispatch_date", "")
        if isinstance(dispatch_date, datetime):
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        else:
            dispatch_date_str = str(dispatch_date)[:10]
        
        if dispatch_date_str == target_date:
            for item in d.get("items", []):
                product_id = item.get("product_id")
                supplied_qty = item.get("supplied_qty", 0)
                packaging_name = item.get("packaging_name", "").lower()
                weight_gm = packaging_map.get(packaging_name, 100)
                qty_kg = (supplied_qty * weight_gm) / 1000
                dispatches_by_product[product_id] = dispatches_by_product.get(product_id, 0) + qty_kg
    
    # Build closable products list
    closable_products = []
    
    # First, include all products that have existing status records for this date
    for product_id, existing in existing_map.items():
        product = next((p for p in products if p["id"] == product_id), None)
        if not product:
            continue
            
        product_name = product["name"]
        opening_qty = existing.get("opening_qty", 0)
        purchase_qty = existing.get("purchase_qty", 0)
        dispatch_qty = existing.get("dispatch_qty", 0)
        status = existing.get("status", "open")
        closing_qty = existing.get("closing_qty", None)
        
        closable_products.append({
            "product_id": product_id,
            "product_name": product_name,
            "opening_qty": round(opening_qty, 2),
            "purchase_qty": round(purchase_qty, 2),
            "dispatch_qty": round(dispatch_qty, 2),
            "closing_qty": closing_qty,
            "status": status
        })
    
    # Then, add any products with activity that don't have existing status records
    for product in products:
        product_id = product["id"]
        if product_id in existing_map:
            continue  # Already added above
            
        product_name = product["name"]
        
        # Opening = yesterday's closing
        opening_qty = yesterday_map.get(product_id, {}).get("closing_qty", 0)
        
        # Purchase and dispatch quantities from today's transactions
        purchase_qty = round(purchases_by_product.get(product_id, 0), 2)
        dispatch_qty = round(dispatches_by_product.get(product_id, 0), 2)
        
        # Only include if there's activity (opening > 0, purchased, or dispatched)
        if opening_qty > 0 or purchase_qty > 0 or dispatch_qty > 0:
            closable_products.append({
                "product_id": product_id,
                "product_name": product_name,
                "opening_qty": round(opening_qty, 2),
                "purchase_qty": purchase_qty,
                "dispatch_qty": dispatch_qty,
                "closing_qty": None,
                "status": "open"
            })
    
    return closable_products


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

@api_router.get("/stock-status/yesterday-wastage")
async def get_yesterday_wastage(current_user: dict = Depends(get_current_user)):
    """Get product-wise wastage for previous day"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Get all closed stock status for yesterday
    yesterday_records = await db.daily_stock_status.find(
        {"date": yesterday, "status": "closed"},
        {"_id": 0}
    ).to_list(500)
    
    # Filter products with wastage > 0
    wastage_products = []
    total_wastage_kg = 0
    total_wastage_value = 0
    
    for record in yesterday_records:
        wastage_qty = record.get("wastage_qty", 0) or 0
        wastage_value = record.get("wastage_value", 0) or 0
        
        if wastage_qty > 0:
            wastage_products.append({
                "product_name": record.get("product_name"),
                "opening_qty": record.get("opening_qty", 0),
                "purchase_qty": record.get("purchase_qty", 0),
                "dispatch_qty": record.get("dispatch_qty", 0),
                "closing_qty": record.get("closing_qty", 0),
                "wastage_qty": wastage_qty,
                "wastage_value": wastage_value,
                "wastage_percent": record.get("wastage_percent", 0),
                "avg_price": record.get("avg_price", 0)
            })
            total_wastage_kg += wastage_qty
            total_wastage_value += wastage_value
    
    # Sort by wastage quantity descending
    wastage_products.sort(key=lambda x: x["wastage_qty"], reverse=True)
    
    return {
        "date": yesterday,
        "total_wastage_kg": round(total_wastage_kg, 2),
        "total_wastage_value": round(total_wastage_value, 2),
        "products": wastage_products
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

# ============================================================================
# SECTION: VARIABLE EXPENSES ROUTES (Lines ~3104-3210)
# ============================================================================

@api_router.get("/expenses/variable")
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

@api_router.post("/expenses/variable")
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

@api_router.put("/expenses/variable/{expense_id}")
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

@api_router.delete("/expenses/variable/{expense_id}")
async def delete_variable_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a variable expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.variable_expenses.delete_one({"id": expense_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted"}

@api_router.post("/expenses/variable/bulk-settle")
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
# SECTION: FIXED EXPENSES ROUTES (Lines ~3208-3370)
# ============================================================================

@api_router.get("/expenses/fixed")
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

@api_router.post("/expenses/fixed")
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

@api_router.put("/expenses/fixed/{expense_id}")
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

@api_router.delete("/expenses/fixed/{expense_id}")
async def delete_fixed_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a fixed expense"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.fixed_expenses.delete_one({"id": expense_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted"}

@api_router.post("/expenses/fixed/generate-recurring")
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

@api_router.post("/expenses/fixed/bulk-settle")
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

# ==================== RETAILER PORTAL APIs ====================

# ============================================================================
# SECTION: RETAILER PORTAL ROUTES (Lines ~3368-4100)
# Includes: Retailers, Indents, Dispatches, GRN, Rejections, Payments, Invoices
# ============================================================================

# Get all retailers (for dropdowns)
@api_router.get("/retailers")
async def get_retailers(current_user: dict = Depends(get_current_user)):
    retailers = await db.users.find({"role": "retailer"}, {"_id": 0, "password": 0}).to_list(500)
    return retailers

# ------------ RETAILER INDENTS ------------
@api_router.get("/retailer-indents")
async def get_retailer_indents(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    # If retailer, only show their own indents
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    indents = await db.retailer_indents.find(query, {"_id": 0}).sort("indent_date", -1).to_list(1000)
    return indents

@api_router.post("/retailer-indents")
async def create_retailer_indent(input: RetailerIndentCreate, current_user: dict = Depends(get_current_user)):
    # Get retailer info
    if current_user["role"] == "retailer":
        retailer_id = current_user["user_id"]
    else:
        retailer_id = input.retailer_id
    
    retailer = await db.users.find_one({"id": retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    indent = RetailerIndent(
        retailer_id=retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        indent_date=input.indent_date,
        items=input.items,
        remarks=input.remarks,
        created_by=current_user["user_id"],
        created_by_role=current_user["role"]
    )
    
    doc = indent.model_dump()
    doc["indent_date"] = doc["indent_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_indents.insert_one(doc)
    return {"id": indent.id, "message": "Indent created successfully"}

@api_router.put("/retailer-indents/{indent_id}")
async def update_retailer_indent(indent_id: str, input: RetailerIndentCreate, current_user: dict = Depends(get_current_user)):
    existing = await db.retailer_indents.find_one({"id": indent_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Retailers can only update their own pending indents
    if current_user["role"] == "retailer":
        if existing["retailer_id"] != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Not authorized")
        if existing["status"] != "pending":
            raise HTTPException(status_code=400, detail="Cannot edit non-pending indent")
    
    update_data = {
        "indent_date": input.indent_date.isoformat(),
        "items": [item.model_dump() for item in input.items],
        "remarks": input.remarks
    }
    
    await db.retailer_indents.update_one({"id": indent_id}, {"$set": update_data})
    return {"id": indent_id, "message": "Indent updated successfully"}

@api_router.delete("/retailer-indents/{indent_id}")
async def delete_retailer_indent(indent_id: str, current_user: dict = Depends(get_current_user)):
    existing = await db.retailer_indents.find_one({"id": indent_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Retailers can only delete their own indents
    if current_user["role"] == "retailer" and existing["retailer_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if there are any dispatches for this indent
    dispatches = await db.retailer_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
    if len(dispatches) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete indent with existing dispatches. Delete dispatches first.")
    
    await db.retailer_indents.delete_one({"id": indent_id})
    return {"message": "Indent deleted successfully"}

# ------------ RETAILER DISPATCHES ------------
@api_router.get("/retailer-dispatches")
async def get_retailer_dispatches(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    dispatches = await db.retailer_dispatches.find(query, {"_id": 0}).sort("dispatch_date", -1).to_list(1000)
    return dispatches

@api_router.post("/retailer-dispatches")
async def create_retailer_dispatch(input: RetailerDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can create dispatches")
    
    # Get indent
    indent = await db.retailer_indents.find_one({"id": input.indent_id})
    if not indent:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    # Get retailer info for commission
    retailer = await db.users.find_one({"id": indent["retailer_id"]}, {"_id": 0})
    commission = retailer.get("commission_percentage", 0) if retailer else 0
    
    # Calculate totals
    total_mrp_value = 0
    items_with_totals = []
    for item in input.items:
        item_dict = item.model_dump()
        item_dict["total_value"] = item.supplied_qty * item.mrp
        total_mrp_value += item_dict["total_value"]
        items_with_totals.append(item_dict)
    
    net_payable = total_mrp_value * (1 - commission / 100)
    
    dispatch = RetailerDispatch(
        indent_id=input.indent_id,
        retailer_id=indent["retailer_id"],
        retailer_name=indent["retailer_name"],
        dispatch_date=input.dispatch_date,
        items=items_with_totals,
        total_mrp_value=round(total_mrp_value, 2),
        commission_percentage=commission,
        net_payable=round(net_payable, 2),
        transport_charges=input.transport_charges or 0,
        dispatched_by=current_user["user_id"],
        invoice_number=None,  # Invoice created separately
        remarks=input.remarks
    )
    
    doc = dispatch.model_dump()
    doc["dispatch_date"] = doc["dispatch_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_dispatches.insert_one(doc)
    
    # Update indent status based on dispatch completeness
    # Get all dispatches for this indent
    all_dispatches = await db.retailer_dispatches.find({"indent_id": input.indent_id}, {"_id": 0}).to_list(100)
    
    # Calculate total dispatched per product
    total_dispatched = {}
    for d in all_dispatches:
        for item in d.get('items', []):
            key = item.get('product_id', '')
            total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
    
    # Check if fully dispatched
    fully_dispatched = True
    for item in indent.get('items', []):
        dispatched = total_dispatched.get(item.get('product_id', ''), 0)
        if dispatched < item.get('quantity', 0):
            fully_dispatched = False
            break
    
    new_status = "dispatched" if fully_dispatched else "partial"
    await db.retailer_indents.update_one(
        {"id": input.indent_id},
        {"$set": {"status": new_status}}
    )
    
    return {"id": dispatch.id, "message": "Dispatch created successfully"}

# Edit Retailer Dispatch
@api_router.put("/retailer-dispatches/{dispatch_id}")
async def update_retailer_dispatch(dispatch_id: str, input: RetailerDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update dispatches")
    
    existing = await db.retailer_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Get retailer info for commission
    retailer = await db.users.find_one({"id": existing["retailer_id"]}, {"_id": 0})
    commission = retailer.get("commission_percentage", 0) if retailer else 0
    
    # Calculate totals
    total_mrp_value = 0
    items_with_totals = []
    for item in input.items:
        item_dict = item.model_dump()
        item_dict["total_value"] = item.supplied_qty * item.mrp
        total_mrp_value += item_dict["total_value"]
        items_with_totals.append(item_dict)
    
    net_payable = total_mrp_value * (1 - commission / 100)
    
    update_data = {
        "dispatch_date": input.dispatch_date.isoformat(),
        "items": items_with_totals,
        "total_mrp_value": round(total_mrp_value, 2),
        "commission_percentage": commission,
        "net_payable": round(net_payable, 2),
        "transport_charges": input.transport_charges or 0,
        "remarks": input.remarks
    }
    
    await db.retailer_dispatches.update_one({"id": dispatch_id}, {"$set": update_data})
    return {"id": dispatch_id, "message": "Dispatch updated successfully"}

# Delete Retailer Dispatch
@api_router.delete("/retailer-dispatches/{dispatch_id}")
async def delete_retailer_dispatch(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete dispatches")
    
    existing = await db.retailer_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Check if dispatch is part of an invoice
    invoice = await db.retailer_invoices.find_one({"dispatch_ids": dispatch_id})
    if invoice:
        raise HTTPException(status_code=400, detail="Cannot delete dispatch that is part of an invoice")
    
    indent_id = existing.get("indent_id")
    
    await db.retailer_dispatches.delete_one({"id": dispatch_id})
    
    # Recalculate indent status based on remaining dispatches
    if indent_id:
        remaining_dispatches = await db.retailer_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
        
        if len(remaining_dispatches) == 0:
            # No dispatches left - set back to pending
            await db.retailer_indents.update_one(
                {"id": indent_id},
                {"$set": {"status": "pending"}}
            )
        else:
            # Check if partially or fully dispatched
            indent = await db.retailer_indents.find_one({"id": indent_id}, {"_id": 0})
            if indent:
                total_dispatched = {}
                for d in remaining_dispatches:
                    for item in d.get('items', []):
                        key = item.get('product_id', '')
                        total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
                
                fully_dispatched = True
                for item in indent.get('items', []):
                    dispatched = total_dispatched.get(item.get('product_id', ''), 0)
                    if dispatched < item.get('quantity', 0):
                        fully_dispatched = False
                        break
                
                new_status = "dispatched" if fully_dispatched else "partial"
                await db.retailer_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"status": new_status}}
                )
    
    return {"message": "Dispatch deleted successfully"}

# ------------ RETAILER GRN ------------
@api_router.get("/retailer-grn")
async def get_retailer_grn(
    retailer_id: str = None,
    dispatch_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    if dispatch_id:
        query["dispatch_id"] = dispatch_id
    
    grns = await db.retailer_grn.find(query, {"_id": 0}).sort("grn_date", -1).to_list(1000)
    return grns

@api_router.post("/retailer-grn")
async def create_retailer_grn(input: RetailerGRNCreate, current_user: dict = Depends(get_current_user)):
    # Get dispatch
    dispatch = await db.retailer_dispatches.find_one({"id": input.dispatch_id})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Retailers can only create GRN for their own dispatches
    if current_user["role"] == "retailer" and dispatch["retailer_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if GRN already exists
    existing = await db.retailer_grn.find_one({"dispatch_id": input.dispatch_id})
    if existing:
        raise HTTPException(status_code=400, detail="GRN already exists for this dispatch")
    
    # Calculate differences
    items_with_diff = []
    for item in input.items:
        item_dict = item.model_dump()
        item_dict["difference"] = item.received_qty - item.supplied_qty
        items_with_diff.append(item_dict)
    
    grn = RetailerGRN(
        dispatch_id=input.dispatch_id,
        retailer_id=dispatch["retailer_id"],
        retailer_name=dispatch["retailer_name"],
        grn_date=datetime.now(timezone.utc),
        items=items_with_diff,
        confirmed_by=current_user["user_id"],
        remarks=input.remarks
    )
    
    doc = grn.model_dump()
    doc["grn_date"] = doc["grn_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_grn.insert_one(doc)
    
    # Update indent status to received
    await db.retailer_indents.update_one(
        {"id": dispatch["indent_id"]},
        {"$set": {"status": "received"}}
    )
    
    return {"id": grn.id, "message": "GRN confirmed successfully"}

# ------------ RETAILER REJECTIONS ------------
@api_router.get("/retailer-rejections")
async def get_retailer_rejections(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    rejections = await db.retailer_rejections.find(query, {"_id": 0}).sort("rejection_date", -1).to_list(1000)
    return rejections

@api_router.post("/retailer-rejections")
async def create_retailer_rejection(input: RetailerRejectionCreate, current_user: dict = Depends(get_current_user)):
    # Only admin/staff can create rejections
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can record rejections")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    rejection_value = input.quantity * input.mrp
    
    rejection = RetailerRejection(
        retailer_id=input.retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        rejection_date=input.rejection_date,
        product_id=input.product_id,
        product_name=input.product_name,
        variant_name=input.variant_name,
        quantity=input.quantity,
        reason=input.reason,
        dispatch_id=input.dispatch_id,
        recorded_by=current_user["user_id"],
        mrp=input.mrp,
        rejection_value=round(rejection_value, 2),
        remarks=input.remarks
    )
    
    doc = rejection.model_dump()
    doc["rejection_date"] = doc["rejection_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_rejections.insert_one(doc)
    return {"id": rejection.id, "message": "Rejection recorded successfully"}

@api_router.delete("/retailer-rejections/{rejection_id}")
async def delete_retailer_rejection(rejection_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete rejections")
    
    result = await db.retailer_rejections.delete_one({"id": rejection_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rejection not found")
    
    return {"message": "Rejection deleted successfully"}

# ------------ RETAILER PAYMENTS ------------
@api_router.get("/retailer-payments")
async def get_retailer_payments(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    payments = await db.retailer_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(1000)
    return payments

@api_router.post("/retailer-payments")
async def create_retailer_payment(input: RetailerPaymentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can record payments")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.retailer_id, "role": "retailer"}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    payment = RetailerPayment(
        retailer_id=input.retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        payment_date=input.payment_date,
        amount=input.amount,
        payment_mode=input.payment_mode,
        reference_number=input.reference_number,
        recorded_by=current_user["user_id"],
        remarks=input.remarks
    )
    
    doc = payment.model_dump()
    doc["payment_date"] = doc["payment_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_payments.insert_one(doc)
    return {"id": payment.id, "message": "Payment recorded successfully"}

@api_router.delete("/retailer-payments/{payment_id}")
async def delete_retailer_payment(payment_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete payments")
    
    result = await db.retailer_payments.delete_one({"id": payment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return {"message": "Payment deleted successfully"}

# ------------ RETAILER INVOICES ------------
@api_router.get("/retailer-invoices")
async def get_retailer_invoices(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if current_user["role"] == "retailer":
        query["retailer_id"] = current_user["user_id"]
    elif retailer_id:
        query["retailer_id"] = retailer_id
    
    invoices = await db.retailer_invoices.find(query, {"_id": 0}).sort("invoice_date", -1).to_list(1000)
    return invoices

@api_router.get("/retailer-invoices/{invoice_id}")
async def get_retailer_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Retailers can only see their own invoices
    if current_user["role"] == "retailer" and invoice["retailer_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return invoice

@api_router.post("/retailer-invoices")
async def create_retailer_invoice(input: RetailerInvoiceCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can create invoices")
    
    if not input.dispatch_ids:
        raise HTTPException(status_code=400, detail="At least one dispatch is required")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": input.retailer_id}, {"_id": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    commission = retailer.get("commission_percentage", 0)
    
    # Get all dispatches for validation
    dispatches = await db.retailer_dispatches.find(
        {"id": {"$in": input.dispatch_ids}},
        {"_id": 0}
    ).to_list(100)
    
    if len(dispatches) != len(input.dispatch_ids):
        raise HTTPException(status_code=400, detail="Some dispatches not found")
    
    # Check if any dispatch is already in another invoice
    for dispatch in dispatches:
        existing_invoice = await db.retailer_invoices.find_one({"dispatch_ids": dispatch["id"]})
        if existing_invoice:
            raise HTTPException(
                status_code=400, 
                detail=f"Dispatch is already in invoice {existing_invoice.get('invoice_number')}"
            )
    
    # Use selected_items if provided (includes rejection adjustments), otherwise fall back to dispatch items
    all_items = []
    total_mrp_value = 0
    
    if input.selected_items and len(input.selected_items) > 0:
        # Use the item-level selection with rejection data
        for item in input.selected_items:
            all_items.append(RetailerInvoiceItem(
                dispatch_id=item.dispatch_id,
                product_id=item.product_id,
                product_name=item.product_name,
                variant_name=item.variant_name,
                quantity=item.net_qty,  # Use net_qty (after rejection deduction)
                supplied_qty=item.supplied_qty,
                rejected_qty=item.rejected_qty,
                mrp=item.mrp,
                total_value=item.total_value  # This is net_value from frontend
            ))
            total_mrp_value += item.total_value
    else:
        # Fallback: aggregate items from all dispatches (legacy behavior)
        for dispatch in dispatches:
            for item in dispatch.get("items", []):
                all_items.append(RetailerInvoiceItem(
                    dispatch_id=dispatch["id"],
                    product_id=item.get("product_id", ""),
                    product_name=item.get("product_name", ""),
                    variant_name=item.get("variant_name"),
                    quantity=item.get("supplied_qty", 0),
                    mrp=item.get("mrp", 0),
                    total_value=item.get("total_value", 0)
                ))
                total_mrp_value += item.get("total_value", 0)
    
    commission_amount = total_mrp_value * commission / 100
    net_payable = total_mrp_value - commission_amount
    
    # Generate invoice number: RET-INV-DDMMMYYYY-NNN
    today = input.invoice_date.strftime("%d%b%Y").upper()
    count = await db.retailer_invoices.count_documents({
        "invoice_date": {"$regex": f"^{input.invoice_date.strftime('%Y-%m-%d')}"}
    })
    invoice_number = f"RET-INV-{today}-{str(count + 1).zfill(3)}"
    
    invoice = RetailerInvoice(
        invoice_number=invoice_number,
        retailer_id=input.retailer_id,
        retailer_name=retailer.get("name", "Unknown"),
        invoice_date=input.invoice_date,
        dispatch_ids=input.dispatch_ids,
        items=[item.model_dump() for item in all_items],
        total_mrp_value=round(total_mrp_value, 2),
        commission_percentage=commission,
        commission_amount=round(commission_amount, 2),
        net_payable=round(net_payable, 2),
        created_by=current_user["user_id"],
        remarks=input.remarks
    )
    
    doc = invoice.model_dump()
    doc["invoice_date"] = doc["invoice_date"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    
    await db.retailer_invoices.insert_one(doc)
    
    # Update dispatches with invoice number
    await db.retailer_dispatches.update_many(
        {"id": {"$in": input.dispatch_ids}},
        {"$set": {"invoice_number": invoice_number, "invoice_id": invoice.id}}
    )
    
    return {"id": invoice.id, "invoice_number": invoice_number, "message": "Invoice created successfully"}


@api_router.put("/retailer-invoices/{invoice_id}")
async def update_retailer_invoice(invoice_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing retailer invoice"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can update invoices")
    
    invoice = await db.retailer_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Process items if provided
    items = input.get("items", invoice.get("items", []))
    total_mrp_value = sum(item.get("total_value", 0) for item in items)
    
    # Get retailer for commission calculation
    retailer = await db.users.find_one({"id": invoice.get("retailer_id")}, {"_id": 0})
    commission_percentage = retailer.get("commission_percentage", 0) if retailer else invoice.get("commission_percentage", 0)
    commission_amount = total_mrp_value * (commission_percentage / 100)
    net_payable = total_mrp_value - commission_amount
    
    # Update invoice
    update_data = {
        "invoice_date": input.get("invoice_date", invoice.get("invoice_date")),
        "items": items,
        "total_mrp_value": round(total_mrp_value, 2),
        "commission_percentage": commission_percentage,
        "commission_amount": round(commission_amount, 2),
        "net_payable": round(net_payable, 2),
        "remarks": input.get("remarks", invoice.get("remarks", ""))
    }
    
    await db.retailer_invoices.update_one(
        {"id": invoice_id},
        {"$set": update_data}
    )
    
    return {"id": invoice_id, "message": "Invoice updated successfully"}


@api_router.delete("/retailer-invoices/{invoice_id}")
async def delete_retailer_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can delete invoices")
    
    invoice = await db.retailer_invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Remove invoice reference from dispatches
    await db.retailer_dispatches.update_many(
        {"id": {"$in": invoice.get("dispatch_ids", [])}},
        {"$set": {"invoice_number": None, "invoice_id": None}}
    )
    
    await db.retailer_invoices.delete_one({"id": invoice_id})
    return {"message": "Invoice deleted successfully"}

# Get uninvoiced dispatches for a retailer (for creating invoices)
@api_router.get("/retailer-dispatches/uninvoiced")
async def get_uninvoiced_dispatches(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Only admin/staff can view uninvoiced dispatches")
    
    dispatches = await db.retailer_dispatches.find({
        "retailer_id": retailer_id,
        "$or": [
            {"invoice_id": None}, 
            {"invoice_id": {"$exists": False}},
            {"invoice_number": None},
            {"invoice_number": {"$exists": False}}
        ]
    }, {"_id": 0}).sort("dispatch_date", -1).to_list(100)
    
    # Filter to only truly uninvoiced (both invoice_id and invoice_number must be None/missing)
    uninvoiced = [
        d for d in dispatches 
        if not d.get("invoice_id") and not d.get("invoice_number")
    ]
    
    return uninvoiced

# ------------ RETAILER DASHBOARD ------------
@api_router.get("/retailer-dashboard")
async def get_retailer_dashboard(
    retailer_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    # Determine which retailer's data to show
    if current_user["role"] == "retailer":
        target_retailer_id = current_user["user_id"]
    elif retailer_id:
        target_retailer_id = retailer_id
    else:
        raise HTTPException(status_code=400, detail="Retailer ID required")
    
    # Get retailer info
    retailer = await db.users.find_one({"id": target_retailer_id}, {"_id": 0, "password": 0})
    if not retailer:
        raise HTTPException(status_code=404, detail="Retailer not found")
    
    # Get all dispatches for this retailer
    dispatches = await db.retailer_dispatches.find(
        {"retailer_id": target_retailer_id}, 
        {"_id": 0}
    ).to_list(1000)
    
    # Get all rejections
    rejections = await db.retailer_rejections.find(
        {"retailer_id": target_retailer_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Get all payments
    payments = await db.retailer_payments.find(
        {"retailer_id": target_retailer_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Get pending indents
    pending_indents = await db.retailer_indents.count_documents({
        "retailer_id": target_retailer_id,
        "status": {"$in": ["pending", "partial"]}
    })
    
    # Calculate totals
    total_mrp_value = sum(d.get("total_mrp_value", 0) for d in dispatches)
    total_net_payable = sum(d.get("net_payable", 0) for d in dispatches)
    total_rejection_value = sum(r.get("rejection_value", 0) for r in rejections)
    total_paid = sum(p.get("amount", 0) for p in payments)
    
    # Adjusted payable after rejections
    adjusted_payable = total_net_payable - total_rejection_value
    pending_amount = max(0, adjusted_payable - total_paid)
    
    # Total items received
    total_items_received = 0
    for d in dispatches:
        for item in d.get("items", []):
            total_items_received += item.get("supplied_qty", 0)
    
    # Total items rejected
    total_items_rejected = sum(r.get("quantity", 0) for r in rejections)
    
    return {
        "retailer": {
            "id": retailer.get("id"),
            "name": retailer.get("name"),
            "company_name": retailer.get("company_name"),
            "commission_percentage": retailer.get("commission_percentage", 0)
        },
        "summary": {
            "total_mrp_value": round(total_mrp_value, 2),
            "total_net_payable": round(total_net_payable, 2),
            "total_rejection_value": round(total_rejection_value, 2),
            "adjusted_payable": round(adjusted_payable, 2),
            "total_paid": round(total_paid, 2),
            "pending_amount": round(pending_amount, 2),
            "total_items_received": total_items_received,
            "total_items_rejected": total_items_rejected,
            "pending_indents": pending_indents,
            "total_dispatches": len(dispatches),
            "total_payments": len(payments)
        }
    }

# ============================================================================
# SECTION: BACKUP & DATA MANAGEMENT ROUTES (Lines ~4127-4200)
# ============================================================================

@api_router.post("/backup/trigger")
async def trigger_backup(current_user: dict = Depends(get_current_user)):
    """Manually trigger a backup and send to configured email addresses"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can trigger backups")
    
    result = await trigger_manual_backup(db)
    return result

@api_router.get("/backup/download")
async def download_backup(current_user: dict = Depends(get_current_user)):
    """Download backup Excel file directly"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can download backups")
    
    try:
        excel_data = await generate_backup_excel(db)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filename = f"FreshFlow_Backup_{today}.xlsx"
        
        return StreamingResponse(
            io.BytesIO(excel_data),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate backup: {str(e)}")

@api_router.get("/backup/status")
async def get_backup_status(current_user: dict = Depends(get_current_user)):
    """Get backup scheduler status"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view backup status")
    
    return {
        "scheduler_running": backup_scheduler is not None and backup_scheduler.running if backup_scheduler else False,
        "next_backup_time": "11:59 PM IST (18:29 UTC)",
        "recipients": ["dshukla11189@gmail.com"],
        "collections_backed_up": [
            "users", "products", "farmers", "procurements",
            "qc_customers", "qc_indents", "qc_dispatches", "qc_invoices", "qc_grns",
            "retailer_indents", "retailer_dispatches", "retailer_invoices", 
            "retailer_grn", "retailer_rejections", "retailer_payments",
            "daily_stock_status", "variable_expenses", "fixed_expenses"
        ]
    }

@api_router.post("/admin/reset-data")
async def reset_all_data(current_user: dict = Depends(get_current_user)):
    """
    Reset all data for production - keeps only admin user.
    USE WITH CAUTION - This deletes ALL business data!
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reset data")
    
    collections_to_clear = [
        "products", "farmers", "procurements",
        "qc_customers", "qc_indents", "qc_dispatches", "qc_invoices", "qc_grns",
        "retailer_indents", "retailer_dispatches", "retailer_invoices", 
        "retailer_grn", "retailer_rejections", "retailer_payments",
        "daily_stock_status", "variable_expenses", "fixed_expenses"
    ]
    
    deleted_counts = {}
    for coll_name in collections_to_clear:
        result = await db[coll_name].delete_many({})
        deleted_counts[coll_name] = result.deleted_count
    
    # Delete non-admin users (keep admin accounts)
    users_deleted = await db.users.delete_many({"role": {"$ne": "admin"}})
    deleted_counts["users (non-admin)"] = users_deleted.deleted_count
    
    return {
        "success": True,
        "message": "All test data cleared. Ready for production!",
        "deleted": deleted_counts
    }

# ============================================================================
# SECTION: GMAIL INTEGRATION ROUTES - Ninjacart GRN Email Automation
# ============================================================================

@api_router.get("/oauth/gmail/debug-states")
async def gmail_oauth_debug_states():
    """DEBUG: Show OAuth states in database"""
    states = await db.oauth_states.find({}).to_list(length=10)
    return {
        "total_states": len(states),
        "states": [
            {
                "state": s.get("state", "N/A")[:20] + "...",
                "user_id": s.get("user_id"),
                "redirect_uri": s.get("redirect_uri"),
                "created_at": str(s.get("created_at")),
                "expires_at": str(s.get("expires_at"))
            }
            for s in states
        ]
    }

@api_router.get("/oauth/gmail/debug-tokens")
async def gmail_oauth_debug_tokens():
    """DEBUG: Show Gmail tokens in database (without sensitive data)"""
    tokens = await db.gmail_tokens.find({}).to_list(length=10)
    return {
        "total_tokens": len(tokens),
        "tokens": [
            {
                "user_id": t.get("user_id"),
                "email": t.get("email"),
                "has_access_token": bool(t.get("access_token")),
                "has_refresh_token": bool(t.get("refresh_token")),
                "updated_at": str(t.get("updated_at"))
            }
            for t in tokens
        ]
    }

@api_router.get("/oauth/gmail/debug-headers")
async def gmail_oauth_debug_headers(request: Request):
    """DEBUG: Show what headers the server receives - helps diagnose redirect_uri issues"""
    host = request.headers.get("host", "")
    x_forwarded_host = request.headers.get("x-forwarded-host", "")
    x_forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")
    
    # Determine the actual host - prefer x-forwarded-host for reverse proxy setups
    actual_host = x_forwarded_host or host
    
    # Detect redirect URI based on actual host
    if "emergent.host" in actual_host:
        redirect_uri = "https://harvest-hub-384.emergent.host/api/oauth/gmail/callback"
    elif "preview.emergentagent.com" in actual_host:
        redirect_uri = "https://harvest-hub-384.preview.emergentagent.com/api/oauth/gmail/callback"
    else:
        # Fallback: try to detect from referer or origin
        if "emergent.host" in referer or "emergent.host" in origin:
            redirect_uri = "https://harvest-hub-384.emergent.host/api/oauth/gmail/callback"
        else:
            redirect_uri = "https://harvest-hub-384.preview.emergentagent.com/api/oauth/gmail/callback"
    
    return {
        "headers_received": {
            "host": host,
            "x-forwarded-host": x_forwarded_host,
            "x-forwarded-proto": x_forwarded_proto,
            "origin": origin,
            "referer": referer
        },
        "actual_host_used": actual_host,
        "redirect_uri_that_would_be_generated": redirect_uri,
        "expected_google_console_uri": redirect_uri,
        "message": "The 'redirect_uri_that_would_be_generated' must EXACTLY match the URI in Google Cloud Console Authorized Redirect URIs"
    }

@api_router.get("/oauth/gmail/status")
async def get_gmail_connection_status(current_user: dict = Depends(get_current_user)):
    """Check if Gmail is connected"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage Gmail integration")
    
    token = await db.gmail_tokens.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    
    return {
        "connected": token is not None and token.get("access_token") is not None,
        "email": token.get("email") if token else None,
        "last_sync": token.get("last_sync") if token else None
    }

@api_router.get("/oauth/gmail/login")
async def gmail_oauth_login(request: Request, current_user: dict = Depends(get_current_user)):
    """Start Gmail OAuth flow"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can connect Gmail")
    
    # Generate state token
    state = str(uuid.uuid4())
    
    # Debug: Log all relevant headers to understand what we're receiving
    host = request.headers.get("host", "")
    x_forwarded_host = request.headers.get("x-forwarded-host", "")
    x_forwarded_proto = request.headers.get("x-forwarded-proto", "https")
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")
    
    logger.info(f"OAuth Login - Headers Debug:")
    logger.info(f"  host: {host}")
    logger.info(f"  x-forwarded-host: {x_forwarded_host}")
    logger.info(f"  x-forwarded-proto: {x_forwarded_proto}")
    logger.info(f"  origin: {origin}")
    logger.info(f"  referer: {referer}")
    
    # Determine the actual host - prefer x-forwarded-host for reverse proxy setups
    actual_host = x_forwarded_host or host
    
    # Detect redirect URI based on actual host
    if "emergent.host" in actual_host:
        redirect_uri = "https://harvest-hub-384.emergent.host/api/oauth/gmail/callback"
    elif "preview.emergentagent.com" in actual_host:
        redirect_uri = "https://harvest-hub-384.preview.emergentagent.com/api/oauth/gmail/callback"
    else:
        # Fallback: try to detect from referer or origin
        if "emergent.host" in referer or "emergent.host" in origin:
            redirect_uri = "https://harvest-hub-384.emergent.host/api/oauth/gmail/callback"
        else:
            redirect_uri = "https://harvest-hub-384.preview.emergentagent.com/api/oauth/gmail/callback"
    
    logger.info(f"  Selected redirect_uri: {redirect_uri}")
    
    # Store state in DB with user_id and redirect_uri
    await db.oauth_states.insert_one({
        "state": state,
        "user_id": current_user["user_id"],
        "redirect_uri": redirect_uri,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    })
    
    # Get authorization URL with dynamic redirect URI
    auth_url = get_authorization_url(state, redirect_uri)
    
    logger.info(f"  Generated auth_url: {auth_url[:100]}...")
    
    return {"auth_url": auth_url, "debug_redirect_uri": redirect_uri}

@api_router.get("/oauth/gmail/callback")
async def gmail_oauth_callback(request: Request, code: str = None, state: str = None, error: str = None):
    """Handle Gmail OAuth callback"""
    logger.info(f"Gmail OAuth callback received - code: {code[:20] if code else 'None'}..., state: {state}, error: {error}")
    
    if error:
        logger.error(f"Gmail OAuth error from Google: {error}")
        return RedirectResponse(url=f"/admin/backup?gmail_error={error}")
    
    if not code or not state:
        logger.error(f"Gmail OAuth missing params - code: {bool(code)}, state: {bool(state)}")
        return RedirectResponse(url="/admin/backup?gmail_error=missing_params")
    
    # Verify state
    state_doc = await db.oauth_states.find_one({"state": state})
    if not state_doc:
        # Log all states to debug
        all_states = await db.oauth_states.find({}).to_list(length=10)
        logger.error(f"Gmail OAuth invalid_state: {state}")
        logger.error(f"Available states in DB: {[s.get('state', 'N/A')[:20] for s in all_states]}")
        return RedirectResponse(url="/admin/backup?gmail_error=invalid_state")
    
    logger.info(f"State validated - user_id: {state_doc.get('user_id')}, redirect_uri: {state_doc.get('redirect_uri')}")
    
    # Check expiry
    if datetime.now(timezone.utc) > state_doc["expires_at"].replace(tzinfo=timezone.utc):
        return RedirectResponse(url="/admin/backup?gmail_error=state_expired")
    
    user_id = state_doc["user_id"]
    
    # Delete used state
    await db.oauth_states.delete_one({"state": state})
    
    # Get redirect URI from state
    redirect_uri = state_doc.get("redirect_uri")
    
    try:
        # Exchange code for tokens
        logger.info(f"Exchanging code for tokens with redirect_uri: {redirect_uri}")
        tokens = exchange_code_for_tokens(code, redirect_uri)
        logger.info(f"Token exchange successful - has_access_token: {bool(tokens.get('access_token'))}, has_refresh_token: {bool(tokens.get('refresh_token'))}")
        
        # Get user email
        service = get_gmail_service(tokens)
        profile = service.users().getProfile(userId='me').execute()
        email = profile.get('emailAddress', '')
        logger.info(f"Gmail profile retrieved - email: {email}")
        
        # Store tokens
        await db.gmail_tokens.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "email": email,
                **tokens,
                "updated_at": datetime.now(timezone.utc)
            }},
            upsert=True
        )
        logger.info(f"Gmail tokens saved for user: {user_id}")
        
        return RedirectResponse(url="/admin/backup?gmail_success=true")
    except Exception as e:
        logger.error(f"Gmail OAuth error: {e}", exc_info=True)
        return RedirectResponse(url=f"/admin/backup?gmail_error={str(e)[:50]}")

@api_router.post("/oauth/gmail/disconnect")
async def gmail_disconnect(current_user: dict = Depends(get_current_user)):
    """Disconnect Gmail integration"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can disconnect Gmail")
    
    await db.gmail_tokens.delete_one({"user_id": current_user["user_id"]})
    return {"message": "Gmail disconnected successfully"}

@api_router.get("/gmail/ninjacart-emails")
async def get_ninjacart_emails(
    max_results: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """Fetch recent Ninjacart emails"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get Gmail tokens
    token = await db.gmail_tokens.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=400, detail="Gmail not connected. Please connect Gmail first.")
    
    try:
        service = get_gmail_service(token)
        
        # Search for Ninjacart emails
        messages = search_ninjacart_emails(service, max_results)
        
        emails = []
        for msg in messages[:5]:  # Limit to 5 for performance
            content = get_email_content(service, msg['id'])
            if content:
                emails.append({
                    "id": content['id'],
                    "subject": content['subject'],
                    "from": content['from'],
                    "date": content['date'],
                    "has_attachments": len(content['attachments']) > 0,
                    "attachments": [a['filename'] for a in content['attachments']]
                })
        
        return {"emails": emails}
    except Exception as e:
        logger.error(f"Error fetching emails: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch emails: {str(e)}")

@api_router.post("/gmail/process-grn-email/{message_id}")
async def process_grn_from_email(
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Process a specific email and create GRN from it"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get Gmail tokens
    token = await db.gmail_tokens.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=400, detail="Gmail not connected")
    
    try:
        service = get_gmail_service(token)
        
        # Get email content
        content = get_email_content(service, message_id)
        if not content:
            raise HTTPException(status_code=404, detail="Email not found")
        
        grn_items = []
        
        # Try to parse CSV attachment first
        for attachment in content['attachments']:
            if attachment['filename'].lower().endswith('.csv'):
                csv_data = download_attachment(service, message_id, attachment['attachment_id'])
                if csv_data:
                    grn_items = parse_ninjacart_csv(csv_data)
                    break
        
        # If no CSV, try to parse email body
        if not grn_items and content['body_text']:
            grn_items = parse_ninjacart_email_body(content['body_text'])
        
        if not grn_items:
            raise HTTPException(status_code=400, detail="Could not parse GRN data from email")
        
        # Mark email as processed
        mark_email_as_read(service, message_id)
        add_label_to_email(service, message_id, "FreshFlow-Processed")
        
        return {
            "message": "Email processed successfully",
            "email_subject": content['subject'],
            "items_found": len(grn_items),
            "grn_items": grn_items
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process email: {str(e)}")

@api_router.post("/gmail/auto-sync-grn")
async def auto_sync_ninjacart_grn(current_user: dict = Depends(get_current_user)):
    """
    Automatically sync Ninjacart GRN from latest unprocessed email
    This can be triggered manually or by scheduler
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get Gmail tokens
    token = await db.gmail_tokens.find_one({"user_id": current_user["user_id"]}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=400, detail="Gmail not connected")
    
    try:
        service = get_gmail_service(token)
        
        # Search for unread Ninjacart emails
        result = service.users().messages().list(
            userId='me',
            q='from:ninjacart is:unread',
            maxResults=5
        ).execute()
        
        messages = result.get('messages', [])
        
        if not messages:
            return {"message": "No new Ninjacart emails found", "processed": 0}
        
        processed_count = 0
        grn_data = []
        
        for msg in messages:
            content = get_email_content(service, msg['id'])
            if not content:
                continue
            
            items = []
            
            # Try CSV first
            for attachment in content['attachments']:
                if attachment['filename'].lower().endswith('.csv'):
                    csv_data = download_attachment(service, msg['id'], attachment['attachment_id'])
                    if csv_data:
                        items = parse_ninjacart_csv(csv_data)
                        break
            
            # Fallback to body parsing
            if not items and content['body_text']:
                items = parse_ninjacart_email_body(content['body_text'])
            
            if items:
                grn_data.append({
                    "email_id": msg['id'],
                    "subject": content['subject'],
                    "date": content['date'],
                    "items": items
                })
                
                # Mark as processed
                mark_email_as_read(service, msg['id'])
                add_label_to_email(service, msg['id'], "FreshFlow-Processed")
                processed_count += 1
        
        # Update last sync time
        await db.gmail_tokens.update_one(
            {"user_id": current_user["user_id"]},
            {"$set": {"last_sync": datetime.now(timezone.utc)}}
        )
        
        return {
            "message": f"Processed {processed_count} Ninjacart emails",
            "processed": processed_count,
            "grn_data": grn_data
        }
    except Exception as e:
        logger.error(f"Error in auto-sync: {e}")
        raise HTTPException(status_code=500, detail=f"Auto-sync failed: {str(e)}")

# Include router
app.include_router(api_router)

# Add no-cache middleware for API responses
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

app.add_middleware(NoCacheMiddleware)

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

@app.on_event("startup")
async def startup_event():
    """Initialize backup scheduler and Gmail sync scheduler on startup"""
    global backup_scheduler
    try:
        backup_scheduler = setup_backup_scheduler(db)
        logger.info("Backup scheduler initialized successfully")
        
        # Add Gmail GRN sync job at 6 AM IST (00:30 UTC)
        # IST is UTC+5:30, so 6:00 AM IST = 00:30 UTC
        backup_scheduler.add_job(
            scheduled_gmail_sync,
            CronTrigger(hour=0, minute=30),  # 6:00 AM IST
            id='gmail_grn_sync',
            replace_existing=True
        )
        logger.info("Gmail GRN sync scheduled for 6:00 AM IST daily")
    except Exception as e:
        logger.error(f"Failed to initialize schedulers: {e}")

async def scheduled_gmail_sync():
    """Scheduled job to sync Ninjacart GRN from Gmail at 6 AM"""
    logger.info("Starting scheduled Gmail GRN sync...")
    try:
        # Get all admin users with Gmail connected
        tokens = await db.gmail_tokens.find({}, {"_id": 0}).to_list(10)
        
        if not tokens:
            logger.info("No Gmail accounts connected for GRN sync")
            return
        
        for token in tokens:
            try:
                from gmail_integration import (
                    get_gmail_service, search_ninjacart_emails, get_email_content,
                    download_attachment, parse_ninjacart_csv, parse_ninjacart_email_body,
                    mark_email_as_read, add_label_to_email
                )
                
                service = get_gmail_service(token)
                
                # Search for unread Ninjacart emails from last 24 hours
                yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y/%m/%d')
                result = service.users().messages().list(
                    userId='me',
                    q=f'from:ninjacart is:unread after:{yesterday}',
                    maxResults=10
                ).execute()
                
                messages = result.get('messages', [])
                
                if not messages:
                    logger.info(f"No new Ninjacart emails for {token.get('email')}")
                    continue
                
                processed = 0
                for msg in messages:
                    content = get_email_content(service, msg['id'])
                    if not content:
                        continue
                    
                    items = []
                    for attachment in content['attachments']:
                        if attachment['filename'].lower().endswith('.csv'):
                            csv_data = download_attachment(service, msg['id'], attachment['attachment_id'])
                            if csv_data:
                                items = parse_ninjacart_csv(csv_data)
                                break
                    
                    if items:
                        # Store parsed GRN data for manual review
                        await db.pending_grn_imports.insert_one({
                            "email_id": msg['id'],
                            "subject": content['subject'],
                            "date": content['date'],
                            "items": items,
                            "imported_at": datetime.now(timezone.utc),
                            "status": "pending_review",
                            "user_email": token.get('email')
                        })
                        
                        mark_email_as_read(service, msg['id'])
                        add_label_to_email(service, msg['id'], "FreshFlow-Processed")
                        processed += 1
                
                logger.info(f"Processed {processed} Ninjacart emails for {token.get('email')}")
                
                # Update last sync time
                await db.gmail_tokens.update_one(
                    {"email": token.get('email')},
                    {"$set": {"last_sync": datetime.now(timezone.utc)}}
                )
                
            except Exception as e:
                logger.error(f"Error syncing Gmail for {token.get('email')}: {e}")
                continue
        
        logger.info("Scheduled Gmail GRN sync completed")
    except Exception as e:
        logger.error(f"Gmail sync scheduler error: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    global backup_scheduler
    if backup_scheduler:
        backup_scheduler.shutdown()
    client.close()