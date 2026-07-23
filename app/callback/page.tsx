'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CallbackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    } else if (status === 'unauthenticated') {
      router.replace('/');
    }
  }, [status, router]);

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <div className="loading-container">
        <div className="book-loader">
          <div className="book-base"></div>
          <div className="book-spine-loader"></div>
          <div className="book-cover"></div>
          <div className="book-page-stack">
            <div className="book-page"></div>
            <div className="book-page"></div>
            <div className="book-page"></div>
          </div>
          <div className="page-shadow"></div>
          <div className="page-shadow"></div>
          <div className="page-shadow"></div>
        </div>
        <div className="loading-text">Authenticating<span className="loading-dots"></span></div>
      </div>
    </div>
  );
}
