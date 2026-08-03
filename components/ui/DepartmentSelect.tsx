'use client';

import CustomSelect from '@/components/CustomSelect';
import { getDepartmentOptions } from '@/lib/utils';

interface DepartmentSelectProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  includeAll?: boolean;
}

export default function DepartmentSelect({ value, onChange, placeholder = 'Select department...', className = '', includeAll = false }: DepartmentSelectProps) {
  const options = includeAll
    ? [{ value: 'all', label: 'All Departments', icon: 'fa-building' }, ...getDepartmentOptions()]
    : getDepartmentOptions();

  return (
    <CustomSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchable
      className={className}
    />
  );
}
