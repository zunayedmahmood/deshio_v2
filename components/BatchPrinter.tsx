import React, { useState, useEffect } from "react";
import {
  LABEL_WIDTH_MM as SHARED_LABEL_WIDTH_MM,
  LABEL_HEIGHT_MM as SHARED_LABEL_HEIGHT_MM,
  DEFAULT_DPI as SHARED_DEFAULT_DPI,
  mmToIn as sharedMmToIn,
  renderBarcodeLabelBase64,
} from "@/lib/barcodeLabelRenderer";

interface Product {
  id: number;
  name: string;
  barcode?: string;
}

interface Batch {
  id: number;
  productId: number;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  baseCode?: string;
}

interface BatchPrinterProps {
  batch: Batch;
  product?: Product;
}

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


async function resolvePrinterName(): Promise<string | null> {
  const qz = (window as any).qz;
  if (!qz) return null;

  try {
    const def = await qz.printers.getDefault();
    if (def && String(def).trim()) return String(def);
  } catch (_e) {}

  try {
    const found = await qz.printers.find();
    if (Array.isArray(found) && found.length > 0 && found[0]) return String(found[0]);
    if (typeof found === "string" && found.trim()) return found;
  } catch (_e) {}

  return null;
}

export default function BatchPrinter({ batch, product }: BatchPrinterProps) {
  const [isQzLoaded, setIsQzLoaded] = useState(false);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printQuantity, setPrintQuantity] = useState(batch.quantity || 1);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 20;

    const checkQZ = () => {
      attempts++;
      if (typeof window !== "undefined" && (window as any).qz) {
        setIsQzLoaded(true);
        return true;
      }
      return false;
    };

    if (checkQZ()) return;

    const interval = setInterval(() => {
      if (checkQZ() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const loadDefaultPrinter = async (): Promise<string | null> => {
    try {
      const qz = (window as any).qz;
      if (!qz) return null;

      await ensureQZConnection();
      const printer = await resolvePrinterName();

      if (printer) {
        setDefaultPrinter(printer);
        setPrinterError(null);
        return printer;
      }

      setPrinterError("No printers found");
      return null;
    } catch (err: any) {
      setPrinterError(err?.message || "QZ Tray connection failed");
      return null;
    }
  };

  const handlePrint = async () => {
    const qz = (window as any).qz;
    if (!qz) {
      alert("QZ Tray library not loaded.");
      return;
    }

    const motherBarcode = product?.barcode || batch.baseCode;
    if (!motherBarcode) {
      alert("No barcode available for this product.");
      return;
    }

    setPrintLoading(true);
    let printerToUse = defaultPrinter;
    if (!printerToUse) {
      printerToUse = await loadDefaultPrinter();
    }

    if (!printerToUse) {
      alert("No printer available.");
      setPrintLoading(false);
      return;
    }

    try {
      await ensureQZConnection();

      const dpi = SHARED_DEFAULT_DPI;
      const config = qz.configs.create(printerToUse, {
        units: "in",
        size: { width: sharedMmToIn(SHARED_LABEL_WIDTH_MM), height: sharedMmToIn(SHARED_LABEL_HEIGHT_MM) },
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        density: dpi,
        colorType: "blackwhite",
        interpolation: "nearest-neighbor",
        scaleContent: false,
      });

      const data: any[] = [];
      for (let i = 0; i < printQuantity; i++) {
        const base64 = await renderBarcodeLabelBase64({
          code: motherBarcode,
          productName: product?.name || "Product",
          price: batch.sellingPrice,
          dpi,
          brandName: "ERRUM BD",
        });

        data.push({
          type: "pixel",
          format: "image",
          flavor: "base64",
          data: base64,
        });
      }

      await qz.print(config, data);
      alert(`✅ ${data.length} label(s) sent to printer successfully!`);
    } catch (err: any) {
      console.error("❌ Print error:", err);
      alert(`Print failed: ${err.message || "Unknown error"}`);
    } finally {
      setPrintLoading(false);
    }
  };

  const canPrint = isQzLoaded && !printLoading;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          value={printQuantity}
          onChange={(e) => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-20 px-2 py-2 border rounded bg-white dark:bg-gray-800 dark:border-gray-700 text-sm"
          placeholder="Qty"
        />
        <button
          onClick={handlePrint}
          className="flex-1 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          disabled={!canPrint}
        >
          {printLoading ? "Printing..." : isQzLoaded ? "Print Labels" : "QZ Not Ready"}
        </button>
      </div>

      {defaultPrinter && (
        <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
          Printer: {defaultPrinter}
        </div>
      )}
      {printerError && (
        <div className="text-[10px] text-red-500 text-center">
          {printerError}
        </div>
      )}
    </div>
  );
}
