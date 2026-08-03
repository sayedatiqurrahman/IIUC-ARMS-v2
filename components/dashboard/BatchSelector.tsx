'use client';

import { useState, useEffect } from 'react';
import CustomSelect from '@/components/CustomSelect';

export default function BatchSelector({ department, value, onChange }: { department: string; value: string; onChange: (v: string) => void }) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!department) return;
    setLoading(true);
    fetch(`/api/batches?department=${department}`).then(r => r.json()).then(data => {
      setBatches(data.batches || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [department]);

  if (loading) {
    return (
      <div>
        <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-layer-group mr-1"></i>Batch</label>
        <div className="px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text3 text-[0.82rem]"><i className="fas fa-spinner fa-spin mr-1"></i>Loading...</div>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div>
        <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-layer-group mr-1"></i>Batch</label>
        <div className="px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-[0.78rem]">
          <p className="text-dark-text3">No batches for this department.</p>
          <p className="text-[0.65rem] text-dark-text3 mt-0.5">Contact your <span className="text-qsis font-semibold">manager</span> or <span className="text-qsis font-semibold">teacher</span> (who can make a CR) to create a batch.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-layer-group mr-1"></i>Batch</label>
      <CustomSelect
        value={value}
        onChange={onChange}
        placeholder="Select batch..."
        options={[
          { value: '', label: 'None', icon: 'fa-times' },
          ...batches.map(b => ({
            value: b.id,
            label: `${b.name} — ${b.session}`,
            icon: b.isActive ? 'fa-check-circle' : 'fa-times-circle',
          })),
        ]}
      />
    </div>
  );
}
