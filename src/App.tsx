'use client';

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { auditEnvironmentVariables } from './lib/security';

// Code-split routes for fast bundle parsing and publishing
const LandingPage = lazy(() => import('./components/LandingPage'));
const SignInPage = lazy(() => import('./components/SignInPage'));
const ApplyWizard = lazy(() => import('./components/ApplyWizard'));
const WaitingRoom = lazy(() => import('./components/WaitingRoom'));
const GalleryDirectory = lazy(() => import('./components/GalleryDirectory'));
const ProfileDetail = lazy(() => import('./components/ProfileDetail'));
const RequestsScreen = lazy(() => import('./components/RequestsScreen'));
const SentScreen = lazy(() => import('./components/SentScreen'));
const PlaceholderRoom = lazy(() => import('./components/PlaceholderRoom'));
const EditPortraitScreen = lazy(() => import('./components/EditPortraitScreen'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));

function RouteLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-ios-bg text-ios-secondary">
      <div className="w-8 h-8 rounded-full border-2 border-ios-forest/30 border-t-ios-forest animate-spin" />
    </div>
  );
}

export default function App() {
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

  // Render active view based on normalized path
  const renderView = () => {
    const cleanPath = currentPath.split('?')[0];

    switch (cleanPath) {
      case '/apply/signin':
      case '/signin':
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
          <PlaceholderRoom
            title="Application Notice"
            subtitle="This room opens in an upcoming build."
            badge="STATUS"
            onBack={() => handleNavigate('/')}
          />
        );

      case '/apply':
        return (
          <ApplyWizard
            onNavigate={handleNavigate}
            onBack={handleBack}
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
        <AnimatePresence mode="popLayout" custom={navigationDirection} initial={false}>
          <motion.div
            key={currentPath.split('?')[0]}
            custom={navigationDirection}
            variants={{
              enter: (dir: string) => ({
                x: dir === 'forward' ? '100%' : '-20%',
                opacity: dir === 'forward' ? 0.9 : 0.8,
                zIndex: 1,
              }),
              center: {
                x: 0,
                opacity: 1,
                zIndex: 1,
              },
              exit: (dir: string) => ({
                x: dir === 'forward' ? '-20%' : '100%',
                opacity: dir === 'forward' ? 0.8 : 0.9,
                zIndex: dir === 'forward' ? 0 : 2,
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
            className="w-full h-full min-h-[100dvh]"
          >
            <ErrorBoundary>
              <Suspense fallback={<RouteLoadingFallback />}>
                {renderView()}
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
