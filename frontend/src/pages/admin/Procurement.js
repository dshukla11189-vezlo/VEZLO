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
import { Plus, Trash2, UserPlus, DollarSign, Edit, Edit2, Eye, Filter, Save, BookmarkPlus, IndianRupee, CheckSquare, Square, Phone, X, FileSpreadsheet, Search, Check, Clock, FileText, Download, ChevronDown, ChevronRight, Calendar, Users } from 'lucide-react';
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
  const [paidByEmployees, setPaidByEmployees] = useState([]); // Employees who have paid procurements
  const [loading, setLoading] = useState(true);
  const [openProcurement, setOpenProcurement] = useState(false);
  const [openFarmer, setOpenFarmer] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [openTemplate, setOpenTemplate] = useState(false);
  const [selectedProcurement, setSelectedProcurement] = useState(null);
  const [editMode, setEditMode] = useState(false);
  
  // Date filter state for API loading - default to TODAY only
  const [dateFilters, setDateFilters] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      fromDate: today,
      toDate: today
    };
  });
  const [appliedDateRange, setAppliedDateRange] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      fromDate: today,
      toDate: today
    };
  });
  
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
    productName: '',
    status: '', // '', 'paid', 'pending', 'partial'
    paidBy: '' // '', 'company', or employee_id
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
    reference: '',
    remarks: '',
    paid_by_type: 'company', // 'company' or 'employee'
    paid_by_employee_id: '',
    payment_date: new Date().toISOString().split('T')[0]
  });

  // Payment history states
  const [procurementPayments, setProcurementPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [editingProcurementPayment, setEditingProcurementPayment] = useState(null);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    remarks: '',
    payment_date: '',
    paid_by_type: 'company',
    paid_by_employee_id: ''
  });

  // Staff users for Paid By dropdown
  const [staffUsers, setStaffUsers] = useState([]);
  
  // Settlement/Reimbursement states
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementProcurement, setSettlementProcurement] = useState(null);
  const [settlementForm, setSettlementForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'bank_transfer',
    payment_reference: '',
    remarks: '',
    reimbursement_amount: 0  // For partial reimbursement
  });
  const [selectedForSettlement, setSelectedForSettlement] = useState([]);  // For bulk settlement
  const [selectedForPDF, setSelectedForPDF] = useState([]);  // For PDF download
  const [fixingLegacyData, setFixingLegacyData] = useState(false);  // For legacy data migration
  
  // Employee Bulk Reimbursement Modal (new - like Variable Expenses)
  const [showEmployeeReimbursementModal, setShowEmployeeReimbursementModal] = useState(false);
  const [selectedEmployeeForReimbursement, setSelectedEmployeeForReimbursement] = useState(null);
  const [employeeReimbursementForm, setEmployeeReimbursementForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'Bank Transfer',
    payment_reference: '',
    remarks: '',
    custom_amount: ''
  });
  
  // Expanded farmer view state (for date-wise breakdown)
  const [expandedFarmerId, setExpandedFarmerId] = useState(null);
  const [selectedPurchasesForPayment, setSelectedPurchasesForPayment] = useState([]);  // Selected individual purchases
  const [partialPaymentAmounts, setPartialPaymentAmounts] = useState({});  // { purchaseId: amount }

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
    reference: '',
    remarks: '',
    custom_amount: ''  // For editable bulk payment amount
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
    loadStaffUsers();
  }, []);
  
  // Reload data when applied date range changes
  useEffect(() => {
    if (appliedDateRange.fromDate && appliedDateRange.toDate) {
      loadData();
    }
  }, [appliedDateRange]);

  const loadStaffUsers = async () => {
    try {
      const response = await api.get('/api/employees');
      setStaffUsers(response.data || []);
    } catch (error) {
      console.error('Failed to load staff users:', error);
    }
  };

  const loadData = async () => {
    try {
      const { fromDate, toDate } = appliedDateRange;
      const [procRes, farmRes, prodRes, unitsRes] = await Promise.all([
        api.get(`/api/procurement?from_date=${fromDate}&to_date=${toDate}`),
        api.get('/api/farmers'),
        api.get('/api/products?include_images=false'),
        api.get('/api/units')
      ]);
      setProcurements(procRes.data);
      setFilteredProcurements(procRes.data);
      setFarmers(farmRes.data);
      setProducts(prodRes.data);
      setUnits(unitsRes.data || []);
      // Sync filters with applied range
      setFilters(prev => ({ ...prev, fromDate, toDate }));
      
      // Extract unique employees who have paid from current data
      // Check both procurement-level AND individual payments, including legacy (name-only) data
      const employeeMap = new Map(); // Keyed by employee NAME to combine entries
      procRes.data.forEach(p => {
        // Check procurement-level
        if (p.paid_by_type === 'employee' && p.paid_by) {
          const name = p.paid_by;
          const existing = employeeMap.get(name);
          // Prefer entries with real IDs over pseudo-IDs
          if (!existing || (p.paid_by_employee_id && existing.id.startsWith('name:'))) {
            employeeMap.set(name, { id: p.paid_by_employee_id || `name:${name}`, name });
          }
        }
        // Check individual payments
        const payments = p.payments || [];
        payments.forEach(payment => {
          if (payment.paid_by_type === 'employee' && payment.paid_by && !payment.is_reimbursement) {
            const name = payment.paid_by;
            const existing = employeeMap.get(name);
            if (!existing || (payment.paid_by_employee_id && existing.id.startsWith('name:'))) {
              employeeMap.set(name, { id: payment.paid_by_employee_id || `name:${name}`, name });
            }
          }
        });
      });
      
      // Merge with existing employees to avoid losing data on filter changes
      setPaidByEmployees(prev => {
        // Merge by NAME to keep best IDs
        const merged = new Map(prev.map(e => [e.name, e]));
        employeeMap.forEach((value, key) => {
          const existing = merged.get(key);
          if (!existing || (value.id && !value.id.startsWith('name:') && existing.id.startsWith('name:'))) {
            merged.set(key, value);
          }
        });
        return [...merged.values()];
      });
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
  
  // Load unique employees who have paid (one-time on mount)
  const loadPaidByEmployees = async () => {
    try {
      // Get procurements from last 6 months to find employees who have paid
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const fromDate = sixMonthsAgo.toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];
      
      const res = await api.get(`/api/procurement?from_date=${fromDate}&to_date=${toDate}`);
      
      // Extract employees from BOTH procurement-level AND individual payments
      // Use Map keyed by employee name (to combine entries with/without ID)
      const employeeMap = new Map();
      
      res.data.forEach(p => {
        // Check procurement-level paid_by
        if (p.paid_by_type === 'employee' && p.paid_by) {
          const name = p.paid_by;
          const id = p.paid_by_employee_id || `name:${name}`; // Use name as pseudo-ID for legacy
          // Keep the real ID if we've seen one, otherwise use pseudo-ID
          const existing = employeeMap.get(name);
          if (!existing || (p.paid_by_employee_id && existing.id.startsWith('name:'))) {
            employeeMap.set(name, { id: p.paid_by_employee_id || `name:${name}`, name });
          }
        }
        
        // Check individual payments array
        const payments = p.payments || [];
        payments.forEach(payment => {
          if (payment.paid_by_type === 'employee' && payment.paid_by && !payment.is_reimbursement) {
            const name = payment.paid_by;
            const id = payment.paid_by_employee_id || `name:${name}`;
            const existing = employeeMap.get(name);
            if (!existing || (payment.paid_by_employee_id && existing.id.startsWith('name:'))) {
              employeeMap.set(name, { id: payment.paid_by_employee_id || `name:${name}`, name });
            }
          }
        });
      });
      
      setPaidByEmployees([...employeeMap.values()]);
    } catch (error) {
      console.error('Error loading paid by employees:', error);
    }
  };
  
  // Load employees on mount
  useEffect(() => {
    loadPaidByEmployees();
  }, []);
  
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
    
    // Apply status filter
    if (filters.status) {
      filtered = filtered.filter(p => {
        const pending = p.pending_amount || 0;
        const paid = p.paid_amount || 0;
        const total = p.total_amount || 0;
        
        if (filters.status === 'paid') {
          return pending === 0 && paid >= total;
        } else if (filters.status === 'pending') {
          return paid === 0 && pending > 0;
        } else if (filters.status === 'partial') {
          return paid > 0 && pending > 0;
        }
        return true;
      });
    }

    // Apply Paid By filter - check both procurement-level AND individual payments
    // Also supports legacy data that has paid_by name but no paid_by_employee_id
    if (filters.paidBy) {
      // Determine if this is a pseudo-ID (name:XYZ) or real ID
      const isPseudoId = filters.paidBy.startsWith('name:');
      const selectedEmpName = isPseudoId 
        ? filters.paidBy.substring(5) // Extract name from "name:XYZ"
        : (filters.paidBy !== 'company' 
            ? paidByEmployees.find(e => e.id === filters.paidBy)?.name || null
            : null);
      
      filtered = filtered.filter(p => {
        // Check procurement-level paid_by_type
        let procLevelMatch = false;
        if (filters.paidBy === 'company') {
          procLevelMatch = p.paid_by_type === 'company';
        } else {
          // Match by employee ID (if present) OR by employee name (for legacy data)
          procLevelMatch = p.paid_by_type === 'employee' && (
            (!isPseudoId && p.paid_by_employee_id === filters.paidBy) ||
            (selectedEmpName && p.paid_by === selectedEmpName)
          );
        }
        
        // Also check individual payments array (if present)
        const payments = p.payments || [];
        const paymentMatch = payments.some(payment => {
          if (filters.paidBy === 'company') {
            return payment.paid_by_type === 'company' && !payment.is_reimbursement;
          } else {
            // Match by employee ID OR by name (for legacy payments)
            return payment.paid_by_type === 'employee' && 
                   !payment.is_reimbursement &&
                   ((!isPseudoId && payment.paid_by_employee_id === filters.paidBy) ||
                    (selectedEmpName && payment.paid_by === selectedEmpName));
          }
        });
        
        return procLevelMatch || paymentMatch;
      });
    }

    setFilteredProcurements(filtered);
  }, [filters, procurements, paidByEmployees]);

  const clearFilters = () => {
    setFilters({
      fromDate: '',
      toDate: '',
      farmerName: '',
      productName: '',
      status: '',
      paidBy: ''
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
    const product = newProducts[index];
    const unitsWithSize = ['Bunch', 'Packet', 'Piece'];
    const isUnitWithSize = unitsWithSize.includes(product.unit);
    
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
      // Reset unit_size if not a unit that supports sizing
      if (!unitsWithSize.includes(value)) {
        newProducts[index].unit_size = '';
      }
    } else if (field === 'quantity') {
      // Handle empty string for quantity
      newProducts[index][field] = value === '' ? '' : (parseFloat(value) || 0);
    } else if (field === 'rate') {
      // Handle empty string for rate
      newProducts[index][field] = value === '' ? '' : (parseFloat(value) || 0);
    } else if (field === 'total') {
      // Handle total field - mark it as user-edited
      newProducts[index][field] = value === '' ? '' : (parseFloat(value) || 0);
      newProducts[index]._totalEdited = true; // Track that total was manually edited
    } else {
      newProducts[index][field] = value;
    }
    
    // BIDIRECTIONAL CALCULATION LOGIC
    // For Kg-based units: qty, rate, total - any 2 calculates the 3rd
    // For Bunch/Piece/Packet: qty, unit_size, rate, total - any 3 calculates the 4th
    
    const qty = parseFloat(newProducts[index].quantity) || 0;
    const rate = parseFloat(newProducts[index].rate) || 0;
    const total = parseFloat(newProducts[index].total) || 0;
    
    const qtyEntered = newProducts[index].quantity !== '' && qty > 0;
    const rateEntered = newProducts[index].rate !== '' && rate > 0;
    const totalEntered = newProducts[index].total !== '' && total > 0 && newProducts[index]._totalEdited;
    
    if (!isUnitWithSize) {
      // REGULAR KG-BASED PRODUCTS: Any 2 of (qty, rate, total) calculates the 3rd
      if (field === 'quantity' || field === 'rate') {
        // User edited qty or rate -> calculate total
        if (qtyEntered && rateEntered) {
          newProducts[index].total = qty * rate;
          newProducts[index]._totalEdited = false;
        }
      } else if (field === 'total' && totalEntered) {
        // User edited total -> calculate rate (if qty exists) or qty (if rate exists)
        if (qtyEntered && qty > 0) {
          // Calculate rate = total / qty
          newProducts[index].rate = parseFloat((total / qty).toFixed(2));
        } else if (rateEntered && rate > 0) {
          // Calculate qty = total / rate
          newProducts[index].quantity = parseFloat((total / rate).toFixed(2));
        }
      }
    } else {
      // BUNCH/PIECE/PACKET PRODUCTS: Any 3 of (qty, unit_size, rate, total) calculates the 4th
      // For simplicity, total = qty * rate (unit_size is informational for display)
      if (field === 'quantity' || field === 'rate') {
        // User edited qty or rate -> calculate total
        if (qtyEntered && rateEntered) {
          newProducts[index].total = qty * rate;
          newProducts[index]._totalEdited = false;
        }
      } else if (field === 'total' && totalEntered) {
        // User edited total -> calculate rate (if qty exists) or qty (if rate exists)
        if (qtyEntered && qty > 0) {
          // Calculate rate = total / qty
          newProducts[index].rate = parseFloat((total / qty).toFixed(2));
        } else if (rateEntered && rate > 0) {
          // Calculate qty = total / rate
          newProducts[index].quantity = parseFloat((total / rate).toFixed(2));
        }
      }
    }
    
    // Calculate grand total and pending amount
    const grandTotal = newProducts.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
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
    const existingTotal = newProducts[index].total;
    const totalWasEdited = newProducts[index]._totalEdited;
    
    newProducts[index] = {
      ...newProducts[index],
      product_id: product.id,
      product_name: product.name,
      unit: product.unit || 'Kg',
      // Only set rate from product if user hasn't entered one
      rate: existingRate !== '' && existingRate !== 0 ? existingRate : (product.price_per_kg || '')
    };
    
    // Only recalculate total if it wasn't manually edited
    if (!totalWasEdited) {
      const qty = parseFloat(newProducts[index].quantity) || 0;
      const rate = parseFloat(newProducts[index].rate) || 0;
      newProducts[index].total = qty * rate;
    } else {
      // Preserve the manually edited total
      newProducts[index].total = existingTotal;
      newProducts[index]._totalEdited = true;
    }
    
    // Calculate grand total
    const grandTotal = newProducts.reduce((sum, p) => sum + (parseFloat(p.total) || 0), 0);
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
    
    // Validate Bunch, Packet, Piece have unit_size
    const unitsRequiringSize = ['Bunch', 'Packet', 'Piece'];
    const invalidSizeUnits = validProducts.filter(p => unitsRequiringSize.includes(p.unit) && !p.unit_size);
    if (invalidSizeUnits.length > 0) {
      toast.error('Please specify size (gm) for Bunch, Packet, and Piece items');
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
          remark: procurementForm.remark || '',
          // Payment details
          payment_date: procurementForm.payment_date || null,
          payment_mode: procurementForm.payment_mode || null,
          payment_reference: procurementForm.payment_reference || null,
          paid_by_type: procurementForm.paid_by_type || null,
          paid_by: procurementForm.paid_by || null,
          paid_by_employee_id: procurementForm.paid_by_employee_id || null,
          settlement_status: procurementForm.settlement_status || null
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

  const handleRecordPayment = async (procurement) => {
    setSelectedProcurement(procurement);
    setPaymentForm({
      amount: procurement.pending_amount || 0,
      payment_mode: 'cash',
      reference: '',
      remarks: '',
      paid_by_type: 'company',
      paid_by_employee_id: '',
      payment_date: new Date().toISOString().split('T')[0]
    });
    setOpenPayment(true);
    
    // Load existing payments for this procurement
    if (procurement.paid_amount > 0) {
      setLoadingPayments(true);
      try {
        const response = await api.get(`/api/procurement/${procurement.id}/payments`);
        setProcurementPayments(response.data || []);
      } catch (error) {
        console.error('Failed to load payments:', error);
        setProcurementPayments([]);
      } finally {
        setLoadingPayments(false);
      }
    } else {
      setProcurementPayments([]);
    }
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    
    // Validate transaction number for non-cash payments
    if (paymentForm.payment_mode !== 'cash' && !paymentForm.reference?.trim()) {
      toast.error('Transaction number is required for non-cash payments');
      return;
    }
    
    try {
      // Use new procurement payments API
      await api.post(`/api/procurement/${selectedProcurement.id}/payments`, {
        amount: paymentForm.amount,
        payment_date: paymentForm.payment_date || new Date().toISOString().split('T')[0],
        payment_mode: paymentForm.payment_mode,
        reference_number: paymentForm.reference || '',
        remarks: paymentForm.remarks || '',
        paid_by_type: paymentForm.paid_by_type,
        paid_by_employee_id: paymentForm.paid_by_employee_id || null
      });
      
      // Also record to general payments for farmer tracking (backward compatible)
      let paidByValue = 'Company';
      if (paymentForm.paid_by_type === 'employee' && paymentForm.paid_by_employee_id) {
        const emp = staffUsers.find(u => u.id === paymentForm.paid_by_employee_id);
        paidByValue = emp?.name || emp?.email || paymentForm.paid_by_employee_id;
      }
      
      await api.post('/api/payments', {
        date: new Date().toISOString(),
        party_type: 'farmer',
        party_id: selectedProcurement.farmer_id,
        party_name: selectedProcurement.farmer_name,
        amount: paymentForm.amount,
        payment_mode: paymentForm.payment_mode,
        reference: paymentForm.reference || `Payment for procurement on ${formatDate(selectedProcurement.date)}`,
        remarks: paymentForm.remarks || '',
        paid_by_type: paymentForm.paid_by_type,
        paid_by: paidByValue,
        paid_by_employee_id: paymentForm.paid_by_employee_id
      });
      
      toast.success('Payment recorded successfully');
      setOpenPayment(false);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  // View payment history for a procurement
  const openPaymentHistoryModal = async (procurement) => {
    setSelectedProcurement(procurement);
    setLoadingPayments(true);
    setShowPaymentHistoryModal(true);
    setOpenPayment(true);  // Also open the payment dialog to show payment history
    try {
      const response = await api.get(`/api/procurement/${procurement.id}/payments`);
      setProcurementPayments(response.data || []);
    } catch (error) {
      console.error('Failed to load payments:', error);
      setProcurementPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Edit a procurement payment
  const handleEditProcurementPayment = (payment) => {
    setEditingProcurementPayment(payment);
    setEditPaymentForm({
      amount: payment.amount?.toString() || '',
      payment_mode: payment.payment_mode || 'cash',
      reference_number: payment.reference_number || '',
      remarks: payment.remarks || '',
      payment_date: payment.payment_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      paid_by_type: payment.paid_by_type || 'company',
      paid_by_employee_id: payment.paid_by_employee_id || ''
    });
    setShowEditPaymentModal(true);
  };

  // Submit edited payment
  const handleSubmitEditPayment = async (e) => {
    e.preventDefault();
    if (!editingProcurementPayment || !editPaymentForm.amount) {
      toast.error('Please enter payment amount');
      return;
    }
    
    try {
      await api.put(`/api/procurement-payments/${editingProcurementPayment.id}`, {
        amount: parseFloat(editPaymentForm.amount),
        payment_mode: editPaymentForm.payment_mode,
        reference_number: editPaymentForm.reference_number,
        remarks: editPaymentForm.remarks,
        payment_date: editPaymentForm.payment_date,
        paid_by_type: editPaymentForm.paid_by_type,
        paid_by_employee_id: editPaymentForm.paid_by_employee_id || null
      });
      toast.success('Payment updated successfully');
      setShowEditPaymentModal(false);
      setEditingProcurementPayment(null);
      
      // Reload payment history
      if (selectedProcurement) {
        const response = await api.get(`/api/procurement/${selectedProcurement.id}/payments`);
        setProcurementPayments(response.data || []);
      }
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update payment');
    }
  };

  // Delete a procurement payment
  const handleDeleteProcurementPayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return;
    
    try {
      await api.delete(`/api/procurement-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      
      // Reload payment history
      if (selectedProcurement) {
        const response = await api.get(`/api/procurement/${selectedProcurement.id}/payments`);
        setProcurementPayments(response.data || []);
      }
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete payment');
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
      remark: procurement.remark || '',
      // Payment details for paid procurements
      payment_date: procurement.payment_date?.split('T')[0] || '',
      payment_mode: procurement.payment_mode || 'cash',
      payment_reference: procurement.payment_reference || '',
      paid_by_type: procurement.paid_by_type || 'company',
      paid_by: procurement.paid_by || 'Company',
      paid_by_employee_id: procurement.paid_by_employee_id || '',
      settlement_status: procurement.settlement_status || 'settled'
    });
    setOpenProcurement(true);
  };

  // Settlement functions for employee-paid procurements
  const openSettlementModal = (procurement) => {
    setSettlementProcurement(procurement);
    // Use paid_amount (what employee actually paid) instead of total_amount
    const employeePaidAmount = procurement.paid_amount || procurement.total_amount || 0;
    setSettlementForm({
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'bank_transfer',
      payment_reference: '',
      remarks: '',
      reimbursement_amount: employeePaidAmount  // Default to what employee paid
    });
    setShowSettlementModal(true);
  };

  const handleSettlementSubmit = async () => {
    if (!settlementProcurement) return;
    
    // Use paid_amount (what employee actually paid) for comparison
    const employeePaidAmount = settlementProcurement.paid_amount || settlementProcurement.total_amount || 0;
    const reimbursementAmount = settlementForm.reimbursement_amount || employeePaidAmount;
    
    // Validate reimbursement amount
    if (reimbursementAmount <= 0) {
      toast.error('Please enter a valid reimbursement amount');
      return;
    }
    
    try {
      // Calculate if there's excess (credit) for the employee
      const excessAmount = reimbursementAmount > employeePaidAmount ? reimbursementAmount - employeePaidAmount : 0;
      const isFullyReimbursed = reimbursementAmount >= employeePaidAmount;
      
      await api.put(`/api/procurement/${settlementProcurement.id}`, {
        settlement_status: isFullyReimbursed ? 'settled' : 'partial_reimbursement',
        settlement_date: settlementForm.payment_date,
        settlement_mode: settlementForm.payment_mode,
        settlement_reference: settlementForm.payment_reference,
        settlement_remarks: settlementForm.remarks,
        reimbursement_amount: reimbursementAmount,
        employee_credit_amount: excessAmount,
        is_settled: isFullyReimbursed
      });
      
      if (excessAmount > 0) {
        toast.success(`Reimbursement recorded! Employee credit: ₹${excessAmount.toLocaleString('en-IN')}`);
      } else if (isFullyReimbursed) {
        toast.success('Full reimbursement recorded successfully');
      } else {
        toast.success(`Partial reimbursement of ₹${reimbursementAmount.toLocaleString('en-IN')} recorded`);
      }
      
      setShowSettlementModal(false);
      setSettlementProcurement(null);
      loadData();
    } catch (error) {
      console.error('Settlement error:', error);
      toast.error('Failed to record reimbursement');
    }
  };

  const toggleSettlementSelection = (procId) => {
    setSelectedForSettlement(prev => 
      prev.includes(procId) 
        ? prev.filter(id => id !== procId)
        : [...prev, procId]
    );
  };

  const handleBulkSettlement = async () => {
    if (selectedForSettlement.length === 0) {
      toast.error('No procurements selected');
      return;
    }
    
    try {
      for (const procId of selectedForSettlement) {
        await api.put(`/api/procurement/${procId}`, {
          settlement_status: 'settled',
          settlement_date: new Date().toISOString().split('T')[0],
          is_settled: true
        });
      }
      toast.success(`${selectedForSettlement.length} procurements settled`);
      setSelectedForSettlement([]);
      loadData();
    } catch (error) {
      console.error('Bulk settlement error:', error);
      toast.error('Failed to settle procurements');
    }
  };

  // Get unsettled employee-paid procurements (includes both paid and partial)
  const unsettledEmployeeProcurements = procurements.filter(
    p => p.paid_by_type === 'employee' && p.settlement_status !== 'settled' && (p.payment_status === 'paid' || p.payment_status === 'partial')
  );

  // Group unsettled procurements by employee for bulk reimbursement
  // Normalize employee names to handle case sensitivity and minor variations
  const getEmployeesWithPendingReimbursements = useCallback(() => {
    const employeeMap = {};
    
    // Helper function to normalize employee name for grouping
    const normalizeEmployeeName = (name) => {
      if (!name) return 'unknown';
      return name.toLowerCase().trim().replace(/\s+/g, ' ');
    };
    
    // Helper function to get the best display name (most complete/proper case)
    const getBestDisplayName = (names) => {
      // Prefer the longest name or the one with proper capitalization
      return names.reduce((best, current) => {
        if (!best) return current;
        // Prefer longer names (more complete)
        if (current.length > best.length) return current;
        // Prefer properly capitalized names
        if (current[0] === current[0].toUpperCase() && best[0] !== best[0].toUpperCase()) return current;
        return best;
      }, null);
    };
    
    unsettledEmployeeProcurements.forEach(proc => {
      const employeeName = proc.paid_by || 'Unknown Employee';
      const normalizedName = normalizeEmployeeName(employeeName);
      
      if (!employeeMap[normalizedName]) {
        employeeMap[normalizedName] = {
          id: proc.paid_by_employee_id || normalizedName,
          names: [employeeName], // Track all name variations
          procurements: [],
          total_pending: 0
        };
      } else {
        // Track name variations for display
        if (!employeeMap[normalizedName].names.includes(employeeName)) {
          employeeMap[normalizedName].names.push(employeeName);
        }
      }
      
      // Calculate remaining amount to reimburse
      const amountPaid = proc.paid_amount || 0;
      const alreadyReimbursed = proc.reimbursement_amount || 0;
      const remainingToReimburse = amountPaid - alreadyReimbursed;
      
      if (remainingToReimburse > 0) {
        employeeMap[normalizedName].procurements.push({
          ...proc,
          remaining_to_reimburse: remainingToReimburse
        });
        employeeMap[normalizedName].total_pending += remainingToReimburse;
      }
    });
    
    // Set display name using the best variation
    return Object.values(employeeMap)
      .filter(emp => emp.total_pending > 0)
      .map(emp => ({
        ...emp,
        name: getBestDisplayName(emp.names)
      }))
      .sort((a, b) => b.total_pending - a.total_pending);
  }, [unsettledEmployeeProcurements]);

  // Open employee reimbursement modal
  const openEmployeeReimbursementModal = (employee) => {
    setSelectedEmployeeForReimbursement(employee);
    setEmployeeReimbursementForm({
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Bank Transfer',
      payment_reference: '',
      remarks: '',
      custom_amount: ''
    });
    setShowEmployeeReimbursementModal(true);
  };

  // Handle employee bulk reimbursement with oldest-first allocation
  const handleEmployeeBulkReimbursement = async () => {
    if (!selectedEmployeeForReimbursement) return;
    
    // Validate transaction reference for non-cash payments
    if (employeeReimbursementForm.payment_mode !== 'Cash' && !employeeReimbursementForm.payment_reference?.trim()) {
      toast.error('Transaction Reference is required for non-cash payments');
      return;
    }
    
    const reimbursementAmount = employeeReimbursementForm.custom_amount 
      ? parseFloat(employeeReimbursementForm.custom_amount) 
      : selectedEmployeeForReimbursement.total_pending;
    
    if (reimbursementAmount <= 0) {
      toast.error('Reimbursement amount must be greater than 0');
      return;
    }
    
    try {
      // Sort procurements by date (oldest first)
      const sortedProcurements = [...selectedEmployeeForReimbursement.procurements].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
      
      let remainingReimbursement = reimbursementAmount;
      const settlementReference = employeeReimbursementForm.payment_reference || `REIMB-PROC-${Date.now()}`;
      let settledCount = 0;
      let partialCount = 0;
      
      for (const proc of sortedProcurements) {
        if (remainingReimbursement <= 0) break;
        
        const procRemaining = proc.remaining_to_reimburse || ((proc.paid_amount || 0) - (proc.reimbursement_amount || 0));
        const reimburseAmount = Math.min(remainingReimbursement, procRemaining);
        
        if (reimburseAmount > 0) {
          const newTotalReimbursed = (proc.reimbursement_amount || 0) + reimburseAmount;
          const isFullySettled = Math.abs(newTotalReimbursed - (proc.paid_amount || 0)) < 0.01;
          
          // Update the procurement record
          await api.put(`/api/procurement/${proc.id}`, {
            reimbursement_amount: newTotalReimbursed,
            settlement_status: isFullySettled ? 'settled' : 'partial_reimbursement',
            settlement_date: employeeReimbursementForm.payment_date,
            settlement_mode: employeeReimbursementForm.payment_mode,
            settlement_reference: settlementReference,
            settlement_remarks: employeeReimbursementForm.remarks,
            is_settled: isFullySettled
          });
          
          // Create a payment record for the employee reimbursement in procurement_payments
          await api.post(`/api/procurement/${proc.id}/payments`, {
            amount: reimburseAmount,
            payment_date: employeeReimbursementForm.payment_date,
            payment_mode: employeeReimbursementForm.payment_mode,
            reference_number: settlementReference,
            remarks: `Employee reimbursement to ${selectedEmployeeForReimbursement.name}`,
            paid_by_type: 'company',
            paid_by_employee_id: null,
            is_reimbursement: true,
            reimbursed_to: selectedEmployeeForReimbursement.name,
            reimbursed_to_employee_id: selectedEmployeeForReimbursement.id
          });
          
          if (isFullySettled) settledCount++;
          else partialCount++;
          
          remainingReimbursement -= reimburseAmount;
        }
      }
      
      let successMsg = `Reimbursed ₹${reimbursementAmount.toLocaleString('en-IN')} to ${selectedEmployeeForReimbursement.name}. `;
      if (settledCount > 0) successMsg += `${settledCount} fully settled. `;
      if (partialCount > 0) successMsg += `${partialCount} partially settled.`;
      
      toast.success(successMsg);
      setShowEmployeeReimbursementModal(false);
      setSelectedEmployeeForReimbursement(null);
      loadData();
    } catch (error) {
      console.error('Employee bulk reimbursement error:', error);
      toast.error('Failed to record reimbursement');
    }
  };

  // Fix legacy employee payments data (migration)
  const handleFixLegacyData = async () => {
    if (!window.confirm('This will scan all procurements and fix employee payment tracking for historical data. Continue?')) {
      return;
    }
    
    setFixingLegacyData(true);
    try {
      const response = await api.post('/api/procurement/fix-legacy-employee-payments');
      toast.success(`Fixed ${response.data.fixed} procurements. ${response.data.skipped} were already correct.`);
      loadData(); // Reload to see updated data
    } catch (error) {
      console.error('Fix legacy data error:', error);
      toast.error('Failed to fix legacy data');
    } finally {
      setFixingLegacyData(false);
    }
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
      proc.products?.forEach((item, idx) => {
        dataToExport.push({
          date: proc.date,
          farmer: proc.farmer_name,
          product: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_size: item.unit_size || '-',
          rate: item.rate,
          total: item.total,
          // Only show procurement-level values on first line item to avoid summing issues
          payment_status: idx === 0 ? proc.payment_status : '',
          paid_amount: idx === 0 ? (proc.paid_amount || 0) : '',
          pending: idx === 0 ? (proc.pending_amount || 0) : '',
          procurement_total: idx === 0 ? (proc.total_amount || 0) : ''
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
      { label: 'Product Total', getter: (d) => d.total },
      { label: 'Procurement Total', getter: (d) => d.procurement_total },
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

  // ==================== PDF DOWNLOAD BY FARMER ====================
  const downloadFarmerPurchasePDF = () => {
    // Use selected procurements if any, otherwise use all filtered
    const procurementsToExport = selectedForPDF.length > 0 
      ? filteredProcurements.filter(p => selectedForPDF.includes(p.id))
      : filteredProcurements;
    
    if (procurementsToExport.length === 0) {
      toast.error('No purchases to download. Select items or apply date filters.');
      return;
    }
    
    // Group procurements by farmer, then by date
    const byFarmer = {};
    procurementsToExport.forEach(proc => {
      const farmerName = proc.farmer_name || 'Unknown';
      const procDate = formatDate(proc.date);
      
      if (!byFarmer[farmerName]) {
        byFarmer[farmerName] = {
          name: farmerName,
          contact: proc.farmer_contact || '',
          address: '', // Can be added if available
          dates: {},
          grandTotal: 0
        };
      }
      
      if (!byFarmer[farmerName].dates[procDate]) {
        byFarmer[farmerName].dates[procDate] = {
          date: procDate,
          items: [],
          dateTotal: 0,
          procurementIds: []
        };
      }
      
      proc.products?.forEach(item => {
        byFarmer[farmerName].dates[procDate].items.push({
          product: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unitSize: item.unit_size,
          rate: item.rate,
          total: item.total
        });
        byFarmer[farmerName].dates[procDate].dateTotal += (item.total || 0);
        byFarmer[farmerName].grandTotal += (item.total || 0);
      });
      byFarmer[farmerName].dates[procDate].procurementIds.push(proc.id);
    });
    
    const farmerList = Object.values(byFarmer);
    
    if (farmerList.length === 0) {
      toast.error('No farmer data found');
      return;
    }
    
    // Generate receipt number (based on timestamp)
    const generateReceiptNo = (farmerName, date) => {
      const dateStr = date.replace(/\s/g, '').replace(/,/g, '');
      const farmerInitials = farmerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 3);
      return `PUR-${farmerInitials}-${dateStr}`;
    };
    
    // Generate HTML for each farmer with separate pages per date
    let htmlContent = '';
    let pageNum = 0;
    
    farmerList.forEach((farmer) => {
      const datesList = Object.values(farmer.dates).sort((a, b) => 
        new Date(a.date) - new Date(b.date)
      );
      
      const totalDates = datesList.length;
      let runningTotal = 0;
      
      datesList.forEach((dateData, dateIdx) => {
        const pageBreak = pageNum > 0 ? 'page-break-before: always;' : '';
        pageNum++;
        
        const isLastPage = dateIdx === totalDates - 1;
        runningTotal += dateData.dateTotal;
        
        const receiptNo = generateReceiptNo(farmer.name, dateData.date);
        
        // Page indicator for multi-page receipts
        const pageIndicator = totalDates > 1 ? `<p style="margin: 5px 0 0 0; font-size: 10px; color: #666;">Page ${dateIdx + 1} of ${totalDates}</p>` : '';
        
        htmlContent += `
          <div style="${pageBreak} padding: 25px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
            <!-- Header -->
            <div style="border-bottom: 3px solid #14532D; padding-bottom: 15px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h1 style="margin: 0; color: #14532D; font-size: 28px; font-weight: bold;">Mr Organix</h1>
                  <p style="margin: 5px 0 0 0; color: #666; font-size: 11px;">Fresh Fruits & Vegetables</p>
                </div>
                <div style="text-align: right;">
                  <h2 style="margin: 0; color: #14532D; font-size: 18px; font-weight: bold;">PURCHASE RECEIPT</h2>
                  <p style="margin: 5px 0 0 0; font-size: 12px; color: #333;"><strong>Receipt No:</strong> ${receiptNo}</p>
                  ${pageIndicator}
                </div>
              </div>
            </div>
            
            <!-- Receipt Info Row -->
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 5px;">
              <div style="flex: 1;">
                <p style="margin: 0 0 5px 0; font-size: 11px; color: #666; text-transform: uppercase;">Supplier / Farmer</p>
                <p style="margin: 0; font-size: 16px; font-weight: bold; color: #14532D;">${farmer.name}</p>
                ${farmer.contact ? `<p style="margin: 5px 0 0 0; font-size: 12px; color: #333;">📞 ${farmer.contact}</p>` : ''}
              </div>
              <div style="text-align: right;">
                <p style="margin: 0 0 5px 0; font-size: 11px; color: #666; text-transform: uppercase;">Purchase Date</p>
                <p style="margin: 0; font-size: 16px; font-weight: bold; color: #333;">${dateData.date}</p>
              </div>
            </div>
            
            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
              <thead>
                <tr style="background: #14532D; color: white;">
                  <th style="padding: 10px 8px; text-align: center; border: 1px solid #0f4024; width: 50px;">S.No</th>
                  <th style="padding: 10px 8px; text-align: left; border: 1px solid #0f4024;">Product / Item</th>
                  <th style="padding: 10px 8px; text-align: center; border: 1px solid #0f4024; width: 100px;">Quantity</th>
                  <th style="padding: 10px 8px; text-align: right; border: 1px solid #0f4024; width: 100px;">Rate (₹)</th>
                  <th style="padding: 10px 8px; text-align: right; border: 1px solid #0f4024; width: 120px;">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${dateData.items.map((item, idx) => `
                  <tr style="background: ${idx % 2 === 0 ? '#fff' : '#f9fafb'};">
                    <td style="padding: 10px 8px; text-align: center; border: 1px solid #e5e7eb;">${idx + 1}</td>
                    <td style="padding: 10px 8px; border: 1px solid #e5e7eb; font-weight: 500;">${item.product}</td>
                    <td style="padding: 10px 8px; text-align: center; border: 1px solid #e5e7eb;">${item.quantity} ${item.unit}${item.unitSize ? ` (${item.unitSize}gm)` : ''}</td>
                    <td style="padding: 10px 8px; text-align: right; border: 1px solid #e5e7eb;">₹${item.rate?.toFixed(2)}</td>
                    <td style="padding: 10px 8px; text-align: right; border: 1px solid #e5e7eb; font-weight: 600;">₹${item.total?.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                ${!isLastPage ? `
                  <!-- Sub-total for non-last pages -->
                  <tr style="background: #f3f4f6;">
                    <td colspan="4" style="padding: 10px 8px; text-align: right; border: 1px solid #e5e7eb; font-weight: 500; font-size: 12px; color: #666;">
                      Sub-total (${dateData.date}):
                    </td>
                    <td style="padding: 10px 8px; text-align: right; border: 1px solid #e5e7eb; font-weight: 500; font-size: 14px; color: #666;">
                      ₹${dateData.dateTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr style="background: #e0e7ff;">
                    <td colspan="5" style="padding: 8px; text-align: center; border: 1px solid #c7d2fe; font-style: italic; color: #4f46e5; font-size: 11px;">
                      Continued on next page...
                    </td>
                  </tr>
                ` : `
                  <!-- Grand Total only on last page -->
                  ${totalDates > 1 ? `
                    <tr style="background: #f3f4f6;">
                      <td colspan="4" style="padding: 10px 8px; text-align: right; border: 1px solid #e5e7eb; font-weight: 500; font-size: 12px; color: #666;">
                        Sub-total (${dateData.date}):
                      </td>
                      <td style="padding: 10px 8px; text-align: right; border: 1px solid #e5e7eb; font-weight: 500; font-size: 14px; color: #666;">
                        ₹${dateData.dateTotal.toFixed(2)}
                      </td>
                    </tr>
                  ` : ''}
                  <tr style="background: #dcfce7;">
                    <td colspan="4" style="padding: 12px 8px; text-align: right; border: 1px solid #bbf7d0; font-weight: bold; font-size: 14px;">
                      ${totalDates > 1 ? 'GRAND TOTAL:' : 'Total Amount:'}
                    </td>
                    <td style="padding: 12px 8px; text-align: right; border: 1px solid #bbf7d0; font-weight: bold; font-size: 16px; color: #14532D;">
                      ₹${farmer.grandTotal.toFixed(2)}
                    </td>
                  </tr>
                `}
              </tfoot>
            </table>
            
            ${isLastPage ? `
              <!-- Amount in Words - Only on last page -->
              <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 10px 15px; border-radius: 5px; margin-bottom: 25px;">
                <p style="margin: 0; font-size: 12px;">
                  <strong>Amount in Words:</strong> ${numberToWords(farmer.grandTotal)} Rupees Only
                </p>
              </div>
              
              <!-- Signature Section - Only on last page -->
              <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px;">
                <div style="text-align: center; width: 200px;">
                  <div style="border-top: 1px solid #333; padding-top: 8px;">
                    <p style="margin: 0; font-size: 11px; color: #666;">Supplier Signature</p>
                  </div>
                </div>
                <div style="text-align: center; width: 200px;">
                  <div style="border-top: 1px solid #333; padding-top: 8px;">
                    <p style="margin: 0; font-size: 11px; color: #666;">Authorized Signature</p>
                  </div>
                </div>
              </div>
            ` : ''}
            
            <!-- Footer -->
            <div style="margin-top: 30px; padding-top: 15px; border-top: 1px dashed #ccc; text-align: center;">
              <p style="margin: 0; font-size: 10px; color: #999;">
                This is a computer-generated receipt. Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              ${isLastPage ? `
                <p style="margin: 5px 0 0 0; font-size: 10px; color: #666;">
                  Thank you for your business!
                </p>
              ` : ''}
            </div>
          </div>
        `;
      });
    });
    
    // Helper function to convert number to words
    function numberToWords(num) {
      if (num === 0) return 'Zero';
      
      const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      
      const numStr = Math.floor(num).toString();
      
      if (num < 0) return 'Negative ' + numberToWords(-num);
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
      if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
      if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
      return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
    }
    
    // Create print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Purchase Receipt - Mr Organix</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 0; }
            @media print {
              body { margin: 0; }
              @page { margin: 10mm; size: A4; }
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Auto-trigger print dialog
    setTimeout(() => {
      printWindow.print();
    }, 500);
    
    const selectedCount = selectedForPDF.length > 0 ? selectedForPDF.length : procurementsToExport.length;
    toast.success(`Generated ${pageNum} receipt(s) for ${farmerList.length} farmer(s)`);
    
    // Clear selection after download
    if (selectedForPDF.length > 0) {
      setSelectedForPDF([]);
    }
  };
  
  // Toggle PDF selection for a single procurement
  const togglePDFSelection = (procId) => {
    setSelectedForPDF(prev => 
      prev.includes(procId) 
        ? prev.filter(id => id !== procId)
        : [...prev, procId]
    );
  };
  
  // Toggle all PDF selections
  const toggleAllPDFSelection = () => {
    if (selectedForPDF.length === filteredProcurements.length) {
      setSelectedForPDF([]);
    } else {
      setSelectedForPDF(filteredProcurements.map(p => p.id));
    }
  };

  const getUnitLabel = (unit, unitSize) => {
    // Show unit size for Bunch, Packet, and Piece
    const unitsWithSize = ['Bunch', 'Packet', 'Piece'];
    if (unitsWithSize.includes(unit) && unitSize) {
      return `${unit} (${unitSize}gm)`;
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
  
  // Computed stats based on date filter
  const getFilteredStats = useMemo(() => {
    let filtered = procurements;
    
    // Apply date filters if set - normalize dates for proper comparison
    if (filters.fromDate) {
      const fromDateNorm = filters.fromDate.split('T')[0];
      filtered = filtered.filter(p => {
        const pDateNorm = (p.date || '').split('T')[0];
        return pDateNorm >= fromDateNorm;
      });
    }
    if (filters.toDate) {
      const toDateNorm = filters.toDate.split('T')[0];
      filtered = filtered.filter(p => {
        const pDateNorm = (p.date || '').split('T')[0];
        return pDateNorm <= toDateNorm;
      });
    }
    
    // Apply status filter
    if (filters.status) {
      filtered = filtered.filter(p => {
        const pending = p.pending_amount || 0;
        const paid = p.paid_amount || 0;
        const total = p.total_amount || 0;
        
        if (filters.status === 'paid') {
          return pending === 0 && paid >= total;
        } else if (filters.status === 'pending') {
          return paid === 0 && pending > 0;
        } else if (filters.status === 'partial') {
          return paid > 0 && pending > 0;
        }
        return true;
      });
    }
    
    // Get unique farmer IDs in filtered procurements
    const uniqueFarmerIds = new Set(filtered.map(p => p.farmer_id));
    
    // Calculate totals for filtered procurements
    const totalPurchaseAmount = filtered.reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const totalPaidAmount = filtered.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
    const totalPendingAmount = filtered.reduce((sum, p) => sum + (p.pending_amount || 0), 0);
    
    return {
      farmersCount: uniqueFarmerIds.size,
      purchasesCount: filtered.length,
      totalAmount: totalPurchaseAmount,
      paidAmount: totalPaidAmount,
      pendingAmount: totalPendingAmount
    };
  }, [procurements, filters.fromDate, filters.toDate, filters.status]);

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
      // Calculate actual pending as total - paid (don't use stale pending_amount from DB)
      const actualPending = (p.total_amount || 0) - (p.paid_amount || 0);
      farmerMap[p.farmer_id].purchase_count += 1;
      // Add ALL purchases to the list (not just those with pending > 0)
      // This ensures Date-wise Purchase Summary shows all purchases in the range
      farmerMap[p.farmer_id].purchases.push({
        ...p,
        // Override pending_amount with calculated value
        pending_amount: actualPending
      });
    });

    // Recalculate pending_amount for each farmer as total - paid
    Object.values(farmerMap).forEach(f => {
      f.pending_amount = Math.max(0, f.total_amount - f.paid_amount);
      // Sort purchases by date descending (newest first)
      f.purchases.sort((a, b) => new Date(b.date) - new Date(a.date));
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

    // Validate transaction reference for non-cash payments
    if (bulkPaymentForm.payment_mode !== 'cash' && !bulkPaymentForm.reference?.trim()) {
      toast.error('Transaction Reference is required for non-cash payments');
      return;
    }

    try {
      const paymentDate = new Date().toISOString().split('T')[0];
      const bulkPaymentReference = bulkPaymentForm.reference || `BULK-${Date.now()}`;
      
      // Calculate total pending
      const totalPending = selectedFarmersForPayment.reduce((sum, f) => {
        const hasPartialAmounts = f.partial_amounts && Object.keys(f.partial_amounts).length > 0;
        return sum + (hasPartialAmounts 
          ? Object.values(f.partial_amounts).reduce((s, a) => s + a, 0)
          : f.pending_amount);
      }, 0);
      
      // Get the payment amount (custom or total pending)
      const paymentAmount = bulkPaymentForm.custom_amount 
        ? parseFloat(bulkPaymentForm.custom_amount) 
        : totalPending;
      
      if (paymentAmount <= 0) {
        toast.error('Payment amount must be greater than 0');
        return;
      }
      
      // Collect all purchases from all farmers, sorted by date (oldest first)
      let allPurchases = [];
      for (const farmerData of selectedFarmersForPayment) {
        for (const purchase of farmerData.purchases) {
          if ((purchase.pending_amount || 0) > 0) {
            allPurchases.push({
              ...purchase,
              farmer_name: farmerData.farmer_name,
              farmer_id: farmerData.farmer_id
            });
          }
        }
      }
      
      // Sort by date (oldest first)
      allPurchases.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Auto-allocate payment to oldest entries first
      let remainingPayment = paymentAmount;
      const paymentsToProcess = [];
      
      for (const purchase of allPurchases) {
        if (remainingPayment <= 0) break;
        
        const purchasePending = purchase.pending_amount || 0;
        const payAmount = Math.min(remainingPayment, purchasePending);
        
        if (payAmount > 0) {
          paymentsToProcess.push({
            purchase,
            payAmount,
            isFullPayment: Math.abs(payAmount - purchasePending) < 0.01
          });
          remainingPayment -= payAmount;
        }
      }
      
      // Process payments
      for (const { purchase, payAmount } of paymentsToProcess) {
        // Create payment record in procurement_payments collection
        await api.post(`/api/procurement/${purchase.id}/payments`, {
          amount: payAmount,
          payment_date: paymentDate,
          payment_mode: bulkPaymentForm.payment_mode,
          reference_number: bulkPaymentReference,
          remarks: bulkPaymentForm.remarks || `Bulk payment for ${purchase.farmer_name}`,
          paid_by_type: 'company',
          paid_by_employee_id: null,
          is_bulk_payment: true,
          bulk_payment_reference: bulkPaymentReference
        });
        
        // Also record to general payments for farmer tracking
        await api.post('/api/payments', {
          date: new Date().toISOString(),
          party_type: 'farmer',
          party_id: purchase.farmer_id,
          party_name: purchase.farmer_name,
          amount: payAmount,
          payment_mode: bulkPaymentForm.payment_mode,
          reference: bulkPaymentReference,
          remarks: bulkPaymentForm.remarks || `Bulk payment for procurement on ${formatDate(purchase.date)}`,
          paid_by_type: 'company',
          paid_by: 'Company',
          is_bulk_payment: true
        });
      }
      
      const totalFarmers = [...new Set(paymentsToProcess.map(p => p.purchase.farmer_id))].length;
      const fullPayments = paymentsToProcess.filter(p => p.isFullPayment).length;
      const partialPayments = paymentsToProcess.length - fullPayments;
      
      let successMsg = `Payment of ₹${paymentAmount.toFixed(2)} recorded. `;
      if (fullPayments > 0) successMsg += `${fullPayments} entries fully paid. `;
      if (partialPayments > 0) successMsg += `${partialPayments} entries partially paid.`;
      
      toast.success(successMsg);
      setOpenBulkPayment(false);
      setSelectedFarmersForPayment([]);
      setSelectedPurchasesForPayment([]);
      setPartialPaymentAmounts({});
      setBulkPaymentForm({ payment_mode: 'cash', reference: '', remarks: '', custom_amount: '' });
      loadData();
    } catch (error) {
      console.error('Bulk payment error:', error);
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
            style={{ width: '95vw', maxWidth: 'min(900px, 95vw)', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}
            onInteractOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editMode ? t('procurement.editPurchase') : t('procurement.recordPurchase')}</DialogTitle>
            </DialogHeader>
            
            {/* Previous Day Procurements Section - NEW DESIGN: Editable Table with Checkboxes */}
            {!editMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg mb-4">
                {/* Date Picker Row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-4 pb-3 border-b border-amber-200">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-amber-800 whitespace-nowrap">Record purchases for:</label>
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
                    <div className="flex flex-col gap-2 p-4 pb-0">
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
                    <div className="px-4 mb-3">
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
                
                {/* Editable Table with horizontal scroll for mobile */}
                <div className="px-2 sm:px-4 pb-4">
                  <div 
                    className="bg-white rounded border max-h-80 overflow-auto"
                    style={{ 
                      WebkitOverflowScrolling: 'touch',
                      maxWidth: '100%',
                      display: 'block'
                    }}
                  >
                    <table className="text-sm border-collapse" style={{ minWidth: '750px', tableLayout: 'fixed' }}>
                      <thead className="bg-amber-100 sticky top-0">
                      <tr>
                        <th className="p-2 w-10 text-center">#</th>
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
                      {(() => {
                        let rowNum = 0;
                        return previousDayProcurements.map((proc, procIdx) => 
                        proc.products?.filter(p => {
                          // Filter by search term
                          if (!yesterdaySearchTerm) return true;
                          const searchLower = yesterdaySearchTerm.toLowerCase();
                          const farmerMatch = proc.farmer_name?.toLowerCase().includes(searchLower);
                          const productMatch = p.product_name?.toLowerCase().includes(searchLower);
                          return farmerMatch || productMatch;
                        }).map((p, pIdx) => {
                          rowNum++;
                          const itemKey = `${proc.farmer_id}-${p.product_id}`;
                          const itemIndex = yesterdayItems.findIndex(i => i.farmer_id === proc.farmer_id && i.product_id === p.product_id);
                          const item = itemIndex >= 0 ? yesterdayItems[itemIndex] : null;
                          const isSelected = item?.selected || false;
                          const currentRowNum = rowNum;
                          
                          return (
                            <tr key={itemKey} className={`border-b ${isSelected ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                              <td className="p-2 text-center text-gray-400 text-xs">{currentRowNum}</td>
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
                      )})()}
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
                  </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-amber-700 px-4">
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
              <div className="bg-white rounded border overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left font-medium text-gray-600" style={{ width: '180px' }}>{t('procurement.farmer')}</th>
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
                        {/* Size (for Bunch, Packet, Piece) */}
                        <td className="p-2">
                          {['Bunch', 'Packet', 'Piece'].includes(product.unit) ? (
                            <Input
                              type="text"
                              placeholder="gm"
                              className="h-7 text-xs text-center"
                              data-testid={`size-input-${index}`}
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
                        {/* Total - Now Editable for bidirectional calculation */}
                        <td className="p-2">
                          <Input
                            type="number"
                            step="1"
                            placeholder="0"
                            className="h-7 text-xs text-center font-semibold text-green-700"
                            data-testid={`total-input-${index}`}
                            value={product.total || ''}
                            onChange={(e) => handleProductChange(index, 'total', e.target.value)}
                          />
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
              <div className="bg-gray-50 p-3 rounded-lg border">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <div className="text-sm">
                    <span className="text-gray-600">{t('procurement.totalAmount')}:</span>
                    <span className="ml-1 font-bold text-[#14532D]" data-testid="grand-total">
                      ₹{procurementForm.total_amount.toFixed(0)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">{t('procurement.paidAmount')}:</span>
                    <span className="ml-1 font-semibold text-green-700">
                      ₹{(procurementForm.paid_amount || 0).toFixed(0)}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">{t('procurement.pendingAmount')}:</span>
                    <span className="ml-1 font-semibold text-red-600" data-testid="pending-amount-display">
                      ₹{procurementForm.pending_amount.toFixed(0)}
                    </span>
                  </div>
                  {procurementForm.payment_status !== 'pending' && (
                    <span className={`text-xs px-2 py-1 rounded ${procurementForm.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {procurementForm.payment_status.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Payment Details for Paid/Partial Procurements */}
              {editMode && (procurementForm.payment_status === 'paid' || procurementForm.payment_status === 'partial' || procurementForm.paid_amount > 0) && (
                <div className="border-t pt-3 mt-2 overflow-hidden">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <h4 className="text-sm font-semibold text-gray-700 flex-shrink-0">Payment Details</h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs whitespace-nowrap"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this payment? This will reset the procurement to unpaid status.')) {
                          setProcurementForm(prev => ({
                            ...prev,
                            paid_amount: 0,
                            pending_amount: prev.total_amount || 0,
                            payment_status: 'pending',
                            payment_date: null,
                            payment_mode: null,
                            payment_reference: null,
                            paid_by_type: null,
                            paid_by: null,
                            paid_by_employee_id: null,
                            settlement_status: null
                          }));
                          toast.success('Payment cleared. Click "Edit Purchase" to save changes.');
                        }
                      }}
                    >
                      <Trash2 size={14} /> Delete Payment
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-500">Paid Amount *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={procurementForm.paid_amount || ''}
                        onChange={(e) => {
                          const newPaidAmount = parseFloat(e.target.value) || 0;
                          const totalAmount = procurementForm.total_amount || 0;
                          const newPending = Math.max(0, totalAmount - newPaidAmount);
                          let newStatus = 'pending';
                          if (newPaidAmount >= totalAmount) newStatus = 'paid';
                          else if (newPaidAmount > 0) newStatus = 'partial';
                          
                          setProcurementForm(prev => ({ 
                            ...prev, 
                            paid_amount: newPaidAmount,
                            pending_amount: newPending,
                            payment_status: newStatus
                          }));
                        }}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Payment Date</Label>
                      <Input
                        type="date"
                        value={procurementForm.payment_date || ''}
                        onChange={(e) => setProcurementForm(prev => ({ ...prev, payment_date: e.target.value }))}
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Payment Mode</Label>
                      <Select 
                        value={procurementForm.payment_mode || 'cash'} 
                        onValueChange={(v) => setProcurementForm(prev => ({ ...prev, payment_mode: v }))}
                      >
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
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
                      <Label className="text-xs text-gray-500">Paid By</Label>
                      <Select 
                        value={procurementForm.paid_by_type || 'company'} 
                        onValueChange={(v) => {
                          if (v === 'company') {
                            setProcurementForm(prev => ({ 
                              ...prev, 
                              paid_by_type: v, 
                              paid_by: 'Company',
                              paid_by_employee_id: '',
                              settlement_status: 'settled'
                            }));
                          } else {
                            setProcurementForm(prev => ({ 
                              ...prev, 
                              paid_by_type: v,
                              settlement_status: 'pending_reimbursement'
                            }));
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company">Company</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {procurementForm.paid_by_type === 'employee' && (
                      <div>
                        <Label className="text-xs text-gray-500">Employee Name</Label>
                        <Select 
                          value={procurementForm.paid_by_employee_id || ''} 
                          onValueChange={(v) => {
                            const emp = staffUsers.find(u => u.id === v);
                            setProcurementForm(prev => ({ 
                              ...prev, 
                              paid_by_employee_id: v,
                              paid_by: emp?.name || emp?.email || v,
                              settlement_status: 'pending_reimbursement'
                            }));
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm mt-1">
                            <SelectValue placeholder="Select employee" />
                          </SelectTrigger>
                          <SelectContent>
                            {staffUsers.map(user => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.name || user.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className={procurementForm.paid_by_type === 'employee' ? '' : 'col-span-2'}>
                      <Label className="text-xs text-gray-500">Reference / Transaction ID</Label>
                      <Input
                        value={procurementForm.payment_reference || ''}
                        onChange={(e) => setProcurementForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                        placeholder="Enter reference"
                        className="h-8 text-sm mt-1"
                      />
                    </div>
                    {procurementForm.paid_by_type === 'employee' && (
                      <div className="col-span-2">
                        <div className={`text-xs px-2 py-1 rounded inline-block ${
                          procurementForm.settlement_status === 'settled' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          Settlement: {procurementForm.settlement_status === 'settled' ? 'Settled' : 'Pending Reimbursement'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('procurement.farmers')}</p>
                <p className="text-3xl font-bold text-gray-900">{getFilteredStats.farmersCount}</p>
                {getFilteredStats.farmersCount !== farmers.length && (
                  <p className="text-xs text-gray-400">of {farmers.length} total</p>
                )}
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
                <p className="text-3xl font-bold text-gray-900">{getFilteredStats.purchasesCount}</p>
                {getFilteredStats.purchasesCount !== procurements.length && (
                  <p className="text-xs text-gray-400">of {procurements.length} total</p>
                )}
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Plus className="text-blue-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 uppercase">Paid</p>
                <p className="text-3xl font-bold text-green-700">₹{getFilteredStats.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {getFilteredStats.purchasesCount !== procurements.length && (
                  <p className="text-xs text-gray-400">for filtered period</p>
                )}
              </div>
              <div className="bg-green-50 p-3 rounded-lg flex-shrink-0">
                <Check className="text-green-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">{t('procurement.pending')}</p>
                <p className="text-3xl font-bold text-red-700">₹{getFilteredStats.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {getFilteredStats.purchasesCount !== procurements.length && (
                  <p className="text-xs text-gray-400">for filtered period</p>
                )}
              </div>
              <div className="bg-red-50 p-3 rounded-lg flex-shrink-0">
                <Clock className="text-red-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Pending Employee Reimbursements Section - Grouped by Employee */}
      {getEmployeesWithPendingReimbursements().length > 0 && (
        <Card className="mb-4 border-purple-200 bg-purple-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-purple-800">
                <Users size={18} />
                Pending Employee Reimbursements
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-purple-700 font-bold">
                  Total: ₹{getEmployeesWithPendingReimbursements().reduce((sum, emp) => sum + emp.total_pending, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <button 
                  onClick={handleFixLegacyData}
                  disabled={fixingLegacyData}
                  className="text-xs text-purple-500 hover:text-purple-700 underline"
                >
                  {fixingLegacyData ? 'Fixing...' : 'Sync legacy data'}
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {getEmployeesWithPendingReimbursements().map(employee => (
                <div 
                  key={employee.id} 
                  className="bg-white border border-purple-100 rounded-lg p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{employee.name}</p>
                    <p className="text-xs text-gray-500">{employee.procurements.length} procurement(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-purple-700">₹{employee.total_pending.toLocaleString('en-IN')}</span>
                    <Button
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => openEmployeeReimbursementModal(employee)}
                      data-testid={`settle-employee-${employee.id}`}
                    >
                      Settle
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Fix Legacy Data Button - Shows for Admin when no employee reimbursements showing but there might be legacy data */}
      {unsettledEmployeeProcurements.length === 0 && procurements.some(p => p.paid_amount > 0 && !p.paid_by_type) && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  ⚠️ Legacy Data Detected
                </CardTitle>
                <p className="text-xs text-amber-600 mt-1">
                  Some procurements have payments but missing employee tracking data. Click to fix.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500 text-amber-700 hover:bg-amber-100"
                onClick={handleFixLegacyData}
                disabled={fixingLegacyData}
              >
                {fixingLegacyData ? 'Fixing...' : 'Fix Legacy Data'}
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-3xl">
          <TabsTrigger value="history">{t('procurement.purchaseHistory')}</TabsTrigger>
          <TabsTrigger value="pending">Pending Payments</TabsTrigger>
          <TabsTrigger value="farmers">{t('procurement.farmers')}</TabsTrigger>
          <TabsTrigger value="templates">{t('procurement.templates')} ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          {/* Filter Panel with Apply button for API loading */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter size={18} />
                  {t('procurement.filters')}
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    onClick={() => {
                      setAppliedDateRange({ 
                        fromDate: filters.fromDate || dateFilters.fromDate, 
                        toDate: filters.toDate || dateFilters.toDate 
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Filter size={14} className="mr-1" /> Apply
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setFilters({ fromDate: today, toDate: today, farmerName: '', productName: '', status: '' });
                      setDateFilters({ fromDate: today, toDate: today });
                      setAppliedDateRange({ fromDate: today, toDate: today });
                    }}
                  >
                    Reset to Today
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters-button">
                    {t('procurement.clearAll')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                <div>
                  <Label htmlFor="filter-status" className="text-xs">Status</Label>
                  <select
                    id="filter-status"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    data-testid="filter-status"
                  >
                    <option value="">All</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="filter-paid-by" className="text-xs">Paid By</Label>
                  <select
                    id="filter-paid-by"
                    value={filters.paidBy}
                    onChange={(e) => setFilters({ ...filters, paidBy: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    data-testid="filter-paid-by"
                  >
                    <option value="">All</option>
                    <option value="company">Company</option>
                    {/* Employees who have paid procurements */}
                    {paidByEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                {t('procurement.showing')} {filteredProcurements.length} {t('procurement.of')} {procurements.length} {t('procurement.purchases')}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{t('procurement.purchaseHistory')}</CardTitle>
                {selectedForPDF.length > 0 && (
                  <span className="text-sm text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {selectedForPDF.length} selected
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant={selectedForPDF.length > 0 ? "default" : "outline"} 
                  onClick={downloadFarmerPurchasePDF} 
                  title={selectedForPDF.length > 0 ? `Download PDF for ${selectedForPDF.length} selected` : "Download PDF for all filtered"}
                  className={selectedForPDF.length > 0 ? "bg-blue-600 hover:bg-blue-700" : ""}
                >
                  <FileText size={14} className="mr-1" /> 
                  PDF {selectedForPDF.length > 0 && `(${selectedForPDF.length})`}
                </Button>
                <Button size="sm" variant="outline" onClick={exportProcurements} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th className="w-8">
                        <Checkbox
                          checked={filteredProcurements.length > 0 && selectedForPDF.length === filteredProcurements.length}
                          onCheckedChange={toggleAllPDFSelection}
                          title="Select all for PDF"
                        />
                      </th>
                      <th>{t('procurement.date')}</th>
                      <th>{t('procurement.farmer')}</th>
                      <th>{t('procurement.products')}</th>
                      <th className="text-right">{t('procurement.total')}</th>
                      <th className="text-right">{t('procurement.paid')}</th>
                      <th className="text-right">{t('procurement.pending')}</th>
                      <th>{t('procurement.payment')}</th>
                      <th>Settlement</th>
                      <th className="text-center">{t('procurement.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcurements.map((proc) => {
                      const isPendingSettlement = (proc.payment_status === 'paid' || proc.payment_status === 'partial') && 
                        proc.paid_by_type === 'employee' && 
                        proc.settlement_status !== 'settled';
                      const isSelectedForPDF = selectedForPDF.includes(proc.id);
                      return (
                      <tr 
                        key={proc.id} 
                        data-testid={`procurement-row-${proc.id}`}
                        className={`${isPendingSettlement ? 'employee-pending-settlement' : ''} ${isSelectedForPDF ? 'bg-blue-50' : ''}`}
                        style={isPendingSettlement ? { 
                          backgroundColor: isSelectedForPDF ? '#DBEAFE' : '#DDD6FE', 
                          borderLeft: '4px solid #7C3AED' 
                        } : isSelectedForPDF ? { backgroundColor: '#EFF6FF' } : {}}
                      >
                        <td>
                          <Checkbox
                            checked={isSelectedForPDF}
                            onCheckedChange={() => togglePDFSelection(proc.id)}
                            title="Select for PDF"
                          />
                        </td>
                        <td>{formatDate(proc.date)}</td>
                        <td className="font-medium">{proc.farmer_name}</td>
                        <td>
                          {proc.products?.length > 3 ? (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-600">
                                {proc.products.length} items
                              </div>
                              <details className="cursor-pointer">
                                <summary className="text-xs text-blue-600 hover:text-blue-800">View details</summary>
                                <div className="mt-1 space-y-1 pl-2 border-l-2 border-blue-100">
                                  {proc.products?.map((p, i) => (
                                    <div key={i} className="text-xs">
                                      {getProductName(p)}: {p.quantity} {getUnitLabel(p.unit, p.unit_size)} @ ₹{p.rate}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {proc.products?.map((p, i) => (
                                <div key={i} className="text-xs">
                                  {getProductName(p)}: {p.quantity} {getUnitLabel(p.unit, p.unit_size)} @ ₹{p.rate}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="text-right font-semibold">₹{proc.total_amount?.toFixed(2)}</td>
                        <td className="text-right text-green-700">₹{(proc.paid_amount || 0).toFixed(2)}</td>
                        <td className="text-right">
                          {/* Calculate actual pending: total - paid. Show negative if overpaid */}
                          {(() => {
                            const actualPending = (proc.total_amount || 0) - (proc.paid_amount || 0);
                            if (actualPending > 0) {
                              return <span className="text-red-700">₹{actualPending.toFixed(2)}</span>;
                            } else if (actualPending < 0) {
                              return <span className="text-green-600">-₹{Math.abs(actualPending).toFixed(2)} (credit)</span>;
                            } else {
                              return <span className="text-gray-500">₹0.00</span>;
                            }
                          })()}
                        </td>
                        <td>
                          <div className="flex flex-col gap-1">
                            <span className={`badge ${
                              proc.payment_status === 'paid' ? 'badge-success' : 
                              proc.payment_status === 'partial' ? 'badge-warning' : 'badge-error'
                            }`}>
                              {proc.payment_status || 'pending'}
                            </span>
                            {/* Always show employee name if paid by employee, regardless of settlement status */}
                            {proc.paid_by_type === 'employee' && proc.paid_by && (
                              <span className="text-xs text-purple-600">by {proc.paid_by}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {/* Show settlement status for employee-paid procurements */}
                          {proc.paid_by_type === 'employee' ? (
                            proc.settlement_status === 'settled' ? (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">Settled</span>
                            ) : proc.settlement_status === 'partial_reimbursement' ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded">Partial</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-green-600 hover:bg-green-50"
                                  onClick={() => openSettlementModal(proc)}
                                  title="Record More Reimbursement"
                                >
                                  <IndianRupee size={12} />
                                </Button>
                              </div>
                            ) : (proc.payment_status === 'paid' || proc.payment_status === 'partial') ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">Pending</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-green-600 hover:bg-green-50"
                                  onClick={() => openSettlementModal(proc)}
                                  title="Record Reimbursement"
                                >
                                  <IndianRupee size={12} />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
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
                            {/* Show Pay button when there's pending amount */}
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
                            {/* Show View button when there's any paid amount (including partial) */}
                            {(proc.paid_amount || 0) > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                onClick={() => openPaymentHistoryModal(proc)}
                                data-testid={`view-payments-${proc.id}`}
                                title="View/Edit Payments"
                              >
                                <Eye size={14} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )})}
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
                      <th className="w-8"></th>
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
                      const isExpanded = expandedFarmerId === farmerData.farmer_id;
                      
                      return (
                        <React.Fragment key={farmerData.farmer_id}>
                          <tr 
                            data-testid={`pending-row-${farmerData.farmer_id}`}
                            className={isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}
                          >
                            <td>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleFarmerSelection(farmerData)}
                                data-testid={`select-farmer-${farmerData.farmer_id}`}
                              />
                            </td>
                            <td>
                              <button
                                onClick={() => {
                                  setExpandedFarmerId(isExpanded ? null : farmerData.farmer_id);
                                  if (!isExpanded) {
                                    // Reset selections when expanding a new farmer
                                    setSelectedPurchasesForPayment([]);
                                    setPartialPaymentAmounts({});
                                  }
                                }}
                                className="p-1 hover:bg-gray-200 rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown size={16} className="text-blue-600" />
                                ) : (
                                  <ChevronRight size={16} className="text-gray-400" />
                                )}
                              </button>
                            </td>
                            <td 
                              className="font-medium cursor-pointer text-blue-700 hover:underline"
                              onClick={() => {
                                setExpandedFarmerId(isExpanded ? null : farmerData.farmer_id);
                                if (!isExpanded) {
                                  setSelectedPurchasesForPayment([]);
                                  setPartialPaymentAmounts({});
                                }
                              }}
                            >
                              {farmerData.farmer_name}
                            </td>
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
                                Pay All
                              </Button>
                            </td>
                          </tr>
                          
                          {/* Expanded Date-wise Breakdown */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} className="p-0">
                                <div className="bg-blue-50 border-t border-b border-blue-200 p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                                      <Calendar size={16} />
                                      Date-wise Purchase Summary
                                    </h4>
                                    {selectedPurchasesForPayment.length > 0 && (
                                      <Button
                                        size="sm"
                                        className="bg-[#14532D] hover:bg-[#166534]"
                                        onClick={() => {
                                          // Calculate selected total
                                          const selectedTotal = selectedPurchasesForPayment.reduce((sum, purchaseId) => {
                                            const amount = partialPaymentAmounts[purchaseId] || 
                                              farmerData.purchases.find(p => p.id === purchaseId)?.pending_amount || 0;
                                            return sum + amount;
                                          }, 0);
                                          
                                          // Set up bulk payment for selected purchases
                                          const selectedPurchaseData = {
                                            ...farmerData,
                                            purchases: farmerData.purchases.filter(p => selectedPurchasesForPayment.includes(p.id)),
                                            pending_amount: selectedTotal,
                                            partial_amounts: partialPaymentAmounts
                                          };
                                          setSelectedFarmersForPayment([selectedPurchaseData]);
                                          setOpenBulkPayment(true);
                                        }}
                                      >
                                        <IndianRupee size={14} className="mr-1" />
                                        Pay Selected ({selectedPurchasesForPayment.length})
                                      </Button>
                                    )}
                                  </div>
                                  
                                  <div className="bg-white rounded-lg border overflow-hidden">
                                    <table className="w-full text-sm">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="p-2 text-left w-10">
                                            <Checkbox
                                              checked={selectedPurchasesForPayment.length === farmerData.purchases.length && farmerData.purchases.length > 0}
                                              onCheckedChange={(checked) => {
                                                if (checked) {
                                                  setSelectedPurchasesForPayment(farmerData.purchases.map(p => p.id));
                                                } else {
                                                  setSelectedPurchasesForPayment([]);
                                                }
                                              }}
                                            />
                                          </th>
                                          <th className="p-2 text-left">DATE</th>
                                          <th className="p-2 text-right">PURCHASE AMOUNT</th>
                                          <th className="p-2 text-right">PAID</th>
                                          <th className="p-2 text-right">PENDING</th>
                                          <th className="p-2 text-right">PAY AMOUNT</th>
                                          <th className="p-2 text-center">PAYMENT INFO</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {farmerData.purchases
                                          .sort((a, b) => new Date(b.date) - new Date(a.date))
                                          .map((purchase) => {
                                            const isChecked = selectedPurchasesForPayment.includes(purchase.id);
                                            const payAmount = partialPaymentAmounts[purchase.id] ?? purchase.pending_amount;
                                            const hasBulkPayment = purchase.bulk_payment_reference || purchase.last_payment_reference;
                                            
                                            return (
                                              <tr 
                                                key={purchase.id} 
                                                className={`border-t ${isChecked ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                                              >
                                                <td className="p-2">
                                                  <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => {
                                                      if (checked) {
                                                        setSelectedPurchasesForPayment(prev => [...prev, purchase.id]);
                                                        setPartialPaymentAmounts(prev => ({
                                                          ...prev,
                                                          [purchase.id]: purchase.pending_amount
                                                        }));
                                                      } else {
                                                        setSelectedPurchasesForPayment(prev => prev.filter(id => id !== purchase.id));
                                                        setPartialPaymentAmounts(prev => {
                                                          const newAmounts = {...prev};
                                                          delete newAmounts[purchase.id];
                                                          return newAmounts;
                                                        });
                                                      }
                                                    }}
                                                  />
                                                </td>
                                                <td className="p-2 font-medium">
                                                  {new Date(purchase.date).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    year: 'numeric'
                                                  })}
                                                </td>
                                                <td className="p-2 text-right">₹{purchase.total_amount?.toFixed(2)}</td>
                                                <td className="p-2 text-right text-green-700">₹{(purchase.paid_amount || 0).toFixed(2)}</td>
                                                <td className="p-2 text-right text-red-700 font-semibold">₹{purchase.pending_amount?.toFixed(2)}</td>
                                                <td className="p-2 text-right">
                                                  {isChecked ? (
                                                    <Input
                                                      type="number"
                                                      step="0.01"
                                                      value={payAmount}
                                                      onChange={(e) => {
                                                        const value = parseFloat(e.target.value) || 0;
                                                        setPartialPaymentAmounts(prev => ({
                                                          ...prev,
                                                          [purchase.id]: Math.min(value, purchase.pending_amount)
                                                        }));
                                                      }}
                                                      className="w-24 h-7 text-right text-sm"
                                                      max={purchase.pending_amount}
                                                    />
                                                  ) : (
                                                    <span className="text-gray-400">-</span>
                                                  )}
                                                </td>
                                                <td className="p-2 text-center">
                                                  {hasBulkPayment ? (
                                                    <div className="text-xs">
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                                                        <CheckSquare size={10} />
                                                        Bulk Payment
                                                      </span>
                                                      {purchase.last_payment_reference && (
                                                        <div className="text-gray-500 mt-1">
                                                          Ref: {purchase.last_payment_reference}
                                                        </div>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        {/* Totals Row */}
                                        <tr className="border-t-2 border-gray-300 bg-gray-100 font-semibold">
                                          <td colSpan={2} className="p-2 text-right">TOTAL:</td>
                                          <td className="p-2 text-right">₹{farmerData.total_amount.toFixed(2)}</td>
                                          <td className="p-2 text-right text-green-700">₹{farmerData.paid_amount.toFixed(2)}</td>
                                          <td className="p-2 text-right text-red-700">₹{farmerData.pending_amount.toFixed(2)}</td>
                                          <td className="p-2 text-right text-blue-700">
                                            {selectedPurchasesForPayment.length > 0 && (
                                              <>₹{selectedPurchasesForPayment.reduce((sum, id) => {
                                                return sum + (partialPaymentAmounts[id] || farmerData.purchases.find(p => p.id === id)?.pending_amount || 0);
                                              }, 0).toFixed(2)}</>
                                            )}
                                          </td>
                                          <td></td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
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
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Record Payment to Farmer</DialogTitle>
          </DialogHeader>
          {selectedProcurement && (
            <form onSubmit={handleSubmitPayment} className="space-y-4 overflow-y-auto flex-1">
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

              {/* Earlier Payments Section */}
              {(selectedProcurement.paid_amount > 0) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                    <Clock size={14} /> Payment History
                  </h4>
                  {loadingPayments ? (
                    <p className="text-xs text-gray-500">Loading...</p>
                  ) : procurementPayments.length === 0 && selectedProcurement.paid_by_type === 'employee' ? (
                    /* Show constructed payment info for employee-paid procurements without records */
                    <div className="space-y-2">
                      {/* Employee Payment */}
                      <div className="bg-white border border-green-100 rounded p-2 text-xs">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-green-700">₹{(selectedProcurement.paid_amount || 0).toFixed(2)}</span>
                          <span className="text-gray-500 uppercase text-[10px] bg-gray-100 px-1 rounded">{selectedProcurement.payment_mode || 'Cash'}</span>
                          <span className="text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                            EMPLOYEE PAID
                          </span>
                        </div>
                        {selectedProcurement.payment_reference && (
                          <div className="text-blue-700 font-medium mb-1">
                            Ref #: {selectedProcurement.payment_reference}
                          </div>
                        )}
                        <div className="text-gray-600">
                          <span>Paid on: {formatDate(selectedProcurement.payment_date || selectedProcurement.date)}</span>
                          <span className="ml-2">by <strong className="text-purple-700">{selectedProcurement.paid_by}</strong></span>
                        </div>
                      </div>
                      
                      {/* Settlement/Reimbursement */}
                      {selectedProcurement.settlement_status === 'settled' && (
                        <div className="bg-white border border-blue-100 rounded p-2 text-xs">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-blue-700">₹{(selectedProcurement.reimbursement_amount || selectedProcurement.paid_amount || 0).toFixed(2)}</span>
                            <span className="text-gray-500 uppercase text-[10px] bg-gray-100 px-1 rounded">{selectedProcurement.settlement_mode || 'Bank Transfer'}</span>
                            <span className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              REIMBURSED
                            </span>
                          </div>
                          {selectedProcurement.settlement_reference && (
                            <div className="text-blue-700 font-medium mb-1">
                              Ref #: {selectedProcurement.settlement_reference}
                            </div>
                          )}
                          {selectedProcurement.settlement_remarks && (
                            <div className="text-gray-600 italic mb-1">
                              "{selectedProcurement.settlement_remarks}"
                            </div>
                          )}
                          <div className="text-gray-600">
                            <span>Settled on: {formatDate(selectedProcurement.settlement_date)}</span>
                            <span className="ml-2">to <strong className="text-blue-700">{selectedProcurement.paid_by}</strong></span>
                          </div>
                        </div>
                      )}
                      
                      {selectedProcurement.settlement_status === 'partial_reimbursement' && (
                        <div className="bg-white border border-orange-100 rounded p-2 text-xs">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-orange-700">₹{(selectedProcurement.reimbursement_amount || 0).toFixed(2)}</span>
                            <span className="text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              PARTIAL REIMBURSEMENT
                            </span>
                          </div>
                          <div className="text-gray-600">
                            <span>Remaining: ₹{((selectedProcurement.paid_amount || 0) - (selectedProcurement.reimbursement_amount || 0)).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      
                      {selectedProcurement.settlement_status === 'pending_reimbursement' && (
                        <div className="bg-orange-50 border border-orange-200 rounded p-2 text-xs">
                          <span className="text-orange-700 font-medium">⏳ Reimbursement pending to {selectedProcurement.paid_by}</span>
                        </div>
                      )}
                    </div>
                  ) : procurementPayments.length === 0 ? (
                    <p className="text-xs text-gray-500">No payment records found (legacy payment)</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {procurementPayments.map((payment, idx) => (
                        <div key={payment.id || idx} className="bg-white border border-green-100 rounded p-2 text-xs">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-semibold text-green-700">₹{payment.amount?.toFixed(2)}</span>
                                <span className="text-gray-500 uppercase text-[10px] bg-gray-100 px-1 rounded">{payment.payment_mode}</span>
                                {payment.is_bulk_payment && (
                                  <span className="text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    BULK PAYMENT
                                  </span>
                                )}
                                {payment.is_reimbursement && (
                                  <span className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    REIMBURSED
                                  </span>
                                )}
                                {payment.paid_by_type === 'employee' && !payment.is_reimbursement && (
                                  <span className="text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    EMPLOYEE PAID
                                  </span>
                                )}
                              </div>
                              {/* Reference Number */}
                              {payment.reference_number && (
                                <div className="text-blue-700 font-medium mb-1">
                                  Ref #: {payment.reference_number}
                                </div>
                              )}
                              {/* Remarks */}
                              {payment.remarks && (
                                <div className="text-gray-600 italic mb-1">
                                  "{payment.remarks}"
                                </div>
                              )}
                              <div className="text-gray-600">
                                <span>Paid on: {formatDate(payment.payment_date)}</span>
                                {payment.is_reimbursement ? (
                                  <span className="ml-2">to <strong className="text-blue-700">{payment.reimbursed_to || payment.paid_by}</strong></span>
                                ) : (
                                  <span className="ml-2">by {payment.paid_by_type === 'employee' ? <strong className="text-purple-700">{payment.paid_by}</strong> : 'Company'}</span>
                                )}
                              </div>
                              {payment.created_at && (
                                <div className="text-gray-400 text-[10px] mt-1">
                                  Recorded: {new Date(payment.created_at).toLocaleString('en-IN', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                  {payment.updated_at && ` | Updated: ${new Date(payment.updated_at).toLocaleString('en-IN', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}`}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              {!payment.is_reimbursement && (
                                <>
                                  <Button 
                                    type="button"
                                    size="sm" 
                                    variant="ghost" 
                                    className="text-blue-500 hover:bg-blue-50 h-6 w-6 p-0"
                                    onClick={() => handleEditProcurementPayment(payment)}
                                    title="Edit Payment"
                                  >
                                    <Edit2 size={12} />
                                  </Button>
                                  <Button 
                                    type="button"
                                    size="sm" 
                                    variant="ghost" 
                                    className="text-red-500 hover:bg-red-50 h-6 w-6 p-0"
                                    onClick={() => handleDeleteProcurementPayment(payment.id)}
                                    title="Delete Payment"
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Only show form if there's pending amount */}
              {(selectedProcurement.pending_amount || 0) > 0 && (
                <>
                  <div>
                    <Label htmlFor="payment-date">Payment Date *</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentForm.payment_date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                      required
                    />
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
                    <Label htmlFor="payment-reference">
                      Transaction Number {paymentForm.payment_mode !== 'cash' && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="payment-reference"
                      placeholder="Transaction ID, Cheque number, etc."
                      data-testid="payment-reference-input"
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                      required={paymentForm.payment_mode !== 'cash'}
                    />
                    {paymentForm.payment_mode !== 'cash' && !paymentForm.reference && (
                      <p className="text-xs text-red-500 mt-1">Required for non-cash payments</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="payment-remarks">Remarks</Label>
                    <Input
                      id="payment-remarks"
                      placeholder="Additional notes..."
                      data-testid="payment-remarks-input"
                      value={paymentForm.remarks}
                      onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                    />
                  </div>

                  {/* Paid By Section */}
                  <div>
                    <Label className="mb-2 block">Paid By</Label>
                    <div className="flex gap-4 mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio"
                          checked={paymentForm.paid_by_type === 'company'}
                          onChange={() => setPaymentForm({ ...paymentForm, paid_by_type: 'company', paid_by_employee_id: '' })}
                          className="w-4 h-4 text-green-600"
                        />
                        <span className="text-sm">Company</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio"
                          checked={paymentForm.paid_by_type === 'employee'}
                          onChange={() => setPaymentForm({ ...paymentForm, paid_by_type: 'employee' })}
                          className="w-4 h-4 text-green-600"
                        />
                        <span className="text-sm">Employee</span>
                      </label>
                    </div>
                    {paymentForm.paid_by_type === 'employee' && (
                      <Select 
                        value={paymentForm.paid_by_employee_id} 
                        onValueChange={(v) => setPaymentForm({ ...paymentForm, paid_by_employee_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {staffUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-payment-button">
                    Record Payment
                  </Button>
                </>
              )}

              {/* If fully paid, show close button */}
              {(selectedProcurement.pending_amount || 0) <= 0 && (
                <Button type="button" variant="outline" className="w-full" onClick={() => setOpenPayment(false)}>
                  Close
                </Button>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Payment Modal */}
      {showEditPaymentModal && editingProcurementPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Edit2 size={20} className="text-blue-600" />
                Edit Payment
              </h3>
              <button onClick={() => { setShowEditPaymentModal(false); setEditingProcurementPayment(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitEditPayment} className="p-4 space-y-4">
              {/* Original Payment Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="text-blue-800 font-medium mb-1">Editing Payment</p>
                <p className="text-blue-600">
                  Original: ₹{editingProcurementPayment.amount?.toFixed(2)} on {formatDate(editingProcurementPayment.payment_date)}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Payment Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Enter payment amount"
                  value={editPaymentForm.amount}
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, amount: e.target.value})}
                  className="w-full"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Payment Date *</Label>
                <Input
                  type="date"
                  value={editPaymentForm.payment_date}
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_date: e.target.value})}
                  className="w-full"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Payment Mode *</Label>
                <select
                  value={editPaymentForm.payment_mode}
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_mode: e.target.value})}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              {/* Paid By Section for Edit */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Paid By</Label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      checked={editPaymentForm.paid_by_type === 'company'}
                      onChange={() => setEditPaymentForm({ ...editPaymentForm, paid_by_type: 'company', paid_by_employee_id: '' })}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm">Company</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      checked={editPaymentForm.paid_by_type === 'employee'}
                      onChange={() => setEditPaymentForm({ ...editPaymentForm, paid_by_type: 'employee' })}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm">Employee</span>
                  </label>
                </div>
                {editPaymentForm.paid_by_type === 'employee' && (
                  <select
                    value={editPaymentForm.paid_by_employee_id}
                    onChange={(e) => setEditPaymentForm({ ...editPaymentForm, paid_by_employee_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  >
                    <option value="">Select employee</option>
                    {staffUsers.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Reference Number</Label>
                <Input
                  type="text"
                  placeholder="Transaction ID / Reference"
                  value={editPaymentForm.reference_number}
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, reference_number: e.target.value})}
                  className="w-full"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Remarks</Label>
                <Input
                  type="text"
                  placeholder="Optional notes"
                  value={editPaymentForm.remarks}
                  onChange={(e) => setEditPaymentForm({...editPaymentForm, remarks: e.target.value})}
                  className="w-full"
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowEditPaymentModal(false); setEditingProcurementPayment(null); }}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <Save size={14} className="mr-1" /> Update Payment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Payment Dialog */}
      <Dialog open={openBulkPayment} onOpenChange={setOpenBulkPayment}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee size={20} className="text-green-700" />
              Record Bulk Payment
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBulkPayment} className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg space-y-3 max-h-60 overflow-y-auto">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Selected Farmers ({selectedFarmersForPayment.length}):
              </p>
              {selectedFarmersForPayment.map((farmerData) => {
                // Check if this has specific purchases selected (partial payment scenario)
                const hasPartialAmounts = farmerData.partial_amounts && Object.keys(farmerData.partial_amounts).length > 0;
                const totalToPayForFarmer = hasPartialAmounts 
                  ? Object.values(farmerData.partial_amounts).reduce((sum, amt) => sum + amt, 0)
                  : farmerData.pending_amount;
                
                return (
                  <div key={farmerData.farmer_id} className="py-2 border-b border-gray-200 last:border-0">
                    <div className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">{farmerData.farmer_name}</p>
                        <p className="text-xs text-gray-500">
                          {farmerData.purchases?.length || farmerData.purchase_count} pending purchase(s)
                        </p>
                      </div>
                      <span className="font-bold text-green-700">₹{totalToPayForFarmer.toFixed(2)}</span>
                    </div>
                    
                    {/* Show date-wise breakdown for selected purchases */}
                    {hasPartialAmounts && (
                      <div className="mt-2 pl-3 border-l-2 border-green-300 space-y-1">
                        {farmerData.purchases.map(purchase => {
                          const payAmount = farmerData.partial_amounts[purchase.id];
                          if (!payAmount) return null;
                          return (
                            <div key={purchase.id} className="flex justify-between text-xs text-gray-600">
                              <span>
                                {new Date(purchase.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                {payAmount < purchase.pending_amount && (
                                  <span className="ml-1 text-orange-600">(Partial)</span>
                                )}
                              </span>
                              <span>₹{payAmount.toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-3">
              {/* Total Pending Display */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-700">Total Pending:</span>
                <span className="text-lg font-bold text-green-700">
                  ₹{selectedFarmersForPayment.reduce((sum, f) => {
                    const hasPartialAmounts = f.partial_amounts && Object.keys(f.partial_amounts).length > 0;
                    return sum + (hasPartialAmounts 
                      ? Object.values(f.partial_amounts).reduce((s, a) => s + a, 0)
                      : f.pending_amount);
                  }, 0).toFixed(2)}
                </span>
              </div>
              
              {/* Editable Payment Amount */}
              <div>
                <Label htmlFor="bulk-payment-amount" className="text-green-800 font-semibold">
                  Payment Amount
                </Label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <Input
                      id="bulk-payment-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={selectedFarmersForPayment.reduce((sum, f) => {
                        const hasPartialAmounts = f.partial_amounts && Object.keys(f.partial_amounts).length > 0;
                        return sum + (hasPartialAmounts 
                          ? Object.values(f.partial_amounts).reduce((s, a) => s + a, 0)
                          : f.pending_amount);
                      }, 0).toFixed(2)}
                      className="pl-7 text-lg font-semibold"
                      data-testid="bulk-payment-amount-input"
                      value={bulkPaymentForm.custom_amount}
                      onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, custom_amount: e.target.value })}
                    />
                  </div>
                  <Button 
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => setBulkPaymentForm({ 
                      ...bulkPaymentForm, 
                      custom_amount: selectedFarmersForPayment.reduce((sum, f) => {
                        const hasPartialAmounts = f.partial_amounts && Object.keys(f.partial_amounts).length > 0;
                        return sum + (hasPartialAmounts 
                          ? Object.values(f.partial_amounts).reduce((s, a) => s + a, 0)
                          : f.pending_amount);
                      }, 0).toFixed(2)
                    })}
                  >
                    Full Amount
                  </Button>
                </div>
                <p className="text-xs text-green-600 mt-1">
                  Enter custom amount or leave empty to pay full pending. Payment will be applied to oldest entries first.
                </p>
              </div>
              
              {/* Allocation Preview */}
              {bulkPaymentForm.custom_amount && parseFloat(bulkPaymentForm.custom_amount) > 0 && (() => {
                const paymentAmount = parseFloat(bulkPaymentForm.custom_amount);
                const totalPending = selectedFarmersForPayment.reduce((sum, f) => sum + f.pending_amount, 0);
                
                // Collect all purchases sorted by date
                let allPurchases = [];
                for (const farmerData of selectedFarmersForPayment) {
                  for (const purchase of farmerData.purchases) {
                    if ((purchase.pending_amount || 0) > 0) {
                      allPurchases.push({
                        ...purchase,
                        farmer_name: farmerData.farmer_name
                      });
                    }
                  }
                }
                allPurchases.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                // Calculate allocation
                let remaining = paymentAmount;
                const allocations = [];
                for (const purchase of allPurchases) {
                  if (remaining <= 0) break;
                  const payAmt = Math.min(remaining, purchase.pending_amount);
                  allocations.push({
                    date: purchase.date,
                    farmer: purchase.farmer_name,
                    amount: payAmt,
                    isPartial: payAmt < purchase.pending_amount
                  });
                  remaining -= payAmt;
                }
                
                return (
                  <div className="mt-2 pt-2 border-t border-green-200">
                    <p className="text-xs font-medium text-green-800 mb-1">Allocation Preview (oldest first):</p>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {allocations.map((alloc, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-gray-600">
                            {new Date(alloc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {alloc.farmer}
                            {alloc.isPartial && <span className="text-orange-600 ml-1">(Partial)</span>}
                          </span>
                          <span className={alloc.isPartial ? 'text-orange-600' : 'text-green-600'}>
                            ₹{alloc.amount.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {remaining > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        ⚠️ ₹{remaining.toFixed(2)} exceeds pending amount
                      </p>
                    )}
                    {paymentAmount < totalPending && (
                      <p className="text-xs text-blue-600 mt-1">
                        Remaining pending after payment: ₹{(totalPending - paymentAmount).toFixed(2)}
                      </p>
                    )}
                  </div>
                );
              })()}
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
              <Label htmlFor="bulk-payment-reference">
                Reference / Transaction ID {bulkPaymentForm.payment_mode !== 'cash' && <span className="text-red-500">*</span>}
              </Label>
              <Input
                id="bulk-payment-reference"
                placeholder={bulkPaymentForm.payment_mode === 'cash' ? "Optional for cash payments" : "Transaction ID, Cheque number, etc."}
                data-testid="bulk-payment-reference-input"
                value={bulkPaymentForm.reference}
                onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, reference: e.target.value })}
                className={bulkPaymentForm.payment_mode !== 'cash' && !bulkPaymentForm.reference?.trim() ? 'border-orange-300' : ''}
              />
              <p className="text-xs text-gray-500 mt-1">
                {bulkPaymentForm.payment_mode === 'cash' 
                  ? 'Optional for cash payments' 
                  : 'Required for non-cash payments'}
              </p>
            </div>

            <div>
              <Label htmlFor="bulk-payment-remarks">Remarks</Label>
              <Input
                id="bulk-payment-remarks"
                placeholder="Optional notes for this payment..."
                data-testid="bulk-payment-remarks-input"
                value={bulkPaymentForm.remarks}
                onChange={(e) => setBulkPaymentForm({ ...bulkPaymentForm, remarks: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-bulk-payment-button">
              <IndianRupee size={16} className="mr-2" />
              Confirm Payment for {selectedFarmersForPayment.length} Farmer(s)
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* Settlement/Reimbursement Modal */}
      {showSettlementModal && settlementProcurement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b bg-purple-50">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-purple-800">
                <IndianRupee size={20} />
                Record Reimbursement
              </h3>
              <p className="text-sm text-purple-600 mt-1">
                Paid by: {settlementProcurement.paid_by}
              </p>
            </div>
            
            {/* Amount Summary */}
            <div className="p-4 bg-gray-50 border-b space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Purchase Amount:</span>
                <span className="font-medium">₹{(settlementProcurement.total_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Employee Paid:</span>
                <span className="font-medium text-blue-700">₹{(settlementProcurement.paid_amount || settlementProcurement.total_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              {(settlementProcurement.paid_amount || settlementProcurement.total_amount || 0) < settlementProcurement.total_amount && (
                <div className="flex justify-between text-sm text-amber-600">
                  <span>Pending (to farmer):</span>
                  <span className="font-medium">₹{((settlementProcurement.total_amount || 0) - (settlementProcurement.paid_amount || settlementProcurement.total_amount || 0)).toLocaleString('en-IN')}</span>
                </div>
              )}
              {settlementForm.reimbursement_amount > (settlementProcurement.paid_amount || settlementProcurement.total_amount || 0) && (
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="text-green-700 font-medium">Employee Credit:</span>
                  <span className="font-bold text-green-700">
                    ₹{(settlementForm.reimbursement_amount - (settlementProcurement.paid_amount || settlementProcurement.total_amount || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
            
            <div className="p-4 space-y-4">
              {/* Reimbursement Amount Field */}
              <div>
                <Label className="text-sm font-medium">Reimbursement Amount *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    step="0.01"
                    value={settlementForm.reimbursement_amount}
                    onChange={(e) => setSettlementForm(prev => ({ 
                      ...prev, 
                      reimbursement_amount: parseFloat(e.target.value) || 0 
                    }))}
                    className="flex-1"
                    data-testid="reimbursement-amount-input"
                  />
                  <Button 
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSettlementForm(prev => ({ 
                      ...prev, 
                      reimbursement_amount: settlementProcurement.paid_amount || settlementProcurement.total_amount || 0 
                    }))}
                    className="text-xs whitespace-nowrap"
                  >
                    Full Amount
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enter the amount to reimburse. Can be partial or include excess (creates credit).
                </p>
              </div>
              
              <div>
                <Label className="text-sm">Reimbursement Date *</Label>
                <Input
                  type="date"
                  value={settlementForm.payment_date}
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label className="text-sm">Payment Mode</Label>
                <Select 
                  value={settlementForm.payment_mode} 
                  onValueChange={(v) => setSettlementForm(prev => ({ ...prev, payment_mode: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label className="text-sm">Reference / Transaction ID</Label>
                <Input
                  value={settlementForm.payment_reference}
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                  placeholder="Enter reference number"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label className="text-sm">Remarks</Label>
                <Input
                  value={settlementForm.remarks}
                  onChange={(e) => setSettlementForm(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Optional notes"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="p-4 border-t flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => { setShowSettlementModal(false); setSettlementProcurement(null); }}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-purple-600 hover:bg-purple-700" 
                onClick={handleSettlementSubmit}
                disabled={settlementForm.reimbursement_amount <= 0}
              >
                <Check size={14} className="mr-1" /> 
                {settlementForm.reimbursement_amount < (settlementProcurement.paid_amount || settlementProcurement.total_amount || 0) 
                  ? 'Record Partial' 
                  : 'Record Reimbursement'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Bulk Reimbursement Modal */}
      {showEmployeeReimbursementModal && selectedEmployeeForReimbursement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-4 border-b bg-purple-50 flex-shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users size={20} className="text-purple-600" />
                    Reimburse {selectedEmployeeForReimbursement.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedEmployeeForReimbursement.procurements.length} procurement(s) pending reimbursement
                  </p>
                </div>
                <button 
                  onClick={() => { setShowEmployeeReimbursementModal(false); setSelectedEmployeeForReimbursement(null); }} 
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Reimbursement Amount Section */}
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-purple-700">Total Pending Reimbursement:</span>
                  <span className="text-lg font-bold text-purple-700">
                    ₹{selectedEmployeeForReimbursement.total_pending.toLocaleString('en-IN')}
                  </span>
                </div>
                
                <div>
                  <label className="text-xs font-medium text-purple-800 mb-1 block">Reimbursement Amount</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={selectedEmployeeForReimbursement.total_pending.toFixed(2)}
                        className="pl-7 text-lg font-semibold"
                        data-testid="procurement-employee-reimbursement-amount"
                        value={employeeReimbursementForm.custom_amount}
                        onChange={(e) => setEmployeeReimbursementForm(prev => ({ ...prev, custom_amount: e.target.value }))}
                      />
                    </div>
                    <Button 
                      type="button"
                      variant="outline"
                      size="sm"
                      className="whitespace-nowrap"
                      onClick={() => setEmployeeReimbursementForm(prev => ({ 
                        ...prev, 
                        custom_amount: selectedEmployeeForReimbursement.total_pending.toFixed(2)
                      }))}
                    >
                      Full Amount
                    </Button>
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    Enter custom amount or leave empty to reimburse full pending. Amount applies to oldest procurements first.
                  </p>
                </div>
                
                {/* Allocation Preview */}
                {employeeReimbursementForm.custom_amount && parseFloat(employeeReimbursementForm.custom_amount) > 0 && (() => {
                  const reimbAmount = parseFloat(employeeReimbursementForm.custom_amount);
                  const sortedProcs = [...selectedEmployeeForReimbursement.procurements].sort(
                    (a, b) => new Date(a.date) - new Date(b.date)
                  );
                  
                  let remaining = reimbAmount;
                  const allocations = [];
                  for (const proc of sortedProcs) {
                    if (remaining <= 0) break;
                    const procRemaining = proc.remaining_to_reimburse || ((proc.paid_amount || 0) - (proc.reimbursement_amount || 0));
                    if (procRemaining <= 0) continue;
                    const allocAmt = Math.min(remaining, procRemaining);
                    allocations.push({
                      date: proc.date,
                      farmer: proc.farmer_name,
                      amount: allocAmt,
                      isPartial: allocAmt < procRemaining
                    });
                    remaining -= allocAmt;
                  }
                  
                  return (
                    <div className="mt-2 pt-2 border-t border-purple-200">
                      <p className="text-xs font-medium text-purple-800 mb-1">Allocation Preview (oldest first):</p>
                      <div className="max-h-24 overflow-y-auto space-y-1">
                        {allocations.map((alloc, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-gray-600">
                              {new Date(alloc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {alloc.farmer}
                              {alloc.isPartial && <span className="text-orange-600 ml-1">(Partial)</span>}
                            </span>
                            <span className={alloc.isPartial ? 'text-orange-600' : 'text-purple-600'}>
                              ₹{alloc.amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {remaining > 0 && (
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠️ ₹{remaining.toFixed(2)} exceeds pending amount
                        </p>
                      )}
                      {reimbAmount < selectedEmployeeForReimbursement.total_pending && (
                        <p className="text-xs text-blue-600 mt-1">
                          Remaining after this reimbursement: ₹{(selectedEmployeeForReimbursement.total_pending - reimbAmount).toFixed(2)}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reimbursement Date *</label>
                  <Input
                    type="date"
                    value={employeeReimbursementForm.payment_date}
                    onChange={(e) => setEmployeeReimbursementForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Mode *</label>
                  <Select 
                    value={employeeReimbursementForm.payment_mode} 
                    onValueChange={(v) => setEmployeeReimbursementForm(prev => ({ ...prev, payment_mode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Reference / Transaction ID {employeeReimbursementForm.payment_mode !== 'Cash' && <span className="text-red-500">*</span>}
                </label>
                <Input
                  value={employeeReimbursementForm.payment_reference}
                  onChange={(e) => setEmployeeReimbursementForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                  placeholder={employeeReimbursementForm.payment_mode === 'Cash' ? "Optional for cash" : "Required for non-cash payments"}
                  className={employeeReimbursementForm.payment_mode !== 'Cash' && !employeeReimbursementForm.payment_reference?.trim() ? 'border-orange-300' : ''}
                  data-testid="procurement-employee-reimbursement-reference"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Remarks</label>
                <Input
                  value={employeeReimbursementForm.remarks}
                  onChange={(e) => setEmployeeReimbursementForm(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Optional notes for this reimbursement..."
                />
              </div>
            </div>
            
            <div className="p-4 border-t flex gap-2 flex-shrink-0">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={() => { setShowEmployeeReimbursementModal(false); setSelectedEmployeeForReimbursement(null); }}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1 bg-purple-600 hover:bg-purple-700" 
                onClick={handleEmployeeBulkReimbursement}
                data-testid="confirm-procurement-employee-reimbursement-btn"
              >
                <IndianRupee size={14} className="mr-1" /> Confirm Reimbursement
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
