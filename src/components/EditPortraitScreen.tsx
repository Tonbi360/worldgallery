'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Camera,
  X,
  Plus,
  Check,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Coffee,
  Bell,
  Sparkles,
  Phone,
  Mail,
  Globe,
  Instagram,
  Send,
  MessageSquare,
  Radio,
  Eye,
  Trash2,
  Edit2,
  QrCode,
  Share2,
} from 'lucide-react';
import { BrandLoader } from './BrandLoader';
import { haptics } from '../lib/haptics';
import {
  GalleryMember,
  ContactBridge,
} from '../types/gallery';
import {
  CURATED_PALETTE,
  CHANNEL_CONFIGS,
  ContactChannelType,
} from '../types/apply';
import {
  getCurrentUserProfile,
  saveCurrentUserProfile,
  maskContactValue,
  isHandleAvailable,
} from '../lib/userProfile';
import { Skeleton, ErrorCard } from './StatesSystem';
import {
  validateAndOptimizeImage,
  sanitizeText,
  sanitizeStringArray,
} from '../lib/security';

interface EditPortraitScreenProps {
  onNavigate: (path: string) => void;
  onBack: () => void;
}

const SUGGESTED_TAGS = ['ceramics', 'woodworking', 'type design', 'sound', 'writing', 'code'];

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

function getChannelIcon(type: string) {
  switch (type) {
    case 'whatsapp':
    case 'phone':
      return <Phone className="w-4 h-4 text-emerald-600" />;
    case 'telegram':
      return <Send className="w-4 h-4 text-sky-500" />;
    case 'signal':
      return <MessageSquare className="w-4 h-4 text-blue-600" />;
    case 'instagram':
      return <Instagram className="w-4 h-4 text-pink-600" />;
    case 'discord':
      return <MessageSquare className="w-4 h-4 text-indigo-500" />;
    case 'email':
      return <Mail className="w-4 h-4 text-amber-600" />;
    case 'website':
      return <Globe className="w-4 h-4 text-teal-600" />;
    default:
      return <Radio className="w-4 h-4 text-ios-secondary" />;
  }
}

export default function EditPortraitScreen({
  onNavigate,
  onBack,
}: EditPortraitScreenProps) {
  // Load State
  const [initialLoading, setInitialLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initial Snapshot vs Active Form State
  const [initialProfile, setInitialProfile] = useState<GalleryMember | null>(null);
  const [form, setForm] = useState<GalleryMember | null>(null);

  // File input refs for Photo Slots
  const primaryFileInputRef = useRef<HTMLInputElement>(null);
  const secondaryFileInputRef = useRef<HTMLInputElement>(null);

  // Tag input state
  const [customTagInput, setCustomTagInput] = useState('');

  // Bridge Editor Modal state
  const [editingBridgeIndex, setEditingBridgeIndex] = useState<number | null>(null);
  const [isAddingBridge, setIsAddingBridge] = useState(false);
  const [bridgeDraftType, setBridgeDraftType] = useState<ContactChannelType>('email');
  const [bridgeDraftValue, setBridgeDraftValue] = useState('');
  const [removingBridgeIndex, setRemovingBridgeIndex] = useState<number | null>(null);

  // Preferences state
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [passCopied, setPassCopied] = useState(false);

  // Save UI State
  const [isSaving, setIsSaving] = useState(false);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  // 1. Initial Load & Skeleton Simulation
  const sessionInfo = useMemo(() => {
    if (typeof window === 'undefined') return { name: '', handle: '', isCurator: false, memberNumber: '' };
    try {
      const raw = localStorage.getItem('wg_user_session');
      const session = raw ? JSON.parse(raw) : null;
      const isCurator =
        session?.role === 'curator' ||
        localStorage.getItem('wg_curator_session_authenticated') === 'true' ||
        localStorage.getItem('wg_admin_session_authenticated') === 'true';
      return {
        name: session?.name || (isCurator ? 'Tonbara Timinipre Destiny' : ''),
        handle: (session?.handle || (isCurator ? 'tonbi360' : '')).replace(/^@/, ''),
        isCurator,
        memberNumber: session?.member_number || session?.memberNumber || (isCurator ? '#0001' : ''),
      };
    } catch {
      return { name: '', handle: '', isCurator: false, memberNumber: '' };
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const profile = getCurrentUserProfile();
      const initialized = {
        ...profile,
        fullName: profile.fullName || sessionInfo.name || (sessionInfo.isCurator ? 'Tonbara Timinipre Destiny' : ''),
        handle: profile.handle || sessionInfo.handle || (sessionInfo.isCurator ? 'tonbi360' : ''),
        cohort: profile.cohort || (sessionInfo.isCurator ? 'Founder & Curator' : 'Cohort 2026'),
        memberNumber: profile.memberNumber || sessionInfo.memberNumber || (sessionInfo.isCurator ? '#0001' : ''),
      };
      setInitialProfile(JSON.parse(JSON.stringify(initialized)));
      setForm(JSON.parse(JSON.stringify(initialized)));
      setInitialLoading(false);
    }, 320);

    // Check real notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }

    return () => clearTimeout(timer);
  }, []);

  // 2. Dirty Check: form vs initialProfile
  const isDirty = useMemo(() => {
    if (!initialProfile || !form) return false;
    return JSON.stringify(initialProfile) !== JSON.stringify(form);
  }, [initialProfile, form]);

  // 3. Handle Availability
  const handleAvailability = useMemo(() => {
    if (!form || !initialProfile) return true;
    return isHandleAvailable(form.handle, initialProfile.handle);
  }, [form, initialProfile]);

  // 4. Bio character counter
  const bioCount = form?.bio?.length || 0;

  // Handlers for Photo upload with validation and optimization
  const handlePhotoUpload = async (slot: 'primary' | 'secondary', file: File) => {
    setSaveError(null);
    const result = await validateAndOptimizeImage(file, slot === 'primary' ? 800 : 1200);

    if (!result.valid || !result.dataUrl) {
      setSaveError(result.error || 'Failed to process photo.');
      haptics.notification('error');
      return;
    }

    if (!form) return;
    haptics.impact('medium');

    if (slot === 'primary') {
      const photos = [...(form.photos || [])];
      photos[0] = result.dataUrl;
      setForm({
        ...form,
        avatarUrl: result.dataUrl,
        photos,
      });
    } else {
      const photos = [...(form.photos || [])];
      photos[1] = result.dataUrl;
      setForm({
        ...form,
        photos,
      });
    }
  };

  const handleRemovePhoto = (slot: 'primary' | 'secondary') => {
    if (!form) return;
    haptics.impact('light');
    const photos = [...(form.photos || [])];
    if (slot === 'primary') {
      photos.splice(0, 1);
      setForm({
        ...form,
        avatarUrl: photos[0] || '',
        photos,
      });
    } else {
      if (photos.length > 1) {
        photos.splice(1, 1);
      }
      setForm({
        ...form,
        photos,
      });
    }
  };

  // Handlers for Tags
  const handleAddTag = (tagToAdd: string) => {
    const clean = tagToAdd.trim().toLowerCase().replace(/^#/, '');
    if (!clean || !form) return;
    if (form.tags.includes(clean)) return;

    haptics.selection();
    setForm({
      ...form,
      tags: [...form.tags, clean],
    });
    setCustomTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!form) return;
    haptics.selection();
    setForm({
      ...form,
      tags: form.tags.filter((t) => t !== tagToRemove),
    });
  };

  const handleToggleSuggestionTag = (tag: string) => {
    if (!form) return;
    haptics.selection();
    if (form.tags.includes(tag)) {
      setForm({
        ...form,
        tags: form.tags.filter((t) => t !== tag),
      });
    } else {
      setForm({
        ...form,
        tags: [...form.tags, tag],
      });
    }
  };

  // Handlers for Bridges
  const handleOpenEditBridge = (index: number) => {
    if (!form?.bridges?.[index]) return;
    const b = form.bridges[index];
    setBridgeDraftType(b.type as ContactChannelType);
    setBridgeDraftValue(b.unmaskedValue || b.maskedHint || '');
    setEditingBridgeIndex(index);
    setIsAddingBridge(false);
    haptics.impact('light');
  };

  const handleOpenAddBridge = () => {
    setBridgeDraftType('email');
    setBridgeDraftValue('');
    setEditingBridgeIndex(null);
    setIsAddingBridge(true);
    haptics.impact('light');
  };

  const handleSaveBridgeModal = () => {
    if (!form || !bridgeDraftValue.trim()) return;
    haptics.impact('medium');

    const config = CHANNEL_CONFIGS[bridgeDraftType] || { label: 'Bridge' };
    const masked = maskContactValue(bridgeDraftType, bridgeDraftValue);
    const newBridge: ContactBridge = {
      type: bridgeDraftType,
      label: config.label,
      maskedHint: masked,
      unmaskedValue: bridgeDraftValue.trim(),
      isLink: bridgeDraftType === 'website',
    };

    const bridges = [...(form.bridges || [])];
    if (editingBridgeIndex !== null) {
      bridges[editingBridgeIndex] = newBridge;
    } else {
      bridges.push(newBridge);
    }

    setForm({ ...form, bridges });
    setEditingBridgeIndex(null);
    setIsAddingBridge(false);
    setBridgeDraftValue('');
  };

  const handleConfirmRemoveBridge = (index: number) => {
    if (!form || (form.bridges && form.bridges.length <= 1)) return;
    haptics.impact('medium');
    const bridges = [...(form.bridges || [])];
    bridges.splice(index, 1);
    setForm({ ...form, bridges });
    setRemovingBridgeIndex(null);
  };

  // Notifications toggle
  const handleToggleNotifications = async () => {
    haptics.selection();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        // Toggle display state
        setNotificationsEnabled(!notificationsEnabled);
      } else {
        try {
          const res = await Notification.requestPermission();
          setNotificationsEnabled(res === 'granted');
        } catch {
          setNotificationsEnabled(!notificationsEnabled);
        }
      }
    } else {
      setNotificationsEnabled(!notificationsEnabled);
    }
  };

  // Discard changes
  const handleDiscard = () => {
    if (!initialProfile) return;
    haptics.impact('light');
    setForm(JSON.parse(JSON.stringify(initialProfile)));
    setSaveError(null);
  };

  // Save changes
  const handleSave = async () => {
    if (!form || !handleAvailability) return;
    setIsSaving(true);
    setSaveError(null);
    haptics.impact('medium');

    try {
      // Sanitize all profile fields
      const sanitizedForm: GalleryMember = {
        ...form,
        fullName: sanitizeText(form.fullName),
        handle: sanitizeText(form.handle).toLowerCase().replace(/^@/, ''),
        location: sanitizeText(form.location),
        bio: sanitizeText(form.bio),
        tags: sanitizeStringArray(form.tags),
        bridges: form.bridges?.map((b) => ({
          ...b,
          label: sanitizeText(b.label),
          maskedHint: sanitizeText(b.maskedHint),
          unmaskedValue: b.unmaskedValue ? sanitizeText(b.unmaskedValue) : undefined,
        })),
      };

      // Clean async storage write
      await new Promise((resolve) => setTimeout(resolve, 350));
      saveCurrentUserProfile(sanitizedForm);
      setForm(sanitizedForm);
      setInitialProfile(JSON.parse(JSON.stringify(sanitizedForm)));

      setIsSaving(false);
      setIsSavedSuccess(true);
      haptics.notification('success');

      setTimeout(() => {
        setIsSavedSuccess(false);
      }, 1500);
    } catch (err: any) {
      setIsSaving(false);
      setSaveError(err?.message || 'Failed to save portrait changes. Please retry.');
      haptics.notification('error');
    }
  };

  return (
    <main
      id="edit-portrait-screen"
      className="relative flex flex-col w-full h-[100dvh] bg-ios-bg text-ios-text select-none overflow-hidden"
    >
      {/* 1. Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between w-full px-4 pt-3 pb-2.5 bg-ios-bg/95 backdrop-blur-md max-w-lg mx-auto border-b border-ios-separator/30 flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            onBack();
          }}
          className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 -ml-1 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -mr-1" />
          <span>Gallery</span>
        </button>

        <div className="flex items-center gap-2">
          {form?.memberNumber && (
            <span className="font-mono text-[11px] font-bold text-ios-forest bg-[#E8F5E9] px-2 py-0.5 rounded-full border border-ios-forest/20">
              {form.memberNumber}
            </span>
          )}
        </div>
      </header>

      {/* 2. Scrollable Body Content */}
      <div className="relative flex-1 w-full overflow-y-auto overflow-x-hidden px-4 pt-3 pb-36 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-contain touch-pan-y max-w-lg mx-auto space-y-6">
        {/* Large Title & Quiet Subtitle */}
        <div className="pt-1 space-y-1">
          <h1 className="font-sans text-[30px] sm:text-[32px] font-extrabold tracking-tight text-ios-text leading-tight">
            Edit Portrait
          </h1>
          <p className="font-sans text-[13.5px] text-ios-secondary leading-relaxed">
            Your presence in the gallery. Changes reflect across all active bridges.
          </p>
        </div>

        {saveError && (
          <ErrorCard
            title="Unable to update portrait"
            message={saveError}
            onRetry={handleSave}
          />
        )}

        {initialLoading || !form ? (
          /* Shimmer Skeleton on Load */
          <div className="space-y-4 pt-2">
            <div className="bg-ios-card rounded-2xl p-5 space-y-4 shadow-ios-card">
              <Skeleton className="w-28 h-4" />
              <div className="flex items-center gap-4">
                <Skeleton className="w-20 h-20 rounded-full" />
                <Skeleton className="w-20 h-20 rounded-2xl" />
              </div>
              <Skeleton className="w-full h-8 rounded-full" />
            </div>
            <div className="bg-ios-card rounded-2xl p-5 space-y-3 shadow-ios-card">
              <Skeleton className="w-32 h-4" />
              <Skeleton className="w-full h-10 rounded-xl" />
              <Skeleton className="w-full h-10 rounded-xl" />
              <Skeleton className="w-full h-24 rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* ========================================================= */}
            {/* CARD 1 — PHOTOS & SEAL                                    */}
            {/* ========================================================= */}
            <section
              aria-label="Photos and Seal"
              className="bg-ios-card rounded-2xl p-4 sm:p-5 shadow-ios-card space-y-4"
            >
              <div className="flex items-center justify-between border-b border-ios-separator/30 pb-2.5">
                <span className="font-sans font-bold text-[13px] uppercase tracking-wider text-ios-secondary">
                  Photos & Seal
                </span>
                <span className="font-sans text-[12px] text-ios-secondary">
                  Primary + Secondary
                </span>
              </div>

              {/* Photo Slots */}
              <div className="flex items-center gap-4 pt-1">
                {/* Slot 1: Primary Avatar */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={() => primaryFileInputRef.current?.click()}
                      style={{ backgroundColor: form.avatarBg || '#2D6A4F' }}
                      className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-white font-serif text-2xl font-bold shadow-md ring-2 ring-ios-card hover:opacity-90 active:scale-95 transition-all cursor-pointer relative"
                    >
                      {form.avatarUrl ? (
                        <img
                          src={form.avatarUrl}
                          alt="Primary Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>
                          {form.fullName
                            ? form.fullName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()
                            : 'WG'}
                        </span>
                      )}

                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    </button>

                    {form.avatarUrl && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto('primary');
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black active:scale-90 transition-all cursor-pointer shadow-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <span className="font-sans text-[11.5px] font-semibold text-ios-forest">
                    Primary
                  </span>
                  <input
                    ref={primaryFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload('primary', file);
                    }}
                  />
                </div>

                {/* Slot 2: Secondary Photo (Optional) */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="relative group">
                    <button
                      type="button"
                      onClick={() => secondaryFileInputRef.current?.click()}
                      className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-dashed border-ios-separator/70 bg-[#F2F2F7] flex items-center justify-center text-ios-secondary hover:border-ios-forest/50 active:scale-95 transition-all cursor-pointer relative"
                    >
                      {form.photos && form.photos[1] ? (
                        <img
                          src={form.photos[1]}
                          alt="Secondary Studio Portrait"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-ios-secondary/70">
                          <Plus className="w-5 h-5" />
                          <span className="text-[10px] font-sans">Add photo</span>
                        </div>
                      )}

                      {form.photos && form.photos[1] && (
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </button>

                    {form.photos && form.photos[1] && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto('secondary');
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black active:scale-90 transition-all cursor-pointer shadow-xs"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <span className="font-sans text-[11.5px] text-ios-secondary">
                    Secondary (opt)
                  </span>
                  <input
                    ref={secondaryFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload('secondary', file);
                    }}
                  />
                </div>
              </div>

              {/* 16 Swatches Row */}
              <div className="space-y-2 pt-2 border-t border-ios-separator/30">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[12.5px] font-medium text-ios-secondary">
                    Seal Silhouette Background
                  </span>
                  <span className="font-mono text-[11px] text-ios-secondary">
                    {CURATED_PALETTE.find((p) => p.hex === form.avatarBg)?.name || 'Custom'}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 overflow-x-auto py-1 px-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {CURATED_PALETTE.map((swatch) => {
                    const isSelected = form.avatarBg === swatch.hex;
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setForm({ ...form, avatarBg: swatch.hex });
                        }}
                        style={{ backgroundColor: swatch.hex }}
                        className={`w-7 h-7 rounded-full flex-shrink-0 transition-transform active:scale-90 cursor-pointer shadow-2xs ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-ios-forest scale-110'
                            : 'hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                        title={swatch.name}
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ========================================================= */}
            {/* CARD 2 — IDENTITY                                         */}
            {/* ========================================================= */}
            <section
              aria-label="Identity"
              className="bg-ios-card rounded-2xl p-4 sm:p-5 shadow-ios-card space-y-4"
            >
              <div className="border-b border-ios-separator/30 pb-2.5">
                <span className="font-sans font-bold text-[13px] uppercase tracking-wider text-ios-secondary">
                  Identity
                </span>
              </div>

              {/* Full Name */}
              <div className="space-y-1">
                <label
                  htmlFor="field-fullname"
                  className="font-sans text-[12px] font-semibold text-ios-secondary uppercase tracking-wider block"
                >
                  Full Name
                </label>
                <input
                  id="field-fullname"
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="e.g. Tonbara Destiny"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F2F2F7] border border-transparent focus:border-ios-forest focus:bg-white text-ios-text font-sans text-[15px] outline-none transition-all"
                />
              </div>

              {/* Handle with Live Availability */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="field-handle"
                    className="font-sans text-[12px] font-semibold text-ios-secondary uppercase tracking-wider"
                  >
                    Handle
                  </label>
                  {form.handle.trim() && (
                    <span
                      className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        handleAvailability
                          ? 'bg-[#E8F5E9] text-ios-forest'
                          : 'bg-[#FEE2E2] text-[#DC2626]'
                      }`}
                    >
                      {handleAvailability ? '✓ Available' : '✕ Taken'}
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <span className="absolute left-3.5 font-mono text-[15px] text-ios-secondary select-none">
                    @
                  </span>
                  <input
                    id="field-handle"
                    type="text"
                    value={form.handle.replace(/^@/, '')}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                      })
                    }
                    placeholder="handle"
                    className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-[#F2F2F7] border ${
                      !handleAvailability ? 'border-[#DC2626] bg-red-50/50' : 'border-transparent'
                    } focus:border-ios-forest focus:bg-white text-ios-text font-mono text-[15px] outline-none transition-all`}
                  />
                </div>
                <p className="font-sans text-[12px] text-ios-secondary pt-0.5">
                  Your handle is your seal across the gallery.
                </p>
              </div>

              {/* Location */}
              <div className="space-y-1">
                <label
                  htmlFor="field-location"
                  className="font-sans text-[12px] font-semibold text-ios-secondary uppercase tracking-wider block"
                >
                  Location
                </label>
                <input
                  id="field-location"
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="City, Country"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F2F2F7] border border-transparent focus:border-ios-forest focus:bg-white text-ios-text font-sans text-[15px] outline-none transition-all"
                />
              </div>

              {/* Bio & Live n/160 Counter */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="field-bio"
                    className="font-sans text-[12px] font-semibold text-ios-secondary uppercase tracking-wider"
                  >
                    Statement & Craft Bio
                  </label>
                  <span
                    className={`font-mono text-[11px] ${
                      bioCount > 160 ? 'text-[#DC2626] font-bold' : 'text-ios-secondary'
                    }`}
                  >
                    {bioCount}/160
                  </span>
                </div>
                <textarea
                  id="field-bio"
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Describe your craft, materials, or research focus in quiet words..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F2F2F7] border border-transparent focus:border-ios-forest focus:bg-white text-ios-text font-sans text-[14.5px] leading-relaxed outline-none resize-none transition-all"
                />
              </div>
            </section>

            {/* ========================================================= */}
            {/* CARD 3 — CRAFT                                            */}
            {/* ========================================================= */}
            <section
              aria-label="Craft and Interests"
              className="bg-ios-card rounded-2xl p-4 sm:p-5 shadow-ios-card space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-ios-separator/30 pb-2.5">
                <span className="font-sans font-bold text-[13px] uppercase tracking-wider text-ios-secondary">
                  Craft & Disciplines
                </span>
                <span className="font-sans text-[12px] text-ios-secondary">
                  {form.tags.length} selected
                </span>
              </div>

              {/* Active Tag Chips */}
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {form.tags.length === 0 ? (
                  <span className="font-sans text-[13px] text-ios-secondary italic">
                    No disciplines selected yet.
                  </span>
                ) : (
                  form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ios-forest text-white font-sans text-[13px] font-medium shadow-2xs"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:opacity-75 active:scale-90 cursor-pointer"
                        aria-label={`Remove ${tag}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Custom Tag Input */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag(customTagInput);
                    }
                  }}
                  placeholder="Add custom discipline (press Enter)..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#F2F2F7] border border-transparent focus:border-ios-forest focus:bg-white text-ios-text font-sans text-[13.5px] outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag(customTagInput)}
                  disabled={!customTagInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-[#E5E5EA] disabled:opacity-40 text-ios-text font-sans text-[13px] font-semibold active:bg-[#D1D1D6] transition-colors cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Suggested Pills */}
              <div className="space-y-1.5 pt-2 border-t border-ios-separator/20">
                <span className="font-sans text-[11.5px] text-ios-secondary block">
                  Suggestions:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.map((tag) => {
                    const isSelected = form.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleSuggestionTag(tag)}
                        className={`px-2.5 py-1 rounded-full font-sans text-[12px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-ios-forest/15 text-ios-forest border border-ios-forest/30'
                            : 'bg-[#F2F2F7] text-ios-secondary hover:text-ios-text border border-transparent'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ========================================================= */}
            {/* CARD 4 — AVAILABILITY                                     */}
            {/* ========================================================= */}
            <section
              aria-label="Availability Status"
              className="bg-ios-card rounded-2xl p-4 sm:p-5 shadow-ios-card space-y-3.5"
            >
              <div className="border-b border-ios-separator/30 pb-2.5">
                <span className="font-sans font-bold text-[13px] uppercase tracking-wider text-ios-secondary">
                  Availability
                </span>
              </div>

              {/* Segmented Control */}
              <div className="p-1 rounded-xl bg-[#F2F2F7] flex items-center gap-1 border border-ios-separator/30">
                {(['open', 'quiet', 'paused'] as const).map((mode) => {
                  const isSelected = form.availability === mode;
                  const label = mode === 'open' ? 'Open' : mode === 'quiet' ? 'Quiet' : 'Paused';
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setForm({ ...form, availability: mode });
                      }}
                      className={`flex-1 py-2 rounded-lg font-sans text-[13.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? mode === 'open'
                            ? 'bg-[#E8F5E9] text-[#1B4D3E] shadow-2xs'
                            : mode === 'quiet'
                            ? 'bg-[#FEF3C7] text-[#B45309] shadow-2xs'
                            : 'bg-[#E5E5EA] text-ios-text shadow-2xs'
                          : 'text-ios-secondary hover:text-ios-text'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          mode === 'open'
                            ? 'bg-[#2D6A4F]'
                            : mode === 'quiet'
                            ? 'bg-[#D97706]'
                            : 'bg-[#6B7280]'
                        }`}
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Captions */}
              <p className="font-sans text-[13px] text-ios-secondary px-1 italic">
                {form.availability === 'open' && '“Happy to connect with approved humans.”'}
                {form.availability === 'quiet' && '“Selective only.”'}
                {form.availability === 'paused' && '“Not available now.”'}
              </p>
            </section>

            {/* ========================================================= */}
            {/* CARD 5 — BRIDGES                                          */}
            {/* ========================================================= */}
            <section
              aria-label="Bridges and Coordinates"
              className="bg-ios-card rounded-2xl p-4 sm:p-5 shadow-ios-card space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-ios-separator/30 pb-2.5">
                <span className="font-sans font-bold text-[13px] uppercase tracking-wider text-ios-secondary">
                  Bridges
                </span>
                <span className="font-sans text-[12px] text-ios-secondary">
                  {form.bridges?.length || 0} active
                </span>
              </div>

              {/* Bridges List */}
              <div className="space-y-2.5">
                {form.bridges && form.bridges.length > 0 ? (
                  form.bridges.map((bridge, idx) => {
                    const isConfirmingRemove = removingBridgeIndex === idx;
                    const canRemove = form.bridges && form.bridges.length > 1;

                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-[#F2F2F7] border border-ios-separator/30 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-white shadow-2xs flex items-center justify-center flex-shrink-0">
                              {getChannelIcon(bridge.type)}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-sans font-semibold text-[13.5px] text-ios-text truncate">
                                {bridge.label}
                              </span>
                              <span className="font-mono text-[12px] text-ios-secondary truncate">
                                {bridge.maskedHint || maskContactValue(bridge.type, bridge.unmaskedValue || '')}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenEditBridge(idx)}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#E5E5EA] text-ios-text font-sans text-[12px] font-medium shadow-2xs transition-colors cursor-pointer"
                            >
                              Edit
                            </button>

                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => {
                                  haptics.selection();
                                  setRemovingBridgeIndex(isConfirmingRemove ? null : idx);
                                }}
                                className="p-1 rounded-lg text-ios-secondary hover:text-[#DC2626] transition-colors cursor-pointer"
                                aria-label="Remove Bridge"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline Remove Confirmation */}
                        <AnimatePresence>
                          {isConfirmingRemove && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="pt-2 border-t border-ios-separator/30 flex items-center justify-between text-[12px]"
                            >
                              <span className="font-sans text-[#DC2626] font-medium">
                                Remove this bridge?
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmRemoveBridge(idx)}
                                  className="px-2.5 py-1 rounded-md bg-[#DC2626] text-white font-semibold cursor-pointer"
                                >
                                  Remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRemovingBridgeIndex(null)}
                                  className="px-2.5 py-1 rounded-md bg-[#E5E5EA] text-ios-text font-medium cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                ) : (
                  <p className="font-sans text-[13px] text-ios-secondary italic">
                    No bridges configured.
                  </p>
                )}
              </div>

              {/* Single bridge constraint note if only 1 */}
              {form.bridges && form.bridges.length <= 1 && (
                <p className="font-sans text-[11.5px] text-ios-secondary italic pt-0.5">
                  You need at least one bridge so other members can reach you upon mutual approval.
                </p>
              )}

              {/* Add Bridge Link */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleOpenAddBridge}
                  className="inline-flex items-center gap-1 font-sans text-[13.5px] font-semibold text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add another bridge</span>
                </button>
              </div>
            </section>

            {/* ========================================================= */}
            {/* CARD 6 — PREFERENCES                                      */}
            {/* ========================================================= */}
            <section
              aria-label="Preferences"
              className="bg-ios-card rounded-2xl p-4 sm:p-5 shadow-ios-card space-y-3.5"
            >
              <div className="border-b border-ios-separator/30 pb-2.5">
                <span className="font-sans font-bold text-[13px] uppercase tracking-wider text-ios-secondary">
                  Preferences
                </span>
              </div>

              {/* 1. Notifications Switch */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-ios-forest/10 text-ios-forest flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-sans font-semibold text-[14px] text-ios-text">
                      Notifications
                    </span>
                    <span className="font-sans text-[11.5px] text-ios-secondary leading-tight">
                      Receive quiet alerts when incoming bridge requests arrive.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleNotifications}
                  className={`w-12 h-7 rounded-full transition-colors relative cursor-pointer p-0.5 flex-shrink-0 ${
                    notificationsEnabled ? 'bg-ios-forest' : 'bg-[#E5E5EA]'
                  }`}
                  aria-checked={notificationsEnabled}
                  role="switch"
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`w-6 h-6 rounded-full bg-white shadow-md transform ${
                      notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-ios-separator/30" />

              {/* 2. View Member Pass Row */}
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setShowPassModal(true);
                }}
                className="w-full flex items-center justify-between py-1.5 hover:bg-[#F2F2F7]/50 active:bg-[#E5E5EA] rounded-xl transition-colors cursor-pointer text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#007AFF]/10 text-ios-blue flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-sans font-semibold text-[14px] text-ios-text">
                      View Member Pass
                    </span>
                    <span className="font-sans text-[11.5px] text-ios-secondary">
                      {form.memberNumber || '#0001'} • {form.cohort || 'Cohort 2026'}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ios-secondary/50" />
              </button>

              {/* 3. Ko-fi Creator Support (Configurable via VITE_KOFI_URL; hidden if unset) */}
              {(() => {
                const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> })?.env : undefined;
                const kofiUrl = metaEnv?.VITE_KOFI_URL?.trim();
                if (!kofiUrl) return null;

                return (
                  <>
                    <div className="border-t border-ios-separator/30" />
                    <a
                      href={kofiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => haptics.selection()}
                      className="w-full flex items-center justify-between py-1.5 hover:bg-[#F2F2F7]/50 active:bg-[#E5E5EA] rounded-xl transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center flex-shrink-0">
                          <Coffee className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-sans font-semibold text-[14px] text-ios-text">
                            Support the creator on Ko-fi
                          </span>
                          <span className="font-sans text-[11.5px] text-ios-secondary">
                            Quietly fund directory infrastructure and human curation.
                          </span>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-ios-secondary/50" />
                    </a>
                  </>
                );
              })()}
            </section>
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* SAVE MODEL — iOS SLIDING DIRTY BAR                           */}
      {/* ============================================================= */}
      <AnimatePresence>
        {isDirty && !initialLoading && (
          <motion.aside
            aria-label="Save changes banner"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40"
          >
            <div className="bg-white/90 backdrop-blur-xl border border-ios-separator/60 shadow-2xl rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 pl-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="font-sans font-semibold text-[13.5px] text-ios-text">
                  Unsaved changes
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="font-sans font-semibold text-[13.5px] text-ios-secondary hover:text-ios-text active:opacity-60 px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Discard
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !handleAvailability}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ios-forest text-white font-sans text-[13.5px] font-semibold hover:bg-ios-forest-pressed active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <BrandLoader size="sm" className="w-4 h-4" />
                      <span>Saving…</span>
                    </>
                  ) : isSavedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <span>Save</span>
                  )}
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* BRIDGE EDITOR SHEET / MODAL                                   */}
      {/* ============================================================= */}
      <AnimatePresence>
        {(editingBridgeIndex !== null || isAddingBridge) && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4"
            onClick={() => {
              setEditingBridgeIndex(null);
              setIsAddingBridge(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="w-full max-w-lg bg-ios-card rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 border-t sm:border border-ios-separator/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-ios-separator/40 pb-3">
                <span className="font-sans font-bold text-[17px] text-ios-text">
                  {editingBridgeIndex !== null ? 'Edit Bridge' : 'Add Bridge'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBridgeIndex(null);
                    setIsAddingBridge(false);
                  }}
                  className="w-7 h-7 rounded-full bg-[#E5E5EA] flex items-center justify-center text-ios-secondary hover:text-ios-text active:scale-90 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Channel Selector Chips */}
              <div className="space-y-1.5">
                <label className="font-sans text-[12px] font-semibold text-ios-secondary uppercase tracking-wider block">
                  Select Channel
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_CHANNELS.map((ch) => {
                    const isSelected = bridgeDraftType === ch;
                    const config = CHANNEL_CONFIGS[ch] || { label: ch };
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setBridgeDraftType(ch);
                        }}
                        className={`p-2 rounded-xl flex items-center gap-2 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-ios-forest/15 border-2 border-ios-forest text-ios-text'
                            : 'bg-[#F2F2F7] border-2 border-transparent text-ios-secondary hover:text-ios-text'
                        }`}
                      >
                        {getChannelIcon(ch)}
                        <span className="font-sans font-medium text-[12.5px] truncate">
                          {config.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Value Input */}
              <div className="space-y-1">
                <label
                  htmlFor="bridge-value-input"
                  className="font-sans text-[12px] font-semibold text-ios-secondary uppercase tracking-wider block"
                >
                  Contact Coordinate
                </label>
                <input
                  id="bridge-value-input"
                  type="text"
                  value={bridgeDraftValue}
                  onChange={(e) => setBridgeDraftValue(e.target.value)}
                  placeholder={CHANNEL_CONFIGS[bridgeDraftType]?.placeholder || 'Enter value...'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F2F2F7] border border-transparent focus:border-ios-forest focus:bg-white text-ios-text font-sans text-[15px] outline-none transition-all"
                  autoFocus
                />
              </div>

              {/* Live Masking Preview */}
              <div className="p-3 rounded-xl bg-[#F2F2F7] border border-ios-separator/30 space-y-1 text-[12px]">
                <span className="font-sans text-ios-secondary font-medium">
                  Privacy Mask Preview (shown to strangers):
                </span>
                <p className="font-mono text-ios-forest font-bold text-[13px] break-all">
                  {maskContactValue(bridgeDraftType, bridgeDraftValue)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingBridgeIndex(null);
                    setIsAddingBridge(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#E5E5EA] text-ios-text font-sans font-semibold text-[14px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBridgeModal}
                  disabled={!bridgeDraftValue.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-ios-forest disabled:opacity-40 text-white font-sans font-semibold text-[14px] cursor-pointer shadow-xs"
                >
                  Confirm Bridge
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* MEMBER PASS MODAL OVERLAY                                    */}
      {/* ============================================================= */}
      <AnimatePresence>
        {showPassModal && form && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowPassModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotateX: 10 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotateX: -10 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="w-full max-w-sm bg-[#1C1C1E] text-white rounded-3xl p-6 shadow-2xl border border-white/15 space-y-6 relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Card Header & Seal */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    style={{ backgroundColor: form.avatarBg || '#1C1C1E' }}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-serif font-bold text-sm"
                  >
                    W
                  </div>
                  <div>
                    <span className="font-sans font-bold text-[14px] uppercase tracking-wider block">
                      World Gallery Pass
                    </span>
                    <span className="font-mono text-[11px] text-white/60">
                      {form.cohort || (sessionInfo.isCurator ? 'Founding Curator' : 'Cohort 2026')}
                    </span>
                  </div>
                </div>

                <span className="font-mono text-[13px] font-extrabold text-[#34C759] bg-[#34C759]/15 px-2.5 py-1 rounded-full border border-[#34C759]/30">
                  {form.memberNumber || sessionInfo.memberNumber || (sessionInfo.isCurator ? '#0001' : '#0001')}
                </span>
              </div>

              {/* Pass Holder Centerpiece */}
              <div className="flex flex-col items-center text-center space-y-3 py-2">
                <div
                  style={{ backgroundColor: form.avatarBg || '#1C1C1E' }}
                  className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-white font-serif text-3xl font-bold shadow-xl ring-4 ring-white/10"
                >
                  {form.avatarUrl ? (
                    <img
                      src={form.avatarUrl}
                      alt={form.fullName || sessionInfo.name || 'Member Pass'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {(form.fullName || sessionInfo.name || (sessionInfo.isCurator ? 'Tonbara Timinipre Destiny' : 'Founding Curator'))
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-sans font-extrabold text-[20px] text-white">
                    {form.fullName || sessionInfo.name || (sessionInfo.isCurator ? 'Tonbara Timinipre Destiny' : 'Founding Curator')}
                  </h3>
                  <p className="font-mono text-[13px] text-[#34C759]">
                    @{form.handle || sessionInfo.handle || (sessionInfo.isCurator ? 'tonbi360' : 'curator')}
                  </p>
                  <p className="font-sans text-[12.5px] text-white/60 mt-0.5">
                    {form.location || (sessionInfo.isCurator ? 'London & Global' : '')}
                  </p>
                </div>
              </div>

              {/* Tags summary */}
              <div className="flex flex-wrap justify-center gap-1.5">
                {form.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/80 font-sans text-[11.5px]"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {/* Pass Actions */}
              <div className="pt-2 border-t border-white/15 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptics.notification('success');
                    setPassCopied(true);
                    setTimeout(() => setPassCopied(false), 2000);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/15 hover:bg-white/20 active:scale-95 text-white font-sans text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  {passCopied ? <Check className="w-4 h-4 text-[#34C759]" /> : <Share2 className="w-4 h-4" />}
                  <span>{passCopied ? 'Pass Copied' : 'Share Pass'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="py-2.5 px-4 rounded-xl bg-white text-black font-sans text-[13px] font-bold active:scale-95 transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
