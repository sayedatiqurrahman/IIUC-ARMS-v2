'use client';

import type { RoutinePeriod, RoutineSlot, RoutineCourse } from './types';

export default function RoutineTable({ periods, slots, days, courses, label }: { periods: RoutinePeriod[]; slots: RoutineSlot[]; days: string[]; courses: RoutineCourse[]; label?: string }) {
  const classPeriods = periods.filter(p => !p.isBreak);
  const isOffDayLocal = (day: string) => {
    return classPeriods.every((_, i) => !slots.find(s => s.day === day && s.period === i));
  };

  return (
    <div>
      {label && (
        <div style={{ background: label === 'Male' ? '#3b82f6' : '#ec4899', color: '#fff', textAlign: 'center', padding: '8px 16px', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.5px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}>{label === 'Male' ? <g><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.4 5.4"/><path d="M15 5h4V1"/></g> : <g><circle cx="12" cy="12" r="5"/><path d="M12 7v0M12 17v0"/></g>}</svg>
          {label} Section
        </div>
      )}
      <div className="routine-table-wrapper">
        <table className="routine-table">
          <thead>
            <tr>
              <th className="routine-th routine-th-time">Time</th>
              {days.map(day => (
                <th key={day} className="routine-th">{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, pIdx) => {
              if (period.isBreak) {
                const nonOffDays = days.filter(day => !isOffDayLocal(day));
                const midIdx = Math.floor(nonOffDays.length / 2);
                return (
                  <tr key={pIdx} className="routine-break-row">
                    <td className="routine-td routine-td-time routine-break-time">
                      <div className="routine-time-text">{period.start}</div>
                      <div className="routine-time-sub">{period.end}</div>
                    </td>
                    {days.map((day) => {
                      const offDay = isOffDayLocal(day);
                      if (offDay) return null;
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
              const classPeriodIdx = classPeriods.findIndex((_, i) => {
                let count = 0;
                for (let j = 0; j <= pIdx; j++) { if (!periods[j].isBreak) count++; }
                return count - 1 === i;
              }) ?? pIdx;
              return (
                <tr key={pIdx}>
                  <td className="routine-td routine-td-time">
                    <div className="routine-period-name">{period.name}</div>
                    <div className="routine-time-text">{period.start}</div>
                    <div className="routine-time-sub">{period.end}</div>
                  </td>
                  {days.map(day => {
                    const offDay = isOffDayLocal(day);
                    if (offDay) {
                      if (pIdx === 0) {
                        return (
                          <td key={day} className="routine-td routine-offday-cell" rowSpan={periods.length}>
                            <div className="routine-offday-vertical">OFF DAY</div>
                          </td>
                        );
                      }
                      return null;
                    }
                    const slot = slots.find(s => s.day === day && s.period === classPeriodIdx) || null;
                    const course = slot ? courses.find(c => c.code === slot.course) || null : null;
                    return (
                      <td key={day} className="routine-td">
                        {slot && course ? (
                          <div className="routine-course">
                            <span className="routine-course-code">{course.code}</span>
                            <span className="routine-course-title">{course.title}</span>
                            <span className="routine-course-teacher">{course.teacher}</span>
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
