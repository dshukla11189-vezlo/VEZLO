import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Users, TrendingUp, AlertTriangle, IndianRupee, 
  ChevronDown, ChevronUp, RefreshCw, Eye, Plus, 
  ShoppingCart, Calendar, X, Search, Menu, LogOut, User,
  DollarSign, Home, Truck, FileText, CreditCard, ClipboardList
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import RetailerDashboard from '../retailer/Dashboard';

export default function FieldTeamDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // View mode: 'cumulative' for portfolio overview, or a specific retailer_id
  const [viewMode, setViewMode] = useState('cumulative');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Portfolio data
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [assignedRetailers, setAssignedRetailers] = useState([]);
  
  // Cumulative data for graphs
  const [allDispatches, setAllDispatches] = useState([]);
  const [allRejections, setAllRejections] = useState([]);
  const [portfolioCommissionPct, setPortfolioCommissionPct] = useState(0);
  
  // Search filter for retailer cards
  const [searchTerm, setSearchTerm] = useState('');
  
  // Expanded sections
  const [expandedCards, setExpandedCards] = useState({});
  
  // Side menu
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  
  // Date range for charts
  const [dashboardDateFrom, setDashboardDateFrom] = useState('');
  const [dashboardDateTo, setDashboardDateTo] = useState('');
  const [chartViewMode, setChartViewMode] = useState('monthly');
  
  // Helper function to get IST date string
  const getLocalDateString = (date = new Date()) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  // Fetch portfolio summary and all dispatches/rejections for graphs
  const fetchPortfolioData = useCallback(async () => {
    try {
      const summaryRes = await api.get('/api/field-team/portfolio-summary');
      setPortfolioSummary(summaryRes.data);
      setAssignedRetailers(summaryRes.data.retailer_summaries || []);
      
      // Fetch all dispatches and rejections for assigned retailers
      const retailerIds = (summaryRes.data.retailer_summaries || []).map(r => r.retailer_id);
      
      if (retailerIds.length > 0) {
        // Fetch dispatches and rejections for all assigned retailers
        const dispatchPromises = retailerIds.map(rid => 
          api.get(`/api/field-team/retailer/${rid}-dispatches`).catch(() => ({ data: [] }))
        );
        const rejectionPromises = retailerIds.map(rid => 
          api.get(`/api/field-team/retailer/${rid}-rejections`).catch(() => ({ data: [] }))
        );
        
        const [dispatchResults, rejectionResults] = await Promise.all([
          Promise.all(dispatchPromises),
          Promise.all(rejectionPromises)
        ]);
        
        // Combine all dispatches and rejections
        const combinedDispatches = dispatchResults.flatMap(r => r.data || []);
        const combinedRejections = rejectionResults.flatMap(r => r.data || []);
        
        setAllDispatches(combinedDispatches);
        setAllRejections(combinedRejections);
        
        // Calculate average commission percentage
        const totalCommPct = (summaryRes.data.retailer_summaries || [])
          .reduce((sum, r) => sum + (r.commission_percentage || 0), 0);
        const avgCommPct = retailerIds.length > 0 ? totalCommPct / retailerIds.length : 0;
        setPortfolioCommissionPct(avgCommPct);
        
        // Set initial date range
        if (combinedDispatches.length > 0) {
          const sortedDates = combinedDispatches
            .map(d => d.dispatch_date?.split('T')[0])
            .filter(Boolean)
            .sort();
          
          if (sortedDates.length > 0) {
            setDashboardDateFrom(sortedDates[0]);
            setDashboardDateTo(getLocalDateString());
          }
        }
      }
    } catch (error) {
      console.error('Error fetching portfolio data:', error);
      toast.error('Failed to load portfolio data');
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await fetchPortfolioData();
      setLoading(false);
    };
    loadInitialData();
  }, [fetchPortfolioData]);

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPortfolioData();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  // Switch to individual retailer view
  const handleViewRetailer = (retailerId) => {
    setViewMode(retailerId);
  };

  // Go back to cumulative view
  const handleBackToPortfolio = () => {
    setViewMode('cumulative');
  };

  // Filter retailers by search term
  const filteredRetailers = useMemo(() => {
    if (!searchTerm) return assignedRetailers;
    const term = searchTerm.toLowerCase();
    return assignedRetailers.filter(r => 
      r.retailer_name?.toLowerCase().includes(term)
    );
  }, [assignedRetailers, searchTerm]);

  // Get selected retailer info
  const selectedRetailer = useMemo(() => {
    if (viewMode === 'cumulative') return null;
    return assignedRetailers.find(r => r.retailer_id === viewMode);
  }, [viewMode, assignedRetailers]);

  // Toggle card expansion
  const toggleCardExpand = (cardId) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    toast.success('Logged out successfully');
    navigate('/login');
  };

  // Menu items for side menu
  const menuItems = [
    { id: 'portfolio', label: 'My Portfolio', icon: Home },
  ];

  // Chart data calculations (same logic as Retailer Dashboard)
  const chartData = useMemo(() => {
    if (!dashboardDateFrom || allDispatches.length === 0) return [];
    
    const filteredDispatches = allDispatches.filter(d => {
      const dispDate = d.dispatch_date?.split('T')[0];
      return dispDate >= dashboardDateFrom && dispDate <= dashboardDateTo;
    });
    
    const filteredRejections = allRejections.filter(r => {
      const rejDate = r.rejection_date?.split('T')[0];
      return rejDate >= dashboardDateFrom && rejDate <= dashboardDateTo;
    });
    
    // Helper functions
    const getWeekStart = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(date.setDate(diff));
      return weekStart.toISOString().split('T')[0];
    };
    
    const getMonthKey = (dateStr) => {
      const date = new Date(dateStr);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };
    
    const formatMonthLabel = (monthKey) => {
      const [year, month] = monthKey.split('-');
      const date = new Date(year, parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    };
    
    // Group data
    const groupedData = {};
    
    filteredDispatches.forEach(d => {
      const date = d.dispatch_date?.split('T')[0];
      if (!date) return;
      
      let key, label;
      if (chartViewMode === 'daily') {
        key = date;
        label = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (chartViewMode === 'weekly') {
        key = getWeekStart(date);
        label = new Date(key).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else {
        key = getMonthKey(date);
        label = formatMonthLabel(key);
      }
      
      if (!groupedData[key]) {
        groupedData[key] = { key, label, orderValue: 0, rejectionValue: 0, orderDays: new Set() };
      }
      const mrp = d.total_mrp_value > 0 ? d.total_mrp_value : 
        (d.items?.reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0) || 0);
      groupedData[key].orderValue += mrp;
      groupedData[key].orderDays.add(date);
    });
    
    filteredRejections.forEach(r => {
      const date = r.rejection_date?.split('T')[0];
      if (!date) return;
      
      let key;
      if (chartViewMode === 'daily') {
        key = date;
      } else if (chartViewMode === 'weekly') {
        key = getWeekStart(date);
      } else {
        key = getMonthKey(date);
      }
      
      if (groupedData[key]) {
        groupedData[key].rejectionValue += (r.rejection_value || 0);
      }
    });
    
    return Object.values(groupedData)
      .map(d => {
        const netValue = d.orderValue - d.rejectionValue;
        const earnings = Math.round(netValue * portfolioCommissionPct / 100);
        const daysCount = d.orderDays.size || 1;
        return {
          ...d,
          netOrderValue: Math.round(netValue),
          earnings: earnings,
          avgEarningsPerDay: Math.round(earnings / daysCount),
          daysCount: daysCount
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [allDispatches, allRejections, dashboardDateFrom, dashboardDateTo, chartViewMode, portfolioCommissionPct]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalGross = chartData.reduce((sum, d) => sum + (d.orderValue || 0), 0);
    const totalRejections = chartData.reduce((sum, d) => sum + (d.rejectionValue || 0), 0);
    const totalEarnings = chartData.reduce((sum, d) => sum + (d.earnings || 0), 0);
    const uniqueDays = new Set(allDispatches.map(d => d.dispatch_date?.split('T')[0]).filter(Boolean)).size;
    return {
      gross: totalGross,
      rejections: totalRejections,
      earnings: totalEarnings,
      avgPerDay: uniqueDays > 0 ? totalEarnings / uniqueDays : 0,
      orderDays: uniqueDays,
      rejectionPct: totalGross > 0 ? (totalRejections / totalGross * 100) : 0
    };
  }, [chartData, allDispatches]);

  // Format chart values
  const formatValue = (value) => {
    if (value >= 100000) return `₹${(value/100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value/1000).toFixed(1)}k`;
    return `₹${value}`;
  };

  // Chart colors
  const orderColors = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#3b82f6', '#60a5fa'];
  const earningColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#10b981', '#34d399'];
  const avgColors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#f59e0b', '#fbbf24'];
  const rejectionColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#ef4444', '#f87171'];

  // If individual retailer is selected, render the full Retailer Dashboard
  if (viewMode !== 'cumulative' && selectedRetailer) {
    return (
      <RetailerDashboard 
        fieldTeamMode={true}
        selectedRetailerId={viewMode}
        selectedRetailerName={selectedRetailer.retailer_name}
        onBackToPortfolio={handleBackToPortfolio}
      />
    );
  }

  if (loading && !portfolioSummary) {
    return (
      <Layout title="Field Team Portal" hideTitle hideSidebar>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Field Team Portal" hideTitle hideSidebar>
      <div data-testid="field-team-dashboard" className="relative">
        {/* Side Menu Overlay */}
        {sideMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSideMenuOpen(false)}
          />
        )}
        
        {/* Side Menu */}
        <div className={`fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 ${sideMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 border-b bg-[#14532D]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Menu</h2>
              <Button variant="ghost" size="sm" onClick={() => setSideMenuOpen(false)} className="text-white hover:bg-white/20">
                <X size={20} />
              </Button>
            </div>
          </div>
          <nav className="p-2">
            {menuItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setViewMode('cumulative');
                    setSideMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors bg-[#14532D] text-white"
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
            
            {/* Assigned Retailers */}
            <div className="mt-4 pt-4 border-t">
              <p className="px-4 py-2 text-sm font-semibold text-gray-500 uppercase">My Retailers</p>
              {assignedRetailers.map(r => (
                <button
                  key={r.retailer_id}
                  onClick={() => {
                    setViewMode(r.retailer_id);
                    setSideMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    viewMode === r.retailer_id 
                      ? 'bg-[#14532D] text-white' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <ShoppingCart size={18} />
                  <span className="font-medium text-sm truncate">{r.retailer_name}</span>
                </button>
              ))}
            </div>
            
            {/* Logout Button */}
            <div className="border-t mt-4 pt-4">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-red-600 hover:bg-red-50"
                data-testid="logout-btn"
              >
                <LogOut size={20} />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <div className="min-h-screen">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSideMenuOpen(true)}
                className="p-2"
                data-testid="hamburger-menu-btn"
              >
                <Menu size={24} />
              </Button>
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                My Portfolio
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              data-testid="refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Summary Cards Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card className="bg-white" data-testid="total-retailers-card">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Retailers</p>
                    <p className="text-lg font-bold">{portfolioSummary?.total_retailers || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white" data-testid="immediately-payable-card">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <IndianRupee className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Immediately Payable</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(portfolioSummary?.summary?.immediately_payable)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white" data-testid="overdue-card">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Overdue</p>
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(portfolioSummary?.summary?.overdue)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-white" data-testid="total-outstanding-card">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Outstanding</p>
                    <p className="text-lg font-bold text-orange-600">
                      {formatCurrency(portfolioSummary?.summary?.total_outstanding)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Portfolio Earnings Card with Charts */}
          {chartData.length > 0 && (
            <Card className="mb-6 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-4 bg-emerald-100 rounded-xl">
                      <DollarSign size={36} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-emerald-600 font-semibold uppercase tracking-wide">Portfolio Earnings</p>
                      <p className="text-4xl md:text-5xl font-bold text-emerald-700">{formatCurrency(totals.earnings)}</p>
                      {totals.orderDays > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-emerald-600 font-medium">Avg. Per Day:</span>
                          <span className="text-sm font-bold text-emerald-600">{formatCurrency(totals.avgPerDay)}</span>
                          <span className="text-xs text-gray-500">({totals.orderDays} days with orders)</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-3 bg-white/70 p-3 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-emerald-600" />
                      <span className="text-sm font-medium text-gray-600">Period:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="date"
                        value={dashboardDateFrom}
                        onChange={(e) => setDashboardDateFrom(e.target.value)}
                        className="w-36 h-9 text-sm border-emerald-200 focus:border-emerald-400"
                      />
                      <span className="text-gray-400">to</span>
                      <Input
                        type="date"
                        value={dashboardDateTo}
                        onChange={(e) => setDashboardDateTo(e.target.value)}
                        className="w-36 h-9 text-sm border-emerald-200 focus:border-emerald-400"
                      />
                    </div>
                  </div>
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600">View:</span>
                  {['daily', 'weekly', 'monthly'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setChartViewMode(mode)}
                      className={`px-3 py-1 text-sm rounded-lg ${
                        chartViewMode === mode 
                          ? 'bg-[#14532D] text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>

                {/* 4 Charts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Monthly Order Value */}
                  <div className="bg-white rounded-lg border p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <BarChart size={16} className="text-blue-500" />
                      {chartViewMode.charAt(0).toUpperCase() + chartViewMode.slice(1)} Order Value
                    </h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.slice(-7)} margin={{ top: 15, right: 5, left: 5, bottom: 5 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                          <YAxis hide />
                          <Tooltip formatter={(value) => formatValue(value)} />
                          <Bar dataKey="orderValue" radius={[4, 4, 0, 0]}>
                            {chartData.slice(-7).map((_, index) => (
                              <Cell key={index} fill={orderColors[index % orderColors.length]} />
                            ))}
                            <LabelList dataKey="orderValue" position="top" formatter={formatValue} style={{ fontSize: 9 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Monthly Rejection MRP */}
                  <div className="bg-white rounded-lg border p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-red-500" />
                      {chartViewMode.charAt(0).toUpperCase() + chartViewMode.slice(1)} Rejection MRP
                    </h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.slice(-7)} margin={{ top: 15, right: 5, left: 5, bottom: 5 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                          <YAxis hide />
                          <Tooltip formatter={(value) => formatValue(value)} />
                          <Bar dataKey="rejectionValue" radius={[4, 4, 0, 0]}>
                            {chartData.slice(-7).map((_, index) => (
                              <Cell key={index} fill={rejectionColors[index % rejectionColors.length]} />
                            ))}
                            <LabelList dataKey="rejectionValue" position="top" formatter={formatValue} style={{ fontSize: 9 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-center text-gray-500 mt-1">
                      Total: {formatCurrency(totals.rejections)} | {totals.rejectionPct.toFixed(1)}% Rejection
                    </p>
                  </div>

                  {/* Monthly Earnings */}
                  <div className="bg-white rounded-lg border p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <TrendingUp size={16} className="text-green-500" />
                      {chartViewMode.charAt(0).toUpperCase() + chartViewMode.slice(1)} Earnings
                    </h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.slice(-7)} margin={{ top: 15, right: 5, left: 5, bottom: 5 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                          <YAxis hide />
                          <Tooltip formatter={(value) => formatValue(value)} />
                          <Bar dataKey="earnings" radius={[4, 4, 0, 0]}>
                            {chartData.slice(-7).map((_, index) => (
                              <Cell key={index} fill={earningColors[index % earningColors.length]} />
                            ))}
                            <LabelList dataKey="earnings" position="top" formatter={formatValue} style={{ fontSize: 9 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Avg. Earning/Day */}
                  <div className="bg-white rounded-lg border p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <DollarSign size={16} className="text-yellow-500" />
                      Avg. Earning/Day
                    </h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.slice(-7)} margin={{ top: 15, right: 5, left: 5, bottom: 5 }}>
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} />
                          <YAxis hide />
                          <Tooltip formatter={(value) => formatValue(value)} />
                          <Bar dataKey="avgEarningsPerDay" radius={[4, 4, 0, 0]}>
                            {chartData.slice(-7).map((_, index) => (
                              <Cell key={index} fill={avgColors[index % avgColors.length]} />
                            ))}
                            <LabelList dataKey="avgEarningsPerDay" position="top" formatter={formatValue} style={{ fontSize: 9 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Retailer Search */}
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search retailers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="retailer-search"
              />
            </div>
          </div>

          {/* Retailer Mini Cards */}
          <div className="space-y-3">
            {filteredRetailers.length === 0 ? (
              <Card className="bg-white p-6 text-center text-gray-500">
                No retailers assigned to you
              </Card>
            ) : (
              filteredRetailers.map(retailer => (
                <Card 
                  key={retailer.retailer_id} 
                  className="bg-white overflow-hidden"
                  data-testid={`retailer-card-${retailer.retailer_id}`}
                >
                  {/* Main Row */}
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleCardExpand(retailer.retailer_id)}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className={`w-2 h-2 rounded-full ${
                          retailer.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                      />
                      <div>
                        <h3 className="font-semibold text-gray-800">
                          {retailer.retailer_name}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                          <span>{retailer.upfront_percentage}% Upfront</span>
                          <span>{retailer.commission_percentage}% Comm.</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">
                          {formatCurrency(retailer.immediately_payable)}
                        </p>
                        <p className="text-xs text-gray-400">Payable Now</p>
                      </div>
                      {retailer.overdue > 0 && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600">
                            {formatCurrency(retailer.overdue)}
                          </p>
                          <p className="text-xs text-gray-400">Overdue</p>
                        </div>
                      )}
                      {expandedCards[retailer.retailer_id] ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {expandedCards[retailer.retailer_id] && (
                    <div className="border-t bg-gray-50 p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500">Outstanding</p>
                          <p className="font-semibold">{formatCurrency(retailer.outstanding)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Pending Indents</p>
                          <p className="font-semibold">{retailer.pending_indents}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Today&apos;s Dispatches</p>
                          <p className="font-semibold">{retailer.today_dispatches}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Today&apos;s Value</p>
                          <p className="font-semibold">{formatCurrency(retailer.today_dispatch_value)}</p>
                        </div>
                      </div>
                      
                      <Button
                        size="sm"
                        className="bg-[#14532D] hover:bg-[#166534]"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewRetailer(retailer.retailer_id);
                        }}
                        data-testid={`view-retailer-${retailer.retailer_id}`}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Full Dashboard
                      </Button>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
