'use client';

import { useEffect, useRef, useState } from 'react';
import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';

export interface CreateCourseResult {
  success: boolean;
  error?: string;
}

interface CreateCourseModalProps {
  open: boolean;
  department: string;
  semester: string;
  knownCourses?: { code: string; title: string }[];
  onSubmit: (code: string, title: string) => Promise<CreateCourseResult>;
  onClose: () => void;
}

function deptLabel(deptId: string): string {
  if (!deptId) return '';
  for (const f of FACULTIES) {
    const d = f.departments.find(dd => dd.id === deptId);
    if (d) return `${d.shortName} — ${d.name}`;
  }
  return deptId;
}

function semLabel(semId: string): string {
  if (!semId) return '';
  if (semId === config.relatedKitabsFolder) return 'Related Kitabs';
  if (semId === config.relatedSourcesFolder) return 'Related Sources';
  return config.semesters.find(s => s.id === semId)?.label || semId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function CreateCourseModal({ open, department, semester, knownCourses = [], onSubmit, onClose }: CreateCourseModalProps) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<{ code?: boolean; title?: boolean }>({});
  const [creating, setCreating] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const canCreate = !!(department && semester);

  useEffect(() => {
    if (open) {
      setCode('');
      setTitle('');
      setErrors({});
      setSubmitError('');
      setCreating(false);
      if (canCreate) {
        setTimeout(() => codeRef.current?.focus(), 50);
      }
    }
  }, [open, canCreate]);

  async function handleSubmit() {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedTitle = title.trim();
    const errs: { code?: boolean; title?: boolean } = {};
    if (!trimmedCode) errs.code = true;
    if (!trimmedTitle) errs.title = true;
    setErrors(errs);
    setSubmitError('');
    if (errs.code) { codeRef.current?.focus(); return; }
    if (errs.title) { titleRef.current?.focus(); return; }

    setCreating(true);
    const res = await onSubmit(trimmedCode, trimmedTitle);
    if (!res.success) {
      setSubmitError(res.error || 'Failed to create course');
      setCreating(false);
      return;
    }
    setCreating(false);
    onClose();
  }

  return (
    <>
      {open && (
        <>
          <div className="fixed inset-0 z-[260] bg-black/60" onClick={() => !creating && onClose()} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[270] w-[calc(100%-3rem)] max-w-[400px] rounded-2xl border border-dark-border bg-dark-bg2 shadow-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-3 border-b border-dark-border flex items-center justify-between">
              <div>
                <h4 className="text-[0.95rem] font-bold text-dark-text flex items-center gap-2">
                  <i className="fas fa-plus-circle text-qsis"></i> Create New Course
                </h4>
                <p className="text-[0.7rem] text-dark-text3 mt-0.5">Folders are created on GitHub automatically</p>
              </div>
              <button className="w-7 h-7 rounded-lg bg-dark-bg3 border border-dark-border flex items-center justify-center text-dark-text2 cursor-pointer hover:text-dark-text" onClick={() => !creating && onClose()}>
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {!canCreate ? (
              <div className="px-5 py-8 text-center">
                <i className="fas fa-info-circle text-2xl text-dark-text3 mb-3 block"></i>
                <p className="text-[0.82rem] text-dark-text2">Select a department and semester first to create a course.</p>
                <button className="mt-4 px-4 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:bg-dark-bg" onClick={onClose}>
                  Got it
                </button>
              </div>
            ) : (
              <div className="px-5 py-4">
                <div className="mb-4 p-3 rounded-lg bg-qsis/5 border border-qsis/10 text-[0.72rem] text-dark-text2 space-y-1">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-building text-qsis text-[0.65rem] w-4"></i>
                    <span className="text-dark-text font-semibold">{deptLabel(department) || department}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-calendar text-qsis text-[0.65rem] w-4"></i>
                    <span className="text-dark-text font-semibold">{semLabel(semester)}</span>
                  </div>
                  <p className="text-[0.66rem] text-dark-text3 pt-1">
                    Creates <span className="font-mono text-qsis">Mid/Final/NOTES/Previous Questions/sheet/Syllabus/Other</span> folders on GitHub
                  </p>
                </div>

                {submitError && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.75rem]">
                    <i className="fas fa-exclamation-triangle mr-1"></i>{submitError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Code *</label>
                    <input
                      ref={codeRef}
                      type="text"
                      placeholder="e.g. QSM-3602"
                      value={code}
                      disabled={creating}
                      onChange={e => {
                        const v = e.target.value.toUpperCase();
                        setCode(v);
                        setErrors(prev => ({ ...prev, code: false }));
                        const match = knownCourses.find(c => c.code.toUpperCase() === v.trim().toUpperCase());
                        if (match) setTitle(match.title);
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') titleRef.current?.focus(); }}
                      className={`w-full px-3 py-2 rounded-lg border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors disabled:opacity-50 ${errors.code ? 'border-red-500' : 'border-dark-border'}`}
                    />
                    {errors.code && <p className="text-[0.65rem] text-red-400 mt-1"><i className="fas fa-exclamation-triangle mr-1"></i>Course code is required</p>}
                  </div>
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Title *</label>
                    <input
                      ref={titleRef}
                      type="text"
                      placeholder="e.g. Tafsir Bir Rayi"
                      value={title}
                      disabled={creating}
                      onChange={e => { setTitle(e.target.value); setErrors(prev => ({ ...prev, title: false })); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                      className={`w-full px-3 py-2 rounded-lg border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors disabled:opacity-50 ${errors.title ? 'border-red-500' : 'border-dark-border'}`}
                    />
                    {errors.title && <p className="text-[0.65rem] text-red-400 mt-1"><i className="fas fa-exclamation-triangle mr-1"></i>Course title is required</p>}
                  </div>
                </div>

                <div className="flex gap-2 mt-5">
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.82rem] font-semibold cursor-pointer hover:bg-dark-bg transition-colors"
                    onClick={() => !creating && onClose()}
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
                    onClick={handleSubmit}
                    disabled={creating}
                  >
                    {creating ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-check mr-1"></i>Create &amp; Select</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
