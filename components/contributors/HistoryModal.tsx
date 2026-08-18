'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';

interface HistoryEvent {
  type: 'commit' | 'pr';
  repo: 'code' | 'data';
  repoLabel: string;
  sha?: string;
  shortSha?: string;
  number?: number;
  title: string;
  message?: string;
  state?: string;
  date: string;
  url: string;
}

const PAGE_SIZE = 10;

const REPO_META: Record<string, { icon: string; color: string; label: string }> = {
  code: { icon: 'fa-laptop-code', color: 'text-blue-400', label: 'Code' },
  data: { icon: 'fa-book-open', color: 'text-orange-400', label: 'Data' },
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function HistoryModal({ c, onClose }: { c: any; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [allEvents, setAllEvents] = useState<HistoryEvent[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [prCount, setPrCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!c) return;
    let active = true;
    setLoading(true);
    setError('');
    setAllEvents([]);
    setVisibleCount(PAGE_SIZE);
    fetch(`/api/contributors/history?login=${encodeURIComponent(c.login)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) {
          setError(d.error);
          return;
        }
        setAllEvents(d.events || []);
        setCommitCount(d.commitCount || 0);
        setPrCount(d.prCount || 0);
      })
      .catch(() => {
        if (active) setError('Failed to load history');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [c, reloadKey]);

  const events = allEvents.slice(0, visibleCount);
  const hasMore = visibleCount < allEvents.length;

  function loadMore() {
    if (!hasMore) return;
    setLoadingMore(true);
    // Simulate brief loading for UX feedback
    setTimeout(() => {
      setVisibleCount((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 300);
  }

  return (
    <Modal
      isOpen={!!c}
      onClose={onClose}
      title={`${c?.name || c?.login || ''}'s Contribution History`}
      className="max-w-[640px]"
    >
      <div>
        {allEvents.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 pt-3 pb-1">
            <span className="text-[0.7rem] font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full" title="Commits made by this user across the source-code repo and the data repo — every commit counts as 1.">
              <i className="fas fa-code-commit mr-1"></i>{commitCount} Commits
            </span>
            <span className="text-[0.7rem] font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-full" title="Pull requests this user opened — counted across both repos.">
              <i className="fas fa-code-merge mr-1"></i>{prCount} PRs
            </span>
            {allEvents.length > PAGE_SIZE && (
              <span className="text-[0.6rem] text-dark-text3 ml-auto">
                Showing {events.length} of {allEvents.length}
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-3 text-[0.75rem] text-dark-text2">Loading history...</p>
          </div>
        ) : error ? (
          <div className="text-center py-10 px-4">
            <i className="fas fa-triangle-exclamation text-2xl text-red-400 mb-3 block"></i>
            <p className="text-[0.8rem] text-dark-text2 mb-4">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.75rem] font-semibold cursor-pointer border-none hover:bg-qsis/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : allEvents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <i className="fas fa-inbox text-3xl text-dark-text3 block mb-3 opacity-60"></i>
            <p className="text-[0.8rem] text-dark-text2">No public contributions found yet.</p>
          </div>
        ) : (
          <div className="px-4 pt-4 pb-2">
            <div className="relative">
              <span className="absolute left-[11px] top-2 bottom-6 w-px bg-dark-border" aria-hidden></span>
              <ul className="space-y-0">
                {events.map((e, i) => {
                  const meta = REPO_META[e.repo] || REPO_META.code;
                  const isCommit = e.type === 'commit';
                  return (
                    <li key={`${e.type}-${e.repo}-${e.sha || e.number}-${i}`} className="relative pl-7 pb-4 last:pb-1">
                      <span
                        className={`absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-dark-bg2 ${
                          isCommit ? 'bg-qsis/20 text-qsis' : 'bg-accent/20 text-accent'
                        }`}
                      >
                        <i className={`fas ${isCommit ? 'fa-code-commit' : 'fa-code-merge'} text-[0.55rem]`}></i>
                      </span>
                      <div className="bg-dark-bg3/40 rounded-lg px-3 py-2 border border-dark-border/60 hover:border-qsis/40 transition-colors">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[0.62rem] font-bold ${meta.color}`}>
                            <i className={`fas ${meta.icon} mr-1`}></i>{meta.label}
                          </span>
                          {isCommit ? (
                            <span className="text-[0.62rem] font-semibold text-dark-text2 font-mono">{e.shortSha}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[0.62rem] font-bold text-purple-400">
                              <i className="fas fa-code-pull-request text-[0.5rem]"></i>#{e.number}
                              <span
                                className={`px-1.5 py-px rounded text-[0.52rem] font-bold ${
                                  e.state === 'merged'
                                    ? 'bg-accent/15 text-accent'
                                    : e.state === 'open'
                                      ? 'bg-green-500/15 text-green-400'
                                      : 'bg-red-500/15 text-red-400'
                                }`}
                              >
                                {e.state}
                              </span>
                            </span>
                          )}
                          <span className="text-[0.6rem] text-dark-text3 ml-auto flex-shrink-0">{formatDate(e.date)}</span>
                        </div>
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block mt-1 text-[0.75rem] text-dark-text font-medium leading-snug hover:text-qsis transition-colors no-underline"
                        >
                          {e.title}
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {hasMore && (
              <div className="flex justify-center mt-3 mb-1">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.7rem] font-semibold text-dark-text2 hover:border-qsis/40 hover:text-qsis transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-qsis border-t-transparent rounded-full animate-spin"></span>
                      Loading...
                    </span>
                  ) : (
                    <span>Load more ({allEvents.length - visibleCount} remaining)</span>
                  )}
                </button>
              </div>
            )}

            <p className="text-[0.6rem] text-dark-text3 mt-1 mb-1 text-center">
              <i className="fab fa-github mr-1"></i>Live from GitHub
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
