import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

const GITHUB_API = 'https://api.github.com';

const REPOS = [
  { repo: config.sourceRepo, key: 'code', label: 'Source Code' },
  { repo: config.repo, key: 'data', label: 'Academic Files' },
];

async function getGithubToken(): Promise<string> {
  // Try GitHub App installation token first
  try {
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) return token;
    }
  } catch {}

  // Fall back to env token
  return process.env.GITHUB_TOKEN || '';
}

function ghHeaders(token: string) {
  return {
    Authorization: token ? `token ${token}` : '',
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

// Fetch ALL pages of a GitHub API endpoint
async function fetchAllPages(url: string, token: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  const maxPages = 5; // safety limit: 5 * 100 = 500 items max

  while (page <= maxPages) {
    const separator = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${separator}per_page=100&page=${page}`;
    try {
      const res = await fetch(pageUrl, { headers: ghHeaders(token) });
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      results.push(...data);
      if (data.length < 100) break; // last page
      page++;
    } catch {
      break;
    }
  }

  return results;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const login = searchParams.get('login')?.trim();
    if (!login) {
      return NextResponse.json({ error: 'Missing login' }, { status: 400 });
    }

    const token = await getGithubToken();
    const events: any[] = [];
    let commitCount = 0;
    let prCount = 0;

    for (const { repo, key, label } of REPOS) {
      const base = `${GITHUB_API}/repos/${config.owner}/${repo}`;

      const [commits, prs] = await Promise.all([
        fetchAllPages(`${base}/commits?author=${encodeURIComponent(login)}`, token),
        fetchAllPages(`${base}/pulls?state=all`, token),
      ]);

      for (const c of commits) {
        // The `author` query already narrows by name/email/username; double-check login
        // so name-collisions can't attribute someone else's commits to this user.
        if (c.author?.login !== login && c.committer?.login !== login) continue;
        commitCount++;
        events.push({
          type: 'commit',
          repo: key,
          repoLabel: label,
          sha: c.sha,
          shortSha: c.sha?.slice(0, 7),
          title: c.commit?.message?.split('\n')[0]?.trim() || '(no message)',
          message: c.commit?.message || '',
          date: c.commit?.author?.date || c.commit?.committer?.date || '',
          url: c.html_url,
        });
      }

      for (const pr of prs) {
        if (pr.user?.login !== login) continue;
        prCount++;
        events.push({
          type: 'pr',
          repo: key,
          repoLabel: label,
          number: pr.number,
          title: pr.title || `Pull request #${pr.number}`,
          state: pr.merged_at ? 'merged' : pr.state,
          date: pr.merged_at || pr.created_at || '',
          url: pr.html_url,
        });
      }
    }

    const sorted = events
      .filter((e) => e.date && !isNaN(new Date(e.date).getTime()))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ login, events: sorted, commitCount, prCount });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load contribution history' }, { status: 500 });
  }
}
