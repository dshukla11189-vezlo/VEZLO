"""
Routes Package
==============

This package contains modular route definitions for the FreshFlow API.

CURRENT STATUS:
--------------
Most routes are still defined in server.py (legacy monolithic structure).
The following routes have been modularized:

1. labour.py - Labour/attendance management routes (ACTIVE)

FUTURE MIGRATION PLAN:
---------------------
Routes will be gradually extracted from server.py into this package.
Each module will use shared dependencies from ../dependencies.py

Structure:
- auth.py         - Authentication & user management
- products.py     - Products, categories, packaging
- procurement.py  - Procurement, GRN, payments
- qc.py           - QC orders, indents, dispatches
- retailer.py     - Retailer portal (indents, invoices)
- reports.py      - Dashboard, analytics, P&L
- expenses.py     - Variable & fixed expenses
- admin.py        - Admin utilities, backups

Usage:
------
from routes.labour import router as labour_router
app.include_router(labour_router)
"""

# Currently active routers
from .labour import router as labour_router

# Export all routers
__all__ = [
    'labour_router',
]
