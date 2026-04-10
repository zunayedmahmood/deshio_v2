'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';

interface StickyAddToCartProps {
  isVisible: boolean;
  productName: string;
  priceText: string;
  isAdding: boolean;
  disabled: boolean;
  onAddToCart: () => void;
}

const StickyAddToCart: React.FC<StickyAddToCartProps> = ({
  isVisible,
  productName,
  priceText,
  isAdding,
  disabled,
  onAddToCart,
}) => {
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[60] bg-white border-t border-gray-100 p-4 transition-all duration-500 pb-[calc(1rem+env(safe-area-inset-bottom))] ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
        } sm:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.08)]`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-bold text-black line-clamp-2 uppercase tracking-tight leading-tight mb-0.5" style={{ fontFamily: "'Jost', sans-serif" }}>
            {productName}
          </h4>
          <p className="text-[12px] font-medium text-[var(--gold)]" style={{ fontFamily: "'Jost', sans-serif" }}>
            {priceText}
          </p>
        </div>
        <button
          onClick={onAddToCart}
          disabled={disabled || isAdding}
          className="bg-black text-white h-12 px-6 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 transition-all shadow-lg"
        >
          {isAdding ? (
            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <ShoppingCart size={14} />
          )}
          {isAdding ? 'Adding...' : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
};

export default StickyAddToCart;
