import { APP_VERSION, BUILD_SHA } from './config';

const VERSION_KEY = 'qsis-app-version';
const PRESERVE_KEYS = [
  'next-auth.session-token',
  'next-auth.callback-url',
  'next-auth.csrf-token',
  'emailForSignIn',
  'iiuc_arms-onboarding',
  'iiuc_arms-onboard-dismissed',
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
        const t = window.setTimeout(() => resolve(false), 10000);
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

// Watch for app updates automatically: check right away, again whenever the tab
// regains focus/visibility, and every 5 minutes. Calls onUpdate(true) whenever a
// newer deploy is live. Returns a cleanup function.
export function startUpdateWatcher(onUpdate: (hasUpdate: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let stopped = false;
  let checking = false;

  const check = async () => {
    if (stopped || checking) return;
    checking = true;
    try {
      const has = await checkForAppUpdate();
      if (!stopped) onUpdate(has);
    } catch {} finally {
      checking = false;
    }
  };

  const onFocus = () => check();
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };

  check();
  const interval = window.setInterval(check, 5 * 60 * 1000);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// Install the latest build and reload the page. Lets a newly-installed service
// worker (which skip-waits + claims clients) take over, then reloads so the page
// actually runs the fresh code. Falls back to a hard refresh when no SW exists.
export async function applyAppUpdate(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const newWorker = reg.waiting || reg.installing;
        if (newWorker && newWorker.postMessage) newWorker.postMessage({ type: 'SKIP_WAITING' });
        else await reg.update();

        await new Promise<void>((resolve) => {
          const t = window.setTimeout(resolve, 2500);
          const done = () => { window.clearTimeout(t); resolve(); };
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
          } else {
            window.setTimeout(done, 800);
          }
        });
        window.location.reload();
        return;
      }
    } catch {}
  }

  await hardRefresh();
}
