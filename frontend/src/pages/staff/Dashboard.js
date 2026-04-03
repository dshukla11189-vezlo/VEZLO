import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent } from '../../components/ui/card';
import { Package, TruckIcon, Trash2 } from 'lucide-react';

export default function StaffDashboard() {
  const [stats, setStats] = useState({ products: 0, stock: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await api.get('/api/reports/dashboard');
      setStats({
        products: response.data.total_products || 0,
        stock: response.data.total_stock_value || 0
      });
    } catch (error) {
      toast.error('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Staff Dashboard">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Total Products</p>
                <p className="text-3xl font-bold text-gray-900">{stats.products}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <Package className="text-green-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Stock Value</p>
                <p className="text-3xl font-bold text-gray-900">₹{stats.stock?.toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <TruckIcon className="text-blue-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">Quick Actions</p>
                <p className="text-sm text-gray-600 mt-2">Manage inventory & wastage</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <Trash2 className="text-orange-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Welcome to Mr Organix</h3>
          <p className="text-gray-600 mb-4">
            As a warehouse staff member, you can manage products, record procurement, and update wastage records.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm font-medium text-green-900">Products</p>
              <p className="text-xs text-green-700 mt-1">Add & update product inventory</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900">Procurement</p>
              <p className="text-xs text-blue-700 mt-1">Record daily farmer purchases</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm font-medium text-orange-900">Wastage</p>
              <p className="text-xs text-orange-700 mt-1">Track daily wastage & losses</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}