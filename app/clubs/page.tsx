import type { Metadata } from 'next';
import ClubsView from '@/components/clubs/ClubsView';

export const metadata: Metadata = {
  title: 'Clubs — IIUC-ARMS',
  description: 'Explore official IIUC department clubs, events, and activities. Join clubs, earn certificates, and verify your membership.',
  keywords: ['IIUC clubs', 'university clubs', 'department clubs', 'IIUC-ARMS clubs', 'student organizations', 'club certificates'],
  openGraph: {
    title: 'IIUC Department Clubs — IIUC-ARMS',
    description: 'Explore official IIUC department clubs, events, and activities.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC Clubs' }],
  },
};

export default function ClubsPage() {
  return <ClubsView />;
}
