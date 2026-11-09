'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import CertificatePreviewView from '@/components/clubs/CertificatePreviewView';

export default function ContributorCertificatePage() {
  const routeParams = useParams<{ login?: string | string[] }>();
  const login = Array.isArray(routeParams?.login)
    ? String(routeParams?.login[0] || '')
    : String(routeParams?.login || '');

  const [certificateId, setCertificateId] = useState('');
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      if (!login) {
        setError('Missing contributor username');
        setState('error');
        return;
      }

      setState('loading');
      setError('');
      try {
        const res = await fetch('/api/contributors/certificate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success || !data?.certificateId) {
          throw new Error(data?.error || 'Could not generate this certificate');
        }
        if (!cancelled) {
          setCertificateId(data.certificateId);
          setState('ready');
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Could not generate this certificate');
          setState('error');
        }
      }
    }

    generate();
    return () => { cancelled = true; };
  }, [login, attempt]);

  if (state === 'ready' && certificateId) {
    return <CertificatePreviewView certificateId={certificateId} />;
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-dark-border bg-dark-bg2 p-6 sm:p-8 text-center">
        <img
          src="/arms-logo-icon.png"
          alt="IIUC-ARMS"
          className="w-16 h-16 mx-auto rounded-xl border border-dark-border bg-white p-1 object-contain"
        />

        {state === 'loading' ? (
          <>
            <h1 className="mt-4 text-lg font-bold text-dark-text">Generating your certificate</h1>
            <p className="mt-1 text-[0.78rem] text-dark-text2">
              Reading public GitHub contributions for <span className="font-semibold text-qsis">@{login}</span>.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-dark-text2">
              <i className="fas fa-spinner fa-spin text-qsis"></i>
              Building your verified contribution record...
            </div>
            <p className="mt-6 text-[0.66rem] text-dark-text3">
              This can take a few seconds while commits, issues and designs are collected.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-bold text-dark-text">Certificate could not be generated</h1>
            <p className="mt-1 text-[0.78rem] text-dark-text2">{error}</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => setAttempt(n => n + 1)}
                className="px-4 py-2 rounded-lg bg-qsis text-white text-sm font-semibold hover:brightness-110 transition cursor-pointer"
              >
                <i className="fas fa-rotate-right mr-1"></i>Try again
              </button>
              <Link
                href="/contributors"
                className="px-4 py-2 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-dark-bg3 transition no-underline"
              >
                Back to contributors
              </Link>
            </div>
            {login && (
              <p className="mt-4 text-[0.66rem] text-dark-text3">
                If you have not contributed yet, your certificate will be available after your first merged contribution.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
