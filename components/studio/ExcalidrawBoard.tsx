'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Excalidraw,
  exportToBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import { useMagicLaser } from '@/components/app-shell/doc-viewer/useMagicLaser';

const STORAGE_KEY = 'qsis-excalidraw-board';

export default function ExcalidrawBoard() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const [laserOn, setLaserOn] = useState(false);
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useMagicLaser({ enabled: laserOn, overlayRef: laserRef, containerRef: boardRef });

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const onInit = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.files) api.addFiles(Object.values(data.files));
        api.updateScene({ elements: data.elements, appState: { ...data.appState, viewBackgroundColor: '#121212' } });
      }
    } catch {
      // ignore corrupt board
    }
  }, []);

  const handleChange = useCallback((elements: readonly ExcalidrawElement[], appState: any, files: BinaryFiles) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const json = serializeAsJSON(elements, appState, files, 'local');
        localStorage.setItem(STORAGE_KEY, json);
      } catch {
        // storage full — keep working in memory
      }
      setSaved(true);
    }, 800);
  }, []);

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
    a.download = `excalidraw-board-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearBoard = async () => {
    const api = apiRef.current;
    if (!api) return;
    if (!window.confirm('Clear the whiteboard? This cannot be undone.')) return;
    api.resetScene();
    localStorage.removeItem(STORAGE_KEY);
    setSaved(true);
  };

  return (
    <div className="min-h-[80vh] flex flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-dark-text mr-auto flex items-center">
          <i className="fas fa-draw-polygon text-qsis mr-2"></i>Excalidraw Whiteboard
        </h1>
        <span className="text-[0.68rem] text-dark-text3 hidden sm:block">{saved ? 'Saved locally' : 'Saving…'}</span>
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

      <p className="text-[0.75rem] text-dark-text2 mb-2 max-w-2xl">
        Draw freely — shapes, arrows, freehand, text, images and more. Your board auto-saves to this device and stays
        here; nothing is uploaded.
      </p>

      <div
        ref={boardRef}
        className="flex-1 relative min-h-[70vh] rounded-2xl overflow-hidden border border-dark-border"
        style={{ cursor: laserOn ? 'none' : undefined }}
      >
        <Excalidraw
          excalidrawAPI={onInit}
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
        <canvas ref={laserRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }} />
      </div>
    </div>
  );
}
