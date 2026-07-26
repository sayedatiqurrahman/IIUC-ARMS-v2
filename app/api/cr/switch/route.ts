import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    if (!callerProfile?.isCR) {
      return NextResponse.json({ error: 'Only CRs can use this feature' }, { status: 403 });
    }

    const body = await req.json();
    const { targetEmail } = body;
    if (!targetEmail || typeof targetEmail !== 'string') {
      return NextResponse.json({ error: 'Target email required' }, { status: 400 });
    }

    const targetProfile = await prisma.profile.findUnique({ where: { userId: targetEmail.toLowerCase() } });
    if (!targetProfile) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Target must be in same department, semester, section
    if (targetProfile.department !== callerProfile.department ||
        targetProfile.semester !== callerProfile.semester ||
        targetProfile.section !== callerProfile.section) {
      return NextResponse.json({ error: 'Target must be in the same department, semester, and section' }, { status: 400 });
    }

    // Target must not be admin
    const targetRole = config.getEffectiveRole(targetEmail.toLowerCase(), targetProfile.role || undefined);
    if (targetRole === 'admin') {
      return NextResponse.json({ error: 'Cannot transfer CR to an admin' }, { status: 400 });
    }

    // Already CR
    if (targetProfile.isCR) {
      return NextResponse.json({ error: 'Target is already a CR' }, { status: 400 });
    }

    // Transfer: caller loses CR, target becomes CR
    await prisma.profile.update({ where: { userId: email }, data: { isCR: false } });
    await prisma.profile.update({ where: { userId: targetEmail.toLowerCase() }, data: { isCR: true, isACR: false } });

    return NextResponse.json({ success: true, message: `CR transferred to ${targetProfile.name || targetEmail}` });
  } catch {
    return NextResponse.json({ error: 'Failed to transfer CR' }, { status: 500 });
  }
}
