/**
 * Cleanup script: Remove legacy folders from GitHub repo
 * 
 * Usage: GITHUB_TOKEN=xxx node scripts/cleanup-legacy-folders.js
 */

const GITHUB_API = 'https://api.github.com';
const OWNER = 'sayedatiqurrahman';
const REPO = 'QSIS-ACADEMIC-FILES-MANAFGER';
const BRANCH = 'main';
const UPLOAD_PATH = 'upload_academic_files';

const DEPTS = ['all','arts','ba','business','cce','cge','civil','cse','dawah','DIS','eb','eee','ell','ete','finance','hadith','SHIS','law','lis','pharmacy','qsis','science','shariah','social'];
const SEMS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
const LEGACY_FOLDERS = ['NOTES', 'Previous Questions', 'sheet', 'Syllabus', 'Other'];
const LEGACY_PATTERN = /^Previous Question/i;

function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

async function getTree(token) {
  const url = `${GITHUB_API}/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  return data.tree || [];
}

async function deleteFile(token, filePath, sha) {
  const url = `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/${filePath}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: ghHeaders(token),
    body: JSON.stringify({ message: `Cleanup: Delete ${filePath.split('/').pop()}`, sha, branch: BRANCH }),
  });
  return res.ok;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || (() => {
    try { return require('fs').readFileSync('scripts/.cleanup-token', 'utf8').trim(); } catch { return null; }
  })();
  if (!token) {
    console.error('Set GITHUB_TOKEN env var first');
    process.exit(1);
  }

  console.log('Fetching tree...');
  const tree = await getTree(token);

  const legacyFiles = tree.filter(item => {
    if (!item.path.startsWith(UPLOAD_PATH + '/')) return false;
    const rel = item.path.substring(UPLOAD_PATH.length + 1);
    const parts = rel.split('/');
    if (parts.length < 3) return false;
    const dept = parts[0];
    const sem = parts[1];
    const folder = parts[2];
    if (!DEPTS.includes(dept) || !SEMS.includes(sem)) return false;
    const isLegacy = LEGACY_FOLDERS.includes(folder) || LEGACY_PATTERN.test(folder);
    const isCourse = /^[A-Z]{2,5}\s*[-–]?\s*\d{3,4}[A-Z]?\s*[-–]\s*.*$/i.test(folder);
    return isLegacy && !isCourse && item.type === 'blob';
  });

  console.log(`Found ${legacyFiles.length} files in legacy folders:\n`);
  legacyFiles.forEach(f => console.log(`  ${f.path}`));

  if (legacyFiles.length === 0) {
    console.log('Nothing to clean up!');
    process.exit(0);
  }

  let deleted = 0, failed = 0;
  for (const file of legacyFiles) {
    const ok = await deleteFile(token, file.path, file.sha);
    if (ok) { deleted++; console.log(`  ✓ ${file.path}`); }
    else { failed++; console.log(`  ✗ ${file.path}`); }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone! Deleted: ${deleted}, Failed: ${failed}`);
}

main().catch(console.error);
