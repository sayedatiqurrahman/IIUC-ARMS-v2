'use client';

import { useCallback, useRef } from 'react';
import { config } from '@/lib/config';

declare global {
  interface Window {
    turnstile: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        'expired-callback'?: () => void;
        theme?: string;
        action?: string;
      }) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | null;
    };
  }
}

const isDev = process.env.NODE_ENV === 'development';

export function useTurnstile() {
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(async (containerId: string, action: string = 'LOGIN'): Promise<string | null> => {
    if (isDev) return 'dev-bypass';

    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.turnstile) {
        resolve(null);
        return;
      }

      try {
        const container = document.getElementById(containerId);
        if (!container) { resolve(null); return; }

        const id = window.turnstile.render(container, {
          sitekey: config.turnstileSiteKey,
          action,
          theme: 'dark',
          callback: (token: string) => {
            container.setAttribute('data-turnstile-token', token);
          },
          'expired-callback': () => {
            container.setAttribute('data-turnstile-token', '');
          },
        });

        widgetIdRef.current = id;
        resolve(id);
      } catch {
        resolve(null);
      }
    });
  }, []);

  const getToken = useCallback((containerId: string): string | null => {
    if (isDev) return 'dev-bypass-token';
    const container = document.getElementById(containerId);
    return container?.getAttribute('data-turnstile-token') || null;
  }, []);

  const reset = useCallback(() => {
    if (isDev) return;
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  const remove = useCallback(() => {
    if (isDev) return;
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }
  }, []);

  return { renderWidget, getToken, reset, remove };
}
