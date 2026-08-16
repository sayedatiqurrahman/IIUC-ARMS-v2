const crypto = require('crypto');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const REPO = 'sayedatiqurrahman/IIUC-ACADEMIC-FILES-MANAFGER';
const GITHUB_API = 'https://api.github.com';

function getPrivateKey() { return (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/"/g, ''); }
function generateJWT() {
  const pk = getPrivateKey(), now = Math.floor(Date.now()/1000);
  const payload = { iat: now-60, exp: now+240, iss: process.env.GITHUB_ID };
  const h = { alg: 'RS256', typ: 'JWT' };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const si = b64(h)+'.'+b64(payload);
  const s = crypto.createSign('RSA-SHA256'); s.update(si); s.end();
  return si+'.'+s.sign(pk,'base64url');
}
function encodePath(p) { return p.split('/').map(s => encodeURIComponent(s)).join('/'); }

const DEPARTMENTS = [
  'qsis','DIS','SHIS','cse','cce','eee','ete','civil','pharmacy',
  'ba','finance','ell','all','lis','law','eb','cge'
];
const SEMESTERS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];

// Course-level subfolders inside Mid/Final
const EXAM_SUBFOLDERS = ['NOTES', 'Previous Questions'];
// Root-level categories inside each course
const ROOT_CATEGORIES = ['sheet', 'Syllabus', 'Other'];

async function createFile(token, filePath, message) {
  const url = `${GITHUB_API}/repos/${REPO}/contents/${encodePath(filePath)}`;
  const body = JSON.stringify({
    message,
    content: Buffer.from('').toString('base64'),
  });
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body,
  });
  return r.ok;
}

async function main() {
  const jwt = generateJWT();
  const r1 = await fetch(`${GITHUB_API}/app/installations`, { headers: { Authorization: `Bearer ${jwt}` } });
  const insts = await r1.json();
  const r2 = await fetch(`${GITHUB_API}/app/installations/${insts[0].id}/access_tokens`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } });
  const d2 = await r2.json();
  const token = d2.token;
  console.log('Got token');

  // Step 1: Fetch current tree to see what exists
  const r3 = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, { headers: { Authorization: `Bearer ${token}` } });
  const tree = await r3.json();
  const existingPaths = new Set((tree.tree || []).map(i => i.path));
  console.log('Current paths:', existingPaths.size);

  let created = 0;
  let skipped = 0;

  // Step 2: Create all semester folders for all departments
  for (const dept of DEPARTMENTS) {
    for (const sem of SEMESTERS) {
      const gitkeepPath = `upload_academic_files/${dept}/${sem}/.gitkeep`;
      if (!existingPaths.has(gitkeepPath)) {
        const ok = await createFile(token, gitkeepPath, `chore: create ${dept}/${sem} semester folder`);
        if (ok) { created++; process.stdout.write('.'); }
        else { process.stdout.write('X'); }
        await new Promise(r => setTimeout(r, 200));
      } else {
        skipped++;
      }
    }
  }
  console.log(`\nSemesters: created ${created}, skipped ${skipped}`);

  // Step 3: Find existing course folders and add missing subfolders
  // Re-fetch tree since we just added files
  const r4 = await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, { headers: { Authorization: `Bearer ${token}` } });
  const tree2 = await r4.json();
  const allPaths = new Set((tree2.tree || []).map(i => i.path));

  const semSet = new Set(SEMESTERS);
  const courseFolders = new Map(); // key: dept/sem/course, value: full path

  for (const p of allPaths) {
    const rel = p.replace('upload_academic_files/', '');
    const parts = rel.split('/');
    if (parts.length < 3) continue;
    const [dept, sem, third] = parts;
    if (!semSet.has(sem)) continue;
    if (/^[A-Z]{2,5}\s*[-–]?\s*\d{3,4}[A-Z]?\s*[-–]\s*.*$/i.test(third)) {
      const key = `${dept}/${sem}/${third}`;
      courseFolders.set(key, `upload_academic_files/${dept}/${sem}/${third}`);
    }
  }

  console.log(`\nFound ${courseFolders.size} existing courses, adding subfolders...`);

  let subCreated = 0;
  for (const [key, coursePath] of courseFolders) {
    // Add Mid/Final with NOTES/Previous Questions inside
    for (const exam of ['Mid', 'Final']) {
      for (const sub of EXAM_SUBFOLDERS) {
        const fp = `${coursePath}/${exam}/${sub}/.gitkeep`;
        if (!allPaths.has(fp)) {
          const ok = await createFile(token, fp, `chore: create ${exam}/${sub} in ${key.split('/').pop()}`);
          if (ok) { subCreated++; process.stdout.write('.'); }
          else { process.stdout.write('X'); }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
    // Add root categories
    for (const cat of ROOT_CATEGORIES) {
      const fp = `${coursePath}/${cat}/.gitkeep`;
      if (!allPaths.has(fp)) {
        const ok = await createFile(token, fp, `chore: create ${cat} in ${key.split('/').pop()}`);
        if (ok) { subCreated++; process.stdout.write('.'); }
        else { process.stdout.write('X'); }
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }
  console.log(`\nSubfolders created: ${subCreated}`);
  console.log('Done!');
}

main().catch(e => console.error(e));
