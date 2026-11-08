// Client-side spreadsheet parsing for bulk certificate imports.
// Supports CSV/TSV/semicolon files and real .xlsx workbooks. XLSX is a zip of
// XML, so we unzip with fflate (already a dependency) and read the first sheet
// — no extra package needed.

import { unzipSync, strFromU8 } from 'fflate';

export interface CertificateSheetRow {
  memberName: string;
  universityId: string;
  department: string;
  session: string;
  post: string;
  servicePeriod: string;
  eventName: string;
  email: string;
  _row: number;
}

const FIELD_ALIASES: Record<keyof Omit<CertificateSheetRow, '_row'>, string[]> = {
  memberName: ['membername', 'name', 'fullname', 'studentname', 'recipientname', 'recipient'],
  universityId: ['universityid', 'studentid', 'id', 'uid', 'regno', 'registrationno', 'roll', 'rollno', 'studentno'],
  department: ['department', 'dept', 'faculty', 'program'],
  session: ['session', 'batch', 'year', 'admissionyear'],
  post: ['post', 'role', 'position', 'designation', 'title'],
  servicePeriod: ['serviceperiod', 'period', 'tenure', 'duration'],
  eventName: ['eventname', 'event', 'program', 'programme'],
  email: ['email', 'emailaddress', 'mail', 'gmail', 'contactemail'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fieldForHeader(header: string): keyof Omit<CertificateSheetRow, '_row'> | null {
  const h = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof Omit<CertificateSheetRow, '_row'>, string[]][]) {
    if (aliases.includes(h)) return field;
  }
  // Loose fallback for decorated headers like "Student Full Name".
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [keyof Omit<CertificateSheetRow, '_row'>, string[]][]) {
    if (aliases.some(a => a.length >= 4 && h.includes(a))) return field;
  }
  return null;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === d) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* handled with \n */ }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function colToIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i) || ['A'])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseXlsx(buffer: ArrayBuffer): string[][] {
  const files = unzipSync(new Uint8Array(buffer));
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : '');

  const shared: string[] = [];
  const sharedXml = read('xl/sharedStrings.xml');
  if (sharedXml) {
    const doc = new DOMParser().parseFromString(sharedXml, 'application/xml');
    doc.querySelectorAll('si').forEach(si => {
      const texts = Array.from(si.querySelectorAll('t')).map(t => t.textContent || '');
      shared.push(texts.join(''));
    });
  }

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbookXml = read('xl/workbook.xml');
  const relsXml = read('xl/_rels/workbook.xml.rels');
  if (workbookXml && relsXml) {
    const wb = new DOMParser().parseFromString(workbookXml, 'application/xml');
    const rels = new DOMParser().parseFromString(relsXml, 'application/xml');
    const sheet = wb.querySelector('sheet');
    const rid = sheet?.getAttribute('r:id') || sheet?.getAttribute('id');
    if (rid) {
      const rel = Array.from(rels.querySelectorAll('Relationship')).find(r => r.getAttribute('Id') === rid);
      const target = rel?.getAttribute('Target') || '';
      if (target) {
        sheetPath = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`;
      }
    }
  }

  const sheetXml = read(sheetPath) || read('xl/worksheets/sheet1.xml');
  if (!sheetXml) return [];

  const doc = new DOMParser().parseFromString(sheetXml, 'application/xml');
  const rows: string[][] = [];
  doc.querySelectorAll('row').forEach(rowEl => {
    const row: string[] = [];
    rowEl.querySelectorAll('c').forEach(cEl => {
      const idx = colToIndex(cEl.getAttribute('r') || 'A1');
      const type = cEl.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        value = Array.from(cEl.querySelectorAll('t')).map(t => t.textContent || '').join('');
      } else {
        const raw = cEl.querySelector('v')?.textContent || '';
        value = type === 's' ? (shared[parseInt(raw, 10)] ?? '') : raw;
      }
      while (row.length < idx) row.push('');
      row[idx] = value;
    });
    if (row.some(c => c.trim() !== '')) rows.push(row);
  });
  return rows;
}

export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return parseXlsx(await file.arrayBuffer());
  }
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported — save as .xlsx or CSV.');
  }
  return parseDelimited(await file.text());
}

export function mapCertificateRows(matrix: string[][]): CertificateSheetRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0];
  const mapping = headers.map(fieldForHeader);
  return matrix.slice(1).map((cells, idx) => {
    const row: CertificateSheetRow = {
      memberName: '', universityId: '', department: '', session: '', post: '',
      servicePeriod: '', eventName: '', email: '', _row: idx + 2,
    };
    mapping.forEach((field, i) => {
      if (!field) return;
      row[field] = (cells[i] || '').trim();
    });
    return row;
  }).filter(r => r.memberName || r.universityId || r.email);
}

export const CERT_CSV_TEMPLATE = `memberName,universityId,department,session,post,servicePeriod,eventName,email
Md. Abdul Karim,Q233099,CSE,2022-23,General Secretary,2024-2025,Annual Programming Contest 2025,abdul.karim@example.com
Fatima Khan,Q233100,EEE,2022-23,Member,2024-2025,Annual Programming Contest 2025,fatima.khan@example.com
`;

export function downloadCsvTemplate() {
  const blob = new Blob([CERT_CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bulk-certificates-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
