// Creative Hub drafts + last-session persisted on-device. Primary store is
// IndexedDB (database `qsis-arms`, stores `creative-hub-drafts` and
// `creative-hub-session`); if IndexedDB is unavailable we fall back to
// localStorage. Personal work never leaves the device — publishing is an
// explicit user action to the community GitHub repo.

export interface CreativeHubDraft {
  id: string;
  name: string;
  templateId: string;
  mode: 'form-fill' | 'auto-fill' | 'manual';
  fields: Record<string, string>;
  layers: unknown; // fabric canvas JSON (null for HTML designs)
  html: string; // raw design HTML (from template or published)
  metadata: Record<string, string>;
  pageSize: string;
  updatedAt: number;
  createdAt: number;
}

export interface CreativeHubSession {
  draftId: string;
  templateId: string;
  updatedAt: number;
}

const DB_NAME = 'qsis-arms';
const DB_VERSION = 2;
const DRAFTS_STORE = 'creative-hub-drafts';
const SESSION_STORE = 'creative-hub-session';
const LS_DRAFTS_KEY = 'qsis-creative-hub-drafts-v1';
const LS_SESSION_KEY = 'qsis-creative-hub-session-v1';

export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- IndexedDB plumbing ---------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) db.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SESSION_STORE)) db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = openDb().then(
      (db) => db,
      () => null
    );
  }
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- localStorage fallback ------------------------------------------------

function lsGetAll(): Map<string, CreativeHubDraft> {
  try {
    const raw = localStorage.getItem(LS_DRAFTS_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as CreativeHubDraft[];
    return new Map(arr.map((d) => [d.id, d]));
  } catch {
    return new Map();
  }
}

function lsWrite(map: Map<string, CreativeHubDraft>) {
  try {
    localStorage.setItem(LS_DRAFTS_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // storage full / unavailable — keep working in memory only
  }
}

function lsGetSession(): CreativeHubSession | null {
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    return raw ? (JSON.parse(raw) as CreativeHubSession) : null;
  } catch {
    return null;
  }
}

// ---- Public API ------------------------------------------------------------

export async function listDraftMeta(): Promise<CreativeHubDraft[]> {
  const db = await getDb();
  if (db) {
    try {
      const all = await reqToPromise(db.transaction(DRAFTS_STORE, 'readonly').objectStore(DRAFTS_STORE).getAll() as IDBRequest<CreativeHubDraft[]>);
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      // fall through to localStorage
    }
  }
  return Array.from(lsGetAll().values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(id: string): Promise<CreativeHubDraft | null> {
  const db = await getDb();
  if (db) {
    try {
      return (await reqToPromise(db.transaction(DRAFTS_STORE, 'readonly').objectStore(DRAFTS_STORE).get(id) as IDBRequest<CreativeHubDraft | undefined>)) ?? null;
    } catch {
      // fall through to localStorage
    }
  }
  return lsGetAll().get(id) ?? null;
}

export async function saveDraft(draft: CreativeHubDraft): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(db.transaction(DRAFTS_STORE, 'readwrite').objectStore(DRAFTS_STORE).put(draft));
      return;
    } catch {
      // fall through to localStorage
    }
  }
  const map = lsGetAll();
  map.set(draft.id, draft);
  lsWrite(map);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(db.transaction(DRAFTS_STORE, 'readwrite').objectStore(DRAFTS_STORE).delete(id) as IDBRequest<undefined>);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  const map = lsGetAll();
  map.delete(id);
  lsWrite(map);
}

export async function saveSession(session: CreativeHubSession): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(db.transaction(SESSION_STORE, 'readwrite').objectStore(SESSION_STORE).put(session));
      return;
    } catch {
      // fall through
    }
  }
  try {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export async function getSession(): Promise<CreativeHubSession | null> {
  const db = await getDb();
  if (db) {
    try {
      return (await reqToPromise(db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE).get('last') as IDBRequest<CreativeHubSession | undefined>)) ?? null;
    } catch {
      // fall through to localStorage
    }
  }
  return lsGetSession();
}
