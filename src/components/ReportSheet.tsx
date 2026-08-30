'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Flag, Check, ShieldAlert } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface ReportSheetProps {
  handle: string;
  isOpen: boolean;
  onClose: () => void;
}

const REPORT_REASONS = [
  'Spam',
  'Impersonation',
  'Commercial solicitation',
  'Other',
];

export default function ReportSheet({
  handle,
  isOpen,
  onClose,
}: ReportSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string>('Spam');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = () => {
    haptics.notification('success');
    setIsSubmitted(true);
    setTimeout(() => {
      onClose();
      setIsSubmitted(false);
    }, 1200);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs cursor-pointer"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-lg bg-ios-card rounded-t-3xl shadow-2xl p-5 pb-8 z-10 border-t border-ios-separator/40 flex flex-col space-y-4"
          >
            <div className="w-10 h-1 bg-[#D1D1D6] rounded-full mx-auto -mt-1 mb-1" />

            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-sans text-[19px] font-bold text-ios-text leading-tight">
                  Report @{handle}
                </h3>
                <p className="font-sans text-[13px] text-ios-secondary mt-0.5">
                  Help maintain the quiet integrity of the gallery.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  onClose();
                }}
                className="w-8 h-8 rounded-full bg-[#E5E5EA]/80 flex items-center justify-center text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {isSubmitted ? (
              <div className="py-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-ios-forest/15 text-ios-forest flex items-center justify-center mx-auto">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
                <p className="font-sans font-semibold text-[15px] text-ios-text">
                  Thank you. The Curator will look into it.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {REPORT_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        selectedReason === reason
                          ? 'border-ios-forest bg-ios-forest/5'
                          : 'border-ios-separator/50 bg-[#F2F2F7] hover:bg-white'
                      }`}
                      onClick={() => {
                        haptics.selection();
                        setSelectedReason(reason);
                      }}
                    >
                      <span className="font-sans text-[14.5px] font-medium text-ios-text">
                        {reason}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          selectedReason === reason
                            ? 'border-ios-forest bg-ios-forest text-white'
                            : 'border-ios-secondary/40'
                        }`}
                      >
                        {selectedReason === reason && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full bg-[#E5E5EA] hover:bg-[#D1D1D6] text-ios-text font-sans font-semibold text-[15px] py-3.5 px-6 rounded-ios-pill transition-all cursor-pointer active:scale-[0.98]"
                  >
                    Submit Report
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
