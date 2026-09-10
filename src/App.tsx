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
import { AuthProvider } from './lib/authContext';

function RouteLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full bg-[#F2F2F7]">
      <BrandLoader size="lg" ariaLabel="Loading World Gallery..." />
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
      case '/reset':
        return (
          <ResetPasswordPage
            onNavigate={handleNavigate}
            onBack={() => handleNavigate('/apply/signin')}
          />
        );

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
          <WaitingRoom
            initialState="rejected"
            onNavigate={handleNavigate}
            onBack={handleBack}
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
    <AuthProvider>
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
    </AuthProvider>
  );
}
