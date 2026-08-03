'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function PendingPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-clock text-2xl text-yellow-500"></i>
        </div>
        <h1 className="text-lg font-bold text-dark-text mb-2">Account Pending Approval</h1>
        <p className="text-[0.85rem] text-dark-text2 mb-2">
          Your account <strong className="text-dark-text">{(session?.user as any)?.email || 'your email'}</strong> is waiting for admin approval.
        </p>
        <p className="text-[0.82rem] text-dark-text2 mb-6">
          You&apos;ll receive access once an administrator reviews and approves your account. This usually happens within 24 hours.
        </p>

        <div className="bg-dark-bg border border-dark-border rounded-xl p-4 mb-6 text-left">
          <h3 className="text-[0.82rem] font-semibold text-dark-text mb-2">
            <i className="fas fa-info-circle mr-2 text-qsis"></i>What happens next?
          </h3>
          <ul className="text-[0.78rem] text-dark-text2 space-y-1.5">
            <li className="flex items-start gap-2">
              <i className="fas fa-check text-qsis mt-0.5 text-[0.7rem]"></i>
              <span>An admin will review your account request</span>
            </li>
            <li className="flex items-start gap-2">
              <i className="fas fa-check text-qsis mt-0.5 text-[0.7rem]"></i>
              <span>You&apos;ll be able to sign in once approved</span>
            </li>
            <li className="flex items-start gap-2">
              <i className="fas fa-check text-qsis mt-0.5 text-[0.7rem]"></i>
              <span>Check your spam/junk folder for notification emails</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity"
          >
            <i className="fas fa-sign-out-alt mr-2"></i>Sign Out
          </button>
          <Link
            href="/"
            className="text-[0.8rem] text-dark-text2 hover:text-qsis no-underline"
          >
            <i className="fas fa-arrow-left mr-1"></i>Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
