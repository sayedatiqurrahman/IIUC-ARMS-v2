'use client';

interface StatTipProps {
  icon: string;
  color: string;
  value: number;
  label: string;
  tip: string;
  size?: 'md' | 'sm';
  className?: string;
}

export default function StatTip({ icon, color, value, label, tip, size = 'md', className = '' }: StatTipProps) {
  const valueCls = size === 'sm' ? 'text-[0.8rem]' : 'text-[0.85rem]';
  const labelCls = size === 'sm' ? 'text-[0.5rem]' : 'text-[0.58rem]';
  return (
    <div className={`relative group/tip cursor-help ${size === 'sm' ? 'flex-1 text-center' : ''} ${className}`}>
      <div className="text-center">
        <div className={`${valueCls} font-bold ${color}`}>{value}</div>
        <div className={`${labelCls} text-dark-text3`}>{label}</div>
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-left opacity-0 translate-y-1 transition-all duration-150 group-hover/tip:opacity-100 group-hover/tip:translate-y-0 shadow-xl">
        <span className={`block text-[0.7rem] font-bold mb-0.5 ${color}`}>
          <i className={`fas ${icon} mr-1`}></i>{label}
        </span>
        <span className="block text-[0.65rem] leading-snug text-neutral-300">{tip}</span>
      </div>
    </div>
  );
}
