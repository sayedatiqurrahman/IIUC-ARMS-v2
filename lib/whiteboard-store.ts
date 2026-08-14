// Whiteboard drafts persisted on-device. Primary store is IndexedDB
// (database `qsis-arms`, store `whiteboards`); if IndexedDB is unavailable we
// fall back to localStorage. A "scene" is the serialized Excalidraw scene JSON
// produced by serializeAsJSON() — empty string means a fresh, untouched board.

export interface WhiteboardDraft {
  id: string;
  title: string;
  updatedAt: number; // epoch ms
  scene: string; // serialized Excalidraw scene JSON ("" for a fresh board)
}

export interface WhiteboardMeta {
  id: string;
  title: string;
  updatedAt: number;
}

const DB_NAME = 'qsis-arms';
const DB_VERSION = 1;
const STORE = 'whiteboards';
const LS_KEY = 'qsis-whiteboard-drafts-v1';

export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `wb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- IndexedDB plumbing ---------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
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

function lsGetAll(): Map<string, WhiteboardDraft> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as WhiteboardDraft[];
    return new Map(arr.map((d) => [d.id, d]));
  } catch {
    return new Map();
  }
}

function lsWrite(map: Map<string, WhiteboardDraft>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(map.values())));
  } catch {
    // storage full / unavailable — keep working in memory only
  }
}

// ---- Public API ------------------------------------------------------------

export async function listDraftMeta(): Promise<WhiteboardMeta[]> {
  const db = await getDb();
  if (db) {
    try {
      const all = await reqToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<WhiteboardDraft[]>);
      return all
        .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      // fall through to localStorage
    }
  }
  return Array.from(lsGetAll().values())
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDraft(id: string): Promise<WhiteboardDraft | null> {
  const db = await getDb();
  if (db) {
    try {
      return (await reqToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<WhiteboardDraft | undefined>)) ?? null;
    } catch {
      // fall through to localStorage
    }
  }
  return lsGetAll().get(id) ?? null;
}

export async function saveDraft(id: string, title: string, scene: string): Promise<void> {
  const draft: WhiteboardDraft = { id, title, scene, updatedAt: Date.now() };
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(draft));
      return;
    } catch {
      // fall through to localStorage
    }
  }
  const map = lsGetAll();
  map.set(id, draft);
  lsWrite(map);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await reqToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id) as IDBRequest<undefined>);
      return;
    } catch {
      // fall through to localStorage
    }
  }
  const map = lsGetAll();
  map.delete(id);
  lsWrite(map);
}
