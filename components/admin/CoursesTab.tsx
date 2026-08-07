'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';
import { CreateCourseModal, type CreateCourseResult } from '@/components/upload';

export default function CoursesTab({ effectiveRole, profile }: { effectiveRole: string; profile: any }) {
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);
  const loadTree = useAppStore(s => s.loadTree);
  const tree = useAppStore(s => s.tree); // subscribe to tree so component re-renders after loadTree
  const session = useAppStore(s => s.profile);
  const [selectedDept, setSelectedDept] = useState(profile?.department || 'qsis');
  const [selectedSem, setSelectedSem] = useState('1st-semister');
  const [showAdd, setShowAdd] = useState(false);
  const [editCourse, setEditCourse] = useState<{ code: string; title: string } | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteCourse, setDeleteCourse] = useState<{ code: string; title: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [canAdd, setCanAdd] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [dbCourses, setDbCourses] = useState<any[]>([]);
  const [showMyCourses, setShowMyCourses] = useState(false);
  const [deleteRequests, setDeleteRequests] = useState<any[]>([]);
  const [handlingRequest, setHandlingRequest] = useState<string | null>(null);

  const courses = getSemesterCourses(selectedSem, selectedDept);
  const myEmail = (profile?.email || '').toLowerCase();

  // Build a map of code -> addedBy from DB courses
  const addedByMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of dbCourses) {
      if (c.addedBy) map[c.code.toUpperCase()] = c.addedBy;
    }
    return map;
  }, [dbCourses]);

  // Filter courses if "My courses" is toggled
  const filteredCourses = useMemo(() => {
    if (!showMyCourses) return courses;
    return courses.filter(c => {
      const addedBy = addedByMap[c.code.toUpperCase()];
      return addedBy?.toLowerCase() === myEmail;
    });
  }, [courses, showMyCourses, addedByMap, myEmail]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/permissions');
        const data = await res.json();
        if (!data.success) return;
        const perms = data.permissions || {};
        const isCR = profile?.isCR || false;
        const roleKey = isCR ? 'cr' : effectiveRole;
        const customPerms = (profile as any).customPermissions || {};
        const perUserKey = (action: string) => `${action}_users`;
        const check = (action: string) => {
          if (customPerms[action] === true) return true;
          const allowedUsers = perms[perUserKey(action)] || [];
          if (allowedUsers.includes((profile?.email || '').toLowerCase())) return true;
          const allowedRoles = perms[action] || [];
          return allowedRoles.includes(roleKey);
        };
        setCanAdd(check('addCourse'));
        setCanEdit(check('editCourse'));
        setCanDelete(check('deleteCourse'));
      } catch {}
    })();
  }, [effectiveRole, profile]);

  // Fetch DB courses for addedBy info
  useEffect(() => {
    if (!selectedDept || !selectedSem) return;
    fetch(`/api/courses?department=${selectedDept}&semester=${selectedSem}`)
      .then(r => r.json())
      .then(data => setDbCourses(data.courses || []))
      .catch(() => {});
  }, [selectedDept, selectedSem, tree]);

  // Fetch pending course-delete requests (regular users deleting their own uploads)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/courses/delete-requests');
        const data = await res.json();
        if (data.success) setDeleteRequests(data.requests || []);
      } catch {}
    })();
  }, [tree]);

  async function handleDeleteRequest(id: string, action: 'approve' | 'reject') {
    setHandlingRequest(id);
    try {
      const res = await fetch('/api/courses/delete-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDeleteRequests(prev => prev.filter(r => r.id !== id));
      useAppStore.getState().invalidateTreeCache();
      await loadTree();
    } catch (e: any) {
      alert(e.message);
      await fetch('/api/courses/delete-requests').then(r => r.json()).then(d => { if (d.success) setDeleteRequests(d.requests || []); }).catch(() => {});
    } finally {
      setHandlingRequest(null);
    }
  }

  async function handleAddCourse(code: string, title: string): Promise<CreateCourseResult> {
    try {
      const res = await useAppStore.getState().addCourse(selectedDept, selectedSem, code, title);
      if (!res.success) return { success: false, error: res.error || 'Failed to create course' };
      setShowAdd(false);
      useAppStore.getState().invalidateTreeCache();
      await loadTree();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to create course' };
    }
  }

  async function handleEdit() {
    if (!editCourse || !editTitle.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editCourse.code, semester: selectedSem, department: selectedDept, title: editTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setEditCourse(null); setEditTitle('');
      useAppStore.getState().invalidateTreeCache();
      await loadTree();
    } catch (e: any) { alert(e.message); }
    finally { setEditLoading(false); }
  }

  async function handleDelete() {
    if (!deleteCourse) return;
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: deleteCourse.code, semester: selectedSem, department: selectedDept, title: deleteCourse.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.pendingApproval) {
        alert('Delete request sent to admins for approval.');
      }
      setDeleteCourse(null);
      useAppStore.getState().invalidateTreeCache();
      await loadTree();
    } catch (e: any) { alert(e.message); }
    finally { setDeleteLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-dark-text"><i className="fas fa-book text-indigo-400 mr-2"></i>Courses (from GitHub)</h3>
        {canAdd && (
          <button onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 flex items-center gap-1.5">
            <i className="fas fa-plus"></i> Add Course
          </button>
        )}
      </div>
      <p className="text-dark-text3 text-xs mb-3">Manage courses for each department and semester.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <CustomSelect value={selectedDept} onChange={setSelectedDept} placeholder="Department..."
          options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: f.shortName })))} />
        <CustomSelect value={selectedSem} onChange={setSelectedSem} placeholder="Semester..."
          options={config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' }))} />
        <button onClick={() => setShowMyCourses(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-[0.72rem] font-semibold border cursor-pointer transition-colors ${showMyCourses ? 'bg-qsis text-white border-qsis' : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:border-qsis/30'}`}>
          <i className={`fas fa-user ${showMyCourses ? 'mr-1' : 'mr-1'}`}></i>My Courses
        </button>
      </div>

      {/* Pending delete requests (regular users deleting their own uploads) */}
      {canDelete && deleteRequests.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
            <i className="fas fa-clock text-amber-400"></i>
            <h4 className="text-[0.78rem] font-semibold text-amber-300">Pending Delete Requests ({deleteRequests.length})</h4>
          </div>
          <div className="divide-y divide-dark-border/60">
            {deleteRequests.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[0.8rem] text-dark-text truncate">
                    <span className="font-mono font-bold text-amber-300">{r.details.code || '?'}</span>
                    {r.details.title ? ` — ${r.details.title}` : ''}
                  </p>
                  <p className="text-[0.65rem] text-dark-text3 truncate">
                    {r.details.department}/{r.details.semester} · requested by {r.userName || r.userId || '?'} · {r.details.folderPath || ''}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => handleDeleteRequest(r.id, 'approve')} disabled={handlingRequest === r.id}
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[0.7rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                    {handlingRequest === r.id ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-trash mr-1"></i>Approve Delete</>}
                  </button>
                  <button onClick={() => handleDeleteRequest(r.id, 'reject')} disabled={handlingRequest === r.id}
                    className="px-3 py-1.5 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.7rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2 disabled:opacity-50">
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Course Modal — shared reusable modal */}
      {showAdd && (
        <CreateCourseModal
          open
          department={selectedDept}
          semester={selectedSem}
          knownCourses={courses.map(c => ({ code: c.code, title: c.title }))}
          onSubmit={handleAddCourse}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Edit Course Modal — portal to body */}
      {editCourse && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setEditCourse(null)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-dark-text mb-1"><i className="fas fa-edit text-blue-400 mr-2"></i>Edit Course</h3>
            <p className="text-dark-text3 text-[0.72rem] mb-3">Editing <span className="font-mono text-qsis">{editCourse.code}</span></p>
            <input type="text" placeholder="New course title" value={editTitle} onChange={e => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis mb-3" />
            <div className="flex gap-2">
              <button onClick={handleEdit} disabled={editLoading || !editTitle.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {editLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-check mr-1"></i>Save</>}
              </button>
              <button onClick={() => setEditCourse(null)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Course Modal — portal to body */}
      {deleteCourse && createPortal(
        <div className="fixed inset-0 z-[250] bg-black/60 flex items-center justify-center p-4" onClick={() => setDeleteCourse(null)}>
          <div className="bg-dark-bg2 w-full max-w-sm rounded-2xl border border-dark-border p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-red-400 mb-2"><i className="fas fa-trash mr-2"></i>Delete Course</h3>
            <p className="text-dark-text2 text-[0.82rem] mb-1">Are you sure you want to delete:</p>
            <p className="font-mono text-qsis text-sm font-bold mb-3">{deleteCourse.code} — {deleteCourse.title}</p>
            <p className="text-red-400 text-[0.72rem] mb-3"><i className="fas fa-exclamation-triangle mr-1"></i>This will permanently delete the course folder from GitHub and the database.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                {deleteLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Deleting...</> : <><i className="fas fa-trash mr-1"></i>Delete</>}
              </button>
              <button onClick={() => setDeleteCourse(null)} className="flex-1 py-2 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.82rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2">Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="space-y-2">
        {filteredCourses.length === 0 && <p className="text-dark-text3 text-sm text-center py-6">No courses found for {selectedDept}/{selectedSem}{showMyCourses ? ' (my courses)' : ''}.</p>}
        {filteredCourses.map(c => {
          const addedBy = addedByMap[c.code.toUpperCase()];
          const isMyCourse = addedBy?.toLowerCase() === myEmail;
          const canDeleteThis = isMyCourse || ['admin', 'manager', 'teacher'].includes(effectiveRole) || profile?.isCR;
          return (
          <div key={c.code} className="flex items-center gap-3 px-4 py-3 bg-dark-bg2 border border-dark-border rounded-xl hover:border-qsis/30 transition-colors group">
            <span className="text-qsis font-mono text-xs font-bold min-w-[80px]">{c.code}</span>
            <span className="flex-1 text-dark-text text-xs">{c.title}</span>
            {addedBy && (
              <span className={`text-[0.65rem] px-1.5 py-0.5 rounded-full ${isMyCourse ? 'bg-qsis/10 text-qsis' : 'bg-dark-bg3 text-dark-text3'}`} title={`Added by ${addedBy}`}>
                <i className="fas fa-user-circle mr-0.5"></i>{isMyCourse ? 'You' : addedBy.split('@')[0]}
              </span>
            )}
            <span className="text-dark-text3 text-xs">{c.totalFiles} files</span>
            <div className="flex gap-1">
              {c.categories.map(cat => (
                <span key={cat.key} className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-dark-bg3 text-dark-text3" title={`${cat.label}: ${cat.count}`}>
                  <i className={`fas fa-${cat.icon} mr-0.5`}></i>{cat.count}
                </span>
              ))}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button onClick={() => { setEditCourse({ code: c.code, title: c.title }); setEditTitle(c.title); }}
                  className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 border-none cursor-pointer flex items-center justify-center text-[0.7rem] hover:bg-blue-500/20" title="Edit title">
                  <i className="fas fa-pen"></i>
                </button>
              )}
              {canDelete && canDeleteThis && (
                <button onClick={() => setDeleteCourse({ code: c.code, title: c.title })}
                  className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.7rem] hover:bg-red-500/20" title="Delete course">
                  <i className="fas fa-trash"></i>
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
