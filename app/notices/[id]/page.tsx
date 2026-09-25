import type { Metadata } from 'next';
import NoticeDetail from '@/components/notices/NoticeDetail';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Notice',
    description: 'Notice details from IIUC-ARMS Notice Board.',
    alternates: { canonical: `${siteUrl}/notices/${id}` },
    openGraph: {
      title: 'IIUC-ARMS Notice',
      description: 'Notice details from IIUC-ARMS Notice Board.',
      images: [{ url: 'https://arms.iiuc.net/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS' }],
    },
    twitter: { card: 'summary_large_image', images: ['https://arms.iiuc.net/arms-logo-icon.png'] },
  };
}

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <NoticeDetail params={params} />;
}
