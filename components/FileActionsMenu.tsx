'use client';

import { useState, useEffect, useRef } from 'react';

interface FileActionsMenuProps {
  filePath: string;
  fileName: string;
  isFolder?: boolean;
  onMove: () => void;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare?: () => void;
}

export default function FileActionsMenu({ filePath, fileName, isFolder, onMove, onCopy, onRename, onDelete, onShare }: FileActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (isMobile) {
    return (
      <>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className="w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] bg-transparent border border-dark-border text-dark-text2 hover:bg-dark-bg3 hover:text-qsis hover:border-qsis transition-all"
          title="Actions"
        >
          <i className="fas fa-ellipsis-v"></i>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-[201] bg-dark-bg2 border-t border-dark-border rounded-t-2xl p-4 pb-6">
              <div className="w-10 h-1 bg-dark-border rounded-full mx-auto mb-4"></div>
              <div className="text-[0.75rem] text-dark-text3 mb-3 truncate font-mono">{fileName}</div>
              <div className="flex flex-col gap-1.5">
                {onShare && (
                  <button onClick={() => { setOpen(false); onShare(); }} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dark-bg text-left transition-colors">
                    <i className="fas fa-share-nodes text-green-400 w-5 text-center"></i>
                    <span className="text-[0.85rem]">Share</span>
                  </button>
                )}
                <button onClick={() => { setOpen(false); onMove(); }} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dark-bg text-left transition-colors">
                  <i className="fas fa-arrows-alt text-cyan-400 w-5 text-center"></i>
                  <span className="text-[0.85rem]">Move</span>
                </button>
                <button onClick={() => { setOpen(false); onCopy(); }} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dark-bg text-left transition-colors">
                  <i className="fas fa-copy text-teal-400 w-5 text-center"></i>
                  <span className="text-[0.85rem]">Copy</span>
                </button>
                <button onClick={() => { setOpen(false); onRename(); }} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-dark-bg text-left transition-colors">
                  <i className="fas fa-i-cursor text-amber-400 w-5 text-center"></i>
                  <span className="text-[0.85rem]">Rename</span>
                </button>
                <button onClick={() => { setOpen(false); onDelete(); }} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-left transition-colors">
                  <i className="fas fa-trash text-red-400 w-5 text-center"></i>
                  <span className="text-[0.85rem] text-red-400">Delete</span>
                </button>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-[30px] h-[30px] rounded-md inline-flex items-center justify-center text-[0.8rem] bg-transparent border border-dark-border text-dark-text2 hover:bg-dark-bg3 hover:text-qsis hover:border-qsis transition-all"
        title="Actions"
      >
        <i className="fas fa-ellipsis-v"></i>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-dark-bg2 border border-dark-border rounded-xl shadow-xl py-1.5 z-50 min-w-[160px]">
          {onShare && (
            <button onClick={() => { setOpen(false); onShare(); }} className="flex items-center gap-2.5 px-4 py-2 w-full text-left hover:bg-dark-bg text-[0.82rem] transition-colors">
              <i className="fas fa-share-nodes text-green-400 w-4 text-center text-[0.75rem]"></i> Share
            </button>
          )}
          <button onClick={() => { setOpen(false); onMove(); }} className="flex items-center gap-2.5 px-4 py-2 w-full text-left hover:bg-dark-bg text-[0.82rem] transition-colors">
            <i className="fas fa-arrows-alt text-cyan-400 w-4 text-center text-[0.75rem]"></i> Move
          </button>
          <button onClick={() => { setOpen(false); onCopy(); }} className="flex items-center gap-2.5 px-4 py-2 w-full text-left hover:bg-dark-bg text-[0.82rem] transition-colors">
            <i className="fas fa-copy text-teal-400 w-4 text-center text-[0.75rem]"></i> Copy
          </button>
          <button onClick={() => { setOpen(false); onRename(); }} className="flex items-center gap-2.5 px-4 py-2 w-full text-left hover:bg-dark-bg text-[0.82rem] transition-colors">
            <i className="fas fa-i-cursor text-amber-400 w-4 text-center text-[0.75rem]"></i> Rename
          </button>
          <div className="my-1 border-t border-dark-border"></div>
          <button onClick={() => { setOpen(false); onDelete(); }} className="flex items-center gap-2.5 px-4 py-2 w-full text-left hover:bg-red-500/10 text-[0.82rem] text-red-400 transition-colors">
            <i className="fas fa-trash w-4 text-center text-[0.75rem]"></i> Delete
          </button>
        </div>
      )}
    </div>
  );
}
