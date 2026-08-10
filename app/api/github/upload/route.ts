import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { resolveUploadContext, commitUpload, logUploadActivity } from '@/lib/github-upload';
import { validateRepoPath } from '@/lib/repo-path';

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
        try {
          validateRepoPath(relPath, false);
        } catch {
          return NextResponse.json({ error: `Invalid file path: ${relPath}` }, { status: 400 });
        }
        files.push({ path: relPath, content: base64 });
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
