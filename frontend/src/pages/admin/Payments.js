import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      const response = await api.get('/api/payments');
      setPayments(response.data);
    } catch (error) {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Payments">
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>PARTY TYPE</th>
              <th>PARTY NAME</th>
              <th className="text-right">AMOUNT</th>
              <th>PAYMENT MODE</th>
              <th>REFERENCE</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} data-testid={`payment-row-${payment.id}`}>
                <td>{formatDate(payment.date)}</td>
                <td>
                  <span className="badge badge-neutral">{payment.party_type}</span>
                </td>
                <td className="font-medium">{payment.party_name}</td>
                <td className="text-right font-semibold">₹{payment.amount?.toFixed(2)}</td>
                <td>{payment.payment_mode}</td>
                <td className="text-gray-500">{payment.reference || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No payment records found.
          </div>
        )}
      </div>
    </Layout>
  );
}