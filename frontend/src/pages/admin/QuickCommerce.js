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
import { Plus, Trash2, Edit, Package, Truck, ClipboardCheck, UserPlus } from 'lucide-react';
import AutocompleteInput from '../../components/AutocompleteInput';

export default function QuickCommerce() {
  const { t } = useTranslation();
  
  // Data states
  const [indents, setIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [grns, setGrns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [openIndent, setOpenIndent] = useState(false);
  const [openCustomer, setOpenCustomer] = useState(false);
  const [editingIndent, setEditingIndent] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);

  // Form states
  const [indentForm, setIndentForm] = useState({
    indent_date: new Date().toISOString().split('T')[0],
    customer_name: '',
    items: [{ product_id: '', product_name: '', product_unit: '', packaging: '', required_qty: '', lot_size: '', no_of_crates: 0 }]
  });

  const [customerForm, setCustomerForm] = useState({
    name: '',
    contact_person: '',
    contact_number: '',
    address: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [indentsRes, dispatchesRes, grnsRes, customersRes, productsRes] = await Promise.all([
        api.get('/api/qc-indents'),
        api.get('/api/qc-dispatches'),
        api.get('/api/qc-grns'),
        api.get('/api/qc-customers'),
        api.get('/api/products')
      ]);
      setIndents(indentsRes.data);
      setDispatches(dispatchesRes.data);
      setGrns(grnsRes.data);
      setCustomers(customersRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Indent handlers
  const handleAddIndentItem = () => {
    setIndentForm({
      ...indentForm,
      items: [...indentForm.items, { product_id: '', product_name: '', product_unit: '', packaging: '', required_qty: '', lot_size: '', no_of_crates: 0 }]
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
    newItems[index].product_unit = product.unit;
    setIndentForm({ ...indentForm, items: newItems });
  };

  const handleCustomerSelect = (customer) => {
    setIndentForm({ ...indentForm, customer_name: customer.name });
  };

  // Get stored packaging variants from localStorage
  const getStoredPackagingVariants = () => {
    try {
      const stored = localStorage.getItem('packaging_variants');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error reading packaging variants:', e);
    }
    // Default common variants
    return [
      { name: '100gm without roots' },
      { name: '100gm with roots' },
      { name: '250gm without roots' },
      { name: '250gm with roots' },
      { name: '500gm pack' },
      { name: '1kg pack' }
    ];
  };

  // Save new packaging variant to localStorage
  const savePackagingVariant = (variant) => {
    if (!variant || variant.trim() === '') return;
    
    try {
      const stored = getStoredPackagingVariants();
      const exists = stored.some(v => v.name.toLowerCase() === variant.toLowerCase());
      if (!exists) {
        const updated = [...stored, { name: variant }];
        localStorage.setItem('packaging_variants', JSON.stringify(updated));
      }
    } catch (e) {
      console.error('Error saving packaging variant:', e);
    }
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
      const payload = {
        indent_date: new Date(indentForm.indent_date).toISOString(),
        customer_name: indentForm.customer_name,
        items: validItems.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_unit: item.product_unit,
          packaging: item.packaging || '',
          required_qty: parseFloat(item.required_qty),
          lot_size: parseInt(item.lot_size),
          no_of_crates: item.no_of_crates
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
        packaging: item.packaging || ''
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
      indent_date: new Date().toISOString().split('T')[0],
      customer_name: '',
      items: [{ product_id: '', product_name: '', product_unit: '', packaging: '', required_qty: '', lot_size: '', no_of_crates: 0 }]
    });
  };

  // Customer handlers
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

  // Stats
  const pendingIndents = indents.filter(i => i.status === 'pending').length;
  const dispatchedCount = dispatches.length;
  const completedGrns = grns.length;

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
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="indent">Indent</TabsTrigger>
          <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
          <TabsTrigger value="grn">GRN</TabsTrigger>
          <TabsTrigger value="customers">Customers ({customers.length})</TabsTrigger>
        </TabsList>

        {/* INDENT TAB */}
        <TabsContent value="indent" className="mt-6">
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
                                placeholder="e.g., 100gm without roots, 250gm with roots"
                                items={getStoredPackagingVariants()}
                                displayKey="name"
                                onSelect={(variant) => handleIndentItemChange(index, 'packaging', variant.name)}
                                onInputChange={(value) => handleIndentItemChange(index, 'packaging', value)}
                                testId={`item-packaging-${index}`}
                                storageKey="recent_packaging_variants"
                                allowCustom={true}
                              />
                            </div>
                          </div>
                          {/* Row 2: Unit, Qty, Lot Size, Crates */}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                            <div>
                              <Label className="text-sm font-medium">Unit</Label>
                              <Input
                                value={item.product_unit}
                                placeholder="Kg / Pkt / gm"
                                onChange={(e) => handleIndentItemChange(index, 'product_unit', e.target.value)}
                                className="h-10"
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
              <CardTitle className="text-lg">Indent Orders</CardTitle>
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
                      <th className="text-right">CRATES</th>
                      <th>STATUS</th>
                      <th className="text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indents.map((indent) => {
                      // Calculate row span for items
                      const itemCount = indent.items?.length || 1;
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
                              {item.packaging && (
                                <span className="text-gray-500 text-xs ml-1">({item.packaging})</span>
                              )}
                            </div>
                          </td>
                          <td className="text-sm">{item.product_unit}</td>
                          <td className="text-right font-semibold">{item.required_qty}</td>
                          <td className="text-right text-green-700 font-semibold">{item.no_of_crates}</td>
                          {itemIndex === 0 && (
                            <>
                              <td rowSpan={itemCount} className="align-top">
                                <span className={`badge ${
                                  indent.status === 'completed' ? 'badge-success' : 
                                  indent.status === 'dispatched' ? 'badge-warning' : 'badge-error'
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
                                    disabled={indent.status !== 'pending'}
                                  >
                                    <Edit size={14} className="text-blue-600" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteIndent(indent.id)}
                                    data-testid={`delete-indent-${indent.id}`}
                                    disabled={indent.status !== 'pending'}
                                  >
                                    <Trash2 size={14} className="text-red-600" />
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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dispatch Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-8 text-center text-gray-500">
                <Truck size={48} className="mx-auto text-gray-400 mb-4" />
                <p>Dispatch functionality coming soon.</p>
                <p className="text-sm mt-2">Create indents first, then dispatch them to customers.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GRN TAB */}
        <TabsContent value="grn" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Goods Receipt Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-8 text-center text-gray-500">
                <ClipboardCheck size={48} className="mx-auto text-gray-400 mb-4" />
                <p>GRN functionality coming soon.</p>
                <p className="text-sm mt-2">After dispatch, record what was accepted by the customer.</p>
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
    </Layout>
  );
}
