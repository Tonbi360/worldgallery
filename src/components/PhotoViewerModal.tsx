'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface PhotoViewerModalProps {
  photos: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function PhotoViewerModal({
  photos,
  initialIndex = 0,
  isOpen,
  onClose,
}: PhotoViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const handleNext = () => {
    if (currentIndex < photos.length - 1) {
      haptics.selection();
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      haptics.selection();
      setCurrentIndex((prev) => prev - 1);
    }
  };

  if (!isOpen || photos.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center select-none">
        {/* Dark blurred backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/90 backdrop-blur-md cursor-pointer"
        />

        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            onClose();
          }}
          className="absolute top-6 right-6 z-50 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center backdrop-blur-md active:scale-95 transition-all cursor-pointer"
          aria-label="Close photo"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Counter */}
        {photos.length > 1 && (
          <div className="absolute top-7 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-white/20 text-white font-mono text-xs backdrop-blur-md">
            {currentIndex + 1} / {photos.length}
          </div>
        )}

        {/* Active Image (with swipe down to dismiss) */}
        <motion.div
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.7}
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.y) > 120 || Math.abs(info.velocity.y) > 500) {
              haptics.impact('light');
              onClose();
            }
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative max-w-lg max-h-[85vh] w-full p-4 flex items-center justify-center z-40 touch-none"
        >
          <img
            src={photos[currentIndex]}
            alt="Portrait"
            className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl pointer-events-none"
          />
        </motion.div>

        {/* Arrow Navigation */}
        {photos.length > 1 && (
          <>
            {currentIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {currentIndex < photos.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-white/20 text-white flex items-center justify-center backdrop-blur-md active:scale-95 transition-all cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </>
        )}
      </div>
    </AnimatePresence>
  );
}
