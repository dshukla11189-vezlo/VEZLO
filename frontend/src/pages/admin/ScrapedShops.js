import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Search, Download, Play, RefreshCw, MapPin, Phone, Store, 
  CheckCircle, XCircle, Edit2, Trash2, ChevronLeft, ChevronRight,
  Filter, Building2, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api';

const ScrapedShops = () => {
  // State
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [scraperStatus, setScraperStatus] = useState({ status: 'idle' });
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState(false);
  
  // Pagination
  const [skip, setSkip] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  
  // Edit modal
  const [editingShop, setEditingShop] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Load shops
  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (areaFilter) params.append('area', areaFilter);
      if (typeFilter) params.append('shop_type', typeFilter);
      if (phoneFilter) params.append('has_phone', 'true');
      params.append('skip', skip.toString());
      params.append('limit', limit.toString());
      
      const response = await api.get(`/api/scraped-shops?${params}`);
      setShops(response.data.shops || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error loading shops:', error);
      toast.error('Failed to load shops');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, areaFilter, typeFilter, phoneFilter, skip, limit]);

  // Load stats
  const loadStats = async () => {
    try {
      const response = await api.get('/api/scraper/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Load scraper status
  const loadScraperStatus = async () => {
    try {
      const response = await api.get('/api/scraper/status');
      setScraperStatus(response.data);
    } catch (error) {
      console.error('Error loading scraper status:', error);
    }
  };

  // Initial load
  useEffect(() => {
    loadShops();
    loadStats();
    loadScraperStatus();
  }, [loadShops]);

  // Poll scraper status while running
  useEffect(() => {
    if (scraperStatus.status === 'running') {
      const interval = setInterval(() => {
        loadScraperStatus();
        loadStats();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [scraperStatus.status]);

  // Start scraper
  const startScraper = async () => {
    try {
      const response = await api.post('/api/scraper/start', { max_shops: 1500 });
      toast.success(response.data.message);
      setScraperStatus(response.data.status);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start scraper');
    }
  };

  // Export to CSV
  const exportCSV = async () => {
    try {
      const response = await api.get('/api/scraped-shops/export', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pune_retail_shops_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Export downloaded successfully');
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  // Delete shop
  const deleteShop = async (shopId) => {
    if (!window.confirm('Are you sure you want to delete this shop?')) return;
    
    try {
      await api.delete(`/api/scraped-shops/${shopId}`);
      toast.success('Shop deleted');
      loadShops();
      loadStats();
    } catch (error) {
      toast.error('Failed to delete shop');
    }
  };

  // Update shop
  const updateShop = async () => {
    if (!editingShop) return;
    
    try {
      await api.put(`/api/scraped-shops/${editingShop.id}`, editForm);
      toast.success('Shop updated');
      setEditingShop(null);
      loadShops();
    } catch (error) {
      toast.error('Failed to update shop');
    }
  };

  // Open edit modal
  const openEditModal = (shop) => {
    setEditingShop(shop);
    setEditForm({
      name: shop.name || '',
      address: shop.address || '',
      phone: shop.phone || '',
      area: shop.area || '',
      shop_type: shop.shop_type || '',
      verified: shop.verified || false,
      notes: shop.notes || ''
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="text-blue-600" />
              Pune Retail Shops Scraper
            </h1>
            <p className="text-gray-600 text-sm">
              Scrape and manage grocery stores, kirana shops, and supermarkets data
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={startScraper}
              disabled={scraperStatus.status === 'running'}
              className="bg-green-600 hover:bg-green-700"
            >
              {scraperStatus.status === 'running' ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play size={16} className="mr-2" />
                  Start Scraper
                </>
              )}
            </Button>
            
            <Button variant="outline" onClick={exportCSV} disabled={total === 0}>
              <Download size={16} className="mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Scraper Status */}
        {scraperStatus.status === 'running' && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-800">Scraper Running</p>
                  <p className="text-sm text-blue-600">{scraperStatus.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {scraperStatus.status === 'completed' && scraperStatus.result && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Scraping Completed</p>
                  <p className="text-sm text-green-600">
                    Scraped: {scraperStatus.result.total_scraped} | 
                    Saved: {scraperStatus.result.total_saved} | 
                    Duplicates: {scraperStatus.result.duplicates_skipped}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Store size={24} className="mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold text-gray-900">{stats.total_shops?.toLocaleString() || 0}</p>
                <p className="text-xs text-gray-500">Total Shops</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <MapPin size={24} className="mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold text-gray-900">{Object.keys(stats.top_areas || {}).length}</p>
                <p className="text-xs text-gray-500">Areas Covered</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.by_source?.JustDial || 0}</p>
                <p className="text-xs text-gray-500">From JustDial</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.by_source?.['Google Maps'] || 0}</p>
                <p className="text-xs text-gray-500">From Google Maps</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Shop Type Distribution */}
        {stats?.by_type && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Shop Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.by_type).map(([type, count]) => (
                  <span 
                    key={type}
                    className="px-3 py-1 bg-gray-100 rounded-full text-sm cursor-pointer hover:bg-gray-200"
                    onClick={() => setTypeFilter(type === typeFilter ? '' : type)}
                  >
                    {type}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search by shop name..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSkip(0); }}
                  className="pl-9"
                />
              </div>
              
              <div className="flex-1 relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Filter by area..."
                  value={areaFilter}
                  onChange={(e) => { setAreaFilter(e.target.value); setSkip(0); }}
                  className="pl-9"
                />
              </div>
              
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setSkip(0); }}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="">All Types</option>
                <option value="Supermarket">Supermarket</option>
                <option value="Kirana Store">Kirana Store</option>
                <option value="Grocery Store">Grocery Store</option>
                <option value="Convenience Store">Convenience Store</option>
                <option value="Retail Store">Retail Store</option>
              </select>
              
              <Button
                variant={phoneFilter ? "default" : "outline"}
                onClick={() => { setPhoneFilter(!phoneFilter); setSkip(0); }}
                className="whitespace-nowrap"
              >
                <Phone size={14} className="mr-1" />
                Has Phone
              </Button>
              
              <Button variant="outline" onClick={() => { loadShops(); loadStats(); }}>
                <RefreshCw size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Shops Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                <Loader2 size={24} className="mx-auto animate-spin mb-2" />
                Loading shops...
              </div>
            ) : shops.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Store size={48} className="mx-auto mb-2 opacity-50" />
                <p>No shops found. Start the scraper to collect data.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-3 text-left font-semibold">Shop Name</th>
                        <th className="p-3 text-left font-semibold">Address</th>
                        <th className="p-3 text-left font-semibold">Phone</th>
                        <th className="p-3 text-left font-semibold">Area</th>
                        <th className="p-3 text-left font-semibold">Type</th>
                        <th className="p-3 text-center font-semibold">Source</th>
                        <th className="p-3 text-center font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shops.map((shop, idx) => (
                        <tr key={shop.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {shop.verified && <CheckCircle size={14} className="text-green-600" />}
                              <span className="font-medium">{shop.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-600 max-w-xs truncate" title={shop.address}>
                            {shop.address}
                          </td>
                          <td className="p-3">
                            {shop.phone ? (
                              <a href={`tel:${shop.phone}`} className="text-blue-600 hover:underline flex items-center gap-1">
                                <Phone size={12} />
                                {shop.phone}
                              </a>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3">{shop.area}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              shop.shop_type === 'Supermarket' ? 'bg-blue-100 text-blue-700' :
                              shop.shop_type === 'Kirana Store' ? 'bg-green-100 text-green-700' :
                              shop.shop_type === 'Grocery Store' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {shop.shop_type}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              shop.source === 'JustDial' ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {shop.source}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEditModal(shop)}>
                                <Edit2 size={14} />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteShop(shop.id)}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination */}
                <div className="p-4 border-t flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing {skip + 1} - {Math.min(skip + limit, total)} of {total} shops
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={skip === 0}
                      onClick={() => setSkip(Math.max(0, skip - limit))}
                    >
                      <ChevronLeft size={14} className="mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={skip + limit >= total}
                      onClick={() => setSkip(skip + limit)}
                    >
                      Next
                      <ChevronRight size={14} className="ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit Modal */}
        {editingShop && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Edit2 size={18} />
                  Edit Shop
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Shop Name</label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Address</label>
                  <Input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Area</label>
                    <Input
                      value={editForm.area}
                      onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Shop Type</label>
                  <select
                    value={editForm.shop_type}
                    onChange={(e) => setEditForm({ ...editForm, shop_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="Supermarket">Supermarket</option>
                    <option value="Kirana Store">Kirana Store</option>
                    <option value="Grocery Store">Grocery Store</option>
                    <option value="Convenience Store">Convenience Store</option>
                    <option value="Retail Store">Retail Store</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Notes</label>
                  <Input
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Add notes..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.verified}
                    onChange={(e) => setEditForm({ ...editForm, verified: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-sm">Mark as verified</label>
                </div>
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setEditingShop(null)}>
                    Cancel
                  </Button>
                  <Button onClick={updateShop}>
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScrapedShops;
