import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { getRepoBotToken } from '@/lib/github-app';
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
        try { token = await getInstallationAccessToken(Number(profile.githubInstallationId)); } catch {}
      }
    }
  } catch {}

  if (!token) {
    try {
      const session = await getServerSession(authOptions);
      if (session?.accessToken) token = session.accessToken;
    } catch {}
  }

  if (!token && process.env.GITHUB_TOKEN) token = process.env.GITHUB_TOKEN;

  if (!token) {
    try {
      const installations = await getAppInstallations();
      if (Array.isArray(installations) && installations.length > 0) {
        const botToken = await getInstallationAccessToken(installations[0].id);
        if (botToken) token = botToken;
      }
    } catch {}
  }

  if (!token) {
    const botToken = await getRepoBotToken(config.owner, config.repo);
    if (botToken) token = botToken;
  }

  return token;
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const role = profile?.role || 'user';
    const isCR = profile?.isCR || false;
    const effectiveRole = config.getEffectiveRole(email, role);

    if (!(await hasPermission('createFolder', effectiveRole, isCR, email))) {
      return NextResponse.json({ error: 'Permission denied. Ask admin to enable "Create Folders" in Settings > Permissions.' }, { status: 403 });
    }

    const { folderPath } = await req.json();
    if (!folderPath || typeof folderPath !== 'string') {
      return NextResponse.json({ error: 'folderPath required' }, { status: 400 });
    }

    const token = await resolveToken(req);
    if (!token) return NextResponse.json({ error: 'No GitHub token available' }, { status: 401 });

    const cleanPath = folderPath.replace(/^\/+|\/+$/g, '');

    const refRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, { headers: ghHeaders(token) });
    if (!refRes.ok) return NextResponse.json({ error: 'Failed to read ref' }, { status: 502 });
    const baseCommitSha = (await refRes.json()).object.sha;

    const commitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits/${baseCommitSha}`, { headers: ghHeaders(token) });
    if (!commitRes.ok) return NextResponse.json({ error: 'Failed to read commit' }, { status: 502 });
    const baseTreeSha = (await commitRes.json()).tree.sha;

    const treeRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/trees`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [{ path: `${cleanPath}/.gitkeep`, mode: '100644', type: 'blob', content: '' }],
      }),
    });
    if (!treeRes.ok) return NextResponse.json({ error: 'Failed to create tree' }, { status: 502 });
    const treeData = await treeRes.json();

    const newCommitRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/commits`, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message: `Create folder: ${cleanPath} (by ${email})`,
        tree: treeData.sha,
        parents: [baseCommitSha],
      }),
    });
    if (!newCommitRes.ok) return NextResponse.json({ error: 'Failed to create commit' }, { status: 502 });
    const newCommitData = await newCommitRes.json();

    const updateRefRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
      method: 'PATCH',
      headers: ghHeaders(token),
      body: JSON.stringify({ sha: newCommitData.sha, force: true }),
    });
    if (!updateRefRes.ok) return NextResponse.json({ error: 'Failed to update ref' }, { status: 502 });

    return NextResponse.json({ success: true, path: cleanPath });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
