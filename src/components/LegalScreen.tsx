'use client';

import React, { useState } from 'react';
import { ChevronLeft, Shield, FileText, Lock, Users, Eye, Sparkles } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface LegalScreenProps {
  initialTab?: 'terms' | 'privacy';
  onBack: () => void;
  onNavigate?: (path: string) => void;
}

export default function LegalScreen({ initialTab = 'terms', onBack, onNavigate }: LegalScreenProps) {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(initialTab);

  const handleTabChange = (tab: 'terms' | 'privacy') => {
    haptics.selection();
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', tab === 'terms' ? '/terms' : '/privacy');
    }
  };

  return (
    <main
      id="legal-screen"
      className="relative flex flex-col w-full h-[100dvh] max-h-[100dvh] overflow-hidden bg-ios-bg text-ios-text select-none"
    >
      {/* 1. iOS Top Navigation Bar */}
      <header className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0 border-b border-ios-separator/40 bg-ios-bg/90 backdrop-blur-md sticky top-0 z-10">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            onBack();
          }}
          className="inline-flex items-center gap-0.5 font-sans text-[17px] font-medium text-ios-blue hover:text-ios-blue-pressed active:opacity-60 transition-colors -ml-2 py-1 px-1 cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 -mr-1" />
          <span>Back</span>
        </button>

        <h1 className="font-sans text-[17px] font-semibold text-ios-text tracking-tight">
          {activeTab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        </h1>

        <div className="w-12" />
      </header>

      {/* 2. iOS Segmented Control */}
      <div className="px-5 pt-3 pb-2 flex-shrink-0">
        <div className="flex bg-ios-separator/30 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => handleTabChange('terms')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13.5px] font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-ios-card text-ios-text shadow-sm'
                : 'text-ios-secondary hover:text-ios-text'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('privacy')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[13.5px] font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-ios-card text-ios-text shadow-sm'
                : 'text-ios-secondary hover:text-ios-text'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </button>
        </div>
      </div>

      {/* 3. Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 safe-area-bottom font-sans text-ios-text space-y-6">
        {activeTab === 'terms' ? (
          // ==================== TERMS OF SERVICE ====================
          <div className="space-y-6 max-w-prose pb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ios-forest/10 text-ios-forest text-[12px] font-semibold mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Effective November 2026</span>
              </div>
              <h2 className="text-[26px] font-bold tracking-tight text-ios-text leading-tight mb-2">
                World Gallery Terms of Service
              </h2>
              <p className="text-[14px] text-ios-secondary leading-relaxed">
                World Gallery is a high-trust, member-only human registry founded on intentional connection, quiet permanence, and human curation rather than algorithmic engagement.
              </p>
            </div>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-forest font-semibold text-[15px]">
                <Users className="w-4.5 h-4.5" />
                <h3>1. Human Curation & Daily Quota</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                Access to World Gallery is not an automated entitlement. Every applicant is reviewed individually by the Curator. To cultivate a quiet, thoughtful community, admissions are strictly limited to a maximum cap of <strong>ten members per day</strong>. Curator Invite Seals provide fast-pass admission but remain subject to review.
              </p>
            </section>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-blue font-semibold text-[15px]">
                <Lock className="w-4.5 h-4.5" />
                <h3>2. Private Contact Bridges</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                World Gallery replaces public social media feeds with 1:1 bilateral contact bridges (Email, Phone, WhatsApp, Signal, Telegram, Discord, etc.). All bridge values are masked by default. Exchanging coordinates requires an explicit connection request and recipient approval. You agree never to harvest, republish, or misuse any contact coordinates shared with you.
              </p>
            </section>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-orange font-semibold text-[15px]">
                <Shield className="w-4.5 h-4.5" />
                <h3>3. Member Conduct & Trust Standards</h3>
              </div>
              <ul className="text-[13.5px] text-ios-secondary leading-relaxed space-y-2 list-disc pl-4">
                <li><strong>No Scraping or Bots:</strong> Automated crawlers, scrapers, and bot access are strictly prohibited.</li>
                <li><strong>Authentic Likeness:</strong> Members must present truthful representation and authentic portraits.</li>
                <li><strong>Zero Tolerance:</strong> Harassment, unsolicited commercial spam, hate speech, or abuse will result in immediate and irrevocable expulsion.</li>
                <li><strong>Curator Discretion:</strong> The Curator reserves the authority to revoke access or remove profiles to protect community safety.</li>
              </ul>
            </section>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-purple font-semibold text-[15px]">
                <FileText className="w-4.5 h-4.5" />
                <h3>4. Account Ownership & Termination</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                You retain ownership of the text, bio, and portraits you upload. You may edit your profile or request complete deletion of your account and records at any time through the Curator desk.
              </p>
            </section>
          </div>
        ) : (
          // ==================== PRIVACY POLICY ====================
          <div className="space-y-6 max-w-prose pb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ios-blue/10 text-ios-blue text-[12px] font-semibold mb-2">
                <Shield className="w-3.5 h-3.5" />
                <span>Zero Tracking · High Trust</span>
              </div>
              <h2 className="text-[26px] font-bold tracking-tight text-ios-text leading-tight mb-2">
                World Gallery Privacy Policy
              </h2>
              <p className="text-[14px] text-ios-secondary leading-relaxed">
                We believe your personal contact information should remain yours. We do not sell data, profile your behavior, or run third-party advertising trackers.
              </p>
            </div>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-forest font-semibold text-[15px]">
                <Eye className="w-4.5 h-4.5" />
                <h3>1. What We Collect & Why</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                We collect only what is strictly necessary to maintain your membership:
              </p>
              <ul className="text-[13.5px] text-ios-secondary leading-relaxed space-y-1.5 list-disc pl-4">
                <li><strong>Account Credentials:</strong> Email, handle, and a secure bcrypt-hashed password.</li>
                <li><strong>Profile Information:</strong> Full name, bio, location, tags, and portrait images.</li>
                <li><strong>Contact Bridges:</strong> Optional private coordinates you choose to connect through.</li>
                <li><strong>Connection Records:</strong> Bilateral requests, status, and approval snapshots.</li>
              </ul>
            </section>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-blue font-semibold text-[15px]">
                <Lock className="w-4.5 h-4.5" />
                <h3>2. Masking & Server-Enforced Isolation</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                Contact bridges are never exposed on public or gallery listings. Our backend applies strict algorithmic masking (e.g. <code>u•••@d•••.com</code> or <code>+1 ••• ••• 42</code>) on the server before transmitting any profile data. Full bridge coordinates are only disclosed to another member after you approve their specific connection request.
              </p>
            </section>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-orange font-semibold text-[15px]">
                <Shield className="w-4.5 h-4.5" />
                <h3>3. Session Cookies & Storage</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                We use secure, <code>HttpOnly</code>, <code>SameSite=Lax</code> session cookies (<code>wg_session</code>) to keep you signed in safely without exposing tokens to client scripts. When &ldquo;Keep me signed in&rdquo; is active, sessions persist for up to 90 days. Logging out immediately destroys the session on our database.
              </p>
            </section>

            <section className="bg-ios-card rounded-2xl p-4 shadow-ios-card space-y-3">
              <div className="flex items-center gap-2 text-ios-purple font-semibold text-[15px]">
                <Users className="w-4.5 h-4.5" />
                <h3>4. Your Rights & Data Erasure</h3>
              </div>
              <p className="text-[13.5px] text-ios-secondary leading-relaxed">
                You have the right to access, export, or permanently erase your data at any time. When an account is removed, all associated profiles, pending connections, and sessions are permanently purged from PostgreSQL.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
