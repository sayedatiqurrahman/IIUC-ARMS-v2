// Material Symbols icon catalog.
//
// The full, up-to-date list of icon names lives in the google/material-design-icons
// repo as a "name codepoint" text file. We fetch it lazily and cache it in
// process memory so Studio can offer a searchable icon picker instead of a
// hand-maintained list.

const CODEPOINTS_URL =
  'https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL,GRAD,opsz,wght%5D.codepoints';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const FALLBACK_ICONS: string[] = [
  'apps', 'calculate', 'checklist', 'code', 'color_lens', 'compress', 'construction',
  'dashboard', 'description', 'draw', 'edit', 'extension', 'fact_check',
  'format_list_bulleted', 'gesture', 'grid_view', 'hub', 'image', 'lightbulb',
  'local_library', 'palette', 'pdf', 'quiz', 'science', 'school', 'document_scanner',
  'search', 'settings', 'spellcheck', 'sticky_note_2', 'summarize', 'table_chart',
  'translate', 'widgets', 'work', 'timer', 'qr_code', 'home', 'star', 'add_box',
];

let cache: { names: string[]; fetchedAt: number } | null = null;

/** All Material Symbols Outlined icon names (cached for 24 h, with fallback). */
export async function fetchMaterialIconNames(): Promise<string[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.names;
  try {
    const res = await fetch(CODEPOINTS_URL, { cache: 'no-store' });
    if (res.ok) {
      const text = await res.text();
      const names = text
        .split('\n')
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((n) => n && /^[a-z0-9_]{2,40}$/.test(n));
      if (names.length > 500) {
        cache = { names, fetchedAt: Date.now() };
        return names;
      }
    }
  } catch {}
  return FALLBACK_ICONS;
}
