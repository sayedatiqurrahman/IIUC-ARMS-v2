import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles, tutorials, and updates from the IIUC-ARMS community.',
  alternates: { canonical: `${siteUrl}/blog` },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}