'use client';

import React from 'react';

import { ProductVariant } from '@/app/e-commerce/product/[id]/page';

interface VariantSelectorProps {
  variants: ProductVariant[];
  selectedVariant: ProductVariant;
  onVariantChange: (variant: ProductVariant) => void;
  baseName?: string;
}

const formatVariantLabelForCard = (v: ProductVariant) => {
  // Use variation_suffix as the primary source of truth as it's more stable
  let source = v.variation_suffix || v.name || '';

  // Basic cleanup: remove brackets and leading/trailing dashes
  let clean = source.replace(/^\[|\]$/g, '').trim();
  while (clean.startsWith('-')) clean = clean.substring(1);
  while (clean.endsWith('-')) clean = clean.substring(0, clean.length - 1);

  const parts = clean.split(/[-/]/).map(p => p.trim()).filter(p => {
    const lp = p.toLowerCase();
    return lp !== 'na' && lp !== 'not applicable' && lp !== 'none' && lp !== '';
  });

  // Specific conversion for "US X / EU Y" patterns
  // Pattern: detects "us" followed by a number, and another numeric part for EU
  let usIndex = -1;
  let usVal = '';
  let euVal = '';

  for (let i = 0; i < parts.length; i++) {
    const low = parts[i].toLowerCase();
    if (low === 'us' && i + 1 < parts.length && !isNaN(Number(parts[i + 1]))) {
      usIndex = i;
      usVal = parts[i + 1];
      break;
    }
  }

  if (usIndex !== -1) {
    // We found a US size value. Look for another numeric part to assume as EU
    for (let i = 0; i < parts.length; i++) {
      if (i !== usIndex && i !== (usIndex + 1) && !isNaN(Number(parts[i]))) {
        euVal = parts[i];
        break;
      }
    }

    if (usVal && euVal) {
      // Reconstruct the remaining parts (e.g. Color)
      const others = parts.filter((_, i) => i !== usIndex && i !== (usIndex + 1) && parts[i] !== euVal);
      const sizeStr = `US ${usVal} / EU ${euVal}`;
      return others.length > 0 ? `${sizeStr} - ${others.join(' - ')}` : sizeStr;
    }
  }

  // Fallback: standard hyphenation for other patterns
  return parts.join(' - ') || 'Standard';
};

const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  selectedVariant,
  onVariantChange,
}) => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-baseline">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-black"
            style={{ fontFamily: "'DM Mono', monospace" }}>
            Select Option
          </p>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
            {variants.length} available
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {variants.map((v) => {
            const isSelected = selectedVariant.id === v.id;
            const isAvailable = v.in_stock && (v.available_inventory ?? 0) > 0;
            const label = formatVariantLabelForCard(v);

            return (
              <button
                key={v.id}
                onClick={() => onVariantChange(v)}
                className={`min-h-[44px] min-w-[60px] px-5 rounded-xl text-[11px] font-bold transition-all border-2 flex items-center justify-center relative overflow-hidden ${isSelected
                    ? 'bg-black border-black text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)] z-10'
                    : isAvailable
                      ? 'bg-white border-gray-100 text-gray-500 hover:border-black hover:text-black'
                      : 'bg-gray-50/50 border-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                style={{ fontFamily: "'Jost', sans-serif" }}
              >
                <span className="relative z-20 whitespace-nowrap">{label}</span>

                {!isAvailable && (
                  <div className="absolute inset-0 pointer-events-none opacity-20">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gray-400 -rotate-45" />
                  </div>
                )}

                {isSelected && (
                  <div className="absolute top-0 right-0 w-0 h-0 border-t-[12px] border-l-[12px] border-t-white/20 border-l-transparent" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VariantSelector;
