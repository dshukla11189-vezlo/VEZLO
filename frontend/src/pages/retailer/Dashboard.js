import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Package, Truck, DollarSign, AlertTriangle, Plus, X, Minus,
  TrendingUp, Clock, CheckCircle, FileText, Download,
  ChevronDown, ChevronRight, Calendar, ShoppingBag, BarChart3,
  ClipboardList, Save, Trash2, RefreshCw, Pencil, Search, Check, Edit2,
  Menu, User, IndianRupee, Wallet, CreditCard, BoxesIcon, LogOut, ImageIcon, ZoomIn,
  ShoppingCart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

// Lazy loading image component - only loads image when visible in viewport
// Optimized for performance: only loads images when they enter the viewport
// Includes robust error handling and memory cleanup
const LazyImage = ({ src, alt, className, onError, onClick }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);
  const isMounted = useRef(true);
  
  useEffect(() => {
    isMounted.current = true;
    
    // Early return for empty/invalid src
    if (!src || typeof src !== 'string' || src.trim() === '') {
      return;
    }
    
    // Skip IntersectionObserver if not supported (fallback to immediate load)
    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }
    
    try {
      // Create intersection observer to detect when image enters viewport
      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting && isMounted.current) {
            setIsVisible(true);
            // Disconnect after first intersection to save memory
            if (observerRef.current) {
              observerRef.current.disconnect();
              observerRef.current = null;
            }
          }
        },
        { 
          rootMargin: '100px', // Start loading 100px before entering viewport
          threshold: 0.01 
        }
      );
      
      if (imgRef.current && observerRef.current) {
        observerRef.current.observe(imgRef.current);
      }
    } catch (err) {
      // Fallback if observer fails
      console.warn('IntersectionObserver error, falling back to immediate load:', err);
      if (isMounted.current) {
        setIsVisible(true);
      }
    }
    
    // Cleanup on unmount
    return () => {
      isMounted.current = false;
      if (observerRef.current) {
        try {
          observerRef.current.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
        observerRef.current = null;
      }
    };
  }, [src]);
  
  const handleLoad = () => {
    if (isMounted.current) {
      setIsLoaded(true);
    }
  };
  
  const handleError = () => {
    if (isMounted.current) {
      setHasError(true);
      if (onError) onError();
    }
  };
  
  // Show placeholder for missing or errored images
  if (!src || hasError) {
    return (
      <div 
        className={`${className || ''} bg-gray-100 rounded border flex items-center justify-center flex-shrink-0`} 
        onClick={onClick}
        role="img"
        aria-label={alt || 'No image'}
      >
        <ImageIcon size={16} className="text-gray-400" />
      </div>
    );
  }
  
  return (
    <div ref={imgRef} className="relative flex-shrink-0" onClick={onClick}>
      {/* Show loading skeleton until image loads */}
      {!isLoaded && (
        <div className={`${className || ''} bg-gray-100 rounded border flex items-center justify-center animate-pulse`}>
          <ImageIcon size={16} className="text-gray-300" />
        </div>
      )}
      {/* Only render img tag when visible in viewport */}
      {isVisible && (
        <img
          src={src}
          alt={alt || ''}
          className={`${className || ''} ${isLoaded ? '' : 'absolute opacity-0 top-0 left-0'}`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );
};

export default function RetailerDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [ordersSubTab, setOrdersSubTab] = useState('pending'); // pending, dispatched, invoiced
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [indents, setIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [rejections, setRejections] = useState([]);
  const [payments, setPayments] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDispatches, setExpandedDispatches] = useState({});
  const [expandedInvoices, setExpandedInvoices] = useState({});
  const [expandedOrderDates, setExpandedOrderDates] = useState({});
  const [expandedRejectionDates, setExpandedRejectionDates] = useState({});
  const [invoiceCreditNotes, setInvoiceCreditNotes] = useState({}); // Store credit notes per invoice ID
  
  // Rejection View Mode (By Invoice Date vs By Recorded Date)
  const [rejectionViewMode, setRejectionViewMode] = useState('by-invoice'); // 'by-invoice' or 'by-recorded'
  const [dailyRejectionSummary, setDailyRejectionSummary] = useState([]);
  const [loadingDailySummary, setLoadingDailySummary] = useState(false);
  const [expandedDailyDates, setExpandedDailyDates] = useState({});
  const [rejectionDateFrom, setRejectionDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 84); // 12 weeks default
    return d.toISOString().split('T')[0];
  });
  const [rejectionDateTo, setRejectionDateTo] = useState(new Date().toISOString().split('T')[0]);
  
  // Helper function to get local date in YYYY-MM-DD format (avoids timezone issues with toISOString)
  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Orders date filter
  const [ordersDateFrom, setOrdersDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });
  const [ordersDateTo, setOrdersDateTo] = useState(getLocalDateString());
  
  // Inventory view date (for daily inventory tab)
  const [inventoryDate, setInventoryDate] = useState(getLocalDateString());
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [inventoryData, setInventoryData] = useState([]); // Combined inventory view
  
  // Simplified Closing Inventory state
  const [closingDate, setClosingDate] = useState(getLocalDateString());
  const [showRecordClosingModal, setShowRecordClosingModal] = useState(false);
  const [closingItems, setClosingItems] = useState([]); // All products with closing qty inputs
  const [closingHistory, setClosingHistory] = useState([]); // View closing for a selected date
  const [closingHistoryDate, setClosingHistoryDate] = useState(getLocalDateString());
  const [recordedDates, setRecordedDates] = useState([]); // Dates that have closing recorded
  const [savingClosing, setSavingClosing] = useState(false);
  const [loadingClosing, setLoadingClosing] = useState(false);
  const [closingSearchTerm, setClosingSearchTerm] = useState(''); // Search filter for closing products
  const [showPendingConfirmation, setShowPendingConfirmation] = useState(false); // Confirmation dialog for pending items
  const [editingClosingDate, setEditingClosingDate] = useState(null); // For edit mode
  const [editingItemId, setEditingItemId] = useState(null); // ID of item being edited inline
  const [editingItemQty, setEditingItemQty] = useState(''); // Temp value for inline edit
  const [closingSubTab, setClosingSubTab] = useState('closing-history'); // Sub-tab for Closing section
  
  // Yesterday's closing check
  const [yesterdayClosingMissing, setYesterdayClosingMissing] = useState(false);
  const [yesterdayDate, setYesterdayDate] = useState('');
  const [showYesterdayBanner, setShowYesterdayBanner] = useState(true); // Track if banner is dismissed
  
  // Create Indent Modal state
  const [showCreateIndentModal, setShowCreateIndentModal] = useState(false);
  const [createIndentDate, setCreateIndentDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getLocalDateString(tomorrow);
  });
  const [createIndentItems, setCreateIndentItems] = useState({});
  const [expandedCreateTypes, setExpandedCreateTypes] = useState({});
  const [productTypes, setProductTypes] = useState([]);
  const [savingIndent, setSavingIndent] = useState(false);
  const [editingIndentId, setEditingIndentId] = useState(null);
  const [indentSearchQuery, setIndentSearchQuery] = useState(''); // Search in indent modal
  
  // NEW: Cart-based indent system
  const [catalogue, setCatalogue] = useState([]); // Products from admin catalogue
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState(false); // Track if catalogue failed to load
  const [catalogueImages, setCatalogueImages] = useState({}); // Lazy-loaded images: productId -> imageUrl
  const [loadingImages, setLoadingImages] = useState({}); // Track which categories are loading images
  const [cart, setCart] = useState({}); // {productId_variantId: {product, variant, quantity}}
  const [showCart, setShowCart] = useState(false);
  const [expandedCatalogueCategories, setExpandedCatalogueCategories] = useState({}); // Categories collapsed by default
  const [mrpData, setMrpData] = useState({}); // MRP lookup: "productId_variantId" -> { mrp, date }
  
  // Catalogue language preference (stored in localStorage)
  const [catalogueLanguage, setCatalogueLanguage] = useState(() => {
    return localStorage.getItem('retailerCatalogueLanguage') || 'en';
  });
  
  // Save catalogue language preference to localStorage
  const changeCatalogueLanguage = (lang) => {
    setCatalogueLanguage(lang);
    localStorage.setItem('retailerCatalogueLanguage', lang);
  };
  
  // Get MRP for a product-variant combination
  const getMrp = (productId, variantId) => {
    const key = `${productId}_${variantId}`;
    return mrpData[key]?.mrp || 0;
  };
  
  // Image enlargement state
  const [enlargedImage, setEnlargedImage] = useState(null);
  
  // Immediately Payable state
  const [immediatelyPayable, setImmediatelyPayable] = useState(null);
  const [loadingPayable, setLoadingPayable] = useState(false);
  
  // Payment Details state (new redesigned block)
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [paymentDetailsLoading, setPaymentDetailsLoading] = useState(false);
  const [paymentDetailsDateFrom, setPaymentDetailsDateFrom] = useState('');
  const [paymentDetailsDateTo, setPaymentDetailsDateTo] = useState('');
  const [selectedPaymentDate, setSelectedPaymentDate] = useState(null); // For modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [expandedPayableSection, setExpandedPayableSection] = useState(null); // For 100% upfront retailers
  
  // Payment Summary Modal state
  const [showPaymentSummaryModal, setShowPaymentSummaryModal] = useState(false);
  const [paymentSummaryData, setPaymentSummaryData] = useState(null);
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false);
  const [paymentSummaryStartDate, setPaymentSummaryStartDate] = useState('');
  const [paymentSummaryEndDate, setPaymentSummaryEndDate] = useState('');
  
  // Payment Ledger state
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [expandedLedgerDates, setExpandedLedgerDates] = useState({});
  
  // Statement state
  const [statementData, setStatementData] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [statementEndDate, setStatementEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedStatementGroups, setExpandedStatementGroups] = useState({});
  
  // Final Summary state
  const [finalSummaryData, setFinalSummaryData] = useState(null);
  const [finalSummaryLoading, setFinalSummaryLoading] = useState(false);
  const [finalSummaryStartDate, setFinalSummaryStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [finalSummaryEndDate, setFinalSummaryEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedFinalSummaryRows, setExpandedFinalSummaryRows] = useState({});
  
  // Credit Notes state
  const [creditNotesData, setCreditNotesData] = useState(null);
  const [creditNotesLoading, setCreditNotesLoading] = useState(false);
  const [expandedCreditDates, setExpandedCreditDates] = useState({});
  
  // Create a product lookup map for fast translations
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    });
    return map;
  }, [products]);
  
  // Helper to get translated product name based on current language
  // Can accept either a product object with name/name_hi, or an item with product_id
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
  
  // Date filter for dashboard - will be updated to first order date once data loads
  const [dashboardDateFrom, setDashboardDateFrom] = useState('');
  const [dashboardDateTo, setDashboardDateTo] = useState(getLocalDateString());
  const [firstOrderDateInitialized, setFirstOrderDateInitialized] = useState(false);
  const [chartViewMode, setChartViewMode] = useState('weekly'); // 'daily', 'weekly', 'monthly'
  
  // Indent form
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [indentForm, setIndentForm] = useState({
    indent_date: getLocalDateString(),
    items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }],
    remarks: ''
  });
  
  // GRN form
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState(null);
  const [grnItems, setGrnItems] = useState([]);
  const [confirmedGrns, setConfirmedGrns] = useState({}); // Track which dispatches have confirmed GRNs

  const loadData = useCallback(async (retryCount = 0) => {
    setLoading(true);
    setCatalogueError(false); // Reset error state
    try {
      // Use Promise.allSettled to prevent single API failure from breaking entire load
      const results = await Promise.allSettled([
        api.get('/api/retailer-dashboard'),
        api.get('/api/retailer-indents'),
        api.get('/api/retailer-dispatches'),
        api.get('/api/retailer-invoices'),
        api.get('/api/retailer-rejections'),
        api.get('/api/products?include_images=false'),
        api.get('/api/qc-packaging'),
        api.get('/api/retailer-grn'),
        api.get('/api/retailer-payments'),
        api.get('/api/product-types'),
        api.get('/api/retailer-immediately-payable'),
        api.get('/api/retailer-catalogue?include_images=false'),  // Load names instantly, images load lazily
        api.get('/api/retailer-catalogue/mrp')
      ]);
      
      // Helper to safely extract data from settled result
      const getData = (result, fallback = null) => {
        return result.status === 'fulfilled' ? result.value.data : fallback;
      };
      
      const [dashRes, indentsRes, dispatchesRes, invoicesRes, rejectionsRes, productsRes, packagingsRes, grnsRes, paymentsRes, typesRes, payableRes, catalogueRes, mrpRes] = results;
      
      // Check if critical APIs failed (dashboard is essential)
      if (dashRes.status === 'rejected') {
        throw new Error('Dashboard data failed to load');
      }
      
      setDashboardData(getData(dashRes));
      setIndents(getData(indentsRes, []));
      setDispatches(getData(dispatchesRes, []));
      setInvoices(getData(invoicesRes, []));
      setRejections(getData(rejectionsRes, []));
      setProducts(getData(productsRes, []));
      setPackagings(getData(packagingsRes, []));
      setPayments(getData(paymentsRes, []) || []);
      setProductTypes(getData(typesRes, []) || []);
      setImmediatelyPayable(getData(payableRes) || null);
      
      // Filter catalogue to only show items with show_on_portal: true
      // Also parse variants from string to array if needed
      const catalogueData = getData(catalogueRes, []);
      const filteredCatalogue = (catalogueData || [])
        .filter(item => item.show_on_portal !== false)
        .map(item => {
          // Parse variants string to array if needed
          let parsedVariants = [];
          if (item.variants) {
            try {
              parsedVariants = typeof item.variants === 'string' 
                ? JSON.parse(item.variants.replace(/'/g, '"'))
                : item.variants;
              if (!Array.isArray(parsedVariants)) parsedVariants = [];
            } catch (e) {
              parsedVariants = [];
            }
          }
          // Parse purchase_weights string to array if needed
          let parsedPurchaseWeights = [];
          if (item.purchase_weights) {
            try {
              parsedPurchaseWeights = typeof item.purchase_weights === 'string' 
                ? JSON.parse(item.purchase_weights.replace(/'/g, '"'))
                : item.purchase_weights;
              if (!Array.isArray(parsedPurchaseWeights)) parsedPurchaseWeights = [];
            } catch (e) {
              parsedPurchaseWeights = [];
            }
          }
          return {
            ...item,
            variants: parsedVariants,
            purchase_weights: parsedPurchaseWeights
          };
        });
      setCatalogue(filteredCatalogue);
      
      // Track if catalogue specifically failed
      if (catalogueRes.status === 'rejected') {
        setCatalogueError(true);
        console.error('Catalogue failed to load:', catalogueRes.reason);
      } else {
        setCatalogueError(false);
      }
      
      // Note: Images are lazy-loaded by the LazyImage component when they enter the viewport
      // This prevents browser crashes by only loading visible images
      
      // Set MRP data
      const mrpResponse = getData(mrpRes, {});
      setMrpData(mrpResponse?.mrp_data || {});
      
      // Build a map of dispatch_id -> GRN confirmed status
      const grnMap = {};
      (getData(grnsRes, []) || []).forEach(grn => {
        grnMap[grn.dispatch_id] = true;
      });
      setConfirmedGrns(grnMap);
      
      // Log any failed API calls for debugging (but don't crash)
      const failedCalls = results.filter(r => r.status === 'rejected');
      if (failedCalls.length > 0) {
        console.warn(`${failedCalls.length} API call(s) failed but dashboard loaded with available data`);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      // Retry up to 2 times with exponential backoff
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        console.log(`Retrying in ${delay}ms... (attempt ${retryCount + 2}/3)`);
        setTimeout(() => loadData(retryCount + 1), delay);
        return;
      }
      toast.error('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Set dashboard date range to first order till today once dispatches are loaded
  // Also set default chart view based on retailer tenure (>2 months = monthly, <2 months = weekly)
  useEffect(() => {
    if (!firstOrderDateInitialized && dispatches.length > 0) {
      // Find the earliest dispatch date
      const sortedDates = dispatches
        .map(d => d.dispatch_date?.split('T')[0])
        .filter(Boolean)
        .sort();
      
      if (sortedDates.length > 0) {
        const firstOrderDate = sortedDates[0];
        setDashboardDateFrom(firstOrderDate); // First order date
        
        // Calculate tenure in months
        const firstDate = new Date(firstOrderDate);
        const today = new Date();
        const monthsDiff = (today.getFullYear() - firstDate.getFullYear()) * 12 + 
                          (today.getMonth() - firstDate.getMonth());
        
        // Set default view: >2 months = monthly, otherwise weekly
        if (monthsDiff >= 2) {
          setChartViewMode('monthly');
        } else {
          setChartViewMode('weekly');
        }
        
        setFirstOrderDateInitialized(true);
      }
    }
  }, [dispatches, firstOrderDateInitialized]);

  // Load images for products in a specific category (called when category is expanded)
  const loadCategoryImages = useCallback(async (category) => {
    // Get product IDs for this category
    const categoryProducts = catalogue.filter(p => (p.category || 'Others') === category);
    const productIds = categoryProducts.map(p => p.product_id).filter(Boolean);
    
    if (productIds.length === 0) return; // No products
    
    setLoadingImages(prev => ({ ...prev, [category]: true }));
    
    try {
      // Fetch images for these products from the products collection
      const res = await api.get(`/api/products/images?ids=${productIds.join(',')}`);
      if (res.data) {
        setCatalogueImages(prev => ({
          ...prev,
          ...res.data // { productId: imageUrl, ... }
        }));
      }
    } catch (error) {
      console.error('Failed to load images for category:', category, error);
    } finally {
      setLoadingImages(prev => ({ ...prev, [category]: false }));
    }
  }, [catalogue]); // Only depend on catalogue, not catalogueImages

  // Check if yesterday's closing is missing
  const checkYesterdayClosing = useCallback(async () => {
    if (!dashboardData?.retailer?.id) return;
    try {
      const res = await api.get(`/api/retailer-closing-inventory/check-yesterday/${dashboardData.retailer.id}`);
      if (!res.data.has_closing) {
        setYesterdayClosingMissing(true);
        setYesterdayDate(res.data.yesterday_date);
      } else {
        setYesterdayClosingMissing(false);
      }
    } catch (error) {
      console.error('Failed to check yesterday closing:', error);
    }
  }, [dashboardData?.retailer?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Check yesterday's closing after dashboard data is loaded
  useEffect(() => {
    if (dashboardData?.retailer?.id) {
      checkYesterdayClosing();
    }
  }, [dashboardData?.retailer?.id, checkYesterdayClosing]);

  // Load Payment Details (for the new Payment Details block)
  const loadPaymentDetails = useCallback(async (startDate = '', endDate = '') => {
    setPaymentDetailsLoading(true);
    try {
      let url = '/api/retailer-payment-details';
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await api.get(url);
      setPaymentDetails(res.data);
    } catch (error) {
      console.error('Failed to load payment details:', error);
      setPaymentDetails(null);
    } finally {
      setPaymentDetailsLoading(false);
    }
  }, []);

  // Load payment details on initial load
  useEffect(() => {
    loadPaymentDetails();
  }, [loadPaymentDetails]);

  // Handle Apply filters for Payment Details
  const handleApplyPaymentFilters = () => {
    loadPaymentDetails(paymentDetailsDateFrom, paymentDetailsDateTo);
  };

  // Handle Reset filters for Payment Details
  const handleResetPaymentFilters = () => {
    setPaymentDetailsDateFrom('');
    setPaymentDetailsDateTo('');
    loadPaymentDetails();
  };

  // Open Payment Details Modal for a specific date
  const openPaymentModal = (dateData) => {
    setSelectedPaymentDate(dateData);
    setShowPaymentModal(true);
  };

  // Load Payment Summary Data
  const loadPaymentSummary = async (startDate, endDate) => {
    if (!dashboardData?.retailer?.id) return;
    setPaymentSummaryLoading(true);
    try {
      let url = `/api/retailer-payment-summary?retailer_id=${dashboardData.retailer.id}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      const response = await api.get(url);
      setPaymentSummaryData(response.data);
    } catch (error) {
      console.error('Failed to load payment summary:', error);
      toast.error('Failed to load payment summary');
    } finally {
      setPaymentSummaryLoading(false);
    }
  };

  // Load Daily Rejection Summary (grouped by recorded date)
  const loadDailyRejectionSummary = useCallback(async () => {
    if (!dashboardData?.retailer?.id) return;
    setLoadingDailySummary(true);
    try {
      const params = new URLSearchParams();
      params.append('start_date', rejectionDateFrom);
      params.append('end_date', rejectionDateTo);
      const response = await api.get(`/api/retailer-rejections/daily-summary?${params.toString()}`);
      setDailyRejectionSummary(response.data?.daily_summary || []);
    } catch (error) {
      console.error('Failed to load daily rejection summary:', error);
      setDailyRejectionSummary([]);
    } finally {
      setLoadingDailySummary(false);
    }
  }, [dashboardData?.retailer?.id, rejectionDateFrom, rejectionDateTo]);

  // Open Payment Summary Modal
  const openPaymentSummaryModal = () => {
    // Set default date range to last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    setPaymentSummaryStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
    setPaymentSummaryEndDate(today.toISOString().split('T')[0]);
    setShowPaymentSummaryModal(true);
    loadPaymentSummary(thirtyDaysAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]);
  };

  // Load Payment Ledger Data
  const loadLedgerData = async (startDate, endDate) => {
    if (!dashboardData?.retailer?.id) return;
    setLedgerLoading(true);
    try {
      let url = `/api/retailer-payment-ledger?retailer_id=${dashboardData.retailer.id}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      const response = await api.get(url);
      setLedgerData(response.data);
    } catch (error) {
      console.error('Failed to load payment ledger:', error);
      toast.error('Failed to load payment ledger');
    } finally {
      setLedgerLoading(false);
    }
  };

  // Initialize ledger when tab becomes active
  useEffect(() => {
    if (activeTab === 'ledger' && dashboardData?.retailer?.id && !ledgerData) {
      // Set default date range to last 60 days
      const today = new Date();
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(today.getDate() - 60);
      setLedgerStartDate(sixtyDaysAgo.toISOString().split('T')[0]);
      setLedgerEndDate(today.toISOString().split('T')[0]);
      loadLedgerData(sixtyDaysAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]);
    }
  }, [activeTab, dashboardData?.retailer?.id]);

  // Load Credit Notes Data
  const loadCreditNotesData = async () => {
    setCreditNotesLoading(true);
    try {
      const response = await api.get('/api/retailer-credit-notes/my-summary');
      setCreditNotesData(response.data);
    } catch (error) {
      console.error('Failed to load credit notes:', error);
      toast.error('Failed to load credit notes');
    } finally {
      setCreditNotesLoading(false);
    }
  };

  // Initialize credit notes when tab becomes active
  useEffect(() => {
    if (activeTab === 'creditnotes' && !creditNotesData) {
      loadCreditNotesData();
    }
  }, [activeTab]);

  // Load Statement Data
  const loadStatementData = async (startDate, endDate) => {
    if (!dashboardData?.retailer?.id) return;
    setStatementLoading(true);
    setExpandedStatementGroups({});
    try {
      const params = new URLSearchParams({
        retailer_id: dashboardData.retailer.id,
        start_date: startDate,
        end_date: endDate
      });
      const response = await api.get(`/api/retailer-statement?${params.toString()}`);
      setStatementData(response.data);
    } catch (error) {
      console.error('Failed to load statement:', error);
      toast.error('Failed to load statement');
    } finally {
      setStatementLoading(false);
    }
  };

  // Helper to group statement entries by date+type
  const groupStatementEntries = (entries) => {
    if (!entries || entries.length === 0) return [];
    
    const grouped = [];
    let i = 0;
    
    while (i < entries.length) {
      const current = entries[i];
      const currentDate = current.date?.split('T')[0];
      const currentType = current.type;
      
      const groupItems = [current];
      let j = i + 1;
      
      while (j < entries.length) {
        const next = entries[j];
        const nextDate = next.date?.split('T')[0];
        const nextType = next.type;
        
        if (nextDate === currentDate && nextType === currentType) {
          groupItems.push(next);
          j++;
        } else {
          break;
        }
      }
      
      if (groupItems.length > 1) {
        const totalDebit = groupItems.reduce((sum, item) => sum + (item.debit || 0), 0);
        const totalCredit = groupItems.reduce((sum, item) => sum + (item.credit || 0), 0);
        const lastBalance = groupItems[groupItems.length - 1].balance;
        
        grouped.push({
          isGroup: true,
          groupKey: `${currentDate}_${currentType}`,
          date: current.date,
          type: currentType,
          itemCount: groupItems.length,
          totalDebit,
          totalCredit,
          balance: lastBalance,
          items: groupItems,
          reference: `${groupItems.length} ${currentType === 'payment' ? 'Payments' : currentType === 'credit_note' ? 'Credit Notes' : currentType === 'invoice' ? 'Invoices' : 'Items'}`
        });
      } else {
        grouped.push({ isGroup: false, ...current });
      }
      
      i = j;
    }
    
    return grouped;
  };

  // Initialize statement when tab becomes active
  useEffect(() => {
    if (activeTab === 'statement' && dashboardData?.retailer?.id && !statementData) {
      loadStatementData(statementStartDate, statementEndDate);
    }
  }, [activeTab, dashboardData?.retailer?.id]);

  // Load Final Summary Data
  const loadFinalSummaryData = async (startDate, endDate) => {
    if (!dashboardData?.retailer?.id) return;
    setFinalSummaryLoading(true);
    setExpandedFinalSummaryRows({});
    try {
      const params = new URLSearchParams({
        retailer_id: dashboardData.retailer.id,
        start_date: startDate,
        end_date: endDate
      });
      const response = await api.get(`/api/retailer-invoices/final-summary?${params.toString()}`);
      setFinalSummaryData(response.data);
    } catch (error) {
      console.error('Failed to load final summary:', error);
      toast.error('Failed to load final summary');
    } finally {
      setFinalSummaryLoading(false);
    }
  };

  // Initialize final summary when tab becomes active
  useEffect(() => {
    if (activeTab === 'finalsummary' && dashboardData?.retailer?.id && !finalSummaryData) {
      loadFinalSummaryData(finalSummaryStartDate, finalSummaryEndDate);
    }
  }, [activeTab, dashboardData?.retailer?.id]);

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ==================== INDENT HANDLERS ====================
  const handleCreateIndent = async (e) => {
    e.preventDefault();
    if (indentForm.items.some(item => !item.product_id || !item.quantity)) {
      toast.error('Please fill all product details');
      return;
    }

    try {
      await api.post('/api/retailer-indents', {
        retailer_id: dashboardData?.retailer?.id,
        indent_date: new Date(indentForm.indent_date).toISOString(),
        items: indentForm.items,
        remarks: indentForm.remarks
      });
      toast.success('Indent created successfully');
      setShowIndentModal(false);
      resetIndentForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create indent');
    }
  };

  const handleDeleteIndent = async (indentId) => {
    if (!window.confirm('Are you sure you want to delete this indent?')) return;
    try {
      await api.delete(`/api/retailer-indents/${indentId}`);
      toast.success('Indent deleted');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete indent');
    }
  };

  const resetIndentForm = () => {
    setIndentForm({
      indent_date: getLocalDateString(),
      items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }],
      remarks: ''
    });
  };

  // ==================== NEW CREATE INDENT MODAL HANDLERS ====================
  // Group products by category for the create indent modal (same as Admin portal)
  const productsByCategory = useMemo(() => {
    const grouped = {};
    products.forEach(p => {
      const category = p.category || 'Others';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(p);
    });
    // Sort products within each category
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [products]);

  // Get sorted category names
  const sortedCategoryNames = useMemo(() => {
    const categoryOrder = { 'Vegetables': 1, 'Leafy': 2, 'Fruits': 3, 'Exotic': 4, 'Herbs': 5, 'Mushrooms': 6, 'Others': 99 };
    return Object.keys(productsByCategory).sort((a, b) => (categoryOrder[a] || 99) - (categoryOrder[b] || 99));
  }, [productsByCategory]);

  // ==================== NEW CART-BASED INDENT SYSTEM ====================
  // Group catalogue items by category
  const catalogueByCategory = useMemo(() => {
    const grouped = {};
    catalogue.forEach(item => {
      const category = item.category || 'Others';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(item);
    });
    // Sort products within each category
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => (a.product_name || '').localeCompare(b.product_name || ''));
    });
    return grouped;
  }, [catalogue]);

  // Get sorted catalogue category names
  const sortedCatalogueCategories = useMemo(() => {
    const categoryOrder = { 'Vegetables': 1, 'Leafy': 2, 'Fruits': 3, 'Exotic': 4, 'Sprouts': 5, 'Herbs': 6, 'Others': 99 };
    return Object.keys(catalogueByCategory).sort((a, b) => (categoryOrder[a] || 99) - (categoryOrder[b] || 99));
  }, [catalogueByCategory]);

  // Toggle catalogue category expansion and load images
  const toggleCatalogueCategory = (category) => {
    const isCurrentlyExpanded = expandedCatalogueCategories[category];
    
    setExpandedCatalogueCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
    
    // Load images when expanding (not collapsing)
    if (!isCurrentlyExpanded) {
      loadCategoryImages(category);
    }
  };

  // Get variant name from ID
  const getVariantName = (variantId) => {
    // Handle unit-based variants (Piece/Packet)
    if (variantId && variantId.startsWith('unit_')) {
      const unitName = variantId.replace('unit_', '');
      return unitName.charAt(0).toUpperCase() + unitName.slice(1);
    }
    // Regular packaging variant
    const variant = packagings.find(v => v.id === variantId);
    return variant ? variant.name : variantId;
  };
  
  // Helper to resolve variant name - handles legacy UUIDs stored as variant_name
  const resolveVariantName = (variantName, variantId) => {
    // If variant_name is a UUID pattern, look it up from packagings
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // First check if variant_name itself is a UUID (legacy data issue)
    if (variantName && uuidRegex.test(variantName)) {
      const pkg = packagings.find(p => p.id === variantName);
      if (pkg) return pkg.name;
    }
    
    // If variant_id is available, try to resolve from that
    if (variantId && uuidRegex.test(variantId)) {
      const pkg = packagings.find(p => p.id === variantId);
      if (pkg) return pkg.name;
    }
    
    // Return original name or look up by variant_id
    return variantName || getVariantName(variantId) || '';
  };

  // Add item to cart
  const addToCart = (catalogueItem, variantId, variantName) => {
    const key = `${catalogueItem.product_id}_${variantId}`;
    
    // Get the purchase weight name for display (for Pieces/Packets)
    let purchaseWeightName = '';
    if (['Piece', 'Packet'].includes(catalogueItem.purchase_unit)) {
      const weightId = catalogueItem.purchase_weights?.[0] || catalogueItem.purchase_weight_variant;
      if (weightId) {
        const pkg = packagings.find(p => p.id === weightId);
        purchaseWeightName = pkg ? pkg.name : '';
      }
    }
    
    setCart(prev => ({
      ...prev,
      [key]: {
        product_id: catalogueItem.product_id,
        product_name: catalogueItem.product_name,
        product_name_hi: catalogueItem.product_name_hi,
        product_name_mr: catalogueItem.product_name_mr,
        category: catalogueItem.category,
        image_url: catalogueItem.image_url,
        variant_id: variantId,
        variant_name: variantName,
        purchase_unit: catalogueItem.purchase_unit || '',
        purchase_weight_name: purchaseWeightName,
        quantity: 1
      }
    }));
  };

  // Update cart item quantity
  const updateCartQuantity = (key, delta) => {
    setCart(prev => {
      const current = prev[key];
      if (!current) return prev;
      
      const newQty = current.quantity + delta;
      if (newQty <= 0) {
        // Remove item from cart
        const { [key]: removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [key]: { ...current, quantity: newQty }
      };
    });
  };

  // Remove item from cart
  const removeFromCart = (key) => {
    setCart(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
  };

  // Get cart total items count
  const cartItemCount = useMemo(() => {
    return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Check if product+variant is in cart
  const getCartItem = (productId, variantId) => {
    const key = `${productId}_${variantId}`;
    return cart[key];
  };

  // Submit cart as indent
  const submitCartAsIndent = async () => {
    const cartItems = Object.values(cart);
    if (cartItems.length === 0) {
      toast.error('Cart is empty. Please add products first.');
      return;
    }

    setSavingIndent(true);
    try {
      const items = cartItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        quantity: item.quantity,
        status: 'pending'
      }));

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      // Use local date string to avoid timezone issues (YYYY-MM-DD format)
      const tomorrowDateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

      await api.post('/api/retailer-indents', {
        indent_date: tomorrowDateStr,
        items
      });

      toast.success('Order placed successfully!');
      setCart({});
      setShowCart(false);
      await loadData(); // Reload to show new indent
      
      // Redirect to Orders tab to show the newly created order
      setActiveTab('orders');
      setOrdersSubTab('pending');
    } catch (error) {
      console.error('Failed to place order:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to place order';
      toast.error(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg);
    } finally {
      setSavingIndent(false);
    }
  };

  // Open edit mode using cart-based interface (same as Create Order)
  const openCartEditMode = (existingIndent) => {
    if (!existingIndent) return;
    
    // Set editing state
    setEditingIndentId(existingIndent.id);
    
    // Convert existing items to cart format
    const newCart = {};
    (existingIndent.items || []).forEach(item => {
      // Find the catalogue item for this product to get image
      const catalogueItem = catalogue.find(c => c.product_id === item.product_id);
      
      const key = `${item.product_id}_${item.variant_id}`;
      newCart[key] = {
        product_id: item.product_id,
        product_name: item.product_name,
        product_name_hi: catalogueItem?.product_name_hi || '',
        product_name_mr: catalogueItem?.product_name_mr || '',
        category: catalogueItem?.category || '',
        image_url: catalogueItem?.image_url || '',
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        quantity: item.quantity
      };
    });
    setCart(newCart);
    
    // Navigate to place order tab
    setActiveTab('placeorder');
  };

  // Update cart as indent (for edit mode)
  const updateCartAsIndent = async () => {
    const cartItems = Object.values(cart);
    if (cartItems.length === 0) {
      toast.error('Cart is empty. Please add products first.');
      return;
    }

    if (!editingIndentId) {
      // If not editing, use regular submit
      await submitCartAsIndent();
      return;
    }

    setSavingIndent(true);
    try {
      const items = cartItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        quantity: item.quantity,
        status: 'pending'
      }));

      // Get the indent date from the existing indent
      const existingIndent = indents.find(i => i.id === editingIndentId);
      const indentDate = existingIndent?.indent_date || new Date().toISOString();

      await api.put(`/api/retailer-indents/${editingIndentId}`, {
        indent_date: indentDate,
        items: items,
        remarks: ''
      });

      toast.success('Order updated successfully!');
      setCart({});
      setEditingIndentId(null);
      setShowCart(false);
      await loadData();
      
      // Redirect to Orders tab
      setActiveTab('orders');
      setOrdersSubTab('pending');
    } catch (error) {
      console.error('Failed to update order:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to update order';
      toast.error(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg);
    } finally {
      setSavingIndent(false);
    }
  };

  const openCreateIndentModal = (existingIndent = null) => {
    // Set date to tomorrow by default
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (existingIndent) {
      // Edit mode
      setEditingIndentId(existingIndent.id);
      setCreateIndentDate(existingIndent.indent_date?.split('T')[0] || getLocalDateString(tomorrow));
      
      // Convert existing items to format {productId: {variantId, quantity}}
      const items = {};
      (existingIndent.items || []).forEach(item => {
        items[item.product_id] = {
          variant_id: item.variant_id || '',
          quantity: item.quantity || 0
        };
      });
      setCreateIndentItems(items);
      
      // Expand all categories that have items
      const expandCats = {};
      products.forEach(p => {
        if (items[p.id]) {
          expandCats[p.category || 'Others'] = true;
        }
      });
      setExpandedCreateTypes(expandCats);
    } else {
      // Create new mode
      setEditingIndentId(null);
      setCreateIndentDate(getLocalDateString(tomorrow));
      setCreateIndentItems({});
      setExpandedCreateTypes({});
    }
    setIndentSearchQuery(''); // Reset search
    setShowCreateIndentModal(true);
  };

  const toggleCreateType = (type) => {
    setExpandedCreateTypes(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const updateCreateIndentItem = (productId, field, value) => {
    setCreateIndentItems(prev => {
      const current = prev[productId] || { variant_id: '', quantity: 0 };
      const updated = { ...current, [field]: value };
      
      // If quantity is 0 and variant is empty, remove the item
      if (updated.quantity === 0 && !updated.variant_id) {
        const newItems = { ...prev };
        delete newItems[productId];
        return newItems;
      }
      
      return { ...prev, [productId]: updated };
    });
  };

  const handleSubmitCreateIndent = async () => {
    // Filter items with quantity > 0
    const itemsWithQty = Object.entries(createIndentItems)
      .filter(([_, data]) => data.quantity > 0);
    
    if (itemsWithQty.length === 0) {
      toast.error('Please add at least one product with quantity');
      return;
    }
    
    // Validate all items have variants selected
    const missingVariants = [];
    const items = itemsWithQty.map(([productId, data]) => {
        const product = products.find(p => p.id === productId);
        const variant = packagings.find(v => v.id === data.variant_id);
        
        if (!data.variant_id) {
          missingVariants.push(product?.name || 'Unknown product');
        }
        
        return {
          product_id: productId,
          product_name: product?.name || '',
          variant_id: data.variant_id || '',
          variant_name: variant?.name || '',
          quantity: data.quantity,
          status: 'pending'
        };
      });
    
    // Show error if any variants are missing
    if (missingVariants.length > 0) {
      if (missingVariants.length <= 3) {
        toast.error(`Please select variant for: ${missingVariants.join(', ')}`);
      } else {
        toast.error(`Please select variant for ${missingVariants.length} products: ${missingVariants.slice(0, 2).join(', ')} and ${missingVariants.length - 2} more`);
      }
      return;
    }

    setSavingIndent(true);
    try {
      if (editingIndentId) {
        await api.put(`/api/retailer-indents/${editingIndentId}`, {
          retailer_id: dashboardData?.retailer?.id,
          indent_date: createIndentDate,  // Already in YYYY-MM-DD format
          items: items,
          remarks: ''
        });
        toast.success('Indent updated successfully');
      } else {
        await api.post('/api/retailer-indents', {
          retailer_id: dashboardData?.retailer?.id,
          indent_date: createIndentDate,  // Already in YYYY-MM-DD format
          items: items,
          remarks: ''
        });
        toast.success('Indent created successfully');
      }
      setShowCreateIndentModal(false);
      setIndentSearchQuery(''); // Reset search
      loadData();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to save indent';
      toast.error(errorMsg);
      console.error('Indent save error:', error.response?.data || error);
    } finally {
      setSavingIndent(false);
    }
  };

  // Check if indent can be edited (only pending indents can be edited)
  const canEditIndent = (indent) => {
    if (!indent || indent.status !== 'pending') return false;
    return true; // Retailers can edit anytime while indent is pending
  };

  // Get type color classes
  const getTypeColorClasses = (type) => {
    switch (type) {
      case 'Fruits': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Vegetables': return 'bg-green-100 text-green-700 border-green-200';
      case 'Leafy': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Exotic': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Herbs': return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'Mushrooms': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const addIndentItem = () => {
    setIndentForm(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: 0, status: 'pending' }]
    }));
  };

  const removeIndentItem = (index) => {
    setIndentForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateIndentItem = (index, field, value) => {
    setIndentForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      if (field === 'product_id') {
        const product = products.find(p => p.id === value);
        items[index].product_name = product?.name || '';
      }
      if (field === 'variant_id') {
        const variant = packagings.find(p => p.id === value);
        items[index].variant_name = variant?.name || '';
      }
      return { ...prev, items };
    });
  };

  // ==================== GRN HANDLERS ====================
  const openGrnModal = (dispatch) => {
    setSelectedDispatch(dispatch);
    setGrnItems(dispatch.items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      supplied_qty: item.supplied_qty,
      received_qty: item.supplied_qty,
      difference: 0
    })));
    setShowGrnModal(true);
  };

  const updateGrnItem = (index, receivedQty) => {
    setGrnItems(prev => {
      const items = [...prev];
      items[index].received_qty = receivedQty;
      items[index].difference = receivedQty - items[index].supplied_qty;
      return items;
    });
  };

  const handleSubmitGrn = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/retailer-grn', {
        dispatch_id: selectedDispatch.id,
        items: grnItems,
        remarks: ''
      });
      toast.success('GRN confirmed successfully');
      setShowGrnModal(false);
      setSelectedDispatch(null);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm GRN');
    }
  };

  const toggleDispatchExpand = (id) => {
    setExpandedDispatches(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleInvoiceExpand = async (id) => {
    const isExpanding = !expandedInvoices[id];
    setExpandedInvoices(prev => ({ ...prev, [id]: isExpanding }));
    
    // Fetch credit notes when expanding
    if (isExpanding && !invoiceCreditNotes[id]) {
      try {
        const creditRes = await api.get(`/api/retailer-credit-notes?adjusted_against_invoice=${id}`);
        const adjustedCredits = (creditRes.data || []).filter(cn => 
          cn.adjusted_against_invoices?.some(adj => adj.invoice_id === id)
        );
        setInvoiceCreditNotes(prev => ({ ...prev, [id]: adjustedCredits }));
      } catch (error) {
        console.error('Failed to fetch credit notes for invoice:', error);
      }
    }
  };

  const downloadInvoicePdf = async (invoice) => {
    // Fetch payment history for this invoice
    let paymentHistory = [];
    let creditNotesApplied = [];
    
    try {
      const paymentsRes = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
      paymentHistory = paymentsRes.data || [];
    } catch (error) {
      console.error('Failed to fetch payment history:', error);
    }
    
    // Fetch credit notes adjusted against this invoice
    try {
      const creditRes = await api.get(`/api/retailer-credit-notes?adjusted_against_invoice=${invoice.id}`);
      creditNotesApplied = (creditRes.data || []).filter(cn => 
        cn.adjusted_against_invoices?.some(adj => adj.invoice_id === invoice.id)
      );
    } catch (error) {
      console.error('Failed to fetch credit notes:', error);
    }
    
    const printWindow = window.open('', '_blank');
    
    // Calculate totals with rejection breakdown
    const totals = invoice.items.reduce((acc, item) => {
      const suppliedQty = item.supplied_qty || item.quantity || 0;
      const rejectedQty = item.rejected_qty || 0;
      const billableQty = suppliedQty - rejectedQty;
      const amount = billableQty * (item.mrp || 0);
      return {
        suppliedQty: acc.suppliedQty + suppliedQty,
        rejectedQty: acc.rejectedQty + rejectedQty,
        billableQty: acc.billableQty + billableQty,
        amount: acc.amount + amount
      };
    }, { suppliedQty: 0, rejectedQty: 0, billableQty: 0, amount: 0 });
    
    // Use stored totals if available
    const totalMrpValue = invoice.total_mrp_value || totals.amount;
    const grossValue = invoice.gross_value || (totalMrpValue + (invoice.rejection_amount || 0));
    const rejectionAmount = invoice.rejection_amount || (totals.rejectedQty * (invoice.items[0]?.mrp || 0));
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 850px; margin: 0 auto; font-size: 12px; }
          .header { text-align: center; margin-bottom: 20px; }
          .header h1 { color: #14532D; margin: 0; font-size: 24px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-box { padding: 10px; border: 1px solid #ddd; border-radius: 5px; flex: 1; margin: 0 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px 6px; text-align: center; font-size: 11px; }
          th { background: #f5f5f5; font-weight: bold; }
          .text-left { text-align: left; }
          .text-right { text-align: right; }
          .rejection { color: #dc2626; }
          .billable { color: #15803d; font-weight: bold; }
          .total-row { background: #f5f5f5; font-weight: bold; }
          .summary { margin-top: 15px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
          .summary-row { display: flex; justify-content: flex-end; gap: 20px; padding: 5px 0; font-size: 12px; }
          .total-final { font-weight: bold; font-size: 14px; border-top: 2px solid #14532D; padding-top: 10px; margin-top: 10px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Mr Organix</h1>
          <p>TAX INVOICE</p>
        </div>
        <div class="info-row">
          <div class="info-box">
            <strong>Invoice #:</strong> ${invoice.invoice_number}<br>
            <strong>Date:</strong> ${formatDate(invoice.invoice_date)}<br>
          </div>
          <div class="info-box">
            <strong>Bill To:</strong><br>
            ${dashboardData?.retailer?.company_name || invoice.retailer_name}<br>
            ${dashboardData?.retailer?.address || ''}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 25px;">#</th>
              <th class="text-left" style="width: 200px;">Item name</th>
              <th style="width: 70px;">Supplied Qty</th>
              <th style="width: 70px;">Rejection</th>
              <th style="width: 70px;">Billable Qty</th>
              <th style="width: 70px;">Rate</th>
              <th style="width: 80px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map((item, idx) => {
              const suppliedQty = item.supplied_qty || item.quantity || 0;
              const rejectedQty = item.rejected_qty || 0;
              const billableQty = suppliedQty - rejectedQty;
              const rate = item.mrp || 0;
              const amount = billableQty * rate;
              // Get translated product name and storage type for PDF
              const productMatch = products.find(p => p.id === item.product_id);
              const displayName = (i18n.language === 'hi' && productMatch?.name_hi) ? productMatch.name_hi : 
                                  (i18n.language === 'mr' && productMatch?.name_mr) ? productMatch.name_mr :
                                  (item.product_name || productMatch?.name || '');
              const storageType = productMatch?.storage_type || 'Outdoor';
              const storageColor = storageType === 'Fridge' ? '#1d4ed8' : '#b45309';
              // Resolve variant name in case it's a UUID
              const displayVariant = resolveVariantName(item.variant_name, item.variant_id);
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td class="text-left">${displayName}${displayVariant ? ' (' + displayVariant + ')' : ''}<br/><span style="font-size: 9px; color: ${storageColor}; font-style: italic;">(Storage - ${storageType})</span></td>
                  <td>${suppliedQty}</td>
                  <td class="rejection">${rejectedQty > 0 ? '-' + rejectedQty : '-'}</td>
                  <td class="billable">${billableQty}</td>
                  <td class="text-right">₹${rate.toFixed(2)}</td>
                  <td class="text-right">₹${amount.toFixed(2)}</td>
                </tr>
              `;
            }).join('')}
            <tr class="total-row">
              <td></td>
              <td class="text-left"><strong>Total</strong></td>
              <td><strong>${totals.suppliedQty}</strong></td>
              <td class="rejection"><strong>${totals.rejectedQty > 0 ? '-' + totals.rejectedQty : '-'}</strong></td>
              <td class="billable"><strong>${totals.billableQty}</strong></td>
              <td></td>
              <td class="text-right"><strong>₹${totalMrpValue.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>
        <div class="summary">
          ${grossValue !== totalMrpValue ? `<div class="summary-row">
            <span>Gross Value:</span>
            <span>₹${grossValue.toFixed(2)}</span>
          </div>` : ''}
          ${rejectionAmount > 0 ? `<div class="summary-row">
            <span style="color: #dc2626;">(-) Rejections:</span>
            <span style="color: #dc2626;">-₹${rejectionAmount.toFixed(2)}</span>
          </div>` : ''}
          <div class="summary-row">
            <span>Total MRP Value:</span>
            <span>₹${totalMrpValue.toFixed(2)}</span>
          </div>
          <div class="summary-row">
            <span style="color: #15803d;">Your Commission (${invoice.commission_percentage}%):</span>
            <span style="color: #15803d;">₹${invoice.commission_amount.toFixed(2)}</span>
          </div>
          <div class="summary-row total-final">
            <span>Invoice Amount:</span>
            <span>₹${invoice.net_payable.toFixed(2)}</span>
          </div>
          ${(invoice.credit_note_adjustments?.length > 0 && invoice.total_credit_adjusted > 0) ? `
          <div class="summary-row" style="color: #7c3aed;">
            <span>Credit Notes Adjusted:</span>
            <span>-₹${invoice.total_credit_adjusted.toFixed(2)}</span>
          </div>
          <div class="summary-row total-final" style="font-size: 16px; color: #15803d; background: #f0fdf4; padding: 8px; margin-top: 8px; border-radius: 4px;">
            <span>FINAL PAYABLE:</span>
            <span>₹${(invoice.final_payable ?? invoice.net_payable).toFixed(2)}</span>
          </div>
          ` : ''}
        </div>
        
        ${((invoice.final_payable ?? invoice.net_payable) <= 0.01 || invoice.payment_status === 'paid') ? `
        <div style="margin-top: 20px; padding: 15px; border: 2px solid #15803d; border-radius: 8px; background: #f0fdf4;">
          <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; color: #15803d;">
            <span>Payment Status:</span>
            <span>✓ FULLY SETTLED</span>
          </div>
          ${invoice.total_credit_adjusted > 0 ? `
          <div style="font-size: 11px; color: #666; margin-top: 5px;">
            Adjusted via Credit Notes: ₹${invoice.total_credit_adjusted.toFixed(2)}
          </div>
          ` : ''}
        </div>
        ` : (invoice.paid_amount > 0 || paymentHistory.length > 0) ? `
        <div style="margin-top: 20px; padding: 15px; border: 2px solid #15803d; border-radius: 8px; background: #f0fdf4;">
          <h3 style="color: #15803d; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid #bbf7d0; padding-bottom: 8px;">💳 Payment Details</h3>
          
          ${paymentHistory.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 11px;">
            <thead>
              <tr style="background: #dcfce7;">
                <th style="padding: 6px; text-align: left; border: 1px solid #bbf7d0;">#</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #bbf7d0;">Date</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #bbf7d0;">Mode</th>
                <th style="padding: 6px; text-align: left; border: 1px solid #bbf7d0;">Reference</th>
                <th style="padding: 6px; text-align: right; border: 1px solid #bbf7d0;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${paymentHistory.map((pmt, idx) => `
              <tr>
                <td style="padding: 6px; border: 1px solid #bbf7d0;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #bbf7d0;">${pmt.payment_date ? new Date(pmt.payment_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}) : '-'}</td>
                <td style="padding: 6px; border: 1px solid #bbf7d0; text-transform: uppercase;">${pmt.payment_mode || '-'}</td>
                <td style="padding: 6px; border: 1px solid #bbf7d0;">${pmt.reference_number || pmt.remarks || '-'}</td>
                <td style="padding: 6px; border: 1px solid #bbf7d0; text-align: right; font-weight: bold; color: #15803d;">₹${(pmt.amount || 0).toFixed(2)}</td>
              </tr>
              `).join('')}
              <tr style="background: #dcfce7; font-weight: bold;">
                <td colspan="4" style="padding: 6px; border: 1px solid #bbf7d0; text-align: right;">Total Paid:</td>
                <td style="padding: 6px; border: 1px solid #bbf7d0; text-align: right; color: #15803d;">₹${paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          ` : `
          <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #ddd;">
            <span>Amount Paid:</span>
            <span style="color: #15803d; font-weight: bold;">₹${(invoice.paid_amount || 0).toFixed(2)}</span>
          </div>
          ${invoice.payment_date ? `<div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #ddd;">
            <span>Payment Date:</span>
            <span>${new Date(invoice.payment_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</span>
          </div>` : ''}
          ${invoice.payment_mode ? `<div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #ddd;">
            <span>Payment Mode:</span>
            <span style="text-transform: uppercase;">${invoice.payment_mode}</span>
          </div>` : ''}
          `}
          
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; font-weight: bold; margin-top: 5px; ${((invoice.final_payable ?? invoice.net_payable) - (invoice.paid_amount || 0)) <= 0.01 ? 'color: #15803d;' : 'color: #dc2626;'}">
            <span>Balance:</span>
            <span>₹${Math.max(0, (invoice.final_payable ?? invoice.net_payable) - (invoice.paid_amount || 0)).toFixed(2)} ${((invoice.final_payable ?? invoice.net_payable) - (invoice.paid_amount || 0)) <= 0.01 ? '✓ PAID' : ''}</span>
          </div>
        </div>
        ` : `
        <div style="margin-top: 20px; padding: 15px; border: 2px solid #f59e0b; border-radius: 8px; background: #fffbeb;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; color: #b45309;">
            <span>Payment Status:</span>
            <span>PENDING - ₹${(invoice.final_payable ?? invoice.net_payable).toFixed(2)}</span>
          </div>
        </div>
        `}
        
        ${(invoice.credit_note_adjustments?.length > 0 && invoice.total_credit_adjusted > 0) ? `
        <div style="margin-top: 15px; border: 1px solid #1565c0; border-radius: 8px; overflow: hidden;">
          <div style="background: #e3f2fd; padding: 8px 10px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #1565c0;">
            Credit Notes Adjusted in this Invoice
          </div>
          
          ${(() => {
            // Group credit notes by original invoice
            const groupedByInvoice = {};
            invoice.credit_note_adjustments.forEach(adj => {
              const origInvNum = adj.original_invoice_number || 'Unknown Invoice';
              const rejDateRaw = adj.rejection_date;
              
              if (!groupedByInvoice[origInvNum]) {
                groupedByInvoice[origInvNum] = {
                  invoiceNumber: origInvNum,
                  rejectionDate: rejDateRaw,
                  creditNotes: []
                };
              }
              groupedByInvoice[origInvNum].creditNotes.push({
                ...adj,
                credit_note_date: adj.credit_note_date,
                rejection_date: rejDateRaw
              });
            });
            
            // Sort by rejection date
            const sortedGroups = Object.values(groupedByInvoice).sort((a, b) => {
              const dateA = a.rejectionDate ? new Date(a.rejectionDate) : new Date(0);
              const dateB = b.rejectionDate ? new Date(b.rejectionDate) : new Date(0);
              return dateA - dateB;
            });
            
            // Helper to extract date from invoice number like SAV-INV-30MAY2026-001
            const extractDateFromInvoiceNum = (invNum) => {
              if (!invNum) return null;
              const match = invNum.match(/(\d{1,2})([A-Z]{3})(\d{4})/i);
              if (match) {
                const months = {JAN:'Jan',FEB:'Feb',MAR:'Mar',APR:'Apr',MAY:'May',JUN:'Jun',JUL:'Jul',AUG:'Aug',SEP:'Sep',OCT:'Oct',NOV:'Nov',DEC:'Dec'};
                const day = match[1];
                const month = months[match[2].toUpperCase()] || match[2];
                const year = match[3];
                return day + ' ' + month + ' ' + year;
              }
              return null;
            };
            
            return sortedGroups.map(group => {
              const rejDateTime = group.rejectionDate ? new Date(group.rejectionDate) : null;
              let displayDate = '-';
              if (rejDateTime && !isNaN(rejDateTime.getTime())) {
                displayDate = rejDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              } else {
                const extractedDate = extractDateFromInvoiceNum(group.invoiceNumber);
                if (extractedDate) displayDate = extractedDate;
              }
              
              const groupTotal = group.creditNotes.reduce((sum, cn) => sum + (cn.adjusted_amount || 0), 0);
              
              return '<div style="border-bottom: 1px solid #ddd;">' +
                '<div style="background: #1565c0; color: white; padding: 10px 12px; font-size: 11px;">' +
                  '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div style="display: flex; align-items: center; gap: 20px;">' +
                      '<div><strong>' + displayDate + '</strong></div>' +
                      '<div style="color: #bbdefb;">|</div>' +
                      '<div>' + group.invoiceNumber + '</div>' +
                    '</div>' +
                    '<div style="font-weight: bold; font-size: 13px; color: #ffcdd2;">Total: -₹' + groupTotal.toFixed(2) + '</div>' +
                  '</div>' +
                '</div>' +
                group.creditNotes.map(adj => {
                  const cnNumber = adj.credit_note_number || '-';
                  const cnDateRaw = adj.credit_note_date;
                  const cnDate = cnDateRaw ? new Date(cnDateRaw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                  const cnTime = cnDateRaw ? new Date(cnDateRaw).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                  const amount = adj.adjusted_amount || 0;
                  const sourceLabel = adj.source === 'excess_payment' ? 'Excess Payment' : 'Rejection';
                  const rejectionDetails = adj.rejection_details || [];
                  
                  return '<div style="border-top: 1px solid #eee;">' +
                    '<div style="background: #f5f5f5; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">' +
                      '<div>' +
                        '<span style="font-weight: bold; color: #1565c0; font-size: 12px;">' + cnNumber + '</span>' +
                        '<span style="margin-left: 15px; color: #666; font-size: 10px;">Created: ' + cnDate + (cnTime ? ' ' + cnTime : '') + '</span>' +
                        '<span style="margin-left: 15px; padding: 2px 8px; border-radius: 3px; font-size: 9px; background: ' + (adj.source === 'excess_payment' ? '#fff3e0; color: #e65100;' : '#ffebee; color: #c62828;') + '">' + sourceLabel + '</span>' +
                      '</div>' +
                      '<div style="font-weight: bold; color: #c62828; font-size: 12px;">-₹' + amount.toFixed(2) + '</div>' +
                    '</div>' +
                    (adj.source === 'excess_payment' ? 
                      '<div style="padding: 8px 12px; color: #1565c0; font-style: italic; font-size: 10px; background: #fafafa;">Excess payment received from retailer.</div>' :
                      (rejectionDetails.length > 0 ? 
                        '<table style="width: 100%; border-collapse: collapse; font-size: 9px;">' +
                          '<thead><tr style="background: #fafafa;">' +
                            '<th style="padding: 5px 10px; text-align: left; border-bottom: 1px solid #eee;">Product</th>' +
                            '<th style="padding: 5px 10px; text-align: center; border-bottom: 1px solid #eee;">Qty</th>' +
                            '<th style="padding: 5px 10px; text-align: center; border-bottom: 1px solid #eee;">Reason</th>' +
                            '<th style="padding: 5px 10px; text-align: right; border-bottom: 1px solid #eee;">Value</th>' +
                          '</tr></thead>' +
                          '<tbody>' +
                            rejectionDetails.map(d => 
                              '<tr>' +
                                '<td style="padding: 4px 10px; border-bottom: 1px solid #f0f0f0;">' + (d.product_name || '-') + '</td>' +
                                '<td style="padding: 4px 10px; text-align: center; border-bottom: 1px solid #f0f0f0;">' + (d.quantity || '-') + '</td>' +
                                '<td style="padding: 4px 10px; text-align: center; border-bottom: 1px solid #f0f0f0; color: #c62828;">' + (d.reason || '-') + '</td>' +
                                '<td style="padding: 4px 10px; text-align: right; border-bottom: 1px solid #f0f0f0;">₹' + ((d.value || d.mrp || 0).toFixed ? (d.value || d.mrp || 0).toFixed(2) : (d.value || d.mrp || 0)) + '</td>' +
                              '</tr>'
                            ).join('') +
                          '</tbody>' +
                        '</table>'
                      : '<div style="padding: 8px 12px; color: #888; font-size: 10px; background: #fafafa;">No product details available</div>')
                    ) +
                  '</div>';
                }).join('') +
              '</div>';
            }).join('');
          })()}
          
          <div style="display: flex; justify-content: flex-end; padding: 10px; background: #e8f5e9; border-top: 2px solid #4caf50;">
            <div style="text-align: right;">
              <span style="font-weight: bold; margin-right: 20px;">Total Credit Adjusted:</span>
              <span style="font-weight: bold; color: #c62828; font-size: 14px;">-₹${invoice.total_credit_adjusted.toFixed(2)}</span>
            </div>
          </div>
        </div>
        ` : ''}
        
        <br><br>
        <button onclick="window.print()">Print Invoice</button>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ==================== SIMPLIFIED CLOSING INVENTORY FUNCTIONS ====================
  
  // Load inventory data for a specific date (combines opening, received, sold, rejection, closing)
  const loadInventoryData = useCallback(async (date) => {
    if (!dashboardData?.retailer?.id) return;
    setLoadingClosing(true);
    
    try {
      // Get previous day for opening qty
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = getLocalDateString(prevDate);
      
      // Load previous day closing (for opening qty) - now includes variant
      let prevClosingMap = {};
      try {
        const prevRes = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${prevDateStr}`);
        (prevRes.data.items || []).forEach(item => {
          if (item.closing_qty !== null && item.closing_qty !== undefined) {
            const key = `${item.product_id}_${item.variant_id || 'default'}`;
            prevClosingMap[key] = {
              closing_qty: item.closing_qty,
              product_name: item.product_name,
              variant_name: item.variant_name
            };
          }
        });
      } catch (e) {
        // No previous closing data
      }
      
      // Load current day closing
      let currentClosingMap = {};
      try {
        const curRes = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${date}`);
        (curRes.data.items || []).forEach(item => {
          const key = `${item.product_id}_${item.variant_id || 'default'}`;
          currentClosingMap[key] = {
            closing_qty: item.closing_qty,
            product_name: item.product_name,
            product_name_hi: item.product_name_hi,
            variant_id: item.variant_id,
            variant_name: item.variant_name || 'Kg'
          };
        });
      } catch (e) {
        // No current closing data
      }
      
      // Filter dispatches for this date to get received items (with variant)
      const dateDispatches = dispatches.filter(d => {
        const dispDate = d.dispatch_date?.split('T')[0];
        return dispDate === date;
      });
      
      // Calculate received qty per product+variant
      const receivedMap = {};
      dateDispatches.forEach(d => {
        (d.items || []).forEach(item => {
          const variantId = item.variant_id || item.packaging_id;
          const variantName = item.variant_name || item.packaging_name || 'Kg';
          const key = `${item.product_id}_${variantId || 'default'}`;
          if (!receivedMap[key]) {
            receivedMap[key] = {
              qty: 0,
              product_name: item.product_name,
              variant_id: variantId,
              variant_name: variantName
            };
          }
          receivedMap[key].qty += item.supplied_qty || 0;
        });
      });
      
      // Filter rejections for this date
      const dateRejections = rejections.filter(r => {
        const rejDate = r.rejection_date?.split('T')[0];
        return rejDate === date;
      });
      
      // Calculate rejection qty per product (rejections might not have variant)
      const rejectionMap = {};
      dateRejections.forEach(r => {
        const productId = r.product_id;
        const qty = r.quantity || 0;
        rejectionMap[productId] = (rejectionMap[productId] || 0) + qty;
      });
      
      // Build inventory data from all sources (variants from dispatch, closing, etc.)
      const inventoryMap = {};
      
      // FIRST: Build product-level fallback map from previous closing (for opening qty)
      const prevClosingByProduct = {};  // Fallback map: product_id -> total closing
      Object.entries(prevClosingMap).forEach(([key, data]) => {
        const [productId] = key.split('_');
        if (!prevClosingByProduct[productId]) {
          prevClosingByProduct[productId] = 0;
        }
        prevClosingByProduct[productId] += data.closing_qty || 0;
      });
      
      // NEW LOGIC: Start by adding ALL products from the products list
      // This ensures every product is shown, even those without activity
      products.forEach(product => {
        const productId = product.id;
        const key = `${productId}_default`;
        
        // Get opening qty from previous closing if available
        let openingQty = 0;
        if (prevClosingMap[key]) {
          openingQty = prevClosingMap[key].closing_qty || 0;
        } else if (prevClosingByProduct[productId]) {
          openingQty = prevClosingByProduct[productId];
        }
        
        inventoryMap[key] = {
          product_id: productId,
          product_name: product.name,
          product_name_hi: product.name_hi,
          variant_id: null,
          variant_name: 'Kg',
          unit: 'Kg',
          opening_qty: openingQty,
          received_qty: 0,
          rejection_qty: 0,
          items_sold: null,
          closing_qty: undefined
        };
      });
      
      // Add items from received dispatches - now can use prevClosingByProduct for opening
      Object.entries(receivedMap).forEach(([key, data]) => {
        const [productId, variantId] = key.split('_');
        if (!inventoryMap[key]) {
          const product = products.find(p => p.id === productId);
          
          // Try to get opening from exact key match first, then product-level fallback
          let openingQty = 0;
          if (prevClosingMap[key]) {
            openingQty = prevClosingMap[key].closing_qty || 0;
          } else if (prevClosingByProduct[productId]) {
            // Fallback: use product-level previous closing if variant key didn't match
            openingQty = prevClosingByProduct[productId];
          }
          
          inventoryMap[key] = {
            product_id: productId,
            product_name: data.product_name || product?.name,
            product_name_hi: product?.name_hi,
            variant_id: data.variant_id,
            variant_name: data.variant_name || 'Kg',
            unit: data.variant_name || 'Kg',
            opening_qty: openingQty,
            received_qty: 0,
            rejection_qty: 0,
            items_sold: null,
            closing_qty: undefined
          };
        }
        inventoryMap[key].received_qty = data.qty;
      });
      
      // Add items from previous closing (opening qty)
      Object.entries(prevClosingMap).forEach(([key, data]) => {
        const [productId, variantId] = key.split('_');
        
        if (!inventoryMap[key]) {
          const product = products.find(p => p.id === productId);
          inventoryMap[key] = {
            product_id: productId,
            product_name: data.product_name || product?.name,
            product_name_hi: product?.name_hi,
            variant_id: variantId === 'default' ? null : variantId,
            variant_name: data.variant_name || 'Kg',
            unit: data.variant_name || 'Kg',
            opening_qty: 0,
            received_qty: 0,
            rejection_qty: 0,
            items_sold: null,
            closing_qty: undefined
          };
        }
        inventoryMap[key].opening_qty = data.closing_qty || 0;
      });
      
      // Add items from current closing
      Object.entries(currentClosingMap).forEach(([key, data]) => {
        const [productId, variantId] = key.split('_');
        if (!inventoryMap[key]) {
          const product = products.find(p => p.id === productId);
          inventoryMap[key] = {
            product_id: productId,
            product_name: data.product_name || product?.name,
            product_name_hi: data.product_name_hi || product?.name_hi,
            variant_id: data.variant_id,
            variant_name: data.variant_name || 'Kg',
            unit: data.variant_name || 'Kg',
            opening_qty: 0,
            received_qty: 0,
            rejection_qty: 0,
            items_sold: null,
            closing_qty: undefined
          };
          
          // Try to get opening from exact key match first, then product-level fallback
          if (prevClosingMap[key]) {
            inventoryMap[key].opening_qty = prevClosingMap[key].closing_qty || 0;
          } else if (prevClosingByProduct[productId]) {
            // Fallback: use product-level previous closing if variant key didn't match
            inventoryMap[key].opening_qty = prevClosingByProduct[productId];
          }
        }
        inventoryMap[key].closing_qty = data.closing_qty;
      });
      
      // Apply rejections (by product_id, distributed if needed)
      Object.entries(rejectionMap).forEach(([productId, qty]) => {
        // Find all variants for this product and apply rejection
        const productKeys = Object.keys(inventoryMap).filter(k => k.startsWith(`${productId}_`));
        if (productKeys.length === 1) {
          inventoryMap[productKeys[0]].rejection_qty = qty;
        } else if (productKeys.length > 1) {
          // Distribute rejection proportionally or to first item
          inventoryMap[productKeys[0]].rejection_qty = qty;
        }
      });
      
      // Calculate items sold for each entry: Items Sold = Opening + Received - Rejection - Closing
      const inventoryItemsRaw = Object.values(inventoryMap).map(item => {
        const calculatedSold = item.closing_qty !== undefined && item.closing_qty !== null
          ? (item.opening_qty + item.received_qty - item.rejection_qty - item.closing_qty)
          : null;
        // Default to 0 if sold items are negative (due to missing earlier data)
        const itemsSold = calculatedSold !== null ? Math.max(0, calculatedSold) : null;
        return { ...item, items_sold: itemsSold };
      });
      
      // Deduplicate by product_id + variant_name to prevent showing same item twice
      const seenKeys = new Set();
      const inventoryItems = inventoryItemsRaw.filter(item => {
        const key = `${item.product_id}_${item.variant_name || 'Kg'}`;
        if (seenKeys.has(key)) {
          return false; // Skip duplicate
        }
        seenKeys.add(key);
        return true;
      });
      
      // Two-step sorting:
      // 1. Products with non-zero closing qty first, sorted by descending closing qty
      // 2. Products with zero/null/undefined closing, sorted by descending closing qty (all show 0)
      inventoryItems.sort((a, b) => {
        // Check if closing_qty is a positive number (not null, undefined, or 0)
        const aClosing = typeof a.closing_qty === 'number' ? a.closing_qty : 0;
        const bClosing = typeof b.closing_qty === 'number' ? b.closing_qty : 0;
        const aHasClosing = aClosing > 0;
        const bHasClosing = bClosing > 0;
        
        // Non-zero closing comes first
        if (aHasClosing && !bHasClosing) return -1;
        if (!aHasClosing && bHasClosing) return 1;
        
        // Within same group, sort by descending closing qty
        return bClosing - aClosing;
      });
      
      setInventoryData(inventoryItems);
    } catch (error) {
      console.error('Failed to load inventory data:', error);
      toast.error('Failed to load inventory data');
      setInventoryData([]);
    } finally {
      setLoadingClosing(false);
    }
  }, [dashboardData, dispatches, rejections, products]);

  // Load inventory when date or tab changes or when dispatches are loaded
  useEffect(() => {
    if ((activeTab === 'closing' && closingSubTab === 'daily-inventory') && dashboardData?.retailer?.id && products.length > 0) {
      loadInventoryData(inventoryDate);
    }
  }, [activeTab, closingSubTab, inventoryDate, dashboardData, products.length, dispatches.length, loadInventoryData]);
  
  // Load recorded dates
  const loadRecordedDates = async () => {
    if (!dashboardData?.retailer?.id) return;
    try {
      const res = await api.get(`/api/retailer-closing-inventory/dates/${dashboardData.retailer.id}`);
      setRecordedDates(res.data || []);
    } catch (error) {
      console.error('Failed to load recorded dates:', error);
    }
  };

  // Load closing history for a specific date
  const loadClosingHistory = async (date) => {
    if (!dashboardData?.retailer?.id) return;
    setLoadingClosing(true);
    try {
      // For historical dates, use filter_inactive to only show products with non-zero opening OR closing
      const today = getLocalDateString();
      const isHistorical = date !== today;
      const filterParam = isHistorical ? '&filter_inactive=true' : '';
      
      const res = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${date}${filterParam}`);
      // Filter to only show items that have a closing qty recorded
      const recordedItems = (res.data.items || []).filter(item => item.closing_qty !== null && item.closing_qty !== undefined);
      setClosingHistory(recordedItems);
    } catch (error) {
      console.error('Failed to load closing history:', error);
      toast.error('Failed to load closing data');
      setClosingHistory([]);
    } finally {
      setLoadingClosing(false);
    }
  };

  // Open Record Closing modal - show only variants with opening qty OR in today's dispatch
  // Open closing modal for a specific date (used for yesterday's closing)
  const openRecordClosingModalForDate = async (targetDate) => {
    if (!dashboardData?.retailer?.id) {
      toast.error('Retailer ID not found');
      return;
    }
    
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = getLocalDateString(prevDate);
    
    // Set the closing date to the target date
    setClosingDate(targetDate);
    
    try {
      // Build a map of actual variant names from ALL dispatch history
      const variantInfoFromDispatches = {};
      dispatches.forEach(d => {
        (d.items || []).forEach(item => {
          const variantId = item.variant_id || item.packaging_id;
          const variantName = item.variant_name || item.packaging_name;
          
          if (variantName && variantName !== 'Kg') {
            const key = `${item.product_id}_${variantId || 'default'}`;
            if (!variantInfoFromDispatches[key]) {
              variantInfoFromDispatches[key] = {
                variant_id: variantId,
                variant_name: variantName
              };
            }
          }
          
          if (variantName && variantName !== 'Kg' && !variantInfoFromDispatches[item.product_id]) {
            variantInfoFromDispatches[item.product_id] = {
              variant_id: variantId,
              variant_name: variantName
            };
          }
        });
      });
      
      // Get previous day closing (for opening qty)
      let openingVariants = {};
      try {
        const prevRes = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${prevDateStr}`);
        (prevRes.data.items || []).forEach(item => {
          if (item.closing_qty !== null && item.closing_qty !== undefined && item.closing_qty > 0) {
            const key = `${item.product_id}_${item.variant_id || 'default'}`;
            
            let actualVariantName = item.variant_name;
            let actualVariantId = item.variant_id;
            
            const dispatchInfo = variantInfoFromDispatches[key] || variantInfoFromDispatches[item.product_id];
            if (dispatchInfo && actualVariantName === 'Kg') {
              actualVariantName = dispatchInfo.variant_name;
              actualVariantId = dispatchInfo.variant_id;
            }
            
            openingVariants[key] = {
              product_id: item.product_id,
              product_name: item.product_name,
              product_name_hi: item.product_name_hi,
              variant_id: actualVariantId,
              variant_name: actualVariantName || 'Kg',
              opening_qty: item.closing_qty || 0,
              source: 'opening'
            };
          }
        });
      } catch (err) {
        console.log('No previous closing data');
      }
      
      // Get dispatches for the target date
      const targetDispatches = dispatches.filter(d => {
        const dispatchDate = d.dispatch_date?.split('T')[0];
        return dispatchDate === targetDate;
      });
      
      // Build map of variants from target day dispatches
      const targetDispatchVariants = {};
      targetDispatches.forEach(d => {
        (d.items || []).forEach(item => {
          const variantId = item.variant_id || item.packaging_id;
          const variantName = item.variant_name || item.packaging_name || 'Kg';
          const key = `${item.product_id}_${variantId || 'default'}`;
          
          if (!targetDispatchVariants[key]) {
            const product = products.find(p => p.id === item.product_id);
            targetDispatchVariants[key] = {
              product_id: item.product_id,
              product_name: item.product_name,
              product_name_hi: product?.name_hi,
              variant_id: variantId,
              variant_name: variantName,
              dispatch_qty: 0,
              source: 'dispatch'
            };
          }
          targetDispatchVariants[key].dispatch_qty += item.supplied_qty || 0;
        });
      });
      
      // Merge opening and dispatch variants
      const allRelevantVariants = { ...openingVariants };
      Object.entries(targetDispatchVariants).forEach(([key, data]) => {
        if (allRelevantVariants[key]) {
          allRelevantVariants[key].dispatch_qty = data.dispatch_qty;
          allRelevantVariants[key].source = 'both';
          if (allRelevantVariants[key].variant_name === 'Kg' && data.variant_name !== 'Kg') {
            allRelevantVariants[key].variant_name = data.variant_name;
            allRelevantVariants[key].variant_id = data.variant_id;
          }
        } else {
          allRelevantVariants[key] = data;
        }
      });
      
      // Start with ALL products
      const allProductsMap = {};
      products.forEach(p => {
        const key = `${p.id}_default`;
        allProductsMap[key] = {
          product_id: p.id,
          product_name: p.name,
          product_name_hi: p.name_hi,
          variant_id: null,
          variant_name: 'Kg',
          opening_qty: 0,
          dispatch_qty: 0,
          source: 'product_list'
        };
      });
      
      // Merge activity data
      Object.entries(allRelevantVariants).forEach(([key, data]) => {
        if (allProductsMap[key]) {
          allProductsMap[key].variant_id = data.variant_id || allProductsMap[key].variant_id;
          allProductsMap[key].variant_name = data.variant_name || allProductsMap[key].variant_name;
          allProductsMap[key].opening_qty = data.opening_qty || 0;
          allProductsMap[key].dispatch_qty = data.dispatch_qty || 0;
          allProductsMap[key].source = data.source;
        } else {
          allProductsMap[key] = data;
        }
      });
      
      // Convert to list and sort
      const seenKeys = new Set();
      const items = Object.values(allProductsMap)
        .map(v => ({
          product_id: v.product_id,
          product_name: v.product_name,
          product_name_hi: v.product_name_hi,
          variant_id: v.variant_id,
          variant_name: v.variant_name || 'Kg',
          unit: v.variant_name && v.variant_name !== 'Kg' ? 'Pcs' : 'Kg',
          closing_qty: '',
          has_variants: v.variant_name && v.variant_name !== 'Kg',
          opening_qty: v.opening_qty || 0,
          dispatch_qty: v.dispatch_qty || 0,
          source: v.source
        }))
        .filter(item => {
          const key = `${item.product_id}_${item.variant_name}`;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
      
      // Sort: products with activity first
      items.sort((a, b) => {
        const aHasActivity = (a.opening_qty > 0 || a.dispatch_qty > 0);
        const bHasActivity = (b.opening_qty > 0 || b.dispatch_qty > 0);
        if (aHasActivity && !bHasActivity) return -1;
        if (!aHasActivity && bHasActivity) return 1;
        const nameCompare = (a.product_name || '').localeCompare(b.product_name || '');
        if (nameCompare !== 0) return nameCompare;
        return (a.variant_name || '').localeCompare(b.variant_name || '');
      });
      
      setClosingItems(items);
      setShowRecordClosingModal(true);
      
      // Hide the banner after opening
      setShowYesterdayBanner(false);
      
    } catch (error) {
      console.error('Failed to prepare closing modal:', error);
      toast.error('Failed to load closing data');
    }
  };

  const openRecordClosingModal = async () => {
    if (!dashboardData?.retailer?.id) {
      toast.error('Retailer ID not found');
      return;
    }
    
    const today = getLocalDateString();
    const prevDate = new Date();
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = getLocalDateString(prevDate);
    
    try {
      // Build a map of actual variant names from ALL dispatch history
      // This helps us show proper variant names like "240-260 gm" instead of "Kg"
      const variantInfoFromDispatches = {};
      dispatches.forEach(d => {
        (d.items || []).forEach(item => {
          const variantId = item.variant_id || item.packaging_id;
          const variantName = item.variant_name || item.packaging_name;
          
          // Only store if we have a meaningful variant name (not Kg)
          if (variantName && variantName !== 'Kg') {
            const key = `${item.product_id}_${variantId || 'default'}`;
            if (!variantInfoFromDispatches[key]) {
              variantInfoFromDispatches[key] = {
                variant_id: variantId,
                variant_name: variantName
              };
            }
          }
          
          // Also store by product_id only for fallback
          if (variantName && variantName !== 'Kg' && !variantInfoFromDispatches[item.product_id]) {
            variantInfoFromDispatches[item.product_id] = {
              variant_id: variantId,
              variant_name: variantName
            };
          }
        });
      });
      
      // Get previous day closing (for opening qty)
      let openingVariants = {};
      try {
        const prevRes = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${prevDateStr}`);
        (prevRes.data.items || []).forEach(item => {
          if (item.closing_qty !== null && item.closing_qty !== undefined && item.closing_qty > 0) {
            const key = `${item.product_id}_${item.variant_id || 'default'}`;
            
            // Try to get actual variant name from dispatch history
            let actualVariantName = item.variant_name;
            let actualVariantId = item.variant_id;
            
            // If variant is "Kg" or empty, look up from dispatch history
            if (!actualVariantName || actualVariantName === 'Kg') {
              // Try exact match first
              if (variantInfoFromDispatches[key]) {
                actualVariantName = variantInfoFromDispatches[key].variant_name;
                actualVariantId = variantInfoFromDispatches[key].variant_id || actualVariantId;
              }
              // Fallback to product-level match
              else if (variantInfoFromDispatches[item.product_id]) {
                actualVariantName = variantInfoFromDispatches[item.product_id].variant_name;
                actualVariantId = variantInfoFromDispatches[item.product_id].variant_id || actualVariantId;
              }
              else {
                actualVariantName = 'Kg';
              }
            }
            
            openingVariants[key] = {
              product_id: item.product_id,
              product_name: item.product_name,
              product_name_hi: item.product_name_hi,
              variant_id: actualVariantId,
              variant_name: actualVariantName,
              opening_qty: item.closing_qty,
              source: 'opening'
            };
          }
        });
      } catch (e) {
        console.log('No previous closing data');
      }
      
      // Get today's dispatches
      let todayDispatchVariants = {};
      const todayDispatches = dispatches.filter(d => {
        const dispDate = d.dispatch_date?.split('T')[0];
        return dispDate === today;
      });
      
      todayDispatches.forEach(d => {
        (d.items || []).forEach(item => {
          const variantId = item.variant_id || item.packaging_id;
          const variantName = item.variant_name || item.packaging_name || 'Kg';
          const key = `${item.product_id}_${variantId || 'default'}`;
          
          if (!todayDispatchVariants[key]) {
            const product = products.find(p => p.id === item.product_id);
            todayDispatchVariants[key] = {
              product_id: item.product_id,
              product_name: item.product_name,
              product_name_hi: product?.name_hi,
              variant_id: variantId,
              variant_name: variantName,
              dispatch_qty: 0,
              source: 'dispatch'
            };
          }
          todayDispatchVariants[key].dispatch_qty += item.supplied_qty || 0;
        });
      });
      
      // Merge: combine opening and dispatch variants
      const allRelevantVariants = { ...openingVariants };
      Object.entries(todayDispatchVariants).forEach(([key, data]) => {
        if (allRelevantVariants[key]) {
          allRelevantVariants[key].dispatch_qty = data.dispatch_qty;
          allRelevantVariants[key].source = 'both';
          // Prefer dispatch variant name if opening has "Kg"
          if (allRelevantVariants[key].variant_name === 'Kg' && data.variant_name !== 'Kg') {
            allRelevantVariants[key].variant_name = data.variant_name;
            allRelevantVariants[key].variant_id = data.variant_id;
          }
        } else {
          allRelevantVariants[key] = data;
        }
      });
      
      // NEW LOGIC: Start with ALL products, then merge activity data
      // This ensures every product is shown, even those without activity
      const allProductsMap = {};
      products.forEach(p => {
        const key = `${p.id}_default`;
        allProductsMap[key] = {
          product_id: p.id,
          product_name: p.name,
          product_name_hi: p.name_hi,
          variant_id: null,
          variant_name: 'Kg',
          opening_qty: 0,
          dispatch_qty: 0,
          source: 'product_list'
        };
      });
      
      // Merge activity data (opening/dispatch) into the products map
      Object.entries(allRelevantVariants).forEach(([key, data]) => {
        if (allProductsMap[key]) {
          // Update existing product entry with activity data
          allProductsMap[key].variant_id = data.variant_id || allProductsMap[key].variant_id;
          allProductsMap[key].variant_name = data.variant_name || allProductsMap[key].variant_name;
          allProductsMap[key].opening_qty = data.opening_qty || 0;
          allProductsMap[key].dispatch_qty = data.dispatch_qty || 0;
          allProductsMap[key].source = data.source;
        } else {
          // Add new variant entry (variant-specific that didn't match default key)
          allProductsMap[key] = data;
        }
      });
      
      // Convert to list and deduplicate by product_id + variant_name combination
      const seenKeys = new Set();
      const items = Object.values(allProductsMap)
        .map(v => ({
          product_id: v.product_id,
          product_name: v.product_name,
          product_name_hi: v.product_name_hi,
          variant_id: v.variant_id,
          variant_name: v.variant_name || 'Kg',
          unit: v.variant_name && v.variant_name !== 'Kg' ? 'Pcs' : 'Kg',
          closing_qty: '',
          has_variants: v.variant_name && v.variant_name !== 'Kg',
          opening_qty: v.opening_qty || 0,
          dispatch_qty: v.dispatch_qty || 0,
          source: v.source
        }))
        .filter(item => {
          // Deduplicate by product_id + variant_name
          const key = `${item.product_id}_${item.variant_name}`;
          if (seenKeys.has(key)) {
            return false; // Skip duplicate
          }
          seenKeys.add(key);
          return true;
        });
      
      // Sort: products with activity (opening_qty > 0 OR dispatch_qty > 0) first, then by name
      items.sort((a, b) => {
        const aHasActivity = (a.opening_qty > 0 || a.dispatch_qty > 0);
        const bHasActivity = (b.opening_qty > 0 || b.dispatch_qty > 0);
        
        // Products with activity come first
        if (aHasActivity && !bHasActivity) return -1;
        if (!aHasActivity && bHasActivity) return 1;
        
        // Within same group, sort by product name
        const nameCompare = (a.product_name || '').localeCompare(b.product_name || '');
        if (nameCompare !== 0) return nameCompare;
        return (a.variant_name || '').localeCompare(b.variant_name || '');
      });
      
      setClosingItems(items);
      
      setClosingDate(today);
      setEditingClosingDate(null);
      setClosingSearchTerm('');
      setShowRecordClosingModal(true);
    } catch (error) {
      console.error('Failed to load product variants:', error);
      // Fallback to all products
      const allProducts = products.map(p => ({
        product_id: p.id,
        product_name: p.name,
        product_name_hi: p.name_hi,
        variant_id: null,
        variant_name: 'Kg',
        unit: p.unit || 'Kg',
        closing_qty: '',
        has_variants: false
      }));
      setClosingItems(allProducts);
      setClosingDate(getLocalDateString());
      setEditingClosingDate(null);
      setClosingSearchTerm('');
      setShowRecordClosingModal(true);
    }
  };

  // Update closing qty for a product+variant combination
  const updateClosingQty = (productId, variantId, value) => {
    setClosingItems(prev => prev.map(item => 
      (item.product_id === productId && item.variant_id === variantId)
        ? { ...item, closing_qty: value }
        : item
    ));
  };

  // Save closing inventory
  const saveClosingInventory = async (forceZeroPending = false) => {
    if (!dashboardData?.retailer?.id || !closingDate) {
      toast.error('Missing required data');
      return;
    }

    // Check for pending items (items without qty)
    const pendingItems = closingItems.filter(item => item.closing_qty === '' || item.closing_qty === null);
    const filledItems = closingItems.filter(item => item.closing_qty !== '' && item.closing_qty !== null);
    
    // If there are pending items and user hasn't confirmed, show confirmation dialog
    if (pendingItems.length > 0 && !forceZeroPending) {
      setShowPendingConfirmation(true);
      return;
    }

    setSavingClosing(true);
    try {
      // If forceZeroPending, set all pending items to 0
      const itemsToSave = forceZeroPending 
        ? closingItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name || 'Kg',
            closing_qty: item.closing_qty === '' || item.closing_qty === null ? 0 : parseFloat(item.closing_qty)
          }))
        : closingItems.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name || 'Kg',
            closing_qty: item.closing_qty === '' ? null : parseFloat(item.closing_qty)
          }));

      const res = await api.post('/api/retailer-closing-inventory/record', {
        retailer_id: dashboardData.retailer.id,
        closing_date: closingDate,
        items: itemsToSave
      });
      
      toast.success(`Saved closing inventory: ${res.data.items_saved} items`);
      setShowRecordClosingModal(false);
      setShowPendingConfirmation(false);
      setClosingSearchTerm('');
      await loadRecordedDates();
      await loadClosingHistory(closingHistoryDate);
    } catch (error) {
      console.error('Failed to save closing inventory:', error);
      toast.error('Failed to save closing inventory');
    } finally {
      setSavingClosing(false);
    }
  };
  
  // Continue filling pending items (dismiss confirmation and return to modal)
  const continueFilling = () => {
    setShowPendingConfirmation(false);
    // Clear search to show all items, focusing on pending ones
    setClosingSearchTerm('');
  };
  
  // Get filtered closing items based on search term
  const filteredClosingItems = closingItems.filter(item => {
    if (!closingSearchTerm) return true;
    const searchLower = closingSearchTerm.toLowerCase();
    const productName = getProductName(item).toLowerCase();
    const englishName = (item.product_name || '').toLowerCase();
    const variantName = (item.variant_name || '').toLowerCase();
    return productName.includes(searchLower) || englishName.includes(searchLower) || variantName.includes(searchLower);
  });
  
  // Get pending items count
  const pendingItemsCount = closingItems.filter(item => item.closing_qty === '' || item.closing_qty === null).length;
  const filledItemsCount = closingItems.filter(item => item.closing_qty !== '' && item.closing_qty !== null).length;
  
  // Edit closing inventory for a date
  const editClosingInventory = async (date) => {
    if (!dashboardData?.retailer?.id) return;
    
    try {
      // Load existing closing data for this date
      const res = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${date}`);
      
      // Populate closingItems with existing values
      const allProducts = products.map(p => {
        const existingItem = res.data.items.find(item => item.product_id === p.id);
        return {
          product_id: p.id,
          product_name: p.name,
          unit: p.unit || 'Kg',
          closing_qty: existingItem?.closing_qty !== null && existingItem?.closing_qty !== undefined 
            ? existingItem.closing_qty.toString() 
            : ''
        };
      });
      
      setClosingItems(allProducts);
      setClosingDate(date);
      setEditingClosingDate(date);
      setShowRecordClosingModal(true);
    } catch (error) {
      toast.error('Failed to load closing data for editing');
    }
  };
  
  // Delete closing inventory for a date
  const deleteClosingInventory = async (date) => {
    if (!dashboardData?.retailer?.id) return;
    
    if (!window.confirm(`Are you sure you want to delete closing inventory for ${date}?`)) {
      return;
    }
    
    try {
      await api.delete(`/api/retailer-closing-inventory/${dashboardData.retailer.id}/${date}`);
      toast.success('Closing inventory deleted successfully');
      await loadRecordedDates();
      await loadClosingHistory(closingHistoryDate);
    } catch (error) {
      toast.error('Failed to delete closing inventory');
    }
  };

  // Start editing a single closing item inline
  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    setEditingItemQty(item.closing_qty?.toString() || '');
  };

  // Save the edited closing item
  const saveEditingItem = async () => {
    if (!editingItemId) return;
    
    try {
      await api.put(`/api/retailer-closing-inventory/item/${editingItemId}`, {
        closing_qty: parseFloat(editingItemQty)
      });
      toast.success('Item updated successfully');
      setEditingItemId(null);
      setEditingItemQty('');
      await loadClosingHistory(closingHistoryDate);
    } catch (error) {
      toast.error('Failed to update item');
    }
  };

  // Delete a single closing item
  const deleteClosingItem = async (itemId, productName) => {
    if (!window.confirm(`Delete closing entry for "${productName}"?`)) {
      return;
    }
    
    try {
      await api.delete(`/api/retailer-closing-inventory/item/${itemId}`);
      toast.success('Item deleted successfully');
      await loadClosingHistory(closingHistoryDate);
      await loadRecordedDates();
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  // Load closing history when date changes or tab switches
  useEffect(() => {
    if (activeTab === 'inventory' && dashboardData?.retailer?.id) {
      loadClosingHistory(closingHistoryDate);
      loadRecordedDates();
    }
  }, [activeTab, closingHistoryDate, dashboardData?.retailer?.id]);

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const menuItems = [
    { id: 'dashboard', label: t('retailer.home') || 'Home', icon: TrendingUp },
    { id: 'orders', label: t('retailer.myOrders') || 'My Orders', icon: Truck },
    { id: 'ledger', label: 'Payment Ledger', icon: FileText },
    { id: 'statement', label: 'Statement', icon: FileText },
    { id: 'finalsummary', label: 'Final Summary', icon: FileText },
    { id: 'rejections', label: 'Rejections', icon: AlertTriangle },
    { id: 'creditnotes', label: 'Credit Notes', icon: CreditCard },
    { id: 'closing', label: t('retailer.closing') || 'Closing', icon: ClipboardList },
    { id: 'account', label: t('retailer.myAccount') || 'My Account', icon: User }
  ];

  const summary = dashboardData?.summary || {};

  return (
    <Layout title={t('retailer.portal')} hideTitle hideSidebar>
      <div data-testid="retailer-dashboard" className="relative">
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
                    setActiveTab(item.id);
                    setSideMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === item.id 
                      ? 'bg-[#14532D] text-white' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
            
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
          {/* Header with Hamburger */}
          <div className="flex items-center gap-4 mb-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSideMenuOpen(true);
              }}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 touch-none"
              data-testid="hamburger-menu-btn"
            >
              <Menu size={24} />
            </Button>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
              {t('retailer.welcome')}, {dashboardData?.retailer?.company_name || dashboardData?.retailer?.name || 'Retailer'}
            </h1>
          </div>

          {/* Removed: Yesterday's Closing Missing Banner */}

        {/* ==================== DASHBOARD TAB ==================== */}
        {activeTab === 'dashboard' && (
          <>
            {/* Quick Create Order Card - Above Your Earnings */}
            <Card className="mb-4 border-[#14532D] bg-gradient-to-r from-green-50 to-emerald-50 shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#14532D] rounded-xl">
                      <ShoppingCart size={24} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">Create New Order</h3>
                      <p className="text-sm text-gray-600">
                        Order for {new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <Button 
                    className="bg-[#14532D] hover:bg-[#166534] px-6"
                    onClick={() => setActiveTab('placeorder')}
                    data-testid="home-create-order-btn"
                  >
                    <Plus size={18} className="mr-2" />
                    Create Order
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Your Earnings - Big Card with Date Picker */}
            <Card className="mb-6 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-4 bg-emerald-100 rounded-xl">
                      <DollarSign size={36} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-emerald-600 font-semibold uppercase tracking-wide">{t('retailer.yourEarnings') || 'Your Earnings'}</p>
                      {(() => {
                        const filteredDispatches = dispatches.filter(d => {
                          const dispDate = d.dispatch_date?.split('T')[0];
                          return dashboardDateFrom && dispDate >= dashboardDateFrom && dispDate <= dashboardDateTo;
                        });
                        const filteredRejections = rejections.filter(r => {
                          const rejDate = r.rejection_date?.split('T')[0];
                          return dashboardDateFrom && rejDate >= dashboardDateFrom && rejDate <= dashboardDateTo;
                        });
                        const retailerCommPct = dashboardData?.retailer?.commission_percentage || 0;
                        const grossMrpValue = filteredDispatches.reduce((sum, d) => {
                          if (d.total_mrp_value && d.total_mrp_value > 0) return sum + d.total_mrp_value;
                          return sum + (d.items?.reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0) || 0);
                        }, 0);
                        const totalRejectionValue = filteredRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
                        const netMrpValue = grossMrpValue - totalRejectionValue;
                        const totalCommission = netMrpValue * retailerCommPct / 100;
                        
                        // Calculate unique days with orders
                        const uniqueOrderDays = new Set(
                          filteredDispatches.map(d => d.dispatch_date?.split('T')[0]).filter(Boolean)
                        ).size;
                        
                        // Average earnings per day (only days with orders)
                        const avgEarningsPerDay = uniqueOrderDays > 0 ? totalCommission / uniqueOrderDays : 0;
                        
                        return (
                          <div>
                            <p className="text-4xl md:text-5xl font-bold text-emerald-700">{formatCurrency(totalCommission)}</p>
                            {uniqueOrderDays > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-emerald-600 font-medium">Avg. Per Day:</span>
                                <span className="text-sm font-bold text-emerald-600">{formatCurrency(avgEarningsPerDay)}</span>
                                <span className="text-xs text-gray-500">({uniqueOrderDays} days with orders)</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-3 bg-white/70 p-3 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-emerald-600" />
                      <span className="text-sm font-medium text-gray-600">{t('retailer.period') || 'Period'}:</span>
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
                
                {/* Trend Charts with Daily/Weekly/Monthly Tabs */}
                {(() => {
                  // Prepare chart data from filtered dispatches
                  const filteredDispatches = dispatches.filter(d => {
                    const dispDate = d.dispatch_date?.split('T')[0];
                    return dashboardDateFrom && dispDate >= dashboardDateFrom && dispDate <= dashboardDateTo;
                  });
                  const filteredRejections = rejections.filter(r => {
                    const rejDate = r.rejection_date?.split('T')[0];
                    return dashboardDateFrom && rejDate >= dashboardDateFrom && rejDate <= dashboardDateTo;
                  });
                  const retailerCommPct = dashboardData?.retailer?.commission_percentage || 0;
                  
                  // Helper to get week start (Monday) for a date
                  const getWeekStart = (dateStr) => {
                    const date = new Date(dateStr);
                    const day = date.getDay();
                    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                    const weekStart = new Date(date.setDate(diff));
                    return weekStart.toISOString().split('T')[0];
                  };
                  
                  // Helper to get month key
                  const getMonthKey = (dateStr) => {
                    const date = new Date(dateStr);
                    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                  };
                  
                  // Helper to format labels
                  const formatWeekLabel = (weekStartStr) => {
                    const start = new Date(weekStartStr);
                    const end = new Date(start);
                    end.setDate(end.getDate() + 6);
                    const fmt = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    return `${fmt(start)} - ${fmt(end)}`;
                  };
                  
                  const formatMonthLabel = (monthKey) => {
                    const [year, month] = monthKey.split('-');
                    const date = new Date(year, parseInt(month) - 1, 1);
                    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                  };
                  
                  // Group data based on view mode
                  const groupedData = {};
                  
                  filteredDispatches.forEach(d => {
                    const date = d.dispatch_date?.split('T')[0];
                    if (!date) return;
                    
                    let key, label, shortLabel;
                    if (chartViewMode === 'daily') {
                      key = date;
                      label = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
                      shortLabel = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    } else if (chartViewMode === 'weekly') {
                      key = getWeekStart(date);
                      label = formatWeekLabel(key);
                      shortLabel = new Date(key).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    } else {
                      key = getMonthKey(date);
                      label = formatMonthLabel(key);
                      shortLabel = label;
                    }
                    
                    if (!groupedData[key]) {
                      groupedData[key] = { key, label, shortLabel, orderValue: 0, rejectionValue: 0, orderDays: new Set() };
                    }
                    const mrp = d.total_mrp_value > 0 ? d.total_mrp_value : 
                      (d.items?.reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0) || 0);
                    groupedData[key].orderValue += mrp;
                    groupedData[key].orderDays.add(date); // Track unique order days
                  });
                  
                  // Subtract rejections
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
                  
                  // Calculate net order value, earnings, and average earnings per day
                  const chartData = Object.values(groupedData)
                    .map(d => {
                      const netValue = d.orderValue - d.rejectionValue;
                      const earnings = Math.round(netValue * retailerCommPct / 100);
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
                  
                  if (chartData.length < 1) return null;
                  
                  // Colors for bars
                  const orderColors = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#3b82f6', '#60a5fa'];
                  const earningColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#10b981', '#34d399'];
                  const avgColors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#f59e0b', '#fbbf24'];
                  
                  const formatValue = (value) => {
                    if (value >= 100000) return `₹${(value/100000).toFixed(1)}L`;
                    if (value >= 1000) return `₹${(value/1000).toFixed(1)}k`;
                    return `₹${value}`;
                  };
                  
                  const viewModeLabel = chartViewMode === 'daily' ? 'Daily' : chartViewMode === 'weekly' ? 'Weekly' : 'Monthly';
                  
                  return (
                    <div className="mt-4">
                      {/* View Mode Tabs */}
                      <div className="flex items-center gap-1 mb-3">
                        <span className="text-xs text-gray-500 mr-2">View:</span>
                        {['daily', 'weekly', 'monthly'].map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setChartViewMode(mode)}
                            className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                              chartViewMode === mode
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                          </button>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Order Value Chart */}
                        <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                          <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                            <ShoppingCart size={14} className="text-blue-500" />
                            {viewModeLabel} Order Value
                          </p>
                          <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 25, right: 5, left: -20, bottom: 5 }}>
                                <XAxis 
                                  dataKey="shortLabel" 
                                  tick={{ fontSize: 10, fill: '#6b7280' }}
                                  axisLine={false}
                                  tickLine={false}
                                  interval={0}
                                  angle={chartData.length > 5 ? -45 : 0}
                                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                                  height={chartData.length > 5 ? 35 : 18}
                                />
                                <YAxis hide={true} />
                                <Tooltip 
                                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                  formatter={(value) => [`₹${value.toLocaleString()}`, 'Order Value']}
                                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                                />
                                <Bar dataKey="netOrderValue" radius={[4, 4, 0, 0]} maxBarSize={35}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={orderColors[index % orderColors.length]} />
                                  ))}
                                  <LabelList 
                                    dataKey="netOrderValue" 
                                    position="top" 
                                    style={{ fontSize: 11, fontWeight: 600, fill: '#3b82f6' }}
                                    formatter={formatValue}
                                  />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        
                        {/* Earnings/Profit Chart */}
                        <div className="bg-white/80 rounded-xl p-3 border border-emerald-100">
                          <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                            <TrendingUp size={14} className="text-emerald-500" />
                            {viewModeLabel} Earnings
                          </p>
                          <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 25, right: 5, left: -20, bottom: 5 }}>
                                <XAxis 
                                  dataKey="shortLabel" 
                                  tick={{ fontSize: 10, fill: '#6b7280' }}
                                  axisLine={false}
                                  tickLine={false}
                                  interval={0}
                                  angle={chartData.length > 5 ? -45 : 0}
                                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                                  height={chartData.length > 5 ? 35 : 18}
                                />
                                <YAxis hide={true} />
                                <Tooltip 
                                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                  formatter={(value) => [`₹${value.toLocaleString()}`, 'Earnings']}
                                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                                />
                                <Bar dataKey="earnings" radius={[4, 4, 0, 0]} maxBarSize={35}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={earningColors[index % earningColors.length]} />
                                  ))}
                                  <LabelList 
                                    dataKey="earnings" 
                                    position="top" 
                                    style={{ fontSize: 11, fontWeight: 600, fill: '#10b981' }}
                                    formatter={formatValue}
                                  />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        
                        {/* Average Earnings Per Day Chart */}
                        <div className="bg-white/80 rounded-xl p-3 border border-amber-100">
                          <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                            <DollarSign size={14} className="text-amber-500" />
                            Avg. Earning/Day
                          </p>
                          <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 25, right: 5, left: -20, bottom: 5 }}>
                                <XAxis 
                                  dataKey="shortLabel" 
                                  tick={{ fontSize: 10, fill: '#6b7280' }}
                                  axisLine={false}
                                  tickLine={false}
                                  interval={0}
                                  angle={chartData.length > 5 ? -45 : 0}
                                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                                  height={chartData.length > 5 ? 35 : 18}
                                />
                                <YAxis hide={true} />
                                <Tooltip 
                                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                                  formatter={(value, name, props) => [
                                    `₹${value.toLocaleString()} (${props.payload.daysCount} days)`, 
                                    'Avg/Day'
                                  ]}
                                  labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                                />
                                <Bar dataKey="avgEarningsPerDay" radius={[4, 4, 0, 0]} maxBarSize={35}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={avgColors[index % avgColors.length]} />
                                  ))}
                                  <LabelList 
                                    dataKey="avgEarningsPerDay" 
                                    position="top" 
                                    style={{ fontSize: 11, fontWeight: 600, fill: '#d97706' }}
                                    formatter={formatValue}
                                  />
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Payment Details - Redesigned Block with 100% Upfront Support */}
            {paymentDetails && paymentDetails.dates && paymentDetails.dates.length > 0 && (
              <Card data-testid="payment-details-card" className={`mb-6 shadow-lg ${
                paymentDetails.is_full_upfront 
                  ? 'border-purple-300 bg-gradient-to-br from-purple-50 via-white to-blue-50' 
                  : 'border-blue-300 bg-gradient-to-br from-blue-50 via-white to-indigo-50'
              }`}>
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    {/* Header with Total */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`p-2 sm:p-3 md:p-4 rounded-xl shrink-0 ${
                          paymentDetails.is_full_upfront ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          <CreditCard size={24} className={`${
                            paymentDetails.is_full_upfront ? 'text-purple-600' : 'text-blue-600'
                          } sm:w-7 sm:h-7 md:w-9 md:h-9`} />
                        </div>
                        <div>
                          <p className={`text-xs sm:text-sm font-semibold uppercase tracking-wide ${
                            paymentDetails.is_full_upfront ? 'text-purple-600' : 'text-blue-600'
                          }`}>
                            {t('Pending Payment Details')}
                            {paymentDetails.is_full_upfront && (
                              <span className="text-[10px] sm:text-xs font-normal text-purple-500 ml-1 sm:ml-2">(100% Upfront)</span>
                            )}
                          </p>
                          <p className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold ${
                            paymentDetails.is_full_upfront ? 'text-purple-700' : 'text-blue-700'
                          }`}>
                            {formatCurrency((paymentDetails.totals?.grand_total || 0) - (paymentDetails.totals?.total_pending_credit || 0))}
                          </p>
                          {paymentDetails.totals?.total_pending_credit > 0 && (
                            <p className="text-[10px] sm:text-xs text-gray-500">
                              After ₹{(paymentDetails.totals?.total_pending_credit || 0).toLocaleString()} credit adjustment
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Payment Summary Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        className={`text-[10px] sm:text-xs px-2 sm:px-3 py-1 h-7 sm:h-8 ${
                          paymentDetails.is_full_upfront 
                            ? 'border-purple-300 text-purple-700 hover:bg-purple-50' 
                            : 'border-blue-300 text-blue-700 hover:bg-blue-50'
                        }`}
                        onClick={openPaymentSummaryModal}
                        data-testid="payment-summary-btn"
                      >
                        <FileText size={12} className="mr-1" />
                        Summary
                      </Button>
                    </div>
                    
                    {/* 100% UPFRONT RETAILER LAYOUT */}
                    {paymentDetails.is_full_upfront ? (
                      <>
                        {/* 2 Cards - Total Payable and Credit Notes */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                          {/* Total Payable Card */}
                          <div 
                            className={`bg-white/80 rounded-lg p-2 sm:p-3 border cursor-pointer transition-all hover:shadow-md ${
                              expandedPayableSection === 'payable' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-100'
                            }`}
                            onClick={() => setExpandedPayableSection(expandedPayableSection === 'payable' ? null : 'payable')}
                            data-testid="total-payable-card"
                          >
                            <div className="flex justify-between items-start">
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] sm:text-xs text-gray-500">Total Payable</p>
                                <p className="text-base sm:text-lg font-bold text-purple-600 truncate">
                                  {formatCurrency(paymentDetails.totals?.net_payable || (paymentDetails.totals?.grand_total - (paymentDetails.totals?.total_pending_credit || 0)))}
                                </p>
                                {paymentDetails.totals?.total_pending_credit > 0 && (
                                  <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">
                                    After ₹{(paymentDetails.totals?.total_pending_credit || 0).toLocaleString()} credit
                                  </p>
                                )}
                              </div>
                              <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ml-1 ${expandedPayableSection === 'payable' ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                          
                          {/* Credit Notes Card */}
                          <div 
                            className={`bg-white/80 rounded-lg p-2 sm:p-3 border cursor-pointer transition-all hover:shadow-md ${
                              expandedPayableSection === 'credits' ? 'border-green-500 ring-2 ring-green-200' : 'border-green-100'
                            }`}
                            onClick={() => setExpandedPayableSection(expandedPayableSection === 'credits' ? null : 'credits')}
                            data-testid="credit-notes-card"
                          >
                            <div className="flex justify-between items-start">
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] sm:text-xs text-gray-500">Credit Notes</p>
                                <p className={`text-base sm:text-lg font-bold truncate ${
                                  (paymentDetails.credit_notes?.length || 0) > 0 ? 'text-green-600' : 'text-gray-400'
                                }`}>
                                  {(paymentDetails.credit_notes?.length || 0) > 0 
                                    ? formatCurrency(paymentDetails.totals?.total_pending_credit || 0) 
                                    : '₹0'}
                                </p>
                                {(paymentDetails.credit_notes?.length || 0) > 0 && (
                                  <p className="text-[9px] sm:text-[10px] text-green-600 truncate">
                                    {paymentDetails.credit_notes.length} note(s) available
                                  </p>
                                )}
                              </div>
                              <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ml-1 ${expandedPayableSection === 'credits' ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </div>
                        
                        {/* Expandable Details - Payable Breakdown */}
                        {expandedPayableSection === 'payable' && paymentDetails.dates && (
                          <div className="bg-white rounded-lg border p-2 sm:p-3 max-h-48 sm:max-h-64 overflow-y-auto">
                            <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-2">Date-wise Breakdown</p>
                            <div className="space-y-1">
                              {paymentDetails.dates.filter(d => !d.is_all_clear).map((dateData, idx) => (
                                <div 
                                  key={dateData.date} 
                                  className="flex justify-between items-center text-[10px] sm:text-xs py-1 sm:py-1.5 border-b border-gray-50 cursor-pointer hover:bg-purple-50"
                                  onClick={() => openPaymentModal(dateData)}
                                >
                                  <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                                    <span className="px-1 sm:px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[9px] sm:text-[10px] whitespace-nowrap">
                                      {new Date(dateData.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}
                                    </span>
                                    <span className="text-gray-400 text-[9px] truncate">
                                      {dateData.invoice_count || 1} invoice(s)
                                    </span>
                                  </div>
                                  <span className="font-bold text-purple-600 shrink-0 ml-2">
                                    {formatCurrency(dateData.upfront_50_total || dateData.total_pending || 0)}
                                  </span>
                                </div>
                              ))}
                              {paymentDetails.dates.filter(d => !d.is_all_clear).length === 0 && (
                                <p className="text-[10px] sm:text-xs text-gray-400 text-center py-2">No pending entries</p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Expandable Details - Credit Notes */}
                        {expandedPayableSection === 'credits' && (
                          <div className="bg-white rounded-lg border p-2 sm:p-3 max-h-48 sm:max-h-64 overflow-y-auto">
                            <p className="text-[10px] sm:text-xs font-semibold text-gray-600 mb-2">Available Credit Notes</p>
                            {(paymentDetails.credit_notes?.length || 0) > 0 ? (
                              <div className="space-y-1.5 sm:space-y-2">
                                {paymentDetails.credit_notes.map((cn, idx) => (
                                  <div key={cn.id || idx} className="flex justify-between items-start text-[10px] sm:text-xs py-1.5 sm:py-2 px-1.5 sm:px-2 bg-green-50 rounded border border-green-100">
                                    <div className="min-w-0 flex-1">
                                      <span className="font-semibold text-green-700">{cn.credit_note_number}</span>
                                      <div className="text-gray-500 truncate">from {cn.original_invoice_number}</div>
                                      {cn.commission_deducted > 0 && (
                                        <div className="text-[9px] text-gray-400 truncate">
                                          (MRP ₹{cn.rejection_value?.toLocaleString()} - {cn.commission_percentage}% comm)
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-bold text-green-600 shrink-0 ml-2">₹{(cn.pending_amount || 0).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] sm:text-xs text-gray-400 text-center py-2">No pending credit notes</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      /* STANDARD RETAILER LAYOUT (50% upfront) */
                      <>
                        {/* Summary boxes - 3 columns including Credit Notes */}
                        <div className="flex gap-2 sm:gap-3">
                          <div className="bg-white rounded-lg border border-blue-200 p-2 px-2 sm:px-3 text-center flex-1">
                            <p className="text-[10px] sm:text-xs text-blue-600 font-medium">50% Upfront</p>
                            <p className="text-sm sm:text-base font-bold text-blue-700">
                              {formatCurrency(paymentDetails.totals?.upfront_50_total || 0)}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg border border-orange-200 p-2 px-2 sm:px-3 text-center flex-1">
                            <p className="text-[10px] sm:text-xs text-orange-600 font-medium">Final Payment</p>
                            <p className="text-sm sm:text-base font-bold text-orange-700">
                              {formatCurrency(paymentDetails.totals?.final_payment_total || 0)}
                            </p>
                          </div>
                          {(paymentDetails.totals?.total_pending_credit > 0 || paymentDetails.credit_notes?.length > 0) && (
                            <div className="bg-white rounded-lg border border-purple-200 p-2 px-2 sm:px-3 text-center flex-1">
                              <p className="text-[10px] sm:text-xs text-purple-600 font-medium">Credit Notes</p>
                              <p className="text-sm sm:text-base font-bold text-purple-700">
                                - {formatCurrency(paymentDetails.totals?.total_pending_credit || 0)}
                              </p>
                            </div>
                          )}
                        </div>
                        
                        {/* Date Filters */}
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-white rounded-lg border border-gray-200 p-2 px-2 sm:px-3">
                          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-500 font-medium">
                            <Calendar size={12} className="text-gray-400 sm:w-[14px] sm:h-[14px]" />
                            <span>Filter:</span>
                          </div>
                          <div className="relative">
                            <Input
                              type="date"
                              value={paymentDetailsDateFrom}
                              onChange={(e) => setPaymentDetailsDateFrom(e.target.value)}
                              className="w-28 sm:w-36 h-7 sm:h-8 text-[10px] sm:text-xs border-gray-300 pr-1 sm:pr-2 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                            />
                          </div>
                          <span className="text-gray-400 text-[10px] sm:text-xs">to</span>
                          <div className="relative">
                            <Input
                              type="date"
                              value={paymentDetailsDateTo}
                              onChange={(e) => setPaymentDetailsDateTo(e.target.value)}
                              className="w-28 sm:w-36 h-7 sm:h-8 text-[10px] sm:text-xs border-gray-300 pr-1 sm:pr-2 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                            />
                          </div>
                          <Button 
                            size="sm" 
                            onClick={handleApplyPaymentFilters}
                            className="h-7 sm:h-8 px-2 sm:px-3 bg-emerald-600 hover:bg-emerald-700 text-[10px] sm:text-xs"
                            data-testid="payment-apply-filter-btn"
                          >
                            Apply
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={handleResetPaymentFilters}
                            className="h-7 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs"
                            data-testid="payment-reset-filter-btn"
                          >
                            Reset
                          </Button>
                        </div>
                        
                        {/* Payment Table */}
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {/* Table Header */}
                          <div className="grid grid-cols-4 bg-gray-50 border-b border-gray-200 text-[10px] sm:text-xs font-semibold text-gray-600">
                            <div className="p-1.5 sm:p-2 px-2 sm:px-3">{t('Date')}</div>
                            <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right">50% Upfront</div>
                            <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right">Final</div>
                            <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right">Total</div>
                          </div>
                          
                          {/* Table Rows - Clickable */}
                          <div className="max-h-48 sm:max-h-64 overflow-y-auto">
                            {paymentDetailsLoading ? (
                              <div className="p-3 sm:p-4 text-center text-gray-500 text-xs sm:text-sm">Loading...</div>
                            ) : paymentDetails.dates.length === 0 ? (
                              <div className="p-3 sm:p-4 text-center text-gray-500 text-xs sm:text-sm">No pending payments</div>
                            ) : (
                              paymentDetails.dates.map((dateData, idx) => (
                                <div 
                                  key={dateData.date}
                                  data-testid={`payment-row-${dateData.date}`}
                                  onClick={() => openPaymentModal(dateData)}
                                  className={`grid grid-cols-4 text-[10px] sm:text-sm cursor-pointer hover:bg-emerald-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                >
                                  <div className="p-1.5 sm:p-2 px-2 sm:px-3 font-medium text-gray-700">
                                    {new Date(dateData.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}
                                  </div>
                                  {dateData.is_all_clear ? (
                                    <>
                                      <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right text-gray-400">-</div>
                                      <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right text-gray-400">-</div>
                                      <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right">
                                        <span className="text-[9px] sm:text-xs text-green-600 font-medium flex items-center justify-end gap-0.5 sm:gap-1">
                                          <Check size={10} className="sm:w-3 sm:h-3" /> Clear
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right">
                                        {dateData.upfront_50_total > 0 ? (
                                          <span className="text-green-600 font-medium">{formatCurrency(dateData.upfront_50_total)}</span>
                                        ) : (
                                          <span className="text-gray-400">-</span>
                                        )}
                                      </div>
                                      <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right">
                                        {dateData.final_payment_total > 0 ? (
                                          <span className="text-orange-600 font-medium">{formatCurrency(dateData.final_payment_total)}</span>
                                        ) : (
                                          <span className="text-gray-400">-</span>
                                        )}
                                      </div>
                                      <div className="p-1.5 sm:p-2 px-2 sm:px-3 text-right font-semibold text-emerald-700">
                                        {formatCurrency((dateData.upfront_50_total || 0) + (dateData.final_payment_total || 0))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                        
                        <p className="text-[9px] sm:text-xs text-gray-500 text-center sm:text-right">
                          Tap on a row to see item-level details
                        </p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 6 Metric Boxes */}
            {(() => {
              const filteredDispatches = dispatches.filter(d => {
                const dispDate = d.dispatch_date?.split('T')[0];
                return dashboardDateFrom && dispDate >= dashboardDateFrom && dispDate <= dashboardDateTo;
              });
              const filteredRejections = rejections.filter(r => {
                const rejDate = r.rejection_date?.split('T')[0];
                return dashboardDateFrom && rejDate >= dashboardDateFrom && rejDate <= dashboardDateTo;
              });
              
              const totalItemsReceived = filteredDispatches.reduce((sum, d) => 
                sum + (d.items?.reduce((s, i) => s + (i.supplied_qty || 0), 0) || 0), 0);
              const totalItemsRejected = filteredRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
              const totalItemsSold = totalItemsReceived - totalItemsRejected;
              
              const retailerCommPct = dashboardData?.retailer?.commission_percentage || 0;
              const grossMrpValue = filteredDispatches.reduce((sum, d) => {
                if (d.total_mrp_value && d.total_mrp_value > 0) return sum + d.total_mrp_value;
                return sum + (d.items?.reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0) || 0);
              }, 0);
              const totalRejectionValue = filteredRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
              const netMrpValue = grossMrpValue - totalRejectionValue;
              const totalCommission = netMrpValue * retailerCommPct / 100;
              const payableByRetailer = netMrpValue - totalCommission;
              
              // Filter payments by date range
              const filteredPayments = payments.filter(p => {
                const payDate = p.payment_date?.split('T')[0];
                return dashboardDateFrom && payDate >= dashboardDateFrom && payDate <= dashboardDateTo;
              });
              const totalPaidInPeriod = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
              const pendingAmount = Math.max(0, payableByRetailer - totalPaidInPeriod);
              
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                  {/* Items Received */}
                  <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Package size={20} className="text-blue-600" />
                        </div>
                      </div>
                      <p className="text-xs text-blue-600 font-medium mb-1">{t('retailer.itemsReceived') || 'Items Received'}</p>
                      <p className="text-2xl font-bold text-blue-800">{totalItemsReceived.toLocaleString()}</p>
                    </CardContent>
                  </Card>

                  {/* Rejection */}
                  <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <AlertTriangle size={20} className="text-red-600" />
                        </div>
                      </div>
                      <p className="text-xs text-red-600 font-medium mb-1">{t('retailer.rejection') || 'Rejection'}</p>
                      <p className="text-2xl font-bold text-red-700">-{totalItemsRejected.toLocaleString()}</p>
                    </CardContent>
                  </Card>

                  {/* Items Sold */}
                  <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <ShoppingBag size={20} className="text-green-600" />
                        </div>
                      </div>
                      <p className="text-xs text-green-600 font-medium mb-1">{t('retailer.itemsSold') || 'Items Sold'}</p>
                      <p className="text-2xl font-bold text-green-800">{totalItemsSold.toLocaleString()}</p>
                    </CardContent>
                  </Card>

                  {/* Total MRP Value */}
                  <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <IndianRupee size={20} className="text-purple-600" />
                        </div>
                      </div>
                      <p className="text-xs text-purple-600 font-medium mb-1">{t('retailer.totalMrpValue') || 'Total MRP Value'}</p>
                      <p className="text-xl font-bold text-purple-800">{formatCurrency(netMrpValue)}</p>
                    </CardContent>
                  </Card>

                  {/* Payable by You */}
                  <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <Wallet size={20} className="text-amber-600" />
                        </div>
                      </div>
                      <p className="text-xs text-amber-600 font-medium mb-1">{t('retailer.payableByYou') || 'Payable by You'}</p>
                      <p className="text-xl font-bold text-amber-700">{formatCurrency(payableByRetailer)}</p>
                    </CardContent>
                  </Card>

                  {/* Paid Amount */}
                  <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-teal-100 rounded-lg">
                          <CreditCard size={20} className="text-teal-600" />
                        </div>
                      </div>
                      <p className="text-xs text-teal-600 font-medium mb-1">{t('retailer.paidAmount') || 'Paid Amount'}</p>
                      <p className="text-xl font-bold text-teal-700">{formatCurrency(totalPaidInPeriod)}</p>
                    </CardContent>
                  </Card>

                  {/* Pending Amount */}
                  <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white">
                    <CardContent className="p-4 text-center">
                      <div className="flex justify-center mb-2">
                        <div className="p-2 bg-orange-100 rounded-lg">
                          <Clock size={20} className="text-orange-600" />
                        </div>
                      </div>
                      <p className="text-xs text-orange-600 font-medium mb-1">Pending Amount</p>
                      <p className="text-xl font-bold text-orange-700">{formatCurrency(pendingAmount)}</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}
          </>
        )}

        {/* ==================== INDENTS TAB ==================== */}
        {activeTab === 'indents' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">My Indents</CardTitle>
              <Button size="sm" className="bg-[#14532D]" onClick={() => setShowIndentModal(true)}>
                <Plus size={14} className="mr-1" /> New Indent
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                      <th className="p-3 text-left font-medium text-gray-500">REMARKS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indents.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No indents found. Create your first indent!</td></tr>
                    ) : indents.map(indent => (
                      <tr key={indent.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          {formatDate(indent.indent_date)}
                          {indent.is_auto_generated && (
                            <span className="block mt-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium w-fit">
                              Auto Generated by System
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {indent.items?.map((item, idx) => {
                            const displayVariant = resolveVariantName(item.variant_name, item.variant_id);
                            return (
                              <div key={idx} className="text-xs">
                                {getProductName(item)} {displayVariant && `(${displayVariant})`} x {item.quantity}
                              </div>
                            );
                          })}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            indent.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            indent.status === 'dispatched' ? 'bg-blue-100 text-blue-700' :
                            indent.status === 'received' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {indent.status}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500">{indent.remarks || '-'}</td>
                        <td className="p-3 text-center">
                          {indent.status === 'pending' && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteIndent(indent.id)}>
                              <X size={14} className="text-red-600" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== PLACE ORDER TAB ==================== */}
        {activeTab === 'placeorder' && (
          <div className="space-y-4 pb-24">
            {/* Header with Language Toggle */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{editingIndentId ? 'Edit Order' : 'Create Order'}</h2>
                <p className="text-sm text-gray-500">
                  {editingIndentId 
                    ? `Editing order for: ${formatDate(indents.find(i => i.id === editingIndentId)?.indent_date)}`
                    : `Order for: ${new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}`
                  }
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Language Toggle */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => changeCatalogueLanguage('en')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      catalogueLanguage === 'en' 
                        ? 'bg-white shadow text-[#14532D]' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => changeCatalogueLanguage('hi')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      catalogueLanguage === 'hi' 
                        ? 'bg-white shadow text-[#14532D]' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    हिंदी
                  </button>
                  <button
                    onClick={() => changeCatalogueLanguage('mr')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      catalogueLanguage === 'mr' 
                        ? 'bg-white shadow text-[#14532D]' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    मराठी
                  </button>
                </div>
                
                {editingIndentId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingIndentId(null);
                      setCart({});
                      setActiveTab('orders');
                    }}
                    className="text-gray-600"
                  >
                    <X size={16} className="mr-1" />
                    Cancel Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Warning Message about tentative MRP - Translated */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                {catalogueLanguage === 'hi' ? (
                  <><span className="font-medium">नोट:</span> दिखाया गया MRP अनुमानित है। वास्तविक दर और कुल राशि कल की दरों के अनुसार बदल सकती है।</>
                ) : catalogueLanguage === 'mr' ? (
                  <><span className="font-medium">टीप:</span> दाखवलेला MRP तात्पुरता आहे। प्रत्यक्ष दर आणि एकूण रक्कम उद्याच्या दरांनुसार बदलू शकते।</>
                ) : (
                  <><span className="font-medium">Note:</span> MRP shown is tentative. The actual rate and total amount may vary depending upon tomorrow's rates.</>
                )}
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <Input
                placeholder="Search products..."
                value={indentSearchQuery}
                onChange={(e) => setIndentSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Product Categories */}
            {catalogueLoading ? (
              <div className="text-center py-8 text-gray-500">Loading products...</div>
            ) : catalogueError ? (
              <div className="text-center py-8">
                <div className="text-red-500 mb-2">Failed to load products. Please try again.</div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.reload()}
                  className="text-sm"
                >
                  Refresh Page
                </Button>
              </div>
            ) : catalogue.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No products available. Please contact admin to add products.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedCatalogueCategories.map(category => {
                  const items = catalogueByCategory[category] || [];
                  const filteredItems = indentSearchQuery 
                    ? items.filter(item => 
                        item.product_name?.toLowerCase().includes(indentSearchQuery.toLowerCase()) ||
                        item.product_name_hi?.toLowerCase().includes(indentSearchQuery.toLowerCase()) ||
                        item.product_name_mr?.toLowerCase().includes(indentSearchQuery.toLowerCase())
                      )
                    : items;
                  
                  if (filteredItems.length === 0) return null;
                  
                  const isExpanded = expandedCatalogueCategories[category] === true; // Default collapsed
                  const cartCount = filteredItems.reduce((sum, item) => {
                    return sum + (item.variants || []).reduce((vSum, vid) => {
                      const cartItem = getCartItem(item.product_id, vid);
                      return vSum + (cartItem?.quantity || 0);
                    }, 0);
                  }, 0);

                  return (
                    <div key={category} className="border rounded-lg bg-white shadow-sm overflow-hidden">
                      {/* Category Header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-50 to-emerald-50 cursor-pointer"
                        onClick={() => toggleCatalogueCategory(category)}
                      >
                        <div className="flex items-center gap-3">
                          <ChevronRight
                            size={18}
                            className={`text-green-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                          <span className="font-semibold text-gray-800">{category}</span>
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            {filteredItems.length} items
                          </span>
                          {cartCount > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                              {cartCount} in cart
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Products */}
                      {isExpanded && (
                        <div className="divide-y">
                          {filteredItems.map(item => {
                            // Get image URL: first check lazy-loaded images, then fallback to item.image_url
                            const rawImageUrl = catalogueImages[item.product_id] || item.image_url;
                            const productImageUrl = rawImageUrl?.startsWith('/') 
                              ? `${process.env.REACT_APP_BACKEND_URL}${rawImageUrl}` 
                              : rawImageUrl;
                            
                            return (
                            <div key={item.product_id} className="p-3 hover:bg-gray-50">
                              <div className="flex items-center gap-3">
                                {/* Product Image - Lazy loaded, clickable to enlarge */}
                                <LazyImage
                                  src={productImageUrl}
                                  alt={item.product_name}
                                  className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                                  onClick={() => {
                                    if (productImageUrl) {
                                      const displayName = catalogueLanguage === 'hi' && item.product_name_hi 
                                        ? item.product_name_hi 
                                        : catalogueLanguage === 'mr' && item.product_name_mr 
                                          ? item.product_name_mr 
                                          : item.product_name;
                                      setEnlargedImage({ url: productImageUrl, name: displayName });
                                    }
                                  }}
                                />

                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                  {/* Product Name with Purchase Info */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-medium text-gray-800">
                                      {catalogueLanguage === 'hi' && item.product_name_hi 
                                        ? item.product_name_hi 
                                        : catalogueLanguage === 'mr' && item.product_name_mr 
                                          ? item.product_name_mr 
                                          : item.product_name}
                                    </p>
                                    {/* Show purchase info: "(1 Piece of 250 gm)" when unit is Piece/Packet */}
                                    {['Piece', 'Packet'].includes(item.purchase_unit) && (item.purchase_weights?.length > 0 || item.purchase_weight_variant) && (
                                      <span className="text-sm text-blue-600 font-medium">
                                        (1 {item.purchase_unit} of {(() => {
                                          const weightId = item.purchase_weights?.[0] || item.purchase_weight_variant;
                                          const pkg = packagings.find(p => p.id === weightId);
                                          return pkg ? pkg.name : weightId;
                                        })()})
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Variants as buttons */}
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {(() => {
                                      // If product has Piece/Packet unit with weights, show ONLY the unit as variant
                                      const hasUnitWithWeight = ['Piece', 'Packet'].includes(item.purchase_unit) && 
                                        (item.purchase_weights?.length > 0 || item.purchase_weight_variant);
                                      
                                      if (hasUnitWithWeight) {
                                        // Show only the unit variant (Pieces/Packets)
                                        const unitVariantId = `unit_${item.purchase_unit.toLowerCase()}`;
                                        const unitDisplayName = item.purchase_unit === 'Piece' ? 'Pieces' : 'Packets';
                                        const cartItem = getCartItem(item.product_id, unitVariantId);
                                        const mrp = getMrp(item.product_id, unitVariantId);
                                        const totalValue = cartItem ? mrp * cartItem.quantity : 0;
                                        
                                        return (
                                          <div className="flex items-center gap-2">
                                            {cartItem ? (
                                              <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-green-100 rounded-full">
                                                  <button
                                                    onClick={() => updateCartQuantity(`${item.product_id}_${unitVariantId}`, -1)}
                                                    className="w-7 h-7 rounded-full bg-white border border-green-300 flex items-center justify-center text-green-600 hover:bg-green-50"
                                                  >
                                                    <Minus size={14} />
                                                  </button>
                                                  <span className="px-3 font-semibold text-green-800 min-w-[32px] text-center">
                                                    {cartItem.quantity}
                                                  </span>
                                                  <button
                                                    onClick={() => updateCartQuantity(`${item.product_id}_${unitVariantId}`, 1)}
                                                    className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white hover:bg-green-700"
                                                  >
                                                    <Plus size={14} />
                                                  </button>
                                                </div>
                                                {mrp > 0 && (
                                                  <span className="text-sm font-bold text-green-700">₹{totalValue.toFixed(0)}</span>
                                                )}
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2">
                                                <button
                                                  onClick={() => addToCart(item, unitVariantId, unitDisplayName)}
                                                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-green-500 hover:bg-green-50 transition-colors"
                                                >
                                                  <span className="text-gray-700">{unitDisplayName}</span>
                                                  <Plus size={14} className="text-green-600" />
                                                </button>
                                                {mrp > 0 && (
                                                  <span className="text-sm font-bold text-[#14532D]">₹{mrp}</span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      }
                                      
                                      // Otherwise show weight variants as before (filter out unit_ variants)
                                      return (item.variants || [])
                                        .filter(v => !v.startsWith('unit_'))
                                        .map(variantId => {
                                          const variantName = getVariantName(variantId);
                                          const cartItem = getCartItem(item.product_id, variantId);
                                          const mrp = getMrp(item.product_id, variantId);
                                          const totalValue = cartItem ? mrp * cartItem.quantity : 0;
                                          
                                          return (
                                            <div key={variantId} className="flex items-center gap-2">
                                              {cartItem ? (
                                                <div className="flex items-center gap-2">
                                                  <div className="flex items-center bg-green-100 rounded-full">
                                                    <button
                                                      onClick={() => updateCartQuantity(`${item.product_id}_${variantId}`, -1)}
                                                      className="w-7 h-7 rounded-full bg-white border border-green-300 flex items-center justify-center text-green-600 hover:bg-green-50"
                                                    >
                                                      <Minus size={14} />
                                                    </button>
                                                    <span className="px-3 font-semibold text-green-800 min-w-[32px] text-center">
                                                      {cartItem.quantity}
                                                    </span>
                                                    <button
                                                      onClick={() => updateCartQuantity(`${item.product_id}_${variantId}`, 1)}
                                                      className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white hover:bg-green-700"
                                                    >
                                                      <Plus size={14} />
                                                    </button>
                                                  </div>
                                                  {mrp > 0 && (
                                                    <span className="text-sm font-bold text-green-700">₹{totalValue.toFixed(0)}</span>
                                                  )}
                                                </div>
                                              ) : (
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    onClick={() => addToCart(item, variantId, variantName)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-green-500 hover:bg-green-50 transition-colors"
                                                  >
                                                    <span className="text-gray-700">{variantName}</span>
                                                    <Plus size={14} className="text-green-600" />
                                                  </button>
                                                  {mrp > 0 && (
                                                    <span className="text-sm font-bold text-[#14532D]">₹{mrp}</span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        });
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Fixed View Cart Button at Bottom Center - Moved higher to avoid Emergent badge */}
            {cartItemCount > 0 && (
              <div className="fixed bottom-20 sm:bottom-6 left-1/2 transform -translate-x-1/2 z-30">
                <Button
                  onClick={() => setShowCart(true)}
                  className="bg-[#14532D] hover:bg-[#166534] shadow-xl px-8 py-4 rounded-full text-base font-semibold"
                  data-testid="view-cart-floating-btn"
                >
                  <ShoppingCart size={20} className="mr-2" />
                  {editingIndentId ? `Review Changes (${cartItemCount})` : `View Cart (${cartItemCount} items)`}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Cart Modal */}
        {showCart && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0">
            <div className="bg-white w-full sm:max-w-lg sm:rounded-lg max-h-[80vh] flex flex-col rounded-t-2xl">
              {/* Cart Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-[#14532D] text-white sm:rounded-t-lg">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={20} />
                  <h3 className="font-semibold">{editingIndentId ? 'Edit Order' : 'Your Cart'}</h3>
                  <span className="text-sm opacity-80">({cartItemCount} items)</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setShowCart(false); if (editingIndentId) { setEditingIndentId(null); setCart({}); } }} className="text-white hover:bg-white/20">
                  <X size={20} />
                </Button>
              </div>

              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {Object.entries(cart).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart size={48} className="mx-auto mb-2 opacity-30" />
                    <p>Your cart is empty</p>
                  </div>
                ) : (
                  Object.entries(cart).map(([key, item]) => {
                    // Get image from lazy-loaded images or fallback to item.image_url
                    const rawCartImageUrl = catalogueImages[item.product_id] || item.image_url;
                    const cartImageUrl = rawCartImageUrl?.startsWith('/') 
                      ? `${process.env.REACT_APP_BACKEND_URL}${rawCartImageUrl}` 
                      : rawCartImageUrl;
                    
                    // Get MRP for this item
                    const mrp = getMrp(item.product_id, item.variant_id);
                    const itemTotal = mrp * item.quantity;
                    
                    return (
                    <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {/* Product Image */}
                      <LazyImage
                        src={cartImageUrl}
                        alt={item.product_name}
                        className="w-12 h-12 object-cover rounded flex-shrink-0"
                      />

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {catalogueLanguage === 'hi' && item.product_name_hi 
                            ? item.product_name_hi 
                            : catalogueLanguage === 'mr' && item.product_name_mr 
                              ? item.product_name_mr 
                              : item.product_name}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs text-gray-500">
                            {/* For Pieces/Packets, show with weight info */}
                            {item.variant_id?.startsWith('unit_') && item.purchase_weight_name 
                              ? `${resolveVariantName(item.variant_name, item.variant_id)} of ${item.purchase_weight_name}`
                              : resolveVariantName(item.variant_name, item.variant_id)}
                          </p>
                          {mrp > 0 && (
                            <span className="text-xs text-green-600 font-medium">₹{mrp}/unit</span>
                          )}
                        </div>
                      </div>

                      {/* Quantity Controls and Value */}
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartQuantity(key, -1)}
                            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-6 text-center font-semibold text-sm">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(key, 1)}
                            className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white hover:bg-green-700"
                          >
                            <Plus size={12} />
                          </button>
                          <button
                            onClick={() => removeFromCart(key)}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {mrp > 0 && (
                          <span className="text-sm font-semibold text-gray-800">₹{itemTotal.toFixed(0)}</span>
                        )}
                      </div>
                    </div>
                  );
                  })
                )}
              </div>

              {/* Cart Footer */}
              <div className="border-t p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Items</span>
                  <span className="font-semibold">{cartItemCount}</span>
                </div>
                {/* Calculate total estimated value */}
                {(() => {
                  const totalValue = Object.values(cart).reduce((sum, item) => {
                    const mrp = getMrp(item.product_id, item.variant_id);
                    return sum + (mrp * item.quantity);
                  }, 0);
                  
                  return totalValue > 0 ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Estimated Total</span>
                      <span className="font-semibold text-[#14532D]">₹{totalValue.toFixed(0)}</span>
                    </div>
                  ) : null;
                })()}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Delivery Date</span>
                  <span className="font-semibold">
                    {editingIndentId 
                      ? formatDate(indents.find(i => i.id === editingIndentId)?.indent_date)
                      : new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
                    }
                  </span>
                </div>
                {/* Warning about tentative rates - Translated */}
                <p className="text-xs text-amber-600 text-center">
                  {catalogueLanguage === 'hi' 
                    ? '* दिखाया गया MRP अनुमानित है। वास्तविक दर बदल सकती है।'
                    : catalogueLanguage === 'mr'
                      ? '* दाखवलेला MRP तात्पुरता आहे। प्रत्यक्ष दर बदलू शकतात।'
                      : '* MRP shown is tentative. Actual rates may vary.'
                  }
                </p>
                <Button
                  onClick={editingIndentId ? updateCartAsIndent : submitCartAsIndent}
                  disabled={savingIndent || cartItemCount === 0}
                  className="w-full bg-[#14532D] hover:bg-[#166534] py-3"
                >
                  {savingIndent ? (
                    <RefreshCw size={18} className="animate-spin mr-2" />
                  ) : (
                    <Check size={18} className="mr-2" />
                  )}
                  {savingIndent 
                    ? (editingIndentId 
                        ? (catalogueLanguage === 'hi' ? 'अपडेट हो रहा है...' : catalogueLanguage === 'mr' ? 'अपडेट होत आहे...' : 'Updating Order...') 
                        : (catalogueLanguage === 'hi' ? 'ऑर्डर हो रहा है...' : catalogueLanguage === 'mr' ? 'ऑर्डर होत आहे...' : 'Placing Order...'))
                    : (editingIndentId 
                        ? (catalogueLanguage === 'hi' ? 'ऑर्डर अपडेट करें' : catalogueLanguage === 'mr' ? 'ऑर्डर अपडेट करा' : 'Update Order')
                        : (catalogueLanguage === 'hi' ? 'ऑर्डर करें' : catalogueLanguage === 'mr' ? 'ऑर्डर करा' : 'Place Order'))
                  }
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ORDERS TAB ==================== */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Create Order Card - Prominent at top */}
            <Card className="border-[#14532D] bg-gradient-to-r from-green-50 to-emerald-50 shadow-md">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#14532D] rounded-xl">
                      <ShoppingCart size={24} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 text-lg">Create New Order</h3>
                      <p className="text-sm text-gray-600">
                        Order for delivery on {new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="lg"
                    className="bg-[#14532D] hover:bg-[#166534] px-6"
                    onClick={() => setActiveTab('placeorder')}
                    data-testid="create-order-btn"
                  >
                    <Plus size={18} className="mr-2" />
                    Create Order
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Sub-tabs for Orders */}
            <div className="flex border-b justify-between items-center flex-wrap gap-1">
              <div className="flex flex-wrap">
                <button
                  onClick={() => setOrdersSubTab('pending')}
                  className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                    ordersSubTab === 'pending'
                      ? 'border-yellow-500 text-yellow-700 bg-yellow-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <ShoppingBag size={14} className="inline mr-1" />
                  <span className="hidden sm:inline">Orders</span>
                  {indents.filter(i => i.status === 'pending').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 text-[10px] sm:text-xs rounded-full">
                      {indents.filter(i => i.status === 'pending').length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setOrdersSubTab('dispatched')}
                  className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                    ordersSubTab === 'dispatched'
                      ? 'border-green-500 text-green-700 bg-green-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Truck size={14} className="inline mr-1" />
                  <span className="hidden sm:inline">Dispatched</span>
                  {dispatches.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-green-200 text-green-800 text-[10px] sm:text-xs rounded-full">
                      {dispatches.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setOrdersSubTab('invoiced')}
                  className={`px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                    ordersSubTab === 'invoiced'
                      ? 'border-blue-500 text-blue-700 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText size={14} className="inline mr-1" />
                <span className="hidden sm:inline">Invoiced</span>
                {invoices.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-blue-200 text-blue-800 text-[10px] sm:text-xs rounded-full">
                    {invoices.length}
                  </span>
                )}
              </button>
              </div>
            </div>

            {/* Orders Sub-tab */}
            {ordersSubTab === 'pending' && (
              <Card>
                <CardHeader className="py-3 border-b bg-yellow-50 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShoppingBag size={16} className="text-yellow-600" />
                    {'Orders'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(() => {
                    // Only show pending indents (not partial - those are already being dispatched)
                    const pendingIndents = indents.filter(i => i.status === 'pending');
                    const indentsByDate = pendingIndents.reduce((acc, indent) => {
                      const date = indent.indent_date?.split('T')[0] || 'Unknown';
                      if (!acc[date]) acc[date] = [];
                      acc[date].push(indent);
                      return acc;
                    }, {});
                    
                    // Sort dates descending
                    const sortedDates = Object.keys(indentsByDate).sort((a, b) => b.localeCompare(a));
                    
                    if (sortedDates.length === 0) {
                      return (
                        <div className="p-8 text-center text-gray-400">No pending orders</div>
                      );
                    }
                    
                    return (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="p-3 text-left w-8"></th>
                            <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                            <th className="p-3 text-center font-medium text-gray-500">COUNT OF ORDERS</th>
                            <th className="p-3 text-center font-medium text-gray-500">NO OF ITEMS</th>
                            <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDates.map(date => {
                            const dateIndents = indentsByDate[date];
                            const isExpanded = expandedOrderDates[date];
                            const totalItems = dateIndents.reduce((sum, indent) => sum + (indent.items?.length || 0), 0);
                            const hasPartial = dateIndents.some(i => i.status === 'partial');
                            
                            return (
                              <React.Fragment key={date}>
                                {/* Date Row - Clickable */}
                                <tr 
                                  className="border-b bg-yellow-50/50 hover:bg-yellow-100 cursor-pointer"
                                  onClick={() => setExpandedOrderDates(prev => ({ ...prev, [date]: !prev[date] }))}
                                >
                                  <td className="p-3 text-center">
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </td>
                                  <td className="p-3 font-semibold text-gray-800">{formatDate(date)}</td>
                                  <td className="p-3 text-center font-medium">{dateIndents.length}</td>
                                  <td className="p-3 text-center font-medium">{totalItems}</td>
                                  <td className="p-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      hasPartial ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {hasPartial ? 'Partial' : (t('retailer.awaitingDispatch') || 'Awaiting Dispatch')}
                                    </span>
                                  </td>
                                </tr>
                                
                                {/* Expanded Order Details - Each order as a collapsible card */}
                                {isExpanded && dateIndents.map((indent) => {
                                  // Generate ERP-style Order ID: ORD-YYYYMMDD-XXXX
                                  const indentDate = indent.indent_date?.split('T')[0] || '';
                                  const dateStr = indentDate.replace(/-/g, '');
                                  const shortId = indent.id ? indent.id.slice(-4).toUpperCase() : '0000';
                                  const orderId = `ORD-${dateStr}-${shortId}`;
                                  const isOrderExpanded = expandedOrderDates[`order_${indent.id}`];
                                  
                                  return (
                                    <tr key={indent.id} className="border-b bg-white">
                                      <td className="p-2 pl-6"></td>
                                      <td colSpan={4} className="p-2">
                                        {/* Order Card */}
                                        <div className="border rounded-lg bg-gray-50 overflow-hidden">
                                          {/* Order Header - Always visible */}
                                          <div 
                                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedOrderDates(prev => ({ 
                                                ...prev, 
                                                [`order_${indent.id}`]: !prev[`order_${indent.id}`] 
                                              }));
                                            }}
                                          >
                                            <div className="flex items-center gap-3">
                                              {isOrderExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                                              <span className="text-sm">
                                                <span className="text-gray-500">Order Id:</span>{' '}
                                                <span className="font-mono font-semibold text-[#14532D]">{orderId}</span>
                                              </span>
                                              {indent.created_by_retailer && (
                                                <span className="inline-block px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                                                  By You
                                                </span>
                                              )}
                                              {indent.is_auto_generated && (
                                                <span className="inline-block px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                                                  Auto
                                                </span>
                                              )}
                                              <span className="text-xs text-gray-500">
                                                {indent.items?.length || 0} items
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {indent.status === 'pending' && canEditIndent(indent) && (
                                                <>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs px-2 border-blue-300 text-blue-600 hover:bg-blue-50"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      openCartEditMode(indent);
                                                    }}
                                                    data-testid={`edit-order-${indent.id}`}
                                                  >
                                                    <Pencil size={12} className="mr-1" />
                                                    Edit
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs px-2 border-red-300 text-red-600 hover:bg-red-50"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleDeleteIndent(indent.id);
                                                    }}
                                                    data-testid={`delete-order-${indent.id}`}
                                                  >
                                                    <Trash2 size={12} className="mr-1" />
                                                    Delete
                                                  </Button>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* Order Items - Expandable */}
                                          {isOrderExpanded && (
                                            <div className="border-t bg-white p-3">
                                              <div className="space-y-2">
                                                {indent.items?.map((item, idx) => {
                                                  const displayVariant = resolveVariantName(item.variant_name, item.variant_id);
                                                  return (
                                                    <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded border">
                                                      <div className="flex items-center gap-2">
                                                        <span className="text-gray-400 text-xs w-5">{idx + 1}.</span>
                                                        <span className="font-medium">{getProductName(item)}</span>
                                                        {displayVariant && displayVariant !== 'Kg' && (
                                                          <span className="text-orange-600 text-xs bg-orange-50 px-1.5 py-0.5 rounded">{displayVariant}</span>
                                                        )}
                                                      </div>
                                                      <span className="text-gray-600 font-semibold">×{item.quantity}</span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                              {indent.remarks && (
                                                <div className="text-xs text-gray-500 mt-2 pt-2 border-t">
                                                  <span className="font-medium">Remarks:</span> {indent.remarks}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Dispatched Orders Sub-tab */}
            {ordersSubTab === 'dispatched' && (
              <Card>
                <CardHeader className="py-3 border-b bg-green-50">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Truck size={16} className="text-green-600" />
                      {t('retailer.dispatchedOrders') || 'Dispatched Orders'}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-500" />
                      <Input
                        type="date"
                        value={ordersDateFrom}
                        onChange={(e) => setOrdersDateFrom(e.target.value)}
                        className="w-[140px] h-8 text-sm"
                      />
                      <span className="text-gray-400">to</span>
                      <Input
                        type="date"
                        value={ordersDateTo}
                        onChange={(e) => setOrdersDateTo(e.target.value)}
                        className="w-[140px] h-8 text-sm"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {(() => {
                    const filteredDispatches = dispatches.filter(d => {
                      const dispDate = d.dispatch_date?.split('T')[0];
                      return dispDate >= ordersDateFrom && dispDate <= ordersDateTo;
                    });
                    
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="p-3 text-left w-8"></th>
                              <th className="p-3 text-left font-medium text-gray-500">INVOICE</th>
                              <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                              <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                              <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                              <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
                              <th className="p-3 text-center font-medium text-gray-500">GRN</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDispatches.length === 0 ? (
                              <tr><td colSpan={7} className="p-8 text-center text-gray-400">No dispatches found for selected period</td></tr>
                            ) : filteredDispatches.map(dispatch => (
                              <React.Fragment key={dispatch.id}>
                                <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleDispatchExpand(dispatch.id)}>
                                  <td className="p-3">
                                    {expandedDispatches[dispatch.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </td>
                                  <td className="p-3 font-medium text-blue-600">{dispatch.invoice_number}</td>
                                  <td className="p-3">{formatDate(dispatch.dispatch_date)}</td>
                                  <td className="p-3 text-center">{dispatch.items?.length || 0}</td>
                                  <td className="p-3 text-right">{formatCurrency(dispatch.total_mrp_value)}</td>
                                  <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(dispatch.net_payable)}</td>
                                  <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                    {confirmedGrns[dispatch.id] ? (
                                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                        <CheckCircle size={12} className="mr-1" /> Confirmed
                                      </span>
                                    ) : (
                                      <Button size="sm" variant="outline" onClick={() => openGrnModal(dispatch)}>
                                        <CheckCircle size={14} className="mr-1" /> Confirm GRN
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                                {expandedDispatches[dispatch.id] && (
                                  <tr className="bg-green-50/50">
                                    <td colSpan={7} className="p-3">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b">
                                            <th className="p-2 text-left">Product</th>
                                            <th className="p-2 text-left">Variant</th>
                                            <th className="p-2 text-center">Qty</th>
                                            <th className="p-2 text-right">MRP</th>
                                            <th className="p-2 text-right">Total</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {dispatch.items?.map((item, idx) => (
                                            <tr key={idx}>
                                              <td className="p-2 font-medium">{getProductName(item)}</td>
                                              <td className="p-2 text-gray-600">{resolveVariantName(item.variant_name, item.variant_id) || '-'}</td>
                                              <td className="p-2 text-center">{item.supplied_qty}</td>
                                              <td className="p-2 text-right">{formatCurrency(item.mrp)}</td>
                                              <td className="p-2 text-right">{formatCurrency(item.total_value)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Invoiced Sub-tab */}
            {ordersSubTab === 'invoiced' && (
              <Card>
                <CardHeader className="py-3 border-b bg-blue-50">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText size={16} className="text-blue-600" />
                    {t('retailer.invoiced') || 'Invoiced'} ({t('retailer.invoices') || 'All Generated Invoices'})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-3 text-left w-8"></th>
                          <th className="p-3 text-center font-medium text-gray-500 w-12">S.NO</th>
                          <th className="p-3 text-left font-medium text-gray-500">INVOICE</th>
                          <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                          <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                          <th className="p-3 text-right font-medium text-gray-500">GROSS VALUE</th>
                          <th className="p-3 text-right font-medium text-red-500">REJECTION</th>
                          <th className="p-3 text-right font-medium text-green-600">COMMISSION</th>
                          <th className="p-3 text-right font-medium text-gray-700 font-bold">NET PAYABLE</th>
                          <th className="p-3 text-right font-medium text-blue-600">PAID</th>
                          <th className="p-3 text-right font-medium text-orange-600">PENDING</th>
                          <th className="p-3 text-center font-medium text-gray-500">PDF</th>
                          <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.length === 0 ? (
                          <tr><td colSpan={13} className="p-8 text-center text-gray-400">No invoices found</td></tr>
                        ) : invoices.map((invoice, invoiceIndex) => {
                          const grossValue = invoice.gross_value || invoice.items?.reduce((sum, i) => sum + ((i.supplied_qty || i.quantity || 0) * (i.mrp || 0)), 0) || 0;
                          const rejectionValue = invoice.rejection_amount || invoice.items?.reduce((sum, i) => sum + ((i.rejected_qty || 0) * (i.mrp || 0)), 0) || 0;
                          const netValue = grossValue - rejectionValue;
                          const commissionAmt = invoice.commission_amount || (netValue * (invoice.commission_percentage || 0) / 100);
                          const payableAmt = invoice.net_payable || (netValue - commissionAmt);
                          const isPaid = invoice.status === 'paid' || invoice.status === 'closed' || invoice.payment_status === 'paid';
                          const isPartial = invoice.status === 'partial' || invoice.payment_status === 'partial';
                          
                          // Get paid amount from invoice or payments
                          const paidAmount = invoice.paid_amount || 0;
                          const pendingAmount = Math.max(0, payableAmt - paidAmount);
                          
                          // Check for Excess Paid condition
                          const isExcessPaid = paidAmount > payableAmt + 0.01;
                          const excessAmount = isExcessPaid ? paidAmount - payableAmt : 0;
                          
                          // Get payment details for this invoice
                          const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
                          
                          return (
                            <React.Fragment key={invoice.id}>
                              <tr className={`border-b hover:bg-gray-50 cursor-pointer ${isPaid ? 'bg-green-50/30' : ''}`} onClick={() => toggleInvoiceExpand(invoice.id)}>
                                <td className="p-3">
                                  {expandedInvoices[invoice.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </td>
                                <td className="p-3 text-center text-gray-500">{invoiceIndex + 1}</td>
                                <td className="p-3 font-medium text-blue-600">{invoice.invoice_number}</td>
                                <td className="p-3">{formatDate(invoice.invoice_date)}</td>
                                <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                                <td className="p-3 text-right">{formatCurrency(grossValue)}</td>
                                <td className="p-3 text-right text-red-600">
                                  {rejectionValue > 0 ? `-${formatCurrency(rejectionValue)}` : '-'}
                                </td>
                                <td className="p-3 text-right text-green-600">
                                  -{formatCurrency(commissionAmt)} ({invoice.commission_percentage || 0}%)
                                </td>
                                <td className="p-3 text-right font-bold text-gray-800">
                                  {formatCurrency(payableAmt)}
                                </td>
                                <td className="p-3 text-right text-blue-600 font-medium">
                                  {paidAmount > 0 ? formatCurrency(paidAmount) : '-'}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  {isExcessPaid ? (
                                    <span className="text-purple-600">{formatCurrency(excessAmount)} excess</span>
                                  ) : pendingAmount > 0 ? (
                                    <span className="text-orange-600">{formatCurrency(pendingAmount)}</span>
                                  ) : (
                                    <span className="text-green-600">-</span>
                                  )}
                                </td>
                                <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                  <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                                    <Download size={14} className="text-blue-600" />
                                  </Button>
                                </td>
                                <td className="p-3 text-center">
                                  {isExcessPaid ? (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200 animate-pulse">
                                      <AlertTriangle size={12} className="mr-1" /> Excess Paid
                                    </span>
                                  ) : isPaid ? (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                                      <CheckCircle size={12} className="mr-1" /> {t('retailer.paymentCleared') || 'Payment Cleared'}
                                    </span>
                                  ) : isPartial ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      <Clock size={12} className="mr-1" /> Partial
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                      <Clock size={12} className="mr-1" /> {t('retailer.pending') || 'Pending'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {expandedInvoices[invoice.id] && (
                                <tr className="bg-blue-50/50">
                                  <td colSpan={13} className="p-3">
                                    <div className="bg-white rounded-lg border overflow-hidden">
                                      <table className="w-full text-sm">
                                        <thead className="bg-gray-100">
                                          <tr>
                                            <th className="p-2 text-center font-medium text-gray-500 w-12">#</th>
                                            <th className="p-2 text-left font-medium">Product</th>
                                            <th className="p-2 text-left font-medium">Variant</th>
                                            <th className="p-2 text-center font-medium">Supplied</th>
                                            <th className="p-2 text-center font-medium text-red-600">Rejection</th>
                                            <th className="p-2 text-center font-medium text-green-700">Billable</th>
                                            <th className="p-2 text-right font-medium">Rate</th>
                                            <th className="p-2 text-right font-medium">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {invoice.items?.map((item, idx) => {
                                            const suppliedQty = item.supplied_qty || item.quantity || 0;
                                            const rejectedQty = item.rejected_qty || 0;
                                            const billableQty = suppliedQty - rejectedQty;
                                            const rate = item.mrp || 0;
                                            const amount = billableQty * rate;
                                            
                                            return (
                                              <tr key={idx} className={`border-t ${rejectedQty > 0 ? 'bg-red-50/50' : ''}`}>
                                                <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                                                <td className="p-2 font-medium">{getProductName(item)}</td>
                                                <td className="p-2 text-gray-600">{resolveVariantName(item.variant_name, item.variant_id) || '-'}</td>
                                                <td className="p-2 text-center">{suppliedQty}</td>
                                                <td className="p-2 text-center text-red-600 font-medium">
                                                  {rejectedQty > 0 ? `-${rejectedQty}` : '-'}
                                                </td>
                                                <td className="p-2 text-center text-green-700 font-bold">{billableQty}</td>
                                                <td className="p-2 text-right">{formatCurrency(rate)}</td>
                                                <td className="p-2 text-right font-medium">{formatCurrency(amount)}</td>
                                              </tr>
                                            );
                                          })}
                                          {/* TOTAL ROW */}
                                          <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
                                            <td colSpan={3} className="p-2 text-right text-gray-700">TOTAL:</td>
                                            <td className="p-2 text-center text-gray-700">
                                              {invoice.items?.reduce((sum, i) => sum + (i.supplied_qty || i.quantity || 0), 0)}
                                            </td>
                                            <td className="p-2 text-center text-red-600">
                                              {rejectionValue > 0 ? `-${invoice.items?.reduce((sum, i) => sum + (i.rejected_qty || 0), 0)}` : '-'}
                                            </td>
                                            <td className="p-2 text-center text-green-700">
                                              {invoice.items?.reduce((sum, i) => sum + ((i.supplied_qty || i.quantity || 0) - (i.rejected_qty || 0)), 0)}
                                            </td>
                                            <td className="p-2 text-right">-</td>
                                            <td className="p-2 text-right text-gray-800">{formatCurrency(netValue)}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                      
                                      {/* Invoice Summary with Payment Details */}
                                      <div className="border-t-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                          {/* Invoice Breakdown */}
                                          <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                              <span className="text-gray-600">Gross Value:</span>
                                              <span className="font-medium">{formatCurrency(grossValue)}</span>
                                            </div>
                                            {rejectionValue > 0 && (
                                              <div className="flex justify-between text-sm">
                                                <span className="text-red-600">(-) Rejection:</span>
                                                <span className="font-medium text-red-600">-{formatCurrency(rejectionValue)}</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between text-sm">
                                              <span className="text-gray-600">MRP Value:</span>
                                              <span className="font-medium">{formatCurrency(netValue)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                              <span className="text-green-600">(-) Commission ({invoice.commission_percentage}%):</span>
                                              <span className="font-medium text-green-600">-{formatCurrency(commissionAmt)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                                              <span className="font-bold text-gray-800">Net Payable:</span>
                                              <span className="font-bold text-gray-800">{formatCurrency(payableAmt)}</span>
                                            </div>
                                          </div>
                                          
                                          {/* Payment Status */}
                                          <div className="bg-white rounded-lg border p-3 space-y-2">
                                            <div className="flex justify-between text-sm">
                                              <span className="text-blue-600 font-medium">Paid Amount:</span>
                                              <span className="font-bold text-blue-600">{formatCurrency(paidAmount)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                              <span className={pendingAmount > 0 ? 'text-orange-600 font-medium' : isExcessPaid ? 'text-purple-600 font-medium' : 'text-green-600 font-medium'}>
                                                {isExcessPaid ? 'Excess Amount:' : 'Pending Amount:'}
                                              </span>
                                              <span className={`font-bold ${pendingAmount > 0 ? 'text-orange-600' : isExcessPaid ? 'text-purple-600' : 'text-green-600'}`}>
                                                {isExcessPaid ? formatCurrency(excessAmount) : pendingAmount > 0 ? formatCurrency(pendingAmount) : '-'}
                                              </span>
                                            </div>
                                            <div className="flex justify-between text-sm pt-2 border-t">
                                              <span className="text-gray-600">Status:</span>
                                              {isExcessPaid ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Excess Paid</span>
                                              ) : isPaid ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Cleared</span>
                                              ) : isPartial ? (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Partial</span>
                                              ) : (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Pending</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Payment Details Section */}
                                      {invoicePayments.length > 0 && (
                                        <div className="border-t-2 border-green-200 bg-green-50 p-4">
                                          <div className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                                            <CheckCircle size={16} className="text-green-600" />
                                            Payment History ({invoicePayments.length} payment{invoicePayments.length > 1 ? 's' : ''})
                                          </div>
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                              <thead className="bg-green-100">
                                                <tr>
                                                  <th className="px-3 py-2 text-left text-green-800 font-semibold">#</th>
                                                  <th className="px-3 py-2 text-left text-green-800 font-semibold">Date</th>
                                                  <th className="px-3 py-2 text-left text-green-800 font-semibold">Mode</th>
                                                  <th className="px-3 py-2 text-left text-green-800 font-semibold">Reference</th>
                                                  <th className="px-3 py-2 text-right text-green-800 font-semibold">Amount</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {invoicePayments.map((payment, pIdx) => (
                                                  <tr key={pIdx} className="bg-white border-b border-green-100">
                                                    <td className="px-3 py-2 text-gray-600">{pIdx + 1}</td>
                                                    <td className="px-3 py-2">
                                                      {payment.payment_date 
                                                        ? new Date(payment.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                        : payment.created_at 
                                                          ? new Date(payment.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                          : '-'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                      {payment.payment_mode && (
                                                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs uppercase font-medium">{payment.payment_mode}</span>
                                                      )}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-600">
                                                      {payment.reference_number || payment.remarks || '-'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-bold text-green-700">{formatCurrency(payment.amount)}</td>
                                                  </tr>
                                                ))}
                                                <tr className="bg-green-100 font-bold">
                                                  <td colSpan={4} className="px-3 py-2 text-right text-green-800">Total Paid:</td>
                                                  <td className="px-3 py-2 text-right text-green-700">{formatCurrency(invoicePayments.reduce((sum, p) => sum + (p.amount || 0), 0))}</td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Credit Notes Section */}
                                      {(invoiceCreditNotes[invoice.id]?.length > 0 || (invoice.credit_notes_applied && invoice.credit_notes_applied.length > 0)) && (
                                        <div className="border-t-2 border-purple-200 bg-purple-50 p-4">
                                          <div className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
                                            <CreditCard size={16} className="text-purple-600" />
                                            Credit Notes Applied ({(invoiceCreditNotes[invoice.id] || invoice.credit_notes_applied || []).length})
                                          </div>
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                              <thead className="bg-purple-100">
                                                <tr>
                                                  <th className="px-3 py-2 text-left text-purple-800 font-semibold">Credit Note #</th>
                                                  <th className="px-3 py-2 text-left text-purple-800 font-semibold">Original Invoice</th>
                                                  <th className="px-3 py-2 text-left text-purple-800 font-semibold">Applied Date</th>
                                                  <th className="px-3 py-2 text-right text-purple-800 font-semibold">Amount</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {(invoiceCreditNotes[invoice.id] || invoice.credit_notes_applied || []).map((cn, cnIdx) => {
                                                  const adjustment = cn.adjusted_against_invoices?.find(adj => adj.invoice_id === invoice.id);
                                                  return (
                                                    <tr key={cnIdx} className="bg-white border-b border-purple-100">
                                                      <td className="px-3 py-2 font-medium text-purple-700">{cn.credit_note_number || `CN #${cnIdx + 1}`}</td>
                                                      <td className="px-3 py-2 text-gray-600">{cn.original_invoice_number || '-'}</td>
                                                      <td className="px-3 py-2">
                                                        {adjustment?.adjusted_at 
                                                          ? new Date(adjustment.adjusted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                                          : '-'}
                                                      </td>
                                                      <td className="px-3 py-2 text-right font-bold text-purple-700">{formatCurrency(adjustment?.amount || cn.amount || 0)}</td>
                                                    </tr>
                                                  );
                                                })}
                                                <tr className="bg-purple-100 font-bold">
                                                  <td colSpan={3} className="px-3 py-2 text-right text-purple-800">Total Credit Applied:</td>
                                                  <td className="px-3 py-2 text-right text-purple-700">
                                                    {formatCurrency((invoiceCreditNotes[invoice.id] || invoice.credit_notes_applied || []).reduce((sum, cn) => {
                                                      const adj = cn.adjusted_against_invoices?.find(a => a.invoice_id === invoice.id);
                                                      return sum + (adj?.amount || cn.amount || 0);
                                                    }, 0))}
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ==================== REJECTIONS TAB ==================== */}
        {activeTab === 'rejections' && (
          <Card>
            <CardHeader className="py-3 flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">My Rejections</CardTitle>
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    <button
                      onClick={() => setRejectionViewMode('by-invoice')}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        rejectionViewMode === 'by-invoice' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      By Invoice Date
                    </button>
                    <button
                      onClick={() => {
                        setRejectionViewMode('by-recorded');
                        if (dailyRejectionSummary.length === 0) loadDailyRejectionSummary();
                      }}
                      className={`px-2 py-1 text-xs rounded-md transition-colors ${
                        rejectionViewMode === 'by-recorded' 
                          ? 'bg-white text-gray-900 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      By Recorded Date
                    </button>
                  </div>
                </div>
              </div>
              {/* Date Filter for By Recorded view */}
              {rejectionViewMode === 'by-recorded' && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    type="date"
                    value={rejectionDateFrom}
                    onChange={(e) => setRejectionDateFrom(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                  <span className="text-xs text-gray-500">to</span>
                  <Input
                    type="date"
                    value={rejectionDateTo}
                    onChange={(e) => setRejectionDateTo(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={loadDailyRejectionSummary}
                    className="h-8 text-xs"
                  >
                    Apply
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {/* BY INVOICE DATE VIEW */}
              {rejectionViewMode === 'by-invoice' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500 w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE DATE / PRODUCT</th>
                      <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                      <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REASON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejections.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">No rejections recorded</td></tr>
                    ) : (() => {
                      // Group rejections by date
                      const rejectionsByDate = rejections.reduce((acc, r) => {
                        const date = r.rejection_date?.split('T')[0] || 'Unknown';
                        if (!acc[date]) acc[date] = [];
                        acc[date].push(r);
                        return acc;
                      }, {});
                      
                      // Sort dates descending
                      const sortedDates = Object.keys(rejectionsByDate).sort((a, b) => b.localeCompare(a));
                      
                      return sortedDates.map(date => {
                        const dateRejections = rejectionsByDate[date];
                        const isExpanded = expandedRejectionDates[date];
                        const totalQty = dateRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
                        const totalValue = dateRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
                        
                        return (
                          <React.Fragment key={date}>
                            {/* Date Row - Clickable */}
                            <tr 
                              className="border-b bg-red-50 hover:bg-red-100 cursor-pointer"
                              onClick={() => setExpandedRejectionDates(prev => ({ ...prev, [date]: !prev[date] }))}
                            >
                              <td className="p-3 text-center">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{formatDate(date)}</td>
                              <td className="p-3 text-center text-red-600 font-semibold">{totalQty}</td>
                              <td className="p-3 text-right text-red-600 font-semibold">{formatCurrency(totalValue)}</td>
                              <td className="p-3 text-gray-500 text-xs">{dateRejections.length} item(s)</td>
                            </tr>
                            
                            {/* Expanded Product Details */}
                            {isExpanded && dateRejections.map((rejection, idx) => (
                              <tr key={rejection.id || idx} className="border-b bg-white hover:bg-gray-50">
                                <td className="p-2 pl-8"></td>
                                <td className="p-2 pl-8">
                                  <span className="text-sm text-gray-700">{getProductName(rejection)}</span>
                                  {rejection.variant_name && (
                                    <span className="text-xs text-gray-400 ml-1">({rejection.variant_name})</span>
                                  )}
                                </td>
                                <td className="p-2 text-center text-red-500">{rejection.quantity}</td>
                                <td className="p-2 text-right text-red-500">{formatCurrency(rejection.rejection_value)}</td>
                                <td className="p-2 text-gray-500">{rejection.reason}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                  {rejections.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td className="p-3"></td>
                        <td className="p-3 text-right">Total Rejected:</td>
                        <td className="p-3 text-center text-red-600">{rejections.reduce((sum, r) => sum + (r.quantity || 0), 0)}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(rejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              )}
              
              {/* BY RECORDED DATE VIEW */}
              {rejectionViewMode === 'by-recorded' && (
              <div className="overflow-x-auto">
                {loadingDailySummary ? (
                  <div className="p-8 text-center text-gray-400">Loading daily summary...</div>
                ) : dailyRejectionSummary.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">No rejections found for selected period</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium text-gray-500 w-8"></th>
                        <th className="p-3 text-left font-medium text-gray-500">RECORDED DATE</th>
                        <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                        <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                        <th className="p-3 text-left font-medium text-gray-500">DETAILS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRejectionSummary.map((dayData) => {
                        const isExpanded = expandedDailyDates[dayData.date];
                        // For retailer portal, there should only be one retailer (themselves)
                        const retailerData = dayData.retailers?.[0] || { items: [], total_qty: 0, total_value: 0 };
                        
                        return (
                          <React.Fragment key={dayData.date}>
                            {/* Date Row - Clickable */}
                            <tr 
                              className="border-b bg-orange-50 hover:bg-orange-100 cursor-pointer"
                              onClick={() => setExpandedDailyDates(prev => ({ ...prev, [dayData.date]: !prev[dayData.date] }))}
                            >
                              <td className="p-3 text-center">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{formatDate(dayData.date)}</td>
                              <td className="p-3 text-center text-orange-600 font-semibold">{dayData.total_qty}</td>
                              <td className="p-3 text-right text-orange-600 font-semibold">{formatCurrency(dayData.total_value)}</td>
                              <td className="p-3 text-gray-500 text-xs">{dayData.rejection_count} rejection(s)</td>
                            </tr>
                            
                            {/* Expanded: Individual Items */}
                            {isExpanded && retailerData.items.map((item, itemIdx) => (
                              <tr key={item.id || itemIdx} className="border-b bg-white hover:bg-gray-50">
                                <td></td>
                                <td className="p-2 pl-6">
                                  <span className="text-sm text-gray-700">{item.product_name}</span>
                                  {item.variant_name && (
                                    <span className="text-xs text-gray-400 ml-1">({item.variant_name})</span>
                                  )}
                                  <div className="text-[10px] text-gray-400 mt-0.5">
                                    Against Invoice: {formatDate(item.invoice_date)}
                                  </div>
                                </td>
                                <td className="p-2 text-center text-red-500">{item.quantity}</td>
                                <td className="p-2 text-right text-red-500">{formatCurrency(item.rejection_value)}</td>
                                <td className="p-2 text-gray-500 text-xs">{item.reason || '-'}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    {dailyRejectionSummary.length > 0 && (
                      <tfoot className="bg-gray-100 font-semibold">
                        <tr>
                          <td className="p-3"></td>
                          <td className="p-3 text-right">Total Rejected:</td>
                          <td className="p-3 text-center text-orange-600">
                            {dailyRejectionSummary.reduce((sum, d) => sum + d.total_qty, 0)}
                          </td>
                          <td className="p-3 text-right text-orange-600">
                            {formatCurrency(dailyRejectionSummary.reduce((sum, d) => sum + d.total_value, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
              )}
            </CardContent>
          </Card>
        )}


        {/* ==================== PAYMENT LEDGER TAB ==================== */}
        {activeTab === 'ledger' && (
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="text-blue-600" size={18} />
                    Payment Ledger
                  </CardTitle>
                </div>
                
                {/* Date Range Filter */}
                <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                    <Calendar size={14} className="text-gray-400" />
                    <span>Date Range:</span>
                  </div>
                  <Input
                    type="date"
                    value={ledgerStartDate}
                    onChange={(e) => setLedgerStartDate(e.target.value)}
                    className="w-32 sm:w-36 h-8 text-xs border-gray-300"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <Input
                    type="date"
                    value={ledgerEndDate}
                    onChange={(e) => setLedgerEndDate(e.target.value)}
                    className="w-32 sm:w-36 h-8 text-xs border-gray-300"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => loadLedgerData(ledgerStartDate, ledgerEndDate)}
                    className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-xs"
                    disabled={ledgerLoading}
                  >
                    {ledgerLoading ? 'Loading...' : 'Apply'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-4">
              {ledgerLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : !ledgerData ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Select a date range and click Apply to view payment ledger</p>
                </div>
              ) : ledgerData.dates?.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No payments found in the selected date range</p>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-blue-600 font-medium">Total Received</p>
                      <p className="text-lg sm:text-xl font-bold text-blue-700">{formatCurrency(ledgerData.grand_total || 0)}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-purple-600 font-medium">Credit Notes Applied</p>
                      <p className="text-lg sm:text-xl font-bold text-purple-700">{formatCurrency(ledgerData.total_credit_notes_applied || 0)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                      <p className="text-xs text-green-600 font-medium">Total Transactions</p>
                      <p className="text-lg sm:text-xl font-bold text-green-700">{ledgerData.total_transactions || 0}</p>
                    </div>
                  </div>
                  
                  {/* Payment Dates List */}
                  <div className="space-y-3">
                    {ledgerData.dates?.map((dateData, idx) => (
                      <div key={dateData.date} className="border rounded-lg overflow-hidden">
                        {/* Date Header - Clickable */}
                        <div 
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => setExpandedLedgerDates(prev => ({ ...prev, [dateData.date]: !prev[dateData.date] }))}
                        >
                          <div className="flex items-center gap-3">
                            {expandedLedgerDates[dateData.date] ? (
                              <ChevronDown size={18} className="text-gray-500" />
                            ) : (
                              <ChevronRight size={18} className="text-gray-500" />
                            )}
                            <div>
                              <p className="font-semibold text-gray-800">
                                {new Date(dateData.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                              <p className="text-xs text-gray-500">
                                {dateData.payment_count} payment(s)
                                {dateData.credit_notes?.length > 0 && ` + ${dateData.credit_notes.length} credit note(s)`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-blue-600">{formatCurrency(dateData.total_amount)}</p>
                            {dateData.credit_notes?.length > 0 && (
                              <p className="text-xs text-purple-600">
                                +{formatCurrency(dateData.credit_notes.reduce((sum, cn) => sum + (cn.amount || 0), 0))} credit
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Expanded View - Payment Details */}
                        {expandedLedgerDates[dateData.date] && (
                          <div className="border-t bg-white p-3 space-y-3">
                            {/* Payment Groups (grouped by reference number) */}
                            {dateData.payment_groups?.map((group, gIdx) => (
                              <div key={gIdx} className="border rounded-lg overflow-hidden">
                                <div className="bg-blue-50 px-3 py-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-gray-600 bg-white px-2 py-0.5 rounded">
                                      {group.payment_mode?.toUpperCase() || 'PAYMENT'}
                                    </span>
                                    <span className="text-sm font-medium text-gray-700">
                                      Ref: {group.reference_number}
                                    </span>
                                  </div>
                                  <span className="text-base font-bold text-blue-700">{formatCurrency(group.total_amount)}</span>
                                </div>
                                
                                {/* Invoice Adjustments */}
                                {group.invoice_adjustments?.length > 0 && (
                                  <div className="p-2">
                                    <p className="text-xs font-semibold text-gray-600 mb-2 px-1">Adjusted Against:</p>
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Invoice #</th>
                                          <th className="px-2 py-1.5 text-left font-medium text-gray-600">Invoice Date</th>
                                          <th className="px-2 py-1.5 text-right font-medium text-gray-600">Invoice Amt</th>
                                          <th className="px-2 py-1.5 text-right font-medium text-green-600">Adjusted</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {group.invoice_adjustments.map((adj, aIdx) => (
                                          <tr key={aIdx} className="border-t border-gray-100">
                                            <td className="px-2 py-1.5 font-medium text-blue-600">{adj.invoice_number}</td>
                                            <td className="px-2 py-1.5 text-gray-600">{formatDate(adj.invoice_date)}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-600">{formatCurrency(adj.invoice_payable)}</td>
                                            <td className="px-2 py-1.5 text-right font-medium text-green-600">{formatCurrency(adj.amount_adjusted)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            ))}
                            
                            {/* Credit Notes Applied on this date */}
                            {dateData.credit_notes?.length > 0 && (
                              <div className="border rounded-lg overflow-hidden">
                                <div className="bg-purple-50 px-3 py-2">
                                  <span className="text-sm font-semibold text-purple-700 flex items-center gap-2">
                                    <CreditCard size={14} />
                                    Credit Notes Applied
                                  </span>
                                </div>
                                <div className="p-2">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Credit Note #</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Original Invoice</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Adjusted Against</th>
                                        <th className="px-2 py-1.5 text-right font-medium text-purple-600">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dateData.credit_notes.map((cn, cnIdx) => (
                                        <tr key={cnIdx} className="border-t border-gray-100">
                                          <td className="px-2 py-1.5 font-medium text-purple-600">{cn.credit_note_number}</td>
                                          <td className="px-2 py-1.5 text-gray-600">{cn.original_invoice}</td>
                                          <td className="px-2 py-1.5 text-gray-600">{cn.adjusted_against_invoice_number || '-'}</td>
                                          <td className="px-2 py-1.5 text-right font-medium text-purple-600">{formatCurrency(cn.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}


        {/* ==================== STATEMENT TAB ==================== */}
        {activeTab === 'statement' && (
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="text-blue-600" size={18} />
                      Statement / Ledger
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                      Complete financial ledger showing invoices, payments, rejections, and credit notes
                    </p>
                  </div>
                </div>
                
                {/* Date Range Filter */}
                <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                    <Calendar size={14} className="text-gray-400" />
                    <span>Date Range:</span>
                  </div>
                  <Input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-32 sm:w-36 h-8 text-xs border-gray-300"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <Input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-32 sm:w-36 h-8 text-xs border-gray-300"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => loadStatementData(statementStartDate, statementEndDate)}
                    className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-xs"
                    disabled={statementLoading}
                  >
                    {statementLoading ? 'Loading...' : 'Apply'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-4">
              {statementLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
              ) : !statementData ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Select a date range and click Apply to view statement</p>
                </div>
              ) : statementData.entries?.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No transactions found in the selected date range</p>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">Retailer</div>
                      <div className="font-semibold text-sm">{statementData.retailer_name}</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <div className="text-xs text-red-600">Total Debit</div>
                      <div className="font-semibold text-red-700">₹{statementData.summary?.total_debit?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <div className="text-xs text-green-600">Total Credit</div>
                      <div className="font-semibold text-green-700">₹{statementData.summary?.total_credit?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div className={`rounded-lg p-3 ${statementData.summary?.closing_balance > 0 ? 'bg-orange-50' : 'bg-blue-50'}`}>
                      <div className={`text-xs ${statementData.summary?.closing_balance > 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                        {statementData.summary?.closing_balance > 0 ? 'Balance Due' : 'Excess Paid'}
                      </div>
                      <div className={`font-semibold ${statementData.summary?.closing_balance > 0 ? 'text-orange-700' : 'text-blue-700'}`}>
                        ₹{Math.abs(statementData.summary?.closing_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                  
                  {/* Ledger Table */}
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">DATE</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600">PARTICULARS</th>
                          <th className="px-2 py-2 text-right font-medium text-red-600">DEBIT</th>
                          <th className="px-2 py-2 text-right font-medium text-green-600">CREDIT</th>
                          <th className="px-2 py-2 text-right font-medium text-gray-600">BALANCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const groupedEntries = groupStatementEntries(statementData.entries);
                          return groupedEntries.map((entry, idx) => {
                            if (entry.isGroup) {
                              const isExpanded = expandedStatementGroups[entry.groupKey];
                              return (
                                <React.Fragment key={`group-${idx}`}>
                                  {/* Collapsed Summary Row */}
                                  <tr 
                                    className={`border-t cursor-pointer hover:bg-gray-100 ${
                                      entry.type === 'invoice' ? 'bg-red-50/50' : 
                                      entry.type === 'payment' ? 'bg-green-50/50' : 
                                      entry.type === 'credit_note' ? 'bg-blue-50/50' :
                                      entry.type === 'rejection' ? 'bg-yellow-50/50' : ''
                                    }`}
                                    onClick={() => setExpandedStatementGroups(prev => ({
                                      ...prev,
                                      [entry.groupKey]: !prev[entry.groupKey]
                                    }))}
                                  >
                                    <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">
                                      {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-xs ${isExpanded ? 'bg-gray-700 text-white' : 'bg-gray-300 text-gray-700'}`}>
                                          {isExpanded ? '−' : '+'}
                                        </span>
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                          entry.type === 'invoice' ? 'bg-red-100 text-red-700' :
                                          entry.type === 'payment' ? 'bg-green-100 text-green-700' :
                                          entry.type === 'credit_note' ? 'bg-blue-100 text-blue-700' :
                                          entry.type === 'rejection' ? 'bg-yellow-100 text-yellow-700' :
                                          'bg-gray-100 text-gray-700'
                                        }`}>
                                          {entry.type === 'invoice' ? 'INV' : 
                                           entry.type === 'payment' ? 'PMT' :
                                           entry.type === 'credit_note' ? 'CN' :
                                           entry.type === 'rejection' ? 'REJ' :
                                           entry.type.substring(0, 3).toUpperCase()}
                                        </span>
                                        <span className="font-medium text-gray-800">{entry.reference}</span>
                                        <span className="text-xs text-gray-500 hidden sm:inline">(tap to {isExpanded ? 'collapse' : 'expand'})</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-medium text-red-600">
                                      {entry.totalDebit > 0 ? entry.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-medium text-green-600">
                                      {entry.totalCredit > 0 ? entry.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                    </td>
                                    <td className={`px-2 py-1.5 text-right font-semibold ${
                                      entry.balance > 0 ? 'text-orange-600' : entry.balance < 0 ? 'text-blue-600' : 'text-gray-600'
                                    }`}>
                                      {Math.abs(entry.balance).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                      {entry.balance < 0 ? ' Cr' : ''}
                                    </td>
                                  </tr>
                                  
                                  {/* Expanded Individual Items */}
                                  {isExpanded && entry.items.map((item, itemIdx) => (
                                    <tr key={`item-${idx}-${itemIdx}`} className={`border-t border-dashed ${
                                      entry.type === 'invoice' ? 'bg-red-50/20' : 
                                      entry.type === 'payment' ? 'bg-green-50/20' : 
                                      entry.type === 'credit_note' ? 'bg-blue-50/20' :
                                      entry.type === 'rejection' ? 'bg-yellow-50/20' : 'bg-gray-50'
                                    }`}>
                                      <td className="px-2 py-1 text-gray-400 text-xs pl-4 sm:pl-6">↳</td>
                                      <td className="px-2 py-1">
                                        <div className="flex items-center gap-2 pl-4 sm:pl-6">
                                          <span className="text-gray-600 text-xs sm:text-sm">{item.reference}</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-1 text-right text-red-500 text-xs sm:text-sm">
                                        {item.debit > 0 ? item.debit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-right text-green-500 text-xs sm:text-sm">
                                        {item.credit > 0 ? item.credit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-right text-gray-400 text-xs sm:text-sm">
                                        {Math.abs(item.balance).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                        {item.balance < 0 ? ' Cr' : ''}
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              );
                            } else {
                              // Single entry - render normally
                              return (
                                <tr key={idx} className={`border-t hover:bg-gray-50 ${
                                  entry.type === 'invoice' ? 'bg-red-50/30' : 
                                  entry.type === 'payment' ? 'bg-green-50/30' : 
                                  entry.type === 'credit_note' ? 'bg-blue-50/30' :
                                  entry.type === 'rejection' ? 'bg-yellow-50/30' : ''
                                }`}>
                                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">
                                    {new Date(entry.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        entry.type === 'invoice' ? 'bg-red-100 text-red-700' :
                                        entry.type === 'payment' ? 'bg-green-100 text-green-700' :
                                        entry.type === 'credit_note' ? 'bg-blue-100 text-blue-700' :
                                        entry.type === 'rejection' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {entry.type === 'invoice' ? 'INV' : 
                                         entry.type === 'payment' ? 'PMT' :
                                         entry.type === 'credit_note' ? 'CN' :
                                         entry.type === 'rejection' ? 'REJ' :
                                         entry.type.substring(0, 3).toUpperCase()}
                                      </span>
                                      <span className="font-medium text-gray-800 text-xs sm:text-sm">{entry.reference}</span>
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-medium text-red-600">
                                    {entry.debit > 0 ? entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-medium text-green-600">
                                    {entry.credit > 0 ? entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                  </td>
                                  <td className={`px-2 py-1.5 text-right font-semibold ${
                                    entry.balance > 0 ? 'text-orange-600' : entry.balance < 0 ? 'text-blue-600' : 'text-gray-600'
                                  }`}>
                                    {Math.abs(entry.balance).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                    {entry.balance < 0 ? ' Cr' : ''}
                                  </td>
                                </tr>
                              );
                            }
                          });
                        })()}
                        
                        {/* Closing Row */}
                        {statementData.entries?.length > 0 && (
                          <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                            <td colSpan="2" className="px-2 py-2 text-right">CLOSING BALANCE</td>
                            <td className="px-2 py-2 text-right text-red-700">
                              {statementData.summary?.total_debit?.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                            </td>
                            <td className="px-2 py-2 text-right text-green-700">
                              {statementData.summary?.total_credit?.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                            </td>
                            <td className={`px-2 py-2 text-right ${
                              statementData.summary?.closing_balance > 0 ? 'text-orange-700' : 'text-blue-700'
                            }`}>
                              {Math.abs(statementData.summary?.closing_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                              {statementData.summary?.closing_balance < 0 ? ' Cr' : ''}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}


        {/* ==================== FINAL SUMMARY TAB ==================== */}
        {activeTab === 'finalsummary' && (
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="text-emerald-600" size={18} />
                      Final Summary - Invoice Reconciliation
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                      Detailed breakdown of invoices, rejections, payments, and balances
                    </p>
                  </div>
                </div>
                
                {/* Date Range Filter */}
                <div className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                    <Calendar size={14} className="text-gray-400" />
                    <span>Date Range:</span>
                  </div>
                  <Input
                    type="date"
                    value={finalSummaryStartDate}
                    onChange={(e) => setFinalSummaryStartDate(e.target.value)}
                    className="w-32 sm:w-36 h-8 text-xs border-gray-300"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <Input
                    type="date"
                    value={finalSummaryEndDate}
                    onChange={(e) => setFinalSummaryEndDate(e.target.value)}
                    className="w-32 sm:w-36 h-8 text-xs border-gray-300"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => loadFinalSummaryData(finalSummaryStartDate, finalSummaryEndDate)}
                    className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-xs"
                    disabled={finalSummaryLoading}
                  >
                    {finalSummaryLoading ? 'Loading...' : 'Apply'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-4">
              {finalSummaryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                </div>
              ) : !finalSummaryData ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Select a date range and click Apply to view final summary</p>
                </div>
              ) : finalSummaryData.rows?.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No invoices found in the selected date range</p>
                </div>
              ) : (
                <>
                  {/* Summary Table */}
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left border-b">#</th>
                          <th className="px-2 py-2 text-left border-b">DATE</th>
                          <th className="px-2 py-2 text-left border-b">INVOICE #</th>
                          <th className="px-2 py-2 text-right border-b">GROSS VALUE</th>
                          <th className="px-2 py-2 text-right border-b text-red-600">REJECTIONS</th>
                          <th className="px-2 py-2 text-right border-b">NET MRP</th>
                          <th className="px-2 py-2 text-right border-b text-purple-600">COMMISSION</th>
                          <th className="px-2 py-2 text-right border-b">PAYABLE</th>
                          <th className="px-2 py-2 text-right border-b text-blue-600">CREDIT NOTES</th>
                          <th className="px-2 py-2 text-right border-b text-green-600">PAID</th>
                          <th className="px-2 py-2 text-right border-b font-semibold">FINAL PAYABLE</th>
                          <th className="px-2 py-2 text-center border-b">STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finalSummaryData.rows?.map((row) => (
                          <React.Fragment key={row.invoice_id}>
                            {/* Main Row - Clickable to expand */}
                            <tr 
                              className={`border-b hover:bg-gray-50 cursor-pointer ${expandedFinalSummaryRows[row.invoice_id] ? 'bg-emerald-50' : ''}`}
                              onClick={() => setExpandedFinalSummaryRows(prev => ({
                                ...prev,
                                [row.invoice_id]: !prev[row.invoice_id]
                              }))}
                            >
                              <td className="px-2 py-1.5 text-gray-500">
                                <div className="flex items-center gap-1">
                                  {row.items?.length > 0 && (
                                    <ChevronRight size={12} className={`transition-transform ${expandedFinalSummaryRows[row.invoice_id] ? 'rotate-90' : ''}`} />
                                  )}
                                  {row.sno}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                {new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="px-2 py-1.5 font-medium text-blue-700">{row.invoice_number}</td>
                              <td className="px-2 py-1.5 text-right">₹{row.gross_value?.toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-right text-red-600">
                                {row.rejections > 0 ? `-₹${row.rejections?.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right">₹{row.total_mrp?.toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-right text-purple-600">
                                {row.commission > 0 ? `-₹${row.commission?.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium">₹{row.payable?.toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-right text-blue-600">
                                {row.credit_notes > 0 ? `-₹${row.credit_notes?.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right text-green-600">
                                {row.paid > 0 ? `₹${row.paid?.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className={`px-2 py-1.5 text-right font-semibold ${
                                row.final_payable > 0 ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                ₹{row.final_payable?.toLocaleString('en-IN')}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                  row.status === 'settled' ? 'bg-green-100 text-green-700' :
                                  row.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-orange-100 text-orange-700'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                            
                            {/* Expanded Items Row */}
                            {expandedFinalSummaryRows[row.invoice_id] && row.items?.length > 0 && (
                              <tr>
                                <td colSpan="12" className="p-0 bg-gray-50">
                                  <div className="px-2 sm:px-4 py-2 border-l-4 border-emerald-400">
                                    <div className="text-xs font-medium text-gray-600 mb-2">Item Details - Supply vs Rejection</div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs">
                                        <thead className="bg-gray-200">
                                          <tr>
                                            <th className="px-2 py-1 text-left">Product</th>
                                            <th className="px-2 py-1 text-left">Variant</th>
                                            <th className="px-2 py-1 text-right">Supplied Qty</th>
                                            <th className="px-2 py-1 text-right">MRP</th>
                                            <th className="px-2 py-1 text-right">Supplied Value</th>
                                            <th className="px-2 py-1 text-right text-red-600">Rejection Qty</th>
                                            <th className="px-2 py-1 text-right text-red-600">Rejection Amt</th>
                                            <th className="px-2 py-1 text-right text-green-600">Billable Qty</th>
                                            <th className="px-2 py-1 text-right text-green-600">Billable Value</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {row.items.map((item, idx) => (
                                            <tr key={idx} className={`${item.rejected_qty > 0 ? 'bg-red-50/50' : ''}`}>
                                              <td className="px-2 py-1">{item.product_name}</td>
                                              <td className="px-2 py-1 text-gray-500">{item.variant_name || '-'}</td>
                                              <td className="px-2 py-1 text-right">{item.supplied_qty}</td>
                                              <td className="px-2 py-1 text-right">₹{item.rate?.toLocaleString('en-IN') || 0}</td>
                                              <td className="px-2 py-1 text-right">₹{item.supply_value?.toLocaleString('en-IN')}</td>
                                              <td className="px-2 py-1 text-right text-red-600">
                                                {item.rejected_qty > 0 ? item.rejected_qty : '-'}
                                              </td>
                                              <td className="px-2 py-1 text-right text-red-600">
                                                {item.rejection_value > 0 ? `-₹${item.rejection_value?.toLocaleString('en-IN')}` : '-'}
                                              </td>
                                              <td className="px-2 py-1 text-right text-green-600 font-medium">{item.billable_qty}</td>
                                              <td className="px-2 py-1 text-right text-green-600 font-medium">
                                                ₹{item.billable_value?.toLocaleString('en-IN')}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        {row.item_totals && (
                                          <tfoot className="bg-gray-200 font-semibold border-t-2 border-gray-300">
                                            <tr>
                                              <td colSpan="2" className="px-2 py-1 text-right">TOTAL</td>
                                              <td className="px-2 py-1 text-right">{row.item_totals.supplied_qty}</td>
                                              <td className="px-2 py-1 text-right">-</td>
                                              <td className="px-2 py-1 text-right">₹{row.item_totals.supply_value?.toLocaleString('en-IN')}</td>
                                              <td className="px-2 py-1 text-right text-red-600">{row.item_totals.rejected_qty || '-'}</td>
                                              <td className="px-2 py-1 text-right text-red-600">
                                                {row.item_totals.rejection_value > 0 ? `-₹${row.item_totals.rejection_value?.toLocaleString('en-IN')}` : '-'}
                                              </td>
                                              <td className="px-2 py-1 text-right text-green-600">{row.item_totals.billable_qty}</td>
                                              <td className="px-2 py-1 text-right text-green-600">₹{row.item_totals.billable_value?.toLocaleString('en-IN')}</td>
                                            </tr>
                                          </tfoot>
                                        )}
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                      {finalSummaryData.totals && (
                        <tfoot className="bg-gray-100 font-semibold">
                          <tr className="border-t-2">
                            <td colSpan="3" className="px-2 py-2 text-right">TOTALS</td>
                            <td className="px-2 py-2 text-right">₹{finalSummaryData.totals.gross_value?.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 text-right text-red-600">
                              {finalSummaryData.totals.rejections > 0 ? `-₹${finalSummaryData.totals.rejections?.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right">₹{finalSummaryData.totals.total_mrp?.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 text-right text-purple-600">
                              -₹{finalSummaryData.totals.commission?.toLocaleString('en-IN')}
                            </td>
                            <td className="px-2 py-2 text-right">₹{finalSummaryData.totals.payable?.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 text-right text-blue-600">
                              {finalSummaryData.totals.credit_notes > 0 ? `-₹${finalSummaryData.totals.credit_notes?.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-green-600">
                              ₹{finalSummaryData.totals.paid?.toLocaleString('en-IN')}
                            </td>
                            <td className={`px-2 py-2 text-right ${
                              finalSummaryData.totals.final_payable > 0 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              ₹{finalSummaryData.totals.final_payable?.toLocaleString('en-IN')}
                            </td>
                            <td className="px-2 py-2 text-center text-gray-500">
                              {finalSummaryData.row_count} invoices
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}


        {/* ==================== CREDIT NOTES TAB ==================== */}
        {activeTab === 'creditnotes' && (
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="text-purple-600" size={18} />
                  Credit Notes
                </CardTitle>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={loadCreditNotesData}
                  className="h-8 px-3 text-xs"
                  disabled={creditNotesLoading}
                >
                  <RefreshCw size={14} className={`mr-1.5 ${creditNotesLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-4">
              {creditNotesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                </div>
              ) : !creditNotesData ? (
                <div className="text-center py-12 text-gray-500">
                  <CreditCard size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Loading credit notes...</p>
                </div>
              ) : !creditNotesData?.invoices || creditNotesData.invoices.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CreditCard size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No credit notes found</p>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-purple-600 font-medium">Total Issued</p>
                      <p className="text-lg sm:text-xl font-bold text-purple-700">{formatCurrency(creditNotesData.summary?.total_issued || 0)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-green-600 font-medium">Adjusted</p>
                      <p className="text-lg sm:text-xl font-bold text-green-700">{formatCurrency(creditNotesData.summary?.total_adjusted || 0)}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-orange-600 font-medium">Pending</p>
                      <p className="text-lg sm:text-xl font-bold text-orange-700">{formatCurrency(creditNotesData.summary?.total_pending || 0)}</p>
                    </div>
                  </div>
                  
                  {/* Invoice-wise Credit Notes List */}
                  <div className="space-y-3">
                    {creditNotesData.invoices?.map((invoiceData) => (
                      <div key={invoiceData.invoice_number} className="border rounded-lg overflow-hidden">
                        {/* Invoice Header - Clickable */}
                        <div 
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => setExpandedCreditDates(prev => ({ ...prev, [invoiceData.invoice_number]: !prev[invoiceData.invoice_number] }))}
                          data-testid={`credit-invoice-${invoiceData.invoice_number}`}
                        >
                          <div className="flex items-center gap-3">
                            {expandedCreditDates[invoiceData.invoice_number] ? (
                              <ChevronDown size={18} className="text-gray-500" />
                            ) : (
                              <ChevronRight size={18} className="text-gray-500" />
                            )}
                            <div>
                              <p className="font-semibold text-gray-800">
                                {invoiceData.invoice_date 
                                  ? new Date(invoiceData.invoice_date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                                  : 'Unknown Date'
                                }
                              </p>
                              <p className="text-xs text-gray-500">
                                {invoiceData.invoice_number} • {invoiceData.credit_note_count} credit note(s)
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-purple-600">{formatCurrency(invoiceData.credit_amount)}</p>
                          </div>
                        </div>
                        
                        {/* Expanded View - Credit Note Details */}
                        {expandedCreditDates[invoiceData.invoice_number] && (
                          <div className="border-t bg-white p-3">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-2 py-1.5 text-left font-medium text-gray-600">CN #</th>
                                  <th className="px-2 py-1.5 text-left font-medium text-gray-600">Product</th>
                                  <th className="px-2 py-1.5 text-center font-medium text-gray-600">Qty</th>
                                  <th className="px-2 py-1.5 text-left font-medium text-gray-600">Rejection Date</th>
                                  <th className="px-2 py-1.5 text-right font-medium text-gray-600">Amount</th>
                                  <th className="px-2 py-1.5 text-right font-medium text-green-600">Adjusted</th>
                                  <th className="px-2 py-1.5 text-right font-medium text-orange-600">Pending</th>
                                </tr>
                              </thead>
                              <tbody>
                                {invoiceData.credit_notes?.map((cn, cnIdx) => {
                                  // If there are rejection details, show product-wise rows
                                  if (cn.rejection_details && cn.rejection_details.length > 0) {
                                    return cn.rejection_details.map((detail, detailIdx) => (
                                      <tr key={`${cnIdx}-${detailIdx}`} className="border-t border-gray-100">
                                        {detailIdx === 0 && (
                                          <td className="px-2 py-1.5 font-medium text-blue-600" rowSpan={cn.rejection_details.length}>
                                            {cn.credit_note_number}
                                          </td>
                                        )}
                                        <td className="px-2 py-1.5 text-gray-700">{detail.product_name || detail.variant_name || '-'}</td>
                                        <td className="px-2 py-1.5 text-center text-gray-600">{detail.rejected_qty || detail.quantity || '-'}</td>
                                        {detailIdx === 0 && (
                                          <>
                                            <td className="px-2 py-1.5 text-gray-600" rowSpan={cn.rejection_details.length}>
                                              {cn.rejection_date ? formatDate(cn.rejection_date) : formatDate(cn.created_at)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-medium text-gray-700" rowSpan={cn.rejection_details.length}>
                                              {formatCurrency(cn.amount)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-medium text-green-600" rowSpan={cn.rejection_details.length}>
                                              {formatCurrency(cn.adjusted_amount || 0)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-medium text-orange-600" rowSpan={cn.rejection_details.length}>
                                              {formatCurrency(cn.pending_amount || cn.amount)}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    ));
                                  } else {
                                    // No rejection details (excess payment or legacy) - show single row with source
                                    return (
                                      <tr key={cnIdx} className="border-t border-gray-100">
                                        <td className="px-2 py-1.5 font-medium text-blue-600">{cn.credit_note_number}</td>
                                        <td className="px-2 py-1.5 text-gray-500 italic">
                                          {cn.source === 'excess_payment' ? 'Excess Payment' : '-'}
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-gray-500">-</td>
                                        <td className="px-2 py-1.5 text-gray-600">
                                          {cn.rejection_date ? formatDate(cn.rejection_date) : formatDate(cn.created_at)}
                                        </td>
                                        <td className="px-2 py-1.5 text-right font-medium text-gray-700">{formatCurrency(cn.amount)}</td>
                                        <td className="px-2 py-1.5 text-right font-medium text-green-600">{formatCurrency(cn.adjusted_amount || 0)}</td>
                                        <td className="px-2 py-1.5 text-right font-medium text-orange-600">{formatCurrency(cn.pending_amount || cn.amount)}</td>
                                      </tr>
                                    );
                                  }
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}


        {/* ==================== CLOSING TAB (View/Edit Closing History + Daily Inventory) ==================== */}
        {activeTab === 'closing' && (
          <Card>
            <CardHeader className="border-b py-3 px-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardList className="text-green-600" size={18} />
                    {t('retailer.closingStock') || 'Closing & Inventory'}
                  </CardTitle>
                  <Button 
                    onClick={openRecordClosingModal}
                    className="bg-green-600 hover:bg-green-700 h-9 text-sm px-4"
                  >
                    <Plus size={14} className="mr-1.5" />
                    {t('retailer.recordClosing') || 'Record Today\'s Closing'}
                  </Button>
                </div>
                {/* Sub-tabs for Closing History and Daily Inventory */}
                <div className="flex gap-2 border-b -mb-4 pb-0">
                  <button
                    onClick={() => setClosingSubTab('closing-history')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      closingSubTab === 'closing-history'
                        ? 'border-green-600 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('retailer.closingHistory') || 'Closing History'}
                  </button>
                  <button
                    onClick={() => setClosingSubTab('daily-inventory')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      closingSubTab === 'daily-inventory'
                        ? 'border-green-600 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('retailer.dailyInventory') || 'Daily Inventory'}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {/* Closing History Sub-tab */}
              {closingSubTab === 'closing-history' && (
                <>
              {/* Date selector to view closing history */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                <label className="text-sm font-medium text-gray-600">{t('retailer.viewClosingFor') || 'View Closing for:'}</label>
                <Input
                  type="date"
                  value={closingHistoryDate}
                  onChange={(e) => setClosingHistoryDate(e.target.value)}
                  className="w-[160px] h-9"
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => loadClosingHistory(closingHistoryDate)}
                  disabled={loadingClosing}
                  className="h-9 px-3"
                >
                  <RefreshCw size={14} className={loadingClosing ? 'animate-spin' : ''} />
                </Button>
                {recordedDates.length > 0 && (
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    {recordedDates.length} {t('retailer.datesRecorded') || 'dates recorded'}
                  </span>
                )}
              </div>

              {/* Closing History Display */}
              {loadingClosing ? (
                <div className="text-center py-8 text-gray-500">
                  <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                  <p className="text-sm">{t('common.loading') || 'Loading...'}</p>
                </div>
              ) : closingHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ClipboardList size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-medium">{t('retailer.noClosingRecorded') || 'No closing recorded for'} {closingHistoryDate}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('retailer.clickRecordClosing') || 'Click "Record Closing" to add closing stock'}</p>
                </div>
              ) : (
                <div>
                  {/* Edit/Delete buttons - only for today */}
                  {closingHistoryDate === getLocalDateString() && (
                    <div className="flex justify-end gap-2 mb-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editClosingInventory(closingHistoryDate)}
                        className="text-blue-600 border-blue-300 hover:bg-blue-50"
                      >
                        <Pencil size={14} className="mr-1" />
                        {t('common.edit') || 'Edit'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteClosingInventory(closingHistoryDate)}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <Trash2 size={14} className="mr-1" />
                        {t('common.delete') || 'Delete'}
                      </Button>
                    </div>
                  )}
                  
                  <div className="overflow-x-auto">
                    <table className="text-sm border-collapse">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{t('retailer.product') || 'Product'}</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">{t('retailer.closingQty') || 'Closing'}</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closingHistory
                          .slice() // Create copy to avoid mutating original
                          .sort((a, b) => {
                            // Two-step sorting: non-zero closing first, then by descending closing qty
                            const aClosing = typeof a.closing_qty === 'number' ? a.closing_qty : 0;
                            const bClosing = typeof b.closing_qty === 'number' ? b.closing_qty : 0;
                            const aHasClosing = aClosing > 0;
                            const bHasClosing = bClosing > 0;
                            
                            // Non-zero closing comes first
                            if (aHasClosing && !bHasClosing) return -1;
                            if (!aHasClosing && bHasClosing) return 1;
                            
                            // Within same group, sort by descending closing qty
                            return bClosing - aClosing;
                          })
                          .map(item => (
                          <tr key={`${item.product_id}-${item.variant_id || 'default'}`} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <div className="font-medium text-gray-800">{getProductName(item)}</div>
                              <div className="text-xs text-gray-400">{resolveVariantName(item.variant_name, item.variant_id) || item.unit || 'Kg'}</div>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {editingItemId === item.id ? (
                                <div className="flex items-center justify-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    value={editingItemQty}
                                    onChange={(e) => setEditingItemQty(e.target.value)}
                                    className="w-20 h-8 text-center"
                                    autoFocus
                                  />
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={saveEditingItem}
                                    className="h-8 w-8 p-0 text-green-600 hover:bg-green-50"
                                  >
                                    <Check size={16} />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => { setEditingItemId(null); setEditingItemQty(''); }}
                                    className="h-8 w-8 p-0 text-gray-600 hover:bg-gray-100"
                                  >
                                    <X size={16} />
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-lg font-semibold text-blue-600">
                                  {item.closing_qty}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {editingItemId !== item.id && closingHistoryDate === getLocalDateString() && (
                                <div className="flex items-center justify-center gap-1">
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => startEditingItem(item)}
                                    className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50"
                                    title="Edit"
                                  >
                                    <Edit2 size={14} />
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="ghost"
                                    onClick={() => deleteClosingItem(item.id, item.product_name)}
                                    className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              )}
                              {closingHistoryDate !== getLocalDateString() && (
                                <span className="text-xs text-gray-400">View only</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-100 font-semibold text-sm">
                        <tr>
                          <td className="px-3 py-1.5" colSpan={3}>Total: {closingHistory.length} items</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
              </>
              )}

              {/* Daily Inventory Sub-tab */}
              {closingSubTab === 'daily-inventory' && (
                <>
                  {/* Date selector, Excel Export, and search */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 pb-4 border-b">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-500" />
                      <Input
                        type="date"
                        value={inventoryDate}
                        onChange={(e) => setInventoryDate(e.target.value)}
                        className="w-[150px] h-9"
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          // Export inventory data to Excel
                          if (inventoryData.length === 0) {
                            toast.error('No inventory data to export');
                            return;
                          }
                          
                          // Get product details for type and category
                          const exportData = inventoryData.map(item => {
                            const product = products.find(p => p.id === item.product_id);
                            return {
                              'Product Name': item.product_name || '',
                              'Variant': resolveVariantName(item.variant_name, item.variant_id) || 'Kg',
                              'Type': product?.product_type || 'N/A',
                              'Category': product?.category || 'N/A',
                              'Closing Qty': item.closing_qty ?? 0
                            };
                          });
                          
                          // Create CSV content
                          const headers = ['Product Name', 'Variant', 'Type', 'Category', 'Closing Qty'];
                          const csvRows = [
                            headers.join(','),
                            ...exportData.map(row => 
                              headers.map(h => {
                                const val = row[h];
                                // Escape commas and quotes
                                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                                  return `"${val.replace(/"/g, '""')}"`;
                                }
                                return val;
                              }).join(',')
                            )
                          ];
                          const csvContent = csvRows.join('\n');
                          
                          // Download as CSV (Excel compatible)
                          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.setAttribute('download', `Inventory_${inventoryDate}.csv`);
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.URL.revokeObjectURL(url);
                          
                          toast.success('Inventory exported successfully');
                        }}
                        className="h-9 px-3 text-green-700 border-green-300 hover:bg-green-50"
                        title="Export to Excel"
                      >
                        <Download size={14} className="mr-1" />
                        <span className="hidden sm:inline">Export</span>
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => loadInventoryData(inventoryDate)}
                        disabled={loadingClosing}
                        className="h-9 px-3"
                      >
                        <RefreshCw size={14} className={loadingClosing ? 'animate-spin' : ''} />
                      </Button>
                    </div>
                    <div className="relative flex-1 max-w-md">
                      <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <Input
                        type="text"
                        placeholder={t('retailer.searchProduct') || 'Search product...'}
                        value={inventorySearchTerm}
                        onChange={(e) => setInventorySearchTerm(e.target.value)}
                        className="pl-10 h-9"
                      />
                    </div>
                  </div>

                  {/* Inventory Table */}
                  {loadingClosing ? (
                    <div className="text-center py-8 text-gray-500">
                      <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                      <p className="text-sm">{t('common.loading') || 'Loading...'}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">{t('retailer.product') || 'Product'}</th>
                            <th className="px-2 py-1.5 text-center font-medium text-blue-600 whitespace-nowrap">{t('retailer.openingQty') || 'Opening'}</th>
                            <th className="px-2 py-1.5 text-center font-medium text-green-600 whitespace-nowrap">{t('retailer.receivedQty') || 'Received'}</th>
                            <th className="px-2 py-1.5 text-center font-medium text-red-600 whitespace-nowrap">{t('retailer.rejectionQty') || 'Rejection'}</th>
                            <th className="px-2 py-1.5 text-center font-medium text-purple-600 whitespace-nowrap">{t('retailer.itemsSoldQty') || 'Sold'}</th>
                            <th className="px-2 py-1.5 text-center font-medium text-amber-600 whitespace-nowrap">{t('retailer.closingQty') || 'Closing'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryData
                            .filter(item => 
                              !inventorySearchTerm || 
                              item.product_name?.toLowerCase().includes(inventorySearchTerm.toLowerCase())
                            )
                            .sort((a, b) => {
                              // Two-step sorting: non-zero closing first, then by descending closing qty
                              const aClosing = typeof a.closing_qty === 'number' ? a.closing_qty : 0;
                              const bClosing = typeof b.closing_qty === 'number' ? b.closing_qty : 0;
                              const aHasClosing = aClosing > 0;
                              const bHasClosing = bClosing > 0;
                              
                              // Non-zero closing comes first
                              if (aHasClosing && !bHasClosing) return -1;
                              if (!aHasClosing && bHasClosing) return 1;
                              
                              // Within same group, sort by descending closing qty
                              return bClosing - aClosing;
                            })
                            .map((item, idx) => (
                              <tr key={`${item.product_id}-${item.variant_id || idx}`} className="border-b hover:bg-gray-50">
                                <td className="px-2 py-1 whitespace-nowrap">
                                  <div className="font-medium text-gray-800">{item.product_name}</div>
                                  {(() => {
                                    const displayVariant = resolveVariantName(item.variant_name, item.variant_id);
                                    return displayVariant && displayVariant !== 'Kg' ? (
                                      <div className="text-[10px] text-gray-500">{displayVariant}</div>
                                    ) : null;
                                  })()}
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`font-semibold ${item.opening_qty > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                                    {item.opening_qty || 0}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`font-semibold ${item.received_qty > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                                    {item.received_qty > 0 ? `+${item.received_qty}` : '0'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`font-semibold ${item.rejection_qty > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                    {item.rejection_qty > 0 ? `-${item.rejection_qty}` : '0'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`font-semibold ${item.items_sold !== null && item.items_sold > 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                                    {item.items_sold !== null ? item.items_sold : '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`font-semibold ${item.closing_qty !== null && item.closing_qty !== undefined ? 'text-amber-600' : 'text-gray-300'}`}>
                                    {item.closing_qty !== null && item.closing_qty !== undefined ? item.closing_qty : '-'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        {inventoryData.length > 0 && (
                          <tfoot className="bg-gray-100 font-semibold text-xs">
                            <tr>
                              <td className="px-2 py-1.5 text-right" colSpan={6}>
                                Total: {inventoryData.filter(item => !inventorySearchTerm || item.product_name?.toLowerCase().includes(inventorySearchTerm.toLowerCase())).length} products
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                      {inventoryData.length === 0 && (
                        <div className="text-center py-6 text-gray-500">
                          <Package size={32} className="mx-auto mb-2 text-gray-300" />
                          <p className="text-xs font-medium">{t('retailer.noInventoryData') || 'No inventory data for this date'}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ==================== MY ACCOUNT TAB ==================== */}
        {activeTab === 'account' && (
          <Card>
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User size={16} />
                {t('retailer.myAccount') || 'My Account'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {/* Profile Info */}
              <div className="bg-gray-50 rounded-lg p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-5">{t('retailer.profileInfo') || 'Profile Information'}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.companyName') || 'Company Name'}</p>
                    <p className="font-semibold text-lg">{dashboardData?.retailer?.company_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.ownerName') || 'Owner Name'}</p>
                    <p className="font-semibold text-lg">{dashboardData?.retailer?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.email') || 'Email'}</p>
                    <p className="font-semibold">{dashboardData?.retailer?.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.phone') || 'Phone'}</p>
                    <p className="font-semibold">{dashboardData?.retailer?.contact || '-'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.address') || 'Address'}</p>
                    <p className="font-semibold">{dashboardData?.retailer?.address || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.commissionRate') || 'Commission Rate'}</p>
                    <p className="font-semibold text-lg text-green-600">{dashboardData?.retailer?.commission_percentage || 0}%</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{t('retailer.myReferralCode') || 'My Referral Code'}</p>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg text-purple-600 bg-purple-50 px-3 py-1 rounded">
                        {dashboardData?.retailer?.referral_code || 'N/A'}
                      </p>
                      {dashboardData?.retailer?.referral_code && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(dashboardData?.retailer?.referral_code);
                            toast.success('Referral code copied!');
                          }}
                          className="text-purple-600 hover:bg-purple-50"
                        >
                          Copy
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
        {/* End of min-h-screen */}

        {/* ==================== RECORD CLOSING MODAL ==================== */}
        {showRecordClosingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">{t('retailer.recordClosingStock')}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t('retailer.enterClosingQty')}</p>
                </div>
                <button 
                  onClick={() => { setShowRecordClosingModal(false); setClosingSearchTerm(''); }} 
                  className="p-1.5 hover:bg-gray-100 rounded"
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* Date Display - Locked to Today */}
              <div className="p-4 border-b bg-emerald-50">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">
                    {editingClosingDate ? (
                      <>Editing: {formatDate(closingDate)}</>
                    ) : (
                      <>Recording for Today: {formatDate(getLocalDateString())}</>
                    )}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Closing can only be recorded for today's date</p>
              </div>
              
              {/* Search Bar */}
              <div className="p-4 border-b">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder={t('retailer.searchProduct') || "Search product..."}
                    value={closingSearchTerm}
                    onChange={(e) => setClosingSearchTerm(e.target.value)}
                    className="w-full pl-10 h-10"
                    data-testid="closing-search-input"
                  />
                  {closingSearchTerm && (
                    <button 
                      onClick={() => setClosingSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                {closingSearchTerm && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    Showing {filteredClosingItems.length} of {closingItems.length} products
                  </p>
                )}
              </div>
              
              {/* Products List */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  {filteredClosingItems.map((item, index) => (
                    <div 
                      key={`${item.product_id}-${item.variant_id || 'default'}`} 
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        item.closing_qty !== '' && item.closing_qty !== null ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{getProductName(item)}</div>
                        {/* Show variant name prominently if it's not just "Kg" */}
                        {item.variant_name && item.variant_name !== 'Kg' ? (
                          <div className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded mt-1 inline-block">
                            {item.variant_name}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">{item.unit || 'Kg'}</div>
                        )}
                        <div className="flex gap-3 mt-1 text-xs">
                          {item.opening_qty > 0 && (
                            <span className="text-blue-600">Open: {item.opening_qty}</span>
                          )}
                          {item.dispatch_qty > 0 && (
                            <span className="text-green-600">+Recv: {item.dispatch_qty}</span>
                          )}
                        </div>
                      </div>
                      <div className="ml-3">
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder={t('common.qty')}
                          value={item.closing_qty}
                          onChange={(e) => updateClosingQty(item.product_id, item.variant_id, e.target.value)}
                          className="w-24 h-9 text-center font-medium"
                        />
                      </div>
                    </div>
                  ))}
                  {filteredClosingItems.length === 0 && closingSearchTerm && (
                    <div className="text-center py-8 text-gray-500">
                      No products found matching "{closingSearchTerm}"
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-4 border-t bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-500">
                    <span className="text-green-600 font-medium">{filledItemsCount}</span> {t('retailer.filled')}, {' '}
                    <span className="text-orange-600 font-medium">{pendingItemsCount}</span> {t('retailer.pending')}
                  </span>
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => { setShowRecordClosingModal(false); setClosingSearchTerm(''); }} 
                    className="flex-1"
                    disabled={savingClosing}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button 
                    onClick={() => saveClosingInventory(false)}
                    disabled={savingClosing}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {savingClosing ? (
                      <>
                        <RefreshCw size={14} className="mr-1.5 animate-spin" />
                        {t('common.loading')}
                      </>
                    ) : (
                      <>
                        <Save size={14} className="mr-1.5" />
                        {t('retailer.saveClosing')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* ==================== PENDING ITEMS CONFIRMATION MODAL ==================== */}
        {showPendingConfirmation && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-orange-600 flex items-center gap-2">
                  <AlertTriangle size={20} />
                  {t('retailer.pendingItemsTitle') || 'Pending Items'}
                </h3>
              </div>
              
              <div className="p-4">
                <p className="text-gray-700 mb-4">
                  {t('retailer.pendingItemsMessage') || `You have ${pendingItemsCount} products without closing quantity. Are you sure there is no remaining stock for these items?`}
                </p>
                
                {/* List of pending items */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-orange-800 mb-2">
                    {t('retailer.pendingProductsList') || 'Products without closing qty:'}
                  </p>
                  <ul className="text-sm text-orange-700 space-y-1 max-h-[150px] overflow-y-auto pr-1">
                    {closingItems
                      .filter(item => item.closing_qty === '' || item.closing_qty === null)
                      .map(item => (
                        <li key={`${item.product_id}-${item.variant_id || 'default'}`} className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-orange-400 rounded-full"></span>
                          {getProductName(item)} {item.variant_name && item.variant_name !== 'Kg' && <span className="text-orange-500">({item.variant_name})</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
              
              <div className="p-4 border-t bg-gray-50 space-y-3">
                <Button 
                  onClick={() => saveClosingInventory(true)}
                  disabled={savingClosing}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  {savingClosing ? (
                    <>
                      <RefreshCw size={14} className="mr-1.5 animate-spin" />
                      {t('common.loading')}
                    </>
                  ) : (
                    <>
                      <Check size={14} className="mr-1.5" />
                      {t('retailer.yesSetZero') || 'Yes, set all pending as 0'}
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline"
                  onClick={continueFilling}
                  disabled={savingClosing}
                  className="w-full"
                >
                  {t('retailer.noMoreItems') || 'No, I need to fill more items'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== INDENT MODAL ==================== */}
        {showIndentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Create New Indent</h3>
                <button onClick={() => { setShowIndentModal(false); resetIndentForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateIndent} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <Input
                    type="date"
                    value={indentForm.indent_date}
                    onChange={(e) => setIndentForm(prev => ({ ...prev, indent_date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Items *</label>
                    <Button type="button" size="sm" variant="outline" onClick={addIndentItem}>
                      <Plus size={14} className="mr-1" /> Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {indentForm.items.map((item, index) => (
                      <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                        <select
                          value={item.product_id}
                          onChange={(e) => updateIndentItem(index, 'product_id', e.target.value)}
                          className="flex-1 h-8 px-2 rounded border text-sm"
                          required
                        >
                          <option value="">Select Product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <select
                          value={item.variant_id}
                          onChange={(e) => updateIndentItem(index, 'variant_id', e.target.value)}
                          className="w-32 h-8 px-2 rounded border text-sm"
                        >
                          <option value="">Variant</option>
                          {packagings.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateIndentItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                          placeholder="Qty"
                          className="w-20 h-8"
                          required
                        />
                        {indentForm.items.length > 1 && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeIndentItem(index)}>
                            <X size={14} className="text-red-600" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    value={indentForm.remarks}
                    onChange={(e) => setIndentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowIndentModal(false); resetIndentForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">Create Indent</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== GRN MODAL ==================== */}
        {showGrnModal && selectedDispatch && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Confirm GRN - {selectedDispatch.invoice_number}</h3>
                  <p className="text-sm text-gray-500">Enter the actual quantities you received</p>
                </div>
                <button onClick={() => { setShowGrnModal(false); setSelectedDispatch(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSubmitGrn} className="p-4 space-y-4">
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-center">Supplied</th>
                        <th className="p-2 text-center">Received</th>
                        <th className="p-2 text-center">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grnItems.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2">{getProductName(item)} {item.variant_name && `(${item.variant_name})`}</td>
                          <td className="p-2 text-center text-gray-500">{item.supplied_qty}</td>
                          <td className="p-2 text-center">
                            <Input
                              type="number"
                              min="0"
                              value={item.received_qty}
                              onChange={(e) => updateGrnItem(index, parseFloat(e.target.value) || 0)}
                              className="w-20 h-7 text-center mx-auto"
                            />
                          </td>
                          <td className={`p-2 text-center font-medium ${
                            item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : ''
                          }`}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowGrnModal(false); setSelectedDispatch(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">Confirm GRN</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== CREATE INDENT MODAL ==================== */}
        {showCreateIndentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col my-auto">
              {/* Header */}
              <div className="p-3 sm:p-4 border-b bg-[#14532D] text-white flex justify-between items-center flex-shrink-0">
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <Plus size={18} />
                  {editingIndentId ? (i18n.language === 'hi' ? 'इंडेंट संपादित करें' : 'Edit Indent') : (i18n.language === 'hi' ? 'नया इंडेंट बनाएं' : 'Create New Indent')}
                </h2>
                <div className="flex items-center gap-2">
                  {/* Language Toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => i18n.changeLanguage(i18n.language === 'hi' ? 'en' : 'hi')}
                    className="text-white hover:bg-white/20 h-8 px-2 text-xs font-medium"
                    title={i18n.language === 'hi' ? 'Switch to English' : 'हिंदी में बदलें'}
                  >
                    {i18n.language === 'hi' ? 'EN' : 'हि'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateIndentModal(false)}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                  >
                    <X size={20} />
                  </Button>
                </div>
              </div>
              
              {/* Date Picker */}
              <div className="p-3 sm:p-4 border-b bg-gray-50 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Label className="font-medium text-sm whitespace-nowrap">{i18n.language === 'hi' ? 'इंडेंट दिनांक:' : 'Indent Date:'}</Label>
                  <Input
                    type="date"
                    value={createIndentDate}
                    onChange={(e) => setCreateIndentDate(e.target.value)}
                    className="w-full sm:w-40 h-9"
                    min={getLocalDateString()}
                  />
                </div>
              </div>
              
              {/* Search Box */}
              <div className="px-3 sm:px-4 py-2 border-b bg-white flex-shrink-0">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder={i18n.language === 'hi' ? 'उत्पाद खोजें...' : 'Search products...'}
                    value={indentSearchQuery}
                    onChange={(e) => setIndentSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {indentSearchQuery && (
                    <button
                      onClick={() => setIndentSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Products List - Scrollable */}
              <div className="overflow-y-auto flex-1 p-2 sm:p-4">
                <div className="space-y-2 sm:space-y-3">
                  {sortedCategoryNames.map((categoryName) => {
                    const allCategoryProducts = productsByCategory[categoryName] || [];
                    // Filter by search query
                    const categoryProducts = indentSearchQuery 
                      ? allCategoryProducts.filter(p => 
                          p.name?.toLowerCase().includes(indentSearchQuery.toLowerCase()) ||
                          p.name_hi?.toLowerCase().includes(indentSearchQuery.toLowerCase())
                        )
                      : allCategoryProducts;
                    
                    // Skip empty categories when searching
                    if (indentSearchQuery && categoryProducts.length === 0) return null;
                    
                    const isExpanded = expandedCreateTypes[categoryName] || !!indentSearchQuery; // Auto-expand when searching
                    const selectedCount = categoryProducts.filter(p => createIndentItems[p.id]?.quantity > 0).length;
                    
                    return (
                      <div key={categoryName} className={`border rounded-lg overflow-hidden ${getTypeColorClasses(categoryName).split(' ')[2]}`}>
                        {/* Category Header */}
                        <div
                          className={`flex items-center justify-between p-2 sm:p-3 cursor-pointer ${getTypeColorClasses(categoryName).split(' ').slice(0, 2).join(' ')} hover:opacity-90`}
                          onClick={() => toggleCreateType(categoryName)}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span className="font-semibold text-sm">{categoryName}</span>
                            <span className="text-[10px] sm:text-xs opacity-75">({categoryProducts.length})</span>
                          </div>
                          {selectedCount > 0 && (
                            <span className="px-2 py-0.5 bg-white/50 rounded-full text-[10px] sm:text-xs font-medium">
                              {selectedCount} ✓
                            </span>
                          )}
                        </div>
                        
                        {/* Category Products */}
                        {isExpanded && (
                          <div className="bg-white divide-y">
                            {categoryProducts.map((product) => {
                              const itemData = createIndentItems[product.id] || { variant_id: '', quantity: 0 };
                              const imageUrl = product.image_url?.startsWith('/') 
                                ? `${process.env.REACT_APP_BACKEND_URL}${product.image_url}` 
                                : product.image_url;
                              const isHindi = i18n.language === 'hi';
                              
                              return (
                                <div key={product.id} className="p-2 sm:p-3 hover:bg-gray-50">
                                  {/* Mobile: Stack layout, Desktop: Row layout */}
                                  <div className="flex items-start gap-2 sm:gap-3">
                                    {/* Product Image */}
                                    <div className="flex-shrink-0">
                                      {product.image_url ? (
                                        <div 
                                          className="relative group cursor-pointer"
                                          onClick={() => setEnlargedImage({ url: imageUrl, name: product.name })}
                                        >
                                          <img 
                                            src={imageUrl}
                                            alt={product.name}
                                            className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-md border"
                                          />
                                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-md flex items-center justify-center transition-all">
                                            <ZoomIn size={14} className="text-white opacity-0 group-hover:opacity-100" />
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-md flex items-center justify-center">
                                          <ImageIcon size={16} className="text-gray-400" />
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Product Info + Controls */}
                                    <div className="flex-1 min-w-0">
                                      {/* Product Name */}
                                      <div className="font-medium text-sm leading-tight">
                                        {isHindi && product.name_hi ? product.name_hi : product.name}
                                      </div>
                                      {isHindi && product.name_hi && (
                                        <div className="text-[10px] text-gray-500">{product.name}</div>
                                      )}
                                      {!isHindi && product.name_hi && (
                                        <div className="text-[10px] text-gray-500">{product.name_hi}</div>
                                      )}
                                      
                                      {/* Mobile: Variant & Qty in row below name */}
                                      <div className="flex items-center gap-2 mt-2">
                                        <select
                                          value={itemData.variant_id}
                                          onChange={(e) => updateCreateIndentItem(product.id, 'variant_id', e.target.value)}
                                          className="h-8 px-2 text-xs sm:text-sm border rounded flex-1 min-w-0 max-w-[140px] sm:max-w-[160px]"
                                        >
                                          <option value="">{isHindi ? 'वेरिएंट' : 'Variant'}</option>
                                          {packagings
                                            .filter(v => !v.verticals || v.verticals.length === 0 || v.verticals.includes('retail'))
                                            .map(v => (
                                              <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <Input
                                          type="number"
                                          min="0"
                                          placeholder={isHindi ? 'मात्रा' : 'Qty'}
                                          value={itemData.quantity || ''}
                                          onChange={(e) => updateCreateIndentItem(product.id, 'quantity', parseInt(e.target.value) || 0)}
                                          className="w-16 sm:w-20 h-8 text-center text-sm"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {sortedCategoryNames.length === 0 && (
                    <div className="text-center text-gray-500 py-8 text-sm">
                      No products available. Please contact admin to add products.
                    </div>
                  )}
                </div>
              </div>
              
              {/* Footer - Fixed at bottom */}
              <div className="p-3 sm:p-4 border-t bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-2 flex-shrink-0">
                <div className="text-xs sm:text-sm text-gray-600 font-medium">
                  {Object.values(createIndentItems).filter(i => i.quantity > 0).length} items selected
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateIndentModal(false)}
                    disabled={savingIndent}
                    className="flex-1 sm:flex-none h-9 text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-[#14532D] hover:bg-[#166534] flex-1 sm:flex-none h-9 text-sm"
                    onClick={handleSubmitCreateIndent}
                    disabled={savingIndent || Object.values(createIndentItems).filter(i => i.quantity > 0).length === 0}
                  >
                    {savingIndent ? 'Saving...' : (editingIndentId ? 'Update' : 'Submit')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Details Modal - Item Level Breakdown */}
        {showPaymentModal && selectedPaymentDate && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-2 sm:p-4"
            onClick={() => setShowPaymentModal(false)}
            data-testid="payment-details-modal"
          >
            <div 
              className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-emerald-600 text-white p-3 sm:p-4 flex items-center justify-between sticky top-0 z-10">
                <div>
                  <h2 className="font-bold text-base sm:text-lg">
                    Payment Details - {new Date(selectedPaymentDate.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
                  </h2>
                  <p className="text-emerald-100 text-xs sm:text-sm">
                    {selectedPaymentDate.invoice_count} invoice(s)
                  </p>
                </div>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="text-white hover:bg-white/20 rounded-full p-1"
                  data-testid="payment-modal-close-btn"
                >
                  <X size={24} />
                </button>
              </div>
              
              {/* Summary Header - Sticky */}
              <div className="bg-gray-50 border-b border-gray-200 p-3 sm:p-4 sticky top-[52px] sm:top-[60px] z-10">
                <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-center">
                  <div className="bg-white rounded-lg p-2 border border-blue-200">
                    <p className="text-xs text-blue-600 font-medium">Gross Value</p>
                    <p className="text-sm sm:text-base font-bold text-blue-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.gross_value || 0), 0) || 0)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-red-200">
                    <p className="text-xs text-red-600 font-medium">(-) Rejection</p>
                    <p className="text-sm sm:text-base font-bold text-red-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.rejection_amount || 0), 0) || 0)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-200">
                    <p className="text-xs text-gray-600 font-medium">Net Value</p>
                    <p className="text-sm sm:text-base font-bold text-gray-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.net_value || 0), 0) || 0)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-purple-200">
                    <p className="text-xs text-purple-600 font-medium">(-) Commission</p>
                    <p className="text-sm sm:text-base font-bold text-purple-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.commission_amount || 0), 0) || 0)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-amber-300">
                    <p className="text-xs text-amber-600 font-medium">Total Payable</p>
                    <p className="text-sm sm:text-base font-bold text-amber-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.final_payable || 0), 0) || 0)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-green-300">
                    <p className="text-xs text-green-600 font-medium">Paid Amount</p>
                    <p className="text-sm sm:text-base font-bold text-green-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0) || 0)}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-emerald-400 col-span-2 sm:col-span-1">
                    <p className="text-xs text-emerald-600 font-medium">Final Due</p>
                    <p className="text-sm sm:text-base font-bold text-emerald-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.pending_amount || 0), 0) || 0)}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Scrollable Item List */}
              <div className="overflow-y-auto max-h-[calc(90vh-200px)] p-3 sm:p-4">
                {selectedPaymentDate.invoices?.map((invoice, invIdx) => (
                  <div key={invoice.invoice_id || invIdx} className="mb-4">
                    {/* Invoice Header */}
                    <div className="bg-gray-100 rounded-t-lg p-2 px-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-700">
                        Invoice: {invoice.invoice_number || 'N/A'}
                      </span>
                      {invoice.is_all_clear ? (
                        <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                          <Check size={14} /> All Clear
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600">
                          Due: <span className="font-semibold">{formatCurrency(invoice.pending_amount)}</span>
                        </span>
                      )}
                    </div>
                    
                    {/* Items Table */}
                    <div className="border border-gray-200 border-t-0 rounded-b-lg overflow-hidden">
                      {/* Table Header */}
                      <div className="grid grid-cols-12 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200">
                        <div className="col-span-1 p-2 text-center">#</div>
                        <div className="col-span-3 p-2">Product</div>
                        <div className="col-span-2 p-2 text-center">Supplied</div>
                        <div className="col-span-2 p-2 text-center text-red-600">Rejection</div>
                        <div className="col-span-2 p-2 text-center">Billable</div>
                        <div className="col-span-2 p-2 text-right">Amount</div>
                      </div>
                      
                      {/* Table Rows */}
                      {(invoice.items || []).map((item, itemIdx) => {
                        const suppliedQty = item.supplied_qty || item.quantity || 0;
                        const rejectedQty = item.rejected_qty || 0;
                        const billableQty = suppliedQty - rejectedQty;
                        const mrp = item.mrp || 0;
                        const amount = billableQty * mrp;
                        const rejectionAmount = rejectedQty * mrp;
                        
                        return (
                          <div 
                            key={itemIdx} 
                            className={`grid grid-cols-12 text-xs ${itemIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-emerald-50 transition-colors`}
                          >
                            <div className="col-span-1 p-2 text-center text-gray-500">{itemIdx + 1}</div>
                            <div className="col-span-3 p-2 font-medium text-gray-700 truncate" title={item.product_name}>
                              {getProductName(item) || item.product_name}
                              {item.variant_name && <span className="text-gray-400 ml-1 text-[10px]">({item.variant_name})</span>}
                            </div>
                            <div className="col-span-2 p-2 text-center text-gray-600">{suppliedQty}</div>
                            <div className="col-span-2 p-2 text-center">
                              {rejectedQty > 0 ? (
                                <div>
                                  <span className="text-red-600 font-medium">-{rejectedQty}</span>
                                  <span className="text-red-400 text-[10px] block">({formatCurrency(rejectionAmount)})</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </div>
                            <div className="col-span-2 p-2 text-center font-medium text-emerald-600">{billableQty}</div>
                            <div className="col-span-2 p-2 text-right font-medium text-gray-700">{formatCurrency(amount)}</div>
                          </div>
                        );
                      })}
                      
                      {/* Item Total Row */}
                      <div className="grid grid-cols-12 text-xs bg-emerald-50 font-semibold border-t border-emerald-200">
                        <div className="col-span-1 p-2"></div>
                        <div className="col-span-3 p-2 text-emerald-700">Total</div>
                        <div className="col-span-2 p-2 text-center text-gray-600">
                          {(invoice.items || []).reduce((sum, item) => sum + (item.supplied_qty || item.quantity || 0), 0)}
                        </div>
                        <div className="col-span-2 p-2 text-center text-red-600">
                          {(invoice.items || []).reduce((sum, item) => sum + (item.rejected_qty || 0), 0) > 0 && (
                            <>-{(invoice.items || []).reduce((sum, item) => sum + (item.rejected_qty || 0), 0)}</>
                          )}
                        </div>
                        <div className="col-span-2 p-2 text-center text-emerald-700">
                          {(invoice.items || []).reduce((sum, item) => {
                            const supplied = item.supplied_qty || item.quantity || 0;
                            const rejected = item.rejected_qty || 0;
                            return sum + (supplied - rejected);
                          }, 0)}
                        </div>
                        <div className="col-span-2 p-2 text-right text-emerald-700">
                          {formatCurrency((invoice.items || []).reduce((sum, item) => {
                            const supplied = item.supplied_qty || item.quantity || 0;
                            const rejected = item.rejected_qty || 0;
                            const billable = supplied - rejected;
                            return sum + (billable * (item.mrp || 0));
                          }, 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Footer with Paid Amount and Total Due */}
              <div className="bg-emerald-50 border-t border-emerald-200 p-3 sm:p-4 sticky bottom-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  {/* Left - Paid Amount with history */}
                  <div className="text-xs text-gray-600">
                    {(() => {
                      const allPayments = selectedPaymentDate.invoices?.flatMap(inv => inv.payments || []) || [];
                      const totalPaid = selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0) || 0;
                      
                      if (totalPaid > 0) {
                        return (
                          <div className="space-y-1">
                            <div className="font-medium text-green-700">
                              Paid Amount: {formatCurrency(totalPaid)}
                            </div>
                            {allPayments.length > 0 && (
                              <div className="text-gray-500 text-[10px]">
                                {allPayments.slice(0, 3).map((pmt, idx) => (
                                  <span key={idx} className="mr-2">
                                    {pmt.payment_date ? new Date(pmt.payment_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'}) : '-'}
                                    {pmt.payment_mode && ` (${pmt.payment_mode})`}: {formatCurrency(pmt.amount)}
                                  </span>
                                ))}
                                {allPayments.length > 3 && <span>+{allPayments.length - 3} more</span>}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return <span className="text-gray-400">No payments yet</span>;
                    })()}
                  </div>
                  
                  {/* Right - Total Due */}
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Total Due:</span>
                    <span className="ml-2 text-lg font-bold text-emerald-700">
                      {formatCurrency(selectedPaymentDate.invoices?.reduce((sum, inv) => sum + (inv.pending_amount || 0), 0) || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Image Enlargement Modal */}
        {enlargedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60] p-4"
            onClick={() => setEnlargedImage(null)}
          >
            <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setEnlargedImage(null)}
                className="absolute -top-10 right-0 text-white hover:text-gray-300"
              >
                <X size={28} />
              </button>
              <img 
                src={enlargedImage.url}
                alt={enlargedImage.name}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
              <p className="text-white text-center mt-3 text-lg font-medium">{enlargedImage.name}</p>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT SUMMARY MODAL ==================== */}
        {showPaymentSummaryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-green-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-green-600" />
                  <h3 className="text-sm sm:text-base font-semibold text-green-800">Payment Summary</h3>
                  {paymentSummaryData?.total_invoices > 0 && (
                    <span className="text-xs text-gray-500">
                      ({paymentSummaryData.total_invoices} invoices)
                    </span>
                  )}
                </div>
                <button onClick={() => setShowPaymentSummaryModal(false)} className="p-1 hover:bg-green-100 rounded">
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-3 sm:p-4 overflow-y-auto flex-1">
                {/* Date Range Filter */}
                <div className="flex flex-wrap items-center gap-2 mb-3 bg-gray-50 rounded-lg p-2 sm:p-3">
                  <span className="text-xs text-gray-600 font-medium">Date Range:</span>
                  <Input
                    type="date"
                    value={paymentSummaryStartDate}
                    onChange={(e) => setPaymentSummaryStartDate(e.target.value)}
                    className="w-28 sm:w-36 h-7 sm:h-8 text-xs sm:text-sm"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="date"
                    value={paymentSummaryEndDate}
                    onChange={(e) => setPaymentSummaryEndDate(e.target.value)}
                    className="w-28 sm:w-36 h-7 sm:h-8 text-xs sm:text-sm"
                  />
                  <Button
                    size="sm"
                    className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => loadPaymentSummary(paymentSummaryStartDate, paymentSummaryEndDate)}
                  >
                    Apply
                  </Button>
                </div>

                {paymentSummaryLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                  </div>
                ) : paymentSummaryData ? (
                  <>
                    {/* Full Summary Table matching Admin Panel format */}
                    <div className="bg-white rounded-lg border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] sm:text-xs min-w-[650px]">
                          <thead className="bg-gray-100 sticky top-0">
                            <tr>
                              <th className="px-1.5 py-1.5 text-center text-gray-600 font-semibold w-8">#</th>
                              <th className="px-1.5 py-1.5 text-left text-gray-600 font-semibold">Date</th>
                              <th className="px-1.5 py-1.5 text-left text-gray-600 font-semibold">Invoice #</th>
                              <th className="px-1.5 py-1.5 text-right text-gray-600 font-semibold">Gross</th>
                              <th className="px-1.5 py-1.5 text-right text-red-600 font-semibold">Reject</th>
                              <th className="px-1.5 py-1.5 text-right text-blue-600 font-semibold">MRP</th>
                              <th className="px-1.5 py-1.5 text-right text-orange-600 font-semibold">Comm.</th>
                              <th className="px-1.5 py-1.5 text-right text-green-600 font-semibold">Payable</th>
                              <th className="px-1.5 py-1.5 text-right text-purple-600 font-semibold">CR Adj</th>
                              <th className="px-1.5 py-1.5 text-right text-teal-600 font-semibold">Final</th>
                              <th className="px-1.5 py-1.5 text-right text-indigo-600 font-semibold">Paid</th>
                              <th className="px-1.5 py-1.5 text-right text-blue-800 font-bold">Net Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(paymentSummaryData.invoices || []).length > 0 ? (
                              paymentSummaryData.invoices.map((inv, idx) => (
                                <tr key={inv.id || idx} className="border-t hover:bg-gray-50">
                                  <td className="px-1.5 py-1.5 text-center text-gray-500">{inv.serial_num || idx + 1}</td>
                                  <td className="px-1.5 py-1.5 text-left text-gray-700 whitespace-nowrap">
                                    {new Date(inv.dispatch_date || inv.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: '2-digit', year: 'numeric'})}
                                  </td>
                                  <td className="px-1.5 py-1.5 text-left font-medium text-gray-800 whitespace-nowrap">{inv.invoice_number}</td>
                                  <td className="px-1.5 py-1.5 text-right text-gray-700">₹{(inv.gross_value || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right text-red-600">-₹{(inv.rejection_amount || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right text-blue-600">₹{(inv.total_mrp_value || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right text-orange-600">-₹{(inv.commission_amount || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right text-green-600">₹{(inv.net_payable || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right text-purple-600">{(inv.total_credit_adjusted || 0) > 0 ? `-₹${(inv.total_credit_adjusted || 0).toFixed(0)}` : '-'}</td>
                                  <td className="px-1.5 py-1.5 text-right text-teal-600 font-medium">₹{(inv.final_payable || inv.net_payable || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right text-indigo-600">₹{(inv.paid_amount || 0).toFixed(0)}</td>
                                  <td className="px-1.5 py-1.5 text-right font-semibold text-blue-800">₹{(inv.net_due || 0).toFixed(0)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="10" className="p-4 text-center text-gray-500">No invoices found</td>
                              </tr>
                            )}
                          </tbody>
                          {(paymentSummaryData.invoices || []).length > 0 && paymentSummaryData.totals && (
                            <tfoot className="bg-green-100 font-bold sticky bottom-0">
                              <tr>
                                <td colSpan={3} className="px-1.5 py-1.5 text-right text-green-800">TOTAL:</td>
                                <td className="px-1.5 py-1.5 text-right text-gray-800">
                                  ₹{(paymentSummaryData.totals.gross_value || 0).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-red-700">
                                  -₹{(paymentSummaryData.totals.rejection_amount || 0).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-blue-700">
                                  ₹{(paymentSummaryData.totals.total_mrp_value || 0).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-orange-700">
                                  -₹{(paymentSummaryData.totals.commission_amount || 0).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-green-700">
                                  ₹{(paymentSummaryData.totals.net_payable || 0).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-purple-700">
                                  {(paymentSummaryData.totals.total_credit_adjusted || 0) > 0 ? `-₹${(paymentSummaryData.totals.total_credit_adjusted || 0).toFixed(0)}` : '-'}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-teal-700 font-medium">
                                  ₹{((paymentSummaryData.totals.net_payable || 0) - (paymentSummaryData.totals.total_credit_adjusted || 0)).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-indigo-700">
                                  ₹{(paymentSummaryData.totals.paid_amount || 0).toFixed(0)}
                                </td>
                                <td className="px-1.5 py-1.5 text-right text-blue-800 font-bold">
                                  ₹{(paymentSummaryData.totals.net_due || 0).toLocaleString('en-IN')}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-gray-500 py-8">No data available</p>
                )}
              </div>

              {/* Footer with Net Receivable and Download CSV */}
              <div className="p-3 sm:p-4 border-t bg-gray-50 flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                  <div className="text-center sm:text-left">
                    <span className="text-xs text-gray-600">Net Receivable: </span>
                    <span className="text-lg font-bold text-blue-700">
                      ₹{(paymentSummaryData?.totals?.net_due || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowPaymentSummaryModal(false)}>
                      Back
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => {
                        // Export to CSV
                        if (!paymentSummaryData?.invoices?.length) {
                          toast.error('No data to export');
                          return;
                        }
                        const headers = ['#', 'Date', 'Invoice #', 'Gross', 'Reject', 'MRP', 'Comm.', 'Payable', 'CR Adj', 'Final', 'Paid', 'Net Due'];
                        const rows = paymentSummaryData.invoices.map(inv => [
                          inv.serial_num || '',
                          new Date(inv.dispatch_date || inv.invoice_date).toLocaleDateString('en-IN'),
                          inv.invoice_number,
                          inv.gross_value || 0,
                          -(inv.rejection_amount || 0),
                          inv.total_mrp_value || 0,
                          -(inv.commission_amount || 0),
                          inv.net_payable || 0,
                          -(inv.total_credit_adjusted || 0),
                          inv.final_payable || inv.net_payable || 0,
                          inv.paid_amount || 0,
                          inv.net_due || 0
                        ]);
                        // Add totals row
                        if (paymentSummaryData.totals) {
                          rows.push([
                            '', '', 'TOTAL',
                            paymentSummaryData.totals.gross_value || 0,
                            -(paymentSummaryData.totals.rejection_amount || 0),
                            paymentSummaryData.totals.total_mrp_value || 0,
                            -(paymentSummaryData.totals.commission_amount || 0),
                            paymentSummaryData.totals.net_payable || 0,
                            -(paymentSummaryData.totals.total_credit_adjusted || 0),
                            (paymentSummaryData.totals.net_payable || 0) - (paymentSummaryData.totals.total_credit_adjusted || 0),
                            paymentSummaryData.totals.paid_amount || 0,
                            paymentSummaryData.totals.net_due || 0
                          ]);
                        }
                        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                        const blob = new Blob([csvContent], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `payment_summary_${dashboardData?.retailer?.company_name || 'retailer'}_${paymentSummaryStartDate}_to_${paymentSummaryEndDate}.csv`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                        toast.success('CSV downloaded successfully');
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Download size={14} className="mr-1" /> Download CSV
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
