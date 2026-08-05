'use client';

export default function SessionSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-calendar-check mr-1"></i>Session</label>
      <input
        type="text"
        className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors"
        placeholder="e.g. 2020-2022, Autumn 2022, Spring 2022"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      <p className="text-[0.62rem] text-dark-text3 mt-0.5">Format: year range (2020-2022) or semester (Autumn 2022, Spring 2022).</p>
    </div>
  );
}
