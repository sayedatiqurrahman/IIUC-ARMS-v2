'use client';

import { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { renderMarkdown, renderMarkdownAsync } from '@/lib/markdown';
import type { BlogPostListItem } from '@/lib/blog';
import { getDraft, getDraftContent } from '@/lib/blog-drafts';

function getVideoEmbed(url: string): { type: 'youtube' | 'vimeo' | 'direct'; src: string } | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
  if (ytMatch) return { type: 'youtube', src: `https://www.youtube.com/embed/${ytMatch[1]}` };
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return { type: 'vimeo', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  if (/\.(mp4|webm|ogg)$/i.test(url)) return { type: 'direct', src: url };
  return null;
}

export default function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [post, setPost] = useState<BlogPostListItem | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDraft, setIsDraft] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState('');
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [metaRes, contentRes] = await Promise.all([
          fetch('/api/blogs'),
          fetch(`/api/blogs?action=content&slug=${encodeURIComponent(slug)}`),
        ]);
        const metaData = await metaRes.json();
        const contentData = await contentRes.json();

        if (metaData.success) {
          const found = metaData.posts.find((p: BlogPostListItem) => p.slug === slug);
          if (found) {
            setPost(found);
            if (contentData.success && contentData.content) {
              setContent(contentData.content);
            }
            setLoading(false);
            return;
          }
        }

        const draft = await getDraft(slug);
        if (draft) {
          setPost(draft);
          setIsDraft(true);
          const draftContent = await getDraftContent(slug);
          if (draftContent) setContent(draftContent);
        }
      } catch {}
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (!content) { setRenderedHtml(''); return; }
    let cancelled = false;
    (async () => {
      try {
        const sync = renderMarkdown(content);
        if (!cancelled) {
          setRenderedHtml(sync);
          if (!sync || sync === '<p></p>') {
            const asyncResult = await renderMarkdownAsync(content);
            if (!cancelled) setRenderedHtml(asyncResult);
          }
        }
      } catch {
        if (!cancelled) {
          setRenderError(true);
          setRenderedHtml(`<p style="white-space:pre-wrap;color:#f87171">${content}</p>`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [content]);

  if (loading) {
    return (
      <div className="min-h-[70vh] w-full max-w-5xl mx-auto px-[5%] sm:px-4 py-8">
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
      <div className="min-h-[70vh] w-full max-w-4xl mx-auto px-[5%] sm:px-4 py-8 flex flex-col items-center justify-center">
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

  const ContentBody = () => (
    <>
      {isDraft && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-5 flex items-start gap-3">
          <i className="fas fa-file-alt text-amber-400 text-lg mt-0.5"></i>
          <div>
            <p className="text-[0.82rem] font-semibold text-amber-400">This is a local draft</p>
            <p className="text-[0.75rem] text-dark-text2 mt-0.5">
              This post hasn&apos;t been published yet. It only exists in your browser.
              Edit and publish it from the <Link href="/blog" className="text-qsis hover:underline">Blog page</Link>.
            </p>
          </div>
        </div>
      )}

      {renderedHtml ? (
        <div
          className={`prose-content text-[0.88rem] text-dark-text leading-relaxed ${renderError ? 'text-red-400' : ''}`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
          suppressHydrationWarning
        />
      ) : content ? (
        <div className="text-[0.88rem] text-dark-text2 italic">Loading content...</div>
      ) : (
        <p className="text-dark-text3 italic text-[0.82rem]">No content available.</p>
      )}
    </>
  );

  return (
    <div className="min-h-[80vh] w-full max-w-4xl mx-auto px-[5%] sm:px-4 py-6">
      <Link href="/blog" className="inline-flex items-center gap-1.5 text-[0.78rem] text-dark-text2 hover:text-qsis transition mb-5">
        <i className="fas fa-arrow-left"></i> Back to Blog
      </Link>

      <article className="rounded-2xl border border-dark-border bg-dark-bg2 overflow-hidden">
        {!isDraft && (
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
        )}

        {post.videoUrl ? (() => {
          const embed = getVideoEmbed(post.videoUrl);
          if (embed) {
            return (
              <div className="border-b border-dark-border">
                {embed.type === 'direct' ? (
                  <video src={embed.src} controls poster={post.thumbnailUrl} className="w-full max-h-[480px] bg-black" />
                ) : (
                  <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                    <iframe src={embed.src} className="absolute inset-0 w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                )}
              </div>
            );
          }
          return post.thumbnailUrl ? (
            <div className="border-b border-dark-border">
              <img src={post.thumbnailUrl} alt={post.title} className="w-full max-h-[360px] object-cover" />
            </div>
          ) : null;
        })() : post.thumbnailUrl ? (
          <div className="border-b border-dark-border">
            <img src={post.thumbnailUrl} alt={post.title} className="w-full max-h-[360px] object-cover" />
          </div>
        ) : null}

        <div className="p-5 sm:p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-dark-text leading-snug mb-4">{post.title}</h1>

          {!isDraft && (
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
          )}

          {post.excerpt && (
            <p className="text-[0.88rem] text-dark-text2 italic mb-5 pb-5 border-b border-dark-border">{post.excerpt}</p>
          )}

          <ContentBody />
        </div>

        {!isDraft && (
          <div className="px-5 py-3 border-t border-dark-border bg-dark-bg3/20 flex items-center justify-between text-[0.68rem] text-dark-text3">
            <span>Published by {post.authorName}</span>
            <span>{formatDate(post.publishedAt)}</span>
          </div>
        )}
      </article>
    </div>
  );
}
