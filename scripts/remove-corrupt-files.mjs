#!/usr/bin/env node
// Removes the known-corrupt 4th-semester PDFs from the QSIS files repo in ONE
// atomic commit (tree -> commit -> ref, never touches user PATs or the DB).
//
// Before deleting each file it fetches the live blob and REFUSES to delete it
// if the PDF end marker (%%EOF) is present — i.e. the file is actually healthy
// and only the scan was wrong. Nothing else is modified.
//
// Usage:
//   node scripts/remove-corrupt-files.mjs --token=ghp_xxx
//   GH_TOKEN=ghp_xxx node scripts/remove-corrupt-files.mjs
//   GITHUB_TOKEN=ghp_xxx node scripts/remove-corrupt-files.mjs

const GITHUB_API = 'https://api.github.com';
const OWNER = 'sayedatiqurrahman';
const REPO = 'QSIS-ACADEMIC-FILES-MANAFGER';
const BRANCH = 'main';
const UPLOAD_PATH = 'upload_academic_files';

// 13 corrupt files found by a full pdf.js scan — every one truncated exactly at
// a 0.6MB upload-chunk boundary (629146 = 1 chunk, 1258291 = 2 chunks).
const TARGETS = [
  `${UPLOAD_PATH}/SHIS/4th-semister/FSC-1207 - مقارنة الاديان/sheet/0. مذكرة مقارنة الأديان 2026.pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/CSE-2402 - CSE-2402/sheet/1_Different topics of windows (Part-1).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/CSE-2402 - CSE-2402/sheet/3_Microsoft Word topics (Picture_Clip_art_Object_Drawing_Text_Box_Shapes).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/CSE-2402 - CSE-2402/sheet/4_Microsoft Word topics (Hyperlink, Macro).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/CSE-2402 - CSE-2402/sheet/5_MS PowerPoint Topics (Slide Window Detail, Hyperlinks, Audio, Video).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/CSE-2402 - CSE-2402/sheet/7_MS Excel Topics (Basic idea, Cell Formatting, Equation).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/ECE-2301 - Economics/sheet/Chapter-08 (Public Finance in Islam).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/ECE-2301 - Economics/sheet/ECE-2301(C-5).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/FSC-1207 - Comparative Religion/sheet/Comparative Religion-Update 7-21.pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/FSC-2311 - Usulul Fiqh/sheet/FSC 2311 (Mahfuz Sir.).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/FSC-2416 - FSC-2416/sheet/2416-FSC (2).pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/UREL-2303 - English Language/sheet/300 Most Important Sentence Structures by Tauhidul Islam.pdf`,
  `${UPLOAD_PATH}/qsis/4th-semister/UREL-2303 - English Language/sheet/Exercises in Reading Comprehension by E.L. Tibbitts .pdf`,
];

function tokenFromArgs() {
  const arg = process.argv.find(a => a.startsWith('--token='));
  if (arg) return arg.slice('--token='.length);
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

async function main() {
  const token = tokenFromArgs();
  if (!token) {
    console.error('No token. Pass --token=ghp_xxx or set GH_TOKEN.');
    process.exit(1);
  }
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
  const api = (path, opts = {}) => fetch(`${GITHUB_API}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });

  console.log(`Fetching ref refs/heads/${BRANCH}…`);
  const refRes = await api(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  if (!refRes.ok) throw new Error(`ref: HTTP ${refRes.status}`);
  const baseCommitSha = (await refRes.json()).object.sha;

  const commitRes = await api(`/repos/${OWNER}/${REPO}/git/commits/${baseCommitSha}`);
  if (!commitRes.ok) throw new Error(`commit: HTTP ${commitRes.status}`);
  const baseTreeSha = (await commitRes.json()).tree.sha;

  const treeRes = await api(`/repos/${OWNER}/${REPO}/git/trees/${baseTreeSha}?recursive=1`);
  if (!treeRes.ok) throw new Error(`tree: HTTP ${treeRes.status}`);
  const fullTree = (await treeRes.json()).tree || [];

  const entries = new Map(fullTree.map(i => [i.path, i]));
  const toDelete = [];

  for (const target of TARGETS) {
    const entry = entries.get(target);
    if (!entry || entry.type !== 'blob') {
      console.log(`SKIP (not found): ${target}`);
      continue;
    }
    // Refuse to delete healthy files: verify the live blob actually LACKS %%EOF.
    const blobRes = await api(`/repos/${OWNER}/${REPO}/git/blobs/${entry.sha}`);
    if (!blobRes.ok) {
      console.log(`SKIP (blob fetch failed ${blobRes.status}): ${target}`);
      continue;
    }
    const blob = await blobRes.json();
    const bytes = Buffer.from(blob.content, 'base64');
    const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString('latin1');
    if (tail.includes('%%EOF')) {
      console.log(`SKIP (healthy, has %%EOF): ${target}`);
      continue;
    }
    toDelete.push({ path: target, size: bytes.length });
    console.log(`DELETE ${bytes.length} bytes: ${target}`);
  }

  if (toDelete.length === 0) {
    console.log('\nNo verified-corrupt files to delete. Nothing changed.');
    return;
  }

  console.log(`\nDeleting ${toDelete.length} of ${TARGETS.length} target(s) in one commit…`);
  const deleteSet = new Set(toDelete.map(d => d.path));
  // Only blob (and submodule) entries go into the new tree — tree entries are
  // rebuilt by GitHub from the blob paths. Passing old subtree shas references
  // the PRE-DELETE folders and silently restores the deleted files. No
  // base_tree either (it would retain unlisted paths).
  const keepItems = fullTree
    .filter(i => i.type !== 'tree' && !deleteSet.has(i.path))
    .map(i => ({ path: i.path, mode: i.mode, type: i.type, sha: i.sha }));

  const newTreeRes = await api(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree: keepItems }),
  });
  if (!newTreeRes.ok) throw new Error(`new tree: HTTP ${newTreeRes.status} ${await newTreeRes.text()}`);
  const newTreeSha = (await newTreeRes.json()).sha;

  const newCommitRes = await api(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Remove ${toDelete.length} corrupt PDF(s) (truncated during upload)`,
      tree: newTreeSha,
      parents: [baseCommitSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error(`commit: HTTP ${newCommitRes.status} ${await newCommitRes.text()}`);
  const newCommitSha = (await newCommitRes.json()).sha;

  const refPatch = await api(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  if (!refPatch.ok) throw new Error(`ref update: HTTP ${refPatch.status} ${await refPatch.text()}`);

  console.log(`\nDone. Removed ${toDelete.length} file(s), commit ${newCommitSha.slice(0, 7)}.`);
  console.log(`Verify at: https://github.com/${OWNER}/${REPO}/commit/${newCommitSha}`);
}

main().catch(err => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
