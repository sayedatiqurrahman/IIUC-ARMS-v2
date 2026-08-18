'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentPath: string;
  onCreate: (folderName: string) => Promise<void>;
}

export default function CreateFolderModal({ isOpen, onClose, parentPath, onCreate }: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onCreate(trimmed);
      setName('');
      onClose();
    } catch {}
    setLoading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Folder">
      <div className="p-4">
        <p className="text-[0.78rem] text-dark-text2 mb-3">
          Creating inside: <span className="text-dark-text font-medium">{parentPath}</span>
        </p>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="Folder name"
          className="w-full px-3 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.85rem] text-dark-text focus:border-qsis outline-none"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="flex-1 py-2 rounded-xl bg-qsis text-white text-[0.85rem] font-semibold hover:brightness-110 transition cursor-pointer disabled:opacity-50"
          >
            {loading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : 'Create'}
          </button>
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.85rem] cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
