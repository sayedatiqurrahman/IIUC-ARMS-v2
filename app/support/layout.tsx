import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with IIUC-ARMS — routines, notices, uploads, clubs, profiles, and the Studio. Contact the team for assistance.',
  alternates: { canonical: `${siteUrl}/support` },
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}