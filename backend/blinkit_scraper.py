"""
Blinkit Price Scraper Service
Scrapes product prices from Blinkit based on pincode
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Optional
from playwright.async_api import async_playwright, Browser, Page
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BlinkitScraper:
    """Scraper for Blinkit grocery prices"""
    
    def __init__(self, pincode: str = "411045"):
        self.pincode = pincode
        self.base_url = "https://blinkit.com"
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        
    async def initialize(self):
        """Initialize browser and set location"""
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        self.page = await self.browser.new_page()
        await self.page.set_viewport_size({"width": 1920, "height": 1080})
        
        # Set user agent to avoid detection
        await self.page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        
        logger.info(f"Browser initialized for pincode: {self.pincode}")
        
    async def set_location(self) -> bool:
        """Set delivery location using pincode"""
        try:
            await self.page.goto(self.base_url, wait_until="networkidle", timeout=30000)
            await self.page.wait_for_timeout(2000)
            
            # Look for location/pincode input - Blinkit may show a location popup
            # Try to find and click on location selector
            location_selectors = [
                'input[placeholder*="search delivery location"]',
                'input[placeholder*="Enter your delivery location"]',
                'input[placeholder*="pincode"]',
                '[data-testid="location-input"]',
                'input[type="text"][class*="location"]'
            ]
            
            location_input = None
            for selector in location_selectors:
                try:
                    element = self.page.locator(selector).first
                    if await element.count() > 0:
                        location_input = element
                        break
                except:
                    continue
            
            if location_input:
                await location_input.click()
                await location_input.fill(self.pincode)
                await self.page.wait_for_timeout(1500)
                
                # Try to click on first location result
                result_selectors = [
                    'div[class*="LocationSearchList"]',
                    'div[class*="location-result"]',
                    '[data-testid="location-result"]'
                ]
                
                for selector in result_selectors:
                    try:
                        result = self.page.locator(selector).first
                        if await result.count() > 0:
                            await result.click()
                            await self.page.wait_for_timeout(2000)
                            break
                    except:
                        continue
                        
                logger.info(f"Location set to pincode: {self.pincode}")
                return True
            else:
                # Location might already be set or not required
                logger.warning("Could not find location input, proceeding anyway")
                return True
                
        except Exception as e:
            logger.error(f"Error setting location: {e}")
            return False
    
    async def search_product(self, product_name: str) -> list:
        """Search for a product and return price data"""
        results = []
        
        try:
            # Find search input
            search_selectors = [
                'input[class*="SearchBarContainer"]',
                'input[placeholder*="Search"]',
                'input[type="search"]',
                '[data-testid="search-input"]'
            ]
            
            search_input = None
            for selector in search_selectors:
                try:
                    element = self.page.locator(selector).first
                    if await element.count() > 0:
                        search_input = element
                        break
                except:
                    continue
            
            if not search_input:
                # Try clicking search icon first
                search_icons = ['[class*="SearchIcon"]', '[data-testid="search-icon"]', 'svg[class*="search"]']
                for icon_sel in search_icons:
                    try:
                        icon = self.page.locator(icon_sel).first
                        if await icon.count() > 0:
                            await icon.click()
                            await self.page.wait_for_timeout(1000)
                            break
                    except:
                        continue
                
                # Try finding search input again
                for selector in search_selectors:
                    try:
                        element = self.page.locator(selector).first
                        if await element.count() > 0:
                            search_input = element
                            break
                    except:
                        continue
            
            if search_input:
                await search_input.click()
                await search_input.fill("")
                await search_input.fill(product_name)
                await self.page.keyboard.press("Enter")
                await self.page.wait_for_timeout(3000)
                
                # Wait for results to load
                await self.page.wait_for_load_state("networkidle", timeout=10000)
                
                # Extract product cards
                results = await self._extract_product_cards(product_name)
            else:
                logger.warning(f"Could not find search input for: {product_name}")
                
        except Exception as e:
            logger.error(f"Error searching for {product_name}: {e}")
            
        return results
    
    async def _extract_product_cards(self, search_term: str) -> list:
        """Extract product information from search results"""
        results = []
        
        try:
            # Common product card selectors for Blinkit
            card_selectors = [
                'div[class*="Product__UpdatedPlpProductContainer"]',
                'div[class*="plp-product"]',
                '[data-testid="product-card"]',
                'div[class*="ProductCard"]',
                'a[class*="Product"]'
            ]
            
            cards = None
            for selector in card_selectors:
                try:
                    elements = self.page.locator(selector)
                    count = await elements.count()
                    if count > 0:
                        cards = elements
                        logger.info(f"Found {count} product cards with selector: {selector}")
                        break
                except:
                    continue
            
            if not cards:
                # Try a more generic approach - look for price patterns in the page
                page_content = await self.page.content()
                # Extract prices using regex from page content
                price_pattern = r'₹\s*(\d+(?:\.\d{2})?)'
                prices_found = re.findall(price_pattern, page_content)
                if prices_found:
                    logger.info(f"Found prices in page: {prices_found[:5]}")
                return results
            
            # Extract data from each card
            card_count = min(await cards.count(), 10)  # Limit to first 10 results
            
            for i in range(card_count):
                try:
                    card = cards.nth(i)
                    card_text = await card.inner_text()
                    
                    # Parse card text to extract product info
                    lines = [line.strip() for line in card_text.split('\n') if line.strip()]
                    
                    # Try to find price (usually contains ₹)
                    price = None
                    product_name_found = None
                    quantity = None
                    
                    for line in lines:
                        # Price pattern
                        price_match = re.search(r'₹\s*(\d+(?:\.\d{2})?)', line)
                        if price_match and not price:
                            price = float(price_match.group(1))
                        
                        # Quantity pattern (e.g., "500 g", "1 kg", "1 L")
                        qty_match = re.search(r'(\d+(?:\.\d+)?)\s*(g|kg|ml|l|pc|pcs|pack|dozen)\b', line, re.IGNORECASE)
                        if qty_match and not quantity:
                            quantity = f"{qty_match.group(1)} {qty_match.group(2)}"
                        
                        # Product name - usually the longest meaningful line
                        if len(line) > 10 and not price_match and not line.startswith('ADD'):
                            if not product_name_found or len(line) > len(product_name_found):
                                product_name_found = line
                    
                    if price and product_name_found:
                        results.append({
                            'blinkit_name': product_name_found,
                            'price': price,
                            'quantity': quantity,
                            'search_term': search_term,
                            'raw_text': card_text[:200]
                        })
                        
                except Exception as e:
                    logger.error(f"Error extracting card {i}: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"Error extracting product cards: {e}")
            
        return results
    
    async def scrape_products(self, product_names: list) -> dict:
        """Scrape prices for multiple products"""
        all_results = {}
        
        try:
            await self.initialize()
            location_set = await self.set_location()
            
            if not location_set:
                logger.error("Failed to set location, aborting scrape")
                return all_results
            
            for product_name in product_names:
                logger.info(f"Searching for: {product_name}")
                results = await self.search_product(product_name)
                
                if results:
                    # Get the best match (first result usually)
                    all_results[product_name] = results[0]
                    logger.info(f"Found price for {product_name}: ₹{results[0]['price']}")
                else:
                    logger.warning(f"No results found for: {product_name}")
                
                # Small delay between searches to avoid rate limiting
                await self.page.wait_for_timeout(1500)
                
        except Exception as e:
            logger.error(f"Error during scrape: {e}")
        finally:
            await self.close()
            
        return all_results
    
    async def close(self):
        """Close browser"""
        if self.browser:
            await self.browser.close()
            logger.info("Browser closed")


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
