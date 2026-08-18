import type { Metadata } from 'next';
import NoticeDetail from '@/components/notices/NoticeDetail';

export const metadata: Metadata = {
  title: 'Notice — IIUC-ARMS',
  description: 'Notice details from IIUC-ARMS Notice Board.',
};

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <NoticeDetail params={params} />;
}
