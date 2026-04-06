"""
Products and QC Packaging Routes
"""
from fastapi import APIRouter, HTTPException, Depends, status
from dependencies import db, get_current_user, HINDI_PRODUCT_NAMES
from models import Product, ProductCreate, ProductUpdate
from typing import List
import uuid
import re

router = APIRouter(prefix="/api", tags=["products"])


@router.get("/products", response_model=List[Product])
async def get_products(current_user: dict = Depends(get_current_user)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    return [Product(**p) for p in products]


@router.post("/products", response_model=Product, status_code=status.HTTP_201_CREATED)
async def create_product(input: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
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
    
    return Product(**result)


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return {"message": "Product deleted successfully"}


# ============================================================================
# QC PACKAGING ROUTES
# ============================================================================
def extract_weight_from_packaging_name(name: str) -> float:
    """Extract weight in grams from packaging name like '500 gm', '240-260 gm', '200 gm Packet'"""
    if not name:
        return 0
    
    name_lower = name.lower().strip()
    
    # Pattern 1: Simple number + gm/g (e.g., "500 gm", "250 gm")
    match = re.search(r'^(\d+)\s*(gm|g)\b', name_lower)
    if match:
        return float(match.group(1))
    
    # Pattern 2: Range like "240-260 gm" or "90-110 gm Packet" - take average
    range_match = re.search(r'(\d+)\s*-\s*(\d+)\s*(gm|g)', name_lower)
    if range_match:
        return (float(range_match.group(1)) + float(range_match.group(2))) / 2
    
    # Pattern 3: Just a number (assume gm if no unit, e.g., "500")
    just_number = re.search(r'^(\d+)$', name_lower)
    if just_number:
        return float(just_number.group(1))
    
    return 0  # Unknown


@router.get("/qc-packaging")
async def get_qc_packaging(current_user: dict = Depends(get_current_user)):
    packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    return packagings


@router.post("/qc-packaging")
async def create_qc_packaging(name: str, weight_gm: float = 0, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Auto-extract weight from name if not provided
    if weight_gm == 0:
        weight_gm = extract_weight_from_packaging_name(name)
    
    packaging = {
        "id": str(uuid.uuid4()),
        "name": name,
        "weight_gm": weight_gm
    }
    await db.qc_packaging.insert_one(packaging)
    return {"id": packaging["id"], "message": "Packaging created"}


@router.put("/qc-packaging/{packaging_id}")
async def update_qc_packaging(packaging_id: str, name: str = None, weight_gm: float = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if weight_gm is not None:
        update_data["weight_gm"] = weight_gm
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.qc_packaging.update_one(
        {"id": packaging_id},
        {"$set": update_data}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Packaging not found")
    return {"message": "Packaging updated"}


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
        
        # Always update weight from name to ensure consistency
        weight = extract_weight_from_packaging_name(name)
        if weight > 0 and weight != current_weight:
            await db.qc_packaging.update_one(
                {"id": p['id']},
                {"$set": {"weight_gm": weight}}
            )
            updated_count += 1
    
    # Also add common variants if missing
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
    
    # Return all packagings with weights
    all_packagings = await db.qc_packaging.find({}, {"_id": 0}).to_list(200)
    
    return {
        "message": f"Synced {updated_count} existing, added {added_count} new packaging variants",
        "packagings": all_packagings
    }
