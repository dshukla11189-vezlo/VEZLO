import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../../components/Layout';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { 
  Users, Save, RefreshCw, Calendar, Clock, CheckCircle2, XCircle, AlertCircle
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
          overtime_hours: newPresent ? record.overtime_hours : 0
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
      present: true
    })));
    setHasChanges(true);
  };

  // Mark all absent
  const markAllAbsent = () => {
    if (!isToday) return;
    setAttendance(prev => prev.map(record => ({
      ...record,
      present: false,
      overtime_hours: 0
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
        overtime_hours: a.overtime_hours,
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
                Viewing past attendance (read-only). You can only edit today's attendance.
              </span>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards - Only 3 cards now (removed Total Cost) */}
        <div className="grid grid-cols-3 gap-3">
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
                      <th className="p-3 text-center font-medium text-gray-500">OVERTIME (HRS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.map((record) => (
                      <tr 
                        key={record.labour_id} 
                        className={`border-b hover:bg-gray-50 ${record.present ? 'bg-green-50/50' : ''}`}
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
                            value={record.overtime_hours || ''}
                            onChange={(e) => updateAttendance(record.labour_id, 'overtime_hours', parseFloat(e.target.value) || 0)}
                            disabled={!record.present || !isToday}
                            className={`w-20 h-8 text-center mx-auto ${(!record.present || !isToday) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            placeholder="0"
                            data-testid={`overtime-hours-${record.labour_id}`}
                          />
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
                      <td className="p-3 text-center font-bold text-orange-600">{totalOvertimeHours.toFixed(1)} hrs</td>
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
              <li>You can only mark attendance for today's date</li>
              <li>Click the circle button to mark present/absent for each labourer</li>
              <li>Enter overtime hours if any labourer worked extra (only when present)</li>
              <li>Click "Save Attendance" to save all changes</li>
              <li>Past dates are view-only and cannot be modified</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
