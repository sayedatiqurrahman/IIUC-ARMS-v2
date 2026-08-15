'use client';

import { useSession } from 'next-auth/react';
import CreativeHub from '@/components/studio/CreativeHub';

export default function CreativeHubPage() {
  const { data: session } = useSession();
  return <CreativeHub onClose={() => {}} />;
}