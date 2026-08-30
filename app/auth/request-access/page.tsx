'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AccessGate from '@/components/auth/AccessGate';

export default function RequestAccessPage() {
  const email = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('email') || '')
    : '';
  const [status, setStatus] = useState<string | null>(null);
  const [gate, setGate] = useState<{ linked: boolean; university: boolean; active: boolean; ready: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetch(`/api/auth/account-status?email=${encodeURIComponent(email.toLowerCase())}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setStatus(typeof d.status === 'string' ? d.status : null);
        // A linked or approved account was redirected here in error (e.g. a
        // stale serverless instance or a stale status cache). Never show them
        // the request-access gate — send them straight back to sign in.
        if (d.linked || d.university || d.status === 'active') {
          setGate({ linked: !!d.linked, university: !!d.university, active: d.status === 'active', ready: true });
          return;
        }
        setGate({ linked: false, university: false, active: false, ready: true });
      })
      .catch(() => setGate({ linked: false, university: false, active: false, ready: true }));
    return () => { cancelled = true; };
  }, [email, router]);

  if (email && gate?.ready && (gate.linked || gate.university || gate.active)) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mb-3 mx-auto">
            <i className="fas fa-check text-green-400"></i>
          </div>
          <h2 className="text-[0.95rem] font-bold text-dark-text mb-1">You&apos;re good to go!</h2>
          <p className="text-[0.8rem] text-dark-text2 mb-4">
            {gate.linked
              ? <><strong className="text-dark-text">{email}</strong> is a linked email — it signs in to your existing account without any approval.</>
              : <><strong className="text-dark-text">{email}</strong> is an approved account — you can sign in normally.</>}
          </p>
          <a href="/" className="block w-full py-2 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold text-center no-underline hover:opacity-90">
            <i className="fas fa-sign-in-alt mr-1"></i> Back to Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <AccessGate email={email} status={status} showBackToHome />
    </div>
  );
}