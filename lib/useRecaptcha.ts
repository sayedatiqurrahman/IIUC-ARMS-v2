'use client';

import { useCallback, useRef } from 'react';
import { config } from '@/lib/config';

declare global {
  interface Window {
    grecaptcha: {
      enterprise: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
        render: (container: string | HTMLElement, parameters: any) => number;
        reset: (widgetId?: number) => void;
      };
    };
  }
}

const isDev = process.env.NODE_ENV === 'development';

export function useRecaptcha() {
  const widgetIdRef = useRef<number | null>(null);

  const renderCheckbox = useCallback(async (containerId: string, action: string = 'LOGIN'): Promise<number | null> => {
    if (isDev) return 0;

    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.grecaptcha?.enterprise) {
        console.warn('reCAPTCHA not loaded');
        resolve(null);
        return;
      }

      window.grecaptcha.enterprise.ready(() => {
        try {
          const container = document.getElementById(containerId);
          if (!container) { resolve(null); return; }

          const id = window.grecaptcha.enterprise.render(container, {
            sitekey: config.recaptchaSiteKey,
            action,
            theme: 'dark',
            size: 'normal',
            callback: (token: string) => {
              container.setAttribute('data-recaptcha-token', token);
            },
            'expired-callback': () => {
              container.setAttribute('data-recaptcha-token', '');
            },
          });

          widgetIdRef.current = id;
          resolve(id);
        } catch (err) {
          console.error('reCAPTCHA render failed:', err);
          resolve(null);
        }
      });
    });
  }, []);

  const getToken = useCallback((containerId: string): string | null => {
    if (isDev) return 'dev-bypass-token';
    const container = document.getElementById(containerId);
    return container?.getAttribute('data-recaptcha-token') || null;
  }, []);

  const reset = useCallback(() => {
    if (isDev) return;
    if (widgetIdRef.current !== null && window.grecaptcha?.enterprise) {
      window.grecaptcha.enterprise.reset(widgetIdRef.current);
    }
  }, []);

  const executeRecaptcha = useCallback(async (action: string): Promise<string | null> => {
    if (isDev) return 'dev-bypass-token';

    try {
      if (typeof window === 'undefined' || !window.grecaptcha?.enterprise) {
        return null;
      }

      return new Promise((resolve) => {
        window.grecaptcha.enterprise.ready(async () => {
          try {
            const token = await window.grecaptcha.enterprise.execute(
              config.recaptchaSiteKey,
              { action }
            );
            resolve(token);
          } catch (err) {
            console.error('reCAPTCHA execution failed:', err);
            resolve(null);
          }
        });
      });
    } catch (err) {
      return null;
    }
  }, []);

  return { renderCheckbox, getToken, reset, executeRecaptcha };
}
