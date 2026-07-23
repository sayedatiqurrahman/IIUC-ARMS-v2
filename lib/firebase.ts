import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile as firebaseUpdateProfile, type Auth, type User } from 'firebase/auth';

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
  const result = await signInWithPopup(getFirebaseAuth(), provider);
  const idToken = await result.user.getIdToken();
  await saveTokensToCookies(result.user);
  return { idToken, user: result.user };
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  const idToken = await result.user.getIdToken();
  await saveTokensToCookies(result.user);
  return { idToken, user: result.user };
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  await sendEmailVerification(result.user);
  const idToken = await result.user.getIdToken();
  await saveTokensToCookies(result.user);
  return { idToken, user: result.user };
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
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

export async function logoutFirebase() {
  await getFirebaseAuth().signOut();
  await fetch('/api/auth/firebase-session', { method: 'DELETE' });
}
