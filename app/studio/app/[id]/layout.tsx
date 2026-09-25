import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Studio App',
    description: 'A Studio tool inside IIUC-ARMS.',
    alternates: { canonical: `${siteUrl}/studio/app/${id}` },
  };
}

export default function StudioAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}