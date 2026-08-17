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
    if current_user["role"] not in ["admin", "staff", "field_team"]:
        raise HTTPException(status_code=403, detail="Only admin, staff, or field team can generate auto indents")
    
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
        
        # Check if AUTO-GENERATED indent already exists for this retailer and date
        # Manual indents (is_auto_generated: false) should NOT block auto-generation
        existing_indent = await db.retailer_indents.find_one({
            "retailer_id": retailer_id,
            "indent_date": target_date.isoformat(),
            "is_auto_generated": True  # Only check for auto-generated indents
        })
        
        if existing_indent:
            return {
                "success": False,
                "message": f"An auto-generated indent already exists for {retailer_name} on {target_date.isoformat()}. Delete it first to regenerate."
            }
        
        # Get the target weekday (0=Monday, 6=Sunday)
        target_weekday = target_date.weekday()
        # Next day weekday (wraps around: Sunday -> Monday)
        next_day_weekday = (target_weekday + 1) % 7
        
        weekday_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        
        # Find closing records for this retailer
        closing_records = await db.retailer_closing.find({
            "retailer_id": retailer_id
        }).sort("closing_date", -1).to_list(200)  # Get more records to find both weekdays
        
        # Helper function to filter records by weekday
        def filter_by_weekday(records, weekday, before_date, max_count=7):
            filtered = []
            for record in records:
                try:
                    closing_date_raw = record.get("closing_date")
                    # Handle both string and datetime objects
                    if isinstance(closing_date_raw, datetime):
                        record_date = closing_date_raw.date()
                    elif isinstance(closing_date_raw, str):
                        record_date = datetime.strptime(closing_date_raw[:10], "%Y-%m-%d").date()
                    else:
                        continue
                        
                    if record_date.weekday() == weekday and record_date < before_date:
                        filtered.append(record)
                        if len(filtered) >= max_count:
                            break
                except:
                    continue
            return filtered
        
        # Get last 7 occurrences of target weekday (e.g., Sundays)
        target_day_records = filter_by_weekday(closing_records, target_weekday, target_date, 7)
        
        # Get last 7 occurrences of next day weekday (e.g., Mondays)
        next_day_records = filter_by_weekday(closing_records, next_day_weekday, target_date, 7)
        
        # Check if we have data for at least one of the weekdays
        if len(target_day_records) == 0 and len(next_day_records) == 0:
            return {
                "success": False,
                "message": f"No historical data found for {retailer_name}. The retailer needs to have at least one closing record for {weekday_names[target_weekday]} or {weekday_names[next_day_weekday]}."
            }
        
        # Helper function to calculate average sales per product from records
        def calculate_product_averages(records):
            product_totals = {}
            for record in records:
                for item in record.get("items", []):
                    product_id = item.get("product_id")
                    product_name = item.get("product_name", "")
                    items_sold = item.get("items_sold", 0) or 0
                    
                    if product_id and items_sold > 0:
                        composite_key = f"{product_id}|{product_name.strip()}"
                        if composite_key not in product_totals:
                            product_totals[composite_key] = {
                                "product_id": product_id,
                                "product_name": product_name,
                                "total_sold": 0,
                                "count": 0
                            }
                        product_totals[composite_key]["total_sold"] += items_sold
                        product_totals[composite_key]["count"] += 1
            
            # Calculate averages
            averages = {}
            for key, data in product_totals.items():
                averages[key] = {
                    "product_id": data["product_id"],
                    "product_name": data["product_name"],
                    "avg_sold": data["total_sold"] / data["count"]
                }
            return averages
        
        # Calculate averages for target day and next day
        target_day_averages = calculate_product_averages(target_day_records)
        next_day_averages = calculate_product_averages(next_day_records)
        
        # Combine both days' averages
        # For each product: total = avg(target_day) + avg(next_day)
        combined_products = {}
        
        # Add target day averages
        for key, data in target_day_averages.items():
            combined_products[key] = {
                "product_id": data["product_id"],
                "product_name": data["product_name"],
                "target_day_avg": data["avg_sold"],
                "next_day_avg": 0
            }
        
        # Add next day averages
        for key, data in next_day_averages.items():
            if key in combined_products:
                combined_products[key]["next_day_avg"] = data["avg_sold"]
            else:
                combined_products[key] = {
                    "product_id": data["product_id"],
                    "product_name": data["product_name"],
                    "target_day_avg": 0,
                    "next_day_avg": data["avg_sold"]
                }
        
        if not combined_products:
            return {
                "success": False,
                "message": f"No sales data found for {retailer_name}"
            }
        
        # Create indent items: (target_day_avg + next_day_avg) * 1.1 buffer
        indent_items = []
        for composite_key, data in combined_products.items():
            total_avg = data["target_day_avg"] + data["next_day_avg"]
            recommended_qty = round(total_avg * 1.1)  # Add 10% buffer
            
            if recommended_qty > 0:
                indent_items.append({
                    "product_id": data["product_id"],
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
        
        # Build remarks message
        target_day_count = len(target_day_records)
        next_day_count = len(next_day_records)
        remarks_parts = []
        if target_day_count > 0:
            remarks_parts.append(f"{target_day_count} {weekday_names[target_weekday]}s")
        if next_day_count > 0:
            remarks_parts.append(f"{next_day_count} {weekday_names[next_day_weekday]}s")
        remarks_str = " + ".join(remarks_parts)
        
        # Create the indent
        new_indent = {
            "id": str(uuid.uuid4()),
            "retailer_id": retailer_id,
            "retailer_name": retailer_name,
            "indent_date": target_date.isoformat(),
            "items": indent_items,
            "total_qty": sum(item["quantity"] for item in indent_items),
            "status": "pending",
            "remarks": f"Auto-generated based on avg sales of {remarks_str} (covers {weekday_names[target_weekday]} + {weekday_names[next_day_weekday]})",
            "is_auto_generated": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.retailer_indents.insert_one(new_indent)
        
        return {
            "success": True,
            "message": f"Auto indent created for {retailer_name} with {len(indent_items)} products (based on {weekday_names[target_weekday]} + {weekday_names[next_day_weekday]} sales)",
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


# ============================================================================
# Z1: FIX RETAILER ID COLLISIONS - One-time data migration
# ============================================================================

@router.post("/admin/fix-retailer-id-collisions")
async def fix_retailer_id_collisions(
    request: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Z1: One-time migration to fix retailer_id collisions where multiple retailer_names
    share the same retailer_id. This is idempotent and safe to run multiple times.
    
    Args:
        request.dry_run: If True (default), returns planned remaps without writing.
                        Set to False to actually execute the migration.
    
    Returns:
        Detailed report of collisions found and remaps planned/executed.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can run this migration")
    
    dry_run = request.get("dry_run", True)
    
    # Collections that store retailer_id
    COLLECTIONS_WITH_RETAILER_ID = [
        "retailer_dispatches",
        "retailer_invoices", 
        "retailer_rejections",
        "retailer_indents",
        "retailer_payments",
        "retailer_credit_notes",
        "retailer_closing_inventory",
        "retailer_daily_requirements",
        "retailer_daily_sales",
        "retailer_grn",
        "retailer_inventory"
    ]
    
    from collections import defaultdict
    
    try:
        # Step 1: Scan retailer_dispatches to find collisions (has most data)
        all_docs = []
        for coll_name in ["retailer_dispatches", "retailer_invoices"]:
            coll = db[coll_name]
            docs = await coll.find({}, {"_id": 0, "retailer_id": 1, "retailer_name": 1}).to_list(50000)
            all_docs.extend(docs)
        
        # Group by retailer_id -> set of retailer_names
        id_to_names = defaultdict(lambda: defaultdict(int))
        for doc in all_docs:
            rid = doc.get("retailer_id", "")
            rname = doc.get("retailer_name", "")
            if rid and rname:
                id_to_names[rid][rname] += 1
        
        # Find collisions (retailer_id mapping to more than one name)
        collisions = {}
        for rid, names_dict in id_to_names.items():
            if len(names_dict) > 1:
                collisions[rid] = names_dict
        
        if not collisions:
            return {
                "success": True,
                "dry_run": dry_run,
                "message": "No collisions found. All retailer_ids map to unique names.",
                "collisions_found": 0,
                "remaps": []
            }
        
        # Step 2: Plan remaps - keep the name with most records on existing id
        remaps = []
        for old_id, names_dict in collisions.items():
            sorted_names = sorted(names_dict.items(), key=lambda x: -x[1])  # Descending by count
            keep_name, keep_count = sorted_names[0]
            
            for remap_name, remap_count in sorted_names[1:]:
                new_id = str(uuid.uuid4())
                remaps.append({
                    "old_retailer_id": old_id,
                    "retailer_name": remap_name,
                    "new_retailer_id": new_id,
                    "record_count": remap_count,
                    "keeping_on_old_id": keep_name
                })
        
        # Step 3: Count affected rows per collection for each remap
        remap_details = []
        for remap in remaps:
            old_id = remap["old_retailer_id"]
            rname = remap["retailer_name"]
            new_id = remap["new_retailer_id"]
            
            collection_counts = {}
            for coll_name in COLLECTIONS_WITH_RETAILER_ID:
                coll = db[coll_name]
                count = await coll.count_documents({
                    "retailer_id": old_id,
                    "retailer_name": rname
                })
                if count > 0:
                    collection_counts[coll_name] = count
            
            remap_details.append({
                **remap,
                "collections_affected": collection_counts,
                "total_rows": sum(collection_counts.values())
            })
        
        # Step 4: If not dry_run, execute the migration
        if not dry_run:
            migration_results = []
            
            for remap in remap_details:
                old_id = remap["old_retailer_id"]
                rname = remap["retailer_name"]
                new_id = remap["new_retailer_id"]
                
                result_entry = {
                    "retailer_name": rname,
                    "old_id": old_id,
                    "new_id": new_id,
                    "updates": {}
                }
                
                # Update all collections
                for coll_name in COLLECTIONS_WITH_RETAILER_ID:
                    coll = db[coll_name]
                    update_result = await coll.update_many(
                        {"retailer_id": old_id, "retailer_name": rname},
                        {"$set": {"retailer_id": new_id}}
                    )
                    if update_result.modified_count > 0:
                        result_entry["updates"][coll_name] = update_result.modified_count
                
                # Check if user master already has this retailer
                existing_user = await db.users.find_one({
                    "role": "retailer",
                    "$or": [
                        {"company_name": rname},
                        {"name": rname}
                    ]
                }, {"_id": 0})
                
                if existing_user:
                    # Update the existing user's id to the new one
                    await db.users.update_one(
                        {"id": existing_user["id"]},
                        {"$set": {"id": new_id}}
                    )
                    result_entry["user_master"] = f"Updated existing user {existing_user['id']} to {new_id}"
                else:
                    # Create a new user record
                    new_user = {
                        "id": new_id,
                        "email": f"{rname.lower().replace(' ', '_')}@placeholder.com",
                        "name": rname,
                        "company_name": rname,
                        "role": "retailer",
                        "status": "active",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "password": "",  # No password - needs to be set
                        "commission_percentage": 0.0
                    }
                    await db.users.insert_one(new_user)
                    result_entry["user_master"] = f"Created new user with id {new_id}"
                
                migration_results.append(result_entry)
            
            return {
                "success": True,
                "dry_run": False,
                "message": f"Migration completed. Fixed {len(remaps)} retailer_id collisions.",
                "collisions_found": len(collisions),
                "remaps_executed": migration_results
            }
        
        # Dry run - just return the plan
        return {
            "success": True,
            "dry_run": True,
            "message": f"Found {len(collisions)} collisions affecting {len(remaps)} retailer names. Set dry_run=false to execute.",
            "collisions_found": len(collisions),
            "remaps_planned": remap_details,
            "collision_details": {
                rid[:8]: {name: count for name, count in names.items()}
                for rid, names in collisions.items()
            }
        }
    
    except Exception as e:
        import traceback
        print(f"Error in fix-retailer-id-collisions: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
