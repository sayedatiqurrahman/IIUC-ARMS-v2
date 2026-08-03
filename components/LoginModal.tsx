'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, sendMagicLink, handleGoogleRedirectResult } from '@/lib/firebase';
import { useTurnstile } from '@/lib/useTurnstile';
import { config } from '@/lib/config';
import { LoginForm, SignupForm, ForgotPassword } from '@/components/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  preRenderedTurnstileContainer?: string;
}

export default function LoginModal({ isOpen, onClose, preRenderedTurnstileContainer }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'magiclink'>('password');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [totpStep, setTotpStep] = useState(false);
  const [totpAvailable, setTotpAvailable] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [pendingCredentials, setPendingCredentials] = useState<{ idToken: string; email: string } | null>(null);
  const [magicLink2faSent, setMagicLink2faSent] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [bannedBy, setBannedBy] = useState<string | null>(null);
  const turnstileContainerId = 'login-turnstile-container';
  const { renderWidget, getToken, reset } = useTurnstile();
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (isOpen) {
      if (preRenderedTurnstileContainer) { setTurnstileReady(true); }
      else {
        const timer = setTimeout(() => { renderWidget(turnstileContainerId, 'LOGIN').then(() => setTurnstileReady(true)); }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, renderWidget, preRenderedTurnstileContainer]);

  useEffect(() => {
    if (!isOpen) {
      setEmail(''); setPassword(''); setError(''); setSuccess('');
      setShowForgotPassword(false); setForgotPasswordEmail(''); setForgotPasswordSent(false);
      setTurnstileReady(false); setLoginMode('password'); setMagicLinkSent(false);
      setTotpStep(false); setTotpAvailable(false); setTotpCode('');
      setPendingCredentials(null); setMagicLink2faSent(false);
      setBanReason(null); setBannedBy(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function verifyTurnstileToken(): Promise<boolean> {
    if (isDev) return true;
    const token = (preRenderedTurnstileContainer ? getToken(preRenderedTurnstileContainer) : null) || getToken(turnstileContainerId);
    if (!token) { setError('Please complete the captcha verification'); return false; }
    try {
      const res = await fetch('/api/auth/turnstile/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await res.json();
      if (!data.success) { setError('Captcha verification failed. Please try again.'); reset(); return false; }
      return true;
    } catch { setError('Captcha verification failed. Please try again.'); reset(); return false; }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      if (!isSignUp) {
        const banCheck = await fetch('/api/auth/check-ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const banData = await banCheck.json();
        if (banData.banned) {
          setBanReason(banData.banReason || null);
          setBannedBy(banData.bannedBy || null);
          setError('YOUR_ACCOUNT_IS_BANNED');
          setLoading(false);
          return;
        }
      }

      let user: any;
      if (isSignUp) {
        const turnstileValid = await verifyTurnstileToken();
        if (!turnstileValid) { setLoading(false); return; }

        const result = await signUpWithEmail(email, password);
        user = result.user;
        const isUni = isUniversityEmail(email);
        setSuccess(isUni
          ? 'Account created! A verification email has been sent to your inbox. Please verify your email before signing in. Check your spam/junk folder and "All Mail" if you don\'t see it.'
          : 'Account created! A verification email has been sent to your inbox. Note: Non-university emails require admin approval before you can access the system. Please verify your email, then wait for admin approval. Check your spam/junk folder and "All Mail" if you don\'t see it.');
        setIsSignUp(false);
        setLoading(false);
        return;
      } else {
        const result = await signInWithEmail(email, password);
        user = result.user;

        if (!user.emailVerified) {
          setError('YOUR_EMAIL_IS_NOT_VERIFIED');
          setLoading(false);
          return;
        }

        const idToken = await user.getIdToken();

        const totpRes = await fetch('/api/auth/totp/check?method=email', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const totpData = await totpRes.json();

        setPendingCredentials({ idToken, email });
        setTotpAvailable(totpRes.ok && !!totpData.totpEnabled);
        setTotpStep(true);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      const msg = err.code === 'auth/email-already-in-use' ? 'An account with this email already exists. Please sign in instead.'
        : err.code === 'auth/user-not-found' ? 'No account found with this email. Try signing up instead.'
        : err.code === 'auth/wrong-password' ? 'Incorrect password'
        : err.code === 'auth/invalid-email' ? 'Invalid email address'
        : err.code === 'auth/weak-password' ? 'Password must be at least 6 characters'
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Please try again later.'
        : 'Something went wrong. If you don\'t have an account, please sign up first.';
      setError(msg);
      reset();
    } finally { setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const { idToken, user } = await signInWithGoogle();

      const totpRes = await fetch('/api/auth/totp/check?method=google', { headers: { Authorization: `Bearer ${idToken}` } });
      const totpData = await totpRes.json();

      if (totpData.totpRequired && totpData.totpEnabled) {
        setPendingCredentials({ idToken, email: user.email || '' });
        setTotpAvailable(true); setTotpStep(true); setLoading(false);
        return;
      }

      const result = await signIn('credentials', { idToken, redirect: false });

      if (result?.error) {
        const email = user.email || '';
        if (email.endsWith('@ugrad.iiuc.ac.bd') || email.endsWith('@iiuc.ac.bd')) {
          setError('Sign-in failed. Your email may not be verified. Please check your inbox and verify your email first.');
        } else {
          setError(`Sign-in failed for ${email}. Only university emails or admin-accepted accounts can sign in.`);
        }
      } else if (result?.ok) {
        onClose();
        return;
      } else {
        setError('Sign-in failed. Your email may not be allowed. Use your IIUC university email.');
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') setError('Sign-in cancelled — you closed the popup');
      else if (err.code === 'auth/popup-blocked') setError('Popup was blocked by browser. Allow popups for this site and try again.');
      else if (err.code === 'auth/network-request-failed') setError('Network error. Check your connection and try again.');
      else if (err.code === 'auth/unauthorized-domain') setError('This domain is not authorized for Google sign-in. If on localhost, add it in Firebase Console → Authentication → Settings → Authorized domains.');
      else setError(`Google sign-in failed (${err.code || err.message || 'unknown'}). Please try again.`);
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('');
    if (!forgotPasswordEmail) { setError('Please enter your email address'); return; }
    setLoading(true);
    try {
      await resetPassword(forgotPasswordEmail);
      setForgotPasswordSent(true); setSuccess('Password reset email sent! Check your inbox, spam/junk folder, and "All Mail" if you don\'t see it.');
    } catch (err: any) {
      setError(err.code === 'auth/user-not-found' ? 'No account found with this email' : 'Failed to send reset email. Please try again.');
    } finally { setLoading(false); }
  };

  const isUniversityEmail = (e: string) => e.endsWith('@ugrad.iiuc.ac.bd') || e.endsWith('@iiuc.ac.bd');

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('');
    if (!isValidEmail(email)) { setError('Please enter a valid email address'); return; }
    setLoading(true);
    try {
      const turnstileValid = await verifyTurnstileToken();
      if (!turnstileValid) { setLoading(false); return; }
      await sendMagicLink(email);
      const isUni = isUniversityEmail(email);
      setMagicLinkSent(true);
      setSuccess(isUni
        ? 'Magic link sent! Check your email inbox, spam/junk folder, and "All Mail" if you don\'t see it.'
        : 'Magic link sent! Note: Non-university emails require admin approval before you can access the system. You\'ll be redirected to a pending page after signing in. Check your spam/junk folder and "All Mail" if you don\'t see it.');
    } catch (err: any) {
      setError(err.code === 'auth/user-not-found' ? 'No account found. Please sign up first.' : 'Failed to send magic link. Please try again.');
    } finally { setLoading(false); }
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pendingCredentials?.idToken}` },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid code'); setLoading(false); return; }

      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      let freshIdToken = pendingCredentials!.idToken;
      if (auth.currentUser) freshIdToken = await auth.currentUser.getIdToken(true);

      const result = await signIn('credentials', {
        idToken: freshIdToken, email: pendingCredentials!.email,
        name: pendingCredentials!.email.split('@')[0], image: '',
        login: pendingCredentials!.email.split('@')[0], redirect: false,
      });

      if (result?.error) { setError('Login failed'); reset(); }
      else if (result?.ok) { onClose(); return; }
      else { setError('Login failed. Please try again.'); reset(); }
    } catch { setError('Verification failed'); }
    finally { setLoading(false); }
  };

  if (showForgotPassword) {
    return (
      <ForgotPassword
        email={forgotPasswordEmail}
        setEmail={setForgotPasswordEmail}
        loading={loading}
        error={error}
        success={success}
        sent={forgotPasswordSent}
        onSubmit={handleForgotPassword}
        onBack={() => { setShowForgotPassword(false); setError(''); setSuccess(''); }}
      />
    );
  }

  if (isSignUp) {
    return (
      <SignupForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        loading={loading}
        error={error}
        success={success}
        onEmailSignup={handleEmailLogin}
        onGoogleLogin={handleGoogleLogin}
        onClose={onClose}
        turnstileContainerId={turnstileContainerId}
        turnstileReady={turnstileReady}
        onSwitchToLogin={() => { setIsSignUp(false); setError(''); setSuccess(''); }}
      />
    );
  }

  return (
    <LoginForm
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      loading={loading}
      error={error}
      success={success}
      setError={setError}
      setSuccess={setSuccess}
      loginMode={loginMode}
      setLoginMode={setLoginMode}
      magicLinkSent={magicLinkSent}
      setMagicLinkSent={setMagicLinkSent}
      totpStep={totpStep}
      setTotpStep={setTotpStep}
      totpCode={totpCode}
      setTotpCode={setTotpCode}
      totpAvailable={totpAvailable}
      pendingCredentials={pendingCredentials}
      setPendingCredentials={setPendingCredentials}
      magicLink2faSent={magicLink2faSent}
      setMagicLink2faSent={setMagicLink2faSent}
      onEmailLogin={handleEmailLogin}
      onGoogleLogin={handleGoogleLogin}
      onMagicLink={handleMagicLink}
      onTotpVerify={handleTotpVerify}
      onClose={onClose}
      turnstileContainerId={turnstileContainerId}
      turnstileReady={turnstileReady}
      onForgotPassword={() => { setShowForgotPassword(true); setForgotPasswordEmail(email); setError(''); setSuccess(''); }}
      onSwitchToSignup={() => { setIsSignUp(true); setError(''); setSuccess(''); }}
      banReason={banReason}
      bannedBy={bannedBy}
    />
  );
}
