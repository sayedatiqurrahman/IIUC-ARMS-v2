/**
 * IndexedDB-based PDF byte cache with LRU eviction.
 *
 * Stores raw PDF ArrayBuffer data keyed by proxy URL. Provides:
 * - Fast retrieval (IndexedDB get)
 * - LRU eviction (max entries + max total size)
 * - Version-based cache invalidation
 * - Stats reporting
 *
 * Storage schema (IndexedDB "iiuc-pdf-cache" / store "pdfs"):
 *   key: string (proxy URL)
 *   value: { bytes: ArrayBuffer, timestamp: number, size: number, name: string }
 */

const DB_NAME = 'iiuc-pdf-cache';
const DB_VERSION = 1;
const STORE = 'pdfs';
const MAX_ENTRIES = 50;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB
const CACHE_VERSION = 'v1';

export interface PdfCacheEntry {
  bytes: ArrayBuffer;
  timestamp: number;
  size: number;
  name: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Get a cached PDF by proxy URL. Returns null if not cached. */
export async function getPdfFromCache(url: string): Promise<PdfCacheEntry | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const entry = req.result as PdfCacheEntry | undefined;
        if (entry && entry.bytes) {
          resolve(entry);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Store a PDF in the cache. Triggers LRU eviction if limits exceeded. */
export async function storePdfInCache(url: string, bytes: ArrayBuffer, name: string): Promise<void> {
  try {
    const db = await openDB();
    const entry: PdfCacheEntry = {
      bytes,
      timestamp: Date.now(),
      size: bytes.byteLength,
      name,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(entry, url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Run LRU eviction after storing
    await evictLRU();
  } catch {
    // Silently fail — offline cache is best-effort
  }
}

/** Remove a specific PDF from cache. */
export async function removePdfFromCache(url: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

/** Clear all cached PDFs. */
export async function clearPdfCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

/** Get cache stats (count + total size). */
export async function getPdfCacheStats(): Promise<{ count: number; totalBytes: number }> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      let count = 0;
      let totalBytes = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          count++;
          const entry = cursor.value as PdfCacheEntry;
          totalBytes += entry.size || 0;
          cursor.continue();
        } else {
          resolve({ count, totalBytes });
        }
      };
      req.onerror = () => resolve({ count: 0, totalBytes: 0 });
    });
  } catch {
    return { count: 0, totalBytes: 0 };
  }
}

/** LRU eviction: remove oldest entries when limits are exceeded. */
async function evictLRU(): Promise<void> {
  try {
    const db = await openDB();
    const entries = await new Promise<Array<{ key: string; entry: PdfCacheEntry }>>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      const results: Array<{ key: string; entry: PdfCacheEntry }> = [];
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          results.push({ key: cursor.key as string, entry: cursor.value as PdfCacheEntry });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => resolve([]);
    });

    // Sort by timestamp ascending (oldest first)
    entries.sort((a, b) => a.entry.timestamp - b.entry.timestamp);

    let totalBytes = entries.reduce((sum, e) => sum + (e.entry.size || 0), 0);
    const toRemove: string[] = [];

    // Remove by count limit
    while (entries.length - toRemove.length > MAX_ENTRIES) {
      const oldest = entries.find(e => !toRemove.includes(e.key));
      if (oldest) toRemove.push(oldest.key);
      else break;
    }

    // Remove by size limit
    for (const e of entries) {
      if (toRemove.includes(e.key)) continue;
      if (totalBytes > MAX_TOTAL_BYTES) {
        toRemove.push(e.key);
        totalBytes -= e.entry.size || 0;
      } else break;
    }

    if (toRemove.length > 0) {
      const wtx = db.transaction(STORE, 'readwrite');
      const wstore = wtx.objectStore(STORE);
      for (const key of toRemove) wstore.delete(key);
    }
  } catch {
    // Ignore eviction errors
  }
}
