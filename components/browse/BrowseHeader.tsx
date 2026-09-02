'use client';

import { config } from '@/lib/config';
import { FACULTIES } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';

interface BrowseHeaderProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchSemester: string;
  setSearchSemester: (s: string) => void;
  fileTypeFilter: string;
  setFileTypeFilter: (f: string) => void;
  searchYear: string;
  setSearchYear: (y: string) => void;
  availableYears: string[];
  loading: boolean;
  error: string | null;
  view: string;
  currentDept: string | null;
  currentSem: string | null;
  currentCourseCode: string | null;
  currentCourseTitle: string | null;
  currentMidFinal: string | null;
  currentCat: string | null;
  goBack: () => void;
  navigateToDepartment: (id: string) => void;
  navigateToSemester: (id: string) => void;
  navigateToCourse: (code: string, title: string) => void;
  navigateToMidFinal: (mf: string) => void;
  navigateToCategory: (cat: string) => void;
  canCreateFolder?: boolean;
  canUpload?: boolean;
  onUpload?: () => void;
  onCreateFolder?: () => void;
  uploading?: boolean;
}

export default function BrowseHeader({
  searchQuery, setSearchQuery,
  searchSemester, setSearchSemester,
  fileTypeFilter, setFileTypeFilter,
  searchYear, setSearchYear,
  availableYears,
  loading, error, view,
  currentDept, currentSem, currentCourseCode, currentCourseTitle, currentMidFinal, currentCat,
  goBack, navigateToDepartment, navigateToSemester, navigateToCourse, navigateToMidFinal, navigateToCategory,
  canCreateFolder, canUpload, onUpload, onCreateFolder, uploading,
}: BrowseHeaderProps) {
  const isSearching = !!(searchQuery || fileTypeFilter || searchYear || searchSemester);
  const crumbs: { label: string; onClick: () => void }[] = [];

  if (!isSearching) {
    if (currentDept) {
      const deptLabel = FACULTIES.flatMap(f => f.departments).find(d => d.id === currentDept)?.shortName || currentDept;
      crumbs.push({ label: deptLabel, onClick: () => navigateToDepartment(currentDept) });
    }
    if (currentSem) {
      const semLabel = config.semesters.find(s => s.id === currentSem)?.label || currentSem;
      crumbs.push({ label: semLabel, onClick: () => navigateToSemester(currentSem) });
    }
    if (currentCourseCode) {
      crumbs.push({ label: currentCourseCode, onClick: () => navigateToCourse(currentCourseCode, currentCourseTitle || '') });
    }
    if (currentMidFinal) {
      crumbs.push({ label: currentMidFinal, onClick: () => navigateToMidFinal(currentMidFinal) });
    }
    if (currentCat) {
      const catLabel = config.categories[currentCat as keyof typeof config.categories]?.label || currentCat;
      crumbs.push({ label: catLabel, onClick: () => navigateToCategory(currentCat) });
    }
  }

  return (
    <>
      {/* Search & Filter Bar */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-1 mb-3">
        <div className="flex items-center gap-2.5 bg-dark-bg border border-dark-border rounded-lg px-3.5">
          <i className="fas fa-search text-dark-text2"></i>
          <input
            type="text"
            placeholder="Search files, courses, semesters..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-dark-text py-2.5 text-[0.9rem] outline-none placeholder:text-dark-text2"
          />
          {searchQuery && (
            <button className="text-dark-text2 hover:text-dark-text cursor-pointer bg-transparent border-none text-[0.85rem] transition-colors" onClick={() => setSearchQuery('')} title="Clear search">
              <i className="fas fa-times-circle"></i>
            </button>
          )}
        </div>
        <div className="flex gap-2 p-2 flex-wrap">
          <CustomSelect
            value={searchSemester}
            onChange={setSearchSemester}
            placeholder="All Semesters"
            options={[
              { value: '', label: 'All Semesters' },
              ...config.semesters.map(s => ({ value: s.id, label: s.label })),
              { value: 'related-kitabs', label: 'Related Kitabs' },
              { value: config.relatedSourcesFolder, label: 'Related Sources' },
            ]}
          />
          <CustomSelect
            value={fileTypeFilter}
            onChange={setFileTypeFilter}
            placeholder="All Types"
            options={[
              { value: '', label: 'All Types' },
              { value: 'pdf', label: 'PDF', icon: 'fa-file-pdf' },
              { value: 'image', label: 'Image', icon: 'fa-file-image' },
              { value: 'doc', label: 'Document', icon: 'fa-file-word' },
              { value: 'sheet', label: 'Sheet (XLS)', icon: 'fa-file-excel' },
              { value: 'ppt', label: 'Presentation', icon: 'fa-file-powerpoint' },
            ]}
          />
          <CustomSelect
            value={searchYear}
            onChange={setSearchYear}
            placeholder="All Years"
            searchable
            options={[
              { value: '', label: 'All Years' },
              ...availableYears.map(y => ({ value: y, label: y, icon: 'fa-calendar' })),
            ]}
          />
        </div>
      </div>

      {/* Action bar: Back + Breadcrumb + New Folder + Upload */}
      {!isSearching && view !== 'departments' && (
        <div className="flex items-center gap-2 mb-3">
          {/* Back button */}
          <button
            onClick={goBack}
            className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:bg-dark-bg2 transition-colors shrink-0"
          >
            <i className="fas fa-arrow-left"></i> <span className="hidden sm:inline">Back</span>
          </button>

          {/* Breadcrumb path */}
          {crumbs.length > 0 && (
            <div className="flex items-center gap-1 text-[0.75rem] text-dark-text2 min-w-0 overflow-hidden">
              {crumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <i className="fas fa-chevron-right text-[0.5rem] text-dark-text3"></i>}
                  <button
                    onClick={crumb.onClick}
                    className={`bg-transparent border-none cursor-pointer text-[0.75rem] font-medium transition-colors truncate max-w-[120px] sm:max-w-[200px] ${
                      i === crumbs.length - 1 ? 'text-dark-text' : 'text-dark-text2 hover:text-qsis'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Right side: New Folder + Upload */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {canCreateFolder && onCreateFolder && (
              <button
                onClick={onCreateFolder}
                className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:bg-dark-bg2 transition-colors"
              >
                <i className="fas fa-folder-plus"></i> <span className="hidden sm:inline">New Folder</span>
              </button>
            )}
            {canUpload && onUpload && (
              <button
                onClick={onUpload}
                disabled={uploading}
                className="inline-flex items-center gap-[6px] px-3 py-[5px] rounded-xl border border-dark-border bg-dark-bg3 text-dark-text cursor-pointer text-[0.75rem] font-semibold hover:bg-dark-bg2 transition-colors disabled:opacity-50"
              >
                <i className={`fas ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`}></i> <span className="hidden sm:inline">{uploading ? 'Uploading...' : 'Upload'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
