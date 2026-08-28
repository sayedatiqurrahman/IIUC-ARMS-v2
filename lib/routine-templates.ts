/* ─── Routine Templates — downloadable JSON / CSV / Excel / Word starters ─── */

import { strToU8, zipSync } from 'fflate';
import { ROUTINE_HEADERS } from './routine-import';

export type TemplateFormat = 'csv' | 'json' | 'xlsx' | 'docx';

const HEADER_LABELS = ROUTINE_HEADERS.map(h => h.label);

function sampleRows(): string[][] {
  return [
    ['1st Semester', 'A', 'Male', 'Autumn - 2026', 'CSE', 'CSE-1101', 'Introduction to Programming', 'Md. Rakib Hasan', 'Room 301', 'Saturday', '1', '10:40 AM', '11:30 AM'],
    ['1st Semester', 'A', 'Male', 'Autumn - 2026', 'CSE', 'CSE-1102', 'Discrete Mathematics', 'Prof. Jalal Uddin', 'Room 302', 'Sunday', '2', '11:30 AM', '12:20 PM'],
    ['1st Semester', 'A', 'Male', 'Autumn - 2026', 'CSE', 'CSE-1103', 'Digital Logic Design', '', 'Room 303', 'Monday', '3', '12:20 PM', '01:10 PM'],
  ];
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function buildCsvTemplate(): string {
  const rows = [HEADER_LABELS, ...sampleRows()];
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

export function buildJsonTemplate(): string {
  const sample = {
    semester: '1st Semester',
    branch: 'A',
    gender: 'male',
    session: 'Spring - 2026',
    department: 'CSE — Computer Science and Engineering',
    room: 'Room 301',
    days: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'],
    periods: [
      { name: '1st Period', start: '10:40 AM', end: '11:30 AM' },
      { name: '2nd Period', start: '11:30 AM', end: '12:20 PM' },
      { name: 'Lunch Break', start: '12:20 PM', end: '01:00 PM', isBreak: true },
    ],
    courses: [
      { code: 'CSE-1101', title: 'Introduction to Programming', teacher: 'Md. Rakib Hasan', room: 'Room 301' },
      { code: 'CSE-1102', title: 'Discrete Mathematics', teacher: 'Prof. Jalal Uddin', room: 'Room 302' },
    ],
    slots: [
      { day: 'Saturday', period: 0, course: 'CSE-1101' },
      { day: 'Sunday', period: 1, course: 'CSE-1102' },
    ],
  };
  return JSON.stringify(sample, null, 2);
}

const escXml = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const xlsxCell = (ref: string, value: string) =>
  `<c r="${ref}" t="inlineStr"><is><t>${escXml(value)}</t></is></c>`;

const xlsxColRef = (idx: number) => {
  let n = idx;
  let s = '';
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
};

export function buildXlsxTemplate(): Uint8Array {
  const rows = [HEADER_LABELS, ...sampleRows()];
  const sheetRows = rows
    .map((row, rIdx) => {
      const cells = row
        .map((cell, cIdx) => xlsxCell(`${xlsxColRef(cIdx)}${rIdx + 1}`, cell))
        .join('');
      return `<row r="${rIdx + 1}">${cells}</row>`;
    })
    .join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Routine" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };

  return zipSync(files, { level: 6 });
}

export async function buildDocxTemplate(): Promise<Blob> {
  const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, AlignmentType, ShadingType } = await import('docx');

  const headerShading = { fill: 'E7E9EB', type: ShadingType.CLEAR, color: 'auto' };
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'B1B5BA' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const makeRow = (cells: string[], isHeader = false) =>
    new TableRow({
      tableHeader: isHeader,
      children: cells.map(
        text =>
          new TableCell({
            shading: isHeader ? headerShading : undefined,
            borders,
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: text || '', bold: isHeader, size: isHeader ? 18 : 16, color: isHeader ? '2F3640' : '566573' })],
              }),
            ],
          }),
      ),
    });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [makeRow(HEADER_LABELS, true), ...sampleRows().map(r => makeRow(r))],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Class Routine Import Template', bold: true, size: 26 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Fill the table below (one row per class/period) and upload it. Leave teacher blank to fill later.', size: 16, color: '6C757D' })],
          }),
          new Paragraph({ children: [] }),
          table,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function downloadRoutineTemplate(format: TemplateFormat): Promise<{ name: string; blob: Blob }> {
  if (format === 'csv') {
    return { name: 'routine-template.csv', blob: new Blob([buildCsvTemplate()], { type: 'text/csv;charset=utf-8' }) };
  }
  if (format === 'json') {
    return { name: 'routine-template.json', blob: new Blob([buildJsonTemplate()], { type: 'application/json' }) };
  }
  if (format === 'xlsx') {
    const bytes = buildXlsxTemplate();
    const buf = new Uint8Array(bytes).buffer as ArrayBuffer;
    return { name: 'routine-template.xlsx', blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
  }
  return { name: 'routine-template.docx', blob: await buildDocxTemplate() };
}