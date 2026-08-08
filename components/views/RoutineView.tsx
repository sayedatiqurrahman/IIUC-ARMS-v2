'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import { useConfirm } from '@/components/ConfirmModal';
import type { RoutineItem, ViewMode, AllSemesterDraft } from '@/components/routine/types';
import { SEMESTERS, DEFAULT_PERIODS, DEFAULT_DAYS } from '@/components/routine/types';
import {
  getDefaultSession,
  loadMyRoutines,
  saveMyRoutines,
  loadPublishedRoutines,
  savePublishedRoutines,
  fetchPublishedRoutinesFromDB,
  loadAllSemDraft,
  clearAllSemDraft,
} from '@/components/routine/helpers';
import RoutineCard from '@/components/routine/RoutineCard';
import RoutinePrintView from '@/components/routine/RoutinePrintView';
import RoutinePlainTable from '@/components/routine/RoutinePlainTable';
import TeacherContacts from '@/components/routine/TeacherContacts';
import AllSemesterView from '@/components/routine/AllSemesterView';
import RoutineBuilder from '@/components/routine/RoutineBuilder';

export default function RoutineView() {
  const router = useRouter();
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const loadRoutine = useAppStore(s => s.loadRoutine);
  const profile = useAppStore(s => s.profile);
  const onboardData = useAppStore(s => s.onboardingData);
  const clearOnboarding = useAppStore(s => s.clearOnboarding);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [hasAllSemDraft, setHasAllSemDraft] = useState(false);
  const [allSemDraftData, setAllSemDraftData] = useState<AllSemesterDraft | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('manager');
  const [myRoutines, setMyRoutines] = useState<RoutineItem[]>([]);
  const [publishedRoutines, setPublishedRoutines] = useState<RoutineItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<'themed' | 'plain'>('themed');

  const email = session?.user?.email || profile.email || '';
  const isOwner = config.ownerEmails.includes(email);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [canPublish, setCanPublish] = useState(false);

  useEffect(() => {
    fetch('/api/settings/permissions')
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const perms = data.permissions || {};
        setPermissions(perms);
        const role = config.getEffectiveRole(email, profile.role);
        const roleKey = profile.isCR ? 'cr' : role;
        const customPerms = (profile as any).customPermissions || {};
        const allowed = perms.publishRoutine || ['admin', 'manager', 'teacher', 'cr'];
        setCanPublish(isOwner || customPerms.publishRoutine === true || allowed.includes(roleKey));
      })
      .catch(() => {});
  }, [email, profile.role, profile.isCR, isOwner]);

  const sharedRoutines: RoutineItem[] = Array.isArray(routineData) ? routineData : [];
  const routines = sharedRoutines;

  // Onboarding-based personalization for routines (students only)
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isTeacherPlus = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher';
  const userSemesterLabel = onboardData?.semester || null;
  const userGender = onboardData?.gender || null;
  const isMySemesterOnly = onboardData?.fileView === 'my-semester-only' && userSemesterLabel;

  // Filter routine by user's gender
  const filterByGender = (r: RoutineItem): boolean => {
    if (!userGender) return true;
    if (r.gender === 'both' || r.gender === null) return true;
    return r.gender === userGender;
  };

  const allVisibleRoutines = (() => {
    const all = [...publishedRoutines, ...sharedRoutines].filter(filterByGender);
    // Teachers, managers, and admins see ALL semesters (role-based control)
    if (isTeacherPlus) return all;
    if (!userSemesterLabel) return all;
    if (isMySemesterOnly) {
      return all.filter(r => r.semester === userSemesterLabel);
    }
    // all-prioritized: user's semester routines first
    const userRoutines = all.filter(r => r.semester === userSemesterLabel);
    const otherRoutines = all.filter(r => r.semester !== userSemesterLabel);
    return [...userRoutines, ...otherRoutines];
  })();

  const currentPreview = myRoutines.find(r => r.id === selectedId) || allVisibleRoutines.find(r => r.id === selectedId) || null;

  useEffect(() => {
    setMyRoutines(loadMyRoutines());
    setPublishedRoutines(loadPublishedRoutines());
    const allSemDraft = loadAllSemDraft();
    setHasAllSemDraft(!!allSemDraft);
    setAllSemDraftData(allSemDraft);
    // Load published routines from DB (with auto-cleanup)
    fetchPublishedRoutinesFromDB().then(r => {
      setPublishedRoutines(r);
    });
  }, []);

  useEffect(() => {
    if (routines.length === 0 && !routineLoading) loadRoutine();
  }, [routines.length, routineLoading, loadRoutine]);

  const persistMyRoutines = useCallback((updated: RoutineItem[]) => {
    setMyRoutines(updated);
    saveMyRoutines(updated);
  }, []);

  const handleView = useCallback((id: string) => {
    setSelectedId(id);
    setViewMode('preview');
  }, []);

  const handleEdit = useCallback((id: string) => {
    setEditingId(id);
    setViewMode('builder');
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!await confirm({ message: 'Delete this routine?', danger: true, title: 'Delete Routine' })) return;
    const updated = myRoutines.filter(r => r.id !== id);
    persistMyRoutines(updated);
    showToast('Routine deleted', 'success');
  }, [myRoutines, persistMyRoutines]);

  const handleDuplicate = useCallback((routine: RoutineItem) => {
    const dup: RoutineItem = {
      ...routine,
      id: `my-${Date.now()}`,
      semester: routine.semester + ' (Copy)',
      createdAt: Date.now(),
      published: false,
    };
    persistMyRoutines([...myRoutines, dup]);
    showToast('Routine duplicated', 'success');
  }, [myRoutines, persistMyRoutines]);

  const handlePublish = useCallback(async (routine: RoutineItem) => {
    if (!canPublish) {
      showToast('Permission denied: Only Admin, Manager, or Teacher can publish routines.', 'error');
      return;
    }
    if (!await confirm({ message: `Publish "${routine.semester}" for all users?`, title: 'Publish Routine' })) return;
    const publisherName = session?.user?.name || profile.name || 'Unknown';
    const published = {
      ...routine,
      published: true,
      isDraft: false,
      id: `pub-${Date.now()}`,
      publishedBy: { name: publisherName, email },
      publishedAt: Date.now(),
    };
    const updated = publishedRoutines.filter(r => !(r.semester === routine.semester && r.branch === routine.branch));
    updated.push(published);
    setPublishedRoutines(updated);
    savePublishedRoutines(updated);
    const myUpdated = myRoutines.map(r => r.id === routine.id ? { ...r, isDraft: false } : r);
    persistMyRoutines(myUpdated);

    // Save to DB
    fetch('/api/published-routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routines: [published] }),
    }).catch(() => {});

    showToast('Routine published! All users can now see it.', 'success');
  }, [publishedRoutines, myRoutines, persistMyRoutines, session, profile, canPublish]);

  const handleUnpublish = useCallback((id: string) => {
    const updated = publishedRoutines.filter(r => r.id !== id);
    setPublishedRoutines(updated);
    savePublishedRoutines(updated);
    showToast('Routine unpublished', 'success');
  }, [publishedRoutines]);

  const canEditPublished = useCallback((routine: RoutineItem) => {
    if (isOwner) return true;
    if (routine.publishedBy?.email && routine.publishedBy.email === email) return true;
    return false;
  }, [isOwner, email]);

  const handleEditPublished = useCallback((id: string) => {
    setEditingId(id);
    setViewMode('builder');
  }, []);

  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const el = printRef.current;
      const domtoimage = (await import('dom-to-image-more')).default;

      const exportContainer = document.createElement('div');
      exportContainer.style.cssText = 'position:fixed;left:-9999px;top:0;width:920px;z-index:-1;opacity:0;pointer-events:none;background:#fff;padding:0;margin:0';
      document.body.appendChild(exportContainer);

      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.width = '920px';
      clone.style.minWidth = '920px';
      clone.style.maxWidth = '920px';
      clone.style.margin = '0';
      clone.style.border = '2px solid #166534';
      clone.style.borderRadius = '12px';
      clone.style.overflow = 'hidden';
      exportContainer.appendChild(clone);

      clone.querySelectorAll<HTMLElement>('.routine-course-code').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-course-title').forEach(n => { n.style.whiteSpace = 'normal'; n.style.overflowWrap = 'break-word'; });
      clone.querySelectorAll<HTMLElement>('.routine-course-teacher').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-th').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-time-text').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-time-sub').forEach(n => { n.style.whiteSpace = 'nowrap'; });
      clone.querySelectorAll<HTMLElement>('.routine-period-name').forEach(n => { n.style.whiteSpace = 'nowrap'; });

      const badges = clone.querySelector('.routine-badges') as HTMLElement | null;
      if (badges) { badges.style.flexWrap = 'nowrap'; badges.style.justifyContent = 'center'; }

      const table = clone.querySelector('.routine-table') as HTMLElement | null;
      if (table) {
        table.style.tableLayout = 'fixed';
        table.style.width = '100%';
        const ths = Array.from(table.querySelectorAll<HTMLElement>('.routine-th'));
        const dayCount = ths.length - 1;
        if (dayCount > 0) {
          ths[0].style.width = '110px';
          const dayWidth = `calc((100% - 110px) / ${dayCount})`;
          for (let i = 1; i < ths.length; i++) ths[i].style.width = dayWidth;
        }
      }

      await new Promise(r => setTimeout(r, 200));

      const dataUrl = await domtoimage.toPng(clone, {
        quality: 0.95,
        pixelRatio: 3,
        bgcolor: '#ffffff',
        cacheBust: true,
        width: 920,
        style: { borderRadius: '12px', overflow: 'hidden' },
        filter: (node: HTMLElement) => !node.classList?.contains('no-print'),
      });

      document.body.removeChild(exportContainer);

      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const contentW = pdfW - margin * 2;
        const contentH = pdfH - margin * 2;
        const imgRatio = img.width / img.height;
        const contentRatio = contentW / contentH;

        let drawW: number, drawH: number;
        if (imgRatio > contentRatio) {
          drawW = contentW;
          drawH = contentW / imgRatio;
        } else {
          drawH = contentH;
          drawW = contentH * imgRatio;
        }

        const xOffset = margin + (contentW - drawW) / 2;
        const yOffset = margin + (contentH - drawH) / 2;

        pdf.addImage(dataUrl, 'PNG', xOffset, yOffset, drawW, drawH);
        pdf.save(`QSIS-Routine-${currentPreview?.semester || 'Routine'}.pdf`);
      } else {
        const link = document.createElement('a');
        link.download = `QSIS-Routine-${currentPreview?.semester || 'Routine'}.${format}`;
        link.href = format === 'png' ? dataUrl : dataUrl.replace('image/png', 'image/jpeg');
        link.click();
      }
    } catch (err) { console.error('Export failed:', err); }
    finally { setExporting(false); }
  }, [currentPreview]);

  const handleSaveBuilder = useCallback((routine: RoutineItem) => {
    const isPublishedEdit = editingId && publishedRoutines.some(r => r.id === editingId);
    if (isPublishedEdit) {
      const updated = publishedRoutines.map(r => r.id === editingId ? { ...routine, published: true, isDraft: false, publishedBy: r.publishedBy, publishedAt: r.publishedAt } : r);
      setPublishedRoutines(updated);
      savePublishedRoutines(updated);
      fetch('/api/published-routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routines: updated.filter(r => r.id === editingId) }),
      }).catch(() => {});
    } else {
      let updated: RoutineItem[];
      if (editingId) {
        updated = myRoutines.map(r => r.id === editingId ? routine : r);
      } else {
        updated = [...myRoutines, routine];
      }
      persistMyRoutines(updated);
    }
    setEditingId(null);
    setViewMode('manager');
    showToast(editingId ? 'Routine updated!' : 'Routine created!', 'success');
  }, [myRoutines, editingId, persistMyRoutines, publishedRoutines]);

  const handleCancelBuilder = useCallback(() => {
    setEditingId(null);
    setViewMode('manager');
  }, []);

  if (routineLoading && myRoutines.length === 0) {
    return (
      <section className="mb-5">
        <div className="routine-page-header no-print">
          <div><h3 className="routine-page-title"><i className="fas fa-calendar-alt"></i> Class Routine</h3><p className="routine-page-sub">Manage and view your class schedules</p></div>
        </div>
        <div className="loading-container">
          <div className="book-loader"><div className="book-base"></div><div className="book-spine-loader"></div><div className="book-cover"></div><div className="book-page-stack"><div className="book-page"></div><div className="book-page"></div><div className="book-page"></div></div><div className="page-shadow"></div><div className="page-shadow"></div><div className="page-shadow"></div></div>
          <div className="loading-text">Loading routine<span className="loading-dots"></span></div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5">
      {/* ─── MANAGER VIEW ─── */}
      {viewMode === 'manager' && (
        <>
          <div className="routine-page-header no-print">
            <div>
              <h3 className="routine-page-title"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
              {profile?.department && (
                <p className="routine-page-sub" style={{ color: '#22c55e' }}>
                  <i className="fas fa-building mr-1"></i>{profile.department}
                  {profile.semester && <><span className="mx-1">&bull;</span><i className="fas fa-graduation-cap mr-1"></i>{config.semesters.find(s => s.id === profile.semester)?.label || profile.semester}</>}
                </p>
              )}
              {!profile?.department && (
                <p className="routine-page-sub">Manage and view your class schedules</p>
              )}
            </div>
            <div className="routine-page-actions">
              <button className="routine-btn routine-btn-primary" onClick={() => {
                const draftId = `draft-${Date.now()}`;
                const draft: RoutineItem = {
                  id: draftId,
                  semester: SEMESTERS[0],
                  branch: null,
                  gender: null,
                  session: getDefaultSession(),
                  room: '',
                  academicYear: new Date().getFullYear().toString(),
                  department: 'Department of Qur\'anic Sciences & Islamic Studies',
                  university: 'International Islamic University Chittagong',
                  periods: [...DEFAULT_PERIODS],
                  days: [...DEFAULT_DAYS],
                  courses: [],
                  slots: [],
                  createdAt: Date.now(),
                  isDraft: true,
                };
                persistMyRoutines([...myRoutines, draft]);
                setEditingId(draftId);
                setViewMode('builder');
              }}>
                <i className="fas fa-plus"></i> Create New
              </button>
              {canPublish && (
                <button className="routine-btn routine-btn-accent" onClick={() => setViewMode('allBranch')}>
                  <i className="fas fa-layer-group"></i> All Semester Routine
                </button>
              )}
              <button className="routine-btn routine-btn-ghost" onClick={() => router.push('/')}><i className="fas fa-arrow-left"></i> Back</button>
            </div>
          </div>

          {/* Edit preference banner for my-semester-only */}
          {isMySemesterOnly && onboardData && (
            <div className="mb-4 no-print flex items-center gap-3 px-4 py-3 rounded-xl border border-qsis/30 bg-qsis/5 text-[0.8rem]">
              <i className="fas fa-filter text-qsis flex-shrink-0"></i>
              <span className="text-dark-text2">
                Showing only <strong className="text-dark-text">{onboardData.semester}</strong> routines for <strong className="text-dark-text">{userGender === 'male' ? 'Male' : 'Female'}</strong>.
              </span>
              <button
                onClick={() => { clearOnboarding(); window.history.replaceState({}, '', window.location.pathname); window.location.reload(); }}
                className="ml-auto px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/30 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/20 transition-colors flex-shrink-0"
              >
                <i className="fas fa-edit mr-1"></i> Change Preference
              </button>
            </div>
          )}

          {myRoutines.length === 0 && allVisibleRoutines.length === 0 && !hasAllSemDraft ? (
            <div className="routine-empty-state">
              <div className="routine-empty-icon"><i className="fas fa-calendar-plus"></i></div>
              <h4>No Routines Yet</h4>
              <p>Create your first class routine to get started.</p>
              <button className="routine-btn routine-btn-primary" onClick={() => { setEditingId(null); setViewMode('builder'); }}>
                <i className="fas fa-plus"></i> Create Your First Routine
              </button>
            </div>
          ) : (
            <>
              {hasAllSemDraft && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-layer-group"></i> All Semester Routine Draft</h4>
                  <div className="routine-manager-grid">
                    <div className="routine-card routine-card-draft" style={{ borderStyle: 'dashed' }}>
                      <div className="routine-card-header">
                        <div>
                          <h4 className="routine-card-title">All Semester Routine</h4>
                          <p className="routine-card-meta">{allSemDraftData?.session || 'Untitled'}</p>
                        </div>
                        <span className="routine-card-draft-badge"><i className="fas fa-pen"></i> Draft</span>
                      </div>
                      <div className="routine-card-body">
                        <p className="routine-card-info">
                          <i className="fas fa-layer-group"></i> {allSemDraftData?.semesters?.length || 0} semesters · {allSemDraftData?.draftGender === 'both' ? 'Male & Female' : allSemDraftData?.draftGender === 'male' ? 'Male Only' : 'Female Only'}
                        </p>
                      </div>
                      <div className="routine-card-actions">
                        <button className="routine-card-btn routine-card-btn-view" onClick={() => setViewMode('allBranch')}>
                          <i className="fas fa-edit"></i> Continue Editing
                        </button>
                        <button className="routine-card-btn routine-card-btn-delete" onClick={async () => {
                          if (await confirm({ message: 'Delete all-semester draft?', danger: true, title: 'Delete Draft' })) {
                            clearAllSemDraft();
                            setHasAllSemDraft(false);
                            setAllSemDraftData(null);
                            showToast('Draft deleted', 'success');
                          }
                        }}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {myRoutines.length > 0 && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-user-edit"></i> My Routines</h4>
                  <div className="routine-manager-grid">
                    {myRoutines.map(r => (
                      <RoutineCard key={r.id} routine={r} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} onDuplicate={handleDuplicate} onPublish={canPublish ? handlePublish : undefined} currentUserEmail={email} isAdmin={isOwner} />
                    ))}
                  </div>
                </div>
              )}

              {allVisibleRoutines.length > 0 && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-globe"></i> Published Routines</h4>
                  <div className="routine-manager-grid">
                    {allVisibleRoutines.map(r => (
                      <RoutineCard key={r.id} routine={r} isPublished onView={handleView} onEdit={canEditPublished(r) ? handleEditPublished : undefined} onUnpublish={canPublish ? handleUnpublish : undefined} onDelete={canPublish ? handleUnpublish : undefined} currentUserEmail={email} isAdmin={isOwner} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── BUILDER VIEW ─── */}
      {viewMode === 'builder' && (
        <>
          <div className="routine-page-header no-print">
            <div>
              <h3 className="routine-page-title"><i className={`fas fa-${editingId ? 'edit' : 'plus-circle'}`}></i> {editingId ? 'Edit Routine' : 'Create New Routine'}</h3>
              <p className="routine-page-sub">Build your custom class schedule step by step</p>
            </div>
          </div>
          <RoutineBuilder
            existing={editingId ? (myRoutines.find(r => r.id === editingId) || publishedRoutines.find(r => r.id === editingId) || null) : null}
            onSave={handleSaveBuilder}
            onCancel={handleCancelBuilder}
          />
        </>
      )}

      {/* ─── PREVIEW VIEW ─── */}
      {viewMode === 'preview' && currentPreview && (
        <>
          <div className="routine-page-header no-print">
            <div>
              <h3 className="routine-page-title"><i className="fas fa-eye"></i> {currentPreview.semester}{currentPreview.gender ? ` — ${currentPreview.gender === 'male' ? 'Male' : 'Female'} Branch` : ''}{currentPreview.branch ? ` - Branch ${currentPreview.branch}` : ''}</h3>
              <p className="routine-page-sub">Session: {currentPreview.session}</p>
            </div>
            <div className="routine-page-actions">
              {exporting && <span className="routine-exporting"><i className="fas fa-spinner fa-spin"></i> Exporting...</span>}
              <button disabled={exporting} className="routine-btn routine-btn-outline" onClick={() => handleExport('pdf')}><i className="fas fa-file-pdf"></i> PDF</button>
              <button disabled={exporting} className="routine-btn routine-btn-outline" onClick={() => handleExport('png')}><i className="fas fa-image"></i> PNG</button>
              <button onClick={() => setExportMode(exportMode === 'themed' ? 'plain' : 'themed')} className="routine-btn routine-btn-outline"><i className="fas fa-file-alt"></i> {exportMode === 'themed' ? 'Plain Table' : 'Themed View'}</button>
              <button className="routine-btn routine-btn-ghost" onClick={() => setViewMode('manager')}><i className="fas fa-arrow-left"></i> Back</button>
            </div>
          </div>
          <div className="routine-preview-scroll">
            {exportMode === 'themed' ? (
              <RoutinePrintView ref={printRef} routine={currentPreview} />
            ) : (
              <RoutinePlainTable routine={currentPreview} />
            )}
          </div>

          {/* Teacher Contacts Section */}
          <TeacherContacts courses={currentPreview.courses} />
        </>
      )}

      {/* ─── ALL SEMESTER ROUTINE VIEW ─── */}
      {viewMode === 'allBranch' && (
        <AllSemesterView
          publishedRoutines={publishedRoutines}
          onView={handleView}
          onPublish={(routines) => {
            const publisherName = session?.user?.name || profile.name || 'Unknown';
            let updated: RoutineItem[];
            if (routines.length === 0) {
              updated = [];
            } else {
              updated = publishedRoutines.filter(r => !routines.some(nr => nr.semester === r.semester && nr.gender === r.gender && nr.branch === r.branch));
              routines.forEach(r => {
                updated.push({ ...r, publishedBy: { name: publisherName, email }, publishedAt: Date.now() });
              });
            }
            setPublishedRoutines(updated);
            savePublishedRoutines(updated);
            // Save to DB
            fetch('/api/published-routines', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ routines: updated.filter(r => routines.some(nr => nr.id === r.id)) }),
            }).catch(() => {});
          }}
          onBack={() => setViewMode('manager')}
        />
      )}
      {confirmDialog}
    </section>
  );
}
