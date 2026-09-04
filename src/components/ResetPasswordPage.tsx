'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { BrandLoader } from './BrandLoader';
import { haptics } from '../lib/haptics';

interface ResetPasswordPageProps {
  onNavigate: (path: string) => void;
  onBack?: () => void;
}

export default function ResetPasswordPage({ onNavigate, onBack }: ResetPasswordPageProps) {
  const [token, setToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Extract token from query params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const urlToken = searchParams.get('token') || '';
      setToken(urlToken);
      if (!urlToken) {
        setErrorMessage('No reset seal token was found in the link. Please request a new seal.');
      } else {
        setTimeout(() => passwordInputRef.current?.focus(), 250);
      }
    }
  }, []);

  const togglePasswordVisibility = () => {
    haptics.selection();
    setShowPassword((prev) => !prev);
  };

  const handleReturnToSignIn = () => {
    haptics.selection();
    if (onBack) {
      onBack();
    } else {
      onNavigate('/apply/signin');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newPassword.trim() || isSubmitting) return;

    if (newPassword.length < 6) {
      haptics.notification('error');
      setErrorMessage('Password must be at least 6 characters.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 400);
      return;
    }

    haptics.impact('medium');
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          password: newPassword.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.ok) {
        haptics.notification('success');
        setIsSuccess(true);
      } else {
        haptics.notification('error');
        setErrorMessage(data.error || 'Invalid or expired reset seal. Please request a new one.');
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 400);
      }
    } catch (err: any) {
      console.error('[Reset Password Network Error]', err);
      haptics.notification('error');
      setErrorMessage("Couldn't submit — try again.");
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 400);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      id="reset-password-screen"
      className="relative flex flex-col justify-between w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-ios-bg text-ios-text px-5 py-3 select-none"
    >
      {/* Top Bar with iOS Chevron */}
      <div className="flex items-center justify-between w-full pt-1 flex-shrink-0">
        <button
          type="button"
          onClick={handleReturnToSignIn}
          className="inline-flex items-center gap-1 -ml-2 px-2 py-1.5 text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-all cursor-pointer"
          aria-label="Back to Sign In"
        >
          <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          <span className="font-sans text-[17px] font-normal tracking-tight">Sign In</span>
        </button>
        <span className="font-sans text-[12px] font-semibold tracking-wider text-ios-secondary/60 uppercase">
          World Gallery
        </span>
        <span className="w-12" />
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-[360px] mx-auto my-auto py-4 flex flex-col items-center">
        {isSuccess ? (
          /* Success State */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="w-full flex flex-col items-center text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-full bg-[#E8F5E9] text-ios-forest flex items-center justify-center mb-1">
              <CheckCircle2 className="w-8 h-8 stroke-[2.2]" />
            </div>

            <div className="space-y-1">
              <h1 className="font-sans text-[22px] font-bold text-ios-text tracking-tight">
                Your seal is renewed. Sign in.
              </h1>
              <p className="font-sans text-[14px] text-ios-secondary max-w-[280px] mx-auto leading-relaxed">
                All prior active sessions have been safely cleared.
              </p>
            </div>

            <button
              type="button"
              id="btn-goto-signin"
              onClick={() => {
                haptics.selection();
                onNavigate('/apply/signin');
              }}
              className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs active:scale-[0.98] active:bg-ios-forest-pressed transition-all cursor-pointer mt-4"
            >
              Sign In
            </button>
          </motion.div>
        ) : (
          /* Form State */
          <div className="w-full flex flex-col items-center text-center">
            {/* Monogram Seal Badge */}
            <div className="w-[52px] h-[52px] rounded-[15px] bg-ios-forest shadow-xs flex items-center justify-center mb-3">
              <svg viewBox="0 0 48 48" className="w-7 h-7 text-white" fill="currentColor">
                <text
                  x="50%"
                  y="55%"
                  fontSize="24"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="Georgia, serif"
                  fontWeight="bold"
                >
                  W
                </text>
              </svg>
            </div>

            <h1 className="font-sans text-[24px] font-bold text-ios-text tracking-tight mb-1">
              Renew Your Seal
            </h1>
            <p className="font-sans text-[14px] text-ios-secondary max-w-[280px] mx-auto mb-6 leading-snug">
              Enter your new member password to renew your access seal.
            </p>

            {/* Input Card */}
            <form onSubmit={handleSubmit} className="w-full space-y-3">
              <motion.div
                animate={{ x: isShaking ? [-6, 6, -4, 4, 0] : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="bg-ios-card rounded-2xl shadow-ios-card border border-ios-separator/30 overflow-hidden"
              >
                <div className="flex items-center px-4 py-3.5">
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    placeholder="New Password (min. 6 characters)"
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    disabled={!token || isSubmitting}
                    className="w-full bg-transparent border-0 outline-none font-sans text-[15.5px] text-ios-text placeholder:text-ios-secondary/50"
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

              {/* Error Message */}
              {errorMessage && (
                <div className="flex items-center gap-1.5 px-1 text-left text-ios-red">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="font-sans text-[13px] font-medium leading-tight">
                    {errorMessage}
                  </p>
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                id="btn-renew-seal"
                disabled={!token || newPassword.length < 6 || isSubmitting}
                className="w-full bg-ios-forest text-white font-sans font-semibold text-[15.5px] py-3.5 px-6 rounded-ios-pill shadow-xs disabled:opacity-35 active:scale-[0.98] active:bg-ios-forest-pressed transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isSubmitting ? (
                  <BrandLoader size="sm" ariaLabel="Renewing seal..." />
                ) : (
                  'Renew Seal'
                )}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Subtle Footer */}
      <div className="flex justify-center pb-2 safe-area-bottom">
        <span className="font-mono text-[10px] text-ios-secondary/40 select-none tracking-wider">
          WG-2026-09-04-B
        </span>
      </div>
    </main>
  );
}
