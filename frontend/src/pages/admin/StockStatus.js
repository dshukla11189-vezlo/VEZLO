import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Package, TrendingUp, TrendingDown, AlertTriangle, Save, RefreshCw, Clock, CheckCircle, ArrowRight, Edit2, Trash2, Filter, Calendar, Search, FileSpreadsheet, Settings } from 'lucide-react';

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

export default function StockStatus() {
  const { t } = useTranslation();
  const [stockStatus, setStockStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingData, setClosingData] = useState({});
  const [savingClosing, setSavingClosing] = useState(false);
  const [showClosingDialog, setShowClosingDialog] = useState(false);
  const [products, setProducts] = useState([]);
  const [closableProductsForDate, setClosableProductsForDate] = useState([]); // Products that need closing (from API)
  const [selectedForClosing, setSelectedForClosing] = useState({}); // Checkboxes for multi-select
  
  // Filter states
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterProduct, setFilterProduct] = useState('all');
  const [isHistoricalView, setIsHistoricalView] = useState(false);
  
  // Edit states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  
  // Delete states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  
  // Sync packaging weights state
  const [syncingWeights, setSyncingWeights] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [fixingPurchases, setFixingPurchases] = useState(false);
  
  // Auto-refresh interval (30 seconds)
  const AUTO_REFRESH_INTERVAL = 30000;

  const loadProducts = useCallback(async () => {
    try {
      const response = await api.get('/api/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Load products error:', error);
    }
  }, []);

  const loadStockStatus = useCallback(async (date = null) => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const targetDate = date || filterDate;
      
      // Sort function: non-zero closing first, then by descending closing qty
      const sortByClosingQty = (data) => {
        return [...data].sort((a, b) => {
          const aClosing = typeof a.closing_qty === 'number' ? a.closing_qty : 0;
          const bClosing = typeof b.closing_qty === 'number' ? b.closing_qty : 0;
          const aHasClosing = aClosing > 0;
          const bHasClosing = bClosing > 0;
          
          // Non-zero closing comes first
          if (aHasClosing && !bHasClosing) return -1;
          if (!aHasClosing && bHasClosing) return 1;
          
          // Within same group, sort by descending closing qty
          return bClosing - aClosing;
        });
      };
      
      // Check if viewing historical data or today
      if (targetDate === today) {
        setIsHistoricalView(false);
        const response = await api.get('/api/stock-status/today');
        setStockStatus(sortByClosingQty(response.data));
        
        // Initialize closing data for products that should be closable
        // Only show items with opening > 0 OR purchase > 0 (had activity)
        const initialClosingData = {};
        response.data.forEach(item => {
          if (item.status === 'open' && (item.opening_qty > 0 || item.purchase_qty > 0)) {
            initialClosingData[item.product_id] = item.closing_qty || '';
          }
        });
        setClosingData(initialClosingData);
      } else {
        setIsHistoricalView(true);
        const response = await api.get(`/api/stock-status/history?from_date=${targetDate}&to_date=${targetDate}`);
        setStockStatus(sortByClosingQty(response.data));
      }
    } catch (error) {
      console.error('Load stock status error:', error);
      toast.error('Failed to load stock status');
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  useEffect(() => {
    loadProducts();
    loadStockStatus();
  }, [loadProducts, loadStockStatus]);

  // Auto-refresh for real-time updates (only for today's view, paused when closing dialog is open)
  useEffect(() => {
    if (!isHistoricalView && !showClosingDialog && !showEditDialog) {
      const interval = setInterval(() => {
        loadStockStatus();
      }, AUTO_REFRESH_INTERVAL);
      
      return () => clearInterval(interval);
    }
  }, [isHistoricalView, showClosingDialog, showEditDialog, loadStockStatus]);

  const handleDateChange = (newDate) => {
    setFilterDate(newDate);
    loadStockStatus(newDate);
  };

  // ==================== EXPORT HANDLER ====================
  const exportStockStatus = () => {
    const filteredStock = filterProduct === 'all' 
      ? stockStatus 
      : stockStatus.filter(s => s.product_id === filterProduct);
    
    exportToCSV(filteredStock, `stock_status_${filterDate}`, [
      { label: 'Product', getter: (d) => d.product_name },
      { label: 'Unit', getter: (d) => d.unit },
      { label: 'Opening Qty', getter: (d) => d.opening_qty || 0 },
      { label: 'Purchase Qty', getter: (d) => d.purchase_qty || 0 },
      { label: 'QC Dispatch', getter: (d) => d.qc_dispatch_qty || 0 },
      { label: 'Retailer Dispatch', getter: (d) => d.retailer_dispatch_qty || 0 },
      { label: 'Wastage', getter: (d) => d.wastage_qty || 0 },
      { label: 'Closing Qty', getter: (d) => d.closing_qty ?? '-' },
      { label: 'Status', getter: (d) => d.status }
    ]);
  };

  // ==================== SYNC PACKAGING WEIGHTS ====================
  const syncPackagingWeights = async () => {
    setSyncingWeights(true);
    try {
      const response = await api.post('/api/qc-packaging/sync-weights');
      toast.success(response.data.message || 'Packaging weights synced successfully!');
      // Reload stock status to reflect new calculations
      loadStockStatus();
    } catch (error) {
      console.error('Sync packaging weights error:', error);
      toast.error('Failed to sync packaging weights');
    } finally {
      setSyncingWeights(false);
    }
  };

  // ==================== FIX ALL HISTORICAL DISPATCHES ====================
  const fixAllHistoricalDispatches = async () => {
    if (!window.confirm('This will recalculate dispatches for ALL historical dates. This may take a few moments. Continue?')) {
      return;
    }
    
    setRecalculating(true);
    try {
      const response = await api.post('/api/stock-status/fix-all-historical-dispatches');
      const data = response.data;
      
      toast.success(`${data.message}`);
      
      if (data.summary && data.summary.length > 0) {
        console.log('Fix summary:', data.summary);
      }
      
      // Reload stock status
      loadStockStatus();
    } catch (error) {
      console.error('Fix all historical dispatches error:', error);
      toast.error('Failed to fix historical dispatches');
    } finally {
      setRecalculating(false);
    }
  };

  // ==================== FIX ALL PURCHASE QUANTITIES ====================
  const fixAllPurchaseQuantities = async () => {
    if (!window.confirm('This will recalculate ALL purchase quantities from raw procurement data. Use this if values from Excel backup are incorrect. Continue?')) {
      return;
    }
    
    setFixingPurchases(true);
    try {
      const response = await api.post('/api/stock-status/fix-all-purchase-quantities');
      const data = response.data;
      
      toast.success(`${data.message}`);
      
      if (data.summary && data.summary.length > 0) {
        console.log('Purchase fix summary:', data.summary);
      }
      
      // Reload stock status
      loadStockStatus();
    } catch (error) {
      console.error('Fix purchase quantities error:', error);
      toast.error('Failed to fix purchase quantities');
    } finally {
      setFixingPurchases(false);
    }
  };

  const handleClosingQtyChange = (productId, value) => {
    setClosingData(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const toggleClosingSelection = (productId) => {
    setSelectedForClosing(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const selectAllForClosing = () => {
    const allSelected = {};
    closableProductsForDate.filter(p => p.status === 'open').forEach(p => {
      allSelected[p.product_id] = true;
    });
    setSelectedForClosing(allSelected);
  };

  const loadClosableProducts = async (date) => {
    try {
      const response = await api.get(`/api/stock-status/closable-products?date=${date}`);
      setClosableProductsForDate(response.data);
      // Initialize closing data and selection
      const initialClosingData = {};
      const initialSelection = {};
      response.data.forEach(item => {
        if (item.status === 'open') {
          initialClosingData[item.product_id] = item.closing_qty !== null ? item.closing_qty : '';
          initialSelection[item.product_id] = false;
        }
      });
      setClosingData(initialClosingData);
      setSelectedForClosing(initialSelection);
    } catch (error) {
      console.error('Load closable products error:', error);
    }
  };

  const handleOpenClosingDialog = async () => {
    await loadClosableProducts(filterDate);
    setShowClosingDialog(true);
  };

  const handleSaveClosing = async () => {
    // Get entries that are selected AND have a closing value
    const entries = Object.keys(closingData)
      .filter(productId => selectedForClosing[productId] && closingData[productId] !== '' && closingData[productId] !== null)
      .map(productId => ({
        product_id: productId,
        closing_qty: parseFloat(closingData[productId]) || 0
      }));

    if (entries.length === 0) {
      toast.error('Select products and enter closing quantities');
      return;
    }

    // Check if any open product is not selected
    const openProductsForSave = closableProductsForDate.filter(p => p.status === 'open');
    const unselectedProducts = openProductsForSave.filter(p => !selectedForClosing[p.product_id] || closingData[p.product_id] === '' || closingData[p.product_id] === null);
    
    if (unselectedProducts.length > 0) {
      const proceed = window.confirm(
        `${unselectedProducts.length} product(s) are not selected or don't have closing values. Do you want to proceed with only the selected products?`
      );
      if (!proceed) return;
    }

    setSavingClosing(true);
    try {
      await api.post(`/api/stock-status/close?date=${filterDate}`, { entries });
      toast.success(`Closed stock for ${entries.length} products`);
      loadStockStatus(filterDate);
      setShowClosingDialog(false);
    } catch (error) {
      console.error('Save closing error:', error);
      toast.error('Failed to save closing data');
    } finally {
      setSavingClosing(false);
    }
  };

  // Edit functionality
  const handleEdit = (item) => {
    setEditingItem(item);
    setEditFormData({
      opening_qty: item.opening_qty || 0,
      purchase_qty: item.purchase_qty || 0,
      dispatch_qty: item.dispatch_qty || 0,
      closing_qty: item.closing_qty || '',
      avg_price: item.avg_price || 0
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    
    try {
      const updates = {
        opening_qty: parseFloat(editFormData.opening_qty) || 0,
        purchase_qty: parseFloat(editFormData.purchase_qty) || 0,
        dispatch_qty: parseFloat(editFormData.dispatch_qty) || 0,
        avg_price: parseFloat(editFormData.avg_price) || 0
      };
      
      // If closing qty is provided, calculate wastage
      if (editFormData.closing_qty !== '' && editFormData.closing_qty !== null) {
        const closingQty = parseFloat(editFormData.closing_qty) || 0;
        const available = updates.opening_qty + updates.purchase_qty - updates.dispatch_qty;
        const wastage = Math.max(0, available - closingQty);
        const totalInput = updates.opening_qty + updates.purchase_qty;
        const wastagePercent = totalInput > 0 ? (wastage / totalInput) * 100 : 0;
        
        updates.closing_qty = closingQty;
        updates.wastage_qty = wastage;
        updates.wastage_value = wastage * updates.avg_price;
        updates.wastage_percent = wastagePercent;
        updates.status = 'closed';
      }
      
      await api.put(`/api/stock-status/${editingItem.id}`, updates);
      toast.success('Stock status updated successfully');
      setShowEditDialog(false);
      setEditingItem(null);
      loadStockStatus();
    } catch (error) {
      console.error('Save edit error:', error);
      toast.error('Failed to update stock status');
    }
  };

  // Delete functionality
  const handleDelete = (item) => {
    setDeletingItem(item);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    
    try {
      await api.delete(`/api/stock-status/${deletingItem.id}`);
      toast.success('Stock status entry deleted');
      setShowDeleteDialog(false);
      setDeletingItem(null);
      loadStockStatus();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete stock status entry');
    }
  };

  // Filter stock status by product - Also filter out items with zero opening qty
  const filteredStockStatus = (filterProduct === 'all' 
    ? stockStatus 
    : stockStatus.filter(s => s.product_id === filterProduct)
  ).filter(s => s.opening_qty > 0 || s.purchase_qty > 0 || s.dispatch_qty > 0);  // Only show items with activity

  // Products that can be closed (have opening or purchase activity)
  const closableProducts = stockStatus.filter(s => 
    s.status === 'open' && (s.opening_qty > 0 || s.purchase_qty > 0)
  );
  
  const openProducts = filteredStockStatus.filter(s => s.status === 'open');
  const closedProducts = filteredStockStatus.filter(s => s.status === 'closed');

  const totalOpeningKg = filteredStockStatus.reduce((sum, s) => sum + (s.opening_qty || 0), 0);
  const totalPurchaseKg = filteredStockStatus.reduce((sum, s) => sum + (s.purchase_qty || 0), 0);
  const totalDispatchKg = filteredStockStatus.reduce((sum, s) => sum + (s.dispatch_qty || 0), 0);
  const totalWastageKg = closedProducts.reduce((sum, s) => sum + (s.wastage_qty || 0), 0);

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Layout>
      <div data-testid="stock-status-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock Status</h1>
            <p className="text-gray-500 mt-1">{formatDisplayDate(filterDate)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={syncPackagingWeights} 
              disabled={syncingWeights}
              className="text-orange-600 border-orange-300 hover:bg-orange-50"
              title="Sync packaging weights from names"
            >
              <Settings size={14} className={`mr-1 ${syncingWeights ? 'animate-spin' : ''}`} />
              {syncingWeights ? 'Syncing...' : 'Sync Weights'}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={fixAllHistoricalDispatches} 
              disabled={recalculating}
              className="text-orange-600 border-orange-300 hover:bg-orange-50"
              title="Fix dispatch calculations for ALL historical dates (includes aliased products like Spinach→Palak)"
            >
              <RefreshCw size={14} className={`mr-1 ${recalculating ? 'animate-spin' : ''}`} />
              {recalculating ? 'Fixing All...' : 'Fix All Historical'}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={fixAllPurchaseQuantities} 
              disabled={fixingPurchases}
              className="text-red-600 border-red-300 hover:bg-red-50"
              title="Fix purchase quantities from raw procurement data (use if Excel backup values are wrong)"
            >
              <TrendingUp size={14} className={`mr-1 ${fixingPurchases ? 'animate-spin' : ''}`} />
              {fixingPurchases ? 'Fixing...' : 'Fix Purchases'}
            </Button>
            <Button onClick={handleOpenClosingDialog} className="bg-[#14532D] hover:bg-[#166534]" data-testid="enter-closing-btn">
              <Clock size={16} className="mr-2" /> Enter Closing
            </Button>
            <Button variant="outline" onClick={() => loadStockStatus()} data-testid="refresh-btn">
              <RefreshCw size={16} className="mr-2" /> Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  <Calendar size={14} className="inline mr-1" /> Date
                </label>
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  max={today}
                  className="w-full md:w-48"
                  data-testid="date-filter"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  <Filter size={14} className="inline mr-1" /> Product
                </label>
                <Select value={filterProduct} onValueChange={setFilterProduct}>
                  <SelectTrigger className="w-full md:w-64" data-testid="product-filter">
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="outline" 
                onClick={() => { setFilterDate(today); setFilterProduct('all'); loadStockStatus(today); }}
                data-testid="reset-filters-btn"
              >
                Reset
              </Button>
            </div>
            {isHistoricalView && (
              <div className="mt-3 p-2 bg-blue-50 text-blue-700 rounded text-sm">
                Viewing historical data for {formatDisplayDate(filterDate)}. Some features are read-only.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="text-blue-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Opening Stock</p>
                <p className="text-lg font-bold text-gray-900">{totalOpeningKg.toFixed(2)} Kg</p>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="text-green-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Purchased</p>
                <p className="text-lg font-bold text-green-600">+{totalPurchaseKg.toFixed(2)} Kg</p>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingDown className="text-orange-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Dispatched</p>
                <p className="text-lg font-bold text-orange-600">-{totalDispatchKg.toFixed(2)} Kg</p>
              </div>
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="text-red-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Wastage</p>
                <p className="text-lg font-bold text-red-600">{totalWastageKg.toFixed(2)} Kg</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Stock Status Table */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Daily Stock Status</span>
              <div className="flex gap-2 items-center">
                <Button size="sm" variant="outline" onClick={exportStockStatus} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
                <span className="text-xs font-normal bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                  {openProducts.length} Open
                </span>
                <span className="text-xs font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {closedProducts.length} Closed
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14532D]"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">PRODUCT</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">OPENING</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">PRICE</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">PURCHASE</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">DISPATCH</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">CLOSING</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">WASTAGE</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">%</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">STATUS</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">ACT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockStatus.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-6 text-center text-gray-500 text-sm">
                          No stock data found for this date/product.
                        </td>
                      </tr>
                    ) : (
                      filteredStockStatus.map((item) => {
                        const available = item.opening_qty + item.purchase_qty - item.dispatch_qty;
                        return (
                          <tr key={item.id} className={`border-b hover:bg-gray-50 ${item.status === 'closed' ? 'bg-green-50' : ''}`}>
                            <td className="p-2 font-medium text-xs">{item.product_name}</td>
                            <td className="p-2 text-right text-xs">{item.opening_qty?.toFixed(2)}</td>
                            <td className="p-2 text-right text-xs">₹{item.avg_price?.toFixed(2)}</td>
                            <td className="p-2 text-right text-xs text-green-600">
                              {item.purchase_qty > 0 ? `+${item.purchase_qty.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2 text-right text-xs text-orange-600">
                              {item.dispatch_qty > 0 ? `-${item.dispatch_qty.toFixed(2)}` : '-'}
                            </td>
                            <td className="p-2 text-right text-xs font-semibold">
                              {item.status === 'closed' ? (
                                item.closing_qty?.toFixed(2)
                              ) : (
                                <span className="text-gray-400 text-[10px]">
                                  ({available.toFixed(2)})
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-right text-xs">
                              {item.status === 'closed' ? (
                                <span className={`font-bold ${item.wastage_qty > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {item.wastage_qty?.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-2 text-right text-xs">
                              {item.status === 'closed' ? (
                                <span className={`font-bold ${item.wastage_percent > 5 ? 'text-red-600' : item.wastage_percent > 2 ? 'text-orange-600' : 'text-green-600'}`}>
                                  {item.wastage_percent?.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              {item.status === 'closed' ? (
                                <span className="inline-flex items-center gap-0.5 bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  <CheckCircle size={10} /> Done
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                  <Clock size={10} /> Open
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleEdit(item)}
                                  className="h-6 w-6 p-0"
                                  data-testid={`edit-${item.product_id}`}
                                >
                                  <Edit2 size={12} className="text-blue-600" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleDelete(item)}
                                  className="h-6 w-6 p-0"
                                  data-testid={`delete-${item.product_id}`}
                                >
                                  <Trash2 size={12} className="text-red-600" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredStockStatus.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td>TOTAL</td>
                        <td className="text-right">{totalOpeningKg.toFixed(2)}</td>
                        <td className="text-right">-</td>
                        <td className="text-right text-green-600">+{totalPurchaseKg.toFixed(2)}</td>
                        <td className="text-right text-orange-600">-{totalDispatchKg.toFixed(2)}</td>
                        <td className="text-right">
                          {closedProducts.reduce((sum, s) => sum + (s.closing_qty || 0), 0).toFixed(2)}
                        </td>
                        <td className="text-right text-red-600">{totalWastageKg.toFixed(2)}</td>
                        <td className="text-right">
                          {((totalWastageKg / (totalOpeningKg + totalPurchaseKg)) * 100 || 0).toFixed(1)}%
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Closing Entry Dialog - With checkboxes for multi-select */}
        <Dialog open={showClosingDialog} onOpenChange={setShowClosingDialog}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enter Closing Stock - {formatDisplayDate(filterDate)}</DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  Select products and enter closing quantities (in Kg). Wastage will be auto-calculated.
                </p>
                {closableProductsForDate.filter(p => p.status === 'open').length > 0 && (
                  <Button variant="outline" size="sm" onClick={selectAllForClosing}>
                    Select All Open
                  </Button>
                )}
              </div>
              
              {closableProductsForDate.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No products with stock activity for this date. Add purchases or dispatches first.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2 w-10 text-center">
                          <CheckCircle size={14} />
                        </th>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-right">Opening</th>
                        <th className="p-2 text-right">Purchase</th>
                        <th className="p-2 text-right">Dispatch</th>
                        <th className="p-2 text-right">Available</th>
                        <th className="p-2 text-center w-28">Closing</th>
                        <th className="p-2 text-right">Wastage</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closableProductsForDate.map((item) => {
                        const available = item.opening_qty + item.purchase_qty - item.dispatch_qty;
                        const closingQty = closingData[item.product_id] !== '' && closingData[item.product_id] !== undefined ? parseFloat(closingData[item.product_id]) : null;
                        const wastage = closingQty !== null ? Math.max(0, available - closingQty) : null;
                        const isSelected = selectedForClosing[item.product_id];
                        const isClosed = item.status === 'closed';
                        
                        return (
                          <tr key={item.product_id} className={`border-t ${isSelected ? 'bg-green-50' : ''} ${isClosed ? 'bg-gray-50 opacity-60' : ''}`}>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected || false}
                                onChange={() => toggleClosingSelection(item.product_id)}
                                disabled={isClosed}
                                className="w-4 h-4"
                              />
                            </td>
                            <td className="p-2 font-medium">{item.product_name}</td>
                            <td className="p-2 text-right">{item.opening_qty.toFixed(2)}</td>
                            <td className="p-2 text-right text-green-700">{item.purchase_qty > 0 ? `+${item.purchase_qty.toFixed(2)}` : '-'}</td>
                            <td className="p-2 text-right text-red-700">{item.dispatch_qty > 0 ? `-${item.dispatch_qty.toFixed(2)}` : '-'}</td>
                            <td className="p-2 text-right font-semibold text-blue-700">{available.toFixed(2)}</td>
                            <td className="p-2 text-center">
                              {isClosed ? (
                                <span className="text-gray-600">{item.closing_qty?.toFixed(2)}</span>
                              ) : (
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  value={closingData[item.product_id] || ''}
                                  onChange={(e) => {
                                    handleClosingQtyChange(item.product_id, e.target.value);
                                    // Auto-select when entering value
                                    if (e.target.value && !isSelected) {
                                      toggleClosingSelection(item.product_id);
                                    }
                                  }}
                                  className="w-24 h-8 text-right text-sm"
                                  data-testid={`closing-input-${item.product_id}`}
                                />
                              )}
                            </td>
                            <td className="p-2 text-right">
                              {isClosed ? (
                                <span className="text-red-600">{(item.opening_qty + item.purchase_qty - item.dispatch_qty - (item.closing_qty || 0)).toFixed(2)}</span>
                              ) : wastage !== null ? (
                                <span className={`font-bold ${wastage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {wastage.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              {isClosed ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Closed</span>
                              ) : (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">Open</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Summary */}
              {closableProductsForDate.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">{closableProductsForDate.filter(p => p.status === 'open').length}</span> open, 
                    <span className="font-medium ml-2">{closableProductsForDate.filter(p => p.status === 'closed').length}</span> closed
                  </div>
                  <div className="text-sm text-gray-600">
                    Selected: <span className="font-bold text-green-700">{Object.values(selectedForClosing).filter(Boolean).length}</span>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClosingDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveClosing} 
                disabled={savingClosing || Object.values(selectedForClosing).filter(Boolean).length === 0}
                className="bg-[#14532D] hover:bg-[#166534]"
                data-testid="save-closing-btn"
              >
                {savingClosing ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span> Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" /> Save Closing ({Object.values(selectedForClosing).filter(Boolean).length})
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Stock Status - {editingItem?.product_name}</DialogTitle>
            </DialogHeader>
            
            <div className="py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Opening Qty (Kg)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.opening_qty || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, opening_qty: e.target.value }))}
                  data-testid="edit-opening-qty"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Avg Price (₹/Kg)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.avg_price || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, avg_price: e.target.value }))}
                  data-testid="edit-avg-price"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Purchase Qty (Kg)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.purchase_qty || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, purchase_qty: e.target.value }))}
                  data-testid="edit-purchase-qty"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Dispatch Qty (Kg)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editFormData.dispatch_qty || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, dispatch_qty: e.target.value }))}
                  data-testid="edit-dispatch-qty"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Closing Qty (Kg) - Optional</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Leave empty to keep open"
                  value={editFormData.closing_qty || ''}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, closing_qty: e.target.value }))}
                  data-testid="edit-closing-qty"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter closing qty to mark as closed and auto-calculate wastage
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveEdit}
                className="bg-[#14532D] hover:bg-[#166534]"
                data-testid="save-edit-btn"
              >
                <Save size={16} className="mr-2" /> Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Stock Status Entry</DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <p className="text-gray-600">
                Are you sure you want to delete the stock status entry for <strong>{deletingItem?.product_name}</strong>?
              </p>
              <p className="text-sm text-red-600 mt-2">
                This action cannot be undone.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700"
                data-testid="confirm-delete-btn"
              >
                <Trash2 size={16} className="mr-2" /> Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
