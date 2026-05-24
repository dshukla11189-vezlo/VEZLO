/**
 * useQCData - Custom hook for Quick Commerce data management
 * Centralizes all QC-related data fetching and state management
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import api from '../../utils/api';
import { toast } from 'sonner';

// Helper function to fetch with retry
const fetchWithRetry = async (url, maxRetries = 3, delay = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await api.get(url);
      return response;
    } catch (error) {
      lastError = error;
      // Only retry on network errors or 5xx errors
      if (error.response && error.response.status < 500) {
        throw error; // Don't retry 4xx errors
      }
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  throw lastError;
};

export function useQCData() {
  const [indents, setIndents] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [grns, setGrns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingVariants, setPackagingVariants] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadAttemptRef = useRef(0);

  // Build product lookup map
  const productMap = useMemo(() => {
    const map = new Map();
    products.forEach(p => {
      if (p.id) map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    });
    return map;
  }, [products]);

  // Load all data with retry logic
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      loadAttemptRef.current += 1;
      const currentAttempt = loadAttemptRef.current;
      
      // Fetch all data with individual retry logic
      // Use Promise.allSettled to handle partial failures
      const results = await Promise.allSettled([
        fetchWithRetry('/api/qc-indents'),
        fetchWithRetry('/api/qc-dispatches'),
        fetchWithRetry('/api/qc-grns'),
        fetchWithRetry('/api/qc-customers'),
        fetchWithRetry('/api/products?include_images=false'),
        fetchWithRetry('/api/qc-packaging'),
        fetchWithRetry('/api/qc-invoices')
      ]);
      
      // Check if this is still the latest load attempt
      if (currentAttempt !== loadAttemptRef.current) {
        return; // Abort if a newer load was triggered
      }
      
      // Process results - set data for successful fetches, keep existing for failed
      const [indentRes, dispatchRes, grnRes, customerRes, productRes, packagingRes, invoiceRes] = results;
      
      if (indentRes.status === 'fulfilled') setIndents(indentRes.value.data || []);
      if (dispatchRes.status === 'fulfilled') setDispatches(dispatchRes.value.data || []);
      if (grnRes.status === 'fulfilled') setGrns(grnRes.value.data || []);
      if (customerRes.status === 'fulfilled') setCustomers(customerRes.value.data || []);
      if (productRes.status === 'fulfilled') setProducts(productRes.value.data || []);
      if (packagingRes.status === 'fulfilled') setPackagingVariants(packagingRes.value.data || []);
      if (invoiceRes.status === 'fulfilled') setInvoices(invoiceRes.value.data || []);
      
      // Check if any failed completely
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount > 0 && failedCount < results.length) {
        console.warn(`${failedCount} of ${results.length} data sources failed to load`);
      } else if (failedCount === results.length) {
        throw new Error('All data sources failed to load');
      }
    } catch (err) {
      console.error('Error loading QC data:', err);
      toast.error('Failed to load data. Retrying...');
      // Auto-retry after 3 seconds if complete failure
      setTimeout(() => {
        if (loadAttemptRef.current === loadAttemptRef.current) {
          loadData();
        }
      }, 3000);
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
