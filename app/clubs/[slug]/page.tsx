import type { Metadata } from 'next';
import ClubDetailView from '@/components/clubs/ClubDetailView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    title: `${name} — IIUC Clubs`,
    description: `Details, events, and members of ${name} at IIUC.`,
    openGraph: {
      title: `${name} — IIUC Clubs`,
      description: `Details, events, and members of ${name} at IIUC.`,
      images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: name }],
    },
  };
}

export default function ClubDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  return <ClubDetailView params={params} />;
}
