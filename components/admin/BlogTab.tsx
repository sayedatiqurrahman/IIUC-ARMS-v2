'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { BlogPostListItem, BlogCategory } from '@/lib/blog';
import { renderMarkdown } from '@/lib/markdown';
import { useUserAccess } from '@/lib/useUserAccess';

interface Props {
  email: string;
  effectiveRole: string;
  isCR: boolean;
  customPermissions: Record<string, boolean>;
}

const CATEGORY_META: Record<BlogCategory, { label: string; icon: string; color: string; bg: string }> = {
  tutorial: { label: 'Tutorial', icon: 'fa-graduation-cap', color: 'text-blue-400', bg: 'bg-blue-500/15 text-blue-400' },
  post: { label: 'Blog Post', icon: 'fa-pen-nib', color: 'text-green-400', bg: 'bg-green-500/15 text-green-400' },
};

const STATUS_META: Record<string, { label: string; bg: string }> = {
  published: { label: 'Published', bg: 'bg-green-500/15 text-green-400' },
  draft: { label: 'Draft', bg: 'bg-yellow-500/15 text-yellow-400' },
};

type FilterType = 'all' | 'tutorial' | 'post';

export default function BlogTab({ email, effectiveRole, isCR, customPermissions }: Props) {
  const { has } = useUserAccess(email, effectiveRole, isCR, customPermissions);

  const canPublishBlog = has('publishBlog');
  const canPublishTutorial = has('publishTutorial');

  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPostListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);

  const [editorTitle, setEditorTitle] = useState('');
  const [editorCategory, setEditorCategory] = useState<BlogCategory>('post');
  const [editorExcerpt, setEditorExcerpt] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorTags, setEditorTags] = useState('');
  const [editorThumbnailUrl, setEditorThumbnailUrl] = useState('');
  const [editorStatus, setEditorStatus] = useState<'published' | 'draft'>('draft');
  const [showPreview, setShowPreview] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/blogs');
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) setPosts(data.posts);
      else if (Array.isArray(data)) setPosts(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const filteredPosts = useMemo(() => {
    let result = posts;
    if (filter !== 'all') result = result.filter(p => p.category === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [posts, filter, searchQuery]);

  const categoryCounts = useMemo(() => ({
    all: posts.length,
    tutorial: posts.filter(p => p.category === 'tutorial').length,
    post: posts.filter(p => p.category === 'post').length,
  }), [posts]);

  const openCreate = () => {
    setEditingPost(null);
    setEditorTitle('');
    setEditorCategory(canPublishTutorial ? 'tutorial' : 'post');
    setEditorExcerpt('');
    setEditorContent('');
    setEditorTags('');
    setEditorThumbnailUrl('');
    setEditorStatus('draft');
    setShowPreview(false);
    setShowEditor(true);
  };

  const openEdit = (post: BlogPostListItem) => {
    setEditingPost(post);
    setEditorTitle(post.title);
    setEditorCategory(post.category);
    setEditorExcerpt(post.excerpt);
    setEditorContent('');
    setEditorTags(post.tags.join(', '));
    setEditorThumbnailUrl(post.thumbnailUrl || '');
    setEditorStatus(post.status);
    setShowPreview(false);
    setShowEditor(true);
    fetch(`/api/blogs?action=content&slug=${post.slug}`)
      .then(r => r.json())
      .then(data => { if (data.content) setEditorContent(data.content); })
      .catch(() => {});
  };

  const handleSave = async () => {
    if (!editorTitle.trim()) return;
    setSaving(true);
    try {
      const slug = editingPost?.slug || editorTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
      const body: any = {
        action: editingPost ? 'update' : 'create',
        slug,
        title: editorTitle.trim(),
        category: editorCategory,
        excerpt: editorExcerpt.trim(),
        content: editorContent,
        tags: editorTags.split(',').map(t => t.trim()).filter(Boolean),
        status: editorStatus,
      };
      if (editingPost) body.originalSlug = editingPost.slug;
      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditor(false);
        fetchPosts();
      }
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', slug }),
      });
      const data = await res.json();
      if (data.success) fetchPosts();
    } catch {}
  };

  const handleThumbnailUpload = async (file: File) => {
    const slug = editingPost?.slug || editorTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    if (!slug) return;
    setThumbnailUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slug', slug);
      const res = await fetch('/api/blogs', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success && data.url) setEditorThumbnailUrl(data.url);
    } catch {}
    setThumbnailUploading(false);
  };

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
    const selected = editorContent.substring(start, end);
    const replacement = selected || placeholder;
    const newText = editorContent.substring(0, start) + before + replacement + after + editorContent.substring(end);
    setEditorContent(newText);
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
    const lineStart = editorContent.lastIndexOf('\n', start - 1) + 1;
    const newText = editorContent.substring(0, lineStart) + prefix + editorContent.substring(lineStart);
    setEditorContent(newText);
    setTimeout(() => { ta.focus(); }, 0);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    const ta = textareaRef.current;
    if (!ta) return;

    const key = e.key.toLowerCase();

    if (key === 'b') {
      e.preventDefault();
      insertMarkdown('**', '**', 'bold text');
    } else if (key === 'i') {
      e.preventDefault();
      insertMarkdown('*', '*', 'italic text');
    } else if (key === 'k') {
      e.preventDefault();
      insertMarkdown('[', '](url)', 'link text');
    } else if (key === 'h' && e.shiftKey) {
      e.preventDefault();
      insertLineStart('## ');
    } else if (key === 'q') {
      e.preventDefault();
      insertLineStart('> ');
    } else if (key === 'e') {
      e.preventDefault();
      insertMarkdown('`', '`', 'code');
    }
  }, [editorContent]);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  const renderedPreview = useMemo(() => renderMarkdown(editorContent), [editorContent]);

  const FILTER_TABS: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'fa-layer-group' },
    { key: 'tutorial', label: 'Tutorials', icon: 'fa-graduation-cap' },
    { key: 'post', label: 'Blog Posts', icon: 'fa-pen-nib' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-dark-text flex items-center gap-2">
            <i className="fas fa-blog text-qsis"></i>
            Blog & Tutorials
            <span className="text-[0.7rem] font-medium px-2 py-0.5 rounded-full bg-dark-bg3 text-dark-text2">{posts.length}</span>
          </h2>
          <p className="text-[0.75rem] text-dark-text2">Manage blog posts and tutorial articles</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-xl bg-qsis text-white text-[0.8rem] font-semibold hover:brightness-110 transition cursor-pointer">
          <i className="fas fa-plus mr-1.5"></i>New Post
        </button>
      </div>

      <div className="flex items-center gap-1 bg-dark-bg2 border border-dark-border rounded-xl p-1">
        {FILTER_TABS.map(tab => {
          const count = categoryCounts[tab.key];
          return (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.78rem] font-medium transition cursor-pointer border-none ${filter === tab.key ? 'bg-qsis/15 text-qsis' : 'bg-transparent text-dark-text2 hover:bg-dark-bg3'}`}>
              <i className={`fas ${tab.icon} text-[0.65rem]`}></i>
              {tab.label}
              <span className={`text-[0.65rem] px-1.5 py-0.5 rounded-full ${filter === tab.key ? 'bg-qsis/20 text-qsis' : 'bg-dark-bg3 text-dark-text3'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.75rem]"></i>
        <input type="text" placeholder="Search posts by title, excerpt, author, or tags..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-dark-bg2 border border-dark-border text-[0.82rem] text-dark-text placeholder:text-dark-text3 focus:border-qsis outline-none" />
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
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dark-border bg-dark-bg2">
          <i className="fas fa-blog text-3xl text-dark-text3 mb-2"></i>
          <p className="text-dark-text2 text-[0.82rem]">{searchQuery ? 'No posts match your search' : 'No posts yet'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPosts.map(post => {
            const catMeta = CATEGORY_META[post.category];
            const statusMeta = STATUS_META[post.status];
            return (
              <div key={post.slug} className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-bg2 px-4 py-3 hover:border-dark-text3 transition">
                {post.thumbnailUrl && (
                  <img src={post.thumbnailUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[0.82rem] font-semibold text-dark-text truncate">{post.title}</span>
                    <span className={`shrink-0 text-[0.6rem] font-medium px-2 py-0.5 rounded-full ${catMeta.bg}`}>
                      <i className={`fas ${catMeta.icon} mr-1`}></i>{catMeta.label}
                    </span>
                    <span className={`shrink-0 text-[0.6rem] font-medium px-2 py-0.5 rounded-full ${statusMeta.bg}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <p className="text-[0.7rem] text-dark-text3 truncate">{post.excerpt || 'No excerpt'}</p>
                  <div className="flex items-center gap-3 text-[0.62rem] text-dark-text3 mt-0.5">
                    <span><i className="fas fa-user mr-1"></i>{post.authorName}</span>
                    <span><i className="fas fa-calendar mr-1"></i>{formatDate(post.publishedAt)}</span>
                    {post.tags.length > 0 && <span className="text-dark-text3"><i className="fas fa-tags mr-1"></i>{post.tags.slice(0, 3).join(', ')}{post.tags.length > 3 ? '...' : ''}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(post)} className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-qsis cursor-pointer border-none" title="Edit">
                    <i className="fas fa-edit text-[0.7rem]"></i>
                  </button>
                  <button onClick={() => handleDelete(post.slug)} className="w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-red-400 cursor-pointer border-none" title="Delete">
                    <i className="fas fa-trash text-[0.7rem]"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showEditor && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-2 sm:p-4" onClick={() => setShowEditor(false)}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border shrink-0">
              <h2 className="text-lg font-bold text-dark-text">
                <i className={`fas ${editingPost ? 'fa-edit text-blue-400' : 'fa-plus text-green-400'} mr-2`}></i>
                {editingPost ? 'Edit Post' : 'New Post'}
              </h2>
              <button onClick={() => setShowEditor(false)} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer hover:text-dark-text">
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Title *</label>
                <input type="text" value={editorTitle} onChange={e => setEditorTitle(e.target.value)} placeholder="Post title"
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Category</label>
                  <div className="flex gap-2">
                    {canPublishTutorial && (
                      <button type="button" onClick={() => setEditorCategory('tutorial')}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${editorCategory === 'tutorial' ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                        <i className="fas fa-graduation-cap"></i>Tutorial
                      </button>
                    )}
                    <button type="button" onClick={() => setEditorCategory('post')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${editorCategory === 'post' ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                      <i className="fas fa-pen-nib"></i>Blog Post
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Status</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditorStatus('published')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${editorStatus === 'published' ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                      <i className="fas fa-globe"></i>Published
                    </button>
                    <button type="button" onClick={() => setEditorStatus('draft')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition ${editorStatus === 'draft' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' : 'bg-dark-bg3 border-dark-border text-dark-text2'}`}>
                      <i className="fas fa-file-alt"></i>Draft
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Excerpt</label>
                <textarea value={editorExcerpt} onChange={e => setEditorExcerpt(e.target.value)} rows={2} placeholder="Short description for the post list..."
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none resize-none" />
              </div>

              <div>
                <label className="block text-[0.75rem] font-medium text-dark-text2 mb-1">Tags (comma-separated)</label>
                <input type="text" value={editorTags} onChange={e => setEditorTags(e.target.value)} placeholder="e.g. react, typescript, tutorial"
                  className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none" />
                {editorTags.trim() && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {editorTags.split(',').map(t => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-bg3 text-[0.68rem] text-dark-text2 border border-dark-border">
                        <i className="fas fa-tag text-[0.5rem] text-dark-text3"></i>{tag}
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
                  className="relative rounded-xl border-2 border-dashed border-dark-border p-4 text-center cursor-pointer transition-all hover:border-qsis/40 bg-dark-bg3"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
                  {editorThumbnailUrl ? (
                    <div className="relative inline-block">
                      <img src={editorThumbnailUrl} alt="Thumbnail preview" className="max-h-32 rounded-lg object-cover" />
                      <button onClick={e => { e.stopPropagation(); setEditorThumbnailUrl(''); }}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[0.6rem] border-none cursor-pointer hover:bg-red-500/80">
                        <i className="fas fa-times"></i>
                      </button>
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
                        {editorContent.trim() ? (
                          <div className="prose prose-invert prose-sm max-w-none text-[0.82rem] text-dark-text2 [&_h1]:text-dark-text [&_h2]:text-dark-text [&_h3]:text-dark-text [&_strong]:text-dark-text [&_a]:text-qsis [&_code]:bg-dark-bg3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-dark-bg3 [&_pre]:p-3 [&_pre]:rounded-lg [&_blockquote]:border-l-2 [&_blockquote]:border-qsis [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-dark-text3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-2 [&_hr]:border-dark-border"
                            dangerouslySetInnerHTML={{ __html: renderedPreview }}
                          />
                        ) : (
                          <p className="text-dark-text3 text-[0.8rem] italic">Nothing to preview</p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        ref={textareaRef}
                        value={editorContent}
                        onChange={e => setEditorContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Write your post in Markdown..."
                        rows={16}
                        className="w-full px-4 py-3 bg-dark-bg2 text-[0.82rem] text-dark-text font-mono focus:outline-none resize-none placeholder:text-dark-text3"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-dark-border shrink-0">
              <button onClick={handleSave} disabled={saving || !editorTitle.trim()}
                className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.85rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50">
                {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : editingPost ? 'Update Post' : 'Create Post'}
              </button>
              <button onClick={() => setShowEditor(false)} className="px-5 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.85rem] cursor-pointer hover:bg-dark-bg">
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
