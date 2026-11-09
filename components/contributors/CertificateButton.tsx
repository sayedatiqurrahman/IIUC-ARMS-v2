'use client';

import { useRouter } from 'next/navigation';

interface Props {
  c: any;
  size?: 'sm' | 'md';
}

export default function CertificateButton({ c, size = 'sm' }: Props) {
  const router = useRouter();

  function handleGetCertificate() {
    if (!c?.login) return;
    router.push(`/certificates/contributor/${encodeURIComponent(c.login)}`);
  }

  const sizeClass = size === 'md'
    ? 'px-2.5 py-1.5 text-[0.68rem]'
    : 'w-7 h-7';

  const iconSize = size === 'md' ? 'mr-1 text-[0.7rem]' : 'text-[0.6rem]';

  return (
    <button
      onClick={handleGetCertificate}
      title="Generate your certificate"
      className={`${sizeClass} rounded-lg bg-qsis/10 border border-qsis/30 text-qsis font-semibold hover:bg-qsis hover:text-white transition-all flex items-center justify-center cursor-pointer ${size === 'md' ? '' : 'flex-shrink-0'}`}
    >
      <i className={`fas fa-certificate ${iconSize}`}></i>
      {size === 'md' && <span>Get Certificate</span>}
    </button>
  );
}
