import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getRepoBotToken } from '@/lib/github-app';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { APP_ID_REGEX, STUDIO_REPO } from '@/lib/studio-apps';

const GITHUB_API = 'https://api.github.com';

// POST /api/studio-apps/issues
// Body: { id, title?, description }
//
// Opens a GitHub issue on the QSIS-ARMS-v2 repo for a community Studio app:
//   - labeled `bug` + `studio-app`
//   - titled against the app, pointing at the apps/<id>/ directory
//   - assigned to the app's author (when they're a collaborator), which notifies
//     them their app has a problem
// The reporter's GitHub identity is linked so the report counts towards their
// bug-issue contribution total.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  try {
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email || '';
    if (!sessionEmail) {
      return NextResponse.json({ error: 'Sign in first to report an issue.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const id = String(body.id || '').trim().toLowerCase();
    if (!APP_ID_REGEX.test(id)) {
      return NextResponse.json({ error: 'Invalid app id.' }, { status: 400 });
    }

    const reportTitle = String(body.title || '').trim().slice(0, 100);
    const description = String(body.description || '').trim().slice(0, 4000);
    if (description.length < 5) {
      return NextResponse.json({ error: 'Describe the problem you found (at least a few words).' }, { status: 400 });
    }

    // Resolve the app from the live registry so we know its author.
    const { fetchRegistryFromGitHub } = await import('@/lib/studio-apps');
    const community = await fetchRegistryFromGitHub();
    const app = community.find((a) => a.id === id && a.source === 'community');
    if (!app) {
      return NextResponse.json({ error: 'That community app no longer exists.' }, { status: 404 });
    }

    let token = '';
    const botToken = await getRepoBotToken(STUDIO_REPO.owner, STUDIO_REPO.repo);
    if (botToken) token = botToken;
    if (!token && process.env.GITHUB_TOKEN) token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'Reporting is temporarily unavailable. Please try again later.' }, { status: 503 });
    }

    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' };

    // Avoid duplicate open reports for the same app.
    try {
      const searchUrl = `${GITHUB_API}/search/issues?q=repo:${STUDIO_REPO.owner}/${STUDIO_REPO.repo}+is:issue+is:open+label:%22studio-app%22+%22app:%20${encodeURIComponent(id)}%22`;
      const dupRes = await fetch(searchUrl, { headers, cache: 'no-store' });
      if (dupRes.ok) {
        const dup = await dupRes.json();
        if (dup && dup.total_count && dup.total_count > 0) {
          const existing = dup.items?.[0];
          return NextResponse.json({
            error: 'A similar report is already open.',
            existingIssueUrl: existing?.html_url,
            issueNumber: existing?.number,
          }, { status: 409 });
        }
      }
    } catch {}

    const login = session.user?.name || sessionEmail.split('@')[0];
    const author = app.author;
    const authorLogin = author?.githubLogin || (author?.email || '').split('@')[0];

    const issueTitle = reportTitle || `[Studio App] ${app.title} — problem reported`;
    const repoDir = `${STUDIO_REPO.appsPath}/${id}`;
    const issueBody = [
      `**App:** ${app.title}`,
      `**App ID:** \`${id}\``,
      `**App folder:** [\`${repoDir}/\`](https://github.com/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/tree/${STUDIO_REPO.branch}/${repoDir})`,
      `**Author:** ${author ? `@${authorLogin} (${author.name})` : 'unknown'}`,
      `**Reported by:** @${login}`,
      '',
      '---',
      '',
      description,
      '',
      `_Reported from the Studio app page. ${authorLogin ? `@${authorLogin} this is about your app.` : ''}_`,
    ].join('\n');

    // Make sure the labels exist (idempotent), then open the issue.
    const labels = ['bug', 'studio-app'];
    for (const label of labels) {
      try {
        await fetch(`${GITHUB_API}/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/labels/${encodeURIComponent(label)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ name: label, color: label === 'bug' ? 'd73a4a' : '1d76db', description: label === 'studio-app' ? 'Issues about community Studio apps' : undefined }),
        });
      } catch {}
    }

    const createRes = await fetch(`${GITHUB_API}/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels,
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => '');
      return NextResponse.json({ error: `Could not open the issue (${createRes.status}).` }, { status: 502 });
    }
    const issue = await createRes.json();

    // Assign the author so they get notified — only when they can be assigned.
    if (authorLogin) {
      try {
        const collabRes = await fetch(`${GITHUB_API}/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/collaborators/${encodeURIComponent(authorLogin)}`, {
          headers,
          cache: 'no-store',
        });
        if (collabRes.ok) {
          await fetch(`${GITHUB_API}/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/issues/${issue.number}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ assignees: [authorLogin] }),
          });
        }
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      appId: id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to report the issue. Please try again.' }, { status: 500 });
  }
}
