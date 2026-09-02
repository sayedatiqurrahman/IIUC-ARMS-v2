'use client';

import { config } from '@/lib/config';
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
  goHome: () => void;
  navigateToDepartment: (id: string) => void;
  navigateToSemester: (id: string) => void;
  navigateToCourse: (code: string, title: string) => void;
  navigateToMidFinal: (mf: string) => void;
  navigateToCategory: (cat: string) => void;
}

export default function BrowseHeader({
  searchQuery, setSearchQuery,
  searchSemester, setSearchSemester,
  fileTypeFilter, setFileTypeFilter,
  searchYear, setSearchYear,
  availableYears,
  loading, error, view,
  currentDept, currentSem, currentCourseCode, currentCourseTitle, currentMidFinal, currentCat,
}: BrowseHeaderProps) {
  return (
    <>
      {/* Search & Filter Bar */}
      <div className="bg-dark-bg2 border border-dark-border rounded-xl p-1 mb-5">
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

    </>
  );
}
