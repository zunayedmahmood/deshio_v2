"use client";

import React, { useState } from "react";
import MultiBarcodePrinter, { MultiBarcodePrintItem } from "./MultiBarcodePrinter";

export type BatchBarcodeSource = {
  batchId: number;
  productName: string;
  price: number;
  // The mother barcode (product level)
  fallbackCode: string;
  // How many labels to print for this item
  qty?: number;
};

export default function GroupedAllBarcodesPrinter({
  sources,
  buttonLabel = "Print ALL Barcodes",
  title = "Print all barcodes",
  softLimit = 1000,
}: {
  sources: BatchBarcodeSource[];
  buttonLabel?: string;
  title?: string;
  // If barcode count is higher than this, show a confirm to prevent accidental mega-prints.
  softLimit?: number;
}) {
  const [items, setItems] = useState<MultiBarcodePrintItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoOpenToken, setAutoOpenToken] = useState<number | undefined>(undefined);

  const totalSources = sources.length;

  const prepare = async () => {
    try {
      setLoading(true);
      setError(null);

      const collected: MultiBarcodePrintItem[] = [];

      for (const s of sources) {
        if (!s.fallbackCode) continue;

        collected.push({
          code: s.fallbackCode,
          productName: s.productName,
          price: s.price,
          qty: s.qty || 1
        });
      }

      if (collected.length === 0) {
        alert("No barcodes found to print.");
        return;
      }

      const totalLabels = collected.reduce((acc, curr) => acc + (curr.qty || 1), 0);

      if (totalLabels > softLimit) {
        const ok = confirm(
          `You are about to print ${totalLabels} labels for ${totalSources} item(s).\n\nThis can take time and paper. Continue?`
        );
        if (!ok) return;
      }

      setItems(collected);
      // Use a changing token to auto-open exactly once per preparation.
      setAutoOpenToken(Date.now());
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to prepare barcodes");
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || sources.length === 0;

  return (
    <>
      <button
        onClick={prepare}
        disabled={disabled}
        className="px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title={sources.length ? "Print barcodes for all items" : "No variations"}
      >
        {loading ? "Preparing..." : buttonLabel}
      </button>

      {/* Hidden trigger printer that auto-opens after preparation */}
      <MultiBarcodePrinter
        items={items}
        hideButton
        autoOpenToken={autoOpenToken}
        title={title}
        buttonLabel=""
      />

      {error ? (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      ) : null}
    </>
  );
}
