/* ─── Routine Import — parse JSON / CSV / Excel (.xlsx) / Word (.docx) ─── */

import type { RoutinePeriod, RoutineItem } from '@/components/routine/types';
import { DEFAULT_DAYS, DEFAULT_PERIODS } from '@/components/routine/types';
import { to24h } from '@/components/routine/helpers';

export interface ImportedCourse {
  code: string;
  title: string;
  teacher: string;
  room: string;
}

export interface ImportedSlot {
  day: string;
  period: number;
  course: string;
}

export interface ParsedBlock {
  semester?: string;
  branch?: string | null;
  gender?: 'male' | 'female' | 'both' | null;
  session?: string;
  days: string[];
  periods: RoutinePeriod[];
  courses: ImportedCourse[];
  slots: ImportedSlot[];
}

export interface RoutineImportData {
  source: string;
  label: string;
  blocks: ParsedBlock[];
  rowCount: number;
}

export const ROUTINE_IMPORT_ACCEPT = '.json,.csv,.xlsx,.docx';

/* ─── Column mapping ─────────────────────────────────────────────────── */

export const ROUTINE_HEADERS: { key: string; label: string; aliases: string[] }[] = [
  { key: 'semester', label: 'Semester', aliases: ['semester', 'sem'] },
  { key: 'section', label: 'Section', aliases: ['section', 'sec', 'group'] },
  { key: 'gender', label: 'Branch', aliases: ['gender', 'branch', 'branch 2'] },
  { key: 'session', label: 'Session', aliases: ['session', 'session_year'] },
  { key: 'department', label: 'Department', aliases: ['department', 'dept'] },
  { key: 'course_code', label: 'Course Code', aliases: ['course_code', 'code', 'course', 'course no'] },
  { key: 'course_title', label: 'Course Title', aliases: ['course_title', 'title', 'course_name', 'subject'] },
  { key: 'teacher', label: 'Teacher', aliases: ['teacher', 'teacher_name', 'instructor', 'faculty'] },
  { key: 'room', label: 'Room', aliases: ['room', 'room_no', 'venue'] },
  { key: 'day', label: 'Day', aliases: ['day', 'day_of_week', 'class_day'] },
  { key: 'period', label: 'Period', aliases: ['period', 'period_no', 'class_period', 'class'] },
  { key: 'start_time', label: 'Start Time', aliases: ['start_time', 'start', 'from_time', 'from'] },
  { key: 'end_time', label: 'End Time', aliases: ['end_time', 'end', 'to_time', 'to'] },
];

const DAYS_FULL = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAYS_SHORT: Record<string, string> = {
  sat: 'Saturday', sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday',
};

function normHeader(h: string): string {
  return String(h || '').toLowerCase().trim().replace(/[\s_()/-]+/g, ' ').replace(/\s+/g, ' ');
}

function resolveHeader(h: string): string | null {
  const n = normHeader(h);
  for (const col of ROUTINE_HEADERS) {
    if (normHeader(col.label) === n) return col.key;
    for (const a of col.aliases) {
      if (normHeader(a) === n) return col.key;
    }
  }
  return null;
}

function normalizeDay(raw: string): string {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (DAYS_SHORT[v]) return DAYS_SHORT[v];
  if (v.slice(0, 3) in { sat: 1, sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 }) return DAYS_SHORT[v.slice(0, 3)];
  for (const d of DAYS_FULL) if (v === d.toLowerCase()) return d;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function normalizePeriod(raw: any): number {
  const n = parseInt(String(raw || '').replace(/[^0-9]/g, ''), 10);
  if (isNaN(n) || n < 1) return 1;
  return n - 1; // 1-based in files → 0-based class period index
}

function cleanCourseCode(raw: string): string {
  return String(raw || '').toUpperCase().replace(/\s+/g, '').trim();
}

/* ─── Generic matrix → records → blocks ─────────────────────────────── */

export type FlatRecord = Record<string, string>;

export function recordsFromMatrix(matrix: string[][]): FlatRecord[] {
  const rows = matrix.filter(r => r.some(c => String(c ?? '').trim() !== ''));
  if (rows.length < 2) return [];
  const headerRow = rows[0];
  const keys: (string | null)[] = headerRow.map(h => resolveHeader(h));
  const out: FlatRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const rec: FlatRecord = {};
    rows[i].forEach((cell, ci) => {
      const key = keys[ci];
      if (key && cell !== undefined && String(cell).trim() !== '') rec[key] = String(cell).trim();
    });
    out.push(rec);
  }
  return out;
}

function defaultSemester(): string {
  const now = new Date();
  return now.getMonth() < 6 ? `1st Semester` : '2nd Semester';
}

function recordsToBlocks(records: FlatRecord[], source: string): RoutineImportData {
  const blockByKey = new Map<string, ParsedBlock>();
  const order: string[] = [];

  for (const r of records) {
    const code = cleanCourseCode(r.course_code || r.code || '');
    if (!code) continue;
    const semester = r.semester || defaultSemester();
    const key = semester;
    if (!blockByKey.has(key)) {
      order.push(key);
      blockByKey.set(key, {
        semester,
        branch: r.section || null,
        gender: (r.gender || '').toLowerCase() === 'female' || (r.gender || '').toLowerCase() === 'f'
          ? 'female' : (r.gender || '').toLowerCase() === 'male' || (r.gender || '').toLowerCase() === 'm'
            ? 'male' : r.gender ? 'both' : 'both',
        session: r.session || '',
        days: [],
        periods: [],
        courses: [],
        slots: [],
      });
    }
    const block = blockByKey.get(key)!;

    // Course (dedupe by code)
    if (!block.courses.some(c => c.code === code)) {
      block.courses.push({
        code,
        title: r.course_title || r.title || '',
        teacher: r.teacher || '',
        room: r.room || '',
      });
    }

    // Slot for day + period
    if (r.day) {
      const day = normalizeDay(r.day);
      if (day) {
        const period = normalizePeriod(r.period);
        if (!block.slots.some(s => s.day === day && s.period === period)) {
          block.slots.push({ day, period, course: code });
        }
      }
    }

    // Track session meta
    if (r.session && !block.session) block.session = r.session;
    if (r.section && !block.branch) block.branch = r.section;
  }

  const blocks: ParsedBlock[] = order.map(k => {
    const b = blockByKey.get(k)!;
    b.days = DEFAULT_DAYS.filter(d => b.slots.some(s => s.day === d)).length > 0
      ? DEFAULT_DAYS.filter(d => b.slots.some(s => s.day === d))
      : [...DEFAULT_DAYS];
    b.periods = buildPeriods(records.filter(r => r.semester === b.semester || !r.semester));
    return b;
  });

  return { source, label: source, blocks, rowCount: records.length };
}

function buildPeriods(records: FlatRecord[]): RoutinePeriod[] {
  const seen = new Map<string, { start: string; end: string }>();
  for (const r of records) {
    if (!r.start_time && !r.end_time) continue;
    const start = r.start_time || '';
    const end = r.end_time || '';
    const key = `${start}~${end}`;
    if (!seen.has(key) && (start || end)) seen.set(key, { start, end });
  }
  if (seen.size === 0) return [...DEFAULT_PERIODS];
  const entries = Array.from(seen.values()).sort((a, b) => to24h(a.start).localeCompare(to24h(b.start)));
  return entries.map((p, i) => ({
    name: `${i + 1}${['st', 'nd', 'rd'][i % 3] || 'th'} Period`,
    start: p.start || '',
    end: p.end || '',
  }));
}

/* ─── Low-level file parsers ────────────────────────────────────────── */

function parseCSV(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (ch === '\r') {
      // skip
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c ?? '').trim() !== ''));
}

function xmlDoc(bytes: Uint8Array): Document {
  const text = new TextDecoder().decode(bytes);
  return new DOMParser().parseFromString(text, 'application/xml');
}

function colIndexToZero(ref: string): number {
  const colStr = String(ref).replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of colStr) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(n - 1, 0);
}

// Minimal .xlsx reader: shared strings + first worksheet, dependency-free via fflate.
export async function parseExcel(matrixSource: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(matrixSource instanceof Uint8Array ? matrixSource : new Uint8Array(matrixSource));

  const sharedStrings: string[] = [];
  const shared = files['xl/sharedStrings.xml'];
  if (shared) {
    const doc = xmlDoc(shared);
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      const texts = Array.from(si.getElementsByTagName('t')).map(t => t.textContent || '');
      sharedStrings.push(texts.join(''));
    }
  }

  const sheetName = Object.keys(files).find(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'));
  if (!sheetName) return [];
  const doc = xmlDoc(files[sheetName]);
  const sheetData = doc.getElementsByTagName('sheetData')[0];
  if (!sheetData) return [];

  const rows: string[][] = [];
  for (const row of Array.from(sheetData.getElementsByTagName('row'))) {
    const out: string[] = [];
    let colIdx = 0;
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const ref = cell.getAttribute('r') || '';
      const target = colIndexToZero(ref);
      while (colIdx < target) { out.push(''); colIdx++; }
      const type = cell.getAttribute('t') || '';
      const v = cell.getElementsByTagName('v')[0];
      const isEl = cell.getElementsByTagName('is')[0];
      if (type === 's' && v) {
        out.push(sharedStrings[parseInt(v.textContent || '0', 10)] || '');
      } else if (isEl) {
        out.push(Array.from(isEl.getElementsByTagName('t')).map(t => t.textContent || '').join(''));
      } else if (v) {
        out.push(v.textContent || '');
      } else {
        out.push('');
      }
      colIdx++;
    }
    rows.push(out);
  }
  return rows.filter(r => r.some(c => String(c ?? '').trim() !== ''));
}

// Minimal .docx table reader via fflate + DOMParser (no dependency).
export async function parseWord(matrixSource: ArrayBuffer | Uint8Array): Promise<string[][][]> {
  const { unzipSync } = await import('fflate');
  const files = unzipSync(matrixSource instanceof Uint8Array ? matrixSource : new Uint8Array(matrixSource));
  const entry = files['word/document.xml'];
  if (!entry) return [];
  const doc = xmlDoc(entry);
  const tables: string[][][] = [];
  for (const tbl of Array.from(doc.getElementsByTagName('w:tbl'))) {
    const table: string[][] = [];
    for (const tr of Array.from(tbl.getElementsByTagName('w:tr'))) {
      const row: string[] = [];
      for (const tc of Array.from(tr.getElementsByTagName('w:tc'))) {
        const texts = Array.from(tc.getElementsByTagName('w:t')).map(t => t.textContent || '');
        row.push(texts.join('').replace(/\s+/g, ' ').trim());
      }
      table.push(row);
    }
    tables.push(table);
  }
  return tables.filter(t => t.length > 0);
}

/* ─── JSON handling ──────────────────────────────────────────────────── */

function isRoutineLike(x: any): boolean {
  return !!(x && (Array.isArray(x.courses) || Array.isArray(x.slots) || Array.isArray(x.periods)));
}

function routineItemToBlock(r: RoutineItem): ParsedBlock {
  return {
    semester: r.semester,
    branch: r.branch || null,
    gender: r.gender || null,
    session: r.session || '',
    days: (r.days || []).slice(),
    periods: (r.periods || []).slice(),
    courses: (r.courses || []).map(c => ({ code: c.code, title: c.title, teacher: c.teacher || '', room: c.room || '' })),
    slots: (r.slots || []).map(s => ({ ...s })),
  };
}

function parseJsonText(text: string, preferSemester?: string): RoutineImportData {
  const data = JSON.parse(text);

  // Array of routine objects, or a single routine object.
  if (Array.isArray(data) && data.length > 0 && isRoutineLike(data[0])) {
    return {
      source: 'JSON',
      label: 'Routine JSON',
      blocks: data.map(routineItemToBlock),
      rowCount: data.length,
    };
  }
  if (isRoutineLike(data)) {
    return { source: 'JSON', label: 'Routine JSON', blocks: [routineItemToBlock(data)], rowCount: 1 };
  }

  // Cloud teacher-mapping dump: { departments: { [dept]: { [semester]: [...courses] } } }
  if (data?.departments && typeof data.departments === 'object') {
    const blocks: ParsedBlock[] = [];
    let rowCount = 0;
    for (const dept of Object.keys(data.departments)) {
      const sems = data.departments[dept];
      if (!sems || typeof sems !== 'object') continue;
      for (const semester of Object.keys(sems)) {
        if (preferSemester && semester !== preferSemester) continue;
        const list: any[] = sems[semester] || [];
        rowCount += list.length;
        blocks.push({
          semester,
          branch: null,
          gender: 'both',
          session: '',
          days: [...DEFAULT_DAYS],
          periods: [...DEFAULT_PERIODS],
          courses: list.filter(c => c && c.code).map(c => ({
            code: cleanCourseCode(c.code),
            title: c.title || '',
            teacher: c.teacher || '',
            room: c.room || '',
          })),
          slots: [],
        });
      }
    }
    return { source: 'JSON', label: 'Cloud course list', blocks, rowCount };
  }

  // Flat record (single object or array).
  const flat: FlatRecord[] = Array.isArray(data) ? data : [data];
  return recordsToBlocks(flat.filter(r => r && typeof r === 'object'), 'JSON');
}

/* ─── Public entry ───────────────────────────────────────────────────── */

export function parseRoutineText(text: string, filename: string, preferSemester?: string): RoutineImportData {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'json') return parseJsonText(text, preferSemester);
  if (ext === 'csv') return recordsToBlocks(recordsFromMatrix(parseCSV(text)), 'CSV');
  throw new Error('Only .json and .csv files can be pasted as text');
}

export async function parseRoutineFile(file: File, preferSemester?: string): Promise<RoutineImportData> {
  const name = file.name || '';
  const ext = (name.split('.').pop() || '').toLowerCase();

  if (ext === 'json' || ext === 'csv') {
    return parseRoutineText(await file.text(), name, preferSemester);
  }
  if (ext === 'xlsx') {
    const matrix = await parseExcel(await file.arrayBuffer());
    const records = recordsFromMatrix(matrix);
    return recordsToBlocks(records.length ? records : [], 'Excel');
  }
  if (ext === 'docx') {
    const tables = await parseWord(await file.arrayBuffer());
    const matrix = tables[0] || [];
    const records = recordsFromMatrix(matrix);
    return recordsToBlocks(records, 'Word');
  }
  if (ext === 'xls') {
    throw new Error('Legacy Excel (.xls) is not supported — please save/convert the file to .xlsx or .csv and try again');
  }
  if (ext === 'doc') {
    throw new Error('Legacy Word (.doc) is not supported — please save the file as .docx or .csv and try again');
  }
  throw new Error(`Unsupported file type ".${ext}". Use JSON, CSV, Excel (.xlsx) or Word (.docx).`);
}

// Merge a multi-block import into a single routine payload (used by the
// single-routine builder). Picks blocks matching `semester` when available.
export function mergeBlocks(data: RoutineImportData, semester?: string): ParsedBlock | null {
  if (data.blocks.length === 0) return null;
  const picked = semester
    ? data.blocks.filter(b => (b.semester || '').toLowerCase() === semester.toLowerCase())
    : data.blocks;
  const list = picked.length > 0 ? picked : data.blocks;
  if (list.length === 1) return list[0];

  const merged: ParsedBlock = {
    semester: semester || undefined,
    branch: null,
    gender: 'both',
    session: '',
    days: [...DEFAULT_DAYS],
    periods: [...DEFAULT_PERIODS],
    courses: [],
    slots: [],
  };
  const seen = new Set<string>();
  for (const b of list) {
    for (const c of b.courses) {
      if (!c.code || seen.has(c.code)) continue;
      seen.add(c.code);
      merged.courses.push({ ...c });
    }
    merged.slots.push(...b.slots);
    if (b.session) merged.session = b.session;
    if (b.branch) merged.branch = b.branch;
  }
  merged.days = DEFAULT_DAYS.filter(d => merged.slots.some(s => s.day === d)).length > 0
    ? DEFAULT_DAYS.filter(d => merged.slots.some(s => s.day === d))
    : [...DEFAULT_DAYS];
  return merged;
}