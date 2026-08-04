'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import RoutineView from '@/components/views/RoutineView';
import ExamRoutineView from '@/components/views/ExamRoutineView';
import SeatPlanView from '@/components/views/SeatPlanView';
import TeacherRoutineView from '@/components/routine/TeacherRoutineView';

type RoutineTab = 'class' | 'exam' | 'seatplan' | 'teacher';

const TAB_KEYS: RoutineTab[] = ['class', 'exam', 'seatplan', 'teacher'];

export default function RoutinePage() {
  const [tab, setTab] = useState<RoutineTab>('class');
  const [teacherName, setTeacherName] = useState('');
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab') as RoutineTab | null;
    if (t && TAB_KEYS.includes(t)) setTab(t);
    const teacher = params.get('teacher');
    if (teacher) setTeacherName(teacher);
  }, []);

  const changeTab = useCallback((next: RoutineTab) => {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', next);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const handleTeacherChange = useCallback((name: string) => {
    setTeacherName(name);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'teacher');
    if (name) params.set('teacher', name);
    else params.delete('teacher');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const tabBtn = (key: RoutineTab, label: string, shortLabel: string, icon: string) => (
    <button
      onClick={() => changeTab(key)}
      className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-lg text-[0.75rem] sm:text-[0.82rem] font-semibold transition-all cursor-pointer border-none ${
        tab === key ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
      }`}
    >
      <i className={icon}></i>
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div>
      <div className="flex gap-1 mb-5 p-1 bg-dark-bg2 border border-dark-border rounded-xl">
        {tabBtn('class', 'Class Routine', 'Class', 'fas fa-calendar-alt')}
        {tabBtn('exam', 'Exam Routine', 'Exam', 'fas fa-file-alt')}
        {tabBtn('seatplan', 'Seat Plan', 'Seat', 'fas fa-chair')}
        {tabBtn('teacher', 'My Routine', 'Mine', 'fas fa-chalkboard-teacher')}
      </div>

      {tab === 'class' && <RoutineView />}
      {tab === 'exam' && <ExamRoutineView />}
      {tab === 'seatplan' && <SeatPlanView />}
      {tab === 'teacher' && <TeacherRoutineView initialTeacher={teacherName || undefined} onTeacherChange={handleTeacherChange} />}
    </div>
  );
}
