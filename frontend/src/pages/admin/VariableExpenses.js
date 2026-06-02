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
  const [retailers, setRetailers] = useState([]); // Retailers for retail vertical
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
  const [filterPaidTo, setFilterPaidTo] = useState('all'); // Filter for Paid To (vendor)
  
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
    vertical: 'all', // 'all', 'qc', or 'retail'
    retailer_id: '' // For retail-specific expenses
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
    amount: 0,  // Amount being reimbursed
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'Bank Transfer',
    payment_reference: '',
    remarks: '',
    custom_amount: ''  // For editable reimbursement amount
  });
  
  // Bulk Settlement state
  const [showBulkSettlementModal, setShowBulkSettlementModal] = useState(false);
  const [bulkSettlementEmployee, setBulkSettlementEmployee] = useState(null);
  const [bulkSettlementExpenses, setBulkSettlementExpenses] = useState([]);
  
  // Vendor Bulk Payment state (new - like Procurement)
  const [showVendorPaymentModal, setShowVendorPaymentModal] = useState(false);
  const [vendorPaymentForm, setVendorPaymentForm] = useState({
    payment_mode: 'Cash',
    reference: '',
    remarks: '',
    custom_amount: ''
  });
  const [selectedVendorForPayment, setSelectedVendorForPayment] = useState(null);
  const [vendorsWithPending, setVendorsWithPending] = useState([]);

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
      if (filterPaidTo !== 'all') params.append('paid_to', filterPaidTo);
      
      if (params.toString()) url += '?' + params.toString();
      
      const response = await api.get(url);
      setExpenses(response.data);
    } catch (error) {
      console.error('Load expenses error:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [filterDateFrom, filterDateTo, filterCategory, filterSettled, filterPaidBy, filterPaidTo]);

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
      const response = await api.get('/api/employees');
      setStaffUsers(response.data || []);
    } catch (error) {
      console.error('Failed to load staff users:', error);
      setStaffUsers([]);
    }
  };

  // Load Retailers for retail vertical dropdown
  const loadRetailers = async () => {
    try {
      const response = await api.get('/api/retailers');
      setRetailers(response.data || []);
    } catch (error) {
      console.error('Failed to load retailers:', error);
      setRetailers([]);
    }
  };

  useEffect(() => {
    loadExpenses();
    loadEmployees();
    loadStaffUsers();
    loadRetailers();
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
      vertical: 'all',
      retailer_id: ''
    });
    setEditingExpense(null);
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.amount) {
      toast.error('Category and Amount are required');
      return;
    }
    
    // Validate Paid To is mandatory
    if (!formData.paid_to?.trim()) {
      toast.error('Paid To (Vendor/Person name) is required');
      return;
    }
    
    // Validate transaction reference for non-cash payments
    if (formData.payment_mode !== 'Cash' && !formData.payment_reference?.trim()) {
      toast.error('Transaction Reference is required for non-cash payments');
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
        settlement_status: settlementStatus,
        retailer_id: formData.vertical === 'retail' ? formData.retailer_id : null
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
    // Calculate remaining amount to reimburse
    const totalReimbursed = expense.total_reimbursed || 0;
    const remainingAmount = expense.amount - totalReimbursed;
    
    setReimbursementExpense(expense);
    setReimbursementForm({
      amount: remainingAmount,  // Pre-fill with remaining amount
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
    
    const reimbursementAmount = parseFloat(reimbursementForm.amount) || 0;
    if (reimbursementAmount <= 0) {
      toast.error('Please enter a valid reimbursement amount');
      return;
    }
    
    const totalReimbursed = (reimbursementExpense.total_reimbursed || 0) + reimbursementAmount;
    const expenseTotal = reimbursementExpense.amount || 0;
    
    // Determine settlement status based on total reimbursed vs expense amount
    let settlementStatus = 'partial';
    if (totalReimbursed >= expenseTotal) {
      settlementStatus = 'settled';
    }
    
    try {
      await api.put(`/api/expenses/variable/${reimbursementExpense.id}`, {
        settlement_status: settlementStatus,
        settlement_date: reimbursementForm.payment_date,
        settlement_mode: reimbursementForm.payment_mode,
        settlement_reference: reimbursementForm.payment_reference,
        settlement_remarks: reimbursementForm.remarks,
        total_reimbursed: totalReimbursed,
        last_reimbursement_amount: reimbursementAmount,
        is_settled: settlementStatus === 'settled'
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
  // Note: We only check paid_by_type and settlement_status, NOT payment_status
  // Because when an employee pays for an expense, the vendor is effectively paid by the employee
  // We need to reimburse the employee regardless of the payment_status field
  const getEmployeesWithPendingReimbursements = () => {
    const pending = expenses.filter(e => 
      e.paid_by_type === 'employee' && 
      e.settlement_status !== 'settled'
    );
    
    const byEmployee = {};
    pending.forEach(e => {
      const empName = e.paid_by || 'Unknown';
      if (!byEmployee[empName]) {
        byEmployee[empName] = { name: empName, expenses: [], total: 0, totalReimbursed: 0 };
      }
      byEmployee[empName].expenses.push(e);
      byEmployee[empName].total += e.amount || 0;
      byEmployee[empName].totalReimbursed += e.total_reimbursed || 0;
    });
    
    return Object.values(byEmployee);
  };

  // Open bulk settlement modal for an employee
  const openBulkSettlementModal = (employee) => {
    // Calculate remaining amount for each expense (total - already reimbursed)
    const employeeWithRemaining = {
      ...employee,
      expenses: employee.expenses.map(e => ({
        ...e,
        remaining_amount: (e.amount || 0) - (e.total_reimbursed || 0)
      })).filter(e => e.remaining_amount > 0),  // Only show expenses with remaining amount
      total_remaining: employee.expenses.reduce((sum, e) => sum + ((e.amount || 0) - (e.total_reimbursed || 0)), 0)
    };
    
    setBulkSettlementEmployee(employeeWithRemaining);
    setBulkSettlementExpenses([]);  // No longer using checkboxes
    setReimbursementForm({
      payment_date: new Date().toISOString().split('T')[0],
      payment_mode: 'Bank Transfer',
      payment_reference: '',
      remarks: '',
      custom_amount: ''
    });
    setShowBulkSettlementModal(true);
  };

  // Handle bulk settlement (employee reimbursement with auto-allocation)
  const handleBulkSettlement = async () => {
    if (!bulkSettlementEmployee) return;
    
    // Validate transaction reference for non-cash payments
    if (reimbursementForm.payment_mode !== 'Cash' && !reimbursementForm.payment_reference?.trim()) {
      toast.error('Transaction Reference is required for non-cash payments');
      return;
    }
    
    const reimbursementAmount = reimbursementForm.custom_amount 
      ? parseFloat(reimbursementForm.custom_amount) 
      : bulkSettlementEmployee.total_remaining;
    
    if (reimbursementAmount <= 0) {
      toast.error('Reimbursement amount must be greater than 0');
      return;
    }
    
    try {
      // Sort expenses by date (oldest first)
      const sortedExpenses = [...bulkSettlementEmployee.expenses].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );
      
      let remainingReimbursement = reimbursementAmount;
      const settlementReference = reimbursementForm.payment_reference || `REIMB-${Date.now()}`;
      let settledCount = 0;
      let partialCount = 0;
      
      for (const expense of sortedExpenses) {
        if (remainingReimbursement <= 0) break;
        
        const expenseRemaining = expense.remaining_amount || ((expense.amount || 0) - (expense.total_reimbursed || 0));
        const reimburseAmount = Math.min(remainingReimbursement, expenseRemaining);
        
        if (reimburseAmount > 0) {
          const newTotalReimbursed = (expense.total_reimbursed || 0) + reimburseAmount;
          const isFullySettled = Math.abs(newTotalReimbursed - expense.amount) < 0.01;
          
          await api.put(`/api/expenses/variable/${expense.id}`, {
            total_reimbursed: newTotalReimbursed,
            settlement_status: isFullySettled ? 'settled' : 'partial_reimbursement',
            settlement_date: reimbursementForm.payment_date,
            settlement_mode: reimbursementForm.payment_mode,
            settlement_reference: settlementReference,
            settlement_remarks: reimbursementForm.remarks,
            is_settled: isFullySettled
          });
          
          if (isFullySettled) settledCount++;
          else partialCount++;
          
          remainingReimbursement -= reimburseAmount;
        }
      }
      
      let successMsg = `Reimbursed ₹${reimbursementAmount.toFixed(2)} to ${bulkSettlementEmployee.name}. `;
      if (settledCount > 0) successMsg += `${settledCount} fully settled. `;
      if (partialCount > 0) successMsg += `${partialCount} partially settled.`;
      
      toast.success(successMsg);
      setShowBulkSettlementModal(false);
      setBulkSettlementEmployee(null);
      setBulkSettlementExpenses([]);
      loadExpenses();
    } catch (error) {
      console.error('Bulk settlement error:', error);
      toast.error('Failed to settle expenses');
    }
  };

  // Calculate vendors/employees with pending payments
  const getVendorsWithPendingPayments = useCallback(() => {
    const vendorMap = {};
    expenses.forEach(expense => {
      if (expense.payment_status !== 'paid') {
        const vendorKey = expense.paid_to || 'Unknown';
        if (!vendorMap[vendorKey]) {
          vendorMap[vendorKey] = {
            name: vendorKey,
            expenses: [],
            total_pending: 0
          };
        }
        const pending = (expense.amount || 0) - (expense.paid_amount || 0);
        if (pending > 0) {
          vendorMap[vendorKey].expenses.push(expense);
          vendorMap[vendorKey].total_pending += pending;
        }
      }
    });
    return Object.values(vendorMap).filter(v => v.total_pending > 0).sort((a, b) => b.total_pending - a.total_pending);
  }, [expenses]);

  // Open vendor payment modal
  const openVendorPaymentModal = () => {
    const vendors = getVendorsWithPendingPayments();
    setVendorsWithPending(vendors);
    setSelectedVendorForPayment(null);
    setVendorPaymentForm({
      payment_mode: 'Cash',
      reference: '',
      remarks: '',
      custom_amount: ''
    });
    setShowVendorPaymentModal(true);
  };

  // Handle vendor bulk payment
  const handleVendorBulkPayment = async () => {
    if (!selectedVendorForPayment) {
      toast.error('Please select a vendor');
      return;
    }

    // Validate transaction reference for non-cash payments
    if (vendorPaymentForm.payment_mode !== 'Cash' && !vendorPaymentForm.reference?.trim()) {
      toast.error('Transaction Reference is required for non-cash payments');
      return;
    }

    const paymentAmount = vendorPaymentForm.custom_amount 
      ? parseFloat(vendorPaymentForm.custom_amount) 
      : selectedVendorForPayment.total_pending;

    if (paymentAmount <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }

    try {
      // Sort expenses by date (oldest first)
      const sortedExpenses = [...selectedVendorForPayment.expenses].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      let remainingPayment = paymentAmount;
      const paymentReference = vendorPaymentForm.reference || `BULK-VE-${Date.now()}`;
      let updatedCount = 0;
      let partialCount = 0;

      for (const expense of sortedExpenses) {
        if (remainingPayment <= 0) break;

        const currentPending = (expense.amount || 0) - (expense.paid_amount || 0);
        const payAmount = Math.min(remainingPayment, currentPending);

        if (payAmount > 0) {
          const newPaidAmount = (expense.paid_amount || 0) + payAmount;
          const isFullyPaid = Math.abs(newPaidAmount - expense.amount) < 0.01;

          await api.put(`/api/expenses/variable/${expense.id}`, {
            paid_amount: newPaidAmount,
            payment_status: isFullyPaid ? 'paid' : 'partially_paid',
            payment_date: new Date().toISOString().split('T')[0],
            payment_mode: vendorPaymentForm.payment_mode,
            payment_reference: paymentReference,
            is_settled: isFullyPaid,
            settlement_status: isFullyPaid ? 'settled' : expense.settlement_status
          });

          if (isFullyPaid) updatedCount++;
          else partialCount++;
          
          remainingPayment -= payAmount;
        }
      }

      let successMsg = `Payment of ₹${paymentAmount.toFixed(2)} recorded for ${selectedVendorForPayment.name}. `;
      if (updatedCount > 0) successMsg += `${updatedCount} fully paid. `;
      if (partialCount > 0) successMsg += `${partialCount} partially paid.`;

      toast.success(successMsg);
      setShowVendorPaymentModal(false);
      setSelectedVendorForPayment(null);
      setVendorPaymentForm({ payment_mode: 'Cash', reference: '', remarks: '', custom_amount: '' });
      loadExpenses();
    } catch (error) {
      console.error('Vendor bulk payment error:', error);
      toast.error('Failed to record payment');
    }
  };

  const employeesWithPendingReimbursements = getEmployeesWithPendingReimbursements();

  const unsettledExpenses = expenses.filter(e => e.payment_status !== 'paid' && !e.is_settled);
  const pendingExpenses = expenses.filter(e => e.payment_status === 'pending');
  const partiallyPaidExpenses = expenses.filter(e => e.payment_status === 'partially_paid');
  // Pending reimbursement = any expense paid by an employee that hasn't been settled yet
  // We don't check payment_status because when employee pays, the vendor is effectively paid
  const pendingReimbursementExpenses = expenses.filter(e => e.paid_by_type === 'employee' && e.settlement_status !== 'settled');
  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const unsettledAmount = unsettledExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  // Calculate remaining reimbursement amount (total - already reimbursed)
  const pendingReimbursementAmount = pendingReimbursementExpenses.reduce((sum, e) => sum + ((e.amount || 0) - (e.total_reimbursed || 0)), 0);
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
            {getVendorsWithPendingPayments().length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={openVendorPaymentModal}
                className="text-purple-600 border-purple-300"
                data-testid="settle-payments-btn"
              >
                <IndianRupee size={14} className="mr-1" /> Settle
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
                {employeesWithPendingReimbursements.map(emp => {
                  const remainingAmount = emp.total - emp.totalReimbursed;
                  return (
                    <div 
                      key={emp.name}
                      className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2"
                    >
                      <div>
                        <span className="text-sm font-medium text-purple-800">{emp.name}</span>
                        <span className="text-xs text-purple-600 ml-2">({emp.expenses.length} items)</span>
                        <span className="text-sm font-bold text-purple-700 ml-2">₹{remainingAmount.toLocaleString()}</span>
                        {emp.totalReimbursed > 0 && (
                          <span className="text-xs text-green-600 ml-1">(₹{emp.totalReimbursed.toLocaleString()} paid)</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="h-7 bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => openBulkSettlementModal(emp)}
                      >
                        <IndianRupee size={12} className="mr-1" /> Settle All
                      </Button>
                    </div>
                  );
                })}
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Paid To</label>
                <Input
                  type="text"
                  placeholder="Vendor name..."
                  value={filterPaidTo === 'all' ? '' : filterPaidTo}
                  onChange={(e) => setFilterPaidTo(e.target.value || 'all')}
                  className="w-36 h-8 text-sm"
                />
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterCategory('all'); setFilterSettled('all'); setFilterPaidBy('all'); setFilterPaidTo('all'); }}
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
                        // For employee-paid expenses, we don't require payment_status === 'paid'
                        const isPendingReimbursement = expense.paid_by_type === 'employee' && 
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
                            {expense.paid_by_type === 'employee' ? (
                              expense.settlement_status === 'settled' ? (
                                <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Settled</span>
                              ) : expense.settlement_status === 'partial' ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">Partial</span>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-5 w-5 p-0"
                                      onClick={() => openReimbursementModal(expense)}
                                      title="Record More Reimbursement"
                                    >
                                      <IndianRupee size={12} className="text-green-600" />
                                    </Button>
                                  </div>
                                  <span className="text-[10px] text-gray-500">
                                    ₹{(expense.total_reimbursed || 0).toLocaleString()} / ₹{expense.amount?.toLocaleString()}
                                  </span>
                                </div>
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
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Paid To (Vendor) *</label>
                  <Input
                    placeholder="Vendor/Person name"
                    value={formData.paid_to}
                    onChange={(e) => setFormData(prev => ({ ...prev, paid_to: e.target.value }))}
                    className={`h-8 text-sm ${!formData.paid_to?.trim() ? 'border-orange-300' : ''}`}
                    data-testid="paid-to-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Transaction Ref {formData.payment_mode !== 'Cash' && <span className="text-red-500">*</span>}
                  </label>
                  <Input
                    placeholder={formData.payment_mode === 'Cash' ? "Optional for cash" : "Transaction ID required"}
                    value={formData.payment_reference}
                    onChange={(e) => setFormData(prev => ({ ...prev, payment_reference: e.target.value }))}
                    className={`h-8 text-sm ${formData.payment_mode !== 'Cash' && !formData.payment_reference?.trim() ? 'border-orange-300' : ''}`}
                    data-testid="payment-reference-input"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
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
                <Select value={formData.vertical} onValueChange={(v) => setFormData(prev => ({ ...prev, vertical: v, retailer_id: '' }))}>
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
              
              {/* Retailer Selection - Only shown when vertical is 'retail' */}
              {formData.vertical === 'retail' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Retailer</label>
                  <Select value={formData.retailer_id} onValueChange={(v) => setFormData(prev => ({ ...prev, retailer_id: v }))}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select Retailer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Retailers</SelectItem>
                      {retailers.map(retailer => (
                        <SelectItem key={retailer.id} value={retailer.id}>
                          {retailer.company_name || retailer.name || retailer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400 mt-1">
                    Select specific retailer or "All Retailers" for general retail expense
                  </p>
                </div>
              )}
              
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
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="p-4 border-b bg-blue-50 flex-shrink-0">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Eye size={20} className="text-blue-600" />
                  Expense Details
                </h3>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
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
                  <div className="flex justify-between">
                    <span className="text-gray-600">Paid To:</span>
                    <span className="font-medium">{viewingExpense.paid_to || '-'}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-bold text-lg">₹{viewingExpense.amount?.toFixed(2)}</span>
                  </div>
                </div>
                
                {/* Payment History Section */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                    <Clock size={14} /> Payment History
                  </h4>
                  <div className="space-y-2">
                    {/* Original Payment */}
                    <div className="bg-white border border-green-100 rounded p-2 text-xs">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-green-700">₹{(viewingExpense.amount || 0).toFixed(2)}</span>
                        <span className="text-gray-500 uppercase text-[10px] bg-gray-100 px-1 rounded">{viewingExpense.payment_mode || 'Cash'}</span>
                        {viewingExpense.paid_by_type === 'employee' ? (
                          <span className="text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                            EMPLOYEE PAID
                          </span>
                        ) : (
                          <span className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                            COMPANY PAID
                          </span>
                        )}
                      </div>
                      {viewingExpense.payment_reference && (
                        <div className="text-blue-700 font-medium mb-1">
                          Ref #: {viewingExpense.payment_reference}
                        </div>
                      )}
                      <div className="text-gray-600">
                        <span>Paid on: {viewingExpense.payment_date?.split('T')[0] || viewingExpense.date?.split('T')[0]}</span>
                        <span className="ml-2">by <strong className={viewingExpense.paid_by_type === 'employee' ? 'text-purple-700' : 'text-blue-700'}>
                          {viewingExpense.paid_by || 'Company'}
                        </strong></span>
                      </div>
                    </div>
                    
                    {/* Settlement/Reimbursement Record */}
                    {viewingExpense.paid_by_type === 'employee' && (
                      <>
                        {viewingExpense.settlement_status === 'settled' && (
                          <div className="bg-white border border-blue-100 rounded p-2 text-xs">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-blue-700">₹{(viewingExpense.total_reimbursed || viewingExpense.amount || 0).toFixed(2)}</span>
                              <span className="text-gray-500 uppercase text-[10px] bg-gray-100 px-1 rounded">{viewingExpense.settlement_mode || 'Bank Transfer'}</span>
                              <span className="text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                REIMBURSED
                              </span>
                            </div>
                            {viewingExpense.settlement_reference && (
                              <div className="text-blue-700 font-medium mb-1">
                                Ref #: {viewingExpense.settlement_reference}
                              </div>
                            )}
                            {viewingExpense.settlement_remarks && (
                              <div className="text-gray-600 italic mb-1">
                                "{viewingExpense.settlement_remarks}"
                              </div>
                            )}
                            <div className="text-gray-600">
                              <span>Settled on: {viewingExpense.settlement_date?.split('T')[0]}</span>
                              <span className="ml-2">to <strong className="text-blue-700">{viewingExpense.paid_by}</strong></span>
                            </div>
                          </div>
                        )}
                        
                        {viewingExpense.settlement_status === 'partial' && (
                          <div className="bg-white border border-orange-100 rounded p-2 text-xs">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-orange-700">₹{(viewingExpense.total_reimbursed || 0).toFixed(2)}</span>
                              <span className="text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                PARTIAL REIMBURSEMENT
                              </span>
                            </div>
                            <div className="text-gray-600">
                              <span>Remaining: ₹{((viewingExpense.amount || 0) - (viewingExpense.total_reimbursed || 0)).toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                        
                        {(viewingExpense.settlement_status === 'pending_reimbursement' || !viewingExpense.settlement_status || viewingExpense.settlement_status === 'pending') && (
                          <div className="bg-orange-50 border border-orange-200 rounded p-2 text-xs">
                            <span className="text-orange-700 font-medium">⏳ Reimbursement pending to {viewingExpense.paid_by}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {/* Settle Button for Employee Paid Expenses */}
                {viewingExpense.paid_by_type === 'employee' && viewingExpense.settlement_status !== 'settled' && (
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    onClick={() => { setShowViewPaymentModal(false); openReimbursementModal(viewingExpense); }}
                  >
                    <IndianRupee size={14} className="mr-1" /> Record Reimbursement
                  </Button>
                )}
              </div>
              <div className="p-4 border-t flex gap-2 flex-shrink-0">
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
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Description:</span>
                    <span className="font-medium">{reimbursementExpense.description || '-'}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="font-medium">₹{reimbursementExpense.amount?.toLocaleString()}</span>
                  </div>
                  {(reimbursementExpense.total_reimbursed || 0) > 0 && (
                    <>
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-600">Already Reimbursed:</span>
                        <span className="font-medium text-green-600">₹{(reimbursementExpense.total_reimbursed || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="text-gray-600 font-medium">Remaining:</span>
                        <span className="font-bold text-purple-600">₹{(reimbursementExpense.amount - (reimbursementExpense.total_reimbursed || 0)).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reimbursement Amount *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <Input
                      type="number"
                      value={reimbursementForm.amount}
                      onChange={(e) => setReimbursementForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="pl-7"
                      placeholder="Enter amount to reimburse"
                      max={reimbursementExpense.amount - (reimbursementExpense.total_reimbursed || 0)}
                    />
                  </div>
                  {parseFloat(reimbursementForm.amount) < (reimbursementExpense.amount - (reimbursementExpense.total_reimbursed || 0)) && parseFloat(reimbursementForm.amount) > 0 && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                      Partial reimbursement - Status will be set to "Partial"
                    </p>
                  )}
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
                <Button 
                  className="flex-1 bg-purple-600 hover:bg-purple-700" 
                  onClick={handleReimbursementSubmit}
                  disabled={!reimbursementForm.amount || parseFloat(reimbursementForm.amount) <= 0}
                >
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
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Users size={20} className="text-purple-600" />
                      Reimburse {bulkSettlementEmployee.name}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {bulkSettlementEmployee.expenses.length} pending expense(s)
                    </p>
                  </div>
                  <button onClick={() => { setShowBulkSettlementModal(false); setBulkSettlementEmployee(null); }} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
              </div>
              
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Reimbursement Amount Section */}
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-purple-700">Total Pending Reimbursement:</span>
                    <span className="text-lg font-bold text-purple-700">
                      ₹{bulkSettlementEmployee.total_remaining?.toLocaleString() || bulkSettlementEmployee.total?.toLocaleString()}
                    </span>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-purple-800 mb-1 block">Reimbursement Amount</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={(bulkSettlementEmployee.total_remaining || bulkSettlementEmployee.total || 0).toFixed(2)}
                          className="pl-7 text-lg font-semibold"
                          data-testid="employee-reimbursement-amount"
                          value={reimbursementForm.custom_amount}
                          onChange={(e) => setReimbursementForm(prev => ({ ...prev, custom_amount: e.target.value }))}
                        />
                      </div>
                      <Button 
                        type="button"
                        variant="outline"
                        size="sm"
                        className="whitespace-nowrap"
                        onClick={() => setReimbursementForm(prev => ({ 
                          ...prev, 
                          custom_amount: (bulkSettlementEmployee.total_remaining || bulkSettlementEmployee.total || 0).toFixed(2)
                        }))}
                      >
                        Full Amount
                      </Button>
                    </div>
                    <p className="text-xs text-purple-600 mt-1">
                      Enter custom amount or leave empty to reimburse full pending. Amount applies to oldest expenses first.
                    </p>
                  </div>
                  
                  {/* Allocation Preview */}
                  {reimbursementForm.custom_amount && parseFloat(reimbursementForm.custom_amount) > 0 && (() => {
                    const reimbAmount = parseFloat(reimbursementForm.custom_amount);
                    const sortedExpenses = [...bulkSettlementEmployee.expenses].sort(
                      (a, b) => new Date(a.date) - new Date(b.date)
                    );
                    
                    let remaining = reimbAmount;
                    const allocations = [];
                    for (const expense of sortedExpenses) {
                      if (remaining <= 0) break;
                      const expRemaining = expense.remaining_amount || ((expense.amount || 0) - (expense.total_reimbursed || 0));
                      if (expRemaining <= 0) continue;
                      const allocAmt = Math.min(remaining, expRemaining);
                      allocations.push({
                        date: expense.date,
                        category: expense.category,
                        amount: allocAmt,
                        isPartial: allocAmt < expRemaining
                      });
                      remaining -= allocAmt;
                    }
                    
                    const totalPending = bulkSettlementEmployee.total_remaining || bulkSettlementEmployee.total || 0;
                    
                    return (
                      <div className="mt-2 pt-2 border-t border-purple-200">
                        <p className="text-xs font-medium text-purple-800 mb-1">Allocation Preview (oldest first):</p>
                        <div className="max-h-24 overflow-y-auto space-y-1">
                          {allocations.map((alloc, idx) => (
                            <div key={idx} className="flex justify-between text-xs">
                              <span className="text-gray-600">
                                {new Date(alloc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {alloc.category}
                                {alloc.isPartial && <span className="text-orange-600 ml-1">(Partial)</span>}
                              </span>
                              <span className={alloc.isPartial ? 'text-orange-600' : 'text-purple-600'}>
                                ₹{alloc.amount.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {remaining > 0 && (
                          <p className="text-xs text-orange-600 mt-1">
                            ⚠️ ₹{remaining.toFixed(2)} exceeds pending amount
                          </p>
                        )}
                        {reimbAmount < totalPending && (
                          <p className="text-xs text-blue-600 mt-1">
                            Remaining after this reimbursement: ₹{(totalPending - reimbAmount).toFixed(2)}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Payment Details */}
                <div className="grid grid-cols-2 gap-3">
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
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    Reference / Transaction ID {reimbursementForm.payment_mode !== 'Cash' && <span className="text-red-500">*</span>}
                  </label>
                  <Input
                    value={reimbursementForm.payment_reference}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                    placeholder={reimbursementForm.payment_mode === 'Cash' ? "Optional for cash" : "Required for non-cash payments"}
                    className={reimbursementForm.payment_mode !== 'Cash' && !reimbursementForm.payment_reference?.trim() ? 'border-orange-300' : ''}
                    data-testid="employee-reimbursement-reference"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Remarks</label>
                  <Input
                    value={reimbursementForm.remarks}
                    onChange={(e) => setReimbursementForm(prev => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional notes for this reimbursement..."
                    data-testid="bulk-settlement-remarks"
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
                  data-testid="confirm-employee-reimbursement-btn"
                >
                  <IndianRupee size={14} className="mr-1" /> Confirm Reimbursement
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Vendor Bulk Payment Modal */}
        {showVendorPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] flex flex-col">
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-semibold text-lg">Settle Vendor Payments</h3>
                <button onClick={() => setShowVendorPaymentModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
              
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {/* Vendor Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Select Vendor/Employee</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                    {vendorsWithPending.map(vendor => (
                      <div
                        key={vendor.name}
                        onClick={() => setSelectedVendorForPayment(vendor)}
                        className={`p-3 rounded-lg cursor-pointer border transition-all ${
                          selectedVendorForPayment?.name === vendor.name 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-gray-900">{vendor.name}</p>
                            <p className="text-xs text-gray-500">{vendor.expenses.length} pending expense(s)</p>
                          </div>
                          <p className="font-bold text-purple-700">₹{vendor.total_pending.toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                    {vendorsWithPending.length === 0 && (
                      <p className="text-center text-gray-500 py-4">No pending payments</p>
                    )}
                  </div>
                </div>

                {selectedVendorForPayment && (
                  <>
                    {/* Payment Amount */}
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-green-700">Total Pending:</span>
                        <span className="text-lg font-bold text-green-700">
                          ₹{selectedVendorForPayment.total_pending.toLocaleString()}
                        </span>
                      </div>
                      
                      <div>
                        <label className="text-xs font-medium text-green-800 mb-1 block">Payment Amount</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={selectedVendorForPayment.total_pending.toFixed(2)}
                              className="pl-7 text-lg font-semibold"
                              data-testid="vendor-payment-amount"
                              value={vendorPaymentForm.custom_amount}
                              onChange={(e) => setVendorPaymentForm(prev => ({ ...prev, custom_amount: e.target.value }))}
                            />
                          </div>
                          <Button 
                            type="button"
                            variant="outline"
                            size="sm"
                            className="whitespace-nowrap"
                            onClick={() => setVendorPaymentForm(prev => ({ 
                              ...prev, 
                              custom_amount: selectedVendorForPayment.total_pending.toFixed(2)
                            }))}
                          >
                            Full Amount
                          </Button>
                        </div>
                        <p className="text-xs text-green-600 mt-1">
                          Enter custom amount or leave empty to pay full pending. Payment applies to oldest entries first.
                        </p>
                      </div>
                      
                      {/* Allocation Preview */}
                      {vendorPaymentForm.custom_amount && parseFloat(vendorPaymentForm.custom_amount) > 0 && (() => {
                        const paymentAmount = parseFloat(vendorPaymentForm.custom_amount);
                        const sortedExpenses = [...selectedVendorForPayment.expenses].sort(
                          (a, b) => new Date(a.date) - new Date(b.date)
                        );
                        
                        let remaining = paymentAmount;
                        const allocations = [];
                        for (const expense of sortedExpenses) {
                          if (remaining <= 0) break;
                          const pending = (expense.amount || 0) - (expense.paid_amount || 0);
                          const payAmt = Math.min(remaining, pending);
                          allocations.push({
                            date: expense.date,
                            category: expense.category,
                            amount: payAmt,
                            isPartial: payAmt < pending
                          });
                          remaining -= payAmt;
                        }
                        
                        return (
                          <div className="mt-2 pt-2 border-t border-green-200">
                            <p className="text-xs font-medium text-green-800 mb-1">Allocation Preview (oldest first):</p>
                            <div className="max-h-24 overflow-y-auto space-y-1">
                              {allocations.map((alloc, idx) => (
                                <div key={idx} className="flex justify-between text-xs">
                                  <span className="text-gray-600">
                                    {new Date(alloc.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - {alloc.category}
                                    {alloc.isPartial && <span className="text-orange-600 ml-1">(Partial)</span>}
                                  </span>
                                  <span className={alloc.isPartial ? 'text-orange-600' : 'text-green-600'}>
                                    ₹{alloc.amount.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {remaining > 0 && (
                              <p className="text-xs text-orange-600 mt-1">
                                ⚠️ ₹{remaining.toFixed(2)} exceeds pending amount
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Payment Details */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block">Payment Mode *</label>
                        <Select value={vendorPaymentForm.payment_mode} onValueChange={(v) => setVendorPaymentForm(prev => ({ ...prev, payment_mode: v }))}>
                          <SelectTrigger>
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
                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                          Reference {vendorPaymentForm.payment_mode !== 'Cash' && <span className="text-red-500">*</span>}
                        </label>
                        <Input
                          placeholder={vendorPaymentForm.payment_mode === 'Cash' ? "Optional" : "Required for non-cash"}
                          value={vendorPaymentForm.reference}
                          onChange={(e) => setVendorPaymentForm(prev => ({ ...prev, reference: e.target.value }))}
                          className={vendorPaymentForm.payment_mode !== 'Cash' && !vendorPaymentForm.reference?.trim() ? 'border-orange-300' : ''}
                          data-testid="vendor-payment-reference"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Remarks</label>
                      <Input
                        placeholder="Optional notes..."
                        value={vendorPaymentForm.remarks}
                        onChange={(e) => setVendorPaymentForm(prev => ({ ...prev, remarks: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>
              
              <div className="p-4 border-t flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowVendorPaymentModal(false)}>
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-purple-600 hover:bg-purple-700" 
                  onClick={handleVendorBulkPayment}
                  disabled={!selectedVendorForPayment}
                  data-testid="confirm-vendor-payment-btn"
                >
                  <IndianRupee size={14} className="mr-1" /> Confirm Payment
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
