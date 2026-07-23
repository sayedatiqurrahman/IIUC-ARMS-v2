'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';

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
  periods: RoutinePeriod[];
  days: string[];
  courses: RoutineCourse[];
  slots: RoutineSlot[];
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

function loadMyRoutine(): RoutineItem | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('qsis-my-routine');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveMyRoutine(routine: RoutineItem) {
  localStorage.setItem('qsis-my-routine', JSON.stringify(routine));
}

export default function RoutineView() {
  const router = useRouter();
  const { data: session } = useSession();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const loadRoutine = useAppStore(s => s.loadRoutine);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('my-routine');
  const [myRoutine, setMyRoutine] = useState<RoutineItem | null>(null);

  const routines: RoutineItem[] = Array.isArray(routineData) ? routineData : [];
  const allRoutines = [...(myRoutine ? [myRoutine] : []), ...routines];
  const current = allRoutines.find(r => r.id === selectedId) || allRoutines[0] || null;

  useEffect(() => {
    setMyRoutine(loadMyRoutine());
  }, []);

  useEffect(() => {
    if (routines.length === 0 && !routineLoading) {
      loadRoutine();
    }
  }, [routines.length, routineLoading, loadRoutine]);

  useEffect(() => {
    if (!selectedId && allRoutines.length > 0) {
      setSelectedId(myRoutine ? 'my-routine' : allRoutines[0].id);
    }
  }, [allRoutines.length, selectedId, myRoutine]);

  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(printRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const margin = 20;
        const imgData = canvas.toDataURL('image/png');
        const imgW = pdfW - margin * 2;
        const imgH = (canvas.height * imgW) / canvas.width;
        if (imgH <= pdfH - margin * 2) {
          pdf.addImage(imgData, 'PNG', margin, margin, imgW, imgH);
        } else {
          let yPos = 0;
          const pageContentH = pdfH - margin * 2;
          const sourceH = (pageContentH / imgH) * canvas.height;
          while (yPos < canvas.height) {
            if (yPos > 0) pdf.addPage();
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = Math.min(sourceH, canvas.height - yPos);
            const ctx = sliceCanvas.getContext('2d')!;
            ctx.drawImage(canvas, 0, yPos, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
            pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, imgW, (sliceCanvas.height * imgW) / canvas.width);
            yPos += sourceH;
          }
        }
        pdf.save(`QSIS-ARMS-${current?.semester || 'Routine'}.pdf`);
      } else {
        const link = document.createElement('a');
        link.download = `QSIS-ARMS-${current?.semester || 'Routine'}.${format}`;
        link.href = canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.95);
        link.click();
      }
    } catch (err) { console.error('Export failed:', err); }
    finally { setExporting(false); }
  }, [current]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  if (routineLoading && !myRoutine) {
    return (
      <section className="mb-5">
        <div className="no-print flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
          <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}><i className="fas fa-arrow-left"></i> Back</button>
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
      <div className="no-print">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
          <div className="flex items-center gap-2">
            {current && selectedId !== 'builder' && (
              <>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('pdf')}><i className="fas fa-file-pdf text-red-400"></i> PDF</button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('png')}><i className="fas fa-image text-blue-400"></i> PNG</button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-qsis/30 bg-qsis/10 text-qsis cursor-pointer text-[0.75rem] font-semibold hover:bg-qsis/20 transition-all disabled:opacity-50" onClick={handlePrint}><i className="fas fa-print"></i> Print</button>
              </>
            )}
            <button className={`inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border cursor-pointer text-[0.75rem] font-semibold transition-all ${selectedId === 'builder' ? 'border-accent bg-accent/20 text-accent' : 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'}`} onClick={() => setSelectedId(selectedId === 'builder' ? (myRoutine ? 'my-routine' : routines[0]?.id || '') : 'builder')}>
              <i className="fas fa-plus"></i> {selectedId === 'builder' ? 'Back' : 'Create My Routine'}
            </button>
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}><i className="fas fa-arrow-left"></i> Back</button>
          </div>
        </div>

        {allRoutines.length > 1 && selectedId !== 'builder' && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            {myRoutine && (
              <button className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold cursor-pointer transition-all ${selectedId === 'my-routine' ? 'bg-qsis text-white' : 'bg-dark-bg3 border border-dark-border text-dark-text2 hover:border-qsis'}`} onClick={() => setSelectedId('my-routine')}>
                <i className="fas fa-user-edit mr-1"></i>My Routine
              </button>
            )}
            {routines.map(r => (
              <button key={r.id} className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold cursor-pointer transition-all ${r.id === selectedId ? 'bg-qsis text-white' : 'bg-dark-bg3 border border-dark-border text-dark-text2 hover:border-qsis'}`} onClick={() => setSelectedId(r.id)}>
                {r.semester}{r.branch ? ` - ${r.branch}` : ''}
              </button>
            ))}
          </div>
        )}

        {exporting && (
          <div className="mb-4 p-3 rounded-xl bg-qsis/10 border border-qsis/20 text-qsis text-[0.82rem] flex items-center gap-2"><i className="fas fa-spinner fa-spin"></i> Generating export...</div>
        )}
      </div>

      {selectedId === 'builder' ? (
        <RoutineBuilder
          existing={myRoutine}
          onSave={(r) => { saveMyRoutine(r); setMyRoutine(r); setSelectedId('my-routine'); showToast('Routine saved!', 'success'); }}
          onCancel={() => setSelectedId(myRoutine ? 'my-routine' : routines[0]?.id || '')}
        />
      ) : !current ? (
        <div className="no-print text-center py-12 text-dark-bg2 rounded-2xl border border-dark-border">
          <i className="fas fa-calendar-times text-4xl text-dark-text2 mb-3 block opacity-30"></i>
          <p className="text-[0.9rem] text-dark-text2">No routine available yet.</p>
          <p className="text-[0.78rem] text-dark-text2 mt-1 opacity-60">Click &quot;Create My Routine&quot; to build your own schedule.</p>
        </div>
      ) : (
        <RoutinePrintView ref={printRef} routine={current} />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   ROUTINE PRINT VIEW
   ═══════════════════════════════════════════════════════ */
import { forwardRef } from 'react';

const RoutinePrintView = forwardRef<HTMLDivElement, { routine: RoutineItem }>(({ routine }, ref) => {
  const classPeriods = routine.periods.filter(p => !p.isBreak);
  return (
    <div ref={ref} className="routine-export">
      <div className="routine-header">
        <div className="routine-header-inner">
          <div className="routine-logo-wrapper"><Image src="/iiuc-logo.png" alt="IIUC" width={72} height={72} className="routine-logo" priority /></div>
          <h1 className="routine-university-name">{routine.university}</h1>
          <p className="routine-arabic-name">&#x262F;&#x2015;&#x627;&#x644;&#x62C;&#x627;&#x645;&#x639;&#x629; &#x627;&#x644;&#x625;&#x633;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x627;&#x644;&#x62F;&#x648;&#x644;&#x64A;&#x629; &#x634;&#x64A;&#x62A;&#x627;&#x63A;&#x648;&#x646;&#x63A;</p>
          <p className="routine-dept-name">{routine.department}</p>
          <div className="routine-title-bar"><h2 className="routine-title">Class Routine</h2></div>
          <div className="routine-badges">
            <span className="routine-badge-semester">{routine.semester}</span>
            {routine.branch && <span className="routine-badge-session">Branch: {routine.branch}</span>}
            <span className="routine-badge-session">Session: {routine.session}</span>
          </div>
        </div>
      </div>

      {routine.courses.length > 0 && (
        <div className="routine-legend">
          <h4 className="routine-legend-title"><i className="fas fa-book-open mr-1"></i> Course Information</h4>
          <div className="routine-legend-grid">
            {routine.courses.map(c => (
              <div key={c.code} className="routine-legend-item">
                <span className="routine-legend-code">{c.code}</span>
                <span className="routine-legend-title-text">{c.title}</span>
                <span className="routine-legend-teacher">{c.teacher}</span>
                <span className="routine-legend-room">{c.room}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
                const classIdx = pIdx;
                return (
                  <tr key={pIdx} className="routine-break-row">
                    <td className="routine-td routine-td-time routine-break-time">
                      <div className="routine-time-text">{period.start}</div>
                      <div className="routine-time-sub">{period.end}</div>
                    </td>
                    {routine.days.map((day, dIdx) => (
                      <td key={day} className="routine-td routine-break-cell">
                        {dIdx === Math.floor(routine.days.length / 2) ? <span className="routine-break-label">{period.name}</span> : null}
                      </td>
                    ))}
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
                    const slot = getSlot(day, classPeriodIdx, routine.slots);
                    const course = slot ? getCourse(slot.course, routine.courses) : null;
                    const offDay = isOffDay(day, routine.periods, routine.slots);
                    return (
                      <td key={day} className={`routine-td ${offDay && !slot ? 'routine-offday-cell' : ''}`}>
                        {slot && course ? (
                          <div className="routine-course">
                            <span className="routine-course-code">{course.code}</span>
                          </div>
                        ) : offDay && classPeriodIdx === 0 ? (
                          <span className="routine-offday-label">Off Day</span>
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
          <p className="routine-generated">Generated by <strong>QSIS Academic Resource Management System</strong></p>
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
   ROUTINE BUILDER — Full Flexible Editor
   ═══════════════════════════════════════════════════════ */
type BuilderTab = 'info' | 'periods' | 'courses' | 'grid';

function RoutineBuilder({ existing, onSave, onCancel }: { existing: RoutineItem | null; onSave: (r: RoutineItem) => void; onCancel: () => void }) {
  const [tab, setTab] = useState<BuilderTab>('info');
  const [semester, setSemester] = useState(existing?.semester || SEMESTERS[0]);
  const [branch, setBranch] = useState(existing?.branch || '');
  const [session, setSession] = useState(existing?.session || '2023-24');
  const [periods, setPeriods] = useState<RoutinePeriod[]>(existing?.periods || [...DEFAULT_PERIODS]);
  const [days, setDays] = useState<string[]>(existing?.days || [...DEFAULT_DAYS]);
  const [courses, setCourses] = useState<RoutineCourse[]>(existing?.courses || []);
  const [slots, setSlots] = useState<RoutineSlot[]>(existing?.slots || []);

  const classPeriods = periods.filter(p => !p.isBreak);
  const nonBreakIdx = (pIdx: number) => {
    let count = 0;
    for (let i = 0; i <= pIdx; i++) { if (!periods[i].isBreak) count++; }
    return count - 1;
  };

  const addPeriod = () => {
    setPeriods([...periods, { name: `Period ${periods.filter(p => !p.isBreak).length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  };
  const updatePeriod = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...periods]; p[idx] = { ...p[idx], [field]: value }; setPeriods(p);
  };
  const removePeriod = (idx: number) => { setPeriods(periods.filter((_, i) => i !== idx)); };
  const movePeriod = (idx: number, dir: -1 | 1) => {
    const p = [...periods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; setPeriods(p);
  };

  const addCourse = () => { setCourses([...courses, { code: '', title: '', teacher: '', room: '' }]); };
  const updateCourse = (idx: number, field: keyof RoutineCourse, value: string) => {
    const c = [...courses]; c[idx] = { ...c[idx], [field]: value }; setCourses(c);
  };
  const removeCourse = (idx: number) => { setCourses(courses.filter((_, i) => i !== idx)); setSlots(slots.filter(s => s.course !== courses[idx].code)); };

  const toggleDay = (day: string) => { setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort()); };
  const addDay = (day: string) => { if (!days.includes(day)) setDays([...days, day].sort()); };
  const removeDay = (day: string) => { setDays(days.filter(d => d !== day)); setSlots(slots.filter(s => s.day !== day)); };

  const setSlot = (day: string, period: number, courseCode: string) => {
    const existing = slots.find(s => s.day === day && s.period === period);
    if (courseCode === '') {
      setSlots(slots.filter(s => !(s.day === day && s.period === period)));
    } else if (existing) {
      setSlots(slots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode } : s));
    } else {
      setSlots([...slots, { day, period, course: courseCode }]);
    }
  };

  const handleSave = () => {
    if (!semester) { showToast('Please select semester', 'error'); return; }
    const routine: RoutineItem = {
      id: existing?.id || `my-${Date.now()}`,
      semester, branch: branch || null, session,
      academicYear: existing?.academicYear || new Date().getFullYear().toString(),
      department: existing?.department || 'Department of Qur\'anic Sciences & Islamic Studies',
      university: existing?.university || 'International Islamic University Chittagong',
      periods, days, courses, slots,
    };
    onSave(routine);
  };

  const tabs: { key: BuilderTab; label: string; icon: string }[] = [
    { key: 'info', label: 'Info', icon: 'info-circle' },
    { key: 'periods', label: 'Time Slots', icon: 'clock' },
    { key: 'courses', label: 'Courses', icon: 'book' },
    { key: 'grid', label: 'Assign', icon: 'table' },
  ];

  return (
    <div className="routine-builder">
      <div className="routine-builder-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`routine-builder-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <i className={`fas fa-${t.icon}`}></i> {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="routine-builder-section">
          <h4>Routine Information</h4>
          <div className="routine-builder-grid">
            <div><label>Semester</label><select value={semester} onChange={e => setSemester(e.target.value)}>{SEMESTERS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label>Branch (optional)</label><input placeholder="e.g. A, B, or leave empty" value={branch} onChange={e => setBranch(e.target.value)} /></div>
            <div><label>Session</label><input placeholder="e.g. 2023-24" value={session} onChange={e => setSession(e.target.value)} /></div>
            <div><label>Days</label>
              <div className="routine-builder-days">
                {['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => (
                  <button key={d} className={`routine-builder-day-btn ${days.includes(d) ? 'active' : ''}`} onClick={() => toggleDay(d)}>{d.slice(0, 3)}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'periods' && (
        <div className="routine-builder-section">
          <div className="routine-builder-section-header">
            <h4>Time Periods</h4>
            <button className="routine-builder-add-btn" onClick={addPeriod}><i className="fas fa-plus"></i> Add Period</button>
          </div>
          <p className="routine-builder-hint">Drag to reorder. Toggle break for lunch/prayer. Default IIUC times are pre-filled.</p>
          <div className="routine-builder-periods">
            {periods.map((p, idx) => (
              <div key={idx} className={`routine-builder-period ${p.isBreak ? 'break' : ''}`}>
                <div className="routine-builder-period-drag">
                  <button disabled={idx === 0} onClick={() => movePeriod(idx, -1)}><i className="fas fa-chevron-up"></i></button>
                  <button disabled={idx === periods.length - 1} onClick={() => movePeriod(idx, 1)}><i className="fas fa-chevron-down"></i></button>
                </div>
                <input className="period-name-input" placeholder="Period name" value={p.name} onChange={e => updatePeriod(idx, 'name', e.target.value)} />
                <input type="time" className="period-time-input" value={to24h(p.start)} onChange={e => updatePeriod(idx, 'start', to12h(e.target.value))} />
                <span className="period-sep">to</span>
                <input type="time" className="period-time-input" value={to24h(p.end)} onChange={e => updatePeriod(idx, 'end', to12h(e.target.value))} />
                <label className="routine-builder-break-toggle">
                  <input type="checkbox" checked={!!p.isBreak} onChange={e => updatePeriod(idx, 'isBreak', e.target.checked)} /> Break
                </label>
                <button className="routine-builder-remove-btn" onClick={() => removePeriod(idx)}><i className="fas fa-trash"></i></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'courses' && (
        <div className="routine-builder-section">
          <div className="routine-builder-section-header">
            <h4>Courses</h4>
            <button className="routine-builder-add-btn" onClick={addCourse}><i className="fas fa-plus"></i> Add Course</button>
          </div>
          <div className="routine-builder-courses">
            {courses.map((c, idx) => (
              <div key={idx} className="routine-builder-course">
                <input placeholder="Code (e.g. FSC-1201)" value={c.code} onChange={e => updateCourse(idx, 'code', e.target.value)} />
                <input placeholder="Title (e.g. Quran & Tafsir)" value={c.title} onChange={e => updateCourse(idx, 'title', e.target.value)} />
                <input placeholder="Teacher (e.g. Dr. Ahmad)" value={c.teacher} onChange={e => updateCourse(idx, 'teacher', e.target.value)} />
                <input placeholder="Room (e.g. Room 301)" value={c.room} onChange={e => updateCourse(idx, 'room', e.target.value)} />
                <button className="routine-builder-remove-btn" onClick={() => removeCourse(idx)}><i className="fas fa-trash"></i></button>
              </div>
            ))}
            {courses.length === 0 && <p className="routine-builder-hint">No courses added yet. Click &quot;Add Course&quot; to start.</p>}
          </div>
        </div>
      )}

      {tab === 'grid' && (
        <div className="routine-builder-section">
          <h4>Assign Courses to Schedule</h4>
          <p className="routine-builder-hint">Select a course for each day/period. Empty cells = Off Day.</p>
          <div className="routine-builder-grid-wrapper">
            <table className="routine-builder-grid">
              <thead>
                <tr>
                  <th>Period</th>
                  {days.map(d => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map((p, pIdx) => {
                  if (p.isBreak) {
                    return (
                      <tr key={pIdx} className="routine-builder-grid-break">
                        <td className="routine-builder-grid-time">{p.start} - {p.end}</td>
                        {days.map(d => <td key={d}>Break</td>)}
                      </tr>
                    );
                  }
                  const cpIdx = nonBreakIdx(pIdx);
                  return (
                    <tr key={pIdx}>
                      <td className="routine-builder-grid-time"><div>{p.name}</div><div className="routine-builder-grid-time-sub">{p.start} - {p.end}</div></td>
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
          <div className="routine-builder-offday-info">
            <i className="fas fa-info-circle"></i> Days with no courses assigned will show as &quot;Off Day&quot; in the routine.
          </div>
        </div>
      )}

      <div className="routine-builder-actions">
        <button className="routine-builder-save-btn" onClick={handleSave}><i className="fas fa-save"></i> Save Routine</button>
        <button className="routine-builder-cancel-btn" onClick={onCancel}><i className="fas fa-times"></i> Cancel</button>
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
