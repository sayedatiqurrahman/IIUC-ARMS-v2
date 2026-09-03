'use client';

import { useEffect, useState } from 'react';
import { CertPDFData, exportCertificateImage, downloadCertPDF } from '@/lib/club-cert-pdf';
import { DEFAULT_THEME } from '@/lib/cert-theme';

export default function CertificatePreviewView({ params }: { params: Promise<{ certificateId: string }> }) {
  const [certId, setCertId] = useState('');
  const [cert, setCert] = useState<any>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    params.then(p => {
      setCertId(p.certificateId);
      verifyCert(p.certificateId);
    });
  }, []);

  async function verifyCert(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    setValid(null);
    setPreviewUrl(null);
    try {
      const res = await fetch(`/api/clubs/verify/${id.trim().toUpperCase()}`);
      const data = await res.json();
      setValid(data.valid);
      if (data.valid && data.certificate) {
        setCert(data.certificate);
        const pdfData = toCertPDFData(data.certificate);
        const url = await exportCertificateImage(pdfData, 'png');
        setPreviewUrl(url);
      }
    } catch {
      setValid(false);
    }
    setLoading(false);
  }

  function toCertPDFData(c: any): CertPDFData {
    return {
      certificateId: c.certificateId,
      memberName: c.memberName,
      universityId: c.universityId,
      department: c.department,
      session: c.session || '',
      post: c.post || '',
      eventName: c.eventName || '',
      servicePeriod: c.servicePeriod || '',
      clubName: c.organization || 'Organization',
      clubLogoUrl: c.organizationLogo || undefined,
      iiucLogoUrl: '/iiuc-logo.png',
      issuedBy: c.issuedBy || c.organization || '',
      issuedAt: c.issuedAt || new Date().toISOString(),
      signatories: Array.isArray(c.signatories) ? c.signatories : [],
      theme: DEFAULT_THEME,
    };
  }

  function handleDownload() {
    if (!cert) return;
    try {
      downloadCertPDF(toCertPDFData(cert));
    } catch {
      alert('Failed to download PDF');
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <a href={`/clubs/verify/${certId}`} className="text-qsis text-sm hover:underline no-underline">
            <i className="fas fa-arrow-left mr-1"></i>Back to Verification
          </a>
          <h1 className="text-lg font-bold text-dark-text"><i className="fas fa-certificate text-qsis mr-2"></i>Certificate Preview</h1>
          {valid === true && cert && (
            <button onClick={handleDownload}
              className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-semibold hover:opacity-90 transition">
              <i className="fas fa-file-pdf mr-1"></i>Download PDF
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
            <p className="text-sm text-dark-text2 mt-3">Rendering certificate design...</p>
          </div>
        ) : valid === true && previewUrl ? (
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-dark-text">{cert.certificateId}</span>
                  <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-0.5">
                    <i className="fas fa-check-circle mr-1"></i>Verified
                  </span>
                </div>
                <p className="text-xs text-dark-text2 mt-1">{cert.memberName} — {cert.department}</p>
              </div>
              <a href={`/clubs/verify/${cert.certificateId}`} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition no-underline">
                <i className="fas fa-external-link-alt mr-1"></i>Verify
              </a>
            </div>
            <img src={previewUrl} alt={`Certificate ${cert.certificateId}`}
              className="w-full rounded-xl border border-dark-border shadow-lg object-contain" />
          </div>
        ) : valid === false ? (
          <div className="bg-red-500/5 border-2 border-red-500/30 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-red-500/20 flex items-center justify-center mb-3">
              <i className="fas fa-times-circle text-red-400 text-3xl"></i>
            </div>
            <h2 className="text-lg font-bold text-red-400 mb-2">Certificate Not Found</h2>
            <p className="text-sm text-dark-text2">This certificate ID is invalid or does not exist in our system.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
