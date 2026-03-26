import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logout, getUser } from '../utils/auth';
import { Home, Package, ShoppingCart, TruckIcon, FileText, DollarSign, BarChart3, Trash2, LogOut, User, X } from 'lucide-react';

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const location = useLocation();
  const user = getUser();
  
  const adminLinks = [
    { path: '/admin/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/admin/products', icon: Package, label: 'Products' },
    { path: '/admin/procurement', icon: TruckIcon, label: 'Procurement' },
    { path: '/admin/qc-orders', icon: ShoppingCart, label: 'QC Orders' },
    { path: '/admin/retailer-orders', icon: ShoppingCart, label: 'Retailer Orders' },
    { path: '/admin/wastage', icon: Trash2, label: 'Wastage' },
    { path: '/admin/payments', icon: DollarSign, label: 'Payments' },
    { path: '/admin/invoices', icon: FileText, label: 'Invoices' },
  ];

  const retailerLinks = [
    { path: '/retailer/dashboard', icon: Home, label: 'Dashboard' },
  ];

  const staffLinks = [
    { path: '/staff/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/admin/products', icon: Package, label: 'Products' },
    { path: '/admin/procurement', icon: TruckIcon, label: 'Procurement' },
    { path: '/admin/wastage', icon: Trash2, label: 'Wastage' },
  ];

  const links = user?.role === 'admin' ? adminLinks : user?.role === 'retailer' ? retailerLinks : staffLinks;

  // Close sidebar on route change (mobile only)
  useEffect(() => {
    if (isMobile && onClose) {
      onClose();
    }
  }, [location.pathname]);

  // Sidebar should be visible on desktop, hideable on mobile
  const sidebarClasses = isMobile 
    ? `sidebar ${!isOpen ? 'mobile-hidden' : ''}`
    : 'sidebar';

  return (
    <>
      {/* Overlay for mobile */}
      {isMobile && (
        <div 
          className={`sidebar-overlay ${isOpen ? 'active' : ''}`}
          onClick={onClose}
          data-testid="sidebar-overlay"
        />
      )}
      
      {/* Sidebar */}
      <div className={sidebarClasses} data-testid="sidebar">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#14532D]" data-testid="app-title">FreshFlow</h1>
            <p className="text-sm text-gray-500 mt-1">{user?.role?.toUpperCase()}</p>
          </div>
          {isMobile && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
              data-testid="close-sidebar-button"
            >
              <X size={20} className="text-gray-600" />
            </button>
          )}
        </div>
        
        <nav className="p-4">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                data-testid={`nav-${link.label.toLowerCase().replace(' ', '-')}`}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 hover:bg-gray-100 ${
                  isActive ? 'bg-[#14532D] text-white hover:bg-[#166534]' : 'text-gray-700'
                }`}
              >
                <Icon size={20} />
                <span className="text-sm font-medium">{link.label}</span>
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
            Logout
          </button>
        </div>
      </div>
    </>
  );
}
