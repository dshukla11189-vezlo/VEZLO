import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { isAuthenticated, getUser } from './utils/auth';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/admin/Dashboard';
import Products from './pages/admin/Products';
import StockStatus from './pages/admin/StockStatus';
import WastageDashboard from './pages/admin/WastageDashboard';
import Procurement from './pages/admin/Procurement';
import QuickCommerce from './pages/admin/QuickCommerce';
import RetailerOrders from './pages/admin/RetailerOrders';
import Wastage from './pages/admin/Wastage';
import VariableExpenses from './pages/admin/VariableExpenses';
import FixedExpenses from './pages/admin/FixedExpenses';
import Payments from './pages/admin/Payments';
import Invoices from './pages/admin/Invoices';
import RetailerDashboard from './pages/retailer/Dashboard';
import StaffDashboard from './pages/staff/Dashboard';
import './App.css';

function ProtectedRoute({ children, allowedRoles }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = getUser();
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const user = getUser();

  const getDefaultRoute = () => {
    if (!isAuthenticated()) return '/login';
    
    switch (user?.role) {
      case 'admin':
      case 'staff':
        return '/admin/dashboard';
      case 'retailer':
        return '/retailer/dashboard';
      default:
        return '/login';
    }
  };

  return (
    <BrowserRouter>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<Navigate to={getDefaultRoute()} replace />} />
          
          {/* Admin & Staff Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/stock-status"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <StockStatus />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/wastage-dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <WastageDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/procurement"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <Procurement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/quick-commerce"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <QuickCommerce />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/retailer-orders"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <RetailerOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/wastage"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <Wastage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/variable-expenses"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <VariableExpenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/fixed-expenses"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <FixedExpenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/payments"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <Payments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/invoices"
            element={
              <ProtectedRoute allowedRoles={['admin', 'staff']}>
                <Invoices />
              </ProtectedRoute>
            }
          />
          
          {/* Retailer Routes */}
          <Route
            path="/retailer/dashboard"
            element={
              <ProtectedRoute allowedRoles={['retailer']}>
                <RetailerDashboard />
              </ProtectedRoute>
            }
          />
          
          {/* Staff Routes */}
          <Route
            path="/staff/dashboard"
            element={
              <ProtectedRoute allowedRoles={['staff']}>
                <StaffDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster position="top-right" />
      </div>
    </BrowserRouter>
  );
}

export default App;