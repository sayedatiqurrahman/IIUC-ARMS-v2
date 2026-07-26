import { config } from '@/lib/config';

const GITHUB_API = 'https://api.github.com';

function ghHeaders(token: string) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function ghFetch(url: string, token: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: ghHeaders(token) });
      if ((res.status === 403 || res.status === 429) && i < retries) {
        const wait = 2000 * (i + 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Network error after retries');
}

async function ghPost(url: string, token: string, body: any, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: ghHeaders(token), body: JSON.stringify(body) });
      if ((res.status === 403 || res.status === 429) && i < retries) {
        const wait = 2000 * (i + 1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Network error after retries');
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
  if (!token) return { success: false, error: 'GitHub not connected. Please connect GitHub first.' };
  if (!files.length) return { success: false, error: 'No files provided' };

  try {
    // Step 1: Verify token
    const userRes = await ghFetch(`${GITHUB_API}/user`, token, 1);
    if (userRes.status === 401) {
      return { success: false, error: 'GitHub token expired. Please reconnect from Dashboard.', tokenExpired: true };
    }
    if (!userRes.ok) {
      const errBody = await userRes.json().catch(() => ({}));
      return { success: false, error: `GitHub auth failed (${userRes.status}): ${errBody.message || 'Unknown error'}` };
    }

    const githubUser = await userRes.json();
    const isOwner = githubUser.login === config.owner;

    let targetOwner = config.owner;
    let targetRepo = config.repo;

    // Step 2: Fork if contributor
    if (!isOwner) {
      const forkFullName = `${githubUser.login}/${config.repo}`;
      const forkCheck = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token, 0);

      if (forkCheck.status === 404) {
        const forkRes = await ghPost(`${GITHUB_API}/repos/${config.owner}/${config.repo}/forks`, token, { default_branch_only: true });

        if (!forkRes.ok) {
          const err = await forkRes.json().catch(() => ({}));
          return { success: false, error: `Failed to fork repository: ${err.message || forkRes.status}` };
        }
        // Poll until fork is ready (up to 20s)
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const check = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token, 0);
          if (check.ok) break;
          if (i === 9) return { success: false, error: 'Fork is taking too long. Please try again in a moment.' };
        }
      } else if (!forkCheck.ok) {
        return { success: false, error: `Cannot access your fork (${forkCheck.status}). Make sure you have a fork of the repository.` };
      }
      targetOwner = githubUser.login;
    }

    // Step 3: Get default branch from the original repo
    const repoRes = await ghFetch(`${GITHUB_API}/repos/${config.owner}/${config.repo}`, token);
    if (!repoRes.ok) return { success: false, error: `Cannot access repository (${repoRes.status})` };
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch;

    // Step 4: Get base SHA from target repo
    const baseRefRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token);
    if (!baseRefRes.ok) {
      const errBody = await baseRefRes.json().catch(() => ({}));
      return { success: false, error: `Cannot read branch "${defaultBranch}" on ${targetOwner}/${targetRepo}: ${errBody.message || baseRefRes.status}` };
    }
    const baseRefData = await baseRefRes.json();
    const baseSha = baseRefData.object.sha;

    // Step 5: Create branch
    const branch = `upload/${Date.now()}`;

    const createBranchRes = await ghPost(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, token, {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });

    if (!createBranchRes.ok && createBranchRes.status !== 422) {
      const errBody = await createBranchRes.json().catch(() => ({}));

      // Check if it's a permission issue
      if (createBranchRes.status === 403) {
        return {
          success: false,
          error: `Permission denied (403). Your GitHub token may need "repo" scope. Please disconnect and reconnect GitHub from Dashboard.`,
          tokenExpired: true,
        };
      }
      return { success: false, error: `Failed to create branch: ${errBody.message || createBranchRes.status}` };
    }

    // Step 6: Upload files one by one
    let uploadedCount = 0;
    for (const file of files) {
      const filePath = `${config.uploadPath}/${file.path}`;

      let fileSha: string | undefined;
      try {
        const existingRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/contents/${filePath}?ref=${branch}`, token, 0);
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
        return { success: false, error: err.message || `Failed to upload ${file.path} (${putRes.status})` };
      }
      uploadedCount++;
    }

    // Step 7: Create PR
    const prHead = isOwner ? branch : `${githubUser.login}:${branch}`;

    const prRes = await ghPost(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls`, token, {
      title: message,
      body: [
        `## IIUC-ARMS File Upload`,
        ``,
        `**Contributor:** ${githubUser.name || githubUser.login} (@${githubUser.login})`,
        ``,
        `### Files`,
        files.map(f => `- \`${f.path}\``).join('\n'),
        ``,
        `---`,
        `*Submitted via IIUC-ARMS v2*`,
      ].join('\n'),
      head: prHead,
      base: defaultBranch,
    });

    if (!prRes.ok) {
      const err = await prRes.json().catch(() => ({}));
      return { success: false, error: err.message || `Failed to create Pull Request (${prRes.status})` };
    }

    const prData = await prRes.json();
    return { success: true, prUrl: prData.html_url };

  } catch (err: any) {
    return { success: false, error: err.message || 'Network error. Please check your connection and try again.' };
  }
}
