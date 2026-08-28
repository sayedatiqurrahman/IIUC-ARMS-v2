import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function shortFormOf(member: any): string {
  return (member.shortForm || member.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)).toUpperCase();
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized — not signed in' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const body = await req.json();

    // ─── Unlink current faculty connection ───
    if (body.unlink === true) {
      const profile = await prisma.profile.findUnique({ where: { userId: email } });
      if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      await prisma.profile.update({
        where: { userId: email },
        data: { shortForm: null },
      });
      return NextResponse.json({ success: true, linked: false });
    }

    const facultyId = body.facultyId;
    if (!facultyId) return NextResponse.json({ error: 'facultyId required' }, { status: 400 });

    const member = await prisma.facultyMember.findUnique({ where: { id: facultyId } });
    if (!member) return NextResponse.json({ error: 'Faculty member not found' }, { status: 404 });

    // Only university faculty accounts or admins may claim a teacher profile
    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin' && !/@iiuc\.ac\.bd$/i.test(email)) {
      return NextResponse.json({ error: 'Only university faculty accounts can connect a teacher profile' }, { status: 403 });
    }

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const shortForm = shortFormOf(member);

    // A faculty profile can only be linked to one account at a time
    if (member.shortForm) {
      const existing = await prisma.profile.findFirst({
        where: { shortForm: member.shortForm, userId: { not: email } },
        select: { name: true, userId: true },
      });
      if (existing) {
        return NextResponse.json({
          error: `This faculty profile is already linked to another account (${existing.name || existing.userId}). Ask an admin to unlink it first.`,
        }, { status: 409 });
      }
    }

    // Persist the short form onto the faculty member too so the link stays discoverable
    if (!member.shortForm) {
      await prisma.facultyMember.update({ where: { id: member.id }, data: { shortForm } });
    }

    // The claim connection (account ↔ faculty profile) must also live in the
    // cloud data repo, so mirror this department's file.
    try { const { mirrorDepartmentToCloud } = await import('@/lib/faculty-data'); await mirrorDepartmentToCloud(member.department); } catch {}

    const updated = await prisma.profile.update({
      where: { userId: email },
      data: {
        shortForm,
        department: member.department,
        name: profile?.name || member.name,
        title: profile?.title || member.title || null,
      },
    });

    return NextResponse.json({
      success: true,
      linked: true,
      shortForm: updated.shortForm,
      member: { id: member.id, name: member.name, department: member.department, shortForm },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to link faculty profile' }, { status: 500 });
  }
}
