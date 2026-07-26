import crypto from 'crypto';
import { config } from './config';

const SEMS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
const CATS = ['sheet','NOTES','Previous Questions','Syllabus','Other'];
const BATCH = 25;

function makeJwt(appId: string, privateKey: string) {
  const n = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iat: n - 60, exp: n + 600, iss: appId })).toString('base64url');
  return h + '.' + p + '.' + crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(privateKey, 'base64url');
}

async function api(method: string, urlPath: string, body: any, token: string) {
  const bodyStr = body ? JSON.stringify(body) : null;
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'User-Agent': 'IIUC-ARMS',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(bodyStr ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });
  const data = await res.json();
  return { s: res.status, d: data };
}

export async function createDepartmentFolders(deptId: string): Promise<{ success: boolean; created: number; error?: string }> {
  const appId = process.env.GITHUB_ID;
  const privateKey = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');

  if (!appId || !privateKey) {
    return { success: false, created: 0, error: 'GitHub App credentials not configured' };
  }

  try {
    const jwt = makeJwt(appId, privateKey);
    const inst = await api('GET', `/repos/${config.owner}/${config.repo}/installation`, null, jwt);
    if (inst.s !== 200) return { success: false, created: 0, error: 'Failed to get installation' };

    const tok = (await api('POST', `/app/installations/${inst.d.id}/access_tokens`, null, jwt)).d.token;

    const refRes = await api('GET', `/repos/${config.owner}/${config.repo}/git/refs/heads/main`, null, tok);
    if (refRes.s !== 200) return { success: false, created: 0, error: 'Failed to get ref' };
    let currentSha = refRes.d.object.sha;

    // Get existing tree
    const treeRes = await api('GET', `/repos/${config.owner}/${config.repo}/git/trees/${currentSha}?recursive=1`, null, tok);
    const existing = new Set(treeRes.d.tree.map((f: any) => f.path));

    // Build paths
    const paths: string[] = [];
    for (const sem of SEMS) {
      for (const cat of CATS) {
        const p = `${config.uploadPath}/${deptId}/${sem}/${cat}/.gitkeep`;
        if (!existing.has(p)) paths.push(p);
      }
    }
    const rp = `${config.uploadPath}/${deptId}/${config.relatedSourcesFolder}/.gitkeep`;
    if (!existing.has(rp)) paths.push(rp);

    if (paths.length === 0) {
      return { success: true, created: 0 };
    }

    let created = 0;
    const totalBatches = Math.ceil(paths.length / BATCH);

    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;

      const entries = batch.map(p => ({
        path: p,
        mode: '100644',
        type: 'blob',
        sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
      }));

      const treeRes2 = await api('POST', `/repos/${config.owner}/${config.repo}/git/trees`, {
        base_tree: currentSha,
        tree: entries,
      }, tok);

      if (treeRes2.s !== 201) continue;

      const commitRes = await api('POST', `/repos/${config.owner}/${config.repo}/git/commits`, {
        message: `Create folder structure for ${deptId} (batch ${batchNum}/${totalBatches})`,
        tree: treeRes2.d.sha,
        parents: [currentSha],
      }, tok);

      if (commitRes.s !== 201) continue;

      currentSha = commitRes.d.sha;
      created += batch.length;
    }

    if (created > 0) {
      await api('PATCH', `/repos/${config.owner}/${config.repo}/git/refs/heads/main`, { sha: currentSha, force: true }, tok);
    }

    return { success: true, created };
  } catch (e: any) {
    return { success: false, created: 0, error: e.message };
  }
}
