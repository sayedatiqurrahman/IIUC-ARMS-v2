import type { Metadata } from 'next';
import FacultyView from '@/components/views/FacultyView';

export const metadata: Metadata = {
  title: 'Faculty & Staff Directory',
  description: 'Browse faculty members and staff across all departments at IIUC QSIS.',
  openGraph: {
    title: 'IIUC-ARMS Faculty & Staff Directory',
    description: 'Browse faculty members and staff across all departments at IIUC QSIS.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function FacultyPage() {
  return <FacultyView />;
}
