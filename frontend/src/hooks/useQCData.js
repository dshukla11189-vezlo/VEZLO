/**
 * useQCData - Custom hook for Quick Commerce data management
 * Centralizes all QC-related data fetching and state management
 */
import { useState, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { toast } from 'sonner';

export function useQCData() {
  const [indents, setIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [grns, setGrns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingVariants, setPackagingVariants] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Build product lookup map
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    });
    return map;
  }, [products]);

  // Load all data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [indentRes, dispatchRes, grnRes, customerRes, productRes, packagingRes, invoiceRes] = await Promise.all([
        api.get('/api/qc-indents'),
        api.get('/api/qc-dispatches'),
        api.get('/api/qc-grns'),
        api.get('/api/qc-customers'),
        api.get('/api/products?include_images=false'),
        api.get('/api/qc-packaging'),
        api.get('/api/qc-invoices')
      ]);
      
      setIndents(indentRes.data || []);
      setDispatches(dispatchRes.data || []);
      setGrns(grnRes.data || []);
      setCustomers(customerRes.data || []);
      setProducts(productRes.data || []);
      setPackagingVariants(packagingRes.data || []);
      setInvoices(invoiceRes.data || []);
    } catch (err) {
      console.error('Error loading QC data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload specific data types
  const reloadIndents = useCallback(async () => {
    try {
      const res = await api.get('/api/qc-indents');
      setIndents(res.data || []);
    } catch (err) {
      console.error('Error reloading indents:', err);
    }
  }, []);

  const reloadDispatches = useCallback(async () => {
    try {
      const res = await api.get('/api/qc-dispatches');
      setDispatches(res.data || []);
    } catch (err) {
      console.error('Error reloading dispatches:', err);
    }
  }, []);

  const reloadGrns = useCallback(async () => {
    try {
      const res = await api.get('/api/qc-grns');
      setGrns(res.data || []);
    } catch (err) {
      console.error('Error reloading GRNs:', err);
    }
  }, []);

  const reloadInvoices = useCallback(async () => {
    try {
      const res = await api.get('/api/qc-invoices');
      setInvoices(res.data || []);
    } catch (err) {
      console.error('Error reloading invoices:', err);
    }
  }, []);

  const reloadCustomers = useCallback(async () => {
    try {
      const res = await api.get('/api/qc-customers');
      setCustomers(res.data || []);
    } catch (err) {
      console.error('Error reloading customers:', err);
    }
  }, []);

  const reloadPackaging = useCallback(async () => {
    try {
      const res = await api.get('/api/qc-packaging');
      setPackagingVariants(res.data || []);
    } catch (err) {
      console.error('Error reloading packaging:', err);
    }
  }, []);

  return {
    // Data
    indents,
    dispatches,
    grns,
    customers,
    products,
    packagingVariants,
    invoices,
    loading,
    productMap,
    
    // Setters (for local mutations)
    setIndents,
    setDispatches,
    setGrns,
    setCustomers,
    setProducts,
    setPackagingVariants,
    setInvoices,
    
    // Actions
    loadData,
    reloadIndents,
    reloadDispatches,
    reloadGrns,
    reloadInvoices,
    reloadCustomers,
    reloadPackaging,
  };
}

/**
 * useProductTranslation - Hook for translating product names
 */
export function useProductTranslation(productMap, language) {
  const getProductName = useCallback((item) => {
    if (!item) return '';
    
    const isHindi = language === 'hi';
    
    // If it's a full product object with name_hi already
    if (item.name_hi && isHindi) {
      return item.name_hi;
    }
    
    // Try to find the product in our lookup map
    let product = null;
    
    // First try by product_id
    if (item.product_id) {
      product = productMap.get(item.product_id);
    }
    
    // Then try by name match
    if (!product) {
      const itemName = item.product_name || item.name;
      if (itemName) {
        product = productMap.get(itemName);
      }
    }
    
    // If we found a matching product, return translated name
    if (product) {
      if (isHindi && product.name_hi) {
        return product.name_hi;
      }
      return product.name;
    }
    
    // Fallback to the original name
    return item.product_name || item.name || '';
  }, [productMap, language]);

  return { getProductName };
}

export default useQCData;
