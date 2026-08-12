'use client';

import { useCallback, useRef, useState } from 'react';
import { compressImageStrong } from '@/lib/image-utils';
import { downloadFile } from '@/lib/download-file';
import { showToast } from '@/lib/utils';

interface Item {
  id: number;
  original: File;
  result: File | null;
  saved: number;
  status: 'compressing' | 'done';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

let nextId = 1;

export default function FileCompressor() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runCompression = useCallback(async (id: number, file: File) => {
    const r = await compressImageStrong(file);
    setItems(prev => prev.map(it => (it.id === id ? { ...it, result: r, saved: r ? Math.max(0, it.original.size - r.size) : 0, status: 'done' } : it)));
  }, []);

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const fresh: Item[] = files.map(f => ({ id: nextId++, original: f, result: null, saved: 0, status: 'compressing' }));
    setItems(prev => [...prev, ...fresh]);
    fresh.forEach(it => {
      runCompression(it.id, it.original).catch(() => {
        // Compression never blocks: on failure keep the original so it can
        // still be downloaded.
        setItems(prev => prev.map(x => (x.id === it.id ? { ...x, result: it.original, saved: 0, status: 'done' } : x)));
      });
    });
  }, [runCompression]);

  const removeItem = useCallback((id: number) => {
    setItems(prev => prev.filter(it => it.id !== id));
  }, []);

  const clearAll = useCallback(() => setItems([]), []);

  const allDone = items.length > 0 && items.every(it => it.status === 'done');
  const totalOriginal = items.reduce((s, it) => s + it.original.size, 0);
  const totalResult = items.reduce((s, it) => s + (it.result?.size ?? 0), 0);
  const totalSaved = Math.max(0, totalOriginal - totalResult);
  const totalPct = totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0;

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
        <p className="text-[0.7rem] text-dark-text2 max-w-sm">Images, PDFs, DOCX, PPTX &amp; EPUB are compressed in your browser — nothing is uploaded, everything stays on this device.</p>
      </div>

      {items.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dark-border bg-dark-bg2 divide-y divide-dark-border overflow-hidden">
          {items.map(it => {
            const pct = it.original.size > 0 ? Math.round((it.saved / it.original.size) * 100) : 0;
            return (
              <div key={it.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-dark-bg3 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-file text-dark-text2 text-sm"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[0.78rem] font-medium text-dark-text truncate">{it.original.name}</p>
                  <p className="text-[0.68rem] text-dark-text2">
                    {it.status === 'compressing' ? (
                      <span className="text-qsis"><i className="fas fa-spinner fa-spin mr-1"></i>Compressing...</span>
                    ) : it.saved > 0 ? (
                      <span><span className="line-through opacity-70">{formatBytes(it.original.size)}</span> → <span className="text-green-400">{formatBytes(it.result?.size ?? it.original.size)}</span> <span className="text-green-400 font-semibold">−{pct}%</span></span>
                    ) : (
                      <span>{formatBytes(it.original.size)} <span className="text-dark-text3">— already small or not compressible</span></span>
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
              <p className="text-[0.68rem] text-dark-text2">Total savings</p>
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
            onClick={() => { items.forEach(it => { if (it.result) { downloadFile(it.result); } }); showToast('Downloaded all files', 'success'); }}
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
