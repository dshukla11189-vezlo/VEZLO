"""
Database Migrations for Product BOM Structure
==============================================
One-time migrations to set up combo products with bill-of-materials structure.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from dependencies import db
from routes.auth import get_current_user
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/migrate/setup-immunity-booster-combo")
async def setup_immunity_booster_combo(current_user: dict = Depends(get_current_user)):
    """
    Set up the Immunity Booster Combo product with proper BOM structure.
    
    Components (per 300gm pack):
    - Ginger: 75gm
    - Fresh Mint Leaves: 75gm
    - Amla: 75gm
    - Lemon: 75gm
    
    This migration:
    1. Creates/updates the Immunity Booster Combo product with is_combo=True and components[]
    2. Adds aliases for GRN matching
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    try:
        # Find component products by name
        component_names = ["Ginger", "Fresh Mint Leaves", "Amla", "Lemon"]
        component_products = {}
        
        for name in component_names:
            product = await db.products.find_one({"name": name}, {"_id": 0})
            if not product:
                # Try partial match
                product = await db.products.find_one(
                    {"name": {"$regex": name, "$options": "i"}}, 
                    {"_id": 0}
                )
            if product:
                component_products[name] = product
                logger.info(f"Found component: {name} -> {product.get('id')}")
            else:
                logger.warning(f"Component product not found: {name}")
        
        if len(component_products) < 4:
            missing = [n for n in component_names if n not in component_products]
            return {
                "success": False,
                "message": f"Missing component products: {missing}. Please create them first.",
                "found_components": list(component_products.keys())
            }
        
        # Build components array
        components = []
        for name in component_names:
            product = component_products[name]
            components.append({
                "product_id": product["id"],
                "product_name": product["name"],
                "weight_gm": 75  # Each component is 75gm per 300gm combo
            })
        
        # Check if Immunity Booster Combo already exists
        existing = await db.products.find_one(
            {"name": {"$regex": "immunity.*booster", "$options": "i"}},
            {"_id": 0}
        )
        
        if existing:
            # Update existing product
            result = await db.products.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "is_combo": True,
                    "components": components,
                    "aliases": [
                        "immunity booster combo",
                        "immunity booster",
                        "immunity combo",
                        "immunity booster pack",
                        "IB Combo"
                    ],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            logger.info(f"Updated Immunity Booster Combo: {existing['id']}")
            
            return {
                "success": True,
                "action": "updated",
                "product_id": existing["id"],
                "product_name": existing["name"],
                "components": components,
                "message": f"Updated existing product with BOM structure"
            }
        else:
            # Create new product
            new_product = {
                "id": str(uuid.uuid4()),
                "name": "Immunity Booster Combo",
                "category": "Combo",
                "product_type": "Combo",
                "unit": "Pack",
                "current_stock": 0,
                "is_combo": True,
                "components": components,
                "aliases": [
                    "immunity booster combo",
                    "immunity booster",
                    "immunity combo",
                    "immunity booster pack",
                    "IB Combo"
                ],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.products.insert_one(new_product)
            logger.info(f"Created Immunity Booster Combo: {new_product['id']}")
            
            return {
                "success": True,
                "action": "created",
                "product_id": new_product["id"],
                "product_name": new_product["name"],
                "components": components,
                "message": "Created new Immunity Booster Combo product with BOM structure"
            }
    
    except Exception as e:
        logger.error(f"Migration error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


@router.post("/migrate/update-combo-dispatches")
async def update_combo_dispatches(
    combo_product_id: str,
    dry_run: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """
    Update past dispatch records for a combo product.
    
    For each dispatch of the combo, this will:
    1. Add component_dispatches array showing exploded components
    2. Mark the dispatch as exploded for COGS calculation
    
    Args:
        combo_product_id: The combo product ID to process
        dry_run: If True, only show what would be changed without modifying data
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    try:
        # Get the combo product
        combo_product = await db.products.find_one({"id": combo_product_id}, {"_id": 0})
        if not combo_product:
            raise HTTPException(status_code=404, detail="Combo product not found")
        
        if not combo_product.get("is_combo") or not combo_product.get("components"):
            raise HTTPException(status_code=400, detail="Product is not a combo or has no components")
        
        # Get all products for component lookup
        all_products = await db.products.find({}, {"_id": 0}).to_list(1000)
        product_map = {p["id"]: p for p in all_products}
        
        combo_name = combo_product["name"]
        components = combo_product["components"]
        
        # Find dispatches for this combo
        # Search in both qc_dispatches and retailer_dispatches
        dispatches_to_update = []
        
        # QC Dispatches - search by product name in items array
        qc_dispatches = await db.qc_dispatches.find({
            "items.product_name": {"$regex": combo_name, "$options": "i"}
        }, {"_id": 0}).to_list(10000)
        
        for dispatch in qc_dispatches:
            for item in dispatch.get("items", []):
                if combo_name.lower() in item.get("product_name", "").lower():
                    dispatches_to_update.append({
                        "collection": "qc_dispatches",
                        "dispatch_id": dispatch["id"],
                        "dispatch_date": dispatch.get("dispatch_date"),
                        "item_product_name": item.get("product_name"),
                        "quantity": item.get("quantity", 0)
                    })
        
        # Retailer Dispatches
        retailer_dispatches = await db.retailer_dispatches.find({
            "items.product_name": {"$regex": combo_name, "$options": "i"}
        }, {"_id": 0}).to_list(10000)
        
        for dispatch in retailer_dispatches:
            for item in dispatch.get("items", []):
                if combo_name.lower() in item.get("product_name", "").lower():
                    dispatches_to_update.append({
                        "collection": "retailer_dispatches",
                        "dispatch_id": dispatch["id"],
                        "dispatch_date": dispatch.get("dispatch_date"),
                        "item_product_name": item.get("product_name"),
                        "quantity": item.get("quantity", 0)
                    })
        
        if dry_run:
            return {
                "success": True,
                "dry_run": True,
                "combo_product": combo_name,
                "dispatches_found": len(dispatches_to_update),
                "sample_dispatches": dispatches_to_update[:10],
                "message": f"Would update {len(dispatches_to_update)} dispatch records. Run with dry_run=false to apply."
            }
        
        # Apply updates
        updated_count = 0
        for dispatch_info in dispatches_to_update:
            collection = db[dispatch_info["collection"]]
            dispatch_id = dispatch_info["dispatch_id"]
            qty = dispatch_info["quantity"]
            
            # Calculate component dispatches
            component_dispatches = []
            for comp in components:
                comp_product = product_map.get(comp["product_id"], {})
                comp_name = comp.get("product_name") or comp_product.get("name", "Unknown")
                weight_gm = comp.get("weight_gm", 0)
                used_kg = (qty * weight_gm) / 1000
                
                component_dispatches.append({
                    "product_id": comp["product_id"],
                    "product_name": comp_name,
                    "weight_gm_per_unit": weight_gm,
                    "combo_units": qty,
                    "quantity_kg": round(used_kg, 4)
                })
            
            # Update the dispatch items with combo_exploded flag
            await collection.update_one(
                {"id": dispatch_id, "items.product_name": {"$regex": combo_name, "$options": "i"}},
                {"$set": {
                    "items.$.combo_exploded": True,
                    "items.$.combo_product_id": combo_product_id,
                    "items.$.component_dispatches": component_dispatches
                }}
            )
            updated_count += 1
        
        return {
            "success": True,
            "dry_run": False,
            "combo_product": combo_name,
            "dispatches_updated": updated_count,
            "message": f"Updated {updated_count} dispatch records with component explosion data"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Dispatch migration error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


@router.get("/migrate/combo-products")
async def list_combo_products(current_user: dict = Depends(get_current_user)):
    """List all products that are marked as combos or have BOM structure."""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find products with is_combo=True
    db_combos = await db.products.find({"is_combo": True}, {"_id": 0}).to_list(100)
    
    # Also find products with combo-like names (legacy detection)
    name_combos = await db.products.find(
        {"name": {"$regex": "combo", "$options": "i"}},
        {"_id": 0}
    ).to_list(100)
    
    # Combine and dedupe
    all_combos = {p["id"]: p for p in db_combos + name_combos}
    
    result = []
    for product in all_combos.values():
        result.append({
            "id": product["id"],
            "name": product["name"],
            "is_combo_flag": product.get("is_combo", False),
            "has_components": bool(product.get("components")),
            "component_count": len(product.get("components", [])),
            "aliases": product.get("aliases", [])
        })
    
    return {
        "combo_products": result,
        "total": len(result)
    }
