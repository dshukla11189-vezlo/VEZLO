import React, { useEffect, useState, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Plus, Edit, Trash, Search } from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await api.get('/api/products');
      setProducts(response.data);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

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

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      await api.delete(`/api/products/${id}`);
      toast.success('Product deleted successfully');
      loadProducts();
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  return (
    <Layout title="Products">
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
                  <Input
                    id="unit"
                    data-testid="product-unit-input"
                    placeholder="Kg, Bunch, Packet"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    required
                  />
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
                      onClick={() => handleDelete(product.id)}
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
    </Layout>
  );
}