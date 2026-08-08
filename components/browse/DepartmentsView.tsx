'use client';

import { FACULTIES } from '@/lib/departments';

interface DepartmentsViewProps {
  departments: any[];
  onboardData: any;
  userDeptId: string | null;
  clearOnboarding: () => void;
  navigateToDepartment: (id: string) => void;
}

export default function DepartmentsView({ departments, onboardData, userDeptId, clearOnboarding, navigateToDepartment }: DepartmentsViewProps) {
  let visibleDepts = departments;
  if (onboardData?.fileView === 'my-semester-only' && userDeptId) {
    visibleDepts = departments.filter(d => d.id === userDeptId);
  }

  const sortedDepts = (() => {
    if (!userDeptId || onboardData?.fileView === 'my-semester-only') return visibleDepts;
    const userFacultyId = FACULTIES.find(f => f.departments.some(d => d.id === userDeptId))?.id;
    if (!userFacultyId) return visibleDepts;
    return [...visibleDepts].sort((a, b) => {
      if (a.id === userDeptId) return -1;
      if (b.id === userDeptId) return 1;
      const aFacIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === a.id));
      const bFacIdx = FACULTIES.findIndex(f => f.departments.some(d => d.id === b.id));
      if (aFacIdx !== bFacIdx) return aFacIdx - bFacIdx;
      const aFac = FACULTIES[aFacIdx];
      const bFac = FACULTIES[bFacIdx];
      const aDeptIdx = aFac?.departments.findIndex(d => d.id === a.id) ?? 0;
      const bDeptIdx = bFac?.departments.findIndex(d => d.id === b.id) ?? 0;
      return aDeptIdx - bDeptIdx;
    });
  })();

  const facultiesToShow = onboardData?.fileView === 'all-prioritized' && userDeptId
    ? [...FACULTIES].sort((a, b) => {
        if (a.departments.some(d => d.id === userDeptId)) return -1;
        if (b.departments.some(d => d.id === userDeptId)) return 1;
        return 0;
      })
    : FACULTIES;

  if (sortedDepts.length === 0) {
    return (
      <div className="text-center py-8 text-dark-text2">
        <i className="fas fa-folder-open text-3xl mb-3 block opacity-40"></i>
        <p>No departments have files yet.</p>
      </div>
    );
  }

  return (
    <section className="mb-5">
      {onboardData && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-qsis/30 bg-qsis/5 text-[0.8rem]">
          <i className="fas fa-user-cog text-qsis flex-shrink-0"></i>
          <span className="text-dark-text2">
            Viewing as <strong className="text-dark-text">{onboardData.department?.split(' ').slice(0, 3).join(' ')}</strong> &middot; <strong className="text-dark-text">{onboardData.semester}</strong>
            {onboardData.fileView === 'my-semester-only' ? ' (My Semester Only)' : ' (All Prioritized)'}
          </span>
          <button
            onClick={() => { clearOnboarding(); window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }}
            className="ml-auto px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/30 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/20 transition-colors flex-shrink-0"
          >
            <i className="fas fa-edit mr-1"></i> Edit Personalize
          </button>
        </div>
      )}

      {facultiesToShow.map(faculty => {
        const facDepts = sortedDepts.filter(d => {
          const fac = FACULTIES.find(f => f.id === faculty.id);
          return fac?.departments.some(dd => dd.id === d.id);
        });
        if (facDepts.length === 0) return null;
        const isUserFaculty = userDeptId && facDepts.some(d => d.id === userDeptId);
        return (
          <div key={faculty.id} className="mb-5 last:mb-0">
            <div className="flex items-center gap-3 mb-2.5 pb-2 border-b border-dark-border/50">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-qsis/80 to-accent/80 flex items-center justify-center text-white text-[0.7rem] font-bold flex-shrink-0">
                <i className="fas fa-graduation-cap"></i>
              </div>
              <div>
                <div className="text-[0.95rem] font-bold text-dark-text">{faculty.name}</div>
                <div className="text-[0.65rem] text-dark-text3">{faculty.shortName} &middot; {facDepts.length} departments</div>
              </div>
              {isUserFaculty && (
                <span className="ml-auto text-[0.65rem] px-2 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">Your Faculty</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {facDepts.map((dept) => {
                const isUserDept = dept.id === userDeptId;
                return (
                  <div key={dept.id} className={`flex items-center gap-4 p-[18px_20px] bg-dark-bg2 border rounded-xl cursor-pointer hover:border-qsis hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:translate-x-1 transition-all ${isUserDept ? 'border-qsis/40 ring-1 ring-qsis/20' : 'border-dark-border'}`} onClick={() => navigateToDepartment(dept.id)}>
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-qsis to-accent flex items-center justify-center text-white text-[1rem] flex-shrink-0">
                      <i className={`fas ${dept.icon || 'fa-building'}`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[0.95rem] font-bold truncate flex items-center gap-2">
                        {dept.shortName}
                        {isUserDept && <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-qsis/15 text-qsis font-semibold">You</span>}
                      </div>
                      <div className="text-[0.7rem] text-dark-text2 truncate">{dept.name}</div>
                    </div>
                    <div className="text-[0.78rem] text-dark-text2 text-right flex-shrink-0">{dept.files} files</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
