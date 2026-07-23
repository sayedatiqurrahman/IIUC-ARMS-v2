'use client';

import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';

export default function RoutineView() {
  const router = useRouter();
  const routineData = useAppStore(s => s.routineData);
  const routineLoading = useAppStore(s => s.routineLoading);

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold flex items-center gap-2"><i className="fas fa-calendar-alt"></i> Class Routine</h3>
        <button className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold" onClick={() => router.push('/')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
      </div>
      {routineLoading ? (
        <div className="loading-container">
          <div className="book-loader">
            <div className="book-base"></div>
            <div className="book-spine-loader"></div>
            <div className="book-cover"></div>
            <div className="book-page-stack">
              <div className="book-page"></div>
              <div className="book-page"></div>
              <div className="book-page"></div>
            </div>
            <div className="page-shadow"></div>
            <div className="page-shadow"></div>
            <div className="page-shadow"></div>
          </div>
          <div className="loading-text">Loading routine<span className="loading-dots"></span></div>
        </div>
      ) : routineData.length === 0 ? (
        <div className="text-center py-12 text-dark-bg2 rounded-2xl border border-dark-border">
          <i className="fas fa-calendar-times text-4xl text-dark-text2 mb-3 block opacity-30"></i>
          <p className="text-[0.9rem] text-dark-text2">No routine available yet.</p>
          <p className="text-[0.78rem] text-dark-text2 mt-1 opacity-60">Class routine will be published by the department.</p>
          <a href="https://www.facebook.com/DQSIS" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-qsis/10 text-qsis text-[0.8rem] font-semibold hover:bg-qsis/20 transition-all">
            <i className="fab fa-facebook"></i> Check Facebook for Updates
          </a>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-dark-bg2 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-dark-bg3">
                <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Day</th>
                <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Time</th>
                <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Course</th>
                <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Room</th>
                <th className="text-left text-[0.78rem] font-semibold text-dark-text p-3 border-b border-dark-border">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {routineData.map((r: any, i: number) => (
                <tr key={i} className="hover:bg-dark-bg3 transition-colors">
                  <td className="text-[0.82rem] p-3 border-b border-dark-border">{r.day}</td>
                  <td className="text-[0.82rem] p-3 border-b border-dark-border text-qsis font-medium">{r.time}</td>
                  <td className="text-[0.82rem] p-3 border-b border-dark-border font-semibold">{r.course}</td>
                  <td className="text-[0.82rem] p-3 border-b border-dark-border">{r.room}</td>
                  <td className="text-[0.82rem] p-3 border-b border-dark-border text-dark-text2">{r.teacher}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
