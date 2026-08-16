// Studio Apps registry.
//
// Built-in apps are defined here (they ship inside the Next.js bundle). Community
// apps live in the IIUC-ARMS-v2 repo under apps/<id>/ and are listed in
// studio-apps.json at the repo root. Nothing here needs a server rebuild — the
// registry and app files are fetched straight from GitHub at request time.

export interface StudioAppAuthor {
  name: string;
  githubLogin: string;
  email: string;
  universityId?: string;
}

export interface StudioApp {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  /** Google Material Symbols name, e.g. "compress", "palette". */
  icon: string;
  /** Optional data: URI that overrides the Material icon. */
  iconSvg?: string;
  source: 'builtin' | 'community';
  /** Built-in apps: internal Next.js route. */
  path?: string;
  /** Community apps: entry file inside apps/<id>/. */
  entry?: string;
  author?: StudioAppAuthor;
  addedAt?: string;
}

export interface StudioAppRegistry {
  version: number;
  /** Community apps only — built-ins are merged in on read. */
  apps: StudioApp[];
}

export const STUDIO_REPO = {
  owner: 'sayedatiqurrahman',
  repo: 'IIUC-ARMS-v2',
  branch: 'main',
  registryPath: 'studio-apps.json',
  appsPath: 'apps',
} as const;

/** App IDs that collide with built-ins or reserved routes. */
export const RESERVED_APP_IDS = new Set([
  'app',
  'api',
  'serve',
  'registry',
  'publish',
  'compressor',
  'scanner',
  'whiteboard',
  'creative-hub',
  'creativehub',
]);

export const APP_ID_REGEX = /^[a-z0-9][a-z0-9-]{1,29}$/;
export const MATERIAL_ICON_REGEX = /^[a-z0-9_]{2,40}$/;

export const BUILTIN_APPS: StudioApp[] = [
  {
    id: 'compressor',
    title: 'File Compressor',
    subtitle: 'Shrink images, scanned PDFs, DOCX, PPTX & EPUB and download the result.',
    description: 'Compress large files right in your browser — nothing is uploaded anywhere.',
    icon: 'compress',
    source: 'builtin',
    path: '/studio/compressor',
  },
  {
    id: 'scanner',
    title: 'Document Scanner',
    subtitle: 'Capture, crop, enhance, merge to PDF and run OCR — save straight to your device.',
    description: 'Turn your phone camera into a document scanner with edge detection and OCR.',
    icon: 'document_scanner',
    source: 'builtin',
    path: '/studio/scanner',
  },
  {
    id: 'whiteboard',
    title: 'Whiteboard',
    subtitle: 'Full drawing canvas — shapes, arrows, freehand, text & the magic laser.',
    description: 'Sketch ideas on an infinite canvas and save drafts on your device.',
    icon: 'gesture',
    source: 'builtin',
    path: '/studio/whiteboard',
  },
  {
    id: 'creative-hub',
    title: 'Creative Hub',
    subtitle: 'Design templates, thesis covers, assignment covers & community gallery.',
    description: 'Design academic covers and documents, then publish them to GitHub.',
    icon: 'palette',
    source: 'builtin',
    path: '/studio/creative-hub',
  },
];

export function mergeStudioApps(community: StudioApp[]): StudioApp[] {
  const seen = new Set<string>();
  const out: StudioApp[] = [];
  for (const app of BUILTIN_APPS) {
    seen.add(app.id);
    out.push(app);
  }
  const sorted = [...community]
    .filter((a) => !seen.has(a.id))
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  out.push(...sorted);
  return out;
}

/** True when a path is safe to serve from a community app folder. */
export function isSafeAssetPath(p: string): boolean {
  const path = String(p).replace(/\\/g, '/');
  if (!path || path.startsWith('/') || path.startsWith('./')) return false;
  if (path.includes('..')) return false;
  if (path.includes('//')) return false;
  return true;
}

export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    map: 'application/json; charset=utf-8',
    wasm: 'application/wasm',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    zip: 'application/zip',
    bin: 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

/** Community apps from the repo registry (raw GitHub first, contents API fallback). */
export async function fetchRegistryFromGitHub(): Promise<StudioApp[]> {
  const rawUrl = `https://raw.githubusercontent.com/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/${STUDIO_REPO.branch}/${STUDIO_REPO.registryPath}`;
  try {
    const rawRes = await fetch(rawUrl, { cache: 'no-store' });
    if (rawRes.ok) {
      const data = (await rawRes.json().catch(() => null)) as StudioAppRegistry | null;
      if (data && Array.isArray(data.apps)) {
        return data.apps.filter(
          (a) => a && typeof a.id === 'string' && APP_ID_REGEX.test(a.id) && a.source !== 'builtin'
        );
      }
    }
  } catch {}

  // Fresh fallback via the contents API (avoids the raw CDN cache after a publish).
  try {
    const apiUrl = `https://api.github.com/repos/${STUDIO_REPO.owner}/${STUDIO_REPO.repo}/contents/${STUDIO_REPO.registryPath}?ref=${STUDIO_REPO.branch}`;
    const apiRes = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      cache: 'no-store',
    });
    if (apiRes.ok) {
      const meta = await apiRes.json();
      const text = Buffer.from(meta.content.replace(/\n/g, ''), 'base64').toString('utf8');
      const data = JSON.parse(text) as StudioAppRegistry;
      if (Array.isArray(data.apps)) {
        return data.apps.filter(
          (a) => a && typeof a.id === 'string' && APP_ID_REGEX.test(a.id) && a.source !== 'builtin'
        );
      }
    }
  } catch {}

  return [];
}
