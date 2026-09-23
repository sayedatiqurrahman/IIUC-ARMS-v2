import type { Metadata } from 'next';
import EventDetailView from '@/components/clubs/EventDetailView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string; eventId: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    title: `Event — ${name} — IIUC Clubs`,
    description: `Event details, photos, and certificates for ${name}.`,
  };
}

export default function EventDetailPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  return <EventDetailView params={params} />;
}