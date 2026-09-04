'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';

const ORG_TYPES = [
  { value: 'batch', label: 'Batch', icon: 'fas fa-graduation-cap' },
  { value: 'society', label: 'Society', icon: 'fas fa-users' },
  { value: 'department', label: 'Department', icon: 'fas fa-building' },
  { value: 'event', label: 'Event', icon: 'fas fa-calendar-days' },
  { value: 'custom', label: 'Custom', icon: 'fas fa-certificate' },
];

export default function CertificateStudioPage() {
  const profile = useAppStore(s => s.profile);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('batch');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!profile.email) return;
    fetch('/api/studio/certificates/orgs').then(r => r.json()).then(d => {
      setOrgs(d.orgs || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [profile.email]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/studio/certificates/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType, description: newDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success && data.org) {
        setOrgs(prev => [data.org, ...prev]);
        setShowCreate(false);
        setNewName('');
        setNewType('batch');
        setNewDesc('');
      } else {
        alert(data.error || 'Failed to create');
      }
    } catch { alert('Network error'); }
    setCreating(false);
  }

  if (!profile.email) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <i className="fas fa-certificate text-qsis text-4xl mb-4"></i>
        <h2 className="text-lg font-bold text-dark-text mb-2">Sign in to use Certificate Studio</h2>
        <p className="text-sm text-dark-text2">Create an account to issue verifiable certificates under your organization.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh]">
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-certificate text-qsis"></i> Certificate Studio
            </h1>
            <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-xl">
              Issue verifiable certificates under your organization, batch, or society. Every certificate gets a unique ID and QR code.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white transition hover:brightness-110 cursor-pointer">
            <i className="fas fa-plus mr-1"></i>New Organization
          </button>
        </div>
      </div>

      {/* Subscription Banner (placeholder) */}
      <div className="mb-6 rounded-2xl border border-dashed border-qsis/30 bg-qsis/5 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-qsis/15 flex items-center justify-center shrink-0">
          <i className="fas fa-gem text-qsis text-lg"></i>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-dark-text">Certificate Studio Pro</h3>
          <p className="text-[0.7rem] text-dark-text2">Currently free. Premium features coming soon: custom branding, bulk issuance API, priority verification.</p>
        </div>
        <span className="px-3 py-1 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-[0.65rem] font-bold shrink-0">FREE</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="rounded-2xl border border-dark-border bg-dark-bg2 p-5 animate-pulse">
              <div className="w-12 h-12 rounded-2xl bg-dark-bg3 mb-3"></div>
              <div className="h-4 w-2/3 bg-dark-bg3 rounded mb-2"></div>
              <div className="h-3 w-full bg-dark-bg3 rounded"></div>
            </div>
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-dark-border">
          <i className="fas fa-certificate text-dark-text3 text-4xl mb-3 block"></i>
          <h3 className="text-sm font-bold text-dark-text mb-1">No organizations yet</h3>
          <p className="text-[0.72rem] text-dark-text2 mb-4">Create your first organization to start issuing certificates.</p>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-semibold hover:brightness-110 transition">
            <i className="fas fa-plus mr-1"></i>Create Organization
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {orgs.map(org => (
            <Link key={org.id} href={`/studio/certificates/org/${org.slug}`}
              className="group rounded-2xl border border-dark-border bg-dark-bg2 p-5 hover:border-qsis/50 hover:bg-dark-bg3 transition-all no-underline">
              <div className="flex items-center justify-between mb-3">
                <div className="w-12 h-12 rounded-2xl bg-qsis/15 flex items-center justify-center overflow-hidden">
                  {org.logoUrl ? (
                    <img src={org.logoUrl} alt="" className="w-full h-full object-cover bg-white" />
                  ) : (
                    <i className="fas fa-certificate text-qsis text-lg"></i>
                  )}
                </div>
                <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-dark-bg3 text-dark-text2 font-semibold capitalize">{org.type}</span>
              </div>
              <h3 className="text-[0.9rem] font-bold text-dark-text mb-1 flex items-center gap-2">
                {org.name}
                <span className="material-symbols-outlined text-dark-text3 group-hover:text-qsis text-[0.95rem] transition-colors">arrow_forward</span>
              </h3>
              <div className="flex items-center gap-3 mt-2 text-[0.68rem] text-dark-text2">
                <span><i className="fas fa-certificate mr-1 text-yellow-400"></i>{org.certCount} certs</span>
                <span>Created {new Date(org.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-dark-text mb-4"><i className="fas fa-plus-circle text-qsis mr-2"></i>New Organization</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Organization Name *</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                  placeholder="CSE Batch 2024" autoFocus />
              </div>
              <div>
                <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {ORG_TYPES.map(t => (
                    <button key={t.value} onClick={() => setNewType(t.value)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold transition flex flex-col items-center gap-1 ${
                        newType === t.value
                          ? 'border-qsis bg-qsis/10 text-qsis'
                          : 'border-dark-border bg-dark-bg text-dark-text2 hover:border-qsis/40'
                      }`}>
                      <i className={`${t.icon} text-sm`}></i>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Description (optional)</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis resize-none"
                  placeholder="Brief description of this organization" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2.5 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-dark-bg3 transition">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim() || creating}
                className="flex-1 px-3 py-2.5 rounded-lg bg-qsis text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
                {creating ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-plus mr-1"></i>}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
