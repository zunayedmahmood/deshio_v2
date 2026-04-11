"use client";

import React from "react";
import Link from "next/link";
import { Facebook, Instagram, Youtube, MapPin, Phone, MessageCircle, CheckCircle } from "lucide-react";

const BRAND = "Errum";

const stores = [
  { name: "Mirpur 12", address: "Level 3, Hazi Kujrat Ali Mollah Market, Mirpur 12", phone: "01942565664" },
  { name: "Jamuna Future Park", address: "3C-17A, Level 3, Jamuna Future Park", phone: "01307130535" },
  { name: "Bashundhara City", address: "38, 39, 40, Block D, Level 5, Bashundhara City", phone: "01336041064" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  const outlets = [
    { name: "Bashundhara City Complex", image: "/Bashundhara_shopping_mall.png" },
    { name: "Mirpur 12 Outlet", image: "/Mirpure_store.png" },
    { name: "Jamuna Future Park", image: "/Jamuna_Future_Park.png" },
  ];

  return (
    <footer className="bg-[var(--bg-depth)] border-t border-[var(--border-default)] pt-20 pb-12">
      <div className="ec-container">
        
        {/* ── Outlet Showcase ── */}
        <section className="mb-24">
          <div className="flex items-center justify-center gap-6 mb-12">
            <div className="h-px w-12 md:w-24 bg-[var(--border-default)]" />
            <h2 className="text-[18px] md:text-[22px] font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Our All Outlets
            </h2>
            <div className="h-px w-12 md:w-24 bg-[var(--border-default)]" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {outlets.map((outlet, idx) => (
              <div key={idx} className="group cursor-pointer">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] mb-4 transition-all duration-500 group-hover:border-[var(--cyan-border)] group-hover:shadow-xl">
                  <img 
                    src={outlet.image} 
                    alt={outlet.name}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-depth)]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="text-center text-[15px] font-bold text-[var(--text-primary)] tracking-wide group-hover:text-[var(--cyan)] transition-colors">
                  {outlet.name}
                </h3>
              </div>
            ))}
          </div>
        </section>

        {/* ── Main Footer Grid ── */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">

          {/* ── Brand, description, Links & Social ── */}
          <div className="flex flex-col">
            <Link href="/e-commerce" className="inline-block group mb-6">
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '38px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.02em', lineHeight: 1 }}>
                Errum <span className="text-[var(--gold)] ml-1 font-bold tracking-[0.2em] uppercase text-[11px]" style={{ fontFamily: "'DM Mono', monospace" }}>STORE</span>
              </div>
            </Link>
            <p className="text-[14px] leading-relaxed text-[var(--text-secondary)] max-w-xs mb-10">
              A complete lifestyle brand — footwear, clothing, watches, and bags curated for everyday confidence across Bangladesh.
            </p>

            {/* Horizontal Links */}
            <div className="flex flex-wrap gap-x-6 gap-y-3 mb-10">
              {[
                { href: '/e-commerce/products', label: 'Collection' },
                { href: '/e-commerce/categories', label: 'Categories' },
                { href: '/e-commerce/contact', label: 'Contact' },
                { href: '/e-commerce/track', label: 'Track Order' },
              ].map(({ href, label }) => (
                <Link key={href} href={href} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--cyan)] transition-colors">
                  {label}
                </Link>
              ))}
            </div>

            {/* Social Icons */}
            <div className="flex gap-4">
              {[Facebook, Instagram, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--cyan)] hover:text-[var(--cyan)] transition-all shadow-sm"
                  aria-label="social">
                  <Icon size={18} />
                </a>
              ))}
            </div>
          </div>

          {/* ── Our Promise ── */}
          <div className="flex flex-col gap-6">
            <h4 className="text-[11px] font-bold tracking-[0.25em] uppercase text-[var(--text-muted)] px-1" style={{ fontFamily: "'DM Mono', monospace" }}>
              OUR PROMISE
            </h4>
            
            <div className="space-y-4">
              {[
                { title: 'Comfort & Quality Assured', sub: 'Thoughtfully selected with quality finishing.' },
                { title: 'In-Store & Online Support', sub: 'Visit us or order easily — responsive service.' },
                { title: 'Nationwide Delivery', sub: 'Smooth and reliable delivery across Bangladesh.' },
              ].map(({ title, sub }) => (
                <div key={title} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-6 transition-all group hover:border-[var(--cyan-border)]">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">{title}</p>
                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Stores & Contact ── */}
          <div className="flex flex-col gap-6">
            <h4 className="text-[11px] font-bold tracking-[0.25em] uppercase text-[var(--text-muted)] px-1" style={{ fontFamily: "'DM Mono', monospace" }}>
              STORES & CONTACT
            </h4>

            <div className="space-y-4">
              {stores.map(store => (
                <div key={store.name} className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] p-5 transition-all group hover:border-[var(--cyan-border)]">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">{store.name}</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5 text-[12px] text-[var(--text-secondary)]">
                      <MapPin size={14} className="mt-0.5 text-[var(--gold)]" />
                      <span>{store.address}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-[12px] text-[var(--text-secondary)]">
                      <Phone size={14} className="text-[var(--gold)]" />
                      <span>{store.phone}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* International Orders Card */}
              <div className="bg-[rgba(37,211,102,0.03)] border border-[rgba(37,211,102,0.1)] rounded-[var(--radius-lg)] p-5 transition-all group hover:bg-[rgba(37,211,102,0.06)]">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[var(--text-muted)] mb-3" style={{ fontFamily: "'DM Mono', monospace" }}>
                  INTERNATIONAL ORDERS
                </p>
                <a href="https://wa.me/8801942565664" target="_blank" rel="noreferrer" className="flex items-center gap-2.5 group/wa">
                  <MessageCircle size={16} className="text-[#25D366]" />
                  <span className="text-[14px] text-[var(--text-primary)]">
                    WhatsApp: <span className="font-bold">01942565664</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-20 flex flex-col items-center justify-between gap-6 border-t border-[var(--border-default)] pt-12 md:flex-row">
          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-[0.2em]" style={{ fontFamily: "'DM Mono', monospace" }}>
            © {year} Errum STORE — Handcrafted for Confidence.
          </p>
          <div className="flex items-center gap-3">
            {['bKash', 'Nagad', 'Visa', 'Mastercard'].map(m => (
              <span key={m} className="px-3 py-1.5 bg-[var(--bg-lifted)] border border-[var(--border-default)] text-[var(--text-muted)] text-[9px] font-bold uppercase tracking-widest rounded-lg" style={{ fontFamily: "'DM Mono', monospace" }}>
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
