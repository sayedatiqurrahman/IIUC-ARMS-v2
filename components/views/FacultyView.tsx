'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { FACULTIES, TEACHER_TITLES, STAFF_DESIGNATIONS, findDepartment, resolveDepartment, getDepartmentDisplayName } from '@/lib/departments';
import { config } from '@/lib/config';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import CustomSelect from '@/components/CustomSelect';
import Modal from '@/components/ui/Modal';
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

// Legacy/typo member types (e.g. "staf") are treated as staff so they still
// render at the end of the department list instead of disappearing.
const memberKind = (m: FacultyMember) => (m.memberType === 'staff' || m.memberType === 'staf') ? 'staff' : 'faculty';

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
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ department: '', name: '', title: '', email: '', phone: '', shortForm: '', memberType: 'faculty' });
  const [addSaving, setAddSaving] = useState(false);

  const fetchMembers = useCallback(() => {
    // By default show nothing — members appear only when a department is chosen.
    if (!deptFilter) {
      setMembers([]);
      setLoading(false);
      return;
    }
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

  const facultyCount = members.filter(m => memberKind(m) === 'faculty').length;
  const staffCount = members.filter(m => memberKind(m) === 'staff').length;

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

  const handleAddMember = async () => {
    if (!addForm.department || !addForm.name.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch('/api/faculty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${addForm.name} added to directory`, 'success');
        const addedDept = addForm.department;
        setShowAdd(false);
        setAddForm({ department: '', name: '', title: '', email: '', phone: '', shortForm: '', memberType: 'faculty' });
        if (!deptFilter || deptFilter !== addedDept) setDeptFilter(addedDept);
        else fetchMembers();
      } else {
        showToast(data.error || 'Failed to add', 'error');
      }
    } catch {
      showToast('Failed to add', 'error');
    } finally {
      setAddSaving(false);
    }
  };

  const renderMemberCard = (m: FacultyMember) => {
    const isEditing = editingId === m.id;
    const isStaff = memberKind(m) === 'staff';
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.3rem] font-bold text-dark-text mb-1">
            <i className="fas fa-chalkboard-teacher text-qsis mr-2"></i>Faculty & Staff Directory
          </h2>
          <p className="text-[0.82rem] text-dark-text2">
            Browse faculty members across all departments
            {canEdit && <span className="text-qsis ml-2">— You can edit members by clicking the edit icon</span>}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none transition-all flex items-center gap-1.5"
          >
            <i className="fas fa-user-plus text-[0.85rem]"></i>Add Member
          </button>
        )}
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
                { value: 'all', label: deptFilter ? `All (${members.length})` : 'All', icon: 'fa-users' },
                { value: 'faculty', label: deptFilter ? `Faculty (${facultyCount})` : 'Faculty', icon: 'fa-chalkboard-teacher' },
                { value: 'staff', label: deptFilter ? `Staffs (${staffCount})` : 'Staffs', icon: 'fa-headset' },
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
                { value: '', label: deptFilter ? `All (${titleCounts.size})` : 'All', icon: 'fa-user-tie' },
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
      ) : !deptFilter ? (
        <div className="text-center py-16">
          <i className="fas fa-building text-3xl text-dark-text3 mb-3 block"></i>
          <p className="text-[0.9rem] text-dark-text2 font-medium">Select a department to browse its members</p>
          <p className="text-[0.75rem] text-dark-text3 mt-1">Choose a department above to see faculty and staff</p>
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-10">
          <i className="fas fa-users text-3xl text-dark-text3 mb-3 block"></i>
          <p className="text-[0.9rem] text-dark-text2">No faculty members found</p>
          <p className="text-[0.75rem] text-dark-text3 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          {/* Teachers segment */}
          {Array.from(grouped.entries()).map(([deptLabel, deptMembers]) => {
            const teachers = deptMembers.filter(m => memberKind(m) === 'faculty');
            if (teachers.length === 0) return null;
            return (
              <div key={deptLabel} className="mb-6">
                <h3 className="text-[0.9rem] font-bold text-dark-text mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-qsis"></span>
                  {deptLabel}
                  <span className="text-[0.72rem] text-dark-text3 font-normal">({teachers.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {teachers.map(m => renderMemberCard(m))}
                </div>
              </div>
            );
          })}

          {/* Staffs segment */}
          {(() => {
            const staffGroups = Array.from(grouped.entries()).filter(([, dm]) => dm.some(m => memberKind(m) === 'staff'));
            if (staffGroups.length === 0) return null;
            const totalStaff = staffGroups.reduce((sum, [, dm]) => sum + dm.filter(m => memberKind(m) === 'staff').length, 0);
            return (
              <div className="mt-4 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
                <h3 className="text-[1rem] font-bold text-blue-400 mb-3 flex items-center gap-2">
                  <i className="fas fa-headset"></i> Staffs
                  <span className="text-[0.72rem] text-dark-text3 font-normal">({totalStaff})</span>
                </h3>
                {staffGroups.map(([deptLabel, deptMembers]) => {
                  const staffMembers = deptMembers.filter(m => memberKind(m) === 'staff');
                  if (staffMembers.length === 0) return null;
                  return (
                    <div key={deptLabel} className="mb-3">
                      {staffGroups.length > 1 && (
                        <h4 className="text-[0.72rem] font-semibold text-dark-text2 mb-2 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-blue-400"></span>{deptLabel}
                        </h4>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {staffMembers.map(m => renderMemberCard(m))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}
      {showAdd && (
        <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Faculty / Staff Member" maxWidth="max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Department *</label>
              <CustomSelect
                value={addForm.department}
                onChange={(val) => setAddForm(f => ({ ...f, department: val }))}
                placeholder="Select department..."
                options={FACULTIES.flatMap(f => f.departments.map(d => ({
                  value: d.id,
                  label: `${d.shortName} — ${d.name}`,
                  icon: 'fa-building',
                  group: `${f.shortName} — ${f.name}`,
                })))}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Type *</label>
              <CustomSelect
                value={addForm.memberType}
                onChange={(val) => setAddForm(f => ({ ...f, memberType: val, title: '' }))}
                options={[
                  { value: 'faculty', label: 'Faculty', icon: 'fa-chalkboard-teacher' },
                  { value: 'staff', label: 'Staff', icon: 'fa-user-tie' },
                ]}
              />
            </div>
            <div className="sm:col-span-1">
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Full Name *</label>
              <input type="text" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Prof. Dr. Gias Uddin Hafiz" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Designation</label>
              <CustomSelect
                value={addForm.title}
                onChange={(val) => setAddForm(f => ({ ...f, title: val }))}
                placeholder="Select designation..."
                options={(addForm.memberType === 'staff' ? STAFF_DESIGNATIONS : TEACHER_TITLES).map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' }))}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Short Form</label>
              <input type="text" value={addForm.shortForm} onChange={e => setAddForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} placeholder="e.g. GH" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Email</label>
              <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="yourname@iiuc.ac.bd" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Phone</label>
              <input type="tel" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button onClick={handleAddMember} disabled={addSaving || !addForm.department || !addForm.name.trim()}
              className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50 flex items-center gap-1.5">
              {addSaving ? <><i className="fas fa-spinner fa-spin"></i> Adding...</> : <><i className="fas fa-user-plus"></i> Add Member</>}
            </button>
            <button onClick={() => setShowAdd(false)} disabled={addSaving}
              className="px-4 py-2 rounded-lg bg-dark-bg border border-dark-border text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:text-dark-text disabled:opacity-50">
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {confirmDialog}
    </section>
  );
}
