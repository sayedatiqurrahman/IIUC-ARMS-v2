'use client';

import { useState, useEffect, useCallback } from 'react';

interface LogEntry {
  id: string;
  [key: string]: any;
}

interface LogViewerProps {
  type: 'activity' | 'telegram' | 'upload';
}

const TYPE_META: Record<string, { label: string; icon: string; color: string; columns: { key: string; label: string }[] }> = {
  activity: {
    label: 'Activity Logs',
    icon: 'fas fa-clock-rotate-left',
    color: 'text-cyan-400',
    columns: [
      { key: 'action', label: 'Action' },
      { key: 'userId', label: 'User' },
      { key: 'userName', label: 'Name' },
      { key: 'details', label: 'Details' },
      { key: 'createdAt', label: 'Date' },
    ],
  },
  telegram: {
    label: 'Telegram Logs',
    icon: 'fab fa-telegram',
    color: 'text-sky-400',
    columns: [
      { key: 'type', label: 'Type' },
      { key: 'department', label: 'Dept' },
      { key: 'title', label: 'Title' },
      { key: 'sentBy', label: 'Sent By' },
      { key: 'recipientCount', label: 'Recipients' },
      { key: 'sentAt', label: 'Date' },
    ],
  },
  upload: {
    label: 'Upload Chunks',
    icon: 'fas fa-database',
    color: 'text-green-400',
    columns: [
      { key: 'userId', label: 'User' },
      { key: 'path', label: 'Path' },
      { key: 'sessionId', label: 'Session' },
      { key: 'index', label: 'Idx' },
      { key: 'total', label: 'Total' },
      { key: 'createdAt', label: 'Date' },
    ],
  },
};

function formatDate(d: string) {
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function truncate(s: string, n: number) {
  return s && s.length > n ? s.slice(0, n) + '...' : s || '';
}

export default function LogViewer({ type }: LogViewerProps) {
  const meta = TYPE_META[type];
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const limit = 15;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, page: String(page), limit: String(limit) });
      if (search) params.set('q', search);
      const res = await fetch(`/api/cron/logs?${params}`);
      const data = await res.json();
      if (data.items) {
        setLogs(data.items);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
    setSelected(new Set());
  }, [type, page, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === logs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(logs.map(l => l.id)));
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    setDeleteResult(null);
    try {
      const res = await fetch('/api/cron/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), type }),
      });
      const data = await res.json();
      setDeleteResult({ success: data.success, message: `${data.deleted} log(s) deleted` });
      fetchLogs();
    } catch (e: any) {
      setDeleteResult({ success: false, message: e?.message || 'Failed' });
    }
    setDeleting(false);
  };

  return (
    <div className="rounded-xl border border-dark-border bg-dark-bg2 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-bg3 border-b border-dark-border cursor-pointer hover:bg-dark-bg2 transition"
      >
        <div className="flex items-center gap-2">
          <i className={`${meta.icon} ${meta.color}`}></i>
          <span className="text-[0.82rem] font-semibold text-dark-text">{meta.label}</span>
          <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-dark-bg2 text-dark-text3">{total} total</span>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-semibold">{selected.size} selected</span>
          )}
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-dark-text3 text-[0.7rem]`}></i>
        </div>
      </button>

      {expanded && (
        <div className="p-3">
          {/* Search + actions row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-3">
            <div className="relative flex-1 w-full">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.68rem]"></i>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={`Search ${meta.label.toLowerCase()}...`}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-[0.75rem] text-dark-text outline-none focus:border-qsis/40"
              />
            </div>
            {selected.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[0.72rem] font-semibold hover:bg-red-500/25 transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {deleting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-trash-can"></i>}
                Delete {selected.size}
              </button>
            )}
          </div>

          {/* Delete result */}
          {deleteResult && (
            <div className={`mb-2 p-2 rounded-lg text-[0.72rem] ${deleteResult.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {deleteResult.message}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="space-y-2 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-dark-bg3 rounded animate-pulse"></div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-dark-text3 text-[0.78rem]">
              <i className="fas fa-inbox text-2xl mb-2 block opacity-30"></i>
              No logs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.72rem]">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left py-2 px-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.size === logs.length && logs.length > 0}
                        onChange={toggleSelectAll}
                        className="accent-qsis w-3.5 h-3.5"
                      />
                    </th>
                    {meta.columns.map(col => (
                      <th key={col.key} className="text-left py-2 px-2 text-dark-text2 font-semibold whitespace-nowrap">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className={`border-b border-dark-border/50 transition ${selected.has(log.id) ? 'bg-qsis/5' : 'hover:bg-dark-bg3/50'}`}>
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selected.has(log.id)}
                          onChange={() => toggleSelect(log.id)}
                          className="accent-qsis w-3.5 h-3.5"
                        />
                      </td>
                      {meta.columns.map(col => {
                        let val = log[col.key];
                        if (col.key === 'createdAt' || col.key === 'sentAt') val = formatDate(val);
                        else if (col.key === 'details' || col.key === 'title' || col.key === 'path') val = truncate(String(val || ''), 40);
                        else if (col.key === 'sessionId') val = truncate(String(val || ''), 12);
                        else if (col.key === 'userName' || col.key === 'sentBy') val = truncate(String(val || ''), 15);
                        return (
                          <td key={col.key} className="py-2 px-2 text-dark-text2 whitespace-nowrap max-w-[180px] truncate" title={String(log[col.key] || '')}>
                            {val || <span className="text-dark-text3">-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-border">
              <span className="text-[0.68rem] text-dark-text3">
                Page {page} of {totalPages} ({total} items)
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.68rem] text-dark-text2 disabled:opacity-30 cursor-pointer hover:text-dark-text"
                >
                  <i className="fas fa-chevron-left"></i>
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded-lg bg-dark-bg3 border border-dark-border text-[0.68rem] text-dark-text2 disabled:opacity-30 cursor-pointer hover:text-dark-text"
                >
                  <i className="fas fa-chevron-right"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
