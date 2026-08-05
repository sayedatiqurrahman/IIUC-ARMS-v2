'use client';

import { config } from '@/lib/config';
import CustomSelect from '@/components/CustomSelect';

export default function SessionSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-calendar-check mr-1"></i>Session</label>
      <CustomSelect
        value={value}
        onChange={onChange}
        placeholder="Select session..."
        options={[
          { value: '', label: 'None', icon: 'fa-times' },
          ...config.sessions.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar-check' })),
        ]}
      />
      <p className="text-[0.62rem] text-dark-text3 mt-0.5">Managed by teachers / admins. If no session fits, ask your CR to create one.</p>
    </div>
  );
}
