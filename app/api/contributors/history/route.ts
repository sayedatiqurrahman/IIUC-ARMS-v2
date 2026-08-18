import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

const GITHUB_API = 'https://api.github.com';

const REPOS = [
  { repo: config.sourceRepo, key: 'code', label: 'Source Code' },
  { repo: config.repo, key: 'data', label: 'Academic Files' },
];

async function getGithubToken(): Promise<string> {
  try {
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) return token;
    }
  } catch {}
  return process.env.GITHUB_TOKEN || '';
}

function ghHeaders(token: string) {
  return {
    Authorization: token ? `token ${token}` : '',
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function fetchAllPages(url: string, token: string, maxPages = 10): Promise<{ data: any[]; rateLimited: boolean }> {
  const results: any[] = [];
  let page = 1;
  let rateLimited = false;
  while (page <= maxPages) {
    const separator = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${separator}per_page=100&page=${page}`;
    try {
      const res = await fetch(pageUrl, { headers: ghHeaders(token) });
      if (res.status === 403 || res.status === 429) {
        rateLimited = true;
        console.warn(`[history] Rate limited on ${url} page ${page} (HTTP ${res.status})`);
        break;
      }
      if (!res.ok) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      results.push(...data);
      if (data.length < 100) break;
      page++;
    } catch { break; }
  }
  return { data: results, rateLimited };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const login = searchParams.get('login')?.trim();
    if (!login) {
      return NextResponse.json({ error: 'Missing login' }, { status: 400 });
    }

    const token = await getGithubToken();

    // Fetch the contributor's email from DB profile so we can also match
    // commits made by the app bot (where author.login won't match).
    // NOTE: Profile.userId is a cuid — GitHub login is in Profile.githubLogin.
    let profileEmail = '';
    try {
      const { prisma } = await import('@/lib/prisma');
      const profile = await prisma.profile.findFirst({
        where: { OR: [{ githubLogin: login }, { userId: login }] },
      });
      if (profile?.publicEmail) profileEmail = profile.publicEmail.toLowerCase();
      else if (profile?.email) profileEmail = profile.email.toLowerCase();
    } catch {}

    // Also fetch the user's public email from GitHub profile
    let ghPublicEmail = '';
    try {
      const userRes = await fetch(`${GITHUB_API}/users/${encodeURIComponent(login)}`, { headers: ghHeaders(token) });
      if (userRes.ok) {
        const ghUser = await userRes.json();
        if (ghUser.email) ghPublicEmail = ghUser.email.toLowerCase();
      }
    } catch {}

    const noreplyEmail = `${login}@users.noreply.github.com`.toLowerCase();

    const events: any[] = [];
    let commitCount = 0;
    let prCount = 0;

    for (const { repo, key, label } of REPOS) {
      const base = `${GITHUB_API}/repos/${config.owner}/${repo}`;

      const [loginCommitResult, prResult] = await Promise.all([
        fetchAllPages(`${base}/commits?author=${encodeURIComponent(login)}`, token),
        fetchAllPages(`${base}/pulls?state=all`, token),
      ]);
      const commits = loginCommitResult.data;
      const prs = prResult.data;

      // Fetch commits by all known emails to catch bot-authored commits
      const emailSet = new Set<string>();
      if (profileEmail) emailSet.add(profileEmail);
      if (ghPublicEmail && ghPublicEmail !== profileEmail) emailSet.add(ghPublicEmail);
      if (!emailSet.has(noreplyEmail)) emailSet.add(noreplyEmail);

      let emailCommits: any[] = [];
      for (const email of Array.from(emailSet)) {
        try {
          const { data: fetched, rateLimited } = await fetchAllPages(`${base}/commits?author=${encodeURIComponent(email)}`, token);
          emailCommits.push(...fetched);
          if (rateLimited) {
            console.warn(`[history] Rate limited fetching commits for email ${email} in ${repo}`);
          }
        } catch {}
      }

      // Merge and dedupe by SHA
      const seenShas = new Set<string>();
      const allCommits = [...commits, ...emailCommits];

      for (const c of allCommits) {
        if (seenShas.has(c.sha)) continue;
        seenShas.add(c.sha);

        const authorLogin = c.author?.login || '';
        const committerLogin = c.committer?.login || '';
        const authorEmail = (c.commit?.author?.email || '').toLowerCase();
        const committerEmail = (c.commit?.committer?.email || '').toLowerCase();

        // Match if: login matches OR email matches any known email
        const loginMatch = authorLogin === login || committerLogin === login;
        const emailMatch = authorEmail === noreplyEmail || committerEmail === noreplyEmail
          || (profileEmail && (authorEmail === profileEmail || committerEmail === profileEmail))
          || (ghPublicEmail && (authorEmail === ghPublicEmail || committerEmail === ghPublicEmail));

        if (!loginMatch && !emailMatch) continue;

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
