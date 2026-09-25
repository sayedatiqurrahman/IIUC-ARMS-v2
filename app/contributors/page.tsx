import type { Metadata } from 'next';
import ContributorsView from '@/components/contributors';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Contributors',
  description: 'Meet the developers and contributors behind IIUC-ARMS — the open-source academic resource and research management system for IIUC.',
  keywords: ['IIUC-ARMS contributors', 'IIUC developers', 'IIUC open source', 'academic platform contributors'],
  alternates: { canonical: `${siteUrl}/contributors` },
  openGraph: {
    title: 'IIUC-ARMS Contributors',
    description: 'Developers and resource providers who built the IIUC academic platform.',
    images: [{ url: 'https://arms.iiuc.net/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS Contributors' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://arms.iiuc.net/arms-logo-icon.png'] },
};

export default function ContributorsPage() {
  return <ContributorsView />;
}
