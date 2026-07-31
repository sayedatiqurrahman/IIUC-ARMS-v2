'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';

function OpenHandler() {
  const searchParams = useSearchParams();
  const target = searchParams.get('url') || '/';
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    setIsTelegram(ua.includes('Telegram'));
  }, []);

  useEffect(() => {
    if (!isTelegram) {
      window.location.href = target;
    }
  }, [isTelegram, target]);

  if (!isTelegram) return null;

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        <Image src="/arms-logo-icon.png" alt="IIUC-ARMS" width={80} height={80} className="mx-auto mb-4 rounded-xl" />
        <h1 className="text-white text-xl font-bold mb-2">Open in Browser</h1>
        <p className="text-gray-400 text-sm mb-6">
          To use the installed app, open this link in your browser (Chrome, Edge, etc.)
        </p>
        <div className="bg-[#1e293b] border border-gray-700 rounded-xl p-4 mb-4">
          <p className="text-gray-300 text-xs mb-3">Tap the <strong>three dots (⋮)</strong> above, then:</p>
          <div className="flex items-center gap-2 text-sm text-white">
            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">1</span>
            <span>Tap <strong>Open in Chrome</strong> or <strong>Open in Browser</strong></span>
          </div>
        </div>
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-full py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition-colors"
        >
          Open IIUC-ARMS
        </a>
        <p className="text-gray-500 text-xs mt-3">Or copy this link and paste it in your browser:</p>
        <p className="text-blue-400 text-xs mt-1 break-all">{typeof window !== 'undefined' ? window.location.origin + target : ''}</p>
      </div>
    </div>
  );
}

export default function OpenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a]" />}>
      <OpenHandler />
    </Suspense>
  );
}
