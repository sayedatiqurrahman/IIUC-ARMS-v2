import { config } from '../config';

export function detectCategory(name: string) {
  const l = name.toLowerCase();
  if (config.relatedKitabsCategories[l]) return l;
  if (l === 'sheet') return 'sheet';
  if (l === 'notes' || l === 'note') return 'notes';
  if (l === 'previous questions' || l.includes('previous question')) return 'questions';
  if (l === 'syllabus') return 'syllabus';
  if (l === 'related sources' || l === 'related-sources') return 'related-sources';
  return 'other';
}

const COURSE_FOLDER_RE = /^([A-Z]{2,5}\s*[-–]?\s*\d{3,5}[A-Z]?)\s*[-–]\s*(.*)$/i;

export function normalizeCourseCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/[–—]/g, '-').toUpperCase();
}

export function matchCourseFolder(name: string): { code: string; title: string } | null {
  const m = name.match(COURSE_FOLDER_RE);
  if (!m) return null;
  const code = normalizeCourseCode(m[1]);
  const title = (m[2] || '').trim() || code;
  return { code, title };
}

export function detectMidFinalFromPath(path: string): string | null {
  const l = path.toLowerCase();
  if (l.includes('/mid/') || l.includes('mid ') || l.endsWith('/mid') || l.includes('mid-term') || l.includes('midterm') || l.includes('mid question') || l.includes('মিড')) return 'Mid';
  if (l.includes('/final/') || l.includes('final ') || l.endsWith('/final') || l.includes('final-term') || l.includes('finalterm') || l.includes('final exam') || l.includes('final note') || l.includes('ফাইনাল')) return 'Final';
  return null;
}

interface ParsedFile {
  code: string;
  title: string;
  category: string;
  midFinal: string | null;
  subPath: string[];
}

export function parseCourseFilePath(rel: string): ParsedFile | null {
  const parts = rel.split('/');
  const last = parts[parts.length - 1];
  if (last === '.gitkeep' || last.toLowerCase() === 'readme.md') return null;

  const first = parts[0];

  const courseMatch = matchCourseFolder(first);
  if (!courseMatch) return null;

  let midFinal = null;
  let catIdx = 1;

  if (parts.length > 2) {
    const mf1 = detectMidFinalFromPath('/' + parts[1] + '/');
    if (mf1) { midFinal = mf1; catIdx = 2; }
  }

  const catFolder = parts[catIdx];
  if (!catFolder) return null;

  return {
    code: courseMatch.code,
    title: courseMatch.title,
    category: detectCategory(catFolder),
    midFinal,
    subPath: parts.slice(catIdx + 1),
  };
}

export function getPdfPageKey(filePath: string) {
  return 'pdf-page-' + filePath;
}
