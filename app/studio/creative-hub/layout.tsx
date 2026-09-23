import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Creative Hub — IIUC-ARMS Studio',
  description: 'Design creative content and club materials with the IIUC-ARMS Studio creative hub.',
  alternates: { canonical: `${siteUrl}/studio/creative-hub` },
};

export default function CreativeHubLayout({ children }: { children: React.ReactNode }) {
  return children;
}