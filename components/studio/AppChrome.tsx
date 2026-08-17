'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { StudioApp } from '@/lib/studio-apps';
import { useAppStore } from '@/lib/store';
import ContributeModal from './ContributeModal';

export default function AppChrome({
  app,
  sessionEmail,
}: {
  app: StudioApp;
  sessionEmail?: string;
}) {
  const profile = useAppStore((s) => s.profile);
  const author = app.author;
  const entry = app.entry || 'index.html';
  const src = `/api/studio-apps/serve/${app.id}/${entry}`;

  const isAuthor =
    !!sessionEmail &&
    !!author &&
    ((author.email && sessionEmail.toLowerCase() === author.email.toLowerCase()) ||
      (author.githubLogin &&
        sessionEmail.toLowerCase().split('@')[0] === author.githubLogin.toLowerCase()));

  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reported, setReported] = useState<{ issueUrl: string; issueNumber: number } | null>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Warm the app file (GitHub → edge cache) as soon as this page mounts, so the
  // iframe loads instantly when the user hits Start instead of waiting on a
  // GitHub round-trip. The browser also caches it for repeat opens.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(src, { signal: ctrl.signal, cache: 'force-cache' }).catch(() => {});
    return () => ctrl.abort();
  }, [src]);

  const openNewTab = () => {
    window.open(src, '_blank', 'noopener');
  };

  const submitReport = async () => {
    setReportError('');
    if (reportDesc.trim().length < 5) {
      setReportError('Describe the problem you found (at least a few words).');
      return;
    }
    setReporting(true);
    try {
      const res = await fetch('/api/studio-apps/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: app.id, title: reportTitle.trim(), description: reportDesc.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.existingIssueUrl) {
          setReported({ issueUrl: data.existingIssueUrl, issueNumber: data.issueNumber || 0 });
        } else {
          setReportError(data.error || 'Could not report the issue.');
        }
        setReporting(false);
        return;
      }
      setReported({ issueUrl: data.issueUrl, issueNumber: data.issueNumber });
      setReporting(false);
    } catch {
      setReportError('Network error — please try again.');
      setReporting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/studio"
          className="rounded-xl border border-dark-border bg-dark-bg2 px-3 py-2 text-[0.72rem] font-medium text-dark-text transition hover:border-qsis hover:text-qsis no-underline"
        >
          <span className="material-symbols-outlined align-middle mr-1 text-[0.95rem]">arrow_back</span>
          Back to Studio
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] text-dark-text3 truncate">{app.title}</span>
          {isAuthor && (
            <button
              onClick={() => setShowUpdate(true)}
              className="rounded-lg border border-qsis/40 bg-qsis/10 px-3 py-1.5 text-[0.68rem] font-medium text-qsis transition hover:bg-qsis/20 cursor-pointer"
            >
              <span className="material-symbols-outlined align-middle mr-1 text-[0.9rem]">update</span>
              Update
            </button>
          )}
          <button
            onClick={() => setShowReport(true)}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[0.68rem] font-medium text-rose-300 transition hover:bg-rose-500/20 cursor-pointer"
          >
            <span className="material-symbols-outlined align-middle mr-1 text-[0.9rem]">bug_report</span>
          </button>
          {isFullscreen && (
            <button
              onClick={async () => {
                try {
                  await document.exitFullscreen();
                } catch {}
              }}
              className="rounded-lg border border-dark-border bg-dark-bg2 px-3 py-1.5 text-[0.68rem] font-medium text-dark-text2 transition hover:border-qsis hover:text-qsis cursor-pointer"
            >
              <span className="material-symbols-outlined align-middle mr-1 text-[0.9rem]">fullscreen_exit</span>
              Exit fullscreen
            </button>
          )}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="flex-1 rounded-2xl overflow-hidden border border-dark-border bg-white relative"
      >
        <iframe
          ref={frameRef}
          src={src}
          title={app.title}
          className="h-[calc(100dvh-220px)] min-h-[480px] w-full"
          allow="clipboard-write; fullscreen; document-picture-in-picture; popups"
          onLoad={() => setIframeLoading(false)}
        />

        {iframeLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-bg p-6 text-center">
            <div className="w-10 h-10 border-3 border-dark-border border-t-qsis rounded-full animate-spin mb-4"></div>
            <p className="text-[0.78rem] text-dark-text2">Loading {app.title}…</p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.68rem] text-dark-text3">
          Community app · runs from GitHub, nothing leaves your browser.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (document.fullscreenElement) {
                try {
                  await document.exitFullscreen();
                } catch {}
              } else {
                try {
                  await wrapRef.current?.requestFullscreen();
                } catch {}
              }
            }}
            className="rounded-lg border border-dark-border bg-dark-bg2 px-3 py-1.5 text-[0.68rem] font-medium text-dark-text2 transition hover:border-qsis hover:text-qsis cursor-pointer"
          >
            <span className="material-symbols-outlined align-middle mr-1 text-[0.9rem]">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <button
            onClick={openNewTab}
            className="rounded-lg border border-dark-border bg-dark-bg2 px-3 py-1.5 text-[0.68rem] font-medium text-dark-text2 transition hover:border-qsis hover:text-qsis cursor-pointer"
          >
            <span className="material-symbols-outlined align-middle mr-1 text-[0.9rem]">open_in_new</span>
            Open in new tab
          </button>
        </div>
      </div>

      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowReport(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-dark-border bg-dark-bg2 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {reported ? (
              <div className="text-center py-4">
                <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-emerald-400 text-3xl">verified</span>
                </div>
                <h3 className="text-lg font-bold text-dark-text mb-1">Issue reported</h3>
                <p className="text-[0.78rem] text-dark-text2 mb-5">
                  The author has been notified on GitHub and your report counts as a bug-issue contribution.
                </p>
                <a
                  href={reported.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white no-underline hover:brightness-110"
                >
                  View issue #{reported.issueNumber}
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-dark-text">
                    <span className="material-symbols-outlined text-rose-400 align-middle mr-2">bug_report</span>
                    Report a problem
                  </h3>
                  <button onClick={() => setShowReport(false)} className="text-dark-text3 hover:text-rose-400 cursor-pointer">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <p className="text-[0.74rem] text-dark-text2 mb-4 leading-relaxed">
                  This opens a GitHub issue on <strong className="text-dark-text">apps/{app.id}/</strong> assigned to{' '}
                  <strong className="text-dark-text">{author?.name || 'the author'}</strong> so they get notified.
                </p>
                <label className="block text-[0.68rem] text-dark-text2 mb-1">Title (optional)</label>
                <input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder={`Issue with ${app.title}`}
                  maxLength={100}
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis mb-3"
                />
                <label className="block text-[0.68rem] text-dark-text2 mb-1">What went wrong? *</label>
                <textarea
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  rows={4}
                  placeholder="Describe what happened, what you expected, and how to reproduce it…"
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis resize-none mb-3"
                />
                {reportError && (
                  <p className="mb-3 text-[0.74rem] text-rose-400">
                    <span className="material-symbols-outlined align-middle mr-1 text-[1rem]">error</span>
                    {reportError}
                  </p>
                )}
                <button
                  onClick={submitReport}
                  disabled={reporting}
                  className="w-full rounded-xl bg-rose-500 px-5 py-2.5 text-[0.8rem] font-semibold text-white cursor-pointer transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reporting ? 'Reporting…' : 'Report issue'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showUpdate && (
        <ContributeModal
          profile={profile}
          initial={app}
          onClose={() => setShowUpdate(false)}
          onPublished={() => {
            setShowUpdate(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
