"""
PRODUCTION DATABASE CLEANUP SCRIPT
===================================
Run this script locally to clean up bogus credit notes from production.

Connection: mongodb+srv://harvest-hub-384:d72d734lqs2c73fj1vng@customer-apps.nffidd.mongodb.net/
Database: harvest-hub-384-test_database

Usage:
  pip install pymongo dnspython
  python cleanup_bogus_credit_notes.py
"""

from pymongo import MongoClient
from datetime import datetime

# Production database connection
PROD_MONGO_URL = "mongodb+srv://harvest-hub-384:d72d734lqs2c73fj1vng@customer-apps.nffidd.mongodb.net/?appName=harvest-hub-384&retryWrites=true&w=majority"
PROD_DB_NAME = "harvest-hub-384-test_database"

# Retailer IDs for Jai Bhawani and Savtamali ONLY
# (NOT including Narang Super Mart)
RETAILER_IDS = [
    "f77940fb-3852-4155-9ad1-d90e5d7120ab",  # Jai Bhawani
    "d36a4f17-bed0-4d8e-bb35-3e83825a0ce8"   # Savtamali
]

# Cutoff timestamp - credit notes created on or after this are bogus
CUTOFF_DATE = datetime(2026, 6, 26, 10, 58, 0)

def main():
    print("=" * 60)
    print("PRODUCTION DATABASE CLEANUP - BOGUS CREDIT NOTES")
    print("=" * 60)
    print("\nConnecting to production database...")
    
    client = MongoClient(PROD_MONGO_URL)
    db = client[PROD_DB_NAME]
    
    # Test connection
    db.command('ping')
    print("Connected successfully!")
    
    # Build the filter for bogus credit notes
    filter_criteria = {
        "auto_generated": True,
        "status": "pending",
        "created_at": {"$gte": CUTOFF_DATE},
        "retailer_id": {"$in": RETAILER_IDS}
    }
    
    # ========================================
    # STEP A: COUNT BEFORE DELETE
    # ========================================
    print("\n" + "=" * 60)
    print("STEP A: COUNTING BOGUS CREDIT NOTES (BEFORE DELETE)")
    print("=" * 60)
    
    total_count = db.retailer_credit_notes.count_documents(filter_criteria)
    print(f"\nTotal bogus credit notes matching criteria: {total_count}")
    
    # Count per retailer for verification
    for rid in RETAILER_IDS:
        individual_filter = {**filter_criteria, "retailer_id": rid}
        count = db.retailer_credit_notes.count_documents(individual_filter)
        retailer = db.users.find_one({"id": rid}, {"name": 1, "company_name": 1})
        name = retailer.get("company_name") or retailer.get("name") if retailer else rid
        print(f"  - {name}: {count} credit notes")
    
    # Show current total
    current_total = db.retailer_credit_notes.count_documents({})
    print(f"\nCurrent total credit notes in collection: {current_total}")
    print(f"Expected total after deletion: {current_total - total_count}")
    
    # ========================================
    # STEP B: DELETE (WITH CONFIRMATION)
    # ========================================
    print("\n" + "=" * 60)
    print("STEP B: DELETE BOGUS CREDIT NOTES")
    print("=" * 60)
    
    if total_count == 0:
        print("\nNo bogus credit notes found. Nothing to delete.")
        client.close()
        return
    
    confirm = input(f"\nAre you sure you want to delete {total_count} credit notes? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Aborted. No credit notes were deleted.")
        client.close()
        return
    
    # Perform deletion
    result = db.retailer_credit_notes.delete_many(filter_criteria)
    print(f"\nDeleted {result.deleted_count} credit notes.")
    
    # ========================================
    # STEP C: VERIFY AFTER DELETE
    # ========================================
    print("\n" + "=" * 60)
    print("STEP C: VERIFICATION AFTER DELETE")
    print("=" * 60)
    
    new_total = db.retailer_credit_notes.count_documents({})
    print(f"\nNew total credit notes in collection: {new_total}")
    print(f"Credit notes removed: {current_total - new_total}")
    
    # Verify no more bogus CNs exist
    remaining = db.retailer_credit_notes.count_documents(filter_criteria)
    print(f"Remaining bogus credit notes (should be 0): {remaining}")
    
    client.close()
    print("\n✅ Cleanup complete!")

if __name__ == "__main__":
    main()
