const crypto = require('crypto');
const https = require('https');
require('dotenv/config');

const APP_ID = process.env.GITHUB_ID;
let KEY = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');
const OWNER = 'sayedatiqurrahman';
const REPO = 'QSIS-ACADEMIC-FILES-MANAFGER';
const BASE = 'upload_academic_files';
const SEMS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];

function makeJwt() {
  const n = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iat: n - 60, exp: n + 600, iss: APP_ID })).toString('base64url');
  return h + '.' + p + '.' + crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(KEY, 'base64url');
}

function api(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: urlPath,
      method,
      headers: { 'Authorization': 'Bearer ' + token, 'User-Agent': 'QSIS', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    };
    if (bodyStr) { opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(bodyStr); }
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ s: res.statusCode, d: JSON.parse(d || '{}') }); } catch { resolve({ s: res.statusCode, d }); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  const jwt = makeJwt();
  const inst = (await api('GET', `/repos/${OWNER}/${REPO}/installation`, null, jwt)).d;
  const tok = (await api('POST', `/app/installations/${inst.id}/access_tokens`, null, jwt)).d.token;
  console.log('Token obtained\n');

  const ref = (await api('GET', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, null, tok)).d;
  let currentSha = ref.object.sha;

  // Get tree
  const tree = (await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${currentSha}?recursive=1`, null, tok)).d;
  const allFiles = tree.tree.filter(f => f.type === 'blob' && f.path.startsWith(BASE + '/'));

  // 1. Move remaining legacy files to qsis/
  const legacy = allFiles.filter(f => {
    const rel = f.path.substring(BASE.length + 1);
    const first = rel.split('/')[0];
    return SEMS.includes(first);
  });
  console.log('Remaining legacy:', legacy.length);

  for (const f of legacy) {
    const rel = f.path.substring(BASE.length + 1);
    const newPath = `${BASE}/qsis/${rel}`;
    const res = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
      base_tree: currentSha,
      tree: [
        { path: newPath, mode: '100644', type: 'blob', sha: f.sha },
        { path: f.path, mode: '100644', type: 'blob', sha: null }
      ]
    }, tok);
    if (res.s !== 201) { console.error('  tree fail:', f.path, res.s); continue; }
    const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
      message: `Move legacy: ${rel.substring(0, 50)}`,
      tree: res.d.sha, parents: [currentSha]
    }, tok);
    if (commit.s !== 201) { console.error('  commit fail:', f.path, commit.s); continue; }
    currentSha = commit.d.sha;
    console.log('  Moved:', rel.substring(0, 60));
  }

  // 2. Move related-kitabs to shariah/related-kitabs/
  const kitabs = allFiles.filter(f => f.path.startsWith(BASE + '/related-kitabs'));
  console.log('\nRelated kitabs:', kitabs.length);

  if (kitabs.length > 0) {
    const entries = [];
    for (const f of kitabs) {
      const rel = f.path.substring(BASE.length + 1);
      entries.push({ path: `${BASE}/shariah/${rel}`, mode: '100644', type: 'blob', sha: f.sha });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
    }
    const res = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: currentSha, tree: entries }, tok);
    if (res.s === 201) {
      const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
        message: 'Move related-kitabs to shariah/related-kitabs/',
        tree: res.d.sha, parents: [currentSha]
      }, tok);
      if (commit.s === 201) {
        currentSha = commit.d.sha;
        console.log('  Moved related-kitabs to shariah/');
      } else {
        console.error('  commit fail:', commit.s);
      }
    } else {
      console.error('  tree fail:', res.s);
    }
  }

  // Update branch
  const upd = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: currentSha, force: true }, tok);
  console.log(upd.s === 200 ? '\nDone!' : '\nFailed to update branch:', upd.s);
}

main().catch(e => console.error('ERROR:', e.message));
