const crypto = require('crypto');
const https = require('https');
require('dotenv/config');

const APP_ID = process.env.GITHUB_ID;
let KEY = (process.env.GITHUB_PRIVATE_KEY || '').replace(/\\n/g, '\n').replace(/^"/, '').replace(/"$/, '');
const OWNER = 'sayedatiqurrahman';
const REPO = 'QSIS-ACADEMIC-FILES-MANAFGER';
const BASE = 'upload_academic_files';
const BATCH = 25;

const DEPS = ['qsis','dawah','hadith','shariah','cse','cce','eee','ete','civil','pharmacy','ba','finance','ell','all','lis','law','eb','cge'];
const SEMS = ['1st-semister','2nd-semister','3rd-semister','4th-semister','5th-semister','6th-semister','7th-semister','8th-semister'];
const CATS = ['sheet','NOTES','Previous Questions','Syllabus','Other'];

function makeJwt() {
  var n = Math.floor(Date.now() / 1000);
  var h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  var p = Buffer.from(JSON.stringify({ iat: n - 60, exp: n + 600, iss: APP_ID })).toString('base64url');
  return h + '.' + p + '.' + crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(KEY, 'base64url');
}

function api(method, urlPath, body, token) {
  return new Promise(function(resolve, reject) {
    var bodyStr = body ? JSON.stringify(body) : null;
    var opts = {
      hostname: 'api.github.com',
      path: urlPath,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'QSIS',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (bodyStr) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    var req = https.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try { resolve({ s: res.statusCode, d: JSON.parse(d || '{}') }); }
        catch(e) { resolve({ s: res.statusCode, d: d }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  var jwt = makeJwt();
  var inst = (await api('GET', '/repos/' + OWNER + '/' + REPO + '/installation', null, jwt)).d;
  var tok = (await api('POST', '/app/installations/' + inst.id + '/access_tokens', null, jwt)).d.token;
  console.log('Token obtained');

  var refRes = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/main', null, tok);
  var currentSha = refRes.d.object.sha;

  var treeRes = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/trees/' + currentSha + '?recursive=1', null, tok);
  var existing = new Set(treeRes.d.tree.map(function(f) { return f.path; }));
  console.log('Existing files:', existing.size);

  var paths = [];

  for (var di = 0; di < DEPS.length; di++) {
    for (var si = 0; si < SEMS.length; si++) {
      for (var ci = 0; ci < CATS.length; ci++) {
        var p = BASE + '/' + DEPS[di] + '/' + SEMS[si] + '/' + CATS[ci] + '/.gitkeep';
        if (!existing.has(p)) paths.push(p);
      }
    }
    var rp = BASE + '/' + DEPS[di] + '/related-sources/.gitkeep';
    if (!existing.has(rp)) paths.push(rp);
  }

  console.log('Paths to create:', paths.length);

  var created = 0;
  var totalBatches = Math.ceil(paths.length / BATCH);

  for (var i = 0; i < paths.length; i += BATCH) {
    var batch = paths.slice(i, i + BATCH);
    var batchNum = Math.floor(i / BATCH) + 1;

    var entries = batch.map(function(p) {
      return { path: p, mode: '100644', type: 'blob', sha: 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391' };
    });

    var treeRes2 = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/trees', {
      base_tree: currentSha,
      tree: entries
    }, tok);

    if (treeRes2.s !== 201) {
      console.error('Batch ' + batchNum + ' tree FAIL:', treeRes2.s);
      continue;
    }

    var commitRes = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/commits', {
      message: 'Create folder structure (batch ' + batchNum + '/' + totalBatches + ')',
      tree: treeRes2.d.sha,
      parents: [currentSha]
    }, tok);

    if (commitRes.s !== 201) {
      console.error('Batch ' + batchNum + ' commit FAIL:', commitRes.s);
      continue;
    }

    currentSha = commitRes.d.sha;
    created += batch.length;
    console.log('Batch ' + batchNum + '/' + totalBatches + ' OK (' + created + '/' + paths.length + ')');
  }

  if (created > 0) {
    var upd = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/main', { sha: currentSha, force: true }, tok);
    console.log(upd.s === 200 ? 'Done! Created ' + created + ' folders' : 'Failed to update branch: ' + upd.s);
  } else {
    console.log('All folders already exist!');
  }
}

main().catch(function(e) { console.error('ERROR:', e.message); });
