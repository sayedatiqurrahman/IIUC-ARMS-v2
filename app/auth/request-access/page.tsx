'use client';

import { useEffect, useState } from 'react';
import AccessGate from '@/components/auth/AccessGate';

export default function RequestAccessPage() {
  const email = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('email') || '')
    : '';
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetch(`/api/auth/account-status?email=${encodeURIComponent(email.toLowerCase())}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setStatus(typeof d.status === 'string' ? d.status : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [email]);

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <AccessGate email={email} status={status} showBackToHome />
    </div>
  );
}