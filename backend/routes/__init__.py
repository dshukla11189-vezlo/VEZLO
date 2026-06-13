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

Usage:
------
from routes import auth_router, labour_router, health_router, users_router, farmers_router, qc_orders_customers_router, qc_indents_dispatches_router
"""

# Active routers
from .auth import router as auth_router
from .labour import router as labour_router
from .health import router as health_router
from .users import router as users_router
from .farmers import router as farmers_router
from .qc_orders_customers import router as qc_orders_customers_router
from .qc_indents_dispatches import router as qc_indents_dispatches_router

# Export all routers
__all__ = [
    'auth_router',
    'labour_router',
    'health_router',
    'users_router',
    'farmers_router',
    'qc_orders_customers_router',
    'qc_indents_dispatches_router',
]
