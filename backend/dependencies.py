"""
Shared dependencies for all route modules
This module provides database connections, authentication utilities, and shared constants.
"""
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
import logging
import random
import string
import uuid
import asyncio
import traceback

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("freshflow")

# MongoDB connection with optimized settings for production reliability
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=30,
    minPoolSize=5,
    maxIdleTimeMS=30000,
    serverSelectionTimeoutMS=10000,
    connectTimeoutMS=10000,
    socketTimeoutMS=30000,
    waitQueueTimeoutMS=10000,
    retryWrites=True,
    retryReads=True,
    appName="MrOrganix",
)
db = client[os.environ['DB_NAME']]

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'freshflow-secret-key-change-in-production')
ALGORITHM = "HS256"

# Hindi translations for all products
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


# Auth Helper Functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str, email: str, role: str) -> str:
    """Create a JWT token for a user"""
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Dependency to get the current authenticated user from JWT token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def generate_referral_code() -> str:
    """Generate a unique 5-digit referral code"""
    return ''.join(random.choices(string.digits, k=5))


def get_db():
    """Dependency that returns the database instance"""
    return db


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
    "environment": os.environ.get("ENVIRONMENT", "unknown")
}


async def persist_error_log(error_data: dict, is_critical: bool = False):
    """Persist errors to MongoDB error_logs collection for cross-environment analysis"""
    try:
        error_data["persisted_at"] = datetime.now(timezone.utc).isoformat()
        error_data["is_critical"] = is_critical
        error_data["environment"] = os.environ.get("ENVIRONMENT", "production")
        error_data["server_id"] = os.environ.get("HOSTNAME", "unknown")
        
        await db.error_logs.insert_one(error_data)
        
        # Keep only last 5000 logs in DB
        count = await db.error_logs.count_documents({})
        if count > 5000:
            oldest = await db.error_logs.find({}, {"_id": 1}).sort("timestamp", 1).limit(count - 5000).to_list(count - 5000)
            if oldest:
                await db.error_logs.delete_many({"_id": {"$in": [o["_id"] for o in oldest]}})
    except Exception as e:
        logger.error(f"Failed to persist error log: {e}")


async def log_connection_stats():
    """Log MongoDB connection pool statistics"""
    try:
        server_info = await client.server_info()
        logger.info(f"MongoDB connected: version {server_info.get('version', 'unknown')}")
    except Exception as e:
        logger.error(f"MongoDB connection check failed: {e}")
