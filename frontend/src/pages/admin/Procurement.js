import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Trash2, UserPlus, DollarSign, Edit, Filter, Save, BookmarkPlus, IndianRupee } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import AutocompleteInput from '../../components/AutocompleteInput';

const UNIT_TYPES = [
  { value: 'Kg', label: 'Kg (Kilogram)' },
  { value: 'Bunch', label: 'Bunch' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Pack', label: 'Pack' }
];

export default function Procurement() {
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
  
  // Filters
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
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
    payment_status: 'pending'
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
    address: ''
  });

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

  const loadTemplates = () => {
    const saved = localStorage.getItem('procurement_templates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading templates:', e);
      }
    }
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
        status: 'completed'
      };
      
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
      setOpenProcurement(false);
      setProcurementForm({
        date: new Date().toISOString().split('T')[0],
        farmer_id: '',
        farmer_name: '',
        products: [{ product_id: '', product_name: '', quantity: 0, unit: 'Kg', unit_size: '', rate: 0, total: 0 }],
        total_amount: 0,
        paid_amount: 0,
        pending_amount: 0,
        payment_status: 'pending'
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
      setFarmerForm({ name: '', contact: '', address: '' });
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
      payment_status: procurement.payment_status || 'pending'
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
  const handleSaveAsTemplate = () => {
    if (!procurementForm.farmer_name || procurementForm.products.length === 0 || !procurementForm.products[0].product_id) {
      toast.error('Please fill in farmer and at least one product to save as template');
      return;
    }

    const templateName = prompt('Enter template name (e.g., "Weekly Order - Ramesh"):');
    if (!templateName) return;

    const template = {
      id: Date.now().toString(),
      name: templateName,
      farmer_id: procurementForm.farmer_id,
      farmer_name: procurementForm.farmer_name,
      products: procurementForm.products.filter(p => p.product_id),
      created_at: new Date().toISOString()
    };

    const updatedTemplates = [...templates, template];
    setTemplates(updatedTemplates);
    localStorage.setItem('procurement_templates', JSON.stringify(updatedTemplates));
    
    toast.success(`Template "${templateName}" saved successfully!`);
  };

  // Load template
  const handleLoadTemplate = (template) => {
    setProcurementForm({
      ...procurementForm,
      farmer_id: template.farmer_id,
      farmer_name: template.farmer_name,
      products: template.products.map(p => ({ ...p, total: p.quantity * p.rate })),
      total_amount: template.products.reduce((sum, p) => sum + (p.quantity * p.rate), 0),
      pending_amount: template.products.reduce((sum, p) => sum + (p.quantity * p.rate), 0)
    });
    setOpenTemplate(false);
    setOpenProcurement(true);
    toast.success('Template loaded! You can now adjust quantities and rates.');
  };

  // Delete template
  const handleDeleteTemplate = (templateId) => {
    if (!window.confirm('Delete this template?')) return;
    
    const updatedTemplates = templates.filter(t => t.id !== templateId);
    setTemplates(updatedTemplates);
    localStorage.setItem('procurement_templates', JSON.stringify(updatedTemplates));
    toast.success('Template deleted');
  };

  // Farmer edit/delete
  const handleEditFarmer = (farmer) => {
    setFarmerForm({
      name: farmer.name,
      contact: farmer.contact,
      address: farmer.address || ''
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

  return (
    <Layout title="Daily Procurement">
      <div className="mb-6 flex flex-col sm:flex-row gap-3 flex-wrap">
        <Dialog open={openFarmer} onOpenChange={setOpenFarmer}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="add-farmer-button">
              <UserPlus size={16} className="mr-2" />
              Add Farmer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{selectedProcurement?.isFarmerEdit ? 'Edit Farmer' : 'Add New Farmer'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitFarmer} className="space-y-4">
              <div>
                <Label htmlFor="farmer-name">Farmer Name *</Label>
                <Input
                  id="farmer-name"
                  data-testid="farmer-name-input"
                  placeholder="Enter farmer name"
                  value={farmerForm.name}
                  onChange={(e) => setFarmerForm({ ...farmerForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="farmer-contact">Contact Number *</Label>
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
                <Label htmlFor="farmer-address">Address</Label>
                <Input
                  id="farmer-address"
                  data-testid="farmer-address-input"
                  placeholder="Village, District"
                  value={farmerForm.address}
                  onChange={(e) => setFarmerForm({ ...farmerForm, address: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-farmer-button">
                Add Farmer
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={openProcurement} onOpenChange={setOpenProcurement}>
          <DialogTrigger asChild>
            <Button className="bg-[#14532D] hover:bg-[#166534]" data-testid="add-procurement-button">
              <Plus size={16} className="mr-2" />
              Record Purchase
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Daily Purchase</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitProcurement} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="proc-date">Purchase Date *</Label>
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
                    label="Select Farmer *"
                    placeholder="Start typing farmer name..."
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
                  <Label className="text-base font-semibold">Products Purchased</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddProductRow}
                    data-testid="add-product-row-button"
                  >
                    <Plus size={16} className="mr-1" />
                    Add Product
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
                  <span className="text-lg font-semibold">Grand Total:</span>
                  <span className="text-2xl font-bold text-[#14532D]" data-testid="grand-total">
                    ₹{procurementForm.total_amount.toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-blue-50 p-4 rounded-lg">
                  <div>
                    <Label htmlFor="paid-amount">Amount Paid Now</Label>
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
                    <Label>Pending Amount</Label>
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
                      Payment Status: {procurementForm.payment_status.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={handleSaveAsTemplate}
                  data-testid="save-template-button"
                >
                  <BookmarkPlus size={16} className="mr-2" />
                  Save as Template
                </Button>
                <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-procurement-button">
                  {editMode ? 'Update Purchase' : 'Record Purchase & Update Stock'}
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
                <p className="text-sm text-gray-600">Total Farmers</p>
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
                <p className="text-sm text-gray-600">Total Purchases</p>
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
                <p className="text-sm text-gray-600">Pending to Farmers</p>
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
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="history">Purchase History</TabsTrigger>
          <TabsTrigger value="farmers">Farmers</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-6">
          {/* Filter Panel */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter size={18} />
                  Filters
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters-button">
                  Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="filter-from-date" className="text-xs">From Date</Label>
                  <Input
                    id="filter-from-date"
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                    data-testid="filter-from-date"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-to-date" className="text-xs">To Date</Label>
                  <Input
                    id="filter-to-date"
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                    data-testid="filter-to-date"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-farmer" className="text-xs">Farmer Name</Label>
                  <Input
                    id="filter-farmer"
                    type="text"
                    placeholder="Search farmer..."
                    value={filters.farmerName}
                    onChange={(e) => setFilters({ ...filters, farmerName: e.target.value })}
                    data-testid="filter-farmer-name"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-product" className="text-xs">Product Name</Label>
                  <Input
                    id="filter-product"
                    type="text"
                    placeholder="Search product..."
                    value={filters.productName}
                    onChange={(e) => setFilters({ ...filters, productName: e.target.value })}
                    data-testid="filter-product-name"
                  />
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-600">
                Showing {filteredProcurements.length} of {procurements.length} purchases
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Purchase History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>FARMER</th>
                      <th>PRODUCTS</th>
                      <th className="text-right">TOTAL</th>
                      <th className="text-right">PAID</th>
                      <th className="text-right">PENDING</th>
                      <th>PAYMENT</th>
                      <th className="text-center">ACTION</th>
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
                              title="Edit"
                            >
                              <Edit size={14} className="text-blue-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(proc.id)}
                              data-testid={`delete-procurement-${proc.id}`}
                              title="Delete"
                            >
                              <Trash2 size={14} className="text-red-600" />
                            </Button>
                            {(proc.pending_amount || 0) > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRecordPayment(proc)}
                                data-testid={`pay-farmer-${proc.id}`}
                                title="Record Payment"
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
                      ? 'No procurement records found. Record your first purchase to get started.'
                      : 'No purchases match your filters. Try adjusting the filters.'}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="farmers" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Registered Farmers ({farmers.length})</CardTitle>
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
    </Layout>
  );
}
