import type { Metadata } from 'next';
import ContributorsView from '@/components/contributors';

export const metadata: Metadata = {
  title: 'Contributors',
  description: 'Meet the developers and resource providers behind IIUC-ARMS — the open-source academic resource management system for IIUC QSIS departments.',
  openGraph: {
    title: 'IIUC-ARMS Contributors',
    description: 'Developers and resource providers who built the IIUC academic platform.',
  },
};

export default function ContributorsPage() {
  return <ContributorsView />;
}
