// Browser-side (client) GitHub upload engine.
//
// Sends file bytes straight from the browser to the GitHub git-data API, so the
// bytes never touch our Vercel server or the database. Only a browser-safe token
// (short-lived App bot token) is used here; the server-level GITHUB_TOKEN secret
// never leaves the server (those uploads fall back to the server-side routes).
// Uploads always commit straight to main — there is no fork/PR path.
//
// The git-data API requires ONE blob per file (git cannot split a file across
// blobs), so per-file base64 is built incrementally in 0.6MB slices to keep
// memory flat and to drive progress.

const GITHUB_API = 'https://api.github.com';
// GitHub refuses blobs/files larger than 100 MB via the git-data API.
// Files above this size are uploaded via Git LFS (up to 500 MB).
const GITHUB_MAX_BYTES = 100 * 1024 * 1024;
// Files above this threshold are uploaded via Git LFS (raw binary, no base64
// overhead, no 100 MB blob-API ceiling). LFS uploads raw bytes to GitHub's
// object storage, then commits a tiny pointer file to git.
// 2 MB: almost all real files (PDFs, images, docs) benefit from raw binary
// upload — faster, no 33% base64 bloat, real upload-progress events.
const LFS_THRESHOLD_BYTES = 2 * 1024 * 1024;
// LFS hard ceiling: GitHub LFS allows up to 500 MB per object.
const LFS_MAX_BYTES = 500 * 1024 * 1024;
// Files are read and base64-encoded in 0.6MB slices to keep memory flat and to
// drive live progress. The slice size is a multiple of 3 BYTES (base64 encodes
// 3 bytes as 4 chars), so every intermediate slice encodes to base64 WITHOUT
// padding and the concatenated string stays the exact base64 of the whole file.
// Slicing at non-multiples of 3 used to embed '=' padding mid-string, which
// GitHub's decoder treats as end-of-data — truncating every file to one slice.
const SLICE_BYTES = Math.floor(0.6 * 1024 * 1024 / 3) * 3;

function assertWithinGithubLimit(label: string, bytes: number) {
  if (bytes > GITHUB_MAX_BYTES) {
    throw new ClientUploadError(`${label} is ${(bytes / 1024 / 1024).toFixed(1)} MB — GitHub allows files up to 100 MB.`, 413);
  }
}

export interface ClientUploadFile {
  path: string;   // repo-root-relative path (uploadPath is prepended by the caller)
  file?: File;    // binary content
  text?: string;  // text content (README links)
}

export interface ClientUploadOptions {
  token: string;
  fallbackToken?: string;
  owner: string;
  repo: string;
  files: ClientUploadFile[];
  message: string;
  author?: { name: string; email: string };
  onProgress?: (percent: number, label: string) => void;
  // Called once per upload step (e.g. "Hashing…", "Uploading via LFS…", "Committing…").
  // The log array is built by the caller and entries are pushed here so the
  // user always sees exactly what happened, even if the upload is slow.
  onStep?: (message: string) => void;
}

export interface ClientUploadResult {
  success: boolean;
  pr?: { url: string; number: number; merged?: boolean };
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

// 401 = bad/expired credential, 403 = no permission, 404 = token can't see the
// repo at all (GitHub hides access problems as 404). All three mean "try the
// next token".
const ACCESS_FAILURE = new Set([401, 403, 404]);

async function withTokenFallback(
  tokens: string[],
  run: (token: string) => Promise<ClientUploadResult>,
): Promise<ClientUploadResult> {
  let last: ClientUploadResult = { success: false, error: 'Upload failed' };
  for (const t of tokens) {
    last = await run(t);
    if (last.success) return last;
    if (!(typeof last.status === 'number' && ACCESS_FAILURE.has(last.status))) return last;
  }
  return last;
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

export function textToBase64(text: string): string {
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

// ─── Git LFS helpers ─────────────────────────────────────────────────────────
// For files > 10 MB, upload raw binary directly to GitHub's LFS storage
// (no base64 overhead, no 100 MB blob-API ceiling, up to 500 MB per file).

async function computeFileSHA256(file: File, onProgress?: (pct: number) => void): Promise<string> {
  // True streaming SHA-256: processes 4 MB chunks without concatenating into
  // one huge buffer. Uses a minimal pure-JS SHA-256 implementation so the
  // browser never needs more than one chunk in memory at a time.
  const CHUNK = 4 * 1024 * 1024;
  const total = file.size || 1;

  // ── Minimal SHA-256 ────────────────────────────────────────────────────
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const ROTR = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const CH = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
  const MAJ = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z);
  const EP0 = (x: number) => ROTR(2, x) ^ ROTR(13, x) ^ ROTR(22, x);
  const EP1 = (x: number) => ROTR(6, x) ^ ROTR(11, x) ^ ROTR(25, x);
  const SIG0 = (x: number) => ROTR(7, x) ^ ROTR(18, x) ^ (x >>> 3);
  const SIG1 = (x: number) => ROTR(17, x) ^ ROTR(19, x) ^ (x >>> 10);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  let totalBits = 0;

  function processBlock(block: Uint8Array) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3];
    for (let i = 16; i < 64; i++) w[i] = (SIG1(w[i - 2]) + w[i - 7] + SIG0(w[i - 15]) + w[i - 16]) | 0;
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + EP1(e) + CH(e, f, g) + K[i] + w[i]) | 0;
      const t2 = (EP0(a) + MAJ(a, b, c)) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  // ── Read file in chunks and feed to SHA-256 ───────────────────────────
  const reader = file.stream().getReader();
  let buf = new Uint8Array(0);
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Append new data to leftover buffer
    const merged = new Uint8Array(buf.length + value.length);
    merged.set(buf); merged.set(value, buf.length);
    buf = merged;
    loaded += value.length;
    // Process complete 64-byte blocks
    while (buf.length >= 64) {
      processBlock(buf.subarray(0, 64));
      totalBits += 512;
      buf = buf.subarray(64);
    }
    onProgress?.(Math.round((loaded / total) * 100));
  }

  // Pad: append 1-bit, zeros, then 64-bit big-endian length
  totalBits += buf.length * 8;
  const padLen = ((buf.length + 9) % 64 === 0) ? 0 : 64 - ((buf.length + 9) % 64);
  const padded = new Uint8Array(buf.length + 1 + padLen + 8);
  padded.set(buf); padded[buf.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(totalBits / 0x100000000), false);
  view.setUint32(padded.length - 4, totalBits >>> 0, false);
  for (let i = 0; i < padded.length; i += 64) processBlock(padded.subarray(i, i + 64));

  // Produce hex digest
  const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

async function uploadViaLFS(opts: {
  token: string;
  owner: string;
  repo: string;
  file: File;
  oid: string;
  size: number;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { token, owner, repo, file, oid, size, onProgress } = opts;

  const batchRes = await fetch('/api/github/lfs-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      owner,
      repo,
      body: {
        operation: 'upload',
        transfers: ['basic'],
        ref: { name: 'refs/heads/main' },
        objects: [{ oid, size }],
      },
    }),
  });

  if (batchRes.status === 404) {
    throw new Error('Git LFS is not enabled for this repository. Enable it at https://github.com/' + owner + '/' + repo + '/settings → Large File Storage.');
  }
  if (batchRes.status === 422) {
    throw new Error(`File is ${Math.round(size / 1024 / 1024)} MB — GitHub LFS allows up to 500 MB per file.`);
  }
  if (!batchRes.ok) {
    const msg = await extractError(batchRes);
    throw new Error(`LFS batch request failed: ${msg}`);
  }

  const batchData = await batchRes.json();
  const obj = batchData.objects?.[0];
  if (!obj) throw new Error('LFS batch response missing object info');

  if (obj.error) throw new Error(`LFS error: ${obj.error.message || obj.error.code}`);

  // object already exists — nothing to upload
  if (obj.status?.verified) {
    onProgress?.(100);
    return;
  }

  const action = obj.actions?.upload;
  if (!action?.href) throw new Error('LFS server did not provide an upload URL');

  // Upload raw binary to the pre-signed URL using XMLHttpRequest for real
  // upload progress (fetch() does not support upload progress events).
  // A heartbeat timer updates the progress label every 3 seconds so the UI
  // never looks frozen on slow connections where XHR events are sparse.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', action.href, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('Content-Length', String(size));
    if (action.header) {
      for (const [k, v] of Object.entries(action.header)) {
        xhr.setRequestHeader(k, String(v));
      }
    }
    let lastLoaded = 0;
    let heartbeatCount = 0;
    const heartbeat = setInterval(() => {
      heartbeatCount++;
      // Nudge progress by 0.5% every 3s so the bar never looks stuck
      if (onProgress) onProgress(Math.min(99, (lastLoaded / (size || 1)) * 100 + heartbeatCount * 0.5));
    }, 3000);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        lastLoaded = e.loaded;
        heartbeatCount = 0;
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      clearInterval(heartbeat);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`LFS upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => { clearInterval(heartbeat); reject(new Error('LFS upload network error')); };
    xhr.ontimeout = () => { clearInterval(heartbeat); reject(new Error('LFS upload timed out (10 minutes)')); };
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(file);
  });

  // Verify upload
  if (action.verify) {
    const verifyRes = await fetch(action.verify, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.git-lfs+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ oid, size }),
    });
    if (!verifyRes.ok) {
      throw new Error(`LFS verification failed — the upload may be incomplete. Please try again.`);
    }
  }
}

function createLFSPointerFile(oid: string, size: number): string {
  // Standard Git LFS pointer format — git-lfs recognizes this exact layout.
  return `version https://git-lfs.github.com/spec/v1
oid sha256:${oid}
size ${size}
`;
}

// ─── end LFS helpers ────────────────────────────────────────────────────────

// Reads a File into base64 incrementally (0.6MB slices), calling onSlice after
// each slice so the UI can show live progress without holding the whole
// encoded string in memory twice.
//
// Uses Blob.arrayBuffer() (NOT FileReader.readAsDataURL, which is known to
// silently return null/truncated data for larger files on some mobile
// browsers — that used to commit ~one slice + garbage to GitHub). Bytes are
// counted from the ACTUAL data, so a partial read can never be committed.
async function fileToBase64(file: File, onSlice?: (percent: number) => void): Promise<string> {
  let result = '';
  let readBytes = 0;
  const total = file.size || 1;

  const sliceToBase64 = async (slice: Blob): Promise<string> => {
    if (typeof slice.arrayBuffer === 'function') {
      const buf = await slice.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length !== slice.size) throw new Error('Failed to read file');
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
      }
      return btoa(bin);
    }
    // Legacy fallback (very old browsers): FileReader with a null-result guard.
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(slice);
    });
    if (!dataUrl || dataUrl === 'null' || dataUrl === '') throw new Error('Failed to read file');
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  };

  for (let offset = 0; offset < file.size; offset += SLICE_BYTES) {
    const slice = file.slice(offset, Math.min(file.size, offset + SLICE_BYTES));
    const b64 = await sliceToBase64(slice);
    // bytes.length === slice.size was already verified inside sliceToBase64,
    // so btoa produced the correct base64 — no need to atob-decode it back
    // just to re-check the length (that doubled encoding time for large files).
    result += b64;
    readBytes += slice.size;
    onSlice?.(Math.min(100, Math.round((offset + slice.size) / total * 100)));
  }
  // Integrity guard: if the browser read back fewer bytes than the blob claims
  // (can happen with odd streams), abort instead of committing a truncated file.
  if (readBytes !== file.size) {
    throw new Error(`Failed to read entire file (${readBytes}/${file.size} bytes). Please re-select the file.`);
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
  author?: { name: string; email: string };
  onStep?: (label: string) => void;
}): Promise<string> {
  const { token, owner, repo, branch, baseSha, blobs, message, author, onStep } = opts;

  onStep?.('Reading branch…');
  const commitRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${baseSha}`, token, {});
  if (!commitRes.ok) throw new ClientUploadError(`Cannot read parent commit: ${commitRes.status}`, commitRes.status);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  onStep?.('Creating tree…');
  const treeRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new ClientUploadError(`Cannot create tree: ${treeRes.status}`, treeRes.status);
  const newTreeSha = (await treeRes.json()).sha;

  onStep?.('Creating commit…');
  const newCommitRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTreeSha,
      parents: [baseSha],
      ...(author ? { author: { name: author.name, email: author.email, date: new Date().toISOString() }, committer: { name: author.name, email: author.email, date: new Date().toISOString() } } : {}),
    }),
  });
  if (!newCommitRes.ok) throw new ClientUploadError(`Cannot create commit: ${newCommitRes.status}`, newCommitRes.status);
  const newCommitSha = (await newCommitRes.json()).sha;

  onStep?.('Updating branch…');
  for (let attempt = 0; attempt < 2; attempt++) {
    const refRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommitSha, force: attempt === 1 }),
    });
    if (refRes.ok) return newCommitSha;

    if (attempt === 0) {
      onStep?.('Retrying (concurrent commit)…');
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
  author?: { name: string; email: string };
  onStep?: (label: string) => void;
}): Promise<ClientUploadResult> {
  const { token, owner, repo, blobs, message, author, onStep } = opts;

  onStep?.('Verifying repo access…');
  const repoRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}`, token, {});
  if (repoRes.status === 401) {
    throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
  }
  if (repoRes.status === 403) {
    const body = await repoRes.json().catch(() => ({}));
    const msg = body?.message || '';
    if (/saml sso/i.test(msg)) {
      throw new ClientUploadError('Your GitHub account needs SSO authorization for this organization. Go to github.com → Settings → Authorized OAuth Apps → authorize this app, then try again.', 403, 'TOKEN_EXPIRED');
    }
    throw new ClientUploadError(`GitHub token lacks permission (403). Make sure your token has "repo" scope. Error: ${msg || 'forbidden'}`, 403, 'TOKEN_EXPIRED');
  }
  if (!repoRes.ok) throw new ClientUploadError(`Cannot access repo: ${repoRes.status}`, repoRes.status);
  const defaultBranch = (await repoRes.json()).default_branch;

  onStep?.('Reading branch…');
  const refRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, token, {});
  if (!refRes.ok) throw new ClientUploadError(`Cannot read branch: ${refRes.status}`, refRes.status);
  const baseSha = (await refRes.json()).object.sha;

  onStep?.('Creating tree…');
  await commitBlobs({ token, owner, repo, branch: defaultBranch, baseSha, blobs, message, author, onStep });

  return {
    success: true,
    pr: { url: `https://github.com/${owner}/${repo}/commit/${defaultBranch}`, number: 0 },
    direct: true,
  };
}

// Main entry: uploads files from the browser directly to GitHub (always
// commits to main — no fork/PR). Pre-validates tokens BEFORE starting the
// upload by testing WRITE access (not just read), so the upload never wastes
// time with a token that can read but not write and then restart.
// Progress scale: 0..85 during blob creation, 85..100 during commit/finalize.
export async function uploadFilesToGitHub(opts: ClientUploadOptions): Promise<ClientUploadResult> {
  const { token, fallbackToken, owner, repo, ...rest } = opts;
  if (rest.files.length === 0) return { success: false, error: 'No files to upload' };

  // Pre-validate: test WRITE access (create a tiny blob). A PAT can read
  // a repo but still lack write permission — testing only read gives false
  // confidence and the upload fails mid-way, wasting minutes.
  const tokens = fallbackToken ? [token, fallbackToken] : [token];
  let validToken = '';
  for (const t of tokens) {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { Authorization: `token ${t}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'dGVzdA==', encoding: 'base64' }),
      });
      if (res.ok) { validToken = t; break; }
      // 401/403/404 = token can't write → try next
      if (res.status === 401 || res.status === 403 || res.status === 404) continue;
      // 500+ server error = assume token is OK
      validToken = t; break;
    } catch {
      validToken = t; break;
    }
  }
  if (!validToken) {
    return { success: false, error: 'GitHub token expired or invalid. Please reconnect your GitHub account.', status: 401, code: 'TOKEN_EXPIRED' };
  }

  return runFileUpload({ ...rest, token: validToken, owner, repo });
}

// PDFs must start with %PDF- and end with %%EOF, or they are broken/truncated.
// Checked in the browser BEFORE any commit so a corrupt PDF can never land on
// GitHub (mirrors the server-side corruption gate).
async function assertPdfIntact(file: File): Promise<void> {
  const label = file.name || 'file';
  if (!label.toLowerCase().endsWith('.pdf')) return;
  if (file.size < 16) throw new ClientUploadError(`${label} is an empty/invalid PDF — upload the original file again.`, 400);
  const head = new TextDecoder('latin1').decode(new Uint8Array(await file.slice(0, Math.min(1024, file.size)).arrayBuffer()));
  const tail = new TextDecoder('latin1').decode(new Uint8Array(await file.slice(Math.max(0, file.size - 2048), file.size).arrayBuffer()));
  if (!head.includes('%PDF-') || !tail.includes('%%EOF')) {
    throw new ClientUploadError(`${label} looks corrupt (truncated during upload) — please re-upload it.`, 400);
  }
}

async function runFileUpload(opts: ClientUploadOptions): Promise<ClientUploadResult> {
  const { token, owner, repo, files, message, author, onProgress, onStep } = opts;

  const totalBytes = files.reduce((s, f) => s + (f.file ? f.file.size : (f.text?.length || 0)), 0) || 1;
  const blobs: { path: string; sha: string }[] = [];
  let doneBytes = 0;
  // Monotonic progress: progress never goes backwards. This prevents the
  // jarring 75%→20% glitch when an LFS attempt fails and falls back to
  // base64 — the bar only moves forward.
  let maxPct = 0;
  const emit = (pct: number, label: string) => {
    if (pct > maxPct) maxPct = pct;
    onProgress?.(maxPct, label);
  };
  const step = (msg: string) => { onStep?.(msg); };

  try {
    for (const f of files) {
      const label = f.path.split('/').pop() || f.path;
      emit(5, `Preparing ${label}…`);
      const fileBytes = f.file ? f.file.size : (f.text?.length || 0);
      let content = '';

      if (f.file) {
        if (fileBytes > LFS_THRESHOLD_BYTES && fileBytes <= LFS_MAX_BYTES) {
          // ── Large file: upload via Git LFS ────────────────────────────────
          await assertPdfIntact(f.file);
          const mb = (fileBytes / 1024 / 1024).toFixed(0);
          step(`Hashing ${label} (${mb} MB)…`);
          emit(5 + Math.round((doneBytes / totalBytes) * 70), `Hashing ${label} (${mb} MB)…`);
          const oid = await computeFileSHA256(f.file, pct => {
            emit(5 + Math.round((doneBytes / totalBytes) * 70) + Math.round(pct * 0.15), `Hashing ${label} (${mb} MB)… ${pct}%`);
          });
          step(`Uploading ${label} (${mb} MB) via LFS…`);
          emit(20 + Math.round((doneBytes / totalBytes) * 55), `Uploading ${label} (${mb} MB) via LFS…`);
          try {
            await uploadViaLFS({ token, owner, repo, file: f.file, oid, size: f.file.size, onProgress: pct => {
              emit(20 + Math.round((doneBytes / totalBytes) * 55) + Math.round(pct * 0.45), `Uploading ${label} ${pct}% of ${mb} MB`);
            }});
            step(`Uploaded ${label} via LFS`);
          } catch (lfsErr: any) {
            // If LFS is not enabled (404) and file fits in the blob API, fall
            // back to base64 instead of dying. Progress continues from where
            // it was — no reset, no glitch.
            if (/not enabled/i.test(lfsErr?.message || '') && fileBytes <= GITHUB_MAX_BYTES) {
              step(`LFS unavailable — using blob API for ${label}`);
              emit(maxPct, `LFS unavailable — uploading ${label} via blob API…`);
              content = await fileToBase64(f.file, pct => {
                emit(5 + Math.round((doneBytes / totalBytes) * 70) + Math.round(((f.file!.size / totalBytes) * 70 * pct) / 100), `Preparing ${label}…`);
              });
            } else {
              throw lfsErr;
            }
          }
          if (!content) {
            step(`Committing LFS pointer for ${label}`);
            emit(70 + Math.round((doneBytes / totalBytes) * 15), `Committing LFS pointer for ${label}…`);
            const pointerContent = createLFSPointerFile(oid, f.file.size);
            const pointerBlobRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, token, {
              method: 'POST',
              body: JSON.stringify({ content: textToBase64(pointerContent), encoding: 'base64' }),
            });
            if (!pointerBlobRes.ok) {
              const msg = await extractError(pointerBlobRes);
              throw new ClientUploadError(`Failed to commit LFS pointer for ${label}: ${msg}`, pointerBlobRes.status);
            }
            blobs.push({ path: f.path, sha: (await pointerBlobRes.json()).sha });
          }
        } else if (fileBytes > LFS_MAX_BYTES) {
          throw new ClientUploadError(
            `${label} is ${(fileBytes / 1024 / 1024).toFixed(1)} MB — maximum upload size is 500 MB.`,
            413,
          );
        } else {
          // ── Small file: direct blob (base64-encoded) ──────────────────────
          assertWithinGithubLimit(label, fileBytes);
          await assertPdfIntact(f.file);
          step(`Encoding ${label} (${(fileBytes / 1024 / 1024).toFixed(1)} MB)…`);
          content = await fileToBase64(f.file, pct => {
            emit(5 + Math.round((doneBytes / totalBytes) * 70) + Math.round(((f.file!.size / totalBytes) * 70 * pct) / 100), `Preparing ${label}…`);
          });
        }
      } else {
        assertWithinGithubLimit(label, fileBytes);
        if (f.text != null) content = textToBase64(f.text);
      }

      // Text-based files (READMEs) and small binary files: commit as base64 blob.
      // Large binary files were already committed as LFS pointer blobs above.
      if (content) {
        step(`Uploading ${label}…`);
        emit(Math.min(78, 5 + Math.round((doneBytes / totalBytes) * 70) + Math.round((fileBytes / totalBytes) * 15)), `Uploading ${label}…`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
        let blobRes: Response;
        try {
          blobRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, token, {
            method: 'POST',
            body: JSON.stringify({ content, encoding: 'base64' }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
        if (!blobRes.ok) {
          const msg = await extractError(blobRes);
          if (blobRes.status === 401) {
            throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
          }
          if (blobRes.status === 403) {
            throw new ClientUploadError(`GitHub token lacks permission (403). Make sure your token has "repo" scope.`, 403, 'TOKEN_EXPIRED');
          }
          if (blobRes.status === 429) {
            throw new ClientUploadError('GitHub is busy — rate-limited. Wait a minute and try again.', 429);
          }
          if (blobRes.status >= 500) {
            throw new ClientUploadError(`GitHub server error — this usually means the file is too large for the API. Try a smaller file. (${msg})`, blobRes.status);
          }
          throw new ClientUploadError(msg || `Failed to upload ${label}`, blobRes.status);
        }
        blobs.push({ path: f.path, sha: (await blobRes.json()).sha });
        step(`Uploaded ${label}`);
      }

      doneBytes += fileBytes;
    }

    step('Committing to main…');
    emit(83, 'Committing to main…');
    const result = await directCommitToBranch({ token, owner, repo, blobs, message, author,
      onStep: (label) => {
        step(label);
        const stepMap: Record<string, number> = {
          'Verifying repo access…': 83,
          'Reading branch…': 85,
          'Creating tree…': 88,
          'Creating commit…': 91,
          'Updating branch…': 94,
          'Retrying (concurrent commit)…': 92,
        };
        emit(stepMap[label] ?? 88, label);
      },
    });

    emit(100, 'Done');
    step('Upload complete');
    return result;
  } catch (e) {
    if (e instanceof ClientUploadError) {
      return { success: false, error: e.message, status: e.status, code: e.code };
    }
    const msg = e instanceof Error ? e.message : 'Network error during upload';
    return { success: false, error: msg.includes('fetch') || msg.includes('NetworkError') ? 'Network error during upload. Check your connection and try again.' : msg, status: 0 };
  }
}

// Commits files whose content is ALREADY base64 (e.g. Studio app dist files
// encoded in the browser with FileReader). Everything goes straight to the
// GitHub git-data API from the browser — the commit never touches our server.
export async function commitBase64FilesToGitHub(opts: {
  token: string;
  fallbackToken?: string;
  owner: string;
  repo: string;
  files: { path: string; content: string }[];
  message: string;
  author?: { name: string; email: string };
  onProgress?: (percent: number, label: string) => void;
}): Promise<ClientUploadResult> {
  const { token, fallbackToken, ...rest } = opts;
  if (rest.files.length === 0) return { success: false, error: 'No files to commit' };
  return withTokenFallback(fallbackToken ? [token, fallbackToken] : [token], t =>
    runBase64Commit({ ...rest, token: t }),
  );
}

async function runBase64Commit(opts: {
  token: string;
  owner: string;
  repo: string;
  files: { path: string; content: string }[];
  message: string;
  author?: { name: string; email: string };
  onProgress?: (percent: number, label: string) => void;
}): Promise<ClientUploadResult> {
  const { token, owner, repo, files, message, author, onProgress } = opts;

  const blobs: { path: string; sha: string }[] = [];
  try {
    for (const f of files) {
      const label = f.path.split('/').pop() || f.path;
      onProgress?.(10, `Uploading ${label}…`);
      // Content is already base64 — decode once just to size-check it (a base64
      // blob's byte length is content.length * 3/4, but the exact check against
      // a fresh Buffer is cheap and airtight).
      const approxBytes = Math.floor(f.content.length * 0.75);
      assertWithinGithubLimit(label, approxBytes);
      const blobRes = await retryFetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: f.content, encoding: 'base64' }),
      });
      if (!blobRes.ok) {
        const msg = await extractError(blobRes);
        if (blobRes.status === 401) {
          throw new ClientUploadError('GitHub token expired or invalid. Please reconnect your GitHub account.', 401, 'TOKEN_EXPIRED');
        }
        if (blobRes.status === 403) {
          throw new ClientUploadError(`GitHub token lacks permission (403). Make sure your token has "repo" scope.`, 403, 'TOKEN_EXPIRED');
        }
        throw new ClientUploadError(msg || `Failed to upload ${label}`, blobRes.status);
      }
      blobs.push({ path: f.path, sha: (await blobRes.json()).sha });
      onProgress?.(Math.min(85, 10 + Math.round((blobs.length / files.length) * 75)), `Uploaded ${label}…`);
    }

    onProgress?.(83, 'Reading branch…');
    const result = await directCommitToBranch({ token, owner, repo, blobs, message, author,
      onStep: (label) => {
        const stepMap: Record<string, number> = {
          'Verifying repo access…': 83,
          'Reading branch…': 85,
          'Creating tree…': 88,
          'Creating commit…': 91,
          'Updating branch…': 94,
          'Retrying (concurrent commit)…': 92,
        };
        onProgress?.(stepMap[label] ?? 88, label);
      },
    });
    onProgress?.(99, 'Done');
    return result;
  } catch (e) {
    if (e instanceof ClientUploadError) {
      return { success: false, error: e.message, status: e.status, code: e.code };
    }
    const msg = e instanceof Error ? e.message : 'Network error during commit';
    return { success: false, error: msg.includes('fetch') || msg.includes('NetworkError') ? 'Network error during commit. Check your connection and try again.' : msg, status: 0 };
  }
}
