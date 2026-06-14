import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { 
  Users, Plus, Edit2, Trash2, RefreshCw, Calendar, DollarSign, 
  Clock, User, Phone, Save, X, ChevronDown, ChevronRight, Building2, CalendarDays,
  Copy, CheckCircle2, XCircle, AlertCircle, Download, FileSpreadsheet, CreditCard
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
  const [activeTab, setActiveTab] = useState('costs'); // 'costs', 'attendance', 'labours', or 'payroll'
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate allowed date range for attendance editing (current month and last month only)
  const getAttendanceDateLimits = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    
    // First day of last month
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const minDate = new Date(lastMonthYear, lastMonth, 1).toISOString().split('T')[0];
    
    // Today is the max date
    const maxDate = today;
    
    return { minDate, maxDate };
  };
  
  const { minDate: attendanceMinDate, maxDate: attendanceMaxDate } = getAttendanceDateLimits();
  
  // Labours state
  const [labours, setLabours] = useState([]);
  const [loadingLabours, setLoadingLabours] = useState(false);
  const [showInactiveLabourers, setShowInactiveLabourers] = useState(false); // Toggle to show/hide inactive
  const [showLabourModal, setShowLabourModal] = useState(false);
  const [editingLabour, setEditingLabour] = useState(null);
  const [labourForm, setLabourForm] = useState({
    name: '',
    phone: '',
    default_daily_rate: '',
    default_overtime_rate: '',
    bank_account_number: '',
    ifsc_code: '',
    joining_date: ''
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
  const [expandedLabours, setExpandedLabours] = useState({}); // Track expanded labours in Labour-wise Summary
  const [editingLabourAttendance, setEditingLabourAttendance] = useState(null); // { labourId, date, field, value }
  const [savingLabourEdit, setSavingLabourEdit] = useState(false);

  // Attendance state (for admin recording)
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [attendance, setAttendance] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [hasAttendanceChanges, setHasAttendanceChanges] = useState(false);
  
  // Copy attendance modal
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyFromDate, setCopyFromDate] = useState(today);
  const [copyToDateStart, setCopyToDateStart] = useState('');
  const [copyToDateEnd, setCopyToDateEnd] = useState('');
  const [copying, setCopying] = useState(false);

  // Payroll Processing state
  const [payrollDateFrom, setPayrollDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [payrollDateTo, setPayrollDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [payrollData, setPayrollData] = useState(null);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  const [showPayrollExportModal, setShowPayrollExportModal] = useState(false);
  const [payrollExportFields, setPayrollExportFields] = useState({
    name: true,
    bank_account_number: true,
    ifsc_code: true,
    amount: true,
    days_present: false,
    overtime_hours: false,
    daily_rate: false,
    overtime_rate: false,
    date_range: true,
    phone: false
  });

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

  // Load payroll data
  const loadPayrollData = useCallback(async () => {
    setLoadingPayroll(true);
    try {
      const response = await api.get(`/api/labour-costs/summary?from_date=${payrollDateFrom}&to_date=${payrollDateTo}`);
      setPayrollData(response.data);
    } catch (error) {
      toast.error('Failed to load payroll data');
    } finally {
      setLoadingPayroll(false);
    }
  }, [payrollDateFrom, payrollDateTo]);

  useEffect(() => {
    if (activeTab === 'payroll') {
      loadPayrollData();
    }
  }, [activeTab, loadPayrollData]);

  // Export attendance CSV (Daily Costs tab)
  const exportAttendanceCSV = () => {
    if (!costsSummary || !costsSummary.labour_breakdown) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Name', 'Days Present', 'Overtime Hours', 'Total Payment'];
    const rows = costsSummary.labour_breakdown.map(lb => [
      lb.labour_name || lb.name,
      lb.days_present,
      (lb.total_overtime_hours || lb.overtime_hours || 0).toFixed(1),
      (lb.total_payment || 0).toFixed(2)
    ]);

    const csvContent = [
      `Attendance Report: ${dateFrom} to ${dateTo}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${dateFrom}_to_${dateTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Attendance exported successfully');
  };

  // Export payroll CSV with selected fields
  const exportPayrollCSV = () => {
    if (!payrollData || !payrollData.labour_breakdown) {
      toast.error('No payroll data to export');
      return;
    }

    // Build headers based on selected fields
    const headerMap = {
      name: 'Name',
      bank_account_number: 'Bank Account Number',
      ifsc_code: 'IFSC Code',
      amount: 'Amount',
      days_present: 'Days Present',
      overtime_hours: 'Overtime Hours',
      daily_rate: 'Daily Rate',
      overtime_rate: 'Overtime Rate',
      date_range: 'Date Range',
      phone: 'Phone'
    };

    const selectedFields = Object.keys(payrollExportFields).filter(key => payrollExportFields[key]);
    const headers = selectedFields.map(field => headerMap[field]);

    // Build rows - match labour breakdown with labours to get bank details
    const rows = payrollData.labour_breakdown.map(lb => {
      const labourDetails = labours.find(l => l.id === lb.labour_id) || {};
      
      return selectedFields.map(field => {
        switch(field) {
          case 'name': return lb.labour_name || lb.name || '';
          case 'bank_account_number': 
            // Return bank account as-is (will be formatted as text in CSV)
            return labourDetails.bank_account_number || '';
          case 'ifsc_code': return labourDetails.ifsc_code || '';
          case 'amount': return (lb.total_payment || 0).toFixed(2);
          case 'days_present': return lb.days_present || 0;
          case 'overtime_hours': return (lb.total_overtime_hours || lb.overtime_hours || 0).toFixed(1);
          case 'daily_rate': return labourDetails.default_daily_rate || '';
          case 'overtime_rate': return labourDetails.default_overtime_rate || '';
          case 'date_range': return `${payrollDateFrom} to ${payrollDateTo}`;
          case 'phone': return labourDetails.phone || '';
          default: return '';
        }
      });
    });

    // Format cells for CSV - use ="value" format for bank accounts and IFSC to preserve leading zeros
    const formatCell = (value, fieldName) => {
      if (fieldName === 'bank_account_number' || fieldName === 'ifsc_code' || fieldName === 'phone') {
        // Use ="value" format to force Excel to treat as text and preserve leading zeros
        return value ? `="${value}"` : '""';
      }
      // Escape quotes in the value and wrap in quotes
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map((row, rowIdx) => 
        row.map((cell, colIdx) => formatCell(cell, selectedFields[colIdx])).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_${payrollDateFrom}_to_${payrollDateTo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowPayrollExportModal(false);
    toast.success('Payroll exported successfully');
  };

  // Load attendance for a specific date
  const loadAttendance = useCallback(async () => {
    setLoadingAttendance(true);
    try {
      const response = await api.get(`/api/labour-attendance?date=${attendanceDate}`);
      setAttendance(response.data);
      setHasAttendanceChanges(false);
    } catch (error) {
      toast.error('Failed to load attendance');
    } finally {
      setLoadingAttendance(false);
    }
  }, [attendanceDate]);

  useEffect(() => {
    if (activeTab === 'attendance') {
      loadAttendance();
    }
  }, [activeTab, loadAttendance]);

  // Update attendance for a labour
  const updateAttendance = (labourId, field, value) => {
    setAttendance(prev => prev.map(record => {
      if (record.labour_id === labourId) {
        const updated = { ...record, [field]: value };
        if (!updated.present) {
          updated.overtime_hours = 0;
          updated.working_hours = 0;
        }
        // Can't have paid leave if present
        if (updated.present) {
          updated.paid_leave = false;
        }
        return updated;
      }
      return record;
    }));
    setHasAttendanceChanges(true);
  };

  // Toggle present status
  const togglePresent = (labourId) => {
    setAttendance(prev => prev.map(record => {
      if (record.labour_id === labourId) {
        const newPresent = !record.present;
        return {
          ...record,
          present: newPresent,
          working_hours: newPresent ? (record.working_hours || 9) : 0,
          overtime_hours: newPresent ? record.overtime_hours : 0,
          paid_leave: newPresent ? false : record.paid_leave
        };
      }
      return record;
    }));
    setHasAttendanceChanges(true);
  };

  // Toggle paid leave
  const togglePaidLeave = (labourId) => {
    setAttendance(prev => prev.map(record => {
      if (record.labour_id === labourId) {
        if (record.present) {
          toast.error('Cannot mark paid leave for someone who is present');
          return record;
        }
        return {
          ...record,
          paid_leave: !record.paid_leave
        };
      }
      return record;
    }));
    setHasAttendanceChanges(true);
  };

  // Mark all present
  const markAllPresent = () => {
    setAttendance(prev => prev.map(record => ({
      ...record,
      present: true,
      working_hours: 9,
      paid_leave: false
    })));
    setHasAttendanceChanges(true);
  };

  // Mark all absent  
  const markAllAbsent = () => {
    setAttendance(prev => prev.map(record => ({
      ...record,
      present: false,
      working_hours: 0,
      overtime_hours: 0,
      paid_leave: false
    })));
    setHasAttendanceChanges(true);
  };

  // Save attendance
  const saveAttendance = async () => {
    setSavingAttendance(true);
    try {
      const records = attendance.map(a => ({
        labour_id: a.labour_id,
        labour_name: a.labour_name,
        present: a.present,
        working_hours: a.working_hours || 9,
        overtime_hours: a.overtime_hours,
        paid_leave: !a.present && a.paid_leave,
        daily_rate: a.daily_rate,
        overtime_rate: a.overtime_rate
      }));

      await api.post('/api/labour-attendance/bulk', {
        date: attendanceDate,
        records
      });

      toast.success('Attendance saved successfully');
      setHasAttendanceChanges(false);
      loadAttendance();
    } catch (error) {
      toast.error('Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  // Copy attendance to date range
  const copyAttendanceToDateRange = async () => {
    if (!copyFromDate || !copyToDateStart || !copyToDateEnd) {
      toast.error('Please select all dates');
      return;
    }
    if (copyToDateEnd < copyToDateStart) {
      toast.error('End date must be after start date');
      return;
    }

    setCopying(true);
    try {
      // First, get the source attendance
      const sourceResponse = await api.get(`/api/labour-attendance?date=${copyFromDate}`);
      const sourceAttendance = sourceResponse.data;

      if (!sourceAttendance.length) {
        toast.error(`No attendance data found for ${copyFromDate}`);
        setCopying(false);
        return;
      }

      // Generate date range
      const dates = [];
      let currentDate = new Date(copyToDateStart);
      const endDate = new Date(copyToDateEnd);
      while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Copy to each date
      let successCount = 0;
      for (const date of dates) {
        try {
          const records = sourceAttendance.map(a => ({
            labour_id: a.labour_id,
            labour_name: a.labour_name,
            present: a.present,
            overtime_hours: a.overtime_hours,
            daily_rate: a.daily_rate,
            overtime_rate: a.overtime_rate
          }));

          await api.post('/api/labour-attendance/bulk', { date, records });
          successCount++;
        } catch (err) {
          console.error(`Failed to copy to ${date}:`, err);
        }
      }

      toast.success(`Copied attendance to ${successCount} of ${dates.length} dates`);
      setShowCopyModal(false);
      setCopyToDateStart('');
      setCopyToDateEnd('');
      
      // Refresh costs summary if on that tab
      if (activeTab === 'costs') {
        loadCostsSummary();
      }
    } catch (error) {
      toast.error('Failed to copy attendance');
    } finally {
      setCopying(false);
    }
  };

  // Calculate attendance totals
  const attendancePresentCount = attendance.filter(a => a.present).length;
  const attendanceAbsentCount = attendance.length - attendancePresentCount;
  const paidLeaveCount = attendance.filter(a => !a.present && a.paid_leave).length;
  const totalDailyHours = attendance.reduce((sum, a) => sum + (a.present ? (a.working_hours || 9) : 0), 0);
  const totalOvertimeHours = attendance.reduce((sum, a) => sum + (a.present ? a.overtime_hours : 0), 0);

  // Labour form handlers
  const openAddLabour = () => {
    setEditingLabour(null);
    setLabourForm({
      name: '',
      phone: '',
      default_daily_rate: '',
      default_overtime_rate: '',
      bank_account_number: '',
      ifsc_code: '',
      joining_date: ''
    });
    setShowLabourModal(true);
  };

  const openEditLabour = (labour) => {
    setEditingLabour(labour);
    setLabourForm({
      name: labour.name,
      phone: labour.phone || '',
      default_daily_rate: labour.default_daily_rate || '',
      default_overtime_rate: labour.default_overtime_rate || '',
      bank_account_number: labour.bank_account_number || '',
      ifsc_code: labour.ifsc_code || '',
      joining_date: labour.joining_date || ''
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
        default_overtime_rate: parseFloat(labourForm.default_overtime_rate) || 0,
        bank_account_number: labourForm.bank_account_number.trim() || null,
        ifsc_code: labourForm.ifsc_code.trim() || null,
        joining_date: labourForm.joining_date || null
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

  // Toggle expand for labour in Labour-wise Summary
  const toggleLabourExpand = (labourId) => {
    setExpandedLabours(prev => ({ ...prev, [labourId]: !prev[labourId] }));
  };

  // Get daily records for a specific labour
  const getLabourDailyRecords = (labourId) => {
    if (!costsSummary?.daily_breakdown) return [];
    
    const records = [];
    costsSummary.daily_breakdown.forEach(day => {
      const labourRecord = day.records?.find(r => r.labour_id === labourId);
      if (labourRecord) {
        records.push({
          date: day.date,
          ...labourRecord
        });
      }
    });
    return records.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // Save individual labour attendance edit
  const saveLabourAttendanceEdit = async (labourId, date, workingHours, overtimeHours) => {
    setSavingLabourEdit(true);
    try {
      // First fetch the existing attendance for this date
      const response = await api.get(`/api/labour-attendance?date=${date}`);
      const existingAttendance = response.data || [];
      
      // Find and update the specific labour's record
      const updatedRecords = existingAttendance.map(record => {
        if (record.labour_id === labourId) {
          return {
            ...record,
            working_hours: parseFloat(workingHours) || 9,
            overtime_hours: parseFloat(overtimeHours) || 0
          };
        }
        return record;
      });
      
      // Save the updated attendance using BULK endpoint
      await api.post('/api/labour-attendance/bulk', {
        date: date,
        records: updatedRecords.map(r => ({
          labour_id: r.labour_id,
          labour_name: r.labour_name,
          present: r.present,
          working_hours: r.working_hours || 9,
          overtime_hours: r.overtime_hours || 0,
          daily_rate: r.daily_rate,
          overtime_rate: r.overtime_rate
        }))
      });
      
      toast.success('Attendance updated successfully');
      setEditingLabourAttendance(null);
      loadCostsSummary(); // Refresh data
    } catch (error) {
      console.error('Error saving attendance:', error);
      toast.error('Failed to update attendance');
    } finally {
      setSavingLabourEdit(false);
    }
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
        <div className="flex flex-wrap gap-2 mb-4 border-b pb-2">
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
            variant={activeTab === 'attendance' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('attendance')}
            className={activeTab === 'attendance' ? 'bg-[#14532D]' : ''}
            data-testid="tab-attendance"
          >
            <CheckCircle2 size={16} className="mr-1" /> Record Attendance
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
          <Button
            variant={activeTab === 'payroll' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('payroll')}
            className={activeTab === 'payroll' ? 'bg-[#14532D]' : ''}
            data-testid="tab-payroll"
          >
            <CreditCard size={16} className="mr-1" /> Payroll Processing
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
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportAttendanceCSV}
                disabled={!costsSummary || !costsSummary.labour_breakdown?.length}
                data-testid="export-attendance"
              >
                <Download size={14} className="mr-1" /> Export CSV
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
                  <p className="text-xs text-gray-500 mt-1">Click on a labour name to view day-wise attendance details</p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-2 w-6"></th>
                          <th className="p-2 text-left font-medium text-gray-500">LABOUR NAME</th>
                          <th className="p-2 text-center font-medium text-gray-500">DAYS PRESENT</th>
                          <th className="p-2 text-center font-medium text-gray-500">OVERTIME (HRS)</th>
                          <th className="p-2 text-right font-medium text-gray-500">TOTAL PAYMENT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costsSummary.labour_breakdown.map((labour, idx) => (
                          <React.Fragment key={labour.labour_id}>
                            <tr 
                              className="border-b hover:bg-gray-50 cursor-pointer"
                              onClick={() => toggleLabourExpand(labour.labour_id)}
                              data-testid={`labour-row-${labour.labour_id}`}
                            >
                              <td className="p-2 text-center text-gray-400">
                                {expandedLabours[labour.labour_id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </td>
                              <td className="p-2 font-medium">{labour.labour_name}</td>
                              <td className="p-2 text-center">{labour.days_present}</td>
                              <td className="p-2 text-center text-orange-600">{labour.total_overtime_hours.toFixed(1)}</td>
                              <td className="p-2 text-right font-semibold text-green-700">₹{labour.total_payment.toLocaleString()}</td>
                            </tr>
                            
                            {/* Expanded day-wise attendance details */}
                            {expandedLabours[labour.labour_id] && (
                              <>
                                {/* Header row for expanded section */}
                                <tr className="bg-blue-50 border-b">
                                  <td></td>
                                  <td className="p-1 pl-4 text-[10px] font-medium text-blue-700">DATE</td>
                                  <td className="p-1 text-center text-[10px] font-medium text-blue-700">HOURS</td>
                                  <td className="p-1 text-center text-[10px] font-medium text-blue-700">OVERTIME</td>
                                  <td className="p-1 text-right text-[10px] font-medium text-blue-700">PAYMENT</td>
                                </tr>
                                
                                {getLabourDailyRecords(labour.labour_id).map((record, ridx) => {
                                  const isEditing = editingLabourAttendance?.labourId === labour.labour_id && 
                                                   editingLabourAttendance?.date === record.date;
                                  
                                  return (
                                    <tr key={`${labour.labour_id}-${record.date}`} className="bg-gray-50 border-b hover:bg-gray-100">
                                      <td></td>
                                      <td className="p-1 pl-4 text-gray-600 text-[11px]">
                                        <Calendar size={10} className="inline mr-1" />
                                        {formatDate(record.date)}
                                      </td>
                                      <td className="p-1 text-center">
                                        {isEditing ? (
                                          <Input
                                            type="number"
                                            min="0"
                                            max="24"
                                            step="0.5"
                                            value={editingLabourAttendance.workingHours}
                                            onChange={(e) => setEditingLabourAttendance(prev => ({ ...prev, workingHours: e.target.value }))}
                                            className="w-14 h-6 text-xs text-center p-1"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        ) : (
                                          <span className="text-gray-700 text-[11px]">{record.working_hours || 9} hrs</span>
                                        )}
                                      </td>
                                      <td className="p-1 text-center">
                                        {isEditing ? (
                                          <Input
                                            type="number"
                                            min="0"
                                            max="12"
                                            step="0.5"
                                            value={editingLabourAttendance.overtimeHours}
                                            onChange={(e) => setEditingLabourAttendance(prev => ({ ...prev, overtimeHours: e.target.value }))}
                                            className="w-14 h-6 text-xs text-center p-1"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        ) : (
                                          <span className={`text-[11px] ${record.overtime_hours > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                            {record.overtime_hours > 0 ? `+${record.overtime_hours}` : '0'}
                                          </span>
                                        )}
                                      </td>
                                      <td className="p-1 text-right">
                                        {isEditing ? (
                                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                                              onClick={() => setEditingLabourAttendance(null)}
                                            >
                                              <X size={12} />
                                            </Button>
                                            <Button
                                              size="sm"
                                              className="h-5 px-2 text-[10px] bg-green-600 hover:bg-green-700"
                                              onClick={() => saveLabourAttendanceEdit(
                                                labour.labour_id,
                                                record.date,
                                                editingLabourAttendance.workingHours,
                                                editingLabourAttendance.overtimeHours
                                              )}
                                              disabled={savingLabourEdit}
                                            >
                                              {savingLabourEdit ? '...' : <Save size={10} />}
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-end gap-1">
                                            <span className="text-gray-700 text-[11px]">₹{record.total_payment?.toLocaleString() || 0}</span>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-5 w-5 p-0 text-gray-400 hover:text-blue-600"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingLabourAttendance({
                                                  labourId: labour.labour_id,
                                                  date: record.date,
                                                  workingHours: record.working_hours || 9,
                                                  overtimeHours: record.overtime_hours || 0
                                                });
                                              }}
                                              data-testid={`edit-attendance-${labour.labour_id}-${record.date}`}
                                            >
                                              <Edit2 size={10} />
                                            </Button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                                
                                {getLabourDailyRecords(labour.labour_id).length === 0 && (
                                  <tr className="bg-gray-50">
                                    <td colSpan={5} className="p-2 text-center text-gray-400 text-xs">
                                      No attendance records found for this period
                                    </td>
                                  </tr>
                                )}
                              </>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-100">
                        <tr>
                          <td></td>
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
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-green-700">{labours.filter(l => l.is_active !== false).length}</span> active
                  {labours.filter(l => l.is_active === false).length > 0 && (
                    <span className="text-gray-400 ml-2">
                      • <span className="text-red-500">{labours.filter(l => l.is_active === false).length}</span> inactive
                    </span>
                  )}
                </p>
                {labours.filter(l => l.is_active === false).length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showInactiveLabourers}
                      onChange={(e) => setShowInactiveLabourers(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                    />
                    Show inactive
                  </label>
                )}
              </div>
              <Button size="sm" onClick={openAddLabour} data-testid="add-labour-btn">
                <Plus size={16} className="mr-1" /> Add Labourer
              </Button>
            </div>

            <div className="data-table overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>NAME</th>
                    <th>PHONE</th>
                    <th className="text-right">DAILY RATE</th>
                    <th className="text-right">HOURLY RATE</th>
                    <th className="text-right">OT RATE/HR</th>
                    <th>JOINING DATE</th>
                    <th>BANK INFO</th>
                    <th className="text-center">STATUS</th>
                    <th className="text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {labours
                    .filter(labour => showInactiveLabourers || labour.is_active !== false)
                    .map((labour) => (
                    <tr 
                      key={labour.id} 
                      className={labour.is_active === false ? 'bg-gray-50' : ''} 
                      data-testid={`labour-row-${labour.id}`}
                    >
                      <td className={`font-medium ${labour.is_active === false ? 'text-gray-400 line-through' : ''}`}>
                        {labour.name}
                        {labour.is_active === false && (
                          <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-600 text-[9px] rounded font-semibold uppercase">
                            Deactivated
                          </span>
                        )}
                      </td>
                      <td className="text-gray-600">
                        {labour.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone size={12} /> {labour.phone}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="text-right font-semibold text-green-700">₹{labour.default_daily_rate || 0}</td>
                      <td className="text-right font-medium text-blue-600">₹{((labour.default_daily_rate || 0) / 9).toFixed(1)}</td>
                      <td className="text-right font-medium text-orange-600">₹{labour.default_overtime_rate || 0}</td>
                      <td className="text-gray-600 text-sm">
                        {labour.joining_date ? (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={12} /> {new Date(labour.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="text-gray-600 text-sm">
                        {labour.bank_account_number ? (
                          <span className="flex items-center gap-1" title={`A/C: ${labour.bank_account_number}\nIFSC: ${labour.ifsc_code || 'N/A'}`}>
                            <Building2 size={12} className="text-blue-600" /> 
                            <span className="font-mono text-xs">
                              ****{labour.bank_account_number.slice(-4)}
                            </span>
                          </span>
                        ) : '-'}
                      </td>
                      <td className="text-center">
                        <button
                          onClick={() => toggleLabourActive(labour)}
                          className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                            labour.is_active !== false 
                              ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-600 border border-green-200 hover:border-red-200' 
                              : 'bg-red-50 text-red-600 hover:bg-green-100 hover:text-green-700 border border-red-200 hover:border-green-200'
                          }`}
                          title={labour.is_active !== false ? 'Click to deactivate' : 'Click to reactivate'}
                        >
                          {labour.is_active !== false ? '✓ Active' : '✗ Inactive'}
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

        {/* Record Attendance Tab */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            {/* Date Picker & Actions */}
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-gray-500" />
                <Input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  min={attendanceMinDate}
                  max={attendanceMaxDate}
                  className="w-40 h-9"
                  data-testid="attendance-date-input"
                />
                {attendanceDate === today && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Today</span>
                )}
                <span className="text-xs text-gray-500">
                  (Editable: current & last month)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCopyModal(true)} data-testid="copy-attendance-btn">
                  <Copy size={14} className="mr-1" /> Copy to Dates
                </Button>
                <Button variant="outline" size="sm" onClick={loadAttendance} data-testid="refresh-attendance-btn">
                  <RefreshCw size={14} className="mr-1" /> Refresh
                </Button>
                <Button 
                  size="sm" 
                  onClick={saveAttendance} 
                  disabled={!hasAttendanceChanges || savingAttendance}
                  className="bg-[#14532D]"
                  data-testid="save-attendance-btn"
                >
                  <Save size={14} className="mr-1" /> {savingAttendance ? 'Saving...' : 'Save Attendance'}
                </Button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={markAllPresent}>
                <CheckCircle2 size={14} className="mr-1 text-green-600" /> Mark All Present
              </Button>
              <Button variant="outline" size="sm" onClick={markAllAbsent}>
                <XCircle size={14} className="mr-1 text-red-600" /> Mark All Absent
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-3">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-600 rounded-lg">
                      <Users className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-800 font-medium uppercase">Total</p>
                      <p className="text-lg font-bold text-blue-900">{attendance.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-600 rounded-lg">
                      <CheckCircle2 className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-green-800 font-medium uppercase">Present</p>
                      <p className="text-lg font-bold text-green-900">{attendancePresentCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-600 rounded-lg">
                      <Clock className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-purple-800 font-medium uppercase">Daily Hrs</p>
                      <p className="text-lg font-bold text-purple-900">{totalDailyHours}</p>
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
                      <p className="text-[10px] text-orange-800 font-medium uppercase">OT Hours</p>
                      <p className="text-lg font-bold text-orange-900">{totalOvertimeHours}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Attendance Table */}
            {loadingAttendance ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
              </div>
            ) : (
              <div className="data-table overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>LABOURER</th>
                      <th className="text-center">STATUS</th>
                      <th className="text-center">DAILY HOURS</th>
                      <th className="text-center">OT HOURS</th>
                      <th className="text-center">PAID LEAVE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center text-gray-500 py-8">
                          No labourers found. Add labourers in "Manage Labourers" tab first.
                        </td>
                      </tr>
                    ) : (
                      attendance.map((record) => (
                        <tr 
                          key={record.labour_id} 
                          className={`${record.present ? '' : record.paid_leave ? 'bg-purple-50' : 'bg-gray-50'}`} 
                          data-testid={`attendance-row-${record.labour_id}`}
                        >
                          <td className="font-medium">{record.labour_name}</td>
                          <td className="text-center">
                            <button
                              onClick={() => togglePresent(record.labour_id)}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                record.present 
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                              data-testid={`toggle-present-${record.labour_id}`}
                            >
                              {record.present ? '✓ Present' : '✗ Absent'}
                            </button>
                          </td>
                          <td className="text-center">
                            {record.present ? (
                              <Input
                                type="number"
                                value={record.working_hours || 9}
                                onChange={(e) => updateAttendance(record.labour_id, 'working_hours', parseFloat(e.target.value) || 0)}
                                min="0"
                                max="12"
                                step="0.5"
                                className="w-20 h-8 text-center mx-auto"
                                data-testid={`daily-hours-${record.labour_id}`}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center">
                            {record.present ? (
                              <Input
                                type="number"
                                value={record.overtime_hours}
                                onChange={(e) => updateAttendance(record.labour_id, 'overtime_hours', parseFloat(e.target.value) || 0)}
                                min="0"
                                max="12"
                                step="0.5"
                                className="w-20 h-8 text-center mx-auto"
                                data-testid={`ot-hours-${record.labour_id}`}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={record.paid_leave || false}
                                onCheckedChange={() => togglePaidLeave(record.labour_id)}
                                disabled={record.present}
                                className={`${record.present ? 'opacity-30 cursor-not-allowed' : ''}`}
                                data-testid={`paid-leave-${record.labour_id}`}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Labour Modal */}
        <Dialog open={showLabourModal} onOpenChange={setShowLabourModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingLabour ? 'Edit Labourer' : 'Add Labourer'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
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
                <label className="text-sm font-medium text-gray-700">Phone Number</label>
                <Input
                  value={labourForm.phone}
                  onChange={(e) => setLabourForm({ ...labourForm, phone: e.target.value })}
                  placeholder="e.g., 9876543210"
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
              <div>
                <label className="text-sm font-medium text-gray-700">Bank Account Number</label>
                <Input
                  value={labourForm.bank_account_number}
                  onChange={(e) => setLabourForm({ ...labourForm, bank_account_number: e.target.value })}
                  placeholder="e.g., 1234567890123"
                  data-testid="labour-bank-account-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">IFSC Code</label>
                <Input
                  value={labourForm.ifsc_code}
                  onChange={(e) => setLabourForm({ ...labourForm, ifsc_code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SBIN0001234"
                  data-testid="labour-ifsc-input"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Joining Date</label>
                <Input
                  type="date"
                  value={labourForm.joining_date}
                  onChange={(e) => setLabourForm({ ...labourForm, joining_date: e.target.value })}
                  data-testid="labour-joining-date-input"
                />
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

        {/* Copy Attendance Modal */}
        <Dialog open={showCopyModal} onOpenChange={setShowCopyModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Copy size={20} /> Copy Attendance to Date Range
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3 text-sm text-blue-800">
                  <AlertCircle size={16} className="inline mr-2" />
                  This will copy attendance data from the source date to all dates in the selected range. Existing data for those dates will be overwritten.
                </CardContent>
              </Card>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Copy From (Source Date)</label>
                <Input
                  type="date"
                  value={copyFromDate}
                  onChange={(e) => setCopyFromDate(e.target.value)}
                  className="w-full"
                  data-testid="copy-from-date"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select the date whose attendance you want to copy
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">To Start Date</label>
                  <Input
                    type="date"
                    value={copyToDateStart}
                    onChange={(e) => setCopyToDateStart(e.target.value)}
                    className="w-full"
                    data-testid="copy-to-start-date"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">To End Date</label>
                  <Input
                    type="date"
                    value={copyToDateEnd}
                    onChange={(e) => setCopyToDateEnd(e.target.value)}
                    className="w-full"
                    data-testid="copy-to-end-date"
                  />
                </div>
              </div>

              {copyToDateStart && copyToDateEnd && copyToDateEnd >= copyToDateStart && (
                <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  Will copy to <strong>
                    {Math.ceil((new Date(copyToDateEnd) - new Date(copyToDateStart)) / (1000 * 60 * 60 * 24)) + 1}
                  </strong> dates
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCopyModal(false)} disabled={copying}>
                Cancel
              </Button>
              <Button 
                onClick={copyAttendanceToDateRange} 
                className="bg-[#14532D]" 
                disabled={copying || !copyFromDate || !copyToDateStart || !copyToDateEnd}
                data-testid="confirm-copy-btn"
              >
                {copying ? (
                  <>
                    <RefreshCw size={16} className="mr-1 animate-spin" /> Copying...
                  </>
                ) : (
                  <>
                    <Copy size={16} className="mr-1" /> Copy Attendance
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payroll Processing Tab */}
        {activeTab === 'payroll' && (
          <div className="space-y-4">
            {/* Date Filter */}
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                type="date"
                value={payrollDateFrom}
                onChange={(e) => setPayrollDateFrom(e.target.value)}
                className="w-36 h-8 text-sm"
                data-testid="payroll-date-from"
              />
              <span className="text-gray-400">to</span>
              <Input
                type="date"
                value={payrollDateTo}
                onChange={(e) => setPayrollDateTo(e.target.value)}
                className="w-36 h-8 text-sm"
                data-testid="payroll-date-to"
              />
              <Button variant="outline" size="sm" onClick={loadPayrollData} data-testid="refresh-payroll">
                <RefreshCw size={14} className="mr-1" /> Refresh
              </Button>
              <Button 
                size="sm" 
                onClick={() => setShowPayrollExportModal(true)}
                disabled={!payrollData || !payrollData.labour_breakdown?.length}
                className="bg-[#14532D]"
                data-testid="export-payroll-btn"
              >
                <FileSpreadsheet size={14} className="mr-1" /> Export for Netbanking
              </Button>
            </div>

            {/* Summary Cards */}
            {payrollData && payrollData.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-green-600 rounded-lg">
                        <DollarSign className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-green-800 font-medium uppercase">Total Payroll</p>
                        <p className="text-lg font-bold text-green-900">
                          ₹{(payrollData.summary.total_payment || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-600 rounded-lg">
                        <Users className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-blue-800 font-medium uppercase">Labourers</p>
                        <p className="text-lg font-bold text-blue-900">{payrollData.labour_breakdown?.length || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-purple-600 rounded-lg">
                        <Calendar className="text-white" size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] text-purple-800 font-medium uppercase">Man Days</p>
                        <p className="text-lg font-bold text-purple-900">{payrollData.summary.total_man_days || 0}</p>
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
                        <p className="text-[10px] text-orange-800 font-medium uppercase">OT Hours</p>
                        <p className="text-lg font-bold text-orange-900">{(payrollData.summary.total_overtime_hours || 0).toFixed(1)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Payroll Table */}
            {payrollData && payrollData.labour_breakdown.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Payroll Details</span>
                    <span className="text-xs text-gray-500 font-normal">
                      {payrollDateFrom} to {payrollDateTo}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-2 text-left font-medium text-gray-500">#</th>
                          <th className="p-2 text-left font-medium text-gray-500">NAME</th>
                          <th className="p-2 text-left font-medium text-gray-500">BANK A/C</th>
                          <th className="p-2 text-left font-medium text-gray-500">IFSC</th>
                          <th className="p-2 text-center font-medium text-gray-500">DAYS</th>
                          <th className="p-2 text-center font-medium text-gray-500">OT HRS</th>
                          <th className="p-2 text-right font-medium text-gray-500">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.labour_breakdown.map((lb, idx) => {
                          const labourDetails = labours.find(l => l.id === lb.labour_id) || {};
                          return (
                            <tr key={lb.labour_id} className="border-b hover:bg-gray-50">
                              <td className="p-2 text-gray-400">{idx + 1}</td>
                              <td className="p-2 font-medium">{lb.labour_name}</td>
                              <td className="p-2 text-gray-600 font-mono text-[10px]">
                                {labourDetails.bank_account_number || <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-2 text-gray-600 font-mono text-[10px]">
                                {labourDetails.ifsc_code || <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-2 text-center">{lb.days_present}</td>
                              <td className="p-2 text-center text-orange-600">{(lb.total_overtime_hours || 0).toFixed(1)}</td>
                              <td className="p-2 text-right font-semibold text-green-700">
                                ₹{(lb.total_payment || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-gray-100 font-semibold">
                          <td className="p-2" colSpan={4}>TOTAL</td>
                          <td className="p-2 text-center">{payrollData.summary?.total_man_days || 0}</td>
                          <td className="p-2 text-center text-orange-600">{(payrollData.summary?.total_overtime_hours || 0).toFixed(1)}</td>
                          <td className="p-2 text-right text-green-700">
                            ₹{(payrollData.summary?.total_payment || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {loadingPayroll && (
              <div className="text-center py-8 text-gray-500">
                <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
                Loading payroll data...
              </div>
            )}

            {!loadingPayroll && payrollData && payrollData.labour_breakdown.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No payroll data found for the selected date range
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Payroll Export Modal */}
        <Dialog open={showPayrollExportModal} onOpenChange={setShowPayrollExportModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet size={20} /> Export Payroll for Netbanking
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-600">
                Select the fields to include in the CSV export. You can customize based on your bank's requirements.
              </p>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {[
                  { key: 'name', label: 'Beneficiary Name', required: true },
                  { key: 'bank_account_number', label: 'Bank Account Number', required: true },
                  { key: 'ifsc_code', label: 'IFSC Code', required: true },
                  { key: 'amount', label: 'Amount (₹)', required: true },
                  { key: 'days_present', label: 'Days Present' },
                  { key: 'overtime_hours', label: 'Overtime Hours' },
                  { key: 'daily_rate', label: 'Daily Rate' },
                  { key: 'overtime_rate', label: 'Overtime Rate' },
                  { key: 'date_range', label: 'Date Range (Period)' },
                  { key: 'phone', label: 'Phone Number' }
                ].map(field => (
                  <div key={field.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`field-${field.key}`}
                      checked={payrollExportFields[field.key]}
                      onCheckedChange={(checked) => setPayrollExportFields({
                        ...payrollExportFields,
                        [field.key]: checked
                      })}
                      disabled={field.required}
                    />
                    <label 
                      htmlFor={`field-${field.key}`} 
                      className={`text-sm cursor-pointer ${field.required ? 'font-medium' : ''}`}
                    >
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                  </div>
                ))}
              </div>

              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3 text-xs text-blue-800">
                  <AlertCircle size={14} className="inline mr-1" />
                  Fields marked with * are typically required by banks for NEFT/IMPS transfers.
                </CardContent>
              </Card>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayrollExportModal(false)}>
                Cancel
              </Button>
              <Button onClick={exportPayrollCSV} className="bg-[#14532D]" data-testid="confirm-payroll-export">
                <Download size={16} className="mr-1" /> Download CSV
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
