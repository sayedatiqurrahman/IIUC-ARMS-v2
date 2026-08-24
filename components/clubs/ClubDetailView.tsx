'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useUserAccess } from '@/lib/useUserAccess';
import Link from 'next/link';
import { CLUB_ROLES, getRoleGroupMembers } from '@/lib/club-roles';
import type { ClubDataMember } from '@/lib/club-roles';
import { downloadCertPDF, generateBulkCertPDF } from '@/lib/club-cert-pdf';
import type { CertPDFData } from '@/lib/club-cert-pdf';

const ROLE_BADGE: Record<string, string> = {
  advisor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  president: 'bg-red-500/15 text-red-400 border-red-500/30',
  vice_president: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  gs: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  ags: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ogs: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  treasurer: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  finance: 'bg-green-500/15 text-green-400 border-green-500/30',
  it_media: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  cultural: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  publication: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  office_secretary: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  member: 'bg-dark-border/50 text-dark-text2 border-dark-border',
};

const CLAIM_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
};

type Section = 'overview' | 'members' | 'events' | 'certificates' | 'claims' | 'settings';
type ClaimFilter = 'pending' | 'approved' | 'rejected' | 'all';

const GROUP_ORDER = ['Executive', 'Finance', 'Operations', 'Members'];
const LEADERSHIP_ROLES = ['president', 'vice_president', 'gs', 'ags', 'ogs', 'advisor'];
const SORTED_ROLES = Object.entries(CLUB_ROLES).sort((a, b) => a[1].order - b[1].order);

function displayName(m: ClubDataMember): string {
  return m.name || m.userId.split('@')[0];
}

function initials(m: ClubDataMember): string {
  return displayName(m).substring(0, 2).toUpperCase();
}

export default function ClubDetailView({ params }: { params: Promise<{ slug: string }> }) {
  const profile = useAppStore(s => s.profile);
  const access = useUserAccess(profile.email || '', profile.role, profile.isCR, profile.customPermissions);

  const [club, setClub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [claims, setClaims] = useState<any[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>('pending');

  const [showAddMember, setShowAddMember] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [adding, setAdding] = useState(false);

  const [showAddEvent, setShowAddEvent] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evDate, setEvDate] = useState('');
  const [evVenue, setEvVenue] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);

  const [certSearch, setCertSearch] = useState('');
  const [certResults, setCertResults] = useState<any[]>([]);

  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimRole, setClaimRole] = useState('member');
  const [claimMsg, setClaimMsg] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  async function loadClub(s: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/clubs/${s}`);
      const data = await res.json();
      setClub(data.club);
    } catch {}
    setLoading(false);
  }

  async function loadClaims(status: ClaimFilter = claimFilter) {
    if (!slug) return;
    setClaimsLoading(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/claims?status=${status}`);
      const data = await res.json();
      setClaims(data.claims || []);
    } catch {}
    setClaimsLoading(false);
  }

  useEffect(() => {
    params.then(p => { setSlug(p.slug); loadClub(p.slug); });
  }, []);

  useEffect(() => {
    if (section === 'claims') loadClaims(claimFilter);
  }, [section, slug, claimFilter]);

  useEffect(() => {
    if (section === 'certificates') handleCertSearch('');
  }, [section, slug]);

  const myMember: ClubDataMember | undefined = club?.members?.find((m: ClubDataMember) => m.userId === profile.email);
  const isOfficer = !!myMember && ['gs', 'ags', 'ogs', 'office_secretary'].includes(myMember.role);
  const isGS = myMember?.role === 'gs';
  const isAdmin = profile.role === 'admin' || profile.role === 'manager';
  const canManage = isAdmin || isOfficer;
  const isMember = !!myMember;

  async function handleAddMember() {
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddMember(false);
        setAddEmail('');
        setAddRole('member');
        loadClub(slug);
      } else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
    setAdding(false);
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this member?')) return;
    try {
      await fetch(`/api/clubs/${slug}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      loadClub(slug);
    } catch {}
  }

  function handleExportMembers() {
    try {
      const blob = new Blob([JSON.stringify(club.members || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-members.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {}
  }

  async function handleAddEvent() {
    if (!evTitle.trim()) return;
    setAddingEvent(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: evTitle.trim(),
          description: evDesc.trim() || undefined,
          eventDate: evDate || undefined,
          venue: evVenue.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddEvent(false);
        setEvTitle(''); setEvDesc(''); setEvDate(''); setEvVenue('');
        loadClub(slug);
      } else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
    setAddingEvent(false);
  }

  async function handleReviewClaim(claimId: string, action: 'approve' | 'reject') {
    try {
      const res = await fetch(`/api/clubs/${slug}/claims`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, action }),
      });
      const data = await res.json();
      if (data.success) {
        loadClaims();
        loadClub(slug);
      } else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
  }

  async function handleSubmitClaim() {
    setSubmittingClaim(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedRole: claimRole, message: claimMsg.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setShowClaimModal(false);
        setClaimRole('member');
        setClaimMsg('');
        alert('Join request submitted! A club officer will review it soon.');
      } else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
    setSubmittingClaim(false);
  }

  async function handleCertSearch(query?: string) {
    if (!slug) return;
    const q = (query !== undefined ? query : certSearch).trim();
    try {
      const url = q
        ? `/api/clubs/${slug}/certificates?universityId=${encodeURIComponent(q)}`
        : `/api/clubs/${slug}/certificates`;
      const res = await fetch(url);
      const data = await res.json();
      setCertResults(data.certificates || []);
    } catch {}
  }

  function toCertPDFData(c: any): CertPDFData {
    return {
      certificateId: c.certificateId,
      memberName: c.memberName,
      universityId: c.universityId,
      department: c.department,
      session: c.session || undefined,
      post: c.post || undefined,
      eventName: c.eventName || undefined,
      clubName: club?.name || '',
      clubLogoUrl: club?.logoUrl || undefined,
      issuedBy: c.issuedBy,
      issuedAt: c.issuedAt,
      siteUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    };
  }

  async function handleDownloadCert(c: any) {
    try {
      await downloadCertPDF(toCertPDFData(c));
    } catch { alert('Failed to generate PDF'); }
  }

  async function handleBulkDownload() {
    if (certResults.length === 0) return;
    try {
      await generateBulkCertPDF(certResults.map(toCertPDFData));
    } catch { alert('Failed to generate PDF'); }
  }

  async function handleSyncGitHub() {
    try {
      const res = await fetch(`/api/clubs/${slug}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.synced) alert('Club data synced to GitHub.');
      else alert(data.error || 'Sync failed');
    } catch { alert('Network error'); }
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
    </div>
  );

  if (!club) return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center">
      <p className="text-dark-text2">Club not found</p>
    </div>
  );

  const memberCount = club._count?.members ?? club.members?.length ?? 0;
  const eventCount = club._count?.events ?? club.events?.length ?? 0;
  const certCount = club._count?.certificates ?? 0;
  const pendingClaimCount = claims.filter(c => c.status === 'pending').length;

  interface NavItem { key: Section; label: string; icon: string; badge?: number }
  const navItems: NavItem[] = [
    { key: 'overview', label: 'Overview', icon: 'fa-info-circle' },
    { key: 'members', label: 'Members', icon: 'fa-user-friends', badge: memberCount },
    { key: 'events', label: 'Events', icon: 'fa-calendar', badge: eventCount },
    { key: 'certificates', label: 'Certificates', icon: 'fa-certificate', badge: certCount },
    ...(canManage ? [{ key: 'claims' as Section, label: 'Claims', icon: 'fa-inbox', badge: pendingClaimCount }] : []),
    ...((isGS || isAdmin) ? [{ key: 'settings' as Section, label: 'Settings', icon: 'fa-cog' }] : []),
  ];

  function renderNavItem(item: NavItem) {
    const active = section === item.key;
    return (
      <button key={item.key} onClick={() => setSection(item.key)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition text-left ${active ? 'bg-qsis text-white' : 'text-dark-text2 hover:text-dark-text hover:bg-white/5'}`}>
        <i className={`fas ${item.icon} w-4 text-center`}></i>
        <span className="flex-1">{item.label}</span>
        {item.badge !== undefined && (
          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-semibold ${active ? 'bg-white/20 text-white' : 'bg-dark-bg3 text-dark-text2'}`}>{item.badge}</span>
        )}
      </button>
    );
  }

  const roleGroups = getRoleGroupMembers(club.members || []);
  const orderedGroups = [...GROUP_ORDER.filter(g => roleGroups[g]), ...Object.keys(roleGroups).filter(g => !GROUP_ORDER.includes(g))];

  return (
    <div className="min-h-screen bg-dark-bg">
      {club.coverUrl && (
        <div className="relative h-40 md:h-56 bg-cover bg-center" style={{ backgroundImage: `url(${club.coverUrl})` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-black/20 to-transparent"></div>
        </div>
      )}

      <div className={`max-w-6xl mx-auto px-4 py-6 ${club.coverUrl ? '-mt-6 relative z-10' : ''}`}>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          {club.logoUrl ? (
            <img src={club.logoUrl} alt={club.name} className="w-16 h-16 rounded-xl object-cover border-2 border-dark-border shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-qsis/20 flex items-center justify-center shrink-0">
              <i className="fas fa-users text-qsis text-2xl"></i>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-dark-text truncate">{club.name}</h1>
            <p className="text-xs text-dark-text2 mt-0.5"><i className="fas fa-building mr-1"></i>{club.department}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {!isMember && profile.email && (
              <button onClick={() => setShowClaimModal(true)}
                className="px-4 py-2 bg-qsis text-white rounded-lg text-xs font-semibold hover:opacity-90 transition">
                <i className="fas fa-hand-sparkles mr-1"></i> Join Club
              </button>
            )}
            <Link href={`/clubs/${slug}/certificates/issue`} className="no-underline">
              <button className="px-4 py-2 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                <i className="fas fa-certificate mr-1"></i> Issue Certs
              </button>
            </Link>
          </div>
        </div>

        <div className="flex gap-6 items-start">

          <aside className="hidden md:block w-56 shrink-0">
            <div className="sticky top-20 space-y-4">
              {club.description && (
                <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
                  <p className="text-[0.72rem] text-dark-text2 leading-relaxed">{club.description}</p>
                </div>
              )}
              <nav className="space-y-1 bg-dark-bg2 border border-dark-border rounded-xl p-2">
                {navItems.map(renderNavItem)}
              </nav>
            </div>
          </aside>

          <main className="flex-1 min-w-0">

            <div className="md:hidden flex gap-1 overflow-x-auto bg-dark-bg2 rounded-xl p-1 border border-dark-border mb-4">
              {navItems.map(item => (
                <button key={item.key} onClick={() => setSection(item.key)}
                  className={`whitespace-nowrap px-3 py-2 rounded-lg text-xs font-semibold transition ${section === item.key ? 'bg-qsis text-white' : 'text-dark-text2 hover:text-dark-text'}`}>
                  <i className={`fas ${item.icon} mr-1`}></i>{item.label}
                  {item.badge !== undefined && <span className="ml-1 opacity-70">({item.badge})</span>}
                </button>
              ))}
            </div>

            {section === 'overview' && (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { icon: 'fa-user-friends', label: 'Members', value: memberCount },
                    { icon: 'fa-calendar', label: 'Events', value: eventCount },
                    { icon: 'fa-certificate', label: 'Certificates', value: certCount },
                    { icon: 'fa-flag', label: 'Since', value: club.createdAt ? new Date(club.createdAt).getFullYear() : '—' },
                  ].map(s => (
                    <div key={s.label} className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
                      <i className={`fas ${s.icon} text-qsis mb-2 block`}></i>
                      <p className="text-lg font-bold text-dark-text leading-none">{s.value}</p>
                      <p className="text-[0.68rem] text-dark-text2 mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 bg-dark-bg2 border border-dark-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-dark-text mb-2"><i className="fas fa-book-open text-qsis mr-1"></i> About</h3>
                    <p className="text-xs text-dark-text2 leading-relaxed">
                      {club.description || 'No description has been added for this club yet.'}
                    </p>
                  </div>
                  <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-dark-text mb-3"><i className="fas fa-sitemap text-qsis mr-1"></i> Leadership</h3>
                    {LEADERSHIP_ROLES.some(role => (club.members || []).some((m: ClubDataMember) => m.role === role)) ? (
                      <div>
                        {LEADERSHIP_ROLES.map(role => {
                          const m = (club.members || []).find((mm: ClubDataMember) => mm.role === role);
                          if (!m) return null;
                          const ri = CLUB_ROLES[role];
                          return (
                            <div key={role} className="flex items-center gap-3 py-2 border-b border-dark-border last:border-0">
                              <div className="w-8 h-8 rounded-full bg-dark-bg flex items-center justify-center text-[0.65rem] font-bold text-dark-text shrink-0">
                                {initials(m)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-dark-text truncate">{displayName(m)}</p>
                                <span className={`inline-flex items-center gap-1 text-[0.62rem] px-2 py-0.5 rounded-full border font-semibold mt-0.5 ${ROLE_BADGE[role] || ROLE_BADGE.member}`}>
                                  <i className={`fas ${ri?.icon || 'fa-user'}`}></i> {ri?.label || role}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-dark-text2">No leadership assigned yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {section === 'members' && (
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-user-friends text-qsis mr-1"></i> Members</h3>
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddMember(true)}
                        className="px-3 py-2 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                        <i className="fas fa-user-plus mr-1"></i> Add Member
                      </button>
                      <button onClick={handleExportMembers}
                        className="px-3 py-2 bg-dark-bg2 text-dark-text2 border border-dark-border rounded-lg text-xs font-semibold hover:border-qsis transition">
                        <i className="fas fa-file-export mr-1"></i> Export JSON
                      </button>
                    </div>
                  )}
                </div>

                {(club.members || []).length === 0 ? (
                  <div className="text-center py-12 bg-dark-bg2 rounded-xl border border-dark-border">
                    <i className="fas fa-users text-dark-text2 text-3xl mb-3 block"></i>
                    <p className="text-xs text-dark-text2">No members yet</p>
                  </div>
                ) : (
                  orderedGroups.map(groupName => {
                    const members = roleGroups[groupName];
                    return (
                      <div key={groupName} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-2 mb-3">
                          <h4 className="text-sm font-bold text-dark-text">{groupName}</h4>
                          <span className="text-[0.62rem] px-2 py-0.5 rounded-full bg-dark-bg3 text-dark-text2 font-semibold">{members.length}</span>
                          <div className="flex-1 h-px bg-dark-border"></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {members.map((m: ClubDataMember) => {
                            const ri = CLUB_ROLES[m.role];
                            return (
                              <div key={`${m.userId}-${m.role}`} className="bg-dark-bg2 border border-dark-border rounded-xl p-3 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-9 h-9 rounded-full bg-dark-bg flex items-center justify-center text-xs font-bold text-dark-text shrink-0">
                                    {initials(m)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-dark-text truncate">{displayName(m)}</p>
                                    <span className={`inline-flex items-center gap-1 text-[0.62rem] px-2 py-0.5 rounded-full border font-semibold mt-0.5 ${ROLE_BADGE[m.role] || ROLE_BADGE.member}`}>
                                      <i className={`fas ${ri?.icon || 'fa-user'}`}></i> {ri?.label || m.role}
                                    </span>
                                  </div>
                                </div>
                                {canManage && m.userId !== profile.email && (
                                  <button onClick={() => handleRemoveMember(m.userId)} title="Remove member"
                                    className="text-red-400 hover:text-red-300 text-xs p-1 shrink-0">
                                    <i className="fas fa-user-minus"></i>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {section === 'events' && (
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-calendar text-qsis mr-1"></i> Events</h3>
                  {canManage && (
                    <button onClick={() => setShowAddEvent(true)}
                      className="px-3 py-2 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                      <i className="fas fa-calendar-plus mr-1"></i> Add Event
                    </button>
                  )}
                </div>
                {(club.events || []).length === 0 ? (
                  <div className="text-center py-12 bg-dark-bg2 rounded-xl border border-dark-border">
                    <i className="fas fa-calendar-times text-dark-text2 text-3xl mb-3 block"></i>
                    <p className="text-xs text-dark-text2">No events yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {club.events.map((ev: any) => (
                      <div key={ev.id} className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-bold text-dark-text">{ev.title}</h4>
                          {ev.eventDate && (
                            <span className="text-[0.68rem] text-dark-text2 whitespace-nowrap shrink-0 mt-0.5">
                              <i className="far fa-clock mr-1"></i>{new Date(ev.eventDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {ev.venue && <p className="text-xs text-dark-text2 mt-1"><i className="fas fa-map-marker-alt mr-1 text-qsis"></i>{ev.venue}</p>}
                        {ev.description && <p className="text-xs text-dark-text2 mt-2 leading-relaxed">{ev.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === 'certificates' && (
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-certificate text-qsis mr-1"></i> Certificates</h3>
                  <div className="flex gap-2">
                    {canManage && (
                      <Link href={`/clubs/${slug}/certificates/issue`} className="no-underline">
                        <button className="px-3 py-2 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                          <i className="fas fa-plus mr-1"></i> Issue Certs
                        </button>
                      </Link>
                    )}
                    <button onClick={handleBulkDownload} disabled={certResults.length === 0}
                      className="px-3 py-2 bg-dark-bg2 text-dark-text2 border border-dark-border rounded-lg text-xs font-semibold hover:border-qsis transition disabled:opacity-50 disabled:pointer-events-none">
                      <i className="fas fa-file-pdf mr-1 text-red-400"></i> Download All PDF ({certResults.length})
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 mb-4 flex-wrap">
                  <input type="text" value={certSearch} onChange={e => setCertSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCertSearch(); }}
                    placeholder="Search by University ID..."
                    className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis" />
                  <button onClick={() => handleCertSearch()}
                    className="px-4 py-2 bg-dark-bg2 border border-dark-border rounded-lg text-xs font-semibold text-dark-text2 hover:border-qsis transition">
                    <i className="fas fa-search mr-1"></i> Search
                  </button>
                  {certSearch.trim() !== '' && (
                    <button onClick={() => { setCertSearch(''); handleCertSearch(''); }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-dark-text2 hover:text-dark-text transition">Clear</button>
                  )}
                </div>

                {certResults.length === 0 ? (
                  <div className="text-center py-12 bg-dark-bg2 rounded-xl border border-dark-border">
                    <i className="fas fa-certificate text-dark-text2 text-3xl mb-3 block"></i>
                    <p className="text-xs text-dark-text2">No certificates found{certSearch.trim() ? ` for "${certSearch.trim()}"` : ''}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {certResults.map((c: any) => (
                      <div key={c.id || c.certificateId} className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-dark-text">{c.memberName}</p>
                              <span className="font-mono text-[0.68rem] text-qsis bg-qsis/10 border border-qsis/30 px-2 py-0.5 rounded-md">{c.certificateId}</span>
                            </div>
                            <p className="text-[0.7rem] text-dark-text2 mt-1.5 leading-relaxed">
                              {c.post && <><i className="fas fa-user-tag mr-1"></i>{c.post}<span className="mx-1">·</span></>}
                              <i className="fas fa-building mr-1"></i>{c.department}
                              <span className="mx-1">·</span>
                              <i className="fas fa-id-card mr-1"></i>{c.universityId}
                              {c.session && <><span className="mx-1">·</span><i className="far fa-calendar-alt mr-1"></i>{c.session}</>}
                              {c.eventName && <><span className="mx-1">·</span><i className="fas fa-bullhorn mr-1"></i>{c.eventName}</>}
                            </p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <Link href={`/clubs/verify/${c.certificateId}`} className="text-qsis text-[0.68rem] font-semibold hover:underline no-underline">
                                <i className="fas fa-external-link-alt mr-1"></i>Verify
                              </Link>
                              <span className="text-[0.62rem] text-dark-text3">
                                Issued {new Date(c.issuedAt).toLocaleDateString()}{c.issuedBy ? ` by ${c.issuedBy.split('@')[0]}` : ''}
                              </span>
                            </div>
                          </div>
                          <button onClick={() => handleDownloadCert(c)} title="Download PDF"
                            className="px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-500/20 transition shrink-0">
                            <i className="fas fa-file-pdf mr-1"></i> PDF
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === 'claims' && (
              <div>
                <h3 className="text-sm font-bold text-dark-text mb-4"><i className="fas fa-inbox text-qsis mr-1"></i> Join Requests</h3>

                <div className="flex gap-1 mb-4 bg-dark-bg2 rounded-xl p-1 border border-dark-border overflow-x-auto">
                  {(['pending', 'approved', 'rejected', 'all'] as ClaimFilter[]).map(f => (
                    <button key={f} onClick={() => setClaimFilter(f)}
                      className={`flex-1 whitespace-nowrap capitalize px-3 py-2 rounded-lg text-xs font-semibold transition ${claimFilter === f ? 'bg-qsis text-white' : 'text-dark-text2 hover:text-dark-text'}`}>
                      {f}
                    </button>
                  ))}
                </div>

                {claimsLoading ? (
                  <div className="text-center py-12">
                    <i className="fas fa-spinner fa-spin text-qsis text-xl"></i>
                  </div>
                ) : claims.length === 0 ? (
                  <div className="text-center py-12 bg-dark-bg2 rounded-xl border border-dark-border">
                    <i className="fas fa-inbox text-dark-text2 text-3xl mb-3 block"></i>
                    <p className="text-xs text-dark-text2 capitalize">No {claimFilter === 'all' ? '' : claimFilter} claims</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {claims.map((c: any) => (
                      <div key={c.id} className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-dark-bg flex items-center justify-center text-xs font-bold text-dark-text shrink-0">
                            {c.userId.split('@')[0].substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-semibold text-dark-text break-all">{c.userId}</p>
                              <span className={`inline-flex items-center gap-1 text-[0.62rem] px-2 py-0.5 rounded-full border font-semibold ${ROLE_BADGE[c.requestedRole] || ROLE_BADGE.member}`}>
                                <i className={`fas ${CLUB_ROLES[c.requestedRole]?.icon || 'fa-user'}`}></i>
                                {CLUB_ROLES[c.requestedRole]?.label || c.requestedRole}
                              </span>
                              <span className={`text-[0.62rem] px-2 py-0.5 rounded-full border font-semibold capitalize ${CLAIM_STATUS_BADGE[c.status] || CLAIM_STATUS_BADGE.pending}`}>
                                {c.status}
                              </span>
                            </div>
                            {c.message && <p className="text-xs text-dark-text2 mt-2 italic">&ldquo;{c.message}&rdquo;</p>}
                            <p className="text-[0.62rem] text-dark-text3 mt-2">
                              <i className="far fa-clock mr-1"></i>{new Date(c.createdAt).toLocaleString()}
                              {c.reviewedBy && <> · Reviewed by {c.reviewedBy}</>}
                            </p>
                            {c.status === 'pending' && (
                              <div className="flex gap-2 mt-3">
                                <button onClick={() => handleReviewClaim(c.id, 'approve')}
                                  className="px-3 py-1.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded-lg text-[0.68rem] font-semibold hover:bg-green-500/25 transition">
                                  <i className="fas fa-check mr-1"></i> Approve
                                </button>
                                <button onClick={() => handleReviewClaim(c.id, 'reject')}
                                  className="px-3 py-1.5 bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg text-[0.68rem] font-semibold hover:bg-red-500/25 transition">
                                  <i className="fas fa-times mr-1"></i> Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {section === 'settings' && (
              <div className="max-w-2xl space-y-4">
                <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
                  <h3 className="text-sm font-bold text-dark-text mb-4"><i className="fas fa-info-circle text-qsis mr-1"></i> Basic Info</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[0.65rem] text-dark-text3 font-semibold uppercase tracking-wide mb-0.5">Club Name</p>
                      <p className="text-sm text-dark-text">{club.name}</p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] text-dark-text3 font-semibold uppercase tracking-wide mb-0.5">Department</p>
                      <p className="text-sm text-dark-text">{club.department}</p>
                    </div>
                    <div>
                      <p className="text-[0.65rem] text-dark-text3 font-semibold uppercase tracking-wide mb-0.5">Description</p>
                      <p className="text-sm text-dark-text">{club.description || '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-bg2 border border-dark-border rounded-xl p-5">
                  <h3 className="text-sm font-bold text-dark-text mb-2"><i className="fab fa-github text-qsis mr-1"></i> GitHub Backup</h3>
                  <p className="text-xs text-dark-text2 mb-4">
                    Sync this club&rsquo;s data (config, members, events, certificates, claims) to GitHub as JSON.
                  </p>
                  {isAdmin ? (
                    <button onClick={handleSyncGitHub}
                      className="px-4 py-2 bg-qsis/10 text-qsis border border-qsis/30 rounded-lg text-xs font-semibold hover:bg-qsis/20 transition">
                      <i className="fas fa-sync-alt mr-1"></i> Sync to GitHub
                    </button>
                  ) : (
                    <p className="text-[0.68rem] text-dark-text3"><i className="fas fa-lock mr-1"></i>Only admins and managers can sync to GitHub.</p>
                  )}
                  {access.hasAdminPanelAccess && (
                    <div className="mt-3 pt-3 border-t border-dark-border">
                      <Link href="/admin" className="text-qsis text-xs font-semibold hover:underline no-underline">
                        <i className="fas fa-shield-alt mr-1"></i>Open Admin Panel
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddMember(false)}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-dark-text mb-4"><i className="fas fa-user-plus text-qsis mr-2"></i>Add Member</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Email *</label>
                <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                  placeholder="student@ugrad.iiuc.ac.bd" />
              </div>
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis">
                  {SORTED_ROLES.map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddMember(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-white/5 transition">Cancel</button>
              <button onClick={handleAddMember} disabled={!addEmail.trim() || adding}
                className="flex-1 px-3 py-2 rounded-lg bg-qsis text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition">
                {adding ? <i className="fas fa-spinner fa-spin"></i> : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddEvent(false)}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-dark-text mb-4"><i className="fas fa-calendar-plus text-qsis mr-2"></i>Add Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Title *</label>
                <input type="text" value={evTitle} onChange={e => setEvTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                  placeholder="Event title" />
              </div>
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Description</label>
                <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis resize-none"
                  placeholder="Event details..." />
              </div>
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Date</label>
                <input type="datetime-local" value={evDate} onChange={e => setEvDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis" />
              </div>
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Venue</label>
                <input type="text" value={evVenue} onChange={e => setEvVenue(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                  placeholder="Room / Hall" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddEvent(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-white/5 transition">Cancel</button>
              <button onClick={handleAddEvent} disabled={!evTitle.trim() || addingEvent}
                className="flex-1 px-3 py-2 rounded-lg bg-qsis text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition">
                {addingEvent ? <i className="fas fa-spinner fa-spin"></i> : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowClaimModal(false)}>
          <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-dark-text mb-1"><i className="fas fa-hand-sparkles text-qsis mr-2"></i>Join {club.name}</h3>
            <p className="text-xs text-dark-text2 mb-4">Request membership — a club officer will review your claim.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Requested Role</label>
                <select value={claimRole} onChange={e => setClaimRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis">
                  {SORTED_ROLES.map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-dark-text2 font-semibold mb-1 block">Message</label>
                <textarea value={claimMsg} onChange={e => setClaimMsg(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis resize-none"
                  placeholder="Tell the officers why you want to join..." />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowClaimModal(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-white/5 transition">Cancel</button>
              <button onClick={handleSubmitClaim} disabled={submittingClaim}
                className="flex-1 px-3 py-2 rounded-lg bg-qsis text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition">
                {submittingClaim ? <i className="fas fa-spinner fa-spin"></i> : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
