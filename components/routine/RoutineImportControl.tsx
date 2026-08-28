'use client';

import { useRef, useState } from 'react';
import { parseRoutineFile, ROUTINE_IMPORT_ACCEPT, type RoutineImportData } from '@/lib/routine-import';
import { downloadRoutineTemplate, type TemplateFormat } from '@/lib/routine-templates';
import { showToast } from '@/lib/utils';

const TEMPLATE_ITEMS: [TemplateFormat, string, string][] = [
  ['csv', 'CSV', 'fa-file-csv'],
  ['json', 'JSON', 'fa-file-code'],
  ['xlsx', 'Excel (.xlsx)', 'fa-file-excel'],
  ['docx', 'Word (.docx)', 'fa-file-word'],
];

export default function RoutineImportControl({
  onImport,
  preferSemester,
  buttonLabel = 'Import',
}: {
  onImport: (data: RoutineImportData) => void;
  preferSemester?: string;
  buttonLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const data = await parseRoutineFile(file, preferSemester);
      onImport(data);
      showToast(`Imported ${data.rowCount} row${data.rowCount === 1 ? '' : 's'} (${data.label})`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Import failed. Check the file format.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTemplate = async (format: TemplateFormat) => {
    setOpen(false);
    try {
      const { name, blob } = await downloadRoutineTemplate(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      showToast('Could not generate template', 'error');
    }
  };

  return (
    <>
      <button
        type="button"
        className="routine-btn routine-btn-outline"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Import a routine from JSON, CSV, Excel (.xlsx) or Word (.docx)"
      >
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-file-import'}`} style={{ marginRight: 5 }}></i>
        {busy ? 'Importing…' : buttonLabel}
      </button>
      <input ref={inputRef} type="file" accept={ROUTINE_IMPORT_ACCEPT} className="hidden" onChange={handleFile} />

      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button type="button" className="routine-btn routine-btn-outline" onClick={() => setOpen(o => !o)} title="Download a blank template to fill in">
          <i className="fas fa-download" style={{ marginRight: 5 }}></i>
          Template
          <i className="fas fa-caret-down" style={{ marginLeft: 5, fontSize: '0.6rem' }}></i>
        </button>
        {open && (
          <div
            style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 60, background: 'var(--bg2)',
              border: '1px solid var(--border)', borderRadius: 8, minWidth: 190, padding: '4px 0',
              boxShadow: '0 8px 24px rgba(0,0,0,.3)',
            }}
          >
            {TEMPLATE_ITEMS.map(([fmt, label, icon]) => (
              <button
                key={fmt}
                type="button"
                onClick={() => handleTemplate(fmt)}
                style={{ width: '100%', padding: '6px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text)' }}
              >
                <i className={`fas ${icon}`} style={{ marginRight: 8, color: 'var(--text3)' }}></i>
                {label}
              </button>
            ))}
            <div style={{ padding: '6px 12px', fontSize: '0.65rem', color: 'var(--text3)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
              1. Download a template · 2. Fill the rows · 3. Import it
            </div>
          </div>
        )}
      </div>
    </>
  );
}