import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { 
  Plus, Package, Truck, AlertTriangle, AlertCircle, DollarSign, 
  Edit, Edit2, Trash2, X, ChevronDown, ChevronRight, FileText, Download, Check,
  Search, IndianRupee, ShoppingCart, CreditCard, TrendingUp, FileSpreadsheet, Clock, Zap, ClipboardList, Pencil, CheckCircle, Save, Eye, RefreshCw, Tag, Printer, Calendar, Info, ChevronsUpDown, Wrench
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

// Helper function to get current date in IST (India Standard Time)
// This ensures consistent date handling regardless of user's system timezone
const getISTDate = () => {
  const now = new Date();
  // Convert to IST by creating a formatter and extracting parts
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return istFormatter.format(now); // Returns YYYY-MM-DD format
};

// Helper to get IST date with offset (for relative dates like "30 days ago")
const getISTDateWithOffset = (daysOffset) => {
  const now = new Date();
  now.setDate(now.getDate() + daysOffset);
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return istFormatter.format(now);
};

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
      // Escape quotes and wrap in quotes
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

// Sticker MRP Override Form Component
const StickerMrpOverrideForm = ({ editItem, products, packagings, onSave, onCancel }) => {
  const [selectedProduct, setSelectedProduct] = useState(editItem?.productId || '');
  const [selectedVariant, setSelectedVariant] = useState(editItem?.variantId || '');
  const [mrp, setMrp] = useState(editItem?.mrp || '');
  const [productSearch, setProductSearch] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  
  // Build packaging map for display
  const packagingMap = useMemo(() => {
    const map = {};
    packagings.forEach(p => {
      map[p.id] = p.name || '';
    });
    return map;
  }, [packagings]);
  
  // Get product name
  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product?.name || '';
  };
  
  // Get variant display name
  const getVariantName = (variantId) => {
    if (variantId === 'unit_piece') return 'Pieces';
    if (variantId === 'unit_packet') return 'Packets';
    return packagingMap[variantId] || variantId;
  };
  
  // Filtered products for search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const search = productSearch.toLowerCase();
    return products.filter(p => p.name?.toLowerCase().includes(search));
  }, [products, productSearch]);
  
  // Get variants for selected product (from packagings + special unit variants)
  const availableVariants = useMemo(() => {
    const variants = [
      { id: 'unit_piece', name: 'Pieces' },
      { id: 'unit_packet', name: 'Packets' },
      ...packagings.map(p => ({ id: p.id, name: p.name }))
    ];
    
    if (!variantSearch.trim()) return variants;
    const search = variantSearch.toLowerCase();
    return variants.filter(v => v.name?.toLowerCase().includes(search));
  }, [packagings, variantSearch]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }
    if (!selectedVariant) {
      toast.error('Please select a variant');
      return;
    }
    if (!mrp || parseFloat(mrp) <= 0) {
      toast.error('Please enter a valid MRP');
      return;
    }
    
    onSave({
      product_id: selectedProduct,
      product_name: getProductName(selectedProduct),
      variant_id: selectedVariant,
      variant_name: getVariantName(selectedVariant),
      mrp: parseFloat(mrp)
    });
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Product Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Product</label>
        {editItem?.productId ? (
          <div className="p-2 bg-gray-100 rounded text-sm">
            {editItem.productName || getProductName(editItem.productId)}
          </div>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-10"
              >
                {selectedProduct ? getProductName(selectedProduct) : "Select product..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search products..." 
                  value={productSearch}
                  onValueChange={setProductSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No product found.</CommandEmpty>
                  <CommandGroup>
                    {filteredProducts.slice(0, 50).map((product) => (
                      <CommandItem
                        key={product.id}
                        value={product.name}
                        onSelect={() => {
                          setSelectedProduct(product.id);
                          setProductSearch('');
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedProduct === product.id ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <span>{product.name}</span>
                        <span className="ml-2 text-xs text-gray-500">{product.category}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      
      {/* Variant Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">Variant</label>
        {editItem?.variantId ? (
          <div className="p-2 bg-gray-100 rounded text-sm">
            {editItem.variantName || getVariantName(editItem.variantId)}
          </div>
        ) : (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-10"
              >
                {selectedVariant ? getVariantName(selectedVariant) : "Select variant..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search variants..." 
                  value={variantSearch}
                  onValueChange={setVariantSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No variant found.</CommandEmpty>
                  <CommandGroup>
                    {availableVariants.slice(0, 50).map((variant) => (
                      <CommandItem
                        key={variant.id}
                        value={variant.name}
                        onSelect={() => {
                          setSelectedVariant(variant.id);
                          setVariantSearch('');
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedVariant === variant.id ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        {variant.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      
      {/* MRP Input */}
      <div>
        <label className="block text-sm font-medium mb-1">MRP (₹)</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={mrp}
          onChange={(e) => setMrp(e.target.value)}
          placeholder="Enter MRP"
          className="h-10"
        />
      </div>
      
      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-[#14532D] hover:bg-[#166534]">
          <Save size={16} className="mr-2" />
          {editItem?.id ? 'Update Override' : 'Create Override'}
        </Button>
      </div>
    </form>
  );
};

export default function RetailerOrders() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('indents');
  const [retailers, setRetailers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagings, setPackagings] = useState([]);
  const [retailerCatalogue, setRetailerCatalogue] = useState([]);
  const [selectedRetailer, setSelectedRetailer] = useState('');
  
  // Date filters - default to today (IST timezone)
  const today = getISTDate();
  const [indentDateFilter, setIndentDateFilter] = useState(today);
  const [dispatchDateFilter, setDispatchDateFilter] = useState(today);
  
  // Indents state
  const [indents, setIndents] = useState([]);
  const [filteredIndents, setFilteredIndents] = useState([]);
  const [showIndentModal, setShowIndentModal] = useState(false);
  const [indentForm, setIndentForm] = useState({
    retailer_id: '',
    indent_date: getISTDate(),
    items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: '', status: 'pending' }],
    remarks: ''
  });
  
  // Dispatches state
  const [dispatches, setDispatches] = useState([]);
  const [filteredDispatches, setFilteredDispatches] = useState([]);
  const [expandedDispatchId, setExpandedDispatchId] = useState(null);  // For showing dispatch items
  const [expandedRejectionDates, setExpandedRejectionDates] = useState({});  // For grouping rejections by date
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState(null);
  const [selectedIndent, setSelectedIndent] = useState(null);
  const [dispatchForm, setDispatchForm] = useState({
    dispatch_date: getISTDate(),
    items: [],
    remarks: '',
    transport_charges: 0
  });
  
  // Editing indent state
  const [editingIndent, setEditingIndent] = useState(null);
  
  // Invoices state
  const [invoices, setInvoices] = useState([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [uninvoicedDispatches, setUninvoicedDispatches] = useState([]);
  const [selectedDispatchIds, setSelectedDispatchIds] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [editInvoiceForm, setEditInvoiceForm] = useState(null);
  const [editInvoicePayments, setEditInvoicePayments] = useState([]); // Payment history for edit modal
  const [editInvoicePaymentsLoading, setEditInvoicePaymentsLoading] = useState(false);
  const [editInvoiceCreditAdjustments, setEditInvoiceCreditAdjustments] = useState([]); // Credit notes for edit modal
  // For item-level selection
  const [uninvoicedItems, setUninvoicedItems] = useState([]); // All uninvoiced items
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [invoiceForm, setInvoiceForm] = useState({
    retailer_id: '',
    invoice_date: getISTDate(),
    remarks: ''
  });
  
  // Statement/Ledger state
  const [statementData, setStatementData] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementRetailerId, setStatementRetailerId] = useState('');
  const [statementStartDate, setStatementStartDate] = useState(() => {
    return getISTDateWithOffset(-30); // 30 days ago in IST
  });
  const [statementEndDate, setStatementEndDate] = useState(getISTDate());
  const [expandedStatementGroups, setExpandedStatementGroups] = useState({});
  
  // Rejections state
  const [rejections, setRejections] = useState([]);
  const [filteredRejections, setFilteredRejections] = useState([]);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [editingRejection, setEditingRejection] = useState(null);
  // Changed from single date to From/To date range
  const [rejectionDateFrom, setRejectionDateFrom] = useState('');
  const [rejectionDateTo, setRejectionDateTo] = useState('');
  const [rejectionRetailerFilter, setRejectionRetailerFilter] = useState('');
  const [rejectionProductFilter, setRejectionProductFilter] = useState('');
  const [rejectionForm, setRejectionForm] = useState({
    retailer_id: '',
    rejection_date: getISTDate(),
    items: [] // Changed to array of items for multi-item rejection
  });
  const [rejectionDispatchItems, setRejectionDispatchItems] = useState([]); // Dispatch items for selected date
  
  // Daily Rejection Summary state (view by recorded date)
  const [rejectionViewMode, setRejectionViewMode] = useState('by-invoice'); // 'by-invoice' or 'by-recorded'
  const [dailyRejectionSummary, setDailyRejectionSummary] = useState([]);
  const [loadingDailySummary, setLoadingDailySummary] = useState(false);
  const [expandedDailyDates, setExpandedDailyDates] = useState({});
  
  // Credit Notes state
  const [creditNotes, setCreditNotes] = useState([]);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [selectedRejectionForCN, setSelectedRejectionForCN] = useState(null);
  const [creditNoteFilter, setCreditNoteFilter] = useState({ retailer: '', status: '' });
  const [expandedCreditNoteDates, setExpandedCreditNoteDates] = useState({});
  const [creditNoteViewMode, setCreditNoteViewMode] = useState('by-invoice'); // 'by-invoice' or 'by-recorded'  
  // Credit Note Edit state
  const [showEditCreditNoteModal, setShowEditCreditNoteModal] = useState(false);
  const [editingCreditNote, setEditingCreditNote] = useState(null);
  const [editCreditNoteForm, setEditCreditNoteForm] = useState({ amount: '', remarks: '' });
  
  // Invoice tab filter state
  const [invoiceDateFrom, setInvoiceDateFrom] = useState('');
  const [invoiceDateTo, setInvoiceDateTo] = useState('');
  const [invoiceRetailerFilter, setInvoiceRetailerFilter] = useState('');
  const [invoiceRetailerSearch, setInvoiceRetailerSearch] = useState('');
  const [showInvoiceRetailerDropdown, setShowInvoiceRetailerDropdown] = useState(false);
  
  // Credit Note tab filter state
  const [creditNoteDateFrom, setCreditNoteDateFrom] = useState('');
  const [creditNoteDateTo, setCreditNoteDateTo] = useState('');
  const [creditNoteRetailerFilter, setCreditNoteRetailerFilter] = useState('');
  const [creditNoteRetailerSearch, setCreditNoteRetailerSearch] = useState('');
  const [showCreditNoteRetailerDropdown, setShowCreditNoteRetailerDropdown] = useState(false);
  
  // Credit Note Adjustment state (for payment modal)
  const [pendingCreditNotesForPayment, setPendingCreditNotesForPayment] = useState([]);
  const [selectedCreditAdjustments, setSelectedCreditAdjustments] = useState([]); // [{credit_note_id, amount}]
  const [loadingPendingCredits, setLoadingPendingCredits] = useState(false);
  
  // Error dialog state for rejection validation
  const [rejectionErrorDialog, setRejectionErrorDialog] = useState({
    open: false,
    title: '',
    message: ''
  });
  
  // Invoice Print Language Selection state
  const [showPrintLanguageDialog, setShowPrintLanguageDialog] = useState(false);
  const [invoiceToPrint, setInvoiceToPrint] = useState(null);
  const [printLanguage, setPrintLanguage] = useState('en'); // 'en', 'hi', 'mr'
  
  // Credit Notes backfill state
  const [isBackfillingCreditNotes, setIsBackfillingCreditNotes] = useState(false);
  const [isBackfillingMissingCNs, setIsBackfillingMissingCNs] = useState(false);
  const [isFixingOrphanedCNs, setIsFixingOrphanedCNs] = useState(false);
  const [isFixingRejectionData, setIsFixingRejectionData] = useState(false);
  const [isDiagnosingCNSync, setIsDiagnosingCNSync] = useState(false);
  const [isFixingCNSync, setIsFixingCNSync] = useState(false);
  const [cnSyncDiagnostics, setCnSyncDiagnostics] = useState(null);
  const [isReconciling100UpfrontCNs, setIsReconciling100UpfrontCNs] = useState(false);
  const [isCleaningBogusCNs, setIsCleaningBogusCNs] = useState(false);
  const [isSettingModelDates, setIsSettingModelDates] = useState(false);
  
  // Rejection Analytics state (for the Rejection Loss block)
  const [rejectionAnalyticsState, setRejectionAnalyticsState] = useState({
    totalValue: 0,
    totalCogs: 0,
    count: 0,
    totalQty: 0,
    topProductByQty: null
  });
  
  // Payments state
  const [payments, setPayments] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    retailer_id: '',
    payment_date: getISTDate(),
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    remarks: ''
  });
  const [paymentContext, setPaymentContext] = useState(null); // Store dispatch details for selected date/retailer
  
  // Invoice Payment Modal state
  const [showInvoicePaymentModal, setShowInvoicePaymentModal] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [invoicePaymentForm, setInvoicePaymentForm] = useState({
    amount: '',
    payment_mode: 'cash',
    received_by: '',
    received_by_name: '',
    reference_number: '',
    remarks: '',
    payment_date: getISTDate()
  });
  const [staffUsers, setStaffUsers] = useState([]); // Admin and Staff users for "Received By"
  const [invoiceExistingPayments, setInvoiceExistingPayments] = useState([]); // Existing payments for partial invoices
  const [loadingExistingPayments, setLoadingExistingPayments] = useState(false);
  
  // Payment History Modal state (for viewing/editing paid invoices)
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [selectedInvoiceForHistory, setSelectedInvoiceForHistory] = useState(null);
  const [invoicePaymentHistory, setInvoicePaymentHistory] = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [invoiceCreditAdjustments, setInvoiceCreditAdjustments] = useState([]); // Credit notes used for this invoice
  const [invoiceOriginatedCreditNotes, setInvoiceOriginatedCreditNotes] = useState([]); // Credit notes created FROM this invoice (excess payment)
  
  // Edit Payment state
  const [editingPayment, setEditingPayment] = useState(null);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [editPaymentForm, setEditPaymentForm] = useState({
    amount: '',
    payment_mode: 'cash',
    reference_number: '',
    remarks: '',
    payment_date: ''
  });
  
  // Invoice filter state
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all'); // all, pending, partial, paid
  
  // Search states for autocomplete
  const [productSearch, setProductSearch] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(null); // index of item showing dropdown
  const [showVariantDropdown, setShowVariantDropdown] = useState(null);
  const [retailerSearch, setRetailerSearch] = useState('');
  const [showRetailerDropdown, setShowRetailerDropdown] = useState(false);
  const [paymentRetailerSearch, setPaymentRetailerSearch] = useState('');
  const [showPaymentRetailerDropdown, setShowPaymentRetailerDropdown] = useState(false);
  const productSearchRef = useRef(null);
  const variantSearchRef = useRef(null);
  
  // Dashboard summary state
  const [dashboardStats, setDashboardStats] = useState({
    totalIndents: 0,
    pendingIndents: 0,
    totalIndentQty: 0,
    totalDispatches: 0,
    totalDispatchQty: 0,
    totalMrpValue: 0,
    totalNetReceivable: 0,
    totalInvoiced: 0,
    totalPayments: 0,
    pendingAmount: 0,
    totalRejections: 0,
    totalRejectionCogs: 0
  });
  
  // Rejection Loss date filter
  const [rejectionLossDateFrom, setRejectionLossDateFrom] = useState(() => {
    return getISTDateWithOffset(-84); // 12 weeks = 84 days in IST
  });
  const [rejectionLossDateTo, setRejectionLossDateTo] = useState(getISTDate());
  const [showRejectionAnalyticsModal, setShowRejectionAnalyticsModal] = useState(false);
  const [rejectionRetailerDrilldown, setRejectionRetailerDrilldown] = useState(null); // For retailer-specific drill-down
  const [allDispatchesForRejection, setAllDispatchesForRejection] = useState([]); // All dispatches for rejection % calc
  const [loadingRejectionDispatches, setLoadingRejectionDispatches] = useState(false);
  const [selectedProductForAnalysis, setSelectedProductForAnalysis] = useState(''); // Selected product for drilldown
  const [rejectionProductDrilldown, setRejectionProductDrilldown] = useState(null); // Product drilldown modal data
  const [productCountTab, setProductCountTab] = useState('high'); // 'high' or 'low' selling tab for count block
  const [productValueTab, setProductValueTab] = useState('high'); // 'high' or 'low' selling tab for value block
  
  // Earnings Analytics state (uses same date filter as rejection loss)
  const [earningsChartViewMode, setEarningsChartViewMode] = useState('weekly'); // 'daily', 'weekly', 'monthly'
  
  // Closing Inventory Management (Admin)
  const [closingInventoryData, setClosingInventoryData] = useState([]);
  const [closingInventoryDate, setClosingInventoryDate] = useState(getISTDate());
  const [closingInventoryRetailer, setClosingInventoryRetailer] = useState('');
  const [editingClosingItem, setEditingClosingItem] = useState(null);
  const [editingClosingQty, setEditingClosingQty] = useState('');
  const [editingClosingVariant, setEditingClosingVariant] = useState('');
  const [variantSearchTerm, setVariantSearchTerm] = useState('');
  const [dispatchLinkedItemInfo, setDispatchLinkedItemInfo] = useState(null); // Modal for dispatch-linked items
  const [closingHasData, setClosingHasData] = useState(true); // Track if the selected date has closing data
  const [adminEnteringClosing, setAdminEnteringClosing] = useState(false); // Admin entering new closing data
  const [adminClosingInputs, setAdminClosingInputs] = useState({}); // Admin input values for new closing
  
  // New Closing Inventory Entry Mode (simplified)
  const [closingEntryMode, setClosingEntryMode] = useState(false); // Toggle for new entry mode
  const [lastSupplyItems, setLastSupplyItems] = useState([]); // Items from last dispatch
  const [closingEntryItems, setClosingEntryItems] = useState([]); // Items being entered
  const [lastSupplyDate, setLastSupplyDate] = useState(null);
  const [showAddProductModal, setShowAddProductModal] = useState(false); // Modal to add more products
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [closingRetailerCatalogue, setClosingRetailerCatalogue] = useState([]); // Retailer-specific catalogue for closing entry
  
  // New Stock Closing Matrix State (Like Retail Plans)
  const [stockClosingCatalogue, setStockClosingCatalogue] = useState([]); // Parsed catalogue for stock closing
  const [stockClosingData, setStockClosingData] = useState({}); // { productId_variantId: closingQty }
  const [stockClosingOpeningData, setStockClosingOpeningData] = useState({}); // { productId_variantId: openingQty }
  const [stockClosingExpandedCats, setStockClosingExpandedCats] = useState({}); // Expanded categories
  const [stockClosingHasChanges, setStockClosingHasChanges] = useState(false);
  const [stockClosingSaving, setStockClosingSaving] = useState(false);
  const [stockClosingSearchTerm, setStockClosingSearchTerm] = useState(''); // Search term for filtering products
  const [todayClosingSummary, setTodayClosingSummary] = useState([]); // Summary of today's closings
  const [todayClosingSummaryLoading, setTodayClosingSummaryLoading] = useState(false);
  
  // Payment Summary state
  const [showPaymentSummaryModal, setShowPaymentSummaryModal] = useState(false);
  const [showPaymentSummaryPreview, setShowPaymentSummaryPreview] = useState(false); // Preview popup
  
  // Final Summary state (detailed reconciliation view)
  const [showFinalSummaryModal, setShowFinalSummaryModal] = useState(false);
  const [finalSummaryData, setFinalSummaryData] = useState(null);
  const [finalSummaryLoading, setFinalSummaryLoading] = useState(false);
  const [finalSummaryStartDate, setFinalSummaryStartDate] = useState(() => {
    return getISTDateWithOffset(-30); // 30 days ago in IST
  });
  const [finalSummaryEndDate, setFinalSummaryEndDate] = useState(getISTDate());
  const [expandedFinalSummaryRows, setExpandedFinalSummaryRows] = useState({}); // Track expanded rows
  
  // Immediately Payable state (5-day credit)
  const [immediatelyPayable, setImmediatelyPayable] = useState(null);
  const [loadingImmediatelyPayable, setLoadingImmediatelyPayable] = useState(false);
  const [expandedPayableSection, setExpandedPayableSection] = useState(null); // 'upfront', 'credit', 'overdue'
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [selectedInvoicesForSummary, setSelectedInvoicesForSummary] = useState({});
  const [paymentSummaryLoading, setPaymentSummaryLoading] = useState(false);
  
  // Payment Audit state (for finding and deleting orphan payments)
  const [showPaymentAuditModal, setShowPaymentAuditModal] = useState(false);
  const [paymentAuditRetailerId, setPaymentAuditRetailerId] = useState('');
  const [paymentAuditData, setPaymentAuditData] = useState(null);
  const [paymentAuditLoading, setPaymentAuditLoading] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  
  // Payment Ledger state
  const [showPaymentLedgerModal, setShowPaymentLedgerModal] = useState(false);
  const [paymentLedgerData, setPaymentLedgerData] = useState(null);
  const [paymentLedgerLoading, setPaymentLedgerLoading] = useState(false);
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [expandedLedgerDates, setExpandedLedgerDates] = useState({});

  const [loading, setLoading] = useState(true);
  const [expandedIndents, setExpandedIndents] = useState({});
  const [expandedInvoices, setExpandedInvoices] = useState({});
  
  // Collapsible categories for indent/dispatch modals
  const [expandedCategories, setExpandedCategories] = useState({});
  const [indentDownloadLang, setIndentDownloadLang] = useState('en');
  
  // Auto Indent Creation state
  const [showAutoIndentModal, setShowAutoIndentModal] = useState(false);
  const [autoIndentDate, setAutoIndentDate] = useState(getISTDateWithOffset(1)); // Tomorrow in IST
  const [autoIndentRetailerId, setAutoIndentRetailerId] = useState('');
  const [autoIndentLoading, setAutoIndentLoading] = useState(false);
  const [autoIndentBasis, setAutoIndentBasis] = useState('sales'); // 'sales' or 'plan'

  // Daily Requirement state
  const [dailyReqDate, setDailyReqDate] = useState(getISTDate());
  const [dailyReqData, setDailyReqData] = useState([]); // Current working list
  const [originalReqData, setOriginalReqData] = useState([]); // Original from indents (read-only)
  const [savedReqData, setSavedReqData] = useState([]); // Saved/edited list from DB
  const [dailyReqViewMode, setDailyReqViewMode] = useState('original'); // 'original' or 'saved'
  const [deletedItems, setDeletedItems] = useState([]); // Track deleted items for re-adding
  const [dailyReqLoading, setDailyReqLoading] = useState(false);
  const [dailyReqError, setDailyReqError] = useState('');
  const [dailyReqRetailer, setDailyReqRetailer] = useState('');
  const [dailyReqSaving, setDailyReqSaving] = useState(false);
  const [dailyReqSaved, setDailyReqSaved] = useState(false);
  const [retailWastageAverages, setRetailWastageAverages] = useState([]);
  const [expandedPurchaseItem, setExpandedPurchaseItem] = useState(null); // Track which purchase item row is expanded to show retailers
  
  // Daily Requirement sub-tabs state
  const [dailyReqSubTab, setDailyReqSubTab] = useState('purchase'); // 'purchase' or 'stickersMrp'
  
  // Category collapse state for Purchase and Stickers tabs
  const [expandedPurchaseCategories, setExpandedPurchaseCategories] = useState({});
  const [expandedStickersCategories, setExpandedStickersCategories] = useState({});
  
  // Stickers tab state
  const [stickersData, setStickersData] = useState([]);
  const [stickersLoading, setStickersLoading] = useState(false);
  const [stickersSearch, setStickersSearch] = useState('');
  const [stickersCategoryFilter, setStickersCategoryFilter] = useState('all');
  const [expandedStickerItem, setExpandedStickerItem] = useState(null); // Track which sticker item is expanded
  const [stickerIndentDetails, setStickerIndentDetails] = useState({}); // product+variant key -> [{retailer, qty}]
  
  // Sticker MRP Override modal state
  const [stickerOverrideModalOpen, setStickerOverrideModalOpen] = useState(false);
  const [stickerOverrideEditItem, setStickerOverrideEditItem] = useState(null); // null = Add mode, object = Edit mode
  const [stickerMrpOverrides, setStickerMrpOverrides] = useState([]);
  const [stickerOverridesLoading, setStickerOverridesLoading] = useState(false);

  // Print language state for Daily Requirement PDF/Excel
  const [dailyReqPrintLang, setDailyReqPrintLang] = useState('en'); // 'en', 'hi', 'mr'
  
  // Purchase Price auto-population from COGS
  const [purchasePriceCogsData, setPurchasePriceCogsData] = useState(null); // COGS data for purchase price calculation
  const [purchasePriceWarning, setPurchasePriceWarning] = useState(''); // Warning if prices are stale
  
  // Language state for Indent and Dispatch tabs
  const [indentLanguage, setIndentLanguage] = useState('en'); // 'en', 'hi', 'mr'
  const [dispatchLanguage, setDispatchLanguage] = useState('en'); // 'en', 'hi', 'mr'
  
  // MRP tab state
  const [mrpData, setMrpData] = useState([]);
  const [mrpLoading, setMrpLoading] = useState(false);
  // mrpDate no longer needed - MRP now uses dailyReqDate from main Daily Requirement section
  const [expandedMrpCategories, setExpandedMrpCategories] = useState({});
  const [lastVariants, setLastVariants] = useState({});
  const [savingMrp, setSavingMrp] = useState(false);
  const [mrpHasUnsavedChanges, setMrpHasUnsavedChanges] = useState(false);
  const [pendingMrpChanges, setPendingMrpChanges] = useState({});
  const [blinkitPrices, setBlinkitPrices] = useState({});
  const [blinkitLoading, setBlinkitLoading] = useState(false);
  const [scrapingBlinkit, setScrapingBlinkit] = useState(false);
  const [mrpIndentProducts, setMrpIndentProducts] = useState([]); // Products from day's indents for MRP filtering
  const [mrpIndentLoading, setMrpIndentLoading] = useState(false);
  const [mrpAutoInitDone, setMrpAutoInitDone] = useState(false); // Prevent auto-init loop

  // Load base data
  const loadBaseData = useCallback(async () => {
    try {
      const [retailersRes, productsRes, packagingsRes, catalogueRes] = await Promise.all([
        api.get('/api/retailers'),
        api.get('/api/products?include_images=false'),  // Skip heavy Base64 images for faster loading
        api.get('/api/qc-packaging'),
        api.get('/api/retailer-catalogue')
      ]);
      setRetailers(retailersRes.data);
      setProducts(productsRes.data);
      setPackagings(packagingsRes.data);
      
      // Parse variants and purchase_weights from string to array if needed
      const parsedCatalogue = (catalogueRes.data || []).map(item => {
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
      setRetailerCatalogue(parsedCatalogue);
    } catch (error) {
      console.error('Failed to load base data:', error);
    }
  }, []);

  const loadIndents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedRetailer) params.append('retailer_id', selectedRetailer);
      if (indentDateFilter) {
        params.append('start_date', indentDateFilter);
        params.append('end_date', indentDateFilter);
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get(`/api/retailer-indents${queryString}`);
      setIndents(response.data);
    } catch (error) {
      console.error('Failed to load indents:', error);
    }
  }, [selectedRetailer, indentDateFilter]);

  const loadDispatches = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedRetailer) params.append('retailer_id', selectedRetailer);
      if (dispatchDateFilter) {
        params.append('start_date', dispatchDateFilter);
        params.append('end_date', dispatchDateFilter);
      }
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get(`/api/retailer-dispatches${queryString}`);
      setDispatches(response.data);
    } catch (error) {
      console.error('Failed to load dispatches:', error);
    }
  }, [selectedRetailer, dispatchDateFilter]);

  const loadInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      // Use invoiceRetailerFilter if set, else fall back to selectedRetailer
      const retailerId = invoiceRetailerFilter || selectedRetailer;
      if (retailerId) params.append('retailer_id', retailerId);
      if (invoiceDateFrom) params.append('start_date', invoiceDateFrom);
      if (invoiceDateTo) params.append('end_date', invoiceDateTo);
      params.append('limit', '50000');
      const response = await api.get(`/api/retailer-invoices?${params.toString()}`);
      setInvoices(response.data);
    } catch (error) {
      console.error('Failed to load invoices:', error);
    }
  }, [selectedRetailer, invoiceRetailerFilter, invoiceDateFrom, invoiceDateTo]);

  // Load retailer statement/ledger
  const loadStatement = useCallback(async (retailerId, startDate, endDate) => {
    if (!retailerId) {
      toast.error('Please select a retailer first');
      return;
    }
    setStatementLoading(true);
    setExpandedStatementGroups({}); // Reset expanded groups when loading new data
    try {
      const params = new URLSearchParams({
        retailer_id: retailerId,
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
  }, []);

  // Helper function to group statement entries by date+type for collapsible view
  const groupStatementEntries = (entries) => {
    if (!entries || entries.length === 0) return [];
    
    const grouped = [];
    let i = 0;
    
    while (i < entries.length) {
      const current = entries[i];
      const currentDate = current.date?.split('T')[0];
      const currentType = current.type;
      
      // Find all consecutive entries with same date and type
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
        // Multiple items - create a grouped entry
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
          // For display reference
          reference: `${groupItems.length} ${currentType === 'payment' ? 'Payments' : currentType === 'credit_note' ? 'Credit Notes' : currentType === 'invoice' ? 'Invoices' : currentType === 'rejection' ? 'Rejections' : 'Items'}`
        });
      } else {
        // Single item - just add it
        grouped.push({
          isGroup: false,
          ...current
        });
      }
      
      i = j;
    }
    
    return grouped;
  };

  const loadRejections = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedRetailer) params.append('retailer_id', selectedRetailer);
      // Include date range for proper filtering
      params.append('start_date', rejectionLossDateFrom);
      params.append('end_date', rejectionLossDateTo);
      params.append('limit', '50000'); // Increased limit to get all rejections in range
      const response = await api.get(`/api/retailer-rejections?${params.toString()}`);
      setRejections(response.data);
    } catch (error) {
      console.error('Failed to load rejections:', error);
    }
  }, [selectedRetailer, rejectionLossDateFrom, rejectionLossDateTo]);

  // Load daily rejection summary (grouped by recorded date)
  const loadDailyRejectionSummary = useCallback(async () => {
    try {
      setLoadingDailySummary(true);
      const params = new URLSearchParams();
      if (selectedRetailer) params.append('retailer_id', selectedRetailer);
      params.append('start_date', rejectionLossDateFrom);
      params.append('end_date', rejectionLossDateTo);
      const response = await api.get(`/api/retailer-rejections/daily-summary?${params.toString()}`);
      setDailyRejectionSummary(response.data?.daily_summary || []);
    } catch (error) {
      console.error('Failed to load daily rejection summary:', error);
    } finally {
      setLoadingDailySummary(false);
    }
  }, [selectedRetailer, rejectionLossDateFrom, rejectionLossDateTo]);

  // Load credit notes
  const loadCreditNotes = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      // Use creditNoteRetailerFilter if set, else fall back to selectedRetailer
      const retailerId = creditNoteRetailerFilter || selectedRetailer;
      if (retailerId) params.append('retailer_id', retailerId);
      if (creditNoteFilter.status) params.append('status', creditNoteFilter.status);
      if (creditNoteDateFrom) params.append('start_date', creditNoteDateFrom);
      if (creditNoteDateTo) params.append('end_date', creditNoteDateTo);
      params.append('limit', '50000');
      const response = await api.get(`/api/retailer-credit-notes?${params.toString()}`);
      setCreditNotes(response.data || []);
    } catch (error) {
      console.error('Failed to load credit notes:', error);
    }
  }, [selectedRetailer, creditNoteRetailerFilter, creditNoteFilter.status, creditNoteDateFrom, creditNoteDateTo]);

  // Load all dispatches for rejection analytics date range
  const loadDispatchesForRejection = useCallback(async () => {
    try {
      setLoadingRejectionDispatches(true);
      const params = new URLSearchParams();
      params.append('start_date', rejectionLossDateFrom);
      params.append('end_date', rejectionLossDateTo);
      params.append('limit', '1000'); // Get more dispatches for full analysis
      const response = await api.get(`/api/retailer-dispatches?${params.toString()}`);
      setAllDispatchesForRejection(response.data || []);
    } catch (error) {
      console.error('Failed to load dispatches for rejection analysis:', error);
    } finally {
      setLoadingRejectionDispatches(false);
    }
  }, [rejectionLossDateFrom, rejectionLossDateTo]);

  // Load dispatches when rejection modal opens or date range changes
  useEffect(() => {
    if (showRejectionAnalyticsModal) {
      loadDispatchesForRejection();
    }
  }, [showRejectionAnalyticsModal, loadDispatchesForRejection]);

  // Also load dispatches when date range changes (even if modal is closed)
  // This ensures the Rejection Loss block updates properly
  useEffect(() => {
    loadDispatchesForRejection();
    // Also reload rejections to ensure we have fresh data
    loadRejections();
  }, [rejectionLossDateFrom, rejectionLossDateTo, loadDispatchesForRejection, loadRejections]);

  // Update rejection analytics when dates or rejections change
  useEffect(() => {
    // Filter rejections by date range
    const filtered = rejections.filter(r => {
      const rejDate = r.rejection_date?.split('T')[0];
      if (!rejDate) return false;
      return rejDate >= rejectionLossDateFrom && rejDate <= rejectionLossDateTo;
    });
    
    const totalValue = filtered.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
    const totalCogs = filtered.reduce((sum, r) => sum + (r.rejection_cogs || 0), 0);
    const totalQty = filtered.reduce((sum, r) => sum + (r.quantity || 0), 0);
    
    // Find top rejected product
    const productTotals = {};
    filtered.forEach(r => {
      const name = r.product_name || 'Unknown';
      if (!productTotals[name]) productTotals[name] = { qty: 0, value: 0 };
      productTotals[name].qty += r.quantity || 0;
      productTotals[name].value += r.rejection_value || 0;
    });
    
    let topProduct = null;
    let maxQty = 0;
    Object.entries(productTotals).forEach(([name, data]) => {
      if (data.qty > maxQty) {
        maxQty = data.qty;
        topProduct = { name, ...data };
      }
    });
    
    console.log('Rejection Analytics Updated:', {
      dateFrom: rejectionLossDateFrom,
      dateTo: rejectionLossDateTo,
      totalRejections: rejections.length,
      filteredCount: filtered.length,
      totalValue,
      totalCogs,
      totalQty
    });
    
    setRejectionAnalyticsState({
      totalValue,
      totalCogs,
      count: filtered.length,
      totalQty,
      topProductByQty: topProduct
    });
  }, [rejections, rejectionLossDateFrom, rejectionLossDateTo]);

  // Set date range from first invoice to today once invoices are loaded
  const [hasSetInitialDateRange, setHasSetInitialDateRange] = useState(false);
  useEffect(() => {
    if (invoices.length > 0 && !hasSetInitialDateRange) {
      // Find the earliest invoice date
      const invoiceDates = invoices
        .map(inv => inv.invoice_date?.split('T')[0])
        .filter(d => d)
        .sort();
      
      if (invoiceDates.length > 0) {
        const earliestDate = invoiceDates[0];
        setRejectionLossDateFrom(earliestDate);
        setHasSetInitialDateRange(true);
      }
    }
  }, [invoices, hasSetInitialDateRange]);

  // Sync rejection amounts to invoices
  const [syncingRejections, setSyncingRejections] = useState(false);
  const syncRejectionsToInvoices = async () => {
    setSyncingRejections(true);
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.post(`/api/admin/sync-invoice-rejections${params}`);
      toast.success(`Synced rejections to ${response.data.updated_count} invoices`);
      // Reload invoices to reflect the updated rejection amounts
      loadInvoices();
      loadImmediatelyPayable();
    } catch (error) {
      console.error('Failed to sync rejections:', error);
      toast.error('Failed to sync rejections to invoices');
    } finally {
      setSyncingRejections(false);
    }
  };

  // Create Credit Note from rejection
  const createCreditNoteFromRejection = async (rejection, invoice) => {
    try {
      const response = await api.post('/api/retailer-credit-notes', {
        retailer_id: rejection.retailer_id,
        original_invoice_id: invoice.id,
        rejection_id: rejection.id,
        amount: rejection.total_rejection_value || rejection.rejection_value || 0,
        rejection_details: rejection.items || [{
          product_name: rejection.product_name,
          quantity: rejection.quantity,
          mrp: rejection.mrp,
          value: rejection.rejection_value
        }],
        remarks: `Credit Note for rejection dated ${formatDate(rejection.rejection_date)}`
      });
      
      toast.success(`Credit Note ${response.data.credit_note.credit_note_number} created successfully`);
      loadCreditNotes();
      loadRejections();
      setShowCreditNoteModal(false);
      setSelectedRejectionForCN(null);
    } catch (error) {
      console.error('Failed to create credit note:', error);
      toast.error(error.response?.data?.detail || 'Failed to create credit note');
    }
  };

  // Delete credit note
  const deleteCreditNote = async (creditNoteId) => {
    if (!window.confirm('Are you sure you want to delete this credit note?')) return;
    
    try {
      await api.delete(`/api/retailer-credit-notes/${creditNoteId}`);
      toast.success('Credit note deleted');
      loadCreditNotes();
    } catch (error) {
      console.error('Failed to delete credit note:', error);
      toast.error('Failed to delete credit note');
    }
  };

  // Backfill missing rejection details in credit notes
  const backfillCreditNoteDetails = async () => {
    if (!window.confirm('This will update all credit notes to include product-level details from their linked rejections. Continue?')) return;
    
    setIsBackfillingCreditNotes(true);
    try {
      const response = await api.post('/api/retailer-credit-notes/backfill-rejection-details');
      toast.success(`Fixed ${response.data.updated_count} credit notes! ${response.data.skipped_count} already had complete details.`);
      loadCreditNotes(); // Refresh the list
    } catch (error) {
      console.error('Failed to backfill credit notes:', error);
      toast.error('Failed to fix credit notes: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsBackfillingCreditNotes(false);
    }
  };

  // Backfill missing credit notes for rejections created from June 15 onwards
  const backfillMissingCreditNotes = async () => {
    const retailerFilter = selectedRetailer ? `for ${retailers.find(r => r.id === selectedRetailer)?.company_name || 'selected retailer'}` : 'for ALL retailers';
    if (!window.confirm(`This will create credit notes for rejections entered from June 15, 2026 onwards ${retailerFilter} that are missing them.\n\n(Earlier rejections are already adjusted elsewhere)\n\nContinue?`)) return;
    
    setIsBackfillingMissingCNs(true);
    try {
      const url = selectedRetailer 
        ? `/api/retailer-credit-notes/backfill-missing?retailer_id=${selectedRetailer}`
        : '/api/retailer-credit-notes/backfill-missing';
      const response = await api.post(url);
      
      const summary = response.data.summary;
      const created = response.data.created || [];
      
      if (summary.credit_notes_created > 0) {
        // Build a message showing what was created
        const createdList = created.slice(0, 5).map(c => 
          `• ${c.credit_note_number}: ${c.product}${c.variant ? ` (${c.variant})` : ''} - ₹${c.credit_amount}`
        ).join('\n');
        
        toast.success(
          `Created ${summary.credit_notes_created} missing credit notes!\n\n${createdList}${created.length > 5 ? `\n... and ${created.length - 5} more` : ''}`,
          { duration: 10000 }
        );
      } else {
        toast.info(
          `No missing credit notes found.\n• ${summary.skipped_already_has_cn} already have CNs\n• ${summary.skipped_no_invoice_found} had no invoice\n• ${summary.skipped_invoice_not_fully_paid} invoices not fully paid`,
          { duration: 6000 }
        );
      }
      
      loadCreditNotes(); // Refresh the list
      loadRejections();  // Refresh rejections too
    } catch (error) {
      console.error('Failed to backfill missing credit notes:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsBackfillingMissingCNs(false);
    }
  };

  // Reconcile 100% Upfront CNs - create instant CNs for 100% upfront retailers
  const reconcile100UpfrontCNs = async () => {
    setIsReconciling100UpfrontCNs(true);
    try {
      // First, dry run to get preview
      const dryRunUrl = selectedRetailer 
        ? `/api/retailer-credit-notes/reconcile-100-upfront?dry_run=true&retailer_id=${selectedRetailer}`
        : '/api/retailer-credit-notes/reconcile-100-upfront?dry_run=true';
      
      const dryRunResponse = await api.post(dryRunUrl);
      const previewData = dryRunResponse.data;
      
      if (previewData.would_create === 0) {
        toast.info(
          `No credit notes to create.\n` +
          `${previewData.summary?.skipped_before_model_change > 0 ? `${previewData.summary.skipped_before_model_change} skipped (before model switch date)` : 'No eligible rejections found.'}`,
          { duration: 5000 }
        );
        return;
      }
      
      // Build per-retailer breakdown for confirmation
      const perRetailer = previewData.per_retailer || {};
      const retailerBreakdown = Object.entries(perRetailer)
        .map(([name, count]) => `• ${name}: ${count}`)
        .join('\n');
      
      const confirmMessage = 
        `This will create ${previewData.would_create} credit notes:\n\n` +
        `${retailerBreakdown}\n\n` +
        `${previewData.summary?.skipped_before_model_change > 0 ? `(${previewData.summary.skipped_before_model_change} skipped - rejections before model switch date)\n\n` : ''}` +
        `Proceed with creation?`;
      
      if (!window.confirm(confirmMessage)) {
        toast.info('Reconciliation cancelled.');
        return;
      }
      
      // Actually create the credit notes
      const createUrl = selectedRetailer 
        ? `/api/retailer-credit-notes/reconcile-100-upfront?dry_run=false&retailer_id=${selectedRetailer}`
        : '/api/retailer-credit-notes/reconcile-100-upfront?dry_run=false';
      
      const createResponse = await api.post(createUrl);
      const data = createResponse.data;
      const created = data.created_count || 0;
      
      if (created > 0) {
        toast.success(
          `Successfully created ${created} credit note${created > 1 ? 's' : ''}!`,
          { duration: 6000 }
        );
      } else {
        toast.info('No credit notes were created.', { duration: 5000 });
      }
      
      loadCreditNotes(); // Refresh the credit notes list
      loadRejections();  // Refresh rejections too
    } catch (error) {
      console.error('Failed to reconcile 100% upfront CNs:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsReconciling100UpfrontCNs(false);
    }
  };

  // ONE-TIME CLEANUP: Delete bogus credit notes from June 26 reconciliation
  const cleanupBogusCreditNotes = async () => {
    setIsCleaningBogusCNs(true);
    try {
      // First, dry run to get count
      const dryRunResponse = await api.post('/api/retailer-credit-notes/cleanup-bogus-reconciliation?confirm=false');
      const data = dryRunResponse.data;
      
      if (data.bogus_count === 0) {
        toast.info('No bogus credit notes found. Cleanup already done or not needed.');
        return;
      }
      
      const breakdown = data.breakdown || {};
      const confirmMessage = `Found ${data.bogus_count} bogus credit notes to delete:\n\n` +
        `• Jai Bhawani: ${breakdown.jai_bhawani || 0}\n` +
        `• Savtamali: ${breakdown.savtamali || 0}\n\n` +
        `These are the wrong credit notes created on June 26 for pre-June-18 rejections ` +
        `(before these retailers switched to 100% upfront model).\n\n` +
        `Current total: ${data.current_total}\n` +
        `After deletion: ${data.expected_total_after_delete}\n\n` +
        `Proceed with deletion?`;
      
      if (!window.confirm(confirmMessage)) {
        toast.info('Cleanup cancelled.');
        return;
      }
      
      // Actually delete
      const deleteResponse = await api.post('/api/retailer-credit-notes/cleanup-bogus-reconciliation?confirm=true');
      const deleteData = deleteResponse.data;
      
      toast.success(
        `Successfully deleted ${deleteData.deleted_count} bogus credit notes!\n` +
        `New total: ${deleteData.new_total}`,
        { duration: 8000 }
      );
      
      loadCreditNotes(); // Refresh
      loadRejections();
    } catch (error) {
      console.error('Failed to cleanup bogus CNs:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsCleaningBogusCNs(false);
    }
  };

  // ONE-TIME: Set model_changed_at dates for Jai Bhawani and Savtamali
  const setModelChangeDates = async () => {
    const confirmMessage = 
      `This will set June 18, 2026 as the model switch date for:\n\n` +
      `• Jai Bhawani Traders Mundhwa\n` +
      `• Savtamali\n\n` +
      `This means:\n` +
      `- Rejections BEFORE June 18 → use 50% rule (reduce invoice)\n` +
      `- Rejections ON/AFTER June 18 → use 100% rule (instant credit note)\n\n` +
      `Continue?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setIsSettingModelDates(true);
    try {
      const response = await api.post('/api/admin/set-model-change-dates');
      const data = response.data;
      
      if (data.success) {
        const resultDetails = data.results.map(r => 
          `• ${r.retailer_name}: model_changed_at = ${r.current_model_changed_at}`
        ).join('\n');
        
        toast.success(
          `Successfully set model switch dates!\n\n${resultDetails}`,
          { duration: 8000 }
        );
      } else {
        toast.warning('Some updates may have failed. Check console for details.');
        console.log('Model change date results:', data.results);
      }
    } catch (error) {
      console.error('Failed to set model change dates:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsSettingModelDates(false);
    }
  };

  // Fix orphaned credit notes (those adjusted against deleted invoices)
  const fixOrphanedCreditNotes = async () => {
    const retailerFilter = selectedRetailer ? `for ${retailers.find(r => r.id === selectedRetailer)?.company_name || 'selected retailer'}` : 'for ALL retailers';
    if (!window.confirm(`This will reset credit notes ${retailerFilter} that are marked as "adjusted" but reference deleted invoices.\n\nThey will become "pending" and available for adjustment again.\n\nContinue?`)) return;
    
    setIsFixingOrphanedCNs(true);
    try {
      const response = await api.post('/api/retailer-credit-notes/fix-orphaned', {
        retailer_id: selectedRetailer || null
      });
      
      const fixedCount = response.data.fixed_count || 0;
      const fixedDetails = response.data.fixed_details || [];
      
      if (fixedCount > 0) {
        const detailsList = fixedDetails.slice(0, 5).map(d => 
          `• ${d.credit_note_number}: ₹${d.amount_freed} freed (was in ${d.orphaned_invoices.join(', ')})`
        ).join('\n');
        
        toast.success(
          `Fixed ${fixedCount} orphaned credit notes!\n\n${detailsList}${fixedDetails.length > 5 ? `\n... and ${fixedDetails.length - 5} more` : ''}`,
          { duration: 10000 }
        );
      } else {
        toast.info('No orphaned credit notes found. All CNs are properly linked to existing invoices.', { duration: 4000 });
      }
      
      loadCreditNotes(); // Refresh the list
    } catch (error) {
      console.error('Failed to fix orphaned credit notes:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsFixingOrphanedCNs(false);
    }
  };

  // Fix incorrect rejection data in invoices
  const fixInvoiceRejectionData = async () => {
    const retailerFilter = selectedRetailer ? `for ${retailers.find(r => r.id === selectedRetailer)?.company_name || 'selected retailer'}` : 'for ALL retailers';
    if (!window.confirm(`This will recalculate rejection amounts ${retailerFilter} from actual rejection records.\n\nInvoices with incorrect rejection_amount will be fixed.\n\nContinue?`)) return;
    
    setIsFixingRejectionData(true);
    try {
      const response = await api.post('/api/retailer-invoices/fix-rejection-data', {
        retailer_id: selectedRetailer || null
      });
      
      const fixedCount = response.data.fixed_count || 0;
      const fixedDetails = response.data.fixed_details || [];
      
      if (fixedCount > 0) {
        const detailsList = fixedDetails.slice(0, 5).map(d => 
          `• ${d.invoice_number}: ₹${d.old_rejection} → ₹${d.new_rejection} (diff: ₹${d.difference})`
        ).join('\n');
        
        toast.success(
          `Fixed ${fixedCount} invoices!\n\n${detailsList}${fixedDetails.length > 5 ? `\n... and ${fixedDetails.length - 5} more` : ''}`,
          { duration: 10000 }
        );
      } else {
        toast.info('No invoices with incorrect rejection data found.', { duration: 4000 });
      }
      
      loadInvoices(); // Refresh invoices
    } catch (error) {
      console.error('Failed to fix invoice rejection data:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsFixingRejectionData(false);
    }
  };

  // Diagnose CN-Invoice sync issues
  const diagnoseCNSyncIssues = async () => {
    setIsDiagnosingCNSync(true);
    setCnSyncDiagnostics(null);
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-credit-notes/diagnose-sync-issues${params}`);
      
      const data = response.data;
      setCnSyncDiagnostics(data);
      
      if (data.summary.total_mismatches === 0) {
        toast.success('No sync issues found! All credit notes and invoices are properly linked.', { duration: 4000 });
      } else {
        toast.warning(`Found ${data.summary.total_mismatches} sync issues. Review and click "Fix Sync Issues" to repair.`, { duration: 6000 });
      }
    } catch (error) {
      console.error('Failed to diagnose CN sync issues:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsDiagnosingCNSync(false);
    }
  };

  // Fix CN-Invoice sync issues
  const fixCNSyncIssues = async (dryRun = false) => {
    const retailerFilter = selectedRetailer ? `for ${retailers.find(r => r.id === selectedRetailer)?.company_name || 'selected retailer'}` : 'for ALL retailers';
    
    if (!dryRun && !window.confirm(
      `This will fix CN-Invoice sync issues ${retailerFilter}.\n\n` +
      `Invoices will be updated to include credit note adjustments that are currently missing.\n\n` +
      `This ensures that if a Credit Note says it's adjusted against an invoice, ` +
      `the invoice will also show the Credit Note in its adjustments.\n\n` +
      `Continue?`
    )) return;
    
    setIsFixingCNSync(true);
    try {
      const response = await api.post('/api/retailer-credit-notes/fix-sync-issues', {
        retailer_id: selectedRetailer || null,
        dry_run: dryRun
      });
      
      const data = response.data;
      const fixedCount = data.summary.invoices_fixed || 0;
      const fixedDetails = data.fixed_details || [];
      
      if (dryRun) {
        if (fixedCount > 0) {
          const detailsList = fixedDetails.slice(0, 5).map(d => 
            `• ${d.invoice_number}: Missing ${d.missing_cn_count} CNs (${d.missing_cns.join(', ')}) = ₹${d.missing_amount}`
          ).join('\n');
          
          toast.info(
            `Dry run: Would fix ${fixedCount} invoices\n\n${detailsList}${fixedDetails.length > 5 ? `\n... and ${fixedDetails.length - 5} more` : ''}`,
            { duration: 10000 }
          );
          setCnSyncDiagnostics(prev => ({ ...prev, dryRunDetails: fixedDetails }));
        } else {
          toast.info('Dry run: No invoices need fixing.', { duration: 4000 });
        }
      } else {
        if (fixedCount > 0) {
          const detailsList = fixedDetails.slice(0, 5).map(d => 
            `• ${d.invoice_number}: Added ${d.missing_cn_count} CNs, CN Adjusted: ₹${d.old_total_credit_adjusted} → ₹${d.new_total_credit_adjusted}`
          ).join('\n');
          
          toast.success(
            `Fixed ${fixedCount} invoices!\n\n${detailsList}${fixedDetails.length > 5 ? `\n... and ${fixedDetails.length - 5} more` : ''}`,
            { duration: 10000 }
          );
          
          // Refresh data
          loadInvoices();
          loadCreditNotes();
          setCnSyncDiagnostics(null);
        } else {
          toast.info('No invoices needed fixing.', { duration: 4000 });
        }
      }
    } catch (error) {
      console.error('Failed to fix CN sync issues:', error);
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setIsFixingCNSync(false);
    }
  };

  // Open edit credit note modal
  const openEditCreditNoteModal = (creditNote) => {
    setEditingCreditNote(creditNote);
    setEditCreditNoteForm({
      amount: creditNote.amount || '',
      remarks: creditNote.remarks || ''
    });
    setShowEditCreditNoteModal(true);
  };

  // Update credit note
  const updateCreditNote = async (e) => {
    e.preventDefault();
    if (!editingCreditNote) return;
    
    try {
      await api.put(`/api/retailer-credit-notes/${editingCreditNote.id}`, {
        amount: parseFloat(editCreditNoteForm.amount),
        remarks: editCreditNoteForm.remarks
      });
      toast.success('Credit note updated successfully');
      setShowEditCreditNoteModal(false);
      setEditingCreditNote(null);
      loadCreditNotes();
    } catch (error) {
      console.error('Failed to update credit note:', error);
      toast.error(error.response?.data?.detail || 'Failed to update credit note');
    }
  };

  // Load pending credit notes for a retailer (used in payment modal)
  const loadPendingCreditNotesForPayment = async (retailerId) => {
    if (!retailerId) {
      setPendingCreditNotesForPayment([]);
      return;
    }
    setLoadingPendingCredits(true);
    try {
      const response = await api.get(`/api/retailer-credit-notes/pending/${retailerId}`);
      setPendingCreditNotesForPayment(response.data.credit_notes || []);
    } catch (error) {
      console.error('Failed to load pending credit notes:', error);
      setPendingCreditNotesForPayment([]);
    } finally {
      setLoadingPendingCredits(false);
    }
  };

  const loadPayments = useCallback(async () => {
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/retailer-payments${params}`);
      setPayments(response.data);
    } catch (error) {
      console.error('Failed to load payments:', error);
    }
  }, [selectedRetailer]);

  // Load immediately payable data (5-day credit period)
  const loadImmediatelyPayable = useCallback(async () => {
    setLoadingImmediatelyPayable(true);
    try {
      const params = selectedRetailer ? `?retailer_id=${selectedRetailer}` : '';
      const response = await api.get(`/api/admin/all-retailers-immediately-payable${params}`);
      setImmediatelyPayable(response.data);
    } catch (error) {
      console.error('Failed to load immediately payable:', error);
    } finally {
      setLoadingImmediatelyPayable(false);
    }
  }, [selectedRetailer]);

  // Load admin/staff users for "Received By" dropdown
  const loadStaffUsers = useCallback(async () => {
    try {
      const response = await api.get('/api/users');
      // Filter only admin and staff users
      const adminStaff = response.data.filter(u => u.role === 'admin' || u.role === 'staff');
      setStaffUsers(adminStaff);
    } catch (error) {
      console.error('Failed to load staff users:', error);
    }
  }, []);

  // Get current logged-in user from localStorage
  const getCurrentUserId = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.id || user.user_id;
      }
    } catch (e) {
      console.error('Failed to get current user:', e);
    }
    return '';
  };

  const getCurrentUserName = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.name || user.email;
      }
    } catch (e) {
      console.error('Failed to get current user name:', e);
    }
    return '';
  };

  const getCurrentUserRole = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.role || 'staff';
      }
    } catch (e) {
      console.error('Failed to get current user role:', e);
    }
    return 'staff';
  };

  // Check if invoice can be edited/deleted based on date, user role, and retailer payment model
  // For 100% upfront retailers: Same-day invoices editable by staff/admin, older invoices only by admin
  // For other retailers: Always editable by staff/admin (no date restriction)
  const canEditDeleteInvoice = (invoice) => {
    const userRole = getCurrentUserRole();
    
    // Admin can always edit/delete any invoice
    if (userRole === 'admin') return true;
    
    // Non-admin users (staff, etc.) can only edit/delete TODAY's invoices (IST timezone)
    const todayIST = getISTDate(); // Uses IST timezone, not system timezone
    const invoiceDate = invoice.invoice_date?.split('T')[0] || '';
    return invoiceDate === todayIST;
  };

  // Load Payment Ledger Data
  const loadPaymentLedger = async (retailerId, startDate, endDate) => {
    if (!retailerId) {
      toast.error('Please select a retailer first');
      return;
    }
    setPaymentLedgerLoading(true);
    try {
      let url = `/api/retailer-payment-ledger?retailer_id=${retailerId}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      const response = await api.get(url);
      setPaymentLedgerData(response.data);
    } catch (error) {
      console.error('Failed to load payment ledger:', error);
      toast.error('Failed to load payment ledger');
    } finally {
      setPaymentLedgerLoading(false);
    }
  };

  // Load Final Summary Data (detailed reconciliation view)
  const loadFinalSummary = async (retailerId, startDate, endDate) => {
    setFinalSummaryLoading(true);
    try {
      let url = `/api/retailer-invoices/final-summary?start_date=${startDate}&end_date=${endDate}`;
      if (retailerId) url += `&retailer_id=${retailerId}`;
      const response = await api.get(url);
      setFinalSummaryData(response.data);
      setShowFinalSummaryModal(true);
    } catch (error) {
      console.error('Failed to load final summary:', error);
      toast.error('Failed to load final summary');
    } finally {
      setFinalSummaryLoading(false);
    }
  };

  // Open Payment Ledger Modal
  const openPaymentLedgerModal = () => {
    if (!selectedRetailer) {
      toast.error('Please select a retailer first');
      return;
    }
    // Set default date range to last 60 days
    const today = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);
    setLedgerStartDate(sixtyDaysAgo.toISOString().split('T')[0]);
    setLedgerEndDate(today.toISOString().split('T')[0]);
    setExpandedLedgerDates({});
    setShowPaymentLedgerModal(true);
    loadPaymentLedger(selectedRetailer, sixtyDaysAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]);
  };

  // Check if user can edit MRP for a given date (only admin can edit past dates)
  const canEditMrpForDate = (date) => {
    const todayIST = getISTDate();
    const userRole = getCurrentUserRole();
    if (date < todayIST) {
      return userRole === 'admin';
    }
    return true; // Anyone can edit today's or future dates
  };

  // Load closing inventory for admin management
  const loadClosingInventory = useCallback(async () => {
    if (!closingInventoryRetailer || !closingInventoryDate) {
      setClosingInventoryData([]);
      setClosingHasData(true);
      return;
    }
    try {
      const res = await api.get(`/api/retailer-closing-inventory/summary/${closingInventoryRetailer}?date=${closingInventoryDate}`);
      const items = res.data.items || [];
      
      // Check if there's actual closing data - use the flag if available, otherwise check items
      const hasAnyClosingRecorded = items.some(item => item.closing_qty !== null && item.closing_qty !== undefined);
      const hasClosingData = res.data.has_closing_data !== undefined 
        ? res.data.has_closing_data 
        : hasAnyClosingRecorded;
      
      console.log('Closing inventory loaded:', { 
        date: closingInventoryDate, 
        totalItems: items.length, 
        hasClosingData, 
        itemsWithClosing: items.filter(i => i.closing_qty != null).length 
      });
      
      setClosingInventoryData(items);
      setClosingHasData(hasClosingData);
      
      // Reset admin entering mode
      setAdminEnteringClosing(false);
      setAdminClosingInputs({});
      
    } catch (error) {
      console.error('Failed to load closing inventory:', error);
      setClosingInventoryData([]);
      setClosingHasData(false);
    }
  }, [closingInventoryRetailer, closingInventoryDate]);

  // Load last supply items for a retailer (for new closing entry)
  const loadLastSupplyItems = useCallback(async (retailerId) => {
    if (!retailerId) {
      setLastSupplyItems([]);
      setClosingEntryItems([]);
      setLastSupplyDate(null);
      return;
    }
    try {
      const res = await api.get(`/api/retailer-closing-inventory/last-supply/${retailerId}`);
      const items = res.data.items || [];
      setLastSupplyItems(items);
      setLastSupplyDate(res.data.last_dispatch_date);
      
      // Pre-populate closing entry items with last supply items
      setClosingEntryItems(items.map(item => ({
        ...item,
        closing_qty: ''
      })));
      
    } catch (error) {
      console.error('Failed to load last supply items:', error);
      setLastSupplyItems([]);
      setClosingEntryItems([]);
      setLastSupplyDate(null);
    }
  }, []);

  // Start new closing entry mode
  const startClosingEntry = async () => {
    if (!closingInventoryRetailer) {
      toast.error('Please select a retailer first');
      return;
    }
    
    // Load retailer-specific catalogue and parse variants
    try {
      const catalogueRes = await api.get(`/api/retailer-catalogue?retailer_id=${closingInventoryRetailer}`);
      const parsedCatalogue = (catalogueRes.data || []).map(item => {
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
      setClosingRetailerCatalogue(parsedCatalogue);
    } catch (error) {
      console.error('Failed to load retailer catalogue:', error);
      setClosingRetailerCatalogue([]);
    }
    
    await loadLastSupplyItems(closingInventoryRetailer);
    setClosingEntryMode(true);
  };

  // Add product to closing entry list
  const addProductToClosingEntry = (product, variant) => {
    // Check if already in list
    const exists = closingEntryItems.some(
      item => item.product_id === product.id && item.variant_name === variant.name
    );
    if (exists) {
      toast.error('Product with this variant already in list');
      return;
    }
    
    setClosingEntryItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      variant_id: variant.id || '',
      variant_name: variant.name || 'Kg',
      closing_qty: ''
    }]);
    setShowAddProductModal(false);
    setProductSearchTerm('');
  };

  // Remove product from closing entry list
  const removeFromClosingEntry = (index) => {
    setClosingEntryItems(prev => prev.filter((_, i) => i !== index));
  };

  // Update closing qty in entry mode
  const updateClosingEntryQty = (index, value) => {
    setClosingEntryItems(prev => prev.map((item, i) => 
      i === index ? { ...item, closing_qty: value } : item
    ));
  };

  // Save closing entry
  const saveClosingEntry = async () => {
    // Filter items with actual closing qty entered
    const itemsToSave = closingEntryItems.filter(item => 
      item.closing_qty !== '' && item.closing_qty !== null && item.closing_qty !== undefined
    );
    
    if (itemsToSave.length === 0) {
      toast.error('Please enter closing quantity for at least one item');
      return;
    }
    
    try {
      await api.post('/api/retailer-closing-inventory/bulk', {
        retailer_id: closingInventoryRetailer,
        closing_date: closingInventoryDate,
        items: itemsToSave.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: item.variant_id,
          variant_name: item.variant_name,
          closing_qty: parseFloat(item.closing_qty) || 0
        }))
      });
      
      toast.success(`Saved closing inventory for ${itemsToSave.length} items`);
      setClosingEntryMode(false);
      setClosingEntryItems([]);
      loadClosingInventory();
      
    } catch (error) {
      console.error('Failed to save closing inventory:', error);
      toast.error('Failed to save closing inventory');
    }
  };

  // Cancel closing entry mode
  const cancelClosingEntry = () => {
    setClosingEntryMode(false);
    setClosingEntryItems([]);
    setShowAddProductModal(false);
    setProductSearchTerm('');
  };

  // Admin: Update closing inventory item
  const updateClosingItem = async (itemId, newQty, newVariantName = null) => {
    try {
      const updateData = {
        closing_qty: parseFloat(newQty)
      };
      if (newVariantName) {
        updateData.variant_name = newVariantName;
      }
      await api.put(`/api/retailer-closing-inventory/item/${itemId}`, updateData);
      toast.success('Item updated successfully');
      setEditingClosingItem(null);
      setEditingClosingQty('');
      setEditingClosingVariant('');
      setVariantSearchTerm('');
      loadClosingInventory();
    } catch (error) {
      toast.error('Failed to update item');
    }
  };

  // Admin: Delete closing inventory item - with dispatch linkage check
  const adminDeleteClosingItem = async (item) => {
    const { id: itemId, product_name, received_qty, linked_dispatches, opening_qty } = item;
    
    // Check if item is linked to any dispatch
    const hasDispatchLinkage = (received_qty > 0) || (linked_dispatches && linked_dispatches.length > 0);
    
    if (hasDispatchLinkage) {
      // Show dispatch info modal instead of deleting
      const dispatchDates = linked_dispatches?.map(d => d.dispatch_date) || [];
      const uniqueDates = [...new Set(dispatchDates)];
      setDispatchLinkedItemInfo({
        product_name,
        variant_name: item.variant_name,
        linked_dispatches: linked_dispatches || [],
        opening_qty: opening_qty || 0,
        received_qty: received_qty || 0,
        dispatch_dates: uniqueDates
      });
      return; // Don't delete - show info instead
    }
    
    // Check if item only has opening_qty (from previous closing, not dispatch)
    if (!itemId) {
      toast.error('This item has no database record to delete. It may be derived from previous day closing.');
      return;
    }
    
    // Not linked to dispatch - proceed with delete confirmation
    if (!window.confirm(`Delete closing entry for "${product_name}"?`)) return;
    
    try {
      await api.delete(`/api/retailer-closing-inventory/item/${itemId}`);
      toast.success('Item deleted successfully');
      loadClosingInventory();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete item');
    }
  };
  
  // Admin: Save closing inventory entries for a date that has no closing data
  const handleAdminSaveClosing = async () => {
    if (!closingInventoryRetailer || !closingInventoryDate) {
      toast.error('Please select a retailer and date');
      return;
    }
    
    // Filter items that have closing qty entered
    const itemsToSave = closingInventoryData
      .filter(item => {
        const inputValue = adminClosingInputs[item.product_id];
        return inputValue !== undefined && inputValue !== '' && !isNaN(parseFloat(inputValue));
      })
      .map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id || null,
        variant_name: item.variant_name || 'Kg',
        closing_qty: parseFloat(adminClosingInputs[item.product_id])
      }));
    
    if (itemsToSave.length === 0) {
      toast.error('Please enter closing quantities for at least one item');
      return;
    }
    
    try {
      await api.post('/api/retailer-closing-inventory/bulk', {
        retailer_id: closingInventoryRetailer,
        closing_date: closingInventoryDate,
        items: itemsToSave
      });
      
      toast.success(`Saved closing inventory for ${itemsToSave.length} items`);
      setAdminEnteringClosing(false);
      setAdminClosingInputs({});
      loadClosingInventory();
    } catch (error) {
      console.error('Failed to save closing:', error);
      toast.error('Failed to save closing inventory');
    }
  };

  // ==================== NEW STOCK CLOSING MATRIX FUNCTIONS ====================
  
  // Computed: Categories from stock closing catalogue
  const stockClosingCategories = useMemo(() => {
    return [...new Set(stockClosingCatalogue.map(c => c.category || 'Uncategorized'))].sort();
  }, [stockClosingCatalogue]);
  
  // Computed: Catalogue grouped by category WITH search filter
  const stockClosingCatalogueByCategory = useMemo(() => {
    const searchLower = stockClosingSearchTerm.toLowerCase().trim();
    const grouped = {};
    
    stockClosingCatalogue.forEach(item => {
      // Apply search filter
      if (searchLower) {
        const matchesName = (item.product_name || '').toLowerCase().includes(searchLower);
        const matchesNameHi = (item.product_name_hi || '').toLowerCase().includes(searchLower);
        const matchesNameMr = (item.product_name_mr || '').toLowerCase().includes(searchLower);
        if (!matchesName && !matchesNameHi && !matchesNameMr) {
          return; // Skip this item
        }
      }
      
      const cat = item.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return grouped;
  }, [stockClosingCatalogue, stockClosingSearchTerm]);
  
  // Filtered categories (only those with matching products)
  const filteredStockClosingCategories = useMemo(() => {
    return stockClosingCategories.filter(cat => 
      stockClosingCatalogueByCategory[cat] && stockClosingCatalogueByCategory[cat].length > 0
    );
  }, [stockClosingCategories, stockClosingCatalogueByCategory]);
  
  // Get variant display name from packagings
  const getStockClosingVariantName = useCallback((variantId) => {
    if (!variantId) return '';
    if (variantId === 'unit_piece') return 'Pieces';
    if (variantId === 'unit_packet') return 'Packets';
    if (variantId.startsWith('unit_')) {
      const unitName = variantId.replace('unit_', '');
      return unitName.charAt(0).toUpperCase() + unitName.slice(1);
    }
    // Find from packagings
    const pkg = packagings.find(p => p.id === variantId);
    return pkg ? pkg.name : variantId.substring(0, 8) + '...';
  }, [packagings]);
  
  // Load stock closing data for selected retailer and date
  const loadStockClosingData = useCallback(async () => {
    if (!closingInventoryRetailer) {
      toast.error('Please select a retailer first');
      return;
    }
    
    try {
      // Load retailer catalogue and parse variants
      const catalogueRes = await api.get(`/api/retailer-catalogue?retailer_id=${closingInventoryRetailer}`);
      const parsedCatalogue = (catalogueRes.data || []).map(item => {
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
        return {
          ...item,
          variants: parsedVariants
        };
      });
      setStockClosingCatalogue(parsedCatalogue);
      
      // Auto-expand first category
      const categories = [...new Set(parsedCatalogue.map(c => c.category || 'Uncategorized'))];
      if (categories.length > 0) {
        setStockClosingExpandedCats({ [categories[0]]: true });
      }
      
      // Load existing closing data for this date
      try {
        const closingRes = await api.get(`/api/retailer-closing-inventory/summary/${closingInventoryRetailer}?date=${closingInventoryDate}`);
        
        // Build opening data from yesterday's closing
        const openingMap = {};
        const closingMap = {};
        
        // API returns { items: [...], closing_date: ..., has_closing_data: ... }
        const items = closingRes.data?.items || closingRes.data || [];
        
        items.forEach(item => {
          // Create key matching our format
          const key = `${item.product_id}_${item.variant_id || 'default'}`;
          openingMap[key] = item.opening_qty || 0;
          if (item.closing_qty !== null && item.closing_qty !== undefined) {
            closingMap[key] = item.closing_qty.toString();
          }
        });
        
        setStockClosingOpeningData(openingMap);
        setStockClosingData(closingMap);
        setStockClosingHasChanges(false);
      } catch (error) {
        console.error('Failed to load closing data:', error);
        setStockClosingOpeningData({});
        setStockClosingData({});
      }
      
    } catch (error) {
      console.error('Failed to load stock closing data:', error);
      toast.error('Failed to load catalogue');
    }
  }, [closingInventoryRetailer, closingInventoryDate]);
  
  // Load today's closing summary for all retailers
  const loadTodayClosingSummary = useCallback(async () => {
    setTodayClosingSummaryLoading(true);
    try {
      const res = await api.get('/api/retailer-closing-inventory/today-summary');
      setTodayClosingSummary(res.data?.retailers || []);
    } catch (error) {
      console.error('Failed to load today\'s closing summary:', error);
      setTodayClosingSummary([]);
    } finally {
      setTodayClosingSummaryLoading(false);
    }
  }, []);
  
  // Load today's closing summary when tab is active
  useEffect(() => {
    if (activeTab === 'closingInventory') {
      loadTodayClosingSummary();
    }
  }, [activeTab, loadTodayClosingSummary]);
  
  // Save stock closing data
  const saveStockClosing = async () => {
    if (!closingInventoryRetailer) {
      toast.error('Please select a retailer');
      return;
    }
    
    // Build items to save
    const itemsToSave = [];
    Object.entries(stockClosingData).forEach(([key, value]) => {
      if (value !== '' && value !== null) {
        const [productId, variantId] = key.split('_');
        const catalogueItem = stockClosingCatalogue.find(c => c.product_id === productId);
        const variantName = getStockClosingVariantName(variantId);
        
        itemsToSave.push({
          product_id: productId,
          product_name: catalogueItem?.product_name || 'Unknown',
          variant_id: variantId === 'default' ? null : variantId,
          variant_name: variantName,
          closing_qty: parseFloat(value) || 0
        });
      }
    });
    
    if (itemsToSave.length === 0) {
      toast.error('No closing data to save');
      return;
    }
    
    setStockClosingSaving(true);
    try {
      await api.post('/api/retailer-closing-inventory/record', {
        retailer_id: closingInventoryRetailer,
        closing_date: closingInventoryDate,
        items: itemsToSave
      });
      
      toast.success(`Saved closing for ${itemsToSave.length} items`);
      setStockClosingHasChanges(false);
      
      // Reload data to refresh
      loadStockClosingData();
    } catch (error) {
      console.error('Failed to save stock closing:', error);
      toast.error('Failed to save closing data');
    } finally {
      setStockClosingSaving(false);
    }
  };

  // Load unpaid invoices for selected retailer
  const loadUnpaidInvoices = async (retailerId = null) => {
    const targetRetailerId = retailerId || closingInventoryRetailer;
    if (!targetRetailerId) {
      toast.error('Please select a retailer first');
      return;
    }
    
    setPaymentSummaryLoading(true);
    try {
      const response = await api.get(`/api/retailer-invoices?retailer_id=${targetRetailerId}`);
      // Filter unpaid invoices (status not 'paid')
      const unpaid = response.data.filter(inv => inv.status !== 'paid');
      setUnpaidInvoices(unpaid);
      setSelectedInvoicesForSummary({});
      setShowPaymentSummaryModal(true);
    } catch (error) {
      console.error('Failed to load invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setPaymentSummaryLoading(false);
    }
  };

  // Toggle invoice selection for summary
  const toggleInvoiceForSummary = (invoiceId) => {
    setSelectedInvoicesForSummary(prev => ({
      ...prev,
      [invoiceId]: !prev[invoiceId]
    }));
  };

  // Select all unpaid invoices
  const selectAllInvoicesForSummary = () => {
    const allSelected = {};
    unpaidInvoices.forEach(inv => {
      allSelected[inv.id] = true;
    });
    setSelectedInvoicesForSummary(allSelected);
  };

  // Get selected invoices data for summary
  const getSelectedInvoicesData = () => {
    // Helper function to format date as DD-MM-YYYY
    const formatDate = (dateStr) => {
      if (!dateStr) return '-';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '-';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };
    
    // Check if selected retailer is 100% upfront
    const selectedRetailerData = retailers.find(r => r.id === selectedRetailer);
    const isUpfront100Retailer = selectedRetailerData?.upfront_collection_percentage === 100;
    
    return unpaidInvoices
      .filter(inv => selectedInvoicesForSummary[inv.id])
      .map((inv, idx) => {
        // For 100% upfront: amountPayable = gross - commission (no rejection deduction)
        // For others: use stored net_payable
        const grossValue = inv.gross_value || inv.total_mrp_value || 0;
        const commissionPct = inv.commission_percentage || 0;
        const amountPayable = isUpfront100Retailer 
          ? (grossValue - (grossValue * commissionPct / 100))
          : (inv.net_payable || 0);
        
        const paidAmount = inv.paid_amount || 0;
        const creditNotesAdjusted = inv.total_credit_adjusted || 0;
        
        return {
          serialNum: idx + 1,
          indentDate: formatDate(inv.indent_date || inv.invoice_date),
          dispatchDate: formatDate(inv.dispatch_date || inv.invoice_date),
          invoiceNumber: inv.invoice_number,
          grossValue: grossValue,
          // For 100% upfront, rejections are handled via CN, so don't show in this flow
          rejections: isUpfront100Retailer ? 0 : (inv.rejection_amount || 0),
          totalMrpValue: isUpfront100Retailer ? grossValue : (inv.total_mrp_value || 0),
          commission: isUpfront100Retailer ? (grossValue * commissionPct / 100) : (inv.commission_amount || 0),
          amountPayable: amountPayable,
          creditNotes: creditNotesAdjusted,
          paidAmount: paidAmount,
          netReceivable: amountPayable - creditNotesAdjusted - paidAmount,
          isUpfront100: isUpfront100Retailer
        };
      });
  };

  // Export payment summary to CSV
  const exportPaymentSummary = () => {
    const data = getSelectedInvoicesData();
    if (data.length === 0) {
      toast.error('Please select at least one invoice');
      return;
    }
    
    // Check if 100% upfront (use first item since all are from same retailer)
    const isUpfront100 = data[0]?.isUpfront100 || false;
    
    // Headers differ based on retailer type - no rejections for 100% upfront
    const headers = isUpfront100 
      ? ['S.No', 'Indent Date', 'Dispatch Date', 'Invoice Number', 'Gross Value', 'Commission', 'Amount Payable', 'CN Adjusted', 'Paid Amount', 'Net Receivable']
      : ['S.No', 'Indent Date', 'Dispatch Date', 'Invoice Number', 'Gross Value', 'Rejections', 'Total MRP Value', 'Commission', 'Amount Payable', 'Credit Notes', 'Paid Amount', 'Net Receivable'];
    
    const rows = data.map(d => {
      if (isUpfront100) {
        return [
          d.serialNum,
          d.indentDate,
          d.dispatchDate,
          d.invoiceNumber,
          d.grossValue.toFixed(2),
          (-d.commission).toFixed(2),
          d.amountPayable.toFixed(2),
          d.creditNotes > 0 ? (-d.creditNotes).toFixed(2) : '0.00',
          d.paidAmount.toFixed(2),
          d.netReceivable.toFixed(2)
        ];
      } else {
        return [
          d.serialNum,
          d.indentDate,
          d.dispatchDate,
          d.invoiceNumber,
          d.grossValue.toFixed(2),
          (-d.rejections).toFixed(2),
          d.totalMrpValue.toFixed(2),
          (-d.commission).toFixed(2),
          d.amountPayable.toFixed(2),
          (-d.creditNotes).toFixed(2),
          d.paidAmount.toFixed(2),
          d.netReceivable.toFixed(2)
        ];
      }
    });
    
    // Add totals row
    const totals = data.reduce((acc, d) => ({
      grossValue: acc.grossValue + d.grossValue,
      rejections: acc.rejections + d.rejections,
      totalMrpValue: acc.totalMrpValue + d.totalMrpValue,
      commission: acc.commission + d.commission,
      amountPayable: acc.amountPayable + d.amountPayable,
      creditNotes: acc.creditNotes + d.creditNotes,
      paidAmount: acc.paidAmount + d.paidAmount,
      netReceivable: acc.netReceivable + d.netReceivable
    }), { grossValue: 0, rejections: 0, totalMrpValue: 0, commission: 0, amountPayable: 0, creditNotes: 0, paidAmount: 0, netReceivable: 0 });
    
    if (isUpfront100) {
      rows.push(['', '', '', 'TOTAL', totals.grossValue.toFixed(2), (-totals.commission).toFixed(2), totals.amountPayable.toFixed(2), totals.creditNotes > 0 ? (-totals.creditNotes).toFixed(2) : '0.00', totals.paidAmount.toFixed(2), totals.netReceivable.toFixed(2)]);
    } else {
      rows.push(['', '', '', 'TOTAL', totals.grossValue.toFixed(2), (-totals.rejections).toFixed(2), totals.totalMrpValue.toFixed(2), (-totals.commission).toFixed(2), totals.amountPayable.toFixed(2), (-totals.creditNotes).toFixed(2), totals.paidAmount.toFixed(2), totals.netReceivable.toFixed(2)]);
    }
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const retailerName = retailers.find(r => r.id === closingInventoryRetailer)?.company_name || 'Retailer';
    link.setAttribute('download', `Payment_Summary_${retailerName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success('Payment summary exported');
  };

  // Payment Audit - Load all payments for a retailer
  const loadPaymentAudit = async (retailerId) => {
    if (!retailerId) {
      toast.error('Please select a retailer');
      return;
    }
    
    setPaymentAuditLoading(true);
    try {
      const response = await api.get(`/api/retailer-payments/detailed/${retailerId}`);
      setPaymentAuditData(response.data);
      setShowPaymentAuditModal(true);
    } catch (error) {
      console.error('Failed to load payment audit:', error);
      toast.error('Failed to load payment data');
    } finally {
      setPaymentAuditLoading(false);
    }
  };

  // Payment Audit - Delete a specific payment
  const deletePaymentFromAudit = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment? This action cannot be undone.')) {
      return;
    }
    
    setDeletingPaymentId(paymentId);
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      // Reload the audit data
      if (paymentAuditRetailerId) {
        await loadPaymentAudit(paymentAuditRetailerId);
      }
      // Also reload main payments data
      await loadPayments();
    } catch (error) {
      console.error('Failed to delete payment:', error);
      toast.error('Failed to delete payment');
    } finally {
      setDeletingPaymentId(null);
    }
  };

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
    
    // First try by product_id (supports both snake_case and camelCase)
    const productId = item.product_id || item.productId;
    if (productId) {
      product = productMap.get(productId);
    }
    
    // Then try by name match (supports both snake_case and camelCase)
    if (!product) {
      const itemName = item.product_name || item.productName || item.name;
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
    
    // Fallback to stored product_name (supports both formats)
    return item.product_name || item.productName || item.name || '';
  }, [productMap, i18n.language]);

  // Helper to get product name in a specific language
  const getProductNameInLang = useCallback((item, lang) => {
    if (!item) return '';
    
    // Try to find the product in our lookup map
    let product = null;
    const productId = item.product_id || item.productId;
    if (productId) {
      product = productMap.get(productId);
    }
    if (!product) {
      const itemName = item.product_name || item.productName || item.name;
      if (itemName) {
        product = productMap.get(itemName);
      }
    }
    
    // Return translated name based on specified language
    if (product) {
      if (lang === 'hi' && product.name_hi) return product.name_hi;
      if (lang === 'mr' && product.name_mr) return product.name_mr;
      return product.name;
    }
    
    // Fallback: check item's own translations
    if (lang === 'hi' && (item.name_hi || item.productNameHi)) return item.name_hi || item.productNameHi;
    if (lang === 'mr' && (item.name_mr || item.productNameMr)) return item.name_mr || item.productNameMr;
    
    return item.product_name || item.productName || item.name || '';
  }, [productMap]);

  // Helper to get storage type for a product/item
  const getProductStorageType = useCallback((item) => {
    if (!item) return 'Outdoor';
    
    const productId = item.product_id || item.productId;
    let product = null;
    
    if (productId) {
      product = productMap.get(productId);
    }
    if (!product) {
      const itemName = item.product_name || item.productName || item.name;
      if (itemName) {
        product = productMap.get(itemName);
      }
    }
    
    return product?.storage_type || 'Outdoor';
  }, [productMap]);

  // Helper to get enhanced variant display for indent items
  // Shows Customer Display Variant, with weight appended for Pieces/Packets
  // Also handles case where variant_name might be a UUID (packaging ID)
  const getIndentVariantDisplay = useCallback((item) => {
    if (!item) return '-';
    
    let variantName = item.variant_name || '-';
    
    // Check if variant_name looks like a UUID (packaging ID) and needs to be resolved
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(variantName)) {
      // Look up the actual packaging name
      const packaging = packagings.find(p => p.id === variantName);
      if (packaging) {
        variantName = packaging.name || variantName;
      }
    }
    
    // If variant is "Pieces" or "Packets", look up catalogue to get weight info
    if (variantName.toLowerCase() === 'pieces' || variantName.toLowerCase() === 'packets') {
      const productId = item.product_id || item.productId;
      
      // Find the product in retailer catalogue to get purchase weights
      const catalogueEntry = retailerCatalogue.find(c => 
        c.product_id === productId || 
        (c.product_name && item.product_name && c.product_name.toLowerCase() === item.product_name.toLowerCase())
      );
      
      if (catalogueEntry) {
        // Check both field names: purchase_weights (array) or purchase_weight_variant (single)
        const purchaseWeights = catalogueEntry.purchase_weights || [];
        const purchaseWeightVariant = catalogueEntry.purchase_weight_variant;
        
        let weightName = '';
        
        // First try purchase_weights array
        if (purchaseWeights.length > 0) {
          const weightInfo = packagings.find(p => purchaseWeights.includes(p.id));
          weightName = weightInfo?.name || '';
        }
        // Then try purchase_weight_variant (single)
        else if (purchaseWeightVariant) {
          const weightInfo = packagings.find(p => p.id === purchaseWeightVariant);
          weightName = weightInfo?.name || '';
        }
        
        if (weightName) {
          return `${variantName} (${weightName})`;
        }
      }
    }
    
    // Return resolved variant name for other cases
    return variantName;
  }, [retailerCatalogue, packagings]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await loadBaseData();
      // Load only essential data initially (Indents tab is default)
      await Promise.all([loadIndents(), loadDispatches(), loadStaffUsers(), loadImmediatelyPayable()]);
      setLoading(false);
      // Load other data in background (non-blocking)
      loadInvoices();
      loadRejections();
      loadPayments();
      loadCreditNotes();
    };
    loadAll();
  }, [loadBaseData, loadIndents, loadDispatches, loadInvoices, loadRejections, loadPayments, loadStaffUsers, loadImmediatelyPayable, loadCreditNotes]);

  // Filter indents by date
  useEffect(() => {
    if (!indentDateFilter) {
      setFilteredIndents(indents);
    } else {
      const filtered = indents.filter(indent => {
        const indentDate = indent.indent_date?.split('T')[0];
        return indentDate === indentDateFilter;
      });
      setFilteredIndents(filtered);
    }
  }, [indents, indentDateFilter]);

  // Load dispatches for all visible indents (for showing dispatch status in indent table)
  const loadDispatchesForIndents = useCallback(async () => {
    if (filteredIndents.length === 0) return;
    
    try {
      // Get all indent IDs from filtered indents
      const indentIds = filteredIndents.map(i => i.id).filter(Boolean);
      if (indentIds.length === 0) return;
      
      // Load dispatches for these indents (no date filter)
      const response = await api.get('/api/retailer-dispatches');
      const allDispatches = response.data || [];
      
      // Filter to only dispatches for our indents
      const relevantDispatches = allDispatches.filter(d => indentIds.includes(d.indent_id));
      
      // Merge with existing dispatches (avoid duplicates)
      setDispatches(prev => {
        const existingIds = new Set(prev.map(d => d.id));
        const newDispatches = relevantDispatches.filter(d => !existingIds.has(d.id));
        return [...prev, ...newDispatches];
      });
    } catch (error) {
      console.error('Failed to load dispatches for indents:', error);
    }
  }, [filteredIndents]);

  // Load dispatches for indents when filtered indents change
  useEffect(() => {
    if (activeTab === 'indents' && filteredIndents.length > 0) {
      loadDispatchesForIndents();
    }
  }, [activeTab, filteredIndents, loadDispatchesForIndents]);

  // Reload indents when date filter changes
  useEffect(() => {
    if (indentDateFilter) {
      loadIndents();
    }
  }, [indentDateFilter, loadIndents]);

  // Filter dispatches by date
  useEffect(() => {
    if (!dispatchDateFilter) {
      setFilteredDispatches(dispatches);
    } else {
      const filtered = dispatches.filter(dispatch => {
        const dispatchDate = dispatch.dispatch_date?.split('T')[0];
        return dispatchDate === dispatchDateFilter;
      });
      setFilteredDispatches(filtered);
    }
  }, [dispatches, dispatchDateFilter]);

  // Reload dispatches when date filter changes
  useEffect(() => {
    if (dispatchDateFilter) {
      loadDispatches();
    }
  }, [dispatchDateFilter, loadDispatches]);

  // Reload immediately payable when selected retailer changes
  useEffect(() => {
    loadImmediatelyPayable();
  }, [selectedRetailer, loadImmediatelyPayable]);

  // Filter rejections by date range, retailer, and product
  useEffect(() => {
    let filtered = [...rejections];
    
    // Filter by date range (From/To)
    if (rejectionDateFrom) {
      filtered = filtered.filter(r => {
        const rejDate = r.rejection_date?.split('T')[0];
        return rejDate >= rejectionDateFrom;
      });
    }
    if (rejectionDateTo) {
      filtered = filtered.filter(r => {
        const rejDate = r.rejection_date?.split('T')[0];
        return rejDate <= rejectionDateTo;
      });
    }
    
    if (rejectionRetailerFilter) {
      filtered = filtered.filter(r => r.retailer_id === rejectionRetailerFilter);
    }
    
    if (rejectionProductFilter) {
      filtered = filtered.filter(r => 
        r.product_name?.toLowerCase().includes(rejectionProductFilter.toLowerCase())
      );
    }
    
    setFilteredRejections(filtered);
  }, [rejections, rejectionDateFrom, rejectionDateTo, rejectionRetailerFilter, rejectionProductFilter]);

  // Load closing inventory when retailer or date changes
  useEffect(() => {
    if (closingInventoryRetailer && closingInventoryDate) {
      loadClosingInventory();
    }
  }, [closingInventoryRetailer, closingInventoryDate, loadClosingInventory]);

  // Calculate dashboard stats whenever data changes
  useEffect(() => {
    const totalMrpValue = dispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);
    // Net Receivable should be based on INVOICES (after rejections and commission)
    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.net_payable || 0), 0);
    
    // Filter payments by date range (same as rejection loss date filter)
    const filteredPayments = payments.filter(p => {
      const payDate = p.payment_date?.split('T')[0];
      return payDate >= rejectionLossDateFrom && payDate <= rejectionLossDateTo;
    });
    const totalPaymentsReceived = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Filter rejections by date range for the Rejection Loss block
    const filteredRejections = rejections.filter(r => {
      const rejDate = r.rejection_date?.split('T')[0];
      return rejDate >= rejectionLossDateFrom && rejDate <= rejectionLossDateTo;
    });
    const totalRejections = filteredRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
    const totalRejectionCogs = filteredRejections.reduce((sum, r) => sum + (r.rejection_cogs || 0), 0);
    const totalRejectionCount = filteredRejections.length;
    const totalRejectionItems = filteredRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
    
    // Net Receivable = Total invoiced amount (this is what retailer owes us)
    // Pending = Invoiced - Payments received
    
    // Calculate quantities for indents and dispatches
    // Filter by selected retailer if one is selected
    const filteredIndentsForStats = selectedRetailer 
      ? indents.filter(i => i.retailer_id === selectedRetailer)
      : indents;
    const filteredDispatchesForStats = selectedRetailer 
      ? dispatches.filter(d => d.retailer_id === selectedRetailer)
      : dispatches;
    
    // Calculate total indent quantity
    const totalIndentQty = filteredIndentsForStats.reduce((sum, indent) => {
      const itemsQty = (indent.items || []).reduce((itemSum, item) => 
        itemSum + (item.quantity || item.indent_qty || 0), 0);
      return sum + itemsQty;
    }, 0);
    
    // Calculate total dispatch quantity and value
    const dispatchStats = filteredDispatchesForStats.reduce((acc, dispatch) => {
      const items = dispatch.items || [];
      items.forEach(item => {
        const qty = item.supplied_qty || item.dispatched_qty || item.quantity || 0;
        const value = qty * (item.mrp || 0);
        acc.qty += qty;
        acc.value += value;
      });
      return acc;
    }, { qty: 0, value: 0 });
    
    // Use filtered invoices/payments if retailer selected
    const filteredInvoicesForStats = selectedRetailer 
      ? invoices.filter(i => i.retailer_id === selectedRetailer)
      : invoices;
    const filteredPaymentsForStats = selectedRetailer
      ? filteredPayments.filter(p => p.retailer_id === selectedRetailer)
      : filteredPayments;
    
    const filteredTotalInvoiced = filteredInvoicesForStats.reduce((sum, inv) => 
      sum + (inv.net_payable || inv.total_amount || 0), 0);
    const filteredTotalPayments = filteredPaymentsForStats.reduce((sum, p) => 
      sum + (p.amount || 0), 0);
    
    setDashboardStats({
      totalIndents: filteredIndentsForStats.length,
      pendingIndents: filteredIndentsForStats.filter(i => i.status === 'pending').length,
      totalIndentQty,
      totalDispatches: filteredDispatchesForStats.length,
      totalDispatchQty: dispatchStats.qty,
      totalMrpValue: dispatchStats.value,
      totalNetReceivable: filteredTotalInvoiced,
      totalInvoiced: filteredTotalInvoiced,
      totalPayments: filteredTotalPayments,
      totalRejections,
      totalRejectionCogs,
      totalRejectionCount,
      totalRejectionItems,
      pendingAmount: filteredTotalInvoiced - filteredTotalPayments,
      // Today's Orders (indents for today, dispatches for today) - using IST timezone
      todayIndentsCount: filteredIndentsForStats.filter(i => i.indent_date?.split('T')[0] === getISTDate()).length,
      todayIndentsQty: filteredIndentsForStats.filter(i => i.indent_date?.split('T')[0] === getISTDate())
        .reduce((sum, indent) => sum + (indent.items || []).reduce((itemSum, item) => itemSum + (item.quantity || item.indent_qty || 0), 0), 0),
      todayDispatchesCount: filteredDispatchesForStats.filter(d => d.dispatch_date?.split('T')[0] === getISTDate()).length,
      todayDispatchesQty: filteredDispatchesForStats.filter(d => d.dispatch_date?.split('T')[0] === getISTDate())
        .reduce((sum, d) => (d.items || []).reduce((itemSum, item) => itemSum + (item.supplied_qty || item.dispatched_qty || item.quantity || 0), sum), 0),
      // Tomorrow's Orders - using IST timezone
      tomorrowIndentsCount: filteredIndentsForStats.filter(i => {
        return i.indent_date?.split('T')[0] === getISTDateWithOffset(1);
      }).length,
      tomorrowIndentsQty: filteredIndentsForStats.filter(i => {
        return i.indent_date?.split('T')[0] === getISTDateWithOffset(1);
      }).reduce((sum, indent) => sum + (indent.items || []).reduce((itemSum, item) => itemSum + (item.quantity || item.indent_qty || 0), 0), 0),
      tomorrowDispatchesCount: filteredDispatchesForStats.filter(d => {
        return d.dispatch_date?.split('T')[0] === getISTDateWithOffset(1);
      }).length,
      tomorrowDispatchesQty: filteredDispatchesForStats.filter(d => {
        return d.dispatch_date?.split('T')[0] === getISTDateWithOffset(1);
      }).reduce((sum, d) => (d.items || []).reduce((itemSum, item) => itemSum + (item.supplied_qty || item.dispatched_qty || item.quantity || 0), sum), 0)
    });
  }, [indents, dispatches, invoices, payments, rejections, rejectionLossDateFrom, rejectionLossDateTo, selectedRetailer]);

  // Compute rejection analytics for the modal
  const rejectionAnalytics = useMemo(() => {
    // Filter rejections by date range
    const filtered = rejections.filter(r => {
      const rejDate = r.rejection_date?.split('T')[0];
      if (!rejDate) return false;
      // Ensure proper date comparison
      return rejDate >= rejectionLossDateFrom && rejDate <= rejectionLossDateTo;
    });
    
    // Build retailer id -> company_name map
    const retailerCompanyMap = {};
    retailers.forEach(r => {
      retailerCompanyMap[r.id] = r.company_name || r.name || 'Unknown';
    });
    
    // Get unique dispatch_ids from rejections to find matching dispatches
    const rejectionDispatchIds = new Set(filtered.map(r => r.dispatch_id).filter(Boolean));
    
    // Build dispatch data using allDispatchesForRejection (loaded for the full date range)
    const productDispatchMap = {};
    const retailerDispatchMap = {};
    
    // Use allDispatchesForRejection instead of dispatches
    const dispatchesForAnalysis = allDispatchesForRejection.length > 0 ? allDispatchesForRejection : dispatches;
    
    dispatchesForAnalysis.forEach(d => {
      const dispDate = d.dispatch_date?.split('T')[0];
      const retailerId = d.retailer_id;
      const shopName = retailerCompanyMap[retailerId] || d.retailer_name || 'Unknown';
      
      // Consider dispatches in rejection date range OR with matching dispatch_id
      const inDateRange = dispDate >= rejectionLossDateFrom && dispDate <= rejectionLossDateTo;
      const hasMatchingId = rejectionDispatchIds.has(d.id);
      
      if (!inDateRange && !hasMatchingId) return;
      
      if (!retailerDispatchMap[shopName]) {
        retailerDispatchMap[shopName] = { qty: 0, value: 0, retailer_id: retailerId };
      }
      
      (d.items || []).forEach(item => {
        const productName = item.product_name || 'Unknown';
        const qty = item.supplied_qty || item.dispatched_qty || item.quantity || item.indent_qty || 0;
        const value = qty * (item.mrp || 0);
        
        if (!productDispatchMap[productName]) {
          productDispatchMap[productName] = { qty: 0, value: 0 };
        }
        productDispatchMap[productName].qty += qty;
        productDispatchMap[productName].value += value;
        
        retailerDispatchMap[shopName].qty += qty;
        retailerDispatchMap[shopName].value += value;
      });
    });
    
    if (filtered.length === 0) {
      return {
        totalValue: 0,
        totalQty: 0,
        totalSuppliedQty: 0,
        totalSuppliedValue: 0,
        overallRejPct: 0,
        overallRejValuePct: 0,
        count: 0,
        byProductCount: [],
        byProductValue: [],
        byRetailer: [],
        byDate: [],
        byDay: [],
        byReason: [],
        avgPerDay: 0,
        maxSingleRejection: null,
        topProductByQty: null,
        topRetailerByValue: null,
        filteredRejections: [],
        retailerCompanyMap,
        productDispatchMap,
        retailerDispatchMap
      };
    }
    
    // Aggregate by product (only products with rejections)
    const productMap = {};
    filtered.forEach(r => {
      const key = r.product_name || 'Unknown';
      if (!productMap[key]) {
        productMap[key] = { name: key, qty: 0, value: 0, count: 0 };
      }
      productMap[key].qty += (r.quantity || 0);
      productMap[key].value += (r.rejection_value || 0);
      productMap[key].count += 1;
    });
    
    // Calculate TOTAL supplied qty and value from ALL products in dispatches (not just rejected ones)
    const totalSuppliedQtyAll = Object.values(productDispatchMap).reduce((sum, p) => sum + (p.qty || 0), 0);
    const totalSuppliedValueAll = Object.values(productDispatchMap).reduce((sum, p) => sum + (p.value || 0), 0);
    
    // Calculate rejection % by count (qty) - sorted descending
    const byProductAll = Object.values(productMap).map(p => {
      const suppliedQty = productDispatchMap[p.name]?.qty || 0;
      const suppliedValue = productDispatchMap[p.name]?.value || 0;
      // If no supplied data, assume 100% rejection for items that have rejections
      const rejPctByCount = suppliedQty > 0 ? (p.qty / suppliedQty * 100) : (p.qty > 0 ? 100 : 0);
      const rejPctByValue = suppliedValue > 0 ? (p.value / suppliedValue * 100) : (p.value > 0 ? 100 : 0);
      // Calculate sales percentage based on TOTAL supplied (all products), not just rejected ones
      const salesPctByQty = totalSuppliedQtyAll > 0 ? (suppliedQty / totalSuppliedQtyAll * 100) : 0;
      const salesPctByValue = totalSuppliedValueAll > 0 ? (suppliedValue / totalSuppliedValueAll * 100) : 0;
      const isHighSellingByQty = salesPctByQty >= 5;
      const isHighSellingByValue = salesPctByValue >= 5;
      return { ...p, suppliedQty, suppliedValue, rejPctByCount, rejPctByValue, salesPctByQty, salesPctByValue, isHighSellingByQty, isHighSellingByValue };
    });
    
    // High selling products by QUANTITY sorted by rejection % (highest first)
    const highSellingProducts = byProductAll
      .filter(p => p.isHighSellingByQty)
      .sort((a, b) => b.rejPctByCount - a.rejPctByCount);
    
    // Low selling products by QUANTITY sorted by rejection % (highest first)
    const lowSellingProducts = byProductAll
      .filter(p => !p.isHighSellingByQty)
      .sort((a, b) => b.rejPctByCount - a.rejPctByCount);
    
    // For backwards compatibility - all products sorted by rejection %
    const byProductCount = [...byProductAll].sort((a, b) => b.rejPctByCount - a.rejPctByCount);
    
    // High selling products by VALUE sorted by value rejection %
    const highSellingByValue = byProductAll
      .filter(p => p.isHighSellingByValue)
      .sort((a, b) => b.rejPctByValue - a.rejPctByValue);
    
    // Low selling products by VALUE sorted by value rejection %
    const lowSellingByValue = byProductAll
      .filter(p => !p.isHighSellingByValue)
      .sort((a, b) => b.rejPctByValue - a.rejPctByValue);
    
    // All products sorted by value rejection %
    const byProductValue = [...byProductAll].sort((a, b) => b.rejPctByValue - a.rejPctByValue);
    
    // Alphabetically sorted for dropdown
    const byProductAlphabetical = [...byProductAll].sort((a, b) => a.name.localeCompare(b.name));
    
    // Aggregate by retailer
    const retailerMap = {};
    filtered.forEach(r => {
      const shopName = retailerCompanyMap[r.retailer_id] || r.retailer_name || 'Unknown';
      if (!retailerMap[shopName]) {
        retailerMap[shopName] = { name: shopName, retailer_id: r.retailer_id, qty: 0, value: 0, count: 0, rejections: [] };
      }
      retailerMap[shopName].qty += (r.quantity || 0);
      retailerMap[shopName].value += (r.rejection_value || 0);
      retailerMap[shopName].count += 1;
      retailerMap[shopName].rejections.push(r);
    });
    
    // Calculate rejection % for retailers - sorted descending
    const byRetailer = Object.values(retailerMap).map(r => {
      const suppliedQty = retailerDispatchMap[r.name]?.qty || 0;
      const suppliedValue = retailerDispatchMap[r.name]?.value || 0;
      const rejPctByCount = suppliedQty > 0 ? (r.qty / suppliedQty * 100) : (r.qty > 0 ? 100 : 0);
      const rejPctByValue = suppliedValue > 0 ? (r.value / suppliedValue * 100) : (r.value > 0 ? 100 : 0);
      return { ...r, suppliedQty, suppliedValue, rejPctByCount, rejPctByValue };
    }).sort((a, b) => b.rejPctByCount - a.rejPctByCount);
    
    // Aggregate by date with expandable details
    const dateMap = {};
    filtered.forEach(r => {
      const key = r.rejection_date?.split('T')[0] || 'Unknown';
      if (!dateMap[key]) {
        dateMap[key] = { date: key, qty: 0, value: 0, count: 0, rejections: [] };
      }
      dateMap[key].qty += (r.quantity || 0);
      dateMap[key].value += (r.rejection_value || 0);
      dateMap[key].count += 1;
      dateMap[key].rejections.push(r);
    });
    const byDate = Object.values(dateMap).sort((a, b) => b.date.localeCompare(a.date));
    
    // Aggregate by day of week
    const dayMap = { 'Sunday': 0, 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0 };
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    filtered.forEach(r => {
      const date = r.rejection_date?.split('T')[0];
      if (date) {
        const dayIndex = new Date(date).getDay();
        dayMap[dayNames[dayIndex]] += (r.rejection_value || 0);
      }
    });
    const byDay = dayNames.map(d => ({ day: d, value: dayMap[d] }));
    
    // Aggregate by reason
    const reasonMap = {};
    filtered.forEach(r => {
      const key = r.reason || 'No reason specified';
      if (!reasonMap[key]) {
        reasonMap[key] = { reason: key, qty: 0, value: 0, count: 0 };
      }
      reasonMap[key].qty += (r.quantity || 0);
      reasonMap[key].value += (r.rejection_value || 0);
      reasonMap[key].count += 1;
    });
    const byReason = Object.values(reasonMap).sort((a, b) => b.value - a.value);
    
    const totalValue = filtered.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
    const totalQty = filtered.reduce((sum, r) => sum + (r.quantity || 0), 0);
    const totalSuppliedQty = Object.values(retailerDispatchMap).reduce((sum, r) => sum + r.qty, 0);
    const totalSuppliedValue = Object.values(retailerDispatchMap).reduce((sum, r) => sum + r.value, 0);
    const overallRejPct = totalSuppliedQty > 0 ? (totalQty / totalSuppliedQty * 100) : 0;
    const overallRejValuePct = totalSuppliedValue > 0 ? (totalValue / totalSuppliedValue * 100) : 0;
    const uniqueDates = new Set(filtered.map(r => r.rejection_date?.split('T')[0])).size;
    const avgPerDay = uniqueDates > 0 ? totalValue / uniqueDates : 0;
    
    // Find max single rejection - use shop name
    let maxSingleRejection = filtered.reduce((max, r) => 
      (r.rejection_value || 0) > (max?.rejection_value || 0) ? r : max, null);
    if (maxSingleRejection) {
      maxSingleRejection = {
        ...maxSingleRejection,
        shop_name: retailerCompanyMap[maxSingleRejection.retailer_id] || maxSingleRejection.retailer_name
      };
    }
    
    return {
      totalValue,
      totalQty,
      totalSuppliedQty,
      totalSuppliedValue,
      overallRejPct,
      overallRejValuePct,
      count: filtered.length,
      byProductCount,
      byProductValue,
      byProductAlphabetical,
      highSellingProducts,
      lowSellingProducts,
      highSellingByValue,
      lowSellingByValue,
      byRetailer,
      byDate,
      byDay,
      byReason,
      avgPerDay,
      uniqueDates,
      maxSingleRejection,
      topProductByQty: byProductCount[0] || null,
      topRetailerByValue: byRetailer[0] || null,
      filteredRejections: filtered,
      retailerCompanyMap,
      productDispatchMap,
      retailerDispatchMap
    };
  }, [rejections, dispatches, allDispatchesForRejection, retailers, rejectionLossDateFrom, rejectionLossDateTo]);

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Calculate rejection amount from invoice items (when rejection_amount field is null/missing)
  const getInvoiceRejectionAmount = (invoice) => {
    if (invoice.rejection_amount !== null && invoice.rejection_amount !== undefined) {
      return invoice.rejection_amount;
    }
    // Calculate from items: sum of (rejected_qty * mrp) for each item
    return (invoice.items || []).reduce((sum, item) => {
      const rejectedQty = item.rejected_qty || 0;
      const mrp = item.mrp || 0;
      return sum + (rejectedQty * mrp);
    }, 0);
  };

  // Calculate gross value from invoice items
  const getInvoiceGrossValue = (invoice) => {
    if (invoice.gross_value) return invoice.gross_value;
    const rejectionAmount = getInvoiceRejectionAmount(invoice);
    return (invoice.total_mrp_value || 0) + rejectionAmount;
  };

  // ==================== EXPORT HANDLERS ====================
  const exportIndents = () => {
    if (!filteredIndents || filteredIndents.length === 0) {
      toast.error('No indents to export');
      return;
    }

    // Get unique retailers and products from filtered indents
    const retailerMap = new Map(); // retailer_id -> outlet_name
    const productVariantSet = new Set(); // "product_name|variant_name"
    const quantityMap = new Map(); // "product_name|variant_name|retailer_id" -> quantity

    filteredIndents.forEach(indent => {
      const retailerId = indent.retailer_id;
      const retailerName = getRetailerNameById(retailerId) || indent.retailer_name || 'Unknown';
      retailerMap.set(retailerId, retailerName);

      indent.items?.forEach(item => {
        // Use Customer Display Variant (variant_name) directly
        const productKey = `${item.product_name}|${item.variant_name || 'Kg'}`;
        productVariantSet.add(productKey);
        
        const qtyKey = `${productKey}|${retailerId}`;
        const existingQty = quantityMap.get(qtyKey) || 0;
        quantityMap.set(qtyKey, existingQty + item.quantity);
      });
    });

    // Convert to arrays
    const retailers = Array.from(retailerMap.entries()); // [[id, name], ...]
    const productVariants = Array.from(productVariantSet).sort(); // Sort alphabetically

    // Get the date from first indent for filename
    const exportDate = filteredIndents[0]?.indent_date 
      ? new Date(filteredIndents[0].indent_date).toISOString().split('T')[0]
      : getISTDate();
    
    const formattedDate = filteredIndents[0]?.indent_date 
      ? formatDate(filteredIndents[0].indent_date)
      : formatDate(getISTDate());

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    
    // Build worksheet data
    const wsData = [];
    
    // Row 1: Title (will be merged)
    const titleRow = [`Retailer Indents - ${formattedDate} | Total Products: ${productVariants.length} | Total Retailers: ${retailers.length}`];
    // Fill rest of title row with empty cells for merging
    const totalCols = 3 + retailers.length + 1; // Sr No, Product, Variant, retailers..., Total
    for (let i = 1; i < totalCols; i++) titleRow.push('');
    wsData.push(titleRow);
    
    // Row 2: Empty row for spacing
    wsData.push([]);
    
    // Row 3: Header row
    const headerRow = ['Sr No', 'Product', 'Variant'];
    retailers.forEach(([_, retailerName]) => {
      headerRow.push(retailerName);
    });
    headerRow.push('Total');
    wsData.push(headerRow);
    
    // Data rows
    productVariants.forEach((productKey, index) => {
      const [productName, variantName] = productKey.split('|');
      // Get translated product name based on selected language
      const translatedName = indentLanguage !== 'en' 
        ? getProductNameInLang({ product_name: productName }, indentLanguage) 
        : productName;
      const row = [index + 1, translatedName, variantName];
      
      let rowTotal = 0;
      retailers.forEach(([retailerId, _]) => {
        const qtyKey = `${productKey}|${retailerId}`;
        const qty = quantityMap.get(qtyKey) || 0;
        row.push(qty || '');
        rowTotal += qty;
      });
      row.push(rowTotal);
      wsData.push(row);
    });
    
    // Totals row
    const totalsRow = ['', 'TOTAL', ''];
    let grandTotal = 0;
    retailers.forEach(([retailerId, _]) => {
      let totalQty = 0;
      productVariants.forEach(productKey => {
        const qtyKey = `${productKey}|${retailerId}`;
        totalQty += quantityMap.get(qtyKey) || 0;
      });
      totalsRow.push(totalQty);
      grandTotal += totalQty;
    });
    totalsRow.push(grandTotal);
    wsData.push(totalsRow);
    
    // Create worksheet from data
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    const colWidths = [
      { wch: 6 },   // Sr No
      { wch: 25 },  // Product
      { wch: 12 },  // Variant
    ];
    retailers.forEach(() => colWidths.push({ wch: 15 }));
    colWidths.push({ wch: 8 }); // Total
    ws['!cols'] = colWidths;
    
    // Merge cells for title row (A1 to last column)
    const lastCol = XLSX.utils.encode_col(totalCols - 1);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } } // Merge title row
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Indents');
    
    // Generate Excel file and download
    XLSX.writeFile(wb, `retailer_indents_${exportDate}.xlsx`);
    
    toast.success(`Exported ${productVariants.length} products × ${retailers.length} retailers`);
  };

  // Print Indents - Opens print dialog with formatted table categorized by product type
  const printIndents = () => {
    if (!filteredIndents || filteredIndents.length === 0) {
      toast.error('No indents to print');
      return;
    }

    // Get unique retailers and products from filtered indents
    const retailerMap = new Map();
    const productVariantSet = new Set();
    const quantityMap = new Map();
    const productCategoryMap = new Map(); // Map product name to category

    filteredIndents.forEach(indent => {
      const retailerId = indent.retailer_id;
      const retailerName = getRetailerNameById(retailerId) || indent.retailer_name || 'Unknown';
      retailerMap.set(retailerId, retailerName);

      indent.items?.forEach(item => {
        // Use Customer Display Variant (variant_name) directly
        const productKey = `${item.product_name}|${item.variant_name || 'Kg'}`;
        productVariantSet.add(productKey);
        
        // Get category from products array
        const productInfo = products.find(p => 
          p.name?.toLowerCase() === item.product_name?.toLowerCase() ||
          p.product_name?.toLowerCase() === item.product_name?.toLowerCase()
        );
        const category = productInfo?.category || productInfo?.type || item.category || 'Others';
        productCategoryMap.set(item.product_name, category);
        
        const qtyKey = `${productKey}|${retailerId}`;
        const existingQty = quantityMap.get(qtyKey) || 0;
        quantityMap.set(qtyKey, existingQty + item.quantity);
      });
    });

    const retailers = Array.from(retailerMap.entries());
    const productVariants = Array.from(productVariantSet).sort();
    
    // Group products by category
    const categoryGroups = {};
    productVariants.forEach(productKey => {
      const [productName] = productKey.split('|');
      const category = productCategoryMap.get(productName) || 'Others';
      if (!categoryGroups[category]) {
        categoryGroups[category] = [];
      }
      categoryGroups[category].push(productKey);
    });
    
    // Sort categories in preferred order
    const categoryOrder = ['Vegetables', 'Fruits', 'Exotic', 'Sprouts', 'Others'];
    const sortedCategories = Object.keys(categoryGroups).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    const formattedDate = filteredIndents[0]?.indent_date 
      ? formatDate(filteredIndents[0].indent_date)
      : formatDate(new Date().toISOString());

    // Build HTML content for printing
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Retailer Indents - ${formattedDate}</title>
        <style>
          @media print {
            @page { size: landscape; margin: 5mm; }
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 8px;
          }
          h1 { 
            text-align: center; 
            font-size: 16px; 
            margin-bottom: 3px;
            color: #14532D;
          }
          .summary { 
            text-align: center; 
            font-size: 12px; 
            margin-bottom: 8px;
            color: #666;
          }
          .category-header {
            background-color: #1e40af;
            color: white;
            font-weight: bold;
            font-size: 13px;
            padding: 6px 10px;
            margin-top: 12px;
            margin-bottom: 4px;
            border-radius: 4px;
          }
          table { 
            border-collapse: collapse; 
            font-size: 13px;
            width: 100%;
            margin-bottom: 8px;
          }
          th, td { 
            border: 1px solid #999; 
            padding: 3px 5px; 
            text-align: center;
          }
          th { 
            background-color: #14532D; 
            color: white; 
            font-weight: bold;
            font-size: 12px;
            padding: 4px 6px;
          }
          td.product-name { 
            text-align: left; 
            font-weight: 500;
          }
          td.variant { 
            text-align: left; 
            color: #444;
          }
          tr:nth-child(even) { background-color: #f0f0f0; }
          .total-col { 
            background-color: #c8e6c9 !important; 
            font-weight: bold;
            color: #14532D;
          }
          .total-row { 
            background-color: #14532D !important; 
            color: white;
            font-weight: bold;
          }
          .total-row td { 
            color: white;
            font-weight: bold;
          }
          .category-vegetables .category-header { background-color: #166534; }
          .category-fruits .category-header { background-color: #c2410c; }
          .category-exotic .category-header { background-color: #7c3aed; }
          .category-sprouts .category-header { background-color: #0891b2; }
        </style>
      </head>
      <body>
        <h1>Retailer Indents - ${formattedDate}</h1>
        <div class="summary">Total Products: ${productVariants.length} | Total Retailers: ${retailers.length}</div>
    `;

    let globalIndex = 0;
    let grandTotal = 0;

    // Render each category
    sortedCategories.forEach(category => {
      const categoryProducts = categoryGroups[category];
      const categoryClass = `category-${category.toLowerCase().replace(/\s+/g, '-')}`;
      
      htmlContent += `
        <div class="${categoryClass}">
          <div class="category-header">${category} (${categoryProducts.length} items)</div>
          <table>
            <thead>
              <tr>
                <th>Sr</th>
                <th>Product</th>
                <th>Variant</th>
                ${retailers.map(([_, name]) => `<th>${name}</th>`).join('')}
                <th class="total-col">Total</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      let categoryTotal = 0;
      
      // Data rows for this category
      categoryProducts.forEach((productKey) => {
        globalIndex++;
        const [productName, variantName] = productKey.split('|');
        // Get translated product name based on selected language
        const translatedName = indentLanguage !== 'en' 
          ? getProductNameInLang({ product_name: productName }, indentLanguage) 
          : productName;
        let rowTotal = 0;
        
        htmlContent += `<tr>`;
        htmlContent += `<td>${globalIndex}</td>`;
        htmlContent += `<td class="product-name">${translatedName}</td>`;
        htmlContent += `<td class="variant">${variantName}</td>`;
        
        retailers.forEach(([retailerId, _]) => {
          const qtyKey = `${productKey}|${retailerId}`;
          const qty = quantityMap.get(qtyKey) || 0;
          rowTotal += qty;
          htmlContent += `<td>${qty || ''}</td>`;
        });
        
        categoryTotal += rowTotal;
        htmlContent += `<td class="total-col">${rowTotal}</td>`;
        htmlContent += `</tr>`;
      });
      
      grandTotal += categoryTotal;
      
      // Category subtotal row
      htmlContent += `<tr class="total-row">`;
      htmlContent += `<td></td>`;
      htmlContent += `<td>${category} Total</td>`;
      htmlContent += `<td></td>`;
      
      retailers.forEach(([retailerId, _]) => {
        let totalQty = 0;
        categoryProducts.forEach(productKey => {
          const qtyKey = `${productKey}|${retailerId}`;
          totalQty += quantityMap.get(qtyKey) || 0;
        });
        htmlContent += `<td>${totalQty}</td>`;
      });
      
      htmlContent += `<td class="total-col" style="background-color: #0d3320 !important;">${categoryTotal}</td>`;
      htmlContent += `</tr>`;
      
      htmlContent += `
            </tbody>
          </table>
        </div>
      `;
    });

    // Grand total section
    htmlContent += `
      <div style="margin-top: 16px; padding: 10px; background-color: #14532D; color: white; border-radius: 4px; text-align: center;">
        <strong>GRAND TOTAL: ${grandTotal} units</strong>
      </div>
    `;

    htmlContent += `
      </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    
    // Trigger print after content loads
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const exportDispatches = () => {
    const dataToExport = [];
    filteredDispatches.forEach(dispatch => {
      dispatch.items?.forEach(item => {
        dataToExport.push({
          date: dispatch.dispatch_date,
          retailer: getRetailerNameById(dispatch.retailer_id) || dispatch.retailer_name,
          product: getProductNameInLang(item, dispatchLanguage), // Use selected language
          variant: item.variant_name || '-',
          quantity: item.dispatched_qty,
          rate: item.rate || 0,
          mrp_value: item.mrp_value || 0,
          invoice_status: dispatch.invoice_status || 'uninvoiced'
        });
      });
    });
    
    exportToCSV(dataToExport, 'retailer_dispatches', [
      { label: 'Date', getter: (d) => formatDate(d.date) },
      { label: 'Retailer', getter: (d) => d.retailer },
      { label: 'Product', getter: (d) => d.product },
      { label: 'Variant', getter: (d) => d.variant },
      { label: 'Quantity', getter: (d) => d.quantity },
      { label: 'Rate', getter: (d) => d.rate },
      { label: 'MRP Value', getter: (d) => d.mrp_value },
      { label: 'Invoice Status', getter: (d) => d.invoice_status }
    ]);
  };

  const exportInvoices = () => {
    exportToCSV(invoices, 'retailer_invoices', [
      { label: 'Invoice No', getter: (d) => d.invoice_number },
      { label: 'Date', getter: (d) => formatDate(d.invoice_date) },
      { label: 'Retailer', getter: (d) => getRetailerNameById(d.retailer_id) || d.retailer_name },
      { label: 'Total MRP', getter: (d) => d.total_mrp_value || 0 },
      { label: 'Commission %', getter: (d) => d.commission_percentage || 0 },
      { label: 'Commission Amt', getter: (d) => d.commission_amount || 0 },
      { label: 'Net Receivable', getter: (d) => d.net_receivable || 0 },
      { label: 'Status', getter: (d) => d.status }
    ]);
  };

  const exportRejections = () => {
    const dataToExport = [];
    filteredRejections.forEach(rejection => {
      rejection.items?.forEach(item => {
        dataToExport.push({
          date: rejection.rejection_date,
          retailer: getRetailerNameById(rejection.retailer_id) || rejection.company_name,
          product: item.product_name,
          variant: item.variant_name || '-',
          quantity: item.rejection_qty,
          reason: item.reason || '-'
        });
      });
    });
    
    exportToCSV(dataToExport, 'retailer_rejections', [
      { label: 'Date', getter: (d) => formatDate(d.date) },
      { label: 'Retailer', getter: (d) => d.retailer },
      { label: 'Product', getter: (d) => d.product },
      { label: 'Variant', getter: (d) => d.variant },
      { label: 'Rejected Qty', getter: (d) => d.quantity },
      { label: 'Reason', getter: (d) => d.reason }
    ]);
  };

  const exportPayments = () => {
    exportToCSV(payments, 'retailer_payments', [
      { label: 'Date', getter: (d) => formatDate(d.payment_date) },
      { label: 'Retailer', getter: (d) => getRetailerNameById(d.retailer_id) || d.retailer_name },
      { label: 'Amount', getter: (d) => d.amount || 0 },
      { label: 'Payment Mode', getter: (d) => d.payment_mode },
      { label: 'Reference', getter: (d) => d.reference_number || '-' },
      { label: 'Remarks', getter: (d) => d.remarks || '-' }
    ]);
  };

  // ==================== INDENT HANDLERS ====================
  const handleCreateOrUpdateIndent = async (e) => {
    e.preventDefault();
    if (!indentForm.retailer_id) {
      toast.error('Please select a retailer');
      return;
    }
    if (indentForm.items.some(item => !item.product_id || !item.quantity)) {
      toast.error('Please fill all product details');
      return;
    }

    try {
      if (editingIndent) {
        await api.put(`/api/retailer-indents/${editingIndent.id}`, {
          retailer_id: indentForm.retailer_id,
          indent_date: indentForm.indent_date,  // Already in YYYY-MM-DD format from date input
          items: indentForm.items,
          remarks: indentForm.remarks
        });
        toast.success('Indent updated successfully');
      } else {
        await api.post('/api/retailer-indents', {
          retailer_id: indentForm.retailer_id,
          indent_date: indentForm.indent_date,  // Already in YYYY-MM-DD format from date input
          items: indentForm.items,
          remarks: indentForm.remarks
        });
        toast.success('Indent created successfully');
      }
      setShowIndentModal(false);
      setEditingIndent(null);
      resetIndentForm();
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save indent');
    }
  };

  const openEditIndentModal = (indent) => {
    setEditingIndent(indent);
    
    // Helper to resolve variant info - if variant_name is a UUID, use it as variant_id
    const resolveVariantInfo = (item) => {
      let variantId = item.variant_id || '';
      let variantName = item.variant_name || '';
      
      // Check if variant_name looks like a UUID (packaging ID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (variantName && uuidRegex.test(variantName)) {
        // variant_name is actually a UUID - use it as variant_id
        variantId = variantName;
        // Look up the actual packaging name
        const packaging = packagings.find(p => p.id === variantName);
        if (packaging) {
          variantName = packaging.name || '';
        }
      } else if (variantId && uuidRegex.test(variantId)) {
        // variant_id is a UUID - resolve the name if not already set
        const packaging = packagings.find(p => p.id === variantId);
        if (packaging && (!variantName || uuidRegex.test(variantName))) {
          variantName = packaging.name || '';
        }
      }
      
      return { variantId, variantName };
    };
    
    setIndentForm({
      retailer_id: indent.retailer_id,
      indent_date: indent.indent_date?.split('T')[0] || getISTDate(),
      items: indent.items.map(item => {
        const { variantId, variantName } = resolveVariantInfo(item);
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: variantId,
          variant_name: variantName,
          quantity: item.quantity,
          status: item.status || 'pending'
        };
      }),
      remarks: indent.remarks || ''
    });
    setShowIndentModal(true);
  };

  const handleDeleteIndent = async (indentId) => {
    if (!window.confirm('Are you sure you want to delete this indent?')) return;
    try {
      await api.delete(`/api/retailer-indents/${indentId}`);
      toast.success('Indent deleted');
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete indent');
    }
  };

  const resetIndentForm = () => {
    setIndentForm({
      retailer_id: '',
      indent_date: getISTDate(),
      items: [{ product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: '', status: 'pending' }],
      remarks: ''
    });
    setRetailerSearch('');
    setShowRetailerDropdown(false);
  };

  // Function to load previous indent items for retailer
  const loadPreviousRetailerIndent = async (retailerId = null) => {
    const targetRetailerId = retailerId || indentForm.retailer_id;
    if (!targetRetailerId) {
      toast.error('Please select a retailer first');
      return;
    }
    
    // Helper to resolve variant UUID to actual name
    const resolveVariantName = (variantName) => {
      if (!variantName) return '';
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(variantName)) {
        const packaging = packagings.find(p => p.id === variantName);
        if (packaging) return packaging.name || variantName;
      }
      return variantName;
    };
    
    try {
      const res = await api.get(`/api/retailer-indents/previous/${targetRetailerId}`);
      if (res.data.indent && res.data.indent.items && res.data.indent.items.length > 0) {
        const previousItems = res.data.indent.items.map(item => ({
          product_id: item.product_id || '',
          product_name: item.product_name || '',
          variant_id: item.variant_id || '',
          variant_name: resolveVariantName(item.variant_name),
          quantity: '',  // Keep qty blank so user must enter new value
          status: 'pending'
        }));
        setIndentForm(prev => ({ ...prev, items: previousItems }));
        toast.success(`Loaded ${previousItems.length} items from previous indent. Please enter quantities.`);
      } else {
        toast.info('No previous indent found for this retailer');
      }
    } catch (error) {
      console.log('No previous indent found');
    }
  };

  // Handler for retailer selection that auto-loads previous indent
  const handleRetailerSelectForIndent = async (retailer) => {
    setIndentForm(prev => ({ ...prev, retailer_id: retailer.id }));
    setRetailerSearch(retailer.company_name || retailer.name || '');
    setShowRetailerDropdown(false);
    
    // Auto-load previous indent when retailer is selected (only if creating new indent)
    if (!editingIndent) {
      try {
        const res = await api.get(`/api/retailer-indents/previous/${retailer.id}`);
        if (res.data.indent && res.data.indent.items && res.data.indent.items.length > 0) {
          const previousItems = res.data.indent.items.map(item => ({
            product_id: item.product_id || '',
            product_name: item.product_name || '',
            variant_id: item.variant_id || '',
            variant_name: item.variant_name || '',
            quantity: '',  // Keep qty blank
            status: 'pending'
          }));
          setIndentForm(prev => ({ 
            ...prev, 
            retailer_id: retailer.id,
            items: previousItems 
          }));
          toast.success(`Loaded ${previousItems.length} items from previous indent. Please enter quantities.`);
        }
      } catch (error) {
        console.log('No previous indent found for retailer');
      }
    }
  };

  const addIndentItem = () => {
    setIndentForm(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', variant_id: '', variant_name: '', quantity: '', status: 'pending' }]
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

  // ==================== AUTO INDENT CREATION ====================
  const handleAutoIndentCreation = async () => {
    if (!autoIndentRetailerId) {
      toast.error('Please select a retailer');
      return;
    }
    
    setAutoIndentLoading(true);
    try {
      const response = await api.post('/api/admin/generate-auto-indent', {
        retailer_id: autoIndentRetailerId,
        target_date: autoIndentDate,
        basis: autoIndentBasis // 'sales' or 'plan'
      });
      
      if (response.data.success) {
        toast.success(response.data.message || `Auto indent created successfully for ${response.data.retailer_name}`);
        setShowAutoIndentModal(false);
        setAutoIndentRetailerId('');
        setAutoIndentBasis('sales');
        loadIndents();
      } else {
        toast.error(response.data.message || 'Failed to create auto indent');
      }
    } catch (error) {
      console.error('Auto indent creation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to create auto indent. Check if retailer has required data.');
    } finally {
      setAutoIndentLoading(false);
    }
  };

  // Load retail wastage averages - returns data directly for immediate use
  const loadRetailWastageAverages = useCallback(async () => {
    try {
      const response = await api.get('/api/retail-wastage-averages');
      const data = response.data || [];
      setRetailWastageAverages(data);
      return data;
    } catch (error) {
      console.error('Failed to load retail wastage averages:', error);
      return [];
    }
  }, []);

  // ==================== DAILY REQUIREMENT HANDLERS ====================
  const calculateDailyRequirement = useCallback(async () => {
    if (!dailyReqDate) {
      setDailyReqError('Please select a date');
      return;
    }
    
    setDailyReqLoading(true);
    setDailyReqError('');
    setDailyReqData([]);
    setDailyReqSaved(false);
    
    try {
      // Call the backend endpoint that calculates based on indents for the date
      let url = `/api/retailer-daily-requirement/calculate?target_date=${dailyReqDate}`;
      if (dailyReqRetailer) {
        url += `&retailer_id=${dailyReqRetailer}`;
      }
      
      const response = await api.get(url);
      const result = response.data;
      
      if (!result.success) {
        setDailyReqError(result.message || 'Failed to calculate daily requirement');
        return;
      }
      
      if (!result.items || result.items.length === 0) {
        setDailyReqError(`No indents found for ${dailyReqDate}. Please create indents for this date first.`);
        return;
      }
      
      // Transform backend data to frontend format
      // Simplified: requirementKg = qtyKg (no wastage calculation)
      // Apply rounding: minimum 1 kg, round up to next whole number
      const roundUpRequirement = (qty) => {
        if (qty <= 0) return 0;
        if (qty < 1) return 1;  // Minimum 1 kg
        return Math.ceil(qty);  // Round up to next whole number
      };
      
      const requirementData = result.items.map(item => ({
        productId: item.product_id,
        productName: item.product_name,
        productNameHi: item.product_name_hi || '',
        productNameMr: item.product_name_mr || '',
        category: item.category || 'Other',
        variants: item.variants || '',  // Combined variants for display
        qtyUnits: item.qty_units,
        qtyKg: item.qty_kg,
        qtyDozens: item.qty_dozens || 0,  // For dozen-based products
        qtyPieces: item.qty_pieces || 0,  // For piece-based products
        qtyPackets: item.qty_packets || 0,  // For packet-based products
        requirementKg: roundUpRequirement(item.qty_kg), // Round up, min 1 kg
        purchaseUnit: item.purchase_unit || '',
        purchaseWeightName: item.purchase_weight_name || '',
        retailers: item.retailers || [],
        remarks: ''
      }));
      
      // Try to load previous day's remarks to carry forward
      let previousRemarks = {};
      try {
        const prevDate = new Date(dailyReqDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevDateStr = prevDate.toISOString().split('T')[0];
        const prevRes = await api.get(`/api/retailer-daily-requirement/saved?date=${prevDateStr}`);
        if (prevRes.data?.items) {
          prevRes.data.items.forEach(item => {
            if (item.remarks) {
              previousRemarks[item.product_id] = item.remarks;
            }
          });
        }
      } catch (e) {
        // No previous day's data, ignore
      }
      
      // Apply previous day's remarks to new data
      const requirementDataWithRemarks = requirementData.map(item => ({
        ...item,
        remarks: previousRemarks[item.productId] || ''
      }));
      
      // Set as original data (from indents - always fresh)
      setOriginalReqData(requirementDataWithRemarks);
      
      // Try to load saved data for this date
      try {
        const savedRes = await api.get(`/api/retailer-daily-requirement/saved?date=${dailyReqDate}`);
        if (savedRes.data?.items && savedRes.data.items.length > 0) {
          const savedData = savedRes.data.items.map(item => ({
            productId: item.product_id,
            productName: item.product_name,
            productNameHi: item.product_name_hi || '',
            productNameMr: item.product_name_mr || '',
            category: item.category || 'Other',
            qtyUnits: item.qty_units,
            qtyKg: item.qty_kg,
            requirementKg: item.requirement_kg,
            purchaseUnit: item.purchase_unit || '',
            purchaseWeightName: item.purchase_weight_name || '',
            remarks: item.remarks || ''
          }));
          setSavedReqData(savedData);
          // Default to saved view if saved data exists
          setDailyReqData(savedData);
          setDailyReqViewMode('saved');
        } else {
          setSavedReqData([]);
          setDailyReqData(requirementDataWithRemarks);
          setDailyReqViewMode('original');
        }
      } catch (e) {
        // No saved data, use original with previous remarks
        setSavedReqData([]);
        setDailyReqData(requirementDataWithRemarks);
        setDailyReqViewMode('original');
      }
      
      // Reset deleted items
      setDeletedItems([]);
      setDailyReqSaved(true);
      
      // Show info about the calculation
      toast.success(`Calculated from ${result.indent_count} indent(s) for ${dailyReqDate}`);
      
      // Auto-populate purchase prices from COGS
      await fetchPurchasePricesFromCogs(requirementDataWithRemarks);
      
    } catch (error) {
      console.error('Failed to calculate daily requirement:', error);
      setDailyReqError('Failed to calculate. Please try again.');
    } finally {
      setDailyReqLoading(false);
    }
  }, [dailyReqDate, dailyReqRetailer]);

  // Fetch COGS data and calculate required purchase prices
  // Rule: Vegetables/Sprouts/Exotic = SP/kg ÷ 3, Fruits = SP/kg ÷ 2
  const fetchPurchasePricesFromCogs = useCallback(async (items) => {
    try {
      // Fetch COGS snapshot - try today first, then go back up to 3 days
      let cogsData = null;
      let cogsDate = null;
      const today = new Date();
      
      for (let daysBack = 0; daysBack <= 3; daysBack++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - daysBack);
        const dateStr = checkDate.toISOString().split('T')[0];
        
        try {
          const response = await api.get(`/api/cogs/snapshot?date=${dateStr}`);
          if (response.data?.products && response.data.products.length > 0) {
            cogsData = response.data;
            cogsDate = dateStr;
            break;
          }
        } catch (e) {
          // Try next date
        }
      }
      
      if (!cogsData || !cogsData.products) {
        setPurchasePriceWarning('No COGS data found. Please enter purchase prices manually.');
        toast.warning('No recent COGS data found. Please enter purchase prices manually.');
        return;
      }
      
      // Check if data is more than 3 days old
      const cogsDateObj = new Date(cogsDate);
      const daysDiff = Math.floor((today - cogsDateObj) / (1000 * 60 * 60 * 24));
      
      if (daysDiff > 3) {
        setPurchasePriceWarning(`COGS prices are ${daysDiff} days old (${cogsDate}). Please verify/enter manually.`);
        toast.warning(`Prices are more than 3 days old (${cogsDate}). Please verify purchase prices manually.`);
      } else {
        setPurchasePriceWarning('');
      }
      
      // Build a map of product_name (lowercase) -> retail_sp_per_kg
      const cogsMap = {};
      cogsData.products.forEach(p => {
        const name = (p.product_name || '').toLowerCase().trim();
        if (name && p.retail_sp_per_kg > 0) {
          cogsMap[name] = p.retail_sp_per_kg;
        }
      });
      
      setPurchasePriceCogsData(cogsMap);
      
      // Calculate purchase prices and update dailyReqData
      setDailyReqData(prev => prev.map(item => {
        const productName = (item.productName || '').toLowerCase().trim();
        const retailSp = cogsMap[productName];
        
        if (retailSp && retailSp > 0) {
          const category = (item.category || '').toLowerCase();
          let divisor = 3; // Default for vegetables, sprouts, exotic
          
          if (category === 'fruits') {
            divisor = 2;
          }
          
          const purchasePrice = parseFloat((retailSp / divisor).toFixed(2));
          return { ...item, purchasePrice };
        }
        
        // No COGS data for this product
        return { ...item, purchasePrice: item.purchasePrice || '' };
      }));
      
    } catch (error) {
      console.error('Failed to fetch COGS for purchase prices:', error);
      setPurchasePriceWarning('Failed to fetch COGS data. Please enter purchase prices manually.');
    }
  }, []);

  // Calculate stickers data from indents
  // Dedup key: product_id + canonical variant_id (resolved via packagings map)
  // EXCEPTION: For products with purchase_unit = "Piece" or "Packet", aggregate ALL variants under product_id only
  const calculateStickersData = useCallback(async () => {
    if (!dailyReqDate) {
      return;
    }
    
    setStickersLoading(true);
    setStickersData([]);
    setStickerIndentDetails({});
    setExpandedStickerItem(null);
    
    try {
      // Fetch indents for the selected date
      const response = await api.get(`/api/retailer-indents?from_date=${dailyReqDate}&to_date=${dailyReqDate}`);
      const allIndents = response.data || [];
      
      // Filter indents to only include those matching the exact selected date
      const indents = allIndents.filter(indent => {
        const indentDateStr = (indent.indent_date || '').toString().slice(0, 10);
        return indentDateStr === dailyReqDate;
      });
      
      if (indents.length === 0) {
        setStickersLoading(false);
        return;
      }
      
      // Fetch retailer catalogue to get purchase_unit info for each product
      let catalogueMap = {}; // product_id -> {purchase_unit, purchase_weight_name}
      try {
        const catResponse = await api.get('/api/retailer-catalogue');
        const catalogueItems = catResponse.data || [];
        
        // Build packaging ID to name map for resolving purchase_weight_variant
        const pkgIdToName = {};
        packagings.forEach(p => {
          pkgIdToName[p.id] = p.name || '';
        });
        
        catalogueItems.forEach(cat => {
          const purchaseWeights = cat.purchase_weights || [];
          const purchaseWeightId = purchaseWeights[0] || cat.purchase_weight_variant || '';
          const purchaseWeightName = pkgIdToName[purchaseWeightId] || '';
          
          catalogueMap[cat.product_id] = {
            purchaseUnit: cat.purchase_unit || '',
            purchaseWeightName: purchaseWeightName
          };
        });
      } catch (catErr) {
        console.log('Could not load catalogue for stickers:', catErr);
      }
      
      // Build product info map from products state
      const productInfoMap = {};
      products.forEach(p => {
        productInfoMap[p.id] = {
          name: p.name,
          name_hi: p.name_hi || '',
          name_mr: p.name_mr || '',
          category: p.category || 'Other'
        };
      });
      
      // Build retailer map
      const retailerMap = {};
      retailers.forEach(r => {
        retailerMap[r.id] = r.company_name || r.name || 'Unknown Retailer';
      });
      
      // Build packaging maps for resolving variant IDs/names
      const packagingIdToName = {};  // id -> canonical name
      const packagingNameToId = {};  // lowercase name -> id (canonical)
      packagings.forEach(p => {
        packagingIdToName[p.id] = p.name || '';
        const nameLower = (p.name || '').toLowerCase();
        if (nameLower) {
          packagingNameToId[nameLower] = p.id;
        }
      });
      
      // Function to resolve variant to canonical (id, name) pair
      const resolveVariant = (variantId, variantNameRaw) => {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // Handle special unit-based variant IDs
        if (variantId === 'unit_piece') {
          return { canonicalId: 'unit_piece', canonicalName: 'Pieces' };
        }
        if (variantId === 'unit_packet') {
          return { canonicalId: 'unit_packet', canonicalName: 'Packets' };
        }
        
        // If variantId is a valid UUID in packagings, use it directly
        if (variantId && packagingIdToName[variantId]) {
          return { canonicalId: variantId, canonicalName: packagingIdToName[variantId] };
        }
        
        // If variantNameRaw looks like a UUID, try to resolve it
        if (variantNameRaw && uuidPattern.test(variantNameRaw)) {
          // First check if this UUID exists in packagings
          if (packagingIdToName[variantNameRaw]) {
            return { canonicalId: variantNameRaw, canonicalName: packagingIdToName[variantNameRaw] };
          }
          // UUID not in packagings - check if variantId can be resolved instead
          if (variantId && packagingIdToName[variantId]) {
            return { canonicalId: variantId, canonicalName: packagingIdToName[variantId] };
          }
          // Unresolved UUID - show "Unknown Variant" instead of the UUID
          return { canonicalId: variantNameRaw, canonicalName: 'Unknown Variant' };
        }
        
        // If variantNameRaw matches a packaging name (case-insensitive), use its canonical ID
        const variantNameLower = (variantNameRaw || '').toLowerCase();
        if (variantNameLower && packagingNameToId[variantNameLower]) {
          const canonicalId = packagingNameToId[variantNameLower];
          return { canonicalId, canonicalName: packagingIdToName[canonicalId] };
        }
        
        // Fallback: use variantId if provided, else generate a pseudo-key from the name
        // But if it's a UUID that's not in packagings, show "Unknown Variant"
        if (variantId) {
          if (uuidPattern.test(variantId) && !packagingIdToName[variantId]) {
            return { canonicalId: variantId, canonicalName: 'Unknown Variant' };
          }
          return { canonicalId: variantId, canonicalName: variantNameRaw || 'Default' };
        }
        
        // Last fallback: use the raw name as the key
        return { canonicalId: `name:${variantNameLower || 'default'}`, canonicalName: variantNameRaw || 'Default' };
      };
      
      // Aggregate data
      // For products with purchase_unit = "Piece" or "Packet", use productId only as key (combine all variants)
      // For other products, use productId|variantId as key
      const combinationMap = {}; // key -> data
      const indentDetailsMap = {}; // key -> [{retailerName, retailerId, quantity}]
      
      for (const indent of indents) {
        const retailerName = retailerMap[indent.retailer_id] || 'Unknown Retailer';
        
        for (const item of (indent.items || [])) {
          const productId = item.product_id;
          const productInfo = productInfoMap[productId] || {};
          const productName = (productInfo.name || item.product_name || 'Unknown').trim();
          const productNameHi = productInfo.name_hi || '';
          const productNameMr = productInfo.name_mr || '';
          const category = productInfo.category || 'Other';
          
          // Get catalogue info for this product
          const catInfo = catalogueMap[productId] || {};
          const purchaseUnit = catInfo.purchaseUnit || '';
          const purchaseWeightName = catInfo.purchaseWeightName || '';
          const isPieceOrPacket = ['Piece', 'Packet'].includes(purchaseUnit);
          
          // Resolve to canonical variant
          const { canonicalId, canonicalName } = resolveVariant(item.variant_id, item.variant_name);
          
          // Determine aggregation key based on purchase_unit
          // For Piece/Packet products: aggregate ALL variants under the product
          // For others: keep variants separate
          let key, displayVariantId, displayVariantName;
          
          if (isPieceOrPacket) {
            // Aggregate all variants for this product
            key = productId;
            // Use "Pieces" or "Packets" as variant name, with weight info
            displayVariantId = purchaseUnit === 'Piece' ? 'unit_piece' : 'unit_packet';
            displayVariantName = purchaseWeightName 
              ? `${purchaseUnit === 'Piece' ? 'Pieces' : 'Packets'} of ${purchaseWeightName}`
              : (purchaseUnit === 'Piece' ? 'Pieces' : 'Packets');
          } else {
            // Keep variants separate
            key = `${productId}|${canonicalId}`;
            displayVariantId = canonicalId;
            displayVariantName = canonicalName;
          }
          
          if (!combinationMap[key]) {
            combinationMap[key] = {
              productId: productId,
              productName: productName,
              productNameHi: productNameHi,
              productNameMr: productNameMr,
              category: category,
              variantId: displayVariantId,
              variantName: displayVariantName,
              purchaseUnit: purchaseUnit,
              purchaseWeightName: purchaseWeightName,
              quantity: 0,
              aggregationKey: key  // Store the actual key used for dedup/lookup
            };
            indentDetailsMap[key] = [];
          }
          
          combinationMap[key].quantity += (item.quantity || 0);
          
          // Add retailer detail
          const existingRetailer = indentDetailsMap[key].find(d => d.retailerId === indent.retailer_id);
          if (existingRetailer) {
            existingRetailer.quantity += (item.quantity || 0);
          } else {
            indentDetailsMap[key].push({
              retailerId: indent.retailer_id,
              retailerName: retailerName,
              quantity: item.quantity || 0
            });
          }
        }
      }
      
      // Convert to array and sort by category then product name then variant
      const categoryOrder = { 'Fruits': 1, 'Vegetables': 2, 'Leafy': 3, 'Exotic': 4, 'Other': 5 };
      const stickersArray = Object.values(combinationMap).sort((a, b) => {
        const catA = categoryOrder[a.category] || 99;
        const catB = categoryOrder[b.category] || 99;
        if (catA !== catB) return catA - catB;
        const nameCompare = a.productName.localeCompare(b.productName);
        if (nameCompare !== 0) return nameCompare;
        return a.variantName.localeCompare(b.variantName);
      });
      
      // Attach keys to items for lookup (use the actual aggregation key, not productId|variantId)
      stickersArray.forEach(item => {
        item.key = item.aggregationKey || `${item.productId}|${item.variantId}`;
      });
      
      setStickersData(stickersArray);
      setStickerIndentDetails(indentDetailsMap);
      
    } catch (error) {
      console.error('Failed to load stickers data:', error);
    } finally {
      setStickersLoading(false);
    }
  }, [dailyReqDate, products, retailers, packagings]);

  // Get unique categories from stickers data
  const stickersCategories = useMemo(() => {
    const cats = new Set(stickersData.map(item => item.category));
    return ['all', ...Array.from(cats).sort()];
  }, [stickersData]);

  // Filter stickers data based on search and category
  const filteredStickersData = useMemo(() => {
    let filtered = stickersData;
    
    // Filter by category
    if (stickersCategoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category === stickersCategoryFilter);
    }
    
    // Filter by search
    if (stickersSearch.trim()) {
      const searchLower = stickersSearch.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.productName.toLowerCase().includes(searchLower) ||
        item.variantName.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  }, [stickersData, stickersCategoryFilter, stickersSearch]);

  // Category order for sorting
  const categoryOrder = { 'Vegetables': 1, 'Leafy': 2, 'Fruits': 3, 'Exotic': 4, 'Other': 99 };

  // Group Purchase data by category
  const groupedPurchaseData = useMemo(() => {
    const groups = {};
    dailyReqData.forEach(item => {
      const cat = item.category || 'Other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    // Sort categories by predefined order
    const sortedCategories = Object.keys(groups).sort((a, b) => 
      (categoryOrder[a] || 99) - (categoryOrder[b] || 99)
    );
    return { groups, sortedCategories };
  }, [dailyReqData]);

  // Group Stickers data by category
  const groupedStickersData = useMemo(() => {
    const groups = {};
    filteredStickersData.forEach(item => {
      const cat = item.category || 'Other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    // Sort categories by predefined order
    const sortedCategories = Object.keys(groups).sort((a, b) => 
      (categoryOrder[a] || 99) - (categoryOrder[b] || 99)
    );
    return { groups, sortedCategories };
  }, [filteredStickersData]);

  // Auto-expand all categories when data loads
  useEffect(() => {
    if (dailyReqData.length > 0) {
      const allCats = {};
      dailyReqData.forEach(item => {
        allCats[item.category || 'Other'] = true;
      });
      setExpandedPurchaseCategories(allCats);
    }
  }, [dailyReqData]);

  useEffect(() => {
    if (stickersData.length > 0) {
      const allCats = {};
      stickersData.forEach(item => {
        allCats[item.category || 'Other'] = true;
      });
      setExpandedStickersCategories(allCats);
    }
  }, [stickersData]);

  // Toggle category expansion for Purchase tab
  const togglePurchaseCategory = (category) => {
    setExpandedPurchaseCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Toggle category expansion for Stickers tab
  const toggleStickersCategory = (category) => {
    setExpandedStickersCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Load sticker MRP overrides
  const loadStickerMrpOverrides = useCallback(async () => {
    setStickerOverridesLoading(true);
    try {
      const response = await api.get('/api/sticker-mrp-overrides');
      setStickerMrpOverrides(response.data || []);
    } catch (error) {
      console.error('Failed to load sticker MRP overrides:', error);
    } finally {
      setStickerOverridesLoading(false);
    }
  }, []);

  // Load overrides when stickers tab is active
  useEffect(() => {
    if (dailyReqSubTab === 'stickersMrp') {
      loadStickerMrpOverrides();
    }
  }, [dailyReqSubTab, loadStickerMrpOverrides]);

  // Create or update sticker MRP override
  const saveStickerMrpOverride = async (data) => {
    try {
      if (stickerOverrideEditItem?.id) {
        // Update existing
        await api.put(`/api/sticker-mrp-overrides/${stickerOverrideEditItem.id}`, data);
        toast.success('MRP override updated');
      } else {
        // Create new
        await api.post('/api/sticker-mrp-overrides', data);
        toast.success('MRP override created');
      }
      setStickerOverrideModalOpen(false);
      setStickerOverrideEditItem(null);
      loadStickerMrpOverrides();
    } catch (error) {
      console.error('Failed to save sticker MRP override:', error);
      toast.error('Failed to save MRP override');
    }
  };

  // Delete sticker MRP override
  const deleteStickerMrpOverride = async (overrideId) => {
    if (!window.confirm('Are you sure you want to delete this MRP override?')) return;
    try {
      await api.delete(`/api/sticker-mrp-overrides/${overrideId}`);
      toast.success('MRP override deleted');
      loadStickerMrpOverrides();
    } catch (error) {
      console.error('Failed to delete sticker MRP override:', error);
      toast.error('Failed to delete MRP override');
    }
  };

  // Open modal for adding new sticker MRP override
  const openAddStickerOverrideModal = () => {
    setStickerOverrideEditItem(null);
    setStickerOverrideModalOpen(true);
  };

  // Open modal for editing existing sticker MRP override
  const openEditStickerOverrideModal = (item) => {
    // item can be from stickersData or from stickerMrpOverrides
    // Find if there's an existing override for this product+variant
    const existingOverride = stickerMrpOverrides.find(o => 
      o.product_id === item.productId && o.variant_id === item.variantId
    );
    
    setStickerOverrideEditItem({
      id: existingOverride?.id || null,
      productId: item.productId,
      productName: item.productName,
      variantId: item.variantId,
      variantName: item.variantName,
      mrp: existingOverride?.mrp || 0
    });
    setStickerOverrideModalOpen(true);
  };

  // Get MRP for a product+variant (check overrides first)
  const getStickerMrp = useCallback((productId, variantId) => {
    const override = stickerMrpOverrides.find(o => 
      o.product_id === productId && o.variant_id === variantId
    );
    return override?.mrp || null;
  }, [stickerMrpOverrides]);

  // Toggle category expansion for MRP tab
  const toggleMrpCategory = (category) => {
    setExpandedMrpCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Group MRP indent products by category
  const groupedMrpIndentProducts = useMemo(() => {
    const groups = {};
    mrpIndentProducts.forEach(item => {
      const cat = item.category || 'Other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    // Sort categories by predefined order
    const sortedCategories = Object.keys(groups).sort((a, b) => 
      (categoryOrder[a] || 99) - (categoryOrder[b] || 99)
    );
    return { groups, sortedCategories };
  }, [mrpIndentProducts]);

  // Auto-expand MRP categories when data loads
  useEffect(() => {
    if (mrpIndentProducts.length > 0) {
      const allCats = {};
      mrpIndentProducts.forEach(item => {
        allCats[item.category || 'Other'] = true;
      });
      setExpandedMrpCategories(allCats);
    }
  }, [mrpIndentProducts]);

  // Get category color classes
  const getCategoryColorClasses = (category) => {
    switch (category) {
      case 'Fruits': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Vegetables': return 'bg-green-100 text-green-700 border-green-200';
      case 'Leafy': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Exotic': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Recalculate stickers when date changes and we're on stickers tab
  useEffect(() => {
    if (dailyReqSubTab === 'stickersMrp' && dailyReqDate && !stickersLoading) {
      calculateStickersData();
    }
  }, [dailyReqDate, dailyReqSubTab]); // Removed calculateStickersData from deps to prevent loops

  // Auto-calculate Daily Requirement when tab is opened or date changes
  // Added loading check to prevent duplicate calls
  useEffect(() => {
    if (activeTab === 'dailyRequirement' && dailyReqDate && dailyReqSubTab === 'purchase' && !dailyReqLoading) {
      calculateDailyRequirement();
    }
  }, [activeTab, dailyReqDate, dailyReqSubTab]); // Removed calculateDailyRequirement from deps to prevent loops

  // ==================== MRP TAB FUNCTIONS ====================
  // Load MRP data for a date
  const loadMrpData = useCallback(async (date) => {
    setMrpLoading(true);
    setMrpHasUnsavedChanges(false);
    setPendingMrpChanges({});
    try {
      const [mrpRes, variantsRes] = await Promise.all([
        api.get(`/api/daily-mrp?date=${date}`),
        api.get('/api/daily-mrp/last-variants')
      ]);
      setMrpData(mrpRes.data || []);
      setLastVariants(variantsRes.data || {});
      setMrpAutoInitDone(false); // Reset auto-init flag when loading new date
      
      // Auto-expand all categories by default
      const cats = {};
      products.forEach(p => {
        cats[p.category || 'Others'] = true;
      });
      setExpandedMrpCategories(cats);
    } catch (error) {
      console.error('Failed to load MRP data:', error);
      toast.error('Failed to load MRP data');
    } finally {
      setMrpLoading(false);
    }
  }, [products]);

  // Load unique products from day's indents for MRP filtering (mirrors Stickers logic)
  // Uses same canonical variant resolution as calculateStickersData
  // EXCEPTION: For products with purchase_unit = "Piece" or "Packet", aggregate ALL variants under product_id only
  const loadMrpIndentProducts = useCallback(async (date) => {
    if (!date) return;
    setMrpIndentLoading(true);
    setMrpIndentProducts([]);
    
    try {
      const response = await api.get(`/api/retailer-indents?from_date=${date}&to_date=${date}`);
      const allIndents = response.data || [];
      
      // Filter indents to only include those matching the exact selected date
      const indents = allIndents.filter(indent => {
        const indentDateStr = (indent.indent_date || '').toString().slice(0, 10);
        return indentDateStr === date;
      });
      
      if (indents.length === 0) {
        setMrpIndentLoading(false);
        return;
      }
      
      // Fetch retailer catalogue to get purchase_unit info for each product
      let catalogueMap = {}; // product_id -> {purchase_unit, purchase_weight_name}
      try {
        const catResponse = await api.get('/api/retailer-catalogue');
        const catalogueItems = catResponse.data || [];
        
        // Build packaging ID to name map for resolving purchase_weight_variant
        const pkgIdToName = {};
        packagings.forEach(p => {
          pkgIdToName[p.id] = p.name || '';
        });
        
        catalogueItems.forEach(cat => {
          const purchaseWeights = cat.purchase_weights || [];
          const purchaseWeightId = purchaseWeights[0] || cat.purchase_weight_variant || '';
          const purchaseWeightName = pkgIdToName[purchaseWeightId] || '';
          
          catalogueMap[cat.product_id] = {
            purchaseUnit: cat.purchase_unit || '',
            purchaseWeightName: purchaseWeightName
          };
        });
      } catch (catErr) {
        console.log('Could not load catalogue for MRP indent products:', catErr);
      }
      
      // Build product info map from products state
      const productInfoMap = {};
      products.forEach(p => {
        productInfoMap[p.id] = {
          name: p.name,
          name_hi: p.name_hi || '',
          name_mr: p.name_mr || '',
          category: p.category || 'Other'
        };
      });
      
      // Build packaging maps for resolving variant IDs/names (same as calculateStickersData)
      const packagingIdToName = {};  // id -> canonical name
      const packagingNameToId = {};  // lowercase name -> id (canonical)
      packagings.forEach(p => {
        packagingIdToName[p.id] = p.name || '';
        const nameLower = (p.name || '').toLowerCase();
        if (nameLower) {
          packagingNameToId[nameLower] = p.id;
        }
      });
      
      // Function to resolve variant to canonical (id, name) pair
      const resolveVariant = (variantId, variantNameRaw) => {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        // Handle special unit-based variant IDs
        if (variantId === 'unit_piece') {
          return { canonicalId: 'unit_piece', canonicalName: 'Pieces' };
        }
        if (variantId === 'unit_packet') {
          return { canonicalId: 'unit_packet', canonicalName: 'Packets' };
        }
        
        // If variantId is a valid UUID in packagings, use it directly
        if (variantId && packagingIdToName[variantId]) {
          return { canonicalId: variantId, canonicalName: packagingIdToName[variantId] };
        }
        
        // If variantNameRaw looks like a UUID, try to resolve it
        if (variantNameRaw && uuidPattern.test(variantNameRaw)) {
          // First check if this UUID exists in packagings
          if (packagingIdToName[variantNameRaw]) {
            return { canonicalId: variantNameRaw, canonicalName: packagingIdToName[variantNameRaw] };
          }
          // UUID not in packagings - check if variantId can be resolved instead
          if (variantId && packagingIdToName[variantId]) {
            return { canonicalId: variantId, canonicalName: packagingIdToName[variantId] };
          }
          // Unresolved UUID - show "Unknown Variant" instead of the UUID
          return { canonicalId: variantNameRaw, canonicalName: 'Unknown Variant' };
        }
        
        // If variantNameRaw matches a packaging name (case-insensitive), use its canonical ID
        const variantNameLower = (variantNameRaw || '').toLowerCase();
        if (variantNameLower && packagingNameToId[variantNameLower]) {
          const canonicalId = packagingNameToId[variantNameLower];
          return { canonicalId, canonicalName: packagingIdToName[canonicalId] };
        }
        
        // Fallback: use variantId if provided, else generate a pseudo-key from the name
        // But if it's a UUID that's not in packagings, show "Unknown Variant"
        if (variantId) {
          if (uuidPattern.test(variantId) && !packagingIdToName[variantId]) {
            return { canonicalId: variantId, canonicalName: 'Unknown Variant' };
          }
          return { canonicalId: variantId, canonicalName: variantNameRaw || 'Default' };
        }
        
        // Last fallback: use the raw name as the key
        return { canonicalId: `name:${variantNameLower || 'default'}`, canonicalName: variantNameRaw || 'Default' };
      };
      
      // Aggregate data
      // For products with purchase_unit = "Piece" or "Packet", use productId only as key (combine all variants)
      // For other products, use productId|variantId as key
      const combinationMap = {}; // key -> data
      
      for (const indent of indents) {
        for (const item of (indent.items || [])) {
          const productId = item.product_id;
          const productInfo = productInfoMap[productId] || {};
          const productName = (productInfo.name || item.product_name || 'Unknown').trim();
          const productNameHi = productInfo.name_hi || '';
          const productNameMr = productInfo.name_mr || '';
          const category = productInfo.category || 'Other';
          
          // Get catalogue info for this product
          const catInfo = catalogueMap[productId] || {};
          const purchaseUnit = catInfo.purchaseUnit || '';
          const purchaseWeightName = catInfo.purchaseWeightName || '';
          const isPieceOrPacket = ['Piece', 'Packet'].includes(purchaseUnit);
          
          // Resolve to canonical variant
          const { canonicalId, canonicalName } = resolveVariant(item.variant_id, item.variant_name);
          
          // Determine aggregation key based on purchase_unit
          let key, displayVariantId, displayVariantName;
          
          if (isPieceOrPacket) {
            // Aggregate all variants for this product
            key = productId;
            displayVariantId = purchaseUnit === 'Piece' ? 'unit_piece' : 'unit_packet';
            displayVariantName = purchaseWeightName 
              ? `${purchaseUnit === 'Piece' ? 'Pieces' : 'Packets'} of ${purchaseWeightName}`
              : (purchaseUnit === 'Piece' ? 'Pieces' : 'Packets');
          } else {
            // Keep variants separate
            key = `${productId}|${canonicalId}`;
            displayVariantId = canonicalId;
            displayVariantName = canonicalName;
          }
          
          if (!combinationMap[key]) {
            combinationMap[key] = {
              productId: productId,
              productName: productName,
              productNameHi: productNameHi,
              productNameMr: productNameMr,
              category: category,
              variantId: displayVariantId,
              variantName: displayVariantName,
              purchaseUnit: purchaseUnit,
              purchaseWeightName: purchaseWeightName,
              totalQuantity: 0,
              aggregationKey: key  // Store the actual key for retailer details lookup
            };
          }
          
          combinationMap[key].totalQuantity += (item.quantity || 0);
        }
      }
      
      // Convert to array and sort by category then product name then variant
      const categoryOrder = { 'Fruits': 1, 'Vegetables': 2, 'Leafy': 3, 'Exotic': 4, 'Other': 5 };
      const indentProductsArray = Object.values(combinationMap).sort((a, b) => {
        const catA = categoryOrder[a.category] || 99;
        const catB = categoryOrder[b.category] || 99;
        if (catA !== catB) return catA - catB;
        const nameCompare = a.productName.localeCompare(b.productName);
        if (nameCompare !== 0) return nameCompare;
        return a.variantName.localeCompare(b.variantName);
      });
      
      // Attach keys to items for lookup
      indentProductsArray.forEach(item => {
        item.key = item.aggregationKey || `${item.productId}|${item.variantId}`;
      });
      
      setMrpIndentProducts(indentProductsArray);
      
    } catch (error) {
      console.error('Failed to load indent products for MRP:', error);
    } finally {
      setMrpIndentLoading(false);
    }
  }, [products, packagings]);

  // Auto-load MRP data and indent products when MRP tab is selected - uses dailyReqDate (shared date picker)
  useEffect(() => {
    if (activeTab === 'dailyRequirement' && dailyReqSubTab === 'stickersMrp' && dailyReqDate && !mrpLoading && !mrpIndentLoading) {
      loadMrpData(dailyReqDate);
      loadMrpIndentProducts(dailyReqDate);
    }
  }, [activeTab, dailyReqSubTab, dailyReqDate]); // Removed function deps to prevent loops

  // Get retail-applicable packagings
  const retailPackagings = useMemo(() => {
    return packagings.filter(p => p.vertical === 'retail' || p.vertical === 'both' || !p.vertical);
  }, [packagings]);

  // Group products by category for MRP - filtered to only products from day's indents
  // Also include products with MRP overrides that aren't in the day's indents
  const mrpProductsByCategory = useMemo(() => {
    // Prefer stickersData which has correct aggregation keys and retailer details
    // Fall back to mrpIndentProducts for backward compatibility
    const productsToShow = stickersData.length > 0 ? [...stickersData] : (mrpIndentProducts.length > 0 ? [...mrpIndentProducts] : []);
    
    // Add products from stickerMrpOverrides that aren't already in the list
    // This allows users to see products they manually added via "Add Product / Override MRP"
    stickerMrpOverrides.forEach(override => {
      const existsInList = productsToShow.some(p => 
        (p.productId === override.product_id || p.product_id === override.product_id) && 
        (p.variantId === override.variant_id || p.variant_id === override.variant_id)
      );
      
      if (!existsInList) {
        // Find product info from products list
        const productInfo = products.find(p => p.id === override.product_id) || {};
        productsToShow.push({
          productId: override.product_id,
          productName: override.product_name || productInfo.name || 'Unknown',
          variantId: override.variant_id,
          variantName: override.variant_name || '',
          category: productInfo.category || 'Others',
          quantity: 0, // No indent quantity since this is an override-only product
          isOverrideOnly: true // Flag to indicate this product has no indents
        });
      }
    });
    
    const grouped = {};
    productsToShow.forEach(p => {
      const cat = p.category || 'Others';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    // Sort products within each category by product name then variant
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => {
        const nameCompare = (a.productName || '').localeCompare(b.productName || '');
        if (nameCompare !== 0) return nameCompare;
        return (a.variantName || '').localeCompare(b.variantName || '');
      });
    });
    return grouped;
  }, [stickersData, mrpIndentProducts, stickerMrpOverrides, products]);

  // Auto-expand categories when indent products load
  useEffect(() => {
    if (mrpIndentProducts.length > 0) {
      const cats = {};
      mrpIndentProducts.forEach(p => {
        cats[p.category || 'Others'] = true;
      });
      setExpandedMrpCategories(cats);
    }
  }, [mrpIndentProducts]);

  // Auto-initialize MRP entries for all indent products that don't have entries yet
  useEffect(() => {
    const autoInitializeMissingEntries = async () => {
      // Skip if already done for this date or still loading or no indent products
      if (mrpAutoInitDone || mrpIndentProducts.length === 0 || mrpLoading || savingMrp || mrpIndentLoading) return;
      
      // Find indent products that don't have MRP entries
      const missingProducts = mrpIndentProducts.filter(item => {
        const hasEntry = mrpData.some(e => 
          e.product_id === item.productId && (
            e.variant_id === (item.variantId || '') ||
            (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
          )
        );
        return !hasEntry;
      });
      
      // Auto-create entries for missing products
      if (missingProducts.length > 0 && canEditMrpForDate(dailyReqDate)) {
        console.log(`Auto-initializing ${missingProducts.length} missing MRP entries`);
        setMrpAutoInitDone(true); // Mark as done to prevent loop
        
        try {
          // Create entries in batch
          const entries = missingProducts.map(item => ({
            product_id: item.productId,
            product_name: item.productName,
            category: item.category,
            variant_id: item.variantId || '',
            variant_name: item.variantName || '',
            mrp: 0,
            blinkit_price: blinkitPrices[item.productId]?.blinkit_price || 0
          }));
          
          // Save all entries
          await api.post('/api/daily-mrp', { date: dailyReqDate, items: [...mrpData.map(e => ({
            product_id: e.product_id,
            product_name: e.product_name,
            category: e.category,
            variant_id: e.variant_id,
            variant_name: e.variant_name,
            mrp: e.mrp,
            blinkit_price: e.blinkit_price || 0
          })), ...entries] });
          
          // Reload MRP data
          await loadMrpData(dailyReqDate);
        } catch (error) {
          console.error('Auto-init failed:', error);
          // Silent fail - user can manually add
        }
      } else {
        setMrpAutoInitDone(true); // No missing products, mark as done
      }
    };
    
    // Delay slightly to ensure all data is loaded
    const timer = setTimeout(autoInitializeMissingEntries, 1000);
    return () => clearTimeout(timer);
  }, [mrpIndentProducts.length, mrpData.length, mrpLoading, savingMrp, mrpIndentLoading, dailyReqDate, mrpAutoInitDone]);


  // Load Blinkit prices
  const loadBlinkitPrices = useCallback(async (pincode = '411045') => {
    setBlinkitLoading(true);
    try {
      const res = await api.get(`/api/blinkit-prices/latest?pincode=${pincode}`);
      setBlinkitPrices(res.data || {});
    } catch (error) {
      console.error('Failed to load Blinkit prices:', error);
      // Don't show error toast - Blinkit prices are optional
    } finally {
      setBlinkitLoading(false);
    }
  }, []);

  // Trigger Blinkit scrape
  const triggerBlinkitScrape = async (pincode = '411045') => {
    setScrapingBlinkit(true);
    try {
      const res = await api.post(`/api/blinkit-prices/scrape?pincode=${pincode}`);
      toast.success(res.data.message || 'Blinkit scrape started');
      // Reload prices after a delay
      setTimeout(() => loadBlinkitPrices(pincode), 5000);
    } catch (error) {
      toast.error('Failed to start Blinkit scrape');
    } finally {
      setScrapingBlinkit(false);
    }
  };

  // Load Blinkit prices when MRP tab is selected
  // Load Blinkit prices when MRP tab is opened (only once per session)
  const [blinkitLoaded, setBlinkitLoaded] = useState(false);
  useEffect(() => {
    if (activeTab === 'dailyRequirement' && dailyReqSubTab === 'stickersMrp' && !blinkitLoaded && !blinkitLoading) {
      loadBlinkitPrices();
      setBlinkitLoaded(true);
      // Also ensure products and packagings are loaded
      if (products.length === 0 || packagings.length === 0) {
        loadBaseData();
      }
    }
  }, [activeTab, dailyReqSubTab, blinkitLoaded, blinkitLoading, products.length, packagings.length]);

  // Update Blinkit price for a product
  const updateBlinkitPrice = async (productId, price) => {
    const priceVal = parseFloat(price) || 0;
    
    // Update local blinkit state immediately
    setBlinkitPrices(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        product_id: productId,
        blinkit_price: priceVal
      }
    }));
    
    // Also update the MRP entries for this product to include blinkit_price
    // This ensures blinkit_price is saved when user clicks "Save MRP"
    const productEntries = mrpData.filter(e => e.product_id === productId);
    if (productEntries.length > 0) {
      productEntries.forEach(entry => {
        const updateData = { ...entry, blinkit_price: priceVal };
        setMrpData(prev => prev.map(e => e.id === entry.id ? updateData : e));
        setPendingMrpChanges(prev => ({
          ...prev,
          [entry.id]: updateData
        }));
      });
      setMrpHasUnsavedChanges(true);
    }
    
    // Save to backend blinkit_prices collection (for reference)
    try {
      const date = getISTDate();
      const product = products.find(p => p.id === productId);
      
      await api.post('/api/blinkit-prices/manual', {
        product_id: productId,
        product_name: product?.name || '',
        category: product?.category || '',
        blinkit_price: priceVal,
        pincode: '411045',
        date: date
      });
    } catch (error) {
      console.error('Failed to save Blinkit price:', error);
    }
  };

  // Get MRP entry for a product
  const getMrpEntry = (productId, variantId = null) => {
    if (variantId) {
      return mrpData.find(e => e.product_id === productId && e.variant_id === variantId);
    }
    return mrpData.filter(e => e.product_id === productId);
  };

  // Add MRP entry for a product (allows same product with different variant)
  const addMrpEntry = async (product, selectedVariantId = null) => {
    // Use indent variants if available
    const indentVariantIds = product.indentVariants || [];
    const allowedPackagings = indentVariantIds.length > 0
      ? retailPackagings.filter(p => indentVariantIds.includes(p.id))
      : retailPackagings;
    
    // Use provided variant or fall back to first indent variant
    let variant;
    if (selectedVariantId) {
      variant = retailPackagings.find(p => p.id === selectedVariantId);
    } else {
      variant = allowedPackagings.length > 0 ? allowedPackagings[0] : retailPackagings[0];
    }
    
    // Check if this product+variant combination already exists in mrpData
    const existingEntry = mrpData.find(e => 
      e.product_id === product.id && e.variant_id === variant?.id
    );
    if (existingEntry) {
      toast.error(`${product.name} (${variant?.name || 'No variant'}) already exists in the list`);
      return;
    }
    
    const newEntry = {
      date: dailyReqDate,
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      variant_id: variant?.id || '',
      variant_name: variant?.name || '',
      mrp: 0
    };
    
    try {
      const res = await api.post('/api/daily-mrp/entry', newEntry);
      setMrpData(prev => [...prev, res.data]);
      toast.success('Entry added');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to add entry';
      toast.error(errorMsg);
    }
  };

  // Add MRP entry from indent product+variant combination
  const addMrpEntryFromIndent = async (indentItem) => {
    // Check if this product+variant combination already exists (check both variant_id and variant_name for robustness)
    const existingEntry = mrpData.find(e => 
      e.product_id === indentItem.productId && (
        e.variant_id === (indentItem.variantId || '') ||
        (e.variant_name || '').toLowerCase() === (indentItem.variantName || '').toLowerCase()
      )
    );
    if (existingEntry) {
      toast.error(`${indentItem.productName} (${indentItem.variantName || 'No variant'}) already exists in the list`);
      return;
    }
    
    const newEntry = {
      date: dailyReqDate,
      product_id: indentItem.productId,
      product_name: indentItem.productName,
      category: indentItem.category,
      variant_id: indentItem.variantId || '',
      variant_name: indentItem.variantName || '',
      mrp: 0
    };
    
    try {
      const res = await api.post('/api/daily-mrp/entry', newEntry);
      setMrpData(prev => [...prev, res.data]);
      toast.success('MRP entry added');
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to add MRP entry';
      toast.error(errorMsg);
    }
  };

  // Update MRP entry (local state only, save with button)
  const updateMrpEntryLocal = (entryId, field, value) => {
    const entry = mrpData.find(e => e.id === entryId);
    if (!entry) return;
    
    let updateData = { ...entry };
    if (field === 'variant_id') {
      // Check if changing to this variant would create a duplicate
      const existingEntry = mrpData.find(e => 
        e.id !== entryId && 
        e.product_id === entry.product_id && 
        e.variant_id === value
      );
      if (existingEntry) {
        toast.error('This product-variant combination already exists');
        return;
      }
      
      const variant = retailPackagings.find(p => p.id === value);
      updateData.variant_id = value;
      updateData.variant_name = variant?.name || '';
    } else if (field === 'variant_name') {
      // Direct variant name edit
      updateData.variant_name = value;
    } else if (field === 'mrp') {
      updateData.mrp = parseFloat(value) || 0;
    }
    
    // Update local state
    setMrpData(prev => prev.map(e => e.id === entryId ? updateData : e));
    
    // Track pending changes
    setPendingMrpChanges(prev => ({
      ...prev,
      [entryId]: updateData
    }));
    setMrpHasUnsavedChanges(true);
  };

  // Save all pending MRP changes
  const saveMrpChanges = async () => {
    if (Object.keys(pendingMrpChanges).length === 0) {
      toast.info('No changes to save');
      return;
    }
    
    // Check for duplicate product+variant combinations
    const allEntries = mrpData.map(e => {
      // Use pending change if exists, otherwise use original
      return pendingMrpChanges[e.id] || e;
    });
    
    const seen = new Set();
    const duplicates = [];
    for (const entry of allEntries) {
      const key = `${entry.product_id}-${entry.variant_id}`;
      if (seen.has(key)) {
        duplicates.push(`${entry.product_name} (${entry.variant_name})`);
      }
      seen.add(key);
    }
    
    if (duplicates.length > 0) {
      toast.error(`Duplicate entries found: ${duplicates.join(', ')}. Please use different variants or remove duplicates.`);
      return;
    }
    
    setSavingMrp(true);
    try {
      // Save all pending changes
      const promises = Object.entries(pendingMrpChanges).map(([entryId, data]) => 
        api.put(`/api/daily-mrp/${entryId}`, data)
      );
      await Promise.all(promises);
      
      setPendingMrpChanges({});
      setMrpHasUnsavedChanges(false);
      toast.success(`Saved ${Object.keys(pendingMrpChanges).length} MRP entries`);
    } catch (error) {
      toast.error('Failed to save some MRP entries');
    } finally {
      setSavingMrp(false);
    }
  };

  // Delete MRP entry
  const deleteMrpEntry = async (entryId) => {
    try {
      await api.delete(`/api/daily-mrp/${entryId}`);
      setMrpData(prev => prev.filter(e => e.id !== entryId));
      // Remove from pending changes if exists
      setPendingMrpChanges(prev => {
        const updated = { ...prev };
        delete updated[entryId];
        return updated;
      });
      toast.success('Entry deleted');
    } catch (error) {
      toast.error('Failed to delete entry');
    }
  };

  // Initialize MRP data for all products with last variants
  const initializeMrpData = async () => {
    setSavingMrp(true);
    try {
      // Use products from day's indents (mrpIndentProducts)
      let productsToUse = mrpIndentProducts;
      
      // If indent products not loaded yet, try to fetch them
      if (!productsToUse || productsToUse.length === 0) {
        // Fetch indents for the dailyReqDate to get unique products
        const indentsRes = await api.get(`/api/retailer-indents?from_date=${dailyReqDate}&to_date=${dailyReqDate}`);
        const allIndents = (indentsRes.data || []).filter(indent => {
          const indentDateStr = (indent.indent_date || '').toString().slice(0, 10);
          return indentDateStr === dailyReqDate;
        });
        
        if (allIndents.length === 0) {
          toast.error('No indents found for this date. Cannot initialize MRP.');
          setSavingMrp(false);
          return;
        }
        
        // Get unique product IDs from indents
        const uniqueProductIds = new Set();
        for (const indent of allIndents) {
          for (const item of (indent.items || [])) {
            if (item.product_id) uniqueProductIds.add(item.product_id);
          }
        }
        
        // Fetch all products if not loaded
        let allProducts = products;
        if (!allProducts || allProducts.length === 0) {
          const productsRes = await api.get('/api/products?include_images=false');
          allProducts = productsRes.data || [];
        }
        
        // Filter to only indent products
        productsToUse = allProducts.filter(p => uniqueProductIds.has(p.id));
      }
      
      if (productsToUse.length === 0) {
        toast.error('No products found in day\'s indents. Please ensure retailers have submitted indents.');
        setSavingMrp(false);
        return;
      }
      
      // Create entries from product+variant combinations (new structure)
      const entries = [];
      productsToUse.forEach(item => {
        // Get Blinkit price if available
        const blinkitEntry = blinkitPrices[item.productId];
        const blinkitPrice = blinkitEntry?.blinkit_price || 0;
        
        entries.push({
          product_id: item.productId,
          product_name: item.productName,
          category: item.category,
          variant_id: item.variantId || '',
          variant_name: item.variantName || '',
          mrp: 0,
          blinkit_price: blinkitPrice
        });
      });
      
      await api.post('/api/daily-mrp', { date: dailyReqDate, items: entries });
      await loadMrpData(dailyReqDate);
      toast.success(`MRP sheet initialized with ${entries.length} product-variant combinations from day's indents`);
    } catch (error) {
      console.error('Initialize MRP error:', error);
      toast.error('Failed to initialize MRP data');
    } finally {
      setSavingMrp(false);
    }
  };

  // Print Stickers & MRP data
  const printStickersMrp = () => {
    // Get the data to print - combine stickersData with any MRP-override-only products
    let productsToShow = stickersData.length > 0 ? [...stickersData] : [];
    
    // Add products from stickerMrpOverrides that aren't already in the list
    stickerMrpOverrides.forEach(override => {
      const existsInList = productsToShow.some(p => 
        p.productId === override.product_id && p.variantId === override.variant_id
      );
      
      if (!existsInList) {
        const productInfo = products.find(p => p.id === override.product_id) || {};
        productsToShow.push({
          productId: override.product_id,
          productName: override.product_name || productInfo.name || 'Unknown',
          variantId: override.variant_id,
          variantName: override.variant_name || '',
          category: productInfo.category || 'Others',
          quantity: 0,
          purchaseUnit: '',
          isOverrideOnly: true
        });
      }
    });
    
    if (productsToShow.length === 0) {
      toast.error('No data to print. Please select a date with indents or add products.');
      return;
    }
    
    // Create print content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }
    
    // Group by category
    const byCategory = productsToShow.reduce((acc, item) => {
      const category = item.category || 'Uncategorized';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});
    
    // Calculate totals - stickersData uses 'quantity' not 'sticker_count'
    const totalStickers = productsToShow.reduce((sum, p) => sum + (p.quantity || 0), 0);
    
    let tableRows = '';
    let rowNum = 1;
    
    Object.keys(byCategory).sort().forEach(category => {
      const categoryProducts = byCategory[category];
      // Category header row
      tableRows += `
        <tr style="background-color: #f3f4f6;">
          <td colspan="5" style="padding: 8px; font-weight: bold; border: 1px solid #e5e7eb;">${category} (${categoryProducts.length})</td>
        </tr>
      `;
      
      categoryProducts.forEach(product => {
        // stickersData uses productId/variantId, mrpData uses product_id/variant_id
        const mrpEntry = mrpData.find(m => m.product_id === product.productId && m.variant_id === product.variantId);
        // Also check stickerMrpOverrides for saved MRP
        const overrideEntry = stickerMrpOverrides.find(o => o.product_id === product.productId && o.variant_id === product.variantId);
        const mrpValue = overrideEntry?.mrp || mrpEntry?.mrp || '-';
        // stickersData uses 'quantity' for sticker count
        const stickerCount = product.quantity || 0;
        // Determine unit based on purchaseUnit or default to Kg
        const unit = product.purchaseUnit === 'Piece' ? 'Pcs' : (product.purchaseUnit === 'Packet' ? 'Pkt' : (product.purchaseUnit || 'Kg'));
        
        tableRows += `
          <tr>
            <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${rowNum++}</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb;">${product.productName || 'Unknown'}${product.variantName ? ` (${product.variantName})` : ''}</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; font-weight: bold; font-size: 16px;">${stickerCount}</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold;">₹${mrpValue}</td>
            <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${unit}</td>
          </tr>
        `;
      });
    });
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stickers & MRP - ${dailyReqDate}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 20px; margin-bottom: 5px; }
          h2 { font-size: 14px; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #14532D; color: white; padding: 10px; text-align: left; border: 1px solid #14532D; }
          .summary { margin-top: 20px; padding: 15px; background-color: #f0fdf4; border-radius: 8px; }
          .summary-item { display: inline-block; margin-right: 30px; }
          .summary-label { color: #666; font-size: 12px; }
          .summary-value { font-size: 24px; font-weight: bold; color: #14532D; }
          @media print {
            body { padding: 10px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>🏷️ Stickers & MRP List</h1>
        <h2>Date: ${dailyReqDate} • Total Products: ${productsToShow.length}</h2>
        
        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">Total Stickers Required</div>
            <div class="summary-value">${totalStickers}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Categories</div>
            <div class="summary-value">${Object.keys(byCategory).length}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">#</th>
              <th>Product</th>
              <th style="width: 100px; text-align: center;">Stickers</th>
              <th style="width: 100px; text-align: right;">MRP</th>
              <th style="width: 80px; text-align: center;">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background-color: #14532D; color: white; font-weight: bold;">
              <td colspan="2" style="padding: 10px; border: 1px solid #14532D;">TOTAL</td>
              <td style="padding: 10px; border: 1px solid #14532D; text-align: center; font-size: 18px;">${totalStickers}</td>
              <td colspan="2" style="padding: 10px; border: 1px solid #14532D;"></td>
            </tr>
          </tfoot>
        </table>
        
        <div style="margin-top: 30px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 30px; background-color: #14532D; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">
            🖨️ Print
          </button>
        </div>
        
        <p style="margin-top: 20px; font-size: 11px; color: #999; text-align: center;">
          Generated on ${new Date().toLocaleString()} • Mr Organix
        </p>
      </body>
      </html>
    `;
    
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Copy MRP from previous date
  const copyMrpFromPreviousDate = async () => {
    setSavingMrp(true);
    try {
      // Get previous date
      const prevDate = new Date(dailyReqDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      
      // Fetch previous date's MRP data
      const prevRes = await api.get(`/api/daily-mrp?date=${prevDateStr}`);
      const prevData = prevRes.data || [];
      
      if (prevData.length === 0) {
        toast.error(`No MRP data found for ${prevDateStr}`);
        setSavingMrp(false);
        return;
      }
      
      // Create entries for current date based on previous date
      // Note: blinkit_price from previous date is copied, user can update with fresh fetch
      const entries = prevData.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        category: item.category,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        mrp: item.mrp,
        blinkit_price: item.blinkit_price || 0
      }));
      
      await api.post('/api/daily-mrp', { date: dailyReqDate, items: entries });
      await loadMrpData(dailyReqDate);
      toast.success(`Copied ${entries.length} MRP entries from ${prevDateStr}`);
    } catch (error) {
      console.error('Failed to copy MRP data:', error);
      toast.error('Failed to copy MRP from previous date');
    } finally {
      setSavingMrp(false);
    }
  };

  // Translation labels for Daily Requirement PDF/Excel
  const dailyReqTranslations = {
    en: {
      title: 'Daily Purchase Requirement',
      date: 'Date',
      retailer: 'Retailer',
      allRetailers: 'All Retailers',
      calculatedFrom: 'Calculated from indents',
      serial: '#',
      productName: 'Product Name',
      qtyUnits: 'Qty (Units)',
      purchaseReq: 'Purchase Req',
      purchasePrice: 'Required PP/Kg',
      quantity: 'Quantity (Kg)',
      remarks: 'Remarks',
      total: 'TOTAL',
      generatedOn: 'Generated on',
      pieces: 'Pcs',
      packets: 'Pkts',
      bunches: 'Bunches',
      dozens: 'Dozens',
      of: 'of',
      kg: 'Kg',
    },
    hi: {
      title: 'दैनिक खरीद आवश्यकता',
      date: 'दिनांक',
      retailer: 'रिटेलर',
      allRetailers: 'सभी रिटेलर',
      calculatedFrom: 'इंडेंट से गणना',
      serial: 'क्र.',
      productName: 'उत्पाद का नाम',
      qtyUnits: 'मात्रा (इकाई)',
      purchaseReq: 'खरीद आवश्यकता',
      purchasePrice: 'आवश्यक खरीद मूल्य/किलो',
      quantity: 'मात्रा (किलो)',
      remarks: 'टिप्पणी',
      total: 'कुल',
      generatedOn: 'जनरेट किया गया',
      pieces: 'पीस',
      packets: 'पैकेट',
      bunches: 'गुच्छे',
      dozens: 'दर्जन',
      of: 'का',
      kg: 'किलो',
    },
    mr: {
      title: 'दैनिक खरेदी आवश्यकता',
      date: 'दिनांक',
      retailer: 'रिटेलर',
      allRetailers: 'सर्व रिटेलर',
      calculatedFrom: 'इंडेंटवरून गणना',
      serial: 'क्र.',
      productName: 'उत्पादाचे नाव',
      qtyUnits: 'प्रमाण (युनिट)',
      purchaseReq: 'खरेदी आवश्यकता',
      purchasePrice: 'आवश्यक खरेदी किंमत/किलो',
      quantity: 'प्रमाण (किलो)',
      remarks: 'टीप',
      total: 'एकूण',
      generatedOn: 'तयार केले',
      pieces: 'नग',
      packets: 'पॅकेट',
      bunches: 'जुडे',
      dozens: 'डझन',
      of: 'चे',
      kg: 'किलो',
    }
  };

  // Print daily requirement
  const printDailyRequirement = () => {
    const printContent = document.getElementById('daily-requirement-print');
    if (!printContent) return;
    
    const lang = dailyReqPrintLang;
    const labels = dailyReqTranslations[lang] || dailyReqTranslations.en;
    
    // Build a fresh product translation map from the current products list
    // This ensures we use the LATEST translations even if dailyReqData has old/no translations
    const productTranslationMap = {};
    products.forEach(p => {
      productTranslationMap[p.id] = {
        name: p.name,
        name_hi: p.name_hi || '',
        name_mr: p.name_mr || ''
      };
      // Also map by name for fallback matching
      productTranslationMap[p.name?.toLowerCase()] = {
        name: p.name,
        name_hi: p.name_hi || '',
        name_mr: p.name_mr || ''
      };
    });
    
    // Get display name based on selected print language - using FRESH translations from products
    const getDisplayName = (item) => {
      // First try to get fresh translation from products by ID
      let freshTranslation = productTranslationMap[item.productId];
      // Fallback to name matching if ID not found
      if (!freshTranslation && item.productName) {
        freshTranslation = productTranslationMap[item.productName.toLowerCase()];
      }
      
      // Use fresh translation if available, otherwise fall back to item's stored translation
      const nameHi = freshTranslation?.name_hi || item.productNameHi || '';
      const nameMr = freshTranslation?.name_mr || item.productNameMr || '';
      
      if (lang === 'hi' && nameHi) return nameHi;
      if (lang === 'mr' && nameMr) return nameMr;
      if ((lang === 'hi' || lang === 'mr') && !nameHi && !nameMr) {
        return `${item.productName} *`;
      }
      return item.productName;
    };
    
    // Get purchase requirement display text based on purchase unit
    const getPurchaseReqDisplay = (item) => {
      const unitQty = Math.round(item.qtyUnits) || 0;
      const kgQty = (item.requirementKg || 0).toFixed(1);
      const dozenQty = item.qtyDozens > 0 ? Math.ceil(item.qtyDozens) : Math.round(item.qtyUnits);
      
      if (item.purchaseUnit === 'Piece') {
        const weightInfo = item.purchaseWeightName ? ` ${labels.of} ${item.purchaseWeightName}` : '';
        return `${unitQty} ${labels.pieces}${weightInfo}`;
      } else if (item.purchaseUnit === 'Packet') {
        const weightInfo = item.purchaseWeightName ? ` ${labels.of} ${item.purchaseWeightName}` : '';
        return `${unitQty} ${labels.packets}${weightInfo}`;
      } else if (item.purchaseUnit === 'Bunch') {
        const weightInfo = item.purchaseWeightName ? ` ${labels.of} ${item.purchaseWeightName}` : '';
        return `${unitQty} ${labels.bunches}${weightInfo}`;
      } else if (item.purchaseUnit === 'Dozen' || item.qtyDozens > 0) {
        // Show dozens if explicitly set OR if calculated dozens > 0
        return `${dozenQty} ${labels.dozens}`;
      } else {
        return `${kgQty} ${labels.kg}`;
      }
    };
    
    // Count missing translations - using fresh product data
    const missingTranslations = dailyReqData.filter(item => {
      let freshTranslation = productTranslationMap[item.productId];
      if (!freshTranslation && item.productName) {
        freshTranslation = productTranslationMap[item.productName.toLowerCase()];
      }
      const nameHi = freshTranslation?.name_hi || item.productNameHi || '';
      const nameMr = freshTranslation?.name_mr || item.productNameMr || '';
      
      if (lang === 'hi') return !nameHi;
      if (lang === 'mr') return !nameMr;
      return false;
    }).length;
    
    // Date locale based on selected language
    const dateLocale = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
    const formattedDate = new Date(dailyReqDate).toLocaleDateString(dateLocale, { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${labels.title} - ${dailyReqDate}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 5px; }
            h2 { text-align: center; color: #666; margin-top: 0; }
            p.info { text-align: center; font-size: 12px; color: #888; margin: 5px 0; }
            .missing-note { text-align: center; font-size: 11px; color: #c00; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #333; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .purchase-req { font-weight: bold; color: #1a56db; }
            .footer { margin-top: 30px; text-align: right; font-size: 12px; color: #666; }
            @media print { 
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>${labels.title}</h1>
          <h2>${labels.date}: ${formattedDate}</h2>
          ${dailyReqRetailer 
            ? `<p style="text-align:center;">${labels.retailer}: ${retailers.find(r => r.id === dailyReqRetailer)?.company_name || retailers.find(r => r.id === dailyReqRetailer)?.name || labels.allRetailers}</p>` 
            : `<p style="text-align:center;">${labels.allRetailers}</p>`}
          <p class="info">${labels.calculatedFrom}</p>
          ${missingTranslations > 0 ? `<p class="missing-note">* ${missingTranslations} product(s) missing ${lang === 'hi' ? 'Hindi' : 'Marathi'} translation</p>` : ''}
          ${(() => {
            // Group items by category
            const categoryOrderLocal = { 'Vegetables': 1, 'Fruits': 2, 'Exotic': 3, 'Sprouts': 4, 'Other': 99 };
            const groups = {};
            dailyReqData.forEach(item => {
              const cat = item.category || 'Other';
              if (!groups[cat]) groups[cat] = [];
              groups[cat].push(item);
            });
            const sortedCategories = Object.keys(groups).sort((a, b) => 
              (categoryOrderLocal[a] || 99) - (categoryOrderLocal[b] || 99)
            );
            
            let globalIdx = 0;
            return sortedCategories.map(category => {
              const items = groups[category];
              const categoryTotal = items.reduce((sum, item) => sum + (item.requirementKg || 0), 0);
              
              return `
                <h3 style="margin-top: 20px; margin-bottom: 5px; background-color: #e8f5e9; padding: 8px; border-radius: 4px; color: #1b5e20;">
                  ${category} (${items.length} items)
                </h3>
                <table>
                  <thead>
                    <tr>
                      <th style="width:5%">${labels.serial}</th>
                      <th style="width:35%">${labels.productName}</th>
                      <th style="width:22%" class="text-center">${labels.purchaseReq}</th>
                      <th style="width:12%" class="text-center">${labels.purchasePrice}</th>
                      <th style="width:26%">${labels.remarks}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map((item) => {
                      globalIdx++;
                      const ppDisplay = item.purchasePrice ? `₹${parseFloat(item.purchasePrice).toFixed(2)}` : '-';
                      return `
                        <tr>
                          <td class="text-center">${globalIdx}</td>
                          <td>${getDisplayName(item)}</td>
                          <td class="text-center purchase-req">${getPurchaseReqDisplay(item)}</td>
                          <td class="text-center" style="color: #15803d; font-weight: 600;">${ppDisplay}</td>
                          <td>${item.remarks || '-'}</td>
                        </tr>
                      `;
                    }).join('')}
                    <tr style="font-weight:bold; background-color:#f0f9f0;">
                      <td colspan="2">${category} ${labels.total}</td>
                      <td class="text-center">${categoryTotal.toFixed(2)} ${labels.kg}</td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              `;
            }).join('');
          })()}
          <div style="margin-top: 20px; padding: 10px; background-color: #f5f5f5; border-radius: 4px; text-align: center;">
            <strong>Grand ${labels.total}: ${dailyReqData.reduce((sum, item) => sum + (item.requirementKg || 0), 0).toFixed(2)} ${labels.kg}</strong>
          </div>
          <div class="footer">
            ${labels.generatedOn}: ${new Date().toLocaleString(dateLocale)} | Mr Organix
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Export Daily Requirement to Excel
  const exportDailyReqToExcel = () => {
    if (dailyReqData.length === 0) {
      toast.error('No data to export');
      return;
    }
    
    const lang = dailyReqPrintLang;
    const labels = dailyReqTranslations[lang] || dailyReqTranslations.en;
    
    // Build a fresh product translation map from the current products list
    const productTranslationMap = {};
    products.forEach(p => {
      productTranslationMap[p.id] = {
        name: p.name,
        name_hi: p.name_hi || '',
        name_mr: p.name_mr || ''
      };
      productTranslationMap[p.name?.toLowerCase()] = {
        name: p.name,
        name_hi: p.name_hi || '',
        name_mr: p.name_mr || ''
      };
    });
    
    // Get display name based on selected print language - using FRESH translations
    const getDisplayName = (item) => {
      let freshTranslation = productTranslationMap[item.productId];
      if (!freshTranslation && item.productName) {
        freshTranslation = productTranslationMap[item.productName.toLowerCase()];
      }
      
      const nameHi = freshTranslation?.name_hi || item.productNameHi || '';
      const nameMr = freshTranslation?.name_mr || item.productNameMr || '';
      
      if (lang === 'hi' && nameHi) return nameHi;
      if (lang === 'mr' && nameMr) return nameMr;
      if ((lang === 'hi' || lang === 'mr') && !nameHi && !nameMr) {
        return `${item.productName} *`;
      }
      return item.productName;
    };
    
    // Get purchase requirement display text based on purchase unit
    const getPurchaseReqDisplay = (item) => {
      const unitQty = Math.round(item.qtyUnits) || 0;
      const kgQty = (item.requirementKg || 0).toFixed(1);
      const dozenQty = item.qtyDozens > 0 ? Math.ceil(item.qtyDozens) : Math.round(item.qtyUnits);
      
      if (item.purchaseUnit === 'Piece') {
        const weightInfo = item.purchaseWeightName ? ` ${labels.of} ${item.purchaseWeightName}` : '';
        return `${unitQty} ${labels.pieces}${weightInfo}`;
      } else if (item.purchaseUnit === 'Packet') {
        const weightInfo = item.purchaseWeightName ? ` ${labels.of} ${item.purchaseWeightName}` : '';
        return `${unitQty} ${labels.packets}${weightInfo}`;
      } else if (item.purchaseUnit === 'Bunch') {
        const weightInfo = item.purchaseWeightName ? ` ${labels.of} ${item.purchaseWeightName}` : '';
        return `${unitQty} ${labels.bunches}${weightInfo}`;
      } else if (item.purchaseUnit === 'Dozen' || item.qtyDozens > 0) {
        // Show dozens if explicitly set OR if calculated dozens > 0
        return `${dozenQty} ${labels.dozens}`;
      } else {
        return `${kgQty} ${labels.kg}`;
      }
    };
    
    // Prepare CSV content - Serial#, Product Name, Purchase Req, Required PP/Kg, Remarks
    const headers = [labels.serial, labels.productName, labels.purchaseReq, labels.purchasePrice, labels.remarks];
    const rows = dailyReqData.map((item, idx) => [
      idx + 1,
      getDisplayName(item),
      getPurchaseReqDisplay(item),
      item.purchasePrice ? `₹${parseFloat(item.purchasePrice).toFixed(2)}` : '',
      item.remarks || ''
    ]);
    
    // Add totals row
    rows.push([
      '',
      labels.total,
      `${dailyReqData.reduce((sum, item) => sum + (item.requirementKg || 0), 0).toFixed(2)} ${labels.kg}`,
      '',
      ''
    ]);
    
    // Convert to CSV
    const csvContent = [
      `${labels.title} - ${dailyReqDate}`,
      '',
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create blob and download with BOM for proper Unicode support
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchase_Requirement_${dailyReqDate}_${lang}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Excel file downloaded');
  };

  // Delete row from daily requirement
  const deleteRequirementRow = (idx) => {
    const newData = dailyReqData.filter((_, i) => i !== idx);
    setDailyReqData(newData);
    setDailyReqSaved(false);
    toast.success('Row deleted');
  };

  // Update Kg field (bidirectional recalculation)
  const updateKgRequired = (idx, value) => {
    const newData = [...dailyReqData];
    const kg = parseFloat(value) || 0;
    newData[idx].kgRequired = kg;
    // Recalculate total kg
    newData[idx].totalKgRequired = parseFloat((kg + (newData[idx].estWastageKg || 0)).toFixed(2));
    // Recalculate amount if rate is set
    if (newData[idx].ratePerKg) {
      newData[idx].amountPaid = (kg * parseFloat(newData[idx].ratePerKg)).toFixed(2);
    }
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Bidirectional Rate -> Amount
  const updateRatePerKg = (idx, value) => {
    const newData = [...dailyReqData];
    newData[idx].ratePerKg = value;
    if (value && newData[idx].kgRequired) {
      newData[idx].amountPaid = (parseFloat(value) * newData[idx].kgRequired).toFixed(2);
    }
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Bidirectional Amount -> Rate
  const updateAmountPaid = (idx, value) => {
    const newData = [...dailyReqData];
    newData[idx].amountPaid = value;
    if (value && newData[idx].kgRequired > 0) {
      newData[idx].ratePerKg = (parseFloat(value) / newData[idx].kgRequired).toFixed(2);
    }
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Update Purchase Price (required purchase price per kg)
  const updatePurchasePrice = (idx, value) => {
    const newData = [...dailyReqData];
    newData[idx].purchasePrice = value === '' ? '' : parseFloat(value) || 0;
    setDailyReqData(newData);
    setDailyReqSaved(false);
  };

  // Save daily requirement
  const saveDailyRequirement = async () => {
    if (dailyReqData.length === 0) {
      toast.error('No data to save');
      return;
    }
    
    setDailyReqSaving(true);
    try {
      const payload = {
        requirement_date: dailyReqDate,
        retailer_id: dailyReqRetailer || null,
        retailer_name: dailyReqRetailer 
          ? retailers.find(r => r.id === dailyReqRetailer)?.company_name || retailers.find(r => r.id === dailyReqRetailer)?.name || 'All Retailers'
          : 'All Retailers',
        items: dailyReqData.map(item => ({
          product_id: item.productId,
          product_name: item.productName,
          product_name_hi: item.productNameHi || '',
          product_name_mr: item.productNameMr || '',
          category: item.category || 'Other',
          qty_units: item.qtyUnits,
          qty_kg: item.qtyKg,
          wastage_pct: item.wastagePct,
          requirement_kg: item.requirementKg,
          remarks: item.remarks || ''
        })),
        total_qty_units: dailyReqData.reduce((sum, item) => sum + item.qtyUnits, 0),
        total_qty_kg: dailyReqData.reduce((sum, item) => sum + item.qtyKg, 0),
        total_requirement_kg: dailyReqData.reduce((sum, item) => sum + item.requirementKg, 0)
      };
      
      await api.post('/api/retailer-daily-requirement', payload);
      setDailyReqSaved(true);
      toast.success('Daily requirement saved successfully!');
    } catch (error) {
      console.error('Failed to save daily requirement:', error);
      toast.error('Failed to save daily requirement');
    } finally {
      setDailyReqSaving(false);
    }
  };

  // ==================== DISPATCH HANDLERS ====================
  
  // Helper function to calculate remaining quantities for an indent
  const getIndentRemainingQtys = (indent) => {
    // Get all dispatches for this indent
    const indentDispatches = dispatches.filter(d => d.indent_id === indent.id);
    
    // Calculate total dispatched per product using product_id + variant_id for precise matching
    const totalDispatchedPrecise = {}; // key: product_id_variant_id
    const totalDispatchedProduct = {}; // key: product_id only (fallback)
    for (const dispatch of indentDispatches) {
      for (const item of (dispatch.items || [])) {
        // Precise key with variant
        const preciseKey = `${item.product_id}_${item.variant_id || item.indent_variant_id || ''}`;
        totalDispatchedPrecise[preciseKey] = (totalDispatchedPrecise[preciseKey] || 0) + (item.supplied_qty || 0);
        // Fallback key with product only
        const productKey = item.product_id;
        totalDispatchedProduct[productKey] = (totalDispatchedProduct[productKey] || 0) + (item.supplied_qty || 0);
      }
    }
    
    // Calculate remaining for each indent item
    const remainingItems = [];
    for (const item of (indent.items || [])) {
      // Try precise key first, then fallback to product-only key
      const preciseKey = `${item.product_id}_${item.variant_id || ''}`;
      const productKey = item.product_id;
      const dispatched = totalDispatchedPrecise[preciseKey] !== undefined 
        ? totalDispatchedPrecise[preciseKey] 
        : (totalDispatchedProduct[productKey] || 0);
      const remaining = (item.quantity || 0) - dispatched;
      
      // Skip items that are marked as done (even if they have remaining qty)
      if (item.marked_done) {
        continue;
      }
      
      if (remaining > 0) {
        remainingItems.push({
          ...item,
          dispatched_qty: dispatched,
          remaining_qty: remaining
        });
      }
    }
    
    return remainingItems;
  };
  
  const openDispatchModal = async (indent, dispatchRemaining = false) => {
    setSelectedIndent(indent);
    setEditingDispatch(null);
    
    // Get today's date for MRP lookup (IST timezone)
    const dispatchDate = getISTDate();
    
    // Fetch MRP data for the dispatch date
    let mrpMap = {};
    try {
      const mrpRes = await api.get(`/api/daily-mrp/for-dispatch?date=${dispatchDate}`);
      mrpMap = mrpRes.data || {};
    } catch (error) {
      console.error('Failed to fetch MRP data:', error);
    }
    
    // Get items with remaining quantities if dispatching remaining
    let itemsToDispatch = indent.items;
    if (dispatchRemaining || indent.status === 'partial') {
      const remainingItems = getIndentRemainingQtys(indent);
      if (remainingItems.length === 0) {
        toast.info('All items have been fully dispatched');
        return;
      }
      itemsToDispatch = remainingItems.map(item => ({
        ...item,
        quantity: item.remaining_qty  // Use remaining as the indent quantity
      }));
    }
    
    // Sort items by category, product_type (for vegetables), and product name to match the print order
    const categoryOrder = ['Vegetables', 'Fruits', 'Exotic', 'Sprouts', 'Others'];
    const vegetableTypeOrder = ['Hard', 'Semi-hard', 'Leafy', 'Others'];
    
    const sortedItemsToDispatch = [...itemsToDispatch].sort((a, b) => {
      // Get product info for each item
      const productA = products.find(p => p.id === a.product_id || p.name?.toLowerCase() === a.product_name?.toLowerCase());
      const productB = products.find(p => p.id === b.product_id || p.name?.toLowerCase() === b.product_name?.toLowerCase());
      const catA = productA?.category || 'Others';
      const catB = productB?.category || 'Others';
      
      // Compare by category order first
      const catIndexA = categoryOrder.indexOf(catA) === -1 ? 99 : categoryOrder.indexOf(catA);
      const catIndexB = categoryOrder.indexOf(catB) === -1 ? 99 : categoryOrder.indexOf(catB);
      if (catIndexA !== catIndexB) return catIndexA - catIndexB;
      
      // For Vegetables, also compare by product_type
      if (catA === 'Vegetables' && catB === 'Vegetables') {
        const typeA = productA?.product_type || 'Others';
        const typeB = productB?.product_type || 'Others';
        const typeIndexA = vegetableTypeOrder.indexOf(typeA) === -1 ? 99 : vegetableTypeOrder.indexOf(typeA);
        const typeIndexB = vegetableTypeOrder.indexOf(typeB) === -1 ? 99 : vegetableTypeOrder.indexOf(typeB);
        if (typeIndexA !== typeIndexB) return typeIndexA - typeIndexB;
      }
      
      // Then compare alphabetically by product name
      return (a.product_name || '').localeCompare(b.product_name || '');
    });
    
    setDispatchForm({
      dispatch_date: dispatchDate,
      items: sortedItemsToDispatch.map(item => {
        // Look up variant_id from variant_name if not set
        let variantId = item.variant_id;
        let variantName = item.variant_name || '';
        
        // Check if this is a unit-based variant (Pieces/Packets) that needs weight lookup
        const isUnitVariant = variantId === 'unit_piece' || variantId === 'unit_packet' || 
                              variantName.toLowerCase() === 'pieces' || variantName.toLowerCase() === 'packets';
        
        // Store the original unit variant for MRP lookup (pieces/packets have their own MRP)
        const mrpVariantId = isUnitVariant ? (variantId || 'unit_piece') : variantId;
        
        // If variant is unit-based, look up the actual weight variant from catalogue for display
        if (isUnitVariant) {
          const catalogueEntry = retailerCatalogue.find(c => 
            c.product_id === item.product_id || 
            (c.product_name && item.product_name && c.product_name.toLowerCase() === item.product_name.toLowerCase())
          );
          
          if (catalogueEntry) {
            // Get the weight variant from catalogue
            const purchaseWeights = catalogueEntry.purchase_weights || [];
            const purchaseWeightVariant = catalogueEntry.purchase_weight_variant;
            
            if (purchaseWeights.length > 0) {
              variantId = purchaseWeights[0];
              const weightInfo = packagings.find(p => p.id === variantId);
              if (weightInfo) variantName = weightInfo.name;
            } else if (purchaseWeightVariant) {
              variantId = purchaseWeightVariant;
              const weightInfo = packagings.find(p => p.id === variantId);
              if (weightInfo) variantName = weightInfo.name;
            }
          }
        } else if (!variantId && variantName) {
          // Normal variant name lookup
          const matchingVariant = packagings.find(p => p.name === variantName);
          if (matchingVariant) {
            variantId = matchingVariant.id;
          }
        }
        
        // Lookup MRP from the daily MRP table using product_id + mrpVariantId
        // For unit-based products (pieces/packets), use the original unit variant for MRP lookup
        const mrpKey = `${item.product_id}_${mrpVariantId || variantId || ''}`;
        const mrpValue = mrpMap[mrpKey] || 0;
        
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: variantId || '',
          variant_name: variantName,
          indent_variant_id: item.variant_id || '',  // Store original indent variant_id for matching
          indent_qty: item.quantity || item.remaining_qty,
          supplied_qty: '',  // Empty by default - user fills only what they dispatch
          mrp: mrpValue,
          total_value: 0,
          marked_done: false  // Checkbox for marking supply as complete
        };
      }),
      remarks: '',
      transport_charges: 0
    });
    setShowDispatchModal(true);
  };

  const openEditDispatchModal = (dispatch) => {
    setSelectedIndent(null);
    setEditingDispatch(dispatch);
    setDispatchForm({
      dispatch_date: dispatch.dispatch_date?.split('T')[0] || getISTDate(),
      items: dispatch.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        variant_name: item.variant_name,
        indent_qty: item.indent_qty,
        supplied_qty: item.supplied_qty,
        mrp: item.mrp,
        total_value: item.total_value
      })),
      remarks: dispatch.remarks || '',
      transport_charges: dispatch.transport_charges || 0
    });
    setShowDispatchModal(true);
  };

  const updateDispatchItem = (index, field, value) => {
    setDispatchForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      items[index].total_value = items[index].supplied_qty * items[index].mrp;
      
      // Auto-check/uncheck "Done" based on supplied qty vs indent qty
      if (field === 'supplied_qty') {
        const suppliedQty = parseFloat(value) || 0;
        const indentQty = parseFloat(items[index].indent_qty) || 0;
        if (suppliedQty >= indentQty && suppliedQty > 0) {
          items[index].marked_done = true;
        } else {
          // Auto-uncheck if quantity is reduced below indent qty
          items[index].marked_done = false;
        }
      }
      
      return { ...prev, items };
    });
  };

  const handleCreateOrUpdateDispatch = async (e) => {
    e.preventDefault();
    
    // Filter items with supplied qty > 0
    const itemsWithQty = dispatchForm.items.filter(item => item.supplied_qty && parseFloat(item.supplied_qty) > 0);
    
    if (itemsWithQty.length === 0) {
      toast.error('Please enter supplied quantity for at least one item');
      return;
    }
    
    if (itemsWithQty.some(item => !item.mrp || item.mrp <= 0)) {
      toast.error('MRP is mandatory for all dispatched items');
      return;
    }

    try {
      if (editingDispatch) {
        // Update existing dispatch
        await api.put(`/api/retailer-dispatches/${editingDispatch.id}`, {
          indent_id: editingDispatch.indent_id,
          dispatch_date: new Date(dispatchForm.dispatch_date).toISOString(),
          items: itemsWithQty,  // Only send items with qty > 0
          remarks: dispatchForm.remarks,
          transport_charges: dispatchForm.transport_charges || 0
        });
        toast.success('Dispatch updated successfully');
      } else {
        // Create new dispatch
        await api.post('/api/retailer-dispatches', {
          indent_id: selectedIndent.id,
          dispatch_date: new Date(dispatchForm.dispatch_date).toISOString(),
          items: itemsWithQty,  // Only send items with qty > 0
          remarks: dispatchForm.remarks,
          transport_charges: dispatchForm.transport_charges || 0
        });
        toast.success('Dispatch created successfully');
        
        // Mark items as done if they have the checkbox checked
        const doneItems = dispatchForm.items
          .filter(item => item.marked_done)
          .map(item => ({ product_id: item.product_id, variant_id: item.variant_id || '' }));
        
        if (doneItems.length > 0) {
          try {
            await api.post(`/api/retailer-indents/${selectedIndent.id}/mark-items-done`, {
              done_items: doneItems
            });
          } catch (markError) {
            console.error('Failed to mark items as done:', markError);
            // Don't show error to user, dispatch was successful
          }
        }
      }
      setShowDispatchModal(false);
      setSelectedIndent(null);
      setEditingDispatch(null);
      loadIndents();
      loadDispatches();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save dispatch');
    }
  };

  const handleDeleteDispatch = async (dispatchId) => {
    if (!window.confirm('Are you sure you want to delete this dispatch?')) return;
    try {
      await api.delete(`/api/retailer-dispatches/${dispatchId}`);
      toast.success('Dispatch deleted');
      loadDispatches();
      loadIndents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete dispatch');
    }
  };

  // ==================== INVOICE HANDLERS ====================
  const openInvoiceModal = async () => {
    if (!invoiceForm.retailer_id) {
      toast.error('Please select a retailer first');
      return;
    }
    try {
      const response = await api.get(`/api/retailer-dispatches/uninvoiced?retailer_id=${invoiceForm.retailer_id}`);
      setUninvoicedDispatches(response.data);
      
      // Get rejections for this retailer to match with dispatch items
      const rejectionsRes = await api.get(`/api/retailer-rejections?retailer_id=${invoiceForm.retailer_id}`);
      const allRejections = rejectionsRes.data || [];
      
      // Create a map of rejections by product_id AND date for accurate matching
      // Rejections should only apply to dispatches on the same date
      const rejectionsByProductAndDate = {};
      allRejections.forEach(r => {
        // Extract just the date part (YYYY-MM-DD) from rejection_date
        const rejectionDateStr = r.rejection_date?.split('T')[0] || '';
        // Key by both product_id and date to prevent cross-date matching
        const key = `${r.product_id}_${rejectionDateStr}`;
        if (!rejectionsByProductAndDate[key]) {
          rejectionsByProductAndDate[key] = [];
        }
        rejectionsByProductAndDate[key].push({
          quantity: r.quantity,
          date: r.rejection_date,
          reason: r.reason,
          mrp: r.mrp,
          dispatch_id: r.dispatch_id
        });
      });
      
      // Flatten all items from uninvoiced dispatches for item-level selection
      const allItems = [];
      response.data.forEach(dispatch => {
        // Extract dispatch date for matching
        const dispatchDateStr = dispatch.dispatch_date?.split('T')[0] || '';
        
        (dispatch.items || []).forEach((item, idx) => {
          // Find rejections for this product ON THE SAME DATE as the dispatch
          const matchKey = `${item.product_id}_${dispatchDateStr}`;
          const productRejections = rejectionsByProductAndDate[matchKey] || [];
          const totalRejectedQty = productRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
          const netQty = Math.max(0, (item.supplied_qty || 0) - totalRejectedQty);
          const netValue = netQty * (item.mrp || 0);
          
          allItems.push({
            dispatch_id: dispatch.id,
            dispatch_date: dispatch.dispatch_date,
            dispatch_created_at: dispatch.created_at,  // Actual timestamp when dispatch was created
            item_index: idx,
            item_id: `${dispatch.id}_${idx}`,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_name: item.variant_name,
            indent_qty: item.indent_qty,
            supplied_qty: item.supplied_qty,
            rejected_qty: totalRejectedQty,
            rejections: productRejections,
            net_qty: netQty,
            mrp: item.mrp,
            total_value: item.total_value,
            net_value: netValue
          });
        });
      });
      setUninvoicedItems(allItems);
      setSelectedItemIds([]);
      setShowInvoiceModal(true);
    } catch (error) {
      toast.error('Failed to load uninvoiced dispatches');
    }
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItemIds(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectAllItems = () => {
    setSelectedItemIds(uninvoicedItems.map(i => i.item_id));
  };

  const toggleDispatchSelection = (dispatchId) => {
    setSelectedDispatchIds(prev => 
      prev.includes(dispatchId) 
        ? prev.filter(id => id !== dispatchId)
        : [...prev, dispatchId]
    );
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    if (selectedItemIds.length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    // Get selected items and group by dispatch
    const selectedItems = uninvoicedItems.filter(i => selectedItemIds.includes(i.item_id));
    
    // Get unique dispatch IDs from selected items
    const dispatchIds = [...new Set(selectedItems.map(i => i.dispatch_id))];

    try {
      const response = await api.post('/api/retailer-invoices', {
        retailer_id: invoiceForm.retailer_id,
        invoice_date: invoiceForm.invoice_date, // Send as YYYY-MM-DD string, not ISO timestamp
        dispatch_ids: dispatchIds,
        selected_items: selectedItems.map(i => ({
          dispatch_id: i.dispatch_id,
          item_index: i.item_index,
          product_id: i.product_id,
          product_name: i.product_name,
          variant_name: i.variant_name,
          indent_qty: i.indent_qty,
          supplied_qty: i.supplied_qty,
          rejected_qty: i.rejected_qty || 0,
          rejections: i.rejections || [],
          net_qty: i.net_qty,
          quantity: i.net_qty, // Use net qty for invoice
          mrp: i.mrp,
          total_value: i.net_value // Use net value
        })),
        remarks: invoiceForm.remarks
      });
      toast.success(`Invoice ${response.data.invoice_number} created successfully`);
      setShowInvoiceModal(false);
      setSelectedItemIds([]);
      setInvoiceForm({
        retailer_id: '',
        invoice_date: getISTDate(),
        remarks: ''
      });
      loadInvoices();
      loadDispatches();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create invoice');
    }
  };

  // Edit Invoice
  const openEditInvoiceModal = async (invoice) => {
    setEditingInvoice(invoice);
    setEditInvoiceForm({
      invoice_date: invoice.invoice_date?.split('T')[0] || getISTDate(),
      items: invoice.items.map(item => ({
        ...item,
        selected: true
      })),
      remarks: invoice.remarks || ''
    });
    setShowEditInvoiceModal(true);
    setEditInvoiceCreditAdjustments([]);
    
    // Load payment history if invoice has any payments
    if (invoice.paid_amount > 0) {
      setEditInvoicePaymentsLoading(true);
      try {
        const response = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
        setEditInvoicePayments(response.data);
        
        // Also fetch credit adjustments for this invoice
        const creditRes = await api.get(`/api/retailer-credit-notes?adjusted_against_invoice=${invoice.id}`);
        const adjustedCredits = (creditRes.data || []).filter(cn => 
          cn.adjusted_against_invoices?.some(adj => adj.invoice_id === invoice.id)
        );
        setEditInvoiceCreditAdjustments(adjustedCredits);
      } catch (error) {
        console.error('Failed to load payment history:', error);
        setEditInvoicePayments([]);
      } finally {
        setEditInvoicePaymentsLoading(false);
      }
    } else {
      setEditInvoicePayments([]);
    }
  };

  const updateEditInvoiceItem = (index, field, value) => {
    setEditInvoiceForm(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      // Recalculate total_value if mrp or quantity changes
      if (field === 'mrp' || field === 'quantity' || field === 'supplied_qty') {
        const qty = items[index].quantity || items[index].supplied_qty || 0;
        const mrp = items[index].mrp || 0;
        items[index].total_value = qty * mrp;
      }
      return { ...prev, items };
    });
  };

  const handleUpdateInvoice = async (e) => {
    e.preventDefault();
    if (!editingInvoice) return;

    try {
      await api.put(`/api/retailer-invoices/${editingInvoice.id}`, {
        invoice_date: editInvoiceForm.invoice_date, // Send as YYYY-MM-DD string, not ISO timestamp
        items: editInvoiceForm.items,
        remarks: editInvoiceForm.remarks
      });
      toast.success('Invoice updated successfully');
      setShowEditInvoiceModal(false);
      setEditingInvoice(null);
      setEditInvoicePayments([]);
      loadInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update invoice');
    }
  };

  // Delete payment from edit invoice modal
  const handleDeletePaymentFromEditModal = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment? This will update the invoice status.')) return;
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      // Reload payment history for edit modal
      if (editingInvoice) {
        const response = await api.get(`/api/retailer-invoices/${editingInvoice.id}/payments`);
        setEditInvoicePayments(response.data);
        // Update the editingInvoice paid_amount to reflect the change
        const newPaidAmount = response.data.reduce((sum, p) => sum + (p.amount || 0), 0);
        setEditingInvoice(prev => ({ ...prev, paid_amount: newPaidAmount }));
      }
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete payment');
    }
  };

  const handleDeleteInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await api.delete(`/api/retailer-invoices/${invoiceId}`);
      toast.success('Invoice deleted');
      loadInvoices();
      loadDispatches();
    } catch (error) {
      toast.error('Failed to delete invoice');
    }
  };

  // Recalculate invoice totals (gross, net, rejection, commission)
  const handleRecalculateInvoice = async (invoiceId, invoiceNumber) => {
    if (!window.confirm(`Recalculate all totals for invoice ${invoiceNumber}? This will fix any calculation discrepancies.`)) return;
    try {
      const response = await api.post(`/api/retailer-invoices/${invoiceId}/recalculate`);
      toast.success(response.data.message || 'Invoice recalculated successfully');
      // Refresh both invoices list AND payment summary
      loadInvoices();
      loadImmediatelyPayable();
    } catch (error) {
      console.error('Error recalculating invoice:', error);
      toast.error(error.response?.data?.detail || 'Failed to recalculate invoice');
    }
  };

  // Create credit note for excess payment
  const handleCreateExcessCreditNote = async (invoice, excessAmount) => {
    const retailerName = getRetailerNameById(invoice.retailer_id) || invoice.retailer_name || 'Unknown';
    const confirmMsg = `Create Credit Note for ₹${excessAmount.toFixed(2)} excess payment on invoice ${invoice.invoice_number} (${retailerName})?\n\nThis credit note can be adjusted against future invoices.`;
    
    if (!window.confirm(confirmMsg)) return;
    
    try {
      const response = await api.post('/api/retailer-credit-notes/from-excess', {
        invoice_id: invoice.id,
        excess_amount: excessAmount,
        remarks: `Excess payment on invoice ${invoice.invoice_number}`
      });
      
      toast.success(response.data.message || 'Credit note created successfully');
      loadInvoices(); // Refresh invoices to show updated status
      loadCreditNotes(); // Refresh credit notes to show in expanded view
    } catch (error) {
      console.error('Error creating credit note:', error);
      toast.error(error.response?.data?.detail || 'Failed to create credit note');
    }
  };

  // Number to words function for invoice
  const numberToWords = (num) => {
    if (num === 0) return 'Zero Rupees Only';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const numToWords = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
      if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
      return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
    };
    
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    
    let result = numToWords(rupees) + ' Rupees';
    if (paise > 0) result += ' and ' + numToWords(paise) + ' Paise';
    return result + ' Only';
  };

  // ==================== DOWNLOAD INDIVIDUAL INDENT ====================
  const downloadIndentPdf = (indent, lang = 'en') => {
    const printWindow = window.open('', '_blank');
    const retailer = retailers.find(r => r.id === indent.retailer_id) || {};
    const retailerDisplayName = retailer.company_name || indent.retailer_name || 'Retailer';
    
    // Helper to get translated product name
    const getItemDisplayName = (item) => {
      const productId = item.product_id || item.productId;
      let product = productMap.get(productId);
      if (!product) {
        const itemName = item.product_name || item.productName || item.name;
        product = productMap.get(itemName);
      }
      
      let displayName = item.product_name || item.name || '';
      if (product) {
        if (lang === 'hi' && product.name_hi) displayName = product.name_hi;
        else if (lang === 'mr' && product.name_mr) displayName = product.name_mr;
        else displayName = product.name;
      }
      
      return displayName;
    };
    
    // Helper to get variant name (resolve UUIDs)
    const getItemVariant = (item) => {
      let variantName = item.variant_name || '';
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(variantName)) {
        const pkg = packagings.find(p => p.id === variantName);
        if (pkg) variantName = pkg.name;
      }
      return variantName || 'Kg';
    };
    
    // Get dispatched quantities for this indent
    const indentDispatches = dispatches.filter(d => d.indent_id === indent.id);
    const dispatchedQtys = {};
    for (const dispatch of indentDispatches) {
      for (const item of (dispatch.items || [])) {
        const key = item.product_id;
        dispatchedQtys[key] = (dispatchedQtys[key] || 0) + (item.supplied_qty || 0);
      }
    }
    
    // Group items by category and type
    const groupedItems = {};
    const categoryOrder = ['Vegetables', 'Fruits', 'Exotic', 'Sprouts', 'Others'];
    const vegetableTypeOrder = ['Hard', 'Semi-hard', 'Leafy', 'Others'];
    
    (indent.items || []).forEach(item => {
      const product = productMap.get(item.product_id) || productMap.get(item.product_name);
      const category = product?.category || 'Others';
      const productType = product?.product_type || 'Others';
      
      if (!groupedItems[category]) {
        groupedItems[category] = {};
      }
      
      // For vegetables, further group by type
      if (category === 'Vegetables') {
        if (!groupedItems[category][productType]) {
          groupedItems[category][productType] = [];
        }
        groupedItems[category][productType].push(item);
      } else {
        if (!groupedItems[category]['all']) {
          groupedItems[category]['all'] = [];
        }
        groupedItems[category]['all'].push(item);
      }
    });
    
    // Sort items alphabetically within each group
    Object.keys(groupedItems).forEach(category => {
      Object.keys(groupedItems[category]).forEach(type => {
        groupedItems[category][type].sort((a, b) => {
          const nameA = (a.product_name || '').toLowerCase();
          const nameB = (b.product_name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
      });
    });
    
    // Sort categories
    const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);
      const indexB = categoryOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
    
    // Calculate total supplied
    const totalSupplied = (indent.items || []).reduce((sum, item) => {
      return sum + (dispatchedQtys[item.product_id] || 0);
    }, 0);
    
    // Language labels
    const labels = {
      en: {
        title: 'INDENT ORDER',
        date: 'Date',
        retailer: 'Retailer',
        status: 'Status',
        sr: '#',
        product: 'Product',
        variant: 'Variant',
        ordered: 'Ordered',
        supplied: 'Supplied',
        remarks: 'Remarks',
        total: 'Total',
        category: {
          'Vegetables': 'Vegetables',
          'Fruits': 'Fruits',
          'Exotic': 'Exotic',
          'Sprouts': 'Sprouts',
          'Others': 'Others'
        },
        type: {
          'Hard': 'Hard Vegetables',
          'Semi-hard': 'Semi-hard Vegetables',
          'Leafy': 'Leafy Vegetables',
          'Others': 'Other Vegetables'
        }
      },
      hi: {
        title: 'इंडेंट ऑर्डर',
        date: 'तारीख',
        retailer: 'रिटेलर',
        status: 'स्थिति',
        sr: '#',
        product: 'उत्पाद',
        variant: 'वेरिएंट',
        ordered: 'ऑर्डर',
        supplied: 'सप्लाई',
        remarks: 'टिप्पणी',
        total: 'कुल',
        category: {
          'Vegetables': 'सब्जियां',
          'Fruits': 'फल',
          'Exotic': 'एक्जोटिक',
          'Sprouts': 'स्प्राउट्स',
          'Others': 'अन्य'
        },
        type: {
          'Hard': 'कड़ी सब्जियां',
          'Semi-hard': 'अर्ध-कड़ी सब्जियां',
          'Leafy': 'पत्तेदार सब्जियां',
          'Others': 'अन्य सब्जियां'
        }
      },
      mr: {
        title: 'इंडेंट ऑर्डर',
        date: 'तारीख',
        retailer: 'रिटेलर',
        status: 'स्थिती',
        sr: '#',
        product: 'उत्पादन',
        variant: 'व्हेरिएंट',
        ordered: 'ऑर्डर',
        supplied: 'पुरवठा',
        remarks: 'टीप',
        total: 'एकूण',
        category: {
          'Vegetables': 'भाज्या',
          'Fruits': 'फळे',
          'Exotic': 'एक्झोटिक',
          'Sprouts': 'मोड',
          'Others': 'इतर'
        },
        type: {
          'Hard': 'कडक भाज्या',
          'Semi-hard': 'मध्यम कडक भाज्या',
          'Leafy': 'पालेभाज्या',
          'Others': 'इतर भाज्या'
        }
      }
    };
    
    const l = labels[lang] || labels.en;
    
    // Build HTML for each category
    let itemsHtml = '';
    let srNo = 1;
    
    sortedCategories.forEach(category => {
      const categoryLabel = l.category[category] || category;
      const categoryClass = `category-${category.toLowerCase().replace(/\s+/g, '-')}`;
      
      if (category === 'Vegetables') {
        // Group by vegetable type
        const types = Object.keys(groupedItems[category]).sort((a, b) => {
          const indexA = vegetableTypeOrder.indexOf(a);
          const indexB = vegetableTypeOrder.indexOf(b);
          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
        
        types.forEach(type => {
          const typeLabel = l.type[type] || type;
          const items = groupedItems[category][type];
          const typeTotal = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          const typeSupplied = items.reduce((sum, item) => sum + (dispatchedQtys[item.product_id] || 0), 0);
          
          itemsHtml += `
            <tr class="category-header ${categoryClass}">
              <td colspan="6" style="background: #fff; color: #000; font-weight: bold; padding: 8px; border-top: 2px solid #000; border-bottom: 1px solid #000;">
                ${categoryLabel} - ${typeLabel} | ${items.length} items | Qty: ${typeTotal}
              </td>
            </tr>
          `;
          
          items.forEach(item => {
            const supplied = dispatchedQtys[item.product_id] || 0;
            itemsHtml += `
              <tr>
                <td style="text-align: center;">${srNo++}</td>
                <td style="text-align: left;">${getItemDisplayName(item)}</td>
                <td style="text-align: center;">${getItemVariant(item)}</td>
                <td style="text-align: center;">${item.quantity || 0}</td>
                <td style="text-align: center;">${supplied > 0 ? supplied : ''}</td>
                <td style="text-align: left;">${item.remarks || ''}</td>
              </tr>
            `;
          });
          
          // Subtotal for this type
          itemsHtml += `
            <tr style="background: #f5f5f5; font-weight: bold; border-top: 2px solid #000;">
              <td colspan="3" style="text-align: right; padding-right: 10px; color: #000;">${typeLabel} ${l.total}:</td>
              <td style="text-align: center; color: #000;">${typeTotal}</td>
              <td style="text-align: center; color: #000;">${typeSupplied > 0 ? typeSupplied : ''}</td>
              <td></td>
            </tr>
          `;
        });
      } else {
        // Other categories - no sub-grouping
        const items = groupedItems[category]['all'] || [];
        const categoryTotal = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const categorySupplied = items.reduce((sum, item) => sum + (dispatchedQtys[item.product_id] || 0), 0);
        
        itemsHtml += `
          <tr class="category-header ${categoryClass}">
            <td colspan="6" style="background: #000000; color: white; font-weight: bold; padding: 8px;">
              ${categoryLabel} | ${items.length} items | Qty: ${categoryTotal}
            </td>
          </tr>
        `;
        
        items.forEach(item => {
          const supplied = dispatchedQtys[item.product_id] || 0;
          itemsHtml += `
            <tr>
              <td style="text-align: center;">${srNo++}</td>
              <td style="text-align: left;">${getItemDisplayName(item)}</td>
              <td style="text-align: center;">${getItemVariant(item)}</td>
              <td style="text-align: center;">${item.quantity || 0}</td>
              <td style="text-align: center;">${supplied > 0 ? supplied : ''}</td>
              <td style="text-align: left;">${item.remarks || ''}</td>
            </tr>
          `;
        });
        
        // Subtotal
        itemsHtml += `
          <tr style="background: #f5f5f5; font-weight: bold; border-top: 2px solid #000;">
            <td colspan="3" style="text-align: right; padding-right: 10px; color: #000;">${categoryLabel} ${l.total}:</td>
            <td style="text-align: center; color: #000;">${categoryTotal}</td>
            <td style="text-align: center; color: #000;">${categorySupplied > 0 ? categorySupplied : ''}</td>
            <td></td>
          </tr>
        `;
      }
    });
    
    // Grand total
    const grandTotal = (indent.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Indent - ${retailerDisplayName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 850px; margin: 0 auto; background: white; font-size: 12px; }
          
          .title { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 15px; color: #14532D; }
          .company-name { text-align: center; font-size: 22px; font-weight: bold; color: #14532D; margin-bottom: 5px; }
          
          .header-section { border: 1px solid #000; margin-bottom: 15px; }
          .header-row { display: flex; border-bottom: 1px solid #000; }
          .header-row:last-child { border-bottom: none; }
          .header-cell { padding: 10px; flex: 1; }
          .header-cell:first-child { border-right: 1px solid #000; }
          .header-cell .label { font-weight: bold; font-size: 10px; color: #333; margin-bottom: 5px; }
          
          .items-section { border: 1px solid #000; margin-bottom: 15px; }
          .items-table { width: 100%; border-collapse: collapse; }
          .items-table th { background: #f5f5f5; border-bottom: 1px solid #000; padding: 10px 6px; font-size: 10px; font-weight: bold; text-align: center; }
          .items-table th:not(:last-child) { border-right: 1px solid #000; }
          .items-table td { padding: 8px 6px; font-size: 11px; border-bottom: 1px solid #ddd; }
          .items-table td:not(:last-child) { border-right: 1px solid #ddd; }
          .items-table tr:last-child td { border-bottom: none; }
          
          .grand-total { background: #fff; color: #000; font-weight: bold; border-top: 2px solid #000; }
          .grand-total td { border-right: 1px solid #000 !important; color: #000; }
          
          .remarks-section { border: 1px solid #000; padding: 10px; margin-bottom: 15px; }
          .remarks-label { font-weight: bold; margin-bottom: 5px; }
          
          @media print {
            body { padding: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="company-name">Mr Organix</div>
        <div class="title">${l.title}</div>
        
        <div class="header-section">
          <div class="header-row">
            <div class="header-cell">
              <div class="label">${l.retailer}</div>
              <div style="font-size: 14px; font-weight: bold;">${retailerDisplayName}</div>
            </div>
            <div class="header-cell">
              <div class="label">${l.date}</div>
              <div style="font-size: 14px; font-weight: bold;">${formatDate(indent.indent_date)}</div>
            </div>
          </div>
          <div class="header-row">
            <div class="header-cell">
              <div class="label">${l.status}</div>
              <div style="font-size: 14px; font-weight: bold; text-transform: capitalize;">${indent.status}</div>
            </div>
            <div class="header-cell">
              <div class="label">${l.total} Items / Qty</div>
              <div style="font-size: 14px; font-weight: bold;">${indent.items?.length || 0} / ${grandTotal}</div>
            </div>
          </div>
        </div>
        
        <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 40px;">${l.sr}</th>
                <th style="width: 40%;">${l.product}</th>
                <th style="width: 15%;">${l.variant}</th>
                <th style="width: 12%;">${l.ordered}</th>
                <th style="width: 12%;">${l.supplied}</th>
                <th style="width: 15%;">${l.remarks}</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              <tr class="grand-total">
                <td colspan="3" style="text-align: right; padding-right: 10px;">GRAND ${l.total} (${indent.items?.length || 0} items):</td>
                <td style="text-align: center;">${grandTotal}</td>
                <td style="text-align: center;">${totalSupplied > 0 ? totalSupplied : ''}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        ${indent.remarks ? `
          <div class="remarks-section">
            <div class="remarks-label">${l.remarks}:</div>
            <div>${indent.remarks}</div>
          </div>
        ` : ''}
        
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const downloadInvoicePdf = (invoice, lang = 'en') => {
    // Create a printable invoice using standard format with borders
    const printWindow = window.open('', '_blank');
    const retailer = retailers.find(r => r.id === invoice.retailer_id) || {};
    const retailerDisplayName = retailer.company_name || invoice.retailer_name;
    
    // Check if this is a 100% upfront retailer
    const isUpfront100 = retailer?.upfront_collection_percentage === 100;
    
    // Helper to get product name based on selected language
    const getItemDisplayName = (item) => {
      const productId = item.product_id || item.productId;
      let product = productMap.get(productId);
      if (!product) {
        const itemName = item.product_name || item.productName || item.name;
        product = productMap.get(itemName);
      }
      
      // Get translated name
      let displayName = item.product_name || item.name || '';
      if (product) {
        if (lang === 'hi' && product.name_hi) displayName = product.name_hi;
        else if (lang === 'mr' && product.name_mr) displayName = product.name_mr;
        else displayName = product.name;
      }
      
      // Add variant name if exists
      if (item.variant_name) {
        displayName += ` (${item.variant_name})`;
      }
      
      // Get storage type
      const storageType = product?.storage_type || 'Outdoor';
      displayName += `<br/><span style="font-size: 9px; color: ${storageType === 'Fridge' ? '#1d4ed8' : '#b45309'}; font-style: italic;">(Storage - ${storageType})</span>`;
      
      return displayName;
    };
    
    // Calculate totals - simple quantity and amount
    const totals = invoice.items.reduce((acc, item) => {
      const qty = item.supplied_qty || item.quantity || 0;
      const amount = qty * (item.mrp || 0);
      return {
        qty: acc.qty + qty,
        amount: acc.amount + amount
      };
    }, { qty: 0, amount: 0 });
    
    // For 100% upfront retailers: use gross value (no rejection deduction)
    // For others: use total_mrp_value (after rejections)
    const grossValue = invoice.gross_value || totals.amount;
    const totalMrpValue = isUpfront100 ? grossValue : (invoice.total_mrp_value || grossValue);
    
    // Calculate commission based on the correct value
    const commissionAmount = isUpfront100 
      ? (grossValue * (invoice.commission_percentage || 0) / 100)
      : invoice.commission_amount;
    
    // Calculate net payable
    const netPayable = isUpfront100
      ? (grossValue - commissionAmount)
      : invoice.net_payable;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 850px; margin: 0 auto; background: white; font-size: 12px; }
          
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
          .items-table th { background: #fff; border-bottom: 1px solid #000; padding: 10px 6px; font-size: 10px; font-weight: bold; text-align: center; }
          .items-table th:not(:last-child) { border-right: 1px solid #000; }
          .items-table td { padding: 8px 6px; font-size: 11px; text-align: center; border-bottom: 1px solid #000; }
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
          
          .print-btn { margin-top: 20px; padding: 10px 20px; font-size: 14px; cursor: pointer; }
          @media print { .print-btn { display: none; } body { padding: 10px; } }
        </style>
      </head>
      <body>
        <div class="tax-invoice-title">Tax Invoice</div>
        <div class="company-name">Mr Organix</div>
        
        <div class="header-section">
          <div class="header-row">
            <div class="header-cell">
              <div class="label">Bill To:</div>
              <strong>${retailerDisplayName}</strong><br/>
              ${retailer.address || ''}
            </div>
            <div class="header-cell">
              <div class="label">Invoice Details:</div>
              Invoice No: <strong>${invoice.invoice_number}</strong><br/>
              Date: ${formatDate(invoice.invoice_date)}<br/>
              Place Of Supply: 27-Maharashtra
            </div>
          </div>
        </div>
        
        <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 25px;">#</th>
                <th style="width: 250px; text-align: left;">Product Name</th>
                <th style="width: 80px;">Quantity</th>
                <th style="width: 80px;">MRP</th>
                <th style="width: 100px;">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map((item, idx) => {
                const qty = item.supplied_qty || item.quantity || 0;
                const rate = item.mrp || 0;
                const amount = qty * rate;
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="text-left">${getItemDisplayName(item)}</td>
                    <td>${qty}</td>
                    <td class="text-right">₹${rate.toFixed(2)}</td>
                    <td class="text-right">₹${amount.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
              <tr class="total-row">
                <td></td>
                <td class="text-left"><strong>Total</strong></td>
                <td><strong>${totals.qty}</strong></td>
                <td></td>
                <td class="text-right"><strong>₹${totalMrpValue.toFixed(2)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div class="items-section" style="padding: 10px;">
          <div style="display: flex; justify-content: flex-end; gap: 20px;">
            <div style="text-align: right;">
              <div style="margin-bottom: 5px;">Total MRP Value: <strong>₹${totalMrpValue.toFixed(2)}</strong></div>
              <div style="margin-bottom: 5px; color: #15803d;">Commission (${invoice.commission_percentage}%): <strong>-₹${commissionAmount.toFixed(2)}</strong></div>
              <div style="font-size: 14px; font-weight: bold; border-top: 2px solid #14532D; padding-top: 5px;">Invoice Amount: ₹${netPayable.toFixed(2)}</div>
              ${(invoice.credit_note_adjustments?.length > 0 && invoice.total_credit_adjusted > 0) ? `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #999;">
                  <div style="margin-bottom: 5px; color: #c62828; font-weight: bold;">(-) Credit Notes Adjusted: <strong>-₹${invoice.total_credit_adjusted.toFixed(2)}</strong></div>
                  <div style="font-size: 16px; font-weight: bold; color: #2e7d32; background: #e8f5e9; padding: 8px; border-radius: 4px;">FINAL PAYABLE: ₹${(invoice.final_payable || netPayable).toFixed(2)}</div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
        
        ${(invoice.credit_note_adjustments?.length > 0 && invoice.total_credit_adjusted > 0) ? `
        <div class="items-section" style="margin-top: 15px;">
          <div style="background: #e3f2fd; padding: 8px 10px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #000;">
            Credit Notes Adjusted in this Invoice
          </div>
          
          ${(() => {
            // Group credit notes by original invoice
            const groupedByInvoice = {};
            invoice.credit_note_adjustments.forEach(adj => {
              // Look up additional info from creditNotes state
              const matchingCN = creditNotes.find(cn => cn.id === adj.credit_note_id || cn.credit_note_number === adj.credit_note_number);
              const origInvNum = adj.original_invoice_number || (matchingCN ? matchingCN.original_invoice_number : null) || 'Unknown Invoice';
              const rejDateRaw = adj.rejection_date || (matchingCN ? matchingCN.rejection_date : null);
              
              if (!groupedByInvoice[origInvNum]) {
                groupedByInvoice[origInvNum] = {
                  invoiceNumber: origInvNum,
                  rejectionDate: rejDateRaw,
                  creditNotes: []
                };
              }
              groupedByInvoice[origInvNum].creditNotes.push({
                ...adj,
                credit_note_date: adj.credit_note_date || (matchingCN ? matchingCN.created_at : null),
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
              // Try rejection date first, then extract from invoice number
              let displayDate = '-';
              let displayTime = '';
              if (rejDateTime && !isNaN(rejDateTime.getTime())) {
                displayDate = rejDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                displayTime = rejDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
              } else {
                // Extract date from invoice number
                const extractedDate = extractDateFromInvoiceNum(group.invoiceNumber);
                if (extractedDate) {
                  displayDate = extractedDate;
                }
              }
              
              // Calculate total rejection amount for this invoice group
              const groupTotal = group.creditNotes.reduce((sum, cn) => sum + (cn.adjusted_amount || 0), 0);
              
              return '<div style="border: 1px solid #1565c0; margin: 10px 0; border-radius: 6px; overflow: hidden;">' +
                '<div style="background: #1565c0; color: white; padding: 10px 12px; font-size: 11px;">' +
                  '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div style="display: flex; align-items: center; gap: 20px;">' +
                      '<div><strong>' + displayDate + (displayTime ? ' at ' + displayTime : '') + '</strong></div>' +
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
                  
                  return '<div style="border-top: 1px solid #ddd;">' +
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
                            '<th style="padding: 5px 10px; text-align: center; border-bottom: 1px solid #eee;">Variant</th>' +
                            '<th style="padding: 5px 10px; text-align: center; border-bottom: 1px solid #eee;">Reason</th>' +
                            '<th style="padding: 5px 10px; text-align: right; border-bottom: 1px solid #eee;">Value</th>' +
                          '</tr></thead>' +
                          '<tbody>' +
                            rejectionDetails.map(d => 
                              '<tr>' +
                                '<td style="padding: 4px 10px; border-bottom: 1px solid #f0f0f0;">' + (d.product_name || '-') + '</td>' +
                                '<td style="padding: 4px 10px; text-align: center; border-bottom: 1px solid #f0f0f0;">' + (d.quantity || '-') + '</td>' +
                                '<td style="padding: 4px 10px; text-align: center; border-bottom: 1px solid #f0f0f0;">' + (d.variant_name || '-') + '</td>' +
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
        
        <div class="amount-words-section">
          <strong>Total Amount in words:</strong> ${numberToWords(invoice.final_payable || invoice.net_payable)}
        </div>
        
        <div class="footer-section">
          <div class="footer-left">
            <div class="terms-header">Terms & Conditions:</div>
            Thanks for doing business with us!
            <br/><br/>
            MR ORGANIX M.NO. 1638,<br/>
            Taleranwadi, Kesnand Taluka - Haveli<br/>
            Pune - 412207, Maharashtra<br/>
            Phone: 9145000250
          </div>
          <div class="footer-right">
            <div class="signatory-label">For Mr Organix</div>
            <div class="signatory-name">Authorized Signatory</div>
          </div>
        </div>
        
        <button class="print-btn" onclick="window.print()">Print Invoice</button>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Open language selection dialog before printing invoice
  const openPrintLanguageDialog = (invoice) => {
    setInvoiceToPrint(invoice);
    setPrintLanguage('en');
    setShowPrintLanguageDialog(true);
  };

  // Confirm print with selected language
  const confirmPrintInvoice = () => {
    if (invoiceToPrint) {
      downloadInvoicePdf(invoiceToPrint, printLanguage);
    }
    setShowPrintLanguageDialog(false);
    setInvoiceToPrint(null);
  };

  // ==================== REJECTION HANDLERS ====================
  // Load dispatch items when date/retailer changes for rejection
  const loadRejectionDispatchItems = useCallback(async () => {
    if (!rejectionForm.retailer_id || !rejectionForm.rejection_date) {
      setRejectionDispatchItems([]);
      return;
    }
    
    try {
      // Get dispatches for this retailer on this date
      const dateStr = rejectionForm.rejection_date;
      const response = await api.get(`/api/retailer-dispatches?retailer_id=${rejectionForm.retailer_id}`);
      const dayDispatches = response.data.filter(d => {
        const dispatchDate = d.dispatch_date?.split('T')[0];
        return dispatchDate === dateStr;
      });
      
      // Debug: log editing rejection details
      if (editingRejection) {
        console.log('Editing rejection:', {
          product_id: editingRejection.product_id,
          product_name: editingRejection.product_name,
          variant_id: editingRejection.variant_id,
          variant_name: editingRejection.variant_name,
          quantity: editingRejection.quantity,
          reason: editingRejection.reason
        });
      }
      
      // Collect all unique product IDs from the dispatches
      const productIds = new Set();
      for (const dispatch of dayDispatches) {
        for (const item of (dispatch.items || [])) {
          if (item.product_id) {
            productIds.add(item.product_id);
          }
        }
      }
      
      // Fetch rejection history for ALL products in a single batch call
      // IMPORTANT: Pass rejection_date to only get rejections for THIS SPECIFIC dispatch date
      let rejectionHistoryMap = {};
      if (productIds.size > 0) {
        try {
          const historyResponse = await api.post('/api/retailer-rejections/history-batch', {
            retailer_id: rejectionForm.retailer_id,
            product_ids: Array.from(productIds),
            rejection_date: dateStr  // Filter to only show rejections for this date
          });
          rejectionHistoryMap = historyResponse.data.history || {};
        } catch (err) {
          console.log('Failed to fetch rejection history batch:', err);
        }
      }
      
      // Flatten all items from dispatches for that day
      const items = [];
      for (const dispatch of dayDispatches) {
        for (const item of (dispatch.items || [])) {
          // Check if this item matches the rejection being edited
          // Try multiple matching strategies
          let isEditingItem = false;
          if (editingRejection) {
            // Strategy 1: Match by product_id and variant_id
            const productMatch = editingRejection.product_id === item.product_id;
            const variantMatch = editingRejection.variant_id === item.variant_id || 
              (!editingRejection.variant_id && !item.variant_id) ||
              (editingRejection.variant_id === '' && !item.variant_id) ||
              (!editingRejection.variant_id && item.variant_id === '');
            
            // Strategy 2: Match by product_name and variant_name (fallback)
            const nameMatch = editingRejection.product_name === item.product_name;
            const variantNameMatch = (editingRejection.variant_name || '') === (item.variant_name || '');
            
            isEditingItem = (productMatch && variantMatch) || (nameMatch && variantNameMatch);
            
            if (isEditingItem) {
              console.log('Found matching item:', item.product_name, item.variant_name);
            }
          }
          
          // Get rejection history from the batch response (only for THIS date)
          // Use composite key (product_id + variant_id) for more precise tracking
          const compositeKey = item.variant_id ? `${item.product_id}|${item.variant_id}` : item.product_id;
          const rejectionHistory = rejectionHistoryMap[compositeKey] || rejectionHistoryMap[item.product_id] || { rejections: [], total_quantity: 0, total_value: 0 };
          
          items.push({
            dispatch_id: dispatch.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            supplied_qty: item.supplied_qty,
            mrp: item.mrp,
            rejection_qty: isEditingItem ? editingRejection.quantity : 0,
            reason: isEditingItem ? (editingRejection.reason || '') : '',
            remarks: isEditingItem ? (editingRejection.remarks || '') : '',
            selected: isEditingItem ? true : false,
            // Rejection history for THIS DATE ONLY
            previous_rejections: rejectionHistory.rejections || [],
            total_previous_qty: rejectionHistory.total_quantity || 0,
            total_previous_value: rejectionHistory.total_value || 0
          });
        }
      }
      
      setRejectionDispatchItems(items);
    } catch (error) {
      console.error('Failed to load dispatch items:', error);
      setRejectionDispatchItems([]);
    }
  }, [rejectionForm.retailer_id, rejectionForm.rejection_date, editingRejection]);

  // Only auto-load dispatch items when NOT in edit mode (new rejection)
  // In edit mode, handleEditRejection already loads the items with all rejections pre-filled
  useEffect(() => {
    if (showRejectionModal && rejectionForm.retailer_id && rejectionForm.rejection_date && !editingRejection) {
      loadRejectionDispatchItems();
    }
  }, [showRejectionModal, loadRejectionDispatchItems, rejectionForm.retailer_id, rejectionForm.rejection_date, editingRejection]);

  const updateRejectionItem = (index, field, value) => {
    setRejectionDispatchItems(prev => {
      const items = [...prev];
      items[index] = { ...items[index], [field]: value };
      return items;
    });
  };

  const handleCreateRejections = async (e) => {
    e.preventDefault();
    
    // Get only selected items with valid quantities
    const selectedItems = rejectionDispatchItems.filter(item => item.selected && item.rejection_qty > 0);
    
    if (selectedItems.length === 0) {
      setRejectionErrorDialog({
        open: true,
        title: 'No Items Selected',
        message: 'Please select items and enter rejection quantities.'
      });
      return;
    }
    
    // Validate rejection qty + previous rejections doesn't exceed supplied qty
    const invalidItems = selectedItems.filter(item => {
      const maxAllowed = item.supplied_qty - (item.total_previous_qty || 0);
      return item.rejection_qty > maxAllowed;
    });
    if (invalidItems.length > 0) {
      const item = invalidItems[0];
      const maxAllowed = item.supplied_qty - (item.total_previous_qty || 0);
      setRejectionErrorDialog({
        open: true,
        title: 'Rejection Limit Exceeded',
        message: `${item.product_name}:\n\nRejection qty entered: ${item.rejection_qty}\nMaximum allowed: ${maxAllowed}\n\nSupplied: ${item.supplied_qty}\nAlready rejected: ${item.total_previous_qty || 0}`
      });
      return;
    }
    
    // Validate all selected items have a reason
    const noReasonItems = selectedItems.filter(item => !item.reason);
    if (noReasonItems.length > 0) {
      setRejectionErrorDialog({
        open: true,
        title: 'Reason Required',
        message: 'Please select a reason for all rejected items.'
      });
      return;
    }

    try {
      let createdCount = 0;
      let updatedCount = 0;
      const autoCreditNotes = []; // Track auto-generated credit notes
      
      // Process each selected item - update if has rejection_id, create if new
      for (const item of selectedItems) {
        const rejectionData = {
          retailer_id: rejectionForm.retailer_id,
          rejection_date: new Date(rejectionForm.rejection_date).toISOString(),
          product_id: item.product_id,
          product_name: item.product_name,
          variant_id: item.variant_id || null,
          variant_name: item.variant_name,
          quantity: item.rejection_qty,
          mrp: item.mrp,
          reason: item.reason,
          remarks: item.remarks || '',
          dispatch_id: item.dispatch_id || null  // Include dispatch_id to link to correct invoice
        };
        
        if (item.rejection_id) {
          // Update existing rejection
          await api.put(`/api/retailer-rejections/${item.rejection_id}`, rejectionData);
          updatedCount++;
        } else {
          // Create new rejection
          const response = await api.post('/api/retailer-rejections', rejectionData);
          createdCount++;
          // Check if auto-credit note was generated (for 100% upfront retailers)
          if (response.data?.auto_credit_note) {
            autoCreditNotes.push(response.data.auto_credit_note);
          }
        }
      }
      
      // Check for items that were previously selected but now unselected (to delete)
      if (editingRejection) {
        const allPreviousRejections = rejectionForm.items || [];
        for (const prevItem of allPreviousRejections) {
          if (prevItem.id) {
            // Check if this rejection is no longer selected
            const stillSelected = selectedItems.find(si => si.rejection_id === prevItem.id);
            if (!stillSelected) {
              // Delete the rejection since it was unselected
              await api.delete(`/api/retailer-rejections/${prevItem.id}`);
            }
          }
        }
      }
      
      // Build success message
      const messages = [];
      if (createdCount > 0) messages.push(`${createdCount} created`);
      if (updatedCount > 0) messages.push(`${updatedCount} updated`);
      
      if (autoCreditNotes.length > 0) {
        const cnNumbers = autoCreditNotes.map(cn => cn.credit_note_number).join(', ');
        const totalCreditAmount = autoCreditNotes.reduce((sum, cn) => sum + cn.amount, 0);
        toast.success(
          `Rejections: ${messages.join(', ')}. Auto-generated Credit Note(s): ${cnNumbers} (₹${totalCreditAmount.toLocaleString()})`,
          { duration: 6000 }
        );
        // Refresh credit notes
        loadCreditNotes();
      } else {
        toast.success(`Rejections: ${messages.join(', ')}`);
      }
      
      setShowRejectionModal(false);
      resetRejectionForm();
      loadRejections();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save rejections');
    }
  };

  const handleDeleteRejection = async (rejectionId) => {
    if (!window.confirm('Are you sure you want to delete this rejection? Any linked credit note will also be deleted/voided.')) return;
    try {
      const response = await api.delete(`/api/retailer-rejections/${rejectionId}`);
      toast.success(response.data.message || 'Rejection deleted');
      loadRejections();
      loadCreditNotes(); // Refresh credit notes too since one may have been deleted
    } catch (error) {
      toast.error('Failed to delete rejection');
    }
  };

  const handleEditRejection = async (rejection) => {
    // Set editing state
    setEditingRejection(rejection);
    
    const retailerId = rejection.retailer_id;
    const rejectionDate = rejection.rejection_date?.split('T')[0] || rejection.rejection_date;
    
    // Fetch ALL rejections for this retailer + date
    let allRejectionsForDate = [];
    try {
      const rejectionsRes = await api.get(`/api/retailer-rejections?retailer_id=${retailerId}`);
      allRejectionsForDate = rejectionsRes.data.filter(r => {
        const rDate = r.rejection_date?.split('T')[0] || r.rejection_date;
        return rDate === rejectionDate;
      });
    } catch (error) {
      console.error('Failed to fetch rejections:', error);
    }
    
    // Set form data with all rejections as items
    setRejectionForm({
      retailer_id: retailerId,
      rejection_date: rejectionDate,
      remarks: rejection.remarks || '',
      items: allRejectionsForDate.map(r => ({
        id: r.id,
        dispatch_id: r.dispatch_id || '',
        product_id: r.product_id,
        product_name: r.product_name,
        variant_id: r.variant_id || '',
        variant_name: r.variant_name || '',
        quantity: r.quantity,
        mrp: r.mrp,
        reason: r.reason || '',
        remarks: r.remarks || ''
      }))
    });
    
    // Load dispatch items and match ALL existing rejections
    try {
      const response = await api.get(`/api/retailer-dispatches?retailer_id=${retailerId}`);
      const dayDispatches = response.data.filter(d => {
        const dispatchDate = d.dispatch_date?.split('T')[0];
        return dispatchDate === rejectionDate;
      });
      
      const items = [];
      dayDispatches.forEach(dispatch => {
        dispatch.items?.forEach(item => {
          // Find matching rejection from ALL rejections for this date
          const matchingRejection = allRejectionsForDate.find(r => {
            const productMatch = r.product_id === item.product_id;
            const nameMatch = r.product_name === item.product_name;
            const variantMatch = (r.variant_id === item.variant_id) || 
              (!r.variant_id && !item.variant_id) ||
              (r.variant_name === item.variant_name);
            
            return (productMatch || nameMatch) && variantMatch;
          });
          
          items.push({
            dispatch_id: dispatch.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id,
            variant_name: item.variant_name,
            supplied_qty: item.supplied_qty,
            mrp: item.mrp,
            rejection_id: matchingRejection?.id || null, // Store rejection ID for update
            rejection_qty: matchingRejection ? matchingRejection.quantity : 0,
            reason: matchingRejection ? (matchingRejection.reason || '') : '',
            remarks: matchingRejection ? (matchingRejection.remarks || '') : '',
            selected: matchingRejection ? true : false
          });
        });
      });
      
      setRejectionDispatchItems(items);
    } catch (error) {
      console.error('Failed to load dispatch items for edit:', error);
    }
    
    setShowRejectionModal(true);
  };

  const resetRejectionForm = () => {
    setRejectionForm({
      retailer_id: '',
      rejection_date: getISTDate(),
      items: []
    });
    setRejectionDispatchItems([]);
    setEditingRejection(null);
  };

  // ==================== PAYMENT HANDLERS ====================
  // Load payment context when date/retailer changes
  const loadPaymentContext = useCallback(async () => {
    if (!paymentForm.retailer_id || !paymentForm.payment_date) {
      setPaymentContext(null);
      return;
    }
    
    try {
      // Get all dispatches for this retailer
      const response = await api.get(`/api/retailer-dispatches?retailer_id=${paymentForm.retailer_id}`);
      const allDispatches = response.data;
      
      // Get all payments for this retailer
      const paymentsRes = await api.get(`/api/retailer-payments?retailer_id=${paymentForm.retailer_id}`);
      const allPayments = paymentsRes.data;
      
      // Get all invoices for this retailer
      const invoicesRes = await api.get(`/api/retailer-invoices?retailer_id=${paymentForm.retailer_id}`);
      const allInvoices = invoicesRes.data;
      
      // Calculate totals based on INVOICES (not dispatches)
      const totalMrpValue = allDispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);
      const totalInvoiced = allInvoices.reduce((sum, i) => sum + (i.net_payable || 0), 0);
      const totalPaid = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      // Pending = Invoiced - Paid (rejections are already deducted in invoice net_payable)
      const pendingAmount = totalInvoiced - totalPaid;
      
      // Get retailer info
      const retailer = retailers.find(r => r.id === paymentForm.retailer_id);
      
      setPaymentContext({
        retailer_name: retailer?.company_name || retailer?.name,
        commission_percentage: retailer?.commission_percentage || 0,
        totalMrpValue,
        totalInvoiced,
        totalNetReceivable: totalInvoiced,  // Now based on invoices
        totalPaid,
        pendingAmount
      });
    } catch (error) {
      console.error('Failed to load payment context:', error);
      setPaymentContext(null);
    }
  }, [paymentForm.retailer_id, paymentForm.payment_date, retailers]);

  useEffect(() => {
    if (showPaymentModal) {
      loadPaymentContext();
    }
  }, [showPaymentModal, loadPaymentContext, paymentForm.retailer_id]);

  const handleCreatePayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.retailer_id || !paymentForm.amount) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await api.post('/api/retailer-payments', {
        ...paymentForm,
        payment_date: new Date(paymentForm.payment_date).toISOString()
      });
      toast.success('Payment recorded');
      setShowPaymentModal(false);
      resetPaymentForm();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return;
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted');
      loadPayments();
    } catch (error) {
      toast.error('Failed to delete payment');
    }
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      retailer_id: '',
      payment_date: getISTDate(),
      amount: '',
      payment_mode: 'cash',
      reference_number: '',
      remarks: ''
    });
    setPaymentContext(null);
    setPaymentRetailerSearch('');
    setShowPaymentRetailerDropdown(false);
  };

  // Open invoice payment modal
  const openInvoicePaymentModal = async (invoice) => {
    setSelectedInvoiceForPayment(invoice);
    // Calculate remaining amount: net_payable - credit_notes_adjusted - already_paid
    const creditAdjusted = invoice.total_credit_adjusted || 0;
    const actualPayable = (invoice.net_payable || 0) - creditAdjusted;
    const remainingAmount = actualPayable - (invoice.paid_amount || 0);
    const currentUserId = getCurrentUserId();
    const currentUserName = getCurrentUserName();
    setInvoicePaymentForm({
      amount: remainingAmount > 0 ? remainingAmount.toFixed(2) : '',
      payment_mode: 'cash',
      received_by: currentUserId,
      received_by_name: currentUserName,
      reference_number: '',
      remarks: '',
      payment_date: getISTDate()
    });
    setShowInvoicePaymentModal(true);
    
    // Reset credit note adjustments
    setSelectedCreditAdjustments([]);
    
    // Load pending credit notes for this retailer
    loadPendingCreditNotesForPayment(invoice.retailer_id);
    
    // Load existing payments if invoice has partial payments
    if (invoice.paid_amount > 0) {
      setLoadingExistingPayments(true);
      try {
        const response = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
        setInvoiceExistingPayments(response.data || []);
      } catch (error) {
        console.error('Failed to load existing payments:', error);
        setInvoiceExistingPayments([]);
      } finally {
        setLoadingExistingPayments(false);
      }
    } else {
      setInvoiceExistingPayments([]);
    }
  };

  // Open payment history modal (for viewing/editing paid invoices)
  const openPaymentHistoryModal = async (invoice) => {
    setSelectedInvoiceForHistory(invoice);
    setPaymentHistoryLoading(true);
    setShowPaymentHistoryModal(true);
    setInvoiceCreditAdjustments([]);
    setInvoiceOriginatedCreditNotes([]);
    try {
      const response = await api.get(`/api/retailer-invoices/${invoice.id}/payments`);
      setInvoicePaymentHistory(response.data);
      
      // Also fetch credit adjustments for this invoice (credits APPLIED to this invoice)
      const creditRes = await api.get(`/api/retailer-credit-notes?adjusted_against_invoice=${invoice.id}`);
      const adjustedCredits = (creditRes.data || []).filter(cn => 
        cn.adjusted_against_invoices?.some(adj => adj.invoice_id === invoice.id)
      );
      setInvoiceCreditAdjustments(adjustedCredits);
      
      // Fetch credit notes CREATED FROM this invoice (excess payment or rejection)
      const originatedRes = await api.get(`/api/retailer-credit-notes?original_invoice_id=${invoice.id}`);
      setInvoiceOriginatedCreditNotes(originatedRes.data || []);
    } catch (error) {
      console.error('Failed to load payment history:', error);
      toast.error('Failed to load payment history');
      setInvoicePaymentHistory([]);
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  // Delete a payment from history
  const handleDeletePaymentFromHistory = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment? This will update the invoice status.')) return;
    try {
      await api.delete(`/api/retailer-payments/${paymentId}`);
      toast.success('Payment deleted successfully');
      // Reload payment history
      if (selectedInvoiceForHistory) {
        const response = await api.get(`/api/retailer-invoices/${selectedInvoiceForHistory.id}/payments`);
        setInvoicePaymentHistory(response.data);
      }
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete payment');
    }
  };

  // Open edit payment modal
  const openEditPaymentModal = (payment) => {
    setEditingPayment(payment);
    setEditPaymentForm({
      amount: payment.amount?.toString() || '',
      payment_mode: payment.payment_mode || 'cash',
      reference_number: payment.reference_number || '',
      remarks: payment.remarks || '',
      payment_date: payment.payment_date?.split('T')[0] || getISTDate()
    });
    setShowEditPaymentModal(true);
  };

  // Handle edit payment submission
  const handleEditPayment = async (e) => {
    e.preventDefault();
    if (!editingPayment || !editPaymentForm.amount) {
      toast.error('Please enter payment amount');
      return;
    }
    
    // Validate reference number for non-cash payments
    if (editPaymentForm.payment_mode !== 'cash' && !editPaymentForm.reference_number.trim()) {
      toast.error('Reference number is required for non-cash payments');
      return;
    }
    
    try {
      await api.put(`/api/retailer-payments/${editingPayment.id}`, {
        amount: parseFloat(editPaymentForm.amount),
        payment_mode: editPaymentForm.payment_mode,
        reference_number: editPaymentForm.reference_number,
        remarks: editPaymentForm.remarks,
        payment_date: editPaymentForm.payment_date
      });
      toast.success('Payment updated successfully');
      setShowEditPaymentModal(false);
      setEditingPayment(null);
      
      // Reload payment history
      if (selectedInvoiceForHistory) {
        const response = await api.get(`/api/retailer-invoices/${selectedInvoiceForHistory.id}/payments`);
        setInvoicePaymentHistory(response.data);
      }
      loadInvoices();
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update payment');
    }
  };

  // Handle invoice payment submission
  const handleInvoicePayment = async (e) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment || !invoicePaymentForm.amount) {
      toast.error('Please enter payment amount');
      return;
    }
    
    // Validate reference number for non-cash payments
    if (invoicePaymentForm.payment_mode !== 'cash' && !invoicePaymentForm.reference_number.trim()) {
      toast.error('Reference number is required for non-cash payments');
      return;
    }
    
    try {
      // Prepare credit note adjustments if any
      const creditAdjustments = selectedCreditAdjustments.filter(adj => adj.amount > 0);
      
      await api.post(`/api/retailer-invoices/${selectedInvoiceForPayment.id}/payment`, {
        amount: parseFloat(invoicePaymentForm.amount),
        payment_mode: invoicePaymentForm.payment_mode,
        received_by: invoicePaymentForm.received_by,
        received_by_name: invoicePaymentForm.received_by_name,
        reference_number: invoicePaymentForm.reference_number,
        remarks: invoicePaymentForm.remarks,
        payment_date: invoicePaymentForm.payment_date,
        credit_adjustments: creditAdjustments.length > 0 ? creditAdjustments : undefined
      });
      
      const totalCreditApplied = creditAdjustments.reduce((sum, adj) => sum + adj.amount, 0);
      if (totalCreditApplied > 0) {
        toast.success(`Payment recorded with ₹${totalCreditApplied.toLocaleString()} credit adjustment`);
      } else {
        toast.success('Payment recorded successfully');
      }
      
      setShowInvoicePaymentModal(false);
      setSelectedInvoiceForPayment(null);
      setPendingCreditNotesForPayment([]);
      setSelectedCreditAdjustments([]);
      loadInvoices();
      loadPayments();
      loadCreditNotes(); // Refresh credit notes as well
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  // Get filtered invoices based on status filter
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;
    
    // Filter by selected retailer
    if (selectedRetailer) {
      filtered = filtered.filter(inv => inv.retailer_id === selectedRetailer);
    }
    
    // Filter by payment status
    if (invoiceStatusFilter !== 'all') {
      filtered = filtered.filter(inv => (inv.status || 'pending') === invoiceStatusFilter);
    }
    
    return filtered;
  }, [invoices, selectedRetailer, invoiceStatusFilter]);

  // Helper function to get retailer display name (company_name or name)
  const getRetailerDisplayName = (retailer) => {
    return retailer?.company_name || retailer?.name || '-';
  };

  // Get retailer display name by ID
  const getRetailerNameById = (retailerId) => {
    const retailer = retailers.find(r => r.id === retailerId);
    return getRetailerDisplayName(retailer);
  };

  // Filter products based on search (both English and Hindi names)
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.name_hi?.includes(productSearch)
  );

  // Filter variants based on search and vertical (retail for retailer indents)
  const filteredVariants = packagings.filter(p => 
    p.name?.toLowerCase().includes(variantSearch.toLowerCase()) &&
    (!p.verticals || p.verticals.length === 0 || p.verticals.includes('retail'))
  );

  // Get variants for a specific product (includes unit-based variants like Piece/Packet from catalogue)
  const getVariantsForProduct = (productId) => {
    if (!productId) return filteredVariants;
    
    // Find catalogue entry for this product
    const catalogueEntry = retailerCatalogue.find(c => c.product_id === productId);
    
    // Build list of available variants
    let variants = [];
    
    // Parse catalogue variants - handle both array and string formats
    let catalogueVariants = [];
    if (catalogueEntry?.variants) {
      if (Array.isArray(catalogueEntry.variants)) {
        catalogueVariants = catalogueEntry.variants;
      } else if (typeof catalogueEntry.variants === 'string') {
        // Handle string representation of array like "['unit_piece', 'uuid']"
        try {
          // Try to parse as JSON after converting single quotes to double
          const jsonStr = catalogueEntry.variants.replace(/'/g, '"');
          catalogueVariants = JSON.parse(jsonStr);
        } catch (e) {
          // If parsing fails, treat as single value
          catalogueVariants = [catalogueEntry.variants];
        }
      }
    }
    
    if (catalogueVariants.length > 0) {
      // Add unit_piece variant if present in catalogue
      if (catalogueVariants.includes('unit_piece')) {
        variants.push({ id: 'unit_piece', name: 'Pieces' });
      }
      // Add unit_packet variant if present in catalogue
      if (catalogueVariants.includes('unit_packet')) {
        variants.push({ id: 'unit_packet', name: 'Packets' });
      }
      
      // Add standard packagings that are in the catalogue variants
      catalogueVariants.forEach(variantId => {
        if (variantId && !variantId.startsWith('unit_')) {
          const packaging = packagings.find(p => p.id === variantId);
          if (packaging) {
            variants.push({ id: packaging.id, name: packaging.name });
          }
        }
      });
    }
    
    // If no catalogue entry found or no variants defined, fall back to filtered packagings
    if (variants.length === 0) {
      variants = filteredVariants;
    }
    
    // Filter by search term
    return variants.filter(v => 
      v.name?.toLowerCase().includes(variantSearch.toLowerCase())
    );
  };

  // Filtered retailers for search-based selection
  const filteredRetailers = retailers.filter(r => 
    (r.company_name || r.name || '').toLowerCase().includes(retailerSearch.toLowerCase())
  );
  
  const filteredPaymentRetailers = retailers.filter(r => 
    (r.company_name || r.name || '').toLowerCase().includes(paymentRetailerSearch.toLowerCase())
  );

  const toggleIndentExpand = (id) => {
    setExpandedIndents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleInvoiceExpand = (id) => {
    setExpandedInvoices(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tabs = [
    { id: 'dailyRequirement', label: 'Daily Requirement', icon: ShoppingCart, count: null },
    { id: 'indents', label: 'Indents', icon: Package, count: indents.length },
    { id: 'dispatches', label: 'Dispatches', icon: Truck, count: dispatches.length },
    { id: 'invoices', label: 'Invoices', icon: FileText, count: invoices.length },
    { id: 'statement', label: 'Statement', icon: FileSpreadsheet, count: null },
    { id: 'creditNotes', label: 'Credit Notes', icon: CreditCard, count: creditNotes.length },
    { id: 'rejections', label: 'Rejections', icon: AlertTriangle, count: rejections.length },
    { id: 'closingInventory', label: 'Closing Inventory', icon: ClipboardList, count: null }
  ];

  // Calculate totals for selected dispatches (for invoice modal)
  const selectedDispatchTotal = uninvoicedDispatches
    .filter(d => selectedDispatchIds.includes(d.id))
    .reduce((sum, d) => sum + (d.total_mrp_value || 0), 0);

  return (
    <Layout title="Retailer Orders">
      <div data-testid="retailer-orders-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Retailer Orders</h1>
            <p className="text-sm text-gray-500">Manage retailer indents, dispatches, invoices and payments</p>
          </div>
          
          {/* Retailer Filter */}
          <div className="flex gap-2 items-center">
            <select
              value={selectedRetailer}
              onChange={(e) => setSelectedRetailer(e.target.value)}
              className="h-9 px-3 rounded-md border border-gray-200 text-sm"
            >
              <option value="">All Retailers</option>
              {retailers.map(r => (
                <option key={r.id} value={r.id}>{r.company_name || r.name} ({r.commission_percentage || 0}%)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dashboard Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Package size={14} />
              <span>Today's Orders ({new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Indents:</span>
                <span className="text-xs font-semibold">{dashboardStats.todayIndentsCount || 0} <span className="text-blue-600">({dashboardStats.todayIndentsQty || 0} qty)</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Dispatch:</span>
                <span className="text-xs font-semibold">{dashboardStats.todayDispatchesCount || 0} <span className="text-green-600">({dashboardStats.todayDispatchesQty || 0} qty)</span></span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <Truck size={14} />
              <span>Tomorrow's Orders ({(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); })()})</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Indents:</span>
                <span className="text-xs font-semibold">{dashboardStats.tomorrowIndentsCount || 0} <span className="text-blue-600">({dashboardStats.tomorrowIndentsQty || 0} qty)</span></span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Dispatch:</span>
                <span className="text-xs font-semibold">{dashboardStats.tomorrowDispatchesCount || 0} <span className="text-green-600">({dashboardStats.tomorrowDispatchesQty || 0} qty)</span></span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <IndianRupee size={14} />
              <span>Net Receivable</span>
            </div>
            <p className="text-lg font-bold text-green-700">{formatCurrency(dashboardStats.totalNetReceivable)}</p>
            <p className="text-xs text-gray-500">Invoiced: {formatCurrency(dashboardStats.totalInvoiced)}</p>
          </div>
          <div className="bg-white rounded-lg border p-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              <CreditCard size={14} />
              <span>Payments</span>
            </div>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(dashboardStats.totalPayments)}</p>
            <p className={`text-xs ${dashboardStats.pendingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              Pending: {formatCurrency(dashboardStats.pendingAmount)}
            </p>
          </div>
        </div>
        
        {/* Rejection Loss Block */}
        <div key={`rejection-loss-${rejectionLossDateFrom}-${rejectionLossDateTo}`} className="bg-red-50 rounded-lg border border-red-200 p-4 mb-4">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <span className="text-sm font-semibold text-red-800">Rejection Loss</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRejectionAnalyticsModal(true)}
              className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
              data-testid="view-rejection-details-btn"
            >
              <Eye size={14} className="mr-1" />
              View Details
            </Button>
          </div>
          
          {/* Date Filters Row */}
          <div className="flex flex-wrap items-center gap-3 mb-3 bg-white/60 p-2 rounded-lg border border-red-100">
            <span className="text-xs text-red-600 font-medium">Period:</span>
            <div className="flex items-center gap-1 bg-white rounded border border-red-200 px-2">
              <input
                type="date"
                value={rejectionLossDateFrom}
                onChange={(e) => {
                  console.log('Date From changed to:', e.target.value);
                  setRejectionLossDateFrom(e.target.value);
                }}
                className="h-7 text-xs border-0 focus:ring-0 focus:outline-none bg-transparent"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <span className="text-xs text-gray-500">to</span>
            <div className="flex items-center gap-1 bg-white rounded border border-red-200 px-2">
              <input
                type="date"
                value={rejectionLossDateTo}
                onChange={(e) => {
                  console.log('Date To changed to:', e.target.value);
                  setRejectionLossDateTo(e.target.value);
                }}
                className="h-7 text-xs border-0 focus:ring-0 focus:outline-none bg-transparent"
                style={{ colorScheme: 'light' }}
              />
            </div>
            <span className="text-[10px] text-gray-400 ml-2">
              ({rejectionLossDateFrom} → {rejectionLossDateTo})
            </span>
          </div>
          
          {/* Stats Row */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold text-red-600">
                {formatCurrency(rejectionAnalyticsState.totalValue)} <span className="text-lg font-normal">MRP</span>
                {rejectionAnalyticsState.totalCogs > 0 && (
                  <span className="text-lg text-gray-500 font-normal ml-2">
                    ({formatCurrency(rejectionAnalyticsState.totalCogs)} COGS)
                  </span>
                )}
              </p>
              <p className="text-xs text-red-500 mt-1">
                {rejectionAnalyticsState.count} rejection(s) • {rejectionAnalyticsState.totalQty} items
                <span className="text-gray-400 ml-2">(of {rejections.length} total)</span>
              </p>
            </div>
            {rejectionAnalyticsState.topProductByQty && (
              <div className="text-right">
                <p className="text-[10px] text-red-400 uppercase">Top Rejected Product</p>
                <p className="text-xs font-medium text-red-700">{rejectionAnalyticsState.topProductByQty.name}</p>
                <p className="text-[10px] text-red-500">{formatCurrency(rejectionAnalyticsState.topProductByQty.value)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Retailer Earnings Block - Uses same date filter as Rejection Loss */}
        <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4 mb-4">
          {/* Header Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp size={18} className="text-emerald-600" />
              </div>
              <span className="text-sm font-semibold text-emerald-800">
                Retailer Earnings {selectedRetailer ? `(${retailers.find(r => r.id === selectedRetailer)?.company_name || 'Selected'})` : '(All Retailers)'}
              </span>
            </div>
            {/* View Mode Tabs */}
            <div className="flex items-center gap-1">
              {['daily', 'weekly', 'monthly'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setEarningsChartViewMode(mode)}
                  className={`px-2 py-1 text-xs font-medium rounded-full transition-all ${
                    earningsChartViewMode === mode
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Earnings Charts */}
          {(() => {
            // Filter dispatches by date range and optionally by retailer
            // Filter dispatches by date range and optionally by retailer
            // Using allDispatchesForRejection which has full date range data
            const filteredDispatches = allDispatchesForRejection.filter(d => {
              const dispDate = d.dispatch_date?.split('T')[0];
              if (!dispDate || dispDate < rejectionLossDateFrom || dispDate > rejectionLossDateTo) return false;
              if (selectedRetailer && d.retailer_id !== selectedRetailer) return false;
              return true;
            });
            
            // Filter rejections by date range and optionally by retailer
            const filteredRejs = rejections.filter(r => {
              const rejDate = r.rejection_date?.split('T')[0];
              if (!rejDate || rejDate < rejectionLossDateFrom || rejDate > rejectionLossDateTo) return false;
              if (selectedRetailer && r.retailer_id !== selectedRetailer) return false;
              return true;
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
              
              // Get retailer's commission percentage
              const retailer = retailers.find(r => r.id === d.retailer_id);
              const commPct = retailer?.commission_percentage || 0;
              
              let key, label, shortLabel;
              if (earningsChartViewMode === 'daily') {
                key = date;
                label = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
                shortLabel = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
              } else if (earningsChartViewMode === 'weekly') {
                key = getWeekStart(date);
                label = formatWeekLabel(key);
                shortLabel = new Date(key).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
              } else {
                key = getMonthKey(date);
                label = formatMonthLabel(key);
                shortLabel = label;
              }
              
              if (!groupedData[key]) {
                groupedData[key] = { 
                  key, label, shortLabel, 
                  grossOrderValue: 0,  // Total dispatched value (before rejections)
                  orderValue: 0,       // Net value (after rejections) - kept for reference
                  totalCommission: 0, 
                  orderDays: new Set(), 
                  rejectionValue: 0,
                  rejectionCogs: 0,
                  rejectionCount: 0 
                };
              }
              
              const mrp = d.total_mrp_value > 0 ? d.total_mrp_value : 
                (d.items?.reduce((s, i) => s + ((i.supplied_qty || 0) * (i.mrp || 0)), 0) || 0);
              groupedData[key].grossOrderValue += mrp;
              groupedData[key].orderValue += mrp;
              groupedData[key].totalCommission += mrp * commPct / 100;
              groupedData[key].orderDays.add(date);
            });
            
            // Track rejections separately (don't subtract from gross order value)
            // Rejections are shown as a separate metric
            filteredRejs.forEach(r => {
              const date = r.rejection_date?.split('T')[0];
              if (!date) return;
              
              const retailer = retailers.find(ret => ret.id === r.retailer_id);
              const commPct = retailer?.commission_percentage || 0;
              const rejValue = r.rejection_value || 0;
              const rejCogs = r.rejection_cogs || 0;
              
              let key;
              if (earningsChartViewMode === 'daily') {
                key = date;
              } else if (earningsChartViewMode === 'weekly') {
                key = getWeekStart(date);
              } else {
                key = getMonthKey(date);
              }
              
              if (groupedData[key]) {
                // Only update net orderValue (for reference), NOT grossOrderValue
                groupedData[key].orderValue -= rejValue;
                groupedData[key].totalCommission -= rejValue * commPct / 100;
                groupedData[key].rejectionValue += rejValue;
                groupedData[key].rejectionCogs += rejCogs;
                groupedData[key].rejectionCount += 1;
              } else {
                // Create entry for periods with only rejections (no dispatches)
                let label, shortLabel;
                if (earningsChartViewMode === 'daily') {
                  label = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
                  shortLabel = new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                } else if (earningsChartViewMode === 'weekly') {
                  label = formatWeekLabel(key);
                  shortLabel = new Date(key).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                } else {
                  label = formatMonthLabel(key);
                  shortLabel = label;
                }
                groupedData[key] = { 
                  key, label, shortLabel, 
                  grossOrderValue: 0,
                  orderValue: 0, 
                  totalCommission: 0, 
                  orderDays: new Set(),
                  rejectionValue: rejValue,
                  rejectionCogs: rejCogs,
                  rejectionCount: 1 
                };
              }
            });
            
            // Calculate final values
            const chartData = Object.values(groupedData)
              .map(d => {
                const daysCount = d.orderDays.size || 1;
                return {
                  ...d,
                  // Use grossOrderValue for display (total dispatched value before rejections)
                  orderValue: Math.round(d.grossOrderValue || 0),
                  netOrderValue: Math.round(Math.max(0, d.orderValue)),
                  earnings: Math.round(Math.max(0, d.totalCommission)),
                  avgEarningsPerDay: Math.round(Math.max(0, d.totalCommission) / daysCount),
                  rejectionValue: Math.round(d.rejectionValue || 0),
                  rejectionCogs: Math.round(d.rejectionCogs || 0),
                  rejectionCount: d.rejectionCount || 0,
                  daysCount
                };
              })
              .sort((a, b) => a.key.localeCompare(b.key));
            
            // Calculate totals for summary - use grossOrderValue for Total Order Value
            const totalOrderValue = chartData.reduce((sum, d) => sum + d.orderValue, 0);
            const totalEarnings = chartData.reduce((sum, d) => sum + d.earnings, 0);
            const totalRejections = chartData.reduce((sum, d) => sum + d.rejectionValue, 0);
            const totalRejectionCogs = chartData.reduce((sum, d) => sum + d.rejectionCogs, 0);
            const totalRejectionCount = chartData.reduce((sum, d) => sum + d.rejectionCount, 0);
            const totalDays = new Set(filteredDispatches.map(d => d.dispatch_date?.split('T')[0]).filter(Boolean)).size;
            const avgEarningsPerDay = totalDays > 0 ? Math.round(totalEarnings / totalDays) : 0;
            
            if (chartData.length === 0) {
              return (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No dispatch data available for the selected period
                </div>
              );
            }
            
            // Colors for bars
            const orderColors = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#3b82f6', '#60a5fa'];
            const earningColors = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#10b981', '#34d399'];
            const avgColors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#f59e0b', '#fbbf24'];
            const rejectionColors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#ef4444', '#f87171'];
            
            const formatValue = (value) => {
              if (value >= 100000) return `₹${(value/100000).toFixed(1)}L`;
              if (value >= 1000) return `₹${(value/1000).toFixed(1)}k`;
              return `₹${value}`;
            };
            
            const viewModeLabel = earningsChartViewMode === 'daily' ? 'Daily' : earningsChartViewMode === 'weekly' ? 'Weekly' : 'Monthly';
            
            return (
              <>
                {/* Summary Row - Order: Total Order, Rejections, Total Earnings, Avg Earnings */}
                {/* 2x2 grid on mobile, 4 columns on desktop */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-3">
                  <div className="bg-white/70 rounded-lg p-2 border border-blue-100">
                    <p className="text-[9px] md:text-[10px] text-blue-600 uppercase font-medium truncate">Total Order Value</p>
                    <p className="text-sm md:text-lg font-bold text-blue-700">{formatCurrency(totalOrderValue)}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2 border border-red-100">
                    <p className="text-[9px] md:text-[10px] text-red-600 uppercase font-medium truncate">Total Rejections</p>
                    <p className="text-sm md:text-lg font-bold text-red-700">
                      {formatCurrency(totalRejections)} <span className="text-xs font-normal">MRP</span>
                      {totalRejectionCogs > 0 && (
                        <span className="text-xs text-gray-500 font-normal ml-1">({formatCurrency(totalRejectionCogs)} COGS)</span>
                      )}
                    </p>
                    <p className="text-[8px] md:text-[9px] text-gray-500">
                      ({totalRejectionCount} items)
                    </p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2 border border-emerald-100">
                    <p className="text-[9px] md:text-[10px] text-emerald-600 uppercase font-medium truncate">Total Earnings</p>
                    <p className="text-sm md:text-lg font-bold text-emerald-700">{formatCurrency(totalEarnings)}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2 border border-amber-100">
                    <p className="text-[9px] md:text-[10px] text-amber-600 uppercase font-medium truncate">Avg. Earning/Day</p>
                    <p className="text-sm md:text-lg font-bold text-amber-700">{formatCurrency(avgEarningsPerDay)}</p>
                    <p className="text-[8px] md:text-[9px] text-gray-500">({totalDays} days)</p>
                  </div>
                </div>
                
                {/* Charts Row - Order: Total Order, Rejections, Total Earnings, Avg Earnings/Day */}
                {/* Touch-friendly: tap to see tooltip, tap elsewhere to dismiss */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Order Value Chart */}
                  <div className="bg-white/80 rounded-xl p-2 border border-blue-100">
                    <p className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <ShoppingCart size={12} className="text-blue-500" />
                      {viewModeLabel} Order Value
                    </p>
                    <div className="h-28 touch-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 22, right: 5, left: -20, bottom: 5 }}>
                          <XAxis 
                            dataKey="shortLabel" 
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={chartData.length > 5 ? -45 : 0}
                            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                            height={chartData.length > 5 ? 30 : 15}
                          />
                          <YAxis hide={true} />
                          <Tooltip 
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                            formatter={(value) => [`₹${value.toLocaleString()}`, 'Order Value']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                            trigger="click"
                          />
                          <Bar dataKey="orderValue" radius={[3, 3, 0, 0]} maxBarSize={25}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={orderColors[index % orderColors.length]} />
                            ))}
                            <LabelList 
                              dataKey="orderValue" 
                              position="top" 
                              style={{ fontSize: 9, fontWeight: 600, fill: '#3b82f6' }}
                              formatter={formatValue}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Rejections Chart */}
                  <div className="bg-white/80 rounded-xl p-2 border border-red-100">
                    <p className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <AlertTriangle size={12} className="text-red-500" />
                      {viewModeLabel} Rejections
                    </p>
                    <div className="h-28 touch-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 22, right: 5, left: -20, bottom: 5 }}>
                          <XAxis 
                            dataKey="shortLabel" 
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={chartData.length > 5 ? -45 : 0}
                            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                            height={chartData.length > 5 ? 30 : 15}
                          />
                          <YAxis hide={true} />
                          <Tooltip 
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                            formatter={(value, name, props) => {
                              const cogs = props.payload.rejectionCogs;
                              const cogsStr = cogs > 0 ? ` (₹${cogs.toLocaleString()} COGS)` : '';
                              return [
                                `₹${value.toLocaleString()} MRP${cogsStr} • ${props.payload.rejectionCount} items`, 
                                'Rejections'
                              ];
                            }}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                            trigger="click"
                          />
                          <Bar dataKey="rejectionValue" radius={[3, 3, 0, 0]} maxBarSize={25}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={rejectionColors[index % rejectionColors.length]} />
                            ))}
                            <LabelList 
                              dataKey="rejectionValue" 
                              position="top" 
                              style={{ fontSize: 9, fontWeight: 600, fill: '#dc2626' }}
                              formatter={formatValue}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Earnings Chart */}
                  <div className="bg-white/80 rounded-xl p-2 border border-emerald-100">
                    <p className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <TrendingUp size={12} className="text-emerald-500" />
                      {viewModeLabel} Earnings
                    </p>
                    <div className="h-28 touch-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 22, right: 5, left: -20, bottom: 5 }}>
                          <XAxis 
                            dataKey="shortLabel" 
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={chartData.length > 5 ? -45 : 0}
                            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                            height={chartData.length > 5 ? 30 : 15}
                          />
                          <YAxis hide={true} />
                          <Tooltip 
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                            formatter={(value) => [`₹${value.toLocaleString()}`, 'Earnings']}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                            trigger="click"
                          />
                          <Bar dataKey="earnings" radius={[3, 3, 0, 0]} maxBarSize={25}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={earningColors[index % earningColors.length]} />
                            ))}
                            <LabelList 
                              dataKey="earnings" 
                              position="top" 
                              style={{ fontSize: 9, fontWeight: 600, fill: '#10b981' }}
                              formatter={formatValue}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Avg Earnings/Day Chart */}
                  <div className="bg-white/80 rounded-xl p-2 border border-amber-100">
                    <p className="text-[10px] font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <DollarSign size={12} className="text-amber-500" />
                      Avg. Earning/Day
                    </p>
                    <div className="h-28 touch-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 22, right: 5, left: -20, bottom: 5 }}>
                          <XAxis 
                            dataKey="shortLabel" 
                            tick={{ fontSize: 9, fill: '#6b7280' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={chartData.length > 5 ? -45 : 0}
                            textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                            height={chartData.length > 5 ? 30 : 15}
                          />
                          <YAxis hide={true} />
                          <Tooltip 
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                            formatter={(value, name, props) => [
                              `₹${value.toLocaleString()} (${props.payload.daysCount} days)`, 
                              'Avg/Day'
                            ]}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
                            trigger="click"
                          />
                          <Bar dataKey="avgEarningsPerDay" radius={[3, 3, 0, 0]} maxBarSize={25}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={avgColors[index % avgColors.length]} />
                            ))}
                            <LabelList 
                              dataKey="avgEarningsPerDay" 
                              position="top" 
                              style={{ fontSize: 9, fontWeight: 600, fill: '#d97706' }}
                              formatter={formatValue}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Immediately Payable Block (5-Day Credit) */}
        {immediatelyPayable && immediatelyPayable.grand_totals && immediatelyPayable.grand_totals.total > 0 && (() => {
          // Get selected retailer's upfront percentage
          const selectedRetailerData = retailers.find(r => r.id === selectedRetailer);
          const upfrontPct = selectedRetailerData?.upfront_collection_percentage || 50;
          const isFullUpfront = upfrontPct === 100;
          
          // Get pending credit notes - filter by retailer only if one is selected
          // Only include pending/partial status (unadjusted credit notes)
          const retailerCreditNotes = creditNotes.filter(cn => {
            const isUnadjusted = cn.status === 'pending' || cn.status === 'partial';
            if (!isUnadjusted) return false;
            // If a specific retailer is selected, filter by that retailer
            if (selectedRetailer) {
              return cn.retailer_id === selectedRetailer;
            }
            // If "All Retailers", include all pending credit notes
            return true;
          });
          // Sum up the pending_amount (unadjusted portion) of each credit note
          const totalPendingCredit = retailerCreditNotes.reduce((sum, cn) => sum + (cn.pending_amount || cn.amount || 0), 0);
          
          return (
          <div className={`rounded-lg border p-4 mb-4 ${isFullUpfront ? 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200' : 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {isFullUpfront ? (
                  <CreditCard size={18} className="text-purple-600" />
                ) : (
                  <AlertTriangle size={18} className="text-red-600" />
                )}
                <span className={`text-sm font-semibold ${isFullUpfront ? 'text-purple-800' : 'text-red-800'}`}>
                  Payment Details {isFullUpfront && <span className="text-xs font-normal text-purple-600 ml-1">(100% Upfront)</span>}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${isFullUpfront ? 'text-purple-700' : 'text-red-700'}`}>
                  {formatCurrency(immediatelyPayable.grand_totals.total)}
                </p>
                {totalPendingCredit > 0 && (
                  <p className="text-xs text-gray-500">
                    +₹{totalPendingCredit.toLocaleString()} pending credit available
                  </p>
                )}
              </div>
            </div>
            
            {/* 100% UPFRONT RETAILER LAYOUT */}
            {isFullUpfront ? (
              <>
                {/* 2 Cards - Payable Amount and Credit Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  {/* Payable Amount Card */}
                  <div 
                    className={`bg-white/80 rounded p-3 border cursor-pointer transition-all hover:shadow-md ${
                      expandedPayableSection === 'payable' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-100'
                    }`}
                    onClick={() => setExpandedPayableSection(expandedPayableSection === 'payable' ? null : 'payable')}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-gray-500">Total Payable</p>
                        <p className="text-lg font-bold text-purple-600">
                          {formatCurrency(immediatelyPayable.grand_totals.total)}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          From pending invoices
                        </p>
                      </div>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedPayableSection === 'payable' ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  
                  {/* Credit Notes Card */}
                  <div 
                    className={`bg-white/80 rounded p-3 border cursor-pointer transition-all hover:shadow-md ${
                      expandedPayableSection === 'credits' ? 'border-green-500 ring-2 ring-green-200' : 'border-green-100'
                    }`}
                    onClick={() => setExpandedPayableSection(expandedPayableSection === 'credits' ? null : 'credits')}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-gray-500">Pending Credit Notes</p>
                        <p className={`text-lg font-bold ${retailerCreditNotes.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {retailerCreditNotes.length > 0 ? formatCurrency(totalPendingCredit) : '₹0'}
                        </p>
                        {retailerCreditNotes.length > 0 && (
                          <p className="text-[10px] text-green-600">
                            {retailerCreditNotes.length} credit note(s) for future invoices
                          </p>
                        )}
                      </div>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedPayableSection === 'credits' ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </div>
                
                {/* Expandable Details */}
                {expandedPayableSection === 'payable' && immediatelyPayable.detailed_entries && (
                  <div className="bg-white rounded-lg border p-3 mb-3 max-h-64 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Date-wise Breakdown</p>
                    <div className="space-y-1">
                      {[...(immediatelyPayable.detailed_entries.upfront || []), ...(immediatelyPayable.detailed_entries.credit_due || []), ...(immediatelyPayable.detailed_entries.overdue || [])].map((entry, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-gray-50">
                          <div className="flex items-center gap-2">
                            {entry.overdue_days ? (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">
                                +{entry.overdue_days}d overdue
                              </span>
                            ) : entry.type === 'today' ? (
                              <span className="px-1.5 py-0.5 rounded bg-purple-500 text-white text-[10px]">Today</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-orange-400 text-white text-[10px]">
                                {entry.days_since}d ago
                              </span>
                            )}
                            <span className="text-gray-700 font-medium">{entry.retailer_name}</span>
                            <span className="text-gray-400">({new Date(entry.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})})</span>
                          </div>
                          <span className={`font-bold ${entry.overdue_days ? 'text-red-600' : 'text-purple-600'}`}>{formatCurrency(entry.amount)}</span>
                        </div>
                      ))}
                      {(!immediatelyPayable.detailed_entries.upfront?.length && !immediatelyPayable.detailed_entries.credit_due?.length && !immediatelyPayable.detailed_entries.overdue?.length) && (
                        <p className="text-xs text-gray-400 text-center py-2">No entries</p>
                      )}
                    </div>
                  </div>
                )}
                
                {expandedPayableSection === 'credits' && (
                  <div className="bg-white rounded-lg border p-3 mb-3 max-h-64 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Available Credit Notes</p>
                    {retailerCreditNotes.length > 0 ? (
                      <div className="space-y-2">
                        {retailerCreditNotes.map((cn, idx) => (
                          <div key={cn.id || idx} className="flex justify-between items-center text-xs py-2 px-2 bg-green-50 rounded border border-green-100">
                            <div>
                              <span className="font-semibold text-green-700">{cn.credit_note_number}</span>
                              <span className="text-gray-500 ml-2">from {cn.original_invoice_number}</span>
                              {cn.commission_deducted > 0 && (
                                <div className="text-[10px] text-gray-400">
                                  (MRP ₹{cn.rejection_value?.toLocaleString()} - {cn.commission_percentage}% comm)
                                </div>
                              )}
                            </div>
                            <span className="font-bold text-green-600">₹{(cn.pending_amount || 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-2">No pending credit notes</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* NON-100% UPFRONT RETAILER LAYOUT (Original) */
              <>
            {/* 3 Summary Cards - X% Upfront, Final Payment, and Credit Notes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              {/* X% Upfront Card */}
              <div 
                className={`bg-white/80 rounded p-3 border cursor-pointer transition-all hover:shadow-md ${
                  expandedPayableSection === 'upfront' ? 'border-green-500 ring-2 ring-green-200' : 'border-green-100'
                }`}
                onClick={() => setExpandedPayableSection(expandedPayableSection === 'upfront' ? null : 'upfront')}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500">{upfrontPct}% Upfront</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(immediatelyPayable.grand_totals.upfront_50_total || ((immediatelyPayable.grand_totals.today_50_percent || 0) + (immediatelyPayable.grand_totals.pending_50_recent || 0)))}
                    </p>
                  </div>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedPayableSection === 'upfront' ? 'rotate-180' : ''}`} />
                </div>
              </div>
              
              {/* Final Payment Card */}
              <div 
                className={`bg-white/80 rounded p-3 border cursor-pointer transition-all hover:shadow-md ${
                  expandedPayableSection === 'final' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-orange-100'
                }`}
                onClick={() => setExpandedPayableSection(expandedPayableSection === 'final' ? null : 'final')}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500">Final Payment</p>
                    <p className="text-lg font-bold text-orange-600">
                      {formatCurrency(immediatelyPayable.grand_totals.final_payment_total || ((immediatelyPayable.grand_totals.due_today_remaining || 0) + (immediatelyPayable.grand_totals.overdue || 0)))}
                    </p>
                  </div>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedPayableSection === 'final' ? 'rotate-180' : ''}`} />
                </div>
              </div>
              
              {/* Credit Notes Card */}
              <div 
                className={`bg-white/80 rounded p-3 border cursor-pointer transition-all hover:shadow-md ${
                  expandedPayableSection === 'credits' ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-100'
                }`}
                onClick={() => setExpandedPayableSection(expandedPayableSection === 'credits' ? null : 'credits')}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs text-gray-500">Credit Notes</p>
                    <p className={`text-lg font-bold ${totalPendingCredit > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                      {totalPendingCredit > 0 ? `- ${formatCurrency(totalPendingCredit)}` : '₹0'}
                    </p>
                    {totalPendingCredit > 0 && (
                      <p className="text-[10px] text-purple-600">
                        {retailerCreditNotes.length} credit note(s)
                      </p>
                    )}
                  </div>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedPayableSection === 'credits' ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </div>
            
            {/* Expandable Detailed Breakdown */}
            {expandedPayableSection && immediatelyPayable.detailed_entries && (
              <div className="bg-white rounded-lg border p-3 mb-3 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  {expandedPayableSection === 'upfront' && `${upfrontPct}% Upfront Breakdown`}
                  {expandedPayableSection === 'final' && 'Final Payment Breakdown'}
                </p>
                <div className="space-y-1">
                  {expandedPayableSection === 'upfront' && immediatelyPayable.detailed_entries.upfront?.map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-white text-[10px] ${entry.type === 'today' ? 'bg-green-500' : 'bg-orange-400'}`}>
                          {entry.type === 'today' ? 'Today' : `${entry.days_since}d ago`}
                        </span>
                        <span className="text-gray-700 font-medium">{entry.retailer_name}</span>
                        <span className="text-gray-400">({new Date(entry.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})})</span>
                      </div>
                      <span className="font-bold text-green-600">{formatCurrency(entry.amount)}</span>
                    </div>
                  ))}
                  {expandedPayableSection === 'final' && [...(immediatelyPayable.detailed_entries.credit_due || []), ...(immediatelyPayable.detailed_entries.overdue || [])].map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        {entry.overdue_days ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px]">
                            +{entry.overdue_days}d overdue
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[10px]">
                            Due today
                          </span>
                        )}
                        <span className="text-gray-700 font-medium">{entry.retailer_name}</span>
                        <span className="text-gray-400">({new Date(entry.invoice_date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})})</span>
                      </div>
                      <span className={`font-bold ${entry.overdue_days ? 'text-red-600' : 'text-orange-600'}`}>{formatCurrency(entry.amount)}</span>
                    </div>
                  ))}
                  {((expandedPayableSection === 'upfront' && (!immediatelyPayable.detailed_entries.upfront || immediatelyPayable.detailed_entries.upfront.length === 0)) ||
                    (expandedPayableSection === 'final' && (!immediatelyPayable.detailed_entries.credit_due?.length && !immediatelyPayable.detailed_entries.overdue?.length))) && (
                    <p className="text-xs text-gray-400 text-center py-2">No entries in this category</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Credit Notes Expandable Section */}
            {expandedPayableSection === 'credits' && (
              <div className="bg-white rounded-lg border p-3 mb-3 max-h-64 overflow-y-auto">
                <p className="text-xs font-semibold text-gray-600 mb-2">Pending Credit Notes</p>
                <div className="space-y-1">
                  {retailerCreditNotes.length > 0 ? retailerCreditNotes.map((cn, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px]">
                          {cn.credit_note_number}
                        </span>
                        <span className="text-gray-700">{cn.source === 'excess_payment' ? 'Excess Payment' : 'Rejection'}</span>
                        <span className="text-gray-400">({new Date(cn.created_at).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})})</span>
                      </div>
                      <span className="font-bold text-purple-600">{formatCurrency(cn.pending_amount || cn.amount)}</span>
                    </div>
                  )) : (
                    <p className="text-xs text-gray-400 text-center py-2">No pending credit notes</p>
                  )}
                </div>
              </div>
            )}
              </>
            )}
            
            {/* Retailer-wise breakdown (collapsed summary) - only for non-100% upfront */}
            {!isFullUpfront && !expandedPayableSection && immediatelyPayable.retailers && immediatelyPayable.retailers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">By Outlet:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                  {immediatelyPayable.retailers.slice(0, 6).map((r, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white rounded px-2 py-1 text-xs border">
                      <span className="text-gray-700 truncate mr-2">{r.retailer_name}</span>
                      <span className="font-bold text-red-600 whitespace-nowrap">{formatCurrency(r.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 mb-4 border-b pb-2">
          <div className="inline-flex gap-2 min-w-max">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setActiveTab(tab.id);
                    // Refresh tab-specific data when switching tabs
                    if (tab.id === 'invoices') loadInvoices();
                    if (tab.id === 'rejections' && rejections.length === 0) loadRejections();
                    if (tab.id === 'creditNotes' && creditNotes.length === 0) loadCreditNotes();
                  }}
                  className={`whitespace-nowrap text-xs md:text-sm ${activeTab === tab.id ? 'bg-[#14532D]' : ''}`}
                >
                  <Icon size={14} className="mr-1" />
                  {tab.label}
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/20 text-xs">{tab.count}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* ==================== DAILY REQUIREMENT TAB ==================== */}
        {activeTab === 'dailyRequirement' && (
          <Card>
            <CardHeader className="py-3 border-b">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShoppingCart size={16} className="text-green-600" />
                    Daily Purchase Requirement
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Calculates from indents for the selected date</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={dailyReqRetailer}
                    onChange={(e) => setDailyReqRetailer(e.target.value)}
                    className="h-9 px-3 rounded-md border border-gray-200 text-sm"
                  >
                    <option value="">All Retailers</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                  <Input
                    type="date"
                    value={dailyReqDate}
                    onChange={(e) => setDailyReqDate(e.target.value)}
                    className="h-9 w-40"
                  />
                  <Button 
                    onClick={calculateDailyRequirement}
                    disabled={dailyReqLoading}
                    className="bg-[#14532D] h-9"
                  >
                    {dailyReqLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Loading...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RefreshCw size={14} />
                        Refresh
                      </span>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Original vs Saved Toggle */}
              {(originalReqData.length > 0 || savedReqData.length > 0) && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <span className="text-xs text-gray-500 mr-2">View:</span>
                  <Button
                    variant={dailyReqViewMode === 'original' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setDailyReqViewMode('original');
                      setDailyReqData([...originalReqData]);
                      setDeletedItems([]);
                    }}
                    className={`h-8 text-xs ${dailyReqViewMode === 'original' ? 'bg-blue-600' : ''}`}
                  >
                    📋 Original (from Indents)
                  </Button>
                  <Button
                    variant={dailyReqViewMode === 'saved' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setDailyReqViewMode('saved');
                      if (savedReqData.length > 0) {
                        setDailyReqData([...savedReqData]);
                      } else {
                        // Copy from original to start editing
                        setDailyReqData([...originalReqData]);
                      }
                    }}
                    className={`h-8 text-xs ${dailyReqViewMode === 'saved' ? 'bg-green-600' : ''}`}
                  >
                    ✏️ Edited List {savedReqData.length > 0 ? '(Saved)' : '(New)'}
                  </Button>
                  
                  {/* Save and Export buttons - only in Edited mode */}
                  {dailyReqViewMode === 'saved' && dailyReqData.length > 0 && (
                    <>
                      <div className="w-px h-6 bg-gray-300 mx-1"></div>
                      <Button 
                        variant="outline" 
                        onClick={saveDailyRequirement} 
                        disabled={dailyReqSaving || dailyReqSaved}
                        className={`h-8 text-xs ${dailyReqSaved ? 'border-green-500 text-green-600' : ''}`}
                      >
                        {dailyReqSaving ? (
                          <span className="flex items-center gap-1">
                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            Saving...
                          </span>
                        ) : dailyReqSaved ? (
                          <span className="flex items-center gap-1">
                            <Check size={12} />
                            Saved
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <FileSpreadsheet size={12} />
                            Save Changes
                          </span>
                        )}
                      </Button>
                    </>
                  )}
                  
                  {dailyReqData.length > 0 && (
                    <>
                      <select 
                        value={dailyReqPrintLang} 
                        onChange={(e) => setDailyReqPrintLang(e.target.value)}
                        className="h-8 px-2 rounded-md border border-gray-200 text-xs bg-white"
                        title="Select language for PDF/Excel"
                      >
                        <option value="en">English</option>
                        <option value="hi">हिंदी</option>
                        <option value="mr">मराठी</option>
                      </select>
                      <Button variant="outline" onClick={printDailyRequirement} className="h-8 text-xs">
                        <Download size={12} className="mr-1" />
                        PDF
                      </Button>
                      <Button variant="outline" onClick={exportDailyReqToExcel} className="h-8 text-xs text-green-700 border-green-300 hover:bg-green-50">
                        <FileSpreadsheet size={12} className="mr-1" />
                        Excel
                      </Button>
                    </>
                  )}
                </div>
              )}
              
              {/* Re-add Deleted Items */}
              {dailyReqViewMode === 'saved' && deletedItems.length > 0 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-dashed">
                  <span className="text-xs text-orange-600">Deleted items ({deletedItems.length}):</span>
                  <select
                    className="h-8 px-2 rounded-md border border-orange-200 text-xs bg-orange-50"
                    value=""
                    onChange={(e) => {
                      const idx = parseInt(e.target.value);
                      if (!isNaN(idx)) {
                        const item = deletedItems[idx];
                        setDailyReqData(prev => [...prev, item]);
                        setDeletedItems(prev => prev.filter((_, i) => i !== idx));
                        setDailyReqSaved(false);
                      }
                    }}
                  >
                    <option value="">+ Re-add item...</option>
                    {deletedItems.map((item, idx) => (
                      <option key={idx} value={idx}>
                        {item.productName} ({item.qtyUnits} units)
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDailyReqData(prev => [...prev, ...deletedItems]);
                      setDeletedItems([]);
                      setDailyReqSaved(false);
                    }}
                    className="h-8 text-xs text-orange-600 hover:text-orange-700"
                  >
                    Re-add All
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4" id="daily-requirement-print">
              {/* Sub-tabs: Purchase and Stickers & MRP */}
              <div className="flex gap-2 mb-4 border-b pb-2">
                <Button
                  variant={dailyReqSubTab === 'purchase' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setDailyReqSubTab('purchase')}
                  className={dailyReqSubTab === 'purchase' ? 'bg-[#14532D]' : ''}
                >
                  <ShoppingCart size={14} className="mr-1" />
                  Purchase
                </Button>
                <Button
                  variant={dailyReqSubTab === 'stickersMrp' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setDailyReqSubTab('stickersMrp');
                    // Always recalculate stickers when switching to this tab
                    calculateStickersData();
                  }}
                  className={dailyReqSubTab === 'stickersMrp' ? 'bg-[#14532D]' : ''}
                >
                  <Tag size={14} className="mr-1" />
                  Stickers & MRP
                </Button>
              </div>

              {/* Purchase Sub-tab */}
              {dailyReqSubTab === 'purchase' && (
                <>
                  {dailyReqError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-center">
                      <AlertTriangle size={24} className="mx-auto mb-2" />
                      <p>{dailyReqError}</p>
                    </div>
                  )}
                  
                  {!dailyReqError && dailyReqData.length === 0 && !dailyReqLoading && (
                    <div className="text-center py-12 text-gray-500">
                      <ShoppingCart size={48} className="mx-auto mb-4 opacity-30" />
                      <p>Select a date and click "Refresh" to view purchase requirements from indents</p>
                      <p className="text-xs mt-2">Combines all retailer indents for the selected date</p>
                    </div>
                  )}
                  
                  {dailyReqData.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">Calculated from indents for {dailyReqDate}.</p>
                      
                      {/* Purchase Price Warning */}
                      {purchasePriceWarning && (
                        <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                          <AlertCircle size={14} className="text-yellow-600" />
                          <span>{purchasePriceWarning}</span>
                        </div>
                      )}
                      
                      {/* Category-wise collapsible sections */}
                      {groupedPurchaseData.sortedCategories.map((category) => {
                        const items = groupedPurchaseData.groups[category];
                        const isExpanded = expandedPurchaseCategories[category];
                        const categoryTotalUnits = items.reduce((sum, item) => sum + item.qtyUnits, 0);
                        const categoryTotalKg = items.reduce((sum, item) => sum + item.qtyKg, 0);
                        const categoryTotalRequirement = items.reduce((sum, item) => sum + item.requirementKg, 0);
                        
                        return (
                          <div key={category} className={`border rounded-lg overflow-hidden ${getCategoryColorClasses(category).split(' ')[2]}`}>
                            {/* Category Header - Clickable */}
                            <div 
                              className={`flex items-center justify-between p-3 cursor-pointer ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')} hover:opacity-90`}
                              onClick={() => togglePurchaseCategory(category)}
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                <span className="font-semibold text-sm">{category}</span>
                                <span className="text-xs opacity-75">({items.length} items)</span>
                              </div>
                              <div className="flex items-center gap-6 text-xs">
                                <span>Units: <strong>{categoryTotalUnits}</strong></span>
                                <span>Qty: <strong>{categoryTotalKg.toFixed(2)} Kg</strong></span>
                                <span>Purchase Req: <strong className="text-blue-700">{categoryTotalRequirement.toFixed(2)} Kg</strong></span>
                              </div>
                            </div>
                            
                            {/* Category Items - Collapsible */}
                            {isExpanded && (
                              <div className="bg-white">
                                {/* Desktop Table View */}
                                <div className="hidden md:block">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b bg-gray-50 text-xs">
                                        <th className="p-2 text-left w-10">#</th>
                                        <th className="p-2 text-left">Product Name</th>
                                        <th className="p-2 text-left w-24">Variant</th>
                                        <th className="p-2 text-center w-20">Qty (Units)</th>
                                        <th className="p-2 text-center w-40">Purchase Req</th>
                                        <th className="p-2 text-center w-28">Req. PP/Kg</th>
                                        <th className="p-2 text-left w-48">Remarks</th>
                                        <th className="p-2 text-center w-10">X</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {items.map((item, localIdx) => {
                                        const globalIdx = dailyReqData.findIndex(d => d.productId === item.productId && d.productName === item.productName);
                                        const displayName = i18n.language === 'hi' && item.productNameHi 
                                          ? item.productNameHi 
                                          : i18n.language === 'mr' && item.productNameMr 
                                            ? item.productNameMr 
                                            : item.productName;
                                        return (
                                          <React.Fragment key={`${item.productId}-${item.variantId || item.variantName}-${localIdx}`}>
                                            <tr 
                                              className={`border-b hover:bg-gray-50 cursor-pointer ${expandedPurchaseItem === `${item.productId}-${item.variantId || localIdx}` ? 'bg-blue-50' : ''}`}
                                              onClick={() => setExpandedPurchaseItem(expandedPurchaseItem === `${item.productId}-${item.variantId || localIdx}` ? null : `${item.productId}-${item.variantId || localIdx}`)}
                                            >
                                              <td className="p-2 text-gray-400 text-xs">{localIdx + 1}</td>
                                              <td className="p-2 font-medium">
                                                <div className="flex items-center gap-1">
                                                  {item.retailers?.length > 0 && (
                                                    expandedPurchaseItem === `${item.productId}-${item.variantId || localIdx}` 
                                                      ? <ChevronDown size={14} className="text-blue-500" />
                                                      : <ChevronRight size={14} className="text-gray-400" />
                                                  )}
                                                  {displayName}
                                                </div>
                                              </td>
                                              <td className="p-2 text-xs text-gray-600">{item.variants || '-'}</td>
                                              <td className="p-2 text-center font-semibold">{item.qtyUnits}</td>
                                              <td className="p-2">
                                                {/* Smart Purchase Req display based on purchase unit */}
                                                {['Piece', 'Packet'].includes(item.purchaseUnit) ? (
                                                  // For Pieces/Packets: show "5 Pieces of 500+ gm"
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      step="1"
                                                      min="0"
                                                      value={Math.round(item.qtyUnits) || 0}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newData = [...dailyReqData];
                                                        newData[globalIdx].qtyUnits = parseFloat(e.target.value) || 0;
                                                        setDailyReqData(newData);
                                                        setDailyReqSaved(false);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="h-7 w-14 text-center text-xs font-bold text-blue-700"
                                                      disabled={dailyReqViewMode === 'original'}
                                                    />
                                                    <span className="text-xs text-gray-600">
                                                      {item.purchaseUnit === 'Piece' ? 'Pcs' : 'Pkts'}
                                                      {item.purchaseWeightName && <span className="text-blue-600"> of {item.purchaseWeightName}</span>}
                                                    </span>
                                                  </div>
                                                ) : item.purchaseUnit === 'Bunch' ? (
                                                  // For Bunches: show "10 Bunches of 350+ gm"
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      step="1"
                                                      min="0"
                                                      value={Math.round(item.qtyUnits) || 0}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newData = [...dailyReqData];
                                                        newData[globalIdx].qtyUnits = parseFloat(e.target.value) || 0;
                                                        setDailyReqData(newData);
                                                        setDailyReqSaved(false);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="h-7 w-14 text-center text-xs font-bold text-blue-700"
                                                      disabled={dailyReqViewMode === 'original'}
                                                    />
                                                    <span className="text-xs text-gray-600">
                                                      Bunches
                                                      {item.purchaseWeightName && <span className="text-blue-600"> of {item.purchaseWeightName}</span>}
                                                    </span>
                                                  </div>
                                                ) : item.purchaseUnit === 'Dozen' ? (
                                                  // For Dozens: show calculated dozens (7 x 1dz + 6 x 0.5dz = 10 dozens)
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      step="0.5"
                                                      min="0"
                                                      value={item.qtyDozens > 0 ? Math.ceil(item.qtyDozens) : Math.round(item.qtyUnits)}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newData = [...dailyReqData];
                                                        newData[globalIdx].qtyDozens = parseFloat(e.target.value) || 0;
                                                        setDailyReqData(newData);
                                                        setDailyReqSaved(false);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="h-7 w-14 text-center text-xs font-bold text-yellow-700"
                                                      disabled={dailyReqViewMode === 'original'}
                                                    />
                                                    <span className="text-xs text-yellow-700 font-semibold">
                                                      Dozens
                                                    </span>
                                                  </div>
                                                ) : item.purchaseUnit === 'Piece' || item.qtyPieces > 0 ? (
                                                  // For Pieces: show pieces count
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      step="1"
                                                      min="0"
                                                      value={item.qtyPieces > 0 ? Math.ceil(item.qtyPieces) : Math.round(item.qtyUnits)}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newData = [...dailyReqData];
                                                        newData[globalIdx].qtyPieces = parseFloat(e.target.value) || 0;
                                                        setDailyReqData(newData);
                                                        setDailyReqSaved(false);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="h-7 w-14 text-center text-xs font-bold text-orange-700"
                                                      disabled={dailyReqViewMode === 'original'}
                                                    />
                                                    <span className="text-xs text-orange-700 font-semibold">
                                                      Pcs
                                                    </span>
                                                  </div>
                                                ) : item.purchaseUnit === 'Packet' || item.qtyPackets > 0 ? (
                                                  // For Packets: show packets count
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      step="1"
                                                      min="0"
                                                      value={item.qtyPackets > 0 ? Math.ceil(item.qtyPackets) : Math.round(item.qtyUnits)}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newData = [...dailyReqData];
                                                        newData[globalIdx].qtyPackets = parseFloat(e.target.value) || 0;
                                                        setDailyReqData(newData);
                                                        setDailyReqSaved(false);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="h-7 w-14 text-center text-xs font-bold text-purple-700"
                                                      disabled={dailyReqViewMode === 'original'}
                                                    />
                                                    <span className="text-xs text-purple-700 font-semibold">
                                                      Pkts
                                                    </span>
                                                  </div>
                                                ) : (
                                                  // Default: show in Kg
                                                  <div className="flex items-center gap-1">
                                                    <Input
                                                      type="number"
                                                      step="0.1"
                                                      min="0"
                                                      value={item.requirementKg}
                                                      onChange={(e) => {
                                                        e.stopPropagation();
                                                        const newData = [...dailyReqData];
                                                        newData[globalIdx].requirementKg = parseFloat(e.target.value) || 0;
                                                        setDailyReqData(newData);
                                                        setDailyReqSaved(false);
                                                      }}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="h-7 w-16 text-center text-xs font-bold text-blue-700"
                                                      disabled={dailyReqViewMode === 'original'}
                                                    />
                                                    <span className="text-xs text-gray-600">Kg</span>
                                                  </div>
                                                )}
                                              </td>
                                              {/* Required Purchase Price (PP/Kg) - Auto-populated from COGS */}
                                              <td className="p-2 text-center">
                                                <Input
                                                  type="number"
                                                  step="0.01"
                                                  min="0"
                                                  value={item.purchasePrice || ''}
                                                  onChange={(e) => {
                                                    e.stopPropagation();
                                                    updatePurchasePrice(globalIdx, e.target.value);
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  placeholder="Req. ₹/Kg"
                                                  className="h-7 w-20 text-center text-xs font-bold text-green-700"
                                                  disabled={dailyReqViewMode === 'original'}
                                                />
                                              </td>
                                              <td className="p-2">
                                                <textarea
                                                  placeholder="Add remarks..."
                                                  value={item.remarks || ''}
                                                  onChange={(e) => {
                                                    const newData = [...dailyReqData];
                                                    newData[globalIdx].remarks = e.target.value;
                                                    setDailyReqData(newData);
                                                    setDailyReqSaved(false);
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="w-full min-w-[200px] text-xs p-2 border rounded resize-y min-h-[36px]"
                                                  disabled={dailyReqViewMode === 'original'}
                                                  rows={2}
                                                />
                                              </td>
                                              <td className="p-2 text-center">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeletedItems(prev => [...prev, dailyReqData[globalIdx]]);
                                                    const newData = dailyReqData.filter((_, i) => i !== globalIdx);
                                                    setDailyReqData(newData);
                                                    setDailyReqSaved(false);
                                                  }}
                                                  className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                                                  disabled={dailyReqViewMode === 'original'}
                                                >
                                                  <X size={12} />
                                                </Button>
                                              </td>
                                            </tr>
                                            {/* Retailer details row - shown when item is expanded */}
                                            {expandedPurchaseItem === `${item.productId}-${item.variantId || localIdx}` && item.retailers?.length > 0 && (
                                              <tr className="bg-blue-50 border-b">
                                                <td></td>
                                                <td colSpan="7" className="p-2">
                                                  <div className="text-xs text-gray-700">
                                                    <span className="font-semibold text-blue-700">Retailers:</span>
                                                    <div className="flex flex-wrap gap-2 mt-1">
                                                      {item.retailers.map((r, rIdx) => (
                                                        <span key={rIdx} className="bg-white px-2 py-1 rounded border text-xs">
                                                          {r.name} <span className="font-semibold text-green-700">({r.qty})</span>
                                                        </span>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </td>
                                              </tr>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className={`border-t font-semibold text-xs ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')}`}>
                                        <td className="p-2" colSpan="3">Category Total</td>
                                        <td className="p-2 text-center">{categoryTotalUnits}</td>
                                        <td className="p-2 text-center text-blue-700">{categoryTotalRequirement.toFixed(2)}</td>
                                        <td className="p-2" colSpan="2"></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                                
                                {/* Mobile Card View - Remarks below each item */}
                                <div className="md:hidden divide-y">
                                  {items.map((item, localIdx) => {
                                    const globalIdx = dailyReqData.findIndex(d => d.productId === item.productId && d.productName === item.productName);
                                    const displayName = i18n.language === 'hi' && item.productNameHi 
                                      ? item.productNameHi 
                                      : i18n.language === 'mr' && item.productNameMr 
                                        ? item.productNameMr 
                                        : item.productName;
                                    return (
                                      <div key={`mobile-${item.productId}-${localIdx}`} className="p-3 space-y-2">
                                        {/* Row 1: Name, Qty, Purchase Req, Delete */}
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-gray-400 w-5">{localIdx + 1}.</span>
                                          <span className="flex-1 font-medium text-sm truncate">{displayName}</span>
                                          <div className="flex items-center gap-1 text-xs">
                                            <span className="text-gray-500">Qty:</span>
                                            <span className="font-semibold">{item.qtyUnits}</span>
                                          </div>
                                          {/* Smart Purchase Req for Mobile */}
                                          {['Piece', 'Packet'].includes(item.purchaseUnit) ? (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                type="number"
                                                step="1"
                                                min="0"
                                                value={Math.round(item.qtyUnits) || 0}
                                                onChange={(e) => {
                                                  const newData = [...dailyReqData];
                                                  newData[globalIdx].qtyUnits = parseFloat(e.target.value) || 0;
                                                  setDailyReqData(newData);
                                                  setDailyReqSaved(false);
                                                }}
                                                className="h-7 w-12 text-center text-xs font-bold text-blue-700"
                                                disabled={dailyReqViewMode === 'original'}
                                              />
                                              <span className="text-[10px] text-gray-600">
                                                {item.purchaseUnit === 'Piece' ? 'Pcs' : 'Pkts'}
                                              </span>
                                            </div>
                                          ) : item.purchaseUnit === 'Bunch' ? (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                type="number"
                                                step="1"
                                                min="0"
                                                value={Math.round(item.qtyUnits) || 0}
                                                onChange={(e) => {
                                                  const newData = [...dailyReqData];
                                                  newData[globalIdx].qtyUnits = parseFloat(e.target.value) || 0;
                                                  setDailyReqData(newData);
                                                  setDailyReqSaved(false);
                                                }}
                                                className="h-7 w-12 text-center text-xs font-bold text-blue-700"
                                                disabled={dailyReqViewMode === 'original'}
                                              />
                                              <span className="text-[10px] text-gray-600">Bunch</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1">
                                              <Input
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                value={item.requirementKg}
                                                onChange={(e) => {
                                                  const newData = [...dailyReqData];
                                                  newData[globalIdx].requirementKg = parseFloat(e.target.value) || 0;
                                                  setDailyReqData(newData);
                                                  setDailyReqSaved(false);
                                                }}
                                                className="h-7 w-14 text-center text-xs font-bold text-blue-700"
                                                disabled={dailyReqViewMode === 'original'}
                                              />
                                              <span className="text-[10px] text-gray-600">Kg</span>
                                            </div>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeletedItems(prev => [...prev, dailyReqData[globalIdx]]);
                                              const newData = dailyReqData.filter((_, i) => i !== globalIdx);
                                              setDailyReqData(newData);
                                              setDailyReqSaved(false);
                                            }}
                                            className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                                            disabled={dailyReqViewMode === 'original'}
                                          >
                                            <X size={14} />
                                          </Button>
                                        </div>
                                        {/* Weight info for Pieces/Packets/Bunches */}
                                        {(item.purchaseUnit && item.purchaseWeightName) && (
                                          <div className="text-[10px] text-blue-600 pl-6">
                                            {item.purchaseUnit === 'Piece' ? 'Each piece' : item.purchaseUnit === 'Packet' ? 'Each packet' : 'Each bunch'} of {item.purchaseWeightName}
                                          </div>
                                        )}
                                        
                                        {/* Row 2: Remarks - Full width below */}
                                        <textarea
                                          placeholder="Add remarks..."
                                          value={item.remarks || ''}
                                          onChange={(e) => {
                                            const newData = [...dailyReqData];
                                            newData[globalIdx].remarks = e.target.value;
                                            setDailyReqData(newData);
                                            setDailyReqSaved(false);
                                          }}
                                          className="w-full text-xs p-2 border rounded resize-y min-h-[50px] bg-gray-50"
                                          disabled={dailyReqViewMode === 'original'}
                                          rows={2}
                                        />
                                      </div>
                                    );
                                  })}
                                  {/* Mobile Category Total */}
                                  <div className={`p-3 font-semibold text-xs ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')}`}>
                                    <div className="flex justify-between">
                                      <span>Category Total</span>
                                      <div className="flex gap-4">
                                        <span>Units: {categoryTotalUnits}</span>
                                        <span className="text-blue-700">Req: {categoryTotalRequirement.toFixed(2)} Kg</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Grand Total */}
                      <div className="border-t-2 bg-gray-100 rounded-lg p-3 flex justify-between items-center font-semibold">
                        <span>Grand Total ({dailyReqData.length} items)</span>
                        <div className="flex items-center gap-6 text-sm">
                          <span>Units: {dailyReqData.reduce((sum, item) => sum + item.qtyUnits, 0)}</span>
                          <span>Qty: {dailyReqData.reduce((sum, item) => sum + item.qtyKg, 0).toFixed(2)} Kg</span>
                          <span className="text-blue-700">Requirement: {dailyReqData.reduce((sum, item) => sum + item.requirementKg, 0).toFixed(2)} Kg</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Stickers Sub-tab */}
              {/* Stickers & MRP Combined Sub-tab */}
              {dailyReqSubTab === 'stickersMrp' && (
                <div>
                  {/* Header with Copy, Refresh, and Save Actions - Date is from main Daily Requirement selector */}
                  <div className="flex flex-col md:flex-row gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      {!canEditMrpForDate(dailyReqDate) && (
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                          Read-only (Only Admin can edit past dates)
                        </span>
                      )}
                      {stickerMrpOverrides.length > 0 && (
                        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                          {stickerMrpOverrides.length} MRP override(s) active
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 ml-auto flex-wrap">
                      {/* Add New Product / MRP Override Button */}
                      <Button 
                        onClick={openAddStickerOverrideModal}
                        variant="outline"
                        className="h-9 border-purple-300 text-purple-600 hover:bg-purple-50"
                        title="Add a product not in today's indents, or set custom MRP override"
                      >
                        <Plus size={14} className="mr-1" />
                        Add Product / Override MRP
                      </Button>
                      <Button 
                        onClick={copyMrpFromPreviousDate}
                        disabled={savingMrp || mrpLoading || !canEditMrpForDate(dailyReqDate)}
                        variant="outline"
                        className="h-9 border-blue-300 text-blue-600 hover:bg-blue-50"
                      >
                        <ClipboardList size={14} className="mr-1" />
                        Copy from Previous Date
                      </Button>
                      <Button 
                        onClick={() => loadMrpData(dailyReqDate)}
                        disabled={mrpLoading}
                        variant="outline"
                        className="h-9"
                      >
                        {mrpLoading ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            Loading...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <RefreshCw size={14} />
                            Refresh
                          </span>
                        )}
                      </Button>
                      <Button 
                        onClick={() => triggerBlinkitScrape('411045')}
                        disabled={scrapingBlinkit || blinkitLoading}
                        variant="outline"
                        className="h-9 border-orange-300 text-orange-600 hover:bg-orange-50"
                        title="Fetch latest prices from Blinkit (Pincode: 411045)"
                      >
                        {scrapingBlinkit ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                            Scraping...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Download size={14} />
                            Fetch Blinkit Prices
                          </span>
                        )}
                      </Button>
                      {mrpData.length === 0 && mrpIndentProducts.length > 0 && (
                        <Button 
                          onClick={initializeMrpData}
                          disabled={savingMrp || mrpLoading || mrpIndentLoading || !canEditMrpForDate(dailyReqDate)}
                          className="h-9 bg-[#14532D]"
                        >
                          {savingMrp ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Initializing...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Plus size={14} />
                              Initialize ({mrpIndentProducts.length} Products)
                            </span>
                          )}
                        </Button>
                      )}
                      {mrpData.length > 0 && (
                        <Button 
                          onClick={saveMrpChanges}
                          disabled={savingMrp || mrpLoading || !mrpHasUnsavedChanges || !canEditMrpForDate(dailyReqDate)}
                          className={`h-9 ${mrpHasUnsavedChanges ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}
                        >
                          {savingMrp ? (
                            <span className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              Saving...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Save size={14} />
                              Save MRP {mrpHasUnsavedChanges && `(${Object.keys(pendingMrpChanges).length})`}
                            </span>
                          )}
                        </Button>
                      )}
                      {/* Print Stickers & MRP Button */}
                      {(mrpData.length > 0 || stickersData.length > 0) && (
                        <Button 
                          onClick={printStickersMrp}
                          variant="outline"
                          className="h-9 border-gray-300 text-gray-700 hover:bg-gray-50"
                          data-testid="print-stickers-mrp-btn"
                        >
                          <Printer size={14} className="mr-1" />
                          Print Stickers
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Loading State */}
                  {(mrpLoading || mrpIndentLoading) ? (
                    <div className="text-center py-12">
                      <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-500">{mrpIndentLoading ? 'Loading indent products...' : 'Loading MRP data...'}</p>
                    </div>
                  ) : mrpIndentProducts.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <IndianRupee size={48} className="mx-auto mb-4 opacity-30" />
                      <p>No retailer indents found for {dailyReqDate}</p>
                      <p className="text-xs mt-2">MRP tab shows products from the day's combined retailer indents. Please ensure retailers have submitted their indents for this date.</p>
                    </div>
                  ) : mrpData.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <IndianRupee size={48} className="mx-auto mb-4 opacity-30" />
                      <p>No MRP data for {dailyReqDate}</p>
                      <p className="text-xs mt-2">{mrpIndentProducts.length} products found in day's indents. Click "Initialize All Products" to create MRP entries, or "Copy from Previous Date"</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">
                        MRP entries for {dailyReqDate} • {mrpData.length} saved items out of {mrpIndentProducts.length} products from day's indents
                        {mrpHasUnsavedChanges && <span className="text-orange-600 ml-2">• Unsaved changes</span>}
                      </p>
                      
                      {/* Category-wise sections - ALL EXPANDED BY DEFAULT, SHOWING ALL PRODUCTS */}
                      {Object.keys(mrpProductsByCategory).sort().map((category) => {
                        const categoryProducts = mrpProductsByCategory[category] || [];
                        if (categoryProducts.length === 0) return null;
                        
                        const isExpanded = expandedMrpCategories[category] !== false; // Default to expanded
                        // Count how many items in this category have MRP entries (use consistent check)
                        const entriesWithMrp = categoryProducts.filter(item => 
                          mrpData.some(e => 
                            e.product_id === item.productId && (
                              e.variant_id === (item.variantId || '') ||
                              (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
                            )
                          )
                        ).length;
                        const zeroMrpCount = categoryProducts.filter(item => {
                          const entry = mrpData.find(e => 
                            e.product_id === item.productId && (
                              e.variant_id === (item.variantId || '') ||
                              (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
                            )
                          );
                          return entry && (!entry.mrp || entry.mrp === 0);
                        }).length;
                        const isEditable = canEditMrpForDate(dailyReqDate);
                        
                        return (
                          <div key={category} className={`border rounded-lg overflow-hidden ${getCategoryColorClasses(category).split(' ')[2]}`}>
                            {/* Category Header - Clickable */}
                            <div 
                              className={`flex items-center justify-between p-3 cursor-pointer ${getCategoryColorClasses(category).split(' ').slice(0, 2).join(' ')} hover:opacity-90`}
                              onClick={() => toggleMrpCategory(category)}
                            >
                              <div className="flex items-center gap-3">
                                {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                <span className="font-semibold text-sm">{category}</span>
                                <span className="text-xs opacity-75">({categoryProducts.length} items, {entriesWithMrp} with MRP)</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                {zeroMrpCount > 0 ? (
                                  <span className="text-red-600 font-medium">{zeroMrpCount} items with ₹0 MRP</span>
                                ) : entriesWithMrp === categoryProducts.length ? (
                                  <span className="text-green-600">All priced ✓</span>
                                ) : entriesWithMrp > 0 ? (
                                  <span className="text-orange-600">{categoryProducts.length - entriesWithMrp} missing MRP</span>
                                ) : null}
                              </div>
                            </div>
                            
                            {/* Category Items - Always visible by default, showing ALL products */}
                            {isExpanded && (
                              <div className="bg-white">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b bg-gray-50 text-xs">
                                      <th className="p-2 text-left w-10">#</th>
                                      <th className="p-2 text-left">Product</th>
                                      <th className="p-2 text-left w-36">Variant</th>
                                      <th className="p-2 text-center w-20">
                                        <span className="text-blue-600">Sticker Qty</span>
                                      </th>
                                      <th className="p-2 text-right w-24">
                                        <span className="text-purple-600">Override MRP</span>
                                      </th>
                                      <th className="p-2 text-right w-24">MRP (₹)</th>
                                      <th className="p-2 text-right w-24">
                                        <span className="text-orange-600">Blinkit (₹)</span>
                                      </th>
                                      <th className="p-2 text-center w-20">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Show ALL product+variant combinations from indents */}
                                    {categoryProducts.map((item, localIdx) => {
                                      // Find matching MRP entry by product_id and variant (check both variant_id and variant_name)
                                      const mrpEntry = mrpData.find(e => 
                                        e.product_id === item.productId && (
                                          e.variant_id === (item.variantId || '') ||
                                          (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
                                        )
                                      );
                                      
                                      // Find matching sticker data for this product+variant
                                      const stickerItem = stickersData.find(s => 
                                        s.productId === item.productId && 
                                        s.variantId === item.variantId
                                      );
                                      const stickerQty = stickerItem?.quantity || 0;
                                      
                                      // Get override MRP for this product+variant
                                      const overrideMrp = getStickerMrp(item.productId, item.variantId);
                                      const hasOverride = overrideMrp !== null;
                                      
                                      const blinkitData = blinkitPrices[item.productId];
                                      // Get display name based on language
                                      const displayName = i18n.language === 'hi' && item.productNameHi 
                                        ? item.productNameHi 
                                        : i18n.language === 'mr' && item.productNameMr 
                                          ? item.productNameMr 
                                          : item.productName;
                                      
                                      return (
                                        <React.Fragment key={`${item.productId}-${item.variantId}-${localIdx}`}>
                                          <tr 
                                            className={`border-b hover:bg-gray-50 cursor-pointer ${expandedStickerItem === `${item.productId}-${item.variantId}` ? 'bg-blue-50' : ''} ${hasOverride ? 'bg-purple-50' : ''} ${mrpEntry && pendingMrpChanges[mrpEntry.id] ? 'bg-yellow-50' : ''}`}
                                            onClick={() => setExpandedStickerItem(expandedStickerItem === `${item.productId}-${item.variantId}` ? null : `${item.productId}-${item.variantId}`)}
                                          >
                                          <td className="p-2 text-gray-400 text-xs">{localIdx + 1}</td>
                                          <td className="p-2 font-medium">
                                            <div className="flex items-center gap-1">
                                              {(() => {
                                                // Use item.key for lookup (accounts for Piece/Packet aggregation)
                                                const stickerKey = item.key || `${item.productId}|${item.variantId}`;
                                                const details = stickerIndentDetails[stickerKey] || [];
                                                if (details.length > 0) {
                                                  return expandedStickerItem === `${item.productId}-${item.variantId}`
                                                    ? <ChevronDown size={14} className="text-blue-500" />
                                                    : <ChevronRight size={14} className="text-gray-400" />;
                                                }
                                                return null;
                                              })()}
                                              {displayName}
                                            </div>
                                          </td>
                                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                            {mrpEntry && isEditable ? (
                                              <Popover>
                                                <PopoverTrigger asChild>
                                                  <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    className="h-8 w-full justify-between text-sm font-normal"
                                                  >
                                                    <span className="truncate">
                                                      {mrpEntry.variant_name || "Select variant..."}
                                                    </span>
                                                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                                  </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[200px] p-0" align="start">
                                                  <Command>
                                                    <CommandInput placeholder="Search variant..." className="h-9" />
                                                    <CommandList>
                                                      <CommandEmpty>No variant found.</CommandEmpty>
                                                      <CommandGroup>
                                                        {retailPackagings.map((pkg) => (
                                                          <CommandItem
                                                            key={pkg.id}
                                                            value={pkg.name}
                                                            onSelect={() => {
                                                              updateMrpEntryLocal(mrpEntry.id, 'variant_id', pkg.id);
                                                            }}
                                                            className="cursor-pointer"
                                                          >
                                                            <Check
                                                              className={`mr-2 h-4 w-4 ${
                                                                mrpEntry.variant_id === pkg.id ? "opacity-100" : "opacity-0"
                                                              }`}
                                                            />
                                                            {pkg.name}
                                                          </CommandItem>
                                                        ))}
                                                      </CommandGroup>
                                                    </CommandList>
                                                  </Command>
                                                </PopoverContent>
                                              </Popover>
                                            ) : (
                                              <span className="text-gray-600">{mrpEntry?.variant_name || item.variantName}</span>
                                            )}
                                          </td>
                                          <td className="p-2 text-center">
                                            <span className={`font-bold ${stickerQty > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                                              {stickerQty > 0 ? stickerQty : '-'}
                                            </span>
                                          </td>
                                          {/* Override MRP Column */}
                                          <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                            {hasOverride ? (
                                              <div className="flex items-center justify-end gap-1">
                                                <span className="text-purple-700 font-semibold">₹{overrideMrp}</span>
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => openEditStickerOverrideModal({
                                                    productId: item.productId,
                                                    productName: item.productName,
                                                    variantId: item.variantId,
                                                    variantName: item.variantName
                                                  })}
                                                  className="h-6 w-6 p-0 text-purple-600 hover:text-purple-800 hover:bg-purple-100"
                                                  title="Edit override"
                                                >
                                                  <Pencil size={12} />
                                                </Button>
                                              </div>
                                            ) : (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => openEditStickerOverrideModal({
                                                  productId: item.productId,
                                                  productName: item.productName,
                                                  variantId: item.variantId,
                                                  variantName: item.variantName
                                                })}
                                                className="h-6 px-2 text-xs text-purple-500 hover:text-purple-700 hover:bg-purple-50"
                                                title="Add override"
                                              >
                                                <Plus size={12} />
                                              </Button>
                                            )}
                                          </td>
                                          <td className="p-2 text-right">
                                            {mrpEntry ? (
                                              <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={mrpEntry.mrp || ''}
                                                onChange={(e) => updateMrpEntryLocal(mrpEntry.id, 'mrp', e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={!isEditable}
                                                className={`h-8 w-20 text-right ml-auto ${!isEditable ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                                placeholder="0.00"
                                              />
                                            ) : (
                                              <span className="text-gray-400">-</span>
                                            )}
                                          </td>
                                          <td className="p-2 text-right">
                                            <span className="text-orange-600 text-sm">
                                              {blinkitData?.blinkit_price ? `₹${blinkitData.blinkit_price}` : '-'}
                                            </span>
                                          </td>
                                          <td className="p-2 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                              {isEditable && !mrpEntry && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={(e) => { e.stopPropagation(); addMrpEntryFromIndent(item); }}
                                                  className="h-7 px-2 text-xs text-green-600 border-green-300 hover:bg-green-50"
                                                >
                                                  <Plus size={12} className="mr-1" /> Add
                                                </Button>
                                              )}
                                              {isEditable && mrpEntry && (
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={(e) => { e.stopPropagation(); deleteMrpEntry(mrpEntry.id); }}
                                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                  <Trash2 size={14} />
                                                </Button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                        {/* Retailer details row - shown when item is expanded */}
                                        {expandedStickerItem === `${item.productId}-${item.variantId}` && (() => {
                                          // Use item.key for lookup (accounts for Piece/Packet aggregation)
                                          const stickerKey = item.key || `${item.productId}|${item.variantId}`;
                                          const details = stickerIndentDetails[stickerKey] || [];
                                          if (details.length === 0) return null;
                                          return (
                                            <tr className="bg-blue-50 border-b">
                                              <td></td>
                                              <td colSpan="7" className="p-2">
                                                <div className="text-xs text-gray-700">
                                                  <span className="font-semibold text-blue-700">Retailers:</span>
                                                  <div className="flex flex-wrap gap-2 mt-1">
                                                    {details.map((r, rIdx) => (
                                                      <span key={rIdx} className="bg-white px-2 py-1 rounded border text-xs">
                                                        {r.retailerName} <span className="font-semibold text-green-700">({r.quantity})</span>
                                                      </span>
                                                    ))}
                                                  </div>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })()}
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Summary Footer */}
                      <div className="border-t-2 bg-gray-100 rounded-lg p-3 flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="flex flex-wrap gap-4 text-sm">
                          <span className="font-semibold">{mrpIndentProducts.length} items from indents</span>
                          <span className="text-gray-500">|</span>
                          <span className="text-green-600">
                            {mrpIndentProducts.filter(item => 
                              mrpData.some(e => 
                                e.product_id === item.productId && (
                                  e.variant_id === (item.variantId || '') ||
                                  (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
                                )
                              )
                            ).length} with MRP
                          </span>
                          <span className="text-gray-500">|</span>
                          <span className="text-orange-600">
                            {mrpIndentProducts.filter(item => 
                              !mrpData.some(e => 
                                e.product_id === item.productId && (
                                  e.variant_id === (item.variantId || '') ||
                                  (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
                                )
                              )
                            ).length} missing MRP
                          </span>
                          <span className="text-gray-500">|</span>
                          <span className="text-red-600 font-medium">
                            {mrpIndentProducts.filter(item => {
                              const entry = mrpData.find(e => 
                                e.product_id === item.productId && (
                                  e.variant_id === (item.variantId || '') ||
                                  (e.variant_name || '').toLowerCase() === (item.variantName || '').toLowerCase()
                                )
                              );
                              return entry && (!entry.mrp || entry.mrp === 0);
                            }).length} with ₹0 MRP
                          </span>
                        </div>
                        {canEditMrpForDate(dailyReqDate) && mrpHasUnsavedChanges && (
                          <Button 
                            onClick={saveMrpChanges}
                            disabled={savingMrp}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Save size={14} className="mr-1" />
                            Save All Changes ({Object.keys(pendingMrpChanges).length})
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ==================== INDENTS TAB ==================== */}
        {activeTab === 'indents' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm">Retailer Indents</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={indentDateFilter}
                    onChange={(e) => setIndentDateFilter(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                  {indentDateFilter && (
                    <Button size="sm" variant="ghost" onClick={() => setIndentDateFilter('')} className="h-8 px-2">
                      <X size={12} /> Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {/* Language Toggle for Indent */}
                <select 
                  value={indentLanguage} 
                  onChange={(e) => setIndentLanguage(e.target.value)}
                  className="h-8 px-2 rounded-md border border-gray-200 text-xs bg-white"
                  title="Language for expanded view & PDF"
                >
                  <option value="en">English</option>
                  <option value="hi">हिंदी</option>
                  <option value="mr">मराठी</option>
                </select>
                <Button size="sm" variant="outline" onClick={exportIndents} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
                <Button size="sm" variant="outline" onClick={printIndents} title="Print">
                  <Printer size={14} className="mr-1" /> Print
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAutoIndentModal(true)} className="border-purple-300 text-purple-600 hover:bg-purple-50">
                  <Zap size={14} className="mr-1" /> Auto Indent
                </Button>
                <Button size="sm" className="bg-[#14532D]" onClick={() => setShowIndentModal(true)}>
                  <Plus size={14} className="mr-1" /> New Indent
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center w-10 font-medium text-gray-500">#</th>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndents.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">{indentDateFilter ? `No indents for ${indentDateFilter}` : 'No indents found'}</td></tr>
                    ) : filteredIndents.map((indent, indentIdx) => (
                      <React.Fragment key={indent.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleIndentExpand(indent.id)}>
                          <td className="p-3 text-center text-gray-500">{indentIdx + 1}</td>
                          <td className="p-3 text-center">
                            {expandedIndents[indent.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td className="p-3">{formatDate(indent.indent_date)}</td>
                          <td className="p-3 font-medium">
                            {getRetailerNameById(indent.retailer_id) || indent.retailer_name}
                            {indent.created_by_retailer && (
                              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded font-medium">
                                Generated by Retailer
                              </span>
                            )}
                            {indent.is_auto_generated && (
                              <>
                                <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded font-medium">
                                  Auto Generated
                                </span>
                                {indent.generation_basis === 'plan' ? (
                                  <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded font-medium">
                                    Plan Based
                                  </span>
                                ) : (
                                  <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-medium">
                                    Sales Based
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="p-3 text-center">{indent.items?.length || 0}</td>
                          <td className="p-3 text-center">
                            {(() => {
                              // Check if there are remaining items to dispatch
                              const hasRemainingItems = indent.status !== 'pending' && getIndentRemainingQtys(indent).length > 0;
                              const displayStatus = hasRemainingItems ? 'partial' : indent.status;
                              
                              return (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  displayStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  displayStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                                  displayStatus === 'dispatched' ? 'bg-blue-100 text-blue-700' :
                                  displayStatus === 'received' ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {displayStatus}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditIndentModal(indent); }}>
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              {/* Download Indent with Language Selection */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="ghost" onClick={(e) => e.stopPropagation()}>
                                    <Download size={14} className="text-blue-600" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-32 p-1" align="start">
                                  <div className="text-xs font-medium text-gray-500 px-2 py-1">Download as:</div>
                                  <button 
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                                    onClick={(e) => { e.stopPropagation(); downloadIndentPdf(indent, 'en'); }}
                                  >
                                    English
                                  </button>
                                  <button 
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                                    onClick={(e) => { e.stopPropagation(); downloadIndentPdf(indent, 'hi'); }}
                                  >
                                    हिंदी (Hindi)
                                  </button>
                                  <button 
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                                    onClick={(e) => { e.stopPropagation(); downloadIndentPdf(indent, 'mr'); }}
                                  >
                                    मराठी (Marathi)
                                  </button>
                                </PopoverContent>
                              </Popover>
                              {indent.status === 'pending' && (
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openDispatchModal(indent); }}>
                                  <Truck size={14} className="mr-1" /> Dispatch
                                </Button>
                              )}
                              {(indent.status === 'partial' || (indent.status === 'dispatched' && getIndentRemainingQtys(indent).length > 0)) && (
                                <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 hover:bg-amber-50" onClick={(e) => { e.stopPropagation(); openDispatchModal(indent, true); }}>
                                  <Truck size={14} className="mr-1" /> Dispatch Remaining
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteIndent(indent.id); }}>
                                <Trash2 size={14} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expandedIndents[indent.id] && (
                          <tr className="bg-blue-50">
                            <td colSpan={7} className="p-3">
                              {(() => {
                                // Calculate dispatched quantities for this indent
                                const indentDispatches = dispatches.filter(d => d.indent_id === indent.id);
                                const dispatchedQtys = {};
                                for (const dispatch of indentDispatches) {
                                  for (const item of (dispatch.items || [])) {
                                    // Use product_id + variant_id for more precise matching
                                    // This handles cases where same product has multiple variants in one indent
                                    const key = `${item.product_id}_${item.variant_id || item.indent_variant_id || ''}`;
                                    dispatchedQtys[key] = (dispatchedQtys[key] || 0) + (item.supplied_qty || 0);
                                    // Also track by product_id only as fallback
                                    const productKey = item.product_id;
                                    if (!dispatchedQtys[productKey]) dispatchedQtys[productKey] = 0;
                                    dispatchedQtys[productKey] += (item.supplied_qty || 0);
                                  }
                                }
                                const showDispatchColumns = indent.status === 'partial' || indent.status === 'dispatched';
                                
                                // Group items by category and type
                                const categoryOrder = ['Vegetables', 'Fruits', 'Exotic', 'Sprouts', 'Others'];
                                const vegetableTypeOrder = ['Hard', 'Semi-hard', 'Leafy', 'Others'];
                                const groupedItems = {};
                                
                                (indent.items || []).forEach(item => {
                                  const product = productMap.get(item.product_id) || productMap.get(item.product_name);
                                  const category = product?.category || 'Others';
                                  const productType = product?.product_type || 'Others';
                                  
                                  if (!groupedItems[category]) {
                                    groupedItems[category] = {};
                                  }
                                  
                                  if (category === 'Vegetables') {
                                    if (!groupedItems[category][productType]) {
                                      groupedItems[category][productType] = [];
                                    }
                                    groupedItems[category][productType].push(item);
                                  } else {
                                    if (!groupedItems[category]['all']) {
                                      groupedItems[category]['all'] = [];
                                    }
                                    groupedItems[category]['all'].push(item);
                                  }
                                });
                                
                                const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
                                  const indexA = categoryOrder.indexOf(a);
                                  const indexB = categoryOrder.indexOf(b);
                                  if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                                  if (indexA === -1) return 1;
                                  if (indexB === -1) return -1;
                                  return indexA - indexB;
                                });
                                
                                const categoryColors = {
                                  'Vegetables': 'bg-green-700',
                                  'Fruits': 'bg-orange-600',
                                  'Exotic': 'bg-purple-600',
                                  'Sprouts': 'bg-cyan-600',
                                  'Others': 'bg-gray-600'
                                };
                                
                                const typeColors = {
                                  'Hard': 'bg-green-600 text-white',
                                  'Semi-hard': 'bg-green-200 text-green-900',
                                  'Leafy': 'bg-green-500 text-white',
                                  'Others': 'bg-green-400 text-white'
                                };
                                
                                let globalIdx = 0;
                                
                                return (
                                  <div className="space-y-2" style={{width: 'fit-content', minWidth: '420px'}}>
                                    {sortedCategories.map(category => {
                                      const catKey = `${indent.id}-${category}`;
                                      const isExpanded = expandedCategories[catKey] === true; // Default COLLAPSED
                                      
                                      if (category === 'Vegetables') {
                                        const types = Object.keys(groupedItems[category]).sort((a, b) => {
                                          const indexA = vegetableTypeOrder.indexOf(a);
                                          const indexB = vegetableTypeOrder.indexOf(b);
                                          if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                                          if (indexA === -1) return 1;
                                          if (indexB === -1) return -1;
                                          return indexA - indexB;
                                        });
                                        
                                        const totalVegItems = types.reduce((sum, t) => sum + groupedItems[category][t].length, 0);
                                        const totalVegQty = types.reduce((sum, t) => sum + groupedItems[category][t].reduce((s, item) => s + (item.quantity || 0), 0), 0);
                                        
                                        return (
                                          <div key={category} className="border rounded-lg overflow-hidden" style={{width: 'fit-content', minWidth: '420px'}}>
                                            <div 
                                              className={`${categoryColors[category]} text-white px-3 py-2 flex items-center cursor-pointer`}
                                              onClick={() => setExpandedCategories(prev => ({ ...prev, [catKey]: !isExpanded }))}
                                            >
                                              <div className="flex items-center gap-2">
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                <span className="font-semibold">{category}</span>
                                                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{totalVegItems} items</span>
                                                <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded font-bold">Qty: {totalVegQty}</span>
                                              </div>
                                            </div>
                                            {isExpanded && types.map(type => {
                                              const typeKey = `${indent.id}-${category}-${type}`;
                                              const isTypeExpanded = expandedCategories[typeKey] === true; // Default COLLAPSED
                                              const items = groupedItems[category][type];
                                              const typeTotal = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                                              
                                              return (
                                                <div key={type}>
                                                  <div 
                                                    className={`${typeColors[type]} px-4 py-1.5 flex items-center cursor-pointer text-sm font-semibold`}
                                                    onClick={() => setExpandedCategories(prev => ({ ...prev, [typeKey]: !isTypeExpanded }))}
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      {isTypeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                      <span>{type}</span>
                                                      <span className="text-xs bg-black/10 px-1.5 py-0.5 rounded">{items.length}</span>
                                                      <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded">Qty: {typeTotal}</span>
                                                    </div>
                                                  </div>
                                                  {isTypeExpanded && (
                                                    <table className="text-xs" style={{width: 'auto', minWidth: '400px'}}>
                                                      <thead className="bg-gray-100">
                                                        <tr>
                                                          <th className="px-2 py-1 text-center" style={{width: '30px'}}>#</th>
                                                          <th className="px-2 py-1 text-left" style={{minWidth: '180px'}}>Product</th>
                                                          <th className="px-2 py-1 text-left" style={{width: '80px'}}>Variant</th>
                                                          <th className="px-2 py-1 text-center" style={{width: '45px'}}>Qty</th>
                                                          {showDispatchColumns && (
                                                            <>
                                                              <th className="px-2 py-1 text-center" style={{width: '40px'}}>Sup</th>
                                                              <th className="px-2 py-1 text-center" style={{width: '40px'}}>Pend</th>
                                                            </>
                                                          )}
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {items.map((item, idx) => {
                                                          globalIdx++;
                                                          const key = item.product_id;
                                                          const dispatched = dispatchedQtys[key] || 0;
                                                          const remaining = (item.quantity || 0) - dispatched;
                                                          return (
                                                            <tr key={idx} className={`border-b ${remaining > 0 && showDispatchColumns ? 'bg-amber-50' : ''}`}>
                                                              <td className="px-2 py-1 text-center text-gray-400">{globalIdx}</td>
                                                              <td className="px-2 py-1">{getProductNameInLang(item, indentLanguage)}</td>
                                                              <td className="px-2 py-1 text-left text-xs text-gray-600">{getIndentVariantDisplay(item)}</td>
                                                              <td className="px-2 py-1 text-center font-medium">{item.quantity}</td>
                                                              {showDispatchColumns && (
                                                                <>
                                                                  <td className="px-2 py-1 text-center text-green-700">{dispatched}</td>
                                                                  <td className="px-2 py-1 text-center font-semibold">
                                                                    {remaining > 0 ? <span className="text-amber-700">{remaining}</span> : <span className="text-green-600">✓</span>}
                                                                  </td>
                                                                </>
                                                              )}
                                                            </tr>
                                                          );
                                                        })}
                                                      </tbody>
                                                    </table>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      } else {
                                        const items = groupedItems[category]['all'] || [];
                                        const catTotal = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                                        
                                        return (
                                          <div key={category} className="border rounded-lg overflow-hidden" style={{width: 'fit-content', minWidth: '420px'}}>
                                            <div 
                                              className={`${categoryColors[category]} text-white px-3 py-2 flex items-center cursor-pointer`}
                                              onClick={() => setExpandedCategories(prev => ({ ...prev, [catKey]: !isExpanded }))}
                                            >
                                              <div className="flex items-center gap-2">
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                <span className="font-semibold">{category}</span>
                                                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{items.length}</span>
                                                <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded font-bold">Qty: {catTotal}</span>
                                              </div>
                                            </div>
                                            {isExpanded && (
                                              <table className="text-xs" style={{width: 'auto', minWidth: '400px'}}>
                                                <thead className="bg-gray-100">
                                                  <tr>
                                                    <th className="px-2 py-1 text-center" style={{width: '30px'}}>#</th>
                                                    <th className="px-2 py-1 text-left" style={{minWidth: '180px'}}>Product</th>
                                                    <th className="px-2 py-1 text-left" style={{width: '80px'}}>Variant</th>
                                                    <th className="px-2 py-1 text-center" style={{width: '45px'}}>Qty</th>
                                                    {showDispatchColumns && (
                                                      <>
                                                        <th className="px-2 py-1 text-center" style={{width: '40px'}}>Sup</th>
                                                        <th className="px-2 py-1 text-center" style={{width: '40px'}}>Pend</th>
                                                      </>
                                                    )}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {items.map((item, idx) => {
                                                    globalIdx++;
                                                    // Try precise key first (product_id + variant_id), then fallback to product_id only
                                                    const preciseKey = `${item.product_id}_${item.variant_id || ''}`;
                                                    const productKey = item.product_id;
                                                    // Use precise key if it exists, otherwise fallback to product-only key
                                                    const dispatched = dispatchedQtys[preciseKey] !== undefined 
                                                      ? dispatchedQtys[preciseKey] 
                                                      : (dispatchedQtys[productKey] || 0);
                                                    const remaining = (item.quantity || 0) - dispatched;
                                                    return (
                                                      <tr key={idx} className={`border-b ${remaining > 0 && showDispatchColumns ? 'bg-amber-50' : ''}`}>
                                                        <td className="px-2 py-1 text-center text-gray-400">{globalIdx}</td>
                                                        <td className="px-2 py-1">{getProductNameInLang(item, indentLanguage)}</td>
                                                        <td className="px-2 py-1 text-left text-xs text-gray-600">{getIndentVariantDisplay(item)}</td>
                                                        <td className="px-2 py-1 text-center font-medium">{item.quantity}</td>
                                                        {showDispatchColumns && (
                                                          <>
                                                            <td className="px-2 py-1 text-center text-green-700">{dispatched}</td>
                                                            <td className="px-2 py-1 text-center font-semibold">
                                                              {remaining > 0 ? <span className="text-amber-700">{remaining}</span> : <span className="text-green-600">✓</span>}
                                                            </td>
                                                          </>
                                                        )}
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            )}
                                          </div>
                                        );
                                      }
                                    })}
                                    
                                    {/* Grand Total */}
                                    <div className="bg-gray-800 text-white p-2 rounded font-semibold text-sm flex items-center gap-4">
                                      <span>TOTAL:</span>
                                      <span>{indent.items?.length} items</span>
                                      <span>Qty: {indent.items?.reduce((sum, item) => sum + (item.quantity || 0), 0)}</span>
                                      {showDispatchColumns && (
                                        <>
                                          <span className="text-green-300">Supplied: {indent.items?.reduce((sum, item) => {
                                            const preciseKey = `${item.product_id}_${item.variant_id || ''}`;
                                            const productKey = item.product_id;
                                            return sum + (dispatchedQtys[preciseKey] !== undefined ? dispatchedQtys[preciseKey] : (dispatchedQtys[productKey] || 0));
                                          }, 0)}</span>
                                          <span className="text-amber-300">Pending: {indent.items?.reduce((sum, item) => {
                                            const preciseKey = `${item.product_id}_${item.variant_id || ''}`;
                                            const productKey = item.product_id;
                                            const dispatched = dispatchedQtys[preciseKey] !== undefined ? dispatchedQtys[preciseKey] : (dispatchedQtys[productKey] || 0);
                                            return sum + Math.max(0, (item.quantity || 0) - dispatched);
                                          }, 0)}</span>
                                        </>
                                      )}
                                    </div>
                                    
                                    {indent.remarks && (
                                      <div className="text-xs text-gray-600 mt-2 border-t pt-2">
                                        <strong>Remarks:</strong> {indent.remarks}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== DISPATCHES TAB ==================== */}
        {activeTab === 'dispatches' && (
          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm">Dispatches</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dispatchDateFilter}
                    onChange={(e) => setDispatchDateFilter(e.target.value)}
                    className="h-8 w-36 text-xs"
                  />
                  {dispatchDateFilter && (
                    <Button size="sm" variant="ghost" onClick={() => setDispatchDateFilter('')} className="h-8 px-2">
                      <X size={12} /> Clear
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {/* Language Toggle for Dispatch */}
                <select 
                  value={dispatchLanguage} 
                  onChange={(e) => setDispatchLanguage(e.target.value)}
                  className="h-8 px-2 rounded-md border border-gray-200 text-xs bg-white"
                  title="Language for expanded view & export"
                >
                  <option value="en">English</option>
                  <option value="hi">हिंदी</option>
                  <option value="mr">मराठी</option>
                </select>
                <Button size="sm" variant="outline" onClick={exportDispatches} title="Export to Excel">
                  <FileSpreadsheet size={14} className="mr-1" /> Export
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center w-10 font-medium text-gray-500">#</th>
                      <th className="p-3 text-center w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">MRP VALUE</th>
                      <th className="p-3 text-center font-medium text-gray-500">COMM %</th>
                      <th className="p-3 text-right font-medium text-gray-500">NET RECEIVABLE</th>
                      <th className="p-3 text-center font-medium text-gray-500">TRANSPORT</th>
                      <th className="p-3 text-center font-medium text-gray-500">INVOICE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDispatches.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-gray-400">{dispatchDateFilter ? `No dispatches for ${dispatchDateFilter}` : 'No dispatches found'}</td></tr>
                    ) : filteredDispatches.map((dispatch, dispatchIdx) => (
                      <React.Fragment key={dispatch.id}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedDispatchId(expandedDispatchId === dispatch.id ? null : dispatch.id)}>
                          <td className="p-3 text-center text-gray-500">{dispatchIdx + 1}</td>
                          <td className="p-3 text-center">
                            <ChevronDown size={16} className={`transition-transform ${expandedDispatchId === dispatch.id ? 'rotate-180' : ''}`} />
                          </td>
                          <td className="p-3">{formatDate(dispatch.dispatch_date)}</td>
                          <td className="p-3 font-medium">{getRetailerNameById(dispatch.retailer_id) || dispatch.retailer_name}</td>
                          <td className="p-3 text-center">{dispatch.items?.length || 0}</td>
                          <td className="p-3 text-right">{formatCurrency(dispatch.total_mrp_value)}</td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">{dispatch.commission_percentage}%</span>
                          </td>
                          <td className="p-3 text-right font-semibold text-green-700">{formatCurrency(dispatch.net_payable)}</td>
                          <td className="p-3 text-center text-xs text-gray-500">
                            {dispatch.transport_charges ? formatCurrency(dispatch.transport_charges) : '-'}
                          </td>
                          <td className="p-3 text-center">
                            {dispatch.invoice_number ? (
                              <span className="text-blue-600 text-xs">{dispatch.invoice_number}</span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEditDispatchModal(dispatch)}>
                                <Edit size={14} className="text-blue-600" />
                              </Button>
                              {!dispatch.invoice_number && (
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteDispatch(dispatch.id)}>
                                  <Trash2 size={14} className="text-red-600" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded items row */}
                        {expandedDispatchId === dispatch.id && (
                          <tr className="bg-gray-50">
                            <td colSpan={11} className="p-0">
                              <div className="p-3 pl-8">
                                {(() => {
                                  // Group dispatch items by category and type
                                  const categoryOrder = ['Vegetables', 'Fruits', 'Exotic', 'Sprouts', 'Others'];
                                  const vegetableTypeOrder = ['Hard', 'Semi-hard', 'Leafy', 'Others'];
                                  const groupedItems = {};
                                  
                                  (dispatch.items || []).forEach(item => {
                                    const product = productMap.get(item.product_id) || productMap.get(item.product_name);
                                    const category = product?.category || 'Others';
                                    const productType = product?.product_type || 'Others';
                                    
                                    if (!groupedItems[category]) {
                                      groupedItems[category] = {};
                                    }
                                    
                                    if (category === 'Vegetables') {
                                      if (!groupedItems[category][productType]) {
                                        groupedItems[category][productType] = [];
                                      }
                                      groupedItems[category][productType].push(item);
                                    } else {
                                      if (!groupedItems[category]['all']) {
                                        groupedItems[category]['all'] = [];
                                      }
                                      groupedItems[category]['all'].push(item);
                                    }
                                  });
                                  
                                  const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
                                    const indexA = categoryOrder.indexOf(a);
                                    const indexB = categoryOrder.indexOf(b);
                                    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                                    if (indexA === -1) return 1;
                                    if (indexB === -1) return -1;
                                    return indexA - indexB;
                                  });
                                  
                                  const categoryColors = {
                                    'Vegetables': 'bg-green-700',
                                    'Fruits': 'bg-orange-600',
                                    'Exotic': 'bg-purple-600',
                                    'Sprouts': 'bg-cyan-600',
                                    'Others': 'bg-gray-600'
                                  };
                                  
                                  const typeColors = {
                                    'Hard': 'bg-green-600 text-white',
                                    'Semi-hard': 'bg-green-200 text-green-900',
                                    'Leafy': 'bg-green-500 text-white',
                                    'Others': 'bg-green-400 text-white'
                                  };
                                  
                                  let globalIdx = 0;
                                  const grandTotalIndent = (dispatch.items || []).reduce((sum, item) => sum + (item.indent_qty || 0), 0);
                                  const grandTotalSupplied = (dispatch.items || []).reduce((sum, item) => sum + (item.supplied_qty || 0), 0);
                                  const grandTotalAmount = (dispatch.items || []).reduce((sum, item) => sum + (item.total_value || 0), 0);
                                  
                                  return (
                                    <div className="space-y-2" style={{width: 'fit-content', minWidth: '320px'}}>
                                      {sortedCategories.map(category => {
                                        const catKey = `dispatch-${dispatch.id}-${category}`;
                                        const isExpanded = expandedCategories[catKey] === true;
                                        
                                        if (category === 'Vegetables') {
                                          const types = Object.keys(groupedItems[category]).sort((a, b) => {
                                            const indexA = vegetableTypeOrder.indexOf(a);
                                            const indexB = vegetableTypeOrder.indexOf(b);
                                            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                                            if (indexA === -1) return 1;
                                            if (indexB === -1) return -1;
                                            return indexA - indexB;
                                          });
                                          
                                          const totalVegItems = types.reduce((sum, t) => sum + groupedItems[category][t].length, 0);
                                          const totalVegSupplied = types.reduce((sum, t) => sum + groupedItems[category][t].reduce((s, item) => s + (item.supplied_qty || 0), 0), 0);
                                          const totalVegAmount = types.reduce((sum, t) => sum + groupedItems[category][t].reduce((s, item) => s + (item.total_value || 0), 0), 0);
                                          
                                          return (
                                            <div key={category} className="border rounded-lg overflow-hidden" style={{width: 'fit-content', minWidth: '320px'}}>
                                              <div 
                                                className={`${categoryColors[category]} text-white px-3 py-2 flex items-center cursor-pointer`}
                                                onClick={() => setExpandedCategories(prev => ({ ...prev, [catKey]: !isExpanded }))}
                                              >
                                                <div className="flex items-center gap-2">
                                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                  <span className="font-semibold">{category}</span>
                                                  <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{totalVegItems}</span>
                                                  <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded">Sup: {totalVegSupplied}</span>
                                                  <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded">₹{totalVegAmount.toFixed(0)}</span>
                                                </div>
                                              </div>
                                              {isExpanded && types.map(type => {
                                                const typeKey = `dispatch-${dispatch.id}-${category}-${type}`;
                                                const isTypeExpanded = expandedCategories[typeKey] === true;
                                                const items = groupedItems[category][type];
                                                const typeSupplied = items.reduce((sum, item) => sum + (item.supplied_qty || 0), 0);
                                                const typeAmount = items.reduce((sum, item) => sum + (item.total_value || 0), 0);
                                                
                                                return (
                                                  <div key={type}>
                                                    <div 
                                                      className={`${typeColors[type]} px-4 py-1.5 flex items-center cursor-pointer text-sm font-semibold`}
                                                      onClick={() => setExpandedCategories(prev => ({ ...prev, [typeKey]: !isTypeExpanded }))}
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        {isTypeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        <span>{type}</span>
                                                        <span className="text-xs bg-black/10 px-1.5 py-0.5 rounded">{items.length}</span>
                                                        <span className="text-xs bg-black/20 px-1.5 py-0.5 rounded">Sup: {typeSupplied}</span>
                                                      </div>
                                                    </div>
                                                    {isTypeExpanded && (
                                                      <table className="text-xs" style={{width: 'auto', minWidth: '320px'}}>
                                                        <thead className="bg-gray-100">
                                                          <tr>
                                                            <th className="px-1 py-0.5 text-center" style={{width: '22px'}}>#</th>
                                                            <th className="px-1 py-0.5 text-left" style={{minWidth: '100px'}}>Product</th>
                                                            <th className="px-1 py-0.5 text-left" style={{width: '55px'}}>Variant</th>
                                                            <th className="px-1 py-0.5 text-center" style={{width: '28px'}}>Ind</th>
                                                            <th className="px-1 py-0.5 text-center" style={{width: '28px'}}>Sup</th>
                                                            <th className="px-1 py-0.5 text-right" style={{width: '42px'}}>MRP</th>
                                                            <th className="px-1 py-0.5 text-right" style={{width: '50px'}}>Amt</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {items.map((item, idx) => {
                                                            globalIdx++;
                                                            return (
                                                              <tr key={idx} className="border-b">
                                                                <td className="px-1 py-0.5 text-center text-gray-400">{globalIdx}</td>
                                                                <td className="px-1 py-0.5">{getProductNameInLang(item, dispatchLanguage)}</td>
                                                                <td className="px-1 py-0.5 text-left text-xs text-gray-600">{getIndentVariantDisplay(item)}</td>
                                                                <td className="px-1 py-0.5 text-center">{item.indent_qty || '-'}</td>
                                                                <td className="px-1 py-0.5 text-center font-medium">{item.supplied_qty}</td>
                                                                <td className="px-1 py-0.5 text-right">₹{item.mrp?.toFixed(0)}</td>
                                                                <td className="px-1 py-0.5 text-right font-medium">₹{item.total_value?.toFixed(0)}</td>
                                                              </tr>
                                                            );
                                                          })}
                                                        </tbody>
                                                      </table>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          );
                                        } else {
                                          const items = groupedItems[category]['all'] || [];
                                          const catSupplied = items.reduce((sum, item) => sum + (item.supplied_qty || 0), 0);
                                          const catAmount = items.reduce((sum, item) => sum + (item.total_value || 0), 0);
                                          
                                          return (
                                            <div key={category} className="border rounded-lg overflow-hidden" style={{width: 'fit-content', minWidth: '320px'}}>
                                              <div 
                                                className={`${categoryColors[category]} text-white px-3 py-2 flex items-center cursor-pointer`}
                                                onClick={() => setExpandedCategories(prev => ({ ...prev, [catKey]: !isExpanded }))}
                                              >
                                                <div className="flex items-center gap-2">
                                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                  <span className="font-semibold">{category}</span>
                                                  <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">{items.length}</span>
                                                  <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded">Sup: {catSupplied}</span>
                                                  <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded">₹{catAmount.toFixed(0)}</span>
                                                </div>
                                              </div>
                                              {isExpanded && (
                                                <table className="text-xs" style={{width: 'auto', minWidth: '320px'}}>
                                                  <thead className="bg-gray-100">
                                                    <tr>
                                                      <th className="px-1 py-0.5 text-center" style={{width: '22px'}}>#</th>
                                                      <th className="px-1 py-0.5 text-left" style={{minWidth: '100px'}}>Product</th>
                                                      <th className="px-1 py-0.5 text-left" style={{width: '55px'}}>Variant</th>
                                                      <th className="px-1 py-0.5 text-center" style={{width: '28px'}}>Ind</th>
                                                      <th className="px-1 py-0.5 text-center" style={{width: '28px'}}>Sup</th>
                                                      <th className="px-1 py-0.5 text-right" style={{width: '42px'}}>MRP</th>
                                                      <th className="px-1 py-0.5 text-right" style={{width: '50px'}}>Amt</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {items.map((item, idx) => {
                                                      globalIdx++;
                                                      return (
                                                        <tr key={idx} className="border-b">
                                                          <td className="px-1 py-0.5 text-center text-gray-400">{globalIdx}</td>
                                                          <td className="px-1 py-0.5">{getProductNameInLang(item, dispatchLanguage)}</td>
                                                          <td className="px-1 py-0.5 text-left text-xs text-gray-600">{getIndentVariantDisplay(item)}</td>
                                                          <td className="px-1 py-0.5 text-center">{item.indent_qty || '-'}</td>
                                                          <td className="px-1 py-0.5 text-center font-medium">{item.supplied_qty}</td>
                                                          <td className="px-1 py-0.5 text-right">₹{item.mrp?.toFixed(0)}</td>
                                                          <td className="px-1 py-0.5 text-right font-medium">₹{item.total_value?.toFixed(0)}</td>
                                                        </tr>
                                                      );
                                                    })}
                                                  </tbody>
                                                </table>
                                              )}
                                            </div>
                                          );
                                        }
                                      })}
                                      
                                      {/* Grand Total */}
                                      <div className="bg-gray-800 text-white p-2 rounded font-semibold text-sm flex items-center gap-4">
                                        <span>TOTAL:</span>
                                        <span>{dispatch.items?.length} items</span>
                                        <span>Ind: {grandTotalIndent || '-'}</span>
                                        <span>Sup: {grandTotalSupplied}</span>
                                        <span className="text-green-300">₹{grandTotalAmount.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  {filteredDispatches.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={5} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(filteredDispatches.reduce((sum, d) => sum + (d.total_mrp_value || 0), 0))}</td>
                        <td></td>
                        <td className="p-3 text-right text-green-700">{formatCurrency(filteredDispatches.reduce((sum, d) => sum + (d.net_payable || 0), 0))}</td>
                        <td className="p-3 text-center text-xs">{formatCurrency(filteredDispatches.reduce((sum, d) => sum + (d.transport_charges || 0), 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== INVOICES TAB ==================== */}
        {activeTab === 'invoices' && (
          <Card>
            <CardHeader className="py-3 flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Invoices</CardTitle>
                <div className="flex gap-2 items-center">
                  <Button size="sm" variant="outline" onClick={exportInvoices} title="Export to Excel">
                    <FileSpreadsheet size={14} className="mr-1" /> Export
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      loadFinalSummary(invoiceForm.retailer_id, finalSummaryStartDate, finalSummaryEndDate);
                    }}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    disabled={finalSummaryLoading}
                  >
                    <FileSpreadsheet size={14} className="mr-1" /> Final Summary
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (!invoiceForm.retailer_id) {
                        toast.error('Please select a retailer first');
                        return;
                      }
                      setClosingInventoryRetailer(invoiceForm.retailer_id);
                      setSelectedRetailer(invoiceForm.retailer_id);
                      loadUnpaidInvoices(invoiceForm.retailer_id);
                    }}
                    className="text-purple-700 border-purple-300 hover:bg-purple-50"
                    disabled={paymentSummaryLoading}
                  >
                    <FileText size={14} className="mr-1" /> Payment Summary
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (!invoiceForm.retailer_id) {
                        toast.error('Please select a retailer first');
                        return;
                      }
                      setSelectedRetailer(invoiceForm.retailer_id);
                      openPaymentLedgerModal();
                    }}
                    className="text-blue-700 border-blue-300 hover:bg-blue-50"
                    disabled={paymentLedgerLoading}
                  >
                    <FileText size={14} className="mr-1" /> Payment Ledger
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (!invoiceForm.retailer_id) {
                        toast.error('Please select a retailer first');
                        return;
                      }
                      setPaymentAuditRetailerId(invoiceForm.retailer_id);
                      loadPaymentAudit(invoiceForm.retailer_id);
                    }}
                    className="text-red-700 border-red-300 hover:bg-red-50"
                    disabled={paymentAuditLoading}
                  >
                    <AlertTriangle size={14} className="mr-1" /> Payment Audit
                  </Button>
                  {getCurrentUserRole() === 'admin' && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res = await api.post('/api/retailer-invoices/fix-statuses');
                          toast.success(res.data.message);
                          console.log('Fix result:', res.data);
                          // Always reload all invoices after fix
                          const invRes = await api.get('/api/retailer-invoices');
                          setInvoices(invRes.data || []);
                        } catch (error) {
                          console.error('Fix status error:', error);
                          toast.error('Failed to fix statuses');
                        }
                      }}
                      className="text-orange-700 border-orange-300 hover:bg-orange-50"
                      title="Recalculate invoice statuses from payment records"
                    >
                      <RefreshCw size={14} className="mr-1" /> Fix Statuses
                    </Button>
                  )}
                  <select
                    value={invoiceForm.retailer_id}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                    className="h-8 px-2 rounded border text-sm"
                  >
                    <option value="">Select Retailer</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                  <Button size="sm" className="bg-[#14532D]" onClick={openInvoiceModal} disabled={!invoiceForm.retailer_id}>
                    <Plus size={14} className="mr-1" /> Create Invoice
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={fixInvoiceRejectionData}
                    disabled={isFixingRejectionData}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    title="Fix invoices with incorrect rejection amounts by recalculating from actual rejections"
                  >
                    {isFixingRejectionData ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Fixing...
                      </>
                    ) : (
                      <>
                        <Wrench className="h-3 w-3 mr-1" /> Fix Rejection Data
                      </>
                    )}
                  </Button>
                </div>
              </div>
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Filter by Status:</span>
                <div className="flex gap-1">
                  {[
                    { value: 'all', label: 'All', color: 'gray' },
                    { value: 'pending', label: 'Pending', color: 'yellow' },
                    { value: 'partial', label: 'Partial', color: 'blue' },
                    { value: 'paid', label: 'Paid', color: 'green' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setInvoiceStatusFilter(opt.value)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        invoiceStatusFilter === opt.value
                          ? opt.color === 'yellow' ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                          : opt.color === 'blue' ? 'bg-blue-100 border-blue-400 text-blue-800'
                          : opt.color === 'green' ? 'bg-green-100 border-green-400 text-green-800'
                          : 'bg-gray-100 border-gray-400 text-gray-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                      {opt.value !== 'all' && (
                        <span className="ml-1">
                          ({invoices.filter(inv => (inv.status || 'pending') === opt.value).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {/* Date and Retailer Filters */}
              <div className="flex flex-wrap gap-2 items-center border-t pt-3">
                <span className="text-xs text-gray-500">From:</span>
                <Input
                  type="date"
                  value={invoiceDateFrom}
                  onChange={(e) => setInvoiceDateFrom(e.target.value)}
                  className="h-8 w-36 text-xs"
                  placeholder="From date"
                />
                <span className="text-xs text-gray-500">To:</span>
                <Input
                  type="date"
                  value={invoiceDateTo}
                  onChange={(e) => setInvoiceDateTo(e.target.value)}
                  className="h-8 w-36 text-xs"
                  placeholder="To date"
                />
                {/* Searchable Retailer Dropdown */}
                <div className="relative">
                  <Input
                    type="text"
                    value={invoiceRetailerSearch}
                    onChange={(e) => {
                      setInvoiceRetailerSearch(e.target.value);
                      setShowInvoiceRetailerDropdown(true);
                    }}
                    onFocus={() => setShowInvoiceRetailerDropdown(true)}
                    placeholder={invoiceRetailerFilter ? retailers.find(r => r.id === invoiceRetailerFilter)?.company_name || retailers.find(r => r.id === invoiceRetailerFilter)?.name || 'All Retailers' : 'All Retailers'}
                    className="h-8 w-44 text-xs"
                  />
                  {showInvoiceRetailerDropdown && (
                    <div className="absolute z-50 w-64 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      <div
                        onClick={() => {
                          setInvoiceRetailerFilter('');
                          setInvoiceRetailerSearch('');
                          setShowInvoiceRetailerDropdown(false);
                        }}
                        className="px-3 py-2 text-xs hover:bg-gray-100 cursor-pointer font-medium text-gray-600"
                      >
                        All Retailers
                      </div>
                      {retailers
                        .filter(r => {
                          const name = (r.company_name || r.name || '').toLowerCase();
                          return name.includes(invoiceRetailerSearch.toLowerCase());
                        })
                        .slice(0, 20)
                        .map(r => (
                          <div
                            key={r.id}
                            onClick={() => {
                              setInvoiceRetailerFilter(r.id);
                              setInvoiceRetailerSearch('');
                              setShowInvoiceRetailerDropdown(false);
                            }}
                            className={`px-3 py-2 text-xs hover:bg-gray-100 cursor-pointer ${invoiceRetailerFilter === r.id ? 'bg-blue-50' : ''}`}
                          >
                            {r.company_name || r.name}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={loadInvoices}
                  className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Apply
                </Button>
                {(invoiceDateFrom || invoiceDateTo || invoiceRetailerFilter) && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => { 
                      setInvoiceDateFrom(''); 
                      setInvoiceDateTo(''); 
                      setInvoiceRetailerFilter('');
                      setInvoiceRetailerSearch('');
                    }} 
                    className="h-8 px-2"
                  >
                    <X size={12} /> Clear
                  </Button>
                )}
                <span className="text-xs text-gray-500 ml-auto">
                  Showing {invoices.length} invoices
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center w-10 font-medium text-gray-500">#</th>
                      <th className="p-3 text-left w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE #</th>
                      <th className="p-3 text-left font-medium text-gray-500">DATE</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">ITEMS</th>
                      <th className="p-3 text-right font-medium text-gray-500">RECEIVABLE</th>
                      <th className="p-3 text-right font-medium text-green-600">PAID</th>
                      <th className="p-3 text-right font-medium text-amber-600">PENDING</th>
                      <th className="p-3 text-center font-medium text-gray-500">STATUS</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-gray-400">No invoices found</td></tr>
                    ) : filteredInvoices.map((invoice, invoiceIdx) => {
                      // Check if this invoice's retailer is 100% upfront
                      const retailer = retailers.find(r => r.id === invoice.retailer_id);
                      const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                      
                      // For 100% upfront retailers: use gross value minus commission (no rejection deduction)
                      // For others: use net_payable (which includes rejection deduction)
                      const grossValue = invoice.gross_value || invoice.total_mrp_value || 0;
                      const commissionPct = invoice.commission_percentage || 0;
                      const calculatedNetPayable = isUpfront100 
                        ? (grossValue - (grossValue * commissionPct / 100))
                        : (invoice.net_payable || 0);
                      
                      const paidAmount = invoice.paid_amount || 0;
                      const netPayable = calculatedNetPayable; // Use calculated value for 100% upfront
                      const creditAdjusted = invoice.total_credit_adjusted || 0;
                      // Calculate actual pending: net_payable - credit_notes - paid
                      const actualReceivable = netPayable - creditAdjusted;
                      const pendingAmount = actualReceivable - paidAmount;
                      // For excess calculation
                      const excessAmount = paidAmount > actualReceivable && actualReceivable > 0 ? paidAmount - actualReceivable : 0;
                      const isExcessPaid = paidAmount > actualReceivable && actualReceivable > 0;
                      
                      // Calculate status dynamically based on actual amounts (not stored status)
                      // This ensures status reflects reality after CN adjustments
                      const storedStatus = invoice.status || 'pending';
                      let status;
                      if (invoice.savtamali_cleanup) {
                        status = 'adjusted'; // Special status for cleanup invoices
                      } else if (isExcessPaid) {
                        status = 'excess';
                      } else if (pendingAmount <= 0.01 && paidAmount > 0) {
                        // Fully paid via cash payment (with small tolerance for rounding)
                        status = 'paid';
                      } else if (pendingAmount <= 0.01 && creditAdjusted > 0 && actualReceivable <= 0.01) {
                        // Fully covered by Credit Notes (no cash payment needed, receivable is 0)
                        status = 'paid';
                      } else if (paidAmount > 0 && pendingAmount > 0.01) {
                        status = 'partial';
                      } else if (creditAdjusted > 0 && pendingAmount > 0.01) {
                        // Partially covered by Credit Notes but still has pending
                        status = 'partial';
                      } else {
                        status = 'pending';
                      }
                      
                      return (
                        <React.Fragment key={invoice.id}>
                          <tr className={`border-b hover:bg-gray-50 cursor-pointer ${status === 'paid' ? 'bg-green-50/30' : ''}`} onClick={() => toggleInvoiceExpand(invoice.id)}>
                            <td className="p-3 text-center text-gray-500">{invoiceIdx + 1}</td>
                            <td className="p-3">
                              {expandedInvoices[invoice.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </td>
                            <td className="p-3 font-medium text-blue-600">{invoice.invoice_number}</td>
                            <td className="p-3">{formatDate(invoice.invoice_date)}</td>
                            <td className="p-3 font-medium">{getRetailerNameById(invoice.retailer_id) || invoice.retailer_name}</td>
                            <td className="p-3 text-center">{invoice.items?.length || 0}</td>
                            <td className="p-3 text-right">
                              {creditAdjusted > 0 ? (
                                <div className="text-xs">
                                  <div className="text-gray-500 line-through">{formatCurrency(netPayable)}</div>
                                  <div className="text-red-500">- {formatCurrency(creditAdjusted)} CN</div>
                                  <div className="font-semibold text-green-700">{formatCurrency(actualReceivable)}</div>
                                </div>
                              ) : (
                                <span className="font-semibold">{formatCurrency(netPayable)}</span>
                              )}
                            </td>
                            <td className="p-3 text-right text-green-600 font-medium">{formatCurrency(paidAmount)}</td>
                            <td className="p-3 text-right text-amber-600 font-medium">
                              {/* For cleaned-up invoices, show "-" instead of pending amount */}
                              {invoice.savtamali_cleanup ? (
                                <span className="text-gray-400">-</span>
                              ) : isExcessPaid ? (
                                <span className="text-purple-600">{formatCurrency(excessAmount)} excess</span>
                              ) : pendingAmount > 0 ? (
                                formatCurrency(pendingAmount)
                              ) : '-'}
                            </td>
                            <td className="p-3 text-center">
                              {/* SAVTAMALI CLEANUP INDICATOR */}
                              {invoice.savtamali_cleanup ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200" title="One-time cleanup: 50% to 100% upfront migration">
                                  <Check size={12} className="mr-1" /> Adjusted
                                </span>
                              ) : invoice.narang_cleanup ? (
                                /* NARANG CLEANUP INDICATOR - shows CN created for rejection */
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200" title="100% upfront correction: Individual CNs created for rejection items">
                                  <RefreshCw size={12} className="mr-1" /> Corrected
                                </span>
                              ) : isExcessPaid ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200 animate-pulse">
                                  <AlertTriangle size={12} className="mr-1" /> Excess Paid
                                </span>
                              ) : status === 'paid' ? (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                                  <Check size={12} className="mr-1" /> Paid
                                </span>
                              ) : status === 'partial' ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  <Clock size={12} className="mr-1" /> Partial
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  <Clock size={12} className="mr-1" /> Pending
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                {isExcessPaid ? (
                                  // Excess Paid - show View and Credit Note button
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                      onClick={() => openPaymentHistoryModal(invoice)}
                                      title="View Payment Details"
                                    >
                                      <Eye size={14} className="mr-1" /> View
                                    </Button>
                                    {!invoice.has_excess_credit_note && (
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                                        onClick={() => handleCreateExcessCreditNote(invoice, excessAmount)}
                                        title="Create Credit Note for Excess Amount"
                                      >
                                        <FileText size={14} className="mr-1" /> CN
                                      </Button>
                                    )}
                                  </>
                                ) : status === 'paid' ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                    onClick={() => openPaymentHistoryModal(invoice)}
                                    title="View Payment Details"
                                    data-testid={`view-payment-${invoice.id}`}
                                  >
                                    <Eye size={14} className="mr-1" /> View
                                  </Button>
                                ) : status === 'partial' ? (
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                      onClick={() => openPaymentHistoryModal(invoice)}
                                      title="View/Edit Payments"
                                    >
                                      <Eye size={14} />
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="text-green-600 border-green-300 hover:bg-green-50"
                                      onClick={() => openInvoicePaymentModal(invoice)}
                                      title="Add More Payment"
                                    >
                                      <IndianRupee size={14} className="mr-1" /> Pay
                                    </Button>
                                  </>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => openInvoicePaymentModal(invoice)}
                                  >
                                    <IndianRupee size={14} className="mr-1" /> Pay
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => openPrintLanguageDialog(invoice)}>
                                  <Download size={14} className="text-blue-600" />
                                </Button>
                                {canEditDeleteInvoice(invoice) && (
                                  <Button size="sm" variant="ghost" onClick={() => openEditInvoiceModal(invoice)} title="Edit Invoice">
                                    <Edit size={14} className="text-amber-600" />
                                  </Button>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleRecalculateInvoice(invoice.id, invoice.invoice_number)}
                                  title="Recalculate invoice totals"
                                >
                                  <RefreshCw size={14} className="text-purple-600" />
                                </Button>
                                {canEditDeleteInvoice(invoice) && (
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteInvoice(invoice.id)} title="Delete Invoice">
                                    <Trash2 size={14} className="text-red-600" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandedInvoices[invoice.id] && (
                            <tr className="bg-green-50">
                              <td colSpan={10} className="p-3">
                                {/* Invoice Details */}
                                {(() => {
                                  // Check if this invoice's retailer is 100% upfront
                                  const retailer = retailers.find(r => r.id === invoice.retailer_id);
                                  const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                                  
                                  // For 100% upfront: show gross value as the base amount (no rejection deduction)
                                  // For others: show gross -> rejection -> net flow
                                  const displayAmount = isUpfront100 ? getInvoiceGrossValue(invoice) : invoice.total_mrp_value;
                                  const displayCommission = isUpfront100 
                                    ? (getInvoiceGrossValue(invoice) * (invoice.commission_percentage || 0) / 100)
                                    : invoice.commission_amount;
                                  const displayPayable = isUpfront100
                                    ? (getInvoiceGrossValue(invoice) - displayCommission)
                                    : invoice.net_payable;
                                  
                                  return (
                                <div className="mb-3 p-3 bg-white rounded-lg border">
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                    {isUpfront100 ? (
                                      // For 100% upfront retailers: Simple display without rejection
                                      <>
                                        <div>
                                          <span className="text-gray-500">Total MRP Value:</span>
                                          <p className="font-medium">{formatCurrency(getInvoiceGrossValue(invoice))}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">Commission ({invoice.commission_percentage}%):</span>
                                          <p className="font-medium text-green-600">-{formatCurrency(displayCommission)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-700 font-semibold">Invoice Amount:</span>
                                          <p className="font-bold text-blue-700">{formatCurrency(displayPayable)}</p>
                                        </div>
                                      </>
                                    ) : (
                                      // For non-100% upfront retailers: Show rejection breakdown
                                      <>
                                        <div>
                                          <span className="text-gray-500">Gross Value:</span>
                                          <p className="font-medium">{formatCurrency(getInvoiceGrossValue(invoice))}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">Rejection:</span>
                                          <p className="font-medium text-red-600">-{formatCurrency(getInvoiceRejectionAmount(invoice))}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">Net Value:</span>
                                          <p className="font-medium">{formatCurrency(invoice.total_mrp_value)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-500">Commission ({invoice.commission_percentage}%):</span>
                                          <p className="font-medium text-green-600">-{formatCurrency(invoice.commission_amount)}</p>
                                        </div>
                                        <div>
                                          <span className="text-gray-700 font-semibold">Invoice Amount:</span>
                                          <p className="font-bold text-blue-700">{formatCurrency(invoice.net_payable)}</p>
                                        </div>
                                      </>
                                    )}
                                    {invoice.credit_note_adjustments?.length > 0 && (
                                      <>
                                        <div>
                                          <span className="text-gray-500">Credit Notes Adjusted:</span>
                                          <p className="font-medium text-red-600">-{formatCurrency(invoice.total_credit_adjusted || 0)}</p>
                                        </div>
                                        <div className="border-t pt-1">
                                          <span className="text-green-700 font-semibold">Final Payable:</span>
                                          <p className="font-bold text-green-700 text-lg">{formatCurrency(invoice.final_payable || invoice.net_payable)}</p>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                                  );
                                })()}
                                
                                {/* ============================================================ */}
                                {/* SAVTAMALI ONE-TIME CLEANUP NOTICE */}
                                {/* This can be disabled by setting SHOW_SAVTAMALI_CLEANUP_NOTICE = false */}
                                {/* ============================================================ */}
                                {invoice.savtamali_cleanup && (
                                  <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <AlertTriangle size={16} className="text-amber-600" />
                                      <span className="text-amber-800 font-medium text-sm">
                                        One-time Cleanup Notice
                                      </span>
                                    </div>
                                    <p className="text-amber-700 text-xs mt-1">
                                      Did one-time cleanup and the pending amount has been adjusted. 
                                      This invoice was part of the 50% to 100% upfront migration for Savtamali.
                                    </p>
                                    <p className="text-amber-600 text-[10px] mt-1">
                                      Cleanup date: {invoice.savtamali_cleanup_date ? new Date(invoice.savtamali_cleanup_date).toLocaleDateString('en-IN') : 'N/A'}
                                    </p>
                                  </div>
                                )}
                                {/* END SAVTAMALI CLEANUP NOTICE */}
                                
                                {/* ============================================================ */}
                                {/* NARANG SUPER MART CLEANUP NOTICE */}
                                {/* 100% upfront model correction - CN created for rejection amount */}
                                {/* ============================================================ */}
                                {invoice.narang_cleanup && (
                                  <div className="mb-3 p-3 bg-blue-50 border border-blue-300 rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <AlertTriangle size={16} className="text-blue-600" />
                                      <span className="text-blue-800 font-medium text-sm">
                                        100% Upfront Model Correction
                                      </span>
                                    </div>
                                    <p className="text-blue-700 text-xs mt-1">
                                      Individual Credit Notes have been created for each rejection item from this invoice. 
                                      Total rejection amount: ₹{invoice.rejection_amount?.toLocaleString() || '0'}.
                                      These CNs are pending and can be adjusted against any invoice.
                                    </p>
                                    <p className="text-blue-600 text-[10px] mt-1">
                                      Correction date: {invoice.narang_cleanup_date ? new Date(invoice.narang_cleanup_date).toLocaleDateString('en-IN') : 'N/A'}
                                    </p>
                                  </div>
                                )}
                                {/* END NARANG CLEANUP NOTICE */}
                                
                                {(() => {
                                  // Check if this invoice's retailer is 100% upfront
                                  const retailer = retailers.find(r => r.id === invoice.retailer_id);
                                  const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                                  
                                  return (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="p-2 text-left">Product</th>
                                      <th className="p-2 text-left">Variant</th>
                                      <th className="p-2 text-center">{isUpfront100 ? 'Qty' : 'Supplied Qty'}</th>
                                      {!isUpfront100 && <th className="p-2 text-center text-red-600">Rejection</th>}
                                      {!isUpfront100 && <th className="p-2 text-center text-green-700 font-semibold">Billable Qty</th>}
                                      <th className="p-2 text-right">Rate</th>
                                      <th className="p-2 text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {invoice.items?.map((item, idx) => {
                                      const suppliedQty = item.supplied_qty || item.quantity || 0;
                                      // For 100% upfront retailers, don't show rejections - invoice shows original amounts
                                      const rejectedQty = isUpfront100 ? 0 : (item.rejected_qty || 0);
                                      const billableQty = suppliedQty - rejectedQty;
                                      const rate = item.mrp || 0;
                                      // For 100% upfront: use supplied qty for amount (no rejection deduction)
                                      const amount = isUpfront100 ? (suppliedQty * rate) : (billableQty * rate);
                                      return (
                                        <tr key={idx}>
                                          <td className="p-2">{getProductName(item)}</td>
                                          <td className="p-2">{getIndentVariantDisplay(item)}</td>
                                          <td className="p-2 text-center">{suppliedQty}</td>
                                          {!isUpfront100 && <td className="p-2 text-center text-red-600">{rejectedQty > 0 ? `-${rejectedQty}` : '-'}</td>}
                                          {!isUpfront100 && <td className="p-2 text-center text-green-700 font-semibold">{billableQty}</td>}
                                          <td className="p-2 text-right">{formatCurrency(rate)}</td>
                                          <td className="p-2 text-right">{formatCurrency(amount)}</td>
                                        </tr>
                                      );
                                    })}
                                    {/* Subtotals row */}
                                    <tr className="border-t bg-gray-50 font-medium">
                                      <td colSpan={2} className="p-2 text-right">Subtotal:</td>
                                      <td className="p-2 text-center">
                                        {invoice.items?.reduce((sum, i) => sum + (i.supplied_qty || i.quantity || 0), 0)}
                                      </td>
                                      {!isUpfront100 && (
                                        <td className="p-2 text-center text-red-600">
                                          -{invoice.items?.reduce((sum, i) => sum + (i.rejected_qty || 0), 0)}
                                        </td>
                                      )}
                                      {!isUpfront100 && (
                                        <td className="p-2 text-center text-green-700">
                                          {invoice.items?.reduce((sum, i) => {
                                            const supplied = i.supplied_qty || i.quantity || 0;
                                            return sum + (supplied - (i.rejected_qty || 0));
                                          }, 0)}
                                        </td>
                                      )}
                                      <td className="p-2"></td>
                                      <td className="p-2 text-right">{formatCurrency(isUpfront100 ? invoice.gross_value : invoice.total_mrp_value)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                                  );
                                })()}
                                
                                {/* Credit Notes Adjusted IN this Invoice */}
                                {invoice.credit_note_adjustments?.length > 0 && (
                                  <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                    <h4 className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-2">
                                      <FileText size={14} />
                                      Credit Notes Adjusted in this Invoice
                                    </h4>
                                    <div className="space-y-2">
                                      {invoice.credit_note_adjustments.map((adj, adjIdx) => (
                                        <div key={adjIdx} className="bg-white rounded border p-2 text-xs">
                                          <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                              <span className="font-semibold text-green-700">{adj.credit_note_number}</span>
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                adj.source === 'excess_payment' 
                                                  ? 'bg-amber-100 text-amber-700' 
                                                  : 'bg-red-100 text-red-700'
                                              }`}>
                                                {adj.source === 'excess_payment' ? 'EXCESS PAYMENT' : 'REJECTION'}
                                              </span>
                                            </div>
                                            <span className="font-bold text-red-600">- {formatCurrency(adj.adjusted_amount)}</span>
                                          </div>
                                          {adj.source === 'excess_payment' ? (
                                            <div className="mt-1 text-blue-600 italic text-sm">
                                              Excess Payment Credit
                                            </div>
                                          ) : adj.rejection_details?.length > 0 ? (
                                            <div className="mt-1 text-gray-600">
                                              <span className="text-gray-500">Rejected:</span>{' '}
                                              {adj.rejection_details.map(r => `${r.product_name} (${r.quantity} ${r.variant_name || r.unit || ''})`).join(', ')}
                                            </div>
                                          ) : null}
                                        </div>
                                      ))}
                                      <div className="flex justify-between items-center pt-2 border-t border-green-200">
                                        <span className="font-semibold text-green-700">Total Adjusted:</span>
                                        <span className="font-bold text-red-600">- {formatCurrency(invoice.total_credit_adjusted || 0)}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Credit Notes Section - show if any credit notes exist for this invoice */}
                                {(() => {
                                  // Find credit notes created FROM this invoice (excess payment or rejection)
                                  const invoiceCNs = creditNotes.filter(cn => cn.original_invoice_id === invoice.id);
                                  if (invoiceCNs.length === 0) return null;
                                  
                                  return (
                                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                      <h4 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-2">
                                        <FileText size={14} />
                                        Credit Notes Created from this Invoice
                                      </h4>
                                      <div className="space-y-2">
                                        {invoiceCNs.map((cn, cnIdx) => (
                                          <div key={cnIdx} className="bg-white rounded border p-2 text-xs">
                                            <div className="flex justify-between items-center">
                                              <div className="flex items-center gap-2">
                                                <span className="font-semibold text-blue-700">{cn.credit_note_number}</span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                  cn.source === 'excess_payment' 
                                                    ? 'bg-amber-100 text-amber-700' 
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                  {cn.source === 'excess_payment' ? 'EXCESS PAYMENT' : 'REJECTION'}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                  cn.status === 'settled' ? 'bg-green-100 text-green-700' : 
                                                  cn.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 
                                                  'bg-gray-100 text-gray-700'
                                                }`}>
                                                  {cn.status?.toUpperCase()}
                                                </span>
                                              </div>
                                              <span className="font-bold text-blue-700">{formatCurrency(cn.amount)}</span>
                                            </div>
                                            {cn.source === 'excess_payment' ? (
                                              <div className="mt-1 text-blue-600 italic text-sm">
                                                Excess Payment Credit
                                              </div>
                                            ) : cn.rejection_details?.length > 0 ? (
                                              <div className="mt-1 text-gray-600">
                                                <span className="text-gray-500">Rejected:</span>{' '}
                                                {cn.rejection_details.map(r => `${r.product_name} (${r.quantity} ${r.variant_name || r.unit || ''})`).join(', ')}
                                              </div>
                                            ) : null}
                                            {cn.pending_amount > 0 && cn.pending_amount !== cn.amount && (
                                              <div className="mt-1">
                                                <span className="text-gray-500">Pending:</span>{' '}
                                                <span className="text-amber-600 font-medium">{formatCurrency(cn.pending_amount)}</span>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {filteredInvoices.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td colSpan={6} className="p-3 text-right">TOTAL:</td>
                        <td className="p-3 text-right">{formatCurrency(filteredInvoices.reduce((sum, i) => {
                          // Match row logic: for 100% upfront, recalculate from gross
                          const retailer = retailers.find(r => r.id === i.retailer_id);
                          const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                          const grossValue = i.gross_value || i.total_mrp_value || 0;
                          const commissionPct = i.commission_percentage || 0;
                          const netPayable = isUpfront100 
                            ? (grossValue - (grossValue * commissionPct / 100))
                            : (i.net_payable || 0);
                          const creditAdjusted = i.total_credit_adjusted || 0;
                          return sum + (netPayable - creditAdjusted);
                        }, 0))}</td>
                        <td className="p-3 text-right text-green-600">{formatCurrency(filteredInvoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0))}</td>
                        <td className="p-3 text-right text-amber-600">{formatCurrency(filteredInvoices.reduce((sum, i) => {
                          // Skip cleaned-up invoices (savtamali_cleanup) - their pending was cleared
                          if (i.savtamali_cleanup) {
                            return sum;
                          }
                          
                          // Match row logic exactly: pending = (netPayable - creditAdjusted) - paidAmount
                          const retailer = retailers.find(r => r.id === i.retailer_id);
                          const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                          const grossValue = i.gross_value || i.total_mrp_value || 0;
                          const commissionPct = i.commission_percentage || 0;
                          const netPayable = isUpfront100 
                            ? (grossValue - (grossValue * commissionPct / 100))
                            : (i.net_payable || 0);
                          const creditAdjusted = i.total_credit_adjusted || 0;
                          const actualReceivable = netPayable - creditAdjusted;
                          const paidAmount = i.paid_amount || 0;
                          const pendingAmount = actualReceivable - paidAmount;
                          
                          // Only count positive pending amounts (not excess payments)
                          return sum + Math.max(0, pendingAmount);
                        }, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== REJECTIONS TAB ==================== */}
        {activeTab === 'rejections' && (
          <Card>
            <CardHeader className="py-3 flex flex-col gap-3">
              <div className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">Rejections</CardTitle>
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
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={syncRejectionsToInvoices} 
                    disabled={syncingRejections}
                    title="Sync rejection amounts to invoices for Payment Summary"
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                  >
                    <RefreshCw size={14} className={`mr-1 ${syncingRejections ? 'animate-spin' : ''}`} />
                    {syncingRejections ? 'Syncing...' : 'Sync to Invoices'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={exportRejections} title="Export to Excel">
                    <FileSpreadsheet size={14} className="mr-1" /> Export
                  </Button>
                  <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowRejectionModal(true)}>
                    <Plus size={14} className="mr-1" /> Record Rejection
                  </Button>
                </div>
              </div>
              {/* Filters row - syncs with Rejection Loss block dates */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500">From:</span>
                <Input
                  type="date"
                  value={rejectionDateFrom || rejectionLossDateFrom}
                  onChange={(e) => setRejectionDateFrom(e.target.value)}
                  className="h-8 w-36 text-xs"
                  placeholder="From date"
                />
                <span className="text-xs text-gray-500">To:</span>
                <Input
                  type="date"
                  value={rejectionDateTo || rejectionLossDateTo}
                  onChange={(e) => setRejectionDateTo(e.target.value)}
                  className="h-8 w-36 text-xs"
                  placeholder="To date"
                />
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={() => {
                    // Apply the dates - update the Rejection Loss dates which triggers API call
                    if (rejectionDateFrom) setRejectionLossDateFrom(rejectionDateFrom);
                    if (rejectionDateTo) setRejectionLossDateTo(rejectionDateTo);
                  }}
                  className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white"
                  disabled={!rejectionDateFrom && !rejectionDateTo}
                >
                  Apply
                </Button>
                <select
                  value={rejectionRetailerFilter}
                  onChange={(e) => setRejectionRetailerFilter(e.target.value)}
                  className="h-8 px-2 rounded border text-xs"
                >
                  <option value="">All Retailers</option>
                  {retailers.map(r => (
                    <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                  ))}
                </select>
                <Input
                  type="text"
                  value={rejectionProductFilter}
                  onChange={(e) => setRejectionProductFilter(e.target.value)}
                  className="h-8 w-32 text-xs"
                  placeholder="Product..."
                />
                {(rejectionDateFrom || rejectionDateTo || rejectionRetailerFilter || rejectionProductFilter) && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => { 
                      setRejectionDateFrom(''); 
                      setRejectionDateTo(''); 
                      setRejectionRetailerFilter(''); 
                      setRejectionProductFilter(''); 
                    }} 
                    className="h-8 px-2"
                  >
                    <X size={12} /> Clear
                  </Button>
                )}
                <span className="text-xs text-gray-500">
                  Showing {filteredRejections.length} of {rejections.length} • Period: {rejectionLossDateFrom} to {rejectionLossDateTo}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* BY INVOICE DATE VIEW (Existing) */}
              {rejectionViewMode === 'by-invoice' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-center font-medium text-gray-500 w-10">#</th>
                      <th className="p-3 text-left font-medium text-gray-500 w-8"></th>
                      <th className="p-3 text-left font-medium text-gray-500">INVOICE DATE / PRODUCT</th>
                      <th className="p-3 text-left font-medium text-gray-500">RETAILER</th>
                      <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                      <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                      <th className="p-3 text-left font-medium text-gray-500">REASON</th>
                      <th className="p-3 text-center font-medium text-gray-500">CREDIT NOTE</th>
                      <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRejections.length === 0 ? (
                      <tr><td colSpan={9} className="p-8 text-center text-gray-400">No rejections found</td></tr>
                    ) : (() => {
                      // Group rejections by date
                      const rejectionsByDate = filteredRejections.reduce((acc, r) => {
                        const date = r.rejection_date?.split('T')[0] || 'Unknown';
                        if (!acc[date]) acc[date] = [];
                        acc[date].push(r);
                        return acc;
                      }, {});
                      
                      // Sort dates descending
                      const sortedDates = Object.keys(rejectionsByDate).sort((a, b) => b.localeCompare(a));
                      
                      return sortedDates.map((date, dateIdx) => {
                        const dateRejections = rejectionsByDate[date];
                        const isExpanded = expandedRejectionDates[date];
                        const totalQty = dateRejections.reduce((sum, r) => sum + (r.quantity || 0), 0);
                        const totalValue = dateRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0);
                        
                        // Get unique retailers for this date
                        const uniqueRetailers = [...new Set(dateRejections.map(r => getRetailerNameById(r.retailer_id) || r.retailer_name))];
                        
                        return (
                          <React.Fragment key={date}>
                            {/* Date Row - Clickable */}
                            <tr 
                              className="border-b bg-red-50 hover:bg-red-100 cursor-pointer"
                              onClick={() => setExpandedRejectionDates(prev => ({ ...prev, [date]: !prev[date] }))}
                            >
                              <td className="p-3 text-center text-gray-500">{dateIdx + 1}</td>
                              <td className="p-3 text-center">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{formatDate(date)}</td>
                              <td className="p-3 text-gray-600 text-xs">{uniqueRetailers.length === 1 ? uniqueRetailers[0] : `${uniqueRetailers.length} retailers`}</td>
                              <td className="p-3 text-center text-red-600 font-semibold">{totalQty}</td>
                              <td className="p-3 text-right text-red-600 font-semibold">{formatCurrency(totalValue)}</td>
                              <td className="p-3 text-gray-500 text-xs">{dateRejections.length} item(s)</td>
                              <td className="p-3"></td>
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
                                  {/* Show when this rejection was recorded */}
                                  {rejection.created_at && (
                                    <div className="text-[10px] text-gray-400 italic mt-0.5">
                                      Recorded: {new Date(rejection.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at {new Date(rejection.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 text-gray-600 text-sm">{getRetailerNameById(rejection.retailer_id) || rejection.retailer_name}</td>
                                <td className="p-2 text-center text-red-500">{rejection.quantity}</td>
                                <td className="p-2 text-right text-red-500">{formatCurrency(rejection.rejection_value)}</td>
                                <td className="p-2 text-gray-500">{rejection.reason}</td>
                                <td className="p-2 text-center">
                                  {rejection.credit_note_number ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-xs font-medium text-purple-700">{rejection.credit_note_number}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        rejection.credit_note_status === 'adjusted' ? 'bg-green-100 text-green-700' :
                                        rejection.credit_note_status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                        'bg-purple-100 text-purple-700'
                                      }`}>
                                        {rejection.credit_note_status || 'pending'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setSelectedRejectionForCN(rejection);
                                        setShowCreditNoteModal(true);
                                      }}
                                      title="Create Credit Note"
                                      className="text-purple-600 hover:text-purple-800"
                                    >
                                      <CreditCard size={14} />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleEditRejection(rejection); }}>
                                      <Edit size={14} className="text-amber-600" />
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDeleteRejection(rejection.id); }}>
                                      <Trash2 size={14} className="text-red-600" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                  {filteredRejections.length > 0 && (
                    <tfoot className="bg-gray-100 font-semibold">
                      <tr>
                        <td className="p-3"></td>
                        <td colSpan={2} className="p-3 text-right">Total Rejected:</td>
                        <td className="p-3 text-center text-red-600">{filteredRejections.reduce((sum, r) => sum + (r.quantity || 0), 0)}</td>
                        <td className="p-3 text-right text-red-600">{formatCurrency(filteredRejections.reduce((sum, r) => sum + (r.rejection_value || 0), 0))}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              )}
              
              {/* BY RECORDED DATE VIEW (Daily Summary) */}
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
                        <th className="p-3 text-center font-medium text-gray-500 w-10">#</th>
                        <th className="p-3 text-left font-medium text-gray-500 w-8"></th>
                        <th className="p-3 text-left font-medium text-gray-500">RECORDED DATE</th>
                        <th className="p-3 text-left font-medium text-gray-500">RETAILERS</th>
                        <th className="p-3 text-center font-medium text-gray-500">QTY</th>
                        <th className="p-3 text-right font-medium text-gray-500">VALUE</th>
                        <th className="p-3 text-left font-medium text-gray-500">DETAILS</th>
                        <th className="p-3 text-center font-medium text-gray-500">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyRejectionSummary.map((dayData, dateIdx) => {
                        const isExpanded = expandedDailyDates[dayData.date];
                        return (
                          <React.Fragment key={dayData.date}>
                            {/* Date Row - Clickable */}
                            <tr 
                              className="border-b bg-orange-50 hover:bg-orange-100 cursor-pointer"
                              onClick={() => setExpandedDailyDates(prev => ({ ...prev, [dayData.date]: !prev[dayData.date] }))}
                            >
                              <td className="p-3 text-center text-gray-500">{dateIdx + 1}</td>
                              <td className="p-3 text-center">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-3 font-semibold text-gray-800">{formatDate(dayData.date)}</td>
                              <td className="p-3 text-gray-600 text-xs">
                                {dayData.retailers.length === 1 
                                  ? dayData.retailers[0].retailer_name 
                                  : `${dayData.retailers.length} retailers`}
                              </td>
                              <td className="p-3 text-center text-orange-600 font-semibold">{dayData.total_qty}</td>
                              <td className="p-3 text-right text-orange-600 font-semibold">{formatCurrency(dayData.total_value)}</td>
                              <td className="p-3 text-gray-500 text-xs">{dayData.rejection_count} rejection(s)</td>
                              <td className="p-3"></td>
                            </tr>
                            
                            {/* Expanded: Per-Retailer Breakdown */}
                            {isExpanded && dayData.retailers.map((retailer) => (
                              <React.Fragment key={retailer.retailer_id}>
                                {/* Retailer Sub-header */}
                                <tr className="border-b bg-gray-50">
                                  <td colSpan={2}></td>
                                  <td className="p-2 pl-6 font-medium text-gray-700 text-sm" colSpan={2}>
                                    {retailer.retailer_name}
                                  </td>
                                  <td className="p-2 text-center text-orange-500 font-medium">{retailer.total_qty}</td>
                                  <td className="p-2 text-right text-orange-500 font-medium">{formatCurrency(retailer.total_value)}</td>
                                  <td className="p-2 text-gray-400 text-xs">{retailer.items.length} item(s)</td>
                                  <td className="p-2"></td>
                                </tr>
                                {/* Individual Items */}
                                {retailer.items.map((item, itemIdx) => (
                                  <tr key={item.id || itemIdx} className="border-b bg-white hover:bg-gray-50">
                                    <td colSpan={2}></td>
                                    <td className="p-2 pl-10">
                                      <span className="text-sm text-gray-700">{item.product_name}</span>
                                      {item.variant_name && (
                                        <span className="text-xs text-gray-400 ml-1">({item.variant_name})</span>
                                      )}
                                      <div className="text-[10px] text-gray-400 mt-0.5">
                                        Against Invoice: {formatDate(item.invoice_date)}
                                      </div>
                                    </td>
                                    <td className="p-2"></td>
                                    <td className="p-2 text-center text-red-500">{item.quantity}</td>
                                    <td className="p-2 text-right text-red-500">{formatCurrency(item.rejection_value)}</td>
                                    <td className="p-2 text-gray-500 text-xs">{item.reason || '-'}</td>
                                    <td className="p-2 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700"
                                          onClick={(e) => { e.stopPropagation(); handleEditRejection(item); }}
                                          title="Edit Rejection"
                                        >
                                          <Edit2 size={14} />
                                        </Button>
                                        <Button 
                                          size="sm" 
                                          variant="ghost" 
                                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                          onClick={(e) => { e.stopPropagation(); handleDeleteRejection(item.id); }}
                                          title="Delete Rejection"
                                        >
                                          <Trash2 size={14} />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    {dailyRejectionSummary.length > 0 && (
                      <tfoot className="bg-gray-100 font-semibold">
                        <tr>
                          <td className="p-3"></td>
                          <td colSpan={3} className="p-3 text-right">Total Rejected:</td>
                          <td className="p-3 text-center text-orange-600">
                            {dailyRejectionSummary.reduce((sum, d) => sum + d.total_qty, 0)}
                          </td>
                          <td className="p-3 text-right text-orange-600">
                            {formatCurrency(dailyRejectionSummary.reduce((sum, d) => sum + d.total_value, 0))}
                          </td>
                          <td></td>
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

        {/* ==================== STATEMENT/LEDGER TAB ==================== */}
        {activeTab === 'statement' && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileSpreadsheet size={18} className="text-blue-600" />
                      Statement / Ledger
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">
                      Complete financial ledger showing invoices, payments, rejections, and credit notes
                    </p>
                  </div>
                </div>
                
                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-xs text-gray-500 mb-1 block">Retailer</label>
                    <Select 
                      value={statementRetailerId} 
                      onValueChange={(val) => setStatementRetailerId(val)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select Retailer" />
                      </SelectTrigger>
                      <SelectContent>
                        {retailers.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.company_name || r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">From Date</label>
                    <Input
                      type="date"
                      value={statementStartDate}
                      onChange={(e) => setStatementStartDate(e.target.value)}
                      className="h-9 text-sm w-40"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">To Date</label>
                    <Input
                      type="date"
                      value={statementEndDate}
                      onChange={(e) => setStatementEndDate(e.target.value)}
                      className="h-9 text-sm w-40"
                    />
                  </div>
                  <Button 
                    onClick={() => loadStatement(statementRetailerId, statementStartDate, statementEndDate)}
                    disabled={!statementRetailerId || statementLoading}
                    className="h-9"
                  >
                    {statementLoading ? (
                      <RefreshCw size={14} className="animate-spin mr-2" />
                    ) : (
                      <Search size={14} className="mr-2" />
                    )}
                    Load Statement
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              {statementData ? (
                <div>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
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
                  
                  {/* Ledger Table - Compact */}
                  <div className="border rounded-lg">
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
                              // Grouped entry with multiple items
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
                                      <div className="flex items-center gap-2">
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
                                        <span className="text-xs text-gray-500">(click to {isExpanded ? 'collapse' : 'expand'})</span>
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
                                      <td className="px-2 py-1 text-gray-400 text-xs pl-6">↳</td>
                                      <td className="px-2 py-1">
                                        <div className="flex items-center gap-2 pl-6">
                                          <span className="text-gray-600 text-sm">{item.reference}</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-1 text-right text-red-500 text-sm">
                                        {item.debit > 0 ? item.debit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-right text-green-500 text-sm">
                                        {item.credit > 0 ? item.credit.toLocaleString('en-IN', { minimumFractionDigits: 0 }) : '-'}
                                      </td>
                                      <td className="px-2 py-1 text-right text-gray-400 text-sm">
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
                                    <div className="flex items-center gap-2">
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
                  
                  {statementData.entries?.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No transactions found for the selected period
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileSpreadsheet size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Select a retailer and date range, then click "Load Statement" to view the ledger</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ==================== CREDIT NOTES TAB ==================== */}
        {activeTab === 'creditNotes' && (
          <Card>
            <CardHeader className="py-3">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CreditCard size={18} className="text-purple-600" />
                    Credit Notes
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    Track credit notes from rejections and their adjustments against invoices
                  </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {/* Show selected retailer info */}
                  {selectedRetailer && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      {retailers.find(r => r.id === selectedRetailer)?.company_name || 'Selected Retailer'}
                    </span>
                  )}
                  {/* Status Filter */}
                  <select
                    value={creditNoteFilter.status}
                    onChange={(e) => setCreditNoteFilter(prev => ({ ...prev, status: e.target.value }))}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="adjusted">Adjusted</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={loadCreditNotes}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={backfillCreditNoteDetails}
                    disabled={isBackfillingCreditNotes}
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    title="Fix credit notes that are missing product-level details"
                  >
                    {isBackfillingCreditNotes ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Fixing...
                      </>
                    ) : (
                      <>
                        <Wrench className="h-3 w-3 mr-1" /> Fix Product Details
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={backfillMissingCreditNotes}
                    disabled={isBackfillingMissingCNs}
                    className="border-green-300 text-green-700 hover:bg-green-50"
                    title="Create credit notes for rejections that are missing them"
                  >
                    {isBackfillingMissingCNs ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" /> Backfill Missing CNs
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={reconcile100UpfrontCNs}
                    disabled={isReconciling100UpfrontCNs}
                    className="border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    title="Create instant CNs for 100% upfront retailers with pending rejections"
                  >
                    {isReconciling100UpfrontCNs ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Reconciling...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-3 w-3 mr-1" /> Reconcile 100% Upfront CNs
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={cleanupBogusCreditNotes}
                    disabled={isCleaningBogusCNs}
                    className="border-red-500 bg-red-50 text-red-700 hover:bg-red-100"
                    title="ONE-TIME: Delete bogus CNs created on June 26 for Jai Bhawani & Savtamali"
                  >
                    {isCleaningBogusCNs ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Cleaning...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3 w-3 mr-1" /> 🚨 Cleanup Bogus CNs
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={setModelChangeDates}
                    disabled={isSettingModelDates}
                    className="border-orange-500 bg-orange-50 text-orange-700 hover:bg-orange-100"
                    title="ONE-TIME: Set June 18 as model switch date for Jai Bhawani & Savtamali"
                  >
                    {isSettingModelDates ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Setting...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-3 w-3 mr-1" /> Set Model Switch Dates
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={fixOrphanedCreditNotes}
                    disabled={isFixingOrphanedCNs}
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                    title="Reset credit notes that reference deleted invoices back to pending status"
                  >
                    {isFixingOrphanedCNs ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Fixing...
                      </>
                    ) : (
                      <>
                        <Wrench className="h-3 w-3 mr-1" /> Fix Orphaned CNs
                      </>
                    )}
                  </Button>
                  
                  {/* Diagnose CN-Invoice Sync Issues */}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={diagnoseCNSyncIssues}
                    disabled={isDiagnosingCNSync}
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    title="Diagnose credit notes that show as 'adjusted' but invoice doesn't have the adjustment"
                  >
                    {isDiagnosingCNSync ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Diagnosing...
                      </>
                    ) : (
                      <>
                        <Search className="h-3 w-3 mr-1" /> Diagnose Sync
                      </>
                    )}
                  </Button>
                  
                  {/* Fix CN-Invoice Sync Issues */}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => fixCNSyncIssues(false)}
                    disabled={isFixingCNSync}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                    title="Fix invoices that are missing credit note adjustments"
                  >
                    {isFixingCNSync ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Fixing...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3 w-3 mr-1" /> Fix Sync Issues
                      </>
                    )}
                  </Button>
                </div>
                
                {/* Date and Retailer Filters */}
                <div className="flex flex-wrap gap-2 items-center border-t pt-3 mt-3">
                  <span className="text-xs text-gray-500">From:</span>
                  <Input
                    type="date"
                    value={creditNoteDateFrom}
                    onChange={(e) => setCreditNoteDateFrom(e.target.value)}
                    className="h-8 w-36 text-xs"
                    placeholder="From date"
                  />
                  <span className="text-xs text-gray-500">To:</span>
                  <Input
                    type="date"
                    value={creditNoteDateTo}
                    onChange={(e) => setCreditNoteDateTo(e.target.value)}
                    className="h-8 w-36 text-xs"
                    placeholder="To date"
                  />
                  {/* Searchable Retailer Dropdown */}
                  <div className="relative">
                    <Input
                      type="text"
                      value={creditNoteRetailerSearch}
                      onChange={(e) => {
                        setCreditNoteRetailerSearch(e.target.value);
                        setShowCreditNoteRetailerDropdown(true);
                      }}
                      onFocus={() => setShowCreditNoteRetailerDropdown(true)}
                      placeholder={creditNoteRetailerFilter ? retailers.find(r => r.id === creditNoteRetailerFilter)?.company_name || retailers.find(r => r.id === creditNoteRetailerFilter)?.name || 'All Retailers' : 'All Retailers'}
                      className="h-8 w-44 text-xs"
                    />
                    {showCreditNoteRetailerDropdown && (
                      <div className="absolute z-50 w-64 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                        <div
                          onClick={() => {
                            setCreditNoteRetailerFilter('');
                            setCreditNoteRetailerSearch('');
                            setShowCreditNoteRetailerDropdown(false);
                          }}
                          className="px-3 py-2 text-xs hover:bg-gray-100 cursor-pointer font-medium text-gray-600"
                        >
                          All Retailers
                        </div>
                        {retailers
                          .filter(r => {
                            const name = (r.company_name || r.name || '').toLowerCase();
                            return name.includes(creditNoteRetailerSearch.toLowerCase());
                          })
                          .slice(0, 20)
                          .map(r => (
                            <div
                              key={r.id}
                              onClick={() => {
                                setCreditNoteRetailerFilter(r.id);
                                setCreditNoteRetailerSearch('');
                                setShowCreditNoteRetailerDropdown(false);
                              }}
                              className={`px-3 py-2 text-xs hover:bg-gray-100 cursor-pointer ${creditNoteRetailerFilter === r.id ? 'bg-purple-50' : ''}`}
                            >
                              {r.company_name || r.name}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={loadCreditNotes}
                    className="h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Apply
                  </Button>
                  {(creditNoteDateFrom || creditNoteDateTo || creditNoteRetailerFilter) && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => { 
                        setCreditNoteDateFrom(''); 
                        setCreditNoteDateTo(''); 
                        setCreditNoteRetailerFilter('');
                        setCreditNoteRetailerSearch('');
                      }} 
                      className="h-8 px-2"
                    >
                      <X size={12} /> Clear
                    </Button>
                  )}
                  <span className="text-xs text-gray-500 ml-auto">
                    Showing {creditNotes.length} credit notes
                  </span>
                </div>
                
                {/* Diagnostic Results Panel */}
                {cnSyncDiagnostics && cnSyncDiagnostics.summary.total_mismatches > 0 && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-xs font-medium text-amber-800 mb-1">
                      Sync Issues Found: {cnSyncDiagnostics.summary.total_mismatches}
                    </div>
                    <div className="text-xs text-amber-700 space-y-0.5">
                      <div>• CN not in Invoice: {cnSyncDiagnostics.summary.by_type.CN_NOT_IN_INVOICE}</div>
                      <div>• Invoice not found: {cnSyncDiagnostics.summary.by_type.INVOICE_NOT_FOUND}</div>
                      <div>• Amount mismatch: {cnSyncDiagnostics.summary.by_type.AMOUNT_MISMATCH}</div>
                      <div>• Total mismatch: {cnSyncDiagnostics.summary.by_type.TOTAL_MISMATCH}</div>
                    </div>
                    <div className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-600 border-t border-amber-200 pt-1">
                      {cnSyncDiagnostics.mismatches.slice(0, 10).map((m, i) => (
                        <div key={i} className="py-0.5 border-b border-amber-100 last:border-0">
                          <span className="font-medium">{m.credit_note_number || m.invoice_number}</span>: {m.issue}
                        </div>
                      ))}
                      {cnSyncDiagnostics.mismatches.length > 10 && (
                        <div className="text-amber-600 font-medium mt-1">
                          ... and {cnSyncDiagnostics.mismatches.length - 10} more issues
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {/* Summary Cards */}
              {(() => {
                // Filter only by status (retailer filter is applied at API level via selectedRetailer)
                const filteredCNs = creditNotes.filter(cn => {
                  if (creditNoteFilter.status && cn.status !== creditNoteFilter.status) return false;
                  return true;
                });
                
                // Group by invoice date
                const dateGroups = {};
                filteredCNs.forEach(cn => {
                  // Extract date from invoice_number or use rejection_date
                  let dateKey = 'Unknown';
                  if (cn.original_invoice_number) {
                    const match = cn.original_invoice_number.match(/(\d{2})([A-Z]{3})(\d{4})/);
                    if (match) {
                      const monthMap = {'JAN':'01','FEB':'02','MAR':'03','APR':'04','MAY':'05','JUN':'06','JUL':'07','AUG':'08','SEP':'09','OCT':'10','NOV':'11','DEC':'12'};
                      dateKey = `${match[3]}-${monthMap[match[2]] || '01'}-${match[1]}`;
                    }
                  }
                  if (!dateGroups[dateKey]) {
                    dateGroups[dateKey] = { creditNotes: [], totalAmount: 0, totalPending: 0, totalAdjusted: 0 };
                  }
                  dateGroups[dateKey].creditNotes.push(cn);
                  dateGroups[dateKey].totalAmount += cn.amount || 0;
                  dateGroups[dateKey].totalPending += cn.pending_amount || 0;
                  dateGroups[dateKey].totalAdjusted += cn.adjusted_amount || 0;
                });
                
                const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
                
                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                        <div className="text-xs text-purple-600">Total Credit Issued</div>
                        <div className="text-lg font-bold text-purple-700">
                          ₹{filteredCNs.reduce((sum, cn) => sum + (cn.amount || 0), 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                        <div className="text-xs text-amber-600">Pending Credit</div>
                        <div className="text-lg font-bold text-amber-700">
                          ₹{filteredCNs.filter(cn => cn.status !== 'adjusted').reduce((sum, cn) => sum + (cn.pending_amount || 0), 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                        <div className="text-xs text-green-600">Adjusted</div>
                        <div className="text-lg font-bold text-green-700">
                          ₹{filteredCNs.reduce((sum, cn) => sum + (cn.adjusted_amount || 0), 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <div className="text-xs text-gray-600">Total Notes</div>
                        <div className="text-lg font-bold text-gray-700">{filteredCNs.length}</div>
                      </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                        <button
                          onClick={() => setCreditNoteViewMode('by-invoice')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            creditNoteViewMode === 'by-invoice' 
                              ? 'bg-white text-purple-700 shadow-sm' 
                              : 'text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          📅 By Invoice Date
                        </button>
                        <button
                          onClick={() => setCreditNoteViewMode('by-recorded')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            creditNoteViewMode === 'by-recorded' 
                              ? 'bg-white text-purple-700 shadow-sm' 
                              : 'text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          🕐 By Recorded Date
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">
                        {creditNoteViewMode === 'by-invoice' 
                          ? 'Grouped by original invoice date' 
                          : 'Grouped by when credit note was created'}
                      </div>
                    </div>

                    {/* Date-wise Credit Notes List */}
                    <div className="space-y-3">
                      {(() => {
                        // Group by selected date mode
                        const dateGroups = {};
                        filteredCNs.forEach(cn => {
                          let dateKey = 'Unknown';
                          
                          if (creditNoteViewMode === 'by-invoice') {
                            // Group by invoice date (extracted from invoice number)
                            if (cn.original_invoice_number) {
                              const match = cn.original_invoice_number.match(/(\d{2})([A-Z]{3})(\d{4})/);
                              if (match) {
                                const monthMap = {'JAN':'01','FEB':'02','MAR':'03','APR':'04','MAY':'05','JUN':'06','JUL':'07','AUG':'08','SEP':'09','OCT':'10','NOV':'11','DEC':'12'};
                                dateKey = `${match[3]}-${monthMap[match[2]] || '01'}-${match[1]}`;
                              }
                            }
                            // Fallback to rejection_date for CNs without invoice number (like cleanup CNs)
                            if (dateKey === 'Unknown' && cn.rejection_date) {
                              dateKey = cn.rejection_date.substring(0, 10);
                            }
                          } else {
                            // Group by recorded/created date (when the credit note was created in the system)
                            if (cn.created_at) {
                              dateKey = cn.created_at.substring(0, 10);
                            } else if (cn.rejection_date) {
                              dateKey = cn.rejection_date.substring(0, 10);
                            }
                          }
                          
                          if (!dateGroups[dateKey]) {
                            dateGroups[dateKey] = { creditNotes: [], totalAmount: 0, totalPending: 0, totalAdjusted: 0 };
                          }
                          dateGroups[dateKey].creditNotes.push(cn);
                          dateGroups[dateKey].totalAmount += cn.amount || 0;
                          dateGroups[dateKey].totalPending += cn.pending_amount || 0;
                          dateGroups[dateKey].totalAdjusted += cn.adjusted_amount || 0;
                        });
                        
                        const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
                        
                        return sortedDates.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <CreditCard size={40} className="mx-auto mb-2 text-gray-300" />
                          <p>No credit notes found</p>
                        </div>
                      ) : (
                        sortedDates.map(dateKey => {
                          const group = dateGroups[dateKey];
                          const isExpanded = expandedCreditNoteDates[dateKey];
                          
                          return (
                            <div key={dateKey} className="border rounded-lg overflow-hidden">
                              {/* Date Header - Clickable */}
                              <div
                                className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => setExpandedCreditNoteDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }))}
                              >
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown size={18} className="text-gray-500" />
                                  ) : (
                                    <ChevronRight size={18} className="text-gray-500" />
                                  )}
                                  <div>
                                    <p className="font-semibold text-gray-800">
                                      {dateKey !== 'Unknown' 
                                        ? new Date(dateKey).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                                        : 'Unknown Date'
                                      }
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {group.creditNotes.length} credit note(s)
                                      {!selectedRetailer && (() => {
                                        const uniqueRetailers = [...new Set(group.creditNotes.map(cn => cn.retailer_id).filter(id => id))];
                                        return uniqueRetailers.length > 0 ? ` • ${uniqueRetailers.length} retailer(s)` : '';
                                      })()}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-lg font-bold text-purple-600">₹{group.totalAmount.toLocaleString()}</p>
                                  {group.totalPending > 0 && (
                                    <p className="text-xs text-amber-600">Pending: ₹{group.totalPending.toLocaleString()}</p>
                                  )}
                                </div>
                              </div>
                              
                              {/* Expanded Details */}
                              {isExpanded && (
                                <div className="border-t bg-white">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="p-2 text-left">CN #</th>
                                        <th className="p-2 text-left">Retailer</th>
                                        <th className="p-2 text-left">Product</th>
                                        <th className="p-2 text-center">Qty</th>
                                        <th className="p-2 text-right">Amount</th>
                                        <th className="p-2 text-right text-green-600">Adjusted</th>
                                        <th className="p-2 text-left text-blue-600">Against Invoice</th>
                                        <th className="p-2 text-right text-amber-600">Pending</th>
                                        <th className="p-2 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {group.creditNotes.map(cn => {
                                        const details = cn.rejection_details?.[0] || {};
                                        return (
                                          <tr key={cn.id} className="border-t hover:bg-gray-50">
                                            <td className="p-2 font-medium text-purple-700">{cn.credit_note_number}</td>
                                            <td className="p-2">{cn.retailer_name}</td>
                                            <td className="p-2">
                                              {cn.source === 'excess_payment' ? (
                                                <span className="text-blue-600 italic">Excess Payment Credit</span>
                                              ) : (
                                                <>
                                                  {details.product_name || '-'} {details.variant_name ? `(${details.variant_name})` : ''}
                                                </>
                                              )}
                                            </td>
                                            <td className="p-2 text-center">
                                              {cn.source === 'excess_payment' ? '-' : (details.quantity || '-')}
                                            </td>
                                            <td className="p-2 text-right">
                                              <div className="font-medium">₹{cn.amount?.toLocaleString()}</div>
                                              {cn.commission_deducted > 0 && (
                                                <div className="text-[10px] text-gray-500">
                                                  (MRP ₹{cn.rejection_value?.toLocaleString()} - {cn.commission_percentage}%)
                                                </div>
                                              )}
                                            </td>
                                            <td className="p-2 text-right text-green-600">₹{(cn.adjusted_amount || 0).toLocaleString()}</td>
                                            <td className="p-2 text-left text-blue-600 text-xs">
                                              {/* Check both adjusted_against_invoices and adjusted_in_invoices */}
                                              {(() => {
                                                const adjustments = cn.adjusted_against_invoices?.length > 0 
                                                  ? cn.adjusted_against_invoices 
                                                  : cn.adjusted_in_invoices;
                                                
                                                if (adjustments && adjustments.length > 0) {
                                                  return (
                                                    <div className="space-y-0.5">
                                                      {adjustments.map((adj, i) => (
                                                        <div key={i} className="flex items-center gap-1">
                                                          <span className="font-medium">{adj.invoice_number}</span>
                                                          <span className="text-gray-400">(₹{adj.adjusted_amount || adj.amount})</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  );
                                                } else if (cn.status === 'adjusted') {
                                                  return <span className="text-gray-400 italic">-</span>;
                                                } else {
                                                  return <span className="text-gray-400">-</span>;
                                                }
                                              })()}
                                            </td>
                                            <td className="p-2 text-right text-amber-600">₹{(cn.pending_amount || 0).toLocaleString()}</td>
                                            <td className="p-2 text-center">
                                              <span className={`px-2 py-0.5 rounded text-xs ${
                                                cn.status === 'adjusted' ? 'bg-green-100 text-green-700' :
                                                cn.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                                'bg-purple-100 text-purple-700'
                                              }`}>
                                                {cn.status}
                                              </span>
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
                        })
                      );
                      })()}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* ==================== STOCK CLOSING TAB (Matrix Style - Like Retail Plans) ==================== */}
        {activeTab === 'closingInventory' && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardList size={18} className="text-green-600" />
                Stock Closing
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">Record daily closing stock for retailers</p>
            </CardHeader>
            <CardContent>
              {/* Today's Closing Summary */}
              {todayClosingSummary.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                    <ClipboardList size={16} />
                    Today's Closing Summary ({new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })})
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {todayClosingSummary.map(item => (
                      <div 
                        key={item.retailer_id}
                        onClick={() => {
                          setClosingInventoryRetailer(item.retailer_id);
                          setClosingInventoryDate(getISTDate());
                          setTimeout(() => loadStockClosingData(), 100);
                        }}
                        className={`p-2 rounded cursor-pointer transition-colors text-xs ${
                          item.status === 'complete' 
                            ? 'bg-green-100 hover:bg-green-200 border border-green-300'
                            : 'bg-amber-100 hover:bg-amber-200 border border-amber-300'
                        }`}
                      >
                        <div className="font-medium truncate">{item.retailer_name}</div>
                        <div className="flex justify-between mt-1">
                          <span className={item.status === 'complete' ? 'text-green-700' : 'text-amber-700'}>
                            {item.status === 'complete' ? '✓ Recorded' : '○ Pending'}
                          </span>
                          {item.status === 'complete' && (
                            <span className="text-gray-600">{item.total_items} items</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {todayClosingSummaryLoading && (
                    <div className="text-center text-xs text-gray-500 mt-2">Loading...</div>
                  )}
                </div>
              )}

              {/* Filters Row */}
              <div className="flex flex-wrap gap-4 mb-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Select Retailer</label>
                  <select
                    value={closingInventoryRetailer}
                    onChange={(e) => {
                      setClosingInventoryRetailer(e.target.value);
                      setStockClosingData({});
                    }}
                    className="w-full h-9 border rounded px-3 text-sm"
                  >
                    <option value="">-- Select Retailer --</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                  <Input
                    type="date"
                    value={closingInventoryDate}
                    onChange={(e) => setClosingInventoryDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={loadStockClosingData}
                    className="h-9"
                    disabled={!closingInventoryRetailer}
                  >
                    <Search size={14} className="mr-1" /> Load
                  </Button>
                  {closingInventoryDate === getISTDate() && stockClosingHasChanges && (
                    <Button 
                      size="sm" 
                      onClick={saveStockClosing}
                      className="h-9 bg-green-600 hover:bg-green-700 text-white"
                      disabled={stockClosingSaving}
                    >
                      <Save size={14} className="mr-1" /> {stockClosingSaving ? 'Saving...' : 'Save Closing'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Search Bar - visible when catalogue is loaded */}
              {stockClosingCatalogue.length > 0 && (
                <div className="mb-4">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search products..."
                      value={stockClosingSearchTerm}
                      onChange={(e) => {
                        const value = e.target.value;
                        setStockClosingSearchTerm(value);
                        // Auto-expand all categories when searching
                        if (value.trim()) {
                          const expanded = {};
                          stockClosingCategories.forEach(cat => expanded[cat] = true);
                          setStockClosingExpandedCats(expanded);
                        }
                      }}
                      className="pl-10 h-9"
                    />
                    {stockClosingSearchTerm && (
                      <button
                        onClick={() => {
                          setStockClosingSearchTerm('');
                          setStockClosingExpandedCats({});
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Date indicator - Today vs Historical */}
              {closingInventoryRetailer && closingInventoryDate && (
                <div className={`mb-4 px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  closingInventoryDate === getISTDate()
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-gray-100 border border-gray-200 text-gray-600'
                }`}>
                  {closingInventoryDate === getISTDate() ? (
                    <>
                      <Edit size={14} />
                      <span>Today's closing - You can edit and save</span>
                    </>
                  ) : (
                    <>
                      <Eye size={14} />
                      <span>Historical data - View only</span>
                    </>
                  )}
                </div>
              )}

              {/* Matrix Table */}
              {closingInventoryRetailer && stockClosingCatalogue.length > 0 ? (
                <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700 min-w-[250px] border-r">
                            Products / Variants
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-blue-600 min-w-[100px]">
                            Opening
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-amber-600 min-w-[120px]">
                            Closing
                          </th>
                          {closingInventoryDate !== getISTDate() && (
                            <th className="px-4 py-3 text-center font-medium text-purple-600 min-w-[100px]">
                              Items Sold
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStockClosingCategories.map(category => (
                          <React.Fragment key={category}>
                            {/* Category Row */}
                            <tr 
                              className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                              onClick={() => setStockClosingExpandedCats(prev => ({
                                ...prev,
                                [category]: !prev[category]
                              }))}
                            >
                              <td 
                                colSpan={closingInventoryDate === getISTDate() ? 3 : 4}
                                className="px-4 py-2 font-medium text-gray-700"
                              >
                                <div className="flex items-center gap-2">
                                  {stockClosingExpandedCats[category] ? (
                                    <ChevronDown size={16} />
                                  ) : (
                                    <ChevronRight size={16} />
                                  )}
                                  {category}
                                  <span className="text-xs text-gray-500">
                                    ({stockClosingCatalogueByCategory[category]?.length || 0} items)
                                  </span>
                                </div>
                              </td>
                            </tr>
                            
                            {/* Product Rows */}
                            {stockClosingExpandedCats[category] && stockClosingCatalogueByCategory[category]?.map(item => {
                              // Get all display variants from catalogue
                              const itemVariants = Array.isArray(item.variants) ? item.variants : [];
                              const hasWeightVariants = itemVariants.some(v => v && !v.startsWith('unit_'));
                              const displayVariants = hasWeightVariants 
                                ? itemVariants.filter(v => v && !v.startsWith('unit_'))
                                : itemVariants;
                              
                              if (displayVariants.length === 0) {
                                return (
                                  <tr key={item.product_id} className="border-b hover:bg-gray-50">
                                    <td className="sticky left-0 bg-white px-4 py-2 border-r">
                                      <span className="text-sm">{item.product_name}</span>
                                      <span className="text-xs text-gray-400 ml-2">(No variant)</span>
                                    </td>
                                    <td className="px-4 py-2 text-center text-gray-300">-</td>
                                    <td className="px-4 py-2 text-center text-gray-300">-</td>
                                    {closingInventoryDate !== getISTDate() && (
                                      <td className="px-4 py-2 text-center text-gray-300">-</td>
                                    )}
                                  </tr>
                                );
                              }
                              
                              return displayVariants.map(variantId => {
                                const variantName = getStockClosingVariantName(variantId);
                                const key = `${item.product_id}_${variantId}`;
                                const openingQty = stockClosingOpeningData[key] || 0;
                                const closingQty = stockClosingData[key] ?? '';
                                const isToday = closingInventoryDate === getISTDate();
                                const itemsSold = closingQty !== '' ? Math.max(0, openingQty - parseFloat(closingQty || 0)) : '-';
                                
                                return (
                                  <tr key={key} className="border-b hover:bg-gray-50">
                                    <td className="sticky left-0 bg-white px-4 py-2 border-r">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{item.product_name}</span>
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                                          {variantName}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      <span className={`font-medium ${openingQty > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                                        {openingQty}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      {isToday ? (
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={closingQty}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                              setStockClosingData(prev => ({
                                                ...prev,
                                                [key]: val
                                              }));
                                              setStockClosingHasChanges(true);
                                            }
                                          }}
                                          placeholder="0"
                                          className="w-16 h-7 text-xs text-center p-1 border rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        />
                                      ) : (
                                        <span className={`font-semibold ${closingQty !== '' ? 'text-amber-600' : 'text-gray-300'}`}>
                                          {closingQty !== '' ? closingQty : '-'}
                                        </span>
                                      )}
                                    </td>
                                    {!isToday && (
                                      <td className="px-4 py-2 text-center">
                                        <span className={`font-medium ${itemsSold !== '-' && itemsSold > 0 ? 'text-purple-600' : 'text-gray-300'}`}>
                                          {itemsSold}
                                        </span>
                                      </td>
                                    )}
                                  </tr>
                                );
                              });
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : closingInventoryRetailer ? (
                <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
                  <ClipboardList size={40} className="mx-auto mb-3 opacity-50" />
                  <p>Click "Load" to view stock closing data</p>
                  <p className="text-sm mt-2">Or no products found in retailer catalogue</p>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 border rounded-lg bg-gray-50">
                  <ClipboardList size={40} className="mx-auto mb-3 opacity-50" />
                  <p>Select a retailer to view stock closing</p>
                </div>
              )}

              {/* Summary footer when data is present */}
              {closingInventoryRetailer && Object.keys(stockClosingData).length > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Total Products:</span>
                      <span className="ml-2 font-semibold">{stockClosingCatalogue.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Entries Filled:</span>
                      <span className="ml-2 font-semibold text-amber-600">
                        {Object.values(stockClosingData).filter(v => v !== '' && v !== null).length}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Closing Stock:</span>
                      <span className="ml-2 font-semibold text-green-600">
                        {Object.values(stockClosingData)
                          .filter(v => v !== '' && v !== null)
                          .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                          .toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {/* ==================== DISPATCH-LINKED ITEM INFO MODAL ==================== */}
        {dispatchLinkedItemInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b bg-amber-50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-amber-600" size={20} />
                  <h3 className="text-lg font-semibold text-amber-800">Cannot Delete - Linked to Dispatch</h3>
                </div>
                <button onClick={() => setDispatchLinkedItemInfo(null)} className="p-1 hover:bg-amber-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium text-gray-800">{dispatchLinkedItemInfo.product_name}</p>
                  <p className="text-sm text-gray-500">{dispatchLinkedItemInfo.variant_name}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    {dispatchLinkedItemInfo.opening_qty > 0 && (
                      <span className="text-blue-600">Opening: {dispatchLinkedItemInfo.opening_qty}</span>
                    )}
                    {dispatchLinkedItemInfo.received_qty > 0 && (
                      <span className="text-green-600">Received: +{dispatchLinkedItemInfo.received_qty}</span>
                    )}
                  </div>
                </div>
                
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                  <p className="font-medium text-red-800 mb-2">This item cannot be deleted because:</p>
                  <p className="text-red-700">
                    It is linked to dispatch on{' '}
                    <strong>
                      {dispatchLinkedItemInfo.dispatch_dates?.length > 0 
                        ? dispatchLinkedItemInfo.dispatch_dates.slice(0, 3).join(', ')
                        : dispatchLinkedItemInfo.linked_dispatches?.length > 0
                          ? [...new Set(dispatchLinkedItemInfo.linked_dispatches.map(d => d.dispatch_date))].slice(0, 3).join(', ')
                          : 'a previous date'
                      }
                    </strong>
                  </p>
                </div>
                
                <div className="bg-blue-50 p-3 rounded-lg text-sm">
                  <p className="font-medium text-blue-800 mb-1">To remove this item:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700">
                    <li>Go to <strong>Dispatches</strong> tab</li>
                    <li>Find the dispatch for the date mentioned above</li>
                    <li>Remove or edit this product from that dispatch</li>
                    <li>Come back here and click <strong>Load</strong> to refresh</li>
                  </ol>
                </div>
                
                <div className="flex justify-end gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setDispatchLinkedItemInfo(null);
                      setActiveTab('dispatches');
                    }}
                  >
                    Go to Dispatches
                  </Button>
                  <Button onClick={() => setDispatchLinkedItemInfo(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== FINAL SUMMARY MODAL ==================== */}
        {showFinalSummaryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-emerald-50">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-600" size={20} />
                  <h3 className="text-lg font-semibold text-emerald-800">Final Summary - Invoice Reconciliation</h3>
                </div>
                <button onClick={() => setShowFinalSummaryModal(false)} className="p-1 hover:bg-emerald-100 rounded">
                  <X size={20} />
                </button>
              </div>
              
              {/* Date Filters */}
              <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Retailer</label>
                  <Select 
                    value={invoiceForm.retailer_id || 'all'} 
                    onValueChange={(val) => setInvoiceForm({...invoiceForm, retailer_id: val === 'all' ? '' : val})}
                  >
                    <SelectTrigger className="h-8 text-xs w-48">
                      <SelectValue placeholder="All Retailers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Retailers</SelectItem>
                      {retailers.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.company_name || r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">From Date</label>
                  <Input
                    type="date"
                    value={finalSummaryStartDate}
                    onChange={(e) => setFinalSummaryStartDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">To Date</label>
                  <Input
                    type="date"
                    value={finalSummaryEndDate}
                    onChange={(e) => setFinalSummaryEndDate(e.target.value)}
                    className="h-8 text-xs w-36"
                  />
                </div>
                <Button 
                  size="sm"
                  onClick={() => loadFinalSummary(invoiceForm.retailer_id, finalSummaryStartDate, finalSummaryEndDate)}
                  disabled={finalSummaryLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 h-8 mt-4"
                >
                  {finalSummaryLoading ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Search size={14} className="mr-1" />}
                  Load
                </Button>
              </div>
              
              {/* Summary Table */}
              <div className="flex-1 overflow-auto p-4">
                {finalSummaryData ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left border-b">#</th>
                          <th className="px-2 py-2 text-left border-b">DATE</th>
                          <th className="px-2 py-2 text-left border-b">INVOICE #</th>
                          <th className="px-2 py-2 text-left border-b">RETAILER</th>
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
                              <td className="px-2 py-1.5 truncate max-w-[120px]" title={row.retailer_name}>{row.retailer_name}</td>
                              <td className="px-2 py-1.5 text-right">₹{row.gross_value.toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-right text-red-600">
                                {row.rejections > 0 ? `-₹${row.rejections.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right">₹{row.total_mrp.toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-right text-purple-600">
                                {row.commission > 0 ? `-₹${row.commission.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium">₹{row.payable.toLocaleString('en-IN')}</td>
                              <td className="px-2 py-1.5 text-right text-blue-600">
                                {row.credit_notes > 0 ? `-₹${row.credit_notes.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className="px-2 py-1.5 text-right text-green-600">
                                {row.paid > 0 ? `₹${row.paid.toLocaleString('en-IN')}` : '-'}
                              </td>
                              <td className={`px-2 py-1.5 text-right font-semibold ${
                                row.final_payable > 0 ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                ₹{row.final_payable.toLocaleString('en-IN')}
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
                                <td colSpan="13" className="p-0 bg-gray-50">
                                  <div className="px-4 py-2 border-l-4 border-emerald-400">
                                    <div className="text-xs font-medium text-gray-600 mb-2">Item Details - Supply vs Rejection</div>
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
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                      {finalSummaryData.totals && (
                        <tfoot className="bg-gray-100 font-semibold">
                          <tr className="border-t-2">
                            <td colSpan="4" className="px-2 py-2 text-right">TOTALS</td>
                            <td className="px-2 py-2 text-right">₹{finalSummaryData.totals.gross_value.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 text-right text-red-600">
                              {finalSummaryData.totals.rejections > 0 ? `-₹${finalSummaryData.totals.rejections.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right">₹{finalSummaryData.totals.total_mrp.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 text-right text-purple-600">
                              -₹{finalSummaryData.totals.commission.toLocaleString('en-IN')}
                            </td>
                            <td className="px-2 py-2 text-right">₹{finalSummaryData.totals.payable.toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 text-right text-blue-600">
                              {finalSummaryData.totals.credit_notes > 0 ? `-₹${finalSummaryData.totals.credit_notes.toLocaleString('en-IN')}` : '-'}
                            </td>
                            <td className="px-2 py-2 text-right text-green-600">
                              ₹{finalSummaryData.totals.paid.toLocaleString('en-IN')}
                            </td>
                            <td className={`px-2 py-2 text-right ${
                              finalSummaryData.totals.final_payable > 0 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              ₹{finalSummaryData.totals.final_payable.toLocaleString('en-IN')}
                            </td>
                            <td className="px-2 py-2 text-center text-gray-500">
                              {finalSummaryData.row_count} invoices
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <FileSpreadsheet size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>Select date range and click "Load" to view the reconciliation summary</p>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t flex justify-end">
                <Button variant="outline" onClick={() => setShowFinalSummaryModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT SUMMARY MODAL ==================== */}
        {showPaymentSummaryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-purple-50">
                <div className="flex items-center gap-2">
                  <FileText className="text-purple-600" size={20} />
                  <h3 className="text-lg font-semibold text-purple-800">Payment Summary</h3>
                </div>
                <button onClick={() => setShowPaymentSummaryModal(false)} className="p-1 hover:bg-purple-100 rounded">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                {unpaidInvoices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={40} className="mx-auto mb-3 opacity-50" />
                    <p>No unpaid invoices found for this retailer</p>
                  </div>
                ) : (
                  <>
                    {(() => {
                      // Check if the selected retailer is 100% upfront
                      const selectedRetailerData = retailers.find(r => r.id === selectedRetailer);
                      const isUpfront100Retailer = selectedRetailerData?.upfront_collection_percentage === 100;
                      
                      return (
                        <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-600">
                        Select invoices to generate payment summary. <span className="font-medium text-purple-600">{unpaidInvoices.length} unpaid invoice(s)</span>
                        {isUpfront100Retailer && <span className="ml-2 text-xs text-purple-500">(100% Upfront - Rejections via CN)</span>}
                      </p>
                      <Button variant="outline" size="sm" onClick={selectAllInvoicesForSummary}>
                        Select All
                      </Button>
                    </div>
                    
                    {/* Invoice Selection Table */}
                    <div className="border rounded-lg overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-2 w-10 text-center">
                              <CheckCircle size={14} />
                            </th>
                            <th className="p-2 text-center text-gray-600">S.No</th>
                            <th className="p-2 text-left text-gray-600">Indent Date</th>
                            <th className="p-2 text-left text-gray-600">Dispatch Date</th>
                            <th className="p-2 text-left text-gray-600">Invoice #</th>
                            <th className="p-2 text-right text-gray-600">Gross Value</th>
                            {!isUpfront100Retailer && <th className="p-2 text-right text-red-600">Rejections</th>}
                            {!isUpfront100Retailer && <th className="p-2 text-right text-blue-600">Total MRP</th>}
                            <th className="p-2 text-right text-orange-600">Commission</th>
                            <th className="p-2 text-right text-green-600">Payable</th>
                            <th className="p-2 text-right text-pink-600">CN Adjusted</th>
                            <th className="p-2 text-right text-purple-600">Paid</th>
                            <th className="p-2 text-right text-blue-800 font-semibold">Net Receivable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unpaidInvoices.map((inv, idx) => {
                            const isSelected = selectedInvoicesForSummary[inv.id];
                            const grossValue = inv.gross_value || inv.total_mrp_value || 0;
                            const rejections = inv.rejection_amount || 0;
                            const totalMrp = inv.total_mrp_value || 0;
                            const commissionPct = inv.commission_percentage || 0;
                            const creditNotes = inv.total_credit_adjusted || 0;
                            const paidAmount = inv.paid_amount || 0;
                            
                            // Check if this retailer is 100% upfront
                            const retailer = retailers.find(r => r.id === inv.retailer_id);
                            const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                            
                            // For 100% upfront: payable = gross - commission (no rejection deduction)
                            const payable = isUpfront100 
                              ? (grossValue - (grossValue * commissionPct / 100))
                              : (inv.net_payable || 0);
                            const commission = isUpfront100 
                              ? (grossValue * commissionPct / 100)
                              : (inv.commission_amount || 0);
                            
                            // Net Receivable = Payable - Credit Notes - Paid
                            const netReceivable = payable - creditNotes - paidAmount;
                            
                            // Format date as DD-MM-YYYY
                            const formatDate = (dateStr) => {
                              if (!dateStr) return '-';
                              const date = new Date(dateStr);
                              if (isNaN(date.getTime())) return '-';
                              const day = String(date.getDate()).padStart(2, '0');
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const year = date.getFullYear();
                              return `${day}-${month}-${year}`;
                            };
                            
                            return (
                              <tr 
                                key={inv.id} 
                                className={`border-t cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-purple-50' : ''}`}
                                onClick={() => toggleInvoiceForSummary(inv.id)}
                              >
                                <td className="p-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected || false}
                                    onChange={() => toggleInvoiceForSummary(inv.id)}
                                    className="w-4 h-4"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </td>
                                <td className="p-2 text-center text-gray-600">{idx + 1}</td>
                                <td className="p-2 text-left text-gray-700">
                                  {formatDate(inv.indent_date || inv.invoice_date)}
                                </td>
                                <td className="p-2 text-left text-gray-700">
                                  {formatDate(inv.dispatch_date || inv.invoice_date)}
                                </td>
                                <td className="p-2 text-left font-medium text-gray-800">{inv.invoice_number}</td>
                                <td className="p-2 text-right text-gray-700">₹{grossValue.toFixed(2)}</td>
                                {!isUpfront100Retailer && <td className="p-2 text-right text-red-600">-₹{rejections.toFixed(2)}</td>}
                                {!isUpfront100Retailer && <td className="p-2 text-right text-blue-600">₹{totalMrp.toFixed(2)}</td>}
                                <td className="p-2 text-right text-orange-600">-₹{commission.toFixed(2)}</td>
                                <td className="p-2 text-right font-medium text-green-600">₹{payable.toFixed(2)}</td>
                                <td className="p-2 text-right text-pink-600">{creditNotes > 0 ? `-₹${creditNotes.toFixed(2)}` : '-'}</td>
                                <td className="p-2 text-right text-purple-600">₹{paidAmount.toFixed(2)}</td>
                                <td className="p-2 text-right font-semibold text-blue-800">₹{netReceivable.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {Object.values(selectedInvoicesForSummary).some(v => v) && (
                          <tfoot className="bg-purple-100 font-semibold">
                            <tr>
                              <td colSpan={5} className="p-2 text-right text-purple-800">
                                Selected Total ({Object.values(selectedInvoicesForSummary).filter(v => v).length} invoices):
                              </td>
                              <td className="p-2 text-right text-gray-800">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.gross_value || inv.total_mrp_value || 0), 0).toFixed(2)}
                              </td>
                              {!isUpfront100Retailer && (
                                <td className="p-2 text-right text-red-700">
                                  -₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.rejection_amount || 0), 0).toFixed(2)}
                                </td>
                              )}
                              {!isUpfront100Retailer && (
                                <td className="p-2 text-right text-blue-700">
                                  ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.total_mrp_value || 0), 0).toFixed(2)}
                                </td>
                              )}
                              <td className="p-2 text-right text-orange-700">
                                -₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => {
                                  const grossValue = inv.gross_value || inv.total_mrp_value || 0;
                                  const commissionPct = inv.commission_percentage || 0;
                                  const commission = isUpfront100Retailer ? (grossValue * commissionPct / 100) : (inv.commission_amount || 0);
                                  return sum + commission;
                                }, 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-green-700">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => {
                                  const grossValue = inv.gross_value || inv.total_mrp_value || 0;
                                  const commissionPct = inv.commission_percentage || 0;
                                  const payable = isUpfront100Retailer ? (grossValue - (grossValue * commissionPct / 100)) : (inv.net_payable || 0);
                                  return sum + payable;
                                }, 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-pink-700">
                                {(() => {
                                  const totalCN = unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.total_credit_adjusted || 0), 0);
                                  return totalCN > 0 ? `-₹${totalCN.toFixed(2)}` : '-';
                                })()}
                              </td>
                              <td className="p-2 text-right text-purple-700">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => sum + (inv.paid_amount || 0), 0).toFixed(2)}
                              </td>
                              <td className="p-2 text-right text-blue-800 font-bold">
                                ₹{unpaidInvoices.filter(inv => selectedInvoicesForSummary[inv.id]).reduce((sum, inv) => {
                                  const grossValue = inv.gross_value || inv.total_mrp_value || 0;
                                  const commissionPct = inv.commission_percentage || 0;
                                  const payable = isUpfront100Retailer ? (grossValue - (grossValue * commissionPct / 100)) : (inv.net_payable || 0);
                                  const creditNotes = inv.total_credit_adjusted || 0;
                                  const paidAmount = inv.paid_amount || 0;
                                  return sum + (payable - creditNotes - paidAmount);
                                }, 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
              
              <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPaymentSummaryModal(false)}>
                  Close
                </Button>
                <Button 
                  onClick={() => {
                    if (!Object.values(selectedInvoicesForSummary).some(v => v)) {
                      toast.error('Please select at least one invoice');
                      return;
                    }
                    setShowPaymentSummaryPreview(true);
                  }}
                  disabled={!Object.values(selectedInvoicesForSummary).some(v => v)}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <FileText size={14} className="mr-1" /> View Summary
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT SUMMARY PREVIEW MODAL ==================== */}
        {showPaymentSummaryPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-2 md:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-green-50">
                <div className="flex items-center gap-2">
                  <FileText className="text-green-600" size={16} />
                  <h3 className="text-sm font-semibold text-green-800">Payment Summary</h3>
                  <span className="text-xs text-gray-500">
                    ({Object.values(selectedInvoicesForSummary).filter(v => v).length} invoices)
                  </span>
                </div>
                <button onClick={() => setShowPaymentSummaryPreview(false)} className="p-1 hover:bg-green-100 rounded">
                  <X size={16} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto overflow-x-auto">
                {/* Full Summary Table with all fields */}
                <table className="w-full text-xs min-w-[800px]">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-1.5 py-1 text-center text-gray-600 font-semibold w-8">#</th>
                      <th className="px-1.5 py-1 text-left text-gray-600 font-semibold">Date</th>
                      <th className="px-1.5 py-1 text-left text-gray-600 font-semibold">Invoice #</th>
                      <th className="px-1.5 py-1 text-right text-gray-600 font-semibold">Gross</th>
                      <th className="px-1.5 py-1 text-right text-red-600 font-semibold">Reject</th>
                      <th className="px-1.5 py-1 text-right text-blue-600 font-semibold">MRP</th>
                      <th className="px-1.5 py-1 text-right text-orange-600 font-semibold">Comm.</th>
                      <th className="px-1.5 py-1 text-right text-green-600 font-semibold">Payable</th>
                      <th className="px-1.5 py-1 text-right text-pink-600 font-semibold">CN</th>
                      <th className="px-1.5 py-1 text-right text-purple-600 font-semibold">Paid</th>
                      <th className="px-1.5 py-1 text-right text-blue-800 font-bold">Net Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSelectedInvoicesData().map((inv, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50">
                        <td className="px-1.5 py-1 text-center text-gray-500">{inv.serialNum}</td>
                        <td className="px-1.5 py-1 text-left text-gray-700 text-[10px] whitespace-nowrap">{inv.dispatchDate}</td>
                        <td className="px-1.5 py-1 text-left font-medium text-gray-800 text-[10px] whitespace-nowrap">{inv.invoiceNumber}</td>
                        <td className="px-1.5 py-1 text-right text-gray-700">₹{inv.grossValue.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-red-600">-₹{inv.rejections.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-blue-600">₹{inv.totalMrpValue.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-orange-600">-₹{inv.commission.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-green-600">₹{inv.amountPayable.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right text-pink-600">{inv.creditNotes > 0 ? `-₹${inv.creditNotes.toFixed(0)}` : '₹0'}</td>
                        <td className="px-1.5 py-1 text-right text-purple-600">₹{inv.paidAmount.toFixed(0)}</td>
                        <td className="px-1.5 py-1 text-right font-semibold text-blue-800">₹{inv.netReceivable.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-green-100 font-bold sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="px-1.5 py-1.5 text-right text-green-800 text-xs">TOTAL:</td>
                      <td className="px-1.5 py-1.5 text-right text-gray-800">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.grossValue, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-red-700">
                        -₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.rejections, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-blue-700">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.totalMrpValue, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-orange-700">
                        -₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.commission, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-green-700">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.amountPayable, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-pink-700">
                        -₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.creditNotes, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-purple-700">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.paidAmount, 0).toFixed(0)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-blue-800 text-sm font-bold">
                        ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.netReceivable, 0).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {/* Footer with Net Receivable highlight */}
              <div className="px-3 py-2 border-t bg-gray-50">
                <div className="flex flex-col md:flex-row items-center justify-between gap-2">
                  <div className="text-center md:text-left">
                    <span className="text-xs text-gray-600">Net Receivable: </span>
                    <span className="text-lg font-bold text-blue-700">
                      ₹{getSelectedInvoicesData().reduce((sum, d) => sum + d.netReceivable, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowPaymentSummaryPreview(false)}>
                      Back
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => {
                        exportPaymentSummary();
                        setShowPaymentSummaryPreview(false);
                        setShowPaymentSummaryModal(false);
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

        {/* ==================== PAYMENT AUDIT MODAL ==================== */}
        {showPaymentAuditModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-red-50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="text-red-600" size={20} />
                  <h3 className="text-lg font-semibold text-red-800">Payment Audit</h3>
                  {paymentAuditData?.retailer && (
                    <span className="text-sm text-red-600">- {paymentAuditData.retailer.name}</span>
                  )}
                </div>
                <button onClick={() => { setShowPaymentAuditModal(false); setPaymentAuditData(null); }} className="p-1 hover:bg-red-100 rounded">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                {paymentAuditLoading ? (
                  <div className="text-center py-12 text-gray-500">
                    <RefreshCw size={32} className="mx-auto mb-3 animate-spin" />
                    <p>Loading payment data...</p>
                  </div>
                ) : !paymentAuditData ? (
                  <div className="text-center py-12 text-gray-500">
                    <AlertTriangle size={40} className="mx-auto mb-3 opacity-50" />
                    <p>No payment data found</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-xs text-gray-500">Total Payments</p>
                          <p className="text-xl font-bold text-gray-800">{paymentAuditData.total_payments_count}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Total Amount</p>
                          <p className="text-xl font-bold text-green-700">₹{paymentAuditData.total_amount?.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Linked to Invoice</p>
                          <p className="text-xl font-bold text-blue-700">
                            {paymentAuditData.payments?.filter(p => p.linked_invoice).length || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Orphan Payments</p>
                          <p className="text-xl font-bold text-red-700">
                            {paymentAuditData.payments?.filter(p => !p.linked_invoice).length || 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Warning for orphan payments */}
                    {paymentAuditData.payments?.some(p => !p.linked_invoice) && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                        <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
                        <div className="text-sm text-red-700">
                          <span className="font-medium">Orphan payments detected!</span> These payments are not linked to any invoice 
                          and may cause discrepancies in the retailer's dashboard summary. Review and delete if necessary.
                        </div>
                      </div>
                    )}

                    {/* Payments Table */}
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="p-2 text-center text-gray-600">#</th>
                            <th className="p-2 text-left text-gray-600">Payment Date</th>
                            <th className="p-2 text-right text-gray-600">Amount</th>
                            <th className="p-2 text-left text-gray-600">Mode</th>
                            <th className="p-2 text-left text-gray-600">Linked Invoice</th>
                            <th className="p-2 text-center text-gray-600">Status</th>
                            <th className="p-2 text-center text-gray-600">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentAuditData.payments?.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-gray-400">No payments found</td>
                            </tr>
                          ) : paymentAuditData.payments?.map((payment, idx) => {
                            const isOrphan = !payment.linked_invoice;
                            return (
                              <tr key={payment.id} className={`border-t ${isOrphan ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                                <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                                <td className="p-2 text-left">
                                  {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('en-IN', {
                                    day: '2-digit', month: 'short', year: 'numeric'
                                  }) : '-'}
                                  {payment.created_at && (
                                    <div className="text-[10px] text-gray-400">
                                      Created: {new Date(payment.created_at).toLocaleString('en-IN')}
                                    </div>
                                  )}
                                </td>
                                <td className={`p-2 text-right font-medium ${isOrphan ? 'text-red-700' : 'text-green-700'}`}>
                                  ₹{payment.amount?.toLocaleString()}
                                </td>
                                <td className="p-2 text-left text-gray-600">{payment.payment_mode || '-'}</td>
                                <td className="p-2 text-left">
                                  {payment.linked_invoice ? (
                                    <div>
                                      <span className="font-medium text-blue-700">{payment.invoice_number}</span>
                                      <div className="text-[10px] text-gray-400">
                                        Net: ₹{payment.linked_invoice.net_payable?.toLocaleString()}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-red-600 font-medium">NOT LINKED</span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  {isOrphan ? (
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                      ORPHAN
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      OK
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deletePaymentFromAudit(payment.id)}
                                    disabled={deletingPaymentId === payment.id}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-100"
                                    title="Delete this payment"
                                  >
                                    {deletingPaymentId === payment.id ? (
                                      <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowPaymentAuditModal(false); setPaymentAuditData(null); }}>
                  Close
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => loadPaymentAudit(paymentAuditRetailerId)}
                  disabled={paymentAuditLoading}
                  className="text-blue-700"
                >
                  <RefreshCw size={14} className={`mr-1 ${paymentAuditLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT LEDGER MODAL ==================== */}
        {showPaymentLedgerModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentLedgerModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Payment Ledger</h3>
                      <p className="text-xs text-blue-100">
                        {retailers.find(r => r.id === selectedRetailer)?.company_name || 'Selected Retailer'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowPaymentLedgerModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              {/* Date Range Filter */}
              <div className="p-4 border-b bg-gray-50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">Date Range:</span>
                  </div>
                  <Input
                    type="date"
                    value={ledgerStartDate}
                    onChange={(e) => setLedgerStartDate(e.target.value)}
                    className="w-40 h-9 text-sm"
                  />
                  <span className="text-gray-400">to</span>
                  <Input
                    type="date"
                    value={ledgerEndDate}
                    onChange={(e) => setLedgerEndDate(e.target.value)}
                    className="w-40 h-9 text-sm"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => loadPaymentLedger(selectedRetailer, ledgerStartDate, ledgerEndDate)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={paymentLedgerLoading}
                  >
                    {paymentLedgerLoading ? <RefreshCw size={14} className="animate-spin mr-1" /> : null}
                    Apply
                  </Button>
                </div>
              </div>
              
              {/* Modal Body */}
              <div className="overflow-y-auto max-h-[60vh] p-4">
                {paymentLedgerLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                ) : !paymentLedgerData ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>Select a date range and click Apply</p>
                  </div>
                ) : paymentLedgerData.dates?.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No payments found in the selected date range</p>
                  </div>
                ) : (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-blue-600 font-medium">Total Received</p>
                        <p className="text-2xl font-bold text-blue-700">{formatCurrency(paymentLedgerData.grand_total || 0)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-purple-600 font-medium">Credit Notes Applied</p>
                        <p className="text-2xl font-bold text-purple-700">{formatCurrency(paymentLedgerData.total_credit_notes_applied || 0)}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-green-600 font-medium">Total Transactions</p>
                        <p className="text-2xl font-bold text-green-700">{paymentLedgerData.total_transactions || 0}</p>
                      </div>
                    </div>
                    
                    {/* Payment Dates List */}
                    <div className="space-y-3">
                      {paymentLedgerData.dates?.map((dateData, idx) => (
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
              </div>
              
              {/* Modal Footer */}
              <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowPaymentLedgerModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== REJECTION ANALYTICS MODAL ==================== */}
        {showRejectionAnalyticsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRejectionAnalyticsModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Rejection Analytics</h3>
                      <p className="text-xs text-red-100">
                        {formatDate(rejectionLossDateFrom)} - {formatDate(rejectionLossDateTo)}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowRejectionAnalyticsModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              {/* Modal Body */}
              <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                {rejectionAnalytics.count === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">No rejections found in this period</p>
                  </div>
                ) : (
                  <>
                    {/* Summary Cards - Row 1: Supplied Totals */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <p className="text-xs text-blue-500 uppercase font-medium">Total Supplied Qty</p>
                        <p className="text-xl font-bold text-blue-700">{(rejectionAnalytics.totalSuppliedQty || 0).toLocaleString()}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <p className="text-xs text-green-500 uppercase font-medium">Total Supplied Value</p>
                        <p className="text-xl font-bold text-green-700">{formatCurrency(rejectionAnalytics.totalSuppliedValue || 0)}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                        <p className="text-xs text-red-500 uppercase font-medium">Rejection Loss</p>
                        <p className="text-xl font-bold text-red-700">{formatCurrency(rejectionAnalytics.totalValue)}</p>
                        <p className="text-[10px] text-red-400">{rejectionAnalytics.overallRejValuePct?.toFixed(1) || 0}% of supplied value</p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                        <p className="text-xs text-orange-500 uppercase font-medium">Rejected Qty</p>
                        <p className="text-xl font-bold text-orange-700">{rejectionAnalytics.totalQty.toLocaleString()}</p>
                        <p className="text-[10px] text-orange-400">{rejectionAnalytics.overallRejPct?.toFixed(1) || 0}% of supplied qty</p>
                      </div>
                    </div>
                    
                    {/* Summary Cards - Row 2: Rejection Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                        <p className="text-xs text-amber-500 uppercase font-medium">Rejections Count</p>
                        <p className="text-xl font-bold text-amber-700">{rejectionAnalytics.count}</p>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                        <p className="text-xs text-yellow-600 uppercase font-medium">Avg Loss/Day</p>
                        <p className="text-xl font-bold text-yellow-700">{formatCurrency(rejectionAnalytics.avgPerDay)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                        <p className="text-xs text-purple-500 uppercase font-medium">5% Threshold</p>
                        <p className="text-sm font-bold text-purple-700">
                          Qty: {Math.ceil((rejectionAnalytics.totalSuppliedQty || 0) * 0.05)} | Val: {formatCurrency((rejectionAnalytics.totalSuppliedValue || 0) * 0.05)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Max Single Rejection + Product Analysis Selector */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {/* Left: Highest Single Rejection */}
                      {rejectionAnalytics.maxSingleRejection && (
                        <div className="bg-gradient-to-r from-red-100 to-orange-100 rounded-lg p-3 border border-red-200">
                          <p className="text-xs text-red-600 font-semibold uppercase mb-2">⚠️ Highest Single Rejection</p>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-red-800">{rejectionAnalytics.maxSingleRejection.product_name}</p>
                              <p className="text-xs text-red-600">
                                {rejectionAnalytics.maxSingleRejection.shop_name} • {formatDate(rejectionAnalytics.maxSingleRejection.rejection_date)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-red-700">{formatCurrency(rejectionAnalytics.maxSingleRejection.rejection_value)}</p>
                              <p className="text-xs text-red-500">{rejectionAnalytics.maxSingleRejection.quantity} items</p>
                            </div>
                          </div>
                          {rejectionAnalytics.maxSingleRejection.reason && (
                            <p className="text-xs text-red-600 mt-1 italic">Reason: {rejectionAnalytics.maxSingleRejection.reason}</p>
                          )}
                        </div>
                      )}
                      
                      {/* Right: Product Analysis Selector */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
                        <p className="text-xs text-blue-600 font-semibold uppercase mb-2">🔍 Product Deep Dive</p>
                        <p className="text-xs text-gray-600 mb-2">Select a product to see detailed rejection analysis</p>
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedProductForAnalysis}
                            onChange={(e) => setSelectedProductForAnalysis(e.target.value)}
                            className="flex-1 h-9 text-sm border border-blue-200 rounded-lg px-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                          >
                            <option value="">-- Select Product --</option>
                            {(rejectionAnalytics.byProductAlphabetical || []).map((p, idx) => (
                              <option key={idx} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            disabled={!selectedProductForAnalysis}
                            onClick={(e) => {
                              e.stopPropagation();
                              const product = rejectionAnalytics.byProductCount.find(p => p.name === selectedProductForAnalysis);
                              if (product) {
                                // Build product drilldown data
                                const productRejections = rejectionAnalytics.filteredRejections.filter(r => r.product_name === selectedProductForAnalysis);
                                const suppliedQty = rejectionAnalytics.productDispatchMap?.[selectedProductForAnalysis]?.qty || 0;
                                const suppliedValue = rejectionAnalytics.productDispatchMap?.[selectedProductForAnalysis]?.value || 0;
                                
                                // By retailer
                                const byRetailer = {};
                                productRejections.forEach(r => {
                                  const shopName = rejectionAnalytics.retailerCompanyMap?.[r.retailer_id] || r.retailer_name || 'Unknown';
                                  if (!byRetailer[shopName]) {
                                    byRetailer[shopName] = { name: shopName, qty: 0, value: 0, count: 0, suppliedQty: 0 };
                                  }
                                  byRetailer[shopName].qty += (r.quantity || 0);
                                  byRetailer[shopName].value += (r.rejection_value || 0);
                                  byRetailer[shopName].count += 1;
                                });
                                
                                // Get supplied qty per retailer from dispatches
                                (allDispatchesForRejection || []).forEach(d => {
                                  const shopName = rejectionAnalytics.retailerCompanyMap?.[d.retailer_id] || d.retailer_name || 'Unknown';
                                  (d.items || []).forEach(item => {
                                    if (item.product_name === selectedProductForAnalysis) {
                                      if (!byRetailer[shopName]) {
                                        byRetailer[shopName] = { name: shopName, qty: 0, value: 0, count: 0, suppliedQty: 0 };
                                      }
                                      byRetailer[shopName].suppliedQty += (item.supplied_qty || item.dispatched_qty || item.quantity || 0);
                                    }
                                  });
                                });
                                
                                const byRetailerList = Object.values(byRetailer)
                                  .map(r => ({
                                    ...r,
                                    rejPct: r.suppliedQty > 0 ? (r.qty / r.suppliedQty * 100) : (r.qty > 0 ? 100 : 0)
                                  }))
                                  .filter(r => r.qty > 0 || r.suppliedQty > 0)
                                  .sort((a, b) => b.rejPct - a.rejPct);
                                
                                // By date
                                const byDate = {};
                                productRejections.forEach(r => {
                                  const date = r.rejection_date?.split('T')[0] || 'Unknown';
                                  if (!byDate[date]) {
                                    byDate[date] = { date, qty: 0, value: 0, count: 0, rejections: [] };
                                  }
                                  byDate[date].qty += (r.quantity || 0);
                                  byDate[date].value += (r.rejection_value || 0);
                                  byDate[date].count += 1;
                                  byDate[date].rejections.push(r);
                                });
                                const byDateList = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
                                
                                // By day of week
                                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                const byDay = dayNames.map(d => ({ day: d, qty: 0, value: 0 }));
                                productRejections.forEach(r => {
                                  const date = r.rejection_date?.split('T')[0];
                                  if (date) {
                                    const dayIndex = new Date(date).getDay();
                                    byDay[dayIndex].qty += (r.quantity || 0);
                                    byDay[dayIndex].value += (r.rejection_value || 0);
                                  }
                                });
                                
                                // By reason
                                const byReason = {};
                                productRejections.forEach(r => {
                                  const reason = r.reason || 'No reason';
                                  if (!byReason[reason]) {
                                    byReason[reason] = { reason, qty: 0, value: 0, count: 0 };
                                  }
                                  byReason[reason].qty += (r.quantity || 0);
                                  byReason[reason].value += (r.rejection_value || 0);
                                  byReason[reason].count += 1;
                                });
                                const byReasonList = Object.values(byReason).sort((a, b) => b.value - a.value);
                                
                                setRejectionProductDrilldown({
                                  productName: selectedProductForAnalysis,
                                  suppliedQty,
                                  suppliedValue,
                                  rejectedQty: product.qty,
                                  rejectedValue: product.value,
                                  rejPctByCount: product.rejPctByCount,
                                  rejPctByValue: product.rejPctByValue,
                                  totalRejections: productRejections.length,
                                  byRetailer: byRetailerList,
                                  byDate: byDateList,
                                  byDay,
                                  byReason: byReasonList,
                                  rejections: productRejections
                                });
                              }
                            }}
                            className="h-9 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Eye size={14} className="mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Analytics Sections */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* By Product - Sorted by Rejection % (Count) with High/Low Selling Tabs */}
                      <div className="bg-gray-50 rounded-lg p-3 border">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Package size={14} className="text-red-500" />
                          By Product (Count %)
                        </h4>
                        {/* Tabs */}
                        <div className="flex gap-1 mb-2">
                          <button
                            onClick={() => setProductCountTab('high')}
                            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${productCountTab === 'high' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                          >
                            High Selling ({rejectionAnalytics.highSellingProducts?.length || 0})
                          </button>
                          <button
                            onClick={() => setProductCountTab('low')}
                            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${productCountTab === 'low' ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                          >
                            Low Selling ({rejectionAnalytics.lowSellingProducts?.length || 0})
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 mb-2">
                          {productCountTab === 'high' ? 'Products with ≥5% of total qty sold' : 'Products with <5% of total qty sold'}
                        </p>
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                          {(productCountTab === 'high' ? rejectionAnalytics.highSellingProducts : rejectionAnalytics.lowSellingProducts)?.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-red-500 text-white' : idx === 1 ? 'bg-orange-400 text-white' : idx === 2 ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                  {idx + 1}
                                </span>
                                <div>
                                  <span className="font-medium text-gray-800 truncate max-w-[80px] block" title={item.name}>{item.name}</span>
                                  <span className="text-[9px] text-gray-400">{item.salesPctByQty?.toFixed(1)}% of qty</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-red-600">{item.rejPctByCount.toFixed(1)}%</p>
                                <p className="text-[10px] text-gray-500">{item.qty} / {item.suppliedQty} qty</p>
                              </div>
                            </div>
                          ))}
                          {(productCountTab === 'high' ? rejectionAnalytics.highSellingProducts : rejectionAnalytics.lowSellingProducts)?.length === 0 && (
                            <p className="text-xs text-gray-500 text-center py-2">No products in this category</p>
                          )}
                        </div>
                      </div>
                      
                      {/* By Product - Sorted by Rejection % (Value) with High/Low Selling Tabs */}
                      <div className="bg-gray-50 rounded-lg p-3 border">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <TrendingUp size={14} className="text-red-500" />
                          By Product (Value %)
                        </h4>
                        {/* Tabs */}
                        <div className="flex gap-1 mb-2">
                          <button
                            onClick={() => setProductValueTab('high')}
                            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${productValueTab === 'high' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                          >
                            High Selling ({rejectionAnalytics.highSellingByValue?.length || 0})
                          </button>
                          <button
                            onClick={() => setProductValueTab('low')}
                            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${productValueTab === 'low' ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                          >
                            Low Selling ({rejectionAnalytics.lowSellingByValue?.length || 0})
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 mb-2">
                          {productValueTab === 'high' ? 'Products with ≥5% of total value sold' : 'Products with <5% of total value sold'}
                        </p>
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                          {(productValueTab === 'high' ? rejectionAnalytics.highSellingByValue : rejectionAnalytics.lowSellingByValue)?.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-red-500 text-white' : idx === 1 ? 'bg-orange-400 text-white' : idx === 2 ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                  {idx + 1}
                                </span>
                                <div>
                                  <span className="font-medium text-gray-800 truncate max-w-[80px] block" title={item.name}>{item.name}</span>
                                  <span className="text-[9px] text-gray-400">{item.salesPctByValue?.toFixed(1)}% of value</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-red-600">{item.rejPctByValue.toFixed(1)}%</p>
                                <p className="text-[10px] text-gray-500">{formatCurrency(item.value)} / {formatCurrency(item.suppliedValue)}</p>
                              </div>
                            </div>
                          ))}
                          {(productValueTab === 'high' ? rejectionAnalytics.highSellingByValue : rejectionAnalytics.lowSellingByValue)?.length === 0 && (
                            <p className="text-xs text-gray-500 text-center py-2">No products in this category</p>
                          )}
                        </div>
                      </div>
                      
                      {/* By Shop (Sorted by Rejection %) - Clickable */}
                      <div className="bg-gray-50 rounded-lg p-3 border">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <ShoppingCart size={14} className="text-red-500" />
                          By Shop (Rejection %)
                          <span className="text-[10px] text-gray-400 ml-auto">Click for details</span>
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {rejectionAnalytics.byRetailer.slice(0, 10).map((item, idx) => (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between text-sm bg-white p-2 rounded border cursor-pointer hover:bg-red-50 hover:border-red-300 transition-colors"
                              onClick={() => setRejectionRetailerDrilldown(item)}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-red-500 text-white' : idx === 1 ? 'bg-orange-400 text-white' : idx === 2 ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                  {idx + 1}
                                </span>
                                <span className="font-medium text-gray-800 truncate max-w-[90px]" title={item.name}>{item.name}</span>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <div>
                                  <p className="font-bold text-red-600">{item.rejPctByCount.toFixed(1)}%</p>
                                  <p className="text-[10px] text-gray-500">{item.qty} / {item.suppliedQty} qty</p>
                                </div>
                                <ChevronRight size={14} className="text-gray-400" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* By Reason */}
                      <div className="bg-gray-50 rounded-lg p-3 border">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <FileText size={14} className="text-red-500" />
                          By Reason
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {rejectionAnalytics.byReason.slice(0, 10).map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                              <span className="font-medium text-gray-700 truncate max-w-[150px]">{item.reason}</span>
                              <div className="text-right">
                                <p className="font-semibold text-red-600">{formatCurrency(item.value)}</p>
                                <p className="text-xs text-gray-500">{item.count} times</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* By Day of Week */}
                      <div className="bg-gray-50 rounded-lg p-3 border md:col-span-2">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Clock size={14} className="text-red-500" />
                          By Day of Week
                        </h4>
                        <div className="grid grid-cols-7 gap-2">
                          {rejectionAnalytics.byDay.map((item, idx) => {
                            const maxDayValue = Math.max(...rejectionAnalytics.byDay.map(d => d.value));
                            const pct = maxDayValue > 0 ? (item.value / maxDayValue * 100) : 0;
                            return (
                              <div key={idx} className="text-center">
                                <div className="text-[10px] text-gray-500 mb-1">{item.day.slice(0, 3)}</div>
                                <div className="h-20 bg-gray-200 rounded relative flex items-end justify-center">
                                  <div 
                                    className="w-full bg-gradient-to-t from-red-500 to-red-300 rounded transition-all absolute bottom-0"
                                    style={{ height: `${Math.max(pct, 5)}%` }}
                                  />
                                </div>
                                <div className="text-[9px] font-medium text-red-600 mt-1">{formatCurrency(item.value)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {/* By Date (Latest First) - Expandable */}
                    <div className="mt-4 bg-gray-50 rounded-lg p-3 border">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <Calendar size={14} className="text-red-500" />
                        Date-wise Breakdown (Click to expand)
                      </h4>
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {rejectionAnalytics.byDate.slice(0, 20).map((item, idx) => {
                          const dayName = new Date(item.date).toLocaleDateString('en-IN', { weekday: 'short' });
                          const isExpanded = expandedRejectionDates[item.date];
                          return (
                            <div key={idx} className="bg-white rounded border">
                              {/* Date Row Header */}
                              <div 
                                className="flex items-center justify-between p-2 cursor-pointer hover:bg-red-50 transition-colors"
                                onClick={() => setExpandedRejectionDates(prev => ({
                                  ...prev,
                                  [item.date]: !prev[item.date]
                                }))}
                              >
                                <div className="flex items-center gap-3">
                                  <ChevronRight size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  <span className="font-medium text-gray-800">{formatDate(item.date)}</span>
                                  <span className="text-xs text-gray-500">{dayName}</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="text-gray-500">{item.count} items</span>
                                  <span className="text-gray-500">{item.qty} qty</span>
                                  <span className="font-semibold text-red-600">{formatCurrency(item.value)}</span>
                                </div>
                              </div>
                              
                              {/* Expanded Details */}
                              {isExpanded && item.rejections && (
                                <div className="border-t bg-red-50/50 p-2">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-600">
                                        <th className="p-1 text-left">Product</th>
                                        <th className="p-1 text-left">Shop</th>
                                        <th className="p-1 text-center">Qty</th>
                                        <th className="p-1 text-left">Reason</th>
                                        <th className="p-1 text-right">Value</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.rejections.map((rej, rejIdx) => (
                                        <tr key={rejIdx} className={`${rejIdx % 2 === 0 ? 'bg-white/50' : ''}`}>
                                          <td className="p-1 font-medium truncate max-w-[100px]" title={rej.product_name}>{rej.product_name}</td>
                                          <td className="p-1 text-gray-600 truncate max-w-[80px]" title={rejectionAnalytics.retailerCompanyMap?.[rej.retailer_id] || rej.retailer_name}>
                                            {rejectionAnalytics.retailerCompanyMap?.[rej.retailer_id] || rej.retailer_name}
                                          </td>
                                          <td className="p-1 text-center">{rej.quantity}</td>
                                          <td className="p-1 text-gray-500">{rej.reason || '-'}</td>
                                          <td className="p-1 text-right font-medium text-red-600">{formatCurrency(rej.rejection_value)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {rejectionAnalytics.byDate.length > 20 && (
                          <div className="text-center text-xs text-gray-500 py-2">
                            Showing 20 of {rejectionAnalytics.byDate.length} dates
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== RETAILER REJECTION DRILL-DOWN ==================== */}
        {rejectionRetailerDrilldown && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setRejectionRetailerDrilldown(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setRejectionRetailerDrilldown(null)}
                      className="p-1 hover:bg-white/20 rounded transition-colors"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                    </button>
                    <div>
                      <h3 className="text-lg font-bold">{rejectionRetailerDrilldown.name}</h3>
                      <p className="text-xs text-orange-100">
                        {rejectionRetailerDrilldown.count} rejections • {rejectionRetailerDrilldown.rejPctByCount.toFixed(1)}% rejection rate
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setRejectionRetailerDrilldown(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              {/* Body */}
              <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 80px)' }}>
                {/* Summary */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-red-50 rounded-lg p-3 border border-red-200 text-center">
                    <p className="text-xs text-red-500 uppercase">Rejection %</p>
                    <p className="text-xl font-bold text-red-700">{rejectionRetailerDrilldown.rejPctByCount.toFixed(1)}%</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 text-center">
                    <p className="text-xs text-orange-500 uppercase">Rejected</p>
                    <p className="text-xl font-bold text-orange-700">{rejectionRetailerDrilldown.qty}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                    <p className="text-xs text-blue-500 uppercase">Supplied</p>
                    <p className="text-xl font-bold text-blue-700">{rejectionRetailerDrilldown.suppliedQty}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-center">
                    <p className="text-xs text-amber-500 uppercase">Total Loss</p>
                    <p className="text-xl font-bold text-amber-700">{formatCurrency(rejectionRetailerDrilldown.value)}</p>
                  </div>
                </div>
                
                {/* Products at this retailer - sorted by rejection % */}
                {(() => {
                  const retailerRejections = rejectionRetailerDrilldown.rejections || [];
                  
                  // Aggregate by product for this retailer
                  const productMap = {};
                  retailerRejections.forEach(r => {
                    const key = r.product_name || 'Unknown';
                    if (!productMap[key]) {
                      productMap[key] = { name: key, qty: 0, value: 0, count: 0, dates: new Set(), reasons: {} };
                    }
                    productMap[key].qty += (r.quantity || 0);
                    productMap[key].value += (r.rejection_value || 0);
                    productMap[key].count += 1;
                    if (r.rejection_date) productMap[key].dates.add(r.rejection_date.split('T')[0]);
                    const reason = r.reason || 'No reason';
                    productMap[key].reasons[reason] = (productMap[key].reasons[reason] || 0) + 1;
                  });
                  
                  // Calculate % for each product (vs total dispatched to this retailer for that product)
                  // Since we don't have per-product dispatch data per retailer here, we'll calculate
                  // rejection % relative to total rejection at this retailer
                  const totalRejQty = rejectionRetailerDrilldown.qty || 1;
                  const products = Object.values(productMap).map(p => ({
                    ...p,
                    rejPct: (p.qty / totalRejQty * 100),
                    dates: Array.from(p.dates).sort((a, b) => b.localeCompare(a)),
                    topReason: Object.entries(p.reasons).sort((a, b) => b[1] - a[1])[0]?.[0]
                  })).sort((a, b) => b.rejPct - a.rejPct);
                  
                  // Aggregate by date for this retailer
                  const dateMap = {};
                  retailerRejections.forEach(r => {
                    const key = r.rejection_date?.split('T')[0] || 'Unknown';
                    if (!dateMap[key]) {
                      dateMap[key] = { date: key, qty: 0, value: 0, count: 0 };
                    }
                    dateMap[key].qty += (r.quantity || 0);
                    dateMap[key].value += (r.rejection_value || 0);
                    dateMap[key].count += 1;
                  });
                  const dates = Object.values(dateMap).sort((a, b) => b.date.localeCompare(a.date));
                  
                  return (
                    <>
                      {/* Products Section */}
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Package size={14} className="text-red-500" />
                          Products with Highest Rejection (at this shop)
                        </h4>
                        <div className="space-y-2 max-h-52 overflow-y-auto">
                          {products.map((item, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-lg p-3 border">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-red-500 text-white' : idx === 1 ? 'bg-orange-400 text-white' : idx === 2 ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                    {idx + 1}
                                  </span>
                                  <span className="font-medium text-gray-800">{item.name}</span>
                                </div>
                                <span className="font-bold text-red-600">{item.rejPct.toFixed(1)}% of rejections</span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                                <span>{item.qty} qty rejected</span>
                                <span>{formatCurrency(item.value)}</span>
                                <span>{item.count} times</span>
                                {item.topReason && <span className="text-red-500">Reason: {item.topReason}</span>}
                              </div>
                              {item.dates.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.dates.slice(0, 5).map((d, i) => (
                                    <span key={i} className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                      {formatDate(d)}
                                    </span>
                                  ))}
                                  {item.dates.length > 5 && (
                                    <span className="text-[10px] text-gray-400">+{item.dates.length - 5} more</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Dates Section */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Clock size={14} className="text-red-500" />
                          Rejection by Date (at this shop)
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-orange-100 text-orange-800">
                                <th className="p-2 text-left font-semibold">Date</th>
                                <th className="p-2 text-left font-semibold">Day</th>
                                <th className="p-2 text-right font-semibold">Count</th>
                                <th className="p-2 text-right font-semibold">Qty</th>
                                <th className="p-2 text-right font-semibold">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dates.slice(0, 10).map((item, idx) => {
                                const dayName = new Date(item.date).toLocaleDateString('en-IN', { weekday: 'short' });
                                return (
                                  <tr key={idx} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                    <td className="p-2 font-medium">{formatDate(item.date)}</td>
                                    <td className="p-2 text-gray-600">{dayName}</td>
                                    <td className="p-2 text-right">{item.count}</td>
                                    <td className="p-2 text-right">{item.qty}</td>
                                    <td className="p-2 text-right font-semibold text-red-600">{formatCurrency(item.value)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ==================== PRODUCT REJECTION DRILL-DOWN ==================== */}
        {rejectionProductDrilldown && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setRejectionProductDrilldown(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setRejectionProductDrilldown(null)}
                      className="p-1 hover:bg-white/20 rounded transition-colors"
                    >
                      <ChevronRight size={20} className="rotate-180" />
                    </button>
                    <div>
                      <h3 className="text-lg font-bold">{rejectionProductDrilldown.productName}</h3>
                      <p className="text-xs text-blue-100">
                        Product Rejection Analysis • {rejectionProductDrilldown.totalRejections} rejections in period
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setRejectionProductDrilldown(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              {/* Body */}
              <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                {/* Summary Cards - Row 1 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200 text-center">
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Supplied Qty</p>
                    <p className="text-xl font-bold text-blue-700">{rejectionProductDrilldown.suppliedQty.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200 text-center">
                    <p className="text-[10px] text-green-500 uppercase font-medium">Supplied Value</p>
                    <p className="text-xl font-bold text-green-700">{formatCurrency(rejectionProductDrilldown.suppliedValue)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 border border-red-200 text-center">
                    <p className="text-[10px] text-red-500 uppercase font-medium">Rejected Qty</p>
                    <p className="text-xl font-bold text-red-700">{rejectionProductDrilldown.rejectedQty.toLocaleString()}</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-200 text-center">
                    <p className="text-[10px] text-orange-500 uppercase font-medium">Rejection Loss</p>
                    <p className="text-xl font-bold text-orange-700">{formatCurrency(rejectionProductDrilldown.rejectedValue)}</p>
                  </div>
                </div>
                
                {/* Rejection % Cards */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gradient-to-r from-red-100 to-red-50 rounded-lg p-4 border border-red-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-red-600 uppercase font-semibold">Rejection % (by Count)</p>
                        <p className="text-xs text-gray-500 mt-1">Rejected Qty / Supplied Qty</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-red-600">{rejectionProductDrilldown.rejPctByCount.toFixed(1)}%</p>
                        <p className="text-xs text-red-500">{rejectionProductDrilldown.rejectedQty} / {rejectionProductDrilldown.suppliedQty}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-orange-100 to-orange-50 rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-orange-600 uppercase font-semibold">Rejection % (by Value)</p>
                        <p className="text-xs text-gray-500 mt-1">Rej Value / Supplied Value</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-orange-600">{rejectionProductDrilldown.rejPctByValue.toFixed(1)}%</p>
                        <p className="text-xs text-orange-500">{formatCurrency(rejectionProductDrilldown.rejectedValue)} / {formatCurrency(rejectionProductDrilldown.suppliedValue)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Analytics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* By Retailer */}
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <ShoppingCart size={14} className="text-indigo-500" />
                      Rejection % by Shop (Highest First)
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {rejectionProductDrilldown.byRetailer.slice(0, 10).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-red-500 text-white' : idx === 1 ? 'bg-orange-400 text-white' : idx === 2 ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                              {idx + 1}
                            </span>
                            <span className="font-medium text-gray-800 truncate max-w-[100px]" title={item.name}>{item.name}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-red-600">{item.rejPct.toFixed(1)}%</p>
                            <p className="text-[10px] text-gray-500">{item.qty} / {item.suppliedQty} qty</p>
                          </div>
                        </div>
                      ))}
                      {rejectionProductDrilldown.byRetailer.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-2">No retailer data</p>
                      )}
                    </div>
                  </div>
                  
                  {/* By Reason */}
                  <div className="bg-gray-50 rounded-lg p-3 border">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <FileText size={14} className="text-indigo-500" />
                      Rejection Reasons
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {rejectionProductDrilldown.byReason.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                          <span className="font-medium text-gray-700">{item.reason}</span>
                          <div className="text-right">
                            <p className="font-semibold text-red-600">{formatCurrency(item.value)}</p>
                            <p className="text-xs text-gray-500">{item.qty} qty • {item.count} times</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Day of Week Chart */}
                <div className="bg-gray-50 rounded-lg p-3 border mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Clock size={14} className="text-indigo-500" />
                    Rejection by Day of Week
                  </h4>
                  <div className="grid grid-cols-7 gap-2">
                    {rejectionProductDrilldown.byDay.map((item, idx) => {
                      const maxValue = Math.max(...rejectionProductDrilldown.byDay.map(d => d.value));
                      const pct = maxValue > 0 ? (item.value / maxValue * 100) : 0;
                      return (
                        <div key={idx} className="text-center">
                          <div className="text-[10px] text-gray-500 mb-1">{item.day.slice(0, 3)}</div>
                          <div className="h-16 bg-gray-200 rounded relative flex items-end justify-center">
                            <div 
                              className="w-full bg-gradient-to-t from-indigo-500 to-indigo-300 rounded transition-all absolute bottom-0"
                              style={{ height: `${Math.max(pct, 5)}%` }}
                            />
                          </div>
                          <div className="text-[9px] font-medium text-indigo-600 mt-1">{item.qty} qty</div>
                          <div className="text-[8px] text-gray-500">{formatCurrency(item.value)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Date-wise Breakdown */}
                <div className="bg-gray-50 rounded-lg p-3 border">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <Calendar size={14} className="text-indigo-500" />
                    Rejection by Date (Latest First)
                  </h4>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {rejectionProductDrilldown.byDate.map((item, idx) => {
                      const dayName = new Date(item.date).toLocaleDateString('en-IN', { weekday: 'short' });
                      const isExpanded = expandedRejectionDates[`product_${item.date}`];
                      return (
                        <div key={idx} className="bg-white rounded border">
                          <div 
                            className="flex items-center justify-between p-2 cursor-pointer hover:bg-indigo-50 transition-colors"
                            onClick={() => setExpandedRejectionDates(prev => ({
                              ...prev,
                              [`product_${item.date}`]: !prev[`product_${item.date}`]
                            }))}
                          >
                            <div className="flex items-center gap-3">
                              <ChevronRight size={14} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              <span className="font-medium text-gray-800">{formatDate(item.date)}</span>
                              <span className="text-xs text-gray-500">{dayName}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-500">{item.count} items</span>
                              <span className="text-gray-500">{item.qty} qty</span>
                              <span className="font-semibold text-red-600">{formatCurrency(item.value)}</span>
                            </div>
                          </div>
                          
                          {/* Expanded Details */}
                          {isExpanded && item.rejections && (
                            <div className="border-t bg-indigo-50/50 p-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-600">
                                    <th className="p-1 text-left">Shop</th>
                                    <th className="p-1 text-center">Qty</th>
                                    <th className="p-1 text-left">Reason</th>
                                    <th className="p-1 text-right">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {item.rejections.map((rej, rejIdx) => (
                                    <tr key={rejIdx} className={`${rejIdx % 2 === 0 ? 'bg-white/50' : ''}`}>
                                      <td className="p-1 font-medium truncate max-w-[120px]" title={rejectionAnalytics.retailerCompanyMap?.[rej.retailer_id] || rej.retailer_name}>
                                        {rejectionAnalytics.retailerCompanyMap?.[rej.retailer_id] || rej.retailer_name}
                                      </td>
                                      <td className="p-1 text-center">{rej.quantity}</td>
                                      <td className="p-1 text-gray-500">{rej.reason || '-'}</td>
                                      <td className="p-1 text-right font-medium text-red-600">{formatCurrency(rej.rejection_value)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {rejectionProductDrilldown.byDate.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No date data available</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== INDENT MODAL ==================== */}
        {showIndentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Create Indent for Retailer</h3>
                <button onClick={() => { setShowIndentModal(false); resetIndentForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateOrUpdateIndent} className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Retailer (Shop) *</label>
                    <Input
                      type="text"
                      value={retailerSearch || retailers.find(r => r.id === indentForm.retailer_id)?.company_name || retailers.find(r => r.id === indentForm.retailer_id)?.name || ''}
                      onChange={(e) => {
                        setRetailerSearch(e.target.value);
                        setShowRetailerDropdown(true);
                        if (!e.target.value) {
                          setIndentForm(prev => ({ ...prev, retailer_id: '' }));
                        }
                      }}
                      onFocus={() => {
                        setShowRetailerDropdown(true);
                        setRetailerSearch('');
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowRetailerDropdown(false), 200);
                      }}
                      placeholder="Search shop name..."
                      className="w-full h-9"
                      required
                    />
                    {showRetailerDropdown && (
                      <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {filteredRetailers.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500">No retailers found</div>
                        ) : (
                          filteredRetailers.map(r => (
                            <div
                              key={r.id}
                              className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleRetailerSelectForIndent(r);
                              }}
                            >
                              <div className="font-medium">{r.company_name || r.name}</div>
                              {r.contact_person && <div className="text-xs text-gray-400">Owner: {r.contact_person}</div>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                    <Input
                      type="date"
                      value={indentForm.indent_date}
                      onChange={(e) => setIndentForm(prev => ({ ...prev, indent_date: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Items *</label>
                    <div className="flex gap-2">
                      {!editingIndent && (
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline" 
                          onClick={() => loadPreviousRetailerIndent()}
                          className="border-blue-300 text-blue-600 hover:bg-blue-50"
                        >
                          <Clock size={14} className="mr-1" /> Load Previous
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={addIndentItem}>
                        <Plus size={14} className="mr-1" /> Add Item
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {indentForm.items.map((item, index) => {
                      // Get display name based on language - look up from productMap if needed
                      let displayProductName = item.product_name || '';
                      if (i18n.language === 'hi') {
                        if (item.product_name_hi) {
                          displayProductName = item.product_name_hi;
                        } else if (item.product_id) {
                          const p = productMap.get(item.product_id);
                          if (p && p.name_hi) displayProductName = p.name_hi;
                        } else if (item.product_name) {
                          const p = productMap.get(item.product_name);
                          if (p && p.name_hi) displayProductName = p.name_hi;
                        }
                      }
                      
                      return (
                      <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                        {/* Product Search */}
                        <div className="flex-1 relative">
                          <Input
                            type="text"
                            value={displayProductName}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setIndentForm(prev => {
                                const items = [...prev.items];
                                items[index] = { ...items[index], product_name: newValue, product_id: '', product_name_hi: '' };
                                return { ...prev, items };
                              });
                              setShowProductDropdown(index);
                              setProductSearch(newValue);
                            }}
                            onFocus={() => {
                              setShowProductDropdown(index);
                              setProductSearch(item.product_name || '');
                            }}
                            onBlur={() => {
                              // Delay hiding to allow click on dropdown items
                              setTimeout(() => setShowProductDropdown(null), 200);
                            }}
                            placeholder="Search product..."
                            className="h-9 text-sm"
                            required
                          />
                          {showProductDropdown === index && (
                            <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto">
                              {filteredProducts.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">No products found</div>
                              ) : (
                                filteredProducts.slice(0, 12).map(p => {
                                  const displayName = i18n.language === 'hi' && p.name_hi ? p.name_hi : p.name;
                                  return (
                                    <div
                                      key={p.id}
                                      className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault(); // Prevent blur from firing before click
                                        setIndentForm(prev => {
                                          const items = [...prev.items];
                                          items[index] = { ...items[index], product_id: p.id, product_name: p.name, product_name_hi: p.name_hi };
                                          return { ...prev, items };
                                        });
                                        setShowProductDropdown(null);
                                        setProductSearch('');
                                      }}
                                    >
                                      {displayName}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                        {/* Variant Search */}
                        <div className="w-36 relative">
                          <Input
                            type="text"
                            value={item.variant_name || ''}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setIndentForm(prev => {
                                const items = [...prev.items];
                                items[index] = { ...items[index], variant_name: newValue, variant_id: '' };
                                return { ...prev, items };
                              });
                              setShowVariantDropdown(index);
                              setVariantSearch(newValue);
                            }}
                            onFocus={() => {
                              setShowVariantDropdown(index);
                              setVariantSearch(item.variant_name || '');
                            }}
                            onBlur={() => {
                              setTimeout(() => setShowVariantDropdown(null), 200);
                            }}
                            placeholder="Variant"
                            className="h-9 text-sm"
                          />
                          {showVariantDropdown === index && (() => {
                            // Get variants specific to the selected product (includes unit-based variants)
                            const productVariants = getVariantsForProduct(item.product_id);
                            return (
                            <div className="absolute z-20 w-48 mt-1 bg-white border rounded-md shadow-lg max-h-72 overflow-y-auto">
                              {productVariants.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">No variants found</div>
                              ) : (
                                productVariants.slice(0, 12).map(p => (
                                  <div
                                    key={p.id}
                                    className="p-3 hover:bg-gray-100 cursor-pointer text-sm border-b last:border-b-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setIndentForm(prev => {
                                        const items = [...prev.items];
                                        items[index] = { ...items[index], variant_id: p.id, variant_name: p.name };
                                        return { ...prev, items };
                                      });
                                      setShowVariantDropdown(null);
                                      setVariantSearch('');
                                    }}
                                  >
                                    {p.name}
                                  </div>
                                ))
                              )}
                            </div>
                          );})()}
                        </div>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(e) => updateIndentItem(index, 'quantity', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                          placeholder="Qty"
                          className="w-20 h-9"
                          required
                        />
                        {indentForm.items.length > 1 && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeIndentItem(index)}>
                            <X size={14} className="text-red-600" />
                          </Button>
                        )}
                      </div>
                    );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowIndentModal(false); setEditingIndent(null); resetIndentForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">{editingIndent ? 'Update Indent' : 'Create Indent'}</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== DISPATCH MODAL ==================== */}
        {showDispatchModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">
                    {editingDispatch ? 'Edit Dispatch' : `Dispatch to ${getRetailerNameById(selectedIndent?.retailer_id) || selectedIndent?.retailer_name}`}
                  </h3>
                  {selectedIndent && <p className="text-sm text-gray-500">Indent: {formatDate(selectedIndent?.indent_date)}</p>}
                </div>
                <button onClick={() => { setShowDispatchModal(false); setSelectedIndent(null); setEditingDispatch(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateOrUpdateDispatch} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Date *</label>
                  <Input
                    type="date"
                    value={dispatchForm.dispatch_date}
                    onChange={async (e) => {
                      const newDate = e.target.value;
                      setDispatchForm(prev => ({ ...prev, dispatch_date: newDate }));
                      
                      // Reload MRP for the new date
                      try {
                        const mrpRes = await api.get(`/api/daily-mrp/for-dispatch?date=${newDate}`);
                        const mrpMap = mrpRes.data || {};
                        
                        let filledCount = 0;
                        setDispatchForm(prev => ({
                          ...prev,
                          items: prev.items.map(item => {
                            const mrpKey = `${item.product_id}_${item.variant_id || ''}`;
                            const mrpValue = mrpMap[mrpKey];
                            if (mrpValue && mrpValue > 0) {
                              filledCount++;
                              return {
                                ...item,
                                mrp: mrpValue,
                                total_value: (item.supplied_qty || 0) * mrpValue
                              };
                            }
                            return item;
                          })
                        }));
                        
                        if (filledCount > 0) {
                          toast.success(`Auto-filled MRP for ${filledCount} items from ${newDate}`);
                        }
                      } catch (error) {
                        console.error('Failed to fetch MRP for date:', error);
                      }
                    }}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Items (MRP is mandatory)</label>
                    {!editingDispatch && selectedIndent && (
                      <Button 
                        type="button"
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setDispatchForm(prev => ({
                            ...prev,
                            items: prev.items.map(item => ({
                              ...item,
                              supplied_qty: item.indent_qty,  // Fill with indent qty
                              total_value: (item.indent_qty || 0) * (item.mrp || 0),  // Recalculate total
                              marked_done: true  // Auto-check done when filling all quantities
                            }))
                          }));
                        }}
                        className="text-xs"
                      >
                        Fill All Quantities
                      </Button>
                    )}
                    <Button 
                      type="button"
                      size="sm" 
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await api.get('/api/retailer-dispatches/yesterday-mrp');
                          const mrpMap = {};
                          response.data.forEach(item => {
                            const key = `${item.product_id}|${item.variant_id || ''}`;
                            mrpMap[key] = item.mrp;
                          });
                          
                          let filledCount = 0;
                          setDispatchForm(prev => ({
                            ...prev,
                            items: prev.items.map(item => {
                              const key = `${item.product_id}|${item.variant_id || ''}`;
                              if (mrpMap[key] && mrpMap[key] > 0) {
                                filledCount++;
                                return { 
                                  ...item, 
                                  mrp: mrpMap[key],
                                  total_value: (item.supplied_qty || 0) * mrpMap[key]
                                };
                              }
                              return item;
                            })
                          }));
                          
                          if (filledCount > 0) {
                            toast.success(`Filled MRP for ${filledCount} items from yesterday`);
                          } else {
                            toast.info('No matching MRP found from yesterday\'s dispatches');
                          }
                        } catch (error) {
                          toast.error('Failed to fetch yesterday\'s MRP');
                        }
                      }}
                      className="text-xs"
                      title="Fill MRP from yesterday's dispatches for matching products and variants"
                    >
                      Fill Yesterday's MRP
                    </Button>
                  </div>
                  <div className="border rounded overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: '750px' }}>
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Product</th>
                          <th className="p-2 text-center">Variant</th>
                          <th className="p-2 text-center">Indent Qty</th>
                          <th className="p-2 text-center">Supply Qty</th>
                          <th className="p-2 text-center">MRP *</th>
                          <th className="p-2 text-right">Total</th>
                          {!editingDispatch && <th className="p-2 text-center w-16" title="Check to mark this item's supply as complete (even if partial)">Done</th>}
                          {!editingDispatch && <th className="p-2 text-center w-10"></th>}
                          {editingDispatch && <th className="p-2 text-center w-10"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {dispatchForm.items.map((item, index) => (
                          <tr key={index} className={`border-t ${item.marked_done ? 'bg-green-50' : ''}`}>
                            <td className="p-2">{getProductName(item)}</td>
                            <td className="p-2 text-center">
                              <select
                                value={item.variant_id || ''}
                                onChange={async (e) => {
                                  const variant = packagings.find(p => p.id === e.target.value);
                                  updateDispatchItem(index, 'variant_id', e.target.value);
                                  updateDispatchItem(index, 'variant_name', variant?.name || '');
                                  
                                  // Lookup MRP for the new variant
                                  try {
                                    const mrpRes = await api.get(`/api/daily-mrp/for-dispatch?date=${dispatchForm.dispatch_date}`);
                                    const mrpMap = mrpRes.data || {};
                                    const mrpKey = `${item.product_id}_${e.target.value || ''}`;
                                    const mrpValue = mrpMap[mrpKey];
                                    if (mrpValue && mrpValue > 0) {
                                      updateDispatchItem(index, 'mrp', mrpValue);
                                      toast.info(`MRP auto-filled: ₹${mrpValue}`);
                                    }
                                  } catch (error) {
                                    console.error('Failed to fetch MRP for variant:', error);
                                  }
                                }}
                                className="w-28 h-7 text-xs border rounded px-1"
                              >
                                <option value="">Select</option>
                                {packagings.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2 text-center text-gray-500">{item.indent_qty}</td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                value={item.supplied_qty || ''}
                                onChange={(e) => updateDispatchItem(index, 'supplied_qty', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                                className="w-20 h-7 text-center mx-auto"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.mrp || ''}
                                onChange={(e) => updateDispatchItem(index, 'mrp', e.target.value === '' ? '' : parseFloat(e.target.value) || '')}
                                className="w-24 h-7 text-center mx-auto"
                                placeholder="₹ MRP"
                                required
                              />
                            </td>
                            <td className="p-2 text-right font-medium">{formatCurrency(item.total_value)}</td>
                            {!editingDispatch && (
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={item.marked_done || false}
                                  onChange={(e) => updateDispatchItem(index, 'marked_done', e.target.checked)}
                                  className="w-4 h-4 accent-green-600 cursor-pointer"
                                  title={item.marked_done ? "Item marked as done - won't appear in future dispatches" : "Check to mark supply complete (even if partial)"}
                                />
                              </td>
                            )}
                            {!editingDispatch && (
                              <td className="p-2 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                                  onClick={() => {
                                    if (dispatchForm.items.length > 1) {
                                      setDispatchForm(prev => ({
                                        ...prev,
                                        items: prev.items.filter((_, i) => i !== index)
                                      }));
                                    } else {
                                      toast.error('Cannot remove the last item');
                                    }
                                  }}
                                  title="Remove this item from current dispatch"
                                >
                                  <X size={14} />
                                </Button>
                              </td>
                            )}
                            {editingDispatch && (
                              <td className="p-2 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                                  onClick={() => {
                                    if (dispatchForm.items.length > 1) {
                                      setDispatchForm(prev => ({
                                        ...prev,
                                        items: prev.items.filter((_, i) => i !== index)
                                      }));
                                    } else {
                                      toast.error('Cannot delete the last item');
                                    }
                                  }}
                                  title="Delete this item"
                                >
                                  <X size={14} />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-semibold">
                        <tr>
                          <td colSpan={6} className="p-2 text-right">Total MRP Value:</td>
                          <td className="p-2 text-right">{formatCurrency(dispatchForm.items.reduce((sum, i) => sum + i.total_value, 0))}</td>
                          {!editingDispatch && <td colSpan={2}></td>}
                          {editingDispatch && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transport Charges (Optional)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={dispatchForm.transport_charges || ''}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, transport_charges: parseFloat(e.target.value) || 0 }))}
                      placeholder="₹ 0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                    <Input
                      type="text"
                      value={dispatchForm.remarks}
                      onChange={(e) => setDispatchForm(prev => ({ ...prev, remarks: e.target.value }))}
                      placeholder="Optional remarks"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowDispatchModal(false); setSelectedIndent(null); setEditingDispatch(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">
                    {editingDispatch ? 'Update Dispatch' : 'Create Dispatch'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== INVOICE MODAL ==================== */}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Create Invoice</h3>
                  <p className="text-sm text-gray-500">Select items to include in this invoice</p>
                </div>
                <button onClick={() => { setShowInvoiceModal(false); setSelectedItemIds([]); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateInvoice} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
                  <Input
                    type="date"
                    value={invoiceForm.invoice_date}
                    onChange={(e) => setInvoiceForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      Select Items ({selectedItemIds.length} selected)
                    </label>
                    {uninvoicedItems.length > 0 && (
                      <Button type="button" variant="outline" size="sm" onClick={selectAllItems}>
                        Select All
                      </Button>
                    )}
                  </div>
                  {uninvoicedItems.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No uninvoiced items found for this retailer</p>
                  ) : (
                    <div className="border rounded max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 w-8 text-center">
                              <input 
                                type="checkbox"
                                checked={uninvoicedItems.length > 0 && selectedItemIds.length === uninvoicedItems.length}
                                onChange={() => {
                                  if (selectedItemIds.length === uninvoicedItems.length) {
                                    setSelectedItemIds([]);
                                  } else {
                                    setSelectedItemIds(uninvoicedItems.map(i => i.item_id));
                                  }
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-[#14532D] focus:ring-[#14532D] cursor-pointer"
                              />
                            </th>
                            <th className="p-2 text-left">Product</th>
                            <th className="p-2 text-center">Qty</th>
                            <th className="p-2 text-right">MRP</th>
                            <th className="p-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uninvoicedItems.map((item) => {
                            // Use created_at for actual dispatch time, fall back to dispatch_date
                            const timestampStr = item.dispatch_created_at || item.dispatch_date;
                            const dispatchDateTime = timestampStr ? new Date(timestampStr) : null;
                            
                            // Format date part from dispatch_date (the actual dispatch date)
                            const dispatchDateOnly = item.dispatch_date ? new Date(item.dispatch_date) : null;
                            const formattedDate = dispatchDateOnly 
                              ? dispatchDateOnly.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
                              : '';
                            
                            // Format time from created_at (the actual time when dispatch was created)
                            const formattedTime = item.dispatch_created_at 
                              ? new Date(item.dispatch_created_at).toLocaleTimeString('en-IN', { 
                                  hour: '2-digit', 
                                  minute: '2-digit', 
                                  hour12: true,
                                  timeZone: 'Asia/Kolkata'
                                })
                              : '';
                            
                            return (
                            <tr 
                              key={item.item_id} 
                              className={`border-t cursor-pointer hover:bg-gray-50 ${selectedItemIds.includes(item.item_id) ? 'bg-green-50' : ''}`}
                              onClick={() => toggleItemSelection(item.item_id)}
                            >
                              <td className="p-2 text-center">
                                <input 
                                  type="checkbox"
                                  checked={selectedItemIds.includes(item.item_id)}
                                  onChange={() => toggleItemSelection(item.item_id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-gray-300 text-[#14532D] focus:ring-[#14532D] cursor-pointer"
                                />
                              </td>
                              <td className="p-2">
                                <div className="font-medium">{getProductName(item)}</div>
                                {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                                {(formattedDate || formattedTime) && (
                                  <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                    <Clock size={10} />
                                    <span>Dispatched: {formattedDate}{formattedTime ? ` at ${formattedTime}` : ''}</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-2 text-center font-medium">{item.supplied_qty}</td>
                              <td className="p-2 text-right">₹{item.mrp?.toFixed(2)}</td>
                              <td className="p-2 text-right font-medium">₹{(item.supplied_qty * (item.mrp || 0)).toFixed(2)}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {selectedItemIds.length > 0 && (
                  <div className="bg-green-50 p-4 rounded space-y-2 border border-green-200">
                    {(() => {
                      const selectedItems = uninvoicedItems.filter(i => selectedItemIds.includes(i.item_id));
                      const totalAmount = selectedItems.reduce((sum, i) => sum + (i.supplied_qty * (i.mrp || 0)), 0);
                      const retailer = retailers.find(r => r.id === invoiceForm.retailer_id);
                      const commissionPct = retailer?.commission_percentage || 0;
                      const commissionAmt = (totalAmount * commissionPct) / 100;
                      const payableAmount = totalAmount - commissionAmt;
                      
                      return (
                        <>
                          <div className="text-sm font-semibold text-gray-700 mb-2">Invoice Summary</div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Selected Items:</span>
                            <span className="font-medium">{selectedItemIds.length}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">Total Amount (MRP Value):</span>
                            <span className="font-medium">{formatCurrency(totalAmount)}</span>
                          </div>
                          {commissionPct > 0 && (
                            <div className="flex justify-between items-center text-sm text-amber-700">
                              <span>(-) Commission ({commissionPct}%):</span>
                              <span className="font-medium">-{formatCurrency(commissionAmt)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-sm border-t pt-2 mt-2 bg-green-100 -mx-4 px-4 py-2 rounded-b">
                            <span className="text-green-800 font-bold">Amount Payable by Retailer:</span>
                            <span className="text-green-800 font-bold text-lg">{formatCurrency(payableAmount)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowInvoiceModal(false); setSelectedItemIds([]); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]" disabled={selectedItemIds.length === 0}>
                    Create Invoice ({selectedItemIds.length})
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== EDIT INVOICE MODAL ==================== */}
        {showEditInvoiceModal && editingInvoice && editInvoiceForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="text-lg font-semibold">Edit Invoice - {editingInvoice.invoice_number}</h3>
                  <p className="text-sm text-gray-500">Update invoice details</p>
                </div>
                <button onClick={() => { setShowEditInvoiceModal(false); setEditingInvoice(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateInvoice} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                  <Input
                    type="date"
                    value={editInvoiceForm.invoice_date}
                    onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Items</label>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="p-2 text-left">Product</th>
                          <th className="p-2 text-center w-24">Qty</th>
                          <th className="p-2 text-center w-28">MRP</th>
                          <th className="p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editInvoiceForm.items.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">
                              <div className="font-medium">{getProductName(item)}</div>
                              {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.quantity || item.supplied_qty || ''}
                                onChange={(e) => updateEditInvoiceItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-20 h-8 text-center"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.mrp || ''}
                                onChange={(e) => updateEditInvoiceItem(idx, 'mrp', parseFloat(e.target.value) || 0)}
                                className="w-24 h-8 text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-medium">
                              ₹{(item.total_value || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={3} className="p-2 text-right font-medium">Total:</td>
                          <td className="p-2 text-right font-bold">
                            ₹{editInvoiceForm.items.reduce((sum, i) => sum + (i.total_value || 0), 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    type="text"
                    value={editInvoiceForm.remarks || ''}
                    onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                {/* Payment History Section (only show if there are payments) */}
                {(editingInvoice.paid_amount > 0 || editInvoicePayments.length > 0) && (
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <CreditCard size={16} className="text-green-600" />
                        Payment History
                      </h4>
                      <span className="text-sm text-green-600 font-medium">
                        Paid: {formatCurrency(editingInvoice.paid_amount || 0)}
                      </span>
                    </div>
                    {editInvoicePaymentsLoading ? (
                      <div className="text-center py-3 text-gray-500 text-sm">Loading payments...</div>
                    ) : editInvoicePayments.length === 0 ? (
                      <div className="text-center py-3 text-gray-500 bg-gray-50 rounded-lg text-sm">No payments recorded</div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {editInvoicePayments.map((payment, idx) => (
                          <div key={payment.id || idx} className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-green-700">{formatCurrency(payment.amount)}</span>
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 uppercase">{payment.payment_mode}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-600">
                                  <div><span className="text-gray-500">Date:</span> {formatDate(payment.payment_date)}</div>
                                  <div><span className="text-gray-500">By:</span> {payment.received_by_name || '-'}</div>
                                  {payment.reference_number && (
                                    <div className="col-span-2"><span className="text-gray-500">Ref:</span> {payment.reference_number}</div>
                                  )}
                                  {payment.remarks && (
                                    <div className="col-span-2"><span className="text-gray-500">Remarks:</span> {payment.remarks}</div>
                                  )}
                                </div>
                              </div>
                              <Button 
                                type="button"
                                size="sm" 
                                variant="ghost" 
                                className="text-red-500 hover:bg-red-50 h-7 w-7 p-0 flex-shrink-0"
                                onClick={() => handleDeletePaymentFromEditModal(payment.id)}
                                title="Delete Payment"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add Payment button if there's pending amount */}
                    {((editingInvoice.net_payable || 0) - (editingInvoice.paid_amount || 0)) > 0 && (
                      <Button 
                        type="button"
                        variant="outline"
                        className="w-full mt-3 text-green-600 border-green-300 hover:bg-green-50"
                        onClick={() => {
                          setShowEditInvoiceModal(false);
                          openInvoicePaymentModal(editingInvoice);
                        }}
                      >
                        <IndianRupee size={14} className="mr-1" /> Add Payment ({formatCurrency((editingInvoice.net_payable || 0) - (editingInvoice.paid_amount || 0))} pending)
                      </Button>
                    )}
                  </div>
                )}

                {/* Credit Notes Applied Section in Edit Modal */}
                {editInvoiceCreditAdjustments.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4">
                    <h4 className="text-sm font-semibold text-purple-700 mb-2 flex items-center gap-2">
                      <CreditCard size={16} />
                      Credit Notes Applied
                    </h4>
                    <div className="space-y-2">
                      {editInvoiceCreditAdjustments.map((cn, idx) => {
                        const adjustment = cn.adjusted_against_invoices?.find(adj => adj.invoice_id === editingInvoice.id);
                        return (
                          <div key={cn.id || idx} className="flex items-center justify-between bg-white rounded p-2 text-sm border border-purple-100">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-purple-700">{formatCurrency(adjustment?.amount || cn.amount)}</span>
                                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">CN #{cn.credit_note_number}</span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                From: {cn.original_invoice_number}
                                {adjustment?.adjusted_at && ` • Applied: ${new Date(adjustment.adjusted_at).toLocaleDateString('en-IN')}`}
                              </div>
                            </div>
                            <Button 
                              type="button"
                              size="sm" 
                              variant="ghost" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-2"
                              onClick={async () => {
                                if (!window.confirm('Are you sure you want to remove this credit note adjustment? The credit will be restored.')) return;
                                try {
                                  await api.post(`/api/retailer-credit-notes/${cn.id}/remove-adjustment`, { invoice_id: editingInvoice.id });
                                  toast.success('Credit note adjustment removed');
                                  // Refresh
                                  const creditRes = await api.get(`/api/retailer-credit-notes?adjusted_against_invoice=${editingInvoice.id}`);
                                  const adjustedCredits = (creditRes.data || []).filter(c => 
                                    c.adjusted_against_invoices?.some(adj => adj.invoice_id === editingInvoice.id)
                                  );
                                  setEditInvoiceCreditAdjustments(adjustedCredits);
                                  loadInvoices();
                                  loadPayments();
                                } catch (error) {
                                  toast.error(error.response?.data?.detail || 'Failed to remove credit note');
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowEditInvoiceModal(false); setEditingInvoice(null); setEditInvoicePayments([]); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">
                    Update Invoice
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== REJECTION MODAL ==================== */}
        {showRejectionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-3 sm:p-4 border-b flex-shrink-0">
                <h3 className="text-base sm:text-lg font-semibold">Record Rejection</h3>
                <button onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                  <select
                    value={rejectionForm.retailer_id}
                    onChange={(e) => setRejectionForm(prev => ({ ...prev, retailer_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">Select Retailer</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <Input
                    type="date"
                    value={rejectionForm.rejection_date}
                    onChange={(e) => setRejectionForm(prev => ({ ...prev, rejection_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Dispatch Items for selected date/retailer */}
                {rejectionForm.retailer_id && rejectionForm.rejection_date && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Dispatch Items for {formatDate(rejectionForm.rejection_date)}
                    </label>
                    {rejectionDispatchItems.length === 0 ? (
                      <div className="p-4 bg-gray-50 rounded text-sm text-gray-500 text-center">
                        No dispatches found for this date
                      </div>
                    ) : (
                      <div className="border rounded overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[500px]">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="p-2 text-center w-8">
                                <Check size={14} />
                              </th>
                              <th className="p-2 text-left min-w-[120px]">Product</th>
                              <th className="p-2 text-center w-16">Supplied</th>
                              <th className="p-2 text-center w-24">Previous Rej.</th>
                              <th className="p-2 text-center w-20">New Reject</th>
                              <th className="p-2 text-center w-16">MRP</th>
                              <th className="p-2 text-left min-w-[130px]">Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rejectionDispatchItems.map((item, idx) => (
                              <React.Fragment key={idx}>
                                <tr className={`border-t ${item.selected ? 'bg-red-50' : ''}`}>
                                  <td className="p-2 text-center">
                                    <input
                                      type="checkbox"
                                      checked={item.selected}
                                      onChange={(e) => updateRejectionItem(idx, 'selected', e.target.checked)}
                                      className="w-4 h-4"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <div className="font-medium text-sm">{getProductName(item)}</div>
                                    {item.variant_name && <div className="text-xs text-gray-500">{item.variant_name}</div>}
                                  </td>
                                  <td className="p-2 text-center text-gray-600 text-sm">{item.supplied_qty}</td>
                                  <td className="p-2 text-center">
                                    {item.total_previous_qty > 0 ? (
                                      <div className="text-xs">
                                        <span className="font-medium text-red-600">{item.total_previous_qty}</span>
                                        <button
                                          type="button"
                                          className="ml-1 text-blue-600 hover:text-blue-800 underline"
                                          onClick={() => {
                                            setRejectionDispatchItems(prev => prev.map((it, i) => 
                                              i === idx ? {...it, showHistory: !it.showHistory} : it
                                            ));
                                          }}
                                        >
                                          ({item.previous_rejections?.length || 0} entries)
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 text-xs">None</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-center">
                                    <Input
                                      type="number"
                                      min="0"
                                      max={item.supplied_qty - item.total_previous_qty}
                                      value={item.rejection_qty || ''}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const maxAllowed = item.supplied_qty - item.total_previous_qty;
                                        if (val > maxAllowed) {
                                          setRejectionErrorDialog({
                                            open: true,
                                            title: 'Rejection Limit Exceeded',
                                            message: `Cannot exceed remaining quantity (${maxAllowed}).\n\nSupplied: ${item.supplied_qty}\nAlready rejected: ${item.total_previous_qty}\nRemaining: ${maxAllowed}`
                                          });
                                          return;
                                        }
                                        updateRejectionItem(idx, 'rejection_qty', val);
                                        if (val > 0) updateRejectionItem(idx, 'selected', true);
                                      }}
                                      className="w-16 h-7 text-center text-sm"
                                      disabled={!item.selected && !item.rejection_qty}
                                    />
                                  </td>
                                  <td className="p-2 text-center text-gray-600 text-sm">₹{item.mrp}</td>
                                  <td className="p-2">
                                    <select
                                      value={item.reason || ''}
                                      onChange={(e) => updateRejectionItem(idx, 'reason', e.target.value)}
                                      className="w-full min-w-[110px] h-8 px-2 rounded border text-sm"
                                      disabled={!item.selected}
                                    >
                                      <option value="">Select Reason</option>
                                      <option value="Rotten">Rotten</option>
                                      <option value="Damaged">Damaged</option>
                                      <option value="Quality Issue">Quality Issue</option>
                                      <option value="Expired">Expired</option>
                                      <option value="Other">Other</option>
                                    </select>
                                  </td>
                                </tr>
                                {/* Rejection History Row */}
                                {item.showHistory && item.previous_rejections?.length > 0 && (
                                  <tr className="bg-amber-50">
                                    <td colSpan="7" className="p-2 pl-10">
                                      <div className="text-xs">
                                        <div className="font-medium text-amber-800 mb-1">Rejections for this date:</div>
                                        <div className="space-y-1">
                                          {item.previous_rejections.map((rej, rIdx) => (
                                            <div key={rIdx} className="flex flex-wrap gap-2 sm:gap-4 text-gray-600 py-1 border-b border-amber-100 last:border-0">
                                              <span className="font-medium text-red-600">{rej.quantity} units</span>
                                              <span>₹{rej.rejection_value?.toFixed(2)}</span>
                                              <span className="text-gray-500">{rej.reason}</span>
                                              {rej.created_at && (
                                                <span className="text-gray-400 text-[10px] italic">
                                                  (Recorded: {new Date(rej.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(rej.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        <div className="mt-1 pt-1 border-t border-amber-200 font-medium text-amber-800">
                                          Total for this date: {item.total_previous_qty} units (₹{item.total_previous_value?.toFixed(2)})
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Remarks for all rejections */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (Optional)</label>
                  <Input
                    type="text"
                    value={rejectionForm.remarks || ''}
                    onChange={(e) => {
                      // Update remarks for all selected items
                      const remarks = e.target.value;
                      setRejectionForm(prev => ({ ...prev, remarks }));
                      setRejectionDispatchItems(prev => prev.map(item => 
                        item.selected ? { ...item, remarks } : item
                      ));
                    }}
                    placeholder="Enter remarks for rejections"
                  />
                </div>
              </div>
              
              {/* Sticky footer buttons */}
              <div className="flex gap-2 p-3 sm:p-4 border-t bg-white flex-shrink-0">
                <Button type="button" variant="outline" onClick={() => { setShowRejectionModal(false); resetRejectionForm(); }} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  type="button"
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={!rejectionDispatchItems.some(i => i.selected && i.rejection_qty > 0)}
                  onClick={handleCreateRejections}
                >
                  Record Rejections ({rejectionDispatchItems.filter(i => i.selected && i.rejection_qty > 0).length})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT MODAL ==================== */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold">Record Payment</h3>
                <button onClick={() => { setShowPaymentModal(false); resetPaymentForm(); setPaymentRetailerSearch(''); setShowPaymentRetailerDropdown(false); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreatePayment} className="p-4 space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Retailer *</label>
                  <Input
                    type="text"
                    value={paymentRetailerSearch || retailers.find(r => r.id === paymentForm.retailer_id)?.company_name || retailers.find(r => r.id === paymentForm.retailer_id)?.name || ''}
                    onChange={(e) => {
                      setPaymentRetailerSearch(e.target.value);
                      setShowPaymentRetailerDropdown(true);
                      if (!e.target.value) {
                        setPaymentForm(prev => ({ ...prev, retailer_id: '' }));
                      }
                    }}
                    onFocus={() => {
                      setShowPaymentRetailerDropdown(true);
                      setPaymentRetailerSearch('');
                    }}
                    placeholder="Search retailer..."
                    className="w-full h-9"
                    required
                  />
                  {showPaymentRetailerDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredPaymentRetailers.length === 0 ? (
                        <div className="p-2 text-sm text-gray-500">No retailers found</div>
                      ) : (
                        filteredPaymentRetailers.map(r => (
                          <div
                            key={r.id}
                            className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                            onClick={() => {
                              setPaymentForm(prev => ({ ...prev, retailer_id: r.id }));
                              setPaymentRetailerSearch(r.company_name || r.name);
                              setShowPaymentRetailerDropdown(false);
                            }}
                          >
                            <div className="font-medium">{r.company_name || r.name}</div>
                            {r.contact_person && <div className="text-xs text-gray-500">{r.contact_person}</div>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <Input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Payment Context - Shows when retailer is selected */}
                {paymentContext && (
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                    <div className="font-medium text-gray-700 mb-2">{paymentContext.retailer_name} - Account Summary</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-500">Total MRP Value:</span>
                        <span className="float-right font-medium">{formatCurrency(paymentContext.totalMrpValue)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Invoiced:</span>
                        <span className="float-right font-medium text-green-700">{formatCurrency(paymentContext.totalInvoiced)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Already Paid:</span>
                        <span className="float-right font-medium text-blue-600">{formatCurrency(paymentContext.totalPaid)}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t">
                        <span className="text-gray-700 font-medium">Pending Amount:</span>
                        <span className={`float-right font-bold text-lg ${paymentContext.pendingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(paymentContext.pendingAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={paymentForm.amount || ''}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value === '' ? '' : parseFloat(e.target.value) || '' }))}
                    placeholder={paymentContext ? `Pending: ₹${paymentContext.pendingAmount?.toFixed(2)}` : 'Enter amount'}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
                  <select
                    value={paymentForm.payment_mode}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                  <Input
                    value={paymentForm.reference_number}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                    placeholder="UPI ref / Cheque no / Transaction ID"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    value={paymentForm.remarks}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowPaymentModal(false); resetPaymentForm(); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-[#14532D]">Record Payment</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== INVOICE PAYMENT MODAL ==================== */}
        {showInvoicePaymentModal && selectedInvoiceForPayment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) { setShowInvoicePaymentModal(false); setSelectedInvoiceForPayment(null); }}}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col my-auto">
              <div className="flex items-center justify-between p-4 border-b bg-green-50 flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <IndianRupee size={20} className="text-green-600" />
                  Record Invoice Payment
                </h3>
                <button onClick={() => { setShowInvoicePaymentModal(false); setSelectedInvoiceForPayment(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleInvoicePayment} className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Invoice Summary */}
                {(() => {
                  // Check if this invoice's retailer is 100% upfront
                  const retailer = retailers.find(r => r.id === selectedInvoiceForPayment.retailer_id);
                  const isUpfront100 = retailer?.upfront_collection_percentage === 100;
                  
                  // For 100% upfront retailers: use gross value minus commission (no rejection deduction)
                  const grossValue = selectedInvoiceForPayment.gross_value || selectedInvoiceForPayment.total_mrp_value || 0;
                  const commissionPct = selectedInvoiceForPayment.commission_percentage || 0;
                  const baseNetPayable = isUpfront100 
                    ? (grossValue - (grossValue * commissionPct / 100))
                    : (selectedInvoiceForPayment.net_payable || 0);
                  
                  // Subtract credit notes that have been adjusted against this invoice
                  const creditAdjusted = selectedInvoiceForPayment.total_credit_adjusted || 0;
                  const calculatedNetPayable = baseNetPayable - creditAdjusted;
                  
                  const paidAmount = selectedInvoiceForPayment.paid_amount || 0;
                  const pendingAmount = calculatedNetPayable - paidAmount;
                  
                  return (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice:</span>
                    <span className="font-semibold text-blue-600">{selectedInvoiceForPayment.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Retailer:</span>
                    <span className="font-medium">{getRetailerNameById(selectedInvoiceForPayment.retailer_id) || selectedInvoiceForPayment.retailer_name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600">Invoice Amount:</span>
                    <span className="font-semibold">{formatCurrency(baseNetPayable)}</span>
                  </div>
                  {creditAdjusted > 0 && (
                    <div className="flex justify-between text-purple-600">
                      <span>Credit Notes Adjusted:</span>
                      <span className="font-medium">-{formatCurrency(creditAdjusted)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Receivable:</span>
                    <span className="font-semibold">{formatCurrency(calculatedNetPayable)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Already Paid:</span>
                    <span className="font-medium">{formatCurrency(paidAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-amber-700 font-medium">Pending Amount:</span>
                    <span className="text-amber-700 font-bold text-lg">
                      {formatCurrency(pendingAmount)}
                    </span>
                  </div>
                </div>
                  );
                })()}
                
                {/* Show existing payments with timestamps if invoice has partial payments */}
                {(selectedInvoiceForPayment.paid_amount > 0) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                      <Clock size={14} /> Earlier Payments
                    </h4>
                    {loadingExistingPayments ? (
                      <p className="text-xs text-gray-500">Loading...</p>
                    ) : invoiceExistingPayments.length === 0 ? (
                      <p className="text-xs text-gray-500">No payment records found</p>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {invoiceExistingPayments.map((payment, idx) => (
                          <div key={payment.id || idx} className="bg-white border border-green-100 rounded p-2 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-green-700">{formatCurrency(payment.amount)}</span>
                              <span className="text-gray-500 uppercase text-[10px]">{payment.payment_mode}</span>
                            </div>
                            <div className="text-gray-600 mt-1">
                              <span>Paid on: {formatDate(payment.payment_date)}</span>
                              {payment.created_at && (
                                <span className="ml-2 text-gray-400">
                                  (Recorded: {new Date(payment.created_at).toLocaleString('en-IN', { 
                                    day: '2-digit', 
                                    month: 'short', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })})
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Pending Credit Notes Section */}
                {loadingPendingCredits ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Loading credit notes...</p>
                  </div>
                ) : pendingCreditNotesForPayment.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                      <CreditCard size={14} /> Available Credit Notes
                    </h4>
                    <p className="text-xs text-purple-600 mb-2">
                      Select credit notes to apply against this payment
                    </p>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {pendingCreditNotesForPayment.map((cn) => {
                        const existingAdj = selectedCreditAdjustments.find(adj => adj.credit_note_id === cn.id);
                        const adjAmount = existingAdj ? existingAdj.amount : 0;
                        const isSelected = adjAmount > 0;
                        
                        return (
                          <div 
                            key={cn.id} 
                            className={`bg-white border rounded p-2 text-xs ${isSelected ? 'border-purple-400 bg-purple-50' : 'border-purple-100'}`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        // Auto-apply full pending amount
                                        setSelectedCreditAdjustments(prev => [
                                          ...prev.filter(adj => adj.credit_note_id !== cn.id),
                                          { 
                                            credit_note_id: cn.id, 
                                            credit_note_number: cn.credit_note_number,
                                            amount: cn.pending_amount || cn.amount 
                                          }
                                        ]);
                                      } else {
                                        setSelectedCreditAdjustments(prev => 
                                          prev.filter(adj => adj.credit_note_id !== cn.id)
                                        );
                                      }
                                    }}
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                  />
                                  <span className="font-semibold text-purple-700">{cn.credit_note_number}</span>
                                </div>
                                <div className="text-gray-500 mt-1 pl-6">
                                  From: {cn.original_invoice_number}
                                  <span className="ml-2">({formatDate(cn.created_at)})</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-purple-700">₹{(cn.pending_amount || cn.amount).toLocaleString()}</div>
                                {cn.adjusted_amount > 0 && (
                                  <div className="text-[10px] text-gray-500">
                                    (₹{cn.adjusted_amount} already used)
                                  </div>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="mt-2 pl-6 flex items-center gap-2">
                                <label className="text-gray-600">Apply:</label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={cn.pending_amount || cn.amount}
                                  value={adjAmount}
                                  onChange={(e) => {
                                    const val = Math.min(parseFloat(e.target.value) || 0, cn.pending_amount || cn.amount);
                                    setSelectedCreditAdjustments(prev => 
                                      prev.map(adj => 
                                        adj.credit_note_id === cn.id 
                                          ? { ...adj, amount: val }
                                          : adj
                                      )
                                    );
                                  }}
                                  className="w-24 h-7 text-xs"
                                />
                                <span className="text-gray-500">of ₹{(cn.pending_amount || cn.amount).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selectedCreditAdjustments.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-purple-200 flex justify-between items-center">
                        <span className="text-sm font-medium text-purple-800">Total Credit Applied:</span>
                        <span className="text-lg font-bold text-purple-700">
                          ₹{selectedCreditAdjustments.reduce((sum, adj) => sum + (adj.amount || 0), 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                  <Input
                    type="date"
                    value={invoicePaymentForm.payment_date}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={invoicePaymentForm.amount}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode *</label>
                  <select
                    value={invoicePaymentForm.payment_mode}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, payment_mode: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-gray-200"
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Received By *</label>
                  <select
                    value={invoicePaymentForm.received_by}
                    onChange={(e) => {
                      const selectedUser = staffUsers.find(u => u.id === e.target.value);
                      setInvoicePaymentForm(prev => ({ 
                        ...prev, 
                        received_by: e.target.value,
                        received_by_name: selectedUser ? (selectedUser.name || selectedUser.email) : ''
                      }));
                    }}
                    className="w-full h-10 px-3 rounded-md border border-gray-200"
                    required
                  >
                    <option value="">-- Select --</option>
                    {staffUsers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email} ({user.role === 'admin' ? 'Admin' : 'Staff'})
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Reference Number - Only for non-cash payments */}
                {invoicePaymentForm.payment_mode !== 'cash' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reference Number <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={invoicePaymentForm.reference_number}
                      onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                      placeholder={
                        invoicePaymentForm.payment_mode === 'upi' ? 'UPI Transaction ID' :
                        invoicePaymentForm.payment_mode === 'bank_transfer' ? 'NEFT/IMPS/RTGS Reference' :
                        invoicePaymentForm.payment_mode === 'cheque' ? 'Cheque Number' :
                        'Transaction Reference'
                      }
                      required
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <Input
                    value={invoicePaymentForm.remarks}
                    onChange={(e) => setInvoicePaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowInvoicePaymentModal(false); setSelectedInvoiceForPayment(null); }} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1 bg-green-600 hover:bg-green-700">
                    <Check size={14} className="mr-1" /> Record Payment
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== PAYMENT HISTORY MODAL (View/Edit Paid Invoices) ==================== */}
        {showPaymentHistoryModal && selectedInvoiceForHistory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) { setShowPaymentHistoryModal(false); setSelectedInvoiceForHistory(null); }}}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col my-auto">
              <div className="flex items-center justify-between p-4 border-b bg-blue-50 flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Eye size={20} className="text-blue-600" />
                  Payment Details
                </h3>
                <button onClick={() => { setShowPaymentHistoryModal(false); setSelectedInvoiceForHistory(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Invoice Summary */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice:</span>
                    <span className="font-semibold text-blue-600">{selectedInvoiceForHistory.invoice_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Retailer:</span>
                    <span className="font-medium">{getRetailerNameById(selectedInvoiceForHistory.retailer_id) || selectedInvoiceForHistory.retailer_name}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-600">Invoice Amount:</span>
                    <span className="font-semibold">{formatCurrency(selectedInvoiceForHistory.net_payable)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Total Paid:</span>
                    <span className="font-semibold">{formatCurrency(selectedInvoiceForHistory.paid_amount || 0)}</span>
                  </div>
                  {((selectedInvoiceForHistory.net_payable || 0) - (selectedInvoiceForHistory.paid_amount || 0)) > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Pending:</span>
                      <span className="font-medium">{formatCurrency((selectedInvoiceForHistory.net_payable || 0) - (selectedInvoiceForHistory.paid_amount || 0))}</span>
                    </div>
                  )}
                </div>

                {/* Payment History */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Payment History</h4>
                  {paymentHistoryLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading...</div>
                  ) : invoicePaymentHistory.length === 0 ? (
                    <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">No payments recorded</div>
                  ) : (
                    <div className="space-y-3">
                      {invoicePaymentHistory.map((payment, idx) => (
                        <div key={payment.id || idx} className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-lg font-bold text-green-700">{formatCurrency(payment.amount)}</span>
                              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 uppercase">{payment.payment_mode}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-blue-500 hover:bg-blue-50 h-7 w-7 p-0"
                                onClick={() => openEditPaymentModal(payment)}
                                title="Edit Payment"
                              >
                                <Edit2 size={14} />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="text-red-500 hover:bg-red-50 h-7 w-7 p-0"
                                onClick={() => handleDeletePaymentFromHistory(payment.id)}
                                title="Delete Payment"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                            <div>
                              <span className="text-gray-500">Date:</span>{' '}
                              <span className="font-medium">{formatDate(payment.payment_date)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Received By:</span>{' '}
                              <span className="font-medium">{payment.received_by_name || '-'}</span>
                            </div>
                            {payment.reference_number && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Reference:</span>{' '}
                                <span className="font-medium">{payment.reference_number}</span>
                              </div>
                            )}
                            {payment.remarks && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Remarks:</span>{' '}
                                <span className="font-medium">{payment.remarks}</span>
                              </div>
                            )}
                            {/* Show created_at timestamp */}
                            {payment.created_at && (
                              <div className="col-span-2 pt-1 border-t border-green-200 mt-1">
                                <span className="text-gray-500">Recorded:</span>{' '}
                                <span className="font-medium text-gray-700">
                                  {new Date(payment.created_at).toLocaleString('en-IN', { 
                                    dateStyle: 'medium', 
                                    timeStyle: 'short' 
                                  })}
                                </span>
                              </div>
                            )}
                            {/* Show updated_at timestamp if payment was edited */}
                            {payment.updated_at && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Last Updated:</span>{' '}
                                <span className="font-medium text-blue-600">
                                  {new Date(payment.updated_at).toLocaleString('en-IN', { 
                                    dateStyle: 'medium', 
                                    timeStyle: 'short' 
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Credit Notes Applied Section */}
                {invoiceCreditAdjustments.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <CreditCard size={16} className="text-purple-600" />
                      Credit Notes Applied
                    </h4>
                    <div className="space-y-2">
                      {invoiceCreditAdjustments.map((cn, idx) => {
                        const adjustment = cn.adjusted_against_invoices?.find(adj => adj.invoice_id === selectedInvoiceForHistory.id);
                        return (
                          <div key={cn.id || idx} className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-lg font-bold text-purple-700">{formatCurrency(adjustment?.amount || cn.amount)}</span>
                                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">CREDIT NOTE</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mt-2">
                              <div>
                                <span className="text-gray-500">CN #:</span>{' '}
                                <span className="font-medium text-purple-700">{cn.credit_note_number}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Original Invoice:</span>{' '}
                                <span className="font-medium">{cn.original_invoice_number}</span>
                              </div>
                              {adjustment?.adjusted_at && (
                                <div className="col-span-2">
                                  <span className="text-gray-500">Applied:</span>{' '}
                                  <span className="font-medium">
                                    {new Date(adjustment.adjusted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Credit Notes Created FROM This Invoice Section */}
                {invoiceOriginatedCreditNotes.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <FileText size={16} className="text-blue-600" />
                      Credit Notes Created
                      <span className="text-xs font-normal text-gray-500">(from this invoice)</span>
                    </h4>
                    <div className="space-y-2">
                      {invoiceOriginatedCreditNotes.map((cn, idx) => (
                        <div key={cn.id || idx} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-lg font-bold text-blue-700">{formatCurrency(cn.amount)}</span>
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                cn.source === 'excess_payment' 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {cn.source === 'excess_payment' ? 'EXCESS PAYMENT' : 'REJECTION'}
                              </span>
                              <span className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                                cn.status === 'settled' ? 'bg-green-100 text-green-800' : 
                                cn.status === 'partial' ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {cn.status?.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mt-2">
                            <div>
                              <span className="text-gray-500">CN #:</span>{' '}
                              <span className="font-medium text-blue-700">{cn.credit_note_number}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Created:</span>{' '}
                              <span className="font-medium">
                                {new Date(cn.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            {cn.source === 'excess_payment' ? (
                              <div className="col-span-2">
                                <span className="text-blue-600 italic">Excess Payment Credit</span>
                              </div>
                            ) : cn.rejection_details?.length > 0 ? (
                              <div className="col-span-2">
                                <span className="text-gray-500">Rejected Items:</span>{' '}
                                <span className="font-medium">
                                  {cn.rejection_details.map(r => `${r.product_name} (${r.quantity} ${r.variant_name || r.unit || ''})`).join(', ')}
                                </span>
                              </div>
                            ) : null}
                            {cn.pending_amount > 0 && cn.pending_amount < cn.amount && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Pending Amount:</span>{' '}
                                <span className="font-medium text-amber-600">{formatCurrency(cn.pending_amount)}</span>
                              </div>
                            )}
                            {cn.remarks && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Remarks:</span>{' '}
                                <span className="font-medium">{cn.remarks}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add More Payment Button (if invoice still has pending amount) */}
                {((selectedInvoiceForHistory.net_payable || 0) - (selectedInvoiceForHistory.paid_amount || 0)) > 0 && (
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setShowPaymentHistoryModal(false);
                      openInvoicePaymentModal(selectedInvoiceForHistory);
                    }}
                  >
                    <IndianRupee size={14} className="mr-1" /> Add Payment
                  </Button>
                )}
              </div>
              <div className="p-4 border-t flex-shrink-0">
                <Button variant="outline" className="w-full" onClick={() => { setShowPaymentHistoryModal(false); setSelectedInvoiceForHistory(null); }}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== EDIT PAYMENT MODAL ==================== */}
        {showEditPaymentModal && editingPayment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Edit2 size={20} className="text-blue-600" />
                  Edit Payment
                </h3>
                <button onClick={() => { setShowEditPaymentModal(false); setEditingPayment(null); }} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleEditPayment} className="p-4 space-y-4">
                {/* Original Payment Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <p className="text-blue-800 font-medium mb-1">Editing Payment</p>
                  <p className="text-blue-600">
                    Original: {formatCurrency(editingPayment.amount)} on {formatDate(editingPayment.payment_date)}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Payment Amount *</label>
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
                  <label className="text-sm font-medium text-gray-700">Payment Date *</label>
                  <Input
                    type="date"
                    value={editPaymentForm.payment_date}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_date: e.target.value})}
                    className="w-full"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Payment Mode *</label>
                  <select
                    value={editPaymentForm.payment_mode}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, payment_mode: e.target.value})}
                    className="w-full border border-gray-300 rounded-md p-2 text-sm"
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                
                {editPaymentForm.payment_mode !== 'cash' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Reference Number *</label>
                    <Input
                      type="text"
                      placeholder="Transaction ID / Reference"
                      value={editPaymentForm.reference_number}
                      onChange={(e) => setEditPaymentForm({...editPaymentForm, reference_number: e.target.value})}
                      className="w-full"
                    />
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Remarks</label>
                  <Input
                    type="text"
                    placeholder="Optional notes"
                    value={editPaymentForm.remarks}
                    onChange={(e) => setEditPaymentForm({...editPaymentForm, remarks: e.target.value})}
                    className="w-full"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowEditPaymentModal(false); setEditingPayment(null); }}>
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

        {/* ==================== AUTO INDENT MODAL ==================== */}
        {showAutoIndentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Zap size={20} className="text-purple-600" />
                  Auto Indent Creation
                </h3>
                <button onClick={() => setShowAutoIndentModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Retailer *
                  </label>
                  <select
                    value={autoIndentRetailerId}
                    onChange={(e) => setAutoIndentRetailerId(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm"
                    required
                  >
                    <option value="">-- Choose a Retailer --</option>
                    {retailers.map(r => (
                      <option key={r.id} value={r.id}>{r.company_name || r.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Indent Date *
                  </label>
                  <Input
                    type="date"
                    value={autoIndentDate}
                    onChange={(e) => setAutoIndentDate(e.target.value)}
                    className="w-full"
                    min={getISTDate()}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Select the date for which the indent should be created
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Order Basis *
                  </label>
                  <div className="flex gap-4">
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      autoIndentBasis === 'sales' 
                        ? 'border-purple-500 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="orderBasis"
                        value="sales"
                        checked={autoIndentBasis === 'sales'}
                        onChange={(e) => setAutoIndentBasis(e.target.value)}
                        className="w-4 h-4 text-purple-600"
                      />
                      <div>
                        <div className="font-medium text-sm">Historical Sales</div>
                        <div className="text-xs text-gray-500">7 weekday avg + 10%</div>
                      </div>
                    </label>
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      autoIndentBasis === 'plan' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="orderBasis"
                        value="plan"
                        checked={autoIndentBasis === 'plan'}
                        onChange={(e) => setAutoIndentBasis(e.target.value)}
                        className="w-4 h-4 text-green-600"
                      />
                      <div>
                        <div className="font-medium text-sm">Retail Plan</div>
                        <div className="text-xs text-gray-500">Plan qty - Closing</div>
                      </div>
                    </label>
                  </div>
                </div>
                
                <div className={`text-sm p-3 rounded-lg ${
                  autoIndentBasis === 'sales' 
                    ? 'bg-purple-50 text-purple-700' 
                    : 'bg-green-50 text-green-700'
                }`}>
                  {autoIndentBasis === 'sales' ? (
                    <>This will create an indent based on the retailer's <strong>average sales from the last 7 identical weekdays + 10% buffer</strong>.</>
                  ) : (
                    <>This will create an indent based on the <strong>subscribed Retail Plan quantities minus yesterday's closing inventory</strong>. Closing inventory is required.</>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAutoIndentModal(false)} 
                    className="flex-1"
                    disabled={autoIndentLoading}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="button" 
                    onClick={handleAutoIndentCreation}
                    className={`flex-1 ${autoIndentBasis === 'sales' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}
                    disabled={autoIndentLoading || !autoIndentRetailerId}
                  >
                    {autoIndentLoading ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Zap size={14} />
                        Generate Indent
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* ==================== CREDIT NOTE CREATION MODAL ==================== */}
      {showCreditNoteModal && selectedRejectionForCN && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowCreditNoteModal(false); setSelectedRejectionForCN(null); }}}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b bg-purple-50">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <CreditCard size={20} className="text-purple-600" />
                Create Credit Note
              </h3>
              <button onClick={() => { setShowCreditNoteModal(false); setSelectedRejectionForCN(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Rejection Details */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <h4 className="font-medium text-gray-700 border-b pb-2 mb-2">Rejection Details</h4>
                <div className="flex justify-between">
                  <span className="text-gray-600">Retailer:</span>
                  <span className="font-medium">{selectedRejectionForCN.retailer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Rejection Date:</span>
                  <span className="font-medium">{formatDate(selectedRejectionForCN.rejection_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Product:</span>
                  <span className="font-medium">{selectedRejectionForCN.product_name}</span>
                </div>
                {selectedRejectionForCN.variant_name && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Variant:</span>
                    <span className="font-medium">{selectedRejectionForCN.variant_name}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Quantity:</span>
                  <span className="font-medium text-red-600">{selectedRejectionForCN.quantity} units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">MRP:</span>
                  <span className="font-medium">{formatCurrency(selectedRejectionForCN.mrp)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Reason:</span>
                  <span className="font-medium">{selectedRejectionForCN.reason}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-gray-700 font-medium">Rejection Value:</span>
                  <span className="text-lg font-bold text-red-600">{formatCurrency(selectedRejectionForCN.rejection_value)}</span>
                </div>
              </div>
              
              {/* Find Associated Invoice */}
              {(() => {
                // Find the invoice this rejection is associated with
                const rejectionDate = new Date(selectedRejectionForCN.rejection_date).toISOString().split('T')[0];
                const associatedInvoice = invoices.find(inv => 
                  inv.retailer_id === selectedRejectionForCN.retailer_id &&
                  inv.items?.some(item => 
                    item.product_id === selectedRejectionForCN.product_id &&
                    (item.variant_name === selectedRejectionForCN.variant_name || !selectedRejectionForCN.variant_name)
                  )
                );
                
                if (!associatedInvoice) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                      <p className="text-amber-700 font-medium flex items-center gap-2">
                        <AlertTriangle size={16} />
                        No matching invoice found
                      </p>
                      <p className="text-amber-600 text-xs mt-1">
                        Create an invoice for this retailer first to link the credit note.
                      </p>
                    </div>
                  );
                }
                
                return (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-sm">
                      <h4 className="font-medium text-blue-800">Associated Invoice</h4>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Invoice #:</span>
                        <span className="font-semibold text-blue-700">{associatedInvoice.invoice_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Invoice Date:</span>
                        <span className="font-medium">{formatDate(associatedInvoice.invoice_date)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Invoice Total:</span>
                        <span className="font-medium">{formatCurrency(associatedInvoice.net_payable)}</span>
                      </div>
                    </div>
                    
                    {/* Credit Note Calculation with Commission */}
                    {(() => {
                      const retailerData = retailers.find(r => r.id === selectedRejectionForCN.retailer_id);
                      const commissionPct = retailerData?.commission_percentage || 0;
                      const rejectionValue = selectedRejectionForCN.rejection_value || 0;
                      const commissionDeducted = rejectionValue * commissionPct / 100;
                      const creditAmount = rejectionValue - commissionDeducted;
                      
                      return (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Rejection Value (MRP):</span>
                            <span className="font-medium">{formatCurrency(rejectionValue)}</span>
                          </div>
                          {commissionPct > 0 && (
                            <div className="flex justify-between text-sm text-amber-700">
                              <span>Less: Commission ({commissionPct}%):</span>
                              <span className="font-medium">- {formatCurrency(commissionDeducted)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-2 border-t border-purple-200">
                            <span className="text-purple-800 font-medium">Credit Note Amount:</span>
                            <span className="text-2xl font-bold text-purple-700">
                              {formatCurrency(creditAmount)}
                            </span>
                          </div>
                          <p className="text-xs text-purple-600 mt-1">
                            {commissionPct > 0 
                              ? `Retailer pays ${100 - commissionPct}% of MRP, so credit is adjusted accordingly.`
                              : 'This credit note will be available to deduct from future invoices.'
                            }
                          </p>
                        </div>
                      );
                    })()}
                    
                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="flex-1" 
                        onClick={() => { setShowCreditNoteModal(false); setSelectedRejectionForCN(null); }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="button" 
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                        onClick={() => createCreditNoteFromRejection(selectedRejectionForCN, associatedInvoice)}
                      >
                        <CreditCard size={14} className="mr-1" /> Create Credit Note
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      
      {/* ==================== EDIT CREDIT NOTE MODAL ==================== */}
      {showEditCreditNoteModal && editingCreditNote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) { setShowEditCreditNoteModal(false); setEditingCreditNote(null); }}}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b bg-blue-50">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Edit2 size={20} className="text-blue-600" />
                Edit Credit Note
              </h3>
              <button onClick={() => { setShowEditCreditNoteModal(false); setEditingCreditNote(null); }} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={updateCreditNote} className="p-4 space-y-4">
              {/* Credit Note Info */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Credit Note #:</span>
                  <span className="font-semibold text-blue-700">{editingCreditNote.credit_note_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Retailer:</span>
                  <span className="font-medium">{editingCreditNote.retailer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Original Invoice:</span>
                  <span className="font-medium">{editingCreditNote.original_invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    editingCreditNote.status === 'adjusted' ? 'bg-green-100 text-green-700' :
                    editingCreditNote.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {editingCreditNote.status}
                  </span>
                </div>
                {editingCreditNote.adjusted_amount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Already Adjusted:</span>
                    <span className="font-medium">₹{editingCreditNote.adjusted_amount.toLocaleString()}</span>
                  </div>
                )}
                {editingCreditNote.auto_generated && (
                  <div className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Info size={12} /> Auto-generated from rejection
                  </div>
                )}
              </div>
              
              {/* Editable Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credit Amount (₹)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min={editingCreditNote.adjusted_amount || 0}
                    value={editCreditNoteForm.amount}
                    onChange={(e) => setEditCreditNoteForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full"
                    required
                  />
                  {editingCreditNote.adjusted_amount > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Minimum: ₹{editingCreditNote.adjusted_amount} (already adjusted)
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea
                    value={editCreditNoteForm.remarks}
                    onChange={(e) => setEditCreditNoteForm(prev => ({ ...prev, remarks: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 p-2 text-sm"
                    rows={2}
                    placeholder="Optional remarks"
                  />
                </div>
              </div>
              
              {/* Rejection Details */}
              {editingCreditNote.rejection_details?.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-red-800 mb-2">Rejection Details</h4>
                  {editingCreditNote.rejection_details.map((det, idx) => (
                    <div key={idx} className="text-xs text-red-700">
                      {det.product_name} {det.variant_name && `(${det.variant_name})`} - {det.quantity} units × ₹{det.mrp} = ₹{det.value}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => { setShowEditCreditNoteModal(false); setEditingCreditNote(null); }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Save size={14} className="mr-1" /> Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Rejection Error Dialog - Centered popup for validation errors */}
      <AlertDialog open={rejectionErrorDialog.open} onOpenChange={(open) => setRejectionErrorDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {rejectionErrorDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left whitespace-pre-line text-gray-700">
              {rejectionErrorDialog.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction 
              onClick={() => setRejectionErrorDialog({ open: false, title: '', message: '' })}
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Invoice Print Language Selection Dialog */}
      <Dialog open={showPrintLanguageDialog} onOpenChange={setShowPrintLanguageDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download size={20} className="text-blue-600" />
              Print Invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-3 block">
                Select language for product names:
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPrintLanguage('en')}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    printLanguage === 'en' 
                      ? 'border-green-600 bg-green-50 text-green-700' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-lg font-bold">EN</div>
                  <div className="text-xs text-gray-500">English</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLanguage('hi')}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    printLanguage === 'hi' 
                      ? 'border-orange-600 bg-orange-50 text-orange-700' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-lg font-bold">हिं</div>
                  <div className="text-xs text-gray-500">Hindi</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLanguage('mr')}
                  className={`p-3 rounded-lg border-2 text-center transition-all ${
                    printLanguage === 'mr' 
                      ? 'border-purple-600 bg-purple-50 text-purple-700' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-lg font-bold">मरा</div>
                  <div className="text-xs text-gray-500">Marathi</div>
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              Note: Only product names will be translated. Invoice details, amounts, and other text will remain in English.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPrintLanguageDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmPrintInvoice}
              className="bg-[#14532D] hover:bg-[#166534]"
            >
              <Download size={16} className="mr-2" />
              Print Invoice
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticker MRP Override Modal */}
      <Dialog open={stickerOverrideModalOpen} onOpenChange={setStickerOverrideModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag size={18} />
              {stickerOverrideEditItem?.id ? 'Edit MRP Override' : 'Add MRP Override'}
            </DialogTitle>
          </DialogHeader>
          <StickerMrpOverrideForm
            editItem={stickerOverrideEditItem}
            products={products}
            packagings={packagings}
            onSave={saveStickerMrpOverride}
            onCancel={() => {
              setStickerOverrideModalOpen(false);
              setStickerOverrideEditItem(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
