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
- [x] Dashboard with statistics cards
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
  - [x] Create invoices from dispatch entries
  - [x] Editable invoice items (Supplied Qty, Receiving Qty, Rate)
  - [x] Backdated invoice support
  - [x] Edit/Delete invoices
  - [x] Auto-calculate subtotal, discount, total
  - [x] Print button
  - [x] Backend API: GET/POST/PUT/DELETE /api/qc-invoices
- [ ] **GRN Section**: Record accepted vs rejected quantities

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
- [ ] Wastage & Grading Tracking page

### P1 - High Priority
- [ ] Quick Commerce Dispatch section - Create dispatches from indents
- [ ] Quick Commerce GRN section - Record what was accepted after dispatch
- [ ] Retailer Rejection Adjustment workflow
- [ ] Invoicing and Print PDF functionality
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

## Test Credentials
- Admin: admin@freshflow.com / admin123
- Retailer: retailer@test.com / retailer123
