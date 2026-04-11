'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import Navigation from '@/components/ecommerce/Navigation';
import cartService, { CartItem, Cart } from '@/services/cartService';
import checkoutService from '@/services/checkoutService';
import { getBaseProductName } from '@/lib/productNameUtils';

export default function CartPage() {
  const router = useRouter();

  // State
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<Set<number>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [couponCode, setCouponCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = () => {
    const token = localStorage.getItem('auth_token');
    return !!token;
  };

  // Fetch cart on mount (supports guest cart)
  useEffect(() => {
    fetchCart();
  }, []);

  // Select all items by default when cart items change
  useEffect(() => {
    if (cart?.cart_items && cart.cart_items.length > 0) {
      setSelectedItems(new Set(cart.cart_items.map(item => item.id)));
    }
  }, [cart?.cart_items?.length]);

  const fetchCart = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const cartData = await cartService.getCart();
      setCart(cartData);
    } catch (err: any) {
      console.error('❌ Error fetching cart:', err);
      setError(err.message || 'Failed to load cart');

      if (err.message?.includes('401') || err.message?.includes('Unauthenticated')) {
        // If token expired, fall back to guest cart (localStorage)
        localStorage.removeItem('auth_token');
        try {
          const cartData = await cartService.getCart();
          setCart(cartData);
          setError(null);
        } catch {
          // ignore
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (!cart?.cart_items) return;

    if (selectedItems.size === cart.cart_items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(cart.cart_items.map(item => item.id)));
    }
  };

  const toggleSelectItem = (id: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleUpdateQuantity = async (cartItemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;

    setIsUpdating(prev => new Set(prev).add(cartItemId));

    try {
      await cartService.updateQuantity(cartItemId, { quantity: newQuantity });
      await fetchCart();
    } catch (err: any) {
      console.error('❌ Error updating quantity:', err);
      alert(err.message || 'Failed to update quantity');
    } finally {
      setIsUpdating(prev => {
        const next = new Set(prev);
        next.delete(cartItemId);
        return next;
      });
    }
  };

  const handleRemoveItem = async (cartItemId: number) => {
    if (!confirm('Are you sure you want to remove this item?')) return;

    setIsUpdating(prev => new Set(prev).add(cartItemId));

    try {
      await cartService.removeFromCart(cartItemId);

      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(cartItemId);
        return next;
      });

      await fetchCart();
    } catch (err: any) {
      console.error('❌ Error removing item:', err);
      alert(err.message || 'Failed to remove item');
    } finally {
      setIsUpdating(prev => {
        const next = new Set(prev);
        next.delete(cartItemId);
        return next;
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;

    if (!confirm(`Are you sure you want to remove ${selectedItems.size} item(s)?`)) return;

    const itemsToDelete = Array.from(selectedItems);
    setIsUpdating(new Set(itemsToDelete));

    try {
      await Promise.all(itemsToDelete.map(id => cartService.removeFromCart(id)));
      setSelectedItems(new Set());
      await fetchCart();
    } catch (err: any) {
      console.error('❌ Error deleting items:', err);
      alert(err.message || 'Failed to delete items');
    } finally {
      setIsUpdating(new Set());
    }
  };

  const handleClearCart = async () => {
    if (!confirm('Are you sure you want to clear your entire cart?')) return;

    setIsLoading(true);
    try {
      await cartService.clearCart();
      setSelectedItems(new Set());
      await fetchCart();
    } catch (err: any) {
      console.error('❌ Error clearing cart:', err);
      alert(err.message || 'Failed to clear cart');
    } finally {
      setIsLoading(false);
    }
  };

  const getSelectedTotal = (): number => {
    if (!cart?.cart_items) return 0;

    return cart.cart_items
      .filter(item => selectedItems.has(item.id))
      .reduce((total, item) => {
        const itemTotal = typeof item.total_price === 'string'
          ? parseFloat(item.total_price)
          : item.total_price;
        return total + itemTotal;
      }, 0);
  };

  // Calculate totals
  const subtotal = getSelectedTotal();
  const shippingFee = checkoutService.calculateDeliveryCharge('Dhaka');
  const total = subtotal + shippingFee;

  const isAnyItemSelectedOverStock = cart?.cart_items
    ?.filter(item => selectedItems.has(item.id))
    .some(item => (item.product.available_inventory ?? 0) < item.quantity);

  // ✅ CRITICAL FIX: Synchronous localStorage save before navigation
  const handleProceedToCheckout = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one item to checkout');
      return;
    }

    try {
      // Validate cart before checkout
      const validation = await cartService.validateCart();

      if (!validation.is_valid) {
        const issues = validation.issues.map(issue => issue.issue).join('\n');
        alert(`Cart validation failed:\n${issues}`);
        await fetchCart();
        return;
      }

      // ✅ CRITICAL: Save to localStorage SYNCHRONOUSLY before ANY navigation
      const selectedItemsArray = Array.from(selectedItems);
      localStorage.setItem('checkout-selected-items', JSON.stringify(selectedItemsArray));

      // ✅ Force a small delay to ensure localStorage write completes
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify save succeeded
      const saved = localStorage.getItem('checkout-selected-items');
      if (!saved) {
        throw new Error('Failed to save checkout data');
      }

      // Now navigate
      router.push('/e-commerce/checkout');

    } catch (err: any) {
      console.error('❌ Error during checkout:', err);
      alert(err.message || 'Failed to proceed to checkout. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="ec-root min-h-screen bg-[var(--bg-root)]">
        <Navigation />
        <div className="ec-container py-32 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin h-10 w-10 text-[var(--cyan)] mb-4" />
          <p className="text-[var(--text-secondary)] font-medium">Loading your selection...</p>
        </div>
      </div>
    );
  }

  if (error && !cart) {
    return (
      <div className="ec-root min-h-screen bg-[var(--bg-root)]">
        <Navigation />
        <div className="ec-container py-32 text-center">
          <AlertCircle className="h-16 w-16 text-[var(--status-danger)] mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Error Loading Cart</h1>
          <p className="text-[var(--text-secondary)] mb-10 max-w-md mx-auto">{error}</p>
          <button
            onClick={fetchCart}
            className="ec-btn-primary px-10"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!cart?.cart_items || cart.cart_items.length === 0) {
    return (
      <div className="ec-root min-h-screen bg-[var(--bg-root)]">
        <Navigation />
        <div className="ec-container py-32 text-center">
          <div className="relative inline-block mb-10">
            <div className="absolute inset-0 bg-[var(--cyan-pale)] rounded-full blur-2xl opacity-20" />
            <ShoppingCart className="h-20 w-20 text-[var(--text-muted)] relative z-10" />
          </div>
          <h1 className="text-4xl font-medium text-[var(--text-primary)] mb-4" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Your cart is empty</h1>
          <p className="text-[var(--text-secondary)] mb-10 max-w-sm mx-auto">Discover our latest collection and find items that inspire confidence.</p>
          <button
            onClick={() => router.push('/e-commerce/products')}
            className="ec-btn-primary px-12"
          >
            Explore Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-root min-h-screen bg-[var(--bg-root)]">
      <Navigation />
      
      <main className="ec-container py-16">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Cart Items Area */}
          <div className="flex-1">
            {/* Header Control */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--border-default)]">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selectedItems.size === cart.cart_items.length && cart.cart_items.length > 0}
                  onChange={toggleSelectAll}
                  className="w-5 h-5 cursor-pointer accent-[var(--cyan)]"
                />
                <span className="text-[11px] font-bold tracking-[0.2em] text-[var(--text-primary)] uppercase" style={{ fontFamily: "'DM Mono', monospace" }}>
                  SELECT ALL ({cart.cart_items.length} ITEM{cart.cart_items.length !== 1 ? 'S' : ''})
                </span>
              </label>
              
              <div className="flex items-center gap-8">
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedItems.size === 0 || isUpdating.size > 0}
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
                >
                  <X size={16} className="group-hover:rotate-90 transition-transform" />
                  <span className="text-[11px] font-bold tracking-[0.2em]" style={{ fontFamily: "'DM Mono', monospace" }}>DELETE SELECTED</span>
                </button>
                <button
                  onClick={handleClearCart}
                  disabled={isUpdating.size > 0}
                  className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X size={16} />
                  <span className="text-[11px] font-bold tracking-[0.2em]" style={{ fontFamily: "'DM Mono', monospace" }}>CLEAR CART</span>
                </button>
              </div>
            </div>

            {/* Cart Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-6 pb-4 border-b border-[var(--border-default)] font-bold text-[var(--text-muted)] text-[10px] tracking-[0.2em]" style={{ fontFamily: "'DM Mono', monospace" }}>
              <div className="col-span-1"></div>
              <div className="col-span-5">PRODUCT</div>
              <div className="col-span-2 text-center">PRICE</div>
              <div className="col-span-2 text-center">QUANTITY</div>
              <div className="col-span-2 text-right">SUBTOTAL</div>
            </div>

            {/* Cart Items List */}
            <div className="space-y-6 mt-8">
              {cart.cart_items.map((item: CartItem) => {
                const price = typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price;
                const itemTotal = typeof item.total_price === 'string' ? parseFloat(item.total_price) : item.total_price;
                const isItemUpdating = isUpdating.has(item.id);
                
                const productImage = 
                  item.product.images?.find((i: any) => i?.is_primary)?.url ||
                  item.product.images?.[0]?.url ||
                  '/images/placeholder-product.jpg';

                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-1 md:grid-cols-12 gap-6 py-8 border-b border-[var(--border-default)] items-center transition-all ${isItemUpdating ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}
                  >
                    {/* Checkbox */}
                    <div className="md:col-span-1">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleSelectItem(item.id)}
                        className="w-5 h-5 cursor-pointer accent-[var(--cyan)]"
                      />
                    </div>

                    {/* Product Brand/Title Info */}
                    <div className="md:col-span-5 flex items-center gap-6">
                      <div className="relative flex-shrink-0 group">
                        <div className="h-24 w-20 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)]">
                          <img
                            src={
                              item.product.images?.find((i: any) => i?.is_primary)?.image_url ||
                              item.product.images?.[0]?.image_url ||
                              '/images/placeholder-product.jpg'
                            }
                            alt={item.product.name}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="absolute -top-3 -right-3 h-7 w-7 flex items-center justify-center rounded-full bg-[var(--bg-depth)] border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:border-[var(--status-danger)] transition-all shadow-sm"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-[var(--text-primary)] text-base mb-1 leading-snug">
                          {getBaseProductName(item.product.name)}
                        </h3>

                        <div className="flex flex-wrap gap-2 mb-2">
                          {item.variant_options?.color && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--bg-depth)] border border-[var(--border-default)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]" style={{ fontFamily: "'DM Mono', monospace" }}>
                              {item.variant_options.color}
                            </span>
                          )}
                          {item.variant_options?.size && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--bg-depth)] border border-[var(--border-default)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]" style={{ fontFamily: "'DM Mono', monospace" }}>
                              {item.variant_options.size}
                            </span>
                          )}
                        </div>

                        {!item.product.in_stock && (
                          <span className="text-[10px] font-bold text-[var(--status-danger)] px-2 py-1 rounded-md bg-[var(--status-danger-pale)] uppercase tracking-wider">Out of Stock</span>
                        )}
                        {item.product.in_stock && (item.product.available_inventory ?? 0) < 5 && (
                          <span className="text-[10px] font-bold text-[var(--gold)] px-2 py-1 rounded-md bg-[var(--gold-pale)] uppercase tracking-wider">Only {item.product.available_inventory} left</span>
                        )}
                        {item.product.in_stock && item.quantity > (item.product.available_inventory ?? 0) && (
                          <p className="text-[11px] text-[var(--status-danger)] mt-2 font-medium">Insufficient stock for this amount</p>
                        )}
                      </div>
                    </div>

                    {/* Price Display */}
                    <div className="md:col-span-2 text-left md:text-center">
                      <p className="md:hidden text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>Price</p>
                      <p className="text-[var(--text-secondary)] font-medium">
                        ৳{price.toLocaleString()}
                      </p>
                    </div>

                    {/* Quantity Control */}
                    <div className="md:col-span-2 flex justify-start md:justify-center">
                      <div className="inline-flex items-center rounded-xl bg-[var(--bg-depth)] border border-[var(--border-default)]">
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                        >
                          -
                        </button>
                        <span className="w-10 text-center text-sm font-bold text-[var(--text-primary)]" style={{ fontFamily: "'DM Mono', monospace" }}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= (item.product.available_inventory ?? 999)}
                          className="w-10 h-10 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20 transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Subtotal Display */}
                    <div className="md:col-span-2 text-left md:text-right">
                      <p className="md:hidden text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>Subtotal</p>
                      <p className="text-[16px] font-bold text-[var(--cyan)]">
                        ৳{itemTotal.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Coupon Application Block */}
            <div className="mt-12 flex flex-col md:flex-row gap-4">
              <input
                type="text"
                placeholder="PROMO CODE"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="w-full md:w-80 px-5 py-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--cyan)] transition-all font-bold tracking-[0.2em] text-[12px]"
                style={{ fontFamily: "'DM Mono', monospace" }}
              />
              <button
                disabled={!couponCode}
                className="ec-btn-secondary px-10 whitespace-nowrap"
              >
                Apply Coupon
              </button>
            </div>
          </div>

          {/* Cart Sidebar: Totals & Checkout */}
          <aside className="lg:w-[400px]">
            <div className="ec-surface p-8 sticky top-24">
              <h2 className="text-[20px] font-bold text-[var(--text-primary)] uppercase tracking-[0.2em] mb-8" style={{ fontFamily: "'DM Mono', monospace" }}>
                Summary
              </h2>

              <div className="space-y-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--text-secondary)]">Subtotal ({selectedItems.size} items)</span>
                  <span className="font-semibold text-[var(--text-primary)]">৳{subtotal.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--text-secondary)]">Standard Delivery</span>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Inside Dhaka</span>
                  </div>
                  <span className="font-semibold text-[var(--text-primary)]">৳{shippingFee.toFixed(2)}</span>
                </div>

                <div className="h-px bg-[var(--border-default)] my-4" />

                <div className="flex justify-between items-end">
                  <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-1.5" style={{ fontFamily: "'DM Mono', monospace" }}>Total Estimated</span>
                  <span className="text-3xl font-bold text-[var(--gold)]">৳{total.toLocaleString()}</span>
                </div>

                <div className="pt-6 space-y-4">
                  <button
                    onClick={handleProceedToCheckout}
                    disabled={selectedItems.size === 0 || isUpdating.size > 0 || isAnyItemSelectedOverStock}
                    className="w-full ec-btn-primary py-5 text-base font-bold tracking-[0.2em]"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {isUpdating.size > 0 ? 'SYNCHRONIZING...' : 'CHECKOUT NOW'}
                  </button>
                  
                  <button
                    onClick={() => router.push('/e-commerce/products')}
                    className="w-full py-4 text-[12px] font-bold text-[var(--text-muted)] hover:text-[var(--cyan)] transition-all uppercase tracking-widest"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>

              {/* Secure Info */}
              <div className="mt-10 flex items-center justify-center gap-4 py-4 border-t border-[var(--border-default)]">
                 <div className="flex flex-col items-center gap-1 opacity-50">
                    <span className="text-[9px] font-bold tracking-[0.1em] text-[var(--text-muted)] uppercase">Secure Payments</span>
                    <div className="flex items-center gap-2">
                       {['Visa', 'bKash', 'Amex'].map(tag => (
                         <span key={tag} className="text-[10px] border border-[var(--border-default)] px-2 rounded-md">{tag}</span>
                       ))}
                    </div>
                 </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}