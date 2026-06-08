import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { 
  Plus, ChevronDown, ChevronRight, Zap, Save, Users, Trash2
} from 'lucide-react';

export default function RetailPlans() {
  const [plans, setPlans] = useState([]);
  const [catalogue, setCatalogue] = useState([]); // Retailer catalogue products
  const [retailers, setRetailers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Expanded categories
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Track changes for saving
  const [planProducts, setPlanProducts] = useState({}); // { planId: { productId_variantId: quantity } }
  const [hasChanges, setHasChanges] = useState(false);
  
  // New plan dialog
  const [showNewPlanDialog, setShowNewPlanDialog] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanDescription, setNewPlanDescription] = useState('');
  
  // Assign retailer dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedPlanForAssign, setSelectedPlanForAssign] = useState(null);
  const [retailerSearch, setRetailerSearch] = useState('');

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [plansRes, catalogueRes, retailersRes] = await Promise.all([
        api.get('/api/retail-plans'),
        api.get('/api/retailer-catalogue'),
        api.get('/api/retail-plans/subscribed-retailers')
      ]);
      
      setPlans(plansRes.data);
      
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
      setCatalogue(parsedCatalogue);
      setRetailers(retailersRes.data);
      
      // Build planProducts map from existing plan data
      const productsMap = {};
      plansRes.data.forEach(plan => {
        productsMap[plan.id] = {};
        (plan.products || []).forEach(p => {
          const key = `${p.product_id}_${p.variant_id}`;
          productsMap[plan.id][key] = p.quantity;
        });
      });
      setPlanProducts(productsMap);
      
      // Auto-expand first category
      const categories = [...new Set(parsedCatalogue.map(c => c.category || 'Uncategorized'))];
      if (categories.length > 0) {
        setExpandedCategories({ [categories[0]]: true });
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

  // Group catalogue by category
  const catalogueByCategory = catalogue.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const categories = Object.keys(catalogueByCategory).sort();

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  // Check if product+variant is in a plan
  const isInPlan = (planId, productId, variantId) => {
    const key = `${productId}_${variantId}`;
    return planProducts[planId]?.[key] !== undefined;
  };

  // Get quantity for product+variant in a plan
  const getQuantity = (planId, productId, variantId) => {
    const key = `${productId}_${variantId}`;
    return planProducts[planId]?.[key] || 0;
  };

  // Toggle product in plan
  const toggleProductInPlan = (planId, item, variantId, variantName) => {
    const key = `${item.product_id}_${variantId}`;
    setPlanProducts(prev => {
      const newMap = { ...prev };
      const planMap = { ...(newMap[planId] || {}) };
      
      if (planMap[key] !== undefined) {
        // Remove from plan
        delete planMap[key];
      } else {
        // Add to plan with default quantity 1
        planMap[key] = 1;
      }
      newMap[planId] = planMap;
      return newMap;
    });
    setHasChanges(true);
  };

  // Update quantity
  const updateQuantity = (planId, productId, variantId, quantity) => {
    const key = `${productId}_${variantId}`;
    setPlanProducts(prev => {
      const newMap = { ...prev };
      const planMap = { ...(newMap[planId] || {}) };
      planMap[key] = Math.max(0.5, Number(quantity) || 1);
      newMap[planId] = planMap;
      return newMap;
    });
    setHasChanges(true);
  };

  // Save all changes
  const saveChanges = async () => {
    setSaving(true);
    try {
      // For each plan, determine what to add/update/remove
      for (const plan of plans) {
        const currentProducts = planProducts[plan.id] || {};
        const existingProducts = {};
        (plan.products || []).forEach(p => {
          existingProducts[`${p.product_id}_${p.variant_id}`] = p;
        });
        
        // Find products to remove
        for (const key of Object.keys(existingProducts)) {
          if (currentProducts[key] === undefined) {
            const [productId, variantId] = key.split('_');
            await api.delete(`/api/retail-plans/${plan.id}/products/${productId}/${variantId}`);
          }
        }
        
        // Find products to add or update
        for (const [key, quantity] of Object.entries(currentProducts)) {
          const [productId, variantId] = key.split('_');
          const catalogueItem = catalogue.find(c => c.product_id === productId);
          
          if (existingProducts[key]) {
            // Update quantity if changed
            if (existingProducts[key].quantity !== quantity) {
              await api.put(`/api/retail-plans/${plan.id}/products/${productId}/${variantId}`, {
                quantity
              });
            }
          } else {
            // Add new product
            // Find variant name
            let variantName = variantId;
            if (variantId === 'unit_piece') variantName = 'Pieces';
            else if (variantId === 'unit_packet') variantName = 'Packets';
            else {
              // It's a packaging ID, try to get name from catalogue item
              variantName = variantId; // Will be resolved by backend if needed
            }
            
            await api.post(`/api/retail-plans/${plan.id}/products`, {
              product_id: productId,
              product_name: catalogueItem?.product_name || 'Unknown',
              variant_id: variantId,
              variant_name: variantName,
              quantity
            });
          }
        }
      }
      
      toast.success('All changes saved successfully');
      setHasChanges(false);
      loadData(); // Refresh data
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Create new plan
  const handleCreatePlan = async () => {
    if (!newPlanName.trim()) {
      toast.error('Plan name is required');
      return;
    }
    
    try {
      const res = await api.post('/api/retail-plans', {
        name: newPlanName,
        description: newPlanDescription
      });
      toast.success('Plan created successfully');
      setShowNewPlanDialog(false);
      setNewPlanName('');
      setNewPlanDescription('');
      
      // Add new plan to state
      setPlans(prev => [...prev, res.data]);
      setPlanProducts(prev => ({ ...prev, [res.data.id]: {} }));
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create plan');
    }
  };

  // Delete plan
  const handleDeletePlan = async (planId) => {
    const plan = plans.find(p => p.id === planId);
    if (plan?.is_default) {
      toast.error('Cannot delete default plans');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this plan?')) return;
    
    try {
      await api.delete(`/api/retail-plans/${planId}`);
      toast.success('Plan deleted');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete plan');
    }
  };

  // Assign plan to retailer
  const handleAssignPlan = async (retailerId) => {
    try {
      await api.post('/api/retail-plans/assign', {
        retailer_id: retailerId,
        plan_id: selectedPlanForAssign.id
      });
      toast.success('Plan assigned to retailer');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign plan');
    }
  };

  // Unassign plan from retailer
  const handleUnassignPlan = async (retailerId) => {
    try {
      await api.delete(`/api/retail-plans/unassign/${retailerId}`);
      toast.success('Plan unassigned');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to unassign');
    }
  };

  // Generate orders
  const handleGenerateOrders = async () => {
    try {
      const res = await api.post('/api/retail-plans/generate-orders', {});
      toast.success(res.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate orders');
    }
  };

  // Get variant display name
  const getVariantName = (item, variantId) => {
    if (variantId === 'unit_piece') return 'Pieces';
    if (variantId === 'unit_packet') return 'Packets';
    // For weight variants, try to find from purchase_weights
    return variantId.substring(0, 8) + '...'; // Truncate UUID
  };

  // Available retailers for assignment (not subscribed to any plan)
  const availableRetailers = retailers.filter(r => 
    !r.subscribed_plan_id && 
    (r.company_name?.toLowerCase().includes(retailerSearch.toLowerCase()) ||
     r.name?.toLowerCase().includes(retailerSearch.toLowerCase()))
  );

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
            <p className="text-sm text-gray-500">Configure subscription plans for automated daily orders</p>
          </div>
          <div className="flex gap-2">
            {hasChanges && (
              <Button
                onClick={saveChanges}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save size={16} className="mr-1" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            <Button
              onClick={handleGenerateOrders}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Zap size={16} className="mr-1" />
              Generate Today's Orders
            </Button>
            <Button
              onClick={() => setShowNewPlanDialog(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus size={16} className="mr-1" />
              New Plan
            </Button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Header Row - Plan Names */}
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-700 min-w-[250px] border-r">
                    Products / Variants
                  </th>
                  {plans.map(plan => {
                    const subscribedCount = retailers.filter(r => r.subscribed_plan_id === plan.id).length;
                    const productCount = Object.keys(planProducts[plan.id] || {}).length;
                    
                    return (
                      <th key={plan.id} className="px-3 py-3 text-center min-w-[130px] border-r last:border-r-0">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold text-gray-800">{plan.name}</span>
                          {plan.is_default && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded">Default</span>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            <span>{productCount} SKUs</span>
                            <span 
                              className="flex items-center gap-0.5 cursor-pointer hover:text-emerald-600"
                              onClick={() => {
                                setSelectedPlanForAssign(plan);
                                setShowAssignDialog(true);
                              }}
                            >
                              <Users size={10} /> {subscribedCount}
                            </span>
                          </div>
                          {!plan.is_default && (
                            <button
                              onClick={() => handleDeletePlan(plan.id)}
                              className="text-red-400 hover:text-red-600 p-0.5"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              
              {/* Body - Categories and Products */}
              <tbody>
                {categories.map(category => (
                  <React.Fragment key={category}>
                    {/* Category Row */}
                    <tr 
                      className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => toggleCategory(category)}
                    >
                      <td 
                        colSpan={plans.length + 1}
                        className="px-4 py-2 font-medium text-gray-700"
                      >
                        <div className="flex items-center gap-2">
                          {expandedCategories[category] ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                          {category}
                          <span className="text-xs text-gray-500">
                            ({catalogueByCategory[category].length} items)
                          </span>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Product Rows */}
                    {expandedCategories[category] && catalogueByCategory[category].map(item => {
                      // Determine the correct variant based on purchase_unit
                      // If purchase_unit is Piece/Packet, use unit_piece/unit_packet
                      // Otherwise, use the first weight-based variant (UUID)
                      let variantId = '';
                      let variantName = '';
                      
                      const purchaseUnit = item.purchase_unit;
                      
                      // Variants are already parsed as arrays from loadData
                      const itemVariants = Array.isArray(item.variants) ? item.variants : [];
                      
                      if (purchaseUnit === 'Piece') {
                        variantId = 'unit_piece';
                        variantName = 'Pieces';
                      } else if (purchaseUnit === 'Packet') {
                        variantId = 'unit_packet';
                        variantName = 'Packets';
                      } else {
                        // Find the first non-unit variant (weight-based UUID)
                        const weightVariant = itemVariants.find(v => v && !v.startsWith('unit_'));
                        if (weightVariant) {
                          variantId = weightVariant;
                          // Try to find variant name from purchase_weights or show truncated ID
                          variantName = weightVariant.substring(0, 8) + '...';
                        }
                      }
                      
                      // If no valid variant found, skip this product
                      if (!variantId) {
                        return (
                          <tr key={item.product_id} className="border-b hover:bg-gray-50">
                            <td className="sticky left-0 bg-white px-4 py-2 border-r">
                              <span className="text-sm">{item.product_name}</span>
                              <span className="text-xs text-gray-400 ml-2">(No variant)</span>
                            </td>
                            {plans.map(plan => (
                              <td key={plan.id} className="px-3 py-2 text-center border-r last:border-r-0">
                                <span className="text-gray-300">-</span>
                              </td>
                            ))}
                          </tr>
                        );
                      }
                      
                      // Show single row for this product with its primary variant
                      return (
                        <tr key={`${item.product_id}_${variantId}`} className="border-b hover:bg-gray-50">
                          <td className="sticky left-0 bg-white px-4 py-2 border-r">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{item.product_name}</span>
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {variantName}
                              </span>
                            </div>
                          </td>
                          {plans.map(plan => {
                            const checked = isInPlan(plan.id, item.product_id, variantId);
                            const qty = getQuantity(plan.id, item.product_id, variantId);
                            
                            return (
                              <td key={plan.id} className="px-2 py-1.5 text-center border-r last:border-r-0">
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleProductInPlan(plan.id, item, variantId, variantName)}
                                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                  {checked && (
                                    <Input
                                      type="number"
                                      value={qty}
                                      onChange={(e) => updateQuantity(plan.id, item.product_id, variantId, e.target.value)}
                                      className="w-14 h-7 text-xs text-center p-1"
                                      min="0.5"
                                      step="0.5"
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
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

        {/* Assign Retailer Dialog */}
        <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {selectedPlanForAssign?.name} - Retailers
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {/* Subscribed Retailers */}
              <div>
                <Label className="text-xs text-gray-500">Subscribed Retailers</Label>
                <div className="mt-1 border rounded-lg max-h-32 overflow-y-auto">
                  {retailers.filter(r => r.subscribed_plan_id === selectedPlanForAssign?.id).length > 0 ? (
                    retailers.filter(r => r.subscribed_plan_id === selectedPlanForAssign?.id).map(r => (
                      <div key={r.id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                        <span className="text-sm">{r.company_name || r.name}</span>
                        <button
                          onClick={() => handleUnassignPlan(r.id)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-gray-400 text-sm">
                      No retailers subscribed
                    </div>
                  )}
                </div>
              </div>
              
              {/* Add Retailer */}
              <div>
                <Label className="text-xs text-gray-500">Add Retailer</Label>
                <Input
                  value={retailerSearch}
                  onChange={(e) => setRetailerSearch(e.target.value)}
                  placeholder="Search retailer..."
                  className="mt-1"
                />
                <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto">
                  {availableRetailers.length > 0 ? (
                    availableRetailers.slice(0, 10).map(r => (
                      <div
                        key={r.id}
                        onClick={() => handleAssignPlan(r.id)}
                        className="px-3 py-2 hover:bg-emerald-50 cursor-pointer text-sm"
                      >
                        {r.company_name || r.name}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-gray-400 text-sm">
                      {retailerSearch ? 'No matching retailers' : 'All retailers have plans'}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
