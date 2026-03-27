import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { 
  Plus, Package, Truck, AlertTriangle, DollarSign, 
  Edit, Trash2, X, ChevronDown, ChevronRight, FileText, Download, Check
} from 'lucide-react';

export default function RetailerOrders() {
  const [activeTab, setActiveTab] = useState('indents');
  const [retailers, setRetailers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  const [selectedRetailer, setSelectedRetailer] = useState('');
  
  // Indents state
  const [indents, setIndents] = useState([]);
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [indentForm, setIndentForm] = useState({
    retailer_id: '',
    indent_date: new Date().toISOString().split('T')[0],
    items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }],
    remarks: ''
  });
  
  // Dispatches state
  const [dispatches, setDispatches] = useState([]);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState(null);
  const [selectedIndent, setSelectedIndent] = useState(null);
  const [dispatchForm, setDispatchForm] = useState({
    dispatch_date: new Date().toISOString().split('T')[0],
    items: [],
    remarks: ''
  });
  
  // Invoices state
  const [invoices, setInvoices] = useState([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [uninvoicedDispatches, setUninvoicedDispatches] = useState([]);
  const [selectedDispatchIds, setSelectedDispatchIds] = useState([]);
  const [invoiceForm, setInvoiceForm] = useState({
    retailer_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    remarks: ''
  });
  
  // Rejections state
  const [rejections, setRejections] = useState([]);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionForm, setRejectionForm] = useState({
    retailer_id: '',
    rejection_date: new Date().toISOString().split('T')[0],
    product_id: '',
    product_name: '',
    variant_name: '',
    quantity: 0,
    reason: '',
    mrp: 0,
    remarks: ''
  });
  
  // Payments state
  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    retailer_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: 0,
    payment_mode: 'cash',
    reference_number: '',
    remarks: ''
  });
  
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

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ==================== INDENT HANDLERS ====================
  const handleCreateIndent = async (e) => {
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
      await api.post('/api/retailer-indents', {
        retailer_id: indentForm.retailer_id,
        indent_date: new Date(indentForm.indent_date).toISOString(),
        items: indentForm.items,
        remarks: indentForm.remarks
      });
      toast.success('Indent created successfully');
      setShowIndentModal(false);
      resetIndentForm();
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create indent');
    }
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
      items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }],
      remarks: ''
    });
  };

  const addIndentItem = () => {
    setIndentForm(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }]
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
        supplied_qty: item.quantity,
        mrp: 0,
        total_value: 0
      })),
      remarks: ''
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
      remarks: dispatch.remarks || ''
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
    if (dispatchForm.items.some(item => !item.mrp || item.mrp <= 0)) {
      toast.error('MRP is mandatory for all items');
      return;
    }

    try {
      if (editingDispatch) {
        // Update existing dispatch
        await api.put(`/api/retailer-dispatches/${editingDispatch.id}`, {
          indent_id: editingDispatch.indent_id,
          dispatch_date: new Date(dispatchForm.dispatch_date).toISOString(),
          items: dispatchForm.items,
          remarks: dispatchForm.remarks
        });
        toast.success('Dispatch updated successfully');
      } else {
        // Create new dispatch
        await api.post('/api/retailer-dispatches', {
          indent_id: selectedIndent.id,
          dispatch_date: new Date(dispatchForm.dispatch_date).toISOString(),
          items: dispatchForm.items,
          remarks: dispatchForm.remarks
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
      setSelectedDispatchIds([]);
      setShowInvoiceModal(true);
    } catch (error) {
      toast.error('Failed to load uninvoiced dispatches');
    }
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
    if (selectedDispatchIds.length === 0) {
      toast.error('Please select at least one dispatch');
      return;
    }

    try {
      const response = await api.post('/api/retailer-invoices', {
        retailer_id: invoiceForm.retailer_id,
        invoice_date: new Date(invoiceForm.invoice_date).toISOString(),
        dispatch_ids: selectedDispatchIds,
        remarks: invoiceForm.remarks
      });
      toast.success(`Invoice ${response.data.invoice_number} created successfully`);
      setShowInvoiceModal(false);
      setSelectedDispatchIds([]);
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

  const downloadInvoicePdf = (invoice) => {
    // Create a printable invoice
    const printWindow = window.open('', '_blank');
    const retailer = retailers.find(r => r.id === invoice.retailer_id) || {};
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #14532D; margin: 0; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-box { padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
          th { background: #f5f5f5; }
          .text-right { text-align: right; }
          .summary { margin-top: 20px; }
          .summary-row { display: flex; justify-content: flex-end; gap: 20px; padding: 5px 0; }
          .total-row { font-weight: bold; font-size: 1.2em; border-top: 2px solid #14532D; padding-top: 10px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>FreshFlow</h1>
          <p>INVOICE</p>
        </div>
        <div class="info-row">
          <div class="info-box">
            <strong>Invoice #:</strong> ${invoice.invoice_number}<br>
            <strong>Date:</strong> ${formatDate(invoice.invoice_date)}<br>
          </div>
          <div class="info-box">
            <strong>Bill To:</strong><br>
            ${invoice.retailer_name}<br>
            ${retailer.company_name || ''}<br>
            ${retailer.address || ''}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Variant</th>
              <th class="text-right">Qty</th>
              <th class="text-right">MRP</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${item.product_name}</td>
                <td>${item.variant_name || '-'}</td>
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">₹${item.mrp.toFixed(2)}</td>
                <td class="text-right">₹${item.total_value.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="summary">
          <div class="summary-row">
            <span>Total MRP Value:</span>
            <span>₹${invoice.total_mrp_value.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span>Commission (${invoice.commission_percentage}%):</span>
            <span style="color: green;">- ₹${invoice.commission_amount.toFixed(2)}</span>
          </div>
          <div class="summary-row total-row">
            <span>Net Payable:</span>
            <span>₹${invoice.net_payable.toFixed(2)}</span>
          </div>
        </div>
        <br><br>
        <button onclick="window.print()">Print Invoice</button>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ==================== REJECTION HANDLERS ====================
  const handleCreateRejection = async (e) => {
    e.preventDefault();
    if (!rejectionForm.retailer_id || !rejectionForm.product_id || !rejectionForm.quantity) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await api.post('/api/retailer-rejections', {
        ...rejectionForm,
        rejection_date: new Date(rejectionForm.rejection_date).toISOString()
      });
      toast.success('Rejection recorded');
      setShowRejectionModal(false);
      resetRejectionForm();
      loadRejections();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record rejection');
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

  const resetRejectionForm = () => {
    setRejectionForm({
      retailer_id: '',
      rejection_date: new Date().toISOString().split('T')[0],
      product_id: '',
      product_name: '',
      variant_name: '',
      quantity: 0,
      reason: '',
      mrp: 0,
      remarks: ''
    });
  };

  // ==================== PAYMENT HANDLERS ====================
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
      amount: 0,
      payment_mode: 'cash',
      reference_number: '',
      remarks: ''
    });
  };

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
                <option key={r.id} value={r.id}>{r.name} ({r.commission_percentage || 0}%)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-4 border-b pb-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={activeTab === tab.id ? 'bg-[#14532D]' : ''}
              >
                <Icon size={14} className="mr-1" />
                {tab.label}
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{tab.count}</span>
              </Button>
            );
          })}
        </div>

        {/* ==================== INDENTS TAB ==================== */}
        {activeTab === 'indents' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Retailer Indents</CardTitle>
              <Button size="sm" className="bg-[#14532D]" onClick={() => setShowIndentModal(true)}>
                <Plus size={14} className="mr-1" /> New Indent
              </Button>
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
                    {indents.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-400">No indents found</td></tr>
                    ) : indents.map(indent => (
                      <React.Fragment key={indent.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleIndentExpand(indent.id)}>
                          <td className="p-3 text-center">
                            {expandedIndents[indent.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3">{formatDate(indent.indent_date)}</td>
                          <td className="p-3 font-medium">{indent.retailer_name}</td>
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
                              {indent.status === 'pending' && (
                                <Button size="sm" variant="outline" onClick={() => openDispatchModal(indent)}>
                                  <Truck size={14} className="mr-1" /> Dispatch
                                </Button>
                              )}
                              {indent.status === 'pending' && (
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteIndent(indent.id)}>
                                  <Trash2 size={14} className="text-red-600" />
                                </Button>
                              )}
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
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Dispatches</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                      <th className="p-3 text-center font-medium text-gray-500">COMM %</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
                      <th className="p-3 text-center font-medium text-gray-500">INVOICE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-400">No dispatches found</td></tr>
                    ) : dispatches.map(dispatch => (
                      <tr key={dispatch.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{formatDate(dispatch.dispatch_date)}</td>
                        <td className="p-3 font-medium">{dispatch.retailer_name}</td>
                        <td className="p-3 text-center">{dispatch.items?.length || 0}</td>
                        <td className="p-3 text-right">{formatCurrency(dispatch.total_mrp_value)}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">{dispatch.commission_percentage}%</span>
                        </td>
                        <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(dispatch.net_payable)}</td>
                        <td className="p-3 text-center">
                          {dispatch.invoice_number ? (
                            <span className="text-blue-600 text-xs">{dispatch.invoice_number}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
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
                    ))}
                  </tbody>
                  {dispatches.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={3} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(dispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0))}</td>
                        <td></td>
                        <td className="p-3 text-right text-green-700">{formatCurrency(dispatches.reduce((sum, d) => sum + (d.net_payable || 0), 0))}</td>
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
                <select
                  value={invoiceForm.retailer_id}
                  onChange={(e) => setInvoiceForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                  className="h-8 px-2 rounded border text-sm"
                >
                  <option value="">Select Retailer</option>
                  {retailers.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
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
                      <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                      <th className="p-3 text-right font-medium text-gray-500">COMMISSION</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
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
                          <td className="p-3 font-medium">{invoice.retailer_name}</td>
                          <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                          <td className="p-3 text-right">{formatCurrency(invoice.total_mrp_value)}</td>
                          <td className="p-3 text-right text-green-600">- {formatCurrency(invoice.commission_amount)} ({invoice.commission_percentage}%)</td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(invoice.net_payable)}</td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                                <Download size={14} className="text-blue-600" />
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
                                    <th className="p-2 text-right">Qty</th>
                                    <th className="p-2 text-right">MRP</th>
                                    <th className="p-2 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoice.items?.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2">{item.product_name}</td>
                                      <td className="p-2">{item.variant_name || '-'}</td>
                                      <td className="p-2 text-right">{item.quantity}</td>
                                      <td className="p-2 text-right">{formatCurrency(item.mrp)}</td>
                                      <td className="p-2 text-right">{formatCurrency(item.total_value)}</td>
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
                  {invoices.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={5} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(invoices.reduce((sum, i) => sum + (i.total_mrp_value || 0), 0))}</td>
                        <td className="p-3 text-right text-green-600">- {formatCurrency(invoices.reduce((sum, i) => sum + (i.commission_amount || 0), 0))}</td>
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
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Rejections</CardTitle>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowRejectionModal(true)}>
                <Plus size={14} className="mr-1" /> Record Rejection
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-left font-medium text-gray-500">PRODUCT</th>
                      <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                      <th className="p-3 text-right font-medium text-gray-500">MRP</th>
                      <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REASON</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejections.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-400">No rejections found</td></tr>
                    ) : rejections.map(rejection => (
                      <tr key={rejection.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{formatDate(rejection.rejection_date)}</td>
                        <td className="p-3 font-medium">{rejection.retailer_name}</td>
                        <td className="p-3">{rejection.product_name} {rejection.variant_name && `(${rejection.variant_name})`}</td>
                        <td className="p-3 text-center text-red-600 font-medium">{rejection.quantity}</td>
                        <td className="p-3 text-right">{formatCurrency(rejection.mrp)}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(rejection.rejection_value)}</td>
                        <td className="p-3">{rejection.reason}</td>
                        <td className="p-3 text-center">
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteRejection(rejection.id)}>
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

        {/* ==================== PAYMENTS TAB ==================== */}
        {activeTab === 'payments' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Payments</CardTitle>
              <Button size="sm" className="bg-[#14532D]" onClick={() => setShowPaymentModal(true)}>
                <Plus size={14} className="mr-1" /> Record Payment
              </Button>
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
              <form onSubmit={handleCreateIndent} className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                    <select
                      value={indentForm.retailer_id}
                      onChange={(e) => setIndentForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                      className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                      required
                    >
                      <option value="">Select Retailer</option>
                      {retailers.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
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
                        <select
                          value={item.product_id}
                          onChange={(e) => updateIndentItem(index, 'product_id', e.target.value)}
                          className="flex-1 h-8 px-2 rounded border text-sm"
                          required
                        >
                          <option value="">Select Product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={item.variant_id}
                          onChange={(e) => updateIndentItem(index, 'variant_id', e.target.value)}
                          className="w-32 h-8 px-2 rounded border text-sm"
                        >
                          <option value="">Variant</option>
                          {packagings.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateIndentItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          placeholder="Qty"
                          className="w-20 h-8"
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
                  <Button type="button" variant="outline" onClick={() => { setShowIndentModal(false); resetIndentForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">Create Indent</Button>
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
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Items (MRP is mandatory)</label>
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
                                value={item.supplied_qty}
                                onChange={(e) => updateDispatchItem(index, 'supplied_qty', parseFloat(e.target.value) || 0)}
                                className="w-20 h-7 text-center mx-auto"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.mrp}
                                onChange={(e) => updateDispatchItem(index, 'mrp', parseFloat(e.target.value) || 0)}
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
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Create Invoice</h3>
                  <p className="text-sm text-gray-500">Select dispatches to include in this invoice</p>
                </div>
                <button onClick={() => { setShowInvoiceModal(false); setSelectedDispatchIds([]); }} className="p-1 hover:bg-gray-100 rounded">
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
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Select Dispatches ({selectedDispatchIds.length} selected)
                  </label>
                  {uninvoicedDispatches.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No uninvoiced dispatches found for this retailer</p>
                  ) : (
                    <div className="border rounded max-h-60 overflow-y-auto">
                      {uninvoicedDispatches.map(dispatch => (
                        <div
                          key={dispatch.id}
                          className={`flex items-center gap-3 p-3 border-b cursor-pointer hover:bg-gray-50 ${
                            selectedDispatchIds.includes(dispatch.id) ? 'bg-green-50' : ''
                          }`}
                          onClick={() => toggleDispatchSelection(dispatch.id)}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedDispatchIds.includes(dispatch.id) ? 'bg-[#14532D] border-[#14532D]' : 'border-gray-300'
                          }`}>
                            {selectedDispatchIds.includes(dispatch.id) && <Check size={14} className="text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{formatDate(dispatch.dispatch_date)}</p>
                            <p className="text-xs text-gray-500">{dispatch.items?.length || 0} items</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(dispatch.total_mrp_value)}</p>
                            <p className="text-xs text-green-600">Net: {formatCurrency(dispatch.net_payable)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedDispatchIds.length > 0 && (
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-sm font-medium">Selected Total: {formatCurrency(selectedDispatchTotal)}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowInvoiceModal(false); setSelectedDispatchIds([]); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]" disabled={selectedDispatchIds.length === 0}>
                    Create Invoice
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
              <form onSubmit={handleCreateRejection} className="p-4 space-y-4">
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
                      <option key={r.id} value={r.id}>{r.name}</option>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
                  <select
                    value={rejectionForm.product_id}
                    onChange={(e) => {
                      const product = products.find(p => p.id === e.target.value);
                      setRejectionForm(prev => ({ ...prev, product_id: e.target.value, product_name: product?.name || '' }));
                    }}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                    <Input
                      type="number"
                      min="1"
                      value={rejectionForm.quantity}
                      onChange={(e) => setRejectionForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">MRP per unit</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rejectionForm.mrp}
                      onChange={(e) => setRejectionForm(prev => ({ ...prev, mrp: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                  <select
                    value={rejectionForm.reason}
                    onChange={(e) => setRejectionForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">Select Reason</option>
                    <option value="Rotten">Rotten</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Quality Issue">Quality Issue</option>
                    <option value="Expired">Expired</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700">Record Rejection</Button>
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
                <button onClick={() => { setShowPaymentModal(false); resetPaymentForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreatePayment} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                  <select
                    value={paymentForm.retailer_id}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">Select Retailer</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
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
