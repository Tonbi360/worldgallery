import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
}

export function Skeleton({ className = '', rounded = 'xl' }: SkeletonProps) {
  const roundedClass = {
    sm: 'rounded-xs',
    md: 'rounded-sm',
    lg: 'rounded-md',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      className={`bg-[#E5E5EA]/80 animate-pulse ${roundedClass} ${className}`}
      aria-hidden="true"
    />
  );
}

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorCard({
  title = "The gallery couldn't be reached.",
  message = "A quiet interruption occurred. Check your network or try again.",
  onRetry,
}: ErrorCardProps) {
  return (
    <div className="bg-ios-card rounded-2xl p-6 shadow-ios-card border-0 text-center flex flex-col items-center justify-center max-w-sm mx-auto my-8 space-y-3">
      <div className="w-12 h-12 rounded-full bg-[#FEF3C7] text-[#D97706] flex items-center justify-center">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="font-serif font-bold text-[18px] text-ios-text">{title}</h3>
      <p className="font-sans text-[14px] text-ios-secondary leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={() => {
            haptics.impact('light');
            onRetry();
          }}
          className="mt-2 inline-flex items-center gap-1.5 font-sans font-semibold text-[14px] text-ios-forest bg-ios-forest/10 hover:bg-ios-forest/15 active:scale-95 py-2 px-4 rounded-full transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
}
