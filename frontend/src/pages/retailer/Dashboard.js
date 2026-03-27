import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Package, Truck, DollarSign, AlertTriangle, Plus, X,
  TrendingUp, Clock, CheckCircle, FileText, Download,
  ChevronDown, ChevronRight
} from 'lucide-react';

export default function RetailerDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [indents, setIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDispatches, setExpandedDispatches] = useState({});
  const [expandedInvoices, setExpandedInvoices] = useState({});
  
  // Indent form
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [indentForm, setIndentForm] = useState({
    indent_date: new Date().toISOString().split('T')[0],
    items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }],
    remarks: ''
  });
  
  // GRN form
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState(null);
  const [grnItems, setGrnItems] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, indentsRes, dispatchesRes, invoicesRes, rejectionsRes, productsRes, packagingsRes] = await Promise.all([
        api.get('/api/retailer-dashboard'),
        api.get('/api/retailer-indents'),
        api.get('/api/retailer-dispatches'),
        api.get('/api/retailer-invoices'),
        api.get('/api/retailer-rejections'),
        api.get('/api/products'),
        api.get('/api/qc-packaging')
      ]);
      setDashboardData(dashRes.data);
      setIndents(indentsRes.data);
      setDispatches(dispatchesRes.data);
      setInvoices(invoicesRes.data);
      setRejections(rejectionsRes.data);
      setProducts(productsRes.data);
      setPackagings(packagingsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    if (indentForm.items.some(item => !item.product_id || !item.quantity)) {
      toast.error('Please fill all product details');
      return;
    }

    try {
      await api.post('/api/retailer-indents', {
        retailer_id: dashboardData?.retailer?.id,
        indent_date: new Date(indentForm.indent_date).toISOString(),
        items: indentForm.items,
        remarks: indentForm.remarks
      });
      toast.success('Indent created successfully');
      setShowIndentModal(false);
      resetIndentForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create indent');
    }
  };

  const handleDeleteIndent = async (indentId) => {
    if (!window.confirm('Are you sure you want to delete this indent?')) return;
    try {
      await api.delete(`/api/retailer-indents/${indentId}`);
      toast.success('Indent deleted');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete indent');
    }
  };

  const resetIndentForm = () => {
    setIndentForm({
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

  // ==================== GRN HANDLERS ====================
  const openGrnModal = (dispatch) => {
    setSelectedDispatch(dispatch);
    setGrnItems(dispatch.items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      supplied_qty: item.supplied_qty,
      received_qty: item.supplied_qty,
      difference: 0
    })));
    setShowGrnModal(true);
  };

  const updateGrnItem = (index, receivedQty) => {
    setGrnItems(prev => {
      const items = [...prev];
      items[index].received_qty = receivedQty;
      items[index].difference = receivedQty - items[index].supplied_qty;
      return items;
    });
  };

  const handleSubmitGrn = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/retailer-grn', {
        dispatch_id: selectedDispatch.id,
        items: grnItems,
        remarks: ''
      });
      toast.success('GRN confirmed successfully');
      setShowGrnModal(false);
      setSelectedDispatch(null);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm GRN');
    }
  };

  const toggleDispatchExpand = (id) => {
    setExpandedDispatches(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleInvoiceExpand = (id) => {
    setExpandedInvoices(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const downloadInvoicePdf = (invoice) => {
    const printWindow = window.open('', '_blank');
    
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
            ${dashboardData?.retailer?.company_name || ''}<br>
            ${dashboardData?.retailer?.address || ''}
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

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
    { id: 'indents', label: 'My Indents', icon: Package },
    { id: 'orders', label: 'My Orders', icon: Truck },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'rejections', label: 'Rejections', icon: AlertTriangle }
  ];

  const summary = dashboardData?.summary || {};

  return (
    <Layout title="Retailer Portal">
      <div data-testid="retailer-dashboard">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Welcome, {dashboardData?.retailer?.name || 'Retailer'}
            </h1>
            <p className="text-sm text-gray-500">
              {dashboardData?.retailer?.company_name && `${dashboardData.retailer.company_name} • `}
              Commission: {dashboardData?.retailer?.commission_percentage || 0}%
            </p>
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
              </Button>
            );
          })}
        </div>

        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Package size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Items Received</p>
                      <p className="text-xl font-bold">{summary.total_items_received || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <DollarSign size={20} className="text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Invoice</p>
                      <p className="text-xl font-bold">{formatCurrency(summary.total_mrp_value)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <CheckCircle size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Amount Paid</p>
                      <p className="text-xl font-bold text-green-700">{formatCurrency(summary.total_paid)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <Clock size={20} className="text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Pending Amount</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(summary.pending_amount)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Payment Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total MRP Value:</span>
                      <span className="font-medium">{formatCurrency(summary.total_mrp_value)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Commission ({dashboardData?.retailer?.commission_percentage}%):</span>
                      <span className="font-medium text-green-600">- {formatCurrency((summary.total_mrp_value || 0) - (summary.total_net_payable || 0))}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-500">Net Payable:</span>
                      <span className="font-medium">{formatCurrency(summary.total_net_payable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Rejections Adjusted:</span>
                      <span className="font-medium text-green-600">- {formatCurrency(summary.total_rejection_value)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-500">Adjusted Payable:</span>
                      <span className="font-medium">{formatCurrency(summary.adjusted_payable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amount Paid:</span>
                      <span className="font-medium text-green-600">- {formatCurrency(summary.total_paid)}</span>
                    </div>
                    <div className="flex justify-between border-t-2 pt-2 text-base">
                      <span className="font-semibold">Balance Due:</span>
                      <span className="font-bold text-red-600">{formatCurrency(summary.pending_amount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-yellow-600" />
                        <span className="text-sm">Pending Indents</span>
                      </div>
                      <span className="font-bold text-yellow-700">{summary.pending_indents || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Truck size={16} className="text-blue-600" />
                        <span className="text-sm">Total Dispatches</span>
                      </div>
                      <span className="font-bold text-blue-700">{summary.total_dispatches || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-600" />
                        <span className="text-sm">Items Rejected</span>
                      </div>
                      <span className="font-bold text-red-700">{summary.total_items_rejected || 0}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <DollarSign size={16} className="text-green-600" />
                        <span className="text-sm">Payments Made</span>
                      </div>
                      <span className="font-bold text-green-700">{summary.total_payments || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Dispatches */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Recent Orders</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                        <th className="p-3 text-left font-medium text-gray-500">INVOICE</th>
                        <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                        <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatches.slice(0, 5).map(d => (
                        <tr key={d.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{formatDate(d.dispatch_date)}</td>
                          <td className="p-3 text-blue-600 font-medium">{d.invoice_number}</td>
                          <td className="p-3 text-center">{d.items?.length || 0}</td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(d.net_payable)}</td>
                        </tr>
                      ))}
                      {dispatches.length === 0 && (
                        <tr><td colSpan={4} className="p-8 text-center text-gray-400">No orders yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ==================== INDENTS TAB ==================== */}
        {activeTab === 'indents' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">My Indents</CardTitle>
              <Button size="sm" className="bg-[#14532D]" onClick={() => setShowIndentModal(true)}>
                <Plus size={14} className="mr-1" /> New Indent
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                      <th className="p-3 text-left font-medium text-gray-500">REMARKS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indents.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No indents found. Create your first indent!</td></tr>
                    ) : indents.map(indent => (
                      <tr key={indent.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{formatDate(indent.indent_date)}</td>
                        <td className="p-3 text-center">
                          {indent.items?.map((item, idx) => (
                            <div key={idx} className="text-xs">
                              {item.product_name} {item.variant_name && `(${item.variant_name})`} x {item.quantity}
                            </div>
                          ))}
                        </td>
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
                        <td className="p-3 text-gray-500">{indent.remarks || '-'}</td>
                        <td className="p-3 text-center">
                          {indent.status === 'pending' && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteIndent(indent.id)}>
                              <X size={14} className="text-red-600" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== ORDERS TAB ==================== */}
        {activeTab === 'orders' && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">My Orders (Dispatched)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE</th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">No orders received yet</td></tr>
                    ) : dispatches.map(dispatch => (
                      <React.Fragment key={dispatch.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleDispatchExpand(dispatch.id)}>
                          <td className="p-3">
                            {expandedDispatches[dispatch.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3 font-medium text-blue-600">{dispatch.invoice_number}</td>
                          <td className="p-3">{formatDate(dispatch.dispatch_date)}</td>
                          <td className="p-3 text-center">{dispatch.items?.length || 0}</td>
                          <td className="p-3 text-right">{formatCurrency(dispatch.total_mrp_value)}</td>
                          <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(dispatch.net_payable)}</td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="outline" onClick={() => openGrnModal(dispatch)}>
                              <CheckCircle size={14} className="mr-1" /> Confirm GRN
                            </Button>
                          </td>
                        </tr>
                        {expandedDispatches[dispatch.id] && (
                          <tr className="bg-blue-50">
                            <td colSpan={7} className="p-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="p-2 text-left">Product</th>
                                    <th className="p-2 text-center">Qty</th>
                                    <th className="p-2 text-right">MRP</th>
                                    <th className="p-2 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dispatch.items?.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="p-2">{item.product_name} {item.variant_name && `(${item.variant_name})`}</td>
                                      <td className="p-2 text-center">{item.supplied_qty}</td>
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
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== INVOICES TAB ==================== */}
        {activeTab === 'invoices' && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">My Invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE #</th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                      <th className="p-3 text-right font-medium text-gray-500">COMMISSION</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
                      <th className="p-3 text-center font-medium text-gray-500">DOWNLOAD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-400">No invoices found</td></tr>
                    ) : invoices.map(invoice => (
                      <React.Fragment key={invoice.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleInvoiceExpand(invoice.id)}>
                          <td className="p-3">
                            {expandedInvoices[invoice.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3 font-medium text-blue-600">{invoice.invoice_number}</td>
                          <td className="p-3">{formatDate(invoice.invoice_date)}</td>
                          <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                          <td className="p-3 text-right">{formatCurrency(invoice.total_mrp_value)}</td>
                          <td className="p-3 text-right text-green-600">- {formatCurrency(invoice.commission_amount)} ({invoice.commission_percentage}%)</td>
                          <td className="p-3 text-right font-semibold">{formatCurrency(invoice.net_payable)}</td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                              <Download size={14} className="text-blue-600" />
                            </Button>
                          </td>
                        </tr>
                        {expandedInvoices[invoice.id] && (
                          <tr className="bg-green-50">
                            <td colSpan={8} className="p-3">
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
                        <td colSpan={4} className="p-3 text-right">TOTAL:</td>
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
            <CardHeader className="py-3">
              <CardTitle className="text-sm">My Rejections (Read-Only)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">PRODUCT</th>
                      <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                      <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REASON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejections.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No rejections recorded</td></tr>
                    ) : rejections.map(rejection => (
                      <tr key={rejection.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{formatDate(rejection.rejection_date)}</td>
                        <td className="p-3">{rejection.product_name} {rejection.variant_name && `(${rejection.variant_name})`}</td>
                        <td className="p-3 text-center text-red-600 font-medium">{rejection.quantity}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(rejection.rejection_value)}</td>
                        <td className="p-3">{rejection.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                  {rejections.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={2} className="p-3 text-right">Total Rejected:</td>
                        <td className="p-3 text-center text-red-600">{rejections.reduce((sum, r) => sum + (r.quantity || 0), 0)}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(rejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
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
                <h3 className="text-lg font-semibold">Create New Indent</h3>
                <button onClick={() => { setShowIndentModal(false); resetIndentForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateIndent} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <Input
                    type="date"
                    value={indentForm.indent_date}
                    onChange={(e) => setIndentForm(prev => ({ ...prev, indent_date: e.target.value }))}
                    required
                  />
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    value={indentForm.remarks}
                    onChange={(e) => setIndentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
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

        {/* ==================== GRN MODAL ==================== */}
        {showGrnModal && selectedDispatch && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Confirm GRN - {selectedDispatch.invoice_number}</h3>
                  <p className="text-sm text-gray-500">Enter the actual quantities you received</p>
                </div>
                <button onClick={() => { setShowGrnModal(false); setSelectedDispatch(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSubmitGrn} className="p-4 space-y-4">
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-center">Supplied</th>
                        <th className="p-2 text-center">Received</th>
                        <th className="p-2 text-center">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grnItems.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2">{item.product_name} {item.variant_name && `(${item.variant_name})`}</td>
                          <td className="p-2 text-center text-gray-500">{item.supplied_qty}</td>
                          <td className="p-2 text-center">
                            <Input
                              type="number"
                              min="0"
                              value={item.received_qty}
                              onChange={(e) => updateGrnItem(index, parseFloat(e.target.value) || 0)}
                              className="w-20 h-7 text-center mx-auto"
                            />
                          </td>
                          <td className={`p-2 text-center font-medium ${
                            item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : ''
                          }`}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowGrnModal(false); setSelectedDispatch(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">Confirm GRN</Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
