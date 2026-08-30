'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share, PlusSquare, Smartphone, Check } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstallModal({ isOpen, onClose }: InstallModalProps) {
  const isIos = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl z-10 select-none pb-8 sm:pb-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-ios-separator/40">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-ios-forest text-white font-serif font-bold text-lg flex items-center justify-center shadow-sm">
                  W
                </div>
                <div>
                  <h3 className="font-sans font-bold text-[18px] text-ios-text leading-tight">
                    Install World Gallery
                  </h3>
                  <p className="font-sans text-[13px] text-ios-secondary mt-0.5">
                    Experience as a native iOS app
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-[#F2F2F7] text-ios-secondary hover:text-ios-text flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Instructions */}
            <div className="py-5 space-y-4">
              {isIos ? (
                <>
                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-ios-blue/10 text-ios-blue flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-sans text-[14.5px] text-ios-text font-medium leading-snug">
                        Tap the <span className="inline-flex items-center gap-1 font-semibold text-ios-blue"><Share className="w-3.5 h-3.5 inline" /> Share</span> button in Safari's bottom toolbar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-ios-forest/10 text-ios-forest flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-sans text-[14.5px] text-ios-text font-medium leading-snug">
                        Scroll down and select <span className="inline-flex items-center gap-1 font-semibold text-ios-text"><PlusSquare className="w-3.5 h-3.5 inline" /> Add to Home Screen</span>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-[#8E8E93]/15 text-ios-secondary flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="font-sans text-[14.5px] text-ios-text font-medium leading-snug">
                        Tap <span className="font-semibold text-ios-forest">Add</span> in the top right to install to your home screen.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-ios-blue/10 text-ios-blue flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="font-sans text-[14.5px] text-ios-text font-medium leading-snug">
                        Tap the browser menu <span className="font-semibold">(⋮ or Share)</span> in your navigation bar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-xl bg-ios-forest/10 text-ios-forest flex items-center justify-center flex-shrink-0 mt-0.5 font-bold text-sm">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="font-sans text-[14.5px] text-ios-text font-medium leading-snug">
                        Select <span className="inline-flex items-center gap-1 font-semibold text-ios-forest"><Smartphone className="w-3.5 h-3.5 inline" /> Install App</span> or <span className="font-semibold text-ios-forest">Add to Home Screen</span>.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Done Button */}
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                onClose();
              }}
              className="w-full py-3 rounded-xl bg-ios-forest hover:bg-ios-forest-pressed text-white font-sans font-semibold text-[15px] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Got it</span>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
