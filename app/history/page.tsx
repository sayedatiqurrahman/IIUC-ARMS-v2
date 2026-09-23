import type { Metadata } from 'next';
import HistoryView from '@/components/views/HistoryView';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Reading History',
  description: 'Your browsing and reading history on IIUC-ARMS — IIUC academic resource management system.',
  alternates: { canonical: `${siteUrl}/history` },
  openGraph: {
    title: 'IIUC-ARMS Reading History',
    description: 'Your browsing and reading history.',
    images: [{ url: 'https://arms.iiuc.net/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS History' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://arms.iiuc.net/arms-logo-icon.png'] },
};

export default function HistoryPage() {
  return <HistoryView />;
}
