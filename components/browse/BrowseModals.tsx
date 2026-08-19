'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import MoveModal from '@/components/MoveModal';
import RenameModal from '@/components/RenameModal';
import { CreateCourseModal, type CreateCourseResult } from '@/components/upload';

interface BrowseModalsProps {
  moveTarget: { path: string; name: string; mode: 'move' | 'copy' } | null;
  setMoveTarget: (v: { path: string; name: string; mode: 'move' | 'copy' } | null) => void;
  renameTarget: { path: string; name: string } | null;
  setRenameTarget: (v: { path: string; name: string } | null) => void;
  deleteConfirm: { path: string; name: string } | null;
  setDeleteConfirm: (v: { path: string; name: string } | null) => void;
  showAddCourse: boolean;
  setShowAddCourse: (v: boolean) => void;
  currentDept: string | null;
  currentSem: string | null;
  onAddCourse: (code: string, title: string) => Promise<CreateCourseResult>;
  permissionDenied: { show: boolean; message: string; contact: string };
  setPermissionDenied: (v: { show: boolean; message: string; contact: string }) => void;
  handleFileAction: (action: string, from: string, to?: string, newName?: string) => Promise<any>;
  canDeleteFile?: boolean;
}

export default function BrowseModals({
  moveTarget, setMoveTarget,
  renameTarget, setRenameTarget,
  deleteConfirm, setDeleteConfirm,
  showAddCourse, setShowAddCourse,
  currentDept, currentSem,
  onAddCourse,
  permissionDenied, setPermissionDenied,
  handleFileAction,
  canDeleteFile = false,
}: BrowseModalsProps) {
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);

  const knownCourses = useMemo(() => {
    if (!currentSem || !currentDept) return [];
    return getSemesterCourses(currentSem, currentDept).map(c => ({ code: c.code, title: c.title }));
  }, [getSemesterCourses, currentSem, currentDept]);

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
              <p className="text-[0.82rem] text-dark-text2 mb-1">{canDeleteFile ? 'This will permanently delete:' : 'This will send a delete request for:'}</p>
              <p className="text-[0.78rem] text-dark-text font-mono bg-dark-bg rounded-lg px-3 py-2 border border-dark-border truncate">{deleteConfirm.name}</p>
              <p className="text-[0.72rem] text-red-400 mt-3"><i className="fas fa-exclamation-triangle mr-1"></i>{canDeleteFile ? 'This action cannot be undone.' : 'An admin will need to approve this deletion.'}</p>
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
                <i className="fas fa-trash mr-1.5"></i>{canDeleteFile ? 'Delete' : 'Request Delete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Course Modal — shared reusable modal */}
      {showAddCourse && (
        <CreateCourseModal
          open
          department={currentDept || ''}
          semester={currentSem || ''}
          knownCourses={knownCourses}
          onSubmit={onAddCourse}
          onClose={() => setShowAddCourse(false)}
        />
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
