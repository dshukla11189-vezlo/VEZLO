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

Usage:
------
from routes import auth_router, labour_router, health_router, users_router, farmers_router
app.include_router(auth_router, prefix="/api")
app.include_router(labour_router)
app.include_router(health_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(farmers_router)  # has /api prefix built-in
"""

# Active routers
from .auth import router as auth_router
from .labour import router as labour_router
from .health import router as health_router
from .users import router as users_router
from .farmers import router as farmers_router

# Export all routers
__all__ = [
    'auth_router',
    'labour_router',
    'health_router',
    'users_router',
    'farmers_router',
]
