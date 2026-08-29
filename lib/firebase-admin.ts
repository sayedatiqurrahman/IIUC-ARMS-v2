let _app: any = null;
let _adminAuth: any = null;
let _initError = false;
let _initialized = false;

// Default location of the Firebase service-account JSON (repo root). Override
// with FIREBASE_SERVICE_ACCOUNT_PATH. This file is git-ignored
// (*-firebase-adminsdk-*.json) so the private key is never committed.
const FIREBASE_SERVICE_ACCOUNT_FILE = 'qsis-arms-firebase-adminsdk-fbsvc-d8ac87ef6e.json';

function resolveCredential(cert: any) {
  // 1) Full service-account JSON provided as an env var string.
  const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawEnv) {
    try { return cert(JSON.parse(rawEnv)); } catch {}
  }

  // 2) Read the service-account JSON from disk (repo root, or a custom path).
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

  // 3) Individual service-account fields.
  return cert({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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
  } catch {
    _initError = true;
  }
}

export function getAdminAuth() {
  initFirebase();
  return _adminAuth;
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