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
  Users, Save, RefreshCw, Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Coffee
} from 'lucide-react';

export default function Attendance() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Check if selected date is today (editable) or past date (view only)
  const isToday = selectedDate === today;
  const isPastDate = selectedDate < today;

  // Load attendance for selected date
  const loadAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/labour-attendance?date=${selectedDate}`);
      setAttendance(response.data);
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Update attendance for a labour (only overtime hours now)
  const updateAttendance = (labourId, field, value) => {
    if (!isToday) return; // Block editing for past dates
    
    setAttendance(prev => prev.map(record => {
      if (record.labour_id === labourId) {
        const updated = { ...record, [field]: value };
        // Reset overtime if not present
        if (!updated.present) {
          updated.overtime_hours = 0;
          updated.retail_hours = 0;
          updated.qc_hours = 0;
          updated.retail_ot_hours = 0;
          updated.qc_ot_hours = 0;
        }
        
        // Auto-calculate total overtime from retail + qc OT
        if (field === 'retail_ot_hours' || field === 'qc_ot_hours') {
          updated.overtime_hours = (parseFloat(updated.retail_ot_hours) || 0) + (parseFloat(updated.qc_ot_hours) || 0);
        }
        
        // Ensure retail + qc hours don't exceed working hours
        const totalVerticalHours = (parseFloat(updated.retail_hours) || 0) + (parseFloat(updated.qc_hours) || 0);
        if (totalVerticalHours > (updated.working_hours || 9)) {
          // Adjust the last changed field
          if (field === 'retail_hours') {
            updated.retail_hours = Math.max(0, (updated.working_hours || 9) - (parseFloat(updated.qc_hours) || 0));
          } else if (field === 'qc_hours') {
            updated.qc_hours = Math.max(0, (updated.working_hours || 9) - (parseFloat(updated.retail_hours) || 0));
          }
        }
        
        return updated;
      }
      return record;
    }));
    setHasChanges(true);
  };

  // Toggle present status
  const togglePresent = (labourId) => {
    if (!isToday) return; // Block editing for past dates
    
    setAttendance(prev => prev.map(record => {
      if (record.labour_id === labourId) {
        const newPresent = !record.present;
        return {
          ...record,
          present: newPresent,
          working_hours: newPresent ? 9 : 0, // Default 9 hours when marking present
          overtime_hours: newPresent ? record.overtime_hours : 0,
          retail_hours: newPresent ? 9 : 0, // Default all hours to retail
          qc_hours: newPresent ? 0 : 0,
          retail_ot_hours: newPresent ? record.retail_ot_hours : 0,
          qc_ot_hours: newPresent ? record.qc_ot_hours : 0,
          paid_leave: newPresent ? false : record.paid_leave // Can't have paid leave if present
        };
      }
      return record;
    }));
    setHasChanges(true);
  };

  // Toggle paid leave
  const togglePaidLeave = (labourId) => {
    if (!isToday) return;
    
    setAttendance(prev => prev.map(record => {
      if (record.labour_id === labourId) {
        // Can only mark paid leave if NOT present
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
    setHasChanges(true);
  };

  // Mark all present
  const markAllPresent = () => {
    if (!isToday) return;
    setAttendance(prev => prev.map(record => ({
      ...record,
      present: true,
      working_hours: 9,
      retail_hours: 9, // Default all to retail
      qc_hours: 0,
      paid_leave: false
    })));
    setHasChanges(true);
  };

  // Mark all absent
  const markAllAbsent = () => {
    if (!isToday) return;
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
    setHasChanges(true);
  };

  // Save all attendance
  const saveAttendance = async () => {
    if (!isToday) {
      toast.error('Cannot modify attendance for past dates');
      return;
    }
    
    setSaving(true);
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
        paid_leave: !a.present && a.paid_leave, // Only save paid_leave if not present
        daily_rate: a.daily_rate,
        overtime_rate: a.overtime_rate
      }));

      await api.post('/api/labour-attendance/bulk', {
        date: selectedDate,
        records
      });

      toast.success('Attendance saved successfully');
      setHasChanges(false);
      loadAttendance(); // Reload to get updated IDs
    } catch (error) {
      toast.error('Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals
  const presentCount = attendance.filter(a => a.present).length;
  const absentCount = attendance.length - presentCount;
  const paidLeaveCount = attendance.filter(a => !a.present && a.paid_leave).length;
  const totalWorkingHours = attendance.reduce((sum, a) => sum + (a.present ? (a.working_hours || 9) : 0), 0);
  const totalOvertimeHours = attendance.reduce((sum, a) => sum + (a.present ? a.overtime_hours : 0), 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Layout title="Daily Attendance">
      <div data-testid="attendance-page" className="space-y-4">
        {/* Date Picker & Actions */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="w-40 h-9"
              data-testid="attendance-date"
            />
            <span className="text-sm text-gray-500 hidden md:inline">{formatDate(selectedDate)}</span>
            {isToday && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Today</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAttendance} data-testid="refresh-attendance">
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            {isToday && (
              <Button 
                size="sm" 
                onClick={saveAttendance} 
                disabled={!hasChanges || saving}
                className="bg-[#14532D]"
                data-testid="save-attendance"
              >
                <Save size={14} className="mr-1" /> {saving ? 'Saving...' : 'Save Attendance'}
              </Button>
            )}
          </div>
        </div>

        {/* Past Date Warning */}
        {isPastDate && (
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-3 flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-600" />
              <span className="text-sm text-amber-800">
                Viewing past attendance (read-only). You can only edit today&apos;s attendance.
              </span>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Users className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-blue-800 font-medium uppercase">Total Labours</p>
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
                  <p className="text-lg font-bold text-green-900" data-testid="present-count">{presentCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-600 rounded-lg">
                  <Coffee className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[10px] text-purple-800 font-medium uppercase">Paid Leave</p>
                  <p className="text-lg font-bold text-purple-900" data-testid="paid-leave-count">{paidLeaveCount}</p>
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
                  <p className="text-lg font-bold text-orange-900">{totalOvertimeHours.toFixed(1)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions - Only show for today */}
        {isToday && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllPresent} className="text-green-700 border-green-300 hover:bg-green-50">
              <CheckCircle2 size={14} className="mr-1" /> Mark All Present
            </Button>
            <Button variant="outline" size="sm" onClick={markAllAbsent} className="text-red-700 border-red-300 hover:bg-red-50">
              <XCircle size={14} className="mr-1" /> Mark All Absent
            </Button>
          </div>
        )}

        {/* Attendance Table - Simplified (no rates, no costs) */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Attendance for {formatDate(selectedDate)}</span>
              {hasChanges && isToday && (
                <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                  Unsaved changes
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#14532D]"></div>
              </div>
            ) : attendance.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No labourers found. Ask Admin to add labourers first.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-gray-500">LABOUR NAME</th>
                      <th className="p-3 text-center font-medium text-gray-500">PRESENT</th>
                      <th className="p-3 text-center font-medium text-gray-500">WORKING HRS</th>
                      <th className="p-3 text-center font-medium text-blue-600 bg-blue-50">RETAIL HRS</th>
                      <th className="p-3 text-center font-medium text-purple-600 bg-purple-50">QC HRS</th>
                      <th className="p-3 text-center font-medium text-gray-500">OT HRS</th>
                      <th className="p-3 text-center font-medium text-blue-600 bg-blue-50">RETAIL OT</th>
                      <th className="p-3 text-center font-medium text-purple-600 bg-purple-50">QC OT</th>
                      <th className="p-3 text-center font-medium text-gray-500">PAID LEAVE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr 
                        key={record.labour_id} 
                        className={`border-b hover:bg-gray-50 ${
                          record.present ? 'bg-green-50/50' : 
                          record.paid_leave ? 'bg-purple-50/50' : ''
                        }`}
                        data-testid={`attendance-row-${record.labour_id}`}
                      >
                        <td className="p-3 font-medium">{record.labour_name}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => togglePresent(record.labour_id)}
                            disabled={!isToday}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                              record.present 
                                ? 'bg-green-500 text-white hover:bg-green-600' 
                                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                            } ${!isToday ? 'cursor-not-allowed opacity-70' : ''}`}
                            data-testid={`toggle-present-${record.labour_id}`}
                          >
                            {record.present ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            value={record.present ? (record.working_hours || 9) : ''}
                            onChange={(e) => updateAttendance(record.labour_id, 'working_hours', parseFloat(e.target.value) || 0)}
                            disabled={!record.present || !isToday}
                            className={`w-14 h-8 text-center mx-auto text-xs ${(!record.present || !isToday) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="9"
                            data-testid={`working-hours-${record.labour_id}`}
                          />
                        </td>
                        <td className="p-3 text-center bg-blue-50/50">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max={record.working_hours || 9}
                            value={record.present ? (record.retail_hours || '') : ''}
                            onChange={(e) => updateAttendance(record.labour_id, 'retail_hours', parseFloat(e.target.value) || 0)}
                            disabled={!record.present || !isToday}
                            className={`w-14 h-8 text-center mx-auto text-xs border-blue-200 ${(!record.present || !isToday) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="0"
                            data-testid={`retail-hours-${record.labour_id}`}
                          />
                        </td>
                        <td className="p-3 text-center bg-purple-50/50">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max={record.working_hours || 9}
                            value={record.present ? (record.qc_hours || '') : ''}
                            onChange={(e) => updateAttendance(record.labour_id, 'qc_hours', parseFloat(e.target.value) || 0)}
                            disabled={!record.present || !isToday}
                            className={`w-14 h-8 text-center mx-auto text-xs border-purple-200 ${(!record.present || !isToday) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="0"
                            data-testid={`qc-hours-${record.labour_id}`}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-medium ${record.overtime_hours > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {record.overtime_hours || 0}
                          </span>
                        </td>
                        <td className="p-3 text-center bg-blue-50/50">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            value={record.present ? (record.retail_ot_hours || '') : ''}
                            onChange={(e) => updateAttendance(record.labour_id, 'retail_ot_hours', parseFloat(e.target.value) || 0)}
                            disabled={!record.present || !isToday}
                            className={`w-14 h-8 text-center mx-auto text-xs border-blue-200 ${(!record.present || !isToday) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="0"
                            data-testid={`retail-ot-${record.labour_id}`}
                          />
                        </td>
                        <td className="p-3 text-center bg-purple-50/50">
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            value={record.present ? (record.qc_ot_hours || '') : ''}
                            onChange={(e) => updateAttendance(record.labour_id, 'qc_ot_hours', parseFloat(e.target.value) || 0)}
                            disabled={!record.present || !isToday}
                            className={`w-14 h-8 text-center mx-auto text-xs border-purple-200 ${(!record.present || !isToday) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="0"
                            data-testid={`qc-ot-${record.labour_id}`}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={record.paid_leave || false}
                              onCheckedChange={() => togglePaidLeave(record.labour_id)}
                              disabled={record.present || !isToday}
                              className={`${record.present ? 'opacity-30 cursor-not-allowed' : ''}`}
                              data-testid={`paid-leave-${record.labour_id}`}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100">
                    <tr>
                      <td className="p-3 font-bold">TOTAL</td>
                      <td className="p-3 text-center font-bold">
                        <span className="text-green-700">{presentCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-gray-600">{attendance.length}</span>
                      </td>
                      <td className="p-3 text-center font-bold text-gray-600">{totalWorkingHours.toFixed(1)}</td>
                      <td className="p-3 text-center font-bold text-blue-600 bg-blue-50">
                        {attendance.reduce((sum, r) => sum + (r.retail_hours || 0), 0).toFixed(1)}
                      </td>
                      <td className="p-3 text-center font-bold text-purple-600 bg-purple-50">
                        {attendance.reduce((sum, r) => sum + (r.qc_hours || 0), 0).toFixed(1)}
                      </td>
                      <td className="p-3 text-center font-bold text-orange-600">{totalOvertimeHours.toFixed(1)}</td>
                      <td className="p-3 text-center font-bold text-blue-600 bg-blue-50">
                        {attendance.reduce((sum, r) => sum + (r.retail_ot_hours || 0), 0).toFixed(1)}
                      </td>
                      <td className="p-3 text-center font-bold text-purple-600 bg-purple-50">
                        {attendance.reduce((sum, r) => sum + (r.qc_ot_hours || 0), 0).toFixed(1)}
                      </td>
                      <td className="p-3 text-center font-bold text-purple-600">{paidLeaveCount}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <h4 className="font-medium text-blue-900 mb-2">Instructions:</h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>You can only mark attendance for today&apos;s date</li>
              <li>Click the circle button to mark present/absent for each labourer</li>
              <li><strong>Working Hours:</strong> Default is 9 hours. Change if less (wages will be adjusted proportionally)</li>
              <li><strong className="text-blue-700">Retail Hrs / QC Hrs:</strong> Split working hours between Retail and Quick Commerce verticals</li>
              <li><strong>OT Hrs:</strong> Total overtime (auto-calculated from Retail OT + QC OT)</li>
              <li><strong className="text-blue-700">Retail OT / QC OT:</strong> Split overtime hours between verticals</li>
              <li><strong>Paid Leave:</strong> Check this box for labourers on paid leave (only when absent)</li>
              <li>Click &quot;Save Attendance&quot; to save all changes</li>
              <li>Past dates are view-only and cannot be modified</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
