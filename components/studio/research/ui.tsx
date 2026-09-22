'use client';

import { useState } from 'react';

const inputCls =
  'w-full rounded-xl border border-dark-border bg-dark-bg py-2 px-3 text-[0.8rem] text-dark-text outline-none transition focus:border-qsis placeholder:text-dark-text3';

export function Field({ label, labelAr, children, rtl = false }: { label: string; labelAr?: string; children: React.ReactNode; rtl?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[0.7rem] font-semibold text-dark-text2">
        {label}
        {labelAr && <span className="text-dark-text3" dir="rtl">{labelAr}</span>}
      </span>
      <div dir={rtl ? 'rtl' : undefined}>{children}</div>
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls + ' ' + (props.className || '')} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputCls + ' ' + (props.className || '')} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputCls + ' min-h-[10rem] resize-y leading-relaxed ' + (props.className || '')} />;
}

export function Btn({ variant = 'primary', children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const cls =
    variant === 'primary'
      ? 'rounded-xl bg-qsis px-4 py-2 text-[0.78rem] font-semibold text-white transition hover:brightness-110 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
      : 'rounded-xl border border-dark-border bg-dark-bg2 px-3 py-1.5 text-[0.72rem] font-medium text-dark-text hover:border-qsis/50 transition cursor-pointer';
  return <button {...rest} className={cls + ' ' + (rest.className || '')}>{children}</button>;
}

function CopyInner({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded-lg border border-dark-border bg-dark-bg2 px-2.5 py-1 text-[0.68rem] font-semibold text-dark-text2 hover:text-qsis hover:border-qsis/50 transition cursor-pointer"
    >
      {done ? 'Copied ✓' : `⧉ ${label}`}
    </button>
  );
}

let copySeq = 0;
export function CopyButton({ text, label }: { text: string; label?: string }) {
  copySeq += 1;
  return <CopyInner key={copySeq} text={text} label={label} />;
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-amber-700/30 bg-amber-900/10 px-3 py-2 text-[0.68rem] leading-relaxed text-amber-200/90">
      <span className="font-semibold">Note: </span>
      {children}
    </p>
  );
}

export const outBoxCls = 'rounded-xl border border-dark-border bg-dark-bg p-3 text-[0.78rem] leading-relaxed text-dark-text whitespace-pre-wrap break-words';