import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { resolveUploadContext, commitUpload, logUploadActivity } from '@/lib/github-upload';
import { validateRepoPath } from '@/lib/repo-path';
import { canUploadToSemester, extractUploadSemester, extractUploadDepartment } from '@/lib/permissions';

export const maxDuration = 120;

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

      // Expected byte count per path — any mismatch means the multipart body was
      // truncated somewhere, so we reject before the file reaches GitHub.
      let expectedSizes: Record<string, number> = {};
      try {
        const raw = formData.get('sizes');
        if (typeof raw === 'string' && raw) expectedSizes = JSON.parse(raw);
      } catch {}

      // Extract files — each entry's filename is the full upload path
      const entries = Array.from(formData.entries());
      for (const [key, value] of entries) {
        if (key !== 'files') continue;
        if (!(value instanceof File)) continue;

        const filePath = value.name; // filename was set to the full path by the client
        if (!filePath) continue;

        // Strip the config.uploadPath prefix — the client already sends the full path
        // but the GitHub API calls below prepend it again, so store relative to uploadPath
        const relPath = filePath.startsWith(`${config.uploadPath}/`) ? filePath.slice(`${config.uploadPath}/`.length) : filePath;
        try {
          validateRepoPath(relPath, false);
        } catch {
          return NextResponse.json({ error: `Invalid file path: ${relPath}` }, { status: 400 });
        }

        const arrayBuf = await value.arrayBuffer();
        const bytes = Buffer.from(arrayBuf);
        if (typeof expectedSizes[relPath] === 'number') {
          const expected = expectedSizes[relPath];
          if (expected <= 0 || bytes.length !== expected) {
            return NextResponse.json(
              { error: `Corrupt upload rejected for ${relPath}: expected ${expected} bytes but got ${bytes.length}. Please re-upload this file.` },
              { status: 400 }
            );
          }
        }

        files.push({ path: relPath, content: bytes.toString('base64') });
      }
    } else {
      // Fallback: legacy JSON body (for any old clients or testing)
      const body = await req.json();
      files = (body.files || []).map((f: any) => ({ ...f, path: validateRepoPath(f.path, false) }));
      message = body.message || '';
      bodyToken = body.githubToken || '';
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (files.length > config.maxFilesPerUpload) {
      return NextResponse.json({ error: `Maximum ${config.maxFilesPerUpload} files per upload` }, { status: 400 });
    }

    // ── Resolve user + token, then commit ─────────────────────────────
    const resolved = await resolveUploadContext(req, bodyToken);
    if (!('ctx' in resolved)) {
      return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });
    }
    const ctx = resolved.ctx;

    // Semester scoping: admins/managers/teachers and "Add to Any Semester"
    // holders can upload anywhere; other users stay in their own semester or
    // one previous (Related Sources / Kitabs are always allowed).
    if (!ctx.isOwner && ctx.userEmail) {
      const { prisma } = await import('@/lib/prisma');
      const profile = await prisma.profile.findUnique({ where: { userId: ctx.userEmail } });
      const role = config.getEffectiveRole(ctx.userEmail, profile?.role);
      const isCR = profile?.isCR || false;
      const userSemester = profile?.semester || null;
      const userDepartment = profile?.department || null;
      for (const f of files) {
        const sem = extractUploadSemester(f.path);
        const dept = extractUploadDepartment(f.path);
        if (!sem) continue;
        const semCheck = await canUploadToSemester(ctx.userEmail, role, isCR, userSemester, sem, dept, userDepartment);
        if (!semCheck.allowed) {
          return NextResponse.json({ error: semCheck.reason }, { status: 403 });
        }
      }
    }

    const result = await commitUpload(ctx, files, message);

    if (result.success && ctx.userEmail) {
      await logUploadActivity(ctx.userEmail, files.map(f => f.path), result.pr?.url || null);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status || 500 });
    }

    return NextResponse.json({
      success: true,
      pr: result.pr,
      isOwner: result.direct || false,
      uploadedFiles: files.map(f => `${config.uploadPath}/${f.path}`),
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
