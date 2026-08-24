import type { Metadata } from 'next';
import IssueCertView from '@/components/clubs/IssueCertView';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    title: `Issue Certificates — ${name} — IIUC Clubs`,
    description: `Generate and issue verifiable certificates for ${name} club members.`,
  };
}

export default function IssueCertPage({ params }: { params: Promise<{ slug: string }> }) {
  return <IssueCertView params={params} />;
}
