'use client';

import { useRef, useState } from 'react';
import { parseRoutineFile, ROUTINE_IMPORT_ACCEPT, type RoutineImportData } from '@/lib/routine-import';
import { downloadRoutineTemplate, type TemplateFormat } from '@/lib/routine-templates';
import { showToast } from '@/lib/utils';

const TEMPLATE_FORMATS: [TemplateFormat, string, string][] = [
  ['csv', 'CSV', 'fa-file-csv'],
  ['json', 'JSON', 'fa-file-code'],
  ['xlsx', 'Excel (.xlsx)', 'fa-file-excel'],
  ['docx', 'Word (.docx)', 'fa-file-word'],
];

const itemStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: '0.75rem',
  color: 'var(--text)',
  background: 'transparent',
};

const groupLabelStyle: React.CSSProperties = {
  padding: '6px 12px 2px',
  fontSize: '0.62rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text3)',
};

export default function RoutineActionsMenu({
  onNewRoutine,
  onAllSemesterRoutine,
  onImport,
  preferSemester,
}: {
  onNewRoutine: () => void;
  onAllSemesterRoutine?: () => void;
  onImport: (data: RoutineImportData) => void;
  preferSemester?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    close();
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
    close();
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
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="routine-btn routine-btn-primary"
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        title="Create, import or download a routine template"
      >
        <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-magic'}`} style={{ marginRight: 5 }}></i>
        {busy ? 'Importing…' : 'Routine'}
        <i className="fas fa-caret-down" style={{ marginLeft: 6, fontSize: '0.6rem' }}></i>
      </button>
      <input ref={inputRef} type="file" accept={ROUTINE_IMPORT_ACCEPT} className="hidden" onChange={handleFile} />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 60,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            minWidth: 230,
            padding: '4px 0',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <div style={groupLabelStyle}>Create</div>
          <button type="button" onClick={() => { close(); onNewRoutine(); }} style={itemStyle}>
            <i className="fas fa-plus" style={{ marginRight: 8, color: 'var(--text3)', width: 12 }}></i>
            New Routine
          </button>
          {onAllSemesterRoutine && (
            <button type="button" onClick={() => { close(); onAllSemesterRoutine(); }} style={itemStyle}>
              <i className="fas fa-layer-group" style={{ marginRight: 8, color: 'var(--text3)', width: 12 }}></i>
              All Semester Routine
            </button>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px' }} />

          <div style={groupLabelStyle}>Import / Template</div>
          <button type="button" onClick={() => { close(); inputRef.current?.click(); }} style={itemStyle}>
            <i className="fas fa-upload" style={{ marginRight: 8, color: 'var(--text3)', width: 12 }}></i>
            Import from file
          </button>
          <div style={groupLabelStyle}>Download blank template</div>
          {TEMPLATE_FORMATS.map(([fmt, label, icon]) => (
            <button key={fmt} type="button" onClick={() => handleTemplate(fmt)} style={itemStyle}>
              <i className={`fas ${icon}`} style={{ marginRight: 8, color: 'var(--text3)', width: 12 }}></i>
              {label}
            </button>
          ))}
          <div style={{ padding: '6px 12px', fontSize: '0.62rem', color: 'var(--text3)', borderTop: '1px solid var(--border)', marginTop: 4 }}>
            1. Download a template · 2. Fill the rows · 3. Import
          </div>
        </div>
      )}
    </div>
  );
}