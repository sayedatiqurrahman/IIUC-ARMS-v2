import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { getInstallationAccessToken, getAppInstallations } from '@/lib/github-app';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { decrypt, isEncrypted } from '@/lib/crypto';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function getAppBotToken(): Promise<string | null> {
  try {
    const installations = await getAppInstallations();
    if (!Array.isArray(installations) || installations.length === 0) return null;
    return await getInstallationAccessToken(installations[0].id);
  } catch { return null; }
}

async function resolveToken(req: NextRequest): Promise<string> {
  let token = '';

  try {
    const email = await getUserEmail(req);
    if (email) {
      const { prisma } = await import('@/lib/prisma');
      const profile = await prisma.profile.findUnique({ where: { userId: email } });
      if (profile?.githubToken) {
        const decrypted = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
        if (decrypted.startsWith('ghp_') || decrypted.startsWith('github_pat_')) {
          token = decrypted;
        }
      }
      if (!token && profile?.githubInstallationId) {
        try {
          token = await getInstallationAccessToken(Number(profile.githubInstallationId));
        } catch {}
      }
    }
  } catch {}

  if (!token) {
    try {
      const session = await getServerSession(authOptions);
      if (session?.accessToken) token = session.accessToken;
    } catch {}
  }

  if (!token && process.env.GITHUB_TOKEN) {
    token = process.env.GITHUB_TOKEN;
  }

  if (!token) {
    const botToken = await getAppBotToken();
    if (botToken) token = botToken;
  }

  return token;
}

// GET /api/github/readme?folder=dept/sem/CODE - Title/Mid
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const folder = req.nextUrl.searchParams.get('folder') || '';
    const token = await resolveToken(req);
    if (!token) return NextResponse.json({ content: '', sha: null });

    const readmePath = folder ? `${config.uploadPath}/${folder}/README.md` : `${config.uploadPath}/README.md`;
    const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${readmePath}?ref=${config.branch}`;
    const res = await fetch(url, { headers: ghHeaders(token) });

    if (!res.ok) return NextResponse.json({ content: '', sha: null });

    const data = await res.json();
    const content = data.content ? atob(data.content.replace(/\n/g, '')) : '';
    return NextResponse.json({ content, sha: data.sha });
  } catch {
    return NextResponse.json({ content: '', sha: null });
  }
}

// POST /api/github/readme — { folder, content }
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    const isOwner = config.ownerEmails.includes(email.toLowerCase());

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const isCR = profile?.isCR || false;

    const hasUserGrant = await hasPermission('manageSettings', effectiveRole, isCR);
    if (!hasUserGrant && !isOwner) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await req.json();
    const { folder, content } = body;

    const token = await resolveToken(req);
    if (!token) return NextResponse.json({ error: 'No GitHub token' }, { status: 401 });

    const readmePath = folder ? `${config.uploadPath}/${folder}/README.md` : `${config.uploadPath}/README.md`;
    const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${readmePath}?ref=${config.branch}`;

    // Check if README.md already exists
    let existingSha: string | null = null;
    const existing = await fetch(url, { headers: ghHeaders(token) });
    if (existing.ok) {
      const data = await existing.json();
      existingSha = data.sha;
    }

    const encoded = btoa(unescape(encodeURIComponent(content)));
    const putBody: any = {
      message: `Update README.md in ${folder || 'root'}`,
      content: encoded,
      branch: config.branch,
    };
    if (existingSha) putBody.sha = existingSha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify(putBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.message || 'Failed to save' }, { status: 500 });
    }

    const result = await res.json();
    return NextResponse.json({ success: true, sha: result.content?.sha });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
