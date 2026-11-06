'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { motion } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auditEnvironmentVariables } from './lib/security';
import { BrandLoader } from './components/BrandLoader';

import LandingPage from './components/LandingPage';
import SignInPage from './components/SignInPage';
import ApplyWizard from './components/ApplyWizard';
import WaitingRoom from './components/WaitingRoom';
import GalleryDirectory from './components/GalleryDirectory';
import ProfileDetail from './components/ProfileDetail';
import RequestsScreen from './components/RequestsScreen';
import SentScreen from './components/SentScreen';
import EditPortraitScreen from './components/EditPortraitScreen';
import AdminDashboard from './components/AdminDashboard';
import ResetPasswordPage from './components/ResetPasswordPage';
import LegalScreen from './components/LegalScreen';
import { AuthProvider, useAuth } from './lib/authContext';

function RouteLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-[#F2F2F7]">
      <BrandLoader size="lg" ariaLabel="Loading World Gallery..." />
    </div>
  );
}

function AppContent() {
  const { user, profile, accountState, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [navigationDirection, setNavigationDirection] = useState<'forward' | 'backward'>('forward');

  // Initialize, audit environment, and synchronize with browser URL history
  useEffect(() => {
    // Run environment validation
    auditEnvironmentVariables();

    if (typeof window !== 'undefined') {
      const initialPath = window.location.pathname || '/';
      setCurrentPath(initialPath);

      const handlePopState = () => {
        setNavigationDirection('backward');
        setCurrentPath(window.location.pathname || '/');
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  const handleNavigate = (path: string) => {
    if (path === currentPath) return;

    setNavigationDirection('forward');
    setCurrentPath(path);

    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
  };

  const handleBack = () => {
    setNavigationDirection('backward');
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      setCurrentPath('/');
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/');
      }
    }
  };

  const cleanPath = currentPath.split('?')[0];

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  // Render active view based on normalized path and accountState
  const renderView = () => {
    // 1. PUBLIC VISITOR
    if (accountState === 'visitor') {
      const memberProtectedPaths = [
        '/gallery',
        '/requests',
        '/sent',
        '/connections',
        '/portrait',
        '/settings',
        '/edit-portrait',
        '/admin',
        '/curator',
        '/curator-desk',
      ];
      if (memberProtectedPaths.includes(cleanPath) || cleanPath.startsWith('/profile/')) {
        return <SignInPage onNavigate={handleNavigate} onBack={() => handleNavigate('/')} />;
      }
    }

    // 2. APPLICANT / PENDING MEMBER
    if (accountState === 'pending') {
      const memberOnlyPaths = [
        '/gallery',
        '/requests',
        '/sent',
        '/connections',
        '/portrait',
        '/settings',
        '/edit-portrait',
        '/admin',
        '/curator',
        '/curator-desk',
      ];
      if (memberOnlyPaths.includes(cleanPath) || cleanPath.startsWith('/profile/')) {
        const isRejected = profile?.status === 'rejected';
        return (
          <WaitingRoom
            initialState={isRejected ? 'rejected' : 'pending'}
            onNavigate={handleNavigate}
            onBack={handleBack}
          />
        );
      }
    }

    // 3. APPROVED MEMBER
    if (accountState === 'member') {
      // Non-curator approved member cannot access curator desk or waiting room
      if (['/admin', '/curator', '/curator-desk'].includes(cleanPath)) {
        return <GalleryDirectory onNavigate={handleNavigate} />;
      }
      if (['/waiting', '/rejected', '/apply'].includes(cleanPath)) {
        return <GalleryDirectory onNavigate={handleNavigate} />;
      }
    }

    // 4. Standard View Router
    switch (cleanPath) {
      case '/reset':
        return (
          <ResetPasswordPage
            onNavigate={handleNavigate}
            onBack={() => handleNavigate('/apply/signin')}
          />
        );

      case '/apply/signin':
      case '/signin':
        if (accountState === 'member' || accountState === 'curator') {
          return <GalleryDirectory onNavigate={handleNavigate} />;
        }
        if (accountState === 'pending') {
          return <WaitingRoom onNavigate={handleNavigate} onBack={handleBack} />;
        }
        return (
          <SignInPage
            onNavigate={handleNavigate}
            onBack={handleBack}
          />
        );

      case '/gallery':
        return (
          <GalleryDirectory
            onNavigate={handleNavigate}
          />
        );

      case '/requests':
        return (
          <RequestsScreen
            onNavigate={handleNavigate}
            onBack={() => handleNavigate('/gallery')}
          />
        );

      case '/sent':
      case '/connections':
        return (
          <SentScreen
            onNavigate={handleNavigate}
            onBack={() => handleNavigate('/gallery')}
          />
        );

      case '/portrait':
      case '/settings':
      case '/edit-portrait':
        return (
          <EditPortraitScreen
            onNavigate={handleNavigate}
            onBack={() => handleNavigate('/gallery')}
          />
        );

      case '/admin':
      case '/curator':
      case '/curator-desk':
        return (
          <AdminDashboard
            onNavigate={handleNavigate}
            onBack={() => handleNavigate('/gallery')}
          />
        );

      case '/waiting':
        return (
          <WaitingRoom
            onNavigate={handleNavigate}
            onBack={handleBack}
          />
        );

      case '/rejected':
        return (
          <WaitingRoom
            initialState="rejected"
            onNavigate={handleNavigate}
            onBack={handleBack}
          />
        );

      case '/apply':
        if (accountState === 'member' || accountState === 'curator') {
          return <GalleryDirectory onNavigate={handleNavigate} />;
        }
        if (accountState === 'pending') {
          return <WaitingRoom onNavigate={handleNavigate} onBack={handleBack} />;
        }
        return (
          <ApplyWizard
            onNavigate={handleNavigate}
            onBack={handleBack}
          />
        );

      case '/terms':
        return (
          <LegalScreen
            initialTab="terms"
            onBack={handleBack}
            onNavigate={handleNavigate}
          />
        );

      case '/privacy':
        return (
          <LegalScreen
            initialTab="privacy"
            onBack={handleBack}
            onNavigate={handleNavigate}
          />
        );

      default:
        if (cleanPath.startsWith('/profile/')) {
          const handle = cleanPath.replace('/profile/', '');
          return (
            <ProfileDetail
              handle={handle}
              onNavigate={handleNavigate}
              onBack={() => handleNavigate('/gallery')}
            />
          );
        }
        return (
          <LandingPage
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <div className="min-h-full min-h-[100dvh] bg-ios-bg text-ios-text font-sans selection:bg-ios-blue/20 selection:text-ios-blue">
      <div
        id="ios-app-root"
        className="relative flex flex-col min-h-[100dvh] w-full max-w-md mx-auto overflow-hidden bg-ios-bg shadow-sm"
      >
        <motion.div
          key={currentPath.split('?')[0]}
          custom={navigationDirection}
          variants={{
            enter: (dir: string) => ({
              x: dir === 'forward' ? 24 : -24,
              opacity: 0,
            }),
            center: {
              x: 0,
              opacity: 1,
            },
          }}
          initial="enter"
          animate="center"
          transition={{
            type: 'spring',
            stiffness: 380,
            damping: 34,
            mass: 0.8,
          }}
          className="w-full h-full min-h-[100dvh]"
        >
          <ErrorBoundary>
            <Suspense fallback={<RouteLoadingFallback />}>
              {renderView()}
            </Suspense>
          </ErrorBoundary>
        </motion.div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
