import type { Metadata } from 'next';
import NoticeBoardView from '@/components/notices/NoticeBoard';

export const metadata: Metadata = {
  title: 'Notice Board — IIUC-ARMS',
  description: 'Academic notices, calendar updates, and bus schedules for IIUC QSIS department.',
  openGraph: {
    title: 'IIUC-ARMS Notice Board',
    description: 'Academic notices, calendar updates, and bus schedules.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function NoticeBoardPage() {
  return <NoticeBoardView />;
}
