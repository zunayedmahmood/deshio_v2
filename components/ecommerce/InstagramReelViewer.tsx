'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Instagram } from 'lucide-react';
import InstagramEmbed from './InstagramEmbed';

const REEL_URLS = [
  'https://www.instagram.com/reel/DW6uSbkERA9/',
  'https://www.instagram.com/p/DW6DQUGk-ho/',
  'https://www.instagram.com/reel/DW323H0EboK/',
  'https://www.instagram.com/p/DWwVRsnEzn8/',
  'https://www.instagram.com/p/DWnvVqhE6-p/',
];

export default function InstagramReelViewer() {
  const [activeIndex, setActiveIndex] = useState(2); // Start with middle
  const [carouselHeight, setCarouselHeight] = useState<number>(700);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const prev = () => setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
  const next = () => setActiveIndex((prev) => (prev < REEL_URLS.length - 1 ? prev + 1 : prev));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    touchStartX.current = null;
  };

  // Recalculate the carousel container height based on ALL rendered items.
  // We measure every visible item and take the maximum so the container never
  // shrinks/grows when switching between reels of different heights.
  const recalcHeight = useCallback(() => {
    let max = 0;
    itemRefs.current.forEach((el) => {
      if (!el) return;
      // Temporarily make it visible enough to measure its natural height
      const scrollH = el.scrollHeight;
      if (scrollH > max) max = scrollH;
    });
    if (max > 0) {
      // Add a small buffer (24px) to avoid tight clipping on some embeds
      setCarouselHeight(max + 24);
    }
  }, []);

  // Re-process Instagram embeds and remeasure when active index changes
  useEffect(() => {
    if ((window as any).instgrm) {
      (window as any).instgrm.Embeds.process();
    }
    // Give the embed a moment to settle before remeasuring
    const t = setTimeout(recalcHeight, 800);
    return () => clearTimeout(t);
  }, [activeIndex, recalcHeight]);

  // Set up a ResizeObserver on all items so we always track the tallest one
  useEffect(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(recalcHeight);
    itemRefs.current.forEach((el) => {
      if (el) resizeObserverRef.current!.observe(el);
    });
    return () => resizeObserverRef.current?.disconnect();
  }, [recalcHeight]);

  // Initial measurement after mount
  useEffect(() => {
    const t = setTimeout(recalcHeight, 1200);
    return () => clearTimeout(t);
  }, [recalcHeight]);

  return (
    <section className="bg-[var(--bg-surface)] relative py-20 border-y border-[var(--border-default)]">
      <div className="ec-container mb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <div
              className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--cyan)] mb-4"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              On the Feed
            </div>
            <h2
              className="text-[var(--text-primary)] text-4xl md:text-5xl font-medium tracking-tight"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Culture in Motion
            </h2>
            <p className="text-[var(--text-secondary)] mt-4 max-w-lg text-[15px] leading-relaxed">
              Explore our latest drops, community styling, and behind-the-scenes highlights straight
              from our studio.
            </p>
          </div>
          <a
            href="https://www.instagram.com/errum_bd/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-6 py-3 bg-[var(--bg-lifted)] border border-[var(--border-strong)] text-[var(--text-primary)] rounded-[var(--radius-sm)] text-[12px] font-bold uppercase tracking-widest hover:bg-[var(--cyan-pale)] hover:border-[var(--cyan)] hover:text-[var(--cyan)] transition-all group self-start md:self-auto"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            <Instagram size={16} className="transition-colors" />
            <span>Follow @errum_bd</span>
          </a>
        </div>
      </div>

      {/*
        KEY FIX: The carousel wrapper has an explicit height derived from the tallest embed.
        `overflow: hidden` on the wrapper prevents layout bleed from absolutely-positioned items.
        We do NOT use min-h anymore — height is always exactly what the tallest reel needs.
      */}
      <div
        className="relative flex items-center justify-center select-none"
        style={{ height: carouselHeight }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        ref={containerRef}
      >
        {/* Navigation Arrows */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-between px-4 md:px-12 pointer-events-none">
          <button
            onClick={prev}
            disabled={activeIndex === 0}
            className={`w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center transition-all pointer-events-auto ${activeIndex === 0
                ? 'opacity-0 pointer-events-none'
                : 'bg-[var(--bg-lifted)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--cyan)] hover:text-[var(--cyan)] opacity-100'
              }`}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={next}
            disabled={activeIndex === REEL_URLS.length - 1}
            className={`w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center transition-all pointer-events-auto ${activeIndex === REEL_URLS.length - 1
                ? 'opacity-0 pointer-events-none'
                : 'bg-[var(--bg-lifted)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--cyan)] hover:text-[var(--cyan)] opacity-100'
              }`}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Carousel Items */}
        <div className="relative w-full max-w-5xl mx-auto h-full flex items-center justify-center perspective-1000">
          {REEL_URLS.map((url, index) => {
            const diff = index - activeIndex;
            const isActive = diff === 0;
            const isPrev = diff === -1;
            const isNext = diff === 1;

            let transform = 'scale(0.7) translateX(0)';
            let opacity = '0';
            let zIndex = 0;

            if (isActive) {
              transform = 'scale(1) translateX(0)';
              opacity = '1';
              zIndex = 20;
            } else if (isPrev) {
              transform = 'scale(0.85) translateX(-60%) rotateY(15deg)';
              opacity = '0.4';
              zIndex = 10;
            } else if (isNext) {
              transform = 'scale(0.85) translateX(60%) rotateY(-15deg)';
              opacity = '0.4';
              zIndex = 10;
            } else if (diff < -1) {
              transform = 'scale(0.7) translateX(-120%)';
              opacity = '0';
              zIndex = 0;
            } else {
              transform = 'scale(0.7) translateX(120%)';
              opacity = '0';
              zIndex = 0;
            }

            return (
              <div
                key={url}
                ref={(el) => { itemRefs.current[index] = el; }}
                className="absolute transition-all duration-700 ease-out w-full max-w-[340px] md:max-w-[400px]"
                style={{
                  transform,
                  opacity,
                  zIndex,
                  // Only the active slide receives pointer events
                  pointerEvents: isActive ? 'auto' : 'none',
                  filter: isActive ? 'none' : 'grayscale(30%) blur(1px)',
                  // Clamp side cards so they never push the page height
                  overflow: isActive ? 'visible' : 'hidden',
                  // Align to the top of the carousel container so all cards
                  // anchor from the same Y origin — prevents vertical jumping
                  top: 0,
                  bottom: 'auto',
                  // Remove any implicit margin-auto centering that could shift Y
                  margin: 0,
                }}
              >
                <div className="relative group">
                  {/* Center Focus Reflection Effect */}
                  {isActive && (
                    <div className="absolute -inset-8 bg-[var(--cyan-glow)] blur-[80px] rounded-full -z-10 opacity-30" />
                  )}
                  {/*
                    Wrapper that prevents internal scrollbars on the embed.
                    Instagram iframes sometimes get overflow:scroll — we
                    override that here without hiding the content itself.
                  */}
                  <div
                    style={{
                      // Allow the embed to be its full natural height
                      overflow: 'visible',
                    }}
                    className="instagram-embed-no-scroll"
                  >
                    <InstagramEmbed url={url} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-3 mt-12 pb-4">
        {REEL_URLS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 transition-all duration-500 rounded-full ${i === activeIndex ? 'w-10 bg-[var(--cyan)]' : 'w-2 bg-[var(--border-strong)]'
              }`}
          />
        ))}
      </div>
    </section>
  );
}