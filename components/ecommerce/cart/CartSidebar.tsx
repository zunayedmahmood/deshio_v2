'use client';

import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { useCart } from '../../../app/e-commerce/CartContext';
import { useRouter } from 'next/navigation';
import CartItem from './CartItem';

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const { cart, getTotalPrice, isLoading } = useCart();
  const router = useRouter();
  
  const subtotal = getTotalPrice();
  const freeShippingThreshold = 5000;
  const remaining = Math.max(0, freeShippingThreshold - subtotal);
  const progress = Math.min(100, (subtotal / freeShippingThreshold) * 100);

  const handleCheckout = () => {
    router.push('/e-commerce/checkout');
    onClose();
  };

  const handleViewCart = () => {
    router.push('/e-commerce/cart');
    onClose();
  };

  return (
    <>
      {/* 🔥 NO BACKDROP - Products stay visible! */}
      
      {/* 🔥 RIGHT-SIDE SLIDE OVER SIDEBAR */}
      <div
        className={`
          fixed right-0 top-0 h-full w-full sm:w-96 z-50 
          flex flex-col transform transition-transform duration-300 ease-in-out
          ${isOpen 
            ? 'translate-x-0' 
            : 'translate-x-full sm:translate-x-full'
          }
        `}
        style={{
          background: '#0d0d0d',
          borderLeft: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.03), -20px 0 60px rgba(0,0,0,0.75)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.92)', fontFamily: "'Cormorant Garamond', serif" }}>Shopping cart</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full transition-colors"
            style={{ color: 'rgba(255,255,255,0.7)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.10)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={22} />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="animate-spin" style={{ color: 'var(--gold)' }} size={32} />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && cart.length === 0 && (
            <div className="text-center py-12">
              <p style={{ color: 'rgba(255,255,255,0.55)' }}>Your cart is empty</p>
              <button
                onClick={onClose}
                className="mt-4 font-medium"
                style={{ color: 'var(--gold)' }}
              >
                Continue Shopping
              </button>
            </div>
          )}

          {/* Cart Items */}
          {!isLoading && cart.length > 0 && (
            <div className="space-y-4">
              {cart.map((item) => (
                <CartItem 
                  key={item.id} 
                  item={item}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && cart.length > 0 && (
          <div className="border-t p-6 space-y-4" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
            {/* Free Shipping Progress */}
            {remaining > 0 ? (
              <div>
                <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  Add <span className="font-bold" style={{ color: 'rgba(255,255,255,0.92)' }}>৳{remaining.toFixed(2)}</span> to cart and get free shipping!
                </p>
                <div className="w-full rounded-full h-2" style={{ background: 'rgba(255,255,255,0.10)' }}>
                  <div 
                    className="bg-neutral-900 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.18)' }}>
                <p className="text-sm font-semibold" style={{ color: 'rgb(74 222 128)' }}>
                  🎉 You've qualified for free shipping!
                </p>
              </div>
            )}

            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>Subtotal:</span>
              <span className="text-2xl font-bold" style={{ color: 'rgba(255,255,255,0.92)' }}>
                ৳{subtotal.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleViewCart}
                className="w-full py-3 rounded font-semibold transition-colors"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.9)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                VIEW CART
              </button>
              <button
                onClick={handleCheckout}
                className="w-full py-3 rounded font-semibold transition-colors"
                style={{
                  background: 'linear-gradient(180deg, rgba(176,124,58,0.28) 0%, rgba(176,124,58,0.12) 100%)',
                  border: '1px solid rgba(176,124,58,0.35)',
                  color: 'rgba(255,255,255,0.95)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(180deg, rgba(176,124,58,0.35) 0%, rgba(176,124,58,0.16) 100%)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(180deg, rgba(176,124,58,0.28) 0%, rgba(176,124,58,0.12) 100%)')}
              >
                CHECKOUT
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 🔥 MOBILE: Slight page shift for better UX */}
      <style jsx>{`
        @media (max-width: 640px) {
          body {
            overflow: ${isOpen ? 'hidden' : 'auto'};
          }
        }
      `}</style>
    </>
  );
}