'use client';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Notice } from '@/lib/notices';
import { CATEGORY_META } from '@/lib/notices';
import type { ViewerItem } from '@/lib/store/types';

const DocumentViewer = dynamic(() => import('@/components/app-shell/DocumentViewer'), { ssr: false });

function getFileExt(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function isImage(name: string) {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getFileExt(name));
}

function isPdf(name: string) {
  return getFileExt(name) === 'pdf';
}

function isDocx(name: string) {
  return getFileExt(name) === 'docx';
}

function buildViewerItem(url: string, name: string): ViewerItem {
  return {
    path: `notices/attachments/${name}`,
    name,
    mimeType: isPdf(name) ? 'application/pdf' : isDocx(name) ? 'application/docx' : isImage(name) ? 'image' : 'application/octet-stream',
    rawUrl: url,
  };
}

export default function NoticeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerItem, setViewerItem] = useState<ViewerItem | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notices');
        const data = await res.json();
        if (data.success) {
          const found = data.notices.find((n: Notice) => n.id === id);
          setNotice(found || null);
        }
      } catch {}
      setLoading(false);
    })();
  }, [id]);

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

  if (!notice) {
    return (
      <div className="min-h-[70vh] max-w-3xl mx-auto px-4 py-8 flex flex-col items-center justify-center">
        <i className="fas fa-exclamation-triangle text-4xl text-amber-400 mb-3"></i>
        <h2 className="text-lg font-bold text-dark-text mb-2">Notice Not Found</h2>
        <p className="text-[0.82rem] text-dark-text2 mb-4">This notice may have been removed or expired.</p>
        <Link href="/notices" className="px-4 py-2 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition">
          <i className="fas fa-arrow-left mr-1.5"></i>Back to Notice Board
        </Link>
      </div>
    );
  }

  const meta = CATEGORY_META[notice.category];
  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return d; }
  };
  const formatTime = (d: string) => {
    try { return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  const hasAttachment = !!notice.attachmentUrl;
  const attName = notice.attachmentName || notice.attachmentUrl?.split('/').pop() || '';
  const canPreviewWithDocViewer = hasAttachment && (isPdf(attName) || isDocx(attName));
  const canPreviewImage = hasAttachment && isImage(attName);

  return (
    <div className="min-h-[80vh] max-w-3xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link href="/notices" className="inline-flex items-center gap-1.5 text-[0.78rem] text-dark-text2 hover:text-qsis transition mb-5">
        <i className="fas fa-arrow-left"></i> Back to Notice Board
      </Link>

      {/* Notice Card */}
      <article className="rounded-2xl border border-dark-border bg-dark-bg2 overflow-hidden">
        {/* Header bar */}
        <div className="px-5 py-4 border-b border-dark-border bg-dark-bg3/30">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-lg text-[0.68rem] font-semibold ${meta.bg} ${meta.color}`}>
              <i className={`${meta.icon} mr-1`}></i>{meta.label}
            </span>
            {notice.pinned && (
              <span className="px-2 py-0.5 rounded-lg text-[0.65rem] font-medium bg-qsis/15 text-qsis">
                <i className="fas fa-thumbtack mr-1"></i>Pinned
              </span>
            )}
            {notice.expiresAt && (
              <span className="px-2 py-0.5 rounded-lg text-[0.65rem] font-medium bg-amber-500/10 text-amber-400">
                <i className="fas fa-clock mr-1"></i>Auto-deletes {formatDate(notice.expiresAt)}
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6">
          {/* Title */}
          <h1 className="text-xl sm:text-2xl font-bold text-dark-text leading-snug mb-4">{notice.title}</h1>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 text-[0.75rem] text-dark-text3 mb-5 pb-5 border-b border-dark-border">
            <span className="flex items-center gap-1.5">
              <i className="fas fa-calendar text-qsis"></i>
              {formatDate(notice.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="fas fa-user text-qsis"></i>
              {notice.publishedByName || notice.publishedBy}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="fas fa-clock text-qsis"></i>
              Published {formatTime(notice.publishedAt)}
            </span>
          </div>

          {/* Description */}
          {notice.description && (
            <div className="text-[0.88rem] text-dark-text leading-relaxed whitespace-pre-line mb-5">
              {notice.description}
            </div>
          )}

          {/* External Link */}
          {notice.link && (
            <a href={notice.link} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-qsis/10 border border-qsis/20 text-qsis text-[0.82rem] font-medium hover:bg-qsis/15 transition mb-5">
              <i className="fas fa-external-link-alt"></i>
              <span className="truncate max-w-xs">{notice.link}</span>
            </a>
          )}

          {/* Attachment */}
          {hasAttachment && (
            <div className="mt-2">
              <h3 className="text-[0.82rem] font-semibold text-dark-text mb-3 flex items-center gap-2">
                <i className="fas fa-paperclip text-qsis"></i> Attachment
              </h3>

              {/* DocViewer for PDF/DOCX */}
              {canPreviewWithDocViewer && (
                <div className="rounded-xl border border-dark-border overflow-hidden mb-3">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark-bg3 border-b border-dark-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className={`fas ${isPdf(attName) ? 'fa-file-pdf text-red-400' : 'fa-file-word text-blue-400'} text-lg`}></i>
                      <span className="text-[0.78rem] font-medium text-dark-text truncate">{attName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setViewerItem(buildViewerItem(notice.attachmentUrl!, attName))}
                        className="px-2.5 py-1 rounded-lg bg-qsis/15 text-qsis text-[0.7rem] font-semibold hover:bg-qsis/25 transition cursor-pointer border-none">
                        <i className="fas fa-expand mr-1"></i>Open Viewer
                      </button>
                      <a href={notice.attachmentUrl} download={attName}
                        className="px-2.5 py-1 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text2 text-[0.7rem] font-semibold hover:text-dark-text transition">
                        <i className="fas fa-download mr-1"></i>Download
                      </a>
                    </div>
                  </div>
                  {/* Inline preview */}
                  <div className="bg-dark-bg3 min-h-[400px]">
                    <DocumentViewer item={buildViewerItem(notice.attachmentUrl!, attName)} onClose={() => {}} />
                  </div>
                </div>
              )}

              {/* Inline image */}
              {canPreviewImage && (
                <div className="rounded-xl border border-dark-border overflow-hidden mb-3">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-dark-bg3 border-b border-dark-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className="fas fa-image text-green-400 text-lg"></i>
                      <span className="text-[0.78rem] font-medium text-dark-text truncate">{attName}</span>
                    </div>
                    <a href={notice.attachmentUrl} download={attName}
                      className="px-2.5 py-1 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text2 text-[0.7rem] font-semibold hover:text-dark-text transition">
                      <i className="fas fa-download mr-1"></i>Download
                    </a>
                  </div>
                  <img src={notice.attachmentUrl} alt={attName}
                    className="w-full max-h-[70vh] object-contain bg-black/20 cursor-pointer"
                    onClick={() => window.open(notice.attachmentUrl, '_blank')} />
                </div>
              )}

              {/* Fallback download for other types */}
              {!canPreviewWithDocViewer && !canPreviewImage && (
                <a href={notice.attachmentUrl} download={attName}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-dark-bg3 border border-dark-border hover:border-qsis/40 transition">
                  <i className="fas fa-file text-dark-text3 text-xl"></i>
                  <div className="min-w-0">
                    <p className="text-[0.82rem] font-medium text-dark-text truncate">{attName}</p>
                    <p className="text-[0.68rem] text-dark-text3">Click to download</p>
                  </div>
                  <i className="fas fa-download text-dark-text3 ml-auto"></i>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border bg-dark-bg3/20 flex items-center justify-between text-[0.68rem] text-dark-text3">
          <span>Published by {notice.publishedByName || notice.publishedBy}</span>
          <span>ID: {notice.id}</span>
        </div>
      </article>

      {/* Full-screen DocViewer modal */}
      {viewerItem && (
        <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center" onClick={() => setViewerItem(null)}>
          <div className="w-full h-full" onClick={e => e.stopPropagation()}>
            <DocumentViewer item={viewerItem} onClose={() => setViewerItem(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
