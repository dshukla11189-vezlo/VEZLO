# Mr Organix - Product Requirements Document

## Original Problem Statement
Build an end-to-end system for a fruits and vegetables retail and quick commerce business that manages:
- Daily orders from QC players (via Excel image OCR) and retailers (via portal)
- Daily rejection adjustments from retailers
- Daily grading/sorting wastage recording
- Flexible procurement from farmers with different units (Kg, custom sizes, bunches)
- Invoicing, printing, and vendor payment tracking

## Core Requirements
- Admin/Retailer/Staff role-based access
- OCR for manual entry assistance
- PDF Invoicing capability
- Clean/Minimal dashboard
- Mobile responsiveness
- Multi-language support (English, Hindi, Marathi)

## User Personas
1. **Admin**: Full system access, manages procurement, orders, payments, and invoicing
2. **Retailer**: Places orders, views order history, manages rejections
3. **Staff**: Records procurement, wastage, and assists with daily operations

## Technical Stack
- Frontend: React 19 + Tailwind CSS + Shadcn/UI
- Backend: FastAPI (Python)
- Database: MongoDB
- Localization: i18next + react-i18next
- OCR: Tesseract (system-level)
- PDF: ReportLab

---

## What's Been Implemented

### Phase 1: Core MVP (COMPLETED)
- [x] Role-based authentication (Admin, Retailer, Staff)
- [x] Responsive mobile-friendly layouts with sidebar navigation
- [x] **P&L Dashboard** with Gross/Net profit calculations (COMPLETED - Mar 2026)
  - [x] Summary cards: Sales, Purchase, Wastage, Gross Profit, Variable Exp, Net Profit
  - [x] Daily P&L breakdown with charts (Bar & Line)
  - [x] Customer-wise sales analysis
  - [x] Product-wise P&L with margin %
  - [x] Expense breakdown (Variable & Fixed categories)
  - [x] Purchase by Farmer/Supplier
  - [x] Date range filter
- [x] Products management (CRUD)
- [x] Currency localization (Indian Rupee)

### Phase 2: Procurement Module (COMPLETED)
- [x] Farmer management with CRUD operations
- [x] Farmer banking details (Account, IFSC, Bank Name, Branch, UPI)
- [x] Materials supplied tracking per farmer
- [x] Flexible unit purchasing (Kg, Bunch, Piece, Pack)
- [x] Custom bunch sizes
- [x] Autocomplete dropdowns with recent selections
- [x] Purchase history with filters (date range, farmer, product)
- [x] Edit/Delete historical procurement records
- [x] Purchase templates (save/load repeat orders)
- [x] Payment tracking (paid, partial, pending)
- [x] Purchase remarks/notes field
- [x] **Pending Payments Tab** - Farmer-wise pending amounts view (Dec 2026)
- [x] **Date/Farmer filters** for pending payments
- [x] **Bulk Payment feature** - Pay multiple farmers at once
- [x] **Auto-populate from Previous Day** (COMPLETED - Mar 29, 2026):
  - [x] "Record Purchase" modal shows "Yesterday's Purchases" section
  - [x] Lists previous day's procurements with farmer name, item count, total amount
  - [x] "Use as Template" button pre-fills form with selected farmer's purchase data
  - [x] "Load All Items" button loads all yesterday's items at once
  - [x] Toast notification confirms data loaded
  - [x] Backend endpoint: GET /api/procurement/previous-day
- [x] **Manual Purchase Layout Refactor** (COMPLETED - Apr 03, 2026):
  - [x] Single-row table layout matching "Yesterday's Purchases" design
  - [x] All fields in one row: Farmer, Product, Qty, Unit, Size, Rate, Total, Paid
  - [x] Remarks field moved to bottom of form
  - [x] Modal no longer closes on outside click (prevents data loss)
  - [x] Summary row showing Total, Paid, and Pending amounts

### Phase 4: Quick Commerce Module (IN PROGRESS - Dec 2026)
- [x] Renamed "QC Orders" to "Quick Commerce" in sidebar
- [x] Created 3-tab structure: Indent, Dispatch, GRN
- [x] **Indent Section**:
  - [x] Add QC Customer (Blinkit, Zepto, Instamart, etc.)
  - [x] Create Indent with: Customer Name, Product Name, Product Unit, Required Qty, Lot Size
  - [x] Auto-calculate No. of Crates (Required Qty / Lot Size)
  - [x] Edit/Delete Indents
  - [x] Status tracking (pending, dispatched, completed)
  - [x] Packaging/Variant CRUD management (with weight in grams)
  - [x] Indent history filtering (date, customer, product)
  - [x] Export buttons (Excel/PDF - UI ready)
  - [x] Total Required Qty summary at top of table (Mar 2026)
  - [x] **BUG FIX**: AutocompleteInput crash when typing in Packaging/Variant field (Mar 2026)
- [x] **Dispatch Section** (COMPLETED - Mar 2026):
  - [x] Log-based dispatch entries (multiple dispatches per indent)
  - [x] Support for partial dispatches (e.g., Morning 1200, Evening 800)
  - [x] Expandable indent cards showing dispatch history
  - [x] "New Dispatch" button with dialog to enter supplied quantities
  - [x] Dispatch time tracking (e.g., "09:00 AM")
  - [x] Remaining qty calculation and status (Pending/Partial/Fully Dispatched)
  - [x] Summary totals: Total Required, Total Dispatched, Remaining
  - [x] Difference column with color coding (Red < Required, Green > Required)
  - [x] Delete dispatch entries
- [x] **Invoice System** (COMPLETED - Mar 2026):
  - [x] Invoice number format: CUS-DDMMMYYYY-NNN (e.g., NIN-26MAR2026-001)
  - [x] Customer-specific formats:
    - Ninjacart: S.No, Product, Packaging, Indent Qty, Supplied Qty, Lot Size, Crates, Receiving Qty (No Rate)
    - Standard: Same + Rate and Amount columns
  - [x] **Day-based invoicing**: Select multiple products from dispatches for a single invoice
  - [x] Multi-item selection with checkboxes and "Select All" option
  - [x] Filter by customer and dispatch date
  - [x] **Dedicated Invoices Tab** with table view of all invoices
  - [x] **Invoice list filters**: Date (from/to), Customer, Product search (Mar 2026)
  - [x] Download/Print PDF button (opens printable window)
  - [x] **Improved invoice PDF format** with professional styling (Mar 2026)
  - [x] Edit/Delete invoices from Invoices tab
  - [x] Backdated invoice support
  - [x] **Receiving Qty blank** for Ninjacart invoices (Mar 2026)
  - [x] **Invoice Layout Format Verification** (Mar 28, 2026):
    - [x] **Ninjacart Format**: Indent, Supplied Qty, Lot Size, Crates, Receiving (blank). Total row shows Indent, Supplied Qty, Crates.
    - [x] **Standard Format**: Indent, Supplied Qty, Rate, Amount, Receiving (blank). Total row shows Indent, Supplied Qty, Amount. Includes "Total Amount in words" section.
    - [x] Complete borders on all four sides of all sections (header, items table, footer)
    - [x] `numberToWords()` function for Indian number system (Lakhs, Crores)
  - [x] Backend API: GET/POST/PUT/DELETE /api/qc-invoices
- [x] **Dispatch Section UI Update** (Mar 2026):
  - [x] Product name and packaging visible in collapsed header row
  - [x] Date removed from header (decluttered view)
  - [x] Dispatched/Total ratio per product shown
- [ ] **GRN Section**: Record accepted vs rejected quantities
- [x] **GRN - Ninjacart CSV Upload** (COMPLETED - Mar 2026):
  - [x] Strict date validation: Only process CSV rows with matching dispatch dates
  - [x] Skip rows without dispatch, return detailed warnings
  - [x] Rate/Unit, Amount, Loss/Gain columns in GRN table
  - [x] Export to CSV functionality
  - [x] Save GRN to database

### Phase 3: Multi-Language Support (COMPLETED - Dec 2026)
- [x] i18next integration with language detection
- [x] Language switcher in desktop header (top right)
- [x] Language switcher in mobile header
- [x] English translations (en.json)
- [x] Hindi translations (hi.json)
- [x] Marathi translations (mr.json)
- [x] Dashboard translations
- [x] Sidebar navigation translations
- [x] Procurement page translations
- [x] Farmer form translations
- [x] Language preference persistence (localStorage)

### Stock Status Enhancement (COMPLETED - Mar 29, 2026)
- [x] **"Enter Closing" button** always visible (not just for today)
- [x] **Closing modal with checkboxes** - Select multiple products for closing at once
- [x] **Shows products with activity** - Opening > 0 OR purchased OR dispatched
- [x] **Available qty calculation** - Opening + Purchase - Dispatch
- [x] **Wastage auto-calculated** - Available - Closing
- [x] **Select All Open** button for quick selection
- [x] **Status column** - Open/Closed badges
- [x] **Date-specific closing** - Can close stock for any historical date
- [x] **Backend fix**: Dispatch dates now handled correctly (datetime objects and strings)
- [x] New endpoint: `/api/stock-status/closable-products?date=YYYY-MM-DD`

### Retailer Invoice Creation (COMPLETED - Mar 29, 2026)
- [x] **Create Invoice button** in Invoices tab (with retailer selector)
- [x] **Item-level selection** - Select individual items from dispatches (not whole dispatches)
- [x] **Uninvoiced items modal** - Shows all uninvoiced items with checkboxes
- [x] **"Select All"** button for quick selection
- [x] **Invoice generation** from selected items
- [x] **Edit Invoice functionality** - Update date, item quantities, MRP, remarks
- [x] **Standard invoice layout** with:
  - Complete borders on all sections (header, items, footer)
  - Columns: #, Item name, Indent, Supplied Qty, Rate, Amount, Receiving
  - Total row with MRP Value, Commission %, and Net Receivable
  - "Total Amount in words" section
  - Company footer with address
- [x] **Download/Print** functionality with new professional layout
- [x] All column headers showing "NET RECEIVABLE" (not "Net Payable")
- [x] Invoice table shows company_name instead of owner name
- [x] **Rejection Details in Invoice Modal** (COMPLETED - Mar 29, 2026):
  - [x] Shows columns: Dispatch Date, Product, Supplied, Rejected (red), Net Qty (green), MRP, Net Amount
  - [x] Automatically fetches rejections for retailer and matches to products
  - [x] Calculates Net Qty = Supplied - Rejected
  - [x] Calculates Net Amount = Net Qty × MRP
  - [x] Summary shows: Selected Items count, Net Total, Rejected Deduction amount
  - [x] Backend updated to accept `selected_items` with rejection data

---

## Prioritized Backlog

### P0 - Critical (Needed for MVP completion)
- [ ] OCR QC Order Processing - Connect UI to ocr_processor.py
- [x] **Stock Status & Wastage Dashboard** (COMPLETED - Mar 2026)
  - [x] Daily stock tracking: Opening, Purchase, Dispatch, Closing quantities
  - [x] **Real-time sync**: Purchases from Procurement and Dispatches from QC automatically update
  - [x] Weighted average price calculation
  - [x] Auto-calculated wastage: (Opening + Purchase - Dispatch - Closing)
  - [x] Staff can enter closing stock via dialog modal
  - [x] **Closing dialog filters**: Only shows products with activity (opening > 0 OR purchase > 0)
  - [x] **Date & Product filters**: View historical data for any past date
  - [x] **Edit/Delete line items**: Admin can correct any stock entry
  - [x] **30-second auto-refresh** for live data
  - [x] Wastage Dashboard with 7/15/30 day trends
  - [x] Top wastage products ranking
  - [x] Visual bar charts and insights/recommendations
  - [x] Backend: GET /api/stock-status/today, POST /api/stock-status/close, GET /api/stock-status/wastage-dashboard, PUT/DELETE /api/stock-status/{id}

### P1 - High Priority
- [x] Quick Commerce Dispatch section - Create dispatches from indents (COMPLETED)
- [x] Quick Commerce Invoicing - Invoice generation with customer-specific formats (COMPLETED)
- [x] Quick Commerce GRN section - Ninjacart CSV upload for GRN matching (COMPLETED - Mar 2026)
  - [x] GRN table: Date, Customer, Product, Packaging, Supplied Qty, GRN, Difference
  - [x] CSV upload for Ninjacart (PO_DeliveryDate, Sku Name, GRNQuantity, GRNPrice, WeightUnit)
  - [x] Automatic conversion: Kg to units based on packaging weight
  - [x] Rate calculation: Per kg to per unit based on packaging weight
  - [x] Multi-date CSV support
  - [x] Difference highlighting: Green (GRN > Supplied), Red (GRN < Supplied)
  - [x] **Strict Date Validation**: CSV rows only processed if dispatch exists for that date (Mar 2026)
  - [x] **Warnings for Skipped Rows**: Returns detailed warnings for rows without matching dispatch
  - [x] **Extended GRN Table Columns**: Rate/Unit (₹), Amount (₹), Loss/Gain (₹) (Mar 2026)
  - [x] **Loss/Gain Calculation**: difference × rate_per_unit with color coding
  - [x] **Export CSV Button**: Downloads GRN data as CSV file
  - [x] **Save GRN**: Persists matched GRN data to database
- [x] **Variable & Fixed Expenses Tracking** (COMPLETED - Mar 2026)
  - [x] Variable Expenses: Transportation, Packaging, Labor, Fuel, Loading/Unloading, Commission, Cold Storage, Market Fees
  - [x] Fixed Expenses: Rent, Salaries, Utilities, Insurance, Vehicle EMI, Loan EMI, Taxes, Software, Internet/Phone
  - [x] Employee expense claims with reimbursement workflow
  - [x] Bulk settlement for multiple expenses
  - [x] Auto-generate recurring monthly fixed expenses
  - [x] Date/Category/Status filters
  - [x] Category breakdown summary
  - [x] **Vertical Expense Allocation** (COMPLETED - Apr 1, 2026)
    - [x] "Vertical Incurred For?" field in Variable Expenses form (QC Only, Retail Only, All - Split Equally)
    - [x] QC-specific expenses allocated only to QC P&L
    - [x] Retail-specific expenses allocated only to Retail P&L
    - [x] "All" expenses split equally (50/50) between QC and Retail
    - [x] Fixed expenses always split equally (50/50) between QC and Retail
    - [x] VERTICAL column added to expenses table
    - [x] Backend P&L calculation updated for accurate vertical bifurcation
- [x] **P&L Dashboard UI Updates** (VALIDATED - Mar 27, 2026)
  - [x] Customer Name column in expanded product breakdown
  - [x] NET P/L removed from daily row headers (available in summary cards)
  - [x] **Today's Quick Summary Widget** - Shows dispatches, pending indents, procurements, top products at-a-glance
  - [x] **Sales Calculation Fix** (VALIDATED - Mar 27, 2026) - Sales now correctly aggregates:
    - QC GRN data (grn_amount or amount from qc_grns collection)
    - Retailer Dispatches (net_payable after commission deduction)
  - [x] **Detailed Line Items P&L Breakdown** (COMPLETED - Mar 27, 2026)
    - Customer → Product hierarchy (not Product → Customer)
    - Columns: Customer, Product, Unit, Qty, Kg, Revenue, COGS, Wastage (Kg), Wastage (₹), Gross Profit, S.P./Kg, P.P./Kg, Margin %, Profit/Qty
    - Separate entries per customer - if same product sold to both Ninjacart and Tamanna, shows 2 rows
    - **Bug Fix**: Fixed variable shadowing issue where `gross_profit` was being overwritten in loop
- [x] **Role-Based Access Control** (COMPLETED - Mar 27, 2026)
  - [x] **Admin**: Full access to all tabs including P&L Dashboard, Fixed Expenses, Payments, User Management
  - [x] **Staff**: Limited access to Procurement, Stock Status, Quick Commerce, Retailer Orders, Wastage Dashboard, Variable Expenses, Invoices
  - [x] **Retailer**: Individual login with own portal (structure ready, portal to be built)
  - [x] **User Management Page**: Admin can create/edit/delete users with role assignment
  - [x] Backend APIs: GET/POST/PUT/DELETE /api/users (Admin only)
- [x] **Retailer Portal System** (COMPLETED - Mar 27, 2026)
  - [x] **Admin/Staff Retailer Orders Page** with tabs: Indents, Dispatches, Invoices, Rejections, Payments
  - [x] **Create Indent on behalf of Retailer** with product/variant/quantity selection
  - [x] **Dispatch with mandatory MRP** - auto-calculates total value and net payable (commission applied)
  - [x] **Edit/Delete Dispatches** - Admin/Staff can edit dispatch items/MRP, delete uninvoiced dispatches
  - [x] **Separate Invoice Creation** - Select multiple dispatches for one invoice
  - [x] **Commission System**: Each retailer has configurable commission % (set in User Management)
  - [x] **Net Payable Calculation**: MRP Value × (1 - commission%) 
  - [x] **Record Rejections**: Staff/Admin can record product rejections with reason
  - [x] **Record Payments**: Track payments from retailers (Cash, UPI, Bank Transfer, Cheque)
  - [x] **Retailer Portal Dashboard**: Shows Items Received, Total Invoice, Amount Paid, Pending Amount
  - [x] **Payment Summary**: Detailed breakdown with MRP, Commission, Net Payable, Rejections, Balance Due
  - [x] **Quick Stats**: Pending Indents, Total Dispatches, Items Rejected, Payments Made
  - [x] **Retailer Create Indent**: Retailers can create their own indents
  - [x] **Retailer Confirm GRN**: Retailers can confirm received quantities vs supplied
  - [x] **Retailer View Rejections**: Read-only view of rejected items
  - [x] **Retailer View & Download Invoices**: Retailers can see and print/download their invoices
  - [x] **Invoice Rejection Fix** (Apr 1, 2026): rejection_amount = sum(rejected_qty × mrp) per item
  - [x] **Retailer Inventory Tracking** (Apr 1, 2026):
    - [x] New "Inventory" tab in retailer portal
    - [x] Generate from Dispatch button creates items from retailer dispatches
    - [x] Tracks Opening, Received, Sold, Wastage, Closing quantities
    - [x] Editable Sold and Wastage fields with auto-calculated Closing
    - [x] Save and Delete buttons for each item
    - [x] Previous day's closing becomes next day's opening
    - [x] **Add Item Modal** (Apr 1, 2026): Manual single item creation with Product/Variant dropdowns and Opening/Received qty inputs
    - [x] **Save All Button** (Apr 1, 2026): Bulk save all pending changes with count indicator
    - [x] **Row Highlighting** (Apr 1, 2026): Yellow background for unsaved changes
    - [x] **Mobile-Optimized Table** (Apr 1, 2026): Compact design with smaller fonts, inputs, and abbreviated headers for mobile viewing
  - [x] **GRN Confirmation Visual Feedback** (Apr 1, 2026): Dispatches with confirmed GRNs show green "GRN Confirmed" badge instead of button
  - [x] **Indent Export Totals** (Apr 1, 2026): PDF and Excel exports include TOTAL row with sum of Qty and Crates columns
  - [x] **Previous Day Carry Forward** (Apr 1, 2026): When generating inventory, Opening qty auto-populates from previous day's Closing qty
  - [x] **Invoice Item-Level Filtering** (Apr 1, 2026): Already invoiced items are excluded from invoice creation modal (both QC and Retail)
  - [x] **Stock Status Dispatch Calculation Fix** (Apr 1, 2026): Fixed incorrect dispatch qty calculation. Now properly uses QC Packaging table weights (500gm, 250gm, etc.) to convert units to kg. Added `extract_weight_from_packaging_name()` helper function. Updated packaging database with correct `weight_gm` values.
  - [x] Backend APIs: /api/retailer-indents, /api/retailer-dispatches, /api/retailer-invoices, /api/retailer-grn, /api/retailer-rejections, /api/retailer-payments, /api/retailer-dashboard
  - [x] **Retailer Orders UI Enhancement** (COMPLETED - Mar 29, 2026):
    - [x] **Dashboard Summary Cards**: Indents, Dispatches, Net Receivable, Payments with pending amounts
    - [x] **Shop Name Display**: All tables show company_name instead of owner name
    - [x] **Search-based Product Selection**: Autocomplete dropdown in New Indent modal (like QC)
    - [x] **Edit/Delete Indents**: Edit and Delete buttons in Actions column
    - [x] **"Net Receivable" Column**: Renamed from "Net Payable" in Dispatches table
    - [x] **Transport Charges Field**: Optional field in Dispatch modal, shown in TRANSPORT column
    - [x] **Improved Rejection Workflow**: Select retailer + date → auto-populates dispatch items table with checkboxes, supplied qty, MRP (auto-filled), reason dropdown
    - [x] **Rejection Validation**: qty cannot exceed supplied qty, remarks field added
    - [x] **Payment Context Summary**: Shows Total MRP, Commission, Net Receivable, Rejections, Already Paid, Pending Amount before recording payment
- [ ] Retailer Invoice Creation (like QC module - NOT YET IMPLEMENTED)
- [ ] Retailer Rejection Adjustment workflow
- [x] **Excel Export Functionality** (COMPLETED - Mar 30, 2026):
  - [x] **RetailerOrders**: Export buttons for Indents, Dispatches, Invoices, Rejections, Payments tabs
  - [x] **Procurement**: Export buttons for Purchase History, Pending Payments, Farmers tabs
  - [x] **StockStatus**: Export button for Daily Stock Status
  - [x] **WastageDashboard**: Export button for Wastage data
  - [x] CSV format download with proper column headers
  - [x] Success toast notification with record count
- [x] **Code Organization - Section Markers** (COMPLETED - Mar 30, 2026):
  - [x] **Backend (server.py)**: Added Table of Contents + 21 section markers for easy navigation
  - [x] **Frontend (QuickCommerce.js)**: Added Table of Contents + 12 section markers
  - [x] Search for "SECTION:" to jump to any code section
  - [x] All APIs and functionality working correctly after reorganization
- [x] **P&L Dashboard Enhancements** (COMPLETED - Mar 30, 2026):
  - [x] **QC vs Retail Bifurcation**: New "Sales by Vertical" section with pie chart indicators
  - [x] **Daily P&L Table**: Added QC and RETAIL columns showing sales split per day
  - [x] **TYPE Column**: Expanded line items now show QC/Retail badge
  - [x] **Company Name Fix**: Retail customers now show shop name (company_name) instead of owner name
  - [x] **Wastage Allocation**: Proportional wastage distribution based on kg supplied ratio
- [x] **Gmail Integration for Ninjacart GRN** (COMPLETED - Mar 30, 2026):
  - [x] OAuth2 Gmail authentication flow
  - [x] Auto-sync scheduled for 6:00 AM IST daily
  - [x] Parses CSV attachments and email body for GRN data
  - [x] "Connect Gmail" / "Disconnect" buttons on Backup page
  - [x] "Sync Now" button for manual sync trigger
  - [x] **Removed "Reset All Data" button** from production
  - [x] **OAuth PKCE Bug Fix** (Mar 30, 2026): 
    - Fixed redirect_uri_mismatch error caused by PKCE code_verifier mismatch
    - Now uses manual OAuth URL construction without PKCE (PKCE is optional for server-side flows with client_secret)
    - Uses x-forwarded-host header for proper reverse-proxy support
    - Added debug endpoints: `/api/oauth/gmail/debug-headers`, `/api/oauth/gmail/debug-states`, `/api/oauth/gmail/debug-tokens`
- [x] **Excel Support for GRN Upload** (COMPLETED - Mar 30, 2026):
  - [x] Ninjacart GRN upload now accepts both CSV and Excel (.xlsx, .xls) files
  - [x] Uses openpyxl library for Excel parsing
  - [x] Same matching logic for both file types
- [x] **Multiple Dispatch GRN Distribution Bug Fix** (COMPLETED - Mar 31, 2026):
  - [x] **Bug**: When a product had multiple dispatch entries (e.g., 876 + 924 = 1800), each dispatch incorrectly received the FULL GRN instead of proportional share
  - [x] **Fix**: GRN is now distributed proportionally based on each dispatch's share of total supplied
  - [x] Example: Coriander with 1800 GRN split across dispatches → 876 GRN + 924 GRN (not 1800 + 1800)
  - [x] Also fixed Mint matching to collect ALL matching items (was breaking after first match)
  - [x] Added deduplication by dispatch_id to prevent duplicate GRN entries
- [x] **GRN Table UI Enhancements** (COMPLETED - Mar 31, 2026):
  - [x] **Compact layout** - No horizontal scrolling required
  - [x] Combined Product + Packaging into single column
  - [x] Shortened date format (MM-DD)
  - [x] **Rate Change column (RATE Δ)** - Shows rate increase (green ↑) or decrease (red ↓) compared to previous day
  - [x] Amount column shows total with loss/gain amount inline
  - [x] Compact action buttons
  - [x] **Enhanced summary banner** - Shows file, date, matched count, unmatched count, total amount
  - [x] **Rate changes summary** - Purple panel showing products with rate changes from previous day
  - [x] **Auto-sync badge** - Purple "AUTO-SYNC" badge when GRN synced from Gmail
- [x] **GRN Bug Fixes & Improvements** (COMPLETED - Mar 31, 2026):
  - [x] **Fixed duplicate Palak issue** - Items now deduplicated by dispatch_id + packaging_id (not just dispatch_id)
  - [x] **Saved GRN items removed from pending** - dispatch-summary now uses dispatch_id + product_id + packaging_id key
  - [x] **Larger delta text** - Loss/gain amounts changed from text-[10px] to text-xs for better visibility
  - [x] **Pending dates banner** - Shows "GRN Pending for: date1, date2..." at top of GRN tab
  - [x] **Gmail auto-sync saves to DB** - Updated endpoint to store GRN data in gmail_grn_syncs collection
- [x] **P&L Dashboard Improvements** (COMPLETED - Mar 31, 2026):
  - [x] **Fixed GRN date attribution** - Daily P&L now uses item.dispatch_date (delivery date) instead of grn_date (save date)
  - [x] **Removed "Sales by Vertical"** - Replaced with separate QC and Retail sub-dashboards
  - [x] **QC Dashboard** - Full P&L metrics: Sales, Purchase, Wastage, Gross Profit, Gross Margin %, Var Exp, Fixed Exp, Net Profit, Net Margin, Qty, Orders
  - [x] **Retail Dashboard** - Same full P&L metrics as QC
  - [x] **Added Gross Margin %** - Calculated as Gross Profit / (Purchase + Wastage)
- [x] **GRN Collapsible UI** (COMPLETED - Mar 31, 2026):
  - [x] **Pending GRNs by Date** - One-line summary per date with expand/collapse arrow
  - [x] **Saved GRNs by Date** - One-line summary per date with expand/collapse arrow  
  - [x] **Summary fields** - Date, Total Supplied, Total GRN, Items Count, Total Amount, Difference
  - [x] **Edit button for Saved GRNs** - Pencil icon loads GRN into editor for modification
  - [x] **Delete button** - Trash icon for individual items
- [x] **Edit GRN Functionality** (COMPLETED - Mar 31, 2026):
  - [x] **Backend PUT endpoint** - `/api/qc-grns/{grn_id}` updates existing GRN record
  - [x] **Edit Mode UI** - Yellow "EDIT MODE" banner with pencil icon when editing
  - [x] **"Update GRN" button** - Blue button replaces green "Save GRN" when editing
  - [x] **"Cancel Edit" button** - Clears edit state and returns to normal view
  - [x] **Toast notifications** - "GRN loaded for editing" / "GRN updated successfully"
  - [x] **Full item modification** - Can modify GRN qty, rate, and other fields before saving
- [x] **Daily P&L Table Enhancements** (COMPLETED - Mar 31, 2026):
  - [x] **Increased font sizes** - Item, customer, vertical rows now use `text-sm` for better readability
  - [x] **GM % column** - Gross Margin % with color-coded badges (green ≥20%, yellow 0-20%, red <0%)
  - [x] **₹/UNIT column (Profit/Dispatch)** - Shows profit per unit at all levels (Date, Vertical, Customer, Item)
  - [x] **Unit economics tracking** - Profit = Gross Profit / Supplied Qty, visible throughout hierarchy
  - [x] **Items sorted by GM% descending** - Helps identify highest-margin products first
  - [x] **Date Filter verified** - Top Summary, QC Dashboard, and Retail Dashboard all update correctly based on selected date range
- [x] **GRN Delete Fixes** (COMPLETED - Mar 31, 2026):
  - [x] **Delete All for Date** - Added "Delete All" button to remove all GRN data for a specific date
  - [x] **Individual Item Delete Fix** - Fixed bug where delete was failing due to incorrect item index lookup
  - [x] **Duplicate Detection Warning** - Shows warning when saving GRN if data already exists for the dispatch date(s)
- [x] **Commission at Product Level** (COMPLETED - Apr 1, 2026):
  - [x] Each retail product shows commission = revenue × commission_pct / 100
  - [x] Product Gross P/L = Revenue - COGS - Wastage - Commission  
  - [x] Product GM% = (Gross P/L / Revenue) × 100
  - [x] Commission sums correctly: Product → Customer → Vertical → Date
  - [x] Commission column displayed in amber color in Daily P&L table
  - [x] Customer-level commission calculated from sum of product commissions
- [x] **Variable Expense Vertical Allocation** (COMPLETED - Apr 1, 2026):
  - [x] "Vertical Incurred For?" field in Variable Expenses (QC Only, Retail Only, All)
  - [x] QC-specific expenses allocated only to QC P&L
  - [x] Retail-specific expenses allocated only to Retail P&L
  - [x] "All" expenses split equally (50/50) between QC and Retail
  - [x] Fixed expenses always split equally (50/50) between verticals
- [x] **Wastage & Purchase Calculation Fix** (COMPLETED - Apr 1, 2026):
  - [x] Vertical Dashboard now uses SUM of actual line item COGS (not proportional by sales %)
  - [x] Vertical Dashboard now uses SUM of actual line item wastage (not proportional by sales %)
  - [x] Wastage distributed proportionally by **DISPATCH Kg** (not GRN qty)
  - [x] Retail Dashboard Purchase and Wastage now match line item totals exactly
  - [x] QC Dashboard Purchase and Wastage now match line item totals exactly
  - [x] Renamed "Purchase Cost" to "COGS" on main dashboard
  - [x] Added total_cogs field = sum of all line item COGS
  - [x] Gross Profit now calculated from actual COGS (not procurement total)
  - [x] **QC Sub-Dashboard: GRN LOSS metric** (Apr 1, 2026)
    - [x] Shows Dispatch - Received difference in pink box
    - [x] Net Profit = Gross Profit - GRN Loss - Var Exp - Fixed Exp
  - [x] **Retail Sub-Dashboard: COMMISSION metric** (Apr 1, 2026)
    - [x] Shows total commission in amber box
    - [x] Already deducted from Gross Profit calculation
- [x] **Retailer Section Improvements** (COMPLETED - Mar 31, 2026):
  - [x] **Search-based Retailer Selection (Indent)** - Replaced dropdown with searchable input for retailer selection in Create Indent modal
  - [x] **Larger Product/Variant Dropdowns** - Increased max-height from 40 to 72 for better visibility (shows 12 items)
  - [x] **Empty Quantity Fields** - Changed quantity default from 0 to empty string, no prefix 0
  - [x] **Empty MRP Fields in Dispatch** - Changed MRP/Supply Qty defaults to empty string, no prefix 0
  - [x] **Edit Button for Rejections** - Added pencil icon Edit button alongside Delete in Rejections table
  - [x] **Search-based Retailer Selection (Payments)** - Replaced dropdown with searchable input in Record Payment modal
  - [x] **Empty Amount Field** - Payment amount field now shows placeholder instead of 0
- [x] **Retailer Indent UI Fixes** (COMPLETED - Mar 31, 2026):
  - [x] **Product/Variant typing now works** - Fixed issue where typed text wasn't appearing in input fields
  - [x] **Dropdown shows on focus** - Product/Variant dropdowns now appear when focusing the input field
  - [x] **Bigger dropdown boxes** - Increased dropdown max-height to 72, shows 12 items instead of 8
  - [x] **Shop name as label** - Changed "Retailer *" to "Retailer (Shop) *" with placeholder "Search shop name..."
  - [x] **Owner shown as secondary** - Retailer dropdown shows shop name primary, owner name secondary
  - [x] **Invoice commission breakdown** - Create Invoice modal now shows:
    - Gross Total (MRP Value)
    - (-) Rejected Items
    - Net Total
    - (-) Commission (X%)
    - Amount Payable to Retailer
- [x] **Procurement Date Picker Feature** (COMPLETED - Mar 31, 2026):
  - [x] **Date picker at top of modal** - "Record purchases for:" date input at top of Previous Day's section
  - [x] **Dynamic template loading** - Shows purchases from day before selected date as template
  - [x] **Reference date display** - Shows "Shows purchases from {date} as template" message
  - [x] **API updated** - Backend `/api/procurement/previous-day` now accepts `reference_date` query parameter
  - [x] **Empty state handling** - Shows "No purchases found for {date}" message when no data for previous day
  - [x] **Purchases saved to selected date** - When saving selected items, they are recorded for the reference date
- [x] **Retailer Portal Redesign** (COMPLETED - Mar 31, 2026):
  - [x] **Shop name as welcome text** - Shows "Welcome, {company_name}" instead of owner name
  - [x] **Owner shown as secondary** - "Owner: {name} • Commission: X%"
  - [x] **Invoice text fix** - Changed "Amount Payable to Retailer" → "Amount Payable by Retailer"
  - [x] **New Dashboard Cards**:
    - Total Items Received (blue)
    - Total Items Sold (green) - Now shows NET qty after rejections
    - Your Earnings (emerald) - Now calculated on NET value after rejections
    - Avg Earning/Day (purple)
  - [x] **Additional Stats Row** - Supplied Qty, Rejected Qty, Net MRP Value, Payable by You, Amount Paid
  - [x] **Date Filter** - Filter period with from/to dates and Refresh button
  - [x] **Recent Orders Table** - Grouped by date with columns: DATE | SUPPLIED | REJECTION | NET QTY | NET AMT | COMMISSION | PAYABLE
  - [x] **Expandable date rows** - Click to show product-wise breakdown
- [x] **Invoice Format Consistency** (COMPLETED - Mar 31, 2026):
  - [x] **Admin Invoice columns**: INVOICE # | DATE | RETAILER | ITEMS | GROSS VALUE | REJECTION | NET VALUE | COMMISSION | RECEIVABLE | ACTIONS
  - [x] **Retailer Invoice columns**: INVOICE # | DATE | ITEMS | GROSS VALUE | REJECTION | NET VALUE | COMMISSION | PAYABLE | PDF
  - [x] **Expanded item table columns**: Product | Variant | Supplied Qty | Rejected | Net Qty | MRP | Net Amount
  - [x] **Invoice Summary in expanded view** shows:
    - Gross Total
    - (-) Rejections (red, if any)
    - Net Total
    - Your Commission (X%)
    - Amount Payable by You
  - [x] **Rejection column highlighted in red**
  - [x] **Commission column highlighted in green**
  - [x] **Footer totals** for all columns
- [x] **Retailer Dashboard Metrics Fix** (COMPLETED - Mar 31, 2026):
  - [x] **Bug**: Earnings calculated on GROSS value instead of NET value after rejections
  - [x] **Fix**: Earnings now calculated as: Commission % × (Gross MRP - Rejections)
  - [x] **Fix**: Items Sold now shows NET quantity (Supplied - Rejected)
  - [x] **Dashboard Stats Updated**:
    - Supplied Qty: 69
    - Rejected Qty: -10
    - Net MRP Value: ₹1,067.00 (₹1,243 - ₹176)
    - Your Earnings: ₹213.40 (20% of ₹1,067)
    - Payable by You: ₹853.60 (₹1,067 - ₹213.40)
  - [x] **Recent Orders Table Updated** with columns: DATE | SUPPLIED | REJECTION | NET QTY | NET AMT | COMMISSION | PAYABLE
  - [x] **Invoice Model Updated**: Added `gross_value` and `rejection_amount` fields
  - [x] **Admin Invoice Table Updated**: Shows GROSS VALUE | REJECTION | NET VALUE | COMMISSION | RECEIVABLE
- [x] **Product Lifecycle Duration** (COMPLETED - Mar 31, 2026):
  - [x] Added `lifecycle_duration` field to Product model (Low/Medium/High)
  - [x] Added dropdown in Products Admin UI to set lifecycle for each product
- [x] **Dashboard Date Filter Fix** (COMPLETED - Mar 31, 2026):
  - [x] **Bug**: P&L report API was throwing KeyError when filtering to dates with no QC data
  - [x] **Fix**: Added condition to only count invoices for customers with items in the filtered date range
  - [x] Daily P&L Breakdown now correctly shows only data for selected date range
- [x] **Rejections Grouped by Date** (COMPLETED - Mar 31, 2026):
  - [x] **Admin Portal**: Rejections tab now shows date rows (expandable to individual items)
  - [x] **Retailer Portal**: Rejections tab now shows date rows (expandable to individual items)
  - [x] Date rows show: DATE | RETAILER (count) | QTY | VALUE | (items count)
  - [x] Expanded rows show: Product (variant) | Retailer | QTY | VALUE | REASON | ACTIONS
  - [x] Added `expandedRejectionDates` state to both portals
- [x] **GRN Total Supplied Duplicate Fix** (COMPLETED - Apr 2, 2026):
  - [x] **Bug**: When multiple Excel SKUs matched the same dispatch item, `supplied_qty` was counted multiple times, causing GRN "Total Supplied" to show inflated values (e.g., 6053 instead of 3933)
  - [x] **Root Cause**: For PCS SKUs, each SKU was processed separately and appended to `matched_items` with the full dispatch `supplied_qty`, causing duplicates
  - [x] **Fix**: Implemented deduplication logic for PCS SKUs - now accumulates GRN quantities for the same dispatch item instead of creating duplicate entries
  - [x] Combined SKU names shown (e.g., "SKU1 + SKU2") when multiple SKUs match
  - [x] Added `processed_dispatch_items` tracking to prevent cross-product group duplicates
  - [x] Kg SKUs now also check against `processed_dispatch_items` to prevent any duplicate entries
- [x] **GRN Loss Dashboard Calculation Fix** (COMPLETED - Apr 2, 2026):
  - [x] **Bug**: Fenugreek (Methi) GRN Loss (₹902.53) not showing in QC Dashboard - only showing ₹19 (Dill Leaf)
  - [x] **Root Cause 1**: When GRN item had no `grn_qty_kg` stored, code incorrectly fell back to `supplied_qty` instead of using actual `grn_qty` (piece count)
  - [x] **Root Cause 2**: When `rate_per_kg` was 0/missing for PCS items, loss_value was calculated as 0
  - [x] **Fix 1**: Updated GRN loss calculation to properly use `grn_qty` (piece count) to calculate `grn_qty_kg`
  - [x] **Fix 2**: If `rate_per_kg` is 0, derive it from `rate_per_unit` using packaging weight, or fall back to stored `loss_gain_amount`
- [x] **QC Gross Margin % Formula Fix** (COMPLETED - Apr 2, 2026):
  - [x] **Bug**: QC Summary Dashboard showed 84.4% Gross Margin but Daily P&L showed 45.8% - values didn't match
  - [x] **Root Cause**: QC Gross Margin was incorrectly calculated as `Gross Profit / Cost Base` instead of `Gross Profit / Sales`
  - [x] **Fix**: Changed `qc_gross_margin = (qc_gross_profit / qc_cost_base * 100)` to `qc_gross_margin = (qc_gross_profit / total_qc_sales * 100)`
  - [x] Now both Dashboard and Daily P&L will show consistent ~46% Gross Margin
- [x] **Simplified Retailer Inventory System** (COMPLETED - Apr 2, 2026):
  - [x] Complete redesign of Inventory tab in Retailer Portal
  - [x] **"Record Closing" button**: Opens modal with all products from database
  - [x] **Date picker**: Select which date the closing is for
  - [x] **Product list**: All products with single "Qty" input box each
  - [x] **Save all at once**: Saves only products with values entered (blank = not saved)
  - [x] **View closing history**: Select any date to view recorded closing for that date
  - [x] **Visual feedback**: Green background for filled items, counter showing filled/total
  - [x] **Backend APIs**: Added 4 new endpoints for closing inventory management
- [x] **GRN Display Units Fix** (COMPLETED - Apr 3, 2026):
  - [x] **Bug**: For Kg-based items (like Amaranthus, Curry Leaves, Palak), GRN was showing Kg values instead of piece count
  - [x] **Example**: Amaranthus Red (240-260 gm) showed GRN=13 Kg instead of 52 pieces (matching Supplied=50)
  - [x] **Fix**: Updated GRN matching to convert Kg to piece count using packaging weight
  - [x] Both Supplied and GRN now show piece count for consistency
  - [x] Note: Existing saved GRN data unchanged; fix applies to new GRN uploads
- [x] **Complete Hindi Translations** (COMPLETED - Apr 3, 2026):
  - [x] Added comprehensive Hindi translations for all app sections
  - [x] Updated en.json with expanded translation keys
  - [x] Translations cover: Dashboard, Procurement, Quick Commerce, Retailer, Invoices, Wastage, Expenses, Payments, Stock Status, Backup, Users, Login, Common terms
  - [x] Language switcher now shows only English and Hindi (removed Marathi)
- [x] **Product Name Hindi Translations** (COMPLETED - Apr 3, 2026):
  - [x] Added `name_hi` field to Product model for Hindi translations
  - [x] Updated 42 products with Hindi names (धनिया, पालक, टमाटर, etc.)
  - [x] Product names display in Hindi when language is set to Hindi
- [x] **Procurement Form Redesign** (COMPLETED - Apr 3, 2026):
  - [x] Changed manual purchase entry from card-based layout to table-style one-line rows
  - [x] Each product row now shows: Product Name | Unit | Size | Qty | Rate | Total
  - [x] "Add Product" button moved below the table with dashed border style
  - [x] Matches the layout of "Previous Day's Purchases" table for consistency
  - [x] Added compact mode to AutocompleteInput component for table rows
- [x] **Invoice Item Table Columns Synced** (COMPLETED - Mar 31, 2026):
  - [x] Both Admin & Retailer portals now show: Product | Variant | Supplied Qty | Rejection | Billable Qty | Rate | Amount
  - [x] Subtotals row shows totals for each column
  - [x] Rejection column highlighted in red, Billable Qty in green
- [x] **Admin Panel Values Fixed** (COMPLETED - Mar 31, 2026):
  - [x] Net Receivable now based on Invoice net_payable (₹853.60), not dispatch (₹994.40)
  - [x] Pending Payment = Invoiced - Paid (rejections already deducted in invoice)
- [x] **Rejection Loss Block Added** (COMPLETED - Mar 31, 2026):
  - [x] New dashboard block showing total rejection loss amount with date filter
  - [x] Shows count of rejections in period
  - [x] Red highlight for visibility
- [ ] Complete translations for remaining pages (Products, QC Orders, etc.)

### P2 - Medium Priority
- [ ] Reports and analytics dashboard
- [ ] Bulk import/export functionality
- [ ] Email notifications

### P3 - Future Enhancements
- [ ] Mobile app (React Native)
- [ ] WhatsApp integration for order updates
- [ ] AI-powered demand forecasting

### Phase 6: Daily Backup System (COMPLETED - Mar 27, 2026)
- [x] Automated daily backup at 11:59 PM IST
- [x] Excel export of all 18 collections
- [x] Email delivery via Resend API to dshukla11189@gmail.com
- [x] Manual backup trigger button
- [x] Direct Excel download button
- [x] Reset Data for Production feature (clears test data, keeps admin accounts)
- [x] Admin-only access to backup features

### Mar 28, 2026: Invoice Layout Verification
- [x] Verified Ninjacart invoice format (Lot Size, Crates columns - no Rate/Amount)
- [x] Verified Standard invoice format (Rate, Amount columns + "Amount in words")
- [x] Confirmed complete borders on all sections
- [x] `numberToWords()` function working correctly for Indian number system

### UI/UX Improvements (COMPLETED - Apr 2026)
- [x] **UI Truncation Fix** - Replaced "+X more" truncation with scrollable lists (Apr 04, 2026):
  - [x] Procurement Templates: Products list now scrollable (max-h-[100px])
  - [x] QuickCommerce GRN: Pending dates now scrollable and wrapped (max-h-[60px])
  - [x] QuickCommerce GRN: Rate changes now scrollable (max-h-[80px])
  - [x] Retailer Inventory: Pending items warning now scrollable (max-h-[150px])
- [x] **GRN Rate Change Persistence** - Rate change data now saved and displayed (Apr 04, 2026):
  - [x] Added `rate_change` and `rate_change_percent` fields to QCGRNItem model
  - [x] Added "RATE Δ" column to Saved GRN Records table
  - [x] Rate changes calculated during upload are now persisted when GRN is saved
  - [x] Note: Existing GRNs show "-" as they were saved before this update
- [x] **Retailer Portal Redesign** (Apr 05, 2026):
  - [x] Removed "Retailer Portal" title and sidebar
  - [x] Added hamburger menu with: Home, My Indents, My Orders, Invoices, Closing, Inventory, My Account
  - [x] Big "Your Earnings" card with date picker at top
  - [x] 6 metric boxes: Items Received, Rejection, Items Sold, Total MRP Value, Payable by You, Paid Amount
  - [x] **My Indents tab**: Added to menu, shows "Auto Generated by System" tag for auto-indents
  - [x] **My Orders tab**: Added date picker filter for order history
  - [x] **Inventory tab**: Complete redesign with Opening Qty, Received, Rejection, Items Sold, Closing Qty columns
  - [x] **Closing tab**: New tab for viewing/editing closing history; Edit/Delete only allowed for today
  - [x] **Record Closing**: Date locked to today only - no date picker in modal
  - [x] **My Account tab**: Removed Account Summary, added Referral Code field (MRO-XXXXXXXX format)
  - [x] Layout component updated with `hideTitle` and `hideSidebar` props
  - [x] Backend API updated to return email, phone, address, referral_code in retailer dashboard

### Auto Indent Generation (COMPLETED - Apr 2026)
- [x] **Auto-populate retailer indents for next day** (Apr 05, 2026):
  - [x] Scheduled job runs at 11 PM IST daily
  - [x] Calculates items sold on last 7 occurrences of the same weekday (e.g., last 7 Mondays)
  - [x] Takes average and increases by 10% for recommended quantity
  - [x] Creates indent with `is_auto_generated: true` flag
  - [x] Shows "Auto Generated by System" tag in both Admin and Retailer portals
  - [x] Remarks field shows: "Auto-generated based on last 7 [Day]s sales"
  - [x] Admin can edit/dispatch the auto-generated indent like regular indents
  - [x] Manual trigger endpoint: `POST /api/admin/generate-auto-indents`
- [x] **Referral code auto-generation for new retailers**:
  - [x] Format: MRO-XXXXXXXX (8 alphanumeric characters)
  - [x] Automatically generated when creating new retailer user

### Retailer Portal Updates (COMPLETED - Apr 2026)
- [x] **My Orders tab redesign** (Apr 05, 2026):
  - [x] Removed separate "My Indents" tab
  - [x] My Orders now shows both: Upcoming Orders (Indents) and Received Orders (Dispatched)
  - [x] Auto-generated orders show "Auto Generated by System" purple tag
  - [x] Upcoming Orders section has yellow header to distinguish from received
- [x] **My Orders 3-Tab Sub-Navigation** (COMPLETED - Apr 07, 2026):
  - [x] Redesigned "My Orders" with 3 sub-tabs: Pending Orders, Dispatched Orders, Invoiced
  - [x] **Pending Orders** - Shows indents yet to be dispatched (yellow theme)
  - [x] **Dispatched Orders** - Shows orders received from Admin with date filter (green theme)
  - [x] **Invoiced** - Shows all generated invoices with expandable details (blue theme)
  - [x] Status badges on each sub-tab showing count
  - [x] Invoice STATUS column moved to last position
  - [x] Paid invoices show "Payment Cleared" green badge (uses `status === 'paid' || status === 'closed'`)
  - [x] Unpaid invoices show "Pending" yellow badge
  - [x] Removed orphaned standalone `activeTab === 'invoices'` code block
  - [x] Added i18n translations for new labels (en.json, hi.json)

### Admin Invoice Payment Management (COMPLETED - Apr 2026)
- [x] **Invoice Payment Recording** (Apr 07, 2026):
  - [x] Added "Pay" button with rupee icon against each unpaid invoice in Admin Retailer Orders → Invoices tab
  - [x] Invoice Payment Modal shows: Invoice number, Retailer name, Total Receivable, Already Paid, Pending Amount
  - [x] Payment form fields: Payment Date, Amount (pre-filled with pending amount), Payment Mode (Cash/UPI/Bank Transfer/Cheque/Other), Reference Number, Remarks
  - [x] Backend endpoint: POST `/api/retailer-invoices/{invoice_id}/payment` records payment and updates invoice status
  - [x] Invoice status logic: pending → partial (if partial payment) → paid (if fully paid)
  - [x] Payment history stored in `retailer_payments` collection with invoice_id reference
- [x] **Status Filter in Invoices Tab**:
  - [x] Filter buttons: All, Pending (count), Partial (count), Paid (count)
  - [x] Real-time filtering of invoices based on payment status
- [x] **Updated Invoice Table Columns**:
  - [x] INVOICE #, DATE, RETAILER, ITEMS, RECEIVABLE, PAID, PENDING, STATUS, ACTIONS
  - [x] Status badges: Paid (green), Partial (blue), Pending (yellow)
  - [x] Pay button hidden for fully paid invoices
  - [x] Total footer shows sum of Receivable, Paid, and Pending amounts
- [x] **Removed standalone Payments Tab**: Payment recording is now consolidated within Invoices tab

### Wastage Dashboard Improvements (COMPLETED - Apr 2026)
- [x] **Auto-update on date change** (Apr 05, 2026):
  - [x] Data refreshes automatically when date range is changed (no Apply button needed)
  - [x] Loading spinner shows during data refresh
- [x] **Redesigned Daily Wastage Trend chart**:
  - [x] Summary stats: Peak Day, Daily Average, Best Day
  - [x] Beautiful line/area chart with red gradient
  - [x] Y-axis labels with max/mid/0 values
  - [x] Daily details table showing Date, Wastage, Value, Rate
- [x] **Top Wastage Products period selector**:
  - [x] Options: 7 Days, 15 Days, 30 Days, 3 Months, 6 Months
  - [x] Improved visual design with ranked badges (1-gold, 2-silver, 3-bronze)
  - [x] Shows wastage %, value, and days of data

### Daily Purchase Requirement Feature (COMPLETED - Apr 2026)
- [x] **Retailer Daily Purchase Requirement Tab** (Apr 05, 2026):
  - [x] New "Daily Requirement" tab in Admin Retailer Orders page (first tab position)
  - [x] Date and Retailer filter dropdowns
  - [x] Calculate button aggregates all indents for selected date/retailer
  - [x] Table columns: #, Product Name, Packaging/Variant, Indent Qty, Kg Required (editable), Rate/Kg (editable), Amount (editable), Remarks, Action (delete)
  - [x] **Bidirectional auto-calculation**: Rate × Kg = Amount, Amount ÷ Kg = Rate
  - [x] **Editable Kg field**: User can adjust required Kg with auto-recalculation of Amount
  - [x] **Row deletion**: Delete button removes row from calculation
  - [x] **Save functionality**: POST /api/retailer-daily-requirement saves the sheet
  - [x] **Print functionality**: Opens formatted print view
  - [x] Total row shows sum of Indent Qty, Kg Required, and Amount
- [x] **Quick Commerce Daily Purchase Requirement Tab** (Apr 05, 2026):
  - [x] New "Daily Req" tab in Admin Quick Commerce page (first tab position)
  - [x] Date and Customer filter dropdowns
  - [x] Calculation logic: Indent Qty + Estimated Wastage (1-month avg) = Actual Qty Required
  - [x] **Wastage estimation**: GET /api/qc-wastage-averages returns 1-month average wastage per product from GRN data
  - [x] Table columns: #, Product, Packaging, Qty Req (editable), Est Wastage (editable), Actual Kg (auto-calc), Wt/Bunch (editable), Bunches (auto-calc), Rate (editable), Amount (editable), Remarks, Del
  - [x] **Auto-calculations**:
    - Actual Kg = (Qty Req + Est Wastage) × packaging_weight ÷ 1000
    - No of Bunches = ceil(Actual Kg ÷ Weight per Bunch)
  - [x] **Bidirectional Rate/Amount**: Rate × Actual Kg = Amount, Amount ÷ Actual Kg = Rate
  - [x] **Row deletion**: Delete button removes row from calculation
  - [x] **Save functionality**: POST /api/qc-daily-requirement saves the sheet
  - [x] **Print functionality**: Opens formatted print view with all columns
  - [x] Total row shows sums for Qty Req, Est Wastage, Actual Kg, Bunches, and Amount
- [x] **Backend APIs for Daily Requirements**:
  - [x] POST /api/retailer-daily-requirement - Save/update retailer daily requirement
  - [x] GET /api/retailer-daily-requirement/{date} - Get saved requirement by date
  - [x] GET /api/retailer-daily-requirements - List recent requirements
  - [x] GET /api/qc-wastage-averages - Get 1-month average wastage per product
  - [x] POST /api/qc-daily-requirement - Save/update QC daily requirement
  - [x] GET /api/qc-daily-requirement/{date} - Get saved QC requirement by date
  - [x] GET /api/qc-daily-requirements - List recent QC requirements

### Hindi Product Names Translation (COMPLETED - Apr 2026)
- [x] **Product names display in Hindi when language is switched** (Apr 05, 2026):
  - [x] Added `name_hi` field to all 47 products in database
  - [x] Script `/app/backend/populate_hindi_names.py` populates Hindi translations
  - [x] `getProductName()` helper function added to all major pages:
    - Retailer Dashboard (My Orders, Inventory, Closing Stock)
    - Admin RetailerOrders page
    - Admin QuickCommerce page
    - Admin Procurement page
    - Admin WastageDashboard page
  - [x] Helper checks `i18n.language === 'hi'` and returns `name_hi` if available
  - [x] Sample translations: Coriander→धनिया, Spinach→पालक, Mint→पुदीना, Fenugreek→मेथी
  - [x] **Product dropdown in Create Indent modal shows Hindi names** (Apr 05, 2026)
  - [x] **Load Previous loads products and displays them in Hindi** (Apr 05, 2026)
  - [x] **UI labels translated**: Page headers, tabs, modal titles, buttons, form labels
  - [x] Added `retailerOrdersAdmin` namespace to hi.json with all UI strings

---

## Key API Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/register` - User registration
- `GET/POST/PUT/DELETE /api/farmers` - Farmer CRUD
- `GET/POST/PUT/DELETE /api/procurement` - Procurement CRUD
- `GET/POST/PUT/DELETE /api/products` - Products CRUD
- `GET /api/reports/dashboard` - Dashboard statistics

## Database Collections
- `users`: {email, password_hash, role, name, company_name, contact, address}
- `products`: {name, category, stock, unit, price}
- `farmers`: {name, contact, address, bank_account_number, ifsc_code, bank_name, branch_name, upi_id, materials_supplied}
- `procurements`: {farmer_id, farmer_name, date, products[], total_amount, paid_amount, pending_amount, payment_status, remark}
- `daily_stock_status`: {date, product_id, product_name, opening_qty, avg_price, purchase_qty, dispatch_qty, closing_qty, wastage_qty, wastage_percent, status}

## Test Credentials
- Admin: admin@mrorganix.com / admin123
- Retailer: tamannamart08@gmail.com / admin123

---

## Codebase Refactoring (IN PROGRESS - Apr 2026)

### Backend Route Modularization
The monolithic `server.py` (7600+ lines) is being refactored into modular route files:

**Created Route Modules** (`/app/backend/routes/`) - **11 modules, 2,482 lines**:
- [x] `auth.py` (144 lines) - Authentication & user management routes
- [x] `products.py` (196 lines) - Products & QC packaging routes  
- [x] `farmers.py` (61 lines) - Farmer CRUD routes
- [x] `procurement.py` (250 lines) - Procurement & templates routes
- [x] `qc_orders.py` (269 lines) - QC orders, customers, indents routes
- [x] `qc_dispatches.py` (188 lines) - QC dispatches routes
- [x] `qc_invoices.py` (129 lines) - QC invoice routes
- [x] `retailer_orders.py` (298 lines) - Retailer orders, rejections, wastage, payments, invoices
- [x] `retailer_indents.py` (324 lines) - Retailer indents & dispatches routes
- [x] `expenses.py` (280 lines) - Variable & fixed expense routes
- [x] `admin.py` (293 lines) - Admin utilities, auto-indent, Hindi names, referral codes
- [ ] `stock_status.py` - Stock status routes (TODO - Complex, ~1000 lines)
- [ ] `reports.py` - Dashboard & P&L reports (TODO)
- [ ] `gmail.py` - Gmail OAuth & GRN sync (TODO - ~800 lines)
- [ ] `backup.py` - Backup management routes (TODO)

**Shared Dependencies** (`/app/backend/dependencies.py`):
- [x] Database connection (MongoDB)
- [x] Authentication helpers (hash_password, verify_password, create_token)
- [x] get_current_user dependency
- [x] Hindi product translations dictionary
- [x] Referral code generator

### Frontend Hook Modularization
**Created Hooks** (`/app/frontend/src/hooks/`):
- [x] `useQCData.js` - QC data fetching & state management hook
- [x] `useProductTranslation.js` - Product name translation hook

### Files Pending Refactoring (by size)
1. **server.py** (7695 lines) - Split into route modules above
2. **QuickCommerce.js** (5061 lines) - Well-organized sections, extract to hooks
3. **RetailerOrders.js** (3782 lines) - Needs component splitting
4. **Procurement.js** (2502 lines) - Needs component splitting  
5. **Dashboard.js** (1327 lines) - Manageable, lower priority

### Referral Code Format Update (COMPLETED - Apr 06, 2026)
- [x] Changed from "MRO-XXXXXXXX" (11 chars) to 5-digit numeric code
- [x] Updated new user creation to generate 5-digit codes
- [x] Added `POST /api/admin/reset-all-referral-codes` endpoint to reset existing codes
- [x] "REFERRAL CODE" column added to Admin User Management table


### Stock Status Data Fix (COMPLETED - Apr 06, 2026)
- [x] Fixed corrupted `purchase_qty` values from Excel backup imports
- [x] Root cause: Excel backup had bloated/incorrect values baked in
- [x] Solution: Created `/app/backend/scripts/fix_stock_status_purchase_qty.py`
- [x] Script recalculates `purchase_qty` from raw `procurements` collection
- [x] Fixed 20 records across 12 dates
- [x] Examples fixed: Fresh Mint Leaves (2257.5 → 157.5 Kg), Coriander (906 → 302 Kg)
- [x] Fixed `TypeError` in `/stock-status/today` endpoint (opening_price None handling)

### Admin Fix Buttons for Production (COMPLETED - Apr 06, 2026)
- [x] Added `POST /api/stock-status/fix-all-purchase-quantities` endpoint
- [x] Added **"Fix Purchases"** button (red) in Stock Status page header
- [x] Added `POST /api/qc-grns/fix-mismatched-ids` endpoint
- [x] Added **"Fix GRN IDs"** button (red) in Quick Commerce > GRN tab pending banner
- [x] These buttons allow fixing corrupted data in production after Excel backup imports


### Variant-Based Inventory System (IN PROGRESS - Apr 06, 2026)
- [x] Added `GET /api/retailer/product-variants/{retailer_id}` endpoint
  - Returns product variants based on retailer's dispatch history
  - Shows packaging names (200gm Packet, 250gm, Kg, etc.)
- [x] Updated "Record Closing" modal to show products with their packaging variants
- [x] Updated closing inventory API to store packaging_id and packaging_name
- [x] Updated Daily Inventory view to track by product+variant combination
- [x] Updated closing inventory summary API to include packaging info
- [ ] Note: Variants will appear once retailer dispatches include specific packagings

### Duplicate Products Prevention (COMPLETED - Apr 06, 2026)
- [x] Added duplicate check on product creation (case-insensitive name match)
- [x] Added `GET /api/products/duplicates` endpoint to view duplicates
- [x] Added `DELETE /api/products/duplicates/cleanup` endpoint to remove duplicates
- [x] Cleaned up 1 duplicate "Ginger" product from database

### Procurement Date Edit Fix (COMPLETED - Apr 06, 2026)
- [x] Fixed procurement update endpoint to allow changing the `date` field
- [x] Procurement edit now properly updates the date in the database

### Units Management System (COMPLETED - Apr 07, 2026)
- [x] **Products page redesigned with sub-tabs**: Products tab and Units tab
- [x] **Units CRUD operations**:
  - [x] GET /api/units - List all units sorted alphabetically
  - [x] POST /api/units - Create new unit (name, symbol, description)
  - [x] PUT /api/units/{id} - Update existing unit
  - [x] DELETE /api/units/{id} - Delete unused unit (protected: cannot delete units in use)
  - [x] POST /api/units/seed-defaults - Seed 10 default units (Kg, Gram, Piece, Pieces, Bunch, Packet, Box, Crate, Dozen, Litre)
- [x] **Units tab UI features**:
  - [x] Table showing Name, Symbol, Description, Products Using count, Actions (Edit/Delete)
  - [x] Add Unit button with dialog form
  - [x] "Click to add default units" link when no units exist
  - [x] Delete disabled for units in use by products
- [x] **Product form unit dropdown** now populated dynamically from units collection
- [x] **Procurement page unit dropdown** now fetches all units from /api/units (was hardcoded Kg/Bunch/Piece/Pack)
- [x] **Bug fix**: Fixed Python syntax error in server.py line 465 (`del unit_doc["_id"] if...` → `unit_doc.pop("_id", None)`)
- [x] **Auto-seed on startup**: Backend automatically seeds default units on startup if collection is empty (production migration ready)
- [x] **Testing**: All 23 tests passed (13 backend + 10 frontend)

### Role-Based Access Control Updates (COMPLETED - Apr 07, 2026)
- [x] **Products tab restricted to Admin only** - Removed from Staff sidebar navigation
- [x] **Staff Dashboard updated** - Changed "Products" quick action to "Stock Status"

### Inventory & Closing Enhancements (COMPLETED - Apr 07, 2026)
- [x] **Two-step inventory sorting**:
  - First: Products with non-zero closing qty (sorted alphabetically)
  - Second: Products with zero/null/undefined closing qty (sorted alphabetically)
  - Applied to both Retailer Dashboard and Admin RetailerOrders closing inventory tables
  - **Bug fix**: Changed sort condition from `(a.closing_qty || 0) > 0` to `typeof a.closing_qty === 'number' && a.closing_qty > 0` for proper null/undefined handling
- [x] **Daily Inventory as Closing sub-tab**:
  - Removed standalone "Inventory" menu item from Retailer portal
  - Added "Closing History" and "Daily Inventory" sub-tabs under Closing section
- [x] **Items Sold negative value fix**:
  - Added `Math.max(0, ...)` to prevent negative Items Sold when historical data is missing
- [x] **Duplicate text removed from My Orders**:
  - "Pending Orders (Pending Orders)" → "Pending Orders"
  - "Dispatched Orders (Received from Admin)" → "Dispatched Orders"
- [x] **Compact inventory table design** (Apr 07, 2026):
  - Reduced padding (p-3 → px-2 py-1.5)
  - Changed from `w-full` table to `table-auto` for natural column sizing (reduces horizontal white space)
  - Full headers maintained: Product, Opening, Received, Rejection, Sold, Closing
  - Added `whitespace-nowrap` to prevent column wrapping
  - Product name no longer truncated
  - Table rows more compact vertically
- [x] **Sorting added to render chain**:
  - Both Closing History and Daily Inventory tables now sort inline during render
  - Sort logic: `typeof closing_qty === 'number' && closing_qty > 0` for positive values
  - Products with closing > 0 appear first (alphabetically), then products with 0/null closing (alphabetically)

### Variant Name Display Fix (COMPLETED - Apr 07, 2026)
- [x] **Backend enhancement** to populate variant names from dispatch history:
  - Closing inventory summary endpoint now builds a `variant_name_map` from ALL dispatches
  - Priority: today's dispatch variant → historical dispatch variant → stored variant
  - Fixes "Kg" showing instead of actual packaging names like "240-260 gm"
- [x] **Applies to both**:
  - Retailer Portal → Closing History table
  - Admin Portal → Closing Inventory tab
- [x] **Edit/Delete controls** working correctly for same-day records only

### Admin Closing Inventory Edit Enhancement (COMPLETED - Apr 07, 2026)
- [x] **Variant name editing**: Admin can now edit both closing qty AND variant name
- [x] **Searchable dropdown**: Variant field shows searchable list populated from packaging variants
- [x] **Backend updated**: PUT endpoint now accepts `variant_name` in addition to `closing_qty`

### Packaging Moved to Products Tab (COMPLETED - Apr 07, 2026)
- [x] **Products page now has 3 sub-tabs**: Products | Units | Packaging
- [x] **Packaging management**:
  - View all packaging variants sorted alphabetically
  - Add new packaging (name + weight in gm)
  - Edit existing packaging
  - Delete packaging
- [x] **Removed from Quick Commerce** - Packaging section moved from QC tab to Products tab
- [x] **Daily Avg Profit** added to dashboards:
  - Main Dashboard: Shows "Daily Avg Profit = Net Profit / Days" with day count
  - QC Dashboard: Shows "DAILY AVG" for Quick Commerce
  - Retail Dashboard: Shows "DAILY AVG" for Retail
  - Customer P&L Modal: Shows "DAILY AVG" profit per customer
- [x] **Dashboard layout improved** (4+3 card distribution):
  - Row 1: Total Sales, COGS, Wastage Loss, Gross Profit (4 cards)
  - Row 2: Variable Exp, Net Profit, Daily Avg Profit (3 cards)

### P&L Math Discrepancy Fix (COMPLETED - Apr 07, 2026)
- [x] **Main Net Profit now equals QC Net Profit + Retail Net Profit**:
  - Root cause: GRN Loss was being deducted from QC Net Profit but NOT from Main Net Profit
  - Fix: `net_profit_actual = gross_profit_actual - total_grn_loss - total_variable - total_fixed`
- [x] **GRN Loss allocated proportionally to QC customers**:
  - Each QC customer's `grn_loss_share = total_grn_loss × (customer_sales / total_qc_sales)`
  - Customer P&L modal shows "GRN LOSS" field for QC customers
- [x] **Rejection Loss allocated proportionally to Retail customers**:
  - Each Retail customer's `rejection_share = total_rejection × (customer_sales / total_retail_sales)`
  - Customer P&L modal shows "REJECTION" field for Retail customers
- [x] **Customer Daily Avg calculation fixed**:
  - Now uses period days (7 days) instead of active days
  - Ensures customer Daily Avgs sum up to match dashboard Daily Avg
- [x] **Verified math** (Apr 1-7, 2026 data):
  - Main Net Profit: ₹46,207.49 = QC ₹44,415.94 + Retail ₹1,791.55 ✅
  - Main Daily Avg: ₹6,601 = QC ₹6,345 + Retail ₹256 ✅
  - Ninjacart GRN Loss Share: ₹4,590.74
  - Tamanna Mart Rejection Share: ₹0 (no rejection data)

### QC Dispatch Line Item Edit/Delete (COMPLETED - Apr 07, 2026)
- [x] **Backend API endpoints**:
  - `GET /api/qc-dispatches/{dispatch_id}/invoice-status` - Check if dispatch is invoiced
  - `PUT /api/qc-dispatches/{dispatch_id}/items/{item_index}` - Update item quantity
  - `DELETE /api/qc-dispatches/{dispatch_id}/items-by-index/{item_index}` - Delete item by index
- [x] **Invoice protection**: Edit/Delete blocked if dispatch is part of an invoice
  - Error message: "Cannot edit: Dispatch is part of invoice {number}. Delete the invoice first."
- [x] **Frontend UI - Dispatch Log table**:
  - Columns: PRODUCT | PACKAGING | QTY | ACTIONS
  - Edit button (pencil icon) - Opens inline edit mode
  - Delete button (trash icon) - Removes individual line item
  - Keyboard shortcuts: Enter to save, Escape to cancel
  - Invoice status badge shows when dispatch is invoiced
- [x] **Tested and verified** - 100% success rate (10/10 tests passed)

### Procurement Enhancements (COMPLETED - Apr 07, 2026)
- [x] **Hindi Product Names in Dropdown**:
  - AutocompleteInput component now supports `localizedDisplayKey` prop
  - Product dropdown shows Hindi names (name_hi) when language is Hindi
  - Search works on both English and Hindi product names
- [x] **Last 7 Days' Purchases Logic**:
  - Changed from "Previous Day's Purchases" to "Last 7 Days' Purchases"
  - Backend endpoint `/api/procurement/previous-day` now returns:
    - Unique farmer-product combinations from 7 days before selected date
    - Removes duplicate entries, keeping most recent data for each combination
  - Shows count of unique items (e.g., "40 unique items")


