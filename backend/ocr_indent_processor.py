"""
OCR Indent Processor for Ninjacart Images
==========================================
Uses GPT-4o via emergentintegrations to extract indent data from images.
"""

import os
import base64
import json
import re
from datetime import datetime
from dotenv import load_dotenv
from typing import List, Optional
import httpx

load_dotenv()

# Import emergentintegrations for LLM chat with image
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


async def extract_indent_from_image(image_base64: str, mime_type: str = "image/png") -> dict:
    """
    Extract indent data from a Ninjacart indent image using GPT-4o vision.
    
    Args:
        image_base64: Base64 encoded image data
        mime_type: MIME type of the image (image/png, image/jpeg, etc.)
    
    Returns:
        dict with keys:
        - success: bool
        - indent_date: str (YYYY-MM-DD format)
        - items: list of dicts with product details
        - error: str (if success is False)
    """
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return {
            "success": False,
            "error": "EMERGENT_LLM_KEY not configured",
            "indent_date": None,
            "items": []
        }
    
    try:
        # Initialize LLM chat with GPT-4o for vision
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ocr_indent_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            system_message="""You are an expert at extracting structured data from Ninjacart indent images.
Your task is to carefully read the image and extract all product rows with their details.
Always return valid JSON. Be precise with numbers and product names."""
        ).with_model("openai", "gpt-4o")
        
        # Create image content
        image_content = ImageContent(image_base64=image_base64)
        
        # Create the extraction prompt
        extraction_prompt = """Analyze this Ninjacart indent image and extract the following information:

1. INDENT SUPPLY DATE - Look for a date in the header (format like "27.04.2026" or "27/04/2026")
2. For each product row, extract:
   - nc_sku_id: The full product name/SKU (e.g., "Amaranthus - Red - Kgs - FK", "Coriander (Kg) - FK")
   - uom: The first UOM column showing packaging size (e.g., "240-260g", "90-110gm", "200 g", "100gm")
   - ca: The unit type - either "KG" or "PCS"
   - units: The UNITS column value (total demand) - this is a number
   - mr_organix: The "Mr Organix" column value (order quantity allocated) - this is a number

IMPORTANT:
- Skip any header rows or totals rows
- If a value shows "#REF!" or "#N/A", still include the row but set that field to null
- Convert all numeric values to plain numbers (remove commas)
- Preserve the exact product names as shown

Return ONLY a valid JSON object in this exact format:
{
  "indent_date": "YYYY-MM-DD",
  "items": [
    {
      "nc_sku_id": "Product Name - Details",
      "uom": "packaging size",
      "ca": "KG or PCS",
      "units": 123,
      "mr_organix": 45
    }
  ]
}"""

        # Send message with image
        user_message = UserMessage(
            text=extraction_prompt,
            file_contents=[image_content]
        )
        
        response = await chat.send_message(user_message)
        
        # Parse the response - it should be JSON
        # Clean up response if it has markdown code blocks
        response_text = response.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        try:
            data = json.loads(response_text)
        except json.JSONDecodeError as e:
            # Try to extract JSON from the response
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                data = json.loads(json_match.group())
            else:
                return {
                    "success": False,
                    "error": f"Failed to parse LLM response as JSON: {str(e)}",
                    "raw_response": response_text[:500],
                    "indent_date": None,
                    "items": []
                }
        
        # Validate and clean the data
        indent_date = data.get("indent_date", "")
        items = data.get("items", [])
        
        # Convert date format if needed (DD.MM.YYYY -> YYYY-MM-DD)
        if indent_date and re.match(r'\d{2}\.\d{2}\.\d{4}', indent_date):
            parts = indent_date.split('.')
            indent_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
        elif indent_date and re.match(r'\d{2}/\d{2}/\d{4}', indent_date):
            parts = indent_date.split('/')
            indent_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
        
        # Clean up items
        cleaned_items = []
        for item in items:
            cleaned_item = {
                "nc_sku_id": str(item.get("nc_sku_id", "")).strip(),
                "uom": str(item.get("uom", "")).strip(),
                "ca": str(item.get("ca", "KG")).upper().strip(),
                "units": _parse_number(item.get("units")),
                "mr_organix": _parse_number(item.get("mr_organix"))
            }
            # Only include items with valid product names and quantities
            if cleaned_item["nc_sku_id"] and cleaned_item["mr_organix"] > 0:
                cleaned_items.append(cleaned_item)
        
        return {
            "success": True,
            "indent_date": indent_date,
            "items": cleaned_items,
            "error": None
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"OCR processing failed: {str(e)}",
            "indent_date": None,
            "items": []
        }


def _parse_number(value) -> float:
    """Parse a number from various formats."""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove commas and parse
        cleaned = value.replace(",", "").replace(" ", "").strip()
        # Handle #REF! or #N/A
        if cleaned.startswith("#") or cleaned.lower() in ["null", "none", "n/a", ""]:
            return 0
        try:
            return float(cleaned)
        except ValueError:
            return 0
    return 0


def map_sku_to_product(nc_sku_id: str, products_list: list) -> dict:
    """
    Map a Ninjacart SKU to an existing product in the database.
    
    Args:
        nc_sku_id: The NC SKU ID string (e.g., "Coriander (Kg) - FK")
        products_list: List of products from database
    
    Returns:
        dict with product_id and product_name if found, else None values
    """
    if not nc_sku_id or not products_list:
        return {"product_id": None, "product_name": nc_sku_id}
    
    # Clean up the SKU name for matching
    sku_clean = nc_sku_id.lower().strip()
    
    # Remove common suffixes like "- FK", "(Kg)", "(PCS)"
    sku_clean = re.sub(r'\s*-\s*fk\s*$', '', sku_clean, flags=re.IGNORECASE)
    sku_clean = re.sub(r'\s*\(kg\)\s*', ' ', sku_clean, flags=re.IGNORECASE)
    sku_clean = re.sub(r'\s*\(pcs\)\s*', ' ', sku_clean, flags=re.IGNORECASE)
    sku_clean = re.sub(r'\s*\(kg\s*\)\s*', ' ', sku_clean, flags=re.IGNORECASE)
    sku_clean = re.sub(r'\s*-\s*kgs\s*', ' ', sku_clean, flags=re.IGNORECASE)
    sku_clean = re.sub(r'\s+', ' ', sku_clean).strip()
    
    # Extract key product name parts
    # Common patterns: "Amaranthus - Red", "Coriander", "Fresh Mint Leaves"
    product_keywords = sku_clean.split()
    
    best_match = None
    best_score = 0
    
    for product in products_list:
        product_name = product.get("name", "").lower()
        
        # Exact match (case insensitive)
        if product_name == sku_clean:
            return {"product_id": product.get("id"), "product_name": product.get("name")}
        
        # Check if product name contains key parts
        score = 0
        for keyword in product_keywords:
            if len(keyword) > 2 and keyword in product_name:
                score += 1
        
        # Check specific product mappings
        if "amaranthus" in sku_clean and "amaranthus" in product_name:
            if "red" in sku_clean and "red" in product_name:
                score += 5
            elif "green" in sku_clean and "green" in product_name:
                score += 5
            else:
                score += 2
        elif "coriander" in sku_clean and "coriander" in product_name:
            score += 3
        elif "curry" in sku_clean and "leaves" in sku_clean and "curry" in product_name:
            score += 3
        elif "dill" in sku_clean and "dill" in product_name:
            score += 3
        elif "mint" in sku_clean and "mint" in product_name:
            if "premium" in sku_clean and "premium" in product_name:
                score += 2
            score += 3
        elif "palak" in sku_clean and "palak" in product_name:
            score += 3
        elif "spinach" in sku_clean and ("spinach" in product_name or "palak" in product_name):
            score += 3
        elif "fenugreek" in sku_clean or "methi" in sku_clean:
            if "fenugreek" in product_name or "methi" in product_name:
                score += 3
        
        if score > best_score:
            best_score = score
            best_match = product
    
    if best_match and best_score >= 2:
        return {"product_id": best_match.get("id"), "product_name": best_match.get("name")}
    
    # No good match found - return the original name
    return {"product_id": None, "product_name": nc_sku_id}


def map_uom_to_packaging(uom: str, ca: str, packagings_list: list) -> dict:
    """
    Map UOM string to a packaging variant.
    
    Args:
        uom: The UOM string (e.g., "240-260g", "90-110gm", "200 g")
        ca: The CA unit type (KG or PCS)
        packagings_list: List of packaging variants from database
    
    Returns:
        dict with packaging_id, packaging_name, and weight_gm
    """
    if not uom or not packagings_list:
        return {"packaging_id": None, "packaging_name": uom or ca, "weight_gm": 0}
    
    uom_clean = uom.lower().strip()
    
    # Extract weight from UOM
    weight_gm = 0
    
    # Pattern: "240-260g" -> average 250
    range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(g|gm|gms|gram)', uom_clean)
    if range_match:
        low = int(range_match.group(1))
        high = int(range_match.group(2))
        weight_gm = (low + high) / 2
    else:
        # Pattern: "200 g" or "100gm"
        single_match = re.search(r'(\d+)\s*(g|gm|gms|gram)', uom_clean)
        if single_match:
            weight_gm = int(single_match.group(1))
    
    # Try to find matching packaging
    best_match = None
    best_diff = float('inf')
    
    for pkg in packagings_list:
        pkg_weight = pkg.get("weight_gm", 0)
        pkg_name = pkg.get("name", "").lower()
        
        # Check for name match
        if uom_clean in pkg_name or pkg_name in uom_clean:
            return {
                "packaging_id": pkg.get("id"),
                "packaging_name": pkg.get("name"),
                "weight_gm": pkg_weight or weight_gm
            }
        
        # Check weight match
        if pkg_weight > 0 and weight_gm > 0:
            diff = abs(pkg_weight - weight_gm)
            if diff < best_diff and diff <= 30:  # Allow 30g tolerance
                best_diff = diff
                best_match = pkg
    
    if best_match:
        return {
            "packaging_id": best_match.get("id"),
            "packaging_name": best_match.get("name"),
            "weight_gm": best_match.get("weight_gm", weight_gm)
        }
    
    # No match - return extracted info
    return {
        "packaging_id": None,
        "packaging_name": uom,
        "weight_gm": weight_gm
    }
