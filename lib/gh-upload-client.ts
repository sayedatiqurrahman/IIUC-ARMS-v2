// Browser-side (client) GitHub upload engine.
//
// Sends file bytes straight from the browser to the GitHub git-data API, so the
// bytes never touch our Vercel server or the database. Only a browser-safe token
// (PAT / NextAuth session token / short-lived App bot token) is used here; the
// server-level GITHUB_TOKEN secret never leaves the server (those uploads fall
// back to the server-side routes).
//
// The git-data API requires ONE blob per file (git cannot split a file across
// blobs), so per-file base64 is built incrementally in 2.5MB slices to keep
// memory flat and to drive progress.

const GITHUB_API = 'https://api.github.com';
// Files are read and base64-encoded in 0.6MB slices (chunk by chunk) to keep
// memory flat and to drive live progress.
const SLICE_BYTES = 0.6 * 1024 * 1024;

export interface ClientUploadFile {
  path: string;   // repo-root-relative path (uploadPath is prepended by the caller)
  file?: File;    // binary content
  text?: string;  // text content (README links)
}

export interface ClientUploadOptions {
  token: string;
  owner: string;
  repo: string;
  directCommit: boolean; // owner/bot => commit to main; else fork + PR
  files: ClientUploadFile[];
  message: string;
  onProgress?: (percent: number, label: string) => void;
}

export interface ClientUploadResult {
  success: boolean;
  pr?: { url: string; number: number };
  direct?: boolean;
  error?: string;
  status?: number;
  code?: string;
}

class ClientUploadError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(url: string, token: string, opts?: RequestInit): Promise<Response> {
  return fetch(url, { ...opts, headers: { ...ghHeaders(token), ...opts?.headers } });
}

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.message || `GitHub error ${res.status}`;
  } catch {
    return `GitHub error ${res.status}`;
  }
}

async function retryFetch(url: string, token: string, opts: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { ...ghHeaders(token), ...opts.headers } });
      if (res.status !== 429 && res.status < 500) return res;
      lastErr = new Error(`GitHub error ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  throw lastErr;
}

function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunk = '';
    for (let j = i; j < Math.min(bytes.length, i + chunkSize); j++) chunk += String.fromCharCode(bytes[j]);
    bin += chunk;
  }
  return btoa(bin);
}

// Reads a File into base64 incrementally (2.5MB slices), calling onSlice after
// each slice so the UI can show live progress without holding the whole
// encoded string in memory twice.
async function fileToBase64(file: File, onSlice?: (percent: number) => void): Promise<string> {
  let result = '';
  const total = file.size || 1;
  for (let offset = 0; offset < file.size; offset += SLICE_BYTES) {
    const slice = file.slice(offset, Math.min(file.size, offset + SLICE_BYTES));
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(slice);
    });
    result += dataUrl.slice(dataUrl.indexOf(',') + 1);
    onSlice?.(Math.min(100, Math.round((offset + slice.size) / total * 100)));
  }
  return result;
}

// Commits already-created blobs to a branch (mirrors server commitFilesToBranch,
// including the one concurrent-commit retry).
async function commitBlobs(opts: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  baseSha: string;
  blobs: { path: string; sha: string }[];
  message: string;
}): Promise<string> {
  const { token, owner, repo, branch, baseSha, blobs, message } = opts;

  const commitRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${baseSha}`, token, {});
  if (!commitRes.ok) throw new ClientUploadError(`Cannot read parent commit: ${commitRes.status}`, commitRes.status);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new ClientUploadError(`Cannot create tree: ${treeRes.status}`, treeRes.status);
  const newTreeSha = (await treeRes.json()).sha;

  const newCommitRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseSha] }),
  });
  if (!newCommitRes.ok) throw new ClientUploadError(`Cannot create commit: ${newCommitRes.status}`, newCommitRes.status);
  const newCommitSha = (await newCommitRes.json()).sha;

  for (let attempt = 0; attempt < 2; attempt++) {
    const refRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha, force: attempt === 1 }),
    });
    if (refRes.ok) return newCommitSha;

    if (attempt === 0) {
      const freshRef = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {});
      if (freshRef.ok) {
        const freshSha = (await freshRef.json()).object.sha;
        if (freshSha !== baseSha) {
          const freshBase = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${freshSha}`, token, {});
          if (freshBase.ok) {
            const retryTree = (await freshBase.json()).tree.sha;
            const retryTreeRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, token, {
              method: 'POST',
              body: JSON.stringify({
                base_tree: retryTree,
                tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
              }),
            });
            if (retryTreeRes.ok) {
              const retryCommitRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, token, {
                method: 'POST',
                body: JSON.stringify({ message, tree: (await retryTreeRes.json()).sha, parents: [freshSha] }),
              });
              if (retryCommitRes.ok) {
                const retrySha = (await retryCommitRes.json()).sha;
                const retryRefRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
                  method: 'PATCH',
                  body: JSON.stringify({ sha: retrySha, force: true }),
                });
                if (retryRefRes.ok) return retrySha;
              }
            }
          }
        }
      }
    }
  }
  throw new ClientUploadError('Branch update failed after retry', 500);
}

async function directCommitToBranch(opts: {
  token: string;
  owner: string;
  repo: string;
  blobs: { path: string; sha: string }[];
  message: string;
}): Promise<ClientUploadResult> {
  const { token, owner, repo, blobs, message } = opts;

  const repoRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}`, token, {});
  if (repoRes.status === 401 || repoRes.status === 403) {
    throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
  }
  if (!repoRes.ok) throw new ClientUploadError(`Cannot access repo: ${repoRes.status}`, 500);
  const defaultBranch = (await repoRes.json()).default_branch;

  const refRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, token, {});
  if (!refRes.ok) throw new ClientUploadError(`Cannot read branch: ${refRes.status}`, 500);
  const baseSha = (await refRes.json()).object.sha;

  await commitBlobs({ token, owner, repo, branch: defaultBranch, baseSha, blobs, message });

  return {
    success: true,
    pr: { url: `https://github.com/${owner}/${repo}/commit/${defaultBranch}`, number: 0 },
    direct: true,
  };
}

async function forkAndPr(opts: {
  token: string;
  owner: string;
  repo: string;
  blobs: { path: string; sha: string }[];
  message: string;
}): Promise<ClientUploadResult> {
  const { token, owner, repo, blobs, message } = opts;

  const userRes = await retryFetch(`${GITHUB_API}/user`, token, {});
  if (userRes.status === 401) {
    throw new ClientUploadError('Token expired or invalid. Go to Dashboard → GitHub Connection → paste a new PAT.', 401, 'TOKEN_EXPIRED');
  }
  if (userRes.status === 403) {
    throw new ClientUploadError('Token lacks permissions. Create a new PAT at https://github.com/settings/tokens/new with "repo" scope, then paste it in Dashboard.', 403, 'TOKEN_NO_ACCESS');
  }
  if (!userRes.ok) {
    throw new ClientUploadError('Invalid token. Go to Dashboard → GitHub Connection → paste a valid PAT.', 401, 'TOKEN_INVALID');
  }
  const githubUser = await userRes.json();

  const forkFullName = `${githubUser.login}/${repo}`;
  const forkCheckRes = await retryFetch(`${GITHUB_API}/repos/${forkFullName}`, token, {});
  if (forkCheckRes.status === 404) {
    const forkRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/forks`, token, {
      method: 'POST',
      body: JSON.stringify({ default_branch_only: true }),
    });
    if (!forkRes.ok) {
      const msg = await extractError(forkRes);
      throw new ClientUploadError(msg || 'Failed to fork repository. Make sure your PAT has "repo" scope.', 500);
    }
    let forked = false;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const check = await retryFetch(`${GITHUB_API}/repos/${forkFullName}`, token, {});
      if (check.ok) { forked = true; break; }
    }
    if (!forked) throw new ClientUploadError('Fork is taking too long. Please try again.', 500);
  } else if (!forkCheckRes.ok) {
    throw new ClientUploadError('Cannot access your fork', 500);
  }

  const targetOwner = githubUser.login;
  const targetRepo = repo;

  const repoRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}`, token, {});
  if (repoRes.status === 401 || repoRes.status === 403) {
    throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
  }
  if (!repoRes.ok) throw new ClientUploadError('Cannot access repo', 500);
  const defaultBranch = (await repoRes.json()).default_branch;

  const baseRefRes = await retryFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token, {});
  if (baseRefRes.status === 401 || baseRefRes.status === 403) {
    throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
  }
  if (!baseRefRes.ok) throw new ClientUploadError('Cannot read branch', 500);
  const baseBranchSha = (await baseRefRes.json()).object.sha;

  const branch = `upload/${Date.now()}`;
  const createBranchRes = await retryFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, token, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseBranchSha }),
  });
  if (!createBranchRes.ok && createBranchRes.status !== 422) {
    const msg = await extractError(createBranchRes);
    if (createBranchRes.status === 403) {
      throw new ClientUploadError('Permission denied (403). Token needs Contents + Pull requests access. Create a classic PAT at: https://github.com/settings/tokens/new?description=IIUC-ARMS&scopes=repo', 403, 'TOKEN_NO_ACCESS');
    }
    throw new ClientUploadError(msg || 'Failed to create branch', 500);
  }

  await commitBlobs({ token, owner: targetOwner, repo: targetRepo, branch, baseSha: baseBranchSha, blobs, message });

  const prRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, token, {
    method: 'POST',
    body: JSON.stringify({
      title: message || `Upload: ${blobs.map((b: any) => b.path.split('/').pop()).join(', ')}`,
      body: [
        `## IIUC-ARMS File Upload`,
        ``,
        `**Contributor:** ${githubUser.name || githubUser.login} (@${githubUser.login})`,
        `**Email:** ${githubUser.email || 'N/A'}`,
        ``,
        `### Files`,
        blobs.map((b: any) => `- \`${b.path}\``).join('\n'),
        ``,
        `---`,
        `*Submitted via IIUC-ARMS v2*`,
      ].join('\n'),
      head: `${githubUser.login}:${branch}`,
      base: defaultBranch,
    }),
  });

  if (!prRes.ok) {
    const msg = await extractError(prRes);
    throw new ClientUploadError(msg || 'Failed to create Pull Request', 500);
  }
  const prData = await prRes.json();
  return { success: true, pr: { url: prData.html_url, number: prData.number }, direct: false };
}

// Main entry: uploads files from the browser directly to GitHub.
// Progress scale: 0..85 during blob creation, 85..100 during commit/finalize.
export async function uploadFilesToGitHub(opts: ClientUploadOptions): Promise<ClientUploadResult> {
  const { token, owner, repo, directCommit, files, message, onProgress } = opts;
  if (files.length === 0) return { success: false, error: 'No files to upload' };

  const totalBytes = files.reduce((s, f) => s + (f.file ? f.file.size : (f.text?.length || 0)), 0) || 1;
  const blobs: { path: string; sha: string }[] = [];
  let doneBytes = 0;

  try {
    for (const f of files) {
      const label = f.path.split('/').pop() || f.path;
      onProgress?.(5, `Preparing ${label}…`);

      let content = '';
      if (f.file) {
        content = await fileToBase64(f.file, pct => {
          onProgress?.(5 + Math.round((doneBytes / totalBytes) * 70) + Math.round(((f.file!.size / totalBytes) * 70 * pct) / 100), `Reading ${label}…`);
        });
      } else if (f.text != null) {
        content = textToBase64(f.text);
      }

      const blobRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'base64' }),
      });
      if (!blobRes.ok) {
        const msg = await extractError(blobRes);
        if (blobRes.status === 401 || blobRes.status === 403) {
          throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
        }
        throw new ClientUploadError(msg || `Failed to upload ${label}`, blobRes.status);
      }
      const sha = (await blobRes.json()).sha;
      blobs.push({ path: f.path, sha });

      doneBytes += f.file ? f.file.size : (f.text?.length || 0);
      onProgress?.(Math.min(85, 5 + Math.round((doneBytes / totalBytes) * 80)), `Uploaded ${label}…`);
    }

    onProgress?.(88, directCommit ? 'Committing to GitHub…' : 'Creating pull request…');
    const result = directCommit
      ? await directCommitToBranch({ token, owner, repo, blobs, message })
      : await forkAndPr({ token, owner, repo, blobs, message });

    onProgress?.(98, 'Done');
    return result;
  } catch (e) {
    if (e instanceof ClientUploadError) {
      return { success: false, error: e.message, status: e.status, code: e.code };
    }
    const msg = e instanceof Error ? e.message : 'Network error during upload';
    return { success: false, error: msg.includes('fetch') || msg.includes('NetworkError') ? 'Network error during upload. Check your connection and try again.' : msg, status: 0 };
  }
}
