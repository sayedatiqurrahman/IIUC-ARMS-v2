'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteDraft, listDraftMeta, newDraftId, saveDraft, type WhiteboardMeta } from '@/lib/whiteboard-store';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function WhiteboardsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<WhiteboardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDrafts(await listDraftMeta());
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const newBoard = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = newDraftId();
      await saveDraft(id, 'Untitled', '');
      router.push(`/studio/whiteboard/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Delete this whiteboard? This cannot be undone.')) return;
    await deleteDraft(id);
    refresh();
  };

  return (
    <div className="min-h-[60vh]">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold text-dark-text flex items-center">
            <i className="fas fa-draw-polygon text-qsis mr-2"></i>Whiteboard
          </h1>
          <p className="text-[0.78rem] text-dark-text2 mt-1 max-w-xl">
            Your boards live on this device. Start a new blank board, or reopen a draft and keep drawing.
          </p>
        </div>
        <button
          onClick={newBoard}
          disabled={creating}
          className="pdf-btn !w-auto px-4 !h-9 !text-[0.8rem]"
          style={{ background: '#7c3aed', color: 'white', border: '1px solid #8b5cf6', borderRadius: '8px' }}
        >
          {creating ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-plus mr-1.5"></i>}
          New blank board
        </button>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-dark-text2">
          <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading your boards…</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center text-dark-text2 rounded-2xl border border-dashed border-dark-border">
          <i className="fas fa-chalkboard text-3xl text-dark-text3 mb-3"></i>
          <p className="text-sm font-semibold text-dark-text">No boards yet</p>
          <p className="text-[0.72rem] mt-1 mb-4">Create a blank board to start drawing.</p>
          <button
            onClick={newBoard}
            disabled={creating}
            className="pdf-btn !w-auto px-4 !text-[0.8rem]"
            style={{ background: '#7c3aed', color: 'white', border: '1px solid #8b5cf6', borderRadius: '8px' }}
          >
            <i className="fas fa-plus mr-1.5"></i>New blank board
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((d) => (
            <Link
              key={d.id}
              href={`/studio/whiteboard/${d.id}`}
              className="group rounded-2xl border border-dark-border bg-dark-bg2 p-5 hover:border-qsis/50 hover:bg-dark-bg3 transition-all no-underline block"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-draw-polygon"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[0.88rem] font-bold text-dark-text truncate">
                    {d.title || 'Untitled'}
                  </h3>
                  <p className="text-[0.7rem] text-dark-text2 mt-0.5">{timeAgo(d.updatedAt)}</p>
                </div>
                <button
                  onClick={(e) => remove(e, d.id)}
                  className="text-dark-text3 hover:text-red-400 transition-colors p-1 opacity-0 group-hover:opacity-100"
                  title="Delete board"
                >
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
