'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import hrmService from '@/services/hrmService';
import { Calendar, Search, FileText, CheckCircle2, AlertCircle, CreditCard, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

export default function PayrollPage() {
  const { selectedStoreId } = useStore();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [payingEmployeeId, setPayingEmployeeId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedStoreId) loadSalarySheet();
  }, [selectedStoreId, selectedMonth]);

  const loadSalarySheet = async () => {
    setIsLoading(true);
    try {
      const data = await hrmService.getMonthlySalarySheet({ store_id: selectedStoreId!, month: selectedMonth });
      setSheetData(data?.sheet || []);
    } catch (error) {
      toast.error('Failed to load payroll data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaySalary = async (employeeId: number) => {
    if (!window.confirm('Mark this salary as paid? This applies all unapplied fines and rewards.')) return;
    setPayingEmployeeId(employeeId);
    try {
      const res = await hrmService.payMonthlySalary({ employee_id: employeeId, store_id: selectedStoreId!, month: selectedMonth });
      if (res.success) { toast.success(res.message || 'Salary marked as paid.'); loadSalarySheet(); }
      else toast.error(res.message || 'Failed.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error executing payment.');
    } finally {
      setPayingEmployeeId(null); }
  };

  const filteredSheet = sheetData.filter((item: any) =>
    item.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.employee.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPayable = filteredSheet.reduce((sum: number, r: any) => sum + Number(r.net_payable || 0), 0);
  const paidCount = filteredSheet.filter((r: any) => r.is_paid).length;
  const pendingCount = filteredSheet.length - paidCount;

  if (!selectedStoreId) return (
    <div className="flex flex-col items-center justify-center h-96 rounded-2xl" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
      <CreditCard className="w-14 h-14 mb-4" style={{ color: 'rgba(201,168,76,0.3)' }} />
      <h3 className="text-lg font-700 text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>No Store Selected</h3>
      <p className="text-muted text-sm">Select a store to manage payroll</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Payroll</h2>
          <p className="text-muted text-xs mt-0.5">{format(new Date(selectedMonth + '-01'), 'MMMM yyyy')} salary sheet</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#f0d080' }} />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl" />
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search employees..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl w-44" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Payable', value: `৳${totalPayable.toLocaleString()}`, color: '#f0d080', bg: 'rgba(201,168,76,0.08)', border: 'rgba(201,168,76,0.12)' },
          { label: 'Total Staff', value: filteredSheet.length, color: '#818cf8', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.12)' },
          { label: 'Paid', value: paidCount, color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.12)' },
          { label: 'Pending', value: pendingCount, color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.12)' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">{s.label}</p>
            <p className="text-2xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Employee', 'Basic', 'Rewards', 'Overtime', 'Fines', 'Late Fees', 'Net Payable', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-[10px] uppercase tracking-widest text-muted font-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.05)', width: j === 0 ? '120px' : '70px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredSheet.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-12 text-center">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-10 text-white" />
                  <p className="text-muted text-sm">No employees found for this month</p>
                </td></tr>
              ) : filteredSheet.map((row) => (
                <tr key={row.employee.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="avatar-ring w-7 h-7 shrink-0">
                        <div className="w-full h-full rounded-full flex items-center justify-center text-[10px] font-700"
                          style={{ background: '#0a0a0f', color: '#f0d080' }}>
                          {row.employee.name.charAt(0)}
                        </div>
                      </div>
                      <div>
                        <p className="text-white text-xs font-600">{row.employee.name}</p>
                        <p className="text-muted text-[10px]">{row.employee.employee_code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs font-600 text-sub whitespace-nowrap">৳{Number(row.basic_salary).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#34d399' }}>+৳{Number(row.rewards || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#34d399' }}>+৳{Number(row.overtime_pay || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#f87171' }}>-৳{Number(row.fines || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-xs font-600 whitespace-nowrap" style={{ color: '#f87171' }}>-৳{Number(row.late_fees || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className="text-sm font-800 gold-shimmer" style={{ fontFamily: 'Syne, sans-serif' }}>
                      ৳{Number(row.net_payable).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {row.is_paid ? (
                      <span className="pill-green text-[10px] font-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit">
                        <CheckCircle2 className="w-3 h-3" /> Paid
                      </span>
                    ) : (
                      <span className="pill-amber text-[10px] font-700 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-fit">
                        <AlertCircle className="w-3 h-3" /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => handlePaySalary(row.employee.id)}
                      disabled={row.is_paid || payingEmployeeId === row.employee.id}
                      className={`px-3.5 py-1.5 rounded-xl text-[10px] font-700 transition-all whitespace-nowrap ${
                        row.is_paid ? 'cursor-not-allowed opacity-30 text-muted' : 'btn-primary'
                      }`}>
                      {payingEmployeeId === row.employee.id ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0a0a0f' }} />
                          Processing
                        </span>
                      ) : row.is_paid ? 'Settled' : 'Pay Now'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
