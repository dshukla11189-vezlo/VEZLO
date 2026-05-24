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
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log all errors
    logError(error, error.config);
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    // Enhance error message for debugging
    if (!error.response) {
      error.message = `Network error: ${error.message}. Check your internet connection.`;
    }
    
    return Promise.reject(error);
  }
);

export default api;