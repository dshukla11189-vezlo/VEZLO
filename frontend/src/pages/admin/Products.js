import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Plus, Edit, Trash, Search, AlertTriangle, ArrowRight, Package, Ruler, Box, Tag, Layers, ImageIcon, Upload, X, ChevronRight, Check, Save } from 'lucide-react';

// Catalogue Product Row Component - For editing variants
const CatalogueProductRow = ({ 
  product, 
  index, 
  catalogueItem, 
  isEditing, 
  isSaving,
  packagingVariants, 
  getVariantNames,
  onEdit, 
  onSave, 
  onCancel, 
  onRemove,
  onToggleVisibility
}) => {
  const [selectedVariants, setSelectedVariants] = useState(catalogueItem?.variants || []);
  
  // Reset selected variants when editing state changes
  React.useEffect(() => {
    if (isEditing) {
      setSelectedVariants(catalogueItem?.variants || []);
    }
  }, [isEditing, catalogueItem]);

  const toggleVariant = (variantId) => {
    setSelectedVariants(prev => 
      prev.includes(variantId) 
        ? prev.filter(id => id !== variantId)
        : [...prev, variantId]
    );
  };

  const isInCatalogue = !!catalogueItem;
  const isVisible = catalogueItem?.show_on_portal !== false; // Default to true if not set

  return (
    <tr className={`border-b hover:bg-gray-50 ${isInCatalogue ? 'bg-teal-50/30' : ''}`}>
      {/* S.No */}
      <td className="px-4 py-2 text-gray-500">{index + 1}</td>
      
      {/* Image */}
      <td className="px-4 py-2">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-10 h-10 object-cover rounded border"
          />
        ) : (
          <div className="w-10 h-10 bg-gray-100 rounded border flex items-center justify-center">
            <ImageIcon size={16} className="text-gray-400" />
          </div>
        )}
      </td>
      
      {/* Product Name */}
      <td className="px-4 py-2">
        <div>
          <span className="font-medium text-gray-800">{product.name}</span>
        </div>
      </td>
      
      {/* Variants */}
      <td className="px-4 py-2">
        {isEditing ? (
          <div className="flex flex-wrap gap-1.5 max-w-md">
            {packagingVariants
              .filter(v => {
                const verticals = v.verticals;
                // Show if retail, both, or null/undefined (available for all)
                if (!verticals) return true;
                if (Array.isArray(verticals)) {
                  return verticals.includes('retail') || verticals.includes('both') || verticals.length === 0;
                }
                return verticals === 'retail' || verticals === 'both';
              })
              .map(variant => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => toggleVariant(variant.id)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    selectedVariants.includes(variant.id)
                      ? 'bg-teal-500 text-white border-teal-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400'
                  }`}
                >
                  {variant.name}
                  {selectedVariants.includes(variant.id) && (
                    <Check size={10} className="inline ml-1" />
                  )}
                </button>
              ))}
          </div>
        ) : isInCatalogue ? (
          <div className="flex flex-wrap gap-1">
            {catalogueItem.variants?.length > 0 ? (
              catalogueItem.variants.map(variantId => {
                const variant = packagingVariants.find(v => v.id === variantId);
                return variant ? (
                  <span key={variantId} className="px-2 py-0.5 text-xs bg-teal-100 text-teal-700 rounded">
                    {variant.name}
                  </span>
                ) : null;
              })
            ) : (
              <span className="text-xs text-orange-500">No variants selected</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">Not in catalogue</span>
        )}
      </td>
      
      {/* Show on Retailer Portal */}
      <td className="px-4 py-2 text-center">
        {isInCatalogue ? (
          <label className="flex items-center justify-center cursor-pointer">
            <input
              type="checkbox"
              checked={isVisible}
              onChange={() => onToggleVisibility(product.id, !isVisible)}
              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 cursor-pointer"
            />
          </label>
        ) : (
          <span className="text-gray-300">-</span>
        )}
      </td>
      
      {/* Actions */}
      <td className="px-4 py-2 text-center">
        {isEditing ? (
          <div className="flex justify-center gap-1">
            <Button
              size="sm"
              className="h-7 px-2 bg-teal-600 hover:bg-teal-700"
              onClick={() => onSave(selectedVariants)}
              disabled={isSaving}
            >
              {isSaving ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <>
                  <Save size={12} className="mr-1" /> Save
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        ) : isInCatalogue ? (
          <div className="flex justify-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
              onClick={onEdit}
              title="Edit variants"
            >
              <Edit size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={onRemove}
              title="Remove from catalogue"
            >
              <Trash size={14} />
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-teal-300 text-teal-700 hover:bg-teal-50"
            onClick={onEdit}
          >
            <Plus size={12} className="mr-1" /> Add
          </Button>
        )}
      </td>
    </tr>
  );
};

export default function Products() {
  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState('products'); // 'products', 'units', 'packaging', or 'categories'
  
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
  const [packagingForm, setPackagingForm] = useState({ name: '', weight_gm: '', verticals: 'both' });
  
  // Categories & Types state
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [editCategory, setEditCategory] = useState(null);
  const [editType, setEditType] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [typeForm, setTypeForm] = useState({ name: '' });
  
  // Delete with replacement state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);
  const [dependencies, setDependencies] = useState(null);
  const [replacementProductId, setReplacementProductId] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Image upload state
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Retailer Catalogue state
  const [catalogueItems, setCatalogueItems] = useState([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [expandedCatalogueCategories, setExpandedCatalogueCategories] = useState({});
  const [editingCatalogueItem, setEditingCatalogueItem] = useState(null);
  const [catalogueSaving, setCatalogueSaving] = useState({});
  
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unit: 'Kg',
    product_type: '',  // 'Fruits', 'Vegetables', 'Exotic', 'Leafy', etc.
    current_stock: 0,
    price_per_kg: 0,
    price_per_packet: 0,
    lifecycle_duration: '',  // 'low', 'medium', 'high'
    cost_alias_product_id: '',  // For P&L: use this product's purchase cost
    image_url: ''  // Product image URL
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

  // Load product categories
  const loadCategories = useCallback(async () => {
    try {
      const response = await api.get('/api/product-categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, []);

  // Load product types
  const loadProductTypes = useCallback(async () => {
    try {
      const response = await api.get('/api/product-types');
      setProductTypes(response.data);
    } catch (error) {
      console.error('Failed to load product types:', error);
    }
  }, []);

  // Load retailer catalogue
  const loadCatalogue = useCallback(async () => {
    setCatalogueLoading(true);
    try {
      const response = await api.get('/api/retailer-catalogue');
      setCatalogueItems(response.data);
    } catch (error) {
      console.error('Failed to load catalogue:', error);
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  // Category handlers
  const handleSubmitCategory = async (e) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    try {
      if (editCategory) {
        await api.put(`/api/product-categories/${editCategory.id}`, { name: categoryForm.name });
        toast.success('Category updated successfully');
      } else {
        await api.post('/api/product-categories', { name: categoryForm.name });
        toast.success('Category added successfully');
      }
      setCategoryForm({ name: '' });
      setEditCategory(null);
      setShowCategoryDialog(false);
      loadCategories();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    try {
      await api.delete(`/api/product-categories/${category.id}`);
      toast.success('Category deleted successfully');
      loadCategories();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete category');
    }
  };

  // Type handlers
  const handleSubmitType = async (e) => {
    e.preventDefault();
    if (!typeForm.name.trim()) {
      toast.error('Type name is required');
      return;
    }
    try {
      if (editType) {
        await api.put(`/api/product-types/${editType.id}`, { name: typeForm.name });
        toast.success('Type updated successfully');
      } else {
        await api.post('/api/product-types', { name: typeForm.name });
        toast.success('Type added successfully');
      }
      setTypeForm({ name: '' });
      setEditType(null);
      setShowTypeDialog(false);
      loadProductTypes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save type');
    }
  };

  const handleDeleteType = async (type) => {
    if (!window.confirm(`Delete type "${type.name}"?`)) return;
    try {
      await api.delete(`/api/product-types/${type.id}`);
      toast.success('Type deleted successfully');
      loadProductTypes();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete type');
    }
  };

  // ==================== RETAILER CATALOGUE HANDLERS ====================
  // Get products organized by category for catalogue
  const catalogueProductsByCategory = useMemo(() => {
    const byCategory = {};
    products.forEach(product => {
      const cat = product.category || 'Others';
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(product);
    });
    // Sort products within each category alphabetically
    Object.keys(byCategory).forEach(cat => {
      byCategory[cat].sort((a, b) => a.name.localeCompare(b.name));
    });
    return byCategory;
  }, [products]);

  // Get catalogue item for a product
  const getCatalogueItem = (productId) => {
    return catalogueItems.find(item => item.product_id === productId);
  };

  // Get variant names for display
  const getVariantNames = (variantIds) => {
    if (!variantIds || variantIds.length === 0) return 'No variants selected';
    return variantIds.map(id => {
      const variant = packagingVariants.find(v => v.id === id);
      return variant ? variant.name : id;
    }).join(', ');
  };

  // Toggle catalogue category expansion
  const toggleCatalogueCategory = (category) => {
    setExpandedCatalogueCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Save catalogue item (add or update)
  const saveCatalogueItem = async (product, selectedVariants) => {
    setCatalogueSaving(prev => ({ ...prev, [product.id]: true }));
    try {
      await api.post('/api/retailer-catalogue', {
        product_id: product.id,
        product_name: product.name,
        product_name_hi: product.name_hi || '',
        product_name_mr: product.name_mr || '',
        category: product.category || '',
        image_url: product.image_url || '',
        variants: selectedVariants,
        is_active: true
      });
      toast.success(`${product.name} saved to catalogue`);
      loadCatalogue();
      setEditingCatalogueItem(null);
    } catch (error) {
      toast.error('Failed to save catalogue item');
    } finally {
      setCatalogueSaving(prev => ({ ...prev, [product.id]: false }));
    }
  };

  // Remove product from catalogue
  const removeCatalogueItem = async (productId, productName) => {
    if (!window.confirm(`Remove "${productName}" from retailer catalogue?`)) return;
    try {
      await api.delete(`/api/retailer-catalogue/${productId}`);
      toast.success(`${productName} removed from catalogue`);
      loadCatalogue();
    } catch (error) {
      toast.error('Failed to remove from catalogue');
    }
  };

  // Toggle visibility on retailer portal
  const toggleCatalogueVisibility = async (productId, showOnPortal) => {
    try {
      await api.put(`/api/retailer-catalogue/${productId}`, {
        show_on_portal: showOnPortal
      });
      // Update local state immediately for responsiveness
      setCatalogueItems(prev => prev.map(item => 
        item.product_id === productId 
          ? { ...item, show_on_portal: showOnPortal }
          : item
      ));
      toast.success(showOnPortal ? 'Product visible to retailers' : 'Product hidden from retailers');
    } catch (error) {
      toast.error('Failed to update visibility');
    }
  };

  // Add all products in a category to catalogue
  const addCategoryToCatalogue = async (category, productsInCategory) => {
    const items = productsInCategory.map(p => ({
      product_id: p.id,
      product_name: p.name,
      product_name_hi: p.name_hi || '',
      product_name_mr: p.name_mr || '',
      category: p.category || '',
      image_url: p.image_url || '',
      variants: [],
      is_active: true
    }));
    
    try {
      await api.post('/api/retailer-catalogue/bulk-add', { items });
      toast.success(`Added ${productsInCategory.length} products from ${category} to catalogue`);
      loadCatalogue();
    } catch (error) {
      toast.error('Failed to add products to catalogue');
    }
  };

  // Packaging handlers
  const handleSubmitPackaging = async (e) => {
    e.preventDefault();
    if (!packagingForm.name || !packagingForm.weight_gm) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      if (editingPackaging) {
        await api.put(`/api/qc-packaging/${editingPackaging.id}?name=${encodeURIComponent(packagingForm.name)}&weight_gm=${packagingForm.weight_gm}&verticals=${packagingForm.verticals}`);
        toast.success('Packaging updated successfully');
      } else {
        await api.post(`/api/qc-packaging?name=${encodeURIComponent(packagingForm.name)}&weight_gm=${packagingForm.weight_gm}&verticals=${packagingForm.verticals}`);
        toast.success('Packaging added successfully');
      }
      resetPackagingForm();
      loadPackaging();
    } catch (error) {
      toast.error('Failed to save packaging');
    }
  };

  // State for packaging migration dialog
  const [showPackagingMigrationDialog, setShowPackagingMigrationDialog] = useState(false);
  const [packagingToDelete, setPackagingToDelete] = useState(null);
  const [packagingUsageInfo, setPackagingUsageInfo] = useState(null);
  const [replacementPackagingId, setReplacementPackagingId] = useState('');

  const handleEditPackaging = (pkg) => {
    setEditingPackaging(pkg);
    // Determine verticals from array
    let verticalsValue = 'both';
    if (pkg.verticals) {
      if (pkg.verticals.includes('qc') && pkg.verticals.includes('retail')) {
        verticalsValue = 'both';
      } else if (pkg.verticals.includes('qc')) {
        verticalsValue = 'qc';
      } else if (pkg.verticals.includes('retail')) {
        verticalsValue = 'retail';
      }
    }
    setPackagingForm({ name: pkg.name, weight_gm: pkg.weight_gm?.toString() || '', verticals: verticalsValue });
    setShowPackagingDialog(true);
  };

  const handleDeletePackaging = async (packagingId) => {
    if (!window.confirm('Are you sure you want to delete this packaging?')) return;
    try {
      const response = await api.delete(`/api/qc-packaging/${packagingId}`);
      
      // Check if migration is required
      if (response.data.requires_migration) {
        setPackagingToDelete(packagingId);
        setPackagingUsageInfo(response.data);
        setReplacementPackagingId('');
        setShowPackagingMigrationDialog(true);
        return;
      }
      
      toast.success(response.data.message || 'Packaging deleted successfully');
      loadPackaging();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to delete packaging';
      toast.error(errorMsg);
    }
  };

  const handlePackagingMigrationDelete = async () => {
    if (!replacementPackagingId) {
      toast.error('Please select a replacement packaging');
      return;
    }
    
    try {
      const response = await api.delete(`/api/qc-packaging/${packagingToDelete}?replacement_id=${replacementPackagingId}`);
      toast.success(response.data.message || 'Packaging deleted and migrated successfully');
      setShowPackagingMigrationDialog(false);
      setPackagingToDelete(null);
      setPackagingUsageInfo(null);
      setReplacementPackagingId('');
      loadPackaging();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to migrate and delete packaging';
      toast.error(errorMsg);
    }
  };

  const resetPackagingForm = () => {
    setPackagingForm({ name: '', weight_gm: '', verticals: 'both' });
    setEditingPackaging(null);
    setShowPackagingDialog(false);
  };

  useEffect(() => {
    loadProducts();
    loadUnits();
    loadPackaging();
    loadCategories();
    loadProductTypes();
    loadCatalogue();
  }, [loadProducts, loadUnits, loadPackaging, loadCategories, loadProductTypes, loadCatalogue]);

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
      let finalImageUrl = formData.image_url;
      
      // Upload new image if selected
      if (imageFile) {
        setUploadingImage(true);
        const formDataImg = new FormData();
        formDataImg.append('file', imageFile);
        
        try {
          const uploadRes = await api.post('/api/products/upload-image', formDataImg, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000  // 30 second timeout for image uploads
          });
          finalImageUrl = uploadRes.data.image_url;
        } catch (uploadErr) {
          console.error('Image upload error:', uploadErr);
          if (uploadErr.code === 'ECONNABORTED') {
            toast.error('Image upload timed out. Please try a smaller image.');
          } else if (uploadErr.response?.status === 413) {
            toast.error('Image is too large. Please use an image under 5MB.');
          } else {
            toast.error('Failed to upload image. Please try again.');
          }
          setUploadingImage(false);
          return;
        }
        setUploadingImage(false);
      }
      
      const productData = { ...formData, image_url: finalImageUrl };
      
      if (editProduct) {
        await api.put(`/api/products/${editProduct.id}`, productData);
        toast.success('Product updated successfully');
      } else {
        await api.post('/api/products', productData);
        toast.success('Product created successfully');
      }
      setOpen(false);
      setEditProduct(null);
      setFormData({ name: '', category: '', unit: 'Kg', product_type: '', current_stock: 0, price_per_kg: 0, price_per_packet: 0, lifecycle_duration: '', cost_alias_product_id: '', image_url: '' });
      setImageFile(null);
      setImagePreview(null);
      loadProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save product');
    }
  };

  // Compress image before upload to reduce size
  const compressImage = async (file, maxWidth = 800, quality = 0.7) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Scale down if needed
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle image file selection
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.type)) {
        toast.error('Only JPEG, PNG, and WebP images are allowed');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      
      // Compress large images (>500KB) for faster upload
      let processedFile = file;
      if (file.size > 500 * 1024) {
        toast.info('Compressing image...');
        processedFile = await compressImage(file);
        toast.success(`Image compressed: ${Math.round(file.size/1024)}KB → ${Math.round(processedFile.size/1024)}KB`);
      }
      
      setImageFile(processedFile);
      setImagePreview(URL.createObjectURL(processedFile));
    }
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData({ ...formData, image_url: '' });
  };

  const handleEdit = (product) => {
    setEditProduct(product);
    setFormData({
      name: product.name,
      category: product.category,
      unit: product.unit,
      product_type: product.product_type || '',
      current_stock: product.current_stock,
      price_per_kg: product.price_per_kg || 0,
      price_per_packet: product.price_per_packet || 0,
      lifecycle_duration: product.lifecycle_duration || '',
      cost_alias_product_id: product.cost_alias_product_id || '',
      image_url: product.image_url || ''
    });
    setImageFile(null);
    setImagePreview(product.image_url || null);
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
          onClick={() => setActiveSubTab('catalogue')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'catalogue'
              ? 'border-teal-600 text-teal-700 bg-teal-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Tag size={16} />
          Retailer Catalogue
          <span className="ml-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-full">
            {catalogueItems.length}
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
        <button
          onClick={() => setActiveSubTab('categories')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'categories'
              ? 'border-amber-600 text-amber-700 bg-amber-50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Layers size={16} />
          Categories & Types
          <span className="ml-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
            {categories.length + productTypes.length}
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
            setFormData({ name: '', category: '', unit: 'Kg', product_type: '', current_stock: 0, price_per_kg: 0, price_per_packet: 0, lifecycle_duration: '', cost_alias_product_id: '', image_url: '' });
            setImageFile(null);
            setImagePreview(null);
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
                  <select
                    id="category"
                    data-testid="product-category-input"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="product_type">Type</Label>
                  <select
                    id="product_type"
                    data-testid="product-type-input"
                    value={formData.product_type}
                    onChange={(e) => setFormData({ ...formData, product_type: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="">Select Type</option>
                    {productTypes.map(type => (
                      <option key={type.id} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
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
              
              {/* Product Image Upload */}
              <div>
                <Label>Product Image</Label>
                <div className="mt-2">
                  {(imagePreview || formData.image_url) ? (
                    <div className="relative inline-block">
                      <img 
                        src={imagePreview || (formData.image_url?.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${formData.image_url}` : formData.image_url)} 
                        alt="Product preview" 
                        className="w-32 h-32 object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50 transition-colors">
                      <ImageIcon size={24} className="text-gray-400 mb-2" />
                      <span className="text-xs text-gray-500">Upload Image</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>
                  )}
                  <p className="text-xs text-gray-500 mt-2">Max 5MB. JPEG, PNG, or WebP</p>
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-[#14532D] hover:bg-[#166534]" 
                data-testid="product-submit-button"
                disabled={uploadingImage}
              >
                {uploadingImage ? 'Uploading...' : (editProduct ? 'Update' : 'Create')} Product
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
              <th>PRODUCT NAME</th>
              <th>TYPE</th>
              <th>CATEGORY</th>
              <th>LIFECYCLE</th>
              <th className="text-center">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.id} data-testid={`product-row-${product.id}`}>
                <td className="font-medium">
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img 
                        src={product.image_url?.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${product.image_url}` : product.image_url}
                        alt={product.name}
                        className="w-10 h-10 object-cover rounded-md border"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-md flex items-center justify-center">
                        <ImageIcon size={16} className="text-gray-400" />
                      </div>
                    )}
                    <span>{product.name}</span>
                  </div>
                </td>
                <td>
                  {product.product_type ? (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      product.product_type === 'Fruits' ? 'bg-orange-100 text-orange-700' :
                      product.product_type === 'Vegetables' ? 'bg-green-100 text-green-700' :
                      product.product_type === 'Exotic' ? 'bg-purple-100 text-purple-700' :
                      product.product_type === 'Leafy' ? 'bg-emerald-100 text-emerald-700' :
                      product.product_type === 'Herbs' ? 'bg-teal-100 text-teal-700' :
                      product.product_type === 'Mushrooms' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {product.product_type}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">-</span>
                  )}
                </td>
                <td>{product.category}</td>
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
                  <div>
                    <Label htmlFor="pkg-verticals">Applicable For *</Label>
                    <select
                      id="pkg-verticals"
                      value={packagingForm.verticals}
                      onChange={(e) => setPackagingForm({ ...packagingForm, verticals: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                    >
                      <option value="both">Both (QC & Retail)</option>
                      <option value="qc">QC Only</option>
                      <option value="retail">Retail Only</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Choose where this variant will be available</p>
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
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Applicable For</th>
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
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {(!pkg.verticals || pkg.verticals.length === 0 || (pkg.verticals.includes('qc') && pkg.verticals.includes('retail'))) ? (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Both</span>
                            ) : (
                              <>
                                {pkg.verticals.includes('qc') && (
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">QC</span>
                                )}
                                {pkg.verticals.includes('retail') && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Retail</span>
                                )}
                              </>
                            )}
                          </div>
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

      {/* ==================== CATEGORIES & TYPES TAB ==================== */}
      {activeSubTab === 'categories' && (
        <div className="space-y-6">
          {/* Categories Section */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Tag size={18} className="text-amber-600" />
                <h3 className="font-semibold">Product Categories</h3>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{categories.length}</span>
              </div>
              <Dialog open={showCategoryDialog} onOpenChange={(val) => {
                setShowCategoryDialog(val);
                if (!val) {
                  setEditCategory(null);
                  setCategoryForm({ name: '' });
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                    <Plus size={14} className="mr-1" />
                    Add Category
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>{editCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmitCategory} className="space-y-4">
                    <div>
                      <Label htmlFor="cat-name">Category Name</Label>
                      <Input
                        id="cat-name"
                        placeholder="e.g., Vegetables, Fruits, Leafy"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm({ name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowCategoryDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-amber-600 hover:bg-amber-700">
                        {editCategory ? 'Update' : 'Add'} Category
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="p-4">
              {categories.length === 0 ? (
                <p className="text-center text-gray-500 py-6">No categories yet. Add your first category.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <span className="font-medium text-amber-800">{cat.name}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditCategory(cat);
                            setCategoryForm({ name: cat.name });
                            setShowCategoryDialog(true);
                          }}
                        >
                          <Edit size={12} className="text-amber-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleDeleteCategory(cat)}
                        >
                          <Trash size={12} className="text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Types Section */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-teal-600" />
                <h3 className="font-semibold">Product Types</h3>
                <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{productTypes.length}</span>
              </div>
              <Dialog open={showTypeDialog} onOpenChange={(val) => {
                setShowTypeDialog(val);
                if (!val) {
                  setEditType(null);
                  setTypeForm({ name: '' });
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                    <Plus size={14} className="mr-1" />
                    Add Type
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>{editType ? 'Edit Type' : 'Add Type'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmitType} className="space-y-4">
                    <div>
                      <Label htmlFor="type-name">Type Name</Label>
                      <Input
                        id="type-name"
                        placeholder="e.g., Fruits, Vegetables, Exotic"
                        value={typeForm.name}
                        onChange={(e) => setTypeForm({ name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowTypeDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
                        {editType ? 'Update' : 'Add'} Type
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="p-4">
              {productTypes.length === 0 ? (
                <p className="text-center text-gray-500 py-6">No types yet. Add your first type.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {productTypes.map((type) => (
                    <div key={type.id} className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-lg">
                      <span className="font-medium text-teal-800">{type.name}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditType(type);
                            setTypeForm({ name: type.name });
                            setShowTypeDialog(true);
                          }}
                        >
                          <Edit size={12} className="text-teal-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleDeleteType(type)}
                        >
                          <Trash size={12} className="text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-600">
            <p><strong>Categories</strong> - Used to classify products (e.g., Vegetables, Leafy, Fruits)</p>
            <p className="mt-1"><strong>Types</strong> - Used for additional classification (e.g., Exotic, Herbs, Mushrooms)</p>
            <p className="mt-2 text-xs text-gray-500">Both Categories and Types appear as dropdowns when adding/editing products.</p>
          </div>
        </div>
      )}

      {/* ==================== RETAILER CATALOGUE TAB ==================== */}
      {activeSubTab === 'catalogue' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Retailer Catalogue</h2>
              <p className="text-sm text-gray-500">
                Configure which products and variants are available for retailer ordering
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Expand all categories
                  const allExpanded = {};
                  Object.keys(catalogueProductsByCategory).forEach(cat => {
                    allExpanded[cat] = true;
                  });
                  setExpandedCatalogueCategories(allExpanded);
                }}
              >
                Expand All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExpandedCatalogueCategories({})}
              >
                Collapse All
              </Button>
            </div>
          </div>

          {/* Categories and Products */}
          {catalogueLoading ? (
            <div className="text-center py-8 text-gray-500">Loading catalogue...</div>
          ) : Object.keys(catalogueProductsByCategory).length === 0 ? (
            <div className="text-center py-8 text-gray-500">No products available. Add products first.</div>
          ) : (
            <div className="space-y-3">
              {Object.entries(catalogueProductsByCategory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, categoryProducts]) => {
                  const isExpanded = expandedCatalogueCategories[category];
                  const catalogueCount = categoryProducts.filter(p => getCatalogueItem(p.id)).length;
                  
                  return (
                    <div key={category} className="border rounded-lg bg-white shadow-sm overflow-hidden">
                      {/* Category Header */}
                      <div
                        className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-50 to-emerald-50 cursor-pointer hover:from-teal-100 hover:to-emerald-100 transition-colors"
                        onClick={() => toggleCatalogueCategory(category)}
                      >
                        <div className="flex items-center gap-3">
                          <ChevronRight
                            size={18}
                            className={`text-teal-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                          <span className="font-semibold text-gray-800">{category}</span>
                          <span className="text-xs px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full">
                            {catalogueCount}/{categoryProducts.length} in catalogue
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {catalogueCount < categoryProducts.length && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-teal-300 text-teal-700 hover:bg-teal-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                addCategoryToCatalogue(category, categoryProducts);
                              }}
                            >
                              <Plus size={12} className="mr-1" /> Add All
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Products Table */}
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left px-4 py-2 font-medium text-gray-600 w-12">#</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600 w-16">Image</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600">Product Name</th>
                                <th className="text-left px-4 py-2 font-medium text-gray-600">Variants</th>
                                <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Show on Portal?</th>
                                <th className="text-center px-4 py-2 font-medium text-gray-600 w-28">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {categoryProducts.map((product, idx) => {
                                const catalogueItem = getCatalogueItem(product.id);
                                const isEditing = editingCatalogueItem === product.id;
                                const isSaving = catalogueSaving[product.id];
                                
                                return (
                                  <CatalogueProductRow
                                    key={product.id}
                                    product={product}
                                    index={idx}
                                    catalogueItem={catalogueItem}
                                    isEditing={isEditing}
                                    isSaving={isSaving}
                                    packagingVariants={packagingVariants}
                                    getVariantNames={getVariantNames}
                                    onEdit={() => setEditingCatalogueItem(product.id)}
                                    onSave={(variants) => saveCatalogueItem(product, variants)}
                                    onCancel={() => setEditingCatalogueItem(null)}
                                    onRemove={() => removeCatalogueItem(product.id, product.name)}
                                    onToggleVisibility={toggleCatalogueVisibility}
                                  />
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Summary Footer */}
          <div className="bg-gray-50 border rounded-lg p-4 mt-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">Total Products:</span>
                <span className="ml-2 font-semibold">{products.length}</span>
              </div>
              <div>
                <span className="text-gray-500">In Catalogue:</span>
                <span className="ml-2 font-semibold text-teal-600">{catalogueItems.length}</span>
              </div>
              <div>
                <span className="text-gray-500">Not in Catalogue:</span>
                <span className="ml-2 font-semibold text-orange-600">
                  {products.length - catalogueItems.length}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Only products added to the catalogue will be visible to retailers for ordering.
            </p>
          </div>
        </div>
      )}

      {/* Packaging Migration Dialog */}
      {showPackagingMigrationDialog && packagingUsageInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-amber-700">
              ⚠️ Packaging In Use
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              The packaging "<strong>{packagingUsageInfo.packaging_name}</strong>" is used in:
            </p>
            <ul className="text-sm mb-4 space-y-1">
              {packagingUsageInfo.usage?.qc_indents > 0 && (
                <li className="flex justify-between">
                  <span>QC Indents:</span>
                  <span className="font-medium">{packagingUsageInfo.usage.qc_indents}</span>
                </li>
              )}
              {packagingUsageInfo.usage?.qc_dispatches > 0 && (
                <li className="flex justify-between">
                  <span>QC Dispatches:</span>
                  <span className="font-medium">{packagingUsageInfo.usage.qc_dispatches}</span>
                </li>
              )}
              {packagingUsageInfo.usage?.retailer_indents > 0 && (
                <li className="flex justify-between">
                  <span>Retailer Indents:</span>
                  <span className="font-medium">{packagingUsageInfo.usage.retailer_indents}</span>
                </li>
              )}
              <li className="flex justify-between border-t pt-1 mt-1">
                <span className="font-medium">Total Records:</span>
                <span className="font-bold text-amber-700">{packagingUsageInfo.usage?.total}</span>
              </li>
            </ul>
            <p className="text-sm text-gray-600 mb-4">
              Please select a replacement packaging to migrate these entries:
            </p>
            <select
              value={replacementPackagingId}
              onChange={(e) => setReplacementPackagingId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mb-4 text-sm"
            >
              <option value="">-- Select Replacement Packaging --</option>
              {packagingVariants
                .filter(p => p.id !== packagingToDelete)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.weight_gm}gm)
                  </option>
                ))}
            </select>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPackagingMigrationDialog(false);
                  setPackagingToDelete(null);
                  setPackagingUsageInfo(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={handlePackagingMigrationDelete}
                disabled={!replacementPackagingId}
              >
                Migrate & Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}