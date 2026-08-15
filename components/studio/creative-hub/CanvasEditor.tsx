'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { PAGE_SIZES, FIELD_LABELS } from './templates';

// Full-screen manual design editor (Canva-style) built on fabric.js.
// Renders ABOVE the app navbar (AppShell navbar is z-[100]) as a fixed
// inset-0 overlay (z-[200]) and shows a close/back button in its top bar. The
// canvas is always laid out at the real page size in CSS px (A4 = 794x1123 @
// 96dpi) and is only scaled with a CSS transform to fit the viewport, so the
// export is pixel-perfect and text never re-wraps because of a small screen.
//
// Text can be assigned a FORM FIELD (data-field-type). When the design is
// published, those text objects become editable fields that other users can
// fill up — this is how a manual design connects to the fill-up form.

const COLORS = ['#ffffff', '#fdfcfa', '#f8fafc', '#fef2f2', '#ecfdf5', '#eff6ff', '#fefce8', '#1f2937'];

const FIELD_OPTIONS = [
  { value: '', label: '— Not a form field —' },
  ...Object.entries(FIELD_LABELS).map(([value, label]) => ({ value, label })),
];

interface CanvasEditorProps {
  open: boolean;
  pageSize: string;
  initialLayers?: unknown;
  backgroundImage?: string;
  initialMappings?: Record<string, string>;
  onClose: () => void;
  onSave: (payload: { layers: unknown; fieldMappings: Record<string, string> }) => void;
  onSnapshot?: (dataUrl: string) => void;
}

function newObjectId(): string {
  return `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CanvasEditor({ open, pageSize, initialLayers, backgroundImage, initialMappings, onClose, onSave, onSnapshot }: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canvasRefObj = useRef<fabric.Canvas | null>(null);
  const [scale, setScale] = useState(0.5);
  const [history, setHistory] = useState<string[]>([]);
  const [histIndex, setHistIndex] = useState(-1);
  const restoringRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mappingsRef = useRef<Record<string, string>>(initialMappings || {});
  const [mappings, setMappings] = useState<Record<string, string>>(initialMappings || {});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const size = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;

  const pushHistory = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c || restoringRef.current) return;
    const json = JSON.stringify(c.toJSON());
    setHistory((prev) => {
      const next = prev.slice(0, histIndex + 1);
      next.push(json);
      const trimmed = next.length > 50 ? next.slice(next.length - 50) : next;
      setHistIndex(trimmed.length - 1);
      return trimmed;
    });
  }, [histIndex]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const c = canvasRefObj.current;
      if (c) {
        onSave({ layers: c.toJSON(), fieldMappings: mappingsRef.current });
        onSnapshot?.(c.toDataURL({ format: 'png', multiplier: 2 }));
      }
    }, 800);
  }, [onSave, onSnapshot]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: size.width,
      height: size.height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    });
    canvasRefObj.current = canvas;

    const markChange = () => {
      if (restoringRef.current) return;
      pushHistory();
      scheduleSave();
    };
    canvas.on('object:added', (e) => {
      const obj = e.target as any;
      if (obj && !obj.id) obj.set('id', newObjectId());
      markChange();
    });
    canvas.on('object:modified', markChange);
    canvas.on('object:removed', markChange);
    canvas.on('selection:created', () => {
      const a = canvas.getActiveObject();
      setSelectedId(a && (a as any).id ? (a as any).id : null);
    });
    canvas.on('selection:updated', () => {
      const a = canvas.getActiveObject();
      setSelectedId(a && (a as any).id ? (a as any).id : null);
    });
    canvas.on('selection:cleared', () => setSelectedId(null));

    if (initialLayers && typeof initialLayers === 'object') {
      restoringRef.current = true;
      canvas
        .loadFromJSON(JSON.stringify(initialLayers))
        .then(() => {
          canvas.getObjects().forEach((o: any) => {
            if (o && !o.id) o.set('id', newObjectId());
          });
          canvas.renderAll();
        })
        .finally(() => {
          restoringRef.current = false;
          pushHistory();
        });
    } else if (backgroundImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        void (async () => {
          try {
            const bg = await fabric.FabricImage.fromURL(img.src, { crossOrigin: 'anonymous' });
            const sx = size.width / (bg.width || size.width);
            const sy = size.height / (bg.height || size.height);
            bg.set({ left: 0, top: 0, scaleX: sx, scaleY: sy, originX: 'left', originY: 'top' });
            canvas.backgroundImage = bg;
            canvas.requestRenderAll();
          } catch {}
          pushHistory();
        })();
      };
      img.onerror = () => pushHistory();
      img.src = backgroundImage;
    } else {
      pushHistory();
    }

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      canvas.dispose();
      canvasRefObj.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pageSize]);

  // Fit the fixed A4 canvas into the viewport below the top bar.
  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const recompute = () => {
      const el = wrapRef.current;
      if (!el) return;
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - 24;
      setScale(Math.min(availW / size.width, availH / size.height, 1));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [open, size.width, size.height]);

  const assignField = useCallback(
    (type: string) => {
      if (!selectedId) return;
      const next = { ...mappingsRef.current };
      if (type) next[selectedId] = type;
      else delete next[selectedId];
      mappingsRef.current = next;
      setMappings(next);
      scheduleSave();
    },
    [selectedId, scheduleSave]
  );

  const selectAll = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c) return;
    c.discardActiveObject();
    const sel = new fabric.ActiveSelection(c.getObjects(), { canvas: c });
    c.setActiveObject(sel);
    c.requestRenderAll();
  }, []);

  const addText = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c) return;
    const text = new fabric.Textbox('Type your text', {
      left: size.width / 2 - 150,
      top: size.height / 2 - 20,
      width: 300,
      fontSize: 28,
      fontFamily: 'Georgia',
      fill: '#111827',
      textAlign: 'center',
      editable: true,
      cornerStyle: 'circle',
    });
    c.add(text);
    c.setActiveObject(text);
    c.requestRenderAll();
  }, [size]);

  const addShape = useCallback((kind: 'rect' | 'circle' | 'line') => {
    const c = canvasRefObj.current;
    if (!c) return;
    let obj: fabric.FabricObject;
    if (kind === 'rect') {
      obj = new fabric.Rect({ left: size.width / 2 - 100, top: size.height / 2 - 100, width: 200, height: 200, fill: '#3b82f6', cornerStyle: 'circle' });
    } else if (kind === 'circle') {
      obj = new fabric.Circle({ left: size.width / 2 - 100, top: size.height / 2 - 100, radius: 100, fill: '#10b981', cornerStyle: 'circle' });
    } else {
      obj = new fabric.Line([size.width / 2 - 150, size.height / 2, size.width / 2 + 150, size.height / 2], {
        stroke: '#111827',
        strokeWidth: 4,
        cornerStyle: 'circle',
      });
    }
    c.add(obj);
    c.setActiveObject(obj);
    c.requestRenderAll();
  }, [size]);

  const addImage = useCallback((file: File) => {
    const c = canvasRefObj.current;
    if (!c) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      void fabric.FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' }).then((img) => {
        const maxW = size.width * 0.8;
        const maxH = size.height * 0.6;
        let w = img.width || maxW;
        let h = img.height || maxH;
        const r = Math.min(maxW / w, maxH / h, 1);
        img.scale(r);
        img.set({ left: (size.width - w * r) / 2, top: (size.height - h * r) / 2, cornerStyle: 'circle' });
        c.add(img);
        c.setActiveObject(img);
        c.requestRenderAll();
      });
    };
    reader.readAsDataURL(file);
  }, [size]);

  const setBackground = useCallback(
    (color: string) => {
      const c = canvasRefObj.current;
      if (!c) return;
      c.backgroundColor = color;
      c.requestRenderAll();
      pushHistory();
      scheduleSave();
    },
    [pushHistory, scheduleSave]
  );

  const deleteSelected = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c) return;
    const active = c.getActiveObjects();
    if (active.length) {
      active.forEach((o: any) => {
        if (o && o.id && mappingsRef.current[o.id]) {
          const next = { ...mappingsRef.current };
          delete next[o.id];
          mappingsRef.current = next;
          setMappings(next);
        }
      });
      c.remove(...active);
      c.discardActiveObject();
      c.requestRenderAll();
    }
  }, []);

  const undo = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c || histIndex <= 0) return;
    const target = histIndex - 1;
    restoringRef.current = true;
    c.loadFromJSON(history[target]).then(() => {
      restoringRef.current = false;
      setHistIndex(target);
      c.requestRenderAll();
    });
  }, [history, histIndex]);

  const redo = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c || histIndex >= history.length - 1) return;
    const target = histIndex + 1;
    restoringRef.current = true;
    c.loadFromJSON(history[target]).then(() => {
      restoringRef.current = false;
      setHistIndex(target);
      c.requestRenderAll();
    });
  }, [history, histIndex]);

  const exportPng = useCallback(() => {
    const c = canvasRefObj.current;
    if (!c) return;
    const dataUrl = c.toDataURL({ format: 'png', multiplier: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'creative-hub-design.png';
    a.click();
  }, []);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
    },
    [undo, redo, deleteSelected]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const selectedIsText =
    !!selectedId &&
    (() => {
      const c = canvasRefObj.current;
      if (!c) return false;
      const o = c.getObjects().find((x: any) => x.id === selectedId);
      return !!o && (o.type === 'text' || o.type === 'textbox' || o.type === 'i-text');
    })();

  const tools = [
    { id: 'text', label: 'T', title: 'Add text', onClick: addText },
    { id: 'rect', label: '□', title: 'Rectangle', onClick: () => addShape('rect') },
    { id: 'circle', label: '○', title: 'Circle', onClick: () => addShape('circle') },
    { id: 'line', label: '/', title: 'Line', onClick: () => addShape('line') },
    { id: 'image', label: '▤', title: 'Image', onClick: () => fileRef.current?.click() },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-zinc-900/95" dir="ltr">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-zinc-950 px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-300">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="truncate">Creative Hub · Canvas Editor</span>
          <span className="ml-1 shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{PAGE_SIZES[pageSize]?.label || 'A4'}</span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
        >
          Done
        </button>
      </div>

      {/* Field-mapping bar — shows when a text object is selected */}
      <div
        className={`flex min-h-0 shrink-0 items-center gap-3 overflow-hidden border-b border-zinc-800 bg-zinc-950 px-4 transition-all ${
          selectedIsText ? 'py-2' : 'h-0 border-b-0'
        }`}
      >
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Form field</span>
        <select
          value={selectedId ? mappings[selectedId] || '' : ''}
          onChange={(e) => assignField(e.target.value)}
          className="max-w-full flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-600"
        >
          {FIELD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="hidden shrink-0 text-[11px] text-zinc-500 md:block">
          Assigned fields become fill-up inputs for other users when published.
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-16 shrink-0 flex-col items-center gap-2 border-r border-zinc-800 bg-zinc-950 py-3">
          {tools.map((t) => (
            <button
              key={t.id}
              title={t.title}
              onClick={t.onClick}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-400"
            >
              {t.label}
            </button>
          ))}
          <div className="my-1 h-px w-8 bg-zinc-800" />
          <button
            title="Undo (Ctrl+Z)"
            onClick={undo}
            disabled={histIndex <= 0}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-30"
          >
            ↶
          </button>
          <button
            title="Redo"
            onClick={redo}
            disabled={histIndex >= history.length - 1}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-30"
          >
            ↷
          </button>
          <button
            title="Delete selected"
            onClick={deleteSelected}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 transition hover:border-rose-600 hover:text-rose-400"
          >
            ×
          </button>
          <div className="my-1 h-px w-8 bg-zinc-800" />
          <button
            title="Download PNG"
            onClick={exportPng}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-400"
          >
            ⭳
          </button>
          <div className="my-1 h-px w-8 bg-zinc-800" />
          <button
            title="Select all"
            onClick={selectAll}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-400"
          >
            ▣
          </button>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => setBackground(c)}
                className="h-6 w-6 rounded-full border border-zinc-600"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
          <div
            style={{
              width: size.width,
              height: size.height,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <canvas ref={canvasRef} style={{ boxShadow: '0 25px 60px -12px rgba(0,0,0,.7)' }} />
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addImage(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
