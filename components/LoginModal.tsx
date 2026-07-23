'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } from '@/lib/firebase';
import { useRecaptcha } from '@/lib/useRecaptcha';
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
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const recaptchaContainerId = 'login-recaptcha-container';
  const { renderCheckbox, getToken, reset } = useRecaptcha();

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        renderCheckbox(recaptchaContainerId, 'LOGIN').then(() => setRecaptchaReady(true));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, renderCheckbox]);

  useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setPassword('');
      setError('');
      setSuccess('');
      setShowForgotPassword(false);
      setForgotPasswordEmail('');
      setForgotPasswordSent(false);
      setRecaptchaReady(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function isValidEmail(email: string): boolean {
    return config.emailRegex.test(email) || config.ownerEmails.includes(email);
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isValidEmail(email)) {
      setError('Only IIUC departmental emails are allowed (e.g. q233099@ugrad.iiuc.ac.bd)');
      return;
    }

    setLoading(true);

    try {
      let user: any;
      if (isSignUp) {
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
          setError('Your email is not verified. Please check your inbox for the verification link.');
          setLoading(false);
          return;
        }
      }

      const idToken = await user.getIdToken();
      const recaptchaToken = getToken(recaptchaContainerId);

      const result = await signIn('credentials', {
        idToken,
        email,
        name: email.split('@')[0],
        image: '',
        login: email.split('@')[0],
        recaptchaToken,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
        reset();
      } else {
        onClose();
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
      const { idToken } = await signInWithGoogle();
      const result = await signIn('credentials', {
        idToken,
        redirect: false,
      });
      if (result?.error) {
        setError('Only IIUC departmental emails are allowed. Please use your university email (e.g. q233099@ugrad.iiuc.ac.bd).');
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
                    placeholder="q233099@ugrad.iiuc.ac.bd"
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
                <p className="text-dark-text2 mt-1">When clicking &quot;Continue with Google&quot;, make sure to select your university email (e.g. <strong className="text-yellow-500">q233099@ugrad.iiuc.ac.bd</strong>). Personal Gmail accounts will be rejected.</p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
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
              disabled={loading}
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

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin}>
            <div className="mb-3">
              <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">University Email</label>
              <input
                type="email"
                className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                placeholder="q233099@ugrad.iiuc.ac.bd"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

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

            {/* reCAPTCHA Checkbox */}
            <div className="mb-4 flex justify-center">
              <div id={recaptchaContainerId}></div>
            </div>

            <button
              type="submit"
              disabled={loading || !recaptchaReady}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><i className="fas fa-spinner fa-spin mr-2"></i>{isSignUp ? 'Creating account...' : 'Signing in...'}</>
              ) : (
                <><i className="fas fa-envelope mr-2"></i>{isSignUp ? 'Sign Up with Email' : 'Sign In with Email'}</>
              )}
            </button>
          </form>

          {/* Forgot Password */}
          {!isSignUp && (
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
