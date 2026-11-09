'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PageLoader from '@/components/PageLoader';
import TemplateCertificate from '@/components/certificates/TemplateCertificate';
import { CONTRIBUTOR_TEMPLATE_CSS, CONTRIBUTOR_TEMPLATE_HTML } from '@/lib/cert-template';
import { downscaleImage } from '@/lib/image-upload';
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store';
import { useUserAccess } from '@/lib/useUserAccess';

interface TemplateMeta {
  id: string;
  name: string;
  scope: string;
  isDefault: boolean;
}

interface FullTemplate extends TemplateMeta {
  html: string;
  css: string;
}

interface FormState {
  templateId: string;
  signatureUrl: string;
  signatoryName: string;
  signatoryTitle: string;
  signatoryDesignation: string;
  organizationLogo: string;
}

export default function AdminContributorCertificatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const profile = useAppStore(s => s.profile);

  const email = (session as any)?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, (profile as any)?.role);
  const { loading: accessLoading } = useUserAccess(
    email,
    effectiveRole,
    (profile as any)?.isCR || false,
    (profile as any)?.customPermissions || {},
  );
  const lowerEmail = email.toLowerCase();
  const isCertAdmin = !!email && (
    config.adminEmails.includes(lowerEmail) ||
    config.ownerEmails.includes(lowerEmail) ||
    config.isAdminOrAbove(email, effectiveRole)
  );

  const [form, setForm] = useState<FormState>({
    templateId: '',
    signatureUrl: '',
    signatoryName: config.founderName,
    signatoryTitle: 'Founder',
    signatoryDesignation: 'Programming Light',
    organizationLogo: '/pl-logo.png',
  });
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [fullTemplates, setFullTemplates] = useState<FullTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [applyExisting, setApplyExisting] = useState(true);
  const [uploading, setUploading] = useState<'' | 'signature' | 'logo'>('');
  const sigRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
    if (status === 'authenticated' && !accessLoading && !isCertAdmin) router.push('/');
  }, [status, accessLoading, isCertAdmin, router]);

  useEffect(() => {
    if (!email || !isCertAdmin) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [sRes, tRes] = await Promise.all([
          fetch('/api/admin/contributor-certificate'),
          fetch('/api/certificates/templates'),
        ]);
        const sData = await sRes.json().catch(() => ({}));
        const tData = await tRes.json().catch(() => ({}));
        if (cancelled) return;

        if (sData?.success && sData.settings) {
          setForm({
            templateId: sData.settings.templateId || '',
            signatureUrl: sData.settings.signatureUrl || '',
            signatoryName: sData.settings.signatoryName || config.founderName,
            signatoryTitle: sData.settings.signatoryTitle || 'Founder',
            signatoryDesignation: sData.settings.signatoryDesignation || 'Programming Light',
            organizationLogo: sData.settings.organizationLogo || '/pl-logo.png',
          });
          setTemplates(Array.isArray(sData.templates) ? sData.templates : []);
        }
        if (tData && !tData.error) {
          setFullTemplates(Array.isArray(tData.templates) ? tData.templates : []);
        }
      } catch {
        if (!cancelled) setMessage('Could not load contributor certificate settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [email, isCertAdmin]);

  const previewTemplate = useMemo(() => {
    const chosen = form.templateId
      ? fullTemplates.find(t => t.id === form.templateId)
      : fullTemplates.find(t => t.scope === 'contributor' && t.isDefault);
    if (chosen) return { html: chosen.html, css: chosen.css, name: chosen.name };
    return { html: CONTRIBUTOR_TEMPLATE_HTML, css: CONTRIBUTOR_TEMPLATE_CSS, name: 'IIUC-ARMS Contributor' };
  }, [form.templateId, fullTemplates]);

  const previewCert = useMemo(() => ({
    certificateId: 'IIUC-PREV-EW5M-Z9KV',
    memberName: 'Md. Rakibul Hasan',
    universityId: 'C243155',
    department: null,
    session: null,
    post: 'Contributor',
    eventName: 'Open Source Contribution',
    servicePeriod: 'Jan 2024 – Nov 2026',
    organization: 'IIUC-ARMS',
    organizationLogo: form.organizationLogo || '/pl-logo.png',
    issuedBy: 'IIUC-ARMS',
    issuedAt: new Date().toISOString(),
    githubLogin: 'rakibulhasan',
    githubUrl: 'https://github.com/rakibulhasan',
    contributionData: {
      totals: { code: 656, data: 231, issues: 12, designs: 3, prs: 4, total: 902 },
      firstContribution: '2024-01-15',
      lastContribution: '2026-11-01',
    },
    signatories: [{
      name: form.signatoryName || config.founderName,
      title: form.signatoryTitle,
      designation: form.signatoryDesignation || 'Programming Light',
      signatureUrl: form.signatureUrl || undefined,
      autoSignature: false,
    }],
  }), [
    form.organizationLogo,
    form.signatoryName,
    form.signatoryTitle,
    form.signatoryDesignation,
    form.signatureUrl,
  ]);

  async function uploadSignature(file?: File | null) {
    if (!file) return;
    setUploading('signature');
    setMessage('');
    try {
      const url = await downscaleImage(file, 640, 240);
      setForm(f => ({ ...f, signatureUrl: url }));
    } catch {
      alert('Could not read that signature image.');
    } finally {
      setUploading('');
      if (sigRef.current) sigRef.current.value = '';
    }
  }

  async function uploadLogo(file?: File | null) {
    if (!file) return;
    setUploading('logo');
    setMessage('');
    try {
      const url = await downscaleImage(file, 512, 512);
      setForm(f => ({ ...f, organizationLogo: url }));
    } catch {
      alert('Could not read that logo image.');
    } finally {
      setUploading('');
      if (logoRef.current) logoRef.current.value = '';
    }
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/contributor-certificate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, applyToExisting: applyExisting }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setMessage(
        applyExisting
          ? `Saved. Updated ${data.applied ?? 0} existing certificate${data.applied === 1 ? '' : 's'}.`
          : 'Saved. New certificates will use these settings.',
      );
    } catch (e: any) {
      setMessage(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || accessLoading) return <PageLoader fullScreen />;
  if (!session || !isCertAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-bg px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-signature text-qsis"></i> Contributor Certificate
            </h1>
            <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-2xl">
              Customize the contributor certificate: upload the real signature, set the signatory, choose the
              issuer logo, and pick the design. Contributor certificates are issued by IIUC-ARMS as a whole —
              they are not tied to a club or department.
            </p>
          </div>
          <Link
            href="/admin?tab=clubs"
            className="text-[0.72rem] text-qsis hover:underline no-underline"
          >
            <i className="fas fa-arrow-left mr-1"></i>Back to admin
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
            <p className="text-sm text-dark-text2 mt-3">Loading settings...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-dark-border bg-dark-bg2 p-5 space-y-5">
              <div>
                <h2 className="text-sm font-bold text-dark-text mb-3">
                  <i className="fas fa-user-tie text-qsis mr-2"></i>Certificate details &amp; signatory
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Name</label>
                    <input
                      type="text"
                      value={form.signatoryName}
                      onChange={e => setForm(f => ({ ...f, signatoryName: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Title</label>
                      <input
                        type="text"
                        value={form.signatoryTitle}
                        onChange={e => setForm(f => ({ ...f, signatoryTitle: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                      />
                    </div>
                    <div>
                      <label className="text-[0.68rem] text-dark-text2 mb-1 block font-semibold">Designation</label>
                      <input
                        type="text"
                        value={form.signatoryDesignation}
                        onChange={e => setForm(f => ({ ...f, signatoryDesignation: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-dark-border pt-4">
                <h2 className="text-sm font-bold text-dark-text mb-3">
                  <i className="fas fa-pen-nib text-qsis mr-2"></i>Uploaded signature
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-44 h-20 rounded-lg border border-dark-border bg-white flex items-center justify-center overflow-hidden">
                    {form.signatureUrl ? (
                      <img src={form.signatureUrl} alt="Signature" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-[0.62rem] text-dark-text3 px-3 text-center">No signature image</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => sigRef.current?.click()}
                      disabled={uploading === 'signature'}
                      className="px-3 py-2 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold hover:brightness-110 transition disabled:opacity-60 cursor-pointer"
                    >
                      <i className={`fas ${uploading === 'signature' ? 'fa-spinner fa-spin' : 'fa-upload'} mr-1`}></i>
                      {form.signatureUrl ? 'Replace signature' : 'Upload signature'}
                    </button>
                    {form.signatureUrl && (
                      <button
                        onClick={() => setForm(f => ({ ...f, signatureUrl: '' }))}
                        className="px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-[0.72rem] font-semibold hover:text-red-400 hover:border-red-500/40 transition cursor-pointer"
                      >
                        Remove signature
                      </button>
                    )}
                  </div>
                  <input
                    ref={sigRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => uploadSignature(e.target.files?.[0])}
                  />
                </div>
                <p className="text-[0.62rem] text-dark-text3 mt-2">
                  Transparent PNG works best. The image is downscaled automatically and printed above the signature line. Without an upload the signature line stays blank (no canned signature).
                </p>
              </div>

              <div className="border-t border-dark-border pt-4">
                <h2 className="text-sm font-bold text-dark-text mb-3">
                  <i className="fas fa-image text-qsis mr-2"></i>Issuer logo
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-20 h-20 rounded-xl border border-dark-border bg-white flex items-center justify-center overflow-hidden">
                    {form.organizationLogo ? (
                      <img src={form.organizationLogo} alt="Issuer logo" className="max-w-full max-h-full object-contain p-1" />
                    ) : (
                      <span className="text-[0.6rem] text-dark-text3 px-2 text-center">No logo</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => logoRef.current?.click()}
                      disabled={uploading === 'logo'}
                      className="px-3 py-2 rounded-lg bg-dark-bg3 text-dark-text text-[0.72rem] font-semibold hover:text-qsis transition disabled:opacity-60 cursor-pointer"
                    >
                      <i className={`fas ${uploading === 'logo' ? 'fa-spinner fa-spin' : 'fa-upload'} mr-1`}></i>
                      Upload logo
                    </button>
                    <button
                      onClick={() => setForm(f => ({ ...f, organizationLogo: '/pl-logo.png' }))}
                      className="px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-[0.72rem] font-semibold hover:text-qsis transition cursor-pointer"
                    >
                      Reset to Programming Light
                    </button>
                  </div>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={e => uploadLogo(e.target.files?.[0])}
                  />
                </div>
              </div>

              <div className="border-t border-dark-border pt-4">
                <h2 className="text-sm font-bold text-dark-text mb-3">
                  <i className="fas fa-palette text-qsis mr-2"></i>Design
                </h2>
                <select
                  value={form.templateId}
                  onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                >
                  <option value="">Auto — built-in IIUC-ARMS contributor design</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.scope}{t.isDefault ? ' · default' : ''})
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[0.62rem] text-dark-text3">
                    Upload or edit HTML/CSS designs in the template studio.
                  </p>
                  <Link
                    href="/studio/certificates/templates"
                    className="text-[0.68rem] text-qsis hover:underline no-underline"
                  >
                    Open template studio <i className="fas fa-arrow-right ml-1"></i>
                  </Link>
                </div>
              </div>

              <div className="border-t border-dark-border pt-4 space-y-3">
                <label className="flex items-start gap-2 text-[0.72rem] text-dark-text2">
                  <input
                    type="checkbox"
                    checked={applyExisting}
                    onChange={e => setApplyExisting(e.target.checked)}
                    className="accent-qsis mt-0.5"
                  />
                  Apply these settings to all existing contributor certificates
                </label>
                <button
                  onClick={save}
                  disabled={saving}
                  className="w-full px-4 py-2.5 rounded-lg bg-qsis text-white text-sm font-semibold hover:brightness-110 transition disabled:opacity-60 cursor-pointer"
                >
                  <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} mr-1`}></i>
                  {saving ? 'Saving...' : 'Save settings'}
                </button>
                {message && (
                  <p className="text-[0.7rem] text-dark-text2 text-center">{message}</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-dark-border bg-dark-bg2 p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-[0.7rem] font-semibold text-dark-text2">
                  <i className="fas fa-eye text-qsis mr-1"></i>Live preview
                </p>
                <span className="text-[0.6rem] text-dark-text3">{previewTemplate.name}</span>
              </div>
              <div className="rounded-xl border border-dark-border bg-white p-2 overflow-hidden">
                <TemplateCertificate template={previewTemplate} cert={previewCert} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
