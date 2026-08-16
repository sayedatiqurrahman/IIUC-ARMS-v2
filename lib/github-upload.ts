import { NextRequest } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';
import { hasPermission } from '@/lib/permissions';
import { commitFilesToBranch, ghFetch, type FileToCommit } from '@/lib/github-commit';
import { validateRepoPath } from '@/lib/repo-path';

const GITHUB_API = 'https://api.github.com';

export interface UploadContext {
  userEmail: string;
  userName: string;
  githubLogin: string;
  isOwner: boolean;
  isBanned: boolean;
  canUpload: boolean;
  installationId: number | null;
  token: string;
  tokenKind: 'pat' | 'session' | 'bot' | 'env';
}

export interface UploadResult {
  success: boolean;
  pr?: { url: string; number: number; merged?: boolean };
  direct?: boolean;
  error?: string;
  status?: number;
  code?: string;
}

// Resolve the authenticated user + a server-side write token (bot/env) for
// direct-to-main uploads. Returns { ctx } on success or { error, status, code }.
export async function resolveUploadContext(req: NextRequest, _bodyToken = ''): Promise<{ ctx: UploadContext } | { error: string; status: number; code?: string }> {
  let userEmail = '';
  let userName = '';
  let githubLogin = '';
  let installationId: number | null = null;
  let isOwner = false;
  let isBanned = false;
  let canUpload = false;
  let profile: { role?: string; isBanned?: boolean; name?: string | null; githubLogin?: string | null; githubInstallationId?: string | null } | null = null;

  try {
    const email = await getUserEmail(req);
    userEmail = email || '';
    if (email) {
      const { prisma } = await import('@/lib/prisma');
      profile = await prisma.profile.findUnique({ where: { userId: email } });
      isBanned = !!profile?.isBanned;
      userName = profile?.name || email.split('@')[0];
      githubLogin = profile?.githubLogin || '';
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
    canUpload = await hasPermission('uploadFile', config.getEffectiveRole(userEmail, profile?.role), false, userEmail);
  }

  // ── Resolve a write-capable token (server-authoritative) ─────────────
  // Uploads ALWAYS commit straight to main via the GitHub App bot (or the
  // server GITHUB_TOKEN) — no fork, no PR, no review. A user PAT/session token
  // is never used for the actual commit, so contributor uploads can never
  // create a pull request. If no server-side write token is available we fail
  // with a clear error instead of falling back to a PR.
  let token = '';
  let tokenKind: 'pat' | 'session' | 'bot' | 'env' = 'pat';

  if (canUpload || installationId) {
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
      error: 'Upload service is unavailable right now. Please try again in a minute, or ask the admin to check the GitHub App setup.',
      status: 503,
      code: 'NO_SERVER_TOKEN',
    };
  }

  return {
    ctx: { userEmail, userName, githubLogin, isOwner, isBanned, canUpload, installationId, token, tokenKind },
  };
}

// Commit a set of files straight to config.uploadPath on main. Every upload
// uses the server-side GitHub App bot token (or server GITHUB_TOKEN), so all
// commits are direct — contributors never go through a fork + PR. `files` paths
// are relative to config.uploadPath (matching how the client builds them).
export async function commitUpload(ctx: UploadContext, files: FileToCommit[], message: string): Promise<UploadResult> {
  const directCommit = true;

  // Defense in depth: never let a client-supplied path walk outside
  // config.uploadPath (GitHub's Contents API resolves .. segments).
  for (const f of files) {
    validateRepoPath(f.path, false);
  }

  // Corruption gate: a PDF that was truncated mid-upload can never reach
  // GitHub. Every assembled PDF must start with the %PDF- header and end with
  // the %%EOF marker, or the whole upload is rejected (nothing is committed).
  for (const f of files) {
    if (!f.path.toLowerCase().endsWith('.pdf')) continue;
    const buf = Buffer.from(f.content, 'base64');
    if (buf.length < 16) {
      return { success: false, error: `"${f.path.split('/').pop()}" is an empty/invalid PDF — upload the original file again.`, status: 400 };
    }
    const head = buf.subarray(0, 1024).toString('latin1');
    const tail = buf.subarray(Math.max(0, buf.length - 2048)).toString('latin1');
    if (!head.includes('%PDF-') || !tail.includes('%%EOF')) {
      return { success: false, error: `"${f.path.split('/').pop()}" looks corrupt (truncated during upload) — please re-upload it.`, status: 400 };
    }
  }

  const fullFiles = files.map(f => ({ ...f, path: `${config.uploadPath}/${f.path}` }));
  const commitMessage = `Add ${fullFiles.map(f => f.path).join(', ')}`;

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
    // Commit under the uploader's OWN GitHub identity (name + noreply email from
    // their connected account) so the commit shows as authored AND committed by
    // the user, not by the bot — their GitHub graph and the contributors page
    // credit them automatically. Falls back to the app profile identity when no
    // GitHub account is connected.
    const identity = ctx.githubLogin
      ? { name: ctx.userName || ctx.githubLogin, email: `${ctx.githubLogin}@users.noreply.github.com` }
      : ctx.userEmail
        ? { name: ctx.userName || ctx.userEmail.split('@')[0], email: ctx.userEmail }
        : undefined;
    await commitFilesToBranch({
      token: ctx.token,
      owner: config.owner,
      repo: config.repo,
      branch: defaultBranch,
      baseSha,
      files: fullFiles,
      message: commitMessage,
      author: identity,
      committer: identity,
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
    const allowed = await hasPermission('uploadFile', config.getEffectiveRole(email, profile?.role), false, email);
    if (!allowed && !profile?.githubInstallationId) return { error: 'You do not have permission to upload files', status: 403 };
  } catch {}

  return { email };
}
