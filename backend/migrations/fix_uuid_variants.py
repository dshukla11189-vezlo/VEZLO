"""
Migration Script: Fix UUID Variant Names

This script fixes existing data where variant_name was stored as a raw UUID
instead of the actual packaging name.

Collections affected:
1. retail_plans - products[].variant_name
2. retailer_indents - items[].variant_name

Run this script once to fix historical data.
"""

import asyncio
import re
import os
from motor.motor_asyncio import AsyncIOMotorClient

# UUID pattern
UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


async def run_migration():
    """Main migration function"""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "freshflow_db")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("=" * 60)
    print("Starting UUID Variant Name Migration")
    print("=" * 60)
    
    # Step 1: Build packaging lookup from qc_packaging
    print("\n[1/4] Loading packagings...")
    packagings = await db.qc_packaging.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    packaging_map = {p.get("id"): p.get("name", "") for p in packagings}
    print(f"  Loaded {len(packaging_map)} packaging variants")
    
    # Step 2: Fix retail_plans collection
    print("\n[2/4] Fixing retail_plans collection...")
    plans_fixed = 0
    products_fixed = 0
    
    plans = await db.retail_plans.find({}, {"_id": 0}).to_list(500)
    print(f"  Found {len(plans)} retail plans to check")
    
    for plan in plans:
        plan_updated = False
        products = plan.get("products", [])
        
        for product in products:
            variant_name = product.get("variant_name", "")
            variant_id = product.get("variant_id", "")
            
            # Check if variant_name looks like a UUID
            if variant_name and UUID_PATTERN.match(str(variant_name)):
                # Try to resolve from packagings
                resolved = packaging_map.get(variant_name, "")
                if not resolved and variant_id:
                    resolved = packaging_map.get(variant_id, "")
                
                if resolved:
                    print(f"    Plan '{plan.get('name')}': {product.get('product_name')} - '{variant_name}' -> '{resolved}'")
                    product["variant_name"] = resolved
                    plan_updated = True
                    products_fixed += 1
                else:
                    print(f"    [WARN] Plan '{plan.get('name')}': {product.get('product_name')} - UUID '{variant_name}' not found in packagings")
        
        if plan_updated:
            # Update the plan in database
            await db.retail_plans.update_one(
                {"id": plan.get("id")},
                {"$set": {"products": products}}
            )
            plans_fixed += 1
    
    print(f"  Fixed {products_fixed} product variants in {plans_fixed} plans")
    
    # Step 3: Fix retailer_indents collection (auto-generated ones)
    print("\n[3/4] Fixing retailer_indents collection...")
    indents_fixed = 0
    items_fixed = 0
    
    # Focus on auto-generated indents which are more likely to have UUID issues
    indents = await db.retailer_indents.find(
        {"is_auto_generated": True},
        {"_id": 0}
    ).to_list(5000)
    print(f"  Found {len(indents)} auto-generated indents to check")
    
    for indent in indents:
        indent_updated = False
        items = indent.get("items", [])
        
        for item in items:
            variant_name = item.get("variant_name", "")
            variant_id = item.get("variant_id", "")
            
            # Check if variant_name looks like a UUID
            if variant_name and UUID_PATTERN.match(str(variant_name)):
                # Try to resolve from packagings
                resolved = packaging_map.get(variant_name, "")
                if not resolved and variant_id:
                    resolved = packaging_map.get(variant_id, "")
                
                if resolved:
                    item["variant_name"] = resolved
                    indent_updated = True
                    items_fixed += 1
        
        if indent_updated:
            # Update the indent in database
            await db.retailer_indents.update_one(
                {"id": indent.get("id")},
                {"$set": {"items": items}}
            )
            indents_fixed += 1
    
    print(f"  Fixed {items_fixed} item variants in {indents_fixed} indents")
    
    # Step 4: Also fix retailer_dispatches if needed
    print("\n[4/4] Fixing retailer_dispatches collection...")
    dispatches_fixed = 0
    dispatch_items_fixed = 0
    
    dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(5000)
    print(f"  Found {len(dispatches)} dispatches to check")
    
    for dispatch in dispatches:
        dispatch_updated = False
        items = dispatch.get("items", [])
        
        for item in items:
            variant_name = item.get("variant_name", "")
            variant_id = item.get("variant_id", "")
            
            # Check if variant_name looks like a UUID
            if variant_name and UUID_PATTERN.match(str(variant_name)):
                # Try to resolve from packagings
                resolved = packaging_map.get(variant_name, "")
                if not resolved and variant_id:
                    resolved = packaging_map.get(variant_id, "")
                
                if resolved:
                    item["variant_name"] = resolved
                    dispatch_updated = True
                    dispatch_items_fixed += 1
        
        if dispatch_updated:
            # Update the dispatch in database
            await db.retailer_dispatches.update_one(
                {"id": dispatch.get("id")},
                {"$set": {"items": items}}
            )
            dispatches_fixed += 1
    
    print(f"  Fixed {dispatch_items_fixed} item variants in {dispatches_fixed} dispatches")
    
    # Summary
    print("\n" + "=" * 60)
    print("Migration Complete!")
    print("=" * 60)
    print(f"  Retail Plans: {plans_fixed} plans, {products_fixed} products fixed")
    print(f"  Retailer Indents: {indents_fixed} indents, {items_fixed} items fixed")
    print(f"  Retailer Dispatches: {dispatches_fixed} dispatches, {dispatch_items_fixed} items fixed")
    print("=" * 60)
    
    client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
