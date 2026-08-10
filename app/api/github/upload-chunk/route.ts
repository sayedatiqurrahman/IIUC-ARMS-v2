import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { authorizeChunkUpload } from '@/lib/github-upload';
import { validateRepoPath } from '@/lib/repo-path';

export const maxDuration = 60;

const MAX_CHUNK_BYTES = 4 * 1024 * 1024; // request body must stay under Vercel's 4.5MB cap
const STAGING_QUOTA_BYTES = 256 * 1024 * 1024; // per-user cap on bytes staged at once
const STALE_CHUNK_MS = 2 * 60 * 60 * 1000; // abandoned sessions swept after 2h

// POST /api/github/upload-chunk — store one chunk of a large file in the DB.
// The client uploads each chunk (≤2.5MB) as a separate request, then calls
// /api/github/upload-finalize to assemble them into a single git commit.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.chunk);
  if (!rl.success) return rl.response!;

  try {
    const auth = await authorizeChunkUpload(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const email = auth.email;

    const formData = await req.formData();
    const sessionId = (formData.get('sessionId') as string || '').trim();
    const filePath = (formData.get('path') as string || '').trim();
    const indexStr = (formData.get('index') as string || '').trim();
    const totalStr = (formData.get('total') as string || '').trim();
    const chunk = formData.get('chunk');

    if (!sessionId || !filePath || !chunk) {
      return NextResponse.json({ error: 'sessionId, path, index, total and chunk are required' }, { status: 400 });
    }
    if (!(chunk instanceof File)) {
      return NextResponse.json({ error: 'chunk must be a file part' }, { status: 400 });
    }

    const index = Number(indexStr);
    const total = Number(totalStr);
    if (!Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || index >= total) {
      return NextResponse.json({ error: 'Invalid chunk index/total' }, { status: 400 });
    }
    if (total > 200) {
      return NextResponse.json({ error: 'Too many chunks for one file' }, { status: 400 });
    }
    if (chunk.size > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: 'Chunk too large' }, { status: 400 });
    }

    const relPath = filePath.startsWith(`${config.uploadPath}/`) ? filePath.slice(`${config.uploadPath}/`.length) : filePath;
    try {
      validateRepoPath(relPath, false);
    } catch {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');

    // Sweep this user's stale sessions (uploads abandoned mid-way)
    try {
      await prisma.uploadChunk.deleteMany({
        where: { userId: email, createdAt: { lt: new Date(Date.now() - STALE_CHUNK_MS) } },
      });
    } catch {}

    // Replace any previous version of this exact chunk (retry-safety)
    await prisma.uploadChunk.deleteMany({
      where: { sessionId, userId: email, path: relPath, index },
    });

    // Per-user staging quota so the free DB tier can't be exhausted by a
    // runaway upload session. Sums actual bytes via LENGTH(data).
    try {
      const staged = await prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COALESCE(SUM(LENGTH(data)), 0) AS total
        FROM "UploadChunk" WHERE "userId" = ${email}
      `;
      const stagedBytes = Number(staged[0]?.total || 0);
      if (stagedBytes + chunk.size > STAGING_QUOTA_BYTES) {
        return NextResponse.json(
          { error: 'Staging quota exceeded — finalize or clear earlier uploads before continuing' },
          { status: 429 }
        );
      }
    } catch {}

    await prisma.uploadChunk.create({
      data: {
        sessionId,
        userId: email,
        path: relPath,
        index,
        total,
        data: Buffer.from(new Uint8Array(await chunk.arrayBuffer())),
      },
    });

    return NextResponse.json({ ok: true, index, total });
  } catch (e: any) {
    console.error('[upload-chunk] error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to store chunk' }, { status: 500 });
  }
}
