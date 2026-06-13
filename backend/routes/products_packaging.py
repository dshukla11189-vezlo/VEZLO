"""
Products & Packaging Routes
===========================
Extracted from server.py for modular organization.
Handles product CRUD, units, categories, types, QC packaging, and image management.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from datetime import datetime, timezone
from typing import List, Optional
import uuid
import os
import re
import asyncio

from dependencies import (
    db,
    get_current_user,
    logger,
    system_health_metrics,
    persist_error_log,
    HINDI_PRODUCT_NAMES,
)
from models import (
    Product,
    ProductCreate,
    ProductUpdate,
)

router = APIRouter(tags=["products"])

# Upload directory for product images
UPLOAD_DIR = "/app/uploads/products"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def compress_and_convert_image(image_data: bytes, max_size: int = 800) -> bytes:
    """Compress and resize image to max dimensions, convert to WebP"""
    from PIL import Image
    import io
    
    # Open image
    img = Image.open(io.BytesIO(image_data))
    
    # Convert to RGB if necessary (for PNG with transparency)
    if img.mode in ('RGBA', 'LA', 'P'):
        # Create white background
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Resize if larger than max_size
    if img.width > max_size or img.height > max_size:
        # Calculate new dimensions maintaining aspect ratio
        ratio = min(max_size / img.width, max_size / img.height)
        new_width = int(img.width * ratio)
        new_height = int(img.height * ratio)
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Save as WebP with compression
    output = io.BytesIO()
    img.save(output, format='WEBP', quality=85, optimize=True)
    return output.getvalue()


def extract_weight_from_packaging_name(name: str) -> float:
    """Extract weight in grams from packaging name like '500 gm', '240-260 gm', '200 gm Packet'"""
    if not name:
        return 0
    
    name_lower = name.lower().strip()
    
    # Pattern 1: Simple number + gm/g at start
    match = re.search(r'^(\d+)\s*(gm|g)\b', name_lower)
    if match:
        return float(match.group(1))
    
    # Pattern 2: Range like "240-260 gm" - take average
    range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(gm|g)', name_lower)
    if range_match:
        return (float(range_match.group(1)) + float(range_match.group(2))) / 2
    
    # Pattern 3: Number + gm/g anywhere in the string
    anywhere_match = re.search(r'(\d+)\s*(gm|g)\b', name_lower)
    if anywhere_match:
        return float(anywhere_match.group(1))
    
    # Pattern 4: Just a number (assume gm if no unit)
    just_number = re.search(r'^(\d+)$', name_lower)
    if just_number:
        return float(just_number.group(1))
    
    return 0


# ============================================================================
# PRODUCTS ROUTES
# ============================================================================
@router.get("/products", response_model=List[Product])
async def get_products(
    include_images: bool = True,
    current_user: dict = Depends(get_current_user)
):
    # For list views, exclude heavy image_url field for faster loading
    projection = {"_id": 0}
    if not include_images:
        projection["image_url"] = 0
    
    # Retry logic for intermittent connection issues
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        try:
            products = await db.products.find({}, projection).to_list(1000)
            # Reset consecutive failures on success
            system_health_metrics["consecutive_db_failures"] = 0
            return [Product(**p) for p in products]
        except Exception as e:
            last_error = e
            system_health_metrics["consecutive_db_failures"] += 1
            system_health_metrics["last_db_error"] = datetime.now(timezone.utc).isoformat()
            logger.error(f"Products fetch attempt {attempt + 1} failed: {str(e)}")
            if attempt < max_retries - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
    
    # All retries failed
    error_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": str(uuid.uuid4())[:8],
        "method": "GET",
        "path": "/api/products",
        "status_code": 500,
        "error_message": str(last_error)[:500],
        "error_type": type(last_error).__name__,
        "type": "db_connection_failure",
        "retries_attempted": max_retries
    }
    asyncio.create_task(persist_error_log(error_entry, is_critical=True))
    raise HTTPException(status_code=500, detail=f"Database connection error after {max_retries} retries")


@router.get("/products/images")
async def get_product_images(
    ids: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Get images for specific products - used for lazy loading"""
    if not ids:
        return {}
    
    product_ids = [id.strip() for id in ids.split(",") if id.strip()]
    if not product_ids or len(product_ids) > 100:
        return {}
    
    products = await db.products.find(
        {"id": {"$in": product_ids}},
        {"_id": 0, "id": 1, "image_url": 1}
    ).to_list(100)
    
    return {p["id"]: p.get("image_url", "") for p in products}


@router.post("/products", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(input: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Check for duplicate product name (case-insensitive)
    existing = await db.products.find_one({
        "name": {"$regex": f"^{input.name}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Product '{input.name}' already exists. Please use a different name or update the existing product."
        )
    
    product = Product(**input.model_dump())
    doc = product.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    # Auto-add Hindi name if available in translation dictionary
    if not doc.get('name_hi') and doc.get('name'):
        doc['name_hi'] = HINDI_PRODUCT_NAMES.get(doc['name'], None)
    
    await db.products.insert_one(doc)
    return product


@router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, input: ProductUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    result = await db.products.find_one_and_update(
        {"id": product_id},
        {"$set": update_data},
        return_document=True,
        projection={"_id": 0}
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Auto-sync translations to retailer_catalogue if translations were updated
    if 'name_hi' in update_data or 'name_mr' in update_data:
        catalogue_update = {}
        if update_data.get('name_hi'):
            catalogue_update["product_name_hi"] = update_data['name_hi']
        if update_data.get('name_mr'):
            catalogue_update["product_name_mr"] = update_data['name_mr']
        
        if catalogue_update:
            await db.retailer_catalogue.update_many(
                {"product_id": product_id},
                {"$set": catalogue_update}
            )
            logger.info(f"Synced translations for product {product_id} to catalogue")
    
    return Product(**result)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {"message": "Product deleted successfully"}


@router.get("/products/duplicates")
async def get_duplicate_products(current_user: dict = Depends(get_current_user)):
    """Get list of duplicate products by name"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view duplicates")
    
    pipeline = [
        {"$group": {
            "_id": {"$toLower": "$name"},
            "count": {"$sum": 1},
            "products": {"$push": {"id": "$id", "name": "$name", "category": "$category", "created_at": "$created_at"}}
        }},
        {"$match": {"count": {"$gt": 1}}},
        {"$sort": {"_id": 1}}
    ]
    
    duplicates = await db.products.aggregate(pipeline).to_list(100)
    return duplicates


@router.delete("/products/duplicates/cleanup")
async def cleanup_duplicate_products(current_user: dict = Depends(get_current_user)):
    """Remove duplicate products, keeping the oldest one"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can cleanup duplicates")
    
    pipeline = [
        {"$group": {
            "_id": {"$toLower": "$name"},
            "count": {"$sum": 1},
            "products": {"$push": {"id": "$id", "name": "$name", "created_at": "$created_at"}}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    duplicates = await db.products.aggregate(pipeline).to_list(100)
    
    deleted_count = 0
    deleted_products = []
    
    for dup in duplicates:
        products = dup["products"]
        products.sort(key=lambda x: x.get("created_at", ""))
        
        for product in products[1:]:
            await db.products.delete_one({"id": product["id"]})
            deleted_count += 1
            deleted_products.append(product["name"])
    
    return {
        "message": f"Deleted {deleted_count} duplicate products",
        "deleted_count": deleted_count,
        "deleted_products": deleted_products
    }


@router.post("/products/bulk-update-storage")
async def bulk_update_product_storage(input: dict, current_user: dict = Depends(get_current_user)):
    """Bulk update storage_type for multiple products"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    updates = input.get("updates", [])
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    updated_count = 0
    for item in updates:
        product_id = item.get("product_id")
        storage_type = item.get("storage_type")
        if product_id and storage_type in ["Outdoor", "Fridge"]:
            result = await db.products.update_one(
                {"id": product_id},
                {"$set": {"storage_type": storage_type}}
            )
            if result.modified_count > 0:
                updated_count += 1
    
    return {"message": f"Updated {updated_count} products", "updated_count": updated_count}


@router.post("/products/set-default-storage")
async def set_default_storage_type(current_user: dict = Depends(get_current_user)):
    """Set storage_type='Outdoor' for all products that don't have this field"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.products.update_many(
        {"$or": [{"storage_type": {"$exists": False}}, {"storage_type": None}]},
        {"$set": {"storage_type": "Outdoor"}}
    )
    
    return {"message": f"Set default storage type for {result.modified_count} products", "updated_count": result.modified_count}


@router.get("/products/{product_id}/dependencies")
async def check_product_dependencies(product_id: str, current_user: dict = Depends(get_current_user)):
    """Check if a product has any associated sales, purchases, or other records"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product_name = product.get("name", "")
    
    procurement_count = await db.procurements.count_documents({
        "$or": [
            {"product_id": product_id},
            {"product_name": {"$regex": f"^{product_name}$", "$options": "i"}}
        ]
    })
    
    qc_order_count = await db.qc_orders.count_documents({"items.product_id": product_id})
    indent_count = await db.retailer_indents.count_documents({"items.product_id": product_id})
    dispatch_count = await db.retailer_dispatches.count_documents({"items.product_id": product_id})
    invoice_count = await db.retailer_invoices.count_documents({"items.product_id": product_id})
    wastage_count = await db.wastage.count_documents({
        "$or": [
            {"product_id": product_id},
            {"product_name": {"$regex": f"^{product_name}$", "$options": "i"}}
        ]
    })
    
    total_dependencies = procurement_count + qc_order_count + indent_count + dispatch_count + invoice_count + wastage_count
    
    return {
        "product_id": product_id,
        "product_name": product_name,
        "has_dependencies": total_dependencies > 0,
        "dependencies": {
            "procurements": procurement_count,
            "qc_orders": qc_order_count,
            "indents": indent_count,
            "dispatches": dispatch_count,
            "invoices": invoice_count,
            "wastage": wastage_count,
            "total": total_dependencies
        }
    }


@router.post("/products/{product_id}/delete-with-replacement")
async def delete_product_with_replacement(product_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Delete a product and remap all its records to a replacement product"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    replacement_product_id = input.get("replacement_product_id")
    if not replacement_product_id:
        raise HTTPException(status_code=400, detail="Replacement product ID is required")
    
    original_product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not original_product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    replacement_product = await db.products.find_one({"id": replacement_product_id}, {"_id": 0})
    if not replacement_product:
        raise HTTPException(status_code=404, detail="Replacement product not found")
    
    original_name = original_product.get("name", "")
    replacement_name = replacement_product.get("name", "")
    
    remapped_counts = {
        "procurements": 0,
        "qc_orders": 0,
        "indents": 0,
        "dispatches": 0,
        "invoices": 0,
        "wastage": 0,
        "closing_inventory": 0
    }
    
    # 1. Update procurements
    proc_result = await db.procurements.update_many(
        {"$or": [
            {"product_id": product_id},
            {"product_name": {"$regex": f"^{original_name}$", "$options": "i"}}
        ]},
        {"$set": {"product_id": replacement_product_id, "product_name": replacement_name}}
    )
    remapped_counts["procurements"] = proc_result.modified_count
    
    # 2. Update QC orders (items array)
    qc_orders = await db.qc_orders.find({"items.product_id": product_id}).to_list(1000)
    for order in qc_orders:
        updated_items = []
        for item in order.get("items", []):
            if item.get("product_id") == product_id:
                item["product_id"] = replacement_product_id
                item["product_name"] = replacement_name
            updated_items.append(item)
        await db.qc_orders.update_one({"id": order["id"]}, {"$set": {"items": updated_items}})
        remapped_counts["qc_orders"] += 1
    
    # 3. Update retailer indents
    indents = await db.retailer_indents.find({"items.product_id": product_id}).to_list(1000)
    for indent in indents:
        updated_items = []
        for item in indent.get("items", []):
            if item.get("product_id") == product_id:
                item["product_id"] = replacement_product_id
                item["product_name"] = replacement_name
            updated_items.append(item)
        await db.retailer_indents.update_one({"id": indent["id"]}, {"$set": {"items": updated_items}})
        remapped_counts["indents"] += 1
    
    # 4. Update retailer dispatches
    dispatches = await db.retailer_dispatches.find({"items.product_id": product_id}).to_list(1000)
    for dispatch in dispatches:
        updated_items = []
        for item in dispatch.get("items", []):
            if item.get("product_id") == product_id:
                item["product_id"] = replacement_product_id
                item["product_name"] = replacement_name
            updated_items.append(item)
        await db.retailer_dispatches.update_one({"id": dispatch["id"]}, {"$set": {"items": updated_items}})
        remapped_counts["dispatches"] += 1
    
    # 5. Update retailer invoices
    invoices = await db.retailer_invoices.find({"items.product_id": product_id}).to_list(1000)
    for invoice in invoices:
        updated_items = []
        for item in invoice.get("items", []):
            if item.get("product_id") == product_id:
                item["product_id"] = replacement_product_id
                item["product_name"] = replacement_name
            updated_items.append(item)
        await db.retailer_invoices.update_one({"id": invoice["id"]}, {"$set": {"items": updated_items}})
        remapped_counts["invoices"] += 1
    
    # 6. Update wastage records
    wastage_result = await db.wastage.update_many(
        {"$or": [
            {"product_id": product_id},
            {"product_name": {"$regex": f"^{original_name}$", "$options": "i"}}
        ]},
        {"$set": {"product_id": replacement_product_id, "product_name": replacement_name}}
    )
    remapped_counts["wastage"] = wastage_result.modified_count
    
    # 7. Update closing inventory
    closing_result = await db.retailer_closing_inventory.update_many(
        {"$or": [
            {"product_id": product_id},
            {"product_name": {"$regex": f"^{original_name}$", "$options": "i"}}
        ]},
        {"$set": {"product_id": replacement_product_id, "product_name": replacement_name}}
    )
    remapped_counts["closing_inventory"] = closing_result.modified_count
    
    # Finally, delete the original product
    await db.products.delete_one({"id": product_id})
    
    total_remapped = sum(remapped_counts.values())
    
    return {
        "message": f"Product '{original_name}' deleted successfully. {total_remapped} records remapped to '{replacement_name}'.",
        "deleted_product": original_name,
        "replacement_product": replacement_name,
        "remapped_counts": remapped_counts,
        "total_remapped": total_remapped
    }


# ============================================================================
# PRODUCT IMAGE ROUTES
# ============================================================================
@router.post("/products/upload-image")
async def upload_product_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a product image, compress/resize to 800x800, convert to WebP"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, and WebP images are allowed")
    
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image size must be less than 10MB")
    
    try:
        compressed_image = compress_and_convert_image(contents, max_size=800)
        filename = f"{uuid.uuid4().hex}.webp"
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, 'wb') as f:
            f.write(compressed_image)
        
        image_url = f"/uploads/products/{filename}"
        logger.info(f"Product image uploaded: {filename} (original: {len(contents)} bytes, compressed: {len(compressed_image)} bytes)")
        
        return {"image_url": image_url, "message": "Image uploaded and optimized successfully"}
    except Exception as e:
        logger.error(f"Failed to upload product image: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")


@router.delete("/products/delete-image")
async def delete_product_image(
    image_url: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a product image from filesystem"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        if image_url.startswith('data:'):
            return {"message": "Base64 image cleared from database"}
        
        if '/uploads/products/' in image_url:
            filename = image_url.split('/uploads/products/')[-1]
            file_path = os.path.join(UPLOAD_DIR, filename)
            
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Deleted product image: {filename}")
                return {"message": "Image deleted successfully"}
            else:
                return {"message": "Image file not found, but continuing"}
        else:
            return {"message": "Image URL not recognized, but continuing"}
    except Exception as e:
        logger.error(f"Failed to delete product image: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete image")


@router.post("/products/migrate-images")
async def migrate_product_images(current_user: dict = Depends(get_current_user)):
    """Migrate existing base64 images to filesystem with compression"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run migrations")
    
    try:
        import base64
        
        products = await db.products.find(
            {"image_url": {"$regex": "^data:"}},
            {"_id": 0, "id": 1, "name": 1, "image_url": 1}
        ).to_list(1000)
        
        migrated = 0
        failed = 0
        skipped = 0
        
        for product in products:
            try:
                image_url = product.get('image_url', '')
                if not image_url.startswith('data:'):
                    skipped += 1
                    continue
                
                if ';base64,' in image_url:
                    header, base64_data = image_url.split(';base64,', 1)
                    image_bytes = base64.b64decode(base64_data)
                    
                    compressed_image = compress_and_convert_image(image_bytes, max_size=800)
                    filename = f"{uuid.uuid4().hex}.webp"
                    file_path = os.path.join(UPLOAD_DIR, filename)
                    
                    with open(file_path, 'wb') as f:
                        f.write(compressed_image)
                    
                    new_url = f"/uploads/products/{filename}"
                    await db.products.update_one(
                        {"id": product['id']},
                        {"$set": {"image_url": new_url}}
                    )
                    
                    await db.retailer_catalogue.update_many(
                        {"product_id": product['id']},
                        {"$set": {"image_url": new_url}}
                    )
                    
                    logger.info(f"Migrated image for product: {product.get('name', product['id'])}")
                    migrated += 1
                else:
                    skipped += 1
            except Exception as e:
                logger.error(f"Failed to migrate image for product {product.get('id')}: {e}")
                failed += 1
        
        return {
            "message": "Migration completed",
            "migrated": migrated,
            "failed": failed,
            "skipped": skipped,
            "total_processed": len(products)
        }
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")


# ============================================================================
# UNITS MANAGEMENT ROUTES
# ============================================================================
@router.get("/units")
async def get_units(current_user: dict = Depends(get_current_user)):
    """Get all units in the system"""
    units = await db.units.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return units


@router.post("/units")
async def create_unit(input: dict, current_user: dict = Depends(get_current_user)):
    """Create a new unit"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    name = input.get("name", "").strip()
    symbol = input.get("symbol", "").strip()
    description = input.get("description", "").strip()
    
    if not name:
        raise HTTPException(status_code=400, detail="Unit name is required")
    
    existing = await db.units.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Unit '{name}' already exists")
    
    unit_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "symbol": symbol or name,
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.units.insert_one(unit_doc)
    unit_doc.pop("_id", None)
    return unit_doc


@router.put("/units/{unit_id}")
async def update_unit(unit_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Update an existing unit"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    unit = await db.units.find_one({"id": unit_id})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    update_data = {}
    if "name" in input:
        update_data["name"] = input["name"].strip()
    if "symbol" in input:
        update_data["symbol"] = input["symbol"].strip()
    if "description" in input:
        update_data["description"] = input["description"].strip()
    
    if update_data:
        await db.units.update_one({"id": unit_id}, {"$set": update_data})
    
    updated = await db.units.find_one({"id": unit_id}, {"_id": 0})
    return updated


@router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a unit (only if not in use)"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete units")
    
    unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    products_using = await db.products.count_documents({"unit": unit["name"]})
    if products_using > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete unit '{unit['name']}'. It is used by {products_using} product(s)."
        )
    
    await db.units.delete_one({"id": unit_id})
    return {"message": f"Unit '{unit['name']}' deleted successfully"}


@router.post("/units/seed-defaults")
async def seed_default_units(current_user: dict = Depends(get_current_user)):
    """Seed default units if none exist"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can seed units")
    
    existing_count = await db.units.count_documents({})
    if existing_count > 0:
        return {"message": f"Units already exist ({existing_count} units). Skipping seed."}
    
    default_units = [
        {"name": "Kg", "symbol": "Kg", "description": "Kilogram - standard weight unit"},
        {"name": "Gram", "symbol": "g", "description": "Gram - small weight unit"},
        {"name": "Piece", "symbol": "Pc", "description": "Individual piece/item"},
        {"name": "Pieces", "symbol": "Pcs", "description": "Multiple pieces/items"},
        {"name": "Bunch", "symbol": "Bunch", "description": "Bundle of items tied together"},
        {"name": "Packet", "symbol": "Pkt", "description": "Packaged unit"},
        {"name": "Box", "symbol": "Box", "description": "Box container"},
        {"name": "Crate", "symbol": "Crate", "description": "Crate container"},
        {"name": "Dozen", "symbol": "Dz", "description": "12 pieces"},
        {"name": "Litre", "symbol": "L", "description": "Liquid volume unit"},
    ]
    
    for unit in default_units:
        unit["id"] = str(uuid.uuid4())
        unit["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.units.insert_one(unit)
    
    return {"message": f"Seeded {len(default_units)} default units"}


# ============================================================================
# PRODUCT CATEGORIES ROUTES
# ============================================================================
@router.get("/product-categories")
async def get_product_categories(current_user: dict = Depends(get_current_user)):
    """Get all product categories"""
    categories = await db.product_categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return categories


@router.post("/product-categories")
async def create_product_category(input: dict, current_user: dict = Depends(get_current_user)):
    """Create a new product category"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    name = input.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name is required")
    
    existing = await db.product_categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{name}' already exists")
    
    category_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.product_categories.insert_one(category_doc)
    category_doc.pop("_id", None)
    return category_doc


@router.put("/product-categories/{category_id}")
async def update_product_category(category_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Update a product category"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    category = await db.product_categories.find_one({"id": category_id})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    old_name = category["name"]
    new_name = input.get("name", "").strip()
    
    if not new_name:
        raise HTTPException(status_code=400, detail="Category name is required")
    
    existing = await db.product_categories.find_one({
        "name": {"$regex": f"^{new_name}$", "$options": "i"},
        "id": {"$ne": category_id}
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{new_name}' already exists")
    
    await db.product_categories.update_one({"id": category_id}, {"$set": {"name": new_name}})
    
    if old_name != new_name:
        await db.products.update_many({"category": old_name}, {"$set": {"category": new_name}})
    
    updated = await db.product_categories.find_one({"id": category_id}, {"_id": 0})
    return updated


@router.delete("/product-categories/{category_id}")
async def delete_product_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a product category"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete categories")
    
    category = await db.product_categories.find_one({"id": category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    products_using = await db.products.count_documents({"category": category["name"]})
    if products_using > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete category '{category['name']}'. It is used by {products_using} product(s)."
        )
    
    await db.product_categories.delete_one({"id": category_id})
    return {"message": f"Category '{category['name']}' deleted successfully"}


# ============================================================================
# PRODUCT TYPES ROUTES
# ============================================================================
@router.get("/product-types")
async def get_product_types(current_user: dict = Depends(get_current_user)):
    """Get all product types"""
    types = await db.product_types.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return types


@router.post("/product-types")
async def create_product_type(input: dict, current_user: dict = Depends(get_current_user)):
    """Create a new product type"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    name = input.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Type name is required")
    
    existing = await db.product_types.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail=f"Type '{name}' already exists")
    
    type_doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.product_types.insert_one(type_doc)
    type_doc.pop("_id", None)
    return type_doc


@router.put("/product-types/{type_id}")
async def update_product_type(type_id: str, input: dict, current_user: dict = Depends(get_current_user)):
    """Update a product type"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    ptype = await db.product_types.find_one({"id": type_id})
    if not ptype:
        raise HTTPException(status_code=404, detail="Type not found")
    
    old_name = ptype["name"]
    new_name = input.get("name", "").strip()
    
    if not new_name:
        raise HTTPException(status_code=400, detail="Type name is required")
    
    existing = await db.product_types.find_one({
        "name": {"$regex": f"^{new_name}$", "$options": "i"},
        "id": {"$ne": type_id}
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Type '{new_name}' already exists")
    
    await db.product_types.update_one({"id": type_id}, {"$set": {"name": new_name}})
    
    if old_name != new_name:
        await db.products.update_many({"product_type": old_name}, {"$set": {"product_type": new_name}})
    
    updated = await db.product_types.find_one({"id": type_id}, {"_id": 0})
    return updated


@router.delete("/product-types/{type_id}")
async def delete_product_type(type_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a product type"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete types")
    
    ptype = await db.product_types.find_one({"id": type_id}, {"_id": 0})
    if not ptype:
        raise HTTPException(status_code=404, detail="Type not found")
    
    products_using = await db.products.count_documents({"product_type": ptype["name"]})
    if products_using > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete type '{ptype['name']}'. It is used by {products_using} product(s)."
        )
    
    await db.product_types.delete_one({"id": type_id})
    return {"message": f"Type '{ptype['name']}' deleted successfully"}


# ============================================================================
# QC PACKAGING ROUTES
# ============================================================================
@router.get("/qc-packaging")
async def get_qc_packaging(current_user: dict = Depends(get_current_user)):
    packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    return packagings


@router.post("/qc-packaging")
async def create_qc_packaging(name: str, weight_gm: float = 0, verticals: str = "both", current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if weight_gm == 0:
        weight_gm = extract_weight_from_packaging_name(name)
    
    vertical_list = []
    if verticals.lower() in ['both', 'all']:
        vertical_list = ['qc', 'retail']
    elif verticals.lower() == 'qc':
        vertical_list = ['qc']
    elif verticals.lower() == 'retail':
        vertical_list = ['retail']
    else:
        vertical_list = ['qc', 'retail']
    
    packaging = {
        "id": str(uuid.uuid4()),
        "name": name,
        "weight_gm": weight_gm,
        "verticals": vertical_list
    }
    await db.qc_packaging.insert_one(packaging)
    return {"id": packaging["id"], "message": "Packaging created"}


@router.put("/qc-packaging/{packaging_id}")
async def update_qc_packaging(packaging_id: str, name: str = None, weight_gm: float = None, verticals: str = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if weight_gm is not None:
        update_data["weight_gm"] = weight_gm
    if verticals is not None:
        if verticals.lower() in ['both', 'all']:
            update_data["verticals"] = ['qc', 'retail']
        elif verticals.lower() == 'qc':
            update_data["verticals"] = ['qc']
        elif verticals.lower() == 'retail':
            update_data["verticals"] = ['retail']
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.qc_packaging.update_one({"id": packaging_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Packaging not found")
    return {"message": "Packaging updated"}


@router.delete("/qc-packaging/{packaging_id}")
async def delete_qc_packaging(packaging_id: str, replacement_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Delete a packaging variant with optional migration to replacement"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    packaging = await db.qc_packaging.find_one({"id": packaging_id}, {"_id": 0})
    if not packaging:
        raise HTTPException(status_code=404, detail="Packaging not found")
    
    packaging_name = packaging.get("name", "")
    
    qc_indent_count = await db.qc_indents.count_documents({"items.packaging_name": packaging_name})
    qc_dispatch_count = await db.qc_dispatches.count_documents({"items.packaging_name": packaging_name})
    retailer_indent_count = await db.retailer_indents.count_documents({"items.variant_name": packaging_name})
    
    total_usage = qc_indent_count + qc_dispatch_count + retailer_indent_count
    
    if total_usage > 0 and not replacement_id:
        return {
            "requires_migration": True,
            "packaging_name": packaging_name,
            "usage": {
                "qc_indents": qc_indent_count,
                "qc_dispatches": qc_dispatch_count,
                "retailer_indents": retailer_indent_count,
                "total": total_usage
            },
            "message": f"Packaging '{packaging_name}' is used in {total_usage} records. Please select a replacement packaging."
        }
    
    if total_usage > 0 and replacement_id:
        replacement = await db.qc_packaging.find_one({"id": replacement_id}, {"_id": 0})
        if not replacement:
            raise HTTPException(status_code=404, detail="Replacement packaging not found")
        
        replacement_name = replacement.get("name", "")
        
        if qc_indent_count > 0:
            await db.qc_indents.update_many(
                {"items.packaging_name": packaging_name},
                {"$set": {"items.$[elem].packaging_name": replacement_name}},
                array_filters=[{"elem.packaging_name": packaging_name}]
            )
        
        if qc_dispatch_count > 0:
            await db.qc_dispatches.update_many(
                {"items.packaging_name": packaging_name},
                {"$set": {"items.$[elem].packaging_name": replacement_name}},
                array_filters=[{"elem.packaging_name": packaging_name}]
            )
            await db.qc_dispatches.update_many(
                {"packaging_items.packaging_name": packaging_name},
                {"$set": {"packaging_items.$[elem].packaging_name": replacement_name}},
                array_filters=[{"elem.packaging_name": packaging_name}]
            )
        
        if retailer_indent_count > 0:
            await db.retailer_indents.update_many(
                {"items.variant_name": packaging_name},
                {"$set": {"items.$[elem].variant_name": replacement_name}},
                array_filters=[{"elem.variant_name": packaging_name}]
            )
    
    result = await db.qc_packaging.delete_one({"id": packaging_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Packaging not found")
    
    if total_usage > 0:
        return {
            "message": f"Packaging '{packaging_name}' deleted. Migrated {total_usage} references to '{replacement_name}'.",
            "migrated": total_usage
        }
    
    return {"message": f"Packaging '{packaging_name}' deleted successfully"}


@router.post("/qc-packaging/sync-weights")
async def sync_packaging_weights(current_user: dict = Depends(get_current_user)):
    """Sync all packaging weights - extract from names and store in database"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can sync packaging weights")
    
    packagings = await db.qc_packaging.find({}).to_list(200)
    updated_count = 0
    
    for p in packagings:
        name = p.get('name', '')
        current_weight = p.get('weight_gm') or 0
        
        weight = extract_weight_from_packaging_name(name)
        if weight > 0 and weight != current_weight:
            await db.qc_packaging.update_one(
                {"id": p['id']},
                {"$set": {"weight_gm": weight}}
            )
            updated_count += 1
    
    common_variants = [
        {"name": "500 gm", "weight_gm": 500},
        {"name": "250 gm", "weight_gm": 250},
        {"name": "200 gm Packet", "weight_gm": 200},
        {"name": "100 gm", "weight_gm": 100},
        {"name": "400-450 gm", "weight_gm": 425},
    ]
    
    added_count = 0
    for variant in common_variants:
        existing = await db.qc_packaging.find_one({
            "name": {"$regex": f"^{re.escape(variant['name'])}$", "$options": "i"}
        })
        if not existing:
            await db.qc_packaging.insert_one({
                "id": str(uuid.uuid4()),
                "name": variant['name'],
                "weight_gm": variant['weight_gm']
            })
            added_count += 1
    
    all_packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
    
    return {
        "message": f"Synced {updated_count} existing, added {added_count} new packaging variants",
        "packagings": all_packagings
    }
