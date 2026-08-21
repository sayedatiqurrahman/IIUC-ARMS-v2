'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { useUserAccess } from '@/lib/useUserAccess';
import type { BlogPostListItem } from '@/lib/blog';
import { listDrafts } from '@/lib/blog-drafts';
import BlogEditorModal from '@/components/blog/BlogEditorModal';

const TABS = [
  { key: 'all', label: 'All', icon: 'fa-layer-group' },
  { key: 'tutorial', label: 'Tutorials', icon: 'fa-graduation-cap' },
  { key: 'post', label: 'Blog Posts', icon: 'fa-pen-nib' },
  { key: 'draft', label: 'My Drafts', icon: 'fa-file-alt' },
] as const;

function PostThumbnail({ post, className = '' }: { post: BlogPostListItem; className?: string }) {
  const hasVideo = !!post.videoUrl;
  return (
    <div className={`relative bg-gradient-to-br from-qsis/20 to-accent/20 flex items-center justify-center overflow-hidden ${className}`}>
      {post.thumbnailUrl ? (
        <img src={post.thumbnailUrl} alt={post.title} className="w-full h-full object-cover" />
      ) : hasVideo ? (
        <i className="fab fa-youtube text-3xl text-red-400/60"></i>
      ) : (
        <i className={`fas ${post.category === 'tutorial' ? 'fa-graduation-cap' : 'fa-pen-nib'} text-3xl text-dark-text3`}></i>
      )}
      {hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <i className="fas fa-play text-qsis text-sm ml-0.5"></i>
          </div>
        </div>
      )}
    </div>
  );
}

function BlogContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'all' | 'tutorial' | 'post' | 'draft') || 'all';

  const { data: session } = useSession();
  const profile = useAppStore(s => s.profile);
  const email = session?.user?.email || profile.email || '';
  const role = email ? config.detectRole(email) : null;
  const isCR = profile.isCR || false;
  const customPerms = (profile as any).customPermissions || {};

  const { has } = useUserAccess(email, role || '', isCR, customPerms);
  const canPublishBlog = has('publishBlog');
  const canPublishTutorial = has('publishTutorial');
  const isLoggedIn = !!email;

  const [publishedPosts, setPublishedPosts] = useState<BlogPostListItem[]>([]);
  const [localDrafts, setLocalDrafts] = useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'tutorial' | 'post' | 'draft'>(initialTab);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPostListItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/blogs');
      const data = await res.json();
      if (data.success) setPublishedPosts(data.posts);
    } catch {}
    try {
      const drafts = await listDrafts();
      setLocalDrafts(drafts);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const allPosts = [...localDrafts, ...publishedPosts];

  const handleTab = useCallback((tab: 'all' | 'tutorial' | 'post' | 'draft') => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'all') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

  const filtered = allPosts.filter(p => {
    if (activeTab === 'draft') return p.status === 'draft';
    if (activeTab !== 'all' && p.category !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const handleDeleteDraft = async (slug: string) => {
    if (!confirm('Delete this draft?')) return;
    const { deleteDraft, deleteDraftContent, deleteDraftThumbnailBlob } = await import('@/lib/blog-drafts');
    await deleteDraft(slug);
    await deleteDraftContent(slug);
    await deleteDraftThumbnailBlob(slug);
    setLocalDrafts(prev => prev.filter(d => d.slug !== slug));
  };

  const PostMeta = ({ post, compact = false }: { post: BlogPostListItem; compact?: boolean }) => (
    <>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold px-2 py-0.5 rounded-full ${post.category === 'tutorial' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>
          <i className={`fas ${post.category === 'tutorial' ? 'fa-graduation-cap' : 'fa-pen-nib'}`}></i>
          {post.category === 'tutorial' ? 'Tutorial' : 'Blog Post'}
        </span>
        {post.videoUrl && <span className="text-[0.6rem] text-red-400"><i className="fab fa-youtube mr-0.5"></i>Video</span>}
      </div>
      <h3 className={`${compact ? 'text-[0.85rem]' : 'mt-2 text-[0.9rem]'} font-bold text-dark-text ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{post.title}</h3>
      <p className={`${compact ? 'text-[0.7rem] mt-0.5' : 'mt-1 text-[0.75rem]'} text-dark-text3 ${compact ? 'line-clamp-1' : 'line-clamp-2'}`}>{post.excerpt}</p>
      <div className={`flex items-center gap-1.5 ${compact ? 'mt-1.5' : 'mt-3'}`}>
        <img src={post.authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.authorName)}&background=22c55e&color=fff&bold=true&size=24`} alt="" className={`${compact ? 'w-4 h-4' : 'w-6 h-6'} rounded-full`} />
        <span className={`${compact ? 'text-[0.65rem]' : 'text-[0.7rem]'} text-dark-text2`}>{post.authorName || 'You'}</span>
        <span className={`${compact ? 'text-[0.6rem]' : 'text-[0.65rem]'} text-dark-text3 ml-auto`}>
          {new Date(post.status === 'draft' ? post.updatedAt || post.publishedAt : post.publishedAt).toLocaleDateString()}
        </span>
      </div>
      {post.tags.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
          {post.tags.slice(0, compact ? 2 : 3).map(tag => (
            <span key={tag} className={`${compact ? 'text-[0.55rem] px-1 py-0.5' : 'text-[0.58rem] px-1.5 py-0.5'} rounded bg-dark-bg2 text-dark-text3`}>{tag}</span>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-4 py-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-[0.78rem] text-dark-text2 hover:text-qsis transition mb-5">
        <i className="fas fa-arrow-left"></i> Back to Home
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-dark-text flex items-center gap-2">
            <i className="fas fa-blog text-qsis"></i> Blog
          </h1>
          <p className="text-[0.82rem] text-dark-text2 mt-1">Tutorials, guides, and updates from the IIUC-ARMS community.</p>
        </div>
        {isLoggedIn && (
          <button onClick={() => { setEditingPost(null); setShowEditor(true); }}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition cursor-pointer">
            <i className="fas fa-plus text-[0.7rem]"></i>
            <span className="hidden sm:inline">New Post</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1.5 bg-dark-bg3 border border-dark-border rounded-xl p-1 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => handleTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold transition cursor-pointer border-none ${activeTab === t.key ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text'}`}>
              <i className={`fas ${t.icon}`}></i>{t.label}
              {t.key === 'draft' && localDrafts.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[0.6rem]">{localDrafts.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.72rem]"></i>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-[0.82rem] outline-none focus:border-qsis/40 transition placeholder:text-dark-text3" />
        </div>
        <div className="flex gap-1 bg-dark-bg3 border border-dark-border rounded-xl p-1">
          <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1.5 rounded-lg text-[0.72rem] font-medium cursor-pointer border-none transition ${viewMode === 'grid' ? 'bg-qsis/15 text-qsis' : 'text-dark-text3 hover:text-dark-text2'}`} title="Grid view">
            <i className="fas fa-th-large"></i>
          </button>
          <button onClick={() => setViewMode('list')} className={`px-2.5 py-1.5 rounded-lg text-[0.72rem] font-medium cursor-pointer border-none transition ${viewMode === 'list' ? 'bg-qsis/15 text-qsis' : 'text-dark-text3 hover:text-dark-text2'}`} title="List view">
            <i className="fas fa-list"></i>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-dark-bg3 border border-dark-border overflow-hidden animate-pulse">
              <div className="h-40 bg-dark-bg2"></div>
              <div className="p-4 space-y-3">
                <div className="h-4 w-20 bg-dark-bg2 rounded-full"></div>
                <div className="h-5 w-3/4 bg-dark-bg2 rounded"></div>
                <div className="h-3 w-full bg-dark-bg2 rounded"></div>
                <div className="h-3 w-1/2 bg-dark-bg2 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-dark-text2">
          <i className="fas fa-book-open text-4xl mb-3 block opacity-40"></i>
          <p className="text-[0.9rem] font-semibold mb-1">No posts found</p>
          <p className="text-[0.78rem]">{search ? 'Try a different search term.' : 'Check back later for new content.'}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(post => {
            const isDraft = post.status === 'draft';
            const Card = (
              <div className="rounded-2xl bg-dark-bg3 border border-dark-border overflow-hidden hover:border-qsis/40 transition-all cursor-pointer h-full">
                <PostThumbnail post={post} className="h-40" />
                {isDraft && <span className="relative block px-3 -mt-5 mb-1"><span className="px-2 py-0.5 rounded-full bg-yellow-500/90 text-black text-[0.6rem] font-bold">DRAFT</span></span>}
                <div className="p-4"><PostMeta post={post} /></div>
              </div>
            );
            if (isDraft) return (
              <div key={post.id} className="relative group">
                <button onClick={() => { setEditingPost(post); setShowEditor(true); }} className="text-left border-none bg-transparent p-0 cursor-pointer w-full">{Card}</button>
                <button onClick={e => { e.stopPropagation(); handleDeleteDraft(post.slug); }}
                  className="absolute top-2 left-2 w-7 h-7 rounded-full bg-red-500/80 flex items-center justify-center text-white text-[0.6rem] border-none cursor-pointer opacity-0 group-hover:opacity-100 transition" title="Delete draft">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            );
            return <Link key={post.id} href={`/blog/${post.slug}`} className="group">{Card}</Link>;
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(post => {
            const isDraft = post.status === 'draft';
            const Row = (
              <div className="rounded-xl bg-dark-bg3 border border-dark-border overflow-hidden hover:border-qsis/40 transition-all cursor-pointer flex">
                <PostThumbnail post={post} className="w-28 sm:w-36 h-auto min-h-[96px] shrink-0" />
                <div className="flex-1 p-3 min-w-0">
                  <PostMeta post={post} compact />
                </div>
              </div>
            );
            if (isDraft) return (
              <div key={post.id} className="relative group">
                <button onClick={() => { setEditingPost(post); setShowEditor(true); }} className="text-left border-none bg-transparent p-0 cursor-pointer w-full">{Row}</button>
                <button onClick={e => { e.stopPropagation(); handleDeleteDraft(post.slug); }}
                  className="absolute top-2 left-2 w-7 h-7 rounded-full bg-red-500/80 flex items-center justify-center text-white text-[0.6rem] border-none cursor-pointer opacity-0 group-hover:opacity-100 transition" title="Delete draft">
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            );
            return <Link key={post.id} href={`/blog/${post.slug}`} className="group">{Row}</Link>;
          })}
        </div>
      )}

      <BlogEditorModal open={showEditor} onClose={() => setShowEditor(false)} onSaved={fetchPosts} editingPost={editingPost}
        canPublishTutorial={canPublishTutorial} canPublishBlog={canPublishBlog} sessionUser={session?.user as any} />
    </div>
  );
}

export default function BlogPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-[0.78rem] text-dark-text2">Loading blog...</p>
        </div>
      </div>
    }>
      <BlogContent />
    </Suspense>
  );
}
