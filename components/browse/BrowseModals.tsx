'use client';

import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import MoveModal from '@/components/MoveModal';
import RenameModal from '@/components/RenameModal';

interface BrowseModalsProps {
  moveTarget: { path: string; name: string; mode: 'move' | 'copy' } | null;
  setMoveTarget: (v: { path: string; name: string; mode: 'move' | 'copy' } | null) => void;
  renameTarget: { path: string; name: string } | null;
  setRenameTarget: (v: { path: string; name: string } | null) => void;
  deleteConfirm: { path: string; name: string } | null;
  setDeleteConfirm: (v: { path: string; name: string } | null) => void;
  showAddCourse: boolean;
  setShowAddCourse: (v: boolean) => void;
  addCourseCode: string;
  setAddCourseCode: (v: string) => void;
  addCourseTitle: string;
  setAddCourseTitle: (v: string) => void;
  addCourseError: string;
  setAddCourseError: (v: string) => void;
  addCourseSuccess: string;
  setAddCourseSuccess: (v: string) => void;
  addCourseLoading: boolean;
  setAddCourseLoading: (v: boolean) => void;
  currentDept: string | null;
  currentSem: string | null;
  permissionDenied: { show: boolean; message: string; contact: string };
  setPermissionDenied: (v: { show: boolean; message: string; contact: string }) => void;
  handleFileAction: (action: string, from: string, to?: string, newName?: string) => Promise<any>;
}

export default function BrowseModals({
  moveTarget, setMoveTarget,
  renameTarget, setRenameTarget,
  deleteConfirm, setDeleteConfirm,
  showAddCourse, setShowAddCourse,
  addCourseCode, setAddCourseCode,
  addCourseTitle, setAddCourseTitle,
  addCourseError, setAddCourseError,
  addCourseSuccess, setAddCourseSuccess,
  addCourseLoading, setAddCourseLoading,
  currentDept, currentSem,
  permissionDenied, setPermissionDenied,
  handleFileAction,
}: BrowseModalsProps) {
  const { data: session } = useSession();
  const loadTree = useAppStore(s => s.loadTree);

  return (
    <>
      {/* Move/Copy Modal */}
      {moveTarget && (
        <MoveModal
          isOpen={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          sourcePath={moveTarget.path}
          sourceName={moveTarget.name}
          mode={moveTarget.mode}
          onAction={async (from, to, newName) => {
            await handleFileAction(moveTarget.mode, from, to, newName);
          }}
        />
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <RenameModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          filePath={renameTarget.path}
          currentName={renameTarget.name}
          onRename={async (from, newName) => {
            await handleFileAction('rename', from, undefined, newName);
          }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setDeleteConfirm(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-dark-bg2 border border-red-500/30 rounded-2xl shadow-2xl w-[380px] p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-trash text-red-400 text-xl"></i>
              </div>
              <h3 className="font-semibold text-[1rem] mb-2">Delete File?</h3>
              <p className="text-[0.82rem] text-dark-text2 mb-1">This will permanently delete:</p>
              <p className="text-[0.78rem] text-dark-text font-mono bg-dark-bg rounded-lg px-3 py-2 border border-dark-border truncate">{deleteConfirm.name}</p>
              <p className="text-[0.72rem] text-red-400 mt-3"><i className="fas fa-exclamation-triangle mr-1"></i>This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await handleFileAction('delete', deleteConfirm.path);
                    setDeleteConfirm(null);
                  } catch {}
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[0.82rem] font-semibold hover:bg-red-500/90 transition-colors"
              >
                <i className="fas fa-trash mr-1.5"></i>Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Course Modal */}
      {showAddCourse && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setShowAddCourse(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-dark-bg2 border border-dark-border rounded-2xl shadow-2xl w-[400px] max-w-[95vw] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[1rem] flex items-center gap-2">
                <i className="fas fa-book-medical text-qsis"></i> Add Course
              </h3>
              <button onClick={() => setShowAddCourse(false)} className="text-dark-text3 hover:text-dark-text text-lg"><i className="fas fa-times"></i></button>
            </div>
            <p className="text-[0.78rem] text-dark-text3 mb-4">
              Add a new course to <span className="text-qsis font-semibold">{currentSem}</span> in <span className="text-qsis font-semibold">{currentDept}</span>.
              <br/>Subfolders (Mid/Final/NOTES/Previous Questions/sheet/Syllabus/Other) will be created automatically on GitHub.
            </p>

            {addCourseError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <i className="fas fa-exclamation-triangle mr-1"></i>{addCourseError}
              </div>
            )}
            {addCourseSuccess && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
                <i className="fas fa-check mr-1"></i>{addCourseSuccess}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[0.75rem] text-dark-text2 font-medium mb-1 block">Course Code *</label>
                <input
                  value={addCourseCode}
                  onChange={e => setAddCourseCode(e.target.value.toUpperCase())}
                  placeholder="e.g. QSM-3602"
                  className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-dark-text text-sm outline-none focus:border-qsis transition-colors"
                />
              </div>
              <div>
                <label className="text-[0.75rem] text-dark-text2 font-medium mb-1 block">Course Title *</label>
                <input
                  value={addCourseTitle}
                  onChange={e => setAddCourseTitle(e.target.value)}
                  placeholder="e.g. Tafsir Bir Rayi"
                  className="w-full px-3 py-2.5 bg-dark-bg border border-dark-border rounded-xl text-dark-text text-sm outline-none focus:border-qsis transition-colors"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddCourse(false)}
                className="flex-1 py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text2 text-[0.82rem] hover:bg-dark-bg3 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!addCourseCode.trim() || !addCourseTitle.trim()) {
                    setAddCourseError('Both course code and title are required.');
                    return;
                  }
                  setAddCourseLoading(true);
                  setAddCourseError('');
                  setAddCourseSuccess('');
                  try {
                    const res = await fetch('/api/courses', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ department: currentDept, semester: currentSem, code: addCourseCode.trim(), title: addCourseTitle.trim() }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setAddCourseSuccess(`Course ${addCourseCode.trim()} created! Folder structure created on GitHub.`);
                      setAddCourseCode('');
                      setAddCourseTitle('');
                      useAppStore.getState().invalidateTreeCache();
                      loadTree();
                      setTimeout(() => { setShowAddCourse(false); setAddCourseSuccess(''); }, 2000);
                    } else {
                      if (res.status === 403) {
                        setPermissionDenied({ show: true, message: data.error || 'You do not have permission to add courses.', contact: 'Please contact your CR, ACR, teacher, manager, or admin for access.' });
                        setShowAddCourse(false);
                      } else {
                        setAddCourseError(data.error || 'Failed to create course');
                      }
                    }
                  } catch {
                    setAddCourseError('Network error. Please try again.');
                  }
                  setAddCourseLoading(false);
                }}
                disabled={addCourseLoading}
                className="flex-1 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:bg-qsis/90 transition-colors disabled:opacity-50"
              >
                {addCourseLoading ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>Creating...</> : <><i className="fas fa-plus mr-1.5"></i>Add Course</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Permission Denied Popup */}
      {permissionDenied.show && (
        <>
          <div className="fixed inset-0 bg-black/60 z-[200]" onClick={() => setPermissionDenied({ show: false, message: '', contact: '' })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[201] bg-dark-bg2 border border-amber-500/30 rounded-2xl shadow-2xl w-[380px] max-w-[95vw] p-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-lock text-amber-400 text-xl"></i>
              </div>
              <h3 className="font-semibold text-[1rem] mb-2">Access Restricted</h3>
              <p className="text-[0.82rem] text-dark-text2 mb-3">{permissionDenied.message}</p>
              <div className="px-4 py-3 bg-dark-bg rounded-xl border border-dark-border mb-4">
                <p className="text-[0.78rem] text-dark-text3">
                  <i className="fas fa-info-circle text-blue-400 mr-1.5"></i>
                  {permissionDenied.contact}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPermissionDenied({ show: false, message: '', contact: '' })}
              className="w-full py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold hover:bg-qsis/90 transition-colors"
            >
              Got it
            </button>
          </div>
        </>
      )}
    </>
  );
}
