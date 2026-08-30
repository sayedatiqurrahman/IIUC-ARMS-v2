'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeMagicLinkSignIn, isMagicLink, sendMagicLink } from '@/lib/firebase';
import { signIn } from 'next-auth/react';

const STEPS = [
  'Verifying link...',
  'Signing in with Firebase...',
  'Setting up session...',
  'Redirecting...',
];

export default function MagicLinkPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [pendingCreds, setPendingCreds] = useState<{ idToken: string; email: string; name: string; image: string } | null>(null);
  const [needEmail, setNeedEmail] = useState(false);
  const [reEntry, setReEntry] = useState('');
  const [linkExpiredEmail, setLinkExpiredEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!isMagicLink()) {
      setError('Invalid or expired link. Please request a new one.');
      return;
    }

    const timeout = setTimeout(() => {
      setError('Verification is taking too long. This may be due to a slow connection or an expired link. Please try again.');
    }, 30000);

    completeMagicLinkSignIn()
      .then(async ({ idToken, user }) => {
        setStep(1);
        // If this magic-link sign-in completes a Google-linking step started
        // from the login modal, attach the pending Google identity to this
        // account now (proof of ownership = the one-time link).
        const { linkCurrentUserWithGoogle } = await import('@/lib/firebase');
        await linkCurrentUserWithGoogle();
        const email = user.email || '';
        const name = user.displayName || email.split('@')[0] || '';
        const image = user.photoURL || '';

        const totpRes = await fetch('/api/auth/totp/check?method=magiclink', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const totpData = await totpRes.json();

        if (totpData.totpRequired && totpData.totpEnabled) {
          setPendingCreds({ idToken, email, name, image });
          setTotpRequired(true);
          setStep(-1);
          clearTimeout(timeout);
          return;
        }

        setStep(2);
        const result = await signIn('credentials', {
          idToken,
          email,
          name,
          image,
          redirect: false,
        });
        if (result?.ok) {
          setStep(3);
          clearTimeout(timeout);
          setTimeout(() => router.push('/dashboard'), 1000);
        } else {
          setError('Sign-in failed. Please try again.');
        }
      })
      .catch((err: any) => {
        clearTimeout(timeout);
        if (err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code') {
          const urlEmail = new URLSearchParams(window.location.search).get('email') || '';
          setLinkExpiredEmail(urlEmail);
          setError('This link has expired. Send a new one below. If it ever lands in spam, mark it "Not spam" once so Gmail keeps future links in your inbox.');
        } else if (err.code === 'auth/email-already-in-use') {
          setError('This email is already registered. Please sign in with your password.');
        } else if (err.message?.includes('No email found') || err.code === 'auth/missing-email') {
          // The email could not be recovered from the URL or this browser's
          // storage (e.g. the link was opened in a different browser/device).
          setNeedEmail(true);
          setError('');
        } else {
          setError(err.message || 'Failed to verify link. Please try again.');
        }
      });
  }, [router]);

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingCreds || totpCode.length !== 6) return;
    setTotpLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${pendingCreds.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid code');
        setTotpLoading(false);
        return;
      }

      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;
      let freshIdToken = pendingCreds.idToken;
      if (currentUser) {
        freshIdToken = await currentUser.getIdToken(true);
      }

      setStep(2);
      const result = await signIn('credentials', {
        idToken: freshIdToken,
        email: pendingCreds.email,
        name: pendingCreds.name,
        image: pendingCreds.image,
        redirect: false,
      });
      if (result?.ok) {
        setStep(3);
        setTotpRequired(false);
        setTimeout(() => router.push('/dashboard'), 1000);
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } catch {
      setError('Verification failed');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleEmailReEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reEntry.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reEntry)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setStep(1);
    try {
      const { getAuth, signInWithEmailLink } = await import('firebase/auth');
      const auth = getAuth();
      const url = window.location.href;
      const result = await signInWithEmailLink(auth, reEntry.trim(), url);
      window.localStorage.removeItem('emailForSignIn');
      const { linkCurrentUserWithGoogle } = await import('@/lib/firebase');
      await linkCurrentUserWithGoogle();
      setStep(2);
      const idToken = await result.user.getIdToken();
      await fetch('/api/auth/firebase-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, expiresIn: 3600 }),
      });
      const email = result.user.email || reEntry.trim();
      const authResult = await signIn('credentials', {
        idToken,
        email,
        name: result.user.displayName || email.split('@')[0],
        image: result.user.photoURL || '',
        redirect: false,
      });
      if (authResult?.ok) {
        setStep(3);
        setTimeout(() => router.push('/dashboard'), 1000);
      } else {
        setError('Sign-in failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.code === 'auth/email-already-in-use' ? 'This email is already registered. Please sign in with your password.' : (err.message || 'Failed to verify link.'));
    }
  };

  const handleResendMagicLink = async () => {
    const target = linkExpiredEmail;
    if (!target) return;
    setError('');
    setResent(false);
    setStep(1);
    try {
      await sendMagicLink(target);
      setResent(true);
    } catch {
      setError('Failed to send a new link. Go back to the login page and request a new magic link.');
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-8 max-w-md w-full text-center">
        {resent && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-envelope text-2xl text-green-500"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">New link sent</h1>
            <p className="text-[0.85rem] text-dark-text2 mb-6">
              A fresh magic link is on its way to{' '}
              <strong className="text-dark-text">{linkExpiredEmail}</strong>. Open it within the next few minutes.
              If it lands in spam/junk, click &quot;Not spam&quot; once in Gmail so future links arrive in your inbox.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] no-underline hover:opacity-90 transition-opacity"
            >
              <i className="fas fa-arrow-left"></i> Back to Home
            </a>
          </>
        )}

        {error && !resent && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-times-circle text-2xl text-red-500"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">Error</h1>
            <p className="text-[0.85rem] text-dark-text2 mb-6">{error}</p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] no-underline hover:opacity-90 transition-opacity"
            >
              <i className="fas fa-arrow-left"></i> Back to Home
            </a>
            {linkExpiredEmail && (
              <div className="mt-4">
                <button
                  onClick={handleResendMagicLink}
                  className="w-full py-2.5 rounded-lg border border-qsis text-qsis text-[0.8rem] font-semibold cursor-pointer hover:bg-qsis/10 transition-colors"
                >
                  <i className="fas fa-redo mr-1"></i> Send a new magic link to {linkExpiredEmail}
                </button>
              </div>
            )}
          </>
        )}

        {!error && needEmail && !totpRequired && (
          <>
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-envelope text-2xl text-blue-400"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">Confirm your email</h1>
            <p className="text-[0.82rem] text-dark-text2 mb-4">We couldn't automatically match this link. Enter the email you used to log in (the one this magic link was sent to).</p>
            <form onSubmit={handleEmailReEntry}>
              <input
                type="email"
                value={reEntry}
                onChange={e => setReEntry(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors mb-4"
              />
              <button type="submit" className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity">
                <i className="fas fa-check-circle mr-2"></i>Continue
              </button>
            </form>
            <div className="mt-4">
              <a href="/" className="text-[0.78rem] text-dark-text2 hover:text-qsis no-underline">
                <i className="fas fa-arrow-left mr-1"></i>Back to Home
              </a>
            </div>
          </>
        )}

        {!error && !resent && totpRequired && pendingCreds && (
          <>
            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-shield-alt text-2xl text-yellow-500"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">Two-Factor Required</h1>
            <p className="text-[0.82rem] text-dark-text2 mb-4">Enter the 6-digit code from your authenticator app.</p>
            <form onSubmit={handleTotpVerify}>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" autoFocus
                className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.2rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono mb-4"
              />
              <button type="submit" disabled={totpLoading || totpCode.length !== 6}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                {totpLoading ? <><i className="fas fa-spinner fa-spin mr-2"></i>Verifying...</> : <><i className="fas fa-check-circle mr-2"></i>Verify & Sign In</>}
              </button>
            </form>
            <div className="mt-4">
              <a href="/" className="text-[0.78rem] text-dark-text2 hover:text-qsis no-underline">
                <i className="fas fa-arrow-left mr-1"></i>Back to Home
              </a>
            </div>
          </>
        )}

        {!error && !resent && !totpRequired && (
          <>
            <div className="w-16 h-16 rounded-full bg-qsis/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">{STEPS[Math.max(0, step)]}</h1>
            <div className="mt-4 flex flex-col gap-2">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-2 text-[0.8rem]">
                  {i < step ? (
                    <i className="fas fa-check-circle text-green-500"></i>
                  ) : i === step ? (
                    <i className="fas fa-spinner fa-spin text-qsis"></i>
                  ) : (
                    <i className="fas fa-circle text-dark-border"></i>
                  )}
                  <span className={i <= step ? 'text-dark-text' : 'text-dark-text2'}>{label}</span>
                </div>
              ))}
            </div>
            <p className="text-[0.75rem] text-dark-text2 mt-4">If this takes too long, close this tab and try the link again.</p>
          </>
        )}
      </div>
    </div>
  );
}
