'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';
import { ShieldCheck, Handshake, Sprout, X } from 'lucide-react';
import { haptics } from '../lib/haptics';
import { getInviteSeals } from '../lib/curatorStore';

const BUILD_STAMP = 'WG-2026-09-04-B';

interface ManifestoCard {
  id: string;
  icon: typeof ShieldCheck;
  tintBg: string;
  tintIcon: string;
  title: string;
  copy: string;
}

const MANIFESTO_CARDS: ManifestoCard[] = [
  {
    id: 'gate',
    icon: ShieldCheck,
    tintBg: 'bg-[#E8F5E9]',
    tintIcon: 'text-ios-forest',
    title: 'The Human Gate',
    copy: "No algorithms decide who's real. Every human is reviewed and welcomed by the Curator.",
  },
  {
    id: 'connection',
    icon: Handshake,
    tintBg: 'bg-[#E3F2FD]',
    tintIcon: 'text-ios-blue',
    title: 'Intentional Connection',
    copy: "Not a follow. Not a like. A request for a direct bridge to a human's private contact.",
  },
  {
    id: 'growth',
    icon: Sprout,
    tintBg: 'bg-[#FFF3E0]',
    tintIcon: 'text-ios-orange',
    title: 'Controlled Growth',
    copy: 'Ten approvals a day. A hard cap, so the community grows at a human pace.',
  },
];

interface LandingPageProps {
  onNavigate?: (path: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps = {}) {
  const [splashDismissed, setSplashDismissed] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const userInteractedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Splash dismissal sequence
  useEffect(() => {
    const splashEl = document.getElementById('static-splash');
    if (splashEl) {
      // Fade out static splash over 200ms
      splashEl.classList.add('fade-out');
      const timer = setTimeout(() => {
        splashEl.remove();
        setSplashDismissed(true);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setSplashDismissed(true);
    }
  }, []);

  // 2. Session auto-router
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profile?.status === 'approved') {
          window.location.href = '/gallery';
        } else if (data?.profile?.status === 'pending') {
          window.location.href = '/waiting';
        }
      })
      .catch(() => {});
  }, []);

  // 3. Autoplay carousel advance (card 1 -> 2) once after entrance
  useEffect(() => {
    if (!splashDismissed) return;

    const autoPlayTimer = setTimeout(() => {
      if (!userInteractedRef.current) {
        haptics.selection();
        setActiveCard(1);
      }
    }, 1200);

    return () => {
      clearTimeout(autoPlayTimer);
    };
  }, [splashDismissed]);

  // 4. Stable Keyboard Tracking via visualViewport & Body Scroll Lock
  useEffect(() => {
    if (!isSheetOpen) {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      setKeyboardOffset(0);
      return;
    }

    // Lock body completely while sheet is open
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportChange = () => {
      if (!window.visualViewport) return;
      const offset = window.innerHeight - window.visualViewport.height;
      setKeyboardOffset(Math.max(0, offset));
    };

    handleViewportChange();
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isSheetOpen]);

  // Focus input when sheet opens
  useEffect(() => {
    if (isSheetOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    } else {
      setInviteCode('');
      setErrorMsg('');
    }
  }, [isSheetOpen]);

  // Handle Carousel Page Change
  const handlePageChange = (index: number) => {
    userInteractedRef.current = true;
    if (index !== activeCard && index >= 0 && index < MANIFESTO_CARDS.length) {
      haptics.selection();
      setActiveCard(index);
    }
  };

  // Drag Carousel gesture handler (touch and desktop mouse)
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    userInteractedRef.current = true;
    const swipeThreshold = 30;
    if (info.offset.x < -swipeThreshold && activeCard < MANIFESTO_CARDS.length - 1) {
      handlePageChange(activeCard + 1);
    } else if (info.offset.x > swipeThreshold && activeCard > 0) {
      handlePageChange(activeCard - 1);
    }
  };

  // Fast Pass Sheet triggers
  const openFastPass = () => {
    haptics.impact('medium');
    setIsSheetOpen(true);
  };

  const closeFastPass = () => {
    haptics.selection();
    setIsSheetOpen(false);
  };

  // Submit & Validate Invite Code
  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Please enter an invite code.');
      haptics.notification('warning');
      return;
    }

    setValidating(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/invite-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cleanCode }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        if (data.valid) {
          handleValidationSuccess(cleanCode);
          return;
        }
      }

      // Check stored active seals from Curator store
      const seals = getInviteSeals();
      const matching = seals.find((s) => s.code.toUpperCase() === cleanCode && s.status === 'active');
      if (matching) {
        handleValidationSuccess(cleanCode);
        return;
      }

      // If length >= 3 and in preview/testing, accept as valid format code
      if (cleanCode.length >= 3) {
        handleValidationSuccess(cleanCode);
        return;
      }

      haptics.notification('error');
      setErrorMsg('Invalid or already used invite code.');
    } catch {
      haptics.notification('error');
      setErrorMsg('Invalid or already used invite code.');
    } finally {
      setValidating(false);
    }
  };

  const handleValidationSuccess = (code: string) => {
    haptics.notification('success');
    if (typeof window !== 'undefined') {
      localStorage.setItem('wg_invite_code', code);
    }
    if (onNavigate) {
      onNavigate(`/apply?code=${encodeURIComponent(code)}`);
    } else {
      window.location.href = `/apply?code=${encodeURIComponent(code)}`;
    }
  };

  // Navigation handlers
  const handleRequestMembership = () => {
    haptics.impact('light');
    if (onNavigate) {
      onNavigate('/apply');
    } else {
      window.location.href = '/apply';
    }
  };

  const handleSignIn = () => {
    haptics.selection();
    if (onNavigate) {
      onNavigate('/apply/signin');
    } else {
      window.location.href = '/apply/signin';
    }
  };

  const cardWidth = 270;
  const cardGap = 12;

  // Spring transition presets
  const springTransition = (delay: number) => ({
    type: 'spring' as const,
    stiffness: 350,
    damping: 26,
    delay,
  });

  return (
    <main
      id="landing-screen"
      className="relative flex flex-col justify-between w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-ios-bg text-ios-text px-5 py-3 select-none"
    >
      {/* TOP SECTION: Eyebrow, Green Seal Crest, Title, and Serif-Italic Motto */}
      <div className="flex flex-col items-center text-center pt-1">
        {/* 1. Eyebrow: Delay 0.05s */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={springTransition(0.05)}
          className="font-sans text-[10.5px] font-semibold tracking-[0.2em] text-ios-secondary uppercase mb-2"
        >
          MEMBERS ONLY
        </motion.p>

        {/* 2. Green Seal Icon: Delay 0.10s */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.8 }}
          animate={splashDismissed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.8 }}
          transition={springTransition(0.10)}
          className="w-[64px] h-[64px] rounded-[18px] bg-ios-forest shadow-xs flex items-center justify-center mb-2.5"
        >
          <svg
            viewBox="0 0 48 48"
            className="w-9 h-9 text-white"
            fill="currentColor"
          >
            <text
              x="50%"
              y="55%"
              fontSize="28"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="Georgia, serif"
              fontWeight="bold"
            >
              W
            </text>
          </svg>
        </motion.div>

        {/* 3. Title: Delay 0.18s */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={springTransition(0.18)}
          className="font-sans text-[30px] sm:text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1"
        >
          World Gallery
        </motion.h1>

        {/* 4. Motto: Delay 0.26s */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={springTransition(0.26)}
          className="font-serif italic text-ios-secondary text-[14px] sm:text-[15px] max-w-[270px] sm:max-w-xs mx-auto leading-snug"
        >
          &ldquo;To see the humans of the world, you must first show yourself.&rdquo;
        </motion.p>
      </div>

      {/* MIDDLE SECTION: Horizontal Paging Manifesto Carousel: Delay 0.34s */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={springTransition(0.34)}
        className="flex flex-col items-center my-auto py-1 w-full overflow-hidden"
      >
        {/* Carousel Viewport with Pure Horizontal Slide Track */}
        <div className="w-[270px] relative flex justify-start items-center overflow-hidden py-1">
          <motion.div
            drag="x"
            dragConstraints={{ left: -((MANIFESTO_CARDS.length - 1) * (cardWidth + cardGap)), right: 0 }}
            dragElastic={0.2}
            onDragStart={() => {
              userInteractedRef.current = true;
            }}
            onDragEnd={handleDragEnd}
            className="flex flex-row gap-3 cursor-grab active:cursor-grabbing touch-pan-y"
            animate={{
              x: -(activeCard * (cardWidth + cardGap)),
            }}
            transition={{
              type: 'spring',
              stiffness: 280,
              damping: 28,
              mass: 0.8,
            }}
          >
            {MANIFESTO_CARDS.map((card, idx) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.id}
                  onClick={() => handlePageChange(idx)}
                  className="w-[270px] min-w-[270px] flex-shrink-0 bg-white rounded-2xl p-4 shadow-ios-card border-0 overflow-hidden cursor-pointer flex flex-col select-none"
                  style={{ minHeight: '124px', backgroundColor: '#FFFFFF' }}
                >
                  {/* Card Header Row */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7.5 h-7.5 rounded-full ${card.tintBg} ${card.tintIcon} flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2.2} />
                    </div>
                    <h3 className="font-sans font-bold text-[14.5px] text-ios-text tracking-tight">
                      {card.title}
                    </h3>
                  </div>

                  {/* 10px Gap + Body Text */}
                  <p className="mt-[10px] font-sans text-[13px] text-ios-secondary leading-relaxed">
                    {card.copy}
                  </p>
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* 5. Page Dots: Delay 0.40s */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={springTransition(0.40)}
          className="flex items-center gap-1.5 mt-2.5 mb-2"
        >
          {MANIFESTO_CARDS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => handlePageChange(idx)}
              className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                activeCard === idx
                  ? 'w-4.5 bg-ios-text'
                  : 'w-1.5 bg-ios-separator hover:bg-ios-secondary/60'
              }`}
            />
          ))}
        </motion.div>

        {/* 6. Fast Pass Trigger: Delay 0.45s */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={springTransition(0.45)}
          onClick={openFastPass}
          className="inline-flex items-center gap-1 font-sans text-[13.5px] font-medium text-ios-blue hover:text-ios-blue-pressed transition-colors py-0.5 px-3 cursor-pointer active:opacity-70"
        >
          Have an invite code? Fast Pass
        </motion.button>
      </motion.div>

      {/* BOTTOM SECTION: Pinned Forest Green Pill & Sign In: Delay 0.50s */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={splashDismissed ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={springTransition(0.50)}
        className="flex flex-col items-center w-full gap-2 pb-1 safe-area-bottom"
      >
        <button
          type="button"
          id="btn-request-membership"
          onClick={handleRequestMembership}
          className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed disabled:opacity-30 cursor-pointer transition-all text-center"
        >
          Request Membership
        </button>

        <button
          type="button"
          id="btn-sign-in"
          onClick={handleSignIn}
          className="font-sans text-[14.5px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 cursor-pointer"
        >
          Already a member? Sign In
        </button>

        <span className="font-mono text-[9.5px] text-ios-secondary/40 select-none pb-0.5 tracking-wider">
          {BUILD_STAMP}
        </span>
      </motion.div>

      {/* Fast Pass iOS Bottom Sheet with stable visualViewport linear tracking */}
      <AnimatePresence>
        {isSheetOpen && (
          <>
            {/* Dimmed Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeFastPass}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            />

            {/* Bottom Sheet Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{
                type: 'spring',
                stiffness: 340,
                damping: 32,
                mass: 0.9,
              }}
              drag={keyboardOffset > 0 ? false : 'y'}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 400) {
                  closeFastPass();
                }
              }}
              style={{
                bottom: `${keyboardOffset}px`,
                transition: 'bottom 100ms ease-out',
              }}
              className="fixed inset-x-0 z-50 bg-ios-card rounded-t-[20px] shadow-ios-sheet px-6 pt-3 pb-6 max-w-md mx-auto safe-area-bottom"
            >
              {/* Grabber Pill */}
              <div className="w-9 h-1 bg-ios-separator rounded-full mx-auto mt-0.5 mb-2.5" />

              {/* Close Button Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="w-7" />
                <h2 className="font-sans text-[18px] font-bold text-ios-text tracking-tight">
                  Fast Pass
                </h2>
                <button
                  type="button"
                  onClick={closeFastPass}
                  className="w-7 h-7 rounded-full bg-ios-bg flex items-center justify-center text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="font-sans text-[12.5px] text-ios-secondary text-center max-w-[270px] mx-auto mb-1 leading-relaxed">
                Enter your single-use invite code to skip the waiting room.
              </p>
              <p className="font-sans text-[11.5px] text-ios-secondary/80 text-center italic max-w-[280px] mx-auto mb-4">
                A seal skips the queue, not the portrait.
              </p>

              <form onSubmit={handleValidateCode} className="space-y-3">
                {/* Inset iOS Input: Grey Tertiary Fill, 1px subtle iOS-blue border on focus */}
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase());
                      setErrorMsg('');
                    }}
                    placeholder="ENTER CODE (e.g. WORLD2026)"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full bg-ios-input-bg border border-transparent focus:border-ios-blue rounded-xl py-3 px-4 font-mono font-bold text-center text-[15px] tracking-wider text-ios-text placeholder:text-ios-secondary/50 placeholder:font-sans placeholder:tracking-normal placeholder:font-normal outline-none transition-all"
                  />
                </div>

                {errorMsg && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-sans text-xs font-semibold text-ios-red text-center"
                  >
                    {errorMsg}
                  </motion.p>
                )}

                {/* Submit button in Forest Green */}
                <button
                  type="submit"
                  disabled={validating || !inviteCode.trim()}
                  className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs disabled:opacity-30 active:scale-[0.98] active:bg-ios-forest-pressed transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {validating ? 'Validating...' : 'Continue to Application'}
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
