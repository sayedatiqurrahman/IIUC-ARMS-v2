'use client';

const SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
} as const;

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return <i className={`fas fa-spinner fa-spin ${SIZES[size]} text-qsis ${className}`}></i>;
}
