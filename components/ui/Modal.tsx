'use client';

import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function Modal({ isOpen, onClose, title, children, className = '' }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[200]" onClick={onClose} />
      <div
        className={`fixed z-[201] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-dark-bg2 border border-dark-border shadow-2xl rounded-2xl w-[95vw] max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden ${className}`}
      >
        {title && (
          <div className="px-4 pt-4 pb-3 border-b border-dark-border flex items-center justify-between">
            <h3 className="font-semibold text-[0.95rem]">{title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-dark-bg3 text-dark-text2">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>
    </>
  );
}
