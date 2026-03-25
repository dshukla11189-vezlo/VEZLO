import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Plus, Edit, Trash } from 'lucide-react';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: 'Kg',
    current_stock: 0,
    price_per_kg: 0,
    price_per_packet: 0
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

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      setFormData({ name: '', category: '', unit: 'Kg', current_stock: 0, price_per_kg: 0, price_per_packet: 0 });
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
      price_per_packet: product.price_per_packet || 0
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
      <div className="mb-6 flex justify-end">
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
              <Button type="submit" className="w-full bg-[#14532D] hover:bg-[#166534]" data-testid="product-submit-button">
                {editProduct ? 'Update' : 'Create'} Product
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>NAME</th>
              <th>CATEGORY</th>
              <th>UNIT</th>
              <th className="text-right">STOCK</th>
              <th className="text-right">PRICE/KG</th>
              <th className="text-right">PRICE/PACKET</th>
              <th className="text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} data-testid={`product-row-${product.id}`}>
                <td className="font-medium">{product.name}</td>
                <td>{product.category}</td>
                <td>{product.unit}</td>
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
        {products.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            No products found. Add your first product to get started.
          </div>
        )}
      </div>
    </Layout>
  );
}