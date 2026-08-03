'use client';

import { ALL_ROLES } from '@/components/admin/constants';

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'bg-red-500/15', text: 'text-red-400' },
  manager: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  teacher: { bg: 'bg-green-500/15', text: 'text-green-400' },
  cr: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  student: { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  external: { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  user: { bg: 'bg-gray-500/15', text: 'text-gray-400' },
};

export default function RoleBadge({ role, className = '' }: { role: string; className?: string }) {
  const found = ALL_ROLES.find(r => r.key === role);
  const label = found?.label || 'User';
  const icon = found?.icon || 'fa-user';
  const colors = ROLE_COLORS[role] || ROLE_COLORS.user;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} text-[0.65rem] font-semibold ${className}`}>
      <i className={`fas ${icon} text-[0.55rem]`}></i>
      {label}
    </span>
  );
}
