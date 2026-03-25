import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent } from '../../components/ui/card';
import { ShoppingCart, FileText, DollarSign } from 'lucide-react';

export default function RetailerDashboard() {
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [ordersRes, invoicesRes] = await Promise.all([
        api.get('/api/retailer-orders'),
        api.get('/api/invoices')
      ]);
      setOrders(ordersRes.data);
      setInvoices(invoicesRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const totalPending = invoices.reduce((sum, inv) => sum + (inv.pending_amount || 0), 0);
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Retailer Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">My Orders</p>
                <p className="text-3xl font-bold text-gray-900">{orders.length}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <ShoppingCart className="text-blue-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Total Invoices</p>
                <p className="text-3xl font-bold text-gray-900">{invoices.length}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <FileText className="text-green-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Pending Payment</p>
                <p className="text-3xl font-bold text-gray-900">₹{totalPending.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <DollarSign className="text-red-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Orders</h3>
            <div className="space-y-3">
              {orders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatDate(order.order_date)}</p>
                    <p className="text-xs text-gray-500">{order.products?.length} items</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">₹{order.total_amount?.toFixed(2)}</p>
                    <span className={`text-xs badge ${
                      order.status === 'approved' ? 'badge-success' : 
                      order.status === 'rejected' ? 'badge-error' : 'badge-warning'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No orders yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Invoices</h3>
            <div className="space-y-3">
              {invoices.filter(inv => inv.pending_amount > 0).slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{invoice.invoice_number}</p>
                    <p className="text-xs text-gray-500">{formatDate(invoice.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-700">₹{invoice.pending_amount?.toFixed(2)}</p>
                  </div>
                </div>
              ))}
              {invoices.filter(inv => inv.pending_amount > 0).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No pending invoices</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}