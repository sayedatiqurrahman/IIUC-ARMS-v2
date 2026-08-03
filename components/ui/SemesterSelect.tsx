'use client';

import CustomSelect from '@/components/CustomSelect';
import { getSemesterOptions } from '@/lib/utils';

interface SemesterSelectProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SemesterSelect({ value, onChange, placeholder = 'Select semester...', className = '' }: SemesterSelectProps) {
  return (
    <CustomSelect
      options={getSemesterOptions()}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
