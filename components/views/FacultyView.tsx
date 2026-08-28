'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { FACULTIES, TEACHER_TITLES, STAFF_DESIGNATIONS, findDepartment, resolveDepartment, getDepartmentDisplayName } from '@/lib/departments';
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import CustomSelect from '@/components/CustomSelect';
import { useConfirm } from '@/components/ConfirmModal';
import { useUserAccess } from '@/lib/useUserAccess';

interface FacultyMember {
  id: string;
  department: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  shortForm: string | null;
  memberType: string;
  isCR: boolean;
  sortOrder: number;
}

export default function FacultyView() {
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const profile = useAppStore(s => s.profile);
  // Use the best-available email/role for permission calc.
  // Fall back to 'user' role when neither session nor profile provides data,
  // so that `canEdit` becomes false and the API returns visible-only members
  // for non‑logged‑in visitors.
  const rawEmail = session?.user?.email || profile?.email || '';
  const rawRole = profile?.role || '';
  const effectiveRole = config.getEffectiveRole(rawEmail, rawRole);
  const { has } = useUserAccess(rawEmail, effectiveRole, profile?.isCR || false, profile?.customPermissions || {});
  const canEdit = effectiveRole === 'admin' || effectiveRole === 'manager' || effectiveRole === 'teacher' || has('manageFaculty');
  const myDept = profile?.department || '';

  const [members, setMembers] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [titleFilter, setTitleFilter] = useState('');
  const [memberTypeFilter, setMemberTypeFilter] = useState<'all' | 'faculty' | 'staff'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FacultyMember>>({});
  const [saving, setSaving] = useState(false);
  const isEditing = useRef(false);

  const fetchMembers = useCallback(() => {
    const params = new URLSearchParams();
    if (deptFilter) params.set('department', deptFilter);
    if (search) params.set('search', search);
    if (titleFilter) params.set('title', titleFilter);
    if (memberTypeFilter !== 'all') params.set('memberType', memberTypeFilter);
    if (!isEditing.current) setLoading(true);
    fetch(`/api/faculty?${params}`)
      .then(r => r.json())
      .then(data => { setMembers(data.members || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [deptFilter, search, titleFilter, memberTypeFilter]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const grouped = useMemo(() => {
    const map = new Map<string, FacultyMember[]>();
    for (const m of members) {
      const key = getDepartmentDisplayName(m.department);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [members]);

  const titleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      if (m.title) counts.set(m.title, (counts.get(m.title) || 0) + 1);
    }
    return counts;
  }, [members]);

  const facultyCount = members.filter(m => m.memberType === 'faculty').length;
  const staffCount = members.filter(m => m.memberType === 'staff').length;

  // Mirrors server-side canManageFaculty (app/api/faculty + lib/can-manage-faculty.ts):
  // admins & teachers manage any department; managers and custom "Manage Faculty"
  // permission holders stay scoped to their own department when they have one.
  const canEditMember = (m: FacultyMember) => {
    if (!canEdit) return false;
    if (effectiveRole === 'admin' || effectiveRole === 'teacher') return true;
    if (myDept) return resolveDepartment(m.department) === resolveDepartment(myDept);
    return true;
  };

  const startEdit = (m: FacultyMember) => {
    isEditing.current = true;
    setEditingId(m.id);
    setEditForm({ name: m.name, title: m.title, shortForm: m.shortForm, email: m.email, phone: m.phone });
  };

  const cancelEdit = () => { isEditing.current = false; setEditingId(null); setEditForm({}); };

  const saveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/faculty', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Updated successfully', 'success');
        isEditing.current = false;
        cancelEdit();
        fetchMembers();
      } else {
        showToast(data.error || 'Update failed', 'error');
      }
    } catch {
      showToast('Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const editInputClass = 'px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.78rem] outline-none w-full';

  const renderMemberCard = (m: FacultyMember) => {
    const isEditing = editingId === m.id;
    const isStaff = m.memberType === 'staff';
    return (
      <div key={m.id} className={`bg-dark-bg2 border rounded-xl p-4 transition-all group ${isEditing ? 'border-qsis' : 'border-dark-border hover:border-qsis/50'}`}>
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full border border-dark-border flex items-center justify-center flex-shrink-0 ${isStaff ? 'bg-gradient-to-br from-blue-500/20 to-blue-400/10' : 'bg-gradient-to-br from-qsis/20 to-accent/20'}`}>
            <span className={`text-[0.72rem] font-bold ${isStaff ? 'text-blue-400' : 'text-qsis'}`}>{m.shortForm || m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-1.5">
                <input type="text" value={(editForm.name as string) || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" className={editInputClass} />
                <input type="text" value={(editForm.title as string) || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="Designation" className={editInputClass} />
                <input type="text" value={(editForm.shortForm as string) || ''} onChange={e => setEditForm(f => ({ ...f, shortForm: e.target.value }))} placeholder="Short form (e.g. GH)" className={editInputClass} />
                <input type="text" value={(editForm.email as string) || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" className={editInputClass} />
                <input type="text" value={(editForm.phone as string) || ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" className={editInputClass} />
              </div>
            ) : (
              <>
                <h4 className="text-[0.85rem] font-bold text-dark-text truncate">{m.name}</h4>
                {m.title && <p className={`text-[0.72rem] font-medium ${isStaff ? 'text-blue-400' : 'text-qsis'}`}>{m.title}</p>}
                {m.email && (
                  <a href={`mailto:${m.email}`} className="text-[0.7rem] text-dark-text3 hover:text-qsis transition-colors flex items-center gap-1 mt-0.5 no-underline">
                    <i className="fas fa-envelope text-[0.6rem]"></i>
                    <span className="truncate">{m.email}</span>
                  </a>
                )}
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="text-[0.7rem] text-dark-text3 hover:text-qsis transition-colors flex items-center gap-1 mt-0.5 no-underline">
                    <i className="fas fa-phone text-[0.6rem]"></i>
                    <span>{m.phone}</span>
                  </a>
                )}
              </>
            )}
          </div>
          {canEditMember(m) && !isEditing && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
              <button onClick={() => startEdit(m)} className="px-1.5 py-1 rounded bg-dark-bg border border-dark-border text-dark-text2 hover:text-qsis text-[0.65rem] cursor-pointer transition-all" title="Edit">
                <i className="fas fa-pen"></i>
              </button>
              <button onClick={async () => {
                if (!await confirm({ message: `Remove ${m.name} from directory?`, danger: true, title: 'Remove Member' })) return;
                const res = await fetch(`/api/faculty?id=${m.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (data.success) { showToast(`${m.name} removed`, 'success'); fetchMembers(); }
                else showToast(data.error || 'Failed', 'error');
              }} className="px-1.5 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[0.65rem] cursor-pointer transition-all border-none" title="Delete">
                <i className="fas fa-trash"></i>
              </button>
            </div>
          )}
        </div>
        {isEditing && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-dark-border">
            <button onClick={() => saveEdit(m.id)} disabled={saving} className="flex-1 px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
              {saving ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-check mr-1"></i>} Save
            </button>
            <button onClick={cancelEdit} disabled={saving} className="px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.72rem] font-semibold cursor-pointer hover:text-dark-text disabled:opacity-50">
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="mb-5">
      <div className="mb-6">
        <h2 className="text-[1.3rem] font-bold text-dark-text mb-1">
          <i className="fas fa-chalkboard-teacher text-qsis mr-2"></i>Faculty & Staff Directory
        </h2>
        <p className="text-[0.82rem] text-dark-text2">
          Browse faculty members across all departments
          {canEdit && <span className="text-qsis ml-2">— You can edit members by clicking the edit icon</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <label className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fas fa-search mr-1"></i>Search</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, short form, or designation..."
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors"
            />
          </div>
          <div>
            <label className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fas fa-users mr-1"></i>Type</label>
            <CustomSelect
              value={memberTypeFilter}
              onChange={(val) => setMemberTypeFilter(val as 'all' | 'faculty' | 'staff')}
              placeholder="All"
              options={[
                { value: 'all', label: `All (${members.length})`, icon: 'fa-users' },
                { value: 'faculty', label: `Faculty (${facultyCount})`, icon: 'fa-chalkboard-teacher' },
                { value: 'staff', label: `Staff (${staffCount})`, icon: 'fa-headset' },
              ]}
              size="md"
            />
          </div>
          <div>
            <label className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fas fa-building mr-1"></i>Department</label>
            <CustomSelect
              value={deptFilter}
              onChange={setDeptFilter}
              placeholder="Select a department..."
              options={FACULTIES.flatMap(f => [
                ...f.departments.map(d => ({
                  value: d.id,
                  label: `${d.shortName} — ${d.name}`,
                  icon: d.icon || 'fa-building',
                  group: `${f.shortName} — ${f.name}`,
                })),
              ])}
              searchable
              size="md"
            />
          </div>
          <div>
            <label className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fas fa-user-tie mr-1"></i>Designation</label>
            <CustomSelect
              value={titleFilter}
              onChange={setTitleFilter}
              placeholder="All"
              options={[
                { value: '', label: `All (${titleCounts.size})`, icon: 'fa-user-tie' },
                ...TEACHER_TITLES.map(t => ({
                  value: t,
                  label: `${t} (${titleCounts.get(t) || 0})`,
                  icon: 'fa-chalkboard-teacher',
                  group: 'Faculty Titles',
                })),
                ...STAFF_DESIGNATIONS.map(s => ({
                  value: s,
                  label: `${s} (${titleCounts.get(s) || 0})`,
                  icon: 'fa-headset',
                  group: 'Staff Designations',
                })),
              ]}
              searchable
              size="md"
            />
          </div>
        </div>
        {(search || deptFilter || titleFilter || memberTypeFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setDeptFilter(''); setTitleFilter(''); setMemberTypeFilter('all'); }}
            className="mt-2 text-[0.72rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer"
          >
            <i className="fas fa-times mr-1"></i>Clear all filters
          </button>
        )}
      </div>

      {/* Faculty Grid */}
      {loading ? (
        <div className="text-center py-10">
          <i className="fas fa-spinner fa-spin text-2xl text-qsis mb-3 block"></i>
          <p className="text-[0.82rem] text-dark-text2">Loading faculty members...</p>
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-10">
          <i className="fas fa-users text-3xl text-dark-text3 mb-3 block"></i>
          <p className="text-[0.9rem] text-dark-text2">No faculty members found</p>
          <p className="text-[0.75rem] text-dark-text3 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([deptLabel, deptMembers]) => {
          const facultyMembers = deptMembers.filter(m => m.memberType === 'faculty');
          const staffMembers = deptMembers.filter(m => m.memberType === 'staff');
          return (
            <div key={deptLabel} className="mb-6">
              <h3 className="text-[0.9rem] font-bold text-dark-text mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-qsis"></span>
                {deptLabel}
                <span className="text-[0.72rem] text-dark-text3 font-normal">({deptMembers.length})</span>
              </h3>
              {facultyMembers.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-[0.78rem] font-semibold text-green-400 mb-2 flex items-center gap-1.5">
                    <i className="fas fa-chalkboard-teacher"></i> Faculty ({facultyMembers.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {facultyMembers.map(m => renderMemberCard(m))}
                  </div>
                </div>
              )}
              {staffMembers.length > 0 && (
                <div>
                  <h4 className="text-[0.78rem] font-semibold text-blue-400 mb-2 flex items-center gap-1.5">
                    <i className="fas fa-headset"></i> Staff ({staffMembers.length})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {staffMembers.map(m => renderMemberCard(m))}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
      {confirmDialog}
    </section>
  );
}
