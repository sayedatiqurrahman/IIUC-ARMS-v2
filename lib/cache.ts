import { APP_VERSION } from './config';

const VERSION_KEY = 'qsis-app-version';
const PRESERVE_KEYS = [
  'next-auth.session-token',
  'next-auth.callback-url',
  'next-auth.csrf-token',
  'emailForSignIn',
  'qsis_onboarding',
  'qsis_onboarding_cancel_forever',
  'qsis_onboarding_cancel_count',
];

export function checkAndBustCache(): boolean {
  try {
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored && stored !== APP_VERSION) {
      clearAppCache();
      localStorage.setItem(VERSION_KEY, APP_VERSION);
      return true;
    }
    if (!stored) {
      localStorage.setItem(VERSION_KEY, APP_VERSION);
    }
  } catch {}
  return false;
}

export function clearAppCache(): void {
  try {
    const preserved: Record<string, string> = {};
    for (const key of PRESERVE_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) preserved[key] = val;
    }
    const profileRaw = localStorage.getItem('qsis_profile');
    if (profileRaw) preserved['qsis_profile'] = profileRaw;

    localStorage.clear();

    for (const [key, val] of Object.entries(preserved)) {
      localStorage.setItem(key, val);
    }
  } catch {}

  if ('caches' in window) {
    caches.keys().then(keys => {
      for (const key of keys) {
        caches.delete(key);
      }
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const reg of regs) {
        reg.unregister();
      }
    });
  }
}

export function forceResetApp(): void {
  try {
    localStorage.clear();
  } catch {}

  if ('caches' in window) {
    caches.keys().then(keys => {
      for (const key of keys) {
        caches.delete(key);
      }
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const reg of regs) {
        reg.unregister();
      }
    });
  }

  window.location.href = '/';
}
