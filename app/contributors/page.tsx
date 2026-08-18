import type { Metadata } from 'next';
import ContributorsView from '@/components/contributors';

export const metadata: Metadata = {
  title: 'Contributors',
  description: 'Meet the developers and resource providers behind IIUC-ARMS — the open-source academic resource management system for IIUC QSIS departments.',
  openGraph: {
    title: 'IIUC-ARMS Contributors',
    description: 'Developers and resource providers who built the IIUC academic platform.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function ContributorsPage() {
  return <ContributorsView />;
}
