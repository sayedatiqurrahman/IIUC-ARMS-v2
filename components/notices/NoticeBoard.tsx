'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { config } from '@/lib/config';
import type { Notice, NoticeCategory } from '@/lib/notices';
import { CATEGORY_META } from '@/lib/notices';

const CATEGORIES: { key: NoticeCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'fas fa-layer-group' },
  { key: 'notice', label: 'Notices', icon: 'fas fa-bullhorn' },
  { key: 'academic-calendar', label: 'Academic Calendar', icon: 'fas fa-calendar-days' },
  { key: 'bus-schedule', label: 'Bus Schedule', icon: 'fas fa-bus' },
];

export default function NoticeBoardView() {
  const { data: session } = useSession();
  const email = session?.user?.email || '';
  const userRole = email ? config.detectRole(email) : null;
  const isPrivileged = userRole === 'admin' || userRole === 'teacher' || userRole === 'manager';

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NoticeCategory | 'all'>('all');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [search, setSearch] = useState('');
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  // Create/Edit state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: 'notice' as NoticeCategory, date: '', pinned: false, link: '', ttlDays: 183 as number | null });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch('/api/notices');
      const data = await res.json();
      if (data.success) setNotices(data.notices);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotices(); }, [fetchNotices]);

  const filtered = notices
    .filter(n => filter === 'all' || n.category === filter)
    .filter(n => {
      if (!search) return true;
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', category: 'notice', date: new Date().toISOString().split('T')[0], pinned: false, link: '', ttlDays: 183 });
    setShowForm(true);
  };

  const openEdit = (n: Notice) => {
    setEditing(n);
    // Compute remaining TTL days from expiresAt
    let ttlDays: number | null = 183;
    if (n.expiresAt) {
      const remaining = Math.ceil((new Date(n.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      ttlDays = remaining > 0 ? remaining : 0;
    } else {
      ttlDays = null; // never expires
    }
    setForm({ title: n.title, description: n.description, category: n.category, date: n.date, pinned: n.pinned, link: n.link || '', ttlDays });
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
    setSaving(true);
    try {
      const action = editing ? 'update' : 'create';
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notice: { ...form, id: editing?.id, attachmentUrl: (form as any).attachmentUrl, attachmentName: (form as any).attachmentName },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        fetchNotices();
      }
    } catch {}
    setSaving(false);
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
    <div className="min-h-[80vh] max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-dark-text flex items-center gap-2">
            <i className="fas fa-bullhorn text-qsis"></i> Notice Board
          </h1>
          <p className="text-[0.78rem] text-dark-text2 mt-0.5">Academic notices, calendar updates, and bus schedules</p>
        </div>
        {isPrivileged && (
          <button onClick={openCreate} className="px-4 py-2 rounded-xl bg-qsis text-white text-[0.8rem] font-semibold hover:brightness-110 transition cursor-pointer">
            <i className="fas fa-plus mr-1.5"></i>New Notice
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border cursor-pointer transition ${filter === c.key ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg2 border-dark-border text-dark-text2 hover:text-dark-text'}`}>
              <i className={`${c.icon} mr-1`}></i>{c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="px-3 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-[0.78rem] text-dark-text w-40 focus:border-qsis outline-none" />
          <button onClick={() => setViewMode(v => v === 'card' ? 'list' : 'card')}
            className="w-8 h-8 rounded-lg bg-dark-bg2 border border-dark-border flex items-center justify-center text-dark-text2 hover:text-dark-text cursor-pointer">
            <i className={`fas ${viewMode === 'card' ? 'fa-list' : 'fa-th-large'} text-sm`}></i>
          </button>
        </div>
      </div>

      {/* Notices */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl border border-dark-border bg-dark-bg2 p-5 animate-pulse">
              <div className="h-4 w-1/3 bg-dark-bg3 rounded mb-3"></div>
              <div className="h-5 w-2/3 bg-dark-bg3 rounded mb-2"></div>
              <div className="h-3 w-full bg-dark-bg3 rounded"></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <i className="fas fa-bullhorn text-4xl text-dark-text3 mb-3"></i>
          <p className="text-dark-text2 text-[0.85rem]">No notices found</p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(n => {
            const meta = CATEGORY_META[n.category];
            return (
              <div key={n.id} className={`rounded-2xl border bg-dark-bg2 p-5 transition-all hover:border-qsis/30 ${n.pinned ? 'border-qsis/40 ring-1 ring-qsis/10' : 'border-dark-border'}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[0.65rem] font-medium ${meta.bg} ${meta.color}`}>
                      <i className={`${meta.icon} mr-1`}></i>{meta.label}
                    </span>
                    {n.pinned && <i className="fas fa-thumbtack text-qsis text-[0.7rem]"></i>}
                  </div>
                  {isPrivileged && (
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(n)} className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis cursor-pointer border-none"><i className="fas fa-edit text-[0.65rem]"></i></button>
                      <button onClick={() => handleDelete(n.id)} className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-red-400 cursor-pointer border-none"><i className="fas fa-trash text-[0.65rem]"></i></button>
                    </div>
                  )}
                </div>
                <h3 className="text-[0.9rem] font-bold text-dark-text mb-1.5 leading-snug cursor-pointer hover:text-qsis transition" onClick={() => setSelectedNotice(n)}>{n.title}</h3>
                {n.description && <p className="text-[0.78rem] text-dark-text2 leading-relaxed mb-3 whitespace-pre-line">{n.description}</p>}
                {n.link && (
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[0.75rem] text-qsis hover:underline mb-3">
                    <i className="fas fa-link"></i>{n.link}
                  </a>
                )}
                {n.attachmentUrl && (() => {
                  const ext = (n.attachmentName || n.attachmentUrl).split('.').pop()?.toLowerCase() || '';
                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                  const isPdf = ext === 'pdf';
                  return (
                    <div className="mb-3">
                      {isImage ? (
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-dark-border hover:border-qsis/40 transition">
                          <img src={n.attachmentUrl} alt={n.attachmentName || 'Attachment'} className="w-full max-h-48 object-cover" loading="lazy" />
                        </a>
                      ) : isPdf ? (
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 transition">
                          <i className="fas fa-file-pdf text-red-400 text-lg"></i>
                          <div className="min-w-0">
                            <p className="text-[0.75rem] font-medium text-dark-text truncate">{n.attachmentName || 'PDF Attachment'}</p>
                            <p className="text-[0.65rem] text-dark-text3">Click to open PDF</p>
                          </div>
                          <i className="fas fa-external-link-alt text-dark-text3 text-[0.65rem] ml-auto"></i>
                        </a>
                      ) : (
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition">
                          <i className="fas fa-file text-dark-text3 text-lg"></i>
                          <div className="min-w-0">
                            <p className="text-[0.75rem] font-medium text-dark-text truncate">{n.attachmentName || 'Attachment'}</p>
                            <p className="text-[0.65rem] text-dark-text3">Click to download</p>
                          </div>
                          <i className="fas fa-download text-dark-text3 text-[0.65rem] ml-auto"></i>
                        </a>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between text-[0.65rem] text-dark-text3 mt-auto pt-2 border-t border-dark-border">
                  <span>{formatDate(n.date)}</span>
                  <div className="flex items-center gap-2">
                    {n.expiresAt && (
                      <span className="text-amber-400/60" title={`Auto-deletes ${formatDate(n.expiresAt)}`}>
                        <i className="fas fa-clock mr-0.5"></i>{formatDate(n.expiresAt)}
                      </span>
                    )}
                    <span>by {n.publishedByName || n.publishedBy}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const meta = CATEGORY_META[n.category];
            return (
              <div key={n.id} className={`rounded-xl border bg-dark-bg2 transition-all hover:border-qsis/30 ${n.pinned ? 'border-qsis/40' : 'border-dark-border'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                  <i className={`${meta.icon} ${meta.color} text-sm`}></i>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[0.82rem] font-semibold text-dark-text truncate cursor-pointer hover:text-qsis transition" onClick={() => setSelectedNotice(n)}>{n.title}</h3>
                    {n.pinned && <i className="fas fa-thumbtack text-qsis text-[0.6rem]"></i>}
                  </div>
                  <div className="flex items-center gap-3 text-[0.65rem] text-dark-text3 mt-0.5">
                    <span>{formatDate(n.date)}</span>
                    <span>{n.publishedByName || n.publishedBy}</span>
                    {n.link && <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline"><i className="fas fa-link mr-0.5"></i>Link</a>}
                    {n.attachmentUrl && (() => {
                      const ext = (n.attachmentName || n.attachmentUrl).split('.').pop()?.toLowerCase() || '';
                      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                      return isImage ? (
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline"><i className="fas fa-image mr-0.5"></i>Image</a>
                      ) : ext === 'pdf' ? (
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline"><i className="fas fa-file-pdf mr-0.5"></i>PDF</a>
                      ) : (
                        <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline"><i className="fas fa-paperclip mr-0.5"></i>Attachment</a>
                      );
                    })()}
                  </div>
                </div>
                {isPrivileged && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(n)} className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis cursor-pointer border-none"><i className="fas fa-edit text-[0.65rem]"></i></button>
                    <button onClick={() => handleDelete(n.id)} className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-red-400 cursor-pointer border-none"><i className="fas fa-trash text-[0.65rem]"></i></button>
                  </div>
                )}
              </div>
              {n.attachmentUrl && (() => {
                const ext = (n.attachmentName || n.attachmentUrl).split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                const isPdf = ext === 'pdf';
                return isImage ? (
                  <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block border-t border-dark-border">
                    <img src={n.attachmentUrl} alt={n.attachmentName || 'Attachment'} className="w-full max-h-32 object-cover" loading="lazy" />
                  </a>
                ) : isPdf ? (
                  <a href={n.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 border-t border-dark-border bg-red-500/5 hover:bg-red-500/10 transition">
                    <i className="fas fa-file-pdf text-red-400"></i>
                    <span className="text-[0.72rem] text-dark-text truncate">{n.attachmentName || 'PDF'}</span>
                    <i className="fas fa-external-link-alt text-dark-text3 text-[0.6rem] ml-auto"></i>
                  </a>
                ) : null;
              })()}
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
                  {(CATEGORIES.filter(c => c.key !== 'all')).map(c => (
                    <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, category: c.key as NoticeCategory }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${form.category === c.key ? 'bg-qsis/15 border-qsis/30 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                      <i className={c.icon}></i>{c.label}
                    </button>
                  ))}
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
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none resize-none" placeholder="Notice details (optional)" />
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
                <input value={(form as any).link || ''} onChange={e => setForm(f => ({ ...f, link: e.target.value }))}
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
                {uploading && <p className="text-[0.72rem] text-dark-text3 mt-1"><i className="fas fa-spinner fa-spin mr-1"></i>Uploading...</p>}
                {(form as any).attachmentUrl && (
                  <p className="text-[0.72rem] text-green-400 mt-1"><i className="fas fa-check mr-1"></i>File attached: {(form as any).attachmentName}</p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} disabled={saving || !form.title.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.85rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50">
                  {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : editing ? 'Update Notice' : 'Publish Notice'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.85rem] hover:text-dark-text cursor-pointer">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notice Detail Viewer */}
      {selectedNotice && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedNotice(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-dark-border bg-dark-bg2 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-dark-border bg-dark-bg2/95 backdrop-blur-sm rounded-t-2xl">
              <div className="flex items-center gap-2 min-w-0">
                {(() => {
                  const meta = CATEGORY_META[selectedNotice.category];
                  return <span className={`px-2 py-0.5 rounded-md text-[0.65rem] font-medium ${meta.bg} ${meta.color} shrink-0`}><i className={`${meta.icon} mr-1`}></i>{meta.label}</span>;
                })()}
                {selectedNotice.pinned && <i className="fas fa-thumbtack text-qsis text-[0.65rem] shrink-0"></i>}
              </div>
              <button onClick={() => setSelectedNotice(null)} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer shrink-0"><i className="fas fa-times text-sm"></i></button>
            </div>
            <div className="p-5">
              <h2 className="text-lg font-bold text-dark-text mb-2">{selectedNotice.title}</h2>
              <div className="flex items-center gap-3 text-[0.72rem] text-dark-text3 mb-4 flex-wrap">
                <span><i className="fas fa-calendar mr-1"></i>{formatDate(selectedNotice.date)}</span>
                <span><i className="fas fa-user mr-1"></i>{selectedNotice.publishedByName || selectedNotice.publishedBy}</span>
                <span><i className="fas fa-clock mr-1"></i>{new Date(selectedNotice.publishedAt).toLocaleTimeString()}</span>
                {selectedNotice.expiresAt && (
                  <span className="text-amber-400/70"><i className="fas fa-hourglass-half mr-1"></i>Auto-deletes {formatDate(selectedNotice.expiresAt)}</span>
                )}
              </div>
              {selectedNotice.description && (
                <div className="text-[0.85rem] text-dark-text2 leading-relaxed whitespace-pre-line mb-4 p-3 rounded-xl bg-dark-bg3/50">{selectedNotice.description}</div>
              )}
              {selectedNotice.link && (
                <a href={selectedNotice.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-qsis/10 border border-qsis/20 text-qsis text-[0.8rem] hover:bg-qsis/15 transition mb-4">
                  <i className="fas fa-external-link-alt"></i>
                  <span className="truncate">{selectedNotice.link}</span>
                </a>
              )}
              {selectedNotice.attachmentUrl && (() => {
                const ext = (selectedNotice.attachmentName || selectedNotice.attachmentUrl).split('.').pop()?.toLowerCase() || '';
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                const isPdf = ext === 'pdf';
                return (
                  <div className="mb-2">
                    <p className="text-[0.72rem] font-medium text-dark-text2 mb-2"><i className="fas fa-paperclip mr-1"></i>Attachment</p>
                    {isImage ? (
                      <a href={selectedNotice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-dark-border hover:border-qsis/40 transition">
                        <img src={selectedNotice.attachmentUrl} alt={selectedNotice.attachmentName || 'Attachment'} className="w-full max-h-[60vh] object-contain bg-black/20" />
                      </a>
                    ) : isPdf ? (
                      <div className="rounded-xl border border-dark-border overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-red-500/10 border-b border-dark-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <i className="fas fa-file-pdf text-red-400 text-lg"></i>
                            <span className="text-[0.78rem] font-medium text-dark-text truncate">{selectedNotice.attachmentName || 'PDF Document'}</span>
                          </div>
                          <a href={selectedNotice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-qsis text-[0.72rem] hover:underline shrink-0"><i className="fas fa-external-link-alt mr-1"></i>Open</a>
                        </div>
                        <iframe src={selectedNotice.attachmentUrl} className="w-full h-[50vh] bg-dark-bg3" title={selectedNotice.attachmentName || 'PDF'} />
                      </div>
                    ) : (
                      <a href={selectedNotice.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition">
                        <i className="fas fa-file text-dark-text3 text-xl"></i>
                        <div className="min-w-0">
                          <p className="text-[0.82rem] font-medium text-dark-text truncate">{selectedNotice.attachmentName || 'File'}</p>
                          <p className="text-[0.68rem] text-dark-text3">Click to download</p>
                        </div>
                        <i className="fas fa-download text-dark-text3 ml-auto"></i>
                      </a>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
