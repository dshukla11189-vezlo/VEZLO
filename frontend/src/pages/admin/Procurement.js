import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Trash2, UserPlus, DollarSign, Edit, Filter, Save, BookmarkPlus, IndianRupee, CheckSquare, Square, Phone, X, FileSpreadsheet, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import AutocompleteInput from '../../components/AutocompleteInput';
import { Checkbox } from '../../components/ui/checkbox';

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

const UNIT_TYPES = [
  { value: 'Kg', label: 'Kg (Kilogram)' },
  { value: 'Bunch', label: 'Bunch' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Pack', label: 'Pack' }
];

// Default fallback units (used until API data loads)
const DEFAULT_UNITS = UNIT_TYPES;

export default function Procurement() {
  const { t, i18n } = useTranslation();
  
  const [procurements, setProcurements] = useState([]);
  const [filteredProcurements, setFilteredProcurements] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [products, setProducts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openProcurement, setOpenProcurement] = useState(false);
  const [openFarmer, setOpenFarmer] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [openTemplate, setOpenTemplate] = useState(false);
  const [selectedProcurement, setSelectedProcurement] = useState(null);
  const [editMode, setEditMode] = useState(false);
  
  // Units state - fetched from API
  const [units, setUnits] = useState([]);
  
  // Computed unit options for dropdowns
  const unitOptions = useMemo(() => {
    if (units.length > 0) {
      return units.map(u => ({ value: u.name, label: `${u.name} (${u.symbol})` }));
    }
    return DEFAULT_UNITS;
  }, [units]);

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
  
  // Filters - default to today's date
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState({
    fromDate: today,
    toDate: today,
    farmerName: '',
    productName: ''
  });

  // Procurement form - farmer info is now stored per product
  const [procurementForm, setProcurementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    products: [{ 
      farmer_id: '', 
      farmer_name: '', 
      product_id: '', 
      product_name: '', 
      quantity: '', 
      unit: 'Kg', 
      unit_size: '', 
      rate: '', 
      total: 0,
      paid: ''
    }],
    total_amount: 0,
    paid_amount: 0,
    pending_amount: 0,
    payment_status: 'pending',
    remark: ''
  });

  // Payment form
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    payment_mode: 'cash',
    reference: ''
  });

  // Farmer form
  const [farmerForm, setFarmerForm] = useState({
    name: '',
    contact: '',
    address: '',
    bank_account_number: '',
    ifsc_code: '',
    bank_name: '',
    branch_name: '',
    upi_id: '',
    materials_supplied: ''
  });

  // Pending payments state
  const [pendingFilters, setPendingFilters] = useState({
    fromDate: '',
    toDate: '',
    farmerName: ''
  });
  const [selectedFarmersForPayment, setSelectedFarmersForPayment] = useState([]);
  const [openBulkPayment, setOpenBulkPayment] = useState(false);
  const [bulkPaymentForm, setBulkPaymentForm] = useState({
    payment_mode: 'cash',
    reference: ''
  });
  
  // Previous day procurements for auto-populate
  const [previousDayProcurements, setPreviousDayProcurements] = useState([]);
  const [showPreviousDayItems, setShowPreviousDayItems] = useState(true);
  const [yesterdayItems, setYesterdayItems] = useState([]);  // Selected/edited items from yesterday
  const [referenceDateForPurchase, setReferenceDateForPurchase] = useState(new Date().toISOString().split('T')[0]);  // Date for which to record purchases
  const [yesterdaySearchTerm, setYesterdaySearchTerm] = useState(''); // Search for yesterday's items

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  const loadData = async () => {
    try {
      const [procRes, farmRes, prodRes, unitsRes] = await Promise.all([
        api.get('/api/procurement'),
        api.get('/api/farmers'),
        api.get('/api/products'),
        api.get('/api/units')
      ]);
      setProcurements(procRes.data);
      setFilteredProcurements(procRes.data);
      setFarmers(farmRes.data);
      setProducts(prodRes.data);
      setUnits(unitsRes.data || []);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/api/procurement-templates');
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadPreviousDayProcurements = async (referenceDate = null) => {
    try {
      const dateToUse = referenceDate || referenceDateForPurchase;
      const response = await api.get(`/api/procurement/previous-day?reference_date=${dateToUse}`);
      setPreviousDayProcurements(response.data || []);
    } catch (error) {
      console.error('Error loading previous day procurements:', error);
    }
  };

  const handleOpenProcurementForm = async () => {
    await loadPreviousDayProcurements(referenceDateForPurchase);
    setShowPreviousDayItems(true);
    setOpenProcurement(true);
  };
  
  // Handle reference date change for purchase template
  const handleReferenceDateChange = async (newDate) => {
    setReferenceDateForPurchase(newDate);
    setYesterdayItems([]);  // Clear selected items when date changes
    await loadPreviousDayProcurements(newDate);
  };

  // Filter procurements
  useEffect(() => {
    let filtered = [...procurements];

    if (filters.fromDate) {
      filtered = filtered.filter(p => new Date(p.date) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      filtered = filtered.filter(p => new Date(p.date) <= new Date(filters.toDate));
    }

    if (filters.farmerName) {
      filtered = filtered.filter(p => 
        p.farmer_name.toLowerCase().includes(filters.farmerName.toLowerCase())
      );
    }

    if (filters.productName) {
      filtered = filtered.filter(p =>
        p.products.some(prod => 
          prod.product_name.toLowerCase().includes(filters.productName.toLowerCase())
        )
      );
    }

    setFilteredProcurements(filtered);
  }, [filters, procurements]);

  const clearFilters = () => {
    setFilters({
      fromDate: '',
      toDate: '',
      farmerName: '',
      productName: ''
    });
  };

  const handleAddProductRow = () => {
    // Create a fresh new empty row with farmer info per product
    const newEmptyRow = { 
      farmer_id: '', 
      farmer_name: '', 
      product_id: '', 
      product_name: '', 
      quantity: '', 
      unit: 'Kg', 
      unit_size: '', 
      rate: '', 
      total: 0,
      paid: ''
    };
    
    setProcurementForm(prev => ({
      ...prev,
      // Add new product at the TOP (beginning of array)
      products: [newEmptyRow, ...prev.products]
    }));
  };

  // Add selected yesterday items to the manual form
  const addYesterdayItemsToForm = () => {
    const selectedItems = yesterdayItems.filter(i => i.selected);
    if (selectedItems.length === 0) {
      toast.error('Please select at least one item from previous day');
      return;
    }
    
    // Convert selected items to procurement form products - each product has its own farmer
    const newProducts = selectedItems.map(item => {
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      return {
        farmer_id: item.farmer_id || '',
        farmer_name: item.farmer_name || '',
        product_id: item.product_id || '',
        product_name: item.product_name || '',
        quantity: qty,
        unit: item.unit || 'Kg',
        unit_size: item.unit_size || '',
        rate: rate,
        total: qty * rate,
        paid: ''
      };
    });
    
    // Filter out empty rows from existing products
    const existingValidProducts = procurementForm.products
      .filter(p => p.product_id)
      .map(p => ({
        farmer_id: p.farmer_id || '',
        farmer_name: p.farmer_name || '',
        product_id: p.product_id || '',
        product_name: p.product_name || '',
        quantity: parseFloat(p.quantity) || 0,
        unit: p.unit || 'Kg',
        unit_size: p.unit_size || '',
        rate: parseFloat(p.rate) || 0,
        total: p.total || 0,
        paid: p.paid || ''
      }));
    
    // Combine: new products from yesterday + existing valid products
    const combinedProducts = [...newProducts, ...existingValidProducts];
    
    // If no products after combining, add empty row
    const finalProducts = combinedProducts.length > 0 
      ? combinedProducts 
      : [{ farmer_id: '', farmer_name: '', product_id: '', product_name: '', quantity: '', unit: 'Kg', unit_size: '', rate: '', total: 0, paid: '' }];
    
    const grandTotal = finalProducts.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalPaid = finalProducts.reduce((sum, p) => sum + (parseFloat(p.paid) || 0), 0);
    
    setProcurementForm({
      ...procurementForm,
      products: finalProducts,
      total_amount: grandTotal,
      paid_amount: totalPaid,
      pending_amount: grandTotal - totalPaid
    });
    
    // Clear yesterday items selection
    setYesterdayItems(yesterdayItems.map(i => ({ ...i, selected: false })));
    
    toast.success(`Added ${selectedItems.length} item(s) to the form. You can add more items or save.`);
  };

  const handleRemoveProductRow = (index) => {
    const newProducts = procurementForm.products.filter((_, i) => i !== index);
    const newTotal = newProducts.reduce((sum, p) => sum + p.total, 0);
    const pendingAmount = newTotal - procurementForm.paid_amount;
    setProcurementForm({
      ...procurementForm,
      products: newProducts,
      total_amount: newTotal,
      pending_amount: pendingAmount
    });
  };

  const handleProductChange = (index, field, value) => {
    const newProducts = [...procurementForm.products];
    
    if (field === 'product_id') {
      const selectedProduct = products.find(p => p.id === value);
      if (selectedProduct) {
        newProducts[index] = {
          ...newProducts[index],
          product_id: value,
          product_name: selectedProduct.name,
          unit: selectedProduct.unit || 'Kg',
          // Only set rate if not already set by user
          rate: newProducts[index].rate || selectedProduct.price_per_kg || ''
        };
      }
    } else if (field === 'unit') {
      newProducts[index][field] = value;
      // Reset unit_size if not Bunch
      if (value !== 'Bunch') {
        newProducts[index].unit_size = '';
      }
    } else if (field === 'quantity') {
      // Handle empty string for quantity
      newProducts[index][field] = value === '' ? '' : (parseFloat(value) || 0);
    } else if (field === 'rate') {
      // Handle empty string for rate - keep as string to preserve user input
      newProducts[index][field] = value === '' ? '' : (parseFloat(value) || 0);
    } else {
      newProducts[index][field] = value;
    }
    
    // Calculate row total (handle empty values)
    const qty = parseFloat(newProducts[index].quantity) || 0;
    const rate = parseFloat(newProducts[index].rate) || 0;
    newProducts[index].total = qty * rate;
    
    // Calculate grand total and pending amount
    const grandTotal = newProducts.reduce((sum, p) => sum + (p.total || 0), 0);
    const pendingAmount = grandTotal - (procurementForm.paid_amount || 0);
    
    setProcurementForm({
      ...procurementForm,
      products: newProducts,
      total_amount: grandTotal,
      pending_amount: pendingAmount
    });
  };

  const handlePaidAmountChange = (value) => {
    const paidAmount = parseFloat(value) || 0;
    const pendingAmount = procurementForm.total_amount - paidAmount;
    const paymentStatus = paidAmount === 0 ? 'pending' : paidAmount >= procurementForm.total_amount ? 'paid' : 'partial';
    
    setProcurementForm({
      ...procurementForm,
      paid_amount: paidAmount,
      pending_amount: pendingAmount,
      payment_status: paymentStatus
    });
  };

  const handleFarmerSelect = (index, farmer) => {
    const newProducts = [...procurementForm.products];
    newProducts[index] = {
      ...newProducts[index],
      farmer_id: farmer.id,
      farmer_name: farmer.name
    };
    
    setProcurementForm({
      ...procurementForm,
      products: newProducts
    });
  };

  const handleProductSelect = (index, product) => {
    const newProducts = [...procurementForm.products];
    const existingRate = newProducts[index].rate;
    
    newProducts[index] = {
      ...newProducts[index],
      product_id: product.id,
      product_name: product.name,
      unit: product.unit || 'Kg',
      // Only set rate from product if user hasn't entered one
      rate: existingRate !== '' && existingRate !== 0 ? existingRate : (product.price_per_kg || '')
    };
    
    // Calculate row total
    const qty = parseFloat(newProducts[index].quantity) || 0;
    const rate = parseFloat(newProducts[index].rate) || 0;
    newProducts[index].total = qty * rate;
    
    // Calculate grand total
    const grandTotal = newProducts.reduce((sum, p) => sum + (p.total || 0), 0);
    const pendingAmount = grandTotal - (procurementForm.paid_amount || 0);
    
    setProcurementForm({
      ...procurementForm,
      products: newProducts,
      total_amount: grandTotal,
      pending_amount: pendingAmount
    });
  };

  const handleSubmitProcurement = async (e) => {
    e.preventDefault();
    
    // Filter valid products
    const validProducts = procurementForm.products.filter(p => p.product_id);
    
    if (validProducts.length === 0) {
      toast.error('Please add at least one product');
      return;
    }
    
    // Check all products have farmers
    const productsWithoutFarmer = validProducts.filter(p => !p.farmer_id);
    if (productsWithoutFarmer.length > 0) {
      toast.error('Please select a farmer for all products');
      return;
    }
    
    // Validate bunches have unit_size
    const invalidBunches = validProducts.filter(p => p.unit === 'Bunch' && !p.unit_size);
    if (invalidBunches.length > 0) {
      toast.error('Please specify bunch size for all bunch items');
      return;
    }
    
    try {
      // Group products by farmer
      const byFarmer = {};
      validProducts.forEach(product => {
        const farmerId = product.farmer_id;
        if (!byFarmer[farmerId]) {
          byFarmer[farmerId] = {
            farmer_id: product.farmer_id,
            farmer_name: product.farmer_name,
            products: []
          };
        }
        byFarmer[farmerId].products.push({
          product_id: product.product_id,
          product_name: product.product_name,
          quantity: parseFloat(product.quantity) || 0,
          unit: product.unit,
          unit_size: product.unit_size,
          rate: parseFloat(product.rate) || 0,
          total: product.total || 0,
          paid: parseFloat(product.paid) || 0
        });
      });
      
      const farmerIds = Object.keys(byFarmer);
      
      if (editMode && selectedProcurement?.id) {
        // For edit mode, use the first (or only) farmer - keep simple for edits
        const firstFarmer = byFarmer[farmerIds[0]];
        const payload = {
          date: new Date(procurementForm.date).toISOString(),
          farmer_id: firstFarmer.farmer_id,
          farmer_name: firstFarmer.farmer_name,
          products: validProducts.map(p => ({
            product_id: p.product_id,
            product_name: p.product_name,
            quantity: parseFloat(p.quantity) || 0,
            unit: p.unit,
            unit_size: p.unit_size,
            rate: parseFloat(p.rate) || 0,
            total: p.total || 0,
            paid: parseFloat(p.paid) || 0,
            farmer_id: p.farmer_id,
            farmer_name: p.farmer_name
          })),
          total_amount: procurementForm.total_amount,
          paid_amount: procurementForm.paid_amount,
          pending_amount: procurementForm.pending_amount,
          payment_status: procurementForm.payment_status,
          status: 'completed',
          remark: procurementForm.remark || ''
        };
        
        await api.put(`/api/procurement/${selectedProcurement.id}`, payload);
        toast.success('Procurement updated successfully!');
      } else {
        // For new procurements, create separate entries for each farmer
        for (const farmerId of farmerIds) {
          const farmerData = byFarmer[farmerId];
          const farmerTotal = farmerData.products.reduce((sum, p) => sum + (p.total || 0), 0);
          const farmerPaid = farmerData.products.reduce((sum, p) => sum + (p.paid || 0), 0);
          const farmerPending = farmerTotal - farmerPaid;
          
          const payload = {
            date: new Date(procurementForm.date).toISOString(),
            farmer_id: farmerData.farmer_id,
            farmer_name: farmerData.farmer_name,
            products: farmerData.products,
            total_amount: farmerTotal,
            paid_amount: farmerPaid,
            pending_amount: farmerPending,
            payment_status: farmerPaid === 0 ? 'pending' : farmerPaid >= farmerTotal ? 'paid' : 'partial',
            status: 'completed',
            remark: procurementForm.remark || ''
          };
          
          await api.post('/api/procurement', payload);
          
          // Record payment if made
          if (farmerPaid > 0) {
            await api.post('/api/payments', {
              date: new Date().toISOString(),
              party_type: 'farmer',
              party_id: farmerData.farmer_id,
              party_name: farmerData.farmer_name,
              amount: farmerPaid,
              payment_mode: 'cash',
              reference: `Procurement payment - ${new Date().toLocaleDateString()}`
            });
          }
        }
        
        const message = farmerIds.length > 1 
          ? `Created ${farmerIds.length} procurements for different farmers. Inventory updated.`
          : 'Procurement recorded successfully! Inventory updated.';
        toast.success(message);
      }
      
      setOpenProcurement(false);
      setEditMode(false);
      setSelectedProcurement(null);
      setProcurementForm({
        date: new Date().toISOString().split('T')[0],
        products: [{ farmer_id: '', farmer_name: '', product_id: '', product_name: '', quantity: '', unit: 'Kg', unit_size: '', rate: '', total: 0, paid: '' }],
        total_amount: 0,
        paid_amount: 0,
        pending_amount: 0,
        payment_status: 'pending',
        remark: ''
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record procurement');
    }
  };

  const handleSubmitFarmer = async (e) => {
    e.preventDefault();
    try {
      if (selectedProcurement?.isFarmerEdit) {
        // Edit mode
        await api.put(`/api/farmers/${selectedProcurement.id}`, farmerForm);
        toast.success('Farmer updated successfully');
      } else {
        // Create mode
        await api.post('/api/farmers', farmerForm);
        toast.success('Farmer added successfully');
      }
      setOpenFarmer(false);
      setFarmerForm({ 
        name: '', 
        contact: '', 
        address: '',
        bank_account_number: '',
        ifsc_code: '',
        bank_name: '',
        branch_name: '',
        upi_id: '',
        materials_supplied: ''
      });
      setSelectedProcurement(null);
      loadData();
    } catch (error) {
      toast.error('Failed to save farmer');
    }
  };

  const handleRecordPayment = (procurement) => {
    setSelectedProcurement(procurement);
    setPaymentForm({
      amount: procurement.pending_amount || 0,
      payment_mode: 'cash',
      reference: ''
    });
    setOpenPayment(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    try {
      // Record payment
      await api.post('/api/payments', {
        date: new Date().toISOString(),
        party_type: 'farmer',
        party_id: selectedProcurement.farmer_id,
        party_name: selectedProcurement.farmer_name,
        amount: paymentForm.amount,
        payment_mode: paymentForm.payment_mode,
        reference: paymentForm.reference || `Payment for procurement on ${formatDate(selectedProcurement.date)}`
      });
      
      // Update procurement record with new payment info
      const newPaidAmount = (selectedProcurement.paid_amount || 0) + paymentForm.amount;
      const newPendingAmount = selectedProcurement.total_amount - newPaidAmount;
      const newPaymentStatus = newPendingAmount <= 0 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'pending';
      
      await api.put(`/api/procurement/${selectedProcurement.id}`, {
        paid_amount: newPaidAmount,
        pending_amount: newPendingAmount,
        payment_status: newPaymentStatus
      });
      
      toast.success('Payment recorded successfully');
      setOpenPayment(false);
      loadData();
    } catch (error) {
      toast.error('Failed to record payment');
    }
  };

  // Edit procurement
  const handleEdit = (procurement) => {
    setEditMode(true);
    setSelectedProcurement(procurement);
    
    // Map products to include farmer info and paid per product
    const productsWithFarmer = (procurement.products || []).map(p => ({
      farmer_id: p.farmer_id || procurement.farmer_id || '',
      farmer_name: p.farmer_name || procurement.farmer_name || '',
      product_id: p.product_id || '',
      product_name: p.product_name || '',
      quantity: p.quantity || 0,
      unit: p.unit || 'Kg',
      unit_size: p.unit_size || '',
      rate: p.rate || 0,
      total: p.total || 0,
      paid: p.paid || ''
    }));
    
    const totalPaid = productsWithFarmer.reduce((sum, p) => sum + (parseFloat(p.paid) || 0), 0);
    const grandTotal = productsWithFarmer.reduce((sum, p) => sum + (p.total || 0), 0);
    
    setProcurementForm({
      date: procurement.date.split('T')[0],
      products: productsWithFarmer.length > 0 ? productsWithFarmer : [{ farmer_id: '', farmer_name: '', product_id: '', product_name: '', quantity: '', unit: 'Kg', unit_size: '', rate: '', total: 0, paid: '' }],
      total_amount: grandTotal,
      paid_amount: totalPaid || procurement.paid_amount || 0,
      pending_amount: grandTotal - (totalPaid || procurement.paid_amount || 0),
      payment_status: procurement.payment_status || 'pending',
      remark: procurement.remark || ''
    });
    setOpenProcurement(true);
  };

  // Delete procurement
  const handleDelete = async (procurementId) => {
    if (!window.confirm('Are you sure you want to delete this purchase record? This action cannot be undone.')) {
      return;
    }
    
    try {
      await api.delete(`/api/procurement/${procurementId}`);
      toast.success('Purchase record deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete purchase record');
    }
  };

  // Save as template
  const handleSaveAsTemplate = async () => {
    if (!procurementForm.farmer_name || procurementForm.products.length === 0 || !procurementForm.products[0].product_id) {
      toast.error('Please fill in farmer and at least one product to save as template');
      return;
    }

    const templateName = prompt('Enter template name (e.g., "Weekly Order - Ramesh"):');
    if (!templateName) return;

    const template = {
      name: templateName,
      farmer_id: procurementForm.farmer_id,
      farmer_name: procurementForm.farmer_name,
      items: procurementForm.products.filter(p => p.product_id).map(p => ({
        product_id: p.product_id,
        product_name: p.product_name,
        unit: p.unit
      }))
    };

    try {
      const response = await api.post('/api/procurement-templates', template);
      await loadTemplates(); // Reload from server
      toast.success(`Template "${templateName}" saved successfully!`);
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    }
  };

  // Load template
  const handleLoadTemplate = (template) => {
    setProcurementForm({
      ...procurementForm,
      farmer_id: template.farmer_id,
      farmer_name: template.farmer_name,
      products: template.items.map(item => ({ 
        product_id: item.product_id,
        product_name: item.product_name,
        unit: item.unit,
        quantity: 0,
        unit_size: '',
        rate: 0,
        total: 0
      })),
      total_amount: 0,
      pending_amount: 0
    });
    setOpenTemplate(false);
    setOpenProcurement(true);
    toast.success('Template loaded! You can now enter quantities and rates.');
  };

  // Delete template
  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Delete this template?')) return;
    
    try {
      await api.delete(`/api/procurement-templates/${templateId}`);
      await loadTemplates(); // Reload from server
      toast.success('Template deleted');
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  // Farmer edit/delete
  const handleEditFarmer = (farmer) => {
    setFarmerForm({
      name: farmer.name,
      contact: farmer.contact,
      address: farmer.address || '',
      bank_account_number: farmer.bank_account_number || '',
      ifsc_code: farmer.ifsc_code || '',
      bank_name: farmer.bank_name || '',
      branch_name: farmer.branch_name || '',
      upi_id: farmer.upi_id || '',
      materials_supplied: farmer.materials_supplied || ''
    });
    setSelectedProcurement({ ...farmer, isFarmerEdit: true }); // Reuse for tracking
    setOpenFarmer(true);
  };

  const handleDeleteFarmer = async (farmerId) => {
    if (!window.confirm('Are you sure you want to delete this farmer? This cannot be undone.')) {
      return;
    }
    
    try {
      await api.delete(`/api/farmers/${farmerId}`);
      toast.success('Farmer deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete farmer');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // ==================== EXPORT HANDLERS ====================
  const exportProcurements = () => {
    const dataToExport = [];
    filteredProcurements.forEach(proc => {
      proc.products?.forEach(item => {
        dataToExport.push({
          date: proc.date,
          farmer: proc.farmer_name,
          product: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_size: item.unit_size || '-',
          rate: item.rate,
          total: item.total,
          payment_status: proc.payment_status,
          paid_amount: proc.paid_amount || 0,
          pending: proc.pending_amount || 0
        });
      });
    });
    
    exportToCSV(dataToExport, 'procurements', [
      { label: 'Date', getter: (d) => formatDate(d.date) },
      { label: 'Farmer', getter: (d) => d.farmer },
      { label: 'Product', getter: (d) => d.product },
      { label: 'Quantity', getter: (d) => d.quantity },
      { label: 'Unit', getter: (d) => d.unit },
      { label: 'Size (gm)', getter: (d) => d.unit_size },
      { label: 'Rate', getter: (d) => d.rate },
      { label: 'Total', getter: (d) => d.total },
      { label: 'Payment Status', getter: (d) => d.payment_status },
      { label: 'Paid', getter: (d) => d.paid_amount },
      { label: 'Pending', getter: (d) => d.pending }
    ]);
  };

  const exportPendingPayments = () => {
    const farmerWisePending = getFarmerWisePending();
    exportToCSV(farmerWisePending, 'pending_payments', [
      { label: 'Farmer', getter: (d) => d.farmerName },
      { label: 'Contact', getter: (d) => d.contact || '-' },
      { label: 'Total Amount', getter: (d) => d.totalAmount },
      { label: 'Paid Amount', getter: (d) => d.paidAmount },
      { label: 'Pending Amount', getter: (d) => d.pendingAmount },
      { label: 'Procurements Count', getter: (d) => d.procurements?.length || 0 }
    ]);
  };

  const exportFarmers = () => {
    exportToCSV(farmers, 'farmers', [
      { label: 'Name', getter: (d) => d.name },
      { label: 'Contact', getter: (d) => d.contact || '-' },
      { label: 'Address', getter: (d) => d.address || '-' },
      { label: 'Bank Account', getter: (d) => d.bank_account_number || '-' },
      { label: 'IFSC', getter: (d) => d.ifsc_code || '-' },
      { label: 'Bank Name', getter: (d) => d.bank_name || '-' },
      { label: 'UPI ID', getter: (d) => d.upi_id || '-' },
      { label: 'Materials Supplied', getter: (d) => d.materials_supplied || '-' }
    ]);
  };

  const getUnitLabel = (unit, unitSize) => {
    if (unit === 'Bunch' && unitSize) {
      return `${unit} (${unitSize})`;
    }
    return unit;
  };

  const getRateLabel = (unit) => {
    const labels = {
      'Kg': 'Rate per Kg',
      'Bunch': 'Rate per Bunch',
      'Piece': 'Rate per Piece',
      'Pack': 'Rate per Pack'
    };
    return labels[unit] || 'Rate';
  };

  const getTotalPending = () => {
    return procurements.reduce((sum, p) => sum + (p.pending_amount || 0), 0);
  };

  // Compute farmer-wise pending amounts with filters
  const getFarmerWisePending = () => {
    let filtered = procurements;
    
    // Apply date filters
    if (pendingFilters.fromDate) {
      filtered = filtered.filter(p => new Date(p.date) >= new Date(pendingFilters.fromDate));
    }
    if (pendingFilters.toDate) {
      filtered = filtered.filter(p => new Date(p.date) <= new Date(pendingFilters.toDate));
    }
    if (pendingFilters.farmerName) {
      filtered = filtered.filter(p => 
        p.farmer_name.toLowerCase().includes(pendingFilters.farmerName.toLowerCase())
      );
    }

    // Group by farmer
    const farmerMap = {};
    filtered.forEach(p => {
      if (!farmerMap[p.farmer_id]) {
        const farmer = farmers.find(f => f.id === p.farmer_id);
        farmerMap[p.farmer_id] = {
          farmer_id: p.farmer_id,
          farmer_name: p.farmer_name,
          contact: farmer?.contact || '',
          total_amount: 0,
          paid_amount: 0,
          pending_amount: 0,
          purchase_count: 0,
          purchases: []
        };
      }
      farmerMap[p.farmer_id].total_amount += p.total_amount || 0;
      farmerMap[p.farmer_id].paid_amount += p.paid_amount || 0;
      farmerMap[p.farmer_id].pending_amount += p.pending_amount || 0;
      farmerMap[p.farmer_id].purchase_count += 1;
      if ((p.pending_amount || 0) > 0) {
        farmerMap[p.farmer_id].purchases.push(p);
      }
    });

    // Convert to array and filter only those with pending > 0
    return Object.values(farmerMap)
      .filter(f => f.pending_amount > 0)
      .sort((a, b) => b.pending_amount - a.pending_amount);
  };

  // Handle bulk payment
  const handleBulkPayment = async (e) => {
    e.preventDefault();
    
    if (selectedFarmersForPayment.length === 0) {
      toast.error('Please select at least one farmer');
      return;
    }

    try {
      // Process payments for each selected farmer's pending purchases
      for (const farmerData of selectedFarmersForPayment) {
        for (const purchase of farmerData.purchases) {
          if ((purchase.pending_amount || 0) > 0) {
            // Mark as fully paid
            const newPaidAmount = purchase.total_amount;
            await api.put(`/api/procurement/${purchase.id}`, {
              ...purchase,
              paid_amount: newPaidAmount,
              pending_amount: 0,
              payment_status: 'paid'
            });
          }
        }
      }
      
      toast.success(`Payment recorded for ${selectedFarmersForPayment.length} farmer(s)`);
      setOpenBulkPayment(false);
      setSelectedFarmersForPayment([]);
      setBulkPaymentForm({ payment_mode: 'cash', reference: '' });
      loadData();
    } catch (error) {
      toast.error('Failed to record payments');
    }
  };

  // Toggle farmer selection for bulk payment
  const toggleFarmerSelection = (farmerData) => {
    setSelectedFarmersForPayment(prev => {
      const exists = prev.find(f => f.farmer_id === farmerData.farmer_id);
      if (exists) {
        return prev.filter(f => f.farmer_id !== farmerData.farmer_id);
      }
      return [...prev, farmerData];
    });
  };

  // Select all farmers with pending
  const selectAllFarmers = () => {
    const pendingFarmers = getFarmerWisePending();
    setSelectedFarmersForPayment(pendingFarmers);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedFarmersForPayment([]);
  };

  // Get total selected pending amount
  const getSelectedTotalPending = () => {
    return selectedFarmersForPayment.reduce((sum, f) => sum + f.pending_amount, 0);
  };

  return (
    <Layout title={t('procurement.dailyProcurement')}>
      <div className="mb-6 flex flex-col sm:flex-row gap-3 flex-wrap">
        <Dialog open={openFarmer} onOpenChange={setOpenFarmer}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="add-farmer-button">
              <UserPlus size={16} className="mr-2" />
              {t('procurement.addFarmer')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedProcurement?.isFarmerEdit ? t('farmer.editFarmer') : t('farmer.addNew')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitFarmer} className="space-y-4">
              <div>
                <Label htmlFor="farmer-name">{t('farmer.name')} *</Label>
                <Input
                  id="farmer-name"
                  data-testid="farmer-name-input"
                  placeholder={t('farmer.name')}
                  value={farmerForm.name}
                  onChange={(e) => setFarmerForm({ ...farmerForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="farmer-contact">{t('farmer.contact')} *</Label>
                <Input
                  id="farmer-contact"
                  data-testid="farmer-contact-input"
                  placeholder="+91 9876543210"
                  value={farmerForm.contact}
                  onChange={(e) => setFarmerForm({ ...farmerForm, contact: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="farmer-address">{t('farmer.address')}</Label>
                <Input
                  id="farmer-address"
                  data-testid="farmer-address-input"
                  placeholder={t('farmer.address')}
                  value={farmerForm.address}
                  onChange={(e) => setFarmerForm({ ...farmerForm, address: e.target.value })}
                />
              </div>
              
              <div className="border-t pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('farmer.bankingDetails')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="bank-account">{t('farmer.accountNumber')}</Label>
                    <Input
                      id="bank-account"
                      placeholder={t('farmer.accountNumber')}
                      value={farmerForm.bank_account_number}
                      onChange={(e) => setFarmerForm({ ...farmerForm, bank_account_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ifsc">{t('farmer.ifscCode')}</Label>
                    <Input
                      id="ifsc"
                      placeholder={t('farmer.ifscCode')}
                      value={farmerForm.ifsc_code}
                      onChange={(e) => setFarmerForm({ ...farmerForm, ifsc_code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bank-name">{t('farmer.bankName')}</Label>
                    <Input
                      id="bank-name"
                      placeholder={t('farmer.bankName')}
                      value={farmerForm.bank_name}
                      onChange={(e) => setFarmerForm({ ...farmerForm, bank_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="branch">{t('farmer.branchName')}</Label>
                    <Input
                      id="branch"
                      placeholder={t('farmer.branchName')}
                      value={farmerForm.branch_name}
                      onChange={(e) => setFarmerForm({ ...farmerForm, branch_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="upi">{t('farmer.upiId')}</Label>
                    <Input
                      id="upi"
                      placeholder="farmer@upi"
                      value={farmerForm.upi_id}
                      onChange={(e) => setFarmerForm({ ...farmerForm, upi_id: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="materials">{t('farmer.materialsSupplied')}</Label>
                    <Input
                      id="materials"
                      placeholder="e.g., Tomato, Potato, Onion"
                      value={farmerForm.materials_supplied}
                      onChange={(e) => setFarmerForm({ ...farmerForm, materials_supplied: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              
              <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-farmer-button">
                {selectedProcurement?.isFarmerEdit ? t('farmer.update') : t('farmer.add')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={openProcurement} onOpenChange={(open) => {
          if (open) {
            handleOpenProcurementForm();
          } else {
            setOpenProcurement(false);
            setEditMode(false);
            setSelectedProcurement(null);
            setYesterdayItems([]);
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-[#14532D] hover:bg-[#166534]" data-testid="add-procurement-button">
              <Plus size={16} className="mr-2" />
              {t('procurement.recordPurchase')}
            </Button>
          </DialogTrigger>
          <DialogContent 
            className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto"
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editMode ? t('procurement.editPurchase') : t('procurement.recordPurchase')}</DialogTitle>
            </DialogHeader>
            
            {/* Previous Day Procurements Section - NEW DESIGN: Editable Table with Checkboxes */}
            {!editMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                {/* Date Picker Row */}
                <div className="flex items-center gap-4 mb-4 pb-3 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-amber-800">Record purchases for:</label>
                    <Input
                      type="date"
                      value={referenceDateForPurchase}
                      onChange={(e) => handleReferenceDateChange(e.target.value)}
                      className="w-40 h-8 text-sm border-amber-300"
                    />
                  </div>
                  <div className="text-xs text-amber-600">
                    (Shows unique purchases from <strong>last 7 days</strong> as template)
                  </div>
                </div>
                
                {previousDayProcurements.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-2 mb-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-amber-800">
                          Last 7 Days' Purchases ({previousDayProcurements.reduce((sum, p) => sum + (p.products?.length || 0), 0)} unique items)
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            // Select all items - but with blank qty to avoid accidental saves
                            const allItems = [];
                            previousDayProcurements.forEach(proc => {
                              proc.products?.forEach(p => {
                                allItems.push({
                                  selected: true,
                                  farmer_id: proc.farmer_id,
                                  farmer_name: proc.farmer_name,
                                  product_id: p.product_id,
                                  product_name: p.product_name,
                                  quantity: '',  // Blank qty to force user to enter value
                                  unit: p.unit || 'Kg',
                                  unit_size: p.unit_size || '',
                                  rate: p.rate || 0,
                                  total: 0  // Total is 0 since qty is blank
                                });
                              });
                            });
                            setYesterdayItems(allItems);
                          }}
                          className="text-amber-700 border-amber-300"
                        >
                          Select All
                        </Button>
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setYesterdayItems([])}
                        >
                          Clear
                        </Button>
                        <span className="text-sm text-amber-600 ml-2">Select items to purchase, edit quantities & rates, then save</span>
                      </div>
                    </div>
                    
                    {/* Search Bar for Yesterday's Items */}
                    <div className="mb-3">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                          type="text"
                          placeholder="Search by farmer name or product..."
                          value={yesterdaySearchTerm}
                          onChange={(e) => setYesterdaySearchTerm(e.target.value)}
                          className="pl-9 h-9 border-amber-300"
                        />
                        {yesterdaySearchTerm && (
                          <button 
                            onClick={() => setYesterdaySearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                
                {/* Editable Table */}
                <div className="bg-white rounded border overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-100 sticky top-0">
                      <tr>
                        <th className="p-2 w-8 text-center">
                          <input 
                            type="checkbox"
                            checked={yesterdayItems.length === previousDayProcurements.reduce((sum, p) => sum + (p.products?.length || 0), 0) && yesterdayItems.every(i => i.selected)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const allItems = [];
                                previousDayProcurements.forEach(proc => {
                                  proc.products?.forEach(p => {
                                    allItems.push({
                                      selected: true,
                                      farmer_id: proc.farmer_id,
                                      farmer_name: proc.farmer_name,
                                      product_id: p.product_id,
                                      product_name: p.product_name,
                                      quantity: '',  // Blank qty to force user to enter value
                                      unit: p.unit || 'Kg',
                                      unit_size: p.unit_size || '',
                                      rate: p.rate || 0,
                                      total: 0  // Total is 0 since qty is blank
                                    });
                                  });
                                });
                                setYesterdayItems(allItems);
                              } else {
                                setYesterdayItems([]);
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </th>
                        <th className="p-2 text-left font-medium">Farmer</th>
                        <th className="p-2 text-left font-medium">Product</th>
                        <th className="p-2 text-center font-medium w-20">Qty</th>
                        <th className="p-2 text-center font-medium w-16">Unit</th>
                        <th className="p-2 text-center font-medium w-20">Size (gm)</th>
                        <th className="p-2 text-center font-medium w-20">Rate</th>
                        <th className="p-2 text-right font-medium w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previousDayProcurements.map((proc, procIdx) => 
                        proc.products?.filter(p => {
                          // Filter by search term
                          if (!yesterdaySearchTerm) return true;
                          const searchLower = yesterdaySearchTerm.toLowerCase();
                          const farmerMatch = proc.farmer_name?.toLowerCase().includes(searchLower);
                          const productMatch = p.product_name?.toLowerCase().includes(searchLower);
                          return farmerMatch || productMatch;
                        }).map((p, pIdx) => {
                          const itemKey = `${proc.farmer_id}-${p.product_id}`;
                          const itemIndex = yesterdayItems.findIndex(i => i.farmer_id === proc.farmer_id && i.product_id === p.product_id);
                          const item = itemIndex >= 0 ? yesterdayItems[itemIndex] : null;
                          const isSelected = item?.selected || false;
                          
                          return (
                            <tr key={itemKey} className={`border-b ${isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                              <td className="p-2 text-center">
                                <input 
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setYesterdayItems([...yesterdayItems, {
                                        selected: true,
                                        farmer_id: proc.farmer_id,
                                        farmer_name: proc.farmer_name,
                                        product_id: p.product_id,
                                        product_name: p.product_name,
                                        quantity: '',  // Blank qty to force user to enter value
                                        unit: p.unit || 'Kg',
                                        unit_size: p.unit_size || '',
                                        rate: p.rate || 0,
                                        total: 0  // Total is 0 since qty is blank
                                      }]);
                                    } else {
                                      setYesterdayItems(yesterdayItems.filter(i => !(i.farmer_id === proc.farmer_id && i.product_id === p.product_id)));
                                    }
                                  }}
                                  className="w-4 h-4"
                                />
                              </td>
                              <td className="p-2 text-sm">{proc.farmer_name}</td>
                              <td className="p-2 font-medium">{getProductName(p)}</td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  placeholder="Enter qty"
                                  value={item?.quantity ?? ''}
                                  onChange={(e) => {
                                    const newQty = parseFloat(e.target.value) || 0;
                                    const newTotal = newQty * (item?.rate ?? p.rate ?? 0);
                                    if (itemIndex >= 0) {
                                      const updated = [...yesterdayItems];
                                      updated[itemIndex] = { ...updated[itemIndex], quantity: e.target.value === '' ? '' : newQty, total: newTotal };
                                      setYesterdayItems(updated);
                                    } else {
                                      setYesterdayItems([...yesterdayItems, {
                                        selected: true,
                                        farmer_id: proc.farmer_id,
                                        farmer_name: proc.farmer_name,
                                        product_id: p.product_id,
                                        product_name: p.product_name,
                                        quantity: e.target.value === '' ? '' : newQty,
                                        unit: p.unit || 'Kg',
                                        unit_size: p.unit_size || '',
                                        rate: p.rate || 0,
                                        total: newTotal
                                      }]);
                                    }
                                  }}
                                  className="h-7 w-full text-center text-sm"
                                  disabled={!isSelected}
                                />
                              </td>
                              <td className="p-2 text-center text-xs text-gray-600">{item?.unit ?? p.unit ?? 'Kg'}</td>
                              <td className="p-2">
                                {(item?.unit ?? p.unit) === 'Bunch' ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    step="10"
                                    placeholder="gm"
                                    value={item?.unit_size ?? p.unit_size ?? ''}
                                    onChange={(e) => {
                                      const newSize = e.target.value;
                                      if (itemIndex >= 0) {
                                        const updated = [...yesterdayItems];
                                        updated[itemIndex] = { ...updated[itemIndex], unit_size: newSize };
                                        setYesterdayItems(updated);
                                      } else {
                                        setYesterdayItems([...yesterdayItems, {
                                          selected: true,
                                          farmer_id: proc.farmer_id,
                                          farmer_name: proc.farmer_name,
                                          product_id: p.product_id,
                                          product_name: p.product_name,
                                          quantity: p.quantity || 0,
                                          unit: p.unit || 'Kg',
                                          unit_size: newSize,
                                          rate: p.rate || 0,
                                          total: (p.quantity || 0) * (p.rate || 0)
                                        }]);
                                      }
                                    }}
                                    className="h-7 w-full text-center text-sm"
                                    disabled={!isSelected}
                                  />
                                ) : (
                                  <span className="text-gray-400 text-xs">-</span>
                                )}
                              </td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={item?.rate ?? p.rate ?? 0}
                                  onChange={(e) => {
                                    const newRate = parseFloat(e.target.value) || 0;
                                    const newTotal = (item?.quantity ?? p.quantity ?? 0) * newRate;
                                    if (itemIndex >= 0) {
                                      const updated = [...yesterdayItems];
                                      updated[itemIndex] = { ...updated[itemIndex], rate: newRate, total: newTotal };
                                      setYesterdayItems(updated);
                                    } else {
                                      setYesterdayItems([...yesterdayItems, {
                                        selected: true,
                                        farmer_id: proc.farmer_id,
                                        farmer_name: proc.farmer_name,
                                        product_id: p.product_id,
                                        product_name: p.product_name,
                                        quantity: p.quantity || 0,
                                        unit: p.unit || 'Kg',
                                        unit_size: p.unit_size || '',
                                        rate: newRate,
                                        total: newTotal
                                      }]);
                                    }
                                  }}
                                  className="h-7 w-full text-center text-sm"
                                  disabled={!isSelected}
                                />
                              </td>
                              <td className="p-2 text-right font-medium">
                                ₹{(item?.total ?? (p.quantity || 0) * (p.rate || 0))?.toFixed(0)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Selected items summary & Save button */}
                {yesterdayItems.filter(i => i.selected).length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 bg-amber-100 p-3 rounded">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-amber-500 text-amber-700 hover:bg-amber-50"
                      onClick={addYesterdayItemsToForm}
                    >
                      <Plus size={14} className="mr-1" />
                      Add to Form Below
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                      onClick={async () => {
                        const selectedItems = yesterdayItems.filter(i => i.selected);
                        if (selectedItems.length === 0) {
                          toast.error('Please select at least one item');
                          return;
                        }
                        
                        // Group by farmer for separate procurements
                        const byFarmer = {};
                        selectedItems.forEach(item => {
                          if (!byFarmer[item.farmer_id]) {
                            byFarmer[item.farmer_id] = {
                              farmer_id: item.farmer_id,
                              farmer_name: item.farmer_name,
                              products: []
                            };
                          }
                          byFarmer[item.farmer_id].products.push({
                            product_id: item.product_id,
                            product_name: item.product_name,
                            quantity: parseFloat(item.quantity) || 0,
                            unit: item.unit,
                            unit_size: item.unit_size,
                            rate: parseFloat(item.rate) || 0,
                            total: (parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0)
                          });
                        });
                        
                        // Create procurements for each farmer using the selected reference date
                        try {
                          for (const farmerId of Object.keys(byFarmer)) {
                            const farmerData = byFarmer[farmerId];
                            const totalAmount = farmerData.products.reduce((sum, p) => sum + (p.total || 0), 0);
                            
                            await api.post('/api/procurement', {
                              date: new Date(referenceDateForPurchase).toISOString(),
                              farmer_id: farmerData.farmer_id,
                              farmer_name: farmerData.farmer_name,
                              products: farmerData.products,
                              total_amount: totalAmount,
                              paid_amount: 0,
                              pending_amount: totalAmount,
                              payment_status: 'pending',
                              status: 'completed'
                            });
                          }
                          
                          toast.success(`Created ${Object.keys(byFarmer).length} purchase(s) with ${selectedItems.length} items`);
                          setOpenProcurement(false);
                          setYesterdayItems([]);
                          loadData();
                        } catch (error) {
                          toast.error(error.response?.data?.detail || 'Failed to save purchases');
                        }
                      }}
                    >
                      Quick Save ({yesterdayItems.filter(i => i.selected).length})
                    </Button>
                    <span className="text-amber-800 font-medium">
                      {yesterdayItems.filter(i => i.selected).length} items selected
                    </span>
                    <span className="text-amber-700">
                      Total: ₹{yesterdayItems.filter(i => i.selected).reduce((sum, i) => sum + (i.total || 0), 0).toLocaleString()}
                    </span>
                  </div>
                )}
                  </>
                ) : (
                  <div className="text-center py-4 text-amber-700">
                    <p>No purchases found for {new Date(new Date(referenceDateForPurchase).getTime() - 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    <p className="text-sm text-amber-600 mt-1">Try selecting a different date, or add purchases manually below</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Divider with "OR" */}
            {!editMode && (
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="text-sm text-gray-500 font-medium">{t('procurement.orAddManually')}</span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>
            )}
            
            <form onSubmit={handleSubmitProcurement} className="space-y-4">
              {/* Date selector row */}
              <div className="flex items-center gap-4 pb-3 border-b">
                <div className="flex items-center gap-2">
                  <Label htmlFor="proc-date" className="text-sm font-medium whitespace-nowrap">{t('procurement.date')}:</Label>
                  <Input
                    id="proc-date"
                    type="date"
                    data-testid="procurement-date-input"
                    value={procurementForm.date}
                    onChange={(e) => setProcurementForm({ ...procurementForm, date: e.target.value })}
                    required
                    className="w-40 h-8 text-sm"
                  />
                </div>
              </div>

              {/* Single-row table matching Yesterday's Purchases layout */}
              <div className="bg-white rounded border">
                <div style={{ minWidth: '900px' }}>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left font-medium text-gray-600" style={{ width: '140px' }}>{t('procurement.farmer')}</th>
                        <th className="p-2 text-left font-medium text-gray-600" style={{ width: '150px' }}>{t('procurement.productName')}</th>
                        <th className="p-2 text-center font-medium text-gray-600" style={{ width: '60px' }}>{t('common.qty')}</th>
                        <th className="p-2 text-center font-medium text-gray-600" style={{ width: '70px' }}>Unit</th>
                        <th className="p-2 text-center font-medium text-gray-600" style={{ width: '60px' }}>Size</th>
                        <th className="p-2 text-center font-medium text-gray-600" style={{ width: '60px' }}>{t('retailer.rate')}</th>
                        <th className="p-2 text-center font-medium text-gray-600" style={{ width: '70px' }}>{t('common.total')}</th>
                        <th className="p-2 text-center font-medium text-gray-600" style={{ width: '70px' }}>{t('procurement.paid')}</th>
                        <th className="p-2 text-center" style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {procurementForm.products.map((product, index) => (
                        <tr key={index} className="border-t hover:bg-gray-50">
                          {/* Farmer - show autocomplete for all rows */}
                          <td className="p-2 relative">
                            {product.farmer_id ? (
                              // Show farmer name as text if already selected
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-medium truncate flex-1">{product.farmer_name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newProducts = [...procurementForm.products];
                                    newProducts[index] = { ...newProducts[index], farmer_id: '', farmer_name: '' };
                                    setProcurementForm({ ...procurementForm, products: newProducts });
                                  }}
                                  className="text-gray-400 hover:text-red-500 text-xs"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <AutocompleteInput
                                placeholder={t('procurement.selectFarmer')}
                                items={farmers}
                                displayKey="name"
                                secondaryKey="contact"
                                onSelect={(f) => handleFarmerSelect(index, f)}
                                testId={`procurement-farmer-autocomplete-${index}`}
                                storageKey="recent_farmers"
                                compact={true}
                              />
                            )}
                          </td>
                          {/* Product */}
                          <td className="p-2 relative">
                            {product.product_id ? (
                              // Show product name as text if already selected (from yesterday's items)
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-medium truncate flex-1">{product.product_name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newProducts = [...procurementForm.products];
                                    newProducts[index] = { ...newProducts[index], product_id: '', product_name: '' };
                                    setProcurementForm({ ...procurementForm, products: newProducts });
                                  }}
                                  className="text-gray-400 hover:text-red-500 text-xs"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <AutocompleteInput
                                placeholder={t('procurement.productName')}
                                items={products}
                                displayKey="name"
                                localizedDisplayKey="name_hi"
                                secondaryKey="category"
                                onSelect={(p) => handleProductSelect(index, p)}
                                testId={`product-autocomplete-${index}`}
                                storageKey="recent_products"
                                compact={true}
                              />
                            )}
                          </td>
                        {/* Qty */}
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            className="h-7 text-xs text-center"
                            data-testid={`quantity-input-${index}`}
                            value={product.quantity || ''}
                            onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                          />
                        </td>
                        {/* Unit */}
                        <td className="p-2">
                          <Select
                            value={product.unit}
                            onValueChange={(value) => handleProductChange(index, 'unit', value)}
                          >
                            <SelectTrigger className="h-7 text-xs" data-testid={`unit-select-${index}`}>
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {unitOptions.map((u) => (
                                <SelectItem key={u.value} value={u.value}>
                                  {u.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* Size (for Bunch) */}
                        <td className="p-2">
                          {product.unit === 'Bunch' ? (
                            <Input
                              type="text"
                              placeholder="gm"
                              className="h-7 text-xs text-center"
                              data-testid={`bunch-size-input-${index}`}
                              value={product.unit_size || ''}
                              onChange={(e) => handleProductChange(index, 'unit_size', e.target.value)}
                            />
                          ) : (
                            <span className="text-gray-400 text-xs flex justify-center">-</span>
                          )}
                        </td>
                        {/* Rate */}
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.5"
                            placeholder="0"
                            className="h-7 text-xs text-center"
                            data-testid={`rate-input-${index}`}
                            value={product.rate || ''}
                            onChange={(e) => handleProductChange(index, 'rate', e.target.value)}
                          />
                        </td>
                        {/* Total */}
                        <td className="p-2 text-center font-semibold text-green-700">
                          ₹{(product.total || 0).toFixed(0)}
                        </td>
                        {/* Paid - editable for ALL rows */}
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            className="h-7 text-xs text-center w-16"
                            data-testid={`paid-amount-input-${index}`}
                            value={product.paid || ''}
                            onChange={(e) => {
                              const newProducts = [...procurementForm.products];
                              const paidValue = e.target.value === '' ? '' : (parseFloat(e.target.value) || 0);
                              newProducts[index] = { ...newProducts[index], paid: paidValue };
                              
                              // Calculate total paid amount
                              const totalPaid = newProducts.reduce((sum, p) => sum + (parseFloat(p.paid) || 0), 0);
                              const grandTotal = newProducts.reduce((sum, p) => sum + (p.total || 0), 0);
                              
                              setProcurementForm({
                                ...procurementForm,
                                products: newProducts,
                                paid_amount: totalPaid,
                                pending_amount: grandTotal - totalPaid,
                                payment_status: totalPaid === 0 ? 'pending' : totalPaid >= grandTotal ? 'paid' : 'partial'
                              });
                            }}
                          />
                        </td>
                        {/* Delete */}
                        <td className="p-2 text-center">
                          {procurementForm.products.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleRemoveProductRow(index)}
                              data-testid={`remove-product-${index}`}
                            >
                              <Trash2 size={14} className="text-red-500" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>

              {/* Add Item Button */}
              <div className="flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddProductRow}
                  data-testid="add-product-row-button"
                  className="border-dashed border-2 hover:bg-green-50 hover:border-green-400"
                >
                  <Plus size={16} className="mr-1" />
                  {t('procurement.addProduct')}
                </Button>
              </div>

              {/* Summary Row */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                <div className="flex items-center gap-6">
                  <div className="text-sm">
                    <span className="text-gray-600">{t('procurement.totalAmount')}:</span>
                    <span className="ml-2 font-bold text-lg text-[#14532D]" data-testid="grand-total">
                      ₹{procurementForm.total_amount.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">{t('procurement.paidAmount')}:</span>
                    <span className="ml-2 font-semibold text-green-700">
                      ₹{(procurementForm.paid_amount || 0).toFixed(0)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">{t('procurement.pendingAmount')}:</span>
                    <span className="ml-2 font-semibold text-red-600" data-testid="pending-amount-display">
                      ₹{procurementForm.pending_amount.toFixed(0)}
                    </span>
                  </div>
                </div>
                {procurementForm.payment_status !== 'pending' && (
                  <span className={`text-xs px-2 py-1 rounded ${procurementForm.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {procurementForm.payment_status.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Remarks at the bottom */}
              <div className="border-t pt-3">
                <Label htmlFor="remark" className="text-sm">{t('procurement.remark')} {t('procurement.optional')}</Label>
                <Input
                  id="remark"
                  type="text"
                  placeholder={t('procurement.addNotes')}
                  data-testid="remark-input"
                  value={procurementForm.remark || ''}
                  onChange={(e) => setProcurementForm({ ...procurementForm, remark: e.target.value })}
                  className="mt-1"
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleSaveAsTemplate}
                  data-testid="save-template-button"
                >
                  <BookmarkPlus size={16} className="mr-2" />
                  {t('procurement.saveTemplate')}
                </Button>
                <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-procurement-button">
                  {editMode ? t('procurement.editPurchase') : t('procurement.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('procurement.farmers')}</p>
                <p className="text-3xl font-bold text-gray-900">{farmers.length}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <UserPlus className="text-green-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('procurement.purchases')}</p>
                <p className="text-3xl font-bold text-gray-900">{procurements.length}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Plus className="text-blue-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('procurement.pending')}</p>
                <p className="text-3xl font-bold text-red-700">₹{getTotalPending().toFixed(2)}</p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <IndianRupee className="text-red-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-3xl">
          <TabsTrigger value="history">{t('procurement.purchaseHistory')}</TabsTrigger>
          <TabsTrigger value="pending">Pending Payments</TabsTrigger>
          <TabsTrigger value="farmers">{t('procurement.farmers')}</TabsTrigger>
          <TabsTrigger value="templates">{t('procurement.templates')} ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          {/* Filter Panel */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter size={18} />
                  {t('procurement.filters')}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters-button">
                  {t('procurement.clearAll')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="filter-from-date" className="text-xs">{t('procurement.fromDate')}</Label>
                  <Input
                    id="filter-from-date"
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                    data-testid="filter-from-date"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-to-date" className="text-xs">{t('procurement.toDate')}</Label>
                  <Input
                    id="filter-to-date"
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                    data-testid="filter-to-date"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-farmer" className="text-xs">{t('procurement.farmerName')}</Label>
                  <Input
                    id="filter-farmer"
                    type="text"
                    placeholder={t('common.search')}
                    value={filters.farmerName}
                    onChange={(e) => setFilters({ ...filters, farmerName: e.target.value })}
                    data-testid="filter-farmer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-product" className="text-xs">{t('procurement.productName')}</Label>
                  <Input
                    id="filter-product"
                    type="text"
                    placeholder={t('common.search')}
                    value={filters.productName}
                    onChange={(e) => setFilters({ ...filters, productName: e.target.value })}
                    data-testid="filter-product-name"
                  />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                {t('procurement.showing')} {filteredProcurements.length} {t('procurement.of')} {procurements.length} {t('procurement.purchases')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t('procurement.purchaseHistory')}</CardTitle>
              <Button size="sm" variant="outline" onClick={exportProcurements} title="Export to Excel">
                <FileSpreadsheet size={14} className="mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t('procurement.date')}</th>
                      <th>{t('procurement.farmer')}</th>
                      <th>{t('procurement.products')}</th>
                      <th className="text-right">{t('procurement.total')}</th>
                      <th className="text-right">{t('procurement.paid')}</th>
                      <th className="text-right">{t('procurement.pending')}</th>
                      <th>{t('procurement.payment')}</th>
                      <th className="text-center">{t('procurement.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcurements.map((proc) => (
                      <tr key={proc.id} data-testid={`procurement-row-${proc.id}`}>
                        <td>{formatDate(proc.date)}</td>
                        <td className="font-medium">{proc.farmer_name}</td>
                        <td>
                          <div className="space-y-1">
                            {proc.products?.map((p, i) => (
                              <div key={i} className="text-xs">
                                {getProductName(p)}: {p.quantity} {getUnitLabel(p.unit, p.unit_size)} @ ₹{p.rate}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="text-right font-semibold">₹{proc.total_amount?.toFixed(2)}</td>
                        <td className="text-right text-green-700">₹{(proc.paid_amount || 0).toFixed(2)}</td>
                        <td className="text-right text-red-700">₹{(proc.pending_amount || 0).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${
                            proc.payment_status === 'paid' ? 'badge-success' : 
                            proc.payment_status === 'partial' ? 'badge-warning' : 'badge-error'
                          }`}>
                            {proc.payment_status || 'pending'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(proc)}
                              data-testid={`edit-procurement-${proc.id}`}
                              title={t('common.edit')}
                            >
                              <Edit size={14} className="text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(proc.id)}
                              data-testid={`delete-procurement-${proc.id}`}
                              title={t('common.delete')}
                            >
                              <Trash2 size={14} className="text-red-600" />
                            </Button>
                            {(proc.pending_amount || 0) > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRecordPayment(proc)}
                                data-testid={`pay-farmer-${proc.id}`}
                                title={t('procurement.addPayment')}
                              >
                                <IndianRupee size={14} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredProcurements.length === 0 && !loading && (
                  <div className="p-8 text-center text-gray-500">
                    {procurements.length === 0 
                      ? t('procurement.noPurchases')
                      : t('common.noData')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          {/* Pending Payments Filter Panel */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter size={18} />
                  Filter Pending Payments
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setPendingFilters({ fromDate: '', toDate: '', farmerName: '' })}
                    data-testid="clear-pending-filters"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="pending-from-date" className="text-xs">From Date</Label>
                  <Input
                    id="pending-from-date"
                    type="date"
                    value={pendingFilters.fromDate}
                    onChange={(e) => setPendingFilters({ ...pendingFilters, fromDate: e.target.value })}
                    data-testid="pending-from-date"
                  />
                </div>
                <div>
                  <Label htmlFor="pending-to-date" className="text-xs">To Date</Label>
                  <Input
                    id="pending-to-date"
                    type="date"
                    value={pendingFilters.toDate}
                    onChange={(e) => setPendingFilters({ ...pendingFilters, toDate: e.target.value })}
                    data-testid="pending-to-date"
                  />
                </div>
                <div>
                  <Label htmlFor="pending-farmer" className="text-xs">Farmer Name</Label>
                  <Input
                    id="pending-farmer"
                    type="text"
                    placeholder="Search farmer..."
                    value={pendingFilters.farmerName}
                    onChange={(e) => setPendingFilters({ ...pendingFilters, farmerName: e.target.value })}
                    data-testid="pending-farmer-filter"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Payment Actions */}
          {selectedFarmersForPayment.length > 0 && (
            <Card className="mb-4 border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-semibold text-green-800">
                      {selectedFarmersForPayment.length} farmer(s) selected
                    </p>
                    <p className="text-sm text-green-700">
                      Total Pending: ₹{getSelectedTotalPending().toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={clearSelection}>
                      Clear Selection
                    </Button>
                    <Button 
                      className="bg-[#14532D] hover:bg-[#166534]"
                      onClick={() => setOpenBulkPayment(true)}
                      data-testid="bulk-payment-btn"
                    >
                      <IndianRupee size={16} className="mr-2" />
                      Record Bulk Payment
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Farmer-wise Pending Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">Farmer-wise Pending Payments</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={exportPendingPayments} title="Export to Excel">
                    <FileSpreadsheet size={14} className="mr-1" /> Export
                  </Button>
                  <Button variant="outline" size="sm" onClick={selectAllFarmers} data-testid="select-all-farmers">
                    <CheckSquare size={16} className="mr-2" />
                    Select All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th className="w-10"></th>
                      <th>FARMER</th>
                      <th>CONTACT</th>
                      <th className="text-right">TOTAL PURCHASES</th>
                      <th className="text-right">TOTAL AMOUNT</th>
                      <th className="text-right">PAID</th>
                      <th className="text-right">PENDING</th>
                      <th className="text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFarmerWisePending().map((farmerData) => {
                      const isSelected = selectedFarmersForPayment.some(f => f.farmer_id === farmerData.farmer_id);
                      return (
                        <tr key={farmerData.farmer_id} data-testid={`pending-row-${farmerData.farmer_id}`}>
                          <td>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleFarmerSelection(farmerData)}
                              data-testid={`select-farmer-${farmerData.farmer_id}`}
                            />
                          </td>
                          <td className="font-medium">{farmerData.farmer_name}</td>
                          <td>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Phone size={12} />
                              {farmerData.contact || '-'}
                            </div>
                          </td>
                          <td className="text-right">{farmerData.purchase_count}</td>
                          <td className="text-right font-semibold">₹{farmerData.total_amount.toFixed(2)}</td>
                          <td className="text-right text-green-700">₹{farmerData.paid_amount.toFixed(2)}</td>
                          <td className="text-right text-red-700 font-bold">₹{farmerData.pending_amount.toFixed(2)}</td>
                          <td className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedFarmersForPayment([farmerData]);
                                setOpenBulkPayment(true);
                              }}
                              data-testid={`pay-single-${farmerData.farmer_id}`}
                            >
                              <IndianRupee size={14} className="mr-1" />
                              Pay
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {getFarmerWisePending().length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    <CheckSquare size={48} className="mx-auto text-green-400 mb-4" />
                    <p className="font-medium text-green-700">All payments cleared!</p>
                    <p className="text-sm">No pending payments for the selected filters.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="farmers" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{t('procurement.farmers')} ({farmers.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={exportFarmers} title="Export to Excel">
                <FileSpreadsheet size={14} className="mr-1" /> Export
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {farmers.map((farmer) => (
                  <div key={farmer.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow relative" data-testid={`farmer-card-${farmer.id}`}>
                    <div className="absolute top-2 right-2 flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditFarmer(farmer)}
                        data-testid={`edit-farmer-${farmer.id}`}
                        className="h-8 w-8 p-0"
                      >
                        <Edit size={14} className="text-blue-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteFarmer(farmer.id)}
                        data-testid={`delete-farmer-${farmer.id}`}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </div>
                    <p className="font-semibold text-gray-900 pr-16">{farmer.name}</p>
                    <p className="text-sm text-gray-600 mt-1">{farmer.contact}</p>
                    {farmer.address && <p className="text-xs text-gray-500 mt-1">{farmer.address}</p>}
                  </div>
                ))}
              </div>
              {farmers.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No farmers registered yet. Add your first farmer to start.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Purchase Templates ({templates.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {templates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <div key={template.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow" data-testid={`template-card-${template.id}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{template.name}</p>
                          <p className="text-sm text-gray-600 mt-1">{template.farmer_name}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTemplate(template.id)}
                          data-testid={`delete-template-${template.id}`}
                        >
                          <Trash2 size={14} className="text-red-600" />
                        </Button>
                      </div>
                      <div className="mt-2 mb-3">
                        <p className="text-xs text-gray-500">{template.products.length} products</p>
                        <div className="mt-1 space-y-1 max-h-[100px] overflow-y-auto pr-1">
                          {template.products.map((p, i) => (
                            <p key={i} className="text-xs text-gray-600">
                              • {getProductName(p)}: {p.quantity} {p.unit}
                            </p>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full bg-[#14532D] hover:bg-[#166534]"
                        onClick={() => handleLoadTemplate(template)}
                        data-testid={`load-template-${template.id}`}
                      >
                        <BookmarkPlus size={14} className="mr-2" />
                        Use Template
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookmarkPlus size={48} className="mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">No templates saved yet</p>
                  <p className="text-sm text-gray-500">Create a purchase and click "Save as Template" to save it for future use</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={openPayment} onOpenChange={setOpenPayment}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Payment to Farmer</DialogTitle>
          </DialogHeader>
          {selectedProcurement && (
            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Farmer:</span>
                  <span className="font-medium">{selectedProcurement.farmer_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Purchase Date:</span>
                  <span className="font-medium">{formatDate(selectedProcurement.date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="font-medium">₹{selectedProcurement.total_amount?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Already Paid:</span>
                  <span className="font-medium text-green-700">₹{(selectedProcurement.paid_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold">Pending:</span>
                  <span className="font-bold text-red-700">₹{(selectedProcurement.pending_amount || 0).toFixed(2)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="payment-amount">Payment Amount *</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  data-testid="payment-amount-input"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="payment-mode">Payment Mode *</Label>
                <Select value={paymentForm.payment_mode} onValueChange={(value) => setPaymentForm({ ...paymentForm, payment_mode: value })}>
                  <SelectTrigger data-testid="payment-mode-select">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="payment-reference">Reference / Note</Label>
                <Input
                  id="payment-reference"
                  placeholder="Transaction ID, Cheque number, etc."
                  data-testid="payment-reference-input"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                />
              </div>

              <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-payment-button">
                Record Payment
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Payment Dialog */}
      <Dialog open={openBulkPayment} onOpenChange={setOpenBulkPayment}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Record Bulk Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkPayment} className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-3 max-h-60 overflow-y-auto">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Selected Farmers ({selectedFarmersForPayment.length}):
              </p>
              {selectedFarmersForPayment.map((farmerData) => (
                <div key={farmerData.farmer_id} className="flex justify-between items-center text-sm py-2 border-b border-gray-200 last:border-0">
                  <div>
                    <p className="font-medium">{farmerData.farmer_name}</p>
                    <p className="text-xs text-gray-500">{farmerData.purchase_count} pending purchase(s)</p>
                  </div>
                  <span className="font-bold text-red-700">₹{farmerData.pending_amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-green-800">Total Payment Amount:</span>
                <span className="text-2xl font-bold text-green-700">₹{getSelectedTotalPending().toFixed(2)}</span>
              </div>
              <p className="text-xs text-green-600 mt-1">All pending amounts will be marked as paid</p>
            </div>

            <div>
              <Label htmlFor="bulk-payment-mode">Payment Mode *</Label>
              <Select 
                value={bulkPaymentForm.payment_mode} 
                onValueChange={(value) => setBulkPaymentForm({ ...bulkPaymentForm, payment_mode: value })}
              >
                <SelectTrigger data-testid="bulk-payment-mode-select">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="bulk-payment-reference">Reference / Note</Label>
              <Input
                id="bulk-payment-reference"
                placeholder="Transaction ID, Cheque number, etc."
                data-testid="bulk-payment-reference-input"
                value={bulkPaymentForm.reference}
                onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, reference: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-bulk-payment-button">
              <IndianRupee size={16} className="mr-2" />
              Confirm Payment for {selectedFarmersForPayment.length} Farmer(s)
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
