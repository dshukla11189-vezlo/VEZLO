# Mr Organix Backend

## Code Structure

```
/app/backend/
├── server.py              # Main API server (~20,300 lines, being modularized)
├── dependencies.py        # Shared utilities (db, auth, constants)
├── models.py              # Pydantic models for request/response
├── pdf_generator.py       # Invoice PDF generation
├── backup_system.py       # Backup scheduler and Excel generation
├── ocr_processor.py       # Excel/image OCR for GRN
├── ocr_indent_processor.py # Indent OCR processing
├── gmail_integration.py   # Gmail API for NinjaCat integration
├── routes/
│   ├── __init__.py        # Routes package documentation
│   ├── auth.py            # Authentication routes (ACTIVE) ✅
│   ├── health.py          # Health & Diagnostics routes (ACTIVE) ✅
│   ├── users.py           # User management routes (ACTIVE) ✅
│   ├── farmers.py         # Farmer management routes (ACTIVE) ✅
│   ├── labour.py          # Labour/attendance management (ACTIVE) ✅
│   └── [legacy files]     # Pre-existing files not yet wired up
└── migrations/
    └── fix_uuid_variants.py # Data migration scripts
```

## Refactoring Status

| Module | Status | Routes Extracted |
|--------|--------|------------------|
| Auth | ✅ ACTIVE | `/auth/login`, `/auth/register`, `/auth/me` |
| Health | ✅ ACTIVE | `/health`, `/health/detailed`, `/diagnostics`, `/error-logs/*`, `/system-logs` |
| Users | ✅ ACTIVE | `/users/*`, `/employees` |
| Farmers | ✅ ACTIVE | `/farmers/*` |
| Labour | ✅ ACTIVE | `/labour/*` |
| Products | ❌ In server.py | Complex routes with retry logic |
| QC | ❌ In server.py | Orders, Dispatches, Invoices, GRN |
| Retail | ❌ In server.py | Plans, Indents, Catalogue |
| Admin | ❌ In server.py | Utilities, migrations |

## Server.py Structure (Table of Contents)

The main server.py file is organized into sections. Search for "SECTION:" to navigate:

| Section | Line Range | Description |
|---------|------------|-------------|
| Health & Diagnostics | ~470-660 | Health checks, error logs, diagnostics |
| Authentication | ~825-950 | Login, logout, token management |
| User Management | ~950-1110 | User CRUD (admin only) |
| Products & Packaging | ~1110-2090 | Products, categories, types, units |
| QC Packaging | ~2090-2330 | QC packaging variants |
| Retail Plans | ~2330-2640 | Retail plan management |
| Farmers | ~2640-2690 | Farmer management |
| Procurement | ~2690-3640 | Procurement, payments, templates |
| QC Orders | ~3680-3755 | QC order management |
| QC Customers | ~3755-3860 | QC customer management |
| QC Indents | ~3860-4115 | QC indents, OCR processing |
| QC Dispatches | ~4115-4435 | QC dispatch management |
| QC GRN | ~4435-5640 | GRN (Goods Receipt Notes) |
| QC Invoices | ~5640-5770 | QC invoice management |
| Retailer Orders | ~5770-5880 | Retailer order overview |
| Wastage | ~5880-6045 | Wastage tracking |
| Dashboard & Analytics | ~6045-7710 | P&L, reports, analytics |
| Stock Status | ~7710-10410 | Stock status management |
| Variable Expenses | ~10410-10605 | Variable expense tracking |
| Fixed Expenses | ~10605-10765 | Fixed expense management |
| Retailer Portal | ~10765-14017 | Full retailer portal APIs |
| Daily MRP | ~14017+ | MRP management |
| Retailer Catalogue | ~14500+ | Product catalogue for retailers |
| Auto Indent | ~16200+ | Auto-indent generation |
| Admin Utilities | ~17500+ | Migrations, sync, admin tools |

## Shared Dependencies (dependencies.py)

All route modules should import shared utilities from `dependencies.py`:

```python
from dependencies import (
    db,                    # MongoDB database instance
    get_current_user,      # Auth dependency
    hash_password,         # Password hashing
    verify_password,       # Password verification
    create_token,          # JWT token creation
    logger,                # Application logger
    HINDI_PRODUCT_NAMES,   # Product translations
    MARATHI_PRODUCT_NAMES,
    recent_errors,         # Error tracking
    system_health_metrics, # Health metrics
    persist_error_log,     # Error persistence
)
```

## Adding New Routes

When adding new endpoints:

1. Add to the appropriate section in `server.py`
2. Use the existing patterns for authentication and error handling
3. Follow the existing naming conventions for routes
4. Add appropriate data-testid attributes for frontend testing

## Future Refactoring Plan

The codebase is being gradually modularized:

1. **Phase 1 (COMPLETE)**: Shared utilities extracted to `dependencies.py`
2. **Phase 2 (IN PROGRESS)**: Extract routes to separate files
   - ✅ Auth routes → `routes/auth.py`
   - ✅ Health routes → `routes/health.py`
   - ✅ User routes → `routes/users.py`
   - ✅ Farmer routes → `routes/farmers.py`
   - ❌ Products (complex, needs careful extraction)
   - ❌ QC routes (multiple interdependent modules)
   - ❌ Retail routes (large section)
3. **Phase 3 (FUTURE)**: Full modular structure with service layer

## Environment Variables

Required environment variables (in `.env`):
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name
- `JWT_SECRET_KEY` - JWT signing key
- `RESEND_API_KEY` - Email service (optional)
- `OPENAI_API_KEY` - OpenAI for OCR (optional)
- `GMAIL_*` - Gmail integration credentials (optional)
