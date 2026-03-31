import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Plus, Trash2, Edit, Package, Truck, ClipboardCheck, UserPlus, Filter, Box, Download, FileSpreadsheet, FileText, Save, Loader2, Clock, Receipt, Printer, ChevronDown, ChevronUp, ChevronRight, Upload, Check, Pencil, X, TrendingUp, TrendingDown } from 'lucide-react';
import AutocompleteInput from '../../components/AutocompleteInput';

/*
 * QuickCommerce.js - Quick Commerce Module
 * ==========================================
 * 
 * TABLE OF CONTENTS (Search for SECTION: to navigate)
 * ====================================================
 * 1. STATE DECLARATIONS          (Line ~35)
 * 2. DATA LOADING (useEffect)    (Line ~170)
 * 3. HELPER FUNCTIONS            (Line ~280)
 * 4. EXPORT FUNCTIONS            (Line ~310)
 * 5. INDENT HANDLERS             (Line ~450)
 * 6. DISPATCH HANDLERS           (Line ~650)
 * 7. GRN HANDLERS                (Line ~850)
 * 8. INVOICE HANDLERS            (Line ~1150)
 * 9. CUSTOMER HANDLERS           (Line ~1450)
 * 10. PACKAGING HANDLERS         (Line ~1550)
 * 11. RENDER - Main Component    (Line ~1710)
 *     - INDENT TAB               (Line ~1800)
 *     - DISPATCH TAB             (Line ~2200)
 *     - GRN TAB                  (Line ~2600)
 *     - INVOICE TAB              (Line ~3100)
 * 12. MODALS                     (Line ~3400)
 * ====================================================
 */

export default function QuickCommerce() {
  const { t } = useTranslation();
  
  // ============================================================================
  // SECTION: STATE DECLARATIONS
  // ============================================================================
  
  // Data states
  const [indents, setIndents] = useState([]);
  const [filteredIndents, setFilteredIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [grns, setGrns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingVariants, setPackagingVariants] = useState([]);
  const [loading, setLoading] = useState(true);

  // GRN states (Ninjacart)
  const [grnDispatchItems, setGrnDispatchItems] = useState([]);  // Ninjacart dispatches for GRN table
  const [grnPendingDates, setGrnPendingDates] = useState([]);    // Dates with pending GRN
  const [grnMatchedItems, setGrnMatchedItems] = useState([]);    // Matched items from CSV upload
  const [uploadingGrn, setUploadingGrn] = useState(false);
  const [grnUploadResult, setGrnUploadResult] = useState(null);
  const [editingGrnItem, setEditingGrnItem] = useState(null);    // For inline GRN editing
  const [expandedPendingDates, setExpandedPendingDates] = useState({});  // For collapsible pending GRN by date
  const [expandedSavedDates, setExpandedSavedDates] = useState({});      // For collapsible saved GRN by date
  const [editingSavedGrn, setEditingSavedGrn] = useState(null);          // For editing saved GRN
  const [grnFilters, setGrnFilters] = useState({
    fromDate: '',
    toDate: '',
    productName: ''
  });
  // Manual GRN entry state for pending dispatches
  const [manualGrnData, setManualGrnData] = useState({});  // { dispatchId_productId: { grn_qty, rate } }
  const [editingPendingGrn, setEditingPendingGrn] = useState(null);  // Track which pending item is being edited

  // Dialog states
  const [openIndent, setOpenIndent] = useState(false);
  const [openCustomer, setOpenCustomer] = useState(false);
  const [openPackaging, setOpenPackaging] = useState(false);
  const [editingIndent, setEditingIndent] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingPackaging, setEditingPackaging] = useState(null);

  // Filter states - default to today
  const today = new Date().toISOString().split('T')[0];
  const [indentFilters, setIndentFilters] = useState({
    fromDate: today,
    toDate: today,
    customerName: '',
    productName: ''
  });
  
  // Customer Product Settings (lot sizes)
  const [customerProductSettings, setCustomerProductSettings] = useState([]);

  // Export states
  const [openExport, setOpenExport] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0]
  });

  // Get last used date from localStorage or default to today
  const getLastUsedDate = () => {
    try {
      const lastDate = localStorage.getItem('last_indent_date');
      if (lastDate) return lastDate;
    } catch (e) {}
    return new Date().toISOString().split('T')[0];
  };

  // Form states
  const [indentForm, setIndentForm] = useState({
    indent_date: getLastUsedDate(),
    customer_name: '',
    items: [{ product_id: '', product_name: '', product_unit: '', packaging_id: '', packaging_name: '', required_qty: '', lot_size: '', no_of_crates: 0, rate: '' }]
  });

  const [customerForm, setCustomerForm] = useState({
    name: '',
    contact_person: '',
    contact_number: '',
    address: ''
  });

  const [packagingForm, setPackagingForm] = useState({
    name: '',
    weight_gm: ''
  });

  // Dispatch states - log-based dispatch entries
  const [dispatchData, setDispatchData] = useState({});  // { indentId: { itemIndex: { supplied_qty, lot_size, no_of_crates } } }
  const [savingDispatch, setSavingDispatch] = useState({});  // Track which indents are being saved
  const [expandedIndents, setExpandedIndents] = useState({});  // Track which indent dispatch logs are expanded
  const [openDispatchDialog, setOpenDispatchDialog] = useState(false);
  const [currentDispatchIndent, setCurrentDispatchIndent] = useState(null);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);  // Dispatch date picker
  const [dispatchTime, setDispatchTime] = useState('');
  const [dispatchRemarks, setDispatchRemarks] = useState('');

  // Dispatch tab filters - default to today
  const [dispatchFilters, setDispatchFilters] = useState({
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    customerName: '',
    productName: ''
  });

  // Invoice states
  const [invoices, setInvoices] = useState([]);
  const [openInvoice, setOpenInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    customer_name: '',
    customer_type: 'standard',
    indent_id: '',
    dispatch_ids: [],
    items: [],
    subtotal: 0,
    discount: 0,
    total_amount: 0,
    remarks: ''
  });
  const [selectedItemsForInvoice, setSelectedItemsForInvoice] = useState({});  // { `${dispatchId}-${itemIndex}`: true }
  const [invoiceCustomerFilter, setInvoiceCustomerFilter] = useState('');
  const [invoiceDateFilter, setInvoiceDateFilter] = useState(new Date().toISOString().split('T')[0]);

  // Invoice list filters
  const [invoiceListFilters, setInvoiceListFilters] = useState({
    fromDate: '',
    toDate: '',
    customerName: '',
    productName: ''
  });

  // ============================================================================
  // SECTION: DATA LOADING (useEffect)
  // ============================================================================
  
  useEffect(() => {
    loadData();
    loadPackagingVariants();
  }, []);

  // Apply filters when indents or filters change
  useEffect(() => {
    applyIndentFilters();
  }, [indents, indentFilters]);

  const loadData = async () => {
    try {
      const [indentsRes, dispatchesRes, grnsRes, customersRes, productsRes, invoicesRes, settingsRes] = await Promise.all([
        api.get('/api/qc-indents'),
        api.get('/api/qc-dispatches'),
        api.get('/api/qc-grns'),
        api.get('/api/qc-customers'),
        api.get('/api/products'),
        api.get('/api/qc-invoices'),
        api.get('/api/customer-product-settings')
      ]);
      setIndents(indentsRes.data);
      setDispatches(dispatchesRes.data);
      setGrns(grnsRes.data);
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
      setInvoices(invoicesRes.data);
      setCustomerProductSettings(settingsRes.data || []);
      
      // Load GRN dispatch summary for Ninjacart
      try {
        const grnSummaryRes = await api.get('/api/qc-grns/dispatch-summary');
        // Handle new response format with items, pending_dates, total_pending
        const summaryData = grnSummaryRes.data;
        if (summaryData.items) {
          setGrnDispatchItems(summaryData.items);
          setGrnPendingDates(summaryData.pending_dates || []);
        } else {
          // Fallback for old format (array directly)
          setGrnDispatchItems(summaryData);
          setGrnPendingDates([]);
        }
      } catch (err) {
        console.log('GRN summary not available yet');
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Load packaging variants from localStorage
  const loadPackagingVariants = async () => {
    try {
      // Always fetch from API to ensure sync across devices
      const response = await api.get('/api/qc-packaging');
      if (response.data && response.data.length > 0) {
        setPackagingVariants(response.data);
      } else {
        // No data from API, use defaults for first time setup
        const defaults = [
          { id: '1', name: 'Packet 100 gm', weight_gm: 100 },
          { id: '2', name: 'Packet 250 gm', weight_gm: 250 },
          { id: '3', name: 'Without Roots 90-100 gm', weight_gm: 110 },
          { id: '4', name: 'With Roots 100 gm', weight_gm: 120 },
          { id: '5', name: 'Bunch 500 gm', weight_gm: 500 }
        ];
        setPackagingVariants(defaults);
      }
    } catch (e) {
      console.error('Failed to load packaging variants:', e);
      // Fallback to defaults on error
      const defaults = [
        { id: '1', name: 'Packet 100 gm', weight_gm: 100 },
        { id: '2', name: 'Packet 250 gm', weight_gm: 250 }
      ];
      setPackagingVariants(defaults);
    }
  };

  // Save packaging variant - now uses API
  const savePackagingVariant = async (variant) => {
    // This is called after API save, just update local state
    await loadPackagingVariants(); // Refresh from API
  };

  // Get lot size for a customer-product-packaging combination
  const getLotSizeForProduct = (customerId, productId, packagingId = null) => {
    const setting = customerProductSettings.find(s => 
      s.customer_id === customerId && 
      s.product_id === productId &&
      (packagingId ? s.packaging_id === packagingId : true)
    );
    return setting?.lot_size || '';
  };

  // Save lot size for customer-product combo
  const saveLotSize = async (customerId, customerName, productId, productName, packagingId, packagingName, lotSize) => {
    if (!lotSize || lotSize <= 0) return;
    try {
      await api.post('/api/customer-product-settings', {
        customer_id: customerId,
        customer_name: customerName,
        product_id: productId,
        product_name: productName,
        packaging_id: packagingId || null,
        packaging_name: packagingName || null,
        lot_size: parseFloat(lotSize)
      });
      // Refresh settings
      const res = await api.get('/api/customer-product-settings');
      setCustomerProductSettings(res.data || []);
    } catch (error) {
      console.error('Failed to save lot size:', error);
    }
  };

  // Apply filters to indents
  const applyIndentFilters = () => {
    let filtered = [...indents];
    
    if (indentFilters.fromDate) {
      filtered = filtered.filter(i => new Date(i.indent_date) >= new Date(indentFilters.fromDate));
    }
    if (indentFilters.toDate) {
      filtered = filtered.filter(i => new Date(i.indent_date) <= new Date(indentFilters.toDate));
    }
    if (indentFilters.customerName) {
      filtered = filtered.filter(i => 
        i.customer_name.toLowerCase().includes(indentFilters.customerName.toLowerCase())
      );
    }
    if (indentFilters.productName) {
      filtered = filtered.filter(i => 
        i.items?.some(item => 
          item.product_name.toLowerCase().includes(indentFilters.productName.toLowerCase())
        )
      );
    }
    
    setFilteredIndents(filtered);
  };

  const clearIndentFilters = () => {
    const today = new Date().toISOString().split('T')[0];
    setIndentFilters({ fromDate: today, toDate: today, customerName: '', productName: '' });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // ============================================================================
  // SECTION: EXPORT FUNCTIONS
  // ============================================================================
  
  const getIndentsForExport = () => {
    let filtered = [...indents];
    
    if (exportFilters.fromDate) {
      filtered = filtered.filter(i => new Date(i.indent_date) >= new Date(exportFilters.fromDate));
    }
    if (exportFilters.toDate) {
      filtered = filtered.filter(i => new Date(i.indent_date) <= new Date(exportFilters.toDate));
    }
    
    return filtered;
  };

  const exportToExcel = () => {
    const exportData = getIndentsForExport();
    if (exportData.length === 0) {
      toast.error('No indents found for selected date range');
      return;
    }

    // Flatten data for Excel
    const rows = [];
    exportData.forEach(indent => {
      indent.items?.forEach(item => {
        rows.push({
          'Date': formatDate(indent.indent_date),
          'Customer': indent.customer_name,
          'Product': item.product_name,
          'Packaging': item.packaging_name || '',
          'Unit': item.product_unit,
          'Quantity': item.required_qty,
          'Lot Size': item.lot_size,
          'Crates': item.no_of_crates,
          'Rate': item.rate || '',
          'Status': indent.status
        });
      });
    });

    // Create CSV content
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => headers.map(h => `"${row[h]}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `indents_${exportFilters.fromDate}_to_${exportFilters.toDate}.csv`;
    link.click();
    
    toast.success(`Exported ${rows.length} items to Excel`);
    setOpenExport(false);
  };

  const exportToPDF = () => {
    const exportData = getIndentsForExport();
    if (exportData.length === 0) {
      toast.error('No indents found for selected date range');
      return;
    }

    // Create printable HTML
    let htmlContent = `
      <html>
      <head>
        <title>Indent Report - ${exportFilters.fromDate} to ${exportFilters.toDate}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #14532D; }
          .date-range { text-align: center; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #14532D; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
          .text-right { text-align: right; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>FreshFlow - Indent Report</h1>
        <p class="date-range">From: ${formatDate(exportFilters.fromDate)} To: ${formatDate(exportFilters.toDate)}</p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Packaging</th>
              <th>Unit</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Lot Size</th>
              <th class="text-right">Crates</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    exportData.forEach(indent => {
      indent.items?.forEach((item, idx) => {
        htmlContent += `
          <tr>
            ${idx === 0 ? `<td rowspan="${indent.items.length}">${formatDate(indent.indent_date)}</td>` : ''}
            ${idx === 0 ? `<td rowspan="${indent.items.length}">${indent.customer_name}</td>` : ''}
            <td>${item.product_name}</td>
            <td>${item.packaging_name || '-'}</td>
            <td>${item.product_unit}</td>
            <td class="text-right">${item.required_qty}</td>
            <td class="text-right">${item.lot_size}</td>
            <td class="text-right">${item.no_of_crates}</td>
            ${idx === 0 ? `<td rowspan="${indent.items.length}">${indent.status}</td>` : ''}
          </tr>
        `;
      });
    });

    htmlContent += `
          </tbody>
        </table>
        <p class="footer">Generated on ${new Date().toLocaleString('en-IN')}</p>
      </body>
      </html>
    `;

    // Open in new window and print
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
    
    toast.success('PDF export initiated - use Print dialog to save as PDF');
    setOpenExport(false);
  };

  // ============================================================================
  // SECTION: INDENT HANDLERS
  // ============================================================================
  
  const handleAddIndentItem = () => {
    setIndentForm({
      ...indentForm,
      items: [...indentForm.items, { product_id: '', product_name: '', product_unit: '', packaging_id: '', packaging_name: '', required_qty: '', lot_size: '', no_of_crates: 0, rate: '' }]
    });
  };

  const handleRemoveIndentItem = (index) => {
    if (indentForm.items.length > 1) {
      const newItems = indentForm.items.filter((_, i) => i !== index);
      setIndentForm({ ...indentForm, items: newItems });
    }
  };

  const handleIndentItemChange = (index, field, value) => {
    const newItems = [...indentForm.items];
    newItems[index][field] = value;
    
    // Auto-calculate no_of_crates when required_qty or lot_size changes
    if (field === 'required_qty' || field === 'lot_size') {
      const qty = parseFloat(newItems[index].required_qty) || 0;
      const lotSize = parseInt(newItems[index].lot_size) || 1;
      newItems[index].no_of_crates = lotSize > 0 ? Math.ceil(qty / lotSize) : 0;
    }
    
    setIndentForm({ ...indentForm, items: newItems });
  };

  const handleProductSelect = (index, product) => {
    const newItems = [...indentForm.items];
    newItems[index].product_id = product.id;
    newItems[index].product_name = product.name;
    
    // Try to get saved lot size for this customer-product combo
    const customer = customers.find(c => c.name === indentForm.customer_name);
    if (customer) {
      const savedLotSize = getLotSizeForProduct(customer.id, product.id, newItems[index].packaging_id);
      if (savedLotSize) {
        newItems[index].lot_size = savedLotSize.toString();
        // Recalculate crates
        const qty = parseFloat(newItems[index].required_qty) || 0;
        newItems[index].no_of_crates = savedLotSize > 0 ? Math.ceil(qty / savedLotSize) : 0;
      }
    }
    
    setIndentForm({ ...indentForm, items: newItems });
  };

  // Handle packaging selection - auto-fill unit and lot size
  const handlePackagingSelect = (index, packaging) => {
    const newItems = [...indentForm.items];
    newItems[index].packaging_id = packaging.id;
    newItems[index].packaging_name = packaging.name;
    newItems[index].product_unit = `${packaging.weight_gm} gm`;  // Auto-set unit from packaging weight
    
    // Try to get saved lot size for this customer-product-packaging combo
    const customer = customers.find(c => c.name === indentForm.customer_name);
    if (customer && newItems[index].product_id) {
      const savedLotSize = getLotSizeForProduct(customer.id, newItems[index].product_id, packaging.id);
      if (savedLotSize) {
        newItems[index].lot_size = savedLotSize.toString();
        // Recalculate crates
        const qty = parseFloat(newItems[index].required_qty) || 0;
        newItems[index].no_of_crates = savedLotSize > 0 ? Math.ceil(qty / savedLotSize) : 0;
      }
    }
    
    setIndentForm({ ...indentForm, items: newItems });
  };

  const handleCustomerSelect = (customer) => {
    setIndentForm({ ...indentForm, customer_name: customer.name });
  };

  // Packaging management handlers
  const handleSubmitPackaging = async (e) => {
    e.preventDefault();
    
    if (!packagingForm.name || !packagingForm.weight_gm) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      if (editingPackaging) {
        // Update existing - delete and re-add since API may not have PUT
        await api.delete(`/api/qc-packaging/${editingPackaging.id}`);
        await api.post(`/api/qc-packaging?name=${encodeURIComponent(packagingForm.name)}&weight_gm=${packagingForm.weight_gm}`);
        toast.success('Packaging updated successfully');
      } else {
        // Add new
        await api.post(`/api/qc-packaging?name=${encodeURIComponent(packagingForm.name)}&weight_gm=${packagingForm.weight_gm}`);
        toast.success('Packaging added successfully');
      }
      
      // Refresh from API
      await loadPackagingVariants();
      resetPackagingForm();
      setOpenPackaging(false);
    } catch (error) {
      console.error('Error saving packaging:', error);
      toast.error('Failed to save packaging');
    }
  };

  const handleEditPackaging = (packaging) => {
    setEditingPackaging(packaging);
    setPackagingForm({
      name: packaging.name,
      weight_gm: packaging.weight_gm.toString()
    });
    setOpenPackaging(true);
  };

  const handleDeletePackaging = async (packagingId) => {
    if (!window.confirm('Are you sure you want to delete this packaging?')) return;
    
    try {
      await api.delete(`/api/qc-packaging/${packagingId}`);
      await loadPackagingVariants(); // Refresh from API
      toast.success('Packaging deleted successfully');
    } catch (error) {
      console.error('Error deleting packaging:', error);
      toast.error('Failed to delete packaging');
    }
  };

  const resetPackagingForm = () => {
    setEditingPackaging(null);
    setPackagingForm({ name: '', weight_gm: '' });
  };

  const handleSubmitIndent = async (e) => {
    e.preventDefault();
    
    if (!indentForm.customer_name) {
      toast.error('Please select a customer');
      return;
    }

    const validItems = indentForm.items.filter(item => 
      item.product_name && item.required_qty && item.lot_size
    );

    if (validItems.length === 0) {
      toast.error('Please add at least one product with quantity and lot size');
      return;
    }

    try {
      // Save the date for next time
      localStorage.setItem('last_indent_date', indentForm.indent_date);
      
      // Save lot sizes for customer-product combinations (for future auto-fill)
      const customer = customers.find(c => c.name === indentForm.customer_name);
      if (customer) {
        for (const item of validItems) {
          await saveLotSize(
            customer.id,
            customer.name,
            item.product_id,
            item.product_name,
            item.packaging_id,
            item.packaging_name,
            item.lot_size
          );
        }
      }

      const payload = {
        indent_date: new Date(indentForm.indent_date).toISOString(),
        customer_name: indentForm.customer_name,
        items: validItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_unit: item.product_unit,
          packaging_id: item.packaging_id || '',
          packaging_name: item.packaging_name || '',
          required_qty: parseFloat(item.required_qty),
          lot_size: parseInt(item.lot_size),
          no_of_crates: item.no_of_crates,
          rate: item.rate ? parseFloat(item.rate) : null
        })),
        status: 'pending'
      };

      if (editingIndent) {
        await api.put(`/api/qc-indents/${editingIndent.id}`, payload);
        toast.success('Indent updated successfully');
      } else {
        await api.post('/api/qc-indents', payload);
        toast.success('Indent created successfully');
      }

      setOpenIndent(false);
      resetIndentForm();
      loadData();
    } catch (error) {
      toast.error('Failed to save indent');
    }
  };

  const handleEditIndent = (indent) => {
    setEditingIndent(indent);
    setIndentForm({
      indent_date: new Date(indent.indent_date).toISOString().split('T')[0],
      customer_name: indent.customer_name,
      items: indent.items.map(item => ({
        ...item,
        required_qty: item.required_qty.toString(),
        lot_size: item.lot_size.toString(),
        packaging_id: item.packaging_id || '',
        packaging_name: item.packaging_name || '',
        rate: item.rate ? item.rate.toString() : ''
      }))
    });
    setOpenIndent(true);
  };

  const handleDeleteIndent = async (indentId) => {
    if (!window.confirm('Are you sure you want to delete this indent?')) return;
    
    try {
      await api.delete(`/api/qc-indents/${indentId}`);
      toast.success('Indent deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete indent');
    }
  };

  const resetIndentForm = () => {
    setEditingIndent(null);
    setIndentForm({
      indent_date: getLastUsedDate(),
      customer_name: '',
      items: [{ product_id: '', product_name: '', product_unit: '', packaging_id: '', packaging_name: '', required_qty: '', lot_size: '', no_of_crates: 0, rate: '' }]
    });
  };

  // ============================================================================
  // SECTION: CUSTOMER HANDLERS
  // ============================================================================
  
  const handleSubmitCustomer = async (e) => {
    e.preventDefault();
    
    try {
      if (editingCustomer) {
        await api.put(`/api/qc-customers/${editingCustomer.id}`, customerForm);
        toast.success('Customer updated successfully');
      } else {
        await api.post('/api/qc-customers', customerForm);
        toast.success('Customer added successfully');
      }
      setOpenCustomer(false);
      resetCustomerForm();
      loadData();
    } catch (error) {
      toast.error('Failed to save customer');
    }
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name,
      contact_person: customer.contact_person || '',
      contact_number: customer.contact_number || '',
      address: customer.address || ''
    });
    setOpenCustomer(true);
  };

  const handleDeleteCustomer = async (customerId) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    
    try {
      await api.delete(`/api/qc-customers/${customerId}`);
      toast.success('Customer deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete customer');
    }
  };

  const resetCustomerForm = () => {
    setEditingCustomer(null);
    setCustomerForm({ name: '', contact_person: '', contact_number: '', address: '' });
  };

  // ============================================================================
  // SECTION: DISPATCH HANDLERS - Log-based dispatch entries
  // ============================================================================
  
  const handleSuppliedQtyChange = (indentId, itemIndex, field, value) => {
    setDispatchData(prev => {
      const existingItem = prev[indentId]?.[itemIndex] || {};
      return {
        ...prev,
        [indentId]: {
          ...prev[indentId],
          [itemIndex]: typeof existingItem === 'object' 
            ? { ...existingItem, [field]: value }
            : { supplied_qty: field === 'supplied_qty' ? value : '', [field]: value }
        }
      };
    });
  };

  // Helper to get dispatch item value
  const getDispatchItemValue = (indentId, itemIndex, field) => {
    const itemData = dispatchData[indentId]?.[itemIndex];
    if (typeof itemData === 'object') {
      return itemData[field] || '';
    }
    // Legacy: if it's just a string (old format), treat as supplied_qty
    return field === 'supplied_qty' ? (itemData || '') : '';
  };

  const getDispatchedQtyForIndent = (indentId, productId) => {
    // Sum up all dispatched quantities for this product from all dispatch logs
    return dispatches
      .filter(d => d.indent_id === indentId)
      .reduce((total, dispatch) => {
        const item = dispatch.items?.find(i => i.product_id === productId);
        return total + (item?.supplied_qty || 0);
      }, 0);
  };

  const getRemainingQty = (indent, item) => {
    const dispatched = getDispatchedQtyForIndent(indent.id, item.product_id);
    return Math.max(0, item.required_qty - dispatched);
  };

  const getDispatchLogsForIndent = (indentId) => {
    return dispatches
      .filter(d => d.indent_id === indentId)
      .sort((a, b) => new Date(b.dispatch_date) - new Date(a.dispatch_date));
  };

  const toggleExpandIndent = (indentId) => {
    setExpandedIndents(prev => ({
      ...prev,
      [indentId]: !prev[indentId]
    }));
  };

  const openNewDispatchDialog = (indent) => {
    setCurrentDispatchIndent(indent);
    setDispatchDate(new Date().toISOString().split('T')[0]);  // Default to today
    setDispatchTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
    setDispatchRemarks('');
    // Initialize with empty quantities - user will fill only what they want to dispatch
    // Show lot_size from indent but don't pre-fill supplied qty
    const newDispatchData = {};
    indent.items?.forEach((item, idx) => {
      newDispatchData[idx] = {
        supplied_qty: '',  // Empty by default - user fills only what they dispatch
        lot_size: item.lot_size?.toString() || '',
        no_of_crates: '0'
      };
    });
    setDispatchData(prev => ({ ...prev, [indent.id]: newDispatchData }));
    setOpenDispatchDialog(true);
  };

  const handleSaveDispatch = async () => {
    if (!currentDispatchIndent) return;

    const indent = currentDispatchIndent;
    
    // Validate that at least one item has supplied qty > 0
    const hasSuppliedQty = indent.items.some((_, idx) => {
      const itemData = dispatchData[indent.id]?.[idx];
      const qty = typeof itemData === 'object' ? itemData.supplied_qty : itemData;
      return qty !== '' && parseFloat(qty) > 0;
    });

    if (!hasSuppliedQty) {
      toast.error('Please enter supplied quantity for at least one item');
      return;
    }

    setSavingDispatch(prev => ({ ...prev, [indent.id]: true }));

    try {
      const dispatchItems = indent.items.map((item, idx) => {
        const itemData = dispatchData[indent.id]?.[idx] || {};
        const suppliedQty = parseFloat(typeof itemData === 'object' ? itemData.supplied_qty : itemData) || 0;
        const lotSize = parseInt(typeof itemData === 'object' ? itemData.lot_size : item.lot_size) || item.lot_size;
        const crates = parseInt(typeof itemData === 'object' ? itemData.no_of_crates : null) || (lotSize > 0 ? Math.ceil(suppliedQty / lotSize) : 0);
        
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          product_unit: item.product_unit,
          packaging_id: item.packaging_id || '',
          packaging_name: item.packaging_name || '',
          indent_qty: item.required_qty,
          supplied_qty: suppliedQty,
          lot_size: lotSize,
          no_of_crates: crates,
          rate: item.rate || null
        };
      }).filter(item => item.supplied_qty > 0);  // Only include items with qty > 0

      const payload = {
        dispatch_date: new Date(dispatchDate).toISOString(),
        dispatch_time: dispatchTime,
        indent_id: indent.id,
        customer_name: indent.customer_name,
        items: dispatchItems,
        remarks: dispatchRemarks
      };

      await api.post('/api/qc-dispatches', payload);
      toast.success('Dispatch entry saved successfully');

      // Clear local state and close dialog
      setDispatchData(prev => {
        const newData = { ...prev };
        delete newData[indent.id];
        return newData;
      });
      setOpenDispatchDialog(false);
      setCurrentDispatchIndent(null);
      loadData();
    } catch (error) {
      console.error('Error saving dispatch:', error);
      toast.error('Failed to save dispatch');
    } finally {
      setSavingDispatch(prev => ({ ...prev, [indent.id]: false }));
    }
  };

  const handleDeleteDispatch = async (dispatchId) => {
    if (!window.confirm('Are you sure you want to delete this dispatch entry?')) return;
    
    try {
      await api.delete(`/api/qc-dispatches/${dispatchId}`);
      toast.success('Dispatch entry deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete dispatch entry');
    }
  };

  // ============================================================================
  // SECTION: INVOICE HANDLERS - Day-based invoicing with multiple product selection
  // ============================================================================
  
  const getDispatchedItemsForCustomer = (customerName, dateFilter) => {
    // Get all dispatched items for a customer on a specific date
    const items = [];
    const filterDate = dateFilter ? new Date(dateFilter).toDateString() : null;
    
    dispatches
      .filter(d => d.customer_name === customerName)
      .filter(d => !filterDate || new Date(d.dispatch_date).toDateString() === filterDate)
      .forEach(dispatch => {
        dispatch.items?.forEach((item, itemIndex) => {
          items.push({
            ...item,
            dispatch_id: dispatch.id,
            dispatch_date: dispatch.dispatch_date,
            dispatch_time: dispatch.dispatch_time,
            item_index: itemIndex,
            key: `${dispatch.id}-${itemIndex}`
          });
        });
      });
    
    return items;
  };

  const openCreateInvoiceDialog = (customerName = '') => {
    setInvoiceCustomerFilter(customerName);
    setInvoiceDateFilter(new Date().toISOString().split('T')[0]);
    setSelectedItemsForInvoice({});
    setEditingInvoice(null);
    
    const customerType = customerName.toLowerCase().includes('ninja') ? 'ninjacart' : 'standard';
    
    setInvoiceForm({
      invoice_date: new Date().toISOString().split('T')[0],
      customer_name: customerName,
      customer_type: customerType,
      indent_id: '',
      dispatch_ids: [],
      items: [],
      subtotal: 0,
      discount: 0,
      total_amount: 0,
      remarks: ''
    });
    
    setOpenInvoice(true);
  };

  const toggleItemSelection = (itemKey) => {
    setSelectedItemsForInvoice(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const selectAllItems = (items) => {
    const newSelection = {};
    items.forEach(item => {
      newSelection[item.key] = true;
    });
    setSelectedItemsForInvoice(newSelection);
  };

  const clearItemSelection = () => {
    setSelectedItemsForInvoice({});
  };

  const getSelectedInvoiceItems = () => {
    const items = getDispatchedItemsForCustomer(invoiceForm.customer_name, invoiceDateFilter);
    return items.filter(item => selectedItemsForInvoice[item.key]);
  };

  const handleSaveInvoice = async () => {
    try {
      let finalItems = [];
      let dispatchIds = [];
      
      if (editingInvoice) {
        // Use existing items for edit
        finalItems = invoiceForm.items;
        dispatchIds = invoiceForm.dispatch_ids;
      } else {
        // Get selected items for new invoice
        const selectedItems = getSelectedInvoiceItems();
        if (selectedItems.length === 0) {
          toast.error('Please select at least one item for the invoice');
          return;
        }
        
        // Aggregate items by product+packaging
        const itemsMap = {};
        selectedItems.forEach(item => {
          const key = `${item.product_id}-${item.packaging_id || ''}`;
          if (itemsMap[key]) {
            itemsMap[key].supplied_qty += item.supplied_qty;
            itemsMap[key].no_of_crates += item.no_of_crates;
          } else {
            itemsMap[key] = { 
              ...item, 
              receiving_qty: null,  // Keep blank - to be filled by customer
              amount: (item.supplied_qty || 0) * (item.rate || 0)
            };
          }
          if (!dispatchIds.includes(item.dispatch_id)) {
            dispatchIds.push(item.dispatch_id);
          }
        });
        
        finalItems = Object.values(itemsMap);
      }

      const subtotal = finalItems.reduce((sum, item) => sum + ((item.supplied_qty || 0) * (item.rate || 0)), 0);

      const payload = {
        invoice_date: new Date(invoiceForm.invoice_date).toISOString(),
        customer_name: invoiceForm.customer_name,
        customer_type: invoiceForm.customer_type,
        indent_id: invoiceForm.indent_id || '',
        dispatch_ids: dispatchIds,
        items: finalItems,
        subtotal: editingInvoice ? invoiceForm.subtotal : subtotal,
        discount: invoiceForm.discount || 0,
        total_amount: editingInvoice ? invoiceForm.total_amount : (subtotal - (invoiceForm.discount || 0)),
        remarks: invoiceForm.remarks
      };

      if (editingInvoice) {
        await api.put(`/api/qc-invoices/${editingInvoice.id}`, payload);
        toast.success('Invoice updated successfully');
      } else {
        const response = await api.post('/api/qc-invoices', payload);
        toast.success(`Invoice ${response.data.invoice_number} created successfully`);
      }

      setOpenInvoice(false);
      setEditingInvoice(null);
      setSelectedItemsForInvoice({});
      loadData();
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error('Failed to save invoice');
    }
  };

  const handleEditInvoice = (invoice) => {
    setInvoiceForm({
      invoice_date: new Date(invoice.invoice_date).toISOString().split('T')[0],
      customer_name: invoice.customer_name,
      customer_type: invoice.customer_type,
      indent_id: invoice.indent_id || '',
      dispatch_ids: invoice.dispatch_ids || [],
      items: invoice.items || [],
      subtotal: invoice.subtotal || 0,
      discount: invoice.discount || 0,
      total_amount: invoice.total_amount || 0,
      remarks: invoice.remarks || ''
    });
    setEditingInvoice(invoice);
    setOpenInvoice(true);
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return;
    
    try {
      await api.delete(`/api/qc-invoices/${invoiceId}`);
      toast.success('Invoice deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete invoice');
    }
  };

  const updateInvoiceItem = (index, field, value) => {
    setInvoiceForm(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      
      // Recalculate amount
      if (field === 'supplied_qty' || field === 'rate') {
        newItems[index].amount = (parseFloat(newItems[index].supplied_qty) || 0) * (parseFloat(newItems[index].rate) || 0);
      }
      
      // Recalculate totals
      const subtotal = newItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      return {
        ...prev,
        items: newItems,
        subtotal: subtotal,
        total_amount: subtotal - (prev.discount || 0)
      };
    });
  };

  // Generate printable invoice HTML
  const generateInvoicePDF = (invoice) => {
    const isNinjacart = invoice.customer_type === 'ninjacart';
    const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    
    // Company Details
    const companyName = "Mr Organix";
    const companyPhone = "8530418069";
    const companyEmail = "mrorganixmushroom@gmail.com";
    const companyState = "27-Maharashtra";
    const companyFullAddress = `MR ORGANIX M.NO. 1638,
Taleranwadi, Kesnand Taluka - Haveli
Pune - 412207, Maharashtra
Phone: ${companyPhone}
Email: ${companyEmail}`;
    
    // Customer address (from invoice data or default)
    const customerAddress = invoice.customer_address || invoice.address || '';
    
    // Calculate totals
    let totalIndent = 0;
    let totalSupplied = 0;
    let totalCrates = 0;
    let totalAmount = 0;
    
    invoice.items?.forEach(item => {
      totalIndent += item.indent_qty || item.supplied_qty || 0;
      totalSupplied += item.supplied_qty || 0;
      totalCrates += item.no_of_crates || 0;
      const rate = item.rate || item.mrp || 0;
      totalAmount += item.amount || (item.supplied_qty * rate) || 0;
    });
    
    // Number to words
    const numberToWords = (num) => {
      if (num === 0) return "Zero Rupees Only";
      const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      const below100 = (n) => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
      const below1000 = (n) => n < 100 ? below100(n) : ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + below100(n%100) : '');
      num = Math.floor(num);
      if (num < 1000) return below1000(num) + ' Rupees Only';
      if (num < 100000) return below1000(Math.floor(num/1000)) + ' Thousand ' + (num%1000 ? below1000(num%1000) : '') + ' Rupees Only';
      if (num < 10000000) return below1000(Math.floor(num/100000)) + ' Lakh ' + (num%100000 ? numberToWords(num%100000).replace(' Rupees Only', '') : '') + ' Rupees Only';
      return below1000(Math.floor(num/10000000)) + ' Crore ' + (num%10000000 ? numberToWords(num%10000000).replace(' Rupees Only', '') : '') + ' Rupees Only';
    };
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; background: white; font-size: 12px; }
          
          .tax-invoice-title { text-align: center; font-size: 14px; font-weight: bold; margin-bottom: 5px; }
          .company-name { text-align: center; font-size: 22px; font-weight: bold; color: #1a1a2e; margin-bottom: 15px; }
          
          .header-section { border: 1px solid #000; margin-bottom: 15px; }
          .header-row { display: flex; border-bottom: 1px solid #000; }
          .header-row:last-child { border-bottom: none; }
          .header-cell { padding: 10px; flex: 1; }
          .header-cell:first-child { border-right: 1px solid #000; }
          .header-cell .label { font-weight: bold; font-size: 10px; color: #333; margin-bottom: 5px; }
          
          .items-section { border: 1px solid #000; margin-bottom: 15px; }
          .items-table { width: 100%; border-collapse: collapse; }
          .items-table th { background: #fff; border-bottom: 1px solid #000; padding: 10px 8px; font-size: 11px; font-weight: bold; text-align: center; }
          .items-table th:not(:last-child) { border-right: 1px solid #000; }
          .items-table td { padding: 8px; font-size: 11px; text-align: center; border-bottom: 1px solid #000; }
          .items-table td:not(:last-child) { border-right: 1px solid #000; }
          .items-table td.text-left { text-align: left; }
          .items-table td.text-right { text-align: right; }
          .items-table tr:last-child td { border-bottom: none; }
          .items-table .total-row { background: #f5f5f5; font-weight: bold; }
          
          .amount-words-section { border: 1px solid #000; padding: 10px; margin-bottom: 15px; font-size: 11px; }
          
          .footer-section { border: 1px solid #000; display: flex; }
          .footer-left { flex: 1; padding: 10px; border-right: 1px solid #000; font-size: 10px; line-height: 1.6; }
          .footer-right { width: 200px; padding: 10px; text-align: right; font-size: 10px; }
          .footer-left .terms-header { font-weight: bold; margin-bottom: 8px; }
          .footer-right .signatory-label { font-weight: bold; margin-bottom: 50px; }
          .footer-right .signatory-name { font-weight: bold; }
          
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="tax-invoice-title">Tax Invoice</div>
        <div class="company-name">${companyName}</div>
        
        <div class="header-section">
          <div class="header-row">
            <div class="header-cell">
              <div class="label">Bill To:</div>
              <strong>${invoice.customer_name}</strong><br/>
              ${customerAddress ? customerAddress.replace(/\n/g, '<br/>') : ''}
            </div>
            <div class="header-cell">
              <div class="label">Invoice Details:</div>
              Invoice No: <strong>${invoice.invoice_number}</strong><br/>
              Date: ${invoiceDate}<br/>
              Place Of Supply: ${companyState}
            </div>
          </div>
        </div>
        
        <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th style="width: 180px; text-align: left;">Item name</th>
                <th>Indent</th>
                <th>Supplied Qty</th>
                ${isNinjacart ? `
                  <th>Lot Size</th>
                  <th>Crates</th>
                ` : `
                  <th>Rate</th>
                  <th>Amount</th>
                `}
                <th>Receiving</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items?.map((item, idx) => {
                const rate = item.rate || item.mrp || 0;
                const amount = item.amount || (item.supplied_qty * rate) || 0;
                const indentQty = item.indent_qty || item.supplied_qty || 0;
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="text-left">${item.product_name}${item.packaging_name ? ' - ' + item.packaging_name : ''}</td>
                    <td>${indentQty}</td>
                    <td>${item.supplied_qty || 0}</td>
                    ${isNinjacart ? `
                      <td>${item.lot_size || '-'}</td>
                      <td>${item.no_of_crates || '-'}</td>
                    ` : `
                      <td class="text-right">${rate ? '₹' + rate.toFixed(2) : '-'}</td>
                      <td class="text-right">${amount ? '₹' + amount.toFixed(2) : '-'}</td>
                    `}
                    <td></td>
                  </tr>
                `;
              }).join('')}
              <tr class="total-row">
                <td></td>
                <td class="text-left"><strong>Total</strong></td>
                <td><strong>${totalIndent}</strong></td>
                <td><strong>${totalSupplied}</strong></td>
                ${isNinjacart ? `
                  <td></td>
                  <td><strong>${totalCrates}</strong></td>
                ` : `
                  <td></td>
                  <td class="text-right"><strong>₹${totalAmount.toFixed(2)}</strong></td>
                `}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        ${!isNinjacart ? `
          <div class="amount-words-section">
            <strong>Total Amount in words:</strong> ${numberToWords(totalAmount)}
          </div>
        ` : ''}
        
        <div class="footer-section">
          <div class="footer-left">
            <div class="terms-header">Terms & Conditions:</div>
            Thanks for doing business with us!
            <br/><br/>
            MR ORGANIX M.NO. 1638,<br/>
            Taleranwadi, Kesnand Taluka - Haveli<br/>
            Pune - 412207, Maharashtra<br/>
            Phone: ${companyPhone}<br/>
            Email: ${companyEmail}
          </div>
          <div class="footer-right">
            <div class="signatory-label">For ${companyName}:</div>
            <div>Authorized Signatory</div>
            <div class="signatory-name">Ankush K.</div>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // ============================================================================
  // SECTION: GRN HANDLERS - Ninjacart CSV/Excel Upload
  // ============================================================================
  
  const handleGrnCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      toast.error('Please upload a CSV or Excel (.xlsx, .xls) file');
      return;
    }

    setUploadingGrn(true);
    setGrnUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/qc-grns/upload-ninjacart-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setGrnUploadResult(response.data);
      setGrnMatchedItems(response.data.matched_items || []);
      
      // Show warnings for skipped rows
      if (response.data.warnings?.length > 0) {
        response.data.warnings.forEach(warning => {
          toast.warning(warning, { duration: 5000 });
        });
      }
      
      if (response.data.matched_items?.length > 0) {
        toast.success(`Matched ${response.data.matched_items.length} items from file`);
      } else {
        toast.warning('No matching items found. Make sure dispatch dates match.');
      }
    } catch (error) {
      console.error('GRN upload error:', error);
      toast.error(error.response?.data?.detail || 'Failed to process file');
    } finally {
      setUploadingGrn(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleSaveGrn = async () => {
    if (grnMatchedItems.length === 0) {
      toast.error('No items to save');
      return;
    }

    try {
      const totalSupplied = grnMatchedItems.reduce((sum, item) => sum + item.supplied_qty, 0);
      const totalGrn = grnMatchedItems.reduce((sum, item) => sum + item.grn_qty, 0);
      const totalDifference = grnMatchedItems.reduce((sum, item) => sum + item.difference, 0);

      const payload = {
        grn_date: new Date().toISOString(),
        customer_name: 'Ninjacart',
        file_name: grnUploadResult?.file_name,
        items: grnMatchedItems,
        total_supplied: totalSupplied,
        total_grn: totalGrn,
        total_difference: totalDifference
      };

      // Check if we're editing an existing GRN
      const editingGrnId = grnUploadResult?.editing_grn_id;
      
      if (editingGrnId) {
        // Update existing GRN
        await api.put(`/api/qc-grns/${editingGrnId}`, payload);
        toast.success('GRN updated successfully');
      } else {
        // Create new GRN
        await api.post('/api/qc-grns', payload);
        toast.success('GRN saved successfully');
      }
      
      setGrnMatchedItems([]);
      setGrnUploadResult(null);
      loadData();
    } catch (error) {
      console.error('Save GRN error:', error);
      toast.error(grnUploadResult?.editing_grn_id ? 'Failed to update GRN' : 'Failed to save GRN');
    }
  };

  const handleDeleteGrn = async (grnId) => {
    if (!window.confirm('Are you sure you want to delete this entire GRN record?')) return;
    
    try {
      await api.delete(`/api/qc-grns/${grnId}`);
      toast.success('GRN deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete GRN');
    }
  };

  // Delete a single item from a saved GRN
  const handleDeleteSavedGrnItem = async (grnId, itemIndex) => {
    if (!window.confirm('Remove this item from GRN?')) return;
    
    try {
      const response = await api.delete(`/api/qc-grns/${grnId}/items/${itemIndex}`);
      toast.success('Item removed from GRN');
      loadData();
    } catch (error) {
      console.error('Delete GRN item error:', error);
      toast.error('Failed to remove item');
    }
  };

  // Delete a pending dispatch item (removes from dispatch)
  const handleDeletePendingDispatchItem = async (dispatchId, productId) => {
    if (!window.confirm('Remove this item from pending dispatches? This will delete it from the dispatch record.')) return;
    
    try {
      const response = await api.delete(`/api/qc-dispatches/${dispatchId}/items/${productId}`);
      toast.success('Item removed from dispatch');
      loadData();
    } catch (error) {
      console.error('Delete pending dispatch item error:', error);
      toast.error('Failed to remove item');
    }
  };

  // GRN Item Edit/Delete handlers (for matched items before saving)
  const handleEditGrnItem = (index) => {
    setEditingGrnItem(index);
  };

  const handleUpdateGrnItem = (index, field, value) => {
    setGrnMatchedItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      
      // Update the field
      if (field === 'grn_qty') {
        const grnQty = parseFloat(value) || 0;
        item.grn_qty = grnQty;
        item.difference = grnQty - item.supplied_qty;
        
        // Recalculate amount and loss/gain
        if (item.rate_type === 'per_kg' && item.packaging_weight_gm > 0) {
          // For Kg-based: grn_qty is in units, convert to Kg for amount
          const grnKg = (grnQty * item.packaging_weight_gm) / 1000;
          item.grn_qty_kg = grnKg;
          item.amount = grnKg * (item.rate_per_kg || 0);
          const diffKg = (item.difference * item.packaging_weight_gm) / 1000;
          item.loss_gain_amount = diffKg * (item.rate_per_kg || 0);
        } else {
          item.amount = grnQty * (item.rate_per_unit || 0);
          item.loss_gain_amount = item.difference * (item.rate_per_unit || 0);
        }
      } else if (field === 'rate_per_unit') {
        const rate = parseFloat(value) || 0;
        item.rate_per_unit = rate;
        if (item.rate_type === 'per_kg') {
          // Update rate_per_kg based on packaging weight
          item.rate_per_kg = item.packaging_weight_gm > 0 ? (rate * 1000) / item.packaging_weight_gm : rate;
          const grnKg = item.grn_qty_kg || ((item.grn_qty * item.packaging_weight_gm) / 1000);
          item.amount = grnKg * item.rate_per_kg;
          const diffKg = (item.difference * item.packaging_weight_gm) / 1000;
          item.loss_gain_amount = diffKg * item.rate_per_kg;
        } else {
          item.amount = item.grn_qty * rate;
          item.loss_gain_amount = item.difference * rate;
        }
      } else if (field === 'rate_per_kg') {
        const rateKg = parseFloat(value) || 0;
        item.rate_per_kg = rateKg;
        item.rate_per_unit = item.packaging_weight_gm > 0 ? (rateKg * item.packaging_weight_gm) / 1000 : rateKg;
        const grnKg = item.grn_qty_kg || ((item.grn_qty * item.packaging_weight_gm) / 1000);
        item.amount = grnKg * rateKg;
        const diffKg = (item.difference * item.packaging_weight_gm) / 1000;
        item.loss_gain_amount = diffKg * rateKg;
      }
      
      updated[index] = item;
      return updated;
    });
  };

  const handleSaveGrnItemEdit = () => {
    setEditingGrnItem(null);
    toast.success('Item updated');
  };

  const handleDeleteGrnItem = (index) => {
    if (!window.confirm('Remove this item from GRN?')) return;
    setGrnMatchedItems(prev => prev.filter((_, i) => i !== index));
    toast.success('Item removed');
  };

  // Filter GRN matched items
  const filteredGrnItems = grnMatchedItems.filter(item => {
    // Date filter
    if (grnFilters.fromDate) {
      const itemDate = item.dispatch_date;
      if (itemDate < grnFilters.fromDate) return false;
    }
    if (grnFilters.toDate) {
      const itemDate = item.dispatch_date;
      if (itemDate > grnFilters.toDate) return false;
    }
    // Product filter
    if (grnFilters.productName) {
      if (!item.product_name?.toLowerCase().includes(grnFilters.productName.toLowerCase())) return false;
    }
    return true;
  });

  // Handle saving manual GRN entries
  const handleSaveManualGrn = async () => {
    const itemsToSave = [];
    
    // Build items from manualGrnData
    Object.keys(manualGrnData).forEach(key => {
      const data = manualGrnData[key];
      if (data.grn_qty) {
        // Key format: dispatchId_productId_idx
        const parts = key.split('_');
        const dispatchId = parts[0];
        const productId = parts[1];
        
        const dispatchItem = grnDispatchItems.find(
          item => item.dispatch_id === dispatchId && item.product_id === productId
        );
        
        if (dispatchItem) {
          const grnQty = parseFloat(data.grn_qty) || 0;
          const rate = parseFloat(data.rate) || 0;
          const difference = grnQty - dispatchItem.supplied_qty;
          const amount = grnQty * rate;
          const lossGain = difference * rate;
          
          itemsToSave.push({
            dispatch_id: dispatchItem.dispatch_id,
            dispatch_date: dispatchItem.dispatch_date?.split('T')[0] || dispatchItem.dispatch_date || new Date().toISOString().split('T')[0],
            product_id: dispatchItem.product_id || 'unknown',
            product_name: dispatchItem.product_name,
            product_unit: dispatchItem.product_unit || 'unit',
            packaging_id: dispatchItem.packaging_id || '',
            packaging_name: dispatchItem.packaging_name || '',
            supplied_qty: dispatchItem.supplied_qty,
            grn_qty: grnQty,
            difference: difference,
            rate_per_unit: rate,
            amount: amount,
            loss_gain_amount: lossGain,
            rate_type: 'manual'
          });
        }
      }
    });
    
    if (itemsToSave.length === 0) {
      toast.error('No GRN data to save');
      return;
    }
    
    try {
      const totalSupplied = itemsToSave.reduce((sum, item) => sum + item.supplied_qty, 0);
      const totalGrn = itemsToSave.reduce((sum, item) => sum + item.grn_qty, 0);
      const totalDifference = itemsToSave.reduce((sum, item) => sum + item.difference, 0);
      
      const payload = {
        grn_date: new Date().toISOString(),
        customer_name: 'Ninjacart',
        file_name: 'Manual Entry',
        items: itemsToSave,
        total_supplied: totalSupplied,
        total_grn: totalGrn,
        total_difference: totalDifference
      };
      
      await api.post('/api/qc-grns', payload);
      toast.success('Manual GRN saved successfully');
      setManualGrnData({});
      setEditingPendingGrn(null);
      loadData();
    } catch (error) {
      console.error('Save manual GRN error:', error);
      toast.error('Failed to save manual GRN');
    }
  };

  // Export GRN to CSV
  const exportGrnToCsv = (items) => {
    if (!items || items.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Date', 'Customer', 'Product', 'SKU Name', 'Packaging', 'Supplied Qty', 'GRN Qty', 'Difference', 'Rate Type', 'Rate', 'Amount (₹)', 'Loss/Gain (₹)'];
    const rows = items.map(item => {
      const lossGain = item.loss_gain_amount !== undefined 
        ? item.loss_gain_amount 
        : (item.difference || 0) * (item.rate_per_unit || 0);
      const rateDisplay = item.rate_per_kg 
        ? `${item.rate_per_kg?.toFixed(2)}/Kg` 
        : `${item.rate_per_unit?.toFixed(2)}/Pc`;
      return [
        item.dispatch_date,
        'Ninjacart',
        item.product_name,
        item.sku_name || '-',
        item.packaging_name || '-',
        item.supplied_qty,
        item.grn_qty,
        item.difference,
        item.rate_type || '-',
        rateDisplay,
        item.amount?.toFixed(2) || '0',
        lossGain.toFixed(2)
      ];
    });

    // Add totals row
    const totalSupplied = items.reduce((sum, i) => sum + i.supplied_qty, 0);
    const totalGrn = items.reduce((sum, i) => sum + i.grn_qty, 0);
    const totalDiff = items.reduce((sum, i) => sum + i.difference, 0);
    const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    const totalLossGain = items.reduce((sum, i) => {
      const itemLossGain = i.loss_gain_amount !== undefined 
        ? i.loss_gain_amount 
        : (i.difference || 0) * (i.rate_per_unit || 0);
      return sum + itemLossGain;
    }, 0);
    
    rows.push(['TOTAL', '', '', '', '', totalSupplied, totalGrn.toFixed(2), totalDiff.toFixed(2), '', '', totalAmount.toFixed(2), totalLossGain.toFixed(2)]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `GRN_Ninjacart_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('GRN exported to CSV');
  };

  // Calculate totals for indent/dispatch summary
  const calculateTotals = (items, useSupplied = false, indentId = null) => {
    let totalRequired = 0;
    let totalSupplied = 0;

    items.forEach((item, idx) => {
      totalRequired += parseFloat(item.required_qty) || 0;
      if (useSupplied && indentId) {
        totalSupplied += getDispatchedQtyForIndent(indentId, item.product_id);
      }
    });

    return { totalRequired, totalSupplied };
  };

  // Get all indent items flattened for display with their parent indent info
  const getAllIndentItems = () => {
    const items = [];
    filteredIndents.forEach(indent => {
      indent.items?.forEach((item, itemIndex) => {
        items.push({
          ...item,
          indent,
          itemIndex,
          indentId: indent.id
        });
      });
    });
    return items;
  };

  // Calculate grand totals for Indent tab
  const indentGrandTotals = filteredIndents.reduce((acc, indent) => {
    indent.items?.forEach(item => {
      acc.totalRequired += parseFloat(item.required_qty) || 0;
    });
    return acc;
  }, { totalRequired: 0 });

  // Filter indents for Dispatch tab
  const filteredDispatchIndents = indents.filter(indent => {
    // Date range filter
    if (dispatchFilters.fromDate) {
      const indentDate = new Date(indent.indent_date).setHours(0,0,0,0);
      const fromDate = new Date(dispatchFilters.fromDate).setHours(0,0,0,0);
      if (indentDate < fromDate) return false;
    }
    if (dispatchFilters.toDate) {
      const indentDate = new Date(indent.indent_date).setHours(0,0,0,0);
      const toDate = new Date(dispatchFilters.toDate).setHours(0,0,0,0);
      if (indentDate > toDate) return false;
    }
    // Customer filter
    if (dispatchFilters.customerName && indent.customer_name !== dispatchFilters.customerName) {
      return false;
    }
    // Product filter (check if any item matches)
    if (dispatchFilters.productName) {
      const hasProduct = indent.items?.some(item => 
        item.product_name?.toLowerCase().includes(dispatchFilters.productName.toLowerCase())
      );
      if (!hasProduct) return false;
    }
    return true;
  });

  // Calculate grand totals for Dispatch tab
  const dispatchGrandTotals = filteredDispatchIndents.reduce((acc, indent) => {
    indent.items?.forEach((item) => {
      acc.totalRequired += parseFloat(item.required_qty) || 0;
      acc.totalSupplied += getDispatchedQtyForIndent(indent.id, item.product_id);
    });
    return acc;
  }, { totalRequired: 0, totalSupplied: 0 });

  // Filter invoices based on filters
  const filteredInvoices = invoices.filter(invoice => {
    // Date range filter
    if (invoiceListFilters.fromDate) {
      const invoiceDate = new Date(invoice.invoice_date).setHours(0,0,0,0);
      const fromDate = new Date(invoiceListFilters.fromDate).setHours(0,0,0,0);
      if (invoiceDate < fromDate) return false;
    }
    if (invoiceListFilters.toDate) {
      const invoiceDate = new Date(invoice.invoice_date).setHours(0,0,0,0);
      const toDate = new Date(invoiceListFilters.toDate).setHours(0,0,0,0);
      if (invoiceDate > toDate) return false;
    }
    // Customer filter
    if (invoiceListFilters.customerName && invoice.customer_name !== invoiceListFilters.customerName) {
      return false;
    }
    // Product filter (check if any item matches)
    if (invoiceListFilters.productName) {
      const hasProduct = invoice.items?.some(item => 
        item.product_name?.toLowerCase().includes(invoiceListFilters.productName.toLowerCase())
      );
      if (!hasProduct) return false;
    }
    return true;
  });

  // Stats
  const pendingIndents = indents.filter(i => i.status === 'pending').length;
  const dispatchedCount = dispatches.length;
  const completedGrns = grns.length;

  // ============================================================================
  // SECTION: RENDER - Main Component
  // ============================================================================
  
  return (
    <Layout title="Quick Commerce">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Indents</p>
                <p className="text-3xl font-bold text-gray-900">{pendingIndents}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <Package className="text-orange-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">Dispatched</p>
                <p className="text-3xl font-bold text-gray-900">{dispatchedCount}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Truck className="text-blue-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">GRNs Completed</p>
                <p className="text-3xl font-bold text-gray-900">{completedGrns}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <ClipboardCheck className="text-green-700" size={24} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="indent" className="w-full">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-2">
          <TabsList className="inline-flex w-max gap-1 p-1 md:grid md:w-full md:grid-cols-6 md:max-w-3xl">
            <TabsTrigger value="indent" className="whitespace-nowrap text-[11px] md:text-sm px-2 py-1.5 md:px-4 min-w-[60px]">Indent</TabsTrigger>
            <TabsTrigger value="dispatch" className="whitespace-nowrap text-[11px] md:text-sm px-2 py-1.5 md:px-4 min-w-[70px]">Dispatch</TabsTrigger>
            <TabsTrigger value="invoices" className="whitespace-nowrap text-[11px] md:text-sm px-2 py-1.5 md:px-4 min-w-[80px]">Invoices ({invoices.length})</TabsTrigger>
            <TabsTrigger value="grn" className="whitespace-nowrap text-[11px] md:text-sm px-2 py-1.5 md:px-4 min-w-[50px]">GRN</TabsTrigger>
            <TabsTrigger value="packaging" className="whitespace-nowrap text-[11px] md:text-sm px-2 py-1.5 md:px-4 min-w-[100px]">Packaging ({packagingVariants.length})</TabsTrigger>
            <TabsTrigger value="customers" className="whitespace-nowrap text-[11px] md:text-sm px-2 py-1.5 md:px-4 min-w-[100px]">Customers ({customers.length})</TabsTrigger>
          </TabsList>
        </div>

        {/* INDENT TAB */}
        <TabsContent value="indent" className="mt-6">
          {/* Filter Panel */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter size={18} />
                  Filter Indents
                </CardTitle>
                <div className="flex gap-2">
                  <Dialog open={openExport} onOpenChange={setOpenExport}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="export-btn">
                        <Download size={16} className="mr-2" />
                        Export
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Export Indents</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm">From Date *</Label>
                            <Input
                              type="date"
                              value={exportFilters.fromDate}
                              onChange={(e) => setExportFilters({ ...exportFilters, fromDate: e.target.value })}
                              data-testid="export-from-date"
                            />
                          </div>
                          <div>
                            <Label className="text-sm">To Date *</Label>
                            <Input
                              type="date"
                              value={exportFilters.toDate}
                              onChange={(e) => setExportFilters({ ...exportFilters, toDate: e.target.value })}
                              data-testid="export-to-date"
                            />
                          </div>
                        </div>
                        <p className="text-sm text-gray-600">
                          {getIndentsForExport().length} indent(s) found for selected date range
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            onClick={exportToExcel} 
                            variant="outline" 
                            className="w-full"
                            data-testid="export-excel-btn"
                          >
                            <FileSpreadsheet size={16} className="mr-2" />
                            Export to Excel
                          </Button>
                          <Button 
                            onClick={exportToPDF} 
                            className="w-full bg-[#14532D] hover:bg-[#166534]"
                            data-testid="export-pdf-btn"
                          >
                            <FileText size={16} className="mr-2" />
                            Export to PDF
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="sm" onClick={clearIndentFilters}>
                    Clear All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">From Date</Label>
                  <Input
                    type="date"
                    value={indentFilters.fromDate}
                    onChange={(e) => setIndentFilters({ ...indentFilters, fromDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">To Date</Label>
                  <Input
                    type="date"
                    value={indentFilters.toDate}
                    onChange={(e) => setIndentFilters({ ...indentFilters, toDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Customer</Label>
                  <Input
                    type="text"
                    placeholder="Search customer..."
                    value={indentFilters.customerName}
                    onChange={(e) => setIndentFilters({ ...indentFilters, customerName: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Product</Label>
                  <Input
                    type="text"
                    placeholder="Search product..."
                    value={indentFilters.productName}
                    onChange={(e) => setIndentFilters({ ...indentFilters, productName: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Showing {filteredIndents.length} of {indents.length} indents
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3 mb-4">
            <Dialog open={openCustomer} onOpenChange={(open) => { setOpenCustomer(open); if (!open) resetCustomerForm(); }}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="add-customer-btn">
                  <UserPlus size={16} className="mr-2" />
                  {editingCustomer ? 'Edit Customer' : 'Add Customer'}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add QC Customer'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitCustomer} className="space-y-4">
                  <div>
                    <Label htmlFor="customer-name">Customer Name *</Label>
                    <Input
                      id="customer-name"
                      placeholder="e.g., Blinkit, Zepto, Instamart"
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                      required
                      data-testid="customer-name-input"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-person">Contact Person</Label>
                    <Input
                      id="contact-person"
                      placeholder="Contact person name"
                      value={customerForm.contact_person}
                      onChange={(e) => setCustomerForm({ ...customerForm, contact_person: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-number">Contact Number</Label>
                    <Input
                      id="contact-number"
                      placeholder="+91 9876543210"
                      value={customerForm.contact_number}
                      onChange={(e) => setCustomerForm({ ...customerForm, contact_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer-address">Address</Label>
                    <Input
                      id="customer-address"
                      placeholder="Warehouse address"
                      value={customerForm.address}
                      onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                    />
                  </div>
                  <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-customer-btn">
                    {editingCustomer ? 'Update Customer' : 'Add Customer'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={openIndent} onOpenChange={(open) => { setOpenIndent(open); if (!open) resetIndentForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-[#14532D] hover:bg-[#166534]" data-testid="add-indent-btn">
                  <Plus size={16} className="mr-2" />
                  Create Indent
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingIndent ? 'Edit Indent' : 'Create New Indent'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitIndent} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="indent-date">Indent Date *</Label>
                      <Input
                        id="indent-date"
                        type="date"
                        value={indentForm.indent_date}
                        onChange={(e) => setIndentForm({ ...indentForm, indent_date: e.target.value })}
                        required
                        data-testid="indent-date-input"
                      />
                    </div>
                    <div>
                      <AutocompleteInput
                        label="Customer Name *"
                        placeholder="Select customer (Blinkit, Zepto...)"
                        items={customers}
                        displayKey="name"
                        secondaryKey="contact_person"
                        onSelect={handleCustomerSelect}
                        testId="indent-customer-autocomplete"
                        storageKey="recent_qc_customers"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base font-semibold">Products</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddIndentItem}
                        data-testid="add-indent-item-btn"
                      >
                        <Plus size={16} className="mr-1" />
                        Add Product
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {indentForm.items.map((item, index) => (
                        <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                          {/* Row 1: Product and Packaging */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <Label className="text-sm font-medium">Product Name *</Label>
                              <AutocompleteInput
                                placeholder="Select product"
                                items={products}
                                displayKey="name"
                                secondaryKey="unit"
                                onSelect={(product) => handleProductSelect(index, product)}
                                testId={`product-autocomplete-${index}`}
                                storageKey="recent_products"
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Packaging / Variant</Label>
                              <AutocompleteInput
                                placeholder="Search packaging variant..."
                                items={packagingVariants.map(p => ({ ...p, displayName: `${p.name} - ${p.weight_gm} gm` }))}
                                displayKey="displayName"
                                secondaryKey="weight_gm"
                                onSelect={(packaging) => handlePackagingSelect(index, packaging)}
                                testId={`item-packaging-${index}`}
                                storageKey="recent_packaging"
                              />
                            </div>
                          </div>
                          {/* Row 2: Unit, Qty, Lot Size, Crates, Rate */}
                          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
                            <div>
                              <Label className="text-sm font-medium">Unit (auto)</Label>
                              <Input
                                value={item.product_unit}
                                placeholder="Auto from packaging"
                                onChange={(e) => handleIndentItemChange(index, 'product_unit', e.target.value)}
                                className="h-10 bg-gray-100"
                                readOnly
                                data-testid={`item-unit-${index}`}
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Required Qty *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Enter quantity"
                                value={item.required_qty}
                                onChange={(e) => handleIndentItemChange(index, 'required_qty', e.target.value)}
                                className="h-10"
                                required
                                data-testid={`item-qty-${index}`}
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Lot Size *</Label>
                              <Input
                                type="number"
                                placeholder="Pkts per crate"
                                value={item.lot_size}
                                onChange={(e) => handleIndentItemChange(index, 'lot_size', e.target.value)}
                                className="h-10"
                                required
                                data-testid={`item-lot-size-${index}`}
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Crates</Label>
                              <Input
                                value={item.no_of_crates}
                                disabled
                                className="h-10 bg-green-50 font-bold text-green-700 text-center"
                                data-testid={`item-crates-${index}`}
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Rate (₹)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Optional"
                                value={item.rate}
                                onChange={(e) => handleIndentItemChange(index, 'rate', e.target.value)}
                                className="h-10"
                                data-testid={`item-rate-${index}`}
                              />
                            </div>
                            <div className="flex items-end justify-end">
                              {indentForm.items.length > 1 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveIndentItem(index)}
                                  className="h-10 px-3 text-red-600 border-red-200 hover:bg-red-50"
                                >
                                  <Trash2 size={16} className="mr-1" />
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg">
                    <div>
                      <span className="text-sm text-gray-600">Total Products: </span>
                      <span className="font-semibold">{indentForm.items.filter(i => i.product_name).length}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Total Crates: </span>
                      <span className="font-bold text-lg text-[#14532D]">
                        {indentForm.items.reduce((sum, i) => sum + (i.no_of_crates || 0), 0)}
                      </span>
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-indent-btn">
                    {editingIndent ? 'Update Indent' : 'Create Indent'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Indents Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Indent Orders ({filteredIndents.length})</CardTitle>
                {/* Total Required Qty Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                  <span className="text-sm text-blue-700 font-medium">
                    Total Required Qty: <span className="text-lg font-bold">{indentGrandTotals.totalRequired.toFixed(2)}</span>
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>CUSTOMER</th>
                      <th>PRODUCT</th>
                      <th>UNIT</th>
                      <th className="text-right">QTY</th>
                      <th className="text-right">LOT SIZE</th>
                      <th className="text-right">CRATES</th>
                      <th>STATUS</th>
                      <th className="text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndents.map((indent) => {
                      // Calculate row span for items
                      const itemCount = indent.items?.length || 1;
                      // Check if any dispatches exist for this indent
                      const hasDispatches = dispatches.some(d => d.indent_id === indent.id);
                      // Can edit/delete if no dispatches exist (status will be auto-updated by backend)
                      const canEditDelete = !hasDispatches;
                      
                      return indent.items?.map((item, itemIndex) => (
                        <tr key={`${indent.id}-${itemIndex}`} data-testid={`indent-row-${indent.id}-${itemIndex}`}>
                          {itemIndex === 0 && (
                            <>
                              <td rowSpan={itemCount} className="align-top">{formatDate(indent.indent_date)}</td>
                              <td rowSpan={itemCount} className="font-medium align-top">{indent.customer_name}</td>
                            </>
                          )}
                          <td>
                            <div>
                              <span className="font-medium">{item.product_name}</span>
                              {item.packaging_name && (
                                <span className="text-gray-500 text-xs ml-1">({item.packaging_name})</span>
                              )}
                            </div>
                          </td>
                          <td className="text-sm">{item.product_unit}</td>
                          <td className="text-right font-semibold">{item.required_qty}</td>
                          <td className="text-right text-gray-600">{item.lot_size}</td>
                          <td className="text-right text-green-700 font-semibold">{item.no_of_crates}</td>
                          {itemIndex === 0 && (
                            <>
                              <td rowSpan={itemCount} className="align-top">
                                <span className={`badge ${
                                  indent.status === 'completed' ? 'badge-success' : 
                                  indent.status === 'dispatched' || indent.status === 'partial' ? 'badge-warning' : 'badge-error'
                                }`}>
                                  {indent.status}
                                </span>
                              </td>
                              <td rowSpan={itemCount} className="align-top">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEditIndent(indent)}
                                    data-testid={`edit-indent-${indent.id}`}
                                    disabled={!canEditDelete}
                                    title={canEditDelete ? 'Edit indent' : 'Cannot edit - already dispatched'}
                                  >
                                    <Edit size={14} className={canEditDelete ? 'text-blue-600' : 'text-gray-400'} />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteIndent(indent.id)}
                                    data-testid={`delete-indent-${indent.id}`}
                                    disabled={!canEditDelete}
                                    title={canEditDelete ? 'Delete indent' : 'Cannot delete - already dispatched'}
                                  >
                                    <Trash2 size={14} className={canEditDelete ? 'text-red-600' : 'text-gray-400'} />
                                  </Button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )) || (
                        <tr key={indent.id}>
                          <td>{formatDate(indent.indent_date)}</td>
                          <td className="font-medium">{indent.customer_name}</td>
                          <td colSpan={4} className="text-gray-500">No items</td>
                          <td>
                            <span className={`badge badge-error`}>{indent.status}</span>
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditIndent(indent)}
                              >
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteIndent(indent.id)}
                              >
                                <Trash2 size={14} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {indents.length === 0 && !loading && (
                  <div className="p-8 text-center text-gray-500">
                    <Package size={48} className="mx-auto text-gray-400 mb-4" />
                    <p>No indents found. Create your first indent to get started.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DISPATCH TAB */}
        <TabsContent value="dispatch" className="mt-6">
          {/* New Dispatch Entry Dialog */}
          <Dialog open={openDispatchDialog} onOpenChange={setOpenDispatchDialog}>
            <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Dispatch Entry</DialogTitle>
              </DialogHeader>
              {currentDispatchIndent && (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 bg-gray-50 p-3 rounded-lg">
                    <div>
                      <span className="text-sm text-gray-500">Customer:</span>
                      <span className="font-semibold text-[#14532D] ml-2">{currentDispatchIndent.customer_name}</span>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">Indent Date:</span>
                      <span className="font-medium ml-2">{formatDate(currentDispatchIndent.indent_date)}</span>
                    </div>
                    <div>
                      <Label className="text-sm">Dispatch Date</Label>
                      <Input
                        type="date"
                        value={dispatchDate}
                        onChange={(e) => setDispatchDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">Dispatch Time</Label>
                      <Input
                        value={dispatchTime}
                        onChange={(e) => setDispatchTime(e.target.value)}
                        placeholder="e.g., 09:00 AM"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="data-table">
                    <div className="flex justify-end mb-2">
                      <Button 
                        type="button"
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          // Fill all remaining quantities
                          const newDispatchData = {};
                          currentDispatchIndent.items?.forEach((item, idx) => {
                            const dispatched = getDispatchedQtyForIndent(currentDispatchIndent.id, item.product_id);
                            const remaining = Math.max(0, item.required_qty - dispatched);
                            newDispatchData[idx] = {
                              supplied_qty: remaining > 0 ? remaining.toString() : '',
                              lot_size: item.lot_size?.toString() || '',
                              no_of_crates: item.lot_size > 0 && remaining > 0 ? Math.ceil(remaining / item.lot_size).toString() : '0'
                            };
                          });
                          setDispatchData(prev => ({ ...prev, [currentDispatchIndent.id]: newDispatchData }));
                        }}
                        className="text-xs"
                      >
                        Fill All Remaining
                      </Button>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th>PRODUCT</th>
                          <th>PACKAGING</th>
                          <th className="text-right">INDENT QTY</th>
                          <th className="text-right">ALREADY DISPATCHED</th>
                          <th className="text-right">REMAINING</th>
                          <th className="text-right" style={{ width: '100px' }}>SUPPLY NOW</th>
                          <th className="text-right" style={{ width: '80px' }}>LOT SIZE</th>
                          <th className="text-right" style={{ width: '80px' }}>CRATES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDispatchIndent.items?.map((item, idx) => {
                          const dispatched = getDispatchedQtyForIndent(currentDispatchIndent.id, item.product_id);
                          const remaining = Math.max(0, item.required_qty - dispatched);
                          const suppliedQty = parseFloat(getDispatchItemValue(currentDispatchIndent.id, idx, 'supplied_qty')) || 0;
                          const lotSize = parseInt(getDispatchItemValue(currentDispatchIndent.id, idx, 'lot_size')) || item.lot_size || 1;
                          const autoCrates = lotSize > 0 ? Math.ceil(suppliedQty / lotSize) : 0;
                          return (
                            <tr key={idx}>
                              <td className="font-medium">{item.product_name}</td>
                              <td className="text-sm text-gray-600">{item.packaging_name || '-'}</td>
                              <td className="text-right">{item.required_qty}</td>
                              <td className="text-right text-blue-600">{dispatched}</td>
                              <td className={`text-right font-semibold ${remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                {remaining}
                              </td>
                              <td className="text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="Qty"
                                  value={getDispatchItemValue(currentDispatchIndent.id, idx, 'supplied_qty')}
                                  onChange={(e) => {
                                    handleSuppliedQtyChange(currentDispatchIndent.id, idx, 'supplied_qty', e.target.value);
                                    // Auto-calculate crates based on lot size
                                    const newQty = parseFloat(e.target.value) || 0;
                                    const currentLotSize = parseInt(getDispatchItemValue(currentDispatchIndent.id, idx, 'lot_size')) || item.lot_size || 1;
                                    const newCrates = currentLotSize > 0 ? Math.ceil(newQty / currentLotSize) : 0;
                                    handleSuppliedQtyChange(currentDispatchIndent.id, idx, 'no_of_crates', newCrates.toString());
                                  }}
                                  className="w-full h-8 text-right text-sm"
                                />
                              </td>
                              <td className="text-right">
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="Lot"
                                  value={getDispatchItemValue(currentDispatchIndent.id, idx, 'lot_size') || item.lot_size || ''}
                                  onChange={(e) => {
                                    handleSuppliedQtyChange(currentDispatchIndent.id, idx, 'lot_size', e.target.value);
                                    // Auto-recalculate crates
                                    const newLotSize = parseInt(e.target.value) || 1;
                                    const currentQty = parseFloat(getDispatchItemValue(currentDispatchIndent.id, idx, 'supplied_qty')) || 0;
                                    const newCrates = newLotSize > 0 ? Math.ceil(currentQty / newLotSize) : 0;
                                    handleSuppliedQtyChange(currentDispatchIndent.id, idx, 'no_of_crates', newCrates.toString());
                                  }}
                                  className="w-full h-8 text-right text-sm"
                                />
                              </td>
                              <td className="text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Crates"
                                  value={getDispatchItemValue(currentDispatchIndent.id, idx, 'no_of_crates') || autoCrates}
                                  onChange={(e) => handleSuppliedQtyChange(currentDispatchIndent.id, idx, 'no_of_crates', e.target.value)}
                                  className="w-full h-8 text-right text-sm"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <Label className="text-sm">Remarks (optional)</Label>
                    <Input
                      value={dispatchRemarks}
                      onChange={(e) => setDispatchRemarks(e.target.value)}
                      placeholder="e.g., Morning dispatch, Evening batch"
                      className="mt-1"
                    />
                  </div>

                  <Button
                    className="w-full bg-[#14532D] hover:bg-[#166534]"
                    onClick={handleSaveDispatch}
                    disabled={savingDispatch[currentDispatchIndent?.id]}
                  >
                    {savingDispatch[currentDispatchIndent?.id] ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Save size={16} className="mr-2" />
                    )}
                    Save Dispatch Entry
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-lg">Dispatch Log & Invoicing ({filteredDispatchIndents.length})</CardTitle>
                {/* Totals Summary */}
                <div className="flex gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                    <span className="text-sm text-blue-700 font-medium">
                      Total Required: <span className="text-lg font-bold">{dispatchGrandTotals.totalRequired.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                    <span className="text-sm text-green-700 font-medium">
                      Total Dispatched: <span className="text-lg font-bold">{dispatchGrandTotals.totalSupplied.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className={`border rounded-lg px-4 py-2 ${
                    dispatchGrandTotals.totalSupplied - dispatchGrandTotals.totalRequired >= 0 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <span className={`text-sm font-medium ${
                      dispatchGrandTotals.totalSupplied - dispatchGrandTotals.totalRequired >= 0 
                        ? 'text-green-700' 
                        : 'text-red-700'
                    }`}>
                      Remaining: <span className="text-lg font-bold">
                        {(dispatchGrandTotals.totalRequired - dispatchGrandTotals.totalSupplied).toFixed(2)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Dispatch Filters */}
              <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">From:</Label>
                  <Input
                    type="date"
                    value={dispatchFilters.fromDate}
                    onChange={(e) => setDispatchFilters({ ...dispatchFilters, fromDate: e.target.value })}
                    className="w-36 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">To:</Label>
                  <Input
                    type="date"
                    value={dispatchFilters.toDate}
                    onChange={(e) => setDispatchFilters({ ...dispatchFilters, toDate: e.target.value })}
                    className="w-36 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Customer:</Label>
                  <Select 
                    value={dispatchFilters.customerName} 
                    onValueChange={(value) => setDispatchFilters({ ...dispatchFilters, customerName: value === 'all' ? '' : value })}
                  >
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Product:</Label>
                  <Input
                    type="text"
                    placeholder="Search product..."
                    value={dispatchFilters.productName}
                    onChange={(e) => setDispatchFilters({ ...dispatchFilters, productName: e.target.value })}
                    className="w-40 h-9"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setDispatchFilters({ fromDate: '', toDate: '', customerName: '', productName: '' })}
                >
                  Clear Filters
                </Button>
              </div>

              {filteredDispatchIndents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Truck size={48} className="mx-auto text-gray-400 mb-4" />
                  <p>No indents found.</p>
                  <p className="text-sm mt-2">{indents.length > 0 ? 'Try adjusting your filters.' : 'Create indents first in the Indent tab.'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDispatchIndents.map((indent) => {
                    const dispatchLogs = getDispatchLogsForIndent(indent.id);
                    const isExpanded = expandedIndents[indent.id];
                    const relatedInvoices = invoices.filter(inv => inv.indent_id === indent.id);
                    
                    // Calculate totals
                    let totalIndentQty = 0;
                    let totalDispatched = 0;
                    indent.items?.forEach(item => {
                      totalIndentQty += item.required_qty;
                      totalDispatched += getDispatchedQtyForIndent(indent.id, item.product_id);
                    });
                    const remaining = totalIndentQty - totalDispatched;
                    
                    return (
                      <div key={indent.id} className="border border-gray-200 rounded-lg overflow-hidden" data-testid={`dispatch-indent-${indent.id}`}>
                        {/* Indent Header */}
                        <div className="bg-gray-50 px-4 py-3 border-b">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => toggleExpandIndent(indent.id)}
                              >
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              </Button>
                              <div>
                                <span className="text-sm text-gray-500">Customer:</span>
                                <span className="font-semibold text-[#14532D] ml-1">{indent.customer_name}</span>
                              </div>
                              <div>
                                <span className="text-sm text-gray-500">Indent Date:</span>
                                <span className="font-medium ml-1">{formatDate(indent.indent_date)}</span>
                              </div>
                              <span className={`badge ${
                                remaining <= 0 ? 'badge-success' : 
                                totalDispatched > 0 ? 'badge-warning' : 'badge-error'
                              }`}>
                                {remaining <= 0 ? 'Fully Dispatched' : totalDispatched > 0 ? 'Partial' : 'Pending'}
                              </span>
                              <span className="text-sm">
                                <span className="text-gray-500">Dispatched:</span>
                                <span className={`font-bold ml-1 ${remaining <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                                  {totalDispatched} / {totalIndentQty}
                                </span>
                              </span>
                              {dispatchLogs.length > 0 && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  {dispatchLogs.length} dispatch(es)
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="bg-[#14532D] hover:bg-[#166534]"
                                onClick={() => openNewDispatchDialog(indent)}
                                disabled={remaining <= 0}
                                data-testid={`new-dispatch-${indent.id}`}
                              >
                                <Plus size={16} className="mr-1" />
                                New Dispatch
                              </Button>
                              {dispatchLogs.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openCreateInvoiceDialog(indent.customer_name)}
                                  data-testid={`create-invoice-${indent.id}`}
                                >
                                  <Receipt size={16} className="mr-1" />
                                  Create Invoice
                                </Button>
                              )}
                            </div>
                          </div>
                          {/* Product Summary Row */}
                          <div className="mt-2 ml-10 flex flex-wrap gap-3 text-sm">
                            {indent.items?.map((item, idx) => {
                              const dispatched = getDispatchedQtyForIndent(indent.id, item.product_id);
                              const itemRemaining = item.required_qty - dispatched;
                              return (
                                <div key={idx} className="bg-white border rounded px-2 py-1 flex items-center gap-2">
                                  <span className="font-medium">{item.product_name}</span>
                                  {item.packaging_name && <span className="text-gray-500">({item.packaging_name})</span>}
                                  <span className={`font-semibold ${itemRemaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                    {dispatched}/{item.required_qty}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="p-4 space-y-4">
                            {/* Product Summary */}
                            <div className="data-table">
                              <table>
                                <thead>
                                  <tr>
                                    <th>PRODUCT</th>
                                    <th>PACKAGING</th>
                                    <th className="text-right">INDENT QTY</th>
                                    <th className="text-right">DISPATCHED</th>
                                    <th className="text-right">REMAINING</th>
                                    <th className="text-right">DIFFERENCE</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {indent.items?.map((item, idx) => {
                                    const dispatched = getDispatchedQtyForIndent(indent.id, item.product_id);
                                    const itemRemaining = item.required_qty - dispatched;
                                    return (
                                      <tr key={idx}>
                                        <td className="font-medium">{item.product_name}</td>
                                        <td className="text-sm text-gray-600">{item.packaging_name || '-'}</td>
                                        <td className="text-right">{item.required_qty}</td>
                                        <td className="text-right text-blue-600 font-semibold">{dispatched}</td>
                                        <td className={`text-right font-semibold ${itemRemaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                          {itemRemaining}
                                        </td>
                                        <td className="text-right">
                                          <span className={`font-bold ${
                                            dispatched - item.required_qty < 0 ? 'text-red-600' : 
                                            dispatched - item.required_qty > 0 ? 'text-green-600' : 'text-gray-600'
                                          }`}>
                                            {dispatched - item.required_qty > 0 ? '+' : ''}{(dispatched - item.required_qty).toFixed(2)}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Dispatch Logs */}
                            {dispatchLogs.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                  <Clock size={16} />
                                  Dispatch Log
                                </h4>
                                <div className="space-y-2">
                                  {dispatchLogs.map((dispatch) => (
                                    <div key={dispatch.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm font-medium">
                                            {formatDate(dispatch.dispatch_date)}
                                            {dispatch.dispatch_time && ` at ${dispatch.dispatch_time}`}
                                          </span>
                                          {dispatch.remarks && (
                                            <span className="text-xs text-gray-600 bg-white px-2 py-1 rounded">
                                              {dispatch.remarks}
                                            </span>
                                          )}
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleDeleteDispatch(dispatch.id)}
                                        >
                                          <Trash2 size={14} className="text-red-600" />
                                        </Button>
                                      </div>
                                      <div className="text-sm text-gray-700">
                                        {dispatch.items?.map((item, idx) => (
                                          <span key={idx} className="inline-block mr-4">
                                            {item.product_name}: <span className="font-semibold">{item.supplied_qty}</span>
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Related Invoices */}
                            {relatedInvoices.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                  <Receipt size={16} />
                                  Invoices
                                </h4>
                                <div className="space-y-2">
                                  {relatedInvoices.map((invoice) => (
                                    <div key={invoice.id} className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                                      <div>
                                        <span className="font-semibold text-green-800">{invoice.invoice_number}</span>
                                        <span className="text-sm text-gray-600 ml-3">{formatDate(invoice.invoice_date)}</span>
                                        {invoice.total_amount > 0 && (
                                          <span className="text-sm font-semibold text-green-700 ml-3">₹{invoice.total_amount?.toFixed(2)}</span>
                                        )}
                                      </div>
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => handleEditInvoice(invoice)}>
                                          <Edit size={14} className="text-blue-600" />
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => handleDeleteInvoice(invoice.id)}>
                                          <Trash2 size={14} className="text-red-600" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVOICES TAB */}
        <TabsContent value="invoices" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <CardTitle className="text-lg">All Invoices ({filteredInvoices.length})</CardTitle>
                <Button
                  className="bg-[#14532D] hover:bg-[#166534]"
                  onClick={() => openCreateInvoiceDialog('')}
                  data-testid="create-new-invoice-btn"
                >
                  <Plus size={16} className="mr-2" />
                  Create Invoice
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">From:</Label>
                  <Input
                    type="date"
                    value={invoiceListFilters.fromDate}
                    onChange={(e) => setInvoiceListFilters({ ...invoiceListFilters, fromDate: e.target.value })}
                    className="w-36 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">To:</Label>
                  <Input
                    type="date"
                    value={invoiceListFilters.toDate}
                    onChange={(e) => setInvoiceListFilters({ ...invoiceListFilters, toDate: e.target.value })}
                    className="w-36 h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Customer:</Label>
                  <Select 
                    value={invoiceListFilters.customerName} 
                    onValueChange={(value) => setInvoiceListFilters({ ...invoiceListFilters, customerName: value === 'all' ? '' : value })}
                  >
                    <SelectTrigger className="w-40 h-9">
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">Product:</Label>
                  <Input
                    type="text"
                    placeholder="Search product..."
                    value={invoiceListFilters.productName}
                    onChange={(e) => setInvoiceListFilters({ ...invoiceListFilters, productName: e.target.value })}
                    className="w-40 h-9"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setInvoiceListFilters({ fromDate: '', toDate: '', customerName: '', productName: '' })}
                >
                  Clear Filters
                </Button>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Receipt size={48} className="mx-auto text-gray-400 mb-4" />
                  <p>No invoices found.</p>
                  <p className="text-sm mt-2">{invoices.length > 0 ? 'Try adjusting your filters.' : 'Create invoices from the Dispatch tab or click "Create Invoice" above.'}</p>
                </div>
              ) : (
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>INVOICE NO</th>
                        <th>DATE</th>
                        <th>CUSTOMER</th>
                        <th>TYPE</th>
                        <th className="text-right">ITEMS</th>
                        <th className="text-right">TOTAL</th>
                        <th>STATUS</th>
                        <th className="text-center">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                          <td className="font-semibold text-[#14532D]">{invoice.invoice_number}</td>
                          <td>{formatDate(invoice.invoice_date)}</td>
                          <td className="font-medium">{invoice.customer_name}</td>
                          <td>
                            <span className={`text-xs px-2 py-1 rounded ${
                              invoice.customer_type === 'ninjacart' 
                                ? 'bg-purple-100 text-purple-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {invoice.customer_type === 'ninjacart' ? 'Ninjacart' : 'Standard'}
                            </span>
                          </td>
                          <td className="text-right">{invoice.items?.length || 0}</td>
                          <td className="text-right font-semibold">
                            {invoice.customer_type !== 'ninjacart' 
                              ? `₹${invoice.total_amount?.toFixed(2) || '0.00'}` 
                              : '-'}
                          </td>
                          <td>
                            <span className={`badge ${
                              invoice.status === 'finalized' ? 'badge-success' : 
                              invoice.status === 'cancelled' ? 'badge-error' : 'badge-warning'
                            }`}>
                              {invoice.status || 'draft'}
                            </span>
                          </td>
                          <td className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => generateInvoicePDF(invoice)}
                                title="Download/Print PDF"
                                data-testid={`download-invoice-${invoice.id}`}
                              >
                                <Download size={16} className="text-blue-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditInvoice(invoice)}
                                title="Edit Invoice"
                                data-testid={`edit-invoice-${invoice.id}`}
                              >
                                <Edit size={16} className="text-gray-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteInvoice(invoice.id)}
                                title="Delete Invoice"
                                data-testid={`delete-invoice-${invoice.id}`}
                              >
                                <Trash2 size={16} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* GRN TAB - Ninjacart */}
        <TabsContent value="grn" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-lg">GRN - Ninjacart</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">Upload Ninjacart CSV or Excel file to match with dispatches</p>
                </div>
                <div className="flex gap-3">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleGrnCsvUpload}
                      className="hidden"
                      disabled={uploadingGrn}
                    />
                    <Button
                      className="bg-[#14532D] hover:bg-[#166534]"
                      disabled={uploadingGrn}
                      asChild
                    >
                      <span>
                        {uploadingGrn ? (
                          <Loader2 size={16} className="mr-2 animate-spin" />
                        ) : (
                          <Upload size={16} className="mr-2" />
                        )}
                        Upload Ninjacart File
                      </span>
                    </Button>
                  </label>
                  {grnMatchedItems.length > 0 && (
                    <>
                      <Button onClick={() => exportGrnToCsv(grnMatchedItems)} variant="outline">
                        <Download size={16} className="mr-2" />
                        Export CSV
                      </Button>
                      <Button onClick={handleSaveGrn} className={grnUploadResult?.editing_grn_id ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}>
                        <Save size={16} className="mr-2" />
                        {grnUploadResult?.editing_grn_id ? `Update GRN (${grnMatchedItems.length} items)` : `Save GRN (${grnMatchedItems.length} items)`}
                      </Button>
                      {grnUploadResult?.editing_grn_id && (
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setGrnMatchedItems([]);
                            setGrnUploadResult(null);
                          }}
                          className="text-gray-600"
                        >
                          Cancel Edit
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Pending GRN Dates Banner */}
              {grnPendingDates.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={18} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">
                      GRN Pending for: 
                    </span>
                    <div className="flex gap-1.5">
                      {grnPendingDates.slice(0, 5).map((date, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-semibold">
                          {date}
                        </span>
                      ))}
                      {grnPendingDates.length > 5 && (
                        <span className="text-xs text-amber-600">+{grnPendingDates.length - 5} more</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-amber-700 font-medium">
                    {grnDispatchItems.length} items pending
                  </span>
                </div>
              )}
              
              {/* Upload Result Info - Enhanced Summary */}
              {grnUploadResult && (
                <div className={`mb-4 p-4 border rounded-lg ${grnUploadResult.editing_grn_id ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'}`}>
                  {/* Edit Mode Banner */}
                  {grnUploadResult.editing_grn_id && (
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-yellow-300">
                      <span className="px-2 py-1 bg-yellow-500 text-white rounded text-xs font-bold flex items-center gap-1">
                        <Pencil size={12} /> EDIT MODE
                      </span>
                      <span className="text-sm text-yellow-800">Modify items below and click "Update GRN" to save changes</span>
                    </div>
                  )}
                  
                  {/* Method Badge for Auto-Sync */}
                  {grnUploadResult.summary?.sync_method === 'automatic_gmail' && (
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-200">
                      <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-bold">AUTO-SYNC</span>
                      <span className="text-sm text-purple-800">GRN automatically synced from Gmail</span>
                    </div>
                  )}
                  
                  {/* Main Summary Row */}
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">File</span>
                      <span className="text-sm font-medium text-blue-800">{grnUploadResult.file_name}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                      {grnUploadResult.dates_found?.length > 0 ? grnUploadResult.dates_found.join(', ') : 'No dates'}
                    </span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                      {grnUploadResult.matched_items?.length || 0} matched
                    </span>
                    {grnUploadResult.rows_skipped > 0 && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">
                        {grnUploadResult.rows_skipped} unmatched
                      </span>
                    )}
                    {grnUploadResult.summary?.total_amount > 0 && (
                      <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-semibold">
                        Total: ₹{grnUploadResult.summary.total_amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  
                  {/* Rate Changes Summary */}
                  {grnUploadResult.rate_changes?.length > 0 && (
                    <div className="p-3 bg-white/50 rounded-lg border border-purple-200 mb-3">
                      <p className="text-xs font-semibold text-purple-800 mb-2 flex items-center gap-1">
                        <TrendingUp size={14} /> Rate Changes from Previous Day ({grnUploadResult.rate_changes.length} products)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {grnUploadResult.rate_changes.slice(0, 6).map((rc, idx) => (
                          <div key={idx} className={`px-2 py-1 rounded text-xs ${rc.change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            <span className="font-medium">{rc.product_name}</span>
                            <span className="ml-1">
                              {rc.change > 0 ? '↑' : '↓'} ₹{Math.abs(rc.change).toFixed(2)} ({rc.change_percent > 0 ? '+' : ''}{rc.change_percent}%)
                            </span>
                          </div>
                        ))}
                        {grnUploadResult.rate_changes.length > 6 && (
                          <span className="text-xs text-gray-500">+{grnUploadResult.rate_changes.length - 6} more</span>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Warnings */}
                  {grnUploadResult.warnings?.length > 0 && (
                    <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                      {grnUploadResult.warnings.map((warning, idx) => (
                        <p key={idx} className="text-orange-700">{warning}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* GRN Matched Items Table (from CSV upload) */}
              {grnMatchedItems.length > 0 && (
                <div className="mb-6">
                  {/* Filters */}
                  <div className="flex flex-wrap gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">From:</Label>
                      <Input
                        type="date"
                        value={grnFilters.fromDate}
                        onChange={(e) => setGrnFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                        className="w-36 h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">To:</Label>
                      <Input
                        type="date"
                        value={grnFilters.toDate}
                        onChange={(e) => setGrnFilters(prev => ({ ...prev, toDate: e.target.value }))}
                        className="w-36 h-8"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">Product:</Label>
                      <Input
                        type="text"
                        placeholder="Filter by product..."
                        value={grnFilters.productName}
                        onChange={(e) => setGrnFilters(prev => ({ ...prev, productName: e.target.value }))}
                        className="w-40 h-8"
                      />
                    </div>
                    {(grnFilters.fromDate || grnFilters.toDate || grnFilters.productName) && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setGrnFilters({ fromDate: '', toDate: '', productName: '' })}
                        className="h-8"
                      >
                        <X size={14} className="mr-1" /> Clear
                      </Button>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">
                      Showing {filteredGrnItems.length} of {grnMatchedItems.length} items
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm text-green-700">Matched Items from CSV</h4>
                  </div>
                  <div className="data-table overflow-x-auto">
                    <table className="text-xs">
                      <thead>
                        <tr>
                          <th className="whitespace-nowrap">DATE</th>
                          <th className="whitespace-nowrap">PRODUCT / PACKAGING</th>
                          <th className="text-right whitespace-nowrap">SUPPLIED</th>
                          <th className="text-right whitespace-nowrap">GRN</th>
                          <th className="text-right whitespace-nowrap">DIFF</th>
                          <th className="text-right whitespace-nowrap">RATE</th>
                          <th className="text-center whitespace-nowrap">RATE Δ</th>
                          <th className="text-right whitespace-nowrap">AMOUNT</th>
                          <th className="text-center whitespace-nowrap">ACT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGrnItems.map((item, idx) => {
                          const originalIndex = grnMatchedItems.indexOf(item);
                          const isEditing = editingGrnItem === originalIndex;
                          const lossGain = item.loss_gain_amount !== undefined 
                            ? item.loss_gain_amount 
                            : (item.difference || 0) * (item.rate_per_unit || 0);
                          const currentRate = item.rate_per_kg || item.rate_per_unit || 0;
                          return (
                            <tr key={idx} className={isEditing ? 'bg-yellow-50' : ''}>
                              <td className="whitespace-nowrap text-gray-600">{item.dispatch_date?.slice(5) || '-'}</td>
                              <td>
                                <div className="font-medium text-[#14532D]">{item.product_name}</div>
                                <div className="text-[10px] text-gray-500">{item.packaging_name || '-'}</div>
                              </td>
                              <td className="text-right">{item.supplied_qty}</td>
                              <td className="text-right font-semibold">
                                {isEditing ? (
                                  <Input
                                    type="number"
                                    value={item.grn_qty}
                                    onChange={(e) => handleUpdateGrnItem(originalIndex, 'grn_qty', e.target.value)}
                                    className="w-16 h-6 text-right text-xs"
                                  />
                                ) : item.grn_qty}
                              </td>
                              <td className="text-right">
                                <span className={`font-bold ${
                                  item.difference > 0 ? 'text-green-600' : 
                                  item.difference < 0 ? 'text-red-600' : 'text-gray-400'
                                }`}>
                                  {item.difference !== 0 ? (item.difference > 0 ? '+' : '') + item.difference?.toFixed(0) : '-'}
                                </span>
                              </td>
                              <td className="text-right whitespace-nowrap">
                                {isEditing ? (
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={item.rate_per_kg || item.rate_per_unit || 0}
                                    onChange={(e) => handleUpdateGrnItem(originalIndex, item.rate_per_kg ? 'rate_per_kg' : 'rate_per_unit', e.target.value)}
                                    className="w-14 h-6 text-right text-xs"
                                  />
                                ) : (
                                  <span>₹{currentRate.toFixed(1)}{item.rate_per_kg ? '/Kg' : '/Pc'}</span>
                                )}
                              </td>
                              <td className="text-center">
                                {item.rate_change !== null && item.rate_change !== undefined ? (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    item.rate_change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {item.rate_change > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                    {item.rate_change > 0 ? '+' : ''}{item.rate_change_percent}%
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="text-right font-semibold whitespace-nowrap">
                                ₹{item.amount?.toFixed(0)}
                                {lossGain !== 0 && (
                                  <div className={`text-xs font-bold ${lossGain > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {lossGain > 0 ? '+' : ''}₹{lossGain.toFixed(0)}
                                  </div>
                                )}
                              </td>
                              <td className="text-center">
                                {isEditing ? (
                                  <Button size="sm" variant="ghost" onClick={handleSaveGrnItemEdit} className="h-6 w-6 p-0 text-green-600">
                                    <Check size={12} />
                                  </Button>
                                ) : (
                                  <div className="flex items-center justify-center gap-0.5">
                                    <Button size="sm" variant="ghost" onClick={() => handleEditGrnItem(originalIndex)} className="h-6 w-6 p-0 text-blue-600">
                                      <Pencil size={12} />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => handleDeleteGrnItem(originalIndex)} className="h-6 w-6 p-0 text-red-600">
                                      <Trash2 size={12} />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 text-xs">
                          <td className="font-semibold">Totals</td>
                          <td></td>
                          <td className="text-right font-bold">{filteredGrnItems.reduce((sum, i) => sum + i.supplied_qty, 0)}</td>
                          <td className="text-right font-bold">{filteredGrnItems.reduce((sum, i) => sum + i.grn_qty, 0).toFixed(0)}</td>
                          <td className="text-right">
                            <span className={`font-bold ${
                              filteredGrnItems.reduce((sum, i) => sum + i.difference, 0) > 0 ? 'text-green-600' : 
                              filteredGrnItems.reduce((sum, i) => sum + i.difference, 0) < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {filteredGrnItems.reduce((sum, i) => sum + i.difference, 0) > 0 ? '+' : ''}
                              {filteredGrnItems.reduce((sum, i) => sum + i.difference, 0).toFixed(0)}
                            </span>
                          </td>
                          <td></td>
                          <td></td>
                          <td className="text-right font-bold">₹{filteredGrnItems.reduce((sum, i) => sum + (i.amount || 0), 0).toFixed(0)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Ninjacart Dispatches Pending GRN - Collapsible by Date */}
              {grnDispatchItems.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm">Ninjacart Dispatches Pending GRN</h4>
                    {Object.keys(manualGrnData).some(key => manualGrnData[key].grn_qty) && (
                      <Button onClick={handleSaveManualGrn} className="bg-green-600 hover:bg-green-700" size="sm">
                        <Save size={14} className="mr-1" />
                        Save Manual GRN
                      </Button>
                    )}
                  </div>
                  
                  {/* Collapsible Date Summary Rows */}
                  <div className="space-y-2">
                    {grnPendingDates.map((date) => {
                      const dateItems = grnDispatchItems.filter(item => (item.dispatch_date?.split('T')[0] || '') === date);
                      const totalSupplied = dateItems.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                      const isExpanded = expandedPendingDates[date];
                      
                      return (
                        <div key={date} className="border rounded-lg overflow-hidden">
                          {/* Summary Row - Clickable */}
                          <div 
                            className="flex items-center gap-4 p-3 bg-amber-50 border-b cursor-pointer hover:bg-amber-100"
                            onClick={() => setExpandedPendingDates(prev => ({ ...prev, [date]: !prev[date] }))}
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              <span className="font-semibold text-amber-800">{date}</span>
                            </div>
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                              {dateItems.length} items
                            </span>
                            <span className="text-xs text-gray-600">
                              Total Supplied: <strong>{totalSupplied.toFixed(0)}</strong>
                            </span>
                            <span className="ml-auto text-xs text-gray-500">
                              Click to {isExpanded ? 'collapse' : 'expand'}
                            </span>
                          </div>
                          
                          {/* Expanded Items Table */}
                          {isExpanded && (
                            <div className="data-table overflow-x-auto">
                              <table className="text-xs">
                                <thead>
                                  <tr>
                                    <th>PRODUCT / PACKAGING</th>
                                    <th className="text-right">SUPPLIED</th>
                                    <th className="text-right w-20">GRN QTY</th>
                                    <th className="text-right w-20">RATE</th>
                                    <th className="text-right">DIFF</th>
                                    <th className="text-center w-16">ACT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dateItems.map((item, idx) => {
                                    const itemKey = `${item.dispatch_id}_${item.product_id}_${date}_${idx}`;
                                    const manualData = manualGrnData[itemKey] || {};
                                    const grnQty = manualData.grn_qty || '';
                                    const rate = manualData.rate || '';
                                    const difference = grnQty ? (parseFloat(grnQty) - item.supplied_qty) : null;
                                    
                                    return (
                                      <tr key={idx}>
                                        <td>
                                          <div className="font-medium text-[#14532D]">{item.product_name}</div>
                                          <div className="text-[10px] text-gray-500">{item.packaging_name || '-'}</div>
                                        </td>
                                        <td className="text-right">{item.supplied_qty}</td>
                                        <td className="text-right">
                                          <Input
                                            type="number"
                                            placeholder="GRN"
                                            value={grnQty}
                                            onChange={(e) => setManualGrnData(prev => ({
                                              ...prev,
                                              [itemKey]: { ...prev[itemKey], grn_qty: e.target.value }
                                            }))}
                                            className="w-16 h-6 text-right text-xs"
                                          />
                                        </td>
                                        <td className="text-right">
                                          <Input
                                            type="number"
                                            placeholder="Rate"
                                            step="0.01"
                                            value={rate}
                                            onChange={(e) => setManualGrnData(prev => ({
                                              ...prev,
                                              [itemKey]: { ...prev[itemKey], rate: e.target.value }
                                            }))}
                                            className="w-16 h-6 text-right text-xs"
                                          />
                                        </td>
                                        <td className="text-right">
                                          {difference !== null && (
                                            <span className={`font-bold ${difference > 0 ? 'text-green-600' : difference < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                              {difference > 0 ? '+' : ''}{difference.toFixed(0)}
                                            </span>
                                          )}
                                        </td>
                                        <td className="text-center">
                                          {manualData.grn_qty && (
                                            <Button 
                                              size="sm" 
                                              variant="ghost"
                                              onClick={() => setManualGrnData(prev => {
                                                const newData = { ...prev };
                                                delete newData[itemKey];
                                                return newData;
                                              })}
                                              className="h-6 w-6 p-0 text-gray-500"
                                            >
                                              <X size={12} />
                                            </Button>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-3">
                    Click a date row to expand, then enter GRN values. Or upload Ninjacart CSV/Excel file to auto-match.
                  </p>
                </div>
              )}

              {/* Saved GRNs - Collapsible by Date */}
              {grns.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold text-sm mb-3">Saved GRN Records</h4>
                  
                  {/* Group GRNs by dispatch date */}
                  {(() => {
                    // Group all items by dispatch date
                    const itemsByDate = {};
                    grns.forEach(grn => {
                      grn.items?.forEach(item => {
                        const date = item.dispatch_date || 'Unknown';
                        if (!itemsByDate[date]) {
                          itemsByDate[date] = { items: [], grnIds: new Set() };
                        }
                        itemsByDate[date].items.push({ ...item, grnId: grn.id });
                        itemsByDate[date].grnIds.add(grn.id);
                      });
                    });
                    
                    const sortedDates = Object.keys(itemsByDate).sort().reverse();
                    
                    return (
                      <div className="space-y-2">
                        {sortedDates.map((date) => {
                          const dateData = itemsByDate[date];
                          const totalSupplied = dateData.items.reduce((sum, i) => sum + (i.supplied_qty || 0), 0);
                          const totalGrn = dateData.items.reduce((sum, i) => sum + (i.grn_qty || 0), 0);
                          const totalDiff = dateData.items.reduce((sum, i) => sum + (i.difference || 0), 0);
                          const totalAmount = dateData.items.reduce((sum, i) => sum + (i.amount || 0), 0);
                          const isExpanded = expandedSavedDates[date];
                          
                          return (
                            <div key={date} className="border rounded-lg overflow-hidden">
                              {/* Summary Row - Clickable */}
                              <div 
                                className="flex items-center gap-3 p-3 bg-green-50 border-b cursor-pointer hover:bg-green-100"
                                onClick={() => setExpandedSavedDates(prev => ({ ...prev, [date]: !prev[date] }))}
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  <span className="font-semibold text-green-800">{date}</span>
                                </div>
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                  {dateData.items.length} items
                                </span>
                                <span className="text-xs text-gray-600">
                                  Supplied: <strong>{totalSupplied.toFixed(0)}</strong>
                                </span>
                                <span className="text-xs text-gray-600">
                                  GRN: <strong>{totalGrn.toFixed(0)}</strong>
                                </span>
                                <span className={`text-xs font-bold ${totalDiff > 0 ? 'text-green-600' : totalDiff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                  Diff: {totalDiff > 0 ? '+' : ''}{totalDiff.toFixed(0)}
                                </span>
                                <span className="text-xs text-gray-700 ml-auto">
                                  Amount: <strong>₹{totalAmount.toFixed(0)}</strong>
                                </span>
                              </div>
                              
                              {/* Expanded Items Table */}
                              {isExpanded && (
                                <div className="data-table overflow-x-auto">
                                  <table className="text-xs">
                                    <thead>
                                      <tr>
                                        <th>PRODUCT / PACKAGING</th>
                                        <th className="text-right">SUPPLIED</th>
                                        <th className="text-right">GRN</th>
                                        <th className="text-right">DIFF</th>
                                        <th className="text-right">RATE</th>
                                        <th className="text-right">AMOUNT</th>
                                        <th className="text-center">ACT</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dateData.items.map((item, idx) => {
                                        const lossGain = item.loss_gain_amount || (item.difference * (item.rate_per_unit || 0));
                                        const isEditingThis = editingSavedGrn === `${item.grnId}_${idx}`;
                                        const currentRate = item.rate_per_kg || item.rate_per_unit || 0;
                                        
                                        return (
                                          <tr key={idx} className={isEditingThis ? 'bg-yellow-50' : ''}>
                                            <td>
                                              <div className="font-medium text-[#14532D]">{item.product_name}</div>
                                              <div className="text-[10px] text-gray-500">{item.packaging_name || '-'}</div>
                                            </td>
                                            <td className="text-right">{item.supplied_qty}</td>
                                            <td className="text-right font-semibold">{item.grn_qty?.toFixed(0)}</td>
                                            <td className="text-right">
                                              <span className={`font-bold ${
                                                item.difference > 0 ? 'text-green-600' : 
                                                item.difference < 0 ? 'text-red-600' : 'text-gray-400'
                                              }`}>
                                                {item.difference !== 0 ? (item.difference > 0 ? '+' : '') + item.difference?.toFixed(0) : '-'}
                                              </span>
                                            </td>
                                            <td className="text-right whitespace-nowrap">
                                              ₹{currentRate.toFixed(1)}{item.rate_per_kg ? '/Kg' : '/Pc'}
                                            </td>
                                            <td className="text-right font-semibold whitespace-nowrap">
                                              ₹{item.amount?.toFixed(0)}
                                              {lossGain !== 0 && (
                                                <div className={`text-xs font-bold ${lossGain > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                  {lossGain > 0 ? '+' : ''}₹{lossGain.toFixed(0)}
                                                </div>
                                              )}
                                            </td>
                                            <td className="text-center">
                                              <div className="flex items-center justify-center gap-0.5">
                                                <Button 
                                                  size="sm" 
                                                  variant="ghost" 
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Find the GRN and load into matched items for editing
                                                    const grn = grns.find(g => g.id === item.grnId);
                                                    if (grn) {
                                                      setGrnMatchedItems(grn.items);
                                                      setGrnUploadResult({ 
                                                        file_name: `Editing GRN: ${date}`,
                                                        matched_items: grn.items,
                                                        dates_found: [date],
                                                        editing_grn_id: grn.id
                                                      });
                                                      toast.info('GRN loaded for editing. Make changes and Save to update.');
                                                    }
                                                  }}
                                                  className="h-6 w-6 p-0 text-blue-600"
                                                >
                                                  <Pencil size={12} />
                                                </Button>
                                                <Button 
                                                  size="sm" 
                                                  variant="ghost" 
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSavedGrnItem(item.grnId, grns.find(g => g.id === item.grnId)?.items?.indexOf(item) || 0);
                                                  }}
                                                  className="h-6 w-6 p-0 text-red-600"
                                                >
                                                  <Trash2 size={12} />
                                                </Button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="bg-gray-50 text-xs">
                                        <td className="font-semibold">Total ({dateData.items.length} items)</td>
                                        <td className="text-right font-bold">{totalSupplied.toFixed(0)}</td>
                                        <td className="text-right font-bold">{totalGrn.toFixed(0)}</td>
                                        <td className="text-right">
                                          <span className={`font-bold ${totalDiff > 0 ? 'text-green-600' : totalDiff < 0 ? 'text-red-600' : ''}`}>
                                            {totalDiff > 0 ? '+' : ''}{totalDiff.toFixed(0)}
                                          </span>
                                        </td>
                                        <td></td>
                                        <td className="text-right font-bold">₹{totalAmount.toFixed(0)}</td>
                                        <td></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Empty state */}
              {grnDispatchItems.length === 0 && grnMatchedItems.length === 0 && grns.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <ClipboardCheck size={48} className="mx-auto text-gray-400 mb-4" />
                  <p>No Ninjacart dispatches found.</p>
                  <p className="text-sm mt-2">Create dispatches for Ninjacart first, then upload their CSV/Excel file for GRN matching.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PACKAGING TAB */}
        <TabsContent value="packaging" className="mt-6">
          <div className="flex flex-wrap gap-3 mb-4">
            <Dialog open={openPackaging} onOpenChange={(open) => { setOpenPackaging(open); if (!open) resetPackagingForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-[#14532D] hover:bg-[#166534]" data-testid="add-packaging-btn">
                  <Plus size={16} className="mr-2" />
                  Add Packaging Variant
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingPackaging ? 'Edit Packaging Variant' : 'Add Packaging Variant'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitPackaging} className="space-y-4">
                  <div>
                    <Label htmlFor="packaging-name">Packaging Name *</Label>
                    <Input
                      id="packaging-name"
                      placeholder="e.g., Packet 100 gm, Without Roots 90-100 gm"
                      value={packagingForm.name}
                      onChange={(e) => setPackagingForm({ ...packagingForm, name: e.target.value })}
                      required
                      data-testid="packaging-name-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Name should describe the packaging type
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="packaging-weight">Weight (in grams) *</Label>
                    <Input
                      id="packaging-weight"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 100, 250, 500"
                      value={packagingForm.weight_gm}
                      onChange={(e) => setPackagingForm({ ...packagingForm, weight_gm: e.target.value })}
                      required
                      data-testid="packaging-weight-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This weight will be used for P&L calculations
                    </p>
                  </div>
                  <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-packaging-btn">
                    {editingPackaging ? 'Update Packaging' : 'Add Packaging'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Packaging Variants ({packagingVariants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>PACKAGING NAME</th>
                      <th className="text-right">WEIGHT (gm)</th>
                      <th className="text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packagingVariants.map((pkg) => (
                      <tr key={pkg.id} data-testid={`packaging-row-${pkg.id}`}>
                        <td className="font-medium">{pkg.name}</td>
                        <td className="text-right">{pkg.weight_gm} gm</td>
                        <td>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditPackaging(pkg)}
                              data-testid={`edit-packaging-${pkg.id}`}
                            >
                              <Edit size={14} className="text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeletePackaging(pkg.id)}
                              data-testid={`delete-packaging-${pkg.id}`}
                            >
                              <Trash2 size={14} className="text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {packagingVariants.length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    <Box size={48} className="mx-auto text-gray-400 mb-4" />
                    <p>No packaging variants found. Add your first packaging variant.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CUSTOMERS TAB */}
        <TabsContent value="customers" className="mt-6">
          <div className="flex flex-wrap gap-3 mb-4">
            <Button 
              variant="outline" 
              onClick={() => { resetCustomerForm(); setOpenCustomer(true); }}
              data-testid="add-customer-btn-tab"
            >
              <UserPlus size={16} className="mr-2" />
              Add Customer
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">QC Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customers.map((customer) => (
                  <div key={customer.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow" data-testid={`customer-card-${customer.id}`}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg text-[#14532D]">{customer.name}</h3>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditCustomer(customer)}
                          data-testid={`edit-customer-${customer.id}`}
                        >
                          <Edit size={14} className="text-blue-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteCustomer(customer.id)}
                          data-testid={`delete-customer-${customer.id}`}
                        >
                          <Trash2 size={14} className="text-red-600" />
                        </Button>
                      </div>
                    </div>
                    {customer.contact_person && (
                      <p className="text-sm text-gray-600">Contact: {customer.contact_person}</p>
                    )}
                    {customer.contact_number && (
                      <p className="text-sm text-gray-600">Phone: {customer.contact_number}</p>
                    )}
                    {customer.address && (
                      <p className="text-sm text-gray-500 mt-1">{customer.address}</p>
                    )}
                  </div>
                ))}
              </div>
              {customers.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <UserPlus size={48} className="mx-auto text-gray-400 mb-4" />
                  <p>No customers found. Add your first QC customer to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Dialog - Rendered outside Tabs so it can be opened from any tab */}
      <Dialog open={openInvoice} onOpenChange={setOpenInvoice}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? `Edit Invoice: ${editingInvoice.invoice_number}` : 'Create Invoice'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Invoice Header */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label className="text-sm">Invoice Date *</Label>
                <Input
                  type="date"
                  value={invoiceForm.invoice_date}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Can be backdated</p>
              </div>
              {!editingInvoice && (
                <div>
                  <Label className="text-sm">Customer *</Label>
                  <Select 
                    value={invoiceForm.customer_name} 
                    onValueChange={(value) => {
                      const customerType = value.toLowerCase().includes('ninja') ? 'ninjacart' : 'standard';
                      setInvoiceForm({ ...invoiceForm, customer_name: value, customer_type: customerType });
                      setSelectedItemsForInvoice({});
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select Customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editingInvoice && (
                <div>
                  <Label className="text-sm">Customer</Label>
                  <Input value={invoiceForm.customer_name} disabled className="mt-1 bg-gray-100" />
                </div>
              )}
              {!editingInvoice && (
                <div>
                  <Label className="text-sm">Filter by Dispatch Date</Label>
                  <Input
                    type="date"
                    value={invoiceDateFilter}
                    onChange={(e) => {
                      setInvoiceDateFilter(e.target.value);
                      setSelectedItemsForInvoice({});
                    }}
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-sm">Invoice Type</Label>
                <Input 
                  value={invoiceForm.customer_type === 'ninjacart' ? 'Ninjacart (No Rate)' : 'Standard (With Rate)'} 
                  disabled 
                  className="mt-1 bg-gray-100" 
                />
              </div>
            </div>

            {/* Item Selection (for new invoice) */}
            {!editingInvoice && invoiceForm.customer_name && (
              <div className="border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-sm">Select Products for Invoice</h4>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => selectAllItems(getDispatchedItemsForCustomer(invoiceForm.customer_name, invoiceDateFilter))}
                    >
                      Select All
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearItemSelection}>
                      Clear
                    </Button>
                  </div>
                </div>
                
                {getDispatchedItemsForCustomer(invoiceForm.customer_name, invoiceDateFilter).length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    No dispatched items found for {invoiceForm.customer_name} on {invoiceDateFilter}
                  </p>
                ) : (
                  <div className="data-table max-h-64 overflow-y-auto">
                    <table>
                      <thead>
                        <tr>
                          <th style={{width: '40px'}}>
                            <input 
                              type="checkbox" 
                              checked={Object.keys(selectedItemsForInvoice).length === getDispatchedItemsForCustomer(invoiceForm.customer_name, invoiceDateFilter).length && Object.keys(selectedItemsForInvoice).length > 0}
                              onChange={(e) => e.target.checked ? selectAllItems(getDispatchedItemsForCustomer(invoiceForm.customer_name, invoiceDateFilter)) : clearItemSelection()}
                              className="w-4 h-4"
                            />
                          </th>
                          <th>PRODUCT</th>
                          <th>PACKAGING</th>
                          <th className="text-right">QTY</th>
                          <th>DISPATCH TIME</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getDispatchedItemsForCustomer(invoiceForm.customer_name, invoiceDateFilter).map((item) => (
                          <tr 
                            key={item.key} 
                            className={selectedItemsForInvoice[item.key] ? 'bg-green-50' : ''}
                            onClick={() => toggleItemSelection(item.key)}
                            style={{cursor: 'pointer'}}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={!!selectedItemsForInvoice[item.key]}
                                onChange={() => toggleItemSelection(item.key)}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="font-medium">{item.product_name}</td>
                            <td className="text-sm text-gray-600">{item.packaging_name || '-'}</td>
                            <td className="text-right">{item.supplied_qty}</td>
                            <td className="text-sm text-gray-500">{item.dispatch_time || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  Selected: {Object.values(selectedItemsForInvoice).filter(Boolean).length} items
                </p>
              </div>
            )}

            {/* Edit mode - show existing items */}
            {editingInvoice && (
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>S.NO</th>
                      <th>PRODUCT</th>
                      <th>PACKAGING</th>
                      <th className="text-right">INDENT QTY</th>
                      <th className="text-right">SUPPLIED QTY</th>
                      <th className="text-right">LOT SIZE</th>
                      <th className="text-right">CRATES</th>
                      {invoiceForm.customer_type === 'ninjacart' && (
                        <th className="text-right">RECEIVING QTY</th>
                      )}
                      {invoiceForm.customer_type !== 'ninjacart' && (
                        <>
                          <th className="text-right">RATE (₹)</th>
                          <th className="text-right">AMOUNT (₹)</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceForm.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td className="font-medium">{item.product_name}</td>
                        <td className="text-sm text-gray-600">{item.packaging_name || '-'}</td>
                        <td className="text-right">{item.indent_qty || '-'}</td>
                        <td className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.supplied_qty}
                            onChange={(e) => updateInvoiceItem(idx, 'supplied_qty', parseFloat(e.target.value) || 0)}
                            className="w-20 h-8 text-right"
                          />
                        </td>
                        <td className="text-right">{item.lot_size}</td>
                        <td className="text-right">{item.no_of_crates}</td>
                        {invoiceForm.customer_type === 'ninjacart' && (
                          <td className="text-right">
                            <Input
                              type="number"
                              step="0.01"
                              value={item.receiving_qty || item.supplied_qty}
                              onChange={(e) => updateInvoiceItem(idx, 'receiving_qty', parseFloat(e.target.value) || 0)}
                              className="w-20 h-8 text-right"
                            />
                          </td>
                        )}
                        {invoiceForm.customer_type !== 'ninjacart' && (
                          <>
                            <td className="text-right">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.rate || ''}
                                onChange={(e) => updateInvoiceItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-20 h-8 text-right"
                                placeholder="Rate"
                              />
                            </td>
                            <td className="text-right font-semibold">
                              ₹{((item.supplied_qty || 0) * (item.rate || 0)).toFixed(2)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {invoiceForm.customer_type !== 'ninjacart' && (
                    <tfoot>
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="text-right font-semibold">Subtotal:</td>
                        <td className="text-right font-bold">₹{invoiceForm.subtotal?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={8} className="text-right">Discount:</td>
                        <td className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={invoiceForm.discount || ''}
                            onChange={(e) => {
                              const discount = parseFloat(e.target.value) || 0;
                              setInvoiceForm(prev => ({
                                ...prev,
                                discount: discount,
                                total_amount: prev.subtotal - discount
                              }));
                            }}
                            className="w-24 h-8 text-right"
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                      <tr className="bg-green-50">
                        <td colSpan={8} className="text-right font-bold text-lg">Total:</td>
                        <td className="text-right font-bold text-lg text-green-700">₹{invoiceForm.total_amount?.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            <div>
              <Label className="text-sm">Remarks</Label>
              <Input
                value={invoiceForm.remarks}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, remarks: e.target.value })}
                placeholder="Any additional notes"
                className="mt-1"
              />
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1 bg-[#14532D] hover:bg-[#166534]"
                onClick={handleSaveInvoice}
                disabled={!editingInvoice && Object.values(selectedItemsForInvoice).filter(Boolean).length === 0}
              >
                <Save size={16} className="mr-2" />
                {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
