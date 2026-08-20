'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { StudioApp } from '@/lib/studio-apps';
import { APP_ID_REGEX } from '@/lib/studio-apps';
import { commitBase64FilesToGitHub, textToBase64 } from '@/lib/gh-upload-client';

const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

// Community apps live in the IIUC-ARMS-v2 repo under apps/<id>/ and are listed
// in studio-apps.json at the repo root. The browser commits there directly.
const STUDIO_OWNER = 'sayedatiqurrahman';
const STUDIO_REPO_NAME = 'IIUC-ARMS-v2';
const STUDIO_BRANCH = 'main';
const STUDIO_REGISTRY_PATH = 'studio-apps.json';
const STUDIO_APPS_PATH = 'apps';

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

export default function ContributeModal({
  profile,
  initial,
  onClose,
  onPublished,
}: {
  profile: any;
  initial?: StudioApp | null;
  onClose: () => void;
  onPublished: (id: string) => void;
}) {
  const isUpdate = !!initial;
  const githubConnected = !!profile?.githubLogin;

  const [title, setTitle] = useState(initial?.title || '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [id, setId] = useState(initial?.id || '');
  const [icon, setIcon] = useState(initial?.icon || 'extension');
  const [iconCustom, setIconCustom] = useState(!!initial?.iconSvg);
  const [iconSvg, setIconSvg] = useState(initial?.iconSvg || '');
  const [files, setFiles] = useState<PublishFile[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishLabel, setPublishLabel] = useState('');
  const [publishedId, setPublishedId] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Allow picking a whole dist folder instead of individual files.
  useEffect(() => {
    if (fileInputRef.current) {
      (fileInputRef.current as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
      (fileInputRef.current as HTMLInputElement & { directory: boolean }).directory = true;
    }
  }, []);

  // Searchable Material icon picker.
  const [iconSearch, setIconSearch] = useState('');
  const [iconResults, setIconResults] = useState<string[]>([]);
  const [iconLoading, setIconLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setIconLoading(true);
    const q = iconSearch.trim().toLowerCase();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/studio-apps/icons?limit=72&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (active && Array.isArray(data.icons)) setIconResults(data.icons);
      } catch {}
      if (active) setIconLoading(false);
    }, q ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [iconSearch]);

  const readAsBase64 = async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length !== file.size) throw new Error(`Failed to read ${file.name}`);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
    }
    const b64 = btoa(bin);
    if (atob(b64).length !== file.size) throw new Error(`Failed to read ${file.name}`);
    return b64;
  };

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
    const finalId = isUpdate && initial ? initial.id : id.trim().toLowerCase() || slugify(finalTitle);
    if (!finalTitle) return setError('Give your app a title.');
    if (!APP_ID_REGEX.test(finalId)) return setError('App ID must be 2–30 lowercase letters, numbers and dashes.');
    if (!isUpdate && !files.some((f) => f.path.toLowerCase().endsWith('.html'))) {
      return setError('The app needs at least one HTML file (e.g. index.html). Pick your dist folder.');
    }
    if (!iconCustom && !/^[a-z0-9_]{2,40}$/.test(icon)) return setError('Pick a valid icon.');

    const author = {
      name: profile?.name || profile?.email?.split('@')[0] || '',
      githubLogin: profile?.githubLogin || '',
      email: profile?.email || '',
      universityId: profile?.universityId || '',
    };

    setPublishing(true);
    try {
      // 1. Browser-safe token: the user's OWN PAT when available, else a fresh
      //    GitHub App bot token. Only the token crosses our server — the files
      //    and the commit go straight to GitHub from this browser.
      setPublishLabel('Getting a GitHub token…');
      const tokenRes = await fetch('/api/studio-apps/publish-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: profile?.githubToken || '' }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        setError(tokenData.error || 'Could not get a GitHub token. Please try again in a minute.');
        setPublishing(false);
        return;
      }
      if (tokenData.needsServer) {
        setError('Publishing is temporarily unavailable on the server. Please try again in a minute.');
        setPublishing(false);
        return;
      }
      const token = tokenData.token as string;
      const fallbackToken = tokenData.fallbackToken as string | undefined;

      // 2. Merge into the live registry (guards against a taken ID and lets an
      //    update keep its original addedAt).
      setPublishLabel('Checking the apps registry…');
      const regRes = await fetch(`https://raw.githubusercontent.com/${STUDIO_OWNER}/${STUDIO_REPO_NAME}/${STUDIO_BRANCH}/${STUDIO_REGISTRY_PATH}`, { cache: 'no-store' });
      let registry: { version: number; apps: any[] } = { version: 1, apps: [] };
      if (regRes.ok) {
        const parsed = await regRes.json().catch(() => null);
        if (parsed && Array.isArray(parsed.apps)) registry = { version: Number(parsed.version) || 1, apps: parsed.apps };
      }
      const existingIndex = registry.apps.findIndex((a) => a.id === finalId);
      const updateExisting = existingIndex >= 0;
      if (updateExisting) {
        const existing = registry.apps[existingIndex];
        const sameAuthor =
          (existing.author?.githubLogin && existing.author.githubLogin === author.githubLogin) ||
          (existing.author?.email && existing.author.email.toLowerCase() === author.email.toLowerCase());
        if (!sameAuthor) {
          setError('That app ID is already taken by another contributor.');
          setPublishing(false);
          return;
        }
      }

      let entry = 'index.html';
      if (files.length > 0) {
        entry = files.some((f) => f.path.toLowerCase() === 'index.html')
          ? 'index.html'
          : files.find((f) => f.path.toLowerCase().endsWith('.html'))?.path || 'index.html';
      } else if (updateExisting) {
        entry = registry.apps[existingIndex].entry || 'index.html';
      }

      const now = new Date().toISOString();
      const registryEntry = {
        id: finalId,
        title: finalTitle,
        subtitle: subtitle.trim(),
        description: description.trim(),
        icon: iconCustom ? '' : icon,
        ...(iconCustom && iconSvg ? { iconSvg } : {}),
        source: 'community',
        entry,
        author,
        addedAt: updateExisting ? registry.apps[existingIndex].addedAt || now : now,
      };
      if (updateExisting) registry.apps[existingIndex] = registryEntry;
      else registry.apps.push(registryEntry);

      // 3. Commit apps/<id>/… + the merged registry DIRECTLY to GitHub.
      const commitFiles = files.map((f) => ({
        path: `${STUDIO_APPS_PATH}/${finalId}/${f.path}`,
        content: f.content,
      }));
      commitFiles.push({
        path: STUDIO_REGISTRY_PATH,
        content: textToBase64(JSON.stringify({ version: registry.version, apps: registry.apps }, null, 2)),
      });

      const identity = author.githubLogin
        ? { name: author.name || author.githubLogin, email: `${author.githubLogin}@users.noreply.github.com` }
        : { name: author.name, email: author.email };

      const res = await commitBase64FilesToGitHub({
        token,
        ...(fallbackToken ? { fallbackToken } : {}),
        owner: STUDIO_OWNER,
        repo: STUDIO_REPO_NAME,
        files: commitFiles,
        message: `feat(studio-apps): ${updateExisting ? 'update' : 'add'} "${finalTitle}" by ${author.name}`,
        author: identity,
        onProgress: (_p, label) => setPublishLabel(label),
      });
      if (!res.success) {
        setError(res.error || (isUpdate ? 'Update failed. Please try again.' : 'Publish failed. Please try again.'));
        setPublishing(false);
        return;
      }

      // 4. Drop the server's 60s registry / 10-min file caches so the app shows
      //    up immediately (best effort — the commit itself is already done).
      fetch('/api/studio-apps/revalidate', { method: 'POST' }).catch(() => {});
      setPublishedId(finalId);
      setPublishing(false);
      onPublished(finalId);
    } catch {
      setError('Network error — please try again.');
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-dark-border bg-dark-bg2 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {publishedId ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-emerald-400 text-3xl">check_circle</span>
            </div>
            <h3 className="text-lg font-bold text-dark-text mb-1">
              {isUpdate ? 'App updated!' : 'App published!'}
            </h3>
            <p className="text-[0.78rem] text-dark-text2 mb-5">
              {isUpdate
                ? 'Your changes are pushed to GitHub — they may take a minute to sync into Studio.'
                : 'It may take a minute to appear in Studio while GitHub syncs. You\'re now listed as a code contributor.'}
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
                <span className="material-symbols-outlined text-qsis align-middle mr-2">
                  {isUpdate ? 'update' : 'add_box'}
                </span>
                {isUpdate ? 'Update app' : 'Contribute an app'}
              </h3>
              <button onClick={onClose} className="text-dark-text3 hover:text-rose-400 cursor-pointer">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {!githubConnected ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-[0.78rem] text-dark-text2 leading-relaxed">
                <span className="material-symbols-outlined text-amber-400 align-middle mr-1 text-[1rem]">link_off</span>
                <strong className="text-amber-400">Connect GitHub to contribute.</strong> Your app is published to the
                IIUC-ARMS-v2 repo with your name, and you get credited as a code contributor.
                Connect your Personal Access Token from your{' '}
                <Link href="/dashboard?section=github" className="text-qsis underline" onClick={onClose}>Dashboard</Link> first.
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
                        if (!id && !isUpdate) setId(slugify(e.target.value));
                      }}
                      placeholder="e.g. QR Code Generator"
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.68rem] text-dark-text2 mb-1">App ID (slug)</label>
                    <input
                      value={id}
                      disabled={isUpdate}
                      onChange={(e) => setId(slugify(e.target.value))}
                      placeholder="qr-code-generator"
                      className="w-full rounded-lg border border-dark-border bg-dark-bg px-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <div className="relative mb-1.5">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-dark-text3 text-[1rem]">search</span>
                        <input
                          value={iconSearch}
                          onChange={(e) => setIconSearch(e.target.value)}
                          placeholder="Search any Material icon…"
                          className="w-full rounded-lg border border-dark-border bg-dark-bg pl-9 pr-2.5 py-2 text-[0.78rem] text-dark-text outline-none focus:border-qsis"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-dark-border bg-dark-bg p-2 mb-1">
                        {iconLoading ? (
                          <p className="text-[0.7rem] text-dark-text3 text-center py-2">Searching…</p>
                        ) : iconResults.length === 0 ? (
                          <p className="text-[0.7rem] text-dark-text3 text-center py-2">No icons match “{iconSearch}”.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {iconResults.map((name) => (
                              <button
                                key={name}
                                onClick={() => setIcon(name)}
                                title={name}
                                className={`h-9 w-9 rounded-lg flex items-center justify-center cursor-pointer transition ${
                                  icon === name
                                    ? 'bg-qsis/25 text-qsis border border-qsis/50'
                                    : 'bg-dark-bg2 border border-dark-border text-dark-text2 hover:border-qsis'
                                }`}
                              >
                                <span className="material-symbols-outlined text-[1.05rem]">{name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[0.62rem] text-dark-text3 truncate">
                        Selected: <span className="text-qsis font-medium">{icon}</span>
                      </p>
                    </>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-[0.68rem] text-dark-text2 mb-1.5">
                    Build files (dist folder){isUpdate ? ' (optional)' : ' *'}
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePickFolder(e.target.files)}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragging(false);
                      handlePickFolder(e.dataTransfer.files);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                    }}
                    className={`w-full rounded-xl border-2 border-dashed px-4 py-10 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 ${
                      dragging
                        ? 'border-qsis bg-qsis/10'
                        : 'border-dark-border bg-dark-bg hover:border-qsis/50 hover:bg-dark-bg3'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined text-3xl mb-1 ${
                        dragging ? 'text-qsis' : 'text-dark-text3'
                      }`}
                    >
                      cloud_upload
                    </span>
                    <p className="text-[0.84rem] font-semibold text-dark-text">
                      {dragging ? 'Drop it here' : 'Drag & drop your dist folder'}
                    </p>
                    <p className="text-[0.72rem] text-dark-text2">
                      or <span className="text-qsis underline">browse for a folder</span>
                    </p>
                    <p className="text-[0.62rem] text-dark-text3">
                      Any static build — React, plain HTML, Vite, Next.js export · up to 8 MB
                    </p>
                  </div>
                  {isUpdate && files.length === 0 && (
                    <p className="mt-1.5 text-[0.66rem] text-dark-text3">
                      Skip to keep the current build — this only updates the app details.
                    </p>
                  )}
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
                    Published to the IIUC-ARMS-v2 repo under your GitHub identity — you&apos;ll appear in Contributors.
                  </p>
                  <button
                    onClick={submit}
                    disabled={publishing}
                    className="rounded-xl bg-qsis px-5 py-2.5 text-[0.8rem] font-semibold text-white cursor-pointer transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {publishing ? (isUpdate ? 'Updating…' : 'Publishing…') : isUpdate ? 'Save changes' : 'Publish'}
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
