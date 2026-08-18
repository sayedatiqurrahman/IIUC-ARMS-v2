'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import PageLoader from '@/components/PageLoader';
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

  if (status === 'loading' || accessLoading) {
    return <PageLoader fullScreen />;
  }

  if (!session || !hasAdminPanelAccess) return null;

  return <AdminPanelView />;
}
