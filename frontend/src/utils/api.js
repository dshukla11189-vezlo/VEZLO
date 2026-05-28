import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Store recent errors for debugging
const errorLog = [];
const MAX_ERRORS = 20;

const logError = (error, config) => {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    url: config?.url || 'unknown',
    method: config?.method || 'unknown',
    status: error.response?.status || 'network_error',
    message: error.message,
    data: error.response?.data,
  };
  
  errorLog.push(errorEntry);
  if (errorLog.length > MAX_ERRORS) {
    errorLog.shift();
  }
  
  // Log to console for debugging
  console.error('[API Error]', errorEntry);
};

// Expose error log for debugging (can be accessed via browser console: window.__apiErrors)
if (typeof window !== 'undefined') {
  window.__apiErrors = errorLog;
  window.__checkApiHealth = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/health`);
      console.log('[API Health]', response.data);
      return response.data;
    } catch (e) {
      console.error('[API Health Check Failed]', e.message);
      return { error: e.message };
    }
  };
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // Start with 1 second
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Timeout, Rate limit, Server errors
  retryableMethods: ['get', 'head', 'options', 'put', 'delete'], // Safe to retry
};

// Sleep function for retry delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check if request should be retried
const shouldRetry = (error, retryCount) => {
  if (retryCount >= RETRY_CONFIG.maxRetries) return false;
  
  // Retry on network errors (no response)
  if (!error.response) return true;
  
  // Retry on specific status codes
  if (RETRY_CONFIG.retryableStatuses.includes(error.response.status)) return true;
  
  return false;
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,  // 45 second timeout (increased for cold starts)
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Add timestamp to bust cache for GET requests
  if (config.method === 'get') {
    config.params = {
      ...config.params,
      _t: Date.now()
    };
  }
  // Initialize retry count
  config.__retryCount = config.__retryCount || 0;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    
    // Check if we should retry
    if (config && shouldRetry(error, config.__retryCount)) {
      config.__retryCount += 1;
      
      // Calculate delay with exponential backoff
      const delay = RETRY_CONFIG.retryDelay * Math.pow(2, config.__retryCount - 1);
      
      console.warn(`[API Retry] Attempt ${config.__retryCount}/${RETRY_CONFIG.maxRetries} for ${config.url} after ${delay}ms`);
      
      await sleep(delay);
      
      // Retry the request
      return api(config);
    }
    
    // Log all final errors
    logError(error, config);
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    // Enhance error message for debugging
    if (!error.response) {
      error.message = `Network error: ${error.message}. The server may be busy, please try again.`;
    } else if (error.response.status >= 500) {
      error.message = `Server error (${error.response.status}): ${error.response.data?.detail || 'Please try again in a moment.'}`;
    }
    
    return Promise.reject(error);
  }
);

export default api;