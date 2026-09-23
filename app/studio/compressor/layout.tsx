import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'File Compressor — IIUC-ARMS Studio',
  description: 'Compress PDF, images, and documents in your browser with the IIUC-ARMS Studio compressor tool.',
  alternates: { canonical: `${siteUrl}/studio/compressor` },
};

export default function CompressorLayout({ children }: { children: React.ReactNode }) {
  return children;
}