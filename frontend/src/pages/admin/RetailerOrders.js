import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';

export default function RetailerOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const response = await api.get('/api/retailer-orders');
      setOrders(response.data);
    } catch (error) {
      toast.error('Failed to load retailer orders');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleStatusUpdate = async (orderId, status) => {
    try {
      await api.put(`/api/retailer-orders/${orderId}/status`, { status });
      toast.success('Order status updated');
      loadOrders();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  return (
    <Layout title="Retailer Orders">
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>RETAILER</th>
              <th>PRODUCTS</th>
              <th className="text-right">TOTAL AMOUNT</th>
              <th>STATUS</th>
              <th className="text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} data-testid={`retailer-order-row-${order.id}`}>
                <td>{formatDate(order.order_date)}</td>
                <td className="font-medium">{order.retailer_name}</td>
                <td>{order.products?.length || 0} items</td>
                <td className="text-right font-semibold">₹{order.total_amount?.toFixed(2)}</td>
                <td>
                  <span className={`badge ${
                    order.status === 'approved' ? 'badge-success' : 
                    order.status === 'rejected' ? 'badge-error' : 'badge-warning'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td>
                  <div className="flex items-center justify-center gap-2">
                    {order.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleStatusUpdate(order.id, 'approved')}
                          data-testid={`approve-order-${order.id}`}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleStatusUpdate(order.id, 'rejected')}
                          data-testid={`reject-order-${order.id}`}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No retailer orders found.
          </div>
        )}
      </div>
    </Layout>
  );
}