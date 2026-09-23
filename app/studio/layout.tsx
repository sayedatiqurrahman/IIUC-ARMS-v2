import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Studio — IIUC-ARMS',
  description: 'IIUC-ARMS Studio — design tools, scanners, compressors, research toolkit, and creative tools for students and teachers.',
  alternates: { canonical: `${siteUrl}/studio` },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}