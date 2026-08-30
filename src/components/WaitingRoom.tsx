'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Bell,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  FileEdit,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import {
  ApplyDraft,
  INITIAL_APPLY_DRAFT,
  CURATED_PALETTE,
} from '../types/apply';
import { getPendingApplicants } from '../lib/curatorStore';
import { getAllGalleryMembers } from '../lib/userProfile';

const DRAFT_STORAGE_KEY = 'wg_apply_draft_v1';
const SUBMITTED_STORAGE_KEY = 'wg_submitted_applicant_v1';
const NOTIFICATION_STORAGE_KEY = 'wg_notifications_enabled';

type WaitingState = 'pending' | 'approved' | 'rejected';

const QUIET_LINES = [
  'Preserving human craft in an age of automated noise.',
  'A registry of genuine people, unmediated by algorithms.',
  'Slow curation ensures every voice is heard deliberately.',
];

interface WaitingRoomProps {
  onNavigate: (path: string) => void;
  onBack: () => void;
}

export default function WaitingRoom({ onNavigate, onBack }: WaitingRoomProps) {
  // 1. Initial State resolution based on mock email or stored applicant
  const [applicant, setApplicant] = useState<ApplyDraft>(() => {
    try {
      const stored = localStorage.getItem(SUBMITTED_STORAGE_KEY) || localStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.email || parsed.fullName)) return parsed;
      }
    } catch {
      // ignore
    }
    return {
      ...INITIAL_APPLY_DRAFT,
      fullName: 'Alex Vance',
      handle: 'alex_vance',
      email: 'pending@worldgallery.org',
      location: 'Kyoto, Japan',
      bio: 'Exploring computational typography, analog tools, and quiet spaces.',
      tags: ['designer', 'writer'],
      avatarBg: '#2D6A4F',
    };
  });

  // Resolve initial waiting state from stored curator store or applicant record
  const [waitingState, setWaitingState] = useState<WaitingState>(() => {
    const cleanHandle = applicant.handle.trim().toLowerCase().replace(/^@/, '');
    const members = getAllGalleryMembers();
    if (members.some((m) => m.handle.toLowerCase() === cleanHandle)) {
      return 'approved';
    }
    const pendingList = getPendingApplicants();
    const foundPending = pendingList.find((p) => p.handle.toLowerCase() === cleanHandle);
    if (foundPending?.status === 'rejected') return 'rejected';
    if (foundPending?.status === 'approved') return 'approved';
    return 'pending';
  });

  // Pick ONE quiet line per visit (stable for entire session)
  const quietLine = useMemo(() => {
    const index = Math.floor(Math.random() * QUIET_LINES.length);
    return QUIET_LINES[index];
  }, []);

  // Notifications State
  const [notifPermission, setNotifPermission] = useState<'default' | 'granted' | 'denied'>('default');
  const [notifPreviewFired, setNotifPreviewFired] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission as 'default' | 'granted' | 'denied');
    }
    const saved = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (saved === 'granted') {
      setNotifPermission('granted');
    }
  }, []);

  // Polling State (silent check simulation)
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<number>(Date.now());

  // 30s Silent Polling
  useEffect(() => {
    if (waitingState !== 'pending') return;

    const timer = setInterval(() => {
      // Silent check without UI flicker
      setLastCheckedTime(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, [waitingState]);

  // Handle Check Status button
  const handleCheckStatus = () => {
    if (isChecking) return;
    haptics.impact('light');
    setIsChecking(true);
    setTimeout(() => {
      setIsChecking(false);
      setLastCheckedTime(Date.now());
      const cleanHandle = applicant.handle.trim().toLowerCase().replace(/^@/, '');
      const members = getAllGalleryMembers();
      if (members.some((m) => m.handle.toLowerCase() === cleanHandle)) {
        setWaitingState('approved');
        haptics.notification('success');
        return;
      }
      const pendingList = getPendingApplicants();
      const foundPending = pendingList.find((p) => p.handle.toLowerCase() === cleanHandle);
      if (foundPending?.status === 'rejected') {
        setWaitingState('rejected');
        haptics.notification('warning');
        return;
      }
      if (foundPending?.status === 'approved') {
        setWaitingState('approved');
        haptics.notification('success');
        return;
      }
      haptics.selection();
    }, 600);
  };

  // Handle Notifications Toggle
  const handleEnableNotifications = async () => {
    haptics.selection();
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('denied');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm as 'default' | 'granted' | 'denied');
      if (perm === 'granted') {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'granted');
        haptics.notification('success');
        if (!notifPreviewFired) {
          setNotifPreviewFired(true);
          try {
            new Notification('World Gallery', {
              body: 'This is how admission will feel.',
              icon: '/favicon.ico',
            });
          } catch {
            // Notification dispatch error catch
          }
        }
      } else {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'denied');
        haptics.impact('light');
      }
    } catch {
      setNotifPermission('denied');
    }
  };

  // Switcher for Demo / Testing
  const handleSetState = (newState: WaitingState) => {
    haptics.selection();
    setWaitingState(newState);
    if (newState === 'approved') {
      haptics.notification('success');
    }
  };

  // Handle Refine & Resubmit (Loads draft back into wizard at Step 2)
  const handleRefineAndResubmit = () => {
    haptics.selection();
    try {
      const draftToSave = {
        ...applicant,
        currentStep: 2,
        updatedAt: Date.now(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftToSave));
    } catch {
      // ignore
    }
    onNavigate('/apply');
  };

  // Avatar Initials
  const initials = applicant.fullName
    ? applicant.fullName
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'W';

  return (
    <main
      id="waiting-room-screen"
      className="relative flex flex-col w-full h-[100dvh] overflow-hidden bg-ios-bg text-ios-text select-none"
    >
      {/* 1. Top Fixed Navigation Bar */}
      <header className="flex items-center justify-between w-full px-5 pt-3 pb-2 flex-shrink-0 z-20 bg-ios-bg">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            onNavigate('/');
          }}
          className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 -ml-2 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -mr-1" />
          <span>Entrance</span>
        </button>

        {/* Ambient connection dot */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 shadow-2xs border border-ios-separator/30">
          <span className="relative flex h-2 w-2">
            {waitingState === 'pending' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ios-forest opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                waitingState === 'approved'
                  ? 'bg-ios-forest'
                  : waitingState === 'rejected'
                  ? 'bg-[#D97706]'
                  : 'bg-ios-forest'
              }`}
            />
          </span>
          <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-ios-secondary">
            {waitingState === 'pending'
              ? 'Lounge'
              : waitingState === 'approved'
              ? 'Admitted'
              : 'Closed'}
          </span>
        </div>
      </header>

      {/* 2. Scrollable Content Area */}
      <div className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-5 pt-2 pb-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence mode="wait" initial={false}>
          {/* ================================= PENDING STATE ================================= */}
          {waitingState === 'pending' && (
            <motion.div
              key="pending-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col w-full space-y-4"
            >
              {/* Header Title */}
              <div className="pt-1 pb-1">
                <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                  Under Review
                </h1>
                <p className="font-sans text-[15px] text-ios-secondary leading-relaxed">
                  Your request is resting with the Curator.
                </p>
              </div>

              {/* Status Card */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ios-forest opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ios-forest" />
                  </div>
                  <span className="font-sans text-[14.5px] font-bold text-ios-forest tracking-wide uppercase">
                    Under Human Review
                  </span>
                </div>
                <p className="font-sans text-[14px] text-ios-secondary leading-relaxed">
                  Reviewed one by one. Ten humans welcomed daily.
                </p>
              </div>

              {/* Profile Snippet Card */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3.5">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-13 h-13 rounded-full flex items-center justify-center text-white font-serif font-bold text-[18px] shadow-xs flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: applicant.avatarBg || '#2D6A4F' }}
                  >
                    {applicant.avatarUrl ? (
                      <img
                        src={applicant.avatarUrl}
                        alt="Profile avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-sans text-[16px] font-bold text-ios-text truncate">
                        {applicant.fullName || 'Alex Vance'}
                      </h2>
                      {/* Availability Dot */}
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          applicant.availability === 'open'
                            ? 'bg-ios-forest'
                            : applicant.availability === 'quiet'
                            ? 'bg-[#D97706]'
                            : 'bg-[#6B7280]'
                        }`}
                        title={`Availability: ${applicant.availability}`}
                      />
                    </div>
                    <p className="font-sans text-[13.5px] text-ios-secondary truncate">
                      @{applicant.handle.replace(/^@/, '') || 'alex_vance'}
                      {applicant.location ? ` • ${applicant.location}` : ''}
                    </p>
                  </div>
                </div>

                {applicant.bio && (
                  <p className="font-sans text-[13.5px] text-ios-text/80 leading-relaxed border-t border-ios-separator/40 pt-2.5">
                    {applicant.bio}
                  </p>
                )}

                {/* Tags */}
                {applicant.tags && applicant.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {applicant.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-[#F2F2F7] text-ios-secondary font-sans font-medium text-[12px] px-2.5 py-0.5 rounded-full border border-ios-separator/30"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quiet Line Manifesto Callout */}
              <div className="px-2 py-1 text-center">
                <p className="font-serif italic text-[14.5px] text-ios-secondary/90 leading-relaxed max-w-[320px] mx-auto">
                  &ldquo;{quietLine}&rdquo;
                </p>
              </div>

              {/* Notifications Row */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-ios-blue/10 text-ios-blue flex items-center justify-center flex-shrink-0">
                      <Bell className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-sans text-[15px] font-semibold text-ios-text">
                        {notifPermission === 'granted'
                          ? 'Notifications on'
                          : 'Be notified when admitted'}
                      </span>
                      <span className="font-sans text-[12.5px] text-ios-secondary">
                        {notifPermission === 'granted'
                          ? 'We will alert you instantly.'
                          : 'Direct ping when your seal is approved.'}
                      </span>
                    </div>
                  </div>

                  {notifPermission === 'granted' ? (
                    <div className="w-7 h-7 rounded-full bg-ios-forest/15 text-ios-forest flex items-center justify-center">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="font-sans text-[14.5px] font-semibold text-ios-blue hover:text-ios-blue-pressed active:opacity-60 py-1.5 px-3 rounded-lg bg-ios-blue/10 transition-colors cursor-pointer"
                    >
                      Enable
                    </button>
                  )}
                </div>

                {notifPermission === 'denied' && (
                  <p className="font-sans text-[12px] text-ios-secondary mt-2.5 pt-2 border-t border-ios-separator/40">
                    Notifications are disabled. You can enable them later in system settings.
                  </p>
                )}
              </div>

              {/* Check Status Subtle Button */}
              <div className="pt-2 pb-2 flex flex-col items-center">
                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={isChecking}
                  className="inline-flex items-center gap-1.5 font-sans text-[13.5px] font-medium text-ios-secondary hover:text-ios-text active:scale-95 transition-all py-2 px-4 rounded-full bg-transparent cursor-pointer"
                >
                  <RotateCcw
                    className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-ios-forest' : ''}`}
                  />
                  <span>{isChecking ? 'Refreshing status...' : 'Check status'}</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ================================= APPROVED STATE ================================= */}
          {waitingState === 'approved' && (
            <motion.div
              key="approved-view"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className="flex flex-col w-full space-y-4"
            >
              {/* Header Title */}
              <div className="pt-1 pb-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E8F5E9] text-ios-forest font-semibold text-[12px] uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Seal Granted</span>
                </div>
                <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                  You Have Been Admitted
                </h1>
                <p className="font-sans text-[15px] text-ios-secondary leading-relaxed">
                  Your seal is active. Step inside.
                </p>
              </div>

              {/* Admission Pass Card */}
              <div className="bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white rounded-3xl p-5 shadow-lg border border-white/10 relative overflow-hidden space-y-5">
                {/* Decorative watermark */}
                <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                  <ShieldCheck className="w-48 h-48" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-widest text-white/80 font-bold">
                    Official Member Pass
                  </span>
                  <span className="font-mono text-[13px] font-bold bg-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-xs">
                    #0428
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-serif font-bold text-[22px] ring-2 ring-white/40 shadow-sm overflow-hidden flex-shrink-0"
                    style={{ backgroundColor: applicant.avatarBg || '#1B4332' }}
                  >
                    {applicant.avatarUrl ? (
                      <img
                        src={applicant.avatarUrl}
                        alt="Member portrait"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-sans text-[19px] font-bold text-white truncate">
                      {applicant.fullName || 'Alex Vance'}
                    </h2>
                    <p className="font-sans text-[14px] text-white/80 truncate">
                      @{applicant.handle.replace(/^@/, '') || 'alex_vance'}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/15 flex items-center justify-between text-xs text-white/80 font-mono">
                  <span>Admitted: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="text-white font-semibold">Cohort 2026</span>
                </div>
              </div>

              {/* Primary Action Button */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    haptics.notification('success');
                    onNavigate('/gallery');
                  }}
                  className="w-full bg-ios-forest text-white font-sans font-semibold text-[16px] py-4 px-6 rounded-ios-pill shadow-sm hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  <span>Enter The Gallery</span>
                  <ArrowRight className="w-4.5 h-4.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ================================= REJECTED STATE ================================= */}
          {waitingState === 'rejected' && (
            <motion.div
              key="rejected-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col w-full space-y-4"
            >
              {/* Header Title */}
              <div className="pt-1 pb-1">
                <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                  A Note from the Curator
                </h1>
                <p className="font-sans text-[15px] text-ios-secondary leading-relaxed">
                  Regarding your membership request.
                </p>
              </div>

              {/* Warm Amber-Toned Card (No Harsh Red) */}
              <div className="bg-[#FEF3C7]/60 border border-[#D97706]/20 rounded-2xl p-5 shadow-ios-card space-y-3">
                <div className="flex items-center gap-2 text-[#D97706]">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="font-sans text-[15px] font-bold">
                    Cohort Closed
                  </span>
                </div>
                <p className="font-sans text-[14.5px] text-[#92400E] leading-relaxed">
                  This cohort has closed, but your story is welcome. Refine your bridges and try again.
                </p>
              </div>

              {/* Profile Card Under Review (Mirrors Pending Snippet) */}
              <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3.5">
                <span className="block font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                  Previous Submission
                </span>
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-13 h-13 rounded-full flex items-center justify-center text-white font-serif font-bold text-[18px] shadow-xs flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: applicant.avatarBg || '#2D6A4F' }}
                  >
                    {applicant.avatarUrl ? (
                      <img
                        src={applicant.avatarUrl}
                        alt="Profile avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-sans text-[16px] font-bold text-ios-text truncate">
                        {applicant.fullName || 'Alex Vance'}
                      </h2>
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          applicant.availability === 'open'
                            ? 'bg-ios-forest'
                            : applicant.availability === 'quiet'
                            ? 'bg-[#D97706]'
                            : 'bg-[#6B7280]'
                        }`}
                      />
                    </div>
                    <p className="font-sans text-[13.5px] text-ios-secondary truncate">
                      @{applicant.handle.replace(/^@/, '') || 'alex_vance'}
                      {applicant.location ? ` • ${applicant.location}` : ''}
                    </p>
                  </div>
                </div>

                {applicant.bio && (
                  <p className="font-sans text-[13.5px] text-ios-text/80 leading-relaxed border-t border-ios-separator/40 pt-2.5">
                    {applicant.bio}
                  </p>
                )}

                {/* Tags */}
                {applicant.tags && applicant.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {applicant.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-[#F2F2F7] text-ios-secondary font-sans font-medium text-[12px] px-2.5 py-0.5 rounded-full border border-ios-separator/30"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Resubmit CTA Buttons */}
              <div className="pt-2 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleRefineAndResubmit}
                  className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed transition-all cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  <FileEdit className="w-4 h-4" />
                  <span>Refine &amp; Resubmit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    onNavigate('/');
                  }}
                  className="w-full bg-[#E5E5EA]/80 hover:bg-[#E5E5EA] text-ios-secondary hover:text-ios-text font-sans font-semibold text-[15px] py-3.5 px-6 rounded-ios-pill active:scale-[0.98] transition-all cursor-pointer text-center"
                >
                  Return to Entrance
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Discreet TEMP Demo Switcher Bar (Positioned at bottom for testing) */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 bg-ios-card/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-ios-separator/60 flex items-center gap-1.5 max-w-[92%]">
        <span className="font-mono text-[10px] font-bold uppercase text-ios-secondary/70 mr-1">
          TEMP:
        </span>
        {(['pending', 'approved', 'rejected'] as const).map((mode) => {
          const isActive = waitingState === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => handleSetState(mode)}
              className={`font-sans text-[11.5px] font-semibold px-2.5 py-1 rounded-full capitalize transition-all cursor-pointer ${
                isActive
                  ? 'bg-ios-text text-white shadow-2xs'
                  : 'text-ios-secondary hover:text-ios-text bg-transparent'
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>
    </main>
  );
}
