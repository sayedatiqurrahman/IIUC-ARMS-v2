import type { Metadata } from 'next';
import CertificateVerifyView from '@/components/clubs/CertificateVerifyView';

export async function generateMetadata({ params }: { params: Promise<{ certificateId: string }> }): Promise<Metadata> {
  const { certificateId } = await params;
  return {
    title: `Verify Certificate ${certificateId} — IIUC-ARMS`,
    description: `Verify the authenticity of IIUC club certificate ${certificateId}.`,
  };
}

export default function CertificateVerifyPage({ params }: { params: Promise<{ certificateId: string }> }) {
  return <CertificateVerifyView params={params} />;
}
