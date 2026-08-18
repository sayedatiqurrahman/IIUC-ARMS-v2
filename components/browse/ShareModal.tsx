'use client';

import { useState, useCallback } from 'react';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.vercel.app';

export interface ShareItem {
  title: string;
  subtitle?: string;
  url: string;
  type: 'course' | 'file';
  githubPath?: string;
  treeItems?: { path: string; type: string; size?: number }[];
}

function enc(t: string) { return encodeURIComponent(t); }

const SOCIAL = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#25D366', getUrl: (u: string, t: string) => `https://wa.me/?text=${enc(t + '\n' + u)}` },
  { key: 'telegram', label: 'Telegram', icon: 'fab fa-telegram-plane', color: '#0088cc', getUrl: (u: string, t: string) => `https://t.me/share/url?url=${enc(u)}&text=${enc(t)}` },
  { key: 'facebook', label: 'Facebook', icon: 'fab fa-facebook-f', color: '#1877F2', getUrl: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}` },
  { key: 'twitter', label: 'X / Twitter', icon: 'fab fa-x-twitter', color: '#1DA1F2', getUrl: (u: string, t: string) => `https://twitter.com/intent/tweet?url=${enc(u)}&text=${enc(t)}` },
  { key: 'linkedin', label: 'LinkedIn', icon: 'fab fa-linkedin-in', color: '#0A66C2', getUrl: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}` },
  { key: 'reddit', label: 'Reddit', icon: 'fab fa-reddit-alien', color: '#FF4500', getUrl: (u: string, t: string) => `https://reddit.com/submit?url=${enc(u)}&title=${enc(t)}` },
  { key: 'email', label: 'Email', icon: 'fas fa-envelope', color: '#EA4335', getUrl: (u: string, t: string) => `mailto:?subject=${enc(t)}&body=${enc(u)}` },
];

export default function ShareModal({ item, onClose }: { item: ShareItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState('');

  const shareText = item.type === 'course'
    ? `${item.title} \u2014 IIUC-ARMS Academic Files`
    : `${item.title} \u2014 IIUC-ARMS`;

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text: shareText, url: item.url });
        onClose();
      } catch {}
    }
  }, [item, shareText, onClose]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [item.url]);

  const handleDownloadZip = useCallback(async () => {
    if (!item.githubPath || !item.treeItems?.length) return;
    setDownloading(true);
    setDlProgress('Preparing files\u2026');
    try {
      const { zipSync } = await import('fflate');
      const files = item.treeItems!.filter(t => t.type === 'blob');
      if (files.length === 0) { setDlProgress('No files found'); setDownloading(false); return; }

      const basePath = item.githubPath!;
      const owner = process.env.NEXT_PUBLIC_GITHUB_OWNER || 'sayedatiqurrahman';
      const repo = process.env.NEXT_PUBLIC_GITHUB_REPO || 'IIUC-ACADEMIC-FILES-MANAFGER';
      const branch = process.env.NEXT_PUBLIC_GITHUB_BRANCH || 'main';

      const fileData: Record<string, Uint8Array> = {};
      let done = 0;
      const total = files.length;
      const BATCH = 5;

      for (let i = 0; i < files.length; i += BATCH) {
        const batch = files.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(async (f) => {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f.path}`;
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error(`${res.status}`);
            const buf = await res.arrayBuffer();
            return { path: f.path.slice(basePath.length).replace(/^\//, ''), data: new Uint8Array(buf) };
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled') fileData[r.value.path] = r.value.data;
          done++;
          setDlProgress(`Downloading ${done}/${total}\u2026`);
        }
      }

      if (Object.keys(fileData).length === 0) {
        setDlProgress('Failed to download files');
        setDownloading(false);
        return;
      }

      setDlProgress('Creating ZIP\u2026');
      const zipped = zipSync(fileData, { level: 0 });
      const blob = new Blob([zipped], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDlProgress('Downloaded!');
      setTimeout(() => { setDownloading(false); setDlProgress(''); onClose(); }, 1200);
    } catch (e: any) {
      setDlProgress(`Error: ${e?.message || 'Failed'}`);
      setTimeout(() => setDownloading(false), 3000);
    }
  }, [item, onClose]);

  const openApp = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-dark-bg2 rounded-t-2xl sm:rounded-2xl border border-dark-border overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-dark-border">
          <div className="min-w-0">
            <h3 className="text-[0.9rem] font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-share-alt text-qsis"></i> Share
            </h3>
            <p className="text-[0.7rem] text-dark-text3 truncate mt-0.5">{item.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text2 border-none cursor-pointer shrink-0">
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        {/* Native Share (mobile) */}
        {typeof navigator !== 'undefined' && (navigator as any).share && (
          <div className="px-5 pt-3">
            <button onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:brightness-110 transition cursor-pointer border-none">
              <i className="fas fa-share-from-square"></i> Share via your device
            </button>
          </div>
        )}

        {/* Social Platforms */}
        <div className="px-5 pt-3 pb-2">
          <p className="text-[0.68rem] text-dark-text3 mb-2 font-medium uppercase tracking-wider">Share to</p>
          <div className="grid grid-cols-4 gap-2">
            {SOCIAL.map(s => (
              <button key={s.key} onClick={() => openApp(s.getUrl(item.url, shareText))}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl hover:bg-dark-bg3 transition cursor-pointer border-none bg-transparent">
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg" style={{ backgroundColor: s.color }}>
                  <i className={s.icon}></i>
                </span>
                <span className="text-[0.62rem] text-dark-text2">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Copy Link */}
        <div className="px-5 py-3">
          <div className="flex items-center gap-2 p-2 rounded-xl bg-dark-bg3 border border-dark-border">
            <input readOnly value={item.url} className="flex-1 min-w-0 px-2 py-1 bg-transparent text-[0.75rem] text-dark-text2 outline-none border-none" />
            <button onClick={handleCopyLink}
              className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold border-none cursor-pointer transition shrink-0 ${copied ? 'bg-green-500 text-white' : 'bg-qsis text-white hover:brightness-110'}`}>
              <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} mr-1`}></i>{copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Download */}
        {item.type === 'course' && item.githubPath && item.treeItems && item.treeItems.length > 0 && (
          <div className="px-5 pb-4">
            <button onClick={handleDownloadZip} disabled={downloading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-[0.8rem] font-semibold hover:border-qsis/40 transition cursor-pointer disabled:opacity-60">
              {downloading ? (
                <><i className="fas fa-spinner fa-spin text-qsis"></i><span>{dlProgress}</span></>
              ) : (
                <><i className="fas fa-file-zipper text-amber-400"></i>Download as ZIP ({item.treeItems.filter(t => t.type === 'blob').length} files)</>
              )}
            </button>
          </div>
        )}
        {item.type === 'file' && (
          <div className="px-5 pb-4">
            {item.githubPath ? (
              <a href={`https://raw.githubusercontent.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER || 'sayedatiqurrahman'}/${process.env.NEXT_PUBLIC_GITHUB_REPO || 'IIUC-ACADEMIC-FILES-MANAFGER'}/${process.env.NEXT_PUBLIC_GITHUB_BRANCH || 'main'}/${item.githubPath}`} download={item.title}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-[0.8rem] font-semibold hover:border-qsis/40 transition no-underline">
                <i className="fas fa-download text-amber-400"></i>Download file
              </a>
            ) : (
              <a href={item.url} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text text-[0.8rem] font-semibold hover:border-qsis/40 transition no-underline">
                <i className="fas fa-external-link-alt text-blue-400"></i>Open in IIUC-ARMS
              </a>
            )}
          </div>
        )}

        {/* IIUC-ARMS branding */}
        <div className="px-5 pb-4">
          <p className="text-center text-[0.6rem] text-dark-text3">
            Shared from <span className="font-semibold text-dark-text2">IIUC-ARMS</span> &middot; {SITE_URL}
          </p>
        </div>
      </div>
    </div>
  );
}
