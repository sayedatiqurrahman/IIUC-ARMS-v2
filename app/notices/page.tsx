import type { Metadata } from 'next';
import NoticeBoardView from '@/components/notices/NoticeBoard';

export const metadata: Metadata = {
  title: 'Notice Board — IIUC-ARMS',
  description: 'Academic notices, calendar updates, and bus schedules for IIUC QSIS department.',
};

export default function NoticeBoardPage() {
  return <NoticeBoardView />;
}
