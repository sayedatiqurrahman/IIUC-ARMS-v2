'use client';

import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';

interface SemestersViewProps {
  currentDept: string | null;
  goBack: () => void;
  onboardData: any;
  clearOnboarding: () => void;
  isMySemesterOnly: boolean;
  personalizedSemesters: any[];
  userSemesterId: string | null;
  navigateToSemester: (id: string) => void;
}

export default function SemestersView({
  currentDept, goBack, onboardData, clearOnboarding,
  isMySemesterOnly, personalizedSemesters, userSemesterId, navigateToSemester,
}: SemestersViewProps) {
  let deptLabel = 'Semesters';
  if (currentDept) {
    for (const f of FACULTIES) {
      const d = f.departments.find(dd => dd.id === currentDept);
      if (d) { deptLabel = d.shortName; break; }
    }
  }

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <i className="fas fa-calendar"></i> {deptLabel}
        </h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => goBack()}>
          <i className="fas fa-arrow-left"></i> All Departments
        </button>
      </div>

      {onboardData && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-qsis/30 bg-qsis/5 text-[0.8rem]">
          <i className="fas fa-filter text-qsis flex-shrink-0"></i>
          <span className="text-dark-text2">
            {isMySemesterOnly ? (
              <>Showing only <strong className="text-dark-text">{onboardData.semester}</strong> files.</>
            ) : (
              <>Showing all semesters, <strong className="text-dark-text">{onboardData.semester}</strong> prioritized.</>
            )}
          </span>
          <button
            onClick={() => { clearOnboarding(); window.location.reload(); }}
            className="ml-auto px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/30 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/20 transition-colors flex-shrink-0"
          >
            <i className="fas fa-edit mr-1"></i> Edit Personalize
          </button>
        </div>
      )}

      {personalizedSemesters.length === 0 && (
        <div className="text-center py-8 text-dark-text2">
          <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
          <p>No semesters match your search.</p>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {personalizedSemesters.map((sem, idx) => {
          const isRelated = sem.isRelated;
          const isSources = sem.id === config.relatedSourcesFolder;
          const isSpecial = isRelated || isSources;
          return (
            <div key={sem.id} className={`flex items-center gap-4 p-[18px_20px] ${isSpecial ? 'bg-gradient-to-r from-dark-bg2 to-accent/5 border-accent/30' : 'bg-dark-bg2 border-dark-border'} border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:translate-x-1 transition-all ${!isSpecial && idx === 0 && userSemesterId === sem.id && !isMySemesterOnly ? 'border-qsis/40 ring-1 ring-qsis/20' : ''}`} onClick={() => navigateToSemester(sem.id)}>
              <div className={`w-12 h-12 rounded-xl ${isSpecial ? 'bg-gradient-to-br from-accent to-qsis' : 'bg-gradient-to-br from-qsis to-accent'} flex items-center justify-center text-white text-[1.2rem] flex-shrink-0`}>
                <i className={`fas ${isSources ? 'fa-link' : isRelated ? 'fa-book-open' : 'fa-book'}`}></i>
              </div>
              <div className="flex-1">
                <div className="text-[1.05rem] font-bold flex items-center gap-2">
                  {sem.label}
                  {!isSpecial && idx === 0 && userSemesterId === sem.id && !isMySemesterOnly && (
                    <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">Your Semester</span>
                  )}
                </div>
                {isSpecial && (
                  <div className="text-[0.75rem] text-dark-text2">
                    {isSources ? 'Cross-faculty shared resources' : 'Cross-semester & Shariah resources'}
                  </div>
                )}
              </div>
              <div className="text-[0.8rem] text-dark-text2">{sem.courses} {isSources ? 'resources' : 'courses'} &middot; {sem.files} files</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
