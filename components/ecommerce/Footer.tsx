"use client";

import React from "react";
import Link from "next/link";
import { Facebook, Instagram, Youtube, MapPin, Phone, MessageCircle } from "lucide-react";

const BRAND = "Errum";

const stores = [
  { name: "Mirpur 12", address: "Level 3, Hazi Kujrat Ali Mollah Market, Mirpur 12", phone: "01942565664" },
  { name: "Jamuna Future Park", address: "3C-17A, Level 3, Jamuna Future Park", phone: "01307130535" },
  { name: "Bashundhara City", address: "38, 39, 40, Block D, Level 5, Bashundhara City", phone: "01336041064" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="ec-root relative" style={{ background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Gold accent line */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent 0%, var(--gold) 50%, transparent 100%)' }} />

      {/* Subtle glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 left-0 h-64 w-64 rounded-full opacity-[0.07]" style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 h-56 w-56 rounded-full opacity-[0.05]" style={{ background: 'radial-gradient(circle, var(--gold) 0%, transparent 70%)' }} />
      </div>

      <div className="ec-container relative">
        <div className="grid grid-cols-1 gap-10 py-14 md:grid-cols-3">

          {/* Brand */}
          <div className="space-y-5">
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '28px', fontWeight: 600, color: 'white', letterSpacing: '0.04em' }}>
                {BRAND}
                <span style={{ fontSize: '10px', fontFamily: "'DM Mono', monospace", letterSpacing: '0.2em', color: 'var(--gold)', marginLeft: '8px', fontWeight: 400 }}>STORE</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                A complete lifestyle brand — footwear, clothing, watches, and bags curated for everyday confidence across Bangladesh.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { href: '/e-commerce/products', label: 'Collection' },
                { href: '/e-commerce/categories', label: 'Categories' },
                { href: '/e-commerce/contact', label: 'Contact' },
                { href: '/e-commerce/order-tracking', label: 'Track Order' },
              ].map(({ href, label }) => (
                <Link key={href} href={href} className="text-[12px] transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--gold-light)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
                  {label}
                </Link>
              ))}
            </div>

            <div className="flex gap-2.5">
              {[Facebook, Instagram, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="flex h-9 w-9 items-center justify-center rounded-xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(176,124,58,0.15)'; el.style.borderColor = 'rgba(176,124,58,0.3)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLAnchorElement; el.style.background = 'rgba(255,255,255,0.05)'; el.style.borderColor = 'rgba(255,255,255,0.09)'; }}
                  aria-label="social">
                  <Icon size={16} style={{ color: 'rgba(255,255,255,0.5)' }} />
                </a>
              ))}
            </div>
          </div>

          {/* Shopping Promise */}
          <div className="space-y-4">
            <h4 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
              Our Promise
            </h4>
            <div className="space-y-3">
              {[
                { title: 'Comfort & Quality Assured', sub: 'Thoughtfully selected with quality finishing.' },
                { title: 'In-Store & Online Support', sub: 'Visit us or order easily — responsive service.' },
                { title: 'Nationwide Delivery', sub: 'Smooth and reliable delivery across Bangladesh.' },
              ].map(({ title, sub }) => (
                <div key={title} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[13px] font-semibold text-white">{title}</p>
                  <p className="mt-1 text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Stores */}
          <div className="space-y-5">
            <h4 className="text-[11px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
              Stores & Contact
            </h4>
            <div className="space-y-3">
              {stores.map(store => (
                <div key={store.name} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[13px] font-semibold text-white mb-2">{store.name}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-start gap-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <MapPin size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--gold)' }} />
                      <span>{store.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <Phone size={13} className="flex-shrink-0" style={{ color: 'var(--gold)' }} />
                      <span>{store.phone}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* WhatsApp */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <p className="text-[10px] tracking-[0.15em] uppercase mb-2" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>International Orders</p>
                <div className="flex items-center gap-2">
                  <MessageCircle size={14} style={{ color: '#4ade80' }} />
                  <p className="text-[13px] text-white">WhatsApp: <span className="font-semibold">01942565664</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-3 border-t py-6 md:flex-row" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontFamily: "'DM Mono', monospace", letterSpacing: '0.08em' }}>
            © {year} {BRAND}. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/e-commerce/order-tracking"
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all"
              style={{ background: 'rgba(176,124,58,0.15)', border: '1px solid rgba(176,124,58,0.25)', color: 'var(--gold-light)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(176,124,58,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(176,124,58,0.15)')}>
              Track Order
            </Link>
            {['bKash', 'Nagad', 'Card'].map(m => (
              <span key={m} className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Mono', monospace" }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

