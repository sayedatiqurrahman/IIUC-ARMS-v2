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
  const [showAuthorInfo, setShowAuthorInfo] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportDesc, setReportDesc] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reported, setReported] = useState<{ issueUrl: string; issueNumber: number; solved?: boolean } | null>(null);
  const [issueStatus, setIssueStatus] = useState<'open' | 'solved' | null>(null);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Check issue status after reporting
  useEffect(() => {
    if (!reported?.issueNumber) return;
    const ctrl = new AbortController();
    fetch(`/api/studio-apps/issues?issueNumber=${reported.issueNumber}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => { if (data.solved !== undefined) setIssueStatus(data.solved ? 'solved' : 'open'); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [reported?.issueNumber]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(src, { signal: ctrl.signal, cache: 'force-cache' }).catch(() => {});
    return () => ctrl.abort();
  }, [src]);

  const openNewTab = () => window.open(src, '_blank', 'noopener');

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrapRef.current?.requestFullscreen();
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
          if (data.issueNumber) {
            fetch(`/api/studio-apps/issues?issueNumber=${data.issueNumber}`)
              .then(r => r.json())
              .then(d => { if (d.solved !== undefined) setIssueStatus(d.solved ? 'solved' : 'open'); })
              .catch(() => {});
          }
        }
        else setReportError(data.error || 'Could not report the issue.');
        setReporting(false);
        return;
      }
      setReported({ issueUrl: data.issueUrl, issueNumber: data.issueNumber });
    } catch {
      setReportError('Network error — please try again.');
    }
    setReporting(false);
  };

  return (
    <>
      {/* Full-viewport iframe — starts at navbar bottom */}
      <div ref={wrapRef} className="fixed top-[59px] left-0 right-0 bottom-[60px] md:bottom-0 z-[50]">
        <iframe
          ref={frameRef}
          src={src}
          title={app.title}
          className="w-full h-full border-0"
          allow="clipboard-write; fullscreen; document-picture-in-picture; popups"
          onLoad={() => setIframeLoading(false)}
        />
        {iframeLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-bg p-6 text-center z-10">
            <div className="w-10 h-10 border-3 border-dark-border border-t-qsis rounded-full animate-spin mb-4" />
            <p className="text-[0.78rem] text-dark-text2">Loading {app.title}…</p>
          </div>
        )}
      </div>

      {/* Floating back button — positioned just below navbar, safe from iframe content */}
      <Link
        href="/studio"
        className="fixed top-[64px] left-3 z-[60] flex items-center gap-1 rounded-lg border border-dark-border bg-dark-bg2/95 backdrop-blur-sm px-2 py-1.5 text-[0.68rem] font-medium text-dark-text2 transition hover:border-qsis hover:text-qsis no-underline shadow-lg"
      >
        <span className="material-symbols-outlined text-[0.85rem]">arrow_back</span>
        <span className="hidden sm:inline">Studio</span>
      </Link>

      {/* Floating action button */}
      <div className="fixed bottom-[76px] md:bottom-4 right-3 z-[60] flex flex-col items-end gap-2">
        {fabOpen && (
          <>
            <button
              onClick={() => { setShowAuthorInfo(true); setFabOpen(false); }}
              className="w-10 h-10 rounded-full border border-dark-border bg-dark-bg2/90 backdrop-blur-sm flex items-center justify-center text-dark-text2 hover:text-amber-400 hover:border-amber-500/50 transition cursor-pointer shadow-lg"
              title="App info"
            >
              <span className="material-symbols-outlined text-[1.1rem]">info</span>
            </button>
            <button
              onClick={openNewTab}
              className="w-10 h-10 rounded-full border border-dark-border bg-dark-bg2/90 backdrop-blur-sm flex items-center justify-center text-dark-text2 hover:text-qsis hover:border-qsis transition cursor-pointer shadow-lg"
              title="Open in new tab"
            >
              <span className="material-symbols-outlined text-[1.1rem]">open_in_new</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 rounded-full border border-dark-border bg-dark-bg2/90 backdrop-blur-sm flex items-center justify-center text-dark-text2 hover:text-qsis hover:border-qsis transition cursor-pointer shadow-lg"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <span className="material-symbols-outlined text-[1.1rem]">
                {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>
            {isAuthor && (
              <>
                <button
                  onClick={() => { setShowReport(true); setFabOpen(false); }}
                  className="w-10 h-10 rounded-full border border-dark-border bg-dark-bg2/90 backdrop-blur-sm flex items-center justify-center text-dark-text2 hover:text-rose-400 hover:border-rose-500/50 transition cursor-pointer shadow-lg"
                  title="Report issue"
                >
                  <span className="material-symbols-outlined text-[1.1rem]">bug_report</span>
                </button>
                <button
                  onClick={() => { setShowUpdate(true); setFabOpen(false); }}
                  className="w-10 h-10 rounded-full border border-dark-border bg-dark-bg2/90 backdrop-blur-sm flex items-center justify-center text-dark-text2 hover:text-qsis hover:border-qsis transition cursor-pointer shadow-lg"
                  title="Update app"
                >
                  <span className="material-symbols-outlined text-[1.1rem]">update</span>
                </button>
              </>
            )}
          </>
        )}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className="w-12 h-12 rounded-full bg-qsis flex items-center justify-center text-white shadow-lg shadow-qsis/30 cursor-pointer transition hover:brightness-110"
        >
          <span className="material-symbols-outlined text-[1.3rem]">{fabOpen ? 'close' : 'more_horiz'}</span>
        </button>
      </div>

      {showReport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowReport(false)}>
          <div className="w-full max-w-md rounded-2xl border border-dark-border bg-dark-bg2 p-6" onClick={(e) => e.stopPropagation()}>
            {reported ? (
              <div className="text-center py-4">
                <div className={`h-14 w-14 mx-auto rounded-2xl ${issueStatus === 'solved' ? 'bg-emerald-500/15' : 'bg-emerald-500/15'} flex items-center justify-center mb-4`}>
                  <span className={`material-symbols-outlined ${issueStatus === 'solved' ? 'text-emerald-400' : 'text-emerald-400'} text-3xl`}>
                    {issueStatus === 'solved' ? 'check_circle' : 'verified'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-dark-text mb-1">
                  {issueStatus === 'solved' ? 'Issue solved!' : 'Issue reported'}
                </h3>
                <p className="text-[0.78rem] text-dark-text2 mb-2">
                  {issueStatus === 'solved'
                    ? 'This issue has been resolved.'
                    : 'The author has been notified on GitHub.'}
                </p>
                {issueStatus === 'solved' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[0.72rem] font-semibold mb-3">
                    <span className="material-symbols-outlined text-[0.9rem]">check_circle</span>
                    Solved
                  </span>
                )}
                {issueStatus === 'open' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 text-[0.72rem] font-semibold mb-3">
                    <span className="material-symbols-outlined text-[0.9rem]">pending</span>
                    Open — awaiting fix
                  </span>
                )}
                <div className="mt-3">
                  <a href={reported.issueUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white no-underline hover:brightness-110">
                    View issue #{reported.issueNumber}
                  </a>
                </div>
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
                  placeholder="Describe what happened…"
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

      {showAuthorInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowAuthorInfo(false)}>
          <div className="w-full max-w-md rounded-2xl border border-dark-border bg-dark-bg2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-dark-text flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400">info</span>
                App Info
              </h3>
              <button onClick={() => setShowAuthorInfo(false)} className="text-dark-text3 hover:text-dark-text cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Author card */}
            {author ? (
              <div className="px-5 pb-5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-dark-bg border border-dark-border">
                  {author.githubLogin && (
                    <img
                      src={`https://github.com/${author.githubLogin}.png?size=80`}
                      alt={author.name}
                      className="w-12 h-12 rounded-full border border-dark-border"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.88rem] font-bold text-dark-text truncate">{author.name}</p>
                    {author.githubLogin && (
                      <a
                        href={`https://github.com/${author.githubLogin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[0.72rem] text-dark-text2 hover:text-qsis transition no-underline flex items-center gap-1"
                      >
                        <i className="fab fa-github"></i> {author.githubLogin}
                      </a>
                    )}
                    {author.email && (
                      <p className="text-[0.68rem] text-dark-text3 mt-0.5 truncate">{author.email}</p>
                    )}
                    {author.universityId && (
                      <p className="text-[0.66rem] text-dark-text3">ID: {author.universityId}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-5 pb-5">
                <p className="text-[0.78rem] text-dark-text3 text-center py-3">No author information available.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
