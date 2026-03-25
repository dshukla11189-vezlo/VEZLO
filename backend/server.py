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

@api_router.post("/farmers", response_model=Farmer)
async def create_farmer(input: FarmerCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    farmer = Farmer(**input.model_dump())
    doc = farmer.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.farmers.insert_one(doc)
    return farmer

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

@api_router.post("/procurement", response_model=Procurement)
async def create_procurement(input: ProcurementCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
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
    total_stock_value = sum(p.get("current_stock", 0) * p.get("price_per_kg", 0) for p in products)
    
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