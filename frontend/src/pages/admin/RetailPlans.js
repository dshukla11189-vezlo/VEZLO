import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { 
  Plus, Edit2, Trash2, Search, Package, Users, ShoppingCart, 
  Save, X, Check, ChevronDown, ChevronRight, Boxes, Clock, Zap,
  UserPlus, UserMinus
} from 'lucide-react';

export default function RetailPlans() {
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Selected plan for editing
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [expandedPlans, setExpandedPlans] = useState({});
  
  // New plan dialog
  const [showNewPlanDialog, setShowNewPlanDialog] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  
  // Add product dialog
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [productQuantity, setProductQuantity] = useState(1);
  
  // Assign retailer dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [retailerSearch, setRetailerSearch] = useState('');
  const [selectedRetailerId, setSelectedRetailerId] = useState('');
  
  // Edit quantity
  const [editingProduct, setEditingProduct] = useState(null);
  const [editQuantity, setEditQuantity] = useState(1);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, productsRes, variantsRes, retailersRes] = await Promise.all([
        api.get('/api/retail-plans'),
        api.get('/api/products?include_images=false'),
        api.get('/api/qc-packaging'),
        api.get('/api/retail-plans/subscribed-retailers')
      ]);
      setPlans(plansRes.data);
      setProducts(productsRes.data);
      setVariants(variantsRes.data);
      setRetailers(retailersRes.data);
      
      // Auto-expand first plan
      if (plansRes.data.length > 0 && Object.keys(expandedPlans).length === 0) {
        setExpandedPlans({ [plansRes.data[0].id]: true });
        setSelectedPlan(plansRes.data[0]);
      }
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create new plan
  const handleCreatePlan = async () => {
    if (!newPlanName.trim()) {
      toast.error('Plan name is required');
      return;
    }
    
    try {
      await api.post('/api/retail-plans', {
        name: newPlanName,
        description: newPlanDescription
      });
      toast.success('Plan created successfully');
      setShowNewPlanDialog(false);
      setNewPlanName('');
      setNewPlanDescription('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create plan');
    }
  };

  // Delete plan
  const handleDeletePlan = async (planId) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    
    try {
      await api.delete(`/api/retail-plans/${planId}`);
      toast.success('Plan deleted successfully');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete plan');
    }
  };

  // Add product to plan
  const handleAddProduct = async () => {
    if (!selectedPlan || !selectedProduct || !selectedVariant) {
      toast.error('Please select product and variant');
      return;
    }
    
    try {
      await api.post(`/api/retail-plans/${selectedPlan.id}/products`, {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        variant_id: selectedVariant.id,
        variant_name: selectedVariant.name,
        quantity: productQuantity
      });
      toast.success('Product added to plan');
      setShowAddProductDialog(false);
      setSelectedProduct(null);
      setSelectedVariant(null);
      setProductQuantity(1);
      setProductSearch('');
      setVariantSearch('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add product');
    }
  };

  // Update product quantity
  const handleUpdateQuantity = async (planId, productId, variantId, newQty) => {
    try {
      await api.put(`/api/retail-plans/${planId}/products/${productId}/${variantId}`, {
        quantity: newQty
      });
      toast.success('Quantity updated');
      setEditingProduct(null);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update quantity');
    }
  };

  // Remove product from plan
  const handleRemoveProduct = async (planId, productId, variantId) => {
    try {
      await api.delete(`/api/retail-plans/${planId}/products/${productId}/${variantId}`);
      toast.success('Product removed from plan');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove product');
    }
  };

  // Assign plan to retailer
  const handleAssignPlan = async () => {
    if (!selectedPlan || !selectedRetailerId) {
      toast.error('Please select a retailer');
      return;
    }
    
    try {
      await api.post('/api/retail-plans/assign', {
        retailer_id: selectedRetailerId,
        plan_id: selectedPlan.id
      });
      toast.success('Plan assigned to retailer');
      setShowAssignDialog(false);
      setSelectedRetailerId('');
      setRetailerSearch('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign plan');
    }
  };

  // Unassign plan from retailer
  const handleUnassignPlan = async (retailerId) => {
    try {
      await api.delete(`/api/retail-plans/unassign/${retailerId}`);
      toast.success('Plan unassigned from retailer');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to unassign plan');
    }
  };

  // Generate orders
  const handleGenerateOrders = async (retailerIds = null) => {
    try {
      const res = await api.post('/api/retail-plans/generate-orders', {
        retailer_ids: retailerIds
      });
      toast.success(res.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate orders');
    }
  };

  // Filter products by search
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  // Filter variants by search
  const filteredVariants = variants.filter(v => 
    v.name?.toLowerCase().includes(variantSearch.toLowerCase())
  );

  // Get retailers subscribed to selected plan
  const planRetailers = selectedPlan 
    ? retailers.filter(r => r.subscribed_plan_id === selectedPlan.id)
    : [];

  // Retailers not subscribed to any plan (for assignment)
  const availableRetailers = retailers.filter(r => 
    !r.subscribed_plan_id && 
    (r.company_name?.toLowerCase().includes(retailerSearch.toLowerCase()) ||
     r.name?.toLowerCase().includes(retailerSearch.toLowerCase()))
  );

  const togglePlanExpand = (planId) => {
    setExpandedPlans(prev => ({ ...prev, [planId]: !prev[planId] }));
    const plan = plans.find(p => p.id === planId);
    if (plan) setSelectedPlan(plan);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Retail Plans</h1>
            <p className="text-sm text-gray-500">Manage subscription plans for automated daily orders</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleGenerateOrders()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="generate-orders-btn"
            >
              <Zap size={16} className="mr-1" />
              Generate Today's Orders
            </Button>
            <Button
              onClick={() => setShowNewPlanDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="new-plan-btn"
            >
              <Plus size={16} className="mr-1" />
              New Plan
            </Button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map(plan => {
            const isExpanded = expandedPlans[plan.id];
            const subscribedCount = retailers.filter(r => r.subscribed_plan_id === plan.id).length;
            
            return (
              <Card 
                key={plan.id} 
                className={`border-2 transition-all ${
                  selectedPlan?.id === plan.id 
                    ? 'border-emerald-500 shadow-lg' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div 
                      className="flex items-center gap-2 cursor-pointer flex-1"
                      onClick={() => togglePlanExpand(plan.id)}
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      {plan.is_default && (
                        <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">Default</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Package size={14} /> {plan.products?.length || 0} SKUs
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Users size={14} /> {subscribedCount}
                      </span>
                      {!plan.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeletePlan(plan.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {plan.description && (
                    <p className="text-xs text-gray-500 mt-1 ml-6">{plan.description}</p>
                  )}
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="pt-2">
                    {/* Action Buttons */}
                    <div className="flex gap-2 mb-3">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedPlan(plan);
                          setShowAddProductDialog(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      >
                        <Plus size={14} className="mr-1" /> Add Product
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPlan(plan);
                          setShowAssignDialog(true);
                        }}
                        className="text-xs"
                      >
                        <UserPlus size={14} className="mr-1" /> Assign Retailer
                      </Button>
                    </div>
                    
                    {/* Products List */}
                    {plan.products?.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-medium text-gray-600">Product</th>
                              <th className="px-2 py-1.5 text-left font-medium text-gray-600">Variant</th>
                              <th className="px-2 py-1.5 text-center font-medium text-gray-600">Qty</th>
                              <th className="px-2 py-1.5 text-center font-medium text-gray-600">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {plan.products.map((p, idx) => (
                              <tr key={`${p.product_id}-${p.variant_id}`} className="hover:bg-gray-50">
                                <td className="px-2 py-1.5 font-medium">{p.product_name}</td>
                                <td className="px-2 py-1.5 text-gray-600">{p.variant_name}</td>
                                <td className="px-2 py-1.5 text-center">
                                  {editingProduct === `${plan.id}-${p.product_id}-${p.variant_id}` ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <Input
                                        type="number"
                                        value={editQuantity}
                                        onChange={(e) => setEditQuantity(Number(e.target.value))}
                                        className="w-14 h-6 text-xs text-center"
                                        min="1"
                                      />
                                      <Button
                                        size="sm"
                                        onClick={() => handleUpdateQuantity(plan.id, p.product_id, p.variant_id, editQuantity)}
                                        className="h-6 w-6 p-0 bg-emerald-500"
                                      >
                                        <Check size={12} />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingProduct(null)}
                                        className="h-6 w-6 p-0"
                                      >
                                        <X size={12} />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span 
                                      className="cursor-pointer hover:text-emerald-600"
                                      onClick={() => {
                                        setEditingProduct(`${plan.id}-${p.product_id}-${p.variant_id}`);
                                        setEditQuantity(p.quantity);
                                      }}
                                    >
                                      {p.quantity}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveProduct(plan.id, p.product_id, p.variant_id)}
                                    className="text-red-500 hover:text-red-700 p-1 h-6"
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-400 text-sm border rounded-lg border-dashed">
                        No products in this plan. Click "Add Product" to get started.
                      </div>
                    )}
                    
                    {/* Subscribed Retailers */}
                    {retailers.filter(r => r.subscribed_plan_id === plan.id).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-600 mb-1">Subscribed Retailers:</p>
                        <div className="flex flex-wrap gap-1">
                          {retailers.filter(r => r.subscribed_plan_id === plan.id).map(r => (
                            <span 
                              key={r.id}
                              className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full flex items-center gap-1"
                            >
                              {r.company_name || r.name}
                              <X 
                                size={12} 
                                className="cursor-pointer hover:text-red-500"
                                onClick={() => handleUnassignPlan(r.id)}
                              />
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* New Plan Dialog */}
        <Dialog open={showNewPlanDialog} onOpenChange={setShowNewPlanDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Plan</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Plan Name *</Label>
                <Input
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="e.g., Premium, Budget, Custom"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={newPlanDescription}
                  onChange={(e) => setNewPlanDescription(e.target.value)}
                  placeholder="Brief description of this plan"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowNewPlanDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreatePlan} className="bg-emerald-600 hover:bg-emerald-700">
                  Create Plan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Product Dialog */}
        <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Product to {selectedPlan?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {/* Product Selection */}
              <div>
                <Label>Product *</Label>
                <div className="relative mt-1">
                  <Input
                    value={selectedProduct ? selectedProduct.name : productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setSelectedProduct(null);
                    }}
                    placeholder="Search product..."
                    className="pr-8"
                  />
                  <Search size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                {productSearch && !selectedProduct && (
                  <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto">
                    {filteredProducts.slice(0, 10).map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedProduct(p);
                          setProductSearch('');
                        }}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                      >
                        {p.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Variant Selection */}
              <div>
                <Label>Variant *</Label>
                <div className="relative mt-1">
                  <Input
                    value={selectedVariant ? selectedVariant.name : variantSearch}
                    onChange={(e) => {
                      setVariantSearch(e.target.value);
                      setSelectedVariant(null);
                    }}
                    placeholder="Search variant (e.g., 500gm, Piece)..."
                    className="pr-8"
                  />
                  <Search size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                {variantSearch && !selectedVariant && (
                  <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto">
                    {/* Add Piece/Packet options */}
                    {['Pieces', 'Packets'].filter(v => v.toLowerCase().includes(variantSearch.toLowerCase())).map(v => (
                      <div
                        key={`unit_${v.toLowerCase()}`}
                        onClick={() => {
                          setSelectedVariant({ id: `unit_${v.toLowerCase().slice(0, -1)}`, name: v });
                          setVariantSearch('');
                        }}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm font-medium text-emerald-700"
                      >
                        {v} (Unit based)
                      </div>
                    ))}
                    {filteredVariants.slice(0, 10).map(v => (
                      <div
                        key={v.id}
                        onClick={() => {
                          setSelectedVariant(v);
                          setVariantSearch('');
                        }}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                      >
                        {v.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div>
                <Label>Standard Quantity *</Label>
                <Input
                  type="number"
                  value={productQuantity}
                  onChange={(e) => setProductQuantity(Number(e.target.value))}
                  min="1"
                  className="mt-1 w-32"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This quantity will be used for auto-generated daily orders
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowAddProductDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddProduct} 
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={!selectedProduct || !selectedVariant}
                >
                  Add Product
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Assign Retailer Dialog */}
        <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Retailer to {selectedPlan?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Search Retailer</Label>
                <div className="relative mt-1">
                  <Input
                    value={retailerSearch}
                    onChange={(e) => setRetailerSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="pr-8"
                  />
                  <Search size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {availableRetailers.length > 0 ? (
                  availableRetailers.map(r => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRetailerId(r.id)}
                      className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between ${
                        selectedRetailerId === r.id 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <span>{r.company_name || r.name}</span>
                      {selectedRetailerId === r.id && <Check size={16} />}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-gray-500 text-sm">
                    {retailerSearch 
                      ? 'No matching retailers found' 
                      : 'All retailers already have plans assigned'}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAssignPlan} 
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={!selectedRetailerId}
                >
                  Assign Plan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
