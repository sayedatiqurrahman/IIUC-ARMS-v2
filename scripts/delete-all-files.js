#!/usr/bin/env node
/**
 * Delete ALL files under upload_academic_files/ from GitHub.
 * Keeps folder structure with .gitkeep files only.
 */

require('dotenv').config();
const crypto = require('crypto');

const REPO_OWNER = 'sayedatiqurrahman';
const REPO_NAME = 'IIUC-ACADEMIC-FILES-MANAFGER';
const BRANCH = 'main';
const GITHUB_API = 'https://api.github.com';

function generateJWT() {
  const privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '');
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 60, exp: now + 240, iss: process.env.GITHUB_ID };
  const header = { alg: 'RS256', typ: 'JWT' };
  const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKey, 'base64url');
  return `${signingInput}.${signature}`;
}

async function getToken() {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app/installations`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IIUC-ARMS-Cleanup' },
  });
  const installations = await res.json();
  const tokenRes = await fetch(`${GITHUB_API}/app/installations/${installations[0].id}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IIUC-ARMS-Cleanup' },
  });
  const tokenData = await tokenRes.json();
  return tokenData.token;
}

async function getFullTree(token) {
  const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${BRANCH}?recursive=1`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  const data = await res.json();
  return data.tree || [];
}

async function getFileSha(token, path) {
  const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha || null;
}

async function deleteFile(token, path, message, sha) {
  const res = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`, {
    method: 'DELETE',
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: BRANCH }),
  });
  return res.ok;
}

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');

  console.log('Getting token...');
  const token = await getToken();

  console.log('Fetching tree...');
  const tree = await getFullTree(token);

  const prefix = 'upload_academic_files/';
  const allFiles = tree.filter(f => f.path.startsWith(prefix) && f.type === 'blob');

  // Keep only .gitkeep files, delete everything else
  const filesToDelete = allFiles.filter(f => !f.path.endsWith('.gitkeep'));

  console.log(`\nTotal files: ${allFiles.length}`);
  console.log(`Files to delete: ${filesToDelete.length}`);
  console.log(`Files to keep (.gitkeep): ${allFiles.length - filesToDelete.length}`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN (no files will be deleted) ---');
    for (const f of filesToDelete.slice(0, 30)) {
      console.log(`  would delete: ${f.path}`);
    }
    if (filesToDelete.length > 30) console.log(`  ... and ${filesToDelete.length - 30} more`);
    return;
  }

  // Sort deepest first for safe deletion
  const sorted = filesToDelete.sort((a, b) => b.path.localeCompare(a.path));

  let deleted = 0;
  let failed = 0;

  for (const f of sorted) {
    const sha = await getFileSha(token, f.path);
    if (!sha) {
      console.log(`  SKIP (no sha): ${f.path}`);
      failed++;
      continue;
    }
    const name = f.path.split('/').pop();
    const ok = await deleteFile(token, f.path, `Remove file: ${name}`, sha);
    if (ok) {
      deleted++;
      if (deleted % 10 === 0) console.log(`  Deleted ${deleted}/${filesToDelete.length}...`);
    } else {
      console.log(`  FAILED: ${f.path}`);
      failed++;
    }
  }

  console.log(`\nDone! Deleted ${deleted} files, ${failed} failed.`);
}

main().catch(console.error);
