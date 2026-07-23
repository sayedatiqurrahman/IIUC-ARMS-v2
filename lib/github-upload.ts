import { config } from '@/lib/config';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

export interface UploadFile {
  path: string;
  content: string;
}

export interface UploadResult {
  success: boolean;
  prUrl?: string;
  error?: string;
  tokenExpired?: boolean;
}

export async function uploadFilesToGitHub(
  token: string,
  files: UploadFile[],
  message: string
): Promise<UploadResult> {
  if (!token) return { success: false, error: 'GitHub not connected' };
  if (!files.length) return { success: false, error: 'No files provided' };

  // Verify token and check scopes
  const userRes = await fetch(`${GITHUB_API}/user`, { headers: ghHeaders(token) });
  if (userRes.status === 401) return { success: false, error: 'GitHub token expired. Please reconnect.' };
  if (!userRes.ok) return { success: false, error: 'Failed to verify GitHub identity' };

  const tokenScopes = userRes.headers.get('x-oauth-scopes') || '';
  if (!tokenScopes.includes('repo')) {
    return { success: false, error: 'GitHub token missing "repo" scope. Please disconnect and reconnect GitHub from your Dashboard with full repo access.', tokenExpired: true };
  }

  const githubUser = await userRes.json();
  const isOwner = githubUser.login === config.owner;

  let targetOwner = config.owner;
  let targetRepo = config.repo;

  // Fork if contributor
  if (!isOwner) {
    const forkFullName = `${githubUser.login}/${config.repo}`;
    const forkCheck = await fetch(`${GITHUB_API}/repos/${forkFullName}`, { headers: ghHeaders(token) });
    if (forkCheck.status === 404) {
      const forkRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/forks`, {
        method: 'POST',
        headers: ghHeaders(token),
        body: JSON.stringify({ default_branch_only: true }),
      });
      if (!forkRes.ok) {
        const err = await forkRes.json().catch(() => ({}));
        return { success: false, error: err.message || 'Failed to fork repository' };
      }
      await new Promise(r => setTimeout(r, 3000));
    }
    targetOwner = githubUser.login;
  }

  // Get default branch
  const repoRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, { headers: ghHeaders(token) });
  if (!repoRes.ok) return { success: false, error: 'Failed to get repo info' };
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch;

  // Get base SHA
  const baseRefRes = await fetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, { headers: ghHeaders(token) });
  if (!baseRefRes.ok) return { success: false, error: 'Failed to get base branch' };
  const baseRefData = await baseRefRes.json();
  const baseSha = baseRefData.object.sha;

  // Create branch
  const branch = `upload/${Date.now()}`;
  const createBranchRes = await fetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!createBranchRes.ok && createBranchRes.status !== 422) {
    return { success: false, error: `Failed to create branch: ${createBranchRes.status}` };
  }

  // Upload files
  for (const file of files) {
    const filePath = `${config.uploadPath}/${file.path}`;

    let fileSha: string | undefined;
    try {
      const existingRes = await fetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}?ref=${branch}`, { headers: ghHeaders(token) });
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        fileSha = existingData.sha;
      }
    } catch {}

    const putBody: any = {
      message: `Add ${file.path}`,
      content: file.content,
      branch,
    };
    if (fileSha) putBody.sha = fileSha;

    const putRes = await fetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}`, {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify(putBody),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return { success: false, error: err.message || `Failed to upload ${file.path}` };
    }
  }

  // Create PR
  const prHead = isOwner ? branch : `${githubUser.login}:${branch}`;
  const prRes = await fetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({
      title: message,
      body: [
        `## QSIS-ARMS File Upload`,
        ``,
        `**Contributor:** ${githubUser.name || githubUser.login} (@${githubUser.login})`,
        `**Email:** ${githubUser.email || 'N/A'}`,
        ``,
        `### Files`,
        files.map(f => `- \`${f.path}\``).join('\n'),
        ``,
        `---`,
        `*Submitted via QSIS-ARMS v2*`,
      ].join('\n'),
      head: prHead,
      base: defaultBranch,
    }),
  });

  if (!prRes.ok) {
    const err = await prRes.json().catch(() => ({}));
    return { success: false, error: err.message || 'Failed to create Pull Request' };
  }

  const prData = await prRes.json();
  return { success: true, prUrl: prData.html_url };
}
