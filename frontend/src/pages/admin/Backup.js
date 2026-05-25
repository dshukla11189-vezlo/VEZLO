import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Database, Download, Mail, Clock, CheckCircle, AlertCircle, Loader2, Link2, Unlink, RefreshCw, CloudDownload, Server, Bug, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  
  // Gmail state
  const [gmailStatus, setGmailStatus] = useState(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  
  // Production sync state
  const [prodSyncLoading, setProdSyncLoading] = useState(false);
  const [prodUrl, setProdUrl] = useState('https://harvest-hub-384.emergent.host');
  const [prodEmail, setProdEmail] = useState('admin@freshflow.com');
  const [prodPassword, setProdPassword] = useState('admin123');
  const [syncStatus, setSyncStatus] = useState(null);
  
  // Full sync state
  const [fullSyncLoading, setFullSyncLoading] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [syncMode, setSyncMode] = useState('merge'); // 'merge' or 'replace'
  const [fullSyncResults, setFullSyncResults] = useState(null);
  
  // Error Logs state
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogs, setErrorLogs] = useState(null);
  const [errorSummary, setErrorSummary] = useState(null);
  const [showErrorLogs, setShowErrorLogs] = useState(false);
  const [selectedError, setSelectedError] = useState(null);

  useEffect(() => {
    loadStatus();
    loadGmailStatus();
    loadSyncStatus();
    
    // Check URL params for Gmail OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_success')) {
      toast.success('Gmail connected successfully!');
      loadGmailStatus();
      window.history.replaceState({}, '', '/admin/backup');
    } else if (params.get('gmail_error')) {
      toast.error(`Gmail connection failed: ${params.get('gmail_error')}`);
      window.history.replaceState({}, '', '/admin/backup');
    }
  }, []);

  const loadSyncStatus = async () => {
    try {
      const response = await api.get('/api/sync-status');
      setSyncStatus(response.data);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  const [directSyncLoading, setDirectSyncLoading] = useState(false);

  const syncFromProduction = async () => {
    if (!prodUrl) {
      toast.error('Please enter the production URL');
      return;
    }
    
    setProdSyncLoading(true);
    try {
      const response = await api.post('/api/sync-from-production', {
        production_url: prodUrl,
        admin_email: prodEmail,
        admin_password: prodPassword,
        reset_passwords: true,
        default_password: 'admin123'
      });
      
      if (response.data.message) {
        toast.success(response.data.message);
        loadSyncStatus();
      }
    } catch (error) {
      console.error('Failed to sync from production:', error);
      toast.error(error.response?.data?.detail || 'Failed to sync from production');
    } finally {
      setProdSyncLoading(false);
    }
  };

  // Direct API sync for collections not in Excel backup
  const syncDirectFromAPI = async () => {
    if (!prodUrl) {
      toast.error('Please enter the production URL');
      return;
    }
    
    setDirectSyncLoading(true);
    try {
      const response = await api.post('/api/sync-from-production-direct', {
        production_url: prodUrl,
        admin_email: prodEmail,
        admin_password: prodPassword,
        reset_passwords: false // Don't reset passwords on direct sync
      });
      
      if (response.data.message) {
        toast.success(response.data.message);
        // Show detailed results
        const results = response.data.collections || {};
        const syncedCount = Object.values(results).filter(r => r.status === 'synced').length;
        toast.info(`Direct sync: ${syncedCount} collections updated`);
        loadSyncStatus();
      }
    } catch (error) {
      console.error('Failed to direct sync from production:', error);
      toast.error(error.response?.data?.detail || 'Failed to direct sync');
    } finally {
      setDirectSyncLoading(false);
    }
  };

  // Full sync from production with images
  const fullSyncFromProduction = async () => {
    if (!prodUrl) {
      toast.error('Please enter the production URL');
      return;
    }
    
    setFullSyncLoading(true);
    setFullSyncResults(null);
    
    try {
      const response = await api.post('/api/sync-from-production-full', {
        production_url: prodUrl,
        admin_email: prodEmail,
        admin_password: prodPassword,
        include_images: includeImages,
        sync_mode: syncMode
      });
      
      if (response.data.message) {
        toast.success(response.data.message);
        setFullSyncResults(response.data);
        loadSyncStatus();
      }
    } catch (error) {
      console.error('Failed to full sync from production:', error);
      toast.error(error.response?.data?.detail || 'Failed to sync from production');
    } finally {
      setFullSyncLoading(false);
    }
  };


  const loadGmailStatus = async () => {
    try {
      const response = await api.get('/api/oauth/gmail/status');
      setGmailStatus(response.data);
    } catch (error) {
      console.error('Failed to load Gmail status:', error);
    }
  };

  const connectGmail = async () => {
    setGmailLoading(true);
    try {
      const response = await api.get('/api/oauth/gmail/login');
      // Log redirect URI for debugging
      console.log('Gmail OAuth redirect_uri:', response.data.debug_redirect_uri);
      console.log('This URI must EXACTLY match what is in Google Cloud Console');
      // Redirect to Google OAuth
      window.location.href = response.data.auth_url;
    } catch (error) {
      console.error('Failed to start Gmail OAuth:', error);
      toast.error(error.response?.data?.detail || 'Failed to connect Gmail');
      setGmailLoading(false);
    }
  };

  const disconnectGmail = async () => {
    setGmailLoading(true);
    try {
      await api.post('/api/oauth/gmail/disconnect');
      toast.success('Gmail disconnected');
      setGmailStatus({ connected: false });
    } catch (error) {
      console.error('Failed to disconnect Gmail:', error);
      toast.error('Failed to disconnect Gmail');
    } finally {
      setGmailLoading(false);
    }
  };

  const syncGrnNow = async () => {
    setSyncLoading(true);
    try {
      const response = await api.post('/api/gmail/auto-sync-grn');
      if (response.data.processed > 0) {
        toast.success(`Synced ${response.data.processed} Ninjacart emails!`);
      } else {
        toast.info('No new Ninjacart emails found');
      }
      loadGmailStatus();
    } catch (error) {
      console.error('Failed to sync:', error);
      toast.error(error.response?.data?.detail || 'Failed to sync GRN from Gmail');
    } finally {
      setSyncLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const response = await api.get('/api/backup/status');
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to load backup status:', error);
      toast.error('Failed to load backup status');
    } finally {
      setLoading(false);
    }
  };

  const triggerBackup = async () => {
    setTriggerLoading(true);
    try {
      const response = await api.post('/api/backup/trigger');
      if (response.data.success) {
        toast.success('Backup sent successfully to all recipients!');
      } else {
        toast.error(response.data.message || 'Failed to send backup');
      }
    } catch (error) {
      console.error('Failed to trigger backup:', error);
      toast.error(error.response?.data?.detail || 'Failed to trigger backup');
    } finally {
      setTriggerLoading(false);
    }
  };

  const downloadBackup = async () => {
    setDownloadLoading(true);
    try {
      const response = await api.get('/api/backup/download', {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const today = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `MrOrganix_Backup_${today}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Backup downloaded successfully!');
    } catch (error) {
      console.error('Failed to download backup:', error);
      toast.error('Failed to download backup');
    } finally {
      setDownloadLoading(false);
    }
  };

  // ============== ERROR LOGS FUNCTIONS ==============
  const loadErrorLogs = async () => {
    setErrorLogsLoading(true);
    try {
      // Get summary for last 24 hours
      const summaryRes = await api.get('/api/error-logs/summary?hours=24');
      setErrorSummary(summaryRes.data);
      
      // Get detailed logs
      const logsRes = await api.get('/api/error-logs?limit=50');
      setErrorLogs(logsRes.data);
      setShowErrorLogs(true);
      
      if (logsRes.data.summary.total_logs === 0) {
        toast.info('No error logs found - system is running smoothly!');
      } else {
        toast.success(`Loaded ${logsRes.data.summary.total_logs} error logs`);
      }
    } catch (error) {
      console.error('Failed to load error logs:', error);
      toast.error('Failed to load error logs');
    } finally {
      setErrorLogsLoading(false);
    }
  };

  const clearOldErrorLogs = async () => {
    if (!window.confirm('Clear error logs older than 7 days?')) return;
    
    try {
      const response = await api.delete('/api/error-logs/clear?older_than_days=7');
      toast.success(response.data.message);
      loadErrorLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
      toast.error('Failed to clear error logs');
    }
  };

  const formatErrorTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  if (loading) {
    return (
      <Layout title="Data Backup">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Data Backup">
      <div className="space-y-6" data-testid="backup-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Data Backup</h1>
            <p className="text-gray-500 mt-1">Automated daily backups sent to your email</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backup Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Automated Backup Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                {status?.scheduler_running ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={status?.scheduler_running ? 'text-green-700' : 'text-red-700'}>
                  {status?.scheduler_running ? 'Scheduler Running' : 'Scheduler Stopped'}
                </span>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-800 font-medium">Next Backup</p>
                <p className="text-lg font-bold text-blue-900">{status?.next_backup_time}</p>
                <p className="text-xs text-blue-600 mt-1">Daily automated backup</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Recipients:</p>
                <div className="space-y-1">
                  {status?.recipients?.map((email, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">{email}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Manual Backup Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-green-600" />
                Manual Backup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Trigger an immediate backup or download the Excel file directly.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button 
                  onClick={triggerBackup}
                  disabled={triggerLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {triggerLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send Backup Email
                </Button>
                
                <Button 
                  onClick={downloadBackup}
                  disabled={downloadLoading}
                  variant="outline"
                  className="border-green-600 text-green-700 hover:bg-green-50"
                >
                  {downloadLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download Excel
                </Button>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Data Included:</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                  <span className="font-semibold text-green-700">• P&L Daily Summary</span>
                  <span className="font-semibold text-green-700">• P&L Product Detail</span>
                  <span className="font-semibold text-blue-700">• Stock Status Summary</span>
                  <span>• Users & Products</span>
                  <span>• Farmers</span>
                  <span>• Procurements</span>
                  <span>• QC Orders/Dispatches</span>
                  <span>• QC Invoices/GRN</span>
                  <span>• Retailer Orders</span>
                  <span>• Retailer Payments</span>
                  <span>• Variable Expenses</span>
                  <span>• Fixed Expenses</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Gmail Integration Card - Full Width */}
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Mail className="h-5 w-5" />
              Ninjacart GRN Email Automation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Connect Gmail to automatically import Ninjacart GRN data from daily emails at 6:00 AM.
            </p>
            
            <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
              {gmailStatus?.connected ? (
                <>
                  <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-green-700">Gmail Connected</p>
                    <p className="text-sm text-gray-600">{gmailStatus.email}</p>
                    {gmailStatus.last_sync && (
                      <p className="text-xs text-gray-500 mt-1">
                        Last synced: {new Date(gmailStatus.last_sync).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={syncGrnNow}
                      disabled={syncLoading}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {syncLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Sync Now
                    </Button>
                    <Button 
                      onClick={disconnectGmail}
                      disabled={gmailLoading}
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <Unlink className="h-4 w-4 mr-1" />
                      Disconnect
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="h-8 w-8 text-gray-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-gray-700">Gmail Not Connected</p>
                    <p className="text-sm text-gray-500">Connect to enable automatic GRN import</p>
                  </div>
                  <Button 
                    onClick={connectGmail}
                    disabled={gmailLoading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {gmailLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4 mr-2" />
                    )}
                    Connect Gmail
                  </Button>
                </>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-medium text-gray-700">Schedule</p>
                <p className="text-gray-500">Daily at 6:00 AM IST</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-medium text-gray-700">Email Filter</p>
                <p className="text-gray-500">From: Ninjacart</p>
              </div>
              <div className="p-3 bg-gray-50 rounded">
                <p className="font-medium text-gray-700">Data Parsed</p>
                <p className="text-gray-500">CSV Attachments / Email Body</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync from Production Card */}
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <CloudDownload className="h-5 w-5" />
              Sync from Production
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Pull latest data from production app to this preview/test environment. 
              Downloads backup from production and imports it here.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prodUrl">Production URL</Label>
                <Input
                  id="prodUrl"
                  type="text"
                  placeholder="https://your-app.emergent.host"
                  value={prodUrl}
                  onChange={(e) => setProdUrl(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prodEmail">Admin Email</Label>
                <Input
                  id="prodEmail"
                  type="email"
                  placeholder="admin@example.com"
                  value={prodEmail}
                  onChange={(e) => setProdEmail(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prodPassword">Admin Password</Label>
                <Input
                  id="prodPassword"
                  type="password"
                  placeholder="password"
                  value={prodPassword}
                  onChange={(e) => setProdPassword(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button 
                onClick={syncFromProduction}
                disabled={prodSyncLoading || directSyncLoading || !prodUrl}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {prodSyncLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CloudDownload className="h-4 w-4 mr-2" />
                )}
                {prodSyncLoading ? 'Syncing...' : 'Sync from Production'}
              </Button>
              
              <Button 
                onClick={syncDirectFromAPI}
                disabled={prodSyncLoading || directSyncLoading || !prodUrl}
                variant="outline"
                className="border-orange-400 text-orange-700 hover:bg-orange-50"
              >
                {directSyncLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {directSyncLoading ? 'Syncing...' : 'Direct API Sync'}
              </Button>
              
              <Button 
                onClick={loadSyncStatus}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh Status
              </Button>
            </div>
            
            {/* Direct Sync Info */}
            <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg text-sm">
              <p className="font-medium text-orange-800 flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Direct API Sync (for missing data)
              </p>
              <p className="text-orange-700 mt-1">
                Use this if some collections (like Packaging, Units, Labours) are not syncing properly. 
                This pulls data directly from production API endpoints instead of the Excel backup.
              </p>
            </div>
            
            {/* Full Sync with Images Section */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 rounded-lg">
              <p className="font-medium text-green-800 flex items-center gap-2 mb-3">
                <Database className="h-5 w-5" />
                Full Sync with Images (Recommended)
              </p>
              <p className="text-green-700 text-sm mb-4">
                Complete data import from production including all product images. 
                Choose between Merge (update existing, add new) or Replace (fresh import) modes.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label className="text-green-800">Sync Mode</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="syncMode"
                        value="merge"
                        checked={syncMode === 'merge'}
                        onChange={(e) => setSyncMode(e.target.value)}
                        className="text-green-600"
                      />
                      <span className="text-sm text-green-700">Merge/Update</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="syncMode"
                        value="replace"
                        checked={syncMode === 'replace'}
                        onChange={(e) => setSyncMode(e.target.value)}
                        className="text-green-600"
                      />
                      <span className="text-sm text-green-700">Replace All</span>
                    </label>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-green-800">Include Images</Label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeImages}
                      onChange={(e) => setIncludeImages(e.target.checked)}
                      className="text-green-600 rounded"
                    />
                    <span className="text-sm text-green-700">Sync product images (slower but complete)</span>
                  </label>
                </div>
              </div>
              
              <Button 
                onClick={fullSyncFromProduction}
                disabled={fullSyncLoading || !prodUrl}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {fullSyncLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 mr-2" />
                )}
                {fullSyncLoading ? 'Syncing Everything...' : 'Full Sync (with Images)'}
              </Button>
              
              {/* Full Sync Results */}
              {fullSyncResults && (
                <div className="mt-4 p-3 bg-white rounded-lg border border-green-200">
                  <p className="font-medium text-green-800 mb-2">
                    ✓ {fullSyncResults.message}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="bg-green-100 p-2 rounded">
                      <span className="text-green-700">Mode: </span>
                      <span className="font-medium">{fullSyncResults.sync_mode}</span>
                    </div>
                    <div className="bg-green-100 p-2 rounded">
                      <span className="text-green-700">Images: </span>
                      <span className="font-medium">{fullSyncResults.images_synced}</span>
                    </div>
                    <div className="bg-green-100 p-2 rounded">
                      <span className="text-green-700">Collections: </span>
                      <span className="font-medium">{Object.keys(fullSyncResults.collections || {}).length}</span>
                    </div>
                    <div className="bg-green-100 p-2 rounded">
                      <span className="text-green-700">Synced: </span>
                      <span className="font-medium">
                        {Object.values(fullSyncResults.collections || {}).filter(c => c.status === 'synced').length}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {syncStatus && (
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-purple-800">Current Database: {syncStatus.database}</span>
                </div>
                <p className="text-sm text-purple-700 mb-2">Total Records: {syncStatus.total_records?.toLocaleString()}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {syncStatus.collections && Object.entries(syncStatus.collections).slice(0, 8).map(([coll, count]) => (
                    <div key={coll} className="flex justify-between bg-white p-2 rounded">
                      <span className="text-gray-600">{coll}:</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-purple-500 mt-2">
                  Last checked: {new Date(syncStatus.last_checked).toLocaleString()}
                </p>
              </div>
            )}
            
            <div className="bg-green-50 border border-green-200 p-3 rounded-lg text-sm">
              <p className="font-medium text-green-800">How it works:</p>
              <ol className="list-decimal list-inside text-green-700 mt-1 space-y-1">
                <li>Logs into your Production app</li>
                <li>Downloads the backup Excel file</li>
                <li>Imports all data into Preview</li>
                <li>Resets passwords to "admin123"</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Collections List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Collections Being Backed Up</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {status?.collections_backed_up?.map((collection, idx) => (
                <span 
                  key={idx}
                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-mono"
                >
                  {collection}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ============== PRODUCTION ERROR LOGS SECTION ============== */}
        <Card className="border-red-200 bg-red-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug className="text-red-600" size={20} />
                <CardTitle className="text-lg text-red-800">Production Error Logs</CardTitle>
              </div>
              <div className="flex gap-2">
                {showErrorLogs && errorLogs?.summary?.total_logs > 0 && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={clearOldErrorLogs}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    <Trash2 size={14} className="mr-1" /> Clear Old
                  </Button>
                )}
                <Button 
                  size="sm" 
                  onClick={loadErrorLogs}
                  disabled={errorLogsLoading}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {errorLogsLoading ? (
                    <Loader2 size={14} className="mr-1 animate-spin" />
                  ) : (
                    <Eye size={14} className="mr-1" />
                  )}
                  {showErrorLogs ? 'Refresh Logs' : 'View Error Logs'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-red-600 mt-1">
              View and analyze errors from Production environment (stored in shared MongoDB)
            </p>
          </CardHeader>
          
          {showErrorLogs && (
            <CardContent className="pt-0">
              {/* Summary Stats */}
              {errorSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-white rounded-lg p-3 border border-red-100">
                    <p className="text-xs text-gray-500">Last 24 Hours</p>
                    <p className="text-2xl font-bold text-red-600">{errorSummary.summary?.total_errors || 0}</p>
                    <p className="text-xs text-gray-400">total errors</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-red-100">
                    <p className="text-xs text-gray-500">Critical</p>
                    <p className="text-2xl font-bold text-red-800">{errorSummary.summary?.critical_errors || 0}</p>
                    <p className="text-xs text-gray-400">500 errors</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-orange-100">
                    <p className="text-xs text-gray-500">Error Rate</p>
                    <p className="text-2xl font-bold text-orange-600">{errorSummary.summary?.error_rate_per_hour?.toFixed(1) || 0}</p>
                    <p className="text-xs text-gray-400">per hour</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-xs text-gray-500">All Time</p>
                    <p className="text-2xl font-bold text-gray-700">{errorLogs?.summary?.total_logs || 0}</p>
                    <p className="text-xs text-gray-400">stored logs</p>
                  </div>
                </div>
              )}

              {/* Environment Breakdown */}
              {errorLogs?.summary?.by_environment && Object.keys(errorLogs.summary.by_environment).length > 0 && (
                <div className="mb-4 p-3 bg-white rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-2">Errors by Environment</p>
                  <div className="flex gap-4">
                    {Object.entries(errorLogs.summary.by_environment).map(([env, count]) => (
                      <div key={env} className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          env === 'production' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {env}
                        </span>
                        <span className="font-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Most Error-Prone Paths */}
              {errorLogs?.summary?.most_error_prone_paths?.length > 0 && (
                <div className="mb-4 p-3 bg-white rounded-lg border">
                  <p className="text-xs font-medium text-gray-500 mb-2">Most Error-Prone APIs</p>
                  <div className="space-y-1">
                    {errorLogs.summary.most_error_prone_paths.slice(0, 5).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{item._id}</code>
                        <span className="text-red-600 font-medium">{item.count} errors</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Critical Errors */}
              {errorSummary?.recent_critical_errors?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Recent Critical Errors (Last 24h)</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {errorSummary.recent_critical_errors.map((error, idx) => (
                      <div 
                        key={idx} 
                        className="bg-white border border-red-100 rounded-lg p-3 cursor-pointer hover:border-red-300 transition-colors"
                        onClick={() => setSelectedError(selectedError?.timestamp === error.timestamp ? null : error)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <code className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{error.path}</code>
                            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                              error.environment === 'production' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                            }`}>
                              {error.environment || 'unknown'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{formatErrorTime(error.timestamp)}</span>
                        </div>
                        {error.error_message && (
                          <p className="text-xs text-red-600 mt-1 truncate">{error.error_message}</p>
                        )}
                        {error.error_type && (
                          <span className="text-xs text-gray-500">Type: {error.error_type}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Error Logs Table */}
              {errorLogs?.logs?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">All Stored Error Logs ({errorLogs.logs.length} shown)</p>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Time</th>
                          <th className="p-2 text-left">Env</th>
                          <th className="p-2 text-left">Path</th>
                          <th className="p-2 text-center">Status</th>
                          <th className="p-2 text-left">Type</th>
                          <th className="p-2 text-right">Time (s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {errorLogs.logs.map((log, idx) => (
                          <tr 
                            key={idx} 
                            className={`border-t hover:bg-red-50 cursor-pointer ${log.is_critical ? 'bg-red-50' : ''}`}
                            onClick={() => setSelectedError(selectedError?.request_id === log.request_id ? null : log)}
                          >
                            <td className="p-2 whitespace-nowrap">{formatErrorTime(log.timestamp)}</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                log.environment === 'production' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {log.environment || '?'}
                              </span>
                            </td>
                            <td className="p-2 max-w-[200px] truncate font-mono">{log.path}</td>
                            <td className="p-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                log.status_code >= 500 ? 'bg-red-600 text-white' : 
                                log.status_code >= 400 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100'
                              }`}>
                                {log.status_code}
                              </span>
                            </td>
                            <td className="p-2 text-gray-500">{log.type}</td>
                            <td className="p-2 text-right text-gray-500">{log.process_time}s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No Errors Message */}
              {errorLogs?.logs?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle size={40} className="mx-auto mb-2 text-green-500" />
                  <p className="font-medium text-green-700">No error logs found!</p>
                  <p className="text-sm">System is running smoothly.</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Error Detail Modal */}
        {selectedError && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedError(null)}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b bg-red-50 flex justify-between items-center">
                <h3 className="font-semibold text-red-800 flex items-center gap-2">
                  <Bug size={18} />
                  Error Details
                </h3>
                <button onClick={() => setSelectedError(null)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Timestamp:</span>
                    <p className="font-medium">{formatErrorTime(selectedError.timestamp)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Environment:</span>
                    <p className="font-medium">{selectedError.environment || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Status Code:</span>
                    <p className="font-medium text-red-600">{selectedError.status_code}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Process Time:</span>
                    <p className="font-medium">{selectedError.process_time}s</p>
                  </div>
                </div>
                
                <div>
                  <span className="text-gray-500 text-sm">Path:</span>
                  <code className="block bg-gray-100 p-2 rounded text-sm mt-1">{selectedError.path}</code>
                </div>
                
                {selectedError.query_params && (
                  <div>
                    <span className="text-gray-500 text-sm">Query Params:</span>
                    <code className="block bg-gray-100 p-2 rounded text-sm mt-1">{selectedError.query_params}</code>
                  </div>
                )}
                
                {selectedError.error_message && (
                  <div>
                    <span className="text-gray-500 text-sm">Error Message:</span>
                    <code className="block bg-red-50 text-red-700 p-2 rounded text-sm mt-1 whitespace-pre-wrap">{selectedError.error_message}</code>
                  </div>
                )}
                
                {selectedError.error_type && (
                  <div>
                    <span className="text-gray-500 text-sm">Error Type:</span>
                    <p className="font-medium text-red-600">{selectedError.error_type}</p>
                  </div>
                )}
                
                {selectedError.stack_trace && (
                  <div>
                    <span className="text-gray-500 text-sm">Stack Trace:</span>
                    <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs mt-1 overflow-x-auto whitespace-pre-wrap">{selectedError.stack_trace}</pre>
                  </div>
                )}
                
                {selectedError.request_context && (
                  <div>
                    <span className="text-gray-500 text-sm">Request Context:</span>
                    <pre className="bg-gray-100 p-2 rounded text-xs mt-1">{JSON.stringify(selectedError.request_context, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
