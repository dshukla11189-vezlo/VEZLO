"""
Pune Retail Shops Scraper
Scrapes grocery stores, kirana shops, and supermarkets from JustDial and Google Maps
"""
import asyncio
import aiohttp
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional
from motor.motor_asyncio import AsyncIOMotorClient
import os
from urllib.parse import quote_plus
import random

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Collection for scraped shops
SHOPS_COLLECTION = "scraped_retail_shops"

# JustDial mobile API headers (more permissive)
JUSTDIAL_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
}

# Search queries for different shop types
SEARCH_QUERIES = [
    "grocery stores",
    "kirana stores", 
    "supermarket",
    "provision stores",
    "general stores",
    "daily needs store",
    "grocery shop",
    "supermart",
    "departmental store",
    "mini mart"
]

# Pune areas to search (for better coverage)
PUNE_AREAS = [
    "Pune", "Kothrud", "Baner", "Wakad", "Hinjewadi", "Hadapsar",
    "Viman Nagar", "Kharadi", "Magarpatta", "Aundh", "Shivajinagar",
    "Deccan", "FC Road", "JM Road", "Swargate", "Katraj", "Bibwewadi",
    "Kondhwa", "NIBM", "Undri", "Wagholi", "Pimpri", "Chinchwad",
    "Nigdi", "Akurdi", "Ravet", "Punawale", "Tathawade", "Kalyani Nagar",
    "Koregaon Park", "Camp", "MG Road", "Yerawada", "Vishrantwadi",
    "Dhanori", "Lohegaon", "Wadgaon Sheri", "Mundhwa", "Fursungi",
    "Wanowrie", "Salunke Vihar", "Mohammadwadi", "Handewadi"
]


def decode_justdial_phone(encoded: str) -> str:
    """Decode JustDial's obfuscated phone numbers"""
    # JustDial encodes phone numbers using CSS classes
    decode_map = {
        'acb': '0', 'yz': '1', 'wx': '2', 'vu': '3', 'ts': '4',
        'rq': '5', 'po': '6', 'nm': '7', 'lk': '8', 'ji': '9',
        'dc': '0', 'fe': '1', 'hg': '2', 'ba': '3', 'icon-dc': '0'
    }
    
    phone = ""
    # Extract class names and decode
    classes = re.findall(r'class="([^"]+)"', encoded)
    for cls in classes:
        for key, val in decode_map.items():
            if key in cls:
                phone += val
                break
    
    return phone if len(phone) >= 10 else ""


async def scrape_justdial_search(session: aiohttp.ClientSession, query: str, area: str, page: int = 1) -> List[Dict]:
    """Scrape a single JustDial search page"""
    shops = []
    
    try:
        # JustDial URL format
        search_term = f"{query} in {area}"
        url = f"https://www.justdial.com/{area}/{quote_plus(query)}/nct-10000000"
        
        if page > 1:
            url += f"/page-{page}"
        
        logger.info(f"Scraping JustDial: {query} in {area} (page {page})")
        
        async with session.get(url, headers=JUSTDIAL_HEADERS, timeout=30) as response:
            if response.status != 200:
                logger.warning(f"JustDial returned status {response.status} for {url}")
                return shops
            
            html = await response.text()
            
            # Extract shop data using regex (more reliable than parsing obfuscated HTML)
            # Look for shop names
            name_pattern = r'<span class="lng_cont_name"[^>]*>([^<]+)</span>'
            names = re.findall(name_pattern, html)
            
            # Look for addresses
            addr_pattern = r'<span class="cont_fl_addr"[^>]*>([^<]+)</span>'
            addresses = re.findall(addr_pattern, html)
            
            # Alternative patterns
            if not names:
                name_pattern2 = r'"name"\s*:\s*"([^"]+)"'
                names = re.findall(name_pattern2, html)
            
            if not addresses:
                addr_pattern2 = r'"address"\s*:\s*\{[^}]*"streetAddress"\s*:\s*"([^"]+)"'
                addresses = re.findall(addr_pattern2, html)
            
            # Extract JSON-LD data if available
            jsonld_pattern = r'<script type="application/ld\+json">([^<]+)</script>'
            jsonld_matches = re.findall(jsonld_pattern, html)
            
            for jsonld in jsonld_matches:
                try:
                    data = json.loads(jsonld)
                    if isinstance(data, list):
                        for item in data:
                            if item.get('@type') == 'LocalBusiness':
                                shop = extract_shop_from_jsonld(item, area, "JustDial")
                                if shop:
                                    shops.append(shop)
                    elif data.get('@type') == 'LocalBusiness':
                        shop = extract_shop_from_jsonld(data, area, "JustDial")
                        if shop:
                            shops.append(shop)
                except json.JSONDecodeError:
                    pass
            
            # If no JSON-LD, try regex extraction
            if not shops and names:
                for i, name in enumerate(names[:20]):  # Limit per page
                    shop = {
                        "id": str(uuid.uuid4()),
                        "name": clean_text(name),
                        "address": clean_text(addresses[i]) if i < len(addresses) else f"{area}, Pune",
                        "phone": "",
                        "area": area,
                        "city": "Pune",
                        "source": "JustDial",
                        "shop_type": categorize_shop(query),
                        "search_query": query,
                        "scraped_at": datetime.now(timezone.utc),
                        "verified": False
                    }
                    shops.append(shop)
        
        # Rate limiting - be respectful
        await asyncio.sleep(random.uniform(2, 4))
        
    except asyncio.TimeoutError:
        logger.warning(f"Timeout scraping JustDial: {query} in {area}")
    except Exception as e:
        logger.error(f"Error scraping JustDial: {e}")
    
    return shops


def extract_shop_from_jsonld(data: Dict, area: str, source: str) -> Optional[Dict]:
    """Extract shop data from JSON-LD format"""
    try:
        name = data.get('name', '')
        if not name:
            return None
        
        address_obj = data.get('address', {})
        if isinstance(address_obj, dict):
            address = address_obj.get('streetAddress', '')
            locality = address_obj.get('addressLocality', area)
        else:
            address = str(address_obj)
            locality = area
        
        phone = data.get('telephone', '')
        if isinstance(phone, list):
            phone = phone[0] if phone else ''
        
        return {
            "id": str(uuid.uuid4()),
            "name": clean_text(name),
            "address": clean_text(address) if address else f"{locality}, Pune",
            "phone": clean_phone(phone),
            "area": locality,
            "city": "Pune",
            "source": source,
            "shop_type": categorize_shop(name),
            "rating": data.get('aggregateRating', {}).get('ratingValue'),
            "scraped_at": datetime.now(timezone.utc),
            "verified": False
        }
    except Exception as e:
        logger.error(f"Error extracting JSON-LD: {e}")
        return None


def clean_text(text: str) -> str:
    """Clean and normalize text"""
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text)
    text = text.strip()
    text = re.sub(r'[^\w\s\-\.,/()&]', '', text)
    return text[:500]  # Limit length


def clean_phone(phone: str) -> str:
    """Clean and format phone number"""
    if not phone:
        return ""
    # Remove non-digits except + at start
    digits = re.sub(r'[^\d+]', '', phone)
    # Remove country code if present
    if digits.startswith('+91'):
        digits = digits[3:]
    elif digits.startswith('91') and len(digits) > 10:
        digits = digits[2:]
    elif digits.startswith('0'):
        digits = digits[1:]
    
    return digits[:10] if len(digits) >= 10 else ""


def categorize_shop(query_or_name: str) -> str:
    """Categorize shop type based on query or name"""
    lower = query_or_name.lower()
    
    if any(term in lower for term in ['supermarket', 'supermart', 'mart', 'departmental']):
        return "Supermarket"
    elif any(term in lower for term in ['kirana', 'provision', 'general store']):
        return "Kirana Store"
    elif any(term in lower for term in ['grocery', 'groceries']):
        return "Grocery Store"
    elif any(term in lower for term in ['daily needs', 'convenience']):
        return "Convenience Store"
    else:
        return "Retail Store"


async def scrape_google_maps_api(query: str, area: str, api_key: str) -> List[Dict]:
    """Scrape using Google Places API (requires API key)"""
    shops = []
    
    if not api_key:
        logger.warning("Google Maps API key not provided, skipping Google scraping")
        return shops
    
    try:
        search_query = f"{query} in {area} Pune"
        url = f"https://maps.googleapis.com/maps/api/place/textsearch/json"
        params = {
            "query": search_query,
            "key": api_key,
            "region": "in"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=30) as response:
                if response.status != 200:
                    return shops
                
                data = await response.json()
                
                for place in data.get('results', []):
                    shop = {
                        "id": str(uuid.uuid4()),
                        "google_place_id": place.get('place_id'),
                        "name": place.get('name', ''),
                        "address": place.get('formatted_address', ''),
                        "phone": "",  # Need details API for phone
                        "area": area,
                        "city": "Pune",
                        "source": "Google Maps",
                        "shop_type": categorize_shop(query),
                        "rating": place.get('rating'),
                        "total_ratings": place.get('user_ratings_total'),
                        "location": {
                            "lat": place.get('geometry', {}).get('location', {}).get('lat'),
                            "lng": place.get('geometry', {}).get('location', {}).get('lng')
                        },
                        "scraped_at": datetime.now(timezone.utc),
                        "verified": False
                    }
                    shops.append(shop)
                
                # Handle pagination
                next_page_token = data.get('next_page_token')
                if next_page_token:
                    await asyncio.sleep(2)  # Required delay for next_page_token
                    # Could recursively fetch more pages here
        
    except Exception as e:
        logger.error(f"Error scraping Google Maps: {e}")
    
    return shops


async def save_shops_to_db(shops: List[Dict]) -> int:
    """Save shops to MongoDB, avoiding duplicates"""
    if not shops:
        return 0
    
    saved_count = 0
    
    for shop in shops:
        # Check for duplicate by name and area
        existing = await db[SHOPS_COLLECTION].find_one({
            "name": {"$regex": f"^{re.escape(shop['name'][:50])}$", "$options": "i"},
            "area": shop.get('area', '')
        })
        
        if not existing:
            try:
                await db[SHOPS_COLLECTION].insert_one(shop)
                saved_count += 1
            except Exception as e:
                logger.error(f"Error saving shop: {e}")
    
    return saved_count


async def run_scraper(google_api_key: str = None, max_shops: int = 1500) -> Dict:
    """Run the complete scraping process"""
    logger.info(f"Starting Pune retail shop scraper (target: {max_shops} shops)")
    
    total_scraped = 0
    total_saved = 0
    errors = []
    
    # Create index for faster duplicate checking
    await db[SHOPS_COLLECTION].create_index([("name", 1), ("area", 1)])
    await db[SHOPS_COLLECTION].create_index([("source", 1)])
    await db[SHOPS_COLLECTION].create_index([("shop_type", 1)])
    
    async with aiohttp.ClientSession() as session:
        # JustDial scraping
        for area in PUNE_AREAS:
            if total_saved >= max_shops:
                break
                
            for query in SEARCH_QUERIES:
                if total_saved >= max_shops:
                    break
                
                # Scrape first 2-3 pages per query/area combo
                for page in range(1, 3):
                    shops = await scrape_justdial_search(session, query, area, page)
                    total_scraped += len(shops)
                    
                    if shops:
                        saved = await save_shops_to_db(shops)
                        total_saved += saved
                        logger.info(f"Saved {saved} shops from {area} - {query} (Total: {total_saved})")
                    
                    if not shops or total_saved >= max_shops:
                        break
        
        # Google Maps scraping (if API key provided)
        if google_api_key and total_saved < max_shops:
            for area in PUNE_AREAS[:10]:  # Limit to avoid API costs
                if total_saved >= max_shops:
                    break
                    
                for query in SEARCH_QUERIES[:5]:
                    shops = await scrape_google_maps_api(query, area, google_api_key)
                    total_scraped += len(shops)
                    
                    if shops:
                        saved = await save_shops_to_db(shops)
                        total_saved += saved
                    
                    await asyncio.sleep(1)  # API rate limit
    
    result = {
        "status": "completed",
        "total_scraped": total_scraped,
        "total_saved": total_saved,
        "duplicates_skipped": total_scraped - total_saved,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    logger.info(f"Scraping completed: {result}")
    return result


async def get_scraping_stats() -> Dict:
    """Get statistics about scraped data"""
    total = await db[SHOPS_COLLECTION].count_documents({})
    
    # Count by source
    by_source = await db[SHOPS_COLLECTION].aggregate([
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    # Count by shop type
    by_type = await db[SHOPS_COLLECTION].aggregate([
        {"$group": {"_id": "$shop_type", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    # Count by area
    by_area = await db[SHOPS_COLLECTION].aggregate([
        {"$group": {"_id": "$area", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]).to_list(20)
    
    return {
        "total_shops": total,
        "by_source": {item["_id"]: item["count"] for item in by_source},
        "by_type": {item["_id"]: item["count"] for item in by_type},
        "top_areas": {item["_id"]: item["count"] for item in by_area}
    }


async def search_shops(
    query: str = None,
    area: str = None,
    shop_type: str = None,
    has_phone: bool = None,
    skip: int = 0,
    limit: int = 50
) -> List[Dict]:
    """Search scraped shops with filters"""
    filter_query = {}
    
    if query:
        filter_query["name"] = {"$regex": query, "$options": "i"}
    if area:
        filter_query["area"] = {"$regex": area, "$options": "i"}
    if shop_type:
        filter_query["shop_type"] = shop_type
    if has_phone:
        filter_query["phone"] = {"$ne": "", "$exists": True}
    
    cursor = db[SHOPS_COLLECTION].find(filter_query, {"_id": 0})
    cursor = cursor.skip(skip).limit(limit).sort("name", 1)
    
    return await cursor.to_list(limit)


async def export_to_csv() -> str:
    """Export all shops to CSV format"""
    import csv
    import io
    
    shops = await db[SHOPS_COLLECTION].find({}, {"_id": 0}).to_list(10000)
    
    if not shops:
        return ""
    
    output = io.StringIO()
    fieldnames = ["name", "address", "phone", "area", "city", "shop_type", "source", "rating"]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
    
    writer.writeheader()
    for shop in shops:
        writer.writerow(shop)
    
    return output.getvalue()


# CLI for testing
if __name__ == "__main__":
    import sys
    
    async def main():
        if len(sys.argv) > 1 and sys.argv[1] == "stats":
            stats = await get_scraping_stats()
            print(json.dumps(stats, indent=2))
        elif len(sys.argv) > 1 and sys.argv[1] == "search":
            query = sys.argv[2] if len(sys.argv) > 2 else None
            shops = await search_shops(query=query, limit=20)
            for shop in shops:
                print(f"{shop['name']} - {shop['area']} - {shop.get('phone', 'N/A')}")
        else:
            # Run scraper
            google_key = os.environ.get('GOOGLE_MAPS_API_KEY')
            result = await run_scraper(google_api_key=google_key, max_shops=100)
            print(json.dumps(result, indent=2))
    
    asyncio.run(main())
