let _app: any = null;
let _adminAuth: any = null;
let _initError = false;
let _initialized = false;
let _initErrorMessage: string | null = null;

// Default location of the Firebase service-account JSON (repo root). Override
// with FIREBASE_SERVICE_ACCOUNT_PATH. This file is git-ignored
// (*-firebase-adminsdk-*.json) so the private key is never committed.
const FIREBASE_SERVICE_ACCOUNT_FILE = 'qsis-arms-firebase-adminsdk-fbsvc-d8ac87ef6e.json';

function loadPrivateKey(raw?: string) {
  if (!raw) return undefined;
  let v = raw.trim();
  // Fire up `\n` escapes that hosting dashboards sometimes store literally.
  v = v.replace(/\\n/g, '\n');
  // Strip any surrounding quotes.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

function resolveCredential(cert: any) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

  // 1) Full service-account JSON in a single env var.
  if (serviceAccount) {
    try {
      const parsed = JSON.parse(serviceAccount);
      if (parsed && typeof parsed === 'object' && parsed.private_key) {
        return cert(parsed);
      }
    } catch {}
    // 2) Raw PEM private key pasted into that var.
    if (/^-----BEGIN/.test(serviceAccount)) {
      return cert({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: loadPrivateKey(serviceAccount),
      });
    }
  }

  // 3) Read the service-account JSON from disk (repo root, or a custom path).
  const relPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || FIREBASE_SERVICE_ACCOUNT_FILE;
  if (relPath) {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), relPath);
      if (fs.existsSync(filePath)) {
        return cert(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      }
    } catch {}
  }

  // 4) Individual service-account fields.
  return cert({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: loadPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  });
}

function initFirebase() {
  if (_initialized) return;
  _initialized = true;
  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');

    if (getApps().length === 0) {
      _app = initializeApp({ credential: resolveCredential(cert) });
    } else {
      _app = getApps()[0];
    }
    _adminAuth = getAuth(_app);
  } catch (err: any) {
    _initError = true;
    _initErrorMessage = err?.message || String(err);
  }
}

export function getAdminAuth() {
  initFirebase();
  return _adminAuth;
}

export function getFirebaseInitError() {
  initFirebase();
  return _initErrorMessage;
}

// Lazy proxy — calling any method on adminAuth triggers init first
export const adminAuth = new Proxy({} as any, {
  get(_target, prop) {
    initFirebase();
    if (!_adminAuth) return undefined;
    const val = (_adminAuth as any)[prop];
    if (typeof val === 'function') return val.bind(_adminAuth);
    return val;
  },
});

export default _app;