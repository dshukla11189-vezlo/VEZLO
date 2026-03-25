import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Download } from 'lucide-react';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const response = await api.get('/api/invoices');
      setInvoices(response.data);
    } catch (error) {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleDownload = async (invoiceId, invoiceNumber) => {
    try {
      const response = await api.get(`/api/invoices/${invoiceId}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Invoice downloaded');
    } catch (error) {
      toast.error('Failed to download invoice');
    }
  };

  return (
    <Layout title="Invoices">
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>INVOICE #</th>
              <th>DATE</th>
              <th>PARTY TYPE</th>
              <th>PARTY NAME</th>
              <th className="text-right">TOTAL</th>
              <th className="text-right">PAID</th>
              <th className="text-right">PENDING</th>
              <th className="text-center">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                <td className="font-medium">{invoice.invoice_number}</td>
                <td>{formatDate(invoice.date)}</td>
                <td>
                  <span className="badge badge-neutral">{invoice.party_type}</span>
                </td>
                <td>{invoice.party_name}</td>
                <td className="text-right font-semibold">₹{invoice.total_amount?.toFixed(2)}</td>
                <td className="text-right text-green-700">₹{invoice.paid_amount?.toFixed(2)}</td>
                <td className="text-right text-red-700">₹{invoice.pending_amount?.toFixed(2)}</td>
                <td>
                  <div className="flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(invoice.id, invoice.invoice_number)}
                      data-testid={`download-invoice-${invoice.id}`}
                    >
                      <Download size={16} className="text-blue-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No invoices found.
          </div>
        )}
      </div>
    </Layout>
  );
}