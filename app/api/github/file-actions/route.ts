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

async function getAllFilesInFolder(token: string, folderPath: string, branch: string): Promise<{ path: string; sha: string }[]> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${folderPath}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return [];
  const items = await res.json();
  if (!Array.isArray(items)) return [];

  const files: { path: string; sha: string }[] = [];
  for (const item of items) {
    if (item.type === 'file') {
      files.push({ path: item.path, sha: item.sha });
    } else if (item.type === 'dir') {
      const subFiles = await getAllFilesInFolder(token, item.path, branch);
      files.push(...subFiles);
    }
  }
  return files;
}

async function createFile(token: string, filePath: string, content: string, message: string, branch: string, sha?: string): Promise<boolean> {
  const body: any = { message, content, branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function deleteFile(token: string, filePath: string, message: string, branch: string, sha: string): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${filePath}`, {
    method: 'DELETE',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, sha, branch }),
  });
  return res.ok;
}

async function getContent(token: string, filePath: string, branch: string): Promise<{ content: string; sha: string } | null> {
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return { content: data.content, sha: data.sha };
}

// POST /api/github/file-actions — { action: 'move'|'rename'|'copy'|'delete', from, to? }
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

    const body = await req.json();
    const { action, from, to, newName } = body;

    // Check per-user or role-based permission
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const perms = (settings?.permissions as Record<string, string[]>) || {};
    const perUserKey = `${action}File_users`;
    const allowedUsers = (perms[perUserKey] as string[]) || [];
    const hasUserGrant = allowedUsers.includes(email.toLowerCase());
    const hasRoleGrant = await hasPermission(`${action}File`, effectiveRole, isCR);

    if (!hasUserGrant && !hasRoleGrant && !isOwner) {
      return NextResponse.json({ error: 'Permission denied. Ask admin to enable this action in Settings → Permissions.' }, { status: 403 });
    }

    if (!from) {
      return NextResponse.json({ error: 'Missing "from" path' }, { status: 400 });
    }

    const { token } = await resolveToken(req);
    if (!token) {
      return NextResponse.json({ error: 'No GitHub token available' }, { status: 401 });
    }

    const branch = config.branch;
    const fromFull = `${config.uploadPath}/${from}`;

    // ─── DELETE ───
    if (action === 'delete') {
      const sha = await getFileSha(token, fromFull, branch);
      if (!sha) return NextResponse.json({ error: 'File not found' }, { status: 404 });

      // Check if it's a folder
      const folderFiles = await getAllFilesInFolder(token, fromFull, branch);
      if (folderFiles.length > 0) {
        // Delete all files in folder (reverse order for safety)
        let deleted = 0;
        for (const f of [...folderFiles].reverse()) {
          const ok = await deleteFile(token, f.path, `Delete ${f.path.split('/').pop()}`, branch, f.sha);
          if (ok) deleted++;
        }
        try {
          await prisma.activityLog.create({
            data: {
              action: 'file_delete',
              userId: email,
              userName: profile?.name || email.split('@')[0],
              details: JSON.stringify({ path: from, filesDeleted: deleted, isFolder: true }),
            },
          });
        } catch {}
        return NextResponse.json({ success: true, deleted: deleted, isFolder: true });
      }

      const ok = await deleteFile(token, fromFull, `Delete ${from.split('/').pop()}`, branch, sha);
      if (!ok) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });

      try {
        await prisma.activityLog.create({
          data: {
            action: 'file_delete',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({ path: from }),
          },
        });
      } catch {}
      return NextResponse.json({ success: true });
    }

    // ─── RENAME ───
    if (action === 'rename') {
      if (!newName) return NextResponse.json({ error: 'Missing "newName"' }, { status: 400 });

      const fromParts = from.split('/');
      const oldName = fromParts[fromParts.length - 1];
      if (oldName === newName) return NextResponse.json({ success: true, message: 'No change' });

      const toPath = [...fromParts.slice(0, -1), newName].join('/');
      const toFull = `${config.uploadPath}/${toPath}`;

      // Check destination doesn't exist
      const existingSha = await getFileSha(token, toFull, branch);
      if (existingSha) return NextResponse.json({ error: `"${newName}" already exists at destination` }, { status: 409 });

      const sha = await getFileSha(token, fromFull, branch);
      if (!sha) return NextResponse.json({ error: 'File not found' }, { status: 404 });

      const data = await getContent(token, fromFull, branch);
      if (!data) return NextResponse.json({ error: 'Cannot read file' }, { status: 500 });

      const created = await createFile(token, toFull, data.content, `Rename ${oldName} → ${newName}`, branch);
      if (!created) return NextResponse.json({ error: 'Failed to create renamed file' }, { status: 500 });

      const deleted = await deleteFile(token, fromFull, `Delete original after rename: ${oldName}`, branch, sha);
      if (!deleted) return NextResponse.json({ error: 'Renamed but failed to delete original. Both copies exist.' }, { status: 500 });

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

      const toFull = `${config.uploadPath}/${to}`;
      if (fromFull === toFull) return NextResponse.json({ error: 'Source and destination are the same' }, { status: 400 });

      // Check destination parent exists
      const toParts = to.split('/');
      const destFileName = toParts[toParts.length - 1];
      const destFolder = toParts.slice(0, -1).join('/');
      const destFolderFull = destFolder ? `${config.uploadPath}/${destFolder}` : config.uploadPath;

      // Check if it's a folder move (to ends with / or to is a directory)
      const folderFiles = await getAllFilesInFolder(token, fromFull, branch);

      if (folderFiles.length > 0) {
        // Folder move — move all files
        let moved = 0;
        const fromBase = from;
        const toBase = to.replace(/\/$/, '');

        for (const f of folderFiles) {
          const relPath = f.path.replace(`${config.uploadPath}/${fromBase}`, '').replace(/^\//, '');
          const newFilePath = `${config.uploadPath}/${toBase}/${relPath}`;

          const fileData = await getContent(token, f.path, branch);
          if (!fileData) continue;

          const created = await createFile(token, newFilePath, fileData.content, `Move ${relPath}`, branch);
          if (created) {
            await deleteFile(token, f.path, `Delete original after move: ${relPath}`, branch, f.sha);
            moved++;
          }
        }

        try {
          await prisma.activityLog.create({
            data: {
              action: 'file_move',
              userId: email,
              userName: profile?.name || email.split('@')[0],
              details: JSON.stringify({ from, to, filesMoved: moved, isFolder: true }),
            },
          });
        } catch {}
        return NextResponse.json({ success: true, moved, isFolder: true });
      }

      // Single file move
      const existingSha = await getFileSha(token, toFull, branch);
      if (existingSha) return NextResponse.json({ error: `A file already exists at "${to}"` }, { status: 409 });

      const sha = await getFileSha(token, fromFull, branch);
      if (!sha) return NextResponse.json({ error: 'File not found' }, { status: 404 });

      const data = await getContent(token, fromFull, branch);
      if (!data) return NextResponse.json({ error: 'Cannot read file' }, { status: 500 });

      const created = await createFile(token, toFull, data.content, `Move ${from.split('/').pop()} → ${to}`, branch);
      if (!created) return NextResponse.json({ error: 'Failed to create file at destination' }, { status: 500 });

      const deleted = await deleteFile(token, fromFull, `Delete original after move: ${from.split('/').pop()}`, branch, sha);
      if (!deleted) return NextResponse.json({ error: 'Moved but failed to delete original. Both copies exist.' }, { status: 500 });

      try {
        await prisma.activityLog.create({
          data: {
            action: 'file_move',
            userId: email,
            userName: profile?.name || email.split('@')[0],
            details: JSON.stringify({ from, to }),
          },
        });
      } catch {}
      return NextResponse.json({ success: true, newPath: to });
    }

    // ─── COPY ───
    if (action === 'copy') {
      if (!to) return NextResponse.json({ error: 'Missing "to" destination' }, { status: 400 });

      const toFull = `${config.uploadPath}/${to}`;
      if (fromFull === toFull) return NextResponse.json({ error: 'Source and destination are the same' }, { status: 400 });

      const existingSha = await getFileSha(token, toFull, branch);
      if (existingSha) return NextResponse.json({ error: `A file already exists at "${to}"` }, { status: 409 });

      const data = await getContent(token, fromFull, branch);
      if (!data) return NextResponse.json({ error: 'Source file not found' }, { status: 404 });

      const created = await createFile(token, toFull, data.content, `Copy ${from.split('/').pop()} → ${to}`, branch);
      if (!created) return NextResponse.json({ error: 'Failed to copy' }, { status: 500 });

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
      return NextResponse.json({ success: true, newPath: to });
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
    const folder = url.searchParams.get('folder') || '';

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
        // At semester level (parts has dept/sem), only show course folders
        if (parts.length === 2) {
          return /^[A-Z]{2,5}-\d{3,5}\s*-\s*.+$/i.test(f.name) || /^[A-Z]{2,5}\s*-\s*.+$/i.test(f.name);
        }
        // Inside a course folder, show all subfolders
        return true;
      });

    return NextResponse.json({ folders });
  } catch {
    return NextResponse.json({ folders: [] });
  }
}
