'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeMagicLinkSignIn, isMagicLink } from '@/lib/firebase';
import { signIn } from 'next-auth/react';

export default function MagicLinkPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Verifying your link...');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isMagicLink()) {
      setError('Invalid or expired link. Please request a new one.');
      return;
    }

    completeMagicLinkSignIn()
      .then(async ({ idToken, user }) => {
        setStatus('Signing you in...');
        const result = await signIn('credentials', {
          idToken,
          email: user.email || '',
          name: user.displayName || user.email?.split('@')[0] || '',
          image: user.photoURL || '',
          redirect: false,
        });
        if (result?.ok) {
          setStatus('Success! Redirecting...');
          setTimeout(() => router.push('/dashboard'), 1000);
        } else {
          setError('Sign-in failed. Please try again.');
        }
      })
      .catch((err: any) => {
        if (err.code === 'auth/invalid-action-code' || err.code === 'auth/expired-action-code') {
          setError('This link has expired. Please request a new magic link.');
        } else if (err.code === 'auth/email-already-in-use') {
          setError('This email is already registered. Please sign in with your password.');
        } else {
          setError(err.message || 'Failed to verify link. Please try again.');
        }
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-8 max-w-md w-full text-center">
        {error ? (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-times-circle text-2xl text-red-500"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">Link Invalid</h1>
            <p className="text-[0.85rem] text-dark-text2 mb-6">{error}</p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] no-underline hover:opacity-90 transition-opacity"
            >
              <i className="fas fa-arrow-left"></i> Back to Home
            </a>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-qsis/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
            </div>
            <h1 className="text-lg font-bold text-dark-text mb-2">Verifying...</h1>
            <p className="text-[0.85rem] text-dark-text2">{status}</p>
          </>
        )}
      </div>
    </div>
  );
}
