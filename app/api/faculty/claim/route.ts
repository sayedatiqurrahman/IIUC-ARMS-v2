import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/faculty/claim — Teacher claims a faculty profile
 * Body: { facultyId: string }
 * Links the logged-in user to a FacultyMember entry.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { facultyId } = await req.json();
    if (!facultyId) return NextResponse.json({ error: 'facultyId required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const { config } = await import('@/lib/config');

    const role = config.getEffectiveRole(email, undefined);
    if (role !== 'teacher' && role !== 'admin') {
      return NextResponse.json({ error: 'Only teachers can claim faculty profiles' }, { status: 403 });
    }

    const member = await prisma.facultyMember.findUnique({ where: { id: facultyId } });
    if (!member) return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 });

    const existing = await prisma.facultyMember.findFirst({ where: { claimedBy: email } });
    if (existing) {
      return NextResponse.json({ error: 'You already claimed a profile', claimedId: existing.id }, { status: 409 });
    }

    if (member.claimedBy && member.claimedBy !== email) {
      return NextResponse.json({ error: 'This profile is already claimed by another teacher' }, { status: 409 });
    }

    const updated = await prisma.facultyMember.update({
      where: { id: facultyId },
      data: { claimedBy: email },
    });

    return NextResponse.json({ success: true, member: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to claim profile' }, { status: 500 });
  }
}

/**
 * DELETE /api/faculty/claim — Unclaim a faculty profile
 * Body: { facultyId: string }
 */
export async function DELETE(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { facultyId } = await req.json();
    if (!facultyId) return NextResponse.json({ error: 'facultyId required' }, { status: 400 });

    const { prisma } = await import('@/lib/prisma');
    const { config } = await import('@/lib/config');

    const member = await prisma.facultyMember.findUnique({ where: { id: facultyId } });
    if (!member) return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 });

    const role = config.getEffectiveRole(email, undefined);
    const isAdminOrOwner = role === 'admin' || member.claimedBy === email;

    if (!isAdminOrOwner) {
      return NextResponse.json({ error: 'Not authorized to unclaim this profile' }, { status: 403 });
    }

    const updated = await prisma.facultyMember.update({
      where: { id: facultyId },
      data: { claimedBy: null },
    });

    return NextResponse.json({ success: true, member: updated });
  } catch {
    return NextResponse.json({ error: 'Failed to unclaim profile' }, { status: 500 });
  }
}
