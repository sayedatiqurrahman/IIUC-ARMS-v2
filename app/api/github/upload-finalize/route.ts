import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { authorizeChunkUpload, resolveUploadContext, commitUpload, logUploadActivity } from '@/lib/github-upload';

export const maxDuration = 300;

// POST /api/github/upload-finalize — assemble all staged chunks for a session
// into one atomic git commit (blobs → tree → commit → ref). Supports the same
// direct-commit (owner/bot) and fork+PR flows as the regular upload route.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
  if (!rl.success) return rl.response!;

  try {
    const auth = await authorizeChunkUpload(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const email = auth.email;

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body.sessionId || '').trim();
    const message = String(body.message || '');
    const githubToken = typeof body.githubToken === 'string' ? body.githubToken : '';
    // Expected byte count per relative path, sent by the client. We reject any
    // assembled file whose byte count does not match, so a truncated/chunked
    // upload can never reach GitHub as a corrupt file.
    const expectedSizes: Record<string, number> =
      body.sizes && typeof body.sizes === 'object' ? body.sizes : {};

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');
    const rows = await prisma.uploadChunk.findMany({
      where: { sessionId, userId: email },
      orderBy: [{ path: 'asc' }, { index: 'asc' }],
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No staged chunks found for this session' }, { status: 400 });
    }

    // Assemble chunk bytes back into one base64 blob per path
    const groups = new Map<string, { total: number; chunks: { index: number; data: Buffer }[] }>();
    for (const row of rows) {
      const key = row.path;
      const group = groups.get(key) || { total: row.total, chunks: [] };
      group.chunks.push({ index: row.index, data: Buffer.from(row.data) });
      groups.set(key, group);
    }

    const files: { path: string; content: string }[] = [];
    const groupEntries = Array.from(groups.entries());
    for (const entry of groupEntries) {
      const [path, group] = entry;
      group.chunks.sort((a, b) => a.index - b.index);
      if (group.chunks.length !== group.total) {
        return NextResponse.json({ error: `Incomplete upload for ${path} (missing chunks)` }, { status: 400 });
      }
      for (let i = 0; i < group.total; i++) {
        if (group.chunks[i].index !== i) {
          return NextResponse.json({ error: `Incomplete upload for ${path}` }, { status: 400 });
        }
      }
      const assembled = Buffer.concat(group.chunks.map(c => c.data));
      if (typeof expectedSizes[path] === 'number') {
        const expected = expectedSizes[path];
        if (expected <= 0 || assembled.length !== expected) {
          return NextResponse.json(
            { error: `Corrupt upload rejected for ${path}: expected ${expected} bytes but got ${assembled.length}. Please re-upload this file.` },
            { status: 400 }
          );
        }
      }
      files.push({ path, content: assembled.toString('base64') });
    }

    if (files.length > config.maxFilesPerUpload) {
      return NextResponse.json({ error: `Maximum ${config.maxFilesPerUpload} files per upload` }, { status: 400 });
    }

    // ── Resolve user + token, then commit ─────────────────────────────
    const resolved = await resolveUploadContext(req, githubToken);
    if (!('ctx' in resolved)) {
      return NextResponse.json({ error: resolved.error, code: resolved.code }, { status: resolved.status });
    }
    const ctx = resolved.ctx;

    const result = await commitUpload(ctx, files, message);

    // Best effort: clear the staged chunks regardless of outcome so a retry
    // re-stages cleanly (the user must re-upload chunks after a failure).
    try {
      await prisma.uploadChunk.deleteMany({ where: { sessionId, userId: email } });
    } catch {}

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
    console.error('[upload-finalize] error:', e?.message || e);
    const msg = e?.message || '';
    if (msg.includes('401') || msg.includes('403') || msg.includes('Bad credentials') || msg.includes('Requires authentication')) {
      return NextResponse.json(
        { error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', code: 'TOKEN_EXPIRED' },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: msg || 'Failed to finalize upload' }, { status: 500 });
  }
}
