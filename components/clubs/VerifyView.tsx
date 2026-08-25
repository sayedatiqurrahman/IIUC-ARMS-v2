'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function VerifyView() {
  const searchParams = useSearchParams();
  const [input, setInput] = useState('');
  const [cert, setCert] = useState<any>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) { setInput(id); verifyCert(id); }
  }, [searchParams]);

  async function verifyCert(id: string) {
    const clean = id.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setCert(null);
    setValid(null);
    try {
      const res = await fetch(`/api/clubs/verify/${clean}`);
      const data = await res.json();
      setValid(data.valid);
      setCert(data.certificate || null);
      if (data.valid && !history.includes(clean)) {
        setHistory(prev => [clean, ...prev].slice(0, 5));
      }
    } catch {
      setValid(false);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#18191a]">
      {/* Hero */}
      <div className="bg-gradient-to-b from-green-900/30 via-[#18191a] to-[#18191a]">
        <div className="max-w-2xl mx-auto px-4 pt-12 pb-8 text-center">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center">
            <i className="fas fa-shield-check text-green-400 text-3xl"></i>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">Certificate Verification</h1>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Scan a QR code or enter a certificate ID below to verify the authenticity of any IIUC club certificate.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {/* Search Box */}
        <div className="bg-[#242526] rounded-2xl border border-[#3a3b3c] p-5 -mt-2 shadow-xl">
          <label className="text-sm text-gray-400 font-semibold mb-2 block">Certificate ID</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"></i>
              <input
                type="text" value={input} onChange={e => setInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && verifyCert(input)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#3a3b3c] bg-[#18191a] text-white font-mono text-sm outline-none focus:border-green-500 transition"
                placeholder="IIUC-XXXX-XXXX-XXXX"
                autoFocus
              />
            </div>
            <button onClick={() => verifyCert(input)} disabled={!input.trim() || loading}
              className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm transition disabled:opacity-40 shadow-lg shadow-green-600/20">
              {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
            </button>
          </div>
          {history.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-[0.65rem] text-gray-500 mr-1">Recent:</span>
              {history.map(id => (
                <button key={id} onClick={() => { setInput(id); verifyCert(id); }}
                  className="text-[0.65rem] px-2 py-0.5 rounded bg-[#3a3b3c] text-gray-400 hover:text-white font-mono transition">
                  {id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Result */}
        <div className="mt-6">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <i className="fas fa-spinner fa-spin text-green-400 text-3xl"></i>
                <p className="text-gray-400 mt-3 text-sm">Verifying certificate...</p>
              </div>
            </div>
          )}

          {!loading && valid === true && cert && (
            <div className="bg-[#242526] rounded-2xl border-2 border-green-500/40 overflow-hidden shadow-xl shadow-green-500/5">
              {/* Valid Header */}
              <div className="bg-green-500/10 px-6 py-4 flex items-center gap-3 border-b border-green-500/20">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                  <i className="fas fa-check-circle text-green-400 text-2xl"></i>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-green-400">Certificate Verified</h2>
                  <p className="text-xs text-green-400/60">This certificate is authentic and issued by IIUC</p>
                </div>
              </div>

              {/* Club Info */}
              {cert.club && (
                <div className="px-6 py-4 border-b border-[#3a3b3c] flex items-center gap-3">
                  {cert.club.logoUrl ? (
                    <img src={cert.club.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-[#3a3b3c]" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <i className="fas fa-users text-blue-400"></i>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-bold text-white">{cert.club.name}</p>
                    <p className="text-xs text-gray-500">{cert.club.department}</p>
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="px-6 py-5 space-y-3.5">
                <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Certificate ID</span>
                  <span className="font-mono text-sm font-bold text-green-400">{cert.certificateId}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Recipient</span>
                  <span className="text-sm font-bold text-white">{cert.memberName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">University ID</span>
                  <span className="font-mono text-sm text-gray-300">{cert.universityId}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Department</span>
                  <span className="text-sm text-gray-300">{cert.department}</span>
                </div>
                {cert.session && (
                  <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Session</span>
                    <span className="text-sm text-gray-300">{cert.session}</span>
                  </div>
                )}
                {cert.post && (
                  <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Position</span>
                    <span className="text-sm font-semibold text-blue-400">{cert.post}</span>
                  </div>
                )}
                {cert.eventName && (
                  <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Event</span>
                    <span className="text-sm text-purple-400">{cert.eventName}</span>
                  </div>
                )}
                {cert.servicePeriod && (
                  <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Service Period</span>
                    <span className="text-sm text-gray-300">{cert.servicePeriod}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]/50">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Issued Date</span>
                  <span className="text-sm text-gray-300">{new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Issued By</span>
                  <span className="text-sm text-gray-300">{cert.issuedBy}</span>
                </div>

                {/* Signatories */}
                {Array.isArray(cert.signatories) && cert.signatories.length > 0 && (
                  <div className="border-t border-[#3a3b3c] pt-4 mt-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Signatories</p>
                    <div className="space-y-2.5">
                      {cert.signatories.map((sig: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 bg-[#18191a] rounded-lg px-3 py-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center text-[0.6rem] font-bold text-blue-400 shrink-0">
                            {sig.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{sig.name}</p>
                            <p className="text-xs text-gray-500">{sig.title}{sig.designation ? `, ${sig.designation}` : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-green-500/5 px-6 py-3 border-t border-green-500/20 flex items-center justify-between">
                <p className="text-xs text-green-400/70">
                  <i className="fas fa-lock mr-1"></i>Verified through IIUC-ARMS
                </p>
                <a href={`/clubs/verify/${cert.certificateId}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-green-400 hover:text-green-300 font-semibold transition no-underline">
                  <i className="fas fa-external-link-alt mr-1"></i>Full Page
                </a>
              </div>
            </div>
          )}

          {!loading && valid === false && (
            <div className="bg-[#242526] rounded-2xl border-2 border-red-500/40 p-8 text-center shadow-xl shadow-red-500/5">
              <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 flex items-center justify-center mb-4">
                <i className="fas fa-times-circle text-red-400 text-3xl"></i>
              </div>
              <h2 className="text-lg font-bold text-red-400 mb-2">Certificate Not Found</h2>
              <p className="text-sm text-gray-400 max-w-sm mx-auto">
                No certificate with ID <span className="font-mono text-white">{input.toUpperCase()}</span> was found. Please double-check the ID and try again.
              </p>
            </div>
          )}

          {!loading && valid === null && (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#242526] border border-[#3a3b3c] flex items-center justify-center">
                <i className="fas fa-qrcode text-gray-600 text-2xl"></i>
              </div>
              <p className="text-gray-500 text-sm">Enter a certificate ID or scan a QR code to begin verification</p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-8 bg-[#242526] rounded-2xl border border-[#3a3b3c] p-6">
          <h3 className="text-base font-bold text-white mb-4 text-center">How It Works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: 'fa-qrcode', color: 'text-blue-400', bg: 'bg-blue-500/15', title: 'Scan QR Code', desc: 'Point your phone camera at the QR code on any IIUC club certificate' },
              { icon: 'fa-shield-check', color: 'text-green-400', bg: 'bg-green-500/15', title: 'Instant Verify', desc: 'The QR links here — your browser shows verification result instantly' },
              { icon: 'fa-database', color: 'text-purple-400', bg: 'bg-purple-500/15', title: 'Trusted Source', desc: 'Data comes directly from IIUC-ARMS — tamper-proof and always current' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className={`w-12 h-12 mx-auto rounded-xl ${item.bg} flex items-center justify-center mb-2`}>
                  <i className={`fas ${item.icon} ${item.color} text-lg`}></i>
                </div>
                <p className="text-sm font-semibold text-white mb-1">{item.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
