import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Plus, Edit, Trash, Search, AlertTriangle, ArrowRight, Package, Ruler, Box } from 'lucide-react';

export default function Products() {
  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState('products'); // 'products', 'units', or 'packaging'
  
  // Products state
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Units state
  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [showUnitDialog, setShowUnitDialog] = useState(false);
  const [editUnit, setEditUnit] = useState(null);
  const [unitForm, setUnitForm] = useState({ name: '', symbol: '', description: '' });
  
  // Packaging state
  const [packagingVariants, setPackagingVariants] = useState([]);
  const [packagingLoading, setPackagingLoading] = useState(false);
  const [showPackagingDialog, setShowPackagingDialog] = useState(false);
  const [editingPackaging, setEditingPackaging] = useState(null);
  const [packagingForm, setPackagingForm] = useState({ name: '', weight_gm: '' });
  
  // Delete with replacement state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [dependencies, setDependencies] = useState(null);
  const [replacementProductId, setReplacementProductId] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: 'Kg',
    current_stock: 0,
    price_per_kg: 0,
    price_per_packet: 0,
    lifecycle_duration: '',  // 'low', 'medium', 'high'
    cost_alias_product_id: ''  // For P&L: use this product's purchase cost
  });

  // Load products
  const loadProducts = useCallback(async () => {
    try {
      const response = await api.get('/api/products');
      setProducts(response.data);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load units
  const loadUnits = useCallback(async () => {
    setUnitsLoading(true);
    try {
      const response = await api.get('/api/units');
      setUnits(response.data);
    } catch (error) {
      console.error('Failed to load units:', error);
      // If no units exist, seed defaults
      if (error.response?.status === 404 || (Array.isArray(error.response?.data) && error.response.data.length === 0)) {
        await seedDefaultUnits();
      }
    } finally {
      setUnitsLoading(false);
    }
  }, []);

  // Seed default units
  const seedDefaultUnits = async () => {
    try {
      await api.post('/api/units/seed-defaults');
      await loadUnits();
      toast.success('Default units created');
    } catch (error) {
      console.error('Failed to seed units:', error);
    }
  };

  // Load packaging variants
  const loadPackaging = useCallback(async () => {
    setPackagingLoading(true);
    try {
      const response = await api.get('/api/qc-packaging');
      setPackagingVariants(response.data);
    } catch (error) {
      console.error('Failed to load packaging:', error);
    } finally {
      setPackagingLoading(false);
    }
  }, []);

  // Packaging handlers
  const handleSubmitPackaging = async (e) => {
    e.preventDefault();
    if (!packagingForm.name || !packagingForm.weight_gm) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      if (editingPackaging) {
        await api.put(`/api/qc-packaging/${editingPackaging.id}`, {
          name: packagingForm.name,
          weight_gm: parseFloat(packagingForm.weight_gm)
        });
        toast.success('Packaging updated successfully');
      } else {
        await api.post(`/api/qc-packaging?name=${encodeURIComponent(packagingForm.name)}&weight_gm=${packagingForm.weight_gm}`);
        toast.success('Packaging added successfully');
      }
      resetPackagingForm();
      loadPackaging();
    } catch (error) {
      toast.error('Failed to save packaging');
    }
  };

  const handleEditPackaging = (pkg) => {
    setEditingPackaging(pkg);
    setPackagingForm({ name: pkg.name, weight_gm: pkg.weight_gm?.toString() || '' });
    setShowPackagingDialog(true);
  };

  const handleDeletePackaging = async (packagingId) => {
    if (!window.confirm('Are you sure you want to delete this packaging?')) return;
    try {
      await api.delete(`/api/qc-packaging/${packagingId}`);
      toast.success('Packaging deleted successfully');
      loadPackaging();
    } catch (error) {
      toast.error('Failed to delete packaging');
    }
  };

  const resetPackagingForm = () => {
    setPackagingForm({ name: '', weight_gm: '' });
    setEditingPackaging(null);
    setShowPackagingDialog(false);
  };

  useEffect(() => {
    loadProducts();
    loadUnits();
    loadPackaging();
  }, [loadProducts, loadUnits, loadPackaging]);

  // Sort products alphabetically and filter by search query
  const filteredProducts = useMemo(() => {
    let result = [...products];
    
    // Sort alphabetically by name (case-insensitive)
    result.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.category && p.category.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [products, searchQuery]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check for duplicate product name (case-insensitive)
    const normalizedName = formData.name.trim().toLowerCase();
    const duplicateProduct = products.find(p => 
      p.name.trim().toLowerCase() === normalizedName && 
      (!editProduct || p.id !== editProduct.id)
    );
    
    if (duplicateProduct) {
      toast.error(`Product "${formData.name}" already exists!`);
      return;
    }
    
    try {
      if (editProduct) {
        await api.put(`/api/products/${editProduct.id}`, formData);
        toast.success('Product updated successfully');
      } else {
        await api.post('/api/products', formData);
        toast.success('Product created successfully');
      }
      setOpen(false);
      setEditProduct(null);
      setFormData({ name: '', category: '', unit: 'Kg', current_stock: 0, price_per_kg: 0, price_per_packet: 0, lifecycle_duration: '', cost_alias_product_id: '' });
      loadProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save product');
    }
  };

  const handleEdit = (product) => {
    setEditProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      unit: product.unit,
      current_stock: product.current_stock,
      price_per_kg: product.price_per_kg || 0,
      price_per_packet: product.price_per_packet || 0,
      lifecycle_duration: product.lifecycle_duration || '',
      cost_alias_product_id: product.cost_alias_product_id || ''
    });
    setOpen(true);
  };

  // Initiate delete - first check for dependencies
  const handleDelete = async (product) => {
    setDeleteLoading(true);
    try {
      const response = await api.get(`/api/products/${product.id}/dependencies`);
      setProductToDelete(product);
      setDependencies(response.data);
      setReplacementProductId('');
      setShowDeleteDialog(true);
    } catch (error) {
      toast.error('Failed to check product dependencies');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Confirm delete - either simple delete or delete with replacement
  const confirmDelete = async () => {
    if (!productToDelete) return;
    
    setDeleteLoading(true);
    try {
      if (dependencies?.has_dependencies) {
        // Need replacement product
        if (!replacementProductId) {
          toast.error('Please select a replacement product');
          setDeleteLoading(false);
          return;
        }
        
        const response = await api.post(`/api/products/${productToDelete.id}/delete-with-replacement`, {
          replacement_product_id: replacementProductId
        });
        toast.success(response.data.message);
      } else {
        // No dependencies - simple delete
        await api.delete(`/api/products/${productToDelete.id}`);
        toast.success('Product deleted successfully');
      }
      
      setShowDeleteDialog(false);
      setProductToDelete(null);
      setDependencies(null);
      setReplacementProductId('');
      loadProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete product');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ==================== UNIT HANDLERS ====================
  const openUnitDialog = (unit = null) => {
    if (unit) {
      setEditUnit(unit);
      setUnitForm({ name: unit.name, symbol: unit.symbol, description: unit.description || '' });
    } else {
      setEditUnit(null);
      setUnitForm({ name: '', symbol: '', description: '' });
    }
    setShowUnitDialog(true);
  };

  const handleUnitSubmit = async (e) => {
    e.preventDefault();
    if (!unitForm.name.trim()) {
      toast.error('Unit name is required');
      return;
    }
    
    try {
      if (editUnit) {
        await api.put(`/api/units/${editUnit.id}`, unitForm);
        toast.success('Unit updated successfully');
      } else {
        await api.post('/api/units', unitForm);
        toast.success('Unit created successfully');
      }
      setShowUnitDialog(false);
      setEditUnit(null);
      setUnitForm({ name: '', symbol: '', description: '' });
      loadUnits();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save unit');
    }
  };

  const handleDeleteUnit = async (unit) => {
    if (!window.confirm(`Are you sure you want to delete "${unit.name}"?`)) return;
    
    try {
      await api.delete(`/api/units/${unit.id}`);
      toast.success(`Unit "${unit.name}" deleted`);
      loadUnits();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete unit');
    }
  };

  // Get count of products using each unit
  const getProductCountByUnit = (unitName) => {
    return products.filter(p => p.unit === unitName).length;
  };

  return (
    <Layout title="Products & Units">
      {/* Sub-tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveSubTab('products')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'products'
              ? 'border-green-600 text-green-700 bg-green-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Package size={16} />
          Products
          <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
            {products.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('units')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'units'
              ? 'border-blue-600 text-blue-700 bg-blue-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Ruler size={16} />
          Units
          <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
            {units.length}
          </span>
        </button>
        <button
          onClick={() => setActiveSubTab('packaging')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'packaging'
              ? 'border-purple-600 text-purple-700 bg-purple-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Box size={16} />
          Packaging
          <span className="ml-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
            {packagingVariants.length}
          </span>
        </button>
      </div>

      {/* ==================== PRODUCTS TAB ==================== */}
      {activeSubTab === 'products' && (
        <>
      <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search products by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
            data-testid="product-search-input"
          />
        </div>
        
        {/* Add Product Button */}
        <Dialog open={open} onOpenChange={(val) => {
          setOpen(val);
          if (!val) {
            setEditProduct(null);
            setFormData({ name: '', category: '', unit: 'Kg', current_stock: 0, price_per_kg: 0, price_per_packet: 0 });
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-[#14532D] hover:bg-[#166534]" data-testid="add-product-button">
              <Plus size={16} className="mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle data-testid="product-dialog-title">{editProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Product Name</Label>
                <Input
                  id="name"
                  data-testid="product-name-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    data-testid="product-category-input"
                    placeholder="e.g., Vegetables, Fruits"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <select
                    id="unit"
                    data-testid="product-unit-input"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    required
                  >
                    <option value="">Select Unit</option>
                    {units.map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="stock">Current Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    step="0.01"
                    data-testid="product-stock-input"
                    value={formData.current_stock}
                    onChange={(e) => setFormData({ ...formData, current_stock: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="price_kg">Price/Kg</Label>
                  <Input
                    id="price_kg"
                    type="number"
                    step="0.01"
                    data-testid="product-price-kg-input"
                    value={formData.price_per_kg}
                    onChange={(e) => setFormData({ ...formData, price_per_kg: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="price_packet">Price/Packet</Label>
                  <Input
                    id="price_packet"
                    type="number"
                    step="0.01"
                    data-testid="product-price-packet-input"
                    value={formData.price_per_packet}
                    onChange={(e) => setFormData({ ...formData, price_per_packet: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              {/* Lifecycle Duration Field */}
              <div>
                <Label htmlFor="lifecycle">Shelf Life / Lifecycle Duration</Label>
                <select
                  id="lifecycle"
                  value={formData.lifecycle_duration}
                  onChange={(e) => setFormData({ ...formData, lifecycle_duration: e.target.value })}
                  className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  data-testid="product-lifecycle-input"
                >
                  <option value="">Select Lifecycle</option>
                  <option value="low">Low (3 Days)</option>
                  <option value="medium">Medium (5 Days)</option>
                  <option value="high">High (7 Days)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">How long the product stays fresh - critical for retail invoicing</p>
              </div>
              {/* Cost Alias Field - For P&L calculation */}
              <div>
                <Label htmlFor="cost_alias">Cost Alias (For P&L)</Label>
                <select
                  id="cost_alias"
                  value={formData.cost_alias_product_id}
                  onChange={(e) => setFormData({ ...formData, cost_alias_product_id: e.target.value })}
                  className="w-full h-10 px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  data-testid="product-cost-alias-input"
                >
                  <option value="">No Alias (Use Own Cost)</option>
                  {products.filter(p => p.id !== editProduct?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Use another product's purchase cost for P&L (e.g., Spinach uses Palak's cost)</p>
              </div>
              <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="product-submit-button">
                {editProduct ? 'Update' : 'Create'} Product
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="data-table">
        {/* Results count */}
        <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-600">
          Showing {filteredProducts.length} of {products.length} products
          {searchQuery && <span className="ml-2 text-gray-500">(filtered by "{searchQuery}")</span>}
        </div>
        <table>
          <thead>
            <tr>
              <th>NAME</th>
              <th>CATEGORY</th>
              <th>UNIT</th>
              <th>LIFECYCLE</th>
              <th className="text-right">STOCK</th>
              <th className="text-right">PRICE/KG</th>
              <th className="text-right">PRICE/PACKET</th>
              <th className="text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.id} data-testid={`product-row-${product.id}`}>
                <td className="font-medium">{product.name}</td>
                <td>{product.category}</td>
                <td>{product.unit}</td>
                <td>
                  {product.lifecycle_duration ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      product.lifecycle_duration === 'low' ? 'bg-red-100 text-red-700' :
                      product.lifecycle_duration === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      product.lifecycle_duration === 'high' ? 'bg-green-100 text-green-700' : ''
                    }`}>
                      {product.lifecycle_duration === 'low' ? '3 Days' :
                       product.lifecycle_duration === 'medium' ? '5 Days' :
                       product.lifecycle_duration === 'high' ? '7 Days' : '-'}
                    </span>
                  ) : '-'}
                </td>
                <td className="text-right">{product.current_stock?.toFixed(2)}</td>
                <td className="text-right">₹{product.price_per_kg?.toFixed(2) || '-'}</td>
                <td className="text-right">₹{product.price_per_packet?.toFixed(2) || '-'}</td>
                <td>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEdit(product)}
                      data-testid={`edit-product-${product.id}`}
                    >
                      <Edit size={16} className="text-blue-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(product)}
                      data-testid={`delete-product-${product.id}`}
                    >
                      <Trash size={16} className="text-red-600" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            {searchQuery ? (
              <>No products found matching "{searchQuery}". Try a different search term.</>
            ) : (
              <>No products found. Add your first product to get started.</>
            )}
          </div>
        )}
      </div>

      {/* Delete Product Dialog */}
      {showDeleteDialog && productToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center gap-3 p-4 border-b bg-red-50">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">Delete Product</h3>
                <p className="text-sm text-red-600">"{productToDelete.name}"</p>
              </div>
            </div>
            
            <div className="p-4 space-y-4">
              {dependencies?.has_dependencies ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-sm text-amber-800 font-medium mb-2">
                      This product has existing records that need to be remapped:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {dependencies.dependencies.procurements > 0 && (
                        <div className="flex justify-between">
                          <span>Procurements:</span>
                          <span className="font-semibold">{dependencies.dependencies.procurements}</span>
                        </div>
                      )}
                      {dependencies.dependencies.qc_orders > 0 && (
                        <div className="flex justify-between">
                          <span>QC Orders:</span>
                          <span className="font-semibold">{dependencies.dependencies.qc_orders}</span>
                        </div>
                      )}
                      {dependencies.dependencies.indents > 0 && (
                        <div className="flex justify-between">
                          <span>Indents:</span>
                          <span className="font-semibold">{dependencies.dependencies.indents}</span>
                        </div>
                      )}
                      {dependencies.dependencies.dispatches > 0 && (
                        <div className="flex justify-between">
                          <span>Dispatches:</span>
                          <span className="font-semibold">{dependencies.dependencies.dispatches}</span>
                        </div>
                      )}
                      {dependencies.dependencies.invoices > 0 && (
                        <div className="flex justify-between">
                          <span>Invoices:</span>
                          <span className="font-semibold">{dependencies.dependencies.invoices}</span>
                        </div>
                      )}
                      {dependencies.dependencies.wastage > 0 && (
                        <div className="flex justify-between">
                          <span>Wastage Records:</span>
                          <span className="font-semibold">{dependencies.dependencies.wastage}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-amber-200 flex justify-between text-sm font-medium">
                      <span>Total Records:</span>
                      <span className="text-amber-800">{dependencies.dependencies.total}</span>
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">
                      Select Replacement Product <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-gray-500 mb-2">
                      All existing records will be remapped to this product
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0 px-3 py-2 bg-red-100 text-red-700 rounded text-sm font-medium">
                        {productToDelete.name}
                      </div>
                      <ArrowRight size={20} className="text-gray-400 flex-shrink-0" />
                      <select
                        value={replacementProductId}
                        onChange={(e) => setReplacementProductId(e.target.value)}
                        className="flex-1 h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                        required
                      >
                        <option value="">-- Select Replacement --</option>
                        {products
                          .filter(p => p.id !== productToDelete.id)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-800">
                    This product has no associated records. It can be safely deleted.
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 p-4 border-t bg-gray-50">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setProductToDelete(null);
                  setDependencies(null);
                  setReplacementProductId('');
                }}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={confirmDelete}
                disabled={deleteLoading || (dependencies?.has_dependencies && !replacementProductId)}
              >
                {deleteLoading ? 'Processing...' : dependencies?.has_dependencies ? 'Delete & Remap' : 'Delete Product'}
              </Button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* ==================== UNITS TAB ==================== */}
      {activeSubTab === 'units' && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">
                Manage the units of measurement used across products.
                {units.length === 0 && (
                  <Button 
                    variant="link" 
                    className="text-blue-600 p-0 h-auto ml-2"
                    onClick={seedDefaultUnits}
                  >
                    Click to add default units
                  </Button>
                )}
              </p>
            </div>
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => openUnitDialog()}
            >
              <Plus size={16} className="mr-2" />
              Add Unit
            </Button>
          </div>

          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>SYMBOL</th>
                  <th>DESCRIPTION</th>
                  <th className="text-center">PRODUCTS USING</th>
                  <th className="text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {unitsLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">Loading units...</td></tr>
                ) : units.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-gray-400">
                    No units found. Add your first unit or seed defaults.
                  </td></tr>
                ) : units.map(unit => {
                  const productCount = getProductCountByUnit(unit.name);
                  return (
                    <tr key={unit.id}>
                      <td className="font-medium">{unit.name}</td>
                      <td>
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {unit.symbol}
                        </span>
                      </td>
                      <td className="text-gray-500 text-sm">{unit.description || '-'}</td>
                      <td className="text-center">
                        {productCount > 0 ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            {productCount} products
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">Not used</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openUnitDialog(unit)}
                          >
                            <Edit size={16} className="text-blue-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteUnit(unit)}
                            disabled={productCount > 0}
                            title={productCount > 0 ? `Cannot delete: used by ${productCount} products` : 'Delete unit'}
                          >
                            <Trash size={16} className={productCount > 0 ? 'text-gray-300' : 'text-red-600'} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Unit Dialog */}
          {showUnitDialog && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-4 border-b bg-blue-50">
                  <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
                    <Ruler size={20} />
                    {editUnit ? 'Edit Unit' : 'Add New Unit'}
                  </h3>
                </div>
                <form onSubmit={handleUnitSubmit} className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="unit-name">Unit Name *</Label>
                    <Input
                      id="unit-name"
                      value={unitForm.name}
                      onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                      placeholder="e.g., Kilogram, Piece, Bunch"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="unit-symbol">Symbol / Abbreviation *</Label>
                    <Input
                      id="unit-symbol"
                      value={unitForm.symbol}
                      onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
                      placeholder="e.g., Kg, Pc, Bunch"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="unit-description">Description</Label>
                    <Input
                      id="unit-description"
                      value={unitForm.description}
                      onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => { setShowUnitDialog(false); setEditUnit(null); }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                      {editUnit ? 'Update Unit' : 'Create Unit'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== PACKAGING TAB ==================== */}
      {activeSubTab === 'packaging' && (
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Packaging / Variants</h2>
              <p className="text-sm text-gray-500">Manage packaging options used in dispatches and inventory.</p>
            </div>
            <Dialog open={showPackagingDialog} onOpenChange={(val) => { setShowPackagingDialog(val); if (!val) resetPackagingForm(); }}>
              <DialogTrigger asChild>
                <Button className="bg-purple-600 hover:bg-purple-700">
                  <Plus size={16} className="mr-2" />
                  Add Packaging
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingPackaging ? 'Edit Packaging' : 'Add New Packaging'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitPackaging} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="pkg-name">Packaging Name *</Label>
                    <Input
                      id="pkg-name"
                      value={packagingForm.name}
                      onChange={(e) => setPackagingForm({ ...packagingForm, name: e.target.value })}
                      placeholder="e.g., 250 gm, 500 ml, Pack (2 Pcs)"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="pkg-weight">Weight (gm) *</Label>
                    <Input
                      id="pkg-weight"
                      type="number"
                      value={packagingForm.weight_gm}
                      onChange={(e) => setPackagingForm({ ...packagingForm, weight_gm: e.target.value })}
                      placeholder="Weight in grams"
                      required
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" className="flex-1" onClick={resetPackagingForm}>
                      Cancel
                    </Button>
                    <Button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700">
                      {editingPackaging ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Packaging Table */}
          {packagingLoading ? (
            <div className="text-center py-8 text-gray-500">Loading packaging...</div>
          ) : packagingVariants.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border rounded-lg bg-gray-50">
              <Box size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="font-medium">No packaging variants found</p>
              <p className="text-sm">Add your first packaging variant to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Weight (gm)</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {packagingVariants
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(pkg => (
                      <tr key={pkg.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{pkg.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                            {pkg.weight_gm} gm
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditPackaging(pkg)}
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                            >
                              <Edit size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeletePackaging(pkg.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                            >
                              <Trash size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}