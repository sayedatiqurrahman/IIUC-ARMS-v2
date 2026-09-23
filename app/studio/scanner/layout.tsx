import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Scanner — IIUC-ARMS Studio',
  description: 'Scan documents and images directly in your browser with the IIUC-ARMS Studio scanner tool.',
  alternates: { canonical: `${siteUrl}/studio/scanner` },
};

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}