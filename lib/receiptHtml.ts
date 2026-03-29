// lib/receiptHtml.ts
// 3x4 inch parcel sticker template used from Orders page "Print" action.
// Optimized for courier labels / parcel body sticker printing.

import { normalizeOrderForReceipt, type ReceiptOrder } from '@/lib/receipt';

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function money(n: any, currency?: string) {
  const symbol = currency && String(currency).trim() ? String(currency).trim() : '৳';
  const x = Number(n || 0);
  const formatted = x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

function normalizePaymentLabel(r: ReceiptOrder) {
  const raw = String(r.paymentMethod || '').trim().toLowerCase();
  const paid = Number(r.totals?.paid || 0);
  const due = Number(r.totals?.due || 0);

  if (raw.includes('cash on delivery') || raw === 'cod') return 'Cash on Delivery';
  if (raw.includes('cash')) return due > 0 ? 'Cash / COD' : 'Cash Paid';
  if (raw.includes('bkash')) return due > 0 ? 'bKash + Due' : 'bKash Paid';
  if (raw.includes('nagad')) return due > 0 ? 'Nagad + Due' : 'Nagad Paid';
  if (raw.includes('card')) return due > 0 ? 'Card + Due' : 'Card Paid';
  if (due > 0 && paid <= 0) return 'Cash on Delivery';
  if (due > 0 && paid > 0) return 'Partial Advance';
  return paid > 0 ? 'Paid' : 'Unpaid';
}

function paymentBadgeClass(label: string) {
  const t = label.toLowerCase();
  if (t.includes('delivery') || t.includes('due')) return 'badge badge-cod';
  if (t.includes('partial')) return 'badge badge-partial';
  if (t.includes('paid')) return 'badge badge-paid';
  return 'badge';
}

function receiptBody(r: ReceiptOrder) {
  const orderNo = r.orderNo || String(r.id || '—');
  const createdAt = r.dateTime || new Date().toLocaleString();
  const totalQty = (r.items || []).reduce((sum, it) => sum + Number(it.qty || 0), 0);
  const payableAmount = Number(r.totals?.due || 0) > 0 ? Number(r.totals?.due || 0) : Number(r.totals?.total || 0);
  const paymentLabel = normalizePaymentLabel(r);
  const addressLines = (r.customerAddressLines || []).slice(0, 4);

  const itemsHtml = (r.items || [])
    .map((it, index) => {
      const name = [it.name, it.variant].filter(Boolean).join(' • ');
      return `<div class="item-row">
        <div class="item-left">
          <span class="item-index">${index + 1}</span>
          <span class="item-name">${escapeHtml(name || 'Item')}</span>
        </div>
        <span class="item-qty">x${escapeHtml(String(it.qty || 0))}</span>
      </div>`;
    })
    .join('');

  return `
    <div class="sticker">
      <div class="topbar">
        <div>
          <div class="brand">ERRUM BD</div>
          <div class="sub">Parcel Sticker</div>
        </div>
        <div class="order-chip">${escapeHtml(orderNo)}</div>
      </div>

      <div class="hero">
        <div>
          <div class="hero-label">Collect Amount</div>
          <div class="hero-amount">${escapeHtml(money(payableAmount))}</div>
          <div class="hero-note">Payable on delivery</div>
        </div>
        <div class="hero-side">
          <div class="${paymentBadgeClass(paymentLabel)}">${escapeHtml(paymentLabel)}</div>
          ${r.intendedCourier ? `<div class="mini-meta"><span>Courier</span><strong>${escapeHtml(r.intendedCourier)}</strong></div>` : ''}
          ${r.orderTypeLabel || r.orderType ? `<div class="mini-meta"><span>Order</span><strong>${escapeHtml(r.orderTypeLabel || r.orderType || '')}</strong></div>` : ''}
        </div>
      </div>

      <div class="section recipient">
        <div class="section-title">Ship To</div>
        <div class="recipient-name">${escapeHtml(r.customerName || 'Customer')}</div>
        ${r.customerPhone ? `<div class="recipient-phone">${escapeHtml(r.customerPhone)}</div>` : ''}
        <div class="address">${addressLines.length ? addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('') : '<div>Address not available</div>'}</div>
      </div>

      <div class="grid-two">
        <div class="info-card">
          <div class="k">Date</div>
          <div class="v">${escapeHtml(createdAt)}</div>
        </div>
        <div class="info-card">
          <div class="k">Items</div>
          <div class="v">${escapeHtml(String(totalQty))} pcs</div>
        </div>
      </div>

      <div class="section products">
        <div class="section-title">Product Details</div>
        <div class="item-list">${itemsHtml || '<div class="empty">No items</div>'}</div>
      </div>

      <div class="bottom-grid">
        <div class="amount-card">
          <div class="k">Order Total</div>
          <div class="v">${escapeHtml(money(r.totals?.total ?? 0))}</div>
        </div>
        <div class="amount-card emphasis">
          <div class="k">COD Amount</div>
          <div class="v">${escapeHtml(money(payableAmount))}</div>
        </div>
      </div>

      ${r.notes ? `<div class="notes"><span>Note:</span> ${escapeHtml(r.notes)}</div>` : ''}

      <div class="footer-note">Handle with care • Verify phone before delivery</div>
    </div>
  `;
}

function wrapHtml(title: string, inner: string, opts?: { embed?: boolean }) {
  const embed = !!opts?.embed;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: 3in 4in; margin: 0.12in; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f3f4f6; color: #111827; }
    body { font-family: Inter, Arial, Helvetica, sans-serif; }
    .shell { padding: ${embed ? '0' : '12px'}; }
    .sticker {
      width: 100%;
      min-height: calc(4in - 0.24in);
      background: #fff;
      border: 1px solid #111827;
      border-radius: 14px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .topbar { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .brand { font-size: 18px; font-weight: 800; letter-spacing: 0.04em; line-height: 1; }
    .sub { margin-top: 3px; font-size: 11px; color: #4b5563; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
    .order-chip { border: 1px solid #111827; border-radius: 999px; padding: 5px 10px; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .hero {
      border: 1.6px solid #111827;
      border-radius: 12px;
      padding: 10px;
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 10px;
      background: linear-gradient(135deg, #f9fafb 0%, #eef2ff 100%);
    }
    .hero-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; }
    .hero-amount { font-size: 24px; line-height: 1; font-weight: 900; margin-top: 4px; }
    .hero-note { margin-top: 4px; font-size: 10px; color: #4b5563; }
    .hero-side { display: flex; flex-direction: column; gap: 6px; justify-content: center; }
    .badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 28px; padding: 6px 8px; border-radius: 999px; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid #d1d5db; background: #f9fafb;
    }
    .badge-cod { background: #111827; color: #fff; border-color: #111827; }
    .badge-paid { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
    .badge-partial { background: #fffbeb; color: #92400e; border-color: #fde68a; }
    .mini-meta { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 6px 8px; }
    .mini-meta span { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
    .mini-meta strong { display: block; font-size: 11px; margin-top: 2px; }
    .section { border: 1px solid #e5e7eb; border-radius: 12px; padding: 9px 10px; }
    .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; margin-bottom: 6px; }
    .recipient-name { font-size: 15px; font-weight: 800; line-height: 1.15; }
    .recipient-phone { font-size: 14px; font-weight: 700; margin-top: 4px; }
    .address { margin-top: 6px; font-size: 11px; line-height: 1.32; color: #111827; }
    .grid-two, .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .info-card, .amount-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px 9px; }
    .info-card .k, .amount-card .k { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; }
    .info-card .v { margin-top: 4px; font-size: 11px; font-weight: 700; line-height: 1.25; word-break: break-word; }
    .amount-card .v { margin-top: 4px; font-size: 16px; font-weight: 900; line-height: 1; }
    .amount-card.emphasis { background: #eff6ff; border-color: #93c5fd; }
    .item-list { display: flex; flex-direction: column; gap: 6px; }
    .item-row { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .item-left { display: flex; gap: 6px; min-width: 0; }
    .item-index {
      width: 16px; height: 16px; flex: 0 0 16px; border-radius: 999px; background: #111827; color: #fff;
      display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; margin-top: 1px;
    }
    .item-name { font-size: 11px; line-height: 1.25; font-weight: 600; word-break: break-word; }
    .item-qty { font-size: 11px; font-weight: 800; white-space: nowrap; }
    .notes { font-size: 10px; line-height: 1.3; color: #374151; border-top: 1px dashed #d1d5db; padding-top: 8px; }
    .notes span { font-weight: 800; }
    .footer-note { margin-top: auto; text-align: center; font-size: 9px; color: #6b7280; font-weight: 700; letter-spacing: 0.03em; }
    .btnbar { position: fixed; top: 10px; right: 10px; display:flex; gap:8px; z-index: 50; }
    .btnbar button { font-family: inherit; font-size: 12px; padding: 8px 10px; cursor:pointer; }
    .page { break-after: page; page-break-after: always; padding: ${embed ? '0' : '0'}; }
    .page:last-child { break-after: auto; page-break-after: auto; }
    @media print {
      html, body { background: #fff; }
      .btnbar { display:none; }
      .shell { padding: 0; }
      .sticker { border-radius: 10px; }
    }
  </style>
</head>
<body>
  ${embed ? '' : `
  <div class="btnbar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button onclick="window.close()">Close</button>
  </div>
  `}
  <div class="shell">${inner}</div>
</body>
</html>`;
}

export function receiptHtml(order: any, opts?: { embed?: boolean }): string {
  const r = normalizeOrderForReceipt(order);
  const title = `Parcel Sticker ${r.orderNo || r.id || ''}`.trim();
  return wrapHtml(title, `<div class="page">${receiptBody(r)}</div>`, opts);
}

export function receiptBulkHtml(orders: any[], opts?: { embed?: boolean }): string {
  const pages = (orders || []).map((o) => {
    const r = normalizeOrderForReceipt(o);
    const title = `Parcel Sticker ${r.orderNo || r.id || ''}`.trim();
    return `<div class="page" data-title="${escapeHtml(title)}">${receiptBody(r)}</div>`;
  }).join('');
  return wrapHtml('Parcel Stickers', pages || '<p>No orders selected</p>', opts);
}

export function openReceiptPreview(order: any): void {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=520,height=820');
  if (!w) {
    alert('Popup blocked. Please allow popups to preview parcel sticker.');
    return;
  }
  w.document.open();
  w.document.write(receiptHtml(order));
  w.document.close();
}

export function openBulkReceiptPreview(orders: any[]): void {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=560,height=900');
  if (!w) {
    alert('Popup blocked. Please allow popups to preview parcel stickers.');
    return;
  }
  w.document.open();
  w.document.write(receiptBulkHtml(orders));
  w.document.close();
}
