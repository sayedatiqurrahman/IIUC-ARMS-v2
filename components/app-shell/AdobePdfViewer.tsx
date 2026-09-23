'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';

interface AdobePdfViewerProps {
  bytes: ArrayBuffer;
  fileName: string;
  onFallback: (reason?: string) => void;
}

const FALLBACK_CLIENT_ID = '4ea26969b1694366af6bcfd4cff60671';
const SDK_SRC = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';

declare global {
  interface Window {
    AdobeDC?: any;
  }
}

function waitForSdk(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.AdobeDC && window.AdobeDC.View) return resolve(true);
    const start = Date.now();
    const check = () => {
      if (window.AdobeDC && window.AdobeDC.View) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, 150);
    };
    check();
  });
}

function ensureSdk(): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (document.querySelector(`script[src="${SDK_SRC}"]`) || (window.AdobeDC && window.AdobeDC.View)) {
    return waitForSdk(6000);
  }
  const s = document.createElement('script');
  s.src = SDK_SRC;
  s.async = true;
  document.head.appendChild(s);
  return waitForSdk(9000);
}

export default function AdobePdfViewer({ bytes, fileName, onFallback }: AdobePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackTimer = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failReason, setFailReason] = useState('');
  const { data: session } = useSession();
  const profile = useAppStore((s) => s.profile);

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_ADOBE_PDF_CLIENT_ID || FALLBACK_CLIENT_ID;

    const doFallback = (reason?: string) => {
      if (cancelled || resolvedRef.current) return;
      resolvedRef.current = true;
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
      setPhase('failed');
      setFailReason(reason || '');
      onFallback(reason);
    };

    (async () => {
      const ok = await ensureSdk();
      if (cancelled) return;
      if (!ok) return doFallback('Adobe View SDK could not be loaded.');

      try {
        const div = containerRef.current;
        if (!div) return doFallback('Viewer container not found.');

        // The SDK complains if it finds a stale container from a previous run.
        if (div.querySelector('iframe')) {
          div.innerHTML = '';
        }

        const adobeDCView = new window.AdobeDC.View({ clientId, divId: 'adobe-dc-view' });

        // Mark success as soon as the SDK confirms the viewer mounted.
        adobeDCView.registerCallback(window.AdobeDC.View.Enum.CallbackType.EVENT_LISTENER, (event: any) => {
          const t = String(event?.type || '');
          if (!resolvedRef.current && /document\.(loaded|ready|metaData|redirect)/.test(t)) {
            resolvedRef.current = true;
            if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
            setPhase('ready');
          }
          if (/error|invalid|exception|failed/i.test(t) && !/download/i.test(t)) {
            const desc = String(event?.description || '');
            const code = String(event?.code || '');
            doFallback(desc ? `${t}: ${desc}` : code ? `Adobe error (${code})` : `Adobe error: ${t}`);
          }
        });

        const userInfo = {
          id: String(profile.universityId || (session as any)?.user?.email || profile.email || 'anonymous'),
          displayName: String(profile.name || (session as any)?.user?.name || (session as any)?.user?.email || 'Reader'),
        };

        adobeDCView.previewFile(
          {
            content: { file: new File([bytes], fileName, { type: 'application/pdf' }) },
            metaData: { fileName },
          },
          {
            embedMode: 'IN_LINE',
            showAnnotationTools: true,
            annotationConfig: {
              isAuthorizedToEdit: true,
              userInfo,
            },
            showDownloadPDF: true,
            showPrintPDF: true,
            showLeftHandPanel: true,
            showPageControls: true,
            defaultViewMode: 'FIT_WIDTH',
          }
        );

        // Safety net: if the viewer iframe never mounts, fall back.
        fallbackTimer.current = window.setTimeout(() => {
          if (resolvedRef.current) return;
          const mounted = div.querySelector('iframe');
          doFallback(
            mounted
              ? 'Adobe viewer iframe mounted but no document event arrived.'
              : 'Adobe viewer did not mount (likely the credential is not registered for this domain — check NEXT_PUBLIC_ADOBE_PDF_CLIENT_ID in the Adobe console).'
          );
          void mounted;
        }, 8000);
      } catch (e: any) {
        doFallback(e?.message || 'Adobe SDK threw an error.');
      }
    })();

    return () => {
      cancelled = true;
      if (fallbackTimer.current) window.clearTimeout(fallbackTimer.current);
    };
  }, [bytes, fileName, onFallback, profile.universityId, profile.email, profile.name, session]);

  return (
    <div className="w-full h-full">
      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1e] z-10">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-spinner fa-spin text-blue-400 text-2xl"></i>
            </div>
            <p className="text-sm text-gray-400">Starting Adobe PDF viewer…</p>
            <p className="text-[0.7rem] text-gray-600 mt-1">Annotations, print &amp; download available inline</p>
          </div>
        </div>
      )}
      {phase === 'failed' && failReason && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1e] z-10">
          <div className="text-center max-w-sm px-4">
            <i className="fas fa-triangle-exclamation text-amber-400 text-3xl mb-3"></i>
            <p className="text-xs text-amber-200/90 leading-relaxed">{failReason}</p>
          </div>
        </div>
      )}
      <div ref={containerRef} id="adobe-dc-view" className="w-full h-full" style={{ visibility: phase === 'failed' ? 'hidden' : 'visible' }} />
    </div>
  );
}