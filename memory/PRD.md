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
- OCR QC Order Processing
- Hindi language E2E testing
- AI-powered demand forecasting

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

### Current Session (21 Apr 2026)
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
4. **Fixed Cashflow Fixed Expenses** - Now uses month/year filtering instead of date field
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
