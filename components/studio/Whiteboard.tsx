'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const boardRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const sceneRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await getDraft(draftId);
      if (cancelled) return;
      sceneRef.current = draft?.scene ?? '';
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

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: any, files: BinaryFiles) => {
      try {
        sceneRef.current = serializeAsJSON(elements, appState, files, 'local');
      } catch {
        // ignore
      }
    },
    []
  );

  return (
    <div className="min-h-[80vh] flex flex-col">
      <div
        className="fixed top-2 left-2 z-[100] pointer-events-none"
        style={{ color: 'white' }}
      >
        <a href="/studio/whiteboard" className="text-xs text-white/70 underline">
          <i className="fas fa-arrow-left"></i> Back
        </a>
      </div>
      <div
        className="absolute inset-0 flex flex-col overflow-hidden bg-black"
        style={{ cursor: 'default' }}
      >
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