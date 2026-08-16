'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import type { StudioApp } from '@/lib/studio-apps';
import ContributeModal from '@/components/studio/ContributeModal';

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
