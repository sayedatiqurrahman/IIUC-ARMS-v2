const CACHE_NAME = 'iiuc-files-v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

/**
 * Fetch a URL with cache-first strategy (30-day TTL).
 * Returns the cached response if fresh, otherwise fetches from network,
 * stores it, and returns it.
 */
export async function cachedFetch(url: string): Promise<Response> {
  const cache = await getCache();
  if (!cache) return fetch(url);

  // Check cache
  const cached = await cache.match(url);
  if (cached) {
    // Touch access time (fire and forget)
    setAccessTime(url);
    return cached;
  }

  // Fetch from network
  const res = await fetch(url);
  if (res.ok) {
    // Clone before consuming — store in cache
    const toCache = res.clone();
    try { await cache.put(url, toCache); } catch {}
    setAccessTime(url);
  }
  return res;
}

/**
 * Fetch URL and return as ArrayBuffer, with caching.
 */
export async function cachedFetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await cachedFetch(url);
  return res.arrayBuffer();
}

/**
 * Fetch URL and return as Blob URL, with caching.
 * The caller is responsible for revoking the URL when done.
 */
export async function cachedFetchBlobUrl(url: string): Promise<string> {
  const res = await cachedFetch(url);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Purge expired entries (older than 30 days since last access).
 * Call on app init or periodically.
 */
export async function purgeExpiredCache(): Promise<number> {
  const cache = await getCache();
  if (!cache) return 0;

  const now = Date.now();
  let purged = 0;

  try {
    const db = await openDB();
    const tx = db.transaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    const req = store.openCursor();

    // Collect expired keys first (can't delete during iteration)
    const expiredKeys: string[] = [];

    await new Promise<void>((resolve) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        const url = cursor.key as string;
        const lastAccess = cursor.value as number;
        if (now - lastAccess > TTL_MS) {
          expiredKeys.push(url);
        }
        cursor.continue();
      };
      req.onerror = () => resolve();
    });

    // Delete expired entries
    for (const url of expiredKeys) {
      await cache.delete(url);
      await deleteAccessTime(url);
      purged++;
    }
  } catch {}

  return purged;
}

/**
 * Get cache size info (approximate).
 */
export async function getCacheStats(): Promise<{ entries: number; keys: string[] }> {
  const cache = await getCache();
  if (!cache) return { entries: 0, keys: [] };
  const keys = await cache.keys();
  return { entries: keys.length, keys: keys.map(r => r.url) };
}

/**
 * Clear all cached files.
 */
export async function clearFileCache(): Promise<void> {
  const cache = await getCache();
  if (cache) await caches.delete(CACHE_NAME);

  try {
    const db = await openDB();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').clear();
  } catch {}
}
