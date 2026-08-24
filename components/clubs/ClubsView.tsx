'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useUserAccess } from '@/lib/useUserAccess';

const ROLE_LABELS: Record<string, string> = {
  gs: 'General Secretary',
  ags: 'Assistant GS',
  ogs: 'Office GS',
  office_secretary: 'Office Secretary',
  member: 'Member',
};

const ROLE_COLORS: Record<string, string> = {
  gs: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ags: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  ogs: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  office_secretary: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  member: 'bg-dark-border/50 text-dark-text2 border-dark-border',
};

export default function ClubsView() {
  const profile = useAppStore(s => s.profile);
  const access = useUserAccess(profile.email || '', profile.role, profile.isCR, profile.customPermissions);
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = access.has('createClub') || profile.role === 'admin' || profile.role === 'manager';
  const isTeacherOnly = profile.role === 'teacher' && !access.has('manageAllClubs');

  const allDepartments = [
    "Qur'anic Sciences and Islamic Studies", "Da'wah and Islamic Studies", "Science of Hadith and Islamic Studies",
    'Computer Science and Engineering', 'Computer and Communication Engineering',
    'Electrical and Electronic Engineering', 'Electronic and Telecommunication Engineering',
    'Civil Engineering', 'Pharmacy', 'Business Administration',
    'Department of Finance', 'Department of Management',
  ];
  const departments = isTeacherOnly ? allDepartments.filter(d => d.toLowerCase() === (profile.department || '').toLowerCase()) : allDepartments;

  useEffect(() => {
    fetchClubs();
  }, []);

  async function fetchClubs() {
    setLoading(true);
    try {
      const url = filterDept ? `/api/clubs?department=${encodeURIComponent(filterDept)}` : '/api/clubs';
      const res = await fetch(url);
      const data = await res.json();
      setClubs(data.clubs || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchClubs(); }, [filterDept]);

  useEffect(() => {
    if (isTeacherOnly && profile.department) {
      setNewDept(profile.department);
    }
  }, [isTeacherOnly, profile.department]);

  async function handleCreate() {
    if (!newName.trim() || !newDept) return;
    setCreating(true);
    try {
      const res = await fetch('/api/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), department: newDept, description: newDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setNewName(''); setNewDept(''); setNewDesc('');
        fetchClubs();
      } else {
        alert(data.error || 'Failed to create');
      }
    } catch { alert('Network error'); }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-dark-bg py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-users text-qsis"></i> IIUC Department Clubs
            </h1>
            <p className="text-dark-text2 text-sm mt-1">Explore department clubs, events, and activities</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-qsis text-white rounded-lg text-sm font-semibold hover:opacity-90 transition"
            >
              <i className="fas fa-plus mr-1"></i> Create Club
            </button>
          )}
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilterDept('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${!filterDept ? 'bg-qsis text-white' : 'bg-dark-bg2 text-dark-text2 border border-dark-border hover:border-qsis'}`}
          >
            All Departments
          </button>
          {departments.map(d => (
            <button
              key={d}
              onClick={() => setFilterDept(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${filterDept === d ? 'bg-qsis text-white' : 'bg-dark-bg2 text-dark-text2 border border-dark-border hover:border-qsis'}`}
            >
              {d.length > 25 ? d.substring(0, 25) + '…' : d}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
          </div>
        ) : clubs.length === 0 ? (
          <div className="text-center py-20 bg-dark-bg2 rounded-2xl border border-dark-border">
            <i className="fas fa-users text-dark-text2 text-4xl mb-4 block"></i>
            <p className="text-dark-text2">No clubs found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubs.map(club => (
              <Link key={club.id} href={`/clubs/${club.slug}`} className="no-underline">
                <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 hover:border-qsis/50 transition-all cursor-pointer group h-full">
                  <div className="flex items-center gap-3 mb-3">
                    {club.logoUrl ? (
                      <img src={club.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-dark-border" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-qsis/20 flex items-center justify-center">
                        <i className="fas fa-users text-qsis"></i>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[0.9rem] font-bold text-dark-text truncate group-hover:text-qsis transition-colors">{club.name}</h3>
                      <p className="text-[0.72rem] text-dark-text2 truncate">{club.department}</p>
                    </div>
                  </div>
                  {club.description && (
                    <p className="text-[0.78rem] text-dark-text2 line-clamp-2 mb-3">{club.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[0.72rem] text-dark-text2">
                    <span className="flex items-center gap-1">
                      <i className="fas fa-user-friends"></i> {club._count?.members || 0} members
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="fas fa-calendar"></i> {club._count?.events || 0} events
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-dark-text mb-4 flex items-center gap-2">
                <i className="fas fa-plus-circle text-qsis"></i> Create New Club
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-dark-text2 font-semibold mb-1 block">Club Name *</label>
                  <input
                    type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis"
                    placeholder="e.g. CSE Programming Club"
                  />
                </div>
                <div>
                  <label className="text-xs text-dark-text2 font-semibold mb-1 block">Department *</label>
                  <select
                    value={newDept} onChange={e => setNewDept(e.target.value)}
                    disabled={isTeacherOnly}
                    className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis disabled:opacity-60"
                  >
                    <option value="">Select department</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {isTeacherOnly && (
                    <p className="text-[0.65rem] text-dark-text3 mt-1">Teachers can only create clubs in their own department</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-dark-text2 font-semibold mb-1 block">Description</label>
                  <textarea
                    value={newDesc} onChange={e => setNewDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-sm outline-none focus:border-qsis resize-none"
                    rows={3} placeholder="About this club..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-dark-border/30 transition">Cancel</button>
                <button onClick={handleCreate} disabled={!newName.trim() || !newDept || creating} className="flex-1 px-3 py-2 rounded-lg bg-qsis text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
                  {creating ? <i className="fas fa-spinner fa-spin"></i> : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
