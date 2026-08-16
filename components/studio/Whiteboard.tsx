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
  const [title, setTitle] = useState('Untitled');
  const sceneRef = useRef('');
  const titleRef = useRef('Untitled');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await getDraft(draftId);
      if (cancelled) return;
      sceneRef.current = draft?.scene ?? '';
      titleRef.current = draft?.title ?? 'Untitled';
      setTitle(titleRef.current);
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

  // Rename the board — title is persisted alongside the scene.
  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      titleRef.current = value;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (sceneRef.current) {
          dirtyRef.current = false;
          void saveDraft(draftId, titleRef.current, sceneRef.current);
        }
      }, 400);
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

  // Rebrand the embedded editor: rewrite Excalidraw labels shown in menus /
  // dialogs to IIUC-ARMS names. The strings are baked into the npm bundle, so
  // we patch rendered text nodes as Excalidraw mounts.
  useEffect(() => {
    if (loading) return;
    const root = editorRef.current;
    if (!root) return;
    const REWRITES: Array<[RegExp, string]> = [
      [/Mermaid to Excalidraw/gi, 'Mermaid to IIUC-ARMS-BOARD'],
      [/Excalidraw\+/gi, 'IIUC-ARMS+'],
      [/excalidraw\+/gi, 'IIUC-ARMS+'],
      [/Did you want to go to the IIUC-ARMS\+ instead\?/g, ''],
    ];
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text) return;
        let next = text;
        for (const [re, to] of REWRITES) next = next.replace(re, to);
        if (next !== text) node.textContent = next;
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName !== 'SCRIPT' &&
        (node as Element).tagName !== 'STYLE'
      ) {
        (node as Element).childNodes.forEach(walk);
      }
    };
    walk(root);
    const mo = new MutationObserver((muts) => {
      for (const mu of muts) {
        mu.addedNodes.forEach(walk);
        if (mu.type === 'characterData' && mu.target) walk(mu.target);
      }
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [loading]);

  // Bangla (Hind Siliguri) + Arabic (Aref Ruqaa) rendering in the default
  // handwriting font. Excalidraw's fonts lack these scripts, so we declare
  // our own @font-face for the same family ("Virgil") with unicode-range
  // fallbacks. This <style> is appended after the package's own font faces,
  // so it wins for Bangla/Arabic codepoints while Latin stays on Virgil.
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-whiteboard-fonts', '');
    style.textContent =
      "@font-face{font-family:'Virgil';font-style:normal;font-weight:400 700;font-display:swap;" +
      "src:url('/fonts/hind-siliguri-bengali.woff2') format('woff2');" +
      'unicode-range:U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1;}' +
      "@font-face{font-family:'Virgil';font-style:normal;font-weight:400 700;font-display:swap;" +
      "src:url('/fonts/aref-ruqaa-arabic.woff2') format('woff2');" +
      'unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EE03,U+1EE05-1EE1F,U+1EE21-1EE22,U+1EE24,U+1EE27,U+1EE29-1EE32,U+1EE34-1EE37,U+1EE39,U+1EE3B,U+1EE42,U+1EE47,U+1EE49,U+1EE4B,U+1EE4D-1EE4F,U+1EE51-1EE52,U+1EE54,U+1EE57,U+1EE59,U+1EE5B,U+1EE5D,U+1EE5F,U+1EE61-1EE62,U+1EE64,U+1EE67-1EE6A,U+1EE6C-1EE72,U+1EE74-1EE77,U+1EE79-1EE7C,U+1EE7E,U+1EE80-1EE89,U+1EE8B-1EE9B,U+1EEA1-1EEA3,U+1EEA5-1EEA9,U+1EEAB-1EEBB,U+1EEF0-1EEF1;}';
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/studio/whiteboard"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dark-border bg-dark-bg px-3 py-1.5 text-[0.72rem] font-semibold text-dark-text no-underline transition hover:border-indigo-500 hover:text-indigo-400"
          >
            <i className="fas fa-arrow-left"></i> Back
          </Link>
          <Link
            href="/studio"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dark-border bg-dark-bg px-3 py-1.5 text-[0.72rem] font-semibold text-dark-text no-underline transition hover:border-indigo-500 hover:text-indigo-400"
          >
            <i className="fas fa-grid-2"></i> Studio
          </Link>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={(e) => handleTitleChange(e.target.value.trim() || 'Untitled')}
            placeholder="Board title"
            aria-label="Board title"
            className="w-36 min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[0.78rem] font-semibold text-dark-text outline-none transition focus:border-dark-border focus:bg-dark-bg sm:w-52"
          />
          <span className="hidden shrink-0 text-[0.68rem] text-dark-text3 md:block">
            <i className="fas fa-save mr-1"></i>Autosaved on this device
          </span>
        </div>
        <span className="hidden shrink-0 text-[0.65rem] text-dark-text3 sm:block">
          Draw freely — the canvas fills the whole screen
        </span>
      </div>

      <div ref={editorRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
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
