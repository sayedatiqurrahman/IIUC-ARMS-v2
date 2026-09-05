'use client';

import { useEffect, useState } from 'react';
import { CertPDFData, exportCertificateImage, downloadCertPDF, downloadCertPNG } from '@/lib/club-cert-pdf';
import { DEFAULT_THEME } from '@/lib/cert-theme';
import IssuerBadge from './IssuerBadge';

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
        const url = await exportCertificateImage(pdfData, 'png', 1600);
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

  function handleDownloadPDF() {
    if (!cert) return;
    try { downloadCertPDF(toCertPDFData(cert)); } catch { alert('Failed to download PDF'); }
  }

  function handleDownloadPNG() {
    if (!cert) return;
    try { downloadCertPNG(toCertPDFData(cert)); } catch { alert('Failed to download PNG'); }
  }

  const row = (label: string, value: React.ReactNode, mono = false) => (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 text-sm">
      <span className="text-dark-text2">{label}</span>
      <span className={mono ? 'font-mono font-bold text-dark-text break-all' : 'font-semibold text-dark-text'}>{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-bg py-6 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-full bg-qsis/20 flex items-center justify-center">
              <i className="fas fa-shield-alt text-qsis"></i>
            </span>
            <div>
              <h1 className="text-lg font-bold text-dark-text leading-tight">Certificate Verification &amp; Preview</h1>
              <p className="text-xs text-dark-text2">{certId || 'IIUC-XXXX-XXXX-XXXX'}</p>
            </div>
          </div>
          {valid === true && cert && (
            <div className="flex gap-2">
              <button onClick={handleDownloadPNG}
                className="px-4 py-2 bg-dark-bg3 text-dark-text border border-dark-border rounded-lg text-sm font-semibold hover:border-qsis transition">
                <i className="fas fa-image mr-1"></i>PNG
              </button>
              <button onClick={handleDownloadPDF}
                className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-semibold hover:opacity-90 transition">
                <i className="fas fa-file-pdf mr-1"></i>Download PDF
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
            <p className="text-sm text-dark-text2 mt-3">Rendering certificate...</p>
          </div>
        ) : valid === true && cert && previewUrl ? (
          <div className="space-y-5">
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-dark-text">{cert.certificateId}</span>
                  <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-2 py-0.5">
                    <i className="fas fa-check-circle mr-1"></i>Verified
                  </span>
                </div>
                <p className="text-xs text-dark-text2">{cert.source === 'studio' ? 'Organization' : 'Club'}: <span className="text-qsis font-semibold">{cert.organization}</span></p>
              </div>
              <img src={previewUrl} alt={`Certificate ${cert.certificateId}`}
                className="w-full rounded-xl border border-dark-border shadow-lg object-contain" />
            </div>

            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-4 sm:p-6">
              <h2 className="text-sm font-bold text-dark-text mb-4"><i className="fas fa-info-circle text-qsis mr-2"></i>Certificate Details</h2>
              <div className="space-y-2.5">
                {row('Certificate ID', cert.certificateId, true)}
                {row('Member Name', cert.memberName)}
                {row('University ID', cert.universityId, true)}
                {row('Department', cert.department)}
                {cert.session && row('Session', cert.session)}
                {cert.post && row('Post', cert.post)}
                {cert.eventName && row('Event', cert.eventName)}
                {cert.servicePeriod && row('Service Period', cert.servicePeriod)}
                {row('Issued By', <IssuerBadge issuer={cert.issuer} fallback={cert.issuedBy || cert.organization} />)}
                {row('Issued', new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}
              </div>
              {Array.isArray(cert.signatories) && cert.signatories.length > 0 && (
                <div className="border-t border-dark-border pt-3 mt-4">
                  <p className="text-[0.7rem] text-dark-text3 mb-2 font-semibold">SIGNATORIES</p>
                  <div className="space-y-2">
                    {cert.signatories.map((sig: any, i: number) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <div className="w-1 h-1 rounded-full bg-qsis"></div>
                        <span className="text-dark-text font-semibold">{sig.name}</span>
                        <span className="text-dark-text3">—</span>
                        <span className="text-dark-text2">{sig.title || sig.designation || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-green-400/70 mt-4">
                <i className="fas fa-lock mr-1"></i>This certificate is verified through IIUC-ARMS
              </p>
            </div>
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
