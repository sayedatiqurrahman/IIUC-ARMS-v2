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

type Step = 'idle' | 'uploading-assets' | 'saving-post' | 'done' | 'error';

const STEP_LABELS: Record<Step, string> = {
  'idle': '',
  'uploading-assets': 'Uploading assets to GitHub...',
  'saving-post': 'Saving post to GitHub...',
  'done': 'Published!',
  'error': 'Failed',
};

export default function BlogEditorModal({ open, onClose, onSaved, editingPost, canPublishTutorial, canPublishBlog }: Props) {
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [stepDetail, setStepDetail] = useState('');
  const [stepError, setStepError] = useState('');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<BlogCategory>('post');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'published' | 'draft'>('draft');
  const [showPreview, setShowPreview] = useState(false);

  // All local state only — no GitHub upload until save
  const [thumbnailPreview, setThumbnailPreview] = useState(''); // blob URL
  const [thumbnailRemoteUrl, setThumbnailRemoteUrl] = useState(''); // from editing post
  const pendingThumbnailRef = useRef<File | null>(null);
  const pendingImagesRef = useRef<{ marker: string; file: File; index: number }[]>([]);
  const [pastedPreviews, setPastedPreviews] = useState<Map<number, string>>(new Map()); // index → blob URL

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const imageCounterRef = useRef(0);
  const contentRef = useRef(''); // tracks latest content synchronously

  // Sync helper: always update both state AND ref
  const updateContent = useCallback((val: string | ((prev: string) => string)) => {
    if (typeof val === 'function') {
      setContent(prev => {
        const next = val(prev);
        contentRef.current = next;
        return next;
      });
    } else {
      contentRef.current = val;
      setContent(val);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setThumbnailPreview('');
      setThumbnailRemoteUrl('');
      pendingThumbnailRef.current = null;
      pendingImagesRef.current = [];
      setPastedPreviews(new Map());
      setStep('idle');
      setStepDetail('');
      setStepError('');
      return;
    }
    if (editingPost) {
      setTitle(editingPost.title);
      setCategory(editingPost.category);
      setExcerpt(editingPost.excerpt);
      updateContent('');
      setTags(editingPost.tags.join(', '));
      setThumbnailPreview('');
      setThumbnailRemoteUrl(editingPost.thumbnailUrl || '');
      setStatus(editingPost.status);
      setShowPreview(false);
      setPastedPreviews(new Map());
      fetch(`/api/blogs?action=content&slug=${editingPost.slug}`)
        .then(r => r.json())
        .then(data => { if (data.content) updateContent(data.content); })
        .catch(() => {});
    } else {
      setTitle('');
      setCategory(canPublishTutorial ? 'tutorial' : 'post');
      setExcerpt('');
      updateContent('');
      setTags('');
      setThumbnailPreview('');
      setThumbnailRemoteUrl('');
      setStatus('draft');
      setShowPreview(false);
      setPastedPreviews(new Map());
    }
  }, [open, editingPost, canPublishTutorial]);

  // ─── Upload file via API FormData → returns remote URL ───
  const uploadViaApi = async (file: File, folderName: string, isContent: boolean): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('folderName', folderName);
      if (isContent) fd.append('content', '1');
      const res = await fetch('/api/blogs', { method: 'POST', body: fd });
      const data = await res.json();
      return data.success ? data.url : null;
    } catch { return null; }
  };

  const canPublish = (category === 'tutorial' && canPublishTutorial) || (category === 'post' && canPublishBlog);
  const canPublishAny = canPublishTutorial || canPublishBlog;
  const isEditingDraft = editingPost?.status === 'draft';

  const handleSaveDraft = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setStepError('');
    setStep('saving-post');
    setStepDetail('Saving draft...');

    try {
      const body: any = {
        action: 'saveDraft',
        slug: editingPost?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80),
        title: title.trim(),
        category,
        excerpt: excerpt.trim(),
        content: contentRef.current,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        thumbnailUrl: thumbnailRemoteUrl || undefined,
      };

      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save draft');

      setStep('done');
      setTimeout(() => {
        onClose();
        onSaved();
      }, 600);
    } catch (e: any) {
      setStep('error');
      setStepError(e?.message || 'Something went wrong');
    }
    setSaving(false);
  };

  // ─── handleSave: upload assets first, then save/publish ───
  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setStepError('');
    const isEdit = !!editingPost;
    const slug = editingPost?.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

    // If user doesn't have publish permission, save as draft
    if (!canPublish && status === 'published') {
      await handleSaveDraft();
      return;
    }

    try {
      const hasThumbnail = !!pendingThumbnailRef.current;
      const hasImages = pendingImagesRef.current.length > 0;
      let thumbUrl = thumbnailRemoteUrl;

      // Step 1: Upload all assets FIRST via API
      if (hasThumbnail || hasImages) {
        setStep('uploading-assets');

        // Upload thumbnail
        if (hasThumbnail) {
          setStepDetail(`Thumbnail (1/${hasImages ? 2 : 1})...`);
          const url = await uploadViaApi(pendingThumbnailRef.current!, slug, false);
          if (url) thumbUrl = url;
        }

        // Upload pasted images, build final content with resolved URLs
        if (hasImages) {
          let resolvedContent = contentRef.current;
          let i = 0;
          for (const { marker, file } of pendingImagesRef.current) {
            i++;
            setStepDetail(`Image ${i}/${pendingImagesRef.current.length}...`);
            const url = await uploadViaApi(file, slug, true);
            if (url) {
              resolvedContent = resolvedContent.replace(marker, `\n![${file.name || 'image'}](${url})\n`);
            } else {
              resolvedContent = resolvedContent.replace(marker, '');
            }
          }
          // Update both ref and state
          contentRef.current = resolvedContent;
          updateContent(resolvedContent);
          pendingImagesRef.current = [];
          setPastedPreviews(new Map());
        }
      }

      // Step 2: Save the post — read from ref (always synchronous latest)
      setStep('saving-post');
      setStepDetail('');

      const body: any = {
        action: isEdit ? 'update' : 'create',
        slug,
        title: title.trim(),
        category,
        excerpt: excerpt.trim(),
        content: contentRef.current,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        thumbnailUrl: thumbUrl || undefined,
        status,
      };
      if (editingPost) body.originalSlug = editingPost.slug;

      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save post');

      setStep('done');
      setTimeout(() => {
        onClose();
        onSaved();
      }, 600);
    } catch (e: any) {
      setStep('error');
      setStepError(e?.message || 'Something went wrong');
    }
    setSaving(false);
  };

  // ─── Thumbnail selection: local preview ONLY ───
  const handleThumbnailSelect = (file: File) => {
    // Revoke old blob URL
    if (thumbnailPreview && thumbnailPreview.startsWith('blob:')) URL.revokeObjectURL(thumbnailPreview);
    const localUrl = URL.createObjectURL(file);
    setThumbnailPreview(localUrl);
    pendingThumbnailRef.current = file;
  };

  const removeThumbnail = () => {
    if (thumbnailPreview.startsWith('blob:')) URL.revokeObjectURL(thumbnailPreview);
    setThumbnailPreview('');
    setThumbnailRemoteUrl('');
    pendingThumbnailRef.current = null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropRef.current) dropRef.current.classList.remove('border-qsis', 'bg-qsis/10');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) handleThumbnailSelect(file);
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
    if (file) handleThumbnailSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Content image paste: local preview ONLY, upload on save ───
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const idx = ++imageCounterRef.current;
    const marker = `\n![PASTED_IMAGE_${idx}](local://pending)\n`;
    const blobUrl = URL.createObjectURL(file);

    setPastedPreviews(prev => new Map(prev).set(idx, blobUrl));
    pendingImagesRef.current.push({ marker, file, index: idx });

    const ta = textareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      updateContent(c => c.substring(0, start) + marker + c.substring(ta.selectionEnd));
    }
  }, []);

  // ─── Markdown insertion helpers ───
  const insertMarkdown = (before: string, after: string = '', placeholder: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.substring(start, end);
    const replacement = selected || placeholder;
    const newText = content.substring(0, start) + before + replacement + after + content.substring(end);
    updateContent(newText);
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
    updateContent(newText);
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

  // ─── Content with pasted image previews injected for preview mode ───
  const contentForPreview = useMemo(() => {
    let c = content;
    const entries = Array.from(pastedPreviews.entries());
    for (const [idx, blobUrl] of entries) {
      const marker = `![PASTED_IMAGE_${idx}](local://pending)`;
      c = c.replace(marker, `![Pasted image](${blobUrl})`);
    }
    return c;
  }, [content, pastedPreviews]);

  const renderedPreview = useMemo(() => renderMarkdown(contentForPreview), [contentForPreview]);
  const showThumbPreview = thumbnailPreview || thumbnailRemoteUrl;

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={onClose}>
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border shrink-0">
          <h2 className="text-lg font-bold text-dark-text">
            <i className={`fas ${editingPost ? 'fa-edit text-blue-400' : 'fa-plus text-green-400'} mr-2`}></i>
            {editingPost ? 'Edit Post' : 'New Post'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer hover:text-dark-text">
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Progress bar */}
        {saving && step !== 'done' && step !== 'error' && (
          <div className="px-6 py-2 border-b border-dark-border bg-dark-bg3/50">
            <div className="flex items-center gap-2">
              <i className="fas fa-spinner fa-spin text-qsis text-sm"></i>
              <span className="text-[0.78rem] text-dark-text2">{STEP_LABELS[step]}</span>
              {stepDetail && <span className="text-[0.7rem] text-dark-text3 ml-1">{stepDetail}</span>}
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-dark-border overflow-hidden">
              <div className="h-full bg-qsis rounded-full animate-pulse transition-all" style={{
                width: step === 'uploading-assets' ? '40%' :
                       step === 'saving-post' ? '80%' : '30%'
              }}></div>
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="mx-6 mt-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-[0.78rem] flex items-center gap-2">
            <i className="fas fa-exclamation-circle"></i>{stepError}
          </div>
        )}

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
                <button type="button" onClick={() => setCategory('tutorial')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${category === 'tutorial' ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                  <i className="fas fa-graduation-cap"></i>Tutorial
                </button>
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

          {/* Thumbnail — local preview only, upload on save */}
          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Thumbnail</label>
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all bg-dark-bg3 ${showThumbPreview ? 'border-green-500/40' : 'border-dark-border hover:border-qsis/40'}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
              {showThumbPreview ? (
                <div className="relative inline-block">
                  <img src={showThumbPreview} alt="Thumbnail preview" className="max-h-32 rounded-lg object-cover" />
                  {pendingThumbnailRef.current && (
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[0.6rem] py-0.5 rounded-b-lg">
                      Local preview — uploads on save
                    </span>
                  )}
                  <button onClick={e => { e.stopPropagation(); removeThumbnail(); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[0.6rem] border-none cursor-pointer hover:bg-red-500/80">
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              ) : (
                <>
                  <i className="fas fa-cloud-upload-alt text-2xl text-dark-text3 mb-1 block"></i>
                  <p className="text-[0.75rem] text-dark-text2 font-medium">Click or drag to set thumbnail</p>
                  <p className="text-[0.65rem] text-dark-text3 mt-0.5">No upload until you save</p>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Content (Markdown) — Ctrl+V to paste images</label>
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
                    {contentForPreview.trim() ? (
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
                    onChange={e => updateContent(e.target.value)}
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

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-dark-border shrink-0">
          <button onClick={handleSaveDraft} disabled={saving || !title.trim()}
            className="px-4 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-[0.82rem] font-semibold hover:bg-dark-bg disabled:opacity-50 cursor-pointer transition">
            {saving && step === 'saving-post' ? (
              <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</>
            ) : (
              <><i className="fas fa-save mr-1.5"></i>Save Draft</>
            )}
          </button>
          {canPublish && (
            <button onClick={handleSave} disabled={saving || !title.trim()}
              className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50">
              {saving ? (
                <><i className="fas fa-spinner fa-spin mr-1"></i>{STEP_LABELS[step] || 'Publishing...'}</>
              ) : editingPost ? 'Update & Publish' : 'Publish'}
            </button>
          )}
          {!canPublish && (
            <div className="flex-1 flex items-center justify-center text-[0.72rem] text-dark-text3">
              <i className="fas fa-info-circle mr-1"></i>
              You can save drafts. Publishing requires permission.
            </div>
          )}
          <button onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.85rem] cursor-pointer hover:bg-dark-bg disabled:opacity-50">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
