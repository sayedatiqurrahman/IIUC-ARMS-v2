import type { Metadata } from 'next';
import HomeView from '@/components/views/HomeView';

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net').replace(/\/+$/, '');

export const metadata: Metadata = {
  title: 'IIUC-ARMS — Academic Resource & Research Management System',
  description: 'Browse class routines, exam routines, notices, course materials, and resources for every department at International Islamic University Chittagong (IIUC).',
  keywords: ['IIUC', 'IIUC-ARMS', 'IIUC academic resources', 'IIUC notice board', 'IIUC class routine', 'IIUC exam routine', 'IIUC course materials', 'International Islamic University Chittagong'],
  alternates: { canonical: `${siteUrl}/` },
  openGraph: {
    title: 'IIUC-ARMS — Academic Resource & Research Management System',
    description: 'All IIUC academic resources in one place — notices, routines, clubs, and course materials.',
    url: `${siteUrl}/`,
    siteName: 'IIUC-ARMS',
    type: 'website',
    images: [{ url: `${siteUrl}/arms-logo-icon.png`, width: 1200, height: 630, alt: 'IIUC-ARMS' }],
  },
  twitter: { card: 'summary_large_image', title: 'IIUC-ARMS', description: 'IIUC academic resource management system.', images: [`${siteUrl}/arms-logo-icon.png`] },
};

export default function HomePage() {
  return <HomeView />;
}