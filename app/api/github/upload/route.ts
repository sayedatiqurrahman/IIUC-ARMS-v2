import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { hasPermission } from '@/lib/permissions';

export const maxDuration = 120;

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
    // ── Parse FormData (multipart) — avoids JSON body-size limits ────
    const contentType = req.headers.get('content-type') || '';
    let files: { path: string; content: string }[] = [];
    let message = '';
    let bodyToken = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      message = formData.get('message') as string || '';
      bodyToken = formData.get('githubToken') as string || '';

      // Extract files — each entry's filename is the full upload path
      const entries = Array.from(formData.entries());
      for (const [key, value] of entries) {
        if (key !== 'files') continue;
        if (!(value instanceof File)) continue;

        const filePath = value.name; // filename was set to the full path by the client
        if (!filePath) continue;

        const arrayBuf = await value.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        // Strip the config.uploadPath prefix — the client already sends the full path
        // but the GitHub API calls below prepend it again, so store relative to uploadPath
        const relPath = filePath.startsWith(`${config.uploadPath}/`) ? filePath.slice(`${config.uploadPath}/`.length) : filePath;
        files.push({ path: relPath, content: base64 });
      }
    } else {
      // Fallback: legacy JSON body (for any old clients or testing)
      const body = await req.json();
      files = body.files || [];
      message = body.message || '';
      bodyToken = body.githubToken || '';
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > config.maxFilesPerUpload) {
      return NextResponse.json({ error: `Maximum ${config.maxFilesPerUpload} files per upload` }, { status: 400 });
    }

    // ── Resolve authenticated user + stored GitHub identity ─────────────
    let userEmail = '';
    let storedPat = '';                 // decrypted PAT stored in DB (credit path)
    let installationId: number | null = null; // app installation the user connected to
    let isOwner = false;
    let isBanned = false;
    let canUpload = false;

    try {
      const email = await getUserEmail(req);
      userEmail = email || '';
      if (email) {
        const { prisma } = await import('@/lib/prisma');
        const profile = await prisma.profile.findUnique({ where: { userId: email } });
        isBanned = !!profile?.isBanned;
        if (profile?.githubToken) {
          const decrypted = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
          // Only PATs are usable for PR-based credit; installation tokens (ghs_) expire in ~1h
          // so they are never trusted here — we mint a fresh one via the GitHub App instead.
          if (decrypted.startsWith('ghp_') || decrypted.startsWith('github_pat_')) storedPat = decrypted;
        }
        if (profile?.githubInstallationId) {
          installationId = Number(profile.githubInstallationId);
        }
        isOwner = config.ownerEmails.includes(email) || profile?.githubLogin === config.owner;
      }
    } catch {}

    if (isBanned) {
      return NextResponse.json({ error: 'Account banned — upload not allowed' }, { status: 403 });
    }

    if (userEmail) {
      canUpload = await hasPermission('uploadFile', config.getEffectiveRole(userEmail), false, userEmail);
    }

    // ── Resolve a write-capable token (server-authoritative) ─────────────
    // Priority: stored PAT → PAT pasted in the modal → NextAuth session token
    //           → GitHub App bot token for THIS repo → server GITHUB_TOKEN.
    // The App bot token lets users upload with NO GitHub connection at all,
    // committing directly to main (fast). Stored ghs_ tokens are ignored.
    let token = '';
    let tokenKind: 'pat' | 'session' | 'bot' | 'env' = 'pat';

    if (storedPat) {
      token = storedPat;
    } else if (bodyToken && (bodyToken.startsWith('ghp_') || bodyToken.startsWith('github_pat_'))) {
      token = bodyToken;
    } else {
      try {
        const session = await getServerSession(authOptions);
        if (session?.accessToken) {
          token = session.accessToken;
          tokenKind = 'session';
        }
      } catch {}
    }

    // No user token → fall back to the GitHub App bot (works without ANY GitHub connection).
    // Allowed for users with upload permission, or anyone already connected via the app.
    if (!token && (canUpload || installationId)) {
      const botToken = await getRepoBotToken(config.owner, config.repo);
      if (botToken) {
        token = botToken;
        tokenKind = 'bot';
      }
    }
    if (!token && (canUpload || installationId) && process.env.GITHUB_TOKEN) {
      token = process.env.GITHUB_TOKEN;
      tokenKind = 'env';
    }

    if (!token) {
      return NextResponse.json(
        { error: 'GitHub not connected. Go to Dashboard → Connect with GitHub to set up, or ask admin for upload access.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // Bot/installation/env tokens can commit straight to main (fast).
    // Owner PATs can also commit directly. Everyone else uses a fork + PR for credit.
    const isBotToken = token.startsWith('ghs_') || tokenKind === 'bot' || tokenKind === 'env';
    const directCommit = isOwner || isBotToken;

    // ── OWNER or BOT token: Direct commit to main (fast, no branch/PR) ──
    if (directCommit) {
      const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, token);
      if (repoRes.status === 401 || repoRes.status === 403) {
        return NextResponse.json(
          { error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', code: 'TOKEN_EXPIRED' },
          { status: 401 }
        );
      }
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
        if (putRes.status === 401 || putRes.status === 403) {
          throw new Error('GitHub token expired. Please reconnect your GitHub account.');
        }
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

    // ── CONTRIBUTOR with a user token: fork + PR (gives contribution credit) ──
    // Validate token via /user
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
    if (repoRes.status === 401 || repoRes.status === 403) {
      return NextResponse.json(
        { error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }
    if (!repoRes.ok) throw new Error(`Cannot access repo`);
    const repoData2 = await repoRes.json();
    const defaultBranch = repoData2.default_branch;

    const baseRefRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token);
    if (baseRefRes.status === 401 || baseRefRes.status === 403) {
      return NextResponse.json(
        { error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }
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
        throw new Error('Permission denied (403). Token needs Contents + Pull requests access. Create a classic PAT at: https://github.com/settings/tokens/new?description=IIUC-ARMS&scopes=repo');
      }
      throw new Error(errBody.message || `Failed to create branch`);
    }

    // Upload all files in parallel for speed
    await Promise.all(files.map(async (file: any) => {
      const filePath = `${config.uploadPath}/${file.path}`;
      const putBody: any = {
        message: `Add ${file.path}`,
        content: file.content,
        branch,
      };
      const putRes = await ghPut(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}`, token, putBody);
      if (putRes.status === 401 || putRes.status === 403) {
        throw new Error('GitHub token expired. Please reconnect your GitHub account.');
      }
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.message || `Failed to upload ${file.path}`);
      }
    }));

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
        base: defaultBranch,
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
  } catch (e: any) {
    console.error('[upload] error:', e?.message || e);
    const msg = e?.message || '';
    if (msg.includes('401') || msg.includes('403') || msg.includes('Bad credentials') || msg.includes('Requires authentication')) {
      return NextResponse.json(
        { error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: msg || 'Upload failed' }, { status: 500 });
  }
}
