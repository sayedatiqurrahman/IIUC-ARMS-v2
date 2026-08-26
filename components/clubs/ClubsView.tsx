'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useUserAccess } from '@/lib/useUserAccess';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';
import Modal from '@/components/ui/Modal';

const deptOptions = FACULTIES.flatMap(f =>
  f.departments.map(d => ({
    value: d.name,
    label: `${d.shortName} — ${d.name}`,
    icon: d.icon || 'fa-building',
    group: f.shortName,
  }))
);

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

  const filteredDeptOptions = isTeacherOnly
    ? deptOptions.filter(o => o.value.toLowerCase() === (profile.department || '').toLowerCase())
    : deptOptions;

  useEffect(() => { fetchClubs(); }, [filterDept]);

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
    <section className="mb-5">
        <div className="flex items-center justify-between mb-6">
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

        <div className="mb-6">
          <CustomSelect
            value={filterDept}
            onChange={setFilterDept}
            options={filteredDeptOptions}
            placeholder="All Departments"
            searchable
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
          </div>
        ) : clubs.length === 0 ? (
          <div className="text-center py-20 bg-dark-bg2 rounded-2xl border border-dark-border">
            <i className="fas fa-users text-dark-text2 text-4xl mb-4 block"></i>
            <p className="text-dark-text2">No clubs found</p>
            {filterDept && (
              <button onClick={() => setFilterDept('')} className="text-qsis text-xs mt-2 hover:underline">
                <i className="fas fa-times mr-1"></i>Clear filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clubs.map(club => (
              <Link key={club.id} href={`/clubs/${club.slug}`} className="no-underline">
                <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 hover:border-qsis/50 transition-all cursor-pointer group h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    {club.logoUrl ? (
                      <img src={club.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-dark-border shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-qsis/20 flex items-center justify-center shrink-0">
                        <i className="fas fa-users text-qsis"></i>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[0.9rem] font-bold text-dark-text truncate group-hover:text-qsis transition-colors">{club.name}</h3>
                      <p className="text-[0.72rem] text-dark-text2 truncate">{club.department}</p>
                    </div>
                  </div>
                  {club.description && (
                    <p className="text-[0.78rem] text-dark-text2 line-clamp-2 mb-3 flex-1">{club.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[0.72rem] text-dark-text2 mt-auto pt-3 border-t border-dark-border">
                    <span className="flex items-center gap-1">
                      <i className="fas fa-user-friends"></i> {club._count?.members || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="fas fa-calendar"></i> {club._count?.events || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <i className="fas fa-award"></i> {club._count?.certificates || 0}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-dark-text2">
                      {club.creatorImage ? (
                        <img src={club.creatorImage} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                        <div className="w-4 h-4 rounded-full bg-qsis/30 flex items-center justify-center text-[0.4rem] font-bold text-qsis">
                          {(club.creatorName || '?')[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="truncate max-w-[80px]">{club.creatorName}</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {showCreate && (
          <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Club" maxWidth="max-w-md">
            <div className="space-y-3 px-4 pb-4">
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
                <CustomSelect
                  value={newDept}
                  onChange={setNewDept}
                  options={filteredDeptOptions}
                  placeholder="Select department..."
                  searchable
                />
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
              <div className="flex gap-2 mt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 px-3 py-2 rounded-lg border border-dark-border text-dark-text2 text-sm font-semibold hover:bg-dark-border/30 transition">Cancel</button>
                <button onClick={handleCreate} disabled={!newName.trim() || !newDept || creating} className="flex-1 px-3 py-2 rounded-lg bg-qsis text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
                  {creating ? <i className="fas fa-spinner fa-spin"></i> : 'Create'}
                </button>
              </div>
            </div>
          </Modal>
        )}
    </section>
  );
}
