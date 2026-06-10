import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logout, getUser } from '../utils/auth';
import { Home, Package, ShoppingCart, TruckIcon, FileText, DollarSign, BarChart3, Trash2, LogOut, User, X, ClipboardList, Receipt, Calculator, Users, Database, Leaf, UserCheck, Wallet, Boxes } from 'lucide-react';

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const { t } = useTranslation();
  const location = useLocation();
  const user = getUser();
  
  // Admin has access to ALL tabs
  const adminLinks = [
    { path: '/admin/dashboard', icon: Home, labelKey: 'app.dashboard' },
    { path: '/admin/products', icon: Leaf, labelKey: 'app.products' },
    { path: '/admin/retail-plans', icon: Boxes, labelKey: 'app.retailPlans' },
    { path: '/admin/stock-status', icon: ClipboardList, labelKey: 'app.stockStatus' },
    { path: '/admin/procurement', icon: TruckIcon, labelKey: 'app.procurement' },
    { path: '/admin/quick-commerce', icon: ShoppingCart, labelKey: 'app.quickCommerce' },
    { path: '/admin/retailer-orders', icon: ShoppingCart, labelKey: 'app.retailerOrders' },
    { path: '/admin/wastage-dashboard', icon: Trash2, labelKey: 'app.wastageDashboard' },
    { path: '/admin/variable-expenses', icon: Receipt, labelKey: 'app.variableExpenses' },
    { path: '/admin/fixed-expenses', icon: Calculator, labelKey: 'app.fixedExpenses' },
    { path: '/admin/cashflow', icon: Wallet, labelKey: 'app.cashflow' },
    { path: '/admin/labor-costs', icon: UserCheck, labelKey: 'app.laborCosts' },
    { path: '/admin/users', icon: Users, labelKey: 'app.userManagement' },
    { path: '/admin/backup', icon: Database, labelKey: 'app.backup' },
  ];

  // Staff access: Procurement, Stock Status, Quick Commerce, Retailer Orders, Wastage Dashboard, Variable Expenses, Attendance
  // NOTE: Products tab removed from staff - admin only
  const staffLinks = [
    { path: '/admin/stock-status', icon: ClipboardList, labelKey: 'app.stockStatus' },
    { path: '/admin/procurement', icon: TruckIcon, labelKey: 'app.procurement' },
    { path: '/admin/quick-commerce', icon: ShoppingCart, labelKey: 'app.quickCommerce' },
    { path: '/admin/retailer-orders', icon: ShoppingCart, labelKey: 'app.retailerOrders' },
    { path: '/admin/wastage-dashboard', icon: Trash2, labelKey: 'app.wastageDashboard' },
    { path: '/admin/variable-expenses', icon: Receipt, labelKey: 'app.variableExpenses' },
    { path: '/staff/attendance', icon: UserCheck, labelKey: 'app.attendance' },
  ];

  // Retailer has their own portal (to be built)
  const retailerLinks = [
    { path: '/retailer/dashboard', icon: Home, labelKey: 'app.dashboard' },
  ];

  const links = user?.role === 'admin' ? adminLinks : user?.role === 'staff' ? staffLinks : retailerLinks;

  // Close sidebar on route change (mobile only) - fallback mechanism
  useEffect(() => {
    if (isMobile && onClose) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  
  // Force close handler for nav links
  const handleNavClick = useCallback(() => {
    if (isMobile && onClose) {
      // Use requestAnimationFrame to ensure DOM updates before closing
      requestAnimationFrame(() => {
        onClose();
      });
    }
  }, [isMobile, onClose]);

  // Sidebar should be visible on desktop, hideable on mobile
  // Use inline style for mobile to ensure the sidebar stays hidden
  const sidebarClasses = isMobile 
    ? `sidebar ${!isOpen ? 'mobile-hidden' : ''}`
    : 'sidebar';
    
  // Explicit inline styles for mobile to guarantee hidden state
  const mobileHiddenStyle = isMobile && !isOpen ? {
    transform: 'translateY(-100%)',
    opacity: 0,
    pointerEvents: 'none'
  } : {};

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && (
        <div 
          className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
          onClick={onClose}
          onTouchEnd={(e) => {
            e.stopPropagation();
            onClose();
          }}
          data-testid="sidebar-overlay"
        />
      )}
      
      {/* Sidebar */}
      <div className={sidebarClasses} style={mobileHiddenStyle} data-testid="sidebar">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#14532D]" data-testid="app-title">{t('app.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{user?.role?.toUpperCase()}</p>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-2 bg-gray-100 rounded-lg"
              data-testid="close-sidebar-button"
            >
              <X size={24} className="text-gray-600" />
            </button>
          )}
        </div>
        
        <nav className="p-4 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                data-testid={`nav-${t(link.labelKey).toLowerCase().replace(' ', '-')}`}
                onClick={handleNavClick}
                onTouchEnd={handleNavClick}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1 hover:bg-gray-100 ${
                  isActive ? 'bg-[#14532D] text-white hover:bg-[#166534]' : 'text-gray-700'
                }`}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{t(link.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 bg-white">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-10 h-10 rounded-full bg-[#14532D] flex items-center justify-center text-white flex-shrink-0">
              <User size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate" data-testid="user-name">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="logout-button"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
          >
            <LogOut size={16} />
            {t('app.logout')}
          </button>
        </div>
      </div>
    </>
  );
}
