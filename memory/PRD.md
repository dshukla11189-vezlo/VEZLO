# FreshFlow - Product Requirements Document

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
- Admin: admin@freshflow.com / admin123
- Retailer: retailer@test.com / retailer123
