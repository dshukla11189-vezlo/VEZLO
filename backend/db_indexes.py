"""
Database Index Management
=========================
Creates and manages MongoDB indexes for optimal query performance.
Run this script during application startup or as a migration.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging

logger = logging.getLogger(__name__)


async def create_indexes(db):
    """
    Create all necessary indexes for the application.
    Indexes are idempotent - MongoDB will skip if they already exist.
    """
    try:
        # ==================== DATE-RANGE INDEXES ====================
        
        # Procurements - frequently queried by date
        await db.procurements.create_index([("date", -1)])
        await db.procurements.create_index([("date", -1), ("product_id", 1)])
        logger.info("Created indexes on procurements")
        
        # Retailer Dispatches - frequently queried by date and retailer
        await db.retailer_dispatches.create_index([("dispatch_date", -1)])
        await db.retailer_dispatches.create_index([("dispatch_date", -1), ("retailer_id", 1)])
        await db.retailer_dispatches.create_index([("retailer_id", 1), ("dispatch_date", -1)])
        logger.info("Created indexes on retailer_dispatches")
        
        # Retailer Invoices - queried by date, retailer, and status
        await db.retailer_invoices.create_index([("invoice_date", -1)])
        await db.retailer_invoices.create_index([("retailer_id", 1), ("invoice_date", -1)])
        await db.retailer_invoices.create_index([("retailer_id", 1), ("status", 1)])
        logger.info("Created indexes on retailer_invoices")
        
        # Retailer Rejections - queried by date, retailer, and product
        await db.retailer_rejections.create_index([("rejection_date", -1)])
        await db.retailer_rejections.create_index([("created_at", -1)])
        await db.retailer_rejections.create_index([("retailer_id", 1), ("rejection_date", -1)])
        await db.retailer_rejections.create_index([("retailer_id", 1), ("product_id", 1), ("rejection_date", -1)])
        logger.info("Created indexes on retailer_rejections")
        
        # Retailer Payments - queried by date and retailer
        await db.retailer_payments.create_index([("payment_date", -1)])
        await db.retailer_payments.create_index([("retailer_id", 1), ("payment_date", -1)])
        logger.info("Created indexes on retailer_payments")
        
        # Retailer Credit Notes - queried by date and retailer
        await db.retailer_credit_notes.create_index([("credit_note_date", -1)])
        await db.retailer_credit_notes.create_index([("retailer_id", 1), ("credit_note_date", -1)])
        logger.info("Created indexes on retailer_credit_notes")
        
        # QC Dispatches - frequently queried by date
        await db.qc_dispatches.create_index([("dispatch_date", -1)])
        await db.qc_dispatches.create_index([("dispatch_date", -1), ("customer_id", 1)])
        logger.info("Created indexes on qc_dispatches")
        
        # QC GRNs - queried by date
        await db.qc_grns.create_index([("grn_date", -1)])
        await db.qc_grns.create_index([("date", -1)])
        logger.info("Created indexes on qc_grns")
        
        # Daily Stock Status - heavily queried by date
        await db.daily_stock_status.create_index([("date", -1)])
        await db.daily_stock_status.create_index([("date", -1), ("product_id", 1)])
        await db.daily_stock_status.create_index([("product_id", 1), ("date", -1)])
        logger.info("Created indexes on daily_stock_status")
        
        # Daily COGS - queried by date
        await db.daily_cogs.create_index([("date", -1)])
        await db.daily_cogs.create_index([("date", -1), ("product_id", 1)])
        logger.info("Created indexes on daily_cogs")
        
        # Retailer Indents - queried by date and retailer
        await db.retailer_indents.create_index([("indent_date", -1)])
        await db.retailer_indents.create_index([("retailer_id", 1), ("indent_date", -1)])
        await db.retailer_indents.create_index([("retailer_id", 1), ("status", 1)])
        logger.info("Created indexes on retailer_indents")
        
        # Ninjacart Dispatches
        await db.ninjacart_dispatches.create_index([("dispatch_date", -1)])
        logger.info("Created indexes on ninjacart_dispatches")
        
        # Variable Expenses - queried by date
        await db.variable_expenses.create_index([("date", -1)])
        await db.variable_expenses.create_index([("date", -1), ("vendor_id", 1)])
        logger.info("Created indexes on variable_expenses")
        
        # ==================== ID/LOOKUP INDEXES ====================
        
        # Users - frequently queried by ID, email, role
        await db.users.create_index([("id", 1)], unique=True)
        await db.users.create_index([("email", 1)], unique=True)
        await db.users.create_index([("role", 1)])
        await db.users.create_index([("role", 1), ("assigned_to", 1)])
        logger.info("Created indexes on users")
        
        # Products
        await db.products.create_index([("id", 1)], unique=True)
        await db.products.create_index([("name", 1)])
        logger.info("Created indexes on products")
        
        # Vendors
        await db.vendors.create_index([("id", 1)], unique=True)
        await db.vendors.create_index([("is_active", 1)])
        logger.info("Created indexes on vendors")
        
        logger.info("All database indexes created successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error creating indexes: {str(e)}")
        return False


async def run_index_migration():
    """
    Standalone function to run index creation.
    Can be called during startup or as a separate migration script.
    """
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'test_database')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    success = await create_indexes(db)
    
    client.close()
    return success


if __name__ == "__main__":
    # Run as standalone script
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_index_migration())
