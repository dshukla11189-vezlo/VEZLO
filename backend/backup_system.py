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

# Collections to backup - COMPREHENSIVE list of ALL collections
COLLECTIONS_TO_BACKUP = [
    # Core
    "users",
    "products",
    "product_types",
    "product_categories",
    "units",
    # Procurement
    "farmers",
    "procurements",
    "procurement_templates",
    "farmer_payments",
    # Quick Commerce
    "qc_packaging",
    "qc_customers",
    "qc_indents",
    "qc_dispatches",
    "qc_invoices",
    "qc_grns",
    "qc_daily_requirements",
    "customer_product_settings",
    # Retailer
    "retailers",
    "retailer_catalogue",
    "retailer_indents",
    "retailer_dispatches",
    "retailer_invoices",
    "retailer_grn",
    "retailer_rejections",
    "retailer_payments",
    "retailer_closing_inventory",
    "retailer_inventory",
    "retailer_daily_requirements",
    # Stock & Expenses
    "daily_stock_status",
    "variable_expenses",
    "fixed_expenses",
    # Labour
    "labours",
    "labour_attendance",
    # Payments
    "payments",
]

# Sensitive fields to exclude from backup
SENSITIVE_FIELDS = ["password", "refresh_token", "access_token"]

# Large fields to exclude from backup (performance)
LARGE_FIELDS_TO_EXCLUDE = ["image_url", "image_data", "base64_image"]


async def generate_backup_excel(db) -> bytes:
    """Generate Excel file with all collections data plus P&L reports"""
    
    # Create Excel writer in memory
    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        # First, add P&L Daily Summary sheet
        try:
            pnl_daily = await generate_pnl_daily_report(db)
            if pnl_daily:
                df_pnl = pd.DataFrame(pnl_daily)
                df_pnl.to_excel(writer, sheet_name="PNL_Daily_Summary", index=False)
                logger.info(f"Exported {len(pnl_daily)} days of P&L data")
        except Exception as e:
            logger.error(f"Error exporting P&L Daily: {e}")
            pd.DataFrame({"error": [str(e)]}).to_excel(writer, sheet_name="ERR_PNL_Daily", index=False)
        
        # Add P&L Product-Level breakdown sheet
        try:
            pnl_products = await generate_pnl_product_report(db)
            if pnl_products:
                df_products = pd.DataFrame(pnl_products)
                df_products.to_excel(writer, sheet_name="PNL_Product_Detail", index=False)
                logger.info(f"Exported {len(pnl_products)} product line items")
        except Exception as e:
            logger.error(f"Error exporting P&L Products: {e}")
            pd.DataFrame({"error": [str(e)]}).to_excel(writer, sheet_name="ERR_PNL_Products", index=False)
        
        # Add Stock Status Summary sheet (processed view)
        try:
            stock_summary = await generate_stock_status_report(db)
            if stock_summary:
                df_stock = pd.DataFrame(stock_summary)
                df_stock.to_excel(writer, sheet_name="Stock_Status_Summary", index=False)
                logger.info(f"Exported {len(stock_summary)} stock status records")
        except Exception as e:
            logger.error(f"Error exporting Stock Summary: {e}")
            pd.DataFrame({"error": [str(e)]}).to_excel(writer, sheet_name="ERR_Stock_Summary", index=False)
        
        # Export all raw collections
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
                    
                    # Remove large fields (like Base64 images) for performance
                    for field in LARGE_FIELDS_TO_EXCLUDE:
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


async def generate_pnl_daily_report(db) -> list:
    """Generate P&L daily summary data"""
    # Get current month date range
    today = datetime.now(timezone.utc)
    from_date = today.replace(day=1).strftime("%Y-%m-%d")
    to_date = today.strftime("%Y-%m-%d")
    
    daily_data = []
    
    # Aggregate sales by date from QC GRN
    qc_grns = await db.qc_grns.find({
        "grn_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    sales_by_date = {}
    for grn in qc_grns:
        grn_date = grn.get("grn_date", "")[:10]
        if grn_date not in sales_by_date:
            sales_by_date[grn_date] = {"qc_sales": 0, "qc_qty": 0, "retailer_sales": 0, "retailer_qty": 0}
        for item in grn.get("items", []):
            amount = item.get("grn_amount", 0) or item.get("amount", 0) or 0
            qty = item.get("grn_qty", 0) or item.get("supplied_qty", 0) or 0
            sales_by_date[grn_date]["qc_sales"] += amount
            sales_by_date[grn_date]["qc_qty"] += qty
    
    # Aggregate sales from Retailer Dispatches
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    for dispatch in retailer_dispatches:
        dispatch_date = dispatch.get("dispatch_date", "")[:10]
        if dispatch_date not in sales_by_date:
            sales_by_date[dispatch_date] = {"qc_sales": 0, "qc_qty": 0, "retailer_sales": 0, "retailer_qty": 0}
        net_payable = dispatch.get("net_payable", 0) or 0
        dispatch_qty = sum(item.get("supplied_qty", 0) or 0 for item in dispatch.get("items", []))
        sales_by_date[dispatch_date]["retailer_sales"] += net_payable
        sales_by_date[dispatch_date]["retailer_qty"] += dispatch_qty
    
    # Aggregate purchases by date
    procurements = await db.procurements.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    purchase_by_date = {}
    for proc in procurements:
        proc_date = proc.get("date", "")[:10]
        if proc_date not in purchase_by_date:
            purchase_by_date[proc_date] = {"amount": 0, "qty": 0}
        for item in proc.get("products", []):
            purchase_by_date[proc_date]["amount"] += item.get("total", 0) or 0
            purchase_by_date[proc_date]["qty"] += item.get("quantity", 0) or 0
    
    # Aggregate wastage by date
    stock_status = await db.daily_stock_status.find({
        "date": {"$gte": from_date, "$lte": to_date},
        "status": "closed"
    }, {"_id": 0}).to_list(1000)
    
    wastage_by_date = {}
    for status in stock_status:
        status_date = status.get("date", "")[:10]
        if status_date not in wastage_by_date:
            wastage_by_date[status_date] = 0
        wastage_by_date[status_date] += status.get("wastage_value", 0) or 0
    
    # Aggregate expenses by date
    var_expenses = await db.variable_expenses.find({
        "date": {"$gte": from_date, "$lte": to_date}
    }, {"_id": 0}).to_list(1000)
    
    var_exp_by_date = {}
    for exp in var_expenses:
        exp_date = exp.get("date", "")[:10]
        if exp_date not in var_exp_by_date:
            var_exp_by_date[exp_date] = 0
        var_exp_by_date[exp_date] += exp.get("amount", 0) or 0
    
    fixed_expenses = await db.fixed_expenses.find({
        "date": {"$gte": from_date, "$lte": to_date}
    }, {"_id": 0}).to_list(1000)
    
    fixed_exp_by_date = {}
    for exp in fixed_expenses:
        exp_date = exp.get("date", "")[:10]
        if exp_date not in fixed_exp_by_date:
            fixed_exp_by_date[exp_date] = 0
        fixed_exp_by_date[exp_date] += exp.get("amount", 0) or 0
    
    # Combine all dates
    all_dates = set(sales_by_date.keys()) | set(purchase_by_date.keys()) | set(wastage_by_date.keys())
    
    for date_key in sorted(all_dates):
        sales_data = sales_by_date.get(date_key, {"qc_sales": 0, "qc_qty": 0, "retailer_sales": 0, "retailer_qty": 0})
        purchase_data = purchase_by_date.get(date_key, {"amount": 0, "qty": 0})
        wastage = wastage_by_date.get(date_key, 0)
        var_exp = var_exp_by_date.get(date_key, 0)
        fixed_exp = fixed_exp_by_date.get(date_key, 0)
        
        total_sales = sales_data["qc_sales"] + sales_data["retailer_sales"]
        total_qty = sales_data["qc_qty"] + sales_data["retailer_qty"]
        gross_profit = total_sales - purchase_data["amount"] - wastage
        net_profit = gross_profit - var_exp - fixed_exp
        gross_margin = (gross_profit / total_sales * 100) if total_sales > 0 else 0
        net_margin = (net_profit / total_sales * 100) if total_sales > 0 else 0
        
        daily_data.append({
            "Date": date_key,
            "QC_Sales": round(sales_data["qc_sales"], 2),
            "QC_Qty": round(sales_data["qc_qty"], 2),
            "Retailer_Sales": round(sales_data["retailer_sales"], 2),
            "Retailer_Qty": round(sales_data["retailer_qty"], 2),
            "Total_Sales": round(total_sales, 2),
            "Total_Qty": round(total_qty, 2),
            "Purchase_Cost": round(purchase_data["amount"], 2),
            "Purchase_Qty": round(purchase_data["qty"], 2),
            "Wastage_Value": round(wastage, 2),
            "Variable_Expenses": round(var_exp, 2),
            "Fixed_Expenses": round(fixed_exp, 2),
            "Gross_Profit": round(gross_profit, 2),
            "Gross_Margin_%": round(gross_margin, 1),
            "Net_Profit": round(net_profit, 2),
            "Net_Margin_%": round(net_margin, 1)
        })
    
    return daily_data


async def generate_pnl_product_report(db) -> list:
    """Generate P&L product-level detail data (Customer -> Product breakdown) with all calculated fields"""
    today = datetime.now(timezone.utc)
    from_date = today.replace(day=1).strftime("%Y-%m-%d")
    to_date = today.strftime("%Y-%m-%d")
    
    # First, get purchase prices per product (COGS rate)
    procurements = await db.procurements.find({
        "date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    product_purchase = {}  # {product_name: {total_amount, total_qty}}
    for proc in procurements:
        for item in proc.get("products", []):
            product_name = item.get("name", "Unknown")
            if product_name not in product_purchase:
                product_purchase[product_name] = {"amount": 0, "qty": 0}
            product_purchase[product_name]["amount"] += item.get("total", 0) or 0
            product_purchase[product_name]["qty"] += item.get("quantity", 0) or 0
    
    # Calculate COGS rate per product (purchase price per kg)
    cogs_rate = {}
    for product, data in product_purchase.items():
        if data["qty"] > 0:
            cogs_rate[product] = data["amount"] / data["qty"]
        else:
            cogs_rate[product] = 0
    
    # Get wastage data per product
    stock_status = await db.daily_stock_status.find({
        "date": {"$gte": from_date, "$lte": to_date},
        "status": "closed"
    }, {"_id": 0}).to_list(1000)
    
    product_wastage = {}  # {product_name: {wastage_qty, wastage_value}}
    product_sales_qty = {}  # {product_name: total_sales_qty}
    for status in stock_status:
        product_name = status.get("product_name", "Unknown")
        if product_name not in product_wastage:
            product_wastage[product_name] = {"qty": 0, "value": 0}
        product_wastage[product_name]["qty"] += status.get("wastage_qty", 0) or 0
        product_wastage[product_name]["value"] += status.get("wastage_value", 0) or 0
    
    product_data = []
    
    # QC GRN line items
    qc_grns = await db.qc_grns.find({
        "grn_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    # First pass - calculate total sales qty per product for wastage allocation
    for grn in qc_grns:
        for item in grn.get("items", []):
            product_name = item.get("product_name", "Unknown")
            qty = item.get("grn_qty", 0) or item.get("supplied_qty", 0) or 0
            if product_name not in product_sales_qty:
                product_sales_qty[product_name] = 0
            product_sales_qty[product_name] += qty
    
    retailer_dispatches = await db.retailer_dispatches.find({
        "dispatch_date": {"$gte": from_date, "$lte": to_date + "T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    for dispatch in retailer_dispatches:
        for item in dispatch.get("items", []):
            product_name = item.get("product_name", "Unknown")
            qty = item.get("supplied_qty", 0) or 0
            if product_name not in product_sales_qty:
                product_sales_qty[product_name] = 0
            product_sales_qty[product_name] += qty
    
    # Calculate wastage rate per product (wastage_value / total_sales_qty)
    wastage_rate = {}
    for product, total_qty in product_sales_qty.items():
        if total_qty > 0 and product in product_wastage:
            wastage_rate[product] = product_wastage[product]["value"] / total_qty
        else:
            wastage_rate[product] = 0
    
    # Second pass - generate line items with all calculated fields
    for grn in qc_grns:
        customer = grn.get("customer_name", "Unknown")
        grn_date = grn.get("grn_date", "")[:10]
        
        for item in grn.get("items", []):
            product_name = item.get("product_name", "Unknown")
            supplied_qty = item.get("supplied_qty", 0) or 0
            grn_qty = item.get("grn_qty", 0) or supplied_qty
            revenue = item.get("grn_amount", 0) or item.get("amount", 0) or 0
            rate_per_kg = item.get("rate_per_kg", 0) or 0
            rate_per_unit = item.get("rate_per_unit", 0) or 0
            packaging_weight_gm = item.get("packaging_weight_gm", 0) or 0
            
            # Calculate supplied_kg
            supplied_kg = grn_qty
            if packaging_weight_gm > 0:
                supplied_kg = (grn_qty * packaging_weight_gm) / 1000
            
            # Calculate COGS
            product_cogs_rate = cogs_rate.get(product_name, 0)
            cogs = supplied_kg * product_cogs_rate
            
            # Calculate wastage allocation
            product_wastage_rate = wastage_rate.get(product_name, 0)
            wastage_value = grn_qty * product_wastage_rate
            wastage_kg = supplied_kg * (product_wastage_rate / product_cogs_rate) if product_cogs_rate > 0 else 0
            
            # Calculate profits and margins
            gross_profit = revenue - cogs - wastage_value
            gross_margin = (gross_profit / revenue * 100) if revenue > 0 else 0
            selling_price_per_kg = (revenue / supplied_kg) if supplied_kg > 0 else 0
            profit_per_qty = (gross_profit / grn_qty) if grn_qty > 0 else 0
            
            product_data.append({
                "Date": grn_date,
                "Customer": customer,
                "Customer_Type": "QC",
                "Product": product_name,
                "Unit": item.get("packaging_name", "") or item.get("product_unit", "Kg"),
                "Supplied_Qty": round(supplied_qty, 2),
                "Supplied_Kg": round(supplied_kg, 3),
                "Revenue": round(revenue, 2),
                "COGS": round(cogs, 2),
                "Wastage_Kg": round(wastage_kg, 3),
                "Wastage_Value": round(wastage_value, 2),
                "Gross_Profit": round(gross_profit, 2),
                "SP_Per_Kg": round(selling_price_per_kg, 2),
                "PP_Per_Kg": round(product_cogs_rate, 2),
                "Gross_Margin_%": round(gross_margin, 1),
                "Profit_Per_Qty": round(profit_per_qty, 2)
            })
    
    # Retailer Dispatch line items
    for dispatch in retailer_dispatches:
        customer = dispatch.get("retailer_name", "Unknown")
        dispatch_date = dispatch.get("dispatch_date", "")[:10]
        commission_pct = dispatch.get("commission_percentage", 0) or 0
        
        for item in dispatch.get("items", []):
            product_name = item.get("product_name", "Unknown")
            supplied_qty = item.get("supplied_qty", 0) or 0
            item_value = item.get("total_value", 0) or 0
            revenue = item_value * (1 - commission_pct / 100)
            mrp = item.get("mrp", 0) or 0
            
            # For retailers, qty is usually in kg
            supplied_kg = supplied_qty
            
            # Calculate COGS
            product_cogs_rate = cogs_rate.get(product_name, 0)
            cogs = supplied_kg * product_cogs_rate
            
            # Calculate wastage allocation
            product_wastage_rate = wastage_rate.get(product_name, 0)
            wastage_value = supplied_qty * product_wastage_rate
            wastage_kg = supplied_kg * (product_wastage_rate / product_cogs_rate) if product_cogs_rate > 0 else 0
            
            # Calculate profits and margins
            gross_profit = revenue - cogs - wastage_value
            gross_margin = (gross_profit / revenue * 100) if revenue > 0 else 0
            selling_price_per_kg = (revenue / supplied_kg) if supplied_kg > 0 else 0
            profit_per_qty = (gross_profit / supplied_qty) if supplied_qty > 0 else 0
            
            product_data.append({
                "Date": dispatch_date,
                "Customer": customer,
                "Customer_Type": "Retail",
                "Product": product_name,
                "Unit": item.get("variant_name", "") or "Kg",
                "Supplied_Qty": round(supplied_qty, 2),
                "Supplied_Kg": round(supplied_kg, 3),
                "Revenue": round(revenue, 2),
                "COGS": round(cogs, 2),
                "Wastage_Kg": round(wastage_kg, 3),
                "Wastage_Value": round(wastage_value, 2),
                "Gross_Profit": round(gross_profit, 2),
                "SP_Per_Kg": round(selling_price_per_kg, 2),
                "PP_Per_Kg": round(product_cogs_rate, 2),
                "Gross_Margin_%": round(gross_margin, 1),
                "Profit_Per_Qty": round(profit_per_qty, 2)
            })
    
    return product_data


async def generate_stock_status_report(db) -> list:
    """Generate processed stock status summary"""
    today = datetime.now(timezone.utc)
    from_date = today.replace(day=1).strftime("%Y-%m-%d")
    to_date = today.strftime("%Y-%m-%d")
    
    stock_data = await db.daily_stock_status.find({
        "date": {"$gte": from_date, "$lte": to_date}
    }, {"_id": 0}).to_list(1000)
    
    processed_data = []
    for item in stock_data:
        processed_data.append({
            "Date": item.get("date", ""),
            "Product": item.get("product_name", ""),
            "Status": item.get("status", ""),
            "Opening_Qty": item.get("opening_qty", 0),
            "Avg_Price": item.get("avg_price", 0),
            "Opening_Value": round((item.get("opening_qty", 0) or 0) * (item.get("avg_price", 0) or 0), 2),
            "Purchase_Qty": item.get("purchase_qty", 0),
            "Dispatch_Qty": item.get("dispatch_qty", 0),
            "Wastage_Qty": item.get("wastage_qty", 0),
            "Wastage_Percent": item.get("wastage_percent", 0),
            "Wastage_Value": item.get("wastage_value", 0),
            "Closing_Qty": item.get("closing_qty", 0),
            "Closing_Value": round((item.get("closing_qty", 0) or 0) * (item.get("avg_price", 0) or 0), 2)
        })
    
    return processed_data


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
    
    # Add job with misfire grace time to catch up on missed runs
    scheduler.add_job(
        run_daily_backup,
        trigger=trigger,
        args=[db],
        id="daily_backup",
        name="Daily FreshFlow Backup",
        replace_existing=True,
        misfire_grace_time=3600  # Allow 1 hour grace period
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
