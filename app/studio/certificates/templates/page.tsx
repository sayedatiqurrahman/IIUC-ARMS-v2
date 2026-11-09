'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CERT_TEMPLATE_ATTRIBUTES, DEFAULT_TEMPLATE_CSS, DEFAULT_TEMPLATE_HTML } from '@/lib/cert-template';
import TemplateCertificate from '@/components/certificates/TemplateCertificate';
import { useAppStore } from '@/lib/store';

interface Template {
  id: string;
  name: string;
  scope: string;
  ownerId: string | null;
  html: string;
  css: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CertificateTemplatesPage() {
  const profile = useAppStore(s => s.profile);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [scope, setScope] = useState('global');
  const [html, setHtml] = useState(DEFAULT_TEMPLATE_HTML);
  const [css, setCss] = useState(DEFAULT_TEMPLATE_CSS);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!profile.email) return;
    fetch('/api/certificates/templates')
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) setTemplates(d.templates || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile.email]);

  const previewCert = useMemo(() => ({
    certificateId: 'IIUC-TMPLT-XXXX-XXXX-XX',
    memberName: 'Sayed Atiqur Rahman',
    universityId: 'C243155',
    department: 'Computer Science & Engineering',
    session: '',
    post: '',
    eventName: '',
    servicePeriod: '',
    organization: 'IIUC-ARMS',
    organizationLogo: '/iiuc-logo.png',
    issuedBy: 'IIUC-ARMS',
    issuedAt: new Date().toISOString(),
    signatories: [{ name: 'Sayed Atiqur Rahman', title: 'Founder', designation: 'IIUC-ARMS' }],
  }), []);

  function openCreate() {
    setEditing(null);
    setName('');
    setScope('global');
    setHtml(DEFAULT_TEMPLATE_HTML);
    setCss(DEFAULT_TEMPLATE_CSS);
    setIsDefault(false);
    setCreating(true);
  }

  function openEdit(t: Template) {
    setCreating(false);
    setEditing(t);
    setName(t.name);
    setScope(t.scope);
    setHtml(t.html);
    setCss(t.css);
    setIsDefault(!!t.isDefault);
  }

  async function handleSave() {
    const finalName = name.trim() || 'Untitled Certificate';
    const payload: any = { name: finalName, scope, html, css, isDefault };
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/certificates/templates/${editing.id}` : '/api/certificates/templates', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditing(null);
        setCreating(false);
        setTemplates(prev => editing ? prev.map(t => (t.id === editing.id ? data.template : t)) : [data.template, ...prev]);
      } else {
        alert(data.error || 'Failed to save template');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDefault(t: Template) {
    const res = await fetch(`/api/certificates/templates/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setTemplates(prev => prev.map(x => ({ ...x, isDefault: x.id === t.id })));
    }
  }

  async function handleDelete(t: Template) {
    const res = await fetch(`/api/certificates/templates/${t.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      setTemplates(prev => prev.filter(x => x.id !== t.id));
    }
  }

  if (!profile.email) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <i className="fas fa-certificate text-qsis text-4xl mb-4"></i>
        <h2 className="text-lg font-bold text-dark-text mb-2">Sign in to manage certificate designs</h2>
        <p className="text-sm text-dark-text2">Upload your own HTML/CSS certificate designs and share them with the IIUC-ARMS community.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh]">
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-palette text-qsis"></i> Certificate Designs
            </h1>
            <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-xl">
              Upload HTML + CSS certificate designs. Use {'{{'}placeholders{'}}'} like {'{{'}memberName{'}}'} and {'{{'}certificateId{'}}'} to embed your values.
            </p>
          </div>
          <button onClick={openCreate} className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white transition hover:brightness-110 cursor-pointer">
            <i className="fas fa-plus mr-1"></i>New Design
          </button>
        </div>
        <div className="mt-3">
          <Link href="/studio/certificates" className="text-[0.72rem] text-qsis hover:underline no-underline">
            <i className="fas fa-arrow-left mr-1"></i>Back to Certificate Studio
          </Link>
        </div>
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
      ) : templates.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-dark-border">
          <i className="fas fa-palette text-dark-text3 text-4xl mb-3 block"></i>
          <h3 className="text-sm font-bold text-dark-text mb-1">No designs yet</h3>
          <p className="text-[0.72rem] text-dark-text2 mb-4">Create your first HTML/CSS certificate design.</p>
          <button onClick={openCreate} className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-semibold hover:brightness-110 transition">
            <i className="fas fa-plus mr-1"></i>Create Design
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map(t => (
            <div key={t.id} className="rounded-2xl border border-dark-border bg-dark-bg2 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[0.9rem] font-bold text-dark-text truncate flex items-center gap-2">
                    <i className="fas fa-certificate text-qsis text-[0.85rem]"></i>{t.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-dark-bg3 text-dark-text2 font-semibold uppercase">{t.scope}</span>
                    {t.isDefault && <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-qsis/15 text-qsis font-bold">DEFAULT</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleDefault(t)} title="Set as default" className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all">
                    <i className="fas fa-star text-[0.6rem]"></i>
                  </button>
                  <button onClick={() => openEdit(t)} title="Edit" className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis hover:bg-qsis/10 transition-all">
                    <i className="fas fa-pen text-[0.6rem]"></i>
                  </button>
                  <button onClick={() => handleDelete(t)} title="Delete" className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <i className="fas fa-trash text-[0.6rem]"></i>
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-dark-border overflow-hidden bg-white">
                <TemplateCertificate template={t} cert={previewCert} />
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setCreating(false); setEditing(null); }}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-6xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold text-dark-text">{editing ? 'Edit Design' : 'New Design'}</h3>
              <button onClick={() => { setCreating(false); setEditing(null); }} className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-dark-text cursor-pointer border-none transition-colors">
                <i className="fas fa-times text-[0.8rem]"></i>
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Design Name *</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Scope</label>
                  <select value={scope} onChange={e => setScope(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis">
                    <option value="global">Global</option>
                    <option value="club">Club</option>
                    <option value="studio">Studio</option>
                    <option value="contributor">Contributor</option>
                  </select>
                </div>
                <div>
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">HTML</label>
                  <textarea value={html} onChange={e => setHtml(e.target.value)} rows={10} spellCheck={false}
                    className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-xs font-mono outline-none focus:border-qsis resize-y" />
                </div>
                <div>
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">CSS</label>
                  <textarea value={css} onChange={e => setCss(e.target.value)} rows={8} spellCheck={false}
                    className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-xs font-mono outline-none focus:border-qsis resize-y" />
                </div>
                <details className="rounded-lg border border-dark-border bg-dark-bg p-2">
                  <summary className="text-[0.72rem] font-semibold text-dark-text2 cursor-pointer">
                    Available placeholders ({CERT_TEMPLATE_ATTRIBUTES.length})
                  </summary>
                  <div className="flex flex-wrap gap-1 mt-2 max-h-32 overflow-y-auto">
                    {CERT_TEMPLATE_ATTRIBUTES.map(a => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => setHtml(h => `${h}{{${a.key}}}`)}
                        title={a.label}
                        className="px-1.5 py-0.5 rounded bg-dark-bg3 text-[0.6rem] font-mono text-qsis hover:bg-qsis/10 cursor-pointer border-none"
                      >{`{{${a.key}}}`}</button>
                    ))}
                  </div>
                </details>
                <label className="flex items-center gap-2 text-[0.75rem] text-dark-text2">
                  <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="accent-qsis" />
                  Set as default for this scope
                </label>
              </div>
              <div className="rounded-2xl border border-dark-border bg-white p-3 overflow-hidden">
                <TemplateCertificate template={{ html, css }} cert={previewCert} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setCreating(false); setEditing(null); }} className="flex-1 px-3 py-2.5 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-dark-bg3 transition">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-3 py-2.5 rounded-lg bg-qsis text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-50">
                <i className="fas fa-save mr-1"></i>Save Design
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
