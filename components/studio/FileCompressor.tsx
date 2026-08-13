'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { compressPdfFile } from '@/lib/compressor/pdf';
import {
  isImageFile,
  isArchiveFile,
  type CompressMode,
} from '@/lib/compressor/engines';
import { downloadFile } from '@/lib/download-file';
import { showToast } from '@/lib/utils';

type ItemKind = 'image' | 'archive' | 'pdf' | 'unsupported';
type ItemStatus = 'queued' | 'compressing' | 'done';

interface Item {
  id: number;
  original: File;
  result: File | null;
  saved: number;
  status: ItemStatus;
  kind: ItemKind;
  note?: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

let nextId = 1;

const MODE_LABELS: Record<CompressMode, string> = {
  recommended: 'Recommended',
  strong: 'Strong',
  maximum: 'Maximum',
};

const MODE_HINTS: Record<CompressMode, string> = {
  recommended: 'Balanced — near-original quality, solid savings',
  strong: 'Smaller files, slightly lower quality',
  maximum: 'Tiny files — best for email / upload limits',
};

function kindOf(name: string): ItemKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (isArchiveFile(lower)) return 'archive';
  if (isImageFile(lower)) return 'image';
  return 'unsupported';
}

export default function FileCompressor() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<CompressMode>('recommended');
  const inputRef = useRef<HTMLInputElement>(null);

  const modeRef = useRef<CompressMode>(mode);
  modeRef.current = mode;

  const workersRef = useRef<Worker[]>([]);
  const idleWorkersRef = useRef<Worker[]>([]);
  const pendingRef = useRef<{ id: number; kind: 'image' | 'archive' | 'pdf'; file: File }[]>([]);
  const pdfActiveRef = useRef(0);
  const PDF_CONCURRENCY = 2;

  const setItem = useCallback((id: number, patch: Partial<Item>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const schedule = useCallback(() => {
    const takeNext = (kind: 'image' | 'archive' | 'pdf') => {
      const i = pendingRef.current.findIndex(p => p.kind === kind);
      if (i < 0) return null;
      return pendingRef.current.splice(i, 1)[0];
    };

    // Image + archive jobs go to the worker pool.
    while (idleWorkersRef.current.length) {
      const entry = takeNext('image') ?? takeNext('archive');
      if (!entry) break;
      const worker = idleWorkersRef.current.pop()!;
      setItem(entry.id, { status: 'compressing' });
      worker.postMessage({ id: entry.id, kind: entry.kind, file: entry.file, mode: modeRef.current });
    }

    // PDF jobs run on the main thread (pdf.js renders to a 2D canvas).
    while (pdfActiveRef.current < PDF_CONCURRENCY) {
      const entry = takeNext('pdf');
      if (!entry) break;
      pdfActiveRef.current++;
      setItem(entry.id, { status: 'compressing' });
      const m = modeRef.current;
      compressPdfFile(entry.file, m)
        .then(out => {
          setItem(entry.id, out
            ? { result: out, saved: Math.max(0, entry.file.size - out.size), status: 'done' }
            : { result: entry.file, saved: 0, status: 'done' });
        })
        .catch(() => setItem(entry.id, { result: entry.file, saved: 0, status: 'done' }))
        .finally(() => {
          pdfActiveRef.current--;
          schedule();
        });
    }
  }, [setItem]);

  const handleWorkerMessage = useCallback((e: MessageEvent<{ id: number; ok: boolean; result: { name: string; type: string; buffer: ArrayBuffer } | null; error?: string }>, worker: Worker) => {
    const { id, ok, result } = e.data;
    idleWorkersRef.current.push(worker);
    if (ok && result) {
      const f = new File([result.buffer], result.name, { type: result.type });
      setItems(prev => prev.map(it => (it.id === id ? { ...it, saved: Math.max(0, it.original.size - f.size), status: 'done' as ItemStatus, result: f } : it)));
    } else {
      setItems(prev => prev.map(it => (it.id === id ? { ...it, result: it.original, saved: 0, status: 'done' as ItemStatus } : it)));
    }
    schedule();
  }, [schedule]);

  useEffect(() => {
    const count = Math.max(2, Math.min(4, navigator.hardwareConcurrency || 2));
    const ws: Worker[] = [];
    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('../../lib/compressor/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e) => handleWorkerMessage(e, w);
      ws.push(w);
    }
    workersRef.current = ws;
    idleWorkersRef.current = [...ws];
    return () => ws.forEach(w => w.terminate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const fresh: Item[] = [];
    for (const f of files) {
      const k = kindOf(f.name);
      if (k === 'unsupported') {
        fresh.push({ id: nextId++, original: f, result: f, saved: 0, status: 'done', kind: k, note: 'Format not supported' });
      } else {
        fresh.push({ id: nextId++, original: f, result: null, saved: 0, status: 'queued', kind: k });
        pendingRef.current.push({ id: fresh[fresh.length - 1].id, kind: k, file: f });
      }
    }
    setItems(prev => [...prev, ...fresh]);
    schedule();
  }, [schedule]);

  const removeItem = useCallback((id: number) => {
    setItems(prev => prev.filter(it => it.id !== id));
    pendingRef.current = pendingRef.current.filter(p => p.id !== id);
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    pendingRef.current = [];
    pdfActiveRef.current = 0;
  }, []);

  const changeMode = useCallback((m: CompressMode) => {
    setMode(m);
    modeRef.current = m;
    // Re-queue completed items so they re-compress with the new setting.
    let requeue: { id: number; kind: 'image' | 'archive' | 'pdf'; file: File }[] = [];
    setItems(prev => {
      requeue = [];
      const next = prev.map(it => {
        if (it.kind === 'unsupported' || it.status === 'compressing') return it;
        requeue.push({ id: it.id, kind: it.kind, file: it.original });
        return { ...it, result: null, saved: 0, status: 'queued' as ItemStatus };
      });
      return next;
    });
    pendingRef.current = requeue;
    // Give idle workers a nudge on the next tick.
    setTimeout(schedule, 0);
  }, [schedule]);

  const allDone = items.length > 0 && items.every(it => it.status === 'done');
  const totalOriginal = items.reduce((s, it) => s + it.original.size, 0);
  const totalResult = items.reduce((s, it) => s + (it.result?.size ?? 0), 0);
  const totalSaved = Math.max(0, totalOriginal - totalResult);
  const totalPct = totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0;
  const doneCount = items.filter(it => it.status === 'done').length;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files || [])); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 px-6 py-10 text-center ${dragging ? 'border-qsis bg-qsis/10' : 'border-dark-border bg-dark-bg2 hover:border-qsis/50 hover:bg-dark-bg3'}`}
      >
        <div className="w-14 h-14 rounded-2xl bg-qsis/15 flex items-center justify-center">
          <i className="fas fa-file-zipper text-qsis text-2xl"></i>
        </div>
        <p className="text-[0.85rem] font-semibold text-dark-text">Drop files here or tap to choose</p>
        <p className="text-[0.7rem] text-dark-text2 max-w-sm">Images (JPG/PNG/WebP/AVIF/GIF), PDFs, DOCX, PPTX &amp; EPUB are compressed in your browser — nothing is uploaded, everything stays on this device.</p>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[0.72rem] text-dark-text2">
          <span>Compression:</span>
          <div className="flex rounded-lg border border-dark-border overflow-hidden">
            {(Object.keys(MODE_LABELS) as CompressMode[]).map(m => (
              <button
                key={m}
                onClick={() => changeMode(m)}
                className={`px-2.5 py-1 text-[0.7rem] font-semibold cursor-pointer border-none outline-none transition-colors ${mode === m ? 'bg-qsis text-white' : 'bg-dark-bg3 text-dark-text2 hover:text-dark-text'}`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[0.66rem] text-dark-text3">{MODE_HINTS[mode]}</p>
      </div>

      {items.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dark-border bg-dark-bg2 divide-y divide-dark-border overflow-hidden">
          {items.map(it => {
            const pct = it.original.size > 0 ? Math.round((it.saved / it.original.size) * 100) : 0;
            return (
              <div key={it.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-dark-bg3 flex items-center justify-center flex-shrink-0">
                  <i className={`fas ${it.kind === 'pdf' ? 'fa-file-pdf' : it.kind === 'archive' ? 'fa-file-archive' : it.kind === 'unsupported' ? 'fa-file-exclamation' : 'fa-file-image'} text-dark-text2 text-sm`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[0.78rem] font-medium text-dark-text truncate">{it.original.name}</p>
                  <p className="text-[0.68rem] text-dark-text2">
                    {it.status === 'compressing' ? (
                      <span className="text-qsis"><i className="fas fa-spinner fa-spin mr-1"></i>Compressing…</span>
                    ) : it.kind === 'unsupported' ? (
                      <span className="text-dark-text3">— {it.note}</span>
                    ) : it.saved > 0 ? (
                      <span><span className="line-through opacity-70">{formatBytes(it.original.size)}</span> → <span className="text-green-400">{formatBytes(it.result?.size ?? it.original.size)}</span> <span className="text-green-400 font-semibold">−{pct}%</span></span>
                    ) : (
                      <span>{formatBytes(it.original.size)} <span className="text-dark-text3">— already optimized, can&apos;t reduce further</span></span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(it.id)}
                  className="w-8 h-8 rounded-lg text-dark-text3 hover:text-red-400 hover:bg-red-500/10 cursor-pointer bg-transparent border-none flex items-center justify-center flex-shrink-0 transition-colors"
                  title="Remove"
                >
                  <i className="fas fa-times text-sm"></i>
                </button>
                <button
                  onClick={() => { if (it.result) { downloadFile(it.result); showToast('Downloaded', 'success'); } }}
                  disabled={!it.result}
                  className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.7rem] font-semibold cursor-pointer border-none hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1.5 flex-shrink-0"
                  title="Download to device"
                >
                  <i className="fas fa-download text-xs"></i> Download
                </button>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px] rounded-xl border border-dark-border bg-dark-bg2 px-4 py-2.5 flex items-center gap-3">
            <i className="fas fa-chart-line text-qsis"></i>
            <div>
              <p className="text-[0.68rem] text-dark-text2">
                {doneCount}/{items.length} done · Total savings
              </p>
              <p className="text-[0.82rem] font-bold text-dark-text">{formatBytes(totalOriginal)} → {formatBytes(totalResult)} <span className="text-green-400 text-[0.7rem]">(−{totalPct}%)</span></p>
            </div>
          </div>
          <button
            onClick={clearAll}
            className="px-3 py-2 rounded-lg text-[0.72rem] font-medium text-dark-text3 hover:text-red-400 bg-transparent border-none cursor-pointer transition-colors"
          >
            Clear all
          </button>
          <button
            onClick={() => { items.forEach(it => { if (it.result) downloadFile(it.result); }); showToast('Downloaded all files', 'success'); }}
            disabled={!allDone}
            className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.75rem] font-semibold cursor-pointer border-none hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            <i className="fas fa-file-export mr-1.5"></i>Download all
          </button>
        </div>
      )}
    </div>
  );
}
