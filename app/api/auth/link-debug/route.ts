import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Diagnostic endpoint: reveals exactly why a non-university email is (or isn't)
// recognized as a linked identity. Returns non-sensitive resolution facts only.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim();
  if (!email.includes('@')) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const { prisma } = await import('@/lib/prisma');
  const { resolveLinkedEmail, isLinkedIdentity, isIiucEmail } = await import('@/lib/linked-accounts');

  const resolveLinked = await resolveLinkedEmail(email);

  const own = await prisma.profile.findUnique({
    where: { userId: email },
    select: { userId: true, accountStatus: true, role: true, profileType: true, isBanned: true, linkedEmails: true },
  }).catch(() => null);

  // Find which profile (if any) lists `email` in its linkedEmails.
  let listingProfile: string | null = null;
  try {
    const candidates = await prisma.profile.findMany({
      where: { NOT: [{ linkedEmails: '[]' }, { linkedEmails: null }] },
      select: { userId: true, linkedEmails: true },
    });
    for (const p of candidates) {
      let arr: string[] = [];
      try { arr = JSON.parse((p.linkedEmails as string) || '[]'); } catch { arr = []; }
      if (arr.some(e => (e || '').toLowerCase() === email)) { listingProfile = p.userId; break; }
    }
  } catch (e: any) { console.error('[link-debug] scan error:', e?.message); }

  return NextResponse.json({
    email,
    university: isIiucEmail(email),
    resolveLinkedEmail: resolveLinked || null,
    isLinkedIdentity: await isLinkedIdentity(email),
    listingProfile, // profile whose linkedEmails contains this email
    ownProfile: own
      ? {
          userId: own.userId,
          accountStatus: own.accountStatus,
          role: own.role,
          profileType: own.profileType || '',
          isBanned: own.isBanned,
          linkedEmailsLength: (() => { try { return JSON.parse(own.linkedEmails || '[]').length; } catch { return -1; } })(),
        }
      : null,
  });
}
