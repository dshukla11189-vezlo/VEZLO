import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Trash2, 
  Receipt, Calculator, Users, RefreshCw, Calendar, ArrowUp, ArrowDown,
  BarChart3, PieChart
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart as RePieChart, Pie, Cell } from 'recharts';

const COLORS = ['#14532D', '#D97706', '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B', '#6366F1'];

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [pnlData, setPnlData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('overview');

  const loadPnlData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/reports/pnl?from_date=${dateFrom}&to_date=${dateTo}`);
      setPnlData(response.data);
    } catch (error) {
      console.error('Failed to load P&L data:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadPnlData();
  }, [loadPnlData]);

  const formatCurrency = (amount) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount?.toFixed(0) || 0}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  if (loading) {
    return (
      <Layout title={t('app.dashboard')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
        </div>
      </Layout>
    );
  }

  const summary = pnlData?.summary || {};
  const dailyPnl = pnlData?.daily_pnl || [];
  const customerPnl = pnlData?.customer_pnl || [];
  const productPnl = pnlData?.product_pnl || [];
  const expenses = pnlData?.expenses || {};
  const purchaseByFarmer = pnlData?.purchase_by_farmer || [];

  // Prepare pie chart data for expenses
  const variableExpenseData = Object.entries(expenses.variable_by_category || {}).map(([name, value]) => ({
    name, value
  }));
  const fixedExpenseData = Object.entries(expenses.fixed_by_category || {}).map(([name, value]) => ({
    name, value
  }));

  return (
    <Layout title={t('app.dashboard')}>
      <div data-testid="pnl-dashboard">
        {/* Header with Date Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Profit & Loss Dashboard</h1>
            <p className="text-sm text-gray-500">
              {formatDate(dateFrom)} - {formatDate(dateTo)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 h-8 text-sm"
            />
            <span className="text-gray-400">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 h-8 text-sm"
            />
            <Button variant="outline" size="sm" onClick={loadPnlData}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Key P&L Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          {/* Sales */}
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-600 rounded-lg">
                  <ShoppingCart className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-green-800 font-medium uppercase">Total Sales</p>
                  <p className="text-lg font-bold text-green-900">{formatCurrency(summary.total_sales)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Purchase */}
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-600 rounded-lg">
                  <Package className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-orange-800 font-medium uppercase">Purchase Cost</p>
                  <p className="text-lg font-bold text-orange-900">{formatCurrency(summary.total_purchase)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wastage */}
          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-600 rounded-lg">
                  <Trash2 className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-red-800 font-medium uppercase">Wastage Loss</p>
                  <p className="text-lg font-bold text-red-900">{formatCurrency(summary.total_wastage_value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Gross Profit */}
          <Card className={`bg-gradient-to-br ${summary.gross_profit >= 0 ? 'from-emerald-50 to-emerald-100 border-emerald-200' : 'from-red-50 to-red-100 border-red-200'}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 ${summary.gross_profit >= 0 ? 'bg-emerald-600' : 'bg-red-600'} rounded-lg`}>
                  {summary.gross_profit >= 0 ? <TrendingUp className="text-white" size={16} /> : <TrendingDown className="text-white" size={16} />}
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase" style={{ color: summary.gross_profit >= 0 ? '#065F46' : '#991B1B' }}>Gross Profit</p>
                  <p className="text-lg font-bold" style={{ color: summary.gross_profit >= 0 ? '#064E3B' : '#7F1D1D' }}>
                    {formatCurrency(summary.gross_profit)}
                  </p>
                  <p className="text-[10px]" style={{ color: summary.gross_profit >= 0 ? '#047857' : '#DC2626' }}>
                    {summary.gross_margin}% margin
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Variable Expenses */}
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Receipt className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-purple-800 font-medium uppercase">Variable Exp</p>
                  <p className="text-lg font-bold text-purple-900">{formatCurrency(summary.total_variable_expenses)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net Profit */}
          <Card className={`bg-gradient-to-br ${summary.net_profit >= 0 ? 'from-blue-50 to-blue-100 border-blue-200' : 'from-red-50 to-red-100 border-red-200'}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 ${summary.net_profit >= 0 ? 'bg-blue-600' : 'bg-red-600'} rounded-lg`}>
                  <DollarSign className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase" style={{ color: summary.net_profit >= 0 ? '#1E40AF' : '#991B1B' }}>Net Profit</p>
                  <p className="text-lg font-bold" style={{ color: summary.net_profit >= 0 ? '#1E3A8A' : '#7F1D1D' }}>
                    {formatCurrency(summary.net_profit)}
                  </p>
                  <p className="text-[10px]" style={{ color: summary.net_profit >= 0 ? '#2563EB' : '#DC2626' }}>
                    {summary.net_margin}% margin
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b pb-2">
          {['overview', 'customers', 'products', 'expenses'].map(tab => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? 'bg-[#14532D]' : ''}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily P&L Chart */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 size={16} /> Daily P&L Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyPnl.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={dailyPnl}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v) => `₹${v/1000}K`} />
                      <Tooltip 
                        formatter={(value) => [`₹${value.toLocaleString()}`, '']}
                        labelFormatter={(label) => formatDate(label)}
                      />
                      <Legend />
                      <Bar dataKey="sales" name="Sales" fill="#14532D" />
                      <Bar dataKey="purchase" name="Purchase" fill="#D97706" />
                      <Bar dataKey="gross_profit" name="Gross Profit" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-gray-400">
                    No data for selected period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Net Profit Trend */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp size={16} /> Net Profit Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyPnl.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={dailyPnl}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} />
                      <YAxis fontSize={10} tickFormatter={(v) => `₹${v/1000}K`} />
                      <Tooltip 
                        formatter={(value) => [`₹${value.toLocaleString()}`, '']}
                        labelFormatter={(label) => formatDate(label)}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="gross_profit" name="Gross" stroke="#14532D" strokeWidth={2} />
                      <Line type="monotone" dataKey="net_profit" name="Net" stroke="#3B82F6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-gray-400">
                    No data for selected period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily P&L Table */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Daily P&L Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-2 text-left font-medium text-gray-500">DATE</th>
                        <th className="p-2 text-right font-medium text-gray-500">SALES</th>
                        <th className="p-2 text-right font-medium text-gray-500">PURCHASE</th>
                        <th className="p-2 text-right font-medium text-gray-500">WASTAGE</th>
                        <th className="p-2 text-right font-medium text-gray-500">GROSS P/L</th>
                        <th className="p-2 text-right font-medium text-gray-500">VAR. EXP</th>
                        <th className="p-2 text-right font-medium text-gray-500">FIX. EXP</th>
                        <th className="p-2 text-right font-medium text-gray-500">NET P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyPnl.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-4 text-center text-gray-400">No data</td>
                        </tr>
                      ) : (
                        dailyPnl.map((day, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{formatDate(day.date)}</td>
                            <td className="p-2 text-right text-green-600">₹{day.sales.toLocaleString()}</td>
                            <td className="p-2 text-right text-orange-600">₹{day.purchase.toLocaleString()}</td>
                            <td className="p-2 text-right text-red-600">₹{day.wastage.toLocaleString()}</td>
                            <td className={`p-2 text-right font-semibold ${day.gross_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              {day.gross_profit >= 0 ? '+' : ''}₹{day.gross_profit.toLocaleString()}
                            </td>
                            <td className="p-2 text-right text-purple-600">₹{day.variable_exp.toLocaleString()}</td>
                            <td className="p-2 text-right text-gray-600">₹{day.fixed_exp.toLocaleString()}</td>
                            <td className={`p-2 text-right font-bold ${day.net_profit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                              {day.net_profit >= 0 ? '+' : ''}₹{day.net_profit.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {dailyPnl.length > 0 && (
                      <tfoot className="bg-gray-100 font-semibold">
                        <tr>
                          <td className="p-2">TOTAL</td>
                          <td className="p-2 text-right text-green-700">₹{summary.total_sales?.toLocaleString()}</td>
                          <td className="p-2 text-right text-orange-700">₹{summary.total_purchase?.toLocaleString()}</td>
                          <td className="p-2 text-right text-red-700">₹{summary.total_wastage_value?.toLocaleString()}</td>
                          <td className={`p-2 text-right ${summary.gross_profit >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                            ₹{summary.gross_profit?.toLocaleString()}
                          </td>
                          <td className="p-2 text-right text-purple-700">₹{summary.total_variable_expenses?.toLocaleString()}</td>
                          <td className="p-2 text-right text-gray-700">₹{summary.total_fixed_expenses?.toLocaleString()}</td>
                          <td className={`p-2 text-right ${summary.net_profit >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
                            ₹{summary.net_profit?.toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Customer Sales Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users size={16} /> Customer-wise Sales
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customerPnl.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={customerPnl.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `₹${v/1000}K`} fontSize={10} />
                      <YAxis type="category" dataKey="customer" width={120} fontSize={10} />
                      <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, 'Sales']} />
                      <Bar dataKey="sales_amount" fill="#14532D" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400">
                    No customer data
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer Summary */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Top Customers</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[350px] overflow-y-auto">
                  {customerPnl.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border-b hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-medium text-sm">{c.customer}</p>
                          <p className="text-[10px] text-gray-500">{c.invoices} invoices</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-700">₹{c.sales_amount.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-500">{c.sales_qty} units</p>
                      </div>
                    </div>
                  ))}
                  {customerPnl.length === 0 && (
                    <div className="p-4 text-center text-gray-400">No customers</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'products' && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package size={16} /> Product-wise P&L
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-2 text-left font-medium text-gray-500">PRODUCT</th>
                      <th className="p-2 text-right font-medium text-gray-500">SALES (₹)</th>
                      <th className="p-2 text-right font-medium text-gray-500">SALES QTY</th>
                      <th className="p-2 text-right font-medium text-gray-500">PURCHASE (₹)</th>
                      <th className="p-2 text-right font-medium text-gray-500">PURCHASE QTY</th>
                      <th className="p-2 text-right font-medium text-gray-500">WASTAGE</th>
                      <th className="p-2 text-right font-medium text-gray-500">PROFIT</th>
                      <th className="p-2 text-right font-medium text-gray-500">MARGIN %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPnl.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-gray-400">No products</td>
                      </tr>
                    ) : (
                      productPnl.map((p, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-medium">{p.product}</td>
                          <td className="p-2 text-right text-green-600">₹{p.sales_amount.toLocaleString()}</td>
                          <td className="p-2 text-right">{p.sales_qty.toLocaleString()}</td>
                          <td className="p-2 text-right text-orange-600">₹{p.purchase_amount.toLocaleString()}</td>
                          <td className="p-2 text-right">{p.purchase_qty.toLocaleString()} Kg</td>
                          <td className="p-2 text-right text-red-600">₹{p.wastage_amount.toLocaleString()}</td>
                          <td className={`p-2 text-right font-semibold ${p.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {p.profit >= 0 ? '+' : ''}₹{p.profit.toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              p.margin >= 20 ? 'bg-green-100 text-green-700' : 
                              p.margin >= 10 ? 'bg-yellow-100 text-yellow-700' : 
                              'bg-red-100 text-red-700'
                            }`}>
                              {p.margin}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'expenses' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Variable Expenses */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Receipt size={16} /> Variable Expenses Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {variableExpenseData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <RePieChart>
                        <Pie
                          data={variableExpenseData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={70}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {variableExpenseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, '']} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1">
                      {variableExpenseData.map((exp, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                            {exp.name}
                          </span>
                          <span className="font-medium">₹{exp.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-gray-400">
                    No variable expenses
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fixed Expenses */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator size={16} /> Fixed Expenses Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {fixedExpenseData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <RePieChart>
                        <Pie
                          data={fixedExpenseData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={70}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {fixedExpenseData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`₹${value.toLocaleString()}`, '']} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="mt-2 space-y-1">
                      {fixedExpenseData.map((exp, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded" style={{ backgroundColor: COLORS[(idx + 3) % COLORS.length] }}></span>
                            {exp.name}
                          </span>
                          <span className="font-medium">₹{exp.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-gray-400">
                    No fixed expenses
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Purchase by Farmer */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users size={16} /> Purchase by Farmer/Supplier
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="p-2 text-left font-medium text-gray-500">#</th>
                        <th className="p-2 text-left font-medium text-gray-500">FARMER/SUPPLIER</th>
                        <th className="p-2 text-right font-medium text-gray-500">AMOUNT (₹)</th>
                        <th className="p-2 text-right font-medium text-gray-500">QUANTITY (Kg)</th>
                        <th className="p-2 text-right font-medium text-gray-500">AVG RATE (₹/Kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseByFarmer.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-gray-400">No purchases</td>
                        </tr>
                      ) : (
                        purchaseByFarmer.map((f, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-gray-400">{idx + 1}</td>
                            <td className="p-2 font-medium">{f.farmer}</td>
                            <td className="p-2 text-right text-orange-600">₹{f.amount.toLocaleString()}</td>
                            <td className="p-2 text-right">{f.qty.toLocaleString()} Kg</td>
                            <td className="p-2 text-right">₹{(f.amount / f.qty || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
