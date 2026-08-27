import type { Metadata } from 'next';
import NoticeBoardView from '@/components/notices/NoticeBoard';

export const metadata: Metadata = {
  title: 'Notice Board — IIUC-ARMS',
  description: 'IIUC notice board — academic notices, calendar updates, exam schedules, and announcements. Stay updated with IIUC-ARMS.',
  keywords: ['IIUC notice', 'IIUC academic notice', 'IIUC calendar', 'IIUC exam schedule', 'IIUC-ARMS'],
  openGraph: {
    title: 'IIUC-ARMS Notice Board',
    description: 'Academic notices, calendar updates, and announcements for IIUC departments.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS Notice Board' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function NoticeBoardPage() {
  return <NoticeBoardView />;
}
