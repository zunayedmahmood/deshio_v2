'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

interface ReportCardProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
}

export default function ReportCard({
  title,
  subtitle,
  onRefresh,
  isLoading,
  children,
  headerAction,
  className = '',
}: ReportCardProps) {
  return (
    <div className={`group relative overflow-hidden rounded-[28px] border border-white/60 bg-white/80 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.30)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-[0_28px_70px_-30px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-white/5 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
      <div className="border-b border-slate-200/70 px-6 py-5 dark:border-slate-800/80">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-slate-950 dark:text-white">
              {title}
              {isLoading && <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />}
            </h3>
            {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            {headerAction}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="rounded-xl border border-slate-200/80 bg-white/80 p-2.5 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                title="Refresh Component Data"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
