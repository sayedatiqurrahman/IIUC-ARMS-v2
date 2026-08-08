import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';
import { ghFetch } from '@/lib/github-commit';

const GITHUB_API = 'https://api.github.com';

// Merge an open PR created by a contributor upload using the GitHub App bot
// (or the server GITHUB_TOKEN). A contributor's own PAT cannot merge a PR in
// the upstream repo, so the merge must run server-side with app-level access.
// Best effort: returns the PR url + whether it merged (failure is non-fatal —
// the PR stays open for manual review).
export async function mergePullRequest(prNumber: number): Promise<{ merged: boolean; url: string; error?: string }> {
  const { owner, repo } = config;
  const url = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
  const botToken = (await getRepoBotToken(owner, repo)) || process.env.GITHUB_TOKEN || '';
  if (!botToken) {
    return { merged: false, url, error: 'No bot token available to merge the pull request.' };
  }

  try {
    const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/merge`, botToken, {
      method: 'PUT',
      body: JSON.stringify({
        merge_method: 'squash',
        commit_title: `Upload via IIUC-ARMS (#${prNumber})`,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { merged: false, url, error: err.message || `Merge failed (${res.status})` };
    }
    return { merged: true, url };
  } catch (e: any) {
    return { merged: false, url, error: e?.message || 'Merge failed' };
  }
}
