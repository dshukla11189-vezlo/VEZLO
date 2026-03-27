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
import { Package, TrendingUp, TrendingDown, AlertTriangle, Save, RefreshCw, Clock, CheckCircle, ArrowRight, Edit2, Trash2, Filter, Calendar, Search } from 'lucide-react';

export default function StockStatus() {
  const { t } = useTranslation();
  const [stockStatus, setStockStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingData, setClosingData] = useState({});
  const [savingClosing, setSavingClosing] = useState(false);
  const [showClosingDialog, setShowClosingDialog] = useState(false);
  const [products, setProducts] = useState([]);
  
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
      
      // Check if viewing historical data or today
      if (targetDate === today) {
        setIsHistoricalView(false);
        const response = await api.get('/api/stock-status/today');
        setStockStatus(response.data);
        
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
        setStockStatus(response.data);
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

  // Auto-refresh for real-time updates (only for today's view)
  useEffect(() => {
    if (!isHistoricalView) {
      const interval = setInterval(() => {
        loadStockStatus();
      }, AUTO_REFRESH_INTERVAL);
      
      return () => clearInterval(interval);
    }
  }, [isHistoricalView, loadStockStatus]);

  const handleDateChange = (newDate) => {
    setFilterDate(newDate);
    loadStockStatus(newDate);
  };

  const handleClosingQtyChange = (productId, value) => {
    setClosingData(prev => ({
      ...prev,
      [productId]: value
    }));
  };

  const handleSaveClosing = async () => {
    const entries = Object.keys(closingData)
      .filter(productId => closingData[productId] !== '' && closingData[productId] !== null)
      .map(productId => ({
        product_id: productId,
        closing_qty: parseFloat(closingData[productId]) || 0
      }));

    if (entries.length === 0) {
      toast.error('Enter closing quantities for at least one product');
      return;
    }

    setSavingClosing(true);
    try {
      await api.post('/api/stock-status/close', { entries });
      toast.success(`Closed stock for ${entries.length} products`);
      loadStockStatus();
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

  // Filter stock status by product
  const filteredStockStatus = filterProduct === 'all' 
    ? stockStatus 
    : stockStatus.filter(s => s.product_id === filterProduct);

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
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => loadStockStatus()} data-testid="refresh-btn">
              <RefreshCw size={16} className="mr-2" /> Refresh
            </Button>
            {!isHistoricalView && closableProducts.length > 0 && (
              <Button onClick={() => setShowClosingDialog(true)} className="bg-[#14532D] hover:bg-[#166534]" data-testid="enter-closing-btn">
                <Clock size={16} className="mr-2" /> Enter Closing Stock
              </Button>
            )}
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Opening Stock</p>
                  <p className="text-2xl font-bold text-gray-900">{totalOpeningKg.toFixed(2)} Kg</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Package className="text-blue-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Purchased</p>
                  <p className="text-2xl font-bold text-green-600">+{totalPurchaseKg.toFixed(2)} Kg</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <TrendingUp className="text-green-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Dispatched</p>
                  <p className="text-2xl font-bold text-orange-600">-{totalDispatchKg.toFixed(2)} Kg</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <TrendingDown className="text-orange-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Wastage</p>
                  <p className="text-2xl font-bold text-red-600">{totalWastageKg.toFixed(2)} Kg</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="text-red-600" size={24} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stock Status Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Daily Stock Status</span>
              <div className="flex gap-2">
                <span className="text-sm font-normal bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
                  {openProducts.length} Open
                </span>
                <span className="text-sm font-normal bg-green-100 text-green-700 px-3 py-1 rounded-full">
                  {closedProducts.length} Closed
                </span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
              </div>
            ) : (
              <div className="data-table overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>PRODUCT</th>
                      <th className="text-right">OPENING (Kg)</th>
                      <th className="text-right">AVG PRICE (₹/Kg)</th>
                      <th className="text-right">PURCHASE (Kg)</th>
                      <th className="text-right">DISPATCH (Kg)</th>
                      <th className="text-right">CLOSING (Kg)</th>
                      <th className="text-right">WASTAGE (Kg)</th>
                      <th className="text-right">WASTAGE %</th>
                      <th className="text-center">STATUS</th>
                      <th className="text-center">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStockStatus.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center text-gray-500 py-8">
                          No stock data found for this date/product.
                        </td>
                      </tr>
                    ) : (
                      filteredStockStatus.map((item) => {
                        const available = item.opening_qty + item.purchase_qty - item.dispatch_qty;
                        return (
                          <tr key={item.id} className={item.status === 'closed' ? 'bg-green-50' : ''}>
                            <td className="font-medium">{item.product_name}</td>
                            <td className="text-right">{item.opening_qty?.toFixed(2)}</td>
                            <td className="text-right">₹{item.avg_price?.toFixed(2)}</td>
                            <td className="text-right text-green-600">
                              {item.purchase_qty > 0 ? `+${item.purchase_qty.toFixed(2)}` : '-'}
                            </td>
                            <td className="text-right text-orange-600">
                              {item.dispatch_qty > 0 ? `-${item.dispatch_qty.toFixed(2)}` : '-'}
                            </td>
                            <td className="text-right font-semibold">
                              {item.status === 'closed' ? (
                                item.closing_qty?.toFixed(2)
                              ) : (
                                <span className="text-gray-400">
                                  (Avail: {available.toFixed(2)})
                                </span>
                              )}
                            </td>
                            <td className="text-right">
                              {item.status === 'closed' ? (
                                <span className={`font-bold ${item.wastage_qty > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {item.wastage_qty?.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="text-right">
                              {item.status === 'closed' ? (
                                <span className={`font-bold ${item.wastage_percent > 5 ? 'text-red-600' : item.wastage_percent > 2 ? 'text-orange-600' : 'text-green-600'}`}>
                                  {item.wastage_percent?.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="text-center">
                              {item.status === 'closed' ? (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                                  <CheckCircle size={12} /> Closed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-medium">
                                  <Clock size={12} /> Open
                                </span>
                              )}
                            </td>
                            <td className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleEdit(item)}
                                  className="h-8 w-8 p-0"
                                  data-testid={`edit-${item.product_id}`}
                                >
                                  <Edit2 size={14} className="text-blue-600" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleDelete(item)}
                                  className="h-8 w-8 p-0"
                                  data-testid={`delete-${item.product_id}`}
                                >
                                  <Trash2 size={14} className="text-red-600" />
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

        {/* Closing Entry Dialog - Only show products with activity */}
        <Dialog open={showClosingDialog} onOpenChange={setShowClosingDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enter Closing Stock for Today</DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <p className="text-sm text-gray-500 mb-4">
                Enter the actual closing quantity (in Kg) for products with stock activity. Wastage will be auto-calculated.
              </p>
              
              {closableProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No products with stock activity today. Add purchases or dispatches first.
                </div>
              ) : (
                <div className="space-y-3">
                  {closableProducts.map((item) => {
                    const available = item.opening_qty + item.purchase_qty - item.dispatch_qty;
                    const closingQty = closingData[item.product_id] !== '' ? parseFloat(closingData[item.product_id]) : null;
                    const wastage = closingQty !== null ? Math.max(0, available - closingQty) : null;
                    
                    return (
                      <div key={item.product_id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-sm text-gray-500">
                            Opening: {item.opening_qty.toFixed(2)}Kg + Purchase: {item.purchase_qty.toFixed(2)}Kg - Dispatch: {item.dispatch_qty.toFixed(2)}Kg = 
                            <span className="font-semibold text-blue-600"> Available: {available.toFixed(2)}Kg</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-32">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Closing Kg"
                              value={closingData[item.product_id] || ''}
                              onChange={(e) => handleClosingQtyChange(item.product_id, e.target.value)}
                              className="text-right"
                              data-testid={`closing-input-${item.product_id}`}
                            />
                          </div>
                          <ArrowRight size={16} className="text-gray-400" />
                          <div className="w-24 text-right">
                            {wastage !== null ? (
                              <span className={`font-bold ${wastage > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {wastage.toFixed(2)} Kg
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                            <p className="text-xs text-gray-500">Wastage</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClosingDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveClosing} 
                disabled={savingClosing || closableProducts.length === 0}
                className="bg-[#14532D] hover:bg-[#166534]"
                data-testid="save-closing-btn"
              >
                {savingClosing ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span> Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" /> Save Closing Stock
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
