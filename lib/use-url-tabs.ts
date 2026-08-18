'use client';

import { useCallback, useEffect } from 'react';

export function getUrlParam(name: string): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) || '';
}

export function writeUrlParams(updates: Record<string, string | null>): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}

export function useUrlTab<T extends string>(
  param: string,
  value: T,
  setValue: (v: T) => void,
  allowed: readonly T[],
  enabled: boolean = true
): (next: T) => void {
  const syncFromUrl = useCallback(() => {
    const v = getUrlParam(param);
    if (v && (allowed as readonly string[]).includes(v) && v !== value) {
      setValue(v as T);
    }
  }, [param, allowed, value, setValue]);

  useEffect(() => {
    if (!enabled) return;
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [syncFromUrl, enabled]);

  return useCallback(
    (next: T) => {
      if (next !== value) setValue(next);
      if (enabled) writeUrlParams({ [param]: next });
    },
    [param, value, setValue, enabled]
  );
}
