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
  AlertTriangle, Calendar, Copy, Users
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
  'Other'
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
  
  // Filters
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth());
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
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
    settlement_remarks: ''
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

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/expenses/fixed';
      const params = new URLSearchParams();
      params.append('month', filterMonth + 1);  // Convert 0-indexed to 1-indexed
      params.append('year', filterYear);
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
  }, [filterMonth, filterYear, filterCategory, filterStatus]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      month: filterMonth + 1,  // filterMonth is 0-indexed
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
      settlement_remarks: ''
    });
    setEditingExpense(null);
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.amount) {
      toast.error('Category and Amount are required');
      return;
    }
    
    // If status is Paid and no payment date, show payment details modal
    if (formData.status === 'Paid' && !formData.payment_date) {
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
      settlement_remarks: expense.settlement_remarks || ''
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
            <h1 className="text-xl font-bold text-gray-900">Fixed Expenses</h1>
            <p className="text-sm text-gray-500">Monthly recurring costs - {MONTHS[filterMonth]} {filterYear}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadExpenses}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleGenerateRecurring}>
              <Copy size={14} className="mr-1" /> Generate Recurring
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Month</label>
                <Select value={filterMonth.toString()} onValueChange={(v) => setFilterMonth(parseInt(v))}>
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
      </div>
    </Layout>
  );
}
