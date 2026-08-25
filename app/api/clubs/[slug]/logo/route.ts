import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { getRepoBotToken } from '@/lib/github-app';

const CLUBS_FOLDER = 'clubs';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
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

    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = config.getEffectiveRole(email, profile?.role);
    const isAdmin = config.isAdminOrAbove(email, profile?.role);
    const isManager = config.isManager(email, profile?.role);
    const hasPerm = await hasPermission('manageAllClubs', role, false, email);
    const membership = await prisma.clubMember.findUnique({ where: { clubId_userId: { clubId: club.id, userId: email } } });
    const officerRoles = ['gs', 'ags', 'ogs', 'office_secretary'];
    const isOfficer = membership && officerRoles.includes(membership.role);
    const isClubAdmin = membership?.isClubAdmin || false;

    if (!isAdmin && !isManager && !hasPerm && !isOfficer && !isClubAdmin) {
      return NextResponse.json({ error: 'Not authorized to update club logo' }, { status: 403 });
    }

    const body = await req.json();
    const { image, type } = body;
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image data required (data URI)' }, { status: 400 });
    }

    const match = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid image format. Expected data:image/...;base64,...' }, { status: 400 });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const base64Data = match[2];
    const isCover = type === 'cover';
    const fileName = isCover ? 'cover' : 'logo';
    const filePath = `${CLUBS_FOLDER}/${slug}/${fileName}.${ext}`;

    const token = await getRepoBotToken(config.owner, config.repo) || process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'GitHub not configured' }, { status: 500 });
    }

    const existingSha = await getFileSha(filePath, token);
    const putBody: any = {
      message: `Update club logo: ${slug}`,
      content: base64Data,
      branch: config.branch,
    };
    if (existingSha) putBody.sha = existingSha;

    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${filePath}`;
    const res = await fetch(url, { method: 'PUT', headers: headers(token), body: JSON.stringify(putBody) });
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to upload logo to GitHub' }, { status: 500 });
    }

    const imageUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${filePath}`;
    const updateData = isCover ? { coverUrl: imageUrl } : { logoUrl: imageUrl };
    await prisma.club.update({ where: { id: club.id }, data: updateData });

    return NextResponse.json({ success: true, ...(isCover ? { coverUrl: imageUrl } : { logoUrl: imageUrl }) });
  } catch {
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
  }
}
