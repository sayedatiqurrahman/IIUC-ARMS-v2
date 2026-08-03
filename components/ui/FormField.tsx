'use client';

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export default function FormField({ label, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[0.7rem] font-semibold text-dark-text3 uppercase tracking-wider">{label}</label>
      {children}
      {error && <span className="text-[0.7rem] text-red-400">{error}</span>}
    </div>
  );
}
