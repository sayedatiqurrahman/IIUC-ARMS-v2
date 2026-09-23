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
    const { title, description, eventDate, venue, theme } = body;
    if (!title?.trim()) return NextResponse.json({ error: 'Event title required' }, { status: 400 });

    const event = await prisma.clubEvent.create({
      data: {
        clubId: club.id,
        title: title.trim(),
        description: description || null,
        eventDate: eventDate ? new Date(eventDate) : null,
        venue: venue || null,
        theme: theme ? JSON.stringify(theme) : null,
        createdBy: email,
      },
    });

    return NextResponse.json({ success: true, event });
  } catch {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
      return NextResponse.json({ error: 'Not authorized to manage events' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'Event id required' }, { status: 400 });

    const data: any = {};
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim();
    if (typeof body.description === 'string') data.description = body.description || null;
    if (body.eventDate !== undefined) data.eventDate = body.eventDate ? new Date(body.eventDate) : null;
    if (typeof body.venue === 'string') data.venue = body.venue || null;
    if (body.theme !== undefined) data.theme = body.theme ? JSON.stringify(body.theme) : null;
    if (body.coverUrl !== undefined) data.coverUrl = body.coverUrl || null;
    if (body.gallery !== undefined) data.gallery = JSON.stringify(body.gallery || []);
    if (typeof body.assetsPath === 'string') data.assetsPath = body.assetsPath || null;

    const event = await prisma.clubEvent.update({
      where: { id: body.id },
      data,
    });

    return NextResponse.json({ success: true, event });
  } catch {
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

async function deleteGitHubFile(assetsPath: string, fileName: string): Promise<boolean> {
  try {
    const { getRepoBotToken } = await import('@/lib/github-app');
    const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN;
    if (!token) return false;
    const path = `${assetsPath}/assets/${fileName}`;
    const headUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`;
    const headRes = await fetch(headUrl, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (!headRes.ok) return false;
    const meta = await headRes.json();
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `Remove event asset: ${fileName}`, branch: config.branch, sha: meta.sha }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
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
      return NextResponse.json({ error: 'Not authorized to manage events' }, { status: 403 });
    }

    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'Event id required' }, { status: 400 });

    const event = await prisma.clubEvent.findUnique({ where: { id } });
    if (!event || event.clubId !== club.id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Detach certificates so they keep their text but stop pointing at a dead event.
    await prisma.clubCertificate.updateMany({
      where: { eventId: id },
      data: { eventId: null },
    });

    await prisma.clubEvent.delete({ where: { id } });

    // Best-effort: remove the event's uploaded images from GitHub.
    if (event.assetsPath) {
      const gallery = (() => { try { return JSON.parse(event.gallery || '[]'); } catch { return []; } })() as string[];
      const urls = [event.coverUrl, ...gallery].filter((u: any): u is string => !!u);
      const names = Array.from(new Set(urls.map(u => {
        const m = decodeURIComponent(u).match(/\/([^/]+?)(?:\?|$)/);
        return m ? m[1] : '';
      }).filter(Boolean)));
      await Promise.all(names.map((n: string) => deleteGitHubFile(event.assetsPath!, n)));
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
