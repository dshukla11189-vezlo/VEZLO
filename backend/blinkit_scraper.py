"""
Blinkit Price Scraper Service
Scrapes product prices from Blinkit based on pincode
"""

import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Optional
from playwright.async_api import async_playwright, Browser, Page, BrowserContext
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set playwright browsers path
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = '/pw-browsers'

class BlinkitScraper:
    """Scraper for Blinkit grocery prices"""
    
    def __init__(self, pincode: str = "411045"):
        self.pincode = pincode
        self.base_url = "https://blinkit.com"
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        
    async def initialize(self):
        """Initialize browser with anti-detection measures"""
        playwright = await async_playwright().start()
        
        # Launch with anti-detection flags
        self.browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        )
        
        # Create context with realistic settings
        self.context = await self.browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080},
            locale='en-IN',
            timezone_id='Asia/Kolkata'
        )
        
        self.page = await self.context.new_page()
        
        # Remove webdriver property
        await self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)
        
        logger.info(f"Browser initialized for pincode: {self.pincode}")
        
    async def set_location(self) -> bool:
        """Navigate to Blinkit and set delivery location"""
        try:
            await self.page.goto(self.base_url, wait_until="domcontentloaded", timeout=30000)
            await self.page.wait_for_timeout(3000)
            
            logger.info(f"Page loaded: {await self.page.title()}")
            
            # Look for location/address input or detect button
            # Blinkit usually shows a location popup or has a detect location button
            try:
                # Try clicking on location selector if visible
                location_btn = self.page.locator('button:has-text("Detect"), button:has-text("Location"), [data-testid="header-location"]').first
                if await location_btn.count() > 0:
                    await location_btn.click()
                    await self.page.wait_for_timeout(2000)
            except:
                pass
            
            # Try entering pincode in any visible input
            try:
                pincode_input = self.page.locator('input[placeholder*="pincode"], input[placeholder*="location"], input[type="text"]').first
                if await pincode_input.count() > 0 and await pincode_input.is_visible():
                    await pincode_input.fill(self.pincode)
                    await self.page.wait_for_timeout(1500)
                    await self.page.keyboard.press('Enter')
                    await self.page.wait_for_timeout(2000)
            except:
                pass
                
            logger.info(f"Location setup completed for pincode: {self.pincode}")
            return True
                
        except Exception as e:
            logger.error(f"Error setting location: {e}")
            return False
    
    async def search_product(self, product_name: str) -> list:
        """Search for a product and return price data"""
        results = []
        
        try:
            # Navigate to search page directly
            search_url = f"https://blinkit.com/s/?q={product_name.replace(' ', '%20')}"
            await self.page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
            await self.page.wait_for_timeout(3000)
            
            # Wait for products to load
            try:
                await self.page.wait_for_selector('[class*="Product"], [class*="product"], div[role="listitem"]', timeout=10000)
            except:
                logger.warning(f"No product elements found for: {product_name}")
            
            # Extract prices from page
            results = await self._extract_prices_from_page(product_name)
                
        except Exception as e:
            logger.error(f"Error searching for {product_name}: {e}")
            
        return results
    
    async def _extract_prices_from_page(self, search_term: str) -> list:
        """Extract product prices from search results page"""
        results = []
        
        try:
            # Get all text content from the page
            page_content = await self.page.content()
            
            # Try multiple strategies to find products and prices
            # Strategy 1: Look for product cards with data attributes
            cards = await self.page.locator('[class*="Product"], [class*="plp-product"], [data-testid*="product"]').all()
            
            if not cards:
                # Strategy 2: Look for any divs that might be product cards
                cards = await self.page.locator('div[class*="tw-"]').all()
            
            logger.info(f"Found {len(cards)} potential product elements for: {search_term}")
            
            # Extract data from each card
            for i, card in enumerate(cards[:15]):  # Limit to first 15
                try:
                    card_text = await card.inner_text()
                    
                    # Skip if card text is too short or doesn't contain price
                    if len(card_text) < 10 or '₹' not in card_text:
                        continue
                    
                    lines = [l.strip() for l in card_text.split('\n') if l.strip()]
                    
                    # Extract price
                    price = None
                    product_name_found = None
                    quantity = None
                    
                    for line in lines:
                        # Price pattern
                        price_match = re.search(r'₹\s*(\d+(?:\.\d{2})?)', line)
                        if price_match and not price:
                            price = float(price_match.group(1))
                        
                        # Quantity pattern
                        qty_match = re.search(r'(\d+(?:\.\d+)?)\s*(g|kg|ml|l|pc|pcs|pack|dozen|gm)\b', line, re.IGNORECASE)
                        if qty_match and not quantity:
                            quantity = f"{qty_match.group(1)} {qty_match.group(2)}"
                        
                        # Product name - look for lines that might be product names
                        if len(line) > 5 and not re.search(r'^₹|^ADD|^Out of|^\d+\s*(g|kg|ml|l)\s*$', line, re.IGNORECASE):
                            if not product_name_found or (len(line) > len(product_name_found) and len(line) < 80):
                                # Check if search term is in the line (case insensitive)
                                if search_term.lower() in line.lower():
                                    product_name_found = line
                    
                    if price:
                        results.append({
                            'blinkit_name': product_name_found or f"Product for {search_term}",
                            'price': price,
                            'quantity': quantity,
                            'search_term': search_term
                        })
                        
                        # Found a valid result, no need to continue
                        if len(results) >= 3:
                            break
                            
                except Exception as e:
                    continue
            
            # If no structured results, try regex on full page
            if not results:
                # Find all prices on page
                price_matches = re.findall(r'₹\s*(\d+(?:\.\d{2})?)', page_content)
                if price_matches:
                    # Take the first reasonable price (not too low, not too high)
                    for p in price_matches[:10]:
                        price_val = float(p)
                        if 5 <= price_val <= 1000:  # Reasonable price range
                            results.append({
                                'blinkit_name': f"{search_term} (Blinkit)",
                                'price': price_val,
                                'quantity': None,
                                'search_term': search_term
                            })
                            break
                    
        except Exception as e:
            logger.error(f"Error extracting prices: {e}")
            
        return results
    
    async def scrape_products(self, product_names: list) -> dict:
        """Scrape prices for multiple products"""
        all_results = {}
        
        try:
            await self.initialize()
            await self.set_location()
            
            for product_name in product_names:
                logger.info(f"Searching for: {product_name}")
                results = await self.search_product(product_name)
                
                if results:
                    # Get the best match (first result)
                    all_results[product_name] = results[0]
                    logger.info(f"Found price for {product_name}: ₹{results[0]['price']}")
                else:
                    logger.warning(f"No results found for: {product_name}")
                
                # Small delay between searches
                await self.page.wait_for_timeout(1000)
                
        except Exception as e:
            logger.error(f"Error during scrape: {e}")
        finally:
            await self.close()
            
        return all_results
    
    async def close(self):
        """Close browser"""
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            logger.info("Browser closed")
        except:
            pass


async def scrape_blinkit_prices(pincode: str, product_names: list) -> dict:
    """Main function to scrape Blinkit prices"""
    scraper = BlinkitScraper(pincode=pincode)
    results = await scraper.scrape_products(product_names)
    return results


# For testing
if __name__ == "__main__":
    test_products = ["Tomato", "Onion", "Potato", "Banana", "Apple"]
    results = asyncio.run(scrape_blinkit_prices("411045", test_products))
    print("Results:", results)
