import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { 
  Plus, Package, Truck, AlertTriangle, DollarSign, 
  Edit, Edit2, Trash2, X, ChevronDown, ChevronRight, FileText, Download, Check,
  Search, IndianRupee, ShoppingCart, CreditCard, TrendingUp, FileSpreadsheet, Clock, Zap, ClipboardList, Pencil, CheckCircle, Save, Eye, RefreshCw, Tag
} from 'lucide-react';

// Export utility function
const exportToCSV = (data, filename, columns) => {
  if (!data || data.length === 0) {
    toast.error('No data to export');
    return;
  }
  
  const headers = columns.map(c => c.label);
  const rows = data.map(item => 
    columns.map(c => {
      const value = c.getter(item);
      // Escape quotes and wrap in quotes
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  
  toast.success(`Exported ${data.length} records to Excel`);
};

export default function RetailerOrders() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('indents');
  const [retailers, setRetailers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  const [selectedRetailer, setSelectedRetailer] = useState('');
  
  // Date filters - default to today
  const today = new Date().toISOString().split('T')[0];
  const [indentDateFilter, setIndentDateFilter] = useState(today);
  const [dispatchDateFilter, setDispatchDateFilter] = useState(today);
  
  // Indents state
  const [indents, setIndents] = useState([]);
  const [filteredIndents, setFilteredIndents] = useState([]);
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [indentForm, setIndentForm] = useState({
    retailer_id: '',
    indent_date: new Date().toISOString().split('T')[0],
    items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: '', status: 'pending' }],
    remarks: ''
  });
  
  // Dispatches state
  const [dispatches, setDispatches] = useState([]);
  const [filteredDispatches, setFilteredDispatches] = useState([]);
  const [expandedDispatchId, setExpandedDispatchId] = useState(null);  // For showing dispatch items
  const [expandedRejectionDates, setExpandedRejectionDates] = useState({});  // For grouping rejections by date
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState(null);
  const [selectedIndent, setSelectedIndent] = useState(null);
  const [dispatchForm, setDispatchForm] = useState({
    dispatch_date: new Date().toISOString().split('T')[0],
    items: [],
    remarks: '',
    transport_charges: 0
  });
  
  // Editing indent state
  const [editingIndent, setEditingIndent] = useState(null);
  
  // Invoices state
  const [invoices, setInvoices] = useState([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [uninvoicedDispatches, setUninvoicedDispatches] = useState([]);
  const [selectedDispatchIds, setSelectedDispatchIds] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [editInvoiceForm, setEditInvoiceForm] = useState(null);
  const [editInvoicePayments, setEditInvoicePayments] = useState([]); // Payment history for edit modal
  const [editInvoicePaymentsLoading, setEditInvoicePaymentsLoading] = useState(false);
  // For item-level selection
  const [uninvoicedItems, setUninvoicedItems] = useState([]); // All uninvoiced items
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [invoiceForm, setInvoiceForm] = useState({
    retailer_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    remarks: ''
  });
  
  // Rejections state
  const [rejections, setRejections] = useState([]);
  const [filteredRejections, setFilteredRejections] = useState([]);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [editingRejection, setEditingRejection] = useState(null);
  const [rejectionDateFilter, setRejectionDateFilter] = useState('');
  const [rejectionRetailerFilter, setRejectionRetailerFilter] = useState('');
  const [rejectionProductFilter, setRejectionProductFilter] = useState('');
  const [rejectionForm, setRejectionForm] = useState({
    retailer_id: '',
    rejection_date: new Date().toISOString().split('T')[0],
    items: [] // Changed to array of items for multi-item rejection
  });
  const [rejectionDispatchItems, setRejectionDispatchItems] = useState([]); // Dispatch items for selected date
  
  // Error dialog state for rejection validation
  const [rejectionErrorDialog, setRejectionErrorDialog] = useState({
    open: false,
    title: '',
    message: ''
  });
  
  // Payments state
  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    retailer_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    remarks: ''
  });
  const [paymentContext, setPaymentContext] = useState(null); // Store dispatch details for selected date/retailer
  
  // Invoice Payment Modal state
  const [showInvoicePaymentModal, setShowInvoicePaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [invoicePaymentForm, setInvoicePaymentForm] = useState({
    amount: '',
    payment_mode: 'cash',
    received_by: '',
    received_by_name: '',
    reference_number: '',
    remarks: '',
    payment_date: new Date().toISOString().split('T')[0]
  });
  const [staffUsers, setStaffUsers] = useState([]); // Admin and Staff users for "Received By"
  const [invoiceExistingPayments, setInvoiceExistingPayments] = useState([]); // Existing payments for partial invoices
  const [loadingExistingPayments, setLoadingExistingPayments] = useState(false);
  
  // Payment History Modal state (for viewing/editing paid invoices)
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState(null);
  const [invoicePaymentHistory, setInvoicePaymentHistory] = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  
  // Edit Payment state
  const [editingPayment, setEditingPayment] = useState(null);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    remarks: '',
    payment_date: ''
  });
  
  // Invoice filter state
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all'); // all, pending, partial, paid
  
  // Search states for autocomplete
  const [productSearch, setProductSearch] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(null); // index of item showing dropdown
  const [showVariantDropdown, setShowVariantDropdown] = useState(null);
  const [retailerSearch, setRetailerSearch] = useState('');
  const [showRetailerDropdown, setShowRetailerDropdown] = useState(false);
  const [paymentRetailerSearch, setPaymentRetailerSearch] = useState('');
  const [showPaymentRetailerDropdown, setShowPaymentRetailerDropdown] = useState(false);
  const productSearchRef = useRef(null);
  const variantSearchRef = useRef(null);
  
  // Dashboard summary state
  const [dashboardStats, setDashboardStats] = useState({
    totalIndents: 0,
    pendingIndents: 0,
    totalDispatches: 0,
    totalMrpValue: 0,
    totalNetReceivable: 0,
    totalInvoiced: 0,
    totalPayments: 0,
    pendingAmount: 0,
    totalRejections: 0
  });
  
  // Rejection Loss date filter
  const [rejectionLossDateFrom, setRejectionLossDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [rejectionLossDateTo, setRejectionLossDateTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Closing Inventory Management (Admin)
  const [closingInventoryData, setClosingInventoryData] = useState([]);
  const [closingInventoryDate, setClosingInventoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [closingInventoryRetailer, setClosingInventoryRetailer] = useState('');
  const [editingClosingItem, setEditingClosingItem] = useState(null);
  const [editingClosingQty, setEditingClosingQty] = useState('');
  const [editingClosingVariant, setEditingClosingVariant] = useState('');
  const [variantSearchTerm, setVariantSearchTerm] = useState('');
  const [dispatchLinkedItemInfo, setDispatchLinkedItemInfo] = useState(null); // Modal for dispatch-linked items
  const [closingHasData, setClosingHasData] = useState(true); // Track if the selected date has closing data
  const [adminEnteringClosing, setAdminEnteringClosing] = useState(false); // Admin entering new closing data
  const [adminClosingInputs, setAdminClosingInputs] = useState({}); // Admin input values for new closing
  
  // Payment Summary state
  const [showPaymentSummaryModal, setShowPaymentSummaryModal] = useState(false);
  const [showPaymentSummaryPreview, setShowPaymentSummaryPreview] = useState(false); // Preview popup
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [selectedInvoicesForSummary, setSelectedInvoicesForSummary] = useState({});
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false);
  
  // Payment Audit state (for finding and deleting orphan payments)
  const [showPaymentAuditModal, setShowPaymentAuditModal] = useState(false);
  const [paymentAuditRetailerId, setPaymentAuditRetailerId] = useState('');
  const [paymentAuditData, setPaymentAuditData] = useState(null);
  const [paymentAuditLoading, setPaymentAuditLoading] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [expandedIndents, setExpandedIndents] = useState({});
  const [expandedInvoices, setExpandedInvoices] = useState({});
  
  // Auto Indent Creation state
  const [showAutoIndentModal, setShowAutoIndentModal] = useState(false);
  const [autoIndentDate, setAutoIndentDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]); // Tomorrow by default
  const [autoIndentRetailerId, setAutoIndentRetailerId] = useState('');
  const [autoIndentLoading, setAutoIndentLoading] = useState(false);

  // Daily Requirement state
  const [dailyReqDate, setDailyReqDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyReqData, setDailyReqData] = useState([]);
  const [dailyReqLoading, setDailyReqLoading] = useState(false);
  const [dailyReqError, setDailyReqError] = useState('');
  const [dailyReqRetailer, setDailyReqRetailer] = useState('');
  const [dailyReqSaving, setDailyReqSaving] = useState(false);
  const [dailyReqSaved, setDailyReqSaved] = useState(false);
  const [retailWastageAverages, setRetailWastageAverages] = useState([]);
  
  // Daily Requirement sub-tabs state
  const [dailyReqSubTab, setDailyReqSubTab] = useState('purchase'); // 'purchase', 'stickers', or 'mrp'
  
  // Category collapse state for Purchase and Stickers tabs
  const [expandedPurchaseCategories, setExpandedPurchaseCategories] = useState({});
  const [expandedStickersCategories, setExpandedStickersCategories] = useState({});
  
  // Stickers tab state
  const [stickersData, setStickersData] = useState([]);
  const [stickersLoading, setStickersLoading] = useState(false);
  const [stickersSearch, setStickersSearch] = useState('');
  const [stickersCategoryFilter, setStickersCategoryFilter] = useState('all');

  // MRP tab state
  const [mrpData, setMrpData] = useState([]);
  const [mrpLoading, setMrpLoading] = useState(false);
  const [mrpDate, setMrpDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [expandedMrpCategories, setExpandedMrpCategories] = useState({});
  const [lastVariants, setLastVariants] = useState({});
  const [savingMrp, setSavingMrp] = useState(false);
  const [mrpHasUnsavedChanges, setMrpHasUnsavedChanges] = useState(false);
  const [pendingMrpChanges, setPendingMrpChanges] = useState({});
  const [blinkitPrices, setBlinkitPrices] = useState({});
  const [blinkitLoading, setBlinkitLoading] = useState(false);
  const [scrapingBlinkit, setScrapingBlinkit] = useState(false);

  // Load base data
  const loadBaseData = useCallback(async () => {
    try {
      const [retailersRes, productsRes, packagingsRes] = await Promise.all([
        api.get('/api/retailers'),
        api.get('/api/products'),
        api.get('/api/qc-packaging')
      ]);
      setRetailers(retailersRes.data);
      setProducts(productsRes.data);
      setPackagings(packagingsRes.data);
    } catch (error) {
      console.error('Failed to load base data:', error);
    }
  }, []);

  const loadIndents = useCallback(async () => {
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-indents${params}`);
      setIndents(response.data);
    } catch (error) {
      console.error('Failed to load indents:', error);
    }
  }, [selectedRetailer]);

  const loadDispatches = useCallback(async () => {
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-dispatches${params}`);
      setDispatches(response.data);
    } catch (error) {
      console.error('Failed to load dispatches:', error);
    }
  }, [selectedRetailer]);

  const loadInvoices = useCallback(async () => {
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-invoices${params}`);
      setInvoices(response.data);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    }
  }, [selectedRetailer]);

  const loadRejections = useCallback(async () => {
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-rejections${params}`);
      setRejections(response.data);
    } catch (error) {
      console.error('Failed to load rejections:', error);
    }
  }, [selectedRetailer]);

  const loadPayments = useCallback(async () => {
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-payments${params}`);
      setPayments(response.data);
    } catch (error) {
      console.error('Failed to load payments:', error);
    }
  }, [selectedRetailer]);

  // Load admin/staff users for "Received By" dropdown
  const loadStaffUsers = useCallback(async () => {
    try {
      const response = await api.get('/api/users');
      // Filter only admin and staff users
      const adminStaff = response.data.filter(u => u.role === 'admin' || u.role === 'staff');
      setStaffUsers(adminStaff);
    } catch (error) {
      console.error('Failed to load staff users:', error);
    }
  }, []);

  // Get current logged-in user from localStorage
  const getCurrentUserId = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.id || user.user_id;
      }
    } catch (e) {
      console.error('Failed to get current user:', e);
    }
    return '';
  };

  const getCurrentUserName = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.name || user.email;
      }
    } catch (e) {
      console.error('Failed to get current user name:', e);
    }
    return '';
  };

  const getCurrentUserRole = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.role || 'staff';
      }
    } catch (e) {
      console.error('Failed to get current user role:', e);
    }
    return 'staff';
  };

  // Check if user can edit MRP for a given date (only admin can edit past dates)
  const canEditMrpForDate = (date) => {
    const today = new Date().toISOString().split('T')[0];
    const userRole = getCurrentUserRole();
    if (date < today) {
      return userRole === 'admin';
    }
    return true; // Anyone can edit today's or future dates
  };

  // Load closing inventory for admin management
  const loadClosingInventory = useCallback(async () => {
    if (!closingInventoryRetailer || !closingInventoryDate) {
      setClosingInventoryData([]);
      setClosingHasData(true);
      return;
    }
    try {
      const res = await api.get(`/api/retailer-closing-inventory/summary/${closingInventoryRetailer}?date=${closingInventoryDate}`);
      const items = res.data.items || [];
      
      // Check if there's actual closing data - use the flag if available, otherwise check items
      const hasAnyClosingRecorded = items.some(item => item.closing_qty !== null && item.closing_qty !== undefined);
      const hasClosingData = res.data.has_closing_data !== undefined 
        ? res.data.has_closing_data 
        : hasAnyClosingRecorded;
      
      console.log('Closing inventory loaded:', { 
        date: closingInventoryDate, 
        totalItems: items.length, 
        hasClosingData, 
        itemsWithClosing: items.filter(i => i.closing_qty != null).length 
      });
      
      setClosingInventoryData(items);
      setClosingHasData(hasClosingData);
      
      // Reset admin entering mode
      setAdminEnteringClosing(false);
      setAdminClosingInputs({});
      
    } catch (error) {
      console.error('Failed to load closing inventory:', error);
      setClosingInventoryData([]);
      setClosingHasData(false);
    }
  }, [closingInventoryRetailer, closingInventoryDate]);

  // Admin: Update closing inventory item
  const updateClosingItem = async (itemId, newQty, newVariantName = null) => {
    try {
      const updateData = {
        closing_qty: parseFloat(newQty)
      };
      if (newVariantName) {
        updateData.variant_name = newVariantName;
      }
      await api.put(`/api/retailer-closing-inventory/item/${itemId}`, updateData);
      toast.success('Item updated successfully');
      setEditingClosingItem(null);
      setEditingClosingQty('');
      setEditingClosingVariant('');
      setVariantSearchTerm('');
      loadClosingInventory();
    } catch (error) {
      toast.error('Failed to update item');
    }
  };

  // Admin: Delete closing inventory item - with dispatch linkage check
  const adminDeleteClosingItem = async (item) => {
    const { id: itemId, product_name, received_qty, linked_dispatches, opening_qty } = item;
    
    // Check if item is linked to any dispatch
    const hasDispatchLinkage = (received_qty > 0) || (linked_dispatches && linked_dispatches.length > 0);
    
    if (hasDispatchLinkage) {
      // Show dispatch info modal instead of deleting
      const dispatchDates = linked_dispatches?.map(d => d.dispatch_date) || [];
      const uniqueDates = [...new Set(dispatchDates)];
      setDispatchLinkedItemInfo({
        product_name,
        variant_name: item.variant_name,
        linked_dispatches: linked_dispatches || [],
        opening_qty: opening_qty || 0,
        received_qty: received_qty || 0,
        dispatch_dates: uniqueDates
      });
      return; // Don't delete - show info instead
    }
    
    // Check if item only has opening_qty (from previous closing, not dispatch)
    if (!itemId) {
      toast.error('This item has no database record to delete. It may be derived from previous day closing.');
      return;
    }
    
    // Not linked to dispatch - proceed with delete confirmation
    if (!window.confirm(`Delete closing entry for "${product_name}"?`)) return;
    
    try {
      await api.delete(`/api/retailer-closing-inventory/item/${itemId}`);
      toast.success('Item deleted successfully');
      loadClosingInventory();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete item');
    }
  };
  
  // Admin: Save closing inventory entries for a date that has no closing data
  const handleAdminSaveClosing = async () => {
    if (!closingInventoryRetailer || !closingInventoryDate) {
      toast.error('Please select a retailer and date');
      return;
    }
    
    // Filter items that have closing qty entered
    const itemsToSave = closingInventoryData
      .filter(item => {
        const inputValue = adminClosingInputs[item.product_id];
        return inputValue !== undefined && inputValue !== '' && !isNaN(parseFloat(inputValue));
      })
      .map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id || null,
        variant_name: item.variant_name || 'Kg',
        closing_qty: parseFloat(adminClosingInputs[item.product_id])
      }));
    
    if (itemsToSave.length === 0) {
      toast.error('Please enter closing quantities for at least one item');
      return;
    }
    
    try {
      await api.post('/api/retailer-closing-inventory/bulk', {
        retailer_id: closingInventoryRetailer,
        closing_date: closingInventoryDate,
        items: itemsToSave
      });
      
      toast.success(`Saved closing inventory for ${itemsToSave.length} items`);
      setAdminEnteringClosing(false);
      setAdminClosingInputs({});
      loadClosingInventory();
    } catch (error) {
      console.error('Failed to save closing:', error);
      toast.error('Failed to save closing inventory');
    }
  };

  // Load unpaid invoices for selected retailer
  const loadUnpaidInvoices = async (retailerId = null) => {
    const targetRetailerId = retailerId || closingInventoryRetailer;
    if (!targetRetailerId) {
      toast.error('Please select a retailer first');
      return;
    }
    
    setPaymentSummaryLoading(true);
    try {
      const response = await api.get(`/api/retailer-invoices?retailer_id=${targetRetailerId}`);
      // Filter unpaid invoices (status not 'paid')
      const unpaid = response.data.filter(inv => inv.status !== 'paid');
      setUnpaidInvoices(unpaid);
      setSelectedInvoicesForSummary({});
      setShowPaymentSummaryModal(true);
    } catch (error) {
      console.error('Failed to load invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setPaymentSummaryLoading(false);
    }
  };

  // Toggle invoice selection for summary
  const toggleInvoiceForSummary = (invoiceId) => {
    setSelectedInvoicesForSummary(prev => ({
      ...prev,
      [invoiceId]: !prev[invoiceId]
    }));
  };

  // Select all unpaid invoices
  const selectAllInvoicesForSummary = () => {
    const allSelected = {};
    unpaidInvoices.forEach(inv => {
      allSelected[inv.id] = true;
    });
    setSelectedInvoicesForSummary(allSelected);
  };

  // Get selected invoices data for summary
  const getSelectedInvoicesData = () => {
    // Helper function to format date as DD-MM-YYYY
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '-';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };
    
    return unpaidInvoices
      .filter(inv => selectedInvoicesForSummary[inv.id])
      .map((inv, idx) => {
        const amountPayable = inv.net_payable || 0;
        const paidAmount = inv.paid_amount || 0;
        return {
          serialNum: idx + 1,
          indentDate: formatDate(inv.indent_date || inv.invoice_date),
          dispatchDate: formatDate(inv.dispatch_date || inv.invoice_date),
          invoiceNumber: inv.invoice_number,
          grossValue: inv.gross_value || 0,
          rejections: inv.rejection_amount || 0,
          totalMrpValue: inv.total_mrp_value || 0,
          commission: inv.commission_amount || 0,
          amountPayable: amountPayable,
          paidAmount: paidAmount,
          netReceivable: amountPayable - paidAmount
        };
      });
  };

  // Export payment summary to CSV
  const exportPaymentSummary = () => {
    const data = getSelectedInvoicesData();
    if (data.length === 0) {
      toast.error('Please select at least one invoice');
      return;
    }
    
    // Headers without Row Total
    const headers = ['S.No', 'Indent Date', 'Dispatch Date', 'Invoice Number', 'Gross Value', 'Rejections', 'Total MRP Value', 'Commission', 'Amount Payable', 'Paid Amount', 'Net Receivable'];
    const rows = data.map(d => [
      d.serialNum,
      d.indentDate,
      d.dispatchDate,
      d.invoiceNumber,
      d.grossValue.toFixed(2),
      (-d.rejections).toFixed(2),  // Negative sign for rejections
      d.totalMrpValue.toFixed(2),
      (-d.commission).toFixed(2),  // Negative sign for commission
      d.amountPayable.toFixed(2),
      d.paidAmount.toFixed(2),
      d.netReceivable.toFixed(2)
    ]);
    
    // Add totals row
    const totals = data.reduce((acc, d) => ({
      grossValue: acc.grossValue + d.grossValue,
      rejections: acc.rejections + d.rejections,
      totalMrpValue: acc.totalMrpValue + d.totalMrpValue,
      commission: acc.commission + d.commission,
      amountPayable: acc.amountPayable + d.amountPayable,
      paidAmount: acc.paidAmount + d.paidAmount,
      netReceivable: acc.netReceivable + d.netReceivable
    }), { grossValue: 0, rejections: 0, totalMrpValue: 0, commission: 0, amountPayable: 0, paidAmount: 0, netReceivable: 0 });
    
    rows.push(['', '', '', 'TOTAL', totals.grossValue.toFixed(2), (-totals.rejections).toFixed(2), totals.totalMrpValue.toFixed(2), (-totals.commission).toFixed(2), totals.amountPayable.toFixed(2), totals.paidAmount.toFixed(2), totals.netReceivable.toFixed(2)]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const retailerName = retailers.find(r => r.id === closingInventoryRetailer)?.company_name || 'Retailer';
    link.setAttribute('download', `Payment_Summary_${retailerName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Payment summary exported');
  };

  // Payment Audit - Load all payments for a retailer
  const loadPaymentAudit = async (retailerId) => {
    if (!retailerId) {
      toast.error('Please select a retailer');
      return;
    }
    
    setPaymentAuditLoading(true);
    try {
      const response = await api.get(`/api/retailer-payments/detailed/${retailerId}`);
      setPaymentAuditData(response.data);
      setShowPaymentAuditModal(true);
    } catch (error) {
      console.error('Failed to load payment audit:', error);
      toast.error('Failed to load payment data');
    } finally {
      setPaymentAuditLoading(false);
    }
  };

  // Payment Audit - Delete a specific payment
  const deletePaymentFromAudit = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment? This action cannot be undone.')) {
      return;
    }
    
    setDeletingPaymentId(paymentId);
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      // Reload the audit data
      if (paymentAuditRetailerId) {
        await loadPaymentAudit(paymentAuditRetailerId);
      }
      // Also reload main payments data
      await loadPayments();
    } catch (error) {
      console.error('Failed to delete payment:', error);
      toast.error('Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

  // Build a map of products for quick lookup (by id and name)
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    });
    return map;
  }, [products]);
  
  // Helper to get translated product name based on current language
  const getProductName = useCallback((item) => {
    if (!item) return '';
    
    const isHindi = i18n.language === 'hi';
    
    // If it's a full product object with name_hi already
    if (item.name_hi && isHindi) {
      return item.name_hi;
    }
    
    // Try to find the product in our lookup map
    let product = null;
    
    // First try by product_id (supports both snake_case and camelCase)
    const productId = item.product_id || item.productId;
    if (productId) {
      product = productMap.get(productId);
    }
    
    // Then try by name match (supports both snake_case and camelCase)
    if (!product) {
      const itemName = item.product_name || item.productName || item.name;
      if (itemName) {
        product = productMap.get(itemName);
      }
    }
    
    // If we found a matching product, return translated name
    if (product) {
      if (isHindi && product.name_hi) {
        return product.name_hi;
      }
      return product.name;
    }
    
    // Fallback to stored product_name (supports both formats)
    return item.product_name || item.productName || item.name || '';
  }, [productMap, i18n.language]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await loadBaseData();
      await Promise.all([loadIndents(), loadDispatches(), loadInvoices(), loadRejections(), loadPayments(), loadStaffUsers()]);
      setLoading(false);
    };
    loadAll();
  }, [loadBaseData, loadIndents, loadDispatches, loadInvoices, loadRejections, loadPayments, loadStaffUsers]);

  // Filter indents by date
  useEffect(() => {
    if (!indentDateFilter) {
      setFilteredIndents(indents);
    } else {
      const filtered = indents.filter(indent => {
        const indentDate = indent.indent_date?.split('T')[0];
        return indentDate === indentDateFilter;
      });
      setFilteredIndents(filtered);
    }
  }, [indents, indentDateFilter]);

  // Filter dispatches by date
  useEffect(() => {
    if (!dispatchDateFilter) {
      setFilteredDispatches(dispatches);
    } else {
      const filtered = dispatches.filter(dispatch => {
        const dispatchDate = dispatch.dispatch_date?.split('T')[0];
        return dispatchDate === dispatchDateFilter;
      });
      setFilteredDispatches(filtered);
    }
  }, [dispatches, dispatchDateFilter]);

  // Filter rejections by date, retailer, and product
  useEffect(() => {
    let filtered = [...rejections];
    
    if (rejectionDateFilter) {
      filtered = filtered.filter(r => r.rejection_date?.split('T')[0] === rejectionDateFilter);
    }
    
    if (rejectionRetailerFilter) {
      filtered = filtered.filter(r => r.retailer_id === rejectionRetailerFilter);
    }
    
    if (rejectionProductFilter) {
      filtered = filtered.filter(r => 
        r.product_name?.toLowerCase().includes(rejectionProductFilter.toLowerCase())
      );
    }
    
    setFilteredRejections(filtered);
  }, [rejections, rejectionDateFilter, rejectionRetailerFilter, rejectionProductFilter]);

  // Load closing inventory when retailer or date changes
  useEffect(() => {
    if (closingInventoryRetailer && closingInventoryDate) {
      loadClosingInventory();
    }
  }, [closingInventoryRetailer, closingInventoryDate, loadClosingInventory]);

  // Calculate dashboard stats whenever data changes
  useEffect(() => {
    const totalMrpValue = dispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);
    // Net Receivable should be based on INVOICES (after rejections and commission)
    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.net_payable || 0), 0);
    
    // Filter payments by date range (same as rejection loss date filter)
    const filteredPayments = payments.filter(p => {
      const payDate = p.payment_date?.split('T')[0];
      return payDate >= rejectionLossDateFrom && payDate <= rejectionLossDateTo;
    });
    const totalPaymentsReceived = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalRejections = rejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
    
    // Net Receivable = Total invoiced amount (this is what retailer owes us)
    // Pending = Invoiced - Payments received
    setDashboardStats({
      totalIndents: indents.length,
      pendingIndents: indents.filter(i => i.status === 'pending').length,
      totalDispatches: dispatches.length,
      totalMrpValue,
      totalNetReceivable: totalInvoiced,  // Use invoice net_payable, not dispatch net_payable
      totalInvoiced,
      totalPayments: totalPaymentsReceived,
      totalRejections,
      pendingAmount: totalInvoiced - totalPaymentsReceived  // Pending = Invoiced - Paid
    });
  }, [indents, dispatches, invoices, payments, rejections, rejectionLossDateFrom, rejectionLossDateTo]);

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate rejection amount from invoice items (when rejection_amount field is null/missing)
  const getInvoiceRejectionAmount = (invoice) => {
    if (invoice.rejection_amount !== null && invoice.rejection_amount !== undefined) {
      return invoice.rejection_amount;
    }
    // Calculate from items: sum of (rejected_qty * mrp) for each item
    return (invoice.items || []).reduce((sum, item) => {
      const rejectedQty = item.rejected_qty || 0;
      const mrp = item.mrp || 0;
      return sum + (rejectedQty * mrp);
    }, 0);
  };

  // Calculate gross value from invoice items
  const getInvoiceGrossValue = (invoice) => {
    if (invoice.gross_value) return invoice.gross_value;
    const rejectionAmount = getInvoiceRejectionAmount(invoice);
    return (invoice.total_mrp_value || 0) + rejectionAmount;
  };

  // ==================== EXPORT HANDLERS ====================
  const exportIndents = () => {
    const dataToExport = [];
    filteredIndents.forEach(indent => {
      indent.items?.forEach(item => {
        dataToExport.push({
          date: indent.indent_date,
          retailer: getRetailerNameById(indent.retailer_id) || indent.retailer_name,
          product: item.product_name,
          variant: item.variant_name || '-',
          quantity: item.quantity,
          status: indent.status,
          remarks: indent.remarks || ''
        });
      });
    });
    
    exportToCSV(dataToExport, 'retailer_indents', [
      { label: 'Date', getter: (d) => formatDate(d.date) },
      { label: 'Retailer', getter: (d) => d.retailer },
      { label: 'Product', getter: (d) => d.product },
      { label: 'Variant', getter: (d) => d.variant },
      { label: 'Quantity', getter: (d) => d.quantity },
      { label: 'Status', getter: (d) => d.status },
      { label: 'Remarks', getter: (d) => d.remarks }
    ]);
  };

  const exportDispatches = () => {
    const dataToExport = [];
    filteredDispatches.forEach(dispatch => {
      dispatch.items?.forEach(item => {
        dataToExport.push({
          date: dispatch.dispatch_date,
          retailer: getRetailerNameById(dispatch.retailer_id) || dispatch.retailer_name,
          product: item.product_name,
          variant: item.variant_name || '-',
          quantity: item.dispatched_qty,
          rate: item.rate || 0,
          mrp_value: item.mrp_value || 0,
          invoice_status: dispatch.invoice_status || 'uninvoiced'
        });
      });
    });
    
    exportToCSV(dataToExport, 'retailer_dispatches', [
      { label: 'Date', getter: (d) => formatDate(d.date) },
      { label: 'Retailer', getter: (d) => d.retailer },
      { label: 'Product', getter: (d) => d.product },
      { label: 'Variant', getter: (d) => d.variant },
      { label: 'Quantity', getter: (d) => d.quantity },
      { label: 'Rate', getter: (d) => d.rate },
      { label: 'MRP Value', getter: (d) => d.mrp_value },
      { label: 'Invoice Status', getter: (d) => d.invoice_status }
    ]);
  };

  const exportInvoices = () => {
    exportToCSV(invoices, 'retailer_invoices', [
      { label: 'Invoice No', getter: (d) => d.invoice_number },
      { label: 'Date', getter: (d) => formatDate(d.invoice_date) },
      { label: 'Retailer', getter: (d) => getRetailerNameById(d.retailer_id) || d.retailer_name },
      { label: 'Total MRP', getter: (d) => d.total_mrp_value || 0 },
      { label: 'Commission %', getter: (d) => d.commission_percentage || 0 },
      { label: 'Commission Amt', getter: (d) => d.commission_amount || 0 },
      { label: 'Net Receivable', getter: (d) => d.net_receivable || 0 },
      { label: 'Status', getter: (d) => d.status }
    ]);
  };

  const exportRejections = () => {
    const dataToExport = [];
    filteredRejections.forEach(rejection => {
      rejection.items?.forEach(item => {
        dataToExport.push({
          date: rejection.rejection_date,
          retailer: getRetailerNameById(rejection.retailer_id) || rejection.company_name,
          product: item.product_name,
          variant: item.variant_name || '-',
          quantity: item.rejection_qty,
          reason: item.reason || '-'
        });
      });
    });
    
    exportToCSV(dataToExport, 'retailer_rejections', [
      { label: 'Date', getter: (d) => formatDate(d.date) },
      { label: 'Retailer', getter: (d) => d.retailer },
      { label: 'Product', getter: (d) => d.product },
      { label: 'Variant', getter: (d) => d.variant },
      { label: 'Rejected Qty', getter: (d) => d.quantity },
      { label: 'Reason', getter: (d) => d.reason }
    ]);
  };

  const exportPayments = () => {
    exportToCSV(payments, 'retailer_payments', [
      { label: 'Date', getter: (d) => formatDate(d.payment_date) },
      { label: 'Retailer', getter: (d) => getRetailerNameById(d.retailer_id) || d.retailer_name },
      { label: 'Amount', getter: (d) => d.amount || 0 },
      { label: 'Payment Mode', getter: (d) => d.payment_mode },
      { label: 'Reference', getter: (d) => d.reference_number || '-' },
      { label: 'Remarks', getter: (d) => d.remarks || '-' }
    ]);
  };

  // ==================== INDENT HANDLERS ====================
  const handleCreateOrUpdateIndent = async (e) => {
    e.preventDefault();
    if (!indentForm.retailer_id) {
      toast.error('Please select a retailer');
      return;
    }
    if (indentForm.items.some(item => !item.product_id || !item.quantity)) {
      toast.error('Please fill all product details');
      return;
    }

    try {
      if (editingIndent) {
        await api.put(`/api/retailer-indents/${editingIndent.id}`, {
          retailer_id: indentForm.retailer_id,
          indent_date: new Date(indentForm.indent_date).toISOString(),
          items: indentForm.items,
          remarks: indentForm.remarks
        });
        toast.success('Indent updated successfully');
      } else {
        await api.post('/api/retailer-indents', {
          retailer_id: indentForm.retailer_id,
          indent_date: new Date(indentForm.indent_date).toISOString(),
          items: indentForm.items,
          remarks: indentForm.remarks
        });
        toast.success('Indent created successfully');
      }
      setShowIndentModal(false);
      setEditingIndent(null);
      resetIndentForm();
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save indent');
    }
  };

  const openEditIndentModal = (indent) => {
    setEditingIndent(indent);
    setIndentForm({
      retailer_id: indent.retailer_id,
      indent_date: indent.indent_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      items: indent.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id || '',
        variant_name: item.variant_name || '',
        quantity: item.quantity,
        status: item.status || 'pending'
      })),
      remarks: indent.remarks || ''
    });
    setShowIndentModal(true);
  };

  const handleDeleteIndent = async (indentId) => {
    if (!window.confirm('Are you sure you want to delete this indent?')) return;
    try {
      await api.delete(`/api/retailer-indents/${indentId}`);
      toast.success('Indent deleted');
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete indent');
    }
  };

  const resetIndentForm = () => {
    setIndentForm({
      retailer_id: '',
      indent_date: new Date().toISOString().split('T')[0],
      items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: '', status: 'pending' }],
      remarks: ''
    });
    setRetailerSearch('');
    setShowRetailerDropdown(false);
  };

  // Function to load previous indent items for retailer
  const loadPreviousRetailerIndent = async (retailerId = null) => {
    const targetRetailerId = retailerId || indentForm.retailer_id;
    if (!targetRetailerId) {
      toast.error('Please select a retailer first');
      return;
    }
    
    try {
      const res = await api.get(`/api/retailer-indents/previous/${targetRetailerId}`);
      if (res.data.indent && res.data.indent.items && res.data.indent.items.length > 0) {
        const previousItems = res.data.indent.items.map(item => ({
          product_id: item.product_id || '',
          product_name: item.product_name || '',
          variant_id: item.variant_id || '',
          variant_name: item.variant_name || '',
          quantity: '',  // Keep qty blank so user must enter new value
          status: 'pending'
        }));
        setIndentForm(prev => ({ ...prev, items: previousItems }));
        toast.success(`Loaded ${previousItems.length} items from previous indent. Please enter quantities.`);
      } else {
        toast.info('No previous indent found for this retailer');
      }
    } catch (error) {
      console.log('No previous indent found');
    }
  };

  // Handler for retailer selection that auto-loads previous indent
  const handleRetailerSelectForIndent = async (retailer) => {
    setIndentForm(prev => ({ ...prev, retailer_id: retailer.id }));
    setRetailerSearch(retailer.company_name || retailer.name || '');
    setShowRetailerDropdown(false);
    
    // Auto-load previous indent when retailer is selected (only if creating new indent)
    if (!editingIndent) {
      try {
        const res = await api.get(`/api/retailer-indents/previous/${retailer.id}`);
        if (res.data.indent && res.data.indent.items && res.data.indent.items.length > 0) {
          const previousItems = res.data.indent.items.map(item => ({
            product_id: item.product_id || '',
            product_name: item.product_name || '',
            variant_id: item.variant_id || '',
            variant_name: item.variant_name || '',
            quantity: '',  // Keep qty blank
            status: 'pending'
          }));
          setIndentForm(prev => ({ 
            ...prev, 
            retailer_id: retailer.id,
            items: previousItems 
          }));
          toast.success(`Loaded ${previousItems.length} items from previous indent. Please enter quantities.`);
        }
      } catch (error) {
        console.log('No previous indent found for retailer');
      }
    }
  };

  const addIndentItem = () => {
    setIndentForm(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: '', status: 'pending' }]
    }));
  };

  const removeIndentItem = (index) => {
    setIndentForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateIndentItem = (index, field, value) => {
    setIndentForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      if (field === 'product_id') {
        const product = products.find(p => p.id === value);
        items[index].product_name = product?.name || '';
      }
      if (field === 'variant_id') {
        const variant = packagings.find(p => p.id === value);
        items[index].variant_name = variant?.name || '';
      }
      return { ...prev, items };
    });
  };

  // ==================== AUTO INDENT CREATION ====================
  const handleAutoIndentCreation = async () => {
    if (!autoIndentRetailerId) {
      toast.error('Please select a retailer');
      return;
    }
    
    setAutoIndentLoading(true);
    try {
      const response = await api.post('/api/admin/generate-auto-indent', {
        retailer_id: autoIndentRetailerId,
        target_date: autoIndentDate
      });
      
      if (response.data.success) {
        toast.success(response.data.message || `Auto indent created successfully for ${response.data.retailer_name}`);
        setShowAutoIndentModal(false);
        setAutoIndentRetailerId('');
        loadIndents();
      } else {
        toast.error(response.data.message || 'Failed to create auto indent');
      }
    } catch (error) {
      console.error('Auto indent creation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to create auto indent. Check if retailer has sales history.');
    } finally {
      setAutoIndentLoading(false);
    }
  };

  // Load retail wastage averages - returns data directly for immediate use
  const loadRetailWastageAverages = useCallback(async () => {
    try {
      const response = await api.get('/api/retail-wastage-averages');
      const data = response.data || [];
      setRetailWastageAverages(data);
      return data;
    } catch (error) {
      console.error('Failed to load retail wastage averages:', error);
      return [];
    }
  }, []);

  // ==================== DAILY REQUIREMENT HANDLERS ====================
  const calculateDailyRequirement = useCallback(async () => {
    if (!dailyReqDate) {
      setDailyReqError('Please select a date');
      return;
    }
    
    setDailyReqLoading(true);
    setDailyReqError('');
    setDailyReqData([]);
    setDailyReqSaved(false);
    
    try {
      // Call the backend endpoint that calculates based on indents for the date
      let url = `/api/retailer-daily-requirement/calculate?target_date=${dailyReqDate}`;
      if (dailyReqRetailer) {
        url += `&retailer_id=${dailyReqRetailer}`;
      }
      
      const response = await api.get(url);
      const result = response.data;
      
      if (!result.success) {
        setDailyReqError(result.message || 'Failed to calculate daily requirement');
        return;
      }
      
      if (!result.items || result.items.length === 0) {
        setDailyReqError(`No indents found for ${dailyReqDate}. Please create indents for this date first.`);
        return;
      }
      
      // Transform backend data to frontend format
      const requirementData = result.items.map(item => ({
        productId: item.product_id,
        productName: item.product_name,
        category: item.category || 'Other',
        qtyUnits: item.qty_units,
        qtyKg: item.qty_kg,
        wastagePct: item.wastage_pct,
        requirementKg: item.requirement_kg
      }));
      
      setDailyReqData(requirementData);
      
      // Show info about the calculation
      toast.success(`Calculated from ${result.indent_count} indent(s) for ${dailyReqDate}`);
      
    } catch (error) {
      console.error('Failed to calculate daily requirement:', error);
      setDailyReqError('Failed to calculate. Please try again.');
    } finally {
      setDailyReqLoading(false);
    }
  }, [dailyReqDate, dailyReqRetailer]);

  // Calculate stickers data from indents
  const calculateStickersData = useCallback(async () => {
    if (!dailyReqDate) {
      return;
    }
    
    setStickersLoading(true);
    setStickersData([]);
    
    try {
      // Fetch indents for the selected date
      const response = await api.get(`/api/retailer-indents?from_date=${dailyReqDate}&to_date=${dailyReqDate}`);
      const allIndents = response.data || [];
      
      // Filter indents to only include those matching the exact selected date
      const indents = allIndents.filter(indent => {
        const indentDateStr = (indent.indent_date || '').toString().slice(0, 10);
        return indentDateStr === dailyReqDate;
      });
      
      if (indents.length === 0) {
        setStickersLoading(false);
        return;
      }
      
      // Build product info map from products state
      const productInfoMap = {};
      products.forEach(p => {
        productInfoMap[p.id] = {
          name: p.name,
          category: p.category || 'Other'
        };
      });
      
      // Aggregate by product NAME + variant NAME combination (not IDs)
      // This ensures same variants across different retailers are combined
      const combinationMap = {}; // key = "ProductName_VariantName" -> {product_name, category, variant_name, quantity}
      
      for (const indent of indents) {
        for (const item of (indent.items || [])) {
          const productId = item.product_id;
          const productInfo = productInfoMap[productId] || {};
          const productName = (productInfo.name || item.product_name || 'Unknown').trim();
          const variantName = (item.variant_name || 'Default').trim();
          const category = productInfo.category || 'Other';
          
          // Create key using product name + variant name (case-insensitive)
          const key = `${productName.toLowerCase()}_${variantName.toLowerCase()}`;
          
          if (!combinationMap[key]) {
            combinationMap[key] = {
              productId: productId,
              productName: productName,
              category: category,
              variantName: variantName,
              quantity: 0
            };
          }
          
          combinationMap[key].quantity += (item.quantity || 0);
        }
      }
      
      // Convert to array and sort by category then product name then variant
      const categoryOrder = { 'Fruits': 1, 'Vegetables': 2, 'Leafy': 3, 'Exotic': 4, 'Other': 5 };
      const stickersArray = Object.values(combinationMap).sort((a, b) => {
        const catA = categoryOrder[a.category] || 99;
        const catB = categoryOrder[b.category] || 99;
        if (catA !== catB) return catA - catB;
        const nameCompare = a.productName.localeCompare(b.productName);
        if (nameCompare !== 0) return nameCompare;
        return a.variantName.localeCompare(b.variantName);
      });
      
      setStickersData(stickersArray);
      
    } catch (error) {
      console.error('Failed to load stickers data:', error);
    } finally {
      setStickersLoading(false);
    }
  }, [dailyReqDate, products]);

  // Get unique categories from stickers data
  const stickersCategories = useMemo(() => {
    const cats = new Set(stickersData.map(item => item.category));
    return ['all', ...Array.from(cats).sort()];
  }, [stickersData]);

  // Filter stickers data based on search and category
  const filteredStickersData = useMemo(() => {
    let filtered = stickersData;
    
    // Filter by category
    if (stickersCategoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === stickersCategoryFilter);
    }
    
    // Filter by search
    if (stickersSearch.trim()) {
      const searchLower = stickersSearch.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.productName.toLowerCase().includes(searchLower) ||
        item.variantName.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  }, [stickersData, stickersCategoryFilter, stickersSearch]);

  // Category order for sorting
  const categoryOrder = { 'Vegetables': 1, 'Leafy': 2, 'Fruits': 3, 'Exotic': 4, 'Other': 99 };

  // Group Purchase data by category
  const groupedPurchaseData = useMemo(() => {
    const groups = {};
    dailyReqData.forEach(item => {
      const cat = item.category || 'Other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    // Sort categories by predefined order
    const sortedCategories = Object.keys(groups).sort((a, b) => 
      (categoryOrder[a] || 99) - (categoryOrder[b] || 99)
    );
    return { groups, sortedCategories };
  }, [dailyReqData]);

  // Group Stickers data by category
  const groupedStickersData = useMemo(() => {
    const groups = {};
    filteredStickersData.forEach(item => {
      const cat = item.category || 'Other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    // Sort categories by predefined order
    const sortedCategories = Object.keys(groups).sort((a, b) => 
      (categoryOrder[a] || 99) - (categoryOrder[b] || 99)
    );
    return { groups, sortedCategories };
  }, [filteredStickersData]);

  // Auto-expand all categories when data loads
  useEffect(() => {
    if (dailyReqData.length > 0) {
      const allCats = {};
      dailyReqData.forEach(item => {
        allCats[item.category || 'Other'] = true;
      });
      setExpandedPurchaseCategories(allCats);
    }
  }, [dailyReqData]);

  useEffect(() => {
    if (stickersData.length > 0) {
      const allCats = {};
      stickersData.forEach(item => {
        allCats[item.category || 'Other'] = true;
      });
      setExpandedStickersCategories(allCats);
    }
  }, [stickersData]);

  // Toggle category expansion for Purchase tab
  const togglePurchaseCategory = (category) => {
    setExpandedPurchaseCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Toggle category expansion for Stickers tab
  const toggleStickersCategory = (category) => {
    setExpandedStickersCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Get category color classes
  const getCategoryColorClasses = (category) => {
    switch (category) {
      case 'Fruits': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Vegetables': return 'bg-green-100 text-green-700 border-green-200';
      case 'Leafy': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Exotic': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Recalculate stickers when date changes and we're on stickers tab
  useEffect(() => {
    if (dailyReqSubTab === 'stickers' && dailyReqDate) {
      calculateStickersData();
    }
  }, [dailyReqDate, dailyReqSubTab, calculateStickersData]);

  // Auto-calculate Daily Requirement when tab is opened or date changes
  useEffect(() => {
    if (activeTab === 'dailyRequirement' && dailyReqDate && dailyReqSubTab === 'purchase') {
      calculateDailyRequirement();
    }
  }, [activeTab, dailyReqDate, dailyReqSubTab, calculateDailyRequirement]);

  // ==================== MRP TAB FUNCTIONS ====================
  // Load MRP data for a date
  const loadMrpData = useCallback(async (date) => {
    setMrpLoading(true);
    setMrpHasUnsavedChanges(false);
    setPendingMrpChanges({});
    try {
      const [mrpRes, variantsRes] = await Promise.all([
        api.get(`/api/daily-mrp?date=${date}`),
        api.get('/api/daily-mrp/last-variants')
      ]);
      setMrpData(mrpRes.data || []);
      setLastVariants(variantsRes.data || {});
      
      // Auto-expand all categories by default
      const cats = {};
      products.forEach(p => {
        cats[p.category || 'Others'] = true;
      });
      setExpandedMrpCategories(cats);
    } catch (error) {
      console.error('Failed to load MRP data:', error);
      toast.error('Failed to load MRP data');
    } finally {
      setMrpLoading(false);
    }
  }, [products]);

  // Auto-load MRP data when MRP tab is selected
  useEffect(() => {
    if (activeTab === 'dailyRequirement' && dailyReqSubTab === 'mrp' && mrpDate) {
      loadMrpData(mrpDate);
    }
  }, [activeTab, dailyReqSubTab, mrpDate, loadMrpData]);

  // Get retail-applicable packagings
  const retailPackagings = useMemo(() => {
    return packagings.filter(p => p.vertical === 'retail' || p.vertical === 'both' || !p.vertical);
  }, [packagings]);

  // Group products by category for MRP
  const mrpProductsByCategory = useMemo(() => {
    const grouped = {};
    products.forEach(p => {
      const cat = p.category || 'Others';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    // Sort products within each category
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [products]);

  // Load Blinkit prices
  const loadBlinkitPrices = useCallback(async (pincode = '411045') => {
    setBlinkitLoading(true);
    try {
      const res = await api.get(`/api/blinkit-prices/latest?pincode=${pincode}`);
      setBlinkitPrices(res.data || {});
    } catch (error) {
      console.error('Failed to load Blinkit prices:', error);
      // Don't show error toast - Blinkit prices are optional
    } finally {
      setBlinkitLoading(false);
    }
  }, []);

  // Trigger Blinkit scrape
  const triggerBlinkitScrape = async (pincode = '411045') => {
    setScrapingBlinkit(true);
    try {
      const res = await api.post(`/api/blinkit-prices/scrape?pincode=${pincode}`);
      toast.success(res.data.message || 'Blinkit scrape started');
      // Reload prices after a delay
      setTimeout(() => loadBlinkitPrices(pincode), 5000);
    } catch (error) {
      toast.error('Failed to start Blinkit scrape');
    } finally {
      setScrapingBlinkit(false);
    }
  };

  // Load Blinkit prices when MRP tab is selected
  useEffect(() => {
    if (activeTab === 'dailyRequirement' && dailyReqSubTab === 'mrp') {
      loadBlinkitPrices();
      // Also ensure products and packagings are loaded
      if (products.length === 0 || packagings.length === 0) {
        loadBaseData();
      }
    }
  }, [activeTab, dailyReqSubTab, loadBlinkitPrices, products.length, packagings.length, loadBaseData]);

  // Update Blinkit price for a product
  const updateBlinkitPrice = async (productId, price) => {
    const priceVal = parseFloat(price) || 0;
    
    // Update local state immediately
    setBlinkitPrices(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        product_id: productId,
        blinkit_price: priceVal
      }
    }));
    
    // Save to backend
    try {
      const date = new Date().toISOString().split('T')[0];
      const product = products.find(p => p.id === productId);
      
      await api.post('/api/blinkit-prices/manual', {
        product_id: productId,
        product_name: product?.name || '',
        category: product?.category || '',
        blinkit_price: priceVal,
        pincode: '411045',
        date: date
      });
    } catch (error) {
      console.error('Failed to save Blinkit price:', error);
    }
  };

  // Get MRP entry for a product
  const getMrpEntry = (productId, variantId = null) => {
    if (variantId) {
      return mrpData.find(e => e.product_id === productId && e.variant_id === variantId);
    }
    return mrpData.filter(e => e.product_id === productId);
  };

  // Add MRP entry for a product (allows same product with different variant)
  const addMrpEntry = async (product, selectedVariantId = null) => {
    // Use provided variant or fall back to last variant or first retail packaging
    let variant;
    if (selectedVariantId) {
      variant = retailPackagings.find(p => p.id === selectedVariantId);
    } else {
      const lastVariant = lastVariants[product.id];
      variant = lastVariant 
        ? retailPackagings.find(p => p.id === lastVariant.variant_id) 
        : retailPackagings[0];
    }
    
    const newEntry = {
      date: mrpDate,
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      variant_id: variant?.id || '',
      variant_name: variant?.name || '',
      mrp: 0
    };
    
    try {
      const res = await api.post('/api/daily-mrp/entry', newEntry);
      setMrpData(prev => [...prev, res.data]);
      toast.success('Entry added');
    } catch (error) {
      toast.error('Failed to add entry');
    }
  };

  // Update MRP entry (local state only, save with button)
  const updateMrpEntryLocal = (entryId, field, value) => {
    const entry = mrpData.find(e => e.id === entryId);
    if (!entry) return;
    
    let updateData = { ...entry };
    if (field === 'variant_id') {
      // Check if changing to this variant would create a duplicate
      const existingEntry = mrpData.find(e => 
        e.id !== entryId && 
        e.product_id === entry.product_id && 
        e.variant_id === value
      );
      if (existingEntry) {
        toast.error('This product-variant combination already exists');
        return;
      }
      
      const variant = retailPackagings.find(p => p.id === value);
      updateData.variant_id = value;
      updateData.variant_name = variant?.name || '';
    } else if (field === 'mrp') {
      updateData.mrp = parseFloat(value) || 0;
    }
    
    // Update local state
    setMrpData(prev => prev.map(e => e.id === entryId ? updateData : e));
    
    // Track pending changes
    setPendingMrpChanges(prev => ({
      ...prev,
      [entryId]: updateData
    }));
    setMrpHasUnsavedChanges(true);
  };

  // Save all pending MRP changes
  const saveMrpChanges = async () => {
    if (Object.keys(pendingMrpChanges).length === 0) {
      toast.info('No changes to save');
      return;
    }
    
    // Check for duplicate product+variant combinations
    const allEntries = mrpData.map(e => {
      // Use pending change if exists, otherwise use original
      return pendingMrpChanges[e.id] || e;
    });
    
    const seen = new Set();
    const duplicates = [];
    for (const entry of allEntries) {
      const key = `${entry.product_id}-${entry.variant_id}`;
      if (seen.has(key)) {
        duplicates.push(`${entry.product_name} (${entry.variant_name})`);
      }
      seen.add(key);
    }
    
    if (duplicates.length > 0) {
      toast.error(`Duplicate entries found: ${duplicates.join(', ')}. Please use different variants or remove duplicates.`);
      return;
    }
    
    setSavingMrp(true);
    try {
      // Save all pending changes
      const promises = Object.entries(pendingMrpChanges).map(([entryId, data]) => 
        api.put(`/api/daily-mrp/${entryId}`, data)
      );
      await Promise.all(promises);
      
      setPendingMrpChanges({});
      setMrpHasUnsavedChanges(false);
      toast.success(`Saved ${Object.keys(pendingMrpChanges).length} MRP entries`);
    } catch (error) {
      toast.error('Failed to save some MRP entries');
    } finally {
      setSavingMrp(false);
    }
  };

  // Delete MRP entry
  const deleteMrpEntry = async (entryId) => {
    try {
      await api.delete(`/api/daily-mrp/${entryId}`);
      setMrpData(prev => prev.filter(e => e.id !== entryId));
      // Remove from pending changes if exists
      setPendingMrpChanges(prev => {
        const updated = { ...prev };
        delete updated[entryId];
        return updated;
      });
      toast.success('Entry deleted');
    } catch (error) {
      toast.error('Failed to delete entry');
    }
  };

  // Toggle MRP category expansion
  const toggleMrpCategory = (category) => {
    setExpandedMrpCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Initialize MRP data for all products with last variants
  const initializeMrpData = async () => {
    setSavingMrp(true);
    try {
      // Fetch products directly to ensure we have them
      let productsToUse = products;
      if (!productsToUse || productsToUse.length === 0) {
        const productsRes = await api.get('/api/products');
        productsToUse = productsRes.data || [];
      }
      
      if (productsToUse.length === 0) {
        toast.error('No products found. Please add products first.');
        setSavingMrp(false);
        return;
      }
      
      // Fetch packagings directly if not loaded
      let packagingsToUse = retailPackagings;
      if (!packagingsToUse || packagingsToUse.length === 0) {
        const packagingsRes = await api.get('/api/qc-packaging');
        const allPackagings = packagingsRes.data || [];
        packagingsToUse = allPackagings.filter(p => p.vertical === 'retail' || p.vertical === 'both' || !p.vertical);
      }
      
      const entries = [];
      productsToUse.forEach(product => {
        const lastVariant = lastVariants[product.id];
        // Use last variant if available, otherwise use first retail packaging
        const variant = lastVariant 
          ? packagingsToUse.find(p => p.id === lastVariant.variant_id) 
          : packagingsToUse[0];
        
        // Always add the product, even if no variant found (use empty variant)
        entries.push({
          product_id: product.id,
          product_name: product.name,
          category: product.category,
          variant_id: variant?.id || '',
          variant_name: variant?.name || '',
          mrp: 0
        });
      });
      
      await api.post('/api/daily-mrp', { date: mrpDate, items: entries });
      await loadMrpData(mrpDate);
      toast.success(`MRP sheet initialized with ${entries.length} products`);
    } catch (error) {
      console.error('Initialize MRP error:', error);
      toast.error('Failed to initialize MRP data');
    } finally {
      setSavingMrp(false);
    }
  };

  // Copy MRP from previous date
  const copyMrpFromPreviousDate = async () => {
    setSavingMrp(true);
    try {
      // Get previous date
      const prevDate = new Date(mrpDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      
      // Fetch previous date's MRP data
      const prevRes = await api.get(`/api/daily-mrp?date=${prevDateStr}`);
      const prevData = prevRes.data || [];
      
      if (prevData.length === 0) {
        toast.error(`No MRP data found for ${prevDateStr}`);
        setSavingMrp(false);
        return;
      }
      
      // Create entries for current date based on previous date
      const entries = prevData.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        category: item.category,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        mrp: item.mrp
      }));
      
      await api.post('/api/daily-mrp', { date: mrpDate, items: entries });
      await loadMrpData(mrpDate);
      toast.success(`Copied ${entries.length} MRP entries from ${prevDateStr}`);
    } catch (error) {
      console.error('Failed to copy MRP data:', error);
      toast.error('Failed to copy MRP from previous date');
    } finally {
      setSavingMrp(false);
    }
  };

  // Print daily requirement
  const printDailyRequirement = () => {
    const printContent = document.getElementById('daily-requirement-print');
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Daily Purchase Requirement - ${dailyReqDate}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 5px; }
            h2 { text-align: center; color: #666; margin-top: 0; }
            p.info { text-align: center; font-size: 12px; color: #888; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #333; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .category { font-size: 11px; padding: 2px 6px; border-radius: 3px; }
            .cat-fruits { background: #fed7aa; color: #c2410c; }
            .cat-vegetables { background: #bbf7d0; color: #166534; }
            .cat-leafy { background: #a7f3d0; color: #065f46; }
            .cat-exotic { background: #e9d5ff; color: #7c3aed; }
            .footer { margin-top: 30px; text-align: right; font-size: 12px; color: #666; }
            @media print { 
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Daily Purchase Requirement</h1>
          <h2>Date: ${new Date(dailyReqDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h2>
          ${dailyReqRetailer ? `<p style="text-align:center;">Retailer: ${retailers.find(r => r.id === dailyReqRetailer)?.company_name || retailers.find(r => r.id === dailyReqRetailer)?.name || 'All'}</p>` : '<p style="text-align:center;">All Retailers</p>'}
          <p class="info">Calculated from indents. Wastage % from last 7 days average.</p>
          <table>
            <thead>
              <tr>
                <th style="width:5%">#</th>
                <th style="width:30%">Product Name</th>
                <th style="width:12%">Category</th>
                <th style="width:10%" class="text-center">Qty (Units)</th>
                <th style="width:10%" class="text-center">Qty (Kg)</th>
                <th style="width:12%" class="text-center">Wastage %</th>
                <th style="width:15%" class="text-right">Requirement (Kg)</th>
              </tr>
            </thead>
            <tbody>
              ${dailyReqData.map((item, idx) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td>${item.productName}</td>
                  <td><span class="category cat-${(item.category || 'other').toLowerCase()}">${item.category || 'Other'}</span></td>
                  <td class="text-center">${item.qtyUnits}</td>
                  <td class="text-center">${(item.qtyKg || 0).toFixed(2)}</td>
                  <td class="text-center">${(item.wastagePct || 0).toFixed(1)}%</td>
                  <td class="text-right" style="font-weight:bold;">${(item.requirementKg || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr style="font-weight:bold; background-color:#f9f9f9;">
                <td colspan="3">TOTAL</td>
                <td class="text-center">${dailyReqData.reduce((sum, item) => sum + (item.qtyUnits || 0), 0).toFixed(0)}</td>
                <td class="text-center">${dailyReqData.reduce((sum, item) => sum + (item.qtyKg || 0), 0).toFixed(2)} Kg</td>
                <td class="text-center">-</td>
                <td class="text-right">${dailyReqData.reduce((sum, item) => sum + (item.requirementKg || 0), 0).toFixed(2)} Kg</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            Generated on: ${new Date().toLocaleString('en-IN')} | Mr Organix
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Delete row from daily requirement
  const deleteRequirementRow = (idx) => {
    const newData = dailyReqData.filter((_, i) => i !== idx);
    setDailyReqData(newData);
    setDailyReqSaved(false);
    toast.success('Row deleted');
  };

  // Update Kg field (bidirectional recalculation)
  const updateKgRequired = (idx, value) => {
    const newData = [...dailyReqData];
    const kg = parseFloat(value) || 0;
    newData[idx].kgRequired = kg;
    // Recalculate total kg
    newData[idx].totalKgRequired = parseFloat((kg + (newData[idx].estWastageKg || 0)).toFixed(2));
    // Recalculate amount if rate is set
    if (newData[idx].ratePerKg) {
      newData[idx].amountPaid = (kg * parseFloat(newData[idx].ratePerKg)).toFixed(2);
    }
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Bidirectional Rate -> Amount
  const updateRatePerKg = (idx, value) => {
    const newData = [...dailyReqData];
    newData[idx].ratePerKg = value;
    if (value && newData[idx].kgRequired) {
      newData[idx].amountPaid = (parseFloat(value) * newData[idx].kgRequired).toFixed(2);
    }
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Bidirectional Amount -> Rate
  const updateAmountPaid = (idx, value) => {
    const newData = [...dailyReqData];
    newData[idx].amountPaid = value;
    if (value && newData[idx].kgRequired > 0) {
      newData[idx].ratePerKg = (parseFloat(value) / newData[idx].kgRequired).toFixed(2);
    }
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Save daily requirement
  const saveDailyRequirement = async () => {
    if (dailyReqData.length === 0) {
      toast.error('No data to save');
      return;
    }
    
    setDailyReqSaving(true);
    try {
      const payload = {
        requirement_date: dailyReqDate,
        retailer_id: dailyReqRetailer || null,
        retailer_name: dailyReqRetailer 
          ? retailers.find(r => r.id === dailyReqRetailer)?.company_name || retailers.find(r => r.id === dailyReqRetailer)?.name || 'All Retailers'
          : 'All Retailers',
        items: dailyReqData.map(item => ({
          product_id: item.productId,
          product_name: item.productName,
          category: item.category || 'Other',
          qty_units: item.qtyUnits,
          qty_kg: item.qtyKg,
          wastage_pct: item.wastagePct,
          requirement_kg: item.requirementKg
        })),
        total_qty_units: dailyReqData.reduce((sum, item) => sum + item.qtyUnits, 0),
        total_qty_kg: dailyReqData.reduce((sum, item) => sum + item.qtyKg, 0),
        total_requirement_kg: dailyReqData.reduce((sum, item) => sum + item.requirementKg, 0)
      };
      
      await api.post('/api/retailer-daily-requirement', payload);
      setDailyReqSaved(true);
      toast.success('Daily requirement saved successfully!');
    } catch (error) {
      console.error('Failed to save daily requirement:', error);
      toast.error('Failed to save daily requirement');
    } finally {
      setDailyReqSaving(false);
    }
  };

  // ==================== DISPATCH HANDLERS ====================
  
  // Helper function to calculate remaining quantities for an indent
  const getIndentRemainingQtys = (indent) => {
    // Get all dispatches for this indent
    const indentDispatches = dispatches.filter(d => d.indent_id === indent.id);
    
    // Calculate total dispatched per product+variant combination
    const totalDispatched = {};
    for (const dispatch of indentDispatches) {
      for (const item of (dispatch.items || [])) {
        // Use product_id + variant_id as key for uniqueness
        const key = `${item.product_id}|${item.variant_id || ''}`;
        totalDispatched[key] = (totalDispatched[key] || 0) + (item.supplied_qty || 0);
      }
    }
    
    // Calculate remaining for each indent item
    const remainingItems = [];
    for (const item of (indent.items || [])) {
      const key = `${item.product_id}|${item.variant_id || ''}`;
      const dispatched = totalDispatched[key] || 0;
      const remaining = (item.quantity || 0) - dispatched;
      
      if (remaining > 0) {
        remainingItems.push({
          ...item,
          dispatched_qty: dispatched,
          remaining_qty: remaining
        });
      }
    }
    
    return remainingItems;
  };
  
  const openDispatchModal = async (indent, dispatchRemaining = false) => {
    setSelectedIndent(indent);
    setEditingDispatch(null);
    
    // Get today's date for MRP lookup
    const dispatchDate = new Date().toISOString().split('T')[0];
    
    // Fetch MRP data for the dispatch date
    let mrpMap = {};
    try {
      const mrpRes = await api.get(`/api/daily-mrp/for-dispatch?date=${dispatchDate}`);
      mrpMap = mrpRes.data || {};
    } catch (error) {
      console.error('Failed to fetch MRP data:', error);
    }
    
    // Get items with remaining quantities if dispatching remaining
    let itemsToDispatch = indent.items;
    if (dispatchRemaining || indent.status === 'partial') {
      const remainingItems = getIndentRemainingQtys(indent);
      if (remainingItems.length === 0) {
        toast.info('All items have been fully dispatched');
        return;
      }
      itemsToDispatch = remainingItems.map(item => ({
        ...item,
        quantity: item.remaining_qty  // Use remaining as the indent quantity
      }));
    }
    
    setDispatchForm({
      dispatch_date: dispatchDate,
      items: itemsToDispatch.map(item => {
        // Look up variant_id from variant_name if not set
        let variantId = item.variant_id;
        if (!variantId && item.variant_name) {
          const matchingVariant = packagings.find(p => p.name === item.variant_name);
          if (matchingVariant) {
            variantId = matchingVariant.id;
          }
        }
        
        // Lookup MRP from the daily MRP table using product_id + variant_id
        const mrpKey = `${item.product_id}_${variantId || ''}`;
        const mrpValue = mrpMap[mrpKey] || 0;
        
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: variantId || '',
          variant_name: item.variant_name || '',
          indent_qty: item.quantity || item.remaining_qty,
          supplied_qty: '',  // Empty by default - user fills only what they dispatch
          mrp: mrpValue,
          total_value: 0
        };
      }),
      remarks: '',
      transport_charges: 0
    });
    setShowDispatchModal(true);
  };

  const openEditDispatchModal = (dispatch) => {
    setSelectedIndent(null);
    setEditingDispatch(dispatch);
    setDispatchForm({
      dispatch_date: dispatch.dispatch_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      items: dispatch.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        indent_qty: item.indent_qty,
        supplied_qty: item.supplied_qty,
        mrp: item.mrp,
        total_value: item.total_value
      })),
      remarks: dispatch.remarks || '',
      transport_charges: dispatch.transport_charges || 0
    });
    setShowDispatchModal(true);
  };

  const updateDispatchItem = (index, field, value) => {
    setDispatchForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      items[index].total_value = items[index].supplied_qty * items[index].mrp;
      return { ...prev, items };
    });
  };

  const handleCreateOrUpdateDispatch = async (e) => {
    e.preventDefault();
    
    // Filter items with supplied qty > 0
    const itemsWithQty = dispatchForm.items.filter(item => item.supplied_qty && parseFloat(item.supplied_qty) > 0);
    
    if (itemsWithQty.length === 0) {
      toast.error('Please enter supplied quantity for at least one item');
      return;
    }
    
    if (itemsWithQty.some(item => !item.mrp || item.mrp <= 0)) {
      toast.error('MRP is mandatory for all dispatched items');
      return;
    }

    try {
      if (editingDispatch) {
        // Update existing dispatch
        await api.put(`/api/retailer-dispatches/${editingDispatch.id}`, {
          indent_id: editingDispatch.indent_id,
          dispatch_date: new Date(dispatchForm.dispatch_date).toISOString(),
          items: itemsWithQty,  // Only send items with qty > 0
          remarks: dispatchForm.remarks,
          transport_charges: dispatchForm.transport_charges || 0
        });
        toast.success('Dispatch updated successfully');
      } else {
        // Create new dispatch
        await api.post('/api/retailer-dispatches', {
          indent_id: selectedIndent.id,
          dispatch_date: new Date(dispatchForm.dispatch_date).toISOString(),
          items: itemsWithQty,  // Only send items with qty > 0
          remarks: dispatchForm.remarks,
          transport_charges: dispatchForm.transport_charges || 0
        });
        toast.success('Dispatch created successfully');
      }
      setShowDispatchModal(false);
      setSelectedIndent(null);
      setEditingDispatch(null);
      loadIndents();
      loadDispatches();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save dispatch');
    }
  };

  const handleDeleteDispatch = async (dispatchId) => {
    if (!window.confirm('Are you sure you want to delete this dispatch?')) return;
    try {
      await api.delete(`/api/retailer-dispatches/${dispatchId}`);
      toast.success('Dispatch deleted');
      loadDispatches();
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete dispatch');
    }
  };

  // ==================== INVOICE HANDLERS ====================
  const openInvoiceModal = async () => {
    if (!invoiceForm.retailer_id) {
      toast.error('Please select a retailer first');
      return;
    }
    try {
      const response = await api.get(`/api/retailer-dispatches/uninvoiced?retailer_id=${invoiceForm.retailer_id}`);
      setUninvoicedDispatches(response.data);
      
      // Get rejections for this retailer to match with dispatch items
      const rejectionsRes = await api.get(`/api/retailer-rejections?retailer_id=${invoiceForm.retailer_id}`);
      const allRejections = rejectionsRes.data || [];
      
      // Create a map of rejections by product_id AND date for accurate matching
      // Rejections should only apply to dispatches on the same date
      const rejectionsByProductAndDate = {};
      allRejections.forEach(r => {
        // Extract just the date part (YYYY-MM-DD) from rejection_date
        const rejectionDateStr = r.rejection_date?.split('T')[0] || '';
        // Key by both product_id and date to prevent cross-date matching
        const key = `${r.product_id}_${rejectionDateStr}`;
        if (!rejectionsByProductAndDate[key]) {
          rejectionsByProductAndDate[key] = [];
        }
        rejectionsByProductAndDate[key].push({
          quantity: r.quantity,
          date: r.rejection_date,
          reason: r.reason,
          mrp: r.mrp,
          dispatch_id: r.dispatch_id
        });
      });
      
      // Flatten all items from uninvoiced dispatches for item-level selection
      const allItems = [];
      response.data.forEach(dispatch => {
        // Extract dispatch date for matching
        const dispatchDateStr = dispatch.dispatch_date?.split('T')[0] || '';
        
        (dispatch.items || []).forEach((item, idx) => {
          // Find rejections for this product ON THE SAME DATE as the dispatch
          const matchKey = `${item.product_id}_${dispatchDateStr}`;
          const productRejections = rejectionsByProductAndDate[matchKey] || [];
          const totalRejectedQty = productRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
          const netQty = Math.max(0, (item.supplied_qty || 0) - totalRejectedQty);
          const netValue = netQty * (item.mrp || 0);
          
          allItems.push({
            dispatch_id: dispatch.id,
            dispatch_date: dispatch.dispatch_date,
            item_index: idx,
            item_id: `${dispatch.id}_${idx}`,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_name: item.variant_name,
            indent_qty: item.indent_qty,
            supplied_qty: item.supplied_qty,
            rejected_qty: totalRejectedQty,
            rejections: productRejections,
            net_qty: netQty,
            mrp: item.mrp,
            total_value: item.total_value,
            net_value: netValue
          });
        });
      });
      setUninvoicedItems(allItems);
      setSelectedItemIds([]);
      setShowInvoiceModal(true);
    } catch (error) {
      toast.error('Failed to load uninvoiced dispatches');
    }
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItemIds(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectAllItems = () => {
    setSelectedItemIds(uninvoicedItems.map(i => i.item_id));
  };

  const toggleDispatchSelection = (dispatchId) => {
    setSelectedDispatchIds(prev => 
      prev.includes(dispatchId) 
        ? prev.filter(id => id !== dispatchId)
        : [...prev, dispatchId]
    );
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    if (selectedItemIds.length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    // Get selected items and group by dispatch
    const selectedItems = uninvoicedItems.filter(i => selectedItemIds.includes(i.item_id));
    
    // Get unique dispatch IDs from selected items
    const dispatchIds = [...new Set(selectedItems.map(i => i.dispatch_id))];

    try {
      const response = await api.post('/api/retailer-invoices', {
        retailer_id: invoiceForm.retailer_id,
        invoice_date: new Date(invoiceForm.invoice_date).toISOString(),
        dispatch_ids: dispatchIds,
        selected_items: selectedItems.map(i => ({
          dispatch_id: i.dispatch_id,
          item_index: i.item_index,
          product_id: i.product_id,
          product_name: i.product_name,
          variant_name: i.variant_name,
          indent_qty: i.indent_qty,
          supplied_qty: i.supplied_qty,
          rejected_qty: i.rejected_qty || 0,
          rejections: i.rejections || [],
          net_qty: i.net_qty,
          quantity: i.net_qty, // Use net qty for invoice
          mrp: i.mrp,
          total_value: i.net_value // Use net value
        })),
        remarks: invoiceForm.remarks
      });
      toast.success(`Invoice ${response.data.invoice_number} created successfully`);
      setShowInvoiceModal(false);
      setSelectedItemIds([]);
      setInvoiceForm({
        retailer_id: '',
        invoice_date: new Date().toISOString().split('T')[0],
        remarks: ''
      });
      loadInvoices();
      loadDispatches();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create invoice');
    }
  };

  // Edit Invoice
  const openEditInvoiceModal = async (invoice) => {
    setEditingInvoice(invoice);
    setEditInvoiceForm({
      invoice_date: invoice.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      items: invoice.items.map(item => ({
        ...item,
        selected: true
      })),
      remarks: invoice.remarks || ''
    });
    setShowEditInvoiceModal(true);
    
    // Load payment history if invoice has any payments
    if (invoice.paid_amount > 0) {
      setEditInvoicePaymentsLoading(true);
      try {
        const response = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
        setEditInvoicePayments(response.data);
      } catch (error) {
        console.error('Failed to load payment history:', error);
        setEditInvoicePayments([]);
      } finally {
        setEditInvoicePaymentsLoading(false);
      }
    } else {
      setEditInvoicePayments([]);
    }
  };

  const updateEditInvoiceItem = (index, field, value) => {
    setEditInvoiceForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      // Recalculate total_value if mrp or quantity changes
      if (field === 'mrp' || field === 'quantity' || field === 'supplied_qty') {
        const qty = items[index].quantity || items[index].supplied_qty || 0;
        const mrp = items[index].mrp || 0;
        items[index].total_value = qty * mrp;
      }
      return { ...prev, items };
    });
  };

  const handleUpdateInvoice = async (e) => {
    e.preventDefault();
    if (!editingInvoice) return;

    try {
      await api.put(`/api/retailer-invoices/${editingInvoice.id}`, {
        invoice_date: new Date(editInvoiceForm.invoice_date).toISOString(),
        items: editInvoiceForm.items,
        remarks: editInvoiceForm.remarks
      });
      toast.success('Invoice updated successfully');
      setShowEditInvoiceModal(false);
      setEditingInvoice(null);
      setEditInvoicePayments([]);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update invoice');
    }
  };

  // Delete payment from edit invoice modal
  const handleDeletePaymentFromEditModal = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment? This will update the invoice status.')) return;
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      // Reload payment history for edit modal
      if (editingInvoice) {
        const response = await api.get(`/api/retailer-invoices/${editingInvoice.id}/payments`);
        setEditInvoicePayments(response.data);
        // Update the editingInvoice paid_amount to reflect the change
        const newPaidAmount = response.data.reduce((sum, p) => sum + (p.amount || 0), 0);
        setEditingInvoice(prev => ({ ...prev, paid_amount: newPaidAmount }));
      }
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete payment');
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await api.delete(`/api/retailer-invoices/${invoiceId}`);
      toast.success('Invoice deleted');
      loadInvoices();
      loadDispatches();
    } catch (error) {
      toast.error('Failed to delete invoice');
    }
  };

  // Number to words function for invoice
  const numberToWords = (num) => {
    if (num === 0) return 'Zero Rupees Only';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const numToWords = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
      return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
    };
    
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    
    let result = numToWords(rupees) + ' Rupees';
    if (paise > 0) result += ' and ' + numToWords(paise) + ' Paise';
    return result + ' Only';
  };

  const downloadInvoicePdf = (invoice) => {
    // Create a printable invoice using standard format with borders
    const printWindow = window.open('', '_blank');
    const retailer = retailers.find(r => r.id === invoice.retailer_id) || {};
    const retailerDisplayName = retailer.company_name || invoice.retailer_name;
    
    // Calculate totals with rejection breakdown
    const totals = invoice.items.reduce((acc, item) => {
      const suppliedQty = item.supplied_qty || item.quantity || 0;
      const rejectedQty = item.rejected_qty || 0;
      const billableQty = suppliedQty - rejectedQty;
      const amount = billableQty * (item.mrp || 0);
      const rejectionValue = rejectedQty * (item.mrp || 0);  // Calculate per-item rejection value
      return {
        suppliedQty: acc.suppliedQty + suppliedQty,
        rejectedQty: acc.rejectedQty + rejectedQty,
        billableQty: acc.billableQty + billableQty,
        amount: acc.amount + amount,
        rejectionValue: acc.rejectionValue + rejectionValue  // Sum up all rejection values
      };
    }, { suppliedQty: 0, rejectedQty: 0, billableQty: 0, amount: 0, rejectionValue: 0 });
    
    // Use stored totals if available, or calculate from items
    const totalMrpValue = invoice.total_mrp_value || totals.amount;
    const rejectionAmount = invoice.rejection_amount || totals.rejectionValue;  // Use calculated sum
    const grossValue = invoice.gross_value || (totalMrpValue + rejectionAmount);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 850px; margin: 0 auto; background: white; font-size: 12px; }
          
          .tax-invoice-title { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 5px; }
          .company-name { text-align: center; font-size: 22px; font-weight: bold; color: #1a1a2e; margin-bottom: 15px; }
          
          .header-section { border: 1px solid #000; margin-bottom: 15px; }
          .header-row { display: flex; border-bottom: 1px solid #000; }
          .header-row:last-child { border-bottom: none; }
          .header-cell { padding: 10px; flex: 1; }
          .header-cell:first-child { border-right: 1px solid #000; }
          .header-cell .label { font-weight: bold; font-size: 10px; color: #333; margin-bottom: 5px; }
          
          .items-section { border: 1px solid #000; margin-bottom: 15px; }
          .items-table { width: 100%; border-collapse: collapse; }
          .items-table th { background: #fff; border-bottom: 1px solid #000; padding: 10px 6px; font-size: 10px; font-weight: bold; text-align: center; }
          .items-table th:not(:last-child) { border-right: 1px solid #000; }
          .items-table td { padding: 8px 6px; font-size: 11px; text-align: center; border-bottom: 1px solid #000; }
          .items-table td:not(:last-child) { border-right: 1px solid #000; }
          .items-table td.text-left { text-align: left; }
          .items-table td.text-right { text-align: right; }
          .items-table tr:last-child td { border-bottom: none; }
          .items-table .total-row { background: #f5f5f5; font-weight: bold; }
          .rejection { color: #dc2626; }
          .billable { color: #15803d; font-weight: bold; }
          
          .amount-words-section { border: 1px solid #000; padding: 10px; margin-bottom: 15px; font-size: 11px; }
          
          .footer-section { border: 1px solid #000; display: flex; }
          .footer-left { flex: 1; padding: 10px; border-right: 1px solid #000; font-size: 10px; line-height: 1.6; }
          .footer-right { width: 200px; padding: 10px; text-align: right; font-size: 10px; }
          .footer-left .terms-header { font-weight: bold; margin-bottom: 8px; }
          .footer-right .signatory-label { font-weight: bold; margin-bottom: 50px; }
          .footer-right .signatory-name { font-weight: bold; }
          
          .print-btn { margin-top: 20px; padding: 10px 20px; font-size: 14px; cursor: pointer; }
          @media print { .print-btn { display: none; } body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="tax-invoice-title">Tax Invoice</div>
        <div class="company-name">Mr Organix</div>
        
        <div class="header-section">
          <div class="header-row">
            <div class="header-cell">
              <div class="label">Bill To:</div>
              <strong>${retailerDisplayName}</strong><br/>
              ${retailer.address || ''}
            </div>
            <div class="header-cell">
              <div class="label">Invoice Details:</div>
              Invoice No: <strong>${invoice.invoice_number}</strong><br/>
              Date: ${formatDate(invoice.invoice_date)}<br/>
              Place Of Supply: 27-Maharashtra
            </div>
          </div>
        </div>
        
        <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 25px;">#</th>
                <th style="width: 200px; text-align: left;">Item name</th>
                <th style="width: 70px;">Supplied Qty</th>
                <th style="width: 70px;">Rejection</th>
                <th style="width: 70px;">Billable Qty</th>
                <th style="width: 70px;">Rate</th>
                <th style="width: 80px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map((item, idx) => {
                const suppliedQty = item.supplied_qty || item.quantity || 0;
                const rejectedQty = item.rejected_qty || 0;
                const billableQty = suppliedQty - rejectedQty;
                const rate = item.mrp || 0;
                const amount = billableQty * rate;
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="text-left">${item.product_name}${item.variant_name ? ' (' + item.variant_name + ')' : ''}</td>
                    <td>${suppliedQty}</td>
                    <td class="rejection">${rejectedQty > 0 ? '-' + rejectedQty : '-'}</td>
                    <td class="billable">${billableQty}</td>
                    <td class="text-right">₹${rate.toFixed(2)}</td>
                    <td class="text-right">₹${amount.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
              <tr class="total-row">
                <td></td>
                <td class="text-left"><strong>Total</strong></td>
                <td><strong>${totals.suppliedQty}</strong></td>
                <td class="rejection"><strong>${totals.rejectedQty > 0 ? '-' + totals.rejectedQty : '-'}</strong></td>
                <td class="billable"><strong>${totals.billableQty}</strong></td>
                <td></td>
                <td class="text-right"><strong>₹${totalMrpValue.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="items-section" style="padding: 10px;">
          <div style="display: flex; justify-content: flex-end; gap: 20px;">
            <div style="text-align: right;">
              ${grossValue !== totalMrpValue ? `<div style="margin-bottom: 5px;">Gross Value: <strong>₹${grossValue.toFixed(2)}</strong></div>` : ''}
              ${rejectionAmount > 0 ? `<div style="margin-bottom: 5px; color: #dc2626;">(-) Rejections: <strong>-₹${rejectionAmount.toFixed(2)}</strong></div>` : ''}
              <div style="margin-bottom: 5px;">Total MRP Value: <strong>₹${totalMrpValue.toFixed(2)}</strong></div>
              <div style="margin-bottom: 5px; color: #15803d;">Commission (${invoice.commission_percentage}%): <strong>-₹${invoice.commission_amount.toFixed(2)}</strong></div>
              <div style="font-size: 14px; font-weight: bold; border-top: 2px solid #14532D; padding-top: 5px;">Amount Payable by Retailer: ₹${invoice.net_payable.toFixed(2)}</div>
            </div>
          </div>
        </div>
        
        <div class="amount-words-section">
          <strong>Total Amount in words:</strong> ${numberToWords(invoice.net_payable)}
        </div>
        
        <div class="footer-section">
          <div class="footer-left">
            <div class="terms-header">Terms & Conditions:</div>
            Thanks for doing business with us!
            <br/><br/>
            MR ORGANIX M.NO. 1638,<br/>
            Taleranwadi, Kesnand Taluka - Haveli<br/>
            Pune - 412207, Maharashtra<br/>
            Phone: 9145000250
          </div>
          <div class="footer-right">
            <div class="signatory-label">For Mr Organix</div>
            <div class="signatory-name">Authorized Signatory</div>
          </div>
        </div>
        
        <button class="print-btn" onclick="window.print()">Print Invoice</button>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ==================== REJECTION HANDLERS ====================
  // Load dispatch items when date/retailer changes for rejection
  const loadRejectionDispatchItems = useCallback(async () => {
    if (!rejectionForm.retailer_id || !rejectionForm.rejection_date) {
      setRejectionDispatchItems([]);
      return;
    }
    
    try {
      // Get dispatches for this retailer on this date
      const dateStr = rejectionForm.rejection_date;
      const response = await api.get(`/api/retailer-dispatches?retailer_id=${rejectionForm.retailer_id}`);
      const dayDispatches = response.data.filter(d => {
        const dispatchDate = d.dispatch_date?.split('T')[0];
        return dispatchDate === dateStr;
      });
      
      // Debug: log editing rejection details
      if (editingRejection) {
        console.log('Editing rejection:', {
          product_id: editingRejection.product_id,
          product_name: editingRejection.product_name,
          variant_id: editingRejection.variant_id,
          variant_name: editingRejection.variant_name,
          quantity: editingRejection.quantity,
          reason: editingRejection.reason
        });
      }
      
      // Collect all unique product IDs from the dispatches
      const productIds = new Set();
      for (const dispatch of dayDispatches) {
        for (const item of (dispatch.items || [])) {
          if (item.product_id) {
            productIds.add(item.product_id);
          }
        }
      }
      
      // Fetch rejection history for ALL products in a single batch call
      // IMPORTANT: Pass rejection_date to only get rejections for THIS SPECIFIC dispatch date
      let rejectionHistoryMap = {};
      if (productIds.size > 0) {
        try {
          const historyResponse = await api.post('/api/retailer-rejections/history-batch', {
            retailer_id: rejectionForm.retailer_id,
            product_ids: Array.from(productIds),
            rejection_date: dateStr  // Filter to only show rejections for this date
          });
          rejectionHistoryMap = historyResponse.data.history || {};
        } catch (err) {
          console.log('Failed to fetch rejection history batch:', err);
        }
      }
      
      // Flatten all items from dispatches for that day
      const items = [];
      for (const dispatch of dayDispatches) {
        for (const item of (dispatch.items || [])) {
          // Check if this item matches the rejection being edited
          // Try multiple matching strategies
          let isEditingItem = false;
          if (editingRejection) {
            // Strategy 1: Match by product_id and variant_id
            const productMatch = editingRejection.product_id === item.product_id;
            const variantMatch = editingRejection.variant_id === item.variant_id || 
              (!editingRejection.variant_id && !item.variant_id) ||
              (editingRejection.variant_id === '' && !item.variant_id) ||
              (!editingRejection.variant_id && item.variant_id === '');
            
            // Strategy 2: Match by product_name and variant_name (fallback)
            const nameMatch = editingRejection.product_name === item.product_name;
            const variantNameMatch = (editingRejection.variant_name || '') === (item.variant_name || '');
            
            isEditingItem = (productMatch && variantMatch) || (nameMatch && variantNameMatch);
            
            if (isEditingItem) {
              console.log('Found matching item:', item.product_name, item.variant_name);
            }
          }
          
          // Get rejection history from the batch response (only for THIS date)
          const rejectionHistory = rejectionHistoryMap[item.product_id] || { rejections: [], total_quantity: 0, total_value: 0 };
          
          items.push({
            dispatch_id: dispatch.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            supplied_qty: item.supplied_qty,
            mrp: item.mrp,
            rejection_qty: isEditingItem ? editingRejection.quantity : 0,
            reason: isEditingItem ? (editingRejection.reason || '') : '',
            remarks: isEditingItem ? (editingRejection.remarks || '') : '',
            selected: isEditingItem ? true : false,
            // Rejection history for THIS DATE ONLY
            previous_rejections: rejectionHistory.rejections || [],
            total_previous_qty: rejectionHistory.total_quantity || 0,
            total_previous_value: rejectionHistory.total_value || 0
          });
        }
      }
      
      setRejectionDispatchItems(items);
    } catch (error) {
      console.error('Failed to load dispatch items:', error);
      setRejectionDispatchItems([]);
    }
  }, [rejectionForm.retailer_id, rejectionForm.rejection_date, editingRejection]);

  // Only auto-load dispatch items when NOT in edit mode (new rejection)
  // In edit mode, handleEditRejection already loads the items with all rejections pre-filled
  useEffect(() => {
    if (showRejectionModal && rejectionForm.retailer_id && rejectionForm.rejection_date && !editingRejection) {
      loadRejectionDispatchItems();
    }
  }, [showRejectionModal, loadRejectionDispatchItems, rejectionForm.retailer_id, rejectionForm.rejection_date, editingRejection]);

  const updateRejectionItem = (index, field, value) => {
    setRejectionDispatchItems(prev => {
      const items = [...prev];
      items[index] = { ...items[index], [field]: value };
      return items;
    });
  };

  const handleCreateRejections = async (e) => {
    e.preventDefault();
    
    // Get only selected items with valid quantities
    const selectedItems = rejectionDispatchItems.filter(item => item.selected && item.rejection_qty > 0);
    
    if (selectedItems.length === 0) {
      setRejectionErrorDialog({
        open: true,
        title: 'No Items Selected',
        message: 'Please select items and enter rejection quantities.'
      });
      return;
    }
    
    // Validate rejection qty + previous rejections doesn't exceed supplied qty
    const invalidItems = selectedItems.filter(item => {
      const maxAllowed = item.supplied_qty - (item.total_previous_qty || 0);
      return item.rejection_qty > maxAllowed;
    });
    if (invalidItems.length > 0) {
      const item = invalidItems[0];
      const maxAllowed = item.supplied_qty - (item.total_previous_qty || 0);
      setRejectionErrorDialog({
        open: true,
        title: 'Rejection Limit Exceeded',
        message: `${item.product_name}:\n\nRejection qty entered: ${item.rejection_qty}\nMaximum allowed: ${maxAllowed}\n\nSupplied: ${item.supplied_qty}\nAlready rejected: ${item.total_previous_qty || 0}`
      });
      return;
    }
    
    // Validate all selected items have a reason
    const noReasonItems = selectedItems.filter(item => !item.reason);
    if (noReasonItems.length > 0) {
      setRejectionErrorDialog({
        open: true,
        title: 'Reason Required',
        message: 'Please select a reason for all rejected items.'
      });
      return;
    }

    try {
      let createdCount = 0;
      let updatedCount = 0;
      
      // Process each selected item - update if has rejection_id, create if new
      for (const item of selectedItems) {
        const rejectionData = {
          retailer_id: rejectionForm.retailer_id,
          rejection_date: new Date(rejectionForm.rejection_date).toISOString(),
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: item.variant_id || null,
          variant_name: item.variant_name,
          quantity: item.rejection_qty,
          mrp: item.mrp,
          reason: item.reason,
          remarks: item.remarks || ''
        };
        
        if (item.rejection_id) {
          // Update existing rejection
          await api.put(`/api/retailer-rejections/${item.rejection_id}`, rejectionData);
          updatedCount++;
        } else {
          // Create new rejection
          await api.post('/api/retailer-rejections', rejectionData);
          createdCount++;
        }
      }
      
      // Check for items that were previously selected but now unselected (to delete)
      if (editingRejection) {
        const allPreviousRejections = rejectionForm.items || [];
        for (const prevItem of allPreviousRejections) {
          if (prevItem.id) {
            // Check if this rejection is no longer selected
            const stillSelected = selectedItems.find(si => si.rejection_id === prevItem.id);
            if (!stillSelected) {
              // Delete the rejection since it was unselected
              await api.delete(`/api/retailer-rejections/${prevItem.id}`);
            }
          }
        }
      }
      
      const messages = [];
      if (createdCount > 0) messages.push(`${createdCount} created`);
      if (updatedCount > 0) messages.push(`${updatedCount} updated`);
      toast.success(`Rejections: ${messages.join(', ')}`);
      
      setShowRejectionModal(false);
      resetRejectionForm();
      loadRejections();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save rejections');
    }
  };

  const handleDeleteRejection = async (rejectionId) => {
    if (!window.confirm('Are you sure you want to delete this rejection?')) return;
    try {
      await api.delete(`/api/retailer-rejections/${rejectionId}`);
      toast.success('Rejection deleted');
      loadRejections();
    } catch (error) {
      toast.error('Failed to delete rejection');
    }
  };

  const handleEditRejection = async (rejection) => {
    // Set editing state
    setEditingRejection(rejection);
    
    const retailerId = rejection.retailer_id;
    const rejectionDate = rejection.rejection_date?.split('T')[0] || rejection.rejection_date;
    
    // Fetch ALL rejections for this retailer + date
    let allRejectionsForDate = [];
    try {
      const rejectionsRes = await api.get(`/api/retailer-rejections?retailer_id=${retailerId}`);
      allRejectionsForDate = rejectionsRes.data.filter(r => {
        const rDate = r.rejection_date?.split('T')[0] || r.rejection_date;
        return rDate === rejectionDate;
      });
    } catch (error) {
      console.error('Failed to fetch rejections:', error);
    }
    
    // Set form data with all rejections as items
    setRejectionForm({
      retailer_id: retailerId,
      rejection_date: rejectionDate,
      remarks: rejection.remarks || '',
      items: allRejectionsForDate.map(r => ({
        id: r.id,
        dispatch_id: r.dispatch_id || '',
        product_id: r.product_id,
        product_name: r.product_name,
        variant_id: r.variant_id || '',
        variant_name: r.variant_name || '',
        quantity: r.quantity,
        mrp: r.mrp,
        reason: r.reason || '',
        remarks: r.remarks || ''
      }))
    });
    
    // Load dispatch items and match ALL existing rejections
    try {
      const response = await api.get(`/api/retailer-dispatches?retailer_id=${retailerId}`);
      const dayDispatches = response.data.filter(d => {
        const dispatchDate = d.dispatch_date?.split('T')[0];
        return dispatchDate === rejectionDate;
      });
      
      const items = [];
      dayDispatches.forEach(dispatch => {
        dispatch.items?.forEach(item => {
          // Find matching rejection from ALL rejections for this date
          const matchingRejection = allRejectionsForDate.find(r => {
            const productMatch = r.product_id === item.product_id;
            const nameMatch = r.product_name === item.product_name;
            const variantMatch = (r.variant_id === item.variant_id) || 
              (!r.variant_id && !item.variant_id) ||
              (r.variant_name === item.variant_name);
            
            return (productMatch || nameMatch) && variantMatch;
          });
          
          items.push({
            dispatch_id: dispatch.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            supplied_qty: item.supplied_qty,
            mrp: item.mrp,
            rejection_id: matchingRejection?.id || null, // Store rejection ID for update
            rejection_qty: matchingRejection ? matchingRejection.quantity : 0,
            reason: matchingRejection ? (matchingRejection.reason || '') : '',
            remarks: matchingRejection ? (matchingRejection.remarks || '') : '',
            selected: matchingRejection ? true : false
          });
        });
      });
      
      setRejectionDispatchItems(items);
    } catch (error) {
      console.error('Failed to load dispatch items for edit:', error);
    }
    
    setShowRejectionModal(true);
  };

  const resetRejectionForm = () => {
    setRejectionForm({
      retailer_id: '',
      rejection_date: new Date().toISOString().split('T')[0],
      items: []
    });
    setRejectionDispatchItems([]);
    setEditingRejection(null);
  };

  // ==================== PAYMENT HANDLERS ====================
  // Load payment context when date/retailer changes
  const loadPaymentContext = useCallback(async () => {
    if (!paymentForm.retailer_id || !paymentForm.payment_date) {
      setPaymentContext(null);
      return;
    }
    
    try {
      // Get all dispatches for this retailer
      const response = await api.get(`/api/retailer-dispatches?retailer_id=${paymentForm.retailer_id}`);
      const allDispatches = response.data;
      
      // Get all payments for this retailer
      const paymentsRes = await api.get(`/api/retailer-payments?retailer_id=${paymentForm.retailer_id}`);
      const allPayments = paymentsRes.data;
      
      // Get all invoices for this retailer
      const invoicesRes = await api.get(`/api/retailer-invoices?retailer_id=${paymentForm.retailer_id}`);
      const allInvoices = invoicesRes.data;
      
      // Calculate totals based on INVOICES (not dispatches)
      const totalMrpValue = allDispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);
      const totalInvoiced = allInvoices.reduce((sum, i) => sum + (i.net_payable || 0), 0);
      const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      // Pending = Invoiced - Paid (rejections are already deducted in invoice net_payable)
      const pendingAmount = totalInvoiced - totalPaid;
      
      // Get retailer info
      const retailer = retailers.find(r => r.id === paymentForm.retailer_id);
      
      setPaymentContext({
        retailer_name: retailer?.company_name || retailer?.name,
        commission_percentage: retailer?.commission_percentage || 0,
        totalMrpValue,
        totalInvoiced,
        totalNetReceivable: totalInvoiced,  // Now based on invoices
        totalPaid,
        pendingAmount
      });
    } catch (error) {
      console.error('Failed to load payment context:', error);
      setPaymentContext(null);
    }
  }, [paymentForm.retailer_id, paymentForm.payment_date, retailers]);

  useEffect(() => {
    if (showPaymentModal) {
      loadPaymentContext();
    }
  }, [showPaymentModal, loadPaymentContext, paymentForm.retailer_id]);

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.retailer_id || !paymentForm.amount) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await api.post('/api/retailer-payments', {
        ...paymentForm,
        payment_date: new Date(paymentForm.payment_date).toISOString()
      });
      toast.success('Payment recorded');
      setShowPaymentModal(false);
      resetPaymentForm();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return;
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted');
      loadPayments();
    } catch (error) {
      toast.error('Failed to delete payment');
    }
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      retailer_id: '',
      payment_date: new Date().toISOString().split('T')[0],
      amount: '',
      payment_mode: 'cash',
      reference_number: '',
      remarks: ''
    });
    setPaymentContext(null);
    setPaymentRetailerSearch('');
    setShowPaymentRetailerDropdown(false);
  };

  // Open invoice payment modal
  const openInvoicePaymentModal = async (invoice) => {
    setSelectedInvoiceForPayment(invoice);
    const remainingAmount = (invoice.net_payable || 0) - (invoice.paid_amount || 0);
    const currentUserId = getCurrentUserId();
    const currentUserName = getCurrentUserName();
    setInvoicePaymentForm({
      amount: remainingAmount > 0 ? remainingAmount.toFixed(2) : '',
      payment_mode: 'cash',
      received_by: currentUserId,
      received_by_name: currentUserName,
      reference_number: '',
      remarks: '',
      payment_date: new Date().toISOString().split('T')[0]
    });
    setShowInvoicePaymentModal(true);
    
    // Load existing payments if invoice has partial payments
    if (invoice.paid_amount > 0) {
      setLoadingExistingPayments(true);
      try {
        const response = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
        setInvoiceExistingPayments(response.data || []);
      } catch (error) {
        console.error('Failed to load existing payments:', error);
        setInvoiceExistingPayments([]);
      } finally {
        setLoadingExistingPayments(false);
      }
    } else {
      setInvoiceExistingPayments([]);
    }
  };

  // Open payment history modal (for viewing/editing paid invoices)
  const openPaymentHistoryModal = async (invoice) => {
    setSelectedInvoiceForHistory(invoice);
    setPaymentHistoryLoading(true);
    setShowPaymentHistoryModal(true);
    try {
      const response = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
      setInvoicePaymentHistory(response.data);
    } catch (error) {
      console.error('Failed to load payment history:', error);
      toast.error('Failed to load payment history');
      setInvoicePaymentHistory([]);
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  // Delete a payment from history
  const handleDeletePaymentFromHistory = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment? This will update the invoice status.')) return;
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      // Reload payment history
      if (selectedInvoiceForHistory) {
        const response = await api.get(`/api/retailer-invoices/${selectedInvoiceForHistory.id}/payments`);
        setInvoicePaymentHistory(response.data);
      }
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete payment');
    }
  };

  // Open edit payment modal
  const openEditPaymentModal = (payment) => {
    setEditingPayment(payment);
    setEditPaymentForm({
      amount: payment.amount?.toString() || '',
      payment_mode: payment.payment_mode || 'cash',
      reference_number: payment.reference_number || '',
      remarks: payment.remarks || '',
      payment_date: payment.payment_date?.split('T')[0] || new Date().toISOString().split('T')[0]
    });
    setShowEditPaymentModal(true);
  };

  // Handle edit payment submission
  const handleEditPayment = async (e) => {
    e.preventDefault();
    if (!editingPayment || !editPaymentForm.amount) {
      toast.error('Please enter payment amount');
      return;
    }
    
    // Validate reference number for non-cash payments
    if (editPaymentForm.payment_mode !== 'cash' && !editPaymentForm.reference_number.trim()) {
      toast.error('Reference number is required for non-cash payments');
      return;
    }
    
    try {
      await api.put(`/api/retailer-payments/${editingPayment.id}`, {
        amount: parseFloat(editPaymentForm.amount),
        payment_mode: editPaymentForm.payment_mode,
        reference_number: editPaymentForm.reference_number,
        remarks: editPaymentForm.remarks,
        payment_date: editPaymentForm.payment_date
      });
      toast.success('Payment updated successfully');
      setShowEditPaymentModal(false);
      setEditingPayment(null);
      
      // Reload payment history
      if (selectedInvoiceForHistory) {
        const response = await api.get(`/api/retailer-invoices/${selectedInvoiceForHistory.id}/payments`);
        setInvoicePaymentHistory(response.data);
      }
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update payment');
    }
  };

  // Handle invoice payment submission
  const handleInvoicePayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment || !invoicePaymentForm.amount) {
      toast.error('Please enter payment amount');
      return;
    }
    
    // Validate reference number for non-cash payments
    if (invoicePaymentForm.payment_mode !== 'cash' && !invoicePaymentForm.reference_number.trim()) {
      toast.error('Reference number is required for non-cash payments');
      return;
    }
    
    try {
      await api.post(`/api/retailer-invoices/${selectedInvoiceForPayment.id}/payment`, {
        amount: parseFloat(invoicePaymentForm.amount),
        payment_mode: invoicePaymentForm.payment_mode,
        received_by: invoicePaymentForm.received_by,
        received_by_name: invoicePaymentForm.received_by_name,
        reference_number: invoicePaymentForm.reference_number,
        remarks: invoicePaymentForm.remarks,
        payment_date: invoicePaymentForm.payment_date
      });
      toast.success('Payment recorded successfully');
      setShowInvoicePaymentModal(false);
      setSelectedInvoiceForPayment(null);
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  // Get filtered invoices based on status filter
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    
    // Filter by selected retailer
    if (selectedRetailer) {
      filtered = filtered.filter(inv => inv.retailer_id === selectedRetailer);
    }
    
    // Filter by payment status
    if (invoiceStatusFilter !== 'all') {
      filtered = filtered.filter(inv => (inv.status || 'pending') === invoiceStatusFilter);
    }
    
    return filtered;
  }, [invoices, selectedRetailer, invoiceStatusFilter]);

  // Helper function to get retailer display name (company_name or name)
  const getRetailerDisplayName = (retailer) => {
    return retailer?.company_name || retailer?.name || '-';
  };

  // Get retailer display name by ID
  const getRetailerNameById = (retailerId) => {
    const retailer = retailers.find(r => r.id === retailerId);
    return getRetailerDisplayName(retailer);
  };

  // Filter products based on search (both English and Hindi names)
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.name_hi?.includes(productSearch)
  );

  // Filter variants based on search and vertical (retail for retailer indents)
  const filteredVariants = packagings.filter(p => 
    p.name?.toLowerCase().includes(variantSearch.toLowerCase()) &&
    (!p.verticals || p.verticals.length === 0 || p.verticals.includes('retail'))
  );

  // Filtered retailers for search-based selection
  const filteredRetailers = retailers.filter(r => 
    (r.company_name || r.name || '').toLowerCase().includes(retailerSearch.toLowerCase())
  );
  
  const filteredPaymentRetailers = retailers.filter(r => 
    (r.company_name || r.name || '').toLowerCase().includes(paymentRetailerSearch.toLowerCase())
  );

  const toggleIndentExpand = (id) => {
    setExpandedIndents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleInvoiceExpand = (id) => {
    setExpandedInvoices(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tabs = [
    { id: 'dailyRequirement', label: 'Daily Requirement', icon: ShoppingCart, count: null },
    { id: 'indents', label: 'Indents', icon: Package, count: indents.length },
    { id: 'dispatches', label: 'Dispatches', icon: Truck, count: dispatches.length },
    { id: 'invoices', label: 'Invoices', icon: FileText, count: invoices.length },
    { id: 'rejections', label: 'Rejections', icon: AlertTriangle, count: rejections.length },
    { id: 'closingInventory', label: 'Closing Inventory', icon: ClipboardList, count: null }
  ];

  // Calculate totals for selected dispatches (for invoice modal)
  const selectedDispatchTotal = uninvoicedDispatches
    .filter(d => selectedDispatchIds.includes(d.id))
    .reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);

  return (
    <Layout title="Retailer Orders">
      <div data-testid="retailer-orders-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Retailer Orders</h1>
            <p className="text-sm text-gray-500">Manage retailer indents, dispatches, invoices and payments</p>
          </div>
          
          {/* Retailer Filter */}
          <div className="flex gap-2 items-center">
            <select
              value={selectedRetailer}
              onChange={(e) => setSelectedRetailer(e.target.value)}
              className="h-9 px-3 rounded-md border border-gray-200 text-sm"
            >
              <option value="">All Retailers</option>
              {retailers.map(r => (
                <option key={r.id} value={r.id}>{r.company_name || r.name} ({r.commission_percentage || 0}%)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dashboard Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Package size={14} />
              <span>Indents</span>
            </div>
            <p className="text-lg font-bold">{dashboardStats.totalIndents}</p>
            <p className="text-xs text-amber-600">{dashboardStats.pendingIndents} pending</p>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Truck size={14} />
              <span>Dispatches</span>
            </div>
            <p className="text-lg font-bold">{dashboardStats.totalDispatches}</p>
            <p className="text-xs text-gray-500">Total: {formatCurrency(dashboardStats.totalMrpValue)}</p>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <IndianRupee size={14} />
              <span>Net Receivable</span>
            </div>
            <p className="text-lg font-bold text-green-700">{formatCurrency(dashboardStats.totalNetReceivable)}</p>
            <p className="text-xs text-gray-500">Invoiced: {formatCurrency(dashboardStats.totalInvoiced)}</p>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <CreditCard size={14} />
              <span>Payments</span>
            </div>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(dashboardStats.totalPayments)}</p>
            <p className={`text-xs ${dashboardStats.pendingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              Pending: {formatCurrency(dashboardStats.pendingAmount)}
            </p>
          </div>
        </div>
        
        {/* Rejection Loss Block */}
        <div className="bg-red-50 rounded-lg border border-red-200 p-3 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <span className="text-sm font-medium text-red-800">Rejection Loss</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={rejectionLossDateFrom}
                onChange={(e) => setRejectionLossDateFrom(e.target.value)}
                className="h-7 w-32 text-xs"
              />
              <span className="text-xs text-gray-500">to</span>
              <Input
                type="date"
                value={rejectionLossDateTo}
                onChange={(e) => setRejectionLossDateTo(e.target.value)}
                className="h-7 w-32 text-xs"
              />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(
                rejections
                  .filter(r => {
                    const rejDate = r.rejection_date?.split('T')[0];
                    return rejDate >= rejectionLossDateFrom && rejDate <= rejectionLossDateTo;
                  })
                  .reduce((sum, r) => sum + (r.rejection_value || 0), 0)
              )}
            </p>
            <p className="text-xs text-red-500">
              {rejections
                .filter(r => {
                  const rejDate = r.rejection_date?.split('T')[0];
                  return rejDate >= rejectionLossDateFrom && rejDate <= rejectionLossDateTo;
                })
                .length} rejection(s) in period
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 border-b pb-2">
          <div className="inline-flex gap-2 min-w-max">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap text-xs md:text-sm ${activeTab === tab.id ? 'bg-[#14532D]' : ''}`}
                >
                  <Icon size={14} className="mr-1" />
                  {tab.label}
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{tab.count}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* ==================== DAILY REQUIREMENT TAB ==================== */}
        {activeTab === 'dailyRequirement' && (
          <Card>
            <CardHeader className="py-3 border-b">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShoppingCart size={16} className="text-green-600" />
                    Daily Purchase Requirement
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Calculates from indents for the selected date, with wastage % from closing inventory</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={dailyReqRetailer}
                    onChange={(e) => setDailyReqRetailer(e.target.value)}
                    className="h-9 px-3 rounded-md border border-gray-200 text-sm"
                  >
                    <option value="">All Retailers</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                  <Input
                    type="date"
                    value={dailyReqDate}
                    onChange={(e) => setDailyReqDate(e.target.value)}
                    className="h-9 w-40"
                  />
                  <Button 
                    onClick={calculateDailyRequirement}
                    disabled={dailyReqLoading}
                    className="bg-[#14532D] h-9"
                  >
                    {dailyReqLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Loading...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RefreshCw size={14} />
                        Refresh
                      </span>
                    )}
                  </Button>
                  {dailyReqData.length > 0 && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={saveDailyRequirement} 
                        disabled={dailyReqSaving}
                        className={`h-9 ${dailyReqSaved ? 'border-green-500 text-green-600' : ''}`}
                      >
                        {dailyReqSaving ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            Saving...
                          </span>
                        ) : dailyReqSaved ? (
                          <span className="flex items-center gap-2">
                            <Check size={14} />
                            Saved
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <FileSpreadsheet size={14} />
                            Save
                          </span>
                        )}
                      </Button>
                      <Button variant="outline" onClick={printDailyRequirement} className="h-9">
                        <Download size={14} className="mr-1" />
                        Print
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4" id="daily-requirement-print">
              {/* Sub-tabs: Purchase and Stickers */}
              <div className="flex gap-2 mb-4 border-b pb-2">
                <Button
                  variant={dailyReqSubTab === 'purchase' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setDailyReqSubTab('purchase')}
                  className={dailyReqSubTab === 'purchase' ? 'bg-[#14532D]' : ''}
                >
                  <ShoppingCart size={14} className="mr-1" />
                  Purchase
                </Button>
                <Button
                  variant={dailyReqSubTab === 'stickers' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setDailyReqSubTab('stickers');
                    // Always recalculate when switching to stickers tab
                    calculateStickersData();
                  }}
                  className={dailyReqSubTab === 'stickers' ? 'bg-[#14532D]' : ''}
                >
                  <Tag size={14} className="mr-1" />
                  Stickers
                </Button>
                <Button
                  variant={dailyReqSubTab === 'mrp' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setDailyReqSubTab('mrp')}
                  className={dailyReqSubTab === 'mrp' ? 'bg-[#14532D]' : ''}
                >
                  <IndianRupee size={14} className="mr-1" />
                  MRP
                </Button>
              </div>

              {/* Purchase Sub-tab */}
              {dailyReqSubTab === 'purchase' && (
                <>
                  {dailyReqError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-center">
                      <AlertTriangle size={24} className="mx-auto mb-2" />
                      <p>{dailyReqError}</p>
                    </div>
                  )}
                  
                  {!dailyReqError && dailyReqData.length === 0 && !dailyReqLoading && (
                    <div className="text-center py-12 text-gray-500">
                      <ShoppingCart size={48} className="mx-auto mb-4 opacity-30" />
                      <p>Select a date and click "Calculate" to view purchase requirements from indents</p>
                      <p className="text-xs mt-2">Combines all retailer indents for the date and calculates wastage % from last 7 days</p>
                    </div>
                  )}
                  
                  {dailyReqData.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">Calculated from indents for {dailyReqDate}. Wastage % is from last 7 days' closing inventory data.</p>
                      
                      {/* Category-wise collapsible sections */}
                      {groupedPurchaseData.sortedCategories.map((category) => {
                        const items = groupedPurchaseData.groups[category];
                        const isExpanded = expandedPurchaseCategories[category];
                        const categoryTotalUnits = items.reduce((sum, item) => sum + item.qtyUnits, 0);
                        const categoryTotalKg = items.reduce((sum, item) => sum + item.qtyKg, 0);
                        const categoryTotalRequirement = items.reduce((sum, item) => sum + item.requirementKg, 0);
                        
                        return (
                          <div key={category} className={`border rounded-lg overflow-hidden ${getCategoryColorClasses(category).split(' ')[2]}`}>
                            {/* Category Header - Clickable */}
                            <div 
                              className={`flex items-center justify-between p-3 cursor-pointer ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')} hover:opacity-90`}
                              onClick={() => togglePurchaseCategory(category)}
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                <span className="font-semibold text-sm">{category}</span>
                                <span className="text-xs opacity-75">({items.length} items)</span>
                              </div>
                              <div className="flex items-center gap-6 text-xs">
                                <span>Units: <strong>{categoryTotalUnits}</strong></span>
                                <span>Qty: <strong>{categoryTotalKg.toFixed(2)} Kg</strong></span>
                                <span>Requirement: <strong className="text-blue-700">{categoryTotalRequirement.toFixed(2)} Kg</strong></span>
                              </div>
                            </div>
                            
                            {/* Category Items - Collapsible */}
                            {isExpanded && (
                              <div className="bg-white">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-gray-50 text-xs">
                                      <th className="p-2 text-left w-10">#</th>
                                      <th className="p-2 text-left">Product Name</th>
                                      <th className="p-2 text-center w-20">Qty (Units)</th>
                                      <th className="p-2 text-center w-20">Qty (Kg)</th>
                                      <th className="p-2 text-center w-24">Wastage %</th>
                                      <th className="p-2 text-center w-28">Requirement (Kg)</th>
                                      <th className="p-2 text-center w-10">X</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item, localIdx) => {
                                      // Find global index for editing
                                      const globalIdx = dailyReqData.findIndex(d => d.productId === item.productId && d.productName === item.productName);
                                      return (
                                        <tr key={`${item.productId}-${localIdx}`} className="border-b hover:bg-gray-50">
                                          <td className="p-2 text-gray-400 text-xs">{localIdx + 1}</td>
                                          <td className="p-2 font-medium">{item.productName}</td>
                                          <td className="p-2 text-center font-semibold">{item.qtyUnits}</td>
                                          <td className="p-2 text-center text-gray-600">{item.qtyKg.toFixed(2)}</td>
                                          <td className="p-2">
                                            <Input
                                              type="number"
                                              step="0.1"
                                              min="0"
                                              max="100"
                                              placeholder="%"
                                              value={item.wastagePct}
                                              onChange={(e) => {
                                                const newData = [...dailyReqData];
                                                const newWastagePct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                                newData[globalIdx].wastagePct = newWastagePct;
                                                if (newWastagePct >= 100) {
                                                  newData[globalIdx].requirementKg = item.qtyKg * 2;
                                                } else if (newWastagePct > 0) {
                                                  newData[globalIdx].requirementKg = parseFloat((item.qtyKg / (1 - newWastagePct / 100)).toFixed(2));
                                                } else {
                                                  newData[globalIdx].requirementKg = item.qtyKg;
                                                }
                                                setDailyReqData(newData);
                                                setDailyReqSaved(false);
                                              }}
                                              className="h-7 w-16 text-center text-xs text-amber-600"
                                            />
                                          </td>
                                          <td className="p-2 text-center font-bold text-blue-700">
                                            {item.requirementKg.toFixed(2)}
                                          </td>
                                          <td className="p-2 text-center">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const newData = dailyReqData.filter((_, i) => i !== globalIdx);
                                                setDailyReqData(newData);
                                                setDailyReqSaved(false);
                                              }}
                                              className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                                            >
                                              <X size={12} />
                                            </Button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className={`border-t font-semibold text-xs ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')}`}>
                                      <td className="p-2" colSpan="2">Category Total</td>
                                      <td className="p-2 text-center">{categoryTotalUnits}</td>
                                      <td className="p-2 text-center">{categoryTotalKg.toFixed(2)}</td>
                                      <td className="p-2 text-center">-</td>
                                      <td className="p-2 text-center text-blue-700">{categoryTotalRequirement.toFixed(2)}</td>
                                      <td className="p-2"></td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Grand Total */}
                      <div className="border-t-2 bg-gray-100 rounded-lg p-3 flex justify-between items-center font-semibold">
                        <span>Grand Total ({dailyReqData.length} items)</span>
                        <div className="flex items-center gap-6 text-sm">
                          <span>Units: {dailyReqData.reduce((sum, item) => sum + item.qtyUnits, 0)}</span>
                          <span>Qty: {dailyReqData.reduce((sum, item) => sum + item.qtyKg, 0).toFixed(2)} Kg</span>
                          <span className="text-blue-700">Requirement: {dailyReqData.reduce((sum, item) => sum + item.requirementKg, 0).toFixed(2)} Kg</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Stickers Sub-tab */}
              {dailyReqSubTab === 'stickers' && (
                <div>
                  {/* Filters row */}
                  <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <div className="flex-1">
                      <Input
                        type="text"
                        placeholder="Search product or variant..."
                        value={stickersSearch}
                        onChange={(e) => setStickersSearch(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <select
                      value={stickersCategoryFilter}
                      onChange={(e) => setStickersCategoryFilter(e.target.value)}
                      className="h-9 px-3 rounded-md border border-gray-200 text-sm min-w-[150px]"
                    >
                      <option value="all">All Categories</option>
                      {stickersCategories.filter(c => c !== 'all').map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <Button 
                      onClick={calculateStickersData}
                      disabled={stickersLoading}
                      variant="outline"
                      className="h-9"
                    >
                      {stickersLoading ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          Loading...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <RefreshCw size={14} />
                          Refresh
                        </span>
                      )}
                    </Button>
                  </div>

                  {/* Stickers table */}
                  {stickersLoading ? (
                    <div className="text-center py-12">
                      <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-500">Loading stickers data...</p>
                    </div>
                  ) : filteredStickersData.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Tag size={48} className="mx-auto mb-4 opacity-30" />
                      <p>No sticker data found for {dailyReqDate}</p>
                      <p className="text-xs mt-2">Make sure indents are created for this date</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">
                        Showing {filteredStickersData.length} of {stickersData.length} product-variant combinations for {dailyReqDate}
                      </p>
                      
                      {/* Category-wise collapsible sections */}
                      {groupedStickersData.sortedCategories.map((category) => {
                        const items = groupedStickersData.groups[category];
                        const isExpanded = expandedStickersCategories[category];
                        const categoryTotalQty = items.reduce((sum, item) => sum + item.quantity, 0);
                        
                        return (
                          <div key={category} className={`border rounded-lg overflow-hidden ${getCategoryColorClasses(category).split(' ')[2]}`}>
                            {/* Category Header - Clickable */}
                            <div 
                              className={`flex items-center justify-between p-3 cursor-pointer ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')} hover:opacity-90`}
                              onClick={() => toggleStickersCategory(category)}
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                <span className="font-semibold text-sm">{category}</span>
                                <span className="text-xs opacity-75">({items.length} items)</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span>Total Qty: <strong className="text-blue-700">{categoryTotalQty}</strong></span>
                              </div>
                            </div>
                            
                            {/* Category Items - Collapsible */}
                            {isExpanded && (
                              <div className="bg-white">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-gray-50 text-xs">
                                      <th className="p-2 text-left w-10">#</th>
                                      <th className="p-2 text-left">Product</th>
                                      <th className="p-2 text-left">Variant</th>
                                      <th className="p-2 text-center w-24">Quantity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item, localIdx) => (
                                      <tr key={`${item.productId}-${item.variantId}-${localIdx}`} className="border-b hover:bg-gray-50">
                                        <td className="p-2 text-gray-400 text-xs">{localIdx + 1}</td>
                                        <td className="p-2 font-medium">{item.productName}</td>
                                        <td className="p-2 text-gray-600">{item.variantName}</td>
                                        <td className="p-2 text-center font-bold text-blue-700">{item.quantity}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className={`border-t font-semibold text-xs ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')}`}>
                                      <td className="p-2" colSpan="3">Category Total</td>
                                      <td className="p-2 text-center text-blue-700">{categoryTotalQty}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Grand Total */}
                      <div className="border-t-2 bg-gray-100 rounded-lg p-3 flex justify-between items-center font-semibold">
                        <span>Grand Total ({filteredStickersData.length} items)</span>
                        <span className="text-blue-700">Quantity: {filteredStickersData.reduce((sum, item) => sum + item.quantity, 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MRP Sub-tab */}
              {dailyReqSubTab === 'mrp' && (
                <div>
                  {/* Header with Date Selector, Copy, and Save Actions */}
                  <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700">Date:</label>
                      <Input
                        type="date"
                        value={mrpDate}
                        onChange={(e) => setMrpDate(e.target.value)}
                        className="h-9 w-40"
                      />
                      {!canEditMrpForDate(mrpDate) && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                          Read-only (Only Admin can edit past dates)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 ml-auto flex-wrap">
                      <Button 
                        onClick={copyMrpFromPreviousDate}
                        disabled={savingMrp || mrpLoading || !canEditMrpForDate(mrpDate)}
                        variant="outline"
                        className="h-9 border-blue-300 text-blue-600 hover:bg-blue-50"
                      >
                        <ClipboardList size={14} className="mr-1" />
                        Copy from Previous Date
                      </Button>
                      <Button 
                        onClick={() => loadMrpData(mrpDate)}
                        disabled={mrpLoading}
                        variant="outline"
                        className="h-9"
                      >
                        {mrpLoading ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            Loading...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <RefreshCw size={14} />
                            Refresh
                          </span>
                        )}
                      </Button>
                      <Button 
                        onClick={() => triggerBlinkitScrape('411045')}
                        disabled={scrapingBlinkit || blinkitLoading}
                        variant="outline"
                        className="h-9 border-orange-300 text-orange-600 hover:bg-orange-50"
                        title="Fetch latest prices from Blinkit (Pincode: 411045)"
                      >
                        {scrapingBlinkit ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                            Scraping...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Download size={14} />
                            Fetch Blinkit Prices
                          </span>
                        )}
                      </Button>
                      {mrpData.length === 0 && (
                        <Button 
                          onClick={initializeMrpData}
                          disabled={savingMrp || mrpLoading || !canEditMrpForDate(mrpDate)}
                          className="h-9 bg-[#14532D]"
                        >
                          {savingMrp ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Initializing...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Plus size={14} />
                              Initialize All Products
                            </span>
                          )}
                        </Button>
                      )}
                      {mrpData.length > 0 && (
                        <Button 
                          onClick={saveMrpChanges}
                          disabled={savingMrp || mrpLoading || !mrpHasUnsavedChanges || !canEditMrpForDate(mrpDate)}
                          className={`h-9 ${mrpHasUnsavedChanges ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}
                        >
                          {savingMrp ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Saving...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Save size={14} />
                              Save MRP {mrpHasUnsavedChanges && `(${Object.keys(pendingMrpChanges).length})`}
                            </span>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Loading State */}
                  {mrpLoading ? (
                    <div className="text-center py-12">
                      <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-500">Loading MRP data...</p>
                    </div>
                  ) : mrpData.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <IndianRupee size={48} className="mx-auto mb-4 opacity-30" />
                      <p>No MRP data for {mrpDate}</p>
                      <p className="text-xs mt-2">Click "Initialize All Products" to create entries with last sold variants, or "Copy from Previous Date"</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">
                        MRP entries for {mrpDate} • {mrpData.length} saved items out of {products.length} products
                        {mrpHasUnsavedChanges && <span className="text-orange-600 ml-2">• Unsaved changes</span>}
                      </p>
                      
                      {/* Category-wise sections - ALL EXPANDED BY DEFAULT, SHOWING ALL PRODUCTS */}
                      {Object.keys(mrpProductsByCategory).sort().map((category) => {
                        const categoryProducts = mrpProductsByCategory[category] || [];
                        if (categoryProducts.length === 0) return null;
                        
                        const isExpanded = expandedMrpCategories[category] !== false; // Default to expanded
                        const categoryEntries = mrpData.filter(e => e.category === category);
                        const zeroMrpCount = categoryEntries.filter(e => !e.mrp || e.mrp === 0).length;
                        const isEditable = canEditMrpForDate(mrpDate);
                        
                        return (
                          <div key={category} className={`border rounded-lg overflow-hidden ${getCategoryColorClasses(category).split(' ')[2]}`}>
                            {/* Category Header - Clickable */}
                            <div 
                              className={`flex items-center justify-between p-3 cursor-pointer ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')} hover:opacity-90`}
                              onClick={() => toggleMrpCategory(category)}
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                <span className="font-semibold text-sm">{category}</span>
                                <span className="text-xs opacity-75">({categoryProducts.length} products, {categoryEntries.length} with MRP)</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                {zeroMrpCount > 0 ? (
                                  <span className="text-red-600 font-medium">{zeroMrpCount} items with ₹0 MRP</span>
                                ) : categoryEntries.length > 0 ? (
                                  <span className="text-green-600">All priced ✓</span>
                                ) : null}
                              </div>
                            </div>
                            
                            {/* Category Items - Always visible by default, showing ALL products */}
                            {isExpanded && (
                              <div className="bg-white">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-gray-50 text-xs">
                                      <th className="p-2 text-left w-10">#</th>
                                      <th className="p-2 text-left">Product</th>
                                      <th className="p-2 text-left w-44">Variant</th>
                                      <th className="p-2 text-right w-24">MRP (₹)</th>
                                      <th className="p-2 text-right w-24">
                                        <span className="text-orange-600">Blinkit (₹)</span>
                                      </th>
                                      <th className="p-2 text-center w-16">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Show ALL products in this category */}
                                    {categoryProducts.map((product, localIdx) => {
                                      // Get all existing entries for this product
                                      const productEntries = mrpData.filter(e => e.product_id === product.id);
                                      const lastVariant = lastVariants[product.id];
                                      const defaultVariant = lastVariant 
                                        ? retailPackagings.find(p => p.id === lastVariant.variant_id)
                                        : retailPackagings[0];
                                      const blinkitData = blinkitPrices[product.id];
                                      
                                      // If product has entries, show them
                                      if (productEntries.length > 0) {
                                        return productEntries.map((entry, entryIdx) => (
                                          <tr key={entry.id} className={`border-b hover:bg-gray-50 ${pendingMrpChanges[entry.id] ? 'bg-yellow-50' : ''}`}>
                                            <td className="p-2 text-gray-400 text-xs">{localIdx + 1}{entryIdx > 0 ? `.${entryIdx + 1}` : ''}</td>
                                            <td className="p-2 font-medium">{entry.product_name}</td>
                                            <td className="p-2">
                                              <select
                                                value={entry.variant_id || ''}
                                                onChange={(e) => updateMrpEntryLocal(entry.id, 'variant_id', e.target.value)}
                                                disabled={!isEditable}
                                                className={`w-full h-8 px-2 rounded border border-gray-200 text-sm ${!isEditable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                              >
                                                <option value="">Select variant</option>
                                                {retailPackagings.map(pkg => (
                                                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                                                ))}
                                              </select>
                                            </td>
                                            <td className="p-2 text-right">
                                              <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={entry.mrp || ''}
                                                onChange={(e) => updateMrpEntryLocal(entry.id, 'mrp', e.target.value)}
                                                disabled={!isEditable}
                                                className={`h-8 w-20 text-right ml-auto ${!isEditable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                                placeholder="0.00"
                                              />
                                            </td>
                                            <td className="p-2 text-right">
                                              <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={blinkitData?.blinkit_price || ''}
                                                onChange={(e) => updateBlinkitPrice(entry.product_id, e.target.value)}
                                                disabled={!isEditable}
                                                className={`h-8 w-20 text-right ml-auto text-orange-600 ${!isEditable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                                placeholder="0.00"
                                              />
                                            </td>
                                            <td className="p-2 text-center flex gap-1 justify-center">
                                              {isEditable && (
                                                <>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => addMrpEntry(product)}
                                                    title="Add another variant for this product"
                                                    className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                                  >
                                                    <Plus size={14} />
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => deleteMrpEntry(entry.id)}
                                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                  >
                                                    <Trash2 size={14} />
                                                  </Button>
                                                </>
                                              )}
                                            </td>
                                          </tr>
                                        ));
                                      }
                                      
                                      // No entries exist - show product with default variant and option to add
                                      return (
                                        <tr key={product.id} className="border-b hover:bg-gray-50 bg-gray-50/50">
                                          <td className="p-2 text-gray-400 text-xs">{localIdx + 1}</td>
                                          <td className="p-2 font-medium text-gray-600">{product.name}</td>
                                          <td className="p-2 text-gray-400 text-sm">
                                            {defaultVariant?.name || 'No variant'}
                                          </td>
                                          <td className="p-2 text-right text-gray-400">-</td>
                                          <td className="p-2 text-right">
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              value={blinkitData?.blinkit_price || ''}
                                              onChange={(e) => updateBlinkitPrice(product.id, e.target.value)}
                                              disabled={!isEditable}
                                              className={`h-8 w-20 text-right ml-auto text-orange-600 ${!isEditable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                              placeholder="0.00"
                                            />
                                          </td>
                                          <td className="p-2 text-center">
                                            {isEditable && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => addMrpEntry(product)}
                                                className="h-7 px-2 text-xs text-green-600 border-green-300 hover:bg-green-50"
                                              >
                                                <Plus size={12} className="mr-1" /> Add MRP
                                              </Button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                
                                {/* Add same product with different variant section */}
                                {isEditable && (
                                  <div className="p-2 border-t bg-gray-50">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs text-gray-500">Add product with specific variant:</span>
                                      <select
                                        id={`add-product-${category}`}
                                        className="flex-1 min-w-[180px] h-8 px-2 rounded border border-gray-200 text-sm"
                                        defaultValue=""
                                      >
                                        <option value="">Select product...</option>
                                        {categoryProducts.map(product => (
                                          <option key={product.id} value={product.id}>{product.name}</option>
                                        ))}
                                      </select>
                                      <select
                                        id={`add-variant-${category}`}
                                        className="w-44 h-8 px-2 rounded border border-gray-200 text-sm"
                                        defaultValue=""
                                      >
                                        <option value="">Select variant...</option>
                                        {retailPackagings.map(pkg => (
                                          <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                                        ))}
                                      </select>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3"
                                        onClick={() => {
                                          const productSelect = document.getElementById(`add-product-${category}`);
                                          const variantSelect = document.getElementById(`add-variant-${category}`);
                                          const productId = productSelect.value;
                                          const variantId = variantSelect.value;
                                          
                                          if (!productId) {
                                            toast.error('Please select a product');
                                            return;
                                          }
                                          if (!variantId) {
                                            toast.error('Please select a variant');
                                            return;
                                          }
                                          
                                          // Check if this product+variant combo already exists
                                          const existingEntry = mrpData.find(e => e.product_id === productId && e.variant_id === variantId);
                                          if (existingEntry) {
                                            toast.error('This product-variant combination already exists');
                                            return;
                                          }
                                          
                                          const product = categoryProducts.find(p => p.id === productId);
                                          if (product) {
                                            addMrpEntry(product, variantId);
                                            productSelect.value = '';
                                            variantSelect.value = '';
                                          }
                                        }}
                                      >
                                        <Plus size={14} className="mr-1" /> Add
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Summary Footer */}
                      <div className="border-t-2 bg-gray-100 rounded-lg p-3 flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="font-semibold">{mrpData.length} items with MRP</span>
                          <span className="text-gray-500">|</span>
                          <span className="text-gray-600">{products.length - mrpData.length} products without MRP</span>
                          <span className="text-gray-500">|</span>
                          <span className="text-red-600 font-medium">
                            {mrpData.filter(e => !e.mrp || e.mrp === 0).length} items with ₹0 MRP
                          </span>
                        </div>
                        {canEditMrpForDate(mrpDate) && mrpHasUnsavedChanges && (
                          <Button 
                            onClick={saveMrpChanges}
                            disabled={savingMrp}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Save size={14} className="mr-1" />
                            Save All Changes ({Object.keys(pendingMrpChanges).length})
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ==================== INDENTS TAB ==================== */}
        {activeTab === 'indents' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm">Retailer Indents</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={indentDateFilter}
                    onChange={(e) => setIndentDateFilter(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                  {indentDateFilter && (
                    <Button size="sm" variant="ghost" onClick={() => setIndentDateFilter('')} className="h-8 px-2">
                      <X size={12} /> Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportIndents} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAutoIndentModal(true)} className="border-purple-300 text-purple-600 hover:bg-purple-50">
                  <Zap size={14} className="mr-1" /> Auto Indent
                </Button>
                <Button size="sm" className="bg-[#14532D]" onClick={() => setShowIndentModal(true)}>
                  <Plus size={14} className="mr-1" /> New Indent
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center w-10 font-medium text-gray-500">#</th>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndents.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">{indentDateFilter ? `No indents for ${indentDateFilter}` : 'No indents found'}</td></tr>
                    ) : filteredIndents.map((indent, indentIdx) => (
                      <React.Fragment key={indent.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleIndentExpand(indent.id)}>
                          <td className="p-3 text-center text-gray-500">{indentIdx + 1}</td>
                          <td className="p-3 text-center">
                            {expandedIndents[indent.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3">{formatDate(indent.indent_date)}</td>
                          <td className="p-3 font-medium">
                            {getRetailerNameById(indent.retailer_id) || indent.retailer_name}
                            {indent.created_by_retailer && (
                              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                                Generated by Retailer
                              </span>
                            )}
                            {indent.is_auto_generated && (
                              <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                                Auto Generated
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">{indent.items?.length || 0}</td>
                          <td className="p-3 text-center">
                            {(() => {
                              // Check if there are remaining items to dispatch
                              const hasRemainingItems = indent.status !== 'pending' && getIndentRemainingQtys(indent).length > 0;
                              const displayStatus = hasRemainingItems ? 'partial' : indent.status;
                              
                              return (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  displayStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  displayStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                                  displayStatus === 'dispatched' ? 'bg-blue-100 text-blue-700' :
                                  displayStatus === 'received' ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {displayStatus}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditIndentModal(indent); }}>
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              {indent.status === 'pending' && (
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openDispatchModal(indent); }}>
                                  <Truck size={14} className="mr-1" /> Dispatch
                                </Button>
                              )}
                              {(indent.status === 'partial' || (indent.status === 'dispatched' && getIndentRemainingQtys(indent).length > 0)) && (
                                <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); openDispatchModal(indent, true); }}>
                                  <Truck size={14} className="mr-1" /> Dispatch Remaining
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteIndent(indent.id); }}>
                                <Trash2 size={14} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expandedIndents[indent.id] && (
                          <tr className="bg-blue-50">
                            <td colSpan={6} className="p-3">
                              {(() => {
                                // Calculate dispatched quantities for this indent
                                const indentDispatches = dispatches.filter(d => d.indent_id === indent.id);
                                const dispatchedQtys = {};
                                for (const dispatch of indentDispatches) {
                                  for (const item of (dispatch.items || [])) {
                                    const key = `${item.product_id}|${item.variant_id || ''}`;
                                    dispatchedQtys[key] = (dispatchedQtys[key] || 0) + (item.supplied_qty || 0);
                                  }
                                }
                                const showDispatchColumns = indent.status === 'partial' || indent.status === 'dispatched';
                                
                                return (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="p-2 text-center w-8">#</th>
                                        <th className="p-2 text-left">Product</th>
                                        <th className="p-2 text-left">Variant</th>
                                        <th className="p-2 text-right">Ordered</th>
                                        {showDispatchColumns && (
                                          <>
                                            <th className="p-2 text-right">Dispatched</th>
                                            <th className="p-2 text-right">Remaining</th>
                                          </>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {indent.items?.map((item, idx) => {
                                        const key = `${item.product_id}|${item.variant_id || ''}`;
                                        const dispatched = dispatchedQtys[key] || 0;
                                        const remaining = (item.quantity || 0) - dispatched;
                                        return (
                                          <tr key={idx} className={remaining > 0 && showDispatchColumns ? 'bg-amber-50' : ''}>
                                            <td className="p-2 text-center text-gray-400">{idx + 1}</td>
                                            <td className="p-2">{getProductName(item)}</td>
                                            <td className="p-2">{item.variant_name || '-'}</td>
                                            <td className="p-2 text-right">{item.quantity}</td>
                                            {showDispatchColumns && (
                                              <>
                                                <td className="p-2 text-right text-green-700">{dispatched}</td>
                                                <td className="p-2 text-right font-semibold">
                                                  {remaining > 0 ? (
                                                    <span className="text-amber-700">{remaining}</span>
                                                  ) : (
                                                    <span className="text-green-600">✓</span>
                                                  )}
                                                </td>
                                              </>
                                            )}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot className="bg-blue-100 font-semibold">
                                      <tr>
                                        <td colSpan={3} className="p-2 text-right">TOTAL:</td>
                                        <td className="p-2 text-right">
                                          {indent.items?.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                                        </td>
                                        {showDispatchColumns && (
                                          <>
                                            <td className="p-2 text-right text-green-700">
                                              {indent.items?.reduce((sum, item) => {
                                                const key = `${item.product_id}|${item.variant_id || ''}`;
                                                return sum + (dispatchedQtys[key] || 0);
                                              }, 0)}
                                            </td>
                                            <td className="p-2 text-right text-amber-700">
                                              {indent.items?.reduce((sum, item) => {
                                                const key = `${item.product_id}|${item.variant_id || ''}`;
                                                const dispatched = dispatchedQtys[key] || 0;
                                                return sum + Math.max(0, (item.quantity || 0) - dispatched);
                                              }, 0)}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    </tfoot>
                                  </table>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== DISPATCHES TAB ==================== */}
        {activeTab === 'dispatches' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm">Dispatches</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dispatchDateFilter}
                    onChange={(e) => setDispatchDateFilter(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                  {dispatchDateFilter && (
                    <Button size="sm" variant="ghost" onClick={() => setDispatchDateFilter('')} className="h-8 px-2">
                      <X size={12} /> Clear
                    </Button>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={exportDispatches} title="Export to Excel">
                <FileSpreadsheet size={14} className="mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center w-10 font-medium text-gray-500">#</th>
                      <th className="p-3 text-center w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                      <th className="p-3 text-center font-medium text-gray-500">COMM %</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET RECEIVABLE</th>
                      <th className="p-3 text-center font-medium text-gray-500">TRANSPORT</th>
                      <th className="p-3 text-center font-medium text-gray-500">INVOICE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDispatches.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-gray-400">{dispatchDateFilter ? `No dispatches for ${dispatchDateFilter}` : 'No dispatches found'}</td></tr>
                    ) : filteredDispatches.map((dispatch, dispatchIdx) => (
                      <React.Fragment key={dispatch.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedDispatchId(expandedDispatchId === dispatch.id ? null : dispatch.id)}>
                          <td className="p-3 text-center text-gray-500">{dispatchIdx + 1}</td>
                          <td className="p-3 text-center">
                            <ChevronDown size={16} className={`transition-transform ${expandedDispatchId === dispatch.id ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="p-3">{formatDate(dispatch.dispatch_date)}</td>
                          <td className="p-3 font-medium">{getRetailerNameById(dispatch.retailer_id) || dispatch.retailer_name}</td>
                          <td className="p-3 text-center">{dispatch.items?.length || 0}</td>
                          <td className="p-3 text-right">{formatCurrency(dispatch.total_mrp_value)}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">{dispatch.commission_percentage}%</span>
                          </td>
                          <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(dispatch.net_payable)}</td>
                          <td className="p-3 text-center text-xs text-gray-500">
                            {dispatch.transport_charges ? formatCurrency(dispatch.transport_charges) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {dispatch.invoice_number ? (
                              <span className="text-blue-600 text-xs">{dispatch.invoice_number}</span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEditDispatchModal(dispatch)}>
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              {!dispatch.invoice_number && (
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteDispatch(dispatch.id)}>
                                  <Trash2 size={14} className="text-red-600" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded items row */}
                        {expandedDispatchId === dispatch.id && (
                          <tr className="bg-gray-50">
                            <td colSpan={11} className="p-0">
                              <div className="p-3 pl-8">
                                <table className="w-full text-xs border rounded">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="p-2 text-center w-8 font-medium">#</th>
                                      <th className="p-2 text-left font-medium">Product</th>
                                      <th className="p-2 text-left font-medium">Variant</th>
                                      <th className="p-2 text-center font-medium">Indent Qty</th>
                                      <th className="p-2 text-center font-medium">Supplied Qty</th>
                                      <th className="p-2 text-right font-medium">MRP</th>
                                      <th className="p-2 text-right font-medium">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dispatch.items?.map((item, idx) => (
                                      <tr key={idx} className="border-t">
                                        <td className="p-2 text-center text-gray-400">{idx + 1}</td>
                                        <td className="p-2 font-medium">{getProductName(item)}</td>
                                        <td className="p-2 text-gray-600">{item.variant_name || '-'}</td>
                                        <td className="p-2 text-center">{item.indent_qty || '-'}</td>
                                        <td className="p-2 text-center font-semibold">{item.supplied_qty}</td>
                                        <td className="p-2 text-right">₹{item.mrp?.toFixed(2)}</td>
                                        <td className="p-2 text-right font-medium">₹{item.total_value?.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="bg-green-100 font-semibold">
                                    <tr>
                                      <td colSpan={3} className="p-2 text-right">TOTAL:</td>
                                      <td className="p-2 text-center">
                                        {dispatch.items?.reduce((sum, item) => sum + (item.indent_qty || 0), 0) || '-'}
                                      </td>
                                      <td className="p-2 text-center">
                                        {dispatch.items?.reduce((sum, item) => sum + (item.supplied_qty || 0), 0)}
                                      </td>
                                      <td className="p-2 text-right">-</td>
                                      <td className="p-2 text-right text-green-700">
                                        ₹{dispatch.items?.reduce((sum, item) => sum + (item.total_value || 0), 0).toFixed(2)}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  {filteredDispatches.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={5} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(filteredDispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0))}</td>
                        <td></td>
                        <td className="p-3 text-right text-green-700">{formatCurrency(filteredDispatches.reduce((sum, d) => sum + (d.net_payable || 0), 0))}</td>
                        <td className="p-3 text-center text-xs">{formatCurrency(filteredDispatches.reduce((sum, d) => sum + (d.transport_charges || 0), 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== INVOICES TAB ==================== */}
        {activeTab === 'invoices' && (
          <Card>
            <CardHeader className="py-3 flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Invoices</CardTitle>
                <div className="flex gap-2 items-center">
                  <Button size="sm" variant="outline" onClick={exportInvoices} title="Export to Excel">
                    <FileSpreadsheet size={14} className="mr-1" /> Export
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (!invoiceForm.retailer_id) {
                        toast.error('Please select a retailer first');
                        return;
                      }
                      setClosingInventoryRetailer(invoiceForm.retailer_id);
                      loadUnpaidInvoices(invoiceForm.retailer_id);
                    }}
                    className="text-purple-700 border-purple-300 hover:bg-purple-50"
                    disabled={paymentSummaryLoading}
                  >
                    <FileText size={14} className="mr-1" /> Payment Summary
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (!invoiceForm.retailer_id) {
                        toast.error('Please select a retailer first');
                        return;
                      }
                      setPaymentAuditRetailerId(invoiceForm.retailer_id);
                      loadPaymentAudit(invoiceForm.retailer_id);
                    }}
                    className="text-red-700 border-red-300 hover:bg-red-50"
                    disabled={paymentAuditLoading}
                  >
                    <AlertTriangle size={14} className="mr-1" /> Payment Audit
                  </Button>
                  {getCurrentUserRole() === 'admin' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res = await api.post('/api/retailer-invoices/fix-statuses');
                          toast.success(res.data.message);
                          // Reload invoices
                          if (invoiceForm.retailer_id) {
                            const invRes = await api.get(`/api/retailer-invoices?retailer_id=${invoiceForm.retailer_id}`);
                            setInvoices(invRes.data || []);
                          }
                        } catch (error) {
                          toast.error('Failed to fix statuses');
                        }
                      }}
                      className="text-orange-700 border-orange-300 hover:bg-orange-50"
                      title="Recalculate invoice statuses from payment records"
                    >
                      <RefreshCw size={14} className="mr-1" /> Fix Statuses
                    </Button>
                  )}
                  <select
                    value={invoiceForm.retailer_id}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                    className="h-8 px-2 rounded border text-sm"
                  >
                    <option value="">Select Retailer</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                  <Button size="sm" className="bg-[#14532D]" onClick={openInvoiceModal} disabled={!invoiceForm.retailer_id}>
                    <Plus size={14} className="mr-1" /> Create Invoice
                  </Button>
                </div>
              </div>
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Filter by Status:</span>
                <div className="flex gap-1">
                  {[
                    { value: 'all', label: 'All', color: 'gray' },
                    { value: 'pending', label: 'Pending', color: 'yellow' },
                    { value: 'partial', label: 'Partial', color: 'blue' },
                    { value: 'paid', label: 'Paid', color: 'green' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setInvoiceStatusFilter(opt.value)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        invoiceStatusFilter === opt.value
                          ? opt.color === 'yellow' ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                          : opt.color === 'blue' ? 'bg-blue-100 border-blue-400 text-blue-800'
                          : opt.color === 'green' ? 'bg-green-100 border-green-400 text-green-800'
                          : 'bg-gray-100 border-gray-400 text-gray-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                      {opt.value !== 'all' && (
                        <span className="ml-1">
                          ({invoices.filter(inv => (inv.status || 'pending') === opt.value).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center w-10 font-medium text-gray-500">#</th>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE #</th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">RECEIVABLE</th>
                      <th className="p-3 text-right font-medium text-green-600">PAID</th>
                      <th className="p-3 text-right font-medium text-amber-600">PENDING</th>
                      <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-gray-400">No invoices found</td></tr>
                    ) : filteredInvoices.map((invoice, invoiceIdx) => {
                      const paidAmount = invoice.paid_amount || 0;
                      const pendingAmount = (invoice.net_payable || 0) - paidAmount;
                      const status = invoice.status || 'pending';
                      
                      return (
                        <React.Fragment key={invoice.id}>
                          <tr className={`border-b hover:bg-gray-50 cursor-pointer ${status === 'paid' ? 'bg-green-50/30' : ''}`} onClick={() => toggleInvoiceExpand(invoice.id)}>
                            <td className="p-3 text-center text-gray-500">{invoiceIdx + 1}</td>
                            <td className="p-3">
                              {expandedInvoices[invoice.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </td>
                            <td className="p-3 font-medium text-blue-600">{invoice.invoice_number}</td>
                            <td className="p-3">{formatDate(invoice.invoice_date)}</td>
                            <td className="p-3 font-medium">{getRetailerNameById(invoice.retailer_id) || invoice.retailer_name}</td>
                            <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                            <td className="p-3 text-right font-semibold">{formatCurrency(invoice.net_payable)}</td>
                            <td className="p-3 text-right text-green-600 font-medium">{formatCurrency(paidAmount)}</td>
                            <td className="p-3 text-right text-amber-600 font-medium">
                              {pendingAmount > 0 ? formatCurrency(pendingAmount) : '-'}
                            </td>
                            <td className="p-3 text-center">
                              {status === 'paid' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                                  <Check size={12} className="mr-1" /> Paid
                                </span>
                              ) : status === 'partial' ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  <Clock size={12} className="mr-1" /> Partial
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  <Clock size={12} className="mr-1" /> Pending
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                {status === 'paid' ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                    onClick={() => openPaymentHistoryModal(invoice)}
                                    title="View Payment Details"
                                  >
                                    <Eye size={14} className="mr-1" /> View
                                  </Button>
                                ) : status === 'partial' ? (
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                      onClick={() => openPaymentHistoryModal(invoice)}
                                      title="View/Edit Payments"
                                    >
                                      <Eye size={14} />
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="text-green-600 border-green-300 hover:bg-green-50"
                                      onClick={() => openInvoicePaymentModal(invoice)}
                                      title="Add More Payment"
                                    >
                                      <IndianRupee size={14} className="mr-1" /> Pay
                                    </Button>
                                  </>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => openInvoicePaymentModal(invoice)}
                                  >
                                    <IndianRupee size={14} className="mr-1" /> Pay
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                                  <Download size={14} className="text-blue-600" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openEditInvoiceModal(invoice)}>
                                  <Edit size={14} className="text-amber-600" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteInvoice(invoice.id)}>
                                  <Trash2 size={14} className="text-red-600" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedInvoices[invoice.id] && (
                            <tr className="bg-green-50">
                              <td colSpan={10} className="p-3">
                                {/* Invoice Details */}
                                <div className="mb-3 p-3 bg-white rounded-lg border">
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                    <div>
                                      <span className="text-gray-500">Gross Value:</span>
                                      <p className="font-medium">{formatCurrency(getInvoiceGrossValue(invoice))}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Rejection:</span>
                                      <p className="font-medium text-red-600">-{formatCurrency(getInvoiceRejectionAmount(invoice))}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Net Value:</span>
                                      <p className="font-medium">{formatCurrency(invoice.total_mrp_value)}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Commission ({invoice.commission_percentage}%):</span>
                                      <p className="font-medium text-green-600">-{formatCurrency(invoice.commission_amount)}</p>
                                    </div>
                                    <div>
                                      <span className="text-gray-700 font-semibold">Final Payable:</span>
                                      <p className="font-bold text-blue-700">{formatCurrency(invoice.net_payable)}</p>
                                    </div>
                                  </div>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="p-2 text-left">Product</th>
                                      <th className="p-2 text-left">Variant</th>
                                      <th className="p-2 text-center">Supplied Qty</th>
                                      <th className="p-2 text-center text-red-600">Rejection</th>
                                      <th className="p-2 text-center text-green-700 font-semibold">Billable Qty</th>
                                      <th className="p-2 text-right">Rate</th>
                                      <th className="p-2 text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invoice.items?.map((item, idx) => {
                                      const suppliedQty = item.supplied_qty || item.quantity || 0;
                                      const rejectedQty = item.rejected_qty || 0;
                                      const billableQty = suppliedQty - rejectedQty;
                                      const rate = item.mrp || 0;
                                      const amount = billableQty * rate;
                                      return (
                                        <tr key={idx}>
                                          <td className="p-2">{getProductName(item)}</td>
                                          <td className="p-2">{item.variant_name || '-'}</td>
                                          <td className="p-2 text-center">{suppliedQty}</td>
                                          <td className="p-2 text-center text-red-600">{rejectedQty > 0 ? `-${rejectedQty}` : '-'}</td>
                                          <td className="p-2 text-center text-green-700 font-semibold">{billableQty}</td>
                                          <td className="p-2 text-right">{formatCurrency(rate)}</td>
                                          <td className="p-2 text-right">{formatCurrency(amount)}</td>
                                        </tr>
                                      );
                                    })}
                                    {/* Subtotals row */}
                                    <tr className="border-t bg-gray-50 font-medium">
                                      <td colSpan={2} className="p-2 text-right">Subtotal:</td>
                                      <td className="p-2 text-center">
                                        {invoice.items?.reduce((sum, i) => sum + (i.supplied_qty || i.quantity || 0), 0)}
                                      </td>
                                      <td className="p-2 text-center text-red-600">
                                        -{invoice.items?.reduce((sum, i) => sum + (i.rejected_qty || 0), 0)}
                                      </td>
                                      <td className="p-2 text-center text-green-700">
                                        {invoice.items?.reduce((sum, i) => {
                                          const supplied = i.supplied_qty || i.quantity || 0;
                                          return sum + (supplied - (i.rejected_qty || 0));
                                        }, 0)}
                                      </td>
                                      <td className="p-2"></td>
                                      <td className="p-2 text-right">{formatCurrency(invoice.total_mrp_value)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {filteredInvoices.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={5} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(filteredInvoices.reduce((sum, i) => sum + (i.net_payable || 0), 0))}</td>
                        <td className="p-3 text-right text-green-600">{formatCurrency(filteredInvoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0))}</td>
                        <td className="p-3 text-right text-amber-600">{formatCurrency(filteredInvoices.reduce((sum, i) => sum + ((i.net_payable || 0) - (i.paid_amount || 0)), 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== REJECTIONS TAB ==================== */}
        {activeTab === 'rejections' && (
          <Card>
            <CardHeader className="py-3 flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Rejections</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={exportRejections} title="Export to Excel">
                    <FileSpreadsheet size={14} className="mr-1" /> Export
                  </Button>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowRejectionModal(true)}>
                    <Plus size={14} className="mr-1" /> Record Rejection
                  </Button>
                </div>
              </div>
              {/* Filters row */}
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  type="date"
                  value={rejectionDateFilter}
                  onChange={(e) => setRejectionDateFilter(e.target.value)}
                  className="h-8 w-36 text-xs"
                  placeholder="Filter by date"
                />
                <select
                  value={rejectionRetailerFilter}
                  onChange={(e) => setRejectionRetailerFilter(e.target.value)}
                  className="h-8 px-2 rounded border text-xs"
                >
                  <option value="">All Retailers</option>
                  {retailers.map(r => (
                    <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                  ))}
                </select>
                <Input
                  type="text"
                  value={rejectionProductFilter}
                  onChange={(e) => setRejectionProductFilter(e.target.value)}
                  className="h-8 w-32 text-xs"
                  placeholder="Product..."
                />
                {(rejectionDateFilter || rejectionRetailerFilter || rejectionProductFilter) && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => { 
                      setRejectionDateFilter(''); 
                      setRejectionRetailerFilter(''); 
                      setRejectionProductFilter(''); 
                    }} 
                    className="h-8 px-2"
                  >
                    <X size={12} /> Clear
                  </Button>
                )}
                <span className="text-xs text-gray-500">
                  Showing {filteredRejections.length} of {rejections.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center font-medium text-gray-500 w-10">#</th>
                      <th className="p-3 text-left font-medium text-gray-500 w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE / PRODUCT</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                      <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REASON</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRejections.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-400">No rejections found</td></tr>
                    ) : (() => {
                      // Group rejections by date
                      const rejectionsByDate = filteredRejections.reduce((acc, r) => {
                        const date = r.rejection_date?.split('T')[0] || 'Unknown';
                        if (!acc[date]) acc[date] = [];
                        acc[date].push(r);
                        return acc;
                      }, {});
                      
                      // Sort dates descending
                      const sortedDates = Object.keys(rejectionsByDate).sort((a, b) => b.localeCompare(a));
                      
                      return sortedDates.map((date, dateIdx) => {
                        const dateRejections = rejectionsByDate[date];
                        const isExpanded = expandedRejectionDates[date];
                        const totalQty = dateRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
                        const totalValue = dateRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
                        
                        // Get unique retailers for this date
                        const uniqueRetailers = [...new Set(dateRejections.map(r => getRetailerNameById(r.retailer_id) || r.retailer_name))];
                        
                        return (
                          <React.Fragment key={date}>
                            {/* Date Row - Clickable */}
                            <tr 
                              className="border-b bg-red-50 hover:bg-red-100 cursor-pointer"
                              onClick={() => setExpandedRejectionDates(prev => ({ ...prev, [date]: !prev[date] }))}
                            >
                              <td className="p-3 text-center text-gray-500">{dateIdx + 1}</td>
                              <td className="p-3 text-center">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{formatDate(date)}</td>
                              <td className="p-3 text-gray-600 text-xs">{uniqueRetailers.length === 1 ? uniqueRetailers[0] : `${uniqueRetailers.length} retailers`}</td>
                              <td className="p-3 text-center text-red-600 font-semibold">{totalQty}</td>
                              <td className="p-3 text-right text-red-600 font-semibold">{formatCurrency(totalValue)}</td>
                              <td className="p-3 text-gray-500 text-xs">{dateRejections.length} item(s)</td>
                              <td className="p-3"></td>
                            </tr>
                            
                            {/* Expanded Product Details */}
                            {isExpanded && dateRejections.map((rejection, idx) => (
                              <tr key={rejection.id || idx} className="border-b bg-white hover:bg-gray-50">
                                <td className="p-2 pl-8"></td>
                                <td className="p-2 pl-8">
                                  <span className="text-sm text-gray-700">{getProductName(rejection)}</span>
                                  {rejection.variant_name && (
                                    <span className="text-xs text-gray-400 ml-1">({rejection.variant_name})</span>
                                  )}
                                  {/* Show when this rejection was recorded */}
                                  {rejection.created_at && (
                                    <div className="text-[10px] text-gray-400 italic mt-0.5">
                                      Recorded: {new Date(rejection.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at {new Date(rejection.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 text-gray-600 text-sm">{getRetailerNameById(rejection.retailer_id) || rejection.retailer_name}</td>
                                <td className="p-2 text-center text-red-500">{rejection.quantity}</td>
                                <td className="p-2 text-right text-red-500">{formatCurrency(rejection.rejection_value)}</td>
                                <td className="p-2 text-gray-500">{rejection.reason}</td>
                                <td className="p-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEditRejection(rejection); }}>
                                      <Edit size={14} className="text-amber-600" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteRejection(rejection.id); }}>
                                      <Trash2 size={14} className="text-red-600" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                  {filteredRejections.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td className="p-3"></td>
                        <td colSpan={2} className="p-3 text-right">Total Rejected:</td>
                        <td className="p-3 text-center text-red-600">{filteredRejections.reduce((sum, r) => sum + (r.quantity || 0), 0)}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(filteredRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== CLOSING INVENTORY TAB (Admin - Full Inventory View) ==================== */}
        {activeTab === 'closingInventory' && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList size={18} className="text-green-600" />
                Retailer Daily Inventory (Admin View)
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">View and manage retailer inventory for any date</p>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Select Retailer</label>
                  <select
                    value={closingInventoryRetailer}
                    onChange={(e) => setClosingInventoryRetailer(e.target.value)}
                    className="w-full h-9 border rounded px-3 text-sm"
                  >
                    <option value="">-- Select Retailer --</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <Input
                    type="date"
                    value={closingInventoryDate}
                    onChange={(e) => setClosingInventoryDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={loadClosingInventory}
                    className="h-9"
                  >
                    <Search size={14} className="mr-1" /> Load
                  </Button>
                </div>
                <div className="flex items-end">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (closingInventoryData.length === 0) {
                        toast.error('No inventory data to export');
                        return;
                      }
                      
                      // Build export data
                      const exportData = closingInventoryData.map(item => ({
                        'Product Name': item.product_name || '',
                        'Variant': item.variant_name || 'Kg',
                        'Opening': item.opening_qty || 0,
                        'Received': item.received_qty || 0,
                        'Rejection': item.rejection_qty || 0,
                        'Items Sold': Math.max(0, (item.opening_qty || 0) + (item.received_qty || 0) - (item.rejection_qty || 0) - (item.closing_qty || 0)),
                        'Closing': item.closing_qty ?? 0
                      }));
                      
                      // Create CSV content
                      const headers = ['Product Name', 'Variant', 'Opening', 'Received', 'Rejection', 'Items Sold', 'Closing'];
                      const csvRows = [
                        headers.join(','),
                        ...exportData.map(row => 
                          headers.map(h => {
                            const val = row[h];
                            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                              return `"${val.replace(/"/g, '""')}"`;
                            }
                            return val;
                          }).join(',')
                        )
                      ];
                      const csvContent = csvRows.join('\n');
                      
                      // Download as CSV
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      const retailerName = retailers.find(r => r.id === closingInventoryRetailer)?.company_name || 'Retailer';
                      link.setAttribute('download', `Inventory_${retailerName}_${closingInventoryDate}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      window.URL.revokeObjectURL(url);
                      
                      toast.success('Inventory exported successfully');
                    }}
                    className="h-9 text-green-700 border-green-300 hover:bg-green-50"
                    disabled={closingInventoryData.length === 0}
                  >
                    <Download size={14} className="mr-1" /> Export
                  </Button>
                </div>
              </div>

              {/* Full Inventory Table */}
              {closingInventoryRetailer && closingInventoryDate ? (
                closingHasData ? (
                  /* Normal view - has closing data recorded */
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-3 text-left font-medium text-gray-600">Product</th>
                          <th className="p-3 text-left font-medium text-gray-500">Variant</th>
                          <th className="p-3 text-center font-medium text-blue-600">Opening</th>
                          <th className="p-3 text-center font-medium text-green-600">Received</th>
                          <th className="p-3 text-center font-medium text-red-600">Rejection</th>
                          <th className="p-3 text-center font-medium text-purple-600">Items Sold</th>
                          <th className="p-3 text-center font-medium text-amber-600">Closing</th>
                          <th className="p-3 text-center font-medium text-gray-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closingInventoryData
                          .filter(item => item.closing_qty !== null && item.closing_qty !== undefined)
                          // Two-step sorting: non-zero closing first (by descending qty), then zero closing
                          .sort((a, b) => {
                            const aClosing = typeof a.closing_qty === 'number' ? a.closing_qty : 0;
                            const bClosing = typeof b.closing_qty === 'number' ? b.closing_qty : 0;
                            const aHasClosing = aClosing > 0;
                            const bHasClosing = bClosing > 0;
                            
                            // Non-zero closing comes first
                            if (aHasClosing && !bHasClosing) return -1;
                            if (!aHasClosing && bHasClosing) return 1;
                            
                            // Within same group, sort by descending closing qty
                            return bClosing - aClosing;
                          })
                          .map(item => {
                            // Calculate items sold: Opening + Received - Rejection - Closing
                            const openingQty = item.opening_qty || 0;
                            const receivedQty = item.received_qty || 0;
                            const rejectionQty = item.rejection_qty || 0;
                            const closingQty = item.closing_qty || 0;
                            // Default to 0 if calculated items sold is negative
                            const itemsSold = Math.max(0, openingQty + receivedQty - rejectionQty - closingQty);
                            
                            return (
                              <tr key={`${item.product_id}-${item.variant_id || 'default'}`} className="border-b hover:bg-gray-50">
                                <td className="p-3 font-medium">{item.product_name}</td>
                                <td className="p-3 text-gray-500 text-xs">
                                  {editingClosingItem === item.id ? (
                                    <div className="relative">
                                      <Input
                                        type="text"
                                        value={variantSearchTerm}
                                        onChange={(e) => setVariantSearchTerm(e.target.value)}
                                        placeholder="Search variant..."
                                        className="w-32 h-7 text-xs"
                                      />
                                      {variantSearchTerm && (
                                        <div className="absolute z-10 w-48 max-h-40 overflow-y-auto bg-white border rounded shadow-lg mt-1">
                                          {packagings
                                            .filter(p => p.name.toLowerCase().includes(variantSearchTerm.toLowerCase()))
                                            .slice(0, 10)
                                            .map(p => (
                                              <div
                                                key={p.id}
                                                onClick={() => {
                                                  setEditingClosingVariant(p.name);
                                                  setVariantSearchTerm(p.name);
                                                }}
                                                className="px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer"
                                              >
                                                {p.name}
                                              </div>
                                            ))}
                                          {packagings.filter(p => p.name.toLowerCase().includes(variantSearchTerm.toLowerCase())).length === 0 && (
                                            <div className="px-2 py-1 text-xs text-gray-400">No matches</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    item.variant_name || 'Kg'
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`font-semibold ${openingQty > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                                    {openingQty}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`font-semibold ${receivedQty > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                    {receivedQty > 0 ? `+${receivedQty}` : '0'}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`font-semibold ${rejectionQty > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                    {rejectionQty > 0 ? `-${rejectionQty}` : '0'}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`font-semibold ${itemsSold !== 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                                    {itemsSold}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  {editingClosingItem === item.id ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={editingClosingQty}
                                        onChange={(e) => setEditingClosingQty(e.target.value)}
                                        className="w-16 h-7 text-center text-sm"
                                        autoFocus
                                      />
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => updateClosingItem(item.id, editingClosingQty, editingClosingVariant || null)}
                                        className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                                      >
                                        <Check size={14} />
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => { setEditingClosingItem(null); setEditingClosingQty(''); setEditingClosingVariant(''); setVariantSearchTerm(''); }}
                                        className="h-7 w-7 p-0 text-gray-600 hover:bg-gray-100"
                                      >
                                        <X size={14} />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="text-lg font-semibold text-amber-600">{closingQty}</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {editingClosingItem !== item.id && (
                                    <div className="flex items-center justify-center gap-1">
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => { 
                                          setEditingClosingItem(item.id); 
                                          setEditingClosingQty(item.closing_qty?.toString() || ''); 
                                          setEditingClosingVariant(item.variant_name || 'Kg');
                                          setVariantSearchTerm(item.variant_name || 'Kg');
                                        }}
                                        className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                        title="Edit Closing Qty & Variant"
                                        disabled={!item.id}
                                      >
                                        <Pencil size={12} />
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => adminDeleteClosingItem(item)}
                                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                                        title="Delete"
                                      >
                                        <Trash2 size={12} />
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                      <tfoot className="bg-gray-100 font-semibold text-sm">
                        <tr>
                          <td colSpan={2} className="p-3 text-right">Totals:</td>
                          <td className="p-3 text-center text-blue-600">
                            {closingInventoryData.filter(i => i.closing_qty != null).reduce((sum, i) => sum + (i.opening_qty || 0), 0)}
                          </td>
                          <td className="p-3 text-center text-green-600">
                            +{closingInventoryData.filter(i => i.closing_qty != null).reduce((sum, i) => sum + (i.received_qty || 0), 0)}
                          </td>
                          <td className="p-3 text-center text-red-600">
                            -{closingInventoryData.filter(i => i.closing_qty != null).reduce((sum, i) => sum + (i.rejection_qty || 0), 0)}
                          </td>
                          <td className="p-3 text-center text-purple-600">
                            {closingInventoryData.filter(i => i.closing_qty != null).reduce((sum, i) => {
                              const open = i.opening_qty || 0;
                              const recv = i.received_qty || 0;
                              const rej = i.rejection_qty || 0;
                              const close = i.closing_qty || 0;
                              // Items Sold = Opening + Received - Rejection - Closing
                              return sum + Math.max(0, open + recv - rej - close);
                            }, 0)}
                          </td>
                          <td className="p-3 text-center text-amber-600">
                            {closingInventoryData.filter(i => i.closing_qty != null).reduce((sum, i) => sum + (i.closing_qty || 0), 0)}
                          </td>
                          <td className="p-3 text-center text-gray-500 text-xs">
                            {closingInventoryData.filter(i => i.closing_qty != null).length} items
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : closingInventoryData.length > 0 ? (
                  /* No closing recorded but has opening data - show with admin entry option */
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="text-amber-600" size={20} />
                        <div>
                          <p className="font-medium text-amber-800">No closing recorded for {closingInventoryDate}</p>
                          <p className="text-sm text-amber-700">Showing opening data from previous day's closing. You can enter closing values below.</p>
                        </div>
                      </div>
                      {!adminEnteringClosing ? (
                        <Button 
                          size="sm" 
                          onClick={() => setAdminEnteringClosing(true)}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          <Edit size={14} className="mr-1" />
                          Enter Closing
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => { setAdminEnteringClosing(false); setAdminClosingInputs({}); }}
                            className="border-amber-300 text-amber-700"
                          >
                            Cancel
                          </Button>
                          <Button 
                            size="sm" 
                            onClick={handleAdminSaveClosing}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <Save size={14} className="mr-1" />
                            Save Closing
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-100 border-b">
                            <th className="p-3 text-left w-8">#</th>
                            <th className="p-3 text-left">Product</th>
                            <th className="p-3 text-left">Variant</th>
                            <th className="p-3 text-center">Opening</th>
                            <th className="p-3 text-center">Received</th>
                            <th className="p-3 text-center">Rejection</th>
                            {adminEnteringClosing && <th className="p-3 text-center bg-amber-50">Enter Closing</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {closingInventoryData
                            .filter(item => (item.opening_qty || 0) > 0 || (item.received_qty || 0) > 0)
                            .map((item, idx) => (
                            <tr key={item.product_id + (item.variant_id || '')} className="border-b hover:bg-gray-50">
                              <td className="p-3 text-center text-gray-500">{idx + 1}</td>
                              <td className="p-3 font-medium">{item.product_name}</td>
                              <td className="p-3 text-gray-600">{item.variant_name || 'Kg'}</td>
                              <td className="p-3 text-center text-blue-600">{item.opening_qty || 0}</td>
                              <td className="p-3 text-center text-green-600">+{item.received_qty || 0}</td>
                              <td className="p-3 text-center text-red-600">-{item.rejection_qty || 0}</td>
                              {adminEnteringClosing && (
                                <td className="p-3 text-center bg-amber-50">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={adminClosingInputs[item.product_id] || ''}
                                    onChange={(e) => setAdminClosingInputs(prev => ({
                                      ...prev,
                                      [item.product_id]: e.target.value
                                    }))}
                                    placeholder="0"
                                    className="w-20 px-2 py-1 border rounded text-center focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                                  />
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-100 font-semibold">
                            <td colSpan={3} className="p-3 text-right">TOTAL</td>
                            <td className="p-3 text-center text-blue-600">
                              {closingInventoryData.filter(i => (i.opening_qty || 0) > 0 || (i.received_qty || 0) > 0).reduce((sum, i) => sum + (i.opening_qty || 0), 0)}
                            </td>
                            <td className="p-3 text-center text-green-600">
                              +{closingInventoryData.filter(i => (i.opening_qty || 0) > 0 || (i.received_qty || 0) > 0).reduce((sum, i) => sum + (i.received_qty || 0), 0)}
                            </td>
                            <td className="p-3 text-center text-red-600">
                              -{closingInventoryData.filter(i => (i.opening_qty || 0) > 0 || (i.received_qty || 0) > 0).reduce((sum, i) => sum + (i.rejection_qty || 0), 0)}
                            </td>
                            {adminEnteringClosing && <td className="p-3 bg-amber-50"></td>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
                    <ClipboardList size={40} className="mx-auto mb-3 opacity-50" />
                    <p>No closing inventory recorded for this date</p>
                    <p className="text-sm mt-2">No opening or received data available for this date.</p>
                  </div>
                )
              ) : (
                <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
                  <ClipboardList size={40} className="mx-auto mb-3 opacity-50" />
                  <p>Select a retailer and date to view inventory</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ==================== DISPATCH-LINKED ITEM INFO MODAL ==================== */}
        {dispatchLinkedItemInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b bg-amber-50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-600" size={20} />
                  <h3 className="text-lg font-semibold text-amber-800">Cannot Delete - Linked to Dispatch</h3>
                </div>
                <button onClick={() => setDispatchLinkedItemInfo(null)} className="p-1 hover:bg-amber-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium text-gray-800">{dispatchLinkedItemInfo.product_name}</p>
                  <p className="text-sm text-gray-500">{dispatchLinkedItemInfo.variant_name}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    {dispatchLinkedItemInfo.opening_qty > 0 && (
                      <span className="text-blue-600">Opening: {dispatchLinkedItemInfo.opening_qty}</span>
                    )}
                    {dispatchLinkedItemInfo.received_qty > 0 && (
                      <span className="text-green-600">Received: +{dispatchLinkedItemInfo.received_qty}</span>
                    )}
                  </div>
                </div>
                
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                  <p className="font-medium text-red-800 mb-2">This item cannot be deleted because:</p>
                  <p className="text-red-700">
                    It is linked to dispatch on{' '}
                    <strong>
                      {dispatchLinkedItemInfo.dispatch_dates?.length > 0 
                        ? dispatchLinkedItemInfo.dispatch_dates.slice(0, 3).join(', ')
                        : dispatchLinkedItemInfo.linked_dispatches?.length > 0
                          ? [...new Set(dispatchLinkedItemInfo.linked_dispatches.map(d => d.dispatch_date))].slice(0, 3).join(', ')
                          : 'a previous date'
                      }
                    </strong>
                  </p>
                </div>
                
                <div className="bg-blue-50 p-3 rounded-lg text-sm">
                  <p className="font-medium text-blue-800 mb-1">To remove this item:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700">
                    <li>Go to <strong>Dispatches</strong> tab</li>
                    <li>Find the dispatch for the date mentioned above</li>
                    <li>Remove or edit this product from that dispatch</li>
                    <li>Come back here and click <strong>Load</strong> to refresh</li>
                  </ol>
                </div>
                
                <div className="flex justify-end gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setDispatchLinkedItemInfo(null);
                      setActiveTab('dispatches');
                    }}
                  >
                    Go to Dispatches
                  </Button>
                  <Button onClick={() => setDispatchLinkedItemInfo(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT SUMMARY MODAL ==================== */}
        {showPaymentSummaryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-purple-50">
                <div className="flex items-center gap-2">
                  <FileText className="text-purple-600" size={20} />
                  <h3 className="text-lg font-semibold text-purple-800">Payment Summary</h3>
                </div>
                <button onClick={() => setShowPaymentSummaryModal(false)} className="p-1 hover:bg-purple-100 rounded">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                {unpaidInvoices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={40} className="mx-auto mb-3 opacity-50" />
                    <p>No unpaid invoices found for this retailer</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-600">
                        Select invoices to generate payment summary. <span className="font-medium text-purple-600">{unpaidInvoices.length} unpaid invoice(s)</span>
                      </p>
                      <Button variant="outline" size="sm" onClick={selectAllInvoicesForSummary}>
                        Select All
                      </Button>
                    </div>
                    
                    {/* Invoice Selection Table */}
                    <div className="border rounded-lg overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-2 w-10 text-center">
                              <CheckCircle size={14} />
                            </th>
                            <th className="p-2 text-center text-gray-600">S.No</th>
                            <th className="p-2 text-left text-gray-600">Indent Date</th>
                            <th className="p-2 text-left text-gray-600">Dispatch Date</th>
                            <th className="p-2 text-left text-gray-600">Invoice #</th>
                            <th className="p-2 text-right text-gray-600">Gross Value</th>
                            <th className="p-2 text-right text-red-600">Rejections</th>
                            <th className="p-2 text-right text-blue-600">Total MRP</th>
                            <th className="p-2 text-right text-orange-600">Commission</th>
                            <th className="p-2 text-right text-green-600">Payable</th>
                            <th className="p-2 text-right text-purple-600">Paid</th>
                            <th className="p-2 text-right text-blue-800 font-semibold">Net Receivable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unpaidInvoices.map((inv, idx) => {
                            const isSelected = selectedInvoicesForSummary[inv.id];
                            const grossValue = inv.gross_value || 0;
                            const rejections = inv.rejection_amount || 0;
                            const totalMrp = inv.total_mrp_value || 0;
                            const commission = inv.commission_amount || 0;
                            const payable = inv.net_payable || 0;
                            const paidAmount = inv.paid_amount || 0;
                            const netReceivable = payable - paidAmount;
                            
                            // Format date as DD-MM-YYYY
                            const formatDate = (dateStr) => {
                              if (!dateStr) return '-';
                              const date = new Date(dateStr);
                              if (isNaN(date.getTime())) return '-';
                              const day = String(date.getDate()).padStart(2, '0');
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const year = date.getFullYear();
                              return `${day}-${month}-${year}`;
                            };
                            
                            return (
                              <tr 
                                key={inv.id} 
                                className={`border-t cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-purple-50' : ''}`}
                                onClick={() => toggleInvoiceForSummary(inv.id)}
                              >
                                <td className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected || false}
                                    onChange={() => toggleInvoiceForSummary(inv.id)}
                                    className="w-4 h-4"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </td>
                                <td className="p-2 text-center text-gray-600">{idx + 1}</td>
                                <td className="p-2 text-left text-gray-700">
                                  {formatDate(inv.indent_date || inv.invoice_date)}
                                </td>
                                <td className="p-2 text-left text-gray-700">
                                  {formatDate(inv.dispatch_date || inv.invoice_date)}
                                </td>
                                <td className="p-2 text-left font-medium text-gray-800">{inv.invoice_number}</td>
                                <td className="p-2 text-right text-gray-700">₹{grossValue.toFixed(2)}</td>
                                <td className="p-2 text-right text-red-600">-₹{rejections.toFixed(2)}</td>
                                <td className="p-2 text-right text-blue-600">₹{totalMrp.toFixed(2)}</td>
                                <td className="p-2 text-right text-orange-600">-₹{commission.toFixed(2)}</td>
                                <td className="p-2 text-right font-medium text-green-600">₹{payable.toFixed(2)}</td>
                                <td className="p-2 text-right text-purple-600">₹{paidAmount.toFixed(2)}</td>
                                <td className="p-2 text-right font-semibold text-blue-800">₹{netReceivable.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {Object.values(selectedInvoicesForSummary).some(v => v) && (
                          <tfoot className="bg-purple-100 font-semibold">
                            <tr>
                              <td colSpan={5} className="p-2 text-right text-purple-800">
                                Selected Total ({Object.values(selectedInvoicesForSummary).filter(v => v).length} invoices):
                              </td>
                              <td className="p-2 text-right text-gray-800">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.gross_value || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-red-700">
                                -₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.rejection_amount || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-blue-700">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.total_mrp_value || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-orange-700">
                                -₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.commission_amount || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-green-700">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.net_payable || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-purple-700">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.paid_amount || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-blue-800 font-bold">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + ((inv.net_payable || 0) - (inv.paid_amount || 0)), 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </>
                )}
              </div>
              
              <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPaymentSummaryModal(false)}>
                  Close
                </Button>
                <Button 
                  onClick={() => {
                    if (!Object.values(selectedInvoicesForSummary).some(v => v)) {
                      toast.error('Please select at least one invoice');
                      return;
                    }
                    setShowPaymentSummaryPreview(true);
                  }}
                  disabled={!Object.values(selectedInvoicesForSummary).some(v => v)}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <FileText size={14} className="mr-1" /> View Summary
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT SUMMARY PREVIEW MODAL ==================== */}
        {showPaymentSummaryPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 md:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-green-50">
                <div className="flex items-center gap-2">
                  <FileText className="text-green-600" size={16} />
                  <h3 className="text-sm font-semibold text-green-800">Payment Summary</h3>
                  <span className="text-xs text-gray-500">
                    ({Object.values(selectedInvoicesForSummary).filter(v => v).length} invoices)
                  </span>
                </div>
                <button onClick={() => setShowPaymentSummaryPreview(false)} className="p-1 hover:bg-green-100 rounded">
                  <X size={16} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto overflow-x-auto">
                {/* Full Summary Table with all fields */}
                <table className="w-full text-xs min-w-[700px]">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-1.5 py-1 text-center text-gray-600 font-semibold w-8">#</th>
                      <th className="px-1.5 py-1 text-left text-gray-600 font-semibold">Date</th>
                      <th className="px-1.5 py-1 text-left text-gray-600 font-semibold">Invoice #</th>
                      <th className="px-1.5 py-1 text-right text-gray-600 font-semibold">Gross</th>
                      <th className="px-1.5 py-1 text-right text-red-600 font-semibold">Reject</th>
                      <th className="px-1.5 py-1 text-right text-blue-600 font-semibold">MRP</th>
                      <th className="px-1.5 py-1 text-right text-orange-600 font-semibold">Comm.</th>
                      <th className="px-1.5 py-1 text-right text-green-600 font-semibold">Payable</th>
                      <th className="px-1.5 py-1 text-right text-purple-600 font-semibold">Paid</th>
                      <th className="px-1.5 py-1 text-right text-blue-800 font-bold">Net Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSelectedInvoicesData().map((inv, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="px-1.5 py-1 text-center text-gray-500">{inv.serialNum}</td>
                        <td className="px-1.5 py-1 text-left text-gray-700 text-[10px] whitespace-nowrap">{inv.dispatchDate}</td>
                        <td className="px-1.5 py-1 text-left font-medium text-gray-800 text-[10px] whitespace-nowrap">{inv.invoiceNumber}</td>
                        <td className="px-1.5 py-1 text-right text-gray-700">₹{inv.grossValue.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-red-600">-₹{inv.rejections.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-blue-600">₹{inv.totalMrpValue.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-orange-600">-₹{inv.commission.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-green-600">₹{inv.amountPayable.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-purple-600">₹{inv.paidAmount.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right font-semibold text-blue-800">₹{inv.netReceivable.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-green-100 font-bold sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="px-1.5 py-1.5 text-right text-green-800 text-xs">TOTAL:</td>
                      <td className="px-1.5 py-1.5 text-right text-gray-800">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.grossValue, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-red-700">
                        -₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.rejections, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-blue-700">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.totalMrpValue, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-orange-700">
                        -₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.commission, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-green-700">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.amountPayable, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-purple-700">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.paidAmount, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-blue-800 text-sm font-bold">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.netReceivable, 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {/* Footer with Net Receivable highlight */}
              <div className="px-3 py-2 border-t bg-gray-50">
                <div className="flex flex-col md:flex-row items-center justify-between gap-2">
                  <div className="text-center md:text-left">
                    <span className="text-xs text-gray-600">Net Receivable: </span>
                    <span className="text-lg font-bold text-blue-700">
                      ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.netReceivable, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowPaymentSummaryPreview(false)}>
                      Back
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => {
                        exportPaymentSummary();
                        setShowPaymentSummaryPreview(false);
                        setShowPaymentSummaryModal(false);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Download size={14} className="mr-1" /> Download CSV
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT AUDIT MODAL ==================== */}
        {showPaymentAuditModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-red-50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-red-600" size={20} />
                  <h3 className="text-lg font-semibold text-red-800">Payment Audit</h3>
                  {paymentAuditData?.retailer && (
                    <span className="text-sm text-red-600">- {paymentAuditData.retailer.name}</span>
                  )}
                </div>
                <button onClick={() => { setShowPaymentAuditModal(false); setPaymentAuditData(null); }} className="p-1 hover:bg-red-100 rounded">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                {paymentAuditLoading ? (
                  <div className="text-center py-12 text-gray-500">
                    <RefreshCw size={32} className="mx-auto mb-3 animate-spin" />
                    <p>Loading payment data...</p>
                  </div>
                ) : !paymentAuditData ? (
                  <div className="text-center py-12 text-gray-500">
                    <AlertTriangle size={40} className="mx-auto mb-3 opacity-50" />
                    <p>No payment data found</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-500">Total Payments</p>
                          <p className="text-xl font-bold text-gray-800">{paymentAuditData.total_payments_count}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total Amount</p>
                          <p className="text-xl font-bold text-green-700">₹{paymentAuditData.total_amount?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Linked to Invoice</p>
                          <p className="text-xl font-bold text-blue-700">
                            {paymentAuditData.payments?.filter(p => p.linked_invoice).length || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Orphan Payments</p>
                          <p className="text-xl font-bold text-red-700">
                            {paymentAuditData.payments?.filter(p => !p.linked_invoice).length || 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Warning for orphan payments */}
                    {paymentAuditData.payments?.some(p => !p.linked_invoice) && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                        <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
                        <div className="text-sm text-red-700">
                          <span className="font-medium">Orphan payments detected!</span> These payments are not linked to any invoice 
                          and may cause discrepancies in the retailer's dashboard summary. Review and delete if necessary.
                        </div>
                      </div>
                    )}

                    {/* Payments Table */}
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-2 text-center text-gray-600">#</th>
                            <th className="p-2 text-left text-gray-600">Payment Date</th>
                            <th className="p-2 text-right text-gray-600">Amount</th>
                            <th className="p-2 text-left text-gray-600">Mode</th>
                            <th className="p-2 text-left text-gray-600">Linked Invoice</th>
                            <th className="p-2 text-center text-gray-600">Status</th>
                            <th className="p-2 text-center text-gray-600">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentAuditData.payments?.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-gray-400">No payments found</td>
                            </tr>
                          ) : paymentAuditData.payments?.map((payment, idx) => {
                            const isOrphan = !payment.linked_invoice;
                            return (
                              <tr key={payment.id} className={`border-t ${isOrphan ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                                <td className="p-2 text-left">
                                  {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-IN', {
                                    day: '2-digit', month: 'short', year: 'numeric'
                                  }) : '-'}
                                  {payment.created_at && (
                                    <div className="text-[10px] text-gray-400">
                                      Created: {new Date(payment.created_at).toLocaleString('en-IN')}
                                    </div>
                                  )}
                                </td>
                                <td className={`p-2 text-right font-medium ${isOrphan ? 'text-red-700' : 'text-green-700'}`}>
                                  ₹{payment.amount?.toLocaleString()}
                                </td>
                                <td className="p-2 text-left text-gray-600">{payment.payment_mode || '-'}</td>
                                <td className="p-2 text-left">
                                  {payment.linked_invoice ? (
                                    <div>
                                      <span className="font-medium text-blue-700">{payment.invoice_number}</span>
                                      <div className="text-[10px] text-gray-400">
                                        Net: ₹{payment.linked_invoice.net_payable?.toLocaleString()}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-red-600 font-medium">NOT LINKED</span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {isOrphan ? (
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                      ORPHAN
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      OK
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deletePaymentFromAudit(payment.id)}
                                    disabled={deletingPaymentId === payment.id}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-100"
                                    title="Delete this payment"
                                  >
                                    {deletingPaymentId === payment.id ? (
                                      <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowPaymentAuditModal(false); setPaymentAuditData(null); }}>
                  Close
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => loadPaymentAudit(paymentAuditRetailerId)}
                  disabled={paymentAuditLoading}
                  className="text-blue-700"
                >
                  <RefreshCw size={14} className={`mr-1 ${paymentAuditLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== INDENT MODAL ==================== */}
        {showIndentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Create Indent for Retailer</h3>
                <button onClick={() => { setShowIndentModal(false); resetIndentForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateOrUpdateIndent} className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Retailer (Shop) *</label>
                    <Input
                      type="text"
                      value={retailerSearch || retailers.find(r => r.id === indentForm.retailer_id)?.company_name || retailers.find(r => r.id === indentForm.retailer_id)?.name || ''}
                      onChange={(e) => {
                        setRetailerSearch(e.target.value);
                        setShowRetailerDropdown(true);
                        if (!e.target.value) {
                          setIndentForm(prev => ({ ...prev, retailer_id: '' }));
                        }
                      }}
                      onFocus={() => {
                        setShowRetailerDropdown(true);
                        setRetailerSearch('');
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowRetailerDropdown(false), 200);
                      }}
                      placeholder="Search shop name..."
                      className="w-full h-9"
                      required
                    />
                    {showRetailerDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {filteredRetailers.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">No retailers found</div>
                        ) : (
                          filteredRetailers.map(r => (
                            <div
                              key={r.id}
                              className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleRetailerSelectForIndent(r);
                              }}
                            >
                              <div className="font-medium">{r.company_name || r.name}</div>
                              {r.contact_person && <div className="text-xs text-gray-400">Owner: {r.contact_person}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <Input
                      type="date"
                      value={indentForm.indent_date}
                      onChange={(e) => setIndentForm(prev => ({ ...prev, indent_date: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Items *</label>
                    <div className="flex gap-2">
                      {!editingIndent && (
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline" 
                          onClick={() => loadPreviousRetailerIndent()}
                          className="border-blue-300 text-blue-600 hover:bg-blue-50"
                        >
                          <Clock size={14} className="mr-1" /> Load Previous
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={addIndentItem}>
                        <Plus size={14} className="mr-1" /> Add Item
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {indentForm.items.map((item, index) => {
                      // Get display name based on language - look up from productMap if needed
                      let displayProductName = item.product_name || '';
                      if (i18n.language === 'hi') {
                        if (item.product_name_hi) {
                          displayProductName = item.product_name_hi;
                        } else if (item.product_id) {
                          const p = productMap.get(item.product_id);
                          if (p && p.name_hi) displayProductName = p.name_hi;
                        } else if (item.product_name) {
                          const p = productMap.get(item.product_name);
                          if (p && p.name_hi) displayProductName = p.name_hi;
                        }
                      }
                      
                      return (
                      <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                        {/* Product Search */}
                        <div className="flex-1 relative">
                          <Input
                            type="text"
                            value={displayProductName}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setIndentForm(prev => {
                                const items = [...prev.items];
                                items[index] = { ...items[index], product_name: newValue, product_id: '', product_name_hi: '' };
                                return { ...prev, items };
                              });
                              setShowProductDropdown(index);
                              setProductSearch(newValue);
                            }}
                            onFocus={() => {
                              setShowProductDropdown(index);
                              setProductSearch(item.product_name || '');
                            }}
                            onBlur={() => {
                              // Delay hiding to allow click on dropdown items
                              setTimeout(() => setShowProductDropdown(null), 200);
                            }}
                            placeholder="Search product..."
                            className="h-9 text-sm"
                            required
                          />
                          {showProductDropdown === index && (
                            <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto">
                              {filteredProducts.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">No products found</div>
                              ) : (
                                filteredProducts.slice(0, 12).map(p => {
                                  const displayName = i18n.language === 'hi' && p.name_hi ? p.name_hi : p.name;
                                  return (
                                    <div
                                      key={p.id}
                                      className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault(); // Prevent blur from firing before click
                                        setIndentForm(prev => {
                                          const items = [...prev.items];
                                          items[index] = { ...items[index], product_id: p.id, product_name: p.name, product_name_hi: p.name_hi };
                                          return { ...prev, items };
                                        });
                                        setShowProductDropdown(null);
                                        setProductSearch('');
                                      }}
                                    >
                                      {displayName}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                        {/* Variant Search */}
                        <div className="w-36 relative">
                          <Input
                            type="text"
                            value={item.variant_name || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setIndentForm(prev => {
                                const items = [...prev.items];
                                items[index] = { ...items[index], variant_name: newValue, variant_id: '' };
                                return { ...prev, items };
                              });
                              setShowVariantDropdown(index);
                              setVariantSearch(newValue);
                            }}
                            onFocus={() => {
                              setShowVariantDropdown(index);
                              setVariantSearch(item.variant_name || '');
                            }}
                            onBlur={() => {
                              setTimeout(() => setShowVariantDropdown(null), 200);
                            }}
                            placeholder="Variant"
                            className="h-9 text-sm"
                          />
                          {showVariantDropdown === index && (
                            <div className="absolute z-20 w-48 mt-1 bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto">
                              {filteredVariants.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">No variants found</div>
                              ) : (
                                filteredVariants.slice(0, 12).map(p => (
                                  <div
                                    key={p.id}
                                    className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setIndentForm(prev => {
                                        const items = [...prev.items];
                                        items[index] = { ...items[index], variant_id: p.id, variant_name: p.name };
                                        return { ...prev, items };
                                      });
                                      setShowVariantDropdown(null);
                                      setVariantSearch('');
                                    }}
                                  >
                                    {p.name}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(e) => updateIndentItem(index, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                          placeholder="Qty"
                          className="w-20 h-9"
                          required
                        />
                        {indentForm.items.length > 1 && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeIndentItem(index)}>
                            <X size={14} className="text-red-600" />
                          </Button>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowIndentModal(false); setEditingIndent(null); resetIndentForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">{editingIndent ? 'Update Indent' : 'Create Indent'}</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== DISPATCH MODAL ==================== */}
        {showDispatchModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">
                    {editingDispatch ? 'Edit Dispatch' : `Dispatch to ${selectedIndent?.retailer_name}`}
                  </h3>
                  {selectedIndent && <p className="text-sm text-gray-500">Indent: {formatDate(selectedIndent?.indent_date)}</p>}
                </div>
                <button onClick={() => { setShowDispatchModal(false); setSelectedIndent(null); setEditingDispatch(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateOrUpdateDispatch} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date *</label>
                  <Input
                    type="date"
                    value={dispatchForm.dispatch_date}
                    onChange={async (e) => {
                      const newDate = e.target.value;
                      setDispatchForm(prev => ({ ...prev, dispatch_date: newDate }));
                      
                      // Reload MRP for the new date
                      try {
                        const mrpRes = await api.get(`/api/daily-mrp/for-dispatch?date=${newDate}`);
                        const mrpMap = mrpRes.data || {};
                        
                        let filledCount = 0;
                        setDispatchForm(prev => ({
                          ...prev,
                          items: prev.items.map(item => {
                            const mrpKey = `${item.product_id}_${item.variant_id || ''}`;
                            const mrpValue = mrpMap[mrpKey];
                            if (mrpValue && mrpValue > 0) {
                              filledCount++;
                              return {
                                ...item,
                                mrp: mrpValue,
                                total_value: (item.supplied_qty || 0) * mrpValue
                              };
                            }
                            return item;
                          })
                        }));
                        
                        if (filledCount > 0) {
                          toast.success(`Auto-filled MRP for ${filledCount} items from ${newDate}`);
                        }
                      } catch (error) {
                        console.error('Failed to fetch MRP for date:', error);
                      }
                    }}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Items (MRP is mandatory)</label>
                    {!editingDispatch && selectedIndent && (
                      <Button 
                        type="button"
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setDispatchForm(prev => ({
                            ...prev,
                            items: prev.items.map(item => ({
                              ...item,
                              supplied_qty: item.indent_qty  // Fill with indent qty
                            }))
                          }));
                        }}
                        className="text-xs"
                      >
                        Fill All Quantities
                      </Button>
                    )}
                    <Button 
                      type="button"
                      size="sm" 
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await api.get('/api/retailer-dispatches/yesterday-mrp');
                          const mrpMap = {};
                          response.data.forEach(item => {
                            const key = `${item.product_id}|${item.variant_id || ''}`;
                            mrpMap[key] = item.mrp;
                          });
                          
                          let filledCount = 0;
                          setDispatchForm(prev => ({
                            ...prev,
                            items: prev.items.map(item => {
                              const key = `${item.product_id}|${item.variant_id || ''}`;
                              if (mrpMap[key] && mrpMap[key] > 0) {
                                filledCount++;
                                return { 
                                  ...item, 
                                  mrp: mrpMap[key],
                                  total_value: (item.supplied_qty || 0) * mrpMap[key]
                                };
                              }
                              return item;
                            })
                          }));
                          
                          if (filledCount > 0) {
                            toast.success(`Filled MRP for ${filledCount} items from yesterday`);
                          } else {
                            toast.info('No matching MRP found from yesterday\'s dispatches');
                          }
                        } catch (error) {
                          toast.error('Failed to fetch yesterday\'s MRP');
                        }
                      }}
                      className="text-xs"
                      title="Fill MRP from yesterday's dispatches for matching products and variants"
                    >
                      Fill Yesterday's MRP
                    </Button>
                  </div>
                  <div className="border rounded overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: '700px' }}>
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Product</th>
                          <th className="p-2 text-center">Variant</th>
                          <th className="p-2 text-center">Indent Qty</th>
                          <th className="p-2 text-center">Supply Qty</th>
                          <th className="p-2 text-center">MRP *</th>
                          <th className="p-2 text-right">Total</th>
                          {editingDispatch && <th className="p-2 text-center w-10"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {dispatchForm.items.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-2">{getProductName(item)}</td>
                            <td className="p-2 text-center">
                              <select
                                value={item.variant_id || ''}
                                onChange={async (e) => {
                                  const variant = packagings.find(p => p.id === e.target.value);
                                  updateDispatchItem(index, 'variant_id', e.target.value);
                                  updateDispatchItem(index, 'variant_name', variant?.name || '');
                                  
                                  // Lookup MRP for the new variant
                                  try {
                                    const mrpRes = await api.get(`/api/daily-mrp/for-dispatch?date=${dispatchForm.dispatch_date}`);
                                    const mrpMap = mrpRes.data || {};
                                    const mrpKey = `${item.product_id}_${e.target.value || ''}`;
                                    const mrpValue = mrpMap[mrpKey];
                                    if (mrpValue && mrpValue > 0) {
                                      updateDispatchItem(index, 'mrp', mrpValue);
                                      toast.info(`MRP auto-filled: ₹${mrpValue}`);
                                    }
                                  } catch (error) {
                                    console.error('Failed to fetch MRP for variant:', error);
                                  }
                                }}
                                className="w-28 h-7 text-xs border rounded px-1"
                              >
                                <option value="">Select</option>
                                {packagings.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-center text-gray-500">{item.indent_qty}</td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                value={item.supplied_qty || ''}
                                onChange={(e) => updateDispatchItem(index, 'supplied_qty', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                                className="w-20 h-7 text-center mx-auto"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.mrp || ''}
                                onChange={(e) => updateDispatchItem(index, 'mrp', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                                className="w-24 h-7 text-center mx-auto"
                                placeholder="₹ MRP"
                                required
                              />
                            </td>
                            <td className="p-2 text-right font-medium">{formatCurrency(item.total_value)}</td>
                            {editingDispatch && (
                              <td className="p-2 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                                  onClick={() => {
                                    if (dispatchForm.items.length > 1) {
                                      setDispatchForm(prev => ({
                                        ...prev,
                                        items: prev.items.filter((_, i) => i !== index)
                                      }));
                                    } else {
                                      toast.error('Cannot delete the last item');
                                    }
                                  }}
                                  title="Delete this item"
                                >
                                  <X size={14} />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td colSpan={editingDispatch ? 6 : 5} className="p-2 text-right">Total MRP Value:</td>
                          <td className="p-2 text-right">{formatCurrency(dispatchForm.items.reduce((sum, i) => sum + i.total_value, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transport Charges (Optional)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={dispatchForm.transport_charges || ''}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, transport_charges: parseFloat(e.target.value) || 0 }))}
                      placeholder="₹ 0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                    <Input
                      type="text"
                      value={dispatchForm.remarks}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, remarks: e.target.value }))}
                      placeholder="Optional remarks"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowDispatchModal(false); setSelectedIndent(null); setEditingDispatch(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">
                    {editingDispatch ? 'Update Dispatch' : 'Create Dispatch'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== INVOICE MODAL ==================== */}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Create Invoice</h3>
                  <p className="text-sm text-gray-500">Select items to include in this invoice</p>
                </div>
                <button onClick={() => { setShowInvoiceModal(false); setSelectedItemIds([]); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateInvoice} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
                  <Input
                    type="date"
                    value={invoiceForm.invoice_date}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      Select Items ({selectedItemIds.length} selected)
                    </label>
                    {uninvoicedItems.length > 0 && (
                      <Button type="button" variant="outline" size="sm" onClick={selectAllItems}>
                        Select All
                      </Button>
                    )}
                  </div>
                  {uninvoicedItems.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No uninvoiced items found for this retailer</p>
                  ) : (
                    <div className="border rounded max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 w-8 text-center">
                              <Check size={14} />
                            </th>
                            <th className="p-2 text-left">Dispatch Date</th>
                            <th className="p-2 text-left">Product</th>
                            <th className="p-2 text-center">Supplied</th>
                            <th className="p-2 text-center text-red-600">Rejected</th>
                            <th className="p-2 text-center text-green-700 font-semibold">Net Qty</th>
                            <th className="p-2 text-right">MRP</th>
                            <th className="p-2 text-right">Net Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uninvoicedItems.map((item) => (
                            <tr 
                              key={item.item_id} 
                              className={`border-t cursor-pointer hover:bg-gray-50 ${selectedItemIds.includes(item.item_id) ? 'bg-green-50' : ''} ${item.rejected_qty > 0 ? 'bg-red-50/30' : ''}`}
                              onClick={() => toggleItemSelection(item.item_id)}
                            >
                              <td className="p-2 text-center">
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                  selectedItemIds.includes(item.item_id) ? 'bg-[#14532D] border-[#14532D]' : 'border-gray-300'
                                }`}>
                                  {selectedItemIds.includes(item.item_id) && <Check size={12} className="text-white" />}
                                </div>
                              </td>
                              <td className="p-2 text-xs text-gray-600">{formatDate(item.dispatch_date)}</td>
                              <td className="p-2">
                                <div className="font-medium">{getProductName(item)}</div>
                                {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                              </td>
                              <td className="p-2 text-center">{item.supplied_qty}</td>
                              <td className="p-2 text-center text-red-600 font-medium">
                                {item.rejected_qty > 0 ? `-${item.rejected_qty}` : '-'}
                              </td>
                              <td className="p-2 text-center text-green-700 font-bold">{item.net_qty}</td>
                              <td className="p-2 text-right">₹{item.mrp?.toFixed(2)}</td>
                              <td className="p-2 text-right font-medium">₹{item.net_value?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {selectedItemIds.length > 0 && (
                  <div className="bg-green-50 p-4 rounded space-y-2 border border-green-200">
                    {(() => {
                      const selectedItems = uninvoicedItems.filter(i => selectedItemIds.includes(i.item_id));
                      const grossTotal = selectedItems.reduce((sum, i) => sum + (i.supplied_qty * (i.mrp || 0)), 0);
                      const rejectedDeduction = selectedItems.reduce((sum, i) => sum + ((i.rejected_qty || 0) * (i.mrp || 0)), 0);
                      const netTotal = selectedItems.reduce((sum, i) => sum + (i.net_value || 0), 0);
                      const retailer = retailers.find(r => r.id === invoiceForm.retailer_id);
                      const commissionPct = retailer?.commission_percentage || 0;
                      const commissionAmt = (netTotal * commissionPct) / 100;
                      const payableAmount = netTotal - commissionAmt;
                      
                      return (
                        <>
                          <div className="text-sm font-semibold text-gray-700 mb-2">Invoice Summary</div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Selected Items:</span>
                            <span className="font-medium">{selectedItemIds.length}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Gross Total (MRP Value):</span>
                            <span className="font-medium">{formatCurrency(grossTotal)}</span>
                          </div>
                          {rejectedDeduction > 0 && (
                            <div className="flex justify-between items-center text-sm text-red-600">
                              <span>(-) Rejected Items:</span>
                              <span>-{formatCurrency(rejectedDeduction)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                            <span className="text-gray-700 font-medium">Net Total:</span>
                            <span className="font-bold">{formatCurrency(netTotal)}</span>
                          </div>
                          {commissionPct > 0 && (
                            <div className="flex justify-between items-center text-sm text-amber-700">
                              <span>(-) Commission ({commissionPct}%):</span>
                              <span className="font-medium">-{formatCurrency(commissionAmt)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm border-t pt-2 mt-2 bg-green-100 -mx-4 px-4 py-2 rounded-b">
                            <span className="text-green-800 font-bold">Amount Payable by Retailer:</span>
                            <span className="text-green-800 font-bold text-lg">{formatCurrency(payableAmount)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowInvoiceModal(false); setSelectedItemIds([]); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]" disabled={selectedItemIds.length === 0}>
                    Create Invoice ({selectedItemIds.length})
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== EDIT INVOICE MODAL ==================== */}
        {showEditInvoiceModal && editingInvoice && editInvoiceForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Edit Invoice - {editingInvoice.invoice_number}</h3>
                  <p className="text-sm text-gray-500">Update invoice details</p>
                </div>
                <button onClick={() => { setShowEditInvoiceModal(false); setEditingInvoice(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateInvoice} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                  <Input
                    type="date"
                    value={editInvoiceForm.invoice_date}
                    onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Items</label>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Product</th>
                          <th className="p-2 text-center w-24">Qty</th>
                          <th className="p-2 text-center w-28">MRP</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editInvoiceForm.items.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">
                              <div className="font-medium">{getProductName(item)}</div>
                              {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.quantity || item.supplied_qty || ''}
                                onChange={(e) => updateEditInvoiceItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-20 h-8 text-center"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.mrp || ''}
                                onChange={(e) => updateEditInvoiceItem(idx, 'mrp', parseFloat(e.target.value) || 0)}
                                className="w-24 h-8 text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-medium">
                              ₹{(item.total_value || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="p-2 text-right font-medium">Total:</td>
                          <td className="p-2 text-right font-bold">
                            ₹{editInvoiceForm.items.reduce((sum, i) => sum + (i.total_value || 0), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    type="text"
                    value={editInvoiceForm.remarks || ''}
                    onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                {/* Payment History Section (only show if there are payments) */}
                {(editingInvoice.paid_amount > 0 || editInvoicePayments.length > 0) && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <CreditCard size={16} className="text-green-600" />
                        Payment History
                      </h4>
                      <span className="text-sm text-green-600 font-medium">
                        Paid: {formatCurrency(editingInvoice.paid_amount || 0)}
                      </span>
                    </div>
                    {editInvoicePaymentsLoading ? (
                      <div className="text-center py-3 text-gray-500 text-sm">Loading payments...</div>
                    ) : editInvoicePayments.length === 0 ? (
                      <div className="text-center py-3 text-gray-500 bg-gray-50 rounded-lg text-sm">No payments recorded</div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {editInvoicePayments.map((payment, idx) => (
                          <div key={payment.id || idx} className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-green-700">{formatCurrency(payment.amount)}</span>
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 uppercase">{payment.payment_mode}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600">
                                  <div><span className="text-gray-500">Date:</span> {formatDate(payment.payment_date)}</div>
                                  <div><span className="text-gray-500">By:</span> {payment.received_by_name || '-'}</div>
                                  {payment.reference_number && (
                                    <div className="col-span-2"><span className="text-gray-500">Ref:</span> {payment.reference_number}</div>
                                  )}
                                  {payment.remarks && (
                                    <div className="col-span-2"><span className="text-gray-500">Remarks:</span> {payment.remarks}</div>
                                  )}
                                </div>
                              </div>
                              <Button 
                                type="button"
                                size="sm" 
                                variant="ghost" 
                                className="text-red-500 hover:bg-red-50 h-7 w-7 p-0 flex-shrink-0"
                                onClick={() => handleDeletePaymentFromEditModal(payment.id)}
                                title="Delete Payment"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add Payment button if there's pending amount */}
                    {((editingInvoice.net_payable || 0) - (editingInvoice.paid_amount || 0)) > 0 && (
                      <Button 
                        type="button"
                        variant="outline"
                        className="w-full mt-3 text-green-600 border-green-300 hover:bg-green-50"
                        onClick={() => {
                          setShowEditInvoiceModal(false);
                          openInvoicePaymentModal(editingInvoice);
                        }}
                      >
                        <IndianRupee size={14} className="mr-1" /> Add Payment ({formatCurrency((editingInvoice.net_payable || 0) - (editingInvoice.paid_amount || 0))} pending)
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowEditInvoiceModal(false); setEditingInvoice(null); setEditInvoicePayments([]); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">
                    Update Invoice
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== REJECTION MODAL ==================== */}
        {showRejectionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-3 sm:p-4 border-b flex-shrink-0">
                <h3 className="text-base sm:text-lg font-semibold">Record Rejection</h3>
                <button onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                  <select
                    value={rejectionForm.retailer_id}
                    onChange={(e) => setRejectionForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">Select Retailer</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <Input
                    type="date"
                    value={rejectionForm.rejection_date}
                    onChange={(e) => setRejectionForm(prev => ({ ...prev, rejection_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Dispatch Items for selected date/retailer */}
                {rejectionForm.retailer_id && rejectionForm.rejection_date && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Dispatch Items for {formatDate(rejectionForm.rejection_date)}
                    </label>
                    {rejectionDispatchItems.length === 0 ? (
                      <div className="p-4 bg-gray-50 rounded text-sm text-gray-500 text-center">
                        No dispatches found for this date
                      </div>
                    ) : (
                      <div className="border rounded overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[500px]">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="p-2 text-center w-8">
                                <Check size={14} />
                              </th>
                              <th className="p-2 text-left min-w-[120px]">Product</th>
                              <th className="p-2 text-center w-16">Supplied</th>
                              <th className="p-2 text-center w-24">Previous Rej.</th>
                              <th className="p-2 text-center w-20">New Reject</th>
                              <th className="p-2 text-center w-16">MRP</th>
                              <th className="p-2 text-left min-w-[130px]">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rejectionDispatchItems.map((item, idx) => (
                              <React.Fragment key={idx}>
                                <tr className={`border-t ${item.selected ? 'bg-red-50' : ''}`}>
                                  <td className="p-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={item.selected}
                                      onChange={(e) => updateRejectionItem(idx, 'selected', e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <div className="font-medium text-sm">{getProductName(item)}</div>
                                    {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                                  </td>
                                  <td className="p-2 text-center text-gray-600 text-sm">{item.supplied_qty}</td>
                                  <td className="p-2 text-center">
                                    {item.total_previous_qty > 0 ? (
                                      <div className="text-xs">
                                        <span className="font-medium text-red-600">{item.total_previous_qty}</span>
                                        <button
                                          type="button"
                                          className="ml-1 text-blue-600 hover:text-blue-800 underline"
                                          onClick={() => {
                                            setRejectionDispatchItems(prev => prev.map((it, i) => 
                                              i === idx ? {...it, showHistory: !it.showHistory} : it
                                            ));
                                          }}
                                        >
                                          ({item.previous_rejections?.length || 0} entries)
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">None</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={item.supplied_qty - item.total_previous_qty}
                                      value={item.rejection_qty || ''}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const maxAllowed = item.supplied_qty - item.total_previous_qty;
                                        if (val > maxAllowed) {
                                          setRejectionErrorDialog({
                                            open: true,
                                            title: 'Rejection Limit Exceeded',
                                            message: `Cannot exceed remaining quantity (${maxAllowed}).\n\nSupplied: ${item.supplied_qty}\nAlready rejected: ${item.total_previous_qty}\nRemaining: ${maxAllowed}`
                                          });
                                          return;
                                        }
                                        updateRejectionItem(idx, 'rejection_qty', val);
                                        if (val > 0) updateRejectionItem(idx, 'selected', true);
                                      }}
                                      className="w-16 h-7 text-center text-sm"
                                      disabled={!item.selected && !item.rejection_qty}
                                    />
                                  </td>
                                  <td className="p-2 text-center text-gray-600 text-sm">₹{item.mrp}</td>
                                  <td className="p-2">
                                    <select
                                      value={item.reason || ''}
                                      onChange={(e) => updateRejectionItem(idx, 'reason', e.target.value)}
                                      className="w-full min-w-[110px] h-8 px-2 rounded border text-sm"
                                      disabled={!item.selected}
                                    >
                                      <option value="">Select Reason</option>
                                      <option value="Rotten">Rotten</option>
                                      <option value="Damaged">Damaged</option>
                                      <option value="Quality Issue">Quality Issue</option>
                                      <option value="Expired">Expired</option>
                                      <option value="Other">Other</option>
                                    </select>
                                  </td>
                                </tr>
                                {/* Rejection History Row */}
                                {item.showHistory && item.previous_rejections?.length > 0 && (
                                  <tr className="bg-amber-50">
                                    <td colSpan="7" className="p-2 pl-10">
                                      <div className="text-xs">
                                        <div className="font-medium text-amber-800 mb-1">Rejections for this date:</div>
                                        <div className="space-y-1">
                                          {item.previous_rejections.map((rej, rIdx) => (
                                            <div key={rIdx} className="flex flex-wrap gap-2 sm:gap-4 text-gray-600 py-1 border-b border-amber-100 last:border-0">
                                              <span className="font-medium text-red-600">{rej.quantity} units</span>
                                              <span>₹{rej.rejection_value?.toFixed(2)}</span>
                                              <span className="text-gray-500">{rej.reason}</span>
                                              {rej.created_at && (
                                                <span className="text-gray-400 text-[10px] italic">
                                                  (Recorded: {new Date(rej.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(rej.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        <div className="mt-1 pt-1 border-t border-amber-200 font-medium text-amber-800">
                                          Total for this date: {item.total_previous_qty} units (₹{item.total_previous_value?.toFixed(2)})
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Remarks for all rejections */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (Optional)</label>
                  <Input
                    type="text"
                    value={rejectionForm.remarks || ''}
                    onChange={(e) => {
                      // Update remarks for all selected items
                      const remarks = e.target.value;
                      setRejectionForm(prev => ({ ...prev, remarks }));
                      setRejectionDispatchItems(prev => prev.map(item => 
                        item.selected ? { ...item, remarks } : item
                      ));
                    }}
                    placeholder="Enter remarks for rejections"
                  />
                </div>
              </div>
              
              {/* Sticky footer buttons */}
              <div className="flex gap-2 p-3 sm:p-4 border-t bg-white flex-shrink-0">
                <Button type="button" variant="outline" onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  type="button"
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!rejectionDispatchItems.some(i => i.selected && i.rejection_qty > 0)}
                  onClick={handleCreateRejections}
                >
                  Record Rejections ({rejectionDispatchItems.filter(i => i.selected && i.rejection_qty > 0).length})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT MODAL ==================== */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Record Payment</h3>
                <button onClick={() => { setShowPaymentModal(false); resetPaymentForm(); setPaymentRetailerSearch(''); setShowPaymentRetailerDropdown(false); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreatePayment} className="p-4 space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                  <Input
                    type="text"
                    value={paymentRetailerSearch || retailers.find(r => r.id === paymentForm.retailer_id)?.company_name || retailers.find(r => r.id === paymentForm.retailer_id)?.name || ''}
                    onChange={(e) => {
                      setPaymentRetailerSearch(e.target.value);
                      setShowPaymentRetailerDropdown(true);
                      if (!e.target.value) {
                        setPaymentForm(prev => ({ ...prev, retailer_id: '' }));
                      }
                    }}
                    onFocus={() => {
                      setShowPaymentRetailerDropdown(true);
                      setPaymentRetailerSearch('');
                    }}
                    placeholder="Search retailer..."
                    className="w-full h-9"
                    required
                  />
                  {showPaymentRetailerDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredPaymentRetailers.length === 0 ? (
                        <div className="p-2 text-sm text-gray-500">No retailers found</div>
                      ) : (
                        filteredPaymentRetailers.map(r => (
                          <div
                            key={r.id}
                            className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                            onClick={() => {
                              setPaymentForm(prev => ({ ...prev, retailer_id: r.id }));
                              setPaymentRetailerSearch(r.company_name || r.name);
                              setShowPaymentRetailerDropdown(false);
                            }}
                          >
                            <div className="font-medium">{r.company_name || r.name}</div>
                            {r.contact_person && <div className="text-xs text-gray-500">{r.contact_person}</div>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <Input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Payment Context - Shows when retailer is selected */}
                {paymentContext && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="font-medium text-gray-700 mb-2">{paymentContext.retailer_name} - Account Summary</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-500">Total MRP Value:</span>
                        <span className="float-right font-medium">{formatCurrency(paymentContext.totalMrpValue)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Invoiced:</span>
                        <span className="float-right font-medium text-green-700">{formatCurrency(paymentContext.totalInvoiced)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Already Paid:</span>
                        <span className="float-right font-medium text-blue-600">{formatCurrency(paymentContext.totalPaid)}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t">
                        <span className="text-gray-700 font-medium">Pending Amount:</span>
                        <span className={`float-right font-bold text-lg ${paymentContext.pendingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(paymentContext.pendingAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={paymentForm.amount || ''}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value === '' ? '' : parseFloat(e.target.value) || '' }))}
                    placeholder={paymentContext ? `Pending: ₹${paymentContext.pendingAmount?.toFixed(2)}` : 'Enter amount'}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
                  <select
                    value={paymentForm.payment_mode}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                  <Input
                    value={paymentForm.reference_number}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                    placeholder="UPI ref / Cheque no / Transaction ID"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    value={paymentForm.remarks}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowPaymentModal(false); resetPaymentForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">Record Payment</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== INVOICE PAYMENT MODAL ==================== */}
        {showInvoicePaymentModal && selectedInvoiceForPayment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) { setShowInvoicePaymentModal(false); setSelectedInvoiceForPayment(null); }}}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col my-auto">
              <div className="flex items-center justify-between p-4 border-b bg-green-50 flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <IndianRupee size={20} className="text-green-600" />
                  Record Invoice Payment
                </h3>
                <button onClick={() => { setShowInvoicePaymentModal(false); setSelectedInvoiceForPayment(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleInvoicePayment} className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Invoice Summary */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice:</span>
                    <span className="font-semibold text-blue-600">{selectedInvoiceForPayment.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Retailer:</span>
                    <span className="font-medium">{getRetailerNameById(selectedInvoiceForPayment.retailer_id) || selectedInvoiceForPayment.retailer_name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600">Total Receivable:</span>
                    <span className="font-semibold">{formatCurrency(selectedInvoiceForPayment.net_payable)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Already Paid:</span>
                    <span className="font-medium">{formatCurrency(selectedInvoiceForPayment.paid_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-amber-700 font-medium">Pending Amount:</span>
                    <span className="text-amber-700 font-bold text-lg">
                      {formatCurrency((selectedInvoiceForPayment.net_payable || 0) - (selectedInvoiceForPayment.paid_amount || 0))}
                    </span>
                  </div>
                </div>
                
                {/* Show existing payments with timestamps if invoice has partial payments */}
                {(selectedInvoiceForPayment.paid_amount > 0) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                      <Clock size={14} /> Earlier Payments
                    </h4>
                    {loadingExistingPayments ? (
                      <p className="text-xs text-gray-500">Loading...</p>
                    ) : invoiceExistingPayments.length === 0 ? (
                      <p className="text-xs text-gray-500">No payment records found</p>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {invoiceExistingPayments.map((payment, idx) => (
                          <div key={payment.id || idx} className="bg-white border border-green-100 rounded p-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-green-700">{formatCurrency(payment.amount)}</span>
                              <span className="text-gray-500 uppercase text-[10px]">{payment.payment_mode}</span>
                            </div>
                            <div className="text-gray-600 mt-1">
                              <span>Paid on: {formatDate(payment.payment_date)}</span>
                              {payment.created_at && (
                                <span className="ml-2 text-gray-400">
                                  (Recorded: {new Date(payment.created_at).toLocaleString('en-IN', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })})
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                  <Input
                    type="date"
                    value={invoicePaymentForm.payment_date}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={invoicePaymentForm.amount}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
                  <select
                    value={invoicePaymentForm.payment_mode}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-gray-200"
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Received By *</label>
                  <select
                    value={invoicePaymentForm.received_by}
                    onChange={(e) => {
                      const selectedUser = staffUsers.find(u => u.id === e.target.value);
                      setInvoicePaymentForm(prev => ({ 
                        ...prev, 
                        received_by: e.target.value,
                        received_by_name: selectedUser ? (selectedUser.name || selectedUser.email) : ''
                      }));
                    }}
                    className="w-full h-10 px-3 rounded-md border border-gray-200"
                    required
                  >
                    <option value="">-- Select --</option>
                    {staffUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email} ({user.role === 'admin' ? 'Admin' : 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Reference Number - Only for non-cash payments */}
                {invoicePaymentForm.payment_mode !== 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reference Number <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={invoicePaymentForm.reference_number}
                      onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                      placeholder={
                        invoicePaymentForm.payment_mode === 'upi' ? 'UPI Transaction ID' :
                        invoicePaymentForm.payment_mode === 'bank_transfer' ? 'NEFT/IMPS/RTGS Reference' :
                        invoicePaymentForm.payment_mode === 'cheque' ? 'Cheque Number' :
                        'Transaction Reference'
                      }
                      required
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    value={invoicePaymentForm.remarks}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowInvoicePaymentModal(false); setSelectedInvoiceForPayment(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">
                    <Check size={14} className="mr-1" /> Record Payment
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT HISTORY MODAL (View/Edit Paid Invoices) ==================== */}
        {showPaymentHistoryModal && selectedInvoiceForHistory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) { setShowPaymentHistoryModal(false); setSelectedInvoiceForHistory(null); }}}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col my-auto">
              <div className="flex items-center justify-between p-4 border-b bg-blue-50 flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Eye size={20} className="text-blue-600" />
                  Payment Details
                </h3>
                <button onClick={() => { setShowPaymentHistoryModal(false); setSelectedInvoiceForHistory(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Invoice Summary */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice:</span>
                    <span className="font-semibold text-blue-600">{selectedInvoiceForHistory.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Retailer:</span>
                    <span className="font-medium">{getRetailerNameById(selectedInvoiceForHistory.retailer_id) || selectedInvoiceForHistory.retailer_name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600">Invoice Amount:</span>
                    <span className="font-semibold">{formatCurrency(selectedInvoiceForHistory.net_payable)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Total Paid:</span>
                    <span className="font-semibold">{formatCurrency(selectedInvoiceForHistory.paid_amount || 0)}</span>
                  </div>
                  {((selectedInvoiceForHistory.net_payable || 0) - (selectedInvoiceForHistory.paid_amount || 0)) > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Pending:</span>
                      <span className="font-medium">{formatCurrency((selectedInvoiceForHistory.net_payable || 0) - (selectedInvoiceForHistory.paid_amount || 0))}</span>
                    </div>
                  )}
                </div>

                {/* Payment History */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Payment History</h4>
                  {paymentHistoryLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading...</div>
                  ) : invoicePaymentHistory.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">No payments recorded</div>
                  ) : (
                    <div className="space-y-3">
                      {invoicePaymentHistory.map((payment, idx) => (
                        <div key={payment.id || idx} className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-lg font-bold text-green-700">{formatCurrency(payment.amount)}</span>
                              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 uppercase">{payment.payment_mode}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-blue-500 hover:bg-blue-50 h-7 w-7 p-0"
                                onClick={() => openEditPaymentModal(payment)}
                                title="Edit Payment"
                              >
                                <Edit2 size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-red-500 hover:bg-red-50 h-7 w-7 p-0"
                                onClick={() => handleDeletePaymentFromHistory(payment.id)}
                                title="Delete Payment"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                            <div>
                              <span className="text-gray-500">Date:</span>{' '}
                              <span className="font-medium">{formatDate(payment.payment_date)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Received By:</span>{' '}
                              <span className="font-medium">{payment.received_by_name || '-'}</span>
                            </div>
                            {payment.reference_number && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Reference:</span>{' '}
                                <span className="font-medium">{payment.reference_number}</span>
                              </div>
                            )}
                            {payment.remarks && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Remarks:</span>{' '}
                                <span className="font-medium">{payment.remarks}</span>
                              </div>
                            )}
                            {/* Show created_at timestamp */}
                            {payment.created_at && (
                              <div className="col-span-2 pt-1 border-t border-green-200 mt-1">
                                <span className="text-gray-500">Recorded:</span>{' '}
                                <span className="font-medium text-gray-700">
                                  {new Date(payment.created_at).toLocaleString('en-IN', { 
                                    dateStyle: 'medium', 
                                    timeStyle: 'short' 
                                  })}
                                </span>
                              </div>
                            )}
                            {/* Show updated_at timestamp if payment was edited */}
                            {payment.updated_at && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Last Updated:</span>{' '}
                                <span className="font-medium text-blue-600">
                                  {new Date(payment.updated_at).toLocaleString('en-IN', { 
                                    dateStyle: 'medium', 
                                    timeStyle: 'short' 
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add More Payment Button (if invoice still has pending amount) */}
                {((selectedInvoiceForHistory.net_payable || 0) - (selectedInvoiceForHistory.paid_amount || 0)) > 0 && (
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setShowPaymentHistoryModal(false);
                      openInvoicePaymentModal(selectedInvoiceForHistory);
                    }}
                  >
                    <IndianRupee size={14} className="mr-1" /> Add Payment
                  </Button>
                )}
              </div>
              <div className="p-4 border-t flex-shrink-0">
                <Button variant="outline" className="w-full" onClick={() => { setShowPaymentHistoryModal(false); setSelectedInvoiceForHistory(null); }}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== EDIT PAYMENT MODAL ==================== */}
        {showEditPaymentModal && editingPayment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Edit2 size={20} className="text-blue-600" />
                  Edit Payment
                </h3>
                <button onClick={() => { setShowEditPaymentModal(false); setEditingPayment(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleEditPayment} className="p-4 space-y-4">
                {/* Original Payment Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 font-medium mb-1">Editing Payment</p>
                  <p className="text-blue-600">
                    Original: {formatCurrency(editingPayment.amount)} on {formatDate(editingPayment.payment_date)}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Payment Amount *</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Enter payment amount"
                    value={editPaymentForm.amount}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, amount: e.target.value})}
                    className="w-full"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Payment Date *</label>
                  <Input
                    type="date"
                    value={editPaymentForm.payment_date}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_date: e.target.value})}
                    className="w-full"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Payment Mode *</label>
                  <select
                    value={editPaymentForm.payment_mode}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_mode: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                {editPaymentForm.payment_mode !== 'cash' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Reference Number *</label>
                    <Input
                      type="text"
                      placeholder="Transaction ID / Reference"
                      value={editPaymentForm.reference_number}
                      onChange={(e) => setEditPaymentForm({...editPaymentForm, reference_number: e.target.value})}
                      className="w-full"
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Remarks</label>
                  <Input
                    type="text"
                    placeholder="Optional notes"
                    value={editPaymentForm.remarks}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, remarks: e.target.value})}
                    className="w-full"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowEditPaymentModal(false); setEditingPayment(null); }}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                    <Save size={14} className="mr-1" /> Update Payment
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== AUTO INDENT MODAL ==================== */}
        {showAutoIndentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Zap size={20} className="text-purple-600" />
                  Auto Indent Creation
                </h3>
                <button onClick={() => setShowAutoIndentModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-sm text-gray-600 bg-purple-50 p-3 rounded-lg">
                  This will create an auto-generated indent based on the retailer's average sales from the last 7 identical weekdays + 10% buffer.
                </p>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Retailer *
                  </label>
                  <select
                    value={autoIndentRetailerId}
                    onChange={(e) => setAutoIndentRetailerId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">-- Choose a Retailer --</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Indent Date *
                  </label>
                  <Input
                    type="date"
                    value={autoIndentDate}
                    onChange={(e) => setAutoIndentDate(e.target.value)}
                    className="w-full"
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Select the date for which the indent should be created
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAutoIndentModal(false)} 
                    className="flex-1"
                    disabled={autoIndentLoading}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="button" 
                    onClick={handleAutoIndentCreation}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    disabled={autoIndentLoading || !autoIndentRetailerId}
                  >
                    {autoIndentLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Zap size={14} />
                        Generate Indent
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Rejection Error Dialog - Centered popup for validation errors */}
      <AlertDialog open={rejectionErrorDialog.open} onOpenChange={(open) => setRejectionErrorDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {rejectionErrorDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left whitespace-pre-line text-gray-700">
              {rejectionErrorDialog.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => setRejectionErrorDialog({ open: false, title: '', message: '' })}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
