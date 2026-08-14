'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Excalidraw, exportToBlob, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import { useMagicLaser } from '@/components/app-shell/doc-viewer/useMagicLaser';
import { getDraft, saveDraft } from '@/lib/whiteboard-store';

interface WhiteboardProps {
  draftId: string;
}

export default function Whiteboard({ draftId }: WhiteboardProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Untitled');
  const [saved, setSaved] = useState(true);
  const [laserOn, setLaserOn] = useState(false);
  const sceneRef = useRef('');
  const titleRef = useRef(title);
  titleRef.current = title;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstChange = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await getDraft(draftId);
      if (cancelled) return;
      sceneRef.current = draft?.scene ?? '';
      if (draft?.title) setTitle(draft.title);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const initialData = useMemo(() => {
    if (!loading && sceneRef.current) {
      try {
        const data = JSON.parse(sceneRef.current);
        const restored = restore(data, null, null);
        return {
          elements: restored.elements,
          appState: { ...(restored.appState as object), showWelcomeScreen: false },
          files: restored.files,
          scrollToContent: true,
        };
      } catch {
        // fall back to a fresh board
      }
    }
    return { appState: { showWelcomeScreen: false } };
  }, [loading]);

  useMagicLaser({ enabled: laserOn, overlayRef: laserRef, containerRef: boardRef });

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const scheduleSave = useCallback(
    (nextTitle: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await saveDraft(draftId, nextTitle, sceneRef.current);
        } catch {
          // ignore persistence errors
        }
        setSaved(true);
      }, 800);
    },
    [draftId]
  );

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: any, files: BinaryFiles) => {
      if (firstChange.current) {
        firstChange.current = false;
        return;
      }
      setSaved(false);
      try {
        sceneRef.current = serializeAsJSON(elements, appState, files, 'local');
      } catch {
        return;
      }
      scheduleSave(titleRef.current);
    },
    [scheduleSave]
  );

  const handleTitle = (value: string) => {
    setTitle(value);
    setSaved(false);
    scheduleSave(value);
  };

  const exportPng = async () => {
    const api = apiRef.current;
    if (!api) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
      mimeType: 'image/png',
      quality: 1,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[\\/:*?"<>|]/g, '_') || 'whiteboard'}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearBoard = () => {
    const api = apiRef.current;
    if (!api) return;
    if (!window.confirm('Clear this whiteboard? This cannot be undone.')) return;
    api.resetScene();
  };

  return (
    <div className="min-h-[80vh] flex flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/studio/whiteboard" className="pdf-btn !bg-transparent border border-dark-border !text-dark-text2 no-underline" title="Back to my boards">
          <i className="fas fa-arrow-left"></i>
        </Link>
        <input
          value={title}
          onChange={(e) => handleTitle(e.target.value)}
          className="bg-transparent border-b border-transparent hover:border-dark-border focus:border-qsis focus:outline-none text-lg font-bold text-dark-text min-w-[140px] max-w-[320px] flex-1 py-0.5"
          placeholder="Untitled"
          maxLength={80}
          aria-label="Board title"
        />
        <span className="text-[0.68rem] text-dark-text3 hidden sm:block">
          {saved ? 'Saved locally' : 'Saving…'}
        </span>
        <button
          className="pdf-btn !bg-transparent border border-dark-border !text-dark-text2"
          onClick={() => setLaserOn((v) => !v)}
          title="Magic laser cursor"
          style={laserOn ? { background: 'rgba(251,146,60,0.25)', border: '1px solid rgba(251,146,60,0.6)', color: '#fff' } : undefined}
        >
          <i className="fas fa-magic"></i> {laserOn ? 'Laser on' : 'Laser'}
        </button>
        <button className="pdf-btn" onClick={exportPng} title="Download drawing as PNG">
          <i className="fas fa-download"></i> PNG
        </button>
        <button className="pdf-btn" onClick={clearBoard} title="Clear whiteboard">
          <i className="fas fa-trash-alt"></i>
        </button>
      </div>

      <div
        ref={boardRef}
        className="flex-1 relative min-h-[70vh] rounded-2xl overflow-hidden border border-dark-border"
        style={{ cursor: laserOn ? 'none' : undefined }}
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-bg2 text-dark-text2">
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Loading your board…</p>
          </div>
        ) : (
          <Excalidraw
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={initialData}
            onChange={handleChange}
            theme="dark"
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
              },
              tools: { image: true },
            }}
            name="QSIS-ARMS Whiteboard"
          />
        )}
        <canvas ref={laserRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }} />
      </div>
    </div>
  );
}
