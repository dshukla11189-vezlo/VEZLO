#!/usr/bin/env python3
"""
Script to update QC Packaging weights in the database.
Run this on production to fix the dispatch quantity calculations.

Usage:
    python update_packaging_weights.py

This script will:
1. Add weight_gm field to all existing packaging entries (extracted from name)
2. Add common packaging variants if they don't exist
"""

import asyncio
import re
import os
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

# Get database connection from environment
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

def extract_weight_from_name(name: str) -> float:
    """Extract weight in grams from packaging name"""
    if not name:
        return 0
    
    name_lower = name.lower().strip()
    
    # Pattern 1: Simple number + gm/g (e.g., "500 gm", "250 gm")
    match = re.search(r'^(\d+)\s*(gm|g)\b', name_lower)
    if match:
        return float(match.group(1))
    
    # Pattern 2: Range like "240-260 gm" - take average
    range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(gm|g)', name_lower)
    if range_match:
        return (float(range_match.group(1)) + float(range_match.group(2))) / 2
    
    # Pattern 3: Contains number with gm/g anywhere (e.g., "200 gm Packet")
    any_match = re.search(r'(\d+)\s*(gm|g)\b', name_lower)
    if any_match:
        return float(any_match.group(1))
    
    # Pattern 4: Just a number (assume gm)
    just_number = re.search(r'^(\d+)$', name_lower)
    if just_number:
        return float(just_number.group(1))
    
    return 0

# Common packaging variants that should exist
COMMON_PACKAGINGS = [
    {"name": "500 gm", "weight_gm": 500},
    {"name": "250 gm", "weight_gm": 250},
    {"name": "200 gm Packet", "weight_gm": 200},
    {"name": "240-260 gm", "weight_gm": 250},
    {"name": "90-110 gm Packet", "weight_gm": 100},
    {"name": "190-210 gm Packet", "weight_gm": 200},
    {"name": "100 gm", "weight_gm": 100},
    {"name": "400-450 gm", "weight_gm": 425},
    {"name": "120 gm", "weight_gm": 120},
    {"name": "50 gm Packet", "weight_gm": 50},
    {"name": "Without Roots 70-80 gm (PCS)", "weight_gm": 75},
    {"name": "With Roots (100 gm Pack) (PCS)", "weight_gm": 100},
    {"name": "With Roots 100 gm", "weight_gm": 100},
    {"name": "With Roots 200gm", "weight_gm": 200},
]

async def update_packaging_weights():
    print(f"Connecting to {MONGO_URL}, database: {DB_NAME}")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Step 1: Update existing packagings with weight_gm
    print("\n=== Step 1: Updating existing packaging weights ===")
    packagings = await db.qc_packaging.find({}).to_list(200)
    print(f"Found {len(packagings)} existing packagings")
    
    for p in packagings:
        name = p.get('name', '')
        current_weight = p.get('weight_gm') or 0
        
        if not current_weight:
            weight = extract_weight_from_name(name)
            if weight > 0:
                await db.qc_packaging.update_one(
                    {"id": p['id']},
                    {"$set": {"weight_gm": weight}}
                )
                print(f"  Updated '{name}': weight_gm = {weight}")
            else:
                print(f"  WARNING: Could not extract weight for '{name}'")
        else:
            print(f"  Already has weight: '{name}' = {current_weight}")
    
    # Step 2: Add common packagings if they don't exist
    print("\n=== Step 2: Adding common packaging variants ===")
    for pkg in COMMON_PACKAGINGS:
        name = pkg['name']
        # Check if exists (case-insensitive)
        existing = await db.qc_packaging.find_one({
            "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}
        })
        
        if not existing:
            new_pkg = {
                "id": str(uuid.uuid4()),
                "name": name,
                "weight_gm": pkg['weight_gm']
            }
            await db.qc_packaging.insert_one(new_pkg)
            print(f"  Added new packaging: '{name}' = {pkg['weight_gm']} gm")
        else:
            # Update weight if not set
            if not existing.get('weight_gm'):
                await db.qc_packaging.update_one(
                    {"id": existing['id']},
                    {"$set": {"weight_gm": pkg['weight_gm']}}
                )
                print(f"  Updated existing '{name}': weight_gm = {pkg['weight_gm']}")
            else:
                print(f"  Already exists: '{name}' = {existing.get('weight_gm')} gm")
    
    # Step 3: Verify all packagings
    print("\n=== Step 3: Final verification ===")
    packagings = await db.qc_packaging.find({}).to_list(200)
    for p in packagings:
        print(f"  {p.get('name')}: weight_gm = {p.get('weight_gm')}")
    
    client.close()
    print("\n=== Done! ===")

if __name__ == "__main__":
    asyncio.run(update_packaging_weights())
