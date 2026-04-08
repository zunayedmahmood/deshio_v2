'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/contexts/StoreContext';
import hrmService from '@/services/hrmService';
import RewardFineDialog from '@/components/hrm/RewardFineDialog';
import AccessControl from '@/components/AccessControl';
import { Award, Search, Plus, Calendar, MinusCircle, PlusCircle, ChevronDown, ChevronUp, Edit3, Zap } from 'lucide-react';
import { format } from 'date-fns';

export default function RewardsFinesPage() {
  const { selectedStoreId } = useStore();
  const [employees, setEmployees] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialog, setDialog] = useState<{ isOpen: boolean; employee: any; editData: any }>({ isOpen: false, employee: null, editData: null });
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => { if (selectedStoreId) loadData(); }, [selectedStoreId, selectedMonth]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await hrmService.getCumulatedRewardFine({ store_id: selectedStoreId!, month: selectedMonth });
      setEmployees(data.rows || []);
      const totalReward = data.rows?.reduce((a: number, r: any) => a + r.total_reward, 0) || 0;
      const totalFine = data.rows?.reduce((a: number, r: any) => a + r.total_fine, 0) || 0;
      setSummaryData({ total_reward: totalReward, total_fine: totalFine, net: totalReward - totalFine, count: data.rows?.length || 0 });
    } catch (error) { console.error(error); }
    finally { setIsLoading(false); }
  };

  const toggleRow = async (employeeId: number) => {
    if (expandedEmployeeId === employeeId) { setExpandedEmployeeId(null); return; }
    setExpandedEmployeeId(employeeId);
    setIsLoadingDetails(true);
    try {
      const data = await hrmService.getRewardFineReport({ store_id: selectedStoreId!, employee_id: employeeId, month: selectedMonth });
      setEmployeeDetails(data?.rows || []);
    } catch (error) { console.error(error); }
    finally { setIsLoadingDetails(false); }
  };

  const filteredEmployees = employees.filter(row =>
    row.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    row.employee.employee_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!selectedStoreId) return (
    <div className="flex flex-col items-center justify-center h-96 rounded-2xl" style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
      <Zap className="w-14 h-14 mb-4" style={{ color: 'rgba(201,168,76,0.3)' }} />
      <h3 className="text-lg font-700 text-white mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>No Store Selected</h3>
      <p className="text-muted text-sm">Select a store to manage rewards and fines</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-700" style={{ fontFamily: 'Syne, sans-serif' }}>Rewards & Fines</h2>
          <p className="text-muted text-xs mt-0.5">Manage employee incentives and penalties</p>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)' }}>
          <Calendar className="w-3.5 h-3.5" style={{ color: '#f0d080' }} />
          <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-white text-xs font-600 border-none outline-none" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.12)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Total Rewards</p>
              <p className="text-3xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: '#34d399' }}>৳{(summaryData?.total_reward || 0).toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <PlusCircle className="w-5 h-5" style={{ color: '#34d399' }} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Total Fines</p>
              <p className="text-3xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: '#f87171' }}>৳{(summaryData?.total_fine || 0).toLocaleString()}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <MinusCircle className="w-5 h-5" style={{ color: '#f87171' }} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04))', border: '1px solid rgba(201,168,76,0.2)' }}>
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #f0d080, transparent)', transform: 'translate(30%,-30%)' }} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-[10px] uppercase tracking-widest font-600 mb-2">Net Adjustment</p>
              <p className="text-3xl font-800" style={{ fontFamily: 'Syne, sans-serif', color: (summaryData?.net || 0) >= 0 ? '#34d399' : '#f87171' }}>
                {(summaryData?.net || 0) >= 0 ? '+' : ''}৳{(summaryData?.net || 0).toLocaleString()}
              </p>
            </div>
            <Award className="w-8 h-8 opacity-40" style={{ color: '#f0d080' }} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="hrm-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 className="text-white font-700 text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>Employee Breakdown</h3>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="text" placeholder="Search staff..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="input-dark pl-9 pr-3 py-2 text-xs rounded-xl w-44" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {['Employee', 'Rewards', 'Fines', 'Net', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] uppercase tracking-widest text-muted font-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    {[...Array(5)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.05)', width: j === 0 ? '130px' : '70px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted text-sm">No data for this period</td></tr>
              ) : filteredEmployees.map((row) => (
                <React.Fragment key={row.employee.id}>
                  <tr className="table-row-hover cursor-pointer" style={{ borderBottom: expandedEmployeeId === row.employee.id ? 'none' : '1px solid rgba(255,255,255,0.03)' }}
                    onClick={() => toggleRow(row.employee.id)}>
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
                          <p className="text-muted text-[10px]">{row.employee.employee_code || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><span className="text-xs font-700" style={{ color: '#34d399' }}>+৳{row.total_reward.toLocaleString()}</span></td>
                    <td className="px-5 py-3.5"><span className="text-xs font-700" style={{ color: '#f87171' }}>-৳{row.total_fine.toLocaleString()}</span></td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-800" style={{ fontFamily: 'Syne, sans-serif', color: row.net_adjustment >= 0 ? '#34d399' : '#f87171' }}>
                        {row.net_adjustment >= 0 ? '+' : ''}৳{row.net_adjustment.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                          <button onClick={() => setDialog({ isOpen: true, employee: row.employee, editData: null })}
                            className="btn-primary p-1.5 rounded-lg" title="Add entry">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </AccessControl>
                        <button onClick={() => toggleRow(row.employee.id)} className="btn-ghost p-1.5 rounded-lg">
                          {expandedEmployeeId === row.employee.id
                            ? <ChevronUp className="w-3.5 h-3.5 text-muted" />
                            : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedEmployeeId === row.employee.id && (
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td colSpan={5} className="px-5 pb-4 pt-0">
                        <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <p className="text-muted text-[10px] uppercase tracking-widest font-600">Entries — {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}</p>
                          </div>
                          {isLoadingDetails ? (
                            <div className="px-4 py-6 text-center text-muted text-xs">Loading...</div>
                          ) : employeeDetails.length === 0 ? (
                            <div className="px-4 py-6 text-center text-muted text-xs">No entries this month</div>
                          ) : (
                            <table className="w-full">
                              <tbody>
                                {employeeDetails.map((entry) => (
                                  <tr key={entry.id} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td className="px-4 py-2.5 text-muted text-[10px] whitespace-nowrap">{format(new Date(entry.entry_date), 'dd MMM yyyy')}</td>
                                    <td className="px-4 py-2.5">
                                      <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full ${entry.entry_type === 'reward' ? 'pill-green' : 'pill-red'}`}>
                                        {entry.entry_type.toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <p className="text-white text-xs font-600">{entry.title}</p>
                                      {entry.notes && <p className="text-muted text-[10px]">{entry.notes}</p>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className="text-xs font-700" style={{ color: entry.entry_type === 'reward' ? '#34d399' : '#f87171' }}>
                                        ৳{entry.amount.toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                      <AccessControl roles={['super-admin', 'admin', 'branch-manager']}>
                                        <button onClick={() => setDialog({ isOpen: true, employee: row.employee, editData: entry })}
                                          className="btn-ghost p-1.5 rounded-lg" title="Edit">
                                          <Edit3 className="w-3 h-3" style={{ color: '#818cf8' }} />
                                        </button>
                                      </AccessControl>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog.isOpen && (
        <RewardFineDialog isOpen={dialog.isOpen} onClose={() => setDialog({ ...dialog, isOpen: false })}
          storeId={selectedStoreId} employee={dialog.employee} onSuccess={loadData} editData={dialog.editData} />
      )}
    </div>
  );
}
