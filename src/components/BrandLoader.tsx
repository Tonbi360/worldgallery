import React from 'react';
import { motion } from 'motion/react';

export interface BrandLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}

export function BrandLoader({
  size = 'md',
  className = '',
  ariaLabel = 'Loading...',
}: BrandLoaderProps) {
  // Size variants mapped to precise dimensions:
  // sm: 24px, md: 48px, lg: 80px
  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
  };

  const dimensionClass = sizeMap[size] || sizeMap.md;

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center flex-shrink-0 select-none ${dimensionClass} ${className}`}
    >
      <motion.div
        className="w-full h-full flex items-center justify-center"
        animate={{
          opacity: [0.3, 1, 0.3],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <svg
          viewBox="0 0 192 192"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-xs"
        >
          {/* Signature Forest Green Seal Base */}
          <circle
            cx="96"
            cy="96"
            r="92"
            fill="#2D6A4F"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="5"
          />
          {/* Serif "W" Seal Glyph */}
          <text
            x="96"
            y="106"
            fontSize="106"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#FFFFFF"
            fontFamily="ui-serif, 'New York', Georgia, Cambria, 'Times New Roman', serif"
            fontWeight="700"
            letterSpacing="-0.03em"
          >
            W
          </text>
        </svg>
      </motion.div>
    </div>
  );
}

export default BrandLoader;
