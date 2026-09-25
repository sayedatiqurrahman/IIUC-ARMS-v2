import type { Metadata } from 'next';
import ClubsView from '@/components/clubs/ClubsView';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Clubs',
  description: 'Explore official IIUC department clubs, events, and activities. Join clubs, earn certificates, and verify your membership.',
  keywords: ['IIUC clubs', 'university clubs', 'department clubs', 'IIUC-ARMS clubs', 'student organizations', 'club certificates'],
  alternates: { canonical: `${siteUrl}/clubs` },
  openGraph: {
    title: 'IIUC Department Clubs',
    description: 'Explore official IIUC department clubs, events, and activities.',
    images: [{ url: 'https://arms.iiuc.net/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC Clubs' }],
  },
};

export default function ClubsPage() {
  return <ClubsView />;
}
