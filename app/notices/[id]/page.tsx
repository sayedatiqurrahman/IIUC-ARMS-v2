import type { Metadata } from 'next';
import NoticeDetail from '@/components/notices/NoticeDetail';

export const metadata: Metadata = {
  title: 'Notice — IIUC-ARMS',
  description: 'Notice details from IIUC-ARMS Notice Board.',
  openGraph: {
    title: 'IIUC-ARMS Notice',
    description: 'Notice details from IIUC-ARMS Notice Board.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <NoticeDetail params={params} />;
}
