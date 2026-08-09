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
  Copy, CheckCircle2, XCircle, AlertCircle, Download, FileSpreadsheet, CreditCard, Pencil, TrendingUp
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
    monthly_salary: '',
    default_daily_rate: '',
    default_overtime_rate: '',
    bank_account_number: '',
    ifsc_code: '',
    joining_date: ''
  });
  
  // Salary Revision Modal State
  const [showSalaryRevisionModal, setShowSalaryRevisionModal] = useState(false);
  const [salaryRevisionLabour, setSalaryRevisionLabour] = useState(null);
  const [salaryRevisionForm, setSalaryRevisionForm] = useState({
    monthly_salary: '',
    daily_rate: '',
    overtime_rate: '',
    effective_from: new Date().toISOString().split('T')[0]
  });
  
  // Salary History Modal State
  const [showSalaryHistoryModal, setShowSalaryHistoryModal] = useState(false);
  const [salaryHistoryLabour, setSalaryHistoryLabour] = useState(null);
  
  // Sorting and Search state for Manage Labourers
  const [labourSearchTerm, setLabourSearchTerm] = useState('');
  const [labourSortField, setLabourSortField] = useState('name');
  const [labourSortOrder, setLabourSortOrder] = useState('asc');
  
  // Sorting and Search state for Payroll Processing
  const [payrollSearchTerm, setPayrollSearchTerm] = useState('');
  const [payrollSortField, setPayrollSortField] = useState('total_payment');
  const [payrollSortOrder, setPayrollSortOrder] = useState('desc');
  
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
  
  // Detailed Payroll Modal state
  const [showPayrollDetailModal, setShowPayrollDetailModal] = useState(false);
  const [payrollDetailData, setPayrollDetailData] = useState(null);
  const [loadingPayrollDetail, setLoadingPayrollDetail] = useState(false);
  
  // Payment Recording state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalMode, setPaymentModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedLabourForPayment, setSelectedLabourForPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    transaction_id: '',
    payment_mode: 'Bank Transfer',
    notes: ''
  });
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  
  // Payment history modal
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [paymentHistoryData, setPaymentHistoryData] = useState(null);
  
  // Open payment modal to add new payment
  const openAddPaymentModal = (labour) => {
    setSelectedLabourForPayment(labour);
    setPaymentForm({
      amount: labour.net_payable > 0 ? labour.net_payable.toFixed(2) : '',
      payment_date: new Date().toISOString().split('T')[0],
      transaction_id: '',
      payment_mode: 'Bank Transfer',
      notes: ''
    });
    setPaymentModalMode('add');
    setEditingPaymentId(null);
    setShowPaymentModal(true);
  };
  
  // Open payment modal to edit existing payment
  const openEditPaymentModal = (labour, payment) => {
    setSelectedLabourForPayment(labour);
    setPaymentForm({
      amount: payment.amount?.toString() || '',
      payment_date: payment.payment_date || '',
      transaction_id: payment.transaction_id || '',
      payment_mode: payment.payment_mode || 'Bank Transfer',
      notes: payment.notes || ''
    });
    setPaymentModalMode('edit');
    setEditingPaymentId(payment.id);
    setShowPaymentModal(true);
  };
  
  // Save payment (create or update)
  const savePayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    if (!paymentForm.payment_date) {
      toast.error('Please select a payment date');
      return;
    }
    
    setSavingPayment(true);
    try {
      const payload = {
        labour_id: selectedLabourForPayment.labour_id,
        amount: parseFloat(paymentForm.amount),
        payment_date: paymentForm.payment_date,
        transaction_id: paymentForm.transaction_id,
        payment_mode: paymentForm.payment_mode,
        notes: paymentForm.notes,
        period_from: payrollDateFrom,
        period_to: payrollDateTo
      };
      
      if (paymentModalMode === 'edit' && editingPaymentId) {
        await api.put(`/api/labour-payments/${editingPaymentId}`, payload);
        toast.success('Payment updated successfully');
      } else {
        await api.post('/api/labour-payments', payload);
        toast.success('Payment recorded successfully');
      }
      
      setShowPaymentModal(false);
      loadPayrollData(); // Refresh payroll data
    } catch (error) {
      toast.error('Failed to save payment');
    } finally {
      setSavingPayment(false);
    }
  };
  
  // Delete payment
  const deletePayment = async (paymentId) => {
    if (!window.confirm('Are you sure you want to delete this payment?')) return;
    
    try {
      await api.delete(`/api/labour-payments/${paymentId}`);
      toast.success('Payment deleted');
      loadPayrollData(); // Refresh
      if (showPaymentHistoryModal) {
        loadPaymentHistory(selectedLabourForPayment);
      }
    } catch (error) {
      toast.error('Failed to delete payment');
    }
  };
  
  // Load payment history for a labourer
  const loadPaymentHistory = async (labour) => {
    setSelectedLabourForPayment(labour);
    setShowPaymentHistoryModal(true);
    try {
      const response = await api.get(`/api/labour-payments/summary/${labour.labour_id}?from_date=${payrollDateFrom}&to_date=${payrollDateTo}`);
      setPaymentHistoryData(response.data);
    } catch (error) {
      toast.error('Failed to load payment history');
    }
  };
  
  // Load detailed payroll for a specific labourer
  const loadPayrollDetail = async (labourId) => {
    setLoadingPayrollDetail(true);
    setShowPayrollDetailModal(true);
    try {
      const response = await api.get(`/api/labour-costs/detail/${labourId}?from_date=${payrollDateFrom}&to_date=${payrollDateTo}`);
      setPayrollDetailData(response.data);
    } catch (error) {
      toast.error('Failed to load payroll details');
      setShowPayrollDetailModal(false);
    } finally {
      setLoadingPayrollDetail(false);
    }
  };

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
          updated.retail_hours = 0;
          updated.qc_hours = 0;
          updated.retail_ot_hours = 0;
          updated.qc_ot_hours = 0;
        }
        // Can't have paid leave if present
        if (updated.present) {
          updated.paid_leave = false;
        }
        
        // Auto-fill remaining hours for vertical split
        const workingHrs = updated.working_hours || 9;
        if (field === 'retail_hours') {
          // When retail hours changed, auto-fill QC with remainder
          const retailVal = parseFloat(value) || 0;
          updated.qc_hours = Math.max(0, workingHrs - retailVal);
        } else if (field === 'qc_hours') {
          // When QC hours changed, auto-fill retail with remainder
          const qcVal = parseFloat(value) || 0;
          updated.retail_hours = Math.max(0, workingHrs - qcVal);
        } else if (field === 'working_hours') {
          // When working hours changed, adjust retail to match (keep QC, adjust retail)
          const newWorkingHrs = parseFloat(value) || 9;
          const currentQc = parseFloat(updated.qc_hours) || 0;
          updated.retail_hours = Math.max(0, newWorkingHrs - currentQc);
        }
        
        // Auto-calculate total overtime from retail + qc OT
        if (field === 'retail_ot_hours' || field === 'qc_ot_hours') {
          updated.overtime_hours = (parseFloat(updated.retail_ot_hours) || 0) + (parseFloat(updated.qc_ot_hours) || 0);
        }
        
        // Ensure retail + qc hours don't exceed working hours
        const totalVerticalHours = (parseFloat(updated.retail_hours) || 0) + (parseFloat(updated.qc_hours) || 0);
        if (totalVerticalHours > workingHrs) {
          if (field === 'retail_hours') {
            updated.retail_hours = Math.max(0, workingHrs - (parseFloat(updated.qc_hours) || 0));
          } else if (field === 'qc_hours') {
            updated.qc_hours = Math.max(0, workingHrs - (parseFloat(updated.retail_hours) || 0));
          }
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
          retail_hours: newPresent ? 9 : 0, // Default all hours to retail
          qc_hours: newPresent ? 0 : 0,
          retail_ot_hours: newPresent ? record.retail_ot_hours : 0,
          qc_ot_hours: newPresent ? record.qc_ot_hours : 0,
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
      retail_hours: 9, // Default all to retail
      qc_hours: 0,
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
      retail_hours: 0,
      qc_hours: 0,
      retail_ot_hours: 0,
      qc_ot_hours: 0,
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
        working_hours: a.present ? (a.working_hours || 9) : 0,
        overtime_hours: a.overtime_hours || 0,
        retail_hours: a.retail_hours || 0,
        qc_hours: a.qc_hours || 0,
        retail_ot_hours: a.retail_ot_hours || 0,
        qc_ot_hours: a.qc_ot_hours || 0,
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
  const totalRetailHours = attendance.reduce((sum, a) => sum + (a.retail_hours || 0), 0);
  const totalQcHours = attendance.reduce((sum, a) => sum + (a.qc_hours || 0), 0);
  const totalRetailOtHours = attendance.reduce((sum, a) => sum + (a.retail_ot_hours || 0), 0);
  const totalQcOtHours = attendance.reduce((sum, a) => sum + (a.qc_ot_hours || 0), 0);

  // Labour form handlers
  const openAddLabour = () => {
    setEditingLabour(null);
    setLabourForm({
      name: '',
      phone: '',
      monthly_salary: '',
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
      monthly_salary: labour.monthly_salary || '',
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
      // For editing, only send non-salary fields (salary changes go through revision modal)
      // For creating, send all fields including salary
      const data = editingLabour ? {
        name: labourForm.name.trim(),
        phone: labourForm.phone.trim() || null,
        bank_account_number: labourForm.bank_account_number.trim() || null,
        ifsc_code: labourForm.ifsc_code.trim() || null,
        joining_date: labourForm.joining_date || null
      } : {
        name: labourForm.name.trim(),
        phone: labourForm.phone.trim() || null,
        monthly_salary: parseFloat(labourForm.monthly_salary) || 0,
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

  // Open Salary Revision Modal
  const openSalaryRevisionModal = (labour) => {
    setSalaryRevisionLabour(labour);
    setSalaryRevisionForm({
      monthly_salary: '',
      daily_rate: '',
      overtime_rate: '',
      effective_from: new Date().toISOString().split('T')[0]
    });
    setShowSalaryRevisionModal(true);
  };

  // Handle Salary Revision Form Change (with auto-calculate)
  const handleSalaryRevisionChange = (field, value) => {
    if (field === 'monthly_salary') {
      const monthly = parseFloat(value) || 0;
      const daily = monthly > 0 ? (monthly / 30).toFixed(2) : '';
      const hourly = daily ? (parseFloat(daily) / 9).toFixed(2) : '';
      setSalaryRevisionForm(prev => ({
        ...prev,
        monthly_salary: value,
        daily_rate: daily,
        overtime_rate: hourly
      }));
    } else {
      setSalaryRevisionForm(prev => ({ ...prev, [field]: value }));
    }
  };

  // Submit Salary Revision
  const handleSalaryRevision = async () => {
    if (!salaryRevisionForm.daily_rate || !salaryRevisionForm.overtime_rate) {
      toast.error('Please enter Daily Rate and OT Rate');
      return;
    }
    if (!salaryRevisionForm.effective_from) {
      toast.error('Please select Effective From date');
      return;
    }

    try {
      const response = await api.post(`/api/labours/${salaryRevisionLabour.id}/salary-revision`, {
        monthly_salary: parseFloat(salaryRevisionForm.monthly_salary) || 0,
        daily_rate: parseFloat(salaryRevisionForm.daily_rate),
        overtime_rate: parseFloat(salaryRevisionForm.overtime_rate),
        effective_from: salaryRevisionForm.effective_from
      });
      toast.success(response.data.message || 'Salary revision saved');
      setShowSalaryRevisionModal(false);
      loadLabours();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save salary revision');
    }
  };

  // Open Salary History Modal
  const openSalaryHistoryModal = (labour) => {
    setSalaryHistoryLabour(labour);
    setShowSalaryHistoryModal(true);
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
                          <th className="p-2 text-center font-medium text-gray-400 w-10">#</th>
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
                              <td className="p-2 text-center text-gray-400 font-medium">{idx + 1}</td>
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

            {/* Search Bar */}
            <div className="mb-3">
              <Input
                placeholder="Search by name..."
                value={labourSearchTerm}
                onChange={(e) => setLabourSearchTerm(e.target.value)}
                className="max-w-xs"
                data-testid="labour-search-input"
              />
            </div>

            <div className="data-table overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="text-center w-10">#</th>
                    <th 
                      className="cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => {
                        if (labourSortField === 'name') {
                          setLabourSortOrder(labourSortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setLabourSortField('name');
                          setLabourSortOrder('asc');
                        }
                      }}
                    >
                      NAME {labourSortField === 'name' && (labourSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>PHONE</th>
                    <th 
                      className="text-right cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => {
                        if (labourSortField === 'monthly_salary') {
                          setLabourSortOrder(labourSortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setLabourSortField('monthly_salary');
                          setLabourSortOrder('desc');
                        }
                      }}
                    >
                      MONTHLY {labourSortField === 'monthly_salary' && (labourSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="text-right cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => {
                        if (labourSortField === 'default_daily_rate') {
                          setLabourSortOrder(labourSortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setLabourSortField('default_daily_rate');
                          setLabourSortOrder('desc');
                        }
                      }}
                    >
                      DAILY {labourSortField === 'default_daily_rate' && (labourSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-right">HOURLY</th>
                    <th 
                      className="text-right cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => {
                        if (labourSortField === 'default_overtime_rate') {
                          setLabourSortOrder(labourSortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setLabourSortField('default_overtime_rate');
                          setLabourSortOrder('desc');
                        }
                      }}
                    >
                      OT/HR {labourSortField === 'default_overtime_rate' && (labourSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      className="cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => {
                        if (labourSortField === 'joining_date') {
                          setLabourSortOrder(labourSortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setLabourSortField('joining_date');
                          setLabourSortOrder('desc');
                        }
                      }}
                    >
                      JOINING {labourSortField === 'joining_date' && (labourSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>BANK</th>
                    <th className="text-center">STATUS</th>
                    <th className="text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {labours
                    .filter(labour => showInactiveLabourers || labour.is_active !== false)
                    .filter(labour => labour.name?.toLowerCase().includes(labourSearchTerm.toLowerCase()))
                    .sort((a, b) => {
                      let aVal = a[labourSortField];
                      let bVal = b[labourSortField];
                      
                      // Handle numeric fields
                      if (['monthly_salary', 'default_daily_rate', 'default_overtime_rate'].includes(labourSortField)) {
                        aVal = parseFloat(aVal) || 0;
                        bVal = parseFloat(bVal) || 0;
                      }
                      
                      // Handle date fields
                      if (labourSortField === 'joining_date') {
                        aVal = aVal ? new Date(aVal).getTime() : 0;
                        bVal = bVal ? new Date(bVal).getTime() : 0;
                      }
                      
                      // Handle string fields
                      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                      
                      if (aVal < bVal) return labourSortOrder === 'asc' ? -1 : 1;
                      if (aVal > bVal) return labourSortOrder === 'asc' ? 1 : -1;
                      return 0;
                    })
                    .map((labour, idx) => (
                    <tr 
                      key={labour.id} 
                      className={labour.is_active === false ? 'bg-gray-50' : ''} 
                      data-testid={`labour-row-${labour.id}`}
                    >
                      <td className="text-center text-gray-400 font-medium">{idx + 1}</td>
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
                      <td className="text-right font-semibold text-purple-700">₹{labour.monthly_salary || 0}</td>
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
                            title="Edit"
                          >
                            <Edit2 size={14} className="text-blue-600" />
                          </Button>
                          {labour.salary_history && labour.salary_history.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openSalaryHistoryModal(labour)}
                              data-testid={`history-labour-${labour.id}`}
                              title="View Salary History"
                            >
                              <Clock size={14} className="text-purple-600" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteLabour(labour)}
                            data-testid={`delete-labour-${labour.id}`}
                            title="Delete"
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
            <div className="grid grid-cols-6 gap-2">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-600 rounded-lg">
                      <Users className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-800 font-medium uppercase">Present</p>
                      <p className="text-lg font-bold text-blue-900">{attendancePresentCount}/{attendance.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-600 rounded-lg">
                      <Clock className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-green-800 font-medium uppercase">Working Hrs</p>
                      <p className="text-lg font-bold text-green-900">{totalDailyHours}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-100 to-blue-200 border-blue-300">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-700 rounded-lg">
                      <Building2 className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-blue-800 font-medium uppercase">Retail Hrs</p>
                      <p className="text-lg font-bold text-blue-900">{totalRetailHours}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-100 to-purple-200 border-purple-300">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-700 rounded-lg">
                      <Building2 className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-purple-800 font-medium uppercase">QC Hrs</p>
                      <p className="text-lg font-bold text-purple-900">{totalQcHours}</p>
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
                      <p className="text-[10px] text-orange-800 font-medium uppercase">OT Total</p>
                      <p className="text-lg font-bold text-orange-900">{totalOvertimeHours}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-600 rounded-lg">
                      <Clock className="text-white" size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] text-amber-800 font-medium uppercase">OT Split</p>
                      <p className="text-sm font-bold">
                        <span className="text-blue-700">{totalRetailOtHours}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-purple-700">{totalQcOtHours}</span>
                      </p>
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
                      <th className="text-center w-10">#</th>
                      <th>LABOURER</th>
                      <th className="text-center">STATUS</th>
                      <th className="text-center">WORKING HRS</th>
                      <th className="text-center text-blue-700 bg-blue-50">RETAIL HRS</th>
                      <th className="text-center text-purple-700 bg-purple-50">QC HRS</th>
                      <th className="text-center">OT TOTAL</th>
                      <th className="text-center text-blue-700 bg-blue-50">RETAIL OT</th>
                      <th className="text-center text-purple-700 bg-purple-50">QC OT</th>
                      <th className="text-center">PAID LEAVE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center text-gray-500 py-8">
                          No labourers found. Add labourers in "Manage Labourers" tab first.
                        </td>
                      </tr>
                    ) : (
                      attendance.map((record, idx) => (
                        <tr 
                          key={record.labour_id} 
                          className={`${record.present ? '' : record.paid_leave ? 'bg-purple-50' : 'bg-gray-50'}`} 
                          data-testid={`attendance-row-${record.labour_id}`}
                        >
                          <td className="text-center text-gray-400 font-medium">{idx + 1}</td>
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
                                className="w-16 h-8 text-center mx-auto text-xs"
                                data-testid={`daily-hours-${record.labour_id}`}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center bg-blue-50/50">
                            {record.present ? (
                              <Input
                                type="number"
                                value={record.retail_hours || ''}
                                onChange={(e) => updateAttendance(record.labour_id, 'retail_hours', parseFloat(e.target.value) || 0)}
                                min="0"
                                max={record.working_hours || 9}
                                step="0.5"
                                className="w-16 h-8 text-center mx-auto text-xs border-blue-200"
                                placeholder="0"
                                data-testid={`retail-hours-${record.labour_id}`}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center bg-purple-50/50">
                            {record.present ? (
                              <Input
                                type="number"
                                value={record.qc_hours || ''}
                                onChange={(e) => updateAttendance(record.labour_id, 'qc_hours', parseFloat(e.target.value) || 0)}
                                min="0"
                                max={record.working_hours || 9}
                                step="0.5"
                                className="w-16 h-8 text-center mx-auto text-xs border-purple-200"
                                placeholder="0"
                                data-testid={`qc-hours-${record.labour_id}`}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center">
                            <span className={`font-medium ${record.overtime_hours > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                              {record.overtime_hours || 0}
                            </span>
                          </td>
                          <td className="text-center bg-blue-50/50">
                            {record.present ? (
                              <Input
                                type="number"
                                value={record.retail_ot_hours || ''}
                                onChange={(e) => updateAttendance(record.labour_id, 'retail_ot_hours', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.5"
                                className="w-16 h-8 text-center mx-auto text-xs border-blue-200"
                                placeholder="0"
                                data-testid={`retail-ot-${record.labour_id}`}
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="text-center bg-purple-50/50">
                            {record.present ? (
                              <Input
                                type="number"
                                value={record.qc_ot_hours || ''}
                                onChange={(e) => updateAttendance(record.labour_id, 'qc_ot_hours', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.5"
                                className="w-16 h-8 text-center mx-auto text-xs border-purple-200"
                                placeholder="0"
                                data-testid={`qc-ot-${record.labour_id}`}
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
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td className="p-2 font-bold text-gray-400"></td>
                      <td className="p-2 font-bold">TOTAL</td>
                      <td className="p-2 text-center font-bold">
                        <span className="text-green-700">{attendance.filter(a => a.present).length}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-600">{attendance.length}</span>
                      </td>
                      <td className="p-2 text-center font-bold text-gray-600">{attendance.reduce((sum, r) => sum + (r.present ? (r.working_hours || 9) : 0), 0).toFixed(1)}</td>
                      <td className="p-2 text-center font-bold text-blue-600 bg-blue-50">{attendance.reduce((sum, r) => sum + (r.retail_hours || 0), 0).toFixed(1)}</td>
                      <td className="p-2 text-center font-bold text-purple-600 bg-purple-50">{attendance.reduce((sum, r) => sum + (r.qc_hours || 0), 0).toFixed(1)}</td>
                      <td className="p-2 text-center font-bold text-orange-600">{attendance.reduce((sum, r) => sum + (r.overtime_hours || 0), 0).toFixed(1)}</td>
                      <td className="p-2 text-center font-bold text-blue-600 bg-blue-50">{attendance.reduce((sum, r) => sum + (r.retail_ot_hours || 0), 0).toFixed(1)}</td>
                      <td className="p-2 text-center font-bold text-purple-600 bg-purple-50">{attendance.reduce((sum, r) => sum + (r.qc_ot_hours || 0), 0).toFixed(1)}</td>
                      <td className="p-2 text-center font-bold text-purple-600">{attendance.filter(a => !a.present && a.paid_leave).length}</td>
                    </tr>
                  </tfoot>
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
              
              {/* For NEW labourers - show editable salary fields */}
              {!editingLabour && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Monthly Salary (₹)</label>
                    <Input
                      type="number"
                      value={labourForm.monthly_salary}
                      onChange={(e) => {
                        const monthly = parseFloat(e.target.value) || 0;
                        const daily = monthly > 0 ? (monthly / 30).toFixed(2) : '';
                        const hourly = daily ? (parseFloat(daily) / 9).toFixed(2) : '';
                        setLabourForm({ 
                          ...labourForm, 
                          monthly_salary: e.target.value,
                          default_daily_rate: daily,
                          default_overtime_rate: hourly
                        });
                      }}
                      placeholder="e.g., 15000"
                      data-testid="labour-monthly-salary-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Daily & Hourly rates auto-calculate (Monthly÷30, Daily÷9)</p>
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
                </>
              )}

              {/* For EXISTING labourers - show read-only current rates with Update Salary button */}
              {editingLabour && (
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">Current Salary Rates</h4>
                    <div className="flex gap-2">
                      {editingLabour.salary_history && editingLabour.salary_history.length > 0 && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setShowLabourModal(false);
                            openSalaryHistoryModal(editingLabour);
                          }}
                          className="text-purple-600 border-purple-300 hover:bg-purple-50"
                          data-testid="view-history-btn"
                        >
                          <Clock size={14} className="mr-1" /> View History ({editingLabour.salary_history.length})
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          setShowLabourModal(false);
                          openSalaryRevisionModal(editingLabour);
                        }}
                        className="text-blue-600 border-blue-300 hover:bg-blue-50"
                        data-testid="update-salary-btn"
                      >
                        <TrendingUp size={14} className="mr-1" /> Update Salary
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white rounded p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Monthly</p>
                      <p className="text-lg font-bold text-purple-700">₹{labourForm.monthly_salary || 0}</p>
                    </div>
                    <div className="bg-white rounded p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">Daily Rate</p>
                      <p className="text-lg font-bold text-green-700">₹{labourForm.default_daily_rate || 0}</p>
                    </div>
                    <div className="bg-white rounded p-2 border">
                      <p className="text-[10px] text-gray-500 uppercase">OT Rate/Hr</p>
                      <p className="text-lg font-bold text-orange-700">₹{labourForm.default_overtime_rate || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Use "Update Salary" to revise rates with a specific effective date
                  </p>
                </div>
              )}
              
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

        {/* Salary Revision Modal */}
        <Dialog open={showSalaryRevisionModal} onOpenChange={setShowSalaryRevisionModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-600" />
                Update Salary - {salaryRevisionLabour?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Current Rates Display */}
              {salaryRevisionLabour && (
                <div className="bg-gray-100 rounded-lg p-3 mb-4">
                  <p className="text-xs text-gray-600 font-medium mb-2">CURRENT RATES</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-gray-500">Monthly</p>
                      <p className="text-sm font-bold text-gray-700">₹{salaryRevisionLabour.monthly_salary || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500">Daily</p>
                      <p className="text-sm font-bold text-gray-700">₹{salaryRevisionLabour.default_daily_rate || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500">OT/Hr</p>
                      <p className="text-sm font-bold text-gray-700">₹{salaryRevisionLabour.default_overtime_rate || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* New Rates Form */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-blue-700 mb-3">NEW SALARY RATES</p>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Effective From *</label>
                    <Input
                      type="date"
                      value={salaryRevisionForm.effective_from}
                      onChange={(e) => handleSalaryRevisionChange('effective_from', e.target.value)}
                      data-testid="salary-effective-from"
                    />
                    <p className="text-xs text-gray-500 mt-1">Date from when new salary applies</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">New Monthly Salary (₹)</label>
                    <Input
                      type="number"
                      value={salaryRevisionForm.monthly_salary}
                      onChange={(e) => handleSalaryRevisionChange('monthly_salary', e.target.value)}
                      placeholder="e.g., 15000"
                      data-testid="salary-monthly-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Daily & OT rates auto-calculate</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Daily Rate (₹) *</label>
                      <Input
                        type="number"
                        value={salaryRevisionForm.daily_rate}
                        onChange={(e) => handleSalaryRevisionChange('daily_rate', e.target.value)}
                        placeholder="e.g., 500"
                        data-testid="salary-daily-input"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">OT Rate/Hr (₹) *</label>
                      <Input
                        type="number"
                        value={salaryRevisionForm.overtime_rate}
                        onChange={(e) => handleSalaryRevisionChange('overtime_rate', e.target.value)}
                        placeholder="e.g., 50"
                        data-testid="salary-ot-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSalaryRevisionModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSalaryRevision} className="bg-blue-600 hover:bg-blue-700" data-testid="save-salary-revision-btn">
                <TrendingUp size={16} className="mr-1" /> Save Revision
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Salary History Modal */}
        <Dialog open={showSalaryHistoryModal} onOpenChange={setShowSalaryHistoryModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock size={20} className="text-purple-600" />
                Salary History - {salaryHistoryLabour?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {salaryHistoryLabour?.salary_history && salaryHistoryLabour.salary_history.length > 0 ? (
                <div className="space-y-3">
                  {/* Current Rate Highlight */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-green-800 uppercase">Current Rate</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-green-600">Monthly</p>
                        <p className="text-sm font-bold text-green-800">₹{salaryHistoryLabour.monthly_salary?.toLocaleString('en-IN') || 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-green-600">Daily</p>
                        <p className="text-sm font-bold text-green-800">₹{salaryHistoryLabour.default_daily_rate?.toLocaleString('en-IN', {maximumFractionDigits: 2}) || 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-green-600">OT/Hr</p>
                        <p className="text-sm font-bold text-green-800">₹{salaryHistoryLabour.default_overtime_rate?.toLocaleString('en-IN', {maximumFractionDigits: 2}) || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* History Timeline */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-3 py-2 border-b">
                      <p className="text-xs font-semibold text-gray-700">REVISION HISTORY ({salaryHistoryLabour.salary_history.length} records)</p>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left text-gray-600">#</th>
                            <th className="p-2 text-left text-gray-600">EFFECTIVE FROM</th>
                            <th className="p-2 text-left text-gray-600">EFFECTIVE TO</th>
                            <th className="p-2 text-right text-gray-600">MONTHLY</th>
                            <th className="p-2 text-right text-gray-600">DAILY</th>
                            <th className="p-2 text-right text-gray-600">OT/HR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...salaryHistoryLabour.salary_history]
                            .sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from))
                            .map((entry, idx) => {
                              const isCurrent = entry.effective_to === null;
                              return (
                                <tr 
                                  key={idx} 
                                  className={`border-b ${isCurrent ? 'bg-green-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                                >
                                  <td className="p-2 text-gray-400">{salaryHistoryLabour.salary_history.length - idx}</td>
                                  <td className="p-2">
                                    <span className="font-medium">
                                      {new Date(entry.effective_from).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    {entry.effective_to ? (
                                      <span className="text-gray-600">
                                        {new Date(entry.effective_to).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
                                      </span>
                                    ) : (
                                      <span className="text-green-600 font-semibold">Current</span>
                                    )}
                                  </td>
                                  <td className="p-2 text-right font-medium text-purple-700">
                                    ₹{(entry.monthly_salary || 0).toLocaleString('en-IN')}
                                  </td>
                                  <td className="p-2 text-right font-medium text-gray-700">
                                    ₹{(entry.daily_rate || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}
                                  </td>
                                  <td className="p-2 text-right font-medium text-orange-600">
                                    ₹{(entry.overtime_rate || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Info Note */}
                  <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                    <AlertCircle size={14} className="inline mr-1" />
                    Payroll calculations automatically use the correct rate based on each attendance date.
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Clock size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No Salary History Found</p>
                  <p className="text-xs mt-1">Use "Update Salary" to create the first revision</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowSalaryHistoryModal(false);
                  if (salaryHistoryLabour) {
                    openSalaryRevisionModal(salaryHistoryLabour);
                  }
                }}
                className="text-blue-600 border-blue-300"
              >
                <TrendingUp size={14} className="mr-1" /> Add New Revision
              </Button>
              <Button onClick={() => setShowSalaryHistoryModal(false)}>
                Close
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
                <CardContent className="p-3">
                  {/* Search Bar */}
                  <div className="mb-3">
                    <Input
                      placeholder="Search by name..."
                      value={payrollSearchTerm}
                      onChange={(e) => setPayrollSearchTerm(e.target.value)}
                      className="max-w-xs text-xs"
                      data-testid="payroll-search-input"
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-2 text-left font-medium text-gray-500">#</th>
                          <th 
                            className="p-2 text-left font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => {
                              if (payrollSortField === 'labour_name') {
                                setPayrollSortOrder(payrollSortOrder === 'asc' ? 'desc' : 'asc');
                              } else {
                                setPayrollSortField('labour_name');
                                setPayrollSortOrder('asc');
                              }
                            }}
                          >
                            NAME {payrollSortField === 'labour_name' && (payrollSortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="p-2 text-left font-medium text-gray-500">BANK A/C</th>
                          <th className="p-2 text-left font-medium text-gray-500">IFSC</th>
                          <th 
                            className="p-2 text-center font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => {
                              if (payrollSortField === 'days_present') {
                                setPayrollSortOrder(payrollSortOrder === 'asc' ? 'desc' : 'asc');
                              } else {
                                setPayrollSortField('days_present');
                                setPayrollSortOrder('desc');
                              }
                            }}
                          >
                            DAYS {payrollSortField === 'days_present' && (payrollSortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th 
                            className="p-2 text-center font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => {
                              if (payrollSortField === 'total_overtime_hours') {
                                setPayrollSortOrder(payrollSortOrder === 'asc' ? 'desc' : 'asc');
                              } else {
                                setPayrollSortField('total_overtime_hours');
                                setPayrollSortOrder('desc');
                              }
                            }}
                          >
                            OT HRS {payrollSortField === 'total_overtime_hours' && (payrollSortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th 
                            className="p-2 text-right font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => {
                              if (payrollSortField === 'total_payment') {
                                setPayrollSortOrder(payrollSortOrder === 'asc' ? 'desc' : 'asc');
                              } else {
                                setPayrollSortField('total_payment');
                                setPayrollSortOrder('desc');
                              }
                            }}
                          >
                            AMOUNT {payrollSortField === 'total_payment' && (payrollSortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="p-2 text-right font-medium text-gray-500">PAID</th>
                          <th 
                            className="p-2 text-right font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => {
                              if (payrollSortField === 'net_payable') {
                                setPayrollSortOrder(payrollSortOrder === 'asc' ? 'desc' : 'asc');
                              } else {
                                setPayrollSortField('net_payable');
                                setPayrollSortOrder('desc');
                              }
                            }}
                          >
                            NET PAYABLE {payrollSortField === 'net_payable' && (payrollSortOrder === 'asc' ? '↑' : '↓')}
                          </th>
                          <th className="p-2 text-center font-medium text-gray-500">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.labour_breakdown
                          .filter(lb => lb.labour_name?.toLowerCase().includes(payrollSearchTerm.toLowerCase()))
                          .sort((a, b) => {
                            let aVal = a[payrollSortField];
                            let bVal = b[payrollSortField];
                            
                            // Handle numeric fields
                            if (['days_present', 'total_overtime_hours', 'total_payment', 'net_payable'].includes(payrollSortField)) {
                              aVal = parseFloat(aVal) || 0;
                              bVal = parseFloat(bVal) || 0;
                            }
                            
                            // Handle string fields
                            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                            
                            if (aVal < bVal) return payrollSortOrder === 'asc' ? -1 : 1;
                            if (aVal > bVal) return payrollSortOrder === 'asc' ? 1 : -1;
                            return 0;
                          })
                          .map((lb, idx) => {
                          const labourDetails = labours.find(l => l.id === lb.labour_id) || {};
                          const isInactive = lb.is_active === false || labourDetails.is_active === false;
                          const totalPaid = lb.total_paid || 0;
                          const netPayable = lb.net_payable !== undefined ? lb.net_payable : (lb.total_payment || 0);
                          const isFullyPaid = netPayable <= 0;
                          return (
                            <tr key={lb.labour_id} className={`border-b hover:bg-gray-100 ${isInactive ? 'bg-red-50' : ''} ${isFullyPaid ? 'bg-green-50' : ''}`}>
                              <td className="p-2 text-gray-400">{idx + 1}</td>
                              <td className={`p-2 font-medium ${isInactive ? 'text-red-700' : ''}`}>
                                {lb.labour_name}
                                {isInactive && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">INACTIVE</span>}
                                {isFullyPaid && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">PAID</span>}
                              </td>
                              <td className="p-2 text-gray-600 font-mono text-[10px]">
                                {labourDetails.bank_account_number || <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-2 text-gray-600 font-mono text-[10px]">
                                {labourDetails.ifsc_code || <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-2 text-center">{lb.days_present}</td>
                              <td className="p-2 text-center text-orange-600">{(lb.total_overtime_hours || 0).toFixed(1)}</td>
                              <td className={`p-2 text-right font-medium ${isInactive ? 'text-red-700' : 'text-gray-700'}`}>
                                ₹{(lb.total_payment || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </td>
                              <td className="p-2 text-right">
                                {totalPaid > 0 ? (
                                  <button 
                                    onClick={() => loadPaymentHistory(lb)}
                                    className="text-blue-600 hover:underline font-medium"
                                  >
                                    ₹{totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className={`p-2 text-right font-semibold ${netPayable <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                                {netPayable <= 0 ? '₹0' : `₹${netPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => loadPayrollDetail(lb.labour_id)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-[10px] px-2 py-1 h-7"
                                    data-testid={`view-detail-${lb.labour_id}`}
                                  >
                                    Details
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => openAddPaymentModal(lb)}
                                    className="text-green-600 hover:text-green-800 hover:bg-green-50 text-[10px] px-2 py-1 h-7"
                                    data-testid={`add-payment-${lb.labour_id}`}
                                  >
                                    + Pay
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-gray-100 font-semibold">
                          <td className="p-2" colSpan={4}>TOTAL</td>
                          <td className="p-2 text-center">{payrollData.summary?.total_man_days || 0}</td>
                          <td className="p-2 text-center text-orange-600">{(payrollData.summary?.total_overtime_hours || 0).toFixed(1)}</td>
                          <td className="p-2 text-right text-gray-700">
                            ₹{(payrollData.summary?.total_payment || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-right text-blue-700">
                            ₹{(payrollData.summary?.total_paid || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-right text-orange-700">
                            ₹{(payrollData.summary?.net_payable || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td></td>
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

        {/* Detailed Payroll Breakdown Modal */}
        <Dialog open={showPayrollDetailModal} onOpenChange={setShowPayrollDetailModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User size={20} />
                Payroll Breakdown - {payrollDetailData?.labour_name || 'Loading...'}
                {payrollDetailData?.is_active === false && (
                  <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-normal">INACTIVE</span>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {loadingPayrollDetail ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="animate-spin text-gray-400" size={32} />
              </div>
            ) : payrollDetailData ? (
              <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-blue-800 font-medium">DAYS PRESENT</p>
                      <p className="text-xl font-bold text-blue-900">{payrollDetailData.summary.days_present}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-50 border-purple-200">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-purple-800 font-medium">REGULAR HOURS</p>
                      <p className="text-xl font-bold text-purple-900">{payrollDetailData.summary.total_working_hours}</p>
                      <p className="text-xs text-purple-600">₹{payrollDetailData.summary.total_regular_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-orange-50 border-orange-200">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-orange-800 font-medium">OVERTIME HOURS</p>
                      <p className="text-xl font-bold text-orange-900">{payrollDetailData.summary.total_overtime_hours}</p>
                      <p className="text-xs text-orange-600">₹{payrollDetailData.summary.total_overtime_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50 border-green-200">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-green-800 font-medium">FINAL PAYABLE</p>
                      <p className="text-xl font-bold text-green-900">₹{payrollDetailData.summary.final_payable?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Salary History Section */}
                {payrollDetailData.salary_history && payrollDetailData.salary_history.length > 0 && (
                  <Card className="border-indigo-200 bg-indigo-50">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-sm text-indigo-800 flex items-center gap-2">
                        <TrendingUp size={16} /> Salary History ({payrollDetailData.salary_history.length} revisions)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-indigo-100">
                            <tr>
                              <th className="p-2 text-left text-indigo-800">EFFECTIVE FROM</th>
                              <th className="p-2 text-left text-indigo-800">EFFECTIVE TO</th>
                              <th className="p-2 text-right text-indigo-800">MONTHLY</th>
                              <th className="p-2 text-right text-indigo-800">DAILY RATE</th>
                              <th className="p-2 text-right text-indigo-800">OT RATE/HR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payrollDetailData.salary_history.map((entry, idx) => (
                              <tr key={idx} className={`border-b border-indigo-200 ${entry.effective_to === null ? 'bg-indigo-100 font-medium' : ''}`}>
                                <td className="p-2">
                                  {new Date(entry.effective_from).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}
                                </td>
                                <td className="p-2">
                                  {entry.effective_to 
                                    ? new Date(entry.effective_to).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})
                                    : <span className="text-green-600 font-medium">Current</span>
                                  }
                                </td>
                                <td className="p-2 text-right text-purple-700">₹{(entry.monthly_salary || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2 text-right text-green-700">₹{(entry.daily_rate || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}</td>
                                <td className="p-2 text-right text-orange-700">₹{(entry.overtime_rate || 0).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-indigo-600 mt-2">
                        Current Rate: ₹{payrollDetailData.current_daily_rate?.toLocaleString('en-IN', {maximumFractionDigits: 2})}/day, 
                        OT: ₹{payrollDetailData.current_overtime_rate?.toLocaleString('en-IN')}/hr
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Paid Leaves Section */}
                {payrollDetailData.highlights.paid_leave_days?.length > 0 && (
                  <Card className="border-cyan-200 bg-cyan-50">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-sm text-cyan-800 flex items-center gap-2">
                        <CreditCard size={16} /> Paid Leaves ({payrollDetailData.highlights.paid_leave_days.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="flex flex-wrap gap-2">
                        {payrollDetailData.highlights.paid_leave_days.map((day, idx) => (
                          <span key={idx} className="text-xs bg-cyan-100 text-cyan-800 px-2 py-1 rounded">
                            {new Date(day.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})} - ₹{day.payment?.toLocaleString('en-IN')}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-cyan-700 mt-2 font-medium">
                        Total Paid Leave: ₹{payrollDetailData.summary.total_paid_leave_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Days Under 9 Hours Warning */}
                {payrollDetailData.highlights.days_under_9_hours?.length > 0 && (
                  <Card className="border-yellow-200 bg-yellow-50">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-sm text-yellow-800 flex items-center gap-2">
                        <AlertCircle size={16} /> Days with Less than 9 Hours ({payrollDetailData.highlights.days_under_9_hours.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="flex flex-wrap gap-2">
                        {payrollDetailData.highlights.days_under_9_hours.map((day, idx) => (
                          <span key={idx} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                            {new Date(day.date).toLocaleDateString('en-IN', {day: '2-digit', month: 'short'})} - {day.hours}h
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Overtime Days */}
                {payrollDetailData.highlights.days_with_overtime?.length > 0 && (
                  <Card className="border-orange-200 bg-orange-50">
                    <CardHeader className="py-2 px-3">
                      <CardTitle className="text-sm text-orange-800 flex items-center gap-2">
                        <Clock size={16} /> Overtime Days ({payrollDetailData.highlights.days_with_overtime.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-orange-100">
                            <tr>
                              <th className="p-2 text-left text-orange-800">DATE</th>
                              <th className="p-2 text-center text-orange-800">OT HOURS</th>
                              <th className="p-2 text-right text-orange-800">OT PAYMENT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payrollDetailData.highlights.days_with_overtime.map((day, idx) => (
                              <tr key={idx} className="border-b border-orange-200">
                                <td className="p-2">{new Date(day.date).toLocaleDateString('en-IN', {weekday: 'short', day: '2-digit', month: 'short'})}</td>
                                <td className="p-2 text-center font-medium text-orange-700">{day.hours}</td>
                                <td className="p-2 text-right text-orange-700">₹{day.payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</td>
                              </tr>
                            ))}
                            <tr className="bg-orange-100 font-semibold">
                              <td className="p-2">TOTAL</td>
                              <td className="p-2 text-center text-orange-800">{payrollDetailData.summary.total_overtime_hours}</td>
                              <td className="p-2 text-right text-orange-800">₹{payrollDetailData.summary.total_overtime_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Daily Attendance Records */}
                <Card>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CalendarDays size={16} /> Daily Attendance Records
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left font-medium text-gray-500">DATE</th>
                            <th className="p-2 text-center font-medium text-gray-500">HOURS</th>
                            <th className="p-2 text-center font-medium text-gray-500">OT</th>
                            <th className="p-2 text-right font-medium text-gray-500">DAILY RATE</th>
                            <th className="p-2 text-right font-medium text-gray-500">OT RATE</th>
                            <th className="p-2 text-right font-medium text-gray-500">PAYMENT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payrollDetailData.daily_records.map((record, idx) => (
                            <tr 
                              key={idx} 
                              className={`border-b ${record.is_under_9_hours ? 'bg-yellow-50' : ''} ${record.is_paid_leave ? 'bg-cyan-50' : ''}`}
                            >
                              <td className="p-2">
                                {new Date(record.date).toLocaleDateString('en-IN', {weekday: 'short', day: '2-digit', month: 'short'})}
                                {record.is_paid_leave && <span className="ml-1 text-[9px] bg-cyan-100 text-cyan-700 px-1 rounded">PL</span>}
                              </td>
                              <td className={`p-2 text-center ${record.is_under_9_hours ? 'text-yellow-700 font-medium' : ''}`}>
                                {record.working_hours}
                              </td>
                              <td className="p-2 text-center text-orange-600">
                                {record.overtime_hours > 0 ? record.overtime_hours : '-'}
                              </td>
                              <td className="p-2 text-right text-gray-600">₹{record.daily_rate?.toLocaleString('en-IN')}</td>
                              <td className="p-2 text-right text-gray-600">₹{record.overtime_rate}</td>
                              <td className="p-2 text-right font-medium text-green-700">
                                ₹{record.total_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Final Calculation Summary */}
                <Card className="border-green-300 bg-green-50">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold text-green-800 mb-3">Payment Calculation</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Regular Work ({payrollDetailData.summary.days_present} days × ₹{payrollDetailData.default_daily_rate})</span>
                        <span className="font-medium">₹{payrollDetailData.summary.total_regular_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                      </div>
                      {payrollDetailData.summary.total_overtime_hours > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Overtime ({payrollDetailData.summary.total_overtime_hours} hrs × ₹{payrollDetailData.default_overtime_rate})</span>
                          <span className="font-medium text-orange-700">+ ₹{payrollDetailData.summary.total_overtime_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                        </div>
                      )}
                      {payrollDetailData.summary.total_paid_leave_payment > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Paid Leave ({payrollDetailData.highlights.paid_leave_days?.length} days)</span>
                          <span className="font-medium text-cyan-700">₹{payrollDetailData.summary.total_paid_leave_payment?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                        </div>
                      )}
                      <div className="border-t border-green-300 pt-2 flex justify-between text-base font-bold text-green-800">
                        <span>Final Payable</span>
                        <span>₹{payrollDetailData.summary.final_payable?.toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => setShowPayrollDetailModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add/Edit Payment Modal */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard size={20} />
                {paymentModalMode === 'edit' ? 'Edit Payment' : 'Record Payment'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedLabourForPayment && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Paying to:</p>
                  <p className="font-semibold">{selectedLabourForPayment.labour_name}</p>
                  <p className="text-xs text-gray-500">
                    Period: {payrollDateFrom} to {payrollDateTo}
                  </p>
                  <p className="text-sm mt-1">
                    Amount Due: <span className="font-semibold text-orange-600">₹{(selectedLabourForPayment.net_payable || selectedLabourForPayment.total_payment || 0).toLocaleString('en-IN', {maximumFractionDigits: 2})}</span>
                  </p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Amount *</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                      placeholder="Enter amount"
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Payment Date *</label>
                    <Input
                      type="date"
                      value={paymentForm.payment_date}
                      onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Transaction ID / Reference</label>
                    <Input
                      type="text"
                      value={paymentForm.transaction_id}
                      onChange={(e) => setPaymentForm({...paymentForm, transaction_id: e.target.value})}
                      placeholder="e.g., NEFT123456789"
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Payment Mode</label>
                    <select
                      value={paymentForm.payment_mode}
                      onChange={(e) => setPaymentForm({...paymentForm, payment_mode: e.target.value})}
                      className="mt-1 w-full border rounded-md p-2 text-sm"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Notes</label>
                    <Input
                      type="text"
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                      placeholder="Optional notes"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={savePayment} 
                disabled={savingPayment}
                className="bg-green-600 hover:bg-green-700"
              >
                {savingPayment ? <RefreshCw className="animate-spin mr-2" size={16} /> : null}
                {paymentModalMode === 'edit' ? 'Update Payment' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment History Modal */}
        <Dialog open={showPaymentHistoryModal} onOpenChange={setShowPaymentHistoryModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard size={20} />
                Payment History - {paymentHistoryData?.labour_name || 'Loading...'}
              </DialogTitle>
            </DialogHeader>
            
            {paymentHistoryData && (
              <div className="overflow-y-auto flex-1 space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-blue-800">Total Paid</p>
                      <p className="text-2xl font-bold text-blue-900">
                        ₹{paymentHistoryData.total_paid?.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-blue-800">Payments</p>
                      <p className="text-2xl font-bold text-blue-900">{paymentHistoryData.payment_count}</p>
                    </div>
                  </div>
                </div>
                
                {paymentHistoryData.payments?.length > 0 ? (
                  <div className="space-y-2">
                    {paymentHistoryData.payments.map((payment) => (
                      <Card key={payment.id} className="border">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-green-700">
                                  ₹{payment.amount?.toLocaleString('en-IN', {maximumFractionDigits: 2})}
                                </span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                  {payment.payment_mode}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mt-1">
                                {new Date(payment.payment_date).toLocaleDateString('en-IN', {
                                  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
                                })}
                              </p>
                              {payment.transaction_id && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Ref: {payment.transaction_id}
                                </p>
                              )}
                              {payment.notes && (
                                <p className="text-xs text-gray-500 mt-1 italic">
                                  {payment.notes}
                                </p>
                              )}
                              {payment.period_from && payment.period_to && (
                                <p className="text-[10px] text-gray-400 mt-1">
                                  For period: {payment.period_from} to {payment.period_to}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowPaymentHistoryModal(false);
                                  openEditPaymentModal(selectedLabourForPayment, payment);
                                }}
                                className="text-blue-600 hover:text-blue-800 h-7 px-2"
                              >
                                <Pencil size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deletePayment(payment.id)}
                                className="text-red-600 hover:text-red-800 h-7 px-2"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-4">No payments recorded yet</p>
                )}
              </div>
            )}
            
            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => setShowPaymentHistoryModal(false)}>
                Close
              </Button>
              <Button 
                onClick={() => {
                  setShowPaymentHistoryModal(false);
                  openAddPaymentModal(selectedLabourForPayment);
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                + Add Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
