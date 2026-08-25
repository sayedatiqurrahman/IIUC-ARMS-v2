'use client';

import { useEffect, useState, useRef } from 'react';
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
  pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  approved: 'bg-green-500/15 text-green-400 border border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

type Section = 'posts' | 'about' | 'members' | 'events' | 'certificates' | 'claims' | 'settings';
type ClaimFilter = 'pending' | 'approved' | 'rejected' | 'all';

const GROUP_ORDER = ['Executive', 'Finance', 'Operations', 'Members'];
const SORTED_ROLES = Object.entries(CLUB_ROLES).sort((a, b) => a[1].order - b[1].order);

function dn(m: ClubDataMember): string { return m.name || m.userId.split('@')[0]; }
function ui(m: ClubDataMember): string { return dn(m).substring(0, 2).toUpperCase(); }
function timeAgo(d: string): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24);
  return dy < 30 ? `${dy}d ago` : `${Math.floor(dy / 30)}mo ago`;
}

export default function ClubDetailView({ params }: { params: Promise<{ slug: string }> }) {
  const profile = useAppStore(s => s.profile);
  const access = useUserAccess(profile.email || '', profile.role, profile.isCR, profile.customPermissions);
  const headerRef = useRef<HTMLDivElement>(null);
  const [stickyTab, setStickyTab] = useState(false);

  const [club, setClub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [section, setSection] = useState<Section>('certificates');
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

  const [logoUploading, setLogoUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editSession, setEditSession] = useState('');

  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimRole, setClaimRole] = useState('member');
  const [claimMsg, setClaimMsg] = useState('');
  const [submittingClaim, setSubmittingClaim] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (headerRef.current) {
        const bottom = headerRef.current.getBoundingClientRect().bottom;
        setStickyTab(bottom <= 52);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    if (section === 'claims' && slug) loadClaims(claimFilter);
  }, [section, slug, claimFilter]);
  useEffect(() => {
    if ((section === 'certificates' || section === 'posts') && slug) handleCertSearch('');
  }, [section, slug]);

  const myMember: ClubDataMember | undefined = club?.members?.find((m: ClubDataMember) => m.userId === profile.email);
  const isOfficer = !!myMember && ['gs', 'ags', 'ogs', 'office_secretary'].includes(myMember.role);
  const isGS = myMember?.role === 'gs';
  const isClubAdmin = !!myMember?.isClubAdmin;
  const isAdmin = profile.role === 'admin' || profile.role === 'manager';
  const canManage = isAdmin || isOfficer || isClubAdmin;
  const isMember = !!myMember;
  const clubSettings = (() => { try { return JSON.parse(club?.settings || '{}'); } catch { return {}; } })();

  async function handleAddMember() {
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addEmail.trim(), role: addRole }),
      });
      const data = await res.json();
      if (data.success) { setShowAddMember(false); setAddEmail(''); setAddRole('member'); loadClub(slug); }
      else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
    setAdding(false);
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this member?')) return;
    try {
      await fetch(`/api/clubs/${slug}/members`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      loadClub(slug);
    } catch {}
  }

  async function handleChangeRole() {
    if (!editingMember || !editRole) return;
    try {
      const res = await fetch(`/api/clubs/${slug}/members`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: editingMember, role: editRole, session: editSession.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) { setEditingMember(null); setEditRole(''); setEditSession(''); loadClub(slug); }
      else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
  }

  function handleExportMembers() {
    try {
      const blob = new Blob([JSON.stringify(club.members || [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${slug}-members.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch {}
  }

  async function handleAddEvent() {
    if (!evTitle.trim()) return;
    setAddingEvent(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: evTitle.trim(), description: evDesc.trim() || undefined, eventDate: evDate || undefined, venue: evVenue.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) { setShowAddEvent(false); setEvTitle(''); setEvDesc(''); setEvDate(''); setEvVenue(''); loadClub(slug); }
      else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
    setAddingEvent(false);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('Max 5MB'); return; }
    setLogoUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((res, rej) => { reader.onload = () => res(reader.result as string); reader.onerror = rej; reader.readAsDataURL(file); });
      const r = await fetch(`/api/clubs/${slug}/logo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUri }) });
      const d = await r.json();
      if (d.success) setClub((p: any) => ({ ...p, logoUrl: d.logoUrl }));
      else alert(d.error || 'Failed');
    } catch { alert('Network error'); }
    setLogoUploading(false);
    e.target.value = '';
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) { alert('Max 10MB'); return; }
    setCoverUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((res, rej) => { reader.onload = () => res(reader.result as string); reader.onerror = rej; reader.readAsDataURL(file); });
      const r = await fetch(`/api/clubs/${slug}/logo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUri, type: 'cover' }) });
      const d = await r.json();
      if (d.success) setClub((p: any) => ({ ...p, coverUrl: d.coverUrl || d.logoUrl }));
      else alert(d.error || 'Failed');
    } catch { alert('Network error'); }
    setCoverUploading(false);
    e.target.value = '';
  }

  async function handleCertSearch(query?: string) {
    const q = query !== undefined ? query : certSearch;
    try {
      const url = q ? `/api/clubs/${slug}/certificates?search=${encodeURIComponent(q)}` : `/api/clubs/${slug}/certificates`;
      const res = await fetch(url);
      const data = await res.json();
      setCertResults(data.certificates || []);
    } catch {}
  }

  async function handleBulkDownload() {
    if (certResults.length === 0) return;
    const certs: CertPDFData[] = certResults.map((c: any) => ({
      certificateId: c.certificateId, memberName: c.memberName, universityId: c.universityId,
      department: c.department, session: c.session || '', post: c.post || '',
      eventName: c.eventName || '', servicePeriod: c.servicePeriod || '',
      clubName: club?.name || slug, clubLogoUrl: club?.logoUrl, iiucLogoUrl: '/iiuc-logo.png',
      issuedBy: club?.name || slug, issuedAt: c.issuedAt || new Date().toISOString(),
      signatories: (() => { try { return JSON.parse(c.signatories || '[]'); } catch { return []; } })(),
      theme: undefined,
    }));
    try { await generateBulkCertPDF(certs); } catch { alert('PDF generation failed'); }
  }

  async function handleSyncGitHub() {
    try {
      const res = await fetch(`/api/clubs/${slug}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.synced) alert('Synced to GitHub.'); else alert(data.error || 'Sync failed');
    } catch { alert('Network error'); }
  }

  async function handleClaimReview(claimId: string, status: 'approved' | 'rejected') {
    try {
      const res = await fetch(`/api/clubs/${slug}/claims`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, status }),
      });
      const data = await res.json();
      if (data.success) loadClaims(claimFilter); else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
  }

  async function handleSubmitClaim() {
    if (!slug) return;
    setSubmittingClaim(true);
    try {
      const res = await fetch(`/api/clubs/${slug}/claims`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: claimRole, message: claimMsg.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) { setShowClaimModal(false); setClaimMsg(''); setClaimRole('member'); alert('Request submitted!'); }
      else alert(data.error || 'Failed');
    } catch { alert('Network error'); }
    setSubmittingClaim(false);
  }

  function toCertPDFData(cert: any): CertPDFData {
    return {
      certificateId: cert.certificateId, memberName: cert.memberName, universityId: cert.universityId,
      department: cert.department, session: cert.session || '', post: cert.post || '',
      eventName: cert.eventName || '', servicePeriod: cert.servicePeriod || '',
      clubName: club?.name || slug, clubLogoUrl: club?.logoUrl, iiucLogoUrl: '/iiuc-logo.png',
      issuedBy: club?.name || slug, issuedAt: cert.issuedAt || new Date().toISOString(),
      signatories: (() => { try { return JSON.parse(cert.signatories || '[]'); } catch { return []; } })(),
      theme: undefined,
    };
  }

  if (loading) return (
    <div className="min-h-screen bg-[#18191a] flex items-center justify-center">
      <div className="text-center">
        <i className="fas fa-spinner fa-spin text-blue-500 text-3xl"></i>
        <p className="text-gray-400 mt-3 text-sm">Loading club page...</p>
      </div>
    </div>
  );

  if (!club) return (
    <div className="min-h-screen bg-[#18191a] flex items-center justify-center">
      <div className="text-center max-w-sm mx-auto px-4">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
          <i className="fas fa-users text-gray-500 text-3xl"></i>
        </div>
        <h2 className="text-white text-lg font-bold mb-2">Club not found</h2>
        <p className="text-gray-400 text-sm mb-4">This club page doesn&apos;t exist or hasn&apos;t been set up yet.</p>
        <Link href="/clubs" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition">
          <i className="fas fa-arrow-left"></i> Back to Clubs
        </Link>
      </div>
    </div>
  );

  const memberCount = club._count?.members ?? club.members?.length ?? 0;
  const eventCount = club._count?.events ?? club.events?.length ?? 0;
  const certCount = club._count?.certificates ?? 0;
  const pendingClaimCount = claims.filter(c => c.status === 'pending').length;
  const roleGroups = getRoleGroupMembers(club.members || []);
  const orderedGroups = [...GROUP_ORDER.filter(g => roleGroups[g]), ...Object.keys(roleGroups).filter(g => !GROUP_ORDER.includes(g))];
  const leadership = (club.members || []).filter((m: ClubDataMember) => m.role !== 'member');
  const recentMembers = (club.members || []).slice(0, 8);

  const navItems: { key: Section; label: string; icon: string; badge?: number }[] = [
    { key: 'certificates', label: 'Certificates', icon: 'fa-award', badge: certCount },
    { key: 'events', label: 'Events', icon: 'fa-calendar-days', badge: eventCount },
    { key: 'members', label: 'Members', icon: 'fa-user-group', badge: memberCount },
    { key: 'about', label: 'About', icon: 'fa-circle-info' },
    ...(canManage ? [{ key: 'claims' as Section, label: 'Claims', icon: 'fa-inbox', badge: pendingClaimCount }] : []),
    ...(isGS || isClubAdmin || isAdmin ? [{ key: 'settings' as Section, label: 'Settings', icon: 'fa-gear' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#18191a]">
      {/* ══════════ COVER ══════════ */}
      <div ref={headerRef} className="relative">
        <div className="relative h-[200px] sm:h-[280px] md:h-[340px] lg:h-[380px]">
          {club.coverUrl ? (
            <img src={club.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-900/60 via-[#1c1e21] to-purple-900/40" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#18191a] via-transparent to-transparent" />
          {canManage && (
            <label className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-2 bg-[#3a3b3c]/80 hover:bg-[#4e4f50]/80 backdrop-blur-sm text-white rounded-lg text-xs font-semibold cursor-pointer transition border border-white/10">
              <i className="fas fa-camera"></i>{coverUploading ? ' Uploading...' : 'Edit cover'}
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={coverUploading} />
            </label>
          )}
        </div>

        {/* ══════════ PROFILE HEADER ══════════ */}
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8 sm:-mt-10 relative z-10">
            {/* Logo */}
            <div className="relative shrink-0 self-center sm:self-auto">
              {club.logoUrl ? (
                <img src={club.logoUrl} alt={club.name} className="w-[120px] h-[120px] sm:w-[168px] sm:h-[168px] rounded-full object-cover border-4 border-[#18191a] shadow-xl" />
              ) : (
                <div className="w-[120px] h-[120px] sm:w-[168px] sm:h-[168px] rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center border-4 border-[#18191a] shadow-xl">
                  <i className="fas fa-users text-white text-4xl sm:text-5xl"></i>
                </div>
              )}
              {canManage && (
                <label className="absolute bottom-1 right-1 w-9 h-9 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full flex items-center justify-center cursor-pointer shadow-lg transition border border-white/10">
                  <i className="fas fa-camera text-white text-sm"></i>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                </label>
              )}
            </div>

            {/* Name & Info */}
            <div className="flex-1 min-w-0 pb-2 text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{club.name}</h1>
              <p className="text-sm text-gray-400 mt-1">
                <i className="fas fa-building mr-1"></i>{club.department}
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 mt-2 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <i className="fas fa-user-group text-blue-400"></i>
                  <strong className="text-white">{memberCount}</strong> members
                </span>
                <span className="flex items-center gap-1">
                  <i className="fas fa-calendar-days text-green-400"></i>
                  <strong className="text-white">{eventCount}</strong> events
                </span>
                <span className="flex items-center gap-1">
                  <i className="fas fa-award text-yellow-400"></i>
                  <strong className="text-white">{certCount}</strong> certificates
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                <i className="fas fa-clock mr-1"></i>Created {timeAgo(club.createdAt)} by {club.createdBy?.split('@')[0]}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 shrink-0 pb-2">
              {!isMember && profile.email && (
                <button onClick={() => setShowClaimModal(true)} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition shadow-lg shadow-blue-600/20">
                  <i className="fas fa-hand-sparkles mr-1.5"></i>Follow
                </button>
              )}
              {isMember && (
                <span className="px-4 py-2.5 bg-green-600/15 text-green-400 border border-green-500/30 rounded-lg text-sm font-bold">
                  <i className="fas fa-check-circle mr-1.5"></i>Following
                </span>
              )}
              {canManage && (
                <Link href={`/clubs/${slug}/certificates/issue`} className="no-underline">
                  <button className="px-4 py-2.5 bg-[#3a3b3c] hover:bg-[#4e4f50] text-white border border-white/10 rounded-lg text-sm font-semibold transition">
                    <i className="fas fa-award mr-1.5"></i>Issue Cert
                  </button>
                </Link>
              )}
            </div>
          </div>

          {/* ══════════ TAB BAR ══════════ */}
          <div className={`mt-4 border-b border-[#3a3b3c] transition-all ${stickyTab ? 'fixed top-0 left-0 right-0 z-50 bg-[#242526] shadow-xl shadow-black/30' : ''}`}>
            <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
              <div className="flex gap-0 overflow-x-auto scrollbar-hide">
                {navItems.map(item => {
                  const active = section === item.key;
                  return (
                    <button key={item.key} onClick={() => setSection(item.key)}
                      className={`relative px-4 py-3.5 text-sm font-semibold transition whitespace-nowrap ${
                        active
                          ? 'text-blue-400'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                      }`}>
                      <i className={`fas ${item.icon} mr-1.5`}></i>{item.label}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[0.6rem] rounded-full bg-blue-500/20 text-blue-400 font-bold">{item.badge}</span>
                      )}
                      {active && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-blue-500 rounded-t-full"></div>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-6 flex-col lg:flex-row">

          {/* ── LEFT SIDEBAR ── */}
          <div className="lg:w-[360px] shrink-0 space-y-4">
            {/* About Card */}
            <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden">
              <div className="p-4">
                <h3 className="text-lg font-bold text-white mb-3">About</h3>
                {club.description ? (
                  <p className="text-sm text-gray-300 leading-relaxed">{club.description}</p>
                ) : (
                  <p className="text-sm text-gray-500 italic">No description yet.</p>
                )}
              </div>
              <div className="border-t border-[#3a3b3c]">
                <div className="px-4 py-3 flex items-center gap-3">
                  <i className="fas fa-building text-gray-400 w-5 text-center"></i>
                  <div><p className="text-sm text-white">{club.department}</p><p className="text-xs text-gray-500">Department</p></div>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  <i className="fas fa-clock text-gray-400 w-5 text-center"></i>
                  <div><p className="text-sm text-white">Created {new Date(club.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p><p className="text-xs text-gray-500">Club established</p></div>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  <i className="fas fa-user text-gray-400 w-5 text-center"></i>
                  <div><p className="text-sm text-white">{club.createdBy}</p><p className="text-xs text-gray-500">Created by</p></div>
                </div>
              </div>
            </div>

            {/* Certificates Highlight */}
            <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-white"><i className="fas fa-award text-yellow-400 mr-2"></i>Certificates</h3>
                  <span className="text-sm font-bold text-yellow-400">{certCount}</span>
                </div>
                {certCount > 0 ? (
                  <>
                    <p className="text-xs text-gray-400 mb-3">Official certificates issued by {club.name}. Scan the QR code on any certificate to verify.</p>
                    <button onClick={() => setSection('certificates')} className="w-full px-3 py-2 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg text-xs font-semibold hover:bg-yellow-500/20 transition mb-2">
                      <i className="fas fa-award mr-1.5"></i>View All Certificates
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">No certificates issued yet.</p>
                )}
                <Link href={`/clubs/${slug}/certificates/issue`} className="no-underline block">
                  <button className="w-full px-3 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold hover:bg-blue-600/20 transition">
                    <i className="fas fa-plus mr-1.5"></i>Issue Certificate
                  </button>
                </Link>
              </div>
              <div className="border-t border-[#3a3b3c]">
                <Link href="/verify" className="flex items-center gap-3 px-4 py-3 hover:bg-[#3a3b3c] transition no-underline">
                  <div className="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center">
                    <i className="fas fa-qrcode text-green-400"></i>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Verify Certificate</p>
                    <p className="text-xs text-gray-500">Scan QR or enter ID</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* Members Quick View */}
            {recentMembers.length > 0 && (
              <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-white"><i className="fas fa-user-group text-blue-400 mr-2"></i>Members</h3>
                    <span className="text-sm font-bold text-blue-400">{memberCount}</span>
                  </div>
                  {/* Avatar stack */}
                  <div className="flex -space-x-2 mb-3">
                    {recentMembers.slice(0, 10).map((m: ClubDataMember) => (
                      <div key={m.userId} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[0.55rem] font-bold text-white ring-2 ring-[#242526]" title={dn(m)}>
                        {ui(m)}
                      </div>
                    ))}
                    {memberCount > 10 && (
                      <div className="w-9 h-9 rounded-full bg-[#3a3b3c] flex items-center justify-center text-[0.55rem] font-bold text-gray-400 ring-2 ring-[#242526]">
                        +{memberCount - 10}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setSection('members')} className="w-full px-3 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold hover:bg-blue-600/20 transition">
                    <i className="fas fa-user-group mr-1.5"></i>View All Members
                  </button>
                </div>
              </div>
            )}

            {/* Photos placeholder */}
            {club.coverUrl && (
              <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4">
                <h3 className="text-base font-bold text-white mb-3">Cover Photo</h3>
                <img src={club.coverUrl} alt="" className="w-full rounded-lg object-cover" />
              </div>
            )}

            {/* Leadership Quick View */}
            {leadership.length > 0 && (
              <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4">
                <h3 className="text-base font-bold text-white mb-3">Leadership</h3>
                <div className="space-y-2.5">
                  {leadership.slice(0, 6).map((m: ClubDataMember) => {
                    const ri = CLUB_ROLES[m.role];
                    return (
                      <div key={m.userId} className="flex items-center gap-3 group">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0 ring-2 ring-[#242526]">
                          {ui(m)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition">{dn(m)}</p>
                          <span className={`inline-flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full border font-semibold ${ROLE_BADGE[m.role] || ROLE_BADGE.member}`}>
                            <i className={`fas ${ri?.icon || 'fa-user'}`}></i> {ri?.label || m.role}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── MAIN FEED ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ═══ POSTS ═══ */}
            {section === 'posts' && (
              <div className="space-y-4">
                {/* Create Post Box */}
                {canManage && (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {club.logoUrl ? <img src={club.logoUrl} alt="" className="w-full h-full rounded-full object-cover" /> : <i className="fas fa-users"></i>}
                      </div>
                      <button onClick={() => setShowAddEvent(true)} className="flex-1 text-left px-4 py-2.5 bg-[#3a3b3c] hover:bg-[#4e4f50] rounded-full text-sm text-gray-400 transition">
                        Create an event...
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddEvent(true)} className="flex-1 flex items-center justify-center gap-2 py-2 hover:bg-[#3a3b3c] rounded-lg text-sm text-gray-300 font-semibold transition">
                        <i className="fas fa-calendar-plus text-green-400"></i> Event
                      </button>
                      <Link href={`/clubs/${slug}/certificates/issue`} className="flex-1 no-underline">
                        <button className="w-full flex items-center justify-center gap-2 py-2 hover:bg-[#3a3b3c] rounded-lg text-sm text-gray-300 font-semibold transition">
                          <i className="fas fa-award text-yellow-400"></i> Certificate
                        </button>
                      </Link>
                    </div>
                  </div>
                )}

                {/* Certificates Highlight Card */}
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-yellow-500/15 flex items-center justify-center">
                        <i className="fas fa-award text-yellow-400 text-xl"></i>
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">{certCount} Certificates Issued</h3>
                        <p className="text-sm text-gray-400">Verified credentials from {club.name}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                      Every certificate issued by {club.name} contains a unique QR code. Anyone can scan it with their phone camera or any QR scanner to verify authenticity instantly.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={() => setSection('certificates')} className="flex-1 px-4 py-2.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-lg text-sm font-semibold hover:bg-yellow-500/20 transition">
                        <i className="fas fa-award mr-1.5"></i>View Certificates
                      </button>
                      <Link href="/verify" className="flex-1 no-underline">
                        <button className="w-full px-4 py-2.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg text-sm font-semibold hover:bg-green-500/20 transition">
                          <i className="fas fa-qrcode mr-1.5"></i>Verify a Cert
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Recent Certificates as Posts */}
                {certResults.length > 0 && certResults.slice(0, 3).map((cert: any) => (
                  <div key={cert.id || cert.certificateId} className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden">
                    <div className="p-4 pb-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {club.logoUrl ? <img src={club.logoUrl} alt="" className="w-full h-full rounded-full object-cover" /> : <i className="fas fa-users"></i>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">{club.name}</p>
                          <p className="text-xs text-gray-500">Issued a certificate &middot; {timeAgo(cert.issuedAt)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="bg-[#18191a] rounded-xl p-4 border border-yellow-500/10">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-yellow-500/15 flex items-center justify-center shrink-0">
                            <i className="fas fa-award text-yellow-400"></i>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{cert.memberName}</p>
                            <p className="text-xs text-gray-500 font-mono">{cert.certificateId}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {cert.post && <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md">{cert.post}</span>}
                          {cert.eventName && <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded-md">{cert.eventName}</span>}
                          {cert.servicePeriod && <span className="px-2 py-1 bg-gray-500/10 text-gray-400 rounded-md">{cert.servicePeriod}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-[#3a3b3c] px-4 py-2 flex items-center justify-between text-xs text-gray-500">
                      <span><i className="fas fa-shield-check mr-1 text-green-400"></i>Verified by IIUC-ARMS</span>
                      <div className="flex gap-3">
                        <a href={`/clubs/verify/${cert.certificateId}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition font-semibold">View</a>
                        <button onClick={() => downloadCertPDF(toCertPDFData(cert))} className="hover:text-yellow-400 transition font-semibold">PDF</button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Events as Posts */}
                {(club.events || []).length === 0 && certResults.length === 0 ? (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-8 text-center">
                    <i className="fas fa-newspaper text-gray-600 text-4xl mb-3 block"></i>
                    <p className="text-gray-400 text-sm font-semibold">No posts yet</p>
                    <p className="text-gray-500 text-xs mt-1">Certificates and events will appear here.</p>
                  </div>
                ) : (
                  club.events?.slice(0, 3).map((ev: any) => (
                    <div key={ev.id} className="bg-[#242526] rounded-xl border border-[#3a3b3c] overflow-hidden">
                      <div className="p-4 pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                            {club.logoUrl ? <img src={club.logoUrl} alt="" className="w-full h-full rounded-full object-cover" /> : <i className="fas fa-users"></i>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white">{club.name}</p>
                            <p className="text-xs text-gray-500">Posted an event &middot; {timeAgo(ev.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="text-lg font-bold text-white mb-2">{ev.title}</h3>
                        {ev.description && <p className="text-sm text-gray-300 leading-relaxed mb-3">{ev.description}</p>}
                        <div className="flex flex-wrap gap-3">
                          {ev.eventDate && (
                            <div className="flex items-center gap-2 bg-[#3a3b3c] rounded-lg px-3 py-2">
                              <div className="text-center w-10">
                                <p className="text-lg font-bold text-white leading-none">{new Date(ev.eventDate).getDate()}</p>
                                <p className="text-[0.6rem] text-gray-400 uppercase">{new Date(ev.eventDate).toLocaleString('en', { month: 'short' })}</p>
                              </div>
                              <div className="border-l border-gray-600 pl-2">
                                <p className="text-xs text-gray-300 font-semibold">{new Date(ev.eventDate).toLocaleString('en', { weekday: 'short' })}</p>
                                <p className="text-xs text-gray-400">{new Date(ev.eventDate).toLocaleString('en', { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          )}
                          {ev.venue && (
                            <div className="flex items-center gap-2 bg-[#3a3b3c] rounded-lg px-3 py-2">
                              <i className="fas fa-location-dot text-blue-400"></i>
                              <span className="text-sm text-gray-300">{ev.venue}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-[#3a3b3c] px-4 py-2 flex items-center justify-between text-xs text-gray-500">
                        <span><i className="fas fa-calendar-check mr-1 text-green-400"></i>{eventCount} total events</span>
                        <button onClick={() => setSection('events')} className="hover:text-blue-400 transition font-semibold">View all events</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ═══ ABOUT ═══ */}
            {section === 'about' && (
              <div className="space-y-4">
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                  <h3 className="text-lg font-bold text-white mb-3">About {club.name}</h3>
                  {club.description ? (
                    <p className="text-sm text-gray-300 leading-relaxed">{club.description}</p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No description provided. Club admins can add one in Settings.</p>
                  )}
                </div>
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                  <h3 className="text-base font-bold text-white mb-4">Overview</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-[#18191a] rounded-lg">
                      <p className="text-2xl font-bold text-blue-400">{memberCount}</p>
                      <p className="text-xs text-gray-400 mt-1">Members</p>
                    </div>
                    <div className="text-center p-3 bg-[#18191a] rounded-lg">
                      <p className="text-2xl font-bold text-green-400">{eventCount}</p>
                      <p className="text-xs text-gray-400 mt-1">Events</p>
                    </div>
                    <div className="text-center p-3 bg-[#18191a] rounded-lg">
                      <p className="text-2xl font-bold text-yellow-400">{certCount}</p>
                      <p className="text-xs text-gray-400 mt-1">Certificates</p>
                    </div>
                  </div>
                </div>
                {leadership.length > 0 && (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                    <h3 className="text-base font-bold text-white mb-4">Key People</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {leadership.map((m: ClubDataMember) => {
                        const ri = CLUB_ROLES[m.role];
                        return (
                          <div key={m.userId} className="flex items-center gap-3 p-3 bg-[#18191a] rounded-lg hover:bg-[#3a3b3c] transition">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                              {ui(m)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{dn(m)}</p>
                              <span className={`inline-flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full border font-semibold ${ROLE_BADGE[m.role] || ROLE_BADGE.member}`}>
                                <i className={`fas ${ri?.icon || 'fa-user'}`}></i> {ri?.label || m.role}
                              </span>
                              {m.isClubAdmin && <span className="ml-1 text-[0.6rem] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">ADMIN</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ MEMBERS ═══ */}
            {section === 'members' && (
              <div>
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-4 flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white"><i className="fas fa-user-group text-blue-400 mr-2"></i>{memberCount} Members</h3>
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => setShowAddMember(true)} className="px-3 py-1.5 bg-blue-600/15 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold hover:bg-blue-600/25 transition">
                        <i className="fas fa-user-plus mr-1"></i>Add
                      </button>
                      <button onClick={handleExportMembers} className="px-3 py-1.5 bg-[#3a3b3c] text-gray-300 border border-[#4e4f50] rounded-lg text-xs font-semibold hover:bg-[#4e4f50] transition">
                        <i className="fas fa-download mr-1"></i>Export
                      </button>
                    </div>
                  )}
                </div>
                {(club.members || []).length === 0 ? (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-12 text-center">
                    <i className="fas fa-user-group text-gray-600 text-4xl mb-3 block"></i>
                    <p className="text-gray-400 text-sm">No members yet</p>
                  </div>
                ) : (
                  orderedGroups.map(groupName => {
                    const members = roleGroups[groupName];
                    return (
                      <div key={groupName} className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                          <h4 className="text-base font-bold text-white">{groupName}</h4>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#3a3b3c] text-gray-400 font-semibold">{members.length}</span>
                          <div className="flex-1 h-px bg-[#3a3b3c]"></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {members.map((m: ClubDataMember) => {
                            const ri = CLUB_ROLES[m.role];
                            return (
                              <div key={`${m.userId}-${m.role}`} className="bg-[#242526] border border-[#3a3b3c] rounded-xl p-3 flex items-center justify-between gap-3 hover:border-[#4e4f50] transition">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                    {ui(m)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-semibold text-white truncate">{dn(m)}</p>
                                      {m.isClubAdmin && <span className="text-[0.55rem] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">ADMIN</span>}
                                    </div>
                                    <span className={`inline-flex items-center gap-1 text-[0.65rem] px-2 py-0.5 rounded-full border font-semibold mt-0.5 ${ROLE_BADGE[m.role] || ROLE_BADGE.member}`}>
                                      <i className={`fas ${ri?.icon || 'fa-user'}`}></i> {ri?.label || m.role}
                                    </span>
                                    {m.previousRole && (
                                      <p className="text-[0.6rem] text-gray-500 mt-0.5">
                                        <i className="fas fa-clock-rotate-left mr-0.5"></i>Ex {CLUB_ROLES[m.previousRole]?.label || m.previousRole}{m.previousRoleSession ? ` (${m.previousRoleSession})` : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {canManage && m.userId !== profile.email && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => { setEditingMember(m.userId); setEditRole(m.role); setEditSession(''); }} title="Change role" className="text-blue-400 hover:text-blue-300 text-xs p-1.5 rounded-lg hover:bg-blue-500/10 transition"><i className="fas fa-pen"></i></button>
                                    <button onClick={() => handleRemoveMember(m.userId)} title="Remove" className="text-red-400 hover:text-red-300 text-xs p-1.5 rounded-lg hover:bg-red-500/10 transition"><i className="fas fa-user-minus"></i></button>
                                  </div>
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

            {/* ═══ EVENTS ═══ */}
            {section === 'events' && (
              <div>
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-4 flex items-center justify-between">
                  <h3 className="text-base font-bold text-white"><i className="fas fa-calendar-days text-green-400 mr-2"></i>Events ({eventCount})</h3>
                  {canManage && (
                    <button onClick={() => setShowAddEvent(true)} className="px-3 py-1.5 bg-green-600/15 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold hover:bg-green-600/25 transition">
                      <i className="fas fa-plus mr-1"></i>New Event
                    </button>
                  )}
                </div>
                {(club.events || []).length === 0 ? (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-12 text-center">
                    <i className="fas fa-calendar-xmark text-gray-600 text-4xl mb-3 block"></i>
                    <p className="text-gray-400 text-sm">No events yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {club.events.map((ev: any) => (
                      <div key={ev.id} className="bg-[#242526] border border-[#3a3b3c] rounded-xl overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-start gap-4">
                            {ev.eventDate && (
                              <div className="text-center shrink-0 w-14 bg-blue-600/15 rounded-xl p-2.5 border border-blue-500/20">
                                <p className="text-2xl font-bold text-blue-400 leading-none">{new Date(ev.eventDate).getDate()}</p>
                                <p className="text-[0.6rem] text-blue-300/70 uppercase mt-0.5">{new Date(ev.eventDate).toLocaleString('en', { month: 'short' })}</p>
                                <p className="text-[0.55rem] text-gray-500">{new Date(ev.eventDate).toLocaleString('en', { year: 'numeric' })}</p>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <h4 className="text-base font-bold text-white">{ev.title}</h4>
                              {ev.venue && <p className="text-sm text-gray-400 mt-1"><i className="fas fa-location-dot mr-1 text-blue-400"></i>{ev.venue}</p>}
                              {ev.description && <p className="text-sm text-gray-300 mt-2 leading-relaxed">{ev.description}</p>}
                              {ev.eventDate && (
                                <p className="text-xs text-gray-500 mt-2">
                                  <i className="fas fa-clock mr-1"></i>
                                  {new Date(ev.eventDate).toLocaleString('en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-[#3a3b3c] px-5 py-2 flex items-center gap-4 text-xs text-gray-500">
                          <span>Posted {timeAgo(ev.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══ CERTIFICATES ═══ */}
            {section === 'certificates' && (
              <div>
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-4 flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white"><i className="fas fa-award text-yellow-400 mr-2"></i>Certificates ({certCount})</h3>
                  <div className="flex gap-2">
                    {canManage && (
                      <Link href={`/clubs/${slug}/certificates/issue`} className="no-underline">
                        <button className="px-3 py-1.5 bg-yellow-600/15 text-yellow-400 border border-yellow-500/30 rounded-lg text-xs font-semibold hover:bg-yellow-600/25 transition">
                          <i className="fas fa-plus mr-1"></i>Issue
                        </button>
                      </Link>
                    )}
                    <button onClick={handleBulkDownload} disabled={certResults.length === 0}
                      className="px-3 py-1.5 bg-[#3a3b3c] text-gray-300 border border-[#4e4f50] rounded-lg text-xs font-semibold hover:bg-[#4e4f50] transition disabled:opacity-40 disabled:pointer-events-none">
                      <i className="fas fa-file-pdf mr-1 text-red-400"></i>Download All ({certResults.length})
                    </button>
                  </div>
                </div>
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm"></i>
                      <input type="text" value={certSearch} onChange={e => setCertSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleCertSearch()}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition"
                        placeholder="Search by name or ID..." />
                    </div>
                    <button onClick={() => handleCertSearch()} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition">
                      <i className="fas fa-search"></i>
                    </button>
                  </div>
                </div>
                {certResults.length === 0 ? (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-12 text-center">
                    <i className="fas fa-award text-gray-600 text-4xl mb-3 block"></i>
                    <p className="text-gray-400 text-sm">{certSearch ? 'No certificates match your search' : 'No certificates issued yet'}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {certResults.map((cert: any) => (
                      <div key={cert.id || cert.certificateId} className="bg-[#242526] border border-[#3a3b3c] rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center">
                                <i className="fas fa-award text-yellow-400 text-sm"></i>
                              </div>
                              <div>
                                <p className="text-xs font-mono font-bold text-white">{cert.certificateId}</p>
                                <p className="text-xs text-gray-500">{cert.memberName}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.7rem] ml-10">
                              <span className="text-gray-500">UID: <span className="text-gray-300">{cert.universityId}</span></span>
                              {cert.post && <span className="text-gray-500">Post: <span className="text-blue-400">{cert.post}</span></span>}
                              {cert.servicePeriod && <span className="text-gray-500">Period: <span className="text-gray-300">{cert.servicePeriod}</span></span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <a href={`/clubs/verify/${cert.certificateId}`} target="_blank" rel="noopener noreferrer"
                              className="w-8 h-8 flex items-center justify-center bg-blue-600/15 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/25 transition no-underline">
                              <i className="fas fa-external-link-alt text-xs"></i>
                            </a>
                            <button onClick={() => downloadCertPDF(toCertPDFData(cert))}
                              className="w-8 h-8 flex items-center justify-center bg-red-600/15 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-600/25 transition">
                              <i className="fas fa-file-pdf text-xs"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══ CLAIMS ═══ */}
            {section === 'claims' && canManage && (
              <div>
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-4 mb-4">
                  <h3 className="text-base font-bold text-white"><i className="fas fa-inbox text-purple-400 mr-2"></i>Membership Claims</h3>
                </div>
                <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
                  {(['pending', 'approved', 'rejected', 'all'] as ClaimFilter[]).map(f => (
                    <button key={f} onClick={() => setClaimFilter(f)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
                        claimFilter === f ? 'bg-blue-600 text-white' : 'bg-[#242526] text-gray-400 border border-[#3a3b3c] hover:border-blue-500/50'
                      }`}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                {claimsLoading ? (
                  <div className="flex items-center justify-center py-12"><i className="fas fa-spinner fa-spin text-blue-500 text-2xl"></i></div>
                ) : claims.length === 0 ? (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-12 text-center">
                    <i className="fas fa-inbox text-gray-600 text-4xl mb-3 block"></i>
                    <p className="text-gray-400 text-sm">No {claimFilter === 'all' ? '' : claimFilter} claims</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {claims.map((cl: any) => (
                      <div key={cl.id} className="bg-[#242526] border border-[#3a3b3c] rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                              {cl.userId?.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{cl.userId}</p>
                              <span className={`inline-flex text-[0.65rem] px-2 py-0.5 rounded-full font-semibold mt-1 ${CLAIM_STATUS_BADGE[cl.status] || ''}`}>{cl.status}</span>
                              <p className="text-sm text-gray-300 mt-1">Wants: <span className="text-blue-400 font-semibold">{CLUB_ROLES[cl.requestedRole]?.label || cl.requestedRole}</span></p>
                              {cl.message && <p className="text-sm text-gray-400 mt-1 italic">&ldquo;{cl.message}&rdquo;</p>}
                            </div>
                          </div>
                          {cl.status === 'pending' && (
                            <div className="flex gap-2 shrink-0">
                              <button onClick={() => handleClaimReview(cl.id, 'approved')} className="px-3 py-1.5 bg-green-600/15 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold hover:bg-green-600/25 transition"><i className="fas fa-check mr-1"></i>Approve</button>
                              <button onClick={() => handleClaimReview(cl.id, 'rejected')} className="px-3 py-1.5 bg-red-600/15 text-red-400 border border-red-500/30 rounded-lg text-xs font-semibold hover:bg-red-600/25 transition"><i className="fas fa-times mr-1"></i>Reject</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ═══ SETTINGS ═══ */}
            {section === 'settings' && (isGS || isClubAdmin || isAdmin) && (
              <div className="space-y-4">
                {/* Logo & Cover */}
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                  <h3 className="text-base font-bold text-white mb-4"><i className="fas fa-images text-blue-400 mr-2"></i>Appearance</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-400 font-semibold mb-2">Club Logo</p>
                      <div className="flex items-center gap-3">
                        {club.logoUrl ? <img src={club.logoUrl} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-[#3a3b3c]" /> : <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center"><i className="fas fa-users text-blue-400"></i></div>}
                        <label className="px-3 py-1.5 bg-[#3a3b3c] hover:bg-[#4e4f50] text-white rounded-lg text-xs font-semibold cursor-pointer transition border border-[#4e4f50]">
                          {logoUploading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Uploading...</> : <><i className="fas fa-upload mr-1"></i>Upload Logo</>}
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={logoUploading} />
                        </label>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-semibold mb-2">Cover Photo</p>
                      <div className="flex items-center gap-3">
                        {club.coverUrl ? <img src={club.coverUrl} alt="" className="w-16 h-10 rounded-lg object-cover border border-[#3a3b3c]" /> : <div className="w-16 h-10 rounded-lg bg-[#3a3b3c] flex items-center justify-center"><i className="fas fa-image text-gray-500 text-xs"></i></div>}
                        <label className="px-3 py-1.5 bg-[#3a3b3c] hover:bg-[#4e4f50] text-white rounded-lg text-xs font-semibold cursor-pointer transition border border-[#4e4f50]">
                          {coverUploading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Uploading...</> : <><i className="fas fa-upload mr-1"></i>Upload Cover</>}
                          <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" disabled={coverUploading} />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Basic Info */}
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                  <h3 className="text-base font-bold text-white mb-4"><i className="fas fa-circle-info text-blue-400 mr-2"></i>Club Info</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]"><span className="text-gray-400 font-semibold">Name</span><span className="text-white">{club.name}</span></div>
                    <div className="flex justify-between items-center py-2 border-b border-[#3a3b3c]"><span className="text-gray-400 font-semibold">Department</span><span className="text-white">{club.department}</span></div>
                    <div className="flex justify-between items-start py-2 border-b border-[#3a3b3c]"><span className="text-gray-400 font-semibold">Description</span><span className="text-white text-right max-w-[60%]">{club.description || '—'}</span></div>
                    <div className="flex justify-between items-center py-2"><span className="text-gray-400 font-semibold">Created By</span><span className="text-white">{club.createdBy}</span></div>
                  </div>
                </div>

                {/* Access Control */}
                {(isGS || isClubAdmin) && (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                    <h3 className="text-base font-bold text-white mb-1"><i className="fas fa-shield-halved text-blue-400 mr-2"></i>Access Control</h3>
                    <p className="text-xs text-gray-500 mb-4">Control what managers (non-club members) can do in your club.</p>
                    <div className="space-y-4">
                      {[
                        { key: 'managerCanManageMembers', label: 'Allow managers to manage members', default: true },
                        { key: 'managerCanIssueCerts', label: 'Allow managers to issue certificates', default: true },
                        { key: 'managerCanManageEvents', label: 'Allow managers to manage events', default: true },
                      ].map(item => (
                        <label key={item.key} className="flex items-center justify-between cursor-pointer py-2">
                          <span className="text-sm text-gray-300">{item.label}</span>
                          <div className="relative">
                            <input type="checkbox" checked={clubSettings[item.key] !== undefined ? clubSettings[item.key] : item.default}
                              onChange={async (e) => {
                                const newSettings = { ...clubSettings, [item.key]: e.target.checked };
                                try {
                                  await fetch(`/api/clubs/${slug}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: JSON.stringify(newSettings) }) });
                                  setClub((p: any) => ({ ...p, settings: JSON.stringify(newSettings) }));
                                } catch {}
                              }}
                              className="sr-only peer" />
                            <div className="w-10 h-6 bg-[#3a3b3c] rounded-full peer peer-checked:bg-blue-600 transition"></div>
                            <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition peer-checked:translate-x-4"></div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Club Admins */}
                {(isGS || isClubAdmin) && (
                  <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                    <h3 className="text-base font-bold text-white mb-1"><i className="fas fa-user-shield text-blue-400 mr-2"></i>Club Admins</h3>
                    <p className="text-xs text-gray-500 mb-3">Club admins have full control over the club.</p>
                    <div className="space-y-2">
                      {club.members?.filter((m: ClubDataMember) => m.isClubAdmin).map((m: ClubDataMember) => (
                        <div key={m.userId} className="flex items-center gap-3 bg-[#18191a] border border-[#3a3b3c] rounded-lg p-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[0.65rem] font-bold text-white">{ui(m)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{dn(m)}</p>
                            <p className="text-xs text-gray-500">{m.userId}</p>
                          </div>
                          <span className="text-[0.6rem] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">ADMIN</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GitHub Sync */}
                <div className="bg-[#242526] rounded-xl border border-[#3a3b3c] p-5">
                  <h3 className="text-base font-bold text-white mb-1"><i className="fab fa-github text-gray-300 mr-2"></i>GitHub Backup</h3>
                  <p className="text-xs text-gray-500 mb-3">Sync club data to GitHub as JSON.</p>
                  {isAdmin ? (
                    <button onClick={handleSyncGitHub} className="px-4 py-2 bg-[#3a3b3c] hover:bg-[#4e4f50] text-white border border-[#4e4f50] rounded-lg text-sm font-semibold transition">
                      <i className="fas fa-rotate mr-1.5"></i>Sync to GitHub
                    </button>
                  ) : (
                    <p className="text-xs text-gray-500"><i className="fas fa-lock mr-1"></i>Admin only.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ MODALS ══════════ */}

      {showAddMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddMember(false)}>
          <div className="bg-[#242526] border border-[#3a3b3c] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4"><i className="fas fa-user-plus text-blue-400 mr-2"></i>Add Member</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Email *</label>
                <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition"
                  placeholder="student@ugrad.iiuc.ac.bd" />
              </div>
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition">
                  {SORTED_ROLES.map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddMember(false)} className="flex-1 px-3 py-2.5 rounded-lg border border-[#3a3b3c] text-gray-400 text-sm font-semibold hover:bg-[#3a3b3c] transition">Cancel</button>
              <button onClick={handleAddMember} disabled={!addEmail.trim() || adding} className="flex-1 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition">
                {adding ? <i className="fas fa-spinner fa-spin"></i> : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setEditingMember(null)}>
          <div className="bg-[#242526] border border-[#3a3b3c] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2"><i className="fas fa-user-pen text-blue-400 mr-2"></i>Change Role</h3>
            <p className="text-xs text-gray-500 mb-4">If this role is held by someone else, they&apos;ll be auto-demoted to Member.</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">New Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition">
                  {SORTED_ROLES.map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Session (for Ex-badge)</label>
                <input type="text" value={editSession} onChange={e => setEditSession(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition"
                  placeholder="e.g. Autumn 2023 (optional)" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditingMember(null)} className="flex-1 px-3 py-2.5 rounded-lg border border-[#3a3b3c] text-gray-400 text-sm font-semibold hover:bg-[#3a3b3c] transition">Cancel</button>
              <button onClick={handleChangeRole} className="flex-1 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition">Update Role</button>
            </div>
          </div>
        </div>
      )}

      {showAddEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAddEvent(false)}>
          <div className="bg-[#242526] border border-[#3a3b3c] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4"><i className="fas fa-calendar-plus text-green-400 mr-2"></i>Create Event</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Title *</label>
                <input type="text" value={evTitle} onChange={e => setEvTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition" placeholder="Event title" />
              </div>
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Description</label>
                <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition resize-none" placeholder="Event details..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-gray-400 font-semibold mb-1 block">Date & Time</label>
                  <input type="datetime-local" value={evDate} onChange={e => setEvDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 font-semibold mb-1 block">Venue</label>
                  <input type="text" value={evVenue} onChange={e => setEvVenue(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition" placeholder="Room / Hall" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddEvent(false)} className="flex-1 px-3 py-2.5 rounded-lg border border-[#3a3b3c] text-gray-400 text-sm font-semibold hover:bg-[#3a3b3c] transition">Cancel</button>
              <button onClick={handleAddEvent} disabled={!evTitle.trim() || addingEvent} className="flex-1 px-3 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold disabled:opacity-50 transition">
                {addingEvent ? <i className="fas fa-spinner fa-spin"></i> : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showClaimModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowClaimModal(false)}>
          <div className="bg-[#242526] border border-[#3a3b3c] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-1"><i className="fas fa-hand-sparkles text-blue-400 mr-2"></i>Follow {club.name}</h3>
            <p className="text-sm text-gray-400 mb-4">Request membership &mdash; an officer will review.</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Requested Role</label>
                <select value={claimRole} onChange={e => setClaimRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition">
                  {SORTED_ROLES.map(([key, r]) => <option key={key} value={key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 font-semibold mb-1 block">Message (optional)</label>
                <textarea value={claimMsg} onChange={e => setClaimMsg(e.target.value)} rows={3}
                  className="w-full px-3 py-2.5 rounded-lg border border-[#3a3b3c] bg-[#18191a] text-white text-sm outline-none focus:border-blue-500 transition resize-none"
                  placeholder="Why do you want to join?" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowClaimModal(false)} className="flex-1 px-3 py-2.5 rounded-lg border border-[#3a3b3c] text-gray-400 text-sm font-semibold hover:bg-[#3a3b3c] transition">Cancel</button>
              <button onClick={handleSubmitClaim} disabled={submittingClaim} className="flex-1 px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition">
                {submittingClaim ? <i className="fas fa-spinner fa-spin"></i> : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
