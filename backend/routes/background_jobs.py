"""
Background job management for long-running tasks like COGS backfill and dispatch recompute.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from dependencies import get_db, get_current_user
from routes.combo_utils import is_combo_product, parse_combo_product
from routes.dashboard_analytics import add_combo_ingredient_dispatches

router = APIRouter(prefix="/jobs", tags=["background-jobs"])
logger = logging.getLogger(__name__)

# In-memory job store (for simplicity - could use Redis for production scale)
jobs = {}


class JobStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


async def create_job(db: AsyncIOMotorDatabase, job_type: str, params: dict, user_id: str) -> str:
    """Create a new background job and return its ID."""
    job_id = str(uuid.uuid4())[:8]
    
    job = {
        "id": job_id,
        "type": job_type,
        "params": params,
        "user_id": user_id,
        "status": JobStatus.PENDING,
        "progress": 0,
        "progress_message": "Initializing...",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "completed_at": None,
        "result": None,
        "error": None
    }
    
    # Store in memory and database
    jobs[job_id] = job
    await db.background_jobs.insert_one({**job, "_id": job_id})
    
    return job_id


async def update_job(db: AsyncIOMotorDatabase, job_id: str, **updates):
    """Update job status and progress."""
    if job_id in jobs:
        jobs[job_id].update(updates)
    
    await db.background_jobs.update_one(
        {"id": job_id},
        {"$set": updates}
    )


async def get_job(db: AsyncIOMotorDatabase, job_id: str) -> Optional[dict]:
    """Get job status."""
    # Check memory first
    if job_id in jobs:
        return jobs[job_id]
    
    # Fall back to database
    job = await db.background_jobs.find_one({"id": job_id}, {"_id": 0})
    return job


# ============ COGS Backfill Background Task ============

async def run_cogs_backfill_task(db: AsyncIOMotorDatabase, job_id: str, from_date: str, to_date: str):
    """Run COGS backfill as a background task."""
    from routes.daily_cogs import get_all_products, compute_daily_cogs_for_date, save_daily_cogs
    
    try:
        await update_job(db, job_id, 
            status=JobStatus.RUNNING,
            started_at=datetime.now(timezone.utc).isoformat(),
            progress_message="Fetching products..."
        )
        
        products = await get_all_products(db)
        logger.info(f"[JOB:{job_id}] Found {len(products)} products")
        
        # Generate date list
        start = datetime.strptime(from_date, "%Y-%m-%d")
        end = datetime.strptime(to_date, "%Y-%m-%d")
        dates = []
        current = start
        while current <= end:
            dates.append(current.strftime("%Y-%m-%d"))
            current += timedelta(days=1)
        
        total_dates = len(dates)
        dates_processed = 0
        
        for date_str in dates:
            await update_job(db, job_id,
                progress=int((dates_processed / total_dates) * 100),
                progress_message=f"Processing {date_str}... ({dates_processed + 1}/{total_dates})"
            )
            
            cogs_data = await compute_daily_cogs_for_date(db, date_str, products)
            await save_daily_cogs(db, cogs_data)
            
            dates_processed += 1
            
            # Small yield to prevent blocking
            await asyncio.sleep(0.01)
        
        # Create indexes
        await db.daily_cogs.create_index([("product_name", 1), ("date", 1)], unique=True)
        await db.daily_cogs.create_index([("date", 1)])
        
        await update_job(db, job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            progress_message="Complete!",
            completed_at=datetime.now(timezone.utc).isoformat(),
            result={
                "dates_processed": dates_processed,
                "products_count": len(products)
            }
        )
        
        logger.info(f"[JOB:{job_id}] COGS backfill completed: {dates_processed} dates")
        
    except Exception as e:
        logger.error(f"[JOB:{job_id}] COGS backfill failed: {e}")
        await update_job(db, job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(e)
        )


# ============ Recompute Historical Dispatches Background Task ============

async def run_recompute_dispatches_task(db: AsyncIOMotorDatabase, job_id: str, from_date: str, to_date: str):
    """Run historical dispatch recompute as a background task."""
    import re
    
    def extract_weight_from_packaging_name(name):
        if not name:
            return 0
        name_lower = str(name).lower()
        range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(?:gm|g)\b', name_lower)
        if range_match:
            return (int(range_match.group(1)) + int(range_match.group(2))) // 2
        gm_match = re.search(r'(\d+)\+?\s*(?:gm|g)\b', name_lower)
        if gm_match:
            return int(gm_match.group(1))
        kg_match = re.search(r'(\d+(?:\.\d+)?)\s*kg', name_lower)
        if kg_match:
            return float(kg_match.group(1)) * 1000
        if 'bunch' in name_lower:
            return 100
        return 0
    
    def is_combo_product(name):
        if not name:
            return False
        name_lower = name.lower()
        return 'combo' in name_lower or ('pack' in name_lower and '+' in name_lower) or ('-fk' in name_lower)
    
    try:
        await update_job(db, job_id,
            status=JobStatus.RUNNING,
            started_at=datetime.now(timezone.utc).isoformat(),
            progress_message="Loading reference data..."
        )
        
        # Generate date list
        start = datetime.strptime(from_date, "%Y-%m-%d")
        end = datetime.strptime(to_date, "%Y-%m-%d")
        dates = []
        current = start
        while current <= end:
            dates.append(current.strftime("%Y-%m-%d"))
            current += timedelta(days=1)
        
        # Load reference data
        packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
        packaging_map = {}
        for p in packaging_variants:
            name = p['name']
            weight = p.get('weight_gm') or extract_weight_from_packaging_name(name)
            if weight > 0:
                packaging_map[name.lower().strip()] = weight
        
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        cost_alias_id_map = {}
        for product in products:
            alias_id = product.get("cost_alias_product_id")
            if alias_id:
                cost_alias_id_map[product["id"]] = alias_id
        
        all_qc_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(10000)
        all_retailer_dispatches = await db.retailer_dispatches.find({}, {"_id": 0}).to_list(10000)
        
        total_dates = len(dates)
        total_updated = 0
        total_matched = 0
        
        for i, date in enumerate(dates):
            await update_job(db, job_id,
                progress=int((i / total_dates) * 100),
                progress_message=f"Processing {date}... ({i + 1}/{total_dates})"
            )
            
            # Calculate dispatches for this date
            dispatches_by_product = {}
            all_dispatch_items = []  # Collect for combo processing
            
            for d in all_qc_dispatches + all_retailer_dispatches:
                dispatch_date = d.get("dispatch_date", "")
                if isinstance(dispatch_date, datetime):
                    dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
                else:
                    dispatch_date_str = str(dispatch_date)[:10]
                
                if dispatch_date_str == date:
                    for item in d.get("items", []):
                        product_id = item.get("product_id")
                        product_name = item.get("product_name", "")
                        target_product_id = cost_alias_id_map.get(product_id, product_id)
                        supplied_qty = item.get("supplied_qty", 0) or 0
                        packaging_name = (item.get("packaging_name") or item.get("variant_name") or "").lower().strip()
                        
                        # Collect ALL dispatch items for combo processing
                        all_dispatch_items.append(item)
                        
                        if is_combo_product(product_name):
                            continue
                        
                        weight_gm = packaging_map.get(packaging_name) or extract_weight_from_packaging_name(packaging_name) or 1000
                        qty_kg = (supplied_qty * weight_gm) / 1000
                        
                        if target_product_id not in dispatches_by_product:
                            dispatches_by_product[target_product_id] = {"qty": 0, "value": 0}
                        dispatches_by_product[target_product_id]["qty"] += qty_kg
            
            # Add combo ingredient dispatches to their respective base products
            dispatches_by_product = add_combo_ingredient_dispatches(
                dispatches_by_product, all_dispatch_items, products, packaging_map
            )
            
            # Update stock status entries
            stock_entries = await db.daily_stock_status.find({
                "$or": [{"date": date}, {"date": {"$regex": f"^{date}"}}]
            }).to_list(500)
            
            total_matched += len(stock_entries)
            
            for entry in stock_entries:
                product_id = entry.get("product_id")
                old_dispatch = entry.get("dispatch_qty", 0) or 0
                old_wastage = entry.get("wastage_qty", 0) or 0
                entry_status = entry.get("status")
                entry_closing = entry.get("closing_qty")
                
                dispatch_data = dispatches_by_product.get(product_id, {"qty": 0})
                new_dispatch = round(dispatch_data["qty"], 2)
                
                dispatch_changed = abs(new_dispatch - old_dispatch) > 0.001
                is_closed = entry_status == "closed" and entry_closing is not None
                
                if not dispatch_changed and not is_closed:
                    continue
                
                update_data = {}
                if dispatch_changed:
                    update_data["dispatch_qty"] = new_dispatch
                
                if is_closed:
                    opening_qty = entry.get("opening_qty", 0) or 0
                    purchase_qty = entry.get("purchase_qty", 0) or 0
                    closing_qty = entry_closing or 0
                    avg_price = entry.get("avg_price", 0) or 0
                    
                    dispatch_for_calc = new_dispatch if dispatch_changed else old_dispatch
                    total_available = opening_qty + purchase_qty - dispatch_for_calc
                    wastage_qty = max(0, total_available - closing_qty)
                    wastage_value = wastage_qty * avg_price
                    total_input = opening_qty + purchase_qty
                    wastage_percent = (wastage_qty / total_input * 100) if total_input > 0 else 0
                    
                    wastage_changed = abs(wastage_qty - old_wastage) > 0.001
                    if wastage_changed or dispatch_changed:
                        update_data.update({
                            "wastage_qty": round(wastage_qty, 2),
                            "wastage_value": round(wastage_value, 2),
                            "wastage_percent": round(wastage_percent, 2)
                        })
                
                if update_data:
                    await db.daily_stock_status.update_one(
                        {"_id": entry["_id"]},
                        {"$set": update_data}
                    )
                    total_updated += 1
            
            await asyncio.sleep(0.01)
        
        await update_job(db, job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            progress_message="Complete!",
            completed_at=datetime.now(timezone.utc).isoformat(),
            result={
                "dates_processed": len(dates),
                "total_matched": total_matched,
                "total_updated": total_updated
            }
        )
        
        logger.info(f"[JOB:{job_id}] Recompute completed: {total_updated} updates")
        
    except Exception as e:
        logger.error(f"[JOB:{job_id}] Recompute failed: {e}")
        await update_job(db, job_id,
            status=JobStatus.FAILED,
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(e)
        )


# ============ API Endpoints ============

@router.post("/cogs-backfill")
async def start_cogs_backfill_job(
    from_date: str,
    to_date: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Start a COGS backfill job in the background."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    user_id = current_user.get("id") or current_user.get("user_id") or current_user.get("_id", "unknown")
    
    job_id = await create_job(db, "cogs_backfill", {
        "from_date": from_date,
        "to_date": to_date
    }, str(user_id))
    
    # Start background task
    asyncio.create_task(run_cogs_backfill_task(db, job_id, from_date, to_date))
    
    return {"job_id": job_id, "status": "started"}


@router.post("/recompute-dispatches")
async def start_recompute_dispatches_job(
    from_date: str,
    to_date: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Start a historical dispatch recompute job in the background."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    user_id = current_user.get("id") or current_user.get("user_id") or current_user.get("_id", "unknown")
    
    job_id = await create_job(db, "recompute_dispatches", {
        "from_date": from_date,
        "to_date": to_date
    }, str(user_id))
    
    # Start background task
    asyncio.create_task(run_recompute_dispatches_task(db, job_id, from_date, to_date))
    
    return {"job_id": job_id, "status": "started"}


@router.get("/status/{job_id}")
async def get_job_status(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get the status of a background job."""
    job = await get_job(db, job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return {
        "id": job["id"],
        "type": job["type"],
        "status": job["status"],
        "progress": job["progress"],
        "progress_message": job["progress_message"],
        "result": job.get("result"),
        "error": job.get("error"),
        "created_at": job["created_at"],
        "completed_at": job.get("completed_at")
    }
