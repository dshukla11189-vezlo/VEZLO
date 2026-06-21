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

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, status, Request, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import random
import string
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import bcrypt
import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
import io
import csv
import uuid
import traceback
import time
import base64

from models import *
from ocr_processor import process_excel_image
from ocr_indent_processor import extract_indent_from_image, map_sku_to_product, map_uom_to_packaging
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

# Import modular routers
from routes import auth_router, labour_router, health_router, users_router, farmers_router, qc_orders_customers_router, qc_indents_dispatches_router, qc_invoices_router, products_packaging_router, qc_grn_router, retail_plans_router, procurement_router, retailer_orders_wastage_router, expenses_router, backup_data_router, gmail_integration_router, dashboard_analytics_router, retailer_portal_router
from routes.daily_cogs import router as daily_cogs_router, compute_daily_cogs_for_date, save_daily_cogs
from routes.retail_plans import initialize_default_plans
from routes.retailer_portal import run_blinkit_scrape_scheduled, generate_auto_indents_wrapper

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Hindi translations for all products - used for auto-translation
HINDI_PRODUCT_NAMES = {
    "Amaranthus Green": "हरा चौलाई",
    "Amaranthus Red": "लाल चौलाई",
    "Coriander": "धनिया",
    "Curry Leaves": "करी पत्ता",
    "Dill Leaf": "सोया पत्ता",
    "Fenugreek (Methi)": "मेथी",
    "Fresh Mint Leaves": "पुदीना",
    "Premium Fresh Mint Leaves": "प्रीमियम पुदीना",
    "Palak": "पालक",
    "Spinach": "पालक",
    "Tomato Hybrid": "हाइब्रिड टमाटर",
    "Lemon": "नींबू",
    "Raw Mango": "कच्चा आम",
    "Banana": "केला",
    "Banana ": "केला",
    "Onion": "प्याज",
    "Potato": "आलू",
    "Garlic": "लहसुन",
    "Ginger": "अदरक",
    "Carrot": "गाजर",
    "Radish": "मूली",
    "Peeled Garlic": "छिला लहसुन",
    "Bottle Gourd": "लौकी",
    "Bitter gourd": "करेला",
    "Cucumber": "खीरा",
    "Ridge Gourd": "तोरी",
    "Capsicum": "शिमला मिर्च",
    "Green capcicum ": "हरी शिमला मिर्च",
    "Chilli Light Green": "हल्की हरी मिर्च",
    "Chilli": "मिर्च",
    "Green chilli ": "हरी मिर्च",
    "Green chilli": "हरी मिर्च",
    "Cauliflower": "फूलगोभी",
    "Cabbage ": "पत्तागोभी",
    "Cabbage": "पत्तागोभी",
    "Button Mushroom": "बटन मशरूम",
    "Brinjal": "बैंगन",
    "Lady Finger": "भिंडी",
    "Cluster Beans": "ग्वार फली",
    "Spring onion ": "हरा प्याज",
    "Spring onion": "हरा प्याज",
    "Green Pea": "हरी मटर",
    "Soaked chole": "भीगे छोले",
    "Soaked yellow peas": "भीगी पीली मटर",
    "Soaked Green peas": "भीगी हरी मटर",
    "Sprouted matki": "अंकुरित मोठ",
    "Matki Sprouts": "मोठ स्प्राउट्स",
    "Soaked Harbhara": "भीगा हरभरा",
    "Sprouted moong": "अंकुरित मूंग",
    "Mixed Sprouts ": "मिक्स स्प्राउट्स",
    "Mixed Sprouts": "मिक्स स्प्राउट्स",
    # New additions
    "Brinjal Bharta": "बैंगन भर्ता",
    "French Beans": "फ्रेंच बीन्स",
    "Green Cucumber": "हरा खीरा",
    "Hyacinth Beans": "सेम",
    "Broccoli": "ब्रोकोली",
    "Iceberg Lettuce": "आइसबर्ग लेट्टुस",
    "Red Cabbage": "लाल पत्तागोभी",
    "Red Yellow Capsicum": "लाल पीली शिमला मिर्च",
    "Cherry Tomato": "चेरी टमाटर",
    "Baby Corn": "बेबी कॉर्न",
    "Sweet Corn": "स्वीट कॉर्न",
    "Shimla Apple": "शिमला सेब",
    "Green & Yellow Zucchini": "हरी और पीली जुकिनी",
    "Apple - Royal Gala": "सेब - रॉयल गाला",
    "Mango - Kesar": "आम - केसर",
    "Watermelon": "तरबूज",
    "Mini Orange": "मिनी संतरा",
    "Black Chickpea": "काला चना",
    "Muskmelon ": "खरबूजा",
    "Muskmelon": "खरबूजा",
    "Beetroot": "चुकंदर",
    "Pomegranate": "अनार",
    "Guava": "अमरूद",
    "Jamun Fruit": "जामुन",
    "Drumstick": "सहजन",
    "Elaichi Banana": "इलायची केला",
    "Mango - Hapus": "आम - हापुस",
    "Sweet Potato": "शकरकंद",
    "Ivy Gourd": "टिंडा",
    "Papaya": "पपीता",
    "Pointed Gourd": "परवल",
    "Striped Muskmelon": "धारीदार खरबूजा",
    "Sponge Gourd": "नेनुआ",
    "Raw Groundnut": "कच्ची मूंगफली",
}

# Marathi Product Names Dictionary
MARATHI_PRODUCT_NAMES = {
    "Amaranthus Green": "हिरवी माठ",
    "Amaranthus Red": "लाल माठ",
    "Coriander": "कोथिंबीर",
    "Curry Leaves": "कढीपत्ता",
    "Dill Leaf": "शेपू",
    "Fenugreek (Methi)": "मेथी",
    "Fresh Mint Leaves": "पुदिना",
    "Premium Fresh Mint Leaves": "प्रीमियम पुदिना",
    "Palak": "पालक",
    "Spinach": "पालक",
    "Tomato Hybrid": "हायब्रिड टोमॅटो",
    "Lemon": "लिंबू",
    "Raw Mango": "कैरी",
    "Banana": "केळी",
    "Banana ": "केळी",
    "Onion": "कांदा",
    "Potato": "बटाटा",
    "Garlic": "लसूण",
    "Ginger": "आले",
    "Carrot": "गाजर",
    "Radish": "मुळा",
    "Peeled Garlic": "सोललेला लसूण",
    "Bottle Gourd": "दुधी भोपळा",
    "Bitter gourd": "कारले",
    "Cucumber": "काकडी",
    "Ridge Gourd": "दोडका",
    "Capsicum": "ढोबळी मिरची",
    "Green capcicum ": "हिरवी ढोबळी मिरची",
    "Chilli Light Green": "हलकी हिरवी मिरची",
    "Chilli": "मिरची",
    "Green chilli ": "हिरवी मिरची",
    "Green chilli": "हिरवी मिरची",
    "Cauliflower": "फुलकोबी",
    "Cabbage ": "कोबी",
    "Cabbage": "कोबी",
    "Button Mushroom": "बटण मशरूम",
    "Brinjal": "वांगी",
    "Lady Finger": "भेंडी",
    "Cluster Beans": "गवार",
    "Spring onion ": "पात कांदा",
    "Spring onion": "पात कांदा",
    "Green Pea": "हिरवे वाटाणे",
    "Soaked chole": "भिजवलेले छोले",
    "Soaked yellow peas": "भिजवलेले पिवळे वाटाणे",
    "Soaked Green peas": "भिजवलेले हिरवे वाटाणे",
    "Sprouted matki": "मोड आलेले मटकी",
    "Matki Sprouts": "मटकी स्प्राउट्स",
    "Soaked Harbhara": "भिजवलेले हरभरा",
    "Sprouted moong": "मोड आलेले मूग",
    "Mixed Sprouts ": "मिश्र स्प्राउट्स",
    "Mixed Sprouts": "मिश्र स्प्राउट्स",
    "Brinjal Bharta": "वांग्याचे भरीत",
    "French Beans": "फ्रेंच बीन्स",
    "Green Cucumber": "हिरवी काकडी",
    "Hyacinth Beans": "पावटा",
    "Broccoli": "ब्रोकोली",
    "Iceberg Lettuce": "आइसबर्ग लेट्युस",
    "Red Cabbage": "लाल कोबी",
    "Red Yellow Capsicum": "लाल पिवळी ढोबळी मिरची",
    "Cherry Tomato": "चेरी टोमॅटो",
    "Baby Corn": "बेबी कॉर्न",
    "Sweet Corn": "स्वीट कॉर्न",
    "Shimla Apple": "शिमला सफरचंद",
    "Green & Yellow Zucchini": "हिरवी आणि पिवळी झुकिनी",
    "Apple - Royal Gala": "सफरचंद - रॉयल गाला",
    "Mango - Kesar": "आंबा - केशर",
    "Watermelon": "कलिंगड",
    "Mini Orange": "मिनी संत्री",
    "Black Chickpea": "काळा चणा",
    "Muskmelon ": "खरबूज",
    "Muskmelon": "खरबूज",
    "Beetroot": "बीटरूट",
    "Pomegranate": "डाळिंब",
    "Guava": "पेरू",
    "Jamun Fruit": "जांभूळ",
    "Drumstick": "शेवगा",
    "Elaichi Banana": "वेलची केळी",
    "Mango - Hapus": "आंबा - हापूस",
    "Sweet Potato": "रताळे",
    "Ivy Gourd": "तोंडली",
    "Papaya": "पपई",
    "Pointed Gourd": "परवळ",
    "Striped Muskmelon": "पट्टेदार खरबूज",
    "Sponge Gourd": "घोसाळी",
    "Raw Groundnut": "कच्चे शेंगदाणे",
}

# Enhanced logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("freshflow")

# MongoDB connection with optimized settings for production reliability
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=30,              # Increased pool size for production load
    minPoolSize=5,               # More minimum connections ready
    maxIdleTimeMS=30000,         # Close idle connections after 30s
    serverSelectionTimeoutMS=10000,  # 10s timeout for server selection
    connectTimeoutMS=10000,      # 10s timeout for initial connection
    socketTimeoutMS=30000,       # 30s timeout for socket operations
    waitQueueTimeoutMS=10000,    # 10s wait for connection from pool
    retryWrites=True,            # Auto-retry failed writes
    retryReads=True,             # Auto-retry failed reads
    appName="MrOrganix",         # Identify app in MongoDB logs
)
db = client[os.environ['DB_NAME']]

# Log connection pool stats periodically
async def log_connection_stats():
    """Log MongoDB connection pool statistics"""
    try:
        server_info = await client.server_info()
        logger.info(f"MongoDB connected: version {server_info.get('version', 'unknown')}")
    except Exception as e:
        logger.error(f"MongoDB connection check failed: {e}")

# Setup backup scheduler on startup
backup_scheduler = None

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'freshflow-secret-key-change-in-production')
ALGORITHM = "HS256"

# Create the main app
app = FastAPI(title="Mr Organix API")
api_router = APIRouter(prefix="/api")

# Mount static files for uploads
from fastapi.staticfiles import StaticFiles
os.makedirs("/app/uploads/products", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

# Store recent errors for diagnostics (in-memory, last 100 errors)
recent_errors = []
MAX_ERROR_LOG = 100

# Track system health metrics
system_health_metrics = {
    "startup_time": datetime.now(timezone.utc).isoformat(),
    "total_requests": 0,
    "total_errors": 0,
    "total_db_errors": 0,
    "last_db_error": None,
    "consecutive_db_failures": 0,
    "uptime_checks": [],
    "environment": os.environ.get("ENVIRONMENT", "unknown")  # Track which env
}

# Function to log errors to database (called in background)
async def persist_error_log(error_data: dict, is_critical: bool = False):
    """Persist errors to MongoDB error_logs collection for cross-environment analysis"""
    try:
        error_data["persisted_at"] = datetime.now(timezone.utc).isoformat()
        error_data["is_critical"] = is_critical
        error_data["environment"] = os.environ.get("ENVIRONMENT", "production")
        error_data["server_id"] = os.environ.get("HOSTNAME", "unknown")
        
        await db.error_logs.insert_one(error_data)
        
        # Keep only last 5000 logs in DB (more storage for better analysis)
        count = await db.error_logs.count_documents({})
        if count > 5000:
            # Delete oldest logs beyond 5000
            oldest = await db.error_logs.find({}, {"_id": 1}).sort("timestamp", 1).limit(count - 5000).to_list(count - 5000)
            if oldest:
                await db.error_logs.delete_many({"_id": {"$in": [o["_id"] for o in oldest]}})
    except Exception as e:
        logger.error(f"Failed to persist error log: {e}")

# Request logging middleware - enhanced with comprehensive error tracking
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    request_id = str(uuid.uuid4())[:8]
    system_health_metrics["total_requests"] += 1
    
    # Capture request context for error logging
    request_context = {
        "user_agent": request.headers.get("user-agent", "")[:200],
        "referer": request.headers.get("referer", "")[:200],
        "content_type": request.headers.get("content-type", ""),
        "origin": request.headers.get("origin", ""),
    }
    
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log response
        log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
        if process_time > 2 or response.status_code >= 400:  # Only log slow or error requests
            logger.log(log_level, f"[{request_id}] {request.method} {request.url.path} - {response.status_code} ({process_time:.3f}s)")
        
        # Reset consecutive DB failures on successful request
        if response.status_code < 500:
            system_health_metrics["consecutive_db_failures"] = 0
        
        # Store errors for diagnostics
        if response.status_code >= 400 or process_time > 5:
            system_health_metrics["total_errors"] += 1
            error_entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "request_id": request_id,
                "method": request.method,
                "path": str(request.url.path),
                "query_params": str(request.query_params)[:500] if request.query_params else None,
                "status_code": response.status_code,
                "process_time": round(process_time, 3),
                "type": "slow_request" if process_time > 5 else "http_error",
                "request_context": request_context
            }
            recent_errors.append(error_entry)
            if len(recent_errors) > MAX_ERROR_LOG:
                recent_errors.pop(0)
            
            # Persist 500 errors and slow requests to DB
            if response.status_code >= 500 or process_time > 10:
                system_health_metrics["total_db_errors"] += 1
                system_health_metrics["consecutive_db_failures"] += 1
                system_health_metrics["last_db_error"] = datetime.now(timezone.utc).isoformat()
                asyncio.create_task(persist_error_log(error_entry, is_critical=response.status_code >= 500))
        
        return response
    except Exception as e:
        process_time = time.time() - start_time
        error_msg = str(e)
        stack_trace = traceback.format_exc()
        
        logger.error(f"[{request_id}] {request.method} {request.url.path} - EXCEPTION: {error_msg}")
        
        system_health_metrics["total_errors"] += 1
        system_health_metrics["consecutive_db_failures"] += 1
        system_health_metrics["last_db_error"] = datetime.now(timezone.utc).isoformat()
        
        # Comprehensive error entry
        error_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "request_id": request_id,
            "method": request.method,
            "path": str(request.url.path),
            "query_params": str(request.query_params)[:500] if request.query_params else None,
            "status_code": 500,
            "error_message": error_msg[:1000],
            "error_type": type(e).__name__,
            "stack_trace": stack_trace[:2000],
            "process_time": round(process_time, 3),
            "type": "exception",
            "request_context": request_context
        }
        recent_errors.append(error_entry)
        if len(recent_errors) > MAX_ERROR_LOG:
            recent_errors.pop(0)
        
        # Always persist exceptions to DB
        asyncio.create_task(persist_error_log(error_entry, is_critical=True))
        
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
# SECTION: HEALTH & DIAGNOSTICS ROUTES - MOVED TO routes/health.py
# ============================================================================
# The following routes have been extracted to routes/health.py:
# - GET /health
# - GET /health/detailed
# - GET /diagnostics
# - GET /system-logs
# - GET /error-logs
# - GET /error-logs/summary
# - DELETE /error-logs/clear
# Import: from routes import health_router
# Include: app.include_router(health_router, prefix="/api")
# ============================================================================

# ============================================================================
# SECTION: AUTHENTICATION ROUTES - MOVED TO routes/auth.py
# ============================================================================
# The following routes have been extracted to routes/auth.py:
# - POST /auth/register
# - POST /auth/login  
# - GET /auth/me
# Import: from routes import auth_router
# Include: app.include_router(auth_router, prefix="/api")
# ============================================================================
# ============================================================================
# SECTION: USER MANAGEMENT ROUTES - MOVED TO routes/users.py
# ============================================================================
# The following routes have been extracted to routes/users.py:
# - GET /employees
# - GET /users
# - POST /users
# - PUT /users/{user_id}
# - DELETE /users/{user_id}
# - POST /users/normalize-contacts
# Import: from routes import users_router
# Include: app.include_router(users_router, prefix="/api")
# ============================================================================

# ============================================================================
# ============================================================================
# SECTION: PRODUCTS & PACKAGING ROUTES - MOVED TO routes/products_packaging.py
# ============================================================================
# The following routes have been extracted to routes/products_packaging.py:
# PRODUCTS:
# - GET /products
# - GET /products/images
# - POST /products
# - PUT /products/{product_id}
# - DELETE /products/{product_id}
# - GET /products/duplicates
# - DELETE /products/duplicates/cleanup
# - POST /products/bulk-update-storage
# - POST /products/set-default-storage
# - GET /products/{product_id}/dependencies
# - POST /products/{product_id}/delete-with-replacement
# - POST /products/upload-image
# - DELETE /products/delete-image
# - POST /products/migrate-images
# UNITS:
# - GET /units
# - POST /units
# - PUT /units/{unit_id}
# - DELETE /units/{unit_id}
# - POST /units/seed-defaults
# CATEGORIES:
# - GET /product-categories
# - POST /product-categories
# - PUT /product-categories/{category_id}
# - DELETE /product-categories/{category_id}
# TYPES:
# - GET /product-types
# - POST /product-types
# - PUT /product-types/{type_id}
# - DELETE /product-types/{type_id}
# QC PACKAGING:
# - GET /qc-packaging
# - POST /qc-packaging
# - PUT /qc-packaging/{packaging_id}
# - DELETE /qc-packaging/{packaging_id}
# - POST /qc-packaging/sync-weights
# Import: from routes import products_packaging_router
# Include: app.include_router(products_packaging_router, prefix="/api")
# ============================================================================

# ============================================================================
# ============================================================================
# SECTION: RETAIL PLANS ROUTES - MOVED TO routes/retail_plans.py
# ============================================================================
# The following routes have been extracted to routes/retail_plans.py:
# - GET /retail-plans
# - POST /retail-plans
# - PUT /retail-plans/{plan_id}
# - DELETE /retail-plans/{plan_id}
# - POST /retail-plans/{plan_id}/products
# - PUT /retail-plans/{plan_id}/products/{product_id}/{variant_id}
# - DELETE /retail-plans/{plan_id}/products/{product_id}/{variant_id}
# - POST /retail-plans/assign
# - DELETE /retail-plans/unassign/{retailer_id}
# - GET /retail-plans/subscribed-retailers
# - POST /retail-plans/generate-orders
# Import: from routes import retail_plans_router
# Include: app.include_router(retail_plans_router, prefix="/api")
# ============================================================================


# ============================================================================
# SECTION: FARMER ROUTES - MOVED TO routes/farmers.py
# ============================================================================
# The following routes have been extracted to routes/farmers.py:
# - GET /farmers
# - POST /farmers
# - PUT /farmers/{farmer_id}
# - DELETE /farmers/{farmer_id}
# Import: from routes import farmers_router
# Include: app.include_router(farmers_router)
# ============================================================================

# ============================================================================
# ============================================================================
# SECTION: PROCUREMENT ROUTES - MOVED TO routes/procurement_new.py
# ============================================================================
# The following routes have been extracted to routes/procurement_new.py:
# PROCUREMENT:
# - GET /procurement
# - GET /procurement/{procurement_id}
# - POST /procurement
# - PUT /procurement/{procurement_id}
# - DELETE /procurement/{procurement_id}
# PROCUREMENT PAYMENTS:
# - GET /procurement-payments
# - GET /procurement/{procurement_id}/payments
# - POST /procurement-payments
# - PUT /procurement-payments/{payment_id}
# - DELETE /procurement-payments/{payment_id}
# - POST /procurement/{procurement_id}/payments/bulk
# - PUT /procurement/{procurement_id}/payment-date
# PROCUREMENT TEMPLATES:
# - GET /procurement-templates
# - POST /procurement-templates
# - PUT /procurement-templates/{template_id}
# - DELETE /procurement-templates/{template_id}
# Import: from routes import procurement_router
# Include: app.include_router(procurement_router, prefix="/api")
# ============================================================================


# ============================================================================
# ============================================================================
# SECTION: QC ORDERS ROUTES - MOVED TO routes/qc_orders_customers.py
# ============================================================================
# The following routes have been extracted to routes/qc_orders_customers.py:
# - GET /qc-orders
# - POST /qc-orders
# - POST /qc-orders/ocr
# Import: from routes import qc_orders_customers_router
# Include: app.include_router(qc_orders_customers_router, prefix="/api")
# ============================================================================

# ============================================================================
# SECTION: QC CUSTOMER ROUTES - MOVED TO routes/qc_orders_customers.py
# ============================================================================
# The following routes have been extracted to routes/qc_orders_customers.py:
# - GET /qc-customers
# - POST /qc-customers
# - PUT /qc-customers/{customer_id}
# - DELETE /qc-customers/{customer_id}
# - GET /customer-product-settings
# - POST /customer-product-settings
# - DELETE /customer-product-settings/{setting_id}
# ============================================================================

# ============================================================================
# SECTION: QC INDENT ROUTES - MOVED TO routes/qc_indents_dispatches.py
# ============================================================================
# The following routes have been extracted to routes/qc_indents_dispatches.py:
# - GET /qc-indents
# - POST /qc-indents
# - PUT /qc-indents/{indent_id}
# - DELETE /qc-indents/{indent_id}
# - GET /qc-indents/previous/{customer_name}
# - POST /qc-indents/ocr
# - POST /qc-indents/create-from-ocr
# ============================================================================

# ============================================================================
# SECTION: QC DISPATCH ROUTES - MOVED TO routes/qc_indents_dispatches.py
# ============================================================================
# The following routes have been extracted to routes/qc_indents_dispatches.py:
# - GET /qc-dispatches
# - POST /qc-dispatches
# - PUT /qc-dispatches/{dispatch_id}
# - DELETE /qc-dispatches/{dispatch_id}
# - DELETE /qc-dispatches/{dispatch_id}/items/{product_id}
# - GET /qc-dispatches/{dispatch_id}/invoice-status
# - PUT /qc-dispatches/{dispatch_id}/items/{item_index}
# - DELETE /qc-dispatches/{dispatch_id}/items-by-index/{item_index}
# ============================================================================

# ============================================================================
# ============================================================================
# SECTION: QC GRN ROUTES - MOVED TO routes/qc_grn.py
# ============================================================================
# The following routes have been extracted to routes/qc_grn.py:
# - GET /qc-grns
# - POST /qc-grns
# - PUT /qc-grns/{grn_id}
# - DELETE /qc-grns/{grn_id}
# - DELETE /qc-grns/{grn_id}/items/{item_index}
# - POST /qc-grns/upload-ninjacart-csv
# - GET /qc-dispatches/calculate-grn-loss
# - GET /qc-grns/loss-summary
# Import: from routes import qc_grn_router
# Include: app.include_router(qc_grn_router, prefix="/api")
# ============================================================================

# ============================================================================
# ============================================================================
# SECTION: QC INVOICE ROUTES - MOVED TO routes/qc_invoices_new.py
# ============================================================================
# The following routes have been extracted to routes/qc_invoices_new.py:
# - GET /qc-invoices
# - GET /qc-invoices/next-number/{customer_name}/{invoice_date}
# - POST /qc-invoices
# - PUT /qc-invoices/{invoice_id}
# - DELETE /qc-invoices/{invoice_id}
# Import: from routes import qc_invoices_router
# Include: app.include_router(qc_invoices_router, prefix="/api")
# ============================================================================

# ============================================================================
# ============================================================================
# SECTION: RETAILER ORDER ROUTES - MOVED TO routes/retailer_orders_wastage.py
# ============================================================================
# The following routes have been extracted to routes/retailer_orders_wastage.py:
# - GET /retailer-orders
# - POST /retailer-orders
# - PUT /retailer-orders/{order_id}/status
# - GET /rejections
# - POST /rejections
# - GET /wastage
# - POST /wastage
# - DELETE /wastage/{wastage_id}
# - GET /payments
# - POST /payments
# - GET /invoices
# - POST /invoices
# Import: from routes import retailer_orders_wastage_router
# Include: app.include_router(retailer_orders_wastage_router, prefix="/api")
# ============================================================================

# ============================================================================
# SECTION: DASHBOARD & ANALYTICS ROUTES - MOVED TO routes/dashboard_analytics.py
# ============================================================================
# This massive section (~4,400 lines) has been extracted to routes/dashboard_analytics.py
# Includes:
# - Dashboard stats and reports
# - P&L reports with daily/monthly/yearly breakdowns
# - Daily Purchase Requirements (DPR)
# - Retailer Indents management
# - Retailer Dispatches management
# - Retailer Invoices management
# - Closing Inventory tracking
# - Stickers & MRP management
# - Auto-indent generation (historical sales & plan-based)
# - Various analytics and export endpoints
# Import: from routes import dashboard_analytics_router
# Include: app.include_router(dashboard_analytics_router, prefix="/api")
# ============================================================================

# ============================================================================
# SECTION: RETAILER PORTAL ROUTES - MOVED TO routes/retailer_portal.py
# ============================================================================
# This massive section (~6,850 lines) has been extracted to routes/retailer_portal.py
# Includes:
# - Retailer management and catalogue
# - Retailer Indents (CRUD, OCR, auto-generation)
# - Retailer Dispatches (CRUD, batch operations)
# - Retailer GRN (Goods Receipt Note)
# - Retailer Rejections and Returns
# - Retailer Payments and Credit Notes
# - Retailer Invoices with PDF generation
# - Commission calculations
# - Retailer-specific analytics
# Import: from routes import retailer_portal_router
# Include: app.include_router(retailer_portal_router, prefix="/api")
# ============================================================================

# Include modular routers (refactored from server.py)
app.include_router(auth_router, prefix="/api")
app.include_router(labour_router)
app.include_router(health_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(farmers_router)  # has /api prefix built-in
app.include_router(qc_orders_customers_router, prefix="/api")
app.include_router(qc_indents_dispatches_router, prefix="/api")
app.include_router(qc_invoices_router, prefix="/api")
app.include_router(products_packaging_router, prefix="/api")
app.include_router(qc_grn_router, prefix="/api")
app.include_router(retail_plans_router, prefix="/api")
app.include_router(procurement_router, prefix="/api")
app.include_router(retailer_orders_wastage_router, prefix="/api")
app.include_router(expenses_router, prefix="/api")
app.include_router(backup_data_router, prefix="/api")
app.include_router(gmail_integration_router, prefix="/api")
app.include_router(dashboard_analytics_router, prefix="/api")
app.include_router(retailer_portal_router, prefix="/api")
app.include_router(daily_cogs_router)  # Daily COGS tracking

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


# ============================================================================
# STARTUP SEED FUNCTIONS
# ============================================================================
async def seed_default_units_on_startup():
    """Seed default units if none exist (called on startup)"""
    existing_count = await db.units.count_documents({})
    if existing_count > 0:
        return  # Units already exist
    
    default_units = [
        {"name": "Kg", "symbol": "Kg", "description": "Kilogram - standard weight unit"},
        {"name": "Gram", "symbol": "g", "description": "Gram - small weight unit"},
        {"name": "Piece", "symbol": "Pc", "description": "Individual piece/item"},
        {"name": "Pieces", "symbol": "Pcs", "description": "Multiple pieces/items"},
        {"name": "Bunch", "symbol": "Bunch", "description": "Bundle of items tied together"},
        {"name": "Packet", "symbol": "Pkt", "description": "Packaged unit"},
        {"name": "Box", "symbol": "Box", "description": "Box container"},
        {"name": "Crate", "symbol": "Crate", "description": "Crate container"},
        {"name": "Dozen", "symbol": "Dz", "description": "12 pieces"},
        {"name": "Litre", "symbol": "L", "description": "Liquid volume unit"},
    ]
    
    for unit in default_units:
        unit["id"] = str(uuid.uuid4())
        unit["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.units.insert_one(unit)
    
    logger.info(f"Seeded {len(default_units)} default units")


async def seed_default_categories_types_on_startup():
    """Seed default product categories and types if none exist (called on startup)"""
    # Seed product categories
    cat_count = await db.product_categories.count_documents({})
    if cat_count == 0:
        default_categories = [
            "Leafy Greens",
            "Fruits",
            "Root Vegetables",
            "Gourds",
            "Beans & Legumes",
            "Herbs",
            "Exotic Vegetables",
            "Mushrooms",
            "Salad Greens",
            "Other"
        ]
        for cat_name in default_categories:
            cat_doc = {
                "id": str(uuid.uuid4()),
                "name": cat_name,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.product_categories.insert_one(cat_doc)
        logger.info(f"Seeded {len(default_categories)} default product categories")
    
    # Seed product types
    type_count = await db.product_types.count_documents({})
    if type_count == 0:
        default_types = [
            "Fresh",
            "Organic",
            "Hydroponic",
            "Imported",
            "Local",
            "Seasonal",
            "Premium"
        ]
        for type_name in default_types:
            type_doc = {
                "id": str(uuid.uuid4()),
                "name": type_name,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.product_types.insert_one(type_doc)
        logger.info(f"Seeded {len(default_types)} default product types")


async def compute_daily_cogs_scheduled():
    """
    Scheduled job to compute and persist daily COGS for the current day.
    Runs at 23:55 IST daily to ensure daily_cogs collection stays current.
    """
    try:
        from datetime import datetime, timezone, timedelta
        
        # Get current date in IST (UTC+5:30)
        utc_now = datetime.now(timezone.utc)
        ist_offset = timedelta(hours=5, minutes=30)
        ist_now = utc_now + ist_offset
        date_str = ist_now.strftime("%Y-%m-%d")
        
        logger.info(f"[DAILY_COGS_SCHEDULER] Starting daily COGS computation for {date_str}")
        
        # Compute COGS for today - returns dict directly {product: data}
        result = await compute_daily_cogs_for_date(db, date_str)
        
        # Save the computed COGS to the database
        if result:
            await save_daily_cogs(db, result)
            logger.info(f"[DAILY_COGS_SCHEDULER] Saved daily COGS for {len(result)} products")
        
        logger.info(f"[DAILY_COGS_SCHEDULER] Completed daily COGS computation for {date_str}")
        
    except Exception as e:
        logger.error(f"[DAILY_COGS_SCHEDULER] Error computing daily COGS: {e}")
        import traceback
        traceback.print_exc()


@app.on_event("startup")
async def startup_event():
    """Initialize backup scheduler, Gmail sync scheduler, and seed default data on startup"""
    global backup_scheduler
    
    # Test MongoDB connection first
    try:
        logger.info("Testing MongoDB connection...")
        await log_connection_stats()
        test_count = await db.products.count_documents({})
        logger.info(f"MongoDB connection OK - {test_count} products found")
    except Exception as e:
        logger.error(f"MongoDB connection FAILED on startup: {e}")
        # Don't raise - let the app start anyway, it might recover
    
    try:
        # Create database indexes for performance
        logger.info("Creating database indexes for performance...")
        try:
            # Retailer indents - frequently queried by date and retailer
            await db.retailer_indents.create_index("indent_date")
            await db.retailer_indents.create_index("retailer_id")
            await db.retailer_indents.create_index("status")
            await db.retailer_indents.create_index([("indent_date", -1), ("retailer_id", 1)])
            
            # Retailer dispatches - frequently queried by date and indent
            await db.retailer_dispatches.create_index("dispatch_date")
            await db.retailer_dispatches.create_index("indent_id")
            await db.retailer_dispatches.create_index("retailer_id")
            await db.retailer_dispatches.create_index([("dispatch_date", -1), ("retailer_id", 1)])
            
            # Retailer invoices
            await db.retailer_invoices.create_index("invoice_date")
            await db.retailer_invoices.create_index("retailer_id")
            await db.retailer_invoices.create_index("status")
            
            # QC collections
            await db.qc_indents.create_index("indent_date")
            await db.qc_dispatches.create_index("dispatch_date")
            await db.qc_invoices.create_index("created_at")
            await db.qc_invoices.create_index("invoice_date")
            await db.qc_grns.create_index("created_at")
            await db.qc_grns.create_index("grn_date")
            
            # Products
            await db.products.create_index("name")
            await db.products.create_index("category")
            
            # Procurements
            await db.procurements.create_index("procurement_date")
            await db.procurements.create_index("farmer_id")
            await db.procurements.create_index("date")
            
            # Wastage
            await db.wastage.create_index("date")
            
            # Rejections
            await db.rejections.create_index("date")
            
            # Retailer rejections
            await db.retailer_rejections.create_index("rejection_date")
            await db.retailer_rejections.create_index("retailer_id")
            await db.retailer_rejections.create_index([("rejection_date", -1), ("retailer_id", 1)])
            
            # Retailer payments
            await db.retailer_payments.create_index("payment_date")
            await db.retailer_payments.create_index("retailer_id")
            await db.retailer_payments.create_index([("payment_date", -1), ("retailer_id", 1)])
            
            # QC Orders
            await db.qc_orders.create_index("order_date")
            
            logger.info("Database indexes created successfully")
        except Exception as idx_error:
            logger.warning(f"Index creation warning (may already exist): {idx_error}")
        
        # Auto-seed default units if collection is empty
        await seed_default_units_on_startup()
        
        # Auto-seed default categories and types if collections are empty
        await seed_default_categories_types_on_startup()
        
        # Initialize default retail plans
        await initialize_default_plans()
        
        # Migrate existing retailers to have upfront_collection_percentage = 50
        try:
            result = await db.users.update_many(
                {"role": "retailer", "upfront_collection_percentage": {"$exists": False}},
                {"$set": {"upfront_collection_percentage": 50}}
            )
            if result.modified_count > 0:
                logger.info(f"Migrated {result.modified_count} retailers to 50% upfront collection")
        except Exception as e:
            logger.warning(f"Retailer migration warning: {e}")
        
        # Create index for credit notes
        try:
            await db.retailer_credit_notes.create_index("retailer_id")
            await db.retailer_credit_notes.create_index("status")
            await db.retailer_credit_notes.create_index("original_invoice_id")
            await db.retailer_credit_notes.create_index([("created_at", -1)])
        except Exception as e:
            logger.warning(f"Credit notes index creation warning: {e}")
        
        # One-time migration: Fix credit notes where status is 'adjusted' but adjusted_amount is 0
        try:
            affected = await db.retailer_credit_notes.find({
                "status": {"$in": ["adjusted", "partial"]},
                "$or": [
                    {"adjusted_amount": 0},
                    {"adjusted_amount": None},
                    {"adjusted_amount": {"$exists": False}}
                ],
                "pending_amount": {"$lte": 0.01}  # Only fix those that are actually adjusted
            }).to_list(1000)
            
            if affected:
                for cn in affected:
                    amount = cn.get("amount", 0)
                    pending = cn.get("pending_amount", 0)
                    adjusted = round(amount - pending, 2)
                    
                    if adjusted > 0:
                        await db.retailer_credit_notes.update_one(
                            {"id": cn["id"]},
                            {"$set": {"adjusted_amount": adjusted}}
                        )
                logger.info(f"Fixed {len(affected)} credit notes with missing adjusted_amount")
        except Exception as e:
            logger.warning(f"Credit notes adjusted_amount migration warning: {e}")
        
        backup_scheduler = setup_backup_scheduler(db)
        logger.info("Backup scheduler initialized successfully")
        
        # Add Gmail GRN sync job at 6 AM IST (00:30 UTC)
        # IST is UTC+5:30, so 6:00 AM IST = 00:30 UTC
        backup_scheduler.add_job(
            scheduled_gmail_sync,
            CronTrigger(hour=0, minute=30),  # 6:00 AM IST
            id='gmail_grn_sync',
            replace_existing=True,
            misfire_grace_time=3600  # Allow 1 hour grace period
        )
        logger.info("Gmail GRN sync scheduled for 6:00 AM IST daily")
        
        # Add Auto-Indent generation job at 11 PM IST (17:30 UTC)
        # IST is UTC+5:30, so 11:00 PM IST = 17:30 UTC
        backup_scheduler.add_job(
            generate_auto_indents_wrapper,
            CronTrigger(hour=17, minute=30),  # 11:00 PM IST
            id='auto_indent_generation',
            replace_existing=True,
            misfire_grace_time=3600  # Allow 1 hour grace period
        )
        logger.info("Auto-indent generation scheduled for 11:00 PM IST daily")
        
        # Add Blinkit Price Scraper job at 6 AM IST (00:30 UTC)
        # IST is UTC+5:30, so 6:00 AM IST = 00:30 UTC
        backup_scheduler.add_job(
            run_blinkit_scrape_scheduled,
            CronTrigger(hour=0, minute=30),  # 6:00 AM IST
            id='blinkit_price_scrape',
            replace_existing=True,
            misfire_grace_time=3600  # Allow 1 hour grace period
        )
        logger.info("Blinkit price scraper scheduled for 6:00 AM IST daily")
        
        # Add Daily COGS computation job at 11:55 PM IST (18:25 UTC)
        # IST is UTC+5:30, so 11:55 PM IST = 18:25 UTC
        # This ensures daily_cogs collection stays current with today's data
        backup_scheduler.add_job(
            compute_daily_cogs_scheduled,
            CronTrigger(hour=18, minute=25),  # 11:55 PM IST
            id='daily_cogs_computation',
            replace_existing=True,
            misfire_grace_time=3600  # Allow 1 hour grace period
        )
        logger.info("Daily COGS computation scheduled for 11:55 PM IST daily")
        
        # Check if we missed the 6 AM sync today and run it now
        await check_and_run_missed_gmail_sync()
        
        # Log all scheduled jobs for debugging
        jobs = backup_scheduler.get_jobs()
        for job in jobs:
            logger.info(f"Scheduled job: {job.id} - Next run: {job.next_run_time}")
            
    except Exception as e:
        logger.error(f"Failed to initialize schedulers: {e}")
        import traceback
        traceback.print_exc()


async def check_and_run_missed_gmail_sync():
    """Check if we missed today's 6 AM sync and run it if needed"""
    try:
        # Get the last sync time from settings or sync history
        settings = await db.gmail_settings.find_one({}, {"_id": 0})
        last_sync = settings.get("last_sync_time") if settings else None
        
        if last_sync:
            # Parse the last sync time
            if isinstance(last_sync, str):
                last_sync_dt = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            else:
                last_sync_dt = last_sync
            
            # Get today's 6 AM IST (00:30 UTC)
            now = datetime.now(timezone.utc)
            today_6am_ist = now.replace(hour=0, minute=30, second=0, microsecond=0)
            
            # If it's past 6 AM IST today and last sync was before today's 6 AM
            if now > today_6am_ist and last_sync_dt < today_6am_ist:
                logger.info(f"Missed 6 AM sync. Last sync: {last_sync_dt}, Running now...")
                await scheduled_gmail_sync()
                logger.info("Catch-up sync completed")
        else:
            logger.info("No previous sync found, skipping catch-up check")
            
    except Exception as e:
        logger.error(f"Error checking missed sync: {e}")

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




# ==================== RETAILER INVENTORY ENDPOINTS ====================

@app.get("/api/retailer-inventory/{retailer_id}")
async def get_retailer_inventory(
    retailer_id: str,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get retailer inventory for a specific date or all dates"""
    query = {"retailer_id": retailer_id}
    if date:
        query["date"] = date
    
    inventory = await db.retailer_inventory.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return inventory

@app.post("/api/retailer-inventory/generate/{retailer_id}")
async def generate_retailer_inventory(
    retailer_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user)
):
    """Generate inventory items from dispatches for a specific date"""
    from models import RetailerInventoryItem
    
    # Check if inventory already exists for this date
    existing = await db.retailer_inventory.find_one({"retailer_id": retailer_id, "date": date})
    if existing:
        return {"message": "Inventory already exists for this date", "exists": True}
    
    # Get dispatches for this retailer on this date
    dispatches = await db.retailer_dispatches.find({
        "retailer_id": retailer_id,
        "dispatch_date": {"$regex": f"^{date}"}
    }).to_list(100)
    
    if not dispatches:
        return {"message": "No dispatches found for this date", "items_created": 0}
    
    # Get previous day's inventory to calculate opening qty
    prev_date = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_inventory = await db.retailer_inventory.find(
        {"retailer_id": retailer_id, "date": prev_date}, {"_id": 0}
    ).to_list(500)
    prev_closing = {(i["product_id"], i.get("variant_name", "")): i.get("closing_qty", 0) for i in prev_inventory}
    
    # Aggregate items from all dispatches
    items_map = {}
    for dispatch in dispatches:
        for item in dispatch.get("items", []):
            product_id = item.get("product_id", "")
            variant = item.get("variant_name", "")
            key = (product_id, variant)
            
            if key not in items_map:
                items_map[key] = {
                    "product_id": product_id,
                    "product_name": item.get("product_name", ""),
                    "variant_name": variant,
                    "received_qty": 0
                }
            items_map[key]["received_qty"] += item.get("supplied_qty", 0)
    
    # Create inventory items
    created_items = []
    for key, item_data in items_map.items():
        opening_qty = prev_closing.get(key, 0)
        received_qty = item_data["received_qty"]
        
        inventory_item = RetailerInventoryItem(
            retailer_id=retailer_id,
            product_id=item_data["product_id"],
            product_name=item_data["product_name"],
            variant_name=item_data["variant_name"],
            date=date,
            opening_qty=opening_qty,
            received_qty=received_qty,
            sold_qty=0,
            wastage_qty=0,
            closing_qty=opening_qty + received_qty  # Initial closing = opening + received
        )
        
        await db.retailer_inventory.insert_one(inventory_item.model_dump())
        created_items.append(inventory_item.model_dump())
    
    return {"message": f"Created {len(created_items)} inventory items", "items_created": len(created_items), "items": created_items}

@app.put("/api/retailer-inventory/{item_id}")
async def update_retailer_inventory_item(
    item_id: str,
    update: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update inventory item (sold_qty, wastage_qty, closing_qty, remarks)"""
    from datetime import datetime, timezone
    
    # Get current item
    item = await db.retailer_inventory.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    
    # Calculate closing qty if sold/wastage updated
    opening = item.get("opening_qty", 0)
    received = item.get("received_qty", 0)
    sold = update.get("sold_qty", item.get("sold_qty", 0))
    wastage = update.get("wastage_qty", item.get("wastage_qty", 0))
    closing = opening + received - sold - wastage
    
    update_data = {
        "sold_qty": sold,
        "wastage_qty": wastage,
        "closing_qty": closing,
        "remarks": update.get("remarks", item.get("remarks")),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.retailer_inventory.update_one(
        {"id": item_id},
        {"$set": update_data}
    )
    
    # Return updated item
    updated = await db.retailer_inventory.find_one({"id": item_id}, {"_id": 0})
    return updated

@app.delete("/api/retailer-inventory/{item_id}")
async def delete_retailer_inventory_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an inventory item"""
    result = await db.retailer_inventory.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return {"message": "Item deleted successfully"}

@app.get("/api/retailer-inventory/dates/{retailer_id}")
async def get_retailer_inventory_dates(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of dates that have inventory data for a retailer"""
    pipeline = [
        {"$match": {"retailer_id": retailer_id}},
        {"$group": {"_id": "$date"}},
        {"$sort": {"_id": -1}},
        {"$limit": 30}
    ]
    dates = await db.retailer_inventory.aggregate(pipeline).to_list(30)
    return [d["_id"] for d in dates]


@app.post("/api/retailer-inventory/add-item")
async def add_retailer_inventory_item(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Add a single inventory item manually"""
    from models import RetailerInventoryItem
    
    retailer_id = data.get("retailer_id")
    product_id = data.get("product_id")
    product_name = data.get("product_name")
    variant_name = data.get("variant_name", "")
    date = data.get("date")
    opening_qty = float(data.get("opening_qty", 0))
    received_qty = float(data.get("received_qty", 0))
    
    if not retailer_id or not product_id or not date:
        raise HTTPException(status_code=400, detail="retailer_id, product_id, and date are required")
    
    # Check if item already exists
    existing = await db.retailer_inventory.find_one({
        "retailer_id": retailer_id,
        "product_id": product_id,
        "variant_name": variant_name or "",
        "date": date
    })
    if existing:
        raise HTTPException(status_code=400, detail="Item already exists for this product and date")
    
    inventory_item = RetailerInventoryItem(
        retailer_id=retailer_id,
        product_id=product_id,
        product_name=product_name,
        variant_name=variant_name,
        date=date,
        opening_qty=opening_qty,
        received_qty=received_qty,
        sold_qty=0,
        wastage_qty=0,
        closing_qty=opening_qty + received_qty
    )
    
    await db.retailer_inventory.insert_one(inventory_item.model_dump())
    return {"message": "Item added successfully", "item": inventory_item.model_dump()}


@app.post("/api/retailer-inventory/save-all")
async def save_all_retailer_inventory(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Bulk save multiple inventory items"""
    from datetime import datetime, timezone
    
    items = data.get("items", [])
    if not items:
        return {"message": "No items to save", "updated": 0}
    
    updated_count = 0
    for item in items:
        item_id = item.get("id")
        if not item_id:
            continue
            
        # Get current item
        current_item = await db.retailer_inventory.find_one({"id": item_id})
        if not current_item:
            continue
        
        # Calculate closing qty
        opening = current_item.get("opening_qty", 0)
        received = current_item.get("received_qty", 0)
        sold = item.get("sold_qty", current_item.get("sold_qty", 0))
        wastage = item.get("wastage_qty", current_item.get("wastage_qty", 0))
        closing = opening + received - sold - wastage
        
        update_data = {
            "sold_qty": sold,
            "wastage_qty": wastage,
            "closing_qty": closing,
            "remarks": item.get("remarks", current_item.get("remarks")),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.retailer_inventory.update_one(
            {"id": item_id},
            {"$set": update_data}
        )
        updated_count += 1
    
    return {"message": f"Saved {updated_count} items", "updated": updated_count}


# ============== SIMPLIFIED CLOSING INVENTORY SYSTEM ==============

@app.get("/api/retailer/product-variants/{retailer_id}")
async def get_retailer_product_variants(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get product variants that this retailer has received in dispatches.
    Returns products grouped with their packaging variants.
    """
    # Get retailer dispatches from last 30 days
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    
    dispatches = await db.retailer_dispatches.find({
        "retailer_id": retailer_id
    }, {"_id": 0}).to_list(500)
    
    # Build product -> variants mapping from dispatch items
    # Note: Field names are variant_id and variant_name (not packaging_id/packaging_name)
    product_variants = {}
    
    for d in dispatches:
        for item in d.get('items', []):
            product_id = item.get('product_id')
            product_name = item.get('product_name')
            # Use variant_id/variant_name fields from retailer dispatch
            variant_id = item.get('variant_id') or item.get('packaging_id')
            variant_name = item.get('variant_name') or item.get('packaging_name') or 'Kg'
            
            if not product_id:
                continue
            
            if product_id not in product_variants:
                # Get product info for Hindi name
                product = await db.products.find_one({"id": product_id}, {"_id": 0, "name_hi": 1, "unit": 1})
                product_variants[product_id] = {
                    'product_id': product_id,
                    'product_name': product_name,
                    'product_name_hi': product.get('name_hi') if product else None,
                    'unit': product.get('unit', 'Kg') if product else 'Kg',
                    'variants': {}
                }
            
            # Track variant by variant_id or name
            variant_key = variant_id or variant_name
            if variant_key not in product_variants[product_id]['variants']:
                product_variants[product_id]['variants'][variant_key] = {
                    'variant_id': variant_id,
                    'variant_name': variant_name,
                    'received_count': 0,
                    'total_qty': 0
                }
            product_variants[product_id]['variants'][variant_key]['received_count'] += 1
            product_variants[product_id]['variants'][variant_key]['total_qty'] += item.get('supplied_qty', 0)
    
    # Convert to list format for frontend
    result = []
    for pid, pdata in sorted(product_variants.items(), key=lambda x: x[1]['product_name']):
        variants = list(pdata['variants'].values())
        # If no specific variants (all 'Kg'), keep as single item
        if len(variants) == 1 and variants[0]['variant_name'] == 'Kg':
            result.append({
                'product_id': pdata['product_id'],
                'product_name': pdata['product_name'],
                'product_name_hi': pdata['product_name_hi'],
                'variant_id': None,
                'variant_name': 'Kg',
                'unit': pdata['unit'],
                'has_variants': False
            })
        else:
            # Multiple variants - add each as separate item
            for v in variants:
                result.append({
                    'product_id': pdata['product_id'],
                    'product_name': pdata['product_name'],
                    'product_name_hi': pdata['product_name_hi'],
                    'variant_id': v['variant_id'],
                    'variant_name': v['variant_name'],
                    'unit': 'Pcs',  # Variants are typically counted in pieces
                    'has_variants': True
                })
    
    return result


# IMPORTANT: This route must be BEFORE the {retailer_id} route to prevent route matching issues
@app.get("/api/retailer-closing-inventory/today-summary")
async def get_todays_closing_summary(current_user: dict = Depends(get_current_user)):
    """Get summary of all retailers' closing inventory for today"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get all closing inventory records for today
    closings = await db.retailer_closing_inventory.find(
        {"closing_date": today},
        {"_id": 0}
    ).to_list(1000)
    
    # Aggregate by retailer
    retailer_summary = {}
    retailer_ids_needing_names = set()
    
    for item in closings:
        retailer_id = item.get("retailer_id")
        if retailer_id not in retailer_summary:
            retailer_name = item.get("retailer_name")
            if not retailer_name or retailer_name == "Unknown":
                retailer_ids_needing_names.add(retailer_id)
                retailer_name = "Unknown"
            retailer_summary[retailer_id] = {
                "retailer_id": retailer_id,
                "retailer_name": retailer_name,
                "total_items": 0,
                "total_qty": 0,
                "status": "complete"
            }
        retailer_summary[retailer_id]["total_items"] += 1
        retailer_summary[retailer_id]["total_qty"] += item.get("closing_qty", 0) or 0
    
    # Look up retailer names for any that were missing
    if retailer_ids_needing_names:
        retailers = await db.users.find(
            {"id": {"$in": list(retailer_ids_needing_names)}},
            {"_id": 0, "id": 1, "name": 1, "company_name": 1}
        ).to_list(100)
        retailer_name_map = {r["id"]: r.get("company_name") or r.get("name", "Unknown") for r in retailers}
        
        for retailer_id in retailer_ids_needing_names:
            if retailer_id in retailer_summary and retailer_id in retailer_name_map:
                retailer_summary[retailer_id]["retailer_name"] = retailer_name_map[retailer_id]
    
    # Get list of all retailers who have had dispatches today but haven't recorded closing
    # Use $or to handle both string dates (ISO format) and regex patterns
    retailers_with_dispatch = await db.retailer_dispatches.distinct(
        "retailer_id",
        {"$or": [
            {"dispatch_date": {"$regex": f"^{today}"}},
            {"dispatch_date": {"$gte": today + "T00:00:00", "$lte": today + "T23:59:59"}}
        ]}
    )
    
    # Also get retailers who have indents for today (even if not dispatched yet)
    retailers_with_indent = await db.retailer_indents.distinct(
        "retailer_id",
        {"$or": [
            {"indent_date": {"$regex": f"^{today}"}},
            {"indent_date": today},
            {"indent_date": {"$gte": today + "T00:00:00", "$lte": today + "T23:59:59"}}
        ]}
    )
    
    # Combine both sets
    all_active_retailers = set(retailers_with_dispatch) | set(retailers_with_indent)
    
    # Get retailer names for those who haven't closed
    for retailer_id in all_active_retailers:
        if retailer_id not in retailer_summary:
            retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0, "name": 1, "company_name": 1})
            if retailer:
                retailer_summary[retailer_id] = {
                    "retailer_id": retailer_id,
                    "retailer_name": retailer.get("company_name") or retailer.get("name", "Unknown"),
                    "total_items": 0,
                    "total_qty": 0,
                    "status": "pending"
                }
    
    # Convert to list and sort by retailer name
    result = list(retailer_summary.values())
    result.sort(key=lambda x: x.get("retailer_name", ""))
    
    return {
        "date": today,
        "retailers": result,
        "total_retailers": len(result),
        "completed_count": sum(1 for r in result if r["status"] == "complete"),
        "pending_count": sum(1 for r in result if r["status"] == "pending")
    }


@app.get("/api/retailer-closing-inventory/{retailer_id}")
async def get_retailer_closing_inventory(
    retailer_id: str,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get closing inventory for a retailer on a specific date"""
    query = {"retailer_id": retailer_id}
    if date:
        query["closing_date"] = date
    
    # Get closing inventory records
    closing_records = await db.retailer_closing_inventory.find(query, {"_id": 0}).sort("closing_date", -1).to_list(500)
    return closing_records

@app.get("/api/retailer-closing-inventory/dates/{retailer_id}")
async def get_retailer_closing_inventory_dates(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of dates that have closing inventory recorded"""
    pipeline = [
        {"$match": {"retailer_id": retailer_id}},
        {"$group": {"_id": "$closing_date"}},
        {"$sort": {"_id": -1}},
        {"$limit": 60}
    ]
    dates = await db.retailer_closing_inventory.aggregate(pipeline).to_list(60)
    return [d["_id"] for d in dates]

@app.post("/api/retailer-closing-inventory/record")
async def record_retailer_closing_inventory(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Record closing inventory for a retailer.
    Expects: {
        "retailer_id": str,
        "closing_date": str (YYYY-MM-DD),
        "items": [{"product_id": str, "product_name": str, "variant_id": str (optional), 
                   "variant_name": str (optional), "closing_qty": number or null}, ...]
    }
    """
    retailer_id = data.get("retailer_id")
    closing_date = data.get("closing_date")
    items = data.get("items", [])
    
    if not retailer_id or not closing_date:
        raise HTTPException(status_code=400, detail="retailer_id and closing_date are required")
    
    # Get retailer name for the summary
    retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0, "name": 1, "company_name": 1})
    retailer_name = retailer.get("company_name") or retailer.get("name", "Unknown") if retailer else "Unknown"
    
    # Delete existing closing inventory for this date and retailer
    await db.retailer_closing_inventory.delete_many({
        "retailer_id": retailer_id,
        "closing_date": closing_date
    })
    
    # Insert new closing inventory items
    saved_count = 0
    for item in items:
        closing_qty = item.get("closing_qty")
        
        # Only save items that have a closing qty value (not null, not empty string)
        if closing_qty is not None and closing_qty != "" and closing_qty != "":
            try:
                closing_qty_num = float(closing_qty)
            except (ValueError, TypeError):
                continue  # Skip invalid values
            
            inventory_record = {
                "id": str(uuid.uuid4()),
                "retailer_id": retailer_id,
                "retailer_name": retailer_name,  # Store retailer name for summary
                "closing_date": closing_date,
                "product_id": item.get("product_id"),
                "product_name": item.get("product_name"),
                "variant_id": item.get("variant_id"),
                "variant_name": item.get("variant_name") or "Kg",
                "closing_qty": closing_qty_num,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user.get("user_id")
            }
            await db.retailer_closing_inventory.insert_one(inventory_record)
            saved_count += 1
    
    return {
        "message": f"Recorded closing inventory for {closing_date}",
        "items_saved": saved_count
    }

@app.get("/api/retailer-closing-inventory/summary/{retailer_id}")
async def get_retailer_closing_summary(
    retailer_id: str,
    date: str,
    filter_inactive: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Get full inventory summary including opening, received, rejection, and closing"""
    
    # Parse the date
    try:
        from datetime import timedelta
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
        prev_date = target_date - timedelta(days=1)
        prev_date_str = prev_date.strftime("%Y-%m-%d")
    except:
        prev_date_str = None
    
    # Get closing inventory for this date
    closing_items = await db.retailer_closing_inventory.find(
        {"retailer_id": retailer_id, "closing_date": date},
        {"_id": 0}
    ).to_list(500)
    
    # Get previous day's closing (for opening qty)
    # Build multiple lookup maps: one with variant, one without (product-level)
    prev_closing = {}
    prev_closing_product_only = {}  # Fallback for variant-to-product matching
    if prev_date_str:
        prev_items = await db.retailer_closing_inventory.find(
            {"retailer_id": retailer_id, "closing_date": prev_date_str},
            {"_id": 0}
        ).to_list(500)
        for item in prev_items:
            product_id = item.get('product_id')
            variant_id = item.get('variant_id')
            closing_qty = item.get("closing_qty", 0)
            
            # Key with variant (or 'default' if no variant)
            key = f"{product_id}_{variant_id or 'default'}"
            prev_closing[key] = closing_qty
            
            # Also store product-level aggregate for fallback
            # If multiple variants exist, sum them up (though typically there's one)
            if product_id not in prev_closing_product_only:
                prev_closing_product_only[product_id] = 0
            prev_closing_product_only[product_id] += closing_qty
    
    # Get dispatches for this date (received qty) and build variant name map from ALL dispatches
    dispatches = await db.retailer_dispatches.find({
        "retailer_id": retailer_id
    }, {"_id": 0}).to_list(500)
    
    received_qty = {}
    variant_name_map = {}  # Map to store best variant names from all dispatches
    dispatch_linkage = {}  # Track which dispatches each product+variant is linked to
    
    for d in dispatches:
        dispatch_date = str(d.get('dispatch_date', ''))[:10]
        dispatch_id = d.get('id')
        
        for item in d.get('items', []):
            product_id = item.get('product_id')
            variant_id = item.get('variant_id') or item.get('packaging_id')
            key = f"{product_id}_{variant_id or 'default'}"
            
            # Store variant name from any dispatch (prefer non-Kg names)
            variant_name = item.get('variant_name') or item.get('packaging_name') or 'Kg'
            if variant_name and variant_name != 'Kg':
                variant_name_map[key] = variant_name
            elif key not in variant_name_map:
                variant_name_map[key] = variant_name
            
            # Track dispatch linkage for all dates
            if key not in dispatch_linkage:
                dispatch_linkage[key] = []
            dispatch_linkage[key].append({
                'dispatch_id': dispatch_id,
                'dispatch_date': dispatch_date,
                'variant_name': variant_name
            })
            
            # Only count received qty for the target date
            if dispatch_date == date:
                if key not in received_qty:
                    received_qty[key] = {
                        'qty': 0,
                        'product_name': item.get('product_name'),
                        'variant_id': variant_id,
                        'variant_name': variant_name,
                        'dispatch_dates': []
                    }
                received_qty[key]['qty'] += item.get('supplied_qty', 0) or 0
                if dispatch_date not in received_qty[key]['dispatch_dates']:
                    received_qty[key]['dispatch_dates'].append(dispatch_date)
    
    # Get rejections for this date
    rejections = await db.retailer_rejections.find({
        "retailer_id": retailer_id,
        "rejection_date": {"$regex": f"^{date}"}
    }, {"_id": 0}).to_list(500)
    
    rejection_qty = {}
    for r in rejections:
        product_id = r.get('product_id')
        key = f"{product_id}_default"  # Rejections may not have variants
        rejection_qty[key] = rejection_qty.get(key, 0) + (r.get('quantity', 0) or 0)
    
    # Build comprehensive result - deduplicate by product_id + variant_name (not variant_id)
    # This prevents duplicates when same variant name has different IDs
    result = []
    seen_product_variants = {}  # Track by product_id + variant_name for deduplication
    
    # Get ALL products to include in the result
    all_products = await db.products.find({}, {"_id": 0}).to_list(500)
    
    # First: Add all products from the product list (even those without activity)
    for product in all_products:
        product_id = product.get('id')
        key = f"{product_id}_default"
        dedup_key = f"{product_id}_Kg"
        
        # Get opening from previous day
        opening = prev_closing.get(key, 0)
        if opening == 0 and product_id in prev_closing_product_only:
            opening = prev_closing_product_only.get(product_id, 0)
        
        recv = received_qty.get(key, {}).get('qty', 0)
        rej = rejection_qty.get(f"{product_id}_default", 0)
        linked_dispatches = dispatch_linkage.get(key, [])
        
        result.append({
            "id": None,  # No closing record yet for products without activity
            "product_id": product_id,
            "product_name": product.get("name"),
            "product_name_hi": product.get("name_hi"),
            "variant_id": None,
            "variant_name": "Kg",
            "opening_qty": opening,
            "received_qty": recv,
            "rejection_qty": rej,
            "closing_qty": None,
            "linked_dispatches": linked_dispatches[:5] if linked_dispatches else []
        })
        seen_product_variants[dedup_key] = len(result) - 1
    
    # Then: Update/add closing items with actual recorded closing data
    for item in closing_items:
        product_id = item.get('product_id')
        variant_id = item.get('variant_id')
        key = f"{product_id}_{variant_id or 'default'}"
        
        # Get variant name for deduplication
        stored_variant = item.get("variant_name", "Kg")
        dispatch_variant = received_qty.get(key, {}).get('variant_name')
        map_variant = variant_name_map.get(key)
        
        # Priority: dispatch_variant (today) > map_variant (any day) > stored_variant
        final_variant_name = stored_variant
        if (stored_variant == "Kg" or not stored_variant):
            if dispatch_variant and dispatch_variant != "Kg":
                final_variant_name = dispatch_variant
            elif map_variant and map_variant != "Kg":
                final_variant_name = map_variant
        
        # Deduplicate by product_id + variant_name
        dedup_key = f"{product_id}_{final_variant_name}"
        if dedup_key in seen_product_variants:
            # Update existing entry with closing data
            existing_idx = seen_product_variants[dedup_key]
            existing = result[existing_idx]
            
            # Update with the closing record ID
            if item.get("id"):
                existing["id"] = item.get("id")
            
            # Update quantities from closing record
            existing["closing_qty"] = item.get("closing_qty")
            
            # Update received_qty and opening_qty if different
            recv = received_qty.get(key, {}).get('qty', 0)
            if recv > 0:
                existing["received_qty"] = recv
            
            opening = prev_closing.get(key, 0)
            if opening == 0 and product_id in prev_closing_product_only:
                opening = prev_closing_product_only.get(product_id, 0)
            if opening > 0:
                existing["opening_qty"] = opening
            
            # Merge linked dispatches
            linked = dispatch_linkage.get(key, [])
            if linked:
                existing_linked = existing.get("linked_dispatches") or []
                existing["linked_dispatches"] = (existing_linked + linked)[:5]
            continue
        
        # Get opening from previous day - try exact key match first, then product-only fallback
        opening = prev_closing.get(key, 0)
        if opening == 0 and product_id in prev_closing_product_only:
            opening = prev_closing_product_only.get(product_id, 0)
        
        recv = received_qty.get(key, {}).get('qty', 0)
        rej = rejection_qty.get(f"{product_id}_default", 0)
        linked_dispatches = dispatch_linkage.get(key, [])
        
        result.append({
            "id": item.get("id"),
            "product_id": product_id,
            "product_name": item.get("product_name"),
            "variant_id": variant_id,
            "variant_name": final_variant_name,
            "opening_qty": opening,
            "received_qty": recv,
            "rejection_qty": rej,
            "closing_qty": item.get("closing_qty"),
            "linked_dispatches": linked_dispatches[:5] if linked_dispatches else []
        })
        seen_product_variants[dedup_key] = len(result) - 1  # Track index for merging
    
    # Sort result: items with activity (closing_qty not null, or opening > 0, or received > 0) first
    def sort_key(item):
        has_closing = item.get("closing_qty") is not None
        has_opening = (item.get("opening_qty") or 0) > 0
        has_received = (item.get("received_qty") or 0) > 0
        has_activity = has_closing or has_opening or has_received
        # Primary: activity items first (0 for activity, 1 for no activity)
        # Secondary: closing_qty descending (use negative for descending)
        return (0 if has_activity else 1, -(item.get("closing_qty") or 0), item.get("product_name", ""))
    
    result.sort(key=sort_key)
    
    # Determine if there's actual closing data for this date
    has_closing_data = len(closing_items) > 0
    
    # Filter out inactive items if requested (items with zero opening AND zero closing)
    # This is useful for viewing historical closings
    if filter_inactive:
        result = [
            item for item in result 
            if (item.get("opening_qty") or 0) > 0 or (item.get("closing_qty") or 0) > 0
        ]
    
    return {
        "closing_date": date,
        "items": result,
        "recorded_items": len(closing_items),
        "has_closing_data": has_closing_data
    }


@app.get("/api/retailer-closing-inventory/check-yesterday/{retailer_id}")
async def check_yesterday_closing(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Check if yesterday's closing inventory was recorded for this retailer"""
    from datetime import datetime, timedelta
    
    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")
    
    # Check if yesterday's closing exists
    yesterday_closing = await db.retailer_closing_inventory.find_one({
        "retailer_id": retailer_id,
        "closing_date": yesterday_str
    })
    
    return {
        "yesterday_date": yesterday_str,
        "has_closing": yesterday_closing is not None,
        "today_date": today.strftime("%Y-%m-%d")
    }


@app.delete("/api/retailer-closing-inventory/{retailer_id}/{closing_date}")
async def delete_retailer_closing_inventory(
    retailer_id: str,
    closing_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete all closing inventory records for a specific date"""
    result = await db.retailer_closing_inventory.delete_many({
        "retailer_id": retailer_id,
        "closing_date": closing_date
    })
    
    return {
        "message": f"Deleted closing inventory for {closing_date}",
        "deleted_count": result.deleted_count
    }


@app.get("/api/retailer-closing-inventory/last-supply/{retailer_id}")
async def get_last_supply_items(
    retailer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get items from the retailer's last supply (most recent dispatch).
    This is used to pre-populate the closing inventory form.
    """
    # Get the most recent dispatch for this retailer
    last_dispatch = await db.retailer_dispatches.find_one(
        {"retailer_id": retailer_id},
        {"_id": 0},
        sort=[("dispatch_date", -1), ("created_at", -1)]
    )
    
    if not last_dispatch:
        return {
            "success": True,
            "items": [],
            "last_dispatch_date": None,
            "message": "No dispatches found for this retailer"
        }
    
    # Extract unique products with variants from the last dispatch
    items = []
    seen = set()
    
    for item in last_dispatch.get("items", []):
        product_id = item.get("product_id")
        variant_id = item.get("variant_id") or item.get("packaging_id") or ""
        variant_name = item.get("variant_name") or item.get("packaging_name") or "Kg"
        
        key = f"{product_id}_{variant_name}"
        if key not in seen:
            seen.add(key)
            items.append({
                "product_id": product_id,
                "product_name": item.get("product_name", ""),
                "variant_id": variant_id,
                "variant_name": variant_name,
                "last_supplied_qty": item.get("supplied_qty", 0)
            })
    
    # Sort by product name
    items.sort(key=lambda x: x.get("product_name", "").lower())
    
    return {
        "success": True,
        "items": items,
        "last_dispatch_date": str(last_dispatch.get("dispatch_date", ""))[:10],
        "dispatch_id": last_dispatch.get("id")
    }


@app.delete("/api/retailer-closing-inventory/item/{item_id}")
async def delete_closing_inventory_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a single closing inventory item"""
    result = await db.retailer_closing_inventory.delete_one({"id": item_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {"message": "Item deleted successfully"}


@app.put("/api/retailer-closing-inventory/item/{item_id}")
async def update_closing_inventory_item(
    item_id: str,
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update a single closing inventory item (closing_qty and/or variant_name)"""
    closing_qty = data.get("closing_qty")
    variant_name = data.get("variant_name")
    
    if closing_qty is None:
        raise HTTPException(status_code=400, detail="closing_qty is required")
    
    try:
        closing_qty_num = float(closing_qty)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid closing_qty value")
    
    update_data = {"closing_qty": closing_qty_num}
    if variant_name:
        update_data["variant_name"] = variant_name
    
    result = await db.retailer_closing_inventory.find_one_and_update(
        {"id": item_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {"message": "Item updated successfully", "item": result}



# ==================== DAILY REQUIREMENT ENDPOINTS ====================

@app.get("/api/retailer-daily-requirement/calculate")
async def calculate_daily_purchase_requirement(
    target_date: str,
    retailer_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate daily purchase requirement based on indents for the target date.
    
    Logic:
    1. Fetch all indents for the target date (optionally filtered by retailer)
    2. Aggregate items by product_id (combining all variants into one row)
    3. Get product category from products collection
    4. Calculate average wastage % from last 7 days of rejections for each product
    5. Calculate requirement in KG: Qty_in_KG / (1 - wastage%)
    """
    from datetime import datetime, timedelta
    
    try:
        # Parse target date
        target = datetime.strptime(target_date, "%Y-%m-%d").date()
        
        # Build indent query - match indents for the target date
        indent_query = {}
        retailer_name = "All Retailers"
        
        if retailer_id:
            indent_query["retailer_id"] = retailer_id
            retailer = await db.users.find_one({"id": retailer_id})
            if retailer:
                retailer_name = retailer.get("company_name") or retailer.get("name", "Unknown")
        
        # Fetch all indents for the target date
        all_indents = await db.retailer_indents.find(indent_query, {"_id": 0}).to_list(500)
        
        # Filter indents for target date (handle both date string and datetime formats)
        target_indents = []
        for indent in all_indents:
            indent_date_raw = indent.get("indent_date", "")
            if isinstance(indent_date_raw, str):
                indent_date_str = indent_date_raw[:10]
            else:
                indent_date_str = str(indent_date_raw)[:10]
            
            if indent_date_str == target_date:
                target_indents.append(indent)
        
        if not target_indents:
            return {
                "success": False,
                "message": f"No indents found for {target_date}. Please create indents for this date first.",
                "items": [],
                "target_date": target_date,
                "retailer_name": retailer_name,
                "indent_count": 0
            }
        
        # Get all products for category lookup
        all_products = await db.products.find({}, {"_id": 0}).to_list(500)
        product_info_map = {}
        for p in all_products:
            product_info_map[p.get("id")] = {
                "name": p.get("name", "Unknown"),
                "name_hi": p.get("name_hi", ""),
                "name_mr": p.get("name_mr", ""),
                "category": p.get("category", "Other"),
                "variants": p.get("variants", [])
            }
        
        # Get catalogue items for purchase variant info
        all_catalogue = await db.retailer_catalogue.find({}, {"_id": 0}).to_list(500)
        catalogue_map = {}
        for cat in all_catalogue:
            catalogue_map[cat.get("product_id")] = {
                "purchase_unit": cat.get("purchase_unit", ""),
                "purchase_weights": cat.get("purchase_weights", []),
                "purchase_weight_variant": cat.get("purchase_weight_variant", "")
            }
        
        # Build variant to weight mapping (variant_id -> weight_in_kg) and name mapping
        variant_weight_map = {}
        variant_name_map = {}  # variant_id -> name
        all_packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(500)
        for pkg in all_packagings:
            variant_id = pkg.get("id")
            variant_name = pkg.get("name", "").lower()
            variant_name_map[variant_id] = pkg.get("name", "")
            # Parse weight from variant name (e.g., "500 gm", "1 kg", "240-260 gm")
            weight_kg = parse_variant_weight(variant_name)
            if variant_id:
                variant_weight_map[variant_id] = weight_kg
        
        # Get wastage % from Daily Stock Status (same source as Wastage Dashboard)
        seven_days_ago = (target - timedelta(days=7))
        seven_days_ago_str = seven_days_ago.strftime("%Y-%m-%d")
        target_minus_one_str = (target - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Fetch daily stock status data for the last 7 days (closed entries only)
        stock_status_records = await db.daily_stock_status.find(
            {"date": {"$gte": seven_days_ago_str, "$lte": target_minus_one_str}, "status": "closed"},
            {"_id": 0}
        ).to_list(5000)
        
        # Get all products for product_id mapping
        all_products = await db.products.find({}, {"_id": 0}).to_list(500)
        product_name_to_id = {}
        for p in all_products:
            product_name_to_id[p.get("name", "").strip().lower()] = p.get("id")
        
        # Aggregate wastage data by product from daily stock status
        product_wastage_data = {}  # product_id -> {total_input, total_wastage}
        
        for record in stock_status_records:
            product_name = record.get("product_name", "").strip()
            product_id = record.get("product_id")
            
            # Try to get product_id from name if not present
            if not product_id:
                product_id = product_name_to_id.get(product_name.lower())
            
            if not product_id:
                continue
            
            opening_qty = record.get("opening_qty", 0) or 0
            purchase_qty = record.get("purchase_qty", 0) or 0
            wastage_qty = record.get("wastage_qty", 0) or 0
            
            # Total input = opening + purchase
            total_input = opening_qty + purchase_qty
            
            if product_id not in product_wastage_data:
                product_wastage_data[product_id] = {"total_input": 0, "total_wastage": 0}
            
            product_wastage_data[product_id]["total_input"] += total_input
            product_wastage_data[product_id]["total_wastage"] += wastage_qty
        
        # Calculate wastage % for each product
        product_wastage_pct = {}  # product_id -> wastage %
        
        for product_id, data in product_wastage_data.items():
            total_input = data["total_input"]
            total_wastage = data["total_wastage"]
            if total_input > 0:
                wastage_pct = (total_wastage / total_input) * 100
                product_wastage_pct[product_id] = round(min(wastage_pct, 100), 1)  # Cap at 100%
        
        # Aggregate indent items by PRODUCT ONLY (combining ALL variants into one row)
        # Key is just product_id to combine all variants of the same product
        product_aggregation = {}
        skipped_items = []  # Track skipped items for debugging
        
        for indent in target_indents:
            retailer_id = indent.get("retailer_id", "")
            
            for item in indent.get("items", []):
                product_id = item.get("product_id")
                product_name = item.get("product_name", "Unknown")
                variant_id = item.get("variant_id") or ""
                variant_name_raw = item.get("variant_name", "")
                quantity = item.get("quantity", 0) or 0
                
                # Skip items with no product_id AND no product_name
                if not product_id and not product_name:
                    skipped_items.append({"reason": "no_id_or_name", "item": item})
                    continue
                
                # If no product_id but has product_name, try to find it
                if not product_id and product_name:
                    # Search in products by name
                    product_name_lower = product_name.strip().lower()
                    for pid, pinfo in product_info_map.items():
                        if pinfo.get("name", "").strip().lower() == product_name_lower:
                            product_id = pid
                            break
                    
                    # If still no product_id, use product_name as a fallback key
                    if not product_id:
                        product_id = f"name:{product_name_lower}"
                
                # Resolve variant name for display
                resolved_variant_name = ""
                resolved_variant_id = variant_id
                
                # Handle special unit-based variant IDs (not in qc_packaging)
                if variant_id == "unit_piece":
                    resolved_variant_name = "Pieces"
                    resolved_variant_id = variant_id
                elif variant_id == "unit_packet":
                    resolved_variant_name = "Packets"
                    resolved_variant_id = variant_id
                elif variant_id and variant_id in variant_name_map:
                    resolved_variant_name = variant_name_map[variant_id]
                    resolved_variant_id = variant_id
                elif variant_name_raw and variant_name_raw in variant_name_map:
                    resolved_variant_name = variant_name_map[variant_name_raw]
                    resolved_variant_id = variant_name_raw
                elif variant_name_raw:
                    resolved_variant_name = variant_name_raw
                
                # Get weight from variant for Kg calculation
                weight_kg = 0
                
                # Special handling for unit_piece and unit_packet - try to get weight from catalogue
                if resolved_variant_id in ["unit_piece", "unit_packet"]:
                    # Try to get the purchase weight from catalogue for this product
                    cat_info = catalogue_map.get(product_id, {})
                    purchase_weights = cat_info.get("purchase_weights", [])
                    purchase_weight_id = purchase_weights[0] if purchase_weights else cat_info.get("purchase_weight_variant", "")
                    if purchase_weight_id and purchase_weight_id in variant_weight_map:
                        weight_kg = variant_weight_map[purchase_weight_id]
                    
                    # If still no weight, try to parse from the purchase weight name
                    if weight_kg == 0 and purchase_weight_id and purchase_weight_id in variant_name_map:
                        weight_kg = parse_variant_weight(variant_name_map[purchase_weight_id])
                    
                    # Default for Pieces/Packets - assume 0.5 kg average if no better info
                    if weight_kg == 0:
                        weight_kg = 0.5
                elif resolved_variant_id and resolved_variant_id in variant_weight_map:
                    weight_kg = variant_weight_map[resolved_variant_id]
                elif variant_name_raw and variant_name_raw in variant_weight_map:
                    weight_kg = variant_weight_map[variant_name_raw]
                
                if weight_kg == 0:
                    weight_kg = parse_variant_weight(resolved_variant_name)
                if weight_kg == 0:
                    weight_kg = 1.0  # Default
                    
                item_kg = quantity * weight_kg
                
                # For Dozen-based products, calculate dozens
                # Check if variant is "1 Dozen", "Half Dozen", etc.
                dozen_multiplier = 0
                variant_lower = resolved_variant_name.lower() if resolved_variant_name else ""
                if "dozen" in variant_lower or "dz" in variant_lower:
                    if "half" in variant_lower or "1/2" in variant_lower:
                        dozen_multiplier = 0.5
                    elif "quarter" in variant_lower or "1/4" in variant_lower:
                        dozen_multiplier = 0.25
                    else:
                        # Assume 1 dozen
                        dozen_multiplier = 1.0
                
                item_dozens = quantity * dozen_multiplier if dozen_multiplier > 0 else 0
                
                # Track pieces and packets separately
                item_pieces = quantity if resolved_variant_id == "unit_piece" or "piece" in variant_lower else 0
                item_packets = quantity if resolved_variant_id == "unit_packet" or "packet" in variant_lower else 0
                
                # Aggregation key is just product_id - combine ALL variants
                agg_key = product_id
                
                if agg_key not in product_aggregation:
                    product_info = product_info_map.get(product_id, {})
                    final_product_name = product_info.get("name") or product_name or "Unknown"
                    final_category = product_info.get("category") or item.get("category") or item.get("product_category") or "Other"
                    
                    # Get purchase unit from catalogue
                    cat_info = catalogue_map.get(product_id, {})
                    
                    product_aggregation[agg_key] = {
                        "product_id": product_id,
                        "product_name": final_product_name,
                        "product_name_hi": product_info.get("name_hi", "") or item.get("product_name_hi", ""),
                        "product_name_mr": product_info.get("name_mr", "") or item.get("product_name_mr", ""),
                        "category": final_category,
                        "variants": [],  # Track all variants for reference
                        "total_units": 0,
                        "total_kg": 0,
                        "total_dozens": 0,  # For dozen-based products
                        "total_pieces": 0,  # For piece-based products
                        "total_packets": 0,  # For packet-based products
                        "purchase_unit": cat_info.get("purchase_unit", ""),
                        "purchase_weight_name": "",
                        "retailers": []
                    }
                    
                    # Get purchase weight name
                    purchase_weights = cat_info.get("purchase_weights", [])
                    purchase_weight_id = purchase_weights[0] if purchase_weights else cat_info.get("purchase_weight_variant", "")
                    if purchase_weight_id and purchase_weight_id in variant_name_map:
                        product_aggregation[agg_key]["purchase_weight_name"] = variant_name_map[purchase_weight_id]
                
                product_aggregation[agg_key]["total_units"] += quantity
                product_aggregation[agg_key]["total_kg"] += item_kg
                product_aggregation[agg_key]["total_dozens"] += item_dozens
                product_aggregation[agg_key]["total_pieces"] += item_pieces
                product_aggregation[agg_key]["total_packets"] += item_packets
                
                # Track variant for display (avoid duplicates)
                if resolved_variant_name and resolved_variant_name not in product_aggregation[agg_key]["variants"]:
                    product_aggregation[agg_key]["variants"].append(resolved_variant_name)
                
                # Track retailer (accumulate qty if same retailer)
                existing_retailer = next((r for r in product_aggregation[agg_key]["retailers"] if r["retailer_id"] == retailer_id), None)
                if existing_retailer:
                    existing_retailer["qty"] += quantity
                else:
                    product_aggregation[agg_key]["retailers"].append({"retailer_id": retailer_id, "qty": quantity})
        
        # Get retailer names for lookup
        all_retailers = await db.users.find({"role": "retailer"}, {"_id": 0, "id": 1, "company_name": 1, "name": 1}).to_list(200)
        retailer_name_map = {}
        for r in all_retailers:
            retailer_name_map[r.get("id")] = r.get("company_name") or r.get("name", "Unknown")
        
        # Build result items
        result_items = []
        for agg_key, data in product_aggregation.items():
            product_id = data["product_id"]
            wastage_pct = product_wastage_pct.get(product_id, 0)
            total_kg = data["total_kg"]
            total_units = data["total_units"]
            total_dozens = data.get("total_dozens", 0)
            
            # Calculate requirement considering wastage
            if wastage_pct >= 100:
                requirement_kg = total_kg * 2
            elif wastage_pct > 0:
                requirement_kg = total_kg / (1 - wastage_pct / 100)
            else:
                requirement_kg = total_kg
            
            # Get purchase unit from the aggregated data
            purchase_unit = data.get("purchase_unit", "")
            purchase_weight_name = data.get("purchase_weight_name", "")
            
            # If not set, get from catalogue
            if not purchase_unit:
                cat_info = catalogue_map.get(product_id, {})
                purchase_unit = cat_info.get("purchase_unit", "")
                purchase_weights = cat_info.get("purchase_weights", [])
                purchase_weight_id = purchase_weights[0] if purchase_weights else cat_info.get("purchase_weight_variant", "")
                purchase_weight_name = variant_name_map.get(purchase_weight_id, "") if purchase_weight_id else ""
            
            # Resolve retailer names
            retailers_with_names = []
            for r in data.get("retailers", []):
                retailer_id = r.get("retailer_id")
                qty = r.get("qty", 0)
                name = retailer_name_map.get(retailer_id, "Unknown")
                retailers_with_names.append({"name": name, "qty": qty})
            
            # Combine variant names for display
            variants_display = ", ".join(data.get("variants", [])) if data.get("variants") else ""
            
            # Get piece and packet totals
            total_pieces = data.get("total_pieces", 0)
            total_packets = data.get("total_packets", 0)
            
            result_items.append({
                "product_id": product_id,
                "product_name": data["product_name"],
                "product_name_hi": data.get("product_name_hi", ""),
                "product_name_mr": data.get("product_name_mr", ""),
                "category": data["category"],
                "variants": variants_display,  # Combined variants for display
                "qty_units": round(total_units, 2),
                "qty_kg": round(total_kg, 2),
                "qty_dozens": round(total_dozens, 2),  # For dozen-based products
                "qty_pieces": round(total_pieces, 2),  # For piece-based products
                "qty_packets": round(total_packets, 2),  # For packet-based products
                "wastage_pct": wastage_pct,
                "requirement_kg": round(requirement_kg, 2),
                "purchase_unit": purchase_unit,
                "purchase_weight_name": purchase_weight_name,
                "retailers": retailers_with_names
            })
        
        # Sort by category then product name then variant
        category_order = {"Fruits": 1, "Vegetables": 2, "Leafy": 3, "Exotic": 4, "Other": 5}
        result_items.sort(key=lambda x: (category_order.get(x["category"], 99), x["product_name"], x.get("variant_name", "")))
        
        # Calculate category breakdown for debugging
        category_counts = {}
        for item in result_items:
            cat = item["category"]
            if cat not in category_counts:
                category_counts[cat] = {"count": 0, "units": 0}
            category_counts[cat]["count"] += 1
            category_counts[cat]["units"] += item["qty_units"]
        
        # Count total items processed from indents
        total_indent_items = sum(len(indent.get("items", [])) for indent in target_indents)
        
        # Build detailed debug info about what was skipped
        skipped_summary = {}
        for skip in skipped_items:
            reason = skip.get("reason", "unknown")
            if reason not in skipped_summary:
                skipped_summary[reason] = 0
            skipped_summary[reason] += 1
        
        # Sample of raw indent data for debugging
        sample_indent_items = []
        if target_indents:
            for item in target_indents[0].get("items", [])[:5]:
                sample_indent_items.append({
                    "product_name": item.get("product_name"),
                    "product_id": item.get("product_id", "")[:20] + "..." if item.get("product_id") else None,
                    "variant_id": item.get("variant_id", "")[:20] + "..." if item.get("variant_id") else None,
                    "variant_name": item.get("variant_name"),
                    "quantity": item.get("quantity")
                })
        
        return {
            "success": True,
            "target_date": target_date,
            "retailer_name": retailer_name,
            "indent_count": len(target_indents),
            "items": result_items,
            "total_qty_units": sum(item["qty_units"] for item in result_items),
            "total_qty_kg": round(sum(item["qty_kg"] for item in result_items), 2),
            "total_requirement_kg": round(sum(item["requirement_kg"] for item in result_items), 2),
            "category_breakdown": category_counts,
            "debug_info": {
                "total_indent_items": total_indent_items,
                "aggregated_items": len(result_items),
                "skipped_items": len(skipped_items),
                "skipped_summary": skipped_summary,
                "products_in_db": len(product_info_map),
                "packagings_in_db": len(variant_name_map),
                "sample_indent_items": sample_indent_items,
                "indent_ids": [ind.get("id", "")[:20] for ind in target_indents[:5]]
            },
            "message": f"Calculated from {len(target_indents)} indent(s) for {target_date}"
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "message": f"Error calculating requirement: {str(e)}",
            "items": []
        }


def parse_variant_weight(variant_name: str) -> float:
    """Parse weight in KG from variant name like '500 gm', '1 kg', '240-260 gm', 'Half Dozen', '250+ gm'"""
    import re
    
    if not variant_name:
        return 1.0  # Default to 1 kg if unknown
    
    variant_lower = variant_name.lower().strip()
    
    # Handle special cases
    if "dozen" in variant_lower:
        return 1.0  # Treat dozen as 1 unit for now
    if "piece" in variant_lower or "pcs" in variant_lower:
        return 0.25  # Estimate piece as 250gm
    if "bunch" in variant_lower:
        return 0.5  # Estimate bunch as 500gm
    
    # Try to find kg pattern first (e.g., "1 kg", "2kg", "2.5 kg")
    kg_match = re.search(r'(\d+\.?\d*)\s*kg', variant_lower)
    if kg_match:
        return float(kg_match.group(1))
    
    # Try to find gm/gram pattern with ranges (e.g., "240-260 gm", "450-500 gm")
    range_gm_match = re.search(r'(\d+)\s*[-]\s*(\d+)\s*g[rm]?', variant_lower)
    if range_gm_match:
        first_num = int(range_gm_match.group(1))
        second_num = int(range_gm_match.group(2))
        avg_gm = (first_num + second_num) / 2
        return avg_gm / 1000  # Convert to kg
    
    # Try to find gm/gram pattern with "+" suffix (e.g., "250+ gm", "500+ gm")
    plus_gm_match = re.search(r'(\d+)\s*\+?\s*g[rm]?', variant_lower)
    if plus_gm_match:
        return int(plus_gm_match.group(1)) / 1000  # Convert to kg
    
    # Try to find simple number with gm (e.g., "500 gm", "100gm")
    simple_gm = re.search(r'(\d+)\s*g[rm]', variant_lower)
    if simple_gm:
        return int(simple_gm.group(1)) / 1000
    
    # Try to find just a number (might be grams, default assumption)
    just_number = re.search(r'^(\d+)$', variant_lower.replace(' ', ''))
    if just_number:
        num = int(just_number.group(1))
        # If number > 10, assume it's grams
        if num > 10:
            return num / 1000
        return num  # Otherwise assume it's kg
    
    return 1.0  # Default to 1 kg if can't parse


@app.post("/api/retailer-daily-requirement")
async def save_retailer_daily_requirement(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save or update retailer daily purchase requirement"""
    from datetime import datetime, timezone
    
    requirement_date = data.get("requirement_date")
    retailer_id = data.get("retailer_id")  # Can be null for 'All Retailers'
    
    if not requirement_date:
        raise HTTPException(status_code=400, detail="Requirement date is required")
    
    # Check if record exists for this date + retailer combo
    query = {"requirement_date": requirement_date}
    if retailer_id:
        query["retailer_id"] = retailer_id
    else:
        query["retailer_id"] = None
    
    existing = await db.retailer_daily_requirements.find_one(query)
    
    doc = {
        "requirement_date": requirement_date,
        "retailer_id": retailer_id,
        "retailer_name": data.get("retailer_name", "All Retailers"),
        "items": data.get("items", []),
        "total_kg": data.get("total_kg", 0),
        "total_amount": data.get("total_amount", 0),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("user_id")
    }
    
    if existing:
        # Update existing
        await db.retailer_daily_requirements.update_one(
            {"_id": existing["_id"]},
            {"$set": doc}
        )
        return {"message": "Daily requirement updated", "id": existing.get("id")}
    else:
        # Create new
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        doc["created_by"] = current_user.get("user_id")
        await db.retailer_daily_requirements.insert_one(doc)
        return {"message": "Daily requirement saved", "id": doc["id"]}


@app.get("/api/retailer-daily-requirement/saved")
async def get_retailer_daily_requirement_saved(
    date: str = Query(..., description="Requirement date in YYYY-MM-DD format"),
    retailer_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get saved daily requirement for a date (query param version for frontend compatibility)"""
    query = {"requirement_date": date}
    if retailer_id:
        query["retailer_id"] = retailer_id
    else:
        query["retailer_id"] = None
    
    doc = await db.retailer_daily_requirements.find_one(query, {"_id": 0})
    if not doc:
        return None
    return doc


@app.get("/api/retailer-daily-requirement/{requirement_date}")
async def get_retailer_daily_requirement(
    requirement_date: str,
    retailer_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get saved daily requirement for a date"""
    query = {"requirement_date": requirement_date}
    if retailer_id:
        query["retailer_id"] = retailer_id
    else:
        query["retailer_id"] = None
    
    doc = await db.retailer_daily_requirements.find_one(query, {"_id": 0})
    if not doc:
        return None
    return doc


@app.get("/api/retailer-daily-requirements")
async def list_retailer_daily_requirements(
    limit: int = Query(default=30, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List recent daily requirements"""
    docs = await db.retailer_daily_requirements.find(
        {}, {"_id": 0}
    ).sort("requirement_date", -1).to_list(limit)
    return docs


# ==================== QC DAILY REQUIREMENT ENDPOINTS ====================

@app.get("/api/qc-wastage-averages")
async def get_qc_wastage_averages(
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate 1-month average wastage per product from QC GRN data.
    Wastage = supplied_qty - grn_qty (what we sent minus what was accepted)
    """
    from datetime import datetime, timedelta, timezone
    
    # Get date 30 days ago
    one_month_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    
    # Get all GRNs from last 30 days
    grns = await db.qc_grns.find(
        {"grn_date": {"$gte": one_month_ago}},
        {"_id": 0}
    ).to_list(1000)
    
    # Aggregate wastage by product
    wastage_by_product = {}  # {product_id: {total_wastage_qty: 0, count: 0, product_name: '', packaging_name: ''}}
    
    for grn in grns:
        for item in grn.get("items", []):
            product_id = item.get("product_id", "")
            packaging_id = item.get("packaging_id", "")
            key = f"{product_id}_{packaging_id}"
            
            # Wastage = what we supplied - what was accepted in GRN
            supplied = item.get("supplied_qty", 0) or 0
            grn_qty = item.get("grn_qty", 0) or 0
            wastage = max(0, supplied - grn_qty)  # Only count positive wastage
            
            if key not in wastage_by_product:
                wastage_by_product[key] = {
                    "product_id": product_id,
                    "product_name": item.get("product_name", ""),
                    "packaging_id": packaging_id,
                    "packaging_name": item.get("packaging_name", ""),
                    "total_wastage": 0,
                    "total_supplied": 0,
                    "count": 0
                }
            
            wastage_by_product[key]["total_wastage"] += wastage
            wastage_by_product[key]["total_supplied"] += supplied
            wastage_by_product[key]["count"] += 1
    
    # Calculate averages
    result = []
    for key, data in wastage_by_product.items():
        avg_wastage = data["total_wastage"] / data["count"] if data["count"] > 0 else 0
        wastage_pct = (data["total_wastage"] / data["total_supplied"] * 100) if data["total_supplied"] > 0 else 0
        
        result.append({
            "product_id": data["product_id"],
            "product_name": data["product_name"],
            "packaging_id": data["packaging_id"],
            "packaging_name": data["packaging_name"],
            "avg_wastage_qty": round(avg_wastage, 2),
            "total_wastage": round(data["total_wastage"], 2),
            "total_supplied": round(data["total_supplied"], 2),
            "wastage_percentage": round(wastage_pct, 2),
            "data_points": data["count"]
        })
    
    return result


@app.get("/api/retail-wastage-averages")
async def get_retail_wastage_averages(
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate 30-day average wastage per product from stock status data.
    Uses the daily_stock_status collection to get wastage by product.
    """
    from datetime import datetime, timedelta, timezone
    
    # Get date 30 days ago
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    
    # Get all stock status records from last 30 days
    stock_records = await db.daily_stock_status.find(
        {"date": {"$gte": thirty_days_ago}},
        {"_id": 0}
    ).to_list(10000)
    
    # Aggregate wastage by product
    wastage_by_product = {}  # {product_id: {total_wastage: 0, total_input: 0, count: 0, ...}}
    
    for record in stock_records:
        product_id = record.get("product_id", "")
        product_name = record.get("product_name", "")
        
        # Skip if no product info
        if not product_id and not product_name:
            continue
        
        # Calculate wastage: opening + purchase - dispatch - closing
        opening_qty = float(record.get("opening_qty") or 0)
        purchase_qty = float(record.get("purchase_qty") or 0)
        dispatch_qty = float(record.get("dispatch_qty") or 0)
        closing_qty = float(record.get("closing_qty") or 0)
        
        total_input = opening_qty + purchase_qty
        expected_closing = total_input - dispatch_qty
        wastage_qty = max(0, expected_closing - closing_qty)  # Only count positive wastage
        
        # Use product_id or name as key
        key = product_id or product_name
        
        if key not in wastage_by_product:
            wastage_by_product[key] = {
                "product_id": product_id,
                "product_name": product_name,
                "total_wastage": 0,
                "total_input": 0,
                "count": 0
            }
        
        wastage_by_product[key]["total_wastage"] += wastage_qty
        wastage_by_product[key]["total_input"] += total_input
        wastage_by_product[key]["count"] += 1
    
    # Calculate averages
    result = []
    for key, data in wastage_by_product.items():
        if data["count"] == 0:
            continue
            
        avg_wastage_kg = data["total_wastage"] / data["count"]
        wastage_pct = (data["total_wastage"] / data["total_input"] * 100) if data["total_input"] > 0 else 0
        
        result.append({
            "product_id": data["product_id"],
            "product_name": data["product_name"],
            "avg_wastage_kg": round(avg_wastage_kg, 2),
            "total_wastage_kg": round(data["total_wastage"], 2),
            "total_input_kg": round(data["total_input"], 2),
            "wastage_percentage": round(wastage_pct, 2),
            "data_points": data["count"]
        })
    
    # Sort by wastage percentage descending
    result.sort(key=lambda x: x["wastage_percentage"], reverse=True)
    
    return result


@app.get("/api/qc-latest-bunch-weights")
async def get_qc_latest_bunch_weights(
    current_user: dict = Depends(get_current_user)
):
    """
    Get the latest bunch weights per product from the most recent saved QC daily requirements.
    This is used to pre-populate bunch weights when calculating new daily requirements.
    """
    # Get the most recent saved QC daily requirement
    recent_requirements = await db.qc_daily_requirements.find(
        {},
        {"_id": 0}
    ).sort("requirement_date", -1).limit(10).to_list(10)
    
    # Build a map of product+packaging -> bunch weight from most recent data
    bunch_weights = {}
    
    for req in recent_requirements:
        for item in req.get("items", []):
            product_id = item.get("product_id", "")
            packaging_id = item.get("packaging_id", "")
            key = f"{product_id}_{packaging_id}"
            
            # Only use if we don't have a weight for this combo yet (most recent takes precedence)
            if key not in bunch_weights and item.get("weight_per_bunch"):
                bunch_weights[key] = {
                    "product_id": product_id,
                    "product_name": item.get("product_name", ""),
                    "packaging_id": packaging_id,
                    "packaging_name": item.get("packaging_name", ""),
                    "weight_per_bunch": item.get("weight_per_bunch"),
                    "source_date": req.get("requirement_date")
                }
    
    return list(bunch_weights.values())


@app.post("/api/qc-daily-requirement")
async def save_qc_daily_requirement(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Save or update QC daily purchase requirement"""
    from datetime import datetime, timezone
    
    requirement_date = data.get("requirement_date")
    customer_name = data.get("customer_name", "All Customers")
    
    if not requirement_date:
        raise HTTPException(status_code=400, detail="Requirement date is required")
    
    # Check if record exists for this date + customer combo
    query = {"requirement_date": requirement_date, "customer_name": customer_name}
    existing = await db.qc_daily_requirements.find_one(query)
    
    doc = {
        "requirement_date": requirement_date,
        "customer_name": customer_name,
        "items": data.get("items", []),
        "total_qty_required": data.get("total_qty_required", 0),
        "total_actual_qty": data.get("total_actual_qty", 0),
        "total_bunches": data.get("total_bunches", 0),
        "total_amount": data.get("total_amount", 0),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("user_id")
    }
    
    if existing:
        # Update existing
        await db.qc_daily_requirements.update_one(
            {"_id": existing["_id"]},
            {"$set": doc}
        )
        return {"message": "QC daily requirement updated", "id": existing.get("id")}
    else:
        # Create new
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        doc["created_by"] = current_user.get("user_id")
        await db.qc_daily_requirements.insert_one(doc)
        return {"message": "QC daily requirement saved", "id": doc["id"]}


@app.get("/api/qc-daily-requirement/{requirement_date}")
async def get_qc_daily_requirement(
    requirement_date: str,
    customer_name: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get saved QC daily requirement for a date"""
    query = {"requirement_date": requirement_date}
    if customer_name:
        query["customer_name"] = customer_name
    
    doc = await db.qc_daily_requirements.find_one(query, {"_id": 0})
    return doc


@app.get("/api/qc-daily-requirements")
async def list_qc_daily_requirements(
    limit: int = Query(default=30, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List recent QC daily requirements"""
    docs = await db.qc_daily_requirements.find(
        {}, {"_id": 0}
    ).sort("requirement_date", -1).to_list(limit)
    return docs


@app.on_event("shutdown")
async def shutdown_db_client():
    global backup_scheduler
    if backup_scheduler:
        backup_scheduler.shutdown()
    client.close()