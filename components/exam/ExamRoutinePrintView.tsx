'use client';

import { useState } from 'react';
import { ExamSlot } from '@/lib/exam-routine-config';
import { config } from '@/lib/config';
import { findDepartment } from '@/lib/departments';
import { ExamRow, formatRollCount } from './types';

interface ExamRoutinePrintViewProps {
  semester: string;
  session: string;
  department: string;
  examType: string;
  rows: ExamRow[];
  slots: ExamSlot[];
  publishedBy?: { name: string; title?: string };
}

export default function ExamRoutinePrintView({ semester, session, department, examType, rows, slots, publishedBy }: ExamRoutinePrintViewProps) {
  const deptInfo = findDepartment(department);
  const semesterLabel = config.semesters.find(s => s.id === semester)?.label || semester;
  const [exportMode, setExportMode] = useState<'themed' | 'plain'>('themed');

  function handleExport() {
    import('dom-to-image-more').then(({ toPng }) => {
      const el = document.getElementById('exam-routine-export');
      if (!el) return;
      const origWidth = el.style.width;
      el.style.width = '920px';
      el.style.minWidth = '920px';
      toPng(el, { quality: 1, pixelRatio: 2 }).then(dataUrl => {
        el.style.width = origWidth;
        el.style.minWidth = '';
        const link = document.createElement('a');
        link.download = `exam-routine-${department}-${examType}${exportMode === 'plain' ? '-plain' : ''}.png`;
        link.href = dataUrl;
        link.click();
      });
    });
  }

  if (exportMode === 'plain') {
    return (
      <div>
        <div className="flex justify-end gap-2 mb-3">
          <button onClick={handleExport} className="routine-btn routine-btn-primary"><i className="fas fa-download mr-1"></i>Export Plain</button>
          <button onClick={() => setExportMode('themed')} className="routine-btn"><i className="fas fa-palette mr-1"></i>Switch to Themed</button>
        </div>
        <div id="exam-routine-export" className="bg-white rounded p-6 text-black" style={{ width: '100%', fontFamily: 'Times New Roman, serif' }}>
          <div className="text-center mb-4">
            <h2 className="text-[1rem] font-bold uppercase tracking-wide">International Islamic University Chittagong</h2>
            <h3 className="text-[0.85rem] font-semibold">{deptInfo?.department.name || department}</h3>
            <h4 className="text-[0.8rem] font-bold mt-2 uppercase">{examType} Examination Routine</h4>
            <p className="text-[0.72rem]">{semesterLabel} | {session}</p>
          </div>
          <div className="mb-3 flex flex-wrap gap-2 justify-center">
            {slots.map(slot => (
              <div key={slot.id} className="px-3 py-1 border border-black text-center">
                <div className="text-[0.72rem] font-bold">{slot.name}</div>
                <div className="text-[0.65rem]">Time: {slot.startTime} – {slot.endTime}</div>
              </div>
            ))}
          </div>
          <table className="w-full border-collapse border border-black text-[0.72rem]">
            <thead>
              <tr>
                <th className="border border-black px-2 py-1.5 text-left font-bold">Date</th>
                <th className="border border-black px-2 py-1.5 text-left font-bold">Day</th>
                {slots.map(slot => (
                  <th key={slot.id} className="border border-black px-2 py-1.5 text-left font-bold">
                    {slot.name}
                    <div className="text-[0.58rem] font-normal">{slot.startTime} – {slot.endTime}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td className="border border-black px-2 py-1.5 font-medium">{row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  <td className="border border-black px-2 py-1.5 font-medium">{row.day || '—'}</td>
                  {slots.map(slot => {
                    const course = row.courses[slot.id];
                    return (
                      <td key={slot.id} className="border border-black px-2 py-1.5">
                        {course?.code && <div className="font-bold">{course.code}</div>}
                        {course?.title && <div className="text-[0.65rem]">{course.title}</div>}
                        {course?.teacher && <div className="text-[0.6rem]">Teacher: {course.teacher}</div>}
                        {course?.room && <div className="text-[0.62rem]">Room: {course.room}</div>}
                        {course?.rollRange && <div className="text-[0.6rem]">Roll: {course.rollRange}</div>}
                        {!course?.code && !course?.title && !course?.room && !course?.teacher && <span className="text-gray-400">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {publishedBy && (
            <p className="text-[0.65rem] mt-3 text-right">Published by: {publishedBy.name}{publishedBy.title ? `, ${publishedBy.title}` : ''}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3">
        <button onClick={handleExport} className="routine-btn routine-btn-primary"><i className="fas fa-download mr-1"></i>Export PNG</button>
        <button onClick={() => setExportMode('plain')} className="routine-btn"><i className="fas fa-file-alt mr-1"></i>Plain Academic Table</button>
      </div>
      <div id="exam-routine-export" className="bg-white rounded-xl p-6 text-gray-900" style={{ width: '100%' }}>
        <div className="text-center mb-4">
          <h2 className="text-[1.1rem] font-bold">International Islamic University Chittagong</h2>
          <h3 className="text-[0.9rem] font-semibold text-gray-700">{deptInfo?.department.name || department}</h3>
          <h4 className="text-[0.85rem] font-bold mt-2">{examType} Examination Routine</h4>
          <p className="text-[0.75rem] text-gray-600">{semesterLabel} &bull; {session}</p>
        </div>

        {/* Slot Headers */}
        <div className="mb-4 flex flex-wrap gap-3 justify-center">
          {slots.map(slot => (
            <div key={slot.id} className="px-4 py-2 bg-gray-100 rounded-lg border border-gray-300 text-center">
              <div className="text-[0.8rem] font-bold text-gray-800">{slot.name}</div>
              <div className="text-[0.72rem] text-gray-600">Time: {slot.startTime} – {slot.endTime}</div>
            </div>
          ))}
        </div>

        <table className="w-full border-collapse border border-gray-300 text-[0.78rem]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left font-bold w-20">Date</th>
              <th className="border border-gray-300 px-3 py-2 text-left font-bold w-24">Day</th>
              {slots.map(slot => (
                <th key={slot.id} className="border border-gray-300 px-3 py-2 text-left font-bold">
                  {slot.name}
                  <div className="text-[0.62rem] font-normal text-gray-500">{slot.startTime} – {slot.endTime}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border border-gray-300 px-3 py-2 font-medium">{row.date ? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                <td className="border border-gray-300 px-3 py-2 font-medium">{row.day || '—'}</td>
                {slots.map(slot => {
                  const course = row.courses[slot.id];
                  return (
                    <td key={slot.id} className="border border-gray-300 px-3 py-2">
                      {course?.code && <div className="font-bold">{course.code}</div>}
                      {course?.title && <div className="text-[0.7rem] text-gray-600">{course.title}</div>}
                      {course?.teacher && <div className="text-[0.65rem] text-gray-500"><i className="fas fa-chalkboard-teacher mr-1"></i>{course.teacher}</div>}
                      {course?.room && <div className="text-[0.68rem] text-gray-500"><i className="fas fa-door-open mr-1"></i>Room {course.room}</div>}
                      {course?.rollRange && <div className="text-[0.65rem] text-gray-400"><i className="fas fa-users mr-1"></i>{formatRollCount(course.rollRange)}</div>}
                      {!course?.code && !course?.title && !course?.room && !course?.teacher && <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {publishedBy && (
          <p className="text-[0.7rem] text-gray-500 mt-3 text-right">Published by: {publishedBy.name}{publishedBy.title ? `, ${publishedBy.title}` : ''}</p>
        )}
      </div>
    </div>
  );
}
