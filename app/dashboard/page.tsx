import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock,
  Globe2,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import axios from "axios";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/contexts/ThemeContext";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

type AnyObj = Record<string, any>;

interface DashboardData {
  todayMetrics: AnyObj | null;
  last30Days: AnyObj | null;
  salesByChannel: AnyObj | null;
  topStores: AnyObj | null;
  topProducts: AnyObj | null;
  slowMoving: AnyObj | null;
  lowStock: AnyObj | null;
  inventoryAge: AnyObj | null;
  operations: AnyObj | null;
}

const panelClass =
  "rounded-3xl border border-slate-200/80 bg-white/95 shadow-sm dark:border-slate-800 dark:bg-slate-950/80";

export default function FounderDashboard() {
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month">("today");
  const [branchFilter] = useState("all");

  const [data, setData] = useState<DashboardData>({
    todayMetrics: null,
    last30Days: null,
    salesByChannel: null,
    topStores: null,
    topProducts: null,
    slowMoving: null,
    lowStock: null,
    inventoryAge: null,
    operations: null,
  });

  const extractPayload = (raw: any) => {
    const payload = raw?.data;
    if (!payload || payload?.success === false) return null;
    return payload?.data ?? payload;
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const fetchEndpoint = async (endpoint: string, params?: any) => {
        try {
          const res = await axiosInstance.get(endpoint, { params });
          return extractPayload(res);
        } catch (err: any) {
          console.error(`Error fetching ${endpoint}:`, err?.response?.data || err?.message || err);
          return null;
        }
      };

      const storeParams = branchFilter !== "all" ? { store_id: branchFilter } : {};

      const [
        todayMetrics,
        last30Days,
        salesByChannel,
        topStores,
        topProducts,
        slowMoving,
        lowStock,
        inventoryAge,
        operations,
      ] = await Promise.all([
        fetchEndpoint("/dashboard/today-metrics", storeParams),
        fetchEndpoint("/dashboard/last-30-days-sales", storeParams),
        fetchEndpoint("/dashboard/sales-by-channel", { ...storeParams, period: timeFilter }),
        fetchEndpoint("/dashboard/top-stores", { ...storeParams, period: timeFilter, limit: 10 }),
        fetchEndpoint("/dashboard/today-top-products", { ...storeParams, limit: 8 }),
        fetchEndpoint("/dashboard/slow-moving-products", { ...storeParams, limit: 8, days: 90 }),
        fetchEndpoint("/dashboard/low-stock-products", { ...storeParams, threshold: 10 }),
        fetchEndpoint("/dashboard/inventory-age-by-value", storeParams),
        fetchEndpoint("/dashboard/operations-today", storeParams),
      ]);

      setData({
        todayMetrics,
        last30Days,
        salesByChannel,
        topStores,
        topProducts,
        slowMoving,
        lowStock,
        inventoryAge,
        operations,
      });

      if (!todayMetrics && !last30Days && !salesByChannel) {
        setError("Failed to load critical dashboard data. Please check your connection.");
      }
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
      setError(err?.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter, branchFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatCurrency = (amount: number | null | undefined) => {
    const value = Number(amount ?? 0);
    if (!Number.isFinite(value)) return "৳ 0";
    return `৳ ${value.toLocaleString("en-BD")}`;
  };

  const formatPercentage = (value: number | null | undefined, digits = 1) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0%";
    return `${num.toFixed(digits)}%`;
  };

  const compactNumber = (value: number | null | undefined) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return "0";
    if (Math.abs(num) >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
    if (Math.abs(num) >= 100000) return `${(num / 100000).toFixed(1)}L`;
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return `${num.toFixed(0)}`;
  };

  const metrics = data.todayMetrics ?? null;
  const sales30Days = data.last30Days ?? null;
  const channels = data.salesByChannel ?? null;
  const topStores = data.topStores ?? null;
  const topProducts = data.topProducts ?? null;
  const slowMoving = data.slowMoving ?? null;
  const lowStock = data.lowStock ?? null;
  const inventoryAge = data.inventoryAge ?? null;
  const operations = data.operations ?? null;

  const todaySales = Number(metrics?.total_sales ?? 0);
  const paidSales = Number(metrics?.paid_sales ?? 0);
  const todayOrders = Number(metrics?.order_count ?? 0);
  const aov = Number(metrics?.average_order_value ?? 0);
  const grossMargin = Number(metrics?.gross_margin ?? 0);
  const grossMarginPct = Number(metrics?.gross_margin_percentage ?? 0);
  const netProfit = Number(metrics?.net_profit ?? 0);
  const receivable = Number(metrics?.cash_snapshot?.accounts_receivable ?? 0);
  const payable = Number(metrics?.cash_snapshot?.accounts_payable ?? 0);
  const cashPosition = Number(metrics?.cash_snapshot?.net_position ?? paidSales - payable);
  const mtdSales = Number(metrics?.mtd_sales ?? sales30Days?.month_to_date_sales ?? sales30Days?.total_sales ?? 0);
  const mtdTarget = metrics?.mtd_target ? Number(metrics.mtd_target) : 0;

  const dailySales = useMemo(() => {
    const list = Array.isArray(sales30Days?.daily_sales) ? sales30Days.daily_sales : [];
    return list.map((item: AnyObj) => ({
      date: item?.date,
      day: item?.day_name,
      total_sales: Number(item?.total_sales ?? 0),
      paid_amount: Number(item?.paid_amount ?? 0),
      order_count: Number(item?.order_count ?? 0),
    }));
  }, [sales30Days]);

  const pipelineStages = useMemo(() => {
    const ops = operations?.operations_status || operations?.status_breakdown || operations?.pipeline || null;
    if (!ops) return [] as Array<{ key: string; label: string; count: number; description?: string }>;

    const orderedKeys = [
      "pending",
      "confirmed",
      "processing",
      "ready_for_pickup",
      "shipped",
      "delivered",
      "cancelled",
    ];

    const normalized = orderedKeys
      .filter((key) => ops[key])
      .map((key) => ({
        key,
        label: ops[key]?.label || key.replace(/_/g, " "),
        count: Number(ops[key]?.count ?? 0),
        description: ops[key]?.description,
      }));

    if (normalized.length) return normalized;

    return Object.entries(ops).map(([key, value]: any) => ({
      key,
      label: value?.label || key.replace(/_/g, " "),
      count: Number(value?.count ?? 0),
      description: value?.description,
    }));
  }, [operations]);

  const channelRows = useMemo(() => {
    const rows = Array.isArray(channels?.channels) ? channels.channels : [];
    const total = Math.max(Number(channels?.total_sales ?? 0), 1);
    return rows.map((row: AnyObj) => ({
      key: row.channel,
      label: row.channel_label,
      sales: Number(row.total_sales ?? 0),
      paid: Number(row.paid_amount ?? 0),
      orders: Number(row.order_count ?? 0),
      share: Number(row.percentage ?? 0),
      aov: Number(row.order_count ?? 0) > 0 ? Number(row.total_sales ?? 0) / Number(row.order_count ?? 1) : 0,
      width: `${Math.max(8, (Number(row.total_sales ?? 0) / total) * 100)}%`,
    }));
  }, [channels]);

  const storeRows = useMemo(() => {
    const rows = Array.isArray(topStores?.top_stores) ? topStores.top_stores : [];
    return rows.map((row: AnyObj, index: number) => ({
      rank: Number(row.rank ?? index + 1),
      name: row.store_name || "Unknown Store",
      location: row.store_location || "—",
      type: row.store_type || "store",
      sales: Number(row.total_sales ?? 0),
      orders: Number(row.order_count ?? 0),
      aov: Number(row.average_order_value ?? 0),
      contribution: Number(row.contribution_percentage ?? 0),
    }));
  }, [topStores]);

  const inventoryCategories = useMemo(() => {
    const rows = Array.isArray(inventoryAge?.age_categories) ? inventoryAge.age_categories : [];
    return rows.map((row: AnyObj, index: number) => ({
      label: row.label || row.age_range || `Bucket ${index + 1}`,
      value: Number(row.inventory_value ?? 0),
      quantity: Number(row.quantity ?? 0),
      percent: Number(row.percentage_of_total ?? 0),
      tone: ["bg-emerald-500", "bg-sky-500", "bg-amber-500", "bg-rose-500"][index] || "bg-slate-500",
    }));
  }, [inventoryAge]);

  const outOfStockRows = Array.isArray(lowStock?.out_of_stock) ? lowStock.out_of_stock : [];
  const lowStockRows = Array.isArray(lowStock?.low_stock) ? lowStock.low_stock : [];
  const stockRiskRows = [...outOfStockRows, ...lowStockRows].slice(0, 8);

  const topProductRows = useMemo(() => {
    const rows = Array.isArray(topProducts?.top_products) ? topProducts.top_products : [];
    const lowStockMap = new Map<number, AnyObj>();
    [...outOfStockRows, ...lowStockRows].forEach((item: AnyObj) => {
      lowStockMap.set(Number(item.product_id), item);
    });
    const slowMovingMap = new Map<number, AnyObj>();
    const slowRows = Array.isArray(slowMoving?.slow_moving_products) ? slowMoving.slow_moving_products : [];
    slowRows.forEach((item: AnyObj) => slowMovingMap.set(Number(item.product_id), item));

    return rows.map((row: AnyObj) => {
      const stockRisk = lowStockMap.get(Number(row.product_id));
      const slowRisk = slowMovingMap.get(Number(row.product_id));
      let status = "Healthy";
      if (stockRisk?.status === "out_of_stock") status = "Out of stock";
      else if (stockRisk?.status === "low_stock") status = "Low stock";
      else if (slowRisk) status = "Slow moving";

      return {
        id: Number(row.product_id),
        name: row.product_name || "Unknown Product",
        sku: row.product_sku || "—",
        revenue: Number(row.total_revenue ?? 0),
        units: Number(row.total_quantity_sold ?? 0),
        orders: Number(row.order_count ?? 0),
        averagePrice: Number(row.average_price ?? 0),
        status,
        stock: stockRisk ? Number(stockRisk.current_stock ?? 0) : null,
      };
    });
  }, [topProducts, lowStock, slowMoving, outOfStockRows, lowStockRows]);

  const deadStockValue = useMemo(() => {
    const staleBucket = inventoryCategories.find((item) => item.label.toLowerCase().includes("90"));
    return Number(staleBucket?.value ?? 0);
  }, [inventoryCategories]);

  const criticalAlertItems = useMemo(() => {
    const items: Array<{ severity: "critical" | "warning"; issue: string; count: number; note: string; owner: string; action: string }> = [];
    const oosCount = Number(lowStock?.summary?.out_of_stock_count ?? 0);
    const lowCount = Number(lowStock?.summary?.low_stock_count ?? 0);
    const overdue = Number(operations?.summary?.overdue_orders ?? operations?.summary?.pending_orders ?? 0);
    const cancelled = Number(operations?.summary?.cancelled_orders ?? 0);

    if (oosCount > 0) {
      items.push({
        severity: "critical",
        issue: "OOS on live SKUs",
        count: oosCount,
        note: `${formatCurrency(deadStockValue)} already tied up in 90+ day inventory`,
        owner: "Inventory",
        action: "Replenish / transfer",
      });
    }

    if (overdue > 0) {
      items.push({
        severity: "warning",
        issue: "Orders needing attention",
        count: overdue,
        note: "Pending/confirmed orders are building up",
        owner: "Operations",
        action: "Review queue",
      });
    }

    if (lowCount > 0) {
      items.push({
        severity: "warning",
        issue: "Low-stock coverage",
        count: lowCount,
        note: "Fast movers may go OOS next",
        owner: "Merchandising",
        action: "Raise replenishment",
      });
    }

    if (cancelled > 0) {
      items.push({
        severity: "warning",
        issue: "Cancelled orders",
        count: cancelled,
        note: "Check payment, stock, or fulfillment friction",
        owner: "Sales Ops",
        action: "Investigate root cause",
      });
    }

    return items.slice(0, 4);
  }, [lowStock, operations, deadStockValue]);

  const opportunities = useMemo(() => {
    const bestChannel = [...channelRows].sort((a, b) => b.sales - a.sales)[0];
    const bestStore = [...storeRows].sort((a, b) => b.sales - a.sales)[0];
    const bestProduct = [...topProductRows].sort((a, b) => b.revenue - a.revenue)[0];
    const freshInventory = inventoryCategories.find((item) => item.label.includes("0-30"));

    return [
      bestChannel && bestChannel.sales > 0
        ? {
            title: `${bestChannel.label} is leading`,
            body: `${formatCurrency(bestChannel.sales)} from ${bestChannel.orders} orders today.`,
          }
        : null,
      bestStore && bestStore.sales > 0
        ? {
            title: `${bestStore.name} is your top store`,
            body: `${formatCurrency(bestStore.sales)} revenue with ${formatPercentage(bestStore.contribution)} contribution.`,
          }
        : null,
      bestProduct && bestProduct.revenue > 0
        ? {
            title: `Top product is ${bestProduct.name}`,
            body: `${formatCurrency(bestProduct.revenue)} revenue from ${bestProduct.units} units sold.`,
          }
        : null,
      freshInventory && freshInventory.value > 0
        ? {
            title: "Fresh inventory is healthy",
            body: `${formatPercentage(freshInventory.percent)} of stock value is aged 0-30 days.`,
          }
        : null,
    ].filter(Boolean) as Array<{ title: string; body: string }>;
  }, [channelRows, storeRows, topProductRows, inventoryCategories]);

  const salesForecast = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (!mtdSales || !dayOfMonth) return 0;
    return (mtdSales / dayOfMonth) * daysInMonth;
  }, [mtdSales]);

  const progressToTarget = mtdTarget > 0 ? (mtdSales / mtdTarget) * 100 : 0;
  const criticalAlertCount = criticalAlertItems.filter((item) => item.severity === "critical").length;
  const warningAlertCount = criticalAlertItems.filter((item) => item.severity === "warning").length;

  if (loading && !data.todayMetrics) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex flex-1 items-center justify-center overflow-auto p-6">
              <div className="text-center">
                <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-sky-500" />
                <p className="mb-2 text-xl text-slate-900 dark:text-white">Loading founder dashboard…</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Pulling live sales, stock, and operations signals.</p>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data.todayMetrics && !data.last30Days) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
          <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
            <main className="flex flex-1 items-center justify-center overflow-auto p-6">
              <div className="max-w-md text-center">
                <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-rose-500" />
                <p className="mb-4 text-xl text-slate-900 dark:text-white">Error loading dashboard</p>
                <p className="mb-6 text-slate-600 dark:text-slate-400">{error}</p>
                <button
                  onClick={fetchDashboardData}
                  className="rounded-xl bg-slate-900 px-6 py-3 text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  Try again
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto">
            <div className="min-h-full bg-slate-100 dark:bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.08),_transparent_30%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
              <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
                {error && (data.todayMetrics || data.last30Days) && (
                  <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="flex-1">Some sections are showing partial data. Refresh after checking the backend logs.</span>
                    <button
                      onClick={handleRefresh}
                      disabled={refreshing}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-400/30 dark:hover:bg-amber-500/10"
                    >
                      {refreshing ? "Refreshing…" : "Retry"}
                    </button>
                  </div>
                )}

                <section className={`${panelClass} px-5 py-5 sm:px-6`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-400">
                        Founder Dashboard
                      </p>
                      <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                        Business health, risk, and action summary
                      </h1>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        One-page command center for revenue, inventory, stores, and operations.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900/70">
                        {[
                          { key: "today", label: "Today" },
                          { key: "month", label: "MTD" },
                        ].map((option) => (
                          <button
                            key={option.key}
                            onClick={() => setTimeFilter(option.key as "today" | "month")}
                            className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                              timeFilter === option.key
                                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                                : "text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-800"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 sm:flex">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <span>Live · just updated</span>
                      </div>

                      <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 transition hover:bg-white disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800"
                      >
                        <RefreshCw className={`h-4 w-4 text-slate-700 dark:text-slate-200 ${refreshing ? "animate-spin" : ""}`} />
                      </button>

                      <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                        <Bell className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                        {(criticalAlertCount > 0 || warningAlertCount > 0) && (
                          <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                            {criticalAlertCount + warningAlertCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <ExecutiveCard
                    label="Net Sales"
                    value={formatCurrency(todaySales)}
                    tone={todaySales > 0 ? "positive" : "neutral"}
                    icon={<ShoppingBag className="h-4 w-4" />}
                    subline={`${todayOrders} orders today`}
                    footer={`MTD ${formatCurrency(mtdSales)}`}
                  />
                  <ExecutiveCard
                    label="Gross Profit"
                    value={formatCurrency(grossMargin)}
                    tone={grossMargin >= 0 ? "positive" : "negative"}
                    icon={<ArrowUpRight className="h-4 w-4" />}
                    subline={`${formatPercentage(grossMarginPct)} gross margin`}
                    footer={`Net profit ${formatCurrency(netProfit)}`}
                  />
                  <ExecutiveCard
                    label="Cash Position"
                    value={formatCurrency(cashPosition)}
                    tone={cashPosition >= 0 ? "positive" : "negative"}
                    icon={<Wallet className="h-4 w-4" />}
                    subline={`Collected ${formatCurrency(paidSales)}`}
                    footer={`AR ${formatCurrency(receivable)} · AP ${formatCurrency(payable)}`}
                  />
                  <ExecutiveCard
                    label="Orders / AOV"
                    value={`${todayOrders} / ${formatCurrency(aov)}`}
                    tone={todayOrders > 0 ? "positive" : "neutral"}
                    icon={<Package className="h-4 w-4" />}
                    subline="Orders and basket size"
                    footer={`30-day orders ${Number(sales30Days?.total_orders ?? 0)}`}
                  />
                  <ExecutiveCard
                    label="Inventory Risk"
                    value={`${Number(lowStock?.summary?.out_of_stock_count ?? 0) + Number(lowStock?.summary?.low_stock_count ?? 0)} SKUs`}
                    tone={Number(lowStock?.summary?.out_of_stock_count ?? 0) > 0 ? "negative" : "warning"}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    subline={`${Number(lowStock?.summary?.out_of_stock_count ?? 0)} out of stock`}
                    footer={`Dead stock ${formatCurrency(deadStockValue)}`}
                  />
                  <ExecutiveCard
                    label="Critical Alerts"
                    value={`${criticalAlertCount} critical`}
                    tone={criticalAlertCount > 0 ? "negative" : warningAlertCount > 0 ? "warning" : "positive"}
                    icon={<Bell className="h-4 w-4" />}
                    subline={`${warningAlertCount} warnings in queue`}
                    footer="Review action panel below"
                  />
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className={`${panelClass} p-5 lg:col-span-8`}>
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Sales trend</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Last 30 days revenue with daily flow and trend visibility.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <MetricPill label="Best day" value={formatCurrency(Math.max(...dailySales.map((d) => d.total_sales), 0))} />
                        <MetricPill label="Worst day" value={formatCurrency(dailySales.length ? Math.min(...dailySales.map((d) => d.total_sales)) : 0)} />
                        <MetricPill
                          label="Daily avg"
                          value={formatCurrency(dailySales.length ? dailySales.reduce((sum, item) => sum + item.total_sales, 0) / dailySales.length : 0)}
                        />
                        <MetricPill label="Month forecast" value={formatCurrency(salesForecast)} />
                      </div>
                    </div>
                    <SalesTrendChart data={dailySales} formatCurrency={formatCurrency} />
                  </div>

                  <div className={`${panelClass} p-5 lg:col-span-4`}>
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Month progress</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Revenue pacing, target coverage, and forecast outlook.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <SummaryRow label="MTD sales" value={formatCurrency(mtdSales)} />
                      <SummaryRow label="Monthly target" value={mtdTarget > 0 ? formatCurrency(mtdTarget) : "Not set"} />
                      <SummaryRow
                        label="Achievement"
                        value={mtdTarget > 0 ? formatPercentage(progressToTarget) : "—"}
                        muted={mtdTarget <= 0}
                      />
                      <SummaryRow label="Forecast month-end" value={formatCurrency(salesForecast)} />
                      <SummaryRow
                        label="Gap to target"
                        value={mtdTarget > 0 ? formatCurrency(Math.max(0, mtdTarget - salesForecast)) : "Set target to unlock"}
                        muted={mtdTarget <= 0}
                      />
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Progress</span>
                        <span>{mtdTarget > 0 ? formatPercentage(progressToTarget) : "Target pending"}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-sky-500 transition-all"
                          style={{ width: `${Math.min(100, Math.max(8, progressToTarget || 8))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className={`${panelClass} p-5 lg:col-span-6`}>
                    <SectionHeader
                      title="Channel performance"
                      subtitle="Where today’s revenue is coming from across sales engines."
                    />
                    <div className="mt-4 space-y-3">
                      {channelRows.length ? (
                        channelRows.map((channel) => (
                          <ChannelPerformanceRow
                            key={channel.key}
                            label={channel.label}
                            sales={formatCurrency(channel.sales)}
                            orders={channel.orders}
                            aov={formatCurrency(channel.aov)}
                            share={formatPercentage(channel.share)}
                            width={channel.width}
                            icon={
                              channel.key === "counter" ? (
                                <Store className="h-4 w-4" />
                              ) : channel.key === "ecommerce" ? (
                                <Globe2 className="h-4 w-4" />
                              ) : (
                                <ShoppingBag className="h-4 w-4" />
                              )
                            }
                          />
                        ))
                      ) : (
                        <EmptyState text="No channel sales data available for this period." />
                      )}
                    </div>
                  </div>

                  <div className={`${panelClass} p-5 lg:col-span-6`}>
                    <SectionHeader
                      title="Store performance"
                      subtitle="Ranked stores by revenue, volume, and contribution."
                    />
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                      <div className="grid grid-cols-[48px_minmax(0,1.4fr)_0.8fr_0.7fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                        <span>Rank</span>
                        <span>Store</span>
                        <span>Sales</span>
                        <span>Orders</span>
                        <span>Share</span>
                      </div>
                      {storeRows.length ? (
                        storeRows.slice(0, 6).map((store) => (
                          <div
                            key={`${store.rank}-${store.name}`}
                            className="grid grid-cols-[48px_minmax(0,1.4fr)_0.8fr_0.7fr_0.8fr] gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
                              {store.rank}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-900 dark:text-slate-100">{store.name}</div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {store.location} · {store.type}
                              </div>
                            </div>
                            <div className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(store.sales)}</div>
                            <div className="text-slate-600 dark:text-slate-300">{store.orders}</div>
                            <div className="text-slate-600 dark:text-slate-300">{formatPercentage(store.contribution)}</div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4">
                          <EmptyState text="No store performance data available for this period." />
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className={`${panelClass} p-5 lg:col-span-7`}>
                    <SectionHeader
                      title="Inventory health"
                      subtitle="Working capital by age bucket, freshness, and stock risk."
                    />
                    <div className="mt-5">
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Total inventory value</span>
                        <span className="font-semibold text-slate-950 dark:text-white">
                          {formatCurrency(Number(inventoryAge?.total_inventory_value ?? 0))}
                        </span>
                      </div>
                      <StackedInventoryBar categories={inventoryCategories} />
                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <MetricTile label="0-30 days" value={formatCurrency(inventoryCategories[0]?.value ?? 0)} />
                        <MetricTile label="31-60 days" value={formatCurrency(inventoryCategories[1]?.value ?? 0)} />
                        <MetricTile label="61-90 days" value={formatCurrency(inventoryCategories[2]?.value ?? 0)} />
                        <MetricTile label="90+ days" value={formatCurrency(inventoryCategories[3]?.value ?? 0)} danger />
                      </div>
                    </div>
                  </div>

                  <div className={`${panelClass} p-5 lg:col-span-5`}>
                    <SectionHeader
                      title="Critical stock risks"
                      subtitle="Items requiring transfer, replenishment, or clearance action."
                    />
                    <div className="mt-4 space-y-2">
                      {stockRiskRows.length ? (
                        stockRiskRows.map((item: AnyObj) => (
                          <RiskRow
                            key={`${item.product_id}-${item.store_id}`}
                            product={item.product_name}
                            store={item.store_name}
                            stock={Number(item.current_stock ?? 0)}
                            status={item.status === "out_of_stock" ? "Out of stock" : "Low stock"}
                            action={item.status === "out_of_stock" ? "Transfer / buy" : "Replenish"}
                          />
                        ))
                      ) : (
                        <EmptyState text="No critical stock risks right now." />
                      )}
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className={`${panelClass} p-5 lg:col-span-6`}>
                    <SectionHeader
                      title="Critical alerts"
                      subtitle="The issues that deserve founder attention now."
                    />
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                      <div className="grid grid-cols-[110px_76px_minmax(0,1fr)_110px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                        <span>Issue</span>
                        <span>Count</span>
                        <span>Note</span>
                        <span>Owner</span>
                        <span>Action</span>
                      </div>
                      {criticalAlertItems.length ? (
                        criticalAlertItems.map((item) => (
                          <div
                            key={item.issue}
                            className="grid grid-cols-[110px_76px_minmax(0,1fr)_110px_120px] gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800"
                          >
                            <span className={`font-medium ${item.severity === "critical" ? "text-rose-600 dark:text-rose-300" : "text-amber-600 dark:text-amber-300"}`}>
                              {item.issue}
                            </span>
                            <span className="text-slate-900 dark:text-slate-100">{item.count}</span>
                            <span className="text-slate-500 dark:text-slate-400">{item.note}</span>
                            <span className="text-slate-500 dark:text-slate-400">{item.owner}</span>
                            <span className="text-slate-900 dark:text-slate-100">{item.action}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-4">
                          <EmptyState text="No critical alerts at the moment." />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={`${panelClass} p-5 lg:col-span-6`}>
                    <SectionHeader
                      title="Opportunities today"
                      subtitle="Signals worth leaning into while demand is live."
                    />
                    <div className="mt-4 space-y-3">
                      {opportunities.length ? (
                        opportunities.map((item) => (
                          <div
                            key={item.title}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                          >
                            <div className="text-sm font-medium text-slate-950 dark:text-white">{item.title}</div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.body}</div>
                          </div>
                        ))
                      ) : (
                        <EmptyState text="Opportunities will populate once sales and inventory signals are available." />
                      )}
                    </div>
                  </div>
                </section>

                <section className={`${panelClass} p-5`}>
                  <SectionHeader
                    title="Product intelligence"
                    subtitle="Top revenue products with immediate stock or sell-through context."
                  />
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="px-3 py-3 font-semibold">Product</th>
                          <th className="px-3 py-3 font-semibold">SKU</th>
                          <th className="px-3 py-3 font-semibold">Revenue</th>
                          <th className="px-3 py-3 font-semibold">Units</th>
                          <th className="px-3 py-3 font-semibold">Orders</th>
                          <th className="px-3 py-3 font-semibold">Avg price</th>
                          <th className="px-3 py-3 font-semibold">Stock</th>
                          <th className="px-3 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProductRows.length ? (
                          topProductRows.map((product) => (
                            <tr key={product.id} className="border-b border-slate-200 last:border-b-0 dark:border-slate-800">
                              <td className="px-3 py-3 font-medium text-slate-950 dark:text-white">{product.name}</td>
                              <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{product.sku}</td>
                              <td className="px-3 py-3 text-slate-900 dark:text-slate-100">{formatCurrency(product.revenue)}</td>
                              <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{product.units}</td>
                              <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{product.orders}</td>
                              <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{formatCurrency(product.averagePrice)}</td>
                              <td className="px-3 py-3 text-slate-500 dark:text-slate-400">{product.stock === null ? "—" : product.stock}</td>
                              <td className="px-3 py-3">
                                <StatusBadge label={product.status} />
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-3 py-6" colSpan={8}>
                              <EmptyState text="No product sales data available today." />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  <div className={`${panelClass} p-5 lg:col-span-12`}>
                    <SectionHeader
                      title="Operations snapshot"
                      subtitle="Compact fulfillment view to spot bottlenecks without cluttering the page."
                    />
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                      {pipelineStages.length ? (
                        pipelineStages.map((stage) => (
                          <PipelineStageCard
                            key={stage.key}
                            label={stage.label}
                            count={stage.count}
                            icon={
                              stage.key === "pending" ? (
                                <Clock className="h-4 w-4" />
                              ) : stage.key === "processing" || stage.key === "confirmed" ? (
                                <Package className="h-4 w-4" />
                              ) : stage.key === "ready_for_pickup" || stage.key === "shipped" ? (
                                <Truck className="h-4 w-4" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )
                            }
                            emphasis={stage.key === "delivered" ? "good" : stage.key === "cancelled" ? "bad" : "neutral"}
                          />
                        ))
                      ) : (
                        <div className="col-span-full">
                          <EmptyState text="No operations data available for today." />
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function ExecutiveCard({
  label,
  value,
  subline,
  footer,
  icon,
  tone,
}: {
  label: string;
  value: string;
  subline: string;
  footer: string;
  icon: React.ReactNode;
  tone: "positive" | "negative" | "warning" | "neutral";
}) {
  const toneMap: Record<string, string> = {
    positive: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10",
    negative: "text-rose-600 dark:text-rose-300 bg-rose-500/10",
    warning: "text-amber-600 dark:text-amber-300 bg-amber-500/10",
    neutral: "text-sky-600 dark:text-sky-300 bg-sky-500/10",
  };

  return (
    <div className={`${panelClass} p-4`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
        </div>
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${toneMap[tone]}`}>{icon}</div>
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300">{subline}</div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{footer}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0 dark:border-slate-800">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${muted ? "text-slate-500 dark:text-slate-400" : "text-slate-950 dark:text-white"}`}>{value}</span>
    </div>
  );
}

function SalesTrendChart({
  data,
  formatCurrency,
}: {
  data: Array<{ date: string; day: string; total_sales: number; paid_amount: number; order_count: number }>;
  formatCurrency: (value: number) => string;
}) {
  const chartData = data.length ? data : [{ date: "", day: "", total_sales: 0, paid_amount: 0, order_count: 0 }];
  const max = Math.max(...chartData.map((item) => item.total_sales), 1);
  const width = 1000;
  const height = 280;
  const padding = 28;

  const points = chartData
    .map((item, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(chartData.length - 1, 1);
      const y = height - padding - (item.total_sales / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPath = `${points} ${width - padding},${height - padding} ${padding},${height - padding}`;
  const recent = chartData.slice(-7).reduce((sum, item) => sum + item.total_sales, 0);
  const previous = chartData.slice(-14, -7).reduce((sum, item) => sum + item.total_sales, 0);
  const trendUp = recent >= previous;
  const latest = chartData[chartData.length - 1]?.total_sales ?? 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          30-day sales: <span className="font-semibold text-slate-950 dark:text-white">{formatCurrency(chartData.reduce((sum, item) => sum + item.total_sales, 0))}</span>
        </div>
        <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${trendUp ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/10 text-rose-600 dark:text-rose-300"}`}>
          {trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          Last 7d {trendUp ? "ahead of" : "below"} prior 7d
        </div>
      </div>

      <div className="relative h-[280px] w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
          {[0.25, 0.5, 0.75, 1].map((step) => {
            const y = height - padding - step * (height - padding * 2);
            return <line key={step} x1={padding} y1={y} x2={width - padding} y2={y} className="stroke-slate-200 dark:stroke-slate-800" strokeDasharray="4 6" />;
          })}
          <polygon points={areaPath} className="fill-sky-500/12" />
          <polyline points={points} fill="none" className="stroke-sky-500" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {chartData.map((item, index) => {
            const x = padding + (index * (width - padding * 2)) / Math.max(chartData.length - 1, 1);
            const y = height - padding - (item.total_sales / max) * (height - padding * 2);
            return <circle key={`${item.date}-${index}`} cx={x} cy={y} r="4" className="fill-white stroke-sky-500 dark:fill-slate-950" strokeWidth="3" />;
          })}
        </svg>

        <div className="absolute inset-x-4 bottom-0 flex items-end justify-between text-[10px] text-slate-400">
          <span>{chartData[0]?.day || "Day 1"}</span>
          <span>Latest: {formatCurrency(latest)}</span>
          <span>{chartData[chartData.length - 1]?.day || "Today"}</span>
        </div>
      </div>
    </div>
  );
}

function ChannelPerformanceRow({
  icon,
  label,
  sales,
  orders,
  aov,
  share,
  width,
}: {
  icon: React.ReactNode;
  label: string;
  sales: string;
  orders: number;
  aov: string;
  share: string;
  width: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">{icon}</div>
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-950 dark:text-white">{label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{orders} orders · AOV {aov}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-medium text-slate-950 dark:text-white">{sales}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{share} share</div>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-2 rounded-full bg-sky-500" style={{ width }} />
      </div>
    </div>
  );
}

function StackedInventoryBar({ categories }: { categories: Array<{ label: string; value: number; percent: number; tone: string }> }) {
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        {categories.length ? (
          categories.map((item) => (
            <div key={item.label} className={item.tone} style={{ width: `${Math.max(4, item.percent || 0)}%` }} />
          ))
        ) : (
          <div className="h-4 w-full rounded-full bg-slate-300 dark:bg-slate-700" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        {categories.map((item) => (
          <div key={item.label} className="inline-flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
            <span>
              {item.label} · {item.percent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricTile({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${danger ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"}`}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}

function RiskRow({
  product,
  store,
  stock,
  status,
  action,
}: {
  product: string;
  store: string;
  stock: number;
  status: string;
  action: string;
}) {
  const isCritical = status.toLowerCase().includes("out");
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-950 dark:text-white">{product}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{store} · stock {stock}</div>
        </div>
        <div className="text-right">
          <StatusBadge label={status} danger={isCritical} />
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">{action}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ label, danger = false }: { label: string; danger?: boolean }) {
  const isWarning = label.toLowerCase().includes("low") || label.toLowerCase().includes("slow");
  const className = danger
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-300"
    : isWarning
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function PipelineStageCard({
  label,
  count,
  icon,
  emphasis,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  emphasis: "good" | "bad" | "neutral";
}) {
  const tone =
    emphasis === "good"
      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      : emphasis === "bad"
      ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
      : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-950 dark:text-white">{label}</span>
        <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{count}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{text}</div>;
}