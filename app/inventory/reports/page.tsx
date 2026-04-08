'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useTheme } from '@/contexts/ThemeContext';
import businessAnalyticsService, { type CommandCenterResponse, type NamedValue, type ReportingFilters } from '@/services/businessAnalyticsService';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  DollarSign,
  Download,
  Gauge,
  LayoutGrid,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Warehouse,
  Zap,
} from 'lucide-react';

import SalesTrendCard from './components/SalesTrendCard';
import BestSellersCard from './components/BestSellersCard';
import StockWatchlistCard from './components/StockWatchlistCard';
import HourlyPulseCard from './components/HourlyPulseCard';
import BranchPerformanceCard from './components/BranchPerformanceCard';
import MixChartsSection from './components/MixChartsSection';

function currency(value: number) {
  return new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function percent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function sumNamedValues(items: NamedValue[] = []) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function maxNamedValue(items: NamedValue[] = []) {
  if (!items.length) return null;
  return items.reduce((best, item) => (item.value > best.value ? item : best), items[0]);
}

function scoreTone(score: number) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Strong';
  if (score >= 40) return 'Watch';
  return 'Critical';
}

function getRangeLabel(from?: string, to?: string) {
  if (!from || !to) return 'Custom range';
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  if (days <= 1) return 'Today';
  if (days <= 7) return 'Last 7 days';
  if (days <= 30) return 'Last 30 days';
  if (days <= 90) return 'Quarter view';
  return `${days} days`;
}

function GlassMetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: any;
  accent: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-white/50 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-white/70 to-transparent blur-2xl dark:from-white/10" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400 dark:text-slate-500">{label}</p>
          <div className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
          <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{sub}</p>
        </div>
        <div className={`rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg ${accent}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function TinySignal({ label, value, tone }: { label: string; value: string; tone: 'green' | 'amber' | 'blue' | 'red' }) {
  const toneMap = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
    blue: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900/50',
    red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
  } as const;

  return (
    <div className={`rounded-2xl px-3 py-3 ring-1 ${toneMap[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-70">{label}</div>
      <div className="mt-1 text-base font-black">{value}</div>
    </div>
  );
}

export default function InventoryReportsPage() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<CommandCenterResponse['data'] | null>(null);
  const [filters, setFilters] = useState<ReportingFilters>({ from: todayStr(-29), to: todayStr() });

  const loadData = async (silent = false) => {
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError('');
      const res = await businessAnalyticsService.getCommandCenter(filters);
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load command center');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headlineCards = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    return [
      { label: 'Net Sales', value: currency(k.net_sales), icon: DollarSign, accent: 'from-emerald-500 to-teal-400', sub: `${k.total_orders} orders` },
      { label: 'Gross Profit', value: currency(k.gross_profit), icon: TrendingUp, accent: 'from-indigo-500 to-cyan-400', sub: `Margin ${percent(k.margin_pct)}` },
      { label: 'Inventory Value', value: currency(k.inventory_value), icon: Boxes, accent: 'from-amber-500 to-orange-400', sub: `${k.low_stock_count} low stock` },
      { label: 'Repeat Customers', value: String(k.repeat_customers), icon: Users, accent: 'from-fuchsia-500 to-pink-400', sub: `${percent(k.repeat_customer_rate)} repeat rate` },
    ];
  }, [data]);

  const executiveSnapshot = useMemo(() => {
    if (!data) return null;

    const k = data.kpis;
    const topStatus = maxNamedValue(data.status_mix);
    const topChannel = maxNamedValue(data.order_type_mix);
    const topPaymentState = maxNamedValue(data.payment_status_mix);
    const topCategory = maxNamedValue(data.category_performance);
    const topPaymentMethod = maxNamedValue(data.payment_method_mix);
    const topBranch = data.branch_performance?.length
      ? data.branch_performance.reduce((best, row) => (row.net_sales > best.net_sales ? row : best), data.branch_performance[0])
      : null;
    const topProduct = data.top_products?.[0] || null;
    const hourlyPeak = data.today_hourly_orders?.length
      ? data.today_hourly_orders.reduce((best, row) => (row.value > best.value ? row : best), data.today_hourly_orders[0])
      : null;

    const demandScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (k.margin_pct * 0.35) +
          (Math.min(k.repeat_customer_rate, 100) * 0.25) +
          ((k.total_orders ? (k.total_orders - k.return_count) / k.total_orders : 1) * 100 * 0.25) +
          ((k.out_of_stock_count === 0 ? 100 : Math.max(0, 100 - k.out_of_stock_count * 5)) * 0.15)
        )
      )
    );

    const stockRiskShare = k.low_stock_count + k.out_of_stock_count;
    const stockHealth = Math.max(0, Math.min(100, 100 - (stockRiskShare * 2.5)));
    const refundRate = k.gross_sales > 0 ? (k.refund_amount / k.gross_sales) * 100 : 0;
    const avgUnitsPerOrder = k.total_orders > 0 ? k.total_units / k.total_orders : 0;
    const topFiveRevenue = (data.top_products || []).slice(0, 5).reduce((sum, row) => sum + row.revenue, 0);
    const topFiveConcentration = k.net_sales > 0 ? (topFiveRevenue / k.net_sales) * 100 : 0;
    const totalPulse = sumNamedValues(data.today_hourly_orders);

    return {
      demandScore,
      demandTone: scoreTone(demandScore),
      stockHealth,
      stockTone: scoreTone(stockHealth),
      refundRate,
      avgUnitsPerOrder,
      topFiveConcentration,
      totalPulse,
      topStatus,
      topChannel,
      topPaymentState,
      topCategory,
      topPaymentMethod,
      topBranch,
      topProduct,
      hourlyPeak,
    };
  }, [data]);

  const exportCsv = async () => {
    const response = await businessAnalyticsService.exportSummary(filters);
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `command-center-${filters.from || 'from'}-${filters.to || 'to'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setPreset = (days: number) => {
    const next = { ...filters, from: todayStr(-(days - 1)), to: todayStr() };
    setFilters(next);
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header toggleSidebar={() => setSidebarOpen(true)} darkMode={darkMode} setDarkMode={setDarkMode} />
          <main className="flex-1 overflow-y-auto">
            <div className="relative p-4 md:p-6 xl:p-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.20),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.8),rgba(241,245,249,0))] dark:bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.85),rgba(2,6,23,0))]" />

              <div className="relative space-y-8">
                <section className="overflow-hidden rounded-[32px] border border-white/60 bg-white/75 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/5">
                  <div className="grid gap-0 xl:grid-cols-[1.35fr_0.9fr]">
                    <div className="relative overflow-hidden p-6 md:p-8 xl:p-10">
                      <div className="absolute -left-16 top-0 h-40 w-40 rounded-full bg-indigo-500/15 blur-3xl" />
                      <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />
                      <div className="relative">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200/70 bg-indigo-50/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                          <Sparkles className="h-3.5 w-3.5" /> Owner View
                        </div>
                        <h1 className="max-w-4xl text-3xl font-black tracking-tight text-slate-950 md:text-5xl dark:text-white">
                          Inventory intelligence that tells you exactly where money is moving, leaking, and waiting.
                        </h1>
                        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 md:text-base dark:text-slate-300">
                          One cinematic command center for sales velocity, product pressure, branch performance, repeat behavior, and restock urgency.
                        </p>

                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                          <TinySignal label="Range" value={getRangeLabel(filters.from, filters.to)} tone="blue" />
                          <TinySignal label="Demand score" value={executiveSnapshot ? `${executiveSnapshot.demandScore}/100` : '--'} tone="green" />
                          <TinySignal label="Stock health" value={executiveSnapshot ? `${Math.round(executiveSnapshot.stockHealth)}/100` : '--'} tone={executiveSnapshot && executiveSnapshot.stockHealth < 50 ? 'red' : 'amber'} />
                        </div>

                        <div className="mt-8 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
                            <Search className="h-4 w-4 text-slate-400" />
                            <input
                              type="text"
                              placeholder="Filter by SKU"
                              value={filters.sku || ''}
                              onChange={(e) => setFilters((p) => ({ ...p, sku: e.target.value }))}
                              className="w-36 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                            />
                          </div>

                          <div className="flex items-center rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
                            <input
                              type="date"
                              value={filters.from || ''}
                              onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
                              className="bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-slate-200"
                            />
                            <ArrowRight className="mx-2 h-4 w-4 text-slate-300" />
                            <input
                              type="date"
                              value={filters.to || ''}
                              onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
                              className="bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-slate-200"
                            />
                          </div>

                          <button
                            onClick={() => loadData()}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/10 transition-all hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                          >
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh view
                          </button>

                          <button
                            onClick={exportCsv}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-3 text-sm font-black text-slate-700 transition-all hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
                          >
                            <Download className="h-4 w-4" /> Export CSV
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {[
                            { label: '7D', days: 7 },
                            { label: '30D', days: 30 },
                            { label: '90D', days: 90 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              onClick={() => setPreset(preset.days)}
                              className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/50 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 text-white xl:border-l xl:border-t-0 dark:border-white/10 md:p-8">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-200/70">Executive pulse</div>
                          <div className="mt-2 text-2xl font-black">What the owner should notice first</div>
                        </div>
                        <div className="rounded-2xl bg-white/10 p-3">
                          <Gauge className="h-5 w-5 text-indigo-200" />
                        </div>
                      </div>

                      {executiveSnapshot ? (
                        <div className="mt-6 space-y-4">
                          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-xs font-black uppercase tracking-[0.22em] text-white/50">Primary lever</div>
                                <div className="mt-2 text-lg font-black">
                                  {executiveSnapshot.topBranch ? `${executiveSnapshot.topBranch.store_name} is leading sales` : 'Branch leader unavailable'}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-indigo-100/80">
                                  {executiveSnapshot.topBranch
                                    ? `${currency(executiveSnapshot.topBranch.net_sales)} sales with ${percent(executiveSnapshot.topBranch.margin_pct)} margin.`
                                    : 'Review branch performance once data is available.'}
                                </p>
                              </div>
                              <Warehouse className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">Fastest mover</div>
                              <div className="mt-2 text-sm font-bold leading-6 text-white">{executiveSnapshot.topProduct?.name || 'No product data'}</div>
                              <div className="mt-2 text-xs text-white/65">Revenue {executiveSnapshot.topProduct ? currency(executiveSnapshot.topProduct.revenue) : '--'}</div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">Peak hour</div>
                              <div className="mt-2 text-sm font-bold leading-6 text-white">{executiveSnapshot.hourlyPeak?.label || 'No pulse yet'}</div>
                              <div className="mt-2 text-xs text-white/65">{executiveSnapshot.hourlyPeak?.value || 0} orders observed</div>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 p-4 ring-1 ring-white/10">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200/70">Demand score</div>
                              <div className="mt-2 text-3xl font-black">{executiveSnapshot.demandScore}</div>
                              <div className="mt-1 text-xs text-emerald-100/70">{executiveSnapshot.demandTone}</div>
                            </div>
                            <div className="rounded-2xl bg-gradient-to-br from-amber-400/15 to-rose-400/10 p-4 ring-1 ring-white/10">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/70">Stock health</div>
                              <div className="mt-2 text-3xl font-black">{Math.round(executiveSnapshot.stockHealth)}</div>
                              <div className="mt-1 text-xs text-amber-100/70">{executiveSnapshot.stockTone}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
                          Waiting for executive metrics...
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {loading ? (
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-36 animate-pulse rounded-[28px] border border-white/50 bg-white/70 dark:border-white/10 dark:bg-white/5" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                    <div className="flex items-center gap-3 text-base font-semibold">
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      {error}
                    </div>
                  </div>
                ) : data ? (
                  <div className="space-y-8 animate-in fade-in duration-700">
                    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                      {headlineCards.map((card) => (
                        <GlassMetricCard
                          key={card.label}
                          label={card.label}
                          value={card.value}
                          sub={card.sub}
                          icon={card.icon}
                          accent={card.accent}
                        />
                      ))}
                    </section>

                    <section className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
                      <div className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.30)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:p-6">
                        <div className="mb-5 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-400 dark:text-slate-500">Owner summary</div>
                            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Commercial health at a glance</h2>
                          </div>
                          <div className="rounded-2xl bg-indigo-50 p-3 dark:bg-indigo-500/10">
                            <LayoutGrid className="h-5 w-5 text-indigo-500" />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">AOV</div>
                              <CircleDollarSign className="h-4 w-4 text-indigo-500" />
                            </div>
                            <div className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{currency(data.kpis.avg_order_value)}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Average basket value</div>
                          </div>

                          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Units / order</div>
                              <Package className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{executiveSnapshot?.avgUnitsPerOrder.toFixed(1) || '0.0'}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">How dense each sale is</div>
                          </div>

                          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Refund rate</div>
                              <ShieldAlert className="h-4 w-4 text-rose-500" />
                            </div>
                            <div className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{percent(executiveSnapshot?.refundRate || 0)}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Against gross sales</div>
                          </div>

                          <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Top 5 concentration</div>
                              <Target className="h-4 w-4 text-amber-500" />
                            </div>
                            <div className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{percent(executiveSnapshot?.topFiveConcentration || 0)}</div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Dependence on winners</div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {[
                            {
                              label: 'Dominant order status',
                              value: executiveSnapshot?.topStatus?.label || '—',
                              note: executiveSnapshot?.topStatus ? `${executiveSnapshot.topStatus.value} orders` : 'No data',
                              icon: Activity,
                            },
                            {
                              label: 'Dominant channel',
                              value: executiveSnapshot?.topChannel?.label || '—',
                              note: executiveSnapshot?.topChannel ? `${executiveSnapshot.topChannel.value} orders` : 'No data',
                              icon: ShoppingBag,
                            },
                            {
                              label: 'Top payment state',
                              value: executiveSnapshot?.topPaymentState?.label || '—',
                              note: executiveSnapshot?.topPaymentState ? `${executiveSnapshot.topPaymentState.value} events` : 'No data',
                              icon: CalendarDays,
                            },
                            {
                              label: 'Top category',
                              value: executiveSnapshot?.topCategory?.label || '—',
                              note: executiveSnapshot?.topCategory ? `${executiveSnapshot.topCategory.value} impact` : 'No data',
                              icon: Boxes,
                            },
                            {
                              label: 'Top payment method',
                              value: executiveSnapshot?.topPaymentMethod?.label || '—',
                              note: executiveSnapshot?.topPaymentMethod ? `${executiveSnapshot.topPaymentMethod.value} uses` : 'No data',
                              icon: DollarSign,
                            },
                            {
                              label: 'Today pulse',
                              value: String(executiveSnapshot?.totalPulse || 0),
                              note: 'Total hourly observed orders',
                              icon: Zap,
                            },
                          ].map((item) => {
                            const Icon = item.icon;
                            return (
                              <div key={item.label} className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{item.label}</div>
                                  <Icon className="h-4 w-4 text-slate-400" />
                                </div>
                                <div className="mt-3 text-lg font-black text-slate-950 dark:text-white capitalize">{item.value}</div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.note}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.30)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:p-6">
                        <div className="mb-5 flex items-center justify-between">
                          <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-400 dark:text-slate-500">Restock radar</div>
                            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Where inventory needs intervention</h2>
                          </div>
                          <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-500/10">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-rose-50 p-5 ring-1 ring-amber-100 dark:from-amber-950/30 dark:to-rose-950/20 dark:ring-amber-900/40">
                            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600 dark:text-amber-300">Risk count</div>
                            <div className="mt-3 flex items-end gap-3">
                              <div className="text-4xl font-black text-slate-950 dark:text-white">{data.kpis.low_stock_count + data.kpis.out_of_stock_count}</div>
                              <div className="pb-1 text-sm font-semibold text-slate-500 dark:text-slate-400">products need attention</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Low stock</div>
                              <div className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{data.kpis.low_stock_count}</div>
                            </div>
                            <div className="rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Out of stock</div>
                              <div className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{data.kpis.out_of_stock_count}</div>
                            </div>
                          </div>

                          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Lead action</div>
                            <div className="mt-2 text-sm font-bold leading-6 text-slate-800 dark:text-slate-200">
                              {data.stock_watchlist?.[0]
                                ? `${data.stock_watchlist[0].name} is most urgent with a shortage of ${data.stock_watchlist[0].shortage}.`
                                : 'No critical stock watch item found.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    <SalesTrendCard initialData={data.sales_trend} initialFilters={{ from: filters.from as string, to: filters.to as string }} />

                    <MixChartsSection
                      statusMix={data.status_mix}
                      channelMix={data.order_type_mix}
                      paymentMix={data.payment_status_mix}
                    />

                    <div className="grid gap-8 xl:grid-cols-3">
                      <div className="xl:col-span-2">
                        <BestSellersCard initialData={data.top_products} initialFilters={{ from: filters.from as string, to: filters.to as string, store_id: filters.store_id, sku: filters.sku }} />
                      </div>
                      <div>
                        <StockWatchlistCard initialData={data.stock_watchlist} storeId={filters.store_id} />
                      </div>
                    </div>

                    <div className="grid gap-8 xl:grid-cols-2">
                      <BranchPerformanceCard initialData={data.branch_performance} initialFilters={{ from: filters.from as string, to: filters.to as string, sku: filters.sku }} />
                      <HourlyPulseCard data={data.today_hourly_orders} />
                    </div>

                    <section className="rounded-[28px] border border-white/60 bg-white/80 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.30)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:p-6">
                      <div className="mb-6 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-400 dark:text-slate-500">Strategic narrative</div>
                          <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">AI-style takeaways for the owner</h2>
                        </div>
                        <div className="rounded-2xl bg-indigo-50 p-3 dark:bg-indigo-500/10">
                          <Sparkles className="h-5 w-5 text-indigo-500" />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {(data.insights || []).map((insight, i) => (
                          <div key={i} className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400" />
                            <div className="mb-4 inline-flex rounded-2xl bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                              Insight {String(i + 1).padStart(2, '0')}
                            </div>
                            <p className="text-sm font-medium leading-7 text-slate-700 dark:text-slate-300">{insight}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}