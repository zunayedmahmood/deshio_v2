'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import hrmService from '@/services/hrmService';
import { Calendar, Search, Download, Info } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isToday } from 'date-fns';

export default function AttendanceLogsPage() {
  const { selectedStoreId } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { if (selectedStoreId) loadReport(); }, [selectedStoreId, selectedMonth]);

  const loadReport = async () => {
    setIsLoading(true);
    try {
      const monthDate = new Date(selectedMonth + '-01');
      const data = await hrmService.getAttendanceReport({
        store_id: selectedStoreId!,
        from: format(startOfMonth(monthDate), 'yyyy-MM-dd'),
        to: format(endOfMonth(monthDate), 'yyyy-MM-dd')
      });
      setReportData(data);
    } catch (error) { console.error(error); }
    finally { setIsLoading(false); }
  };

  const monthDate = new Date(selectedMonth + '-01');
  const daysInMonth = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });

  const filteredEmployees = reportData?.employees?.filter((item: any) =>
    item.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.employee.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    present:      { bg: 'rgba(52,211,153,0.85)',  text: '#fff', label: 'P' },
    late:         { bg: 'rgba(245,158,11,0.85)',  text: '#fff', label: 'L' },
    absent:       { bg: 'rgba(239,68,68,0.85)',   text: '#fff', label: 'A' },
    leave:        { bg: 'rgba(99,102,241,0.85)',  text: '#fff', label: 'LV' },
    half_day:     { bg: 'rgba(249,115,22,0.85)',  text: '#fff', label: 'H' },
    off_day_auto: { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.3)', label: 'OFF' },
    holiday_auto: { bg: 'rgba(139,92,246,0.6)',   text: '#fff', label: 'HD' },
  };

  if (!selectedStoreId) return (
    <div className="flex flex-col items-center justify-center h-96 rounded-2xl" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
      <Calendar className="w-14 h-14 mb-4" style={{ color: 'rgba(201,168,76,0.3)' }} />
      <h3 className="text-lg font-700 text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>No Store Selected</h3>
      <p className="text-muted text-sm">Select a store to view reports</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Attendance Report</h2>
          <p className="text-muted text-xs mt-0.5">Monthly attendance matrix for all staff</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}>
            <Calendar className="w-3.5 h-3.5" style={{ color: '#f0d080' }} />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white text-xs font-600 border-none outline-none" />
          </div>
          <button className="btn-primary flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="hrm-card rounded-2xl px-5 py-3 flex flex-wrap items-center gap-5">
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-800" style={{ background: cfg.bg, color: cfg.text }}>
              {cfg.label}
            </div>
            <span className="text-muted text-[10px] capitalize">{key.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>

      {/* Matrix */}
      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-white font-700 text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Monthly Matrix</h3>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search employee..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl w-48" />
          </div>
        </div>

        <div className="overflow-x-auto scroll-custom">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-muted font-600 min-w-[180px]"
                  style={{ borderRight: '1px solid rgba(255,255,255,0.06)', position: 'sticky', left: 0, background: '#0e0e18', zIndex: 10 }}>Employee</th>
                <th className="px-4 py-3 text-center text-[10px] uppercase tracking-widest text-muted font-600 min-w-[80px]"
                  style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>Summary</th>
                {daysInMonth.map((day) => (
                  <th key={day.toString()} className="px-1 py-3 text-center min-w-[28px]"
                    style={{
                      background: isToday(day) ? 'rgba(201,168,76,0.08)' : isWeekend(day) ? 'rgba(255,255,255,0.01)' : 'transparent',
                      outline: isToday(day) ? '1px solid rgba(201,168,76,0.2)' : 'none'
                    }}>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-700" style={{ color: isToday(day) ? '#f0d080' : 'rgba(255,255,255,0.35)' }}>{format(day, 'dd')}</span>
                      <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{format(day, 'EEE').charAt(0)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td className="px-5 py-3" style={{ position: 'sticky', left: 0, background: '#0e0e18', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="h-4 w-32 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
                    </td>
                    <td className="px-4 py-3" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }} />
                    {daysInMonth.map((d) => <td key={d.toString()} className="px-1 py-3" />)}
                  </tr>
                ))
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={daysInMonth.length + 2} className="px-5 py-12 text-center text-muted text-sm">No data for selected period</td></tr>
              ) : filteredEmployees.map((row: any) => (
                <tr key={row.employee.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td className="px-5 py-3" style={{ position: 'sticky', left: 0, background: '#0d0d17', zIndex: 5, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2.5">
                      <div className="avatar-ring w-7 h-7 shrink-0">
                        <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-700"
                          style={{ background: '#0a0a0f', color: '#f0d080' }}>
                          {row.employee.name.charAt(0)}
                        </div>
                      </div>
                      <div>
                        <p className="text-white text-xs font-600 truncate max-w-[100px]">{row.employee.name}</p>
                        <p className="text-muted text-[10px]">{row.employee.employee_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-1.5 justify-center">
                      <span className="text-[10px] font-700 px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                        {row.summary.present + row.summary.late}
                      </span>
                      <span className="text-[10px] font-700 px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                        {row.summary.absent}
                      </span>
                    </div>
                  </td>
                  {row.daily.map((day: any, idx: number) => {
                    const cfg = statusConfig[day.status] || { bg: 'rgba(255,255,255,0.03)', text: 'rgba(255,255,255,0.2)', label: '·' };
                    return (
                      <td key={idx} className="px-0.5 py-3 text-center">
                        <div title={`${format(new Date(day.date), 'dd MMM')} · ${day.status?.replace(/_/g,' ')}${day.in_time ? ` · ${day.in_time}` : ''}`}
                          className="w-5 h-5 mx-auto rounded flex items-center justify-center text-[8px] font-800 cursor-help transition-transform hover:scale-125"
                          style={{ background: cfg.bg, color: cfg.text }}>
                          {cfg.label}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#818cf8' }} />
        <p className="text-[11px] text-sub">Holidays and off-days are auto-marked based on store policy. Manual adjustments should be made via the <strong className="text-white">Staff Attendance</strong> panel.</p>
      </div>
    </div>
  );
}
