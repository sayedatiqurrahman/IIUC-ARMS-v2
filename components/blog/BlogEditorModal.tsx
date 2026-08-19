'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { BlogPostListItem, BlogCategory } from '@/lib/blog';
import { renderMarkdown } from '@/lib/markdown';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingPost?: BlogPostListItem | null;
  canPublishTutorial: boolean;
  canPublishBlog: boolean;
}

export default function BlogEditorModal({ open, onClose, onSaved, editingPost, canPublishTutorial, canPublishBlog }: Props) {
  const [saving, setSaving] = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [thumbnailLocalPreview, setThumbnailLocalPreview] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<BlogCategory>('post');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [status, setStatus] = useState<'published' | 'draft'>('draft');
  const [showPreview, setShowPreview] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setThumbnailLocalPreview('');
      return;
    }
    if (editingPost) {
      setTitle(editingPost.title);
      setCategory(editingPost.category);
      setExcerpt(editingPost.excerpt);
      setContent('');
      setTags(editingPost.tags.join(', '));
      setThumbnailUrl(editingPost.thumbnailUrl || '');
      setThumbnailLocalPreview('');
      setStatus(editingPost.status);
      setShowPreview(false);
      fetch(`/api/blogs?action=content&slug=${editingPost.slug}`)
        .then(r => r.json())
        .then(data => { if (data.content) setContent(data.content); })
        .catch(() => {});
    } else {
      setTitle('');
      setCategory(canPublishTutorial ? 'tutorial' : 'post');
      setExcerpt('');
      setContent('');
      setTags('');
      setThumbnailUrl('');
      setThumbnailLocalPreview('');
      setStatus('draft');
      setShowPreview(false);
    }
  }, [open, editingPost, canPublishTutorial]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const slug = editingPost?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const body: any = {
        action: editingPost ? 'update' : 'create',
        slug,
        title: title.trim(),
        category,
        excerpt: excerpt.trim(),
        content,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        thumbnailUrl: thumbnailUrl || undefined,
        status,
      };
      if (editingPost) body.originalSlug = editingPost.slug;
      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        onClose();
        onSaved();
      }
    } catch {}
    setSaving(false);
  };

  const handleThumbnailUpload = async (file: File) => {
    const localUrl = URL.createObjectURL(file);
    setThumbnailLocalPreview(localUrl);
    setThumbnailUploading(true);

    const slug = editingPost?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (!slug) {
      setThumbnailUploading(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slug', slug);
      const res = await fetch('/api/blogs', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.url) {
        setThumbnailUrl(data.url);
        setThumbnailLocalPreview('');
        URL.revokeObjectURL(localUrl);
      } else {
        setThumbnailLocalPreview('');
        URL.revokeObjectURL(localUrl);
      }
    } catch {
      setThumbnailLocalPreview('');
      URL.revokeObjectURL(localUrl);
    }
    setThumbnailUploading(false);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const ta = textareaRef.current;
    const placeholder = `\n![Uploading image...](uploading)\n`;
    if (ta) {
      const start = ta.selectionStart;
      setContent(c => c.substring(0, start) + placeholder + c.substring(ta.selectionEnd));
    }

    const slug = editingPost?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (!slug) {
      setContent(c => c.replace(placeholder, ''));
      return;
    }

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slug', slug);
      fd.append('content', '1');
      const res = await fetch('/api/blogs', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.url) {
        const imgMd = `\n![${file.name || 'image'}](${data.url})\n`;
        setContent(c => c.replace(placeholder, imgMd));
      } else {
        setContent(c => c.replace(placeholder, ''));
      }
    } catch {
      setContent(c => c.replace(placeholder, ''));
    }
  }, [editingPost, title]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) dropRef.current.classList.remove('border-qsis', 'bg-qsis/10');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleThumbnailUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) dropRef.current.classList.add('border-qsis', 'bg-qsis/10');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.classList.remove('border-qsis', 'bg-qsis/10');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleThumbnailUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const insertMarkdown = (before: string, after: string = '', placeholder: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const replacement = selected || placeholder;
    const newText = content.substring(0, start) + before + replacement + after + content.substring(end);
    setContent(newText);
    setTimeout(() => {
      ta.focus();
      const cursorPos = start + before.length + replacement.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const insertLineStart = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newText = content.substring(0, lineStart) + prefix + content.substring(lineStart);
    setContent(newText);
    setTimeout(() => { ta.focus(); }, 0);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); insertMarkdown('**', '**', 'bold text'); }
    else if (key === 'i') { e.preventDefault(); insertMarkdown('*', '*', 'italic text'); }
    else if (key === 'k') { e.preventDefault(); insertMarkdown('[', '](url)', 'link text'); }
    else if (key === 'h' && e.shiftKey) { e.preventDefault(); insertLineStart('## '); }
    else if (key === 'q') { e.preventDefault(); insertLineStart('> '); }
    else if (key === 'e') { e.preventDefault(); insertMarkdown('`', '`', 'code'); }
  }, [content]);

  const renderedPreview = useMemo(() => renderMarkdown(content), [content]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border shrink-0">
          <h2 className="text-lg font-bold text-dark-text">
            <i className={`fas ${editingPost ? 'fa-edit text-blue-400' : 'fa-plus text-green-400'} mr-2`}></i>
            {editingPost ? 'Edit Post' : 'New Post'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer hover:text-dark-text">
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Post title"
              className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Category</label>
              <div className="flex gap-2">
                {canPublishTutorial && (
                  <button type="button" onClick={() => setCategory('tutorial')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${category === 'tutorial' ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                    <i className="fas fa-graduation-cap"></i>Tutorial
                  </button>
                )}
                <button type="button" onClick={() => setCategory('post')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${category === 'post' ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                  <i className="fas fa-pen-nib"></i>Blog Post
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Status</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStatus('published')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${status === 'published' ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                  <i className="fas fa-globe"></i>Published
                </button>
                <button type="button" onClick={() => setStatus('draft')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${status === 'draft' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                  <i className="fas fa-file-alt"></i>Draft
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Excerpt</label>
            <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} rows={2} placeholder="Short description for the post list..."
              className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none resize-none" />
          </div>

          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Tags (comma-separated)</label>
            <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. react, typescript, tutorial"
              className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" />
            {tags.trim() && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.split(',').map(t => t.trim()).filter(Boolean).map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-bg3 text-[0.68rem] text-dark-text2 border border-dark-border">
                    <i className="fas fa-tag text-[0.5rem] text-dark-text3"></i>{t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Thumbnail</label>
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all bg-dark-bg3 ${thumbnailLocalPreview || thumbnailUrl ? 'border-green-500/40' : 'border-dark-border hover:border-qsis/40'}`}
              onClick={() => !thumbnailUploading && fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
              {(thumbnailLocalPreview || thumbnailUrl) ? (
                <div className="relative inline-block">
                  <img src={thumbnailLocalPreview || thumbnailUrl} alt="Thumbnail preview" className="max-h-32 rounded-lg object-cover" />
                  {thumbnailUploading && (
                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                      <i className="fas fa-spinner fa-spin text-white text-xl"></i>
                    </div>
                  )}
                  {!thumbnailUploading && (
                    <button onClick={e => { e.stopPropagation(); setThumbnailUrl(''); setThumbnailLocalPreview(''); }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[0.6rem] border-none cursor-pointer hover:bg-red-500/80">
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <i className={`fas ${thumbnailUploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'} text-2xl text-dark-text3 mb-1 block`}></i>
                  <p className="text-[0.75rem] text-dark-text2 font-medium">{thumbnailUploading ? 'Uploading...' : 'Click or drag to upload thumbnail'}</p>
                  <p className="text-[0.65rem] text-dark-text3 mt-0.5">PNG, JPG, or WebP</p>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Content (Markdown)</label>
            <div className="border border-dark-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-0.5 px-2 py-1.5 bg-dark-bg3 border-b border-dark-border flex-wrap">
                <button type="button" onClick={() => insertMarkdown('**', '**', 'bold text')} title="Bold"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.75rem] font-bold">B</button>
                <button type="button" onClick={() => insertMarkdown('*', '*', 'italic text')} title="Italic"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.75rem] italic">I</button>
                <button type="button" onClick={() => insertLineStart('## ')} title="Heading"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.75rem] font-bold">H</button>
                <div className="w-px h-4 bg-dark-border mx-0.5"></div>
                <button type="button" onClick={() => insertMarkdown('[', '](url)', 'link text')} title="Link"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.7rem]"><i className="fas fa-link"></i></button>
                <button type="button" onClick={() => insertMarkdown('![', '](image-url)', 'alt text')} title="Image"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.7rem]"><i className="fas fa-image"></i></button>
                <button type="button" onClick={() => insertMarkdown('`', '`', 'code')} title="Inline Code"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.65rem] font-mono">&lt;/&gt;</button>
                <div className="w-px h-4 bg-dark-border mx-0.5"></div>
                <button type="button" onClick={() => insertLineStart('> ')} title="Blockquote"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.7rem]"><i className="fas fa-quote-right"></i></button>
                <button type="button" onClick={() => insertLineStart('- ')} title="Bullet List"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text cursor-pointer border-none text-[0.7rem]"><i className="fas fa-list-ul"></i></button>
                <div className="flex-1"></div>
                <button type="button" onClick={() => setShowPreview(!showPreview)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[0.7rem] font-medium cursor-pointer border-none transition ${showPreview ? 'bg-qsis/15 text-qsis' : 'text-dark-text2 hover:bg-dark-bg2 hover:text-dark-text'}`}>
                  <i className={`fas ${showPreview ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  Preview
                </button>
              </div>
              <div>
                {showPreview ? (
                  <div className="px-4 py-3 bg-dark-bg2 min-h-[400px] max-h-[600px] overflow-y-auto">
                    {content.trim() ? (
                      <div className="prose-content text-[0.82rem] text-dark-text2"
                        dangerouslySetInnerHTML={{ __html: renderedPreview }}
                      />
                    ) : (
                      <p className="text-dark-text3 text-[0.8rem] italic">Nothing to preview</p>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Write your post in Markdown... (Ctrl+V to paste images)"
                    rows={16}
                    className="w-full px-4 py-3 bg-dark-bg2 text-[0.82rem] text-dark-text font-mono focus:outline-none resize-none placeholder:text-dark-text3"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-dark-border shrink-0">
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.85rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50">
            {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : editingPost ? 'Update Post' : 'Create Post'}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.85rem] cursor-pointer hover:bg-dark-bg">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
