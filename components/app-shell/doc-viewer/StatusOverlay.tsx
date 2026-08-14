'use client';

interface StatusOverlayProps {
  status: 'loading' | 'ready' | 'error';
  error: string;
  variant: 'pdf' | 'docx';
  openHref: string;
  absolute?: boolean;
}

export default function StatusOverlay({ status, error, variant, openHref, absolute = false }: StatusOverlayProps) {
  if (status === 'ready') return null;
  const pdf = variant === 'pdf';
  const base = absolute ? 'absolute inset-0 bg-[#0a0f1e]' : 'min-h-[60vh]';
  const container = `flex flex-col items-center justify-center text-dark-text2 ${base} ${status === 'error' ? 'px-6 text-center' : ''}`;

  if (status === 'loading') {
    return (
      <div className={container}>
        {pdf ? (
          <>
            <div
              style={{
                width: 36,
                height: 36,
                border: '3px solid rgba(255,255,255,0.15)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            ></div>
            <p className="text-[0.8rem] mt-3">Loading PDF...</p>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-qsis border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm">Loading document…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={container}>
      <i className={`${pdf ? 'fas fa-file-pdf' : 'fas fa-file-word'} text-4xl mb-3 text-red-400`}></i>
      <p className="text-sm mb-1">{pdf ? 'Could not open this PDF.' : 'Could not open this document.'}</p>
      <p className="text-[0.78rem] text-dark-text3 mb-4">{error}</p>
      <a href={openHref} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-qsis text-white text-sm font-semibold no-underline">
        <i className="fas fa-external-link-alt mr-1"></i>Open in new tab
      </a>
    </div>
  );
}
