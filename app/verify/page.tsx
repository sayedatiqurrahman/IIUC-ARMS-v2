import type { Metadata } from 'next';
import { Suspense } from 'react';
import VerifyView from '@/components/clubs/VerifyView';

export const metadata: Metadata = {
  title: 'Verify Certificate — IIUC-ARMS',
  description: 'Verify the authenticity of any IIUC club certificate. Scan QR code or enter certificate ID.',
  openGraph: {
    title: 'IIUC Certificate Verification',
    description: 'Verify the authenticity of any IIUC club certificate.',
    images: [{ url: 'https://iiuc-arms.eu.cc/arms-logo-icon.png', width: 1200, height: 630, alt: 'IIUC Certificate Verification' }],
  },
};

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyView />
    </Suspense>
  );
}
