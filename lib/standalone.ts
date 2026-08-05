'use client';

// True when the app is running as an installed, standalone window (PWA)
// rather than in a normal browser tab. Matches all display modes we declare
// in the manifest: window-controls-overlay, standalone, fullscreen, minimal-ui.
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((navigator as any).standalone === true) return true; // iOS Safari
    const modes = ['window-controls-overlay', 'standalone', 'fullscreen', 'minimal-ui'];
    if (window.matchMedia) {
      for (const m of modes) {
        if (window.matchMedia(`(display-mode: ${m})`).matches) return true;
      }
    }
  } catch {}
  return false;
}

export function isInBrowser(): boolean {
  return !isStandalone();
}

export function isIOSBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
