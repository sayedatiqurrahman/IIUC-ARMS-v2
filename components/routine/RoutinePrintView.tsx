'use client';

import { forwardRef } from 'react';
import type { RoutineItem } from './types';
import RoutineTable from './RoutineTable';

const RoutinePrintView = forwardRef<HTMLDivElement, { routine: RoutineItem }>(({ routine }, ref) => {
  const isBoth = routine.gender === 'both';
  const hasMaleData = isBoth && routine.malePeriods && routine.malePeriods.length > 0;
  const hasFemaleData = isBoth && routine.femalePeriods && routine.femalePeriods.length > 0;
  return (
    <div ref={ref} className="routine-export">
      <div className="routine-header">
        <div className="routine-header-inner">
          <div className="routine-header-top">
            <div className="routine-logo-wrapper">
              <img src="/iiuc-logo.png" alt="IIUC" width={80} height={80} className="routine-logo" style={{ display: 'block' }} />
            </div>
            <div className="routine-header-text">
              <h1 className="routine-university-name">{routine.university}</h1>
              <p className="routine-arabic-name">&#x262F;&#x2015;&#x627;&#x644;&#x62C;&#x627;&#x645;&#x639;&#x629; &#x627;&#x644;&#x625;&#x633;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x627;&#x644;&#x639;&#x644;&#x627;&#x645;&#x64A;&#x629; &#x634;&#x64A;&#x62A;&#x627;&#x63A;&#x648;&#x646;&#x63A;</p>
              <p className="routine-dept-name">{routine.department}</p>
            </div>
          </div>
          <div className="routine-title-bar">
            <div className="routine-title-accent"></div>
            <h2 className="routine-title"> CLASS ROUTINE</h2>
            <div className="routine-title-accent"></div>
          </div>
          <div className="routine-badges">
            <span className="routine-badge routine-badge-semester">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>
              {routine.semester}
            </span>
            {routine.branch && <span className="routine-badge routine-badge-branch">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/></svg>
              Section {routine.branch}
            </span>}
            {routine.gender && routine.gender !== 'both' && <span className="routine-badge" style={{ background: routine.gender === 'male' ? '#3b82f6' : '#ec4899', color: '#fff' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}>{routine.gender === 'male' ? <g><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.4 5.4"/><path d="M15 5h4V1"/></g> : <g><circle cx="12" cy="12" r="5"/><path d="M12 7v0M12 17v0"/></g>}</svg>
              {routine.gender === 'male' ? 'Male' : 'Female'}
            </span>}
            {routine.gender === 'both' && <span className="routine-badge" style={{ background: 'linear-gradient(90deg, #3b82f6 50%, #ec4899 50%)', color: '#fff' }}>
              Male &amp; Female
            </span>}
            <span className="routine-badge routine-badge-session">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M17 14h-6"/><path d="M13 18H7"/><path d="M7 14h.01"/><path d="M17 18h.01"/></svg>
              Session {routine.session}
            </span>
            {routine.gender === 'both' && (routine.maleRoom || routine.femaleRoom) ? (
              <>
                {routine.maleRoom && <span className="routine-badge routine-badge-room">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'4px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
                  <i className="fas fa-mars" style={{marginRight:4,fontSize:'0.65rem'}}></i>
                  {/^\d+$/.test(routine.maleRoom) ? `Room ${routine.maleRoom}` : routine.maleRoom}
                </span>}
                {routine.femaleRoom && <span className="routine-badge routine-badge-room">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'4px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
                  <i className="fas fa-venus" style={{marginRight:4,fontSize:'0.65rem'}}></i>
                  {/^\d+$/.test(routine.femaleRoom) ? `Room ${routine.femaleRoom}` : routine.femaleRoom}
                </span>}
              </>
            ) : routine.room && <span className="routine-badge routine-badge-room">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline-block',verticalAlign:'-0.15em',marginRight:'6px'}}><path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/></svg>
              {/^\d+$/.test(routine.room) ? `Room ${routine.room}` : routine.room}
            </span>}
          </div>
        </div>
      </div>

      {isBoth && hasMaleData ? (
        <>
          <RoutineTable periods={routine.malePeriods!} slots={routine.maleSlots || []} days={routine.days} courses={routine.courses} label="Male" />
          <RoutineTable periods={routine.femalePeriods!} slots={routine.femaleSlots || []} days={routine.days} courses={routine.courses} label="Female" />
        </>
      ) : (
        <RoutineTable periods={routine.periods} slots={routine.slots} days={routine.days} courses={routine.courses} />
      )}

      {routine.courses.length > 0 && (
        <div className="routine-legend">
          <h4 className="routine-legend-title"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32" fill="#166534" style={{display:'inline-block',verticalAlign:'-0.2em',marginRight:'8px'}}><path d="M15 25.875v-19.625c0 0-2.688-2.25-6.5-2.25s-6.5 2-6.5 2v19.875c0 0 2.688-1.938 6.5-1.938s6.5 1.938 6.5 1.938zM29 25.875v-19.625c0 0-2.688-2.25-6.5-2.25s-6.5 2-6.5 2v19.875c0 0 2.688-1.938 6.5-1.938s6.5 1.938 6.5 1.938zM31 8h-1v19h-12v1h-5v-1h-12v-19h-1v20h12v1h7.062l-0.062-1h12v-20z"/></svg> Course Information</h4>
          <div className="routine-legend-table-wrapper">
            <table className="routine-legend-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Course Title</th>
                  <th>Instructor</th>
                </tr>
              </thead>
              <tbody>
                {routine.courses.map(c => (
                  <tr key={c.code}>
                    <td className="routine-legend-code-cell">{c.code}</td>
                    <td>{c.title}</td>
                    <td>{c.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="routine-footer">
        <div className="routine-footer-grid">
          <div className="routine-footer-notes">
            <h4>Important Notes</h4>
            <ul>
              <li>Students must arrive 5 minutes before class.</li>
              <li>Any schedule change will be notified via department notice board.</li>
              <li>Midterm and final exam schedules are separate.</li>
            </ul>
          </div>
          <div className="routine-footer-timing">
            <h4>Timing Information</h4>
            <p><strong>Office Hours:</strong> 9:00 AM - 4:00 PM</p>
          </div>
        </div>
        <div className="routine-footer-center">
          <p className="routine-generated">Presented by <strong><a href="https://programming-light.eu.cc" target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'underline'}}>Programming Light</a></strong> &amp; Developed by <strong><a href="https://atiq.is-a.dev" target="_blank" rel="noopener noreferrer" style={{color:'inherit',textDecoration:'underline'}}>Sayed Atiqur Rahman</a></strong></p>
          <p className="routine-updated">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="routine-footer-strip">
          <p>&copy; {new Date().getFullYear()} IIUC-ARMS &mdash; Qur&apos;anic Sciences &amp; Islamic Studies, IIUC</p>
        </div>
      </div>
    </div>
  );
});
RoutinePrintView.displayName = 'RoutinePrintView';

export default RoutinePrintView;
