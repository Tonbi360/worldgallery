'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Clock,
  UserCheck,
  Send,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { Skeleton } from './StatesSystem';
import BridgeActionRow from './BridgeActionRow';
import { SentRequest } from '../types/activity';

interface SentScreenProps {
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export default function SentScreen({ onBack, onNavigate }: SentScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [sentList, setSentList] = useState<SentRequest[]>([]);

  useEffect(() => {
    haptics.impact('light');
    setIsLoading(true);

    try {
      const stored = localStorage.getItem('wg_sent_requests');
      if (stored) {
        setSentList(JSON.parse(stored));
      } else {
        setSentList([]);
      }
    } catch {
      setSentList([]);
    }

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 450);

    return () => clearTimeout(timer);
  }, []);

  return (
    <main
      id="sent-bridges-screen"
      className="relative flex flex-col w-full h-[100dvh] overflow-hidden bg-ios-bg text-ios-text select-none"
    >
      {/* 1. Header with ‹ Gallery */}
      <header className="flex items-center justify-between w-full px-5 pt-3 pb-2 flex-shrink-0 z-20 bg-ios-bg max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            onBack();
          }}
          className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 -ml-2 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -mr-1" />
          <span>Gallery</span>
        </button>
        <div className="w-8" />
      </header>

      {/* 2. Scrollable Content */}
      <div className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-5 pt-1 pb-16 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-w-lg mx-auto space-y-4">
        {/* Title */}
        <div className="pt-1 pb-1">
          <h1 className="font-sans text-[28px] font-extrabold tracking-tight text-ios-text leading-tight">
            Sent Bridges
          </h1>
          <p className="font-sans text-[14.5px] text-ios-secondary mt-0.5">
            Connections you have initiated.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3.5 pt-2">
            <Skeleton className="w-full h-28" rounded="2xl" />
            <Skeleton className="w-full h-28" rounded="2xl" />
            <Skeleton className="w-full h-28" rounded="2xl" />
          </div>
        ) : sentList.length === 0 ? (
          /* Verbatim Empty State */
          <div className="py-16 text-center flex flex-col items-center justify-center space-y-3 max-w-xs mx-auto">
            <div className="w-14 h-14 rounded-full bg-[#E5E5EA]/70 text-ios-secondary flex items-center justify-center">
              <Send className="w-6 h-6" />
            </div>
            <p className="font-sans text-[15px] text-ios-secondary leading-relaxed px-4">
              No bridges yet. The gallery is full of humans.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sentList.map((sent) => (
              <motion.div
                key={sent.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-2.5"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => {
                      haptics.selection();
                      onNavigate(`/profile/${sent.recipientHandle}`);
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-serif font-bold text-sm flex-shrink-0 shadow-xs"
                      style={{ backgroundColor: sent.recipientAvatarBg }}
                    >
                      {sent.recipientAvatarUrl ? (
                        <img
                          src={sent.recipientAvatarUrl}
                          alt={sent.recipientName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>
                          {sent.recipientName
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-sans font-semibold text-[15px] text-ios-text leading-tight hover:underline">
                        {sent.recipientName}
                      </span>
                      <span className="font-sans text-[12px] text-ios-secondary">
                        @{sent.recipientHandle} · Sent {sent.sentDate || 'May 12'}
                        {sent.status === 'pending' && ` · rests for ${sent.expiresInDays || 5} more days`}
                      </span>
                    </div>
                  </div>

                  {/* Status Pill */}
                  {sent.status === 'pending' && (
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#D97706] text-[11.5px] font-semibold flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>Pending · {sent.expiresInDays || 5}d</span>
                    </div>
                  )}

                  {sent.status === 'approved' && (
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E8F5E9] text-ios-forest text-[11.5px] font-semibold flex-shrink-0">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Bridge Active</span>
                    </div>
                  )}

                  {(sent.status === 'declined' || sent.status === 'expired') && (
                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E5E5EA] text-[#6B7280] text-[11.5px] font-semibold capitalize flex-shrink-0">
                      <span>{sent.status}</span>
                    </div>
                  )}
                </div>

                {/* Note Preview */}
                <p className="font-sans text-[13.5px] text-ios-secondary truncate pt-0.5">
                  "{sent.note}"
                </p>

                {/* Approved Revealed Coordinates with Deep-Links & Secondary Copy */}
                {sent.status === 'approved' && (
                  <div className="pt-2 space-y-2 border-t border-ios-separator/30">
                    <p className="font-sans text-[12.5px] text-ios-secondary">
                      You shared your {sent.mySharedContact?.label || sent.channelType || 'contact'} in return.
                    </p>

                    {sent.unmaskedContact && (
                      <BridgeActionRow
                        channelType={sent.unmaskedContact.type}
                        channelLabel={sent.unmaskedContact.label}
                        unmaskedValue={sent.unmaskedContact.value}
                        identifierKey={`sent-${sent.id}`}
                      />
                    )}

                    {sent.mySharedContact && (
                      <BridgeActionRow
                        channelType={sent.mySharedContact.type}
                        channelLabel={sent.mySharedContact.label}
                        unmaskedValue={sent.mySharedContact.value}
                        identifierKey={`myshare-sent-${sent.id}`}
                        subtitle="You shared"
                      />
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
