'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import type { StudioApp } from '@/lib/studio-apps';
import { APP_ID_REGEX } from '@/lib/studio-apps';

const ICON_CHOICES = [
  'apps', 'calculate', 'checklist', 'code', 'color_lens', 'compress', 'construction',
  'dashboard', 'description', 'draw', 'edit', 'extension', 'fact_check',
  'format_list_bulleted', 'gesture', 'grid_view', 'hub', 'image', 'lightbulb',
  'local_library', 'palette', 'pdf', 'quiz', 'science', 'school', 'document_scanner',
  'search', 'settings', 'spellcheck', 'sticky_note_2', 'summarize', 'table_chart',
  'translate', 'widgets', 'work',
];

const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

interface PublishFile {
  path: string;
  content: string; // base64
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function AppIcon({ app, className = 'text-xl' }: { app: StudioApp; className?: string }) {
  if (app.iconSvg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={app.iconSvg} alt="" className="h-6 w-6 object-contain" />;
  }
  return <span className={`material-symbols-outlined ${className}`}>{app.icon}</span>;
}

export default function StudioPage() {
  const profile = useAppStore((s) => s.profile);

  const [apps, setApps] = useState<StudioApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showContribute, setShowContribute] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/studio-apps/registry')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && Array.isArray(data.apps)) setApps(data.apps);
      })
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      [a.title, a.subtitle, a.description, a.author?.name, a.author?.githubLogin]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [apps, query]);

  const githubConnected = !!profile?.githubLogin;

  return (
    <div className="min-h-[60vh]">
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-dark-text">
              <span className="material-symbols-outlined text-qsis align-middle mr-2">construction</span>
              Studio
            </h1>
            <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-xl">
              Free tools for students and users — plus community-built apps contributed straight from GitHub.
              Everything runs in your browser and stays on your device.
            </p>
          </div>
          <button
            onClick={() => setShowContribute(true)}
            className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white transition hover:brightness-110 cursor-pointer"
          >
            <span className="material-symbols-outlined align-middle mr-1 text-[1rem]">add_box</span>
            Contribute an app
          </button>
        </div>

        <div className="relative mt-4 max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[1.1rem]">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            className="w-full rounded-xl border border-dark-border bg-dark-bg2 py-2.5 pl-10 pr-4 text-[0.82rem] text-dark-text outline-none transition focus:border-qsis placeholder:text-dark-text3"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-dark-border bg-dark-bg2 p-5 animate-pulse">
              <div className="w-12 h-12 rounded-2xl bg-dark-bg3 mb-3"></div>
              <div className="h-4 w-2/3 bg-dark-bg3 rounded mb-2"></div>
              <div className="h-3 w-full bg-dark-bg3 rounded"></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-dark-text2">
          <span className="material-symbols-outlined text-4xl text-dark-text3 mb-2">search_off</span>
          <p className="text-sm">No apps match “{query}”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((app) => (
            <Link
              key={app.id}
              href={app.source === 'builtin' && app.path ? app.path : `/studio/app/${app.id}`}
              className="group rounded-2xl border border-dark-border bg-dark-bg2 p-5 hover:border-qsis/50 hover:bg-dark-bg3 transition-all no-underline"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="h-12 w-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
                  <AppIcon app={app} />
                </div>
                {app.source === 'community' && (
                  <span className="rounded-full border border-emerald-700/40 bg-emerald-900/20 px-2.5 py-0.5 text-[0.6rem] font-medium text-emerald-300">
                    Community
                  </span>
                )}
              </div>
              <h3 className="text-[0.9rem] font-bold text-dark-text mb-1 flex items-center gap-2">
                {app.title}
                <span className="material-symbols-outlined text-dark-text3 group-hover:text-qsis text-[0.95rem] transition-colors">arrow_forward</span>
              </h3>
              <p className="text-[0.72rem] text-dark-text2 leading-relaxed">{app.subtitle || app.description}</p>
              {app.author && (
                <p className="mt-2 text-[0.66rem] text-dark-text3 flex items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://github.com/${app.author.githubLogin}.png`} alt="" className="h-4 w-4 rounded-full" />
                  by {app.author.name}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {showContribute && (
        <ContributeModal
          profile={profile}
          onClose={() => setShowContribute(false)}
          onPublished={(id) => {
            setShowContribute(false);
            fetch('/api/studio-apps/registry')
              .then((res) => res.json())
              .then((data) => Array.isArray(data.apps) && setApps(data.apps))
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function ContributeModal({
  profile,
  onClose,
  onPublished,
}: {
  profile: any;
  onClose: () => void;
  onPublished: (id: string) => void;
}) {
  const githubConnected = !!profile?.githubLogin;

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [id, setId] = useState('');
  const [icon, setIcon] = useState('extension');
  const [iconCustom, setIconCustom] = useState(false);
  const [iconSvg, setIconSvg] = useState('');
  const [files, setFiles] = useState<PublishFile[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const idx = result.indexOf('base64,');
        resolve(idx >= 0 ? result.slice(idx + 7) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handlePickFolder = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError('');
    const entries: PublishFile[] = [];
    let total = 0;
    for (const file of Array.from(list)) {
      let path = file.webkitRelativePath || file.name;
      const parts = path.split('/');
      if (parts.length > 1) path = parts.slice(1).join('/'); // drop the chosen root folder
      if (!path || path.includes('..')) continue;
      if (file.size > 0) {
        const b64 = await readAsBase64(file);
        total += file.size;
        if (total > MAX_TOTAL_BYTES) {
          setError('Total app size exceeds 8 MB.');
          return;
        }
        entries.push({ path, content: b64 });
      }
    }
    setFiles(entries);
    setFileNames(entries.map((e) => e.path));
    setTotalBytes(total);
  };

  const submit = async () => {
    setError('');
    const finalTitle = title.trim();
    const finalId = (id.trim().toLowerCase() || slugify(finalTitle));
    if (!finalTitle) return setError('Give your app a title.');
    if (!APP_ID_REGEX.test(finalId)) return setError('App ID must be 2–30 lowercase letters, numbers and dashes.');
    if (!files.some((f) => f.path.toLowerCase().endsWith('.html'))) {
      return setError('The app needs at least one HTML file (e.g. index.html). Pick your dist folder.');
    }
    if (!iconCustom && !/^[a-z0-9_]{2,40}$/.test(icon)) return setError('Pick a valid icon.');

    setPublishing(true);
    try {
      const res = await fetch('/api/studio-apps/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: finalId,
          title: finalTitle,
          subtitle: subtitle.trim(),
          description: description.trim(),
          icon: iconCustom ? '' : icon,
          iconSvg: iconCustom && iconSvg ? iconSvg : '',
          files,
          author: {
            name: profile?.name || profile?.email?.split('@')[0] || '',
            githubLogin: profile?.githubLogin || '',
            email: profile?.email || '',
            universityId: profile?.universityId || '',
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Publish failed. Please try again.');
        setPublishing(false);
        return;
      }
      setPublishedId(data.id || finalId);
      setPublishing(false);
      onPublished(data.id || finalId);
    } catch {
      setError('Network error — please try again.');
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-dark-border bg-dark-bg2 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {publishedId ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-emerald-400 text-3xl">check_circle</span>
            </div>
            <h3 className="text-lg font-bold text-dark-text mb-1">App published!</h3>
            <p className="text-[0.78rem] text-dark-text2 mb-5">
              It may take a minute to appear in Studio while GitHub syncs. You&apos;re now listed as a code contributor.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href={`/studio/app/${publishedId}`}
                className="rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white no-underline hover:brightness-110"
              >
                Open it
              </Link>
              <button
                onClick={onClose}
                className="rounded-xl border border-dark-border bg-dark-bg3 px-4 py-2 text-[0.78rem] font-medium text-dark-text cursor-pointer hover:border-qsis"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-dark-text">
                <span className="material-symbols-outlined text-qsis align-middle mr-2">add_box</span>
                Contribute an app
              </h3>
              <button onClick={onClose} className="text-dark-text3 hover:text-rose-400 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {!githubConnected ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[0.78rem] text-dark-text2 leading-relaxed">
                <span className="material-symbols-outlined text-amber-400 align-middle mr-1 text-[1rem]">link_off</span>
                <strong className="text-amber-400">Connect GitHub to contribute.</strong> Your app is published to the
                QSIS-ARMS-v2 repo with your name, and you get credited as a code contributor.
                Connect your GitHub account from your{' '}
                <Link href="/dashboard" className="text-qsis underline" onClick={onClose}>Dashboard</Link> first.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[0.68rem] text-dark-text2 mb-1">App title *</label>
                    <input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (!id) setId(slugify(e.target.value));
                      }}
                      placeholder="e.g. QR Code Generator"
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.68rem] text-dark-text2 mb-1">App ID (slug)</label>
                    <input
                      value={id}
                      onChange={(e) => setId(slugify(e.target.value))}
                      placeholder="qr-code-generator"
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-[0.68rem] text-dark-text2 mb-1">Subtitle</label>
                  <input
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="One short line shown on the card"
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-[0.68rem] text-dark-text2 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="What does your app do?"
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis resize-none"
                  />
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[0.68rem] text-dark-text2">Icon</label>
                    <button
                      onClick={() => {
                        setIconCustom(!iconCustom);
                        setIconSvg('');
                      }}
                      className="text-[0.68rem] text-qsis hover:underline cursor-pointer"
                    >
                      {iconCustom ? 'Use a Material icon' : 'Upload custom SVG'}
                    </button>
                  </div>
                  {iconCustom ? (
                    <label className="flex items-center gap-2 rounded-lg border border-dashed border-dark-border bg-dark-bg px-3 py-2.5 cursor-pointer hover:border-qsis">
                      <span className="material-symbols-outlined text-dark-text3 text-[1rem]">upload_file</span>
                      <span className="text-[0.72rem] text-dark-text2">
                        {iconSvg ? 'SVG selected' : 'Upload an SVG icon (≤32 KB)'}
                      </span>
                      <input
                        type="file"
                        accept="image/svg+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const b64 = await readAsBase64(f);
                            setIconSvg(`data:image/svg+xml;base64,${b64}`);
                          }
                        }}
                      />
                    </label>
                  ) : (
                    <>
                      <input
                        value={icon}
                        onChange={(e) => setIcon(e.target.value)}
                        placeholder="Material icon name, e.g. qr_code"
                        className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis mb-1.5"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {ICON_CHOICES.map((name) => (
                          <button
                            key={name}
                            onClick={() => setIcon(name)}
                            className={`h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer transition ${
                              icon === name
                                ? 'bg-qsis/25 text-qsis border border-qsis/50'
                                : 'bg-dark-bg border border-dark-border text-dark-text2 hover:border-qsis'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[1rem]">{name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-[0.68rem] text-dark-text2 mb-1.5">Build files (dist folder) *</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePickFolder(e.target.files)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-dark-border bg-dark-bg px-3 py-3 text-[0.74rem] text-dark-text2 cursor-pointer hover:border-qsis transition"
                  >
                    <span className="material-symbols-outlined align-middle mr-1 text-[1rem]">folder_open</span>
                    Choose your dist folder (any static build — React, plain HTML, etc.)
                  </button>
                  {fileNames.length > 0 && (
                    <div className="mt-2 rounded-lg border border-dark-border bg-dark-bg p-3 max-h-28 overflow-y-auto">
                      <p className="text-[0.66rem] text-dark-text3 mb-1.5">
                        {fileNames.length} files · {(totalBytes / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {fileNames.slice(0, 30).map((n) => (
                          <span key={n} className="rounded bg-dark-bg3 px-1.5 py-0.5 text-[0.62rem] text-dark-text2">
                            {n}
                          </span>
                        ))}
                        {fileNames.length > 30 && (
                          <span className="text-[0.62rem] text-dark-text3">+{fileNames.length - 30} more</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="mb-3 text-[0.74rem] text-rose-400"><span className="material-symbols-outlined align-middle mr-1 text-[1rem]">error</span>{error}</p>
                )}

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.62rem] text-dark-text3 leading-snug max-w-[220px]">
                    Published to the QSIS-ARMS-v2 repo under your GitHub identity — you&apos;ll appear in Contributors.
                  </p>
                  <button
                    onClick={submit}
                    disabled={publishing}
                    className="rounded-xl bg-qsis px-5 py-2.5 text-[0.8rem] font-semibold text-white cursor-pointer transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {publishing ? 'Publishing…' : 'Publish'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
