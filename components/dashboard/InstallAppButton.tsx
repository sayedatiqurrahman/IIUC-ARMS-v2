'use client';

import { useState, useEffect, useCallback } from 'react';
import { showToast } from '@/lib/utils';
import { isStandalone } from '@/lib/standalone';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      showToast('App installed', 'success');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        showToast('Installing IIUC-ARMS...', 'success');
      }
      setDeferredPrompt(null);
      return;
    }
    if (isIOS()) {
      setShowIosHelp(true);
      return;
    }
    showToast('Use your browser menu → Install app / Add to Home screen', 'info');
  }, [deferredPrompt]);

  if (installed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-[0.72rem] font-medium">
        <i className="fas fa-check"></i> App installed
      </span>
    );
  }

  return (
    <>
      <button
        onClick={handleInstall}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-[0.72rem] font-semibold border border-green-500/20 hover:bg-green-500/25 cursor-pointer transition-all"
        title="Install IIUC-ARMS on this device"
      >
        <i className="fas fa-download"></i> Install App
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowIosHelp(false)}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <i className="fas fa-mobile-alt text-qsis"></i>
              <h4 className="text-[0.9rem] font-bold text-dark-text">Install IIUC-ARMS</h4>
            </div>
            <p className="text-[0.78rem] text-dark-text2 mb-3">On iPhone/iPad, use your browser's Share menu to add the app to your Home Screen:</p>
            <ol className="text-[0.78rem] text-dark-text2 space-y-1.5 list-decimal list-inside mb-3">
              <li>Tap the <strong className="text-dark-text">Share</strong> button in Safari</li>
              <li>Tap <strong className="text-dark-text">Add to Home Screen</strong></li>
              <li>Tap <strong className="text-dark-text">Add</strong></li>
            </ol>
            <button onClick={() => setShowIosHelp(false)} className="w-full py-2 rounded-lg bg-qsis text-white text-[0.8rem] font-semibold cursor-pointer border-none">Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
