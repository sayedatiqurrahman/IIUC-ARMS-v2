import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getRoleLabel } from '@/lib/club-roles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Member Profile | IIUC-ARMS' };

async function resolveProfile(id: string) {
  const { prisma } = await import('@/lib/prisma');
  if (id.includes('@')) {
    return prisma.profile.findUnique({ where: { userId: id.toLowerCase() } });
  }
  const { normalizeUniversityId } = await import('@/lib/utils');
  const candidates = [normalizeUniversityId(id), id.toLowerCase(), id.trim()];
  const seen: string[] = [];
  for (const cand of candidates) {
    if (!cand || seen.indexOf(cand) !== -1) continue;
    seen.push(cand);
    const hit = await prisma.profile.findFirst({ where: { universityId: { equals: cand } } });
    if (hit) return hit;
  }
  return null;
}

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  if (!id || id.length > 120) notFound();

  const profile = await resolveProfile(id);
  if (!profile || profile.isBanned) notFound();

  const { prisma } = await import('@/lib/prisma');
  const memberships = await prisma.clubMember.findMany({
    where: { userId: profile.userId },
    select: { role: true, isClubAdmin: true, club: { select: { name: true, slug: true, logoUrl: true } } },
    orderBy: [{ isClubAdmin: 'desc' }, { createdAt: 'asc' }],
  });

  const avatar = profile.githubAvatar || profile.image || '';
  const initials = (profile.name || profile.userId)
    .split(' ')
    .filter(Boolean)
    .map((w: string) => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  const contactEmail = profile.publicEmail || (profile.hideEmail ? '' : profile.userId);
  const showUniId = profile.universityId && !profile.hideUniversityId;
  const showSemester = profile.semester && !profile.hideSemester;
  const showWhatsapp = profile.whatsapp && !profile.hideWhatsapp;
  const hasMemberships = memberships.length > 0;

  const card = 'bg-dark-bg2 border border-dark-border rounded-2xl';
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 py-2 border-b border-dark-border/50 last:border-0">
      <span className="text-xs text-dark-text2 uppercase tracking-wider font-semibold shrink-0">{label}</span>
      <span className="text-sm text-dark-text break-words text-right">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-dark-bg py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className={`${card} p-6 sm:p-8 text-center`}>
          <div className="w-24 h-24 mx-auto rounded-full bg-qsis/20 border-2 border-qsis/40 flex items-center justify-center overflow-hidden mb-4">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-qsis">{initials}</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-dark-text">{profile.name || profile.userId}</h1>
          {profile.title && <p className="text-sm font-semibold text-qsis mt-1">{profile.title}</p>}
          {profile.department && <p className="text-xs text-dark-text2 mt-0.5">{profile.department}</p>}
          {profile.isCR && (
            <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.65rem] font-bold uppercase tracking-wide">
              Class Representative
            </span>
          )}
        </div>

        <div className={card}>
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <i className="fas fa-user text-qsis"></i>
            <h2 className="text-sm font-bold text-dark-text">Profile Details</h2>
          </div>
          <div className="px-5 pb-4 pt-1">
            {showUniId && row('University ID', <span className="font-mono font-bold text-dark-text">{profile.universityId}</span>)}
            {profile.department && row('Department', profile.department)}
            {showSemester && row('Semester', profile.semester)}
            {profile.section && row('Section', profile.section)}
            {contactEmail && row('Email', contactEmail)}
            {showWhatsapp && row('WhatsApp', profile.whatsapp)}
          </div>
        </div>

        {hasMemberships && (
          <div className={card}>
            <div className="flex items-center gap-2 px-5 pt-4 pb-1">
              <i className="fas fa-users text-qsis"></i>
              <h2 className="text-sm font-bold text-dark-text">Club Memberships</h2>
            </div>
            <div className="px-5 pb-4 pt-2 space-y-2">
              {memberships.map((m: any) => (
                <a
                  key={m.club.slug}
                  href={`/clubs/${m.club.slug}`}
                  className="flex items-center gap-3 bg-dark-bg rounded-xl px-3 py-2.5 no-underline hover:border-qsis/60 transition border border-transparent"
                >
                  {m.club.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.club.logoUrl} alt="" className="w-9 h-9 rounded-full object-cover bg-white" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-qsis/20 flex items-center justify-center text-xs font-bold text-qsis">
                      {m.club.name.substring(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-dark-text truncate">{m.club.name}</p>
                    <p className="text-xs text-qsis font-medium">{getRoleLabel(m.role)}{m.isClubAdmin ? ' · Club Admin' : ''}</p>
                  </div>
                  <i className="fas fa-chevron-right text-dark-text2 text-xs"></i>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}