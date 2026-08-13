import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { 
  Plus, Calculator, Edit2, Trash2, RefreshCw, CheckCircle, Clock, 
  AlertTriangle, Calendar, Copy, Users, Eye, Building2, FileText, UserPlus, Save, X, Download
} from 'lucide-react';

const FIXED_CATEGORIES = [
  'Rent',
  'Salaries',
  'Utilities',
  'Insurance',
  'Vehicle EMI',
  'Loan EMI',
  'Taxes',
  'Software',
  'Internet/Phone',
  'Security',
  'Maintenance',
  'Allowance',
  'Asset EMI',
  'Subscription',
  'Other'
];

const EXPENSE_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'allowance', label: 'Allowance' },
  { value: 'asset_emi', label: 'Asset EMI' },
  { value: 'subscription', label: 'Subscription' }
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function FixedExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [initialMonthLoaded, setInitialMonthLoaded] = useState(false);
  
  // Main Tab state: 'attendance', 'employees', 'expenses', 'payroll'
  const [activeMainTab, setActiveMainTab] = useState('expenses');
  
  // Department Management State
  const [departments, setDepartments] = useState([
    'Operations', 'Procurement', 'Sales', 'Logistics', 'Finance', 'HR', 'Admin', 'IT', 'Warehouse', 'Other'
  ]);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [newDepartment, setNewDepartment] = useState('');
  
  // Employee Management State
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployeeData, setEditingEmployeeData] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [showViewEmployeeModal, setShowViewEmployeeModal] = useState(false);
  const [employeeFormData, setEmployeeFormData] = useState({
    name: '',
    phone: '',
    address: '',
    ctc: '',
    doj: '',
    lwd: '',
    aadhar_number: '',
    pan_number: '',
    emergency_contact: '',
    department: '',
    city: '',
    vertical: 'Central',
    designation: '',
    status: 'active',
    bank_name: '',
    bank_account_number: '',
    ifsc_code: '',
    gender: '',
    state: ''
  });
  
  // Attendance State
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState({
    total_employees: 0,
    present: 0,
    absent: 0,
    total_working_hours: 0,
    total_retail_hours: 0,
    total_qc_hours: 0,
    total_ot: 0
  });
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [showCopyDatesModal, setShowCopyDatesModal] = useState(false);
  const [copyTargetDates, setCopyTargetDates] = useState([]);
  
  // Payroll Processing State
  const [payrollDateFrom, setPayrollDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [payrollDateTo, setPayrollDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [payrollData, setPayrollData] = useState(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedEmployeeForPayment, setSelectedEmployeeForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [showPaymentHistoryModal, setShowPaymentHistoryModal] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showPayrollDetailModal, setShowPayrollDetailModal] = useState(false);
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState(null);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [selectedPayslipEmployee, setSelectedPayslipEmployee] = useState(null);
  
  // Filter mode: 'month' or 'dateRange'
  const [filterMode, setFilterMode] = useState('month');
  
  // Month-based filters
  const [filterMonth, setFilterMonth] = useState(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  
  // Date range filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  
  // Common filters
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Form data
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],  // Full date instead of month/year
    month: new Date().getMonth() + 1,  // Keep for backward compatibility (1-12)
    year: new Date().getFullYear(),
    category: '',
    description: '',
    amount: '',
    due_date: '1',
    status: 'Pending',
    payment_date: '',
    payment_mode: 'Cash',
    payment_reference: '',
    is_recurring: true,
    paid_by_type: 'company', // 'company' or 'employee'
    paid_by: 'Company',
    paid_by_employee_id: '',
    is_settled: true,
    settlement_date: '',
    settlement_remarks: '',
    vendor: '',
    invoice_number: ''
  });
  
  // Payment Details Modal state
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);
  const [paymentDetailsForm, setPaymentDetailsForm] = useState({
    payment_mode: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    payment_reference: '',
    paid_by_type: 'company',
    paid_by_employee_id: ''
  });
  
  // View Details Modal state
  const [showViewDetailsModal, setShowViewDetailsModal] = useState(false);
  const [viewingExpense, setViewingExpense] = useState(null);
  
  // Corporate Expenses Management state
  const [showCorporateDialog, setShowCorporateDialog] = useState(false);
  const [corporateTab, setCorporateTab] = useState('templates'); // 'templates' or 'employees'
  const [corporateEmployees, setCorporateEmployees] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    category: '',
    description: '',
    amount: '',
    due_date: '1',
    vendor: '',
    invoice_number: '',
    linked_employee_id: '',
    linked_employee_name: '',
    expense_type: 'general',
    notes: ''
  });
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    role: '',
    department: '',
    notes: ''
  });
  
  // Staff users for Paid By dropdown
  const [staffUsers, setStaffUsers] = useState([]);
  
  // Vendor Management State
  const [vendors, setVendors] = useState([]);
  const [showVendorManagement, setShowVendorManagement] = useState(false);
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', contact: '', phone: '', notes: '' });
  const [filterVendor, setFilterVendor] = useState('all');
  
  // Bulk settlement
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [settlementRemarks, setSettlementRemarks] = useState('');

  // Load staff users for Paid By dropdown
  useEffect(() => {
    const loadStaffUsers = async () => {
      try {
        const response = await api.get('/api/employees');
        setStaffUsers(response.data || []);
      } catch (error) {
        console.error('Failed to load staff users:', error);
      }
    };
    loadStaffUsers();
  }, []);

  // Load vendors
  const loadVendors = useCallback(async () => {
    try {
      const response = await api.get('/api/vendors');
      setVendors(response.data || []);
    } catch (error) {
      console.error('Failed to load vendors:', error);
      setVendors([]);
    }
  }, []);

  // Load vendors on mount
  useEffect(() => {
    loadVendors();
  }, [loadVendors]);

  // On mount, fetch the latest month that has fixed expense data
  useEffect(() => {
    const fetchLatestMonth = async () => {
      try {
        // Fetch all fixed expenses without date filter to find the latest month
        const response = await api.get('/api/expenses/fixed?limit=100');
        const allExpenses = response.data || [];
        
        if (allExpenses.length > 0) {
          // Find the latest month/year from existing expenses
          let latestYear = 0;
          let latestMonth = 0;
          
          allExpenses.forEach(exp => {
            const expYear = exp.year || new Date(exp.date).getFullYear();
            const expMonth = exp.month || (new Date(exp.date).getMonth() + 1); // 1-indexed
            
            if (expYear > latestYear || (expYear === latestYear && expMonth > latestMonth)) {
              latestYear = expYear;
              latestMonth = expMonth;
            }
          });
          
          if (latestYear > 0 && latestMonth > 0) {
            setFilterYear(latestYear);
            setFilterMonth(latestMonth - 1); // Convert to 0-indexed for filter
            setInitialMonthLoaded(true);
            return;
          }
        }
        
        // Fallback to current month if no data found
        setFilterMonth(new Date().getMonth());
        setFilterYear(new Date().getFullYear());
        setInitialMonthLoaded(true);
      } catch (error) {
        console.error('Failed to fetch latest month:', error);
        // Fallback to current month on error
        setFilterMonth(new Date().getMonth());
        setFilterYear(new Date().getFullYear());
        setInitialMonthLoaded(true);
      }
    };
    
    fetchLatestMonth();
  }, []);

  const loadExpenses = useCallback(async () => {
    // Wait until initial month is determined (only for month mode)
    if (filterMode === 'month' && filterMonth === null) return;
    
    setLoading(true);
    try {
      let url = '/api/expenses/fixed';
      const params = new URLSearchParams();
      
      // Use date range or month/year based on filter mode
      if (filterMode === 'dateRange' && (filterDateFrom || filterDateTo)) {
        if (filterDateFrom) params.append('from_date', filterDateFrom);
        if (filterDateTo) params.append('to_date', filterDateTo);
      } else {
        params.append('month', filterMonth + 1);  // Convert 0-indexed to 1-indexed
        params.append('year', filterYear);
      }
      
      if (filterCategory !== 'all') params.append('category', filterCategory);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      
      url += '?' + params.toString();
      
      const response = await api.get(url);
      setExpenses(response.data);
    } catch (error) {
      console.error('Load expenses error:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filterMode, filterMonth, filterYear, filterDateFrom, filterDateTo, filterCategory, filterStatus]);

  useEffect(() => {
    if (filterMode === 'dateRange' || filterMonth !== null) {
      loadExpenses();
    }
  }, [loadExpenses, filterMonth, filterMode]);

  // Load corporate employees and templates
  const loadCorporateData = async () => {
    try {
      const [empRes, tmplRes] = await Promise.all([
        api.get('/api/corporate-employees'),
        api.get('/api/recurring-expense-templates')
      ]);
      setCorporateEmployees(empRes.data || []);
      setRecurringTemplates(tmplRes.data || []);
    } catch (error) {
      console.error('Failed to load corporate data:', error);
    }
  };

  useEffect(() => {
    loadCorporateData();
  }, []);

  // Load fixed employees for the Manage Employees tab
  const loadFixedEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    try {
      const response = await api.get('/api/fixed-employees');
      setEmployees(response.data || []);
    } catch (error) {
      console.error('Failed to load employees:', error);
      toast.error('Failed to load employees');
    } finally {
      setEmployeesLoading(false);
    }
  }, []);

  // Load employees when switching to employees tab
  useEffect(() => {
    if (activeMainTab === 'employees') {
      loadFixedEmployees();
      loadDepartments();
    }
  }, [activeMainTab, loadFixedEmployees]);

  // Load departments from backend
  const loadDepartments = async () => {
    try {
      const response = await api.get('/api/departments');
      if (response.data && response.data.length > 0) {
        setDepartments(response.data.map(d => d.name));
      }
    } catch (error) {
      console.log('Using default departments');
    }
  };

  // Add new department
  const handleAddDepartment = async () => {
    if (!newDepartment.trim()) {
      toast.error('Please enter a department name');
      return;
    }
    
    if (departments.includes(newDepartment.trim())) {
      toast.error('Department already exists');
      return;
    }

    try {
      await api.post('/api/departments', { name: newDepartment.trim() });
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment('');
      toast.success('Department added successfully');
    } catch (error) {
      // If API doesn't exist yet, just add locally
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment('');
      toast.success('Department added');
    }
  };

  // Delete department
  const handleDeleteDepartment = async (deptName) => {
    if (!window.confirm(`Delete department "${deptName}"?`)) return;
    
    try {
      await api.delete(`/api/departments/${encodeURIComponent(deptName)}`);
    } catch (error) {
      console.log('Delete from local only');
    }
    
    setDepartments(departments.filter(d => d !== deptName));
    toast.success('Department deleted');
  };

  const resetEmployeeFormData = () => {
    setEmployeeFormData({
      name: '',
      phone: '',
      address: '',
      ctc: '',
      doj: '',
      lwd: '',
      aadhar_number: '',
      pan_number: '',
      emergency_contact: '',
      department: '',
      city: '',
      vertical: 'Central',
      designation: '',
      status: 'active',
      bank_name: '',
      bank_account_number: '',
      ifsc_code: '',
      gender: '',
      state: ''
    });
    setEditingEmployeeData(null);
  };

  const handleAddEmployee = () => {
    resetEmployeeFormData();
    setShowEmployeeModal(true);
  };

  const handleEditEmployee = (employee) => {
    setEmployeeFormData({
      name: employee.name || '',
      phone: employee.phone || '',
      address: employee.address || '',
      ctc: employee.ctc || '',
      doj: employee.doj || '',
      lwd: employee.lwd || '',
      aadhar_number: employee.aadhar_number || '',
      pan_number: employee.pan_number || '',
      emergency_contact: employee.emergency_contact || '',
      department: employee.department || '',
      city: employee.city || '',
      vertical: employee.vertical || 'Central',
      designation: employee.designation || '',
      status: employee.status || 'active',
      bank_name: employee.bank_name || '',
      bank_account_number: employee.bank_account_number || '',
      ifsc_code: employee.ifsc_code || '',
      gender: employee.gender || '',
      state: employee.state || ''
    });
    setEditingEmployeeData(employee);
    setShowEmployeeModal(true);
  };

  const handleViewEmployee = (employee) => {
    setViewingEmployee(employee);
    setShowViewEmployeeModal(true);
  };

  const handleSaveEmployee = async () => {
    // Trim and validate
    const name = (employeeFormData.name || '').trim();
    const phone = (employeeFormData.phone || '').trim();
    const department = (employeeFormData.department || '').trim();
    const doj = (employeeFormData.doj || '').trim();
    
    console.log('Form data:', employeeFormData);
    console.log('Validating:', { name, phone, department, doj });
    console.log('Name empty?', !name, 'Phone empty?', !phone, 'Dept empty?', !department, 'DOJ empty?', !doj);
    
    if (!name || !phone || !department || !doj) {
      console.log('Validation failed - missing:', {
        name: !name ? 'MISSING' : 'OK',
        phone: !phone ? 'MISSING' : 'OK', 
        department: !department ? 'MISSING' : 'OK',
        doj: !doj ? 'MISSING' : 'OK'
      });
      toast.error('Please fill in required fields (Name, Phone, Department, DOJ)');
      return;
    }

    try {
      const payload = {
        ...employeeFormData,
        name,
        phone,
        department,
        doj,
        lwd: employeeFormData.lwd || null, // Send null instead of empty string
        ctc: parseFloat(employeeFormData.ctc) || 0
      };

      if (editingEmployeeData) {
        await api.put(`/api/fixed-employees/${editingEmployeeData.id}`, payload);
        toast.success('Employee updated successfully');
      } else {
        await api.post('/api/fixed-employees', payload);
        toast.success('Employee added successfully');
      }

      setShowEmployeeModal(false);
      resetEmployeeFormData();
      loadFixedEmployees();
    } catch (error) {
      console.error('Save employee error:', error);
      toast.error('Failed to save employee');
    }
  };

  const handleDeleteEmployee = async (employee) => {
    if (!window.confirm(`Are you sure you want to delete ${employee.name}?`)) {
      return;
    }

    try {
      await api.delete(`/api/fixed-employees/${employee.id}`);
      toast.success('Employee deleted successfully');
      loadFixedEmployees();
    } catch (error) {
      console.error('Delete employee error:', error);
      toast.error('Failed to delete employee');
    }
  };

  // ============ ATTENDANCE FUNCTIONS ============
  
  const loadAttendance = useCallback(async (dateStr) => {
    setAttendanceLoading(true);
    try {
      const response = await api.get(`/api/attendance/${dateStr}`);
      setAttendanceRecords(response.data.records || []);
      setAttendanceSummary(response.data.summary || {});
    } catch (error) {
      console.error('Failed to load attendance:', error);
      toast.error('Failed to load attendance');
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  // Load attendance when switching to attendance tab or changing date
  useEffect(() => {
    if (activeMainTab === 'attendance') {
      loadAttendance(attendanceDate);
    }
  }, [activeMainTab, attendanceDate, loadAttendance]);

  const updateAttendanceRecord = (employeeId, field, value) => {
    setAttendanceRecords(prev => 
      prev.map(record => 
        record.employee_id === employeeId 
          ? { ...record, [field]: value }
          : record
      )
    );
  };

  const handleMarkAllPresent = async () => {
    try {
      await api.post(`/api/attendance/mark-all?date_str=${attendanceDate}&status=present`);
      toast.success('All employees marked as present');
      loadAttendance(attendanceDate);
    } catch (error) {
      toast.error('Failed to mark all present');
    }
  };

  const handleMarkAllAbsent = async () => {
    try {
      await api.post(`/api/attendance/mark-all?date_str=${attendanceDate}&status=absent`);
      toast.success('All employees marked as absent');
      loadAttendance(attendanceDate);
    } catch (error) {
      toast.error('Failed to mark all absent');
    }
  };

  const handleSaveAttendance = async () => {
    try {
      const payload = {
        date: attendanceDate,
        records: attendanceRecords.map(r => ({
          employee_id: r.employee_id,
          date: attendanceDate,
          status: r.status || 'absent',
          working_hours: parseFloat(r.working_hours) || 0,
          retail_hours: parseFloat(r.retail_hours) || 0,
          qc_hours: parseFloat(r.qc_hours) || 0,
          ot_total: parseFloat(r.ot_total) || 0,
          retail_ot: parseFloat(r.retail_ot) || 0,
          qc_ot: parseFloat(r.qc_ot) || 0,
          paid_leave: r.paid_leave || false
        }))
      };
      
      await api.post('/api/attendance/save', payload);
      toast.success('Attendance saved successfully');
      loadAttendance(attendanceDate);
    } catch (error) {
      console.error('Save attendance error:', error);
      toast.error('Failed to save attendance');
    }
  };

  const handleCopyAttendance = async () => {
    if (copyTargetDates.length === 0) {
      toast.error('Please select at least one target date');
      return;
    }

    try {
      await api.post('/api/attendance/copy', {
        source_date: attendanceDate,
        target_dates: copyTargetDates
      });
      toast.success(`Attendance copied to ${copyTargetDates.length} dates`);
      setShowCopyDatesModal(false);
      setCopyTargetDates([]);
    } catch (error) {
      toast.error('Failed to copy attendance');
    }
  };

  const toggleStatus = (employeeId, currentStatus) => {
    const newStatus = currentStatus === 'present' ? 'absent' : 'present';
    
    setAttendanceRecords(prev => 
      prev.map(record => {
        if (record.employee_id !== employeeId) return record;
        
        if (newStatus === 'present') {
          // Default 9 hours, allocated based on vertical
          const vertical = record.vertical || 'Central';
          let retailHrs = 0, qcHrs = 0;
          
          if (vertical === 'Retail') {
            retailHrs = 9;
            qcHrs = 0;
          } else if (vertical === 'QC') {
            retailHrs = 0;
            qcHrs = 9;
          } else {
            // Central - split equally
            retailHrs = 4.5;
            qcHrs = 4.5;
          }
          
          return { 
            ...record, 
            status: newStatus, 
            working_hours: 9,
            retail_hours: retailHrs,
            qc_hours: qcHrs
          };
        } else {
          // Absent - zero all hours
          return { 
            ...record, 
            status: newStatus, 
            working_hours: 0,
            retail_hours: 0,
            qc_hours: 0,
            ot_total: 0,
            retail_ot: 0,
            qc_ot: 0
          };
        }
      })
    );
  };

  // Calculate attendance summary in real-time
  const calculatedSummary = useMemo(() => {
    return {
      present: attendanceRecords.filter(r => r.status === 'present').length,
      total: attendanceRecords.length,
      working_hours: attendanceRecords.reduce((sum, r) => sum + (parseFloat(r.working_hours) || 0), 0),
      retail_hours: attendanceRecords.reduce((sum, r) => sum + (parseFloat(r.retail_hours) || 0), 0),
      qc_hours: attendanceRecords.reduce((sum, r) => sum + (parseFloat(r.qc_hours) || 0), 0),
      ot_total: attendanceRecords.reduce((sum, r) => sum + (parseFloat(r.ot_total) || 0), 0)
    };
  }, [attendanceRecords]);

  // ============ PAYROLL FUNCTIONS ============
  
  const loadPayrollData = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const response = await api.get(`/api/payroll/calculate?date_from=${payrollDateFrom}&date_to=${payrollDateTo}`);
      setPayrollData(response.data);
    } catch (error) {
      console.error('Failed to load payroll:', error);
      toast.error('Failed to load payroll data');
    } finally {
      setPayrollLoading(false);
    }
  }, [payrollDateFrom, payrollDateTo]);

  // Load payroll when switching to payroll tab
  useEffect(() => {
    if (activeMainTab === 'payroll') {
      loadPayrollData();
    }
  }, [activeMainTab, loadPayrollData]);

  const openPaymentModal = (employee) => {
    setSelectedEmployeeForPayment(employee);
    setPaymentAmount(employee.net_payable > 0 ? employee.net_payable.toString() : '');
    setPaymentMode('bank_transfer');
    setPaymentReference('');
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      await api.post('/api/employee-payments', {
        employee_id: selectedEmployeeForPayment.employee_id,
        amount: parseFloat(paymentAmount),
        payment_date: new Date().toISOString().split('T')[0],
        payment_type: 'salary',
        payment_mode: paymentMode,
        reference: paymentReference,
        period_from: payrollDateFrom,
        period_to: payrollDateTo
      });
      
      toast.success('Payment recorded successfully');
      setShowPaymentModal(false);
      loadPayrollData();
    } catch (error) {
      toast.error('Failed to record payment');
    }
  };

  const loadPaymentHistory = async (employee) => {
    try {
      const response = await api.get(`/api/employee-payments/${employee.employee_id}`);
      setPaymentHistory(response.data || []);
      setSelectedEmployeeForPayment(employee);
      setShowPaymentHistoryModal(true);
    } catch (error) {
      toast.error('Failed to load payment history');
    }
  };

  const openPayrollDetail = (employee) => {
    setSelectedEmployeeDetail(employee);
    setShowPayrollDetailModal(true);
  };

  // Generate and download payslip
  const generatePayslip = (employee) => {
    setSelectedPayslipEmployee(employee);
    setShowPayslipModal(true);
  };

  const downloadPayslipAsPDF = () => {
    const printWindow = window.open('', '_blank');
    const emp = selectedPayslipEmployee;
    
    // Get month name from date range
    const monthName = new Date(payrollDateFrom).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    
    // Number to words function
    const numberToWords = (num) => {
      const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
                    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      
      if (num === 0) return 'Zero';
      if (num < 20) return ones[num];
      if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
      if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
      if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
      if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
      return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
    };
    
    const amountInWords = numberToWords(Math.round(emp.net_payable || 0)) + ' Rupees Only';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payslip - \${emp.employee_name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .payslip { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: #CFFF04; padding: 20px; display: flex; justify-content: space-between; align-items: center; }
          .logo { font-size: 24px; font-weight: bold; color: #333; }
          .logo-sub { font-size: 10px; color: #666; }
          .company-info { text-align: right; font-size: 11px; color: #555; }
          .title { background: #333; color: white; text-align: center; padding: 10px; font-size: 14px; }
          .section { padding: 20px; }
          .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .summary-box { background: #f8f8f8; padding: 15px; border-radius: 6px; }
          .summary-box.highlight { background: #CFFF04; }
          .label { font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
          .value { font-size: 16px; font-weight: bold; color: #333; }
          .value.large { font-size: 24px; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .details-box { border: 1px solid #e0e0e0; border-radius: 6px; padding: 15px; }
          .details-box h3 { font-size: 12px; color: #666; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px; margin-bottom: 10px; }
          .detail-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
          .detail-label { color: #888; }
          .detail-value { font-weight: 500; }
          .earnings-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .earnings-table th { background: #f0f0f0; padding: 10px; text-align: left; font-size: 12px; }
          .earnings-table td { padding: 10px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
          .earnings-table .amount { text-align: right; font-weight: 500; }
          .total-row { background: #CFFF04; font-weight: bold; }
          .net-pay { background: #333; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; }
          .net-pay .label { color: #ccc; }
          .net-pay .amount { font-size: 24px; font-weight: bold; }
          .footer { text-align: center; padding: 15px; color: #888; font-size: 10px; border-top: 1px solid #e0e0e0; }
          @media print { body { background: white; padding: 0; } .payslip { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="payslip">
          <div class="header">
            <div>
              <div class="logo">VEZLO</div>
              <div class="logo-sub">FRESH PACKS. DAILY.</div>
            </div>
            <div class="company-info">
              Pune, Maharashtra<br>
              contact@vezlo.in
            </div>
          </div>
          
          <div class="title">PAYSLIP FOR THE MONTH OF \${monthName.toUpperCase()}</div>
          
          <div class="section">
            <div class="summary-grid">
              <div class="summary-box">
                <div class="label">Employee Name</div>
                <div class="value">\${emp.employee_name}</div>
              </div>
              <div class="summary-box">
                <div class="label">Employee ID</div>
                <div class="value">\${emp.employee_id || 'N/A'}</div>
              </div>
              <div class="summary-box highlight">
                <div class="label">Net Pay</div>
                <div class="value large">₹\${(emp.net_payable || 0).toLocaleString('en-IN')}</div>
              </div>
            </div>
            
            <div class="summary-grid">
              <div class="summary-box">
                <div class="label">Pay Period</div>
                <div class="value">\${payrollDateFrom} to \${payrollDateTo}</div>
              </div>
              <div class="summary-box">
                <div class="label">Paid Days</div>
                <div class="value">\${emp.payable_days}</div>
              </div>
              <div class="summary-box">
                <div class="label">LOP Days</div>
                <div class="value">\${emp.days_absent || 0}</div>
              </div>
            </div>
            
            <div class="details-grid">
              <div class="details-box">
                <h3>EMPLOYEE DETAILS</h3>
                <div class="detail-row"><span class="detail-label">Designation</span><span class="detail-value">\${emp.designation || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Department</span><span class="detail-value">\${emp.department || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Vertical</span><span class="detail-value">\${emp.vertical || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Date of Joining</span><span class="detail-value">\${emp.doj || 'N/A'}</span></div>
              </div>
              <div class="details-box">
                <h3>BANK DETAILS</h3>
                <div class="detail-row"><span class="detail-label">Bank</span><span class="detail-value">\${emp.bank_name || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">Account No</span><span class="detail-value">\${emp.bank_account || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">IFSC</span><span class="detail-value">\${emp.ifsc || 'N/A'}</span></div>
                <div class="detail-row"><span class="detail-label">City</span><span class="detail-value">\${emp.city || 'N/A'}</span></div>
              </div>
            </div>
            
            <table class="earnings-table">
              <tr>
                <th style="width: 50%">EARNINGS</th>
                <th style="width: 25%">AMOUNT</th>
                <th style="width: 25%">DEDUCTIONS</th>
              </tr>
              <tr>
                <td>Basic Salary (\${emp.payable_days} days @ ₹\${(emp.daily_rate || 0).toLocaleString('en-IN')}/day)</td>
                <td class="amount">₹\${(emp.regular_salary || 0).toLocaleString('en-IN')}</td>
                <td class="amount">-</td>
              </tr>
              <tr>
                <td>Overtime (\${emp.ot_hours || 0} hrs)</td>
                <td class="amount">₹\${(emp.ot_amount || 0).toLocaleString('en-IN')}</td>
                <td class="amount">-</td>
              </tr>
              <tr class="total-row">
                <td>Gross Earnings</td>
                <td class="amount">₹\${(emp.total_amount || 0).toLocaleString('en-IN')}</td>
                <td class="amount">₹0</td>
              </tr>
            </table>
          </div>
          
          <div class="net-pay">
            <div>
              <div class="label">TOTAL NET PAYABLE</div>
              <div style="font-size: 11px; color: #aaa; margin-top: 4px">\${amountInWords}</div>
            </div>
            <div class="amount">₹\${(emp.net_payable || 0).toLocaleString('en-IN')}</div>
          </div>
          
          <div class="footer">
            This is a system-generated document. For any queries, please contact HR.
          </div>
        </div>
        
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    setShowPayslipModal(false);
  };

  // ==================== VENDOR MANAGEMENT ====================
  
  const resetVendorForm = () => {
    setVendorForm({ name: '', contact: '', phone: '', notes: '' });
    setEditingVendor(null);
  };

  const handleSaveVendor = async () => {
    if (!vendorForm.name?.trim()) {
      toast.error('Vendor name is required');
      return;
    }
    
    try {
      if (editingVendor) {
        await api.put(`/api/vendors/${editingVendor.id}`, vendorForm);
        toast.success('Vendor updated successfully');
      } else {
        await api.post('/api/vendors', vendorForm);
        toast.success('Vendor added successfully');
      }
      resetVendorForm();
      setShowVendorDialog(false);
      loadVendors();
    } catch (error) {
      console.error('Save vendor error:', error);
      toast.error(error.response?.data?.detail || 'Failed to save vendor');
    }
  };

  const handleDeleteVendor = async (vendorId) => {
    if (!window.confirm('Are you sure you want to delete this vendor?')) return;
    
    try {
      await api.delete(`/api/vendors/${vendorId}`);
      toast.success('Vendor deleted successfully');
      loadVendors();
    } catch (error) {
      console.error('Delete vendor error:', error);
      toast.error('Failed to delete vendor');
    }
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      month: filterMonth !== null ? filterMonth + 1 : new Date().getMonth() + 1,
      year: filterYear,
      category: '',
      description: '',
      amount: '',
      due_date: '1',
      status: 'Pending',
      payment_date: '',
      payment_mode: 'Cash',
      payment_reference: '',
      is_recurring: true,
      paid_by_type: 'company',
      paid_by: 'Company',
      paid_by_employee_id: '',
      is_settled: true,
      settlement_date: '',
      settlement_remarks: '',
      vendor: '',
      invoice_number: ''
    });
    setEditingExpense(null);
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      category: '',
      description: '',
      amount: '',
      due_date: '1',
      vendor: '',
      invoice_number: '',
      linked_employee_id: '',
      linked_employee_name: '',
      expense_type: 'general',
      notes: ''
    });
    setEditingTemplate(null);
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      name: '',
      role: '',
      department: '',
      notes: ''
    });
    setEditingEmployee(null);
  };

  // Handle View Details
  const handleViewDetails = (expense) => {
    setViewingExpense(expense);
    setShowViewDetailsModal(true);
  };

  // Template CRUD
  const handleSaveTemplate = async () => {
    if (!templateForm.category || !templateForm.amount) {
      toast.error('Category and Amount are required');
      return;
    }
    
    try {
      const payload = {
        ...templateForm,
        amount: parseFloat(templateForm.amount),
        due_date: parseInt(templateForm.due_date) || 1
      };
      
      if (editingTemplate) {
        await api.put(`/api/recurring-expense-templates/${editingTemplate.id}`, payload);
        toast.success('Template updated');
      } else {
        await api.post('/api/recurring-expense-templates', payload);
        toast.success('Template created');
      }
      
      setShowTemplateDialog(false);
      resetTemplateForm();
      loadCorporateData();
    } catch (error) {
      console.error('Save template error:', error);
      toast.error('Failed to save template');
    }
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      category: template.category || '',
      description: template.description || '',
      amount: template.amount?.toString() || '',
      due_date: template.due_date?.toString() || '1',
      vendor: template.vendor || '',
      invoice_number: template.invoice_number || '',
      linked_employee_id: template.linked_employee_id || '',
      linked_employee_name: template.linked_employee_name || '',
      expense_type: template.expense_type || 'general',
      notes: template.notes || ''
    });
    setShowTemplateDialog(true);
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      await api.delete(`/api/recurring-expense-templates/${id}`);
      toast.success('Template deleted');
      loadCorporateData();
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  // Corporate Employee CRUD
  const handleSaveCorporateEmployee = async () => {
    if (!employeeForm.name) {
      toast.error('Employee name is required');
      return;
    }
    
    try {
      if (editingEmployee) {
        await api.put(`/api/corporate-employees/${editingEmployee.id}`, employeeForm);
        toast.success('Employee updated');
      } else {
        await api.post('/api/corporate-employees', employeeForm);
        toast.success('Employee created');
      }
      
      setShowEmployeeDialog(false);
      resetEmployeeForm();
      loadCorporateData();
    } catch (error) {
      console.error('Save employee error:', error);
      toast.error('Failed to save employee');
    }
  };

  const handleEditCorporateEmployee = (employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name || '',
      role: employee.role || '',
      department: employee.department || '',
      notes: employee.notes || ''
    });
    setShowEmployeeDialog(true);
  };

  const handleDeleteCorporateEmployee = async (id) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await api.delete(`/api/corporate-employees/${id}`);
      toast.success('Employee deleted');
      loadCorporateData();
    } catch (error) {
      toast.error('Failed to delete employee');
    }
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.amount) {
      toast.error('Category and Amount are required');
      return;
    }
    
    // If status is Paid and no payment date, show payment details modal
    // IMPORTANT: Close the Add Dialog FIRST to avoid focus-trap issues
    if (formData.status === 'Paid' && !formData.payment_date) {
      setPaymentDetailsForm({
        payment_mode: formData.payment_mode || 'Cash',
        payment_date: new Date().toISOString().split('T')[0],
        payment_reference: formData.payment_reference || '',
        paid_by_type: formData.paid_by_type || 'company',
        paid_by_employee_id: formData.paid_by_employee_id || ''
      });
      setShowAddDialog(false); // Close Add Dialog to release focus trap
      setShowPaymentDetailsModal(true);
      return;
    }
    
    try {
      // Determine paid_by value
      let paidByValue = 'Company';
      if (formData.paid_by_type === 'employee' && formData.paid_by_employee_id) {
        const emp = staffUsers.find(u => u.id === formData.paid_by_employee_id);
        paidByValue = emp?.name || emp?.email || formData.paid_by_employee_id;
      }
      
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        due_date: parseInt(formData.due_date),
        is_settled: formData.status === 'Paid',
        paid_by_type: formData.paid_by_type,
        paid_by: paidByValue,
        paid_by_employee_id: formData.paid_by_employee_id
      };
      
      if (editingExpense) {
        await api.put(`/api/expenses/fixed/${editingExpense.id}`, payload);
        toast.success('Expense updated successfully');
      } else {
        await api.post('/api/expenses/fixed', payload);
        toast.success('Expense added successfully');
      }
      
      setShowAddDialog(false);
      resetForm();
      loadExpenses();
    } catch (error) {
      console.error('Save expense error:', error);
      toast.error('Failed to save expense');
    }
  };
  
  // Handle payment details submission
  const handlePaymentDetailsSubmit = async () => {
    let paidByValue = 'Company';
    if (paymentDetailsForm.paid_by_type === 'employee' && paymentDetailsForm.paid_by_employee_id) {
      const emp = staffUsers.find(u => u.id === paymentDetailsForm.paid_by_employee_id);
      paidByValue = emp?.name || emp?.email || paymentDetailsForm.paid_by_employee_id;
    }
    
    const updatedFormData = {
      ...formData,
      payment_mode: paymentDetailsForm.payment_mode,
      payment_date: paymentDetailsForm.payment_date,
      payment_reference: paymentDetailsForm.payment_reference,
      paid_by_type: paymentDetailsForm.paid_by_type,
      paid_by_employee_id: paymentDetailsForm.paid_by_employee_id,
      paid_by: paidByValue
    };
    
    try {
      const payload = {
        ...updatedFormData,
        amount: parseFloat(updatedFormData.amount),
        due_date: parseInt(updatedFormData.due_date),
        is_settled: true
      };
      
      if (editingExpense) {
        await api.put(`/api/expenses/fixed/${editingExpense.id}`, payload);
        toast.success('Expense updated successfully');
      } else {
        await api.post('/api/expenses/fixed', payload);
        toast.success('Expense added successfully');
      }
      
      setShowPaymentDetailsModal(false);
      setShowAddDialog(false);
      resetForm();
      loadExpenses();
    } catch (error) {
      console.error('Save expense error:', error);
      toast.error('Failed to save expense');
    }
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    const isPaidByEmployee = expense.paid_by && expense.paid_by !== 'Company';
    
    // Construct date from expense.date or from month/year for backward compatibility
    let dateValue = expense.date?.split('T')[0];
    if (!dateValue && expense.month && expense.year) {
      dateValue = `${expense.year}-${String(expense.month).padStart(2, '0')}-01`;
    }
    if (!dateValue) {
      dateValue = new Date().toISOString().split('T')[0];
    }
    
    setFormData({
      date: dateValue,
      month: expense.month ?? new Date().getMonth() + 1,
      year: expense.year ?? new Date().getFullYear(),
      category: expense.category || '',
      description: expense.description || '',
      amount: expense.amount?.toString() || '',
      due_date: expense.due_date?.toString() || '1',
      status: expense.status || 'Pending',
      payment_date: expense.payment_date?.split('T')[0] || '',
      payment_mode: expense.payment_mode || 'Cash',
      payment_reference: expense.payment_reference || '',
      is_recurring: expense.is_recurring ?? true,
      paid_by_type: expense.paid_by_type || (isPaidByEmployee ? 'employee' : 'company'),
      paid_by: expense.paid_by || 'Company',
      paid_by_employee_id: expense.paid_by_employee_id || '',
      is_settled: expense.is_settled ?? true,
      settlement_date: expense.settlement_date?.split('T')[0] || '',
      settlement_remarks: expense.settlement_remarks || '',
      vendor: expense.vendor || '',
      invoice_number: expense.invoice_number || ''
    });
    setShowAddDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    
    try {
      await api.delete(`/api/expenses/fixed/${id}`);
      toast.success('Expense deleted');
      loadExpenses();
    } catch (error) {
      console.error('Delete expense error:', error);
      toast.error('Failed to delete expense');
    }
  };

  const handleMarkPaid = async (expense) => {
    try {
      await api.put(`/api/expenses/fixed/${expense.id}`, {
        ...expense,
        status: 'Paid',
        payment_date: new Date().toISOString().split('T')[0]
      });
      toast.success('Marked as paid');
      loadExpenses();
    } catch (error) {
      console.error('Mark paid error:', error);
      toast.error('Failed to update');
    }
  };

  const handleGenerateRecurring = async () => {
    try {
      const response = await api.post('/api/expenses/fixed/generate-recurring', {
        month: filterMonth,
        year: filterYear
      });
      toast.success(`Generated ${response.data.count || 0} recurring entries`);
      loadExpenses();
    } catch (error) {
      console.error('Generate recurring error:', error);
      toast.error('Failed to generate recurring entries');
    }
  };

  const handleBulkSettle = async () => {
    if (selectedExpenses.length === 0) {
      toast.error('Select expenses to settle');
      return;
    }
    
    try {
      await api.post('/api/expenses/fixed/bulk-settle', {
        expense_ids: selectedExpenses,
        settlement_date: new Date().toISOString().split('T')[0],
        settlement_remarks: settlementRemarks
      });
      toast.success(`${selectedExpenses.length} expenses settled`);
      setShowSettlementDialog(false);
      setSelectedExpenses([]);
      setSettlementRemarks('');
      loadExpenses();
    } catch (error) {
      console.error('Bulk settle error:', error);
      toast.error('Failed to settle expenses');
    }
  };

  const toggleExpenseSelection = (id) => {
    setSelectedExpenses(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  // Filter expenses by vendor if selected
  const filteredExpenses = useMemo(() => {
    if (filterVendor === 'all') return expenses;
    return expenses.filter(e => e.vendor === filterVendor);
  }, [expenses, filterVendor]);

  const unsettledExpenses = filteredExpenses.filter(e => !e.is_settled && e.paid_by !== 'Company');
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const paidAmount = filteredExpenses.filter(e => e.status === 'Paid').reduce((sum, e) => sum + (e.amount || 0), 0);
  const pendingAmount = filteredExpenses.filter(e => e.status !== 'Paid').reduce((sum, e) => sum + (e.amount || 0), 0);
  const overdueCount = filteredExpenses.filter(e => {
    if (e.status === 'Paid') return false;
    const today = new Date();
    const dueDay = e.due_date || 1;
    const currentDay = today.getDate();
    return e.month === today.getMonth() && e.year === today.getFullYear() && currentDay > dueDay;
  }).length;

  const getStatusBadge = (expense) => {
    if (expense.status === 'Paid') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"><CheckCircle size={10} /> Paid</span>;
    }
    
    const today = new Date();
    const dueDay = expense.due_date || 1;
    const isOverdue = expense.month === today.getMonth() && expense.year === today.getFullYear() && today.getDate() > dueDay;
    
    if (isOverdue) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs"><AlertTriangle size={10} /> Overdue</span>;
    }
    
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs"><Clock size={10} /> Pending</span>;
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <Layout>
      <div data-testid="fixed-expenses-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fixed Expenses & Payroll</h1>
            <p className="text-sm text-gray-500">Manage employees, attendance, expenses and payroll</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => activeMainTab === 'expenses' ? loadExpenses() : loadFixedEmployees()}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveMainTab('attendance')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeMainTab === 'attendance' 
                ? 'bg-white shadow text-[#14532D] font-medium' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calendar size={14} className="inline mr-1" /> Attendance
          </button>
          <button
            onClick={() => setActiveMainTab('employees')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeMainTab === 'employees' 
                ? 'bg-white shadow text-[#14532D] font-medium' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users size={14} className="inline mr-1" /> Manage Employees
          </button>
          <button
            onClick={() => setActiveMainTab('expenses')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeMainTab === 'expenses' 
                ? 'bg-white shadow text-[#14532D] font-medium' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calculator size={14} className="inline mr-1" /> Expenses
          </button>
          <button
            onClick={() => setActiveMainTab('payroll')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeMainTab === 'payroll' 
                ? 'bg-white shadow text-[#14532D] font-medium' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileText size={14} className="inline mr-1" /> Payroll Processing
          </button>
        </div>

        {/* ATTENDANCE TAB */}
        {activeMainTab === 'attendance' && (
          <div>
            {/* Header with Date Picker and Action Buttons */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Date:</label>
                  <Input
                    type="date"
                    value={attendanceDate}
                    onChange={(e) => setAttendanceDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                {attendanceDate === new Date().toISOString().split('T')[0] && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Today</span>
                )}
                <span className="text-xs text-gray-500">(Editable: current & last month)</span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCopyDatesModal(true)}>
                  <Copy size={14} className="mr-1" /> Copy to Dates
                </Button>
                <Button variant="outline" size="sm" onClick={() => loadAttendance(attendanceDate)}>
                  <RefreshCw size={14} className="mr-1" /> Refresh
                </Button>
                <Button size="sm" onClick={handleSaveAttendance} className="bg-[#14532D] hover:bg-[#166534]">
                  <Save size={14} className="mr-1" /> Save Attendance
                </Button>
              </div>
            </div>

            {/* Mark All Buttons */}
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={handleMarkAllPresent} className="text-green-600 border-green-300 hover:bg-green-50">
                <CheckCircle size={14} className="mr-1" /> Mark All Present
              </Button>
              <Button variant="outline" size="sm" onClick={handleMarkAllAbsent} className="text-red-600 border-red-300 hover:bg-red-50">
                <X size={14} className="mr-1" /> Mark All Absent
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
              <Card className="p-3">
                <p className="text-xs text-gray-500 uppercase">Present</p>
                <p className="text-xl font-bold text-green-600">
                  {calculatedSummary.present}<span className="text-sm text-gray-400">/{calculatedSummary.total}</span>
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-gray-500 uppercase">Working Hrs</p>
                <p className="text-xl font-bold text-blue-600">{calculatedSummary.working_hours.toFixed(1)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-gray-500 uppercase">Retail Hrs</p>
                <p className="text-xl font-bold text-purple-600">{calculatedSummary.retail_hours.toFixed(1)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-gray-500 uppercase">QC Hrs</p>
                <p className="text-xl font-bold text-orange-600">{calculatedSummary.qc_hours.toFixed(1)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-gray-500 uppercase">OT Total</p>
                <p className="text-xl font-bold text-teal-600">{calculatedSummary.ot_total.toFixed(1)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-gray-500 uppercase">OT Split</p>
                <p className="text-xl font-bold text-gray-600">
                  {attendanceRecords.reduce((sum, r) => sum + (parseFloat(r.retail_ot) || 0), 0).toFixed(1)}/
                  {attendanceRecords.reduce((sum, r) => sum + (parseFloat(r.qc_ot) || 0), 0).toFixed(1)}
                </p>
              </Card>
            </div>

            {/* Attendance Table */}
            <Card>
              <CardContent className="p-0">
                {attendanceLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14532D]"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-3 text-left text-xs font-medium text-gray-500 w-12">#</th>
                          <th className="p-3 text-left text-xs font-medium text-gray-500">NAME</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-24">STATUS</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-24">WORKING HRS</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-24">RETAIL HRS</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-24">QC HRS</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-20">OT TOTAL</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-20">RETAIL OT</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-20">QC OT</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500 w-24">PAID LEAVE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceRecords.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-gray-500">
                              No employees found. Add employees in the "Manage Employees" tab first.
                            </td>
                          </tr>
                        ) : (
                          attendanceRecords.map((record, index) => (
                            <tr key={record.employee_id} className="border-b hover:bg-gray-50">
                              <td className="p-3 text-gray-500">{index + 1}</td>
                              <td className="p-3">
                                <div>
                                  <p className="font-medium">{record.employee_name}</p>
                                  {record.department && (
                                    <p className="text-xs text-gray-400">{record.department}</p>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => toggleStatus(record.employee_id, record.status)}
                                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                    record.status === 'present'
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                                  }`}
                                >
                                  {record.status === 'present' ? 'Present' : 'Absent'}
                                </button>
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={record.working_hours || ''}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'working_hours', e.target.value)}
                                  className="w-20 h-8 text-center text-sm"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={record.retail_hours || ''}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'retail_hours', e.target.value)}
                                  className="w-20 h-8 text-center text-sm"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={record.qc_hours || ''}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'qc_hours', e.target.value)}
                                  className="w-20 h-8 text-center text-sm"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={record.ot_total || ''}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'ot_total', e.target.value)}
                                  className="w-16 h-8 text-center text-sm"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={record.retail_ot || ''}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'retail_ot', e.target.value)}
                                  className="w-16 h-8 text-center text-sm"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  max="24"
                                  step="0.5"
                                  value={record.qc_ot || ''}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'qc_ot', e.target.value)}
                                  className="w-16 h-8 text-center text-sm"
                                />
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={record.paid_leave || false}
                                  onChange={(e) => updateAttendanceRecord(record.employee_id, 'paid_leave', e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-[#14532D] focus:ring-[#14532D]"
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* MANAGE EMPLOYEES TAB */}
        {activeMainTab === 'employees' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Employee List</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowDepartmentModal(true)}>
                  <Building2 size={14} className="mr-1" /> Manage Departments
                </Button>
                <Button size="sm" onClick={handleAddEmployee} className="bg-[#14532D] hover:bg-[#166534]">
                  <UserPlus size={14} className="mr-1" /> Add Employee
                </Button>
              </div>
            </div>
            
            <Card>
              <CardContent className="p-0">
                {employeesLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14532D]"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="p-3 text-left text-xs font-medium text-gray-500">S.NO</th>
                          <th className="p-3 text-left text-xs font-medium text-gray-500">EMP ID</th>
                          <th className="p-3 text-left text-xs font-medium text-gray-500">NAME</th>
                          <th className="p-3 text-left text-xs font-medium text-gray-500">PHONE</th>
                          <th className="p-3 text-left text-xs font-medium text-gray-500">DEPARTMENT</th>
                          <th className="p-3 text-right text-xs font-medium text-gray-500">CTC</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500">DOJ</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500">LWD</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500">STATUS</th>
                          <th className="p-3 text-center text-xs font-medium text-gray-500">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-gray-500">
                              No employees found. Click "Add Employee" to get started.
                            </td>
                          </tr>
                        ) : (
                          employees.filter(e => e.status !== 'deleted').map((employee, index) => (
                            <tr key={employee.id} className="border-b hover:bg-gray-50">
                              <td className="p-3 text-gray-600">{index + 1}</td>
                              <td className="p-3 font-medium text-blue-600">{employee.employee_id}</td>
                              <td className="p-3 font-medium">{employee.name}</td>
                              <td className="p-3 text-gray-600">{employee.phone}</td>
                              <td className="p-3 text-gray-600">{employee.department}</td>
                              <td className="p-3 text-right font-medium">₹{(employee.ctc || 0).toLocaleString()}</td>
                              <td className="p-3 text-center text-gray-600">
                                {employee.doj ? new Date(employee.doj).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                              </td>
                              <td className="p-3 text-center text-gray-600">
                                {employee.lwd ? new Date(employee.lwd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  employee.status === 'active' 
                                    ? 'bg-green-100 text-green-700' 
                                    : employee.status === 'inactive'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {employee.status || 'active'}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewEmployee(employee)}
                                    className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                    title="View"
                                  >
                                    <Eye size={14} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditEmployee(employee)}
                                    className="h-7 w-7 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                                    title="Edit"
                                  >
                                    <Edit2 size={14} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEmployee(employee)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* PAYROLL PROCESSING TAB */}
        {activeMainTab === 'payroll' && (
          <div>
            {/* Date Range Filter */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">From:</label>
                  <Input
                    type="date"
                    value={payrollDateFrom}
                    onChange={(e) => setPayrollDateFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">To:</label>
                  <Input
                    type="date"
                    value={payrollDateTo}
                    onChange={(e) => setPayrollDateTo(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={loadPayrollData}>
                  <RefreshCw size={14} className="mr-1" /> Calculate
                </Button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Card className="p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Total Payroll</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹{(payrollData?.summary?.total_payroll || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Employee Count</p>
                <p className="text-2xl font-bold text-blue-600">{payrollData?.summary?.employee_count || 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Paid Leaves</p>
                <p className="text-2xl font-bold text-purple-600">{payrollData?.summary?.total_paid_leaves || 0}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-gray-500 uppercase mb-1">Man Days</p>
                <p className="text-2xl font-bold text-orange-600">{(payrollData?.summary?.total_man_days || 0).toFixed(1)}</p>
              </Card>
            </div>

            {/* Payroll Table */}
            {payrollLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14532D]"></div>
                <span className="ml-2 text-gray-500">Loading payroll data...</span>
              </div>
            ) : payrollData && payrollData.breakdown && payrollData.breakdown.length > 0 ? (
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
                          <th className="p-2 text-center font-medium text-green-600">PRESENT</th>
                          <th className="p-2 text-center font-medium text-red-500">ABSENT</th>
                          <th className="p-2 text-center font-medium text-blue-600">PAID LEAVES</th>
                          <th className="p-2 text-center font-medium text-green-700 bg-green-50">PAYABLE DAYS</th>
                          <th className="p-2 text-center font-medium text-gray-500">OT HRS</th>
                          <th className="p-2 text-right font-medium text-gray-500">AMOUNT</th>
                          <th className="p-2 text-right font-medium text-gray-500">PAID</th>
                          <th className="p-2 text-right font-medium text-gray-500">NET PAYABLE</th>
                          <th className="p-2 text-center font-medium text-gray-500">ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollData.breakdown.map((emp, idx) => {
                          const isFullyPaid = emp.net_payable <= 0;
                          return (
                            <tr key={emp.employee_id} className={`border-b hover:bg-gray-50 ${isFullyPaid ? 'bg-green-50' : ''}`}>
                              <td className="p-2 text-gray-400">{idx + 1}</td>
                              <td className="p-2 font-medium">
                                {emp.employee_name}
                                {isFullyPaid && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">PAID</span>}
                              </td>
                              <td className="p-2 text-gray-600 font-mono text-[10px]">
                                {emp.bank_account || <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-2 text-gray-600 font-mono text-[10px]">
                                {emp.ifsc || <span className="text-gray-400">-</span>}
                              </td>
                              <td className="p-2 text-center text-green-600">{emp.days_present}</td>
                              <td className="p-2 text-center text-red-500">{emp.days_absent}</td>
                              <td className="p-2 text-center text-blue-600">{emp.paid_leave_days}</td>
                              <td className="p-2 text-center font-semibold text-green-700 bg-green-50">{emp.payable_days}</td>
                              <td className="p-2 text-center text-orange-600">{(emp.ot_hours || 0).toFixed(1)}</td>
                              <td className="p-2 text-right font-medium text-gray-700">
                                ₹{(emp.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </td>
                              <td className="p-2 text-right">
                                {emp.total_paid > 0 ? (
                                  <button 
                                    onClick={() => loadPaymentHistory(emp)}
                                    className="text-blue-600 hover:underline font-medium"
                                  >
                                    ₹{emp.total_paid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                  </button>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className={`p-2 text-right font-semibold ${emp.net_payable <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                                {emp.net_payable <= 0 ? '₹0' : `₹${emp.net_payable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                              </td>
                              <td className="p-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => openPayrollDetail(emp)}
                                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-[10px] px-2 py-1 h-7"
                                  >
                                    Details
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => generatePayslip(emp)}
                                    className="text-purple-600 hover:text-purple-800 hover:bg-purple-50 text-[10px] px-2 py-1 h-7"
                                    title="Download Payslip"
                                  >
                                    <Download size={12} />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => openPaymentModal(emp)}
                                    className="text-green-600 hover:text-green-800 hover:bg-green-50 text-[10px] px-2 py-1 h-7"
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
                          <td className="p-2 text-center text-green-600">
                            {payrollData.breakdown.reduce((sum, e) => sum + e.days_present, 0)}
                          </td>
                          <td className="p-2 text-center text-red-500">
                            {payrollData.breakdown.reduce((sum, e) => sum + e.days_absent, 0)}
                          </td>
                          <td className="p-2 text-center text-blue-600">
                            {payrollData.summary.total_paid_leaves}
                          </td>
                          <td className="p-2 text-center font-bold text-green-700 bg-green-50">
                            {payrollData.summary.total_man_days.toFixed(1)}
                          </td>
                          <td className="p-2 text-center text-orange-600">
                            {payrollData.summary.total_ot_hours.toFixed(1)}
                          </td>
                          <td className="p-2 text-right text-gray-700">
                            ₹{payrollData.summary.total_payroll.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="p-2 text-right text-blue-700">
                            ₹{payrollData.summary.total_paid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="p-2 text-right text-orange-700">
                            ₹{payrollData.summary.net_payable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No payroll data found. Make sure employees have attendance records for the selected period.
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* EXPENSES TAB - Original Content */}
        {activeMainTab === 'expenses' && (
          <>
        {/* Header with action buttons */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">Track fixed and recurring expenses</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowVendorManagement(true)}
              className="text-gray-600"
            >
              <Building2 size={14} className="mr-1" /> Manage Vendors
            </Button>
            <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} className="bg-[#14532D] hover:bg-[#166534]">
              <Plus size={14} className="mr-1" /> Record Expense
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calculator className="text-blue-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Fixed</p>
                <p className="text-lg font-bold">₹{totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="text-green-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Paid</p>
                <p className="text-lg font-bold text-green-600">₹{paidAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="text-yellow-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-lg font-bold text-yellow-600">₹{pendingAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="text-red-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Overdue</p>
                <p className="text-lg font-bold text-red-600">{overdueCount}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Filter Mode Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setFilterMode('month')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    filterMode === 'month' ? 'bg-white shadow text-[#14532D] font-medium' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  By Month
                </button>
                <button
                  onClick={() => setFilterMode('dateRange')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    filterMode === 'dateRange' ? 'bg-white shadow text-[#14532D] font-medium' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Date Range
                </button>
              </div>

              {filterMode === 'month' ? (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Month</label>
                    <Select value={filterMonth !== null ? filterMonth.toString() : ''} onValueChange={(v) => setFilterMonth(parseInt(v))}>
                      <SelectTrigger className="w-32 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month, idx) => (
                          <SelectItem key={idx} value={idx.toString()}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Year</label>
                    <Select value={filterYear.toString()} onValueChange={(v) => setFilterYear(parseInt(v))}>
                      <SelectTrigger className="w-24 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map(year => (
                          <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">From Date</label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="w-36 h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">To Date</label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="w-36 h-8 text-sm"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={loadExpenses} className="h-8">
                    <RefreshCw size={14} className="mr-1" /> Apply
                  </Button>
                </>
              )}

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-32 h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {FIXED_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-28 h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Vendor</label>
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue placeholder="All Vendors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {vendors.map(vendor => (
                      <SelectItem key={vendor.id} value={vendor.name}>{vendor.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#14532D]"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-2 text-left w-8">
                        <Checkbox 
                          checked={selectedExpenses.length === unsettledExpenses.length && unsettledExpenses.length > 0}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedExpenses(unsettledExpenses.map(e => e.id));
                            } else {
                              setSelectedExpenses([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">CATEGORY</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">DESCRIPTION</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">AMOUNT</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">DUE DATE</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">PAID BY</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">STATUS</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">RECURRING</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-gray-500">
                          No fixed expenses found. Click "Record Expense" to add one.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((expense) => (
                        <tr key={expense.id} className={`border-b hover:bg-gray-50 ${expense.status !== 'Paid' ? 'bg-yellow-50' : ''}`}>
                          <td className="p-2">
                            {!expense.is_settled && expense.paid_by !== 'Company' && (
                              <Checkbox 
                                checked={selectedExpenses.includes(expense.id)}
                                onCheckedChange={() => toggleExpenseSelection(expense.id)}
                              />
                            )}
                          </td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{expense.category}</span>
                          </td>
                          <td className="p-2 text-xs max-w-[150px] truncate">{expense.description || '-'}</td>
                          <td className="p-2 text-right font-medium">₹{expense.amount?.toLocaleString()}</td>
                          <td className="p-2 text-center text-xs">{expense.due_date || 1}</td>
                          <td className="p-2 text-xs">
                            {expense.paid_by === 'Company' ? (
                              <span className="text-green-600">Company</span>
                            ) : (
                              <span className="text-blue-600">{expense.paid_by}</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {getStatusBadge(expense)}
                          </td>
                          <td className="p-2 text-center">
                            {expense.is_recurring ? (
                              <span className="text-green-600 text-xs">Yes</span>
                            ) : (
                              <span className="text-gray-400 text-xs">No</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 w-6 p-0" 
                                onClick={() => handleViewDetails(expense)}
                                title="View Details"
                              >
                                <Eye size={12} className="text-gray-600" />
                              </Button>
                              {expense.status !== 'Paid' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-6 w-6 p-0" 
                                  onClick={() => handleMarkPaid(expense)}
                                  title="Mark as Paid"
                                >
                                  <CheckCircle size={12} className="text-green-600" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleEdit(expense)}>
                                <Edit2 size={12} className="text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDelete(expense.id)}>
                                <Trash2 size={12} className="text-red-600" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingExpense ? 'Edit Fixed Expense' : 'Add Fixed Expense'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Date *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => {
                    const dateVal = e.target.value;
                    const d = new Date(dateVal);
                    setFormData(prev => ({ 
                      ...prev, 
                      date: dateVal,
                      month: d.getMonth() + 1,  // 1-12 for backward compatibility
                      year: d.getFullYear()
                    }));
                  }}
                  className="h-8 text-sm"
                />
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Category *</label>
                <Select value={formData.category} onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {FIXED_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                <Input
                  placeholder="e.g., Warehouse Rent, Driver Salary"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Amount (₹) *</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Due Date (Day)</label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="1"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Status</label>
                  <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.status === 'Paid' && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Payment Date</label>
                    <Input
                      type="date"
                      value={formData.payment_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <Checkbox 
                  checked={formData.is_recurring}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_recurring: checked }))}
                />
                <label className="text-xs font-medium text-gray-700">Recurring Monthly (auto-create next month)</label>
              </div>

              {/* Vendor & Invoice Section */}
              <div className="border-t pt-3 mt-3">
                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Vendor Details (Optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Vendor</label>
                    <Input
                      placeholder="Vendor name"
                      value={formData.vendor}
                      onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Invoice Number</label>
                    <Input
                      placeholder="INV-..."
                      value={formData.invoice_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
              
              {/* Paid By Section */}
              <div className="border-t pt-3 mt-3">
                <label className="text-xs font-medium text-gray-700 mb-2 block">Paid By *</label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      name="paid_by_type"
                      value="company"
                      checked={formData.paid_by_type === 'company'}
                      onChange={() => setFormData(prev => ({ 
                        ...prev, 
                        paid_by_type: 'company',
                        paid_by: 'Company',
                        paid_by_employee_id: ''
                      }))}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm">Company</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      name="paid_by_type"
                      value="employee"
                      checked={formData.paid_by_type === 'employee'}
                      onChange={() => setFormData(prev => ({ 
                        ...prev, 
                        paid_by_type: 'employee',
                        paid_by: '',
                        paid_by_employee_id: ''
                      }))}
                      className="w-4 h-4 text-green-600"
                    />
                    <span className="text-sm">Employee (Reimbursement)</span>
                  </label>
                </div>
                
                {formData.paid_by_type === 'employee' && (
                  <div className="space-y-3 pl-4 border-l-2 border-blue-200">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Employee Name *</label>
                      <Select 
                        value={formData.paid_by_employee_id} 
                        onValueChange={(value) => {
                          const emp = staffUsers.find(u => u.id === value);
                          setFormData(prev => ({ 
                            ...prev, 
                            paid_by_employee_id: value,
                            paid_by: emp?.name || emp?.email || value
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select employee who paid" />
                        </SelectTrigger>
                        <SelectContent>
                          {staffUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.name} ({user.role})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setShowAddDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} className="bg-[#14532D] hover:bg-[#166534]">
                {editingExpense ? 'Update' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Settlement Dialog */}
        <Dialog open={showSettlementDialog} onOpenChange={setShowSettlementDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Settle Employee Expenses</DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-3">
                Select expenses to settle from the table, then click "Settle Selected" below.
              </p>
              
              <div className="bg-gray-50 p-3 rounded mb-3">
                <p className="text-xs text-gray-500">Selected Expenses</p>
                <p className="text-xl font-bold">{selectedExpenses.length} items</p>
                <p className="text-sm text-gray-600">
                  Total: ₹{filteredExpenses.filter(e => selectedExpenses.includes(e.id)).reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}
                </p>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Settlement Remarks</label>
                <Input
                  placeholder="e.g., Paid via bank transfer on..."
                  value={settlementRemarks}
                  onChange={(e) => setSettlementRemarks(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowSettlementDialog(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleBulkSettle} 
                disabled={selectedExpenses.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle size={14} className="mr-1" /> Settle Selected
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment Details Modal */}
        {showPaymentDetailsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="payment-details-modal">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-4 border-b bg-green-50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-600" />
                  Record Payment Details
                </h3>
                <p className="text-sm text-gray-500 mt-1">Expense amount: ₹{formData.amount}</p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Date *</label>
                  <Input
                    type="date"
                    value={paymentDetailsForm.payment_date}
                    onChange={(e) => setPaymentDetailsForm(prev => ({ ...prev, payment_date: e.target.value }))}
                    data-testid="payment-date-input"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Mode *</label>
                  <Select value={paymentDetailsForm.payment_mode} onValueChange={(v) => setPaymentDetailsForm(prev => ({ ...prev, payment_mode: v }))}>
                    <SelectTrigger data-testid="payment-mode-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reference / Transaction ID</label>
                  <Input
                    placeholder="Enter reference number"
                    value={paymentDetailsForm.payment_reference}
                    onChange={(e) => setPaymentDetailsForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                    data-testid="payment-reference-input"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Paid By</label>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio"
                        checked={paymentDetailsForm.paid_by_type === 'company'}
                        onChange={() => setPaymentDetailsForm(prev => ({ ...prev, paid_by_type: 'company', paid_by_employee_id: '' }))}
                        className="w-4 h-4 text-green-600"
                        data-testid="paid-by-company-radio"
                      />
                      <span className="text-sm">Company</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio"
                        checked={paymentDetailsForm.paid_by_type === 'employee'}
                        onChange={() => setPaymentDetailsForm(prev => ({ ...prev, paid_by_type: 'employee' }))}
                        className="w-4 h-4 text-green-600"
                        data-testid="paid-by-employee-radio"
                      />
                      <span className="text-sm">Employee</span>
                    </label>
                  </div>
                  {paymentDetailsForm.paid_by_type === 'employee' && (
                    <Select 
                      value={paymentDetailsForm.paid_by_employee_id} 
                      onValueChange={(v) => setPaymentDetailsForm(prev => ({ ...prev, paid_by_employee_id: v }))}
                    >
                      <SelectTrigger data-testid="paid-by-employee-select">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffUsers.map(user => (
                          <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              <div className="p-4 border-t flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    setShowPaymentDetailsModal(false);
                    setShowAddDialog(true); // Re-open Add Dialog to allow user to edit
                  }}
                  data-testid="payment-cancel-btn"
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700" 
                  onClick={handlePaymentDetailsSubmit}
                  data-testid="confirm-payment-btn"
                >
                  <CheckCircle size={14} className="mr-1" /> Confirm Payment
                </Button>
              </div>
            </div>
          </div>
        )}
          </>
        )}

        {/* Add/Edit Employee Modal */}
        <Dialog open={showEmployeeModal} onOpenChange={setShowEmployeeModal}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus size={18} className="text-[#14532D]" />
                {editingEmployeeData ? 'Edit Employee' : 'Add New Employee'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Name *</label>
                <Input
                  placeholder="Enter full name"
                  value={employeeFormData.name}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, name: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Phone Number *</label>
                <Input
                  placeholder="Enter phone number"
                  value={employeeFormData.phone}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, phone: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Department *</label>
                <select 
                  value={employeeFormData.department}
                  onChange={(e) => {
                    console.log('Department selected:', e.target.value);
                    setEmployeeFormData(prev => ({ ...prev, department: e.target.value }));
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select department</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Vertical</label>
                <Select value={employeeFormData.vertical} onValueChange={(v) => setEmployeeFormData(prev => ({ ...prev, vertical: v  }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vertical" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="z-[9999]" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="QC">QC</SelectItem>
                    <SelectItem value="Central">Central</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Designation</label>
                <Input
                  placeholder="Enter designation"
                  value={employeeFormData.designation}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, designation: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">CTC (Annual)</label>
                <Input
                  type="number"
                  placeholder="Enter CTC"
                  value={employeeFormData.ctc}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, ctc: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Date of Joining *</label>
                <Input
                  type="date"
                  value={employeeFormData.doj || ''}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, doj: e.target.value  }))}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Last Working Day</label>
                <div className="relative">
                  <Input
                    type="date"
                    value={employeeFormData.lwd || ''}
                    onChange={(e) => setEmployeeFormData(prev => ({ ...prev, lwd: e.target.value  }))}
                    placeholder="Leave empty if still working"
                    autoComplete="off"
                    className={employeeFormData.lwd ? '' : 'text-gray-400'}
                  />
                  {employeeFormData.lwd && (
                    <button
                      type="button"
                      className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setEmployeeFormData(prev => ({ ...prev, lwd: '' }))}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave empty if employee is still working</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">City</label>
                <Input
                  placeholder="Enter city"
                  value={employeeFormData.city}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, city: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Status</label>
                <Select value={employeeFormData.status} onValueChange={(v) => setEmployeeFormData(prev => ({ ...prev, status: v  }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="z-[9999]" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Address</label>
                <Input
                  placeholder="Enter full address"
                  value={employeeFormData.address}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, address: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">State</label>
                <Input
                  placeholder="Enter state"
                  value={employeeFormData.state}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, state: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Gender</label>
                <Select value={employeeFormData.gender} onValueChange={(v) => setEmployeeFormData(prev => ({ ...prev, gender: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="z-[9999]" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Bank Details Section */}
              <div className="col-span-2 border-t pt-4 mt-2">
                <p className="text-sm font-semibold text-gray-700 mb-3">Bank Details</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Bank Name</label>
                <Input
                  placeholder="Enter bank name"
                  value={employeeFormData.bank_name}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, bank_name: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Account Number</label>
                <Input
                  placeholder="Enter account number"
                  value={employeeFormData.bank_account_number}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, bank_account_number: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">IFSC Code</label>
                <Input
                  placeholder="Enter IFSC code"
                  value={employeeFormData.ifsc_code}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, ifsc_code: e.target.value  }))}
                />
              </div>
              
              {/* ID Proof Section */}
              <div className="col-span-2 border-t pt-4 mt-2">
                <p className="text-sm font-semibold text-gray-700 mb-3">ID Proof & Contact</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Aadhar Number</label>
                <Input
                  placeholder="Enter Aadhar number"
                  value={employeeFormData.aadhar_number}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, aadhar_number: e.target.value  }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">PAN Number</label>
                <Input
                  placeholder="Enter PAN number"
                  value={employeeFormData.pan_number}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, pan_number: e.target.value  }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Emergency Contact Number</label>
                <Input
                  placeholder="Enter emergency contact"
                  value={employeeFormData.emergency_contact}
                  onChange={(e) => setEmployeeFormData(prev => ({ ...prev, emergency_contact: e.target.value  }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmployeeModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEmployee} className="bg-[#14532D] hover:bg-[#166534]">
                {editingEmployeeData ? 'Update' : 'Add'} Employee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Employee Modal */}
        <Dialog open={showViewEmployeeModal} onOpenChange={setShowViewEmployeeModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye size={18} className="text-blue-600" />
                Employee Details
              </DialogTitle>
            </DialogHeader>
            
            {viewingEmployee && (
              <div className="space-y-4 py-2">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-blue-600 font-medium">{viewingEmployee.employee_id}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      viewingEmployee.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {viewingEmployee.status}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold">{viewingEmployee.name}</h3>
                  <p className="text-sm text-gray-500">{viewingEmployee.designation || 'No designation'}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Phone</p>
                    <p className="font-medium">{viewingEmployee.phone || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Department</p>
                    <p className="font-medium">{viewingEmployee.department || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Vertical</p>
                    <p className="font-medium">{viewingEmployee.vertical || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">CTC (Annual)</p>
                    <p className="font-medium">₹{(viewingEmployee.ctc || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Date of Joining</p>
                    <p className="font-medium">
                      {viewingEmployee.doj ? new Date(viewingEmployee.doj).toLocaleDateString('en-IN') : '-'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Last Working Day</p>
                    <p className="font-medium">
                      {viewingEmployee.lwd ? new Date(viewingEmployee.lwd).toLocaleDateString('en-IN') : '-'}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded col-span-2">
                    <p className="text-gray-500 text-xs">Address</p>
                    <p className="font-medium">{viewingEmployee.address || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Aadhar Number</p>
                    <p className="font-medium">{viewingEmployee.aadhar_number || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">PAN Number</p>
                    <p className="font-medium">{viewingEmployee.pan_number || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">City</p>
                    <p className="font-medium">{viewingEmployee.city || '-'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-gray-500 text-xs">Emergency Contact</p>
                    <p className="font-medium">{viewingEmployee.emergency_contact || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewEmployeeModal(false)}>
                Close
              </Button>
              <Button onClick={() => {
                setShowViewEmployeeModal(false);
                handleEditEmployee(viewingEmployee);
              }} className="bg-[#14532D] hover:bg-[#166534]">
                <Edit2 size={14} className="mr-1" /> Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Department Management Modal */}
        <Dialog open={showDepartmentModal} onOpenChange={setShowDepartmentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 size={18} className="text-[#14532D]" />
                Manage Departments
              </DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              {/* Add New Department */}
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Enter new department name"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddDepartment()}
                />
                <Button onClick={handleAddDepartment} className="bg-[#14532D] hover:bg-[#166534]">
                  <Plus size={14} className="mr-1" /> Add
                </Button>
              </div>
              
              {/* Department List */}
              <div className="border rounded-lg max-h-60 overflow-y-auto">
                {departments.length === 0 ? (
                  <p className="p-4 text-center text-gray-500">No departments added</p>
                ) : (
                  <div className="divide-y">
                    {departments.map((dept, index) => (
                      <div key={index} className="flex items-center justify-between p-3 hover:bg-gray-50">
                        <span className="font-medium">{dept}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDepartment(dept)}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDepartmentModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pay Employee Modal */}
        <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus size={18} className="text-green-600" />
                Record Payment
              </DialogTitle>
            </DialogHeader>
            
            {selectedEmployeeForPayment && (
              <div className="py-4 space-y-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-semibold">{selectedEmployeeForPayment.employee_name}</p>
                  <p className="text-sm text-gray-500">
                    Net Payable: <span className="font-medium text-orange-600">₹{(selectedEmployeeForPayment.net_payable || 0).toLocaleString('en-IN')}</span>
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Amount *</label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Payment Mode</label>
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Reference/Notes</label>
                  <Input
                    placeholder="Transaction ID, Cheque No, etc."
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleRecordPayment} className="bg-green-600 hover:bg-green-700">
                Record Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payment History Modal */}
        <Dialog open={showPaymentHistoryModal} onOpenChange={setShowPaymentHistoryModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                Payment History
              </DialogTitle>
            </DialogHeader>
            
            {selectedEmployeeForPayment && (
              <div className="py-2">
                <p className="font-medium text-gray-700 mb-3">{selectedEmployeeForPayment.employee_name}</p>
                
                {paymentHistory.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">No payment history found</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {paymentHistory.map((payment, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-green-600">₹{payment.amount.toLocaleString('en-IN')}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(payment.payment_date).toLocaleDateString('en-IN')} • {payment.payment_mode}
                          </p>
                          {payment.reference && (
                            <p className="text-xs text-gray-400">Ref: {payment.reference}</p>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {payment.period_from && payment.period_to && (
                            `${payment.period_from} - ${payment.period_to}`
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentHistoryModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payroll Detail Modal */}
        <Dialog open={showPayrollDetailModal} onOpenChange={setShowPayrollDetailModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                Payroll Details
              </DialogTitle>
            </DialogHeader>
            
            {selectedEmployeeDetail && (
              <div className="py-2">
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <h3 className="font-bold text-lg">{selectedEmployeeDetail.employee_name}</h3>
                  <p className="text-sm text-gray-500">{selectedEmployeeDetail.department} • {selectedEmployeeDetail.vertical}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Annual CTC</p>
                    <p className="font-semibold">₹{(selectedEmployeeDetail.ctc || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Monthly Salary</p>
                    <p className="font-semibold">₹{(selectedEmployeeDetail.monthly_salary || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Daily Rate</p>
                    <p className="font-semibold">₹{(selectedEmployeeDetail.daily_rate || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Days Present</p>
                    <p className="font-semibold text-green-600">{selectedEmployeeDetail.days_present}</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Days Absent</p>
                    <p className="font-semibold text-red-600">{selectedEmployeeDetail.days_absent}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded">
                    <p className="text-xs text-gray-500">Paid Leaves</p>
                    <p className="font-semibold text-purple-600">{selectedEmployeeDetail.paid_leave_days}</p>
                  </div>
                  <div className="bg-green-100 p-3 rounded col-span-2">
                    <p className="text-xs text-gray-500">Payable Days</p>
                    <p className="font-bold text-green-700 text-lg">{selectedEmployeeDetail.payable_days}</p>
                  </div>
                </div>
                
                <div className="border-t mt-4 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Regular Salary ({selectedEmployeeDetail.payable_days} days)</span>
                    <span className="font-medium">₹{(selectedEmployeeDetail.regular_salary || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">OT Amount ({selectedEmployeeDetail.ot_hours || 0} hrs)</span>
                    <span className="font-medium">₹{(selectedEmployeeDetail.ot_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t pt-2">
                    <span>Total Amount</span>
                    <span>₹{(selectedEmployeeDetail.total_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm text-blue-600">
                    <span>Paid</span>
                    <span>- ₹{(selectedEmployeeDetail.total_paid || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-orange-600 border-t pt-2">
                    <span>Net Payable</span>
                    <span>₹{(selectedEmployeeDetail.net_payable || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayrollDetailModal(false)}>
                Close
              </Button>
              <Button 
                onClick={() => {
                  setShowPayrollDetailModal(false);
                  openPaymentModal(selectedEmployeeDetail);
                }} 
                className="bg-green-600 hover:bg-green-700"
              >
                + Pay Now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payslip Preview Modal */}
        <Dialog open={showPayslipModal} onOpenChange={setShowPayslipModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-purple-600" />
                Payslip Preview
              </DialogTitle>
            </DialogHeader>
            
            {selectedPayslipEmployee && (
              <div className="py-2">
                {/* Payslip Preview */}
                <div className="border rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="bg-[#CFFF04] p-4 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold">VEZLO</h2>
                      <p className="text-xs text-gray-600">FRESH PACKS. DAILY.</p>
                    </div>
                    <div className="text-right text-xs text-gray-600">
                      <p>Pune, Maharashtra</p>
                      <p>contact@vezlo.in</p>
                    </div>
                  </div>
                  
                  {/* Title */}
                  <div className="bg-gray-800 text-white text-center py-2 text-sm">
                    PAYSLIP FOR THE MONTH OF {new Date(payrollDateFrom).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }).toUpperCase()}
                  </div>
                  
                  {/* Summary */}
                  <div className="p-4 grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-xs text-gray-500">Employee Name</p>
                      <p className="font-semibold">{selectedPayslipEmployee.employee_name}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-xs text-gray-500">Pay Period</p>
                      <p className="font-semibold text-sm">{payrollDateFrom} to {payrollDateTo}</p>
                    </div>
                    <div className="bg-[#CFFF04] p-3 rounded">
                      <p className="text-xs text-gray-600">Net Pay</p>
                      <p className="font-bold text-xl">₹{(selectedPayslipEmployee.net_payable || 0).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  
                  {/* Details */}
                  <div className="px-4 pb-4 grid grid-cols-2 gap-4">
                    <div className="border rounded p-3">
                      <p className="text-xs text-gray-500 border-b pb-2 mb-2">EMPLOYEE DETAILS</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-500">Department</span><span>{selectedPayslipEmployee.department || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Vertical</span><span>{selectedPayslipEmployee.vertical || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Paid Days</span><span className="font-medium text-green-600">{selectedPayslipEmployee.payable_days}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">LOP Days</span><span className="font-medium text-red-600">{selectedPayslipEmployee.days_absent || 0}</span></div>
                      </div>
                    </div>
                    <div className="border rounded p-3">
                      <p className="text-xs text-gray-500 border-b pb-2 mb-2">BANK DETAILS</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-500">Bank</span><span>{selectedPayslipEmployee.bank_name || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Account</span><span>{selectedPayslipEmployee.bank_account || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">IFSC</span><span>{selectedPayslipEmployee.ifsc || 'N/A'}</span></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Earnings Table */}
                  <div className="px-4 pb-4">
                    <table className="w-full text-xs border">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="p-2 text-left border-r">EARNINGS</th>
                          <th className="p-2 text-right border-r w-24">AMOUNT</th>
                          <th className="p-2 text-right w-24">DEDUCTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="p-2 border-r">Basic Salary ({selectedPayslipEmployee.payable_days} days)</td>
                          <td className="p-2 text-right border-r">₹{(selectedPayslipEmployee.regular_salary || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right">-</td>
                        </tr>
                        <tr className="border-t">
                          <td className="p-2 border-r">Overtime ({selectedPayslipEmployee.ot_hours || 0} hrs)</td>
                          <td className="p-2 text-right border-r">₹{(selectedPayslipEmployee.ot_amount || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right">-</td>
                        </tr>
                        <tr className="border-t bg-[#CFFF04] font-semibold">
                          <td className="p-2 border-r">Gross Earnings</td>
                          <td className="p-2 text-right border-r">₹{(selectedPayslipEmployee.total_amount || 0).toLocaleString('en-IN')}</td>
                          <td className="p-2 text-right">₹0</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Net Pay */}
                  <div className="bg-gray-800 text-white p-3 flex justify-between items-center">
                    <span className="text-sm">TOTAL NET PAYABLE</span>
                    <span className="text-xl font-bold">₹{(selectedPayslipEmployee.net_payable || 0).toLocaleString('en-IN')}</span>
                  </div>
                  
                  {/* Footer */}
                  <div className="text-center py-2 text-xs text-gray-400 border-t">
                    This is a system-generated document
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayslipModal(false)}>
                Close
              </Button>
              <Button onClick={downloadPayslipAsPDF} className="bg-purple-600 hover:bg-purple-700">
                <Download size={14} className="mr-1" /> Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Copy Attendance to Dates Modal */}
        <Dialog open={showCopyDatesModal} onOpenChange={setShowCopyDatesModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Copy size={18} className="text-[#14532D]" />
                Copy Attendance to Other Dates
              </DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              <p className="text-sm text-gray-500 mb-4">
                Copy attendance from <strong>{attendanceDate}</strong> to the selected dates below:
              </p>
              
              {/* Quick select buttons */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dates = [];
                    const today = new Date(attendanceDate);
                    for (let i = 1; i <= 7; i++) {
                      const d = new Date(today);
                      d.setDate(d.getDate() + i);
                      dates.push(d.toISOString().split('T')[0]);
                    }
                    setCopyTargetDates(dates);
                  }}
                >
                  Next 7 Days
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const dates = [];
                    const today = new Date(attendanceDate);
                    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    for (let d = new Date(today); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
                      if (d.toISOString().split('T')[0] !== attendanceDate) {
                        dates.push(d.toISOString().split('T')[0]);
                      }
                    }
                    setCopyTargetDates(dates);
                  }}
                >
                  Rest of Month
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCopyTargetDates([])}
                >
                  Clear
                </Button>
              </div>
              
              {/* Date input */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 block mb-1">Add specific date:</label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    id="copyDateInput"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById('copyDateInput');
                      if (input.value && !copyTargetDates.includes(input.value)) {
                        setCopyTargetDates([...copyTargetDates, input.value]);
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
              
              {/* Selected dates */}
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {copyTargetDates.length === 0 ? (
                  <p className="p-4 text-center text-gray-400 text-sm">No dates selected</p>
                ) : (
                  <div className="divide-y">
                    {copyTargetDates.sort().map(date => (
                      <div key={date} className="flex items-center justify-between p-2 hover:bg-gray-50">
                        <span className="text-sm">{new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCopyTargetDates(copyTargetDates.filter(d => d !== date))}
                          className="h-6 w-6 p-0 text-red-500"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <p className="text-xs text-gray-400 mt-2">
                Selected: {copyTargetDates.length} date(s)
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCopyDatesModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCopyAttendance} className="bg-[#14532D] hover:bg-[#166534]" disabled={copyTargetDates.length === 0}>
                Copy Attendance
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Details Modal */}
        <Dialog open={showViewDetailsModal} onOpenChange={setShowViewDetailsModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                Expense Details
              </DialogTitle>
            </DialogHeader>
            
            {viewingExpense && (
              <div className="space-y-4 py-2">
                {/* Category & Description */}
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{viewingExpense.category}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      viewingExpense.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{viewingExpense.status}</span>
                  </div>
                  <p className="text-sm text-gray-600">{viewingExpense.description || 'No description'}</p>
                  <p className="text-2xl font-bold mt-2">₹{viewingExpense.amount?.toLocaleString()}</p>
                </div>

                {/* Expense Info Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Date</p>
                    <p className="font-medium">{viewingExpense.date?.split('T')[0] || `${viewingExpense.year}-${String(viewingExpense.month).padStart(2, '0')}-01`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Due Date</p>
                    <p className="font-medium">Day {viewingExpense.due_date || 1}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Recurring</p>
                    <p className="font-medium">{viewingExpense.is_recurring ? 'Yes' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Paid By</p>
                    <p className="font-medium">{viewingExpense.paid_by || 'Company'}</p>
                  </div>
                </div>

                {/* Vendor & Invoice Info */}
                {(viewingExpense.vendor || viewingExpense.invoice_number) && (
                  <div className="border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Vendor Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {viewingExpense.vendor && (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Vendor</p>
                          <p className="font-medium">{viewingExpense.vendor}</p>
                        </div>
                      )}
                      {viewingExpense.invoice_number && (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Invoice Number</p>
                          <p className="font-medium">{viewingExpense.invoice_number}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment Details - only show if Paid */}
                {viewingExpense.status === 'Paid' && (
                  <div className="border-t pt-3">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Payment Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Payment Mode</p>
                        <p className="font-medium">{viewingExpense.payment_mode || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Payment Date</p>
                        <p className="font-medium">{viewingExpense.payment_date?.split('T')[0] || 'Not specified'}</p>
                      </div>
                      {viewingExpense.payment_reference && (
                        <div className="col-span-2">
                          <p className="text-xs text-gray-500 mb-0.5">Transaction Reference</p>
                          <p className="font-medium font-mono text-xs bg-gray-50 px-2 py-1 rounded">{viewingExpense.payment_reference}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Template/Generated Info */}
                {viewingExpense.template_id && (
                  <div className="text-xs text-gray-500 bg-blue-50 px-2 py-1 rounded">
                    Generated from recurring template
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewDetailsModal(false)}>
                Close
              </Button>
              <Button onClick={() => {
                setShowViewDetailsModal(false);
                handleEdit(viewingExpense);
              }}>
                <Edit2 size={14} className="mr-1" /> Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Corporate Expenses Dialog */}
        <Dialog open={showCorporateDialog} onOpenChange={setShowCorporateDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 size={18} className="text-blue-600" />
                Corporate Expenses Management
              </DialogTitle>
            </DialogHeader>
            
            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b pb-2">
              <button
                onClick={() => setCorporateTab('templates')}
                className={`px-4 py-2 text-sm rounded-t transition-colors ${
                  corporateTab === 'templates' ? 'bg-[#14532D] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <FileText size={14} className="inline mr-1" /> Recurring Templates
              </button>
              <button
                onClick={() => setCorporateTab('employees')}
                className={`px-4 py-2 text-sm rounded-t transition-colors ${
                  corporateTab === 'employees' ? 'bg-[#14532D] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Users size={14} className="inline mr-1" /> Corporate Employees
              </button>
            </div>

            {/* Templates Tab */}
            {corporateTab === 'templates' && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm text-gray-500">Templates auto-generate expenses each month when you click "Generate Recurring"</p>
                  <Button 
                    size="sm" 
                    onClick={() => { resetTemplateForm(); setShowTemplateDialog(true); }}
                    className="bg-[#14532D] hover:bg-[#166534]"
                  >
                    <Plus size={14} className="mr-1" /> Add Template
                  </Button>
                </div>

                {recurringTemplates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No recurring templates yet</p>
                    <p className="text-xs">Create templates for auto-generating monthly expenses</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recurringTemplates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{tmpl.category}</span>
                            {tmpl.expense_type !== 'general' && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs capitalize">{tmpl.expense_type.replace('_', ' ')}</span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1">{tmpl.description || tmpl.category}</p>
                          <p className="text-lg font-bold text-green-600">₹{tmpl.amount?.toLocaleString()}</p>
                          {tmpl.linked_employee_name && (
                            <p className="text-xs text-gray-500">Linked to: {tmpl.linked_employee_name}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEditTemplate(tmpl)}>
                            <Edit2 size={14} className="text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteTemplate(tmpl.id)}>
                            <Trash2 size={14} className="text-red-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Employees Tab */}
            {corporateTab === 'employees' && (
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm text-gray-500">Manage corporate employees for expense tracking and allowances</p>
                  <Button 
                    size="sm" 
                    onClick={() => { resetEmployeeForm(); setShowEmployeeDialog(true); }}
                    className="bg-[#14532D] hover:bg-[#166534]"
                  >
                    <UserPlus size={14} className="mr-1" /> Add Employee
                  </Button>
                </div>

                {corporateEmployees.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No corporate employees yet</p>
                    <p className="text-xs">Add employees to link allowances and expenses</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {corporateEmployees.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-xs text-gray-500">{emp.role}{emp.department ? ` • ${emp.department}` : ''}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEditCorporateEmployee(emp)}>
                            <Edit2 size={14} className="text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDeleteCorporateEmployee(emp.id)}>
                            <Trash2 size={14} className="text-red-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Template Add/Edit Dialog */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? 'Edit Template' : 'Add Recurring Template'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Category *</label>
                <Select value={templateForm.category} onValueChange={(v) => setTemplateForm(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {FIXED_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                <Input
                  placeholder="e.g., Office rent, Laptop EMI..."
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Amount *</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={templateForm.amount}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Due Date (Day)</label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={templateForm.due_date}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, due_date: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Expense Type</label>
                <Select value={templateForm.expense_type} onValueChange={(v) => setTemplateForm(prev => ({ ...prev, expense_type: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Vendor</label>
                  <Input
                    placeholder="Vendor name"
                    value={templateForm.vendor}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, vendor: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Invoice Number</label>
                  <Input
                    placeholder="INV-..."
                    value={templateForm.invoice_number}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>

              {corporateEmployees.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Link to Employee (for allowances)</label>
                  <Select 
                    value={templateForm.linked_employee_id || '__none__'} 
                    onValueChange={(v) => {
                      const isNone = v === '__none__';
                      const emp = corporateEmployees.find(e => e.id === v);
                      setTemplateForm(prev => ({ 
                        ...prev, 
                        linked_employee_id: isNone ? '' : v,
                        linked_employee_name: isNone ? '' : (emp?.name || '')
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="None (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {corporateEmployees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Notes</label>
                <Input
                  placeholder="Any additional notes..."
                  value={templateForm.notes}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowTemplateDialog(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveTemplate} className="bg-[#14532D] hover:bg-[#166534]">
                {editingTemplate ? 'Update' : 'Create'} Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Employee Add/Edit Dialog */}
        <Dialog open={showEmployeeDialog} onOpenChange={setShowEmployeeDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add Corporate Employee'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Name *</label>
                <Input
                  placeholder="Full name"
                  value={employeeForm.name}
                  onChange={(e) => setEmployeeForm(prev => ({ ...prev, name: e.target.value }))}
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Role</label>
                  <Input
                    placeholder="e.g., Manager"
                    value={employeeForm.role}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, role: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Department</label>
                  <Input
                    placeholder="e.g., Operations"
                    value={employeeForm.department}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, department: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Notes</label>
                <Input
                  placeholder="Any additional notes..."
                  value={employeeForm.notes}
                  onChange={(e) => setEmployeeForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowEmployeeDialog(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveCorporateEmployee} className="bg-[#14532D] hover:bg-[#166534]">
                {editingEmployee ? 'Update' : 'Create'} Employee
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vendor Management Dialog */}
        <Dialog open={showVendorManagement} onOpenChange={setShowVendorManagement}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Manage Vendors</span>
                <Button 
                  size="sm" 
                  onClick={() => { resetVendorForm(); setShowVendorDialog(true); }}
                  className="bg-[#14532D] hover:bg-[#166534]"
                >
                  <Plus size={14} className="mr-1" /> Add Vendor
                </Button>
              </DialogTitle>
            </DialogHeader>
            
            <div className="py-2">
              {vendors.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Building2 size={48} className="mx-auto mb-3 opacity-30" />
                  <p>No vendors found</p>
                  <p className="text-sm">Add your first vendor to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vendors.map(vendor => (
                    <div key={vendor.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:border-gray-300 transition-colors">
                      <div>
                        <p className="font-medium text-gray-900">{vendor.name}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1">
                          {vendor.contact && <span>Contact: {vendor.contact}</span>}
                          {vendor.phone && <span>Phone: {vendor.phone}</span>}
                        </div>
                        {vendor.notes && <p className="text-xs text-gray-400 mt-1">{vendor.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setVendorForm({ name: vendor.name, contact: vendor.contact || '', phone: vendor.phone || '', notes: vendor.notes || '' });
                            setEditingVendor(vendor);
                            setShowVendorDialog(true);
                          }}
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteVendor(vendor.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Vendor Add/Edit Dialog */}
        <Dialog open={showVendorDialog} onOpenChange={setShowVendorDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Vendor Name *</label>
                <Input
                  placeholder="Enter vendor name"
                  value={vendorForm.name}
                  onChange={(e) => setVendorForm(prev => ({ ...prev, name: e.target.value }))}
                  className="h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Contact Person</label>
                  <Input
                    placeholder="Contact name"
                    value={vendorForm.contact}
                    onChange={(e) => setVendorForm(prev => ({ ...prev, contact: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Phone</label>
                  <Input
                    placeholder="Phone number"
                    value={vendorForm.phone}
                    onChange={(e) => setVendorForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Notes</label>
                <Input
                  placeholder="Any additional notes..."
                  value={vendorForm.notes}
                  onChange={(e) => setVendorForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { resetVendorForm(); setShowVendorDialog(false); }}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveVendor} className="bg-[#14532D] hover:bg-[#166534]">
                {editingVendor ? 'Update' : 'Add'} Vendor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
