import { getRoleLabel } from '@/lib/club-roles';

// Renders the "Issued By" value on certificate views. When the issuer is a
// known member (profile found by the stored email) show their name, club
// position and club, linking to their public profile page.
export default function IssuerBadge({ issuer, fallback }: { issuer: any; fallback: string }) {
  if (!issuer) return <>{fallback || '-'}</>;

  const membership =
    Array.isArray(issuer.clubMemberships) && issuer.clubMemberships.length > 0
      ? issuer.clubMemberships[0]
      : null;
  const parts: string[] = [issuer.name || issuer.userId || ''];
  if (membership) {
    const roleLabel = getRoleLabel(membership.role);
    parts.push(roleLabel ? `${roleLabel} · ${membership.club.name}` : membership.club.name);
  } else {
    if (issuer.title) parts.push(issuer.title);
    if (issuer.department) parts.push(issuer.department);
  }
  const label = parts.filter(Boolean).join(' — ');

  return (
    <a
      href={`/members/${encodeURIComponent(issuer.userId || '')}`}
      onClick={(e) => {
        if (!issuer.userId) e.preventDefault();
      }}
      className="inline-flex items-center gap-1.5 text-qsis hover:underline font-semibold max-w-full no-underline"
    >
      <i className="fas fa-id-card text-sm shrink-0"></i>
      <span className="truncate">{label}</span>
    </a>
  );
}