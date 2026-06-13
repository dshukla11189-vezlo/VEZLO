"""
Routes Package
==============

This package contains modular route definitions for the FreshFlow API.

ACTIVE ROUTERS:
--------------
1. auth.py - Authentication routes (login, register, /me)
2. labour.py - Labour/attendance management routes
3. health.py - Health checks, diagnostics, and error logging
4. users.py - User management routes (admin only)
5. farmers.py - Farmer management routes
6. qc_orders_customers.py - QC Orders and QC Customers routes
7. qc_indents_dispatches.py - QC Indents and QC Dispatches routes
8. qc_invoices_new.py - QC Invoice routes
9. products_packaging.py - Products, units, categories, types, QC packaging routes
10. qc_grn.py - QC GRN (Goods Receipt Note) routes
11. retail_plans.py - Retail Plans management routes
12. procurement_new.py - Procurement management routes
13. retailer_orders_wastage.py - Retailer orders, rejections, wastage, payments, invoices

Usage:
------
from routes import auth_router, labour_router, health_router, users_router, farmers_router, qc_orders_customers_router, qc_indents_dispatches_router, qc_invoices_router, products_packaging_router, qc_grn_router, retail_plans_router, procurement_router, retailer_orders_wastage_router
"""

# Active routers
from .auth import router as auth_router
from .labour import router as labour_router
from .health import router as health_router
from .users import router as users_router
from .farmers import router as farmers_router
from .qc_orders_customers import router as qc_orders_customers_router
from .qc_indents_dispatches import router as qc_indents_dispatches_router
from .qc_invoices_new import router as qc_invoices_router
from .products_packaging import router as products_packaging_router
from .qc_grn import router as qc_grn_router
from .retail_plans import router as retail_plans_router
from .procurement_new import router as procurement_router
from .retailer_orders_wastage import router as retailer_orders_wastage_router
from .expenses_new import router as expenses_router
from .backup_data import router as backup_data_router
from .gmail_integration import router as gmail_integration_router
from .dashboard_analytics import router as dashboard_analytics_router
from .retailer_portal import router as retailer_portal_router

# Export all routers
__all__ = [
    'auth_router',
    'labour_router',
    'health_router',
    'users_router',
    'farmers_router',
    'qc_orders_customers_router',
    'qc_indents_dispatches_router',
    'qc_invoices_router',
    'products_packaging_router',
    'qc_grn_router',
    'retail_plans_router',
    'procurement_router',
    'retailer_orders_wastage_router',
    'expenses_router',
    'backup_data_router',
    'gmail_integration_router',
    'dashboard_analytics_router',
    'retailer_portal_router',
]
