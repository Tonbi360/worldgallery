'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Check,
  Inbox,
  UserCheck,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { Skeleton } from './StatesSystem';
import BridgeActionRow from './BridgeActionRow';
import {
  IncomingRequest,
} from '../types/activity';

interface RequestsScreenProps {
  onBack: () => void;
  onNavigate: (path: string) => void;
  onRequestCountChange?: (count: number) => void;
}

export default function RequestsScreen({
  onBack,
  onNavigate,
  onRequestCountChange,
}: RequestsScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [requests, setRequests] = useState<IncomingRequest[]>([]);

  // Load from localStorage
  useEffect(() => {
    haptics.impact('light');
    setIsLoading(true);

    try {
      const stored = localStorage.getItem('wg_incoming_requests');
      if (stored) {
        setRequests(JSON.parse(stored));
      } else {
        setRequests([]);
      }
    } catch {
      setRequests([]);
    }

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 450);

    return () => clearTimeout(timer);
  }, []);

  // Update parent and localStorage on change
  const saveRequests = (updated: IncomingRequest[]) => {
    setRequests(updated);
    try {
      localStorage.setItem('wg_incoming_requests', JSON.stringify(updated));
    } catch {
      // ignore
    }
    const pendingCount = updated.filter((r) => r.status === 'pending').length;
    onRequestCountChange?.(pendingCount);
  };

  const handleApprove = (id: string) => {
    haptics.notification('success');
    const updated = requests.map((req) => {
      if (req.id === id) {
        return { ...req, status: 'approved' as const };
      }
      return req;
    });
    saveRequests(updated);
  };

  const handleDecline = (id: string) => {
    haptics.impact('light');
    const updated = requests.filter((req) => req.id !== id);
    saveRequests(updated);
  };

  const pendingList = requests.filter((r) => r.status === 'pending');
  const pastList = requests.filter((r) => r.status !== 'pending');

  return (
    <main
      id="requests-screen"
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

      {/* 2. Scrollable Body */}
      <div className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-5 pt-1 pb-16 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-w-lg mx-auto space-y-4">
        {/* Screen Title */}
        <div className="pt-1 pb-1">
          <h1 className="font-sans text-[28px] font-extrabold tracking-tight text-ios-text leading-tight">
            Requests
          </h1>
          <p className="font-sans text-[14.5px] text-ios-secondary mt-0.5">
            Notes resting in your care.
          </p>
        </div>

        {/* Content View */}
        {isLoading ? (
          <div className="space-y-4 pt-2">
            <Skeleton className="w-full h-44" rounded="2xl" />
            <Skeleton className="w-full h-44" rounded="2xl" />
          </div>
        ) : requests.length === 0 ? (
          /* Verbatim Empty State */
          <div className="py-16 text-center flex flex-col items-center justify-center space-y-3 max-w-xs mx-auto">
            <div className="w-14 h-14 rounded-full bg-[#E5E5EA]/70 text-ios-secondary flex items-center justify-center">
              <Inbox className="w-6 h-6" />
            </div>
            <p className="font-sans text-[15px] text-ios-secondary leading-relaxed px-4">
              No requests yet. When a human wants to meet you, their note will rest here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. RESTING SECTION (PENDING) */}
            {pendingList.length > 0 && (
              <section className="space-y-3">
                <div className="px-1 flex items-center justify-between">
                  <h2 className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Resting ({pendingList.length})
                  </h2>
                </div>

                <div className="space-y-3.5">
                  <AnimatePresence>
                    {pendingList.map((req) => (
                      <motion.div
                        key={req.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3.5"
                      >
                        {/* Sender Header */}
                        <div className="flex items-start justify-between">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => {
                              haptics.selection();
                              onNavigate(`/profile/${req.senderHandle}`);
                            }}
                          >
                            <div
                              className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center text-white font-serif font-bold text-sm flex-shrink-0 shadow-xs"
                              style={{ backgroundColor: req.senderAvatarBg }}
                            >
                              {req.senderAvatarUrl ? (
                                <img
                                  src={req.senderAvatarUrl}
                                  alt={req.senderName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>
                                  {req.senderName
                                    .split(' ')
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-sans font-semibold text-[15.5px] text-ios-text leading-tight hover:underline">
                                {req.senderName}
                              </span>
                              <span className="font-sans text-[12.5px] text-ios-secondary">
                                @{req.senderHandle} · {req.timeAgo} · rests for {req.expiresInDays} more days
                              </span>
                            </div>
                          </div>

                          {/* Channel chip */}
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F2F2F7] text-ios-secondary text-[11.5px] font-semibold border border-ios-separator/40">
                            <span>{req.channelLabel}</span>
                          </div>
                        </div>

                        {/* 140-char Note (SERIF ITALIC with forest-green left border) */}
                        <div className="bg-[#F2F2F7] p-3.5 rounded-r-xl rounded-l-xs border-l-2 border-ios-forest/70">
                          <p className="font-serif italic text-[14.5px] text-ios-text/90 leading-relaxed">
                            "{req.note}"
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleDecline(req.id)}
                            className="flex-1 py-2.5 px-4 rounded-ios-pill bg-[#F2F2F7] hover:bg-[#E5E5EA] text-ios-secondary font-sans font-semibold text-[14px] transition-colors cursor-pointer text-center"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprove(req.id)}
                            className="flex-2 py-2.5 px-4 rounded-ios-pill bg-ios-forest hover:bg-ios-forest-pressed text-white font-sans font-semibold text-[14px] transition-all cursor-pointer text-center shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Approve Contact</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* 2. PAST SECTION (APPROVED / PREVIOUS) */}
            {pastList.length > 0 && (
              <section className="space-y-3">
                <div className="px-1 flex items-center justify-between">
                  <h2 className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Past ({pastList.length})
                  </h2>
                </div>

                <div className="space-y-3.5">
                  <AnimatePresence>
                    {pastList.map((req) => (
                      <motion.div
                        key={req.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => {
                              haptics.selection();
                              onNavigate(`/profile/${req.senderHandle}`);
                            }}
                          >
                            <div
                              className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-white font-serif font-bold text-sm flex-shrink-0 shadow-xs"
                              style={{ backgroundColor: req.senderAvatarBg }}
                            >
                              {req.senderAvatarUrl ? (
                                <img
                                  src={req.senderAvatarUrl}
                                  alt={req.senderName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>
                                  {req.senderName
                                    .split(' ')
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-sans font-semibold text-[15px] text-ios-text hover:underline">
                                {req.senderName}
                              </span>
                              <span className="font-sans text-[12px] text-ios-secondary">
                                @{req.senderHandle}
                              </span>
                            </div>
                          </div>

                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E8F5E9] text-ios-forest text-[11.5px] font-semibold">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Bridge Active</span>
                          </div>
                        </div>

                        {/* Reciprocal Sharing Hint */}
                        <div className="px-1">
                          <p className="font-sans text-[12.5px] text-ios-secondary">
                            You shared your {req.mySharedContact?.label || req.channelLabel} in return.
                          </p>
                        </div>

                        {/* Revealed Contact Coordinates with Deep-Links & Secondary Copy */}
                        <div className="space-y-2">
                          {req.senderUnmaskedContact && (
                            <BridgeActionRow
                              channelType={req.senderUnmaskedContact.type}
                              channelLabel={req.senderUnmaskedContact.label}
                              unmaskedValue={req.senderUnmaskedContact.value}
                              identifierKey={`sender-${req.id}`}
                            />
                          )}

                          {req.mySharedContact && (
                            <BridgeActionRow
                              channelType={req.mySharedContact.type}
                              channelLabel={req.mySharedContact.label}
                              unmaskedValue={req.mySharedContact.value}
                              identifierKey={`myshare-${req.id}`}
                              subtitle="You shared"
                            />
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
