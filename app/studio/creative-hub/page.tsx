'use client';

import { useRouter } from 'next/navigation';
import CreativeHub from '@/components/studio/CreativeHub';

export default function CreativeHubPage() {
  const router = useRouter();
  return <CreativeHub onClose={() => router.push('/studio')} />;
}