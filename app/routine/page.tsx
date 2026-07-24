'use client';

import { useState } from 'react';
import RoutineView from '@/components/views/RoutineView';
import ExamRoutineView from '@/components/views/ExamRoutineView';

type RoutineTab = 'class' | 'exam';

export default function RoutinePage() {
  const [tab, setTab] = useState<RoutineTab>('class');

  return (
    <div>
      {/* Tab Switcher */}
      <div className="flex gap-1 mb-5 p-1 bg-dark-bg2 border border-dark-border rounded-xl">
        <button
          onClick={() => setTab('class')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[0.82rem] font-semibold transition-all cursor-pointer border-none ${
            tab === 'class' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
          }`}
        >
          <i className="fas fa-calendar-alt"></i>Class Routine
        </button>
        <button
          onClick={() => setTab('exam')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[0.82rem] font-semibold transition-all cursor-pointer border-none ${
            tab === 'exam' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text hover:bg-dark-bg3'
          }`}
        >
          <i className="fas fa-file-alt"></i>Exam Routine
        </button>
      </div>

      {tab === 'class' && <RoutineView />}
      {tab === 'exam' && <ExamRoutineView />}
    </div>
  );
}
