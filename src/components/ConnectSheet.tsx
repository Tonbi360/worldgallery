'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Send,
  Check,
  Phone,
  Mail,
  SendHorizontal,
  Instagram,
  Globe,
  MessageSquare,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { GalleryMember, ContactBridge } from '../types/gallery';
import { SentRequest } from '../types/activity';

interface ConnectSheetProps {
  member: GalleryMember;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConnectSheet({
  member,
  isOpen,
  onClose,
  onSuccess,
}: ConnectSheetProps) {
  const bridges: ContactBridge[] = member.bridges && member.bridges.length > 0
    ? member.bridges
    : [{ type: 'email', label: 'Email', maskedHint: 'm•••@w•••.org' }];

  const [selectedBridge, setSelectedBridge] = useState<string>(bridges[0].type);
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccessMorphed, setIsSuccessMorphed] = useState(false);

  const charCount = note.length;
  const maxChars = 140;

  const handleSend = () => {
    if (!note.trim() || isSending || isSuccessMorphed) return;
    haptics.impact('light');
    setIsSending(true);

    setTimeout(() => {
      setIsSending(false);
      setIsSuccessMorphed(true);
      haptics.notification('success');

      // 1. Persist pending connection handle in localStorage
      try {
        const stored = localStorage.getItem('wg_pending_connections') || '[]';
        const parsed = JSON.parse(stored);
        if (!parsed.includes(member.handle)) {
          parsed.push(member.handle);
          localStorage.setItem('wg_pending_connections', JSON.stringify(parsed));
        }
      } catch {
        // ignore
      }

      // 2. Persist new sent request object in localStorage for /sent
      try {
        const storedSent = localStorage.getItem('wg_sent_requests');
        const sentList: SentRequest[] = storedSent ? JSON.parse(storedSent) : [];
        const bridgeObj = bridges.find((b) => b.type === selectedBridge);
        const newSent: SentRequest = {
          id: `sent-${Date.now()}`,
          recipientHandle: member.handle,
          recipientName: member.fullName,
          recipientAvatarBg: member.avatarBg,
          recipientAvatarUrl: member.avatarUrl,
          note: note.trim(),
          channelLabel: bridgeObj?.label || 'Direct Bridge',
          channelType: bridgeObj?.type || 'email',
          sentDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          mySharedContact: {
            type: 'email',
            label: 'Email',
            value: 'tonbara@walden.org',
          },
          status: 'pending',
          expiresInDays: 7,
        };
        // Add or replace
        const filtered = sentList.filter((s) => s.recipientHandle !== member.handle);
        filtered.unshift(newSent);
        localStorage.setItem('wg_sent_requests', JSON.stringify(filtered));
      } catch {
        // ignore
      }

      onSuccess();
    }, 750);
  };

  const handleDoneDismiss = () => {
    haptics.selection();
    onClose();
    setTimeout(() => {
      setIsSuccessMorphed(false);
      setNote('');
    }, 300);
  };

  const getBridgeIcon = (type: string) => {
    switch (type) {
      case 'phone':
      case 'whatsapp':
      case 'signal':
        return <Phone className="w-3.5 h-3.5" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5" />;
      case 'telegram':
      case 'discord':
        return <SendHorizontal className="w-3.5 h-3.5" />;
      case 'instagram':
        return <Instagram className="w-3.5 h-3.5" />;
      case 'website':
        return <Globe className="w-3.5 h-3.5" />;
      default:
        return <MessageSquare className="w-3.5 h-3.5" />;
    }
  };

  const firstName = member.fullName.split(' ')[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isSuccessMorphed ? handleDoneDismiss : onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs cursor-pointer"
          />

          {/* Bottom Sheet Container */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-lg bg-ios-card rounded-t-3xl shadow-2xl p-5 pb-8 z-10 border-t border-ios-separator/40 flex flex-col space-y-4 max-h-[90dvh] overflow-y-auto"
          >
            {/* Grabber Handle */}
            <div className="w-10 h-1 bg-[#D1D1D6] rounded-full mx-auto -mt-1 mb-1" />

            {isSuccessMorphed ? (
              /* Morphed Success State */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-4 text-center flex flex-col items-center space-y-3.5"
              >
                {/* Green Check Seal */}
                <div className="w-14 h-14 rounded-full bg-ios-forest/15 text-ios-forest flex items-center justify-center shadow-xs">
                  <Check className="w-7 h-7 stroke-[3]" />
                </div>

                <div className="space-y-1 max-w-sm px-2">
                  <h3 className="font-serif text-[20px] font-bold text-ios-text">
                    Request Delivered
                  </h3>
                  <p className="font-sans text-[14.5px] text-ios-secondary leading-relaxed">
                    {firstName} will see your request and decide whether to share their contact.
                  </p>
                </div>

                <div className="w-full pt-3">
                  <button
                    type="button"
                    onClick={handleDoneDismiss}
                    className="w-full bg-ios-forest hover:bg-ios-forest-pressed text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill transition-all active:scale-[0.98] cursor-pointer shadow-xs"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            ) : (
              /* Request Form State */
              <>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-sans text-[20px] font-bold text-ios-text leading-tight">
                      Request Contact
                    </h3>
                    <p className="font-sans text-[13.5px] text-ios-secondary mt-0.5">
                      140 characters of intentional thought.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      onClose();
                    }}
                    className="w-8 h-8 rounded-full bg-[#E5E5EA]/80 flex items-center justify-center text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer -mr-1 -mt-1"
                    aria-label="Close"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* Bridge Selection Chips */}
                <div>
                  <label className="block font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary mb-2">
                    Bridge Channel Requested
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {bridges.map((bridge) => {
                      const isSelected = selectedBridge === bridge.type;
                      return (
                        <button
                          key={bridge.type}
                          type="button"
                          onClick={() => {
                            haptics.selection();
                            setSelectedBridge(bridge.type);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-sans text-[13px] font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-ios-forest text-white shadow-xs'
                              : 'bg-[#F2F2F7] text-ios-secondary hover:text-ios-text border border-ios-separator/40'
                          }`}
                        >
                          {getBridgeIcon(bridge.type)}
                          <span>{bridge.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Note Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                      Your Note
                    </label>
                    <span
                      className={`font-mono text-[12px] font-semibold ${
                        charCount >= 140
                          ? 'text-[#DC2626]'
                          : charCount >= 120
                          ? 'text-[#D97706]'
                          : 'text-ios-secondary/70'
                      }`}
                    >
                      {charCount}/140
                    </span>
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => {
                      if (e.target.value.length <= maxChars) {
                        setNote(e.target.value);
                      }
                    }}
                    rows={3}
                    placeholder="Hi! I came across your profile and would love to connect because…"
                    className="w-full bg-[#F2F2F7] border border-ios-separator/50 rounded-2xl p-3.5 font-sans text-[15px] text-ios-text placeholder:text-ios-secondary/60 outline-none focus:border-ios-forest/50 focus:bg-white transition-all resize-none"
                  />
                </div>

                {/* Send CTA Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!note.trim() || isSending}
                    className={`w-full py-3.5 px-6 rounded-ios-pill font-sans font-semibold text-[15.5px] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                      !note.trim()
                        ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-not-allowed'
                        : 'bg-ios-forest text-white hover:brightness-105 active:scale-[0.98]'
                    }`}
                  >
                    {isSending ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Request</span>
                      </>
                    )}
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
