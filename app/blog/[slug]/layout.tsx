import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: 'Blog Post — IIUC-ARMS',
    description: 'Article from the IIUC-ARMS blog.',
    alternates: { canonical: `${siteUrl}/blog/${slug}` },
  };
}

export default function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return children;
}