'use client';

import { useState } from 'react';
import { CURRENT_YEAR } from './types';
import { isPdf, isImage, isMarkdown } from './types';
import type { FileWithMeta, CourseGroup } from './types';
import type { Profile } from '@/lib/store';
import { renderMarkdown } from '@/lib/markdown';

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return <i className="fas fa-file-image" style={{color:'#34d399'}}></i>;
  if (ext === 'pdf') return <i className="fas fa-file-pdf" style={{color:'#ef4444'}}></i>;
  if (['doc','docx'].includes(ext)) return <i className="fas fa-file-word" style={{color:'#3b82f6'}}></i>;
  if (['xls','xlsx','csv'].includes(ext)) return <i className="fas fa-file-excel" style={{color:'#22c55e'}}></i>;
  if (['ppt','pptx'].includes(ext)) return <i className="fas fa-file-powerpoint" style={{color:'#f97316'}}></i>;
  if (['md','markdown'].includes(ext)) return <i className="fas fa-file-lines" style={{color:'#a78bfa'}}></i>;
  return <i className="fas fa-file" style={{color:'#94a3b8'}}></i>;
}

interface FilePreviewProps {
  files: FileWithMeta[];
  courseId: number;
  courseCode: string;
  category: string;
  isNotes: boolean;
  isQuestions: boolean;
  onRemoveFile: (courseId: number, fileIndex: number) => void;
  onUpdateFile: (courseId: number, files: FileWithMeta[]) => void;
  mergeDialogCourseId: number | null;
  mergeImages: FileWithMeta[];
  mergeSession: string;
  mergeYear: string;
  mergeMerging: boolean;
  mergeOcr: boolean;
  setMergeOcr: (v: boolean) => void;
  onMerge: (courseId: number) => void;
  onDismissMerge: () => void;
  profile: Profile;
  email: string;
}

export default function FilePreview({
  files, courseId, courseCode, category, isNotes, isQuestions,
  onRemoveFile, onUpdateFile,
  mergeDialogCourseId, mergeImages, mergeSession, mergeYear, mergeMerging,
  mergeOcr, setMergeOcr,
  onMerge, onDismissMerge,   profile, email,
}: FilePreviewProps) {
  const [preview, setPreview] = useState<{ name: string; html: string } | null>(null);

  if (files.length === 0) return null;

  async function openPreview(file: File) {
    try {
      const text = await file.text();
      setPreview({ name: file.name, html: renderMarkdown(text) });
    } catch {
      setPreview({ name: file.name, html: '<p class="text-dark-text3">Unable to read file.</p>' });
    }
  }

  return (
    <>
      <div className="mt-2 flex flex-col gap-1.5">
        {files.map((fileMeta, fi) => {
          const fileIsPdf = isPdf(fileMeta.file.name);
          const fileIsMd = isMarkdown(fileMeta.file.name);
          return (
            <div key={fi} className="p-2 rounded-lg bg-dark-bg border border-dark-border">
              <div className="flex items-center gap-2">
                <div className="text-[0.95rem] flex-shrink-0">{getFileIcon(fileMeta.file.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.75rem] font-semibold truncate">{fileMeta.file.name}</div>
                </div>
                <div className="text-[0.62rem] text-dark-text2 flex-shrink-0">{formatSize(fileMeta.file.size)}</div>
                {fileIsMd && (
                  <button className="w-5 h-5 rounded bg-qsis/10 text-qsis border-none cursor-pointer flex items-center justify-center text-[0.65rem] hover:bg-qsis/20" onClick={() => openPreview(fileMeta.file)} title="Preview">
                    <i className="fas fa-eye"></i>
                  </button>
                )}
                <button className="w-5 h-5 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.65rem] hover:bg-red-500/20" onClick={() => onRemoveFile(courseId, fi)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              {(isNotes || isQuestions) && (
                <div className="mt-1.5">
                  {isQuestions && fileIsPdf ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[0.62rem] text-dark-text3 block mb-0.5">From Year</label>
                        <input
                          type="number"
                          min={CURRENT_YEAR - 10}
                          max={CURRENT_YEAR}
                          className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={fileMeta.yearRange.split('-')[0] || ''}
                          onChange={e => {
                            const toYear = fileMeta.yearRange.split('-')[1] || String(CURRENT_YEAR);
                            const newFiles = [...files];
                            newFiles[fi] = { ...newFiles[fi], yearRange: `${e.target.value}-${toYear}` };
                            onUpdateFile(courseId, newFiles);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[0.62rem] text-dark-text3 block mb-0.5">To Year</label>
                        <input
                          type="number"
                          min={CURRENT_YEAR - 10}
                          max={CURRENT_YEAR + 5}
                          className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={fileMeta.yearRange.split('-')[1] || ''}
                          onChange={e => {
                            const fromYear = fileMeta.yearRange.split('-')[0] || String(CURRENT_YEAR);
                            const newFiles = [...files];
                            newFiles[fi] = { ...newFiles[fi], yearRange: `${fromYear}-${e.target.value}` };
                            onUpdateFile(courseId, newFiles);
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[0.62rem] text-dark-text3 block mb-0.5">Year</label>
                      <input
                        type="number"
                        min={CURRENT_YEAR - 10}
                        max={CURRENT_YEAR + 5}
                        className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={fileMeta.year}
                        onChange={e => {
                          const newFiles = [...files];
                          newFiles[fi] = { ...newFiles[fi], year: e.target.value };
                          onUpdateFile(courseId, newFiles);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mergeDialogCourseId === courseId && mergeImages.length >= 2 && (
        <div className="mt-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-start gap-2 mb-2">
            <i className="fas fa-images text-blue-400 mt-0.5"></i>
            <div className="flex-1">
              <p className="text-[0.78rem] font-semibold text-blue-300">Merge {mergeImages.length} images into one PDF?</p>
              <p className="text-[0.68rem] text-dark-text3 mt-0.5">
                These images appear to be parts of the same question paper ({mergeSession} {mergeYear}).
              </p>
              <p className="text-[0.65rem] text-dark-text3 mt-0.5">
                Will be saved as: <span className="text-blue-300 font-semibold">{courseCode} {mergeSession} {mergeYear} - {profile?.name || email.split('@')[0] || 'Unknown'}.pdf</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 ml-5">
            <button
              className="px-3 py-1 rounded-lg bg-blue-500 text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
              onClick={() => onMerge(courseId)}
              disabled={mergeMerging}
            >
              {mergeMerging ? <><i className="fas fa-spinner fa-spin mr-1"></i>Merging...</> : <><i className="fas fa-compress-alt mr-1"></i>Merge into PDF</>}
            </button>
            <button
              className="px-3 py-1 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.72rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2 transition-colors"
              onClick={onDismissMerge}
              disabled={mergeMerging}
            >
              Keep Separate
            </button>
            <label className="flex items-center gap-1.5 text-[0.7rem] text-dark-text2 cursor-pointer select-none">
              <input type="checkbox" checked={mergeOcr} onChange={e => setMergeOcr(e.target.checked)} className="accent-blue-500" disabled={mergeMerging} />
              <i className="fas fa-font"></i> OCR
            </label>
          </div>
          {mergeOcr && (
            <p className="ml-5 mt-1.5 text-[0.65rem] text-blue-300"><i className="fas fa-info-circle mr-1"></i>OCR makes the merged PDF text selectable &amp; copyable (takes longer).</p>
          )}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-dark-bg2 w-full max-w-[560px] max-h-[88vh] rounded-2xl border border-dark-border overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-dark-border">
              <div className="flex items-center gap-2 min-w-0">
                <i className="fas fa-file-lines text-qsis"></i>
                <span className="text-[0.85rem] font-semibold text-dark-text truncate">{preview.name}</span>
              </div>
              <button className="w-8 h-8 rounded-lg bg-dark-bg3 border border-dark-border flex items-center justify-center text-dark-text2 cursor-pointer hover:text-dark-text" onClick={() => setPreview(null)}>
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="md-content text-dark-text" dangerouslySetInnerHTML={{ __html: preview.html }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
