'use client';

import { useState, useMemo } from 'react';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';
import type { CustomSelectOption } from '@/components/CustomSelect';

const ISSUE_TYPES = [
  'Account Access',
  'File Not Found',
  'Upload Problem',
  'Routine Issue',
  'Certificate Problem',
  'Club Related',
  'Technical Bug',
  'Feature Request',
  'Other',
];

const deptOptions: CustomSelectOption[] = FACULTIES.flatMap(f =>
  f.departments.map(d => ({
    value: d.shortName,
    label: d.name,
    group: f.shortName,
  }))
);

const issueOptions: CustomSelectOption[] = ISSUE_TYPES.map(t => ({
  value: t,
  label: t,
}));

export default function SupportPage() {
  const [form, setForm] = useState({
    name: '',
    universityId: '',
    department: '',
    gender: '' as '' | 'male' | 'female',
    issueType: '',
    issue: '',
    whatsapp: '',
    telegram: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.gender || !form.issue.trim()) return;

    setSubmitting(true);
    setResult(null);

    try {
      const fullIssue = form.issueType
        ? `[${form.issueType}] ${form.issue}`
        : form.issue;

      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          universityId: form.universityId.trim() || undefined,
          department: form.department || undefined,
          gender: form.gender,
          issue: fullIssue,
          whatsapp: form.whatsapp.trim() || undefined,
          telegram: form.telegram.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ ok: true, message: `Your request has been sent to ${data.groupName}. A team member will respond shortly.` });
        setForm({ name: '', universityId: '', department: '', gender: '', issueType: '', issue: '', whatsapp: '', telegram: '' });
      } else {
        setResult({ ok: false, message: data.error || 'Failed to submit' });
      }
    } catch {
      setResult({ ok: false, message: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = form.name.trim() && form.gender && form.issue.trim() && !submitting;

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-dark-text flex items-center gap-2">
          <i className="fas fa-headset text-qsis"></i>
          Support & Contact
        </h1>
        <p className="text-sm text-dark-text2 mt-1">
          Having issues? Fill out this form and our team will help you via Telegram.
        </p>
      </div>

      {result && (
        <div className={`mb-5 p-4 rounded-xl border text-sm ${result.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          <i className={`fas ${result.ok ? 'fa-check-circle' : 'fa-exclamation-circle'} mr-2`}></i>
          {result.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-2">Gender *</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => update('gender', 'male')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                form.gender === 'male'
                  ? 'bg-blue-500/15 border-blue-500/50 text-blue-400'
                  : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-dark-text2'
              }`}
            >
              <i className="fas fa-mars"></i> Male
            </button>
            <button
              type="button"
              onClick={() => update('gender', 'female')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition ${
                form.gender === 'female'
                  ? 'bg-pink-500/15 border-pink-500/50 text-pink-400'
                  : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-dark-text2'
              }`}
            >
              <i className="fas fa-venus"></i> Female
            </button>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1.5">Full Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder="Enter your full name"
            className="w-full px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm placeholder:text-dark-text2/50 focus:outline-none focus:border-qsis transition"
            required
          />
        </div>

        {/* University ID */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1.5">University ID</label>
          <input
            type="text"
            value={form.universityId}
            onChange={e => update('universityId', e.target.value)}
            placeholder="e.g. eb263013"
            className="w-full px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm placeholder:text-dark-text2/50 focus:outline-none focus:border-qsis transition"
          />
        </div>

        {/* Department — CustomSelect */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1.5">Department</label>
          <CustomSelect
            options={deptOptions}
            value={form.department}
            onChange={v => update('department', v)}
            placeholder="Select department"
            searchable
            showEmpty
            size="md"
          />
        </div>

        {/* Issue Type — CustomSelect */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1.5">Issue Type</label>
          <CustomSelect
            options={issueOptions}
            value={form.issueType}
            onChange={v => update('issueType', v)}
            placeholder="Select issue type"
            searchable
            showEmpty
            size="md"
          />
        </div>

        {/* Issue */}
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1.5">Issue Description *</label>
          <textarea
            value={form.issue}
            onChange={e => update('issue', e.target.value)}
            placeholder="Describe your issue in detail..."
            rows={4}
            className="w-full px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm placeholder:text-dark-text2/50 focus:outline-none focus:border-qsis transition resize-none"
            required
          />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1.5">WhatsApp</label>
            <input
              type="tel"
              value={form.whatsapp}
              onChange={e => update('whatsapp', e.target.value)}
              placeholder="+8801XXXXXXXXX"
              className="w-full px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm placeholder:text-dark-text2/50 focus:outline-none focus:border-qsis transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1.5">Telegram</label>
            <input
              type="text"
              value={form.telegram}
              onChange={e => update('telegram', e.target.value)}
              placeholder="@username or +880..."
              className="w-full px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-sm placeholder:text-dark-text2/50 focus:outline-none focus:border-qsis transition"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl bg-qsis hover:bg-qsis/90 text-white font-semibold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><i className="fas fa-spinner fa-spin"></i> Submitting...</>
          ) : (
            <><i className="fas fa-paper-plane"></i> Submit Support Request</>
          )}
        </button>
      </form>

      {/* Quick links */}
      <div className="mt-8 p-4 rounded-xl bg-dark-bg3 border border-dark-border">
        <p className="text-xs font-semibold text-dark-text2 mb-3 uppercase tracking-wider">Quick Links</p>
        <div className="space-y-2">
          <a href="https://t.me/iiuc_arms_chat" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-bg2 transition text-sm text-dark-text2 hover:text-dark-text no-underline">
            <i className="fab fa-telegram text-blue-400 w-5 text-center"></i>
            Telegram Group
          </a>
          <a href="https://t.me/iiuc_arms" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-bg2 transition text-sm text-dark-text2 hover:text-dark-text no-underline">
            <i className="fab fa-telegram-plane text-cyan-400 w-5 text-center"></i>
            Telegram Channel
          </a>
          <a href="https://chat.whatsapp.com/IIUC-ARMS" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-bg2 transition text-sm text-dark-text2 hover:text-dark-text no-underline">
            <i className="fab fa-whatsapp text-emerald-400 w-5 text-center"></i>
            WhatsApp Community
          </a>
        </div>
      </div>
    </div>
  );
}
