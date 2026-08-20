'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { useUserAccess } from '@/lib/useUserAccess';
import type { BlogPostListItem } from '@/lib/blog';
import BlogEditorModal from '@/components/blog/BlogEditorModal';

const TABS = [
  { key: 'all', label: 'All', icon: 'fa-layer-group' },
  { key: 'tutorial', label: 'Tutorials', icon: 'fa-graduation-cap' },
  { key: 'post', label: 'Blog Posts', icon: 'fa-pen-nib' },
  { key: 'draft', label: 'My Drafts', icon: 'fa-file-alt' },
] as const;

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
  const canPublish = canPublishBlog || canPublishTutorial;
  const isLoggedIn = !!email;

  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'tutorial' | 'post' | 'draft'>(initialTab);
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPostListItem | null>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/blogs');
      const data = await res.json();
      if (data.success) {
        setPosts(data.posts);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleTab = useCallback((tab: 'all' | 'tutorial' | 'post' | 'draft') => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'all') params.delete('tab');
    else params.set('tab', tab);
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

  const filtered = posts.filter(p => {
    if (activeTab === 'draft') return p.status === 'draft' && p.authorEmail === email;
    if (activeTab !== 'all' && p.category !== activeTab) return false;
    if (p.status === 'draft' && p.authorEmail !== email) return false;
    if (search) {
      const q = search.toLowerCase();
      if (p.title.toLowerCase().includes(q)) return true;
      if (p.excerpt.toLowerCase().includes(q)) return true;
      if (p.tags.some(t => t.toLowerCase().includes(q))) return true;
      return false;
    }
    return true;
  });

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
          <button
            onClick={() => { setEditingPost(null); setShowEditor(true); }}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition cursor-pointer"
          >
            <i className="fas fa-plus text-[0.7rem]"></i>
            <span className="hidden sm:inline">New Post</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-1.5 bg-dark-bg3 border border-dark-border rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => handleTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold transition cursor-pointer border-none ${
                activeTab === t.key
                  ? 'bg-qsis text-white'
                  : 'bg-transparent text-dark-text2 hover:text-dark-text'
              }`}
            >
              <i className={`fas ${t.icon}`}></i>
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.72rem]"></i>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search posts..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text text-[0.82rem] outline-none focus:border-qsis/40 transition placeholder:text-dark-text3"
          />
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(post => {
            const isDraft = post.status === 'draft';
            const CardContent = (
              <div className="rounded-2xl bg-dark-bg3 border border-dark-border overflow-hidden hover:border-qsis/40 transition-all cursor-pointer h-full">
                <div className="h-40 bg-gradient-to-br from-qsis/20 to-accent/20 flex items-center justify-center overflow-hidden relative">
                  {post.thumbnailUrl ? (
                    <img src={post.thumbnailUrl} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <i className={`fas ${post.category === 'tutorial' ? 'fa-graduation-cap' : 'fa-pen-nib'} text-3xl text-dark-text3`}></i>
                  )}
                  {isDraft && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-yellow-500/90 text-black text-[0.6rem] font-bold">
                      DRAFT
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <span className={`inline-flex items-center gap-1 text-[0.65rem] font-semibold px-2 py-0.5 rounded-full ${post.category === 'tutorial' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>
                    <i className={`fas ${post.category === 'tutorial' ? 'fa-graduation-cap' : 'fa-pen-nib'}`}></i>
                    {post.category === 'tutorial' ? 'Tutorial' : 'Blog Post'}
                  </span>
                  <h3 className="mt-2 text-[0.9rem] font-bold text-dark-text line-clamp-2">{post.title}</h3>
                  <p className="mt-1 text-[0.75rem] text-dark-text3 line-clamp-2">{post.excerpt}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <img
                      src={post.authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.authorName)}&background=22c55e&color=fff&bold=true&size=32`}
                      alt=""
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="text-[0.7rem] text-dark-text2">{post.authorName}</span>
                    <span className="text-[0.65rem] text-dark-text3 ml-auto">
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {post.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {post.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[0.58rem] px-1.5 py-0.5 rounded bg-dark-bg2 text-dark-text3">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );

            if (isDraft) {
              return (
                <button key={post.id} onClick={() => { setEditingPost(post); setShowEditor(true); }} className="text-left border-none bg-transparent p-0 cursor-pointer">
                  {CardContent}
                </button>
              );
            }
            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group">
                {CardContent}
              </Link>
            );
          })}
        </div>
      )}

      {canPublish && (
        <BlogEditorModal
          open={showEditor}
          onClose={() => setShowEditor(false)}
          onSaved={fetchPosts}
          canPublishTutorial={canPublishTutorial}
          canPublishBlog={canPublishBlog}
        />
      )}
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
