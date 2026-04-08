import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Users, Plus, Edit2, Trash2, RefreshCw, Calendar, DollarSign, 
  Clock, User, Phone, Save, X, ChevronDown, ChevronRight
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';

export default function LaborCosts() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('costs'); // 'costs' or 'labours'
  
  // Labours state
  const [labours, setLabours] = useState([]);
  const [loadingLabours, setLoadingLabours] = useState(false);
  const [showLabourModal, setShowLabourModal] = useState(false);
  const [editingLabour, setEditingLabour] = useState(null);
  const [labourForm, setLabourForm] = useState({
    name: '',
    phone: '',
    default_daily_rate: '',
    default_overtime_rate: ''
  });
  
  // Costs state
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [costsSummary, setCostsSummary] = useState(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [expandedDates, setExpandedDates] = useState({});

  // Load labours
  const loadLabours = useCallback(async () => {
    setLoadingLabours(true);
    try {
      const response = await api.get('/api/labours?include_inactive=true');
      setLabours(response.data);
    } catch (error) {
      toast.error('Failed to load labourers');
    } finally {
      setLoadingLabours(false);
    }
  }, []);

  // Load costs summary
  const loadCostsSummary = useCallback(async () => {
    setLoadingCosts(true);
    try {
      const response = await api.get(`/api/labour-costs/summary?from_date=${dateFrom}&to_date=${dateTo}`);
      setCostsSummary(response.data);
    } catch (error) {
      toast.error('Failed to load labour costs');
    } finally {
      setLoadingCosts(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadLabours();
  }, [loadLabours]);

  useEffect(() => {
    if (activeTab === 'costs') {
      loadCostsSummary();
    }
  }, [activeTab, loadCostsSummary]);

  // Labour form handlers
  const openAddLabour = () => {
    setEditingLabour(null);
    setLabourForm({
      name: '',
      phone: '',
      default_daily_rate: '',
      default_overtime_rate: ''
    });
    setShowLabourModal(true);
  };

  const openEditLabour = (labour) => {
    setEditingLabour(labour);
    setLabourForm({
      name: labour.name,
      phone: labour.phone || '',
      default_daily_rate: labour.default_daily_rate || '',
      default_overtime_rate: labour.default_overtime_rate || ''
    });
    setShowLabourModal(true);
  };

  const handleSaveLabour = async () => {
    if (!labourForm.name.trim()) {
      toast.error('Please enter labourer name');
      return;
    }

    try {
      const data = {
        name: labourForm.name.trim(),
        phone: labourForm.phone.trim() || null,
        default_daily_rate: parseFloat(labourForm.default_daily_rate) || 0,
        default_overtime_rate: parseFloat(labourForm.default_overtime_rate) || 0
      };

      if (editingLabour) {
        await api.put(`/api/labours/${editingLabour.id}`, data);
        toast.success('Labourer updated');
      } else {
        await api.post('/api/labours', data);
        toast.success('Labourer added');
      }
      
      setShowLabourModal(false);
      loadLabours();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save labourer');
    }
  };

  const handleDeleteLabour = async (labour) => {
    if (!window.confirm(`Delete ${labour.name}?`)) return;
    
    try {
      await api.delete(`/api/labours/${labour.id}`);
      toast.success('Labourer removed');
      loadLabours();
    } catch (error) {
      toast.error('Failed to delete labourer');
    }
  };

  const toggleLabourActive = async (labour) => {
    try {
      await api.put(`/api/labours/${labour.id}`, { is_active: !labour.is_active });
      toast.success(labour.is_active ? 'Labourer deactivated' : 'Labourer activated');
      loadLabours();
    } catch (error) {
      toast.error('Failed to update labourer');
    }
  };

  const toggleDateExpand = (date) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const formatCurrency = (amount) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount?.toFixed(0) || 0}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Labor Costs">
      <div data-testid="labor-costs-page">
        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b pb-2">
          <Button
            variant={activeTab === 'costs' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('costs')}
            className={activeTab === 'costs' ? 'bg-[#14532D]' : ''}
            data-testid="tab-costs"
          >
            <DollarSign size={16} className="mr-1" /> Daily Costs
          </Button>
          <Button
            variant={activeTab === 'labours' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('labours')}
            className={activeTab === 'labours' ? 'bg-[#14532D]' : ''}
            data-testid="tab-labours"
          >
            <Users size={16} className="mr-1" /> Manage Labourers
          </Button>
        </div>

        {/* Daily Costs Tab */}
        {activeTab === 'costs' && (
          <div className="space-y-4">
            {/* Date Filter */}
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 h-8 text-sm"
                data-testid="date-from"
              />
              <span className="text-gray-400">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 h-8 text-sm"
                data-testid="date-to"
              />
              <Button variant="outline" size="sm" onClick={loadCostsSummary} data-testid="refresh-costs">
                <RefreshCw size={14} className="mr-1" /> Refresh
              </Button>
            </div>

            {/* Summary Cards */}
            {costsSummary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-green-600 rounded-lg">
                        <DollarSign className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-green-800 font-medium uppercase">Total Cost</p>
                        <p className="text-lg font-bold text-green-900" data-testid="total-cost">
                          {formatCurrency(costsSummary.summary.total_payment)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-600 rounded-lg">
                        <Calendar className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-blue-800 font-medium uppercase">Working Days</p>
                        <p className="text-lg font-bold text-blue-900">{costsSummary.summary.total_days}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-600 rounded-lg">
                        <Users className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-purple-800 font-medium uppercase">Man Days</p>
                        <p className="text-lg font-bold text-purple-900">{costsSummary.summary.total_man_days}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-orange-600 rounded-lg">
                        <Clock className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-orange-800 font-medium uppercase">Overtime Hrs</p>
                        <p className="text-lg font-bold text-orange-900">{costsSummary.summary.total_overtime_hours.toFixed(1)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-indigo-600 rounded-lg">
                        <DollarSign className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-indigo-800 font-medium uppercase">Daily Avg</p>
                        <p className="text-lg font-bold text-indigo-900">
                          {formatCurrency(costsSummary.summary.daily_avg_cost)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Labour-wise Breakdown */}
            {costsSummary && costsSummary.labour_breakdown.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Labour-wise Summary</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-2 text-left font-medium text-gray-500">LABOUR NAME</th>
                          <th className="p-2 text-center font-medium text-gray-500">DAYS PRESENT</th>
                          <th className="p-2 text-center font-medium text-gray-500">OVERTIME (HRS)</th>
                          <th className="p-2 text-right font-medium text-gray-500">TOTAL PAYMENT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costsSummary.labour_breakdown.map((labour, idx) => (
                          <tr key={labour.labour_id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{labour.labour_name}</td>
                            <td className="p-2 text-center">{labour.days_present}</td>
                            <td className="p-2 text-center text-orange-600">{labour.total_overtime_hours.toFixed(1)}</td>
                            <td className="p-2 text-right font-semibold text-green-700">₹{labour.total_payment.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-100">
                        <tr>
                          <td className="p-2 font-bold">TOTAL</td>
                          <td className="p-2 text-center font-bold">{costsSummary.summary.total_man_days}</td>
                          <td className="p-2 text-center font-bold text-orange-600">{costsSummary.summary.total_overtime_hours.toFixed(1)}</td>
                          <td className="p-2 text-right font-bold text-green-700">₹{costsSummary.summary.total_payment.toLocaleString()}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Daily Breakdown */}
            {costsSummary && costsSummary.daily_breakdown.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Daily Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-2 text-left font-medium text-gray-500 w-8"></th>
                          <th className="p-2 text-left font-medium text-gray-500">DATE</th>
                          <th className="p-2 text-center font-medium text-gray-500">PRESENT</th>
                          <th className="p-2 text-center font-medium text-gray-500">OVERTIME</th>
                          <th className="p-2 text-right font-medium text-gray-500">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costsSummary.daily_breakdown.map((day, idx) => (
                          <React.Fragment key={day.date}>
                            <tr 
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleDateExpand(day.date)}
                            >
                              <td className="p-2 text-center">
                                {expandedDates[day.date] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-2 font-medium">{formatDate(day.date)}</td>
                              <td className="p-2 text-center">
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">
                                  {day.total_present} labours
                                </span>
                              </td>
                              <td className="p-2 text-center text-orange-600">{day.total_overtime_hours.toFixed(1)} hrs</td>
                              <td className="p-2 text-right font-semibold text-green-700">₹{day.total_payment.toLocaleString()}</td>
                            </tr>
                            {expandedDates[day.date] && day.records.map((record, ridx) => (
                              <tr key={`${day.date}-${ridx}`} className="bg-gray-50 border-b">
                                <td className="p-2"></td>
                                <td className="p-2 pl-6 text-gray-600">
                                  <User size={12} className="inline mr-1" />
                                  {record.labour_name}
                                </td>
                                <td className="p-2 text-center text-green-600">✓</td>
                                <td className="p-2 text-center text-gray-600">
                                  {record.overtime_hours > 0 && `+${record.overtime_hours} hrs`}
                                </td>
                                <td className="p-2 text-right text-gray-700">₹{record.total_payment.toLocaleString()}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {loadingCosts && (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
              </div>
            )}

            {!loadingCosts && costsSummary && costsSummary.daily_breakdown.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-gray-500">
                  No attendance records found for this period.
                  <br />
                  <span className="text-sm">Ask supervisors to mark daily attendance in the Staff portal.</span>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Manage Labourers Tab */}
        {activeTab === 'labours' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                {labours.filter(l => l.is_active !== false).length} active labourers
              </p>
              <Button size="sm" onClick={openAddLabour} data-testid="add-labour-btn">
                <Plus size={16} className="mr-1" /> Add Labourer
              </Button>
            </div>

            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>PHONE</th>
                    <th className="text-right">DAILY RATE</th>
                    <th className="text-right">OT RATE/HR</th>
                    <th className="text-center">STATUS</th>
                    <th className="text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {labours.map((labour) => (
                    <tr key={labour.id} className={labour.is_active === false ? 'opacity-50' : ''} data-testid={`labour-row-${labour.id}`}>
                      <td className="font-medium">{labour.name}</td>
                      <td className="text-gray-600">
                        {labour.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone size={12} /> {labour.phone}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="text-right font-semibold text-green-700">₹{labour.default_daily_rate || 0}</td>
                      <td className="text-right font-medium text-orange-600">₹{labour.default_overtime_rate || 0}</td>
                      <td className="text-center">
                        <button
                          onClick={() => toggleLabourActive(labour)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            labour.is_active !== false 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {labour.is_active !== false ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditLabour(labour)}
                            data-testid={`edit-labour-${labour.id}`}
                          >
                            <Edit2 size={14} className="text-blue-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteLabour(labour)}
                            data-testid={`delete-labour-${labour.id}`}
                          >
                            <Trash2 size={14} className="text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {labours.length === 0 && !loadingLabours && (
                <div className="p-8 text-center text-gray-500">
                  No labourers added yet. Click "Add Labourer" to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add/Edit Labour Modal */}
        <Dialog open={showLabourModal} onOpenChange={setShowLabourModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingLabour ? 'Edit Labourer' : 'Add Labourer'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Name *</label>
                <Input
                  value={labourForm.name}
                  onChange={(e) => setLabourForm({ ...labourForm, name: e.target.value })}
                  placeholder="Enter labourer name"
                  data-testid="labour-name-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <Input
                  value={labourForm.phone}
                  onChange={(e) => setLabourForm({ ...labourForm, phone: e.target.value })}
                  placeholder="Phone number"
                  data-testid="labour-phone-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Daily Rate (₹)</label>
                  <Input
                    type="number"
                    value={labourForm.default_daily_rate}
                    onChange={(e) => setLabourForm({ ...labourForm, default_daily_rate: e.target.value })}
                    placeholder="e.g., 500"
                    data-testid="labour-daily-rate-input"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">OT Rate/Hr (₹)</label>
                  <Input
                    type="number"
                    value={labourForm.default_overtime_rate}
                    onChange={(e) => setLabourForm({ ...labourForm, default_overtime_rate: e.target.value })}
                    placeholder="e.g., 50"
                    data-testid="labour-ot-rate-input"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLabourModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveLabour} className="bg-[#14532D]" data-testid="save-labour-btn">
                <Save size={16} className="mr-1" /> Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
