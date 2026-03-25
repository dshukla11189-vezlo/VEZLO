import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus } from 'lucide-react';

export default function Procurement() {
  const [procurements, setProcurements] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [procRes, farmRes, prodRes] = await Promise.all([
        api.get('/api/procurement'),
        api.get('/api/farmers'),
        api.get('/api/products')
      ]);
      setProcurements(procRes.data);
      setFarmers(farmRes.data);
      setProducts(prodRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Procurement">
      <div className="mb-6 flex justify-end">
        <Button className="bg-[#14532D] hover:bg-[#166534]" onClick={() => setOpen(true)} data-testid="add-procurement-button">
          <Plus size={16} className="mr-2" />
          Add Procurement
        </Button>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>DATE</th>
              <th>FARMER</th>
              <th>PRODUCTS</th>
              <th className="text-right">TOTAL AMOUNT</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {procurements.map((proc) => (
              <tr key={proc.id} data-testid={`procurement-row-${proc.id}`}>
                <td>{formatDate(proc.date)}</td>
                <td className="font-medium">{proc.farmer_name}</td>
                <td>{proc.products?.length || 0} items</td>
                <td className="text-right font-semibold">₹{proc.total_amount?.toFixed(2)}</td>
                <td>
                  <span className="badge badge-success">{proc.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {procurements.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No procurement records found.
          </div>
        )}
      </div>
    </Layout>
  );
}