'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const messages: Record<string, string> = {
    'invalid-email': 'Only IIUC departmental emails are allowed (e.g. your_id@ugrad.iiuc.ac.bd or name@iiuc.ac.bd). Please sign in with your university email.',
    'account-banned': 'Your account has been suspended by an administrator. You cannot access the system. Contact admin for more information.',
    'CredentialsSignin': 'Invalid email or password. Please try again.',
    'default': 'An authentication error occurred. Please try again.',
  };

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-dark-bg2 border border-dark-border rounded-2xl p-8 text-center">
        <Image src="/arms-logo.png" alt="IIUC-ARMS" width={60} height={60} className="w-15 h-15 mx-auto mb-4 rounded-full border-2 border-red-500 object-contain bg-white" />
        <h1 className="text-xl font-bold text-red-400 mb-2">Authentication Error</h1>
        <p className="text-sm text-dark-text2 mb-6">{messages[error || ''] || messages.default}</p>
        <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-sm no-underline">
          <i className="fas fa-arrow-left"></i> Back to Home
        </Link>
      </div>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
        <div className="text-dark-text2">Loading...</div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
