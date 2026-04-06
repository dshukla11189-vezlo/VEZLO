"""
Admin Utility Routes - Auto-indent generation, Hindi names, Referral codes, etc.
"""
from fastapi import APIRouter, HTTPException, Depends
from dependencies import db, get_current_user, HINDI_PRODUCT_NAMES
from datetime import datetime, timezone, timedelta
import uuid
import random
import string

router = APIRouter(prefix="/api", tags=["admin"])


@router.post("/admin/generate-auto-indent")
async def generate_single_auto_indent(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """Generate auto-indent for a single retailer for a specific date"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can generate auto indents")
    
    retailer_id = request.get("retailer_id")
    target_date_str = request.get("target_date")
    
    if not retailer_id:
        raise HTTPException(status_code=400, detail="retailer_id is required")
    
    try:
        # Parse target date
        if target_date_str:
            target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        else:
            target_date = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        
        # Get retailer info
        retailer = await db.users.find_one({"id": retailer_id, "role": "retailer"}, {"_id": 0})
        if not retailer:
            raise HTTPException(status_code=404, detail="Retailer not found")
        
        retailer_name = retailer.get("company_name") or retailer.get("name", "Unknown")
        
        # Check if indent already exists for this retailer and date
        existing_indent = await db.retailer_indents.find_one({
            "retailer_id": retailer_id,
            "indent_date": target_date.isoformat()
        })
        
        if existing_indent:
            return {
                "success": False,
                "message": f"An indent already exists for {retailer_name} on {target_date.isoformat()}. Delete it first to regenerate."
            }
        
        # Get the target weekday (0=Monday, 6=Sunday)
        target_weekday = target_date.weekday()
        
        # Find the last 7 occurrences of this weekday in retailer closing data
        closing_records = await db.retailer_closing.find({
            "retailer_id": retailer_id
        }).sort("closing_date", -1).to_list(100)
        
        # Filter to only include same weekday
        same_weekday_records = []
        for record in closing_records:
            try:
                record_date = datetime.strptime(record["closing_date"], "%Y-%m-%d").date()
                if record_date.weekday() == target_weekday and record_date < target_date:
                    same_weekday_records.append(record)
                    if len(same_weekday_records) >= 7:
                        break
            except:
                continue
        
        # Use whatever data is available (even 1 record is fine)
        weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        if len(same_weekday_records) == 0:
            return {
                "success": False,
                "message": f"No historical data found for {retailer_name} on this weekday. The retailer needs to have at least one closing record for a {weekday_names[target_weekday]}."
            }
        
        # Calculate average items sold per product
        product_totals = {}
        for record in same_weekday_records:
            for item in record.get("items", []):
                product_id = item.get("product_id")
                product_name = item.get("product_name", "")
                items_sold = item.get("items_sold", 0) or 0
                
                if product_id and items_sold > 0:
                    if product_id not in product_totals:
                        product_totals[product_id] = {
                            "product_name": product_name,
                            "total_sold": 0,
                            "count": 0
                        }
                    product_totals[product_id]["total_sold"] += items_sold
                    product_totals[product_id]["count"] += 1
        
        if not product_totals:
            return {
                "success": False,
                "message": f"No sales data found for {retailer_name} on this weekday"
            }
        
        # Create indent items with average + 10% buffer
        indent_items = []
        for product_id, data in product_totals.items():
            avg_sold = data["total_sold"] / data["count"]
            recommended_qty = round(avg_sold * 1.1)  # Add 10% buffer
            
            if recommended_qty > 0:
                indent_items.append({
                    "product_id": product_id,
                    "product_name": data["product_name"],
                    "variant_id": "",
                    "variant_name": "",
                    "quantity": recommended_qty,
                    "status": "pending"
                })
        
        if not indent_items:
            return {
                "success": False,
                "message": f"No products with positive sales found for {retailer_name}"
            }
        
        # Sort by product name
        indent_items.sort(key=lambda x: x["product_name"])
        
        # Create the indent
        new_indent = {
            "id": str(uuid.uuid4()),
            "retailer_id": retailer_id,
            "retailer_name": retailer_name,
            "indent_date": target_date.isoformat(),
            "items": indent_items,
            "total_qty": sum(item["quantity"] for item in indent_items),
            "status": "pending",
            "remarks": f"Auto-generated based on {len(same_weekday_records)} weeks of {weekday_names[target_weekday]} sales",
            "is_auto_generated": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.retailer_indents.insert_one(new_indent)
        
        return {
            "success": True,
            "message": f"Auto indent created for {retailer_name} with {len(indent_items)} products",
            "retailer_name": retailer_name,
            "indent_id": new_indent["id"],
            "products_count": len(indent_items),
            "total_qty": new_indent["total_qty"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error generating auto indent: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/populate-hindi-names")
async def populate_hindi_product_names(current_user: dict = Depends(get_current_user)):
    """Populate Hindi names for all products in the database"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can populate Hindi names")
    
    try:
        products = await db.products.find({}).to_list(1000)
        updated_count = 0
        missing = []
        
        for product in products:
            name = product.get("name", "")
            product_id = product.get("id")
            
            if name in HINDI_PRODUCT_NAMES:
                hindi_name = HINDI_PRODUCT_NAMES[name]
                result = await db.products.update_one(
                    {"id": product_id},
                    {"$set": {"name_hi": hindi_name}}
                )
                if result.modified_count > 0:
                    updated_count += 1
            else:
                missing.append(name)
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_products": len(products),
            "missing_translations": missing[:10] if missing else [],
            "message": f"Updated {updated_count} products with Hindi names"
        }
    except Exception as e:
        print(f"Error populating Hindi names: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/populate-referral-codes")
async def populate_retailer_referral_codes(current_user: dict = Depends(get_current_user)):
    """Populate referral codes for all retailers that don't have one"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can populate referral codes")
    
    try:
        # Find all retailers without referral codes
        retailers = await db.users.find({
            "role": "retailer",
            "$or": [
                {"referral_code": {"$exists": False}},
                {"referral_code": None},
                {"referral_code": ""}
            ]
        }).to_list(1000)
        
        updated_count = 0
        
        for retailer in retailers:
            # Generate unique 5-digit referral code
            referral_code = ''.join(random.choices(string.digits, k=5))
            
            # Make sure it's unique
            while await db.users.find_one({"referral_code": referral_code}):
                referral_code = ''.join(random.choices(string.digits, k=5))
            
            result = await db.users.update_one(
                {"id": retailer["id"]},
                {"$set": {"referral_code": referral_code}}
            )
            
            if result.modified_count > 0:
                updated_count += 1
        
        # Count total retailers
        total_retailers = await db.users.count_documents({"role": "retailer"})
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_retailers": total_retailers,
            "message": f"Generated referral codes for {updated_count} retailers"
        }
    except Exception as e:
        print(f"Error populating referral codes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/reset-all-referral-codes")
async def reset_all_retailer_referral_codes(current_user: dict = Depends(get_current_user)):
    """Reset ALL retailer referral codes to 5-digit format"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can reset referral codes")
    
    try:
        # Find ALL retailers
        retailers = await db.users.find({"role": "retailer"}).to_list(1000)
        
        updated_count = 0
        used_codes = set()
        
        for retailer in retailers:
            # Generate unique 5-digit referral code
            referral_code = ''.join(random.choices(string.digits, k=5))
            
            # Make sure it's unique (check both DB and already-assigned in this batch)
            while referral_code in used_codes or await db.users.find_one({"referral_code": referral_code, "id": {"$ne": retailer["id"]}}):
                referral_code = ''.join(random.choices(string.digits, k=5))
            
            used_codes.add(referral_code)
            
            result = await db.users.update_one(
                {"id": retailer["id"]},
                {"$set": {"referral_code": referral_code}}
            )
            
            if result.modified_count > 0:
                updated_count += 1
        
        return {
            "success": True,
            "updated_count": updated_count,
            "total_retailers": len(retailers),
            "message": f"Reset referral codes for {updated_count} retailers to 5-digit format"
        }
    except Exception as e:
        print(f"Error resetting referral codes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
