import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getRepoBotToken } from '@/lib/github-app';
import { commitFilesToBranch } from '@/lib/github-commit';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  APP_ID_REGEX,
  MATERIAL_ICON_REGEX,
  RESERVED_APP_IDS,
  STUDIO_REPO,
  StudioApp,
} from '@/lib/studio-apps';

const GITHUB_API = 'https://api.github.com';
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_ICON_SVG_BYTES = 32 * 1024;

interface UploadFile {
  path: string;
  content: string; // base64
}

// POST /api/studio-apps/publish
// Body: {
//   id, title, subtitle, description,
//   icon (Material Symbols name) | iconSvg (data: URI),
//   files: [{ path, content(base64) }],
//   author: { name, githubLogin, email, universityId }
// }
//
// Writes apps/<id>/… + studio-apps.json to the QSIS-ARMS-v2 repo in one atomic
// commit authored as the uploader, so the app shows up in Studio immediately
// (no rebuild) and the author is credited as a code contributor.

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email || '';
    if (!sessionEmail) {
      return NextResponse.json({ error: 'Sign in first to contribute an app.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const id = String(body.id || '').trim().toLowerCase();
    if (!APP_ID_REGEX.test(id) || RESERVED_APP_IDS.has(id)) {
      return NextResponse.json({
        error: 'App ID must be 2–30 lowercase letters, numbers and dashes, and not a reserved name.',
      }, { status: 400 });
    }

    const title = String(body.title || '').trim().slice(0, 60);
    const subtitle = String(body.subtitle || '').trim().slice(0, 120);
    const description = String(body.description || '').trim().slice(0, 400);
    if (!title) {
      return NextResponse.json({ error: 'App title is required.' }, { status: 400 });
    }

    // Icon: a Material Symbols name or a custom SVG data URI (SVG wins).
    let icon = String(body.icon || '').trim().toLowerCase();
    let iconSvg = '';
    if (typeof body.iconSvg === 'string' && body.iconSvg.trim()) {
      const svgRaw = body.iconSvg.trim();
      if (!svgRaw.startsWith('data:image/svg+xml;base64,') && !svgRaw.startsWith('data:image/svg+xml,')) {
        return NextResponse.json({ error: 'Custom icon must be an SVG data URI.' }, { status: 400 });
      }
      if (svgRaw.length > MAX_ICON_SVG_BYTES * 2) {
        return NextResponse.json({ error: 'Custom icon SVG is too large.' }, { status: 400 });
      }
      iconSvg = svgRaw;
    } else if (!MATERIAL_ICON_REGEX.test(icon)) {
      return NextResponse.json({
        error: 'Pick an icon (letters, numbers, underscores) or upload a custom SVG.',
      }, { status: 400 });
    }

    // Files: paths must be safe, content must be base64, total size capped.
    if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > MAX_FILES) {
      return NextResponse.json({ error: `Attach between 1 and ${MAX_FILES} files (your dist folder).` }, { status: 400 });
    }

    const files: UploadFile[] = [];
    let totalBytes = 0;
    for (const f of body.files) {
      const rawPath = String(f?.path || '').replace(/\\/g, '/');
      const cleanPath = rawPath.replace(/^\.\/+/, '');
      if (!cleanPath || cleanPath.startsWith('/') || cleanPath.includes('..') || cleanPath.includes('//')) {
        return NextResponse.json({ error: `Unsafe file path: ${rawPath}` }, { status: 400 });
      }
      const content = String(f?.content || '');
      if (!content) continue;
      let bytes = 0;
      try {
        bytes = Buffer.from(content, 'base64').length;
      } catch {
        return NextResponse.json({ error: `Could not decode ${cleanPath}.` }, { status: 400 });
      }
      if (bytes === 0) continue;
      totalBytes += bytes;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: 'Total app size exceeds 8 MB.' }, { status: 400 });
      }
      files.push({ path: cleanPath, content });
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'No readable files received.' }, { status: 400 });
    }

    // Entry: index.html preferred, otherwise the first .html file.
    const hasHtml = files.some((f) => f.path.toLowerCase().endsWith('.html'));
    if (!hasHtml) {
      return NextResponse.json({ error: 'The app needs at least one HTML file (e.g. index.html).' }, { status: 400 });
    }
    const entry = files.some((f) => f.path.toLowerCase() === 'index.html')
      ? 'index.html'
      : files.find((f) => f.path.toLowerCase().endsWith('.html'))!.path;

    // Author identity from the client + session (mirrors the Creative Hub flow).
    const author = {
      name: String(body.author?.name || session.user?.name || '').trim() || sessionEmail.split('@')[0],
      githubLogin: String(body.author?.githubLogin || '').trim() || sessionEmail.split('@')[0],
      email: String(body.author?.email || '').trim() || sessionEmail,
      universityId: String(body.author?.universityId || '').trim(),
    };

    // Write token: GitHub App bot first, then the env token.
    let token = '';
    const botToken = await getRepoBotToken(STUDIO_REPO.owner, STUDIO_REPO.repo);
    if (botToken) token = botToken;
    if (!token && process.env.GITHUB_TOKEN) token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'Publishing is temporarily unavailable. Please try again later.' }, { status: 503 });
    }

    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

    // Current head of main (base for the commit).
    const refRes = await fetch(`${GITHUB_API}/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/git/refs/heads/${STUDIO_REPO.branch}`, {
      headers,
      cache: 'no-store',
    });
    if (!refRes.ok) {
      return NextResponse.json({ error: `Could not reach the apps repo (${refRes.status}).` }, { status: 502 });
    }
    const baseSha = (await refRes.json()).object.sha;

    // Load the current registry to merge into.
    let registry: { version: number; apps: StudioApp[] } = { version: 1, apps: [] };
    try {
      const regRes = await fetch(`${GITHUB_API}/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/contents/${STUDIO_REPO.registryPath}?ref=${STUDIO_REPO.branch}`, {
        headers,
        cache: 'no-store',
      });
      if (regRes.ok) {
        const data = await regRes.json();
        const parsed = JSON.parse(Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8'));
        if (parsed && Array.isArray(parsed.apps)) {
          registry = { version: Number(parsed.version) || 1, apps: parsed.apps };
        }
      }
    } catch {}

    const existingIndex = registry.apps.findIndex((a) => a.id === id);
    if (existingIndex >= 0) {
      const existing = registry.apps[existingIndex];
      const sameAuthor =
        (existing.author?.githubLogin && existing.author.githubLogin === author.githubLogin) ||
        (existing.author?.email && existing.author.email.toLowerCase() === author.email.toLowerCase());
      if (!sameAuthor) {
        return NextResponse.json({ error: 'That app ID is already taken by another contributor.' }, { status: 409 });
      }
    }

    const now = new Date().toISOString();
    const registryEntry: StudioApp = {
      id,
      title,
      subtitle,
      description,
      icon,
      ...(iconSvg ? { iconSvg } : {}),
      source: 'community',
      entry,
      author,
      addedAt: existingIndex >= 0 ? registry.apps[existingIndex].addedAt || now : now,
    };
    if (existingIndex >= 0) registry.apps[existingIndex] = registryEntry;
    else registry.apps.push(registryEntry);

    // Atomic commit: app files + updated registry.
    const commitFiles = files.map((f) => ({
      path: `${STUDIO_REPO.appsPath}/${id}/${f.path}`,
      content: f.content,
    }));
    commitFiles.push({
      path: STUDIO_REPO.registryPath,
      content: Buffer.from(JSON.stringify({ version: registry.version, apps: registry.apps }, null, 2)).toString('base64'),
    });

    const commitSha = await commitFilesToBranch({
      token,
      owner: STUDIO_REPO.owner,
      repo: STUDIO_REPO.repo,
      branch: STUDIO_REPO.branch,
      baseSha,
      files: commitFiles,
      message: `feat(studio-apps): add "${title}" by ${author.name}`,
      author: { name: author.name, email: author.email },
    });

    return NextResponse.json({
      ok: true,
      id,
      commitSha,
      url: `/studio/app/${id}`,
      entry,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Publish failed. Please try again.' }, { status: 500 });
  }
}
