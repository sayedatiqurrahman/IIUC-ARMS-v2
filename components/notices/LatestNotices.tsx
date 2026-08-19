'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { Notice } from '@/lib/notices';
import { CATEGORY_META } from '@/lib/notices';

const STORAGE_KEY = 'iiuc_arms-show-notices-ticker';

function getTickerKey(email: string) {
  return email ? `${STORAGE_KEY}:${email}` : STORAGE_KEY;
}

export function isNoticesTickerVisible(email: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem(getTickerKey(email));
    if (val === null) return true; // default: visible
    return val === 'true';
  } catch { return true; }
}

export function setNoticesTickerVisible(email: string, visible: boolean) {
  try {
    localStorage.setItem(getTickerKey(email), String(visible));
  } catch {}
}

export default function LatestNotices() {
  const { data: session } = useSession();
  const email = session?.user?.email || '';
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Check localStorage preference
  useEffect(() => {
    setVisible(isNoticesTickerVisible(email));
  }, [email]);

  useEffect(() => {
    fetch('/api/notices')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const sorted = data.notices
            .sort((a: Notice, b: Notice) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
            })
            .slice(0, 5);
          setNotices(sorted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const dismiss = () => {
    setVisible(false);
    setNoticesTickerVisible(email, false);
  };

  if (loading || notices.length === 0 || !visible) return null;

  return (
    <div className="mb-3 relative group/ticker">
      <div
        className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Label + dismiss */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-amber-500/10">
          <i className="fas fa-bullhorn text-amber-400 text-[0.65rem]"></i>
          <span className="text-[0.65rem] font-semibold text-amber-400 uppercase tracking-wider">Latest Notices</span>
          <div className="flex-1"></div>
          <Link href="/notices" className="text-[0.62rem] text-qsis hover:underline no-underline mr-1">View All</Link>
          <button onClick={dismiss} className="w-5 h-5 rounded-full bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-red-400 cursor-pointer border-none opacity-0 group-hover/ticker:opacity-100 transition-opacity" title="Hide notices ticker">
            <i className="fas fa-times text-[0.5rem]"></i>
          </button>
        </div>

        {/* Marquee track */}
        <div className="relative h-9 flex items-center">
          <div
            ref={trackRef}
            className="flex items-center gap-6 whitespace-nowrap animate-marquee"
            style={{ animationPlayState: paused ? 'paused' : 'running' }}
          >
            {/* Duplicate for seamless loop */}
            {[...notices, ...notices].map((n, i) => {
              const meta = CATEGORY_META[n.category];
              const content = (
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-amber-500/10 transition-colors cursor-pointer">
                  <span className={`w-5 h-5 rounded ${meta.bg} flex items-center justify-center shrink-0`}>
                    <i className={`${meta.icon} ${meta.color} text-[0.5rem]`}></i>
                  </span>
                  <span className="text-[0.72rem] font-medium text-dark-text truncate max-w-[200px]">{n.title}</span>
                  {n.pinned && <i className="fas fa-thumbtack text-qsis text-[0.45rem]" />}
                  <span className="text-[0.55rem] text-dark-text3">{new Date(n.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </span>
              );

              if (n.link) {
                return (
                  <a key={`${n.id}-${i}`} href={n.link} target="_blank" rel="noopener noreferrer" className="no-underline shrink-0">
                    {content}
                  </a>
                );
              }
              return (
                <Link key={`${n.id}-${i}`} href="/notices" className="no-underline shrink-0">
                  {content}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
