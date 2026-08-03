import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { linkEmail } = body;

    if (!linkEmail || typeof linkEmail !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const normalizedEmail = linkEmail.toLowerCase().trim();
    if (normalizedEmail === email.toLowerCase()) {
      return NextResponse.json({ error: 'Cannot link your own email' }, { status: 400 });
    }

    // Check if this email is already used by another profile
    const existing = await prisma.profile.findUnique({ where: { userId: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: 'This email is already associated with another account' }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const currentLinked = (profile?.linkedEmails as string[]) || [];

    if (currentLinked.includes(normalizedEmail)) {
      return NextResponse.json({ error: 'Email already linked' }, { status: 400 });
    }

    // Check limit (max 5 linked emails)
    if (currentLinked.length >= 5) {
      return NextResponse.json({ error: 'Maximum 5 linked emails allowed' }, { status: 400 });
    }

    await prisma.profile.update({
      where: { userId: email },
      data: { linkedEmails: [...currentLinked, normalizedEmail] },
    });

    return NextResponse.json({ success: true, linkedEmails: [...currentLinked, normalizedEmail] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to link email' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { unlinkEmail } = body;

    if (!unlinkEmail || typeof unlinkEmail !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const currentLinked = (profile?.linkedEmails as string[]) || [];
    const updated = currentLinked.filter(e => e.toLowerCase() !== unlinkEmail.toLowerCase());

    await prisma.profile.update({
      where: { userId: email },
      data: { linkedEmails: updated },
    });

    return NextResponse.json({ success: true, linkedEmails: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to unlink email' }, { status: 500 });
  }
}
