import type { Metadata } from 'next';
import FacultyView from '@/components/views/FacultyView';

export const metadata: Metadata = {
  title: 'Faculty & Staff Directory',
  description: 'Browse faculty members and staff across all departments at IIUC QSIS.',
};

export default function FacultyPage() {
  return <FacultyView />;
}
