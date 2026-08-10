// Atomic multi-file commit to a GitHub branch using the git data API
// (blobs → tree → commit → ref update). One commit for the whole batch
// instead of one contents-API PUT per file, which is both faster and atomic.

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export interface FileToCommit {
  path: string;
  content: string; // base64-encoded file content
}

export interface CommitFilesOptions {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  baseSha: string;
  files: FileToCommit[];
  message: string;
  // Optional authorship so uploads pushed with a shared bot/server token still
  // credit the real uploader in the repo's commit history.
  author?: { name: string; email: string };
}

export async function ghFetch(url: string, token: string, opts?: RequestInit) {
  return fetch(url, { ...opts, headers: { ...ghHeaders(token), ...opts?.headers } });
}

export async function ghPut(url: string, token: string, body: any) {
  return fetch(url, { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body) });
}

// Returns the commit SHA on success, or throws with a short reason string.
export async function commitFilesToBranch(opts: CommitFilesOptions): Promise<string> {
  const { token, owner, repo, branch, baseSha, files, message } = opts;
  if (files.length === 0) throw new Error('no-files');
  const authorPayload = opts.author ? { author: opts.author } : {};

  // 1. Create a blob for each file in parallel
  const blobs = await Promise.all(files.map(async (f) => {
    const res = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({ content: f.content, encoding: 'base64' }),
    });
    if (!res.ok) throw new Error(`blob:${res.status}`);
    return { path: f.path, sha: (await res.json()).sha };
  }));

  // 2. Base tree of the parent commit
  const commitRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${baseSha}`, token);
  if (!commitRes.ok) throw new Error(`commit:${commitRes.status}`);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  // 3. New tree referencing the new blobs
  const treeRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new Error(`createtree:${treeRes.status}`);
  const newTreeSha = (await treeRes.json()).sha;

  // 4. Commit pointing at the new tree
  const newCommitRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseSha], ...authorPayload }),
  });
  if (!newCommitRes.ok) throw new Error(`commit2:${newCommitRes.status}`);
  const newCommitSha = (await newCommitRes.json()).sha;

  // 5. Fast-forward the branch ref (one retry if a concurrent commit landed)
  for (let attempt = 0; attempt < 2; attempt++) {
    const refRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha, force: attempt === 1 }),
    });
    if (refRes.ok) return newCommitSha;
    if (attempt === 0) {
      // Branch moved while we were working — re-read and retry with the new base
      const freshRef = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token);
      if (freshRef.ok) {
        const freshSha = (await freshRef.json()).object.sha;
        if (freshSha !== baseSha) {
          const freshBase = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${freshSha}`, token);
          if (freshBase.ok) {
            const retryTree = (await freshBase.json()).tree.sha;
            const retryTreeRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, token, {
              method: 'POST',
              body: JSON.stringify({
                base_tree: retryTree,
                tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
              }),
            });
            if (retryTreeRes.ok) {
              const retryCommitRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, token, {
                method: 'POST',
                body: JSON.stringify({ message, tree: (await retryTreeRes.json()).sha, parents: [freshSha], ...authorPayload }),
              });
              if (retryCommitRes.ok) {
                const retrySha = (await retryCommitRes.json()).sha;
                const retryRefRes = await ghFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
                  method: 'PATCH',
                  body: JSON.stringify({ sha: retrySha, force: true }),
                });
                if (retryRefRes.ok) return retrySha;
              }
            }
          }
        }
      }
      // Fall through to attempt 2 (force) with the original commit
    }
  }
  throw new Error(`refupdate`);
}
