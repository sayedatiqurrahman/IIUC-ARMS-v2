import type { BlogPostListItem, BlogCategory } from '@/lib/blog';

const DB_NAME = 'iiuc-blog-drafts';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';
const CONTENT_STORE = 'content';

function generateId(): string {
  return `blog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const store = db.createObjectStore(DRAFTS_STORE, { keyPath: 'slug' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('authorEmail', 'authorEmail', { unique: false });
      }
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        db.createObjectStore(CONTENT_STORE, { keyPath: 'slug' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Draft metadata CRUD ───

export async function listDrafts(authorEmail?: string): Promise<BlogPostListItem[]> {
  try {
    const db = await openDB();
    return new Promise<BlogPostListItem[]>((resolve) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        let results: BlogPostListItem[] = req.result || [];
        if (authorEmail) results = results.filter(d => d.authorEmail === authorEmail);
        results.sort((a, b) => (b.updatedAt || b.publishedAt).localeCompare(a.updatedAt || a.publishedAt));
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function getDraft(slug: string): Promise<BlogPostListItem | null> {
  try {
    const db = await openDB();
    return new Promise<BlogPostListItem | null>((resolve) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const req = tx.objectStore(DRAFTS_STORE).get(slug);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function saveDraft(draft: BlogPostListItem): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve) => {
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    tx.objectStore(DRAFTS_STORE).put(draft);
    tx.oncomplete = () => resolve();
  });
}

export async function deleteDraft(slug: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve) => {
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    tx.objectStore(DRAFTS_STORE).delete(slug);
    tx.oncomplete = () => resolve();
  });
}

// ─── Draft content (markdown) CRUD ───

export async function getDraftContent(slug: string): Promise<string> {
  try {
    const db = await openDB();
    return new Promise<string>((resolve) => {
      const tx = db.transaction(CONTENT_STORE, 'readonly');
      const req = tx.objectStore(CONTENT_STORE).get(slug);
      req.onsuccess = () => resolve(req.result?.content || '');
      req.onerror = () => resolve('');
    });
  } catch { return ''; }
}

export async function saveDraftContent(slug: string, content: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve) => {
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    tx.objectStore(CONTENT_STORE).put({ slug, content });
    tx.oncomplete = () => resolve();
  });
}

export async function deleteDraftContent(slug: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve) => {
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    tx.objectStore(CONTENT_STORE).delete(slug);
    tx.oncomplete = () => resolve();
  });
}

// ─── Thumbnail blob storage ───

const THUMB_STORE = 'thumbnails';

function ensureThumbStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(THUMB_STORE)) {
    db.createObjectStore(THUMB_STORE, { keyPath: 'slug' });
  }
}

export async function saveDraftThumbnailBlob(slug: string, blob: Blob, previewUrl: string): Promise<void> {
  const db = await openDB();
  if (!db.objectStoreNames.contains(THUMB_STORE)) {
    db.close();
    const req2 = indexedDB.open(DB_NAME, DB_VERSION + 1);
    await new Promise<void>((resolve) => {
      req2.onupgradeneeded = () => ensureThumbStore(req2.result);
      req2.onsuccess = () => { req2.result.close(); resolve(); };
    });
    return saveDraftThumbnailBlob(slug, blob, previewUrl);
  }
  return new Promise<void>((resolve) => {
    const tx = db.transaction(THUMB_STORE, 'readwrite');
    tx.objectStore(THUMB_STORE).put({ slug, blob, previewUrl });
    tx.oncomplete = () => resolve();
  });
}

export async function getDraftThumbnailBlob(slug: string): Promise<{ blob: Blob; previewUrl: string } | null> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(THUMB_STORE)) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(THUMB_STORE, 'readonly');
      const req = tx.objectStore(THUMB_STORE).get(slug);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function deleteDraftThumbnailBlob(slug: string): Promise<void> {
  try {
    const db = await openDB();
    if (!db.objectStoreNames.contains(THUMB_STORE)) return;
    return new Promise<void>((resolve) => {
      const tx = db.transaction(THUMB_STORE, 'readwrite');
      tx.objectStore(THUMB_STORE).delete(slug);
      tx.oncomplete = () => resolve();
    });
  } catch {}
}

// ─── Helpers ───

export function newDraftId(): string {
  return generateId();
}

export function buildDraftSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export function createDraftListItem(opts: {
  slug: string; title: string; category: BlogCategory;
  excerpt?: string; tags?: string[]; thumbnailUrl?: string;
  authorLogin: string; authorName: string; authorAvatar: string; authorEmail: string;
  id?: string; existingDraft?: BlogPostListItem;
}): BlogPostListItem {
  const now = new Date().toISOString();
  return {
    id: opts.existingDraft?.id || opts.id || generateId(),
    slug: opts.slug,
    folderName: opts.slug,
    title: opts.title,
    category: opts.category,
    excerpt: opts.excerpt || '',
    thumbnailUrl: opts.thumbnailUrl,
    authorLogin: opts.authorLogin,
    authorName: opts.authorName,
    authorAvatar: opts.authorAvatar,
    authorEmail: opts.authorEmail,
    publishedAt: opts.existingDraft?.publishedAt || now,
    updatedAt: now,
    tags: opts.tags || [],
    status: 'draft',
  };
}
