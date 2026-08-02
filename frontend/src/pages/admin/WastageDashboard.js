import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { AlertTriangle, TrendingDown, TrendingUp, DollarSign, Scale, Calendar, BarChart3, FileSpreadsheet, RefreshCw, ChevronDown, Printer } from 'lucide-react';

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
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const saved = localStorage.getItem('wastage_selectedPeriod');
    return saved ? parseInt(saved) : 7;
  });
  const [products, setProducts] = useState([]);
  
  // Wastage table sort state (default: wastage_percent desc)
  const [wastageSortField, setWastageSortField] = useState('wastage_percent');
  const [wastageSortAsc, setWastageSortAsc] = useState(false);
  
  // Persist selected period
  useEffect(() => {
    localStorage.setItem('wastage_selectedPeriod', selectedPeriod.toString());
  }, [selectedPeriod]);
  
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
  
  // Date range filter - persist in localStorage
  const [dateFrom, setDateFrom] = useState(() => {
    const saved = localStorage.getItem('wastage_dateFrom');
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() - 30); // Default to 30 days instead of 7
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    const saved = localStorage.getItem('wastage_dateTo');
    if (saved) return saved;
    return new Date().toISOString().split('T')[0];
  });
  
  // Persist date filters
  useEffect(() => {
    localStorage.setItem('wastage_dateFrom', dateFrom);
  }, [dateFrom]);
  
  useEffect(() => {
    localStorage.setItem('wastage_dateTo', dateTo);
  }, [dateTo]);
  
  // Selected date for detailed wastage view - persist in localStorage
  const [selectedWastageDate, setSelectedWastageDate] = useState(() => {
    const saved = localStorage.getItem('wastage_selectedDate');
    if (saved) return saved;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const [selectedDateWastage, setSelectedDateWastage] = useState(null);
  const [loadingSelectedDate, setLoadingSelectedDate] = useState(false);
  const [wastageTab, setWastageTab] = useState('all');  // 'all', 'qc', 'retail'
  
  // Persist selected wastage date
  useEffect(() => {
    localStorage.setItem('wastage_selectedDate', selectedWastageDate);
  }, [selectedWastageDate]);
  
  // Sorted wastage products (mirrors Dashboard.js COGS sort pattern)
  const sortedWastageProducts = useMemo(() => {
    if (!selectedDateWastage?.products) return [];
    const filtered = [...selectedDateWastage.products];
    filtered.sort((a, b) => {
      let aVal, bVal;
      if (wastageSortField === 'product_name') {
        aVal = getProductName(a);
        bVal = getProductName(b);
      } else {
        aVal = a[wastageSortField];
        bVal = b[wastageSortField];
      }
      if (aVal == null) aVal = wastageSortAsc ? Infinity : -Infinity;
      if (bVal == null) bVal = wastageSortAsc ? Infinity : -Infinity;
      if (wastageSortField === 'product_name') {
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
        return wastageSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return wastageSortAsc ? aVal - bVal : bVal - aVal;
    });
    return filtered;
  }, [selectedDateWastage, wastageSortField, wastageSortAsc, getProductName]);

  // Export date range state
  const [exportStartDate, setExportStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exportLanguage, setExportLanguage] = useState('en');
  const [isExporting, setIsExporting] = useState(false);

  // Get product name in specific language
  const getProductNameInLanguage = useCallback((item, lang) => {
    if (!item) return '';
    
    // Try to find the product in our lookup map
    let product = null;
    
    if (item.product_id) {
      product = productMap.get(item.product_id);
    }
    
    if (!product) {
      const itemName = item.product_name || item.name;
      if (itemName) {
        product = productMap.get(itemName);
      }
    }
    
    if (product) {
      if (lang === 'hi' && product.name_hi) return product.name_hi;
      if (lang === 'mr' && product.name_mr) return product.name_mr;
      return product.name;
    }
    
    // Fallback to item's own translated names
    if (lang === 'hi' && item.name_hi) return item.name_hi;
    if (lang === 'mr' && item.name_mr) return item.name_mr;
    
    return item.product_name || item.name || '';
  }, [productMap]);

  // Export wastage data for date range with language support
  const exportWastageByDateRange = async () => {
    if (!exportStartDate || !exportEndDate) {
      toast.error('Please select both start and end dates');
      return;
    }
    
    if (exportStartDate > exportEndDate) {
      toast.error('Start date must be before end date');
      return;
    }
    
    setIsExporting(true);
    try {
      // Generate list of dates between start and end
      const dates = [];
      let currentDate = new Date(exportStartDate);
      const endDate = new Date(exportEndDate);
      
      while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Fetch wastage data for each date
      const allWastageData = [];
      let totalWastageKg = 0;
      let totalWastageValue = 0;
      
      for (const date of dates) {
        try {
          const response = await api.get(`/api/stock-status/wastage-by-date?date=${date}`);
          const dayData = response.data;
          
          if (dayData && dayData.products && dayData.products.length > 0) {
            for (const product of dayData.products) {
              const wastageKg = product.wastage_qty || 0;
              const wastageValue = product.wastage_value || 0;
              
              if (wastageKg > 0) {
                const closingValue = (product.closing_qty || 0) * (product.cogs_price || 0);
                allWastageData.push({
                  date: date,
                  product_name: getProductNameInLanguage(product, exportLanguage),
                  opening_qty: product.opening_qty || 0,
                  purchase_qty: product.purchase_qty || 0,
                  dispatch_qty: product.dispatch_qty || 0,
                  closing_qty: product.closing_qty || 0,
                  closing_value: closingValue,
                  wastage_qty: wastageKg,
                  wastage_value: wastageValue,
                  wastage_percent: product.wastage_percent || 0
                });
                
                totalWastageKg += wastageKg;
                totalWastageValue += wastageValue;
              }
            }
          }
        } catch (err) {
          console.warn(`No data for ${date}:`, err.message);
        }
      }
      
      if (allWastageData.length === 0) {
        toast.warning('No wastage data found for the selected date range');
        setIsExporting(false);
        return;
      }
      
      // Column headers in selected language
      const headers = {
        en: ['Date', 'Product', 'Opening (Kg)', 'Purchase (Kg)', 'Dispatch (Kg)', 'Closing (Kg)', 'Closing Value (₹)', 'Wastage (Kg)', 'Wastage Value (₹)', 'Wastage %'],
        hi: ['तारीख', 'उत्पाद', 'प्रारंभिक (किलो)', 'खरीद (किलो)', 'डिस्पैच (किलो)', 'समापन (किलो)', 'समापन मूल्य (₹)', 'बर्बादी (किलो)', 'बर्बादी मूल्य (₹)', 'बर्बादी %'],
        mr: ['तारीख', 'उत्पादन', 'सुरुवातीचा (किलो)', 'खरेदी (किलो)', 'डिस्पॅच (किलो)', 'शेवटचा (किलो)', 'शेवटचा मूल्य (₹)', 'नासाडी (किलो)', 'नासाडी मूल्य (₹)', 'नासाडी %']
      };
      
      const totalLabels = {
        en: 'TOTAL',
        hi: 'कुल',
        mr: 'एकूण'
      };
      
      // Build CSV content
      const csvHeaders = headers[exportLanguage] || headers.en;
      const rows = allWastageData.map(row => [
        row.date,
        `"${row.product_name.replace(/"/g, '""')}"`,
        row.opening_qty.toFixed(2),
        row.purchase_qty.toFixed(2),
        row.dispatch_qty.toFixed(2),
        row.closing_qty.toFixed(2),
        row.closing_value.toFixed(2),
        row.wastage_qty.toFixed(2),
        row.wastage_value.toFixed(2),
        `${row.wastage_percent.toFixed(2)}%`
      ].join(','));
      
      // Add total row
      const totalClosingValue = allWastageData.reduce((sum, row) => sum + (row.closing_value || 0), 0);
      const totalRow = [
        totalLabels[exportLanguage] || 'TOTAL',
        '-',
        '-',
        '-',
        '-',
        '-',
        totalClosingValue.toFixed(2),
        totalWastageKg.toFixed(2),
        totalWastageValue.toFixed(2),
        '-'
      ].join(',');
      
      const csvContent = [csvHeaders.join(','), ...rows, totalRow].join('\n');
      
      // Add BOM for UTF-8 encoding (important for Hindi/Marathi)
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `wastage_${exportStartDate}_to_${exportEndDate}_${exportLanguage}.csv`;
      link.click();
      
      toast.success(`Exported ${allWastageData.length} records (${dates.length} days)`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export wastage data');
    } finally {
      setIsExporting(false);
    }
  };

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [wastageRes, productsRes] = await Promise.all([
        api.get(`/api/stock-status/wastage-dashboard?from_date=${dateFrom}&to_date=${dateTo}`),
        api.get('/api/products?include_images=false')
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
  const loadSelectedDateWastage = useCallback(async (date, tab = 'all') => {
    setLoadingSelectedDate(true);
    try {
      const response = await api.get(`/api/stock-status/wastage-by-date?date=${date}&tab=${tab}`);
      setSelectedDateWastage(response.data);
    } catch (error) {
      console.error('Load selected date wastage error:', error);
      // Fallback: if no specific endpoint, try to get from dashboard data
      setSelectedDateWastage(null);
    } finally {
      setLoadingSelectedDate(false);
    }
  }, []);
  
  // Load selected date wastage when date or tab changes
  useEffect(() => {
    loadSelectedDateWastage(selectedWastageDate, wastageTab);
  }, [selectedWastageDate, wastageTab, loadSelectedDateWastage]);

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

  // Recalculate wastage quantities for selected date
  const [recalculating, setRecalculating] = useState(false);
  const recalculateWastage = async () => {
    if (!window.confirm(`This will recalculate wastage quantities for ${selectedWastageDate} based on current stock values (Opening + Purchase - Dispatch - Closing). Continue?`)) {
      return;
    }
    
    setRecalculating(true);
    try {
      const response = await api.post(`/api/stock-status/recalculate-wastage?date=${selectedWastageDate}`);
      const data = response.data;
      if (data.updates && data.updates.length > 0) {
        toast.success(`Recalculated ${data.updates.length} products`);
      } else {
        toast.info('No wastage changes needed');
      }
      // Reload data
      loadDashboardData();
      loadSelectedDateWastage(selectedWastageDate, wastageTab);
    } catch (error) {
      console.error('Recalculate wastage error:', error);
      toast.error(error.response?.data?.detail || 'Failed to recalculate wastage');
    } finally {
      setRecalculating(false);
    }
  };

  // Print wastage table for selected date
  const printWastageTable = () => {
    if (!selectedDateWastage || !selectedDateWastage.products?.length) {
      toast.error('No wastage data to print');
      return;
    }

    const products = [...selectedDateWastage.products]
      .sort((a, b) => (b.wastage_percent || 0) - (a.wastage_percent || 0));

    // Calculate totals - separate Kg and Dozen
    const kgProducts = products.filter(p => (p.unit || 'Kg') !== 'Dozen');
    const dozenProducts = products.filter(p => (p.unit || 'Kg') === 'Dozen');
    const totalWastageKg = kgProducts.reduce((sum, p) => sum + (p.wastage_qty || 0), 0);
    const totalWastageDozen = dozenProducts.reduce((sum, p) => sum + (p.wastage_qty || 0), 0);
    const totalWastageValue = products.reduce((sum, p) => sum + (p.wastage_value || 0), 0);
    const totalClosingValue = products.reduce((sum, p) => sum + ((p.closing_qty || 0) * (p.cogs_price || 0)), 0);

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Wastage Report - ${selectedWastageDate}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #333; margin-bottom: 5px; }
          h2 { text-align: center; color: #666; margin-top: 5px; font-size: 14px; font-weight: normal; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th { background-color: #fef2f2; color: #b91c1c; padding: 8px; text-align: right; border: 1px solid #fecaca; }
          th:first-child { text-align: left; }
          th:nth-child(2) { text-align: center; }
          td { padding: 8px; border: 1px solid #e5e7eb; text-align: right; }
          td:first-child { text-align: left; font-weight: 500; }
          td:nth-child(2) { text-align: center; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .dozen-row { background-color: #fffbeb; }
          .unit-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; }
          .unit-kg { background-color: #f3f4f6; color: #4b5563; }
          .unit-dozen { background-color: #fef3c7; color: #b45309; }
          .total-row { background-color: #fef2f2; font-weight: bold; }
          .summary { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 11px; color: #666; margin-bottom: 4px; }
          .summary-value { font-size: 18px; font-weight: bold; color: #dc2626; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Mr Organix - Wastage Report</h1>
        <h2>Date: ${new Date(selectedWastageDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</h2>
        
        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Total Wastage (Kg)</div>
            <div class="summary-value">${totalWastageKg.toFixed(2)} Kg</div>
          </div>
          ${totalWastageDozen > 0 ? `
          <div class="summary-item">
            <div class="summary-label">Total Wastage (Dozen)</div>
            <div class="summary-value" style="color: #b45309;">${totalWastageDozen.toFixed(1)} Dzn</div>
          </div>
          ` : ''}
          <div class="summary-item">
            <div class="summary-label">Total Value Lost</div>
            <div class="summary-value">₹${totalWastageValue.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Closing Value</div>
            <div class="summary-value">₹${totalClosingValue.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Products</div>
            <div class="summary-value">${products.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Unit</th>
              <th>Opening</th>
              <th>Purchase</th>
              <th>Dispatch</th>
              <th>Closing</th>
              <th>Closing Value</th>
              <th>Wastage</th>
              <th>Value (₹)</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(product => {
              const closingValue = (product.closing_qty || 0) * (product.cogs_price || 0);
              const unit = product.unit || 'Kg';
              const isDozen = unit === 'Dozen';
              return `
                <tr class="${isDozen ? 'dozen-row' : ''}">
                  <td>${product.product_name || 'Unknown'}</td>
                  <td><span class="unit-badge ${isDozen ? 'unit-dozen' : 'unit-kg'}">${unit}</span></td>
                  <td>${(product.opening_qty || 0).toFixed(1)}</td>
                  <td class="positive">+${(product.purchase_qty || 0).toFixed(1)}</td>
                  <td class="negative">${(product.dispatch_qty || 0) > 0 ? '-' : ''}${(product.dispatch_qty || 0).toFixed(1)}</td>
                  <td>${(product.closing_qty || 0).toFixed(1)}</td>
                  <td>₹${Math.round(closingValue).toLocaleString()}</td>
                  <td class="negative">${(product.wastage_qty || 0).toFixed(2)}${isDozen ? ' Dzn' : ''}</td>
                  <td class="negative">₹${Math.round(product.wastage_value || 0).toLocaleString()}</td>
                  <td class="negative">${(product.wastage_percent || 0).toFixed(1)}%</td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td>Total (${products.length} products)</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>₹${Math.round(totalClosingValue).toLocaleString()}</td>
              <td>${totalWastageKg.toFixed(2)} Kg${totalWastageDozen > 0 ? ` + ${totalWastageDozen.toFixed(1)} Dzn` : ''}</td>
              <td>₹${Math.round(totalWastageValue).toLocaleString()}</td>
              <td>-</td>
            </tr>
          </tbody>
        </table>
        
        <p style="text-align: center; margin-top: 30px; color: #999; font-size: 10px;">
          Generated on ${new Date().toLocaleString('en-IN')}
        </p>
        
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Fix historical wastage values - useful when wastage_value is 0 for items without purchases
  const [fixingWastage, setFixingWastage] = useState(false);
  const fixHistoricalWastageValues = async () => {
    if (!window.confirm('This will re-sync ALL historical records using LIVE data:\n\n1. Fix opening stock chain (opening = previous day\'s closing)\n2. Recalculate purchase_qty from procurements\n3. Recalculate dispatch_qty with combo decomposition\n4. Recalculate wastage_qty and wastage_value using COGS pricing\n\nThis may take a minute. Continue?')) {
      return;
    }
    
    setFixingWastage(true);
    toast.info('Processing... This may take up to a minute for large datasets.');
    
    try {
      // Use longer timeout for this operation (2 minutes)
      const response = await api.post('/api/stock-status/fix-all-wastage-values', {}, {
        timeout: 120000  // 2 minute timeout
      });
      const data = response.data;
      toast.success(data.message || `Fixed ${data.total_fixed} records`);
      // Reload data
      loadDashboardData();
      loadSelectedDateWastage(selectedWastageDate, wastageTab);
    } catch (error) {
      console.error('Fix wastage error:', error);
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        toast.error('Request timed out. The operation may still be running in the background. Please refresh the page in a minute.');
      } else {
        toast.error(error.response?.data?.detail || 'Failed to fix wastage values. Please try again.');
      }
    } finally {
      setFixingWastage(false);
    }
  };

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
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={fixHistoricalWastageValues}
                    disabled={fixingWastage}
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    title="Fix wastage values for items without purchases using historical prices"
                  >
                    {fixingWastage ? (
                      <RefreshCw size={14} className="mr-1 animate-spin" />
                    ) : (
                      <RefreshCw size={14} className="mr-1" />
                    )}
                    Fix Historical Values
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
              
              {/* Export Section with Date Range and Language */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <FileSpreadsheet size={16} className="text-blue-600" />
                <span className="text-sm font-medium text-blue-700">Export:</span>
                <Input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="w-36 h-8 text-sm"
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="w-36 h-8 text-sm"
                />
                <select
                  value={exportLanguage}
                  onChange={(e) => setExportLanguage(e.target.value)}
                  className="h-8 px-2 text-sm border rounded-md bg-white"
                >
                  <option value="en">English</option>
                  <option value="hi">हिंदी (Hindi)</option>
                  <option value="mr">मराठी (Marathi)</option>
                </select>
                <Button 
                  size="sm" 
                  onClick={exportWastageByDateRange}
                  disabled={isExporting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw size={14} className="mr-1 animate-spin" /> Exporting...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet size={14} className="mr-1" /> Download Excel
                    </>
                  )}
                </Button>
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
              <Button
                size="sm"
                variant="outline"
                onClick={recalculateWastage}
                disabled={recalculating || loadingSelectedDate}
                className="border-blue-300 text-blue-700 hover:bg-blue-50 h-8 text-xs"
                title="Recalculate wastage based on current stock values"
              >
                {recalculating ? (
                  <RefreshCw size={12} className="mr-1 animate-spin" />
                ) : (
                  <RefreshCw size={12} className="mr-1" />
                )}
                Recalculate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={printWastageTable}
                disabled={loadingSelectedDate || !selectedDateWastage?.products?.length}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 h-8 text-xs"
                title="Print wastage table"
              >
                <Printer size={12} className="mr-1" />
                Print
              </Button>
              {selectedDateWastage && (
                <span className="text-sm text-red-600 font-semibold">
                  Total: ₹{selectedDateWastage.total_wastage_value?.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        
        {/* Subtabs for All/QC/Retail */}
        <div className="px-6 py-2 border-b">
          <div className="flex gap-1">
            <button
              onClick={() => setWastageTab('all')}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                wastageTab === 'all'
                  ? 'bg-red-100 text-red-700 border-b-2 border-red-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All
              {selectedDateWastage && (
                <span className="ml-1.5 text-xs">
                  ({selectedDateWastage.all_wastage_kg?.toFixed(1) || 0} kg)
                </span>
              )}
            </button>
            <button
              onClick={() => setWastageTab('qc')}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                wastageTab === 'qc'
                  ? 'bg-purple-100 text-purple-700 border-b-2 border-purple-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              QC
              {selectedDateWastage && (
                <span className="ml-1.5 text-xs">
                  ({selectedDateWastage.qc_wastage_kg?.toFixed(1) || 0} kg)
                </span>
              )}
            </button>
            <button
              onClick={() => setWastageTab('retail')}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                wastageTab === 'retail'
                  ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Retail
              {selectedDateWastage && (
                <span className="ml-1.5 text-xs">
                  ({selectedDateWastage.retail_wastage_kg?.toFixed(1) || 0} kg)
                </span>
              )}
            </button>
          </div>
        </div>
        
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
                    <th className="p-2 text-left font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'product_name') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('product_name'); setWastageSortAsc(true); }
                        }}>
                      Product {wastageSortField === 'product_name' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-center font-medium text-red-700 w-16">
                      Unit
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'opening_qty') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('opening_qty'); setWastageSortAsc(true); }
                        }}>
                      Opening {wastageSortField === 'opening_qty' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'purchase_qty') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('purchase_qty'); setWastageSortAsc(true); }
                        }}>
                      Purchase {wastageSortField === 'purchase_qty' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'dispatch_qty') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('dispatch_qty'); setWastageSortAsc(true); }
                        }}>
                      Dispatch {wastageSortField === 'dispatch_qty' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'closing_qty') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('closing_qty'); setWastageSortAsc(true); }
                        }}>
                      Closing {wastageSortField === 'closing_qty' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'closing_value') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('closing_value'); setWastageSortAsc(true); }
                        }}>
                      Closing Value {wastageSortField === 'closing_value' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'wastage_qty') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('wastage_qty'); setWastageSortAsc(true); }
                        }}>
                      Wastage {wastageSortField === 'wastage_qty' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'wastage_value') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('wastage_value'); setWastageSortAsc(true); }
                        }}>
                      Value (₹) {wastageSortField === 'wastage_value' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                    <th className="p-2 text-right font-medium text-red-700 cursor-pointer hover:bg-red-100"
                        onClick={() => {
                          if (wastageSortField === 'wastage_percent') setWastageSortAsc(!wastageSortAsc);
                          else { setWastageSortField('wastage_percent'); setWastageSortAsc(true); }
                        }}>
                      % {wastageSortField === 'wastage_percent' && (wastageSortAsc ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWastageProducts.map((product, idx) => {
                    const unit = product.unit || 'Kg';
                    const isDozen = unit === 'Dozen';
                    return (
                      <tr key={idx} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isDozen ? 'bg-amber-50' : ''}`}>
                        <td className="p-2 font-medium">{getProductName(product)}</td>
                        <td className="p-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isDozen ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                            {unit}
                          </span>
                        </td>
                        <td className="p-2 text-right">{product.opening_qty?.toFixed(1)}</td>
                        <td className="p-2 text-right text-green-600">+{product.purchase_qty?.toFixed(1)}</td>
                        <td className="p-2 text-right text-blue-600">-{product.dispatch_qty?.toFixed(1)}</td>
                        <td className="p-2 text-right">{product.closing_qty?.toFixed(1)}</td>
                        <td className="p-2 text-right text-purple-600">₹{(product.closing_value || (product.closing_qty * (product.cogs_price || 0)))?.toFixed(0)}</td>
                        <td className="p-2 text-right text-red-600 font-semibold">
                          {product.wastage_qty?.toFixed(2)} {isDozen ? 'Dzn' : ''}
                        </td>
                        <td className="p-2 text-right text-red-600">₹{product.wastage_value?.toFixed(0)}</td>
                        <td className="p-2 text-right">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getWastageColor(product.wastage_percent)}`}>
                            {product.wastage_percent?.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-red-100 font-semibold">
                  <tr>
                    <td className="p-2">Total ({selectedDateWastage.products.length} products)</td>
                    <td className="p-2 text-center">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right text-purple-700">₹{selectedDateWastage.products.reduce((sum, p) => sum + (p.closing_value || (p.closing_qty * (p.cogs_price || 0)) || 0), 0).toFixed(0)}</td>
                    <td className="p-2 text-right text-red-700">
                      {selectedDateWastage.total_wastage_kg?.toFixed(2)} Kg
                      {(selectedDateWastage.total_wastage_dozen || 0) > 0 && (
                        <span className="ml-1 text-amber-700">+ {selectedDateWastage.total_wastage_dozen?.toFixed(1)} Dzn</span>
                      )}
                    </td>
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
