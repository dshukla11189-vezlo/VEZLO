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

### In Progress
- **Codebase refactoring Phase 2** (server.py ~11,850 lines, reduced from 12,200+)
  - ✅ Labour Management routes moved to `/app/backend/routes/labour.py`
  - Pending: More route extractions to reach target <8,000 lines
- Labor "Inactive" UI clarity improvements (soft-delete confusion)

### Blocked
- WhatsApp Integration (awaiting credentials)
- APScheduler reliability (architectural decision needed)

### Backlog
- Hindi language E2E testing
- AI-powered demand forecasting

### Completed (This Session - 05 May 2026)
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
| server.py | 12,207 | 11,850 | <8,000 | In Progress |
| RetailerOrders.js | 5,400+ | - | <2,000 | Not Started |

## Active Modular Routes
- `/app/backend/routes/labour.py` - Labour Management (ACTIVE)
- `/app/backend/ocr_indent_processor.py` - OCR Indent Processing (ACTIVE)
