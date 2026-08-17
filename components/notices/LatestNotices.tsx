'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Notice } from '@/lib/notices';
import { CATEGORY_META } from '@/lib/notices';

export default function LatestNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

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
            .slice(0, 3);
          setNotices(sorted);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || notices.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[0.8rem] font-bold text-dark-text flex items-center gap-1.5">
          <i className="fas fa-bullhorn text-amber-400"></i> Latest Notices
        </h3>
        <Link href="/notices" className="text-[0.72rem] text-qsis hover:underline no-underline">View All</Link>
      </div>
      <div className="space-y-1.5">
        {notices.map(n => {
          const meta = CATEGORY_META[n.category];
          const content = (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-dark-bg2 border border-dark-border hover:border-amber-500/30 transition-colors">
              <span className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                <i className={`${meta.icon} ${meta.color} text-[0.7rem]`}></i>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.78rem] font-semibold text-dark-text truncate">{n.title}</span>
                  {n.pinned && <i className="fas fa-thumbtack text-qsis text-[0.55rem]"></i>}
                </div>
                {n.description && <p className="text-[0.68rem] text-dark-text3 truncate">{n.description}</p>}
              </div>
              <i className="fas fa-chevron-right text-[0.6rem] text-dark-text3 shrink-0"></i>
            </div>
          );

          if (n.link) {
            return <a key={n.id} href={n.link} target="_blank" rel="noopener noreferrer" className="block no-underline">{content}</a>;
          }
          return <Link key={n.id} href="/notices" className="block no-underline">{content}</Link>;
        })}
      </div>
    </div>
  );
}
