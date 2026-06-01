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
  const [reimbursementsData, setReimbursementsData] = useState([]); // Employee-wise reimbursements
  const [labourDetails, setLabourDetails] = useState([]); // Daily labour breakdown
  const [paymentsData, setPaymentsData] = useState({ inflows: [], outflows: [], summary: { inflow: 0, outflow: 0, net: 0 } }); // Payment transactions
  
  // Filter for payables tab
  const [payablesFilter, setPayablesFilter] = useState('all'); // 'all', 'procurement', 'variable_expense', 'fixed_expense'
  
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
        procurementPaymentsRes,
        variableExpensesRes,
        fixedExpensesRes,
        labourSummaryRes,
        retailInvoicesRes,
        qcGrnsRes,
        retailersRes,
        retailerPaymentsRes,
        // Fetch procurements by PAYMENT_DATE for outflows (when cash actually moved)
        procurementsByPaymentDateRes
      ] = await Promise.all([
        api.get(`/api/procurement?from_date=${fromDate}&to_date=${toDate}`),  // For Payables (by procurement date)
        api.get(`/api/procurement-payments?from_date=${fromDate}&to_date=${toDate}`),
        api.get(`/api/expenses/variable?from_date=${fromDate}&to_date=${toDate}`),
        api.get(`/api/expenses/fixed`),
        api.get(`/api/labour-costs/summary?from_date=${fromDate}&to_date=${toDate}`),
        api.get(`/api/retailer-invoices?from_date=${fromDate}&to_date=${toDate}`),
        api.get('/api/qc-grns'),
        api.get('/api/retailers'),
        api.get('/api/retailer-payments'),  // Fetch actual payment records
        // Separate call for procurements filtered by payment_date (for cash outflows)
        api.get(`/api/procurement?from_date=${fromDate}&to_date=${toDate}&filter_by=payment_date`)
      ]);
      
      // Build retailer lookup map (id -> company_name or name)
      const retailerMap = {};
      (retailersRes.data || []).forEach(r => {
        retailerMap[r.id] = r.company_name || r.name || 'Unknown';
      });
      
      // Get all procurement payments for employee reimbursement tracking
      const allProcurementPayments = procurementPaymentsRes.data || [];
      
      // Process Procurements (Payables) - filtered by PROCUREMENT DATE
      const procurements = procurementsRes.data || [];
      const procTotal = procurements.reduce((sum, p) => sum + (p.total_amount || 0), 0);
      const procPaid = procurements.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
      
      // Procurements filtered by PAYMENT DATE - for Outflows (when cash actually moved)
      const procurementsByPaymentDate = procurementsByPaymentDateRes.data || [];
      
      // Process Variable Expenses (Payables)
      const varExpenses = variableExpensesRes.data || [];
      const varTotal = varExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const varPaid = varExpenses.filter(e => e.payment_status === 'paid' || e.is_settled).reduce((sum, e) => sum + (e.amount || 0), 0);
      
      // Process Fixed Expenses (Payables) - filter by date range
      // Fixed expenses now have a 'date' field (fallback to month/year for backward compatibility)
      const fixedExpenses = (fixedExpensesRes.data || []).filter(e => {
        // If expense has date field, use it directly
        if (e.date) {
          const expDate = e.date?.split('T')[0];
          return expDate >= fromDate && expDate <= toDate;
        }
        // Fallback: use month/year fields for backward compatibility
        const expMonth = e.month;
        const expYear = e.year;
        if (!expMonth || !expYear) return false;
        
        const fromMonth = parseInt(fromDate.split('-')[1]);
        const fromYear = parseInt(fromDate.split('-')[0]);
        const toMonth = parseInt(toDate.split('-')[1]);
        const toYear = parseInt(toDate.split('-')[0]);
        
        // Check if expense month/year falls within range
        const expDateValue = expYear * 12 + expMonth;
        const fromDateValue = fromYear * 12 + fromMonth;
        const toDateValue = toYear * 12 + toMonth;
        
        return expDateValue >= fromDateValue && expDateValue <= toDateValue;
      });
      const fixTotal = fixedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const fixPaid = fixedExpenses.filter(e => e.is_settled || e.status === 'Paid').reduce((sum, e) => sum + (e.amount || 0), 0);
      
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
        if (!e.is_settled && e.status !== 'Paid') {
          // Use date field if available, otherwise create from month/year
          const displayDate = e.date ? e.date.split('T')[0] : 
            (e.year && e.month ? `${e.year}-${String(e.month).padStart(2, '0')}-01` : null);
          payablesDetailsList.push({
            type: 'Fixed Expense',
            date: displayDate,
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
      
      // Process Labour Costs for detailed breakdown
      const labourBreakdown = labourSummaryRes.data?.daily_breakdown || [];
      const labourDetailsList = labourBreakdown.map(day => ({
        date: day.date,
        total_present: day.total_present,
        total_payment: day.total_payment,
        records: day.records || []
      }));
      setLabourDetails(labourDetailsList);
      
      // Build Employee Reimbursements (from Procurement Payments, Variable & Fixed Expenses)
      const employeeReimbursements = {};
      
      // Build a map of procurement info for payment descriptions
      const procurementMap = {};
      procurements.forEach(p => {
        procurementMap[p.id] = p;
      });
      
      // From Individual Procurement Payments (paid_by_type === 'employee' and not settled)
      // This is more accurate than checking at procurement level
      allProcurementPayments.forEach(payment => {
        if (payment.paid_by_type === 'employee' && payment.settlement_status !== 'settled') {
          const empName = payment.paid_by || 'Unknown';
          if (!employeeReimbursements[empName]) {
            employeeReimbursements[empName] = {
              name: empName,
              total: 0,
              procurement: { amount: 0, items: [] },
              variable: { amount: 0, items: [] },
              fixed: { amount: 0, items: [] }
            };
          }
          const amount = payment.amount || 0;
          const proc = procurementMap[payment.procurement_id];
          employeeReimbursements[empName].total += amount;
          employeeReimbursements[empName].procurement.amount += amount;
          employeeReimbursements[empName].procurement.items.push({
            id: payment.id,
            procurement_id: payment.procurement_id,
            date: payment.payment_date || proc?.date,
            description: `${proc?.farmer_name || payment.vendor_name || 'Vendor'} - Payment of ₹${amount.toLocaleString()}`,
            amount: amount
          });
        }
      });
      
      // From Variable Expenses (employee-paid and not settled)
      // Check both paid_by_type === 'employee' OR paid_by is an employee name (not Company) and not settled
      varExpenses.forEach(e => {
        const isEmployeePaid = e.paid_by_type === 'employee' || 
          (e.paid_by && e.paid_by !== 'Company' && !e.paid_by.toLowerCase().includes('company'));
        const needsReimbursement = isEmployeePaid && !e.is_settled && e.settlement_status !== 'settled';
        
        if (needsReimbursement) {
          const empName = e.paid_by || 'Unknown';
          if (!employeeReimbursements[empName]) {
            employeeReimbursements[empName] = {
              name: empName,
              total: 0,
              procurement: { amount: 0, items: [] },
              variable: { amount: 0, items: [] },
              fixed: { amount: 0, items: [] }
            };
          }
          const amount = e.amount || 0;
          employeeReimbursements[empName].total += amount;
          employeeReimbursements[empName].variable.amount += amount;
          employeeReimbursements[empName].variable.items.push({
            id: e.id,
            date: e.date,
            description: `${e.category} - ${e.description || ''}`,
            amount: amount
          });
        }
      });
      
      // From Fixed Expenses (employee-paid and not settled)
      fixedExpenses.forEach(e => {
        const isEmployeePaid = e.paid_by_type === 'employee' || 
          (e.paid_by && e.paid_by !== 'Company' && !e.paid_by.toLowerCase().includes('company'));
        const needsReimbursement = isEmployeePaid && !e.is_settled && e.settlement_status !== 'settled';
        
        if (needsReimbursement) {
          const empName = e.paid_by || 'Unknown';
          if (!employeeReimbursements[empName]) {
            employeeReimbursements[empName] = {
              name: empName,
              total: 0,
              procurement: { amount: 0, items: [] },
              variable: { amount: 0, items: [] },
              fixed: { amount: 0, items: [] }
            };
          }
          const amount = e.amount || 0;
          employeeReimbursements[empName].total += amount;
          employeeReimbursements[empName].fixed.amount += amount;
          employeeReimbursements[empName].fixed.items.push({
            id: e.id,
            date: e.date || `${e.year}-${String(e.month).padStart(2, '0')}-01`,
            description: `${e.category} - ${e.description || ''}`,
            amount: amount
          });
        }
      });
      
      // Convert to array and sort by total descending
      const reimbursementsList = Object.values(employeeReimbursements).sort((a, b) => b.total - a.total);
      setReimbursementsData(reimbursementsList);
      
      // Process Retail Invoices (Receivables) - filter by date range
      const retailInvoices = retailInvoicesRes.data || [];
      // Filter retail invoices by date range for accurate summary
      const filteredRetailInvoices = retailInvoices.filter(inv => {
        const invDate = (inv.invoice_date || '')?.split('T')[0];
        return invDate >= fromDate && invDate <= toDate;
      });
      const retailTotal = filteredRetailInvoices.reduce((sum, inv) => sum + (inv.net_payable || inv.total_amount || 0), 0);
      const retailReceived = filteredRetailInvoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
      
      // Process QC GRNs (Receivables) - filter by date range
      // Note: GRN items use 'dispatch_date' not 'date'
      // Store full QC GRN data for Payments tab (needs payment_date filtering, not dispatch_date)
      const allQcGrns = qcGrnsRes.data || [];
      
      const qcGrns = allQcGrns.filter(grn => {
        // Check if any item dispatch_date falls within range (for Receivables view)
        return grn.items?.some(item => {
          const itemDate = (item.dispatch_date || item.date)?.split('T')[0];
          return itemDate >= fromDate && itemDate <= toDate;
        });
      });
      
      let qcTotal = 0;
      let qcReceived = 0;
      qcGrns.forEach(grn => {
        grn.items?.forEach(item => {
          const itemDate = (item.dispatch_date || item.date)?.split('T')[0];
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
      
      // Add retail invoice entries - filter by date range
      retailInvoices.forEach(inv => {
        const invDate = (inv.invoice_date || '')?.split('T')[0];
        // Filter by date range
        if (invDate >= fromDate && invDate <= toDate) {
          const pending = (inv.net_payable || inv.total_amount || 0) - (inv.paid_amount || 0);
          if (pending > 0) {
            receivablesDetailsList.push({
              type: 'Retail Invoice',
              date: inv.invoice_date,
              description: `${inv.invoice_number} - ${retailerMap[inv.retailer_id] || inv.retailer_name || 'Unknown'}`,
              total: inv.net_payable || inv.total_amount || 0,
              received: inv.paid_amount || 0,
              pending: pending,
              status: inv.status || 'pending',
              id: inv.id,
              entity: 'retail_invoice'
            });
          }
        }
      });
      
      // Add QC GRN entries - already filtered by date range
      // Note: GRN items use 'dispatch_date' not 'date'
      qcGrns.forEach(grn => {
        grn.items?.forEach((item, idx) => {
          const itemDate = (item.dispatch_date || item.date)?.split('T')[0];
          if (itemDate >= fromDate && itemDate <= toDate && !item.payment_received) {
            receivablesDetailsList.push({
              type: 'QC GRN',
              date: item.dispatch_date || item.date,
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
      
      // Build Payments Data (Inflows and Outflows for ACTUAL cash transactions only)
      // This shows real money movement - what came in and what went out
      const inflows = [];
      const outflows = [];
      let totalInflow = 0;
      let totalOutflow = 0;
      
      // INFLOWS: QC GRN payments received - AGGREGATE BY PAYMENT DATE
      // Only include items with actual payment_date (when cash was received)
      const grnByDate = {};
      allQcGrns.forEach(grn => {
        grn.items?.forEach((item) => {
          // Only use payment_date for filtering - this is when cash actually came in
          const paymentDate = (item.payment_date)?.split('T')[0];
          
          // Only include if payment was received AND we have a payment date within range
          if (item.payment_received && paymentDate && paymentDate >= fromDate && paymentDate <= toDate) {
            const key = paymentDate; // Group by payment date
            if (!grnByDate[key]) {
              grnByDate[key] = {
                date: key,
                customer_name: grn.customer_name || 'Ninjacart',
                payment_date: item.payment_date,
                payment_mode: item.payment_mode,
                payment_reference: item.payment_reference,
                total_amount: 0,
                amount_received: 0,
                payment_difference: 0,
                items_count: 0
              };
            }
            grnByDate[key].total_amount += (item.amount || 0);
            grnByDate[key].items_count += 1;
            // Accumulate actual received amounts
            if (item.amount_received !== null && item.amount_received !== undefined) {
              grnByDate[key].amount_received += item.amount_received;
            } else {
              grnByDate[key].amount_received += (item.amount || 0);
            }
            if (item.payment_difference) {
              grnByDate[key].payment_difference += item.payment_difference;
            }
          }
        });
      });
      
      // Convert grouped GRN data to inflows
      Object.values(grnByDate).forEach(dateEntry => {
        // Use the accumulated amount_received
        const actualAmount = dateEntry.amount_received || dateEntry.total_amount;
        totalInflow += actualAmount;
        
        let description = `${dateEntry.items_count} items - GRN: ₹${dateEntry.total_amount.toLocaleString()}`;
        if (dateEntry.payment_difference && dateEntry.payment_difference !== 0) {
          if (dateEntry.payment_difference < 0) {
            description += ` (Short: ₹${Math.abs(dateEntry.payment_difference).toLocaleString()})`;
          } else {
            description += ` (Excess: ₹${dateEntry.payment_difference.toLocaleString()})`;
          }
        }
        
        inflows.push({
          type: 'QC GRN',
          source: dateEntry.customer_name,
          date: dateEntry.date,
          description: description,
          amount: actualAmount,
          grn_amount: dateEntry.total_amount,
          payment_difference: dateEntry.payment_difference,
          payment_mode: dateEntry.payment_mode || '-',
          reference: dateEntry.payment_reference || '-'
        });
      });
      
      // INFLOWS: Retail Invoice payments received - USE ACTUAL PAYMENT RECORDS
      const retailerPayments = retailerPaymentsRes.data || [];
      const retailPaymentsByDateRetailer = {};
      
      retailerPayments.forEach(payment => {
        const paymentDate = (payment.payment_date)?.split('T')[0];
        // Filter by date range
        if (payment.amount > 0 && paymentDate >= fromDate && paymentDate <= toDate) {
          const retailerName = payment.retailer_name || retailerMap[payment.retailer_id] || 'Retailer';
          const key = `${paymentDate}_${payment.retailer_id}`;
          
          if (!retailPaymentsByDateRetailer[key]) {
            retailPaymentsByDateRetailer[key] = {
              date: paymentDate,
              retailer_name: retailerName,
              retailer_id: payment.retailer_id,
              total_amount: 0,
              invoices_count: 0,
              invoice_numbers: [],
              payment_mode: payment.payment_mode,
              payment_reference: payment.reference_number
            };
          }
          retailPaymentsByDateRetailer[key].total_amount += payment.amount;
          retailPaymentsByDateRetailer[key].invoices_count += 1;
          if (payment.invoice_number) {
            retailPaymentsByDateRetailer[key].invoice_numbers.push(payment.invoice_number);
          }
        }
      });
      
      // Convert grouped retail payment data to inflows
      Object.values(retailPaymentsByDateRetailer).forEach(entry => {
        totalInflow += entry.total_amount;
        inflows.push({
          type: 'Retail Invoice',
          source: entry.retailer_name,
          date: entry.date,
          description: entry.invoices_count === 1 
            ? `Invoice #${entry.invoice_numbers[0]}`
            : `${entry.invoices_count} invoices`,
          amount: entry.total_amount,
          payment_mode: entry.payment_mode || '-',
          reference: entry.payment_reference || '-'
        });
      });
      
      // OUTFLOWS: Procurement payments made BY COMPANY (not employee)
      // Use procurementsByPaymentDate (filtered by payment_date, not procurement date)
      // This shows when cash ACTUALLY went out
      procurementsByPaymentDate.forEach(p => {
        const paidAmount = p.paid_amount || 0;
        const paidByCompany = !p.paid_by_type || p.paid_by_type === 'company' || p.paid_by_type === '';
        // The payment_date is already filtered by the API
        const paymentDate = (p.payment_date)?.split('T')[0];
        
        // Include if there's a payment and it was paid by company
        if (paidAmount > 0 && paidByCompany && paymentDate) {
          totalOutflow += paidAmount;
          outflows.push({
            type: 'Procurement',
            recipient: p.farmer_name || 'Farmer',
            date: paymentDate,  // Show payment date (when cash moved)
            procurementDate: p.date?.split('T')[0],  // Keep original date for reference
            description: `${p.items?.length || 0} items`,
            amount: paidAmount,
            payment_mode: p.payment_mode || '-',
            reference: p.payment_reference || '-',
            paid_by: 'Company',
            id: p.id
          });
        }
      });
      
      // OUTFLOWS: Variable Expenses - Include both:
      // 1. Company-paid expenses (direct payments) - ONLY if payment_status is 'paid'
      // 2. Settled employee reimbursements (company paid employee back)
      // Filter by PAYMENT DATE (when cash actually went out)
      varExpenses.forEach(e => {
        const paidByCompany = e.paid_by === 'Company' || 
          (!e.paid_by_type && !e.paid_by) ||
          (e.paid_by_type === 'company');
        
        // Check if employee-paid AND truly settled (company has reimbursed)
        const isEmployeePaid = e.paid_by_type === 'employee' || 
          (e.paid_by && e.paid_by !== 'Company' && !e.paid_by.toLowerCase().includes('company'));
        const isTrulySettled = e.is_settled === true && e.settlement_status === 'settled';
        const isEmployeePaidAndSettled = isEmployeePaid && isTrulySettled;
        
        // For company-paid expenses, ONLY include if payment_status is 'paid'
        const companyPaidAndSettled = paidByCompany && e.payment_status === 'paid';
        
        // Determine the actual payment date (when cash moved)
        // For reimbursements, use settlement_date; for direct payments, use payment_date or date
        const actualPaymentDate = isEmployeePaidAndSettled 
          ? (e.settlement_date || e.date)?.split('T')[0]
          : (e.payment_date || e.date)?.split('T')[0];
        
        // Only include if within the filter date range based on PAYMENT DATE
        if ((companyPaidAndSettled || isEmployeePaidAndSettled) && 
            actualPaymentDate && actualPaymentDate >= fromDate && actualPaymentDate <= toDate) {
          const amount = e.amount || 0;
          totalOutflow += amount;
          outflows.push({
            type: isEmployeePaidAndSettled ? 'Reimbursement' : 'Variable Expense',
            recipient: isEmployeePaidAndSettled ? e.paid_by : (e.paid_to || e.category),
            date: actualPaymentDate,  // Show actual payment date
            expenseDate: e.date?.split('T')[0],  // Keep original expense date for reference
            description: `${e.category} - ${e.description || ''}`,
            amount: amount,
            payment_mode: e.payment_mode || 'Cash',
            reference: '-',
            paid_by: isEmployeePaidAndSettled ? `Reimbursed to ${e.paid_by}` : 'Company',
            id: e.id
          });
        }
      });
      
      // OUTFLOWS: Fixed Expenses - Include both company-paid (if status is Paid) and settled reimbursements
      // Filter by PAYMENT DATE (when cash actually went out)
      fixedExpenses.forEach(e => {
        const paidByCompany = e.paid_by === 'Company' || 
          (!e.paid_by_type && !e.paid_by) ||
          (e.paid_by_type === 'company');
        
        // Check if employee-paid AND truly settled
        const isEmployeePaid = e.paid_by_type === 'employee' || 
          (e.paid_by && e.paid_by !== 'Company' && !e.paid_by.toLowerCase().includes('company'));
        const isTrulySettled = e.is_settled === true && e.settlement_status === 'settled';
        const isEmployeePaidAndSettled = isEmployeePaid && isTrulySettled;
        
        // For company-paid expenses, ONLY include if status is 'Paid'
        const companyPaidAndSettled = paidByCompany && e.status === 'Paid';
        
        // Determine actual payment date (when cash moved)
        // For reimbursements use settlement_date, for direct payments use payment_date or date
        const expenseDate = e.date ? e.date.split('T')[0] : 
          (e.year && e.month ? `${e.year}-${String(e.month).padStart(2, '0')}-01` : null);
        const actualPaymentDate = isEmployeePaidAndSettled 
          ? (e.settlement_date || expenseDate)?.split('T')[0]
          : (e.payment_date || expenseDate);
        
        // Only include if within filter date range based on PAYMENT DATE
        if ((companyPaidAndSettled || isEmployeePaidAndSettled) && 
            actualPaymentDate && actualPaymentDate >= fromDate && actualPaymentDate <= toDate) {
          const amount = e.amount || 0;
          totalOutflow += amount;
          outflows.push({
            type: isEmployeePaidAndSettled ? 'Reimbursement' : 'Fixed Expense',
            recipient: isEmployeePaidAndSettled ? e.paid_by : e.category,
            date: actualPaymentDate,  // Show actual payment date
            expenseDate: expenseDate,  // Keep original expense date for reference
            description: e.description || e.category,
            amount: amount,
            payment_mode: e.payment_mode || '-',
            reference: '-',
            paid_by: isEmployeePaidAndSettled ? `Reimbursed to ${e.paid_by}` : 'Company',
            id: e.id
          });
        }
      });
      
      // NOTE: Labour Costs are NOT included as they don't have individual payment recording
      // Labour payments are typically made in cash daily without specific payment tracking
      
      // Sort by date descending
      inflows.sort((a, b) => new Date(b.date) - new Date(a.date));
      outflows.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      setPaymentsData({
        inflows,
        outflows,
        summary: {
          inflow: totalInflow,
          outflow: totalOutflow,
          net: totalInflow - totalOutflow
        }
      });
      
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
    payablesSummary.labourCosts.total;  // Labour is always "due" (paid daily)
    
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
              <div className="flex justify-between text-red-600">
                <span>Labour Costs</span>
                <span>{formatCurrency(payablesSummary.labourCosts.total)}</span>
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
            <button
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'reimbursements' 
                  ? 'border-[#14532D] text-[#14532D]' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('reimbursements')}
            >
              Reimbursements ({reimbursementsData.length})
            </button>
            <button
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'payments' 
                  ? 'border-[#14532D] text-[#14532D]' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('payments')}
            >
              Payments ({paymentsData.inflows.length + paymentsData.outflows.length})
            </button>
            <button
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'labour' 
                  ? 'border-[#14532D] text-[#14532D]' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('labour')}
            >
              Labour ({labourDetails.length} days)
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
                
                {/* Labour Costs */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Users size={16} className="text-amber-600" />
                      </div>
                      <div>
                        <div className="font-medium">Labour Costs</div>
                        <div className="text-xs text-gray-500">Daily wages</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-red-600">{formatCurrency(payablesSummary.labourCosts.total)}</div>
                      <div className="text-xs text-gray-500">{labourDetails.reduce((s, d) => s + d.total_present, 0)} man-days</div>
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
          <div className="space-y-4">
            {/* Payables Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600">Filter:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPayablesFilter('all')}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    payablesFilter === 'all' 
                      ? 'bg-gray-800 text-white' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({payablesDetails.length})
                </button>
                <button
                  onClick={() => setPayablesFilter('procurement')}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    payablesFilter === 'procurement' 
                      ? 'bg-orange-600 text-white' 
                      : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  }`}
                >
                  Procurement ({payablesDetails.filter(p => p.entity === 'procurement').length})
                </button>
                <button
                  onClick={() => setPayablesFilter('variable_expense')}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    payablesFilter === 'variable_expense' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  Variable ({payablesDetails.filter(p => p.entity === 'variable_expense').length})
                </button>
                <button
                  onClick={() => setPayablesFilter('fixed_expense')}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    payablesFilter === 'fixed_expense' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  Fixed ({payablesDetails.filter(p => p.entity === 'fixed_expense').length})
                </button>
              </div>
            </div>

            {/* Payables Table */}
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
                    {payablesDetails.filter(p => payablesFilter === 'all' || p.entity === payablesFilter).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">
                          No pending payables in this period
                        </td>
                      </tr>
                    ) : (
                      payablesDetails
                        .filter(p => payablesFilter === 'all' || p.entity === payablesFilter)
                        .map((item, idx) => (
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
                  {payablesDetails.filter(p => payablesFilter === 'all' || p.entity === payablesFilter).length > 0 && (
                    <tfoot className="bg-red-50">
                      <tr>
                        <td colSpan={3} className="p-3 font-semibold text-red-900">
                          Total {payablesFilter === 'all' ? 'Payables' : payablesFilter === 'procurement' ? 'Procurement' : payablesFilter === 'variable_expense' ? 'Variable Expenses' : 'Fixed Expenses'}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          ₹{payablesDetails.filter(p => payablesFilter === 'all' || p.entity === payablesFilter).reduce((s, i) => s + i.total, 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-semibold text-green-600">
                          ₹{payablesDetails.filter(p => payablesFilter === 'all' || p.entity === payablesFilter).reduce((s, i) => s + i.paid, 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-bold text-red-600">
                          ₹{payablesDetails.filter(p => payablesFilter === 'all' || p.entity === payablesFilter).reduce((s, i) => s + i.pending, 0).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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
        
        {/* Reimbursements Tab */}
        {activeTab === 'reimbursements' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="p-4 border-b bg-purple-50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-purple-900 flex items-center gap-2">
                    <Users size={18} /> Employee Reimbursements
                  </h3>
                  <span className="text-sm text-purple-600">
                    Total: {formatCurrency(reimbursementsData.reduce((s, e) => s + e.total, 0))}
                  </span>
                </div>
                <p className="text-xs text-purple-600 mt-1">
                  Amounts payable to employees from Procurement, Variable & Fixed Expenses
                </p>
              </div>
              
              {reimbursementsData.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users size={40} className="mx-auto mb-3 text-gray-300" />
                  <p>No pending employee reimbursements</p>
                </div>
              ) : (
                <div className="divide-y">
                  {reimbursementsData.map((emp, idx) => (
                    <div key={idx} className="p-4">
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedPayables(prev => ({
                          ...prev,
                          [`emp_${idx}`]: !prev[`emp_${idx}`]
                        }))}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <span className="text-purple-700 font-semibold">
                              {emp.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{emp.name}</div>
                            <div className="text-xs text-gray-500">
                              {[
                                emp.procurement.items.length > 0 && `${emp.procurement.items.length} procurement`,
                                emp.variable.items.length > 0 && `${emp.variable.items.length} variable`,
                                emp.fixed.items.length > 0 && `${emp.fixed.items.length} fixed`
                              ].filter(Boolean).join(', ')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-bold text-purple-600">{formatCurrency(emp.total)}</div>
                            <div className="text-xs text-gray-500">Total Pending</div>
                          </div>
                          <ChevronDown 
                            size={18} 
                            className={`text-gray-400 transition-transform ${
                              expandedPayables[`emp_${idx}`] ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedPayables[`emp_${idx}`] && (
                        <div className="mt-4 pl-13 space-y-3">
                          {/* Procurement */}
                          {emp.procurement.items.length > 0 && (
                            <div className="bg-orange-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-orange-800">From Procurement</span>
                                <span className="text-sm font-semibold text-orange-600">{formatCurrency(emp.procurement.amount)}</span>
                              </div>
                              <div className="space-y-1">
                                {emp.procurement.items.map((item, i) => (
                                  <div key={i} className="flex justify-between text-xs text-orange-700">
                                    <span>{formatDate(item.date)} - {item.description}</span>
                                    <span>₹{item.amount?.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Variable Expenses */}
                          {emp.variable.items.length > 0 && (
                            <div className="bg-blue-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-blue-800">From Variable Expenses</span>
                                <span className="text-sm font-semibold text-blue-600">{formatCurrency(emp.variable.amount)}</span>
                              </div>
                              <div className="space-y-1">
                                {emp.variable.items.map((item, i) => (
                                  <div key={i} className="flex justify-between text-xs text-blue-700">
                                    <span>{formatDate(item.date)} - {item.description}</span>
                                    <span>₹{item.amount?.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Fixed Expenses */}
                          {emp.fixed.items.length > 0 && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-800">From Fixed Expenses</span>
                                <span className="text-sm font-semibold text-gray-600">{formatCurrency(emp.fixed.amount)}</span>
                              </div>
                              <div className="space-y-1">
                                {emp.fixed.items.map((item, i) => (
                                  <div key={i} className="flex justify-between text-xs text-gray-700">
                                    <span>{formatDate(item.date)} - {item.description}</span>
                                    <span>₹{item.amount?.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            {/* Payments Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Inflow</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(paymentsData.summary.inflow)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Total Outflow</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(paymentsData.summary.outflow)}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${paymentsData.summary.net >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Wallet className={`w-5 h-5 ${paymentsData.summary.net >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Net Cash Flow</p>
                    <p className={`text-xl font-bold ${paymentsData.summary.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {paymentsData.summary.net >= 0 ? '+' : ''}{formatCurrency(paymentsData.summary.net)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Inflows Section */}
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="p-4 border-b bg-green-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-900 flex items-center gap-2">
                      <TrendingUp size={18} /> Inflows (Received)
                    </h3>
                    <span className="text-sm text-green-600">
                      {paymentsData.inflows.length} transactions
                    </span>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {paymentsData.inflows.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No payments received in this period
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Source</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paymentsData.inflows.map((payment, idx) => (
                          <tr key={`inflow-${idx}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-600">{formatDate(payment.date)}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium text-gray-900">{payment.source}</div>
                              <div className="text-xs text-gray-500">{payment.description}</div>
                            </td>
                            <td className="px-4 py-2">
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                {payment.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-green-600">
                              +{formatCurrency(payment.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              
              {/* Outflows Section */}
              <div className="bg-white rounded-lg border overflow-hidden">
                <div className="p-4 border-b bg-red-50">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-red-900 flex items-center gap-2">
                      <TrendingDown size={18} /> Outflows (Paid)
                    </h3>
                    <span className="text-sm text-red-600">
                      {paymentsData.outflows.length} transactions
                    </span>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {paymentsData.outflows.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No payments made in this period
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Recipient</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                          <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {paymentsData.outflows.map((payment, idx) => (
                          <tr key={`outflow-${idx}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-600">{formatDate(payment.date)}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium text-gray-900">{payment.recipient}</div>
                              <div className="text-xs text-gray-500">{payment.description}</div>
                              {payment.paid_by !== 'Company' && (
                                <div className="text-xs text-purple-600">Paid by: {payment.paid_by}</div>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                payment.type === 'Procurement' ? 'bg-blue-100 text-blue-700' :
                                payment.type === 'Variable Expense' ? 'bg-orange-100 text-orange-700' :
                                payment.type === 'Fixed Expense' ? 'bg-purple-100 text-purple-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {payment.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-red-600">
                              -{formatCurrency(payment.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Labour Tab */}
        {activeTab === 'labour' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="p-4 border-b bg-amber-50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                    <Users size={18} /> Daily Labour Costs
                  </h3>
                  <span className="text-sm text-amber-600">
                    Total: {formatCurrency(payablesSummary.labourCosts.total)}
                  </span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  {labourDetails.reduce((s, d) => s + d.total_present, 0)} man-days in selected period
                </p>
              </div>
              
              {labourDetails.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Users size={40} className="mx-auto mb-3 text-gray-300" />
                  <p>No labour records in this period</p>
                </div>
              ) : (
                <div className="divide-y">
                  {labourDetails.map((day, idx) => (
                    <div key={idx} className="p-4">
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedPayables(prev => ({
                          ...prev,
                          [`labour_${idx}`]: !prev[`labour_${idx}`]
                        }))}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                            <span className="text-amber-700 font-semibold text-xs">
                              {formatDate(day.date).split('/')[0]}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{formatDate(day.date)}</div>
                            <div className="text-xs text-gray-500">
                              {day.total_present} workers present
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-bold text-amber-600">{formatCurrency(day.total_payment)}</div>
                            <div className="text-xs text-gray-500">Daily Total</div>
                          </div>
                          <ChevronDown 
                            size={18} 
                            className={`text-gray-400 transition-transform ${
                              expandedPayables[`labour_${idx}`] ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </div>
                      
                      {/* Expanded Worker Details */}
                      {expandedPayables[`labour_${idx}`] && (
                        <div className="mt-3 bg-amber-50 rounded-lg p-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-amber-800">
                                <th className="text-left pb-2">Worker</th>
                                <th className="text-center pb-2">Hours</th>
                                <th className="text-right pb-2">Rate</th>
                                <th className="text-right pb-2">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-200">
                              {day.records.filter(r => r.present).map((worker, i) => (
                                <tr key={i} className="text-amber-700">
                                  <td className="py-1">{worker.labour_name}</td>
                                  <td className="text-center">{worker.working_hours || 9}h</td>
                                  <td className="text-right">₹{worker.daily_rate?.toFixed(0)}</td>
                                  <td className="text-right font-medium">₹{worker.total_payment?.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
