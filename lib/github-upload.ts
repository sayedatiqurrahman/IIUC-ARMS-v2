import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { hasPermission } from '@/lib/permissions';
import { commitFilesToBranch, ghFetch, type FileToCommit } from '@/lib/github-commit';

const GITHUB_API = 'https://api.github.com';

export interface UploadContext {
  userEmail: string;
  isOwner: boolean;
  isBanned: boolean;
  canUpload: boolean;
  installationId: number | null;
  token: string;
  tokenKind: 'pat' | 'session' | 'bot' | 'env';
}

export interface UploadResult {
  success: boolean;
  pr?: { url: string; number: number };
  direct?: boolean;
  error?: string;
  status?: number;
  code?: string;
}

// Resolve the authenticated user + a write-capable GitHub token (server
// authoritative). Returns { ctx } on success or { error, status, code }.
// bodyToken is the raw PAT pasted in the upload modal (from FormData or JSON).
export async function resolveUploadContext(req: NextRequest, bodyToken = ''): Promise<{ ctx: UploadContext } | { error: string; status: number; code?: string }> {
  let userEmail = '';
  let storedPat = '';                 // decrypted PAT stored in DB (credit path)
  let installationId: number | null = null;
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
    return { error: 'Account banned — upload not allowed', status: 403 };
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
    return {
      error: 'GitHub not connected. Go to Dashboard → Connect with GitHub to set up, or ask admin for upload access.',
      status: 401,
      code: 'AUTH_REQUIRED',
    };
  }

  return {
    ctx: { userEmail, isOwner, isBanned, canUpload, installationId, token, tokenKind },
  };
}

// Commit a set of files to GitHub: owners/bots commit straight to main; other
// contributors go through a fork + PR for credit. `files` paths are relative to
// config.uploadPath (matching how the client builds them).
export async function commitUpload(ctx: UploadContext, files: FileToCommit[], message: string): Promise<UploadResult> {
  const isBotToken = ctx.token.startsWith('ghs_') || ctx.tokenKind === 'bot' || ctx.tokenKind === 'env';
  const directCommit = ctx.isOwner || isBotToken;
  const fullFiles = files.map(f => ({ ...f, path: `${config.uploadPath}/${f.path}` }));
  const commitMessage = `Add ${fullFiles.map(f => f.path).join(', ')}`;

  if (directCommit) {
    const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, ctx.token);
    if (repoRes.status === 401 || repoRes.status === 403) {
      return { success: false, error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', status: 401, code: 'TOKEN_EXPIRED' };
    }
    if (!repoRes.ok) return { success: false, error: `Cannot access repo: ${repoRes.status}`, status: 500 };
    const defaultBranch = (await repoRes.json()).default_branch;

    const refRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/git/refs/heads/${defaultBranch}`, ctx.token);
    if (!refRes.ok) return { success: false, error: `Cannot read branch: ${refRes.status}`, status: 500 };
    const baseSha = (await refRes.json()).object.sha;

    try {
      await commitFilesToBranch({
        token: ctx.token,
        owner: config.owner,
        repo: config.repo,
        branch: defaultBranch,
        baseSha,
        files: fullFiles,
        message: commitMessage,
      });
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('Bad credentials') || msg.includes('Requires authentication')) {
        return { success: false, error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', status: 401, code: 'TOKEN_EXPIRED' };
      }
      return { success: false, error: `Failed to commit to GitHub (${msg})`, status: 500 };
    }

    return {
      success: true,
      pr: { url: `https://github.com/${config.owner}/${config.repo}/commit/${defaultBranch}`, number: 0 },
      direct: true,
    };
  }

  // ── CONTRIBUTOR with a user token: fork + PR (gives contribution credit) ──
  const token = ctx.token;
  const userRes = await ghFetch(`${GITHUB_API}/user`, token);
  if (userRes.status === 401) {
    return { success: false, error: 'Token expired or invalid. Go to Dashboard → GitHub Connection → paste a new PAT.', status: 401, code: 'TOKEN_EXPIRED' };
  }
  if (userRes.status === 403) {
    return { success: false, error: 'Token lacks permissions. Create a new PAT at https://github.com/settings/tokens/new with "repo" scope, then paste it in Dashboard.', status: 403, code: 'TOKEN_NO_ACCESS' };
  }
  if (!userRes.ok) {
    return { success: false, error: 'Invalid token. Go to Dashboard → GitHub Connection → paste a valid PAT.', status: 401, code: 'TOKEN_INVALID' };
  }
  const githubUser = await userRes.json();

  const forkFullName = `${githubUser.login}/${config.repo}`;
  const forkCheckRes = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token);
  if (forkCheckRes.status === 404) {
    const forkRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/forks`, token, {
      method: 'POST',
      body: JSON.stringify({ default_branch_only: true }),
    });
    if (!forkRes.ok) {
      const err = await forkRes.json().catch(() => ({}));
      return { success: false, error: err.message || 'Failed to fork repository. Make sure your PAT has "repo" scope.', status: 500 };
    }
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const check = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token);
      if (check.ok) break;
      if (i === 5) return { success: false, error: 'Fork is taking too long. Please try again.', status: 500 };
    }
  } else if (!forkCheckRes.ok) {
    return { success: false, error: 'Cannot access your fork', status: 500 };
  }

  const targetOwner = githubUser.login;
  const targetRepo = config.repo;

  const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, token);
  if (repoRes.status === 401 || repoRes.status === 403) {
    return { success: false, error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', status: 401, code: 'TOKEN_EXPIRED' };
  }
  if (!repoRes.ok) return { success: false, error: 'Cannot access repo', status: 500 };
  const defaultBranch = (await repoRes.json()).default_branch;

  const baseRefRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token);
  if (baseRefRes.status === 401 || baseRefRes.status === 403) {
    return { success: false, error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', status: 401, code: 'TOKEN_EXPIRED' };
  }
  if (!baseRefRes.ok) return { success: false, error: 'Cannot read branch', status: 500 };
  const baseBranchSha = (await baseRefRes.json()).object.sha;

  const branch = `upload/${Date.now()}`;
  const createBranchRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseBranchSha }),
  });
  if (!createBranchRes.ok && createBranchRes.status !== 422) {
    const errBody = await createBranchRes.json().catch(() => ({}));
    if (createBranchRes.status === 403) {
      return { success: false, error: 'Permission denied (403). Token needs Contents + Pull requests access. Create a classic PAT at: https://github.com/settings/tokens/new?description=IIUC-ARMS&scopes=repo', status: 403, code: 'TOKEN_NO_ACCESS' };
    }
    return { success: false, error: errBody.message || 'Failed to create branch', status: 500 };
  }

  try {
    await commitFilesToBranch({
      token,
      owner: targetOwner,
      repo: targetRepo,
      branch,
      baseSha: baseBranchSha,
      files: fullFiles,
      message: commitMessage,
    });
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('401') || msg.includes('403') || msg.includes('Bad credentials') || msg.includes('Requires authentication')) {
      return { success: false, error: 'GitHub token expired. Please reconnect your GitHub account.', status: 401, code: 'TOKEN_EXPIRED' };
    }
    return { success: false, error: msg || 'Failed to upload files', status: 500 };
  }

  const prRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({
      title: message || `Upload: ${fullFiles.map((f: any) => f.path.split('/').pop()).join(', ')}`,
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
    return { success: false, error: err.message || 'Failed to create Pull Request', status: 500 };
  }
  const prData = await prRes.json();

  return { success: true, pr: { url: prData.html_url, number: prData.number }, direct: false };
}

// Log a file_upload activity row (best effort).
export async function logUploadActivity(userEmail: string, files: string[], prUrl: string | null): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: userEmail } });
    await prisma.activityLog.create({
      data: {
        action: 'file_upload',
        userId: userEmail,
        userName: profile?.name || userEmail.split('@')[0],
        details: JSON.stringify({ files, count: files.length, prUrl }),
      },
    });
  } catch {}
}

// Lightweight authorization for chunk-staging requests (they don't carry file
// content that needs GitHub write access, just need to be an allowed uploader).
export async function authorizeChunkUpload(req: NextRequest): Promise<{ email: string } | { error: string; status: number }> {
  let email = '';
  try {
    email = (await getUserEmail(req)) || '';
  } catch {}

  if (!email) return { error: 'Unauthorized — please login', status: 401 };

  try {
    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    if (profile?.isBanned) return { error: 'Account banned — upload not allowed', status: 403 };
    const allowed = await hasPermission('uploadFile', config.getEffectiveRole(email), false, email);
    if (!allowed && !profile?.githubInstallationId) return { error: 'You do not have permission to upload files', status: 403 };
  } catch {}

  return { email };
}
