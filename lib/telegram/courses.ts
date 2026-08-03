import { config } from '@/lib/config';
import { detectCategory } from './categories';

// ─── Course file search ───────────────────────────────────────────

export interface FoundFile {
  path: string;
  fileName: string;
  category: string;
  semester: string;
  department: string;
  courseFolder: string;
  courseCode: string;
}

export interface CourseInfo {
  courseCode: string;
  departments: string[];
  semesters: string[];
  categories: string[];
  totalFiles: number;
}

export function findCourseFiles(tree: any[], courseCode: string): FoundFile[] {
  const code = courseCode.toUpperCase().trim();
  const codeNoHyphen = code.replace('-', '');
  const results: FoundFile[] = [];

  for (const item of tree) {
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;

    const fileName = p.split('/').pop() || '';
    if (fileName === '.gitkeep' || fileName.toLowerCase() === 'readme.md') continue;

    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 4) continue;

    const deptId = parts[0];
    const semId = parts[1];

    // New structure: dept/sem/COURSE/Mid|Final/cat/file (course at parts[2])
    // Old structure: dept/sem/cat/COURSE/file (course at parts[3])
    const COURSE_RE = /^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)/i;
    let courseIdx = -1;
    if (parts[2] && COURSE_RE.test(parts[2])) {
      courseIdx = 2;
    } else if (parts[3] && COURSE_RE.test(parts[3])) {
      courseIdx = 3;
    }
    if (courseIdx < 0) continue;

    const courseFolder = parts[courseIdx];
    const dashIdx = courseFolder.indexOf(' - ');
    const folderCode = dashIdx > 0 ? courseFolder.substring(0, dashIdx).toUpperCase() : courseFolder.split(' ')[0].toUpperCase();
    const folderCodeNoHyphen = folderCode.replace('-', '');

    if (folderCode !== code && folderCodeNoHyphen !== codeNoHyphen) continue;

    // Skip blobs that are .gitkeep or README.md (already filtered above)
    if (item.type !== 'blob') continue;

    // Determine category from remaining parts
    let category = 'other';
    const catIdx = courseIdx + 1;
    if (catIdx < parts.length) {
      const next = parts[catIdx];
      if (next === 'Mid' || next === 'Final') {
        if (catIdx + 1 < parts.length) {
          category = detectCategory(parts[catIdx + 1]);
        }
      } else if (next !== '.gitkeep' && next.toLowerCase() !== 'readme.md') {
        category = detectCategory(next);
      }
    }

    results.push({
      path: p,
      fileName: parts.slice(courseIdx + 1).join('/') || courseFolder,
      category,
      semester: semId,
      department: deptId,
      courseFolder,
      courseCode: code,
    });
  }

  return results;
}

export function getCourseInfo(files: FoundFile[]): CourseInfo | null {
  if (files.length === 0) return null;
  const depts = Array.from(new Set(files.map(f => f.department)));
  const sems = Array.from(new Set(files.map(f => f.semester)));
  const cats = Array.from(new Set(files.map(f => f.category)));
  return {
    courseCode: files[0].courseCode,
    departments: depts,
    semesters: sems,
    categories: cats,
    totalFiles: files.length,
  };
}

// Find course folders from tree even if they have no real files
export function findCourseLocations(tree: any[], courseCode: string): { dept: string; sem: string; title: string }[] {
  const code = courseCode.toUpperCase().trim();
  const codeNoHyphen = code.replace('-', '');
  const COURSE_RE = /^([A-Z]{2,5}-\d{3,5})\s*-\s*(.+)/i;
  const results: { dept: string; sem: string; title: string }[] = [];
  const seen = new Set<string>();

  for (const item of tree) {
    const p: string = item.path;
    if (!p.startsWith(config.uploadPath + '/')) continue;
    const rel = p.substring(config.uploadPath.length + 1);
    const parts = rel.split('/');
    if (parts.length < 3) continue;

    const courseFolder = parts[2] || '';
    const m = courseFolder.match(COURSE_RE);
    if (!m) continue;

    const folderCode = m[1].toUpperCase();
    const folderCodeNoHyphen = folderCode.replace('-', '');
    if (folderCode !== code && folderCodeNoHyphen !== codeNoHyphen) continue;

    const key = `${parts[0]}/${parts[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ dept: parts[0], sem: parts[1], title: m[2].trim() });
  }

  return results;
}