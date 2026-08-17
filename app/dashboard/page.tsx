'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import PageLoader from '@/components/PageLoader';
const DashboardView = dynamic(() => import('@/components/dashboard/DashboardView'), { ssr: false });

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-dark-bg">
        <PageLoader className="h-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-20">
        <i className="fas fa-lock text-4xl text-dark-text2 mb-4 block opacity-30"></i>
        <p className="text-[1rem] text-dark-text2 mb-2">Please sign in to access your dashboard.</p>
        <p className="text-[0.82rem] text-dark-text2 opacity-60">You need to be authenticated to view this page.</p>
      </div>
    );
  }

  return <DashboardView />;
}
