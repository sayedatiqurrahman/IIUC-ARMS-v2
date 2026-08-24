import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';

async function canManageEvents(email: string, clubId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  if (config.isAdminOrAbove(email, profile?.role)) return true;
  if (config.isManager(email, profile?.role)) return true;
  if (await hasPermission('manageClubEvents', role, false, email)) return true;
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: email } } });
  if (!member) return false;
  return ['gs', 'ags', 'ogs', 'office_secretary'].includes(member.role);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(_req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });
    const events = await prisma.clubEvent.findMany({
      where: { clubId: club.id },
      orderBy: { eventDate: 'desc' },
    });
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.faculty);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    const { prisma } = await import('@/lib/prisma');
    const club = await prisma.club.findUnique({ where: { slug } });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    if (!(await canManageEvents(email, club.id))) {
      return NextResponse.json({ error: 'Not authorized to create events' }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, eventDate, venue } = body;
    if (!title?.trim()) return NextResponse.json({ error: 'Event title required' }, { status: 400 });

    const event = await prisma.clubEvent.create({
      data: {
        clubId: club.id,
        title: title.trim(),
        description: description || null,
        eventDate: eventDate ? new Date(eventDate) : null,
        venue: venue || null,
        createdBy: email,
      },
    });

    return NextResponse.json({ success: true, event });
  } catch {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
