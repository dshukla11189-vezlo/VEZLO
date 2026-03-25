import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Plus, Upload } from 'lucide-react';

export default function QCOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const response = await api.get('/api/qc-orders');
      setOrders(response.data);
    } catch (error) {
      toast.error('Failed to load QC orders');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleOCRUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/api/qc-orders/ocr', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Image processed successfully!');
      console.log('Extracted data:', response.data);
    } catch (error) {
      toast.error('OCR processing failed');
    }
  };

  return (
    <Layout title="QC Orders">
      <div className="mb-6 flex justify-end gap-3">
        <Button variant="outline" className="relative" data-testid="ocr-upload-button">
          <Upload size={16} className="mr-2" />
          Upload Excel Image (OCR)
          <input
            type="file"
            accept="image/*"
            onChange={handleOCRUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
            data-testid="ocr-file-input"
          />
        </Button>
        <Button className="bg-[#14532D] hover:bg-[#166534]" data-testid="add-qc-order-button">
          <Plus size={16} className="mr-2" />
          Add QC Order
        </Button>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>COMPANY</th>
              <th>PRODUCTS</th>
              <th className="text-right">TOTAL AMOUNT</th>
              <th>STATUS</th>
              <th>DELIVERY DATE</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} data-testid={`qc-order-row-${order.id}`}>
                <td>{formatDate(order.order_date)}</td>
                <td className="font-medium">{order.company_name}</td>
                <td>{order.products?.length || 0} items</td>
                <td className="text-right font-semibold">₹{order.total_amount?.toFixed(2)}</td>
                <td>
                  <span className={`badge ${order.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>
                    {order.status}
                  </span>
                </td>
                <td>{order.delivery_date ? formatDate(order.delivery_date) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No QC orders found.
          </div>
        )}
      </div>
    </Layout>
  );
}