# Mr Organix - Product Requirements Document

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
  - **Backend API**: `/api/retailer-immediately-payable` for individual retailer view
  - **Backend API**: `/api/admin/all-retailers-immediately-payable` for admin summary
  - **Logic**: 
    - 50% of today's invoice amounts (delivery day)
    - Remaining 50% of invoices delivered exactly 5 days ago (after rejection/commission adjustments)
    - All overdue amounts (>5 days old with pending/partial status)
  - **Admin Portal**: Added "Immediately Payable (5-Day Credit)" block below Rejection Loss showing:
    - Total amount due
    - Breakdown: 50% Upfront, 5-Day Credit Due, Overdue
    - Retailer-wise breakdown
  - **Retailer Portal**: Added red "Immediately Payable" card below Earnings (only shows if amount > 0)

- **MRP Tab - Complete Rewrite** ✅
  - Removed duplicate date picker from MRP section
  - Variants now load directly from indents (product+variant combinations)
  - Each product+variant from indents gets its own row in MRP table

- **Stickers Tab - Collapsible Categories & Customer Details** ✅
  - Added collapsible category sections
  - Click on any product row to see "Customer Indent Details" showing retailers and quantities

- **Marathi Translation Fix & PDF/Excel Export Simplified** ✅

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

## Test Credentials
- Admin: admin@freshflow.com / admin123
- Retailer: tamannamart08@gmail.com / admin123
- Staff: samrat@freshflow.com / admin123

## Refactoring Status
| File | Original Lines | Current Lines | Target | Status |
|------|---------------|---------------|--------|--------|
| server.py | 12,207 | 14,685 | <8,000 | CRITICAL - Bloated |
| RetailerOrders.js | 5,400+ | 8,101 | <2,000 | CRITICAL - Bloated |

## Active Modular Routes
- `/app/backend/routes/labour.py` - Labour Management (ACTIVE)
- `/app/backend/ocr_indent_processor.py` - OCR Indent Processing (ACTIVE)
