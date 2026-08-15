'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Excalidraw, restore, serializeAsJSON } from '@excalidraw/excalidraw';
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import { getDraft, saveDraft } from '@/lib/whiteboard-store';

interface WhiteboardProps {
  draftId: string;
}

export default function Whiteboard({ draftId }: WhiteboardProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [loading, setLoading] = useState(true);
  const sceneRef = useRef('');
  const titleRef = useRef('Untitled');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await getDraft(draftId);
      if (cancelled) return;
      sceneRef.current = draft?.scene ?? '';
      titleRef.current = draft?.title ?? 'Untitled';
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

  const persist = useCallback(
    (scene: string) => {
      dirtyRef.current = false;
      void saveDraft(draftId, titleRef.current, scene);
    },
    [draftId]
  );

  // Debounced autosave so every stroke is persisted to the device.
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: any, files: BinaryFiles) => {
      try {
        const json = serializeAsJSON(elements, appState, files, 'local');
        sceneRef.current = json;
        dirtyRef.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => persist(json), 700);
      } catch {
        // ignore
      }
    },
    [persist]
  );

  // Flush any pending stroke when leaving the board (Back / tab close).
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && sceneRef.current) {
        dirtyRef.current = false;
        void saveDraft(draftId, titleRef.current, sceneRef.current);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
    };
  }, [draftId]);

  // Full-screen editor that sits ABOVE the app navbar (z-[100]) and the mobile
  // bottom nav (z-[90]), so the Excalidraw toolbar is never hidden behind them.
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex items-center justify-between gap-2 border-b border-dark-border bg-dark-bg2 px-3 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/studio/whiteboard"
            className="flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-bg px-3 py-1.5 text-[0.72rem] font-semibold text-dark-text no-underline transition hover:border-indigo-500 hover:text-indigo-400"
          >
            <i className="fas fa-arrow-left"></i> Back
          </Link>
          <span className="text-[0.68rem] text-dark-text3">
            <i className="fas fa-save mr-1"></i>Autosaved on this device
          </span>
        </div>
        <span className="hidden text-[0.65rem] text-dark-text3 sm:block">
          Draw freely — the canvas fills the whole screen
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black text-dark-text2">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-qsis border-t-transparent"></div>
            <p className="text-sm">Loading board…</p>
          </div>
        )}
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
      </div>
    </div>
  );
}
