'use client';

import type { RoutineItem, RoutinePeriod, RoutineSlot } from './types';
import { getDepartmentDisplayName } from '@/lib/departments';

export default function RoutinePlainTable({ routine }: { routine: RoutineItem }) {
  const classPeriods = routine.periods.filter(p => !p.isBreak);
  const isOffDay = (day: string) => classPeriods.every((_, i) => !routine.slots.find(s => s.day === day && s.period === i));
  const isBoth = routine.gender === 'both';
  const hasMaleData = isBoth && routine.malePeriods && routine.malePeriods.length > 0;

  function renderTable(periods: RoutinePeriod[], slots: RoutineSlot[], label?: string) {
    const classPds = periods.filter(p => !p.isBreak);
    const isOff = (day: string) => classPds.every((_, i) => !slots.find(s => s.day === day && s.period === i));
    return (
      <div style={{ marginBottom: label ? '12px' : '0' }}>
        {label && <div style={{ textAlign: 'center', padding: '6px', fontWeight: 700, fontSize: '0.8rem', border: '1px solid #000', borderBottom: 'none', textTransform: 'uppercase' }}>{label} Section</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontFamily: 'Times New Roman, serif', fontSize: '0.72rem' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'left', fontWeight: 700, width: '110px' }}>Time</th>
              {routine.days.map(day => <th key={day} style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, pIdx) => {
              if (period.isBreak) {
                const nonOff = routine.days.filter(d => !isOff(d));
                const mid = Math.floor(nonOff.length / 2);
                return (
                  <tr key={pIdx}>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700, verticalAlign: 'middle' }}>
                      <div>{period.start}</div><div style={{ fontSize: '0.65rem' }}>{period.end}</div>
                    </td>
                    {routine.days.map(day => {
                      if (isOff(day)) return null;
                      const show = nonOff.indexOf(day) === mid;
                      return <td key={day} style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontStyle: 'italic' }}>{show ? period.name : ''}</td>;
                    })}
                  </tr>
                );
              }
              const cpIdx = classPds.findIndex((_, i) => {
                let c = 0;
                for (let j = 0; j <= pIdx; j++) { if (!periods[j].isBreak) c++; }
                return c - 1 === i;
              });
              return (
                <tr key={pIdx}>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', verticalAlign: 'middle' }}>
                    <div style={{ fontWeight: 700 }}>{period.name}</div>
                    <div>{period.start}</div>
                    <div style={{ fontSize: '0.65rem' }}>{period.end}</div>
                  </td>
                  {routine.days.map(day => {
                    if (isOff(day)) {
                      if (pIdx === 0) return <td key={day} style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, fontStyle: 'italic' }} rowSpan={periods.length}>OFF DAY</td>;
                      return null;
                    }
                    const slot = slots.find(s => s.day === day && s.period === cpIdx) || null;
                    const course = slot ? routine.courses.find(c => c.code === slot.course) || null : null;
                    return (
                      <td key={day} style={{ border: '1px solid #000', padding: '6px', verticalAlign: 'top' }}>
                        {course ? (
                          <div>
                            <div style={{ fontWeight: 700 }}>{course.code}</div>
                            <div style={{ fontSize: '0.68rem' }}>{course.title}</div>
                            <div style={{ fontSize: '0.65rem' }}>{course.teacher}</div>
                          </div>
                        ) : <span style={{ color: '#999' }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', padding: '24px', fontFamily: 'Times New Roman, serif', color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>{routine.university || 'International Islamic University Chittagong'}</h2>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, margin: '0 0 4px' }}>{getDepartmentDisplayName(routine.department)}</h3>
        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>Class Routine</h4>
        <p style={{ fontSize: '0.72rem', margin: 0 }}>Session: {routine.session} | Semester: {routine.semester}</p>
      </div>
      {isBoth && hasMaleData ? (
        <>
          {renderTable(routine.malePeriods!, routine.maleSlots || [], 'Male')}
          {renderTable(routine.femalePeriods!, routine.femaleSlots || [], 'Female')}
        </>
      ) : (
        renderTable(routine.periods, routine.slots)
      )}
      {routine.courses.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Course Information</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left' }}>Code</th>
                <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left' }}>Course Title</th>
                <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left' }}>Instructor</th>
              </tr>
            </thead>
            <tbody>
              {routine.courses.map(c => (
                <tr key={c.code}>
                  <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>{c.code}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{c.title}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{c.teacher}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: '0.65rem', marginTop: '12px', textAlign: 'center', color: '#666' }}>
        Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}
