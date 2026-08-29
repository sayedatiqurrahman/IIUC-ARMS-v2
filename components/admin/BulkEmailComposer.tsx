'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mergeEmailSettings, renderEmailHtml, emailPlainParts,
  type EmailSettings, type EmailTemplate,
} from '@/lib/email-theme';
import { copyRichHtml } from '@/lib/copy-html';

interface Recipient {
  email: string;
  name?: string;
}

interface BulkEmailComposerProps {
  senderEmail: string;
  senderName?: string;
  senderWhatsapp?: string;
  senderTelegram?: string;
  onClose: () => void;
}

const MAX_BCC = 500;

const PRESETS: { key: string; label: string; params?: string }[] = [
  { key: '', label: 'Choose a group…' },
  { key: 'all', label: 'All users', params: 'limit=5000' },
  { key: 'student', label: 'Students', params: 'domain=student&limit=5000' },
  { key: 'teacher', label: 'Teachers', params: 'domain=teacher&limit=5000' },
  { key: 'external', label: 'External accounts', params: 'domain=external&limit=5000' },
  { key: 'pending', label: 'Pending external accounts', params: 'domain=pending&limit=5000' },
  { key: 'admin', label: 'Admins', params: 'role=admin&limit=5000' },
  { key: 'manager', label: 'Managers', params: 'role=manager&limit=5000' },
];

function dedupe(recs: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recs.filter(r => {
    const k = r.email.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function BulkEmailComposer({ senderEmail, senderName, senderWhatsapp, senderTelegram, onClose }: BulkEmailComposerProps) {
  const [settings, setSettings] = useState<EmailSettings>(() => mergeEmailSettings(null));
  const [loaded, setLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [preset, setPreset] = useState('');
  const [presetLoading, setPresetLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Recipient[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [flashMsg, setFlashMsg] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let s = mergeEmailSettings(null);
      try {
        const res = await fetch('/api/email-settings');
        const data = await res.json();
        if (data.success) s = mergeEmailSettings(data.emailSettings);
      } catch {}
      const t = s.theme;
      if (!t.senderName && senderName) t.senderName = senderName;
      if (!t.whatsapp && senderWhatsapp) t.whatsapp = senderWhatsapp;
      if (!t.telegram && senderTelegram) t.telegram = senderTelegram;
      if (mounted) {
        const defaultKey = s.defaultTemplate || s.templates[0]?.key || '';
        const def = s.templates.find(x => x.key === 'announce') || s.templates.find(x => x.key === defaultKey) || s.templates[0];
        setSettings(s);
        setSelectedKey(def?.key || '');
        setSubject(def?.subject || '');
        setBody(def?.body || '');
        setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [senderName, senderWhatsapp, senderTelegram]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!search.trim()) { setResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search.trim())}&limit=25`);
        const data = await res.json();
        if (data.users) {
          setResults(data.users.map((u: any) => ({ email: u.email, name: u.name })));
          setShowResults(true);
        }
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const vars = useMemo(() => ({
    name: 'there',
    email: '',
    universityId: '',
    role: '',
    message,
    appName: settings.theme.appName,
    tagline: settings.theme.tagline,
    senderName: settings.theme.senderName || settings.theme.appName,
    senderEmail,
    whatsapp: settings.theme.whatsapp,
    telegram: settings.theme.telegram,
    supportEmail: settings.theme.supportEmail,
  }), [settings.theme, message, senderEmail]);

  const tpl: EmailTemplate = useMemo(() => ({ key: selectedKey, label: selectedKey, subject, body }), [selectedKey, subject, body]);

  const html = useMemo(() => renderEmailHtml(settings, tpl, {
    message, senderEmail,
    origin: typeof window !== 'undefined' ? window.location.origin : undefined,
  }), [settings, tpl, message, senderEmail]);

  const plain = useMemo(() => emailPlainParts(settings, tpl, { message, senderEmail }), [settings, tpl, message, senderEmail]);

  const needsMessage = body.includes('{{message}}');
  const tooMany = recipients.length > MAX_BCC;

  const loadPreset = async (key: string) => {
    setPreset(key);
    if (!key) return;
    const p = PRESETS.find(x => x.key === key);
    if (!p) return;
    setPresetLoading(true);
    try {
      const res = await fetch(`/api/admin/users?${p.params}`);
      const data = await res.json();
      if (data.users) {
        const recs = data.users.filter((u: any) => u.email).map((u: any) => ({ email: u.email, name: u.name }));
        setRecipients(prev => dedupe(recs.concat(prev)));
        setFlashMsg(`Added ${data.users.length} recipient(s) from "${p.label}".`);
        setTimeout(() => setFlashMsg(''), 5000);
      }
    } catch { setFlashMsg('Could not load that group.'); setTimeout(() => setFlashMsg(''), 4000); }
    setPresetLoading(false);
  };

  const addPasted = () => {
    const emails = pasteText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    setRecipients(prev => dedupe([...prev, ...emails.map(e => ({ email: e }))]));
    setFlashMsg(`Added ${emails.length} email(s) from paste (everyone goes in BCC).`);
    setTimeout(() => setFlashMsg(''), 5000);
    setPasteText('');
  };

  const removeRecipient = (email: string) => setRecipients(prev => prev.filter(r => r.email.toLowerCase() !== email.toLowerCase()));

  const openGmailBcc = () => {
    if (recipients.length === 0) { setFlashMsg('Add at least one recipient first.'); setTimeout(() => setFlashMsg(''), 4000); return; }
    const list = recipients.slice(0, MAX_BCC).map(r => r.email).join(',');
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=&bcc=${encodeURIComponent(list)}&su=${encodeURIComponent(plain.subject)}&body=${encodeURIComponent(plain.body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (recipients.length > MAX_BCC) {
      setFlashMsg(`Only the first ${MAX_BCC} recipients were added to this compose (Gmail limit). Remove some and send again for the rest.`);
      setTimeout(() => setFlashMsg(''), 7000);
    }
  };

  const copyBccText = async () => {
    const list = recipients.map(r => r.email).join(',');
    const text = `To: (BCC)\n${list}\n\nSubject: ${plain.subject}\n\n${plain.body}`;
    try { await navigator.clipboard.writeText(text); setFlashMsg('BCC list + message copied — paste the BCC box in Gmail compose.'); }
    catch { setFlashMsg('Could not copy.'); }
    setTimeout(() => setFlashMsg(''), 5000);
  };

  const copyHtml = async () => {
    const res = await copyRichHtml(html, plain.body);
    setFlashMsg(res === 'fail' ? 'Could not copy automatically — use the plain-text option instead.' : 'Formatted HTML email copied — paste into Gmail compose to keep the theme, logo & links.');
    setTimeout(() => setFlashMsg(''), 5000);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border sticky top-0 bg-dark-bg2 z-10">
          <div>
            <h3 className="text-[0.95rem] font-semibold text-dark-text flex items-center gap-2">
              <i className="fas fa-users text-qsis"></i> Bulk Email <span className="text-dark-text3 font-normal text-[0.8rem]">everyone goes in BCC</span>
            </h3>
            <p className="text-[0.65rem] text-dark-text3">One Gmail compose opens with all recipients blind-copied, so nobody sees the others' addresses. Uses your saved email theme & templates.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 hover:text-dark-text cursor-pointer"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: recipients + compose */}
          <div className="space-y-3">
            {!loaded ? (
              <div className="py-10 text-center"><i className="fas fa-spinner fa-spin text-qsis text-xl"></i></div>
            ) : (
              <>
                {/* Recipients */}
                <div className="bg-dark-bg border border-dark-border rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[0.72rem] text-dark-text2 block shrink-0">Add group:</label>
                    <select value={preset} onChange={e => loadPreset(e.target.value)} disabled={presetLoading} className="flex-1 px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] outline-none focus:border-qsis disabled:opacity-50">
                      {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="relative" ref={searchRef}>
                    <input
                      type="text" value={search} placeholder="Search a user to add individually..."
                      onChange={e => setSearch(e.target.value)} onFocus={() => { if (results.length) setShowResults(true); }}
                      className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] outline-none focus:border-qsis"
                    />
                    {showResults && results.length > 0 && (
                      <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-dark-bg2 border border-dark-border rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                        {searching && <div className="px-3 py-2 text-[0.7rem] text-dark-text3"><i className="fas fa-spinner fa-spin mr-1"></i>Searching...</div>}
                        {results.map(r => (
                          <button key={r.email} onMouseDown={e => { e.preventDefault(); setRecipients(prev => dedupe([...prev, r])); setSearch(''); setResults([]); setShowResults(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-qsis/10 text-dark-text flex items-center justify-between gap-2 border-none bg-transparent cursor-pointer border-b border-dark-border/30 last:border-0">
                            <span className="min-w-0 truncate text-[0.78rem]">{r.name || r.email}</span>
                            <span className="text-[0.65rem] text-dark-text3 truncate flex-1 text-right">{r.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showResults && search && results.length === 0 && !searching && (
                      <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-dark-bg2 border border-dark-border rounded-xl p-3 text-center text-[0.75rem] text-dark-text3">No users found</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={2} placeholder="Or paste emails here, separated by commas or new lines..." className="flex-1 px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis resize-none" />
                    <button onClick={addPasted} disabled={!pasteText.trim()} className="px-3 py-2 rounded-lg bg-qsis/15 text-qsis text-[0.72rem] font-semibold cursor-pointer hover:bg-qsis/25 border-none shrink-0 disabled:opacity-50"><i className="fas fa-plus"></i></button>
                  </div>
                  {recipients.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[0.7rem] text-dark-text2">Recipients ({recipients.length})</span>
                        <button onClick={() => setRecipients([])} className="text-[0.65rem] text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer">Clear all</button>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                        {recipients.map(r => (
                          <span key={r.email.toLowerCase()} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.68rem] text-dark-text">
                            <span className="max-w-[140px] truncate">{r.email}</span>
                            <span onClick={() => removeRecipient(r.email)} className="text-dark-text3 hover:text-red-400 cursor-pointer"><i className="fas fa-times text-[0.55rem]"></i></span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {tooMany && <p className="text-[0.68rem] text-amber-400"><i className="fas fa-exclamation-triangle mr-1"></i>Gmail allows up to {MAX_BCC} recipients per message. Extra recipients will be ignored — remove some or send in batches.</p>}
                </div>

                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Template</label>
                  <select value={selectedKey} onChange={e => {
                    const t = settings.templates.find(x => x.key === e.target.value);
                    setSelectedKey(e.target.value);
                    if (t) { setSubject(t.subject); setBody(t.body); }
                  }} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis">
                    {settings.templates.map(t => <option key={t.key} value={t.key}>{t.label}{settings.defaultTemplate === t.key ? ' (default)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Subject</label>
                  <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Body</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={9} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] outline-none focus:border-qsis font-mono resize-y" />
                </div>
                {needsMessage && (
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Custom message (for {'{{message}}'})</label>
                    <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Type the message..." className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                  </div>
                )}
                {flashMsg && <p className="text-[0.7rem] text-cyan-400"><i className="fas fa-info-circle mr-1"></i>{flashMsg}</p>}
                <div className="grid grid-cols-1 gap-2 pt-1">
                  <button onClick={openGmailBcc} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold cursor-pointer hover:bg-qsis/90 transition-colors">
                    <i className="fas fa-envelope-open-text"></i> Open Gmail compose (BCC {recipients.length > 0 ? recipients.length : ''})
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={copyHtml} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-qsis/15 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/25 transition-colors">
                      <i className="fas fa-copy"></i> Copy formatted
                    </button>
                    <button onClick={copyBccText} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.75rem] font-semibold cursor-pointer hover:bg-dark-bg3 transition-colors">
                      <i className="fas fa-align-left"></i> Copy plain text
                    </button>
                  </div>
                </div>
                <p className="text-[0.68rem] text-dark-text3">BCC means one email goes to everyone in the list but each recipient only sees their own address — perfect for announcements. No per-recipient names are inserted (everyone is on one email).</p>
              </>
            )}
          </div>

          {/* Right: preview */}
          <div>
            <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-eye mr-1"></i>Preview</label>
            <div className="rounded-xl overflow-hidden border border-dark-border bg-dark-bg">
              <iframe title="Bulk email preview" srcDoc={html} className="w-full h-[520px] bg-white" sandbox="" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}