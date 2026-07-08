"""
QC Indents and QC Dispatches Routes
===================================
Extracted from server.py for modular organization.
Handles QC indent management, OCR processing, and dispatch management.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, List
import uuid
import base64

from dependencies import (
    db,
    get_current_user,
    logger,
)
from models import (
    QCIndent,
    QCIndentCreate,
    QCIndentUpdate,
    QCDispatch,
    QCDispatchCreate,
)
from ocr_indent_processor import extract_indent_from_image, map_sku_to_product, map_uom_to_packaging

router = APIRouter(tags=["qc_indents_dispatches"])


# ============================================================================
# QC INDENT ROUTES
# ============================================================================
@router.get("/qc-indents")
async def get_qc_indents(
    from_date: str = None,
    to_date: str = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if from_date or to_date:
        date_filter = {}
        if from_date:
            date_filter["$gte"] = from_date
        if to_date:
            date_filter["$lte"] = to_date + "T23:59:59"
        query["indent_date"] = date_filter
    
    indents = await db.qc_indents.find(query, {"_id": 0}).sort("indent_date", -1).to_list(limit)
    for i in indents:
        if isinstance(i.get('indent_date'), str):
            i['indent_date'] = datetime.fromisoformat(i['indent_date'])
        if isinstance(i.get('created_at'), str):
            i['created_at'] = datetime.fromisoformat(i['created_at'])
    return indents


@router.post("/qc-indents")
async def create_qc_indent(input: QCIndentCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    indent_dict = input.model_dump()
    indent_dict["recorded_by"] = current_user["user_id"]
    indent = QCIndent(**indent_dict)
    
    doc = indent.model_dump()
    doc['indent_date'] = doc['indent_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_indents.insert_one(doc)
    return {"id": indent.id, "message": "Indent created successfully"}


@router.put("/qc-indents/{indent_id}")
async def update_qc_indent(indent_id: str, input: QCIndentUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if 'indent_date' in update_data:
        update_data['indent_date'] = update_data['indent_date'].isoformat()
    
    result = await db.qc_indents.update_one({"id": indent_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    return {"message": "Indent updated successfully"}


@router.delete("/qc-indents/{indent_id}")
async def delete_qc_indent(indent_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_indents.delete_one({"id": indent_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Indent not found")
    
    return {"message": "Indent deleted successfully"}


@router.get("/qc-indents/previous/{customer_name}")
async def get_previous_qc_indent(customer_name: str, current_user: dict = Depends(get_current_user)):
    """Get the most recent indent for a customer to use as template"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find the most recent indent for this customer
    indent = await db.qc_indents.find_one(
        {"customer_name": customer_name},
        {"_id": 0},
        sort=[("indent_date", -1), ("created_at", -1)]
    )
    
    if not indent:
        return {"indent": None, "message": "No previous indent found"}
    
    return {"indent": indent, "message": "Previous indent found"}


# ============================================================================
# QC INDENT OCR PROCESSING
# ============================================================================
@router.post("/qc-indents/ocr")
async def process_qc_indent_ocr(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Process an uploaded Ninjacart indent image using OCR.
    Extracts product data and returns preview for user confirmation.
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Validate file type
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    try:
        # Read file content
        file_content = await file.read()
        
        # Convert to base64
        image_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # Call OCR processor
        ocr_result = await extract_indent_from_image(image_base64, file.content_type)
        
        if not ocr_result["success"]:
            return {
                "success": False,
                "error": ocr_result.get("error", "OCR processing failed"),
                "indent_date": None,
                "items": []
            }
        
        # Get products and packagings for mapping
        products = await db.products.find({}, {"_id": 0}).to_list(1000)
        packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
        
        # Map extracted items to products and packagings
        mapped_items = []
        for item in ocr_result["items"]:
            # Map SKU to product
            product_match = map_sku_to_product(item["nc_sku_id"], products)
            
            # Map UOM to packaging
            packaging_match = map_uom_to_packaging(item["uom"], item["ca"], packagings)
            
            mapped_items.append({
                "nc_sku_id": item["nc_sku_id"],
                "product_id": product_match["product_id"],
                "product_name": product_match["product_name"],
                "uom": item["uom"],
                "ca": item["ca"],  # KG or PCS
                "packaging_id": packaging_match["packaging_id"],
                "packaging_name": packaging_match["packaging_name"],
                "packaging_weight_gm": packaging_match["weight_gm"],
                "units_total_demand": item["units"],
                "mr_organix_qty": item["mr_organix"],
                "is_matched": product_match["product_id"] is not None
            })
        
        return {
            "success": True,
            "indent_date": ocr_result["indent_date"],
            "items": mapped_items,
            "total_items": len(mapped_items),
            "matched_items": sum(1 for i in mapped_items if i["is_matched"]),
            "unmatched_items": sum(1 for i in mapped_items if not i["is_matched"])
        }
        
    except Exception as e:
        logger.error(f"OCR processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@router.post("/qc-indents/create-from-ocr")
async def create_qc_indent_from_ocr(
    input: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a QC indent from OCR-extracted data.
    Expected input:
    {
        "customer_name": "Ninjacart",
        "indent_date": "2026-04-27",
        "items": [
            {
                "product_id": "xxx",
                "product_name": "Coriander",
                "packaging_id": "yyy",
                "packaging_name": "90-110gm",
                "required_qty": 252,
                "lot_size": 25,
                "rate": null
            }
        ]
    }
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    customer_name = input.get("customer_name", "Ninjacart")
    indent_date = input.get("indent_date")
    items = input.get("items", [])
    
    if not indent_date:
        indent_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    
    if not items:
        raise HTTPException(status_code=400, detail="No items provided")
    
    # Prepare indent items
    indent_items = []
    for item in items:
        qty = float(item.get("required_qty", 0))
        lot_size = int(item.get("lot_size", 25))  # Default lot size
        no_of_crates = lot_size > 0 and qty > 0 and int((qty + lot_size - 1) // lot_size) or 0
        
        indent_items.append({
            "product_id": item.get("product_id") or str(uuid.uuid4()),
            "product_name": item.get("product_name", ""),
            "product_unit": item.get("ca", "KG"),
            "packaging_id": item.get("packaging_id", ""),
            "packaging_name": item.get("packaging_name", ""),
            "required_qty": qty,
            "lot_size": lot_size,
            "no_of_crates": no_of_crates,
            "rate": item.get("rate"),
            # Store OCR-specific fields for reference
            "ocr_nc_sku_id": item.get("nc_sku_id", ""),
            "ocr_units_total_demand": item.get("units_total_demand", 0)
        })
    
    # Create the indent
    indent_id = str(uuid.uuid4())
    indent_doc = {
        "id": indent_id,
        "indent_date": f"{indent_date}T00:00:00+00:00" if 'T' not in indent_date else indent_date,
        "customer_name": customer_name,
        "items": indent_items,
        "status": "pending",
        "source": "ocr",  # Mark as created from OCR
        "recorded_by": current_user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.qc_indents.insert_one(indent_doc)
    indent_doc.pop("_id", None)
    
    return {
        "success": True,
        "message": f"Indent created successfully with {len(indent_items)} items",
        "indent_id": indent_id,
        "indent": indent_doc
    }


# ============================================================================
# QC DISPATCH ROUTES
# ============================================================================
@router.get("/qc-dispatches")
async def get_qc_dispatches(
    from_date: str = None,
    to_date: str = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = {}
    if from_date or to_date:
        date_filter = {}
        if from_date:
            date_filter["$gte"] = from_date
        if to_date:
            date_filter["$lte"] = to_date + "T23:59:59"
        query["dispatch_date"] = date_filter
    
    dispatches = await db.qc_dispatches.find(query, {"_id": 0}).sort("dispatch_date", -1).to_list(limit)
    for d in dispatches:
        if isinstance(d.get('dispatch_date'), str):
            d['dispatch_date'] = datetime.fromisoformat(d['dispatch_date'])
        if isinstance(d.get('created_at'), str):
            d['created_at'] = datetime.fromisoformat(d['created_at'])
    return dispatches


@router.post("/qc-dispatches")
async def create_qc_dispatch(input: QCDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    dispatch_dict = input.model_dump()
    dispatch_dict["recorded_by"] = current_user["user_id"]
    dispatch = QCDispatch(**dispatch_dict)
    
    doc = dispatch.model_dump()
    dispatch_date_str = doc['dispatch_date'].isoformat() if hasattr(doc['dispatch_date'], 'isoformat') else str(doc['dispatch_date'])
    doc['dispatch_date'] = dispatch_date_str
    doc['created_at'] = doc['created_at'].isoformat()
    await db.qc_dispatches.insert_one(doc)
    
    # Check if all indent qty is dispatched to update status
    indent = await db.qc_indents.find_one({"id": input.indent_id})
    if indent:
        # Get all dispatches for this indent
        all_dispatches = await db.qc_dispatches.find({"indent_id": input.indent_id}, {"_id": 0}).to_list(100)
        
        # Calculate total dispatched per product
        total_dispatched = {}
        for d in all_dispatches:
            for item in d.get('items', []):
                key = item['product_id']
                total_dispatched[key] = total_dispatched.get(key, 0) + item.get('supplied_qty', 0)
        
        # Check if fully dispatched
        fully_dispatched = True
        for item in indent.get('items', []):
            dispatched = total_dispatched.get(item['product_id'], 0)
            if dispatched < item['required_qty']:
                fully_dispatched = False
                break
        
        # Update indent status
        new_status = "dispatched" if fully_dispatched else "partial"
        await db.qc_indents.update_one({"id": input.indent_id}, {"$set": {"status": new_status}})
    
    # AUTO-SYNC: If stock is already closed for this date, recalculate dispatches
    dispatch_date_only = dispatch_date_str[:10]
    closed_status_exists = await db.daily_stock_status.find_one({
        "date": dispatch_date_only,
        "status": "closed"
    })
    
    stock_synced = False
    if closed_status_exists:
        try:
            # Import and call the recalculate function
            from routes.dashboard_analytics import recalculate_dispatches_for_date
            result = await recalculate_dispatches_for_date(dispatch_date_only)
            stock_synced = True
            logger.info(f"Auto-synced stock status for {dispatch_date_only} after QC dispatch creation")
        except Exception as e:
            logger.error(f"Failed to auto-sync stock status for {dispatch_date_only}: {e}")
    
    return {"id": dispatch.id, "message": "Dispatch created successfully", "stock_synced": stock_synced}


@router.put("/qc-dispatches/{dispatch_id}")
async def update_qc_dispatch(dispatch_id: str, input: QCDispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    existing = await db.qc_dispatches.find_one({"id": dispatch_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Capture both old and new dispatch dates for potential sync
    old_dispatch_date = str(existing.get("dispatch_date", ""))[:10]
    
    update_data = input.model_dump()
    dispatch_date_str = update_data['dispatch_date'].isoformat() if hasattr(update_data['dispatch_date'], 'isoformat') else str(update_data['dispatch_date'])
    update_data['dispatch_date'] = dispatch_date_str
    new_dispatch_date = dispatch_date_str[:10]
    
    await db.qc_dispatches.update_one(
        {"id": dispatch_id},
        {"$set": update_data}
    )
    
    # AUTO-SYNC: If stock is already closed for either date, recalculate dispatches
    stock_synced = []
    dates_to_sync = set([old_dispatch_date, new_dispatch_date])
    
    for sync_date in dates_to_sync:
        if sync_date:
            closed_status_exists = await db.daily_stock_status.find_one({
                "date": sync_date,
                "status": "closed"
            })
            
            if closed_status_exists:
                try:
                    from routes.dashboard_analytics import recalculate_dispatches_for_date
                    await recalculate_dispatches_for_date(sync_date)
                    stock_synced.append(sync_date)
                    logger.info(f"Auto-synced stock status for {sync_date} after QC dispatch update")
                except Exception as e:
                    logger.error(f"Failed to auto-sync stock status for {sync_date}: {e}")
    
    return {"id": dispatch_id, "message": "Dispatch updated successfully", "stock_synced": stock_synced}


@router.delete("/qc-dispatches/{dispatch_id}")
async def delete_qc_dispatch(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the dispatch to find the indent_id
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    indent_id = dispatch.get("indent_id")
    
    # Delete the dispatch
    result = await db.qc_dispatches.delete_one({"id": dispatch_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Check if there are any remaining dispatches for this indent
    if indent_id:
        remaining_dispatches = await db.qc_dispatches.count_documents({"indent_id": indent_id})
        
        if remaining_dispatches == 0:
            # No more dispatches - reset indent status to pending
            await db.qc_indents.update_one(
                {"id": indent_id},
                {"$set": {"status": "pending"}}
            )
        else:
            # Check if indent is fully dispatched or partial
            indent = await db.qc_indents.find_one({"id": indent_id}, {"_id": 0})
            if indent:
                dispatches_for_indent = await db.qc_dispatches.find({"indent_id": indent_id}, {"_id": 0}).to_list(100)
                
                # Calculate total dispatched per product
                dispatched_by_product = {}
                for d in dispatches_for_indent:
                    for item in d.get("items", []):
                        product_id = item.get("product_id")
                        if product_id:
                            dispatched_by_product[product_id] = dispatched_by_product.get(product_id, 0) + item.get("supplied_qty", 0)
                
                # Check if all items are fully dispatched
                all_dispatched = True
                for item in indent.get("items", []):
                    product_id = item.get("product_id")
                    required = item.get("required_qty", 0)
                    dispatched = dispatched_by_product.get(product_id, 0)
                    if dispatched < required:
                        all_dispatched = False
                        break
                
                new_status = "dispatched" if all_dispatched else "partial"
                await db.qc_indents.update_one(
                    {"id": indent_id},
                    {"$set": {"status": new_status}}
                )
    
    # AUTO-SYNC: If stock is already closed for this date, recalculate dispatches
    dispatch_date_str = str(dispatch.get("dispatch_date", ""))[:10]
    stock_synced = False
    
    if dispatch_date_str:
        closed_status_exists = await db.daily_stock_status.find_one({
            "date": dispatch_date_str,
            "status": "closed"
        })
        
        if closed_status_exists:
            try:
                from routes.dashboard_analytics import recalculate_dispatches_for_date
                await recalculate_dispatches_for_date(dispatch_date_str)
                stock_synced = True
                logger.info(f"Auto-synced stock status for {dispatch_date_str} after QC dispatch deletion")
            except Exception as e:
                logger.error(f"Failed to auto-sync stock status for {dispatch_date_str}: {e}")
    
    return {"message": "Dispatch deleted successfully", "stock_synced": stock_synced}


@router.delete("/qc-dispatches/{dispatch_id}/items/{product_id}")
async def delete_qc_dispatch_item(dispatch_id: str, product_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a single item from a dispatch record"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the dispatch
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Extract dispatch date for auto-sync
    dispatch_date_str = str(dispatch.get("dispatch_date", ""))[:10]
    
    items = dispatch.get("items", [])
    original_count = len(items)
    
    # Filter out the item with matching product_id
    items = [item for item in items if item.get("product_id") != product_id]
    
    if len(items) == original_count:
        raise HTTPException(status_code=404, detail="Item not found in dispatch")
    
    # Helper function for auto-sync
    async def auto_sync_stock():
        stock_synced = False
        if dispatch_date_str:
            closed_status_exists = await db.daily_stock_status.find_one({
                "date": dispatch_date_str,
                "status": "closed"
            })
            if closed_status_exists:
                try:
                    from routes.dashboard_analytics import recalculate_dispatches_for_date
                    await recalculate_dispatches_for_date(dispatch_date_str)
                    stock_synced = True
                    logger.info(f"Auto-synced stock status for {dispatch_date_str} after QC dispatch item deletion")
                except Exception as e:
                    logger.error(f"Failed to auto-sync stock status for {dispatch_date_str}: {e}")
        return stock_synced
    
    if len(items) == 0:
        # If no items left, delete the entire dispatch
        await db.qc_dispatches.delete_one({"id": dispatch_id})
        
        # Update indent status
        indent_id = dispatch.get("indent_id")
        if indent_id:
            remaining_dispatches = await db.qc_dispatches.count_documents({"indent_id": indent_id})
            if remaining_dispatches == 0:
                await db.qc_indents.update_one({"id": indent_id}, {"$set": {"status": "pending"}})
        
        stock_synced = await auto_sync_stock()
        return {"message": "Dispatch deleted (no items remaining)", "stock_synced": stock_synced}
    
    # Update the dispatch with remaining items
    await db.qc_dispatches.update_one(
        {"id": dispatch_id},
        {"$set": {"items": items}}
    )
    
    stock_synced = await auto_sync_stock()
    return {"message": "Item removed from dispatch", "stock_synced": stock_synced}


@router.get("/qc-dispatches/{dispatch_id}/invoice-status")
async def check_qc_dispatch_invoice_status(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    """Check if a QC dispatch is linked to any invoice"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if dispatch exists
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Check if this dispatch is part of any invoice
    invoice = await db.qc_invoices.find_one(
        {"dispatch_ids": dispatch_id},
        {"_id": 0, "id": 1, "invoice_number": 1}
    )
    
    if invoice:
        return {
            "is_invoiced": True,
            "invoice_id": invoice.get("id"),
            "invoice_number": invoice.get("invoice_number")
        }
    
    return {"is_invoiced": False, "invoice_id": None, "invoice_number": None}


class QCDispatchItemUpdate(BaseModel):
    item_index: int
    supplied_qty: float
    no_of_crates: Optional[int] = None


@router.put("/qc-dispatches/{dispatch_id}/items/{item_index}")
async def update_qc_dispatch_item(
    dispatch_id: str, 
    item_index: int, 
    input: QCDispatchItemUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """Update a single item in a QC dispatch (quantity and crates)"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the dispatch
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Check if dispatch is invoiced
    invoice = await db.qc_invoices.find_one(
        {"dispatch_ids": dispatch_id},
        {"_id": 0, "invoice_number": 1}
    )
    if invoice:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot edit: Dispatch is part of invoice {invoice.get('invoice_number')}. Delete the invoice first."
        )
    
    items = dispatch.get("items", [])
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(status_code=404, detail="Item not found at specified index")
    
    # Update the item quantity and crates
    items[item_index]["supplied_qty"] = input.supplied_qty
    if input.no_of_crates is not None:
        items[item_index]["no_of_crates"] = input.no_of_crates
    
    # Update the dispatch
    await db.qc_dispatches.update_one(
        {"id": dispatch_id},
        {"$set": {"items": items}}
    )
    
    # AUTO-SYNC: If stock is already closed for this date, recalculate dispatches
    dispatch_date_str = str(dispatch.get("dispatch_date", ""))[:10]
    stock_synced = False
    if dispatch_date_str:
        closed_status_exists = await db.daily_stock_status.find_one({
            "date": dispatch_date_str,
            "status": "closed"
        })
        if closed_status_exists:
            try:
                from routes.dashboard_analytics import recalculate_dispatches_for_date
                await recalculate_dispatches_for_date(dispatch_date_str)
                stock_synced = True
                logger.info(f"Auto-synced stock status for {dispatch_date_str} after QC dispatch item update")
            except Exception as e:
                logger.error(f"Failed to auto-sync stock status for {dispatch_date_str}: {e}")
    
    return {"message": "Dispatch item updated successfully", "new_qty": input.supplied_qty, "new_crates": input.no_of_crates, "stock_synced": stock_synced}


@router.delete("/qc-dispatches/{dispatch_id}/items-by-index/{item_index}")
async def delete_qc_dispatch_item_by_index(
    dispatch_id: str, 
    item_index: int, 
    current_user: dict = Depends(get_current_user)
):
    """Delete a single item from a QC dispatch by index"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the dispatch
    dispatch = await db.qc_dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    
    # Extract dispatch date for auto-sync
    dispatch_date_str = str(dispatch.get("dispatch_date", ""))[:10]
    
    # Check if dispatch is invoiced
    invoice = await db.qc_invoices.find_one(
        {"dispatch_ids": dispatch_id},
        {"_id": 0, "invoice_number": 1}
    )
    if invoice:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete: Dispatch is part of invoice {invoice.get('invoice_number')}. Delete the invoice first."
        )
    
    items = dispatch.get("items", [])
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(status_code=404, detail="Item not found at specified index")
    
    # Remove the item at the specified index
    deleted_item = items.pop(item_index)
    
    # Helper function for auto-sync
    async def auto_sync_stock():
        stock_synced = False
        if dispatch_date_str:
            closed_status_exists = await db.daily_stock_status.find_one({
                "date": dispatch_date_str,
                "status": "closed"
            })
            if closed_status_exists:
                try:
                    from routes.dashboard_analytics import recalculate_dispatches_for_date
                    await recalculate_dispatches_for_date(dispatch_date_str)
                    stock_synced = True
                    logger.info(f"Auto-synced stock status for {dispatch_date_str} after QC dispatch item deletion by index")
                except Exception as e:
                    logger.error(f"Failed to auto-sync stock status for {dispatch_date_str}: {e}")
        return stock_synced
    
    if len(items) == 0:
        # If no items left, delete the entire dispatch
        await db.qc_dispatches.delete_one({"id": dispatch_id})
        
        # Update indent status
        indent_id = dispatch.get("indent_id")
        if indent_id:
            remaining_dispatches = await db.qc_dispatches.count_documents({"indent_id": indent_id})
            if remaining_dispatches == 0:
                await db.qc_indents.update_one({"id": indent_id}, {"$set": {"status": "pending"}})
        
        stock_synced = await auto_sync_stock()
        return {"message": "Dispatch deleted (no items remaining)", "deleted_item": deleted_item, "stock_synced": stock_synced}
    
    # Update the dispatch with remaining items
    await db.qc_dispatches.update_one(
        {"id": dispatch_id},
        {"$set": {"items": items}}
    )
    
    stock_synced = await auto_sync_stock()
    return {"message": "Item removed from dispatch", "deleted_item": deleted_item, "stock_synced": stock_synced}
