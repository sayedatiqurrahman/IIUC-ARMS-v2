'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_EMAIL_SETTINGS, mergeEmailSettings,
  EMAIL_PLACEHOLDERS, renderEmailHtml,
  type EmailSettings, type EmailTheme, type EmailTemplate,
} from '@/lib/email-theme';

interface EmailSettingsTabProps {
  email: string;
  profileName?: string;
  profileWhatsapp?: string;
  profileTelegram?: string;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[0.72rem] text-dark-text2 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-[0.62rem] text-dark-text3 mt-0.5">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
    />
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[0.72rem] text-dark-text2 block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} onChange={e => onChange(e.target.value)} className="w-9 h-9 rounded-lg bg-dark-bg cursor-pointer border border-dark-border p-0" />
        <TextInput value={value} onChange={onChange} placeholder="#22c55e" />
      </div>
    </div>
  );
}

export default function EmailSettingsTab({ email, profileName, profileWhatsapp, profileTelegram }: EmailSettingsTabProps) {
  const [settings, setSettings] = useState<EmailSettings>(() => mergeEmailSettings(null));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>(DEFAULT_EMAIL_SETTINGS.defaultTemplate);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const flash = (msg: string, type: 'ok' | 'err') => {
    if (type === 'ok') { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 2500); }
    else { setError(msg); setSuccess(''); setTimeout(() => setError(''), 3500); }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/email-settings');
        const data = await res.json();
        if (data.success) {
          const s = mergeEmailSettings(data.emailSettings);
          const t = s.theme;
          if (!t.senderName && profileName) t.senderName = profileName;
          if (!t.whatsapp && profileWhatsapp) t.whatsapp = profileWhatsapp;
          if (!t.telegram && profileTelegram) t.telegram = profileTelegram;
          setSettings(s);
          setSelectedKey(s.defaultTemplate || s.templates[0]?.key || '');
        }
      } catch {}
      setLoaded(true);
    })();
  }, [profileName, profileWhatsapp, profileTelegram]);

  const selected = useMemo(() => settings.templates.find(t => t.key === selectedKey) || settings.templates[0], [settings.templates, selectedKey]);

  const setTheme = (patch: Partial<EmailTheme>) => setSettings(p => ({ ...p, theme: { ...p.theme, ...patch } }));

  const preview = useMemo(() => {
    if (!selected) return '';
    return renderEmailHtml(settings, selected, {
      name: 'User Name', email: 'user@gmail.com', universityId: 'C-2023-001',
      role: 'student', message: 'This is a sample message.',
      senderEmail: email, origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  }, [settings, selected, email]);

  const updateTemplate = (patch: Partial<EmailTemplate>) => {
    if (!selected) return;
    setSettings(p => ({
      ...p,
      templates: p.templates.map(t => (t.key === selected.key ? { ...t, ...patch } : t)),
    }));
  };

  const insertPlaceholder = (token: string) => {
    if (!selected) return;
    const body = bodyRef.current;
    setSettings(p => ({
      ...p,
      templates: p.templates.map(t => {
        if (t.key !== selected.key) return t;
        if (!body) return { ...t, body: t.body ? t.body + token : token };
        const start = body.selectionStart ?? t.body.length;
        const end = body.selectionEnd ?? t.body.length;
        return { ...t, body: t.body.slice(0, start) + token + t.body.slice(end) };
      }),
    }));
  };

  const addTemplate = () => {
    const key = `custom-${Date.now()}`;
    setSettings(p => ({
      ...p,
      templates: [...p.templates, { key, label: 'New Template', subject: 'Subject from {{appName}}', body: 'Hi {{name}},\n\n{{message}}\n\nThanks,\n{{senderName}}' }],
    }));
    setSelectedKey(key);
  };

  const deleteTemplate = (key: string) => {
    const remaining = settings.templates.filter(t => t.key !== key);
    if (remaining.length === 0) return;
    setSettings(p => ({
      ...p,
      templates: remaining,
      defaultTemplate: p.defaultTemplate === key ? (remaining[0]?.key || '') : p.defaultTemplate,
    }));
    if (selectedKey === key) setSelectedKey(remaining[0]?.key || '');
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/email-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailSettings: settings }),
      });
      const data = await res.json();
      if (data.success) {
        setSettings(mergeEmailSettings(data.emailSettings));
        flash('Email theme & templates saved — this applies to every admin.', 'ok');
      } else flash(data.error || 'Failed to save', 'err');
    } catch { flash('Network error', 'err'); }
    setSaving(false);
  };

  const reset = () => {
    setSettings(mergeEmailSettings(null));
    setSelectedKey(DEFAULT_EMAIL_SETTINGS.defaultTemplate);
  };

  if (!loaded) {
    return <div className="text-center py-10"><i className="fas fa-spinner fa-spin text-2xl text-qsis"></i></div>;
  }

  return (
    <div className="space-y-5">
      {success && <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs"><i className="fas fa-check mr-1"></i>{success}</div>}
      {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"><i className="fas fa-exclamation-triangle mr-1"></i>{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT: editors */}
        <div className="space-y-5">
          {/* Theme */}
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
            <h3 className="text-[0.85rem] font-semibold text-dark-text mb-3"><i className="fas fa-palette text-qsis mr-1.5"></i>Email Theme</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="App Name"><TextInput value={settings.theme.appName} onChange={v => setTheme({ appName: v })} /></Field>
              <Field label="Tagline"><TextInput value={settings.theme.tagline} onChange={v => setTheme({ tagline: v })} /></Field>
              <div className="sm:col-span-2">
                <Field label="Logo URL" hint="Path on this site (e.g. /arms-logo-icon.png) or a full URL">
                  <TextInput value={settings.theme.logoUrl} onChange={v => setTheme({ logoUrl: v })} />
                </Field>
              </div>
              <ColorField label="Primary (accent)" value={settings.theme.primaryColor} onChange={v => setTheme({ primaryColor: v })} />
              <ColorField label="Header background" value={settings.theme.headerBg} onChange={v => setTheme({ headerBg: v })} />
              <ColorField label="Body background" value={settings.theme.bodyBg} onChange={v => setTheme({ bodyBg: v })} />
              <ColorField label="Card background" value={settings.theme.cardBg} onChange={v => setTheme({ cardBg: v })} />
              <ColorField label="Text color" value={settings.theme.textColor} onChange={v => setTheme({ textColor: v })} />
              <ColorField label="Muted text color" value={settings.theme.mutedColor} onChange={v => setTheme({ mutedColor: v })} />
            </div>
          </div>

          {/* Sender */}
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
            <h3 className="text-[0.85rem] font-semibold text-dark-text mb-3"><i className="fas fa-user-tie text-qsis mr-1.5"></i>Sender & Contact</h3>
            <p className="text-[0.68rem] text-dark-text3 mb-3">Shown in the email footer so recipients can reach you. Leave empty to hide a contact.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Sender Name" hint="Falls back to the app name"><TextInput value={settings.theme.senderName} onChange={v => setTheme({ senderName: v })} placeholder="Your name / team" /></Field>
              <Field label="WhatsApp Number" hint="e.g. +8801XXXXXXXXX"><TextInput value={settings.theme.whatsapp} onChange={v => setTheme({ whatsapp: v })} placeholder="+8801XXXXXXXXX" /></Field>
              <Field label="Telegram Username" hint="e.g. @qsis_help"><TextInput value={settings.theme.telegram} onChange={v => setTheme({ telegram: v })} placeholder="@username" /></Field>
              <Field label="Support Email"><TextInput value={settings.theme.supportEmail} onChange={v => setTheme({ supportEmail: v })} placeholder="support@domain.com" /></Field>
              <div className="sm:col-span-2">
                <Field label="Footer Text"><TextInput value={settings.theme.footerText} onChange={v => setTheme({ footerText: v })} /></Field>
              </div>
            </div>
          </div>

          {/* Templates */}
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[0.85rem] font-semibold text-dark-text"><i className="fas fa-envelope-open-text text-qsis mr-1.5"></i>Email Text (Templates)</h3>
              <button onClick={addTemplate} className="px-2.5 py-1.5 rounded-lg bg-qsis/15 text-qsis text-[0.7rem] font-semibold cursor-pointer hover:bg-qsis/25 border-none"><i className="fas fa-plus mr-1"></i>New</button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {settings.templates.map(t => (
                <button
                  key={t.key}
                  onClick={() => setSelectedKey(t.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.68rem] font-medium border cursor-pointer transition-all ${
                    selectedKey === t.key ? 'bg-qsis/15 border-qsis/40 text-qsis' : 'bg-dark-bg border-dark-border text-dark-text2 hover:border-dark-text3'
                  }`}
                >
                  {settings.defaultTemplate === t.key && <i className="fas fa-star text-[0.55rem] text-amber-400" title="Default template"></i>}
                  {t.label}
                  <span className="text-[0.55rem] opacity-60">{settings.defaultTemplate === t.key ? 'default' : ''}</span>
                  {settings.templates.length > 1 && (
                    <span
                      onClick={e => { e.stopPropagation(); deleteTemplate(t.key); }}
                      className="ml-0.5 text-dark-text3 hover:text-red-400 cursor-pointer"
                      title="Delete template"
                    >
                      <i className="fas fa-times text-[0.55rem]"></i>
                    </span>
                  )}
                </button>
              ))}
            </div>
            {selected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Field label="Template name" ><TextInput value={selected.label} onChange={v => updateTemplate({ label: v })} /></Field>
                  {settings.defaultTemplate !== selected.key ? (
                    <button
                      onClick={() => setSettings(p => ({ ...p, defaultTemplate: selected.key }))}
                      className="mt-5 px-2.5 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-[0.7rem] font-semibold cursor-pointer hover:bg-amber-500/25 border-none shrink-0"
                    >
                      <i className="fas fa-star mr-1"></i>Make default
                    </button>
                  ) : (
                    <span className="mt-5 px-2.5 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-[0.7rem] font-semibold shrink-0 border border-amber-500/20">
                      <i className="fas fa-star mr-1"></i>Default
                    </span>
                  )}
                </div>
                <Field label="Subject">
                  <TextInput value={selected.subject} onChange={v => updateTemplate({ subject: v })} />
                </Field>
                <Field label="Body" hint="Placeholders below are replaced when sending. Blank lines make new paragraphs.">
                  <textarea
                    ref={bodyRef}
                    value={selected.body}
                    onChange={e => updateTemplate({ body: e.target.value })}
                    rows={10}
                    className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis font-mono resize-y"
                  />
                </Field>
                <div className="flex flex-wrap gap-1">
                  {EMAIL_PLACEHOLDERS.map(ph => (
                    <button
                      key={ph.token}
                      onClick={() => insertPlaceholder(ph.token)}
                      className="px-2 py-1 rounded-md bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.62rem] font-mono cursor-pointer hover:border-qsis/50 hover:text-qsis transition-colors"
                      title={ph.label}
                    >
                      {ph.token}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: preview */}
        <div className="space-y-3">
          <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[0.85rem] font-semibold text-dark-text"><i className="fas fa-eye text-qsis mr-1.5"></i>Live Preview</h3>
              <span className="text-[0.62rem] text-dark-text3">Sample recipient shown</span>
            </div>
            <div className="rounded-xl overflow-hidden border border-dark-border bg-dark-bg">
              <iframe title="Email preview" srcDoc={preview} className="w-full h-[560px] bg-white" sandbox="" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={reset} className="px-4 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] cursor-pointer hover:bg-dark-bg3 transition-colors">
              <i className="fas fa-undo mr-1"></i>Reset to defaults
            </button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold cursor-pointer hover:bg-qsis/90 transition-colors disabled:opacity-50">
              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-save mr-1"></i>Save changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}