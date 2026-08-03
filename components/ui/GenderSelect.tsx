'use client';

import CustomSelect from '@/components/CustomSelect';

interface GenderSelectProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export default function GenderSelect({ value, onChange, placeholder = 'Select gender...', className = '' }: GenderSelectProps) {
  return (
    <CustomSelect
      options={[
        { value: 'male', label: 'Male', icon: 'fa-mars' },
        { value: 'female', label: 'Female', icon: 'fa-venus' },
        { value: 'both', label: 'Both', icon: 'fa-venus-mars' },
      ]}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
