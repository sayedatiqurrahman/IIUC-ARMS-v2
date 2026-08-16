const STYLES: Record<string, string> = {
  admin: 'bg-red-500/15 text-red-400 ring-red-500/30',
  manager: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',
  teacher: 'bg-teal-500/15 text-teal-400 ring-teal-500/30',
};

export default function SystemRoleBadge({ roleKey, label, size = 'md' }: { roleKey?: string; label?: string; size?: 'sm' | 'md' }) {
  if (!roleKey || !label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold ring-1 ${STYLES[roleKey] || 'bg-purple-500/15 text-purple-400 ring-purple-500/30'} ${size === 'sm' ? 'text-[0.55rem]' : 'text-[0.6rem]'}`}
      title={`${label} on the platform`}
    >
      <i className={`fas fa-shield-alt ${size === 'sm' ? 'text-[0.45rem]' : 'text-[0.5rem]'}`}></i>
      {label}
    </span>
  );
}
