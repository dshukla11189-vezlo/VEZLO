import React, { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Database, Download, Mail, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BackupPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

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
      link.setAttribute('download', `FreshFlow_Backup_${today}.xlsx`);
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
                  <span>• Users & Products</span>
                  <span>• Farmers</span>
                  <span>• Procurements</span>
                  <span>• QC Customers</span>
                  <span>• QC Indents/Dispatches</span>
                  <span>• QC Invoices/GRN</span>
                  <span>• Retailer Orders</span>
                  <span>• Retailer Payments</span>
                  <span>• Stock Status</span>
                  <span>• Variable Expenses</span>
                  <span>• Fixed Expenses</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
      </div>
    </Layout>
  );
}
