import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Lightweight check: is this email a linked (secondary) email of some account?
// Used by the login form to recognize linked accounts (and avoid offering
// sign-up for emails that already belong to an account).
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ linked: false });
  }
  const { resolveLinkedEmail } = await import('@/lib/linked-accounts');
  const primary = await resolveLinkedEmail(email);
  return NextResponse.json({ linked: !!primary });
}