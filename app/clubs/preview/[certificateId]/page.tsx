import type { Metadata } from 'next';
import CertificatePreviewView from '@/components/clubs/CertificatePreviewView';

export async function generateMetadata({ params }: { params: Promise<{ certificateId: string }> }): Promise<Metadata> {
  const { certificateId } = await params;
  return {
    title: `Certificate Preview ${certificateId} — IIUC-ARMS`,
    description: `Preview the certificate design for ${certificateId}.`,
  };
}

export default function CertificatePreviewPage({ params }: { params: Promise<{ certificateId: string }> }) {
  return <CertificatePreviewView params={params} />;
}
