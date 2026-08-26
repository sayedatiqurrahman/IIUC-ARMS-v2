'use client';

import { useState, useRef, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import RoleCombobox from './RoleCombobox';

type Format = 'json' | 'csv' | 'xml';

interface ParsedMember {
  email?: string;
  name?: string;
  role?: string;
  department?: string;
  session?: string;
  whatsapp?: string;
  _row?: number;
  _error?: string;
}

const FORMAT_INFO: Record<Format, { label: string; icon: string; ext: string; mime: string }> = {
  json: { label: 'JSON', icon: 'fas fa-code', ext: '.json', mime: 'application/json' },
  csv: { label: 'CSV / Excel', icon: 'fas fa-file-csv', ext: '.csv,.txt,.tsv', mime: 'text/csv,text/plain' },
  xml: { label: 'XML', icon: 'fas fa-file-code', ext: '.xml', mime: 'application/xml,text/xml' },
};

const TEMPLATES: Record<Format, string> = {
  json: `[
  {
    "email": "ahmed@ugrad.iiuc.ac.bd",
    "name": "Ahmed Hassan",
    "role": "president",
    "department": "CSE",
    "session": "2021",
    "whatsapp": "+8801712345678"
  },
  {
    "name": "Fatima Khan",
    "role": "member",
    "department": "EEE",
    "session": "2022"
  }
]`,
  csv: `email,name,role,department,session,whatsapp
ahmed@ugrad.iiuc.ac.bd,Ahmed Hassan,president,CSE,2021,+8801712345678
fatima@ugrad.iiuc.ac.bd,Fatima Khan,member,EEE,2022,+8801987654321
,,member,BBS,2023,+8801555123456`,
  xml: `<?xml version="1.0" encoding="UTF-8"?>
<members>
  <member>
    <email>ahmed@ugrad.iiuc.ac.bd</email>
    <name>Ahmed Hassan</name>
    <role>president</role>
    <department>CSE</department>
    <session>2021</session>
    <whatsapp>+8801712345678</whatsapp>
  </member>
  <member>
    <name>Fatima Khan</name>
    <role>member</role>
    <department>EEE</department>
    <session>2022</session>
  </member>
</members>`,
};

function parseCSV(text: string): ParsedMember[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[,\t]/).map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  return lines.slice(1).map((line, idx) => {
    const cells = line.split(/[,\t]/).map(c => c.trim());
    const obj: ParsedMember = { _row: idx + 2 };
    headers.forEach((h, i) => {
      const val = cells[i] || '';
      if (h.includes('email')) obj.email = val || undefined;
      else if (h.includes('name')) obj.name = val || undefined;
      else if (h.includes('role')) obj.role = val || undefined;
      else if (h.includes('dept')) obj.department = val || undefined;
      else if (h.includes('sess')) obj.session = val || undefined;
      else if (h.includes('whats') || h.includes('phone') || h === 'wa') obj.whatsapp = val || undefined;
    });
    return obj;
  }).filter(m => m.email || m.name);
}

function parseJSON(text: string): ParsedMember[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.members || data.data || [data];
  return arr.map((item: any, idx: number) => ({
    email: item.email || undefined,
    name: item.name || undefined,
    role: item.role || undefined,
    department: item.department || item.dept || undefined,
    session: item.session || item.semester || undefined,
    whatsapp: item.whatsapp || item.phone || item.wa || undefined,
    _row: idx + 1,
  })).filter((m: ParsedMember) => m.email || m.name);
}

function parseXML(text: string): ParsedMember[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const members = doc.querySelectorAll('member');
  return Array.from(members).map((node, idx) => {
    const g = (tag: string) => node.querySelector(tag)?.textContent?.trim() || undefined;
    return {
      email: g('email'),
      name: g('name'),
      role: g('role'),
      department: g('department') || g('dept'),
      session: g('session') || g('semester'),
      whatsapp: g('whatsapp') || g('phone') || g('wa'),
      _row: idx + 1,
    };
  }).filter(m => m.email || m.name);
}

function downloadTemplate(fmt: Format) {
  const blob = new Blob([TEMPLATES[fmt]], { type: FORMAT_INFO[fmt].mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `club-members-template.${fmt === 'csv' ? 'csv' : fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function BulkImportView({ clubSlug, customClubRoles, onSaveCustomRole, onClose }: {
  clubSlug: string;
  customClubRoles: Array<{ key: string; label: string }>;
  onSaveCustomRole: (key: string, label: string) => void;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>('json');
  const [showTemplate, setShowTemplate] = useState(false);
  const [parsed, setParsed] = useState<ParsedMember[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; error: number; total: number; details: any[] } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [defaultRole, setDefaultRole] = useState('member');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        let members: ParsedMember[] = [];
        if (format === 'json') members = parseJSON(text);
        else if (format === 'csv') members = parseCSV(text);
        else if (format === 'xml') members = parseXML(text);
        // Apply default role to members without a role
        members = members.map(m => ({ ...m, role: m.role || defaultRole }));
        setParsed(members);
      } catch (err: any) {
        setParsed([{ _error: `Parse error: ${err.message}`, _row: 0 }]);
      }
    };
    reader.readAsText(file);
  }, [format, defaultRole]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  async function handleImport() {
    const valid = parsed.filter(m => !m._error && (m.email || m.name));
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/clubs/${clubSlug}/members/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: valid.map(({ _row, _error, ...rest }) => rest) }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({ success: data.successCount, error: data.errorCount, total: data.total, details: data.results });
      } else {
        alert(data.error || 'Import failed');
      }
    } catch { alert('Network error'); }
    setImporting(false);
  }

  function removeRow(idx: number) {
    setParsed(prev => prev.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, field: string, value: string) {
    setParsed(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value || undefined } : m));
  }

  const validCount = parsed.filter(m => !m._error && (m.email || m.name)).length;
  const errorCount = parsed.filter(m => m._error).length;

  return (
    <div className="space-y-4">
      {/* Format Selector */}
      <div>
        <label className="text-sm text-dark-text2 font-semibold mb-2 block">File Format</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(FORMAT_INFO) as Format[]).map(f => (
            <button key={f} onClick={() => { setFormat(f); setParsed([]); setFileName(''); setResult(null); }}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-semibold transition ${
                format === f ? 'bg-qsis/15 border-qsis/50 text-qsis' : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-dark-text2'
              }`}>
              <i className={`${FORMAT_INFO[f].icon} text-lg`}></i>
              {FORMAT_INFO[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Default Role */}
      <div>
        <label className="text-sm text-dark-text2 font-semibold mb-1 block">Default Role (if not specified in file)</label>
        <RoleCombobox value={defaultRole} onChange={setDefaultRole} customRoles={customClubRoles} onSaveCustom={onSaveCustomRole} />
      </div>

      {/* Template */}
      <div className="bg-dark-bg3 rounded-xl border border-dark-border p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-dark-text2">Need a template?</p>
          <div className="flex gap-2">
            <button onClick={() => setShowTemplate(!showTemplate)} className="text-[0.65rem] px-2 py-1 rounded bg-dark-bg2 border border-dark-border text-dark-text2 hover:text-dark-text transition">
              <i className={`fas fa-eye mr-1`}></i>{showTemplate ? 'Hide' : 'Preview'}
            </button>
            <button onClick={() => downloadTemplate(format)} className="text-[0.65rem] px-2 py-1 rounded bg-qsis/15 border border-qsis/30 text-qsis hover:bg-qsis/25 transition">
              <i className="fas fa-download mr-1"></i>Download
            </button>
          </div>
        </div>
        {showTemplate && (
          <pre className="text-[0.65rem] text-dark-text2 bg-dark-bg rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto border border-dark-border">
            <code>{TEMPLATES[format]}</code>
          </pre>
        )}
        <p className="text-[0.6rem] text-dark-text2/60 mt-2">
          {format === 'csv' && 'Columns: email, name, role, department, session, whatsapp. Comma or tab separated. Excel users: Save As → CSV (Comma delimited).'}
          {format === 'json' && 'Array of objects. Fields: email, name, role, department, session, whatsapp. Only email OR name is required.'}
          {format === 'xml' && '<members> root with <member> children. Tags: email, name, role, department, session, whatsapp.'}
        </p>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-dark-border hover:border-qsis/50 rounded-xl p-6 text-center cursor-pointer transition"
      >
        <input ref={fileRef} type="file" accept={FORMAT_INFO[format].ext} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <i className="fas fa-cloud-arrow-up text-2xl text-dark-text2 mb-2 block"></i>
        <p className="text-sm text-dark-text2">
          {fileName ? <><i className="fas fa-file mr-1"></i>{fileName}</> : 'Drop file here or click to browse'}
        </p>
        <p className="text-[0.6rem] text-dark-text2/50 mt-1">Supports: {FORMAT_INFO[format].ext}</p>
      </div>

      {/* Parsed Preview */}
      {parsed.length > 0 && !result && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-dark-text">
              Preview ({validCount} valid{errorCount > 0 ? <span className="text-red-400">, {errorCount} errors</span> : ''})
            </p>
            <button onClick={() => { setParsed([]); setFileName(''); }} className="text-[0.65rem] text-dark-text2 hover:text-dark-text transition">
              <i className="fas fa-times mr-1"></i>Clear
            </button>
          </div>
          <div className="bg-dark-bg rounded-xl border border-dark-border overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-dark-bg3">
                <tr className="text-left text-dark-text2">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Dept</th>
                  <th className="px-3 py-2 font-semibold">Session</th>
                  <th className="px-3 py-2 font-semibold">WhatsApp</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((m, i) => (
                  <tr key={i} className={`border-t border-dark-border ${m._error ? 'bg-red-500/5' : editingIdx === i ? 'bg-qsis/5' : 'hover:bg-dark-bg2'}`}>
                    <td className="px-3 py-1.5 text-dark-text2">{m._row || i + 1}</td>
                    {editingIdx === i ? (
                      <>
                        <td className="px-1 py-1"><input value={m.name || ''} onChange={e => updateRow(i, 'name', e.target.value)} className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-[0.65rem] outline-none" /></td>
                        <td className="px-1 py-1"><input value={m.email || ''} onChange={e => updateRow(i, 'email', e.target.value)} className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-[0.65rem] outline-none" /></td>
                        <td className="px-1 py-1"><input value={m.role || ''} onChange={e => updateRow(i, 'role', e.target.value)} className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-[0.65rem] outline-none" /></td>
                        <td className="px-1 py-1"><input value={m.department || ''} onChange={e => updateRow(i, 'department', e.target.value)} className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-[0.65rem] outline-none" /></td>
                        <td className="px-1 py-1"><input value={m.session || ''} onChange={e => updateRow(i, 'session', e.target.value)} className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-[0.65rem] outline-none" /></td>
                        <td className="px-1 py-1"><input value={m.whatsapp || ''} onChange={e => updateRow(i, 'whatsapp', e.target.value)} className="w-full px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text text-[0.65rem] outline-none" /></td>
                        <td className="px-2 py-1"><button onClick={() => setEditingIdx(null)} className="text-qsis hover:text-qsis text-[0.6rem]"><i className="fas fa-check"></i></button></td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-dark-text truncate max-w-[100px]">{m.name || <span className="text-dark-text2 italic">-</span>}</td>
                        <td className="px-3 py-1.5 text-dark-text truncate max-w-[150px]">{m.email || <span className="text-dark-text2 italic">stub</span>}</td>
                        <td className="px-3 py-1.5"><span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-dark-bg3 text-dark-text2">{m.role}</span></td>
                        <td className="px-3 py-1.5 text-dark-text2">{m.department || '-'}</td>
                        <td className="px-3 py-1.5 text-dark-text2">{m.session || '-'}</td>
                        <td className="px-3 py-1.5 text-dark-text2 truncate max-w-[100px]">{m.whatsapp || '-'}</td>
                        <td className="px-2 py-1 flex gap-1">
                          <button onClick={() => setEditingIdx(i)} className="text-dark-text2 hover:text-qsis text-[0.6rem]" title="Edit"><i className="fas fa-pen"></i></button>
                          <button onClick={() => removeRow(i)} className="text-dark-text2 hover:text-red-400 text-[0.6rem]" title="Remove"><i className="fas fa-times"></i></button>
                        </td>
                      </>
                    )}
                    {m._error && <td colSpan={7} className="px-3 py-1 text-red-400 text-[0.6rem]">{m._error}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Result */}
      {result && (
        <div className={`rounded-xl border p-4 ${result.error === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <p className="text-sm font-semibold text-dark-text mb-2">
            <i className={`fas ${result.error === 0 ? 'fa-check-circle text-emerald-400' : 'fa-exclamation-triangle text-amber-400'} mr-2`}></i>
            Import Complete
          </p>
          <div className="flex gap-4 text-xs text-dark-text2">
            <span><i className="fas fa-check text-emerald-400 mr-1"></i>{result.success} added</span>
            {result.error > 0 && <span><i className="fas fa-times text-red-400 mr-1"></i>{result.error} failed</span>}
          </div>
          {result.details.filter(d => d.status === 'error').length > 0 && (
            <div className="mt-3 space-y-1">
              {result.details.filter(d => d.status === 'error').map((d, i) => (
                <p key={i} className="text-[0.65rem] text-red-400">Row {d.index + 1}: {d.error}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 px-3 py-2.5 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-dark-bg3 transition">
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && (
          <button onClick={handleImport} disabled={importing || validCount === 0}
            className="flex-1 px-3 py-2.5 rounded-lg bg-qsis hover:bg-qsis/80 text-dark-text text-sm font-semibold disabled:opacity-50 transition">
            {importing ? <><i className="fas fa-spinner fa-spin mr-1"></i>Importing...</> : <><i className="fas fa-file-import mr-1"></i>Import {validCount} Members</>}
          </button>
        )}
        {result && result.success > 0 && (
          <button onClick={onClose} className="flex-1 px-3 py-2.5 rounded-lg bg-qsis hover:bg-qsis/80 text-dark-text text-sm font-semibold transition">
            Done
          </button>
        )}
      </div>
    </div>
  );
}
