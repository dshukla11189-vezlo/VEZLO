"""
Daily Backup System for FreshFlow
Exports all MongoDB collections to Excel and emails to specified recipients
"""

import os
import io
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List
import pandas as pd
import resend
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import base64

logger = logging.getLogger(__name__)

# Backup recipients
BACKUP_RECIPIENTS = [
    "dshukla11189@gmail.com"
]

# Collections to backup
COLLECTIONS_TO_BACKUP = [
    "users",
    "products", 
    "farmers",
    "procurements",
    "qc_customers",
    "qc_indents",
    "qc_dispatches",
    "qc_invoices",
    "qc_grns",
    "retailer_indents",
    "retailer_dispatches",
    "retailer_invoices",
    "retailer_grn",
    "retailer_rejections",
    "retailer_payments",
    "daily_stock_status",
    "variable_expenses",
    "fixed_expenses"
]

# Sensitive fields to exclude from backup
SENSITIVE_FIELDS = ["password", "refresh_token", "access_token"]


async def generate_backup_excel(db) -> bytes:
    """Generate Excel file with all collections data"""
    
    # Create Excel writer in memory
    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        for collection_name in COLLECTIONS_TO_BACKUP:
            try:
                # Fetch all documents from collection
                collection = db[collection_name]
                documents = await collection.find({}, {"_id": 0}).to_list(10000)
                
                if documents:
                    # Convert to DataFrame
                    df = pd.DataFrame(documents)
                    
                    # Remove sensitive fields
                    for field in SENSITIVE_FIELDS:
                        if field in df.columns:
                            df = df.drop(columns=[field])
                    
                    # Flatten nested objects/lists for readability
                    for col in df.columns:
                        if df[col].dtype == 'object':
                            df[col] = df[col].apply(lambda x: str(x) if isinstance(x, (dict, list)) else x)
                    
                    # Truncate sheet name to 31 chars (Excel limit)
                    sheet_name = collection_name[:31]
                    df.to_excel(writer, sheet_name=sheet_name, index=False)
                    logger.info(f"Exported {len(documents)} records from {collection_name}")
                else:
                    # Create empty sheet with headers
                    pd.DataFrame().to_excel(writer, sheet_name=collection_name[:31], index=False)
                    logger.info(f"No records in {collection_name}")
                    
            except Exception as e:
                logger.error(f"Error exporting {collection_name}: {e}")
                # Create error sheet
                pd.DataFrame({"error": [str(e)]}).to_excel(
                    writer, sheet_name=f"ERR_{collection_name[:27]}", index=False
                )
    
    output.seek(0)
    return output.getvalue()


async def send_backup_email(excel_data: bytes, recipients: List[str]):
    """Send backup Excel file via email"""
    
    resend_api_key = os.environ.get("RESEND_API_KEY")
    sender_email = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    
    if not resend_api_key:
        logger.error("RESEND_API_KEY not configured")
        return False
    
    resend.api_key = resend_api_key
    
    # Generate filename with date
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"FreshFlow_Backup_{today}.xlsx"
    
    # Encode Excel data as base64
    excel_base64 = base64.b64encode(excel_data).decode('utf-8')
    
    # Create email HTML
    html_content = f"""
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto;">
            <h2 style="color: #14532D;">FreshFlow Daily Backup</h2>
            <p>Hello,</p>
            <p>Please find attached the daily backup of FreshFlow data for <strong>{today}</strong>.</p>
            <p>This backup includes:</p>
            <ul>
                <li>Users & Products</li>
                <li>Farmers & Procurements</li>
                <li>Quick Commerce (Indents, Dispatches, Invoices, GRN)</li>
                <li>Retailer Orders (Indents, Dispatches, Invoices, GRN, Rejections, Payments)</li>
                <li>Stock Status & Expenses</li>
            </ul>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
                This is an automated backup. Please save this file securely.<br>
                Generated at: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")} UTC
            </p>
        </div>
    </body>
    </html>
    """
    
    try:
        params = {
            "from": sender_email,
            "to": recipients,
            "subject": f"FreshFlow Daily Backup - {today}",
            "html": html_content,
            "attachments": [
                {
                    "filename": filename,
                    "content": excel_base64,
                    "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                }
            ]
        }
        
        # Send email
        result = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Backup email sent successfully to {recipients}. Email ID: {result.get('id')}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send backup email: {e}")
        return False


async def run_daily_backup(db):
    """Main backup job - generates Excel and sends email"""
    logger.info("Starting daily backup job...")
    
    try:
        # Generate Excel backup
        excel_data = await generate_backup_excel(db)
        logger.info(f"Backup Excel generated: {len(excel_data)} bytes")
        
        # Send email
        success = await send_backup_email(excel_data, BACKUP_RECIPIENTS)
        
        if success:
            logger.info("Daily backup completed successfully!")
        else:
            logger.error("Daily backup failed - email not sent")
            
        return success
        
    except Exception as e:
        logger.error(f"Daily backup failed: {e}")
        return False


def setup_backup_scheduler(db):
    """Setup APScheduler for daily backups at 11:59 PM IST (6:29 PM UTC)"""
    
    scheduler = AsyncIOScheduler()
    
    # IST is UTC+5:30, so 11:59 PM IST = 6:29 PM UTC
    # Using CronTrigger for daily execution
    trigger = CronTrigger(
        hour=18,  # 6 PM UTC
        minute=29,  # :29
        timezone="UTC"
    )
    
    # Add job
    scheduler.add_job(
        run_daily_backup,
        trigger=trigger,
        args=[db],
        id="daily_backup",
        name="Daily FreshFlow Backup",
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Backup scheduler started - Daily backup at 11:59 PM IST (18:29 UTC)")
    
    return scheduler


# Manual backup trigger (for API endpoint)
async def trigger_manual_backup(db) -> dict:
    """Manually trigger a backup - returns status"""
    try:
        excel_data = await generate_backup_excel(db)
        success = await send_backup_email(excel_data, BACKUP_RECIPIENTS)
        
        return {
            "success": success,
            "message": "Backup sent successfully!" if success else "Failed to send backup email",
            "recipients": BACKUP_RECIPIENTS,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "recipients": BACKUP_RECIPIENTS,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
