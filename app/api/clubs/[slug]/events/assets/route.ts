import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { eventAssetsFolder } from '@/lib/club-data';

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function canManageEvents(email: string, clubId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const { hasPermission } = await import('@/lib/permissions');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  const role = config.getEffectiveRole(email, profile?.role);
  if (config.isAdminOrAbove(email, profile?.role)) return true;
  if (config.isManager(email, profile?.role)) return true;
  if (await hasPermission('manageClubEvents', role, false, email)) return true;
  const member = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId, userId: email } } });
  if (!member) return false;
  return ['gs', 'ags', 'ogs', 'office_secretary'].includes(member.role);
}

async function getFileSha(path: string, token: string): Promise<string | null> {
  try {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}?ref=${config.branch}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha || null;
  } catch {
    return null;
  }
}

// Upload one event image (data URI) into clubs/{slug}/events/{folder}/assets/.
// Used for the event cover and for gallery photos.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
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
    const { eventId, image, kind } = body;
    if (!eventId) return NextResponse.json({ error: 'Event id required' }, { status: 400 });
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image data required (data URI)' }, { status: 400 });
    }

    const event = await prisma.clubEvent.findUnique({ where: { id: eventId } });
    if (!event || event.clubId !== club.id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const match = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid image format. Expected data:image/...;base64,...' }, { status: 400 });
    }

    const isCover = kind === 'cover';
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64Data = match[2];

    const { getRepoBotToken } = await import('@/lib/github-app');
    const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN;
    if (!token) return NextResponse.json({ error: 'GitHub not configured' }, { status: 500 });

    // Stable per-event folder so renames do not orphan uploaded images.
    let assetsPath = event.assetsPath;
    if (!assetsPath) {
      assetsPath = eventAssetsFolder(club.slug, event.title, event.eventDate?.toISOString());
      await prisma.clubEvent.update({ where: { id: event.id }, data: { assetsPath } });
    }

    const stamp = Date.now().toString(36);
    const baseName = `${isCover ? 'cover' : 'photo'}-${stamp}`;
    const filePath = `${assetsPath}/assets/${baseName}.${ext}`;

    const existingSha = await getFileSha(filePath, token);
    const putBody: any = {
      message: `Upload event ${isCover ? 'cover' : 'photo'}: ${event.title} (${slug})`,
      content: base64Data,
      branch: config.branch,
    };
    if (existingSha) putBody.sha = existingSha;

    const putUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
    const putRes = await fetch(putUrl, { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(putBody) });
    if (!putRes.ok) return NextResponse.json({ error: 'Failed to upload image to GitHub' }, { status: 500 });

    const imageUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${filePath}`;

    let coverUrl = event.coverUrl;
    let gallery: string[] = (() => { try { return JSON.parse(event.gallery || '[]'); } catch { return []; } })();
    if (isCover) {
      coverUrl = imageUrl;
    } else {
      gallery = [...gallery.filter(u => u !== imageUrl), imageUrl];
    }
    await prisma.clubEvent.update({
      where: { id: event.id },
      data: { coverUrl, gallery: JSON.stringify(gallery) },
    });

    return NextResponse.json({ success: true, coverUrl, gallery, imageUrl });
  } catch {
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

// Remove an event image: accepts { eventId, kind: 'cover'|'gallery', url }.
// Deletes the file from GitHub and updates the event row.
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
    const { eventId, kind, url } = body;
    if (!eventId || !url) return NextResponse.json({ error: 'eventId and url required' }, { status: 400 });

    const event = await prisma.clubEvent.findUnique({ where: { id: eventId } });
    if (!event || event.clubId !== club.id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Best-effort GitHub delete.
    if (event.assetsPath) {
      const { getRepoBotToken } = await import('@/lib/github-app');
      const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN;
      if (token) {
        const fileName = decodeURIComponent(url).match(/\/([^/]+?)(?:\?|$)/)?.[1];
        if (fileName) {
          const path = `${event.assetsPath}/assets/${fileName}`;
          const sha = await getFileSha(path, token);
          if (sha) {
            await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`, {
              method: 'DELETE',
              headers: ghHeaders(token),
              body: JSON.stringify({ message: `Remove event asset: ${fileName}`, branch: config.branch, sha }),
            });
          }
        }
      }
    }

    if (kind === 'cover') {
      await prisma.clubEvent.update({ where: { id: event.id }, data: { coverUrl: null } });
    } else {
      const gallery: string[] = (() => { try { return JSON.parse(event.gallery || '[]'); } catch { return []; } })();
      await prisma.clubEvent.update({ where: { id: event.id }, data: { gallery: JSON.stringify(gallery.filter(u => u !== url)) } });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to remove image' }, { status: 500 });
  }
}