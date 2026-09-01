'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Lock,
  Unlock,
  Check,
  X,
  Sparkles,
  Copy,
  Trash2,
  Users,
  Inbox,
  Activity,
  Plus,
  ShieldCheck,
  Clock,
  MapPin,
  Tag,
  KeyRound,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { BrandLoader } from './BrandLoader';
import { haptics } from '../lib/haptics';
import { PendingApplicant, InviteSeal, CuratorTelemetry } from '../types/admin';
import {
  isCuratorAuthenticated,
  authenticateCurator,
  setCuratorAuthenticated,
  getPendingApplicants,
  fetchPendingApplicantsFromDb,
  getInviteSeals,
  createInviteSeal,
  deleteInviteSeal,
  approveApplicantAsync,
  declineApplicant,
  getCuratorTelemetry,
  getDailyApprovalCount,
} from '../lib/curatorStore';
import { getAdminEmail } from '../lib/security';

interface AdminDashboardProps {
  onNavigate: (path: string) => void;
  onBack: () => void;
}

type AdminTab = 'queue' | 'invites' | 'pulse';

export default function AdminDashboard({ onNavigate, onBack }: AdminDashboardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passcode, setPasscode] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');

  // Data States
  const [applicants, setApplicants] = useState<PendingApplicant[]>([]);
  const [seals, setSeals] = useState<InviteSeal[]>([]);
  const [telemetry, setTelemetry] = useState<CuratorTelemetry>({
    verifiedHumans: 0,
    restingRequests: 0,
    activeBridges: 0,
    approvedToday: 0,
    dailyCap: 10,
  });

  // Decline Modal Sheet State
  const [decliningApplicant, setDecliningApplicant] = useState<PendingApplicant | null>(null);
  const [declineReason, setDeclineReason] = useState<string>('');

  // New Invite Sheet State
  const [isCreatingSeal, setIsCreatingSeal] = useState<boolean>(false);
  const [newSealNote, setNewSealNote] = useState<string>('');
  const [newCustomCode, setNewCustomCode] = useState<string>('');
  const [copiedSealId, setCopiedSealId] = useState<string | null>(null);

  // Transient Approving Animation IDs
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync session & data with route guard
  useEffect(() => {
    // Route Guard: If a standard non-curator member attempts to access /admin, redirect immediately to /gallery
    if (typeof window !== 'undefined') {
      try {
        const rawSession = localStorage.getItem('wg_user_session');
        if (rawSession) {
          const session = JSON.parse(rawSession);
          const configuredAdmin = getAdminEmail().toLowerCase().trim();
          const userEmail = (session?.email || '').toLowerCase().trim();
          if (session?.role === 'member' && userEmail !== configuredAdmin && userEmail !== 'tonbaratiminipredestiny@gmail.com') {
            console.warn('[Security Guard] Non-curator member attempted to access /admin. Redirecting to /gallery.');
            onNavigate('/gallery');
            return;
          }
        }
      } catch {
        // Continue
      }
    }

    const authed = isCuratorAuthenticated();
    setIsAuthenticated(authed);
    if (authed) {
      refreshData();
    }
  }, [onNavigate]);

  const refreshData = async () => {
    try {
      const dbApps = await fetchPendingApplicantsFromDb();
      if (dbApps && dbApps.length >= 0) {
        setApplicants(dbApps);
      } else {
        setApplicants(getPendingApplicants());
      }
    } catch {
      setApplicants(getPendingApplicants());
    }
    setSeals(getInviteSeals());
    setTelemetry(getCuratorTelemetry());
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthenticating(true);

    try {
      const cleanPasscode = passcode.trim();
      const adminEmail = getAdminEmail().toLowerCase().trim();

      // Check server authentication endpoint
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, passcode: cleanPasscode }),
      }).catch(() => null);

      if (response && response.status >= 500) {
        setIsAuthenticating(false);
        haptics.notification('error');
        setAuthError("The gallery couldn't be reached. Try again.");
        return;
      }

      if (response && response.ok) {
        const data = await response.json();
        if (data.verified) {
          setIsAuthenticating(false);
          haptics.notification('success');
          setCuratorAuthenticated(true, adminEmail);
          setIsAuthenticated(true);
          setPasscode('');
          refreshData();
          return;
        }
      }

      // Fallback for local sandbox / dev testing
      const localSuccess = authenticateCurator(cleanPasscode);
      setIsAuthenticating(false);

      if (localSuccess) {
        haptics.notification('success');
        setIsAuthenticated(true);
        setPasscode('');
        refreshData();
      } else {
        haptics.notification('error');
        if (!response && !navigator.onLine) {
          setAuthError("No connection. Check your internet and try again.");
        } else if (!response) {
          setAuthError("The gallery couldn't be reached. Try again.");
        } else {
          setAuthError('The passcode is not recognized by the registry.');
        }
      }
    } catch {
      setIsAuthenticating(false);
      haptics.notification('error');
      setAuthError("The gallery couldn't be reached. Try again.");
    }
  };

  const handleLogout = () => {
    haptics.selection();
    setCuratorAuthenticated(false);
    setIsAuthenticated(false);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleApprove = async (app: PendingApplicant) => {
    if (telemetry.approvedToday >= 10) {
      haptics.notification('warning');
      showToast('Daily curation quota is complete (10 of 10). Resumes tomorrow.');
      return;
    }

    haptics.impact('medium');
    setApprovingId(app.id);

    try {
      const res = await approveApplicantAsync(app.id);
      if (res.success) {
        haptics.notification('success');
        showToast(`Welcomed ${app.fullName} to the Gallery (${res.member?.memberNumber}).`);
        await refreshData();
      } else {
        haptics.notification('error');
        showToast(res.error || 'Failed to approve applicant.');
      }
    } catch {
      haptics.notification('error');
      showToast('Failed to approve applicant.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmDecline = () => {
    if (!decliningApplicant) return;
    haptics.impact('light');
    declineApplicant(decliningApplicant.id, declineReason);
    showToast(`Archived application from ${decliningApplicant.fullName}.`);
    setDecliningApplicant(null);
    setDeclineReason('');
    refreshData();
  };

  const handleCreateSeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSealNote.trim() && !newCustomCode.trim()) return;

    haptics.impact('medium');
    const created = createInviteSeal(newSealNote, newCustomCode);
    haptics.notification('success');
    showToast(`Seal ${created.code} forged.`);
    setIsCreatingSeal(false);
    setNewSealNote('');
    setNewCustomCode('');
    refreshData();
  };

  const handleDeleteSeal = (id: string, code: string) => {
    haptics.impact('light');
    deleteInviteSeal(id);
    showToast(`Seal ${code} retired.`);
    refreshData();
  };

  const handleCopySeal = (seal: InviteSeal) => {
    haptics.selection();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(seal.code);
      setCopiedSealId(seal.id);
      setTimeout(() => setCopiedSealId(null), 2000);
    }
  };

  // 1. Gated Password Lock Screen
  if (!isAuthenticated) {
    return (
      <main
        id="curator-desk-lock"
        className="relative flex flex-col items-center justify-between w-full h-[100dvh] bg-ios-bg text-ios-text select-none overflow-hidden max-w-lg mx-auto px-6 py-8"
      >
        {/* Top Header */}
        <header className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-ios-blue font-sans text-[16px] font-normal active:opacity-60 transition-opacity cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 -ml-1.5" />
            <span>Gallery</span>
          </button>
          <div className="w-6" />
        </header>

        {/* Lock Hero Card */}
        <div className="flex flex-col items-center text-center max-w-xs space-y-4 my-auto">
          <div className="w-16 h-16 rounded-2xl bg-ios-forest/10 text-ios-forest flex items-center justify-center shadow-xs border border-ios-forest/20">
            <KeyRound className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h1 className="font-sans text-[26px] font-bold tracking-tight text-ios-text">
              Curator Desk
            </h1>
            <p className="font-sans text-[13.5px] text-ios-secondary leading-relaxed">
              Restricted to gallery stewards. Enter the master key to inspect the queue.
            </p>
          </div>

          <form onSubmit={handleLogin} className="w-full space-y-3 pt-2">
            <div className="relative">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode (e.g. world2026)"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-[#E5E5EA]/70 focus:bg-white text-ios-text font-mono text-[15px] px-4 py-3 rounded-xl border border-ios-separator/60 focus:border-ios-forest outline-none transition-all placeholder:text-ios-secondary/50 text-center"
              />
            </div>

            {authError && (
              <p className="font-sans text-[12px] text-[#DC2626] leading-tight">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={isAuthenticating || !passcode.trim()}
              className="w-full bg-ios-forest text-white font-sans font-semibold text-[15px] py-3.5 px-5 rounded-xl shadow-xs disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isAuthenticating ? 'Unlocking...' : 'Open Curator Desk'}
            </button>
          </form>

          <div className="pt-4">
            <span className="font-mono text-[11.5px] text-ios-secondary/60">
              Identity: {getAdminEmail()}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-ios-secondary/50 text-[11px] font-sans">
          World Gallery Protocol • Intentionally Quiet
        </div>
      </main>
    );
  }

  // 2. Authenticated Curator Desk
  return (
    <main
      id="curator-desk-screen"
      className="relative flex flex-col w-full h-[100dvh] bg-ios-bg text-ios-text select-none overflow-hidden"
    >
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between w-full px-5 pt-3 pb-2.5 bg-ios-bg/95 backdrop-blur-md border-b border-ios-separator/30 max-w-lg mx-auto flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-ios-blue font-sans text-[15.5px] font-normal active:opacity-60 transition-opacity cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -ml-1.5" />
          <span>Gallery</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-ios-forest bg-ios-forest/10 px-2.5 py-0.5 rounded-full border border-ios-forest/20">
            Curator
          </span>
          <button
            type="button"
            onClick={handleLogout}
            title="Lock Desk"
            className="p-1.5 text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer rounded-lg"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Top Title & Segmented Navigation */}
      <div className="w-full px-5 pt-3 pb-2 max-w-lg mx-auto flex-shrink-0 space-y-3">
        <div>
          <h1 className="font-sans text-[28px] sm:text-[30px] font-extrabold tracking-tight text-ios-text leading-tight">
            Curator Desk
          </h1>
          <p className="font-sans text-[13.5px] text-ios-secondary">
            Stewarding the pace of our human directory.
          </p>
        </div>

        {/* iOS Segmented Control [Queue | Invites | Pulse] */}
        <div className="flex items-center p-1 bg-[#E5E5EA]/80 rounded-xl shadow-inner-xs">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('queue');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-sans text-[13.5px] font-semibold transition-all cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-white text-ios-text shadow-xs'
                : 'text-ios-secondary hover:text-ios-text'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Queue</span>
            {applicants.length > 0 && (
              <span className="font-mono text-[10.5px] font-bold px-1.5 py-0.2 rounded-full bg-ios-forest text-white">
                {applicants.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('invites');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-sans text-[13.5px] font-semibold transition-all cursor-pointer ${
              activeTab === 'invites'
                ? 'bg-white text-ios-text shadow-xs'
                : 'text-ios-secondary hover:text-ios-text'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Invites</span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setActiveTab('pulse');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-sans text-[13.5px] font-semibold transition-all cursor-pointer ${
              activeTab === 'pulse'
                ? 'bg-white text-ios-text shadow-xs'
                : 'text-ios-secondary hover:text-ios-text'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Pulse</span>
          </button>
        </div>
      </div>

      {/* 3. Tab Content (Scrollable Container) */}
      <div className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-5 pt-2 pb-32 max-w-lg mx-auto space-y-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-contain touch-pan-y">
        
        {/* TAB 1: QUEUE */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {/* Daily Intake Gauge Card */}
            <div className="bg-ios-card rounded-2xl p-4 shadow-ios-card border border-ios-separator/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                  Daily Intake Pace
                </span>
                <span className="font-sans text-[12.5px] font-semibold text-ios-text">
                  {telemetry.approvedToday} of 10 welcomed today
                </span>
              </div>

              {/* Segmented 10-tick gauge */}
              <div className="grid grid-cols-10 gap-1.5 pt-0.5">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const isFilled = idx < telemetry.approvedToday;
                  return (
                    <div
                      key={idx}
                      className={`h-2.5 rounded-sm transition-all ${
                        isFilled
                          ? 'bg-ios-forest shadow-2xs'
                          : 'bg-[#E5E5EA] border border-ios-separator/20'
                      }`}
                    />
                  );
                })}
              </div>

              {telemetry.approvedToday >= 10 ? (
                <div className="flex items-center gap-2 pt-1 text-[#D97706]">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <p className="font-sans text-[12px] leading-snug">
                    The day&apos;s intake is complete. New humans will be welcomed at dawn.
                  </p>
                </div>
              ) : (
                <p className="font-sans text-[12px] text-ios-secondary leading-snug">
                  Intentional intake ensures high signal. Each newcomer is introduced with care.
                </p>
              )}
            </div>

            {/* Applicant Cards List */}
            {applicants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-ios-card rounded-2xl border border-ios-separator/30 p-6">
                <div className="w-12 h-12 rounded-full bg-ios-forest/10 text-ios-forest flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-sans text-[16px] font-bold text-ios-text">
                    The Queue is Quiet
                  </h3>
                  <p className="font-sans text-[13px] text-ios-secondary max-w-xs">
                    All applicants have been reviewed. Rest and return when new portraits arrive.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <span className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Pending Portfolios ({applicants.length})
                  </span>
                </div>

                <AnimatePresence mode="popLayout">
                  {applicants.map((app) => (
                    <motion.div
                      key={app.id}
                      layout
                      initial={{ opacity: 0, y: 12, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.25 } }}
                      className="bg-ios-card rounded-2xl shadow-ios-card border border-ios-separator/40 overflow-hidden"
                    >
                      {/* Top Banner / Provenance */}
                      <div className="flex items-center justify-between px-4 py-2 bg-[#F9F9FB] border-b border-ios-separator/30">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-sans text-[11px] font-bold uppercase px-2 py-0.5 rounded-md ${
                              app.entryType === 'invite'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {app.entryType === 'invite' ? 'Invited' : 'Waiting Room'}
                          </span>
                          {app.invitedBy && (
                            <span className="font-sans text-[11.5px] text-ios-secondary">
                              via {app.invitedBy}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-ios-secondary font-sans text-[11.5px]">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(app.appliedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Content Card Body */}
                      <div className="p-4 space-y-4">
                        {/* Portrait & Core Identity */}
                        <div className="flex items-start gap-3.5">
                          <div
                            style={{ backgroundColor: app.avatarBg || '#2D6A4F' }}
                            className="w-14 h-14 rounded-full flex-shrink-0 overflow-hidden shadow-xs border border-white/80"
                          >
                            {app.avatarUrl ? (
                              <img
                                src={app.avatarUrl}
                                alt={app.fullName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center font-serif text-white font-bold text-[18px]">
                                {app.fullName.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-col min-w-0 flex-1">
                            <h3 className="font-sans text-[17px] font-bold text-ios-text leading-tight truncate">
                              {app.fullName}
                            </h3>
                            <span className="font-sans text-[13px] text-ios-secondary">
                              @{app.handle}
                            </span>
                            <div className="flex items-center gap-1 text-[12.5px] text-ios-secondary mt-0.5">
                              <MapPin className="w-3 h-3 text-ios-secondary/70 flex-shrink-0" />
                              <span className="truncate">{app.location}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bio in Quiet Serif Italic */}
                        <div className="p-3 bg-[#F2F2F7]/60 rounded-xl border border-ios-separator/20">
                          <p className="font-serif italic text-[14px] text-ios-text/90 leading-relaxed">
                            &ldquo;{app.bio}&rdquo;
                          </p>
                        </div>

                        {/* Craft Discipline Tags */}
                        <div className="flex flex-wrap gap-1.5">
                          {app.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="font-sans text-[11.5px] font-medium px-2.5 py-0.5 rounded-full bg-[#E5E5EA]/70 text-ios-secondary border border-ios-separator/30 capitalize"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>

                        {/* Studio Photos (if present) */}
                        {app.photos && app.photos.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto pt-1 pb-0.5">
                            {app.photos.slice(1, 3).map((photo, pIdx) => (
                              <div
                                key={pIdx}
                                className="w-20 h-20 rounded-xl overflow-hidden shadow-2xs border border-ios-separator/30 flex-shrink-0"
                              >
                                <img
                                  src={photo}
                                  alt="Studio proof"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Contact Bridges Summary */}
                        {app.bridges && app.bridges.length > 0 && (
                          <div className="pt-2 border-t border-ios-separator/30 space-y-1">
                            <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-ios-secondary">
                              Proposed Bridges
                            </span>
                            <div className="flex flex-wrap gap-2 text-ios-secondary text-[12px] font-mono">
                              {app.bridges.map((b, bIdx) => (
                                <span
                                  key={bIdx}
                                  className="bg-white px-2 py-0.5 rounded border border-ios-separator/40"
                                >
                                  {b.label}: {b.unmaskedValue || b.maskedHint}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Curator Decision Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-ios-separator/40">
                          {/* Decline Button */}
                          <button
                            type="button"
                            onClick={() => {
                              haptics.selection();
                              setDecliningApplicant(app);
                            }}
                            className="flex-1 bg-[#F2F2F7] hover:bg-[#E5E5EA] text-ios-secondary active:text-ios-text font-sans font-medium text-[14px] py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                            <span>Decline</span>
                          </button>

                          {/* Welcome Button */}
                          <button
                            type="button"
                            disabled={telemetry.approvedToday >= 10 || approvingId === app.id}
                            onClick={() => handleApprove(app)}
                            className="flex-[2] bg-ios-forest hover:bg-ios-forest-pressed text-white font-sans font-semibold text-[14.5px] py-2.5 px-4 rounded-xl shadow-xs disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {approvingId === app.id ? (
                              <BrandLoader size="sm" className="w-4 h-4" />
                            ) : (
                              <>
                                <Check className="w-4 h-4 stroke-[2.5]" />
                                <span>Welcome into Gallery</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INVITES */}
        {activeTab === 'invites' && (
          <div className="space-y-4">
            {/* Header with Forge Invite Button */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-sans text-[15px] font-bold text-ios-text">
                  Direct Invitation Seals
                </h3>
                <p className="font-sans text-[12.5px] text-ios-secondary">
                  Single-use codes skipping the wait room directly into the 4-step wizard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setIsCreatingSeal(true);
                }}
                className="bg-ios-forest text-white font-sans font-semibold text-[13px] px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Forge Seal</span>
              </button>
            </div>

            {/* List of Invite Seals */}
            <div className="bg-ios-card rounded-2xl shadow-ios-card border border-ios-separator/30 divide-y divide-ios-separator/30 overflow-hidden">
              {seals.map((seal) => (
                <div
                  key={seal.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-black/[0.01] transition-colors"
                >
                  <div className="flex flex-col min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[15px] font-bold text-ios-text tracking-wide select-all">
                        {seal.code}
                      </span>
                      <span
                        className={`font-sans text-[10.5px] font-bold uppercase px-2 py-0.2 rounded-full ${
                          seal.status === 'active'
                            ? 'bg-[#E8F5E9] text-ios-forest border border-ios-forest/20'
                            : 'bg-[#F2F2F7] text-ios-secondary'
                        }`}
                      >
                        {seal.status === 'active' ? 'Active' : 'Redeemed'}
                      </span>
                    </div>

                    <p className="font-sans text-[12.5px] text-ios-secondary truncate">
                      {seal.description}
                    </p>

                    {seal.usedByHandle && (
                      <span className="font-sans text-[11.5px] text-ios-forest">
                        Used by @{seal.usedByHandle} on{' '}
                        {new Date(seal.usedAt || '').toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Copy Button */}
                    <button
                      type="button"
                      onClick={() => handleCopySeal(seal)}
                      className="p-2 text-ios-secondary hover:text-ios-text active:scale-90 transition-all rounded-lg bg-[#F2F2F7] cursor-pointer"
                      title="Copy Code"
                    >
                      {copiedSealId === seal.id ? (
                        <Check className="w-4 h-4 text-ios-forest" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete Button */}
                    {seal.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSeal(seal.id, seal.code)}
                        className="p-2 text-[#DC2626]/70 hover:text-[#DC2626] active:scale-90 transition-all rounded-lg bg-red-50 cursor-pointer"
                        title="Retire Seal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PULSE */}
        {activeTab === 'pulse' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-sans text-[15px] font-bold text-ios-text">
                Directory Vitality
              </h3>
              <p className="font-sans text-[12.5px] text-ios-secondary">
                No growth targets. No virality metrics. Only quiet craft.
              </p>
            </div>

            {/* Three Simple Clean Stat Cards */}
            <div className="grid grid-cols-1 gap-3.5">
              {/* Stat 1: Verified Humans */}
              <div className="bg-ios-card rounded-2xl p-5 shadow-ios-card border border-ios-separator/30 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Verified Humans
                  </span>
                  <div className="font-serif text-[32px] font-bold text-ios-text leading-none">
                    {telemetry.verifiedHumans}
                  </div>
                  <span className="font-sans text-[12.5px] text-ios-secondary">
                    Sealed in the public gallery
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-ios-forest/10 text-ios-forest flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </div>

              {/* Stat 2: Resting Requests */}
              <div className="bg-ios-card rounded-2xl p-5 shadow-ios-card border border-ios-separator/30 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Resting Requests
                  </span>
                  <div className="font-serif text-[32px] font-bold text-ios-text leading-none">
                    {telemetry.restingRequests}
                  </div>
                  <span className="font-sans text-[12.5px] text-ios-secondary">
                    Applicants waiting in queue
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
              </div>

              {/* Stat 3: Active Bridges */}
              <div className="bg-ios-card rounded-2xl p-5 shadow-ios-card border border-ios-separator/30 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Active Bridges
                  </span>
                  <div className="font-serif text-[32px] font-bold text-ios-text leading-none">
                    {telemetry.activeBridges}
                  </div>
                  <span className="font-sans text-[12.5px] text-ios-secondary">
                    Encrypted channels opened between members
                  </span>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-ios-blue/10 text-ios-blue flex items-center justify-center">
                  <Activity className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Quiet Manifesto Footnote */}
            <div className="p-4 rounded-2xl bg-[#F9F9FB] border border-ios-separator/30 text-center space-y-1">
              <span className="font-serif font-bold text-[13.5px] text-ios-text">
                The Principle of Intentional Scale
              </span>
              <p className="font-sans text-[12px] text-ios-secondary leading-relaxed">
                By maintaining a human pace of 10 approvals daily, we protect the dignity of craftsmanship over algorithm-driven vanity metrics.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Decline Reason Modal Sheet */}
      <AnimatePresence>
        {decliningApplicant && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
              onClick={() => setDecliningApplicant(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-w-lg mx-auto p-6 space-y-4 shadow-2xl border-t border-ios-separator/40 select-none"
            >
              <div className="w-10 h-1 rounded-full bg-[#D1D1D6] mx-auto mb-1" />

              <div>
                <h3 className="font-sans text-[18px] font-bold text-ios-text">
                  Decline Application
                </h3>
                <p className="font-sans text-[13px] text-ios-secondary">
                  Archiving {decliningApplicant.fullName}&apos;s submission.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                  Curator Note (Optional)
                </label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Craft discipline portfolio not yet verified."
                  rows={3}
                  className="w-full bg-[#F2F2F7] text-ios-text font-sans text-[14px] p-3 rounded-xl border border-ios-separator/40 focus:border-ios-secondary outline-none resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDecliningApplicant(null)}
                  className="flex-1 py-3 rounded-xl bg-[#F2F2F7] font-sans font-semibold text-[14.5px] text-ios-secondary active:text-ios-text cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDecline}
                  className="flex-1 py-3 rounded-xl bg-[#DC2626] font-sans font-semibold text-[14.5px] text-white active:bg-red-700 cursor-pointer shadow-xs"
                >
                  Confirm Decline
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Forge Seal Modal Sheet */}
      <AnimatePresence>
        {isCreatingSeal && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
              onClick={() => setIsCreatingSeal(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-w-lg mx-auto p-6 space-y-4 shadow-2xl border-t border-ios-separator/40 select-none"
            >
              <div className="w-10 h-1 rounded-full bg-[#D1D1D6] mx-auto mb-1" />

              <div>
                <h3 className="font-sans text-[18px] font-bold text-ios-text">
                  Forge Direct Seal
                </h3>
                <p className="font-sans text-[13px] text-ios-secondary">
                  Create a custom invitation code for a specific artisan or colleague.
                </p>
              </div>

              <form onSubmit={handleCreateSeal} className="space-y-3">
                <div className="space-y-1">
                  <label className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Assignee / Note
                  </label>
                  <input
                    type="text"
                    value={newSealNote}
                    onChange={(e) => setNewSealNote(e.target.value)}
                    placeholder="e.g. For Kyoto Printmaker Guild"
                    className="w-full bg-[#F2F2F7] text-ios-text font-sans text-[14px] px-3 py-2.5 rounded-xl border border-ios-separator/40 focus:border-ios-forest outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-sans text-[12px] font-bold uppercase tracking-wider text-ios-secondary">
                    Custom Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={newCustomCode}
                    onChange={(e) => setNewCustomCode(e.target.value)}
                    placeholder="Leave empty for auto-generated code"
                    className="w-full bg-[#F2F2F7] text-ios-text font-mono text-[14px] px-3 py-2.5 rounded-xl border border-ios-separator/40 focus:border-ios-forest outline-none uppercase"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSeal(false)}
                    className="flex-1 py-3 rounded-xl bg-[#F2F2F7] font-sans font-semibold text-[14.5px] text-ios-secondary cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-ios-forest font-sans font-semibold text-[14.5px] text-white active:bg-ios-forest-pressed cursor-pointer shadow-xs"
                  >
                    Forge Seal
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full max-w-sm"
          >
            <div className="bg-ios-text/95 text-white font-sans text-[13.5px] font-medium py-2.5 px-4 rounded-2xl shadow-xl backdrop-blur-md flex items-center justify-center text-center border border-white/10">
              {toastMessage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
