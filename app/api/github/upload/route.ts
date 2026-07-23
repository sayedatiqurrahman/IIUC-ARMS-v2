import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';

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

export async function POST(req: NextRequest) {
  try {
    let token = '';
    let contributorLogin = '';

    // Try NextAuth session first (works when NEXTAUTH_URL matches)
    try {
      const session = await getServerSession(authOptions);
      if (session?.accessToken) {
        token = session.accessToken;
        contributorLogin = (session as any).user?.login || '';
      }
    } catch {}

    // Fallback: get email from Firebase cookie, then load profile.githubToken from DB
    if (!token) {
      try {
        const email = await getUserEmail(req);
        if (email) {
          const { prisma } = await import('@/lib/prisma');
          const profile = await prisma.profile.findUnique({ where: { userId: email } });
          if (profile?.githubToken) {
            token = profile.githubToken;
            contributorLogin = profile.githubLogin || '';
          }
        }
      } catch {}
    }

    // Fallback to env token
    if (!token && process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN;
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub not connected. Please sign in with GitHub or add GITHUB_TOKEN to .env.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { files, message } = body;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > config.maxFilesPerUpload) {
      return NextResponse.json({ error: `Maximum ${config.maxFilesPerUpload} files per upload` }, { status: 400 });
    }

    const branch = `upload/${Date.now()}`;

    // Check token validity
    const userRes = await ghFetch(`${GITHUB_API}/user`, token);
    if (userRes.status === 401) {
      return NextResponse.json(
        { error: 'GitHub token expired. Please reconnect or update GITHUB_TOKEN.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }
    if (!userRes.ok) throw new Error(`Failed to verify GitHub identity: ${userRes.status}`);
    const githubUser = await userRes.json();

    const isOwner = githubUser.login === config.owner;

    let targetOwner = config.owner;
    let targetRepo = config.repo;

    if (!isOwner) {
      // Contributor: fork if needed
      const forkFullName = `${githubUser.login}/${config.repo}`;
      const forkCheckRes = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token);
      if (forkCheckRes.status === 404) {
        const forkRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/forks`, token, {
          method: 'POST',
          body: JSON.stringify({ default_branch_only: true }),
        });
        if (!forkRes.ok) {
          const err = await forkRes.json().catch(() => ({}));
          throw new Error(err.message || `Failed to fork repository: ${forkRes.status}`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
      targetOwner = githubUser.login;
    }

    // Get default branch from upstream
    const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, token);
    if (!repoRes.ok) throw new Error(`Failed to get repo info: ${repoRes.status}`);
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch;

    // Get base branch SHA
    const baseRefRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token);
    if (!baseRefRes.ok) throw new Error(`Failed to get base branch ref: ${baseRefRes.status}`);
    const baseRefData = await baseRefRes.json();
    const baseBranchSha = baseRefData.object.sha;

    // Create new branch
    const createBranchRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, token, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseBranchSha }),
    });
    if (!createBranchRes.ok && createBranchRes.status !== 422) {
      throw new Error(`Failed to create branch: ${createBranchRes.status}`);
    }

    // Upload files
    for (const file of files) {
      const filePath = `${config.uploadPath}/${file.path}`;
      const encodedContent = file.content;

      let fileSha: string | undefined;
      try {
        const existingRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}?ref=${branch}`, token);
        if (existingRes.ok) {
          const existingData = await existingRes.json();
          fileSha = existingData.sha;
        }
      } catch {}

      const putBody: any = {
        message: `Add ${file.path}`,
        content: encodedContent,
        branch: branch,
      };
      if (fileSha) putBody.sha = fileSha;

      const putRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}`, token, {
        method: 'PUT',
        body: JSON.stringify(putBody),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to upload ${file.path}`);
      }
    }

    // Create Pull Request
    const prHead = isOwner ? branch : `${githubUser.login}:${branch}`;

    const prBody = [
      `## QSIS-ARMS File Upload`,
      ``,
      `**Contributor:** ${githubUser.name || githubUser.login || 'Unknown'} (@${githubUser.login})`,
      `**Email:** ${githubUser.email || 'N/A'}`,
      ``,
      `### Files`,
      files.map((f: any) => `- \`${f.path}\``).join('\n'),
      ``,
      `---`,
      `*Submitted via QSIS-ARMS v2*`,
    ].join('\n');

    const prRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({
        title: message || `Upload: ${files.map((f: any) => f.path.split('/').pop()).join(', ')}`,
        body: prBody,
        head: prHead,
        base: defaultBranch,
      }),
    });

    if (!prRes.ok) {
      const err = await prRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create Pull Request');
    }

    const prData = await prRes.json();

    // Save contributor profile to DB (best-effort)
    try {
      const { prisma } = await import('@/lib/prisma');
      const email = githubUser.email || '';
      if (email) {
        const existing = await prisma.profile.findUnique({ where: { userId: email } });
        if (!existing) {
          await prisma.profile.create({
            data: { userId: email, email, name: githubUser.name || githubUser.login },
          });
        }
      }
    } catch {}

    return NextResponse.json({
      success: true,
      pr: { url: prData.html_url, number: prData.number },
      isOwner,
    });
  } catch (err: any) {
    const msg = err.message || 'Upload failed';
    console.error('[Upload] Error:', msg, err.stack);
    return NextResponse.json({ error: msg, details: err.message }, { status: 500 });
  }
}
