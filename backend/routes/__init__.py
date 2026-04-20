"""
Routes package - Modular API route organization

These route modules can be incrementally integrated into server.py
by importing and including them with app.include_router()

Usage:
    from routes.auth import router as auth_router
    app.include_router(auth_router)

Available modules:
- auth: Authentication and user management routes
- products: Product and QC packaging routes
- farmers: Farmer CRUD routes
- procurement: Procurement and templates routes
- qc_orders: QC orders, customers, indents routes
- qc_dispatches: QC dispatches routes
- qc_invoices: QC invoice routes
- retailer_orders: Retailer orders, rejections, wastage, payments, invoices
- retailer_indents: Retailer indents and dispatches routes
- expenses: Variable and fixed expenses routes
- admin: Admin utilities, auto-indent, Hindi names, referral codes
- labour: Labour management and attendance tracking (ACTIVE - moved from server.py)
"""

from routes.auth import router as auth_router
from routes.products import router as products_router
from routes.farmers import router as farmers_router
from routes.procurement import router as procurement_router
from routes.qc_orders import router as qc_orders_router
from routes.qc_dispatches import router as qc_dispatches_router
from routes.qc_invoices import router as qc_invoices_router
from routes.retailer_orders import router as retailer_orders_router
from routes.retailer_indents import router as retailer_indents_router
from routes.expenses import router as expenses_router
from routes.admin import router as admin_router
from routes.labour import router as labour_router

__all__ = [
    'auth_router',
    'products_router', 
    'farmers_router',
    'procurement_router',
    'qc_orders_router',
    'qc_dispatches_router',
    'qc_invoices_router',
    'retailer_orders_router',
    'retailer_indents_router',
    'expenses_router',
    'admin_router',
    'labour_router',
]

