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

### In Progress
- Codebase refactoring (server.py >11,600 lines)
- Labor "Inactive" UI clarity improvements

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

### Frontend
- React with Shadcn/UI components
- Tailwind CSS styling
- i18next for internationalization

### Key Data Models
- `daily_stock_status`: Opening, Purchase, Wastage, Dispatch, Closing
- `qc_packaging`: QC variants
- `variable_expenses`: Vertical field (qc/retail/all)
- `labours`: Soft delete with `is_active` flag

## Recent Changes (April 2026)

### Session Completed
1. Fixed Wastage % consistency across dashboards
   - Backend now returns `product_wastage_summary` with pre-calculated `wastage_pct`
   - Frontend `Dashboard.js` fixed to use correct variable scope
   - Both use formula: `Wastage / (Opening + Purchase) * 100`

2. Customer P&L improvements
   - Excluded fixed expenses
   - Isolated variable expenses by vertical
   - Added Gross Margin %
   - Replaced Commission with GRN Loss for QC

3. Backup system expanded to 29 collections
4. Direct API Sync feature for production data
5. Mandatory stock closing validation

## Key API Endpoints
- `GET /api/reports/pnl` - P&L with product_wastage_summary
- `GET /api/stock-status/wastage-dashboard` - Wastage analytics
- `POST /api/backup/sync-direct-api` - Production sync
- `DELETE /api/qc-packaging/{id}` - Variant deletion with migration

## Test Credentials
- Admin: admin@freshflow.com / admin123
- Retailer: tamannamart08@gmail.com / admin123
- Staff: samrat@freshflow.com / admin123
