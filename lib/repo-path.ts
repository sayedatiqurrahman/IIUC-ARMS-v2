// Guard repo paths that come from the client so a caller can never walk
// outside config.uploadPath with .. segments. GitHub's Contents API resolves
// .. segments, so a path like "upload_academic_files/../README.md" would
// otherwise reach files anywhere else in the repo.
export function validateRepoPath(path: unknown, allowEmpty: boolean): string {
  const p = String(path ?? '').trim();
  if (!p && allowEmpty) return '';
  if (!p) throw new Error('Missing path');
  if (p.length > 500) throw new Error('Path too long');
  if (p.includes('\\') || p.includes('\u0000')) throw new Error('Invalid path');
  if (p.startsWith('/')) throw new Error('Invalid path');
  const segments = p.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') throw new Error('Invalid path');
  }
  return p;
}

export function validateNewName(name: unknown): string {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('Missing name');
  if (n.length > 255) throw new Error('Name too long');
  if (/[\\/:"*?<>|\u0000-\u001F\u007F]/.test(n)) throw new Error('Invalid name');
  if (n === '.' || n === '..') throw new Error('Invalid name');
  return n;
}
