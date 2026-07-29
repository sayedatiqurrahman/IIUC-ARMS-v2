const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const GITHUB_API = 'https://api.github.com';
const REPO = 'sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER';

function getPrivateKey() {
  const key = process.env.GITHUB_PRIVATE_KEY || '';
  return key.replace(/\\n/g, '\n').replace(/"/g, '');
}

function generateJWT() {
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 60, exp: now + 240, iss: process.env.GITHUB_ID };
  const header = { alg: 'RS256', typ: 'JWT' };
  const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  return `${signingInput}.${sign.sign(privateKey, 'base64url')}`;
}

async function getToken() {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app/installations`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  const installations = await res.json();
  const inst = installations[0];
  const res2 = await fetch(`${GITHUB_API}/app/installations/${inst.id}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github.v3+json' },
  });
  const data = await res2.json();
  return data.token;
}

async function deleteFile(token, filePath, sha, message) {
  const url = `https://api.github.com/repos/${REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, sha }),
  });
  return res.ok;
}

async function main() {
  const token = await getToken();
  console.log('Got GitHub token');

  // Fetch full tree
  const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tree = await res.json();

  const semFolders = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
  const legacyNames = ['NOTES', 'Other', 'Previous Questions', 'Previous Question (1st Semester)', 'Previous Question (2nd Semester)',
    'Previous Question (3rd Semester)', 'Previous Question (4th Semester)', 'Previous Question (5th Semester)',
    'Previous Question (6th Semester)', 'Previous Question (7th Semester)', 'Previous Question (8th Semester)',
    'Syllabus', 'sheet'];

  // Find ALL non-gitkeep blobs inside legacy folders, plus all .gitkeep blobs inside legacy folders
  const toDelete = [];
  for (const item of (tree.tree || [])) {
    if (item.type !== 'blob') continue;
    const p = item.path.replace('upload_academic_files/', '');
    const parts = p.split('/');
    if (parts.length < 3) continue;
    const dept = parts[0];
    const sem = parts[1];
    if (!semFolders.includes(sem)) continue;
    const third = parts[2] || '';
    const isCourse = /^[A-Z]{2,5}-\d{3,4}\s*-\s*.+$/i.test(third);
    if (!isCourse) {
      toDelete.push({ path: item.path, sha: item.sha, name: item.name });
    }
  }

  console.log(`Found ${toDelete.length} files to delete`);

  let deleted = 0;
  let failed = 0;
  for (const f of toDelete) {
    const ok = await deleteFile(token, f.path, f.sha, `chore: remove legacy file ${f.name}`);
    if (ok) {
      deleted++;
      process.stdout.write('.');
    } else {
      failed++;
      process.stdout.write('X');
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone! Deleted: ${deleted}, Failed: ${failed}`);
}

main().catch(e => console.error(e));
