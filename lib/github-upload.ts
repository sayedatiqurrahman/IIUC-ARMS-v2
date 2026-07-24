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
        console.log(`[GitHub] ${res.status} on ${url}, retrying in ${wait}ms...`);
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
        console.log(`[GitHub] ${res.status} on POST ${url}, retrying in ${wait}ms...`);
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
    console.log(`[GitHub Upload] User: ${githubUser.login}, isOwner: ${isOwner}`);

    let targetOwner = config.owner;
    let targetRepo = config.repo;

    // Step 2: Fork if contributor
    if (!isOwner) {
      const forkFullName = `${githubUser.login}/${config.repo}`;
      const forkCheck = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token, 0);

      if (forkCheck.status === 404) {
        console.log(`[GitHub Upload] Forking repo for ${githubUser.login}...`);
        const forkRes = await ghPost(`${GITHUB_API}/repos/${config.owner}/${config.repo}/forks`, token, { default_branch_only: true });

        if (!forkRes.ok) {
          const err = await forkRes.json().catch(() => ({}));
          return { success: false, error: `Failed to fork repository: ${err.message || forkRes.status}` };
        }
        // Poll until fork is ready (up to 20s)
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const check = await ghFetch(`${GITHUB_API}/repos/${forkFullName}`, token, 0);
          if (check.ok) {
            console.log(`[GitHub Upload] Fork ready after ${(i + 1) * 2}s`);
            break;
          }
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
    console.log(`[GitHub Upload] Default branch: ${defaultBranch}`);

    // Step 4: Get base SHA from target repo
    const baseRefRes = await ghFetch(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs/heads/${defaultBranch}`, token);
    if (!baseRefRes.ok) {
      const errBody = await baseRefRes.json().catch(() => ({}));
      return { success: false, error: `Cannot read branch "${defaultBranch}" on ${targetOwner}/${targetRepo}: ${errBody.message || baseRefRes.status}` };
    }
    const baseRefData = await baseRefRes.json();
    const baseSha = baseRefData.object.sha;
    console.log(`[GitHub Upload] Base SHA: ${baseSha.substring(0, 7)}`);

    // Step 5: Create branch
    const branch = `upload/${Date.now()}`;
    console.log(`[GitHub Upload] Creating branch: ${branch}`);

    const createBranchRes = await ghPost(`${GITHUB_API}/repos/${targetOwner}/${targetRepo}/git/refs`, token, {
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });

    if (!createBranchRes.ok && createBranchRes.status !== 422) {
      const errBody = await createBranchRes.json().catch(() => ({}));
      console.error(`[GitHub Upload] Branch creation failed:`, errBody);

      // Check if it's a permission issue
      if (createBranchRes.status === 403) {
        return {
          success: false,
          error: `Permission denied (403). Your GitHub token may need "repo" scope. Please disconnect and reconnect GitHub from Dashboard. Error: ${errBody.message || 'Forbidden'}`,
          tokenExpired: true,
        };
      }
      return { success: false, error: `Failed to create branch: ${errBody.message || createBranchRes.status}` };
    }
    console.log(`[GitHub Upload] Branch created successfully`);

    // Step 6: Upload files one by one
    let uploadedCount = 0;
    for (const file of files) {
      const filePath = `${config.uploadPath}/${file.path}`;
      console.log(`[GitHub Upload] Uploading: ${filePath}`);

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
        console.error(`[GitHub Upload] File upload failed:`, err);
        return { success: false, error: err.message || `Failed to upload ${file.path} (${putRes.status})` };
      }
      uploadedCount++;
      console.log(`[GitHub Upload] Uploaded ${uploadedCount}/${files.length}: ${filePath}`);
    }

    // Step 7: Create PR
    const prHead = isOwner ? branch : `${githubUser.login}:${branch}`;
    console.log(`[GitHub Upload] Creating PR: ${prHead} -> ${defaultBranch}`);

    const prRes = await ghPost(`${GITHUB_API}/repos/${config.owner}/${config.repo}/pulls`, token, {
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
    });

    if (!prRes.ok) {
      const err = await prRes.json().catch(() => ({}));
      console.error(`[GitHub Upload] PR creation failed:`, err);
      return { success: false, error: err.message || `Failed to create Pull Request (${prRes.status})` };
    }

    const prData = await prRes.json();
    console.log(`[GitHub Upload] PR created: ${prData.html_url}`);
    return { success: true, prUrl: prData.html_url };

  } catch (err: any) {
    console.error('[GitHub Upload] Error:', err);
    return { success: false, error: err.message || 'Network error. Please check your connection and try again.' };
  }
}
