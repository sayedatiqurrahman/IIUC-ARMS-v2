'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import TeacherAutocomplete from '@/components/TeacherAutocomplete';

interface RoutinePeriod {
  name: string;
  start: string;
  end: string;
  isBreak?: boolean;
}

interface RoutineCourse {
  code: string;
  title: string;
  teacher: string;
  room: string;
}

interface RoutineSlot {
  day: string;
  period: number;
  course: string;
}

interface RoutineItem {
  id: string;
  semester: string;
  session: string;
  branch: string | null;
  academicYear: string;
  department: string;
  university: string;
  room: string;
  periods: RoutinePeriod[];
  days: string[];
  courses: RoutineCourse[];
  slots: RoutineSlot[];
  createdAt?: number;
  published?: boolean;
  isDraft?: boolean;
  publishedBy?: { name: string; title?: string };
  publishedAt?: number;
}

const DEFAULT_PERIODS: RoutinePeriod[] = [
  { name: '1st Period', start: '10:40 AM', end: '11:30 AM' },
  { name: '2nd Period', start: '11:30 AM', end: '12:20 PM' },
  { name: '3rd Period', start: '12:20 PM', end: '01:10 PM' },
  { name: 'Lunch & Zuhr Prayer Break', start: '01:10 PM', end: '01:50 PM', isBreak: true },
  { name: '4th Period', start: '01:50 PM', end: '02:40 PM' },
  { name: '5th Period', start: '02:40 PM', end: '03:30 PM' },
  { name: '6th Period', start: '03:30 PM', end: '04:20 PM' },
];

const DEFAULT_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];
const SEMESTERS = ['1st Semester', '2nd Semester', '3rd Semester', '4th Semester', '5th Semester', '6th Semester', '7th Semester', '8th Semester'];
const SESSIONS = (() => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const list: string[] = [];
  for (let y = currentYear - 3; y <= currentYear + 10; y++) {
    list.push(`Spring - ${y}`);
    list.push(`Autumn - ${y}`);
  }
  return list;
})();

function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

function getCourse(code: string, courses: RoutineCourse[]) {
  return courses.find(c => c.code === code);
}

function getSlot(day: string, period: number, slots: RoutineSlot[]) {
  return slots.find(s => s.day === day && s.period === period);
}

function isOffDay(day: string, periods: RoutinePeriod[], slots: RoutineSlot[]) {
  const classPeriods = periods.filter(p => !p.isBreak);
  return classPeriods.every((_, idx) => !getSlot(day, idx, slots));
}

function getTeacherAbbr(teacher: string): string {
  if (!teacher) return '';
  const parts = teacher.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 4);
}

/* ─── localStorage helpers ─── */
const LS_MY_ROUTINES = 'qsis-routines';
const LS_PUBLISHED = 'qsis-published-routines';
const LS_DRAFT = 'qsis-routine-draft';

function loadMyRoutines(): RoutineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_MY_ROUTINES);
    if (raw) return JSON.parse(raw);
    const single = localStorage.getItem('qsis-my-routine');
    if (single) {
      const r = JSON.parse(single);
      localStorage.setItem(LS_MY_ROUTINES, JSON.stringify([r]));
      return [r];
    }
    return [];
  } catch { return []; }
}

function saveMyRoutines(routines: RoutineItem[]) {
  localStorage.setItem(LS_MY_ROUTINES, JSON.stringify(routines));
}

function loadPublishedRoutines(): RoutineItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_PUBLISHED);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePublishedRoutines(routines: RoutineItem[]) {
  localStorage.setItem(LS_PUBLISHED, JSON.stringify(routines));
}

interface DraftData {
  semester?: string;
  branch?: string | null;
  session?: string;
  room?: string;
  periods?: RoutinePeriod[];
  days?: string[];
  courses?: RoutineCourse[];
  slots?: RoutineSlot[];
  step?: string;
}

function loadDraft(): DraftData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(data: DraftData) {
  localStorage.setItem(LS_DRAFT, JSON.stringify(data));
}

function clearDraft() {
  localStorage.removeItem(LS_DRAFT);
}

type ViewMode = 'manager' | 'preview' | 'builder';

export default function RoutineView() {
  const router = useRouter();
  const { data: session } = useSession();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const loadRoutine = useAppStore(s => s.loadRoutine);
  const profile = useAppStore(s => s.profile);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('manager');
  const [myRoutines, setMyRoutines] = useState<RoutineItem[]>([]);
  const [publishedRoutines, setPublishedRoutines] = useState<RoutineItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const email = session?.user?.email || profile.email || '';
  const isOwner = config.ownerEmails.includes(email);
  const canPublish = config.canPublishRoutine(email, profile) || isOwner;

  const sharedRoutines: RoutineItem[] = Array.isArray(routineData) ? routineData : [];
  const routines = sharedRoutines;
  const allVisibleRoutines = [...publishedRoutines, ...sharedRoutines];
  const currentPreview = myRoutines.find(r => r.id === selectedId) || allVisibleRoutines.find(r => r.id === selectedId) || null;

  useEffect(() => {
    setMyRoutines(loadMyRoutines());
    setPublishedRoutines(loadPublishedRoutines());
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

  const handleDelete = useCallback((id: string) => {
    if (!confirm('Delete this routine?')) return;
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

  const handlePublish = useCallback((routine: RoutineItem) => {
    if (!confirm(`Publish "${routine.semester}" for all users?`)) return;
    const publisherName = session?.user?.name || profile.name || 'Unknown';
    const published = {
      ...routine,
      published: true,
      isDraft: false,
      id: `pub-${Date.now()}`,
      publishedBy: { name: publisherName },
      publishedAt: Date.now(),
    };
    const updated = publishedRoutines.filter(r => !(r.semester === routine.semester && r.branch === routine.branch));
    updated.push(published);
    setPublishedRoutines(updated);
    savePublishedRoutines(updated);
    const myUpdated = myRoutines.map(r => r.id === routine.id ? { ...r, isDraft: false } : r);
    persistMyRoutines(myUpdated);

    fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'routine_publish',
        details: JSON.stringify({ semester: routine.semester, branch: routine.branch, publisher: publisherName }),
      }),
    }).catch(() => {});

    showToast('Routine published! All users can now see it.', 'success');
  }, [publishedRoutines, myRoutines, persistMyRoutines, session, profile]);

  const handleUnpublish = useCallback((id: string) => {
    const updated = publishedRoutines.filter(r => r.id !== id);
    setPublishedRoutines(updated);
    savePublishedRoutines(updated);
    showToast('Routine unpublished', 'success');
  }, [publishedRoutines]);

  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const el = printRef.current;
      const domtoimage = (await import('dom-to-image-more')).default;

      const dataUrl = await domtoimage.toPng(el, {
        quality: 0.95,
        pixelRatio: 3,
        bgcolor: '#ffffff',
        cacheBust: true,
        filter: (node: HTMLElement) => {
          return !node.classList?.contains('no-print');
        },
        onclone: (clone: Node) => {
          const doc = clone.ownerDocument;
          if (!doc) return;

          const root = doc.querySelector('.routine-export') as HTMLElement | null;
          if (root) {
            root.style.width = '920px';
            root.style.minWidth = '920px';
            root.style.maxWidth = '920px';
          }

          doc.querySelectorAll<HTMLElement>('.routine-course-code').forEach(el => {
            el.style.whiteSpace = 'nowrap';
          });

          const badges = doc.querySelector('.routine-badges') as HTMLElement | null;
          if (badges) {
            badges.style.flexWrap = 'nowrap';
            badges.style.justifyContent = 'center';
          }
        },
      });

      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const margin = 15;
        const imgW = pdfW - margin * 2;
        const imgH = (img.height * imgW) / img.width;

        if (imgH <= pdfH - margin * 2) {
          pdf.addImage(dataUrl, 'PNG', margin, margin, imgW, imgH);
        } else {
          const pageContentH = pdfH - margin * 2;
          const sourceH = (pageContentH / imgH) * img.height;
          let yPos = 0;
          while (yPos < img.height) {
            if (yPos > 0) pdf.addPage();
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = img.width;
            sliceCanvas.height = Math.min(sourceH, img.height - yPos);
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.drawImage(img, 0, yPos, img.width, sliceCanvas.height, 0, 0, img.width, sliceCanvas.height);
            pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, imgW, (sliceCanvas.height * imgW) / img.width);
            yPos += sourceH;
          }
        }
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
    let updated: RoutineItem[];
    if (editingId) {
      updated = myRoutines.map(r => r.id === editingId ? routine : r);
    } else {
      updated = [...myRoutines, routine];
    }
    persistMyRoutines(updated);
    setEditingId(null);
    setViewMode('manager');
    showToast(editingId ? 'Routine updated!' : 'Routine created!', 'success');
  }, [myRoutines, editingId, persistMyRoutines]);

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
              <p className="routine-page-sub">Manage and view your class schedules</p>
            </div>
            <div className="routine-page-actions">
              <button className="routine-btn routine-btn-primary" onClick={() => { setEditingId(null); setViewMode('builder'); }}>
                <i className="fas fa-plus"></i> Create New
              </button>
              <button className="routine-btn routine-btn-ghost" onClick={() => router.push('/')}><i className="fas fa-arrow-left"></i> Back</button>
            </div>
          </div>

          {myRoutines.length === 0 && allVisibleRoutines.length === 0 ? (
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
              {myRoutines.length > 0 && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-user-edit"></i> My Routines</h4>
                  <div className="routine-manager-grid">
                    {myRoutines.map(r => (
                      <RoutineCard key={r.id} routine={r} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} onDuplicate={handleDuplicate} onPublish={canPublish ? handlePublish : undefined} />
                    ))}
                  </div>
                </div>
              )}

              {allVisibleRoutines.length > 0 && (
                <div className="routine-manager-section">
                  <h4 className="routine-manager-section-title"><i className="fas fa-globe"></i> Published Routines</h4>
                  <div className="routine-manager-grid">
                    {allVisibleRoutines.map(r => (
                      <RoutineCard key={r.id} routine={r} isPublished onView={handleView} onUnpublish={canPublish ? handleUnpublish : undefined} />
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
            existing={editingId ? myRoutines.find(r => r.id === editingId) || null : null}
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
              <h3 className="routine-page-title"><i className="fas fa-eye"></i> {currentPreview.semester}{currentPreview.branch ? ` - Branch ${currentPreview.branch}` : ''}</h3>
              <p className="routine-page-sub">Session: {currentPreview.session}</p>
            </div>
            <div className="routine-page-actions">
              {exporting && <span className="routine-exporting"><i className="fas fa-spinner fa-spin"></i> Exporting...</span>}
              <button disabled={exporting} className="routine-btn routine-btn-outline" onClick={() => handleExport('pdf')}><i className="fas fa-file-pdf"></i> PDF</button>
              <button disabled={exporting} className="routine-btn routine-btn-outline" onClick={() => handleExport('png')}><i className="fas fa-image"></i> PNG</button>
              <button className="routine-btn routine-btn-ghost" onClick={() => setViewMode('manager')}><i className="fas fa-arrow-left"></i> Back</button>
            </div>
          </div>
          <RoutinePrintView ref={printRef} routine={currentPreview} />
        </>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   ROUTINE CARD — Manager Grid Card
   ═══════════════════════════════════════════════════════ */
function RoutineCard({ routine, isPublished, onView, onEdit, onDelete, onDuplicate, onPublish, onUnpublish }: {
  routine: RoutineItem;
  isPublished?: boolean;
  onView: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (r: RoutineItem) => void;
  onPublish?: (r: RoutineItem) => void;
  onUnpublish?: (id: string) => void;
}) {
  const slotCount = routine.slots.length;
  const daysCount = routine.days.length;
  const courseCount = routine.courses.length;
  const dateStr = routine.createdAt ? new Date(routine.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  return (
    <div className={`routine-card ${isPublished ? 'routine-card-published' : ''}`}>
      <div className="routine-card-header">
        <div className="routine-card-semester">{routine.semester}</div>
        {routine.branch && <span className="routine-card-badge">Branch {routine.branch}</span>}
        {isPublished && <span className="routine-card-published-badge"><i className="fas fa-globe"></i> Published</span>}
        {!isPublished && routine.isDraft && <span className="routine-card-draft-badge"><i className="fas fa-pen"></i> Draft</span>}
      </div>
      <div className="routine-card-meta">
        <span><i className="fas fa-book"></i> {courseCount} courses</span>
        <span><i className="fas fa-calendar-day"></i> {daysCount} days</span>
        <span><i className="fas fa-clock"></i> {slotCount} classes</span>
      </div>
      <div className="routine-card-info">
        <span>Session: {routine.session}</span>
        {dateStr && <span>Created: {dateStr}</span>}
        {isPublished && routine.publishedBy && (
          <span><i className="fas fa-user-check"></i> Published by {routine.publishedBy.name}</span>
        )}
      </div>
      <div className="routine-card-actions">
        <button className="routine-card-btn routine-card-btn-view" onClick={() => onView(routine.id)}><i className="fas fa-eye"></i> View</button>
        {onEdit && <button className="routine-card-btn routine-card-btn-edit" onClick={() => onEdit(routine.id)}><i className="fas fa-edit"></i> Edit</button>}
        {onDuplicate && <button className="routine-card-btn routine-card-btn-dup" onClick={() => onDuplicate(routine)}><i className="fas fa-copy"></i> Duplicate</button>}
        {onPublish && !isPublished && <button className="routine-card-btn routine-card-btn-publish" onClick={() => onPublish(routine)}><i className="fas fa-share-alt"></i> Publish</button>}
        {onUnpublish && isPublished && <button className="routine-card-btn routine-card-btn-unpublish" onClick={() => onUnpublish(routine.id)}><i className="fas fa-eye-slash"></i> Unpublish</button>}
        {onDelete && <button className="routine-card-btn routine-card-btn-delete" onClick={() => onDelete(routine.id)}><i className="fas fa-trash"></i></button>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROUTINE PRINT VIEW — Beautiful University Layout
   ═══════════════════════════════════════════════════════ */
import { forwardRef } from 'react';

const RoutinePrintView = forwardRef<HTMLDivElement, { routine: RoutineItem }>(({ routine }, ref) => {
  const classPeriods = routine.periods.filter(p => !p.isBreak);
  return (
    <div ref={ref} className="routine-export">
      <div className="routine-header">
        <div className="routine-header-inner">
          <div className="routine-header-top">
            <div className="routine-logo-wrapper">
              <img src="/iiuc-logo.png" alt="IIUC" width={80} height={80} className="routine-logo" style={{ display: 'block' }} />
            </div>
            <div className="routine-header-text">
              <h1 className="routine-university-name">{routine.university}</h1>
              <p className="routine-arabic-name">&#x262F;&#x2015;&#x627;&#x644;&#x62C;&#x627;&#x645;&#x639;&#x629; &#x627;&#x644;&#x625;&#x633;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x627;&#x644;&#x639;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x634;&#x64A;&#x62A;&#x627;&#x63A;&#x648;&#x646;&#x63A;</p>
              <p className="routine-dept-name">{routine.department}</p>
            </div>
          </div>
          <div className="routine-title-bar">
            <div className="routine-title-accent"></div>
            <h2 className="routine-title"> CLASS ROUTINE</h2>
            <div className="routine-title-accent"></div>
          </div>
          <div className="routine-badges">
            <span className="routine-badge routine-badge-semester">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
              {routine.semester}
            </span>
            {routine.branch && <span className="routine-badge routine-badge-branch">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/></svg>
              Branch {routine.branch}
            </span>}
            <span className="routine-badge routine-badge-session">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M17 14h-6"/><path d="M13 18H7"/><path d="M7 14h.01"/><path d="M17 18h.01"/></svg>
              Session {routine.session}
            </span>
            {routine.room && <span className="routine-badge routine-badge-room">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
              {/^\d+$/.test(routine.room) ? `Room ${routine.room}` : routine.room}
            </span>}
          </div>
        </div>
      </div>

      <div className="routine-table-wrapper">
        <table className="routine-table">
          <thead>
            <tr>
              <th className="routine-th routine-th-time">Time</th>
              {routine.days.map(day => (
                <th key={day} className="routine-th">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {routine.periods.map((period, pIdx) => {
              if (period.isBreak) {
                const nonOffDays = routine.days.filter(day => !isOffDay(day, routine.periods, routine.slots));
                const midIdx = Math.floor(nonOffDays.length / 2);
                return (
                  <tr key={pIdx} className="routine-break-row">
                    <td className="routine-td routine-td-time routine-break-time">
                      <div className="routine-time-text">{period.start}</div>
                      <div className="routine-time-sub">{period.end}</div>
                    </td>
                    {routine.days.map((day, dIdx) => {
                      const offDay = isOffDay(day, routine.periods, routine.slots);
                      if (offDay) return null;
                      const showLabel = nonOffDays.indexOf(day) === midIdx;
                      return (
                        <td key={day} className="routine-td routine-break-cell">
                          {showLabel ? <span className="routine-break-label">{period.name}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              const classPeriodIdx = classPeriods.findIndex((_, i) => {
                let count = 0;
                for (let j = 0; j <= pIdx; j++) { if (!routine.periods[j].isBreak) count++; }
                return count - 1 === i;
              }) ?? pIdx;
              return (
                <tr key={pIdx}>
                  <td className="routine-td routine-td-time">
                    <div className="routine-period-name">{period.name}</div>
                    <div className="routine-time-text">{period.start}</div>
                    <div className="routine-time-sub">{period.end}</div>
                  </td>
                  {routine.days.map(day => {
                    const offDay = isOffDay(day, routine.periods, routine.slots);
                    if (offDay) {
                      if (pIdx === 0) {
                        return (
                          <td key={day} className="routine-td routine-offday-cell" rowSpan={routine.periods.length}>
                            <div className="routine-offday-vertical">OFF DAY</div>
                          </td>
                        );
                      }
                      return null;
                    }
                    const slot = getSlot(day, classPeriodIdx, routine.slots);
                    const course = slot ? getCourse(slot.course, routine.courses) : null;
                    return (
                      <td key={day} className="routine-td">
                        {slot && course ? (
                          <div className="routine-course">
                            <span className="routine-course-code">{course.code}</span>
                            <span className="routine-course-title">{course.title}</span>
                            <span className="routine-course-teacher">{course.teacher}</span>
                          </div>
                        ) : (
                          <span className="routine-empty">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {routine.courses.length > 0 && (
        <div className="routine-legend">
          <h4 className="routine-legend-title"><i className="fas fa-book-open"></i> Course Information</h4>
          <div className="routine-legend-table-wrapper">
            <table className="routine-legend-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course Title</th>
                  <th>Instructor</th>
                </tr>
              </thead>
              <tbody>
                {routine.courses.map(c => (
                  <tr key={c.code}>
                    <td className="routine-legend-code-cell">{c.code}</td>
                    <td>{c.title}</td>
                    <td>{c.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="routine-footer">
        <div className="routine-footer-grid">
          <div className="routine-footer-notes">
            <h4>Important Notes</h4>
            <ul>
              <li>Students must arrive 5 minutes before class.</li>
              <li>Any schedule change will be notified via department notice board.</li>
              <li>Midterm and final exam schedules are separate.</li>
            </ul>
          </div>
          <div className="routine-footer-timing">
            <h4>Timing Information</h4>
            <p><strong>Office Hours:</strong> 9:00 AM - 4:00 PM</p>
          </div>
        </div>
        <div className="routine-footer-center">
          <p className="routine-generated">Presented by <strong><a href="https://programming-light.eu.cc" target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'underline'}}>Programming Light</a></strong> &amp; Developed by <strong><a href="https://atiq.is-a.dev" target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'underline'}}>Sayed Atiqur Rahman</a></strong></p>
          <p className="routine-updated">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="routine-footer-strip">
          <p>&copy; {new Date().getFullYear()} QSIS-ARMS &mdash; Qur&apos;anic Sciences &amp; Islamic Studies, IIUC</p>
        </div>
      </div>
    </div>
  );
});
RoutinePrintView.displayName = 'RoutinePrintView';

/* ═══════════════════════════════════════════════════════
   ROUTINE BUILDER — Simplified Step-by-Step Editor
   ═══════════════════════════════════════════════════════ */
type BuilderStep = 'info' | 'courses' | 'periods' | 'assign';

function RoutineBuilder({ existing, onSave, onCancel }: { existing: RoutineItem | null; onSave: (r: RoutineItem) => void; onCancel: () => void }) {
  const [step, setStep] = useState<BuilderStep>('info');
  const [semester, setSemester] = useState(existing?.semester || SEMESTERS[0]);
  const [branch, setBranch] = useState(existing?.branch || '');
  const [session, setSession] = useState(existing?.session || getDefaultSession());
  const [room, setRoom] = useState(existing?.room || '');
  const [periods, setPeriods] = useState<RoutinePeriod[]>(existing?.periods || [...DEFAULT_PERIODS]);
  const [days, setDays] = useState<string[]>(existing?.days || [...DEFAULT_DAYS]);
  const [courses, setCourses] = useState<RoutineCourse[]>(existing?.courses || []);
  const [slots, setSlots] = useState<RoutineSlot[]>(existing?.slots || []);
  const [draftSaved, setDraftSaved] = useState(false);

  useEffect(() => {
    if (existing) return;
    const draft = loadDraft();
    if (draft) {
      if (draft.semester) setSemester(draft.semester);
      if (draft.branch !== undefined) setBranch(draft.branch || '');
      if (draft.session) setSession(draft.session);
      if (draft.room !== undefined) setRoom(draft.room || '');
      if (draft.periods) setPeriods(draft.periods);
      if (draft.days) setDays(draft.days);
      if (draft.courses) setCourses(draft.courses);
      if (draft.slots) setSlots(draft.slots);
      if (draft.step) setStep(draft.step as BuilderStep);
      showToast('Draft restored from previous session', 'success');
    }
  }, []);

  useEffect(() => {
    if (existing) return;
    const timer = setTimeout(() => {
      saveDraft({ semester, branch, session, room, periods, days, courses, slots, step });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, [semester, branch, session, room, periods, days, courses, slots, step, existing]);

  const classPeriods = periods.filter(p => !p.isBreak);
  const nonBreakIdx = (pIdx: number) => {
    let count = 0;
    for (let i = 0; i <= pIdx; i++) { if (!periods[i].isBreak) count++; }
    return count - 1;
  };

  const steps: { key: BuilderStep; label: string; icon: string; num: number }[] = [
    { key: 'info', label: 'Basic Info', icon: 'info-circle', num: 1 },
    { key: 'courses', label: 'Add Courses', icon: 'book', num: 2 },
    { key: 'periods', label: 'Time Periods', icon: 'clock', num: 3 },
    { key: 'assign', label: 'Assign Grid', icon: 'table', num: 4 },
  ];
  const currentStepIdx = steps.findIndex(s => s.key === step);

  const addPeriod = () => setPeriods([...periods, { name: `Period ${classPeriods.length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  const updatePeriod = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...periods]; p[idx] = { ...p[idx], [field]: value }; setPeriods(p);
  };
  const removePeriod = (idx: number) => setPeriods(periods.filter((_, i) => i !== idx));
  const movePeriod = (idx: number, dir: -1 | 1) => {
    const p = [...periods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; setPeriods(p);
  };

  const addCourse = () => setCourses([...courses, { code: '', title: '', teacher: '', room: '' }]);
  const toInitials = (name: string): string => {
    if (!name) return '';
    const skip = new Set(['dr.', 'prof.', 'mr.', 'mrs.', 'ms.', 'md.', 'sheikh', 'ustaz', 'moulana', 'alhaj']);
    const parts = name.trim().split(/\s+/).filter(p => !skip.has(p.toLowerCase().replace(/[.:]$/, '')));
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 4);
  };

  const updateCourse = (idx: number, field: keyof RoutineCourse, value: string, shortForm?: string) => {
    const c = [...courses];
    const old = c[idx];
    c[idx] = { ...old, [field]: value };
    if (field === 'teacher') {
      const oldInitials = toInitials(old.teacher);
      if (!old.room || old.room === oldInitials) {
        c[idx].room = shortForm || toInitials(value);
      }
    }
    setCourses(c);
  };
  const removeCourse = (idx: number) => { setCourses(courses.filter((_, i) => i !== idx)); setSlots(slots.filter(s => s.course !== courses[idx].code)); };

  const toggleDay = (day: string) => setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort());

  const setSlot = (day: string, period: number, courseCode: string) => {
    if (courseCode === '') {
      setSlots(slots.filter(s => !(s.day === day && s.period === period)));
    } else if (slots.find(s => s.day === day && s.period === period)) {
      setSlots(slots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode } : s));
    } else {
      setSlots([...slots, { day, period, course: courseCode }]);
    }
  };

  const handleSave = () => {
    if (!semester) { showToast('Please select semester', 'error'); return; }
    const routine: RoutineItem = {
      id: existing?.id || `my-${Date.now()}`,
      semester, branch: branch || null, session, room: room || '',
      academicYear: existing?.academicYear || new Date().getFullYear().toString(),
      department: existing?.department || 'Department of Qur\'anic Sciences & Islamic Studies',
      university: existing?.university || 'International Islamic University Chittagong',
      periods, days, courses, slots,
      createdAt: existing?.createdAt || Date.now(),
      isDraft: true,
    };
    clearDraft();
    onSave(routine);
  };

  return (
    <div className="routine-builder">
      {draftSaved && (
        <div style={{textAlign:'center',padding:'6px',background:'#dcfce7',borderRadius:'8px',marginBottom:'12px',fontSize:'0.8rem',color:'#166534'}}>
          <i className="fas fa-check-circle"></i> Draft auto-saved
        </div>
      )}
      <div className="routine-builder-steps">
        {steps.map((s, idx) => (
          <div key={s.key} className={`routine-step ${step === s.key ? 'active' : ''} ${idx < currentStepIdx ? 'completed' : ''}`}>
            <div className="routine-step-num">{idx < currentStepIdx ? <i className="fas fa-check"></i> : s.num}</div>
            <span className="routine-step-label">{s.label}</span>
            {idx < steps.length - 1 && <div className="routine-step-line"></div>}
          </div>
        ))}
      </div>

      {step === 'info' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-info-circle"></i> Basic Information</h4>
          <div className="routine-form-grid">
            <div className="routine-form-group">
              <label>Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)}>{SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div className="routine-form-group">
              <label>Branch <span className="routine-label-optional">(optional)</span></label>
              <input placeholder="e.g. A, B" value={branch} onChange={e => setBranch(e.target.value)} />
            </div>
            <div className="routine-form-group">
              <label>Session</label>
              <input placeholder="e.g. Spring - 2026" value={session} onChange={e => setSession(e.target.value)} />
            </div>
            <div className="routine-form-group">
              <label>Room / Venue</label>
              <input placeholder="e.g. Room 301, Building B" value={room} onChange={e => setRoom(e.target.value)} />
            </div>
            <div className="routine-form-group routine-form-full">
              <label>Class Days</label>
              <div className="routine-day-selector">
                {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                  <button key={d} type="button" className={`routine-day-btn ${days.includes(d) ? 'active' : ''}`} onClick={() => toggleDay(d)}>
                    <span className="routine-day-short">{d.slice(0, 3)}</span>
                    <span className="routine-day-full">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'courses' && (
        <div className="routine-builder-section">
          <div className="routine-builder-section-header">
            <h4><i className="fas fa-book"></i> Course List</h4>
            <button className="routine-add-btn" onClick={addCourse}><i className="fas fa-plus"></i> Add Course</button>
          </div>
          {courses.length > 0 && (
            <div className="routine-course-list">
              {courses.map((c, idx) => (
                <div key={idx} className="routine-course-item">
                  <div className="routine-course-num">{idx + 1}</div>
                  <div className="routine-course-fields">
                    <input className="routine-input-sm" placeholder="Code (e.g. QSM-3601)" value={c.code} onChange={e => updateCourse(idx, 'code', e.target.value)} />
                    <input placeholder="Course Title (e.g. Tafsir Bir Rayi)" value={c.title} onChange={e => updateCourse(idx, 'title', e.target.value)} />
                    <div className="routine-course-row-2">
                      <TeacherAutocomplete value={c.teacher} onChange={(val, sf) => updateCourse(idx, 'teacher', val, sf)} placeholder="Type name or short form (e.g. MER)" />
                      <input className="routine-input-sm" placeholder={c.teacher ? `Room (auto: ${toInitials(c.teacher)})` : 'Room (auto from name)'} value={c.room} onChange={e => updateCourse(idx, 'room', e.target.value)} />
                    </div>
                  </div>
                  <button className="routine-remove-btn" onClick={() => removeCourse(idx)}><i className="fas fa-trash-alt"></i></button>
                </div>
              ))}
            </div>
          )}
          {courses.length === 0 && (
            <div className="routine-empty-courses">
              <i className="fas fa-book-open"></i>
              <p>No courses added yet. Click &quot;Add Course&quot; to start building your schedule.</p>
            </div>
          )}
        </div>
      )}

      {step === 'periods' && (
        <div className="routine-builder-section">
          <div className="routine-builder-section-header">
            <h4><i className="fas fa-clock"></i> Time Periods</h4>
            <button className="routine-add-btn" onClick={addPeriod}><i className="fas fa-plus"></i> Add Period</button>
          </div>
          <div className="routine-period-list">
            {periods.map((p, idx) => (
              <div key={idx} className={`routine-period-item ${p.isBreak ? 'break' : ''}`}>
                <div className="routine-period-drag">
                  <button disabled={idx === 0} onClick={() => movePeriod(idx, -1)}><i className="fas fa-chevron-up"></i></button>
                  <button disabled={idx === periods.length - 1} onClick={() => movePeriod(idx, 1)}><i className="fas fa-chevron-down"></i></button>
                </div>
                <div className="routine-period-fields">
                  <input className="routine-period-name" placeholder="Period name" value={p.name} onChange={e => updatePeriod(idx, 'name', e.target.value)} />
                  <div className="routine-period-times">
                    <input type="time" value={to24h(p.start)} onChange={e => updatePeriod(idx, 'start', to12h(e.target.value))} />
                    <span className="routine-period-sep">to</span>
                    <input type="time" value={to24h(p.end)} onChange={e => updatePeriod(idx, 'end', to12h(e.target.value))} />
                  </div>
                </div>
                <label className="routine-break-toggle">
                  <input type="checkbox" checked={!!p.isBreak} onChange={e => updatePeriod(idx, 'isBreak', e.target.checked)} />
                  <span>Break</span>
                </label>
                <button className="routine-remove-btn-sm" onClick={() => removePeriod(idx)}><i className="fas fa-times"></i></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'assign' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-table"></i> Assign Courses to Schedule</h4>
          <p className="routine-builder-hint">Select a course for each day/period. Leave empty for Off Day.</p>
          {courses.length === 0 ? (
            <div className="routine-empty-courses">
              <i className="fas fa-exclamation-triangle"></i>
              <p>Please add courses first (Step 2) before assigning them to the schedule.</p>
            </div>
          ) : (
            <div className="routine-grid-wrapper">
              <table className="routine-grid-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    {days.map(d => <th key={d}>{d.slice(0, 3)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p, pIdx) => {
                    if (p.isBreak) {
                      return (
                        <tr key={pIdx} className="routine-grid-break">
                          <td className="routine-grid-time">{p.start} - {p.end}</td>
                          {days.map(d => <td key={d}>Break</td>)}
                        </tr>
                      );
                    }
                    const cpIdx = nonBreakIdx(pIdx);
                    return (
                      <tr key={pIdx}>
                        <td className="routine-grid-time">
                          <div>{p.name}</div>
                          <small>{p.start} - {p.end}</small>
                        </td>
                        {days.map(d => {
                          const currentSlot = getSlot(d, cpIdx, slots);
                          return (
                            <td key={d}>
                              <select value={currentSlot?.course || ''} onChange={e => setSlot(d, cpIdx, e.target.value)}>
                                <option value="">-- Off Day --</option>
                                {courses.map(c => <option key={c.code} value={c.code}>{c.code} - {c.title}</option>)}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="routine-builder-nav">
        <button className="routine-btn routine-btn-ghost" onClick={onCancel}><i className="fas fa-times"></i> Cancel</button>
        <div className="routine-builder-nav-right">
          {currentStepIdx > 0 && (
            <button className="routine-btn routine-btn-outline" onClick={() => setStep(steps[currentStepIdx - 1].key)}>
              <i className="fas fa-arrow-left"></i> Previous
            </button>
          )}
          {currentStepIdx < steps.length - 1 ? (
            <button className="routine-btn routine-btn-primary" onClick={() => setStep(steps[currentStepIdx + 1].key)}>
              Next <i className="fas fa-arrow-right"></i>
            </button>
          ) : (
            <button className="routine-btn routine-btn-save" onClick={handleSave}>
              <i className="fas fa-save"></i> Save Routine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Time Helpers ─── */
function to24h(time12h: string): string {
  if (!time12h) return '';
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '';
  let h = parseInt(match[1]); const m = match[2]; const ap = match[3].toUpperCase();
  if (ap === 'AM' && h === 12) h = 0;
  else if (ap === 'PM' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${m}`;
}

function to12h(time24h: string): string {
  if (!time24h) return '';
  const [hStr, m] = time24h.split(':');
  let h = parseInt(hStr);
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ap}`;
}
