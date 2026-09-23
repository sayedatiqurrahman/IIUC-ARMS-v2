import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Research Toolkit — IIUC-ARMS Studio',
  description: 'Research tools and resources for IIUC students and teachers — citation, scanning, and academic aids.',
  alternates: { canonical: `${siteUrl}/studio/research-toolkit` },
};

export default function ResearchToolkitLayout({ children }: { children: React.ReactNode }) {
  return children;
}