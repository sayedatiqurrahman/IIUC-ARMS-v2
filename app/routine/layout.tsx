import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  title: 'Class & Exam Routine',
  description: 'Class routines, exam routines, and seat plans for every department at IIUC.',
  alternates: { canonical: `${siteUrl}/routine` },
};

export default function RoutineLayout({ children }: { children: React.ReactNode }) {
  return children;
}