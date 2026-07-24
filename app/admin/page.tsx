'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AdminPanelView from '@/components/views/AdminPanelView';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
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
        <div className="loading-text">Loading admin panel<span className="loading-dots"></span></div>
      </div>
    );
  }

  if (!session) return null;

  return <AdminPanelView />;
}
