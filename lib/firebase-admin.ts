let _app: any = null;
let _adminAuth: any = null;
let _initError = false;
let _initialized = false;

function initFirebase() {
  if (_initialized) return;
  _initialized = true;
  try {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');

    if (getApps().length === 0) {
      _app = initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
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
