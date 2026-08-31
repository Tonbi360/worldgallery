'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Eye, EyeOff, Check, X, Mail } from 'lucide-react';
import { BrandLoader } from './BrandLoader';
import { haptics } from '../lib/haptics';
import { getAdminEmail, sanitizeText } from '../lib/security';
import { dbVerifyUserCredentials } from '../lib/dataService';

interface SignInPageProps {
  onNavigate: (path: string) => void;
  onBack: () => void;
}

// Auth session keys
const AUTH_STORAGE_KEY = 'wg_user_session';

export default function SignInPage({ onNavigate, onBack }: SignInPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorType, setErrorType] = useState<'' | 'invalid' | 'restricted' | 'network'>('');
  const [isShaking, setIsShaking] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Forgot password sheet state
  const [isForgotSheetOpen, setIsForgotSheetOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);
  const forgotInputRef = useRef<HTMLInputElement>(null);

  // Form validity check (email must contain '@' and password non-empty)
  const isValid = email.trim().includes('@') && password.length > 0;

  // Lock body scroll and track visualViewport for soft keyboard
  useEffect(() => {
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
  }, []);

  // Forgot password auto-focus
  useEffect(() => {
    if (isForgotSheetOpen) {
      setForgotEmail(email); // Prepopulate with current email if typed
      setForgotSubmitted(false);
      setTimeout(() => forgotInputRef.current?.focus(), 250);
    }
  }, [isForgotSheetOpen, email]);

  const togglePasswordVisibility = () => {
    haptics.selection();
    setShowPassword((prev) => !prev);
  };

  const handleBack = () => {
    haptics.selection();
    onBack();
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading || isSuccess) return;

    haptics.impact('medium');
    setLoading(true);
    setErrorType('');

    // Offline / Network check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false);
      setErrorType('network');
      haptics.notification('error');
      triggerShake();
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // Authenticate credentials via serverless auth endpoint
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, passcode: password }),
      }).catch(() => null);

      if (response && response.ok) {
        const data = await response.json();
        if (data.verified && data.user) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
          if (data.user.role === 'curator') {
            localStorage.setItem('wg_curator_session_authenticated', 'true');
            handleAuthSuccess('/admin');
          } else {
            localStorage.removeItem('wg_curator_session_authenticated');
            handleAuthSuccess('/gallery');
          }
          return;
        }
      }

      // If server returned 401 or invalid credentials
      if (response && response.status === 401) {
        setLoading(false);
        setErrorType('invalid');
        haptics.notification('error');
        triggerShake();
        return;
      }

      // In DEV environment only: allow fallback for local sandbox testing
      if (import.meta.env.DEV) {
        const metaEnv = typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> })?.env : undefined;
        const adminPasscode =
          (typeof process !== 'undefined' && process.env?.ADMIN_PASSCODE) ||
          metaEnv?.VITE_ADMIN_PASSCODE ||
          'world2026';
        const configuredAdmin = getAdminEmail().toLowerCase().trim();

        if (
          (cleanEmail === configuredAdmin || cleanEmail === 'curator@worldgallery.org' || cleanEmail === 'tonbaratiminipredestiny@gmail.com') &&
          (password === adminPasscode || password === 'world2026')
        ) {
          const curatorUser = { id: 'usr_curator_tonbara', email: cleanEmail, role: 'curator', name: 'The Curator' };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(curatorUser));
          localStorage.setItem('wg_curator_session_authenticated', 'true');
          handleAuthSuccess('/admin');
          return;
        }
      }

      // In PROD or when verification fails:
      setLoading(false);
      setErrorType(response ? 'invalid' : 'network');
      haptics.notification('error');
      triggerShake();
    } catch {
      setLoading(false);
      setErrorType('network');
      haptics.notification('error');
      triggerShake();
    }

    // Refocus password and select all text for fast correction
    setTimeout(() => {
      if (passwordInputRef.current) {
        passwordInputRef.current.focus();
        passwordInputRef.current.select();
      }
    }, 50);
  };

  const handleAuthSuccess = (targetRoute: string) => {
    setLoading(false);
    setIsSuccess(true);
    haptics.notification('success');

    // Wait ~300ms with checkmark morph, then push route
    setTimeout(() => {
      onNavigate(targetRoute);
    }, 300);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim().includes('@') || forgotLoading) return;

    haptics.impact('medium');
    setForgotLoading(true);

    // Simulated network dispatch
    await new Promise((res) => setTimeout(res, 500));
    setForgotLoading(false);
    setForgotSubmitted(true);
    haptics.notification('success');
  };

  return (
    <main
      id="signin-screen"
      className="relative flex flex-col justify-between w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-ios-bg text-ios-text px-5 py-3 select-none transition-[padding-bottom] duration-100 ease-out"
      style={{
        paddingBottom: keyboardOffset > 0 ? `${keyboardOffset + 12}px` : undefined,
      }}
    >
      {/* 1. Navigation Top Bar with iOS Chevron */}
      <div className="flex items-center justify-between w-full pt-1 flex-shrink-0">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors py-1 -ml-2 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -mr-1" />
          <span>Back</span>
        </button>
        <span className="w-12" />
      </div>

      {/* 2. Top-Aligned Content: Title (~24px gap below back bar), Card, Error, Forgot Link */}
      <div className="flex flex-col w-full pt-6 flex-shrink-0">
        {/* Large Title & Subtitle */}
        <div className="mb-6">
          <h1 className="font-sans text-[34px] font-bold tracking-tight text-ios-text leading-tight mb-1">
            Welcome Back
          </h1>
          <p className="font-sans text-[15px] text-ios-secondary">
            Sign in to your membership.
          </p>
        </div>

        {/* Inset Grouped Card with Motion Shake Physics */}
        <motion.div
          animate={{ x: isShaking ? [-6, 6, -4, 4, 0] : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="bg-ios-card rounded-2xl shadow-ios-card border-0 overflow-hidden"
        >
          {/* Row 1: Email */}
          <div className="flex items-center px-4 py-3.5">
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorType) setErrorType('');
              }}
              placeholder="Email"
              autoComplete="username email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/50"
            />
          </div>

          {/* Hairline Divider (0.5px) */}
          <div className="border-t-[0.5px] border-ios-separator/60 ml-4" />

          {/* Row 2: Password with Eye Toggle */}
          <div className="flex items-center px-4 py-3.5">
            <input
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorType) setErrorType('');
              }}
              placeholder="Password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              className="w-full bg-transparent border-0 outline-none font-sans text-[16px] text-ios-text placeholder:text-ios-secondary/50"
            />
            <button
              type="button"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="p-1 -mr-1 text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="w-4.5 h-4.5" />
              ) : (
                <Eye className="w-4.5 h-4.5" />
              )}
            </button>
          </div>
        </motion.div>

        {/* Error Messages */}
        <AnimatePresence>
          {errorType && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-sans text-[13px] font-semibold text-ios-red text-left px-1 mt-2.5"
            >
              {errorType === 'invalid' && 'Incorrect email or password.'}
              {errorType === 'network' && 'No connection. Check your internet and try again.'}
              {errorType === 'restricted' && 'This account is restricted. The Curator can help.'}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Forgot Password Right-Aligned Link */}
        <div className="flex justify-end mt-2.5 px-1">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setIsForgotSheetOpen(true);
            }}
            className="font-sans text-[14px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors cursor-pointer"
          >
            Forgot password?
          </button>
        </div>
      </div>

      {/* 3. Flexible Spacer */}
      <div className="flex-1 min-h-4" />

      {/* 4. Bottom Group: CTA & Footer */}
      <div className="flex flex-col items-center w-full gap-2.5 pb-1 safe-area-bottom flex-shrink-0">
        <button
          type="button"
          id="btn-submit-signin"
          onClick={handleSubmit}
          disabled={!isValid || loading || isSuccess}
          className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs hover:brightness-105 active:scale-[0.98] active:bg-ios-forest-pressed disabled:opacity-30 cursor-pointer transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <BrandLoader size="sm" />
          ) : isSuccess ? (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <Check className="w-5 h-5 text-white stroke-[3]" />
            </motion.div>
          ) : (
            'Sign In'
          )}
        </button>

        <p className="font-sans text-[14px] text-ios-secondary">
          Not a member?{' '}
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              onNavigate('/apply');
            }}
            className="text-ios-blue hover:text-ios-blue-pressed font-medium active:opacity-60 transition-colors cursor-pointer"
          >
            Request Membership
          </button>
        </p>
      </div>

      {/* FORGOT PASSWORD BOTTOM SHEET */}
      <AnimatePresence>
        {isForgotSheetOpen && (
          <>
            {/* Dimmed Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsForgotSheetOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            />

            {/* Bottom Sheet Modal */}
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
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 400) {
                  setIsForgotSheetOpen(false);
                }
              }}
              className="fixed inset-x-0 bottom-0 z-50 bg-ios-card rounded-t-[20px] shadow-ios-sheet px-6 pt-3 pb-6 max-w-md mx-auto safe-area-bottom"
            >
              {/* Grabber Pill */}
              <div className="w-9 h-1 bg-ios-separator rounded-full mx-auto mt-0.5 mb-2.5" />

              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="w-7" />
                <h2 className="font-sans text-[18px] font-bold text-ios-text tracking-tight">
                  Forgot Password
                </h2>
                <button
                  type="button"
                  onClick={() => setIsForgotSheetOpen(false)}
                  className="w-7 h-7 rounded-full bg-ios-bg flex items-center justify-center text-ios-secondary hover:text-ios-text active:scale-95 transition-all cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!forgotSubmitted ? (
                <>
                  <p className="font-sans text-[13px] text-ios-secondary text-center max-w-[280px] mx-auto mb-4 leading-relaxed">
                    Enter your registered email address and we&apos;ll send you a password reset link.
                  </p>

                  <form onSubmit={handleForgotSubmit} className="space-y-3">
                    <div className="relative">
                      <input
                        ref={forgotInputRef}
                        type="email"
                        inputMode="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="name@example.com"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        className="w-full bg-ios-input-bg border border-transparent focus:border-ios-blue rounded-xl py-3 px-4 font-sans text-center text-[15px] text-ios-text placeholder:text-ios-secondary/50 outline-none transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!forgotEmail.trim().includes('@') || forgotLoading}
                      className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs disabled:opacity-30 active:scale-[0.98] active:bg-ios-forest-pressed transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {forgotLoading ? (
                        <BrandLoader size="sm" />
                      ) : (
                        'Send Reset Link'
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex flex-col items-center text-center py-2 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#E8F5E9] text-ios-forest flex items-center justify-center mb-1">
                    <Mail className="w-6 h-6" />
                  </div>
                  <p className="font-sans text-[14px] font-medium text-ios-text max-w-[280px] leading-relaxed">
                    If an account exists for that email, a reset link is on its way.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsForgotSheetOpen(false)}
                    className="w-full bg-ios-card border border-ios-separator/60 text-ios-text font-sans font-semibold text-[15px] py-3 px-6 rounded-ios-pill active:scale-[0.98] transition-all cursor-pointer mt-2"
                  >
                    Done
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
