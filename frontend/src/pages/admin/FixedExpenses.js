import React, { useState, useEffect, useCallback } from 'react';
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
  AlertTriangle, Calendar, Copy, Users, Eye, Building2, FileText, UserPlus
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
    status: 'active'
  });
  
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
    }
  }, [activeMainTab, loadFixedEmployees]);

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
      status: 'active'
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
      status: employee.status || 'active'
    });
    setEditingEmployeeData(employee);
    setShowEmployeeModal(true);
  };

  const handleViewEmployee = (employee) => {
    setViewingEmployee(employee);
    setShowViewEmployeeModal(true);
  };

  const handleSaveEmployee = async () => {
    if (!employeeFormData.name || !employeeFormData.phone || !employeeFormData.department || !employeeFormData.doj) {
      toast.error('Please fill in required fields (Name, Phone, Department, DOJ)');
      return;
    }

    try {
      const payload = {
        ...employeeFormData,
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

  const unsettledExpenses = expenses.filter(e => !e.is_settled && e.paid_by !== 'Company');
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const paidAmount = expenses.filter(e => e.status === 'Paid').reduce((sum, e) => sum + (e.amount || 0), 0);
  const pendingAmount = expenses.filter(e => e.status !== 'Paid').reduce((sum, e) => sum + (e.amount || 0), 0);
  const overdueCount = expenses.filter(e => {
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
          <Card className="p-6">
            <div className="text-center text-gray-500">
              <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">Attendance Tracking</h3>
              <p className="text-sm">Coming soon - Track employee attendance and leave management</p>
            </div>
          </Card>
        )}

        {/* MANAGE EMPLOYEES TAB */}
        {activeMainTab === 'employees' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Employee List</h2>
              <Button size="sm" onClick={handleAddEmployee} className="bg-[#14532D] hover:bg-[#166534]">
                <UserPlus size={14} className="mr-1" /> Add Employee
              </Button>
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
          <Card className="p-6">
            <div className="text-center text-gray-500">
              <FileText size={48} className="mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">Payroll Processing</h3>
              <p className="text-sm">Coming soon - Process monthly payroll and generate payslips</p>
            </div>
          </Card>
        )}

        {/* EXPENSES TAB - Original Content */}
        {activeMainTab === 'expenses' && (
          <>
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

              <div className="ml-auto">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowCorporateDialog(true)}
                  className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  <Building2 size={14} className="mr-1" /> Corporate Expenses
                </Button>
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
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-gray-500">
                          No fixed expenses for this month. Click "Add Expense" or "Generate Recurring" to get started.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => (
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
                  Total: ₹{expenses.filter(e => selectedExpenses.includes(e.id)).reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}
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
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Phone Number *</label>
                <Input
                  placeholder="Enter phone number"
                  value={employeeFormData.phone}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Department *</label>
                <Select value={employeeFormData.department} onValueChange={(v) => setEmployeeFormData({ ...employeeFormData, department: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Procurement">Procurement</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Logistics">Logistics</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="Warehouse">Warehouse</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Vertical</label>
                <Select value={employeeFormData.vertical} onValueChange={(v) => setEmployeeFormData({ ...employeeFormData, vertical: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vertical" />
                  </SelectTrigger>
                  <SelectContent>
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
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, designation: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">CTC (Annual)</label>
                <Input
                  type="number"
                  placeholder="Enter CTC"
                  value={employeeFormData.ctc}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, ctc: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Date of Joining *</label>
                <Input
                  type="date"
                  value={employeeFormData.doj}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, doj: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Last Working Day</label>
                <Input
                  type="date"
                  value={employeeFormData.lwd}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, lwd: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">City</label>
                <Input
                  placeholder="Enter city"
                  value={employeeFormData.city}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, city: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Status</label>
                <Select value={employeeFormData.status} onValueChange={(v) => setEmployeeFormData({ ...employeeFormData, status: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
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
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, address: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Aadhar Number</label>
                <Input
                  placeholder="Enter Aadhar number"
                  value={employeeFormData.aadhar_number}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, aadhar_number: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">PAN Number</label>
                <Input
                  placeholder="Enter PAN number"
                  value={employeeFormData.pan_number}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, pan_number: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Emergency Contact Number</label>
                <Input
                  placeholder="Enter emergency contact"
                  value={employeeFormData.emergency_contact}
                  onChange={(e) => setEmployeeFormData({ ...employeeFormData, emergency_contact: e.target.value })}
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
      </div>
    </Layout>
  );
}
