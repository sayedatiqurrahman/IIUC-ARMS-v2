'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';

interface Club {
  id: string;
  slug: string;
  name: string;
  department: string;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  isActive: boolean;
  createdBy: string;
  publishedCertificates?: number;
  memberCount?: number;
  eventCount?: number;
}

interface Props {
  email: string;
  effectiveRole: string;
  profile: any;
  customPermissions: Record<string, boolean>;
}

type ClubWithMeta = Club & { memberCount: number; eventCount: number };

export default function ClubsTab({ email, effectiveRole, profile, customPermissions }: Props) {
  const { data: session } = useSession();
  const router = useRouter();

  const [clubs, setClubs] = useState<ClubWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', description: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [editingClub, setEditingClub] = useState<ClubWithMeta | null>(null);
  const [editForm, setEditForm] = useState({ name: '', department: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  const fetchClubs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (deptFilter) params.set('department', deptFilter);
      params.set('all', 'true');
      const res = await fetch(`/api/clubs?${params}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.clubs)) {
        setClubs(data.clubs.map((c: any) => ({
          ...c,
          memberCount: c._count?.members ?? c.memberCount ?? 0,
          eventCount: c._count?.events ?? c.eventCount ?? 0,
          publishedCertificates: c._count?.certificates ?? c.publishedCertificates ?? 0,
        })));
      }
    } catch {}
    setLoading(false);
  }, [deptFilter]);

  useEffect(() => { fetchClubs(); }, [fetchClubs]);

  const filteredClubs = clubs.filter(c => {
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.slug.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter === 'active' && !c.isActive) return false;
    if (statusFilter === 'inactive' && c.isActive) return false;
    return true;
  });

  const handleCreate = async () => {
    if (!form.name.trim() || !form.department) return;
    setCreating(true);
    try {
      const res = await fetch('/api/clubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowCreate(false);
        setForm({ name: '', department: '', description: '' });
        fetchClubs();
      }
    } catch {}
    setCreating(false);
  };

  const handleToggleActive = async (club: ClubWithMeta) => {
    setActionLoading(club.slug);
    try {
      await fetch(`/api/clubs/${club.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !club.isActive }),
      });
      fetchClubs();
    } catch {}
    setActionLoading('');
  };

  const handleDelete = async (club: ClubWithMeta) => {
    if (!confirm(`Delete "${club.name}"? This cannot be undone.`)) return;
    setActionLoading(club.slug);
    try {
      await fetch(`/api/clubs/${club.slug}`, { method: 'DELETE' });
      fetchClubs();
    } catch {}
    setActionLoading('');
  };

  const handleEdit = async () => {
    if (!editingClub || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clubs/${editingClub.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) { setEditingClub(null); fetchClubs(); }
    } catch {}
    setSaving(false);
  };

  const deptOptions = FACULTIES.flatMap(f => f.departments.map(d => ({ label: `${f.name} - ${d.name}`, value: d.name })));
  const deptSelectOptions = [{ label: 'All Departments', value: '' }, ...deptOptions];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Clubs</h2>
          <p className="text-sm text-gray-400">Manage all clubs in the system</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-qsis hover:bg-qsis-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <i className="fas fa-plus mr-2" />
          Create Club
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search clubs..."
            className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-qsis/50"
          />
        </div>
        <div className="w-64">
          <CustomSelect
            options={deptSelectOptions}
            value={deptFilter}
            onChange={setDeptFilter}
            placeholder="Department"
          />
        </div>
        <div className="flex gap-1 bg-gray-900/50 border border-gray-700/50 rounded-lg p-1">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === s ? 'bg-qsis text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : s === 'active' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <i className="fas fa-spinner fa-spin text-qsis text-2xl" />
          <p className="text-gray-400 mt-2 text-sm">Loading clubs...</p>
        </div>
      ) : filteredClubs.length === 0 ? (
        <div className="text-center py-12 bg-gray-900/30 rounded-xl border border-gray-700/30">
          <i className="fas fa-users text-gray-600 text-3xl" />
          <p className="text-gray-400 mt-3">No clubs found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClubs.map(club => (
            <div
              key={club.slug}
              className="bg-gray-900/50 border border-gray-700/30 rounded-xl overflow-hidden hover:border-qsis/30 transition-all cursor-pointer"
              onClick={() => router.push(`/clubs/${club.slug}`)}
            >
              {club.coverUrl && (
                <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${club.coverUrl})` }} />
              )}
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {club.logoUrl ? (
                    <img src={club.logoUrl} alt={club.name} className="w-10 h-10 rounded-full object-cover border border-gray-700/50" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-qsis/20 border border-qsis/30 flex items-center justify-center">
                      <i className="fas fa-users text-qsis text-sm" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{club.name}</h3>
                    <p className="text-xs text-gray-400 truncate">{club.department}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    club.isActive
                      ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                      : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}>
                    {club.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-gray-400">
                  <span><i className="fas fa-user-friends mr-1" />{club.memberCount}</span>
                  <span><i className="fas fa-calendar mr-1" />{club.eventCount}</span>
                  <span><i className="fas fa-certificate mr-1" />{club.publishedCertificates || 0}</span>
                </div>
                <div className="flex gap-2 mt-3" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleToggleActive(club)}
                    disabled={actionLoading === club.slug}
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      club.isActive
                        ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                        : 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                    }`}
                  >
                    {club.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => router.push(`/clubs/${club.slug}`)}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(club)}
                    className="px-3 py-1 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <i className="fas fa-trash" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingClub(club);
                      setEditForm({ name: club.name, department: club.department, description: club.description || '' });
                    }}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
                  >
                    <i className="fas fa-pen" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Create Club</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Club Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-qsis/50"
                  placeholder="e.g. Robotics Club"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Department *</label>
                <CustomSelect
                  options={deptOptions}
                  value={form.department}
                  onChange={v => setForm(f => ({ ...f, department: v }))}
                  placeholder="Select department"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-qsis/50 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.name.trim() || !form.department}
                className="bg-qsis hover:bg-qsis-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingClub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditingClub(null)}>
          <div className="bg-gray-900 border border-gray-700/50 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4">Edit Club</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Club Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-qsis/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Department *</label>
                <CustomSelect
                  options={deptOptions}
                  value={editForm.department}
                  onChange={v => setEditForm(f => ({ ...f, department: v }))}
                  placeholder="Select department"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-qsis/50 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingClub(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={saving || !editForm.name.trim() || !editForm.department}
                className="bg-qsis hover:bg-qsis-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
