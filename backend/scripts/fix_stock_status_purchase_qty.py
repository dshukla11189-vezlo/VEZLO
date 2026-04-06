#!/usr/bin/env python3
"""
One-time script to fix corrupted purchase_qty values in daily_stock_status.

This script:
1. Iterates through ALL daily_stock_status records
2. Recalculates purchase_qty by summing qty from procurements collection
3. Handles string-encoded product arrays (Excel import corruption)
4. Updates the database with correct values

Run: python3 scripts/fix_stock_status_purchase_qty.py
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import ast
import os

# Database configuration
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


async def parse_products(products):
    """Parse products array, handling string corruption from Excel imports."""
    if isinstance(products, list):
        return products
    if isinstance(products, str):
        try:
            return ast.literal_eval(products)
        except (ValueError, SyntaxError):
            return []
    return []


async def calculate_qty_kg(item):
    """Convert quantity to Kg based on unit type."""
    qty = float(item.get('quantity', 0) or 0)
    unit = item.get('unit', 'Kg')
    unit_size = item.get('unit_size', '')
    
    if unit == 'Bunch' and unit_size:
        try:
            weight_gm = float(unit_size)
            return (qty * weight_gm) / 1000  # Convert bunch to kg
        except (ValueError, TypeError):
            pass
    
    # For Kg, Piece, Pack - return as-is
    return qty


async def fix_stock_status():
    """Main fix function."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print(f"Connected to database: {DB_NAME}")
    print("=" * 70)
    
    # Step 1: Get all unique dates from daily_stock_status
    all_dates = await db.daily_stock_status.distinct("date")
    print(f"Found {len(all_dates)} dates in daily_stock_status")
    
    # Step 2: Get all procurements and organize by date + product
    all_procurements = await db.procurements.find({}).to_list(10000)
    print(f"Found {len(all_procurements)} procurement records")
    
    # Build lookup: date -> product_id -> total_qty_kg
    purchases_by_date_product = {}
    
    for proc in all_procurements:
        proc_date = str(proc.get('date', ''))[:10]  # Extract YYYY-MM-DD
        
        if proc_date not in purchases_by_date_product:
            purchases_by_date_product[proc_date] = {}
        
        products = await parse_products(proc.get('products', []))
        
        for item in products:
            product_id = item.get('product_id', '')
            if not product_id:
                continue
            
            qty_kg = await calculate_qty_kg(item)
            total_value = float(item.get('total', 0) or 0)
            
            if product_id not in purchases_by_date_product[proc_date]:
                purchases_by_date_product[proc_date][product_id] = {
                    'qty_kg': 0,
                    'total_value': 0
                }
            
            purchases_by_date_product[proc_date][product_id]['qty_kg'] += qty_kg
            purchases_by_date_product[proc_date][product_id]['total_value'] += total_value
    
    print(f"Processed purchases for {len(purchases_by_date_product)} dates")
    print("=" * 70)
    
    # Step 3: Fix each daily_stock_status record
    total_fixed = 0
    total_unchanged = 0
    
    for date in sorted(all_dates):
        stock_entries = await db.daily_stock_status.find({"date": date}).to_list(500)
        date_purchases = purchases_by_date_product.get(date, {})
        
        print(f"\nProcessing date: {date} ({len(stock_entries)} products)")
        
        for entry in stock_entries:
            product_id = entry.get('product_id')
            product_name = entry.get('product_name')
            current_purchase_qty = entry.get('purchase_qty', 0)
            
            # Calculate correct purchase_qty from procurements
            product_purchase = date_purchases.get(product_id, {'qty_kg': 0, 'total_value': 0})
            correct_purchase_qty = round(product_purchase['qty_kg'], 2)
            correct_purchase_value = round(product_purchase['total_value'], 2)
            
            # Check if update needed
            diff = abs(current_purchase_qty - correct_purchase_qty)
            
            if diff > 0.01:  # Significant difference
                # Calculate new avg_price
                avg_price = 0
                if correct_purchase_qty > 0:
                    avg_price = round(correct_purchase_value / correct_purchase_qty, 2)
                
                # Update record
                await db.daily_stock_status.update_one(
                    {"id": entry['id']},
                    {"$set": {
                        "purchase_qty": correct_purchase_qty,
                        "purchase_value": correct_purchase_value,
                        "avg_price": avg_price
                    }}
                )
                
                print(f"  FIXED: {product_name:<35} {current_purchase_qty:>10.2f} -> {correct_purchase_qty:>10.2f} (diff: {diff:.2f})")
                total_fixed += 1
            else:
                total_unchanged += 1
    
    print("\n" + "=" * 70)
    print(f"SUMMARY:")
    print(f"  Total records fixed: {total_fixed}")
    print(f"  Total records unchanged: {total_unchanged}")
    print("=" * 70)
    
    client.close()
    return total_fixed, total_unchanged


if __name__ == "__main__":
    fixed, unchanged = asyncio.run(fix_stock_status())
    print(f"\nScript completed successfully. Fixed {fixed} records.")
