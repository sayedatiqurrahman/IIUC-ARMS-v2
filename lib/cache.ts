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

export async function checkForAppUpdate(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;

    const found = new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (result: boolean) => { if (!done) { done = true; resolve(result); } };

      const onFound = () => {
        const worker = reg.installing;
        if (!worker) { finish(false); return; }
        const onState = () => {
          if (worker.state === 'installed' || worker.state === 'activated') {
            worker.removeEventListener('statechange', onState);
            finish(true);
          }
        };
        worker.addEventListener('statechange', onState);
      };

      if (reg.installing || reg.waiting) onFound();
      else reg.addEventListener('updatefound', onFound, { once: true });
    });

    await reg.update();

    return await found;
  } catch {
    return false;
  }
}

export async function hardRefresh(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch {}
  }

  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    } catch {}
  }

  window.location.reload();
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
