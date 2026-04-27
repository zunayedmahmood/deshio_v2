'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from "@/contexts/ThemeContext";
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import CustomerTagManager from '@/components/customers/CustomerTagManager';

import customerService, { Customer, CustomerOrder } from '@/services/customerService';
import orderService from '@/services/orderService';
import batchService, { Batch } from '@/services/batchService';
import barcodeTrackingService from '@/services/barcodeTrackingService';
import lookupService from '@/services/lookupService';
import purchaseOrderService from '@/services/purchase-order.service';
import productImageService from '@/services/productImageService';
import storeService, { Store } from '@/services/storeService';
import ReturnExchangeFromOrder from '@/components/lookup/ReturnExchangeFromOrder';
import ReturnProductModal from '@/components/sales/ReturnProductModal';
import ExchangeProductModal from '@/components/sales/ExchangeProductModal';
import productReturnService, { type CreateReturnRequest } from '@/services/productReturnService';
import refundService, { type CreateRefundRequest } from '@/services/refundService';
import { connectQZ, getDefaultPrinter } from '@/lib/qz-tray';
import BatchPrinter from "@/components/BatchPrinter";
import axiosInstance from '@/lib/axios';
import {
  LABEL_WIDTH_MM as SHARED_LABEL_WIDTH_MM,
  LABEL_HEIGHT_MM as SHARED_LABEL_HEIGHT_MM,
  DEFAULT_DPI as SHARED_DEFAULT_DPI,
  mmToIn as sharedMmToIn,
  renderBarcodeLabelBase64,
} from "@/lib/barcodeLabelRenderer";

// -----------------------
// QZ + barcode label rendering (same configuration as BatchPrinter)
// -----------------------

// Global QZ connection state to prevent multiple connection attempts
let qzConnectionPromise: Promise<void> | null = null;
let qzConnected = false;

async function ensureQZConnection() {
  const qz = (window as any).qz;
  if (!qz) {
    throw new Error("QZ Tray not available");
  }

  // If already connected, return immediately
  if (qzConnected && (await qz.websocket.isActive())) {
    return;
  }

  // If connection is in progress, wait for it
  if (qzConnectionPromise) {
    return qzConnectionPromise;
  }

  // Start new connection
  qzConnectionPromise = (async () => {
    try {
      if (!(await qz.websocket.isActive())) {
        await qz.websocket.connect();
        qzConnected = true;
        console.log("✅ QZ Tray connected");
      }
    } catch (error) {
      console.error("❌ QZ Tray connection failed:", error);
      throw error;
    } finally {
      qzConnectionPromise = null;
    }
  })();

  return qzConnectionPromise;
}

// Label geometry (match BatchPrinter)
const LABEL_WIDTH_MM = 39;
const LABEL_HEIGHT_MM = 25;
const DEFAULT_DPI = 300; // set to 203 for 203dpi printers
const TOP_GAP_MM = 1; // extra blank gap at the very top
const SHIFT_X_MM = 0; // keep 0 for perfect centering

function mmToIn(mm: number) {
  return mm / 25.4;
}

async function ensureJsBarcode() {
  // QzTrayLoader loads JsBarcode globally, but keep a fallback for safety.
  if (typeof window === "undefined") return;
  if ((window as any).JsBarcode) return;

  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load JsBarcode"));
    document.head.appendChild(s);
  });
}

async function ensurePoppinsLoaded(px = 24) {
  if (typeof document === "undefined" || !(document as any).fonts?.load) return;

  try {
    await (document as any).fonts.load(`700 ${px}px Poppins`);
    await (document as any).fonts.ready;
  } catch {
    // Font loading is best-effort; canvas will fall back if unavailable.
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const ellipsis = "…";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + ellipsis).width > maxWidth) t = t.slice(0, -1);
  return t.length ? t + ellipsis : "";
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const clean = (text || "").trim().replace(/\s+/g, " ");
  if (!clean) return [""];
  if (ctx.measureText(clean).width <= maxWidth) return [clean];

  const words = clean.split(" ");
  const lines: string[] = [];
  let remaining = words;

  while (remaining.length > 0 && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1;

    if (remaining.length === 1) {
      lines.push(isLastLine ? fitText(ctx, remaining[0], maxWidth) : remaining[0]);
      remaining = [];
      break;
    }

    let line = "";
    let i = 0;
    for (; i < remaining.length; i++) {
      const test = line ? `${line} ${remaining[i]}` : remaining[i];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else break;
    }

    if (!line) {
      let forced = remaining[0];
      while (forced.length > 0 && ctx.measureText(forced).width > maxWidth) forced = forced.slice(0, -1);
      line = forced || fitText(ctx, remaining[0], maxWidth);
      i = 1;
    }

    if (isLastLine && i < remaining.length) {
      const restRaw = [line, ...remaining.slice(i)].join(" ");
      lines.push(fitText(ctx, restRaw, maxWidth));
      remaining = [];
    } else {
      lines.push(line);
      remaining = remaining.slice(i);
    }
  }

  return lines.length > 0 ? lines : [fitText(ctx, clean, maxWidth)];
}

function normalizeLabelName(text: string) {
  const clean = (text || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";

  // Normalize separators so wrap logic can break naturally on spaces
  // Example: "Mueed-ta-40" -> "Mueed - ta - 40"
  return clean.replace(/\s*[-–—]\s*/g, " - ");
}

async function renderLabelBase64(opts: { code: string; productName: string; price: number; dpi?: number }) {
  await ensureJsBarcode();

  const dpi = opts.dpi ?? DEFAULT_DPI;
  const wIn = mmToIn(LABEL_WIDTH_MM);
  const hIn = mmToIn(LABEL_HEIGHT_MM);
  const wPx = Math.max(50, Math.round(wIn * dpi));
  const hPx = Math.max(50, Math.round(hIn * dpi));

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  await ensurePoppinsLoaded(Math.round(hPx * 0.1));

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, wPx, hPx);

  const pad = Math.round(wPx * 0.04);
  const topGapPx = Math.round((TOP_GAP_MM / 25.4) * dpi);
  const shiftPx = Math.round((SHIFT_X_MM / 25.4) * dpi);

  const centerX = wPx / 2 + shiftPx;
  const topPad = pad + topGapPx;

  // Brand
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 ${Math.round(hPx * 0.11)}px Poppins, Arial, sans-serif`;
  ctx.fillText("ERRUM BD", centerX, topPad);

  // Product name — up to 3 lines, shrinking font as needed
  const nameY = topPad + Math.round(hPx * 0.14);
  const nameMaxW = wPx - pad * 2;
  const lineGap = Math.max(2, Math.round(hPx * 0.01));
  const fullName = normalizeLabelName(opts.productName || "Product");

  let nameFont = Math.round(hPx * 0.095);
  ctx.font = `700 ${nameFont}px Poppins, Arial, sans-serif`;
  let nameLines = wrapLines(ctx, fullName, nameMaxW, 3);

  if (nameLines.length > 1) {
    nameFont = Math.round(hPx * 0.082);
    ctx.font = `700 ${nameFont}px Poppins, Arial, sans-serif`;
    nameLines = wrapLines(ctx, fullName, nameMaxW, 3);
  }

  if (nameLines.length > 2) {
    nameFont = Math.round(hPx * 0.070);
    ctx.font = `700 ${nameFont}px Poppins, Arial, sans-serif`;
    nameLines = wrapLines(ctx, fullName, nameMaxW, 3);
  }

  nameLines.forEach((line, i) => {
    ctx.fillText(line, centerX, nameY + i * (nameFont + lineGap));
  });

  const afterNameBottom = nameY + nameLines.length * (nameFont + lineGap);
  const afterNameY = afterNameBottom + Math.round(hPx * 0.02);

  // Barcode — smaller to leave room for 3-line names
  const JsBarcode = (window as any).JsBarcode;
  const maxBcW = Math.round((wPx - pad * 2) * 0.98);
  const maxBcH = Math.round(hPx * 0.56);
  const bcHeight = Math.round(hPx * 0.28);
  const bcFontSize = Math.round(hPx * 0.062);

  const renderBarcodeCanvas = (barWidth: number) => {
    const c = document.createElement("canvas");
    JsBarcode(c, opts.code, {
      format: "CODE128",
      width: Math.max(1, Math.floor(barWidth)),
      height: bcHeight,
      displayValue: true,
      fontSize: bcFontSize,
      fontOptions: "bold",
      textMargin: 0,
      margin: 0,
    });
    return c;
  };

  // Pick the largest integer barWidth that fits
  let bw = 1;
  let bcCanvas = renderBarcodeCanvas(bw);
  while (bw < 6) {
    const next = renderBarcodeCanvas(bw + 1);
    if (next.width <= maxBcW && next.height <= maxBcH) {
      bw += 1;
      bcCanvas = next;
      continue;
    }
    break;
  }

  const bcY = Math.max(topPad + Math.round(hPx * 0.27), Math.round(afterNameY));
  const scale = Math.min(1, maxBcW / bcCanvas.width, maxBcH / bcCanvas.height);
  const drawW = Math.round(bcCanvas.width * scale);
  const drawH = Math.round(bcCanvas.height * scale);
  const bcX = Math.round((wPx - drawW) / 2 + shiftPx);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bcCanvas, bcX, bcY, drawW, drawH);

  // Price
  const priceText = `BDT ${Number(opts.price || 0).toLocaleString("en-BD")}`;
  ctx.textBaseline = "bottom";
  const priceFontSize = Math.round(hPx * 0.095);
  // Use a mono-style numeric font stack for clearer digit differentiation (e.g., 6 vs 8)
  ctx.font = `700 ${priceFontSize}px Poppins, Arial, sans-serif`;
  const priceY = hPx - pad;
  ctx.fillText(fitText(ctx, priceText, wPx - pad * 2), centerX, priceY);

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1];
}


type LookupTab = 'customer' | 'order' | 'barcode' | 'batch';

type BarcodeHistoryItem = {
  id: number;
  date: string;
  from_store?: string | null;
  to_store?: string | null;
  movement_type?: string | null;
  status_before?: string | null;
  status_after?: string | null;
  reference_type?: string | null;
  reference_id?: number | string | null;
  performed_by?: string | null;
  notes?: string | null;

  order_id?: number | string | null;
  order_number?: string | null;
  customer?: any;
  metadata?: any;
  meta?: any;
};

type BarcodeHistoryData = {
  barcode: {
    barcode: string;
    is_mother_barcode: boolean;
    type: string;
  };
  product: {
    id: number;
    name: string;
    sku: string | null;
    description?: string;
    brand?: string;
  };
  current_locations: Array<{
    store_id: number;
    store_name: string;
    quantity: number;
    batch_number: string;
  }>;
  batches: Array<{
    id: number;
    batch_number: string;
    quantity: number;
    cost_price: number | string;
    sell_price: number | string;
    store: { id: number; name: string } | null;
  }>;
  purchase_order?: any;
  vendor?: any;
  lifecycle?: any[];
  activity_history: any[];
  summary: {
    total_dispatches: number;
    total_sales: number;
    total_returns: number;
    total_defective: number;
    has_purchase_order: boolean;
  };
};

type BatchLookupData = {
  batch: {
    id: number;
    batch_number: string;
    quantity: number;
    cost_price: number | string;
    sell_price: number | string;
    created_at: string;
  };
  product: {
    id: number;
    sku: string | null;
    name: string;
  };
  store: {
    id: number;
    name: string;
  } | null;
  sales_records: any[];
  dispatch_records: any[];
  summary: {
    current_stock: number;
    total_sales: number;
    total_dispatches: number;
  };
  barcodes?: any[];
};

type PrinterProduct = {
  id: number;
  name: string;
};

type PrinterBatch = {
  id: number;
  productId: number;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  baseCode: string;
};

export default function LookupPage() {
  // Layout
  const { darkMode, setDarkMode } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<LookupTab>('customer');

  // Shared UI
  const [error, setError] = useState('');

  // Shared: store directory (for showing store names when APIs only return store_id)
  const [stores, setStores] = useState<Store[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await storeService.getStores({ per_page: 300, is_active: true });
        const list: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : [];
        if (mounted) setStores(list as Store[]);
      } catch (e) {
        // silent: lookup should still work without store names
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const storeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of stores || []) {
      if (s && typeof (s as any).id === 'number') m.set((s as any).id, (s as any).name || '');
    }
    return m;
  }, [stores]);

  const getStoreNameFromAny = (x: any): string => {
    const direct = x?.store?.name || x?.store_name || x?.storeName || '';
    if (direct) return direct;

    const idRaw = x?.store?.id ?? x?.store_id ?? x?.storeId ?? x?.current_store_id ?? x?.assigned_store_id ?? x?.source_store_id ?? x?.from_store_id;
    const id = typeof idRaw === 'number' ? idRaw : idRaw != null ? parseInt(String(idRaw), 10) : NaN;
    if (Number.isFinite(id)) {
      const name = storeNameById.get(id);
      if (name) return name;
      return `Store #${id}`;
    }
    return '—';
  };

  // =========================
  // CUSTOMER LOOKUP
  // =========================
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // ======================
  // ORDER LOOKUP
  // ======================
  const [orderNumber, setOrderNumber] = useState('');
  const [singleOrder, setSingleOrder] = useState<CustomerOrder | null>(null);
  const [orderSuggestions, setOrderSuggestions] = useState<CustomerOrder[]>([]);
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);
  const [orderSearchLoading, setOrderSearchLoading] = useState(false);

  // ======================
  // BARCODE LOOKUP
  // ======================
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeData, setBarcodeData] = useState<BarcodeHistoryData | null>(null);

  // ✅ Barcode scan UX (same behavior as POS): supports physical scanners (rapid key bursts)
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef<string>('');
  const scannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Purchase info (lookup/product + fallback): PO & vendor details for this barcode
  const [barcodePurchaseInfo, setBarcodePurchaseInfo] = useState<{ poId?: number; poNumber?: string; vendorName?: string } | null>(null);
  const [barcodeLookupData, setBarcodeLookupData] = useState<any | null>(null);
  const [barcodePurchaseLoading, setBarcodePurchaseLoading] = useState(false);
  const [barcodeProductImageUrl, setBarcodeProductImageUrl] = useState<string | null>(null);
  const [barcodeImagePreviewOpen, setBarcodeImagePreviewOpen] = useState(false);
  const [barcodeImagePreviewUrl, setBarcodeImagePreviewUrl] = useState<string | null>(null);

  // Modal states for Return/Exchange
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<any | null>(null);

  const [printStatus, setPrintStatus] = useState<{ loading: boolean; error: string | null; success: boolean }>({
    loading: false,
    error: null,
    success: false,
  });

  const closeBarcodeImagePreview = () => {
    setBarcodeImagePreviewOpen(false);
    setBarcodeImagePreviewUrl(null);
  };

  const openBarcodeImagePreview = (url: string) => {
    if (!url) return;
    setBarcodeImagePreviewUrl(url);
    setBarcodeImagePreviewOpen(true);
  };

  useEffect(() => {
    if (!barcodeImagePreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBarcodeImagePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [barcodeImagePreviewOpen]);

  // Physical scanner detection for the Barcode tab
  useEffect(() => {
    if (activeTab !== 'barcode') return;

    const cleanupTimer = () => {
      if (scannerTimeoutRef.current) {
        clearTimeout(scannerTimeoutRef.current);
        scannerTimeoutRef.current = null;
      }
    };

    const processScanned = (raw: string) => {
      const code = String(raw || '').trim();
      if (!code) return;

      // Reflect scanned code in the input box immediately
      setBarcodeInput(code);
      setBarcodeData(null);
      setBarcodePurchaseInfo(null);
      setBarcodeLookupData(null);
      setBarcodeProductImageUrl(null);
      closeBarcodeImagePreview();
      setError('');

      // Use override so we don't depend on state timing
      handleSearchBarcode(code);
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Ignore keypresses in other input fields
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'SELECT') return;
      if (target.tagName === 'INPUT' && target !== barcodeInputRef.current) return;

      cleanupTimer();

      // Enter = end-of-scan
      if (e.key === 'Enter' && scannerBufferRef.current.length > 0) {
        e.preventDefault();
        const scanned = scannerBufferRef.current;
        scannerBufferRef.current = '';
        processScanned(scanned);
        return;
      }

      // Accumulate characters
      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;

        // Auto-submit after brief silence (barcode scanners type in a rapid burst)
        scannerTimeoutRef.current = setTimeout(() => {
          if (scannerBufferRef.current.length > 3) {
            const scanned = scannerBufferRef.current;
            scannerBufferRef.current = '';
            processScanned(scanned);
          } else {
            scannerBufferRef.current = '';
          }
        }, 100);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      cleanupTimer();
      scannerBufferRef.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  // Cache to resolve order/customer for barcode history + current_location
  const [orderMetaCache, setOrderMetaCache] = useState<
    Record<number, { order_number?: string; customer?: { name?: string; phone?: string } }>
  >({});
  const [orderMetaLoading, setOrderMetaLoading] = useState(false);

  // ======================
  // BATCH LOOKUP
  // ======================
  const [batchQuery, setBatchQuery] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchData, setBatchData] = useState<BatchLookupData | null>(null);

  const [batchSuggestions, setBatchSuggestions] = useState<Batch[]>([]);
  const [showBatchSuggestions, setShowBatchSuggestions] = useState(false);
  const [batchSearchLoading, setBatchSearchLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  // -----------------------
  // Helpers
  // -----------------------
  const formatPhoneNumber = (phone: string) => phone.replace(/\D/g, '');

  // NOTE: backend may return numbers as strings with commas (e.g. "1,000"),
  // or with currency text (e.g. "BDT 1,000"). parseFloat("1,000") => 1.
  const toNumberString = (v: any) => {
    if (v == null) return '';
    const s = String(v).trim();
    // Remove common thousand separators and any currency/non-numeric chars.
    // Keep digits, dot, minus.
    return s.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  };

  const safeNum = (v: any) => {
    const n = typeof v === 'number' ? v : v != null ? parseFloat(toNumberString(v)) : NaN;
    return Number.isFinite(n) ? n : 0;
  };

  const safeNumOrNull = (v: any): number | null => {
    const n = typeof v === 'number' ? v : v != null ? parseFloat(toNumberString(v)) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  /** Best-effort batch price extraction (backend payloads differ across endpoints). */
  const extractBatchPrices = (x: any): { cost: number | null; sell: number | null } => {
    if (!x) return { cost: null, sell: null };

    const meta =
      x?.metadata ??
      x?.meta ??
      x?.location_metadata ??
      x?.locationMetadata ??
      x?.data ??
      {};

    const prices = x?.batch_prices ?? x?.batchPrices ?? x?.prices ?? meta?.batch_prices ?? meta?.batchPrices ?? meta?.prices ?? null;

    const costRaw =
      x?.cost_price ?? x?.costPrice ?? x?.cost ?? prices?.cost_price ?? prices?.costPrice ?? prices?.cost ?? null;

    const sellRaw =
      x?.selling_price ??
      x?.sell_price ??
      x?.sellPrice ??
      x?.sell ??
      prices?.selling_price ??
      prices?.sell_price ??
      prices?.sellPrice ??
      prices?.sell ??
      null;

    return {
      cost: safeNumOrNull(costRaw),
      sell: safeNumOrNull(sellRaw),
    };
  };

  const formatCurrency = (amount: string | number) => {
    const numAmount = safeNum(amount);
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: 'BDT',
      minimumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatDate = (dateString?: any) => {
    if (!dateString) return '—';
    // Some APIs send non-ISO strings or nulls. Avoid showing "Invalid Date".
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const parseId = (v: any): number | null => {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const apiOrigin = (() => {
    const base = (process.env.NEXT_PUBLIC_API_URL || '').trim();
    if (!base) return '';
    return base.replace(/\/api\/?$/, '');
  })();

  const toAbsoluteAssetUrl = (raw: any): string | null => {
    if (!raw || typeof raw !== 'string') return null;
    const v = raw.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith('//')) return `https:${v}`;
    if (!apiOrigin) return v;
    if (v.startsWith('/')) return `${apiOrigin}${v}`;
    return `${apiOrigin}/${v}`;
  };

  const extractProductImageFromLookup = (lk: any): string | null => {
    const p = lk?.product || {};
    const primary = p?.primary_image || p?.primaryImage || lk?.primary_image || lk?.primaryImage || {};
    const images =
      (Array.isArray(p?.images) ? p.images : null) ||
      (Array.isArray(lk?.images) ? lk.images : null) ||
      (Array.isArray(p?.product_images) ? p.product_images : null) ||
      [];

    const candidate =
      p?.image_url ||
      p?.imageUrl ||
      p?.thumbnail ||
      p?.thumbnail_url ||
      p?.photo ||
      p?.picture ||
      primary?.image_url ||
      primary?.imageUrl ||
      primary?.url ||
      images?.[0]?.image_url ||
      images?.[0]?.imageUrl ||
      images?.[0]?.url ||
      images?.[0]?.path ||
      null;

    return toAbsoluteAssetUrl(candidate);
  };

  const formatOrderType = (order: CustomerOrder) => {
    if ((order as any).order_type_label) return (order as any).order_type_label;
    if (order.order_type) {
      return order.order_type
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    return 'N/A';
  };

  const normalizeCustomerOrders = (list: any): CustomerOrder[] => {
    const arr = Array.isArray(list) ? list : [];
    return arr
      .filter(Boolean)
      .map((o: any) => {
        const store = o?.store || (o?.store_name || o?.store_id ? { id: o?.store_id || 0, name: o?.store_name || '—' } : undefined);
        return {
          id: o?.id,
          order_number: o?.order_number || o?.orderNo || o?.number || '',
          order_date: o?.order_date || o?.created_at || o?.date || '',
          order_type: o?.order_type || o?.type || '',
          order_type_label: o?.order_type_label || o?.order_type || o?.type || '',
          total_amount: o?.total_amount ?? o?.total ?? '0',
          paid_amount: o?.paid_amount ?? o?.paid ?? '0',
          outstanding_amount: o?.outstanding_amount ?? o?.outstanding ?? '0',
          payment_status: o?.payment_status || o?.payment || o?.status || 'unknown',
          status: o?.status || 'unknown',
          store: store || { id: 0, name: '—' },
          items: Array.isArray(o?.items) ? o.items : [],
          shipping_address: o?.shipping_address || o?.delivery_address || o?.address,
          notes: o?.notes,
        } as CustomerOrder;
      })
      .filter((o: any) => o?.id);
  };

  const getStatusBadge = (status?: string | null) => {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300">
          Unknown
        </span>
      );
    }

    const statusConfig: { [key: string]: { bg: string; text: string } } = {
      paid: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300' },
      partial: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300' },
      partially_paid: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-300' },
      pending: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-800 dark:text-orange-300' },
      failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-300' },
      completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-300' },
    };

    const key = status.toLowerCase();
    const config = statusConfig[key] || statusConfig['pending'];

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </span>
    );
  };

  const toggleOrderDetails = (orderId: number) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // ---------- Order + Barcode linking helpers ----------
  const isOrderRef = (refType?: string | null) => (refType || '').toLowerCase().includes('order');

  const isSoldLike = (h: any) => {
    const t = String(h?.movement_type || '').toLowerCase();
    const after = String(h?.status_after || '').toLowerCase();
    return (
      t.includes('sold') ||
      t.includes('sale') ||
      t.includes('sell') ||
      t.includes('fulfilled') ||
      t.includes('dispatch') ||
      t.includes('delivered') ||
      after.includes('sold')
    );
  };

  // Backend is not consistent: some endpoints use metadata/meta, others use location_metadata.
  const readMeta = (x: any) =>
    x?.metadata ??
    x?.meta ??
    x?.location_metadata ??
    x?.locationMetadata ??
    x?.data ??
    {};

  const extractOrderIdLoose = (x: any): number | null => {
    const meta = readMeta(x);
    const raw = meta.order_id ?? x?.order_id ?? (isOrderRef(x?.reference_type) ? x?.reference_id : null);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const extractOrderNumberLoose = (x: any): string | null => {
    const meta = readMeta(x);
    const v =
      x?.order_number ??
      x?.orderNo ??
      meta?.order_number ??
      meta?.orderNo ??
      meta?.orderNumber ??
      meta?.order ??
      null;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };

  const extractSoldViaLoose = (x: any): string | null => {
    const meta = readMeta(x);
    const v = meta?.sold_via ?? meta?.soldVia ?? null;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };

  const normalizeStatusKey = (s: any) =>
    String(s || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');

  const statusLabelFromKey = (key: string) => {
    const k = normalizeStatusKey(key);
    const map: Record<string, string> = {
      sold: 'Sold',
      in_warehouse: 'In Warehouse',
      inwarehouse: 'In Warehouse',
      warehouse: 'In Warehouse',
      available: 'Available',
      available_for_sale: 'Available',
      defective: 'Defective',
      inactive: 'Inactive',
      returned: 'Returned',
      exchanged: 'Exchanged',
    };
    return map[k] || (key ? String(key) : 'Unknown Status');
  };

  const isSoldFromCurrentLocation = (loc: any, history?: any[]) => {
    const key = normalizeStatusKey(loc?.current_status ?? loc?.status ?? loc?.status_key ?? loc?.status_label);
    if (key === 'sold') return true;
    const meta = readMeta(loc);
    if (String(loc?.status_label || '').toLowerCase().includes('sold')) return true;
    if (String(loc?.current_status || '').toLowerCase() === 'sold') return true;
    if (extractSoldViaLoose(loc) === 'order') return true;
    if (extractSoldViaLoose(loc) === 'pos') return true;
    // sometimes sold means inactive + has sold meta
    if (loc?.is_active === false && (meta?.order_number || meta?.order_id || meta?.sold_via)) {
      // only treat as sold if meta hints order/pos
      if (String(meta?.sold_via || '').toLowerCase().includes('order') || String(meta?.sold_via || '').toLowerCase().includes('pos')) {
        return true;
      }
    }
    // fallback: any history movement indicates sold
    if (Array.isArray(history) && history.some((h) => isSoldLike(h))) return true;
    return false;
  };

  const getCurrentStatusLabel = (loc: any, history?: any[]) => {
    if (!loc) return 'Unknown Status';
    // prefer sold detection
    if (isSoldFromCurrentLocation(loc, history)) return 'Sold';

    const label = loc?.status_label;
    if (label) return String(label);

    const key = loc?.current_status ?? loc?.status ?? loc?.status_key;
    return statusLabelFromKey(String(key || 'Unknown Status'));
  };

  // ---------- Normalize backend Order -> CustomerOrder ----------
  const normalizeOrderToCustomerOrder = (o: any): CustomerOrder => {
    const items = Array.isArray(o?.items) ? o.items : [];
    return {
      id: o.id,
      order_number: o.order_number,
      order_date: o.order_date || o.created_at || new Date().toISOString(),
      order_type: o.order_type || o.orderType || 'unknown',
      order_type_label: o.order_type_label || o.orderTypeLabel || o.order_type || 'Unknown',
      total_amount: String(o.total_amount ?? '0'),
      paid_amount: String(o.paid_amount ?? '0'),
      outstanding_amount: String(o.outstanding_amount ?? '0'),
      payment_status: String(o.payment_status ?? 'pending'),
      status: String(o.status ?? 'pending'),
      store: o.store || { id: 0, name: '—' },
      items: items.map((it: any) => {
        const barcodes: string[] = Array.isArray(it.barcodes) ? it.barcodes : it.barcode ? [it.barcode] : [];
        return {
          id: it.id,
          product_name: it.product_name,
          product_sku: it.product_sku,
          quantity: Number(it.quantity ?? 0),
          unit_price: String(it.unit_price ?? '0'),
          discount_amount: String(it.discount_amount ?? '0'),
          total_amount: String(it.total_amount ?? '0'),
          ...(barcodes.length ? { barcodes } : {}),
        } as any;
      }),
      shipping_address: o.shipping_address,
      notes: o.notes,
    };
  };

  // -----------------------

  // QZ single barcode print helper (reprint)
  // -----------------------
  // QZ single barcode print helper (reprint) - same config as BatchPrinter
  // -----------------------
  const printSingleBarcodeLabel = async (params: { barcode: string; productName?: string; price?: string | number }) => {
    try {
      setError('');
      const qz = (window as any)?.qz;
      if (!qz) throw new Error('QZ Tray not available');

      await ensureQZConnection();

      // Pick default printer (fallback to first available)
      let printer: string | null = null;
      try {
        const def = await qz.printers.getDefault();
        if (def && String(def).trim()) printer = String(def);
      } catch (_e) { }

      if (!printer) {
        try {
          const list = await qz.printers.find();
          if (Array.isArray(list) && list.length && list[0]) printer = String(list[0]);
          else if (typeof list === 'string' && list.trim()) printer = list;
        } catch (_e) { }
      }

      if (!printer) {
        try {
          const details = await qz.printers.details?.();
          if (Array.isArray(details) && details.length > 0) {
            const name = details[0]?.name || details[0];
            if (name) printer = String(name);
          }
        } catch (_e) { }
      }

      if (!printer) throw new Error('No printer found. Set a default printer and try again.');

      const dpi = SHARED_DEFAULT_DPI;

      const base64 = await renderBarcodeLabelBase64({
        code: params.barcode,
        productName: (params.productName || 'Product').trim(),
        price: safeNum(params.price),
        dpi,
        brandName: "ERRUM BD",
      });

      const config = qz.configs.create(printer, {
        units: 'in',
        size: { width: sharedMmToIn(SHARED_LABEL_WIDTH_MM), height: sharedMmToIn(SHARED_LABEL_HEIGHT_MM) },
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        density: dpi,
        colorType: 'blackwhite',
        interpolation: 'nearest-neighbor',
        scaleContent: false,
      });

      const data: any[] = [{ type: 'pixel', format: 'image', flavor: 'base64', data: base64 }];
      await qz.print(config, data);
    } catch (err: any) {
      console.error('❌ Print error:', err);

      if (err?.message && err.message.includes('Unable to establish connection')) {
        setError('QZ Tray is not running. Please start QZ Tray and try again.');
      } else if (err?.message && err.message.includes('printer must be specified')) {
        setError('Printer not properly configured. Please set a default printer and try again.');
      } else {
        setError(err?.message || 'Failed to print barcode');
      }
    }
  };

  const normalizeLookupOrderToSingleOrder = (payload: any) => {
    const o = payload?.order || {};
    const items = Array.isArray(payload?.items) ? payload.items : [];

    return {
      id: o.id ?? payload?.id ?? 0,
      order_number: o.order_number ?? '',
      order_type: o.order_type ?? 'unknown',
      order_type_label: o.order_type_label ?? o.order_type ?? 'Unknown',
      status: o.status ?? 'unknown',
      payment_status: o.payment_status ?? 'unknown',
      paid_amount: o.paid_amount ?? '0',
      outstanding_amount: o.outstanding_amount ?? '0',
      // Keep store info so UI can show "Sold From" (some lookup endpoints only include store/store_id inside order)
      store: o.store ?? payload?.store ?? null,
      store_id: o.store_id ?? payload?.store_id ?? o?.store?.id ?? payload?.store?.id ?? null,
      store_name: o.store_name ?? payload?.store_name ?? o?.store?.name ?? payload?.store?.name ?? null,
      subtotal: o.subtotal,
      total_amount: o.total_amount ?? o.total ?? o.total_price,
      // some UIs expect order_date; keep both
      order_date: o.order_date ?? o.created_at ?? payload?.created_at ?? null,
      created_at: o.order_date ?? o.created_at ?? null,
      updated_at: o.updated_at ?? null,
      items: items.map((it: any, idx: number) => {
        const barcodeVal = it?.barcode?.barcode ?? it?.barcode ?? null;
        const barcodesArr = Array.isArray(it?.barcodes) ? it.barcodes : [];
        const finalBarcodes: string[] = barcodeVal
          ? [String(barcodeVal)]
          : barcodesArr.map((b: any) => String(b?.barcode ?? b)).filter(Boolean);

        return {
          id: it?.item_id ?? it?.id ?? idx,
          product_id: it?.product?.id ?? it?.product_id ?? null,
          product_name: it?.product?.name ?? it?.product_name ?? 'Unknown Product',
          product_sku: it?.product?.sku ?? it?.product_sku ?? 'N/A',
          quantity: it?.quantity ?? 0,
          unit_price: it?.unit_price ?? it?.sale_price ?? it?.price ?? null,
          total_amount: it?.total_amount ?? it?.total ?? null,
          barcodes: finalBarcodes,
        };
      }),
    };
  };

  // -----------------------
  // Open order by ID (Lookup API)
  // -----------------------
  const openOrderById = async (orderId: number) => {
    setLoading(true);
    setError('');
    setSingleOrder(null);
    setCustomer(null);
    setOrders([]);

    try {
      const res: any = await lookupService.getOrder(orderId);
      if (!res?.success) {
        throw new Error(res?.message || 'Order not found');
      }

      const payload = res.data;
      const orderData = normalizeLookupOrderToSingleOrder(payload);

      // Some lookup endpoints do not include store/store_id inside the payload.
      // In that case, enrich from the main Orders API so "Sold From" is always available.
      try {
        const hasStore = !!(orderData as any)?.store?.name || !!(orderData as any)?.store_name || !!(orderData as any)?.store_id;
        if (!hasStore) {
          const full = await orderService.getById(orderId, true);
          (orderData as any).store = (full as any)?.store ?? (orderData as any).store;
          (orderData as any).store_id = (full as any)?.store?.id ?? (full as any)?.store_id ?? (orderData as any).store_id;
          (orderData as any).store_name = (full as any)?.store?.name ?? (full as any)?.store_name ?? (orderData as any).store_name;
        }
      } catch {
        // Silent: lookup should still work even if enrichment fails
      }

      setOrderNumber(payload?.order?.order_number || `#${orderId}`);
      setSingleOrder(orderData);

      if (payload?.customer) {
        // Cast/shape to our Customer model as best-effort
        const customerData: Customer = {
          id: payload.customer.id,
          customer_code: payload.customer.customer_code,
          name: payload.customer.name,
          phone: payload.customer.phone,
          email: payload.customer.email,
          customer_type: payload.customer.customer_type || 'unknown',
          status: 'active',
          tags: payload.customer.tags,
          total_orders: payload.customer.total_orders,
          total_purchases: payload.customer.total_purchases,
          created_at: payload.customer.created_at || new Date().toISOString(),
          updated_at: payload.customer.updated_at || new Date().toISOString(),
        };
        setCustomer(customerData);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading order data');
    } finally {
      setLoading(false);
    }
  };

  const openOrderByNumber = async (orderNo: string) => {
    const clean = orderNo.trim();
    if (!clean) return;

    setLoading(true);
    setError('');

    try {
      const res: any = await orderService.getAll({
        search: clean.replace(/^#/, ''),
        per_page: 50,
        skipStoreScope: true
      });
      const list = res?.data || [];
      const exact = list.find((o: any) => String(o.order_number).toLowerCase() === clean.toLowerCase())
        || list.find((o: any) => String(o.order_number).toLowerCase().includes(clean.toLowerCase()))
        || list[0];

      if (!exact?.id) throw new Error(`Order not found: ${clean}`);
      await openOrderById(exact.id);
    } catch (e: any) {
      setError(e?.message || 'Failed to open order');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------
  // CUSTOMER suggestions
  // -----------------------
  const fetchSuggestions = async (searchTerm: string) => {
    if (searchTerm.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSearchLoading(true);
    try {
      const formattedSearch = formatPhoneNumber(searchTerm);
      const searchResults = await customerService.search({ phone: formattedSearch, per_page: 10 });

      const matching = searchResults.data.filter((c) => {
        const cPhone = c.phone.replace(/\D/g, '');
        return cPhone.startsWith(formattedSearch);
      });

      setSuggestions(matching);
      setShowSuggestions(matching.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // -----------------------
  // ORDER suggestions
  // -----------------------
  const fetchOrderSuggestions = async (searchTerm: string) => {
    if (searchTerm.length < 3) {
      setOrderSuggestions([]);
      setShowOrderSuggestions(false);
      return;
    }
    setOrderSearchLoading(true);
    try {
      const cleanSearch = searchTerm.trim().replace(/^#/, '');

      const searchResults = await orderService.getAll({
        search: cleanSearch,
        per_page: 10,
        skipStoreScope: true,
      });

      const matching: CustomerOrder[] = searchResults.data
        .filter((order: any) => {
          const orderNum = order.order_number.replace(/^#/, '');
          const searchNum = cleanSearch.replace(/^#/, '');
          return orderNum.toLowerCase().startsWith(searchNum.toLowerCase());
        })
        .map((order: any) => ({
          id: order.id,
          order_number: order.order_number,
          order_date: order.order_date,
          order_type: order.order_type,
          order_type_label: order.order_type_label || order.order_type,
          total_amount: order.total_amount,
          paid_amount: order.paid_amount,
          outstanding_amount: order.outstanding_amount,
          payment_status: order.payment_status,
          status: order.status,
          store: order.store,
          items: order.items || [],
          shipping_address: order.shipping_address,
          notes: order.notes,
        }));

      setOrderSuggestions(matching);
      setShowOrderSuggestions(matching.length > 0);
    } catch {
      setOrderSuggestions([]);
    } finally {
      setOrderSearchLoading(false);
    }
  };

  // -----------------------
  // BATCH suggestions
  // -----------------------
  const fetchBatchSuggestions = async (term: string) => {
    if (term.trim().length < 2) {
      setBatchSuggestions([]);
      setShowBatchSuggestions(false);
      return;
    }
    setBatchSearchLoading(true);
    try {
      const res = await batchService.getBatchesArray({
        search: term.trim(),
        per_page: 10,
      });

      const t = term.trim().toLowerCase();
      const filtered = res.filter((b) => (b.batch_number || '').toLowerCase().includes(t));

      setBatchSuggestions(filtered);
      setShowBatchSuggestions(filtered.length > 0);
    } catch {
      setBatchSuggestions([]);
    } finally {
      setBatchSearchLoading(false);
    }
  };

  // -----------------------
  // Effects: debounce inputs
  // -----------------------
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (phoneNumber.trim() && activeTab === 'customer') fetchSuggestions(phoneNumber);
      else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumber, activeTab]);

  React.useEffect(() => {
    const id = setTimeout(() => {
      if (orderNumber.trim() && activeTab === 'order') fetchOrderSuggestions(orderNumber);
      else {
        setOrderSuggestions([]);
        setShowOrderSuggestions(false);
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, activeTab]);

  React.useEffect(() => {
    const id = setTimeout(() => {
      if (batchQuery.trim() && activeTab === 'batch') fetchBatchSuggestions(batchQuery);
      else {
        setBatchSuggestions([]);
        setShowBatchSuggestions(false);
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchQuery, activeTab]);

  // Click outside close dropdowns
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.search-container')) setShowSuggestions(false);
      if (!target.closest('.order-search-container')) setShowOrderSuggestions(false);
      if (!target.closest('.batch-search-container')) setShowBatchSuggestions(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -----------------------
  // Customer handlers
  // -----------------------
  const handleSelectSuggestion = async (selectedCustomer: Customer) => {
    setPhoneNumber(selectedCustomer.phone);
    setShowSuggestions(false);
    setSuggestions([]);

    setLoading(true);
    setError('');
    setCustomer(null);
    setOrders([]);
    setSingleOrder(null);

    try {
      setCustomer(selectedCustomer);

      const ordersResponse = await customerService.getOrderHistory(selectedCustomer.id, {
        per_page: 100,
        page: 1,
      });

      setOrders(normalizeCustomerOrders(ordersResponse.data));
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading customer data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchCustomer = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setShowSuggestions(false);
    setSuggestions([]);

    setLoading(true);
    setError('');
    setCustomer(null);
    setOrders([]);
    setSingleOrder(null);

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);

      const searchResults = await customerService.search({
        phone: formattedPhone,
        per_page: 10,
      });

      if (!searchResults.data || searchResults.data.length === 0) {
        setError('No customer found with this phone number');
        return;
      }

      const exact = searchResults.data.find((c) => c.phone.replace(/\D/g, '') === formattedPhone);
      if (!exact) {
        setError(`No customer found with phone number: ${phoneNumber}`);
        return;
      }

      setCustomer(exact);

      const ordersResponse = await customerService.getOrderHistory(exact.id, {
        per_page: 100,
        page: 1,
      });
      setOrders(normalizeCustomerOrders(ordersResponse.data));
    } catch (err: any) {
      setError(err.message || 'An error occurred while searching');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------
  // Order handlers
  // -----------------------
  const handleSelectOrderSuggestion = async (selected: CustomerOrder) => {
    setOrderNumber(selected.order_number);
    setShowOrderSuggestions(false);
    setOrderSuggestions([]);

    await openOrderById(selected.id);
  };

  const handleSearchOrder = async () => {
    if (!orderNumber.trim()) {
      setError('Please enter an order number');
      return;
    }

    setLoading(true);
    setError('');
    setSingleOrder(null);
    setCustomer(null);
    setOrders([]);

    try {
      const cleanOrderNumber = orderNumber.trim().replace(/^#/, '');

      const ordersResponse: any = await orderService.getAll({
        search: cleanOrderNumber,
        per_page: 50,
        skipStoreScope: true,
      });

      if (!ordersResponse.data || ordersResponse.data.length === 0) {
        setError(`No order found with number: ${cleanOrderNumber}`);
        return;
      }

      let found = ordersResponse.data.find((o: any) => o.order_number.toLowerCase() === cleanOrderNumber.toLowerCase());
      if (!found) found = ordersResponse.data.find((o: any) => o.order_number.toLowerCase().includes(cleanOrderNumber.toLowerCase()));
      if (!found) found = ordersResponse.data[0];

      await openOrderById(found.id);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'An error occurred while searching for the order');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------
  // Barcode handlers
  // -----------------------
  const resolveBarcodePurchaseInfo = async (barcode: string, historyData?: any) => {
    setBarcodePurchaseLoading(true);

    let mergedLookup: any = null;
    let po: any = null;
    let vendor: any = null;
    let poOrigin: any = null;
    let poId: number | null = null;
    let poNumber: string | undefined;
    let vendorName: string | undefined;
    let resolvedImageUrl: string | null = null;

    try {
      // Primary source: enhanced lookup endpoint (includes purchase_order + vendor)
      const lookupRes = await lookupService.getProductByBarcode(barcode);
      const lkRaw: any = lookupRes?.data || null;
      const lk: any = lkRaw?.data && typeof lkRaw?.data === 'object' ? lkRaw.data : lkRaw;

      if (lookupRes?.success && lk && typeof lk === 'object') {
        mergedLookup = lk;
        setBarcodeLookupData(lk);

        resolvedImageUrl = extractProductImageFromLookup(lk);

        po =
          lk?.purchase_order ||
          lk?.purchaseOrder ||
          lk?.po ||
          lk?.procurement?.purchase_order ||
          lk?.procurement?.purchaseOrder ||
          null;

        vendor =
          lk?.vendor ||
          lk?.vendor_info ||
          lk?.vendorInfo ||
          lk?.procurement?.vendor ||
          lk?.procurement?.vendor_info ||
          lk?.product?.vendor ||
          po?.vendor ||
          null;

        poOrigin = lk?.purchase_order_origin || lk?.purchaseOrderOrigin || lk?.po_origin || null;

        poId =
          parseId(po?.id) ||
          parseId(po?.purchase_order_id) ||
          parseId(lk?.purchase_order_id) ||
          parseId(lk?.purchaseOrderId) ||
          parseId(poOrigin?.id) ||
          parseId(poOrigin?.po_id) ||
          parseId(poOrigin?.purchase_order_id) ||
          null;

        poNumber =
          po?.po_number ||
          po?.poNumber ||
          po?.order_number ||
          po?.orderNumber ||
          poOrigin?.po_number ||
          poOrigin?.poNumber ||
          undefined;

        vendorName =
          vendor?.company_name ||
          vendor?.companyName ||
          vendor?.name ||
          po?.vendor?.company_name ||
          po?.vendor?.companyName ||
          po?.vendor?.name ||
          undefined;
      }
    } catch {
      // continue to fallback path
    }

    // Fallback 2: infer PO from /batches/{id} when barcode history doesn't expose PO fields
    if (!poId && historyData) {
      try {
        const loc = historyData?.current_locations?.[0] || historyData?.current_location;
        const batchId =
          parseId(loc?.batch?.id) ||
          parseId(loc?.batch_id) ||
          parseId(historyData?.batch?.id) ||
          null;

        if (batchId) {
          const br = await batchService.getBatch(batchId);
          const b: any = br?.data;
          const batchPo = b?.purchase_order || b?.purchaseOrder || b?.po || null;
          const batchVendor = b?.vendor || b?.vendor_info || batchPo?.vendor || null;

          poId =
            parseId(batchPo?.id) ||
            parseId(b?.purchase_order_id) ||
            parseId(b?.purchaseOrderId) ||
            parseId(b?.po_id) ||
            poId;

          if (!po && batchPo) po = batchPo;
          if (!vendor && batchVendor) vendor = batchVendor;

          if (!poNumber) {
            poNumber = batchPo?.po_number || batchPo?.poNumber || undefined;
          }
          if (!vendorName) {
            vendorName =
              batchVendor?.company_name || batchVendor?.companyName || batchVendor?.name || vendorName;
          }
        }
      } catch {
        // non-blocking
      }
    }

    // Fallback 3: fetch PO by ID for richer details + vendor
    if (poId && (!po || !vendor || !poNumber || !vendorName)) {
      try {
        const res = await purchaseOrderService.getById(poId);
        const fullPo: any = res?.data || res;
        if (fullPo) {
          po = po || fullPo;
          vendor = vendor || fullPo?.vendor || null;
          poNumber = poNumber || fullPo?.po_number || fullPo?.poNumber || fullPo?.order_number || fullPo?.orderNumber;
          vendorName =
            vendorName ||
            fullPo?.vendor?.company_name ||
            fullPo?.vendor?.companyName ||
            fullPo?.vendor?.name ||
            fullPo?.vendor_name ||
            fullPo?.vendorName;
        }
      } catch {
        // non-blocking
      }
    }

    // Merge enhanced procurement details into lookup payload for UI section
    if (mergedLookup || po || vendor) {
      const base = mergedLookup || {};
      const summary = {
        ...(base?.summary || {}),
        has_purchase_order: Boolean(base?.summary?.has_purchase_order ?? po ?? poId ?? poNumber),
        has_vendor_info: Boolean(base?.summary?.has_vendor_info ?? vendor ?? vendorName),
      };

      const merged = {
        ...base,
        ...(po ? { purchase_order: po } : {}),
        ...(vendor ? { vendor } : {}),
        ...(poOrigin ? { purchase_order_origin: poOrigin } : {}),
        summary,
      };

      setBarcodeLookupData(merged);
    }

    // Resolve product image (lookup payload first, then dedicated image endpoints)
    if (!resolvedImageUrl) {
      const productId =
        parseId(mergedLookup?.product?.id) ||
        parseId(historyData?.product?.id) ||
        parseId(historyData?.current_location?.product_id) ||
        null;

      if (productId) {
        try {
          const imgRes: any = await productImageService.getPrimaryImage(productId);
          const primary = imgRes?.data || imgRes?.image || imgRes;
          const img =
            primary?.image_url ||
            primary?.imageUrl ||
            primary?.url ||
            primary?.path ||
            null;
          resolvedImageUrl = toAbsoluteAssetUrl(img);
        } catch {
          // ignore
        }

        if (!resolvedImageUrl) {
          try {
            const listRes: any = await productImageService.getProductImages(productId);
            const list =
              listRes?.data?.images ||
              listRes?.data ||
              listRes?.images ||
              (Array.isArray(listRes) ? listRes : []);
            const first = Array.isArray(list) && list.length > 0 ? list[0] : null;
            const img = first?.image_url || first?.imageUrl || first?.url || first?.path || null;
            resolvedImageUrl = toAbsoluteAssetUrl(img);
          } catch {
            // ignore
          }
        }
      }
    }

    setBarcodeProductImageUrl(resolvedImageUrl || null);

    if (po || vendor || poId || poNumber || vendorName) {
      setBarcodePurchaseInfo({
        ...(poId ? { poId } : {}),
        ...(poNumber ? { poNumber } : {}),
        ...(vendorName ? { vendorName } : {}),
      });
    } else {
      setBarcodePurchaseInfo(null);
    }

    setBarcodePurchaseLoading(false);
  };

  const handleReturnInitiate = (order: any) => {
    setSelectedOrderForAction(order);
    setShowReturnModal(true);
  };

  const handleExchangeInitiate = (order: any) => {
    setSelectedOrderForAction(order);
    setShowExchangeModal(true);
  };

  const handleReturnSubmit = async (returnData: any) => {
    try {
      if (!selectedOrderForAction) return;
      console.log('🔄 Processing return (atomic):', returnData);

      const returnRequest: CreateReturnRequest = {
        order_id: selectedOrderForAction.id,
        return_reason: returnData.returnReason,
        return_type: returnData.returnType,
        received_at_store_id: returnData.receivedAtStoreId,
        items: returnData.selectedProducts.map((item: any) => ({
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          product_barcode_id: item.product_barcode_id,
        })),
        customer_notes: returnData.customerNotes || 'Initiated from lookup page',
      };

      // Use the atomic quickComplete endpoint
      await productReturnService.quickComplete(returnRequest);

      // Handle refund if needed
      if (returnData.refundMethods && returnData.refundMethods.total > 0) {
        // Need return ID for refund - quickComplete returns the product return object
        const res = await productReturnService.quickComplete(returnRequest);
        const returnId = res.data.id;

        const refundRequest: CreateRefundRequest = {
          return_id: returnId,
          refund_type: 'full',
          refund_method: 'cash',
          refund_method_details: {
            cash: returnData.refundMethods.cash,
            card: returnData.refundMethods.card,
            bkash: returnData.refundMethods.bkash,
            nagad: returnData.refundMethods.nagad,
          },
          internal_notes: 'Refund processed via lookup page',
        };

        const refundRes = await refundService.create(refundRequest);
        await refundService.process(refundRes.data.id);
        await refundService.complete(refundRes.data.id, {
          transaction_reference: `LOOKUP-REFUND-${Date.now()}`,
        });
      }

      alert('✅ Return processed successfully!');
      setShowReturnModal(false);
      // Refresh search to show updated status/quantities
      if (activeTab === 'order' && orderNumber) {
        handleSearchOrder();
      }
    } catch (error: any) {
      console.error('❌ Return processing failed:', error);
      alert(`Error: ${error.response?.data?.message || error.message || 'Failed to process return'}`);
    }
  };

  const handleExchangeSubmit = async (exchangeData: any) => {
    try {
      if (!selectedOrderForAction) return;
      console.log('🔄 Processing consolidated exchange:', exchangeData);

      // Construct the comprehensive payload for the atomic backend transaction
      const payload = {
        order_id: selectedOrderForAction.id,
        exchangeAtStoreId: exchangeData.exchangeAtStoreId,
        customer_id: selectedOrderForAction.customer?.id,
        removedProducts: exchangeData.removedProducts.map((item: any) => {
          const originalItem = selectedOrderForAction.items.find((i: any) => i.id === item.order_item_id);
          const unitPrice = parseFloat(originalItem?.unit_price || '0');
          return {
            order_item_id: item.order_item_id,
            product_id: originalItem?.product_id,
            product_batch_id: originalItem?.product_batch_id || originalItem?.batch_id,
            quantity: item.quantity,
            unit_price: unitPrice,
            total_price: unitPrice * item.quantity,
            product_barcode_id: item.product_barcode_id,
            return_reason: 'other', // Default reason
            quality_check_passed: true, // Defaulting for quick exchange
          };
        }),
        replacementProducts: exchangeData.replacementProducts.map((p: any) => ({
          product_id: p.product_id,
          batch_id: p.batch_id,
          quantity: p.quantity,
          unit_price: p.unit_price,
          barcode: p.barcode,
          barcode_id: p.barcode_id,
        })),
        paymentRefund: {
          type: exchangeData.paymentRefund?.type === 'payment' ? 'surplus' : (exchangeData.paymentRefund?.type === 'refund' ? 'refund' : 'even'),
          amount: exchangeData.paymentRefund?.total || 0,
          method: exchangeData.paymentRefund?.card > 0 ? 'card' : 
                  (exchangeData.paymentRefund?.bkash > 0 ? 'bkash' : 
                  (exchangeData.paymentRefund?.nagad > 0 ? 'nagad' : 'cash')),
          details: {
            cash: exchangeData.paymentRefund?.cash || 0,
            card: exchangeData.paymentRefund?.card || 0,
            bkash: exchangeData.paymentRefund?.bkash || 0,
            nagad: exchangeData.paymentRefund?.nagad || 0,
          }
        },
        notes: `Exchange transaction via Lookup Page - Original Order: ${selectedOrderForAction.order_number}`,
      };

      const response = await axiosInstance.post('/exchange/process', payload);
      
      console.log('✅ Exchange processed successfully:', response.data);
      alert('Exchange processed successfully!');
      
      // Close modal and refresh data
      setShowExchangeModal(false);
      setSelectedOrderForAction(null);

      if (activeTab === 'order' && orderNumber) {
        handleSearchOrder();
      } else if (activeTab === 'customer' && phoneNumber) {
        handleSearchCustomer();
      } else {
        // Fallback refresh
        window.location.reload();
      }

    } catch (error: any) {
      console.error('❌ Consolidated exchange processing failed:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to process exchange';
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleSearchBarcode = async (codeOverride?: string) => {
    const code = (codeOverride ?? barcodeInput).trim();
    if (!code) {
      setError('Please enter a barcode');
      return;
    }

    setBarcodeLoading(true);
    setError('');
    setBarcodeData(null);
    setBarcodePurchaseInfo(null);
    setBarcodeLookupData(null);
    setBarcodeProductImageUrl(null);
    closeBarcodeImagePreview();

    try {
      const res = await lookupService.getProductByBarcode(code);
      if (!res?.success) {
        setError('Barcode not found');
        return;
      }
      
      const data = res.data;
      setBarcodeData(data);
      
      // Extract purchase info for display
      if (data.purchase_order || data.vendor) {
        setBarcodePurchaseInfo({
          poId: data.purchase_order?.id,
          poNumber: data.purchase_order?.po_number,
          vendorName: data.vendor?.company_name || data.vendor?.name
        });
      }

      // Try several ways to find product image
      let imageUrl = extractProductImageFromLookup(data);
      setBarcodeProductImageUrl(imageUrl);

    } catch (err: any) {
      setError(err.message || 'Failed to fetch barcode history');
    } finally {
      setBarcodeLoading(false);
    }
  };


  // -----------------------

  // -----------------------
  // Batch handlers
  // -----------------------
  const handleSelectBatchSuggestion = async (b: Batch) => {
    setBatchQuery(b.batch_number);
    setSelectedBatchId(b.id);
    setShowBatchSuggestions(false);
    setBatchSuggestions([]);

    await handleSearchBatch(b.id);
  };

  const handleSearchBatch = async (forcedBatchId?: number) => {
    const batchId = forcedBatchId || selectedBatchId;

    let finalBatchId: number | null = batchId ?? null;
    if (!finalBatchId) {
      const maybe = Number(batchQuery.trim());
      if (!Number.isNaN(maybe) && maybe > 0) finalBatchId = maybe;
    }

    if (!finalBatchId) {
      setError('Select a batch from suggestions or enter a batch ID');
      return;
    }

    setBatchLoading(true);
    setError('');
    setBatchData(null);

    try {
      const res = await lookupService.getBatch(finalBatchId);
      if (!res?.success) {
        setError('Batch not found');
        return;
      }
      setBatchData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch batch history');
    } finally {
      setBatchLoading(false);
    }
  };

  // Tab switch reset
  const switchTab = (tab: LookupTab) => {
    setActiveTab(tab);
    setError('');
    setExpandedOrderId(null);

    if (tab === 'customer') {
      setSingleOrder(null);
    }
    if (tab === 'order') {
      setOrders([]);
    }
    if (tab === 'barcode') {
      setBarcodeData(null);
      setBarcodePurchaseInfo(null);
      setBarcodeLookupData(null);
      setBarcodeProductImageUrl(null);
      closeBarcodeImagePreview();
    }
    if (tab === 'batch') {
      setBatchData(null);
    }
  };

  const barcodePO: any =
    barcodeLookupData?.purchase_order ||
    (barcodeLookupData as any)?.purchaseOrder ||
    (barcodeLookupData as any)?.po ||
    (barcodeLookupData as any)?.procurement?.purchase_order ||
    null;
  const barcodeVendor: any =
    barcodeLookupData?.vendor ||
    (barcodeLookupData as any)?.vendor_info ||
    (barcodeLookupData as any)?.vendorInfo ||
    barcodeLookupData?.product?.vendor ||
    barcodePO?.vendor ||
    null;
  const barcodePOOrigin: any =
    barcodeLookupData?.purchase_order_origin ||
    (barcodeLookupData as any)?.purchaseOrderOrigin ||
    (barcodeLookupData as any)?.po_origin ||
    null;
  const barcodeSummary: any = barcodeLookupData?.summary || null;

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="flex h-screen bg-white dark:bg-black">
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header darkMode={darkMode} setDarkMode={setDarkMode} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

          <main className="flex-1 overflow-auto bg-white dark:bg-black">
            {/* Header + Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-800">
              <div className="px-4 py-2">
                <div className="max-w-7xl mx-auto">
                  <h1 className="text-base font-semibold text-black dark:text-white leading-none mb-2">Lookup</h1>

                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => switchTab('customer')}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === 'customer'
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                        }`}
                    >
                      Customer Lookup
                    </button>

                    <button
                      onClick={() => switchTab('order')}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === 'order'
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                        }`}
                    >
                      Order Lookup
                    </button>

                    <button
                      onClick={() => switchTab('barcode')}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === 'barcode'
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                        }`}
                    >
                      Barcode History
                    </button>

                    <button
                      onClick={() => switchTab('batch')}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${activeTab === 'batch'
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                        }`}
                    >
                      Batch History
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="max-w-6xl mx-auto px-4 py-4">
              {/* Error */}
              {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

              {/* =========================
                  CUSTOMER PANEL
                  ========================= */}
              {activeTab === 'customer' && (
                <>
                  <div className="mb-4">
                    <div className="relative max-w-xl mx-auto search-container">
                      <div className="relative">
                        <input
                          type="text"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSearchCustomer();
                          }}
                          onFocus={() => {
                            if (suggestions.length > 0) setShowSuggestions(true);
                          }}
                          placeholder="Type phone number..."
                          className="w-full pl-3 pr-24 py-2.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-black dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                        />
                        <button
                          onClick={handleSearchCustomer}
                          disabled={loading}
                          className="absolute right-1.5 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                        >
                          {loading ? 'Searching...' : 'Search'}
                        </button>

                        {showSuggestions && suggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-xl max-h-80 overflow-y-auto z-50">
                            {searchLoading && (
                              <div className="px-3 py-2 text-center">
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-black dark:border-t-white rounded-full animate-spin mx-auto"></div>
                              </div>
                            )}

                            {suggestions.map((s, index) => (
                              <button
                                key={s.id}
                                onClick={() => handleSelectSuggestion(s)}
                                className={`w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${index !== suggestions.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-black dark:text-white mb-0.5">{s.phone}</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{s.name}</p>
                                  </div>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black dark:bg-white text-white dark:text-black font-medium uppercase">
                                    {s.customer_type}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {customer && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-md p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-black dark:text-white">{customer.name}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{customer.phone}</p>
                          {customer.customer_code && (
                            <p className="text-[10px] text-gray-500 dark:text-gray-500">Code: {customer.customer_code}</p>
                          )}
                          {/* Customer Tags (view + manage) */}
                          <CustomerTagManager
                            customerId={(customer as any).id}
                            initialTags={Array.isArray((customer as any).tags) ? (customer as any).tags : []}
                            compact
                            onTagsChange={(next) =>
                              setCustomer((prev) => (prev ? ({ ...(prev as any), tags: next } as any) : prev))
                            }
                          />
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                          {orders.length} orders
                        </span>
                      </div>
                    </div>
                  )}

                  {orders.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h2 className="text-xs font-semibold text-black dark:text-white uppercase tracking-wide">Order History</h2>
                        <span className="text-[9px] px-2 py-0.5 bg-black dark:bg-white text-white dark:text-black rounded font-medium">
                          {orders.length}
                        </span>
                      </div>

                      <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {orders.map((order) => (
                          <div key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                            <div className="p-3 cursor-pointer" onClick={() => toggleOrderDetails(order.id)}>
                              <div className="grid grid-cols-5 gap-3">
                                <div>
                                  <p className="text-[9px] text-gray-500 dark:text-gray-500 uppercase font-medium mb-0.5">Order #</p>
                                  <p className="text-xs font-medium text-black dark:text-white">{order.order_number}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-500 dark:text-gray-500 uppercase font-medium mb-0.5">Date</p>
                                  <p className="text-xs text-black dark:text-white">{formatDate(order.order_date)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-500 dark:text-gray-500 uppercase font-medium mb-0.5">Type</p>
                                  <p className="text-xs text-black dark:text-white">{formatOrderType(order)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-500 dark:text-gray-500 uppercase font-medium mb-0.5">Total</p>
                                  <p className="text-xs font-medium text-black dark:text-white">{formatCurrency(order.total_amount)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] text-gray-500 dark:text-gray-500 uppercase font-medium mb-0.5">Payment</p>
                                  {getStatusBadge(order.payment_status)}
                                </div>
                              </div>
                            </div>

                            {expandedOrderId === order.id && (
                              <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                                <div className="pt-3 space-y-2">
                                  <div>
                                    <p className="text-[9px] font-semibold text-black dark:text-white uppercase mb-1.5">Items</p>
                                    <div className="bg-white dark:bg-black rounded border border-gray-200 dark:border-gray-800 overflow-hidden">
                                      <table className="w-full text-[10px]">
                                        <thead className="bg-gray-50 dark:bg-gray-900">
                                          <tr>
                                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Product</th>
                                            <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">SKU</th>
                                            <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Qty</th>
                                            <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Price</th>
                                            <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Total</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                          {order.items.map((item) => (
                                            <tr key={item.id}>
                                              <td className="px-2 py-1.5 font-medium text-black dark:text-white">{item.product_name}</td>
                                              <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{item.product_sku}</td>
                                              <td className="px-2 py-1.5 text-right font-medium text-black dark:text-white">{item.quantity}</td>
                                              <td className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-400">{formatCurrency(item.unit_price)}</td>
                                              <td className="px-2 py-1.5 text-right font-medium text-black dark:text-white">{formatCurrency(item.total_amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="mt-2">
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          setActiveTab('order');
                                          await openOrderById(order.id);
                                        }}
                                        className="text-[10px] px-3 py-1.5 rounded bg-black dark:bg-white text-white dark:text-black hover:opacity-90"
                                      >
                                        Open in Order Lookup (Barcodes)
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <p className="text-[9px] font-semibold text-black dark:text-white uppercase mb-1">Store</p>
                                      <p className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">{getStoreNameFromAny(order)}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] font-semibold text-black dark:text-white uppercase mb-1">Payment</p>
                                      <div className="space-y-0.5 text-[10px]">
                                        <div className="flex justify-between">
                                          <span className="text-gray-600 dark:text-gray-400">Total:</span>
                                          <span className="font-medium text-black dark:text-white">{formatCurrency(order.total_amount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600 dark:text-gray-400">Paid:</span>
                                          <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(order.paid_amount)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-600 dark:text-gray-400">Due:</span>
                                          <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(order.outstanding_amount)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {order.notes && (
                                    <div>
                                      <p className="text-[9px] font-semibold text-black dark:text-white uppercase mb-1">Notes</p>
                                      <p className="text-[10px] text-gray-600 dark:text-gray-400">{order.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ======================
                  ORDER PANEL (barcodes + reprint)
                  ====================== */}
              {activeTab === 'order' && (
                <>
                  <div className="mb-4">
                    <div className="relative max-w-xl mx-auto order-search-container">
                      <div className="relative">
                        <input
                          type="text"
                          value={orderNumber}
                          onChange={(e) => setOrderNumber(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSearchOrder();
                          }}
                          onFocus={() => {
                            if (orderSuggestions.length > 0) setShowOrderSuggestions(true);
                          }}
                          placeholder="Type order number..."
                          className="w-full pl-3 pr-24 py-2.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-black dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                        />
                        <button
                          onClick={handleSearchOrder}
                          disabled={loading}
                          className="absolute right-1.5 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                        >
                          {loading ? 'Searching...' : 'Search'}
                        </button>

                        {showOrderSuggestions && orderSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-xl max-h-80 overflow-y-auto z-50">
                            {orderSearchLoading && (
                              <div className="px-3 py-2 text-center">
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-black dark:border-t-white rounded-full animate-spin mx-auto"></div>
                              </div>
                            )}
                            {orderSuggestions.map((s, index) => (
                              <button
                                key={s.id}
                                onClick={() => handleSelectOrderSuggestion(s)}
                                className={`w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${index !== orderSuggestions.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-black dark:text-white mb-0.5">{s.order_number}</p>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-gray-600 dark:text-gray-400">{formatDate(s.order_date)}</span>
                                      <span className="text-gray-400">•</span>
                                      <span className="font-medium text-gray-600 dark:text-gray-400">{formatCurrency(s.total_amount)}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">{getStatusBadge(s.payment_status)}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {singleOrder && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h2 className="text-xs font-semibold text-black dark:text-white uppercase tracking-wide">Order Details (with Barcodes)</h2>
                        <span className="text-[9px] px-2 py-0.5 bg-black dark:bg-white text-white dark:text-black rounded font-medium">1</span>
                      </div>

                      <div className="p-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Order #</p>
                            <p className="text-sm font-semibold text-black dark:text-white">{singleOrder.order_number}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Date</p>
                            <p className="text-sm text-black dark:text-white">{formatDate(singleOrder.order_date)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Total</p>
                            <p className="text-sm font-semibold text-black dark:text-white">{formatCurrency(singleOrder.total_amount)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Payment</p>
                            {getStatusBadge(singleOrder.payment_status)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          <div>
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Sold From</p>
                            <p className="text-sm text-black dark:text-white">{getStoreNameFromAny(singleOrder)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Type</p>
                            <p className="text-sm text-black dark:text-white">{formatOrderType(singleOrder)}</p>
                          </div>
                        </div>

                        <div className="bg-white dark:bg-black rounded border border-gray-200 dark:border-gray-800 overflow-hidden">
                          <table className="w-full text-[10px]">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                              <tr>
                                <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Product</th>
                                <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Qty</th>
                                <th className="px-2 py-1.5 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Barcodes</th>
                                <th className="px-2 py-1.5 text-right text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                              {singleOrder.items.map((item: any) => {
                                const barcodes: string[] = Array.isArray(item?.barcodes) ? item.barcodes : item?.barcode ? [item.barcode] : [];

                                return (
                                  <tr key={item.id}>
                                    <td className="px-2 py-1.5 font-medium text-black dark:text-white">
                                      {item.product_name}
                                      <div className="text-[9px] text-gray-500">{item.product_sku}</div>
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-black dark:text-white">{item.quantity}</td>

                                    <td className="px-2 py-1.5">
                                      {barcodes.length > 0 ? (
                                        <div className="flex flex-col gap-1">
                                          {barcodes.slice(0, 12).map((code: string) => (
                                            <div key={code} className="flex items-center gap-2">
                                              <button
                                                onClick={() => {
                                                  setActiveTab('barcode');
                                                  setBarcodeInput(code);
                                                  setBarcodeData(null);
                                                  setBarcodePurchaseInfo(null);
                                                  setBarcodeLookupData(null);
                                                  setBarcodeProductImageUrl(null);
                                                  closeBarcodeImagePreview();
                                                  setError('');
                                                  setTimeout(() => handleSearchBarcode(), 0);
                                                }}
                                                className="text-[10px] font-semibold text-black dark:text-white hover:underline"
                                                title="Open barcode history"
                                              >
                                                {code}
                                              </button>
                                              <button
                                                onClick={() =>
                                                  printSingleBarcodeLabel({
                                                    barcode: code,
                                                    productName: item.product_name,
                                                    price: item.unit_price,
                                                  })
                                                }
                                                className="text-[10px] px-2 py-0.5 rounded bg-black dark:bg-white text-white dark:text-black hover:opacity-90"
                                                title="Reprint this barcode"
                                              >
                                                Reprint
                                              </button>
                                            </div>
                                          ))}
                                          {barcodes.length > 12 && <span className="text-[10px] text-gray-500">+{barcodes.length - 12} more…</span>}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">No barcodes</span>
                                      )}
                                    </td>

                                    <td className="px-2 py-1.5 text-right font-semibold text-black dark:text-white">{formatCurrency(item.total_amount)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {singleOrder.notes && (
                          <div className="mt-3">
                            <p className="text-[9px] font-semibold text-black dark:text-white uppercase mb-1">Notes</p>
                            <p className="text-[10px] text-gray-600 dark:text-gray-400">{singleOrder.notes}</p>
                          </div>
                        )}

                        <ReturnExchangeFromOrder
                          order={singleOrder}
                          onInitiateReturn={handleReturnInitiate}
                          onInitiateExchange={handleExchangeInitiate}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ======================
                  BARCODE PANEL (FIXED: Sold + Order info + Batch prices)
                  ====================== */}
              {activeTab === 'barcode' && (
                <>
                  <div className="mb-4">
                    <div className="relative max-w-xl mx-auto">
                      <div className="relative">
                        <input
                          ref={barcodeInputRef}
                          type="text"
                          value={barcodeInput}
                          onChange={(e) => setBarcodeInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSearchBarcode();
                          }}
                          placeholder="Type barcode..."
                          className="w-full pl-3 pr-24 py-2.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-black dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSearchBarcode()}
                          disabled={barcodeLoading}
                          className="absolute right-1.5 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                        >
                          {barcodeLoading ? 'Loading...' : 'Search'}
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 text-center">
                        Tip: You can scan a barcode here using the same scanner behavior as POS (no need to type).
                      </p>
                    </div>
                  </div>

                  {barcodeData && (
                    <div className="space-y-3">
                      <div className="border border-gray-200 dark:border-gray-800 rounded-md p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-black dark:text-white">
                              {barcodeData.product.name}{' '}
                              <span className="text-gray-500 text-[10px]">{barcodeData.product.sku ? `(${barcodeData.product.sku})` : ''}</span>
                            </p>
                            <p className="text-[10px] text-gray-600 dark:text-gray-400">
                              Barcode: <span className="font-semibold">{barcodeData.barcode.barcode}</span>
                              <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                                {barcodeData.barcode.is_mother_barcode ? 'Mother Barcode' : 'Unique Barcode'}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-start gap-2">
                            {(() => {
                              const fallbackFromHistory =
                                toAbsoluteAssetUrl((barcodeData as any)?.product?.image_url) ||
                                toAbsoluteAssetUrl((barcodeData as any)?.product?.imageUrl) ||
                                toAbsoluteAssetUrl((barcodeData as any)?.product?.thumbnail) ||
                                null;
                              const finalImage = barcodeProductImageUrl || fallbackFromHistory;

                              return finalImage ? (
                                <button
                                  type="button"
                                  onClick={() => openBarcodeImagePreview(finalImage)}
                                  className="group relative"
                                  title="Click to preview image"
                                >
                                  <img
                                    src={finalImage}
                                    alt={barcodeData?.product?.name || 'Product image'}
                                    className="w-12 h-12 rounded border border-gray-200 dark:border-gray-700 object-cover"
                                    loading="lazy"
                                  />
                                  <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    View
                                  </span>
                                </button>
                              ) : (
                                <div className="w-12 h-12 rounded border border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-[9px] text-gray-400 dark:text-gray-500">
                                  No image
                                </div>
                              );
                            })()}
                            <span className="text-[10px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                              {barcodeData.summary.total_sales + barcodeData.summary.total_dispatches} movements recorded
                            </span>
                          </div>
                        </div>

                        {/* Current locations (Stock breakdown) */}
                        {barcodeData.current_locations && barcodeData.current_locations.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[9px] text-gray-500 uppercase font-medium mb-1.5">Current Stock Locations</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {barcodeData.current_locations.map((loc, idx) => (
                                <div key={idx} className="border border-gray-200 dark:border-gray-800 rounded p-2 bg-white dark:bg-gray-900/10">
                                  <div className="flex justify-between items-center mb-1">
                                    <p className="text-xs font-semibold text-black dark:text-white">{loc.store_name}</p>
                                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400">{loc.quantity} units</span>
                                  </div>
                                  <p className="text-[9px] text-gray-500">Latest Batch: {loc.batch_number}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* PURCHASE ORDER / VENDOR */}
                        <div className="mt-3 border border-gray-200 dark:border-gray-800 rounded p-2 bg-white dark:bg-gray-900/20">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[9px] text-gray-500 uppercase font-medium">Procurement</p>
                            {barcodePurchaseLoading && (
                              <span className="text-[9px] text-gray-500 dark:text-gray-400">loading…</span>
                            )}
                          </div>

                          <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
                              <p className="text-[9px] text-gray-500 uppercase font-medium mb-1">Purchase Order</p>
                              <p className="text-[10px] text-black dark:text-white">
                                <span className="font-semibold">
                                  {barcodePO?.po_number ||
                                    barcodePOOrigin?.po_number ||
                                    barcodePurchaseInfo?.poNumber ||
                                    (barcodePO?.id ? `#${barcodePO.id}` : barcodePurchaseInfo?.poId ? `#${barcodePurchaseInfo.poId}` : '—')}
                                </span>
                              </p>
                              <div className="mt-1 text-[10px] text-black dark:text-white space-y-0.5">
                                <p>
                                  Status:{' '}
                                  <span className="font-semibold">
                                    {barcodePO?.status || (barcodeSummary?.has_purchase_order ? 'Linked' : '—')}
                                  </span>
                                </p>
                                <p>
                                  Payment:{' '}
                                  <span className="font-semibold">{barcodePO?.payment_status || '—'}</span>
                                </p>
                                <p>
                                  Order Date:{' '}
                                  <span className="font-semibold">{formatDate(barcodePO?.order_date)}</span>
                                </p>
                                <p>
                                  Expected Delivery:{' '}
                                  <span className="font-semibold">{formatDate(barcodePO?.expected_delivery_date)}</span>
                                </p>
                                <p>
                                  Received Store:{' '}
                                  <span className="font-semibold">{barcodePO?.store?.name || '—'}</span>
                                </p>
                                <p>
                                  Created By:{' '}
                                  <span className="font-semibold">{barcodePO?.created_by?.name || barcodePO?.createdBy?.name || '—'}</span>
                                </p>
                              </div>
                            </div>

                            <div className="border border-gray-200 dark:border-gray-800 rounded p-2">
                              <p className="text-[9px] text-gray-500 uppercase font-medium mb-1">Vendor</p>
                              <p className="text-[10px] text-black dark:text-white">
                                <span className="font-semibold">
                                  {barcodeVendor?.company_name || barcodeVendor?.companyName || barcodeVendor?.name || barcodePurchaseInfo?.vendorName || '—'}
                                </span>
                              </p>
                              <div className="mt-1 text-[10px] text-black dark:text-white space-y-0.5">
                                <p>
                                  Contact:{' '}
                                  <span className="font-semibold">{barcodeVendor?.name || '—'}</span>
                                </p>
                                <p>
                                  Phone:{' '}
                                  <span className="font-semibold">{barcodeVendor?.phone || barcodeVendor?.mobile || '—'}</span>
                                </p>
                              </div>
                            </div>
                          </div>
                      
                          {!barcodeData.purchase_order && !barcodeData.vendor && !barcodeData.summary?.has_purchase_order && (
                            <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                              No purchase order/vendor info linked to this barcode.
                            </p>
                          )}
                        </div>

                        {/* SOLD / ORDER INFO */}
                        {barcodeData.summary?.total_sales > 0 && (
                          <div className="mt-3 border border-gray-200 dark:border-gray-800 rounded p-2 bg-gray-50 dark:bg-gray-900/40">
                             <p className="text-[9px] text-gray-500 uppercase font-medium mb-1">Sales Summary</p>
                             <p className="text-xs font-semibold text-black dark:text-white">
                               Sold {barcodeData.summary.total_sales} unit(s) from this mother barcode.
                               {barcodeData.summary.total_returns > 0 && <span className="ml-2 text-red-500 text-[10px]">({barcodeData.summary.total_returns} returned)</span>}
                             </p>
                          </div>
                        )}
                      </div>

                       {/* Activity History Table */}
                      <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                          <h2 className="text-xs font-semibold text-black dark:text-white uppercase tracking-wide">Product Activity History</h2>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] px-2 py-0.5 bg-black dark:bg-white text-white dark:text-black rounded font-medium">
                              {barcodeData.activity_history?.length || 0}
                            </span>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead className="bg-white dark:bg-black">
                              <tr className="border-b border-gray-200 dark:border-gray-800">
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Date</th>
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Event</th>
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Description</th>
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">By</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                              {(barcodeData.activity_history || []).map((h: any) => (
                                <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{h.timestamp ? formatDate(h.timestamp) : h.human_time}</td>
                                  <td className="px-2 py-2 font-semibold text-black dark:text-white uppercase text-[9px]">{h.event}</td>
                                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300 max-w-xs truncate">{h.description}</td>
                                  <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{h.performed_by?.name || '—'}</td>
                                </tr>
                              ))}
                              {!barcodeData.activity_history?.length && (
                                <tr>
                                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                                    No activity history found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                </>
              )}

              {/* ======================
                  BATCH PANEL (FIXED: sold vs inactive + click sold shows order details)
                  ====================== */}
              {activeTab === 'batch' && (
                <>
                  <div className="mb-4">
                    <div className="relative max-w-xl mx-auto batch-search-container">
                      <div className="relative">
                        <input
                          type="text"
                          value={batchQuery}
                          onChange={(e) => {
                            setBatchQuery(e.target.value);
                            setSelectedBatchId(null);
                          }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSearchBatch();
                          }}
                          onFocus={() => {
                            if (batchSuggestions.length > 0) setShowBatchSuggestions(true);
                          }}
                          placeholder="Type batch number (or batch ID)..."
                          className="w-full pl-3 pr-24 py-2.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-black dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                        />
                        <button
                          onClick={() => handleSearchBatch()}
                          disabled={batchLoading}
                          className="absolute right-1.5 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-xs"
                        >
                          {batchLoading ? 'Loading...' : 'Search'}
                        </button>

                        {showBatchSuggestions && batchSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md shadow-xl max-h-80 overflow-y-auto z-50">
                            {batchSearchLoading && (
                              <div className="px-3 py-2 text-center">
                                <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-700 border-t-black dark:border-t-white rounded-full animate-spin mx-auto"></div>
                              </div>
                            )}

                            {batchSuggestions.map((b, index) => (
                              <button
                                key={b.id}
                                onClick={() => handleSelectBatchSuggestion(b)}
                                className={`w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left ${index !== batchSuggestions.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
                                  }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-black dark:text-white mb-0.5">{b.batch_number}</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                      {b.product?.name} {b.product?.sku ? `(${b.product.sku})` : ''} • {b.store?.name}
                                    </p>
                                  </div>
                                  <span className="text-[9px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                                    ID: {b.id}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {batchData && (
                    <div className="space-y-3">
                      <div className="border border-gray-200 dark:border-gray-800 rounded-md p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-black dark:text-white">
                              Batch: {batchData.batch.batch_number} <span className="text-gray-500 text-[10px]"> (ID: {batchData.batch.id})</span>
                            </p>
                            <p className="text-[10px] text-gray-600 dark:text-gray-400">
                              Mother Barcode: <span className="font-bold text-blue-600 dark:text-blue-400">{(batchData.batch as any).mother_barcode || '—'}</span>
                            </p>
                            <p className="text-[10px] text-gray-600 dark:text-gray-400">
                              Product: <span className="font-semibold">{batchData.batch.product.name}</span>{' '}
                              {batchData.batch.product.sku ? `(${batchData.batch.product.sku})` : ''}
                            </p>

                            {/* Batch price (if backend provides) */}
                            <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">
                              Cost:{' '}
                              <span className="font-semibold text-black dark:text-white">
                                {(() => {
                                  const p = extractBatchPrices(batchData.batch);
                                  return p.cost != null ? formatCurrency(p.cost) : '—';
                                })()}
                              </span>
                              <span className="mx-2">•</span>
                              Sell:{' '}
                              <span className="font-semibold text-black dark:text-white">
                                {(() => {
                                  const p = extractBatchPrices(batchData.batch);
                                  return p.sell != null ? formatCurrency(p.sell) : '—';
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                        <div className="bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-800">
                          <h2 className="text-xs font-semibold text-black dark:text-white uppercase tracking-wide">Units in Batch</h2>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead className="bg-white dark:bg-black">
                              <tr className="border-b border-gray-200 dark:border-gray-800">
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Unit / Barcode</th>
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Store</th>
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Status</th>
                                <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Flags</th>
                                <th className="px-2 py-2 text-right text-[9px] font-semibold text-gray-700 dark:text-gray-300 uppercase">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                              {((batchData as any).barcodes || []).map((b: any) => {
                                const sold = b.status === 'sold' || b.order_number;
                                return (
                                  <tr key={b.id}>
                                    <td className="px-2 py-2 font-medium text-black dark:text-white">{b.barcode || '—'}</td>
                                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400">{b.store?.name || '—'}</td>
                                    <td className="px-2 py-2">
                                      <span className={`text-[9px] px-2 py-0.5 rounded font-semibold uppercase ${
                                        sold ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'bg-green-100 text-green-700 dark:bg-green-900/30'
                                      }`}>
                                        {sold ? 'Sold' : 'Stock'}
                                      </span>
                                    </td>
                                    <td className="px-2 py-2">
                                      <div className="flex flex-wrap gap-1">
                                        {b.is_defective && (
                                          <span className="text-[9px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">defective</span>
                                        )}

                                        {/* sale means available for sale */}
                                        {b.is_available_for_sale && !sold && (
                                          <span className="text-[9px] px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">sale</span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                               {(!batchData.barcodes || !batchData.barcodes.length) && (
                                  (batchData.batch as any).mother_barcode ? (
                                    <tr>
                                      <td className="px-2 py-2 font-medium text-black dark:text-white">{(batchData.batch as any).mother_barcode}</td>
                                      <td className="px-2 py-2 text-gray-600 dark:text-gray-400">{batchData.store?.name || '—'}</td>
                                      <td className="px-2 py-2">
                                        <span className="text-[9px] px-2 py-0.5 rounded font-semibold uppercase bg-green-100 text-green-700 dark:bg-green-900/30">
                                          Stock ({batchData.batch.quantity} units)
                                        </span>
                                      </td>
                                      <td className="px-2 py-2">
                                        <div className="flex flex-wrap gap-1">
                                          <span className="text-[9px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">mother barcode</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-2 text-right">
                                        <BatchPrinter 
                                          batch={{
                                            id: batchData.batch.id,
                                            productId: batchData.product.id,
                                            quantity: batchData.batch.quantity,
                                            costPrice: safeNum(batchData.batch.cost_price),
                                            sellingPrice: safeNum(batchData.batch.sell_price),
                                            baseCode: (batchData.batch as any).mother_barcode
                                          }}
                                          product={{
                                            id: batchData.product.id,
                                            name: batchData.product.name,
                                            barcode: (batchData.batch as any).mother_barcode
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  ) : (
                                    <tr>
                                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                                        No units found for this batch.
                                      </td>
                                    </tr>
                                  )
                                )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
            {/* Return/Exchange Modals */}
                </>
              )}
            </div>

            {/* Barcode Product Image Preview Modal */}
            {barcodeImagePreviewOpen && barcodeImagePreviewUrl && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/70" onClick={closeBarcodeImagePreview} />
                <div className="relative w-full max-w-4xl bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-black dark:text-white">Product Image</p>
                      <p className="text-[10px] text-gray-600 dark:text-gray-400">{barcodeData?.product?.name || 'Barcode product'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={closeBarcodeImagePreview}
                      className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:opacity-90"
                    >
                      Close
                    </button>
                  </div>

                  <div className="p-3 bg-gray-50 dark:bg-gray-950 flex items-center justify-center max-h-[80vh] overflow-auto">
                    <img
                      src={barcodeImagePreviewUrl}
                      alt={barcodeData?.product?.name || 'Product image'}
                      className="max-w-full max-h-[72vh] object-contain rounded"
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Return/Exchange Modals */}
            {showReturnModal && selectedOrderForAction && (
              <ReturnProductModal
                onClose={() => setShowReturnModal(false)}
                order={selectedOrderForAction}
                onReturn={handleReturnSubmit}
              />
            )}
            {showExchangeModal && selectedOrderForAction && (
              <ExchangeProductModal
                order={selectedOrderForAction}
                onClose={() => setShowExchangeModal(false)}
                onExchange={handleExchangeSubmit}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}