import type { Metadata } from 'next';
import FacultyView from '@/components/views/FacultyView';

export const metadata: Metadata = {
  title: 'Faculty & Staff Directory — IIUC-ARMS',
  description: 'Browse faculty members, teachers, and staff across all departments at IIUC. Find contact info, designations, and department details.',
  keywords: ['IIUC faculty', 'IIUC teachers', 'IIUC staff', 'IIUC department staff', 'IIUC-ARMS faculty directory'],
  openGraph: {
    title: 'IIUC-ARMS Faculty & Staff Directory',
    description: 'Browse faculty members and staff across all IIUC departments.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC-ARMS Faculty Directory' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://iiuc-arms.eu.cc/arms-logo-icon.png'] },
};

export default function FacultyPage() {
  return <FacultyView />;
}
