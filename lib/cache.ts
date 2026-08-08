import { APP_VERSION, BUILD_SHA } from './config';

const VERSION_KEY = 'qsis-app-version';
const PRESERVE_KEYS = [
  'next-auth.session-token',
  'next-auth.callback-url',
  'next-auth.csrf-token',
  'emailForSignIn',
  'iiuc_arms-onboarding',
  'iiuc_arms-onboard-cancel-forever',
  'iiuc_arms-onboard-cancel-count',
  'qsis-onboarding',
  'qsis-onboard-cancel-forever',
  'qsis-onboard-cancel-count',
];

// The SW keeps hashed build assets (/_next/static/*) in this cache forever so
// the installed app launches instantly. It must NEVER be wiped here — old hashes
// are harmless and new ones are added as the updated shell loads.
const IMMUTABLE_CACHE_PREFIX = 'iiuc-arms-immutable-';

async function deleteCachesExceptImmutable(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith(IMMUTABLE_CACHE_PREFIX)) continue;
    await caches.delete(key);
  }
}

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
    deleteCachesExceptImmutable();
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
  if (typeof window === 'undefined') return false;

  // Primary check: the deployed commit SHA vs the SHA this build was compiled from.
  // Vercel injects NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA at build time; /api/version
  // returns the SHA of whatever is live now. If they differ, a newer deploy exists.
  if (BUILD_SHA) {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.sha) return data.sha !== BUILD_SHA;
      }
    } catch {}
  }

  // Fallback: compare the service-worker script bytes (browser-native update check).
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;

    const prevActive = reg.active;

    await reg.update();

    const worker = reg.installing || reg.waiting;
    if (worker) {
      if (worker.state === 'installed' || worker.state === 'activated') return true;
      return await new Promise<boolean>((resolve) => {
        const t = window.setTimeout(() => resolve(true), 10000);
        const onState = () => {
          if (worker.state === 'installed' || worker.state === 'activated') {
            worker.removeEventListener('statechange', onState);
            window.clearTimeout(t);
            resolve(true);
          }
        };
        worker.addEventListener('statechange', onState);
      });
    }

    return reg.active !== prevActive;
  } catch {
    return false;
  }
}

export async function hardRefresh(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('caches' in window) {
    try {
      await deleteCachesExceptImmutable();
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
    deleteCachesExceptImmutable();
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
