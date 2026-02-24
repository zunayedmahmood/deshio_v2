'use client';

import { Suspense } from 'react';
import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext';
import { CartProvider } from '@/app/e-commerce/CartContext';
import Footer from '@/components/ecommerce/Footer';
import ScrollToTopOnRouteChange from '@/components/ecommerce/ScrollToTopOnRouteChange';

export default function EcommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <CustomerAuthProvider>
      <CartProvider>
        <Suspense fallback={null}>
          <ScrollToTopOnRouteChange />
        </Suspense>

        <div className="ec-root ec-bg-texture min-h-screen relative">

          {/* ── Atmospheric glow layer — fixed, behind all content ── */}
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">

            {/* 1. Top-left — primary gold bloom (strongest, anchors warmth) */}
            <div style={{
              position: 'absolute',
              top: '-15vh', left: '-10vw',
              width: '65vw', height: '65vw',
              maxWidth: '800px', maxHeight: '800px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at center, rgba(176,124,58,0.18) 0%, rgba(176,124,58,0.06) 45%, transparent 70%)',
              filter: 'blur(40px)',
            }} />

            {/* 2. Top-right — cool blue-slate counter-bloom */}
            <div style={{
              position: 'absolute',
              top: '-5vh', right: '-8vw',
              width: '45vw', height: '45vw',
              maxWidth: '560px', maxHeight: '560px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at center, rgba(90,110,160,0.09) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }} />

            {/* 3. Mid-left — secondary warm amber stripe */}
            <div style={{
              position: 'absolute',
              top: '35vh', left: '-5vw',
              width: '40vw', height: '50vh',
              maxWidth: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(176,124,58,0.07) 0%, transparent 65%)',
              filter: 'blur(60px)',
            }} />

            {/* 4. Center — very faint gold haze, breaks up the flat middle */}
            <div style={{
              position: 'absolute',
              top: '40vh', left: '50%',
              transform: 'translateX(-50%)',
              width: '60vw', height: '40vh',
              maxWidth: '700px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(176,124,58,0.05) 0%, transparent 70%)',
              filter: 'blur(80px)',
            }} />

            {/* 5. Mid-right — warm accent, right third */}
            <div style={{
              position: 'absolute',
              top: '55vh', right: '-5vw',
              width: '35vw', height: '40vh',
              maxWidth: '450px',
              borderRadius: '50%',
              background: 'radial-gradient(ellipse at center, rgba(200,150,70,0.07) 0%, transparent 65%)',
              filter: 'blur(55px)',
            }} />

            {/* 6. Bottom-left — grounding warm anchor */}
            <div style={{
              position: 'absolute',
              bottom: '-10vh', left: '-5vw',
              width: '50vw', height: '50vh',
              maxWidth: '600px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at center, rgba(176,124,58,0.10) 0%, rgba(176,124,58,0.03) 50%, transparent 70%)',
              filter: 'blur(50px)',
            }} />

            {/* 7. Bottom-right — cool slate finish */}
            <div style={{
              position: 'absolute',
              bottom: '-5vh', right: '-8vw',
              width: '40vw', height: '40vh',
              maxWidth: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at center, rgba(80,100,150,0.07) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }} />

          </div>

          {/* Page content — above glow layer */}
          <div className="relative z-10">
            {children}
            <Footer />
          </div>
        </div>
      </CartProvider>
    </CustomerAuthProvider>
  );
}
