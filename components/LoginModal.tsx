'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, sendMagicLink } from '@/lib/firebase';
import { useTurnstile } from '@/lib/useTurnstile';
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
  const [totpTargetEmail, setTotpTargetEmail] = useState('');
  const [pendingCredentials, setPendingCredentials] = useState<{ idToken: string; email: string } | null>(null);
  const [magicLink2faSent, setMagicLink2faSent] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [bannedBy, setBannedBy] = useState<string | null>(null);
  const [linkExisting, setLinkExisting] = useState<{ email: string; sent: boolean } | null>(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [linkedEmailHint, setLinkedEmailHint] = useState('');
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
      setTotpStep(false); setTotpAvailable(false); setTotpCode(''); setTotpTargetEmail('');
      setPendingCredentials(null); setMagicLink2faSent(false);
      setBanReason(null); setBannedBy(null);
      setLinkExisting(null); setLinkPassword('');
      setLinkedEmailHint('');
      try { window.localStorage.removeItem('pendingGoogleLink'); } catch {}
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const e = email.trim().toLowerCase();
    if (!e || !e.includes('@') || e.endsWith('@ugrad.iiuc.ac.bd') || e.endsWith('@iiuc.ac.bd')) {
      setLinkedEmailHint('');
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-linked?email=${encodeURIComponent(e)}`);
        const data = await res.json();
        setLinkedEmailHint(data.linked ? e : '');
      } catch { setLinkedEmailHint(''); }
    }, 400);
    return () => clearTimeout(t);
  }, [email, isOpen]);

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
        setTotpTargetEmail(totpData.targetEmail || email);
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

  // Shared tail of the Google/password sign-in: TOTP gate, then NextAuth session.
  const completeFirebaseSignIn = async (fbUser: any, idToken: string) => {
    const totpRes = await fetch('/api/auth/totp/check?method=google', { headers: { Authorization: `Bearer ${idToken}` } });
    const totpData = await totpRes.json();

    if (totpData.totpRequired && totpData.totpEnabled) {
      setPendingCredentials({ idToken, email: fbUser.email || '' });
      setTotpTargetEmail(totpData.targetEmail || fbUser.email || '');
      setTotpAvailable(true); setTotpStep(true); setLoading(false);
      return;
    }

    const result = await signIn('credentials', { idToken, redirect: false });

    if (result?.error) {
      const email = fbUser.email || '';
      if (email.endsWith('@ugrad.iiuc.ac.bd') || email.endsWith('@iiuc.ac.bd')) {
        setError('Sign-in failed. Your email may not be verified. Please check your inbox and verify your email first.');
      } else {
        setError(`Sign-in failed for ${email}. An admin must accept your account first. If you were just given a role, wait a minute and try again.`);
      }
    } else if (result?.ok) {
      onClose();
    } else {
      setError('Sign-in failed. Your email may not be allowed. Use your IIUC university email.');
    }
  };

  const handleGoogleLogin = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const { idToken, user } = await signInWithGoogle();
      await completeFirebaseSignIn(user, idToken);
    } catch (err: any) {
      // An account already exists for this Google email but is not connected to
      // Google (e.g. it was admin-created, or it is a linked personal email).
      // Firebase blocks the popup with this error. One-time fix: store the
      // pending Google credential, then let the user connect the account by
      // entering its password OR opening a one-time link — both paths end up
      // linking Google, and "Continue with Google" works forever after.
      if (err.code === 'auth/account-exists-with-different-credential') {
        const existingEmail = err?.email || email;
        if (existingEmail) {
          const { googleCredentialFromError } = await import('@/lib/firebase');
          const cred = googleCredentialFromError(err);
          try {
            window.localStorage.setItem('pendingGoogleLink', JSON.stringify({
              email: existingEmail,
              accessToken: cred?.accessToken || null,
              idToken: cred?.idToken || null,
            }));
          } catch {}
          setLinkPassword('');
          setLinkExisting({ email: existingEmail, sent: false });
          setError('');
        } else {
          setError('Google sign-in failed. Sign in with your password instead.');
        }
      } else if (err.code === 'auth/popup-closed-by-user') setError('Sign-in cancelled — you closed the popup');
      else if (err.code === 'auth/popup-blocked') setError('Popup was blocked by browser. Allow popups for this site and try again.');
      else if (err.code === 'auth/network-request-failed') setError('Network error. Check your connection and try again.');
      else if (err.code === 'auth/unauthorized-domain') setError('This domain is not authorized for Google sign-in. If on localhost, add it in Firebase Console → Authentication → Settings → Authorized domains.');
      else setError(`Google sign-in failed (${err.code || err.message || 'unknown'}). Please try again.`);
    } finally { setLoading(false); }
  };

  const handleLinkWithPassword = async () => {
    if (!linkExisting) return;
    setError(''); setSuccess(''); setLoading(true);
    try {
      const { linkGoogleWithStoredCredential } = await import('@/lib/firebase');
      const linkedUser = await linkGoogleWithStoredCredential(linkExisting.email, linkPassword);
      const emailForMsg = linkExisting.email;
      setLinkExisting(null); setLinkPassword('');
      const linkedIdToken = await linkedUser.getIdToken();
      await completeFirebaseSignIn(linkedUser, linkedIdToken);
      if (!error && linkedUser.email) {
        setSuccess(`Google connected to ${emailForMsg}. You can now sign in with Google or your password.`);
      }
    } catch (e: any) {
      const safeEmail = linkExisting?.email || '';
      if (e.code === 'auth/wrong-password') {
        setError(`Wrong password for ${safeEmail}. Use "Send me a one-time link" instead, or reset the password.`);
      } else if (e.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes, or use the one-time link.');
      } else {
        setError(`Could not link Google (${e.code || 'unknown'}). Use the one-time link instead.`);
      }
    } finally { setLoading(false); }
  };

  const handleLinkWithMagicLink = async () => {
    if (!linkExisting) return;
    setError(''); setSuccess('');
    setLoading(true);
    try {
      await sendMagicLink(linkExisting.email);
      setLinkExisting({ email: linkExisting.email, sent: true });
    } catch {
      setError('Failed to send the link. Try entering the existing password instead.');
    } finally { setLoading(false); }
  };

  const cancelLink = () => {
    try { window.localStorage.removeItem('pendingGoogleLink'); } catch {}
    setLinkExisting(null);
    setLinkPassword('');
    setError('Google connecting cancelled. Use your password or a one-time link to sign in.');
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

  const handleSwitchToSignup = () => {
    if (linkedEmailHint) {
      setError('This email is already connected to an existing account. Sign in with Magic Link or your password instead.');
      return;
    }
    setIsSignUp(true);
    setError('');
    setSuccess('');
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
        ? 'Magic link sent! Check your email inbox, spam/junk folder, and "All Mail" if you don\'t see it within 2 minutes.'
        : 'Magic link sent! Note: Non-university emails require admin approval before you can access the system. You\'ll be redirected to a pending page after signing in. Check your spam/junk folder and "All Mail" if you don\'t see it within 2 minutes.');
    } catch (err: any) {
      console.error('[MagicLink] Send error:', err?.code, err?.message);
      const msg = err.code === 'auth/user-not-found' ? 'No account found with this email. Please sign up first.'
        : err.code === 'auth/invalid-email' ? 'Invalid email address.'
        : err.code === 'auth/too-many-requests' ? 'Too many requests. Please wait a few minutes before trying again.'
        : 'Failed to send magic link. Please try again or use password login.';
      setError(msg);
    } finally { setLoading(false); }
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pendingCredentials?.idToken}` },
        body: JSON.stringify({ code: totpCode, email: totpTargetEmail || pendingCredentials?.email }),
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

  if (linkExisting) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) cancelLink(); }}>
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          {linkExisting.sent ? (
            <>
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mb-3 mx-auto">
                <i className="fas fa-envelope text-green-400"></i>
              </div>
              <h2 className="text-[0.95rem] font-bold text-dark-text text-center mb-1">One-time link sent</h2>
              <p className="text-[0.8rem] text-dark-text2 text-center mb-4">
                A link was sent to <strong className="text-dark-text">{linkExisting.email}</strong>. Open it to finish
                connecting your Google sign-in — you&apos;ll be signed in automatically. After that,
                &quot;Continue with Google&quot; works without any password.
              </p>
              <button onClick={() => { setLinkExisting(null); }} className="w-full py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.8rem] font-semibold cursor-pointer hover:text-dark-text transition-colors">
                Done (I&apos;ll open the email)
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-3 mx-auto">
                <i className="fas fa-link text-amber-400"></i>
              </div>
              <h2 className="text-[0.95rem] font-bold text-dark-text text-center mb-1">Connect your Google sign-in</h2>
              <p className="text-[0.8rem] text-dark-text2 text-center mb-4">
                An account already exists for <strong className="text-dark-text">{linkExisting.email}</strong>. Connect
                your Google once so &quot;Continue with Google&quot; works from now on:
              </p>
              <div className="space-y-2">
                <input type="password" value={linkPassword} onChange={e => setLinkPassword(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && linkPassword.length >= 6) handleLinkWithPassword(); }}
                  placeholder="Password of the existing account"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" />
                <button onClick={handleLinkWithPassword} disabled={loading || linkPassword.length < 6}
                  className="w-full py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {loading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Connecting...</> : <><i className="fas fa-key mr-1"></i> Link with password</>}
                </button>
                <button onClick={handleLinkWithMagicLink} disabled={loading}
                  className="w-full py-2.5 rounded-lg border border-qsis text-qsis text-[0.82rem] font-semibold cursor-pointer hover:bg-qsis/10 disabled:opacity-50 transition-colors">
                  <i className="fas fa-envelope mr-1"></i> I don&apos;t know it — send a link instead
                </button>
                <button onClick={cancelLink} disabled={loading}
                  className="w-full py-1.5 rounded-lg bg-transparent text-dark-text2 text-[0.75rem] font-semibold cursor-pointer hover:text-dark-text transition-colors">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

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
      onSwitchToSignup={handleSwitchToSignup}
      linkedHint={linkedEmailHint}
      banReason={banReason}
      bannedBy={bannedBy}
    />
  );
}
