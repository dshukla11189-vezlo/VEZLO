import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { 
  Users, TrendingUp, AlertTriangle, IndianRupee, 
  ChevronDown, ChevronUp, RefreshCw, Eye, Plus, 
  ShoppingCart, Calendar, X, Search, Menu, LogOut, User,
  DollarSign, Home, Truck, FileText, CreditCard, ClipboardList,
  ChevronLeft, Pencil, Trash2, Check, Package, UserPlus, UserCheck, Activity, UserX, Clock, Zap
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
  
  // Current user info
  const [currentUser, setCurrentUser] = useState(null);
  
  // Portfolio data
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [assignedRetailers, setAssignedRetailers] = useState([]);
  const [assignedRetailersDetails, setAssignedRetailersDetails] = useState([]); // Full retailer details
  
  // All indents for stats
  const [allIndents, setAllIndents] = useState([]);
  
  // Cumulative data for graphs
  const [allDispatches, setAllDispatches] = useState([]);
  const [allRejections, setAllRejections] = useState([]);
  const [portfolioCommissionPct, setPortfolioCommissionPct] = useState(0);
  
  // Products and Packagings for rejection recording
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  
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
  
  // ========== VIEW MODALS FOR AVG NET SALES & REJECTION % ==========
  const [showNetSalesModal, setShowNetSalesModal] = useState(false);
  const [showRejectionPctModal, setShowRejectionPctModal] = useState(false);
  
  // ========== PENDING TO GO LIVE MODAL ==========
  const [showPendingToGoLiveModal, setShowPendingToGoLiveModal] = useState(false);
  const [pendingToGoLiveRetailers, setPendingToGoLiveRetailers] = useState([]);
  const [loadingPendingRetailers, setLoadingPendingRetailers] = useState(false);
  
  // ========== ZERO ORDERS YESTERDAY MODAL ==========
  const [showZeroOrdersModal, setShowZeroOrdersModal] = useState(false);
  const [zeroOrdersRetailers, setZeroOrdersRetailers] = useState([]);
  const [loadingZeroOrders, setLoadingZeroOrders] = useState(false);
  const [zeroOrdersDate, setZeroOrdersDate] = useState('');
  
  // ========== AUTO INDENT MODAL ==========
  const [showAutoIndentModal, setShowAutoIndentModal] = useState(false);
  const [autoIndentRetailer, setAutoIndentRetailer] = useState(null);
  const [autoIndentDate, setAutoIndentDate] = useState('');
  const [autoIndentLoading, setAutoIndentLoading] = useState(false);
  
  // ========== INDENTS MODAL ==========
  const [showIndentsModal, setShowIndentsModal] = useState(false);
  const [indentsModalMode, setIndentsModalMode] = useState('today'); // 'today' or 'tomorrow'
  
  // ========== RECORD REJECTION WIZARD STATE ==========
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [recordRejectionStep, setRecordRejectionStep] = useState(1); // 1=retailer, 2=product, 3=dates
  const [recordRejectionRetailer, setRecordRejectionRetailer] = useState(null);
  const [recordRejectionProduct, setRecordRejectionProduct] = useState(null);
  const [recordRejectionRetailerSearch, setRecordRejectionRetailerSearch] = useState('');
  const [recordRejectionProductSearch, setRecordRejectionProductSearch] = useState('');
  const [recordRejectionDateRows, setRecordRejectionDateRows] = useState([]);
  const [recordRejectionSubmitting, setRecordRejectionSubmitting] = useState(false);
  const [recordRejectionDrafts, setRecordRejectionDrafts] = useState([]);
  const [recordRejectionEditingDraftKey, setRecordRejectionEditingDraftKey] = useState(null);
  const [retailerDispatchesForRejection, setRetailerDispatchesForRejection] = useState([]);
  const [retailerRejectionsForRejection, setRetailerRejectionsForRejection] = useState([]);
  const [rejectionHistoryMap, setRejectionHistoryMap] = useState({}); // For detailed rejection history
  
  // Helper function to get IST date string
  const getLocalDateString = (date = new Date()) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  };

  // Get IST today date
  const getISTDate = () => getLocalDateString(new Date());
  
  // Get IST tomorrow date
  const getISTTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  // Load current user from localStorage
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
  }, []);

  // Fetch portfolio summary and all dispatches/rejections for graphs
  const fetchPortfolioData = useCallback(async () => {
    try {
      const summaryRes = await api.get('/api/field-team/portfolio-summary');
      setPortfolioSummary(summaryRes.data);
      setAssignedRetailers(summaryRes.data.retailer_summaries || []);
      
      // Fetch all dispatches and rejections for assigned retailers
      const retailerIds = (summaryRes.data.retailer_summaries || []).map(r => r.retailer_id);
      
      if (retailerIds.length > 0) {
        // Fetch dispatches, rejections, and indents for all assigned retailers
        const dispatchPromises = retailerIds.map(rid => 
          api.get(`/api/field-team/retailer/${rid}-dispatches`).catch(() => ({ data: [] }))
        );
        const rejectionPromises = retailerIds.map(rid => 
          api.get(`/api/field-team/retailer/${rid}-rejections`).catch(() => ({ data: [] }))
        );
        const indentPromises = retailerIds.map(rid => 
          api.get(`/api/field-team/retailer/${rid}-indents`).catch(() => ({ data: [] }))
        );
        
        const [dispatchResults, rejectionResults, indentResults] = await Promise.all([
          Promise.all(dispatchPromises),
          Promise.all(rejectionPromises),
          Promise.all(indentPromises)
        ]);
        
        // Combine all dispatches, rejections, and indents
        const combinedDispatches = dispatchResults.flatMap(r => r.data || []);
        const combinedRejections = rejectionResults.flatMap(r => r.data || []);
        const combinedIndents = indentResults.flatMap(r => r.data || []);
        
        setAllDispatches(combinedDispatches);
        setAllRejections(combinedRejections);
        setAllIndents(combinedIndents);
        
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

  // Fetch products and packagings for rejection recording
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

  // Fetch assigned retailers with full details
  useEffect(() => {
    const fetchAssignedRetailersDetails = async () => {
      try {
        const response = await api.get('/api/field-team/assigned-retailers');
        setAssignedRetailersDetails(response.data?.retailers || []);
      } catch (error) {
        console.error('Error fetching assigned retailers:', error);
      }
    };
    fetchAssignedRetailersDetails();
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

  // Load pending to go live retailers when modal opens
  const loadPendingToGoLiveRetailers = useCallback(async () => {
    setLoadingPendingRetailers(true);
    try {
      const response = await api.get('/api/field-team/pending-to-go-live');
      setPendingToGoLiveRetailers(response.data.retailers || []);
    } catch (error) {
      console.error('Failed to load pending retailers:', error);
      toast.error('Failed to load pending retailers');
    } finally {
      setLoadingPendingRetailers(false);
    }
  }, []);

  useEffect(() => {
    if (showPendingToGoLiveModal) {
      loadPendingToGoLiveRetailers();
    }
  }, [showPendingToGoLiveModal, loadPendingToGoLiveRetailers]);

  // Load retailers with zero orders yesterday
  const loadZeroOrdersRetailers = useCallback(async () => {
    setLoadingZeroOrders(true);
    try {
      const response = await api.get('/api/retailers-zero-orders-yesterday');
      setZeroOrdersRetailers(response.data.retailers || []);
      setZeroOrdersDate(response.data.date || '');
    } catch (error) {
      console.error('Failed to load zero orders retailers:', error);
      toast.error('Failed to load retailers data');
    } finally {
      setLoadingZeroOrders(false);
    }
  }, []);

  useEffect(() => {
    if (showZeroOrdersModal) {
      loadZeroOrdersRetailers();
    }
  }, [showZeroOrdersModal, loadZeroOrdersRetailers]);

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

  // Open Auto Indent modal
  const handleOpenAutoIndent = (retailer) => {
    setAutoIndentRetailer(retailer);
    // Default to tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setAutoIndentDate(tomorrow.toISOString().split('T')[0]);
    setShowAutoIndentModal(true);
  };

  // Generate Auto Indent
  const handleGenerateAutoIndent = async () => {
    if (!autoIndentRetailer || !autoIndentDate) {
      toast.error('Please select a date');
      return;
    }

    setAutoIndentLoading(true);
    try {
      const response = await api.post('/api/admin/generate-auto-indent', {
        retailer_id: autoIndentRetailer.retailer_id,
        date: autoIndentDate,
        method: 'historical',  // Always use historical method
        boost_percent: 0       // No boost for field team
      });

      if (response.data.success === false) {
        // Show info message for things like "indent already exists"
        toast.info(response.data.message);
      } else if (response.data.indent_id) {
        const itemsCount = response.data.products_count || response.data.items_count || 0;
        toast.success(`Indent generated for ${autoIndentRetailer.retailer_name} with ${itemsCount} products`);
        setShowAutoIndentModal(false);
        setAutoIndentRetailer(null);
        // Refresh portfolio data to show updated indent count
        await fetchPortfolioData();
      } else if (response.data.message) {
        toast.info(response.data.message);
      }
    } catch (error) {
      console.error('Auto indent error:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate indent');
    } finally {
      setAutoIndentLoading(false);
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

  // Indent stats for Today and Tomorrow
  const indentStats = useMemo(() => {
    const today = getISTDate();
    const tomorrow = getISTTomorrow();
    
    const todayIndents = allIndents.filter(i => (i.indent_date || '').split('T')[0] === today);
    const tomorrowIndents = allIndents.filter(i => (i.indent_date || '').split('T')[0] === tomorrow);
    
    const calcQty = (indents) => {
      return indents.reduce((sum, ind) => {
        return sum + (ind.items || []).reduce((s, item) => s + (item.quantity || 0), 0);
      }, 0);
    };
    
    return {
      todayCount: todayIndents.length,
      todayQty: calcQty(todayIndents),
      todayIndents: todayIndents,
      tomorrowCount: tomorrowIndents.length,
      tomorrowQty: calcQty(tomorrowIndents),
      tomorrowIndents: tomorrowIndents
    };
  }, [allIndents]);

  // Get indents for modal based on mode
  const indentsForModal = useMemo(() => {
    if (indentsModalMode === 'today') {
      return indentStats.todayIndents;
    }
    return indentStats.tomorrowIndents;
  }, [indentsModalMode, indentStats]);

  // W-21: Avg Net Sales (15d) and Rejection % (15d) for portfolio
  // Uses 15 oldest of last 21 delivered days (same logic as Retailer Dashboard)
  const netSalesAndRejection15d = useMemo(() => {
    // Fetch 21 distinct dispatch dates (delivered days), DESC
    const dispatchDateSet = new Set();
    (allDispatches || []).forEach(d => {
      const dd = (d.dispatch_date || '').split('T')[0];
      if (dd) dispatchDateSet.add(dd);
    });
    const top21 = Array.from(dispatchDateSet).sort((a, b) => b.localeCompare(a)).slice(0, 21);
    
    // Use only the 15 OLDEST of those 21 (drop the 6 most recent)
    const oldest15 = top21.slice(6, 21);
    const oldest15Set = new Set(oldest15);
    const deliveredDaysCount = oldest15.length;
    const windowSize = top21.length;

    // Per-day aggregation ONLY for dates in oldest15
    const dayData = {};
    oldest15.forEach(dd => { dayData[dd] = { grossValue: 0, grossQty: 0, rejValue: 0, rejQty: 0 }; });

    (allDispatches || []).forEach(d => {
      const dd = (d.dispatch_date || '').split('T')[0];
      if (!oldest15Set.has(dd)) return;
      const mrp = (d.total_mrp_value && d.total_mrp_value > 0)
        ? d.total_mrp_value
        : (d.items || []).reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0);
      dayData[dd].grossValue += mrp;
      (d.items || []).forEach(i => {
        const qty = i.supplied_qty || 0;
        dayData[dd].grossQty += qty;
      });
    });

    (allRejections || []).forEach(r => {
      const rd = (r.rejection_date || '').split('T')[0];
      if (!oldest15Set.has(rd)) return;
      if (!dayData[rd]) return;
      dayData[rd].rejValue += (r.rejection_value || 0);
      dayData[rd].rejQty += (r.quantity || 0);
    });

    // Avg Net Sales across the 15 oldest delivered days
    let totalNetSales = 0;
    oldest15.forEach(dd => { totalNetSales += dayData[dd].grossValue - dayData[dd].rejValue; });
    const avgNetSales = deliveredDaysCount > 0 ? totalNetSales / deliveredDaysCount : 0;

    // Rejection %: ALL 15 oldest days
    let rejQty = 0, supQty = 0;
    oldest15.forEach(dd => { supQty += dayData[dd].grossQty; rejQty += dayData[dd].rejQty; });
    const rejectionPct = supQty > 0 ? (rejQty / supQty) * 100 : null;

    return { avgNetSales, deliveredDaysCount, windowSize, rejectionPct };
  }, [allDispatches, allRejections]);

  // Retailer-wise breakdown for Net Sales and Rejection % modals
  const retailerWiseMetrics = useMemo(() => {
    return assignedRetailers.map(retailer => {
      const retailerId = retailer.retailer_id;
      
      // Get dispatches and rejections for this retailer
      const retailerDispatches = allDispatches.filter(d => d.retailer_id === retailerId);
      const retailerRejections = allRejections.filter(r => r.retailer_id === retailerId);
      
      // W-21 calculation for this retailer
      const dispatchDateSet = new Set();
      retailerDispatches.forEach(d => {
        const dd = (d.dispatch_date || '').split('T')[0];
        if (dd) dispatchDateSet.add(dd);
      });
      const top21 = Array.from(dispatchDateSet).sort((a, b) => b.localeCompare(a)).slice(0, 21);
      const oldest15 = top21.slice(6, 21);
      const oldest15Set = new Set(oldest15);
      
      // Per-day aggregation
      const dayData = {};
      oldest15.forEach(dd => { dayData[dd] = { grossValue: 0, grossQty: 0, rejValue: 0, rejQty: 0 }; });
      
      retailerDispatches.forEach(d => {
        const dd = (d.dispatch_date || '').split('T')[0];
        if (!oldest15Set.has(dd)) return;
        const mrp = (d.total_mrp_value && d.total_mrp_value > 0)
          ? d.total_mrp_value
          : (d.items || []).reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0);
        dayData[dd].grossValue += mrp;
        (d.items || []).forEach(i => {
          dayData[dd].grossQty += (i.supplied_qty || 0);
        });
      });
      
      retailerRejections.forEach(r => {
        const rd = (r.rejection_date || '').split('T')[0];
        if (!oldest15Set.has(rd) || !dayData[rd]) return;
        dayData[rd].rejValue += (r.rejection_value || 0);
        dayData[rd].rejQty += (r.quantity || 0);
      });
      
      // Calculate metrics
      let totalNetSales = 0;
      let rejQty = 0, supQty = 0;
      oldest15.forEach(dd => {
        totalNetSales += dayData[dd].grossValue - dayData[dd].rejValue;
        supQty += dayData[dd].grossQty;
        rejQty += dayData[dd].rejQty;
      });
      
      const avgNetSales = oldest15.length > 0 ? totalNetSales / oldest15.length : 0;
      const rejectionPct = supQty > 0 ? (rejQty / supQty) * 100 : null;
      
      return {
        retailer_id: retailerId,
        retailer_name: retailer.retailer_name,
        avgNetSales,
        rejectionPct,
        deliveredDays: oldest15.length,
        windowSize: top21.length
      };
    }).sort((a, b) => b.avgNetSales - a.avgNetSales);
  }, [assignedRetailers, allDispatches, allRejections]);

  // ========== REJECTION RECORDING FUNCTIONS ==========
  
  // Reset rejection wizard
  const resetRecordRejectionWizard = () => {
    setRecordRejectionStep(1);
    setRecordRejectionRetailer(null);
    setRecordRejectionProduct(null);
    setRecordRejectionRetailerSearch('');
    setRecordRejectionProductSearch('');
    setRecordRejectionDateRows([]);
    setRecordRejectionDrafts([]);
    setRecordRejectionEditingDraftKey(null);
    setRetailerDispatchesForRejection([]);
    setRetailerRejectionsForRejection([]);
    setRejectionHistoryMap({});
  };

  // Fetch dispatches and rejections for selected retailer
  const fetchRetailerDataForRejection = async (retailerId) => {
    try {
      const [dispRes, rejRes] = await Promise.all([
        api.get(`/api/field-team/retailer/${retailerId}-dispatches`),
        api.get(`/api/field-team/retailer/${retailerId}-rejections`)
      ]);
      setRetailerDispatchesForRejection(dispRes.data || []);
      setRetailerRejectionsForRejection(rejRes.data || []);
    } catch (error) {
      console.error('Error fetching retailer data for rejection:', error);
      toast.error('Failed to load retailer dispatch data');
    }
  };

  // Fetch rejection history for a product (batch API) - same as Admin Portal
  const fetchRejectionHistoryForProduct = async (retailerId, productId, variantId) => {
    try {
      const response = await api.post('/api/retailer-rejections/history-batch', {
        retailer_id: retailerId,
        product_ids: [productId],
        variant_ids: variantId ? [variantId] : []
      });
      const history = response.data?.history || {};
      setRejectionHistoryMap(history);
    } catch (err) {
      console.error('Failed to fetch rejection history:', err);
      setRejectionHistoryMap({});
    }
  };

  // Rejection window constant (same as Admin Portal)
  const RECORD_REJECTION_WINDOW_DAYS = 30;

  // Product options for selected retailer (from their dispatches in last 30 days)
  // Matches Admin Portal logic exactly
  const recordRejectionProductOptions = useMemo(() => {
    if (!recordRejectionRetailer) return [];
    
    const cutoffTs = Date.now() - RECORD_REJECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const seen = new Map();
    
    (retailerDispatchesForRejection || []).forEach(disp => {
      const d = new Date(disp.dispatch_date);
      if (isNaN(d.getTime()) || d.getTime() < cutoffTs) return;
      
      (disp.items || []).forEach(item => {
        if (!item.product_id) return;
        const key = `${item.product_id}__${item.variant_id || ''}`;
        if (!seen.has(key)) {
          seen.set(key, {
            product_id: item.product_id,
            product_name: item.product_name || 'Unknown',
            variant_id: item.variant_id || null,
            variant_name: item.variant_name || ''
          });
        }
      });
    });
    
    return Array.from(seen.values()).sort((a, b) => 
      (a.product_name || '').localeCompare(b.product_name || '')
    );
  }, [recordRejectionRetailer, retailerDispatchesForRejection]);

  // Available dates for rejection (dates with dispatches for selected product in last 30 days)
  // Matches Admin Portal logic exactly
  const recordRejectionAvailableDates = useMemo(() => {
    if (!recordRejectionRetailer || !recordRejectionProduct) return [];
    
    const cutoffTs = Date.now() - RECORD_REJECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const pid = recordRejectionProduct.product_id;
    const vid = recordRejectionProduct.variant_id || null;
    
    // Get rejection history from batch API response
    const compositeKey = vid ? `${pid}|${vid}` : pid;
    const rejectionHistory = rejectionHistoryMap[compositeKey] || rejectionHistoryMap[pid] || { rejections: [], total_quantity: 0 };
    
    // Group rejections by date for quick lookup
    const rejectionsByDate = {};
    (rejectionHistory.rejections || []).forEach(rej => {
      const rejDate = (rej.rejection_date || '').split('T')[0];
      if (!rejectionsByDate[rejDate]) {
        rejectionsByDate[rejDate] = [];
      }
      rejectionsByDate[rejDate].push(rej);
    });
    
    const dateMap = new Map();
    
    (retailerDispatchesForRejection || []).forEach(disp => {
      const d = new Date(disp.dispatch_date);
      if (isNaN(d.getTime()) || d.getTime() < cutoffTs) return;
      
      const dateKey = String(disp.dispatch_date).slice(0, 10);
      let mrpForRow = 0;
      let suppliedForRow = 0;
      
      (disp.items || []).forEach(item => {
        if (item.product_id !== pid) return;
        if ((item.variant_id || null) !== vid) return;
        suppliedForRow += (item.supplied_qty || 0);
        if (item.mrp && item.mrp > 0) mrpForRow = item.mrp;
      });
      
      if (suppliedForRow <= 0) return;
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { supplied_qty: 0, existing_rejection: 0, mrp: 0, previous_rejections: [] });
      }
      const entry = dateMap.get(dateKey);
      entry.supplied_qty += suppliedForRow;
      if (mrpForRow > 0 && entry.mrp === 0) entry.mrp = mrpForRow;
    });
    
    // Subtract existing rejections and attach detailed history
    (retailerRejectionsForRejection || []).forEach(rej => {
      if (rej.product_id !== pid) return;
      if ((rej.variant_id || null) !== vid) return;
      const rejDate = (rej.rejection_date || '').split('T')[0];
      if (dateMap.has(rejDate)) {
        dateMap.get(rejDate).existing_rejection += (rej.quantity || 0);
      }
    });
    
    // Attach detailed previous rejections from history API
    dateMap.forEach((data, dateKey) => {
      data.previous_rejections = rejectionsByDate[dateKey] || [];
    });
    
    // Convert to array
    return Array.from(dateMap.entries())
      .map(([date, data]) => ({
        date,
        supplied_qty: data.supplied_qty,
        existing_rejection: data.existing_rejection,
        available_qty: Math.max(0, data.supplied_qty - data.existing_rejection),
        mrp: data.mrp,
        rejection_qty: 0,
        selected: false,
        previous_rejections: data.previous_rejections,
        total_previous_qty: data.existing_rejection
      }))
      .filter(row => row.available_qty > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [recordRejectionRetailer, recordRejectionProduct, retailerDispatchesForRejection, retailerRejectionsForRejection, rejectionHistoryMap]);

  // Update date rows when available dates change
  useEffect(() => {
    setRecordRejectionDateRows(recordRejectionAvailableDates);
  }, [recordRejectionAvailableDates]);

  // Handle draft operations
  const handleAddToDraft = () => {
    const selected = recordRejectionDateRows.filter(r => r.selected && (r.rejection_qty || 0) > 0);
    if (selected.length === 0) {
      toast.error('Please select at least one date with rejection quantity');
      return;
    }
    
    // Validate reason is selected for all entries
    for (const row of selected) {
      if (!row.reason) {
        toast.error(`Please select a reason for the entry on ${row.date}`);
        return;
      }
    }
    
    const draftKey = `${recordRejectionProduct.product_id}__${recordRejectionProduct.variant_id || ''}`;
    const entries = selected.map(row => ({
      date: row.date,
      quantity: row.rejection_qty,
      reason: row.reason || '',
      remarks: row.remarks || '',
      mrp: row.mrp || 0  // Include MRP for rejection value calculation
    }));
    
    const newDraft = {
      key: draftKey,
      product_id: recordRejectionProduct.product_id,
      product_name: recordRejectionProduct.product_name,
      variant_id: recordRejectionProduct.variant_id || null,
      variant_name: recordRejectionProduct.variant_name || '',
      entries: entries
    };
    
    // Check if editing existing draft
    if (recordRejectionEditingDraftKey) {
      setRecordRejectionDrafts(prev => prev.map(d => d.key === recordRejectionEditingDraftKey ? newDraft : d));
    } else {
      // Check if draft already exists for this product
      const existingIdx = recordRejectionDrafts.findIndex(d => d.key === draftKey);
      if (existingIdx >= 0) {
        // Merge entries
        setRecordRejectionDrafts(prev => {
          const updated = [...prev];
          const existing = updated[existingIdx];
          const mergedEntries = [...existing.entries];
          entries.forEach(e => {
            const idx = mergedEntries.findIndex(m => m.date === e.date);
            if (idx >= 0) {
              mergedEntries[idx].quantity += e.quantity;
            } else {
              mergedEntries.push(e);
            }
          });
          updated[existingIdx] = { ...existing, entries: mergedEntries };
          return updated;
        });
      } else {
        setRecordRejectionDrafts(prev => [...prev, newDraft]);
      }
    }
    
    toast.success(recordRejectionEditingDraftKey ? 'Draft updated' : 'Added to draft');
    setRecordRejectionProduct(null);
    setRecordRejectionEditingDraftKey(null);
    setRecordRejectionStep(2);
  };

  const handleEditDraft = async (draftKey) => {
    const draft = recordRejectionDrafts.find(d => d.key === draftKey);
    if (!draft) return;
    
    setRecordRejectionProduct({
      product_id: draft.product_id,
      product_name: draft.product_name,
      variant_id: draft.variant_id,
      variant_name: draft.variant_name
    });
    setRecordRejectionEditingDraftKey(draftKey);
    
    // Fetch rejection history for this product when editing
    await fetchRejectionHistoryForProduct(
      recordRejectionRetailer.id,
      draft.product_id,
      draft.variant_id
    );
    
    setRecordRejectionStep(3);
  };

  const handleDeleteDraft = (draftKey) => {
    setRecordRejectionDrafts(prev => prev.filter(d => d.key !== draftKey));
    toast.success('Draft deleted');
  };

  // Submit all drafts
  const handleSubmitAllDrafts = async () => {
    if (recordRejectionDrafts.length === 0) {
      toast.error('No drafts to submit');
      return;
    }
    
    setRecordRejectionSubmitting(true);
    try {
      // Build rejection records from drafts
      const rejections = [];
      recordRejectionDrafts.forEach(draft => {
        draft.entries.forEach(entry => {
          const mrp = entry.mrp || 0;
          const quantity = entry.quantity || 0;
          rejections.push({
            retailer_id: recordRejectionRetailer.id,
            product_id: draft.product_id,
            product_name: draft.product_name,
            variant_id: draft.variant_id || null,
            variant_name: draft.variant_name || '',
            rejection_date: entry.date,
            quantity: quantity,
            mrp: mrp,
            rejection_value: mrp * quantity,  // Calculate rejection value
            reason: entry.reason || '',
            remarks: entry.remarks || ''
          });
        });
      });
      
      // Submit rejections one by one or in batch
      for (const rej of rejections) {
        await api.post('/api/retailer-rejections', rej);
      }
      
      toast.success(`${rejections.length} rejection(s) recorded successfully`);
      setShowRejectionModal(false);
      resetRecordRejectionWizard();
      
      // Refresh data
      await fetchPortfolioData();
    } catch (error) {
      console.error('Error submitting rejections:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit rejections');
    } finally {
      setRecordRejectionSubmitting(false);
    }
  };

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
        <div className={`fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 flex flex-col overflow-hidden ${sideMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 border-b bg-[#14532D]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Menu</h2>
              <Button variant="ghost" size="sm" onClick={() => setSideMenuOpen(false)} className="text-white hover:bg-white/20">
                <X size={20} />
              </Button>
            </div>
          </div>
          <nav className="p-2 flex-1 overflow-y-auto">
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
                Welcome, {currentUser?.name || 'Field Team'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setShowRejectionModal(true)}
                data-testid="record-rejection-btn"
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                Record Rejection
              </Button>
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

          {/* Today's and Tomorrow's Indents Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-lg border p-3">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Package size={14} />
                <span>Today&apos;s Indents ({new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Count:</span>
                  <span className="text-xs font-semibold">{indentStats.todayCount} <span className="text-blue-600">({indentStats.todayQty} qty)</span></span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setIndentsModalMode('today'); setShowIndentsModal(true); }}
                  className="h-6 text-[10px] mt-2 w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                  data-testid="view-today-indents-btn"
                >
                  <Eye size={12} className="mr-1" />
                  View
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-3">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Truck size={14} />
                <span>Tomorrow&apos;s Indents ({(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); })()})</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Count:</span>
                  <span className="text-xs font-semibold">{indentStats.tomorrowCount} <span className="text-blue-600">({indentStats.tomorrowQty} qty)</span></span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setIndentsModalMode('tomorrow'); setShowIndentsModal(true); }}
                  className="h-6 text-[10px] mt-2 w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                  data-testid="view-tomorrow-indents-btn"
                >
                  <Eye size={12} className="mr-1" />
                  View
                </Button>
              </div>
            </div>
          </div>

          {/* Summary Cards Row */}
          {/* Retailer Breakdown Cards */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <Card className="bg-blue-50 border-blue-200" data-testid="total-retailers-card">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 rounded">
                    <UserPlus className="w-3 h-3 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[9px] text-blue-700 font-medium uppercase">Total Retailers</p>
                    <p className="text-base font-bold text-blue-800">{portfolioSummary?.total_retailers || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-green-50 border-green-200" data-testid="active-retailers-card">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-green-100 rounded">
                    <UserCheck className="w-3 h-3 text-green-600" />
                  </div>
                  <div>
                    <p className="text-[9px] text-green-700 font-medium uppercase">Active Retailers</p>
                    <p className="text-base font-bold text-green-800">{portfolioSummary?.active_retailers || 0}</p>
                    <button 
                      onClick={() => setShowZeroOrdersModal(true)}
                      className="text-[9px] text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                    >
                      0 Orders Yesterday →
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-emerald-50 border-emerald-200" data-testid="live-retailers-card">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-emerald-100 rounded">
                    <Activity className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[9px] text-emerald-700 font-medium uppercase">Live Retailers</p>
                    <p className="text-base font-bold text-emerald-800">{portfolioSummary?.live_retailers || 0}</p>
                    {(portfolioSummary?.pending_to_go_live || 0) > 0 && (
                      <button 
                        onClick={() => setShowPendingToGoLiveModal(true)}
                        className="text-[9px] text-orange-600 hover:text-orange-800 hover:underline cursor-pointer"
                      >
                        {portfolioSummary.pending_to_go_live} Pending to go live →
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-50 border-gray-300" data-testid="churned-retailers-card">
              <CardContent className="p-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gray-200 rounded">
                    <UserX className="w-3 h-3 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-600 font-medium uppercase">Churned Retailers</p>
                    <p className="text-base font-bold text-gray-700">{portfolioSummary?.churned_retailers || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Financial Summary Cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
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

          {/* Avg Net Sales (15D) and Rejection % (15D) Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Avg Net Sales (15D) Card */}
            <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200 cursor-pointer hover:shadow-md transition-shadow" data-testid="avg-net-sales-card" onClick={() => setShowNetSalesModal(true)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-semibold uppercase">Avg Net Sales (15D)</p>
                      <p className="text-xl font-bold text-blue-800">{formatCurrency(netSalesAndRejection15d.avgNetSales)}</p>
                      {netSalesAndRejection15d.deliveredDaysCount > 0 && (
                        <p className="text-[10px] text-gray-500 mt-1">avg over 15 oldest of last {netSalesAndRejection15d.windowSize || 21} delivered days</p>
                      )}
                    </div>
                  </div>
                  <button className="text-blue-600 text-xs font-semibold hover:underline">View</button>
                </div>
              </CardContent>
            </Card>
            
            {/* Rejection % (15D) Card */}
            <Card className="bg-gradient-to-br from-red-50 to-white border-red-200 cursor-pointer hover:shadow-md transition-shadow" data-testid="rejection-pct-card" onClick={() => setShowRejectionPctModal(true)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-red-600 font-semibold uppercase">Rejection % (15D)</p>
                      <p className="text-xl font-bold text-red-700">
                        {netSalesAndRejection15d.rejectionPct !== null ? `${netSalesAndRejection15d.rejectionPct.toFixed(1)}%` : '—'}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {netSalesAndRejection15d.deliveredDaysCount > 0
                          ? `based on 15 oldest of last ${netSalesAndRejection15d.windowSize || 21} delivered days`
                          : 'No delivered days'}
                      </p>
                    </div>
                  </div>
                  <button className="text-red-600 text-xs font-semibold hover:underline">View</button>
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
                      
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAutoIndent(retailer);
                          }}
                          data-testid={`auto-indent-${retailer.retailer_id}`}
                        >
                          <Zap className="w-4 h-4 mr-1" />
                          Auto Indent
                        </Button>
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
                          View Dashboard
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>

        {/* ==================== NET SALES MODAL (Retailer-wise) ==================== */}
        {showNetSalesModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Avg Net Sales (15D) — Retailer Breakdown</h3>
                  <p className="text-xs text-gray-500">15 oldest of last 21 delivered days per retailer</p>
                </div>
                <button onClick={() => setShowNetSalesModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {retailerWiseMetrics.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No retailer data available</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Retailer</th>
                        <th className="text-right p-2">Avg Net Sales</th>
                        <th className="text-right p-2">Days</th>
                        <th className="text-center p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retailerWiseMetrics.map(r => (
                        <tr key={r.retailer_id} className="border-t hover:bg-gray-50">
                          <td className="p-2 font-medium">{r.retailer_name}</td>
                          <td className="p-2 text-right text-blue-600 font-semibold">{formatCurrency(r.avgNetSales)}</td>
                          <td className="p-2 text-right text-gray-500">{r.deliveredDays}/{r.windowSize}</td>
                          <td className="p-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowNetSalesModal(false);
                                handleViewRetailer(r.retailer_id);
                              }}
                              className="text-xs"
                            >
                              View Dashboard
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td className="p-2">Portfolio Total</td>
                        <td className="p-2 text-right text-blue-700">{formatCurrency(netSalesAndRejection15d.avgNetSales)}</td>
                        <td className="p-2 text-right">{netSalesAndRejection15d.deliveredDaysCount}/{netSalesAndRejection15d.windowSize}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== REJECTION % MODAL (Retailer-wise) ==================== */}
        {showRejectionPctModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Rejection % (15D) — Retailer Breakdown</h3>
                  <p className="text-xs text-gray-500">15 oldest of last 21 delivered days per retailer</p>
                </div>
                <button onClick={() => setShowRejectionPctModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {retailerWiseMetrics.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No retailer data available</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Retailer</th>
                        <th className="text-right p-2">Rejection %</th>
                        <th className="text-right p-2">Days</th>
                        <th className="text-center p-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...retailerWiseMetrics].sort((a, b) => (b.rejectionPct || 0) - (a.rejectionPct || 0)).map(r => (
                        <tr key={r.retailer_id} className="border-t hover:bg-gray-50">
                          <td className="p-2 font-medium">{r.retailer_name}</td>
                          <td className={`p-2 text-right font-semibold ${(r.rejectionPct || 0) > 15 ? 'text-red-600' : 'text-orange-600'}`}>
                            {r.rejectionPct !== null ? `${r.rejectionPct.toFixed(1)}%` : '—'}
                          </td>
                          <td className="p-2 text-right text-gray-500">{r.deliveredDays}/{r.windowSize}</td>
                          <td className="p-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowRejectionPctModal(false);
                                handleViewRetailer(r.retailer_id);
                              }}
                              className="text-xs"
                            >
                              View Dashboard
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td className="p-2">Portfolio Total</td>
                        <td className="p-2 text-right text-red-700">
                          {netSalesAndRejection15d.rejectionPct !== null ? `${netSalesAndRejection15d.rejectionPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="p-2 text-right">{netSalesAndRejection15d.deliveredDaysCount}/{netSalesAndRejection15d.windowSize}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== RECORD REJECTION MODAL (Wizard) ==================== */}
        {showRejectionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-3 sm:p-4 border-b flex-shrink-0">
                <div className="flex items-center gap-2">
                  {recordRejectionStep > 1 && (
                    <button
                      onClick={() => {
                        if (recordRejectionStep === 3) {
                          setRecordRejectionProduct(null);
                          setRecordRejectionEditingDraftKey(null);
                          setRecordRejectionStep(2);
                        } else if (recordRejectionStep === 2) {
                          if (recordRejectionDrafts.length > 0) {
                            if (!window.confirm('Drafts will be discarded if you switch retailer. Continue?')) return;
                            setRecordRejectionDrafts([]);
                          }
                          setRecordRejectionProduct(null);
                          setRecordRejectionRetailer(null);
                          setRetailerDispatchesForRejection([]);
                          setRetailerRejectionsForRejection([]);
                          setRecordRejectionStep(1);
                        }
                      }}
                      className="p-1 hover:bg-gray-100 rounded text-gray-500"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold">Record Rejection</h3>
                    <p className="text-xs text-gray-500">
                      {recordRejectionStep === 1 && 'Step 1: Select Retailer'}
                      {recordRejectionStep === 2 && `${recordRejectionRetailer?.name} › Select Product`}
                      {recordRejectionStep === 3 && `${recordRejectionRetailer?.name} › ${recordRejectionProduct?.product_name}${recordRejectionProduct?.variant_name ? ' (' + recordRejectionProduct.variant_name + ')' : ''}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowRejectionModal(false); resetRecordRejectionWizard(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-3 sm:p-4 overflow-y-auto flex-1">
                {/* Step 1: Retailer Picker (ONLY assigned retailers) */}
                {recordRejectionStep === 1 && (
                  <div>
                    <input
                      type="text"
                      placeholder="Search retailer..."
                      value={recordRejectionRetailerSearch}
                      onChange={(e) => setRecordRejectionRetailerSearch(e.target.value)}
                      className="w-full px-3 py-2 mb-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                    {assignedRetailersDetails.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">No retailers assigned to you</div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto border rounded">
                        {assignedRetailersDetails
                          .filter(r => !recordRejectionRetailerSearch || (r.company_name || r.name || '').toLowerCase().includes(recordRejectionRetailerSearch.toLowerCase()))
                          .map(r => (
                            <div
                              key={r.id}
                              onClick={async () => {
                                setRecordRejectionRetailer({ id: r.id, name: r.company_name || r.name });
                                setRecordRejectionRetailerSearch('');
                                await fetchRetailerDataForRejection(r.id);
                                setRecordRejectionStep(2);
                              }}
                              className="p-3 hover:bg-red-50 cursor-pointer border-b last:border-b-0 text-sm"
                            >
                              {r.company_name || r.name}
                            </div>
                          ))
                        }
                        {assignedRetailersDetails.filter(r => !recordRejectionRetailerSearch || (r.company_name || r.name || '').toLowerCase().includes(recordRejectionRetailerSearch.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center text-gray-400 text-sm">No retailer matches.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Product Picker */}
                {recordRejectionStep === 2 && (
                  <div>
                    {/* Drafts Panel */}
                    {recordRejectionDrafts.length > 0 && (
                      <div className="mb-3 border rounded bg-green-50 p-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-green-700">
                            Drafts ({recordRejectionDrafts.length} product{recordRejectionDrafts.length > 1 ? 's' : ''}, {recordRejectionDrafts.reduce((s, d) => s + d.entries.length, 0)} entries)
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-600">
                              <th className="p-1">Product</th>
                              <th className="p-1">Variant</th>
                              <th className="p-1 text-center"># Entries</th>
                              <th className="p-1 text-center">Total Qty</th>
                              <th className="p-1 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recordRejectionDrafts.map(draft => (
                              <tr key={draft.key} className="border-t">
                                <td className="p-1">{draft.product_name}</td>
                                <td className="p-1 text-gray-500">{draft.variant_name || '—'}</td>
                                <td className="p-1 text-center">{draft.entries.length}</td>
                                <td className="p-1 text-center">{draft.entries.reduce((s, e) => s + e.quantity, 0)}</td>
                                <td className="p-1 text-center">
                                  <button onClick={() => handleEditDraft(draft.key)} className="text-blue-600 hover:underline mr-2" title="Edit">
                                    <Pencil size={13} />
                                  </button>
                                  <button onClick={() => handleDeleteDraft(draft.key)} className="text-red-600 hover:underline" title="Delete">
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Search product dispatched to this retailer in last 30 days..."
                      value={recordRejectionProductSearch}
                      onChange={(e) => setRecordRejectionProductSearch(e.target.value)}
                      className="w-full px-3 py-2 mb-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                    <p className="text-xs text-gray-400 mb-2">Showing products supplied in the last 30 days.</p>
                    {recordRejectionProductOptions.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">No products dispatched to this retailer in the last 30 days.</div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border rounded">
                        {recordRejectionProductOptions
                          .filter(p => !recordRejectionProductSearch || (p.product_name || '').toLowerCase().includes(recordRejectionProductSearch.toLowerCase()))
                          .map((p, idx) => (
                            <div
                              key={idx}
                              onClick={async () => {
                                setRecordRejectionProduct(p);
                                setRecordRejectionProductSearch('');
                                // Fetch rejection history for this product (same as Admin Panel)
                                await fetchRejectionHistoryForProduct(
                                  recordRejectionRetailer.id,
                                  p.product_id,
                                  p.variant_id
                                );
                                setRecordRejectionStep(3);
                              }}
                              className="p-3 hover:bg-red-50 cursor-pointer border-b last:border-b-0 text-sm flex justify-between"
                            >
                              <span>{p.product_name}</span>
                              {p.variant_name && <span className="text-gray-400">{p.variant_name}</span>}
                            </div>
                          ))
                        }
                        {recordRejectionProductOptions.filter(p => !recordRejectionProductSearch || (p.product_name || '').toLowerCase().includes(recordRejectionProductSearch.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center text-gray-400 text-sm">No products match your search.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Date Selection */}
                {recordRejectionStep === 3 && (
                  <div>
                    {recordRejectionDateRows.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">No available dates for rejection (all dispatched quantity already rejected)</div>
                    ) : (
                      <div className="border rounded overflow-x-auto">
                        <table className="w-full text-sm min-w-[650px]">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="p-2 text-left w-8">
                                <input
                                  type="checkbox"
                                  checked={recordRejectionDateRows.every(r => r.selected)}
                                  onChange={(e) => {
                                    setRecordRejectionDateRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })));
                                  }}
                                />
                              </th>
                              <th className="p-2 text-left">Date</th>
                              <th className="p-2 text-center">Supplied</th>
                              <th className="p-2 text-center">Existing Rej.</th>
                              <th className="p-2 text-center">New Qty</th>
                              <th className="p-2 text-left min-w-[100px]">Reason</th>
                              <th className="p-2 text-left min-w-[80px]">Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recordRejectionDateRows.map((row, idx) => {
                              const maxAllowed = (row.supplied_qty || 0) - (row.total_previous_qty || 0);
                              return (
                              <tr key={row.date} className={`border-t ${row.selected ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    checked={row.selected}
                                    onChange={(e) => {
                                      setRecordRejectionDateRows(prev => {
                                        const updated = [...prev];
                                        updated[idx] = { 
                                          ...updated[idx], 
                                          selected: e.target.checked,
                                          rejection_qty: e.target.checked ? updated[idx].rejection_qty : 0,
                                          reason: e.target.checked ? updated[idx].reason : ''
                                        };
                                        return updated;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="p-2 whitespace-nowrap text-sm">
                                  {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </td>
                                <td className="p-2 text-center text-gray-600">{row.supplied_qty}</td>
                                <td className="p-2 text-center">
                                  {(row.total_previous_qty || 0) > 0 ? (
                                    <div className="relative group inline-block">
                                      <span className="font-medium text-red-600 cursor-help">{row.total_previous_qty}</span>
                                      <div className="absolute z-20 hidden group-hover:block bg-white border shadow-lg p-2 rounded text-xs w-48 left-0 top-full mt-1">
                                        <div className="font-medium text-gray-700 mb-1">Previous Rejections:</div>
                                        {(row.previous_rejections || []).map((pr, prIdx) => (
                                          <div key={prIdx} className="text-gray-600 py-0.5 border-b last:border-0">
                                            {pr.quantity} - {pr.reason || 'No reason'}
                                            {pr.created_at && (
                                              <div className="text-[10px] text-gray-400">
                                                {new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                        {(!row.previous_rejections || row.previous_rejections.length === 0) && (
                                          <div className="text-gray-400 text-xs">Details loading...</div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <Input
                                    type="number"
                                    min="0"
                                    max={maxAllowed}
                                    value={row.rejection_qty || ''}
                                    onChange={(e) => {
                                      const val = Math.min(parseFloat(e.target.value) || 0, maxAllowed);
                                      setRecordRejectionDateRows(prev => {
                                        const updated = [...prev];
                                        updated[idx] = { ...updated[idx], rejection_qty: val, selected: val > 0 ? true : updated[idx].selected };
                                        return updated;
                                      });
                                    }}
                                    disabled={!row.selected}
                                    className="w-16 h-7 text-center text-sm disabled:bg-gray-100"
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    value={row.reason || ''}
                                    onChange={(e) => {
                                      setRecordRejectionDateRows(prev => {
                                        const updated = [...prev];
                                        updated[idx] = { ...updated[idx], reason: e.target.value };
                                        return updated;
                                      });
                                    }}
                                    disabled={!row.selected}
                                    className="w-full min-w-[90px] h-7 px-1 rounded border text-sm disabled:bg-gray-100"
                                  >
                                    <option value="">Select</option>
                                    <option value="Rotten">Rotten</option>
                                    <option value="Damaged">Damaged</option>
                                    <option value="Quality Issue">Quality Issue</option>
                                    <option value="Expired">Expired</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={row.remarks || ''}
                                    onChange={(e) => {
                                      setRecordRejectionDateRows(prev => {
                                        const updated = [...prev];
                                        updated[idx] = { ...updated[idx], remarks: e.target.value };
                                        return updated;
                                      });
                                    }}
                                    disabled={!row.selected}
                                    placeholder="Optional"
                                    className="w-full min-w-[70px] h-7 px-2 rounded border text-sm disabled:bg-gray-100"
                                  />
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              {(recordRejectionStep === 3 || (recordRejectionStep === 2 && recordRejectionDrafts.length > 0)) && (
                <div className="p-3 sm:p-4 border-t flex justify-between items-center">
                  {recordRejectionStep === 3 && (
                    <Button variant="outline" onClick={handleAddToDraft}>
                      <Plus size={16} className="mr-1" /> Add to Draft
                    </Button>
                  )}
                  {recordRejectionStep === 2 && recordRejectionDrafts.length > 0 && (
                    <div></div>
                  )}
                  {recordRejectionDrafts.length > 0 && (
                    <Button
                      className="bg-red-600 hover:bg-red-700"
                      onClick={handleSubmitAllDrafts}
                      disabled={recordRejectionSubmitting}
                    >
                      {recordRejectionSubmitting ? 'Submitting...' : `Submit All (${recordRejectionDrafts.reduce((s, d) => s + d.entries.length, 0)} entries)`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== INDENTS MODAL ==================== */}
        {showIndentsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">
                  {indentsModalMode === 'today' ? "Today's" : "Tomorrow's"} Orders — Retailer List
                </h3>
                <button onClick={() => setShowIndentsModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                {(() => {
                  // Aggregate indents by retailer
                  const retailerMap = new Map();
                  indentsForModal.forEach(indent => {
                    const rid = indent.retailer_id;
                    const retailer = assignedRetailers.find(r => r.retailer_id === rid);
                    const retailerName = retailer?.retailer_name || indent.retailer_name || 'Unknown Retailer';
                    const qty = (indent.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
                    
                    if (retailerMap.has(rid)) {
                      retailerMap.get(rid).qty += qty;
                    } else {
                      retailerMap.set(rid, { retailer_id: rid, retailer_name: retailerName, qty: qty });
                    }
                  });
                  
                  const retailerList = Array.from(retailerMap.values());
                  
                  if (retailerList.length === 0) {
                    return <p className="text-center text-gray-500 py-8">No orders for {indentsModalMode === 'today' ? 'today' : 'tomorrow'}</p>;
                  }
                  
                  return (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-gray-600 border-b">
                          <th className="py-2 px-2 w-16">S No</th>
                          <th className="py-2 px-2">Retailer Name</th>
                          <th className="py-2 px-2 text-right">Order Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retailerList.map((r, idx) => (
                          <tr 
                            key={r.retailer_id} 
                            className="border-b hover:bg-gray-50 cursor-pointer"
                            onClick={() => {
                              setShowIndentsModal(false);
                              handleViewRetailer(r.retailer_id);
                            }}
                          >
                            <td className="py-3 px-2 text-gray-500">{idx + 1}</td>
                            <td className="py-3 px-2 font-medium">{r.retailer_name}</td>
                            <td className="py-3 px-2 text-right">{r.qty || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Pending to Go Live Modal */}
        <Dialog open={showPendingToGoLiveModal} onOpenChange={setShowPendingToGoLiveModal}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-700">
                <Clock size={20} />
                Pending to Go Live ({pendingToGoLiveRetailers.length})
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-3">
              Your assigned retailers who have not received their first invoice yet.
            </p>
            
            {loadingPendingRetailers ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
              </div>
            ) : pendingToGoLiveRetailers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Activity size={48} className="mx-auto mb-2 text-green-500" />
                <p>All your retailers are live!</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-orange-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left text-orange-700 font-medium">#</th>
                      <th className="p-2 text-left text-orange-700 font-medium">Shop Name</th>
                      <th className="p-2 text-left text-orange-700 font-medium">Contact</th>
                      <th className="p-2 text-left text-orange-700 font-medium">Onboarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingToGoLiveRetailers.map((retailer, idx) => (
                      <tr 
                        key={retailer.id} 
                        className="border-b hover:bg-orange-50 cursor-pointer"
                        onClick={() => {
                          setShowPendingToGoLiveModal(false);
                          handleViewRetailer(retailer.id);
                        }}
                      >
                        <td className="p-2 text-gray-500">{idx + 1}</td>
                        <td className="p-2">
                          <div className="font-medium">{retailer.company_name || retailer.name}</div>
                          <div className="text-xs text-gray-500">{retailer.city || '-'}</div>
                        </td>
                        <td className="p-2 text-gray-600">{retailer.contact || '-'}</td>
                        <td className="p-2 text-gray-600 text-xs">
                          {retailer.created_at 
                            ? new Date(retailer.created_at).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ==================== ZERO ORDERS YESTERDAY MODAL ==================== */}
        <Dialog open={showZeroOrdersModal} onOpenChange={setShowZeroOrdersModal}>
          <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle size={20} />
                0 Orders Yesterday ({zeroOrdersRetailers.length})
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mb-3">
              Your assigned retailers who did not place any order on {zeroOrdersDate ? new Date(zeroOrdersDate + 'T00:00:00').toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}) : 'yesterday'}.
            </p>
            
            {loadingZeroOrders ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              </div>
            ) : zeroOrdersRetailers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Activity size={48} className="mx-auto mb-2 text-green-500" />
                <p>All your retailers placed orders yesterday!</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left text-red-700 font-medium">S.No</th>
                      <th className="p-2 text-left text-red-700 font-medium">Retailer Name</th>
                      <th className="p-2 text-left text-red-700 font-medium">Area</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroOrdersRetailers.map((retailer, idx) => (
                      <tr 
                        key={retailer.id} 
                        className="border-b hover:bg-red-50 cursor-pointer"
                        onClick={() => {
                          setShowZeroOrdersModal(false);
                          handleViewRetailer(retailer.id);
                        }}
                      >
                        <td className="p-2 text-gray-500">{idx + 1}</td>
                        <td className="p-2 font-medium">{retailer.name || '-'}</td>
                        <td className="p-2 text-gray-600">{retailer.area || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ==================== AUTO INDENT MODAL ==================== */}
        <Dialog open={showAutoIndentModal} onOpenChange={setShowAutoIndentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-700">
                <Zap size={20} />
                Auto Indent Generation
              </DialogTitle>
            </DialogHeader>
            
            {autoIndentRetailer && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Retailer</p>
                  <p className="font-semibold text-lg">{autoIndentRetailer.retailer_name}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Date for Indent
                  </label>
                  <Input
                    type="date"
                    value={autoIndentDate}
                    onChange={(e) => setAutoIndentDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800">Historical Sales Method</p>
                      <p className="text-sm text-blue-600 mt-1">
                        Indent will be generated based on the average of the last 4 same weekdays 
                        from historical sales data.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowAutoIndentModal(false);
                      setAutoIndentRetailer(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-orange-600 hover:bg-orange-700"
                    onClick={handleGenerateAutoIndent}
                    disabled={autoIndentLoading || !autoIndentDate}
                  >
                    {autoIndentLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-1" />
                        Generate Indent
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
