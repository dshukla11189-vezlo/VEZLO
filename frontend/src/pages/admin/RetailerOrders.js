import React, { useEffect, useState, useCallback, useRef } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { 
  Plus, Package, Truck, AlertTriangle, DollarSign, 
  Edit, Trash2, X, ChevronDown, ChevronRight, FileText, Download, Check,
  Search, IndianRupee, ShoppingCart, CreditCard, TrendingUp, FileSpreadsheet
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
  
  const [loading, setLoading] = useState(true);
  const [expandedIndents, setExpandedIndents] = useState({});
  const [expandedInvoices, setExpandedInvoices] = useState({});

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

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await loadBaseData();
      await Promise.all([loadIndents(), loadDispatches(), loadInvoices(), loadRejections(), loadPayments()]);
      setLoading(false);
    };
    loadAll();
  }, [loadBaseData, loadIndents, loadDispatches, loadInvoices, loadRejections, loadPayments]);

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

  // Calculate dashboard stats whenever data changes
  useEffect(() => {
    const totalMrpValue = dispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);
    // Net Receivable should be based on INVOICES (after rejections and commission)
    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.net_payable || 0), 0);
    const totalPaymentsReceived = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
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
  }, [indents, dispatches, invoices, payments, rejections]);

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

  // ==================== DISPATCH HANDLERS ====================
  const openDispatchModal = (indent) => {
    setSelectedIndent(indent);
    setEditingDispatch(null);
    setDispatchForm({
      dispatch_date: new Date().toISOString().split('T')[0],
      items: indent.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        indent_qty: item.quantity,
        supplied_qty: '',  // Empty by default - user fills only what they dispatch
        mrp: 0,
        total_value: 0
      })),
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
  const openEditInvoiceModal = (invoice) => {
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
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update invoice');
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
            Phone: 8530418069
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
      
      // Flatten all items from dispatches for that day
      const items = [];
      dayDispatches.forEach(dispatch => {
        dispatch.items?.forEach(item => {
          items.push({
            dispatch_id: dispatch.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            supplied_qty: item.supplied_qty,
            mrp: item.mrp,
            rejection_qty: 0,
            reason: '',
            remarks: '',
            selected: false
          });
        });
      });
      
      setRejectionDispatchItems(items);
    } catch (error) {
      console.error('Failed to load dispatch items:', error);
      setRejectionDispatchItems([]);
    }
  }, [rejectionForm.retailer_id, rejectionForm.rejection_date]);

  useEffect(() => {
    if (showRejectionModal && rejectionForm.retailer_id && rejectionForm.rejection_date) {
      loadRejectionDispatchItems();
    }
  }, [showRejectionModal, loadRejectionDispatchItems, rejectionForm.retailer_id, rejectionForm.rejection_date]);

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
      toast.error('Please select items and enter rejection quantities');
      return;
    }
    
    // Validate rejection qty doesn't exceed supplied qty
    const invalidItems = selectedItems.filter(item => item.rejection_qty > item.supplied_qty);
    if (invalidItems.length > 0) {
      toast.error('Rejection quantity cannot exceed supplied quantity');
      return;
    }
    
    // Validate all selected items have a reason
    const noReasonItems = selectedItems.filter(item => !item.reason);
    if (noReasonItems.length > 0) {
      toast.error('Please select a reason for all rejected items');
      return;
    }

    try {
      // Create rejections for each selected item
      for (const item of selectedItems) {
        await api.post('/api/retailer-rejections', {
          retailer_id: rejectionForm.retailer_id,
          rejection_date: new Date(rejectionForm.rejection_date).toISOString(),
          product_id: item.product_id,
          product_name: item.product_name,
          variant_name: item.variant_name,
          quantity: item.rejection_qty,
          mrp: item.mrp,
          reason: item.reason,
          remarks: item.remarks || ''
        });
      }
      toast.success(`${selectedItems.length} rejection(s) recorded`);
      setShowRejectionModal(false);
      resetRejectionForm();
      loadRejections();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record rejections');
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

  const handleEditRejection = (rejection) => {
    setEditingRejection(rejection);
    setRejectionForm({
      retailer_id: rejection.retailer_id,
      rejection_date: rejection.rejection_date?.split('T')[0] || rejection.rejection_date,
      items: [{
        dispatch_id: rejection.dispatch_id || '',
        product_id: rejection.product_id,
        product_name: rejection.product_name,
        variant_id: rejection.variant_id || '',
        variant_name: rejection.variant_name || '',
        quantity: rejection.quantity,
        mrp: rejection.mrp,
        reason: rejection.reason || ''
      }]
    });
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

  // Helper function to get retailer display name (company_name or name)
  const getRetailerDisplayName = (retailer) => {
    return retailer?.company_name || retailer?.name || '-';
  };

  // Get retailer display name by ID
  const getRetailerNameById = (retailerId) => {
    const retailer = retailers.find(r => r.id === retailerId);
    return getRetailerDisplayName(retailer);
  };

  // Filter products based on search
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  // Filter variants based on search
  const filteredVariants = packagings.filter(p => 
    p.name?.toLowerCase().includes(variantSearch.toLowerCase())
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
    { id: 'indents', label: 'Indents', icon: Package, count: indents.length },
    { id: 'dispatches', label: 'Dispatches', icon: Truck, count: dispatches.length },
    { id: 'invoices', label: 'Invoices', icon: FileText, count: invoices.length },
    { id: 'rejections', label: 'Rejections', icon: AlertTriangle, count: rejections.length },
    { id: 'payments', label: 'Payments', icon: DollarSign, count: payments.length }
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
                      <tr><td colSpan={6} className="p-8 text-center text-gray-400">{indentDateFilter ? `No indents for ${indentDateFilter}` : 'No indents found'}</td></tr>
                    ) : filteredIndents.map(indent => (
                      <React.Fragment key={indent.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleIndentExpand(indent.id)}>
                          <td className="p-3 text-center">
                            {expandedIndents[indent.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3">{formatDate(indent.indent_date)}</td>
                          <td className="p-3 font-medium">{getRetailerNameById(indent.retailer_id) || indent.retailer_name}</td>
                          <td className="p-3 text-center">{indent.items?.length || 0}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              indent.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              indent.status === 'dispatched' ? 'bg-blue-100 text-blue-700' :
                              indent.status === 'received' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {indent.status}
                            </span>
                          </td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEditIndentModal(indent)}>
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              {indent.status === 'pending' && (
                                <Button size="sm" variant="outline" onClick={() => openDispatchModal(indent)}>
                                  <Truck size={14} className="mr-1" /> Dispatch
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleDeleteIndent(indent.id)}>
                                <Trash2 size={14} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expandedIndents[indent.id] && (
                          <tr className="bg-blue-50">
                            <td colSpan={6} className="p-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="p-2 text-left">Product</th>
                                    <th className="p-2 text-left">Variant</th>
                                    <th className="p-2 text-right">Quantity</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {indent.items?.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2">{item.product_name}</td>
                                      <td className="p-2">{item.variant_name || '-'}</td>
                                      <td className="p-2 text-right">{item.quantity}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                      <tr><td colSpan={10} className="p-8 text-center text-gray-400">{dispatchDateFilter ? `No dispatches for ${dispatchDateFilter}` : 'No dispatches found'}</td></tr>
                    ) : filteredDispatches.map(dispatch => (
                      <React.Fragment key={dispatch.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedDispatchId(expandedDispatchId === dispatch.id ? null : dispatch.id)}>
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
                            <td colSpan={10} className="p-0">
                              <div className="p-3 pl-8">
                                <table className="w-full text-xs border rounded">
                                  <thead className="bg-gray-100">
                                    <tr>
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
                                        <td className="p-2 font-medium">{item.product_name}</td>
                                        <td className="p-2 text-gray-600">{item.variant_name || '-'}</td>
                                        <td className="p-2 text-center">{item.indent_qty || '-'}</td>
                                        <td className="p-2 text-center font-semibold">{item.supplied_qty}</td>
                                        <td className="p-2 text-right">₹{item.mrp?.toFixed(2)}</td>
                                        <td className="p-2 text-right font-medium">₹{item.total_value?.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
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
                        <td colSpan={4} className="p-3 text-right">TOTAL:</td>
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
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Invoices</CardTitle>
              <div className="flex gap-2 items-center">
                <Button size="sm" variant="outline" onClick={exportInvoices} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
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
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE #</th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">GROSS VALUE</th>
                      <th className="p-3 text-right font-medium text-red-500">REJECTION</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET VALUE</th>
                      <th className="p-3 text-right font-medium text-green-600">COMMISSION</th>
                      <th className="p-3 text-right font-medium text-gray-500">RECEIVABLE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-gray-400">No invoices found</td></tr>
                    ) : invoices.map(invoice => (
                      <React.Fragment key={invoice.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleInvoiceExpand(invoice.id)}>
                          <td className="p-3">
                            {expandedInvoices[invoice.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3 font-medium text-blue-600">{invoice.invoice_number}</td>
                          <td className="p-3">{formatDate(invoice.invoice_date)}</td>
                          <td className="p-3 font-medium">{getRetailerNameById(invoice.retailer_id) || invoice.retailer_name}</td>
                          <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                          <td className="p-3 text-right">{formatCurrency(getInvoiceGrossValue(invoice))}</td>
                          <td className="p-3 text-right text-red-600">
                            {getInvoiceRejectionAmount(invoice) > 0 ? `-${formatCurrency(getInvoiceRejectionAmount(invoice))}` : '-'}
                          </td>
                          <td className="p-3 text-right">{formatCurrency(invoice.total_mrp_value)}</td>
                          <td className="p-3 text-right text-green-600">-{formatCurrency(invoice.commission_amount)} ({invoice.commission_percentage}%)</td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(invoice.net_payable)}</td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
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
                            <td colSpan={9} className="p-3">
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
                                        <td className="p-2">{item.product_name}</td>
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
                    ))}
                  </tbody>
                  {invoices.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={5} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(invoices.reduce((sum, i) => sum + getInvoiceGrossValue(i), 0))}</td>
                        <td className="p-3 text-right text-red-600">-{formatCurrency(invoices.reduce((sum, i) => sum + getInvoiceRejectionAmount(i), 0))}</td>
                        <td className="p-3 text-right">{formatCurrency(invoices.reduce((sum, i) => sum + (i.total_mrp_value || 0), 0))}</td>
                        <td className="p-3 text-right text-green-600">-{formatCurrency(invoices.reduce((sum, i) => sum + (i.commission_amount || 0), 0))}</td>
                        <td className="p-3 text-right">{formatCurrency(invoices.reduce((sum, i) => sum + (i.net_payable || 0), 0))}</td>
                        <td></td>
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
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">No rejections found</td></tr>
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
                      
                      return sortedDates.map(date => {
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
                                  <span className="text-sm text-gray-700">{rejection.product_name}</span>
                                  {rejection.variant_name && (
                                    <span className="text-xs text-gray-400 ml-1">({rejection.variant_name})</span>
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

        {/* ==================== PAYMENTS TAB ==================== */}
        {activeTab === 'payments' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Payments</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportPayments} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
                <Button size="sm" className="bg-[#14532D]" onClick={() => setShowPaymentModal(true)}>
                  <Plus size={14} className="mr-1" /> Record Payment
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-right font-medium text-gray-500">AMOUNT</th>
                      <th className="p-3 text-center font-medium text-gray-500">MODE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REFERENCE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REMARKS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">No payments found</td></tr>
                    ) : payments.map(payment => (
                      <tr key={payment.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{formatDate(payment.payment_date)}</td>
                        <td className="p-3 font-medium">{payment.retailer_name}</td>
                        <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(payment.amount)}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs uppercase">{payment.payment_mode}</span>
                        </td>
                        <td className="p-3">{payment.reference_number || '-'}</td>
                        <td className="p-3 text-gray-500">{payment.remarks || '-'}</td>
                        <td className="p-3 text-center">
                          <Button size="sm" variant="ghost" onClick={() => handleDeletePayment(payment.id)}>
                            <Trash2 size={14} className="text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
                                setIndentForm(prev => ({ ...prev, retailer_id: r.id }));
                                setRetailerSearch(r.company_name || r.name);
                                setShowRetailerDropdown(false);
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
                    <Button type="button" size="sm" variant="outline" onClick={addIndentItem}>
                      <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {indentForm.items.map((item, index) => (
                      <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                        {/* Product Search */}
                        <div className="flex-1 relative">
                          <Input
                            type="text"
                            value={item.product_name || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setIndentForm(prev => {
                                const items = [...prev.items];
                                items[index] = { ...items[index], product_name: newValue, product_id: '' };
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
                                filteredProducts.slice(0, 12).map(p => (
                                  <div
                                    key={p.id}
                                    className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // Prevent blur from firing before click
                                      setIndentForm(prev => {
                                        const items = [...prev.items];
                                        items[index] = { ...items[index], product_id: p.id, product_name: p.name };
                                        return { ...prev, items };
                                      });
                                      setShowProductDropdown(null);
                                      setProductSearch('');
                                    }}
                                  >
                                    {p.name}
                                  </div>
                                ))
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
                    ))}
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
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    onChange={(e) => setDispatchForm(prev => ({ ...prev, dispatch_date: e.target.value }))}
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
                  </div>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Product</th>
                          <th className="p-2 text-center">Indent Qty</th>
                          <th className="p-2 text-center">Supply Qty</th>
                          <th className="p-2 text-center">MRP *</th>
                          <th className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dispatchForm.items.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-2">{item.product_name} {item.variant_name && `(${item.variant_name})`}</td>
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
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td colSpan={4} className="p-2 text-right">Total MRP Value:</td>
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
                                <div className="font-medium">{item.product_name}</div>
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
                              <div className="font-medium">{item.product_name}</div>
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

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowEditInvoiceModal(false); setEditingInvoice(null); }} className="flex-1">
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Record Rejection</h3>
                <button onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateRejections} className="p-4 space-y-4">
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
                      <div className="border rounded overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="p-2 text-center w-8">
                                <Check size={14} />
                              </th>
                              <th className="p-2 text-left">Product</th>
                              <th className="p-2 text-center">Supplied</th>
                              <th className="p-2 text-center">Reject Qty</th>
                              <th className="p-2 text-center">MRP</th>
                              <th className="p-2 text-left">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rejectionDispatchItems.map((item, idx) => (
                              <tr key={idx} className={`border-t ${item.selected ? 'bg-red-50' : ''}`}>
                                <td className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={item.selected}
                                    onChange={(e) => updateRejectionItem(idx, 'selected', e.target.checked)}
                                    className="w-4 h-4"
                                  />
                                </td>
                                <td className="p-2">
                                  <div className="font-medium">{item.product_name}</div>
                                  {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                                </td>
                                <td className="p-2 text-center text-gray-600">{item.supplied_qty}</td>
                                <td className="p-2 text-center">
                                  <Input
                                    type="number"
                                    min="0"
                                    max={item.supplied_qty}
                                    value={item.rejection_qty || ''}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (val > item.supplied_qty) {
                                        toast.error('Cannot exceed supplied qty');
                                        return;
                                      }
                                      updateRejectionItem(idx, 'rejection_qty', val);
                                      if (val > 0) updateRejectionItem(idx, 'selected', true);
                                    }}
                                    className="w-16 h-7 text-center"
                                    disabled={!item.selected && !item.rejection_qty}
                                  />
                                </td>
                                <td className="p-2 text-center text-gray-600">₹{item.mrp}</td>
                                <td className="p-2">
                                  <select
                                    value={item.reason || ''}
                                    onChange={(e) => updateRejectionItem(idx, 'reason', e.target.value)}
                                    className="w-full h-7 px-1 rounded border text-xs"
                                    disabled={!item.selected}
                                  >
                                    <option value="">Reason</option>
                                    <option value="Rotten">Rotten</option>
                                    <option value="Damaged">Damaged</option>
                                    <option value="Quality Issue">Quality Issue</option>
                                    <option value="Expired">Expired</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </td>
                              </tr>
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

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    disabled={!rejectionDispatchItems.some(i => i.selected && i.rejection_qty > 0)}
                  >
                    Record Rejections ({rejectionDispatchItems.filter(i => i.selected && i.rejection_qty > 0).length})
                  </Button>
                </div>
              </form>
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
      </div>
    </Layout>
  );
}
