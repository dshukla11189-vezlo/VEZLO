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
import { Plus, Trash2, Edit, Package, Truck, ClipboardCheck, UserPlus, Filter, Box, Download, FileSpreadsheet, FileText } from 'lucide-react';
import AutocompleteInput from '../../components/AutocompleteInput';

export default function QuickCommerce() {
  const { t } = useTranslation();
  
  // Data states
  const [indents, setIndents] = useState([]);
  const [filteredIndents, setFilteredIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [grns, setGrns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingVariants, setPackagingVariants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [openIndent, setOpenIndent] = useState(false);
  const [openCustomer, setOpenCustomer] = useState(false);
  const [openPackaging, setOpenPackaging] = useState(false);
  const [editingIndent, setEditingIndent] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingPackaging, setEditingPackaging] = useState(null);

  // Filter states
  const [indentFilters, setIndentFilters] = useState({
    fromDate: '',
    toDate: '',
    customerName: '',
    productName: ''
  });

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

  // Load packaging variants from localStorage
  const loadPackagingVariants = () => {
    try {
      const stored = localStorage.getItem('qc_packaging_variants');
      if (stored) {
        setPackagingVariants(JSON.parse(stored));
      } else {
        // Default packaging variants
        const defaults = [
          { id: '1', name: 'Packet 100 gm', weight_gm: 100 },
          { id: '2', name: 'Packet 250 gm', weight_gm: 250 },
          { id: '3', name: 'Without Roots 90-100 gm', weight_gm: 110 },
          { id: '4', name: 'With Roots 100 gm', weight_gm: 120 },
          { id: '5', name: 'Bunch 500 gm', weight_gm: 500 }
        ];
        setPackagingVariants(defaults);
        localStorage.setItem('qc_packaging_variants', JSON.stringify(defaults));
      }
    } catch (e) {
      console.error('Error loading packaging variants:', e);
    }
  };

  // Save packaging variants to localStorage
  const savePackagingVariants = (variants) => {
    localStorage.setItem('qc_packaging_variants', JSON.stringify(variants));
    setPackagingVariants(variants);
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
    setIndentFilters({ fromDate: '', toDate: '', customerName: '', productName: '' });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Export functions
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

  // Indent handlers
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
    // Don't override unit here - let packaging selection set it
    setIndentForm({ ...indentForm, items: newItems });
  };

  // Handle packaging selection - auto-fill unit
  const handlePackagingSelect = (index, packaging) => {
    const newItems = [...indentForm.items];
    newItems[index].packaging_id = packaging.id;
    newItems[index].packaging_name = packaging.name;
    newItems[index].product_unit = `${packaging.weight_gm} gm`;  // Auto-set unit from packaging weight
    setIndentForm({ ...indentForm, items: newItems });
  };

  const handleCustomerSelect = (customer) => {
    setIndentForm({ ...indentForm, customer_name: customer.name });
  };

  // Packaging management handlers
  const handleSubmitPackaging = (e) => {
    e.preventDefault();
    
    if (!packagingForm.name || !packagingForm.weight_gm) {
      toast.error('Please fill in all fields');
      return;
    }

    const newPackaging = {
      id: editingPackaging?.id || Date.now().toString(),
      name: packagingForm.name,
      weight_gm: parseFloat(packagingForm.weight_gm)
    };

    let updatedVariants;
    if (editingPackaging) {
      updatedVariants = packagingVariants.map(p => p.id === editingPackaging.id ? newPackaging : p);
      toast.success('Packaging updated successfully');
    } else {
      updatedVariants = [...packagingVariants, newPackaging];
      toast.success('Packaging added successfully');
    }

    savePackagingVariants(updatedVariants);
    resetPackagingForm();
    setOpenPackaging(false);
  };

  const handleEditPackaging = (packaging) => {
    setEditingPackaging(packaging);
    setPackagingForm({
      name: packaging.name,
      weight_gm: packaging.weight_gm.toString()
    });
    setOpenPackaging(true);
  };

  const handleDeletePackaging = (packagingId) => {
    if (!window.confirm('Are you sure you want to delete this packaging?')) return;
    
    const updatedVariants = packagingVariants.filter(p => p.id !== packagingId);
    savePackagingVariants(updatedVariants);
    toast.success('Packaging deleted successfully');
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
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="indent">Indent</TabsTrigger>
          <TabsTrigger value="dispatch">Dispatch</TabsTrigger>
          <TabsTrigger value="grn">GRN</TabsTrigger>
          <TabsTrigger value="packaging">Packaging ({packagingVariants.length})</TabsTrigger>
          <TabsTrigger value="customers">Customers ({customers.length})</TabsTrigger>
        </TabsList>

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
              <CardTitle className="text-lg">Indent Orders ({filteredIndents.length})</CardTitle>
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
    </Layout>
  );
}
