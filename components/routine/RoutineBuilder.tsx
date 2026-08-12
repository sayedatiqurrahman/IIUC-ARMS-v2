'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import TeacherAutocomplete from '@/components/TeacherAutocomplete';
import CustomSelect from '@/components/CustomSelect';
import { config } from '@/lib/config';
import type { RoutineItem, RoutinePeriod, RoutineCourse, RoutineSlot, BuilderStep } from './types';
import { SEMESTERS, DEFAULT_PERIODS, DEFAULT_DAYS, DEFAULT_FEMALE_PERIODS } from './types';
import { getDefaultSession, getSlot, loadDraft, saveDraft, clearDraft, to24h, to12h } from './helpers';
import { showToast } from '@/lib/utils';
import PeriodEditor from './PeriodEditor';
import { useAppStore } from '@/lib/store';

export default function RoutineBuilder({ existing, onSave, onCancel }: { existing: RoutineItem | null; onSave: (r: RoutineItem) => void; onCancel: () => void }) {
  const [step, setStep] = useState<BuilderStep>('info');
  const [semester, setSemester] = useState(existing?.semester || SEMESTERS[0]);
  const [branch, setBranch] = useState(existing?.branch || '');
  const [gender, setGender] = useState<'male' | 'female' | 'both' | null>(existing?.gender || null);
  const [department, setDepartment] = useState(existing?.department || 'Department of Qur\'anic Sciences & Islamic Studies');
  const [session, setSession] = useState(existing?.session || getDefaultSession());
  const [room, setRoom] = useState(existing?.room || '');
  const [maleRoom, setMaleRoom] = useState(existing?.maleRoom || '');
  const [femaleRoom, setFemaleRoom] = useState(existing?.femaleRoom || '');
  const [periods, setPeriods] = useState<RoutinePeriod[]>(existing?.periods || [...DEFAULT_PERIODS]);
  const [days, setDays] = useState<string[]>(existing?.days || [...DEFAULT_DAYS]);
  const [courses, setCourses] = useState<RoutineCourse[]>(existing?.courses || []);
  const [slots, setSlots] = useState<RoutineSlot[]>(existing?.slots || []);
  const [malePeriods, setMalePeriods] = useState<RoutinePeriod[]>(existing?.malePeriods || [...DEFAULT_PERIODS]);
  const [femalePeriods, setFemalePeriods] = useState<RoutinePeriod[]>(existing?.femalePeriods || [...DEFAULT_FEMALE_PERIODS]);
  const [maleSlots, setMaleSlots] = useState<RoutineSlot[]>(existing?.maleSlots || []);
  const [femaleSlots, setFemaleSlots] = useState<RoutineSlot[]>(existing?.femaleSlots || []);
  const [periodTab, setPeriodTab] = useState<'male' | 'female'>('male');
  const [draftSaved, setDraftSaved] = useState(false);
  const [semesterCourses, setSemesterCourses] = useState<{ code: string; title: string; teacher: string; room: string }[]>([]);
  const [codeSuggestions, setCodeSuggestions] = useState<{ idx: number; matches: { code: string; title: string; teacher: string; room: string }[] } | null>(null);

  useEffect(() => {
    if (!semester) { setSemesterCourses([]); return; }
    fetch(`/api/semester-courses?semester=${encodeURIComponent(semester)}&department=${encodeURIComponent(department)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.courses)) {
          setSemesterCourses(data.courses.map((c: any) => ({ code: c.code, title: c.title, teacher: c.teacher || '', room: c.room || '' })));
        }
      })
      .catch(() => {});
  }, [semester, department]);

  useEffect(() => {
    if (existing) return;
    const draft = loadDraft();
    if (draft) {
      if (draft.semester) setSemester(draft.semester);
      if (draft.branch !== undefined) setBranch(draft.branch || '');
      if (draft.gender !== undefined) setGender(draft.gender || null);
      if (draft.session) setSession(draft.session);
      if (draft.room !== undefined) setRoom(draft.room || '');
      if (draft.maleRoom !== undefined) setMaleRoom(draft.maleRoom || '');
      if (draft.femaleRoom !== undefined) setFemaleRoom(draft.femaleRoom || '');
      if (draft.periods) setPeriods(draft.periods);
      if (draft.days) setDays(draft.days);
      if (draft.courses) setCourses(draft.courses);
      if (draft.slots) setSlots(draft.slots);
      if (draft.malePeriods) setMalePeriods(draft.malePeriods);
      if (draft.femalePeriods) setFemalePeriods(draft.femalePeriods);
      if (draft.maleSlots) setMaleSlots(draft.maleSlots);
      if (draft.femaleSlots) setFemaleSlots(draft.femaleSlots);
      if (draft.step) setStep(draft.step as BuilderStep);
      showToast('Draft restored from previous session', 'success');
    }
  }, []);

  useEffect(() => {
    if (!semester || semesterCourses.length === 0 || existing || courses.length > 0) return;
    setCourses(semesterCourses.map(c => ({ code: c.code, title: c.title, teacher: c.teacher, room: c.room })));
  }, [semesterCourses, existing, courses.length]);

  useEffect(() => {
    if (existing) return;
    const timer = setTimeout(() => {
      saveDraft({ semester, branch, gender, session, room, periods, days, courses, slots, malePeriods, femalePeriods, maleSlots, femaleSlots, step, maleRoom, femaleRoom });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }, 1000);
    return () => clearTimeout(timer);
  }, [semester, branch, gender, session, room, periods, days, courses, slots, malePeriods, femalePeriods, maleSlots, femaleSlots, step, existing, maleRoom, femaleRoom]);

  const classPeriods = periods.filter(p => !p.isBreak);
  const nonBreakIdx = (pIdx: number, refPeriods: RoutinePeriod[]) => {
    let count = 0;
    for (let i = 0; i <= pIdx; i++) { if (!refPeriods[i].isBreak) count++; }
    return count - 1;
  };

  const isBoth = gender === 'both';
  const isFemale = gender === 'female';
  const activePeriods = isBoth ? (periodTab === 'male' ? malePeriods : femalePeriods) : isFemale ? femalePeriods : periods;
  const activeSlots = isBoth ? (periodTab === 'male' ? maleSlots : femaleSlots) : isFemale ? femaleSlots : slots;
  const setActivePeriods = isBoth ? (periodTab === 'male' ? setMalePeriods : setFemalePeriods) : isFemale ? setFemalePeriods : setPeriods;
  const setActiveSlots = isBoth ? (periodTab === 'male' ? setMaleSlots : setFemaleSlots) : isFemale ? setFemaleSlots : setSlots;

  const activeClassPeriods = activePeriods.filter(p => !p.isBreak);

  const addPeriodForActive = () => setActivePeriods([...activePeriods, { name: `Period ${activeClassPeriods.length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  const updatePeriodForActive = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...activePeriods]; p[idx] = { ...p[idx], [field]: value }; setActivePeriods(p);
  };
  const removePeriodForActive = (idx: number) => setActivePeriods(activePeriods.filter((_, i) => i !== idx));
  const movePeriodForActive = (idx: number, dir: -1 | 1) => {
    const p = [...activePeriods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; setActivePeriods(p);
  };

  const setSlotForActive = (day: string, period: number, courseCode: string) => {
    if (courseCode === '') {
      setActiveSlots(activeSlots.filter(s => !(s.day === day && s.period === period)));
    } else if (activeSlots.find(s => s.day === day && s.period === period)) {
      setActiveSlots(activeSlots.map(s => s.day === day && s.period === period ? { ...s, course: courseCode } : s));
    } else {
      setActiveSlots([...activeSlots, { day, period, course: courseCode }]);
    }
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
    if (field === 'code' && value.trim()) {
      const matches = semesterCourses.filter(sc => sc.code.toLowerCase().includes(value.toLowerCase()));
      if (matches.length > 0 && !(matches.length === 1 && matches[0].code.toLowerCase() === value.toLowerCase())) {
        setCodeSuggestions({ idx, matches: matches.slice(0, 5) });
      } else {
        setCodeSuggestions(null);
        if (matches.length === 1 && matches[0].code.toLowerCase() === value.toLowerCase()) {
          c[idx].title = matches[0].title;
          if (!c[idx].teacher && matches[0].teacher) c[idx].teacher = matches[0].teacher;
        }
      }
    } else if (field === 'code') {
      setCodeSuggestions(null);
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
      semester, branch: branch || null, gender, session, room: room || '',
      department: department,
      academicYear: existing?.academicYear || new Date().getFullYear().toString(),
      university: existing?.university || 'International Islamic University Chittagong',
      periods, days, courses, slots,
      ...(isBoth ? { malePeriods, femalePeriods, maleSlots, femaleSlots, maleRoom, femaleRoom } : {}),
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
              <CustomSelect
                value={semester}
                onChange={(val) => setSemester(val)}
                placeholder="Select semester"
                options={SEMESTERS.map(s => ({ value: s, label: s }))}
              />
            </div>
            <div className="routine-form-group">
              <label>Section <span className="routine-label-optional">(optional)</span></label>
              <input placeholder="e.g. A, B" value={branch} onChange={e => setBranch(e.target.value)} />
            </div>
            <div className="routine-form-group">
              <label>Branch</label>
              <CustomSelect
                value={gender || ''}
                onChange={(val) => setGender((val || null) as 'male' | 'female' | 'both' | null)}
                placeholder="Select branch"
                options={[
                  { value: 'male', label: 'Male', icon: 'fas fa-mars' },
                  { value: 'female', label: 'Female', icon: 'fas fa-venus' },
                  { value: 'both', label: 'Both (Male & Female)', icon: 'fas fa-venus-mars' },
                ]}
              />
            </div>
            <div className="routine-form-group">
              <label>Session</label>
              <input placeholder="e.g. Spring - 2026" value={session} onChange={e => setSession(e.target.value)} />
            </div>
            {gender === 'both' ? (
              <>
                <div className="routine-form-group">
                  <label><i className="fas fa-mars text-blue-400 mr-1"></i>Male Room</label>
                  <input placeholder="e.g. Room 301" value={maleRoom} onChange={e => setMaleRoom(e.target.value)} />
                </div>
                <div className="routine-form-group">
                  <label><i className="fas fa-venus text-pink-400 mr-1"></i>Female Room</label>
                  <input placeholder="e.g. Room 202" value={femaleRoom} onChange={e => setFemaleRoom(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="routine-form-group">
                <label>Room / Venue</label>
                <input placeholder="e.g. Room 301, Building B" value={room} onChange={e => setRoom(e.target.value)} />
              </div>
            )}
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
                  <div className="routine-course-fields" style={{ position: 'relative' }}>
                    <div style={{ position: 'relative' }}>
                      <input className="routine-input-sm" placeholder="Code (e.g. QSM-3601)" value={c.code} onChange={e => updateCourse(idx, 'code', e.target.value)} onBlur={() => setTimeout(() => setCodeSuggestions(null), 200)} />
                      {codeSuggestions?.idx === idx && codeSuggestions.matches.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 160, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                          {codeSuggestions.matches.map((m, mi) => (
                            <div key={mi} onClick={() => {
                              const c2 = [...courses];
                              c2[idx] = { ...c2[idx], code: m.code, title: m.title, teacher: m.teacher || c2[idx].teacher, room: m.room || c2[idx].room };
                              setCourses(c2);
                              setCodeSuggestions(null);
                            }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem', borderBottom: mi < codeSuggestions.matches.length - 1 ? '1px solid var(--border)' : 'none' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{m.code}</span>
                              <span style={{ marginLeft: 6, color: 'var(--text3, #94a3b8)', fontSize: '0.7rem' }}>{m.title}</span>
                              {m.teacher && <span style={{ marginLeft: 6, color: 'var(--text3, #94a3b8)', fontSize: '0.65rem' }}>({m.teacher})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
            <h4><i className="fas fa-clock"></i> Time Periods{isBoth ? ` — ${periodTab === 'male' ? 'Male' : 'Female'}` : isFemale ? ' — Female' : ''}</h4>
            <button className="routine-add-btn" onClick={addPeriodForActive}><i className="fas fa-plus"></i> Add Period</button>
          </div>
          {isBoth && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button type="button" className={`routine-btn ${periodTab === 'male' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('male')} style={{ background: periodTab === 'male' ? '#3b82f6' : undefined, color: periodTab === 'male' ? '#fff' : undefined }}>
                <i className="fas fa-mars" style={{ marginRight: 4 }}></i> Male Periods
              </button>
              <button type="button" className={`routine-btn ${periodTab === 'female' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('female')} style={{ background: periodTab === 'female' ? '#ec4899' : undefined, color: periodTab === 'female' ? '#fff' : undefined }}>
                <i className="fas fa-venus" style={{ marginRight: 4 }}></i> Female Periods
              </button>
            </div>
          )}
          <div className="routine-period-list">
            {activePeriods.map((p, idx) => (
              <div key={idx} className={`routine-period-item ${p.isBreak ? 'break' : ''}`}>
                <div className="routine-period-drag">
                  <button disabled={idx === 0} onClick={() => movePeriodForActive(idx, -1)}><i className="fas fa-chevron-up"></i></button>
                  <button disabled={idx === activePeriods.length - 1} onClick={() => movePeriodForActive(idx, 1)}><i className="fas fa-chevron-down"></i></button>
                </div>
                <div className="routine-period-fields">
                  <input className="routine-period-name" placeholder="Period name" value={p.name} onChange={e => updatePeriodForActive(idx, 'name', e.target.value)} />
                  <div className="routine-period-times">
                    <input type="time" value={to24h(p.start)} onChange={e => updatePeriodForActive(idx, 'start', to12h(e.target.value))} />
                    <span className="routine-period-sep">to</span>
                    <input type="time" value={to24h(p.end)} onChange={e => updatePeriodForActive(idx, 'end', to12h(e.target.value))} />
                  </div>
                </div>
                <label className="routine-break-toggle">
                  <input type="checkbox" checked={!!p.isBreak} onChange={e => updatePeriodForActive(idx, 'isBreak', e.target.checked)} />
                  <span>Break</span>
                </label>
                <button className="routine-remove-btn-sm" onClick={() => removePeriodForActive(idx)}><i className="fas fa-times"></i></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'assign' && (
        <div className="routine-builder-section">
          <h4><i className="fas fa-table"></i> Assign Courses to Schedule{isBoth ? ` — ${periodTab === 'male' ? 'Male' : 'Female'}` : isFemale ? ' — Female' : ''}</h4>
          {isBoth && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button type="button" className={`routine-btn ${periodTab === 'male' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('male')} style={{ background: periodTab === 'male' ? '#3b82f6' : undefined, color: periodTab === 'male' ? '#fff' : undefined }}>
                <i className="fas fa-mars" style={{ marginRight: 4 }}></i> Male Schedule
              </button>
              <button type="button" className={`routine-btn ${periodTab === 'female' ? 'routine-btn-primary' : 'routine-btn-outline'}`} onClick={() => setPeriodTab('female')} style={{ background: periodTab === 'female' ? '#ec4899' : undefined, color: periodTab === 'female' ? '#fff' : undefined }}>
                <i className="fas fa-venus" style={{ marginRight: 4 }}></i> Female Schedule
              </button>
            </div>
          )}
          <p className="routine-builder-hint">Select a course for each day/period. Leave empty for Off Day.</p>
          {courses.length === 0 ? (
            <div className="routine-empty-courses">
              <i className="fas fa-exclamation-triangle"></i>
              <p>Please add courses first (Step 2) before assigning them to the schedule.</p>
            </div>
          ) : (
            <div className="routine-grid-wrapper">
              <div className="routine-grid-scroll">
                <table className="routine-grid-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      {days.map(d => <th key={d}>{d.slice(0, 3)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {activePeriods.map((p, pIdx) => {
                      if (p.isBreak) {
                        return (
                          <tr key={pIdx} className="routine-grid-break">
                            <td className="routine-grid-time">{p.start} - {p.end}</td>
                            {days.map(d => <td key={d}>Break</td>)}
                          </tr>
                        );
                      }
                      const cpIdx = nonBreakIdx(pIdx, activePeriods);
                      return (
                        <tr key={pIdx}>
                          <td className="routine-grid-time">
                            <div>{p.name}</div>
                            <small>{p.start} - {p.end}</small>
                          </td>
                          {days.map(d => {
                            const currentSlot = getSlot(d, cpIdx, activeSlots);
                            return (
                              <td key={d}>
                                <CustomSelect
                                  value={currentSlot?.course || ''}
                                  onChange={(val) => setSlotForActive(d, cpIdx, val)}
                                  placeholder="-- Off Day --"
                                  options={courses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}` }))}
                                  size="sm"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
