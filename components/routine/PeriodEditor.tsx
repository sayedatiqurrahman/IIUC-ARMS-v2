'use client';

import type { RoutinePeriod } from './types';
import { to24h, to12h } from './helpers';

export default function PeriodEditor({ periods, onChange }: { periods: RoutinePeriod[]; onChange: (p: RoutinePeriod[]) => void }) {
  const classPeriods = periods.filter(p => !p.isBreak);
  const addPeriod = () => onChange([...periods, { name: `Period ${classPeriods.length + 1}`, start: '10:40 AM', end: '11:30 AM' }]);
  const updatePeriod = (idx: number, field: keyof RoutinePeriod, value: string | boolean) => {
    const p = [...periods]; p[idx] = { ...p[idx], [field]: value }; onChange(p);
  };
  const removePeriod = (idx: number) => onChange(periods.filter((_, i) => i !== idx));
  const movePeriod = (idx: number, dir: -1 | 1) => {
    const p = [...periods]; const ni = idx + dir;
    if (ni < 0 || ni >= p.length) return;
    [p[idx], p[ni]] = [p[ni], p[idx]]; onChange(p);
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="routine-add-btn" onClick={addPeriod}><i className="fas fa-plus"></i> Add Period</button>
      </div>
      <div className="routine-period-list">
        {periods.map((p, idx) => (
          <div key={idx} className={`routine-period-item ${p.isBreak ? 'break' : ''}`}>
            <div className="routine-period-drag">
              <button disabled={idx === 0} onClick={() => movePeriod(idx, -1)}><i className="fas fa-chevron-up"></i></button>
              <button disabled={idx === periods.length - 1} onClick={() => movePeriod(idx, 1)}><i className="fas fa-chevron-down"></i></button>
            </div>
            <div className="routine-period-fields">
              <input className="routine-period-name" placeholder="Period name" value={p.name} onChange={e => updatePeriod(idx, 'name', e.target.value)} />
              <div className="routine-period-times">
                <input type="time" value={to24h(p.start)} onChange={e => updatePeriod(idx, 'start', to12h(e.target.value))} />
                <span className="routine-period-sep">to</span>
                <input type="time" value={to24h(p.end)} onChange={e => updatePeriod(idx, 'end', to12h(e.target.value))} />
              </div>
            </div>
            <label className="routine-break-toggle">
              <input type="checkbox" checked={!!p.isBreak} onChange={e => updatePeriod(idx, 'isBreak', e.target.checked)} />
              <span>Break</span>
            </label>
            <button className="routine-remove-btn-sm" onClick={() => removePeriod(idx)}><i className="fas fa-times"></i></button>
          </div>
        ))}
      </div>
    </div>
  );
}
