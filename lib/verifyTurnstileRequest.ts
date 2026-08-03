import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify Turnstile token from request headers or body.
 * Returns { success: true } or { success: false, response: NextResponse }.
 * 
 * Usage in API routes:
 *   const turnstile = await verifyTurnstileRequest(req);
 *   if (!turnstile.success) return turnstile.response!;
 */
export async function verifyTurnstileRequest(
  req: NextRequest,
  options?: { skipIfNoSecret?: boolean; body?: any }
): Promise<{ success: boolean; response?: NextResponse }> {
  const secretKey = process.env.TURNSTILE_SECRET;

  // If no secret configured, skip verification (dev mode)
  if (!secretKey && options?.skipIfNoSecret !== false) {
    return { success: true };
  }

  if (!secretKey) {
    return { success: true };
  }

  // Check for Turnstile token in headers first, then body
  let token = req.headers.get('x-cf-turnstile-response');

  if (!token && options?.body) {
    token = options.body['cf-turnstile-response'] || options.body.turnstileToken;
  }

  if (!token) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Bot verification required. Please complete the verification.' },
        { status: 403 }
      ),
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (ip) formData.append('remoteip', ip);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const data = await res.json();
    if (data.success) {
      return { success: true };
    }

    return {
      success: false,
      response: NextResponse.json(
        { error: 'Bot verification failed. Please try again.' },
        { status: 403 }
      ),
    };
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Verification service unavailable.' },
        { status: 503 }
      ),
    };
  }
}
