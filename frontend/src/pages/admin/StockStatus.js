import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Package, TrendingUp, TrendingDown, AlertTriangle, Save, RefreshCw, Clock, CheckCircle, ArrowRight } from 'lucide-react';

export default function StockStatus() {
  const { t } = useTranslation();
  const [stockStatus, setStockStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closingData, setClosingData] = useState({});
  const [savingClosing, setSavingClosing] = useState(false);
  const [showClosingDialog, setShowClosingDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    loadStockStatus();
  }, []);

  const loadStockStatus = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/stock-status/today');
      setStockStatus(response.data);
      
      // Initialize closing data for open products
      const initialClosingData = {};
      response.data.forEach(item => {
        if (item.status === 'open') {
          initialClosingData[item.product_id] = item.closing_qty || '';
        }
      });
      setClosingData(initialClosingData);
    } catch (error) {
      console.error('Load stock status error:', error);
      toast.error('Failed to load stock status');
    } finally {
      setLoading(false);
    }
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

  const openProducts = stockStatus.filter(s => s.status === 'open');
  const closedProducts = stockStatus.filter(s => s.status === 'closed');

  const totalOpeningKg = stockStatus.reduce((sum, s) => sum + (s.opening_qty || 0), 0);
  const totalPurchaseKg = stockStatus.reduce((sum, s) => sum + (s.purchase_qty || 0), 0);
  const totalDispatchKg = stockStatus.reduce((sum, s) => sum + (s.dispatch_qty || 0), 0);
  const totalWastageKg = closedProducts.reduce((sum, s) => sum + (s.wastage_qty || 0), 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
      </div>
    );
  }

  return (
    <div className="p-6" data-testid="stock-status-page">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Status</h1>
          <p className="text-gray-500 mt-1">{today}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={loadStockStatus}>
            <RefreshCw size={16} className="mr-2" /> Refresh
          </Button>
          {openProducts.length > 0 && (
            <Button onClick={() => setShowClosingDialog(true)} className="bg-[#14532D] hover:bg-[#166534]">
              <Clock size={16} className="mr-2" /> Enter Closing Stock
            </Button>
          )}
        </div>
      </div>

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
                <p className="text-sm text-gray-500">Purchased Today</p>
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
                <p className="text-sm text-gray-500">Dispatched Today</p>
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
                </tr>
              </thead>
              <tbody>
                {stockStatus.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-gray-500 py-8">
                      No products found. Add products in the system first.
                    </td>
                  </tr>
                ) : (
                  stockStatus.map((item) => {
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
                              (Available: {available.toFixed(2)})
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
                      </tr>
                    );
                  })
                )}
              </tbody>
              {stockStatus.length > 0 && (
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
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Closing Entry Dialog */}
      <Dialog open={showClosingDialog} onOpenChange={setShowClosingDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enter Closing Stock for Today</DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">
              Enter the actual closing quantity (in Kg) for each product. Wastage will be auto-calculated.
            </p>
            
            <div className="space-y-3">
              {openProducts.map((item) => {
                const available = item.opening_qty + item.purchase_qty - item.dispatch_qty;
                const closingQty = closingData[item.product_id] !== '' ? parseFloat(closingData[item.product_id]) : null;
                const wastage = closingQty !== null ? Math.max(0, available - closingQty) : null;
                
                return (
                  <div key={item.product_id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-sm text-gray-500">
                        Opening: {item.opening_qty}Kg + Purchase: {item.purchase_qty}Kg - Dispatch: {item.dispatch_qty}Kg = 
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClosingDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveClosing} 
              disabled={savingClosing}
              className="bg-[#14532D] hover:bg-[#166534]"
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
    </div>
  );
}
