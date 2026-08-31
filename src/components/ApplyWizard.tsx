'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Check,
  Camera,
  X,
  Plus,
  Lock,
  Loader2,
  KeyRound,
  Users,
  ShieldCheck,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import {
  ApplyDraft,
  INITIAL_APPLY_DRAFT,
  CURATED_PALETTE,
  RESERVED_SYSTEM_HANDLES,
  CHANNEL_CONFIGS,
  ContactChannelType,
  ContactBridge,
} from '../types/apply';
import { isHandleAvailable, saveCurrentUserProfile } from '../lib/userProfile';
import { getInviteSeals, saveInviteSeals, getPendingApplicants, savePendingApplicants } from '../lib/curatorStore';
import { PendingApplicant } from '../types/admin';
import { GalleryMember } from '../types/gallery';
import {
  sanitizeText,
  sanitizeStringArray,
  validateAndOptimizeImage,
  checkClientRateLimit,
  recordClientAction,
} from '../lib/security';

const DRAFT_STORAGE_KEY = 'wg_apply_draft_v1';
const SUGGESTED_TAGS = ['designer', 'photographer', 'writer', 'developer'];
const ALL_CHANNELS: ContactChannelType[] = [
  'whatsapp',
  'telegram',
  'signal',
  'instagram',
  'discord',
  'phone',
  'email',
  'website',
  'other',
];

interface ApplyWizardProps {
  onNavigate: (path: string) => void;
  onBack: () => void;
}

// Live Privacy Masking Utility
function maskContactValue(type: ContactChannelType, value: string): string {
  const val = value.trim();
  if (!val) return '••••••••';

  if (type === 'phone' || type === 'whatsapp' || type === 'signal') {
    const digits = val.replace(/\D/g, '');
    if (digits.length < 4) return '••• ••• ••';

    const last2 = digits.slice(-2);
    // Extract country code if user provided a '+' or leading country code
    let countryCode = '';
    if (val.startsWith('+')) {
      // If starts with +, grab the initial 1-4 digits following +
      const match = val.match(/^\+(\d{1,4})/);
      if (match) {
        countryCode = `+${match[1]} `;
      } else {
        countryCode = '+ ';
      }
    } else if (digits.length >= 11) {
      // E.g. standard international numbers with 1-3 digits country code
      const ccLen = digits.length >= 12 ? 3 : (digits.length === 11 ? (digits.startsWith('1') ? 1 : 2) : 1);
      countryCode = `+${digits.slice(0, ccLen)} `;
    }

    return `${countryCode}••• ••• ${last2}`.trim();
  }

  if (type === 'email') {
    const parts = val.split('@');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const user = parts[0];
      const domain = parts[1];
      const domainParts = domain.split('.');
      const firstUserChar = user[0] || 'u';
      const firstDomainChar = domainParts[0]?.[0] || 'd';
      const tld = domainParts.length > 1 ? '.' + domainParts.slice(1).join('.') : '';
      return `${firstUserChar}•••@${firstDomainChar}•••${tld}`;
    }
    return `${val[0] || 'e'}•••@••••.com`;
  }

  if (type === 'website') {
    return val;
  }

  // Handles (Telegram, Instagram, Discord, Other)
  const clean = val.replace(/^@/, '');
  if (clean.length <= 2) {
    return `@${clean[0] || ''}•••`;
  }
  const first = clean[0];
  const last = clean[clean.length - 1];
  return `@${first}•••${last}`;
}

export default function ApplyWizard({ onNavigate, onBack }: ApplyWizardProps) {
  const [draft, setDraft] = useState<ApplyDraft>(INITIAL_APPLY_DRAFT);
  const [step, setStep] = useState<number>(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [showResumePrompt, setShowResumePrompt] = useState<boolean>(false);
  const [savedDraftCache, setSavedDraftCache] = useState<ApplyDraft | null>(null);

  // Step 1 local state
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 local state
  const [tagInput, setTagInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Step 4 final submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitSuccess, setIsSubmitSuccess] = useState(false);

  // Read URL query params & stored invite code on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const codeParam = urlParams.get('code');
      const storedCode = localStorage.getItem('wg_invite_code');
      const finalCode = (codeParam || storedCode || '').trim().toUpperCase();
      if (finalCode) {
        setDraft((prev) => ({
          ...prev,
          entryChoice: 'invite',
          inviteCode: finalCode,
        }));
      }
    }
  }, []);

  // Initial draft recovery check
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ApplyDraft;
        if (parsed && (parsed.email || parsed.fullName || parsed.handle || parsed.bio || parsed.bridges?.length > 0)) {
          setSavedDraftCache(parsed);
          setShowResumePrompt(true);
        }
      }
    } catch {
      // Ignore parse failure
    }
  }, []);

  // Save to localStorage on draft change
  const updateDraft = (patch: Partial<ApplyDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch, updatedAt: Date.now() };
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage quota catch
      }
      return next;
    });
  };

  // Resume vs Start Over
  const handleResumeDraft = () => {
    haptics.notification('success');
    if (savedDraftCache) {
      setDraft(savedDraftCache);
      setStep(savedDraftCache.currentStep || 1);
    }
    setShowResumePrompt(false);
  };

  const handleStartOver = () => {
    haptics.selection();
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft(INITIAL_APPLY_DRAFT);
    setStep(1);
    setShowResumePrompt(false);
  };

  // Navigation handlers
  const handleNextStep = () => {
    if (step < 4) {
      haptics.selection();
      setDirection('forward');
      const nextStep = step + 1;
      setStep(nextStep);
      updateDraft({ currentStep: nextStep });
      // Scroll scrollable column to top
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handlePrevStep = () => {
    haptics.selection();
    if (step > 1) {
      setDirection('backward');
      const prevStep = step - 1;
      setStep(prevStep);
      updateDraft({ currentStep: prevStep });
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      onBack();
    }
  };

  // Step 1 Validation Rules
  const emailValid = draft.email.trim().includes('@') && draft.email.trim().includes('.');
  const ruleLen = draft.password.length >= 8;
  const ruleNum = /\d/.test(draft.password);
  const ruleSymOrUpper = /[^a-zA-Z0-9]/.test(draft.password) || /[A-Z]/.test(draft.password);
  const step1Valid = emailValid && ruleLen && ruleNum && ruleSymOrUpper;

  // Track previous rule states to trigger haptics.selection() when they turn true
  const prevLenRef = useRef(ruleLen);
  const prevNumRef = useRef(ruleNum);
  const prevSymRef = useRef(ruleSymOrUpper);

  useEffect(() => {
    if (!prevLenRef.current && ruleLen) haptics.selection();
    prevLenRef.current = ruleLen;
  }, [ruleLen]);

  useEffect(() => {
    if (!prevNumRef.current && ruleNum) haptics.selection();
    prevNumRef.current = ruleNum;
  }, [ruleNum]);

  useEffect(() => {
    if (!prevSymRef.current && ruleSymOrUpper) haptics.selection();
    prevSymRef.current = ruleSymOrUpper;
  }, [ruleSymOrUpper]);

  // Step 2 Derived values
  const ghostHandle = useMemo(() => {
    if (!draft.fullName.trim()) return 'handle';
    return draft.fullName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }, [draft.fullName]);

  const cleanHandle = draft.handle.trim().toLowerCase().replace(/^@/, '');
  const effectiveHandle = cleanHandle || ghostHandle;
  const handleFormatValid = /^[a-z0-9_]{2,20}$/.test(effectiveHandle);
  const handleAvailable = handleFormatValid && isHandleAvailable(effectiveHandle, '');
  const nameValid = draft.fullName.trim().length >= 2;
  const step2Valid = nameValid && handleAvailable;

  // Available tag suggestions
  const availableTagSuggestions = useMemo(() => {
    return SUGGESTED_TAGS.filter((t) => !draft.tags.includes(t));
  }, [draft.tags]);

  // Step 3 Bridges validation
  const bridgesList = draft.bridges && draft.bridges.length > 0 ? draft.bridges : INITIAL_APPLY_DRAFT.bridges;
  const step3Valid = bridgesList.some((b) => {
    if (b.type === 'other') {
      return b.value.trim().length > 0 && (b.customTypeName?.trim() || '').length > 0;
    }
    return b.value.trim().length > 0;
  });

  // Step 4 Validation
  const isInviteMode = draft.entryChoice === 'invite';
  const cleanInviteCode = draft.inviteCode.trim().toUpperCase();
  const step4Valid = isInviteMode ? cleanInviteCode.length >= 3 : true;

  // Photo upload handling with MIME validation, 5MB limit, and image optimization
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoUploadError(null);
    const result = await validateAndOptimizeImage(file, 800);

    if (!result.valid || !result.dataUrl) {
      setPhotoUploadError(result.error || 'Failed to process image.');
      haptics.notification('error');
      return;
    }

    haptics.notification('success');
    updateDraft({ avatarUrl: result.dataUrl });
  };

  // Tag input handling
  const handleAddTag = (raw: string) => {
    const clean = sanitizeText(raw).replace(/^#/, '').toLowerCase();
    if (!clean) return;
    if (draft.tags.includes(clean)) {
      setTagInput('');
      return;
    }
    if (draft.tags.length >= 8) {
      setTagInput('');
      return;
    }
    haptics.selection();
    updateDraft({ tags: [...draft.tags, clean] });
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    haptics.selection();
    updateDraft({ tags: draft.tags.filter((t) => t !== tagToRemove) });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && draft.tags.length > 0) {
      e.preventDefault();
      handleRemoveTag(draft.tags[draft.tags.length - 1]);
    }
  };

  // Step 3 Bridge handlers
  const handleAddBridge = () => {
    haptics.selection();
    const newBridge: ContactBridge = {
      id: `bridge-${Date.now()}`,
      type: 'email',
      value: '',
    };
    updateDraft({ bridges: [...bridgesList, newBridge] });
  };

  const handleUpdateBridge = (id: string, patch: Partial<ContactBridge>) => {
    const updated = bridgesList.map((b) => (b.id === id ? { ...b, ...patch } : b));
    updateDraft({ bridges: updated });
  };

  const handleRemoveBridge = (id: string) => {
    haptics.selection();
    if (bridgesList.length <= 1) return;
    const updated = bridgesList.filter((b) => b.id !== id);
    updateDraft({ bridges: updated });
  };

  // Final submit handler
  const handleFinalSubmit = async () => {
    if (isSubmitting || isSubmitSuccess) return;

    // Rate Limiting Check: Max 3 applications per hour per client
    const rateCheck = checkClientRateLimit('apply', 3);
    if (!rateCheck.allowed) {
      setSubmitError(`Application limit reached. Please wait ${Math.ceil(rateCheck.retryAfterSec / 60)} minutes before submitting again.`);
      haptics.notification('error');
      return;
    }

    setSubmitError(null);
    haptics.impact('medium');
    setIsSubmitting(true);

    const activeSeals = getInviteSeals();
    const matchingSeal = isInviteMode
      ? activeSeals.find((s) => s.code.toUpperCase() === cleanInviteCode && s.status === 'active')
      : null;

    const isCodeValid = isInviteMode && (!!matchingSeal || cleanInviteCode.length >= 3);

    // Sanitize all inputs before saving
    const sanitizedFullName = sanitizeText(draft.fullName);
    const sanitizedHandle = sanitizeText(effectiveHandle).toLowerCase();
    const sanitizedLocation = sanitizeText(draft.location);
    const sanitizedBio = sanitizeText(draft.bio);
    const sanitizedTags = sanitizeStringArray(draft.tags);
    const sanitizedBridges = draft.bridges.map((b) => ({
      ...b,
      customTypeName: b.customTypeName ? sanitizeText(b.customTypeName) : undefined,
      value: sanitizeText(b.value),
    }));

    // Record client submission
    recordClientAction('apply');

    // Save submitted applicant & clear saved draft
    try {
      localStorage.setItem('wg_submitted_applicant_v1', JSON.stringify({
        ...draft,
        fullName: sanitizedFullName,
        handle: sanitizedHandle,
        location: sanitizedLocation,
        bio: sanitizedBio,
        tags: sanitizedTags,
        bridges: sanitizedBridges,
      }));
      localStorage.removeItem(DRAFT_STORAGE_KEY);

      if (isCodeValid) {
        // Mark seal as used if found
        if (matchingSeal) {
          const updatedSeals = activeSeals.map((s) =>
            s.id === matchingSeal.id
              ? { ...s, status: 'used' as const, usedByHandle: sanitizedHandle, usedAt: new Date().toISOString() }
              : s
          );
          saveInviteSeals(updatedSeals);
        }

        // Initialize user profile as verified member
        const newMember: GalleryMember = {
          id: `mem-${sanitizedHandle}`,
          fullName: sanitizedFullName,
          handle: sanitizedHandle,
          location: sanitizedLocation,
          bio: sanitizedBio,
          tags: sanitizedTags,
          availability: draft.availability,
          avatarBg: draft.avatarBg,
          avatarUrl: draft.avatarUrl,
          photos: draft.avatarUrl ? [draft.avatarUrl] : [],
          cohort: 'Cohort 2026',
          bridges: sanitizedBridges.map((b) => ({
            type: b.type,
            label: CHANNEL_CONFIGS[b.type]?.label || b.customTypeName || b.type,
            maskedHint: maskContactValue(b.type, b.value),
            unmaskedValue: b.value,
            isLink: b.type === 'website',
          })),
        };
        saveCurrentUserProfile(newMember);
      } else {
        // Enqueue into pending applicants for curator desk review
        const pendingApplicant: PendingApplicant = {
          id: `app-${Date.now()}`,
          fullName: sanitizedFullName,
          handle: sanitizedHandle,
          location: sanitizedLocation,
          bio: sanitizedBio,
          tags: sanitizedTags,
          availability: draft.availability,
          avatarBg: draft.avatarBg,
          avatarUrl: draft.avatarUrl,
          photos: draft.avatarUrl ? [draft.avatarUrl] : [],
          appliedAt: new Date().toISOString(),
          entryType: isInviteMode ? 'invite' : 'queue',
          status: 'pending',
          bridges: sanitizedBridges.map((b) => ({
            type: b.type,
            label: CHANNEL_CONFIGS[b.type]?.label || b.customTypeName || b.type,
            maskedHint: maskContactValue(b.type, b.value),
            unmaskedValue: b.value,
            isLink: b.type === 'website',
          })),
        };
        const currentPending = getPendingApplicants();
        savePendingApplicants([pendingApplicant, ...currentPending]);
      }
    } catch {
      // Ignore storage errors
    }

    await new Promise((res) => setTimeout(res, 500));

    setIsSubmitting(false);
    setIsSubmitSuccess(true);
    haptics.notification('success');

    const targetRoute = isCodeValid ? '/gallery' : '/waiting';

    setTimeout(() => {
      onNavigate(targetRoute);
    }, 400);
  };

  // Initials for avatar monogram
  const initials = draft.fullName
    ? draft.fullName
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'W';

  return (
    <main
      id="apply-wizard-screen"
      className="relative flex flex-col w-full h-[100dvh] overflow-hidden bg-ios-bg text-ios-text select-none"
    >
      {/* 1. Header with Back Button and Step Counter (FIXED at top of wizard) */}
      <header className="flex flex-col w-full px-5 pt-3 pb-2 flex-shrink-0 z-20 bg-ios-bg">
        <div className="flex items-center justify-between w-full mb-3">
          <button
            type="button"
            onClick={handlePrevStep}
            className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 -ml-2 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 -mr-1" />
            <span>Back</span>
          </button>
          <span className="font-sans text-[13.5px] font-medium text-ios-secondary">
            Step {step} of 4
          </span>
        </div>

        {/* Slim 4-Segment Progress Bar */}
        <div className="grid grid-cols-4 gap-1.5 w-full">
          {[1, 2, 3, 4].map((segIndex) => {
            const isFilled = segIndex <= step;
            return (
              <div
                key={segIndex}
                className="h-1 rounded-full overflow-hidden bg-[#E5E5EA] transition-colors duration-300"
              >
                <motion.div
                  initial={false}
                  animate={{ width: isFilled ? '100%' : '0%' }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  className="h-full bg-ios-forest rounded-full"
                />
              </div>
            );
          })}
        </div>
      </header>

      {/* 2. Step Viewport Container: Scrollable Column with hidden scrollbars */}
      <div
        ref={scrollContainerRef}
        className="relative flex-1 w-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <AnimatePresence mode="popLayout" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={{
              enter: (dir: string) => ({
                x: dir === 'forward' ? '100%' : '-100%',
                opacity: 0.8,
              }),
              center: {
                x: 0,
                opacity: 1,
              },
              exit: (dir: string) => ({
                x: dir === 'forward' ? '-100%' : '100%',
                opacity: 0.8,
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              type: 'spring',
              stiffness: 340,
              damping: 32,
              mass: 0.9,
            }}
            className="w-full px-5 pt-3 pb-8"
          >
            {/* ================= STEP 1: Account Creation ================= */}
            {step === 1 && (
              <div className="flex flex-col w-full">
                <div className="mb-5">
                  <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                    Create your account
                  </h1>
                  <p className="font-sans text-[15px] text-ios-secondary">
                    This is private — only you see this.
                  </p>
                </div>

                {/* Grouped Card: Email + Password */}
                <div className="bg-ios-card rounded-2xl shadow-ios-card border-0 overflow-hidden mb-3">
                  {/* Row 1: Email */}
                  <div className="flex items-center px-4 py-3.5">
                    <input
                      type="email"
                      inputMode="email"
                      value={draft.email}
                      onChange={(e) => updateDraft({ email: e.target.value })}
                      placeholder="Email"
                      autoComplete="username email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/50"
                    />
                  </div>

                  {/* Hairline Divider */}
                  <div className="border-t-[0.5px] border-ios-separator/60 ml-4" />

                  {/* Row 2: Password */}
                  <div className="flex items-center px-4 py-3.5">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={draft.password}
                      onChange={(e) => updateDraft({ password: e.target.value })}
                      placeholder="Password"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setShowPassword((p) => !p);
                      }}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="p-1 -mr-1 text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                    </button>
                  </div>
                </div>

                {/* Live Validation Checklist */}
                <div className="bg-transparent px-1 py-1 space-y-2 mb-6">
                  {/* Check 1 */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors duration-200 ${
                        ruleLen ? 'bg-ios-forest text-white' : 'border border-ios-separator/80 bg-white'
                      }`}
                    >
                      {ruleLen && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`font-sans text-[13px] transition-colors duration-200 ${
                        ruleLen ? 'text-ios-text font-medium' : 'text-ios-secondary'
                      }`}
                    >
                      8+ characters
                    </span>
                  </div>

                  {/* Check 2 */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors duration-200 ${
                        ruleNum ? 'bg-ios-forest text-white' : 'border border-ios-separator/80 bg-white'
                      }`}
                    >
                      {ruleNum && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`font-sans text-[13px] transition-colors duration-200 ${
                        ruleNum ? 'text-ios-text font-medium' : 'text-ios-secondary'
                      }`}
                    >
                      At least one number
                    </span>
                  </div>

                  {/* Check 3 */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors duration-200 ${
                        ruleSymOrUpper ? 'bg-ios-forest text-white' : 'border border-ios-separator/80 bg-white'
                      }`}
                    >
                      {ruleSymOrUpper && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`font-sans text-[13px] transition-colors duration-200 ${
                        ruleSymOrUpper ? 'text-ios-text font-medium' : 'text-ios-secondary'
                      }`}
                    >
                      One symbol or uppercase letter
                    </span>
                  </div>
                </div>

                {/* In-Flow Continue Button (24px below last element) */}
                <div className="pt-2 pb-6 safe-area-bottom">
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!step1Valid}
                    className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed disabled:opacity-30 cursor-pointer transition-all text-center"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 2: Public Profile & Identity ================= */}
            {step === 2 && (
              <div className="flex flex-col w-full">
                <div className="mb-4">
                  <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                    Your public profile
                  </h1>
                  <p className="font-sans text-[15px] text-ios-secondary">
                    This is what other members will see.
                  </p>
                </div>

                {/* 80px Avatar Circle & Curated Swatches */}
                <div className="flex flex-col items-center mb-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => {
                      haptics.impact('light');
                      fileInputRef.current?.click();
                    }}
                    className="relative w-20 h-20 rounded-full shadow-sm cursor-pointer active:scale-95 transition-transform flex items-center justify-center overflow-hidden border-2 border-white"
                    style={{ backgroundColor: draft.avatarUrl ? 'transparent' : draft.avatarBg }}
                  >
                    {draft.avatarUrl ? (
                      <img
                        src={draft.avatarUrl}
                        alt="Profile avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-serif font-bold text-white text-[28px]">
                        {initials}
                      </span>
                    )}

                    {/* Camera Badge */}
                    <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-ios-card shadow-md flex items-center justify-center text-ios-text border border-ios-separator/40">
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="font-sans text-[13px] font-medium text-ios-blue hover:text-ios-blue-pressed mt-1.5 cursor-pointer"
                  >
                    {draft.avatarUrl ? 'Change photo' : 'Upload photo'}
                  </button>

                  {photoUploadError && (
                    <p className="font-sans text-[12px] text-[#DC2626] mt-1 text-center font-medium">
                      {photoUploadError}
                    </p>
                  )}

                  {/* 16-Color Palette Swatch Row with leading padding */}
                  <div className="w-full overflow-x-auto py-2.5 mt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex items-center gap-2.5 px-3 min-w-max">
                      {CURATED_PALETTE.map((color) => {
                        const isSelected = draft.avatarBg === color.hex;
                        return (
                          <button
                            key={color.hex}
                            type="button"
                            onClick={() => {
                              haptics.selection();
                              updateDraft({ avatarBg: color.hex });
                            }}
                            className={`w-6.5 h-6.5 rounded-full transition-all duration-150 cursor-pointer ${
                              isSelected
                                ? 'scale-110 ring-2 ring-ios-text ring-offset-2 ring-offset-ios-bg'
                                : 'hover:scale-105 active:scale-95 opacity-85 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: color.hex }}
                            aria-label={`Select color ${color.name}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Grouped Profile Card */}
                <div className="bg-ios-card rounded-2xl shadow-ios-card border-0 overflow-hidden mb-4">
                  {/* Row 1: Full Name */}
                  <div className="flex items-center px-4 py-3.5">
                    <span className="w-20 font-sans text-[15px] text-ios-secondary flex-shrink-0">
                      Name
                    </span>
                    <input
                      type="text"
                      value={draft.fullName}
                      onChange={(e) => updateDraft({ fullName: e.target.value })}
                      placeholder="e.g. Alex Vance"
                      autoComplete="name"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/40"
                    />
                  </div>

                  <div className="border-t-[0.5px] border-ios-separator/60 ml-4" />

                  {/* Row 2: Handle with ghost suggestion */}
                  <div className="flex items-center px-4 py-3.5">
                    <span className="w-20 font-sans text-[15px] text-ios-secondary flex-shrink-0">
                      Handle
                    </span>
                    <div className="flex items-center w-full">
                      <span className="font-sans text-[16px] text-ios-secondary/70 mr-0.5">@</span>
                      <input
                        type="text"
                        value={draft.handle.replace(/^@/, '')}
                        onChange={(e) =>
                          updateDraft({
                            handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                          })
                        }
                        placeholder={ghostHandle}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/35"
                      />
                      {(cleanHandle || draft.fullName.trim()) && (
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            handleAvailable
                              ? 'bg-[#E8F5E9] text-ios-forest'
                              : 'bg-[#FFEBEE] text-ios-red'
                          }`}
                        >
                          {handleAvailable ? '✓ Available' : '✕ Taken'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border-t-[0.5px] border-ios-separator/60 ml-4" />

                  {/* Row 3: Location */}
                  <div className="flex items-center px-4 py-3.5">
                    <span className="w-20 font-sans text-[15px] text-ios-secondary flex-shrink-0">
                      Location
                    </span>
                    <input
                      type="text"
                      value={draft.location}
                      onChange={(e) => updateDraft({ location: e.target.value })}
                      placeholder="e.g. Kyoto, Japan"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/40"
                    />
                  </div>

                  <div className="border-t-[0.5px] border-ios-separator/60 ml-4" />

                  {/* Row 4: Bio */}
                  <div className="flex flex-col px-4 py-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-sans text-[15px] text-ios-secondary">Bio</span>
                      <span
                        className={`font-sans text-xs ${
                          draft.bio.length > 150 ? 'text-ios-orange font-medium' : 'text-ios-secondary/60'
                        }`}
                      >
                        {draft.bio.length}/160
                      </span>
                    </div>
                    <textarea
                      value={draft.bio}
                      maxLength={160}
                      onChange={(e) => updateDraft({ bio: e.target.value })}
                      placeholder="Craft, perspective, and what you're exploring..."
                      rows={3}
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full bg-transparent border-0 outline-none font-sans text-[15px] text-ios-text placeholder:text-ios-secondary/40 resize-none leading-relaxed"
                    />
                  </div>
                </div>

                {/* Availability Segmented Control with Semantic Tints */}
                <div className="mb-4">
                  <span className="block font-sans text-[13px] font-semibold uppercase tracking-wider text-ios-secondary/80 px-1 mb-2">
                    Availability
                  </span>
                  <div className="bg-[#E5E5EA]/70 p-1 rounded-xl flex items-center justify-between relative">
                    {(['open', 'quiet', 'paused'] as const).map((mode) => {
                      const isSelected = draft.availability === mode;
                      let activeStyle = '';
                      if (isSelected) {
                        if (mode === 'open') activeStyle = 'bg-[#E8F5E9] text-ios-forest shadow-xs font-bold';
                        else if (mode === 'quiet') activeStyle = 'bg-[#FEF3C7] text-[#D97706] shadow-xs font-bold';
                        else if (mode === 'paused') activeStyle = 'bg-[#E5E5EA] text-[#6B7280] shadow-xs font-bold';
                      } else {
                        activeStyle = 'text-ios-secondary hover:text-ios-text';
                      }

                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            haptics.selection();
                            updateDraft({ availability: mode });
                          }}
                          className={`flex-1 py-1.5 text-[14px] font-semibold rounded-lg capitalize transition-all duration-200 cursor-pointer ${activeStyle}`}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={`font-sans text-xs px-1 mt-1.5 transition-colors ${
                      draft.availability === 'open'
                        ? 'text-ios-forest font-medium'
                        : draft.availability === 'quiet'
                        ? 'text-[#D97706] font-medium'
                        : 'text-[#6B7280]'
                    }`}
                  >
                    {draft.availability === 'open' && 'Happy to connect with approved humans.'}
                    {draft.availability === 'quiet' && 'Selective connections only.'}
                    {draft.availability === 'paused' && 'Not accepting new bridges at this time.'}
                  </p>
                </div>

                {/* Craft / Interests Chip Input with Suggestions */}
                <div className="mb-2">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="font-sans text-[13px] font-semibold uppercase tracking-wider text-ios-secondary/80">
                      Craft & Interests
                    </span>
                    <span className="font-sans text-xs text-ios-secondary/60">
                      {draft.tags.length}/8
                    </span>
                  </div>

                  <div className="bg-ios-card rounded-2xl p-3 shadow-ios-card min-h-[56px] flex flex-wrap items-center gap-1.5 mb-2">
                    {draft.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 bg-[#F2F2F7] text-ios-text font-sans font-medium text-[13px] px-2.5 py-1 rounded-full border border-ios-separator/30"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="text-ios-secondary hover:text-ios-text p-0.5 -mr-0.5 active:scale-90"
                          aria-label={`Remove tag ${tag}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    {draft.tags.length < 8 && (
                      <div className="flex items-center flex-1 min-w-[120px]">
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleTagKeyDown}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder={draft.tags.length === 0 ? 'Type craft & press Enter...' : 'Add another...'}
                          className="w-full bg-transparent border-0 outline-none font-sans text-[14px] text-ios-text placeholder:text-ios-secondary/50 py-1 px-1"
                        />
                        {tagInput.trim() && (
                          <button
                            type="button"
                            onClick={() => handleAddTag(tagInput)}
                            className="text-ios-forest p-1 active:scale-90 cursor-pointer"
                          >
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Suggestion Chips */}
                  {availableTagSuggestions.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap px-1 mb-4">
                      <span className="text-xs text-ios-secondary/70 mr-0.5">Suggestions:</span>
                      {availableTagSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => handleAddTag(suggestion)}
                          className="text-xs font-medium text-ios-blue bg-ios-blue/10 hover:bg-ios-blue/15 px-2.5 py-0.5 rounded-full cursor-pointer active:scale-95 transition-all"
                        >
                          +{suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* In-Flow Continue Button */}
                <div className="pt-4 pb-6 safe-area-bottom">
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!step2Valid}
                    className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed disabled:opacity-30 cursor-pointer transition-all text-center"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 3: The Contact Bridge ================= */}
            {step === 3 && (
              <div className="flex flex-col w-full">
                <div className="mb-4">
                  <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                    Contact Bridges
                  </h1>
                  <p className="font-sans text-[15px] text-ios-secondary leading-relaxed">
                    Your actual contact info stays private until you approve a request.
                  </p>
                </div>

                {/* Bridge Cards */}
                <div className="space-y-4 mb-4">
                  {bridgesList.map((bridge, index) => {
                    const config = CHANNEL_CONFIGS[bridge.type];
                    const maskedPreview = maskContactValue(bridge.type, bridge.value);

                    return (
                      <div
                        key={bridge.id}
                        className="bg-ios-card rounded-2xl p-4 shadow-ios-card border-0 space-y-3"
                      >
                        {/* Header: Channel Label & Remove */}
                        <div className="flex items-center justify-between">
                          <span className="font-sans text-[13px] font-bold uppercase tracking-wider text-ios-secondary/80">
                            Bridge {index + 1}
                          </span>
                          {bridgesList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveBridge(bridge.id)}
                              className="text-xs font-semibold text-ios-red hover:opacity-80 active:scale-95 cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        {/* Channel Selection Chips (Wrap Grid) */}
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_CHANNELS.map((ch) => {
                            const isSelected = bridge.type === ch;
                            const chConfig = CHANNEL_CONFIGS[ch];
                            return (
                              <button
                                key={ch}
                                type="button"
                                onClick={() => {
                                  haptics.selection();
                                  handleUpdateBridge(bridge.id, { type: ch });
                                }}
                                className={`text-[12.5px] font-semibold px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-ios-forest text-white shadow-xs'
                                    : 'bg-[#F2F2F7] text-ios-secondary hover:text-ios-text'
                                }`}
                              >
                                {chConfig.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* If 'Other', custom channel name */}
                        {bridge.type === 'other' && (
                          <div className="bg-ios-bg rounded-xl px-3.5 py-2.5">
                            <span className="block text-[11px] font-bold text-ios-secondary uppercase mb-0.5">
                              Channel Name
                            </span>
                            <input
                              type="text"
                              value={bridge.customTypeName || ''}
                              onChange={(e) =>
                                handleUpdateBridge(bridge.id, { customTypeName: e.target.value })
                              }
                              placeholder="e.g. Snapchat, Mastodon, Matrix"
                              autoCorrect="off"
                              spellCheck={false}
                              className="w-full bg-transparent border-0 outline-none font-sans text-[15px] text-ios-text placeholder:text-ios-secondary/40"
                            />
                          </div>
                        )}

                        {/* Value Input */}
                        <div className="bg-ios-bg rounded-xl px-3.5 py-2.5">
                          <span className="block text-[11px] font-bold text-ios-secondary uppercase mb-0.5">
                            {config.label} Value
                          </span>
                          <input
                            type={bridge.type === 'email' ? 'email' : 'text'}
                            value={bridge.value}
                            onChange={(e) => handleUpdateBridge(bridge.id, { value: e.target.value })}
                            placeholder={config.placeholder}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className="w-full bg-transparent border-0 outline-none font-sans text-[15px] text-ios-text placeholder:text-ios-secondary/40"
                          />
                        </div>

                        {/* Live Masked Preview Box */}
                        <div className="bg-[#E8F5E9]/50 border border-[#2D6A4F]/15 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-ios-forest flex-shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-ios-forest/80 uppercase">
                                Public Mask Preview
                              </span>
                              <span className="font-mono text-[14px] font-medium text-ios-text">
                                {maskedPreview}
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-ios-forest bg-white/80 px-2 py-0.5 rounded-md border border-[#2D6A4F]/20">
                            Masked
                          </span>
                        </div>

                        {/* Dynamic Launch vs Copy Caption */}
                        <p className="font-sans text-[12px] text-ios-secondary px-0.5">
                          {config.isLaunch
                            ? `Opens in ${config.appName} when approved.`
                            : 'Members tap to copy when approved.'}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Add Another Bridge Blue Link */}
                <div className="flex justify-start mb-6 px-1">
                  <button
                    type="button"
                    onClick={handleAddBridge}
                    className="inline-flex items-center gap-1 font-sans text-[14.5px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add another bridge</span>
                  </button>
                </div>

                {/* In-Flow Continue Button */}
                <div className="pt-2 pb-6 safe-area-bottom">
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!step3Valid}
                    className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed disabled:opacity-30 cursor-pointer transition-all text-center"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 4: The Threshold (The Choice) ================= */}
            {step === 4 && (
              <div className="flex flex-col w-full">
                <div className="mb-4">
                  <h1 className="font-sans text-[32px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
                    Almost there
                  </h1>
                  <p className="font-sans text-[15px] text-ios-secondary">
                    Choose how you enter the registry.
                  </p>
                </div>

                {/* Choice 1: Direct Invitation */}
                <div
                  onClick={() => {
                    haptics.selection();
                    updateDraft({ entryChoice: 'invite' });
                  }}
                  className={`bg-ios-card rounded-2xl p-4 shadow-ios-card border-2 cursor-pointer transition-all duration-200 mb-3 ${
                    isInviteMode ? 'border-ios-forest bg-[#E8F5E9]/10' : 'border-transparent hover:border-ios-separator/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isInviteMode ? 'bg-ios-forest text-white' : 'bg-ios-bg text-ios-secondary'
                      }`}
                    >
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h2 className="font-sans text-[16px] font-bold text-ios-text">
                          Direct Invitation
                        </h2>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isInviteMode ? 'border-ios-forest bg-ios-forest text-white' : 'border-ios-separator bg-white'
                          }`}
                        >
                          {isInviteMode && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                      <p className="font-sans text-[13.5px] text-ios-secondary mt-0.5 leading-relaxed">
                        Enter with a member&apos;s seal for instant access.
                      </p>
                    </div>
                  </div>

                  {/* Unfurl Code Input if selected */}
                  {isInviteMode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.2 }}
                      className="mt-3.5 pt-3 border-t border-ios-separator/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="block text-[11px] font-bold text-ios-secondary uppercase mb-1">
                        Invitation Seal Code
                      </span>
                      <div className="relative">
                        <input
                          type="text"
                          value={draft.inviteCode}
                          onChange={(e) => updateDraft({ inviteCode: e.target.value.toUpperCase() })}
                          placeholder="e.g. WORLD2026"
                          autoCapitalize="characters"
                          autoCorrect="off"
                          spellCheck={false}
                          className="w-full bg-ios-bg border border-transparent focus:border-ios-forest rounded-xl py-3 px-4 font-mono font-semibold text-[16px] text-ios-text placeholder:text-ios-secondary/40 outline-none uppercase tracking-wider"
                        />
                        {cleanInviteCode.length >= 3 && (
                          <span className="absolute right-3 top-3 text-xs font-semibold text-ios-forest bg-[#E8F5E9] px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Valid Seal
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Choice 2: The Daily Cohort (Waiting Room) */}
                <div
                  onClick={() => {
                    haptics.selection();
                    updateDraft({ entryChoice: 'waiting' });
                  }}
                  className={`bg-ios-card rounded-2xl p-4 shadow-ios-card border-2 cursor-pointer transition-all duration-200 mb-5 ${
                    !isInviteMode ? 'border-ios-forest bg-[#E8F5E9]/10' : 'border-transparent hover:border-ios-separator/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        !isInviteMode ? 'bg-ios-forest text-white' : 'bg-ios-bg text-ios-secondary'
                      }`}
                    >
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h2 className="font-sans text-[16px] font-bold text-ios-text">
                          The Daily Cohort
                        </h2>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            !isInviteMode ? 'border-ios-forest bg-ios-forest text-white' : 'border-ios-separator bg-white'
                          }`}
                        >
                          {!isInviteMode && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                      <p className="font-sans text-[13.5px] text-ios-secondary mt-0.5 leading-relaxed">
                        Reviewed by the Curator. Ten humans welcomed daily.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quiet Curator Callout */}
                <div className="bg-ios-card/70 rounded-2xl p-3.5 border border-ios-separator/40 flex items-start gap-2.5 mb-6">
                  <ShieldCheck className="w-5 h-5 text-ios-forest flex-shrink-0 mt-0.5" />
                  <p className="font-sans text-[13px] text-ios-secondary leading-relaxed">
                    World Gallery is curated by humans, for humans. No algorithms, no ads.
                  </p>
                </div>

                {submitError && (
                  <div className="mb-4 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl p-3 text-[13px] text-[#991B1B] text-center font-medium">
                    {submitError}
                  </div>
                )}

                {/* In-Flow Submit Application Button */}
                <div className="pt-2 pb-6 safe-area-bottom">
                  <button
                    type="button"
                    id="btn-submit-application"
                    onClick={handleFinalSubmit}
                    disabled={!step4Valid || isSubmitting || isSubmitSuccess}
                    className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed disabled:opacity-30 cursor-pointer transition-all flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isSubmitSuccess ? (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      >
                        <Check className="w-5 h-5 text-white stroke-[3]" />
                      </motion.div>
                    ) : (
                      'Submit Application'
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 3. Resume Application iOS Bottom Sheet */}
      <AnimatePresence>
        {showResumePrompt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleStartOver}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-ios-card rounded-t-[20px] shadow-ios-sheet px-6 pt-3 pb-6 max-w-md mx-auto safe-area-bottom"
            >
              <div className="w-9 h-1 bg-ios-separator rounded-full mx-auto mt-0.5 mb-3" />
              <h2 className="font-sans text-[18px] font-bold text-ios-text text-center tracking-tight mb-1">
                Welcome Back
              </h2>
              <p className="font-sans text-[13.5px] text-ios-secondary text-center max-w-[270px] mx-auto mb-5 leading-relaxed">
                You have an unfinished application saved on this device. Would you like to resume?
              </p>
              <div className="flex flex-col gap-3 pb-2">
                <button
                  type="button"
                  onClick={handleResumeDraft}
                  className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed transition-all cursor-pointer text-center"
                >
                  Resume Application
                </button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="w-full bg-[#E5E5EA]/80 hover:bg-[#E5E5EA] text-ios-secondary hover:text-ios-text font-sans font-semibold text-[15px] py-3.5 px-6 rounded-ios-pill active:scale-[0.98] transition-all cursor-pointer text-center"
                >
                  Start Over
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
