'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeMagicLinkSignIn, isMagicLink } from '@/lib/firebase';
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
          setError('This link has expired. Please request a new magic link. Check your spam/junk folder and "All Mail" if the email was missed.');
        } else if (err.code === 'auth/email-already-in-use') {
          setError('This email is already registered. Please sign in with your password.');
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

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-8 max-w-md w-full text-center">
        {error && (
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
          </>
        )}

        {!error && totpRequired && pendingCreds && (
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

        {!error && !totpRequired && (
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
