'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, sendMagicLink } from '@/lib/firebase';
import { useTurnstile } from '@/lib/useTurnstile';
import { config } from '@/lib/config';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
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
  const turnstileContainerId = 'login-turnstile-container';
  const { renderWidget, getToken, reset } = useTurnstile();
  const isDev = process.env.NODE_ENV === 'development';

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        renderWidget(turnstileContainerId, 'LOGIN').then(() => setTurnstileReady(true));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, renderWidget]);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setError('');
      setSuccess('');
      setShowForgotPassword(false);
      setForgotPasswordEmail('');
      setForgotPasswordSent(false);
      setTurnstileReady(false);
      setLoginMode('password');
      setMagicLinkSent(false);
      setTotpStep(false);
      setTotpAvailable(false);
      setTotpCode('');
      setPendingCredentials(null);
      setMagicLink2faSent(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function isValidEmail(email: string): boolean {
    return config.emailRegex.test(email) || config.ownerEmails.includes(email);
  }

  async function verifyTurnstileToken(): Promise<boolean> {
    if (isDev) return true;
    const token = getToken(turnstileContainerId);
    if (!token) { setError('Please complete the captcha verification'); return false; }
    try {
      const res = await fetch('/api/auth/turnstile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
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
      setError('Only IIUC departmental emails are allowed (e.g. your_id@ugrad.iiuc.ac.bd or name@iiuc.ac.bd)');
      return;
    }

    setLoading(true);

    try {
      // Turnstile verified server-side via auth-options for email+password login
      // Pre-check if user is banned
      if (!isSignUp) {
        const banCheck = await fetch('/api/auth/check-ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const banData = await banCheck.json();
        if (banData.banned) {
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
        setSuccess('Account created! A verification email has been sent to your inbox. Please verify your email before signing in. Check your spam/junk folder if you don\'t see it.');
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

        // Check TOTP status for email method
        const totpRes = await fetch('/api/auth/totp/check?method=email', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const totpData = await totpRes.json();

        // Always require 2FA for email+password — store credentials and show 2FA screen
        setPendingCredentials({ idToken, email });
        setTotpAvailable(totpRes.ok && !!totpData.totpEnabled);
        setTotpStep(true);
        setLoading(false);
        return;
      }
    } catch (err: any) {
      if (isSignUp && err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email. Try signing up instead.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Something went wrong. If you don\'t have an account, please sign up first.');
      }
      reset();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const turnstileValid = await verifyTurnstileToken();
      if (!turnstileValid) { setLoading(false); return; }

      const { idToken, user } = await signInWithGoogle();

      const totpRes = await fetch('/api/auth/totp/check?method=google', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const totpData = await totpRes.json();

      if (totpData.totpRequired && totpData.totpEnabled) {
        setPendingCredentials({ idToken, email: user.email || '' });
        setTotpAvailable(true);
        setTotpStep(true);
        setLoading(false);
        return;
      }

      const result = await signIn('credentials', {
        idToken,
        redirect: false,
      });
      if (result?.error) {
        setError('Only IIUC departmental emails are allowed. Please use your university email (e.g. your_id@ugrad.iiuc.ac.bd or name@iiuc.ac.bd).');
        setLoading(false);
      } else if (result?.ok) {
        onClose();
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!forgotPasswordEmail) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(forgotPasswordEmail);
      setForgotPasswordSent(true);
      setSuccess('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email');
      } else {
        setError('Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isValidEmail(email)) {
      setError('Only IIUC departmental emails are allowed');
      return;
    }

    setLoading(true);
    try {
      const turnstileValid = await verifyTurnstileToken();
      if (!turnstileValid) { setLoading(false); return; }

      await sendMagicLink(email);
      setMagicLinkSent(true);
      setSuccess('Magic link sent! Check your email inbox.');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found. Please sign up first.');
      } else {
        setError('Failed to send magic link. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Turnstile verified server-side via auth-options for TOTP login
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pendingCredentials?.idToken}` },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid code');
        setLoading(false);
        return;
      }

      // Refresh the Firebase idToken before signIn to prevent 401
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;
      let freshIdToken = pendingCredentials!.idToken;
      if (currentUser) {
        freshIdToken = await currentUser.getIdToken(true);
      }

      const turnstileToken = getToken(turnstileContainerId);
      const result = await signIn('credentials', {
        idToken: freshIdToken,
        email: pendingCredentials!.email,
        name: pendingCredentials!.email.split('@')[0],
        image: '',
        login: pendingCredentials!.email.split('@')[0],
        redirect: false,
      });

      if (result?.error) {
        setError('Login failed');
        reset();
      } else {
        onClose();
      }
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="modal active" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
            <h2 className="text-base font-semibold"><i className="fas fa-key"></i> Forgot Password</h2>
            <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={() => { setShowForgotPassword(false); setError(''); setSuccess(''); }}>
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="p-5">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
                <i className="fas fa-exclamation-circle mr-2"></i>{error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
                <i className="fas fa-check-circle mr-2"></i>{success}
              </div>
            )}

            {!forgotPasswordSent ? (
              <form onSubmit={handleForgotPassword}>
                <p className="text-[0.82rem] text-dark-text2 mb-4">Enter your email address and we&apos;ll send you a link to reset your password.</p>
                <div className="mb-4">
                  <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">University Email</label>
                  <input
                    type="email"
                    className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                    placeholder="your_id@ugrad.iiuc.ac.bd"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Sending...</>
                  ) : (
                    <><i className="fas fa-paper-plane mr-2"></i>Send Reset Link</>
                  )}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-check text-2xl text-green-500"></i>
                </div>
                <p className="text-[0.85rem] text-dark-text mb-2">Check your email!</p>
                <p className="text-[0.78rem] text-dark-text2">We sent a password reset link to <strong>{forgotPasswordEmail}</strong></p>
              </div>
            )}

            <div className="mt-4 text-center text-[0.78rem] text-dark-text2">
              <button
                type="button"
                className="text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline text-[0.78rem]"
                onClick={() => { setShowForgotPassword(false); setError(''); setSuccess(''); }}
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-base font-semibold"><i className="fas fa-sign-in-alt"></i> {isSignUp ? 'Sign Up' : 'Sign In'}</h2>
          <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-5">
          {/* Warning banner */}
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-[0.78rem]">
            <div className="flex items-start gap-2">
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5 flex-shrink-0"></i>
              <div>
                <span className="text-dark-text font-semibold">Only IIUC departmental emails allowed</span>
                <p className="text-dark-text2 mt-1">When clicking &quot;Continue with Google&quot;, make sure to select your university email (e.g. <strong className="text-yellow-500">your_id@ugrad.iiuc.ac.bd</strong> or <strong className="text-yellow-500">name@iiuc.ac.bd</strong>). Personal Gmail accounts will be rejected.</p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && error !== 'YOUR_EMAIL_IS_NOT_VERIFIED' && error !== 'YOUR_ACCOUNT_IS_BANNED' && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
            </div>
          )}

          {/* Email not verified special message */}
          {error === 'YOUR_EMAIL_IS_NOT_VERIFIED' && (
            <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[0.8rem]">
              <div className="flex items-start gap-3">
                <i className="fas fa-envelope-open-text text-yellow-400 text-lg mt-0.5"></i>
                <div>
                  <p className="text-yellow-400 font-semibold mb-1">Email Not Verified</p>
                  <p className="text-dark-text2 mb-3">Please check your inbox and click the verification link before signing in. Check your spam/junk folder too.</p>
                  <button
                    type="button"
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-semibold text-[0.78rem] cursor-pointer hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const { signInWithEmail } = await import('@/lib/firebase');
                        const result = await signInWithEmail(email, password);
                        const actionCodeSettings = { url: `${window.location.origin}/callback`, handleCodeInApp: false };
                        const { sendEmailVerification } = await import('firebase/auth');
                        await sendEmailVerification(result.user, actionCodeSettings);
                        setSuccess('Verification email resent! Check your inbox.');
                        setError('');
                      } catch {
                        setError('Failed to resend. Try again.');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <i className="fas fa-redo mr-1"></i>{loading ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Account banned message */}
          {error === 'YOUR_ACCOUNT_IS_BANNED' && (
            <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-[0.8rem]">
              <div className="flex items-start gap-3">
                <i className="fas fa-ban text-red-400 text-lg mt-0.5"></i>
                <div>
                  <p className="text-red-400 font-semibold mb-1">Account Suspended</p>
                  <p className="text-dark-text2">Your account has been suspended by an administrator. You cannot access the system. Contact admin for more information.</p>
                </div>
              </div>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
              <i className="fas fa-check-circle mr-2"></i>{success}
            </div>
          )}

          {/* Google Login */}
          <div className="mb-5">
            <button
              className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text font-semibold text-[0.85rem] hover:bg-dark-bg hover:border-qsis transition-all cursor-pointer"
              onClick={handleGoogleLogin}
              disabled={loading || !turnstileReady}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-dark-border"></div>
            <span className="text-[0.75rem] text-dark-text2">or sign in with email</span>
            <div className="flex-1 h-px bg-dark-border"></div>
          </div>

          {/* Login Mode Toggle */}
          {!isSignUp && !magicLinkSent && (
            <div className="flex gap-2 mb-4 p-1 rounded-lg bg-dark-bg3 border border-dark-border">
              <button
                type="button"
                className={`flex-1 py-2 rounded-md text-[0.78rem] font-semibold border-none cursor-pointer transition-all ${
                  loginMode === 'password'
                    ? 'bg-qsis text-white'
                    : 'bg-transparent text-dark-text2 hover:text-dark-text'
                }`}
                onClick={() => setLoginMode('password')}
              >
                <i className="fas fa-lock mr-1.5"></i>Password
              </button>
              <button
                type="button"
                className={`flex-1 py-2 rounded-md text-[0.78rem] font-semibold border-none cursor-pointer transition-all ${
                  loginMode === 'magiclink'
                    ? 'bg-qsis text-white'
                    : 'bg-transparent text-dark-text2 hover:text-dark-text'
                }`}
                onClick={() => setLoginMode('magiclink')}
              >
                <i className="fas fa-link mr-1.5"></i>Magic Link
              </button>
            </div>
          )}

          {/* Magic Link Sent */}
          {magicLinkSent && (
            <div className="text-center py-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-envelope-open-text text-2xl text-green-500"></i>
              </div>
              <p className="text-[0.85rem] text-dark-text font-semibold mb-1">Check your email!</p>
              <p className="text-[0.78rem] text-dark-text2 mb-4">We sent a magic link to <strong className="text-qsis">{email}</strong></p>
              <button
                type="button"
                className="text-[0.78rem] text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline"
                onClick={() => { setMagicLinkSent(false); setSuccess(''); }}
              >
                Try another method
              </button>
            </div>
          )}

          {/* TOTP Verification Step */}
          {totpStep && (
            <div>
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[0.8rem]">
                <i className="fas fa-shield-alt mr-2"></i>Two-factor authentication required. Enter the 6-digit code from your authenticator app, or use a magic link.
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
                  <i className="fas fa-exclamation-circle mr-2"></i>{error}
                </div>
              )}

              {/* Success message for magic link */}
              {magicLink2faSent && (
                <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
                  <i className="fas fa-check-circle mr-2"></i>Magic link sent! Check your email inbox.
                </div>
              )}

              {/* TOTP Input */}
              {totpAvailable && !magicLink2faSent && (
                <form onSubmit={handleTotpVerify}>
                  <div className="mb-4">
                    <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">Authenticator Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.2rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono"
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      autoFocus
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <><i className="fas fa-spinner fa-spin mr-2"></i>Verifying...</>
                    ) : (
                      <><i className="fas fa-check-circle mr-2"></i>Verify & Sign In</>
                    )}
                  </button>
                </form>
              )}

              {/* Divider and Magic Link option */}
              {totpAvailable && !magicLink2faSent && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-dark-border"></div>
                  <span className="text-[0.72rem] text-dark-text2">or</span>
                  <div className="flex-1 h-px bg-dark-border"></div>
                </div>
              )}

              {/* Magic Link Button */}
              {!magicLink2faSent && (
                <button
                  type="button"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text font-semibold text-[0.85rem] cursor-pointer hover:border-qsis hover:text-qsis transition-all disabled:opacity-50"
                  onClick={async () => {
                    if (!pendingCredentials) return;
                    setLoading(true);
                    setError('');
                    try {
                      await sendMagicLink(pendingCredentials.email);
                      setMagicLink2faSent(true);
                    } catch {
                      setError('Failed to send magic link. Please try again.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  <i className="fas fa-envelope mr-2"></i>Send Magic Link to {pendingCredentials?.email}
                </button>
              )}

              <div className="mt-4 text-center">
                <button
                  type="button"
                  className="text-[0.78rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer hover:underline"
                  onClick={() => { setTotpStep(false); setTotpCode(''); setPendingCredentials(null); setMagicLink2faSent(false); setError(''); setSuccess(''); }}
                >
                  <i className="fas fa-arrow-left mr-1"></i>Back to login
                </button>
              </div>
            </div>
          )}

          {/* Email/Password Form or Magic Link Form */}
          {!magicLinkSent && !totpStep && (
            <form onSubmit={loginMode === 'magiclink' ? handleMagicLink : handleEmailLogin}>
              <div className="mb-3">
                <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">University Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                  placeholder="your_id@ugrad.iiuc.ac.bd"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {loginMode === 'password' && (
                <>
                  <div className="mb-4">
                    <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">Password</label>
                    <input
                      type="password"
                      className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {loginMode === 'magiclink' && (
                <p className="text-[0.72rem] text-dark-text2 mb-4">
                  <i className="fas fa-info-circle mr-1"></i>
                  We&apos;ll email you a sign-in link. No password needed.
                </p>
              )}

              {/* Turnstile Widget — always visible for all modes */}
              <div className="mb-4 flex justify-center">
                <div id={turnstileContainerId}></div>
              </div>

              <button
                type="submit"
                disabled={loading || !turnstileReady}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>{isSignUp ? 'Creating account...' : 'Sending...'}</>
                ) : loginMode === 'magiclink' ? (
                  <><i className="fas fa-paper-plane mr-2"></i>Send Magic Link</>
                ) : (
                  <><i className="fas fa-envelope mr-2"></i>{isSignUp ? 'Sign Up with Email' : 'Sign In with Email'}</>
                )}
              </button>
            </form>
          )}

          {/* Forgot Password */}
          {!isSignUp && loginMode === 'password' && !magicLinkSent && (
            <div className="mt-3 text-center">
              <button
                type="button"
                className="text-[0.78rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer hover:underline"
                onClick={() => { setShowForgotPassword(true); setForgotPasswordEmail(email); setError(''); setSuccess(''); }}
              >
                Forgot your password?
              </button>
            </div>
          )}

          <div className="mt-4 text-center text-[0.78rem] text-dark-text2">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              className="text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline text-[0.78rem]"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); }}
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
