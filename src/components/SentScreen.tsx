'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  Clock,
  UserCheck,
  Send,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { ChannelIcon } from './ChannelIcon';
import { buildDeepLink } from '../lib/deeplinks';
import { haptics } from '../lib/haptics';
import { Skeleton } from './StatesSystem';
import { SentRequest } from '../types/activity';
import { dbGetSentRequestsForRequester } from '../lib/dataService';
import { getCurrentUserProfile } from '../lib/userProfile';

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

    const loadData = async () => {
      try {
        const current = getCurrentUserProfile();
        const requesterId = current.handle || current.id || 'current_user';
        const dbSent = await dbGetSentRequestsForRequester(requesterId);

        if (dbSent && dbSent.length > 0) {
          setSentList(dbSent);
          setIsLoading(false);
          return;
        }

        const stored = localStorage.getItem('wg_sent_requests');
        if (stored) {
          setSentList(JSON.parse(stored));
        } else {
          setSentList([]);
        }
      } catch {
        setSentList([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
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
          <div className="space-y-4">
            {sentList.map((sent) => {
              const targetVal = sent.unmaskedContact?.value || sent.mySharedContact?.value || '';
              const deepLink = buildDeepLink(sent.channelType || 'email', targetVal);

              return (
                <motion.div
                  key={sent.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3"
                >
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="flex items-center gap-3 cursor-pointer min-w-0"
                      onClick={() => {
                        haptics.selection();
                        onNavigate(`/profile/${sent.recipientHandle}`);
                      }}
                    >
                      <div
                        className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-serif font-bold text-sm flex-shrink-0 shadow-xs"
                        style={{ backgroundColor: sent.recipientAvatarBg || '#2D6A4F' }}
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
                        <span className="font-sans font-semibold text-[15.5px] text-ios-text leading-tight hover:underline truncate">
                          {sent.recipientName}
                        </span>
                        <span className="font-sans text-[12.5px] text-ios-secondary truncate">
                          @{sent.recipientHandle}
                        </span>
                      </div>
                    </div>

                    {/* Status Pill */}
                    {sent.status === 'approved' ? (
                      <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-[#E8F5E9] text-ios-forest border border-ios-forest/30 flex-shrink-0">
                        Approved
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/30 flex-shrink-0">
                        Pending
                      </span>
                    )}
                  </div>

                  {/* Channel Badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F2F7] border border-ios-separator/40 text-ios-text text-[12.5px] font-medium w-fit">
                    <ChannelIcon type={sent.channelType || 'email'} className="w-3.5 h-3.5 text-ios-forest" />
                    <span>{sent.channelLabel || sent.channelType || 'Contact'}</span>
                  </div>

                  {/* Quoted Note */}
                  {sent.note && (
                    <div className="bg-[#F2F2F7] p-3 rounded-xl border border-ios-separator/30">
                      <p className="font-serif italic text-[14px] text-ios-text/90 leading-relaxed">
                        "{sent.note}"
                      </p>
                    </div>
                  )}

                  {/* If Approved: Full-width Action Button (Open Email → / Open Whatsapp →) */}
                  {sent.status === 'approved' && (
                    <div className="pt-1">
                      {deepLink.url ? (
                        <a
                          href={deepLink.url}
                          target={deepLink.url.startsWith('mailto:') || deepLink.url.startsWith('tel:') ? '_self' : '_blank'}
                          rel="noopener noreferrer"
                          onClick={() => haptics.impact('light')}
                          className="w-full py-3.5 px-4 rounded-xl bg-ios-forest hover:bg-ios-forest-pressed active:scale-[0.98] text-white font-sans font-semibold text-[14.5px] flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                        >
                          <span>Open {sent.channelLabel || sent.channelType || 'Contact'} →</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (targetVal && navigator.clipboard) {
                              navigator.clipboard.writeText(targetVal);
                              haptics.notification('success');
                            }
                          }}
                          className="w-full py-3 px-4 rounded-xl bg-ios-forest hover:bg-ios-forest-pressed active:scale-[0.98] text-white font-sans font-semibold text-[14px] flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                        >
                          <span>Copy {sent.channelLabel || 'Contact'} Coordinate</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Footer Timestamp */}
                  <div className="text-[12px] text-ios-secondary/80 pt-0.5">
                    <span>Sent {sent.sentDate || new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
