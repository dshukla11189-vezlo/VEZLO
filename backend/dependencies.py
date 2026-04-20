"""
Shared dependencies for all route modules
"""
from fastapi import HTTPException, Depends
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

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging
logger = logging.getLogger("freshflow")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
security = HTTPBearer()
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'freshflow-secret-key-change-in-production')
ALGORITHM = "HS256"

# Hindi translations for products
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
}


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


def generate_referral_code() -> str:
    """Generate a unique 5-digit referral code"""
    return ''.join(random.choices(string.digits, k=5))


def get_db():
    """Dependency that returns the database instance"""
    return db
