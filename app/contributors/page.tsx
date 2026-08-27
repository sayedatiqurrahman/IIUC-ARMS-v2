import type { Metadata } from 'next';
import ContributorsView from '@/components/contributors';

export const metadata: Metadata = {
  title: 'Contributors — IIUC-ARMS',
  description: 'Meet the developers and contributors behind IIUC-ARMS — the open-source academic resource and research management system for IIUC.',
  keywords: ['IIUC-ARMS contributors', 'IIUC developers', 'IIUC open source', 'academic platform contributors'],
  openGraph: {
    title: 'IIUC-ARMS Contributors',
    description: 'Developers and resource providers who built the IIUC academic platform.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS Contributors' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function ContributorsPage() {
  return <ContributorsView />;
}
