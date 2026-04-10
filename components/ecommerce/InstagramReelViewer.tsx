'use client';

import React, { useState, useRef, useEffect } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

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

  // Re-process embeds when index changes to ensure they are rendered if they were hidden
  useEffect(() => {
    if ((window as any).instgrm) {
      (window as any).instgrm.Embeds.process();
    }
  }, [activeIndex]);

  return (
    <section className="ec-section overflow-hidden bg-[#0d0d0d] relative py-16">
      <div className="ec-container mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="ec-eyebrow mb-3">Live from Socials</div>
            <h2 className="text-white text-4xl md:text-5xl font-serif tracking-tight">The Errum Feed</h2>
            <p className="text-white/40 mt-4 max-w-lg">
              Explore our latest drops, styling tips, and community highlights straight from Instagram.
            </p>
          </div>
          <a
            href="https://www.instagram.com/errum_bd/"
            target="_blank"
            rel="noopener noreferrer"
            className="ec-btn bg-white/5 border border-white/10 text-white hover:bg-white/10 flex items-center gap-2 group self-start md:self-auto"
          >
            <Instagram size={18} className="group-hover:text-pink-500 transition-colors" />
            <span>Follow @errum_bd</span>
          </a>
        </div>
      </div>

      <div 
        className="relative flex items-center justify-center min-h-[650px] md:min-h-[750px] select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        ref={containerRef}
      >
        {/* Navigation Arrows */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-between px-4 md:px-12 pointer-events-none">
          <button
            onClick={prev}
            disabled={activeIndex === 0}
            className={`w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all pointer-events-auto ${
              activeIndex === 0 ? 'opacity-0' : 'hover:bg-white/20 opacity-100'
            }`}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={next}
            disabled={activeIndex === REEL_URLS.length - 1}
            className={`w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all pointer-events-auto ${
              activeIndex === REEL_URLS.length - 1 ? 'opacity-0' : 'hover:bg-white/20 opacity-100'
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
            const isVisible = Math.abs(diff) <= 1;

            let transform = 'scale(0.8) translateX(0)';
            let opacity = '0';
            let zIndex = '0';

            if (isActive) {
              transform = 'scale(1) translateX(0)';
              opacity = '1';
              zIndex = '20';
            } else if (isPrev) {
              transform = 'scale(0.85) translateX(-60%) rotateY(15deg)';
              opacity = '0.4';
              zIndex = '10';
            } else if (isNext) {
              transform = 'scale(0.85) translateX(60%) rotateY(-15deg)';
              opacity = '0.4';
              zIndex = '10';
            } else if (diff < -1) {
              transform = 'scale(0.7) translateX(-120%)';
              opacity = '0';
            } else {
              transform = 'scale(0.7) translateX(120%)';
              opacity = '0';
            }

            return (
              <div
                key={url}
                className="absolute transition-all duration-700 ease-out w-full max-w-[340px] md:max-w-[400px]"
                style={{
                  transform,
                  opacity,
                  zIndex,
                  pointerEvents: isActive ? 'auto' : 'none',
                  filter: isActive ? 'none' : 'grayscale(30%) blur(1px)',
                }}
              >
                <div className="relative group">
                   {/* Center Focus Reflection Effect */}
                   {isActive && (
                     <div className="absolute -inset-4 bg-white/5 blur-3xl rounded-full -z-10 animate-pulse" />
                   )}
                   <InstagramEmbed url={url} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center gap-2 mt-8 pb-4">
        {REEL_URLS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={`h-1.5 transition-all duration-300 rounded-full ${
              i === activeIndex ? 'w-8 bg-gold' : 'w-2 bg-white/20'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
