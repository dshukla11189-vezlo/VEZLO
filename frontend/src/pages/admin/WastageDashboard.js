import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { AlertTriangle, TrendingDown, TrendingUp, DollarSign, Scale, Calendar, BarChart3 } from 'lucide-react';

export default function WastageDashboard() {
  const { t } = useTranslation();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(7);

  useEffect(() => {
    loadDashboardData();
  }, [selectedPeriod]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/stock-status/wastage-dashboard?days=${selectedPeriod}`);
      setDashboardData(response.data);
    } catch (error) {
      console.error('Load wastage dashboard error:', error);
      toast.error('Failed to load wastage data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    });
  };

  const getWastageColor = (percent) => {
    if (percent > 10) return 'text-red-600 bg-red-100';
    if (percent > 5) return 'text-orange-600 bg-orange-100';
    if (percent > 2) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const getBarHeight = (value, max) => {
    if (max === 0) return 0;
    return Math.min(100, (value / max) * 100);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
      </div>
    );
  }

  const summary = dashboardData?.summary || {};
  const dailyTrend = dashboardData?.daily_trend || [];
  const topProducts = dashboardData?.top_wastage_products || [];
  const maxDailyWastage = Math.max(...dailyTrend.map(d => d.total_wastage_kg), 1);

  return (
    <div className="p-6" data-testid="wastage-dashboard-page">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wastage Dashboard</h1>
          <p className="text-gray-500 mt-1">
            {dashboardData?.start_date} to {dashboardData?.end_date}
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 15, 30].map(days => (
            <Button
              key={days}
              variant={selectedPeriod === days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedPeriod(days)}
              className={selectedPeriod === days ? 'bg-[#14532D] hover:bg-[#166534]' : ''}
            >
              {days} Days
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Wastage</p>
                <p className="text-2xl font-bold text-red-600">{summary.total_wastage_kg?.toFixed(2)} Kg</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="text-red-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Value Lost</p>
                <p className="text-2xl font-bold text-red-600">₹{summary.total_wastage_value?.toFixed(0)}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <DollarSign className="text-red-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Daily Avg Wastage</p>
                <p className="text-2xl font-bold text-orange-600">{summary.avg_daily_wastage_kg?.toFixed(2)} Kg</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <Scale className="text-orange-600" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Wastage Rate</p>
                <p className={`text-2xl font-bold ${summary.overall_wastage_percent > 5 ? 'text-red-600' : summary.overall_wastage_percent > 2 ? 'text-orange-600' : 'text-green-600'}`}>
                  {summary.overall_wastage_percent?.toFixed(1)}%
                </p>
              </div>
              <div className={`p-3 rounded-full ${summary.overall_wastage_percent > 5 ? 'bg-red-100' : summary.overall_wastage_percent > 2 ? 'bg-orange-100' : 'bg-green-100'}`}>
                <BarChart3 className={summary.overall_wastage_percent > 5 ? 'text-red-600' : summary.overall_wastage_percent > 2 ? 'text-orange-600' : 'text-green-600'} size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} /> Daily Wastage Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dailyTrend.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No wastage data available for this period.
                <p className="text-sm mt-2">Start closing daily stock to see trends.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Bar Chart */}
                <div className="flex items-end gap-2 h-48 px-2">
                  {dailyTrend.map((day, idx) => {
                    const height = getBarHeight(day.total_wastage_kg, maxDailyWastage);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex flex-col items-center">
                          <span className="text-xs text-gray-500 mb-1">{day.total_wastage_kg.toFixed(1)}</span>
                          <div 
                            className={`w-full rounded-t transition-all ${
                              day.avg_wastage_percent > 5 ? 'bg-red-500' : 
                              day.avg_wastage_percent > 2 ? 'bg-orange-500' : 'bg-green-500'
                            }`}
                            style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 mt-1 transform -rotate-45 origin-top-left">
                          {formatDate(day.date)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-4 text-xs mt-4">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-500"></div> &lt;2%
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-orange-500"></div> 2-5%
                  </span>
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-500"></div> &gt;5%
                  </span>
                </div>

                {/* Daily Details Table */}
                <div className="mt-4 max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b">
                        <th className="text-left py-2">Date</th>
                        <th className="text-right py-2">Wastage (Kg)</th>
                        <th className="text-right py-2">Value (₹)</th>
                        <th className="text-right py-2">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyTrend.map((day, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="py-2">{formatDate(day.date)}</td>
                          <td className="text-right">{day.total_wastage_kg.toFixed(2)}</td>
                          <td className="text-right">₹{day.total_wastage_value.toFixed(0)}</td>
                          <td className="text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getWastageColor(day.avg_wastage_percent)}`}>
                              {day.avg_wastage_percent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Wastage Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown size={20} /> Top Wastage Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No product wastage data available.
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, idx) => {
                  const maxWastage = topProducts[0]?.total_wastage_kg || 1;
                  const barWidth = (product.total_wastage_kg / maxWastage) * 100;
                  
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="w-6 text-center text-sm font-medium text-gray-400">
                        #{idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium text-sm">{product.product_name}</span>
                          <span className="text-sm text-gray-600">
                            {product.total_wastage_kg.toFixed(2)} Kg
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-red-500 rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>₹{product.total_wastage_value.toFixed(0)} lost</span>
                          <span>{product.days_count} days</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      {dailyTrend.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Insights & Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {summary.overall_wastage_percent > 5 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-red-600 mt-0.5" size={20} />
                    <div>
                      <p className="font-medium text-red-700">High Wastage Alert</p>
                      <p className="text-sm text-red-600 mt-1">
                        Overall wastage is {summary.overall_wastage_percent.toFixed(1)}% which is above the 5% threshold. 
                        Review procurement quantities and storage conditions.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {topProducts.length > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <TrendingDown className="text-orange-600 mt-0.5" size={20} />
                    <div>
                      <p className="font-medium text-orange-700">Focus Product</p>
                      <p className="text-sm text-orange-600 mt-1">
                        <strong>{topProducts[0]?.product_name}</strong> has the highest wastage at {topProducts[0]?.total_wastage_kg.toFixed(2)} Kg.
                        Consider adjusting procurement or improving storage.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {summary.overall_wastage_percent <= 2 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <TrendingUp className="text-green-600 mt-0.5" size={20} />
                    <div>
                      <p className="font-medium text-green-700">Great Performance!</p>
                      <p className="text-sm text-green-600 mt-1">
                        Wastage is under 2% which is excellent. Keep maintaining good inventory practices.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
