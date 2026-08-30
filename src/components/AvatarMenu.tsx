'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Inbox,
  Send,
  User,
  LogOut,
  ChevronRight,
  Download,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { haptics } from '../lib/haptics';
import { isStandaloneMode, canPromptNativeInstall, promptPWAInstall, isIosSafari } from '../lib/pwa';
import { getCurrentUserProfile, USER_PROFILE_UPDATE_EVENT } from '../lib/userProfile';
import { GalleryMember } from '../types/gallery';
import InstallModal from './InstallModal';

interface AvatarMenuProps {
  isOpen: boolean;
  onClose: () => void;
  pendingRequestsCount: number;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

export default function AvatarMenu({
  isOpen,
  onClose,
  pendingRequestsCount,
  onNavigate,
  onSignOut,
}: AvatarMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [userProfile, setUserProfile] = useState<GalleryMember>(getCurrentUserProfile());

  useEffect(() => {
    const handleProfileUpdate = () => {
      setUserProfile(getCurrentUserProfile());
    };
    window.addEventListener(USER_PROFILE_UPDATE_EVENT, handleProfileUpdate);
    return () => window.removeEventListener(USER_PROFILE_UPDATE_EVENT, handleProfileUpdate);
  }, []);

  useEffect(() => {
    const checkState = () => {
      setIsStandalone(isStandaloneMode());
      setHasPrompt(canPromptNativeInstall());
      setIsIos(isIosSafari());
    };

    checkState();

    const handleReady = () => {
      checkState();
    };

    const handleInstalled = () => {
      setIsStandalone(true);
      setHasPrompt(false);
    };

    window.addEventListener('pwa-install-ready', handleReady);
    window.addEventListener('pwa-installed', handleInstalled);

    return () => {
      window.removeEventListener('pwa-install-ready', handleReady);
      window.removeEventListener('pwa-installed', handleInstalled);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleRowClick = (action: () => void) => {
    haptics.selection();
    onClose();
    action();
  };

  const handleInstallClick = async () => {
    haptics.impact('light');
    if (isStandalone) return;

    if (hasPrompt) {
      const result = await promptPWAInstall();
      if (result === 'manual-ios') {
        setShowInstallModal(true);
      }
    } else if (isIos) {
      setShowInstallModal(true);
    } else {
      // If criteria not met, let clicking take user straight to Diagnostics screen
      handleRowClick(() => onNavigate('/diagnostics'));
    }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Transparent click catcher */}
            <div
              className="fixed inset-0 z-40 cursor-default"
              onClick={onClose}
            />

            {/* Floating Dropdown Card */}
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.92, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="absolute top-12 right-0 w-72 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-ios-separator/60 p-2 z-50 select-none overflow-hidden"
            >
              {/* Identity Header */}
              <div className="flex items-center gap-3 p-2.5 pb-3 border-b border-ios-separator/40">
                <div
                  style={{ backgroundColor: userProfile.avatarBg || '#2D6A4F' }}
                  className="w-10 h-10 rounded-full text-white font-serif font-bold text-sm flex items-center justify-center shadow-xs flex-shrink-0 overflow-hidden"
                >
                  {userProfile.avatarUrl ? (
                    <img
                      src={userProfile.avatarUrl}
                      alt={userProfile.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {userProfile.fullName
                        ? userProfile.fullName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                        : 'TT'}
                    </span>
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-sans font-semibold text-[14.5px] text-ios-text truncate leading-tight">
                    {userProfile.fullName || 'Tonbara Destiny'}
                  </span>
                  <span className="font-sans text-[12.5px] text-ios-secondary truncate">
                    @{userProfile.handle || 'tonbi360'}
                  </span>
                </div>
              </div>

              {/* Menu Rows */}
              <div className="py-1 space-y-0.5">
                {/* 1. Requests Row */}
                <button
                  type="button"
                  onClick={() => handleRowClick(() => onNavigate('/requests'))}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F2F2F7] active:bg-[#E5E5EA] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-ios-forest/10 text-ios-forest flex items-center justify-center">
                      <Inbox className="w-4 h-4" />
                    </div>
                    <span className="font-sans font-medium text-[14px] text-ios-text">
                      Requests
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {pendingRequestsCount > 0 && (
                      <span className="bg-ios-forest text-white font-mono text-[11px] font-bold px-2 py-0.5 rounded-full">
                        {pendingRequestsCount}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-ios-secondary/50" />
                  </div>
                </button>

                {/* 2. Sent Bridges Row */}
                <button
                  type="button"
                  onClick={() => handleRowClick(() => onNavigate('/sent'))}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F2F2F7] active:bg-[#E5E5EA] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#007AFF]/10 text-ios-blue flex items-center justify-center">
                      <Send className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-sans font-medium text-[14px] text-ios-text">
                      Sent
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ios-secondary/50" />
                </button>

                {/* 3. Edit Portrait Row */}
                <button
                  type="button"
                  onClick={() => handleRowClick(() => onNavigate('/portrait'))}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F2F2F7] active:bg-[#E5E5EA] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#8E8E93]/15 text-ios-secondary flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <span className="font-sans font-medium text-[14px] text-ios-text">
                      Edit Portrait
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ios-secondary/50" />
                </button>

                {/* 4. Install App Row */}
                {isStandalone ? (
                  /* Standalone display mode ONLY */
                  <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#F2F2F7]/60 text-left">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-ios-forest/10 text-ios-forest flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-ios-forest" />
                      </div>
                      <span className="font-sans font-medium text-[14px] text-ios-text">
                        Installed
                      </span>
                    </div>
                    <span className="font-sans text-[11px] font-semibold text-ios-forest bg-[#E8F5E9] px-2 py-0.5 rounded-full">
                      Standalone
                    </span>
                  </div>
                ) : hasPrompt ? (
                  /* Not installed, beforeinstallprompt ready */
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F2F2F7] active:bg-[#E5E5EA] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-ios-forest/10 text-ios-forest flex items-center justify-center">
                        <Download className="w-4 h-4 text-ios-forest" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-sans font-medium text-[14px] text-ios-text">
                          Install App
                        </span>
                        <span className="font-sans text-[11px] text-ios-forest font-medium">
                          Tap to install directly
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ios-secondary/50" />
                  </button>
                ) : (
                  /* Not installed, beforeinstallprompt never fired */
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full flex items-start justify-between p-2.5 rounded-xl hover:bg-[#F2F2F7]/50 active:bg-[#E5E5EA] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[#8E8E93]/15 text-ios-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Download className="w-4 h-4 text-ios-secondary" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-sans font-medium text-[14px] text-ios-secondary">
                          Install App
                        </span>
                        <span className="font-sans text-[11px] text-[#DC2626] font-normal leading-tight mt-0.5">
                          Chrome criteria not met — see Diagnostics.
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ios-secondary/40 flex-shrink-0 mt-1" />
                  </button>
                )}

                {/* 5. Curator Desk Row */}
                <button
                  type="button"
                  onClick={() => handleRowClick(() => onNavigate('/admin'))}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#F2F2F7] active:bg-[#E5E5EA] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-ios-forest/10 text-ios-forest flex items-center justify-center">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-sans font-medium text-[14px] text-ios-text">
                        Curator Desk
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ios-secondary/50" />
                </button>
              </div>

              {/* Hairline Divider */}
              <div className="border-t border-ios-separator/50 my-1" />

              {/* Sign Out Row (iOS Red) */}
              <button
                type="button"
                onClick={() => {
                  haptics.impact('light');
                  onClose();
                  onSignOut();
                }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors cursor-pointer text-left text-[#DC2626]"
              >
                <div className="w-7 h-7 rounded-lg bg-red-100/60 text-[#DC2626] flex items-center justify-center">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="font-sans font-medium text-[14px]">
                  Sign Out
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <InstallModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />
    </>
  );
}
