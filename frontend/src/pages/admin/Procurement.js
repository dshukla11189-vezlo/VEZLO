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
import { Plus, Trash2, UserPlus, DollarSign, Edit, Filter, Save, BookmarkPlus, IndianRupee, CheckSquare, Square, Phone, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import AutocompleteInput from '../../components/AutocompleteInput';
import { Checkbox } from '../../components/ui/checkbox';

const UNIT_TYPES = [
  { value: 'Kg', label: 'Kg (Kilogram)' },
  { value: 'Bunch', label: 'Bunch' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Pack', label: 'Pack' }
];

export default function Procurement() {
  const { t } = useTranslation();
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
  
  // Filters - default to today's date
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState({
    fromDate: today,
    toDate: today,
    farmerName: '',
    productName: ''
  });

  // Procurement form
  const [procurementForm, setProcurementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    farmer_id: '',
    farmer_name: '',
    products: [{ product_id: '', product_name: '', quantity: 0, unit: 'Kg', unit_size: '', rate: 0, total: 0 }],
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

  useEffect(() => {
    loadData();
    loadTemplates();
  }, []);

  const loadData = async () => {
    try {
      const [procRes, farmRes, prodRes] = await Promise.all([
        api.get('/api/procurement'),
        api.get('/api/farmers'),
        api.get('/api/products')
      ]);
      setProcurements(procRes.data);
      setFilteredProcurements(procRes.data);
      setFarmers(farmRes.data);
      setProducts(prodRes.data);
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

  const loadPreviousDayProcurements = async () => {
    try {
      const response = await api.get('/api/procurement/previous-day');
      setPreviousDayProcurements(response.data || []);
    } catch (error) {
      console.error('Error loading previous day procurements:', error);
    }
  };

  const handleOpenProcurementForm = async () => {
    await loadPreviousDayProcurements();
    setShowPreviousDayItems(true);
    setOpenProcurement(true);
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
    setProcurementForm({
      ...procurementForm,
      products: [...procurementForm.products, { product_id: '', product_name: '', quantity: 0, unit: 'Kg', unit_size: '', rate: 0, total: 0 }]
    });
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
          rate: selectedProduct.price_per_kg || 0
        };
      }
    } else if (field === 'unit') {
      newProducts[index][field] = value;
      // Reset unit_size if not Bunch
      if (value !== 'Bunch') {
        newProducts[index].unit_size = '';
      }
    } else {
      newProducts[index][field] = field === 'quantity' || field === 'rate' ? parseFloat(value) || 0 : value;
    }
    
    // Calculate row total
    newProducts[index].total = newProducts[index].quantity * newProducts[index].rate;
    
    // Calculate grand total and pending amount
    const grandTotal = newProducts.reduce((sum, p) => sum + p.total, 0);
    const pendingAmount = grandTotal - procurementForm.paid_amount;
    
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

  const handleFarmerSelect = (farmer) => {
    setProcurementForm({
      ...procurementForm,
      farmer_id: farmer.id,
      farmer_name: farmer.name
    });
  };

  const handleProductSelect = (index, product) => {
    const newProducts = [...procurementForm.products];
    newProducts[index] = {
      ...newProducts[index],
      product_id: product.id,
      product_name: product.name,
      unit: product.unit || 'Kg',
      rate: product.price_per_kg || 0
    };
    
    // Calculate row total
    newProducts[index].total = newProducts[index].quantity * newProducts[index].rate;
    
    // Calculate grand total
    const grandTotal = newProducts.reduce((sum, p) => sum + p.total, 0);
    const pendingAmount = grandTotal - procurementForm.paid_amount;
    
    setProcurementForm({
      ...procurementForm,
      products: newProducts,
      total_amount: grandTotal,
      pending_amount: pendingAmount
    });
  };

  const handleSubmitProcurement = async (e) => {
    e.preventDefault();
    
    if (!procurementForm.farmer_id) {
      toast.error('Please select a farmer');
      return;
    }
    
    if (procurementForm.products.length === 0 || !procurementForm.products[0].product_id) {
      toast.error('Please add at least one product');
      return;
    }
    
    // Validate bunches have unit_size
    const invalidBunches = procurementForm.products.filter(p => p.unit === 'Bunch' && !p.unit_size);
    if (invalidBunches.length > 0) {
      toast.error('Please specify bunch size for all bunch items');
      return;
    }
    
    try {
      const payload = {
        date: new Date(procurementForm.date).toISOString(),
        farmer_id: procurementForm.farmer_id,
        farmer_name: procurementForm.farmer_name,
        products: procurementForm.products.filter(p => p.product_id),
        total_amount: procurementForm.total_amount,
        paid_amount: procurementForm.paid_amount,
        pending_amount: procurementForm.pending_amount,
        payment_status: procurementForm.payment_status,
        status: 'completed',
        remark: procurementForm.remark || ''
      };
      
      if (editMode && selectedProcurement?.id) {
        // Update existing procurement
        await api.put(`/api/procurement/${selectedProcurement.id}`, payload);
        toast.success('Procurement updated successfully!');
      } else {
        // Create new procurement
        await api.post('/api/procurement', payload);
        
        // If payment was made, record it
        if (procurementForm.paid_amount > 0) {
          await api.post('/api/payments', {
            date: new Date().toISOString(),
            party_type: 'farmer',
            party_id: procurementForm.farmer_id,
            party_name: procurementForm.farmer_name,
            amount: procurementForm.paid_amount,
            payment_mode: 'cash',
            reference: `Procurement payment - ${new Date().toLocaleDateString()}`
          });
        }
        
        toast.success('Procurement recorded successfully! Inventory updated.');
      }
      
      setOpenProcurement(false);
      setEditMode(false);
      setSelectedProcurement(null);
      setProcurementForm({
        date: new Date().toISOString().split('T')[0],
        farmer_id: '',
        farmer_name: '',
        products: [{ product_id: '', product_name: '', quantity: 0, unit: 'Kg', unit_size: '', rate: 0, total: 0 }],
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
    setProcurementForm({
      date: procurement.date.split('T')[0],
      farmer_id: procurement.farmer_id,
      farmer_name: procurement.farmer_name,
      products: procurement.products,
      total_amount: procurement.total_amount,
      paid_amount: procurement.paid_amount || 0,
      pending_amount: procurement.pending_amount || 0,
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
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editMode ? t('procurement.editPurchase') : t('procurement.recordPurchase')}</DialogTitle>
            </DialogHeader>
            
            {/* Previous Day Procurements Section - NEW DESIGN: Editable Table with Checkboxes */}
            {!editMode && previousDayProcurements.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-amber-800">
                      Yesterday's Purchases ({previousDayProcurements.reduce((sum, p) => sum + (p.products?.length || 0), 0)} items)
                    </h4>
                    <p className="text-sm text-amber-600">Select items to purchase today, edit quantities & rates, then save</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        // Select all items
                        const allItems = [];
                        previousDayProcurements.forEach(proc => {
                          proc.products?.forEach(p => {
                            allItems.push({
                              selected: true,
                              farmer_id: proc.farmer_id,
                              farmer_name: proc.farmer_name,
                              product_id: p.product_id,
                              product_name: p.product_name,
                              quantity: p.quantity || 0,
                              unit: p.unit || 'Kg',
                              unit_size: p.unit_size || '',
                              rate: p.rate || 0,
                              total: (p.quantity || 0) * (p.rate || 0)
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
                                      quantity: p.quantity || 0,
                                      unit: p.unit || 'Kg',
                                      unit_size: p.unit_size || '',
                                      rate: p.rate || 0,
                                      total: (p.quantity || 0) * (p.rate || 0)
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
                        <th className="p-2 text-center font-medium w-20">Rate</th>
                        <th className="p-2 text-right font-medium w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previousDayProcurements.map((proc, procIdx) => 
                        proc.products?.map((p, pIdx) => {
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
                                        quantity: p.quantity || 0,
                                        unit: p.unit || 'Kg',
                                        unit_size: p.unit_size || '',
                                        rate: p.rate || 0,
                                        total: (p.quantity || 0) * (p.rate || 0)
                                      }]);
                                    } else {
                                      setYesterdayItems(yesterdayItems.filter(i => !(i.farmer_id === proc.farmer_id && i.product_id === p.product_id)));
                                    }
                                  }}
                                  className="w-4 h-4"
                                />
                              </td>
                              <td className="p-2 text-sm">{proc.farmer_name}</td>
                              <td className="p-2 font-medium">{p.product_name}</td>
                              <td className="p-2">
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  value={item?.quantity ?? p.quantity ?? 0}
                                  onChange={(e) => {
                                    const newQty = parseFloat(e.target.value) || 0;
                                    const newTotal = newQty * (item?.rate ?? p.rate ?? 0);
                                    if (itemIndex >= 0) {
                                      const updated = [...yesterdayItems];
                                      updated[itemIndex] = { ...updated[itemIndex], quantity: newQty, total: newTotal };
                                      setYesterdayItems(updated);
                                    } else {
                                      setYesterdayItems([...yesterdayItems, {
                                        selected: true,
                                        farmer_id: proc.farmer_id,
                                        farmer_name: proc.farmer_name,
                                        product_id: p.product_id,
                                        product_name: p.product_name,
                                        quantity: newQty,
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
                  <div className="mt-3 flex items-center justify-between bg-amber-100 p-3 rounded">
                    <div>
                      <span className="font-medium text-amber-800">
                        {yesterdayItems.filter(i => i.selected).length} items selected
                      </span>
                      <span className="ml-3 text-amber-700">
                        Total: ₹{yesterdayItems.filter(i => i.selected).reduce((sum, i) => sum + (i.total || 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <Button
                      type="button"
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
                            quantity: item.quantity,
                            unit: item.unit,
                            unit_size: item.unit_size,
                            rate: item.rate,
                            total: item.total
                          });
                        });
                        
                        // Create procurements for each farmer
                        try {
                          for (const farmerId of Object.keys(byFarmer)) {
                            const farmerData = byFarmer[farmerId];
                            const totalAmount = farmerData.products.reduce((sum, p) => sum + (p.total || 0), 0);
                            
                            await api.post('/api/procurement', {
                              date: new Date(procurementForm.date).toISOString(),
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
                      Save Selected ({yesterdayItems.filter(i => i.selected).length} items)
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {/* Divider with "OR" */}
            {!editMode && previousDayProcurements.length > 0 && (
              <div className="flex items-center gap-4 my-4">
                <div className="flex-1 border-t border-gray-300"></div>
                <span className="text-sm text-gray-500 font-medium">OR add new purchase manually</span>
                <div className="flex-1 border-t border-gray-300"></div>
              </div>
            )}
            
            <form onSubmit={handleSubmitProcurement} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="proc-date">{t('procurement.date')} *</Label>
                  <Input
                    id="proc-date"
                    type="date"
                    data-testid="procurement-date-input"
                    value={procurementForm.date}
                    onChange={(e) => setProcurementForm({ ...procurementForm, date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <AutocompleteInput
                    label={t('procurement.selectFarmer')}
                    placeholder={t('procurement.selectFarmer')}
                    items={farmers}
                    displayKey="name"
                    secondaryKey="contact"
                    onSelect={handleFarmerSelect}
                    testId="procurement-farmer-autocomplete"
                    storageKey="recent_farmers"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">{t('procurement.products')}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddProductRow}
                    data-testid="add-product-row-button"
                  >
                    <Plus size={16} className="mr-1" />
                    {t('procurement.addProduct')}
                  </Button>
                </div>

                <div className="space-y-3">
                  {procurementForm.products.map((product, index) => (
                    <Card key={index} className="p-4">
                      <div className="grid grid-cols-1 gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <AutocompleteInput
                              label="Product *"
                              placeholder="Start typing product name..."
                              items={products}
                              displayKey="name"
                              secondaryKey="category"
                              onSelect={(product) => handleProductSelect(index, product)}
                              testId={`product-autocomplete-${index}`}
                              storageKey="recent_products"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit Type *</Label>
                            <Select
                              value={product.unit}
                              onValueChange={(value) => handleProductChange(index, 'unit', value)}
                            >
                              <SelectTrigger data-testid={`unit-select-${index}`}>
                                <SelectValue placeholder="Select unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {UNIT_TYPES.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>
                                    {u.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {product.unit === 'Bunch' && (
                            <div>
                              <Label className="text-xs">Bunch Size (e.g., 250g) *</Label>
                              <Input
                                type="text"
                                placeholder="250g"
                                data-testid={`bunch-size-input-${index}`}
                                value={product.unit_size || ''}
                                onChange={(e) => handleProductChange(index, 'unit_size', e.target.value)}
                              />
                              <p className="text-xs text-gray-500 mt-1">Custom: 350g, 480g, etc.</p>
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Quantity *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0"
                              data-testid={`quantity-input-${index}`}
                              value={product.quantity || ''}
                              onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{getRateLabel(product.unit)} *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0"
                              data-testid={`rate-input-${index}`}
                              value={product.rate || ''}
                              onChange={(e) => handleProductChange(index, 'rate', e.target.value)}
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-xs">Total</Label>
                              <Input
                                type="text"
                                value={`₹${product.total.toFixed(2)}`}
                                disabled
                                className="bg-gray-50"
                                data-testid={`total-display-${index}`}
                              />
                            </div>
                            {procurementForm.products.length > 1 && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveProductRow(index)}
                                data-testid={`remove-product-${index}`}
                              >
                                <Trash2 size={16} className="text-red-600" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                  <span className="text-lg font-semibold">{t('procurement.totalAmount')}:</span>
                  <span className="text-2xl font-bold text-[#14532D]" data-testid="grand-total">
                    ₹{procurementForm.total_amount.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg">
                  <div>
                    <Label htmlFor="paid-amount">{t('procurement.paidAmount')}</Label>
                    <Input
                      id="paid-amount"
                      type="number"
                      step="0.01"
                      placeholder="0"
                      data-testid="paid-amount-input"
                      value={procurementForm.paid_amount || ''}
                      onChange={(e) => handlePaidAmountChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t('procurement.pendingAmount')}</Label>
                    <Input
                      type="text"
                      value={`₹${procurementForm.pending_amount.toFixed(2)}`}
                      disabled
                      className="bg-white font-semibold"
                      data-testid="pending-amount-display"
                    />
                  </div>
                </div>

                {procurementForm.payment_status !== 'pending' && (
                  <div className="text-sm text-center">
                    <span className={`badge ${procurementForm.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                      {t('procurement.payment')}: {procurementForm.payment_status.toUpperCase()}
                    </span>
                  </div>
                )}

                <div>
                  <Label htmlFor="remark">{t('procurement.remark')} {t('procurement.optional')}</Label>
                  <Input
                    id="remark"
                    type="text"
                    placeholder={t('procurement.addNotes')}
                    data-testid="remark-input"
                    value={procurementForm.remark || ''}
                    onChange={(e) => setProcurementForm({ ...procurementForm, remark: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <CardHeader>
              <CardTitle className="text-lg">{t('procurement.purchaseHistory')}</CardTitle>
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
                                {p.product_name}: {p.quantity} {getUnitLabel(p.unit, p.unit_size)} @ ₹{p.rate}
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
                <Button variant="outline" size="sm" onClick={selectAllFarmers} data-testid="select-all-farmers">
                  <CheckSquare size={16} className="mr-2" />
                  Select All
                </Button>
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
            <CardHeader>
              <CardTitle className="text-lg">{t('procurement.farmers')} ({farmers.length})</CardTitle>
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
                        <div className="mt-1 space-y-1">
                          {template.products.slice(0, 2).map((p, i) => (
                            <p key={i} className="text-xs text-gray-600">
                              • {p.product_name}: {p.quantity} {p.unit}
                            </p>
                          ))}
                          {template.products.length > 2 && (
                            <p className="text-xs text-gray-500">+ {template.products.length - 2} more</p>
                          )}
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
