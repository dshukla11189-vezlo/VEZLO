import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Trash2, 
  Receipt, Calculator, Users, RefreshCw, Calendar, ArrowUp, ArrowDown,
  BarChart3, PieChart, ChevronDown, ChevronRight, Truck, Clock, Zap, Languages, X, Download, FileSpreadsheet, Building2, Store, ShoppingBag, Check, Eye, Database
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart as RePieChart, Pie, Cell } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';

const COLORS = ['#14532D', '#D97706', '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B', '#6366F1'];

// Helper function to convert rejection from MRP basis to COGS (Purchase Price) basis
// Formula: rejection_at_cogs = rejection_at_mrp × (purchase / sales)
const convertRejectionToCOGS = (rejectionAtMRP, sales, purchase) => {
  if (!rejectionAtMRP || rejectionAtMRP === 0) return 0;
  if (!sales || sales === 0) return rejectionAtMRP; // Fallback to MRP if no sales data
  const cogsRatio = purchase / sales;
  return rejectionAtMRP * cogsRatio;
};

// Helper function to calculate number of days between two dates (inclusive)
const calculateDaysBetween = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diffTime = Math.abs(to - from);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
  return diffDays;
};

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [pnlData, setPnlData] = useState(null);
  const [todaySummary, setTodaySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qcReceivables, setQcReceivables] = useState({ total: 0, received: 0, pending: 0 });
  const [retailReceivables, setRetailReceivables] = useState({ total: 0, received: 0, pending: 0 });
  // Store rejection data by date and retailer_id for exact customer-level rejection
  const [rejectionByDateRetailer, setRejectionByDateRetailer] = useState({});
  
  // Initialize dates from localStorage or default to current month
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('dashboard_dateFrom');
    if (saved) return saved;
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('dashboard_dateTo');
    if (saved) return saved;
    return new Date().toISOString().split('T')[0];
  });
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('dashboard_activeTab');
    return saved || 'overview';
  });
  const [populatingHindi, setPopulatingHindi] = useState(false);
  const [populatingMarathi, setPopulatingMarathi] = useState(false);
  const [populatingReferrals, setPopulatingReferrals] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [runningCogsBackfill, setRunningCogsBackfill] = useState(false);
  const [cogsBackfillProgress, setCogsBackfillProgress] = useState('');
  
  // Customer Vertical View State
  const [selectedVertical, setSelectedVertical] = useState(null); // 'qc' or 'retail' or null
  const [selectedRetailers, setSelectedRetailers] = useState([]); // For multi-select comparison
  const [showVerticalModal, setShowVerticalModal] = useState(false);
  
  // COGS Tab State
  const [cogsSnapshotDate, setCogsSnapshotDate] = useState(new Date().toISOString().split('T')[0]);
  const [cogsSnapshot, setCogsSnapshot] = useState(null);
  const [cogsLoading, setCogsLoading] = useState(false);
  const [cogsSearch, setCogsSearch] = useState('');
  const [cogsSortField, setCogsSortField] = useState('product_name');
  const [cogsSortAsc, setCogsSortAsc] = useState(true);
  
  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('dashboard_dateFrom', dateFrom);
  }, [dateFrom]);
  
  useEffect(() => {
    localStorage.setItem('dashboard_dateTo', dateTo);
  }, [dateTo]);
  
  useEffect(() => {
    localStorage.setItem('dashboard_activeTab', activeTab);
  }, [activeTab]);
  
  // Calculate number of days and daily average profit
  const daysInRange = useMemo(() => calculateDaysBetween(dateFrom, dateTo), [dateFrom, dateTo]);
  
  const dailyAvgProfit = useMemo(() => {
    if (!pnlData?.summary?.net_profit || daysInRange === 0) return { total: 0, qc: 0, retail: 0 };
    return {
      total: pnlData.summary.net_profit / daysInRange,
      qc: (pnlData.vertical_bifurcation?.qc?.net_profit || 0) / daysInRange,
      retail: (pnlData.vertical_bifurcation?.retail?.net_profit || 0) / daysInRange
    };
  }, [pnlData, daysInRange]);

  // Function to export P&L to Excel
  const exportPnlToExcel = async () => {
    setExportingExcel(true);
    try {
      const response = await api.get(`/api/reports/pnl/export-excel?from_date=${dateFrom}&to_date=${dateTo}`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PnL_Report_${dateFrom}_to_${dateTo}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('P&L Report exported successfully!');
    } catch (error) {
      console.error('Error exporting P&L:', error);
      toast.error('Failed to export P&L report');
    } finally {
      setExportingExcel(false);
    }
  };
  
  // Function to populate Hindi product names
  const populateHindiNames = async () => {
    setPopulatingHindi(true);
    try {
      const response = await api.post('/api/admin/populate-hindi-names');
      if (response.data.success) {
        toast.success(`Hindi names updated for ${response.data.updated_count} products!`);
      } else {
        toast.error('Failed to update Hindi names');
      }
    } catch (error) {
      console.error('Error populating Hindi names:', error);
      toast.error('Error updating Hindi names: ' + (error.response?.data?.detail || error.message));
    } finally {
      setPopulatingHindi(false);
    }
  };
  
  // Function to populate Marathi product names
  const populateMarathiNames = async () => {
    setPopulatingMarathi(true);
    try {
      const response = await api.post('/api/admin/populate-marathi-names');
      if (response.data.success) {
        toast.success(`Marathi names updated for ${response.data.updated_count} products!`);
      } else {
        toast.error('Failed to update Marathi names');
      }
    } catch (error) {
      console.error('Error populating Marathi names:', error);
      toast.error('Error updating Marathi names: ' + (error.response?.data?.detail || error.message));
    } finally {
      setPopulatingMarathi(false);
    }
  };
  
  // Function to populate referral codes for retailers
  const populateReferralCodes = async () => {
    setPopulatingReferrals(true);
    try {
      const response = await api.post('/api/admin/populate-referral-codes');
      if (response.data.success) {
        toast.success(`Referral codes generated for ${response.data.updated_count} retailers!`);
      } else {
        toast.error('Failed to generate referral codes');
      }
    } catch (error) {
      console.error('Error populating referral codes:', error);
      toast.error('Error generating referral codes: ' + (error.response?.data?.detail || error.message));
    } finally {
      setPopulatingReferrals(false);
    }
  };

  // Run Daily COGS Backfill using background jobs with polling
  const runCogsBackfill = async () => {
    if (!window.confirm('This will recalculate Daily COGS data and dispatch quantities from April 2026 onwards. This may take a few minutes. Continue?')) {
      return;
    }
    
    setRunningCogsBackfill(true);
    setCogsBackfillProgress('Starting background jobs...');
    
    // Helper function to poll job status
    const pollJobStatus = async (jobId, jobName) => {
      let attempts = 0;
      const maxAttempts = 300; // 5 minutes max (1 second intervals)
      
      while (attempts < maxAttempts) {
        try {
          const response = await api.get(`/api/jobs/status/${jobId}`);
          const job = response.data;
          
          setCogsBackfillProgress(`${jobName}: ${job.progress_message} (${job.progress}%)`);
          
          if (job.status === 'completed') {
            return { success: true, result: job.result };
          } else if (job.status === 'failed') {
            return { success: false, error: job.error };
          }
          
          // Wait 1 second before polling again
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        } catch (error) {
          console.error('Poll error:', error);
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      return { success: false, error: 'Job timed out' };
    };
    
    try {
      // Step 1: Start recompute dispatches job
      setCogsBackfillProgress('Starting: Recomputing historical stock data...');
      
      let recomputeJobId;
      try {
        const recomputeResponse = await api.post('/api/jobs/recompute-dispatches?from_date=2026-04-01&to_date=2026-06-30');
        recomputeJobId = recomputeResponse.data.job_id;
        console.log('Recompute job started:', recomputeJobId);
      } catch (error) {
        console.error('Failed to start recompute job:', error);
        toast.error('Failed to start recompute job. Please try again.');
        setCogsBackfillProgress('Failed to start recompute job');
        return;
      }
      
      // Poll recompute job
      const recomputeResult = await pollJobStatus(recomputeJobId, 'Recomputing stock data');
      if (!recomputeResult.success) {
        toast.error(`Recompute failed: ${recomputeResult.error}`);
        setCogsBackfillProgress(`Failed: ${recomputeResult.error}`);
        return;
      }
      
      console.log('Recompute completed:', recomputeResult.result);
      
      // Small delay between jobs
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 2: Start COGS backfill job
      setCogsBackfillProgress('Starting: COGS backfill...');
      
      let cogsJobId;
      try {
        const cogsResponse = await api.post('/api/jobs/cogs-backfill?from_date=2026-03-18&to_date=2026-06-30');
        cogsJobId = cogsResponse.data.job_id;
        console.log('COGS backfill job started:', cogsJobId);
      } catch (error) {
        console.error('Failed to start COGS job:', error);
        toast.error('Failed to start COGS backfill job. Please try again.');
        setCogsBackfillProgress('Failed to start COGS job');
        return;
      }
      
      // Poll COGS job
      const cogsResult = await pollJobStatus(cogsJobId, 'COGS Backfill');
      if (!cogsResult.success) {
        toast.error(`COGS backfill failed: ${cogsResult.error}`);
        setCogsBackfillProgress(`Failed: ${cogsResult.error}`);
        return;
      }
      
      console.log('COGS backfill completed:', cogsResult.result);
      
      setCogsBackfillProgress('Complete!');
      toast.success(`Daily COGS data fixed! Processed ${cogsResult.result?.dates_processed || 'all'} dates.`);
      
      // Refresh the P&L data
      loadPnlData();
    } catch (error) {
      console.error('Error running COGS fix:', error);
      toast.error('Error during COGS fix: ' + (error.response?.data?.detail || error.message));
      setCogsBackfillProgress('Failed');
    } finally {
      setTimeout(() => {
        setRunningCogsBackfill(false);
        setCogsBackfillProgress('');
      }, 2000);
    }
  };
  
  // Fetch COGS Snapshot data
  const fetchCogsSnapshot = useCallback(async (date) => {
    setCogsLoading(true);
    try {
      const response = await api.get(`/api/cogs/snapshot?date=${date}`);
      setCogsSnapshot(response.data);
    } catch (error) {
      console.error('Error fetching COGS snapshot:', error);
      toast.error('Failed to load COGS data');
      setCogsSnapshot(null);
    } finally {
      setCogsLoading(false);
    }
  }, []);
  
  // Load COGS snapshot when date changes or tab becomes active
  useEffect(() => {
    if (activeTab === 'cogs' && cogsSnapshotDate) {
      fetchCogsSnapshot(cogsSnapshotDate);
    }
  }, [activeTab, cogsSnapshotDate, fetchCogsSnapshot]);
  
  // Filtered and sorted COGS products
  const filteredCogsProducts = useMemo(() => {
    if (!cogsSnapshot?.products) return [];
    
    let filtered = cogsSnapshot.products.filter(p => 
      p.product_name.toLowerCase().includes(cogsSearch.toLowerCase())
    );
    
    // Sort
    filtered.sort((a, b) => {
      let aVal = a[cogsSortField];
      let bVal = b[cogsSortField];
      
      // Handle null/undefined
      if (aVal == null) aVal = cogsSortAsc ? Infinity : -Infinity;
      if (bVal == null) bVal = cogsSortAsc ? Infinity : -Infinity;
      
      // String comparison for product_name
      if (cogsSortField === 'product_name' || cogsSortField === 'unit') {
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
        return cogsSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      
      // Numeric comparison
      return cogsSortAsc ? aVal - bVal : bVal - aVal;
    });
    
    return filtered;
  }, [cogsSnapshot, cogsSearch, cogsSortField, cogsSortAsc]);
  
  // Multi-level expansion states
  const [expandedDates, setExpandedDates] = useState({});        // Date → QC/Retail
  const [expandedVerticals, setExpandedVerticals] = useState({}); // Date_Vertical → Customers
  const [expandedCustomers, setExpandedCustomers] = useState({}); // Date_Vertical_Customer → Items

  const toggleDateExpand = (date) => {
    setExpandedDates(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };
  
  const toggleVerticalExpand = (key) => {
    setExpandedVerticals(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  
  const toggleCustomerExpand = (key) => {
    setExpandedCustomers(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Customer detail modal state - persist date filters
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetailDateFrom, setCustomerDetailDateFrom] = useState(() => {
    const saved = localStorage.getItem('dashboard_customerDateFrom');
    if (saved) return saved;
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customerDetailDateTo, setCustomerDetailDateTo] = useState(() => {
    const saved = localStorage.getItem('dashboard_customerDateTo');
    if (saved) return saved;
    return new Date().toISOString().split('T')[0];
  });
  const [customerDetailData, setCustomerDetailData] = useState(null);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [expandedCustomerDates, setExpandedCustomerDates] = useState({}); // For product dropdown
  
  // Persist customer date filters
  useEffect(() => {
    localStorage.setItem('dashboard_customerDateFrom', customerDetailDateFrom);
  }, [customerDetailDateFrom]);
  
  useEffect(() => {
    localStorage.setItem('dashboard_customerDateTo', customerDetailDateTo);
  }, [customerDetailDateTo]);

  // Product P&L separate date state - persist in localStorage
  const [productDateFrom, setProductDateFrom] = useState(() => {
    const saved = localStorage.getItem('dashboard_productDateFrom');
    if (saved) return saved;
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [productDateTo, setProductDateTo] = useState(() => {
    const saved = localStorage.getItem('dashboard_productDateTo');
    if (saved) return saved;
    return new Date().toISOString().split('T')[0];
  });
  const [productPnlData, setProductPnlData] = useState([]);
  const [loadingProductPnl, setLoadingProductPnl] = useState(false);
  const [productVertical, setProductVertical] = useState('all'); // 'all', 'qc', 'retail'
  const [productPnlRawData, setProductPnlRawData] = useState([]); // Store raw line items for filtering
  
  // Persist product date filters
  useEffect(() => {
    localStorage.setItem('dashboard_productDateFrom', productDateFrom);
  }, [productDateFrom]);
  
  useEffect(() => {
    localStorage.setItem('dashboard_productDateTo', productDateTo);
  }, [productDateTo]);

  // Product detail modal state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDetailData, setProductDetailData] = useState([]);
  const [loadingProductDetail, setLoadingProductDetail] = useState(false);

  // Toggle customer date expand
  const toggleCustomerDateExpand = (date) => {
    setExpandedCustomerDates(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };

  // Load customer detail data
  const loadCustomerDetail = useCallback(async (customerName) => {
    if (!customerName) return;
    setLoadingCustomerDetail(true);
    setExpandedCustomerDates({}); // Reset expanded states
    try {
      const response = await api.get(`/api/reports/pnl?from_date=${customerDetailDateFrom}&to_date=${customerDetailDateTo}`);
      const dailyPnl = response.data?.daily_pnl || [];
      const customerPnlList = response.data?.customer_pnl || [];
      // Get rejection_by_date_retailer from the RESPONSE, not from stale pnlData state
      const rejectionByDateRetailer = response.data?.rejection_by_date_retailer || {};
      
      // Find this customer's data from the customer_pnl list to get all financial details
      const customerPnlEntry = customerPnlList.find(c => 
        c.customer?.toLowerCase() === customerName.toLowerCase()
      );
      const customerType = customerPnlEntry?.type || 'QC';
      const grnLossShare = customerPnlEntry?.grn_loss_share || 0;
      const rejectionShare = customerPnlEntry?.rejection_share || 0;
      const retailerId = customerPnlEntry?.retailer_id || '';
      
      // Fetch rejection data by date for this retailer (if Retail type)
      let rejectionByDate = {};
      if (customerType === 'Retail' && retailerId) {
        try {
          const rejResponse = await api.get(`/api/retailer-rejections?from_date=${customerDetailDateFrom}&to_date=${customerDetailDateTo}`);
          const rejections = rejResponse.data || [];
          rejections.forEach(rej => {
            if (rej.retailer_id === retailerId) {
              const rejDate = (rej.rejection_date || '').slice(0, 10);
              if (rejDate) {
                // Store rejection at MRP - will be converted to COGS later when we have day's sales/purchase
                rejectionByDate[rejDate] = (rejectionByDate[rejDate] || 0) + (rej.rejection_value || 0);
              }
            }
          });
        } catch (rejErr) {
          console.warn('Could not fetch rejection data:', rejErr);
        }
      }
      
      // NEW: Get variable expenses, fixed expenses, and commission from customer_pnl
      const variableExpenses = customerPnlEntry?.variable_expenses || 0;
      const fixedExpenses = customerPnlEntry?.fixed_expenses || 0;
      const commissionFromPnl = customerPnlEntry?.commission || 0;
      const customerNetProfit = customerPnlEntry?.net_profit || 0;
      const customerNetMargin = customerPnlEntry?.net_margin_pct || 0;
      
      // Get customer's total sales and purchase for COGS ratio calculation
      const customerSalesAmount = customerPnlEntry?.sales_amount || 0;
      const customerCogsAmount = customerPnlEntry?.cogs_share || 0;
      
      // Use rejection_cogs directly from the customer_pnl (already calculated at purchase price)
      const rejectionShareAtCOGS = Math.round(customerPnlEntry?.rejection_cogs || 0);
      
      // Filter daily data for the selected customer
      const customerDailyData = dailyPnl.map(day => {
        const customerItems = (day.line_items || []).filter(item => 
          item.customer?.toLowerCase() === customerName.toLowerCase()
        );
        
        if (customerItems.length === 0) return null;
        
        // Use correct field names: revenue, supplied_qty, supplied_kg
        const sales = customerItems.reduce((sum, item) => sum + (item.revenue || 0), 0);
        const qty = customerItems.reduce((sum, item) => sum + (item.supplied_qty || 0), 0);
        const kg = customerItems.reduce((sum, item) => sum + (item.supplied_kg || 0), 0);
        const purchase = customerItems.reduce((sum, item) => sum + (item.cogs || 0), 0);
        const wastage = customerItems.reduce((sum, item) => sum + (item.wastage_value || 0), 0);
        const commission = customerItems.reduce((sum, item) => sum + (item.commission || 0), 0);
        
        // Get EXACT rejection at both MRP and COGS for this date from rejection_by_date_retailer
        const rejKey = `${day.date}_${retailerId}`;
        const dayRejectionData = rejectionByDateRetailer[rejKey] || { value: 0, cogs: 0 };
        const dayRejectionMRP = Math.round(dayRejectionData.value || 0);   // Rejection at MRP
        const dayRejectionCOGS = Math.round(dayRejectionData.cogs || 0);   // Rejection at purchase price
        
        // FIXED: Gross P/L should only account for COGS on actually-sold goods
        // Net Sales = Gross dispatched MRP - Rejection at MRP (what was actually sold)
        const netSales = Math.max(0, sales - dayRejectionMRP);
        // Net COGS = Dispatch COGS - Rejection COGS (cost of only the sold portion)
        const netCogs = Math.max(0, purchase - dayRejectionCOGS);
        // Gross P/L = what was sold minus cost of what was sold minus wastage
        const grossProfit = Math.round(netSales - netCogs - wastage);
        const grossMargin = netSales > 0 ? (grossProfit / netSales * 100) : 0;
        
        // Rejection % relative to original dispatched sales
        const dayRejectionPct = sales > 0 ? (dayRejectionCOGS / sales * 100) : 0;
        
        // Net P/L = Gross P/L - Commission
        const netProfit = Math.round(grossProfit - commission);
        const netMargin = netSales > 0 ? (netProfit / netSales * 100) : 0;
        
        const profitPerUnit = qty > 0 ? (grossProfit / qty) : 0;
        
        return {
          date: day.date,
          sales: Math.round(sales),
          netSales: Math.round(netSales),  // Sales minus rejection at MRP
          qty,
          kg,
          purchase: Math.round(purchase),
          netCogs: Math.round(netCogs),  // COGS minus rejection at COGS
          wastage: Math.round(wastage),
          rejection: dayRejectionCOGS,  // Rejection at COGS for display
          rejectionMRP: dayRejectionMRP,  // Rejection at MRP for reference
          rejectionPct: dayRejectionPct,  // Rejection % for this date
          grossProfit,
          grossMargin,
          commission: Math.round(commission),
          netProfit,
          netMargin,
          profitPerUnit,
          items: customerItems // Product-wise breakdown
        };
      }).filter(Boolean);
      
      // Calculate totals
      const totals = customerDailyData.reduce((acc, day) => ({
        sales: acc.sales + day.sales,
        qty: acc.qty + day.qty,
        kg: acc.kg + day.kg,
        purchase: acc.purchase + day.purchase,
        wastage: acc.wastage + day.wastage,
        rejection: acc.rejection + day.rejection,
        grossProfit: acc.grossProfit + day.grossProfit,
        commission: acc.commission + day.commission,
        netProfit: acc.netProfit + day.netProfit
      }), { sales: 0, qty: 0, kg: 0, purchase: 0, wastage: 0, rejection: 0, grossProfit: 0, commission: 0, netProfit: 0 });
      
      // Rejection is now already factored into each day's grossProfit calculation
      // (netSales - netCogs - wastage), so no separate adjustment needed
      const adjustedGrossProfit = totals.grossProfit;
      
      totals.grossMargin = totals.sales > 0 ? (adjustedGrossProfit / totals.sales * 100) : 0;
      totals.profitPerUnit = totals.qty > 0 ? (adjustedGrossProfit / totals.qty) : 0;
      totals.customerType = customerType;
      totals.grnLossShare = grnLossShare;
      totals.rejectionShare = rejectionShareAtCOGS;  // Store COGS-based rejection for display
      // Add variable expenses and commission from customer_pnl
      totals.variableExpenses = variableExpenses;
      totals.commissionFromPnl = commissionFromPnl;
      
      // Use backend values directly for gross and net profit
      // Backend formula: gross = sales - cogs_share, net = gross - grn_loss - rejection - commission - variable_expenses
      // Wastage is display-only at customer level, not subtracted
      totals.grossProfit = Math.round(customerPnlEntry?.gross_profit || 0);
      totals.netProfit = Math.round(customerPnlEntry?.net_profit || 0);
      totals.netMarginPct = totals.sales > 0 ? Math.round((totals.netProfit / totals.sales * 100) * 10) / 10 : 0;
      
      // Calculate period days for Daily Avg (use total calendar days, not active days)
      // This ensures customer Daily Avgs sum up to match dashboard Daily Avg
      const periodDays = calculateDaysBetween(customerDetailDateFrom, customerDetailDateTo);
      
      setCustomerDetailData({
        daily: customerDailyData.sort((a, b) => new Date(b.date) - new Date(a.date)), // Sort latest date first
        totals,
        daysCount: customerDailyData.length,  // Active days for display
        periodDays: periodDays  // Total period days for Daily Avg calculation
      });
    } catch (error) {
      console.error('Failed to load customer detail:', error);
      toast.error('Failed to load customer details');
    } finally {
      setLoadingCustomerDetail(false);
    }
  }, [customerDetailDateFrom, customerDetailDateTo]);

  // Open customer detail modal
  const openCustomerDetail = (customerName) => {
    setSelectedCustomer(customerName);
    setCustomerDetailDateFrom(dateFrom);
    setCustomerDetailDateTo(dateTo);
    loadCustomerDetail(customerName);
  };

  // Reload customer detail when dates change
  useEffect(() => {
    if (selectedCustomer) {
      loadCustomerDetail(selectedCustomer);
    }
  }, [selectedCustomer, loadCustomerDetail]);

  // Load product P&L data (separate from main dashboard)
  const loadProductPnlData = useCallback(async () => {
    setLoadingProductPnl(true);
    try {
      const [pnlResponse, productsResponse, rejectionsResponse] = await Promise.all([
        api.get(`/api/reports/pnl?from_date=${productDateFrom}&to_date=${productDateTo}`),
        api.get('/api/products?include_images=false'),
        api.get(`/api/retailer-rejections?start_date=${productDateFrom}&end_date=${productDateTo}`)
      ]);
      
      const dailyPnl = pnlResponse.data?.daily_pnl || [];
      const rejections = rejectionsResponse.data || [];
      
      // Build rejection map by product name - store both qty and value at MRP
      const rejectionByProduct = {};
      rejections.forEach(rej => {
        const prodName = rej.product_name;
        if (!rejectionByProduct[prodName]) {
          rejectionByProduct[prodName] = { qty: 0, value_at_mrp: 0 };
        }
        rejectionByProduct[prodName].qty += rej.quantity || 0;
        rejectionByProduct[prodName].value_at_mrp += rej.rejection_value || 0;  // qty × MRP
      });
      
      // Build a map of product aliases: {product_name: alias_product_name}
      const productList = productsResponse.data || [];
      const productIdToName = {};
      productList.forEach(p => { productIdToName[p.id] = p.name; });
      
      const aliasMap = {}; // {aliased_product: [products_that_alias_to_it]}
      productList.forEach(p => {
        if (p.cost_alias_product_id && productIdToName[p.cost_alias_product_id]) {
          const aliasName = productIdToName[p.cost_alias_product_id];
          if (!aliasMap[aliasName]) aliasMap[aliasName] = [];
          aliasMap[aliasName].push(p.name);
        }
      });
      
      // First pass: Calculate average purchase price AND selling price per product from line items
      const productPriceData = {};
      dailyPnl.forEach(day => {
        const lineItems = day.line_items || [];
        lineItems.forEach(item => {
          // Only consider Retail items for price calculation
          if (item.customer_type !== 'Retail') return;
          
          let productName = item.product;
          // Check if this product is aliased to another
          for (const [aliasTarget, aliases] of Object.entries(aliasMap)) {
            if (aliases.includes(productName)) {
              productName = aliasTarget;
              break;
            }
          }
          
          if (!productPriceData[productName]) {
            productPriceData[productName] = { totalCogs: 0, totalSales: 0, totalKg: 0 };
          }
          productPriceData[productName].totalCogs += item.cogs || 0;
          productPriceData[productName].totalSales += item.revenue || 0;
          productPriceData[productName].totalKg += item.supplied_kg || 0;
        });
      });
      
      // Calculate average purchase and selling prices per Kg for each product
      const avgPricesByProduct = {};
      for (const [prodName, data] of Object.entries(productPriceData)) {
        avgPricesByProduct[prodName] = {
          avgPurchasePrice: data.totalKg > 0 ? data.totalCogs / data.totalKg : 0,
          avgSellingPrice: data.totalKg > 0 ? data.totalSales / data.totalKg : 0
        };
      }
      
      // Now calculate rejection value at purchase price using the ratio
      for (const [prodName, rejData] of Object.entries(rejectionByProduct)) {
        const prices = avgPricesByProduct[prodName] || { avgPurchasePrice: 0, avgSellingPrice: 0 };
        // Convert MRP-based rejection to purchase price basis
        // rejection_at_purchase = rejection_at_mrp × (purchase_price / selling_price)
        if (prices.avgSellingPrice > 0) {
          rejData.value = rejData.value_at_mrp * (prices.avgPurchasePrice / prices.avgSellingPrice);
        } else {
          rejData.value = rejData.value_at_mrp;  // Fallback to MRP if no selling price
        }
      }
      
      // Collect all line items with customer_type for vertical filtering
      const allLineItems = [];
      dailyPnl.forEach(day => {
        const lineItems = day.line_items || [];
        lineItems.forEach(item => {
          let productName = item.product;
          // Check if this product is aliased to another
          for (const [aliasTarget, aliases] of Object.entries(aliasMap)) {
            if (aliases.includes(productName)) {
              productName = aliasTarget;
              break;
            }
          }
          allLineItems.push({
            ...item,
            product: productName, // Use aliased name
            customer_type: item.customer_type || 'Unknown',
            commission: item.commission || 0  // Commission from line item
          });
        });
      });
      
      // Store raw data and rejection data for filtering
      setProductPnlRawData({ lineItems: allLineItems, rejectionByProduct, avgPricesByProduct });
      
    } catch (error) {
      console.error('Failed to load product P&L:', error);
      toast.error('Failed to load product P&L data');
    } finally {
      setLoadingProductPnl(false);
    }
  }, [productDateFrom, productDateTo]);

  // Process product P&L data based on selected vertical
  useEffect(() => {
    if (!productPnlRawData || !productPnlRawData.lineItems || productPnlRawData.lineItems.length === 0) {
      setProductPnlData([]);
      return;
    }
    
    const { lineItems, rejectionByProduct } = productPnlRawData;
    
    // Filter line items by vertical
    let filteredItems = lineItems;
    if (productVertical === 'qc') {
      filteredItems = lineItems.filter(item => item.customer_type === 'QC');
    } else if (productVertical === 'retail') {
      filteredItems = lineItems.filter(item => item.customer_type === 'Retail');
    }
    
    // Aggregate product data
    const productAggregates = {};
    
    filteredItems.forEach(item => {
      const productName = item.product;
      
      if (!productAggregates[productName]) {
        productAggregates[productName] = {
          product: productName,
          sales_amount: 0,
          sales_qty: 0,
          purchase_amount: 0,  // COGS (actual consumed cost)
          purchase_qty: 0,     // Supplied Kg
          wastage_amount: 0,
          commission_amount: 0,  // Commission (from line items or calculated)
        };
      }
      
      const agg = productAggregates[productName];
      agg.sales_amount += item.revenue || 0;
      agg.sales_qty += item.supplied_qty || 0;
      agg.purchase_amount += item.cogs || 0;
      agg.purchase_qty += item.supplied_kg || 0;
      agg.wastage_amount += item.wastage_value || 0;
      agg.commission_amount += item.commission || 0;  // Add commission from line item
    });
    
    // Calculate profit, margin, and profit_per_unit for each product
    const productsWithProfit = Object.values(productAggregates).map(p => {
      // Get rejection data for this product (only for Retail vertical)
      let rejection_amount = 0;
      let rejection_qty = 0;
      let rejection_pct = 0;
      
      if (productVertical === 'retail' && rejectionByProduct && rejectionByProduct[p.product]) {
        rejection_amount = rejectionByProduct[p.product].value || 0;
        rejection_qty = rejectionByProduct[p.product].qty || 0;
        // Rejection % = Rejection Amount / Sales Amount * 100
        rejection_pct = p.sales_amount > 0 ? (rejection_amount / p.sales_amount) * 100 : 0;
      }
      
      // For Retail: use 20% fixed commission if commission_amount is 0
      // Commission is calculated as 20% of Sales
      let commission_amount = p.commission_amount;
      let commission_pct = 20; // Fixed 20%
      if (productVertical === 'retail') {
        // Always calculate commission as 20% of sales for Retail
        commission_amount = p.sales_amount * 0.20;
      }
      
      // Gross P/L calculation depends on vertical:
      // QC/All: Sales - COGS - Wastage
      // Retail: Sales - COGS - Wastage - Rejection - Commission
      let profit;
      if (productVertical === 'retail') {
        profit = p.sales_amount - p.purchase_amount - p.wastage_amount - rejection_amount - commission_amount;
      } else {
        profit = p.sales_amount - p.purchase_amount - p.wastage_amount;
      }
      
      const margin = p.sales_amount > 0 ? (profit / p.sales_amount) * 100 : 0;
      const profit_per_unit = p.sales_qty > 0 ? profit / p.sales_qty : 0;
      
      return {
        ...p,
        rejection_amount,
        rejection_qty,
        rejection_pct,
        commission_amount,
        commission_pct,
        profit,
        margin,
        profit_per_unit
      };
    });
    
    // Sort by Sales descending (changed from Gross P/L)
    const sortedProducts = productsWithProfit.sort((a, b) => (b.sales_amount || 0) - (a.sales_amount || 0));
    setProductPnlData(sortedProducts);
  }, [productPnlRawData, productVertical]);

  // Load product P&L when tab is products and dates change
  useEffect(() => {
    if (activeTab === 'products') {
      loadProductPnlData();
    }
  }, [activeTab, loadProductPnlData]);

  // Load product detail (date-wise breakdown) - now accepts vertical parameter
  const loadProductDetail = useCallback(async (productName, vertical = 'all') => {
    if (!productName) return;
    setSelectedProduct(productName);
    setLoadingProductDetail(true);
    
    try {
      const [pnlResponse, productsResponse, rejectionsResponse] = await Promise.all([
        api.get(`/api/reports/pnl?from_date=${productDateFrom}&to_date=${productDateTo}`),
        api.get('/api/products?include_images=false'),
        api.get(`/api/retailer-rejections?start_date=${productDateFrom}&end_date=${productDateTo}`)
      ]);
      const dailyPnl = pnlResponse.data?.daily_pnl || [];
      const rejections = rejectionsResponse.data || [];
      
      // Build rejection map by product name and date
      // Store qty, value (at MRP), and MRP to convert to purchase price later
      const rejectionByProductDate = {};
      rejections.forEach(rej => {
        const prodName = rej.product_name;
        const rejDate = (rej.rejection_date || '').substring(0, 10);
        const key = `${prodName}_${rejDate}`;
        if (!rejectionByProductDate[key]) {
          rejectionByProductDate[key] = { qty: 0, value_at_mrp: 0 };
        }
        rejectionByProductDate[key].qty += rej.quantity || 0;
        rejectionByProductDate[key].value_at_mrp += rej.rejection_value || 0;  // This is qty × MRP
      });
      
      // Build alias map to find products that alias to this one
      const productList = productsResponse.data || [];
      const productIdToName = {};
      productList.forEach(p => { productIdToName[p.id] = p.name; });
      
      // Find products that alias to the selected product
      const aliasedProducts = [productName];
      productList.forEach(p => {
        if (p.cost_alias_product_id && productIdToName[p.cost_alias_product_id] === productName) {
          aliasedProducts.push(p.name);
        }
      });
      
      // Extract date-wise data for this product and its aliases
      const productDailyData = [];
      
      dailyPnl.forEach(day => {
        const lineItems = day.line_items || [];
        const unsoldWastage = day.unsold_wastage || [];
        
        // Filter line items for this product AND any aliased products
        let productLineItems = lineItems.filter(item => aliasedProducts.includes(item.product));
        
        // Filter by vertical if specified
        if (vertical === 'qc') {
          productLineItems = productLineItems.filter(item => item.customer_type === 'QC');
        } else if (vertical === 'retail') {
          productLineItems = productLineItems.filter(item => item.customer_type === 'Retail');
        }
        
        // Also check for unsold wastage for this product (only for 'all' or 'qc' since wastage is primarily QC-related)
        const productUnsoldWastage = (vertical === 'retail') ? [] : unsoldWastage.filter(item => aliasedProducts.includes(item.product));
        
        // If no line items AND no unsold wastage, skip this day
        if (productLineItems.length === 0 && productUnsoldWastage.length === 0) return;
        
        // Aggregate data from line items (sales data)
        const salesAmt = productLineItems.reduce((sum, item) => sum + (item.revenue || 0), 0);
        const salesQty = productLineItems.reduce((sum, item) => sum + (item.supplied_qty || 0), 0);
        const salesKg = productLineItems.reduce((sum, item) => sum + (item.supplied_kg || 0), 0);
        const cogsAmt = productLineItems.reduce((sum, item) => sum + (item.cogs || 0), 0);
        let wastageAmt = productLineItems.reduce((sum, item) => sum + (item.wastage_value || 0), 0);
        
        // Add unsold wastage (products with wastage but no sales) - only for non-retail
        const unsoldWastageAmt = productUnsoldWastage.reduce((sum, item) => sum + (item.value || 0), 0);
        wastageAmt += unsoldWastageAmt;
        
        // Calculate average purchase price per Kg for this day
        const avgPurchasePrice = salesKg > 0 ? cogsAmt / salesKg : 0;
        const avgSellingPrice = salesKg > 0 ? salesAmt / salesKg : 0;
        
        // Get rejection data for this product on this date (for Retail)
        // Rejection is stored at MRP value, convert to purchase price basis
        let rejectionAmt = 0;
        let rejectionQty = 0;
        let rejectionValueAtMrp = 0;
        let rejectionPct = 0;
        if (vertical === 'retail') {
          // Check rejection for each aliased product on this date
          for (const alias of aliasedProducts) {
            const key = `${alias}_${day.date}`;
            if (rejectionByProductDate[key]) {
              rejectionQty += rejectionByProductDate[key].qty || 0;
              rejectionValueAtMrp += rejectionByProductDate[key].value_at_mrp || 0;
            }
          }
          // Convert rejection value from MRP basis to Purchase Price basis
          // rejection_at_purchase = rejection_at_mrp × (purchase_price / selling_price)
          if (avgSellingPrice > 0) {
            rejectionAmt = rejectionValueAtMrp * (avgPurchasePrice / avgSellingPrice);
          } else {
            rejectionAmt = rejectionValueAtMrp;  // Fallback to MRP value if no sales
          }
          rejectionPct = salesAmt > 0 ? (rejectionAmt / salesAmt) * 100 : 0;
        }
        
        // Calculate commission for Retail (fixed 20%)
        let commissionAmt = 0;
        const commissionPct = 20;
        if (vertical === 'retail') {
          commissionAmt = salesAmt * 0.20;
        }
        
        // Calculate Gross P/L: 
        // QC/All: Sales - COGS - Wastage
        // Retail: Sales - COGS - Wastage - Rejection - Commission
        let grossProfit;
        if (vertical === 'retail') {
          grossProfit = salesAmt - cogsAmt - wastageAmt - rejectionAmt - commissionAmt;
        } else {
          grossProfit = salesAmt - cogsAmt - wastageAmt;
        }
        const marginPct = salesAmt > 0 ? (grossProfit / salesAmt) * 100 : 0;
        
        // Calculate average prices (already calculated above)
        
        // Get wastage % from product_wastage_summary if available (matches Wastage Dashboard formula)
        // product_wastage_summary has pre-calculated wastage_pct = Wastage / (Opening + Purchase) * 100
        const productWastageSummary = day.product_wastage_summary || {};
        
        // Check for the product (try exact name and aliased products)
        let productWastageData = productWastageSummary[productName] || {};
        if (!productWastageData.wastage_pct && aliasedProducts.length > 1) {
          // Try to find any aliased product's wastage data
          for (const alias of aliasedProducts) {
            if (productWastageSummary[alias]?.wastage_pct) {
              productWastageData = productWastageSummary[alias];
              break;
            }
          }
        }
        
        // Use pre-calculated wastage_pct from backend, or calculate as fallback
        let wastagePct = productWastageData.wastage_pct || 0;
        if (wastagePct === 0 && wastageAmt > 0) {
          // Fallback: calculate from line item data using correct formula: Wastage / (Opening + Purchase)
          const wastageKg = productLineItems.reduce((sum, item) => sum + (item.wastage_kg || 0), 0);
          const unsoldWastageKg = productUnsoldWastage.reduce((sum, item) => sum + (item.qty || 0), 0);
          const totalWastageKg = wastageKg + unsoldWastageKg;
          // Use total_input from backend if available, otherwise estimate
          const totalInput = productWastageData.total_input || (salesKg + totalWastageKg);
          wastagePct = totalInput > 0 ? (totalWastageKg / totalInput) * 100 : 0;
        }
        
        productDailyData.push({
          date: day.date,
          sales_amount: salesAmt,
          sales_qty: salesQty,
          sales_kg: salesKg,
          purchase_amount: cogsAmt,  // COGS
          purchase_qty: salesKg,      // Supplied Kg
          wastage_amount: wastageAmt,
          rejection_amount: rejectionAmt,
          rejection_qty: rejectionQty,
          rejection_pct: rejectionPct,
          commission_amount: commissionAmt,
          commission_pct: commissionPct,
          gross_profit: grossProfit,
          margin: marginPct.toFixed(1),
          wastage_pct: wastagePct.toFixed(1),
          avg_purchase_price: avgPurchasePrice.toFixed(2),
          avg_selling_price: salesKg > 0 ? (salesAmt / salesKg).toFixed(2) : 0,
          is_wastage_only: productLineItems.length === 0 && productUnsoldWastage.length > 0  // Flag for wastage-only days
        });
      });
      
      // Sort by date descending (most recent first)
      productDailyData.sort((a, b) => b.date.localeCompare(a.date));
      
      setProductDetailData(productDailyData);
    } catch (error) {
      console.error('Failed to load product detail:', error);
      toast.error('Failed to load product details');
    } finally {
      setLoadingProductDetail(false);
    }
  }, [productDateFrom, productDateTo]);

  const loadPnlData = useCallback(async () => {
    setLoading(true);
    try {
      const [pnlResponse, summaryResponse, qcGrnsResponse, retailInvoicesResponse] = await Promise.all([
        api.get(`/api/reports/pnl?from_date=${dateFrom}&to_date=${dateTo}`),
        api.get('/api/reports/today-summary'),
        api.get(`/api/qc-grns?from_date=${dateFrom}&to_date=${dateTo}&limit=100`),
        api.get(`/api/retailer-invoices?start_date=${dateFrom}&end_date=${dateTo}&limit=100`)
      ]);
      setPnlData(pnlResponse.data);
      setTodaySummary(summaryResponse.data);
      
      // Use rejection_by_date_retailer from the P&L API (already calculated at COGS)
      // Structure: { "2024-01-15_retailer123": { value: mrp_value, cogs: cogs_value, qty: quantity } }
      const rejectionMapFromApi = pnlResponse.data?.rejection_by_date_retailer || {};
      setRejectionByDateRetailer(rejectionMapFromApi);
      
      // Calculate QC receivables from GRN data (filter by date range)
      let qcTotal = 0, qcReceived = 0;
      (qcGrnsResponse.data || []).forEach(grn => {
        (grn.items || []).forEach(item => {
          const itemDate = (item.dispatch_date || item.date || '')?.split('T')[0];
          if (itemDate >= dateFrom && itemDate <= dateTo) {
            const amount = item.amount || 0;
            qcTotal += amount;
            if (item.payment_received) {
              qcReceived += amount;
            }
          }
        });
      });
      setQcReceivables({ total: qcTotal, received: qcReceived, pending: qcTotal - qcReceived });
      
      // Calculate Retail receivables from Invoice data (already filtered by API)
      let retailTotal = 0, retailReceived = 0;
      (retailInvoicesResponse.data || []).forEach(inv => {
        const invTotal = inv.net_payable || inv.total_amount || 0;
        const invPaid = inv.paid_amount || 0;
        retailTotal += invTotal;
        retailReceived += invPaid;
      });
      setRetailReceivables({ total: retailTotal, received: retailReceived, pending: retailTotal - retailReceived });
      
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadPnlData();
  }, [loadPnlData]);

  const formatCurrency = (amount) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount?.toFixed(0) || 0}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  // Extract data from pnlData (moved before conditional return to satisfy React hooks rules)
  const summary = pnlData?.summary || {};
  const dailyPnlRaw = pnlData?.daily_pnl || [];
  // Sort by date descending (latest date on top)
  const dailyPnl = useMemo(() => [...dailyPnlRaw].sort((a, b) => new Date(b.date) - new Date(a.date)), [dailyPnlRaw]);
  const customerPnl = pnlData?.customer_pnl || [];
  const productPnl = pnlData?.product_pnl || [];
  const expenses = pnlData?.expenses || {};
  const purchaseByFarmer = pnlData?.purchase_by_farmer || [];

  // Create customer name to retailer_id mapping from customerPnl
  const customerToRetailerId = useMemo(() => {
    const mapping = {};
    customerPnl.forEach(c => {
      if (c.customer && c.retailer_id) {
        mapping[c.customer] = c.retailer_id;
      }
    });
    return mapping;
  }, [customerPnl]);

  // Aggregate customer data by vertical (QC vs Retail) - Must be before conditional return
  const verticalData = useMemo(() => {
    const qcCustomers = customerPnl.filter(c => c.type === 'QC');
    const retailCustomers = customerPnl.filter(c => c.type === 'Retail');
    
    const aggregateCustomers = (customers) => {
      const sales_amount = customers.reduce((sum, c) => sum + (c.sales_amount || 0), 0);
      const sales_qty = customers.reduce((sum, c) => sum + (c.sales_qty || 0), 0);
      const cogs = customers.reduce((sum, c) => sum + (c.cogs_share || 0), 0);
      const wastage = customers.reduce((sum, c) => sum + (c.wastage_share || 0), 0);
      const rejection = customers.reduce((sum, c) => sum + (c.rejection_share || 0), 0);
      const commission = customers.reduce((sum, c) => sum + (c.commission || 0), 0);
      const invoices = customers.reduce((sum, c) => sum + (c.invoices || 0), 0);
      // Sum unique sales days across all customers (for vertical-level avg calc)
      const total_sales_days = customers.reduce((sum, c) => sum + (c.sales_days || 0), 0);
      // Use max sales days as proxy for days with any sales in this vertical
      const max_sales_days = Math.max(...customers.map(c => c.sales_days || 0), 1);
      
      // CORRECT FORMULAS:
      // Gross P/L = Sales - COGS - Wastage - Rejection
      const gross_profit = sales_amount - cogs - wastage - rejection;
      // Net P/L = Gross P/L - Commission
      const net_profit = gross_profit - commission;
      // GM% = Gross P/L / Sales * 100
      const gross_margin_pct = sales_amount > 0 ? (gross_profit / sales_amount * 100) : 0;
      // NM% = Net P/L / Sales * 100
      const net_margin_pct = sales_amount > 0 ? (net_profit / sales_amount * 100) : 0;
      // Profit per unit = Gross P/L / Qty
      const profit_per_unit = sales_qty > 0 ? (gross_profit / sales_qty) : 0;
      // Rejection % = Rejection / Sales * 100
      const rejection_pct = sales_amount > 0 ? (rejection / sales_amount * 100) : 0;
      // Avg Gross Profit/Day = Gross P/L / max_sales_days
      const avg_profit_per_day = max_sales_days > 0 ? (gross_profit / max_sales_days) : 0;
      
      return {
        count: customers.length,
        sales_amount,
        sales_qty,
        cogs,
        wastage,
        rejection,
        rejection_pct,
        commission,
        gross_profit,
        gross_margin_pct,
        net_profit,
        net_margin_pct,
        profit_per_unit,
        avg_profit_per_day,
        max_sales_days,
        invoices,
        customers: customers.map(c => {
          // Calculate correct values for each customer
          const cust_cogs = c.cogs_share || 0;
          const cust_wastage = c.wastage_share || 0;
          const cust_rejection = c.rejection_share || 0;
          const cust_commission = c.commission || 0;
          const cust_sales = c.sales_amount || 0;
          const cust_qty = c.sales_qty || 0;
          const cust_sales_days = c.sales_days || 1;
          
          // Use backend values directly for gross and net profit
          // Backend formula: gross = sales - cogs_share, net = gross - grn_loss - rejection - commission - variable_expenses
          // Wastage is display-only at customer level, not subtracted
          const cust_gross_profit = c.gross_profit || 0;
          const cust_net_profit = c.net_profit || 0;
          
          return {
            ...c,
            cogs: cust_cogs,
            wastage: cust_wastage,
            rejection: cust_rejection,
            rejection_pct: cust_sales > 0 ? (cust_rejection / cust_sales * 100) : 0,
            gross_profit: cust_gross_profit,
            gross_margin_pct: cust_sales > 0 ? (cust_gross_profit / cust_sales * 100) : 0,
            net_profit: cust_net_profit,
            net_margin_pct: cust_sales > 0 ? (cust_net_profit / cust_sales * 100) : 0,
            profit_per_unit: cust_qty > 0 ? (cust_gross_profit / cust_qty) : 0,
            sales_days: cust_sales_days,
            avg_sales_per_day: cust_sales / cust_sales_days
          };
        }).sort((a, b) => (b.sales_amount || 0) - (a.sales_amount || 0))
      };
    };
    
    return {
      qc: aggregateCustomers(qcCustomers),
      retail: aggregateCustomers(retailCustomers)
    };
  }, [customerPnl]);

  // Get comparison data for selected retailers - Must be before conditional return
  const comparisonData = useMemo(() => {
    if (selectedRetailers.length === 0) return [];
    return customerPnl
      .filter(c => selectedRetailers.includes(c.customer))
      .sort((a, b) => (b.sales_amount || 0) - (a.sales_amount || 0));
  }, [customerPnl, selectedRetailers]);

  // Toggle retailer selection for comparison
  const toggleRetailerSelection = (customerName) => {
    setSelectedRetailers(prev => 
      prev.includes(customerName)
        ? prev.filter(c => c !== customerName)
        : [...prev, customerName]
    );
  };

  if (loading) {
    return (
      <Layout title={t('app.dashboard')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
        </div>
      </Layout>
    );
  }

  // Prepare pie chart data for expenses
  const variableExpenseData = Object.entries(expenses.variable_by_category || {}).map(([name, value]) => ({
    name, value
  }));
  const fixedExpenseData = Object.entries(expenses.fixed_by_category || {}).map(([name, value]) => ({
    name, value
  }));

  // Company Status Component for Layout header
  const companyStatusComponent = pnlData ? (
    <div className="flex items-center gap-3">
      <div className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg">
        <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Company Status</span>
      </div>
      <div className={`px-5 py-2 rounded-lg border-2 ${
        (summary.net_profit || 0) >= 0 
          ? 'bg-green-100 border-green-500' 
          : 'bg-red-100 border-red-500'
      }`}>
        <div className="flex flex-col items-center">
          <span className={`text-xl font-bold ${
            (summary.net_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'
          }`}>
            {(summary.net_profit || 0) < 0 ? '-' : '+'}₹{Math.abs(summary.net_profit || 0).toLocaleString()}
          </span>
          <span className={`text-xs font-medium ${
            (summary.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {(summary.net_profit || 0) >= 0 ? '✓ Profitable' : '⚠ Cash Burn'}
          </span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <Layout title={t('app.dashboard')} statusComponent={companyStatusComponent}>
      <div data-testid="pnl-dashboard">
        {/* Header with Date Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Profit & Loss Dashboard</h1>
            <p className="text-sm text-gray-500">
              {formatDate(dateFrom)} - {formatDate(dateTo)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
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
            <Button variant="outline" size="sm" onClick={loadPnlData}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={exportPnlToExcel}
              disabled={exportingExcel || !pnlData}
              className="bg-green-600 hover:bg-green-700 text-white"
              title="Export detailed P&L report to Excel for audit"
              data-testid="export-pnl-excel"
            >
              <FileSpreadsheet size={14} className="mr-1" />
              {exportingExcel ? 'Exporting...' : 'Export Excel'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={populateHindiNames}
              disabled={populatingHindi}
              className="border-purple-300 text-purple-600 hover:bg-purple-50"
              title="Update Hindi product names in database"
            >
              <Languages size={14} className="mr-1" />
              {populatingHindi ? 'Updating...' : 'Setup Hindi'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={populateMarathiNames}
              disabled={populatingMarathi}
              className="border-orange-300 text-orange-600 hover:bg-orange-50"
              title="Update Marathi product names in database"
            >
              <Languages size={14} className="mr-1" />
              {populatingMarathi ? 'Updating...' : 'Setup Marathi'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={populateReferralCodes}
              disabled={populatingReferrals}
              className="border-blue-300 text-blue-600 hover:bg-blue-50"
              title="Generate referral codes for retailers without one"
            >
              <Users size={14} className="mr-1" />
              {populatingReferrals ? 'Generating...' : 'Setup Referrals'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runCogsBackfill}
              disabled={runningCogsBackfill}
              className="border-red-300 text-red-600 hover:bg-red-50"
              title="Recalculate Daily COGS data to fix wastage calculations"
              data-testid="run-cogs-backfill"
            >
              <Database size={14} className="mr-1" />
              {runningCogsBackfill ? cogsBackfillProgress : 'Fix COGS Data'}
            </Button>
          </div>
        </div>

        {/* Key P&L Summary Cards - Row 1 (4 cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {/* Sales */}
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-600 rounded-lg">
                  <ShoppingCart className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-green-800 font-medium uppercase">Total Sales</p>
                  <p className="text-lg font-bold text-green-900">{formatCurrency(summary.total_sales - (summary.total_retail_rejection || 0))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchase */}
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-600 rounded-lg">
                  <Package className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-orange-800 font-medium uppercase">COGS</p>
                  <p className="text-lg font-bold text-orange-900">{formatCurrency(summary.total_cogs || summary.total_purchase)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wastage */}
          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-600 rounded-lg">
                  <Trash2 className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-red-800 font-medium uppercase">Wastage Loss</p>
                  <p className="text-lg font-bold text-red-900">{formatCurrency(summary.total_wastage_value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gross Profit */}
          <Card className={`bg-gradient-to-br ${summary.gross_profit >= 0 ? 'from-emerald-50 to-emerald-100 border-emerald-200' : 'from-red-50 to-red-100 border-red-200'}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 ${summary.gross_profit >= 0 ? 'bg-emerald-600' : 'bg-red-600'} rounded-lg`}>
                  {summary.gross_profit >= 0 ? <TrendingUp className="text-white" size={16} /> : <TrendingDown className="text-white" size={16} />}
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase" style={{ color: summary.gross_profit >= 0 ? '#065F46' : '#991B1B' }}>Gross Profit</p>
                  <p className="text-lg font-bold" style={{ color: summary.gross_profit >= 0 ? '#064E3B' : '#7F1D1D' }}>
                    {formatCurrency(summary.gross_profit)}
                  </p>
                  <p className="text-[10px]" style={{ color: summary.gross_profit >= 0 ? '#047857' : '#DC2626' }}>
                    {summary.gross_margin}% margin
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Key P&L Summary Cards - Row 2 (4 cards) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Variable Expenses */}
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Receipt className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-purple-800 font-medium uppercase">Variable Exp</p>
                  <p className="text-lg font-bold text-purple-900">{formatCurrency(summary.total_variable_expenses)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fixed Expenses */}
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-600 rounded-lg">
                  <Building2 className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-orange-800 font-medium uppercase">Fixed Exp</p>
                  <p className="text-lg font-bold text-orange-900">{formatCurrency(summary.total_fixed_expenses)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net Profit */}
          <Card className={`bg-gradient-to-br ${summary.net_profit >= 0 ? 'from-blue-50 to-blue-100 border-blue-200' : 'from-red-50 to-red-100 border-red-200'}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 ${summary.net_profit >= 0 ? 'bg-blue-600' : 'bg-red-600'} rounded-lg`}>
                  <DollarSign className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase" style={{ color: summary.net_profit >= 0 ? '#1E40AF' : '#991B1B' }}>Net Profit</p>
                  <p className="text-lg font-bold" style={{ color: summary.net_profit >= 0 ? '#1E3A8A' : '#7F1D1D' }}>
                    {formatCurrency(summary.net_profit)}
                  </p>
                  <p className="text-[10px]" style={{ color: summary.net_profit >= 0 ? '#2563EB' : '#DC2626' }}>
                    {summary.net_margin}% margin
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Avg Profit */}
          <Card className={`bg-gradient-to-br ${dailyAvgProfit.total >= 0 ? 'from-indigo-50 to-indigo-100 border-indigo-200' : 'from-red-50 to-red-100 border-red-200'}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 ${dailyAvgProfit.total >= 0 ? 'bg-indigo-600' : 'bg-red-600'} rounded-lg`}>
                  <Calculator className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase" style={{ color: dailyAvgProfit.total >= 0 ? '#3730A3' : '#991B1B' }}>Daily Avg Profit</p>
                  <p className="text-lg font-bold" style={{ color: dailyAvgProfit.total >= 0 ? '#312E81' : '#7F1D1D' }}>
                    {formatCurrency(dailyAvgProfit.total)}
                  </p>
                  <p className="text-[10px]" style={{ color: dailyAvgProfit.total >= 0 ? '#4F46E5' : '#DC2626' }}>
                    {daysInRange} days
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Quick Summary Widget */}
        {todaySummary && (
          <Card className="mb-4 border-l-4 border-l-[#14532D] bg-gradient-to-r from-green-50/50 to-white" data-testid="today-summary-widget">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={18} className="text-[#14532D]" />
                <h3 className="font-semibold text-gray-800">Today's Quick Summary</h3>
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {/* Today's Dispatches */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <div className="p-1.5 bg-blue-100 rounded">
                    <Truck size={14} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Dispatches</p>
                    <p className="text-sm font-bold text-gray-800">{todaySummary.today_dispatches}</p>
                  </div>
                </div>

                {/* Dispatch Value */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <div className="p-1.5 bg-green-100 rounded">
                    <DollarSign size={14} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Dispatch ₹</p>
                    <p className="text-sm font-bold text-green-700">{formatCurrency(todaySummary.today_dispatch_value)}</p>
                  </div>
                </div>

                {/* Pending Indents */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <div className="p-1.5 bg-orange-100 rounded">
                    <Clock size={14} className="text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Pending</p>
                    <p className="text-sm font-bold text-orange-700">{todaySummary.pending_indents} indents</p>
                  </div>
                </div>

                {/* Today's Procurements */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <div className="p-1.5 bg-purple-100 rounded">
                    <Package size={14} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Procurements</p>
                    <p className="text-sm font-bold text-gray-800">{todaySummary.today_procurements}</p>
                  </div>
                </div>

                {/* Procurement Value */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <div className="p-1.5 bg-amber-100 rounded">
                    <ShoppingCart size={14} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Procure ₹</p>
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(todaySummary.today_procurement_value)}</p>
                  </div>
                </div>

                {/* Top Selling Product Today */}
                <div className="flex items-center gap-2 p-2 bg-white rounded-lg border">
                  <div className="p-1.5 bg-emerald-100 rounded">
                    <TrendingUp size={14} className="text-emerald-600" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[10px] text-gray-500 uppercase">Top Product</p>
                    <p className="text-xs font-bold text-gray-800 truncate" title={todaySummary.top_products?.[0]?.name}>
                      {todaySummary.top_products?.[0]?.name || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Top Products Mini List */}
              {todaySummary.top_products?.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-[10px] text-gray-500 uppercase mb-2">Today's Top Selling Products</p>
                  <div className="flex flex-wrap gap-2">
                    {todaySummary.top_products.slice(0, 5).map((prod, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs"
                        title={`${prod.qty} units • ₹${prod.amount.toLocaleString()}`}
                      >
                        <span className="w-4 h-4 rounded-full bg-[#14532D] text-white text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-medium truncate max-w-[100px]">{prod.name}</span>
                        <span className="text-gray-500">{prod.qty}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* QC and Retail Sub-Dashboards - Full P&L Metrics */}
        {pnlData?.vertical_bifurcation && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Quick Commerce Dashboard */}
            <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
              <CardHeader className="py-2 border-b border-blue-100">
                <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
                  <div className="p-1.5 bg-blue-600 rounded">
                    <Zap className="text-white" size={14} />
                  </div>
                  Quick Commerce (QC)
                  <span className="ml-auto text-xs text-blue-600 font-normal">{pnlData.vertical_bifurcation.qc.percentage}% of total</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-1.5 bg-blue-100/50 rounded">
                    <p className="text-[9px] text-blue-600 font-medium">SALES</p>
                    <p className="text-sm font-bold text-blue-900">{formatCurrency(pnlData.vertical_bifurcation.qc.sales)}</p>
                  </div>
                  <div className="p-1.5 bg-red-100/50 rounded">
                    <p className="text-[9px] text-red-600 font-medium">PURCHASE</p>
                    <p className="text-sm font-bold text-red-700">{formatCurrency(pnlData.vertical_bifurcation.qc.purchase)}</p>
                  </div>
                  <div className="p-1.5 bg-orange-100/50 rounded">
                    <p className="text-[9px] text-orange-600 font-medium">WASTAGE</p>
                    <p className="text-sm font-bold text-orange-700">{formatCurrency(pnlData.vertical_bifurcation.qc.wastage)}</p>
                  </div>
                  <div className="p-1.5 bg-pink-100/50 rounded">
                    <p className="text-[9px] text-pink-600 font-medium">GRN LOSS</p>
                    <p className="text-sm font-bold text-pink-700">{formatCurrency(pnlData.vertical_bifurcation.qc.grn_loss || 0)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center mt-2">
                  <div className={`p-1.5 rounded ${pnlData.vertical_bifurcation.qc.gross_profit >= 0 ? 'bg-green-100/50' : 'bg-red-100/50'}`}>
                    <p className="text-[9px] text-gray-600 font-medium">GROSS PROFIT</p>
                    <p className={`text-sm font-bold ${pnlData.vertical_bifurcation.qc.gross_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(pnlData.vertical_bifurcation.qc.gross_profit)}
                    </p>
                  </div>
                  <div className="p-1.5 bg-purple-100/50 rounded">
                    <p className="text-[9px] text-purple-600 font-medium">GROSS MARGIN %</p>
                    <p className="text-sm font-bold text-purple-700">{pnlData.vertical_bifurcation.qc.gross_margin_pct}%</p>
                  </div>
                  <div className="p-1.5 bg-gray-100/50 rounded">
                    <p className="text-[9px] text-gray-600 font-medium">VAR. EXP</p>
                    <p className="text-sm font-bold text-gray-700">{formatCurrency(pnlData.vertical_bifurcation.qc.variable_exp)}</p>
                  </div>
                  <div className={`p-1.5 rounded ${(pnlData.vertical_bifurcation.qc.gross_profit - pnlData.vertical_bifurcation.qc.variable_exp) >= 0 ? 'bg-green-100/50' : 'bg-red-100/50'}`}>
                    <p className="text-[9px] text-gray-600 font-medium">CONTRIBUTION</p>
                    <p className={`text-sm font-bold ${(pnlData.vertical_bifurcation.qc.gross_profit - pnlData.vertical_bifurcation.qc.variable_exp) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(pnlData.vertical_bifurcation.qc.gross_profit - pnlData.vertical_bifurcation.qc.variable_exp)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-blue-100 text-xs text-blue-700">
                  <span>Qty: {(pnlData.vertical_bifurcation.qc.qty || 0).toLocaleString()}</span>
                  <span>Orders: {pnlData.vertical_bifurcation.qc.orders || 0}</span>
                </div>
                {/* Receivables Row */}
                <div className="grid grid-cols-3 gap-2 text-center mt-2 pt-2 border-t border-blue-100">
                  <div className="p-1.5 bg-indigo-100/50 rounded">
                    <p className="text-[9px] text-indigo-600 font-medium">NET RECEIVABLE</p>
                    <p className="text-sm font-bold text-indigo-700">{formatCurrency(qcReceivables.total)}</p>
                  </div>
                  <div className="p-1.5 bg-green-100/50 rounded">
                    <p className="text-[9px] text-green-600 font-medium">PAYMENTS</p>
                    <p className="text-sm font-bold text-green-700">{formatCurrency(qcReceivables.received)}</p>
                  </div>
                  <div className="p-1.5 bg-amber-100/50 rounded">
                    <p className="text-[9px] text-amber-600 font-medium">PENDING</p>
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(qcReceivables.pending)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Retail Dashboard */}
            <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
              <CardHeader className="py-2 border-b border-emerald-100">
                <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
                  <div className="p-1.5 bg-emerald-600 rounded">
                    <ShoppingCart className="text-white" size={14} />
                  </div>
                  Retail
                  <span className="ml-auto text-xs text-emerald-600 font-normal">{pnlData.vertical_bifurcation.retail.percentage}% of total</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-center">
                  <div className="p-1.5 bg-emerald-100/50 rounded">
                    <p className="text-[9px] text-emerald-600 font-medium">SALES</p>
                    <p className="text-sm font-bold text-emerald-900">{formatCurrency(pnlData.vertical_bifurcation.retail.sales - (pnlData.vertical_bifurcation.retail.rejection || 0))}</p>
                  </div>
                  <div className="p-1.5 bg-red-100/50 rounded">
                    <p className="text-[9px] text-red-600 font-medium">PURCHASE</p>
                    <p className="text-sm font-bold text-red-700">{formatCurrency(pnlData.vertical_bifurcation.retail.purchase)}</p>
                  </div>
                  <div className="p-1.5 bg-orange-100/50 rounded">
                    <p className="text-[9px] text-orange-600 font-medium">WASTAGE</p>
                    <p className="text-sm font-bold text-orange-700">{formatCurrency(pnlData.vertical_bifurcation.retail.wastage)}</p>
                  </div>
                  <div className="p-1.5 bg-amber-100/50 rounded">
                    <p className="text-[9px] text-amber-600 font-medium">COMMISSION</p>
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(pnlData.vertical_bifurcation.retail.commission || 0)}</p>
                  </div>
                  <div className="p-1.5 bg-rose-100/50 rounded col-span-2 sm:col-span-1">
                    <p className="text-[9px] text-rose-600 font-medium">REJECTION (COGS)</p>
                    <p className="text-sm font-bold text-rose-700">{formatCurrency(Math.round(pnlData.vertical_bifurcation.retail.rejection_cogs || 0))}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center mt-2">
                  <div className={`p-1.5 rounded ${pnlData.vertical_bifurcation.retail.gross_profit >= 0 ? 'bg-green-100/50' : 'bg-red-100/50'}`}>
                    <p className="text-[9px] text-gray-600 font-medium">GROSS PROFIT</p>
                    <p className={`text-sm font-bold ${pnlData.vertical_bifurcation.retail.gross_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(pnlData.vertical_bifurcation.retail.gross_profit)}
                    </p>
                  </div>
                  <div className="p-1.5 bg-purple-100/50 rounded">
                    <p className="text-[9px] text-purple-600 font-medium">GROSS MARGIN %</p>
                    <p className="text-sm font-bold text-purple-700">{pnlData.vertical_bifurcation.retail.gross_margin_pct}%</p>
                  </div>
                  <div className="p-1.5 bg-gray-100/50 rounded">
                    <p className="text-[9px] text-gray-600 font-medium">VAR. EXP</p>
                    <p className="text-sm font-bold text-gray-700">{formatCurrency(pnlData.vertical_bifurcation.retail.variable_exp)}</p>
                  </div>
                  <div className={`p-1.5 rounded ${(pnlData.vertical_bifurcation.retail.gross_profit - pnlData.vertical_bifurcation.retail.variable_exp) >= 0 ? 'bg-green-100/50' : 'bg-red-100/50'}`}>
                    <p className="text-[9px] text-gray-600 font-medium">CONTRIBUTION</p>
                    <p className={`text-sm font-bold ${(pnlData.vertical_bifurcation.retail.gross_profit - pnlData.vertical_bifurcation.retail.variable_exp) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(pnlData.vertical_bifurcation.retail.gross_profit - pnlData.vertical_bifurcation.retail.variable_exp)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-emerald-100 text-xs text-emerald-700">
                  <span>Qty: {(pnlData.vertical_bifurcation.retail.qty || 0).toLocaleString()}</span>
                  <span>Orders: {pnlData.vertical_bifurcation.retail.orders || 0}</span>
                </div>
                {/* Receivables Row */}
                <div className="grid grid-cols-3 gap-2 text-center mt-2 pt-2 border-t border-emerald-100">
                  <div className="p-1.5 bg-indigo-100/50 rounded">
                    <p className="text-[9px] text-indigo-600 font-medium">NET RECEIVABLE</p>
                    <p className="text-sm font-bold text-indigo-700">{formatCurrency(retailReceivables.total)}</p>
                  </div>
                  <div className="p-1.5 bg-green-100/50 rounded">
                    <p className="text-[9px] text-green-600 font-medium">PAYMENTS</p>
                    <p className="text-sm font-bold text-green-700">{formatCurrency(retailReceivables.received)}</p>
                  </div>
                  <div className="p-1.5 bg-amber-100/50 rounded">
                    <p className="text-[9px] text-amber-600 font-medium">PENDING</p>
                    <p className="text-sm font-bold text-amber-700">{formatCurrency(retailReceivables.pending)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b pb-2">
          {[
            { key: 'overview', label: 'Overview', icon: '📊' },
            { key: 'customers', label: 'Customers', icon: '👥' },
            { key: 'products', label: 'Products', icon: '📦' },
            { key: 'costs', label: 'Costs', icon: '💰' },
            { key: 'cogs', label: 'COGS', icon: '📋' }
          ].map(tab => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className={activeTab === tab.key ? 'bg-[#14532D]' : ''}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Daily P&L Table - Multi-Level Expandable - AT THE TOP */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Daily P&L Breakdown</span>
                  <span className="text-[10px] font-normal text-gray-500">Date → QC/Retail → Customer → Products</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b sticky top-0 z-10">
                      <tr>
                        <th className="p-2 text-center font-medium text-gray-500 w-10 bg-gray-50">#</th>
                        <th className="p-2 text-left font-medium text-gray-500 w-8 bg-gray-50"></th>
                        <th className="p-2 text-left font-medium text-gray-500 bg-gray-50">DATE / VERTICAL / CUSTOMER</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">SALES</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">QTY</th>
                        <th className="p-2 text-right font-medium text-green-600 text-[10px] bg-gray-50">SP/Kg</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">PURCHASE</th>
                        <th className="p-2 text-right font-medium text-orange-600 text-[10px] bg-gray-50">PP/Kg</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">WASTAGE</th>
                        <th className="p-2 text-right font-medium text-red-500 bg-gray-50">REJECTION</th>
                        <th className="p-2 text-right font-medium text-amber-600 bg-gray-50">COMMISSION</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">GROSS P/L</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">GM %</th>
                        <th className="p-2 text-right font-medium text-gray-500 bg-gray-50">₹/UNIT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyPnl.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="p-4 text-center text-gray-400">No data</td>
                        </tr>
                      ) : (
                        dailyPnl.map((day, dayIdx) => {
                          // Group line items by vertical and customer
                          const qcItems = (day.line_items || []).filter(i => i.customer_type === 'QC');
                          const retailItems = (day.line_items || []).filter(i => i.customer_type !== 'QC');
                          
                          // QC aggregates
                          const qcSales = qcItems.reduce((sum, i) => sum + (i.revenue || 0), 0);
                          const qcQty = qcItems.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                          const qcPurchase = qcItems.reduce((sum, i) => sum + (i.cogs || 0), 0);
                          const qcWastage = qcItems.reduce((sum, i) => sum + (i.wastage_value || 0), 0);
                          const qcGross = qcSales - qcPurchase - qcWastage;
                          const qcMargin = qcSales > 0 ? (qcGross / qcSales * 100) : 0;
                          
                          // Retail aggregates - use NET values from API (after rejections)
                          // retail_net_sales = retail_gross_mrp - retail_rejection (MRP)
                          // retail_net_cogs = retail_cogs - retail_rejection_cogs (purchase price)
                          const retailGrossSales = day.retail_gross_mrp || day.retail_sales || retailItems.reduce((sum, i) => sum + (i.revenue || 0), 0);
                          const retailNetSales = day.retail_net_sales || Math.max(0, retailGrossSales - (day.retail_rejection || 0));
                          const retailQty = retailItems.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                          const retailGrossCogs = day.retail_cogs || retailItems.reduce((sum, i) => sum + (i.cogs || 0), 0);
                          const retailNetCogs = day.retail_net_cogs || Math.max(0, retailGrossCogs - (day.retail_rejection_cogs || 0));
                          const retailWastage = retailItems.reduce((sum, i) => sum + (i.wastage_value || 0), 0);
                          // Rejection at MRP (for display) and COGS (for P&L)
                          const retailRejectionMRP = Math.round(day.retail_rejection || 0);
                          const retailRejectionCOGS = Math.round(day.retail_rejection_cogs || 0);
                          const retailCommission = Math.round(day.retail_commission || 0);
                          // Gross P/L = Net Sales - Net COGS - Wastage - Commission
                          // (Rejection is already factored out of Net Sales and Net COGS)
                          const retailGross = Math.round(retailNetSales - retailNetCogs - retailWastage - retailCommission);
                          const retailMargin = retailNetSales > 0 ? (retailGross / retailNetSales * 100) : 0;
                          
                          // Day total (rejection and commission only apply to retail)
                          // Calculate day purchase from line items COGS, not procurement
                          // Use NET values for retail to reflect only what was actually sold
                          const dayPurchase = Math.round(qcPurchase + retailNetCogs);
                          const unsoldWastage = day.unsold_wastage_total || 0;
                          const dayWastage = Math.round(qcWastage + retailWastage + unsoldWastage);
                          // Day sales should also use net retail sales
                          const dayNetSales = Math.round(qcSales + retailNetSales);
                          const dayCommission = retailCommission;
                          const dayGrossWithDeductions = Math.round(dayNetSales - dayPurchase - dayWastage - dayCommission);
                          const dayMarginWithDeductions = dayNetSales > 0 ? (dayGrossWithDeductions / dayNetSales * 100) : 0;
                          
                          // Group by customer within each vertical
                          const qcByCustomer = qcItems.reduce((acc, item) => {
                            if (!acc[item.customer]) acc[item.customer] = [];
                            acc[item.customer].push(item);
                            return acc;
                          }, {});
                          
                          const retailByCustomer = retailItems.reduce((acc, item) => {
                            if (!acc[item.customer]) acc[item.customer] = [];
                            acc[item.customer].push(item);
                            return acc;
                          }, {});
                          
                          return (
                            <React.Fragment key={dayIdx}>
                              {/* Level 1: Date Row */}
                              <tr 
                                className="border-b hover:bg-gray-50 cursor-pointer bg-white"
                                onClick={() => toggleDateExpand(day.date)}
                              >
                                <td className="p-2 text-center text-gray-500">{dayIdx + 1}</td>
                                <td className="p-2 text-center">
                                  {expandedDates[day.date] ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                                </td>
                                <td className="p-2 font-semibold text-gray-800">{formatDate(day.date)}</td>
                                <td className="p-2 text-right text-green-600 font-medium">₹{day.sales.toLocaleString()}</td>
                                <td className="p-2 text-right text-gray-600">{day.sales_qty?.toLocaleString() || 0}</td>
                                <td className="p-2 text-right text-gray-400">-</td>
                                <td className="p-2 text-right text-orange-600">₹{dayPurchase.toLocaleString()}</td>
                                <td className="p-2 text-right text-gray-400">-</td>
                                <td className="p-2 text-right text-red-600">₹{dayWastage.toLocaleString()}</td>
                                <td className="p-2 text-right text-red-500">{retailRejectionCOGS > 0 ? `-₹${retailRejectionCOGS.toLocaleString()}` : '-'}</td>
                                <td className="p-2 text-right text-amber-600">{dayCommission > 0 ? `-₹${dayCommission.toLocaleString()}` : '-'}</td>
                                <td className={`p-2 text-right font-semibold ${dayGrossWithDeductions >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                  {dayGrossWithDeductions >= 0 ? '' : '-'}₹{Math.abs(dayGrossWithDeductions).toLocaleString()}
                                </td>
                                <td className="p-2 text-right">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    dayMarginWithDeductions >= 20 ? 'bg-green-100 text-green-700' : 
                                    dayMarginWithDeductions >= 0 ? 'bg-yellow-100 text-yellow-700' : 
                                    'bg-red-100 text-red-700'
                                  }`}>{dayMarginWithDeductions.toFixed(1)}%</span>
                                </td>
                                <td className="p-2 text-right font-medium text-gray-700">
                                  {day.sales_qty > 0 ? `₹${(dayGrossWithDeductions / day.sales_qty).toFixed(1)}` : '-'}
                                </td>
                              </tr>
                              
                              {/* Level 2: QC & Retail Rows (when date expanded) */}
                              {expandedDates[day.date] && (
                                <>
                                  {/* QC Vertical Row */}
                                  {qcItems.length > 0 && (
                                    <>
                                      <tr 
                                        className="border-b bg-blue-50 hover:bg-blue-100 cursor-pointer"
                                        onClick={() => toggleVerticalExpand(`${day.date}_QC`)}
                                      >
                                        <td className="p-2 text-center"></td>
                                        <td className="p-2 text-center pl-6">
                                          {expandedVerticals[`${day.date}_QC`] ? <ChevronDown size={12} className="text-blue-500" /> : <ChevronRight size={12} className="text-blue-500" />}
                                        </td>
                                        <td className="p-2 pl-6">
                                          <span className="inline-flex items-center gap-2">
                                            <Zap size={12} className="text-blue-600" />
                                            <span className="font-medium text-blue-800">Quick Commerce (QC)</span>
                                            <span className="text-[10px] text-blue-500">({Object.keys(qcByCustomer).length} customers)</span>
                                          </span>
                                        </td>
                                        <td className="p-2 text-right text-blue-700 font-medium">₹{qcSales.toLocaleString()}</td>
                                        <td className="p-2 text-right text-blue-600">{qcQty.toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-orange-600">₹{qcPurchase.toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-red-600">₹{qcWastage.toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className={`p-2 text-right font-semibold ${qcGross >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                          {qcGross >= 0 ? '' : '-'}₹{Math.abs(qcGross).toLocaleString()}
                                        </td>
                                        <td className="p-2 text-right">
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${qcMargin >= 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                            {qcMargin.toFixed(1)}%
                                          </span>
                                        </td>
                                        <td className="p-2 text-right font-medium text-blue-700">
                                          {qcQty > 0 ? `₹${(qcGross / qcQty).toFixed(1)}` : '-'}
                                        </td>
                                      </tr>
                                      
                                      {/* Level 3: QC Customer Rows */}
                                      {expandedVerticals[`${day.date}_QC`] && Object.entries(qcByCustomer).map(([customer, items]) => {
                                        const custSales = items.reduce((sum, i) => sum + (i.revenue || 0), 0);
                                        const custQty = items.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                                        const custPurchase = items.reduce((sum, i) => sum + (i.cogs || 0), 0);
                                        const custWastage = items.reduce((sum, i) => sum + (i.wastage_value || 0), 0);
                                        const custGross = custSales - custPurchase - custWastage;
                                        const custMargin = custSales > 0 ? (custGross / custSales * 100) : 0;
                                        const custProfitPerUnit = custQty > 0 ? (custGross / custQty) : 0;
                                        const custKey = `${day.date}_QC_${customer}`;
                                        
                                        // Sort items by gross margin descending
                                        const sortedItems = [...items].sort((a, b) => (b.gross_margin || 0) - (a.gross_margin || 0));
                                        
                                        return (
                                          <React.Fragment key={custKey}>
                                            <tr 
                                              className="border-b bg-blue-100/50 hover:bg-blue-100 cursor-pointer"
                                              onClick={() => toggleCustomerExpand(custKey)}
                                            >
                                              <td className="p-2 text-center"></td>
                                              <td className="p-2 text-center pl-10">
                                                {expandedCustomers[custKey] ? <ChevronDown size={10} className="text-blue-400" /> : <ChevronRight size={10} className="text-blue-400" />}
                                              </td>
                                              <td className="p-2 pl-10">
                                                <span className="text-sm font-medium text-blue-700">{customer}</span>
                                                <span className="ml-2 text-xs text-gray-400">({items.length} items)</span>
                                              </td>
                                              <td className="p-2 text-right text-blue-600 text-sm">₹{custSales.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-600 text-sm">{custQty.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-orange-500 text-sm">₹{custPurchase.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-red-500 text-sm">₹{custWastage.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className={`p-2 text-right text-sm font-semibold ${custGross >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {custGross >= 0 ? '' : '-'}₹{Math.abs(custGross).toLocaleString()}
                                              </td>
                                              <td className="p-2 text-right">
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${custMargin >= 20 ? 'bg-green-100 text-green-700' : custMargin >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                  {custMargin.toFixed(1)}%
                                                </span>
                                              </td>
                                              <td className="p-2 text-right text-sm font-medium text-blue-700">
                                                ₹{custProfitPerUnit.toFixed(1)}
                                              </td>
                                            </tr>
                                            
                                            {/* Level 4: Product/Item Details - Sorted by GM% DESC */}
                                            {expandedCustomers[custKey] && sortedItems.map((item, iidx) => {
                                              const itemGross = item.gross_profit || 0;
                                              const itemProfitPerUnit = item.supplied_qty > 0 ? (itemGross / item.supplied_qty) : 0;
                                              const itemGM = item.gross_margin || 0;
                                              const itemSPKg = item.selling_price_per_kg || (item.supplied_kg > 0 ? item.revenue / item.supplied_kg : 0);
                                              const itemPPKg = item.purchase_price_per_kg || (item.supplied_kg > 0 ? item.cogs / item.supplied_kg : 0);
                                              
                                              return (
                                                <tr key={iidx} className="border-b bg-white hover:bg-gray-50">
                                                  <td className="p-2 pl-14"></td>
                                                  <td className="p-2 pl-14"></td>
                                                  <td className="p-2 pl-14">
                                                    <span className="text-sm text-gray-800 font-medium">{item.product}</span>
                                                    <span className="ml-1.5 text-xs text-gray-400">{item.unit}</span>
                                                  </td>
                                                  <td className="p-2 text-right text-green-600 text-sm">₹{item.revenue.toLocaleString()}</td>
                                                  <td className="p-2 text-right text-gray-600 text-sm">{item.supplied_qty}</td>
                                                  <td className="p-2 text-right text-green-700 text-sm font-medium">₹{itemSPKg.toFixed(1)}</td>
                                                  <td className="p-2 text-right text-orange-500 text-sm">₹{item.cogs.toLocaleString()}</td>
                                                  <td className="p-2 text-right text-orange-700 text-sm font-medium">₹{itemPPKg.toFixed(1)}</td>
                                                  <td className="p-2 text-right text-red-500 text-sm">₹{item.wastage_value.toLocaleString()}</td>
                                                  <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                                  <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                                  <td className={`p-2 text-right text-sm font-semibold ${itemGross >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    ₹{itemGross.toLocaleString()}
                                                  </td>
                                                  <td className="p-2 text-right">
                                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${itemGM >= 20 ? 'bg-green-100 text-green-800' : itemGM >= 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                      {itemGM}%
                                                    </span>
                                                  </td>
                                                  <td className={`p-2 text-right text-sm font-bold ${itemProfitPerUnit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                    ₹{itemProfitPerUnit.toFixed(1)}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </React.Fragment>
                                        );
                                      })}
                                    </>
                                  )}
                                  
                                  {/* Retail Vertical Row */}
                                  {retailItems.length > 0 && (
                                    <>
                                      <tr 
                                        className="border-b bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                                        onClick={() => toggleVerticalExpand(`${day.date}_Retail`)}
                                      >
                                        <td className="p-2 text-center"></td>
                                        <td className="p-2 text-center pl-6">
                                          {expandedVerticals[`${day.date}_Retail`] ? <ChevronDown size={12} className="text-emerald-500" /> : <ChevronRight size={12} className="text-emerald-500" />}
                                        </td>
                                        <td className="p-2 pl-6">
                                          <span className="inline-flex items-center gap-2">
                                            <ShoppingCart size={12} className="text-emerald-600" />
                                            <span className="font-medium text-emerald-800">Retail</span>
                                            <span className="text-[10px] text-emerald-500">({Object.keys(retailByCustomer).length} customers)</span>
                                            {retailRejectionMRP > 0 && (
                                              <span className="text-[9px] text-red-500" title={`Gross: ₹${retailGrossSales.toLocaleString()}, Rejection: ₹${retailRejectionMRP.toLocaleString()}`}>
                                                (Net of ₹{retailRejectionMRP.toLocaleString()} rejection)
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                        <td className="p-2 text-right text-emerald-700 font-medium">₹{Math.round(retailNetSales).toLocaleString()}</td>
                                        <td className="p-2 text-right text-emerald-600">{retailQty.toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-orange-600">₹{Math.round(retailNetCogs).toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-red-600">₹{retailWastage.toLocaleString()}</td>
                                        <td className="p-2 text-right text-red-500">
                                          {retailRejectionCOGS > 0 ? `₹${retailRejectionCOGS.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="p-2 text-right text-amber-600">{retailCommission > 0 ? `-₹${retailCommission.toLocaleString()}` : '-'}</td>
                                        <td className={`p-2 text-right font-semibold ${retailGross >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                          {retailGross >= 0 ? '' : '-'}₹{Math.abs(retailGross).toLocaleString()}
                                        </td>
                                        <td className="p-2 text-right">
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${retailMargin >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            {retailMargin.toFixed(1)}%
                                          </span>
                                        </td>
                                        <td className="p-2 text-right font-medium text-emerald-700">
                                          {retailQty > 0 ? `₹${(retailGross / retailQty).toFixed(1)}` : '-'}
                                        </td>
                                      </tr>
                                      
                                      {/* Level 3: Retail Customer Rows */}
                                      {expandedVerticals[`${day.date}_Retail`] && Object.entries(retailByCustomer).map(([customer, items]) => {
                                        const custSales = items.reduce((sum, i) => sum + (i.revenue || 0), 0);
                                        const custQty = items.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                                        const custPurchase = items.reduce((sum, i) => sum + (i.cogs || 0), 0);
                                        const custWastage = items.reduce((sum, i) => sum + (i.wastage_value || 0), 0);
                                        // Commission is now tracked per item from backend - sum up item commissions
                                        const custCommission = items.reduce((sum, i) => sum + (i.commission || 0), 0);
                                        
                                        // Get retailer_id from customerToRetailerId mapping (line_items don't have retailer_id)
                                        const custRetailerId = customerToRetailerId[customer] || '';
                                        // Look up EXACT rejection at COGS from the P&L API (already calculated at purchase price)
                                        const rejectionKey = `${day.date}_${custRetailerId}`;
                                        const custRejectionData = rejectionByDateRetailer[rejectionKey] || { cogs: 0, value: 0, qty: 0 };
                                        // Use COGS value directly from backend (no conversion needed)
                                        const custRejection = Math.round(custRejectionData.cogs || 0);
                                        
                                        const custGross = Math.round(custSales - custPurchase - custWastage - custRejection - custCommission);
                                        const custMargin = custSales > 0 ? (custGross / custSales * 100) : 0;
                                        const custProfitPerUnit = custQty > 0 ? (custGross / custQty) : 0;
                                        const custKey = `${day.date}_Retail_${customer}`;
                                        
                                        // Sort items by gross margin descending
                                        const sortedItems = [...items].sort((a, b) => (b.gross_margin || 0) - (a.gross_margin || 0));
                                        
                                        return (
                                          <React.Fragment key={custKey}>
                                            <tr 
                                              className="border-b bg-emerald-100/50 hover:bg-emerald-100 cursor-pointer"
                                              onClick={() => toggleCustomerExpand(custKey)}
                                            >
                                              <td className="p-2 text-center"></td>
                                              <td className="p-2 text-center pl-10">
                                                {expandedCustomers[custKey] ? <ChevronDown size={10} className="text-emerald-400" /> : <ChevronRight size={10} className="text-emerald-400" />}
                                              </td>
                                              <td className="p-2 pl-10">
                                                <span className="text-sm font-medium text-emerald-700">{customer}</span>
                                                <span className="ml-2 text-xs text-gray-400">({items.length} items)</span>
                                              </td>
                                              <td className="p-2 text-right text-emerald-600 text-sm">₹{Math.round(custSales).toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-600 text-sm">{custQty.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-orange-500 text-sm">₹{Math.round(custPurchase).toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-red-500 text-sm">₹{Math.round(custWastage).toLocaleString()}</td>
                                              <td className="p-2 text-right text-red-500 text-sm">{custRejection > 0 ? `-₹${custRejection.toLocaleString()}` : '-'}</td>
                                              <td className="p-2 text-right text-amber-500 text-sm">{custCommission > 0 ? `-₹${Math.round(custCommission).toLocaleString()}` : '-'}</td>
                                              <td className={`p-2 text-right text-sm font-semibold ${custGross >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {custGross >= 0 ? '' : '-'}₹{Math.abs(custGross).toLocaleString()}
                                              </td>
                                              <td className="p-2 text-right">
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${custMargin >= 20 ? 'bg-green-100 text-green-700' : custMargin >= 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                  {custMargin.toFixed(1)}%
                                                </span>
                                              </td>
                                              <td className="p-2 text-right text-sm font-medium text-emerald-700">
                                                ₹{custProfitPerUnit.toFixed(1)}
                                              </td>
                                            </tr>
                                            
                                            {/* Level 4: Product/Item Details - Sorted by GM% DESC */}
                                            {expandedCustomers[custKey] && sortedItems.map((item, iidx) => {
                                              // Calculate gross profit including item-level rejection
                                              const itemRejectionCogs = item.rejection_cogs || 0;
                                              const itemGross = (item.gross_profit || 0) - itemRejectionCogs;
                                              const itemCommission = item.commission || 0;
                                              const itemProfitPerUnit = item.supplied_qty > 0 ? (itemGross / item.supplied_qty) : 0;
                                              const itemGM = item.revenue > 0 ? (itemGross / item.revenue * 100) : (item.gross_margin || 0);
                                              const itemSPKg = item.selling_price_per_kg || (item.supplied_kg > 0 ? item.revenue / item.supplied_kg : 0);
                                              const itemPPKg = item.purchase_price_per_kg || (item.supplied_kg > 0 ? item.cogs / item.supplied_kg : 0);
                                              
                                              return (
                                                <tr key={iidx} className="border-b bg-white hover:bg-gray-50">
                                                  <td className="p-2 pl-14"></td>
                                                  <td className="p-2 pl-14"></td>
                                                  <td className="p-2 pl-14">
                                                    <span className="text-sm text-gray-800 font-medium">{item.product}</span>
                                                    <span className="ml-1.5 text-xs text-gray-400">{item.unit}</span>
                                                  </td>
                                                  <td className="p-2 text-right text-green-600 text-sm">₹{item.revenue.toLocaleString()}</td>
                                                  <td className="p-2 text-right text-gray-600 text-sm">{item.supplied_qty}</td>
                                                  <td className="p-2 text-right text-green-700 text-sm font-medium">₹{itemSPKg.toFixed(1)}</td>
                                                  <td className="p-2 text-right text-orange-500 text-sm">₹{item.cogs.toLocaleString()}</td>
                                                  <td className="p-2 text-right text-orange-700 text-sm font-medium">₹{itemPPKg.toFixed(1)}</td>
                                                  <td className="p-2 text-right text-red-500 text-sm">₹{item.wastage_value.toLocaleString()}</td>
                                                  <td className="p-2 text-right text-red-500 text-sm">{itemRejectionCogs > 0 ? `-₹${Math.round(itemRejectionCogs).toLocaleString()}` : '-'}</td>
                                                  <td className="p-2 text-right text-amber-500 text-sm">{itemCommission > 0 ? `-₹${Math.round(itemCommission).toLocaleString()}` : '-'}</td>
                                                  <td className={`p-2 text-right text-sm font-semibold ${itemGross >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    ₹{Math.round(itemGross).toLocaleString()}
                                                  </td>
                                                  <td className="p-2 text-right">
                                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${itemGM >= 20 ? 'bg-green-100 text-green-800' : itemGM >= 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                      {itemGM.toFixed(1)}%
                                                    </span>
                                                  </td>
                                                  <td className={`p-2 text-right text-sm font-bold ${itemProfitPerUnit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                    ₹{itemProfitPerUnit.toFixed(1)}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </React.Fragment>
                                        );
                                      })}
                                    </>
                                  )}
                                  
                                  {/* Cumulative Unsold Wastage - Products with wastage but no sales */}
                                  {day.unsold_wastage && day.unsold_wastage.length > 0 && (
                                    <>
                                      <tr className="bg-amber-50 border-t border-amber-200">
                                        <td className="p-2 pl-6 font-medium text-amber-800 text-xs" colSpan={8}>
                                          Cumulative Unsold Wastage (Products with no sales)
                                        </td>
                                        <td className="p-2 text-right text-amber-700 font-medium text-xs">
                                          ₹{day.unsold_wastage_total?.toLocaleString()}
                                        </td>
                                        <td colSpan={5}></td>
                                      </tr>
                                      {day.unsold_wastage.map((item, widx) => (
                                        <tr key={`uw-${widx}`} className="bg-amber-50/50 border-t border-amber-100">
                                          <td className="p-2 pl-10 text-xs text-amber-700" colSpan={7}>
                                            {item.product}
                                          </td>
                                          <td className="p-2 text-right text-xs text-amber-600">
                                            {item.qty} Kg @ ₹{item.avg_price}/Kg
                                          </td>
                                          <td className="p-2 text-right text-xs text-amber-700 font-medium">
                                            ₹{item.value?.toLocaleString()}
                                          </td>
                                          <td colSpan={5}></td>
                                        </tr>
                                      ))}
                                    </>
                                  )}
                                  
                                  {/* No data message */}
                                  {qcItems.length === 0 && retailItems.length === 0 && (!day.unsold_wastage || day.unsold_wastage.length === 0) && (
                                    <tr className="bg-gray-50">
                                      <td colSpan={14} className="p-2 pl-8 text-xs text-gray-400 italic">
                                        No detailed line items available for this date
                                      </td>
                                    </tr>
                                  )}
                                </>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                    {dailyPnl.length > 0 && (() => {
                      // Calculate totals from line items for consistency
                      const totalPurchaseFromItems = dailyPnl.reduce((sum, day) => {
                        const lineItems = day.line_items || [];
                        return sum + lineItems.reduce((s, i) => s + (i.cogs || 0), 0);
                      }, 0);
                      const totalWastageFromItems = dailyPnl.reduce((sum, day) => {
                        const lineItems = day.line_items || [];
                        const unsoldWastage = day.unsold_wastage_total || 0;
                        return sum + lineItems.reduce((s, i) => s + (i.wastage_value || 0), 0) + unsoldWastage;
                      }, 0);
                      const totalRejection = dailyPnl.reduce((sum, d) => sum + (d.retail_rejection || 0), 0);
                      const totalCommission = dailyPnl.reduce((sum, d) => sum + (d.retail_commission || 0), 0);
                      const totalGross = (summary.total_sales || 0) - totalPurchaseFromItems - totalWastageFromItems - totalRejection - totalCommission;
                      const totalMargin = summary.total_sales > 0 ? (totalGross / summary.total_sales * 100) : 0;
                      
                      return (
                        <tfoot className="bg-gray-100 font-semibold">
                          <tr>
                            <td className="p-2"></td>
                            <td className="p-2">TOTAL</td>
                            <td className="p-2 text-right text-green-700">₹{summary.total_sales?.toLocaleString()}</td>
                            <td className="p-2 text-right text-gray-700">{summary.total_sales_qty?.toLocaleString()}</td>
                            <td className="p-2 text-right text-gray-400">-</td>
                            <td className="p-2 text-right text-orange-700">₹{totalPurchaseFromItems.toLocaleString()}</td>
                            <td className="p-2 text-right text-gray-400">-</td>
                            <td className="p-2 text-right text-red-700">₹{totalWastageFromItems.toLocaleString()}</td>
                            <td className="p-2 text-right text-red-500">
                              {totalRejection > 0 ? `-₹${totalRejection.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-2 text-right text-amber-600">
                              {totalCommission > 0 ? `-₹${totalCommission.toLocaleString()}` : '-'}
                            </td>
                            <td className={`p-2 text-right ${totalGross >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                              ₹{totalGross.toLocaleString()}
                            </td>
                            <td className="p-2 text-right">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                totalMargin >= 20 ? 'bg-green-100 text-green-700' : 
                                totalMargin >= 0 ? 'bg-yellow-100 text-yellow-700' : 
                                'bg-red-100 text-red-700'
                              }`}>{totalMargin.toFixed(1)}%</span>
                            </td>
                            <td className="p-2 text-right text-green-800">
                              {summary.total_sales_qty > 0 ? `₹${(totalGross / summary.total_sales_qty).toFixed(1)}` : '-'}
                            </td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </CardContent>
            </Card>
            
            {/* Charts Row - Below P&L Table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily P&L Chart */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 size={16} /> Daily P&L Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyPnl.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={dailyPnl}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => `₹${v/1000}K`} />
                        <Tooltip 
                          formatter={(value) => [`₹${value.toLocaleString()}`, '']}
                          labelFormatter={(label) => formatDate(label)}
                        />
                        <Legend />
                        <Bar dataKey="sales" name="Sales" fill="#14532D" />
                        <Bar dataKey="purchase" name="Purchase" fill="#D97706" />
                        <Bar dataKey="gross_profit" name="Gross Profit" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                      No data for selected period
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Net Profit Trend */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp size={16} /> Net Profit Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailyPnl.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={dailyPnl}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} />
                        <YAxis fontSize={10} tickFormatter={(v) => `₹${v/1000}K`} />
                        <Tooltip 
                          formatter={(value) => [`₹${value.toLocaleString()}`, '']}
                          labelFormatter={(label) => formatDate(label)}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="gross_profit" name="Gross" stroke="#14532D" strokeWidth={2} />
                        <Line type="monotone" dataKey="net_profit" name="Net" stroke="#3B82F6" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                      No data for selected period
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="space-y-4">
            {/* Date Picker for Customers Tab */}
            <Card className="border-gray-200">
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-gray-600">Date Range:</span>
                  <div className="flex items-center gap-2">
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
                    <Button variant="outline" size="sm" onClick={loadPnlData} className="ml-2">
                      <RefreshCw size={14} className="mr-1" /> Apply
                    </Button>
                  </div>
                  <span className="text-xs text-gray-400 ml-auto">
                    {daysInRange} days selected
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Vertical Cards - QC vs Retail */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Quick Commerce Card */}
              <Card 
                data-testid="qc-card"
                className={`cursor-pointer transition-all hover:shadow-lg border-2 ${
                  selectedVertical === 'qc' ? 'border-orange-500 bg-orange-50' : 'border-transparent hover:border-orange-200'
                }`}
                onClick={() => { setSelectedVertical('qc'); setShowVerticalModal(true); setSelectedRetailers([]); }}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                        <Zap className="text-white" size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">Quick Commerce</h3>
                        <p className="text-xs text-gray-500">{verticalData.qc.count} customer(s) • {verticalData.qc.invoices} invoices</p>
                      </div>
                    </div>
                    <ChevronRight className="text-gray-400" size={24} />
                  </div>
                  {/* Row 1: Sales, COGS, Wastage */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Sales</p>
                      <p className="text-base font-bold text-green-700">{formatCurrency(verticalData.qc.sales_amount)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">COGS</p>
                      <p className="text-base font-bold text-red-600">{formatCurrency(verticalData.qc.cogs)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Wastage</p>
                      <p className="text-base font-bold text-orange-600">{formatCurrency(verticalData.qc.wastage)}</p>
                    </div>
                  </div>
                  {/* Row 2: Gross P/L with %, ₹/Unit, Avg Profit/Day */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Gross P/L</p>
                      <p className={`text-base font-bold ${verticalData.qc.gross_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatCurrency(verticalData.qc.gross_profit)}
                      </p>
                      <p className={`text-[10px] ${verticalData.qc.gross_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        ({verticalData.qc.gross_margin_pct.toFixed(1)}%)
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">₹/Unit</p>
                      <p className={`text-base font-bold ${verticalData.qc.profit_per_unit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        ₹{verticalData.qc.profit_per_unit.toFixed(1)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Avg Profit/Day</p>
                      <p className={`text-base font-bold ${verticalData.qc.avg_profit_per_day >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                        {formatCurrency(verticalData.qc.avg_profit_per_day)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-center">
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50">
                      <Eye size={14} className="mr-1" /> View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Retail Card */}
              <Card 
                data-testid="retail-card"
                className={`cursor-pointer transition-all hover:shadow-lg border-2 ${
                  selectedVertical === 'retail' ? 'border-green-500 bg-green-50' : 'border-transparent hover:border-green-200'
                }`}
                onClick={() => { setSelectedVertical('retail'); setShowVerticalModal(true); setSelectedRetailers([]); }}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center">
                        <Store className="text-white" size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">Retail</h3>
                        <p className="text-xs text-gray-500">{verticalData.retail.count} customer(s) • {verticalData.retail.invoices} invoices</p>
                      </div>
                    </div>
                    <ChevronRight className="text-gray-400" size={24} />
                  </div>
                  {/* Row 1: Sales, COGS, Wastage */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Sales</p>
                      <p className="text-base font-bold text-green-700">{formatCurrency(verticalData.retail.sales_amount - (pnlData.vertical_bifurcation.retail.rejection || 0))}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">COGS</p>
                      <p className="text-base font-bold text-red-600">{formatCurrency(verticalData.retail.cogs)}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Wastage</p>
                      <p className="text-base font-bold text-orange-600">{formatCurrency(verticalData.retail.wastage)}</p>
                    </div>
                  </div>
                  {/* Row 2: Gross P/L with %, ₹/Unit, Avg Profit/Day */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Gross P/L</p>
                      <p className={`text-base font-bold ${verticalData.retail.gross_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatCurrency(verticalData.retail.gross_profit)}
                      </p>
                      <p className={`text-[10px] ${verticalData.retail.gross_profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        ({verticalData.retail.gross_margin_pct.toFixed(1)}%)
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">₹/Unit</p>
                      <p className={`text-base font-bold ${verticalData.retail.profit_per_unit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                        ₹{verticalData.retail.profit_per_unit.toFixed(1)}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Avg Profit/Day</p>
                      <p className={`text-base font-bold ${verticalData.retail.avg_profit_per_day >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                        {formatCurrency(verticalData.retail.avg_profit_per_day)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-center">
                    <Button size="sm" variant="outline" className="text-green-600 border-green-300 hover:bg-green-50">
                      <Eye size={14} className="mr-1" /> View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Comparison Section (when retailers are selected) - Just a notification */}
            {selectedRetailers.length > 0 && (
              <Card className="border-2 border-blue-200 bg-blue-50/30">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <BarChart3 size={16} /> 
                      <span className="font-medium">{selectedRetailers.length} Retailer(s) selected for comparison:</span>
                      <span className="text-blue-600">{selectedRetailers.join(', ')}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setSelectedRetailers([])}
                      className="text-gray-500 hover:text-red-500 h-7"
                    >
                      <X size={14} className="mr-1" /> Clear
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All Customers Summary */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users size={16} /> All Customers Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-gray-800">{customerPnl.length}</p>
                    <p className="text-xs text-gray-500">Total Customers</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">₹{(summary.total_sales / 1000).toFixed(0)}K</p>
                    <p className="text-xs text-gray-500">Total Sales</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-orange-700">{verticalData.qc.count}</p>
                    <p className="text-xs text-gray-500">QC Customers</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{verticalData.retail.count}</p>
                    <p className="text-xs text-gray-500">Retail Customers</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Vertical Detail Modal */}
        {showVerticalModal && selectedVertical && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowVerticalModal(false)}>
            <div 
              className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className={`p-4 ${selectedVertical === 'qc' ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-green-600 to-green-700'}`}>
                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center gap-3">
                    {selectedVertical === 'qc' ? <Zap size={24} /> : <Store size={24} />}
                    <div>
                      <h2 className="text-xl font-bold">{selectedVertical === 'qc' ? 'Quick Commerce' : 'Retail'} Details</h2>
                      <p className="text-sm opacity-90">
                        {selectedVertical === 'qc' ? verticalData.qc.count : verticalData.retail.count} customers • 
                        {selectedVertical === 'qc' ? verticalData.qc.invoices : verticalData.retail.invoices} invoices • 
                        {formatDate(dateFrom)} - {formatDate(dateTo)} ({daysInRange} days)
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowVerticalModal(false)} className="p-1 hover:bg-white/20 rounded">
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-4 overflow-y-auto max-h-[calc(90vh-100px)]">
                {/* Comprehensive Aggregated Summary - 2 rows */}
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2 mb-4">
                  {/* Row 1 */}
                  <div className="bg-green-50 rounded-lg p-2 text-center border border-green-200">
                    <p className="text-lg font-bold text-green-700">
                      {formatCurrency(selectedVertical === 'qc' ? verticalData.qc.sales_amount : (verticalData.retail.sales_amount - (pnlData.vertical_bifurcation.retail.rejection || 0)))}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Sales</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-200">
                    <p className="text-lg font-bold text-blue-700">
                      {(selectedVertical === 'qc' ? verticalData.qc.sales_qty : verticalData.retail.sales_qty).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Qty</p>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-2 text-center border border-indigo-200">
                    <p className="text-lg font-bold text-indigo-700">
                      {formatCurrency((selectedVertical === 'qc' ? verticalData.qc.sales_amount : (verticalData.retail.sales_amount - (pnlData.vertical_bifurcation.retail.rejection || 0))) / (selectedVertical === 'qc' ? verticalData.qc.max_sales_days : verticalData.retail.max_sales_days))}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Avg Sales/Day</p>
                    <p className="text-[9px] text-gray-400">({selectedVertical === 'qc' ? verticalData.qc.max_sales_days : verticalData.retail.max_sales_days} active days)</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2 text-center border border-red-200">
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(selectedVertical === 'qc' ? verticalData.qc.cogs : verticalData.retail.cogs)}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">COGS</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-2 text-center border border-orange-200">
                    <p className="text-lg font-bold text-orange-600">
                      {formatCurrency(selectedVertical === 'qc' ? verticalData.qc.wastage : verticalData.retail.wastage)}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Wastage</p>
                  </div>
                  <div className="bg-rose-50 rounded-lg p-2 text-center border border-rose-200">
                    <p className="text-lg font-bold text-rose-600">
                      {formatCurrency(selectedVertical === 'qc' ? 0 : verticalData.retail.rejection)}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Rejection</p>
                  </div>
                  <div className={`rounded-lg p-2 text-center border ${(selectedVertical === 'qc' ? verticalData.qc.gross_profit : verticalData.retail.gross_profit) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <p className={`text-lg font-bold ${(selectedVertical === 'qc' ? verticalData.qc.gross_profit : verticalData.retail.gross_profit) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatCurrency(selectedVertical === 'qc' ? verticalData.qc.gross_profit : verticalData.retail.gross_profit)}
                    </p>
                    <p className={`text-[10px] ${(selectedVertical === 'qc' ? verticalData.qc.gross_profit : verticalData.retail.gross_profit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      ({(selectedVertical === 'qc' ? verticalData.qc.gross_margin_pct : verticalData.retail.gross_margin_pct).toFixed(1)}%)
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Gross P/L</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center border border-amber-200">
                    <p className="text-lg font-bold text-amber-700">
                      {formatCurrency(selectedVertical === 'qc' ? 0 : verticalData.retail.commission)}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Commission</p>
                  </div>
                  <div className={`rounded-lg p-2 text-center border ${(selectedVertical === 'qc' ? verticalData.qc.net_profit : verticalData.retail.net_profit) >= 0 ? 'bg-green-100 border-green-300' : 'bg-red-100 border-red-300'}`}>
                    <p className={`text-lg font-bold ${(selectedVertical === 'qc' ? verticalData.qc.net_profit : verticalData.retail.net_profit) >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                      {formatCurrency(selectedVertical === 'qc' ? verticalData.qc.net_profit : verticalData.retail.net_profit)}
                    </p>
                    <p className={`text-[10px] ${(selectedVertical === 'qc' ? verticalData.qc.net_profit : verticalData.retail.net_profit) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      ({(selectedVertical === 'qc' ? verticalData.qc.net_margin_pct : verticalData.retail.net_margin_pct).toFixed(1)}%)
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">Net P/L</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-2 text-center border border-purple-200">
                    <p className={`text-lg font-bold ${(selectedVertical === 'qc' ? verticalData.qc.profit_per_unit : verticalData.retail.profit_per_unit) >= 0 ? 'text-purple-700' : 'text-red-600'}`}>
                      ₹{(selectedVertical === 'qc' ? verticalData.qc.profit_per_unit : verticalData.retail.profit_per_unit).toFixed(1)}
                    </p>
                    <p className="text-[10px] text-gray-600 uppercase">₹/Unit</p>
                  </div>
                </div>

                {/* Retailer Multi-Select (only for Retail) */}
                {selectedVertical === 'retail' && verticalData.retail.customers.length > 1 && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                      <BarChart3 size={14} /> Select retailers to compare (click checkboxes)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {verticalData.retail.customers.map(c => (
                        <label 
                          key={c.customer}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs cursor-pointer transition-all ${
                            selectedRetailers.includes(c.customer) 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-white border border-gray-300 hover:border-blue-400'
                          }`}
                        >
                          <Checkbox
                            checked={selectedRetailers.includes(c.customer)}
                            onCheckedChange={() => toggleRetailerSelection(c.customer)}
                            className="w-3 h-3"
                          />
                          {c.customer}
                        </label>
                      ))}
                    </div>
                    {selectedRetailers.length > 0 && (
                      <p className="text-xs text-blue-600 mt-2">
                        {selectedRetailers.length} selected - Close modal to see comparison chart
                      </p>
                    )}
                  </div>
                )}

                {/* Customer List - Comprehensive Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className={`${selectedVertical === 'qc' ? 'bg-orange-100' : 'bg-green-100'}`}>
                        <tr>
                          {selectedVertical === 'retail' && <th className="p-2 text-center w-8 sticky left-0 bg-inherit">✓</th>}
                          <th className="p-2 text-left sticky left-0 bg-inherit">#</th>
                          <th className="p-2 text-left min-w-[140px]">Customer</th>
                          <th className="p-2 text-right">Sales</th>
                          <th className="p-2 text-right">Qty</th>
                          <th className="p-2 text-right">Avg/Day</th>
                          <th className="p-2 text-right">COGS</th>
                          <th className="p-2 text-right">Wastage</th>
                          <th className="p-2 text-right">Rejection</th>
                          <th className="p-2 text-right">Rej %</th>
                          <th className="p-2 text-right">Gross P/L</th>
                          <th className="p-2 text-right">GM %</th>
                          <th className="p-2 text-right">Commission</th>
                          <th className="p-2 text-right">Net P/L</th>
                          <th className="p-2 text-right">NM %</th>
                          <th className="p-2 text-right">₹/Unit</th>
                          <th className="p-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedVertical === 'qc' ? verticalData.qc.customers : verticalData.retail.customers).map((c, idx) => {
                          // Avg/Day = Sales / customer's actual sales days (from API)
                          const avgSalesDay = (c.sales_amount || 0) / (c.sales_days || 1);
                          return (
                            <tr key={c.customer} className="border-t hover:bg-gray-50">
                              {selectedVertical === 'retail' && (
                                <td className="p-2 text-center">
                                  <Checkbox
                                    checked={selectedRetailers.includes(c.customer)}
                                    onCheckedChange={() => toggleRetailerSelection(c.customer)}
                                    className="w-3 h-3"
                                  />
                                </td>
                              )}
                              <td className="p-2 text-gray-500">{idx + 1}</td>
                              <td className="p-2 font-medium">
                                {c.customer}
                                <span className="text-[10px] text-gray-400 ml-1">({c.sales_days || 0}d)</span>
                              </td>
                              <td className="p-2 text-right text-green-700 font-semibold">₹{(c.sales_amount || 0).toLocaleString()}</td>
                              <td className="p-2 text-right">{(c.sales_qty || 0).toLocaleString()}</td>
                              <td className="p-2 text-right text-indigo-600">₹{Math.round(avgSalesDay).toLocaleString()}</td>
                              <td className="p-2 text-right text-red-600">₹{Math.round(c.cogs || 0).toLocaleString()}</td>
                              <td className="p-2 text-right text-orange-600">₹{Math.round(c.wastage || 0).toLocaleString()}</td>
                              <td className="p-2 text-right text-rose-600">₹{Math.round(c.rejection || 0).toLocaleString()}</td>
                              <td className="p-2 text-right">
                                <span className={`px-1 py-0.5 rounded text-[10px] ${(c.rejection_pct || 0) > 10 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {(c.rejection_pct || 0).toFixed(1)}%
                                </span>
                              </td>
                              <td className={`p-2 text-right font-bold ${(c.gross_profit || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                ₹{Math.round(c.gross_profit || 0).toLocaleString()}
                              </td>
                              <td className="p-2 text-right">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  (c.gross_margin_pct || 0) >= 20 ? 'bg-green-100 text-green-700' : 
                                  (c.gross_margin_pct || 0) >= 0 ? 'bg-yellow-100 text-yellow-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {(c.gross_margin_pct || 0).toFixed(1)}%
                                </span>
                              </td>
                              <td className="p-2 text-right text-amber-600">₹{Math.round(c.commission || 0).toLocaleString()}</td>
                              <td className={`p-2 text-right font-bold ${(c.net_profit || 0) >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                                ₹{Math.round(c.net_profit || 0).toLocaleString()}
                              </td>
                              <td className="p-2 text-right">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  (c.net_margin_pct || 0) >= 10 ? 'bg-green-100 text-green-700' : 
                                  (c.net_margin_pct || 0) >= 0 ? 'bg-yellow-100 text-yellow-700' : 
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {(c.net_margin_pct || 0).toFixed(1)}%
                                </span>
                              </td>
                              <td className={`p-2 text-right ${(c.profit_per_unit || 0) >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                ₹{(c.profit_per_unit || 0).toFixed(1)}
                              </td>
                              <td className="p-2 text-center">
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-6 text-blue-600 text-xs"
                                  onClick={() => { openCustomerDetail(c.customer); setShowVerticalModal(false); }}
                                >
                                  <Eye size={10} className="mr-1" /> Details
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Totals Row */}
                      <tfoot className={`font-semibold ${selectedVertical === 'qc' ? 'bg-orange-50' : 'bg-green-50'} border-t-2`}>
                        <tr>
                          {selectedVertical === 'retail' && <td className="p-2"></td>}
                          <td className="p-2"></td>
                          <td className="p-2 font-bold">TOTAL</td>
                          <td className="p-2 text-right text-green-700">₹{(selectedVertical === 'qc' ? verticalData.qc.sales_amount : (verticalData.retail.sales_amount - (pnlData.vertical_bifurcation.retail.rejection || 0))).toLocaleString()}</td>
                          <td className="p-2 text-right">{(selectedVertical === 'qc' ? verticalData.qc.sales_qty : verticalData.retail.sales_qty).toLocaleString()}</td>
                          <td className="p-2 text-right text-indigo-600">₹{Math.round((selectedVertical === 'qc' ? verticalData.qc.sales_amount : (verticalData.retail.sales_amount - (pnlData.vertical_bifurcation.retail.rejection || 0))) / daysInRange).toLocaleString()}</td>
                          <td className="p-2 text-right text-red-600">₹{Math.round(selectedVertical === 'qc' ? verticalData.qc.cogs : verticalData.retail.cogs).toLocaleString()}</td>
                          <td className="p-2 text-right text-orange-600">₹{Math.round(selectedVertical === 'qc' ? verticalData.qc.wastage : verticalData.retail.wastage).toLocaleString()}</td>
                          <td className="p-2 text-right text-rose-600">₹{Math.round(selectedVertical === 'qc' ? verticalData.qc.rejection : verticalData.retail.rejection).toLocaleString()}</td>
                          <td className="p-2 text-right">
                            <span className="px-1 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                              {(selectedVertical === 'qc' ? verticalData.qc.rejection_pct : verticalData.retail.rejection_pct).toFixed(1)}%
                            </span>
                          </td>
                          <td className={`p-2 text-right ${(selectedVertical === 'qc' ? verticalData.qc.gross_profit : verticalData.retail.gross_profit) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            ₹{Math.round(selectedVertical === 'qc' ? verticalData.qc.gross_profit : verticalData.retail.gross_profit).toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            {(selectedVertical === 'qc' ? verticalData.qc.gross_margin_pct : verticalData.retail.gross_margin_pct).toFixed(1)}%
                          </td>
                          <td className="p-2 text-right text-amber-600">₹{Math.round(selectedVertical === 'qc' ? verticalData.qc.commission : verticalData.retail.commission).toLocaleString()}</td>
                          <td className={`p-2 text-right ${(selectedVertical === 'qc' ? verticalData.qc.net_profit : verticalData.retail.net_profit) >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                            ₹{Math.round(selectedVertical === 'qc' ? verticalData.qc.net_profit : verticalData.retail.net_profit).toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            {(selectedVertical === 'qc' ? verticalData.qc.net_margin_pct : verticalData.retail.net_margin_pct).toFixed(1)}%
                          </td>
                          <td className="p-2 text-right text-purple-600">
                            ₹{(selectedVertical === 'qc' ? verticalData.qc.profit_per_unit : verticalData.retail.profit_per_unit).toFixed(1)}
                          </td>
                          <td className="p-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package size={16} /> Product-wise P&L
                    <span className="text-xs font-normal text-gray-500">(Sorted by Sales)</span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{productPnlData.length} items</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-gray-400" />
                    <Input
                      type="date"
                      value={productDateFrom}
                      onChange={(e) => setProductDateFrom(e.target.value)}
                      className="h-8 w-36 text-sm"
                    />
                    <span className="text-gray-400 text-sm">to</span>
                    <Input
                      type="date"
                      value={productDateTo}
                      onChange={(e) => setProductDateTo(e.target.value)}
                      className="h-8 w-36 text-sm"
                    />
                    {loadingProductPnl && <RefreshCw size={14} className="animate-spin text-gray-400" />}
                  </div>
                </div>
                {/* Vertical Toggle Buttons */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 mr-2">Filter by:</span>
                  <button
                    onClick={() => setProductVertical('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      productVertical === 'all'
                        ? 'bg-gray-800 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    data-testid="product-vertical-all"
                  >
                    All
                  </button>
                  <button
                    onClick={() => setProductVertical('qc')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      productVertical === 'qc'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                    data-testid="product-vertical-qc"
                  >
                    <Truck size={12} />
                    Quick Commerce
                  </button>
                  <button
                    onClick={() => setProductVertical('retail')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                      productVertical === 'retail'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                    }`}
                    data-testid="product-vertical-retail"
                  >
                    <Store size={12} />
                    Retail
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProductPnl ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14532D]"></div>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-2.5 text-left font-medium text-gray-600">PRODUCT</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">SALES (₹)</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">SALES QTY</th>
                      <th className="p-2.5 text-right font-medium text-orange-600">COGS (₹)</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">COGS QTY</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">WASTAGE</th>
                      {productVertical === 'retail' && (
                        <>
                          <th className="p-2.5 text-right font-medium text-pink-600">REJECTION</th>
                          <th className="p-2.5 text-right font-medium text-purple-600">COMMISSION</th>
                        </>
                      )}
                      <th className="p-2.5 text-right font-medium text-gray-600">GROSS P/L</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">MARGIN %</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">₹/UNIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPnlData.length === 0 ? (
                      <tr>
                        <td colSpan={productVertical === 'retail' ? 11 : 9} className="p-4 text-center text-gray-400">No products</td>
                      </tr>
                    ) : (
                      productPnlData.map((p, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2.5 font-medium">
                            <button 
                              onClick={() => loadProductDetail(p.product, productVertical)}
                              className="text-left text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                              data-testid={`product-detail-btn-${idx}`}
                            >
                              {p.product}
                            </button>
                          </td>
                          <td className="p-2.5 text-right text-green-600">₹{p.sales_amount?.toLocaleString()}</td>
                          <td className="p-2.5 text-right">{p.sales_qty?.toLocaleString()}</td>
                          <td className="p-2.5 text-right text-orange-600">₹{p.purchase_amount?.toLocaleString()}</td>
                          <td className="p-2.5 text-right">{p.purchase_qty?.toLocaleString()} Kg</td>
                          <td className="p-2.5 text-right text-red-600">₹{p.wastage_amount?.toLocaleString()}</td>
                          {productVertical === 'retail' && (
                            <>
                              <td className="p-2.5 text-right text-pink-600">
                                <div>₹{(p.rejection_amount || 0).toLocaleString()}</div>
                                <div className="text-xs text-pink-500">({(p.rejection_pct || 0).toFixed(1)}%)</div>
                              </td>
                              <td className="p-2.5 text-right text-purple-600">
                                <div>₹{(p.commission_amount || 0).toLocaleString()}</div>
                                <div className="text-xs text-purple-500">({p.commission_pct || 20}%)</div>
                              </td>
                            </>
                          )}
                          <td className={`p-2.5 text-right font-semibold ${p.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {p.profit >= 0 ? '+' : ''}₹{p.profit?.toLocaleString()}
                          </td>
                          <td className="p-2.5 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              p.margin >= 20 ? 'bg-green-100 text-green-700' : 
                              p.margin >= 10 ? 'bg-yellow-100 text-yellow-700' : 
                              p.margin >= 0 ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {p.margin?.toFixed(1)}%
                            </span>
                          </td>
                          <td className={`p-2.5 text-right ${p.profit_per_unit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{p.profit_per_unit?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {productPnlData.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold border-t-2">
                      <tr>
                        <td className="p-2.5">TOTAL ({productPnlData.length} products)</td>
                        <td className="p-2.5 text-right text-green-700">
                          ₹{productPnlData.reduce((sum, p) => sum + (p.sales_amount || 0), 0).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right">
                          {productPnlData.reduce((sum, p) => sum + (p.sales_qty || 0), 0).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right text-orange-700">
                          ₹{productPnlData.reduce((sum, p) => sum + (p.purchase_amount || 0), 0).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right">
                          {productPnlData.reduce((sum, p) => sum + (p.purchase_qty || 0), 0).toLocaleString()} Kg
                        </td>
                        <td className="p-2.5 text-right text-red-700">
                          ₹{productPnlData.reduce((sum, p) => sum + (p.wastage_amount || 0), 0).toLocaleString()}
                        </td>
                        {productVertical === 'retail' && (
                          <>
                            <td className="p-2.5 text-right text-pink-700">
                              ₹{productPnlData.reduce((sum, p) => sum + (p.rejection_amount || 0), 0).toLocaleString()}
                            </td>
                            <td className="p-2.5 text-right text-purple-700">
                              ₹{productPnlData.reduce((sum, p) => sum + (p.commission_amount || 0), 0).toLocaleString()}
                            </td>
                          </>
                        )}
                        <td className={`p-2.5 text-right ${productPnlData.reduce((sum, p) => sum + (p.profit || 0), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          ₹{productPnlData.reduce((sum, p) => sum + (p.profit || 0), 0).toLocaleString()}
                        </td>
                        <td className="p-2.5 text-right">-</td>
                        <td className="p-2.5 text-right">-</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'costs' && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-4">
                  <div className="text-xs text-blue-700 font-medium">VARIABLE COSTS</div>
                  <div className="text-2xl font-bold text-blue-900">
                    ₹{(pnlData?.summary?.total_variable_expenses || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-blue-600">
                    Includes Labour: ₹{(pnlData?.summary?.total_labour_cost || 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <CardContent className="p-4">
                  <div className="text-xs text-orange-700 font-medium">FIXED COSTS</div>
                  <div className="text-2xl font-bold text-orange-900">
                    ₹{(pnlData?.summary?.total_fixed_expenses || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-orange-600">Monthly recurring</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
                <CardContent className="p-4">
                  <div className="text-xs text-red-700 font-medium">TOTAL COSTS</div>
                  <div className="text-2xl font-bold text-red-900">
                    ₹{((pnlData?.summary?.total_variable_expenses || 0) + (pnlData?.summary?.total_fixed_expenses || 0)).toLocaleString()}
                  </div>
                  <div className="text-xs text-red-600">
                    {(((pnlData?.summary?.total_variable_expenses || 0) + (pnlData?.summary?.total_fixed_expenses || 0)) / (pnlData?.summary?.total_sales || 1) * 100).toFixed(1)}% of Sales
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Variable Expenses */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2">
                      <Receipt size={16} /> Variable Costs (incl. Labour)
                    </span>
                    <span className="text-xs font-normal text-blue-600">
                      ₹{(pnlData?.summary?.total_variable_expenses || 0).toLocaleString()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {variableExpenseData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <RePieChart>
                          <Pie
                            data={variableExpenseData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={70}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {variableExpenseData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, '']} />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1">
                        {variableExpenseData.map((exp, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                              {exp.name}
                            </span>
                            <span className="font-medium">₹{exp.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                      No variable costs
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Fixed Expenses */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2">
                      <Calculator size={16} /> Fixed Costs (Monthly)
                    </span>
                    <span className="text-xs font-normal text-orange-600">
                      ₹{(pnlData?.summary?.total_fixed_expenses || 0).toLocaleString()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fixedExpenseData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <RePieChart>
                          <Pie
                            data={fixedExpenseData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={70}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {fixedExpenseData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, '']} />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1">
                        {fixedExpenseData.map((exp, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded" style={{ backgroundColor: COLORS[(idx + 3) % COLORS.length] }}></span>
                              {exp.name}
                            </span>
                            <span className="font-medium">₹{exp.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                      No fixed costs
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Purchase by Farmer */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users size={16} /> Purchase by Farmer/Supplier
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-2 text-left font-medium text-gray-500">#</th>
                        <th className="p-2 text-left font-medium text-gray-500">FARMER/SUPPLIER</th>
                        <th className="p-2 text-right font-medium text-gray-500">AMOUNT (₹)</th>
                        <th className="p-2 text-right font-medium text-gray-500">QUANTITY (Kg)</th>
                        <th className="p-2 text-right font-medium text-gray-500">AVG RATE (₹/Kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseByFarmer.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-gray-400">No purchases</td>
                        </tr>
                      ) : (
                        purchaseByFarmer.map((f, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-gray-400">{idx + 1}</td>
                            <td className="p-2 font-medium">{f.farmer}</td>
                            <td className="p-2 text-right text-orange-600">₹{f.amount.toLocaleString()}</td>
                            <td className="p-2 text-right">{f.qty.toLocaleString()} Kg</td>
                            <td className="p-2 text-right">₹{(f.amount / f.qty || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* COGS Tab */}
        {activeTab === 'cogs' && (
          <div className="space-y-4">
            {/* Header with Date Picker */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database size={16} /> COGS Snapshot - Purchase Price & Selling Prices
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-500" />
                      <Input
                        type="date"
                        value={cogsSnapshotDate}
                        onChange={(e) => setCogsSnapshotDate(e.target.value)}
                        className="h-8 text-xs w-36"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fetchCogsSnapshot(cogsSnapshotDate)}
                      disabled={cogsLoading}
                    >
                      {cogsLoading ? <RefreshCw className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Search */}
                <div className="mb-4">
                  <Input
                    placeholder="Search product..."
                    value={cogsSearch}
                    onChange={(e) => setCogsSearch(e.target.value)}
                    className="h-8 text-xs max-w-xs"
                  />
                </div>
                
                {/* Stats */}
                {cogsSnapshot && (
                  <div className="mb-4 text-xs text-gray-500">
                    Showing {filteredCogsProducts.length} of {cogsSnapshot.total_products} products for {cogsSnapshot.date}
                  </div>
                )}
                
                {/* Table */}
                {cogsLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <RefreshCw className="animate-spin text-gray-400" size={24} />
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b sticky top-0">
                        <tr>
                          <th 
                            className="p-2 text-left font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              if (cogsSortField === 'product_name') setCogsSortAsc(!cogsSortAsc);
                              else { setCogsSortField('product_name'); setCogsSortAsc(true); }
                            }}
                          >
                            PRODUCT NAME {cogsSortField === 'product_name' && (cogsSortAsc ? '▲' : '▼')}
                          </th>
                          <th 
                            className="p-2 text-right font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              if (cogsSortField === 'pp_per_kg') setCogsSortAsc(!cogsSortAsc);
                              else { setCogsSortField('pp_per_kg'); setCogsSortAsc(true); }
                            }}
                          >
                            PP/kg (₹) {cogsSortField === 'pp_per_kg' && (cogsSortAsc ? '▲' : '▼')}
                          </th>
                          <th 
                            className="p-2 text-right font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              if (cogsSortField === 'qc_sp_per_kg') setCogsSortAsc(!cogsSortAsc);
                              else { setCogsSortField('qc_sp_per_kg'); setCogsSortAsc(true); }
                            }}
                          >
                            QC SP (₹/kg) {cogsSortField === 'qc_sp_per_kg' && (cogsSortAsc ? '▲' : '▼')}
                          </th>
                          <th 
                            className="p-2 text-right font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              if (cogsSortField === 'retail_sp_per_kg') setCogsSortAsc(!cogsSortAsc);
                              else { setCogsSortField('retail_sp_per_kg'); setCogsSortAsc(true); }
                            }}
                          >
                            RETAIL SP (₹/kg) {cogsSortField === 'retail_sp_per_kg' && (cogsSortAsc ? '▲' : '▼')}
                          </th>
                          <th 
                            className="p-2 text-center font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              if (cogsSortField === 'unit') setCogsSortAsc(!cogsSortAsc);
                              else { setCogsSortField('unit'); setCogsSortAsc(true); }
                            }}
                          >
                            UNIT {cogsSortField === 'unit' && (cogsSortAsc ? '▲' : '▼')}
                          </th>
                          <th 
                            className="p-2 text-center font-medium text-gray-500 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              if (cogsSortField === 'last_updated') setCogsSortAsc(!cogsSortAsc);
                              else { setCogsSortField('last_updated'); setCogsSortAsc(false); }
                            }}
                          >
                            LAST UPDATED {cogsSortField === 'last_updated' && (cogsSortAsc ? '▲' : '▼')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCogsProducts.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-400">
                              {cogsSearch ? 'No products match your search' : 'No COGS data available for this date'}
                            </td>
                          </tr>
                        ) : (
                          filteredCogsProducts.map((product, idx) => {
                            const ppChange = product.pp_change;
                            const hasIncrease = ppChange != null && ppChange > 0;
                            const hasDecrease = ppChange != null && ppChange < 0;
                            
                            return (
                              <tr key={idx} className="border-b hover:bg-gray-50">
                                <td className="p-2 font-medium">{product.product_name}</td>
                                <td className="p-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {product.pp_per_kg != null ? (
                                      <>
                                        <span className="font-medium">₹{product.pp_per_kg.toLocaleString()}</span>
                                        {ppChange != null && ppChange !== 0 && (
                                          <span className={`text-[10px] flex items-center gap-0.5 px-1 py-0.5 rounded ${
                                            hasIncrease ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                                          }`}>
                                            {hasIncrease ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                            {hasIncrease ? '▲' : '▼'}₹{Math.abs(ppChange).toFixed(1)}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-gray-300">-</span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2 text-right">
                                  {product.qc_sp_per_kg != null ? (
                                    <span className="font-medium text-blue-600">₹{product.qc_sp_per_kg.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                <td className="p-2 text-right">
                                  {product.retail_sp_per_kg != null ? (
                                    <span className="font-medium text-purple-600">₹{product.retail_sp_per_kg.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                <td className="p-2 text-center text-gray-500">{product.unit || 'Kg'}</td>
                                <td className="p-2 text-center text-gray-400 text-[10px]">
                                  {product.last_updated || '-'}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-white">
              <div>
                <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
                  <Users size={20} />
                  Customer P&L: {selectedCustomer}
                </h3>
                <p className="text-xs text-gray-500 mt-1">Date-wise breakdown of sales, purchases, and profit</p>
              </div>
              <button 
                onClick={() => { setSelectedCustomer(null); setCustomerDetailData(null); }} 
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Date Filters */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 border-b">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-500" />
                <span className="text-sm text-gray-600">From:</span>
                <Input
                  type="date"
                  value={customerDetailDateFrom}
                  onChange={(e) => setCustomerDetailDateFrom(e.target.value)}
                  className="w-36 h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">To:</span>
                <Input
                  type="date"
                  value={customerDetailDateTo}
                  onChange={(e) => setCustomerDetailDateTo(e.target.value)}
                  className="w-36 h-8 text-sm"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadCustomerDetail(selectedCustomer)}
                disabled={loadingCustomerDetail}
              >
                <RefreshCw size={14} className={`mr-1 ${loadingCustomerDetail ? 'animate-spin' : ''}`} /> 
                {loadingCustomerDetail ? 'Loading...' : 'Apply'}
              </Button>
            </div>
            
            {/* Totals Summary */}
            {customerDetailData?.totals && (
              <div className="grid grid-cols-5 md:grid-cols-10 gap-2 p-4 bg-blue-50 border-b">
                {/* 1. SALES */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">SALES</p>
                  <p className="text-sm font-bold text-green-600">₹{customerDetailData.totals.sales.toLocaleString()}</p>
                </div>
                {/* 2. QTY */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">QTY</p>
                  <p className="text-sm font-bold">{customerDetailData.totals.qty.toLocaleString()}</p>
                </div>
                {/* 3. PURCHASE */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">PURCHASE</p>
                  <p className="text-sm font-bold text-orange-600">₹{customerDetailData.totals.purchase.toLocaleString()}</p>
                </div>
                {/* 4. WASTAGE */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">WASTAGE</p>
                  <p className="text-sm font-bold text-red-600">₹{customerDetailData.totals.wastage.toLocaleString()}</p>
                </div>
                {/* 5. REJECTION (for Retail) or GRN LOSS placeholder (for QC - shown in slot 7) */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">REJECTION (COGS)</p>
                  <p className="text-sm font-bold text-amber-600">₹{(customerDetailData.totals.rejectionShare || 0).toLocaleString()}</p>
                </div>
                {/* 6. GROSS P/L with GM% = Sales - Purchase - Wastage - Rejection */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">GROSS P/L</p>
                  <p className={`text-sm font-bold ${customerDetailData.totals.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ₹{customerDetailData.totals.grossProfit.toLocaleString()}
                  </p>
                  <p className={`text-[9px] ${customerDetailData.totals.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({customerDetailData.totals.sales > 0 ? ((customerDetailData.totals.grossProfit / customerDetailData.totals.sales) * 100).toFixed(1) : 0}%)
                  </p>
                </div>
                {/* 7. COMMISSION (for Retail) or GRN LOSS (for QC) */}
                <div className="text-center p-2 bg-white rounded shadow-sm">
                  <p className="text-[10px] text-gray-500 font-medium">
                    {customerDetailData.totals.customerType === 'QC' ? 'GRN LOSS' : 'COMMISSION'}
                  </p>
                  <p className="text-sm font-bold text-purple-600">
                    ₹{customerDetailData.totals.customerType === 'QC' 
                      ? (customerDetailData.totals.grnLossShare || 0).toLocaleString()
                      : (customerDetailData.totals.commissionFromPnl || 0).toLocaleString()}
                  </p>
                </div>
                {/* 8. VAR EXP */}
                <div className="text-center p-2 bg-white rounded shadow-sm" title="Only vertical-specific expenses (excludes shared 'All' expenses)">
                  <p className="text-[10px] text-gray-500 font-medium">VAR EXP</p>
                  <p className="text-sm font-bold text-pink-600">₹{(customerDetailData.totals.variableExpenses || 0).toLocaleString()}</p>
                </div>
                {/* 9. NET P/L = Gross P/L - Commission/GRN Loss - Variable Expense */}
                <div className="text-center p-2 bg-green-50 rounded shadow-sm border border-green-200">
                  <p className="text-[10px] text-green-600 font-medium">NET P/L</p>
                  <p className={`text-sm font-bold ${customerDetailData.totals.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ₹{customerDetailData.totals.netProfit.toLocaleString()}
                  </p>
                </div>
                {/* 10. AVG/DAY = Net P/L / Num of days */}
                <div className="text-center p-2 bg-indigo-50 rounded shadow-sm">
                  <p className="text-[10px] text-indigo-600 font-medium">AVG/DAY</p>
                  <p className={`text-sm font-bold ${(customerDetailData.totals.netProfit / (customerDetailData.periodDays || 1)) >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>
                    ₹{(customerDetailData.totals.netProfit / (customerDetailData.periodDays || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            )}
            
            {/* Daily Breakdown Table */}
            <div className="flex-1 overflow-auto p-4">
              {loadingCustomerDetail ? (
                <div className="flex items-center justify-center h-48">
                  <RefreshCw size={24} className="animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-500">Loading customer data...</span>
                </div>
              ) : customerDetailData?.daily?.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-medium text-gray-600 w-8"></th>
                      <th className="p-2 text-left font-medium text-gray-600">DATE</th>
                      <th className="p-2 text-right font-medium text-green-600">SALES</th>
                      <th className="p-2 text-right font-medium text-gray-600">QTY</th>
                      <th className="p-2 text-right font-medium text-red-600">COGS</th>
                      <th className="p-2 text-right font-medium text-orange-600">WASTAGE</th>
                      <th className="p-2 text-right font-medium text-rose-600">REJECTION</th>
                      <th className="p-2 text-right font-medium text-emerald-600">GROSS P/L</th>
                      <th className="p-2 text-right font-medium text-gray-600">GM %</th>
                      <th className="p-2 text-right font-medium text-amber-600">COMMISSION</th>
                      <th className="p-2 text-right font-medium text-green-700">NET P/L</th>
                      <th className="p-2 text-right font-medium text-gray-600">NM %</th>
                      <th className="p-2 text-right font-medium text-purple-600">₹/UNIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerDetailData.daily.map((day, idx) => (
                      <React.Fragment key={idx}>
                        <tr 
                          className="border-b hover:bg-blue-50 cursor-pointer"
                          onClick={() => toggleCustomerDateExpand(day.date)}
                        >
                          <td className="p-2">
                            {expandedCustomerDates[day.date] ? (
                              <ChevronDown size={14} className="text-blue-500" />
                            ) : (
                              <ChevronRight size={14} className="text-gray-400" />
                            )}
                          </td>
                          <td className="p-2 font-medium">
                            {new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="p-2 text-right text-green-600 font-medium">₹{day.sales.toLocaleString()}</td>
                          <td className="p-2 text-right">{day.qty.toLocaleString()}</td>
                          <td className="p-2 text-right text-red-600">₹{day.purchase.toLocaleString()}</td>
                          <td className="p-2 text-right text-orange-600">{day.wastage > 0 ? `₹${day.wastage.toLocaleString()}` : '-'}</td>
                          <td className="p-2 text-right text-rose-600">
                            {day.rejection > 0 ? (
                              <>
                                ₹{Math.round(day.rejection).toLocaleString()}
                                <span className="text-[9px] ml-0.5 text-rose-400">
                                  ({day.rejectionPct?.toFixed(1)}%)
                                </span>
                              </>
                            ) : '-'}
                          </td>
                          <td className={`p-2 text-right font-semibold ${day.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            ₹{Math.round(day.grossProfit).toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              day.grossMargin >= 20 ? 'bg-green-100 text-green-700' : 
                              day.grossMargin >= 0 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {day.grossMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-2 text-right text-amber-600">{day.commission > 0 ? `₹${Math.round(day.commission).toLocaleString()}` : '-'}</td>
                          <td className={`p-2 text-right font-semibold ${day.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            ₹{Math.round(day.netProfit).toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              day.netMargin >= 10 ? 'bg-green-100 text-green-700' : 
                              day.netMargin >= 0 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {day.netMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className={`p-2 text-right ${day.profitPerUnit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                            ₹{day.profitPerUnit.toFixed(1)}
                          </td>
                        </tr>
                        {/* Product-wise breakdown row */}
                        {expandedCustomerDates[day.date] && day.items && day.items.length > 0 && (
                          <tr className="bg-blue-50/50">
                            <td colSpan={13} className="p-2">
                              <div className="bg-white rounded border overflow-hidden">
                                <table className="w-full text-[10px]">
                                  <thead className="bg-gray-50">
                                    <tr>
                                      <th className="p-1.5 text-left font-medium text-gray-600">PRODUCT</th>
                                      <th className="p-1.5 text-center font-medium text-gray-600">QTY</th>
                                      <th className="p-1.5 text-center font-medium text-gray-600">KG</th>
                                      <th className="p-1.5 text-right font-medium text-green-600">REVENUE</th>
                                      <th className="p-1.5 text-right font-medium text-orange-600">COGS</th>
                                      <th className="p-1.5 text-right font-medium text-red-600">WASTAGE</th>
                                      <th className="p-1.5 text-right font-medium text-amber-600">COMM.</th>
                                      <th className="p-1.5 text-right font-medium text-gray-600">PROFIT</th>
                                      <th className="p-1.5 text-right font-medium text-gray-600">GM %</th>
                                      <th className="p-1.5 text-right font-medium text-gray-600">₹/QTY</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {day.items.map((item, itemIdx) => (
                                      <tr key={itemIdx} className="border-t hover:bg-gray-50">
                                        <td className="p-1.5 font-medium">{item.product}</td>
                                        <td className="p-1.5 text-center">{item.supplied_qty}</td>
                                        <td className="p-1.5 text-center">{item.supplied_kg?.toFixed(2)}</td>
                                        <td className="p-1.5 text-right text-green-600">₹{item.revenue?.toLocaleString()}</td>
                                        <td className="p-1.5 text-right text-orange-600">₹{item.cogs?.toLocaleString()}</td>
                                        <td className="p-1.5 text-right text-red-600">
                                          {item.wastage_value > 0 ? `₹${item.wastage_value?.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="p-1.5 text-right text-amber-600">
                                          {item.commission > 0 ? `₹${item.commission?.toLocaleString()}` : '-'}
                                        </td>
                                        <td className={`p-1.5 text-right font-medium ${item.gross_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                          ₹{item.gross_profit?.toLocaleString()}
                                        </td>
                                        <td className="p-1.5 text-right">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                                            item.gross_margin >= 30 ? 'bg-green-100 text-green-700' : 
                                            item.gross_margin >= 15 ? 'bg-blue-100 text-blue-700' :
                                            item.gross_margin >= 0 ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-red-100 text-red-700'
                                          }`}>
                                            {item.gross_margin?.toFixed(1)}%
                                          </span>
                                        </td>
                                        <td className={`p-1.5 text-right ${item.profit_per_qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          ₹{item.profit_per_qty?.toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  No data found for this customer in the selected date range
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-3 border-t bg-gray-50 text-center">
              <Button variant="outline" onClick={() => { setSelectedCustomer(null); setCustomerDetailData(null); }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProduct(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className={`p-4 border-b text-white ${
              productVertical === 'qc' 
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' 
                : productVertical === 'retail'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500'
                  : 'bg-gradient-to-r from-[#14532D] to-green-700'
            }`}>
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Package size={20} />
                    {selectedProduct} - Date-wise Details
                    {productVertical !== 'all' && (
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                        productVertical === 'qc' 
                          ? 'bg-white/20' 
                          : 'bg-white/20'
                      }`}>
                        {productVertical === 'qc' ? 'Quick Commerce' : 'Retail'}
                      </span>
                    )}
                  </h2>
                  <p className="text-white/80 text-xs mt-1">
                    {productDateFrom} to {productDateTo} ({productDetailData.length} days with data)
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="overflow-auto max-h-[calc(85vh-140px)]">
              {loadingProductDetail ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
                </div>
              ) : productDetailData.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left font-medium text-gray-600 text-xs">DATE</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">SALES (₹)</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">SALES QTY</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">AVG SP</th>
                      <th className="p-2 text-right font-medium text-orange-600 text-xs">COGS (₹)</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">COGS QTY</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">AVG PP</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">WASTAGE</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">WASTAGE %</th>
                      {productVertical === 'retail' && (
                        <>
                          <th className="p-2 text-right font-medium text-pink-600 text-xs">REJECTION</th>
                          <th className="p-2 text-right font-medium text-purple-600 text-xs">COMMISSION</th>
                        </>
                      )}
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">GROSS P/L</th>
                      <th className="p-2 text-right font-medium text-gray-600 text-xs">MARGIN %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productDetailData.map((day, idx) => (
                      <tr key={idx} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="p-2 font-medium text-xs">
                          {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                        </td>
                        <td className="p-2 text-right text-green-600 text-xs">₹{day.sales_amount?.toLocaleString()}</td>
                        <td className="p-2 text-right text-xs">{day.sales_qty?.toLocaleString()}</td>
                        <td className="p-2 text-right text-green-700 text-xs font-medium">₹{day.avg_selling_price}</td>
                        <td className="p-2 text-right text-orange-600 text-xs">₹{day.purchase_amount?.toLocaleString()}</td>
                        <td className="p-2 text-right text-xs">{day.purchase_qty?.toLocaleString()} Kg</td>
                        <td className="p-2 text-right text-orange-700 text-xs font-medium">₹{day.avg_purchase_price}</td>
                        <td className="p-2 text-right text-red-600 text-xs">₹{day.wastage_amount?.toLocaleString()}</td>
                        <td className="p-2 text-right text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            day.wastage_pct <= 5 ? 'bg-green-100 text-green-700' : 
                            day.wastage_pct <= 15 ? 'bg-yellow-100 text-yellow-700' : 
                            day.wastage_pct <= 25 ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {day.wastage_pct}%
                          </span>
                        </td>
                        {productVertical === 'retail' && (
                          <>
                            <td className="p-2 text-right text-pink-600 text-xs">
                              <div>₹{(day.rejection_amount || 0).toLocaleString()}</div>
                              <div className="text-[10px] text-pink-500">({(day.rejection_pct || 0).toFixed(1)}%)</div>
                            </td>
                            <td className="p-2 text-right text-purple-600 text-xs">
                              <div>₹{(day.commission_amount || 0).toLocaleString()}</div>
                              <div className="text-[10px] text-purple-500">({day.commission_pct || 20}%)</div>
                            </td>
                          </>
                        )}
                        <td className={`p-2 text-right font-semibold text-xs ${day.gross_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {day.gross_profit >= 0 ? '+' : ''}₹{day.gross_profit?.toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            day.margin >= 20 ? 'bg-green-100 text-green-700' : 
                            day.margin >= 10 ? 'bg-yellow-100 text-yellow-700' : 
                            day.margin >= 0 ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {day.margin}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 font-semibold border-t-2 text-xs">
                    {(() => {
                      const totals = productDetailData.reduce((acc, d) => ({
                        sales: acc.sales + (d.sales_amount || 0),
                        salesQty: acc.salesQty + (d.sales_qty || 0),
                        salesKg: acc.salesKg + (d.sales_kg || 0),  // Use sales_kg for avg SP calculation
                        purchase: acc.purchase + (d.purchase_amount || 0),
                        purchaseQty: acc.purchaseQty + (d.purchase_qty || 0),
                        wastage: acc.wastage + (d.wastage_amount || 0),
                        rejection: acc.rejection + (d.rejection_amount || 0),
                        commission: acc.commission + (d.commission_amount || 0),
                        grossProfit: acc.grossProfit + (d.gross_profit || 0)
                      }), { sales: 0, salesQty: 0, salesKg: 0, purchase: 0, purchaseQty: 0, wastage: 0, rejection: 0, commission: 0, grossProfit: 0 });
                      
                      const avgSP = totals.salesKg > 0 ? (totals.sales / totals.salesKg).toFixed(2) : 0;  // Avg SP per Kg
                      const avgPP = totals.purchaseQty > 0 ? (totals.purchase / totals.purchaseQty).toFixed(2) : 0;
                      const wastagePct = totals.purchase > 0 ? ((totals.wastage / totals.purchase) * 100).toFixed(1) : 0;
                      const rejectionPct = totals.sales > 0 ? ((totals.rejection / totals.sales) * 100).toFixed(1) : 0;
                      const marginPct = totals.sales > 0 ? ((totals.grossProfit / totals.sales) * 100).toFixed(1) : 0;
                      
                      return (
                        <tr>
                          <td className="p-2 font-bold">TOTAL</td>
                          <td className="p-2 text-right text-green-700">₹{totals.sales.toLocaleString()}</td>
                          <td className="p-2 text-right">{totals.salesQty.toLocaleString()}</td>
                          <td className="p-2 text-right text-green-700 font-bold">₹{avgSP}</td>
                          <td className="p-2 text-right text-orange-700">₹{totals.purchase.toLocaleString()}</td>
                          <td className="p-2 text-right">{totals.purchaseQty.toLocaleString()} Kg</td>
                          <td className="p-2 text-right text-orange-700 font-bold">₹{avgPP}</td>
                          <td className="p-2 text-right text-red-700">₹{totals.wastage.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              wastagePct <= 5 ? 'bg-green-100 text-green-700' : 
                              wastagePct <= 15 ? 'bg-yellow-100 text-yellow-700' : 
                              wastagePct <= 25 ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {wastagePct}%
                            </span>
                          </td>
                          {productVertical === 'retail' && (
                            <>
                              <td className="p-2 text-right text-pink-700">
                                <div>₹{totals.rejection.toLocaleString()}</div>
                                <div className="text-[10px]">({rejectionPct}%)</div>
                              </td>
                              <td className="p-2 text-right text-purple-700">
                                <div>₹{totals.commission.toLocaleString()}</div>
                                <div className="text-[10px]">(20%)</div>
                              </td>
                            </>
                          )}
                          <td className={`p-2 text-right ${totals.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            ₹{totals.grossProfit.toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              marginPct >= 20 ? 'bg-green-100 text-green-700' : 
                              marginPct >= 10 ? 'bg-yellow-100 text-yellow-700' : 
                              marginPct >= 0 ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {marginPct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  No data found for this product in the selected date range
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-3 border-t bg-gray-50 text-center">
              <Button variant="outline" onClick={() => setSelectedProduct(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
