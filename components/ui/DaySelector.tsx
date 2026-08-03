'use client';

const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'];

interface DaySelectorProps {
  value: string[];
  onChange: (days: string[]) => void;
  className?: string;
}

export default function DaySelector({ value, onChange, className = '' }: DaySelectorProps) {
  const toggle = (day: string) => {
    if (value.includes(day)) {
      onChange(value.filter(d => d !== day));
    } else {
      onChange([...value, day].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)));
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {DAYS.map(d => (
        <button
          key={d}
          type="button"
          onClick={() => toggle(d)}
          className={`px-3 py-1.5 rounded-lg border text-[0.78rem] font-semibold transition-all cursor-pointer ${
            value.includes(d)
              ? 'bg-qsis text-white border-qsis'
              : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-qsis hover:text-qsis'
          }`}
        >
          {d.slice(0, 3)}
        </button>
      ))}
    </div>
  );
}
