import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  TrendingUp, TrendingDown, Wallet, Calendar, RefreshCw, ChevronDown, ChevronRight,
  Download, Eye, IndianRupee, Building2, ShoppingCart, Truck, Package, Users, FileText
} from 'lucide-react';

export default function Cashflow() {
  const [loading, setLoading] = useState(true);
  
  // Date filters - default to current month
  const getFirstDayOfMonth = () => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  };
  
  const [fromDate, setFromDate] = useState(getFirstDayOfMonth());
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Summary data
  const [payablesSummary, setPayablesSummary] = useState({
    procurement: { total: 0, paid: 0, pending: 0 },
    variableExpenses: { total: 0, paid: 0, pending: 0 },
    fixedExpenses: { total: 0, paid: 0, pending: 0 },
    labourCosts: { total: 0, paid: 0, pending: 0 }
  });
  
  const [receivablesSummary, setReceivablesSummary] = useState({
    retailInvoices: { total: 0, received: 0, pending: 0 },
    qcGrn: { total: 0, received: 0, pending: 0 }
  });
  
  // Detailed lists
  const [payablesDetails, setPayablesDetails] = useState([]);
  const [receivablesDetails, setReceivablesDetails] = useState([]);
  
  // Expanded sections
  const [expandedPayables, setExpandedPayables] = useState({
    procurement: false,
    variableExpenses: false,
    fixedExpenses: false,
    labourCosts: false
  });
  const [expandedReceivables, setExpandedReceivables] = useState({
    retail: false,
    qc: false
  });
  
  // Active tab
  const [activeTab, setActiveTab] = useState('overview');

  const loadCashflowData = useCallback(async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [
        procurementsRes,
        variableExpensesRes,
        fixedExpensesRes,
        labourSummaryRes,
        retailInvoicesRes,
        qcGrnsRes
      ] = await Promise.all([
        api.get(`/api/procurement?from_date=${fromDate}&to_date=${toDate}`),
        api.get(`/api/expenses/variable?from_date=${fromDate}&to_date=${toDate}`),
        api.get(`/api/expenses/fixed`),
        api.get(`/api/labour-costs/summary?from_date=${fromDate}&to_date=${toDate}`),
        api.get(`/api/retailer-invoices?from_date=${fromDate}&to_date=${toDate}`),
        api.get('/api/qc-grns')
      ]);
      
      // Process Procurements (Payables)
      const procurements = procurementsRes.data || [];
      const procTotal = procurements.reduce((sum, p) => sum + (p.total_amount || 0), 0);
      const procPaid = procurements.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
      
      // Process Variable Expenses (Payables)
      const varExpenses = variableExpensesRes.data || [];
      const varTotal = varExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const varPaid = varExpenses.filter(e => e.payment_status === 'paid' || e.is_settled).reduce((sum, e) => sum + (e.amount || 0), 0);
      
      // Process Fixed Expenses (Payables) - filter by date range
      const fixedExpenses = (fixedExpensesRes.data || []).filter(e => {
        const expDate = e.date?.split('T')[0];
        return expDate >= fromDate && expDate <= toDate;
      });
      const fixTotal = fixedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const fixPaid = fixedExpenses.filter(e => e.is_settled).reduce((sum, e) => sum + (e.amount || 0), 0);
      
      // Process Labour Costs (Payables)
      const labourTotal = labourSummaryRes.data?.summary?.total_payment || 0;
      
      setPayablesSummary({
        procurement: { total: procTotal, paid: procPaid, pending: procTotal - procPaid },
        variableExpenses: { total: varTotal, paid: varPaid, pending: varTotal - varPaid },
        fixedExpenses: { total: fixTotal, paid: fixPaid, pending: fixTotal - fixPaid },
        labourCosts: { total: labourTotal, paid: labourTotal, pending: 0 } // Labour assumed paid on record
      });
      
      // Build payables details
      const payablesDetailsList = [];
      
      // Add procurement entries
      procurements.forEach(p => {
        const pending = (p.total_amount || 0) - (p.paid_amount || 0);
        if (pending > 0) {
          payablesDetailsList.push({
            type: 'Procurement',
            date: p.date,
            description: `${p.farmer_name} - ${p.items?.length || 0} items`,
            total: p.total_amount || 0,
            paid: p.paid_amount || 0,
            pending: pending,
            status: p.payment_status || 'pending',
            id: p.id,
            entity: 'procurement'
          });
        }
      });
      
      // Add variable expense entries
      varExpenses.forEach(e => {
        if (e.payment_status !== 'paid' && !e.is_settled) {
          payablesDetailsList.push({
            type: 'Variable Expense',
            date: e.date,
            description: `${e.category} - ${e.description || ''}`,
            total: e.amount || 0,
            paid: e.paid_amount || 0,
            pending: (e.amount || 0) - (e.paid_amount || 0),
            status: e.payment_status || 'pending',
            id: e.id,
            entity: 'variable_expense'
          });
        }
      });
      
      // Add fixed expense entries
      fixedExpenses.forEach(e => {
        if (!e.is_settled) {
          payablesDetailsList.push({
            type: 'Fixed Expense',
            date: e.date,
            description: `${e.category} - ${e.description || ''}`,
            total: e.amount || 0,
            paid: 0,
            pending: e.amount || 0,
            status: 'pending',
            id: e.id,
            entity: 'fixed_expense'
          });
        }
      });
      
      setPayablesDetails(payablesDetailsList.sort((a, b) => new Date(b.date) - new Date(a.date)));
      
      // Process Retail Invoices (Receivables)
      const retailInvoices = retailInvoicesRes.data || [];
      const retailTotal = retailInvoices.reduce((sum, inv) => sum + (inv.net_payable || inv.total_amount || 0), 0);
      const retailReceived = retailInvoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
      
      // Process QC GRNs (Receivables) - filter by date range
      const qcGrns = (qcGrnsRes.data || []).filter(grn => {
        // Check if any item date falls within range
        return grn.items?.some(item => {
          const itemDate = item.date?.split('T')[0];
          return itemDate >= fromDate && itemDate <= toDate;
        });
      });
      
      let qcTotal = 0;
      let qcReceived = 0;
      qcGrns.forEach(grn => {
        grn.items?.forEach(item => {
          const itemDate = item.date?.split('T')[0];
          if (itemDate >= fromDate && itemDate <= toDate) {
            qcTotal += item.amount || 0;
            if (item.payment_received) {
              qcReceived += item.amount || 0;
            }
          }
        });
      });
      
      setReceivablesSummary({
        retailInvoices: { total: retailTotal, received: retailReceived, pending: retailTotal - retailReceived },
        qcGrn: { total: qcTotal, received: qcReceived, pending: qcTotal - qcReceived }
      });
      
      // Build receivables details
      const receivablesDetailsList = [];
      
      // Add retail invoice entries
      retailInvoices.forEach(inv => {
        const pending = (inv.net_payable || inv.total_amount || 0) - (inv.paid_amount || 0);
        if (pending > 0) {
          receivablesDetailsList.push({
            type: 'Retail Invoice',
            date: inv.invoice_date,
            description: `${inv.invoice_number} - ${inv.retailer_name || 'Unknown'}`,
            total: inv.net_payable || inv.total_amount || 0,
            received: inv.paid_amount || 0,
            pending: pending,
            status: inv.status || 'pending',
            id: inv.id,
            entity: 'retail_invoice'
          });
        }
      });
      
      // Add QC GRN entries
      qcGrns.forEach(grn => {
        grn.items?.forEach((item, idx) => {
          const itemDate = item.date?.split('T')[0];
          if (itemDate >= fromDate && itemDate <= toDate && !item.payment_received) {
            receivablesDetailsList.push({
              type: 'QC GRN',
              date: item.date,
              description: `${grn.customer_name || 'Ninjacart'} - ${item.product_name || 'Products'}`,
              total: item.amount || 0,
              received: item.payment_received ? item.amount : 0,
              pending: item.payment_received ? 0 : (item.amount || 0),
              status: item.payment_received ? 'received' : 'pending',
              id: grn.id,
              itemIndex: idx,
              entity: 'qc_grn'
            });
          }
        });
      });
      
      setReceivablesDetails(receivablesDetailsList.sort((a, b) => new Date(b.date) - new Date(a.date)));
      
    } catch (error) {
      console.error('Failed to load cashflow data:', error);
      toast.error('Failed to load cashflow data');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadCashflowData();
  }, [loadCashflowData]);

  const formatCurrency = (amount) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount?.toFixed(2) || '0.00'}`;
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Calculate totals
  const totalPayables = 
    payablesSummary.procurement.pending + 
    payablesSummary.variableExpenses.pending + 
    payablesSummary.fixedExpenses.pending +
    payablesSummary.labourCosts.pending;
    
  const totalReceivables = 
    receivablesSummary.retailInvoices.pending + 
    receivablesSummary.qcGrn.pending;
    
  const netCashflow = totalReceivables - totalPayables;

  const getStatusBadge = (status) => {
    switch(status) {
      case 'paid':
      case 'received':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Paid</span>;
      case 'partial':
      case 'partially_paid':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">Partial</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Pending</span>;
    }
  };

  return (
    <Layout title="Cashflow">
      <div className="space-y-6" data-testid="cashflow-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cashflow</h1>
            <p className="text-gray-500 text-sm">Track payables, receivables and net cashflow</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadCashflowData} disabled={loading}>
              <RefreshCw size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="bg-white rounded-lg border p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-gray-500" />
            <span className="text-sm text-gray-600">Period:</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-40"
            />
            <span className="text-gray-400">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setFromDate(getFirstDayOfMonth());
              setToDate(new Date().toISOString().split('T')[0]);
            }}
          >
            This Month
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Payables Card */}
          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-500 rounded-lg">
                  <TrendingDown size={20} className="text-white" />
                </div>
                <span className="font-medium text-red-900">Payables</span>
              </div>
              <span className="text-xs text-red-600 bg-red-200 px-2 py-1 rounded-full">To Pay</span>
            </div>
            <div className="text-3xl font-bold text-red-700 mb-2">
              {formatCurrency(totalPayables)}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-red-600">
                <span>Procurement</span>
                <span>{formatCurrency(payablesSummary.procurement.pending)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Variable Expenses</span>
                <span>{formatCurrency(payablesSummary.variableExpenses.pending)}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>Fixed Expenses</span>
                <span>{formatCurrency(payablesSummary.fixedExpenses.pending)}</span>
              </div>
            </div>
          </div>

          {/* Receivables Card */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-500 rounded-lg">
                  <TrendingUp size={20} className="text-white" />
                </div>
                <span className="font-medium text-green-900">Receivables</span>
              </div>
              <span className="text-xs text-green-600 bg-green-200 px-2 py-1 rounded-full">To Receive</span>
            </div>
            <div className="text-3xl font-bold text-green-700 mb-2">
              {formatCurrency(totalReceivables)}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-green-600">
                <span>Retail Invoices</span>
                <span>{formatCurrency(receivablesSummary.retailInvoices.pending)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>QC (Ninjacart)</span>
                <span>{formatCurrency(receivablesSummary.qcGrn.pending)}</span>
              </div>
            </div>
          </div>

          {/* Net Cashflow Card */}
          <div className={`bg-gradient-to-br ${netCashflow >= 0 ? 'from-blue-50 to-blue-100 border-blue-200' : 'from-amber-50 to-amber-100 border-amber-200'} border rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 ${netCashflow >= 0 ? 'bg-blue-500' : 'bg-amber-500'} rounded-lg`}>
                  <Wallet size={20} className="text-white" />
                </div>
                <span className={`font-medium ${netCashflow >= 0 ? 'text-blue-900' : 'text-amber-900'}`}>Net Cashflow</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${netCashflow >= 0 ? 'text-blue-600 bg-blue-200' : 'text-amber-600 bg-amber-200'}`}>
                {netCashflow >= 0 ? 'Surplus' : 'Deficit'}
              </span>
            </div>
            <div className={`text-3xl font-bold mb-2 ${netCashflow >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
              {netCashflow >= 0 ? '' : '-'}{formatCurrency(Math.abs(netCashflow))}
            </div>
            <div className={`text-sm ${netCashflow >= 0 ? 'text-blue-600' : 'text-amber-600'}`}>
              Receivables - Payables
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex gap-4">
            <button
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'overview' 
                  ? 'border-[#14532D] text-[#14532D]' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'payables' 
                  ? 'border-[#14532D] text-[#14532D]' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('payables')}
            >
              Payables ({payablesDetails.length})
            </button>
            <button
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'receivables' 
                  ? 'border-[#14532D] text-[#14532D]' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('receivables')}
            >
              Receivables ({receivablesDetails.length})
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payables Breakdown */}
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b bg-red-50">
                <h3 className="font-semibold text-red-900 flex items-center gap-2">
                  <TrendingDown size={18} /> Payables Breakdown
                </h3>
              </div>
              <div className="divide-y">
                {/* Procurement */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <Truck size={16} className="text-orange-600" />
                      </div>
                      <div>
                        <div className="font-medium">Procurement</div>
                        <div className="text-xs text-gray-500">Farmer payments</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-red-600">{formatCurrency(payablesSummary.procurement.pending)}</div>
                      <div className="text-xs text-gray-500">of {formatCurrency(payablesSummary.procurement.total)}</div>
                    </div>
                  </div>
                </div>
                
                {/* Variable Expenses */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <ShoppingCart size={16} className="text-purple-600" />
                      </div>
                      <div>
                        <div className="font-medium">Variable Expenses</div>
                        <div className="text-xs text-gray-500">Daily operations</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-red-600">{formatCurrency(payablesSummary.variableExpenses.pending)}</div>
                      <div className="text-xs text-gray-500">of {formatCurrency(payablesSummary.variableExpenses.total)}</div>
                    </div>
                  </div>
                </div>
                
                {/* Fixed Expenses */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Building2 size={16} className="text-blue-600" />
                      </div>
                      <div>
                        <div className="font-medium">Fixed Expenses</div>
                        <div className="text-xs text-gray-500">Rent, salaries, etc.</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-red-600">{formatCurrency(payablesSummary.fixedExpenses.pending)}</div>
                      <div className="text-xs text-gray-500">of {formatCurrency(payablesSummary.fixedExpenses.total)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Receivables Breakdown */}
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b bg-green-50">
                <h3 className="font-semibold text-green-900 flex items-center gap-2">
                  <TrendingUp size={18} /> Receivables Breakdown
                </h3>
              </div>
              <div className="divide-y">
                {/* Retail Invoices */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <FileText size={16} className="text-emerald-600" />
                      </div>
                      <div>
                        <div className="font-medium">Retail Invoices</div>
                        <div className="text-xs text-gray-500">Retailer payments</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-600">{formatCurrency(receivablesSummary.retailInvoices.pending)}</div>
                      <div className="text-xs text-gray-500">of {formatCurrency(receivablesSummary.retailInvoices.total)}</div>
                    </div>
                  </div>
                </div>
                
                {/* QC GRN */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-teal-100 rounded-lg">
                        <Package size={16} className="text-teal-600" />
                      </div>
                      <div>
                        <div className="font-medium">QC (Ninjacart)</div>
                        <div className="text-xs text-gray-500">GRN payments</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-green-600">{formatCurrency(receivablesSummary.qcGrn.pending)}</div>
                      <div className="text-xs text-gray-500">of {formatCurrency(receivablesSummary.qcGrn.total)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payables' && (
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Paid</th>
                    <th className="p-3 text-right">Pending</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payablesDetails.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        No pending payables in this period
                      </td>
                    </tr>
                  ) : (
                    payablesDetails.map((item, idx) => (
                      <tr key={`${item.entity}-${item.id}-${idx}`} className="hover:bg-gray-50">
                        <td className="p-3 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.type === 'Procurement' ? 'bg-orange-100 text-orange-700' :
                            item.type === 'Variable Expense' ? 'bg-purple-100 text-purple-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs truncate">{item.description}</td>
                        <td className="p-3 text-right font-medium">₹{item.total?.toFixed(2)}</td>
                        <td className="p-3 text-right text-green-600">₹{item.paid?.toFixed(2)}</td>
                        <td className="p-3 text-right font-semibold text-red-600">₹{item.pending?.toFixed(2)}</td>
                        <td className="p-3 text-center">{getStatusBadge(item.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {payablesDetails.length > 0 && (
                  <tfoot className="bg-red-50">
                    <tr>
                      <td colSpan={3} className="p-3 font-semibold text-red-900">Total Payables</td>
                      <td className="p-3 text-right font-semibold">₹{payablesDetails.reduce((s, i) => s + i.total, 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold text-green-600">₹{payablesDetails.reduce((s, i) => s + i.paid, 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-red-600">₹{payablesDetails.reduce((s, i) => s + i.pending, 0).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {activeTab === 'receivables' && (
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Received</th>
                    <th className="p-3 text-right">Pending</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receivablesDetails.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        No pending receivables in this period
                      </td>
                    </tr>
                  ) : (
                    receivablesDetails.map((item, idx) => (
                      <tr key={`${item.entity}-${item.id}-${idx}`} className="hover:bg-gray-50">
                        <td className="p-3 whitespace-nowrap">{formatDate(item.date)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            item.type === 'Retail Invoice' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-teal-100 text-teal-700'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs truncate">{item.description}</td>
                        <td className="p-3 text-right font-medium">₹{item.total?.toFixed(2)}</td>
                        <td className="p-3 text-right text-green-600">₹{item.received?.toFixed(2)}</td>
                        <td className="p-3 text-right font-semibold text-green-600">₹{item.pending?.toFixed(2)}</td>
                        <td className="p-3 text-center">{getStatusBadge(item.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {receivablesDetails.length > 0 && (
                  <tfoot className="bg-green-50">
                    <tr>
                      <td colSpan={3} className="p-3 font-semibold text-green-900">Total Receivables</td>
                      <td className="p-3 text-right font-semibold">₹{receivablesDetails.reduce((s, i) => s + i.total, 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold text-green-600">₹{receivablesDetails.reduce((s, i) => s + i.received, 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-green-600">₹{receivablesDetails.reduce((s, i) => s + i.pending, 0).toFixed(2)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
