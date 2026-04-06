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
"""

from routes.auth import router as auth_router
from routes.products import router as products_router
from routes.farmers import router as farmers_router
from routes.procurement import router as procurement_router
from routes.qc_orders import router as qc_orders_router

__all__ = [
    'auth_router',
    'products_router', 
    'farmers_router',
    'procurement_router',
    'qc_orders_router',
]
