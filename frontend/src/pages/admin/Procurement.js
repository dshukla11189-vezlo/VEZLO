import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export default function Procurement() {
  const [procurements, setProcurements] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openProcurement, setOpenProcurement] = useState(false);
  const [openFarmer, setOpenFarmer] = useState(false);

  // Procurement form
  const [procurementForm, setProcurementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    farmer_id: '',
    farmer_name: '',
    products: [{ product_id: '', product_name: '', quantity: 0, unit: '', rate: 0, total: 0 }],
    total_amount: 0
  });

  // Farmer form
  const [farmerForm, setFarmerForm] = useState({
    name: '',
    contact: '',
    address: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [procRes, farmRes, prodRes] = await Promise.all([
        api.get('/api/procurement'),
        api.get('/api/farmers'),
        api.get('/api/products')
      ]);
      setProcurements(procRes.data);
      setFarmers(farmRes.data);
      setProducts(prodRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProductRow = () => {
    setProcurementForm({
      ...procurementForm,
      products: [...procurementForm.products, { product_id: '', product_name: '', quantity: 0, unit: '', rate: 0, total: 0 }]
    });
  };

  const handleRemoveProductRow = (index) => {
    const newProducts = procurementForm.products.filter((_, i) => i !== index);
    const newTotal = newProducts.reduce((sum, p) => sum + p.total, 0);
    setProcurementForm({
      ...procurementForm,
      products: newProducts,
      total_amount: newTotal
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
          unit: selectedProduct.unit,
          rate: selectedProduct.price_per_kg || 0
        };
      }
    } else {
      newProducts[index][field] = field === 'quantity' || field === 'rate' ? parseFloat(value) || 0 : value;
    }
    
    // Calculate row total
    newProducts[index].total = newProducts[index].quantity * newProducts[index].rate;
    
    // Calculate grand total
    const grandTotal = newProducts.reduce((sum, p) => sum + p.total, 0);
    
    setProcurementForm({
      ...procurementForm,
      products: newProducts,
      total_amount: grandTotal
    });
  };

  const handleFarmerSelect = (farmerId) => {
    const selectedFarmer = farmers.find(f => f.id === farmerId);
    if (selectedFarmer) {
      setProcurementForm({
        ...procurementForm,
        farmer_id: farmerId,
        farmer_name: selectedFarmer.name
      });
    }
  };

  const handleSubmitProcurement = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!procurementForm.farmer_id) {
      toast.error('Please select a farmer');
      return;
    }
    
    if (procurementForm.products.length === 0 || !procurementForm.products[0].product_id) {
      toast.error('Please add at least one product');
      return;
    }
    
    try {
      const payload = {
        date: new Date(procurementForm.date).toISOString(),
        farmer_id: procurementForm.farmer_id,
        farmer_name: procurementForm.farmer_name,
        products: procurementForm.products.filter(p => p.product_id),
        total_amount: procurementForm.total_amount,
        status: 'completed'
      };
      
      await api.post('/api/procurement', payload);
      toast.success('Procurement recorded successfully! Inventory updated.');
      setOpenProcurement(false);
      setProcurementForm({
        date: new Date().toISOString().split('T')[0],
        farmer_id: '',
        farmer_name: '',
        products: [{ product_id: '', product_name: '', quantity: 0, unit: '', rate: 0, total: 0 }],
        total_amount: 0
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record procurement');
    }
  };

  const handleSubmitFarmer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/farmers', farmerForm);
      toast.success('Farmer added successfully');
      setOpenFarmer(false);
      setFarmerForm({ name: '', contact: '', address: '' });
      loadData();
    } catch (error) {
      toast.error('Failed to add farmer');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Daily Procurement">
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <Dialog open={openFarmer} onOpenChange={setOpenFarmer}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="add-farmer-button">
              <UserPlus size={16} className="mr-2" />
              Add Farmer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Farmer</DialogTitle>
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
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
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
                  <Label htmlFor="proc-farmer">Select Farmer *</Label>
                  <Select value={procurementForm.farmer_id} onValueChange={handleFarmerSelect}>
                    <SelectTrigger data-testid="procurement-farmer-select">
                      <SelectValue placeholder="Choose farmer" />
                    </SelectTrigger>
                    <SelectContent>
                      {farmers.map((farmer) => (
                        <SelectItem key={farmer.id} value={farmer.id}>
                          {farmer.name} - {farmer.contact}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                        <div className="lg:col-span-2">
                          <Label className="text-xs">Product *</Label>
                          <Select
                            value={product.product_id}
                            onValueChange={(value) => handleProductChange(index, 'product_id', value)}
                          >
                            <SelectTrigger data-testid={`product-select-${index}`}>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({p.category})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
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
                          <Label className="text-xs">Rate (₹/{product.unit || 'unit'}) *</Label>
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
                    </Card>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                <span className="text-lg font-semibold">Grand Total:</span>
                <span className="text-2xl font-bold text-[#14532D]" data-testid="grand-total">
                  ₹{procurementForm.total_amount.toFixed(2)}
                </span>
              </div>

              <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="submit-procurement-button">
                Record Purchase & Update Stock
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Farmers List */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Registered Farmers ({farmers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {farmers.slice(0, 6).map((farmer) => (
              <div key={farmer.id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow" data-testid={`farmer-card-${farmer.id}`}>
                <p className="font-semibold text-gray-900">{farmer.name}</p>
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

      {/* Procurement History */}
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
                  <th className="text-right">TOTAL AMOUNT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {procurements.map((proc) => (
                  <tr key={proc.id} data-testid={`procurement-row-${proc.id}`}>
                    <td>{formatDate(proc.date)}</td>
                    <td className="font-medium">{proc.farmer_name}</td>
                    <td>
                      <div className="space-y-1">
                        {proc.products?.map((p, i) => (
                          <div key={i} className="text-xs">
                            {p.product_name}: {p.quantity} {p.unit} @ ₹{p.rate}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="text-right font-semibold">₹{proc.total_amount?.toFixed(2)}</td>
                    <td>
                      <span className="badge badge-success">{proc.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {procurements.length === 0 && !loading && (
              <div className="p-8 text-center text-gray-500">
                No procurement records found. Record your first purchase to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
