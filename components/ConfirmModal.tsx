'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, message: '' });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
    setState(s => ({ ...s, open: false }));
  }, []);

  const confirmDialog = state.open ? (
    <ConfirmModalUI
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => handleClose(true)}
      onCancel={() => handleClose(false)}
    />
  ) : <></>;

  return { confirm, confirmDialog };
}

function ConfirmModalUI({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ zIndex: 99999, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdrop}
    >
      <div
        className={`bg-dark-bg2 border border-dark-border rounded-2xl shadow-2xl max-w-sm w-full p-5 transition-all duration-150 ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        {title && <h3 className="text-[0.9rem] font-bold text-dark-text mb-2">{title}</h3>}
        <p className="text-[0.82rem] text-dark-text2 mb-5 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-[0.8rem] font-medium bg-dark-bg3 text-dark-text2 border border-dark-border hover:bg-dark-border transition-all cursor-pointer">{cancelLabel}</button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-[0.8rem] font-semibold transition-all cursor-pointer border-none ${danger ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-qsis text-white hover:bg-qsis-dark'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
