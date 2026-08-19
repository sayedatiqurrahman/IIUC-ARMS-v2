const CACHE_NAME = 'iiuc-files-v1';
const STORAGE_KEY = 'iiuc_file_cache_ttl';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const TTL_OPTIONS = [
  { value: 1, label: '1 Day', ms: 1 * 24 * 60 * 60 * 1000 },
  { value: 7, label: '7 Days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: 14, label: '14 Days', ms: 14 * 24 * 60 * 60 * 1000 },
  { value: 30, label: '30 Days (Default)', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: 60, label: '60 Days', ms: 60 * 24 * 60 * 60 * 1000 },
  { value: 90, label: '90 Days', ms: 90 * 24 * 60 * 60 * 1000 },
  { value: -1, label: 'Never expire', ms: Infinity },
] as const;

export function getUserTTL(): number {
  if (typeof window === 'undefined') return DEFAULT_TTL_MS;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === null) return DEFAULT_TTL_MS;
    const num = Number(val);
    if (num === -1) return Infinity;
    return num * 24 * 60 * 60 * 1000;
  } catch { return DEFAULT_TTL_MS; }
}

export function setUserTTL(days: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(days)); } catch {}
}

// ─── IndexedDB for tracking access timestamps ───
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    const req = indexedDB.open('iiuc-file-cache', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAccessTime(url: string): Promise<number> {
  try {
    const db = await openDB();
    return new Promise<number>((resolve) => {
      const tx = db.transaction('meta', 'readonly');
      const req = tx.objectStore('meta').get(url);
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch { return 0; }
}

async function setAccessTime(url: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(Date.now(), url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function deleteAccessTime(url: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

// ─── Cache API layer ───
async function getCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch { return null; }
}

export async function cachedFetch(url: string): Promise<Response> {
  const cache = await getCache();
  if (!cache) return fetch(url);

  const cached = await cache.match(url);
  if (cached) {
    setAccessTime(url);
    return cached;
  }

  const res = await fetch(url);
  if (res.ok) {
    const toCache = res.clone();
    try { await cache.put(url, toCache); } catch {}
    setAccessTime(url);
  }
  return res;
}

export async function cachedFetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await cachedFetch(url);
  return res.arrayBuffer();
}

export async function cachedFetchBlobUrl(url: string): Promise<string> {
  const res = await cachedFetch(url);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function purgeExpiredCache(): Promise<number> {
  const ttlMs = getUserTTL();
  if (!isFinite(ttlMs)) return 0; // "Never" selected

  const cache = await getCache();
  if (!cache) return 0;

  const now = Date.now();
  let purged = 0;

  try {
    const db = await openDB();
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const req = store.openCursor();

    const expiredKeys: string[] = [];

    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        const url = cursor.key as string;
        const lastAccess = cursor.value as number;
        if (now - lastAccess > ttlMs) {
          expiredKeys.push(url);
        }
        cursor.continue();
      };
      req.onerror = () => resolve();
    });

    for (const url of expiredKeys) {
      await cache.delete(url);
      await deleteAccessTime(url);
      purged++;
    }
  } catch {}

  return purged;
}

export async function getCacheStats(): Promise<{ entries: number; totalSize: number }> {
  const cache = await getCache();
  if (!cache) return { entries: 0, totalSize: 0 };
  const keys = await cache.keys();
  let totalSize = 0;
  for (const req of keys) {
    try {
      const res = await cache.match(req);
      if (res) {
        const blob = await res.blob();
        totalSize += blob.size;
      }
    } catch {}
  }
  return { entries: keys.length, totalSize };
}

export async function clearFileCache(): Promise<void> {
  const cache = await getCache();
  if (cache) await caches.delete(CACHE_NAME);

  try {
    const db = await openDB();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').clear();
  } catch {}
}
