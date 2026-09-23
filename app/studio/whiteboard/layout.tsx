import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Whiteboard — IIUC-ARMS Studio',
  description: 'A free collaborative whiteboard for planning and brainstorming with the IIUC-ARMS Studio.',
  alternates: { canonical: `${siteUrl}/studio/whiteboard` },
};

export default function WhiteboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}