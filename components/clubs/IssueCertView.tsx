'use client';

import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { downloadCertPDF, generateBulkCertPDF, CertPDFData } from '@/lib/club-cert-pdf';

interface CertRow {
  memberName: string;
  universityId: string;
  department: string;
  session: string;
  post: string;
  eventName: string;
}

export default function IssueCertView({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState('');
  const [club, setClub] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CertRow[]>([{ memberName: '', universityId: '', department: '', session: '', post: '', eventName: '' }]);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<any[]>([]);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    params.then(async p => {
      setSlug(p.slug);
      try {
        const [clubRes, eventsRes] = await Promise.all([
          fetch(`/api/clubs/${p.slug}`),
          fetch(`/api/clubs/${p.slug}/events`),
        ]);
        const clubData = await clubRes.json();
        const eventsData = await eventsRes.json();
        setClub(clubData.club);
        setEvents(eventsData.events || []);
      } catch {}
      setLoading(false);
    });
  }, []);

  function updateRow(i: number, field: keyof CertRow, value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows(prev => [...prev, { memberName: '', universityId: '', department: '', session: '', post: '', eventName: '' }]);
  }

  function removeRow(i: number) {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleIssue() {
    const valid = rows.filter(r => r.memberName.trim() && r.universityId.trim() && r.department.trim());
    if (valid.length === 0) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/certificates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificates: valid }),
      });
      const data = await res.json();
      if (data.success) {
        setIssued(data.certificates || []);
        const urls: Record<string, string> = {};
        for (const cert of data.certificates) {
          urls[cert.certificateId] = await QRCode.toDataURL(
            `${typeof window !== 'undefined' ? window.location.origin : 'https://iiuc-arms.eu.cc'}/clubs/verify/${cert.certificateId}`,
            { width: 200, margin: 2 }
          );
        }
        setQrUrls(urls);
        setRows([{ memberName: '', universityId: '', department: '', session: '', post: '', eventName: '' }]);
      } else {
        alert(data.error || 'Failed to issue');
      }
    } catch { alert('Network error'); }
    setIssuing(false);
  }

  function toCertPDFData(cert: any): CertPDFData {
    return {
      certificateId: cert.certificateId,
      memberName: cert.memberName,
      universityId: cert.universityId,
      department: cert.department,
      session: cert.session || '',
      post: cert.post || '',
      eventName: cert.eventName || '',
      clubName: club?.name || slug,
      issuedBy: club?.name || slug,
      issuedAt: cert.issuedAt || new Date().toISOString(),
    };
  }

  async function handleBulkDownload() {
    if (issued.length === 0) return;
    setGeneratingPdf(true);
    try {
      await generateBulkCertPDF(issued.map(toCertPDFData));
    } catch (e) { alert('PDF generation failed'); }
    setGeneratingPdf(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-bg py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <a href={`/clubs/${slug}`} className="text-qsis text-xs hover:underline no-underline"><i className="fas fa-arrow-left mr-1"></i>Back to {club?.name || 'Club'}</a>
          <h1 className="text-xl font-bold text-dark-text mt-2 flex items-center gap-2">
            <i className="fas fa-certificate text-qsis"></i> Issue Certificates
          </h1>
          <p className="text-sm text-dark-text2 mt-1">Generate verifiable certificates with unique IDs and QR codes</p>
        </div>

        {issued.length === 0 ? (
          <div>
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-dark-text">Certificate Details</h3>
                <button onClick={addRow} className="text-qsis text-xs font-semibold hover:underline">
                  <i className="fas fa-plus mr-1"></i>Add More
                </button>
              </div>
              <div className="space-y-4">
                {rows.map((row, i) => (
                  <div key={i} className="bg-dark-bg border border-dark-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-dark-text2 font-semibold">#{i + 1}</span>
                      {rows.length > 1 && (
                        <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-xs"><i className="fas fa-trash"></i></button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Full Name *</label>
                        <input type="text" value={row.memberName} onChange={e => updateRow(i, 'memberName', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="Md. Abdul Karim" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">University ID *</label>
                        <input type="text" value={row.universityId} onChange={e => updateRow(i, 'universityId', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="2024-101-001" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Department *</label>
                        <input type="text" value={row.department} onChange={e => updateRow(i, 'department', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="CSE" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Session</label>
                        <input type="text" value={row.session} onChange={e => updateRow(i, 'session', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="2022-23" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Post / Designation</label>
                        <input type="text" value={row.post} onChange={e => updateRow(i, 'post', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="General Secretary" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Event Name</label>
                        <input type="text" value={row.eventName} onChange={e => updateRow(i, 'eventName', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="Programming Contest 2025" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleIssue} disabled={issuing}
                  className="px-6 py-2.5 bg-qsis text-white rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
                  {issuing ? <><i className="fas fa-spinner fa-spin mr-1"></i>Issuing...</> : <><i className="fas fa-certificate mr-1"></i>Issue {rows.filter(r => r.memberName.trim() && r.universityId.trim() && r.department.trim()).length} Certificate(s)</>}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-green-500/5 border border-green-500/30 rounded-2xl p-5 mb-6 text-center">
              <i className="fas fa-check-circle text-green-400 text-3xl mb-2 block"></i>
              <h2 className="text-lg font-bold text-green-400">{issued.length} Certificate(s) Issued Successfully</h2>
              <p className="text-xs text-dark-text2 mt-1">Share these with your club members</p>
              <div className="flex items-center justify-center gap-3 mt-4">
                <button onClick={handleBulkDownload} disabled={generatingPdf}
                  className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
                  {generatingPdf ? <><i className="fas fa-spinner fa-spin mr-1"></i>Generating...</> : <><i className="fas fa-file-pdf mr-1"></i>Download All PDFs ({issued.length})</>}
                </button>
                <button onClick={() => setIssued([])} className="px-4 py-2 bg-dark-bg2 border border-dark-border rounded-lg text-sm font-semibold text-dark-text2 hover:border-qsis transition">
                  <i className="fas fa-plus mr-1"></i>Issue More
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {issued.map(cert => (
                <div key={cert.id} className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
                  <div className="flex items-start gap-4">
                    {qrUrls[cert.certificateId] && (
                      <img src={qrUrls[cert.certificateId]} alt="QR" className="w-24 h-24 rounded-lg border border-dark-border" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-certificate text-qsis"></i>
                        <span className="font-mono text-sm font-bold text-dark-text">{cert.certificateId}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-dark-text2">Name:</span> <span className="text-dark-text font-semibold">{cert.memberName}</span></div>
                        <div><span className="text-dark-text2">UID:</span> <span className="text-dark-text">{cert.universityId}</span></div>
                        <div><span className="text-dark-text2">Dept:</span> <span className="text-dark-text">{cert.department}</span></div>
                        {cert.post && <div><span className="text-dark-text2">Post:</span> <span className="text-qsis">{cert.post}</span></div>}
                        {cert.eventName && <div className="col-span-2"><span className="text-dark-text2">Event:</span> <span className="text-dark-text">{cert.eventName}</span></div>}
                      </div>
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <a href={`/clubs/verify/${cert.certificateId}`} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition no-underline">
                          <i className="fas fa-external-link-alt mr-1"></i>Verify Link
                        </a>
                        <button onClick={() => downloadCertPDF(toCertPDFData(cert))}
                          className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                          <i className="fas fa-file-pdf mr-1"></i>Download PDF
                        </button>
                        <button onClick={() => {
                          const link = document.createElement('a');
                          link.href = qrUrls[cert.certificateId];
                          link.download = `cert-${cert.certificateId}.png`;
                          link.click();
                        }} className="px-3 py-1.5 bg-dark-bg border border-dark-border rounded-lg text-xs font-semibold text-dark-text2 hover:border-qsis transition">
                          <i className="fas fa-download mr-1"></i>QR Code
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
