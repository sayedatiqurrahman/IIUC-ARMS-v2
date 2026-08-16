import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { fetchMaterialIconNames } from '@/lib/material-icons';

// GET /api/studio-apps/icons?q=…&limit=…
// Searchable Material Symbols catalog for the Studio icon picker. With no query
// the most common icon names come first; with a query only matches are returned.
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.general);
  if (!rl.success) return rl.response!;

  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const limit = Math.min(120, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 60));

  try {
    const all = await fetchMaterialIconNames();
    let icons = all;
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      icons = all.filter((n) => words.every((w) => n.includes(w)));
    } else {
      const popular = all.filter((n) => FALLBACK_ICONS.includes(n));
      const rest = all.filter((n) => !FALLBACK_ICONS.includes(n));
      icons = [...popular, ...rest];
    }
    return NextResponse.json({
      icons: icons.slice(0, limit),
      total: all.length,
    });
  } catch {
    return NextResponse.json({ icons: [], total: 0 });
  }
}

const FALLBACK_ICONS: string[] = [
  'apps', 'calculate', 'checklist', 'code', 'color_lens', 'compress', 'construction',
  'dashboard', 'description', 'draw', 'edit', 'extension', 'fact_check',
  'format_list_bulleted', 'gesture', 'grid_view', 'hub', 'image', 'lightbulb',
  'local_library', 'palette', 'pdf', 'quiz', 'science', 'school', 'document_scanner',
  'search', 'settings', 'spellcheck', 'sticky_note_2', 'summarize', 'table_chart',
  'translate', 'widgets', 'work', 'timer', 'qr_code', 'home', 'star', 'add_box',
];
