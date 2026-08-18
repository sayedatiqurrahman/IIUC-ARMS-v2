'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notice, NoticeCategory } from '@/lib/notices';
import { CATEGORY_META } from '@/lib/notices';
import NoticePublishModal, { type NoticePublishOptions } from '@/components/notices/NoticePublishModal';

export default function NoticesTab() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: 'notice' as NoticeCategory, date: '', pinned: false, link: '', attachmentUrl: '', attachmentName: '', ttlDays: 183 as number | null });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Publish modal state
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [pendingNotice, setPendingNotice] = useState<{ notice: any; action: string } | null>(null);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch('/api/notices');
      const data = await res.json();
      if (data.success) setNotices(data.notices);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', category: 'notice', date: new Date().toISOString().split('T')[0], pinned: false, link: '', attachmentUrl: '', attachmentName: '', ttlDays: 183 });
    setShowForm(true);
  };

  const openEdit = (n: Notice) => {
    setEditing(n);
    let ttlDays: number | null = 183;
    if (n.expiresAt) {
      const remaining = Math.ceil((new Date(n.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      ttlDays = remaining > 0 ? remaining : 0;
    } else {
      ttlDays = null;
    }
    setForm({ title: n.title, description: n.description, category: n.category, date: n.date, pinned: n.pinned, link: n.link || '', attachmentUrl: n.attachmentUrl || '', attachmentName: n.attachmentName || '', ttlDays });
    setShowForm(true);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', fileBase64: base64.split(',')[1], fileName: file.name }),
      });
      const data = await res.json();
      if (data.success) {
        setForm(f => ({ ...f, attachmentUrl: data.url, attachmentName: data.fileName }));
      }
    } catch {}
    setUploading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!showForm) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) { e.preventDefault(); uploadFile(file); break; }
      }
    }
  }, [showForm]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    if (editing) {
      // Edits save directly
      setSaving(true);
      try {
        const res = await fetch('/api/notices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', notice: { ...form, id: editing.id } }),
        });
        const data = await res.json();
        if (data.success) {
          setShowForm(false);
          fetchNotices();
        }
      } catch {}
      setSaving(false);
    } else {
      // New notices go through publish modal
      setPendingNotice({ notice: { ...form }, action: 'create' });
      setShowForm(false);
      setShowPublishModal(true);
    }
  };

  const handlePublishConfirm = async (options: NoticePublishOptions) => {
    if (!pendingNotice) return;
    setSaving(true);
    setShowPublishModal(false);
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: pendingNotice.action,
          notice: pendingNotice.notice,
          scheduledAt: options.scheduledAt,
          telegramTargets: options.telegramTargets,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchNotices();
      }
    } catch {}
    setSaving(false);
    setPendingNotice(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notice?')) return;
    try {
      await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      fetchNotices();
    } catch {}
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-dark-text">Notice Board</h2>
          <p className="text-[0.75rem] text-dark-text2">Manage notices, academic calendar, and bus schedules</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-xl bg-qsis text-white text-[0.8rem] font-semibold hover:brightness-110 transition cursor-pointer">
          <i className="fas fa-plus mr-1.5"></i>New Notice
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-dark-border bg-dark-bg2 p-4 animate-pulse">
              <div className="h-4 w-1/3 bg-dark-bg3 rounded mb-2"></div>
              <div className="h-3 w-2/3 bg-dark-bg3 rounded"></div>
            </div>
          ))}
        </div>
      ) : notices.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dark-border bg-dark-bg2">
          <i className="fas fa-bullhorn text-3xl text-dark-text3 mb-2"></i>
          <p className="text-dark-text2 text-[0.82rem]">No notices yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notices.map(n => {
            const meta = CATEGORY_META[n.category];
            return (
              <div key={n.id} className={`flex items-center gap-3 rounded-xl border bg-dark-bg2 px-4 py-3 ${n.pinned ? 'border-qsis/40' : 'border-dark-border'}`}>
                <span className={`w-9 h-9 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                  <i className={`${meta.icon} ${meta.color}`}></i>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.82rem] font-semibold text-dark-text truncate">{n.title}</span>
                    {n.pinned && <i className="fas fa-thumbtack text-qsis text-[0.6rem]"></i>}
                  </div>
                  <div className="flex items-center gap-3 text-[0.65rem] text-dark-text3 mt-0.5">
                    <span>{formatDate(n.date)}</span>
                    <span className={`${meta.color}`}>{meta.label}</span>
                    {n.link && <span className="text-qsis"><i className="fas fa-link mr-0.5"></i>Has link</span>}
                    {n.attachmentUrl && <span className="text-qsis"><i className="fas fa-paperclip mr-0.5"></i>Attachment</span>}
                    {n.expiresAt && <span className="text-amber-400/60"><i className="fas fa-clock mr-0.5"></i>Expires {new Date(n.expiresAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(n)} className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis cursor-pointer border-none"><i className="fas fa-edit text-[0.7rem]"></i></button>
                  <button onClick={() => handleDelete(n.id)} className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-red-400 cursor-pointer border-none"><i className="fas fa-trash text-[0.7rem]"></i></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-dark-border bg-dark-bg2 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-dark-text">{editing ? 'Edit Notice' : 'New Notice'}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer"><i className="fas fa-times text-sm"></i></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Category</label>
                <div className="flex gap-2">
                  {(['notice', 'academic-calendar', 'bus-schedule'] as NoticeCategory[]).map(cat => {
                    const m = CATEGORY_META[cat];
                    return (
                      <button key={cat} type="button" onClick={() => setForm(f => ({ ...f, category: cat }))}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${form.category === cat ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                        <i className={m.icon}></i>{m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" placeholder="Notice title" />
              </div>
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4}
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none resize-none" placeholder="Details (optional)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border cursor-pointer hover:border-qsis/40 transition">
                    <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} className="accent-qsis" />
                    <i className="fas fa-thumbtack text-qsis text-[0.75rem]"></i>
                    <span className="text-[0.78rem] text-dark-text2">Pin to top</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Auto-delete after</label>
                <select value={form.ttlDays === null ? 'never' : String(form.ttlDays)}
                  onChange={e => setForm(f => ({ ...f, ttlDays: e.target.value === 'never' ? null : Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none">
                  <option value="30">30 days</option>
                  <option value="90">3 months</option>
                  <option value="183">6 months (default)</option>
                  <option value="365">1 year</option>
                  <option value="never">Never delete</option>
                </select>
              </div>
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Link (optional)</label>
                <input value={form.link} onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" placeholder="https://..." />
              </div>
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Attachment (optional)</label>
                <div
                  ref={dropRef}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                  onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation(); setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) uploadFile(file);
                  }}
                  className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all ${dragOver ? 'border-qsis bg-qsis/10' : 'border-dark-border hover:border-qsis/40 bg-dark-bg3'}`}
                  onClick={() => dropRef.current?.querySelector('input')?.click()}
                >
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={handleFileUpload} className="hidden" />
                  <i className={`fas ${dragOver ? 'fa-cloud-upload-alt text-qsis' : 'fa-paperclip text-dark-text3'} text-lg mb-1 block`}></i>
                  <p className="text-[0.75rem] text-dark-text2 font-medium">{dragOver ? 'Drop file here' : 'Click, drag & drop, or paste (Ctrl+V)'}</p>
                  <p className="text-[0.65rem] text-dark-text3 mt-0.5">PDF, Image, or Document</p>
                </div>
                {uploading && <p className="text-[0.72rem] text-dark-text3 mt-1"><i className="fas fa-spinner fa-spin mr-1"></i>Uploading to GitHub...</p>}
                {form.attachmentUrl && (
                  <p className="text-[0.72rem] text-green-400 mt-1"><i className="fas fa-check mr-1"></i>Attached: {form.attachmentName}</p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} disabled={saving || !form.title.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.85rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50">
                  {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : editing ? 'Update' : 'Continue to Publish'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.85rem] cursor-pointer">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Modal */}
      {showPublishModal && (
        <NoticePublishModal
          onPublish={handlePublishConfirm}
          onClose={() => { setShowPublishModal(false); setPendingNotice(null); }}
        />
      )}
    </div>
  );
}
