import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';

// ─── Category detection ───────────────────────────────────────────

export function detectCategory(name: string): string {
  const l = name.toLowerCase();
  if (l === 'sheet') return 'sheet';
  if (l === 'notes' || l === 'note') return 'notes';
  if (l === 'previous questions' || l.includes('previous question')) return 'questions';
  if (l === 'syllabus') return 'syllabus';
  return 'other';
}

// Detect README.md (shared links) for a course in the tree
export function hasSharedLinks(tree: any[], deptId: string, semId: string, courseFolder: string): boolean {
  const prefix = `${config.uploadPath}/${deptId}/${semId}/${courseFolder}/`;
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith(prefix)) continue;
    const fileName = item.path.split('/').pop();
    if (fileName?.toLowerCase() === 'readme.md') return true;
  }
  return false;
}

// Count README.md files under a course folder (shared links indicator)
export function countSharedLinks(tree: any[], deptId: string, semId: string, courseFolder: string): number {
  const prefix = `${config.uploadPath}/${deptId}/${semId}/${courseFolder}/`;
  let count = 0;
  for (const item of tree) {
    if (item.type !== 'blob') continue;
    if (!item.path.startsWith(prefix)) continue;
    const fileName = item.path.split('/').pop();
    if (fileName?.toLowerCase() === 'readme.md') count++;
  }
  return count;
}

export const CATEGORY_META: Record<string, { label: string; icon: string; folder: string }> = {
  sheet:     { label: 'Sheets',             icon: '📊', folder: 'sheet' },
  notes:     { label: 'Notes',              icon: '📝', folder: 'NOTES' },
  questions: { label: 'Previous Questions', icon: '📋', folder: 'Previous Questions' },
  syllabus:  { label: 'Syllabus',           icon: '📘', folder: 'Syllabus' },
  other:     { label: 'Other',              icon: '📁', folder: 'Other' },
};

// ─── Department name lookup ───────────────────────────────────────

export function getDeptName(deptId: string): string {
  for (const f of FACULTIES) {
    const d = f.departments.find(dd => dd.id === deptId);
    if (d) return d.shortName;
  }
  return deptId.toUpperCase();
}

export function getDeptFullName(deptId: string): string {
  for (const f of FACULTIES) {
    const d = f.departments.find(dd => dd.id === deptId);
    if (d) return d.name;
  }
  return deptId;
}