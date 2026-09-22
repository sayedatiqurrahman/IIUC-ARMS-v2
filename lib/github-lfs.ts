// Server-side Git LFS upload + commit (server contexts like the Telegram bot).
//
// The browser engine uploads LFS objects straight from the client; this module
// exists for server-side paths where only a Buffer is available (e.g. a file
// downloaded from Telegram that is too big for GitHub's 100 MB blob-API
// ceiling). It mirrors the client's flow: LFS batch → PUT the raw bytes to the
// pre-signed storage URL → verify → commit the tiny LFS pointer file via the
// ordinary git-data commit machinery.
//
// Git LFS is only REQUIRED for files above 100 MB (the git-data blob API
// ceiling). Files at or below 100 MB should use the plain base64 blob path.
// Git LFS allows up to 2 GB per object on the Free/Pro plan (Team 4 GB,
// Enterprise Cloud 5 GB).

import crypto from 'crypto';
import { ghFetch, commitFilesToBranch } from './github-commit';

const LFS_API = (owner: string, repo: string) =>
  `https://api.github.com/repos/${owner}/${repo}.git/info/lfs/objects/batch`;

const LFS_MAX_BYTES = 2 * 1024 * 1024 * 1024;

async function extractMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.message || `GitHub error ${res.status}`;
  } catch {
    return `GitHub error ${res.status}`;
  }
}

// Run the LFS batch operation and upload the object's bytes to the pre-signed
// URL GitHub returns. Throws descriptive errors (LFS not enabled / too large).
export async function uploadLFSPointerPayload(
  token: string,
  owner: string,
  repo: string,
  oid: string,
  size: number,
  buffer: Buffer,
): Promise<void> {
  const lfsBatchBody = {
    operation: 'upload',
    transfers: ['basic'],
    ref: { name: 'refs/heads/main' },
    objects: [{ oid, size }],
  };

  // GitHub's LFS server rejects GitHub App installation tokens (ghs_) under the
  // `token` scheme — they must be sent as `Bearer` (OAuth-style). Try `token`
  // first (PATs), then retry with `Bearer` so both work.
  let batchRes = await fetch(LFS_API(owner, repo), {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.git-lfs+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(lfsBatchBody),
  });
  if (batchRes.status === 401 || batchRes.status === 403) {
    const bearerRes = await fetch(LFS_API(owner, repo), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.git-lfs+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lfsBatchBody),
    });
    if (bearerRes.status !== 401 && bearerRes.status !== 403) batchRes = bearerRes;
  }

  if (batchRes.status === 404) {
    throw new Error(
      `Git LFS is not enabled for this repository. Enable it at https://github.com/${owner}/${repo}/settings → Large File Storage, then this file can be uploaded.`,
    );
  }
  if (batchRes.status === 422) {
    throw new Error(`File is ${Math.round(size / 1024 / 1024)} MB — GitHub LFS allows up to 2 GB per file on the Free/Pro plan.`);
  }
  if (batchRes.status === 403) {
    const msg = await extractMessage(batchRes);
    throw new Error(
      `GitHub LFS storage quota reached. ${msg || 'This repository is over its LFS data quota.'} Free LFS includes 2 GB storage / 1 GB bandwidth per month. Purchase GitHub storage (Settings → Billing → Large File Storage) or trim old LFS objects to continue.`,
    );
  }
  if (!batchRes.ok) {
    throw new Error(`LFS batch request failed: ${await extractMessage(batchRes)}`);
  }

  const data = await batchRes.json();
  const obj = data?.objects?.[0];
  if (!obj) throw new Error('LFS batch response missing object info');
  if (obj.error) throw new Error(`LFS error: ${obj.error.message || obj.error.code}`);
  // Object already exists in storage — nothing to upload.
  if (obj.status?.verified) return;

  const action = obj.actions?.upload;
  if (!action?.href) throw new Error('LFS server did not provide an upload URL');

  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  if (action.header) {
    for (const [k, v] of Object.entries(action.header)) headers[k] = String(v);
  }
  const putRes = await fetch(action.href, {
    method: 'PUT',
    headers,
    body: new Uint8Array(buffer),
  });
  if (!putRes.ok) {
    throw new Error(`LFS upload failed with status ${putRes.status}`);
  }

  if (action.verify) {
    let verifyRes = await fetch(action.verify, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.git-lfs+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oid, size }),
    });
    if (!verifyRes.ok && (verifyRes.status === 401 || verifyRes.status === 403)) {
      const bearerRes = await fetch(action.verify, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.git-lfs+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ oid, size }),
      });
      if (bearerRes.ok) verifyRes = bearerRes;
    }
    if (!verifyRes.ok) {
      throw new Error('LFS verification failed — the upload may be incomplete. Please try again.');
    }
  }
}

export interface CommitLFSOptions {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  baseSha: string;
  path: string;
  buffer: Buffer;
  message: string;
  author?: { name: string; email: string };
}

// Upload a large file via Git LFS and commit the pointer file in one step.
// Returns the commit SHA on success.
export async function commitFileViaLFSToBranch(opts: CommitLFSOptions): Promise<string> {
  const { token, owner, repo, branch, baseSha, path, buffer, message, author } = opts;

  if (buffer.length > LFS_MAX_BYTES) {
    throw new Error(
      `${(buffer.length / 1024 / 1024).toFixed(1)} MB — GitHub LFS allows up to 2 GB per file on the Free/Pro plan. Split the file into parts smaller than 2 GB each.`,
    );
  }

  const oid = crypto.createHash('sha256').update(buffer).digest('hex');
  await uploadLFSPointerPayload(token, owner, repo, oid, buffer.length, buffer);

  const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${buffer.length}\n`;
  const content = Buffer.from(pointer, 'utf8').toString('base64');

  // Safety: verify repo access with this exact token before committing.
  const repoRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, token, {});
  if (!repoRes.ok) {
    throw new Error(`Cannot access repository (${repoRes.status}). Make sure the token has write access.`);
  }

  return commitFilesToBranch({
    token,
    owner,
    repo,
    branch,
    baseSha,
    files: [{ path, content }],
    message,
    author,
  });
}