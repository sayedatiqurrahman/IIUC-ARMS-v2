'use client';

import { useRef } from 'react';
import { ExamCourse, ExamAllSemesterSem } from './types';
import { showToast } from '@/lib/utils';

interface ExamCoursesStepProps {
  enabledSemesters: ExamAllSemesterSem[];
  semLabels: Record<string, string>;
  activeSemTab: number;
  setActiveSemTab: (idx: number) => void;
  courseSuggestionsIdx: string | null;
  setCourseSuggestionsIdx: (v: string | null) => void;
  courseSearch: string;
  setCourseSearch: (v: string) => void;
  courseInputRef: React.RefObject<HTMLDivElement | null>;
  filteredCourseSuggestions: { code: string; title: string }[];
  allCourses: { code: string; title: string }[];
  updateSemCourse: (semName: string, cIdx: number, field: keyof ExamCourse, value: string) => void;
  addSemCourse: (semName: string) => void;
  removeSemCourse: (semName: string, cIdx: number) => void;
  saveCourseToGitHub: (semName: string, code: string, title: string) => Promise<void>;
  setSemesters: React.Dispatch<React.SetStateAction<ExamAllSemesterSem[]>>;
  canSaveToGithub: boolean;
  onBack: () => void;
  onNext: () => void;
}

export default function ExamCoursesStep({
  enabledSemesters, semLabels, activeSemTab, setActiveSemTab,
  courseSuggestionsIdx, setCourseSuggestionsIdx, courseSearch, setCourseSearch,
  courseInputRef, filteredCourseSuggestions, allCourses,
  updateSemCourse, addSemCourse, removeSemCourse, saveCourseToGitHub,
  setSemesters, canSaveToGithub, onBack, onNext,
}: ExamCoursesStepProps) {
  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5 mt-4">
      <h4 className="text-[0.9rem] font-bold text-dark-text mb-1"><i className="fas fa-book text-qsis mr-2"></i>Courses</h4>
      <p className="text-[0.72rem] text-dark-text3 mb-3">Courses auto-load from DB &amp; GitHub. Add or edit courses per semester.</p>
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {enabledSemesters.map((sem, idx) => (
          <button key={sem.name} onClick={() => setActiveSemTab(idx)} className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold whitespace-nowrap border transition-colors ${activeSemTab === idx ? 'bg-qsis text-white border-qsis' : 'bg-dark-bg border-dark-border text-dark-text2 hover:border-qsis/50'}`}>
            {semLabels[sem.name] || sem.name}
            <span className="ml-1 opacity-70">({sem.courses.length})</span>
          </button>
        ))}
      </div>
      {enabledSemesters.map((sem, idx) => idx !== activeSemTab ? null : (
        <div key={sem.name}>
          <div className="space-y-1.5 mb-3">
            {sem.courses.length === 0 && <p className="text-[0.72rem] text-dark-text3 p-3 rounded bg-dark-bg border border-dark-border"><i className="fas fa-spinner fa-spin mr-1"></i>Loading courses...</p>}
            {sem.courses.map((c, cIdx) => {
              const suggestKey = `${sem.name}:${cIdx}`;
              const isActive = courseSuggestionsIdx === suggestKey;
              const hasExactMatch = isActive && c.code.trim() && allCourses.some(ac => ac.code.toUpperCase() === c.code.trim().toUpperCase());
              return (
                <div key={cIdx} className={`flex items-center gap-2 p-2 rounded-lg border ${c.fromGithub ? 'bg-dark-bg border-dark-border' : 'bg-yellow-500/5 border-yellow-500/30'}`} ref={isActive ? courseInputRef : undefined}>
                  <div className="relative">
                    <input value={c.code} placeholder="Code (e.g. QSM-3602)" className="w-32 px-2 py-1 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.75rem] outline-none focus:border-qsis"
                      onFocus={() => { setCourseSuggestionsIdx(suggestKey); setCourseSearch(c.code); }}
                      onChange={e => { updateSemCourse(sem.name, cIdx, 'code', e.target.value); setCourseSearch(e.target.value); setCourseSuggestionsIdx(suggestKey); }} />
                    {isActive && courseSearch.trim() && filteredCourseSuggestions.length > 0 && (
                      <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-dark-bg2 border border-dark-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filteredCourseSuggestions.map((sc, si) => (
                          <button key={si} className="w-full text-left px-3 py-1.5 text-[0.72rem] hover:bg-qsis/10 text-dark-text flex justify-between items-center border-none bg-transparent cursor-pointer" onClick={() => { updateSemCourse(sem.name, cIdx, 'code', sc.code); updateSemCourse(sem.name, cIdx, 'title', sc.title); setCourseSuggestionsIdx(null); setCourseSearch(''); }}>
                            <span className="font-mono font-semibold">{sc.code}</span>
                            <span className="text-dark-text3 truncate ml-2">{sc.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input value={c.title} onChange={e => updateSemCourse(sem.name, cIdx, 'title', e.target.value)} placeholder="Title" className="flex-1 px-2 py-1 rounded border border-dark-border bg-dark-bg2 text-dark-text text-[0.75rem] outline-none focus:border-qsis" />
                  {!c.fromGithub && c.code.trim() && !hasExactMatch && c.title.trim() && canSaveToGithub && (
                    <button onClick={() => saveCourseToGitHub(sem.name, c.code, c.title).then(() => { setSemesters(prev => prev.map(s => s.name !== sem.name ? s : { ...s, courses: s.courses.map((cc, j) => j === cIdx ? { ...cc, fromGithub: true } : cc) })); showToast('Saved to GitHub', 'success'); })} className="text-green-400 hover:text-green-300 bg-transparent border-none cursor-pointer text-[0.68rem] whitespace-nowrap" title="Save to GitHub"><i className="fab fa-github mr-0.5"></i>Save</button>
                  )}
                  {c.fromGithub ? <i className="fas fa-check-circle text-green-400 text-[0.68rem]"></i> : <i className="fas fa-cloud-upload-alt text-yellow-400 text-[0.68rem]"></i>}
                  <button onClick={() => removeSemCourse(sem.name, cIdx)} className="text-red-400 hover:text-red-300 bg-transparent border-none cursor-pointer text-[0.68rem]"><i className="fas fa-trash"></i></button>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => addSemCourse(sem.name)} className="routine-btn"><i className="fas fa-plus mr-1"></i>Add Course</button>
            {canSaveToGithub && sem.courses.some(c => c.code && c.title && !c.fromGithub) && (
              <button onClick={() => { sem.courses.filter(c => c.code && c.title && !c.fromGithub).forEach(c => saveCourseToGitHub(sem.name, c.code, c.title)); setSemesters(prev => prev.map(s => s.name !== sem.name ? s : { ...s, courses: s.courses.map(c => (c.code && c.title && !c.fromGithub) ? { ...c, fromGithub: true } : c) })); showToast('Courses saved to GitHub', 'success'); }} className="routine-btn routine-btn-accent"><i className="fab fa-github mr-1"></i>Save to GitHub</button>
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 justify-between mt-4">
        <button onClick={onBack} className="routine-btn"><i className="fas fa-arrow-left mr-1"></i>Back</button>
        <button onClick={onNext} className="routine-btn routine-btn-primary"><i className="fas fa-arrow-right mr-1"></i>Next: Assign & Publish</button>
      </div>
    </div>
  );
}
