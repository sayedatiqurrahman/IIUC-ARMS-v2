const crypto = require('crypto');
const https = require('https');
require('dotenv/config');

const APP_ID = process.env.GITHUB_ID;
let PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY || '';
PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');

const REPO_OWNER = 'sayedatiqurrahman';
const REPO_NAME = 'QSIS-ACADEMIC-FILES-MANAFGER';
const BASE = 'upload_academic_files';

const DEPARTMENTS = ['qsis','dawah','hadith','cse','cce','eee','ete','civil','pharmacy','ba','finance','ell','all','lis','law','eb','cge'];
const SEMESTERS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
const CATEGORIES = ['sheet','NOTES','Previous Questions','Syllabus','Other'];

function createJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: APP_ID })).toString('base64url');
  const signingInput = header + '.' + payload;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(PRIVATE_KEY, 'base64url');
  return signingInput + '.' + signature;
}

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const encodedPath = path.split('/').map(p => encodeURIComponent(p)).join('/');
    const opts = { hostname: 'api.github.com', path: encodedPath, method, headers: { 'Authorization': 'Bearer ' + token, 'User-Agent': 'QSIS-ARMS', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
    if (bodyStr) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(bodyStr); }
    const req = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve({status:res.statusCode,data:JSON.parse(d||'{}')});}catch{resolve({status:res.statusCode,data:d});} }); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function createGitkeep(token, path) {
  const res = await api('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, { message: `Add ${path}`, content: '' }, token);
  return res.status === 201 || res.status === 200 ? 'ok' : res.status === 422 ? 'exists' : `err:${res.status}`;
}

async function main() {
  const jwt = createJWT();
  const inst = await api('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/installation`, null, jwt);
  const token = (await api('POST', `/app/installations/${inst.data.id}/access_tokens`, null, jwt)).data.token;
  console.log('Token obtained\n');

  let created = 0, skipped = 0, failed = 0;

  for (const dept of DEPARTMENTS) {
    for (const sem of SEMESTERS) {
      for (const cat of CATEGORIES) {
        const path = `${BASE}/${dept}/${sem}/${cat}/.gitkeep`;
        const result = await createGitkeep(token, path);
        if (result === 'ok') { created++; process.stdout.write('.'); }
        else if (result === 'exists') { skipped++; }
        else { failed++; console.log(`\nFAIL: ${path} (${result})`); }
      }
      // Also create a .gitkeep at semester level
      const semPath = `${BASE}/${dept}/${sem}/.gitkeep`;
      const semResult = await createGitkeep(token, semPath);
      if (semResult === 'ok') created++;
    }
  }

  console.log(`\n\nDone! Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);
  console.log(`Total folders: ${DEPARTMENTS.length} depts × ${SEMESTERS.length} sems × ${CATEGORIES.length} cats = ${DEPARTMENTS.length * SEMESTERS.length * CATEGORIES.length}`);
}

main().catch(e => console.error('ERROR:', e.message));
