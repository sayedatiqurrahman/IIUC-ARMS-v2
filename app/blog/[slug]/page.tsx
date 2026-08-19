'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';
import type { BlogPost } from '@/lib/blog';

export default function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [metaRes, contentRes] = await Promise.all([
          fetch('/api/blogs'),
          fetch(`/api/blogs?slug=${encodeURIComponent(slug)}`),
        ]);
        const metaData = await metaRes.json();
        const contentData = await contentRes.json();
        if (metaData.success) {
          const found = metaData.posts.find((p: BlogPost) => p.slug === slug);
          setPost(found || null);
        }
        if (contentData.success) {
          setContent(contentData.content || '');
        }
      } catch {}
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-[70vh] max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/4 bg-dark-bg3 rounded"></div>
          <div className="h-8 w-2/3 bg-dark-bg3 rounded"></div>
          <div className="h-4 w-full bg-dark-bg3 rounded"></div>
          <div className="h-4 w-3/4 bg-dark-bg3 rounded"></div>
          <div className="h-64 w-full bg-dark-bg3 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-[70vh] max-w-3xl mx-auto px-4 py-8 flex flex-col items-center justify-center">
        <i className="fas fa-exclamation-triangle text-4xl text-amber-400 mb-3"></i>
        <h2 className="text-lg font-bold text-dark-text mb-2">Post Not Found</h2>
        <p className="text-[0.82rem] text-dark-text2 mb-4">This blog post may have been removed or does not exist.</p>
        <Link href="/blog" className="px-4 py-2 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition">
          <i className="fas fa-arrow-left mr-1.5"></i>Back to Blog
        </Link>
      </div>
    );
  }

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div className="min-h-[80vh] max-w-3xl mx-auto px-4 py-6">
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-[0.78rem] text-dark-text2 hover:text-qsis transition mb-5">
        <i className="fas fa-arrow-left"></i> Back to Blog
      </Link>

      <article className="rounded-2xl border border-dark-border bg-dark-bg2 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-border bg-dark-bg3/30">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-lg text-[0.68rem] font-semibold ${post.category === 'tutorial' ? 'bg-blue-500/15 text-blue-400' : 'bg-green-500/15 text-green-400'}`}>
              <i className={`${post.category === 'tutorial' ? 'fa-graduation-cap' : 'fa-pen-nib'} mr-1`}></i>
              {post.category === 'tutorial' ? 'Tutorial' : 'Blog Post'}
            </span>
            {post.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-lg text-[0.65rem] font-medium bg-dark-bg2 text-dark-text3 border border-dark-border">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {post.thumbnailUrl && (
          <div className="border-b border-dark-border">
            <img src={post.thumbnailUrl} alt={post.title} className="w-full max-h-[360px] object-cover" />
          </div>
        )}

        <div className="p-5 sm:p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-dark-text leading-snug mb-4">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-[0.75rem] text-dark-text3 mb-5 pb-5 border-b border-dark-border">
            <span className="flex items-center gap-1.5">
              <img
                src={post.authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.authorName)}&background=22c55e&color=fff&bold=true&size=32`}
                alt=""
                className="w-5 h-5 rounded-full"
              />
              {post.authorName}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="fas fa-calendar text-qsis"></i>
              {formatDate(post.publishedAt)}
            </span>
            {post.updatedAt && post.updatedAt !== post.publishedAt && (
              <span className="flex items-center gap-1.5">
                <i className="fas fa-pen text-qsis"></i>
                Updated {formatDate(post.updatedAt)}
              </span>
            )}
          </div>

          {post.excerpt && (
            <p className="text-[0.88rem] text-dark-text2 italic mb-5 pb-5 border-b border-dark-border">{post.excerpt}</p>
          )}

          {content && (
            <div
              className="prose-content text-[0.88rem] text-dark-text leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          )}
        </div>

        <div className="px-5 py-3 border-t border-dark-border bg-dark-bg3/20 flex items-center justify-between text-[0.68rem] text-dark-text3">
          <span>Published by {post.authorName}</span>
          <span>{formatDate(post.publishedAt)}</span>
        </div>
      </article>
    </div>
  );
}
