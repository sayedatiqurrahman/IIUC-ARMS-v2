'use client';

import { useState } from 'react';
import CustomSelect from '@/components/CustomSelect';
import { FACULTIES, TEACHER_TITLES, STAFF_DESIGNATIONS } from '@/lib/departments';
import { showToast } from '@/lib/utils';

interface FacultyTabProps {
  facultyList: any[];
  facultyForm: { department: string; name: string; title: string; email: string; phone: string; shortForm: string; memberType: string };
  setFacultyForm: React.Dispatch<React.SetStateAction<{ department: string; name: string; title: string; email: string; phone: string; shortForm: string; memberType: string }>>;
  facultySaving: boolean;
  bulkMode: boolean;
  setBulkMode: (mode: boolean) => void;
  bulkInput: string;
  setBulkInput: (input: string) => void;
  bulkImporting: boolean;
  bulkResult: { inserted: number; updated: number; skipped: number; errors?: string[] } | null;
  facultyRequests: any[];
  facultyDeptFilter: string;
  setFacultyDeptFilter: (filter: string) => void;
  facultyTitleFilter: string;
  setFacultyTitleFilter: (filter: string) => void;
  groupedFaculty: Map<string, any[]>;
  availableTitles: string[];
  handleAddFaculty: () => void;
  handleBulkImport: () => void;
  handleToggleVisibility: (id: string, current: boolean) => void;
  handleBulkVisibility: (dept: string, visible: boolean) => void;
  handleDeleteFaculty: (id: string, name: string) => void;
  loadFaculty: (dept?: string) => void;
  loadFacultyRequests: () => void;
}

export default function FacultyTab({
  facultyList,
  facultyForm,
  setFacultyForm,
  facultySaving,
  bulkMode,
  setBulkMode,
  bulkInput,
  setBulkInput,
  bulkImporting,
  bulkResult,
  facultyRequests,
  facultyDeptFilter,
  setFacultyDeptFilter,
  facultyTitleFilter,
  setFacultyTitleFilter,
  groupedFaculty,
  availableTitles,
  handleAddFaculty,
  handleBulkImport,
  handleToggleVisibility,
  handleBulkVisibility,
  handleDeleteFaculty,
  loadFaculty,
  loadFacultyRequests,
}: FacultyTabProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-dark-text mb-1"><i className="fas fa-building text-teal-400 mr-2"></i>Faculty Management</h3>
      <p className="text-[0.75rem] text-dark-text3 mb-4">Add and manage faculty members. Also available at <a href="/faculty" target="_blank" className="text-qsis underline">/faculty</a> with inline editing.</p>

      {/* Pending Faculty Requests */}
      {facultyRequests.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-5">
          <h4 className="text-[0.82rem] font-semibold text-orange-400 mb-3"><i className="fas fa-inbox mr-1"></i>Pending Faculty Requests ({facultyRequests.length})</h4>
          <div className="space-y-2">
            {facultyRequests.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-dark-bg2 rounded-lg p-3 border border-dark-border">
                <div className="flex-1 min-w-0">
                  <p className="text-[0.8rem] text-dark-text font-medium">{r.name} <span className="text-dark-text3">— {r.department}</span></p>
                  <p className="text-[0.65rem] text-dark-text3">{r.title || 'No designation'}{r.email ? ` · ${r.email}` : ''} · Requested by {r.requesterId}</p>
                </div>
                <button onClick={async () => { await fetch('/api/faculty/request', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, action: 'approve' }) }); showToast(`${r.name} approved`, 'success'); loadFacultyRequests(); loadFaculty(); }}
                  className="px-2.5 py-1 rounded-lg bg-green-500/20 text-green-400 text-[0.65rem] font-semibold cursor-pointer hover:bg-green-500/30 border-none"><i className="fas fa-check mr-1"></i>Approve</button>
                <button onClick={async () => { await fetch('/api/faculty/request', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: r.id, action: 'reject' }) }); showToast(`Request rejected`, 'success'); loadFacultyRequests(); }}
                  className="px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 text-[0.65rem] font-semibold cursor-pointer hover:bg-red-500/30 border-none"><i className="fas fa-times mr-1"></i>Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Import Toggle */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setBulkMode(!bulkMode)}
          className={`px-4 py-2 rounded-lg text-[0.78rem] font-semibold cursor-pointer border transition-all ${bulkMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-dark-bg2 text-dark-text2 border-dark-border hover:text-dark-text'}`}>
          <i className="fas fa-file-import mr-1"></i>{bulkMode ? 'Single Entry Mode' : 'Bulk Import'}
        </button>
      </div>

      {/* Bulk Import Mode */}
      {bulkMode ? (
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-5">
          <h4 className="text-[0.82rem] font-semibold text-dark-text mb-2"><i className="fas fa-file-import text-orange-400 mr-1"></i>Bulk Import Faculty</h4>
          <p className="text-[0.7rem] text-dark-text3 mb-3">Paste JSON array or CSV. CSV headers: <code className="bg-dark-bg px-1 rounded text-qsis">department, name, title, email, phone, shortform, membertype</code></p>
          <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)}
            rows={8}
            placeholder={`JSON example:\n[\n  { "department": "Computer Science and Engineering", "name": "Dr. Ahmed", "title": "Professor", "email": "ahmed@iiuc.ac.bd" }\n]\n\nCSV example:\ndepartment,name,title,email\nComputer Science and Engineering,Dr. Ahmed,Professor,ahmed@iiuc.ac.bd`}
            className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] font-mono outline-none focus:border-qsis resize-y" />
          <div className="flex items-center gap-3 mt-3">
            <button onClick={handleBulkImport} disabled={bulkImporting || !bulkInput.trim()}
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
              {bulkImporting ? <><i className="fas fa-spinner fa-spin mr-1"></i>Importing...</> : <><i className="fas fa-file-import mr-1"></i>Import</>}
            </button>
            {bulkResult && (
              <span className="text-[0.72rem] text-dark-text3">
                <i className="fas fa-check-circle text-green-400 mr-1"></i>
                {bulkResult.inserted} added, {bulkResult.updated} updated, {bulkResult.skipped} skipped
              </span>
            )}
          </div>
          {bulkResult?.errors && bulkResult.errors.length > 0 && (
            <div className="mt-2 text-[0.7rem] text-red-400">
              {bulkResult.errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
        </div>
      ) : (
        /* Add Faculty Form */
        <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-5">
          <h4 className="text-[0.82rem] font-semibold text-dark-text mb-3"><i className="fas fa-plus-circle text-qsis mr-1"></i>Add New Faculty / Staff</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Department *</label>
              <CustomSelect
                value={facultyForm.department}
                onChange={(val) => setFacultyForm(f => ({ ...f, department: val }))}
                placeholder="Select department..."
                options={[
                  ...FACULTIES.flatMap(f => f.departments.map(d => ({
                    value: d.id,
                    label: `${d.shortName} — ${d.name}`,
                    icon: 'fa-building',
                    group: `${f.shortName} — ${f.name}`,
                  }))),
                ]}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Type *</label>
              <CustomSelect
                value={facultyForm.memberType || 'faculty'}
                onChange={(val) => setFacultyForm(f => ({ ...f, memberType: val, title: '' }))}
                options={[
                  { value: 'faculty', label: 'Faculty', icon: 'fa-chalkboard-teacher' },
                  { value: 'staff', label: 'Staff', icon: 'fa-user-tie' },
                ]}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Full Name *</label>
              <input type="text" value={facultyForm.name} onChange={e => setFacultyForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Prof. Dr. Gias Uddin Hafiz" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Designation</label>
              <CustomSelect
                value={facultyForm.title}
                onChange={(val) => setFacultyForm(f => ({ ...f, title: val }))}
                placeholder="Select designation..."
                options={(facultyForm.memberType === 'staff' ? STAFF_DESIGNATIONS : TEACHER_TITLES).map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' }))}
              />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Short Form</label>
              <input type="text" value={facultyForm.shortForm} onChange={e => setFacultyForm(f => ({ ...f, shortForm: e.target.value.toUpperCase() }))} placeholder="e.g. GH" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Email</label>
              <input type="email" value={facultyForm.email} onChange={e => setFacultyForm(f => ({ ...f, email: e.target.value }))} placeholder="yourname@iiuc.ac.bd" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
            <div>
              <label className="text-[0.7rem] text-dark-text2 block mb-1">Phone</label>
              <input type="tel" value={facultyForm.phone} onChange={e => setFacultyForm(f => ({ ...f, phone: e.target.value }))} placeholder="+8801XXXXXXXXX" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis" />
            </div>
          </div>
          <button onClick={handleAddFaculty} disabled={facultySaving || !facultyForm.department || !facultyForm.name} className="mt-3 px-4 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold cursor-pointer hover:opacity-90 border-none disabled:opacity-50">
            {facultySaving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Adding...</> : <><i className="fas fa-plus mr-1"></i>Add Member</>}
          </button>
        </div>
      )}

      {/* Faculty List */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[0.82rem] font-semibold text-dark-text"><i className="fas fa-list text-dark-text3 mr-1"></i>All Faculty ({facultyList.length})</h4>
            <button onClick={() => loadFaculty()} className="text-[0.72rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer"><i className="fas fa-sync mr-1"></i>Refresh</button>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <CustomSelect
              value={facultyDeptFilter}
              onChange={setFacultyDeptFilter}
              placeholder="All Departments"
              className="max-w-[220px]"
              options={[
                { value: '', label: 'All Departments', icon: 'fa-building' },
                ...FACULTIES.flatMap(f => f.departments.map(d => ({
                  value: d.id,
                  label: d.shortName,
                  icon: 'fa-building',
                  group: `${f.shortName} — ${f.name}`,
                }))),
              ]}
            />
            <CustomSelect
              value={facultyTitleFilter}
              onChange={setFacultyTitleFilter}
              placeholder="All Designations"
              className="max-w-[200px]"
              options={[
                { value: '', label: 'All Designations', icon: 'fa-chalkboard-teacher' },
                ...availableTitles.map(t => ({ value: t, label: t, icon: 'fa-chalkboard-teacher' })),
              ]}
            />
            {(facultyDeptFilter || facultyTitleFilter) && (
              <button onClick={() => { setFacultyDeptFilter(''); setFacultyTitleFilter(''); }}
                className="text-[0.7rem] text-dark-text3 hover:text-red-400 bg-transparent border-none cursor-pointer">
                <i className="fas fa-times mr-0.5"></i>Clear
              </button>
            )}
          </div>
        </div>
        {facultyList.length === 0 ? (
          <p className="text-dark-text3 text-sm text-center py-8">No faculty members found</p>
        ) : (
          <div className="divide-y divide-dark-border">
            {Array.from(groupedFaculty.entries()).map(([dept, members]) => {
              const visibleCount = members.filter((m: any) => m.isVisible).length;
              return (
                <div key={dept}>
                  {/* Department Header */}
                  <div className="px-4 py-2.5 bg-dark-bg/80 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                      <i className="fas fa-building text-teal-400 text-[0.7rem]"></i>
                      <span className="text-[0.78rem] font-semibold text-dark-text">{dept}</span>
                      <span className="text-[0.65rem] text-dark-text3">({members.length})</span>
                      <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full ${visibleCount > 0 ? 'bg-green-500/15 text-green-400' : 'bg-dark-bg3 text-dark-text3'}`}>
                        {visibleCount}/{members.length} visible
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleBulkVisibility(dept, true)}
                        className="px-2 py-1 rounded text-[0.62rem] text-green-400 bg-green-500/10 hover:bg-green-500/20 border-none cursor-pointer">
                        <i className="fas fa-eye mr-0.5"></i>Show All
                      </button>
                      <button onClick={() => handleBulkVisibility(dept, false)}
                        className="px-2 py-1 rounded text-[0.62rem] text-dark-text3 bg-dark-bg3 hover:text-red-400 border-none cursor-pointer">
                        <i className="fas fa-eye-slash mr-0.5"></i>Hide All
                      </button>
                    </div>
                  </div>
                  {/* Members */}
                  {members.map((m: any) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-dark-bg/50 transition-colors group">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-qsis/20 to-accent/20 border border-dark-border flex items-center justify-center flex-shrink-0">
                        <span className="text-[0.68rem] font-bold text-qsis">{m.shortForm || m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.82rem] font-medium text-dark-text truncate">{m.name}</span>
                          {m.title && <span className="text-[0.65rem] text-qsis">{m.title}</span>}
                          {m.memberType === 'staff' && <span className="text-[0.6rem] px-1 py-0.5 rounded bg-orange-500/15 text-orange-400">Staff</span>}
                        </div>
                        <p className="text-[0.7rem] text-dark-text3">{m.email ? `${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}</p>
                      </div>
                      <button onClick={() => handleToggleVisibility(m.id, m.isVisible)}
                        className={`px-2 py-1 rounded text-[0.62rem] font-semibold cursor-pointer border transition-all ${
                          m.isVisible
                            ? 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25'
                            : 'bg-dark-bg3 text-dark-text3 border-dark-border hover:text-dark-text'
                        }`} title={m.isVisible ? 'Visible publicly — click to hide' : 'Hidden — click to show publicly'}>
                        <i className={`fas ${m.isVisible ? 'fa-eye' : 'fa-eye-slash'} mr-0.5`}></i>
                        {m.isVisible ? 'Public' : 'Hidden'}
                      </button>
                      <button onClick={() => handleDeleteFaculty(m.id, m.name)} className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-[0.65rem] cursor-pointer hover:bg-red-500/20 border-none opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
