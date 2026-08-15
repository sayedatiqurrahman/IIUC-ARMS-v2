import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getRepoBotToken } from '@/lib/github-app';
import { commitFilesToBranch } from '@/lib/github-commit';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { buildCommunityFolder, extractFieldTypes, FIELD_LABELS } from '@/components/studio/creative-hub/templates';

const GITHUB_API = 'https://api.github.com';

// POST /api/creative-hub/publish
// Body: { html, name, subtitle, description, language, categories, pageSize, thumbnailBase64, fields, publishedAt }
//
// Publishes a design to the community repo:
//   community/<full_name-metric_id@email_design_sn>/{design.html,design.json,thumbnail.webp}
// and bumps the author's design count in authors.json. The design is only
// accepted if its HTML carries custom data-field-type attributes — those power
// the Form Fill-up mode for every other user.

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const ch = config.creativeHub;
  const owner = ch.owner;
  const repo = ch.repo;
  const branch = ch.branch;

  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email || '';
    if (!email) {
      return NextResponse.json({ error: 'Sign in first to publish a design.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body?.html || typeof body.html !== 'string') {
      return NextResponse.json({ error: 'No design HTML received.' }, { status: 400 });
    }

    // Validation: data-field-type attributes are required so other users can
    // form-fill the design after it is published.
    const fieldTypes = extractFieldTypes(body.html);
    if (fieldTypes.length === 0) {
      return NextResponse.json({
        error: 'Your design has no custom data-field-type attributes. Add them (e.g. data-field-type="student_name") to the editable elements, then publish again.',
      }, { status: 400 });
    }

    // The author's identity is resolved purely from GitHub (session + request
    // payload) — the themes repo's authors.json is the source of truth, so no
    // cloud database is involved anywhere in the creative hub pipeline.
    const fullName = (body.authorName as string) || session.user?.name || email.split('@')[0] || 'student';
    const authorEmail = (body.authorEmail as string) || email;
    const universityId = (body.universityId as string) || '';
    const githubLogin = (body.githubLogin as string) || email.split('@')[0];
    const designSn = Number(body.designSn) || 1;
    const folderName = buildCommunityFolder(fullName, authorEmail, universityId, designSn);
    const folder = `${ch.communityPath}/${folderName}`;

    const base64 = (s: string) => btoa(String(s));

    const files = [
      { path: `${folder}/design.html`, content: base64(body.html) },
      {
        path: `${folder}/design.json`,
        content: base64(JSON.stringify({
          name: body.name || 'Untitled Design',
          subtitle: body.subtitle || '',
          description: body.description || '',
          language: body.language || 'english',
          categories: Array.isArray(body.categories) ? body.categories : [],
          pageSize: body.pageSize || ch.defaultPageSize,
          fields: fieldTypes.map((t) => ({ type: t, label: FIELD_LABELS[t] || t })),
          author: body.authorName || fullName,
          authorEmail,
          githubLogin,
          universityId,
          designSn,
          publishedAt: new Date().toISOString(),
        }, null, 2)),
      },
      { path: `${folder}/thumbnail.webp`, content: String(body.thumbnailBase64 || '') },
    ];

    // Extra binary/text assets (e.g. a flattened background image for manual
    // designs). Paths must stay inside the design folder.
    if (Array.isArray(body.assets)) {
      for (const asset of body.assets) {
        const assetPath = String(asset?.path || '').replace(/\\/g, '/');
        if (!assetPath || assetPath.includes('..') || assetPath.startsWith('/')) continue;
        files.push({ path: `${folder}/${assetPath}`, content: String(asset?.content || '') });
      }
    }

    // Resolve a token with write access to the themes repo: GitHub App bot
    // token first, then the environment token. No database is consulted.
    let token = '';
    const botToken = await getRepoBotToken(owner, repo);
    if (botToken) token = botToken;
    if (!token && process.env.GITHUB_TOKEN) token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'Publishing is temporarily unavailable. Please try again later.' }, { status: 503 });
    }

    // Current head of the branch (base for the commit).
    const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      cache: 'no-store',
    });
    if (!refRes.ok) {
      return NextResponse.json({ error: `Could not reach the themes repo (${refRes.status}).` }, { status: 502 });
    }
    const baseSha = (await refRes.json()).object.sha;

    // Update authors.json — increment the author's design count.
    let authors: any[] = [];
    try {
      const authorsRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${ch.authorsPath}?ref=${branch}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
        cache: 'no-store',
      });
      if (authorsRes.ok) {
        const data = await authorsRes.json();
        authors = JSON.parse(Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')).authors || [];
      }
    } catch {}

    const existing = authors.find(
      (a: any) => (a.githubLogin && a.githubLogin === githubLogin) || (a.email && a.email.toLowerCase() === authorEmail.toLowerCase())
    );
    if (existing) {
      existing.designCount = (existing.designCount || 0) + 1;
    } else {
      authors.push({
        name: fullName,
        githubLogin,
        email: authorEmail,
        universityId,
        designCount: 1,
        firstDesignAt: new Date().toISOString(),
      });
    }

    files.push({
      path: ch.authorsPath,
      content: base64(JSON.stringify({ version: 1, authors }, null, 2)),
    });

    // Atomic commit: design files + authors.json.
    const commitSha = await commitFilesToBranch({
      token,
      owner,
      repo,
      branch,
      baseSha,
      files,
      message: `chore(creative-hub): publish "${folderName}" by ${fullName}`,
      author: { name: fullName, email: authorEmail },
    });

    return NextResponse.json({
      ok: true,
      folder: folderName,
      commitSha,
      designSn,
      fieldTypes,
      designCount: existing ? existing.designCount : 1,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Publish failed. Please try again.' }, { status: 500 });
  }
}
