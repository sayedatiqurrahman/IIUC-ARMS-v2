'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLoader from '@/components/PageLoader';

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
    <PageLoader fullScreen />
  );
}
