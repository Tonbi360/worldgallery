'use client';

import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Check,
  Lock,
  ExternalLink,
  Copy,
  Clock,
  UserCheck,
  Send,
  Flag,
  Sparkles,
  Phone,
  Mail,
  SendHorizontal,
  Instagram,
  Globe,
  MessageSquare,
  Edit3,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { GalleryMember, ContactBridge } from '../types/gallery';
import { getAllGalleryMembers, getCurrentUserProfile } from '../lib/userProfile';
import { Skeleton, ErrorCard } from './StatesSystem';
import ConnectSheet from './ConnectSheet';
import ReportSheet from './ReportSheet';
import BridgeActionRow from './BridgeActionRow';

// Lazy-load photo viewer modal for reduced initial bundle footprint
const PhotoViewerModal = lazy(() => import('./PhotoViewerModal'));

interface ProfileDetailProps {
  handle: string;
  onNavigate: (path: string) => void;
  onBack: () => void;
}

export default function ProfileDetail({
  handle,
  onNavigate,
  onBack,
}: ProfileDetailProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [copiedBridge, setCopiedBridge] = useState<string | null>(null);

  // Connection State: 'stranger' | 'pending' | 'connected' | 'self'
  const [connectionState, setConnectionState] = useState<
    'stranger' | 'pending' | 'connected' | 'self'
  >('stranger');

  // Find member from dynamic members data
  const member = useMemo(() => {
    const clean = handle.replace(/^@/, '').toLowerCase().trim();
    const allMembers = getAllGalleryMembers();
    return allMembers.find(
      (m) => m.handle.toLowerCase() === clean || m.id.toLowerCase() === clean
    );
  }, [handle]);

  // Simulate ~500ms skeleton load state on entry
  useEffect(() => {
    haptics.impact('light');
    setIsLoading(true);

    const timer = setTimeout(() => {
      setIsLoading(false);
      // Fade in privacy toast once per visit
      setShowToast(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [handle]);

  // Privacy toast auto-fade after 3.5s
  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => {
      setShowToast(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, [showToast]);

  // Check pending status from localStorage or if self
  useEffect(() => {
    if (!member) return;

    const currentUser = getCurrentUserProfile();
    // Self check (matches current user's handle or id)
    if (
      member.handle.toLowerCase() === currentUser.handle.toLowerCase() ||
      member.id === currentUser.id ||
      member.handle === 'tonbi360' ||
      member.handle === 'tonbara'
    ) {
      setConnectionState('self');
      return;
    }

    try {
      const stored = localStorage.getItem('wg_pending_connections') || '[]';
      const parsed: string[] = JSON.parse(stored);
      if (parsed.includes(member.handle)) {
        setConnectionState('pending');
      } else {
        setConnectionState('stranger');
      }
    } catch {
      setConnectionState('stranger');
    }
  }, [member]);

  const handleCopyValue = (value: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value);
      haptics.notification('success');
      setCopiedBridge(label);
      setTimeout(() => setCopiedBridge(null), 2000);
    }
  };

  if (!member && !isLoading) {
    return (
      <main className="flex flex-col w-full h-[100dvh] bg-ios-bg text-ios-text p-6">
        <header className="pt-3 pb-4">
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
        </header>
        <ErrorCard
          title="Member not found"
          message="This presence is not registered in the gallery archive."
          onRetry={onBack}
        />
      </main>
    );
  }

  const initials = member?.fullName
    ? member.fullName
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'W';

  const bridges: ContactBridge[] = member?.bridges || [
    { type: 'email', label: 'Email', maskedHint: 'm•••@w•••.org', unmaskedValue: 'member@worldgallery.org' },
  ];

  const photos = member?.photos || (member?.avatarUrl ? [member.avatarUrl] : []);

  const getBridgeIcon = (type: string) => {
    switch (type) {
      case 'phone':
      case 'whatsapp':
      case 'signal':
        return <Phone className="w-4 h-4" />;
      case 'email':
        return <Mail className="w-4 h-4" />;
      case 'telegram':
      case 'discord':
        return <SendHorizontal className="w-4 h-4" />;
      case 'instagram':
        return <Instagram className="w-4 h-4" />;
      case 'website':
        return <Globe className="w-4 h-4" />;
      default:
        return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <main
      id="profile-detail-screen"
      className="relative flex flex-col w-full h-[100dvh] bg-ios-bg text-ios-text select-none"
    >
      {/* 1. Header (‹ Gallery in blue, NO share button, right side empty) */}
      <header className="sticky top-0 z-30 flex items-center justify-between w-full px-5 pt-3 pb-2.5 bg-ios-bg/95 backdrop-blur-md border-b border-ios-separator/20 max-w-lg mx-auto flex-shrink-0">
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

      {/* 2. Privacy Toast Banner */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="w-full px-5 pb-1 max-w-lg mx-auto z-20"
          >
            <div className="bg-ios-card/95 backdrop-blur-md rounded-xl p-2.5 px-3.5 shadow-sm border border-ios-separator/40 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-ios-forest flex-shrink-0" />
              <p className="font-sans text-[12.5px] text-ios-secondary leading-tight">
                🔒 Privacy first — details stay masked until mutual consent.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Scrollable Content Body */}
      <div className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-5 pt-3 pb-36 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-w-lg mx-auto space-y-4 overscroll-contain touch-pan-y">
        {isLoading ? (
          /* Reusable Skeleton View */
          <div className="flex flex-col items-center space-y-4 pt-2">
            <Skeleton className="w-[84px] h-[84px]" rounded="full" />
            <div className="flex flex-col items-center space-y-2 w-full">
              <Skeleton className="w-48 h-6" rounded="lg" />
              <Skeleton className="w-28 h-4" rounded="md" />
              <Skeleton className="w-36 h-3.5" rounded="sm" />
            </div>
            <div className="w-full space-y-3 pt-2">
              <Skeleton className="w-full h-24" rounded="2xl" />
              <Skeleton className="w-full h-28" rounded="2xl" />
              <Skeleton className="w-full h-32" rounded="2xl" />
            </div>
          </div>
        ) : (
          member && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col w-full space-y-4"
            >
              {/* Hero Section */}
              <div className="flex flex-col items-center text-center pt-1 pb-1">
                {/* 84px Avatar (Tap -> Full-screen Photo Viewer) */}
                <button
                  type="button"
                  onClick={() => {
                    if (photos.length > 0) {
                      haptics.impact('light');
                      setIsPhotoViewerOpen(true);
                    }
                  }}
                  className="relative w-[84px] h-[84px] rounded-full shadow-sm active:scale-95 transition-transform overflow-hidden flex items-center justify-center text-white font-serif font-bold text-[28px] border-2 border-white cursor-pointer mb-3"
                  style={{ backgroundColor: member.avatarBg || '#2D6A4F' }}
                >
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </button>

                {/* Name in SERIF + Verified Check */}
                <div className="flex items-center gap-1.5 justify-center mb-0.5">
                  <h1 className="font-serif text-[24px] sm:text-[26px] font-bold tracking-tight text-ios-text leading-tight">
                    {member.fullName}
                  </h1>
                  <div className="w-4 h-4 rounded-full bg-ios-forest/15 text-ios-forest flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                  </div>
                </div>

                {/* @handle */}
                <p className="font-sans text-[14.5px] text-ios-secondary mb-1">
                  @{member.handle.replace(/^@/, '')}
                </p>

                {/* Member Provenance */}
                <p className="font-mono text-[11px] font-bold tracking-wider uppercase text-ios-secondary/80 mb-2.5">
                  {member.memberNumber || 'Member'} · {member.cohort || 'Cohort 2026'}
                </p>

                {/* Availability Dot + Label (Semantic Colors) */}
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12.5px] font-semibold border ${
                    member.availability === 'open'
                      ? 'bg-[#E8F5E9] text-ios-forest border-ios-forest/25'
                      : member.availability === 'quiet'
                      ? 'bg-[#FEF3C7] text-[#D97706] border-[#D97706]/25'
                      : 'bg-[#E5E5EA] text-[#6B7280] border-[#6B7280]/25'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      member.availability === 'open'
                        ? 'bg-ios-forest'
                        : member.availability === 'quiet'
                        ? 'bg-[#D97706]'
                        : 'bg-[#6B7280]'
                    }`}
                  />
                  <span className="capitalize">{member.availability}</span>
                </div>
              </div>

              {/* Card 1: About (Bio) */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-1.5">
                <span className="block font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                  About
                </span>
                <p className="font-sans text-[14.5px] text-ios-text/90 leading-relaxed">
                  {member.bio}
                </p>
              </div>

              {/* Card 2: Details (Home Base + Craft Focus Tags) */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3">
                <span className="block font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                  Details
                </span>

                <div className="space-y-2.5 text-[14px]">
                  <div className="flex items-center justify-between">
                    <span className="text-ios-secondary font-sans">Home Base</span>
                    <span className="font-sans font-medium text-ios-text">
                      {member.location || 'Undisclosed'}
                    </span>
                  </div>

                  <div className="flex items-start justify-between pt-2 border-t border-ios-separator/40">
                    <span className="text-ios-secondary font-sans pt-0.5">Craft Focus</span>
                    <div className="flex flex-wrap gap-1.5 justify-end max-w-[210px]">
                      {member.tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-[#F2F2F7] text-ios-secondary font-sans font-medium text-[11.5px] px-2.5 py-0.5 rounded-full border border-ios-separator/30 capitalize"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Contact Bridges */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="block font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Contact Bridges
                  </span>
                  {connectionState === 'self' ? (
                    <span className="font-sans text-[11px] font-bold text-ios-forest uppercase tracking-wider">
                      Your Coordinates
                    </span>
                  ) : connectionState === 'connected' ? (
                    <span className="font-sans text-[11px] font-bold text-ios-forest uppercase tracking-wider">
                      Bridge Active
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 text-ios-secondary text-[11px]">
                      <Lock className="w-3 h-3" />
                      <span>Masked</span>
                    </div>
                  )}
                </div>

                {/* Own Profile: Always show REAL unmasked values */}
                {connectionState === 'self' ? (
                  <>
                    <div className="divide-y divide-ios-separator/40">
                      {bridges.map((bridge, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-[#E8F5E9] text-ios-forest flex items-center justify-center flex-shrink-0">
                              {getBridgeIcon(bridge.type)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-sans text-[13.5px] font-medium text-ios-text">
                                {bridge.label}
                              </span>
                              <span className="font-mono text-[12.5px] text-ios-text select-text truncate">
                                {bridge.unmaskedValue || bridge.maskedHint}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="font-sans text-[12px] text-ios-secondary pt-1.5 border-t border-ios-separator/40 leading-normal">
                      Masked for others until you approve.
                    </p>
                  </>
                ) : connectionState === 'connected' ? (
                  /* Connected Member: Actionable bridge buttons */
                  <div className="space-y-2 pt-1">
                    {bridges.map((bridge, idx) => (
                      <BridgeActionRow
                        key={idx}
                        channelType={bridge.type}
                        channelLabel={bridge.label}
                        unmaskedValue={bridge.unmaskedValue || bridge.maskedHint}
                        identifierKey={`profile-${bridge.label}`}
                      />
                    ))}
                  </div>
                ) : (
                  /* Stranger / Pending: Masked rows */
                  <>
                    <div className="divide-y divide-ios-separator/40">
                      {bridges.map((bridge, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-[#F2F2F7] text-ios-secondary flex items-center justify-center flex-shrink-0">
                              {getBridgeIcon(bridge.type)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-sans text-[13.5px] font-medium text-ios-text">
                                {bridge.label}
                              </span>
                              <span className="font-mono text-[12.5px] text-ios-secondary truncate">
                                {bridge.maskedHint}
                              </span>
                            </div>
                          </div>

                          <Lock className="w-3.5 h-3.5 text-ios-secondary/40 mr-1" />
                        </div>
                      ))}
                    </div>
                    <p className="font-sans text-[12px] text-ios-secondary pt-1.5 border-t border-ios-separator/40 leading-normal">
                      Revealed when {member.fullName.split(' ')[0]} approves your request.
                    </p>
                  </>
                )}
              </div>

              {/* Quiet Report Link at Bottom (Hidden completely on member's OWN profile) */}
              {connectionState !== 'self' && (
                <div className="pt-2 pb-6 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('light');
                      setIsReportOpen(true);
                    }}
                    className="font-sans text-[12px] text-ios-secondary/60 hover:text-ios-secondary transition-colors cursor-pointer"
                  >
                    Report this profile
                  </button>
                </div>
              )}
            </motion.div>
          )
        )}
      </div>

      {/* 4. Fixed Bottom Action Bar */}
      {!isLoading && member && (
        <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] bg-gradient-to-t from-ios-bg via-ios-bg/95 to-transparent z-30 max-w-lg mx-auto pointer-events-auto">
          {connectionState === 'stranger' && (
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setIsConnectOpen(true);
              }}
              className="w-full bg-ios-forest text-white font-sans font-semibold text-[16px] py-4 px-6 rounded-ios-pill shadow-sm hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed transition-all cursor-pointer text-center flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Request Contact</span>
            </button>
          )}

          {connectionState === 'pending' && (
            <div className="flex flex-col items-center space-y-1.5 w-full">
              <button
                type="button"
                disabled
                className="w-full bg-[#E5E5EA] text-[#8E8E93] font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill transition-all cursor-default text-center flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                <span>Request Pending</span>
              </button>
              <p className="font-sans text-[12px] text-ios-secondary text-center">
                Your note is resting in their inbox.
              </p>
            </div>
          )}

          {connectionState === 'connected' && (
            <div className="w-full bg-[#E8F5E9] text-ios-forest font-sans font-semibold text-[15px] py-3.5 px-6 rounded-ios-pill border border-ios-forest/30 flex items-center justify-center gap-2 text-center">
              <UserCheck className="w-4.5 h-4.5" />
              <span>Connected · Coordinates Active</span>
            </div>
          )}

          {connectionState === 'self' && (
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                onNavigate('/portrait');
              }}
              className="w-full bg-white hover:bg-[#F2F2F7] text-ios-text border border-ios-separator/60 font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill active:scale-[0.98] transition-all cursor-pointer text-center flex items-center justify-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Portrait</span>
            </button>
          )}
        </div>
      )}

      {/* Sheets & Modals */}
      {member && (
        <>
          <ConnectSheet
            member={member}
            isOpen={isConnectOpen}
            onClose={() => setIsConnectOpen(false)}
            onSuccess={() => setConnectionState('pending')}
          />
          <ReportSheet
            handle={member.handle}
            isOpen={isReportOpen}
            onClose={() => setIsReportOpen(false)}
          />
          <Suspense fallback={null}>
            <PhotoViewerModal
              photos={photos}
              isOpen={isPhotoViewerOpen}
              onClose={() => setIsPhotoViewerOpen(false)}
            />
          </Suspense>
        </>
      )}
    </main>
  );
}
