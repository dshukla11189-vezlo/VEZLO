import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Package, TruckIcon, ShoppingCart, DollarSign, Trash2, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await api.get('/api/reports/dashboard');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title={t('app.dashboard')}>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </Layout>
    );
  }

  const statCards = [
    {
      title: t('dashboard.totalProducts'),
      value: stats?.total_products || 0,
      icon: Package,
      color: 'text-[#14532D]',
      bg: 'bg-green-50'
    },
    {
      title: t('dashboard.stockValue'),
      value: `₹${stats?.total_stock_value?.toFixed(2) || 0}`,
      icon: DollarSign,
      color: 'text-[#D97706]',
      bg: 'bg-orange-50'
    },
    {
      title: t('dashboard.todayQcOrders'),
      value: stats?.today_qc_orders || 0,
      icon: ShoppingCart,
      color: 'text-blue-700',
      bg: 'bg-blue-50'
    },
    {
      title: t('dashboard.todayRetailerOrders'),
      value: stats?.today_retailer_orders || 0,
      icon: TruckIcon,
      color: 'text-purple-700',
      bg: 'bg-purple-50'
    },
    {
      title: t('dashboard.pendingPayments'),
      value: `₹${stats?.pending_payments?.toFixed(2) || 0}`,
      icon: AlertCircle,
      color: 'text-red-700',
      bg: 'bg-red-50'
    },
    {
      title: t('dashboard.todayWastage'),
      value: stats?.today_wastage?.toFixed(2) || 0,
      icon: Trash2,
      color: 'text-gray-700',
      bg: 'bg-gray-50'
    },
  ];

  return (
    <Layout title={t('app.dashboard')}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="stat-card" data-testid={`stat-card-${index}`}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                    <p className="text-3xl font-bold text-gray-900" data-testid={`stat-value-${index}`}>{stat.value}</p>
                  </div>
                  <div className={`${stat.bg} p-3 rounded-lg`}>
                    <Icon className={`${stat.color}`} size={24} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            {t('dashboard.welcomeMessage')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-xs font-medium text-green-900 uppercase tracking-wider mb-2">{t('dashboard.status')}</p>
              <p className="text-lg font-semibold text-green-700">{t('dashboard.allSystemsOperational')}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-medium text-blue-900 uppercase tracking-wider mb-2">{t('dashboard.quickActions')}</p>
              <p className="text-sm text-blue-700">{t('dashboard.recordNewOrders')}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-xs font-medium text-orange-900 uppercase tracking-wider mb-2">{t('dashboard.reminders')}</p>
              <p className="text-sm text-orange-700">{t('dashboard.updateDaily')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}