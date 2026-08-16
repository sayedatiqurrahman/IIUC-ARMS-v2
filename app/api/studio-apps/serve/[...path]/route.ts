import { NextRequest, NextResponse } from 'next/server';
import {
  APP_ID_REGEX,
  contentTypeFor,
  isSafeAssetPath,
  STUDIO_APP_FILES_CACHE_TAG,
  STUDIO_REPO,
} from '@/lib/studio-apps';

// GET /api/studio-apps/serve/<id>/[...path]
// Proxies a community app file straight from the IIUC-ARMS-v2 repo so a
// contributed static build runs inside an iframe with relative asset URLs
// resolved under this same origin — no Vercel rebuild involved.
//
// Responses are cached for 60s (tagged 'studio-app-files' + edge s-maxage), so
// the app and its assets load instantly on repeat visits instead of hitting
// GitHub every time. Publishing an app purges the tag.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const [id, ...rest] = path || [];

  if (!id || !APP_ID_REGEX.test(id)) {
    return NextResponse.json({ error: 'App not found.' }, { status: 404 });
  }

  let filePath = rest.join('/') || 'index.html';
  if (!isSafeAssetPath(filePath)) {
    return NextResponse.json({ error: 'Bad path.' }, { status: 400 });
  }

  const owner = STUDIO_REPO.owner;
  const repo = STUDIO_REPO.repo;
  const branch = STUDIO_REPO.branch;
  const base = `${owner}/${repo}/${branch}/apps/${id}/${filePath}`;

  const cacheControl =
    'public, max-age=60, s-maxage=60, stale-while-revalidate=3600';

  // Primary: raw CDN (fast, cached).
  const rawUrl = `https://raw.githubusercontent.com/${base}`;
  const rawRes = await fetch(rawUrl, {
    next: { revalidate: 60, tags: [STUDIO_APP_FILES_CACHE_TAG] },
  });
  if (rawRes.ok) {
    const buf = Buffer.from(await rawRes.arrayBuffer());
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentTypeFor(filePath),
        'Cache-Control': cacheControl,
      },
    });
  }

  // Fallback: contents API — no CDN cache, so a freshly published app appears
  // immediately even if the raw edge hasn't picked it up yet.
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/apps/${id}/${filePath}?ref=${branch}`;
    const apiRes = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      next: { revalidate: 60, tags: [STUDIO_APP_FILES_CACHE_TAG] },
    });
    if (apiRes.ok) {
      const meta = await apiRes.json();
      if (meta?.encoding === 'base64' && typeof meta.content === 'string') {
        const buf = Buffer.from(meta.content.replace(/\n/g, ''), 'base64');
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'Content-Type': contentTypeFor(filePath),
            'Cache-Control': cacheControl,
          },
        });
      }
    }
  } catch {}

  return NextResponse.json(
    { error: 'App file not found. It may still be syncing to GitHub.' },
    { status: 404 }
  );
}
