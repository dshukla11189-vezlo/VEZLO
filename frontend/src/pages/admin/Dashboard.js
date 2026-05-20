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
  BarChart3, PieChart, ChevronDown, ChevronRight, Truck, Clock, Zap, Languages, X, Download, FileSpreadsheet, Building2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart as RePieChart, Pie, Cell } from 'recharts';

const COLORS = ['#14532D', '#D97706', '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B', '#6366F1'];

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
      
      // Find this customer's data from the customer_pnl list to get all financial details
      const customerPnlEntry = customerPnlList.find(c => 
        c.customer?.toLowerCase() === customerName.toLowerCase()
      );
      const customerType = customerPnlEntry?.type || 'QC';
      const grnLossShare = customerPnlEntry?.grn_loss_share || 0;
      const rejectionShare = customerPnlEntry?.rejection_share || 0;
      // NEW: Get variable expenses, fixed expenses, and commission from customer_pnl
      const variableExpenses = customerPnlEntry?.variable_expenses || 0;
      const fixedExpenses = customerPnlEntry?.fixed_expenses || 0;
      const commissionFromPnl = customerPnlEntry?.commission || 0;
      const customerNetProfit = customerPnlEntry?.net_profit || 0;
      const customerNetMargin = customerPnlEntry?.net_margin_pct || 0;
      
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
        const grossProfit = customerItems.reduce((sum, item) => sum + (item.gross_profit || 0), 0);
        const grossMargin = sales > 0 ? (grossProfit / sales * 100) : 0;
        const profitPerUnit = qty > 0 ? (grossProfit / qty) : 0;
        
        return {
          date: day.date,
          sales,
          qty,
          kg,
          purchase,
          wastage,
          commission,
          grossProfit,
          grossMargin,
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
        commission: acc.commission + day.commission,
        grossProfit: acc.grossProfit + day.grossProfit
      }), { sales: 0, qty: 0, kg: 0, purchase: 0, wastage: 0, commission: 0, grossProfit: 0 });
      
      // For Retail customers, the line-item gross_profit doesn't include rejection
      // We need to subtract rejection_share to get the TRUE gross profit that matches dashboard
      // Gross Profit (Retail) = Sum of line_item profits - Rejection Loss
      const adjustedGrossProfit = customerType === 'Retail' 
        ? totals.grossProfit - rejectionShare 
        : totals.grossProfit;
      
      totals.grossMargin = totals.sales > 0 ? (adjustedGrossProfit / totals.sales * 100) : 0;
      totals.profitPerUnit = totals.qty > 0 ? (adjustedGrossProfit / totals.qty) : 0;
      totals.customerType = customerType;
      totals.grnLossShare = grnLossShare;
      totals.rejectionShare = rejectionShare;
      // Add variable expenses and commission from customer_pnl
      totals.variableExpenses = variableExpenses;
      totals.commissionFromPnl = commissionFromPnl;
      
      // CORRECT FORMULA for Retail customers:
      // Gross P/L = Sales - Purchase - Wastage - Rejection
      totals.grossProfit = Math.round((totals.sales - totals.purchase - totals.wastage - rejectionShare) * 100) / 100;
      
      // Net P/L calculation differs by customer type:
      // For Retail: Net P/L = Gross P/L - Commission - Variable Expenses
      // For QC: Net P/L = Gross P/L - GRN Loss - Variable Expenses
      if (customerType === 'QC') {
        totals.netProfit = Math.round((totals.grossProfit - grnLossShare - variableExpenses) * 100) / 100;
      } else {
        totals.netProfit = Math.round((totals.grossProfit - commissionFromPnl - variableExpenses) * 100) / 100;
      }
      totals.netMarginPct = totals.sales > 0 ? Math.round((totals.netProfit / totals.sales * 100) * 10) / 10 : 0;
      
      // Calculate period days for Daily Avg (use total calendar days, not active days)
      // This ensures customer Daily Avgs sum up to match dashboard Daily Avg
      const periodDays = calculateDaysBetween(customerDetailDateFrom, customerDetailDateTo);
      
      setCustomerDetailData({
        daily: customerDailyData,
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
      const [pnlResponse, productsResponse] = await Promise.all([
        api.get(`/api/reports/pnl?from_date=${productDateFrom}&to_date=${productDateTo}`),
        api.get('/api/products?include_images=false')
      ]);
      
      const dailyPnl = pnlResponse.data?.daily_pnl || [];
      
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
      
      // Aggregate product data from line_items across all days
      // This gives us correct COGS instead of total procurement
      const productAggregates = {};
      
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
          
          if (!productAggregates[productName]) {
            productAggregates[productName] = {
              product: productName,
              sales_amount: 0,
              sales_qty: 0,
              purchase_amount: 0,  // COGS (actual consumed cost)
              purchase_qty: 0,     // Supplied Kg
              wastage_amount: 0,
            };
          }
          
          const agg = productAggregates[productName];
          agg.sales_amount += item.revenue || 0;
          agg.sales_qty += item.supplied_qty || 0;
          agg.purchase_amount += item.cogs || 0;  // Use COGS, not total procurement
          agg.purchase_qty += item.supplied_kg || 0;
          agg.wastage_amount += item.wastage_value || 0;
        });
      });
      
      // Calculate profit, margin, and profit_per_unit for each product
      const productsWithProfit = Object.values(productAggregates).map(p => {
        // Gross P/L = Sales - COGS - Wastage
        const profit = p.sales_amount - p.purchase_amount - p.wastage_amount;
        const margin = p.sales_amount > 0 ? (profit / p.sales_amount) * 100 : 0;
        const profit_per_unit = p.sales_qty > 0 ? profit / p.sales_qty : 0;
        
        return {
          ...p,
          profit,
          margin,
          profit_per_unit
        };
      });
      
      // Sort by Gross P/L descending
      const sortedProducts = productsWithProfit.sort((a, b) => (b.profit || 0) - (a.profit || 0));
      setProductPnlData(sortedProducts);
    } catch (error) {
      console.error('Failed to load product P&L:', error);
      toast.error('Failed to load product P&L data');
    } finally {
      setLoadingProductPnl(false);
    }
  }, [productDateFrom, productDateTo]);

  // Load product P&L when tab is products and dates change
  useEffect(() => {
    if (activeTab === 'products') {
      loadProductPnlData();
    }
  }, [activeTab, loadProductPnlData]);

  // Load product detail (date-wise breakdown)
  const loadProductDetail = useCallback(async (productName) => {
    if (!productName) return;
    setSelectedProduct(productName);
    setLoadingProductDetail(true);
    
    try {
      const [pnlResponse, productsResponse] = await Promise.all([
        api.get(`/api/reports/pnl?from_date=${productDateFrom}&to_date=${productDateTo}`),
        api.get('/api/products?include_images=false')
      ]);
      const dailyPnl = pnlResponse.data?.daily_pnl || [];
      
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
        
        // Get line items for this product AND any aliased products
        const productLineItems = lineItems.filter(item => aliasedProducts.includes(item.product));
        
        // Also check for unsold wastage for this product
        const productUnsoldWastage = unsoldWastage.filter(item => aliasedProducts.includes(item.product));
        
        // If no line items AND no unsold wastage, skip this day
        if (productLineItems.length === 0 && productUnsoldWastage.length === 0) return;
        
        // Aggregate data from line items (sales data)
        const salesAmt = productLineItems.reduce((sum, item) => sum + (item.revenue || 0), 0);
        const salesQty = productLineItems.reduce((sum, item) => sum + (item.supplied_qty || 0), 0);
        const salesKg = productLineItems.reduce((sum, item) => sum + (item.supplied_kg || 0), 0);
        const cogsAmt = productLineItems.reduce((sum, item) => sum + (item.cogs || 0), 0);
        let wastageAmt = productLineItems.reduce((sum, item) => sum + (item.wastage_value || 0), 0);
        
        // Add unsold wastage (products with wastage but no sales)
        const unsoldWastageAmt = productUnsoldWastage.reduce((sum, item) => sum + (item.value || 0), 0);
        wastageAmt += unsoldWastageAmt;
        
        // Calculate Gross P/L: Sales - COGS - Wastage
        const grossProfit = salesAmt - cogsAmt - wastageAmt;
        const marginPct = salesAmt > 0 ? (grossProfit / salesAmt) * 100 : 0;
        
        // Calculate average prices
        const avgPurchasePrice = salesKg > 0 ? cogsAmt / salesKg : 0;
        
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

  if (loading) {
    return (
      <Layout title={t('app.dashboard')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
        </div>
      </Layout>
    );
  }

  const summary = pnlData?.summary || {};
  const dailyPnlRaw = pnlData?.daily_pnl || [];
  // Sort by date descending (latest date on top)
  const dailyPnl = [...dailyPnlRaw].sort((a, b) => new Date(b.date) - new Date(a.date));
  const customerPnl = pnlData?.customer_pnl || [];
  const productPnl = pnlData?.product_pnl || [];
  const expenses = pnlData?.expenses || {};
  const purchaseByFarmer = pnlData?.purchase_by_farmer || [];

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
                  <p className="text-lg font-bold text-green-900">{formatCurrency(summary.total_sales)}</p>
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
                    <p className="text-sm font-bold text-emerald-900">{formatCurrency(pnlData.vertical_bifurcation.retail.sales)}</p>
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
                    <p className="text-[9px] text-rose-600 font-medium">REJECTION</p>
                    <p className="text-sm font-bold text-rose-700">{formatCurrency(pnlData.vertical_bifurcation.retail.rejection || 0)}</p>
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
            { key: 'costs', label: 'Costs', icon: '💰' }
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
                          
                          // Retail aggregates - use data from API including rejection/commission
                          const retailSales = day.retail_gross_mrp || day.retail_sales || retailItems.reduce((sum, i) => sum + (i.revenue || 0), 0);
                          const retailQty = retailItems.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                          const retailPurchase = day.retail_cogs || retailItems.reduce((sum, i) => sum + (i.cogs || 0), 0);
                          const retailWastage = retailItems.reduce((sum, i) => sum + (i.wastage_value || 0), 0);
                          const retailRejection = day.retail_rejection || 0;
                          const retailCommission = day.retail_commission || 0;
                          const retailGross = retailSales - retailPurchase - retailWastage - retailRejection - retailCommission;
                          const retailMargin = retailSales > 0 ? (retailGross / retailSales * 100) : 0;
                          
                          // Day total (rejection and commission only apply to retail)
                          // Calculate day purchase from line items COGS, not procurement
                          const dayPurchase = qcPurchase + retailPurchase;
                          const dayWastage = qcWastage + retailWastage;
                          const dayRejection = retailRejection;
                          const dayCommission = retailCommission;
                          const dayGrossWithDeductions = day.sales - dayPurchase - dayWastage - dayRejection - dayCommission;
                          const dayMarginWithDeductions = day.sales > 0 ? (dayGrossWithDeductions / day.sales * 100) : 0;
                          
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
                                <td className="p-2 text-right text-red-500">{dayRejection > 0 ? `-₹${dayRejection.toLocaleString()}` : '-'}</td>
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
                                          </span>
                                        </td>
                                        <td className="p-2 text-right text-emerald-700 font-medium">₹{retailSales.toLocaleString()}</td>
                                        <td className="p-2 text-right text-emerald-600">{retailQty.toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-orange-600">₹{retailPurchase.toLocaleString()}</td>
                                        <td className="p-2 text-right text-gray-400">-</td>
                                        <td className="p-2 text-right text-red-600">₹{retailWastage.toLocaleString()}</td>
                                        <td className="p-2 text-right text-red-500">{retailRejection > 0 ? `-₹${retailRejection.toLocaleString()}` : '-'}</td>
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
                                        // For Retail customers, distribute rejection proportionally
                                        // (or fully if there's only one customer)
                                        const numRetailCustomers = Object.keys(retailByCustomer).length;
                                        const custRejection = numRetailCustomers === 1 ? retailRejection : (custSales / retailSales) * retailRejection;
                                        const custGross = custSales - custPurchase - custWastage - custRejection - custCommission;
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
                                              <td className="p-2 text-right text-emerald-600 text-sm">₹{custSales.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-600 text-sm">{custQty.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-orange-500 text-sm">₹{custPurchase.toLocaleString()}</td>
                                              <td className="p-2 text-right text-gray-400 text-sm">-</td>
                                              <td className="p-2 text-right text-red-500 text-sm">₹{custWastage.toLocaleString()}</td>
                                              <td className="p-2 text-right text-red-500 text-sm">{custRejection > 0 ? `-₹${custRejection.toLocaleString()}` : '-'}</td>
                                              <td className="p-2 text-right text-amber-500 text-sm">{custCommission > 0 ? `-₹${custCommission.toLocaleString()}` : '-'}</td>
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
                                              const itemGross = item.gross_profit || 0;
                                              const itemCommission = item.commission || 0;
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
                                                  <td className="p-2 text-right text-amber-500 text-sm">{itemCommission > 0 ? `-₹${itemCommission.toFixed(2)}` : '-'}</td>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Customer Sales Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users size={16} /> Customer-wise Sales
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customerPnl.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={customerPnl.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `₹${v/1000}K`} fontSize={10} />
                      <YAxis type="category" dataKey="customer" width={120} fontSize={10} />
                      <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, 'Sales']} />
                      <Bar dataKey="sales_amount" fill="#14532D" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">
                    No customer data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer Summary */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Top Customers</CardTitle>
                <p className="text-[10px] text-gray-500 mt-1">Click customer name for detailed breakdown</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[350px] overflow-y-auto">
                  {customerPnl.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border-b hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <p 
                            className="font-medium text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                            onClick={() => openCustomerDetail(c.customer)}
                          >
                            {c.customer}
                          </p>
                          <p className="text-[10px] text-gray-500">{c.invoices} invoices</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-700">₹{c.sales_amount.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">{c.sales_qty} units</p>
                      </div>
                    </div>
                  ))}
                  {customerPnl.length === 0 && (
                    <div className="p-4 text-center text-gray-400">No customers</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'products' && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Package size={16} /> Product-wise P&L
                  <span className="text-xs font-normal text-gray-500">(Sorted by Gross P/L)</span>
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
                      <th className="p-2.5 text-right font-medium text-gray-600">GROSS P/L</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">MARGIN %</th>
                      <th className="p-2.5 text-right font-medium text-gray-600">₹/UNIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPnlData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-4 text-center text-gray-400">No products</td>
                      </tr>
                    ) : (
                      productPnlData.map((p, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2.5 font-medium">
                            <button 
                              onClick={() => loadProductDetail(p.product)}
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
      </div>

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                  <p className="text-[10px] text-gray-500 font-medium">REJECTION</p>
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
                      <th className="p-2 text-right font-medium text-orange-600">PURCHASE</th>
                      <th className="p-2 text-right font-medium text-red-600">WASTAGE</th>
                      <th className="p-2 text-right font-medium text-amber-600">COMMISSION</th>
                      <th className="p-2 text-right font-medium text-gray-600">GROSS P/L</th>
                      <th className="p-2 text-right font-medium text-gray-600">GM %</th>
                      <th className="p-2 text-right font-medium text-gray-600">₹/UNIT</th>
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
                          <td className="p-2 text-right text-orange-600">₹{day.purchase.toLocaleString()}</td>
                          <td className="p-2 text-right text-red-600">{day.wastage > 0 ? `₹${day.wastage.toLocaleString()}` : '-'}</td>
                          <td className="p-2 text-right text-amber-600">{day.commission > 0 ? `₹${day.commission.toLocaleString()}` : '-'}</td>
                          <td className={`p-2 text-right font-semibold ${day.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            ₹{day.grossProfit.toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              day.grossMargin >= 30 ? 'bg-green-100 text-green-700' : 
                              day.grossMargin >= 15 ? 'bg-blue-100 text-blue-700' :
                              day.grossMargin >= 0 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {day.grossMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className={`p-2 text-right ${day.profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ₹{day.profitPerUnit.toFixed(2)}
                          </td>
                        </tr>
                        {/* Product-wise breakdown row */}
                        {expandedCustomerDates[day.date] && day.items && day.items.length > 0 && (
                          <tr className="bg-blue-50/50">
                            <td colSpan={10} className="p-2">
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
            <div className="p-4 border-b bg-gradient-to-r from-[#14532D] to-green-700 text-white">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Package size={20} />
                    {selectedProduct} - Date-wise Details
                  </h2>
                  <p className="text-green-100 text-xs mt-1">
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
                        grossProfit: acc.grossProfit + (d.gross_profit || 0)
                      }), { sales: 0, salesQty: 0, salesKg: 0, purchase: 0, purchaseQty: 0, wastage: 0, grossProfit: 0 });
                      
                      const avgSP = totals.salesKg > 0 ? (totals.sales / totals.salesKg).toFixed(2) : 0;  // Avg SP per Kg
                      const avgPP = totals.purchaseQty > 0 ? (totals.purchase / totals.purchaseQty).toFixed(2) : 0;
                      const wastagePct = totals.purchase > 0 ? ((totals.wastage / totals.purchase) * 100).toFixed(1) : 0;
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
