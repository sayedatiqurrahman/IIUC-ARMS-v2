import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

// Serves the Creative Hub gallery from the dedicated themes repo
// (sayedatiqurrahman/IIUC-CREATIVE-HUB-THEMES):
//  - manifest.json    → the default theme list
//  - authors.json     → community design contributors + their design counts
//  - community/*      → user-published designs (folder per design)

const RAW = 'https://raw.githubusercontent.com';
const GITHUB_API = 'https://api.github.com';

function rawUrl(path: string): string {
  return `${RAW}/${config.creativeHub.owner}/${config.creativeHub.repo}/${config.creativeHub.branch}/${path}`;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function GET() {
  try {
    const ch = config.creativeHub;

    const [manifest, authors] = await Promise.all([
      fetchJson(rawUrl(ch.manifestPath)),
      fetchJson(rawUrl(ch.authorsPath)),
    ]);

    // Default theme previews in manifest.json are repo-relative paths
    // (e.g. "themes/thesis-english/preview.svg") — resolve to full raw URLs.
    if (manifest?.themes && Array.isArray(manifest.themes)) {
      manifest.themes = manifest.themes.map((t: any) => ({
        ...t,
        preview: /^https?:\/\//.test(t.preview || '')
          ? t.preview
          : rawUrl(t.preview.startsWith(`${ch.themesPath}/`) ? t.preview : `${ch.themesPath}/${t.id}/${t.preview}`),
      }));
    }

    // List every file in the themes repo once (recursive tree).
    let communityFolders: string[] = [];
    try {
      const tree = await fetchJson(`${GITHUB_API}/repos/${ch.owner}/${ch.repo}/git/trees/${ch.branch}?recursive=1`);
      if (tree?.tree) {
        const paths: string[] = tree.tree
          .filter((e: any) => e.type === 'blob')
          .map((e: any) => e.path);
        const designJsonPaths = paths.filter((p) => p.startsWith(`${ch.communityPath}/`) && p.endsWith('/design.json'));
        communityFolders = designJsonPaths.map((p) => {
          const parts = p.split('/');
          parts.pop(); // remove design.json
          return parts.join('/');
        });
      }
    } catch {
      // tree listing failed — degrade to empty community
    }

    // Build community design cards (fetch each design.json for metadata,
    // capped so a maliciously large community can't hammer the API).
    const community = [];
    const folders = communityFolders.slice(0, 40);
    if (folders.length > 0) {
      const metas = await Promise.all(
        folders.map((folder) => fetchJson(rawUrl(`${folder}/design.json`)))
      );
      metas.forEach((meta, i) => {
        const folder = folders[i];
        const name = meta?.name || folder.split('/').pop() || 'Community Design';
        const preview = rawUrl(`${folder}/thumbnail.webp`);
        community.push({
          id: folder,
          folder,
          name,
          subtitle: meta?.subtitle || '',
          description: meta?.description || '',
          language: meta?.language || '',
          categories: meta?.categories || [],
          preview,
          html: rawUrl(`${folder}/design.html`),
          pageSize: meta?.pageSize || ch.defaultPageSize,
          author: meta?.author || '',
          designSn: meta?.designSn || '',
          publishedAt: meta?.publishedAt || '',
        });
      });
    }

    // authors.json is stored as { version, authors: [...] } — always expose a
    // plain array to the client so it can call .find/.map/.sort on it safely.
    const authorsList = Array.isArray(authors) ? authors : Array.isArray(authors?.authors) ? authors.authors : [];

    return NextResponse.json({
      manifest,
      authors: authorsList,
      community,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load creative hub' }, { status: 500 });
  }
}
