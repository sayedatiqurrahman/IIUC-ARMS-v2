'use client';

import { useState } from 'react';
import RoutineView from '@/components/views/RoutineView';
import ExamRoutineView from '@/components/views/ExamRoutineView';
import SeatPlanView from '@/components/views/SeatPlanView';

type RoutineTab = 'class' | 'exam' | 'seatplan';

export default function RoutinePage() {
  const [tab, setTab] = useState<RoutineTab>('class');

  return (
    <div>
      <div className="flex gap-1 mb-5 p-1 bg-dark-bg2 border border-dark-border rounded-xl">
        <button
          onClick={() => setTab('class')}
          className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-lg text-[0.75rem] sm:text-[0.82rem] font-semibold transition-all cursor-pointer border-none ${
            tab === 'class' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
          }`}
        >
          <i className="fas fa-calendar-alt"></i>
          <span className="sm:hidden">Class</span>
          <span className="hidden sm:inline">Class Routine</span>
        </button>
        <button
          onClick={() => setTab('exam')}
          className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-lg text-[0.75rem] sm:text-[0.82rem] font-semibold transition-all cursor-pointer border-none ${
            tab === 'exam' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
          }`}
        >
          <i className="fas fa-file-alt"></i>
          <span className="sm:hidden">Exam</span>
          <span className="hidden sm:inline">Exam Routine</span>
        </button>
        <button
          onClick={() => setTab('seatplan')}
          className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-lg text-[0.75rem] sm:text-[0.82rem] font-semibold transition-all cursor-pointer border-none ${
            tab === 'seatplan' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
          }`}
        >
          <i className="fas fa-chair"></i>
          <span className="sm:hidden">Seat</span>
          <span className="hidden sm:inline">Seat Plan</span>
        </button>
      </div>

      {tab === 'class' && <RoutineView />}
      {tab === 'exam' && <ExamRoutineView />}
      {tab === 'seatplan' && <SeatPlanView />}
    </div>
  );
}
