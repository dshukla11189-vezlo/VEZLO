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
