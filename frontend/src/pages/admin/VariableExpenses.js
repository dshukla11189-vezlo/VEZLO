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
  Plus, Receipt, Filter, Calendar, Edit2, Trash2, RefreshCw, 
  CheckCircle, Clock, AlertCircle, DollarSign, Users, Search, Eye, IndianRupee
} from 'lucide-react';

const EXPENSE_CATEGORIES = [
  'Transportation',
  'Packaging',
  'Labor',
  'Fuel',
  'Loading/Unloading',
  'Commission',
  'Cold Storage',
  'Market Fees',
  'Maintenance',
  'Other'
];

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque'];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-orange-100 text-orange-700' },
  { value: 'partially_paid', label: 'Partially Paid', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'paid', label: 'Paid', color: 'bg-green-100 text-green-700' }
];

const VERTICAL_OPTIONS = [
  { value: 'all', label: 'All (Split Equally)' },
  { value: 'qc', label: 'QC Only' },
  { value: 'retail', label: 'Retail Only' }
];

export default function VariableExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]); // Admin and Staff users
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  
  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSettled, setFilterSettled] = useState('all');
  const [filterPaidBy, setFilterPaidBy] = useState('all'); // New filter for Paid By
  
  // Form data
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    rate: '',
    quantity: '',
    amount: '',
    paid_to: '',
    payment_mode: 'Cash',
    receipt_no: '',
    paid_by_type: 'company', // 'company' or 'employee'
    paid_by: 'Company', // Company or Employee name
    paid_by_employee_id: '', // If employee, store their ID
    payment_status: 'pending', // 'pending', 'partially_paid', 'paid'
    paid_amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_reference: '',
    settlement_status: 'settled', // 'settled' or 'pending_reimbursement'
    settlement_date: '',
    settlement_remarks: '',
    vertical: 'all' // 'all', 'qc', or 'retail'
  });
  
  // Payment Details Modal state (for recording payment details when marking as Paid)
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);
  const [paymentDetailsForm, setPaymentDetailsForm] = useState({
    payment_mode: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    payment_reference: '',
    paid_by_type: 'company',
    paid_by_employee_id: ''
  });
  
  // Bulk settlement
  const [selectedExpenses, setSelectedExpenses] = useState([]);
  const [settlementRemarks, setSettlementRemarks] = useState('');
  
  // View Payment Modal state
  const [showViewPaymentModal, setShowViewPaymentModal] = useState(false);
  const [viewingExpense, setViewingExpense] = useState(null);
  
  // Reimbursement Modal state (for settling employee expenses)
  const [showReimbursementModal, setShowReimbursementModal] = useState(false);
  const [reimbursementExpense, setReimbursementExpense] = useState(null);
  const [reimbursementForm, setReimbursementForm] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'Bank Transfer',
    payment_reference: '',
    remarks: ''
  });
  
  // Bulk Settlement state
  const [showBulkSettlementModal, setShowBulkSettlementModal] = useState(false);
  const [bulkSettlementEmployee, setBulkSettlementEmployee] = useState(null);
  const [bulkSettlementExpenses, setBulkSettlementExpenses] = useState([]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/expenses/variable';
      const params = new URLSearchParams();
      if (filterDateFrom) params.append('from_date', filterDateFrom);
      if (filterDateTo) params.append('to_date', filterDateTo);
      if (filterCategory !== 'all') params.append('category', filterCategory);
      if (filterSettled !== 'all') params.append('settled', filterSettled);
      if (filterPaidBy !== 'all') params.append('paid_by', filterPaidBy);
      
      if (params.toString()) url += '?' + params.toString();
      
      const response = await api.get(url);
      setExpenses(response.data);
    } catch (error) {
      console.error('Load expenses error:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterCategory, filterSettled, filterPaidBy]);

  const loadEmployees = async () => {
    try {
      const response = await api.get('/api/employees');
      setEmployees(response.data);
    } catch (error) {
      // Employees list might not exist yet, use a default list
      setEmployees([]);
    }
  };

  // Load Admin and Staff users for Paid By dropdown
  const loadStaffUsers = async () => {
    try {
      const response = await api.get('/api/users');
      // Filter only admin and staff users
      const adminStaff = (response.data || []).filter(u => 
        u.role === 'admin' || u.role === 'staff'
      );
      setStaffUsers(adminStaff);
    } catch (error) {
      console.error('Failed to load staff users:', error);
      setStaffUsers([]);
    }
  };

  useEffect(() => {
    loadExpenses();
    loadEmployees();
    loadStaffUsers();
  }, [loadExpenses]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      rate: '',
      quantity: '',
      amount: '',
      paid_to: '',
      payment_mode: 'Cash',
      receipt_no: '',
      paid_by_type: 'company',
      paid_by: 'Company',
      paid_by_employee_id: '',
      payment_status: 'pending',
      paid_amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_reference: '',
      settlement_status: 'settled',
      settlement_date: '',
      settlement_remarks: '',
      vertical: 'all'
    });
    setEditingExpense(null);
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.amount) {
      toast.error('Category and Amount are required');
      return;
    }
    
    // If status is being set to "paid", show payment details modal first
    if (formData.payment_status === 'paid' && !formData.payment_date) {
      setPaymentDetailsForm({
        payment_mode: formData.payment_mode || 'Cash',
        payment_date: new Date().toISOString().split('T')[0],
        payment_reference: formData.payment_reference || '',
        paid_by_type: formData.paid_by_type || 'company',
        paid_by_employee_id: formData.paid_by_employee_id || ''
      });
      setShowPaymentDetailsModal(true);
      return;
    }
    
    try {
      // Determine paid_by value based on type
      let paidByValue = 'Company';
      if (formData.paid_by_type === 'employee' && formData.paid_by_employee_id) {
        const emp = staffUsers.find(u => u.id === formData.paid_by_employee_id);
        paidByValue = emp?.name || emp?.email || formData.paid_by_employee_id;
      }
      
      // Settlement status: Company paid = settled, Employee paid = pending_reimbursement (unless already settled)
      let settlementStatus = formData.settlement_status;
      if (formData.payment_status === 'paid') {
        if (formData.paid_by_type === 'company') {
          settlementStatus = 'settled';
        } else if (formData.paid_by_type === 'employee' && formData.settlement_status !== 'settled') {
          settlementStatus = 'pending_reimbursement';
        }
      }
      
      const payload = {
        ...formData,
        rate: formData.rate ? parseFloat(formData.rate) : null,
        quantity: formData.quantity ? parseFloat(formData.quantity) : null,
        amount: parseFloat(formData.amount),
        paid_amount: formData.payment_status === 'paid' ? parseFloat(formData.amount) : (formData.paid_amount ? parseFloat(formData.paid_amount) : 0),
        payment_status: formData.payment_status || 'pending',
        is_settled: formData.payment_status === 'paid' && formData.paid_by_type === 'company',
        paid_by_type: formData.paid_by_type,
        paid_by: paidByValue,
        paid_by_employee_id: formData.paid_by_employee_id,
        payment_date: formData.payment_date,
        payment_reference: formData.payment_reference,
        settlement_status: settlementStatus
      };
      
      if (editingExpense) {
        await api.put(`/api/expenses/variable/${editingExpense.id}`, payload);
        toast.success('Expense updated successfully');
      } else {
        await api.post('/api/expenses/variable', payload);
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
  
  // Handle payment details submission from modal
  const handlePaymentDetailsSubmit = () => {
    // Determine paid_by value
    let paidByValue = 'Company';
    if (paymentDetailsForm.paid_by_type === 'employee' && paymentDetailsForm.paid_by_employee_id) {
      const emp = staffUsers.find(u => u.id === paymentDetailsForm.paid_by_employee_id);
      paidByValue = emp?.name || emp?.email || paymentDetailsForm.paid_by_employee_id;
    }
    
    // Update form with payment details and submit
    setFormData(prev => ({
      ...prev,
      payment_mode: paymentDetailsForm.payment_mode,
      payment_date: paymentDetailsForm.payment_date,
      payment_reference: paymentDetailsForm.payment_reference,
      paid_by_type: paymentDetailsForm.paid_by_type,
      paid_by_employee_id: paymentDetailsForm.paid_by_employee_id,
      paid_by: paidByValue
    }));
    setShowPaymentDetailsModal(false);
    // Re-trigger submit with complete data
    setTimeout(() => handleSubmitFinal(), 100);
  };
  
  // Final submit after payment details
  const handleSubmitFinal = async () => {
    try {
      let paidByValue = 'Company';
      if (formData.paid_by_type === 'employee' && formData.paid_by_employee_id) {
        const emp = staffUsers.find(u => u.id === formData.paid_by_employee_id);
        paidByValue = emp?.name || emp?.email || formData.paid_by_employee_id;
      }
      
      // Settlement status: Company paid = settled, Employee paid = pending_reimbursement
      let settlementStatus = 'settled';
      let isSettled = true;
      if (formData.payment_status === 'paid' && formData.paid_by_type === 'employee') {
        settlementStatus = 'pending_reimbursement';
        isSettled = false;  // Not settled until company reimburses employee
      }
      
      const payload = {
        ...formData,
        rate: formData.rate ? parseFloat(formData.rate) : null,
        quantity: formData.quantity ? parseFloat(formData.quantity) : null,
        amount: parseFloat(formData.amount),
        paid_amount: formData.payment_status === 'paid' ? parseFloat(formData.amount) : (formData.paid_amount ? parseFloat(formData.paid_amount) : 0),
        payment_status: formData.payment_status || 'pending',
        is_settled: isSettled,
        paid_by_type: formData.paid_by_type,
        paid_by: paidByValue,
        paid_by_employee_id: formData.paid_by_employee_id,
        payment_date: formData.payment_date,
        payment_reference: formData.payment_reference,
        settlement_status: settlementStatus
      };
      
      if (editingExpense) {
        await api.put(`/api/expenses/variable/${editingExpense.id}`, payload);
        toast.success('Expense updated successfully');
      } else {
        await api.post('/api/expenses/variable', payload);
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

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    // Determine paid_by_type from existing data
    const isPaidByEmployee = expense.paid_by && expense.paid_by !== 'Company' && expense.paid_by !== 'Vendor';
    setFormData({
      date: expense.date?.split('T')[0] || '',
      category: expense.category || '',
      description: expense.description || '',
      rate: expense.rate?.toString() || '',
      quantity: expense.quantity?.toString() || '',
      amount: expense.amount?.toString() || '',
      paid_to: expense.paid_to || '',
      payment_mode: expense.payment_mode || 'Cash',
      receipt_no: expense.receipt_no || '',
      paid_by_type: expense.paid_by_type || (isPaidByEmployee ? 'employee' : 'company'),
      paid_by: expense.paid_by || 'Company',
      paid_by_employee_id: expense.paid_by_employee_id || '',
      payment_status: expense.payment_status || (expense.is_settled ? 'paid' : 'pending'),
      paid_amount: expense.paid_amount?.toString() || '',
      payment_date: expense.payment_date?.split('T')[0] || '',
      payment_reference: expense.payment_reference || '',
      settlement_status: expense.settlement_status || (isPaidByEmployee && !expense.is_settled ? 'pending_reimbursement' : 'settled'),
      settlement_date: expense.settlement_date?.split('T')[0] || '',
      settlement_remarks: expense.settlement_remarks || '',
      vertical: expense.vertical || 'all'
    });
    setShowAddDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    
    try {
      await api.delete(`/api/expenses/variable/${id}`);
      toast.success('Expense deleted');
      loadExpenses();
    } catch (error) {
      console.error('Delete expense error:', error);
      toast.error('Failed to delete expense');
    }
  };

  const handleBulkSettle = async () => {
    if (selectedExpenses.length === 0) {
      toast.error('Select expenses to settle');
      return;
    }
    
    try {
      await api.post('/api/expenses/variable/bulk-settle', {
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

  // View payment details
  const handleViewPayment = (expense) => {
    setViewingExpense(expense);
    setShowViewPaymentModal(true);
  };

  // Open reimbursement modal for a single expense
  const openReimbursementModal = (expense) => {
    setReimbursementExpense(expense);
    setReimbursementForm({
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Bank Transfer',
      payment_reference: '',
      remarks: ''
    });
    setShowReimbursementModal(true);
  };

  // Handle single expense reimbursement
  const handleReimbursementSubmit = async () => {
    if (!reimbursementExpense) return;
    
    try {
      // Only send the fields that need to be updated, not the entire expense object
      await api.put(`/api/expenses/variable/${reimbursementExpense.id}`, {
        settlement_status: 'settled',
        settlement_date: reimbursementForm.payment_date,
        settlement_mode: reimbursementForm.payment_mode,
        settlement_reference: reimbursementForm.payment_reference,
        settlement_remarks: reimbursementForm.remarks,
        is_settled: true
      });
      toast.success('Reimbursement recorded successfully');
      setShowReimbursementModal(false);
      setReimbursementExpense(null);
      loadExpenses();
    } catch (error) {
      console.error('Reimbursement error:', error);
      toast.error('Failed to record reimbursement');
    }
  };

  // Settle employee reimbursement (quick action)
  const handleSettleReimbursement = async (expense) => {
    try {
      // Only send the fields that need to be updated
      await api.put(`/api/expenses/variable/${expense.id}`, {
        settlement_status: 'settled',
        settlement_date: new Date().toISOString().split('T')[0],
        is_settled: true
      });
      toast.success('Reimbursement settled');
      setShowViewPaymentModal(false);
      loadExpenses();
    } catch (error) {
      console.error('Settlement error:', error);
      toast.error('Failed to settle reimbursement');
    }
  };

  // Get employees with pending reimbursements
  const getEmployeesWithPendingReimbursements = () => {
    const pending = expenses.filter(e => 
      e.payment_status === 'paid' && 
      e.paid_by_type === 'employee' && 
      e.settlement_status !== 'settled'
    );
    
    const byEmployee = {};
    pending.forEach(e => {
      const empName = e.paid_by || 'Unknown';
      if (!byEmployee[empName]) {
        byEmployee[empName] = { name: empName, expenses: [], total: 0 };
      }
      byEmployee[empName].expenses.push(e);
      byEmployee[empName].total += e.amount || 0;
    });
    
    return Object.values(byEmployee);
  };

  // Open bulk settlement modal for an employee
  const openBulkSettlementModal = (employee) => {
    setBulkSettlementEmployee(employee);
    setBulkSettlementExpenses(employee.expenses.map(e => e.id));
    setReimbursementForm({
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Bank Transfer',
      payment_reference: '',
      remarks: ''
    });
    setShowBulkSettlementModal(true);
  };

  // Handle bulk settlement
  const handleBulkSettlement = async () => {
    if (!bulkSettlementEmployee || bulkSettlementExpenses.length === 0) return;
    
    try {
      // Update all selected expenses - only send fields that need updating
      for (const expenseId of bulkSettlementExpenses) {
        await api.put(`/api/expenses/variable/${expenseId}`, {
          settlement_status: 'settled',
          settlement_date: reimbursementForm.payment_date,
          settlement_mode: reimbursementForm.payment_mode,
          settlement_reference: reimbursementForm.payment_reference,
          settlement_remarks: reimbursementForm.remarks,
          is_settled: true
        });
      }
      
      toast.success(`${bulkSettlementExpenses.length} expenses settled for ${bulkSettlementEmployee.name}`);
      setShowBulkSettlementModal(false);
      setBulkSettlementEmployee(null);
      setBulkSettlementExpenses([]);
      loadExpenses();
    } catch (error) {
      console.error('Bulk settlement error:', error);
      toast.error('Failed to settle expenses');
    }
  };

  const employeesWithPendingReimbursements = getEmployeesWithPendingReimbursements();

  const unsettledExpenses = expenses.filter(e => e.payment_status !== 'paid' && !e.is_settled);
  const pendingExpenses = expenses.filter(e => e.payment_status === 'pending');
  const partiallyPaidExpenses = expenses.filter(e => e.payment_status === 'partially_paid');
  const pendingReimbursementExpenses = expenses.filter(e => e.payment_status === 'paid' && e.paid_by_type === 'employee' && e.settlement_status !== 'settled');
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const unsettledAmount = unsettledExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const pendingReimbursementAmount = pendingReimbursementExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const paidAmount = expenses.filter(e => e.payment_status === 'paid' || e.is_settled).reduce((sum, e) => sum + (e.amount || 0), 0);
  
  // Group by category for summary
  const categoryTotals = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + (e.amount || 0);
    return acc;
  }, {});

  return (
    <Layout>
      <div data-testid="variable-expenses-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Variable Expenses</h1>
            <p className="text-sm text-gray-500">Track daily operational expenses</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadExpenses}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            {unsettledExpenses.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowSettlementDialog(true)}
                className="text-orange-600 border-orange-300"
              >
                <CheckCircle size={14} className="mr-1" /> Settle ({unsettledExpenses.length})
              </Button>
            )}
            <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} className="bg-[#14532D] hover:bg-[#166534]">
              <Plus size={14} className="mr-1" /> Add Expense
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Receipt className="text-blue-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Expenses</p>
                <p className="text-lg font-bold">₹{totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="text-orange-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Unsettled</p>
                <p className="text-lg font-bold text-orange-600">₹{unsettledAmount.toLocaleString()}</p>
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
              <div className="p-2 bg-purple-100 rounded-lg">
                <IndianRupee className="text-purple-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending Reimbursement</p>
                <p className="text-lg font-bold text-purple-600">₹{pendingReimbursementAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="text-yellow-600" size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Partially Paid</p>
                <p className="text-lg font-bold text-yellow-600">{partiallyPaidExpenses.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Pending Reimbursements by Employee */}
        {employeesWithPendingReimbursements.length > 0 && (
          <Card className="mb-4">
            <CardContent className="py-3">
              <h3 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
                <Users size={16} /> Pending Employee Reimbursements
              </h3>
              <div className="flex flex-wrap gap-2">
                {employeesWithPendingReimbursements.map(emp => (
                  <div 
                    key={emp.name}
                    className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2"
                  >
                    <div>
                      <span className="text-sm font-medium text-purple-800">{emp.name}</span>
                      <span className="text-xs text-purple-600 ml-2">({emp.expenses.length} items)</span>
                      <span className="text-sm font-bold text-purple-700 ml-2">₹{emp.total.toLocaleString()}</span>
                    </div>
                    <Button
                      size="sm"
                      className="h-7 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={() => openBulkSettlementModal(emp)}
                    >
                      <IndianRupee size={12} className="mr-1" /> Settle All
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-3 items-end">
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Status</label>
                <Select value={filterSettled} onValueChange={setFilterSettled}>
                  <SelectTrigger className="w-32 h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Settled</SelectItem>
                    <SelectItem value="false">Unsettled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Paid By</label>
                <Select value={filterPaidBy} onValueChange={setFilterPaidBy}>
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Company">Company</SelectItem>
                    {staffUsers.map(user => (
                      <SelectItem key={user.id} value={user.name}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterCategory('all'); setFilterSettled('all'); setFilterPaidBy('all'); }}
              >
                Clear
              </Button>
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
                      <th className="p-2 text-left text-xs font-medium text-gray-500">DATE</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">CATEGORY</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">DESCRIPTION</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">RATE</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">QTY</th>
                      <th className="p-2 text-right text-xs font-medium text-gray-500">AMOUNT</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">VERTICAL</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">PAID TO</th>
                      <th className="p-2 text-left text-xs font-medium text-gray-500">PAID BY</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">STATUS</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">SETTLEMENT</th>
                      <th className="p-2 text-center text-xs font-medium text-gray-500">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="p-8 text-center text-gray-500">
                          No expenses found. Click "Add Expense" to get started.
                        </td>
                      </tr>
                    ) : (
                      expenses.map((expense) => {
                        const statusConfig = PAYMENT_STATUS_OPTIONS.find(s => s.value === expense.payment_status) || PAYMENT_STATUS_OPTIONS[0];
                        // Show checkbox for: unpaid expenses OR employee-paid expenses pending reimbursement
                        const isPendingReimbursement = expense.payment_status === 'paid' && 
                          expense.paid_by_type === 'employee' && 
                          expense.settlement_status !== 'settled';
                        const showCheckbox = (expense.payment_status !== 'paid' && !expense.is_settled) || isPendingReimbursement;
                        return (
                        <tr key={expense.id} className={`border-b hover:bg-gray-50 ${showCheckbox ? 'bg-orange-50' : ''}`}>
                          <td className="p-2">
                            {showCheckbox && (
                              <Checkbox 
                                checked={selectedExpenses.includes(expense.id)}
                                onCheckedChange={() => toggleExpenseSelection(expense.id)}
                              />
                            )}
                          </td>
                          <td className="p-2 text-xs">
                            {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{expense.category}</span>
                          </td>
                          <td className="p-2 text-xs max-w-[150px] truncate">{expense.description || '-'}</td>
                          <td className="p-2 text-right text-xs text-gray-600">{expense.rate ? `₹${expense.rate.toLocaleString()}` : '-'}</td>
                          <td className="p-2 text-right text-xs text-gray-600">{expense.quantity || '-'}</td>
                          <td className="p-2 text-right font-medium">₹{expense.amount?.toLocaleString()}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              expense.vertical === 'qc' ? 'bg-blue-100 text-blue-700' :
                              expense.vertical === 'retail' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {expense.vertical === 'qc' ? 'QC' : expense.vertical === 'retail' ? 'Retail' : 'All'}
                            </span>
                          </td>
                          <td className="p-2 text-xs">{expense.paid_to || '-'}</td>
                          <td className="p-2 text-xs">
                            <span className={`px-2 py-0.5 rounded ${
                              expense.paid_by === 'Company' || !expense.paid_by 
                                ? 'bg-blue-50 text-blue-700' 
                                : 'bg-purple-50 text-purple-700'
                            }`}>
                              {expense.paid_by || 'Company'}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${statusConfig.color}`}>
                              {expense.payment_status === 'paid' || expense.is_settled ? <CheckCircle size={10} /> : 
                               expense.payment_status === 'partially_paid' ? <AlertCircle size={10} /> : <Clock size={10} />}
                              {statusConfig.label}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            {expense.payment_status === 'paid' && expense.paid_by_type === 'employee' ? (
                              expense.settlement_status === 'settled' ? (
                                <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Settled</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">Pending</span>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-5 w-5 p-0"
                                    onClick={() => openReimbursementModal(expense)}
                                    title="Record Reimbursement"
                                  >
                                    <IndianRupee size={12} className="text-green-600" />
                                  </Button>
                                </div>
                              )
                            ) : expense.payment_status === 'paid' ? (
                              <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Settled</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {expense.payment_status === 'paid' && (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleViewPayment(expense)} title="View Payment">
                                  <Eye size={12} className="text-green-600" />
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
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Summary */}
        {Object.keys(categoryTotals).length > 0 && (
          <Card className="mt-4">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                  <div key={cat} className="p-2 bg-gray-50 rounded text-center">
                    <p className="text-xs text-gray-500">{cat}</p>
                    <p className="font-semibold text-sm">₹{total.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add Variable Expense'}</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Date *</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Category *</label>
                  <Select value={formData.category} onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Description</label>
                <Input
                  placeholder="Brief description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              
              {/* Rate × Quantity = Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Rate (₹)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.rate}
                    onChange={(e) => {
                      const rate = e.target.value;
                      const qty = formData.quantity;
                      const calculatedAmount = rate && qty ? (parseFloat(rate) * parseFloat(qty)).toFixed(2) : formData.amount;
                      setFormData(prev => ({ ...prev, rate, amount: calculatedAmount }));
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Quantity</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.quantity}
                    onChange={(e) => {
                      const qty = e.target.value;
                      const rate = formData.rate;
                      const calculatedAmount = rate && qty ? (parseFloat(rate) * parseFloat(qty)).toFixed(2) : formData.amount;
                      setFormData(prev => ({ ...prev, quantity: qty, amount: calculatedAmount }));
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Amount (₹) *</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    className="h-8 text-sm font-semibold bg-gray-50"
                  />
                  {formData.rate && formData.quantity && (
                    <p className="text-[10px] text-gray-400 mt-0.5">= {formData.rate} × {formData.quantity}</p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Payment Mode</label>
                  <Select value={formData.payment_mode} onValueChange={(v) => setFormData(prev => ({ ...prev, payment_mode: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map(mode => (
                        <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Payment Status *</label>
                  <Select value={formData.payment_status} onValueChange={(v) => setFormData(prev => ({ ...prev, payment_status: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Partially Paid - show paid amount */}
              {formData.payment_status === 'partially_paid' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Amount Paid (₹)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.paid_amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, paid_amount: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  {formData.amount && formData.paid_amount && (
                    <p className="text-[10px] text-orange-600 mt-0.5">
                      Balance: ₹{(parseFloat(formData.amount) - parseFloat(formData.paid_amount)).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Paid To</label>
                  <Input
                    placeholder="Vendor/Person name"
                    value={formData.paid_to}
                    onChange={(e) => setFormData(prev => ({ ...prev, paid_to: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Receipt/Bill No</label>
                  <Input
                    placeholder="Optional"
                    value={formData.receipt_no}
                    onChange={(e) => setFormData(prev => ({ ...prev, receipt_no: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              
              {/* Vertical Allocation */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Vertical Incurred For? *</label>
                <Select value={formData.vertical} onValueChange={(v) => setFormData(prev => ({ ...prev, vertical: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select Vertical" />
                  </SelectTrigger>
                  <SelectContent>
                    {VERTICAL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  {formData.vertical === 'all' && 'Expense will be split equally between QC and Retail'}
                  {formData.vertical === 'qc' && 'Expense will be allocated only to QC vertical'}
                  {formData.vertical === 'retail' && 'Expense will be allocated only to Retail vertical'}
                </p>
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

        {/* Payment Details Modal - shown when marking expense as Paid */}
        {showPaymentDetailsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Mode *</label>
                  <Select value={paymentDetailsForm.payment_mode} onValueChange={(v) => setPaymentDetailsForm(prev => ({ ...prev, payment_mode: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reference / Transaction ID</label>
                  <Input
                    placeholder="Enter reference number"
                    value={paymentDetailsForm.payment_reference}
                    onChange={(e) => setPaymentDetailsForm(prev => ({ ...prev, payment_reference: e.target.value }))}
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
                      />
                      <span className="text-sm">Company</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio"
                        checked={paymentDetailsForm.paid_by_type === 'employee'}
                        onChange={() => setPaymentDetailsForm(prev => ({ ...prev, paid_by_type: 'employee' }))}
                        className="w-4 h-4 text-green-600"
                      />
                      <span className="text-sm">Employee</span>
                    </label>
                  </div>
                  {paymentDetailsForm.paid_by_type === 'employee' && (
                    <Select 
                      value={paymentDetailsForm.paid_by_employee_id} 
                      onValueChange={(v) => setPaymentDetailsForm(prev => ({ ...prev, paid_by_employee_id: v }))}
                    >
                      <SelectTrigger>
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
                <Button variant="outline" className="flex-1" onClick={() => setShowPaymentDetailsModal(false)}>
                  Cancel
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handlePaymentDetailsSubmit}>
                  <CheckCircle size={14} className="mr-1" /> Confirm Payment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* View Payment Modal */}
        {showViewPaymentModal && viewingExpense && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-4 border-b bg-blue-50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Eye size={20} className="text-blue-600" />
                  Payment Details
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {/* Expense Summary */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Category:</span>
                    <span className="font-medium">{viewingExpense.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Description:</span>
                    <span className="font-medium">{viewingExpense.description || '-'}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-bold text-lg">₹{viewingExpense.amount?.toFixed(2)}</span>
                  </div>
                </div>
                
                {/* Payment Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">Payment Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-green-50 p-2 rounded">
                      <span className="text-gray-600 block text-xs">Payment Mode</span>
                      <span className="font-medium">{viewingExpense.payment_mode || 'Cash'}</span>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                      <span className="text-gray-600 block text-xs">Payment Date</span>
                      <span className="font-medium">{viewingExpense.payment_date?.split('T')[0] || viewingExpense.date?.split('T')[0]}</span>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                      <span className="text-gray-600 block text-xs">Paid By</span>
                      <span className={`font-medium ${viewingExpense.paid_by === 'Company' ? 'text-blue-600' : 'text-purple-600'}`}>
                        {viewingExpense.paid_by || 'Company'}
                      </span>
                    </div>
                    {viewingExpense.payment_reference && (
                      <div className="bg-green-50 p-2 rounded">
                        <span className="text-gray-600 block text-xs">Reference</span>
                        <span className="font-medium">{viewingExpense.payment_reference}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Settlement Status for Employee Paid */}
                {viewingExpense.paid_by_type === 'employee' && (
                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Reimbursement Status:</span>
                      {viewingExpense.settlement_status === 'settled' ? (
                        <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700">Settled</span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-sm bg-amber-100 text-amber-700">Pending Reimbursement</span>
                      )}
                    </div>
                    {viewingExpense.settlement_status !== 'settled' && (
                      <Button 
                        className="w-full mt-3 bg-green-600 hover:bg-green-700"
                        onClick={() => handleSettleReimbursement(viewingExpense)}
                      >
                        <CheckCircle size={14} className="mr-1" /> Mark as Settled
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowViewPaymentModal(false)}>
                  Close
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { setShowViewPaymentModal(false); handleEdit(viewingExpense); }}>
                  <Edit2 size={14} className="mr-1" /> Edit
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Reimbursement Modal - Single Expense */}
        {showReimbursementModal && reimbursementExpense && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-4 border-b bg-purple-50">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <IndianRupee size={20} className="text-purple-600" />
                  Record Reimbursement
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Reimburse {reimbursementExpense.paid_by} for ₹{reimbursementExpense.amount?.toLocaleString()}
                </p>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Category:</span>
                    <span className="font-medium">{reimbursementExpense.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Description:</span>
                    <span className="font-medium">{reimbursementExpense.description || '-'}</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reimbursement Date *</label>
                  <Input
                    type="date"
                    value={reimbursementForm.payment_date}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Mode *</label>
                  <Select value={reimbursementForm.payment_mode} onValueChange={(v) => setReimbursementForm(prev => ({ ...prev, payment_mode: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reference / Transaction ID</label>
                  <Input
                    value={reimbursementForm.payment_reference}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                    placeholder="Enter reference number"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Remarks</label>
                  <Input
                    value={reimbursementForm.remarks}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <div className="p-4 border-t flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setShowReimbursementModal(false); setReimbursementExpense(null); }}>
                  Cancel
                </Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={handleReimbursementSubmit}>
                  <CheckCircle size={14} className="mr-1" /> Confirm Reimbursement
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Settlement Modal */}
        {showBulkSettlementModal && bulkSettlementEmployee && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="p-4 border-b bg-purple-50 flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Users size={20} className="text-purple-600" />
                  Settle Expenses for {bulkSettlementEmployee.name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {bulkSettlementEmployee.expenses.length} expenses totaling ₹{bulkSettlementEmployee.total.toLocaleString()}
                </p>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Expense List */}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {bulkSettlementEmployee.expenses.map((expense, idx) => (
                    <div key={expense.id} className="flex items-center justify-between bg-gray-50 p-2 rounded text-sm">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={bulkSettlementExpenses.includes(expense.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBulkSettlementExpenses(prev => [...prev, expense.id]);
                            } else {
                              setBulkSettlementExpenses(prev => prev.filter(id => id !== expense.id));
                            }
                          }}
                          className="w-4 h-4"
                        />
                        <div>
                          <span className="font-medium">{expense.category}</span>
                          <span className="text-gray-500 ml-2 text-xs">{expense.date?.split('T')[0]}</span>
                        </div>
                      </div>
                      <span className="font-semibold">₹{expense.amount?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Selected Items:</span>
                    <span className="font-medium">{bulkSettlementExpenses.length} / {bulkSettlementEmployee.expenses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Total to Reimburse:</span>
                    <span className="font-bold text-lg text-purple-700">
                      ₹{bulkSettlementEmployee.expenses
                        .filter(e => bulkSettlementExpenses.includes(e.id))
                        .reduce((s, e) => s + (e.amount || 0), 0)
                        .toLocaleString()}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reimbursement Date *</label>
                  <Input
                    type="date"
                    value={reimbursementForm.payment_date}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Mode *</label>
                  <Select value={reimbursementForm.payment_mode} onValueChange={(v) => setReimbursementForm(prev => ({ ...prev, payment_mode: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reference / Transaction ID</label>
                  <Input
                    value={reimbursementForm.payment_reference}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                    placeholder="Enter reference number"
                  />
                </div>
              </div>
              <div className="p-4 border-t flex gap-2 flex-shrink-0">
                <Button variant="outline" className="flex-1" onClick={() => { setShowBulkSettlementModal(false); setBulkSettlementEmployee(null); }}>
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-purple-600 hover:bg-purple-700" 
                  onClick={handleBulkSettlement}
                  disabled={bulkSettlementExpenses.length === 0}
                >
                  <CheckCircle size={14} className="mr-1" /> Settle {bulkSettlementExpenses.length} Expenses
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
