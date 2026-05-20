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
  Package, Truck, DollarSign, AlertTriangle, Plus, X, Minus,
  TrendingUp, Clock, CheckCircle, FileText, Download,
  ChevronDown, ChevronRight, Calendar, ShoppingBag, BarChart3,
  ClipboardList, Save, Trash2, RefreshCw, Pencil, Search, Check, Edit2,
  Menu, User, IndianRupee, Wallet, CreditCard, BoxesIcon, LogOut, ImageIcon, ZoomIn,
  ShoppingCart
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  const [catalogueImagesLoaded, setCatalogueImagesLoaded] = useState(false); // Track if images are loaded
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
  
  // Date filter for dashboard
  const [dashboardDateFrom, setDashboardDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });
  const [dashboardDateTo, setDashboardDateTo] = useState(getLocalDateString());
  
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, indentsRes, dispatchesRes, invoicesRes, rejectionsRes, productsRes, packagingsRes, grnsRes, paymentsRes, typesRes, payableRes, catalogueRes, mrpRes] = await Promise.all([
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
        api.get('/api/retailer-catalogue'),  // Load without images first for speed
        api.get('/api/retailer-catalogue/mrp')
      ]);
      setDashboardData(dashRes.data);
      setIndents(indentsRes.data);
      setDispatches(dispatchesRes.data);
      setInvoices(invoicesRes.data);
      setRejections(rejectionsRes.data);
      setProducts(productsRes.data);
      setPackagings(packagingsRes.data);
      setPayments(paymentsRes.data || []);
      setProductTypes(typesRes.data || []);
      setImmediatelyPayable(payableRes.data || null);
      // Filter catalogue to only show items with show_on_portal: true
      setCatalogue((catalogueRes.data || []).filter(item => item.show_on_portal !== false));
      // Set MRP data
      setMrpData(mrpRes.data?.mrp_data || {});
      
      // Build a map of dispatch_id -> GRN confirmed status
      const grnMap = {};
      (grnsRes.data || []).forEach(grn => {
        grnMap[grn.dispatch_id] = true;
      });
      setConfirmedGrns(grnMap);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

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

  // Lazy load catalogue images when user goes to placeorder tab
  useEffect(() => {
    const loadCatalogueImages = async () => {
      if (activeTab === 'placeorder' && !catalogueImagesLoaded && catalogue.length > 0) {
        try {
          const res = await api.get('/api/retailer-catalogue?include_images=true');
          const catalogueWithImages = (res.data || []).filter(item => item.show_on_portal !== false);
          setCatalogue(catalogueWithImages);
          setCatalogueImagesLoaded(true);
        } catch (error) {
          console.error('Failed to load catalogue images:', error);
        }
      }
    };
    loadCatalogueImages();
  }, [activeTab, catalogueImagesLoaded, catalogue.length]);

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

  // Toggle catalogue category expansion
  const toggleCatalogueCategory = (category) => {
    setExpandedCatalogueCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Get variant name from ID
  const getVariantName = (variantId) => {
    const variant = packagings.find(v => v.id === variantId);
    return variant ? variant.name : variantId;
  };

  // Add item to cart
  const addToCart = (catalogueItem, variantId, variantName) => {
    const key = `${catalogueItem.product_id}_${variantId}`;
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

  const toggleInvoiceExpand = (id) => {
    setExpandedInvoices(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const downloadInvoicePdf = (invoice) => {
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
              // Get translated product name for PDF
              const productMatch = products.find(p => p.id === item.product_id);
              const displayName = (i18n.language === 'hi' && productMatch?.name_hi) ? productMatch.name_hi : (item.product_name || productMatch?.name || '');
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td class="text-left">${displayName}${item.variant_name ? ' (' + item.variant_name + ')' : ''}</td>
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
            <span>Amount Payable by You:</span>
            <span>₹${invoice.net_payable.toFixed(2)}</span>
          </div>
        </div>
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
      const res = await api.get(`/api/retailer-closing-inventory/summary/${dashboardData.retailer.id}?date=${date}`);
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
              onClick={() => setSideMenuOpen(true)}
              className="p-2"
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
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-emerald-100 rounded-xl">
                      <DollarSign size={36} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-emerald-600 font-semibold uppercase tracking-wide">{t('retailer.yourEarnings') || 'Your Earnings'}</p>
                      {(() => {
                        const filteredDispatches = dispatches.filter(d => {
                          const dispDate = d.dispatch_date?.split('T')[0];
                          return dispDate >= dashboardDateFrom && dispDate <= dashboardDateTo;
                        });
                        const filteredRejections = rejections.filter(r => {
                          const rejDate = r.rejection_date?.split('T')[0];
                          return rejDate >= dashboardDateFrom && rejDate <= dashboardDateTo;
                        });
                        const retailerCommPct = dashboardData?.retailer?.commission_percentage || 0;
                        const grossMrpValue = filteredDispatches.reduce((sum, d) => {
                          if (d.total_mrp_value && d.total_mrp_value > 0) return sum + d.total_mrp_value;
                          return sum + (d.items?.reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0) || 0);
                        }, 0);
                        const totalRejectionValue = filteredRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
                        const netMrpValue = grossMrpValue - totalRejectionValue;
                        const totalCommission = netMrpValue * retailerCommPct / 100;
                        return (
                          <p className="text-4xl md:text-5xl font-bold text-emerald-700">{formatCurrency(totalCommission)}</p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white/70 p-3 rounded-xl border border-emerald-200">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-emerald-600" />
                      <span className="text-sm font-medium text-gray-600">{t('retailer.period') || 'Period'}:</span>
                    </div>
                    <div className="flex items-center gap-2">
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
              </CardContent>
            </Card>

            {/* Immediately Payable - Red Card */}
            {immediatelyPayable && immediatelyPayable.totals.grand_total > 0 && (
              <Card className="mb-6 border-red-300 bg-gradient-to-br from-red-50 via-white to-red-50 shadow-lg">
                <CardContent className="p-4 md:p-6">
                  <div className="flex flex-col gap-4">
                    {/* Header - Stack on mobile, row on desktop */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 md:p-4 bg-red-100 rounded-xl shrink-0">
                          <AlertTriangle size={28} className="text-red-600 md:w-9 md:h-9" />
                        </div>
                        <div>
                          <p className="text-xs md:text-sm text-red-600 font-semibold uppercase tracking-wide">
                            Immediately Payable
                          </p>
                          <p className="text-3xl md:text-4xl lg:text-5xl font-bold text-red-700">
                            {formatCurrency(immediatelyPayable.totals.grand_total)}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Date-wise breakdown - Stack on mobile, 3 cols on desktop */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                      {/* Today's 50% Upfront + Pending 50% from Recent Days */}
                      <div className="bg-white rounded-lg border border-green-200 p-3">
                        <div className="flex justify-between items-start sm:block">
                          <p className="text-xs text-green-600 font-medium mb-1">50% Upfront</p>
                          <p className="text-lg sm:text-xl font-bold text-green-600">
                            {formatCurrency((immediatelyPayable.totals.today_50_percent_total || 0) + (immediatelyPayable.totals.pending_50_percent_recent_total || 0))}
                          </p>
                        </div>
                        <div className="mt-2 space-y-1">
                          {/* Today's 50% */}
                          {immediatelyPayable.today_50_percent && immediatelyPayable.today_50_percent.length > 0 ? (
                            immediatelyPayable.today_50_percent.map((item, idx) => (
                              <div key={`today-${idx}`} className="text-xs text-gray-600 flex justify-between">
                                <span>Today</span>
                                <span className="font-medium">{formatCurrency(item.due_amount)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-gray-400">No deliveries today</div>
                          )}
                          
                          {/* Pending 50% from recent days (1-4 days ago) */}
                          {immediatelyPayable.pending_50_percent_recent && immediatelyPayable.pending_50_percent_recent.length > 0 && (
                            <>
                              <div className="border-t border-gray-100 my-1 pt-1">
                                <p className="text-xs text-orange-500 font-medium">Pending from earlier:</p>
                              </div>
                              {immediatelyPayable.pending_50_percent_recent.map((item, idx) => (
                                <div key={`recent-${idx}`} className="text-xs text-gray-600 flex justify-between">
                                  <span>{new Date(item.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}</span>
                                  <span className="font-medium text-orange-600">{formatCurrency(item.due_amount)}</span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* 5 Days Due (Remaining 50%) */}
                      <div className="bg-white rounded-lg border border-orange-200 p-3">
                        <div className="flex justify-between items-start sm:block">
                          <p className="text-xs text-orange-500 font-medium mb-1">5-Day Credit Due</p>
                          <p className="text-lg sm:text-xl font-bold text-orange-600">
                            {formatCurrency(immediatelyPayable.totals.due_today_remaining_total || 0)}
                          </p>
                        </div>
                        {immediatelyPayable.due_today_remaining && immediatelyPayable.due_today_remaining.length > 0 ? (
                          <div className="mt-2 space-y-1 hidden sm:block">
                            {immediatelyPayable.due_today_remaining.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="text-xs text-gray-600 flex justify-between">
                                <span>{new Date(item.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})}</span>
                                <span className="font-medium">{formatCurrency(item.due_amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-1 hidden sm:block">No credit dues today</p>
                        )}
                      </div>
                      
                      {/* Overdue */}
                      <div className="bg-white rounded-lg border border-red-300 p-3">
                        <div className="flex justify-between items-start sm:block">
                          <p className="text-xs text-red-600 font-medium mb-1">⚠️ Overdue</p>
                          <p className="text-lg sm:text-xl font-bold text-red-700">
                            {formatCurrency(immediatelyPayable.totals.overdue_total || 0)}
                          </p>
                        </div>
                        {immediatelyPayable.overdue && immediatelyPayable.overdue.length > 0 ? (
                          <div className="mt-2 space-y-1 hidden sm:block">
                            {immediatelyPayable.overdue.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="text-xs text-gray-600 flex justify-between">
                                <span>{new Date(item.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})} ({item.overdue_days}d)</span>
                                <span className="font-medium text-red-600">{formatCurrency(item.due_amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-1 hidden sm:block">No overdue</p>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 text-center sm:text-right">
                      For details, check the Invoices tab
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 6 Metric Boxes */}
            {(() => {
              const filteredDispatches = dispatches.filter(d => {
                const dispDate = d.dispatch_date?.split('T')[0];
                return dispDate >= dashboardDateFrom && dispDate <= dashboardDateTo;
              });
              const filteredRejections = rejections.filter(r => {
                const rejDate = r.rejection_date?.split('T')[0];
                return rejDate >= dashboardDateFrom && rejDate <= dashboardDateTo;
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
                return payDate >= dashboardDateFrom && payDate <= dashboardDateTo;
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
                          {indent.items?.map((item, idx) => (
                            <div key={idx} className="text-xs">
                              {getProductName(item)} {item.variant_name && `(${item.variant_name})`} x {item.quantity}
                            </div>
                          ))}
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
            ) : catalogue.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No products available. Please contact admin.
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
                            // Construct proper image URL
                            const productImageUrl = item.image_url?.startsWith('/') 
                              ? `${process.env.REACT_APP_BACKEND_URL}${item.image_url}` 
                              : item.image_url;
                            
                            return (
                            <div key={item.product_id} className="p-3 hover:bg-gray-50">
                              <div className="flex items-center gap-3">
                                {/* Product Image - Clickable to enlarge */}
                                <div 
                                  className={`w-12 h-12 flex-shrink-0 ${productImageUrl ? 'cursor-pointer' : ''}`}
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
                                >
                                  {productImageUrl ? (
                                    <img
                                      src={productImageUrl}
                                      alt={item.product_name}
                                      className="w-12 h-12 object-cover rounded border hover:opacity-80 transition-opacity"
                                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                    />
                                  ) : null}
                                  <div className={`w-12 h-12 bg-gray-100 rounded border items-center justify-center ${productImageUrl ? 'hidden' : 'flex'}`}>
                                    <ImageIcon size={16} className="text-gray-400" />
                                  </div>
                                </div>

                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-800 truncate">
                                    {catalogueLanguage === 'hi' && item.product_name_hi 
                                      ? item.product_name_hi 
                                      : catalogueLanguage === 'mr' && item.product_name_mr 
                                        ? item.product_name_mr 
                                        : item.product_name}
                                  </p>
                                  
                                  {/* Variants as buttons */}
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {(item.variants || []).map(variantId => {
                                      const variantName = getVariantName(variantId);
                                      const cartItem = getCartItem(item.product_id, variantId);
                                      const mrp = getMrp(item.product_id, variantId);
                                      const totalValue = cartItem ? mrp * cartItem.quantity : 0;
                                      
                                      return (
                                        <div key={variantId} className="flex items-center gap-2">
                                          {cartItem ? (
                                            // Quantity controls with MRP
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
                                                <span className="text-sm font-bold text-green-700">
                                                  ₹{totalValue.toFixed(0)}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            // Add button with MRP - More prominent display
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
                                    })}
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
                    const cartImageUrl = item.image_url?.startsWith('/') 
                      ? `${process.env.REACT_APP_BACKEND_URL}${item.image_url}` 
                      : item.image_url;
                    
                    // Get MRP for this item
                    const mrp = getMrp(item.product_id, item.variant_id);
                    const itemTotal = mrp * item.quantity;
                    
                    return (
                    <div key={key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {/* Product Image */}
                      <div className="w-12 h-12 flex-shrink-0">
                        {cartImageUrl ? (
                          <img
                            src={cartImageUrl}
                            alt={item.product_name}
                            className="w-12 h-12 object-cover rounded"
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />
                        ) : null}
                        <div className={`w-12 h-12 bg-gray-200 rounded items-center justify-center ${cartImageUrl ? 'hidden' : 'flex'}`}>
                          <Package size={16} className="text-gray-400" />
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {catalogueLanguage === 'hi' && item.product_name_hi 
                            ? item.product_name_hi 
                            : catalogueLanguage === 'mr' && item.product_name_mr 
                              ? item.product_name_mr 
                              : item.product_name}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500">{item.variant_name}</p>
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
                  {indents.filter(i => i.status === 'pending' || i.status === 'partial').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 text-[10px] sm:text-xs rounded-full">
                      {indents.filter(i => i.status === 'pending' || i.status === 'partial').length}
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
                    // Group pending indents by date
                    const pendingIndents = indents.filter(i => i.status === 'pending' || i.status === 'partial');
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
                                                {indent.items?.map((item, idx) => (
                                                  <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-2 rounded border">
                                                    <div className="flex items-center gap-2">
                                                      <span className="text-gray-400 text-xs w-5">{idx + 1}.</span>
                                                      <span className="font-medium">{getProductName(item)}</span>
                                                      {item.variant_name && item.variant_name !== 'Kg' && (
                                                        <span className="text-orange-600 text-xs bg-orange-50 px-1.5 py-0.5 rounded">{item.variant_name}</span>
                                                      )}
                                                    </div>
                                                    <span className="text-gray-600 font-semibold">×{item.quantity}</span>
                                                  </div>
                                                ))}
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
                                              <td className="p-2 text-gray-600">{item.variant_name || '-'}</td>
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
                          <th className="p-3 text-left font-medium text-gray-500">INVOICE #</th>
                          <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                          <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                          <th className="p-3 text-right font-medium text-gray-500">GROSS VALUE</th>
                          <th className="p-3 text-right font-medium text-red-500">REJECTION</th>
                          <th className="p-3 text-right font-medium text-green-600">COMMISSION</th>
                          <th className="p-3 text-right font-medium text-blue-600">PAID AMOUNT</th>
                          <th className="p-3 text-right font-medium text-gray-500">NET PAYABLE</th>
                          <th className="p-3 text-center font-medium text-gray-500">PDF</th>
                          <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.length === 0 ? (
                          <tr><td colSpan={11} className="p-8 text-center text-gray-400">No invoices found</td></tr>
                        ) : invoices.map(invoice => {
                          const grossValue = invoice.items?.reduce((sum, i) => sum + ((i.supplied_qty || i.quantity || 0) * (i.mrp || 0)), 0) || 0;
                          const rejectionValue = invoice.items?.reduce((sum, i) => sum + ((i.rejected_qty || 0) * (i.mrp || 0)), 0) || 0;
                          const netValue = grossValue - rejectionValue;
                          const commissionAmt = invoice.commission_amount || (netValue * (invoice.commission_percentage || 0) / 100);
                          const payableAmt = netValue - commissionAmt;
                          const isPaid = invoice.status === 'paid' || invoice.status === 'closed';
                          const isPartial = invoice.status === 'partial';
                          
                          // Get paid amount from invoice or payments
                          const paidAmount = invoice.paid_amount || 0;
                          const remainingPayable = payableAmt - paidAmount;
                          
                          // Get payment details for this invoice
                          const invoicePayments = payments.filter(p => p.invoice_id === invoice.id);
                          
                          return (
                            <React.Fragment key={invoice.id}>
                              <tr className={`border-b hover:bg-gray-50 cursor-pointer ${isPaid ? 'bg-green-50/30' : ''}`} onClick={() => toggleInvoiceExpand(invoice.id)}>
                                <td className="p-3">
                                  {expandedInvoices[invoice.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </td>
                                <td className="p-3 font-medium text-blue-600">{invoice.invoice_number}</td>
                                <td className="p-3">{formatDate(invoice.invoice_date)}</td>
                                <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                                <td className="p-3 text-right">{formatCurrency(grossValue)}</td>
                                <td className="p-3 text-right text-red-600">
                                  {rejectionValue > 0 ? `-${formatCurrency(rejectionValue)}` : '-'}
                                </td>
                                <td className="p-3 text-right text-green-600">
                                  {formatCurrency(commissionAmt)} ({invoice.commission_percentage || 0}%)
                                </td>
                                <td className="p-3 text-right text-blue-600 font-medium">
                                  {paidAmount > 0 ? formatCurrency(paidAmount) : '-'}
                                </td>
                                <td className="p-3 text-right font-bold">
                                  {isPaid ? (
                                    <span className="text-green-700">{formatCurrency(payableAmt)}</span>
                                  ) : (
                                    <span className={remainingPayable > 0 ? 'text-orange-600' : 'text-gray-800'}>
                                      {formatCurrency(remainingPayable > 0 ? remainingPayable : payableAmt)}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                                  {isPaid ? (
                                    <Button size="sm" variant="ghost" onClick={() => downloadInvoicePdf(invoice)}>
                                      <Download size={14} className="text-blue-600" />
                                    </Button>
                                  ) : (
                                    <span className="text-gray-300" title="PDF available after full payment">
                                      <Download size={14} />
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {isPaid ? (
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
                                  <td colSpan={11} className="p-3">
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
                                                <td className="p-2 text-gray-600">{item.variant_name || '-'}</td>
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
                                        </tbody>
                                      </table>
                                      
                                      {/* Payment Details Section - Made more prominent */}
                                      {(invoicePayments.length > 0 || isPaid) && (
                                        <div className="border-t-2 border-green-200 bg-green-50 p-4 mt-2">
                                          <div className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                                            <CheckCircle size={16} className="text-green-600" />
                                            Payment Details
                                          </div>
                                          {invoicePayments.length > 0 ? (
                                            <div className="space-y-2">
                                              {invoicePayments.map((payment, pIdx) => (
                                                <div key={pIdx} className="flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-green-200 shadow-sm">
                                                  <div className="flex items-center gap-4">
                                                    <span className="text-sm font-medium text-gray-600 bg-green-100 px-2 py-1 rounded">#{pIdx + 1}</span>
                                                    <span className="text-lg font-bold text-green-700">{formatCurrency(payment.amount)}</span>
                                                    {payment.payment_mode && (
                                                      <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">via {payment.payment_mode}</span>
                                                    )}
                                                  </div>
                                                  <div className="text-sm text-gray-600">
                                                    {payment.payment_date ? (
                                                      <>
                                                        <span className="font-medium">Paid on {formatDate(payment.payment_date)}</span>
                                                        {payment.created_at && (
                                                          <span className="ml-2 text-gray-500">
                                                            at {new Date(payment.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                          </span>
                                                        )}
                                                      </>
                                                    ) : payment.created_at ? (
                                                      <>
                                                        <span className="font-medium">Recorded on {new Date(payment.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                        <span className="ml-2 text-gray-500">
                                                          at {new Date(payment.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                      </>
                                                    ) : null}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : isPaid && (
                                            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg border border-green-200">
                                              <CheckCircle size={20} className="text-green-600" />
                                              <span className="text-base font-medium text-green-700">
                                                Payment completed - {formatCurrency(payableAmt)}
                                              </span>
                                              {invoice.payment_date && (
                                                <span className="text-sm text-gray-500">
                                                  on {formatDate(invoice.payment_date)}
                                                </span>
                                              )}
                                            </div>
                                          )}
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
            <CardHeader className="py-3">
              <CardTitle className="text-sm">My Rejections (Read-Only)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500 w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE / PRODUCT</th>
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
                              <div className="text-xs text-gray-400">{item.variant_name || item.unit || 'Kg'}</div>
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
                              'Variant': item.variant_name || 'Kg',
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
                                  {item.variant_name && item.variant_name !== 'Kg' && (
                                    <div className="text-[10px] text-gray-500">{item.variant_name}</div>
                                  )}
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
      </div>
    </Layout>
  );
}
