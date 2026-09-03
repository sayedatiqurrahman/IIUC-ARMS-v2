import { redirect } from 'next/navigation';

export default function CertificateVerifyPage({ params }: { params: Promise<{ certificateId: string }> }) {
  // The combined certificate preview + verification page lives at /clubs/preview.
  return params.then(p => { redirect(`/clubs/preview/${p.certificateId}`); });
}
