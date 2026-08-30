import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Lightweight public lookup used by the login flow to decide whether a
// non-university email should be pushed through the "use your university email
// or request access with your student ID" gate instead of a normal sign-in.
// Returns nothing sensitive — just whether the address is a university email,
// is a linked (secondary) identity of an approved account, and its approval
// status (null = no profile has ever been created for it).
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim();
  const empty = { university: false, linked: false, status: null, needsApproval: false };
  if (!email || !email.includes('@')) {
    return NextResponse.json(empty);
  }

  const { isIiucEmail, resolveLinkedEmail } = await import('@/lib/linked-accounts');
  const { prisma } = await import('@/lib/prisma');

  let status: string | null = null;
  try {
    const profile = await prisma.profile.findUnique({
      where: { userId: email },
      select: { accountStatus: true },
    });
    status = profile?.accountStatus || null;
  } catch {
    status = null;
  }

  const university = isIiucEmail(email);
  const linked = !!(await resolveLinkedEmail(email));
  const needsApproval = !university && !linked && status !== 'active';

  return NextResponse.json({ university, linked, status, needsApproval });
}