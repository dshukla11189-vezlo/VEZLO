# Mr Organix - Product Requirements Document

## Changelog (June 2025)


### June 14, 2025 - Print Bug Fix & Labour UX Improvements ✅
- **BUG FIX**: Fixed Stickers & MRP Print showing "undefined" products
  - Root cause: Field name mismatch between `stickersData` structure and `printStickersMrp()` function
  - Fixed: `product.product_name` → `product.productName`, `product.sticker_count` → `product.quantity`
  - Print now correctly shows product names, sticker counts, MRP values, and unit types
- **BUG FIX**: Dispatch modal now shows retailer/shop name instead of owner name
  - Changed from `selectedIndent?.retailer_name` to `getRetailerNameById(selectedIndent?.retailer_id)`
  - Now correctly shows "Dispatch to Savtamali" instead of "Dispatch to Sonaji Kharat"
- **BUG FIX**: Products now sorted alphabetically within categories in both Indent PDF and Dispatch popup
  - Indent PDF: Added alphabetical sorting within each category/type group
  - Dispatch popup: Already had category/type sorting, confirmed alphabetical within groups
  - Order: Vegetables (Hard → Semi-hard → Leafy, each alphabetical) → Fruits (alphabetical) → Exotic → Sprouts
- **BUG FIX**: Invoice excess amounts now showing correctly for all "Excess Paid" invoices
  - Root cause: `final_payable` was incorrectly stored in some invoices, making `pendingAmount = 0`
  - Fixed: Now calculates excess using `net_payable` (original receivable) instead of `final_payable`
  - June 9, June 3, etc. invoices now show correct excess amounts (e.g., "₹336.00 excess")
- **BUG FIX**: Invoice item-level rejections now populate correctly
  - Root cause: Enrichment logic skipped invoices with `rejection_amount > 0` even if items didn't have `rejected_qty`
  - Fixed: Backend now checks if items actually have `rejected_qty` before skipping enrichment
  - June 10 invoice now shows: Supplied Qty → Rejection (-X) → Billable Qty correctly
- **ENHANCEMENT**: Labour Inactive State Visual Clarity
  - Added "Show inactive" toggle checkbox (only appears when inactive labourers exist)
  - Improved status badges: "✓ Active" (green) / "✗ Inactive" (red) with hover color transitions
  - Inactive labourers now show: strikethrough name + "Deactivated" badge + gray background
  - Count display improved: "15 active • 2 inactive" format
- **ENHANCEMENT**: Add Product / Override MRP button in Stickers & MRP
  - Renamed button from "Add MRP Override" to "Add Product / Override MRP" with tooltip
  - Products added via MRP overrides now appear in the Stickers list (even without day's indents)
  - Print function includes override-only products with quantity 0
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Print fix, dispatch modal fixes, alphabetical sorting, excess amount calculation, rejection display
  - `/app/frontend/src/pages/admin/LaborCosts.js` - Inactive state toggle, visual improvements
  - `/app/backend/routes/retailer_portal.py` - Invoice enrichment logic fix for item-level rejections


### June 13, 2025 - Retailer Portal Rejections & Admin Chart Defaults ✅
- **FEATURE**: Added Rejections tab to Retailer Portal hamburger menu (below Payment Ledger)
  - Same view modes as Admin: "By Invoice Date" and "By Recorded Date"
  - Date range filter for "By Recorded Date" view
  - Shows rejection history with expandable date rows
- **FEATURE**: Admin Retailer Orders charts now default to 12 weeks (84 days) instead of 30 days
  - User can still adjust dates to see different periods

### June 13, 2025 - Rejection Daily Summary & Payment Integration ✅
- **FEATURE**: Daily Rejection Summary View
  - New endpoint `/api/retailer-rejections/daily-summary` groups rejections by RECORDED date (created_at)
  - Frontend toggle: "By Invoice Date" (existing) vs "By Recorded Date" (new)
  - Shows: Recorded Date → Retailers → Products with qty, value, reason
  - Answers: "On June 12, what products were rejected and what was the total amount?"
- **BUG FIX**: Fixed missing `os` import in `backup_data.py` (caused sync errors)
- **BUG FIX**: Fixed missing `timedelta` import in `procurement_new.py` (broke Record Purchase historical data)
- **VERIFIED**: Rejection amounts already properly reflected in Payment Summary
  - Formula: `net_payable = (gross_value - rejection_amount) - commission`
  - Invoice items have `rejected_qty`, `billable_qty`, `amount` properly calculated
- **FILES MODIFIED**:
  - `/app/backend/routes/backup_data.py` - Added missing `os` import
  - `/app/backend/routes/procurement_new.py` - Added missing `timedelta` import
  - `/app/backend/routes/retailer_portal.py` - Added `/api/retailer-rejections/daily-summary` endpoint
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added view toggle and daily summary UI

### June 13, 2025 - Post-Refactoring Fixes & Auto-Indent Enhancements ✅
- **BUG FIX**: Fixed dashboard blank page after deployment
  - Missing startup functions: `seed_default_units_on_startup`, `seed_default_categories_types_on_startup`, `initialize_default_plans`
  - Added missing imports from `routes/retail_plans.py` and `routes/retailer_portal.py`
  - Fixed cross-module dependency: `calculate_grn_loss` imported from `qc_grn.py` to `dashboard_analytics.py`
- **FEATURE**: Historical Closing Inventory Filter
  - Added `filter_inactive` query parameter to `/api/retailer-closing-inventory/summary/{retailer_id}`
  - When `filter_inactive=true`, only returns products with non-zero opening OR non-zero closing quantities
  - Frontend `loadClosingHistory()` now uses this filter for historical dates
- **FEATURE**: Enhanced Auto-Indent Generation (Both Sales-Based and Plan-Based)
  - **Sales-Based Changes:**
    1. Removed 10% buffer - now uses exact historical average
    2. Subtracts closing inventory from historical average to get actual requirement
    3. Applies same timing logic: if closing < dispatch time, dispatch items added to closing
  - **Plan-Based Changes (already done):**
    1. Uses closing inventory with timing adjustment
    2. If closing < dispatch time, adds dispatch to get true ending inventory
  - **New Fields in Indent Documents:**
    - `generation_basis`: "sales" or "plan"
    - `closing_date_used`: Yesterday's date if closing was available
    - `dispatch_adjustment_applied`: Boolean indicating if dispatch was added
    - `last_closing_time`, `last_dispatch_time`: Timestamps used for timing comparison
  - **Remarks Format:** Now includes "(Closing: YYYY-MM-DD)" and "[Dispatch items added to closing]" when applicable
- **FILES MODIFIED**:
  - `/app/backend/server.py` - Added startup seed functions, filter_inactive parameter
  - `/app/backend/routes/dashboard_analytics.py` - Import calculate_grn_loss from qc_grn
  - `/app/backend/routes/retailer_portal.py` - Enhanced auto-indent with closing adjustment
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Use filter_inactive for historical closings

### June 13, 2025 - Backend Codebase Refactoring COMPLETE ✅
- **MASSIVE REFACTORING**: Extracted 18 route modules from `server.py`:
  - ✅ **Auth Routes** → `routes/auth.py`
  - ✅ **Labour Routes** → `routes/labour.py`
  - ✅ **Health Routes** → `routes/health.py` (~330 lines)
  - ✅ **User Routes** → `routes/users.py` (~170 lines)
  - ✅ **Farmer Routes** → `routes/farmers.py` (~50 lines)
  - ✅ **QC Orders & Customers** → `routes/qc_orders_customers.py` (~210 lines)
  - ✅ **QC Indents & Dispatches** → `routes/qc_indents_dispatches.py` (~570 lines)
  - ✅ **QC Invoices** → `routes/qc_invoices_new.py` (~130 lines)
  - ✅ **Products & Packaging** → `routes/products_packaging.py` (~850 lines)
  - ✅ **QC GRN** → `routes/qc_grn.py` (~1,200 lines)
  - ✅ **Retail Plans** → `routes/retail_plans.py` (~340 lines)
  - ✅ **Procurement** → `routes/procurement_new.py` (~1,020 lines)
  - ✅ **Retailer Orders/Wastage** → `routes/retailer_orders_wastage.py` (~300 lines)
  - ✅ **Expenses (Variable & Fixed)** → `routes/expenses_new.py` (~370 lines)
  - ✅ **Backup & Data Management** → `routes/backup_data.py` (~860 lines)
  - ✅ **Gmail Integration** → `routes/gmail_integration.py` (~480 lines)
  - ✅ **Dashboard & Analytics** → `routes/dashboard_analytics.py` (~4,420 lines)
  - ✅ **Retailer Portal** → `routes/retailer_portal.py` (~6,900 lines)
- **PROGRESS**:
  - `server.py` reduced from **20,841 to 2,845 lines** 
  - **-17,996 lines removed (86.3% reduction!)**
  - 18 active routers now extracted and wired up
- **TESTING**: All critical endpoint groups verified via comprehensive curl testing

### June 10, 2025 - Root Cause Fix: Variant Consistency in Auto-Generated Orders ✅
- **ROOT CAUSE FIX**: Auto-generated indents now use consistent variant IDs for Piece/Packet products
  - **`generate_auto_indents_for_tomorrow`** (line ~16371): 
    - Fetches retailer catalogue to check `purchase_unit` for each product
    - For `purchase_unit = "Piece"`: Sets `variant_id = "unit_piece"`, `variant_name = "Pieces"`
    - For `purchase_unit = "Packet"`: Sets `variant_id = "unit_packet"`, `variant_name = "Packets"`
    - Resolves any UUID variant_names to actual packaging names
  - **`generate_plan_based_indent`** (line ~16777):
    - Same logic applied - checks catalogue and overrides variants for Piece/Packet products
    - Also checks closing inventory with both original and normalized variant IDs
- **Migration Script Created**: `/app/backend/migrations/fix_uuid_variants.py`
  - Fixes existing `retail_plans`, `retailer_indents`, and `retailer_dispatches` collections
  - Resolves UUID variant_names to actual packaging names
  - Run manually in production: `cd /app/backend && python3 migrations/fix_uuid_variants.py`
- **FILES MODIFIED**:
  - `/app/backend/server.py` (generate_auto_indents_for_tomorrow, generate_plan_based_indent)
  - `/app/backend/migrations/fix_uuid_variants.py` (NEW)

### June 10, 2025 - Retailer Details & UUID Variant Resolution Fixes ✅
- **BUG FIX**: Retailer names now show when clicking on Piece/Packet products in Stickers & MRP
  - Issue: Key mismatch between aggregation key and lookup key
  - Fix: Items now store their `aggregationKey` and use it for retailer details lookup
- **BUG FIX**: UUID variants (Elaichi Banana, Muskmelon, etc.) now resolved in Daily P&L Dashboard
  - Added `packaging_id_to_name` lookup in P&L report
  - Added `resolve_variant_name()` helper to convert UUID → proper variant name
  - Applied to retail dispatch items in the P&L calculation
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js`:
    - `calculateStickersData()` - Items now store `aggregationKey`
    - Retailer details lookup uses `item.key` instead of hardcoded key format
  - `/app/backend/server.py`:
    - `get_pnl_report()` - Added packaging lookup and UUID resolution for variant names

### June 10, 2025 - Stickers & MRP: Catalogue-Based Variant Aggregation ✅
- **BUG FIX**: For products with `purchase_unit = "Piece"` or `"Packet"` in the Retailer Catalogue:
  - Retailer manual orders (using `unit_piece`/`Pieces`) now aggregated with system auto-generated orders (using weight variants like `250+ gm`)
  - Example: Broccoli "Pieces" (3) + Broccoli "250+ gm" (4) → Combined as "Broccoli: 7 Pieces of 250+ gm"
- **ENHANCEMENT**: Variant display now shows weight info for Piece/Packet products
  - Format: "Pieces of [weight]" or "Packets of [weight]" where weight comes from catalogue's `purchase_weight_variant`
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js`:
    - `calculateStickersData()` - Fetches catalogue, aggregates by `productId` only for Piece/Packet products
    - `loadMrpIndentProducts()` - Same catalogue-based aggregation logic

### June 10, 2025 - Stickers & MRP: Enhanced Dedup + MRP Overrides ✅
- **ENHANCEMENT**: Fixed `calculateStickersData` dedup logic
  - Dedup key now uses `product_id + canonical variant_id` (not name-based)
  - Resolves variants via packagings map using same normalization as Daily Purchase Requirement
  - Handles special `unit_piece`, `unit_packet`, and raw variant_name strings
  - Onion 500g and Onion 1000g stay as separate rows (different variants)
  - Button Mushroom across different spellings collapses to one row (same product)
- **NEW FEATURE**: Sticker MRP Overrides
  - New MongoDB collection `sticker_mrp_overrides` stores admin-defined MRPs
  - Add button to create new override (product + variant + MRP)
  - Pencil icon on each row to edit existing override
  - Override MRP column (purple) shows saved overrides
  - Overrides persist independently of indents/dispatches
- **ENHANCEMENT**: `/api/retailer-dispatches/yesterday-mrp` now prefers overrides
  - Checks `sticker_mrp_overrides` first, then falls back to dispatch MRP
  - Response includes `source: "override"` or `source: "dispatch"` field
  - This auto-populates the Dispatch flow with override MRPs
- **Backend Endpoints Added**:
  - `GET /api/sticker-mrp-overrides` - List all overrides
  - `POST /api/sticker-mrp-overrides` - Create/update override
  - `PUT /api/sticker-mrp-overrides/{id}` - Update specific override
  - `DELETE /api/sticker-mrp-overrides/{id}` - Delete override
- **Files Modified**:
  - `/app/backend/server.py` (lines 11286-11455 - yesterday-mrp + override endpoints)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (StickerMrpOverrideForm component, calculateStickersData rewrite, modal state, UI columns)

### June 10, 2025 - Today's Closing Summary: Date Query Bug Fix ✅
- **BUG FIX**: "Today's Closing Summary" section in Closing Inventory tab now correctly displays retailers
  - Root cause: MongoDB query used `$regex` on `dispatch_date` which didn't match ISO datetime strings stored in DB
  - Fix: Changed to use `$or` query combining regex pattern AND date range (`$gte`/`$lte`) for robust matching
  - Also added indents check: Retailers with today's indents (not just dispatches) now appear in summary
  - All 5 retailers (Jai Bhawani, Narang Super Mart, Park Way Mart, Savtamali, Tamanna Mart) now show as "Pending"
- **Files Modified**:
  - `/app/backend/server.py` (lines 19222-19244 - get_todays_closing_summary endpoint)

### June 10, 2025 - Daily Purchase Requirement: Enhanced Unit Handling ✅
- **ENHANCEMENT**: Added proper handling for `unit_piece` and `unit_packet` variant IDs
  - These special IDs are used for items sold by piece/packet but not in qc_packaging collection
  - Backend now resolves them to proper display names ("Pieces", "Packets")
  - Weight calculation improved: looks up catalogue purchase_weight for accurate Kg conversion
- **ENHANCEMENT**: Added `qty_pieces` and `qty_packets` tracking to API response
  - Frontend displays orange "Pcs" label for piece-based products
  - Frontend displays purple "Pkts" label for packet-based products
  - Shows contextual info like "Pcs of 500+ gm" for better procurement guidance
- **Files Modified**:
  - `/app/backend/server.py` (lines 19630-19820 - retailer-daily-requirement/calculate)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (lines 2928-2933, 7672-7716)

### June 9, 2025 - Auto Indent Edit: Missing Variant Fix ✅
- **BUG FIX**: Editing auto-generated indents no longer shows "Missing variant" error
  - Root cause: Sales-based auto indents stored `variant_name` but empty `variant_id`
  - Invoices (source data for sales-based indents) have `variant_name` but no `variant_id`
  - Fix: Backend now looks up `variant_id` from `variant_name` using qc_packaging table
- **Backend Changes**:
  - `POST /api/retailer-indents`: Resolves variant_id from variant_name before validation
  - `PUT /api/retailer-indents/{id}`: Same resolution logic applied
  - Sales-based auto indent generation: Looks up variant_id when creating indent items
- **Files Modified**:
  - `/app/backend/server.py` (create_retailer_indent, update_retailer_indent, generate_single_auto_indent)

### June 9, 2025 - Daily Purchase Requirement: Product Grouping & Dozen Math ✅
- **BUG FIX**: Daily Purchase Requirement now groups indents by PRODUCT (not variant)
  - Products with multiple variants (Onion 500g & 1kg, Bottle Gourd Pieces & 500g) appear as SINGLE rows
  - Variants are combined into a comma-separated string (e.g., "500+ gm, 1000+ gm")
  - Eliminates duplicate rows that caused procurement confusion
- **BUG FIX**: Banana dozen calculations now work correctly
  - Backend calculates `qty_dozens` based on variant multipliers: 1.0 for "1 Dozen", 0.5 for "Half Dozen"
  - Example: 6 units × 1 dozen + 6 units × 0.5 dozen = 9 dozens
  - Frontend displays yellow "Dozens" input field for products with `purchase_unit='Dozen'`
- **Testing**: All 11 backend tests + full frontend verification passed
- **Files Modified**:
  - `/app/backend/server.py` (lines 19550-19800 - retailer-daily-requirement/calculate endpoint)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (lines 2919-2935, 7670-7692)

### June 9, 2025 - Compact Collapsible Tables for Indent & Dispatch ✅
- **UI IMPROVEMENT**: Made Indent and Dispatch expanded tables more compact
  - Removed `w-full` to stop table from stretching to full width
  - Product, Variant, and Qty columns now closer together
  - Reduced cell padding from `p-1` to `px-1 py-0.5` for tighter rows
  - Set minimum widths to maintain readability on mobile
- **Parity**: Both Indent and Dispatch tabs now have identical compact table layouts
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (4 table updates - 2 for Indent, 2 for Dispatch)

### June 9, 2025 - Sync & Auto Indent Improvements ✅
- **BUG FIX**: Retail Plans now sync from Production to Preview
  - Added `retail_plans` collection to backup system (`COLLECTIONS_TO_BACKUP`)
  - Added to Excel sync sheet mapping (`sheet_to_collection`)
  - Added to direct API sync endpoints
  - Added to `/api/backup/status` and `/api/sync-status` responses
  - Added `products` field to JSON fields map for proper nested array handling
- **BUG FIX**: Variant names now display correctly in Auto Indent items
  - Fixed `RetailPlans.js` to lookup packaging names when adding products (was storing UUID as name)
  - Enhanced `getIndentVariantDisplay()` in `RetailerOrders.js` to detect and resolve UUID patterns
- **NEW FEATURE**: "Yest. Closing" column added to Plan Based indent view
  - Shows only for indents with `generation_basis === 'plan'`
  - Helps verify calculation: Plan Qty - Closing Qty = Ordered Qty
  - Column appears between Variant and Ordered columns
- **Files Modified**:
  - `/app/backend/backup_system.py`
  - `/app/backend/server.py` (sync endpoints, backup status)
  - `/app/frontend/src/pages/admin/RetailPlans.js`
  - `/app/frontend/src/pages/admin/RetailerOrders.js`

### June 9, 2025 - Attendance: Working Hours & Paid Leave Features ✅
- **NEW FEATURE**: Added configurable Working Hours for attendance
  - Default: 9 hours when marking present
  - Editable: Can change hours if labourer worked less (wages proportionally adjusted)
  - Formula: `payment = (daily_rate / 9) * working_hours + (overtime_rate * overtime_hours)`
- **NEW FEATURE**: Added Paid Leave checkbox column
  - Only available when labourer is NOT present
  - Paid leave days count as full day payment in calculations
  - Formula when paid_leave: `payment = daily_rate`
- **UI Changes** (Both Staff & Admin panels):
  - Added "WORKING HRS" column (editable input, default 9)
  - Added "PAID LEAVE" checkbox column (after OT hours)
  - Added "Paid Leave" summary card
  - Row highlighting: green for present, purple for paid leave
- **Files Modified**:
  - `/app/frontend/src/pages/staff/Attendance.js`
  - `/app/frontend/src/pages/admin/LaborCosts.js`
  - `/app/backend/routes/labour.py` (bulk save endpoint)

### June 9, 2025 - Rejection Chart Added to Retailer Earnings Block ✅
- **NEW FEATURE**: Added rejection trend chart to the Retailer Earnings section
  - Summary row now shows 4 metrics: Total Order Value, Total Earnings, Avg. Earning/Day, **Total Rejections** (with item count)
  - New **Rejections chart** (red) added alongside existing 3 charts
  - Uses the same date filter (Period) and view mode toggle (Daily/Weekly/Monthly)
  - Filters by selected retailer when one is chosen
  - Tooltip shows rejection value and item count per period
- **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`

### June 9, 2025 - Enhanced Auto Indent with Order Basis Selection ✅
- **NEW FEATURE**: Auto Indent modal now supports two generation modes:
  1. **Historical Sales Based** (default) - Calculates from last 7 identical weekdays + 10% buffer
  2. **Retail Plan Based** - Plan qty minus yesterday's closing inventory
- **UI Changes**:
  - Added "Order Basis" radio button selector in Auto Indent modal
  - Dynamic description text changes based on selected option
  - Color-coded: Purple for Sales-based, Green for Plan-based
- **Indent Tags**: Auto-generated indents now show two tags:
  - "Auto Generated" (purple) + "Sales Based" (amber) OR "Plan Based" (green)
- **Plan-based Logic**:
  - Validates retailer has subscribed plan with products
  - Requires closing inventory for previous day (mandatory)
  - Calculates pending qty = Plan qty - Closing qty
  - Only creates items with positive pending quantities
- **Backend**: New `generate_plan_based_indent()` function added
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Modal UI and state
  - `/app/backend/server.py` - `generate_single_auto_indent()` and new helper function

### June 8, 2025 - Credit Notes Grouped by Invoice Date in PDF (Verified) ✅
- **FEATURE VERIFIED**: Invoice PDF now displays credit note adjustments grouped by Original Invoice Date
  - Credit notes are organized under date headers (e.g., "30 May 2026", "29 May 2026")
  - Each group shows the Original Invoice Number (e.g., "SAV-INV-30MAY2026-001")
  - Rejection credit notes display product details: Product, Qty, Variant, Reason, Value
  - Excess Payment credit notes are clearly labeled and distinguished
  - Total adjustment amount shown per group and overall
- **Files Involved**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - `downloadInvoicePdf()` function with grouping logic
  - `/app/backend/server.py` - `/api/retailer-invoices` endpoint passes `original_invoice_number` in adjustments
- **Status**: Visually verified via PDF generation test

### June 8, 2025 - Stock Closing Matrix UI (Phase 2 of Automated Order System) ✅
- **NEW FEATURE**: Replaced the old complex Closing Inventory tab with a new matrix-style UI (like Retail Plans)
  - Shows ALL products from Retailer Catalogue grouped by category (collapsible)
  - User selects retailer and date, then clicks "Load" to view/enter stock closing
  - Shows Opening qty (from previous day's closing) and Closing qty input
  - Today's entries are editable, historical entries are view-only with "Items Sold" calculation
  - Save button appears only when there are changes and date is today
  - Summary footer shows total products, entries filled, and total closing stock
  
- **State Variables Added**:
  - `stockClosingCatalogue` - Parsed retailer catalogue for stock closing
  - `stockClosingData` - Map of { productId_variantId: closingQty }
  - `stockClosingOpeningData` - Map of opening quantities
  - `stockClosingExpandedCats` - Expanded categories
  - `stockClosingHasChanges` - Track unsaved changes
  - `stockClosingSaving` - Loading state for save
  
- **Functions Added**:
  - `loadStockClosingData()` - Loads catalogue and existing closing data
  - `saveStockClosing()` - Saves closing entries to backend
  - `getStockClosingVariantName()` - Resolves variant names from packagings
  - `stockClosingCategories` - Computed memo for category list
  - `stockClosingCatalogueByCategory` - Computed memo for grouped catalogue
  
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Replaced Closing Inventory tab with new matrix UI

### June 8, 2025 - Retail Plans Matrix Improvements (P0) ✅
- **FIXES Applied** (5 issues reported by user):
  1. **Saved Quantities Not Visible** - Fixed by properly resetting `hasChanges` flag after loadData and ensuring planProducts map rebuilds correctly from API response
  2. **Customer Display Variants** - Now shows ALL variants from catalogue (matching what's shown in Products > Retailer Catalogue) with proper names from packagings lookup
  3. **Variant Names** - Added `getVariantDisplayName` function that looks up variant names from `qc-packaging` API (e.g., "250+ gm", "200 gm Packet" instead of truncated UUIDs)
  4. **Users Icon Too Small** - Increased icon size from 10px to 14px and added hover styling for better visibility
  5. **Backspace Not Working** - Changed from `<Input type="number">` to native `<input type="text" inputMode="decimal">` with proper onChange/onBlur handlers that allow empty strings and backspace
  
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailPlans.js` - Major update to load packagings, display all variants, fix input handling

### June 8, 2025 - Catalogue Variants Parsing Fix (P0) ✅
- **BUG FIX**: Retailer Catalogue category expansion error and multiple variants in Retail Plans
  - **Root Cause**: The backend stores `variants` and `purchase_weights` as **string representations** of arrays (e.g., `"['unit_packet', 'e185c5d8-...']"`) instead of actual arrays. Frontend code was trying to call array methods (`.filter()`, `.reduce()`) on these strings, causing crashes.
  - **Fix Applied**: Added parsing logic in 4 locations to convert string variants to proper arrays:
    1. `/app/frontend/src/pages/retailer/Dashboard.js` - loadData function parses catalogue variants
    2. `/app/frontend/src/pages/admin/RetailerOrders.js` - loadBaseData function parses catalogue variants
    3. `/app/frontend/src/pages/admin/RetailerOrders.js` - startClosingEntry function parses closing catalogue variants
    4. `/app/frontend/src/pages/admin/RetailPlans.js` - loadData function parses catalogue variants
  - **Files Modified**: 
    - `/app/frontend/src/pages/retailer/Dashboard.js`
    - `/app/frontend/src/pages/admin/RetailerOrders.js`
    - `/app/frontend/src/pages/admin/RetailPlans.js`
  - **Result**: Category expansion now works correctly, and Retail Plans matrix shows proper single variant per product based on `purchase_unit`


### June 7, 2025 - Retailer Earnings Dashboard Enhancement ✅
- **ENHANCEMENT**: Improved "Your Earnings" section in Retailer Portal
  - **Default Date Range**: Now defaults from first order date to today (instead of last 30 days)
  - **Average Earnings Per Day**: Added new metric showing total earnings divided by number of days with orders
  - **UI Display**: Shows "Avg. Per Day: ₹X (Y days with orders)"
  - **Trend Charts**: Added 2 area charts:
    1. **Daily Orders Trend** - Blue gradient showing order count per day
    2. **Daily Earnings Trend** - Green gradient showing earnings per day
  - Charts update based on selected date range
  - Date Pickers still available for custom filtering
- **Files Modified**: `/app/frontend/src/pages/retailer/Dashboard.js`
- **Library Used**: recharts (already installed)

### June 7, 2025 - Admin Indent "Piece" Variant Dropdown Fix ✅
- **BUG FIX**: Admin/Staff Indent Form was missing "Piece" variants (e.g., Bottle Gourd, Cauliflower, Cabbage)
  - **Issue**: When Admin/Staff created an indent on behalf of a retailer, products with "Piece" unit type (like Bottle Gourd) were not showing their variants in the dropdown
  - **Root Cause**: The variant dropdown filtered from `packagings` (QC packaging) which only contains weight-based variants. Piece products use synthetic variants like `unit_piece` stored in the retailer catalogue's `variants` array
  - **Fix Applied**:
    1. Created `getVariantsForProduct()` function that looks up the product's catalogue entry
    2. Parses catalogue variants (handles both array and string-encoded array formats)
    3. Adds `unit_piece`/`unit_packet` synthetic variants when present
    4. Includes standard weight-based packagings from the catalogue
    5. Falls back to filtered packagings if no catalogue entry found
  - **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`
  - **Result**: Selecting Bottle Gourd now shows "Pieces" and "500+ gm" in the variant dropdown


### June 5, 2025 - Rejection Loss Date Filter Fix ✅
- **BUG FIX**: Rejection Loss block amount not updating when date range changed
  - **Root Cause**: The dispatches data (`allDispatchesForRejection`) was only loaded when the modal opened, not when dates changed on the main block
  - **Fix Applied**: Added a new useEffect that loads dispatches whenever `rejectionLossDateFrom` or `rejectionLossDateTo` changes, even when the modal is closed
  - **Result**: Now changing dates on the Rejection Loss block will properly update the displayed values
- **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`

### June 5, 2025 - Invoice Rejection Sync Fix ✅
- **BUG FIX**: Rejections not syncing to invoice line items
  - **Root Cause**: Invoice items had `variant_id: 'None'` (string) while rejections had proper variant IDs. The matching logic tried `variant_id` first but didn't find matches.
  - **Fix Applied**: Updated `sync_invoice_rejection_amount()` to use dual-key matching:
    1. First try exact match: `product_id + variant_id`
    2. Fallback to: `product_id + variant_name`
  - **Result**: 19 out of 20 Narang rejections now sync correctly to invoice items
- **Files Modified**: `/app/backend/server.py` - Updated sync function

### June 5, 2025 - Rejection Delete Cascades to Credit Note ✅
- **NEW FEATURE**: When a rejection is deleted, its linked credit note is automatically handled:
  - If credit note hasn't been adjusted (used) → Credit note is **deleted**
  - If credit note has been partially/fully adjusted → Credit note is **voided** (amount set to 0)
  - Confirmation dialog updated to warn about linked credit note
  - Success message shows credit note action taken
  - Credit notes list auto-refreshes after rejection deletion
- **Files Modified**:
  - `/app/backend/server.py` - Updated `delete_retailer_rejection` endpoint
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Updated confirmation and refresh

### June 5, 2025 - Credit Notes Product Details Fix Button ✅
- **NEW FEATURE**: Added "Fix Product Details" button in Admin Credit Notes tab
  - Located in Credit Notes tab header (orange button with wrench icon)
  - Click to backfill missing product-level details (qty, rate, amount) for all credit notes
  - Uses the linked rejection records to populate missing details
  - Shows success message with count of fixed credit notes
- **Files Modified**:
  - `/app/backend/server.py` - Added `/api/retailer-credit-notes/backfill-rejection-details` endpoint
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added button and handler

### June 5, 2025 - Reimbursement Modal Bug Fix ✅
- **BUG FIX**: Reimbursement popup was showing full purchase amount instead of employee's actual paid amount
  - **Issue**: For Riva Vegetable purchase (₹11,065.75 total), when Devendra paid only ₹8,000, the modal incorrectly showed "Employee Paid: ₹11,065.75" and pre-filled ₹11,065.75 as reimbursement amount
  - **Root Cause**: Modal used `total_amount` instead of `paid_amount`
  - **Fix Applied**:
    1. `openSettlementModal()` now uses `paid_amount` (what employee actually paid)
    2. Modal "Employee Paid" display shows `paid_amount`
    3. Added "Pending (to farmer)" line when there's remaining balance
    4. "Full Amount" button now sets to `paid_amount` not `total_amount`
  - **Files Modified**: `/app/frontend/src/pages/admin/Procurement.js`
  - **Result**: Modal now correctly shows ₹8,000 for Employee Paid and pre-fills ₹8,000 as reimbursement amount

### June 5, 2025 - Invoice Print Enhancements ✅
- **NEW FEATURE**: Storage Type shown on Invoice Print
  - Each product line now shows "(Storage - Outdoor)" or "(Storage - Fridge)" below the item name
  - Color coded: Fridge = blue text, Outdoor = amber text
  - Applied to both Admin and Retailer portal invoice printing
- **NEW FEATURE**: Language Selection for Invoice Print (Admin Portal)
  - When clicking download/print button, a dialog appears to select language
  - Options: English, Hindi (हिं), Marathi (मरा)
  - Only product names are translated, rest remains in English
  - Note displayed explaining translation scope
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added language dialog, storage type display
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Added storage type display, Marathi support

### June 5, 2025 - Storage Type Field for Products ✅
- **NEW FEATURE**: Added Storage Type field to products
  - Options: "Outdoor" (default), "Fridge"
  - New column in Products table (after Type column)
  - Field in Add/Edit Product form
  - Outdoor = amber badge, Fridge = blue badge
- **BULK EDIT**: Added "Bulk Edit Storage" dialog
  - Quick Set All buttons: "All Outdoor" / "All Fridge"
  - Individual dropdown for each product
  - Summary showing count by type and pending changes
  - Saves only changed products
- **MIGRATION**: Set default storage_type="Outdoor" for all 91 existing products
- **Files Modified**:
  - `/app/backend/models.py` - Added storage_type field to Product, ProductCreate, ProductUpdate
  - `/app/backend/server.py` - Added bulk-update-storage and set-default-storage endpoints
  - `/app/frontend/src/pages/admin/Products.js` - Added column, form field, bulk edit dialog

### June 5, 2025 - Admin Credit Notes Retailer Filter Fix ✅
- **BUG FIX**: Credit Notes section in Admin portal retailer filter not syncing
  - **Issue**: When selecting a retailer from the top dropdown, Credit Notes section had its own separate dropdown showing "All Retailers"
  - **Root Cause**: Credit Notes section used `creditNoteFilter.retailer` state separate from page-level `selectedRetailer`
  - **Fix Applied**:
    1. Removed duplicate retailer dropdown from Credit Notes section
    2. Now uses page-level `selectedRetailer` which triggers API call with `retailer_id` filter
    3. Shows selected retailer as a purple tag when filtered
    4. Fixed retailer count display to use `retailer_id` instead of `retailer_name`
  - **Files Modified**:
    - `/app/frontend/src/pages/admin/RetailerOrders.js`
  - **Result**: Selecting "Savtamali" from top dropdown now correctly shows only 18 credit notes (was showing all 129)

### June 5, 2025 - Critical Fix: Rejection Qty Validation ✅
- **BUG FIX**: Rejection quantity was exceeding supplied quantity
  - **Root Cause 1**: Frontend history lookup used only `product_id`, not `product_id+variant_id` - caused wrong "already rejected" calculation for products with variants
  - **Root Cause 2**: Backend had NO validation - allowed any rejection qty regardless of supplied qty
  - **Fix Applied**:
    1. **Backend**: Added validation in `POST /api/retailer-rejections` that:
       - Fetches supplied qty from `retailer_dispatches` for the specific product+variant+date
       - Fetches existing rejections for the same product+variant+date  
       - Rejects if `new_qty + already_rejected > supplied_qty`
       - Returns clear error message: "Rejection qty (X) exceeds maximum allowed (Y). Supplied: Z, Already rejected: W"
    2. **Backend**: Updated `POST /api/retailer-rejections/history-batch` to return both:
       - Product-level aggregation (by product_id)
       - Product+Variant-level aggregation (by "product_id|variant_id")
    3. **Frontend**: Updated history lookup to use composite key "product_id|variant_id" for precise tracking
    4. **Models**: Added `variant_id` field to `RetailerRejection` and `RetailerRejectionCreate`
  - **Files Modified**:
    - `/app/backend/server.py` - Validation in create endpoint, history-batch update
    - `/app/backend/models.py` - Added variant_id field
    - `/app/frontend/src/pages/admin/RetailerOrders.js` - Composite key lookup
  - **Data Cleanup**: Deleted 38 duplicate rejection records for Narang Super Mart (Jun 3)
  - **Test Results**: 
    - Reject > supplied → BLOCKED ✅
    - Reject within limit → ALLOWED ✅
    - Reject again exceeding remaining → BLOCKED ✅

### June 4, 2025 - Credit Notes on Retailer Portal ✅
- **NEW FEATURE**: Credit Notes Tab for Retailer Portal
  - Added "Credit Notes" menu item in hamburger menu (below Payment Ledger)
  - Summary blocks showing: Total Issued, Adjusted, Pending amounts
  - Date-wise collapsible list showing credit amount per date
  - Expandable details showing: Invoice #, Product, Qty, Rejection Date, Amount, Adjusted, Pending
  - Handles both detailed rejection items and simple credit notes
- **API Added**: `GET /api/retailer-credit-notes/my-summary`
  - Returns summary totals and date-wise grouped credit notes
  - Automatically filters by logged-in retailer's ID
- Files Modified:
  - `/app/backend/server.py` - Added `my-summary` endpoint
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Added Credit Notes tab

### June 4, 2025 - Paid By Filter Fix for Legacy Data ✅
- **BUG FIX**: Procurement Page "Paid By" Filter
  - **Issue**: Filter only showed ~9 results for Devendra Shukla, but he had 29 payments
  - **Root Cause**: Legacy data stored employee name (`paid_by`) but no `paid_by_employee_id`
  - **Solution**: Updated filter logic to match by employee NAME as fallback for legacy data
  - **Changes Made**:
    1. Backend: Added `payments` array to procurement API response (includes all payments from `procurement_payments` collection)
    2. Frontend: Filter now checks both procurement-level `paid_by_employee_id` AND individual payments array
    3. Frontend: Filter uses employee name matching for legacy data without employee ID
    4. Frontend: `paidByEmployees` dropdown now includes all employees who have ever paid (with/without ID)
  - **Results**: Filter by "Devendra Shukla" now shows 29 results (was 9), including:
    - 17 from Riva Vegetable
    - 6 from Samsuddin  
    - 4 from Shewalwadi Market
    - 1 from Anand Gaikwad
    - 1 from Shri Enterprises
- Files Modified: 
  - `/app/backend/models.py` - Added `ProcurementPaymentItem` model and `payments` field to `Procurement`
  - `/app/backend/server.py` - Enhanced `GET /api/procurement` to include payments array
  - `/app/frontend/src/pages/admin/Procurement.js` - Updated filter logic and employee extraction

### June 2, 2025 (Session 12) - Closing Inventory Enhancement & Auto Indent Fix

#### Closing Inventory - New Entry Mode ✅
- **NEW FEATURE**: Simplified Closing Inventory Entry
  - When user selects retailer and clicks "New Entry", products from last supply auto-populate
  - Pre-populated with last dispatch items (product name, variant)
  - "Add Product" modal to add more products not in last supply
  - Simple quantity entry and save
  - View previous dates' closing by changing date and clicking "Load"
- **API Added**: `GET /api/retailer-closing-inventory/last-supply/{retailer_id}`
  - Returns items from most recent dispatch for the retailer
  - Used to pre-populate closing inventory form
- **UI Changes**:
  - New "New Entry" button alongside "Load" button
  - Entry mode shows blue info banner with retailer name and last supply date
  - Table with # | Product | Variant | Closing Qty | Action columns
  - "Add Product" modal with search and variant selection
  - Cancel and Save Closing buttons
- Files: `/app/backend/server.py` (lines 18288-18349), `/app/frontend/src/pages/admin/RetailerOrders.js`

#### Auto Indent - Smart Weight Clustering V3 ✅
- **FIX**: Auto Indent Generation Logic - Smart Weight Clustering
  - Four-tier weight grouping: DB lookup → Name extraction → Bucket normalization → Close weight merging
  - Added `merge_close_weight_variants()` - Combines variants within 300g of each other
  - Results: Tamanna Mart reduced from 64 to 46 items
  - Different weight categories (500g vs 1000g) correctly kept separate
- Files: `/app/backend/server.py` (lines 14785-14935, 15118-15145, 15363-15377)

### June 2, 2025 (Session 11) - Image Storage Migration & Expense Improvements
- **MIGRATION**: Product Images - Base64 to Filesystem ✅
  - Migrated 68 product images from MongoDB base64 to `/app/uploads/products/`
  - Images auto-compressed and resized to max 800×800 pixels
  - Converted to WebP format (85% quality) for optimal file size
  - New upload endpoint accepts up to 10MB, outputs ~20-50KB WebP
  - Migration API: `POST /api/products/migrate-images` (admin only)
  - Files: `/app/backend/server.py` (compress_and_convert_image function, upload/delete/migrate endpoints)

- **ENHANCEMENT**: Bulk Payment - Editable Amount & Auto-Allocation ✅
  - Added editable payment amount field in Bulk Payment modal
  - Payment auto-allocates to oldest entries first (sorted by date)
  - Shows real-time allocation preview with partial/full payment indicators
  - Transaction reference now mandatory for non-cash payments (UPI, Bank, Cheque)
  - "Full Amount" button to quickly fill total pending
  - Files: `/app/frontend/src/pages/admin/Procurement.js`

- **ENHANCEMENT**: Variable Expenses - Validations & Settle Feature ✅
  - "Paid To (Vendor)" field is now mandatory
  - Transaction Reference mandatory for non-cash payments
  - When "Retail Only" vertical selected, shows Retailer dropdown (All/Specific retailer)
  - New "Settle" button in header opens vendor bulk payment modal
  - Vendor Payment Modal: Select vendor → See pending amount → Enter custom amount → Auto-allocate oldest first
  - **Employee Reimbursement Modal Redesigned**: Now matches vendor payment design
    - Editable reimbursement amount with "Full Amount" button
    - Real-time allocation preview showing which expenses will be settled (oldest to newest)
    - Transaction Reference mandatory for non-cash payments (Bank Transfer, UPI, Cheque)
    - Shows remaining pending after partial reimbursement
  - Files: `/app/frontend/src/pages/admin/VariableExpenses.js`

- **ENHANCEMENT**: Procurement - Employee Bulk Reimbursement ✅
  - Redesigned "Pending Employee Reimbursements" section
  - Groups pending procurements by employee with individual "Settle" buttons
  - Employee Reimbursement Modal (same design as Variable Expenses):
    - Shows total pending reimbursement for the employee
    - Editable amount with "Full Amount" button
    - Real-time allocation preview (oldest procurement first)
    - Transaction Reference mandatory for non-cash payments
    - Shows remaining after partial reimbursement
  - Files: `/app/frontend/src/pages/admin/Procurement.js`

### June 2, 2025 (Session 10 Cont.) - Performance, Credit Notes & UI Updates
- **OPTIMIZATION**: Retailer Create Order Page Load Time ✅
  - **Before**: Loaded all 85 products + 32MB of base64 images in one request
  - **After**: Categories load instantly (~46KB), images load on-demand when expanded
  - New API: `/api/products/images?ids=...` for lazy image loading
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/retailer/Dashboard.js`

- **NEW FEATURE**: One-Click Credit Note for Excess Payments ✅
  - When retailer has "Excess Paid" status, a "CN" button appears
  - One click creates a credit note for the exact excess amount
  - New API: `POST /api/retailer-credit-notes/from-excess`
  - Files: `/app/backend/server.py` (~line 11550), `/app/frontend/src/pages/admin/RetailerOrders.js`

- **ENHANCEMENT**: Payment Details Block - Credit Notes Display ✅
  - **Admin Portal**: Added Credit Notes card (3rd card) showing pending credit amount
  - **Admin Portal**: Total now shows net payable after credit adjustment
  - **Retailer Portal**: Renamed to "Pending Payment Details"
  - **Retailer Portal**: Changed color scheme from green to blue/indigo
  - **Retailer Portal**: Shows credit notes sum and net payable after adjustment
  - Credit notes now fetched for ALL retailers (not just 100% upfront)
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`, `/app/frontend/src/pages/retailer/Dashboard.js`, `/app/backend/server.py`

### June 1, 2025 (Session 10) - Stability & Login Improvements
- **FIX**: Retailer Portal Crash Prevention ✅
  - Changed `Promise.all` to `Promise.allSettled` in `loadData()` function
  - Added automatic retry mechanism (up to 3 attempts with exponential backoff)
  - Dashboard now loads gracefully even if some APIs fail
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (lines 307-380)

- **FIX**: LazyImage Component Improvements ✅
  - Added `isMounted` ref to prevent React state updates on unmounted components
  - Added fallback for browsers without IntersectionObserver support
  - Better error handling with try/catch around observer creation
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (lines 22-110)

- **FIX**: Login - Case-Insensitive Email ✅
  - Email login now works regardless of case (e.g., "TEST@GMAIL.COM" matches "test@gmail.com")
  - Uses MongoDB regex with case-insensitive flag
  - Files: `/app/backend/server.py` (login function ~line 845)

- **FIX**: Login - Phone Number Normalization ✅
  - Users can now login with phone number in ANY format:
    - Just 10 digits: `9876543210`
    - With +91 prefix: `+919876543210`
    - With spaces: `+91 98765 43210`
    - With 91 prefix (no plus): `919876543210`
  - Uses MongoDB aggregation to normalize stored contacts during comparison
  - Files: `/app/backend/server.py` (login function ~line 845)

- **NEW**: Contact Normalization Endpoint ✅
  - Added `/api/users/normalize-contacts` endpoint for admin to normalize all existing user contacts and emails
  - Removes spaces, dashes, and +91 prefix from contacts
  - Converts emails to lowercase
  - Files: `/app/backend/server.py` (~line 1050)

- **IMPROVEMENT**: User Creation/Update Normalization ✅
  - New users' contact numbers are now normalized on creation
  - Emails are stored in lowercase for consistent searching
  - Files: `/app/backend/server.py` (create_user, update_user functions)

### June 1, 2025 (Session 9) - Part 2
- **FEATURE**: Partial Reimbursement for Employee-Paid Procurements ✅
  - Added editable "Reimbursement Amount" field to settlement modal
  - Supports partial reimbursement (any amount up to or exceeding paid amount)
  - Creates employee credit when reimbursement exceeds purchase amount
  - Shows "Full Amount" quick-fill button
  - Displays real-time credit calculation in modal
  - Files: `/app/frontend/src/pages/admin/Procurement.js` (lines 206-225, 998-1040, 4137-4230)

- **FEATURE**: Expandable Farmer-wise Date Summary in Pending Payments ✅
  - Click farmer name or chevron icon to expand row
  - Shows date-wise purchase breakdown: Date | Purchase Amount | Paid | Pending | Pay Amount
  - Checkboxes for selecting individual purchases
  - Editable partial payment amounts per purchase
  - "Pay Selected" button appears when dates are selected
  - Shows totals row at bottom
  - Files: `/app/frontend/src/pages/admin/Procurement.js` (lines 3291-3596)

- **FEATURE**: Bulk Payment Tracking & Display ✅
  - Updated Bulk Payment Modal to show date-wise breakdown
  - Shows "(Partial)" indicator for partial amounts
  - Displays total payment amount with summary
  - Records payment reference against all selected purchases
  - Added `bulk_payment_reference`, `last_payment_reference`, `last_payment_mode` fields
  - Shows "Bulk Payment" badge on paid dates
  - Files: `/app/frontend/src/pages/admin/Procurement.js` (lines 1703-1757, 4070-4160)

### June 1, 2025 (Session 9)
- **FIX**: Retailer Portal Product Images ✅
  - Fixed API call to include `include_images=true` parameter
  - Catalogue API now correctly returns image_url field
  - Note: Products don't have images uploaded yet (showing placeholder icons is correct behavior)
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (line 303)

- **FEATURE**: Staff Attendance Enhancements ✅
  - **Date Restriction**: Date picker now limited to current month and last month only
    - Shows "(Editable: current & last month)" helper text
    - Uses min/max attributes on date input
  - **Daily Hours Column**: Renamed "WORKING HRS" to "DAILY HOURS"
    - Default value: 9 hours
    - Editable per labourer (range 0-12, step 0.5)
    - Appears before OT Hours column as requested
  - **Daily Hours Summary Card**: New purple summary card showing total daily hours
    - Added to the 4-card summary grid (Total, Present, Daily Hrs, OT Hours)
  - **Wage Calculation**: Daily hours affects wage calculation (hourly_rate × daily_hours)
  - Files: `/app/frontend/src/pages/admin/LaborCosts.js`, `/app/backend/routes/labour.py`

## Changelog (May 2025)

### May 29, 2025 (Session 8) - Part 5
- **FEATURE**: Payment Ledger in Admin Panel ✅
  - Added "Payment Ledger" button in Admin → Retailer Orders → Invoices tab (after Payment Summary)
  - Requires retailer selection first
  - Opens modal with same functionality as Retailer Portal:
    - Date range filter
    - Summary cards: Total Received, Credit Notes Applied, Total Transactions
    - Date-wise payment list (grouped by reference number)
    - Expandable dates showing invoice adjustments and credit notes
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

### May 29, 2025 (Session 8) - Part 4
- **FEATURE**: Payment Ledger Section in Retailer Portal ✅
  - Added "Payment Ledger" option in hamburger menu (between My Orders and Closing)
  - Shows all payments received from retailer, grouped by date
  - Payments with same reference number are summed and shown as one amount
  - Click on any date to expand and see:
    - Payment groups (by reference number) with mode and total amount
    - Which invoices each payment was adjusted against
    - Credit notes applied on that date
  - Date range filter to select custom period
  - Summary cards: Total Received, Credit Notes Applied, Total Transactions
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js`, `/app/backend/server.py`
  - New API: `GET /api/retailer-payment-ledger`

### May 29, 2025 (Session 8) - Part 3
- **FEATURE**: Complete Payment Details in Invoice PDF ✅
  - Downloaded invoice PDF now shows detailed payment history table:
    - Columns: #, Date, Mode, Reference, Amount
    - Total Paid row at bottom
  - Shows Credit Notes Applied section if any credits were used:
    - Columns: Credit Note #, Original Invoice, Applied Date, Amount
    - Total Credit Applied row at bottom
  - Payment mode and reference numbers now visible in PDF
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (downloadInvoicePdf function)

- **FEATURE**: Complete Payment Details in Expanded Invoice View ✅
  - Expanded invoice view now shows detailed payment history table (same format as PDF)
  - Credit Notes section fetches data dynamically when invoice is expanded
  - Shows: Credit Note #, Original Invoice, Applied Date, Amount in table format
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (toggleInvoiceExpand function updated to async)

### May 29, 2025 (Session 8) - Part 2
- **FEATURE**: "Excess Paid" Status Badge ✅
  - Invoices where `paid_amount > net_payable` now display:
    - Purple animated "Excess Paid" badge in the STATUS column
    - Pending column shows excess amount in purple (e.g., "₹288.25 excess")
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Credit Notes in Payment Details Modal ✅
  - "View Payment" modal now shows **Credit Notes Applied** section
  - Displays: Credit Note #, Original Invoice, Amount applied, Date applied
  - Both Admin panel (Payment History Modal) and Edit Invoice Modal updated
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Delete Credit Note Adjustments ✅
  - Edit Invoice modal now shows credit notes with delete option
  - New backend API: `POST /api/retailer-credit-notes/{credit_note_id}/remove-adjustment`
  - Removes credit adjustment and restores pending amount to credit note
  - Updates invoice paid_amount and payment status accordingly
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Invoice PDF with Payment Details ✅
  - Retailer invoice PDF now includes Payment Details section when paid:
    - Shows: Amount Paid, Payment Date, Payment Mode, Balance
    - Paid invoices show green "PAID" badge
    - Pending invoices show orange "PENDING" warning
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js`

- **FEATURE**: Payment Summary Button on Retailer Portal ✅
  - Added "Summary" button in Payment Details block header
  - Opens modal with SAME format as Admin panel:
    - Table columns: #, Date, Invoice #, Gross, Reject, MRP, Comm., Payable, Paid, Net Due
    - Green TOTAL footer row with all column sums
    - Net Receivable display at bottom
    - Download CSV button for export
    - Back button to close modal
  - New backend API: `GET /api/retailer-payment-summary` returns full invoice breakdown
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/retailer/Dashboard.js`

### May 29, 2025 (Session 8)
- **FEATURE**: Retailer Portal - 100% Upfront Payment Block ✅
  - For retailers with `upfront_collection_percentage = 100`, the Payment Details block now shows:
    - Purple/blue gradient theme (vs. green for standard retailers)
    - "(100% Upfront)" label in header
    - Two expandable cards: **Total Payable** and **Credit Notes**
    - Total Payable shows net amount after credit notes applied
    - Credit Notes shows pending credits with count
    - Date-wise breakdown when "Total Payable" is expanded (clickable to view item details)
    - Credit note details when "Credit Notes" is expanded
  - Standard retailers (50% upfront) retain the original layout with "50% Upfront" and "Final Payment" columns
  - Mobile-responsive design with optimized touch targets and text sizes
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js`

- **BACKEND**: Updated APIs for 100% Upfront Support ✅
  - `/api/retailer-dashboard` now returns `upfront_collection_percentage` in retailer info
  - `/api/retailer-payment-details` now includes:
    - `upfront_collection_percentage` and `is_full_upfront` flags
    - `credit_notes` array for 100% upfront retailers
    - `totals.total_pending_credit` and `totals.net_payable` for credit-adjusted amounts
    - Correct upfront calculation: 100% upfront shows ALL pending as immediately due
  - Files: `/app/backend/server.py`

### May 28, 2025 (Session 7)
- **FIXED**: 100% Upfront Retailers Payment Calculation ✅
  - Backend APIs (`get_retailer_immediately_payable`, `get_all_retailers_immediately_payable`) now respect `upfront_collection_percentage`
  - For 100% upfront retailers: Full pending amount is due immediately on delivery (no 5-day credit split)
  - For standard retailers: Original 50% upfront + 5-day credit period logic preserved
  - Files: `/app/backend/server.py`

- **FEATURE**: Daily Purchase PDF - Category Segregation ✅
  - PDF now groups items by category: **Vegetables, Fruits, Exotic, Sprouts**
  - Each category shows:
    - Category header with item count
    - Items table with Serial #, Product Name, Purchase Req, Remarks
    - Category subtotal
  - Grand total shown at bottom
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Combined "Stickers & MRP" Tab ✅
  - Merged separate Stickers and MRP tabs into single "Stickers & MRP" tab
  - Table columns: **S No, Product, Variant, Sticker Quantity, MRP (₹), Blinkit (₹), Actions**
  - Sticker Qty shown in blue, pulled from indent data
  - Retained all MRP functionality: Copy from Previous Date, Fetch Blinkit Prices, Save MRP
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **IMPROVED**: Stock Status Error Handling ✅
  - Added detailed error messages showing actual failure reason
  - Added 30-second timeout for API calls
  - Files: `/app/frontend/src/pages/admin/StockStatus.js`

### May 27, 2025 (Session 6)
- **FEATURE**: Retailer Payment & Invoicing Upgrade - Credit Notes System ✅
  - **Credit Note Creation**: Generate credit notes from rejections against old invoices
  - **Models Added**: `RetailerCreditNote` with fields: credit_note_number, retailer_id, original_invoice_id, rejection_id, amount, status (pending/partial/adjusted), adjusted_amount, pending_amount, adjusted_against_invoices
  - **API Endpoints**:
    - `GET /api/retailer-credit-notes` - List all credit notes with filters
    - `GET /api/retailer-credit-notes/pending/{retailer_id}` - Get pending credits for payment
    - `POST /api/retailer-credit-notes` - Create credit note from rejection
    - `PUT /api/retailer-credit-notes/{id}` - **Edit credit note** (amount, remarks)
    - `POST /api/retailer-credit-notes/adjust` - Adjust credits against invoice
    - `DELETE /api/retailer-credit-notes/{id}` - Delete pending credit note
  - **Payment with Credit Adjustment**: 
    - `POST /api/retailer-invoices/{invoice_id}/payment` now accepts `credit_adjustments` array
    - Automatically updates credit note status and links to adjusted invoice
    - Payment record tracks: cash amount, credit applied, total settled, credit adjustments
  - **Auto Credit Note Generation** (NEW):
    - For **100% upfront retailers**, rejections automatically generate credit notes
    - Credit note is linked to the rejection's invoice
    - Toast notification shows auto-generated CN number and amount
    - Credit notes marked with `auto_generated: true` flag
  - **UI Components**:
    - **Credit Notes Tab** in Retailer Orders: Summary cards (Total Issued, Pending, Adjusted, Count) + table with all credit notes
    - **Payment Modal Enhancement**: "Available Credit Notes" section with checkboxes to select credits, amount input, "Total Credit Applied" summary
    - **Create Credit Note Button** in Rejections tab (CreditCard icon)
    - **Credit Note Creation Modal**: Shows rejection details, associated invoice, and creates credit note
    - **Edit Credit Note Modal** (NEW): Edit amount and remarks, shows rejection details, auto-generated indicator
    - **Edit/Delete buttons** in Credit Notes table (Edit visible for pending/partial, Delete only for pending)
  - Files: `/app/backend/server.py`, `/app/backend/models.py`, `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Upfront Collection Percentage ✅
  - Added `upfront_collection_percentage` field to User model (default 50% for retailers)
  - DB migration script on startup patches existing retailers with 50% default
  - Supports 100% upfront collection workflow where rejections generate credit notes

### May 25, 2025 (Session 5)
- **FEATURE**: Full Production Sync with Images ✅
  - New "Full Sync with Images" feature under Data Backup page
  - **Sync Modes**: Merge/Update (keep existing, update/add new) OR Replace All (fresh import)
  - **Include Images**: Option to sync all product images from production
  - Syncs ALL collections: products, retailers, indents, dispatches, invoices, catalogue, etc.
  - API: `POST /api/sync-from-production-full`
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/admin/Backup.js`

- **FIXED**: Dispatch Issues ✅
  - "Done" checkbox auto-checks when "Fill All Quantities" is clicked
  - Dispatch items now match correctly by `product_id` only (consistent with backend)
  - Fixed issue where unit-based variants (Pieces/Packets) weren't matching dispatches

- **FIXED**: Indent Variant Display for Pieces/Packets ✅
  - Now shows weight info: "Pieces (500+ gm)" instead of just "Pieces"
  - Dispatch modal auto-loads weight variants from catalogue for Pieces/Packets

### May 24, 2025 (Session 4)
- **UPDATED**: PDF & Excel Export for Daily Purchase Requirement ✅
  - **Removed "Qty (Units)" column** as per user request
  - PDF/Excel now shows: Serial, Product Name, **Purchase Req**, Remarks
  - Purchase Req format based on unit type:
    - **Piece**: "X Pcs of [weight]"
    - **Packet**: "X Pkts of [weight]"
    - **Bunch**: "X Bunches of [weight]"
    - **Default (Kg)**: "X.X Kg"
  - Trilingual support: English, Hindi (पीस, पैकेट, गुच्छे), Marathi (नग, पॅकेट, जुडे)

- **UPDATED**: Indent Variant Display Enhancement ✅
  - Indent tables now show enhanced variant descriptions:
    - "Piece of 500+ gm" instead of just "Pieces"
    - "Packet of 200+ gm" instead of just "Packets"
    - "Bunch of 350+ gm" instead of just "Bunches"
  - Works for products with `purchase_weights` configured in Retailer Catalogue
  - Applied to: Indent table, Dispatch table, Invoice table, Print/Export functions
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

### May 24, 2025 (Session 3)
- **FEATURE**: Retailer Catalogue Bulk Edit System ✅
  - **"Edit Catalogue"** mode with **"Save All Changes"** button for bulk editing
  - **Searchable Weight Multi-Select** - Type to search & select multiple weights
  - **Column renamed**: "Variants" → "Customer Display Variant"
  - **Multiple Weights support** - Unit is single, weights can be multiple
  - **Auto-sync logic**: Customer Display Variant auto-populates from Purchase Variant weights
  
- **FEATURE**: Unit-Based Variant Display ✅
  - When Purchase Variant unit is **"Piece"** or **"Packet"**, it displays as a variant on retailer portal
  - Blue-styled buttons for unit variants, green for weight variants
  - Backward compatible with legacy data (shows unit even if not in variants array)
  - Files: `/app/frontend/src/pages/admin/Products.js`, `/app/frontend/src/pages/retailer/Dashboard.js`, `/app/backend/server.py`

### May 24, 2025 (Session 2)
- **VALIDATED**: High/Low Selling Logic with 5% Threshold ✅
  - Threshold now calculated against **total overall supplied** (not just rejected products)
  - Example: If total supplied qty = 3,256 → 5% threshold = 163 units
  - Summary cards show: Total Supplied Qty, Total Supplied Value, 5% Threshold values
  - High Selling (4 products) and Low Selling (54 products) correctly segmented
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **VALIDATED**: Customer Details Modal Working ✅
  - Flow: Dashboard → Customers tab → Retail "View Details" → Customer row "Details"
  - Shows date-wise P&L breakdown with all metrics
  - Added data-testid to QC/Retail cards for better testability
  - Files: `/app/frontend/src/pages/admin/Dashboard.js`

### May 24, 2025 (Session 1)
- **FEATURE**: High/Low Selling Product Tabs & Alphabetical Dropdown ✅
  - **Product Deep Dive Dropdown**:
    - Now sorted alphabetically (A-Z) for easier searching
    - Shows product name only (no percentage)
  - **High Selling / Low Selling Tabs** (Both Count % and Value % blocks):
    - **High Selling**: Products with ≥5% of total units supplied
    - **Low Selling**: Products with <5% of total units supplied
    - Shows count of products in each category (e.g., "High Selling (1)" / "Low Selling (57)")
    - Each product row shows: Name, Sales % contribution, Rejection %, qty details
    - Sorted by highest rejection % within each category
    - Scrollable list to see all products in each category
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Product-Level Rejection Analysis Deep Dive ✅
  - **Split "Highest Single Rejection" Block**:
    - Left side: Shows highest single rejection (product, shop, date, value, reason)
    - Right side: "Product Deep Dive" with dropdown selector + View button
  - **New Product Drilldown Modal** (select any product):
    - **Summary Row**: Supplied Qty, Supplied Value, Rejected Qty, Rejection Loss
    - **Rejection % Cards**:
      - By Count: Rejected Qty / Supplied Qty (e.g., 70.0% = 7/10)
      - By Value: Rejection Value / Supplied Value (e.g., 67.4% = ₹155/₹230)
    - **Rejection % by Shop**: Ranked list showing which shops reject this product most
    - **Rejection Reasons**: Breakdown by reason (Damaged, Rotten, etc.)
    - **Rejection by Day of Week**: Visual bar chart
    - **Rejection by Date**: Expandable rows showing daily breakdown with details
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Enhanced Rejection Analytics with Proper % Calculations and Expandable Dates ✅
  - **Fixed Rejection % Calculation**:
    - Now properly loads ALL dispatches within the rejection date range (not just single-day filter)
    - Rejection % = (Rejected Qty / Supplied Qty) × 100
    - Value % = (Rejection Value / Supplied Value) × 100
    - Shows actual numbers: "7 / 10 qty" format
  - **Two Product Ranking Sections**:
    - **By Product (Count %)**: Sorted by rejected qty / supplied qty, descending
    - **By Product (Value %)**: Sorted by rejection value / supplied value, descending
  - **Shop Names Throughout**:
    - All displays use `company_name` (shop name) instead of owner name
  - **Clickable Shop Rows with Drill-down**:
    - Shows Rejection %, Rejected, Supplied, Total Loss summary cards
    - Products ranked by % contribution at that shop
    - Date-wise rejection table for that shop
  - **Expandable Date Rows**:
    - Each date row shows: Date, Day, Count, Qty, Value
    - Click to expand and see detailed table:
      - Product, Shop, Qty, Reason, Value columns
      - All individual rejection entries for that day
  - **Visual Day-of-Week Chart**: Bar chart showing rejection values per day
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Enhanced Rejection Analytics Modal with Advanced Insights ✅
  - **Improved Rejection Loss Block Layout**:
    - Fixed date picker alignment with dedicated "Period:" row
    - Added "View Details" button in header
    - Shows top rejected product in bottom-right corner
    - Better visual hierarchy with icon, stats, and metadata
  - **New Rejection Analytics Modal** (triggered by View Details button):
    - **Summary Cards**: Total Loss, Total Qty, Rejections count, Avg/Day
    - **Highest Single Rejection Highlight**: Product, Retailer, Date, Value, Reason
    - **By Product (Max to Min)**: Ranked list with qty and value
    - **By Retailer (Max to Min)**: Ranked list with rejection count
    - **By Reason**: Aggregated by rejection reason (Damaged, Rotten, Quality Issue, etc.)
    - **By Day of Week**: Visual bar chart showing which days have most rejections
    - **Date-wise Breakdown**: Table with Date, Day, Count, Qty, Value (latest first)
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FIX**: Hamburger Menu Auto-Open on Mobile ✅
  - Fixed race condition where sidebar could auto-open on mobile due to incorrect state initialization
  - Changed `isMobile` initial state to calculate immediately from `window.innerWidth`
  - Modified useEffect to explicitly close sidebar on mobile, open on desktop
  - Files modified: `/app/frontend/src/components/Layout.js`

- **FIX**: "Failed to Load Data" Error with Retry Logic ✅
  - Added `fetchWithRetry` helper with 3 retry attempts and exponential backoff
  - Changed from `Promise.all` to `Promise.allSettled` so partial failures don't break entire load
  - Increased API timeout from 30s to 45s for cold starts
  - Added automatic retry after 3 seconds if all data sources fail
  - Files modified: `/app/frontend/src/hooks/useQCData.js`, `/app/frontend/src/utils/api.js`

- **REVERTED**: AI Demand Forecasting removed per user request
  - Removed backend API `/api/reports/demand-forecast`
  - Removed frontend states and fetch logic from Dashboard.js

### May 23, 2025
- **FIX**: Customer Detail Modal - Correct P&L Calculations & Column Order ✅
  - **Gross P/L formula corrected**: Sales - COGS - Wastage - Rejection (per day)
  - **Net P/L added**: Gross P/L - Commission (per day)
  - **Column order updated to match summary**: DATE, SALES, QTY, COGS, WASTAGE, REJECTION, GROSS P/L, GM%, COMMISSION, NET P/L, NM%, ₹/UNIT
  - **Exact rejection per date**: Fetches rejection data by retailer_id and date from API
  - Backend: `/api/retailer-rejections` queried for date-wise rejection by retailer
  - Files modified: `/app/frontend/src/pages/admin/Dashboard.js`

- **FEATURE**: Language Toggle for Indent & Dispatch Tabs ✅
  - **Indent tab**: Added language dropdown (English/Hindi/Marathi) - affects expanded view and PDF export
  - **Dispatch tab**: Added language dropdown before Export button - affects expanded view and CSV export
  - Uses product translations from products collection (name_hi, name_mr)
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FIX**: Currency Format & Date-wise Rejection Display ✅
  - **Indian Currency Format**: All amounts now use Lakhs (L) format from `formatCurrency()` function
    - ₹6.3L instead of ₹6.3K for amounts ≥1 Lakh
    - Applied to vertical cards and modal header summary
  - **Date-wise Rejection**: Added REJECTION column in Customer Detail modal
    - Shows rejection amount and % distributed proportionally by daily sales
    - Formula: `day_rejection = total_rejection × (day_sales / total_sales)`
  - **Date Sorting**: Customer detail date-wise breakdown now sorted descending (latest first)
    - 23 May appears on top, then 22 May, etc.
  - Files modified: `/app/frontend/src/pages/admin/Dashboard.js`

- **FIX**: Customer-wise Sales Dashboard - Accurate Metrics Per Retailer ✅
  - **Avg Profit/Day in Cards**: Changed from "Avg Sales/Day" to "Avg Gross Profit/Day" (based on actual sales days)
  - **Avg Sales/Day per Customer**: Now uses customer's actual `sales_days` from API instead of date range
    - Tamanna Mart: ₹51,720 / 22 days = ₹2,351/day (was incorrectly using 23 days)
  - **Actual Rejection per Retailer**: Backend now tracks rejection by `retailer_id` instead of proportional distribution
    - Tamanna Mart: 13.0% rejection, Savtamali: 6.3% rejection (was all showing 12.5%)
  - **GM% and NM% now vary per customer**: Based on their actual rejection, not proportional distribution
  - **Customer names now show sales days**: e.g., "Tamanna Mart (Retail) (22d)"
  - Backend files modified: `/app/backend/server.py` (rejection_by_retailer tracking, retailer_id in sales_by_customer)
  - Frontend files modified: `/app/frontend/src/pages/admin/Dashboard.js`

- **FIX**: Customer-wise Sales Dashboard P&L Formula Corrections ✅
  - **Gross P/L**: Corrected to Sales - COGS - Wastage - Rejection (was using API's gross_profit which excluded rejection)
  - **Net P/L**: Corrected to Gross P/L - Commission (was using API's net_profit which included variable expenses)
  - **GM%**: Now calculated from corrected Gross P/L / Sales
  - **NM%**: Now calculated from corrected Net P/L / Sales
  - **Avg/Day**: Fixed to show Sales/Days (was showing Gross Profit/Days incorrectly)
  - **Added Rejection %**: New column showing Rejection/Sales * 100
  - **Removed comparison charts**: Simplified to text notification when retailers are selected
  - Verified: Tamanna Mart (₹51,720 sales, 23 days) → Avg/Day = ₹2,249 ✅

- **FEATURE**: Customer-wise Sales Dashboard Redesign ✅ (P0 - VERIFIED)
  - **Vertical Grouping**: Customers tab now shows two clickable vertical cards (Quick Commerce vs Retail)
  - **Vertical Cards Display**: Sales, COGS, Wastage, Gross P/L (%), ₹/Unit, Avg/Day for each vertical
  - **Date Picker**: Added date range filter at top of Customers tab
  - **Drill-down Modal**: Clicking a vertical card opens modal with comprehensive metrics:
    - Header: Sales, Qty, Avg Sales/Day, COGS, Wastage, Rejection, Gross P/L (%), Commission, Net P/L (%), ₹/Unit
    - Customer Table: All above metrics per customer with comparison checkboxes
    - TOTAL row with aggregated values
  - **Multi-Customer Comparison**: Retail modal includes "Select retailers to compare" with checkboxes
  - **Bug Fix**: Fixed COGS showing ₹0 - was using wrong field `cogs` instead of `cogs_share` from API
  - **React Hook Fix**: Fixed conditional useMemo error by moving hooks before loading conditional return
  - Files modified: `/app/frontend/src/pages/admin/Dashboard.js`
  - All features verified working via screenshots

### May 22, 2025
- **FEATURE**: Added Partial Reimbursement support in Variable Expenses
  - New "Reimbursement Amount" field in modal with ₹ prefix
  - Tracks `total_reimbursed` and `settlement_status` (pending/partial/settled)
  - Shows amber warning for partial payments
  - Settlement column displays progress (e.g., "₹2,500 / ₹5,000")
  - Updated pending reimbursement calculation to show remaining amounts
  - Files modified: `/app/frontend/src/pages/admin/VariableExpenses.js`

- **BUG FIX**: Fixed Employee Reimbursement calculation showing ₹0 in Variable Expenses
  - Root cause: Filter incorrectly required `payment_status === 'paid'` for employee-paid expenses
  - Solution: Changed filter to only check `paid_by_type === 'employee' && settlement_status !== 'settled'`
  - Files modified: `/app/frontend/src/pages/admin/VariableExpenses.js` (4 locations)
  - Result: Pending Reimbursement now correctly shows remaining amounts

- **BUG FIX**: Fixed Marathi product names not appearing in Daily Purchase PDF/Excel
  - Root cause: Export functions used cached translations from dailyReqData instead of fresh product data
  - Solution: Modified `printDailyRequirement()` and `exportDailyReqToExcel()` to build fresh translation map from products array
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js` (2 functions updated)
  - Result: PDF/Excel now shows latest translations immediately after updating in Products page

- **FIX**: Added `product_name_hi` and `product_name_mr` to saveDailyRequirement payload

### Previous Session (May 21-22, 2025)
- Mobile remarks layout (card-based) for Daily Purchase table
- GRN Date filters with 5-day default span
- Remarks carry-forward via `/api/retailer-daily-requirement/saved` endpoint
- Purchase Qty rounding (minimum 1kg, Math.ceil for decimals)
- "Paid To" filter in Variable Expenses
- Payment Details redesign in Retailer Portal
- Rejection Qty bug fix (item-level sync)

---

## Original Problem Statement
End-to-end full-stack system for a fruits and vegetables retail and quick commerce business. The system manages inventory, procurement, sales, wastage tracking, and comprehensive P&L reporting.

## User Personas
- **Admin**: Full system access, P&L reporting, user management
- **Staff**: Daily operations, stock status, procurement
- **Retailer**: Order management, dispatch tracking

## Core Features

### Implemented ✅
- Multi-portal system (Admin, Staff, Retailer)
- Automated indent generation
- Variant-based inventory (QC Packaging)
- Daily stock status tracking with mandatory closing validation
- Wastage Dashboard with correct % formula: `Wastage / (Opening + Purchase)`
- Product-level P&L with consistent wastage calculations
- Customer P&L (QC: GRN Loss, Retail: Commission)
- Variable expenses by vertical (QC/Retail isolation)
- Fixed expenses (excluded from Customer P&L)
- Data backup system (29 collections)
- Direct API Sync for production data
- Historical wastage value fix mechanism
- Dual language support (English/Hindi)
- Excel export functionality
- Size field for Bunch, Packet, Piece units in Procurement
- Auto-recalculate wastage when procurement is updated for closed days
- **Unified GRN Loss calculation across QC Dashboard and P&L** (shared helper function)
- **Date-wise Retail Rejection tracking with historical display**
- **Paid By filters with employee dropdown in Variable Expenses**
- **Unit conversion: Bunches/Packets/Pieces to kg for stock tracking**

### Completed (This Session - 17 May 2026 - Continued)
- **Daily MRP Tab for Retail Products** ✅ (Verified)
  - New "MRP" sub-tab added in Daily Requirement section (after Purchase and Stickers)
  - **Products filtered by day's indents**: Only shows unique products present in that day's combined retailer indents (mirrors Stickers tab logic)
  - Products grouped by category with **all categories expanded by default** (click to collapse)
  - Table columns: S.No (#), Product Name, Variant (dropdown), MRP (₹ input), **Blinkit (₹)** (comparison price), Actions (delete)
  - **Variants pre-populated from last sold variants** - fetched from recent dispatches
  - Variant dropdown filtered to show only retail-applicable variants
  - Inline editing: MRP values and variants editable directly in the table
  - Delete functionality: Remove individual entries with trash icon
  - Add new products: "+" button per product row and "Add product with specific variant" section
  - **Same product can be added with multiple variants** (for different pack sizes)
  - **Duplicate product+variant validation** - prevents same combo being added twice
  - Date selector: Pick date to view/edit MRP for that date
  - **Footer shows**: "X items with MRP | Y products without MRP | **Z items with ₹0 MRP**" (in red)
  - **Category header shows**: "X items with ₹0 MRP" instead of total sum
  - "Save MRP" button: Batches all pending changes and saves at once
  - "Copy from Previous Date" button: Copies all MRP entries from the previous day
  - "Initialize (X Products)" button: Auto-populates products from day's indents with their last sold variants
  - **Empty state**: Shows helpful message when no indents exist for selected date
  - Admin-only editing for past dates: Staff can only edit today/future, Admins can edit any date
  
- **Blinkit Price Scraper Integration** ✅ (Verified)
  - **"Fetch Blinkit Prices" button** in MRP tab to manually trigger scraping
  - **Blinkit (₹) column** added to MRP table showing competitor prices
  - Price comparison color coding: Green (we're cheaper), Red (we're expensive), Orange (same/no data)
  - **Automated daily scraping at 6 AM IST** using APScheduler
  - Location-aware scraping based on **retailer pincode** (default: 411045)
  - Playwright-based web scraper for Blinkit website
  - Backend APIs:
    - `GET /api/blinkit-prices?date=YYYY-MM-DD` - Fetch scraped prices for a date
    - `GET /api/blinkit-prices/latest?pincode=XXXXXX` - Get latest prices per product
    - `POST /api/blinkit-prices/scrape?pincode=XXXXXX` - Trigger manual scrape
    - `GET /api/blinkit-prices/mapping` - Get product name mappings
    - `PUT /api/blinkit-prices/mapping/{product_id}` - Update Blinkit search term for a product
  - New MongoDB collection: `blinkit_prices` storing scraped prices with date, pincode, product mapping
  - Scraper file: `/app/backend/blinkit_scraper.py`

### Completed (This Session - 18 May 2026)
- **Immediately Payable Feature (5-Day Credit Period)** ✅
  - **Backend APIs**: 
    - `GET /api/retailer-immediately-payable` for individual retailer
    - `GET /api/admin/all-retailers-immediately-payable` for admin summary
  - **Logic**: 50% on delivery day + Remaining 50% after 5 days + Overdue amounts
  - **Admin Portal**: Shows shop names (company_name), 3-card breakdown, retailer-wise summary
  - **Retailer Portal**: 
    - Fixed card title to "Immediately Payable" (was showing translation key)
    - Changed Invoices link from span to button for proper click handling
    - All 3 cards always visible (50% Upfront, 5-Day Credit Due, Overdue) with empty state messages

- **Shop Name Display Fix** ✅
  - Admin portal now shows `company_name` (shop name like "Tamanna Mart") instead of owner name

### Completed (This Session - 19 May 2026)
- **Dynamic Rejection Calculation Fix for Immediately Payable** ✅ (P0 - VERIFIED)
  - **Problem**: `net_payable` stored in invoices doesn't account for rejections (stored separately by date+retailer)
  - **Fix**: Both `/api/retailer-immediately-payable` AND `/api/admin/all-retailers-immediately-payable` now:
    1. Fetch rejections from `retailer_rejections` collection by date+retailer_id
    2. Calculate: `Net after rejection = Gross - Rejections`
    3. Calculate: `Commission = Net after rejection × commission_percentage`
    4. Calculate: `Final Payable = Net after rejection - Commission`
  - **Verified**: Jai Bhawani May 13 overdue now correctly shows ₹240.10 (was ₹537)

- **MRP Tab - Complete Rewrite** ✅
  - Variants load directly from indents (product+variant combinations)

- **Stickers Tab - Collapsible Categories & Customer Details** ✅

- **Marathi Translation Fix & PDF/Excel Export Simplified** ✅

### Completed (This Session - 19 May 2026)
- **Daily Purchase Requirement Multilingual PDF/Excel Export** ✅
  - Added language selector dropdown (English/Hindi/Marathi) next to PDF and Excel buttons
  - PDF export now uses selected language for all labels: title, date, headers, column names, totals
  - Product names display in Hindi when translation exists, falls back to English with `*` marker if missing
  - Excel export also respects selected language with proper Unicode (BOM) support
  - Shows note on PDF when products have missing translations (e.g., "* 5 product(s) missing Hindi translation")
  - Date formatting uses locale-appropriate format (hi-IN, mr-IN, en-IN)
  
- **All Product Translations Populated** ✅
  - Auto-populated Hindi and Marathi translations for all 86 products
  - Created `/api/admin/populate-all-translations` endpoint for production use
  - Coverage: 86/86 Hindi (100%), 86/86 Marathi (100%)

- **Dispatch "Done" Checkbox Feature** ✅
  - Added "Done" checkbox column in dispatch modal (next to Total column)
  - Auto-checks when Supply Qty >= Indent Qty
  - Users can manually check for partial supply scenarios (short supply)
  - Items marked as "Done" won't appear in subsequent "Dispatch Remaining" actions
  - Backend API: `POST /api/retailer-indents/{id}/mark-items-done`
  - Row highlighting: Green background when marked done

### Note on 50% Today's Delivery
The 50% upfront amount only shows for **invoices**, not dispatches. If a dispatch was created but no invoice was generated, the amount won't appear. Invoices need to be created separately from dispatches.

### In Progress
- **Codebase refactoring Phase 2** (server.py ~13,800 lines - CRITICAL)
  - ✅ Labour Management routes moved to `/app/backend/routes/labour.py`
  - Pending: More route extractions to reach target <8,000 lines
- Labor "Inactive" UI clarity improvements (soft-delete confusion)

### Blocked
- WhatsApp Integration (awaiting credentials)
- APScheduler reliability (architectural decision needed)

### Backlog
- Hindi language E2E testing
- AI-powered demand forecasting

### Completed (This Session - 17 May 2026)
- **Daily Requirement Auto-Load Feature** ✅ (Verified)
  - Daily Requirement tab now auto-calculates on tab selection (no manual "Calculate" click needed)
  - Date defaults to today's date on load
  - Auto-refreshes when date is changed
  - Both Purchase and Stickers sub-tabs auto-load their respective data
  - "Calculate" button renamed to "Refresh" for optional manual refresh

- **Category-Based Collapsible Grouping** ✅ (Verified)
  - Purchase and Stickers tabs now group items by category (Vegetables, Leafy, Fruits, Exotic, Other)
  - Categories are sorted in predefined order for consistency
  - Click to expand/collapse each category
  - Category headers show summary totals (Units, Qty Kg, Requirement Kg for Purchase; Qty for Stickers)
  - Each category has category-total row at bottom when expanded
  - Grand total row at bottom shows overall totals
  - Categories auto-expand when data loads

- **Dynamic Categories & Types Management** ✅ (Verified)
  - New "Categories & Types" tab added in Products page
  - Admins can add, edit, and delete Product Categories and Product Types
  - Categories and Types are stored in MongoDB (`product_categories`, `product_types` collections)
  - Backend auto-seeds default Categories and Types on startup (Vegetables, Leafy, Fruits, Exotic, Herbs, Mushrooms, Others)
  - Product edit/add form now uses dropdown selects for both Category and Type (populated from database)
  - Product list already displays both TYPE and CATEGORY columns
  - When a category/type is renamed, all products using it are automatically updated

- **Retailer Self-Service Indent System** ✅ (Verified)
  - Renamed "Pending Orders" tab to "Orders" in Retailer Portal
  - Added "Create Indent" button in Orders section
  - Create Indent modal with:
    - Date picker (defaults to next day)
    - Products grouped by Type in collapsible sections
    - Variant dropdown and Quantity input for each product
    - "0 items selected" counter
  - Time restriction: Retailers can edit indents only until 10 PM IST on the indent date
  - Indents created by retailer are marked with `created_by_retailer: true` in database
  - Admin portal shows "Generated by Retailer" marker on retailer-created indents
  - Edit button shown for pending indents within edit window

- **Vertical-Specific Packaging Variants** ✅ (Verified)
  - Added "Applicable For" field to packaging variants with options: QC Only, Retail Only, Both
  - Packaging table now shows "Applicable For" column with colored badges (Blue=Both, Orange=QC, Green=Retail)
  - Edit Packaging dialog includes "Applicable For" dropdown with helper text
  - Retailer Portal Create Indent modal only shows variants marked for "Retail" or "Both"
  - Admin Retailer Orders indent form only shows retail-applicable variants
  - Backend POST/PUT endpoints updated to accept and store `verticals` array

- **Product Image Upload** ✅ (Verified)
  - Added image upload capability when creating or editing products
  - Upload area with dashed border and "Upload Image" placeholder
  - Image preview with remove button (X) after selection
  - File validation: JPEG, PNG, WebP only, max 5MB
  - Product list shows image thumbnails (or placeholder icon if no image)
  - Backend endpoint `/api/products/upload-image` for file uploads
  - Static files served from `/uploads/products/` directory
  - Product model updated with `image_url` field

- **Retailer Indent: Product Images & Hindi Support** ✅ (Verified)
  - Create Indent modal shows product images (48x48 thumbnails)
  - Click on image to enlarge (opens full-screen modal with product name)
  - Zoom icon overlay appears on hover
  - Hindi translations shown when language is set to Hindi:
    - Primary name shows Hindi (e.g., "हरा चौलाई")
    - English name shown as secondary text below
  - Placeholder icon shown for products without images
  - Variant dropdown and Qty input labels also translate to Hindi

- **Mobile Responsive Retailer Orders** ✅ (Verified)
  - Orders tab with compact icon-based tabs (mobile shows icons + badges only)
  - "New" button on mobile (full "Create Indent" on desktop)
  - Create Indent modal optimized for mobile:
    - Full-screen modal with proper padding
    - Stacked date picker layout
    - Compact type headers with checkmark count
    - Product rows with image, name, variant dropdown and qty input
    - Fixed footer with Cancel/Submit buttons
  - Products grouped by type with collapsible sections
  - Image enlargement modal with full-screen view

### Completed (Previous Session - 16 May 2026)
- **Employee Procurement Payment Tracking Fixes** ✅ (Verified)
  - **Issue**: Newly recorded partial payments by employees were NOT showing purple highlighting
  - **Issue**: Reimbursement summary in Cashflow NOT updating for employee payments
  - **Issue**: View button missing for partially paid procurements
  - **Backend Fix**: `create_procurement_payment` endpoint now sets `paid_by_type` and `paid_by` on parent procurement document (not just on payment record)
  - **Backend Fix**: `update_procurement_payment` and `delete_procurement_payment` endpoints now recalculate `paid_by_type` based on all remaining payments
  - **Backend Fix**: Added new `/api/procurement-payments` endpoint with date filtering for Cashflow reimbursement tracking
  - **Frontend Fix**: View button (Eye icon) now shows for partial payments alongside Pay button (both visible when `pending_amount > 0` AND `paid_amount > 0`)
  - **Frontend Fix**: Purple row highlighting via inline styles for employee pending settlements
  - **Frontend Fix**: Cashflow Reimbursements tab now fetches payment-level data for accurate employee reimbursement tracking
  - Test data verified: Procurement with ₹200 partial payment by Shradha Salunke shows correct purple highlighting and appears in Cashflow Reimbursements

### Completed (Previous Session - 15 May 2026)
- **Retailer Portal Enhancements** ✅ (Verified)
  - **Serial Number in Invoice Details**: Added `#` column showing 1, 2, 3... for each item in expanded invoices
  - **Pending Orders Date-wise Collapsible View**: Replaced scrollable list with expandable date rows showing Date, Count of Orders, No of Items, Status columns
  - **Invoice Tab - Paid Amount Column**: Added PAID AMOUNT column between Commission and Net Payable
  - **PDF Download Restriction**: Download PDF icon only enabled for fully paid invoices (grayed out for pending)
  - **Payment Timestamp in Expanded Invoice**: Shows "Payment Details:" section at bottom with payment date, time, amount, and payment mode

- **Dashboard P&L Table Column Alignment & Sticky Header** ✅ (Verified)
  - Fixed QC and Retail vertical rows to have 14 columns (was 12-13)
  - Fixed QC Customer rows and Product/Item rows column alignment
  - Added **sticky header** that stays visible when scrolling through expanded rows
  - Added `max-h-[70vh] overflow-y-auto` container for table scrollability

- **Retailer Invoice "Final Payable" Inline Display** ✅ (Verified)
  - "Final Payable" now displays inline with Commission in 5-column grid
  - Styled with `font-bold text-blue-700` for visibility

- **Edit Payment & Timestamp Display Feature for Retailer Orders** ✅ (Verified)
  - Added **Edit Payment functionality** in Payment History modal
  - Added **View button for Partial invoices**
  - Added **Earlier Payments section** with timestamps

- **Procurement Payment Edit/Delete & History Feature** ✅ (Verified)
  - Created new `procurement_payments` collection
  - Added CRUD APIs for procurement payments
  - Updated Procurement.js with edit/delete buttons and payment history display
  - Partial payment status now shows employee name and settlement status

- **Dispatch Edit Enhancements** ✅ (Verified)
  - Added **Delete button (X)** for each dispatch line item when editing
  - Added **Variant dropdown** to edit packaging variant in dispatch
  - Added **"Fill Yesterday's MRP" button** to auto-populate MRP from yesterday's dispatches (matched by product + variant)
  - Added backend API: `GET /api/retailer-dispatches/yesterday-mrp`
  - Widened dispatch modal from `max-w-2xl` to `max-w-4xl` to fit all columns

### Completed (Previous Session - 11 May 2026)
- **Labor Costs Export & Payroll Processing Features** ✅ (Verified)
  - Added **Export CSV button** on Daily Costs tab for attendance download (name, days present, overtime hours, total payment)
  - Added **Payroll Processing tab** next to Manage Labourers with:
    - Date range selector
    - Summary cards (Total Payroll, Labourers count, Man Days, OT Hours)
    - Detailed payroll table with: #, Name, Bank A/C, IFSC, Days, OT Hrs, Amount
    - **Export for Netbanking** button with customizable field selection modal
  - Export modal allows selecting fields based on bank requirements (Name, Bank Account, IFSC, Amount, Days, OT Hours, Daily Rate, OT Rate, Date Range, Phone)
  - CSV download for uploading to netbanking portals

- **Dashboard P&L Wastage Fix** ✅ (Verified)
  - Fixed `/api/reports/pnl` endpoint to use fresh procurement data for wastage calculation
  - Dashboard Overview, Products tab, and Date-wise Details popup now show correct wastage
  - Apple - Royal Gala on May 8: Was showing ₹1,599 (68.3%), Now shows ₹39 (5.0%) ✅
  - Created `fresh_purchases_by_date_product` lookup to recalculate wastage dynamically
  - Both wastage total calculation and product_wastage_summary now use fresh procurement data

- **Stock Status Wastage Calculation Bug Fix** ✅ (Verified)
  - ROOT CAUSE: `purchase_qty` was being corrupted (multiplied ~3x) in `daily_stock_status` collection due to duplicate API calls or race conditions
  - FIX: Modified `/stock-status/close` endpoint to use FRESH procurement data instead of stored `purchase_qty`
  - FIX: Modified `/stock-status/closable-products` to also use fresh procurement data for closed entries
  - Created new endpoint `/api/stock-status/fix-corrupted-purchase-qty` to repair existing corrupted data
  - Fixed 17 corrupted records including: Apple (9→3), Mango (9→3), Watermelon (36→12), Muskmelon (7.5→2.5)
  - Wastage now correctly calculated: e.g., Apple 0.15kg (was 6.15kg), Watermelon 0kg (was 24kg)

- **Retailer Invoice Rejection Enrichment** ✅ (Verified)
  - Older invoices created before rejection tracking now show rejection data
  - Dynamic enrichment queries `retailer_rejections` collection using `dispatch_ids`
  - Handles legacy string-serialized `dispatch_ids` via `ast.literal_eval`
  - Invoice modal displays: Rejection total (-₹665.00), per-item rejection counts (-3, -1)

### Completed (Previous Session - 05 May 2026)
- **Record Rejection Performance Fix** ✅
  - Created batch API endpoint `/api/retailer-rejections/history-batch` 
  - Fetches rejection history for ALL products in one call instead of N individual calls
  - Modal now loads within 3 seconds instead of 15-30+ seconds
- **Rejection Recorded Timestamp Display** ✅
  - Rejections tab now shows "Recorded: DD MMM YYYY at HH:MM" when date row is expanded
  - Record Rejection modal history shows "(Recorded: DD MMM at HH:MM)"
- **Previous Rejections Now Filter by Date** ✅
  - Fixed: "Previous Rej." column now ONLY shows rejections for the SELECTED dispatch date
  - Previously showed ALL historical rejections across all dates (incorrect behavior)
  - API now accepts `rejection_date` parameter to filter correctly
- **Rejection Quantity Display Fixed** ✅
  - Changed from "X kg" to "X units" in all displays
  - Shows proper unit count, not misleading kg values
- **Rejection Validation Added** ✅
  - New rejection qty cannot exceed (supplied_qty - already_rejected_for_this_date)
  - Error message shows: "Cannot exceed remaining qty. Supplied: X, Already rejected: Y"
- **P&L grn_qty_kg Revert** ✅
  - Reverted selling_price_per_kg calculation to use supplied_kg instead of grn_qty_kg
  - User requested this change to be reversed

### Completed (Previous Session - 27 Apr 2026)
- **OCR QC Order Processing** ✅
  - GPT-4o integration via emergentintegrations library for image OCR
  - Extracts NC SKU ID, UOM, CA (unit type), UNITS (total demand), Mr Organix (order qty)
  - 100% product matching rate with existing database products
  - Preview modal with editable fields (quantity, lot size)
  - Checkbox selection for items to include in indent
  - Create Indent button generates QC indent with source='ocr' marker
- **Cashflow Receivables Date Filter Fix** ✅
  - Summary cards now correctly filter retail invoices by selected date range
  - Previously showed all-time totals (₹16.5K) instead of date-filtered amounts (₹2.6K)
- **Labour-wise Summary Expandable Rows** ✅
  - Click on any labour name to expand and view day-wise attendance details
  - Shows DATE, HOURS, OVERTIME, PAYMENT columns for each day
  - Inline editing: click edit icon to edit hours/overtime
  - Save updates attendance record via API with success toast

## Technical Architecture

### Backend
- FastAPI with MongoDB
- APScheduler for cron jobs (reliability issues noted)
- Resend for email notifications
- **Modular routes in `/app/backend/routes/`** (partial - labour.py active)

### Frontend
- React with Shadcn/UI components
- Tailwind CSS styling
- i18next for internationalization

### Key Data Models
- `daily_stock_status`: Opening, Purchase, Wastage, Dispatch, Closing
- `qc_packaging`: QC variants
- `variable_expenses`: Vertical field (qc/retail/all), paid_by field
- `labours`: Soft delete with `is_active` flag
- `retailer_rejections`: Date-wise rejection tracking with `rejection_date`

## Recent Changes (April 2026)

### Current Session (21 Apr 2026) - Part 2
1. **GRN Mark All Paid Popup** - Shows payment details modal instead of confirm dialog
   - Payment Date, Payment Mode, Reference/Transaction ID, Remarks fields
   - Button changes to "All Paid" badge after successful marking
2. **View/Edit GRN Payments** - Added Eye icon to view/edit payment details for paid items
3. **Fixed Expenses Date Field** - Changed from month/year dropdowns to full date picker
   - Backward compatible with existing month/year data
4. **Cashflow Fixed Expenses Filter** - Now correctly filters by date field
   - Shows ₹75.0K for April Fixed Expenses
5. **Variable Expenses Migration** - Added migration endpoint to set `paid_by_type` for past entries
   - 25 company expenses + 33 employee expenses migrated
   - All past Ankush expenses now show "Settled" status

### Current Session (21 Apr 2026) - Part 1
1. **Fixed Cashflow QC GRN ₹0.00 Bug** - Changed `item.date` to `item.dispatch_date` in Cashflow.js
   - QC (Ninjacart) now correctly shows receivables (₹4.99L for Apr 1-21)
2. **Fixed Variable Expenses Settlement Logic** - Employee-paid expenses now correctly show "Pending" status
   - Added `settlement_status='pending_reimbursement'` when paid_by_type='employee'
   - Checkbox enabled for employee-paid pending reimbursement rows
   - Green rupee icon shows next to "Pending" badge to record reimbursement
3. **Fixed Mark All Paid Visual Feedback** - GRN payments now properly saved and display "All Paid" badge
   - Added `payment_received`, `payment_date`, `payment_mode` fields to `QCGRNItem` model in models.py
   - Loading state with spinner ("Marking...") while processing
   - "All Paid" badge shows after successful marking
4. **Fixed Cashflow Fixed Expenses** - Now uses date field with month/year fallback
5. **All files linted and verified** - No ESLint errors

### Session 20 Apr 2026
1. **Verified GRN Loss Unification** - P&L Dashboard loads correctly with shared calculation
2. **Started Codebase Refactoring Phase 2**
   - Extracted Labour Management routes to `/app/backend/routes/labour.py` (~357 lines)
   - Updated `dependencies.py` with `get_db()` helper
   - server.py reduced from 12,207 to 11,850 lines

### Previous Sessions
1. Unified GRN Loss calculation using `calculate_grn_loss()` helper
2. Implemented Date-wise Retail Rejection tracking
3. Added Paid By filters with employee dropdown to Variable Expenses
4. Fixed unit conversion (bunches to kg)
5. Updated Invoice phone number
6. Fixed Wastage % consistency across dashboards

### Completed (This Session - 20 May 2026)
- **Retailer Portal "Create Order" Restructuring** ✅
  - **Removed "Place Order" from hamburger menu** - Menu now shows: Home, My Orders, Closing, My Account
  - **Added "Create New Order" card at top of My Orders tab** - Prominent green card with delivery date and "Create Order" button
  - **Removed "Yesterday's Closing Not Recorded" banner** - Closing inventory feature cleaned up
  - **Orders now show unique Order IDs** - Each order displays #XXXXXX format ID derived from MongoDB ObjectId
  - **Single Edit/Delete per order** - Replaced multiple edit buttons per product with single Edit + Delete buttons per order
  - **Expandable order details** - Orders are collapsible cards showing item details when expanded
  - **Title changed from translation key to "Create Order"** - Fixed the "retailer.placeOrder" display issue

### Completed (This Session - 20 May 2026 - Continued)
- **Retailer Portal UX Improvements (Part 2)** ✅
  - **View Cart button moved to bottom center** - Fixed position, always visible regardless of scroll
  - **Product images now showing** - Backend enriches catalogue items with product images from products collection
  - **Auto-redirect after placing order** - User is redirected to Orders tab under My Orders after successful order placement
  - **Order items displayed vertically** - Changed from grid layout to vertical list (one item per row) for better readability
  - **Edit order uses cart-based interface** - Clicking Edit opens the same Create Order interface with items pre-loaded in cart
  - **Create Order button on Home page** - Added prominent "Create New Order" card above Your Earnings on the retailer dashboard home
  - **Edit mode indicators** - Header shows "Edit Order" and "Editing order for: [date]", floating button shows "Review Changes (X)"
  - **Cancel Edit option** - Added "Cancel Edit" button when in edit mode to discard changes and return to Orders

## Key API Endpoints
- `GET /api/reports/pnl` - P&L with unified GRN Loss calculation
- `GET /api/qc-grn/summary` - QC GRN Loss summary (uses shared helper)
- `GET /api/stock-status/wastage-dashboard` - Wastage analytics
- `GET /api/labours` - Labour list (modular route)
- `GET /api/labour-attendance` - Attendance tracking (modular route)
- `GET /api/labour-costs/summary` - Labour costs summary (modular route)
- `GET /api/rejections` - Historical date-wise rejections
- `GET /api/retailer-rejections/history` - Single product rejection history
- `POST /api/retailer-rejections/history-batch` - Batch rejection history for multiple products
- `POST /api/qc-indents/ocr` - OCR image upload for Ninjacart indent extraction
- `POST /api/qc-indents/create-from-ocr` - Create indent from OCR extracted data
- `GET /api/retailer-catalogue` - Now enriches with product images from products collection

### Completed (This Session - 20 May 2026 - Part 3)
- **Retailer Portal UX Refinements** ✅
  - **Product images now use full URLs** - Frontend constructs proper URL with `REACT_APP_BACKEND_URL` prefix for relative image paths
  - **ERP-style Order ID format** - Changed from `#XXXXXX` to `Order Id: ORD-YYYYMMDD-XXXX` (e.g., `Order Id: ORD-20260519-225E`)
  - **Language toggle on Create Order page** - Added English/हिंदी/मराठी button group with localStorage persistence (`retailerCatalogueLanguage`)
  - **Categories collapsed by default** - Product categories on Create Order page now start collapsed (user clicks to expand)
  - **Cart Modal shows translated names** - Product names in cart modal respect selected catalogue language

### Completed (This Session - 21 May 2026)
- **Payment Details Redesign (Replaces "Immediately Payable")** ✅ (P0 - VERIFIED)
  - **New Component**: Renamed "Immediately Payable" to "Payment Details" on Retailer Dashboard
  - **Date Filters**: Added date range filters with "Apply" and "Reset" buttons
  - **Aggregate Table**: Shows dates with pending payments in columns: Date | 50% Upfront | Final Payment | Total
  - **Clickable Rows**: Each row opens a mobile-friendly scrollable modal
  - **Item-Level Modal**: 
    - **Header**: Gross Value, Rejection, Net Value, Commission, Final Payable
    - **Item Table**: S.No, Product Name, Supplied Qty, Rejection Qty, Rejection Amount, Billable Qty, Amount
    - Invoice-level breakdown with totals
    - Footer shows payment status and total due
  - **Mobile Responsive**: Modal scrollable with sticky headers on mobile
  - **Backend API**: New `GET /api/retailer-payment-details` endpoint with date filtering
    - Aggregates invoices by date
    - Calculates 50% upfront vs final payment based on days since invoice (5-day credit period)
    - Returns complete item-level details for modal display

## Test Credentials
- Admin: admin@freshflow.com / admin123
- Retailer: tamannamart08@gmail.com / admin123
- Retailer: bhaveshdewasi803@gmail.com / 12345
- Staff: samrat@freshflow.com / admin123

## Refactoring Status
| File | Original Lines | Current Lines | Target | Status |
|------|---------------|---------------|--------|--------|
| server.py | 12,207 | 14,700+ | <8,000 | CRITICAL - Bloated |
| RetailerOrders.js | 5,400+ | 8,101 | <2,000 | CRITICAL - Bloated |
| Dashboard.js (Retailer) | 4,000+ | 4,500+ | <2,000 | NEEDS REFACTOR |

## Active Modular Routes
- `/app/backend/routes/labour.py` - Labour Management (ACTIVE)
- `/app/backend/ocr_indent_processor.py` - OCR Indent Processing (ACTIVE)

## Known Limitations
- **Product images may not persist after server restarts** - Images uploaded to `/app/uploads/products/` may be cleared during deployments. This is a preview environment limitation. Production deployments should use cloud storage (S3/GCS) for persistence.
