'use client';

import { useState, useEffect } from 'react';
import { showToast } from '@/lib/utils';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  currentName: string;
  onRename: (from: string, newName: string) => Promise<void>;
}

export default function RenameModal({ isOpen, onClose, filePath, currentName, onRename }: RenameModalProps) {
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    if (isOpen) setNewName(currentName);
  }, [isOpen, currentName]);

  const handleRename = async () => {
    if (!newName.trim()) {
      showToast('Enter a name', 'error');
      return;
    }
    if (newName.trim() === currentName) {
      onClose();
      return;
    }
    setLoading(true);
    try {
      await onRename(filePath, newName.trim());
      onClose();
    } catch (e: any) {
      showToast(e.message || 'Rename failed', 'error');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[200]" onClick={onClose} />
      <div className={`fixed z-[201] bg-dark-bg2 border border-dark-border shadow-2xl
        ${isMobile
          ? 'bottom-0 left-0 right-0 rounded-t-2xl'
          : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl w-[400px]'
        } flex flex-col overflow-hidden`}
      >
        <div className="px-4 pt-4 pb-3 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fas fa-i-cursor text-amber-400"></i>
            <h3 className="font-semibold text-[0.95rem]">Rename</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-dark-bg3 text-dark-text2">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="px-4 pt-3 pb-2">
          <div className="text-[0.7rem] text-dark-text3 mb-1">Current path:</div>
          <div className="text-[0.8rem] text-dark-text font-mono truncate bg-dark-bg rounded-lg px-3 py-2 border border-dark-border">
            {filePath}
          </div>
        </div>

        <div className="px-4 py-3">
          <div className="text-[0.7rem] text-dark-text3 mb-1.5">New name:</div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            autoFocus
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-[0.85rem] text-dark-text focus:outline-none focus:border-qsis"
            placeholder="Enter new name"
          />
        </div>

        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleRename}
            disabled={loading || !newName.trim()}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-[0.82rem] font-semibold hover:bg-amber-500/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <><i className="fas fa-spinner fa-spin mr-1.5"></i>Renaming...</>
            ) : (
              <><i className="fas fa-i-cursor mr-1.5"></i>Rename</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
