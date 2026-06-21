"""
Combo Product Parsing Utilities
================================
Handles parsing of combo product names that contain ingredient breakdowns.

Format examples:
- Coriander and mint leaves (220 gm Pack)-FK : ( Coriander - 120 gm & Mint 100 gm)
- Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)
- fresh spices mix(620 gm Pack)-FK : (Green chill 100gm, Coriander 120gm, Garlic 200gm, Ginger 200gm)
"""

import re
from typing import Optional, List, Dict, Tuple
import logging

# Ingredient name normalization map - maps various spellings to standard product names
INGREDIENT_NAME_MAP = {
    'coriander': 'Coriander',
    'mint': 'Fresh Mint Leaves',
    'curry': 'Curry Leaves',
    'curry leaves': 'Curry Leaves',
    'palak': 'Palak',
    'spinach': 'Palak',
    'green chilli': 'Green Chilli',
    'green chill': 'Green Chilli',
    'green chili': 'Green Chilli',
    'chilli': 'Green Chilli',
    'garlic': 'Garlic',
    'ginger': 'Ginger',
    'fenugreek': 'Fenugreek (Methi)',
    'methi': 'Fenugreek (Methi)',
    'dill': 'Dill Leaf',
    'dill leaf': 'Dill Leaf',
}


def is_combo_product(product_name: str) -> bool:
    """
    Check if a product name is a combo product.
    Combo products have the format: "Name (weight Pack)-FK : (ingredients)"
    """
    if not product_name:
        return False
    return ':' in product_name and '(' in product_name and ')' in product_name


def parse_combo_product(product_name: str) -> Optional[Dict]:
    """
    Parse a combo product name and extract its components.
    
    Input formats:
    - "Coriander and mint leaves (220 gm Pack)-FK : ( Coriander - 120 gm & Mint 100 gm)"
    - "Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)"
    
    Returns:
    {
        'name': 'Herbs mix',
        'total_weight_gm': 280,
        'location': 'FK',
        'ingredients': [
            {'name': 'Curry Leaves', 'raw_name': 'Curry', 'weight_gm': 60},
            {'name': 'Coriander', 'raw_name': 'Coriander', 'weight_gm': 120},
            {'name': 'Fresh Mint Leaves', 'raw_name': 'Mint', 'weight_gm': 100}
        ],
        'is_combo': True
    }
    """
    if not product_name or ':' not in product_name:
        return None
    
    try:
        # Split by colon - left side is combo name+weight, right side is ingredients
        parts = product_name.split(':')
        if len(parts) != 2:
            return None
        
        left_part = parts[0].strip()
        right_part = parts[1].strip()
        
        # Parse left part: "Herbs mix(280 gm Pack)-FK" or "Coriander and mint leaves (220 gm Pack)-FK"
        # Pattern: name (weight gm Pack)-location
        left_pattern = r'^(.+?)\s*\((\d+)\s*(?:gm|g)\s*(?:Pack|pack)?\)\s*-?\s*([A-Z]{2,})?$'
        left_match = re.match(left_pattern, left_part, re.IGNORECASE)
        
        if not left_match:
            # Try without location suffix
            left_pattern_no_loc = r'^(.+?)\s*\((\d+)\s*(?:gm|g)\s*(?:Pack|pack)?\)$'
            left_match = re.match(left_pattern_no_loc, left_part, re.IGNORECASE)
            if left_match:
                combo_name = left_match.group(1).strip()
                total_weight = int(left_match.group(2))
                location = None
            else:
                logging.warning(f"Could not parse combo left part: {left_part}")
                return None
        else:
            combo_name = left_match.group(1).strip()
            total_weight = int(left_match.group(2))
            location = left_match.group(3)
        
        # Parse right part (ingredients): "( Coriander - 120 gm & Mint 100 gm)" or "(Curry 60 gm, Coriander 120 gm)"
        # Remove outer parentheses
        ingredients_str = right_part.strip()
        if ingredients_str.startswith('(') and ingredients_str.endswith(')'):
            ingredients_str = ingredients_str[1:-1].strip()
        
        # Pre-process: fix typos like "Palak, 300 gm" -> "Palak 300 gm"
        # Replace comma followed by space and number with just space and number
        ingredients_str = re.sub(r',\s*(\d+)\s*(?:gm|g)', r' \1 gm', ingredients_str)
        
        # Split ingredients by comma or ampersand
        # Handle both "Coriander - 120 gm" and "Coriander 120gm" formats
        ingredient_parts = re.split(r'[,&]', ingredients_str)
        
        ingredients = []
        for ing_part in ingredient_parts:
            ing_part = ing_part.strip()
            if not ing_part:
                continue
            
            # Pattern: "ingredient_name - weight gm" or "ingredient_name weight gm" or "ingredient_name, weight gm"
            # Examples: "Coriander - 120 gm", "Mint 100 gm", "Curry 60 gm", "Palak, 300 gm", "Green chill 100gm"
            ing_pattern = r'^(.+?)\s*[-,]?\s*(\d+)\s*(?:gm|g)?$'
            ing_match = re.match(ing_pattern, ing_part, re.IGNORECASE)
            
            if ing_match:
                raw_name = ing_match.group(1).strip()
                weight_gm = int(ing_match.group(2))
                
                # Normalize ingredient name
                normalized_name = normalize_ingredient_name(raw_name)
                
                ingredients.append({
                    'name': normalized_name,
                    'raw_name': raw_name,
                    'weight_gm': weight_gm
                })
            else:
                logging.warning(f"Could not parse ingredient: {ing_part}")
        
        if not ingredients:
            return None
        
        return {
            'name': combo_name,
            'total_weight_gm': total_weight,
            'location': location,
            'ingredients': ingredients,
            'is_combo': True,
            'original_name': product_name
        }
    
    except Exception as e:
        logging.error(f"Error parsing combo product '{product_name}': {e}")
        return None


def normalize_ingredient_name(raw_name: str) -> str:
    """
    Normalize an ingredient name to match our product database.
    """
    if not raw_name:
        return raw_name
    
    # Clean up the name
    clean_name = raw_name.strip().lower()
    
    # Remove common suffixes/prefixes
    clean_name = re.sub(r'\s*leaves?\s*$', '', clean_name)
    clean_name = clean_name.strip()
    
    # Check our mapping
    if clean_name in INGREDIENT_NAME_MAP:
        return INGREDIENT_NAME_MAP[clean_name]
    
    # Try partial matches
    for key, value in INGREDIENT_NAME_MAP.items():
        if key in clean_name or clean_name in key:
            return value
    
    # If no mapping found, capitalize first letter of each word
    return raw_name.strip().title()


def calculate_combo_cogs(combo_info: Dict, daily_cogs_map: Dict, date_str: str) -> Dict:
    """
    Calculate the COGS for a combo product based on its ingredients.
    
    Args:
        combo_info: Parsed combo information from parse_combo_product()
        daily_cogs_map: Map of (product_name, date) -> daily_cogs_rate
        date_str: The date for which to look up COGS
    
    Returns:
        {
            'total_cogs_per_pack': 45.50,  # Total COGS for one pack of the combo
            'cogs_per_kg': 162.50,  # COGS per kg of the combo
            'ingredients_breakdown': [
                {'name': 'Coriander', 'weight_gm': 120, 'cogs_rate': 50, 'cogs_amount': 6.0},
                ...
            ]
        }
    """
    if not combo_info or not combo_info.get('ingredients'):
        return {'total_cogs_per_pack': 0, 'cogs_per_kg': 0, 'ingredients_breakdown': []}
    
    total_cogs = 0
    ingredients_breakdown = []
    
    for ingredient in combo_info['ingredients']:
        ing_name = ingredient['name']
        weight_gm = ingredient['weight_gm']
        weight_kg = weight_gm / 1000
        
        # Look up the daily COGS for this ingredient
        cogs_rate = 0
        
        # Try exact match first
        key = (ing_name, date_str)
        if key in daily_cogs_map:
            cogs_rate = daily_cogs_map[key]
        else:
            # Try to find a partial match in the daily_cogs_map
            for (product, d), rate in daily_cogs_map.items():
                if d == date_str:
                    if ing_name.lower() in product.lower() or product.lower() in ing_name.lower():
                        cogs_rate = rate
                        break
        
        # Calculate COGS for this ingredient
        cogs_amount = weight_kg * cogs_rate
        total_cogs += cogs_amount
        
        ingredients_breakdown.append({
            'name': ing_name,
            'raw_name': ingredient['raw_name'],
            'weight_gm': weight_gm,
            'weight_kg': round(weight_kg, 4),
            'cogs_rate_per_kg': round(cogs_rate, 2),
            'cogs_amount': round(cogs_amount, 2)
        })
    
    # Calculate COGS per kg of the combo
    total_weight_kg = combo_info['total_weight_gm'] / 1000
    cogs_per_kg = total_cogs / total_weight_kg if total_weight_kg > 0 else 0
    
    return {
        'total_cogs_per_pack': round(total_cogs, 2),
        'cogs_per_kg': round(cogs_per_kg, 2),
        'total_weight_gm': combo_info['total_weight_gm'],
        'ingredients_breakdown': ingredients_breakdown
    }


def calculate_combo_wastage_share(
    combo_info: Dict,
    combo_qty_supplied: float,
    ingredient_totals: Dict,  # {ingredient_name: {'supplied_kg': X, 'wastage_kg': Y, 'wastage_value': Z}}
) -> Dict:
    """
    Calculate the proportional wastage share for a combo product.
    
    If total Coriander supplied = 100 kg and 5 kg was used in combos,
    and total Coriander wastage = 50 kg,
    then combo's wastage share = 50 kg × (5/100) = 2.5 kg
    
    Args:
        combo_info: Parsed combo information
        combo_qty_supplied: Number of combo packs supplied
        ingredient_totals: Total supplied and wastage for each ingredient
    
    Returns:
        {
            'total_wastage_share_kg': 2.5,
            'total_wastage_share_value': 125.0,
            'ingredients_wastage': [
                {'name': 'Coriander', 'used_in_combo_kg': 5, 'wastage_share_kg': 2.5, 'wastage_share_value': 125},
                ...
            ]
        }
    """
    if not combo_info or not combo_info.get('ingredients'):
        return {'total_wastage_share_kg': 0, 'total_wastage_share_value': 0, 'ingredients_wastage': []}
    
    total_wastage_kg = 0
    total_wastage_value = 0
    ingredients_wastage = []
    
    for ingredient in combo_info['ingredients']:
        ing_name = ingredient['name']
        weight_gm = ingredient['weight_gm']
        
        # Calculate how much of this ingredient was used in the combo
        # combo_qty_supplied packs × weight_gm per pack = total used
        used_in_combo_kg = (combo_qty_supplied * weight_gm) / 1000
        
        # Look up total supplied and wastage for this ingredient
        ing_totals = ingredient_totals.get(ing_name, {})
        total_supplied_kg = ing_totals.get('supplied_kg', 0)
        total_wastage_kg_ing = ing_totals.get('wastage_kg', 0)
        total_wastage_value_ing = ing_totals.get('wastage_value', 0)
        
        # Calculate proportional wastage share
        if total_supplied_kg > 0:
            proportion = used_in_combo_kg / total_supplied_kg
            wastage_share_kg = total_wastage_kg_ing * proportion
            wastage_share_value = total_wastage_value_ing * proportion
        else:
            wastage_share_kg = 0
            wastage_share_value = 0
        
        total_wastage_kg += wastage_share_kg
        total_wastage_value += wastage_share_value
        
        ingredients_wastage.append({
            'name': ing_name,
            'used_in_combo_kg': round(used_in_combo_kg, 4),
            'total_supplied_kg': round(total_supplied_kg, 4),
            'proportion': round(proportion, 4) if total_supplied_kg > 0 else 0,
            'wastage_share_kg': round(wastage_share_kg, 4),
            'wastage_share_value': round(wastage_share_value, 2)
        })
    
    return {
        'total_wastage_share_kg': round(total_wastage_kg, 4),
        'total_wastage_share_value': round(total_wastage_value, 2),
        'ingredients_wastage': ingredients_wastage
    }


# Pre-defined combo products for reference (can be used for validation)
KNOWN_COMBO_PRODUCTS = [
    "Coriander and mint leaves (220 gm Pack)-FK : ( Coriander - 120 gm & Mint 100 gm)",
    "Curry leaves and coriander leaves(220 gm Pack)-FK : (Curry 100gm, Coriander 120 gm)",
    "Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)",
    "fresh spices mix(620 gm Pack)-FK : (Green chill 100gm, Coriander 120gm, Garlic 200gm, Ginger 200gm)",
    "Spinach and Coriander leaves(420 gm Pack)-FK : (Coriander 120 gm, Palak, 300 gm)",
]


def get_combo_sku_mappings() -> Dict[str, str]:
    """
    Return mappings from Excel/Ninjacart SKU names to internal combo product names.
    These are used during GRN upload to match SKUs to products.
    """
    return {
        # Ninjacart SKU names (lowercase) -> Internal combo product display names
        'coriander and mint leaves': 'Coriander and mint leaves',
        'coriander and mint': 'Coriander and mint leaves',
        'curry leaves and coriander leaves': 'Curry leaves and coriander leaves',
        'curry and coriander': 'Curry leaves and coriander leaves',
        'herbs mix': 'Herbs mix',
        'fresh spices mix': 'fresh spices mix',
        'spices mix': 'fresh spices mix',
        'spinach and coriander leaves': 'Spinach and Coriander leaves',
        'spinach and coriander': 'Spinach and Coriander leaves',
        'palak and coriander': 'Spinach and Coriander leaves',
    }
