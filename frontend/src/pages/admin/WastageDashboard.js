import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { AlertTriangle, TrendingDown, TrendingUp, DollarSign, Scale, Calendar, BarChart3, FileSpreadsheet, RefreshCw, ChevronDown } from 'lucide-react';

// Export utility function
const exportToCSV = (data, filename, columns) => {
  if (!data || data.length === 0) {
    toast.error('No data to export');
    return;
  }
  
  const headers = columns.map(c => c.label);
  const rows = data.map(item => 
    columns.map(c => {
      const value = c.getter(item);
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  
  toast.success(`Exported ${data.length} records to Excel`);
};

export default function WastageDashboard() {
  const { t, i18n } = useTranslation();
  const [dashboardData, setDashboardData] = useState(null);
  const [yesterdayWastage, setYesterdayWastage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(7);
  const [products, setProducts] = useState([]);
  
  // Build a map of products for quick lookup (by id and name)
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    });
    return map;
  }, [products]);
  
  // Helper to get translated product name based on current language
  const getProductName = useCallback((item) => {
    if (!item) return '';
    
    const isHindi = i18n.language === 'hi';
    
    // If it's a full product object with name_hi already
    if (item.name_hi && isHindi) {
      return item.name_hi;
    }
    
    // Try to find the product in our lookup map
    let product = null;
    
    // First try by product_id
    if (item.product_id) {
      product = productMap.get(item.product_id);
    }
    
    // Then try by name match
    if (!product) {
      const itemName = item.product_name || item.name;
      if (itemName) {
        product = productMap.get(itemName);
      }
    }
    
    // If we found a matching product, return translated name
    if (product) {
      if (isHindi && product.name_hi) {
        return product.name_hi;
      }
      return product.name;
    }
    
    // Fallback to stored product_name
    return item.product_name || item.name || '';
  }, [productMap, i18n.language]);
  
  // Date range filter
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to 30 days instead of 7
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Selected date for detailed wastage view (default: yesterday)
  const [selectedWastageDate, setSelectedWastageDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [selectedDateWastage, setSelectedDateWastage] = useState(null);
  const [loadingSelectedDate, setLoadingSelectedDate] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [wastageRes, productsRes] = await Promise.all([
        api.get(`/api/stock-status/wastage-dashboard?from_date=${dateFrom}&to_date=${dateTo}`),
        api.get('/api/products')
      ]);
      setDashboardData(wastageRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Load wastage dashboard error:', error);
      toast.error('Failed to load wastage data');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  // Load data when dates change
  useEffect(() => {
    loadDashboardData();
    loadYesterdayWastage();
  }, [loadDashboardData]);

  const handlePeriodChange = (days) => {
    setSelectedPeriod(days);
    // Update date inputs to reflect the period
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(to.toISOString().split('T')[0]);
  };

  const loadYesterdayWastage = async () => {
    try {
      const response = await api.get('/api/stock-status/yesterday-wastage');
      setYesterdayWastage(response.data);
    } catch (error) {
      console.error('Load yesterday wastage error:', error);
    }
  };
  
  // Load wastage for a specific selected date
  const loadSelectedDateWastage = useCallback(async (date) => {
    setLoadingSelectedDate(true);
    try {
      const response = await api.get(`/api/stock-status/wastage-by-date?date=${date}`);
      setSelectedDateWastage(response.data);
    } catch (error) {
      console.error('Load selected date wastage error:', error);
      // Fallback: if no specific endpoint, try to get from dashboard data
      setSelectedDateWastage(null);
    } finally {
      setLoadingSelectedDate(false);
    }
  }, []);
  
  // Load selected date wastage when date changes
  useEffect(() => {
    loadSelectedDateWastage(selectedWastageDate);
  }, [selectedWastageDate, loadSelectedDateWastage]);

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

  // ==================== EXPORT HANDLER ====================
  const exportWastageData = () => {
    const dataToExport = topProducts.map(p => ({
      product: p.product_name,
      unit: p.unit,
      total_wastage: p.total_wastage,
      wastage_value: p.wastage_value || 0,
      avg_daily_wastage: p.avg_daily_wastage || 0,
      wastage_percentage: p.wastage_percent || 0
    }));
    
    exportToCSV(dataToExport, `wastage_report_${selectedPeriod}days`, [
      { label: 'Product', getter: (d) => d.product },
      { label: 'Unit', getter: (d) => d.unit },
      { label: 'Total Wastage', getter: (d) => d.total_wastage },
      { label: 'Wastage Value (₹)', getter: (d) => d.wastage_value.toFixed(2) },
      { label: 'Avg Daily Wastage', getter: (d) => d.avg_daily_wastage.toFixed(2) },
      { label: 'Wastage %', getter: (d) => d.wastage_percentage.toFixed(2) }
    ]);
  };

  const summary = dashboardData?.summary || {};
  const dailyTrend = dashboardData?.daily_trend || [];
  // Sort top products by wastage percentage in descending order
  // AND filter to only show products with total_input > 10 kg
  const topProducts = [...(dashboardData?.top_wastage_products || [])]
    .filter(p => (p.total_input || 0) > 10) // Only products with >10kg total input (opening + purchase)
    .sort((a, b) => (b.wastage_percent || 0) - (a.wastage_percent || 0));
  const maxDailyWastage = Math.max(...dailyTrend.map(d => d.total_wastage_kg), 1);

  return (
    <Layout>
      <div data-testid="wastage-dashboard-page">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Wastage Dashboard</h1>
                  <p className="text-gray-500 mt-1">
                    {dashboardData?.start_date} to {dashboardData?.end_date}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={exportWastageData} title="Export to Excel">
                    <FileSpreadsheet size={14} className="mr-1" /> Export
                  </Button>
                  {[7, 15, 30].map(days => (
                    <Button
                      key={days}
                      variant={selectedPeriod === days ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePeriodChange(days)}
                      className={selectedPeriod === days ? 'bg-[#14532D] hover:bg-[#166534]' : ''}
                    >
                      {days}D
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Date Range Filter */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Calendar size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-600">Period:</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-36 h-8 text-sm"
                />
                <span className="text-gray-400">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-36 h-8 text-sm"
                />
                {loading && <RefreshCw size={16} className="animate-spin text-gray-400" />}
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

      {/* Selected Date's Product-wise Wastage Table */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle size={20} />
              Wastage Details
              {loadingSelectedDate && <RefreshCw size={14} className="animate-spin ml-2" />}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <Input
                type="date"
                value={selectedWastageDate}
                onChange={(e) => setSelectedWastageDate(e.target.value)}
                className="h-8 w-36 text-sm"
              />
              {selectedDateWastage && (
                <span className="text-sm text-red-600 font-semibold">
                  Total: ₹{selectedDateWastage.total_wastage_value?.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSelectedDate ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
            </div>
          ) : selectedDateWastage && selectedDateWastage.products?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="p-2 text-left font-medium text-red-700">Product</th>
                    <th className="p-2 text-right font-medium text-red-700">Opening</th>
                    <th className="p-2 text-right font-medium text-red-700">Purchase</th>
                    <th className="p-2 text-right font-medium text-red-700">Dispatch</th>
                    <th className="p-2 text-right font-medium text-red-700">Closing</th>
                    <th className="p-2 text-right font-medium text-red-700">Wastage (Kg)</th>
                    <th className="p-2 text-right font-medium text-red-700">Value (₹)</th>
                    <th className="p-2 text-right font-medium text-red-700">%</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selectedDateWastage.products]
                    .sort((a, b) => (b.wastage_percent || 0) - (a.wastage_percent || 0))
                    .map((product, idx) => (
                    <tr key={idx} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="p-2 font-medium">{getProductName(product)}</td>
                      <td className="p-2 text-right">{product.opening_qty?.toFixed(1)}</td>
                      <td className="p-2 text-right text-green-600">+{product.purchase_qty?.toFixed(1)}</td>
                      <td className="p-2 text-right text-blue-600">-{product.dispatch_qty?.toFixed(1)}</td>
                      <td className="p-2 text-right">{product.closing_qty?.toFixed(1)}</td>
                      <td className="p-2 text-right text-red-600 font-semibold">{product.wastage_qty?.toFixed(2)}</td>
                      <td className="p-2 text-right text-red-600">₹{product.wastage_value?.toFixed(0)}</td>
                      <td className="p-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getWastageColor(product.wastage_percent)}`}>
                          {product.wastage_percent?.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-red-100 font-semibold">
                  <tr>
                    <td className="p-2">Total ({selectedDateWastage.products.length} products)</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right text-red-700">{selectedDateWastage.total_wastage_kg?.toFixed(2)} Kg</td>
                    <td className="p-2 text-right text-red-700">₹{selectedDateWastage.total_wastage_value?.toFixed(0)}</td>
                    <td className="p-2 text-right">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              No wastage data available for {selectedWastageDate}.
              <p className="text-sm mt-2">Select a different date to view wastage details.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend Chart - Uses main date filter */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <CardTitle className="flex items-center gap-2">
                <Calendar size={20} /> Daily Wastage Trend
              </CardTitle>
              <span className="text-xs text-gray-500">
                {dateFrom} to {dateTo}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {dailyTrend.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No wastage data available for this period.
                <p className="text-sm mt-2">Start closing daily stock to see trends.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-red-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-red-600 font-medium">Peak Day</p>
                    <p className="text-lg font-bold text-red-700">
                      {dailyTrend.reduce((max, d) => d.total_wastage_kg > (max?.total_wastage_kg || 0) ? d : max, dailyTrend[0])?.total_wastage_kg.toFixed(1)} Kg
                    </p>
                    <p className="text-[10px] text-red-500">
                      {formatDate(dailyTrend.reduce((max, d) => d.total_wastage_kg > (max?.total_wastage_kg || 0) ? d : max, dailyTrend[0])?.date)}
                    </p>
                  </div>
                  <div className="bg-orange-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-orange-600 font-medium">Daily Average</p>
                    <p className="text-lg font-bold text-orange-700">
                      {(dailyTrend.reduce((sum, d) => sum + d.total_wastage_kg, 0) / dailyTrend.length).toFixed(1)} Kg
                    </p>
                    <p className="text-[10px] text-orange-500">{dailyTrend.length} days</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-green-600 font-medium">Best Day</p>
                    <p className="text-lg font-bold text-green-700">
                      {dailyTrend.reduce((min, d) => d.total_wastage_kg < (min?.total_wastage_kg || Infinity) ? d : min, dailyTrend[0])?.total_wastage_kg.toFixed(1)} Kg
                    </p>
                    <p className="text-[10px] text-green-500">
                      {formatDate(dailyTrend.reduce((min, d) => d.total_wastage_kg < (min?.total_wastage_kg || Infinity) ? d : min, dailyTrend[0])?.date)}
                    </p>
                  </div>
                </div>

                {/* Visual Line/Area Chart */}
                <div className="relative h-40 bg-gradient-to-b from-gray-50 to-white rounded-lg p-2">
                  {/* Y-axis labels */}
                  <div className="absolute left-0 top-0 bottom-4 w-10 flex flex-col justify-between text-[10px] text-gray-400">
                    <span>{maxDailyWastage.toFixed(0)}</span>
                    <span>{(maxDailyWastage / 2).toFixed(0)}</span>
                    <span>0</span>
                  </div>
                  
                  {/* Chart area */}
                  <div className="ml-10 h-full flex items-end">
                    <svg className="w-full h-full" viewBox={`0 0 ${dailyTrend.length * 40} 100`} preserveAspectRatio="none">
                      {/* Area fill */}
                      <defs>
                        <linearGradient id="wastageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(239, 68, 68, 0.3)" />
                          <stop offset="100%" stopColor="rgba(239, 68, 68, 0.05)" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`M 0 100 ${dailyTrend.map((d, i) => {
                          const x = (i / (dailyTrend.length - 1 || 1)) * dailyTrend.length * 40;
                          const y = 100 - (d.total_wastage_kg / maxDailyWastage) * 95;
                          return `L ${x} ${y}`;
                        }).join(' ')} L ${dailyTrend.length * 40} 100 Z`}
                        fill="url(#wastageGradient)"
                      />
                      {/* Line */}
                      <path
                        d={`M ${dailyTrend.map((d, i) => {
                          const x = (i / (dailyTrend.length - 1 || 1)) * dailyTrend.length * 40;
                          const y = 100 - (d.total_wastage_kg / maxDailyWastage) * 95;
                          return `${i === 0 ? '' : 'L '}${x} ${y}`;
                        }).join(' ')}`}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                      />
                      {/* Data points */}
                      {dailyTrend.map((d, i) => {
                        const x = (i / (dailyTrend.length - 1 || 1)) * dailyTrend.length * 40;
                        const y = 100 - (d.total_wastage_kg / maxDailyWastage) * 95;
                        return (
                          <circle key={i} cx={x} cy={y} r="3" fill="#ef4444" stroke="white" strokeWidth="1.5" />
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* X-axis labels */}
                <div className="flex justify-between ml-10 text-[10px] text-gray-400 px-1">
                  {dailyTrend.length <= 10 ? (
                    dailyTrend.map((d, i) => (
                      <span key={i} className="transform -rotate-45 origin-top-left whitespace-nowrap">
                        {formatDate(d.date)}
                      </span>
                    ))
                  ) : (
                    <>
                      <span>{formatDate(dailyTrend[0]?.date)}</span>
                      <span>{formatDate(dailyTrend[Math.floor(dailyTrend.length / 2)]?.date)}</span>
                      <span>{formatDate(dailyTrend[dailyTrend.length - 1]?.date)}</span>
                    </>
                  )}
                </div>

                {/* Daily Details Table */}
                <div className="mt-4 max-h-32 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-gray-100">
                      <tr>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-right p-2 font-medium">Wastage</th>
                        <th className="text-right p-2 font-medium">Value</th>
                        <th className="text-right p-2 font-medium">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyTrend.slice().reverse().map((day, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="p-2">{formatDate(day.date)}</td>
                          <td className="text-right p-2 font-medium">{day.total_wastage_kg.toFixed(1)} Kg</td>
                          <td className="text-right p-2 text-red-600">₹{day.total_wastage_value.toFixed(0)}</td>
                          <td className="text-right p-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getWastageColor(day.avg_wastage_percent)}`}>
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

        {/* Top Wastage Products (Sorted by Wastage %) */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown size={20} /> Top Wastage Products
                <span className="text-xs font-normal text-gray-500">(Input &gt; 10 Kg)</span>
              </CardTitle>
              <span className="text-xs text-gray-500">
                {dateFrom} to {dateTo}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              // Use topProducts which is already filtered and sorted
              const filteredTopProducts = topProducts.slice(0, 10);
              
              return filteredTopProducts.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No product wastage data available.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTopProducts.map((product, idx) => {
                    const maxPercent = filteredTopProducts[0]?.wastage_percent || 1;
                    const barWidth = (product.wastage_percent / maxPercent) * 100;
                    
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0 ? 'bg-red-100 text-red-700' :
                          idx === 1 ? 'bg-orange-100 text-orange-700' :
                          idx === 2 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-sm">{getProductName(product)}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">₹{product.total_wastage_value?.toFixed(0)}</span>
                              <span className={`text-sm font-semibold px-2 py-0.5 rounded ${getWastageColor(product.wastage_percent)}`}>
                                {product.wastage_percent?.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                product.wastage_percent > 10 ? 'bg-red-500' :
                                product.wastage_percent > 5 ? 'bg-orange-500' :
                                product.wastage_percent > 2 ? 'bg-yellow-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>{product.total_wastage_kg?.toFixed(2)} Kg wasted</span>
                            <span>{product.days_count || '-'} days data</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
                        <strong>{getProductName(topProducts[0])}</strong> has the highest wastage at {topProducts[0]?.total_wastage_kg.toFixed(2)} Kg.
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
          </>
        )}
      </div>
    </Layout>
  );
}
