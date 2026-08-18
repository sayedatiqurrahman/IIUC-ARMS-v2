import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { hasPermission } from '@/lib/permissions';
import { getRepoBotToken, getInstallationAccessToken } from '@/lib/github-app';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { sendMessageWithButtons, delFileConfirmData, delFileRejectData, buildBrowseLink } from '@/lib/telegram';
import { validateRepoPath, validateNewName } from '@/lib/repo-path';

const GITHUB_API = 'https://api.github.com';
const OWNER_CHAT_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID || '0');
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function getAppBotToken(): Promise<string | null> {
  return getRepoBotToken(config.owner, config.repo);
}

async function resolveToken(req: NextRequest): Promise<{ token: string; isOwner: boolean }> {
  let token = '';
  let isOwner = false;

  try {
    const email = await getUserEmail(req);
    if (email) {
      isOwner = config.ownerEmails.includes(email);
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

  return { token, isOwner };
}

async function getFileSha(token: string, filePath: string, branch: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha || null;
}

// POST /api/github/file-actions — { action: 'move'|'rename'|'copy'|'delete', from, to? }
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const isOwner = config.ownerEmails.includes(email.toLowerCase());

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });
    const effectiveRole = config.getEffectiveRole(email, profile?.role);
    const isCR = profile?.isCR || false;

    const body = await req.json();
    const { action } = body;

    // Reject path traversal / illegal segments before any repo call.
    let from: string;
    let to: string | undefined;
    let newName: string | undefined;
    try {
      from = validateRepoPath(body.from, false);
      if (typeof body.to === 'string' && body.to) to = validateRepoPath(body.to, false);
      if (typeof body.newName === 'string' && body.newName) newName = validateNewName(body.newName);
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Invalid path' }, { status: 400 });
    }

    // Check per-user or role-based permission
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const perms = (settings?.permissions as Record<string, string[]>) || {};
    const perUserKey = `${action}File_users`;
    const allowedUsers = (perms[perUserKey] as string[]) || [];
    const hasUserGrant = allowedUsers.includes(email.toLowerCase());
    const hasRoleGrant = await hasPermission(`${action}File`, effectiveRole, isCR, email);

    if (!hasUserGrant && !hasRoleGrant && !isOwner) {
      return NextResponse.json({ error: 'Permission denied. Ask admin to enable this action in Settings → Permissions.' }, { status: 403 });
    }

    if (!from) {
      return NextResponse.json({ error: 'Missing "from" path' }, { status: 400 });
    }

    const { token } = await resolveToken(req);
    const botTok = await getRepoBotToken(config.owner, config.repo);
    // Mutations run as the installed GitHub App bot; require a token only when
    // neither the user nor the bot can authenticate.
    if (!token && !botTok) {
      return NextResponse.json({ error: 'No GitHub token available' }, { status: 401 });
    }
    const checkTok = botTok || token;

    const branch = config.branch;
    const fromFull = `${config.uploadPath}/${from}`;

    // ─── DELETE ───
    if (action === 'delete') {
      const contentsRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${fromFull}?ref=${branch}`, { headers: ghHeaders(checkTok) });
      if (!contentsRes.ok) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      const contents = await contentsRes.json();

      let isFolder = false;
      let fileCount = 0;
      if (Array.isArray(contents)) {
        isFolder = true;
        fileCount = contents.length;
      } else if (!contents || contents.type !== 'file') {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      const isAdmin = isOwner || effectiveRole === 'admin' || effectiveRole === 'manager';

      // OWNER / ADMIN: direct atomic delete (single tree commit via the bot)
      if (isAdmin) {
        const { deleteRepoEntries } = await import('@/lib/file-delete');
        try {
          const deleted = await deleteRepoEntries([fromFull], botTok || token);
          try {
            await prisma.activityLog.create({
              data: {
                action: 'file_delete',
                userId: email,
                userName: profile?.name || email.split('@')[0],
                details: JSON.stringify({ path: from, filesDeleted: deleted, isFolder }),
              },
            });
          } catch {}
          return NextResponse.json({ success: true, deleted, isFolder });
        } catch (e: any) {
          // Tree-based delete failed — for single files, fall back to Contents API
          if (!isFolder) {
            try {
              const fileSha = contents.sha;
              if (fileSha) {
                const delRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${fromFull}`, {
                  method: 'DELETE',
                  headers: ghHeaders(botTok || token),
                  body: JSON.stringify({ message: `Delete ${from} (via admin)`, sha: fileSha, branch }),
                });
                if (delRes.ok) {
                  try {
                    await prisma.activityLog.create({
                      data: {
                        action: 'file_delete',
                        userId: email,
                        userName: profile?.name || email.split('@')[0],
                        details: JSON.stringify({ path: from, filesDeleted: 1, isFolder: false }),
                      },
                    });
                  } catch {}
                  return NextResponse.json({ success: true, deleted: 1, isFolder: false });
                }
                const delBody = await delRes.text().catch(() => '');
                console.error('[file-actions] Contents API delete failed:', delRes.status, delBody.slice(0, 300));
              }
            } catch {}
          }
          const errMsg = e?.message || 'Failed to delete from GitHub';
          console.error('[file-actions] delete error:', errMsg, { from, email, isOwner, effectiveRole });
          return NextResponse.json({ error: errMsg }, { status: 500 });
        }
      }

      // NON-ADMIN: send Telegram approval request to all connected admins
      const requesterName = profile?.name || email.split('@')[0];
      const filePathDisplay = from;

      // 1. Store pending request in activity log
      let activityId = '';
      try {
        const logEntry = await prisma.activityLog.create({
          data: {
            action: 'file_delete_request',
            userId: email,
            userName: requesterName,
            details: JSON.stringify({ path: from, name: from.split('/').pop(), fileCount, isFolder, status: 'pending_approval', messages: [] }),
          },
        });
        activityId = logEntry.id;
      } catch {}

      // 2. Send to all connected admins (owner + admins with telegramChatId)
      const approverChatIds: number[] = [];
      if (OWNER_CHAT_ID) approverChatIds.push(OWNER_CHAT_ID);

      try {
        const adminProfiles = await prisma.profile.findMany({
          where: { role: 'admin' },
          select: { telegramChatId: true },
        });
        for (const ap of adminProfiles) {
          const chatId = (ap as any).telegramChatId;
          if (chatId && !approverChatIds.includes(chatId)) {
            approverChatIds.push(chatId);
          }
        }
      } catch {}

      // Build browse link for the parent folder
      const pathParts = from.split('/');
      const browseLink = pathParts.length >= 2
        ? buildBrowseLink({ dept: pathParts[0], sem: pathParts[1] })
        : SITE_URL;

      const tgMsg = [
        `🗑 <b>File Delete Request</b>`, ``,
        `<b>By:</b> ${requesterName} (${email})`,
        `<b>Path:</b> <code>${filePathDisplay}</code>`,
        `<b>Type:</b> ${isFolder ? `Folder (${fileCount} files)` : 'Single file'}`, ``,
        `Approve or reject this deletion:`,
      ].join('\n');

      const sentMessages: { chatId: number; messageId: number }[] = [];
      for (const chatId of approverChatIds) {
        try {
          const res = await sendMessageWithButtons(chatId, tgMsg, [
            [
              ...(activityId ? [{ text: '✅ Confirm Delete', callback_data: delFileConfirmData(activityId) }] : []),
              ...(activityId ? [{ text: '❌ Reject', callback_data: delFileRejectData(activityId) }] : []),
            ],
            [{ text: '📂 Visit Directory', url: browseLink }],
          ]);
          const data = await res.json().catch(() => ({}));
          if (data?.ok && data?.result?.message_id) {
            sentMessages.push({ chatId, messageId: data.result.message_id });
          }
        } catch {}
      }

      // Record sent Telegram messages so admin-panel approval can update them
      if (activityId && sentMessages.length > 0) {
        try {
          await prisma.activityLog.update({
            where: { id: activityId },
            data: {
              details: JSON.stringify({ path: from, name: from.split('/').pop(), fileCount, isFolder, status: 'pending_approval', messages: sentMessages }),
            },
          });
        } catch {}
      }

      return NextResponse.json({
        success: false,
        message: `Delete request sent to admins for approval. You'll be notified when approved.`,
        pendingApproval: true,
      });
    }

    // ─── RENAME ───
    if (action === 'rename') {
      if (!newName) return NextResponse.json({ error: 'Missing "newName"' }, { status: 400 });

      const fromParts = from.split('/');
      const oldName = fromParts[fromParts.length - 1];
      if (oldName === newName) return NextResponse.json({ success: true, message: 'No change' });

      const toPath = [...fromParts.slice(0, -1), newName].join('/');
      const toFull = `${config.uploadPath}/${toPath}`;

      // Reject if destination already exists (single file or folder).
      const destSha = await getFileSha(checkTok, toFull, branch);
      const destContents = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${toFull}?ref=${branch}`, { headers: ghHeaders(checkTok) });
      if (destSha || (destContents.ok && Array.isArray(await destContents.json()))) {
        return NextResponse.json({ error: `"${newName}" already exists at destination` }, { status: 409 });
      }

      const { moveCopyRepoEntries } = await import('@/lib/github-tree-ops');
      const res = await moveCopyRepoEntries(fromFull, toFull, 'move', `Rename ${oldName} → ${newName} (via app bot)`);
      if (!res.ok || res.count === 0) return NextResponse.json({ error: res.error || 'Rename failed' }, { status: 500 });

      try {
        await prisma.activityLog.create({
          data: {
            action: 'file_rename',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({ from, to: toPath }),
          },
        });
      } catch {}
      return NextResponse.json({ success: true, newPath: toPath });
    }

    // ─── MOVE ───
    if (action === 'move') {
      if (!to) return NextResponse.json({ error: 'Missing "to" destination' }, { status: 400 });

      const toFull = `${config.uploadPath}/${to}`.replace(/\/$/, '');
      if (fromFull === toFull) return NextResponse.json({ error: 'Source and destination are the same' }, { status: 400 });

      // Reject if the destination already exists (file or folder).
      const destSha = await getFileSha(checkTok, toFull, branch);
      const destContents = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${toFull}?ref=${branch}`, { headers: ghHeaders(checkTok) });
      if (destSha || (destContents.ok && Array.isArray(await destContents.json()))) {
        return NextResponse.json({ error: `A file or folder already exists at "${to}"` }, { status: 409 });
      }

      const { moveCopyRepoEntries } = await import('@/lib/github-tree-ops');
      const res = await moveCopyRepoEntries(fromFull, toFull, 'move', `Move ${from.split('/').pop()} → ${to} (via app bot)`);
      if (!res.ok || res.count === 0) return NextResponse.json({ error: res.error || 'Move failed' }, { status: 500 });

      try {
        await prisma.activityLog.create({
          data: {
            action: 'file_move',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({ from, to, filesMoved: res.count, isFolder: res.count > 1 }),
          },
        });
      } catch {}
      return NextResponse.json({ success: true, newPath: to, moved: res.count });
    }

    // ─── COPY ───
    if (action === 'copy') {
      if (!to) return NextResponse.json({ error: 'Missing "to" destination' }, { status: 400 });

      let toFull = `${config.uploadPath}/${to}`.replace(/\/$/, '');
      if (fromFull === toFull) return NextResponse.json({ error: 'Source and destination are the same' }, { status: 400 });

      // When copying a folder, the destination is a folder (trailing slash).
      const srcContents = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${fromFull}?ref=${branch}`, { headers: ghHeaders(checkTok) });
      const srcIsFolder = srcContents.ok && Array.isArray(await srcContents.json());
      if (srcIsFolder) toFull = `${toFull}/`;

      const destSha = await getFileSha(checkTok, toFull, branch);
      const destContents = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${toFull}?ref=${branch}`, { headers: ghHeaders(checkTok) });
      if (destSha || (destContents.ok && Array.isArray(await destContents.json()))) {
        return NextResponse.json({ error: `A file or folder already exists at "${to}"` }, { status: 409 });
      }

      const { moveCopyRepoEntries } = await import('@/lib/github-tree-ops');
      const res = await moveCopyRepoEntries(fromFull, toFull, 'copy', `Copy ${from.split('/').pop()} → ${to} (via app bot)`);
      if (!res.ok || res.count === 0) return NextResponse.json({ error: res.error || 'Copy failed' }, { status: 500 });

      try {
        await prisma.activityLog.create({
          data: {
            action: 'file_copy',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({ from, to }),
          },
        });
      } catch {}
      return NextResponse.json({ success: true, newPath: to, copied: res.count });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    console.error('[file-actions] error:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Action failed' }, { status: 500 });
  }
}

// GET /api/github/file-actions — list folder tree for destination picker
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const rawFolder = url.searchParams.get('folder') || '';

    let folder: string;
    try {
      folder = validateRepoPath(rawFolder, true);
    } catch {
      return NextResponse.json({ folders: [] });
    }

    const { token } = await resolveToken(req);
    if (!token) return NextResponse.json({ folders: [] });

    const branch = config.branch;
    const folderPath = folder ? `${config.uploadPath}/${folder}` : config.uploadPath;

    const res = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${folderPath}?ref=${branch}`, { headers: ghHeaders(token) });
    if (!res.ok) return NextResponse.json({ folders: [] });

    const items = await res.json();
    if (!Array.isArray(items)) return NextResponse.json({ folders: [] });

    const folders = items
      .filter((i: any) => i.type === 'dir')
      .map((i: any) => ({
        name: i.name,
        path: i.path.replace(`${config.uploadPath}/`, ''),
      }))
      .filter((f: { name: string; path: string }) => {
        const parts = f.path.split('/');
        // Inside a semester (dept/sem/...), show only course folders
        if (parts.length === 3) {
          return /^[A-Z]{2,5}\s*[-–]?\s*\d{3,5}[A-Z]?\s*[-–]\s*.*$/i.test(f.name);
        }
        // Everywhere else show all subfolders
        return true;
      });

    return NextResponse.json({ folders });
  } catch {
    return NextResponse.json({ folders: [] });
  }
}
