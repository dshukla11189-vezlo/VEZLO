"""
QC GRN (Goods Receipt Note) Routes
==================================
Extracted from server.py for modular organization.
Handles QC GRN management, Ninjacart CSV/Excel upload and matching.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, List, Any
import uuid
import re
import csv
import io

from dependencies import (
    db,
    get_current_user,
    logger,
)
from models import (
    QCGRN,
    QCGRNCreate,
)
from routes.combo_utils import (
    is_combo_product,
    parse_combo_product,
    get_combo_sku_mappings,
    KNOWN_COMBO_PRODUCTS,
)

router = APIRouter(tags=["qc_grn"])


def _derive_grn_date(items: list, fallback: str) -> str:
    """
    A GRN's business date is the supply/dispatch date of its goods, not the
    upload timestamp. Derive the top-level grn_date from the EARLIEST item
    dispatch_date so list/filter, display, dedup and loss calc all agree on
    the same date. Falls back to the provided value (e.g. save timestamp)
    when items carry no usable dispatch_date.
    """
    item_dates = []
    for it in items or []:
        d = it.get("dispatch_date") if isinstance(it, dict) else None
        if d:
            item_dates.append(str(d)[:10])  # normalize to YYYY-MM-DD
    if item_dates:
        return f"{min(item_dates)}T00:00:00"
    return fallback

# SECTION: QC GRN ROUTES (Lines ~999-1450)
# ============================================================================
@router.get("/qc-grns")
async def get_qc_grns(
    from_date: str = None,
    to_date: str = None,
    limit: int = 100,
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
        # A GRN's meaningful date is the SUPPLY date carried by each item
        # (item.dispatch_date), which is what the UI groups/filters/dedupes on.
        # The top-level grn_date is just the upload timestamp, so filtering on it
        # alone hides GRNs uploaded/re-uploaded on a day other than the supply date.
        # Match on either the item dispatch_date (primary) or grn_date (legacy fallback).
        query["$or"] = [
            {"items": {"$elemMatch": {"dispatch_date": date_filter}}},
            {"grn_date": date_filter},
        ]

    grns = await db.qc_grns.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for g in grns:
        if isinstance(g.get('grn_date'), str):
            g['grn_date'] = datetime.fromisoformat(g['grn_date'])
        if isinstance(g.get('created_at'), str):
            g['created_at'] = datetime.fromisoformat(g['created_at'])
    return grns

@router.post("/qc-grns")
async def create_qc_grn(input: QCGRNCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    grn_dict = input.model_dump()
    grn_dict["recorded_by"] = current_user["user_id"]
    grn = QCGRN(**grn_dict)
    
    doc = grn.model_dump()
    doc['grn_date'] = doc['grn_date'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    # Anchor grn_date to the actual supply date of the goods (earliest item
    # dispatch_date) so the record is retrievable by the date the user thinks in.
    doc['grn_date'] = _derive_grn_date(doc.get('items', []), doc['grn_date'])
    await db.qc_grns.insert_one(doc)
    
    return {"id": grn.id, "message": "GRN created successfully"}

@router.put("/qc-grns/{grn_id}")
async def update_qc_grn(grn_id: str, input: QCGRNCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing GRN record"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if GRN exists
    existing = await db.qc_grns.find_one({"id": grn_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    # Prepare update data
    update_data = input.model_dump()
    update_data['grn_date'] = update_data['grn_date'].isoformat() if hasattr(update_data['grn_date'], 'isoformat') else update_data['grn_date']
    # Keep grn_date anchored to the supply date, not the edit timestamp.
    update_data['grn_date'] = _derive_grn_date(update_data.get('items', []), update_data['grn_date'])

    # Recalculate totals from items
    items = update_data.get('items', [])
    update_data['total_supplied'] = sum(item.get('supplied_qty', 0) for item in items)
    update_data['total_grn'] = sum(item.get('grn_qty', 0) for item in items)
    update_data['total_difference'] = sum(item.get('difference', 0) for item in items)
    
    # Update the GRN
    await db.qc_grns.update_one(
        {"id": grn_id},
        {"$set": update_data}
    )
    
    return {"id": grn_id, "message": "GRN updated successfully"}

@router.delete("/qc-grns/{grn_id}")
async def delete_qc_grn(grn_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.qc_grns.delete_one({"id": grn_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    return {"message": "GRN deleted successfully"}

@router.delete("/qc-grns/{grn_id}/items/{item_index}")
async def delete_qc_grn_item(grn_id: str, item_index: int, current_user: dict = Depends(get_current_user)):
    """Delete a single item from a GRN record"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get the GRN
    grn = await db.qc_grns.find_one({"id": grn_id}, {"_id": 0})
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    
    items = grn.get("items", [])
    if item_index < 0 or item_index >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item index")
    
    # Remove the item
    items.pop(item_index)
    
    if len(items) == 0:
        # If no items left, delete the entire GRN
        await db.qc_grns.delete_one({"id": grn_id})
        return {"message": "GRN deleted (no items remaining)"}
    
    # Recalculate totals
    total_supplied = sum(item.get("supplied_qty", 0) for item in items)
    total_grn = sum(item.get("grn_qty", 0) for item in items)
    total_difference = sum(item.get("difference", 0) for item in items)
    
    # Update the GRN
    await db.qc_grns.update_one(
        {"id": grn_id},
        {"$set": {
            "items": items,
            "total_supplied": total_supplied,
            "total_grn": total_grn,
            "total_difference": total_difference
        }}
    )
    
    return {"message": "Item removed from GRN"}

@router.post("/qc-grns/upload-ninjacart-csv")
async def upload_ninjacart_grn_csv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Upload Ninjacart GRN CSV or Excel file and match with our dispatches.
    The file contains: PO_DeliveryDate, Sku Name, GRNQuantity, GRNPrice, WeightUnit
    
    STRICT VALIDATION: Only processes rows if a dispatch exists for that exact date.
    Returns warnings for skipped rows (no matching dispatch).
    """
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.csv') or filename_lower.endswith('.xlsx') or filename_lower.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Only CSV or Excel (.xlsx, .xls) files are allowed")
    
    # Read file content
    content = await file.read()
    
    # Parse based on file type
    rows_data = []
    if filename_lower.endswith('.csv'):
        # Parse CSV
        decoded = content.decode('utf-8')
        reader = csv.DictReader(io.StringIO(decoded))
        rows_data = list(reader)
        logger.info(f"CSV headers: {reader.fieldnames if hasattr(reader, 'fieldnames') else 'N/A'}")
    else:
        # Parse Excel (.xlsx or .xls)
        import openpyxl
        from io import BytesIO
        from datetime import datetime as dt
        
        try:
            workbook = openpyxl.load_workbook(BytesIO(content), read_only=True, data_only=True)
            sheet = workbook.active
            
            # Get headers from first row - try to find the actual header row
            headers = []
            header_row = 1
            
            # Check first few rows to find header row (in case there's a title row)
            for check_row in range(1, 4):
                potential_headers = []
                for cell in sheet[check_row]:
                    val = str(cell.value).strip() if cell.value else ''
                    potential_headers.append(val)
                
                # Check if this looks like a header row (contains expected column names)
                header_str = ' '.join(potential_headers).lower()
                if 'podate' in header_str or 'sku' in header_str or 'grn' in header_str or 'po_deliverydate' in header_str:
                    headers = potential_headers
                    header_row = check_row
                    break
            
            # If no header row found, use first row
            if not headers:
                for cell in sheet[1]:
                    headers.append(str(cell.value).strip() if cell.value else '')
            
            logger.info(f"Excel headers found at row {header_row}: {headers}")
            
            # Parse data rows (starting after header row)
            for row_idx, row in enumerate(sheet.iter_rows(min_row=header_row+1, values_only=True), start=header_row+1):
                row_dict = {}
                for col_idx, value in enumerate(row):
                    if col_idx < len(headers):
                        header = headers[col_idx]
                        # Handle datetime objects specially
                        if isinstance(value, dt):
                            row_dict[header] = value.strftime('%Y-%m-%d')
                        elif value is not None:
                            row_dict[header] = str(value).strip()
                        else:
                            row_dict[header] = ''
                if any(row_dict.values()):  # Skip completely empty rows
                    rows_data.append(row_dict)
            
            # Log first row for debugging
            if rows_data:
                logger.info(f"First Excel row parsed: {rows_data[0]}")
            else:
                logger.warning("No data rows found in Excel file")
            
            workbook.close()
        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    
    # Get all Ninjacart dispatches
    ninjacart_dispatches = await db.qc_dispatches.find(
        {"customer_name": {"$regex": "ninja", "$options": "i"}},
        {"_id": 0}
    ).to_list(1000)
    
    # Build a set of dates that have dispatches for quick lookup
    dispatch_dates_set = set()
    for dispatch in ninjacart_dispatches:
        dispatch_date = dispatch.get('dispatch_date', '')
        if isinstance(dispatch_date, str):
            dispatch_dates_set.add(dispatch_date[:10])  # YYYY-MM-DD
        else:
            dispatch_dates_set.add(dispatch_date.strftime('%Y-%m-%d'))
    
    # Get packaging variants for weight lookup
    packaging_variants = await db.qc_packaging.find({}, {"_id": 0}).to_list(100)
    packaging_map = {p['name'].lower(): p for p in packaging_variants}
    
    # Parse rows and validate against dispatch dates
    # Support both old format (PO_DeliveryDate, Sku Name, GRNQuantity, GRNPrice, WeightUnit)
    # and new format (podate, Sku, GRN_Qty, Total_Value, Kgs_Pcs)
    csv_data_by_date = {}
    skipped_rows = []  # Track rows skipped due to no matching dispatch
    total_csv_rows = 0
    
    for row in rows_data:
        total_csv_rows += 1
        try:
            # Detect format and extract date
            # New format: podate (YYYY-MM-DD)
            # Old format: PO_DeliveryDate (DD/MM/YY)
            date_str = row.get('podate', '') or row.get('PO_DeliveryDate', '')
            
            if not date_str:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': 'Missing date',
                    'sku': row.get('Sku', row.get('Sku Name', 'Unknown'))
                })
                continue
            
            # Parse date based on format
            parsed_date = None
            if '-' in str(date_str):
                # New format: YYYY-MM-DD or datetime object
                if hasattr(date_str, 'strftime'):
                    # It's a datetime object from Excel
                    parsed_date = date_str.strftime('%Y-%m-%d')
                else:
                    # It's a string like "2026-03-29"
                    parsed_date = str(date_str)[:10]  # Take first 10 chars (YYYY-MM-DD)
            elif '/' in str(date_str):
                # Old format: DD/MM/YY
                day, month, year = str(date_str).split('/')
                if len(year) == 2:
                    year = '20' + year
                parsed_date = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
            else:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': f'Invalid date format: {date_str}',
                    'sku': row.get('Sku', row.get('Sku Name', 'Unknown'))
                })
                continue
            
            # Extract SKU name (new format: Sku, old format: Sku Name)
            sku_name = (row.get('Sku', '') or row.get('Sku Name', '')).strip()
            
            # Extract GRN quantity (new format: GRN_Qty, old format: GRNQuantity)
            grn_qty_raw = row.get('GRN_Qty', '') or row.get('GRNQuantity', '0')
            grn_qty = float(grn_qty_raw) if grn_qty_raw else 0
            
            # Extract price/value (new format: Total_Value, old format: GRNPrice)
            # For new format, we may need to calculate rate from Total_Value / GRN_Qty
            total_value_raw = row.get('Total_Value', '') or row.get('GRNPrice', '0')
            total_value = float(total_value_raw) if total_value_raw else 0
            
            # Calculate rate per unit
            if grn_qty > 0 and total_value > 0:
                grn_price = total_value / grn_qty
            else:
                grn_price = float(row.get('GRNPrice', '0') or '0')
            
            # Extract unit (new format: Kgs_Pcs, old format: WeightUnit)
            weight_unit = (row.get('Kgs_Pcs', '') or row.get('WeightUnit', 'Kg')).strip()
            
            if not sku_name or grn_qty == 0:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': 'Empty SKU or zero quantity',
                    'sku': sku_name or 'Empty',
                    'date': str(date_str)
                })
                continue
            
            # STRICT VALIDATION: Check if dispatch exists for this date
            if parsed_date not in dispatch_dates_set:
                skipped_rows.append({
                    'row': total_csv_rows,
                    'reason': f'No dispatch found for date {parsed_date}',
                    'sku': sku_name,
                    'date': str(date_str)
                })
                continue
            
            # Store by date (only if dispatch exists)
            if parsed_date not in csv_data_by_date:
                csv_data_by_date[parsed_date] = []
            
            # Check if this is a combo product (contains ":" and ingredient list)
            combo_info = None
            if is_combo_product(sku_name):
                combo_info = parse_combo_product(sku_name)
                if combo_info:
                    logger.info(f"GRN Upload: Detected combo product: {sku_name}")
                    logger.info(f"  -> Parsed as: {combo_info['name']} with {len(combo_info['ingredients'])} ingredients")
            
            csv_data_by_date[parsed_date].append({
                'sku_name': sku_name,
                'grn_qty': grn_qty,
                'grn_price': grn_price,
                'total_value': total_value,
                'weight_unit': weight_unit,
                'is_combo': combo_info is not None,
                'combo_info': combo_info
            })
        except Exception as e:
            logger.error(f"Error parsing row {total_csv_rows}: {e}")
            skipped_rows.append({
                'row': total_csv_rows,
                'reason': f'Parse error: {str(e)}',
                'sku': row.get('Sku', row.get('Sku Name', 'Unknown'))
            })
            continue
    
    # Match CSV data with dispatches
    # NEW LOGIC:
    # 1. Use column H (Kgs_Pcs) from Excel to determine if SKU is Kg or PCS based
    # 2. Only dispatch packaging with explicit "(PCS)" is PCS-based, everything else is Kg-based
    # 3. For Kg-based products with multiple variants, distribute GRN proportionally by supplied weight
    
    matched_items = []
    
    # Log parsed data for debugging
    logger.info(f"GRN Upload: Parsed {total_csv_rows} rows, {len(csv_data_by_date)} dates with data")
    logger.info(f"GRN Upload: Dispatch dates available: {list(dispatch_dates_set)[:5]}...")
    logger.info(f"GRN Upload: CSV dates parsed: {list(csv_data_by_date.keys())}")
    
    # Direct SKU name mappings for combo products (Ninjacart SKU -> Internal product name)
    # These are special combo products where the Excel SKU name is completely different
    direct_sku_mappings = {
        # Ninjacart combo SKUs -> Internal product names (based on dispatch matching)
        'mixed sprouts (pcs)': 'Fresh Spices Mix',           # Row 15: Mixed Sprouts (PCS) - FK
        'mixed sprouts': 'Coriander and Mint',               # Row 12: Mixed Sprouts (no PCS suffix)
        'mixed fruit chat': 'Curry and Coriander',           # Row 13: Mixed Fruit Chat (175 gm Pack)
        'mixed microgreens': 'Herbs Mix',                    # Row 14: Mixed Microgreens(50 g Pack)
        'coriander hybrid (hydroponics)': 'Spinach and Coriander',  # Row 16: Coriander Hybrid
        'coriander hybrid': 'Spinach and Coriander',         # Alternative match
        # New combo product mappings
        'coriander and mint leaves': 'Coriander and mint leaves',
        'coriander and mint': 'Coriander and mint leaves',
        'curry leaves and coriander leaves': 'Curry leaves and coriander leaves',
        'curry and coriander': 'Curry leaves and coriander leaves',
        'herbs mix': 'Herbs mix',
        'fresh spices mix': 'fresh spices mix',
        'spices mix': 'fresh spices mix',
        'spinach and coriander leaves': 'Spinach and Coriander leaves',
        'spinach and coriander': 'Spinach and Coriander leaves',
        'palak and coriander': 'Spinach and Coriander leaves',
    }
    
    # Also add combo SKU mappings from combo_utils
    combo_sku_mappings = get_combo_sku_mappings()
    direct_sku_mappings.update(combo_sku_mappings)
    
    # Variant/color words that MUST match exactly if present in product name
    variant_words = {'red', 'green', 'yellow', 'white', 'black', 'purple', 'orange', 
                   'small', 'large', 'big', 'baby', 'mini', 'jumbo', 'local', 'hybrid',
                   'english', 'indian', 'desi', 'organic', 'fresh', 'premium'}
    
    # Step 1: Combine all dispatch items by date (since each item may be in a separate dispatch)
    dispatch_items_by_date = {}
    for dispatch in ninjacart_dispatches:
        dispatch_date = dispatch.get('dispatch_date', '')
        if isinstance(dispatch_date, str):
            dispatch_date_str = dispatch_date[:10]
        else:
            dispatch_date_str = dispatch_date.strftime('%Y-%m-%d')
        
        if dispatch_date_str not in dispatch_items_by_date:
            dispatch_items_by_date[dispatch_date_str] = []
        
        for item in dispatch.get('items', []):
            item_with_dispatch = {
                **item,
                'dispatch_id': dispatch.get('id')
            }
            dispatch_items_by_date[dispatch_date_str].append(item_with_dispatch)
    
    logger.info(f"Combined dispatch items by date: {[(d, len(items)) for d, items in dispatch_items_by_date.items()]}")
    
    # Step 2: Process each date
    for dispatch_date_str, all_dispatch_items in dispatch_items_by_date.items():
        # Check if we have CSV data for this date
        if dispatch_date_str not in csv_data_by_date:
            continue
        
        csv_rows = csv_data_by_date[dispatch_date_str]
        
        # Step 3: Group dispatch items by base product name
        product_groups = {}  # {base_product_name: [items]}
        
        for item in all_dispatch_items:
            product_name = item.get('product_name', '')
            packaging_name = item.get('packaging_name', '') or ''
            packaging_upper = packaging_name.upper()
            
            # Simple PCS vs Kg classification:
            # "(PCS)" in packaging = PCS-based, matches Excel SKUs with Kgs_Pcs = "PCS"
            # Everything else (Packet, gm, etc.) = Kg-based, matches Excel SKUs with Kgs_Pcs = "Kgs"
            dispatch_is_pcs = '(PCS)' in packaging_upper
            
            # Get packaging weight
            packaging_weight_gm = 0
            if packaging_name:
                pkg = packaging_map.get(packaging_name.lower())
                if pkg:
                    packaging_weight_gm = pkg.get('weight_gm', 0)
            if packaging_weight_gm == 0:
                weight_match = re.search(r'(\d+)\s*(gm|g|gram)', packaging_name.lower())
                if weight_match:
                    packaging_weight_gm = int(weight_match.group(1))
            
            # Extract base product name
            base_name = product_name.lower().strip()
            
            item_data = {
                **item,
                'packaging_weight_gm': packaging_weight_gm,
                'dispatch_is_pcs': dispatch_is_pcs,
                'base_product_name': base_name
            }
            
            if base_name not in product_groups:
                product_groups[base_name] = []
            product_groups[base_name].append(item_data)
        
        logger.info(f"Product groups for {dispatch_date_str}: {[(name, len(items)) for name, items in product_groups.items()]}")
        
        # Step 4: First pass - collect all SKU matches for each product group
        # This handles cases like Palak/Spinach where multiple SKUs should be combined
        product_group_matches = {}  # {base_name: {'kg_skus': [], 'pcs_skus': [], 'items': []}}
        
        for csv_row in csv_rows:
            sku_name = csv_row['sku_name']
            sku_name_lower = sku_name.lower()
            grn_qty_kg_or_pcs = csv_row['grn_qty']  # This is Kg for Kgs items, pieces for Pcs items
            rate_per_kg_or_pcs = csv_row['grn_price']  # Rate per Kg or per piece
            total_value = csv_row.get('total_value', grn_qty_kg_or_pcs * rate_per_kg_or_pcs)
            
            # Use column H (Kgs_Pcs) to determine SKU type
            weight_unit = csv_row.get('weight_unit', '').upper()
            sku_is_pcs = weight_unit in ['PCS', 'PIECES', 'PIECE']
            sku_is_kg = weight_unit in ['KGS', 'KG', 'KILO', 'KILOS'] or not sku_is_pcs
            
            # Clean SKU name for matching (remove - FK, etc.)
            sku_clean = re.sub(r'\s*-\s*(FK|MH|BLR)\s*$', '', sku_name_lower, flags=re.IGNORECASE)
            sku_clean = re.sub(r'\s*\([^)]*\)\s*', ' ', sku_clean)  # Remove parentheses content
            sku_clean = re.sub(r'\s+', ' ', sku_clean).strip()
            sku_words = set(sku_clean.split())
            
            # Extract weight from SKU name for weight-based matching (e.g., "70-80gm", "100 g")
            sku_weight_match = re.search(r'(\d+)(?:\s*-\s*\d+)?\s*(gm|g)\b', sku_name_lower)
            sku_weight = int(sku_weight_match.group(1)) if sku_weight_match else 0
            
            # Check for "with roots" or "without roots" in SKU for special matching
            sku_has_with_roots = 'with roots' in sku_name_lower and 'without' not in sku_name_lower
            sku_has_without_roots = 'without roots' in sku_name_lower
            
            # Special product name mappings (Mint variants, Methi = Fenugreek)
            # NOTE: Palak and Spinach are NOT aliased - they should match separately
            # Each Excel SKU should match only its corresponding dispatch product
            product_aliases = {
                'mint': ['mint', 'fresh mint leaves', 'premium fresh mint leaves', 'fresh mint', 'premium mint'],
                'fresh mint leaves': ['mint', 'fresh mint leaves', 'premium fresh mint leaves'],
                'premium fresh mint leaves': ['mint', 'fresh mint leaves', 'premium fresh mint leaves'],
                'methi': ['methi', 'fenugreek', 'fenugreek (methi)'],
                'fenugreek': ['methi', 'fenugreek', 'fenugreek (methi)'],
                'fenugreek (methi)': ['methi', 'fenugreek', 'fenugreek (methi)'],
                'radish': ['radish', 'raddish'],  # Ninjacart spells it "Raddish" 
                'raddish': ['radish', 'raddish'],
            }
            
            logger.info(f"Processing SKU: {sku_name} | Unit: {weight_unit} | is_pcs={sku_is_pcs} | Qty: {grn_qty_kg_or_pcs} | SKU_weight: {sku_weight}gm | with_roots={sku_has_with_roots}")
            
            # Check if this is a combo SKU (matches any of the combo product prefixes)
            is_combo_sku = False
            combo_prefixes = [
                'coriander and mint leaves', 'coriander and mint',
                'curry leaves and coriander leaves', 'curry and coriander',
                'herbs mix', 'fresh spices mix', 'spices mix',
                'spinach and coriander leaves', 'spinach and coriander', 'palak and coriander',
                'mixed sprouts', 'mixed fruit chat', 'mixed microgreens', 'coriander hybrid'
            ]
            for prefix in combo_prefixes:
                if sku_name_lower.startswith(prefix) or prefix in sku_name_lower:
                    is_combo_sku = True
                    logger.info(f"  COMBO SKU DETECTED: {sku_name} (matched prefix: '{prefix}')")
                    break
            
            # Find matching product group
            best_match_group = None
            best_match_score = 0
            
            # FIRST: Check direct SKU mappings for combo products
            # These have completely different names in Excel vs dispatch system
            # Sort by length (longest first) to match more specific patterns first
            # e.g., "mixed sprouts (pcs)" should match before "mixed sprouts"
            direct_match_found = False
            sorted_mappings = sorted(direct_sku_mappings.items(), key=lambda x: len(x[0]), reverse=True)
            for sku_prefix, internal_name in sorted_mappings:
                if sku_name_lower.startswith(sku_prefix) or sku_prefix in sku_name_lower:
                    # Found a direct mapping - look for this product in dispatch
                    internal_name_lower = internal_name.lower()
                    for base_name, items in product_groups.items():
                        base_name_lower = base_name.lower()
                        
                        # For COMBO products: Match only if base_name STARTS WITH the internal_name
                        # This prevents "coriander" from matching "coriander and mint leaves"
                        # The base_name will be the full combo name with ingredients
                        if is_combo_sku:
                            # Combo product: base_name should START WITH internal_name
                            # e.g., "coriander and mint leaves (220 gm pack)-fk : (...)" starts with "coriander and mint leaves"
                            if base_name_lower.startswith(internal_name_lower):
                                # For combos, take all items regardless of PCS/Kg type
                                type_matched_items = items
                                logger.info(f"  COMBO MATCH: SKU '{sku_name}' -> Product '{base_name}' | items: {len(items)}")
                                if type_matched_items:
                                    best_match_group = (base_name, type_matched_items)
                                    best_match_score = 1.0
                                    direct_match_found = True
                                    logger.info(f"  DIRECT MAPPING (COMBO): SKU '{sku_name}' -> Product '{base_name}' via mapping '{sku_prefix}' -> '{internal_name}'")
                                    break
                        else:
                            # Regular products: original matching logic
                            if internal_name_lower == base_name_lower or internal_name_lower in base_name_lower or base_name_lower in internal_name_lower:
                                # Apply PCS vs Kg filter
                                if sku_is_pcs:
                                    type_matched_items = [i for i in items if i.get('dispatch_is_pcs')]
                                else:
                                    type_matched_items = [i for i in items if not i.get('dispatch_is_pcs')]
                                
                                if type_matched_items:
                                    best_match_group = (base_name, type_matched_items)
                                    best_match_score = 1.0
                                    direct_match_found = True
                                    logger.info(f"  DIRECT MAPPING: SKU '{sku_name}' -> Product '{base_name}' via mapping '{sku_prefix}' -> '{internal_name}'")
                                    break
                    if direct_match_found:
                        break
            
            # SECOND: Regular matching logic if no direct match found
            if not direct_match_found:
                for base_name, items in product_groups.items():
                    # Special handling for Mint Leaves ONLY - match by weight and roots type
                    is_mint_product = 'mint' in base_name.lower()
                    is_mint_sku = 'mint' in sku_name_lower
                    
                    # Only apply Mint-specific matching if BOTH product and SKU mention mint
                    if is_mint_product and is_mint_sku and sku_is_pcs and (sku_has_with_roots or sku_has_without_roots):
                        # For Mint PCS items, match based on BOTH roots type AND weight
                        # This prevents 70-80gm "without roots" from matching 100gm "with roots"
                        matched_mint_items = []
                        for item in items:
                            pkg_name_lower = item.get('packaging_name', '').lower()
                            pkg_has_with_roots = 'with roots' in pkg_name_lower and 'without' not in pkg_name_lower
                            pkg_has_without_roots = 'without roots' in pkg_name_lower
                            
                            # Match roots type (REQUIRED)
                            roots_match = (sku_has_with_roots and pkg_has_with_roots) or \
                                         (sku_has_without_roots and pkg_has_without_roots)
                            
                            if not roots_match:
                                continue  # Skip if roots type doesn't match
                            
                            # Match weight (within 30gm tolerance for 70-80 range)
                            pkg_weight = item.get('packaging_weight_gm', 0)
                            weight_match = sku_weight > 0 and pkg_weight > 0 and abs(pkg_weight - sku_weight) <= 30
                            
                            # For Mint, require BOTH roots match AND (weight match OR no weight specified)
                            if roots_match and (weight_match or sku_weight == 0 or pkg_weight == 0):
                                logger.info(f"  Mint match found: {item.get('packaging_name')} | roots_match={roots_match}, weight_match={weight_match}, sku_weight={sku_weight}, pkg_weight={pkg_weight}")
                                matched_mint_items.append(item)
                        
                        if matched_mint_items:
                            best_match_group = (base_name, matched_mint_items)
                            best_match_score = 1.0
                            break
                    
                    # Regular matching logic
                    # PCS SKU (Excel Kgs_Pcs = "PCS") matches dispatch items with "(PCS)" in packaging
                    # Kg SKU (Excel Kgs_Pcs = "Kgs") matches ALL other dispatch items (Packet, gm, etc.)
                    if sku_is_pcs:
                        type_matched_items = [i for i in items if i.get('dispatch_is_pcs')]
                    else:
                        type_matched_items = [i for i in items if not i.get('dispatch_is_pcs')]
                    
                    if not type_matched_items:
                        continue  # No items match the required type
                    
                    # Check product name match
                    product_words = set(base_name.split())
                    first_word = base_name.split()[0] if base_name else ''
                    
                    # Check for product aliases (Palak/Spinach, Mint variants)
                    alias_match = False
                    for alias_key, aliases in product_aliases.items():
                        if first_word in aliases or any(alias in base_name for alias in aliases):
                            if any(alias in sku_clean for alias in aliases):
                                alias_match = True
                                break
                    
                    # Check variant words - if present in product, must be in SKU
                    product_variants = product_words & variant_words
                    if product_variants and not alias_match:
                        if not product_variants.issubset(sku_words):
                            continue
                    
                    # Count matching words
                    common_words = product_words & sku_words
                    
                    # For PCS items, also match based on packaging weight
                    if sku_is_pcs and sku_weight > 0 and not is_mint_sku:
                        # Check if any item in group has matching weight
                        weight_matched_items = [i for i in type_matched_items if abs(i['packaging_weight_gm'] - sku_weight) <= 20]
                        if weight_matched_items:
                            # Weight match found - this is a strong match for PCS items
                            if alias_match or common_words:
                                match_score = 1.0  # High score for weight + name match
                                if match_score > best_match_score:
                                    best_match_score = match_score
                                    # Only include weight-matched items
                                    best_match_group = (base_name, weight_matched_items)
                                continue
                    
                    if not common_words and not alias_match:
                        continue
                    
                    # First word (main product) must match (unless alias match)
                    if not alias_match:
                        if first_word and first_word not in sku_words:
                            if not any(first_word in sw or sw in first_word for sw in sku_words):
                                continue
                    
                    match_score = len(common_words) / max(len(product_words), 1)
                    if alias_match:
                        match_score = max(match_score, 0.8)  # Boost alias matches
                    
                    if match_score > best_match_score:
                        best_match_score = match_score
                        best_match_group = (base_name, type_matched_items)
            
            if not best_match_group:
                logger.info(f"  No match found for SKU: {sku_name}")
                continue
            
            base_name, matching_items = best_match_group
            logger.info(f"  Matched with product group: {base_name} ({len(matching_items)} variants)")
            
            # Collect matches by product group for later aggregation
            if base_name not in product_group_matches:
                product_group_matches[base_name] = {
                    'kg_skus': [],
                    'pcs_skus': [],
                    'items': matching_items
                }
            else:
                # Update items to include all variants
                existing_item_ids = {id(i) for i in product_group_matches[base_name]['items']}
                for item in matching_items:
                    if id(item) not in existing_item_ids:
                        product_group_matches[base_name]['items'].append(item)
            
            if sku_is_pcs:
                product_group_matches[base_name]['pcs_skus'].append({
                    'sku_name': sku_name,
                    'grn_qty': grn_qty_kg_or_pcs,
                    'rate': rate_per_kg_or_pcs,
                    'total_value': total_value,
                    'items': list(matching_items),  # Make a copy to avoid reference issues
                    'is_combo': is_combo_sku  # Flag for combo products
                })
            else:
                product_group_matches[base_name]['kg_skus'].append({
                    'sku_name': sku_name,
                    'grn_qty_kg': grn_qty_kg_or_pcs,
                    'rate_per_kg': rate_per_kg_or_pcs,
                    'total_value': total_value,
                    'items': list(matching_items),  # Make a copy to avoid reference issues
                    'is_combo': is_combo_sku  # Flag for combo products
                })
        
        # Step 5: Now distribute GRN to dispatch items
        # Track processed dispatch items to prevent duplicate supplied_qty entries
        processed_dispatch_items = {}  # {dispatch_id_product_id_packaging_id: matched_item_dict}
        
        for base_name, group_data in product_group_matches.items():
            # Process PCS SKUs - COMBINE all PCS SKUs that match the same dispatch items
            # This prevents double-counting supplied_qty when multiple Excel SKUs match the same dispatch
            if group_data['pcs_skus']:
                # First, collect ALL unique PCS dispatch items and combine GRN quantities
                all_pcs_items = {}  # {item_key: item_dict_with_accumulated_grn}
                combined_sku_names = []
                
                for pcs_sku in group_data['pcs_skus']:
                    sku_name = pcs_sku['sku_name']
                    grn_qty = pcs_sku['grn_qty']
                    rate_per_pcs = pcs_sku['rate']
                    sku_items = pcs_sku['items']
                    is_combo = pcs_sku.get('is_combo', False)
                    combined_sku_names.append(sku_name)
                    
                    # For COMBO products: use ALL items regardless of dispatch_is_pcs flag
                    # (combo packaging doesn't have "(PCS)" but they are Pcs-based)
                    # For regular products: only get PCS dispatch items
                    if is_combo:
                        pcs_items = sku_items  # Use all items for combos
                    else:
                        pcs_items = [item for item in sku_items if item.get('dispatch_is_pcs')]
                    
                    if not pcs_items:
                        logger.warning(f"  No PCS dispatch items found for SKU: {sku_name}")
                        continue
                    
                    # Calculate total supplied for this SKU's matched items
                    total_supplied_pcs = sum(item.get('supplied_qty', 0) for item in pcs_items)
                    
                    logger.info(f"  Processing PCS SKU: {sku_name} | GRN: {grn_qty} pcs | Supplied: {total_supplied_pcs} | Items: {len(pcs_items)} | is_combo: {is_combo}")
                    
                    if total_supplied_pcs == 0:
                        logger.warning(f"  Zero supplied qty for SKU: {sku_name}")
                        continue
                    
                    # For COMBO products: Use GRN_Qty directly from Excel without proportional distribution
                    # The dispatch qty (supplied_qty) may be different from GRN qty due to various reasons
                    if is_combo:
                        # For combo, we use GRN_Qty directly and assign to the first matching dispatch item
                        # Since combos are unique products, there should typically be only one dispatch item
                        item = pcs_items[0]  # Use first (and typically only) matching dispatch item
                        item_key = f"{item.get('dispatch_id')}_{item.get('product_id')}_{item.get('packaging_id')}"
                        
                        if item_key in all_pcs_items:
                            # Accumulate GRN qty for same dispatch item
                            all_pcs_items[item_key]['grn_qty'] += grn_qty
                            all_pcs_items[item_key]['sku_names'].append(sku_name)
                            logger.info(f"    COMBO: Accumulating to existing item: {item_key}, total grn_qty={all_pcs_items[item_key]['grn_qty']:.2f}")
                        else:
                            # New dispatch item - use GRN qty directly
                            all_pcs_items[item_key] = {
                                'dispatch_id': item.get('dispatch_id'),
                                'dispatch_date': dispatch_date_str,
                                'product_id': item.get('product_id'),
                                'product_name': item.get('product_name'),
                                'product_unit': item.get('product_unit'),
                                'packaging_id': item.get('packaging_id'),
                                'packaging_name': item.get('packaging_name'),
                                'packaging_weight_gm': item.get('packaging_weight_gm', 0),
                                'supplied_qty': item.get('supplied_qty', 0),  # Keep dispatch supplied qty
                                'grn_qty': grn_qty,  # Use GRN qty directly from Excel
                                'rate_per_pcs': rate_per_pcs,
                                'sku_names': [sku_name],
                                'is_combo': True
                            }
                            logger.info(f"    COMBO: New dispatch item: {item_key}, supplied={item.get('supplied_qty', 0)}, grn={grn_qty} (direct from Excel)")
                    else:
                        # Regular products: Distribute GRN proportionally to each dispatch item
                        for item in pcs_items:
                            supplied_qty = item.get('supplied_qty', 0)
                            
                            # Calculate this item's proportion of the total supplied
                            proportion = supplied_qty / total_supplied_pcs if total_supplied_pcs > 0 else 0
                            
                            # Distribute GRN proportionally
                            grn_qty_for_item = grn_qty * proportion
                            
                            # Create unique key for this dispatch item
                            item_key = f"{item.get('dispatch_id')}_{item.get('product_id')}_{item.get('packaging_id')}"
                            
                            if item_key in all_pcs_items:
                                # Accumulate GRN qty for same dispatch item
                                all_pcs_items[item_key]['grn_qty'] += grn_qty_for_item
                                all_pcs_items[item_key]['sku_names'].append(sku_name)
                                logger.info(f"    Accumulating to existing item: {item_key}, total grn_qty={all_pcs_items[item_key]['grn_qty']:.2f}")
                            else:
                                # New dispatch item
                                all_pcs_items[item_key] = {
                                    'dispatch_id': item.get('dispatch_id'),
                                    'dispatch_date': dispatch_date_str,
                                    'product_id': item.get('product_id'),
                                    'product_name': item.get('product_name'),
                                    'product_unit': item.get('product_unit'),
                                    'packaging_id': item.get('packaging_id'),
                                    'packaging_name': item.get('packaging_name'),
                                    'packaging_weight_gm': item.get('packaging_weight_gm', 0),
                                    'supplied_qty': supplied_qty,
                                    'grn_qty': grn_qty_for_item,
                                    'rate_per_pcs': rate_per_pcs,
                                    'sku_names': [sku_name],
                                    'is_combo': False
                                }
                                logger.info(f"    New dispatch item: {item_key}, supplied={supplied_qty}, grn={grn_qty_for_item:.2f}")
                
                # Now add all unique PCS items to matched_items
                for item_key, item_data in all_pcs_items.items():
                    grn_qty_final = item_data['grn_qty']
                    supplied_qty = item_data['supplied_qty']
                    rate_per_pcs = item_data['rate_per_pcs']
                    
                    amount = grn_qty_final * rate_per_pcs
                    difference = grn_qty_final - supplied_qty
                    loss_gain = difference * rate_per_pcs
                    combined_sku = ' + '.join(item_data['sku_names'])
                    
                    matched_items.append({
                        'dispatch_id': item_data['dispatch_id'],
                        'dispatch_date': item_data['dispatch_date'],
                        'product_id': item_data['product_id'],
                        'product_name': item_data['product_name'],
                        'product_unit': item_data['product_unit'],
                        'packaging_id': item_data['packaging_id'],
                        'packaging_name': item_data['packaging_name'],
                        'packaging_weight_gm': item_data['packaging_weight_gm'],
                        'supplied_qty': supplied_qty,
                        'grn_qty': round(grn_qty_final, 2),
                        'grn_qty_kg': None,
                        'difference': round(difference, 2),
                        'rate_per_kg': None,
                        'rate_per_unit': round(rate_per_pcs, 2),
                        'rate_type': 'per_pcs',
                        'sku_name': combined_sku,
                        'amount': round(amount, 2),
                        'loss_gain_amount': round(loss_gain, 2)
                    })
                    
                    # Mark as processed
                    processed_dispatch_items[item_key] = True
            
            # Process Kg SKUs - COMBINE all Kg SKUs for this product group
            # Kg SKUs should ONLY match with Kg-based dispatch items (NOT PCS items)
            if group_data['kg_skus']:
                # Combine all Kg SKUs
                total_grn_kg = sum(sku['grn_qty_kg'] for sku in group_data['kg_skus'])
                total_value = sum(sku['total_value'] for sku in group_data['kg_skus'])
                combined_rate_per_kg = total_value / total_grn_kg if total_grn_kg > 0 else 0
                combined_sku_names = ' + '.join(sku['sku_name'] for sku in group_data['kg_skus'])
                
                logger.info(f"  Combining Kg SKUs for {base_name}: {total_grn_kg}kg @ ₹{combined_rate_per_kg:.2f}/kg from {len(group_data['kg_skus'])} SKUs")
                
                # Get ALL non-PCS dispatch items for Kg SKU matching
                # This includes "Packet" items, "gm" items, etc. - everything without "(PCS)"
                kg_items = []
                seen_item_keys = set()
                for i in group_data['items']:
                    # Include all items that are NOT PCS (dispatch_is_pcs = False)
                    if not i.get('dispatch_is_pcs'):
                        item_key = f"{i.get('dispatch_id')}_{i.get('product_id')}_{i.get('packaging_id')}"
                        # Skip if already processed by PCS SKUs or another product group
                        if item_key in processed_dispatch_items:
                            logger.info(f"    Skipping already processed item: {item_key}")
                            continue
                        if item_key not in seen_item_keys:
                            kg_items.append(i)
                            seen_item_keys.add(item_key)
                
                # Calculate total supplied weight
                total_supplied_kg = 0
                for item in kg_items:
                    pkg_weight_kg = item.get('packaging_weight_gm', 100) / 1000
                    supplied_qty = item.get('supplied_qty', 0)
                    total_supplied_kg += supplied_qty * pkg_weight_kg
                
                if total_supplied_kg == 0:
                    logger.warning(f"  No Kg-based items found for {base_name} (PCS items exist but Kg SKU cannot match them)")
                    continue
                
                logger.info(f"  Total supplied: {total_supplied_kg:.2f}kg, GRN: {total_grn_kg}kg, Dispatch items: {len(kg_items)}")
                
                # Distribute combined GRN proportionally to each dispatch item
                for item in kg_items:
                    pkg_weight_gm = item.get('packaging_weight_gm', 100)
                    pkg_weight_kg = pkg_weight_gm / 1000
                    supplied_qty = item.get('supplied_qty', 0)
                    supplied_kg = supplied_qty * pkg_weight_kg
                    
                    # Proportion of this item's weight
                    proportion = supplied_kg / total_supplied_kg if total_supplied_kg > 0 else 0
                    
                    # Distribute GRN kg proportionally
                    grn_kg_for_item = total_grn_kg * proportion
                    
                    # Convert GRN from Kg to piece count (same unit as supplied_qty)
                    # grn_qty_in_pieces = grn_kg / (packaging_weight_gm / 1000)
                    grn_qty_in_pieces = (grn_kg_for_item * 1000) / pkg_weight_gm if pkg_weight_gm > 0 else 0
                    
                    # Rate per piece (derived from rate_per_kg)
                    rate_per_piece = combined_rate_per_kg * (pkg_weight_gm / 1000)
                    
                    # Amount for this item (using Kg values for accuracy)
                    amount = grn_kg_for_item * combined_rate_per_kg
                    
                    # Difference in pieces (GRN pieces - Supplied pieces)
                    difference_pcs = grn_qty_in_pieces - supplied_qty
                    loss_gain = difference_pcs * rate_per_piece
                    
                    logger.info(f"    {item.get('product_name')} {item.get('packaging_name')}: supplied={supplied_qty} pcs, grn={grn_qty_in_pieces:.1f} pcs, diff={difference_pcs:.1f} pcs")
                    
                    matched_items.append({
                        'dispatch_id': item.get('dispatch_id'),
                        'dispatch_date': dispatch_date_str,
                        'product_id': item.get('product_id'),
                        'product_name': item.get('product_name'),
                        'product_unit': item.get('product_unit'),
                        'packaging_id': item.get('packaging_id'),
                        'packaging_name': item.get('packaging_name'),
                        'packaging_weight_gm': pkg_weight_gm,
                        'supplied_qty': supplied_qty,
                        'supplied_qty_kg': round(supplied_kg, 2),
                        'grn_qty': round(grn_qty_in_pieces, 0),  # GRN in pieces (same unit as supplied_qty)
                        'grn_qty_kg': round(grn_kg_for_item, 2),
                        'difference': round(difference_pcs, 0),  # Difference in pieces
                        'rate_per_kg': round(combined_rate_per_kg, 2),
                        'rate_per_unit': round(rate_per_piece, 2),  # Rate per piece
                        'rate_type': 'per_kg',  # Keep this to indicate original rate source
                        'sku_name': combined_sku_names,
                        'amount': round(amount, 2),
                        'loss_gain_amount': round(loss_gain, 2)
                    })
                    
                    # Mark as processed to prevent duplicate additions from other product groups
                    kg_item_key = f"{item.get('dispatch_id')}_{item.get('product_id')}_{item.get('packaging_id')}"
                    processed_dispatch_items[kg_item_key] = True
    
    # Build response with warnings
    warnings = []
    if skipped_rows:
        # Group skipped rows by reason
        no_dispatch_rows = [r for r in skipped_rows if 'No dispatch found' in r.get('reason', '')]
        other_skipped = [r for r in skipped_rows if 'No dispatch found' not in r.get('reason', '')]
        
        if no_dispatch_rows:
            dates_skipped = list(set([r.get('date', 'Unknown') for r in no_dispatch_rows]))
            warnings.append(f"{len(no_dispatch_rows)} row(s) skipped - No dispatch found for dates: {', '.join(dates_skipped)}")
        
        if other_skipped:
            warnings.append(f"{len(other_skipped)} row(s) skipped due to invalid data")
    
    # Calculate rate changes from previous day
    # Get all saved GRNs to find previous rates
    saved_grns = await db.qc_grns.find({}, {"_id": 0}).to_list(1000)
    
    # Build a map of product -> previous rates (by date)
    product_rates_by_date = {}  # {product_name: {date: rate}}
    for grn in saved_grns:
        for item in grn.get('items', []):
            product_name = item.get('product_name', '')
            packaging_name = item.get('packaging_name', '')
            dispatch_date = item.get('dispatch_date', '')[:10] if item.get('dispatch_date') else ''
            rate = item.get('rate_per_kg') or item.get('rate_per_unit') or 0
            
            key = f"{product_name}|{packaging_name}"
            if key not in product_rates_by_date:
                product_rates_by_date[key] = {}
            if dispatch_date and rate > 0:
                product_rates_by_date[key][dispatch_date] = rate
    
    # Add rate change info to matched items
    rate_changes = []
    for item in matched_items:
        product_name = item.get('product_name', '')
        packaging_name = item.get('packaging_name', '')
        dispatch_date = item.get('dispatch_date', '')[:10] if item.get('dispatch_date') else ''
        current_rate = item.get('rate_per_kg') or item.get('rate_per_unit') or 0
        
        key = f"{product_name}|{packaging_name}"
        
        # Find previous day's rate
        previous_rate = None
        if key in product_rates_by_date:
            # Get all dates for this product and find the closest previous date
            available_dates = sorted([d for d in product_rates_by_date[key].keys() if d < dispatch_date], reverse=True)
            if available_dates:
                previous_date = available_dates[0]
                previous_rate = product_rates_by_date[key].get(previous_date)
        
        # Calculate rate change
        if previous_rate is not None and previous_rate > 0 and current_rate > 0:
            rate_change = current_rate - previous_rate
            rate_change_percent = ((current_rate - previous_rate) / previous_rate) * 100
            item['previous_rate'] = round(previous_rate, 2)
            item['rate_change'] = round(rate_change, 2)
            item['rate_change_percent'] = round(rate_change_percent, 1)
            
            if abs(rate_change) > 0.01:
                rate_changes.append({
                    'product_name': product_name,
                    'packaging_name': packaging_name,
                    'previous_rate': round(previous_rate, 2),
                    'current_rate': round(current_rate, 2),
                    'change': round(rate_change, 2),
                    'change_percent': round(rate_change_percent, 1)
                })
        else:
            item['previous_rate'] = None
            item['rate_change'] = None
            item['rate_change_percent'] = None
    
    # Include debug info about what was parsed
    first_row_sample = rows_data[0] if rows_data else {}
    
    # Build summary for automatic/manual display
    summary = {
        "sync_date": datetime.now(timezone.utc).isoformat(),
        "sync_method": "manual_upload",  # Can be "automatic_gmail" when triggered by scheduler
        "grn_date": list(csv_data_by_date.keys())[0] if csv_data_by_date else None,
        "total_items": len(matched_items),
        "unmatched_items": len(skipped_rows),
        "products_with_rate_change": len(rate_changes),
        "total_amount": round(sum(item.get('amount', 0) for item in matched_items), 2),
        "total_loss_gain": round(sum(item.get('loss_gain_amount', 0) for item in matched_items), 2),
    }
    
    return {
        "file_name": file.filename,
        "total_csv_rows": total_csv_rows,
        "rows_processed": sum(len(rows) for rows in csv_data_by_date.values()),
        "rows_skipped": len(skipped_rows),
        "dates_found": list(csv_data_by_date.keys()),
        "matched_items": matched_items,
        "warnings": warnings,
        "skipped_details": skipped_rows[:10] if skipped_rows else [],
        "rate_changes": rate_changes,
        "summary": summary,
        "debug_first_row": first_row_sample,  # Show what was actually parsed
        "debug_columns_found": list(first_row_sample.keys()) if first_row_sample else [],
        "message": f"Processed {len(matched_items)} matching items" + (f" ({len(skipped_rows)} rows skipped)" if skipped_rows else "")
    }

@router.get("/qc-grns/dispatch-summary")
async def get_dispatch_summary_for_grn(current_user: dict = Depends(get_current_user)):
    """Get all Ninjacart dispatches for GRN table - excludes items already in saved GRNs"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get all Ninjacart dispatches
    dispatches = await db.qc_dispatches.find(
        {"customer_name": {"$regex": "ninja", "$options": "i"}},
        {"_id": 0}
    ).sort("dispatch_date", -1).to_list(1000)
    
    # Get all saved GRNs to exclude already processed items
    saved_grns = await db.qc_grns.find({}, {"_id": 0}).to_list(1000)
    
    # Build a set of processed dispatch_id + product_id + packaging_id combinations
    processed_items = set()
    for grn in saved_grns:
        for item in grn.get('items', []):
            # Create a unique key for each processed item - include packaging_id for accuracy
            key = f"{item.get('dispatch_id')}_{item.get('product_id')}_{item.get('packaging_id')}"
            processed_items.add(key)
    
    # Flatten items with dispatch info, excluding already processed
    items = []
    pending_dates = set()  # Track dates with pending GRNs
    for dispatch in dispatches:
        dispatch_date = dispatch.get('dispatch_date', '')
        for item in dispatch.get('items', []):
            item_key = f"{dispatch.get('id')}_{item.get('product_id')}_{item.get('packaging_id')}"
            
            # Skip if already processed in a GRN
            if item_key in processed_items:
                continue
            
            # Track this date as having pending items
            if dispatch_date:
                date_str = dispatch_date[:10] if isinstance(dispatch_date, str) else str(dispatch_date)[:10]
                pending_dates.add(date_str)
                
            items.append({
                'dispatch_id': dispatch.get('id'),
                'dispatch_date': dispatch_date,
                'dispatch_time': dispatch.get('dispatch_time', ''),
                'customer_name': dispatch.get('customer_name'),
                'product_id': item.get('product_id'),
                'product_name': item.get('product_name'),
                'product_unit': item.get('product_unit'),
                'packaging_id': item.get('packaging_id'),
                'packaging_name': item.get('packaging_name'),
                'supplied_qty': item.get('supplied_qty', 0),
                'grn_qty': None,
                'difference': None,
                'rate_per_unit': item.get('rate'),
            })
    
    return {
        "items": items,
        "pending_dates": sorted(list(pending_dates), reverse=True),
        "total_pending": len(items)
    }


@router.post("/qc-grns/fix-mismatched-ids")
async def fix_mismatched_grn_ids(current_user: dict = Depends(get_current_user)):
    """
    Fix GRN items with mismatched dispatch_id, product_id, or packaging_id.
    This attempts to re-match GRN items to dispatches based on product name and date.
    Use this when Excel backup imports have corrupted/mismatched IDs.
    """
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can fix GRN matching")
    
    try:
        def extract_date_str(date_val):
            """Extract date string from various formats."""
            if date_val is None:
                return ""
            if isinstance(date_val, datetime):
                return date_val.strftime('%Y-%m-%d')
            date_str = str(date_val)
            if 'T' in date_str:
                return date_str[:10]
            return date_str[:10] if len(date_str) >= 10 else date_str
        
        # Get all dispatches
        all_dispatches = await db.qc_dispatches.find({}, {"_id": 0}).to_list(10000)
        
        # Build lookup by date -> product_name -> dispatch items
        dispatch_lookup = {}
        for dispatch in all_dispatches:
            dispatch_date = extract_date_str(dispatch.get('dispatch_date'))
            dispatch_id = dispatch.get('id')
            
            if not dispatch_date or not dispatch_id:
                continue
            
            if dispatch_date not in dispatch_lookup:
                dispatch_lookup[dispatch_date] = {}
            
            for item in dispatch.get('items', []):
                product_name = (item.get('product_name', '') or '').lower().strip()
                packaging_name = (item.get('packaging_name', '') or '').lower().strip()
                
                key = f"{product_name}_{packaging_name}"
                if key not in dispatch_lookup[dispatch_date]:
                    dispatch_lookup[dispatch_date][key] = []
                
                dispatch_lookup[dispatch_date][key].append({
                    'dispatch_id': dispatch_id,
                    'product_id': item.get('product_id'),
                    'packaging_id': item.get('packaging_id'),
                    'supplied_qty': item.get('supplied_qty', 0) or 0
                })
        
        # Get all GRNs and fix mismatched items
        all_grns = await db.qc_grns.find({}).to_list(1000)
        
        total_fixed = 0
        fixed_details = []
        
        for grn in all_grns:
            grn_id = grn.get('id')
            if not grn_id:
                continue
                
            items_updated = False
            updated_items = []
            
            for item in grn.get('items', []):
                item_dispatch_date = extract_date_str(item.get('dispatch_date'))
                product_name = (item.get('product_name', '') or '').lower().strip()
                packaging_name = (item.get('packaging_name', '') or '').lower().strip()
                
                key = f"{product_name}_{packaging_name}"
                
                # Try to find matching dispatch item
                date_items = dispatch_lookup.get(item_dispatch_date, {})
                matching_dispatches = date_items.get(key, [])
                
                if matching_dispatches:
                    # Find best match by supplied_qty
                    item_grn_qty = item.get('grn_qty', 0) or item.get('supplied_qty', 0) or 0
                    best_match = None
                    min_diff = float('inf')
                    
                    for match in matching_dispatches:
                        diff = abs((match.get('supplied_qty') or 0) - item_grn_qty)
                        if diff < min_diff:
                            min_diff = diff
                            best_match = match
                    
                    if best_match:
                        old_dispatch_id = item.get('dispatch_id')
                        old_product_id = item.get('product_id')
                        old_packaging_id = item.get('packaging_id')
                        
                        # Check if any ID is different
                        if (old_dispatch_id != best_match['dispatch_id'] or
                            old_product_id != best_match['product_id'] or
                            old_packaging_id != best_match['packaging_id']):
                            
                            # Update item with correct IDs
                            item['dispatch_id'] = best_match['dispatch_id']
                            item['product_id'] = best_match['product_id']
                            item['packaging_id'] = best_match['packaging_id']
                            items_updated = True
                            total_fixed += 1
                            
                            fixed_details.append({
                                'grn_id': grn_id[:20] if grn_id else None,
                                'product': item.get('product_name'),
                                'old_dispatch_id': old_dispatch_id[:20] if old_dispatch_id else None,
                                'new_dispatch_id': best_match['dispatch_id'][:20] if best_match['dispatch_id'] else None
                            })
                
                updated_items.append(item)
            
            # Update GRN if any items changed
            if items_updated:
                await db.qc_grns.update_one(
                    {"id": grn_id},
                    {"$set": {"items": updated_items}}
                )
        
        return {
            "message": f"Fixed {total_fixed} GRN item IDs",
            "total_fixed": total_fixed,
            "details": fixed_details[:20]  # Return first 20 fixes
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in fix_mismatched_grn_ids: {error_trace}")
        raise HTTPException(status_code=500, detail=f"Error fixing GRN IDs: {str(e)}")


async def calculate_grn_loss(from_date: str = None, to_date: str = None):
    """
    Shared function to calculate GRN loss from uploaded GRN files.
    Used by both GRN Loss Summary and P&L endpoints to ensure consistency.
    
    Returns:
        dict with total_loss, total_qty_diff, by_date breakdown, and all loss items
    """
    # Get all saved GRNs
    saved_grns = await db.qc_grns.find({}, {"_id": 0}).to_list(1000)
    
    loss_by_date = {}
    total_loss = 0
    total_qty_diff = 0
    items_with_loss = []
    
    for grn in saved_grns:
        for item in grn.get('items', []):
            # Use dispatch_date from item (actual supply date)
            dispatch_date = item.get('dispatch_date', grn.get('grn_date', ''))
            dispatch_date_str = dispatch_date[:10] if dispatch_date else 'Unknown'
            
            # Filter by date range
            if from_date and dispatch_date_str < from_date:
                continue
            if to_date and dispatch_date_str > to_date:
                continue
            
            supplied_qty = item.get('supplied_qty', 0) or 0
            grn_qty = item.get('grn_qty', 0) or 0
            difference = item.get('difference', 0) or 0
            
            # Loss occurs when GRN < Supplied (difference is negative)
            if difference < 0:
                loss_qty = abs(difference)
                
                # Calculate loss value
                rate = item.get('rate_per_unit', 0) or item.get('rate_per_kg', 0) or 0
                loss_value = item.get('loss_gain_amount')
                if loss_value is None or loss_value == 0:
                    loss_value = loss_qty * rate
                else:
                    loss_value = abs(loss_value)
                
                if dispatch_date_str not in loss_by_date:
                    loss_by_date[dispatch_date_str] = {
                        'date': dispatch_date_str,
                        'total_loss': 0,
                        'total_qty_diff': 0,
                        'items': []
                    }
                
                loss_by_date[dispatch_date_str]['total_loss'] += loss_value
                loss_by_date[dispatch_date_str]['total_qty_diff'] += loss_qty
                total_loss += loss_value
                total_qty_diff += loss_qty
                
                items_with_loss.append({
                    'date': dispatch_date_str,
                    'product_name': item.get('product_name', ''),
                    'packaging_name': item.get('packaging_name', ''),
                    'supplied_qty': supplied_qty,
                    'grn_qty': grn_qty,
                    'difference': difference,
                    'loss_amount': round(loss_value, 2),
                    'rate': rate
                })
    
    return {
        "total_loss": round(total_loss, 2),
        "total_qty_diff": round(total_qty_diff, 2),
        "by_date": sorted(loss_by_date.values(), key=lambda x: x['date'], reverse=True),
        "items": items_with_loss
    }


@router.get("/qc-grns/loss-summary")
async def get_grn_loss_summary(
    from_date: str = None,
    to_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get GRN loss summary - difference between Supplied and GRN quantities"""
    if current_user["role"] not in ["admin", "staff"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Use the shared calculation function
    result = await calculate_grn_loss(from_date, to_date)
    return result

