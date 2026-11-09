'use client';

import { useState } from 'react';

interface Props {
  c: any;
  size?: 'sm' | 'md';
}

export default function CertificateButton({ c, size = 'sm' }: Props) {
  const [generating, setGenerating] = useState(false);

  async function handleGetCertificate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/contributors/certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: c.login }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.open(data.verifyUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(data?.error || 'Could not generate your certificate');
      }
    } catch {
      alert('Could not generate your certificate');
    } finally {
      setGenerating(false);
    }
  }

  const sizeClass = size === 'md'
    ? 'px-2.5 py-1.5 text-[0.68rem]'
    : 'w-7 h-7';

  const iconSize = size === 'md' ? 'mr-1 text-[0.7rem]' : 'text-[0.6rem]';

  return (
    <button
      onClick={handleGetCertificate}
      disabled={generating}
      title="Generate your certificate"
      className={`${sizeClass} rounded-lg bg-qsis/10 border border-qsis/30 text-qsis font-semibold hover:bg-qsis hover:text-white transition-all flex items-center justify-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${size === 'md' ? '' : 'flex-shrink-0'}`}
    >
      <i className={`fas ${generating ? 'fa-spinner fa-spin' : 'fa-certificate'} ${iconSize}`}></i>
      {size === 'md' && <span>Get Certificate</span>}
    </button>
  );
}
