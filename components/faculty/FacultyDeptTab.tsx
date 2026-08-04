'use client';

import { useState, useEffect, useCallback } from 'react';
import { FACULTIES } from '@/lib/departments';
import { useConfirm } from '@/components/ConfirmModal';
import { showToast } from '@/lib/utils';
import CustomSelect from '@/components/CustomSelect';
import { ICON_OPTIONS } from './constants';
import type { CustomFaculty, CustomDepartment, FacultyDeptTabProps } from './types';

export default function FacultyDeptTab({ effectiveRole, profile, canManage }: FacultyDeptTabProps) {
  const { confirm, confirmDialog } = useConfirm();
  const [customFaculties, setCustomFaculties] = useState<CustomFaculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewFacultyForm, setShowNewFacultyForm] = useState(false);
  const [showNewDeptForm, setShowNewDeptForm] = useState<string | null>(null);
  const [expandedFaculties, setExpandedFaculties] = useState<Set<string>>(new Set());

  const [newFaculty, setNewFaculty] = useState({ id: '', name: '', shortName: '', icon: 'fa-university' });
  const [newDept, setNewDept] = useState({ id: '', name: '', shortName: '', icon: 'fa-building' });

  const isBuiltinDept = (facultyId: string, deptId: string) => {
    const faculty = FACULTIES.find(f => f.id === facultyId);
    return faculty ? faculty.departments.some(d => d.id === deptId) : false;
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/faculty-departments');
      if (res.ok) {
        const data = await res.json();
        setCustomFaculties(data.customFaculties || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: string) => {
    setExpandedFaculties(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateFaculty = async () => {
    if (!newFaculty.id || !newFaculty.name || !newFaculty.shortName) {
      showToast('Please fill all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/faculty-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFaculty', ...newFaculty }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Faculty created! GitHub folder created.', 'success');
        setCustomFaculties(prev => [...prev, data.faculty]);
        setShowNewFacultyForm(false);
        setNewFaculty({ id: '', name: '', shortName: '', icon: 'fa-university' });
        try { (await import('@/lib/store')).useAppStore.getState().loadTree(); } catch {}
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create faculty', 'error');
    }
    setSaving(false);
  };

  const handleCreateDept = async (facultyId: string) => {
    if (!newDept.id || !newDept.name || !newDept.shortName) {
      showToast('Please fill all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/faculty-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createDepartment', facultyId, ...newDept }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Department created! Semester folders created in GitHub.', 'success');
        setCustomFaculties(prev => prev.map(f => {
          if (f.id === facultyId) {
            return { ...f, departments: [...f.departments, data.department] };
          }
          return f;
        }));
        setShowNewDeptForm(null);
        setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' });
        try { (await import('@/lib/store')).useAppStore.getState().loadTree(); } catch {}
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create department', 'error');
    }
    setSaving(false);
  };

  const handleDeleteFaculty = async (facultyId: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Faculty',
      message: `Are you sure you want to delete "${name}"? This will NOT delete the GitHub folder.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch('/api/faculty-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteFaculty', facultyId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Faculty deleted', 'success');
        setCustomFaculties(prev => prev.filter(f => f.id !== facultyId));
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    }
    setSaving(false);
  };

  const handleDeleteDept = async (facultyId: string, deptId: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Department',
      message: `Are you sure you want to delete "${name}"? This will NOT delete the GitHub folder.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch('/api/faculty-departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteDepartment', facultyId, departmentId: deptId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('Department deleted', 'success');
        setCustomFaculties(prev => prev.map(f => {
          if (f.id === facultyId) {
            return { ...f, departments: f.departments.filter(d => d.id !== deptId) };
          }
          return f;
        }));
      } else {
        showToast(data.error || 'Failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <i className="fas fa-spinner fa-spin text-2xl text-qsis"></i>
        <p className="text-dark-text2 mt-2 text-sm">Loading faculties...</p>
      </div>
    );
  }

  return (
    <div>
      {confirmDialog}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-dark-text">
          <i className="fas fa-building text-teal-400 mr-2"></i>Faculties & Departments
        </h3>
        {(canManage) && (
          <button
            onClick={() => setShowNewFacultyForm(!showNewFacultyForm)}
            className="px-3 py-1.5 bg-qsis text-white rounded-lg text-[0.75rem] font-semibold hover:bg-qsis/90 cursor-pointer border-none"
          >
            <i className={`fas ${showNewFacultyForm ? 'fa-times' : 'fa-plus'} mr-1`}></i>
            {showNewFacultyForm ? 'Cancel' : 'Add Faculty'}
          </button>
        )}
      </div>

      {/* New Faculty Form */}
      {showNewFacultyForm && (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
          <h4 className="text-[0.8rem] font-semibold text-dark-text mb-3">
            <i className="fas fa-plus-circle text-qsis mr-1"></i>New Faculty
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[0.65rem] text-dark-text3 block mb-1">Faculty ID * (auto-generated from name)</label>
              <input
                type="text"
                value={newFaculty.id}
                onChange={e => setNewFaculty({ ...newFaculty, id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                placeholder="e.g. engineering"
                className="w-full px-3 py-2 bg-dark-bg3 border border-dark-border rounded-lg text-dark-text text-[0.8rem]"
              />
            </div>
            <div>
              <label className="text-[0.65rem] text-dark-text3 block mb-1">Full Name *</label>
              <input
                type="text"
                value={newFaculty.name}
                onChange={e => {
                  const name = e.target.value;
                  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
                  const shortName = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 5);
                  setNewFaculty({ ...newFaculty, name, id, shortName });
                }}
                placeholder="e.g. Faculty of Engineering"
                className="w-full px-3 py-2 bg-dark-bg3 border border-dark-border rounded-lg text-dark-text text-[0.8rem]"
              />
            </div>
            <div>
              <label className="text-[0.65rem] text-dark-text3 block mb-1">Short Name *</label>
              <input
                type="text"
                value={newFaculty.shortName}
                onChange={e => setNewFaculty({ ...newFaculty, shortName: e.target.value.toUpperCase() })}
                placeholder="e.g. FE"
                className="w-full px-3 py-2 bg-dark-bg3 border border-dark-border rounded-lg text-dark-text text-[0.8rem]"
              />
            </div>
            <div>
              <label className="text-[0.65rem] text-dark-text3 block mb-1">Icon</label>
              <CustomSelect
                options={ICON_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                value={newFaculty.icon}
                onChange={val => setNewFaculty({ ...newFaculty, icon: val })}
                placeholder="Select icon"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleCreateFaculty}
              disabled={saving}
              className="px-4 py-2 bg-qsis text-white rounded-lg text-[0.75rem] font-semibold hover:bg-qsis/90 cursor-pointer border-none disabled:opacity-50"
            >
              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-check mr-1"></i>Create Faculty</>}
            </button>
            <button
              onClick={() => setShowNewFacultyForm(false)}
              className="px-4 py-2 bg-dark-bg3 text-dark-text2 rounded-lg text-[0.75rem] hover:bg-dark-border cursor-pointer border-none"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Built-in Faculties */}
      <div className="mb-4">
        <h4 className="text-[0.75rem] font-semibold text-dark-text3 mb-2 uppercase tracking-wider">
          <i className="fas fa-lock mr-1"></i>Built-in Faculties ({FACULTIES.length})
        </h4>
        <div className="space-y-2">
          {FACULTIES.map(faculty => (
            <div key={faculty.id} className="bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-dark-bg3 transition-colors"
                onClick={() => toggleExpand(faculty.id)}
              >
                <i className={`fas ${faculty.icon} text-teal-400 w-5 text-center`}></i>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.8rem] font-semibold text-dark-text">{faculty.name}</span>
                    <span className="text-[0.65rem] px-1.5 py-0.5 bg-dark-bg3 text-dark-text3 rounded font-mono">{faculty.shortName}</span>
                    <span className="text-[0.6rem] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Built-in</span>
                  </div>
                  <p className="text-[0.68rem] text-dark-text3 mt-0.5">
                    {faculty.departments.length} departments: {faculty.departments.map(d => d.shortName).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {(canManage) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowNewDeptForm(faculty.id); setExpandedFaculties(prev => new Set(prev).add(faculty.id)); setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' }); }}
                      className="p-1.5 text-qsis hover:bg-qsis/10 rounded cursor-pointer border-none bg-transparent"
                      title="Add department"
                    >
                      <i className="fas fa-plus text-xs"></i>
                    </button>
                  )}
                  <i className={`fas fa-chevron-${expandedFaculties.has(faculty.id) ? 'up' : 'down'} text-dark-text3 text-xs`}></i>
                </div>
              </div>

              {expandedFaculties.has(faculty.id) && (
                <div className="border-t border-dark-border bg-dark-bg3/50 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    {faculty.departments.map(dept => (
                      <div key={dept.id} className="flex items-center gap-2 p-2 bg-dark-bg2 border border-dark-border rounded-lg">
                        <i className={`fas ${dept.icon} text-qsis text-xs w-4 text-center`}></i>
                        <div className="flex-1 min-w-0">
                          <span className="text-[0.75rem] text-dark-text font-medium">{dept.name}</span>
                          <span className="text-[0.6rem] text-dark-text3 ml-1.5 font-mono">({dept.shortName})</span>
                        </div>
                        {!isBuiltinDept(faculty.id, dept.id) && (canManage) && (
                          <button onClick={() => handleDeleteDept(faculty.id, dept.id, dept.name)} className="p-1 text-red-400 hover:bg-red-500/10 rounded cursor-pointer border-none bg-transparent" title="Delete department">
                            <i className="fas fa-times text-[0.6rem]"></i>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {(canManage) && (
                    <>
                      {showNewDeptForm === faculty.id ? (
                        <div className="bg-dark-bg2 border border-dark-border rounded-lg p-3">
                          <h5 className="text-[0.75rem] font-semibold text-dark-text mb-2">
                            <i className="fas fa-plus text-qsis mr-1"></i>New Department in {faculty.shortName}
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[0.6rem] text-dark-text3 block mb-0.5">ID *</label>
                              <input type="text" value={newDept.id} onChange={e => setNewDept({ ...newDept, id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })} placeholder="e.g. me" className="w-full px-2 py-1.5 bg-dark-bg3 border border-dark-border rounded text-dark-text text-[0.75rem]" />
                            </div>
                            <div>
                              <label className="text-[0.6rem] text-dark-text3 block mb-0.5">Full Name *</label>
                              <input type="text" value={newDept.name} onChange={e => { const name = e.target.value; const id = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10); const shortName = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 5); setNewDept({ ...newDept, name, id, shortName }); }} placeholder="e.g. Mechanical Engineering" className="w-full px-2 py-1.5 bg-dark-bg3 border border-dark-border rounded text-dark-text text-[0.75rem]" />
                            </div>
                            <div>
                              <label className="text-[0.6rem] text-dark-text3 block mb-0.5">Short Name *</label>
                              <input type="text" value={newDept.shortName} onChange={e => setNewDept({ ...newDept, shortName: e.target.value.toUpperCase() })} placeholder="e.g. ME" className="w-full px-2 py-1.5 bg-dark-bg3 border border-dark-border rounded text-dark-text text-[0.75rem]" />
                            </div>
                            <div>
                              <label className="text-[0.6rem] text-dark-text3 block mb-0.5">Icon</label>
                              <CustomSelect options={ICON_OPTIONS.map(o => ({ value: o.value, label: o.label }))} value={newDept.icon} onChange={val => setNewDept({ ...newDept, icon: val })} placeholder="Select icon" />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => handleCreateDept(faculty.id)} disabled={saving} className="px-3 py-1.5 bg-qsis text-white rounded text-[0.7rem] font-semibold hover:bg-qsis/90 cursor-pointer border-none disabled:opacity-50">
                              {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-check mr-1"></i>Create</>}
                            </button>
                            <button onClick={() => { setShowNewDeptForm(null); setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' }); }} className="px-3 py-1.5 bg-dark-bg3 text-dark-text2 rounded text-[0.7rem] hover:bg-dark-border cursor-pointer border-none">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setShowNewDeptForm(faculty.id); setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' }); }} className="w-full p-2 border border-dashed border-dark-border rounded-lg text-[0.7rem] text-dark-text3 hover:text-qsis hover:border-qsis/50 cursor-pointer bg-transparent transition-colors">
                          <i className="fas fa-plus mr-1"></i>Add Department
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Custom Faculties */}
      <div>
        <h4 className="text-[0.75rem] font-semibold text-dark-text3 mb-2 uppercase tracking-wider">
          <i className="fas fa-plus-circle mr-1"></i>Custom Faculties ({customFaculties.length})
        </h4>
        {customFaculties.length === 0 ? (
          <div className="bg-dark-bg2 border border-dark-border border-dashed rounded-xl p-6 text-center">
            <i className="fas fa-building text-2xl text-dark-text3 mb-2"></i>
            <p className="text-[0.8rem] text-dark-text3">No custom faculties yet</p>
            <p className="text-[0.68rem] text-dark-text3 mt-1">Click &quot;Add Faculty&quot; above to create one</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customFaculties.map(faculty => (
              <div key={faculty.id} className="bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-dark-bg3 transition-colors"
                  onClick={() => toggleExpand(faculty.id)}
                >
                  <i className={`fas ${faculty.icon} text-purple-400 w-5 text-center`}></i>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.8rem] font-semibold text-dark-text">{faculty.name}</span>
                      <span className="text-[0.65rem] px-1.5 py-0.5 bg-dark-bg3 text-dark-text3 rounded font-mono">{faculty.shortName}</span>
                      <span className="text-[0.6rem] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded">Custom</span>
                    </div>
                    <p className="text-[0.68rem] text-dark-text3 mt-0.5">
                      {faculty.departments.length} departments: {faculty.departments.map(d => d.shortName).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(canManage) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteFaculty(faculty.id, faculty.name); }}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded cursor-pointer border-none bg-transparent"
                        title="Delete faculty"
                      >
                        <i className="fas fa-trash text-xs"></i>
                      </button>
                    )}
                    {(canManage) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowNewDeptForm(faculty.id); setExpandedFaculties(prev => new Set(prev).add(faculty.id)); setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' }); }}
                        className="p-1.5 text-qsis hover:bg-qsis/10 rounded cursor-pointer border-none bg-transparent"
                        title="Add department"
                      >
                        <i className="fas fa-plus text-xs"></i>
                      </button>
                    )}
                    <i className={`fas fa-chevron-${expandedFaculties.has(faculty.id) ? 'up' : 'down'} text-dark-text3 text-xs`}></i>
                  </div>
                </div>

                {expandedFaculties.has(faculty.id) && (
                  <div className="border-t border-dark-border bg-dark-bg3/50 p-3">
                    {/* Departments list */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {faculty.departments.map(dept => (
                        <div key={dept.id} className="flex items-center gap-2 p-2 bg-dark-bg2 border border-dark-border rounded-lg">
                          <i className={`fas ${dept.icon} text-qsis text-xs w-4 text-center`}></i>
                          <div className="flex-1 min-w-0">
                            <span className="text-[0.75rem] text-dark-text font-medium">{dept.name}</span>
                            <span className="text-[0.6rem] text-dark-text3 ml-1.5 font-mono">({dept.shortName})</span>
                          </div>
                          {(canManage) && (
                            <button
                              onClick={() => handleDeleteDept(faculty.id, dept.id, dept.name)}
                              className="p-1 text-red-400 hover:bg-red-500/10 rounded cursor-pointer border-none bg-transparent"
                              title="Delete department"
                            >
                              <i className="fas fa-times text-[0.6rem]"></i>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add Department */}
                    {(canManage) && (
                      <>
                        {showNewDeptForm === faculty.id ? (
                          <div className="bg-dark-bg2 border border-dark-border rounded-lg p-3">
                            <h5 className="text-[0.75rem] font-semibold text-dark-text mb-2">
                              <i className="fas fa-plus text-qsis mr-1"></i>New Department in {faculty.shortName}
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-[0.6rem] text-dark-text3 block mb-0.5">ID *</label>
                                <input
                                  type="text"
                                  value={newDept.id}
                                  onChange={e => setNewDept({ ...newDept, id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                                  placeholder="e.g. me"
                                  className="w-full px-2 py-1.5 bg-dark-bg3 border border-dark-border rounded text-dark-text text-[0.75rem]"
                                />
                              </div>
                              <div>
                                <label className="text-[0.6rem] text-dark-text3 block mb-0.5">Full Name *</label>
                                <input
                                  type="text"
                                  value={newDept.name}
                                  onChange={e => {
                                    const name = e.target.value;
                                    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
                                    const shortName = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 5);
                                    setNewDept({ ...newDept, name, id, shortName });
                                  }}
                                  placeholder="e.g. Mechanical Engineering"
                                  className="w-full px-2 py-1.5 bg-dark-bg3 border border-dark-border rounded text-dark-text text-[0.75rem]"
                                />
                              </div>
                              <div>
                                <label className="text-[0.6rem] text-dark-text3 block mb-0.5">Short Name *</label>
                                <input
                                  type="text"
                                  value={newDept.shortName}
                                  onChange={e => setNewDept({ ...newDept, shortName: e.target.value.toUpperCase() })}
                                  placeholder="e.g. ME"
                                  className="w-full px-2 py-1.5 bg-dark-bg3 border border-dark-border rounded text-dark-text text-[0.75rem]"
                                />
                              </div>
                              <div>
                                <label className="text-[0.6rem] text-dark-text3 block mb-0.5">Icon</label>
                                <CustomSelect
                                  options={ICON_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                                  value={newDept.icon}
                                  onChange={val => setNewDept({ ...newDept, icon: val })}
                                  placeholder="Select icon"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => handleCreateDept(faculty.id)}
                                disabled={saving}
                                className="px-3 py-1.5 bg-qsis text-white rounded text-[0.7rem] font-semibold hover:bg-qsis/90 cursor-pointer border-none disabled:opacity-50"
                              >
                                {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-check mr-1"></i>Create</>}
                              </button>
                              <button
                                onClick={() => { setShowNewDeptForm(null); setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' }); }}
                                className="px-3 py-1.5 bg-dark-bg3 text-dark-text2 rounded text-[0.7rem] hover:bg-dark-border cursor-pointer border-none"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setShowNewDeptForm(faculty.id); setNewDept({ id: '', name: '', shortName: '', icon: 'fa-building' }); }}
                            className="w-full p-2 border border-dashed border-dark-border rounded-lg text-[0.7rem] text-dark-text3 hover:text-qsis hover:border-qsis/50 cursor-pointer bg-transparent transition-colors"
                          >
                            <i className="fas fa-plus mr-1"></i>Add Department
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
