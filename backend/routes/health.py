"""
Health & Diagnostics Routes
===========================
Extracted from server.py for modular organization.
Handles health checks, system diagnostics, and error logging.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import time
import asyncio
import uuid

from dependencies import (
    db,
    get_current_user,
    logger,
    recent_errors,
    system_health_metrics,
    persist_error_log,
    MAX_ERROR_LOG
)

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Basic health check endpoint"""
    db_status = "unknown"
    db_ping_ms = -1
    db_query_ms = -1
    products_count = -1
    
    try:
        # Test MongoDB ping
        start = time.time()
        await db.command("ping")
        db_ping_ms = round((time.time() - start) * 1000, 2)
        db_status = "connected"
        
        # Test actual query
        query_start = time.time()
        products_count = await db.products.count_documents({})
        db_query_ms = round((time.time() - query_start) * 1000, 2)
    except Exception as e:
        db_status = f"error: {str(e)[:100]}"
        system_health_metrics["consecutive_db_failures"] += 1
        system_health_metrics["last_db_error"] = datetime.now(timezone.utc).isoformat()
    
    is_healthy = db_status == "connected" and system_health_metrics["consecutive_db_failures"] < 5
    
    return {
        "status": "healthy" if is_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "db_ping_ms": db_ping_ms,
        "db_query_ms": db_query_ms,
        "products_count": products_count,
        "consecutive_failures": system_health_metrics["consecutive_db_failures"],
        "version": "1.0.0"
    }


@router.get("/health/detailed")
async def health_check_detailed():
    """Detailed health check - no auth required, for monitoring"""
    try:
        start = time.time()
        await db.command("ping")
        db_ping_ms = round((time.time() - start) * 1000, 2)
        db_status = "connected"
        
        # Test a simple query
        query_start = time.time()
        await db.users.find_one({}, {"_id": 1})
        query_ms = round((time.time() - query_start) * 1000, 2)
    except Exception as e:
        db_status = f"error: {str(e)}"
        db_ping_ms = -1
        query_ms = -1
    
    # Calculate metrics
    startup = datetime.fromisoformat(system_health_metrics["startup_time"].replace("Z", "+00:00"))
    uptime_seconds = (datetime.now(timezone.utc) - startup).total_seconds()
    
    total_req = system_health_metrics["total_requests"]
    total_err = system_health_metrics["total_errors"]
    error_rate = round((total_err / total_req * 100), 2) if total_req > 0 else 0
    
    is_healthy = db_status == "connected" and system_health_metrics["consecutive_db_failures"] < 5
    
    return {
        "status": "healthy" if is_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": int(uptime_seconds),
        "database": {
            "status": db_status,
            "ping_ms": db_ping_ms,
            "query_ms": query_ms
        },
        "metrics": {
            "total_requests": total_req,
            "total_errors": total_err,
            "error_rate_percent": error_rate,
            "consecutive_db_failures": system_health_metrics["consecutive_db_failures"],
            "last_error": system_health_metrics["last_db_error"]
        },
        "recent_errors_count": len([e for e in recent_errors if e.get("status_code", 0) >= 500])
    }


@router.get("/diagnostics")
async def get_diagnostics(current_user: dict = Depends(get_current_user)):
    """Get recent error logs and system diagnostics (admin only)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        # Test MongoDB connection with timeout
        start = time.time()
        await db.command("ping")
        db_ping_ms = round((time.time() - start) * 1000, 2)
        db_status = "connected"
        
        # Get collection stats
        collections = await db.list_collection_names()
        collection_counts = {}
        for coll in collections[:10]:  # Limit to 10 collections
            count = await db[coll].count_documents({})
            collection_counts[coll] = count
        
        # Get persisted logs from DB (last 50)
        db_logs = await db.system_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(50).to_list(50)
        total_db_logs = await db.system_logs.count_documents({})
    except Exception as e:
        db_status = f"error: {str(e)}"
        db_ping_ms = -1
        collection_counts = {}
        db_logs = []
        total_db_logs = 0
    
    # Calculate uptime
    startup = datetime.fromisoformat(system_health_metrics["startup_time"].replace("Z", "+00:00"))
    uptime_seconds = (datetime.now(timezone.utc) - startup).total_seconds()
    uptime_str = f"{int(uptime_seconds // 3600)}h {int((uptime_seconds % 3600) // 60)}m"
    
    # Error rate calculation
    total_req = system_health_metrics["total_requests"]
    total_err = system_health_metrics["total_errors"]
    error_rate = round((total_err / total_req * 100), 2) if total_req > 0 else 0
    
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "system_health": {
            "status": "critical" if system_health_metrics["consecutive_db_failures"] > 5 else ("degraded" if db_status != "connected" else "healthy"),
            "uptime": uptime_str,
            "startup_time": system_health_metrics["startup_time"],
            "total_requests": total_req,
            "total_errors": total_err,
            "error_rate_percent": error_rate,
            "consecutive_db_failures": system_health_metrics["consecutive_db_failures"],
            "last_db_error": system_health_metrics["last_db_error"]
        },
        "database": {
            "status": db_status,
            "ping_ms": db_ping_ms,
            "collections": collection_counts
        },
        "recent_errors_memory": recent_errors[-30:],  # Last 30 errors in memory
        "persisted_errors": {
            "total_count": total_db_logs,
            "recent": db_logs[:20]  # Last 20 from database
        },
        "error_count_memory": len(recent_errors),
        "note": "Memory logs reset on server restart. DB logs persist."
    }


@router.get("/system-logs")
async def get_system_logs(
    limit: int = 100,
    log_type: str = None,
    from_time: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get system logs from database with optional filters"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        query = {}
        if log_type:
            query["type"] = log_type
        if from_time:
            query["timestamp"] = {"$gte": from_time}
        
        logs = await db.system_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
        
        # Get summary stats
        total_count = await db.system_logs.count_documents({})
        error_count = await db.system_logs.count_documents({"status_code": {"$gte": 500}})
        slow_count = await db.system_logs.count_documents({"type": "slow_request"})
        
        return {
            "logs": logs,
            "summary": {
                "total_logs": total_count,
                "server_errors_5xx": error_count,
                "slow_requests": slow_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/error-logs")
async def get_error_logs(
    limit: int = 100,
    error_type: str = None,  # exception, http_error, slow_request
    from_date: str = None,   # YYYY-MM-DD
    to_date: str = None,     # YYYY-MM-DD
    environment: str = None, # production, preview
    critical_only: bool = False,
    path_filter: str = None, # Filter by API path
    current_user: dict = Depends(get_current_user)
):
    """
    Get error logs from MongoDB for cross-environment analysis.
    Production errors are stored in the same DB and can be viewed from preview.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        query = {}
        
        if error_type:
            query["type"] = error_type
        if environment:
            query["environment"] = environment
        if critical_only:
            query["is_critical"] = True
        if path_filter:
            query["path"] = {"$regex": path_filter, "$options": "i"}
        
        # Date filters
        if from_date or to_date:
            query["timestamp"] = {}
            if from_date:
                query["timestamp"]["$gte"] = f"{from_date}T00:00:00"
            if to_date:
                query["timestamp"]["$lte"] = f"{to_date}T23:59:59"
        
        # Get logs
        logs = await db.error_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
        
        # Get summary stats
        total_count = await db.error_logs.count_documents({})
        critical_count = await db.error_logs.count_documents({"is_critical": True})
        
        # Get counts by environment
        env_pipeline = [
            {"$group": {"_id": "$environment", "count": {"$sum": 1}}}
        ]
        env_stats = await db.error_logs.aggregate(env_pipeline).to_list(10)
        env_counts = {e["_id"]: e["count"] for e in env_stats if e["_id"]}
        
        # Get counts by error type
        type_pipeline = [
            {"$group": {"_id": "$type", "count": {"$sum": 1}}}
        ]
        type_stats = await db.error_logs.aggregate(type_pipeline).to_list(10)
        type_counts = {t["_id"]: t["count"] for t in type_stats if t["_id"]}
        
        # Get most common error paths
        path_pipeline = [
            {"$match": {"status_code": {"$gte": 500}}},
            {"$group": {"_id": "$path", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        path_stats = await db.error_logs.aggregate(path_pipeline).to_list(10)
        
        return {
            "logs": logs,
            "summary": {
                "total_logs": total_count,
                "critical_errors": critical_count,
                "by_environment": env_counts,
                "by_type": type_counts,
                "most_error_prone_paths": path_stats
            },
            "filters_applied": {
                "error_type": error_type,
                "from_date": from_date,
                "to_date": to_date,
                "environment": environment,
                "critical_only": critical_only,
                "path_filter": path_filter
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/error-logs/summary")
async def get_error_logs_summary(
    hours: int = 24,
    current_user: dict = Depends(get_current_user)
):
    """Get error summary for last N hours - useful for quick health check"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        cutoff_time = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        
        # Get recent errors
        recent_query = {"timestamp": {"$gte": cutoff_time}}
        recent_count = await db.error_logs.count_documents(recent_query)
        critical_recent = await db.error_logs.count_documents({**recent_query, "is_critical": True})
        
        # Get hourly breakdown
        hourly_pipeline = [
            {"$match": {"timestamp": {"$gte": cutoff_time}}},
            {"$addFields": {
                "hour": {"$substr": ["$timestamp", 0, 13]}  # Extract YYYY-MM-DDTHH
            }},
            {"$group": {
                "_id": "$hour",
                "count": {"$sum": 1},
                "critical": {"$sum": {"$cond": ["$is_critical", 1, 0]}}
            }},
            {"$sort": {"_id": -1}},
            {"$limit": 24}
        ]
        hourly_stats = await db.error_logs.aggregate(hourly_pipeline).to_list(24)
        
        # Get sample of recent critical errors
        recent_critical = await db.error_logs.find(
            {**recent_query, "is_critical": True},
            {"_id": 0, "timestamp": 1, "path": 1, "error_message": 1, "error_type": 1, "environment": 1}
        ).sort("timestamp", -1).limit(10).to_list(10)
        
        return {
            "time_range": f"Last {hours} hours",
            "cutoff_time": cutoff_time,
            "summary": {
                "total_errors": recent_count,
                "critical_errors": critical_recent,
                "error_rate_per_hour": round(recent_count / hours, 2) if hours > 0 else 0
            },
            "hourly_breakdown": hourly_stats,
            "recent_critical_errors": recent_critical
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/error-logs/clear")
async def clear_error_logs(
    older_than_days: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Clear error logs older than specified days"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=older_than_days)).isoformat()
        result = await db.error_logs.delete_many({"timestamp": {"$lt": cutoff}})
        
        return {
            "message": f"Cleared {result.deleted_count} logs older than {older_than_days} days",
            "deleted_count": result.deleted_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
