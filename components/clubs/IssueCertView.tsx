'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { parseClubRoles } from '@/lib/club-member-roles';
import QRCode from 'qrcode';
import { downloadCertPDF, generateBulkCertPDF, exportCertificateImage, CertPDFData } from '@/lib/club-cert-pdf';
import { CertSignatory, CertTheme, CertLogoKey, DEFAULT_THEME, THEME_PRESETS } from '@/lib/cert-theme';
import CertDesignPanel from '@/components/studio/CertDesignPanel';
import { generateSignatureDataURL, signatureTextFor } from '@/lib/signature-gen';
import { normalizeUniversityId } from '@/lib/utils';
import { parseSpreadsheetFile, mapCertificateRows, downloadCsvTemplate } from '@/lib/spreadsheet';

interface CertRow {
  memberName: string;
  universityId: string;
  department: string;
  session: string;
  post: string;
  eventName: string;
  servicePeriod: string;
  eventId: string;
  email: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const CUSTOM_THEMES_KEY = 'arms.customThemes';

function loadCustomThemes(): CertTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_THEMES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((t: any) => t && t.name && t.colors) : [];
  } catch {
    return [];
  }
}

function persistCustomThemes(list: CertTheme[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(list));
  } catch {}
}

function categoryLabel(cat?: string): { label: string; cls: string } {
  switch (cat) {
    case 'event': return { label: 'Event', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' };
    case 'other': return { label: 'Others', cls: 'text-dark-text2 bg-dark-bg3 border-dark-border' };
    case 'custom': return { label: 'Custom', cls: 'text-qsis bg-qsis/10 border-qsis/30' };
    default: return { label: 'Membership', cls: 'text-green-300 bg-green-500/10 border-green-500/30' };
  }
}

const defaultSignatories: CertSignatory[] = [
  { name: '', designation: '', title: 'President', autoSignature: true },
  { name: '', designation: '', title: 'Chairman', autoSignature: true },
];

export default function IssueCertView({ params }: { params: Promise<{ slug: string }> }) {
  const profile = useAppStore(s => s.profile);
  const [slug, setSlug] = useState('');
  const [club, setClub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [rows, setRows] = useState<CertRow[]>([{ memberName: '', universityId: '', department: '', session: '', post: '', eventName: '', servicePeriod: '', eventId: '', email: '' }]);
  const [signatories, setSignatories] = useState<CertSignatory[]>(defaultSignatories);
  const [themes, setThemes] = useState<CertTheme[]>(THEME_PRESETS);
  const [customThemes, setCustomThemes] = useState<CertTheme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<CertTheme>(DEFAULT_THEME);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [showDesigner, setShowDesigner] = useState(false);
  const [workingTheme, setWorkingTheme] = useState<CertTheme>(DEFAULT_THEME);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<any[]>([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [expandedSig, setExpandedSig] = useState<number | null>(null);
  const [sigPreviews, setSigPreviews] = useState<Record<number, string>>({});
  const sigFileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Bulk import + logo + email
  const [importingFile, setImportingFile] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const bulkFileRef = useRef<HTMLInputElement | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ connected: boolean; email?: string; configured?: boolean } | null>(null);
  const [emailSubject, setEmailSubject] = useState('Your certificate is ready');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<any>(null);

  const allThemes = [...themes, ...customThemes];

  useEffect(() => {
    params.then(async p => {
      setSlug(p.slug);
      setCustomThemes(loadCustomThemes());
      try {
        const [clubRes, themesRes, eventsRes] = await Promise.all([
          fetch(`/api/clubs/${p.slug}`),
          fetch('/api/clubs/themes'),
          fetch(`/api/clubs/${p.slug}/events`),
        ]);
        const clubData = await clubRes.json();
        const themesData = await themesRes.json();
        const eventsData = await eventsRes.json();
        setClub(clubData.club);
        if (themesData.themes) setThemes(themesData.themes);
        if (Array.isArray(eventsData.events)) setEvents(eventsData.events);

        if (clubData.club?.department) {
          setRows(prev => prev.map((r, idx) => idx === 0 && !r.department ? { ...r, department: clubData.club.department } : r));
        }

        try {
          const themeRes = await fetch(`/api/clubs/${p.slug}/theme`);
          const themeData = await themeRes.json();
          if (themeData.theme) setSelectedTheme(themeData.theme);
        } catch {}

        const myMember = clubData.club?.members?.find((m: any) => m.userId === profile.email);
        const isAdmin = profile.role === 'admin' || profile.role === 'manager';
        const isOfficer = !!myMember && ['gs', 'ags', 'ogs', 'office_secretary'].includes(myMember.role);
        const isClubAdmin = !!myMember?.isClubAdmin;
        const myClubRoles = parseClubRoles(myMember?.clubRoles);
        const canIssue = isAdmin || isOfficer || isClubAdmin || myClubRoles.includes('club_admin') || myClubRoles.includes('club_maintainer') || myClubRoles.includes('club_cert_issuer');
        if (!canIssue) setDenied(true);
      } catch {}
      setLoading(false);
    });
  }, [profile.email, profile.role]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch('/api/email/gmail/status')
      .then(r => r.json())
      .then(d => { if (!cancelled) setGmailStatus(d); })
      .catch(() => { if (!cancelled) setGmailStatus({ connected: false }); });

    const gmail = new URLSearchParams(window.location.search).get('gmail');
    if (gmail === 'connected') setImportMsg('Gmail connected — you can now email certificates.');
    else if (gmail === 'unconfigured') setImportMsg('Gmail sending is not configured on this deployment yet.');
    else if (gmail === 'norefresh') setImportMsg('Google did not return a refresh token. Remove the app from your Google account permissions and try again.');
    else if (gmail === 'error') setImportMsg('Could not connect Gmail. Please try again.');

    return () => { cancelled = true; };
  }, [slug]);

  const [issuedHydrated, setIssuedHydrated] = useState(false);
  useEffect(() => {
    if (!slug) return;
    try {
      const raw = sessionStorage.getItem(`arms.issued.${slug}`);
      if (raw) setIssued(JSON.parse(raw));
    } catch {}
    setIssuedHydrated(true);
  }, [slug]);
  useEffect(() => {
    if (!issuedHydrated || !slug) return;
    try {
      if (issued.length) sessionStorage.setItem(`arms.issued.${slug}`, JSON.stringify(issued));
      else sessionStorage.removeItem(`arms.issued.${slug}`);
    } catch {}
  }, [issued, slug, issuedHydrated]);

  useEffect(() => {
    if (!club?.name) return;
    setEmailSubject(`Your ${club.name} certificate`);
    setEmailMessage(
      `Hi {{name}},\n\nCongratulations! Your certificate from ${club.name} is ready.\n\nCertificate ID: {{certificateId}}\nVerify: {{verifyUrl}}\n\nYou can download and share it using the link above.\n\nBest regards,\n${club.name}`
    );
  }, [club?.name]);

  function updateRow(i: number, field: keyof CertRow, value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows(prev => [...prev, { memberName: '', universityId: '', department: club?.department || '', session: '', post: '', eventName: selectedEventId && events.find(e => e.id === selectedEventId)?.title || '', servicePeriod: '', eventId: selectedEventId, email: '' }]);
  }

  function removeRow(i: number) {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateSignatory(i: number, field: keyof CertSignatory, value: string) {
    setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }

  function addSignatory() {
    setSignatories(prev => [...prev, { name: '', designation: '', title: '', autoSignature: true }]);
  }

  function removeSignatory(i: number) {
    if (signatories.length <= 1) return;
    setSignatories(prev => prev.filter((_, idx) => idx !== i));
    setSigPreviews(prev => { const n = { ...prev }; delete n[i]; return n; });
  }

  function handleSigFileUpload(i: number, file: File) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, signatureUrl: dataUrl } : s));
      setSigPreviews(prev => ({ ...prev, [i]: dataUrl }));
    };
    reader.readAsDataURL(file);
  }

  function removeSignature(i: number) {
    setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, signatureUrl: undefined } : s));
    setSigPreviews(prev => { const n = { ...prev }; delete n[i]; return n; });
    if (sigFileRefs.current[i]) sigFileRefs.current[i]!.value = '';
  }

  // ---- Event-aware issuing -------------------------------------------------

  function selectEvent(evId: string) {
    setSelectedEventId(evId);
    const ev = events.find(e => e.id === evId);
    setRows(prev => prev.map(r => ({
      ...r,
      eventId: evId,
      eventName: ev ? ev.title : '',
    })));
    if (ev?.theme) {
      try {
        const t = JSON.parse(ev.theme);
        if (t && t.name) setSelectedTheme(t);
      } catch {}
    }
  }

  async function saveEventTheme() {
    if (!selectedEventId) {
      alert('Select an event first to save its certificate design.');
      return;
    }
    try {
      const res = await fetch(`/api/clubs/${slug}/events`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedEventId, theme: selectedTheme }),
      });
      const data = await res.json();
      if (data.success) {
        setEvents(prev => prev.map(e => e.id === selectedEventId ? { ...e, theme: JSON.stringify(selectedTheme) } : e));
        alert(`Saved "${selectedTheme.displayName}" as the design for this event.`);
      } else {
        alert(data.error || 'Failed to save event design');
      }
    } catch {
      alert('Failed to save event design');
    }
  }

  // ---- Custom theme designer ------------------------------------------------

  function startNewTheme() {
    setWorkingTheme({
      ...selectedTheme,
      name: `custom-${Date.now()}`,
      displayName: selectedTheme.displayName,
      category: 'custom',
      published: false,
    });
    setShowDesigner(true);
  }

  function editCurrentTheme() {
    setWorkingTheme({ ...selectedTheme });
    setShowDesigner(true);
  }

  function saveCustomTheme() {
    let name = workingTheme.name || `custom-${Date.now()}`;
    if (allThemes.some(x => x.name === name)) name = `custom-${Date.now()}`;
    const t: CertTheme = {
      ...workingTheme,
      name,
      displayName: workingTheme.displayName?.trim() || 'Custom Theme',
      category: 'custom',
      published: false,
    };
    const next = [...customThemes.filter(x => x.name !== t.name), t];
    setCustomThemes(next);
    persistCustomThemes(next);
    setSelectedTheme(t);
    setShowDesigner(false);
  }

  function removeCustomTheme(name: string) {
    if (!window.confirm(`Remove custom theme "${name}"?`)) return;
    const next = customThemes.filter(t => t.name !== name);
    setCustomThemes(next);
    persistCustomThemes(next);
    if (selectedTheme.name === name) setSelectedTheme(DEFAULT_THEME);
  }

  // ---- Logo position pickers --------------------------------------------------

  function updateLogoPosition(side: 'left' | 'right', logo: CertLogoKey) {
    if (showDesigner) {
      setWorkingTheme(prev => ({
        ...prev,
        design: {
          ...(prev.design || {}),
          logoPositions: { ...(prev.design?.logoPositions || {}), [side]: logo },
        },
      }));
      return;
    }
    setSelectedTheme(t => ({
      ...t,
      design: {
        ...(t.design || {}),
        logoPositions: { ...(t.design?.logoPositions || {}), [side]: logo },
      },
    }));
  }

  const getSigPreview = useCallback(async (sig: CertSignatory, i: number) => {
    if (sig.signatureUrl) return sig.signatureUrl;
    if (sigPreviews[i]) return sigPreviews[i];
    if (sig.autoSignature !== false && sig.name) {
      const url = await generateSignatureDataURL(signatureTextFor(sig));
      return url;
    }
    return null;
  }, [sigPreviews]);

  async function handleIssue() {
    const valid = rows.filter(r => r.memberName.trim() && r.universityId.trim() && r.department.trim());
    if (valid.length === 0) return;
    setIssuing(true);
    try {
      const cleanedSigs = signatories.filter(s => s.name.trim());
      const res = await fetch(`/api/clubs/${slug}/certificates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificates: valid.map(r => ({
            ...r,
            signatories: cleanedSigs.length > 0 ? cleanedSigs : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIssued(data.certificates || []);
        const urls: Record<string, string> = {};
        for (const cert of data.certificates) {
          urls[cert.certificateId] = await QRCode.toDataURL(
            `${typeof window !== 'undefined' ? window.location.origin : 'https://arms.iiuc.net'}/clubs/preview/${cert.certificateId}`,
            { width: 200, margin: 2 }
          );
        }
        setQrUrls(urls);
        setRows([{ memberName: '', universityId: '', department: '', session: '', post: '', eventName: selectedEventId && events.find(e => e.id === selectedEventId)?.title || '', servicePeriod: '', eventId: selectedEventId, email: '' }]);
      } else {
        alert(data.error || 'Failed to issue');
      }
    } catch { alert('Network error'); }
    setIssuing(false);
  }

  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});

  function toCertPDFData(cert: any): CertPDFData {
    return {
      certificateId: cert.certificateId,
      memberName: cert.memberName,
      universityId: cert.universityId,
      department: cert.department,
      session: cert.session || '',
      post: cert.post || '',
      eventName: cert.eventName || '',
      servicePeriod: cert.servicePeriod || '',
      clubName: club?.name || slug,
      clubLogoUrl: club?.logoUrl || undefined,
      iiucLogoUrl: '/iiuc-logo.png',
      issuedBy: club?.name || slug,
      issuedAt: cert.issuedAt || new Date().toISOString(),
      signatories: signatories.filter(s => s.name.trim()),
      theme: selectedTheme,
    };
  }

  async function handleBulkDownload() {
    if (issued.length === 0) return;
    setGeneratingPdf(true);
    try {
      await generateBulkCertPDF(issued.map(toCertPDFData));
    } catch { alert('PDF generation failed'); }
    setGeneratingPdf(false);
  }

  // ---- Bulk import (CSV / Excel) -------------------------------------------

  async function handleBulkFile(file: File) {
    setImportingFile(true);
    setImportMsg('');
    try {
      const matrix = await parseSpreadsheetFile(file);
      const parsed = mapCertificateRows(matrix);
      if (parsed.length === 0) {
        setImportMsg('No rows found. Make sure the first row contains column headers like memberName, universityId, department, email.');
        return;
      }
      const evTitle = selectedEventId ? (events.find(e => e.id === selectedEventId)?.title || '') : '';
      const imported: CertRow[] = parsed.map(r => ({
        memberName: r.memberName,
        universityId: normalizeUniversityId(r.universityId),
        department: r.department || club?.department || '',
        session: r.session,
        post: r.post,
        eventName: r.eventName || evTitle,
        servicePeriod: r.servicePeriod,
        eventId: selectedEventId,
        email: r.email,
      }));
      setRows(prev => {
        const nonEmpty = prev.filter(r => r.memberName.trim() || r.universityId.trim() || r.email.trim());
        return nonEmpty.length === 0 ? imported : [...nonEmpty, ...imported];
      });
      setImportMsg(`Imported ${imported.length} row(s) from ${file.name}. Review the list, then issue.`);
    } catch (e: any) {
      setImportMsg(`Could not read file: ${e?.message || 'unknown error'}`);
    } finally {
      setImportingFile(false);
      if (bulkFileRef.current) bulkFileRef.current.value = '';
    }
  }

  // ---- Club logo upload ------------------------------------------------------

  async function handleLogoFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    setLogoUploading(true);
    try {
      const image = await fileToDataUrl(file);
      const res = await fetch(`/api/clubs/${slug}/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, type: 'logo' }),
      });
      const data = await res.json();
      if (data.success) {
        setClub((c: any) => ({ ...(c || {}), logoUrl: data.logoUrl }));
      } else {
        alert(data.error || 'Logo upload failed');
      }
    } catch {
      alert('Logo upload failed');
    } finally {
      setLogoUploading(false);
      if (logoFileRef.current) logoFileRef.current.value = '';
    }
  }

  // ---- Email certificates via connected Gmail (no SMTP) ----------------------

  async function handleDisconnectGmail() {
    if (!confirm('Disconnect Gmail? You can reconnect anytime.')) return;
    try {
      await fetch('/api/email/gmail/disconnect', { method: 'POST' });
      setGmailStatus({ connected: false, configured: gmailStatus?.configured !== false });
      setEmailResult(null);
    } catch {}
  }

  async function handleSendEmails() {
    if (issued.length === 0) return;
    setSendingEmail(true);
    setEmailResult(null);
    const ids = issued.map(c => c.certificateId);
    const chunkSize = 40;
    const allResults: any[] = [];
    try {
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const res = await fetch(`/api/clubs/${slug}/certificates/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            certificateIds: chunk,
            subject: emailSubject,
            message: emailMessage,
          }),
        });
        const data = await res.json();
        if (data.success) {
          allResults.push(...(data.results || []));
          setEmailResult({
            success: true,
            results: allResults,
            summary: {
              sent: allResults.filter(r => r.status === 'sent').length,
              skipped: allResults.filter(r => r.status === 'skipped').length,
              failed: allResults.filter(r => r.status === 'failed').length,
            },
          });
        } else if (data.needsConnect) {
          setGmailStatus(s => ({ ...(s || { connected: false }), connected: false, configured: data.configured !== false }));
          alert(data.error || 'Connect your Gmail account first.');
          break;
        } else {
          alert(data.error || 'Failed to send emails');
          break;
        }
      }
    } catch {
      alert('Network error while sending emails');
    } finally {
      setSendingEmail(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
    </div>
  );

  if (denied) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-lock text-red-400 text-2xl"></i>
        </div>
        <h2 className="text-lg font-bold text-dark-text mb-2">Access Denied</h2>
        <p className="text-sm text-dark-text2 mb-4">You don&apos;t have permission to issue certificates for this club. Only club admins, maintainers, certificate issuers, and GS/AGS officers can issue certificates.</p>
        <a href={`/clubs/${slug}`} className="text-qsis text-sm hover:underline"><i className="fas fa-arrow-left mr-1"></i>Back to {club?.name || 'Club'}</a>
      </div>
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

        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-4 mb-4 flex items-center gap-3 flex-wrap">
          <div className="w-12 h-12 rounded-lg bg-dark-bg border border-dark-border flex items-center justify-center overflow-hidden flex-shrink-0">
            {club?.logoUrl
              ? <img src={club.logoUrl} alt="Club logo" className="w-full h-full object-contain" />
              : <i className="fas fa-image text-dark-text3"></i>}
          </div>
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-semibold text-dark-text">Club logo</p>
            <p className="text-xs text-dark-text2">{club?.logoUrl ? 'This logo is printed on every certificate.' : 'No club logo set — upload one to complete your certificates.'}</p>
          </div>
          <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); }} />
          <button onClick={() => logoFileRef.current?.click()} disabled={logoUploading}
            className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition disabled:opacity-50">
            {logoUploading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Uploading...</> : <><i className="fas fa-upload mr-1"></i>{club?.logoUrl ? 'Replace logo' : 'Upload logo'}</>}
          </button>
        </div>

        {issued.length === 0 ? (
          <div className="space-y-4">
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <h3 className="text-sm font-bold text-dark-text mb-1"><i className="fas fa-calendar-day text-qsis mr-2"></i>Event (optional)</h3>
              <p className="text-xs text-dark-text2 mb-3">Select an event to design its certificate collection. Certificates issued for an event are grouped under it on the club page and linked to the event design.</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <select value={selectedEventId} onChange={e => selectEvent(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis">
                  <option value="">-- No event (general certificate) --</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}{ev.eventDate ? ` — ${new Date(ev.eventDate).toLocaleDateString()}` : ''}
                    </option>
                  ))}
                </select>
                {selectedEventId && (
                  <div className="flex gap-2 flex-wrap">
                    <a href={`/clubs/${slug}?event=${selectedEventId}`} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-2 bg-dark-bg3 text-dark-text border border-dark-border rounded-lg text-xs font-semibold hover:border-qsis transition no-underline">
                      <i className="fas fa-list mr-1"></i>View Event
                    </a>
                    <button onClick={saveEventTheme}
                      className="px-3 py-2 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                      <i className="fas fa-save mr-1"></i>Save Design to Event
                    </button>
                  </div>
                )}
              </div>
              {selectedEventId && (
                <p className="text-xs text-dark-text3 mt-2"><i className="fas fa-info-circle mr-1"></i>Recipients below are tagged to this event automatically.</p>
              )}
            </div>

            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-palette text-qsis mr-2"></i>Certificate Theme</h3>
                <div className="flex gap-2">
                  <button onClick={editCurrentTheme}
                    className="text-xs font-semibold text-dark-text2 hover:text-qsis"><i className="fas fa-sliders-h mr-1"></i>Edit Current</button>
                  <button onClick={startNewTheme}
                    className="text-xs font-semibold text-qsis"><i className="fas fa-plus mr-1"></i>New Custom Theme</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {allThemes.map(theme => (
                  <button key={theme.name} onClick={() => setSelectedTheme(theme)}
                    className={`text-left rounded-xl overflow-hidden border transition-all ${
                      selectedTheme.name === theme.name
                        ? 'border-qsis ring-1 ring-qsis/40'
                        : 'border-dark-border hover:border-qsis/40'
                    }`}>
                    <ThemePreview theme={theme} club={club} />
                    <div className="p-2.5 bg-dark-bg">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-dark-text truncate">{theme.displayName}</span>
                        {theme.category === 'custom' && (
                          <button onClick={e => { e.stopPropagation(); removeCustomTheme(theme.name); }}
                            title="Delete this custom theme"
                            className="text-red-400 hover:text-red-300 shrink-0"><i className="fas fa-trash"></i></button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full border font-semibold ${categoryLabel(theme.category).cls}`}>
                          {categoryLabel(theme.category).label}
                        </span>
                        <span className="text-[0.6rem] text-dark-text3 truncate">
                          {(theme.design?.text?.subtitle || theme.title?.subtitle || '').toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-dark-bg border border-dark-border rounded-xl p-4">
                <LogoPositionPicker label="Left seal" value={selectedTheme.design?.logoPositions?.left || 'iiuc'} onChange={v => updateLogoPosition('left', v)} />
                <LogoPositionPicker label="Right seal" value={selectedTheme.design?.logoPositions?.right || 'club'} onChange={v => updateLogoPosition('right', v)} />
              </div>
              <p className="text-xs text-dark-text3 mt-2"><i className="fas fa-info-circle mr-1"></i>Many IIUC certificates carry two award seals. Choose which logo appears in each seal.</p>
            </div>

            {showDesigner && (
              <div className="bg-dark-bg2 border border-qsis/40 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-paint-brush text-qsis mr-2"></i>Design Custom Theme</h3>
                  <button onClick={() => setShowDesigner(false)} className="text-dark-text2 hover:text-dark-text text-xs"><i className="fas fa-times"></i></button>
                </div>
                <div className="mb-4 max-w-sm">
                  <label className="text-[0.68rem] text-dark-text2 mb-1 block">Theme name</label>
                  <input type="text" value={workingTheme.displayName || ''}
                    onChange={e => setWorkingTheme(t => ({ ...t, displayName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                    placeholder="e.g. Our Annual Tech Fest" />
                </div>
                <CertDesignPanel theme={workingTheme} onChange={setWorkingTheme} />
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button onClick={saveCustomTheme}
                    className="px-5 py-2 bg-qsis text-white rounded-lg text-sm font-bold hover:opacity-90 transition">
                    <i className="fas fa-check mr-1"></i>Save Custom Theme
                  </button>
                  <button onClick={() => setShowDesigner(false)}
                    className="px-4 py-2 bg-dark-bg3 text-dark-text border border-dark-border rounded-lg text-sm font-semibold hover:border-qsis transition">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-signature text-qsis mr-2"></i>Signatories</h3>
                <button onClick={addSignatory} className="text-qsis text-xs font-semibold hover:underline"><i className="fas fa-plus mr-1"></i>Add</button>
              </div>
              <div className="space-y-3">
                {signatories.map((sig, i) => (
                  <div key={i} className="bg-dark-bg border border-dark-border rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                        <div>
                          <label className="text-[0.65rem] text-dark-text2 mb-1 block">Name</label>
                          <input type="text" value={sig.name} onChange={e => updateSignatory(i, 'name', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis"
                            placeholder="Dr. Mohammed Rahman" />
                        </div>
                        <div>
                          <label className="text-[0.65rem] text-dark-text2 mb-1 block">Title</label>
                          <input type="text" value={sig.title} onChange={e => updateSignatory(i, 'title', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis"
                            placeholder="President" />
                        </div>
                        <div>
                          <label className="text-[0.65rem] text-dark-text2 mb-1 block">Designation</label>
                          <input type="text" value={sig.designation} onChange={e => updateSignatory(i, 'designation', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis"
                            placeholder="Dept. of CSE, IIUC" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-5">
                        <button onClick={() => setExpandedSig(expandedSig === i ? null : i)}
                          className="text-dark-text2 hover:text-qsis text-xs" title="Signature">
                          <i className="fas fa-pen-nib"></i>
                        </button>
                        {signatories.length > 1 && (
                          <button onClick={() => removeSignatory(i)} className="text-red-400 hover:text-red-300 text-xs"><i className="fas fa-trash"></i></button>
                        )}
                      </div>
                    </div>

                    {expandedSig === i && (
                      <div className="mt-3 pt-3 border-t border-dark-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[0.65rem] font-semibold text-dark-text">Signature</span>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <span className="text-[0.6rem] text-dark-text2">Auto-generate</span>
                            <input type="checkbox" checked={sig.autoSignature !== false}
                              onChange={e => {
                                setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, autoSignature: e.target.checked } : s));
                                if (e.target.checked) setSigPreviews(prev => { const n = { ...prev }; delete n[i]; return n; });
                              }}
                              className="w-3.5 h-3.5 rounded border-dark-border accent-qsis" />
                          </label>
                        </div>
                        <div className="mb-2">
                          <label className="text-[0.6rem] text-dark-text2 mb-1 block">
                            Signature text <span className="text-dark-text2/60">(used when auto-generating; leave empty to sign the first word of the name)</span>
                          </label>
                          <input type="text" value={sig.signatureText || ''} onChange={e => {
                            setSignatories(prev => prev.map((s, idx) => idx === i ? { ...s, signatureText: e.target.value } : s));
                            setSigPreviews(prev => { const n = { ...prev }; delete n[i]; return n; });
                          }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis"
                            placeholder="Full name or short label" />
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <input ref={el => { sigFileRefs.current[i] = el; }} type="file" accept="image/png,image/jpeg,image/svg+xml"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleSigFileUpload(i, f); }}
                              className="w-full text-[0.6rem] text-dark-text2 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[0.6rem] file:font-semibold file:bg-qsis/10 file:text-qsis hover:file:bg-qsis/20 file:cursor-pointer" />
                          </div>
                          {sig.signatureUrl && (
                            <button onClick={() => removeSignature(i)} className="text-red-400 hover:text-red-300 text-[0.6rem]"><i className="fas fa-times mr-0.5"></i>Remove</button>
                          )}
                        </div>
                        <SignaturePreview sig={sig} index={i} getSigPreview={getSigPreview} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-users text-qsis mr-2"></i>Certificate Recipients</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <input ref={bulkFileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleBulkFile(f); }} />
                  <button onClick={() => bulkFileRef.current?.click()} disabled={importingFile}
                    className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition disabled:opacity-50">
                    {importingFile ? <><i className="fas fa-spinner fa-spin mr-1"></i>Reading...</> : <><i className="fas fa-file-import mr-1"></i>Import CSV / Excel</>}
                  </button>
                  <button onClick={downloadCsvTemplate}
                    className="px-3 py-1.5 bg-dark-bg3 text-dark-text2 border border-dark-border rounded-lg text-xs font-semibold hover:text-dark-text transition">
                    <i className="fas fa-download mr-1"></i>Template
                  </button>
                  <button onClick={addRow} className="text-qsis text-xs font-semibold hover:underline"><i className="fas fa-plus mr-1"></i>Add Row</button>
                </div>
              </div>
              <div className="mb-3 rounded-xl bg-dark-bg border border-dark-border p-3">
                <p className="text-[0.68rem] text-dark-text2">
                  <i className="fas fa-info-circle text-qsis mr-1"></i>
                  Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file. Columns: <code>memberName, universityId, department, session, post, servicePeriod, eventName, email</code>. Only name, ID and department are required — email is optional (used to send certificates).
                </p>
                {importMsg && <p className="text-[0.68rem] text-qsis mt-2"><i className="fas fa-check-circle mr-1"></i>{importMsg}</p>}
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
                        <input type="text" value={row.universityId} onChange={e => updateRow(i, 'universityId', e.target.value)} onBlur={e => updateRow(i, 'universityId', normalizeUniversityId(e.target.value))}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="Q233099" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Department *</label>
                        <input type="text" value={row.department} onChange={e => updateRow(i, 'department', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="CSE" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Post / Role *</label>
                        <input type="text" value={row.post} onChange={e => updateRow(i, 'post', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="General Secretary" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Service Period</label>
                        <input type="text" value={row.servicePeriod} onChange={e => updateRow(i, 'servicePeriod', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="2024-2025" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Session</label>
                        <input type="text" value={row.session} onChange={e => updateRow(i, 'session', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="2022-23" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Email (optional)</label>
                        <input type="email" value={row.email} onChange={e => updateRow(i, 'email', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis"
                          placeholder="student@example.com" />
                      </div>
                      <div>
                        <label className="text-[0.68rem] text-dark-text2 mb-1 block">Event Name (optional)</label>
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

            {/* Email certificates (Gmail API — no SMTP) */}
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-envelope text-qsis mr-2"></i>Email certificates</h3>
                {gmailStatus?.connected && (
                  <span className="text-[0.68rem] text-green-400 flex items-center gap-2">
                    <span><i className="fas fa-check-circle mr-1"></i>Connected as {gmailStatus.email}</span>
                    <button onClick={handleDisconnectGmail} className="text-dark-text2 hover:text-red-400 underline">Disconnect</button>
                  </span>
                )}
              </div>

              {gmailStatus === null ? (
                <p className="text-xs text-dark-text2"><i className="fas fa-spinner fa-spin mr-1"></i>Checking Gmail connection...</p>
              ) : gmailStatus.connected ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[0.68rem] text-dark-text2 mb-1 block">Subject</label>
                    <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis" />
                  </div>
                  <div>
                    <label className="text-[0.68rem] text-dark-text2 mb-1 block">
                      Message <span className="text-dark-text3">— supports {'{{name}}'}, {'{{certificateId}}'}, {'{{verifyUrl}}'}, {'{{universityId}}'}, {'{{clubName}}'}</span>
                    </label>
                    <textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={6}
                      className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-sm outline-none focus:border-qsis resize-y" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={handleSendEmails} disabled={sendingEmail || issued.length === 0}
                      className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-50">
                      {sendingEmail ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send to recipients</>}
                    </button>
                    <span className="text-[0.65rem] text-dark-text3">Emails are branded with the app name and link at the bottom.</span>
                  </div>
                  {emailResult && (
                    <div className={`rounded-xl border p-3 text-xs ${emailResult.summary?.failed > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-green-500/10 border-green-500/30 text-green-300'}`}>
                      <p className="font-semibold"><i className="fas fa-envelope-circle-check mr-1"></i>Sent {emailResult.summary?.sent || 0}, skipped {emailResult.summary?.skipped || 0}, failed {emailResult.summary?.failed || 0}</p>
                      {Array.isArray(emailResult.results) && emailResult.results.filter((r: any) => r.status !== 'sent').length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {emailResult.results.filter((r: any) => r.status !== 'sent').slice(0, 8).map((r: any, i: number) => (
                            <p key={i} className="text-[0.62rem] text-dark-text2">{r.email || r.certificateId}: {r.error || r.status}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-xs text-dark-text2 mb-3">
                    Connect your Gmail (or Google Workspace) account once. Emails are sent through the Gmail API — no SMTP setup needed.
                  </p>
                  <a href={`/api/email/gmail/connect?returnTo=${encodeURIComponent(`/clubs/${slug}/certificates/issue`)}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-lg text-sm font-bold hover:bg-gray-100 transition no-underline">
                    <i className="fab fa-google text-red-500"></i> Connect Gmail
                  </a>
                  {gmailStatus.configured === false && (
                    <p className="text-[0.65rem] text-amber-400 mt-2"><i className="fas fa-exclamation-triangle mr-1"></i>Gmail sending is not configured on this deployment yet (missing Google OAuth keys).</p>
                  )}
                </div>
              )}
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
                        {cert.email && <div className="col-span-2"><span className="text-dark-text2">Email:</span> <span className="text-dark-text">{cert.email}</span></div>}
                      </div>
                      <div className="mt-3 flex gap-2 flex-wrap">
                        <a href={`/clubs/preview/${cert.certificateId}`} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition no-underline">
                          <i className="fas fa-external-link-alt mr-1"></i>Verify
                        </a>
                        <button onClick={() => downloadCertPDF(toCertPDFData(cert))}
                          className="px-3 py-1.5 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                          <i className="fas fa-file-pdf mr-1"></i>PDF
                        </button>
                        <a href={`/clubs/preview/${cert.certificateId}`} target="_blank" rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-dark-bg3 text-dark-text border border-dark-border rounded-lg text-xs font-semibold hover:border-qsis transition no-underline">
                          <i className="fas fa-eye mr-1"></i>View
                        </a>
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

function SignaturePreview({ sig, index, getSigPreview }: { sig: CertSignatory; index: number; getSigPreview: (sig: CertSignatory, i: number) => Promise<string | null> }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSigPreview(sig, index).then(url => {
      if (!cancelled) { setPreviewUrl(url); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [sig.name, sig.signatureUrl, sig.autoSignature, index, getSigPreview]);

  if (sig.autoSignature === false && !sig.signatureUrl) return null;

  return (
    <div className="mt-2 p-2 bg-dark-bg2 rounded-lg border border-dark-border">
      <span className="text-[0.6rem] text-dark-text3 block mb-1">Preview</span>
      {loading ? (
        <div className="h-8 flex items-center"><i className="fas fa-spinner fa-spin text-dark-text3 text-xs"></i></div>
      ) : previewUrl ? (
        <img src={previewUrl} alt="Signature preview" className="h-8 object-contain" />
      ) : (
        <span className="text-[0.6rem] text-dark-text3 italic">No signature</span>
      )}
    </div>
  );
}

function ThemePreview({ theme, club }: { theme: CertTheme; club: any }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      try {
        const data: CertPDFData = {
          certificateId: 'IIUC-SAMPLE-0001',
          memberName: 'Md. Abdul Karim',
          universityId: 'Q233099',
          department: 'CSE',
          session: '2022-23',
          post: '',
          eventName: theme.category === 'event' ? 'Annual Programming Contest' : '',
          servicePeriod: '',
          clubName: club?.name || 'Student Club',
          clubLogoUrl: club?.logoUrl || undefined,
          iiucLogoUrl: '/iiuc-logo.png',
          issuedBy: club?.name || 'Student Club',
          issuedAt: new Date().toISOString(),
          signatories: [],
          theme,
        };
        const u = await exportCertificateImage(data, 'png', 560);
        if (!cancelled) setUrl(u);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    build();
    return () => { cancelled = true; };
  }, [theme.name, club?.logoUrl, club?.name, theme.category, theme.design?.text?.subtitle, theme.colors.primary[0], theme.colors.primary[1], theme.colors.primary[2]]);

  return (
    <div className="aspect-[1.414] bg-dark-bg flex items-center justify-center overflow-hidden">
      {failed ? (
        <span className="text-[0.6rem] text-dark-text3">Preview unavailable</span>
      ) : url ? (
        <img src={url} alt={theme.displayName} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <i className="fas fa-spinner fa-spin text-dark-text3 text-sm"></i>
      )}
    </div>
  );
}

function LogoPositionPicker({ label, value, onChange }: { label: string; value: CertLogoKey; onChange: (v: CertLogoKey) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-dark-text2">
      <span className="font-semibold whitespace-nowrap">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value as CertLogoKey)}
        className="flex-1 max-w-[200px] px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis">
        <option value="iiuc">IIUC University Logo</option>
        <option value="club">Club Logo</option>
      </select>
    </label>
  );
}
