import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getInstallationAccessToken } from '@/lib/github-app';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 10;

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(url: string, token: string, opts?: RequestInit) {
  return fetch(url, { ...opts, headers: { ...ghHeaders(token), ...opts?.headers } });
}

async function ghPut(url: string, token: string, body: any) {
  return fetch(url, { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body) });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
  if (!rl.success) return rl.response!;
  try {
    let token = '';
    let installationId: number | null = null;

    const body = await req.json();
    const { files, message, githubToken: bodyToken } = body;

    // Load from DB — prioritize PAT over installation token
    let hasPAT = false;
    try {
      const email = await getUserEmail(req);
      if (email) {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findUnique({ where: { userId: email } });
        if (profile?.isBanned) {
          return NextResponse.json({ error: 'Account banned — upload not allowed' }, { status: 403 });
        }
        if (profile?.githubToken) {
          const decrypted = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
          // PATs start with ghp_ or github_pat_, installation tokens start with ghs_
          if (decrypted.startsWith('ghp_') || decrypted.startsWith('github_pat_')) {
            token = decrypted;
            hasPAT = true;
          } else if (profile?.githubInstallationId) {
            // Only use installation token if no PAT
            installationId = Number(profile.githubInstallationId);
          }
        }
        if (!hasPAT && profile?.githubInstallationId) {
          installationId = Number(profile.githubInstallationId);
        }
      }
    } catch {}

    if (!token && bodyToken) {
      token = bodyToken;
      if (bodyToken.startsWith('ghp_') || bodyToken.startsWith('github_pat_')) hasPAT = true;
    }

    if (!token) {
      try {
        const session = await getServerSession(authOptions);
        if (session?.accessToken) token = session.accessToken;
      } catch {}
    }

    // Only refresh installation token if user has NO PAT
    if (!token && installationId) {
      try {
        token = await getInstallationAccessToken(installationId);
      } catch {
        return NextResponse.json(
          { error: 'GitHub connection expired. Please reconnect from Dashboard.', code: 'TOKEN_EXPIRED' },
          { status: 401 }
        );
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub not connected. Go to Dashboard → Connect with GitHub to set up.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > config.maxFilesPerUpload) {
      return NextResponse.json({ error: `Maximum ${config.maxFilesPerUpload} files per upload` }, { status: 400 });
    }

    // Determine owner status — check githubLogin OR owner email
    let isOwner = false;
    try {
      const email = await getUserEmail(req);
      if (email) {
        isOwner = config.ownerEmails.includes(email);
        if (!isOwner) {
          const { prisma } = await import('@/lib/prisma');
          const profile = await prisma.profile.findUnique({ where: { userId: email } });
          isOwner = profile?.githubLogin === config.owner;
        }
      }
    } catch {}

    // OWNER: Only use bot token if user has no PAT (so credits go to user)
    if (isOwner && !hasPAT && process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN;
    }

    // ── OWNER: Direct commit to main (fast, no branch/PR) ──
    if (isOwner) {
      const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, token);
      if (!repoRes.ok) throw new Error(`Cannot access repo: ${repoRes.status}`);
      const repoData = await repoRes.json();
      const defaultBranch = repoData.default_branch;

      const results = await Promise.all(files.map(async (file: any) => {
        const filePath = `${config.uploadPath}/${file.path}`;

        let fileSha: string | undefined;
        try {
          const existingRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${defaultBranch}`, token);
          if (existingRes.ok) {
            const existingData = await existingRes.json();
            fileSha = existingData.sha;
          }
        } catch {}

        const putBody: any = {
          message: `Add ${file.path}`,
          content: file.content,
          branch: defaultBranch,
        };
        if (fileSha) putBody.sha = fileSha;

        const putRes = await ghPut(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${filePath}`, token, putBody);
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}));
          throw new Error(err.message || `Failed to upload ${file.path}`);
        }
        return filePath;
      }));

    // Log upload activity
    try {
      const email = await getUserEmail(req);
      if (email) {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findUnique({ where: { userId: email } });
        await prisma.activityLog.create({
          data: {
            action: 'file_upload',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({
              files: files.map((f: any) => f.path),
              count: files.length,
              isOwner: isOwner,
            }),
          },
        });
      }
    } catch {}

    return NextResponse.json({
      success: true,
      pr: { url: `https://github.com/${config.owner}/${config.repo}/commit/main`, number: 0 },
      isOwner: true,
      uploadedFiles: results,
    });
    }

    // ── CONTRIBUTOR: Requires a PAT (installation tokens can't fork) ──
    if (token.startsWith('ghs_')) {
      return NextResponse.json({
        error: 'Contributors need a Personal Access Token to upload. Go to Dashboard → GitHub Connection → paste a PAT.',
        code: 'NEEDS_PAT',
      }, { status: 403 });
    }

    // Validate PAT by calling /user
    const userRes = await ghFetch(`${GITHUB_API}/user`, token);
    if (userRes.status === 401) {
      return NextResponse.json(
        { error: 'Token expired or invalid. Go to Dashboard → GitHub Connection → paste a new PAT.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }
    if (userRes.status === 403) {
      return NextResponse.json(
        { error: 'Token lacks permissions. Create a new PAT at https://github.com/settings/tokens/new with "repo" scope, then paste it in Dashboard.', code: 'TOKEN_NO_ACCESS' },
        { status: 403 }
      );
    }
    if (!userRes.ok) {
      return NextResponse.json(
        { error: 'Invalid token. Go to Dashboard → GitHub Connection → paste a valid PAT.', code: 'TOKEN_INVALID' },
        { status: 401 }
      );
    }
    const githubUser = await userRes.json();

    // Auto-fork if needed
    const forkFullName = `${githubUser.login}/${config.repo}`;
    const forkCheckRes = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token);
    if (forkCheckRes.status === 404) {
      // Fork doesn't exist — create it
      const forkRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/forks`, token, {
        method: 'POST',
        body: JSON.stringify({ default_branch_only: true }),
      });
      if (!forkRes.ok) {
        const err = await forkRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to fork repository. Make sure your PAT has "repo" scope.`);
      }
      // Wait for fork to be ready
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const check = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token);
        if (check.ok) break;
        if (i === 5) throw new Error('Fork is taking too long. Please try again.');
      }
    } else if (!forkCheckRes.ok) {
      throw new Error(`Cannot access your fork`);
    }

    const targetOwner = githubUser.login;
    const targetRepo = config.repo;

    const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, token);
    if (!repoRes.ok) throw new Error(`Cannot access repo`);
    const repoData2 = await repoRes.json();
    const defaultBranch = repoData2.default_branch;

    const baseRefRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token);
    if (!baseRefRes.ok) throw new Error(`Cannot read branch`);
    const baseRefData = await baseRefRes.json();
    const baseBranchSha = baseRefData.object.sha;

    const branch = `upload/${Date.now()}`;
    const createBranchRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseBranchSha }),
    });
    if (!createBranchRes.ok && createBranchRes.status !== 422) {
      const errBody = await createBranchRes.json().catch(() => ({}));
      if (createBranchRes.status === 403) {
        throw new Error('Permission denied (403). Token needs Contents + Pull requests access. Create at: https://github.com/settings/personal-access-tokens');
      }
      throw new Error(errBody.message || `Failed to create branch`);
    }

    for (const file of files) {
      const filePath = `${config.uploadPath}/${file.path}`;
      const putBody: any = {
        message: `Add ${file.path}`,
        content: file.content,
        branch,
      };
      const putRes = await ghPut(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}`, token, putBody);
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to upload ${file.path}`);
      }
    }

    const prRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: message || `Upload: ${files.map((f: any) => f.path.split('/').pop()).join(', ')}`,
        body: [
          `## IIUC-ARMS File Upload`,
          ``,
          `**Contributor:** ${githubUser.name || githubUser.login} (@${githubUser.login})`,
          `**Email:** ${githubUser.email || 'N/A'}`,
          ``,
          `### Files`,
          files.map((f: any) => `- \`${f.path}\``).join('\n'),
          ``,
          `---`,
          `*Submitted via IIUC-ARMS v2*`,
        ].join('\n'),
        head: `${githubUser.login}:${branch}`,
        base: await defaultBranch,
      }),
    });

    if (!prRes.ok) {
      const err = await prRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create Pull Request');
    }

    const prData = await prRes.json();

    // Log contributor upload activity
    try {
      const email = await getUserEmail(req);
      if (email) {
        const { prisma } = await import('@/lib/prisma');
        const p = await prisma.profile.findUnique({ where: { userId: email } });
        await prisma.activityLog.create({
          data: {
            action: 'file_upload',
            userId: email,
            userName: p?.name || githubUser.login,
            details: JSON.stringify({
              files: files.map((f: any) => f.path),
              count: files.length,
              prUrl: prData.html_url,
              githubUser: githubUser.login,
            }),
          },
        });
      }
    } catch {}

    return NextResponse.json({
      success: true,
      pr: { url: prData.html_url, number: prData.number },
      isOwner: false,
    });
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
