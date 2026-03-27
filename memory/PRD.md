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
- [ ] Retailer Rejection Adjustment workflow
- [ ] Export to Excel for Indent tab (UI buttons exist, logic pending)
- [ ] Complete translations for remaining pages (Products, QC Orders, etc.)

### P2 - Medium Priority
- [ ] Reports and analytics dashboard
- [ ] Bulk import/export functionality
- [ ] Email notifications

### P3 - Future Enhancements
- [ ] Mobile app (React Native)
- [ ] WhatsApp integration for order updates
- [ ] AI-powered demand forecasting

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
