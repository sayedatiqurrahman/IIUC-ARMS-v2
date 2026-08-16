'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
const AdminPanelView = dynamic(() => import('@/components/views/AdminPanelView'), { ssr: false });
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store';
import { useUserAccess } from '@/lib/useUserAccess';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const profile = useAppStore(s => s.profile);

  const email = (session as any)?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, (profile as any)?.role);
  const { loading: accessLoading, hasAdminPanelAccess } = useUserAccess(
    email,
    effectiveRole,
    (profile as any)?.isCR || false,
    (profile as any)?.customPermissions || {}
  );

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
    if (status === 'authenticated' && !accessLoading && !hasAdminPanelAccess) {
      router.push('/');
    }
  }, [status, effectiveRole, router, accessLoading, hasAdminPanelAccess]);

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

  if (accessLoading) {
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
        <div className="loading-text">Checking access<span className="loading-dots"></span></div>
      </div>
    );
  }

  if (!session || !hasAdminPanelAccess) return null;

  return <AdminPanelView />;
}
