import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, updateProfile as firebaseUpdateProfile, type Auth, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

function getApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return _app;
}

function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getApp());
  }
  return _auth;
}

export { GoogleAuthProvider, signInWithPopup };

async function saveTokensToCookies(user: User) {
  try {
    const tokenResult = await user.getIdTokenResult();
    const idToken = await user.getIdToken();
    const refreshToken = (user as any).refreshToken;

    await fetch('/api/auth/firebase-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        refreshToken,
        expiresIn: 3600,
      }),
    });
  } catch {}
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const auth = getFirebaseAuth();
  try {
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    await saveTokensToCookies(result.user);
    return { idToken, user: result.user };
  } catch (err: any) {
    // Brave/browser blocks popup due to Trusted Types — fall back to redirect
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/popup-closed-by-user' ||
      err.code === 'auth/cancelled-popup-request' ||
      err.message?.includes('TrustedHTML') ||
      err.message?.includes('trustedTypes')
    ) {
      await signInWithRedirect(auth, provider);
      // Page will redirect — this line won't execute
      return { idToken: '', user: null as any };
    }
    throw err;
  }
}

export async function handleGoogleRedirectResult(): Promise<{ idToken: string; user: User } | null> {
  try {
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (result?.user) {
      const idToken = await result.user.getIdToken();
      await saveTokensToCookies(result.user);
      return { idToken, user: result.user };
    }
  } catch {}
  return null;
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  const idToken = await result.user.getIdToken();
  await saveTokensToCookies(result.user);
  return { idToken, user: result.user };
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  const actionCodeSettings = {
    url: `${window.location.origin}/callback`,
    handleCodeInApp: false,
  };
  await sendEmailVerification(result.user, actionCodeSettings);
  const idToken = await result.user.getIdToken();
  await saveTokensToCookies(result.user);
  return { idToken, user: result.user };
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}

export async function sendMagicLink(email: string) {
  // Include the email in the link URL so the sign-in works even when the link is
  // opened on a different device/browser (where localStorage — the classic
  // "emailForSignIn" storage — is empty). We still store it locally as a
  // fallback for the same-device case.
  const emailParam = encodeURIComponent(email);
  const actionCodeSettings = {
    url: `${window.location.origin}/auth/magic-link?email=${emailParam}`,
    // Must be true so the oobCode is carried through to our in-app callback
    // (/auth/magic-link). With false, Firebase's hosted handler consumes the
    // code and the link never resolves as a sign-in link in our app.
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(getFirebaseAuth(), email, actionCodeSettings);
  window.localStorage.setItem('emailForSignIn', email);
}

export function isMagicLink(): boolean {
  return isSignInWithEmailLink(getFirebaseAuth(), window.location.href);
}

export async function completeMagicLinkSignIn() {
  // Prefer the email carried in the link URL (works cross-device/cross-browser),
  // falling back to the locally-stored email from when the link was requested.
  const urlEmail = new URLSearchParams(window.location.search).get('email');
  const email = urlEmail || window.localStorage.getItem('emailForSignIn');
  if (!email) throw new Error('No email found. Please enter your email again.');
  const result = await signInWithEmailLink(getFirebaseAuth(), email, window.location.href);
  window.localStorage.removeItem('emailForSignIn');
  const idToken = await result.user.getIdToken();
  await saveTokensToCookies(result.user);
  return { idToken, user: result.user };
}

export async function updateUserProfile(displayName?: string, photoURL?: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not logged in');
  const updates: { displayName?: string; photoURL?: string } = {};
  if (displayName !== undefined) updates.displayName = displayName;
  if (photoURL !== undefined) updates.photoURL = photoURL;
  await firebaseUpdateProfile(user, updates);
  return user;
}

export async function changePassword(newPassword: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not logged in');
  const { updatePassword } = await import('firebase/auth');
  await updatePassword(user, newPassword);
}

export async function reauthenticateAndSetPassword(currentPassword: string, newPassword: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Not logged in');
  const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
  const credential = EmailAuthProvider.credential(user.email!, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function hasPasswordProvider(): Promise<boolean> {
  try {
    const user = await waitForCurrentUser(3000);
    await user.reload();
    return user.providerData.some(p => p.providerId === 'password');
  } catch {
    return false;
  }
}

function waitForCurrentUser(timeoutMs = 5000): Promise<User> {
  return new Promise((resolve, reject) => {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (user) return resolve(user);
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      if (u) resolve(u);
      else reject(new Error('Not logged in'));
    });
    setTimeout(() => { unsub(); reject(new Error('Not logged in')); }, timeoutMs);
  });
}

export async function setInitialPassword(email: string, newPassword: string) {
  const user = await waitForCurrentUser();
  const { updatePassword } = await import('firebase/auth');
  await updatePassword(user, newPassword);
}

// When Google sign-in hits `auth/account-exists-with-different-credential`, the
// error carries the Google OAuth credential and the email of the existing
// password account. Extract the credential so it can be linked below.
export function googleCredentialFromError(err: any): any {
  return GoogleAuthProvider.credentialFromError(err);
}

// One-time linking started from "Continue with Google": the pending Google
// credential + email are stored in localStorage by the login modal. We sign
// into the EXISTING account with its password, attach the Google identity to
// it, and clean up — afterwards Google sign-in just works for that email.
export async function linkGoogleWithStoredCredential(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem('pendingGoogleLink') : null;
  const pending = raw ? JSON.parse(raw) : null;
  const userCred = await signInWithEmailAndPassword(auth, email, password);
  if (pending && (pending.accessToken || pending.idToken)) {
    const { linkWithCredential } = await import('firebase/auth');
    await linkWithCredential(userCred.user, GoogleAuthProvider.credential(pending.idToken || null, pending.accessToken || null));
  }
  if (typeof window !== 'undefined') window.localStorage.removeItem('pendingGoogleLink');
  return userCred.user;
}

// Attach a stored pending Google credential to the ALREADY signed-in user. Used
// by the magic-link page: the one-time link proves ownership of that email,
// then Google gets connected automatically — so "Continue with Google" works
// from then on with no password needed.
export async function linkCurrentUserWithGoogle(): Promise<boolean> {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem('pendingGoogleLink') : null;
  if (!raw) return false;
  let pending: any = null;
  try { pending = JSON.parse(raw); } catch { return false; }
  if (!pending || (!pending.accessToken && !pending.idToken)) return false;
  const { getAuth, linkWithCredential } = await import('firebase/auth');
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user || !user.email) return false;
  if (pending.email && user.email.toLowerCase() !== pending.email.toLowerCase()) return false;
  await linkWithCredential(user, GoogleAuthProvider.credential(pending.idToken || null, pending.accessToken || null));
  if (typeof window !== 'undefined') window.localStorage.removeItem('pendingGoogleLink');
  return true;
}
