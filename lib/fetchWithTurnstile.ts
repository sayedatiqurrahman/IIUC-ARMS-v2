'use client';

/**
 * Fetch with automatic Turnstile token injection.
 * Reads the token from the pre-rendered Turnstile widget.
 */
export async function fetchWithTurnstile(url: string, options: RequestInit = {}): Promise<Response> {
  // Try to get Turnstile token from any rendered widget
  let turnstileToken = '';
  try {
    const container = document.querySelector('[data-turnstile-token]');
    turnstileToken = container?.getAttribute('data-turnstile-token') || '';
  } catch {}

  // Also try window.turnstile.getResponse if available
  if (!turnstileToken && typeof window !== 'undefined' && window.turnstile) {
    try {
      const widgets = document.querySelectorAll('.cf-turnstile');
        Array.from(widgets).forEach(w => {
          const id = (w as any).dataset?.widgetId;
          if (id) {
            const token = window.turnstile.getResponse(id);
            if (token) { turnstileToken = token; }
          }
        });
    } catch {}
  }

  const headers = new Headers(options.headers);
  if (turnstileToken) {
    headers.set('x-cf-turnstile-response', turnstileToken);
  }

  return fetch(url, { ...options, headers });
}
