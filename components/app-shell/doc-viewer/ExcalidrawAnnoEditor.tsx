'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  restore,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';

const BG_EL_ID = 'xdraw-page-bg';

export interface XdrawSaveData {
  image: string; // transparent PNG dataURL covering the page area
  imgW: number;
  imgH: number;
  scene: string; // serialized Excalidraw scene JSON
}

interface ExcalidrawAnnoEditorProps {
  title: string;
  page: number;
  bgImage: string; // page snapshot dataURL
  bgWidth: number; // natural width of the page snapshot
  bgHeight: number; // natural height of the page snapshot
  initialScene?: string; // optional previous scene to keep editing
  onSave: (data: XdrawSaveData) => void;
  onCancel: () => void;
}

export default function ExcalidrawAnnoEditor({
  title,
  page,
  bgImage,
  bgWidth,
  bgHeight,
  initialScene,
  onSave,
  onCancel,
}: ExcalidrawAnnoEditorProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [busy, setBusy] = useState(false);

  const initialData = useMemo(() => {
    if (!initialScene) return undefined;
    try {
      const data = JSON.parse(initialScene);
      const restored = restore(data, null, null);
      return { elements: restored.elements, appState: restored.appState, files: restored.files, scrollToContent: true };
    } catch {
      return undefined;
    }
  }, [initialScene]);

  const onInit = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      try {
        const fileId = `xdraw-bg-${Date.now()}`;
        api.addFiles([{ mimeType: 'image/png', id: fileId as any, dataURL: bgImage as any, created: Date.now() }]);
        const [bgEl] = convertToExcalidrawElements([
          { type: 'image', id: BG_EL_ID, x: 0, y: 0, width: bgWidth, height: bgHeight, fileId } as any,
        ]);
        api.updateScene({ elements: [bgEl as any] });
        api.updateScene({ elements: [{ ...bgEl, locked: true } as any] });
        api.scrollToContent([bgEl as any], { fitToViewport: true, animate: false });
      } catch (e) {
        console.error('Excalidraw init failed', e);
      }
    },
    [bgImage, bgWidth, bgHeight]
  );

  const handleSave = async () => {
    const api = apiRef.current;
    if (!api || busy) return;
    setBusy(true);
    try {
      const elements = api.getSceneElements().filter((e) => e.id !== BG_EL_ID);
      const appState = api.getAppState();
      const files = api.getFiles();
      const blob = await exportToBlob({
        elements,
        appState,
        files,
        mimeType: 'image/png',
        quality: 1,
        getDimensions: () => ({ width: bgWidth, height: bgHeight, scale: 1 }),
      });
      const image = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const scene = serializeAsJSON(elements, appState, files, 'local');
      onSave({ image, imgW: bgWidth, imgH: bgHeight, scene });
    } catch (e) {
      console.error('Excalidraw export failed', e);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1600] bg-[#0a0f1e] flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 shrink-0 wco-aware">
        <i className="fas fa-bezier-curve text-[#a78bfa]"></i>
        <span className="text-neutral-300 text-[0.8rem] font-semibold truncate min-w-0 flex-1">
          Excalidraw — {title} (page {page})
        </span>
        <button
          className="pdf-btn"
          onClick={handleSave}
          disabled={busy}
          style={{ background: '#22c55e', color: 'white', borderRadius: '7px', minWidth: '72px' }}
        >
          {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check mr-1"></i>}Save
        </button>
        <button className="pdf-btn" onClick={onCancel} disabled={busy} title="Cancel">
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <Excalidraw
          excalidrawAPI={onInit}
          initialData={initialData}
          theme="dark"
          gridModeEnabled={false}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              toggleTheme: false,
            },
            tools: { image: true },
          }}
          name={`annotation-page-${page}`}
        />
      </div>
    </div>
  );
}
