'use client';

import { useEffect, useState } from 'react';

export default function CertificateVerifyView({ params }: { params: Promise<{ certificateId: string }> }) {
  const [cert, setCert] = useState<any>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [certId, setCertId] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    params.then(p => {
      setCertId(p.certificateId);
      verifyCert(p.certificateId);
    });
  }, []);

  async function verifyCert(id: string) {
    if (!id.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/verify/${id.trim().toUpperCase()}`);
      const data = await res.json();
      setValid(data.valid);
      setCert(data.certificate || null);
    } catch {
      setValid(false);
    }
    setLoading(false);
  }

  function handleManualVerify() {
    if (manualInput.trim()) {
      verifyCert(manualInput.trim());
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-full bg-qsis/20 flex items-center justify-center mb-3">
            <i className="fas fa-shield-alt text-qsis text-2xl"></i>
          </div>
          <h1 className="text-xl font-bold text-dark-text">Certificate Verification</h1>
          <p className="text-sm text-dark-text2 mt-1">Verify the authenticity of IIUC club certificates</p>
        </div>

        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-6">
          <label className="text-xs text-dark-text2 font-semibold mb-2 block">Enter Certificate ID</label>
          <div className="flex gap-2">
            <input
              type="text" value={manualInput} onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualVerify()}
              className="flex-1 px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm font-mono outline-none focus:border-qsis"
              placeholder="IIUC-XXXX-XXXX-XXXX"
            />
            <button onClick={handleManualVerify} disabled={!manualInput.trim()}
              className="px-4 py-2.5 rounded-lg bg-qsis text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
              <i className="fas fa-search"></i>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <i className="fas fa-spinner fa-spin text-qsis text-xl"></i>
          </div>
        ) : valid === true && cert ? (
          <div className="bg-green-500/5 border-2 border-green-500/30 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-3">
              <i className="fas fa-check-circle text-green-400 text-3xl"></i>
            </div>
            <h2 className="text-lg font-bold text-green-400 mb-4">Certificate Verified</h2>
            <div className="bg-dark-bg rounded-xl p-4 text-left space-y-3">
              {cert.club?.logoUrl && (
                <div className="flex justify-center mb-2">
                  <img src={cert.club.logoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Certificate ID</span>
                <span className="font-mono font-bold text-dark-text">{cert.certificateId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Club</span>
                <span className="font-semibold text-dark-text">{cert.club?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Member Name</span>
                <span className="font-semibold text-dark-text">{cert.memberName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">University ID</span>
                <span className="font-mono text-dark-text">{cert.universityId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Department</span>
                <span className="text-dark-text">{cert.department}</span>
              </div>
              {cert.session && <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Session</span>
                <span className="text-dark-text">{cert.session}</span>
              </div>}
              {cert.post && <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Post</span>
                <span className="text-qsis font-semibold">{cert.post}</span>
              </div>}
              {cert.eventName && <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Event</span>
                <span className="text-dark-text">{cert.eventName}</span>
              </div>}
              {cert.servicePeriod && <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Service Period</span>
                <span className="text-dark-text">{cert.servicePeriod}</span>
              </div>}
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Issued</span>
                <span className="text-dark-text">{new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              {Array.isArray(cert.signatories) && cert.signatories.length > 0 && (
                <div className="border-t border-dark-border pt-3 mt-3">
                  <p className="text-[0.7rem] text-dark-text3 mb-2 font-semibold">SIGNATORIES</p>
                  <div className="space-y-2">
                    {cert.signatories.map((sig: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-1 h-1 rounded-full bg-qsis"></div>
                        <span className="text-dark-text font-semibold">{sig.name}</span>
                        <span className="text-dark-text3">—</span>
                        <span className="text-dark-text2">{sig.title}</span>
                        {sig.designation && <span className="text-dark-text3">({sig.designation})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-dark-text2">Issued By</span>
                <span className="text-dark-text">{cert.issuedBy}</span>
              </div>
            </div>
            <p className="text-xs text-green-400/70 mt-4">
              <i className="fas fa-lock mr-1"></i>This certificate is verified through IIUC-ARMS
            </p>
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
