'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mergeEmailSettings, renderEmailHtml, emailPlainParts,
  type EmailSettings, type EmailTemplate,
} from '@/lib/email-theme';
import { copyRichHtml } from '@/lib/copy-html';
import { type UserRecord } from './types';

interface EmailComposerProps {
  user: UserRecord;
  senderEmail: string;
  senderName?: string;
  senderWhatsapp?: string;
  senderTelegram?: string;
  onClose: () => void;
}

export default function EmailComposer({ user, senderEmail, senderName, senderWhatsapp, senderTelegram, onClose }: EmailComposerProps) {
  const [settings, setSettings] = useState<EmailSettings>(() => mergeEmailSettings(null));
  const [loaded, setLoaded] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState('');
  const [flashMsg, setFlashMsg] = useState('');

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
        const def = s.templates.find(x => x.key === s.defaultTemplate) || s.templates[0];
        setSettings(s);
        setSelectedKey(def?.key || '');
        setSubject(def?.subject || '');
        setBody(def?.body || '');
        setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [senderName, senderWhatsapp, senderTelegram]);

  const vars = useMemo(() => ({
    name: user.name || user.email.split('@')[0],
    email: user.email,
    universityId: user.universityId || '',
    role: user.role || '',
    message,
    appName: settings.theme.appName,
    tagline: settings.theme.tagline,
    senderName: settings.theme.senderName || settings.theme.appName,
    senderEmail,
    whatsapp: settings.theme.whatsapp,
    telegram: settings.theme.telegram,
    supportEmail: settings.theme.supportEmail,
  }), [settings.theme, user, message, senderEmail]);

  const tpl: EmailTemplate = useMemo(() => ({
    key: selectedKey,
    label: selectedKey,
    subject,
    body,
  }), [selectedKey, subject, body]);

  const html = useMemo(() => renderEmailHtml(settings, tpl, {
    name: user.name || undefined,
    email: user.email,
    universityId: user.universityId || undefined,
    role: user.role || undefined,
    message,
    senderEmail,
    origin: typeof window !== 'undefined' ? window.location.origin : undefined,
  }), [settings, tpl, user, message, senderEmail]);

  const needsMessage = useMemo(() => body.includes('{{message}}'), [body]);

  const plain = useMemo(() => emailPlainParts(settings, tpl, {
    name: user.name || undefined,
    email: user.email,
    universityId: user.universityId || undefined,
    role: user.role || undefined,
    message,
    senderEmail,
  }), [settings, tpl, user, message, senderEmail]);

  const openGmail = () => {
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(user.email)}&su=${encodeURIComponent(plain.subject)}&body=${encodeURIComponent(plain.body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyHtml = async () => {
    const res = await copyRichHtml(html, plain.body);
    setFlashMsg(res === 'fail' ? 'Could not copy automatically — use "Copy plain text" instead.' : 'Formatted HTML email copied — open Gmail compose and paste (Ctrl+V) to keep the theme, logo & links.');
    setTimeout(() => setFlashMsg(''), 5000);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(`${plain.subject}\n\n${plain.body}`);
      setFlashMsg('Plain-text email copied to clipboard.');
    } catch {
      setFlashMsg('Could not copy to clipboard.');
    }
    setTimeout(() => setFlashMsg(''), 5000);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border sticky top-0 bg-dark-bg2 z-10">
          <div className="min-w-0">
            <h3 className="text-[0.95rem] font-semibold text-dark-text flex items-center gap-2">
              <i className="fas fa-envelope text-qsis"></i> Email
              <span className="text-dark-text3 font-normal text-[0.8rem] truncate">{user.name || user.email.split('@')[0]} — {user.email}</span>
            </h3>
            <p className="text-[0.65rem] text-dark-text3">Uses your saved email theme & templates (Admin → Email).</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 hover:text-dark-text cursor-pointer"><i className="fas fa-times"></i></button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: compose */}
          <div className="space-y-3">
            {!loaded ? (
              <div className="py-10 text-center"><i className="fas fa-spinner fa-spin text-qsis text-xl"></i></div>
            ) : (
              <>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Template</label>
                  <select
                    value={selectedKey}
                    onChange={e => {
                      const t = settings.templates.find(x => x.key === e.target.value);
                      setSelectedKey(e.target.value);
                      if (t) { setSubject(t.subject); setBody(t.body); }
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
                  >
                    {settings.templates.map(t => (
                      <option key={t.key} value={t.key}>{t.label}{settings.defaultTemplate === t.key ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">To</label>
                  <input type="text" value={user.email} readOnly className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.82rem] outline-none" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Subject</label>
                  <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                </div>
                <div>
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Body</label>
                  <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] outline-none focus:border-qsis font-mono resize-y" />
                </div>
                {needsMessage && (
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Custom message (for {'{{message}}'})</label>
                    <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder="Type the message..." className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
                  </div>
                )}
                {flashMsg && <p className="text-[0.7rem] text-cyan-400"><i className="fas fa-info-circle mr-1"></i>{flashMsg}</p>}
                <div className="grid grid-cols-1 gap-2 pt-1">
                  <button onClick={openGmail} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold cursor-pointer hover:bg-qsis/90 transition-colors">
                    <i className="fas fa-envelope"></i> Open in Gmail compose
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={copyHtml} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-qsis/15 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/25 transition-colors" title="Copies the themed HTML so Gmail keeps the logo & colors when you paste">
                      <i className="fas fa-copy"></i> Copy formatted
                    </button>
                    <button onClick={copyText} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.75rem] font-semibold cursor-pointer hover:bg-dark-bg3 transition-colors">
                      <i className="fas fa-align-left"></i> Copy plain text
                    </button>
                  </div>
                </div>
                <p className="text-[0.68rem] text-dark-text3">Tip: after <b>Copy formatted</b>, open Gmail compose and paste — the theme, logo and colors are preserved.</p>
              </>
            )}
          </div>

          {/* Right: preview */}
          <div>
            <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-eye mr-1"></i>Preview (as the recipient sees it)</label>
            <div className="rounded-xl overflow-hidden border border-dark-border bg-dark-bg">
              <iframe title="Email preview" srcDoc={html} className="w-full h-[520px] bg-white" sandbox="" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}