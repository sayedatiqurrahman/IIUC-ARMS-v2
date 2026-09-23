// Client-side text extraction for local verification. Files are read ONLY in
// the browser — nothing is uploaded. Supports .txt/.md, .docx (parsed from the
// word/document.xml part) and text-based .pdf (content-stream operator parsing,
// FlateDecode inflated). Scanned/image PDFs cannot be read without OCR.

import { inflateSync, unzipSync } from 'fflate';

export type FileKind = 'text' | 'docx' | 'pdf' | 'other';

let READER_ID = 0;

export function detectFileKind(name: string): FileKind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'text' || ext === 'csv') return 'text';
  if (ext === 'docx') return 'docx';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

export interface ExtractResult {
  fileName: string;
  kind: FileKind;
  text: string;
  paragraphs: number;
  words: number;
  chars: number;
}

function countWords(text: string): number {
  return text.split(/[\s.,;:!؟؟\u060C\u061B]+/).filter(Boolean).length;
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const kind = detectFileKind(file.name);
  let text = '';

  if (kind === 'text') {
    text = await file.text();
  } else if (kind === 'docx') {
    text = await extractDocx(file);
  } else if (kind === 'pdf') {
    text = await extractPdfText(file);
  } else {
    throw new Error(`Unsupported file type “${file.name}”. Please upload .txt, .docx or a text-based .pdf.`);
  }

  text = text.replace(/\r\n/g, '\n').trim();
  if (!text) {
    throw new Error(`No readable text found in “${file.name}”. It may be a scanned/ image-only file — export it as digital text first.`);
  }

  return {
    fileName: file.name,
    kind,
    text,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length || 1,
    words: countWords(text),
    chars: text.length,
  };
}

async function extractDocx(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const zip = unzipSync(buf, { filter: (f) => f.name === 'word/document.xml' });
  const entry = zip['word/document.xml'];
  if (!entry) throw new Error('Invalid .docx — missing word/document.xml.');
  const xml = new TextDecoder().decode(entry);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (!doc) throw new Error('Could not parse .docx XML.');
  const paras = Array.from(doc.getElementsByTagNameNS('*', 'p'));
  return paras
    .map((p) => {
      const runs = Array.from(p.getElementsByTagNameNS('*', 't'));
      return runs.map((t) => t.textContent || '').join('');
    })
    .join('\n');
}

async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoder = new TextDecoder('latin1');
  let bufStr = decoder.decode(bytes);
  const out: string[] = [];

  // Extract object streams (rough but robust for digital PDFs).
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(bufStr)) !== null) {
    const dict = bufStr.slice(Math.max(0, (m.index as number) - 600), m.index as number);
    const data = new Uint8Array(m[1].length);
    for (let i = 0; i < m[1].length; i++) data[i] = m[1].charCodeAt(i) & 0xff;
    let bytes2: Uint8Array | null = null;
    try {
      bytes2 = /\/FlateDecode/.test(dict) ? inflateSync(data) : data;
    } catch {
      bytes2 = data;
    }
    if (!bytes2) continue;
    // Decode content-stream text operators: (...) Tj  |  [...] TJ  |  <hex> Tj
    const cs = new TextDecoder('latin1').decode(bytes2);
    let txt = '';
    const tj = /(?:\((?:[^()\\]|\\.)*\)|\[[^\]]*\]|<[0-9a-fA-F\s]+>)\s*Tj|\bTj\b|\bTJ\b/g;
    let chunk = '';
    let lastIdx = 0;
    const ops = cs.match(tj) || [];
    for (const op of ops) {
      const si = cs.indexOf(op, lastIdx);
      lastIdx = Math.max(lastIdx, si + op.length);
      if (/\bTd\b|\bTD\b|\bT\*/.test(cs.slice(Math.max(0, si - 40), si))) {
        if (chunk) txt += '\n';
        chunk = '';
      }
      const inner = op.trim();
      if (inner.startsWith('(')) {
        chunk += decodePdfString(inner);
      } else if (inner.startsWith('<') && inner.endsWith('>')) {
        chunk += decodePdfHex(inner);
      } else if (inner.startsWith('[')) {
        const parts = inner.match(/\([^)]*\)|<[0-9a-fA-F\s]+>/g) || [];
        for (const p of parts) chunk += p.startsWith('(') ? decodePdfString(p) : decodePdfHex(p);
      }
      if (/\bTJ\b/.test(inner)) { if (chunk) txt += ' '; }
      else if (chunk) txt += ' ';
    }
    if (txt.trim()) out.push(txt.replace(/\s{2,}/g, ' '));
  }

  const joined = out.join('\n').trim();
  if (!joined || joined.length < 4) {
    throw new Error('No readable text found in this PDF. It looks like a scanned/image-only document.');
  }
  return joined;
}

function decodePdfString(s: string): string {
  let out = '';
  for (let i = 1; i < s.length - 1; i++) {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1];
      if (n === 'n') out += '\n';
      else if (n === 'r') out += '\r';
      else if (n === 't') out += '\t';
      else if (n === '(') out += '(';
      else if (n === ')') out += ')';
      else if (n === '\\') out += '\\';
      else if (n >= '0' && n <= '7') {
        let oct = n;
        for (let k = 1; k <= 2 && s[i + 1 + k] >= '0' && s[i + 1 + k] <= '7'; k++) oct += s[i + 1 + k];
        out += String.fromCharCode(parseInt(oct, 8));
        i += oct.length - 1;
      } else out += n;
      i++;
    } else out += c;
  }
  return out;
}

function decodePdfHex(s: string): string {
  let hex = s.replace(/[<>]/g, '').replace(/\s/g, '');
  if (hex.length % 2) hex += '0';
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

export function makeReaderId(): number {
  READER_ID += 1;
  return READER_ID;
}