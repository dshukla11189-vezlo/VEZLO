import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Users, TrendingUp, AlertTriangle, IndianRupee, Package, Truck,
  ChevronDown, ChevronRight, ChevronUp, RefreshCw, Eye, Plus, 
  ShoppingCart, Calendar, X, Search, ArrowLeft
} from 'lucide-react';

export default function FieldTeamDashboard() {
  const { t } = useTranslation();
  
  // View mode: 'cumulative' for portfolio overview, or a specific retailer_id
  const [viewMode, setViewMode] = useState('cumulative');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Portfolio data
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [assignedRetailers, setAssignedRetailers] = useState([]);
  
  // Individual retailer data (when viewing specific retailer)
  const [retailerDashboard, setRetailerDashboard] = useState(null);
  const [retailerPaymentDetails, setRetailerPaymentDetails] = useState(null);
  
  // Search filter for retailer cards
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create Indent Modal
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [indentRetailerId, setIndentRetailerId] = useState(null);
  const [indentDate, setIndentDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [indentItems, setIndentItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  const [savingIndent, setSavingIndent] = useState(false);
  
  // Expanded sections
  const [expandedCards, setExpandedCards] = useState({});
  
  // Helper function to get IST date string
  const getLocalDateString = (date = new Date()) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  // Fetch portfolio summary (cumulative view)
  const fetchPortfolioSummary = useCallback(async () => {
    try {
      const response = await api.get('/api/field-team/portfolio-summary');
      setPortfolioSummary(response.data);
      setAssignedRetailers(response.data.retailer_summaries || []);
    } catch (error) {
      console.error('Error fetching portfolio summary:', error);
      toast.error('Failed to load portfolio summary');
    }
  }, []);

  // Fetch individual retailer dashboard
  const fetchRetailerDashboard = useCallback(async (retailerId) => {
    try {
      const [dashboardRes, paymentRes] = await Promise.all([
        api.get(`/api/field-team/retailer/${retailerId}/dashboard`),
        api.get(`/api/field-team/retailer/${retailerId}/payment-details`)
      ]);
      setRetailerDashboard(dashboardRes.data);
      setRetailerPaymentDetails(paymentRes.data);
    } catch (error) {
      console.error('Error fetching retailer dashboard:', error);
      toast.error('Failed to load retailer data');
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await fetchPortfolioSummary();
      setLoading(false);
    };
    loadInitialData();
  }, [fetchPortfolioSummary]);

  // Fetch retailer data when switching to individual view
  useEffect(() => {
    if (viewMode !== 'cumulative') {
      setLoading(true);
      fetchRetailerDashboard(viewMode).finally(() => setLoading(false));
    }
  }, [viewMode, fetchRetailerDashboard]);

  // Fetch products and packagings for indent creation
  useEffect(() => {
    const fetchProductsAndPackagings = async () => {
      try {
        const [productsRes, packagingsRes] = await Promise.all([
          api.get('/api/products'),
          api.get('/api/qc-packaging')
        ]);
        setProducts(productsRes.data || []);
        setPackagings(packagingsRes.data || []);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };
    fetchProductsAndPackagings();
  }, []);

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    if (viewMode === 'cumulative') {
      await fetchPortfolioSummary();
    } else {
      await fetchRetailerDashboard(viewMode);
    }
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  // Switch to individual retailer view
  const handleViewRetailer = (retailerId) => {
    setViewMode(retailerId);
  };

  // Go back to cumulative view
  const handleBackToCumulative = () => {
    setViewMode('cumulative');
    setRetailerDashboard(null);
    setRetailerPaymentDetails(null);
  };

  // Open indent modal for a retailer
  const handleCreateIndent = (retailerId) => {
    setIndentRetailerId(retailerId);
    setIndentItems([{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0 }]);
    setShowIndentModal(true);
  };

  // Add indent item
  const addIndentItem = () => {
    setIndentItems([...indentItems, { product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0 }]);
  };

  // Remove indent item
  const removeIndentItem = (index) => {
    if (indentItems.length > 1) {
      setIndentItems(indentItems.filter((_, i) => i !== index));
    }
  };

  // Update indent item
  const updateIndentItem = (index, field, value) => {
    const updated = [...indentItems];
    updated[index][field] = value;
    
    // Auto-fill product name when product_id changes
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        updated[index].product_name = product.name;
      }
    }
    
    // Auto-fill variant name when variant_id changes
    if (field === 'variant_id') {
      const pkg = packagings.find(p => p.id === value);
      if (pkg) {
        updated[index].variant_name = pkg.name;
      }
    }
    
    setIndentItems(updated);
  };

  // Submit indent
  const handleSubmitIndent = async () => {
    // Validate
    const validItems = indentItems.filter(item => item.product_id && item.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one item with quantity');
      return;
    }

    setSavingIndent(true);
    try {
      await api.post(`/api/field-team/retailer/${indentRetailerId}/indent`, {
        indent_date: indentDate,
        items: validItems.map(item => ({
          ...item,
          status: 'pending'
        })),
        remarks: 'Created by Field Team'
      });
      toast.success('Indent created successfully');
      setShowIndentModal(false);
      
      // Refresh data
      if (viewMode === indentRetailerId) {
        await fetchRetailerDashboard(indentRetailerId);
      }
      await fetchPortfolioSummary();
    } catch (error) {
      console.error('Error creating indent:', error);
      toast.error(error.response?.data?.detail || 'Failed to create indent');
    } finally {
      setSavingIndent(false);
    }
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

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  // Toggle card expansion
  const toggleCardExpand = (cardId) => {
    setExpandedCards(prev => ({
      ...prev,
      [cardId]: !prev[cardId]
    }));
  };

  if (loading && !portfolioSummary) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-green-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            {viewMode !== 'cumulative' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToCumulative}
                className="flex items-center gap-1"
                data-testid="back-to-portfolio-btn"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <h1 className="text-2xl font-bold text-gray-800" data-testid="dashboard-title">
              {viewMode === 'cumulative' 
                ? 'My Portfolio' 
                : selectedRetailer?.retailer_name || 'Retailer Dashboard'}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View Selector Dropdown */}
            <div className="relative">
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 min-w-[200px]"
                data-testid="view-selector"
              >
                <option value="cumulative">All Retailers (Cumulative)</option>
                {assignedRetailers.map(r => (
                  <option key={r.retailer_id} value={r.retailer_id}>
                    {r.retailer_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
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
        </div>

        {/* Cumulative View */}
        {viewMode === 'cumulative' && portfolioSummary && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-white" data-testid="total-retailers-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Retailers</p>
                      <p className="text-xl font-bold">{portfolioSummary.total_retailers}</p>
                      <p className="text-xs text-gray-400">
                        {portfolioSummary.active_retailers} active
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white" data-testid="immediately-payable-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <IndianRupee className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Immediately Payable</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(portfolioSummary.summary?.immediately_payable)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white" data-testid="overdue-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Overdue</p>
                      <p className="text-xl font-bold text-red-600">
                        {formatCurrency(portfolioSummary.summary?.overdue)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white" data-testid="total-outstanding-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Total Outstanding</p>
                      <p className="text-xl font-bold text-orange-600">
                        {formatCurrency(portfolioSummary.summary?.total_outstanding)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search Bar */}
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
                    {/* Main Row (always visible) */}
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
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRetailer(retailer.retailer_id);
                            }}
                            data-testid={`view-retailer-${retailer.retailer_id}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View Dashboard
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateIndent(retailer.retailer_id);
                            }}
                            data-testid={`create-indent-${retailer.retailer_id}`}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Create Indent
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          </>
        )}

        {/* Individual Retailer View */}
        {viewMode !== 'cumulative' && retailerDashboard && (
          <>
            {/* Retailer Info Header */}
            <Card className="bg-white mb-6">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{retailerDashboard.retailer?.company_name || retailerDashboard.retailer?.name}</h2>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span>{retailerDashboard.retailer?.upfront_collection_percentage || 50}% Upfront</span>
                      <span>{retailerDashboard.retailer?.commission_percentage || 0}% Commission</span>
                      {retailerDashboard.retailer?.city && <span>{retailerDashboard.retailer?.city}</span>}
                    </div>
                  </div>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleCreateIndent(viewMode)}
                    data-testid="create-indent-header-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create Indent
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards for Individual Retailer */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-white" data-testid="retailer-outstanding-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <IndianRupee className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Outstanding</p>
                      <p className="text-xl font-bold text-orange-600">
                        {formatCurrency(retailerDashboard.summary?.total_outstanding)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white" data-testid="retailer-payable-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <IndianRupee className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Immediately Payable</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(retailerDashboard.summary?.immediately_payable)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white" data-testid="retailer-net-sales-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Net Sales (30d)</p>
                      <p className="text-xl font-bold text-blue-600">
                        {formatCurrency(retailerDashboard.summary?.net_sales)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-white" data-testid="retailer-rejection-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Rejection %</p>
                      <p className="text-xl font-bold text-red-600">
                        {retailerDashboard.summary?.rejection_percentage?.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Counts Row */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-6">
              {[
                { label: 'Indents', value: retailerDashboard.counts?.indents, icon: Package },
                { label: 'Dispatches', value: retailerDashboard.counts?.dispatches, icon: Truck },
                { label: 'Invoices', value: retailerDashboard.counts?.invoices, icon: Package },
                { label: 'Rejections', value: retailerDashboard.counts?.rejections, icon: AlertTriangle },
                { label: 'Payments', value: retailerDashboard.counts?.payments, icon: IndianRupee },
                { label: 'Credit Notes', value: retailerDashboard.counts?.credit_notes, icon: Package },
              ].map((item, idx) => (
                <Card key={idx} className="bg-white">
                  <CardContent className="p-3 text-center">
                    <item.icon className="w-4 h-4 mx-auto text-gray-400 mb-1" />
                    <p className="text-lg font-bold">{item.value}</p>
                    <p className="text-xs text-gray-500">{item.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Payment Details Table */}
            {retailerPaymentDetails && retailerPaymentDetails.dates && (
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-lg">Payment Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {retailerPaymentDetails.dates.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No pending payments</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-right">Gross</th>
                            <th className="px-3 py-2 text-right">Rejection</th>
                            <th className="px-3 py-2 text-right">Net Payable</th>
                            <th className="px-3 py-2 text-right">Paid</th>
                            <th className="px-3 py-2 text-right">Pending</th>
                            <th className="px-3 py-2 text-right">Upfront Due</th>
                          </tr>
                        </thead>
                        <tbody>
                          {retailerPaymentDetails.dates.slice(0, 10).map((row, idx) => (
                            <tr key={idx} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2">{row.date}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.gross_value)}</td>
                              <td className="px-3 py-2 text-right text-red-600">{formatCurrency(row.rejection_amount)}</td>
                              <td className="px-3 py-2 text-right">{formatCurrency(row.net_payable)}</td>
                              <td className="px-3 py-2 text-right text-green-600">{formatCurrency(row.paid_amount)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.pending_amount)}</td>
                              <td className="px-3 py-2 text-right text-orange-600 font-semibold">{formatCurrency(row.upfront_due)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-100 font-semibold">
                          <tr>
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(retailerPaymentDetails.totals?.gross_value)}</td>
                            <td className="px-3 py-2 text-right text-red-600">{formatCurrency(retailerPaymentDetails.totals?.rejection_amount)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(retailerPaymentDetails.totals?.net_payable)}</td>
                            <td className="px-3 py-2 text-right text-green-600">{formatCurrency(retailerPaymentDetails.totals?.paid_amount)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(retailerPaymentDetails.totals?.pending_amount)}</td>
                            <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(retailerPaymentDetails.totals?.upfront_due)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent Indents */}
            <Card className="bg-white mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Recent Indents</CardTitle>
              </CardHeader>
              <CardContent>
                {!retailerDashboard.indents || retailerDashboard.indents.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No indents found</p>
                ) : (
                  <div className="space-y-2">
                    {retailerDashboard.indents.slice(0, 5).map((indent) => (
                      <div key={indent.id} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{indent.indent_date?.slice(0, 10)}</p>
                          <p className="text-sm text-gray-500">
                            {indent.items?.length || 0} items - {indent.status}
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          indent.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          indent.status === 'dispatched' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {indent.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Create Indent Modal */}
        {showIndentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Create Indent</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowIndentModal(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              <div className="p-4 overflow-y-auto flex-1">
                {/* Indent Date */}
                <div className="mb-4">
                  <Label>Indent Date</Label>
                  <Input
                    type="date"
                    value={indentDate}
                    onChange={(e) => setIndentDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                {/* Items */}
                <div className="space-y-3">
                  <Label>Items</Label>
                  {indentItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <select
                          value={item.product_id}
                          onChange={(e) => updateIndentItem(index, 'product_id', e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Select Product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <select
                          value={item.variant_id}
                          onChange={(e) => updateIndentItem(index, 'variant_id', e.target.value)}
                          className="w-full border rounded-md px-3 py-2 text-sm"
                        >
                          <option value="">Variant</option>
                          {packagings.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          placeholder="Qty"
                          value={item.quantity || ''}
                          onChange={(e) => updateIndentItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeIndentItem(index)}
                        disabled={indentItems.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addIndentItem}>
                    <Plus className="w-4 h-4 mr-1" /> Add Item
                  </Button>
                </div>
              </div>
              
              <div className="p-4 border-t flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowIndentModal(false)}>
                  Cancel
                </Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleSubmitIndent}
                  disabled={savingIndent}
                  data-testid="submit-indent-btn"
                >
                  {savingIndent ? 'Creating...' : 'Create Indent'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
