'use client';

import { useState, useEffect } from 'react';
import { showToast } from '@/lib/utils';
import { config } from '@/lib/config';
import { FACULTIES, TEACHER_TITLES } from '@/lib/departments';
import { useAppStore } from '@/lib/store';
import CustomSelect from '@/components/CustomSelect';
import { useConfirm } from '@/components/ConfirmModal';

export default function TeacherInfoSection({ email, profile }: { email: string; profile: any }) {
  const { confirm, confirmDialog } = useConfirm();
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const isAdmin = effectiveRole === 'admin';
  const myDept = profile.department || '';

  const [myEntry, setMyEntry] = useState<any>(null);
  const [myEntryChecked, setMyEntryChecked] = useState(false);
  const [linkedMember, setLinkedMember] = useState<any>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ department: myDept, name: profile.name || '', title: profile.title || '', shortForm: profile.shortForm || '', email: email, phone: '' });
  const [saving, setSaving] = useState(false);

  // Search state
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ department: '', name: '', title: '', shortForm: '', email: '', phone: '' });

  // Check if teacher has entry + if this account is linked to a faculty profile
  useEffect(() => {
    fetch('/api/faculty')
      .then(r => r.json())
      .then(data => {
        const entries = data.members || [];
        const mine = entries.find((m: any) => m.email?.toLowerCase() === email.toLowerCase());
        const linked = profile.shortForm
          ? entries.find((m: any) => m.shortForm?.toUpperCase() === String(profile.shortForm).toUpperCase()) || null
          : null;
        setMyEntry(mine || null);
        setLinkedMember(linked);
        setMyEntryChecked(true);
        if (!mine && !linked) {
          setForm({ department: myDept, name: profile.name || '', title: profile.title || '', shortForm: profile.shortForm || '', email: email, phone: '' });
          setShowAddForm(true);
        }
      })
      .catch(() => setMyEntryChecked(true));
  }, [email]);

  const handleClaim = async (m: any) => {
    if (!await confirm({ message: `Link your account to "${m.name}"? Your account will then be recognized as this teacher across the site.`, title: 'Connect Teacher Profile' })) return;
    setClaimingId(m.id);
    try {
      const res = await fetch('/api/profile/claim-faculty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facultyId: m.id }) });
      const data = await res.json();
      if (data.success) {
        showToast('Account linked to your faculty profile!', 'success');
        setLinkedMember(data.member || m);
        setMyEntry(mine => mine?.id === m.id ? mine : mine);
        useAppStore.setState(s => ({ profile: { ...s.profile, shortForm: data.shortForm || m.shortForm || '', department: m.department, name: s.profile.name || m.name, title: s.profile.title || m.title || '' } }));
      } else showToast(data.error || 'Failed to link', 'error');
    } catch { showToast('Failed to link', 'error'); }
    finally { setClaimingId(null); }
  };

  const handleUnlink = async () => {
    if (!await confirm({ message: 'Unlink your account from this faculty profile?', danger: true, title: 'Disconnect Teacher Profile' })) return;
    setClaimingId('unlink');
    try {
      const res = await fetch('/api/profile/claim-faculty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unlink: true }) });
      const data = await res.json();
      if (data.success) {
        showToast('Account unlinked', 'success');
        setLinkedMember(null);
        useAppStore.setState(s => ({ profile: { ...s.profile, shortForm: '' } }));
      } else showToast(data.error || 'Failed to unlink', 'error');
    } catch { showToast('Failed to unlink', 'error'); }
    finally { setClaimingId(null); }
  };

  const handleAdd = async () => {
    if (!form.department || !form.name) { showToast('Department and name required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/faculty', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) { showToast('Your info added to directory!', 'success'); setMyEntry(data.member); setShowAddForm(false); }
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: search.trim() });
      const res = await fetch(`/api/faculty?${params}`);
      const data = await res.json();
      setSearchResults(data.members || []);
    } catch { setSearchResults([]); }
    finally { setSearching(false); }
  };

  const handleEditSave = async (id: string) => {
    if (!editForm.department || !editForm.name) { showToast('Department and name required', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/faculty', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm }) });
      const data = await res.json();
      if (data.success) {
        showToast('Updated', 'success');
        setEditingId(null);
        if (myEntry?.id === id) setMyEntry(data.member);
        if (searchResults) handleSearch();
      } else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `Remove ${name} from faculty directory?`, danger: true, title: 'Remove Faculty' })) return;
    try {
      const res = await fetch(`/api/faculty?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(`${name} removed`, 'success');
        if (myEntry?.id === id) setMyEntry(null);
        if (searchResults) handleSearch();
      } else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Failed', 'error'); }
  };

  const getDeptLabel = (deptId: string) => {
    const found = FACULTIES.flatMap(f => f.departments.map(d => ({ ...d, faculty: f.shortName }))).find(d => d.id === deptId);
    return found ? `${found.shortName} — ${found.faculty}` : deptId;
  };

  const canManage = (m: any) => {
    if (isAdmin) return true;
    if (myDept && m.department === myDept) return true;
    return false;
  };

  if (!myEntryChecked) {
    return (
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
        <div className="text-center py-4"><i className="fas fa-spinner fa-spin text-xl text-qsis"></i></div>
      </div>
    );
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
      <h4 className="text-[0.95rem] font-semibold flex items-center gap-2 mb-4">
        <i className="fas fa-chalkboard-teacher text-qsis"></i> Teacher Directory
      </h4>

      {/* ─── PROMPT: No entry → Add Your Info ─── */}
      {!myEntry && showAddForm && (
        <div className="bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-qsis/15 flex items-center justify-center flex-shrink-0">
              <i className="fas fa-user-plus text-qsis text-sm"></i>
            </div>
            <div>
              <h5 className="text-[0.85rem] font-semibold text-dark-text">Complete Your Teacher Profile</h5>
              <p className="text-[0.75rem] text-dark-text2 mt-0.5">You are not in the faculty directory yet. Add your info so students and colleagues can find you.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Department *</label>
              <CustomSelect
                value={form.department}
                onChange={value => setForm(f => ({ ...f, department: value }))}
                placeholder="Select department..."
                options={FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: 'fa-building', group: `${f.shortName} — ${f.name}` })))}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Full Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Designation</label>
              <CustomSelect
                value={TEACHER_TITLES.includes(form.title) ? form.title : form.title ? '__custom' : ''}
                onChange={value => setForm(f => ({ ...f, title: value === '__custom' ? '' : value }))}
                placeholder="Select designation..."
                options={[...TEACHER_TITLES.map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' })), { value: '__custom', label: 'Other (type below)', icon: 'fa-chalkboard-teacher' }]}
              />
              {!TEACHER_TITLES.includes(form.title) && form.title !== '' && (
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Type designation" className="w-full mt-1 px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
              )}
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Short Form</label>
              <input type="text" value={form.shortForm} onChange={e => setForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} placeholder="e.g. GH" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !form.department || !form.name} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-plus mr-1"></i>Add My Info</>}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] cursor-pointer hover:border-qsis">Skip</button>
          </div>
        </div>
      )}

      {/* ─── MY CARD: Entry found → Show card ─── */}
      {myEntry && (
        <div className="bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
              <span className="text-[0.78rem] font-bold text-qsis">{myEntry.shortForm || myEntry.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[0.9rem] font-bold text-dark-text">{myEntry.name}</span>
                {linkedMember?.id === myEntry.id ? (
                  <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.6rem] font-semibold"><i className="fas fa-link mr-1"></i>Linked to your account</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-[0.6rem] font-semibold">In Directory</span>
                )}
              </div>
              {myEntry.title && <p className="text-[0.75rem] text-qsis font-medium">{myEntry.title}</p>}
              <p className="text-[0.72rem] text-dark-text3">{getDeptLabel(myEntry.department)}{myEntry.email ? ` · ${myEntry.email}` : ''}{myEntry.phone ? ` · ${myEntry.phone}` : ''}</p>
            </div>
            {linkedMember?.id !== myEntry.id ? (
              <button onClick={() => handleClaim(myEntry)} disabled={claimingId === myEntry.id} className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50 flex-shrink-0">
                {claimingId === myEntry.id ? <><i className="fas fa-spinner fa-spin mr-1"></i>Linking...</> : <><i className="fas fa-link mr-1"></i>Connect to my account</>}
              </button>
            ) : (
              <button onClick={handleUnlink} disabled={claimingId === 'unlink'} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text2 text-[0.72rem] font-semibold cursor-pointer hover:text-red-400 hover:border-red-400/50 transition-all disabled:opacity-50 flex-shrink-0">
                {claimingId === 'unlink' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-unlink mr-1"></i>Unlink</>}
              </button>
            )}
          </div>
          <p className="text-[0.7rem] text-dark-text3 mt-2"><i className="fas fa-info-circle text-qsis mr-1"></i>Connecting your account lets you receive your personal routine &amp; exam duty notifications on Telegram and auto-detects you on the Teacher Routine page.</p>
        </div>
      )}

      {/* ─── CONNECTED: Linked via short form (no email match) ─── */}
      {!myEntry && linkedMember && (
        <div className="bg-gradient-to-br from-qsis/5 to-accent/5 border border-qsis/20 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
              <span className="text-[0.78rem] font-bold text-qsis">{linkedMember.shortForm || linkedMember.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[0.9rem] font-bold text-dark-text">{linkedMember.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[0.6rem] font-semibold"><i className="fas fa-link mr-1"></i>Linked to your account</span>
              </div>
              {linkedMember.title && <p className="text-[0.75rem] text-qsis font-medium">{linkedMember.title}</p>}
              <p className="text-[0.72rem] text-dark-text3">{getDeptLabel(linkedMember.department)}</p>
            </div>
            <button onClick={handleUnlink} disabled={claimingId === 'unlink'} className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text2 text-[0.72rem] font-semibold cursor-pointer hover:text-red-400 hover:border-red-400/50 transition-all disabled:opacity-50 flex-shrink-0">
              {claimingId === 'unlink' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-unlink mr-1"></i>Unlink</>}
            </button>
          </div>
          <p className="text-[0.7rem] text-dark-text3 mt-2"><i className="fas fa-info-circle text-qsis mr-1"></i>You are linked by short form ({linkedMember.shortForm || '—'}). You can also add your own entry below so students find you in the directory.</p>
        </div>
      )}

      {/* ─── SEARCH: Find any teacher ─── */}
      <div className="mb-4">
        <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-search mr-1"></i>Search Teachers</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults(null); }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or short form..."
            className="flex-1 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors"
          />
          <button onClick={handleSearch} disabled={searching || !search.trim()} className="px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
            {searching ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
          </button>
        </div>
      </div>

      {/* ─── SEARCH RESULTS ─── */}
      {searchResults !== null && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.78rem] text-dark-text2">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
            <button onClick={() => { setSearchResults(null); setSearch(''); }} className="text-[0.72rem] text-dark-text3 hover:text-qsis bg-transparent border-none cursor-pointer"><i className="fas fa-times mr-1"></i>Clear</button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-[0.78rem] text-dark-text3 text-center py-4">No teachers found</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border hover:border-qsis/30 transition-all group">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
                    <span className="text-[0.68rem] font-bold text-qsis">{m.shortForm || m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                  </div>
                  {editingId === m.id ? (
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Name" />
                      <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Designation" />
                      <input type="text" value={editForm.shortForm} onChange={e => setEditForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Short Form" />
                      <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Email" />
                      <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="px-2 py-1 rounded border border-qsis/50 bg-dark-bg text-dark-text text-[0.75rem] outline-none" placeholder="Phone" />
                      <div className="flex gap-1">
                        <button onClick={() => handleEditSave(m.id)} disabled={saving} className="px-2 py-1 rounded bg-qsis text-white text-[0.68rem] cursor-pointer border-none disabled:opacity-50"><i className="fas fa-check"></i></button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded border border-dark-border text-dark-text2 text-[0.68rem] cursor-pointer bg-dark-bg">X</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.82rem] font-medium text-dark-text truncate">{m.name}</span>
                          {m.title && <span className="text-[0.65rem] text-qsis italic">{m.title}</span>}
                          {m.email?.toLowerCase() === email.toLowerCase() && <span className="text-[0.55rem] text-green-400 font-semibold">(You)</span>}
                        </div>
                        <p className="text-[0.7rem] text-dark-text3">{getDeptLabel(m.department)}{m.email ? ` · ${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}</p>
                      </div>
                      {canManage(m) && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                          <button onClick={() => { setEditingId(m.id); setEditForm({ department: m.department, name: m.name, title: m.title || '', shortForm: m.shortForm || '', email: m.email || '', phone: m.phone || '' }); }} className="px-2 py-1 rounded bg-dark-bg border border-dark-border text-dark-text2 hover:text-qsis text-[0.65rem] cursor-pointer transition-all" title="Edit">
                            <i className="fas fa-pen"></i>
                          </button>
                          <button onClick={() => handleDelete(m.id, m.name)} className="px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[0.65rem] cursor-pointer transition-all border-none" title="Delete">
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      )}
                      {linkedMember?.id === m.id ? (
                        <button onClick={handleUnlink} disabled={claimingId === 'unlink'} className="px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-[0.65rem] font-semibold cursor-pointer transition-all border-none flex-shrink-0" title="Unlink from your account">
                          {claimingId === 'unlink' ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-link mr-1"></i>Linked</>}
                        </button>
                      ) : (
                        <button onClick={() => handleClaim(m)} disabled={claimingId === m.id} className="px-2.5 py-1 rounded-lg border border-qsis/30 text-qsis hover:bg-qsis/10 text-[0.65rem] font-semibold cursor-pointer transition-all bg-transparent flex-shrink-0" title="Link this teacher to your account">
                          {claimingId === m.id ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-link mr-1"></i>Connect</>}
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Hint ─── */}
      {!myEntry && !showAddForm && (
        <button onClick={() => setShowAddForm(true)} className="w-full py-3 rounded-lg border border-dashed border-dark-border text-dark-text2 hover:text-qsis hover:border-qsis/50 text-[0.82rem] cursor-pointer bg-transparent transition-all">
          <i className="fas fa-plus-circle mr-2"></i>Add Your Teacher Info
        </button>
      )}
      {confirmDialog}
    </div>
  );
}
