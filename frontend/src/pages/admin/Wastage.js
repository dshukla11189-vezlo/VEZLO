import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';

export default function Wastage() {
  const [wastages, setWastages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWastages();
  }, []);

  const loadWastages = async () => {
    try {
      const response = await api.get('/api/wastage');
      setWastages(response.data);
    } catch (error) {
      toast.error('Failed to load wastage records');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Wastage Management">
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>PRODUCTS</th>
              <th className="text-right">TOTAL QUANTITY</th>
            </tr>
          </thead>
          <tbody>
            {wastages.map((wastage) => (
              <tr key={wastage.id} data-testid={`wastage-row-${wastage.id}`}>
                <td>{formatDate(wastage.date)}</td>
                <td>{wastage.products?.length || 0} items</td>
                <td className="text-right font-semibold">
                  {wastage.products?.reduce((sum, p) => sum + p.quantity, 0).toFixed(2)} Kg
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {wastages.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No wastage records found.
          </div>
        )}
      </div>
    </Layout>
  );
}