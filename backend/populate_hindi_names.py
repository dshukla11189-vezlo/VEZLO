"""
Script to populate Hindi names (name_hi) for all products in the database.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Hindi translations for common vegetables and fruits
HINDI_TRANSLATIONS = {
    # Leafy Greens
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
    
    # Fruits
    "Tomato Hybrid": "हाइब्रिड टमाटर",
    "Lemon": "नींबू",
    "Raw Mango": "कच्चा आम",
    "Banana": "केला",
    "Banana ": "केला",
    
    # Root Vegetables
    "Onion": "प्याज",
    "Potato": "आलू",
    "Garlic": "लहसुन",
    "Ginger": "अदरक",
    "Carrot": "गाजर",
    "Radish": "मूली",
    "Peeled Garlic": "छिला लहसुन",
    
    # Gourds
    "Bottle Gourd": "लौकी",
    "Bitter gourd": "करेला",
    "Cucumber": "खीरा",
    "Ridge Gourd": "तोरी",
    
    # Peppers
    "Capsicum": "शिमला मिर्च",
    "Green capcicum ": "हरी शिमला मिर्च",
    "Chilli Light Green": "हल्की हरी मिर्च",
    "Chilli": "मिर्च",
    "Green chilli ": "हरी मिर्च",
    
    # Cole Crops
    "Cauliflower": "फूलगोभी",
    "Cabbage ": "पत्तागोभी",
    
    # Other Vegetables
    "Button Mushroom": "बटन मशरूम",
    "Brinjal": "बैंगन",
    "Lady Finger": "भिंडी",
    "Cluster Beans": "ग्वार फली",
    "Spring onion ": "हरा प्याज",
    "Green Pea": "हरी मटर",
    
    # Legumes & Sprouts
    "Soaked chole": "भीगे छोले",
    "Soaked yellow peas": "भीगी पीली मटर",
    "Soaked Green peas": "भीगी हरी मटर",
    "Sprouted matki": "अंकुरित मोठ",
    "Matki Sprouts": "मोठ स्प्राउट्स",
    "Soaked Harbhara": "भीगा हरभरा",
    "Sprouted moong": "अंकुरित मूंग",
    "Mixed Sprouts ": "मिक्स स्प्राउट्स",
}

async def update_hindi_names():
    """Update all products with Hindi names"""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "freshflow_db")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Get all products
    products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "name_hi": 1}).to_list(1000)
    
    print(f"Found {len(products)} products")
    
    updated_count = 0
    missing_translations = []
    
    for product in products:
        name = product.get("name", "")
        current_hi = product.get("name_hi")
        
        # Check if translation exists
        if name in HINDI_TRANSLATIONS:
            hindi_name = HINDI_TRANSLATIONS[name]
            
            # Update if not already set or different
            if current_hi != hindi_name:
                result = await db.products.update_one(
                    {"id": product["id"]},
                    {"$set": {"name_hi": hindi_name}}
                )
                if result.modified_count > 0:
                    updated_count += 1
                    print(f"Updated: {name} -> {hindi_name}")
        else:
            missing_translations.append(name)
    
    print(f"\nUpdated {updated_count} products with Hindi names")
    
    if missing_translations:
        print(f"\nMissing translations for {len(missing_translations)} products:")
        for name in missing_translations:
            print(f"  - {name}")
    
    client.close()
    return updated_count

if __name__ == "__main__":
    asyncio.run(update_hindi_names())
