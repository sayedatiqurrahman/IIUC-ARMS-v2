'use client';

import { useEffect, useState } from 'react';
import { getRoleLabel } from '@/lib/club-roles';

interface AlumniMember {
  userId: string;
  role: string;
  sessionLabel: string | null;
  previousRole: string | null;
  previousRoleSession: string | null;
  isClubAdmin: boolean;
  createdAt: string;
  name: string;
  image: string | null;
  department: string | null;
  title: string | null;
  isStub: boolean;
}

interface SessionGroup {
  session: string;
  members: AlumniMember[];
}

const ROLE_COLORS: Record<string, string> = {
  advisor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  president: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  vice_president: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  gs: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ags: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  ogs: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  office_secretary: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  treasurer: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  finance: 'bg-green-500/15 text-green-400 border-green-500/30',
  it_media: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  cultural: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  publication: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  member: 'bg-dark-border/50 text-dark-text2 border-dark-border',
};

function getRoleColor(role: string) {
  return ROLE_COLORS[role] || ROLE_COLORS.member;
}

function MemberCard({ member }: { member: AlumniMember }) {
  const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-dark-bg border border-dark-border rounded-xl p-3 flex items-center gap-3 hover:border-qsis/30 transition-colors">
      {member.image ? (
        <img src={member.image} alt="" className="w-10 h-10 rounded-full object-cover border border-dark-border flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-qsis/20 flex items-center justify-center text-xs font-bold text-qsis flex-shrink-0">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-dark-text truncate">{member.name}</span>
          {member.isClubAdmin && (
            <i className="fas fa-shield-alt text-qsis text-[0.55rem]" title="Club Admin"></i>
          )}
        </div>
        {member.department && (
          <p className="text-[0.65rem] text-dark-text3 truncate">{member.department}</p>
        )}
      </div>
      <span className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${getRoleColor(member.role)}`}>
        {getRoleLabel(member.role)}
      </span>
    </div>
  );
}

export default function AlumniTimeline({ slug }: { slug: string }) {
  const [sessions, setSessions] = useState<SessionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clubs/${slug}/alumni`)
      .then(r => r.json())
      .then(data => {
        if (data.sessions) {
          setSessions(data.sessions);
          if (data.sessions.length > 0) setExpandedSession(data.sessions[0].session);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-5 w-32 bg-dark-border/50 rounded mb-3" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="h-14 bg-dark-border/30 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (sessions.length === 0) return (
    <div className="text-center py-12">
      <i className="fas fa-history text-dark-text3 text-3xl mb-3 block"></i>
      <p className="text-dark-text2 text-sm">No session history yet</p>
      <p className="text-dark-text3 text-xs mt-1">Member sessions will appear here as they are assigned</p>
    </div>
  );

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-qsis/15 flex items-center justify-center">
          <i className="fas fa-stream text-qsis text-sm"></i>
        </div>
        <div>
          <h3 className="text-sm font-bold text-dark-text">Session Timeline</h3>
          <p className="text-[0.65rem] text-dark-text3">{sessions.length} session{sessions.length !== 1 ? 's' : ''} &middot; {sessions.reduce((a, s) => a + s.members.length, 0)} total records</p>
        </div>
      </div>

      <div className="relative pl-6">
        <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-dark-border" />

        {sessions.map((group, idx) => {
          const isExpanded = expandedSession === group.session;
          const officers = group.members.filter(m => m.role !== 'member');
          const regularCount = group.members.filter(m => m.role === 'member').length;

          return (
            <div key={group.session} className="relative mb-6 last:mb-0">
              <div className={`absolute -left-6 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 ${
                isExpanded ? 'bg-qsis border-qsis' : 'bg-dark-bg2 border-dark-border'
              }`}>
                <div className={`w-2 h-2 rounded-full ${isExpanded ? 'bg-white' : 'bg-dark-text3'}`} />
              </div>

              <button onClick={() => setExpandedSession(isExpanded ? null : group.session)}
                className="w-full text-left ml-2">
                <div className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  isExpanded ? 'bg-qsis/10 border border-qsis/30' : 'bg-dark-bg2 border border-dark-border hover:border-dark-border'
                }`}>
                  <div>
                    <span className="text-sm font-bold text-dark-text">{group.session}</span>
                    <span className="text-[0.65rem] text-dark-text3 ml-2">
                      {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                      {officers.length > 0 && ` · ${officers.length} officer${officers.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-dark-text3 text-xs`}></i>
                </div>
              </button>

              {isExpanded && (
                <div className="ml-2 mt-2 space-y-2 animate-in slide-in-from-top-1">
                  {officers.length > 0 && (
                    <div>
                      <p className="text-[0.6rem] text-dark-text3 uppercase tracking-wider mb-1.5 px-1">Officers</p>
                      <div className="space-y-1.5">
                        {officers.map(m => <MemberCard key={m.userId} member={m} />)}
                      </div>
                    </div>
                  )}
                  {regularCount > 0 && (
                    <div>
                      <p className="text-[0.6rem] text-dark-text3 uppercase tracking-wider mb-1.5 px-1">Members ({regularCount})</p>
                      <div className="space-y-1.5">
                        {group.members.filter(m => m.role === 'member').map(m => (
                          <MemberCard key={m.userId} member={m} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
