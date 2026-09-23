import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Certificates — IIUC-ARMS Studio',
  description: 'Become a verified club member and earn official certificates with IIUC-ARMS.',
  alternates: { canonical: `${siteUrl}/studio/certificates` },
};

export default function CertificatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}