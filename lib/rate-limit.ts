import { NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || '127.0.0.1';
}

function cleanup() {
  const now = Date.now();
  const entries = Array.from(store.entries());
  for (const [key, entry] of entries) {
    if (now > entry.resetAt) store.delete(key);
  }
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

export function rateLimit(req: NextRequest, config: RateLimitConfig): { success: boolean; response?: NextResponse } {
  cleanup();

  const ip = getClientIp(req);
  const path = req.nextUrl.pathname;
  const key = `${ip}:${path}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { success: true };
  }

  entry.count++;

  if (entry.count > config.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      success: false,
      response: NextResponse.json(
        { error: config.message || 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.max),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(entry.resetAt / 1000)),
          },
        }
      ),
    };
  }

  return { success: true };
}

// Preset rate limits
export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 10, message: 'Too many auth attempts. Try again in 15 minutes.' },
  upload: { windowMs: 60 * 1000, max: 10, message: 'Too many uploads. Wait a moment.' },
  // Chunk uploads make one request per 2.5MB, so a 50MB file is ~21 requests.
  chunk: { windowMs: 60 * 1000, max: 120, message: 'Too many chunk requests. Slow down.' },
  profile: { windowMs: 60 * 1000, max: 30, message: 'Too many profile requests. Slow down.' },
  admin: { windowMs: 60 * 1000, max: 60, message: 'Too many admin requests. Slow down.' },
  faculty: { windowMs: 60 * 1000, max: 30, message: 'Too many faculty requests. Slow down.' },
  general: { windowMs: 60 * 1000, max: 60, message: 'Too many requests. Slow down.' },
  turnstile: { windowMs: 60 * 1000, max: 20, message: 'Too many verification attempts.' },
  totp: { windowMs: 5 * 60 * 1000, max: 5, message: 'Too many TOTP attempts. Try again in 5 minutes.' },
} as const;
