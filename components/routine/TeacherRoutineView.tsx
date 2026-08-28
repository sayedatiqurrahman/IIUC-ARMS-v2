'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import type { RoutineItem, RoutineCourse, RoutineSlot, RoutinePeriod } from './types';
import type { ExamRoutineItem } from '@/components/exam/types';
import { getDeptName } from '@/lib/telegram/categories';

// ─── Name matching (client-safe copy of lib/telegram/notifications helpers) ───

function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(dr|prof|professor|prof|mr|mrs|ms|md|sir|engr|eng)\b\.?/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(profileName: string, teacherName: string): boolean {
  const p = normalizeName(profileName);
  const t = normalizeName(teacherName);
  if (!p || !t) return false;
  if (p === t) return true;
  if (p.includes(t) || t.includes(p)) return p.length >= 3 && t.length >= 3;
  const pParts = p.split(' ');
  const tParts = t.split(' ');
  return pParts[pParts.length - 1] === tParts[tParts.length - 1] && (pParts.length >= 2 || tParts.length >= 2);
}

function splitTeachers(teacher?: string): string[] {
  return (teacher || '')
    .split(/[,，;、]/)
    .map(t => t.trim())
    .filter(Boolean);
}

function teacherMatchesCell(cellTeacher: string | undefined, selected: string): boolean {
  return splitTeachers(cellTeacher).some(t => nameMatches(selected, t));
}

interface ClassDuty {
  routine: RoutineItem;
  label?: string;
  period: RoutinePeriod;
  periodIdx: number;
  day: string;
  slot: RoutineSlot;
  course: RoutineCourse;
}

interface ExamDuty {
  date: string;
  day: string;
  slotName: string;
  time: string;
  code: string;
  title: string;
  room: string;
  semester: string;
  examType: string;
  department: string;
}

interface InvigilationDuty {
  date: string;
  slotName: string;
  time: string;
  room: string;
  roll: string;
  semester: string;
  examType: string;
  department: string;
}

const DAY_ORDER = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function fmtDate(date: string): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function getSlotTime(slotId: string, slots: any[]): string {
  const slot = (slots || []).find((s: any) => s.id === slotId);
  return slot ? `${slot.startTime || ''} – ${slot.endTime || ''}` : '';
}

export default function TeacherRoutineView({ initialTeacher, onTeacherChange }: { initialTeacher?: string; onTeacherChange?: (name: string) => void }) {
  const profile = useAppStore(s => s.profile);
  const [faculty, setFaculty] = useState<any[]>([]);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [examRoutines, setExamRoutines] = useState<ExamRoutineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(initialTeacher || '');
  const [selected, setSelected] = useState<string>(initialTeacher || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const autoDetectedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch('/api/faculty').then(r => r.json()).catch(() => ({ members: [] })),
      fetch('/api/published-routines').then(r => r.json()).catch(() => ({ routines: [] })),
      fetch('/api/published-exam-routines').then(r => r.json()).catch(() => ({ routines: [] })),
    ]).then(([fac, pub, exam]) => {
      if (!alive) return;
      setFaculty(fac.members || []);
      setRoutines(pub.routines || []);
      setExamRoutines(exam.routines || []);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  // Auto-detect the logged-in teacher via their claimed faculty profile
  useEffect(() => {
    if (autoDetectedRef.current) return;
    if (!profile.shortForm || faculty.length === 0) return;
    const linked = faculty.find((m: any) => m.shortForm?.toUpperCase() === String(profile.shortForm).toUpperCase());
    if (linked && linked.name) {
      autoDetectedRef.current = true;
      setSelected(linked.name);
      setQuery(linked.name);
      onTeacherChange?.(linked.name);
    }
  }, [profile.shortForm, faculty, onTeacherChange]);

  const handleSelect = useCallback((name: string) => {
    setSelected(name);
    setQuery(name);
    setShowSuggestions(false);
    onTeacherChange?.(name);
  }, [onTeacherChange]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalizeName(query);
    return faculty
      .filter((m: any) => {
        if (!m.name) return false;
        const n = normalizeName(m.name);
        const sf = String(m.shortForm || '').toUpperCase();
        return n.includes(q) || q.includes(n) || sf.includes(query.trim().toUpperCase());
      })
      .slice(0, 8);
  }, [faculty, query]);

  // ─── Compute the selected teacher's duties ───
  const data = useMemo(() => {
    const classes: ClassDuty[] = [];
    for (const r of routines) {
      if (!selected) break;
      const collect = (slots: RoutineSlot[], periods: RoutinePeriod[], label?: string) => {
        const classPeriods = (periods || []).filter(p => !p.isBreak);
        (slots || []).forEach(slot => {
          const course = (r.courses || []).find(c => c.code === slot.course);
          if (!course || !teacherMatchesCell(course.teacher, selected)) return;
          const period = classPeriods[slot.period];
          classes.push({ routine: r, label, period, periodIdx: slot.period, day: slot.day, slot, course });
        });
      };
      if (r.gender === 'both') {
        collect(r.maleSlots || [], r.malePeriods || [], 'Male');
        collect(r.femaleSlots || [], r.femalePeriods || [], 'Female');
      } else {
        collect(r.slots, r.periods);
      }
    }

    const examDuties: ExamDuty[] = [];
    const invigilation: InvigilationDuty[] = [];
    for (const r of examRoutines) {
      if (r.type === 'seatplan') {
        const entries: any[] = Array.isArray(r.entries) ? r.entries : Array.isArray(r.rows) ? r.rows : [];
        for (const e of entries) {
          if (!e || !teacherMatchesCell(e.teacher, selected)) continue;
          invigilation.push({
            date: e.date || '',
            slotName: e.slotId || '',
            time: getSlotTime(e.slotId, r.slots),
            room: e.room || '',
            roll: e.rollFrom && e.rollTo ? `${e.rollFrom} – ${e.rollTo}` : e.rollFrom || e.rollTo || '',
            semester: e.semester || r.semester || '',
            examType: r.examType || 'Exam',
            department: r.department || '',
          });
        }
      } else {
        const rows: any[] = Array.isArray(r.rows) ? r.rows : [];
        for (const row of rows) {
          if (!row || !row.courses) continue;
          for (const [slotId, cell] of Object.entries<any>(row.courses)) {
            if (!cell || !cell.code || !teacherMatchesCell(cell.teacher, selected)) continue;
            examDuties.push({
              date: row.date || '',
              day: row.day || '',
              slotName: slotId,
              time: getSlotTime(slotId, r.slots),
              code: cell.code,
              title: cell.title || '',
              room: cell.room || '',
              semester: r.semester || '',
              examType: r.examType || 'Exam',
              department: r.department || '',
            });
          }
        }
      }
    }

    examDuties.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    invigilation.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Group class duties per routine
    const byRoutine = new Map<string, { routine: RoutineItem; label?: string; duties: ClassDuty[] }>();
    for (const c of classes) {
      const key = `${c.routine.id}::${c.label || ''}`;
      if (!byRoutine.has(key)) byRoutine.set(key, { routine: c.routine, label: c.label, duties: [] });
      byRoutine.get(key)!.duties.push(c);
    }
    return { classes, examDuties, invigilation, byRoutine: Array.from(byRoutine.values()) };
  }, [routines, examRoutines, selected]);

  const weeklyClassCount = data.classes.length;
  const deptNames = useMemo(() => {
    const set = new Set<string>();
    data.examDuties.forEach(d => set.add(d.department));
    data.invigilation.forEach(d => set.add(d.department));
    data.byRoutine.forEach(g => set.add(g.routine.department));
    return Array.from(set).filter(Boolean);
  }, [data]);

  const handleCopy = async () => {
    const lines: string[] = [`📚 Personal Routine — ${selected}`, ''];
    for (const g of data.byRoutine) {
      const r = g.routine;
      lines.push(`${r.semester || ''}${g.label ? ` (${g.label})` : ''}${r.branch ? ` · Section ${r.branch}` : ''} — ${getDeptName(r.department || '')}`);
      for (const c of g.duties) {
        const room = c.slot?.room || c.course.room;
        lines.push(`  • ${c.day} ${c.period?.start || ''}–${c.period?.end || ''}: ${c.course.code} — ${c.course.title}${room ? ` (${room})` : ''}`);
      }
      lines.push('');
    }
    if (data.examDuties.length) {
      lines.push(`📝 Exam Duties (${data.examDuties.length})`);
      for (const d of data.examDuties) lines.push(`  • ${fmtDate(d.date)} ${d.slotName ? `(${d.slotName})` : ''}: ${d.code}${d.room ? ` — Room ${d.room}` : ''}`);
      lines.push('');
    }
    if (data.invigilation.length) {
      lines.push(`🪑 Invigilation (${data.invigilation.length})`);
      for (const d of data.invigilation) lines.push(`  • ${fmtDate(d.date)}${d.slotName ? ` ${d.slotName}` : ''}: Room ${d.room}${d.roll ? ` (Roll ${d.roll})` : ''}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div>
      {/* ─── Search ─── */}
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-4 sm:p-5 mb-4">
        <h4 className="text-[0.95rem] font-semibold flex items-center gap-2 mb-1">
          <i className="fas fa-chalkboard-teacher text-qsis"></i> My Routine
        </h4>
        <p className="text-[0.75rem] text-dark-text2 mb-3">
          Search your name to see your class routine, exam duties and invigilation schedule.
          {profile.shortForm && <span className="ml-1 text-qsis">You are linked as <b>{faculty.find((m: any) => m.shortForm?.toUpperCase() === String(profile.shortForm).toUpperCase())?.name || ''}</b>.</span>}
        </p>
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-dark-text3 text-[0.85rem]"></i>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSuggestions(true); if (!e.target.value) setSelected(''); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Type a teacher name (e.g. Dr. Abu Bakr) or short form..."
            className="w-full pl-9 pr-24 py-2.5 rounded-xl border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
          />
          {selected && (
            <button onClick={handleCopy} className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 border-none">
              {copied ? <><i className="fas fa-check mr-1"></i>Copied</> : <><i className="fas fa-copy mr-1"></i>Copy</>}
            </button>
          )}
          {showSuggestions && query.trim() && suggestions.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-dark-bg3 border border-dark-border rounded-xl overflow-hidden shadow-xl max-h-72 overflow-y-auto">
              {suggestions.map((m: any) => (
                <button
                  key={m.id}
                  onMouseDown={() => handleSelect(m.name)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-dark-bg cursor-pointer border-none bg-transparent transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
                    <span className="text-[0.62rem] font-bold text-qsis">{m.shortForm || m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.82rem] text-dark-text truncate">{m.name}</span>
                    <span className="block text-[0.68rem] text-dark-text3">{m.title || ''}{m.department ? ` · ${getDeptName(m.department)}` : ''}</span>
                  </span>
                  {profile.shortForm && m.shortForm?.toUpperCase() === String(profile.shortForm).toUpperCase() && (
                    <span className="text-[0.6rem] text-green-400 font-semibold flex-shrink-0"><i className="fas fa-user-check mr-1"></i>You</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
          <p className="text-[0.8rem] text-dark-text2 mt-2">Loading published routines...</p>
        </div>
      ) : !selected ? (
        <div className="text-center py-10 border border-dashed border-dark-border rounded-2xl">
          <i className="fas fa-chalkboard-teacher text-3xl text-dark-text3 mb-3 block"></i>
          <p className="text-[0.85rem] text-dark-text2">Type your name above to see your personal routine.</p>
        </div>
      ) : weeklyClassCount === 0 && data.examDuties.length === 0 && data.invigilation.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-dark-border rounded-2xl">
          <i className="fas fa-inbox text-3xl text-dark-text3 mb-3 block"></i>
          <p className="text-[0.85rem] text-dark-text2">No published class routine, exam duty or invigilation found for <b>{selected}</b> yet.</p>
        </div>
      ) : (
        <>
          {/* ─── Summary chips ─── */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-3 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-[0.75rem] text-dark-text2">
              <i className="fas fa-calendar-alt text-qsis mr-1.5"></i>Classes/week: <b className="text-dark-text">{weeklyClassCount}</b>
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-[0.75rem] text-dark-text2">
              <i className="fas fa-file-alt text-qsis mr-1.5"></i>Exam duties: <b className="text-dark-text">{data.examDuties.length}</b>
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-[0.75rem] text-dark-text2">
              <i className="fas fa-chair text-qsis mr-1.5"></i>Invigilation: <b className="text-dark-text">{data.invigilation.length}</b>
            </span>
            {deptNames.length > 0 && (
              <span className="px-3 py-1.5 rounded-lg bg-dark-bg2 border border-dark-border text-[0.75rem] text-dark-text2">
                <i className="fas fa-university text-qsis mr-1.5"></i>{deptNames.map(getDeptName).join(', ')}
              </span>
            )}
          </div>

          {/* ─── Class routine ─── */}
          {data.byRoutine.length > 0 && (
            <div className="mb-6">
              <h5 className="text-[0.85rem] font-semibold flex items-center gap-2 mb-3 text-dark-text">
                <i className="fas fa-calendar-alt text-qsis"></i> Class Routine
              </h5>
              <div className="space-y-4">
                {data.byRoutine.map(g => (
                  <TeacherWeeklyTable key={`${g.routine.id}::${g.label || ''}`} group={g} />
                ))}
              </div>
            </div>
          )}

          {/* ─── Exam duties ─── */}
          {data.examDuties.length > 0 && (
            <div className="mb-6 bg-dark-bg2 border border-dark-border rounded-2xl p-4 sm:p-5">
              <h5 className="text-[0.85rem] font-semibold flex items-center gap-2 mb-3 text-dark-text">
                <i className="fas fa-file-alt text-qsis"></i> Exam Duties ({data.examDuties.length})
              </h5>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.78rem]">
                  <thead>
                    <tr className="text-left text-dark-text2 border-b border-dark-border">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Time</th>
                      <th className="py-2 pr-3 font-semibold">Course</th>
                      <th className="py-2 pr-3 font-semibold">Room</th>
                      <th className="py-2 pr-3 font-semibold">Semester</th>
                      <th className="py-2 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.examDuties.map((d, i) => (
                      <tr key={i} className="border-b border-dark-border/60 last:border-0">
                        <td className="py-2 pr-3 text-dark-text">{fmtDate(d.date)}{d.day ? ` · ${d.day}` : ''}</td>
                        <td className="py-2 pr-3 text-dark-text2">{d.time || d.slotName || '—'}</td>
                        <td className="py-2 pr-3 text-dark-text">{d.code}{d.title ? <span className="block text-[0.68rem] text-dark-text3">{d.title}</span> : null}</td>
                        <td className="py-2 pr-3 text-dark-text2">{d.room || '—'}</td>
                        <td className="py-2 pr-3 text-dark-text2">{d.semester || '—'}</td>
                        <td className="py-2 text-qsis font-medium">{d.examType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Invigilation ─── */}
          {data.invigilation.length > 0 && (
            <div className="mb-6 bg-dark-bg2 border border-dark-border rounded-2xl p-4 sm:p-5">
              <h5 className="text-[0.85rem] font-semibold flex items-center gap-2 mb-3 text-dark-text">
                <i className="fas fa-chair text-qsis"></i> Invigilation Duty ({data.invigilation.length})
              </h5>
              <div className="overflow-x-auto">
                <table className="w-full text-[0.78rem]">
                  <thead>
                    <tr className="text-left text-dark-text2 border-b border-dark-border">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Slot</th>
                      <th className="py-2 pr-3 font-semibold">Room</th>
                      <th className="py-2 pr-3 font-semibold">Roll</th>
                      <th className="py-2 pr-3 font-semibold">Semester</th>
                      <th className="py-2 font-semibold">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.invigilation.map((d, i) => (
                      <tr key={i} className="border-b border-dark-border/60 last:border-0">
                        <td className="py-2 pr-3 text-dark-text">{fmtDate(d.date)}</td>
                        <td className="py-2 pr-3 text-dark-text2">{d.slotName || '—'}{d.time ? <span className="block text-[0.68rem] text-dark-text3">{d.time}</span> : null}</td>
                        <td className="py-2 pr-3 text-dark-text">Room {d.room || '—'}</td>
                        <td className="py-2 pr-3 text-dark-text2">{d.roll || '—'}</td>
                        <td className="py-2 pr-3 text-dark-text2">{d.semester || '—'}</td>
                        <td className="py-2 text-qsis font-medium">{d.examType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Themed weekly table filtered to a teacher's classes ───
function TeacherWeeklyTable({ group }: { group: { routine: RoutineItem; label?: string; duties: ClassDuty[] } }) {
  const { routine: r, label, duties } = group;
  const periods = label === 'Male' ? (r.malePeriods || []) : label === 'Female' ? (r.femalePeriods || []) : (r.periods || []);
  const slots = label === 'Male' ? (r.maleSlots || []) : label === 'Female' ? (r.femaleSlots || []) : (r.slots || []);
  const days = (r.days || []).slice().sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const classPeriods = periods.filter(p => !p.isBreak);

  const dutyByKey = new Map<string, ClassDuty>();
  for (const d of duties) {
    dutyByKey.set(`${d.day}::${d.slot.period}`, d);
  }

  // Map a class period index to the teacher's slot for each day
  const getDuty = (day: string, classPeriodIdx: number): ClassDuty | undefined => {
    const slot = slots.find(s => s.day === day && s.period === classPeriodIdx);
    if (!slot) return undefined;
    return dutyByKey.get(`${day}::${slot.period}`);
  };

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-dark-border flex flex-wrap items-center gap-2">
        <span className="routine-badge routine-badge-semester"><i className="fas fa-book mr-1.5"></i>{r.semester}</span>
        {label && (
          <span className="routine-badge" style={{ background: label === 'Male' ? '#3b82f6' : '#ec4899', color: '#fff' }}>
            <i className={`fas fa-${label === 'Male' ? 'mars' : 'venus'} mr-1.5`}></i>{label}
          </span>
        )}
        {r.branch && <span className="routine-badge routine-badge-branch"><i className="fas fa-users mr-1.5"></i>Section {r.branch}</span>}
        {r.session && <span className="routine-badge routine-badge-session"><i className="fas fa-calendar mr-1.5"></i>{r.session}</span>}
        <span className="text-[0.72rem] text-dark-text2 ml-auto">{getDeptName(r.department || '')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="routine-table">
          <thead>
            <tr>
              <th className="routine-th routine-th-time">Time</th>
              {days.map(day => <th key={day} className="routine-th">{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, pIdx) => {
              if (period.isBreak) {
                const nonOffDays = days.filter(day => !getDuty(day, -1));
                const midIdx = Math.floor(nonOffDays.length / 2);
                return (
                  <tr key={pIdx} className="routine-break-row">
                    <td className="routine-td routine-td-time routine-break-time">
                      <div className="routine-time-text">{period.start}</div>
                      <div className="routine-time-sub">{period.end}</div>
                    </td>
                    {days.map(day => {
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
              const classIdx = classPeriods.indexOf(period);
              return (
                <tr key={pIdx}>
                  <td className="routine-td routine-td-time">
                    <div className="routine-period-name">{period.name}</div>
                    <div className="routine-time-text">{period.start}</div>
                    <div className="routine-time-sub">{period.end}</div>
                  </td>
                  {days.map(day => {
                    const duty = getDuty(day, classIdx);
                    return (
                      <td key={day} className="routine-td">
                        {duty ? (
                          <div className="routine-course">
                            <span className="routine-course-code">{duty.course.code}</span>
                            <span className="routine-course-title">{duty.course.title}</span>
                            {(duty.slot?.room || duty.course.room) && <span className="routine-course-room"><i className="fas fa-door-open mr-1"></i>{/^\d+$/.test(duty.slot?.room || duty.course.room) ? `Room ${duty.slot?.room || duty.course.room}` : duty.slot?.room || duty.course.room}</span>}
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
    </div>
  );
}
