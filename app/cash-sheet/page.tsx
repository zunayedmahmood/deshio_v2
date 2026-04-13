'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { ChevronLeft, ChevronRight, Save, Loader2, RefreshCw, X, Check } from 'lucide-react';
import cashSheetService, {
  CashSheetRow,
  CashSheetSummary,
  BranchDay,
  SaveBranchPayload,
  SaveOwnerPayload,
} from '@/services/cashSheetService';

// ─── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n === 0 ? '—' : '৳' + Math.round(n).toLocaleString('en-BD');

const fmtRaw = (n: number) => (n === 0 ? '' : String(Math.round(n)));

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-BD', { month: 'long', year: 'numeric' });
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-BD', { day: '2-digit', weekday: 'short' });
}

// ─── inline editable cell ────────────────────────────────────────────────────

interface EditCellProps {
  value: number;
  onSave: (val: number) => Promise<void>;
  disabled?: boolean;
  prefix?: string;
}

function EditCell({ value, onSave, disabled, prefix = '৳' }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    if (disabled) return;
    setDraft(value > 0 ? String(Math.round(value)) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = async () => {
    const num = parseFloat(draft) || 0;
    if (num === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(num);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (saving) return (
    <td className="px-2 py-1.5 text-right text-xs text-gray-400 whitespace-nowrap">
      <Loader2 size={12} className="inline animate-spin" />
    </td>
  );

  if (editing) return (
    <td className="px-1 py-1 whitespace-nowrap">
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-24 text-right text-xs border border-blue-400 rounded px-1 py-0.5 bg-white dark:bg-gray-800 focus:outline-none"
          autoFocus
        />
        <button onClick={commit} className="text-green-500 hover:text-green-600"><Check size={12} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
    </td>
  );

  return (
    <td
      onClick={start}
      className={`px-2 py-1.5 text-right text-xs whitespace-nowrap tabular-nums
        ${disabled ? 'text-gray-400 cursor-default' : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded'}
        ${value > 0 ? 'text-gray-800 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}
    >
      {value > 0 ? prefix + Math.round(value).toLocaleString('en-BD') : '—'}
    </td>
  );
}

// inline text note cell
interface NoteCellProps {
  value: string | null;
  onSave: (val: string) => Promise<void>;
  disabled?: boolean;
}

function NoteCell({ value, onSave, disabled }: NoteCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    if (disabled) return;
    setDraft(value ?? '');
    setEditing(true);
  };

  const commit = async () => {
    if (draft === (value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); setEditing(false); }
  };

  if (saving) return <td className="px-2 py-1.5 text-xs text-gray-400"><Loader2 size={12} className="inline animate-spin" /></td>;

  if (editing) return (
    <td className="px-1 py-1 min-w-[120px]">
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 bg-white dark:bg-gray-800 focus:outline-none"
        autoFocus
        placeholder="Add note…"
      />
    </td>
  );

  return (
    <td
      onClick={start}
      className={`px-2 py-1.5 text-xs max-w-[140px] truncate
        ${disabled ? 'text-gray-400 cursor-default' : 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20'}
        ${value ? 'text-gray-600 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'}`}
      title={value ?? ''}
    >
      {value || '—'}
    </td>
  );
}

// ─── read-only computed cell ───────────────────────────────────────────────────

function StatCell({ value, highlight }: { value: number; highlight?: 'green' | 'blue' | 'red' }) {
  const color =
    highlight === 'green' ? 'text-emerald-600 dark:text-emerald-400 font-medium' :
      highlight === 'blue' ? 'text-blue-600 dark:text-blue-400 font-medium' :
        highlight === 'red' ? 'text-red-500 dark:text-red-400' :
          'text-gray-700 dark:text-gray-300';

  return (
    <td className={`px-2 py-1.5 text-right text-xs whitespace-nowrap tabular-nums ${color}`}>
      {value > 0 ? '৳' + Math.round(value).toLocaleString('en-BD') : '—'}
    </td>
  );
}

// Section header cell spanning cols
function SectionHeader({ label, cols, color }: { label: string; cols: number; color: string }) {
  return (
    <th colSpan={cols} className={`px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider border-x border-gray-200 dark:border-gray-700 ${color}`}>
      {label}
    </th>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function CashSheetPage() {
  const { darkMode, setDarkMode } = useTheme();
  const { role, storeId: userStoreId, isLoading: authLoading } = useAuth() as any;
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CashSheetRow[]>([]);
  const [summary, setSummary] = useState<CashSheetSummary | null>(null);
  const [stores, setStores] = useState<{ id: number; name: string }[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Role-based access
  const isAdmin = role === 'admin' || role === 'super-admin';
  const isBranch = role === 'branch-manager';
  const canViewAll = isAdmin;
  const canEditOwner = isAdmin;
  const canEditBranch = isAdmin || isBranch;

  const authorized = isAdmin || isBranch;

  useEffect(() => {
    if (!authLoading && !authorized) router.push('/dashboard');
  }, [authLoading, authorized]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cashSheetService.getSheet(month);
      setRows(res.data);
      setSummary(res.summary);
      setStores(res.stores);
    } catch {
      showToast('Failed to load cash sheet.', false);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { if (!authLoading && authorized) load(); }, [month, authLoading, authorized]);

  // ── save helpers ─────────────────────────────────────────────────────────

  const saveBranchField = async (
    date: string,
    store_id: number,
    field: Partial<SaveBranchPayload>
  ) => {
    // Optimistically patch rows
    setRows(prev => prev.map(r => {
      if (r.date !== date) return r;
      return {
        ...r,
        branches: r.branches.map(b =>
          b.store_id !== store_id ? b : { ...b, ...field }
        ),
      };
    }));
    try {
      await cashSheetService.saveBranch({ date, store_id, ...field });
      showToast('Saved');
    } catch {
      showToast('Save failed', false);
      load(); // revert
    }
  };

  const saveOwnerField = async (date: string, field: Partial<SaveOwnerPayload>) => {
    setRows(prev => prev.map(r => {
      if (r.date !== date) return r;
      const newOwner = { ...r.owner, ...field };
      // recompute derived totals
      const cash = r.totals.cash;
      const bank = r.totals.bank;
      const finalBank = bank + r.disbursements.sslzc_received + r.disbursements.pathao_received;
      newOwner.total_cash = cash + newOwner.boss_cash_add;
      newOwner.total_bank = finalBank + newOwner.boss_bank_add;
      newOwner.cash_after_cost = newOwner.total_cash - newOwner.boss_cash_cost;
      newOwner.bank_after_cost = newOwner.total_bank - newOwner.boss_bank_cost;
      return { ...r, owner: newOwner };
    }));
    try {
      await cashSheetService.saveOwner({ date, ...field });
      showToast('Saved');
    } catch {
      showToast('Save failed', false);
      load();
    }
  };

  const saveDisbursement = async (date: string, field: Partial<SaveOwnerPayload>) => {
    setRows(prev => prev.map(r => {
      if (r.date !== date) return r;
      const newDisb = { ...r.disbursements, ...field };
      const finalBank = r.totals.bank + newDisb.sslzc_received + newDisb.pathao_received;
      return {
        ...r,
        disbursements: newDisb,
        totals: { ...r.totals, final_bank: finalBank },
        owner: {
          ...r.owner,
          total_bank: finalBank + r.owner.boss_bank_add,
          bank_after_cost: finalBank + r.owner.boss_bank_add - r.owner.boss_bank_cost,
        },
      };
    }));
    try {
      await cashSheetService.saveOwner({ date, ...field });
      showToast('Saved');
    } catch {
      showToast('Save failed', false);
      load();
    }
  };

  // ── visible stores (branch manager sees only their branch) ───────────────

  const visibleStores = isBranch && userStoreId
    ? stores.filter(s => s.id === userStoreId)
    : stores;

  // number of branch columns = stores × 7 fields each
  const BRANCH_COLS = 7; // sale, cash, bank, ex/on, salary, cost, details

  // ── render ───────────────────────────────────────────────────────────────

  if (!authorized && !authLoading) return null;

  return (
    <div className={`min-h-screen flex ${darkMode ? 'dark bg-gray-950' : 'bg-gray-50'}`}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          darkMode={darkMode}
          onDarkModeToggle={() => setDarkMode(!darkMode)}
        />

        <main className="flex-1 p-4 md:p-6 overflow-auto">

          {/* ── top bar ── */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Daily Cash Sheet</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {canViewAll ? 'All branches + online channel' : `Branch: ${visibleStores.map(s => s.name).join(', ')}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* month navigator */}
              <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5">
                <button onClick={() => setMonth(prevMonth(month))} className="p-1 hover:text-blue-500">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px] text-center">
                  {monthLabel(month)}
                </span>
                <button
                  onClick={() => setMonth(nextMonth(month))}
                  disabled={month >= currentMonth()}
                  className="p-1 hover:text-blue-500 disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 transition-colors"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* ── sheet ── */}
          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Loading sheet…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <table className="text-xs border-collapse min-w-max bg-white dark:bg-gray-900">

                {/* ── column group header row 1 (sections) ── */}
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th rowSpan={2} className="sticky left-0 z-10 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                      Date
                    </th>

                    {/* Branch sections */}
                    {visibleStores.map(s => (
                      <SectionHeader
                        key={s.id}
                        label={s.name}
                        cols={BRANCH_COLS}
                        color="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                      />
                    ))}

                    {/* Online */}
                    {canViewAll && (
                      <SectionHeader
                        label="Online / Ecommerce"
                        cols={4}
                        color="bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                      />
                    )}

                    {/* Disbursements */}
                    {canEditOwner && (
                      <SectionHeader
                        label="Disbursements"
                        cols={2}
                        color="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                      />
                    )}

                    {/* Grand totals */}
                    {canViewAll && (
                      <SectionHeader
                        label="Day Totals"
                        cols={4}
                        color="bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                      />
                    )}

                    {/* Owner */}
                    {canEditOwner && (
                      <SectionHeader
                        label="Owner Cash"
                        cols={4}
                        color="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                      />
                    )}
                    {canEditOwner && (
                      <SectionHeader
                        label="Owner Bank"
                        cols={4}
                        color="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      />
                    )}
                    {canEditOwner && (
                      <SectionHeader
                        label="Owner Costs"
                        cols={6}
                        color="bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
                      />
                    )}
                  </tr>

                  {/* ── column header row 2 (field names) ── */}
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-600">
                    {/* per branch */}
                    {visibleStores.map(s => (
                      <>
                        <th key={`${s.id}-sale`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Sale</th>
                        <th key={`${s.id}-cash`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash</th>
                        <th key={`${s.id}-bank`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank</th>
                        <th key={`${s.id}-exon`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Ex/On</th>
                        <th key={`${s.id}-sal`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Salary</th>
                        <th key={`${s.id}-cost`} className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cost</th>
                        <th key={`${s.id}-det`} className="px-2 py-1.5 text-left  font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Details</th>
                      </>
                    ))}

                    {/* online */}
                    {canViewAll && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Sales</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Advance</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">SSLZC</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">COD</th>
                    </>)}

                    {/* disbursements */}
                    {canEditOwner && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">SSLZC Recv'd</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Pathao Recv'd</th>
                    </>)}

                    {/* totals */}
                    {canViewAll && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Sale</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Final Bank</th>
                    </>)}

                    {/* owner cash */}
                    {canEditOwner && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">+ Cash</th>
                      <th className="px-2 py-1.5 text-left  font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Details</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Cash</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">After Cost</th>
                    </>)}

                    {/* owner bank */}
                    {canEditOwner && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">+ Bank</th>
                      <th className="px-2 py-1.5 text-left  font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Details</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Total Bank</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">After Cost</th>
                    </>)}

                    {/* owner costs */}
                    {canEditOwner && (<>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Cash Cost</th>
                      <th className="px-2 py-1.5 text-left  font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Details</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Bank Cost</th>
                      <th className="px-2 py-1.5 text-left  font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Details</th>
                    </>)}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((row, idx) => {
                    const isToday = row.date === new Date().toISOString().split('T')[0];
                    const rowBg = isToday
                      ? 'bg-blue-50/60 dark:bg-blue-900/10'
                      : idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30';

                    return (
                      <tr key={row.date} className={`${rowBg} hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors`}>

                        {/* date */}
                        <td className="sticky left-0 z-10 px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-gray-700 text-xs bg-inherit">
                          {dayLabel(row.date)}
                          {isToday && <span className="ml-1 text-[9px] bg-blue-500 text-white rounded px-1">Today</span>}
                        </td>

                        {/* ── branch columns ── */}
                        {visibleStores.map(s => {
                          const b = row.branches.find(b => b.store_id === s.id);
                          if (!b) return (
                            <>
                              {Array.from({ length: BRANCH_COLS }).map((_, i) => (
                                <td key={i} className="px-2 py-1.5 text-gray-300">—</td>
                              ))}
                            </>
                          );
                          const canEdit = canEditBranch && (isAdmin || userStoreId === s.id);
                          return (
                            <>
                              <StatCell key="sale" value={b.daily_sale} />
                              <StatCell key="cash" value={b.daily_cash} />
                              <StatCell key="bank" value={b.daily_bank} />
                              <StatCell key="exon" value={b.ex_on} />
                              <EditCell
                                key="salary"
                                value={b.salary_set_aside}
                                disabled={!canEdit}
                                onSave={v => saveBranchField(row.date, s.id, { salary_set_aside: v })}
                              />
                              <EditCell
                                key="cost"
                                value={b.daily_cost}
                                disabled={!canEdit}
                                onSave={v => saveBranchField(row.date, s.id, { daily_cost: v })}
                              />
                              <NoteCell
                                key="det"
                                value={b.daily_cost_details}
                                disabled={!canEdit}
                                onSave={v => saveBranchField(row.date, s.id, { daily_cost_details: v })}
                              />
                            </>
                          );
                        })}

                        {/* ── online columns ── */}
                        {canViewAll && (<>
                          <StatCell value={row.online.daily_sales} />
                          <StatCell value={row.online.advance} highlight="blue" />
                          <StatCell value={row.online.online_payment} />
                          <StatCell value={row.online.cod} />
                        </>)}

                        {/* ── disbursements (admin editable) ── */}
                        {canEditOwner && (<>
                          <EditCell
                            value={row.disbursements.sslzc_received}
                            onSave={v => saveDisbursement(row.date, { sslzc_received: v })}
                          />
                          <EditCell
                            value={row.disbursements.pathao_received}
                            onSave={v => saveDisbursement(row.date, { pathao_received: v })}
                          />
                        </>)}

                        {/* ── grand totals (read-only computed) ── */}
                        {canViewAll && (<>
                          <StatCell value={row.totals.total_sale} highlight="green" />
                          <StatCell value={row.totals.cash} />
                          <StatCell value={row.totals.bank} />
                          <StatCell value={row.totals.final_bank} highlight="blue" />
                        </>)}

                        {/* ── owner cash ── */}
                        {canEditOwner && (<>
                          <EditCell
                            value={row.owner.boss_cash_add}
                            onSave={v => saveOwnerField(row.date, { boss_cash_add: v })}
                          />
                          <NoteCell
                            value={row.owner.boss_cash_add_details}
                            onSave={v => saveOwnerField(row.date, { boss_cash_add_details: v })}
                          />
                          <StatCell value={row.owner.total_cash} highlight="green" />
                          <StatCell value={row.owner.cash_after_cost} highlight="green" />
                        </>)}

                        {/* ── owner bank ── */}
                        {canEditOwner && (<>
                          <EditCell
                            value={row.owner.boss_bank_add}
                            onSave={v => saveOwnerField(row.date, { boss_bank_add: v })}
                          />
                          <NoteCell
                            value={row.owner.boss_bank_add_details}
                            onSave={v => saveOwnerField(row.date, { boss_bank_add_details: v })}
                          />
                          <StatCell value={row.owner.total_bank} highlight="blue" />
                          <StatCell value={row.owner.bank_after_cost} highlight="blue" />
                        </>)}

                        {/* ── owner costs ── */}
                        {canEditOwner && (<>
                          <EditCell
                            value={row.owner.boss_cash_cost}
                            onSave={v => saveOwnerField(row.date, { boss_cash_cost: v })}
                          />
                          <NoteCell
                            value={row.owner.boss_cash_cost_details}
                            onSave={v => saveOwnerField(row.date, { boss_cash_cost_details: v })}
                          />
                          <EditCell
                            value={row.owner.boss_bank_cost}
                            onSave={v => saveOwnerField(row.date, { boss_bank_cost: v })}
                          />
                          <NoteCell
                            value={row.owner.boss_bank_cost_details}
                            onSave={v => saveOwnerField(row.date, { boss_bank_cost_details: v })}
                          />
                        </>)}
                      </tr>
                    );
                  })}
                </tbody>

                {/* ── monthly summary (Final row) ── */}
                {summary && (
                  <tfoot>
                    <tr className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600 font-semibold">
                      <td className="sticky left-0 z-10 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-600 whitespace-nowrap">
                        Monthly Total
                      </td>

                      {visibleStores.map(s => {
                        const b = summary.branches.find(b => b.store_id === s.id);
                        return (<>
                          <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(b?.daily_sale ?? 0)}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(b?.daily_cash ?? 0)}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(b?.daily_bank ?? 0)}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(b?.ex_on ?? 0)}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(b?.salary_set_aside ?? 0)}</td>
                          <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(b?.daily_cost ?? 0)}</td>
                          <td />
                        </>);
                      })}

                      {canViewAll && (<>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.online.daily_sales)}</td>
                        <td className="px-2 py-2 text-right text-xs text-blue-600 dark:text-blue-400 tabular-nums">{fmt(summary.online.advance)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.online.online_payment)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.online.cod)}</td>
                      </>)}

                      {canEditOwner && (<>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.disbursements.sslzc_received)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.disbursements.pathao_received)}</td>
                      </>)}

                      {canViewAll && (<>
                        <td className="px-2 py-2 text-right text-xs text-emerald-700 dark:text-emerald-400 tabular-nums font-bold">{fmt(summary.totals.total_sale)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.totals.cash)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.totals.bank)}</td>
                        <td className="px-2 py-2 text-right text-xs text-blue-700 dark:text-blue-400 tabular-nums font-bold">{fmt(summary.totals.final_bank)}</td>
                      </>)}

                      {canEditOwner && (<>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.owner.boss_cash_add)}</td>
                        <td />
                        <td className="px-2 py-2 text-right text-xs text-emerald-700 dark:text-emerald-400 tabular-nums font-bold">{fmt(summary.owner.total_cash)}</td>
                        <td className="px-2 py-2 text-right text-xs text-emerald-700 dark:text-emerald-400 tabular-nums font-bold">{fmt(summary.owner.cash_after_cost)}</td>
                        <td className="px-2 py-2 text-right text-xs text-gray-800 dark:text-gray-200 tabular-nums">{fmt(summary.owner.boss_bank_add)}</td>
                        <td />
                        <td className="px-2 py-2 text-right text-xs text-blue-700 dark:text-blue-400 tabular-nums font-bold">{fmt(summary.owner.total_bank)}</td>
                        <td className="px-2 py-2 text-right text-xs text-blue-700 dark:text-blue-400 tabular-nums font-bold">{fmt(summary.owner.bank_after_cost)}</td>
                        <td className="px-2 py-2 text-right text-xs text-rose-600 dark:text-rose-400 tabular-nums">{fmt(summary.owner.boss_cash_cost)}</td>
                        <td />
                        <td className="px-2 py-2 text-right text-xs text-rose-600 dark:text-rose-400 tabular-nums">{fmt(summary.owner.boss_bank_cost)}</td>
                        <td />
                      </>)}
                    </tr>

                    {/* ── 4-box summary ── */}
                    {canViewAll && summary && (
                      <tr>
                        <td colSpan={999} className="px-4 py-4 bg-white dark:bg-gray-900">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
                            {[
                              { label: 'Total Cash Collected', value: summary.owner.total_cash, color: 'emerald' },
                              { label: 'Total Bank Deposit', value: summary.totals.final_bank, color: 'blue' },
                              { label: 'Cash After Costs', value: summary.owner.cash_after_cost, color: 'green' },
                              { label: 'Bank After Costs', value: summary.owner.bank_after_cost, color: 'indigo' },
                            ].map(box => (
                              <div key={box.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">{box.label}</div>
                                <div className={`text-base font-bold tabular-nums
                                  ${box.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' :
                                    box.color === 'blue' ? 'text-blue-600 dark:text-blue-400' :
                                      box.color === 'green' ? 'text-green-600 dark:text-green-400' :
                                        'text-indigo-600 dark:text-indigo-400'}`}>
                                  ৳{Math.round(box.value).toLocaleString('en-BD')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* ── legend ── */}
          <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-gray-400 dark:text-gray-500">
            <span>📌 Click any editable cell to update. Press Enter or click ✓ to save.</span>
            {isBranch && <span>🔒 You can only edit your own branch fields.</span>}
            <span>Cash = branch cash only. Bank = branch bank + online advance.</span>
          </div>

        </main>
      </div>

      {/* ── toast ── */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white transition-all
          ${toast.ok ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.ok ? <Check size={14} className="inline mr-1.5" /> : <X size={14} className="inline mr-1.5" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
