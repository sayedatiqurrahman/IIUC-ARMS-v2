'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show || !ref.current) return;
    const update = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const w = 256;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: r.top - 8, left, width: w });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [show]);

  const valueCls = size === 'sm' ? 'text-[0.8rem]' : 'text-[0.85rem]';
  const labelCls = size === 'sm' ? 'text-[0.5rem]' : 'text-[0.58rem]';

  return (
    <div
      ref={ref}
      className={`relative cursor-help ${size === 'sm' ? 'flex-1 text-center' : ''} ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div className="text-center">
        <div className={`${valueCls} font-bold ${color}`}>{value}</div>
        <div className={`${labelCls} text-dark-text3`}>{label}</div>
      </div>
      {show && pos && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-64 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-left shadow-xl"
          style={{ top: pos.top, left: pos.left, width: pos.width, transform: 'translateY(-100%)' }}
        >
          <span className={`block text-[0.7rem] font-bold mb-0.5 ${color}`}>
            <i className={`fas ${icon} mr-1`}></i>{label}
          </span>
          <span className="block text-[0.65rem] leading-snug text-neutral-300">{tip}</span>
        </div>,
        document.body
      )}
    </div>
  );
}
