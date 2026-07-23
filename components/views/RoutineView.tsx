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

function getCourse(code: string, courses: RoutineCourse[]) {
  return courses.find(c => c.code === code);
}

function getSlot(day: string, period: number, slots: RoutineSlot[]) {
  return slots.find(s => s.day === day && s.period === period);
}

export default function RoutineView() {
  const router = useRouter();
  const { data: session } = useSession();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);
  const loadRoutine = useAppStore(s => s.loadRoutine);
  const profile = useAppStore(s => s.profile);
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [editSlots, setEditSlots] = useState<RoutineSlot[]>([]);

  const isOwner = config.ownerEmails.includes(profile.email || '') ||
    config.ownerEmails.includes((session as any)?.user?.email || '');

  const routines: RoutineItem[] = Array.isArray(routineData) ? routineData : [];
  const current = routines.find(r => r.id === selectedId) || routines[0] || null;

  useEffect(() => {
    if (routines.length > 0 && !selectedId) {
      setSelectedId(routines[0].id);
    }
  }, [routines, selectedId]);

  useEffect(() => {
    if (routines.length === 0 && !routineLoading) {
      loadRoutine();
    }
  }, [routines.length, routineLoading, loadRoutine]);

  useEffect(() => {
    if (current && editing) {
      setEditSlots(JSON.parse(JSON.stringify(current.slots)));
    }
  }, [current?.id, editing]);

  const handleExport = useCallback(async (format: 'pdf' | 'png' | 'jpeg') => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
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
            const sliceData = sliceCanvas.toDataURL('image/png');
            const sliceH = (sliceCanvas.height * imgW) / canvas.width;
            pdf.addImage(sliceData, 'PNG', margin, margin, imgW, sliceH);
            yPos += sourceH;
          }
        }
        pdf.save(`QSIS-ARMS-${current?.semester || 'Routine'}.pdf`);
      } else {
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const link = document.createElement('a');
        link.download = `QSIS-ARMS-${current?.semester || 'Routine'}.${format}`;
        link.href = canvas.toDataURL(mimeType, 0.95);
        link.click();
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [current]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  const startEdit = useCallback(() => {
    if (current) {
      setEditSlots(JSON.parse(JSON.stringify(current.slots)));
      setEditing(true);
    }
  }, [current]);

  const saveEdit = useCallback(() => {
    if (!current) return;
    const updated = { ...current, slots: editSlots };
    const allRoutines = routines.map(r => r.id === current.id ? updated : r);
    const blob = new Blob([JSON.stringify(allRoutines, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'routine.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Download updated routine.json and replace in /public/', 'info');
    setEditing(false);
  }, [current, editSlots, routines]);

  const addSlot = useCallback(() => {
    if (!current) return;
    setEditSlots([...editSlots, { day: current.days[0], period: 0, course: '' }]);
  }, [current, editSlots]);

  const updateSlot = useCallback((index: number, field: keyof RoutineSlot, value: string | number) => {
    const newSlots = [...editSlots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setEditSlots(newSlots);
  }, [editSlots]);

  const removeSlot = useCallback((index: number) => {
    setEditSlots(editSlots.filter((_, i) => i !== index));
  }, [editSlots]);

  if (routineLoading) {
    return (
      <section className="mb-5">
        <div className="no-print flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
          <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>
        <div className="loading-container">
          <div className="book-loader">
            <div className="book-base"></div><div className="book-spine-loader"></div><div className="book-cover"></div>
            <div className="book-page-stack"><div className="book-page"></div><div className="book-page"></div><div className="book-page"></div></div>
            <div className="page-shadow"></div><div className="page-shadow"></div><div className="page-shadow"></div>
          </div>
          <div className="loading-text">Loading routine<span className="loading-dots"></span></div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5">
      {/* Toolbar */}
      <div className="no-print">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
          <div className="flex items-center gap-2">
            {current && !editing && (
              <>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('pdf')}>
                  <i className="fas fa-file-pdf text-red-400"></i> PDF
                </button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('png')}>
                  <i className="fas fa-image text-blue-400"></i> PNG
                </button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:border-qsis transition-all disabled:opacity-50" onClick={() => handleExport('jpeg')}>
                  <i className="fas fa-camera text-yellow-400"></i> JPEG
                </button>
                <button disabled={exporting} className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-qsis/30 bg-qsis/10 text-qsis cursor-pointer text-[0.75rem] font-semibold hover:bg-qsis/20 transition-all disabled:opacity-50" onClick={handlePrint}>
                  <i className="fas fa-print"></i> Print
                </button>
                <button className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-accent/30 bg-accent/10 text-accent cursor-pointer text-[0.75rem] font-semibold hover:bg-accent/20 transition-all" onClick={startEdit}>
                  <i className="fas fa-edit"></i> Edit
                </button>
              </>
            )}
            {editing && (
              <>
                <button className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl bg-qsis text-white cursor-pointer text-[0.75rem] font-semibold hover:opacity-90 transition-all" onClick={saveEdit}>
                  <i className="fas fa-download"></i> Download Updated
                </button>
                <button className="inline-flex items-center gap-[5px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => setEditing(false)}>
                  <i className="fas fa-times"></i> Cancel
                </button>
              </>
            )}
            <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
              <i className="fas fa-arrow-left"></i> Back
            </button>
          </div>
        </div>

        {/* Semester Selector */}
        {routines.length > 1 && !editing && (
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-[0.78rem] text-dark-text2 font-semibold"><i className="fas fa-filter mr-1"></i>Select Routine:</span>
            {routines.map(r => (
              <button key={r.id} className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-semibold cursor-pointer transition-all ${r.id === selectedId ? 'bg-qsis text-white' : 'bg-dark-bg3 border border-dark-border text-dark-text2 hover:border-qsis'}`} onClick={() => setSelectedId(r.id)}>
                {r.semester}{r.branch ? ` - Branch ${r.branch}` : ''}
              </button>
            ))}
          </div>
        )}

        {editing && (
          <div className="mb-4 p-3 rounded-xl bg-accent/10 border border-accent/20 text-accent text-[0.82rem] flex items-center gap-2">
            <i className="fas fa-info-circle"></i> Edit mode. Add, modify, or remove slots. Click Download to save.
            <button className="ml-auto text-[0.75rem] font-semibold underline" onClick={addSlot}><i className="fas fa-plus mr-1"></i>Add Slot</button>
          </div>
        )}
        {exporting && (
          <div className="mb-4 p-3 rounded-xl bg-qsis/10 border border-qsis/20 text-qsis text-[0.82rem] flex items-center gap-2">
            <i className="fas fa-spinner fa-spin"></i> Generating export, please wait...
          </div>
        )}
      </div>

      {!current ? (
        <div className="no-print text-center py-12 text-dark-bg2 rounded-2xl border border-dark-border">
          <i className="fas fa-calendar-times text-4xl text-dark-text2 mb-3 block opacity-30"></i>
          <p className="text-[0.9rem] text-dark-text2">No routine available yet.</p>
          <p className="text-[0.78rem] text-dark-text2 mt-1 opacity-60">Class routine will be published by the department.</p>
          <a href="https://www.facebook.com/DQSIS" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-qsis/10 text-qsis text-[0.8rem] font-semibold hover:bg-qsis/20 transition-all">
            <i className="fab fa-facebook"></i> Check Facebook for Updates
          </a>
        </div>
      ) : (
        <div ref={printRef} className="routine-export">
          {/* HEADER */}
          <div className="routine-header">
            <div className="routine-header-inner">
              <div className="routine-logo-wrapper">
                <Image src="/iiuc-logo.png" alt="IIUC" width={72} height={72} className="routine-logo" priority />
              </div>
              <h1 className="routine-university-name">{current.university}</h1>
              <p className="routine-arabic-name">&#x262F;&#x2015;&#x627;&#x644;&#x62C;&#x627;&#x645;&#x639;&#x629; &#x627;&#x644;&#x625;&#x633;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x627;&#x644;&#x62F;&#x648;&#x644;&#x64A;&#x629; &#x634;&#x64A;&#x62A;&#x627;&#x63A;&#x648;&#x646;&#x63A;</p>
              <p className="routine-dept-name">{current.department}</p>
              <div className="routine-title-bar">
                <h2 className="routine-title">Class Routine</h2>
              </div>
              <div className="routine-badges">
                <span className="routine-badge-semester">{current.semester}</span>
                {current.branch && <span className="routine-badge-session">Branch: {current.branch}</span>}
                <span className="routine-badge-session">Session: {current.session}</span>
                <span className="routine-badge-session">Year: {current.academicYear}</span>
              </div>
            </div>
          </div>

          {/* COURSE LEGEND */}
          <div className="routine-legend">
            <h4 className="routine-legend-title"><i className="fas fa-book-open mr-1"></i> Course Information</h4>
            <div className="routine-legend-grid">
              {current.courses.map(c => (
                <div key={c.code} className="routine-legend-item">
                  <span className="routine-legend-code">{c.code}</span>
                  <span className="routine-legend-title-text">{c.title}</span>
                  <span className="routine-legend-teacher">{c.teacher}</span>
                  <span className="routine-legend-room">{c.room}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TABLE */}
          <div className="routine-table-wrapper">
            <table className="routine-table">
              <thead>
                <tr>
                  <th className="routine-th routine-th-time">Time</th>
                  {current.days.map(day => (
                    <th key={day} className="routine-th">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {current.periods.map((period, pIdx) => {
                  if (period.isBreak) {
                    return (
                      <tr key={pIdx} className="routine-break-row">
                        <td className="routine-td routine-td-time routine-break-time">
                          <div className="routine-time-text">{period.start}</div>
                          <div className="routine-time-sub">{period.end}</div>
                        </td>
                        {current.days.map((day, dIdx) => (
                          <td key={day} className="routine-td routine-break-cell">
                            {dIdx === Math.floor(current.days.length / 2) ? (
                              <span className="routine-break-label">{period.name}</span>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    );
                  }
                  return (
                    <tr key={pIdx}>
                      <td className="routine-td routine-td-time">
                        <div className="routine-period-name">{period.name}</div>
                        <div className="routine-time-text">{period.start}</div>
                        <div className="routine-time-sub">{period.end}</div>
                      </td>
                      {current.days.map(day => {
                        if (editing) {
                          const editIdx = editSlots.findIndex(s => s.day === day && s.period === pIdx);
                          return (
                            <td key={day} className="routine-td routine-td-edit">
                              {editIdx >= 0 ? (
                                <div className="routine-edit-form">
                                  <select className="routine-edit-select" value={editSlots[editIdx].course} onChange={e => updateSlot(editIdx, 'course', e.target.value)}>
                                    <option value="">-- Empty --</option>
                                    {current.courses.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                  </select>
                                  <button className="routine-edit-remove" onClick={() => removeSlot(editIdx)}><i className="fas fa-times"></i></button>
                                </div>
                              ) : (
                                <button className="routine-edit-add" onClick={() => {
                                  setEditSlots([...editSlots, { day, period: pIdx, course: '' }]);
                                }}><i className="fas fa-plus"></i></button>
                              )}
                            </td>
                          );
                        }
                        const slot = getSlot(day, pIdx, current.slots);
                        const course = slot ? getCourse(slot.course, current.courses) : null;
                        return (
                          <td key={day} className="routine-td">
                            {slot && course ? (
                              <div className="routine-course">
                                <span className="routine-course-code">{course.code}</span>
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

          {/* FOOTER */}
          <div className="routine-footer">
            <div className="routine-footer-grid">
              <div className="routine-footer-notes">
                <h4>Important Notes</h4>
                <ul>
                  <li>Students must arrive 5 minutes before class.</li>
                  <li>Any schedule change will be notified via department notice board.</li>
                  <li>Midterm and final exam schedules are separate.</li>
                  <li>For queries, contact the department office.</li>
                </ul>
              </div>
              <div className="routine-footer-timing">
                <h4>Timing Information</h4>
                <p><strong>Class Duration:</strong> 50 minutes</p>
                <p><strong>Break:</strong> 10 minutes between classes</p>
                <p><strong>Lunch &amp; Zuhr Prayer:</strong> 01:10 PM - 01:50 PM</p>
                <p><strong>Office Hours:</strong> 9:00 AM - 4:00 PM</p>
              </div>
            </div>
            <div className="routine-footer-center">
              <p className="routine-generated">Generated by <strong>QSIS Academic Resource Management System</strong></p>
              <p className="routine-updated">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="routine-footer-signature">
              <div className="routine-sig-box">
                <div className="routine-sig-line"></div>
                <p>Head of Department</p>
              </div>
              <div className="routine-sig-box">
                <div className="routine-sig-line"></div>
                <p>Program Coordinator</p>
              </div>
            </div>
            <div className="routine-footer-strip">
              <p>&copy; {new Date().getFullYear()} QSIS-ARMS &mdash; Qur&apos;anic Sciences &amp; Islamic Studies, IIUC</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
