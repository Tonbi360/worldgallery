'use client';

let deferredInstallPrompt: any = null;
let promptCapturedAt: string | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    promptCapturedAt = new Date().toISOString();
    window.dispatchEvent(new Event('pwa-install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    promptCapturedAt = null;
    window.dispatchEvent(new Event('pwa-installed'));
  });
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isWebkit = /WebKit/i.test(ua);
  return isIos && isWebkit && !isStandaloneMode();
}

export function isInstallPromptCaptured(): boolean {
  return !!deferredInstallPrompt;
}

export function getInstallPromptTimestamp(): string | null {
  return promptCapturedAt;
}

export function canPromptNativeInstall(): boolean {
  return !!deferredInstallPrompt;
}

export async function promptPWAInstall(): Promise<'accepted' | 'dismissed' | 'manual-ios' | 'already-installed' | 'not-ready'> {
  if (isStandaloneMode()) {
    return 'already-installed';
  }

  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return outcome;
    } catch {
      return 'not-ready';
    }
  }

  if (isIosSafari()) {
    return 'manual-ios';
  }

  return 'not-ready';
}
