'use client';

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';

interface CoursesViewProps {
  semesterCourses: any[];
  filteredCourses: any[];
  coursePerms: { canAdd: boolean; canEdit: boolean; canDelete: boolean; canEditLinks: boolean };
  navigateToCourse: (code: string, title: string) => void;
  goBack: () => void;
  setShowAddCourse: (v: boolean) => void;
  dbCourses: { id: string; department: string; semester: string; code: string; title: string; addedBy: string | null }[];
  userEmail: string;
  currentDept: string | null;
  currentSem: string | null;
  userDeptId?: string | null;
  isOwner?: boolean;
}

export default function CoursesView({
  semesterCourses, filteredCourses, coursePerms,
  navigateToCourse, goBack,
  setShowAddCourse,
  dbCourses, userEmail, currentDept, currentSem,
  userDeptId = null, isOwner = false,
}: CoursesViewProps) {
  const { data: session } = useSession();
  const loadTree = useAppStore(s => s.loadTree);
  const invalidateCoursesCache = useAppStore(s => s.invalidateCoursesCache);
  const storeGithubToken = useAppStore(s => s.githubToken);
  const profile = useAppStore(s => s.profile);

  const personalToken = storeGithubToken || (profile as any)?.githubToken || '';

  const myEmail = userEmail.toLowerCase();

  const addedByMap = useMemo(() => {
    const map: Record<string, { addedBy: string; id: string; dbTitle: string } | undefined> = {};
    for (const c of dbCourses) {
      map[c.code.toUpperCase()] = { addedBy: c.addedBy || '', id: c.id, dbTitle: c.title };
    }
    return map;
  }, [dbCourses]);

  const [editTarget, setEditTarget] = useState<{ code: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{ code: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  async function handleEdit() {
    if (!editTarget || !editTitle.trim()) return;
    setEditLoading(true);
    setEditError('');
    try {
      const res = await fetch('/api/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editTarget.code,
          semester: currentSem,
          department: currentDept,
          title: editTitle.trim(),
          githubToken: personalToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setEditTarget(null);
      setEditTitle('');
      invalidateCoursesCache();
      await useAppStore.getState().loadCourses();
      useAppStore.getState().invalidateTreeCache();
      await loadTree();
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/courses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: deleteTarget.code, semester: currentSem, department: currentDept, title: deleteTarget.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDeleteTarget(null);
      if (data.pendingApproval) {
        alert('Delete request sent to admins for approval. The course will be removed once an admin confirms it.');
        return;
      }
      invalidateCoursesCache();
      await useAppStore.getState().loadCourses();
      useAppStore.getState().invalidateTreeCache();
      await loadTree();
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[1.05rem] font-semibold flex items-center gap-2">
          <i className="fas fa-book"></i> Courses
        </h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={goBack}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>
      {semesterCourses.length === 0 && (
        <div className="text-center py-12">
          <i className="fas fa-book-open text-4xl mb-4 block text-qsis opacity-40"></i>
          <p className="text-dark-text font-semibold text-sm mb-1">No courses added yet for this semester.</p>
          <p className="text-dark-text3 text-xs mb-4">Be the first to add a course code and title.</p>
          {session && coursePerms.canAdd && (
            <button onClick={() => {
              setShowAddCourse(true);
            }} className="px-5 py-2.5 bg-qsis text-white rounded-xl text-xs font-semibold hover:bg-qsis/90 transition-colors">
              <i className="fas fa-plus mr-1.5"></i>Add Course
            </button>
          )}
        </div>
      )}
      {semesterCourses.length > 0 && filteredCourses.length === 0 && (
        <div className="text-center py-8 text-dark-text2">
          <i className="fas fa-search text-3xl mb-3 block opacity-40"></i>
          <p>No courses match your search.</p>
        </div>
      )}
      <div className="flex flex-col gap-2.5">
        {filteredCourses.map(course => {
          const dbInfo = addedByMap[course.code.toUpperCase()];
          const addedBy = dbInfo?.addedBy || '';
          const isMyCourse = addedBy.toLowerCase() === myEmail;
          const canEditThis = isMyCourse || coursePerms.canEdit;
          const canDeleteThis = isMyCourse || coursePerms.canDelete;
          const inMyDept = isOwner || (!!userDeptId && currentDept === userDeptId);
          const showMenu = canEditThis && inMyDept;

          return (
          <div key={course.code} className="p-[14px_18px] bg-dark-bg2 border border-dark-border rounded-xl hover:border-qsis hover:shadow-[0_0_12px_rgba(34,197,94,0.3)] transition-all group">
            <div className="flex items-center gap-3.5">
              <div className="text-[1.3rem] text-qsis flex-shrink-0 cursor-pointer" onClick={() => navigateToCourse(course.code, course.title)}><i className="fas fa-book-open"></i></div>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigateToCourse(course.code, course.title)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[0.95rem]">{course.code} — {course.title}</span>
                  {isMyCourse && <span className="text-[0.6rem] px-1.5 py-[1px] rounded-full bg-qsis/15 text-qsis border border-qsis/30 font-semibold">You</span>}
                  {!isMyCourse && addedBy && <span className="text-[0.6rem] px-1.5 py-[1px] rounded-full bg-dark-bg3 text-dark-text3 border border-dark-border" title={`Added by ${addedBy}`}><i className="fas fa-user-circle mr-0.5"></i>{addedBy.split('@')[0]}</span>}
                </div>
                <div className="flex gap-2 mt-[5px] flex-wrap">
                  {course.categories.map((cat: any) => (
                    <span key={cat.key} className={`text-[0.68rem] px-2 py-[2px] rounded-full border ${(cat as any).hasLinks ? 'bg-pink-500/15 text-pink-400 border-pink-500/40 font-semibold' : (cat as any).hasMd ? 'bg-blue-500/15 text-blue-400 border-blue-500/40 font-semibold' : 'bg-dark-bg3 text-dark-text2 border-dark-border'}`}>
                      {cat.label}: {cat.count}
                      {(cat as any).hasLinks && <i className="fas fa-link ml-1 text-[0.55rem]"></i>}
                      {!(cat as any).hasLinks && (cat as any).hasMd && <i className="fas fa-file-alt ml-1 text-[0.55rem]"></i>}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0 cursor-pointer" onClick={() => navigateToCourse(course.code, course.title)}>
                <div className="text-[0.75rem] text-dark-text2 flex items-center gap-1.5 justify-end">
                  {(course as any).hasSharedLinks && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 text-[0.6rem] font-bold border border-pink-500/30"><i className="fas fa-link text-[0.55rem]"></i>Links</span>}
                  {(course as any).hasMd && !(course as any).hasSharedLinks && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.6rem] font-bold border border-blue-500/30"><i className="fas fa-file-alt text-[0.55rem]"></i>.md</span>}
                  {course.totalFiles} files
                </div>
                {course.hasMidFinal && (
                  <div className="flex gap-1 mt-1 justify-end">
                    <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-yellow-400/15 text-yellow-400">Mid Term</span>
                    <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-green-400/15 text-green-400">Final Term</span>
                  </div>
                )}
              </div>
              {showMenu && (
                <div className="relative flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === course.code ? null : course.code); }}
                    className="w-8 h-8 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text2 hover:text-dark-text hover:border-qsis/40 flex items-center justify-center cursor-pointer transition-colors" title="Course actions">
                    <i className="fas fa-ellipsis-v text-sm"></i>
                  </button>
                  {openMenu === course.code && (
                    <>
                      <div className="fixed inset-0 z-[210]" onClick={(e) => { e.stopPropagation(); setOpenMenu(null); }} />
                      <div className="absolute right-0 top-9 z-[220] w-44 rounded-xl border border-dark-border bg-dark-bg3 shadow-2xl overflow-hidden">
                        {canEditThis && (
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setEditTarget({ code: course.code, title: course.title }); setEditTitle(course.title); setEditError(''); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-[0.78rem] text-dark-text hover:bg-dark-bg2 cursor-pointer border-none text-left">
                            <i className="fas fa-pen text-blue-400 w-4 text-center"></i> Rename course
                          </button>
                        )}
                        {canDeleteThis && (
                          <button onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setDeleteTarget({ code: course.code, title: course.title }); setDeleteError(''); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-[0.78rem] text-red-400 hover:bg-red-500/10 cursor-pointer border-none text-left">
                            <i className="fas fa-trash w-4 text-center"></i> Delete course
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {session && coursePerms.canAdd && (
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setShowAddCourse(true);
            }}
            className="px-5 py-2.5 bg-qsis text-white rounded-xl text-xs font-semibold hover:bg-qsis/90 transition-colors"
          >
            <i className="fas fa-plus mr-1.5"></i>Add Course
          </button>
        </div>
      )}

      {editTarget && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-dark-text mb-1"><i className="fas fa-edit text-blue-400 mr-2"></i>Rename Course</h3>
            <p className="text-dark-text3 text-[0.72rem] mb-2">Editing <span className="font-mono text-qsis">{editTarget.code}</span> — this renames the GitHub folder too.</p>
            <p className="text-dark-text3 text-[0.68rem] mb-3"><i className="fas fa-info-circle mr-1 text-qsis"></i>Our bot renames the folder and all files inside it automatically.</p>
            {editError && <p className="text-red-400 text-[0.72rem] mb-2">{editError}</p>}
            <input type="text" placeholder="New course title" value={editTitle} onChange={e => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis mb-3" />
            <div className="flex gap-2">
              <button onClick={handleEdit} disabled={editLoading || !editTitle.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {editLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-check mr-1"></i>Save</>}
              </button>
              <button onClick={() => setEditTarget(null)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-red-400 mb-2"><i className="fas fa-trash mr-2"></i>Delete Course</h3>
            <p className="text-dark-text2 text-[0.82rem] mb-1">Are you sure you want to delete:</p>
            <p className="font-mono text-qsis text-sm font-bold mb-3">{deleteTarget.code} — {deleteTarget.title}</p>
            {deleteError && <p className="text-red-400 text-[0.72rem] mb-2">{deleteError}</p>}
            <p className="text-red-400 text-[0.72rem] mb-3"><i className="fas fa-exclamation-triangle mr-1"></i>{coursePerms.canDelete ? 'This will permanently delete the course folder from GitHub and the database.' : 'This will send a delete request to the admins for approval. The course will be removed once an admin confirms it.'}</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {deleteLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Deleting...</> : <><i className="fas fa-trash mr-1"></i>Delete</>}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
