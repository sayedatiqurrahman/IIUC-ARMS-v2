'use client';

import { useRef, useState } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getFacultyIdForDepartment, isShariahDepartmentId } from '@/lib/departments';
import type { Profile } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { installGitHubApp } from '@/lib/github-install';
import CustomSelect from '@/components/CustomSelect';
import LinksEditor from './LinksEditor';
import FilePreview from './FilePreview';
import SubfolderPicker from './SubfolderPicker';
import type { CourseGroup, FileWithMeta } from './types';
import { renderMarkdown } from '@/lib/markdown';

interface UploadFormProps {
  session: any;
  profile: Profile;
  githubToken: string;
  setGithubToken: (t: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  semester: string;
  setSemester: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  courses: CourseGroup[];
  updateCourse: (id: number, patch: Partial<CourseGroup>) => void;
  removeCourse: (id: number) => void;
  addLink: (courseId: number, title: string, url: string) => void;
  removeLink: (courseId: number, linkIndex: number) => void;
  loadExistingLinks: (courseId: number, courseCode: string, courseTitle: string) => void;
  existingCourses: { code: string; title: string; totalFiles: number }[];
  courseOptions: { value: string; label: string; icon: string }[];
  createCourseFor: number | null;
  setCreateCourseFor: (v: number | null) => void;
  handleFilesForCourse: (courseId: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRefs: React.MutableRefObject<Record<number, HTMLInputElement | null>>;
  onOpenScanner: (courseId: number) => void;
  totalFiles: number;
  totalSizeMB: number;
  uploading: boolean;
  uploadProgress?: { percent: number; label: string } | null;
  uploadSteps?: string[];
  compressing?: string | null;
  result: { success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean; needsPAT?: boolean; merged?: boolean; direct?: boolean } | null;
  handleSubmit: () => void;
  patInputToken: string;
  setPatInputToken: (v: string) => void;
  patSaving: boolean;
  handleSavePat: () => void;
  mergeDialogCourseId: number | null;
  mergeImages: FileWithMeta[];
  mergeSession: string;
  mergeYear: string;
  mergeMerging: boolean;
  mergeOcr: boolean;
  setMergeOcr: (v: boolean) => void;
  handleMergeImages: (courseId: number) => void;
  dismissMerge: () => void;
  onAddMarkdown: (courseId: number, file: File) => void;
  isLoggedIn: boolean;
  sessionLoading: boolean;
  onLogin: () => void;
  onClose: () => void;
}

export default function UploadForm({
  session, profile, githubToken, setGithubToken,
  department, setDepartment, semester, setSemester,
  category, setCategory,
  courses, updateCourse, removeCourse,
  addLink, removeLink, loadExistingLinks,
  existingCourses, courseOptions,
  createCourseFor, setCreateCourseFor,
  handleFilesForCourse, fileInputRefs, onOpenScanner,
  totalFiles, totalSizeMB,
  uploading, uploadProgress, uploadSteps, result, compressing,
  handleSubmit,
  patInputToken, setPatInputToken, patSaving, handleSavePat,
  mergeDialogCourseId, mergeImages, mergeSession, mergeYear,
  mergeMerging, mergeOcr, setMergeOcr, handleMergeImages, dismissMerge,
  onAddMarkdown,
  isLoggedIn, sessionLoading, onLogin, onClose,
}: UploadFormProps) {
  const email = (session as any)?.user?.email || profile.email || '';
  const [chooserCourseId, setChooserCourseId] = useState<number | null>(null);
  const [mdCourseId, setMdCourseId] = useState<number | null>(null);
  const [mdContent, setMdContent] = useState('');
  const [mdFilename, setMdFilename] = useState('notes.md');
  const mdFileRef = useRef<HTMLInputElement>(null);

  const userDeptId = (() => {
    const deptVal = profile.department || '';
    if (!deptVal) return '';
    for (const f of FACULTIES) {
      for (const d of f.departments) {
        if (d.id === deptVal || d.name === deptVal) return d.id;
      }
    }
    return '';
  })();

  const userDeptName = (() => {
    if (!userDeptId) return '';
    for (const f of FACULTIES) {
      const d = f.departments.find(dd => dd.id === userDeptId);
      if (d) return `${d.shortName} — ${d.name}`;
    }
    return '';
  })();

  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const canUploadAnyDept = effectiveRole === 'admin';
  const isExamCategory = category === config.categories.notes.folder || category === config.categories.questions.folder;

  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [sharedMidFinal, setSharedMidFinal] = useState('');
  const deptRef = useRef<HTMLDivElement>(null);
  const semRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const courseBoxRefs = useRef<Record<number, HTMLDivElement | null>>({});

  function clearInvalid(key: string) {
    setInvalid(prev => (prev[key] ? { ...prev, [key]: false } : prev));
  }

  function handleSharedMidFinal(v: string) {
    setSharedMidFinal(v);
    // Sync to all courses
    for (const c of courses) {
      updateCourse(c.id, { midFinal: v });
      clearInvalid(`midFinal-${c.id}`);
    }
  }

  function focusInvalidField(errs: Record<string, boolean>): boolean {
    const order = ['department', 'semester', 'category', 'midFinal'];
    for (const c of courses) order.push(`course-${c.id}`, `examSession-${c.id}`);
    const first = order.find(k => errs[k]);
    if (!first) return false;

    const focusBox = (box: HTMLDivElement | null, selector?: string) => {
      if (!box) return;
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const target = selector ? box.querySelector(selector) : box;
      const btn = (target || box).querySelector('button');
      if (btn) btn.focus();
    };

    if (first === 'department') focusBox(deptRef.current);
    else if (first === 'semester') focusBox(semRef.current);
    else if (first === 'category') focusBox(catRef.current);
    else {
      const m = first.match(/^([a-z]+)-(\d+)$/);
      if (m) {
        const box = courseBoxRefs.current[parseInt(m[2])];
        if (first.startsWith('course-')) focusBox(box, '[data-course-select]');
        else focusBox(box);
      }
    }
    return true;
  }

  function handleSubmitClick() {
    if (uploading || compressing) return;
    const errs: Record<string, boolean> = {};
    if (!department) errs.department = true;
    if (!semester) errs.semester = true;
    if (!category) errs.category = true;
    if (isExamCategory && !sharedMidFinal) errs.midFinal = true;
    for (const c of courses) {
      if (c.files.length === 0 && c.links.length === 0) continue;
      if (!c.selectedCourseCode) errs[`course-${c.id}`] = true;
      if (category === config.categories.questions.folder && !c.examSession) errs[`examSession-${c.id}`] = true;
    }
    setInvalid(errs);
    if (Object.keys(errs).length > 0) {
      showToast('Please fill the highlighted required fields', 'error');
      focusInvalidField(errs);
      return;
    }
    handleSubmit();
  }

  function openMarkdownEditor(courseId: number) {
    setMdFilename(`${courses.find(c => c.id === courseId)?.selectedCourseCode || 'notes'}.md`);
    setMdContent('');
    setMdCourseId(courseId);
    setChooserCourseId(null);
  }

  async function handleMdBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      setMdContent(text);
      const lower = f.name.toLowerCase();
      setMdFilename(lower.endsWith('.md') || lower.endsWith('.markdown') ? f.name : `${f.name}.md`);
    } catch {}
    if (mdFileRef.current) mdFileRef.current.value = '';
  }

  function handleMdAdd() {
    if (mdCourseId === null) return;
    const name = mdFilename.trim() || 'notes.md';
    const lower = name.toLowerCase();
    const safeName = lower.endsWith('.md') || lower.endsWith('.markdown') ? name : `${name}.md`;
    const file = new File([mdContent], safeName, { type: 'text/markdown' });
    onAddMarkdown(mdCourseId, file);
    setMdCourseId(null);
    setMdContent('');
  }

  if (result?.success) {
    const autoMerged = result.direct || result.merged;
    const firstCourse = courses.find(c => c.selectedCourseCode);
    const browseParams = new URLSearchParams();
    if (department) browseParams.set('dept', department);
    if (semester) browseParams.set('sem', semester);
    if (firstCourse?.selectedCourseCode) browseParams.set('course', firstCourse.selectedCourseCode);
    if (firstCourse?.midFinal) browseParams.set('mf', firstCourse.midFinal);
    if (category) browseParams.set('cat', category);
    const browseUrl = `/?${browseParams.toString()}`;
    return (
      <div className="text-center py-8">
        <div className="mb-4">
          <i className={`fas ${autoMerged ? 'fa-check-circle text-green-500' : 'fa-clock text-amber-500'} text-2xl`}></i>
        </div>
        <h3 className="text-[1rem] font-bold mb-2">{autoMerged ? 'Uploaded Successfully!' : 'PR Created Successfully!'}</h3>
        <p className="text-[0.82rem] text-dark-text2 mb-4">
          {autoMerged
            ? result.direct
              ? 'Your files were committed to the repository instantly.'
              : 'Your files were merged into the repository.'
            : 'Your files are pending review.'}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <a href={browseUrl} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-qsis text-white font-semibold text-[0.85rem] hover:opacity-90 transition-opacity no-underline">
            <i className="fas fa-folder-open"></i> Visit your file directory
          </a>
          {result.prUrl && (
            <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text2 font-semibold text-[0.85rem] hover:border-qsis hover:text-qsis transition-all no-underline">
              <i className="fab fa-github"></i> {result.direct ? 'View Commit' : 'View Pull Request'}
            </a>
          )}
        </div>
        <button className="block mx-auto mt-3 px-4 py-2 text-qsis text-[0.82rem] font-semibold bg-transparent border-none cursor-pointer hover:underline" onClick={onClose}>Close</button>
      </div>
    );
  }

  if (!isLoggedIn) {
    if (sessionLoading) {
      return (
        <div className="text-center py-10">
          <div className="mb-4">
            <i className="fas fa-spinner fa-spin text-3xl text-qsis"></i>
          </div>
          <h3 className="text-[1rem] font-bold text-dark-text mb-2">Checking your session…</h3>
          <p className="text-[0.82rem] text-dark-text2">Warming up your profile, one moment please.</p>
        </div>
      );
    }
    return (
      <div className="text-center py-10">
        <div className="mb-4">
          <i className="fas fa-user-lock text-3xl text-dark-text3"></i>
        </div>
        <h3 className="text-[1rem] font-bold text-dark-text mb-2">Please Login First</h3>
        <p className="text-[0.82rem] text-dark-text2 mb-5 max-w-[320px] mx-auto">
          You need to be logged in to upload files and share resources with your classmates.
        </p>
        <button
          className="px-6 py-2.5 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.85rem] cursor-pointer hover:opacity-90 transition-opacity"
          onClick={onLogin}
        >
          <i className="fas fa-sign-in-alt mr-2"></i>Login / Sign Up
        </button>
        <button className="block mx-auto mt-3 px-4 py-2 text-dark-text3 text-[0.78rem] font-semibold bg-transparent border-none cursor-pointer hover:text-dark-text2" onClick={onClose}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Department, Semester & Category */}
      <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
           <div ref={deptRef}>
            <label className="text-[0.72rem] text-dark-text2 block mb-1">Department *</label>
            {canUploadAnyDept ? (
              <CustomSelect value={department} onChange={v => { setDepartment(v); setSemester(''); setCategory(''); clearInvalid('department'); clearInvalid('semester'); clearInvalid('category'); }} error={!!invalid.department} placeholder="Select..." options={[
                { value: '', label: 'Select...' },
                ...FACULTIES.flatMap(f => f.departments.map(d => ({ value: d.id, label: `${d.shortName} — ${d.name}`, icon: d.icon || 'fa-building', group: f.shortName })))
              ]} />
            ) : (
              <div className="w-full px-2.5 py-2 rounded-lg border border-qsis/30 bg-qsis/5 text-dark-text text-[0.82rem] flex items-center gap-1.5">
                <i className="fas fa-lock text-qsis text-[0.65rem]"></i>
                <span className="font-semibold text-qsis">{userDeptName || department}</span>
              </div>
            )}
            <p className="text-[0.6rem] text-dark-text3 mt-0.5">{canUploadAnyDept ? 'Admin — upload to any department' : 'Files upload to your department only'}</p>
          </div>
          <div ref={semRef}>
            <label className="text-[0.72rem] text-dark-text2 block mb-1">Semester *</label>
            <CustomSelect value={semester} onChange={v => { setSemester(v); setCategory(''); clearInvalid('semester'); clearInvalid('category'); }} error={!!invalid.semester} placeholder="Select..." className={!department ? 'opacity-50 pointer-events-none' : ''} options={[
              { value: '', label: 'Select...' },
              ...config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' })),
              { value: config.relatedSourcesFolder, label: 'Related Sources (Cross-Semester)', icon: 'fa-folder-open' },
              ...(isShariahDepartmentId(userDeptId) ? [{ value: config.relatedKitabsFolder, label: 'Related Kitabs (Shariah Faculty)', icon: 'fa-book' }] : []),
            ]} />
          </div>
          <div ref={catRef}>
            <label className="text-[0.72rem] text-dark-text2 block mb-1">Category *</label>
            <CustomSelect value={category} onChange={v => { setCategory(v); clearInvalid('category'); }} error={!!invalid.category} placeholder="Select..." className={!semester ? 'opacity-50 pointer-events-none' : ''} options={
              semester === config.relatedKitabsFolder
                ? Object.entries(config.relatedKitabsCategories).map(([key, cat]) => ({ value: key, label: cat.label, icon: 'fa-book' }))
                : semester === config.relatedSourcesFolder
                  ? [{ value: config.relatedSourcesFolder, label: 'Related Sources', icon: 'fa-folder-open' }]
                  : [
                      { value: '', label: 'Select...' },
                      { value: config.categories.notes.folder, label: config.categories.notes.label, icon: 'fa-sticky-note', group: 'Exam Categories (Mid/Final shared above)' },
                      { value: config.categories.questions.folder, label: config.categories.questions.label, icon: 'fa-question-circle', group: 'Exam Categories (Mid/Final shared above)' },
                      { value: config.categories.sheet.folder, label: config.categories.sheet.label, icon: 'fa-scroll', group: 'Root Categories' },
                      { value: config.categories.syllabus.folder, label: config.categories.syllabus.label, icon: 'fa-graduation-cap', group: 'Root Categories' },
                      { value: config.categories.other.folder, label: config.categories.other.label, icon: 'fa-folder', group: 'Root Categories' },
                    ]
            } />
          </div>
        </div>
      </div>

      {/* Mid/Final selector — shared across all courses (notes/previous only) */}
      {isExamCategory && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-dark-bg2 border border-dark-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1">
                <i className="fas fa-layer-group mr-1 text-amber-400"></i>Exam Section * <span className="text-dark-text3">(for all courses)</span>
              </label>
              <CustomSelect
                value={sharedMidFinal}
                onChange={handleSharedMidFinal}
                placeholder="Select..."
                options={[
                  { value: '', label: 'Select...' },
                  { value: 'Mid', label: 'Mid Term', icon: 'fa-hourglass-half' },
                  { value: 'Final', label: 'Final Term', icon: 'fa-check-double' },
                ]}
              />
            </div>
            {category === config.categories.questions.folder && (
              <div>
                <label className="text-[0.72rem] text-dark-text2 block mb-1">
                  <i className="fas fa-calendar mr-1 text-blue-400"></i>Exam Session * <span className="text-dark-text3">(per course)</span>
                </label>
                <p className="text-[0.65rem] text-dark-text3">Set per course below</p>
              </div>
            )}
          </div>
          {!sharedMidFinal && (
            <p className="mt-2 text-[0.68rem] text-amber-400"><i className="fas fa-exclamation-triangle mr-1"></i>Select exam section (Mid or Final) to continue</p>
          )}
        </div>
      )}

      {/* Course Groups */}
      {courses.map((course, idx) => {
        const selectedCourse = existingCourses.find(c => c.code === course.selectedCourseCode);
        const noCoursesAvailable = courseOptions.length === 0;
        const courseInvalid = !!invalid[`course-${course.id}`];
        const courseFolder = course.selectedCourseCode
          ? (course.selectedCourseTitle ? `${course.selectedCourseCode} - ${course.selectedCourseTitle}` : course.selectedCourseCode)
          : '';

        return (
        <div key={course.id} ref={el => { courseBoxRefs.current[course.id] = el; }} className={`bg-dark-bg3 border ${courseInvalid ? 'border-red-500' : 'border-dark-border'} rounded-xl p-4 mb-3`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[0.78rem] font-semibold text-qsis">
              <i className="fas fa-book mr-1.5"></i>Course {courses.length > 1 ? idx + 1 : ''}
            </span>
            {courses.length > 1 && (
              <button className="w-6 h-6 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.7rem] hover:bg-red-500/20" onClick={() => removeCourse(course.id)} title="Remove course">
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          {/* Course Selector */}
          {!noCoursesAvailable ? (
            <div className="mb-2">
              <label className="text-[0.72rem] text-dark-text2 block mb-1">Select Course *</label>
              <div className="grid grid-cols-[minmax(0,70%)_minmax(0,1fr)] gap-2 sm:flex">
                <div className="min-w-0 sm:flex-1" data-course-select>
                  <CustomSelect
                    value={course.selectedCourseCode}
                    onChange={v => {
                      const found = existingCourses.find(c => c.code === v);
                      updateCourse(course.id, { selectedCourseCode: v, selectedCourseTitle: found?.title || '', links: [] });
                      clearInvalid(`course-${course.id}`);
                      if (found) loadExistingLinks(course.id, v, found.title);
                    }}
                    error={courseInvalid}
                    placeholder={department && semester ? "Choose a course..." : "Select dept & semester first"}
                    searchable
                    className={!department || !semester ? 'opacity-50 pointer-events-none' : ''}
                    options={courseOptions}
                  />
                </div>
                <button
                  className="w-full sm:w-auto shrink-0 px-3 py-1.5 rounded-lg border border-qsis/40 bg-qsis/5 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/10 transition-colors flex items-center justify-center gap-1 whitespace-nowrap"
                  onClick={() => setCreateCourseFor(course.id)}
                  disabled={!department || !semester}
                  title="Create new course"
                >
                  <i className="fas fa-plus"></i> New
                </button>
              </div>
              {selectedCourse && (
                <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-qsis/5 border border-qsis/10">
                  <i className="fas fa-check-circle text-qsis text-[0.65rem]"></i>
                  <span className="text-[0.72rem] text-dark-text2">
                    <span className="font-mono font-bold text-qsis">{selectedCourse.code}</span>
                    <span className="mx-1">—</span>
                    <span>{selectedCourse.title}</span>
                    <span className="text-dark-text3 ml-1">({selectedCourse.totalFiles} files)</span>
                  </span>
                </div>
              )}
              {courseInvalid && (
                <p className="mt-1 text-[0.68rem] text-red-400"><i className="fas fa-exclamation-triangle mr-1"></i>Select a course or create one to continue</p>
              )}
            </div>
          ) : (
            <div className="mb-2 p-3 rounded-lg bg-dark-bg border border-qsis/30">
              <span className="text-[0.72rem] font-semibold text-dark-text block mb-1">
                <i className="fas fa-plus-circle text-qsis mr-1"></i>No course found — create one to upload
              </span>
              <p className="text-[0.68rem] text-dark-text3 mb-2">The course folder will be created on GitHub and will appear here and in Browse.</p>
              <button
                className="w-full py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90"
                onClick={() => setCreateCourseFor(course.id)}
              >
                <i className="fas fa-plus mr-1"></i>Create New Course
              </button>
            </div>
          )}

          {/* Exam Session (per course, for questions only) */}
          {isExamCategory && category === config.categories.questions.folder && (
            <div className="mb-2">
              <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Session *</label>
              <CustomSelect value={course.examSession} onChange={v => { updateCourse(course.id, { examSession: v }); clearInvalid(`examSession-${course.id}`); }} error={!!invalid[`examSession-${course.id}`]} options={[
                { value: 'Both', label: 'Both (Autumn + Spring)', icon: 'fa-layer-group' },
                { value: 'Autumn', label: 'Autumn', icon: 'fa-leaf' },
                { value: 'Spring', label: 'Spring', icon: 'fa-seedling' },
              ]} />
            </div>
          )}

          {/* Path Preview */}
          {courseFolder && department && semester && category && (
            <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-qsis/5 border border-qsis/10">
              <span className="text-[0.62rem] text-qsis font-mono">
                <i className="fas fa-folder mr-1"></i>
                {semester === config.relatedKitabsFolder
                  ? `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${courseFolder}/`
                  : semester === config.relatedSourcesFolder
                    ? `${getFacultyIdForDepartment(department) || department}/${config.relatedSourcesFolder}/${courseFolder}/`
                    : isExamCategory && course.examSession
                      ? `${department}/${semester}/${courseFolder}/${sharedMidFinal ? sharedMidFinal + '/' : ''}${category}/${course.customFolder ? course.customFolder + '/' : ''}${course.examSession}/...`
                      : `${department}/${semester}/${courseFolder}/${sharedMidFinal ? sharedMidFinal + '/' : ''}${category}/${course.customFolder ? course.customFolder + '/' : ''}`
                }
              </span>
            </div>
          )}

          {/* Subfolder Picker */}
          {course.selectedCourseCode && category && (
            <div className="mb-3">
              <label className="text-[0.72rem] text-dark-text2 block mb-1"><i className="fas fa-folder-tree mr-1 text-dark-text3"></i>Subfolder (optional)</label>
              <SubfolderPicker
                department={department}
                semester={semester}
                category={category}
                courseCode={course.selectedCourseCode}
                courseTitle={course.selectedCourseTitle}
                midFinal={course.midFinal}
                value={course.customFolder}
                onChange={v => updateCourse(course.id, { customFolder: v })}
              />
            </div>
          )}

          {/* Shared Links */}
          {course.selectedCourseCode && (
            <LinksEditor
              links={course.links}
              onAdd={(title, url) => addLink(course.id, title, url)}
              onRemove={(idx) => removeLink(course.id, idx)}
              semesterLabel={config.semesters.find(s => s.id === semester)?.label || semester}
              authorName={profile.name || (session as any)?.user?.name || ''}
            />
          )}

          {/* File Upload Area */}
          {course.selectedCourseCode ? (
            <>
              <input ref={el => { fileInputRefs.current[course.id] = el; }} type="file" multiple className="hidden" accept={category === config.categories.notes.folder ? '.pdf,.doc,.docx,.ppt,.pptx' : category === config.categories.questions.folder ? '.pdf,.jpg,.jpeg,.png,.gif,.webp' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.csv'} onChange={e => handleFilesForCourse(course.id, e)} />
              <div className="relative">
                <div className="border-2 border-dashed border-dark-border rounded-lg p-4 text-center cursor-pointer hover:border-qsis transition-colors" onClick={() => !compressing && setChooserCourseId(course.id)}>
                  <i className="fas fa-cloud-upload-alt text-xl text-dark-text2 mb-1 block"></i>
                  <p className="text-[0.78rem] text-dark-text2">Add files for this course</p>
                  <p className="text-[0.65rem] text-dark-text2">
                    {category === config.categories.questions.folder
                      ? 'Select 2-3 images together (auto-merged into one PDF) or 1 PDF file'
                      : isExamCategory
                        ? '1 file only'
                        : `Max 5 files, ${config.maxSingleFileUploadMB}MB each`}
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-qsis/15 text-qsis text-[0.72rem] font-semibold">
                    <i className="fas fa-camera"></i> Upload from device or scan with camera
                  </span>
                </div>

              </div>
              {chooserCourseId === course.id && (
                <>
                  <div className="fixed inset-0 z-[250] bg-black/60" onClick={() => setChooserCourseId(null)} />
                  <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[260] w-[calc(100%-3rem)] max-w-[320px] rounded-2xl border border-dark-border bg-dark-bg2 shadow-2xl overflow-hidden">
                    <div className="px-4 pt-4 pb-3">
                      <h4 className="text-[0.95rem] font-bold text-dark-text flex items-center gap-2">
                        <i className="fas fa-cloud-upload-alt text-qsis"></i> Add Files
                      </h4>
                      <p className="text-[0.72rem] text-dark-text3 mt-0.5">Choose how you want to add files</p>
                    </div>
                    <div className="px-4 pb-2 flex flex-col gap-2.5">
                      <button
                        className="w-full flex items-center gap-3 px-4 py-4 text-left rounded-xl border-2 border-qsis/40 bg-qsis/10 hover:bg-qsis/20 hover:border-qsis active:scale-[0.98] transition-all cursor-pointer"
                        onClick={() => { if (compressing) return; fileInputRefs.current[course.id]?.click(); setChooserCourseId(null); }}
                      >
                        <div className="w-10 h-10 rounded-lg bg-qsis/20 flex items-center justify-center shrink-0">
                          <i className="fas fa-folder-open text-lg text-qsis"></i>
                        </div>
                        <span className="flex flex-col min-w-0">
                          <span className="text-[0.82rem] font-bold text-dark-text">Files</span>
                          <span className="text-[0.65rem] text-dark-text2">Upload from device or cloud storage</span>
                        </span>
                        <i className="fas fa-chevron-right ml-auto text-qsis/70"></i>
                      </button>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-4 text-left rounded-xl border-2 border-qsis/40 bg-qsis/10 hover:bg-qsis/20 hover:border-qsis active:scale-[0.98] transition-all cursor-pointer"
                        onClick={() => { if (compressing) return; onOpenScanner(course.id); setChooserCourseId(null); }}
                      >
                        <div className="w-10 h-10 rounded-lg bg-qsis/20 flex items-center justify-center shrink-0">
                          <i className="fas fa-camera text-lg text-qsis"></i>
                        </div>
                        <span className="flex flex-col min-w-0">
                          <span className="text-[0.82rem] font-bold text-dark-text">Doc Scanner</span>
                          <span className="text-[0.65rem] text-dark-text2">Detect, auto-crop &amp; straighten pages</span>
                        </span>
                        <i className="fas fa-chevron-right ml-auto text-qsis/70"></i>
                      </button>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-4 text-left rounded-xl border-2 border-qsis/40 bg-qsis/10 hover:bg-qsis/20 hover:border-qsis active:scale-[0.98] transition-all cursor-pointer"
                        onClick={() => { if (compressing) return; openMarkdownEditor(course.id); }}
                      >
                        <div className="w-10 h-10 rounded-lg bg-qsis/20 flex items-center justify-center shrink-0">
                          <i className="fas fa-file-lines text-lg text-qsis"></i>
                        </div>
                        <span className="flex flex-col min-w-0">
                          <span className="text-[0.82rem] font-bold text-dark-text">Markdown (.md)</span>
                          <span className="text-[0.65rem] text-dark-text2">Write notes &amp; preview them live</span>
                        </span>
                        <i className="fas fa-chevron-right ml-auto text-qsis/70"></i>
                      </button>
                    </div>
                    <button
                      className="w-full mt-2 py-3.5 border-t border-dark-border bg-dark-bg3/60 hover:bg-dark-bg3 text-dark-text3 hover:text-dark-text text-[0.78rem] font-semibold cursor-pointer transition-colors"
                      onClick={() => setChooserCourseId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {mdCourseId === course.id && (
                <>
                  <div className="fixed inset-0 z-[250] bg-black/60" onClick={() => { setMdCourseId(null); setMdContent(''); }} />
                  <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[260] w-[calc(100%-2rem)] max-w-[440px] max-h-[88vh] rounded-2xl border border-dark-border bg-dark-bg2 shadow-2xl overflow-hidden flex flex-col">
                    <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-[0.95rem] font-bold text-dark-text flex items-center gap-2">
                          <i className="fas fa-file-lines text-qsis"></i> Markdown (.md)
                        </h4>
                        <p className="text-[0.7rem] text-dark-text3 mt-0.5">Write or browse a .md file — preview updates live</p>
                      </div>
                      <button className="w-8 h-8 rounded-lg bg-dark-bg3 border border-dark-border flex items-center justify-center text-dark-text2 cursor-pointer hover:text-dark-text" onClick={() => { setMdCourseId(null); setMdContent(''); }}>
                        <i className="fas fa-times text-sm"></i>
                      </button>
                    </div>
                    <div className="px-4 pb-3 flex flex-col gap-2.5 overflow-y-auto">
                      <div className="flex items-center gap-2">
                        <input ref={mdFileRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleMdBrowse} />
                        <button className="px-3 py-1.5 rounded-lg border border-qsis/40 bg-qsis/5 text-qsis text-[0.72rem] font-semibold cursor-pointer hover:bg-qsis/10 flex items-center gap-1.5" onClick={() => mdFileRef.current?.click()}>
                          <i className="fas fa-folder-open"></i> Browse .md
                        </button>
                        <input
                          className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none focus:border-qsis font-mono"
                          placeholder="filename.md"
                          value={mdFilename}
                          onChange={e => setMdFilename(e.target.value)}
                        />
                      </div>
                      <textarea
                        className="w-full h-44 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text text-[0.78rem] font-mono outline-none focus:border-qsis resize-y leading-relaxed"
                        placeholder={'# Heading\n\nWrite **Markdown** here…'}
                        value={mdContent}
                        onChange={e => setMdContent(e.target.value)}
                      />
                      <div>
                        <p className="text-[0.62rem] text-dark-text3 mb-1 flex items-center gap-1"><i className="fas fa-eye"></i> Live preview</p>
                        <div className="md-content max-h-44 overflow-y-auto px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem]" dangerouslySetInnerHTML={{ __html: mdContent ? renderMarkdown(mdContent) : '<p class="text-dark-text3">Nothing to preview yet</p>' }} />
                      </div>
                    </div>
                    <div className="px-4 py-3 border-t border-dark-border flex gap-2">
                      <button className="flex-1 py-2.5 rounded-lg bg-gradient-to-br from-qsis to-qsis-dark text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90" onClick={handleMdAdd}>
                        <i className="fas fa-plus mr-1"></i> Add to course
                      </button>
                      <button className="px-4 py-2.5 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.78rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2" onClick={() => { setMdCourseId(null); setMdContent(''); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="border-2 border-dashed border-dark-border/60 rounded-lg p-4 text-center">
              <i className="fas fa-info-circle text-xl text-dark-text3 mb-1 block"></i>
              <p className="text-[0.78rem] text-dark-text2 mb-2">Select a course to add files</p>
              {!noCoursesAvailable && (
                <div className="text-left" data-course-select>
                  <CustomSelect
                    value={course.selectedCourseCode}
                    onChange={v => {
                      const found = existingCourses.find(c => c.code === v);
                      updateCourse(course.id, { selectedCourseCode: v, selectedCourseTitle: found?.title || '', links: [] });
                      clearInvalid(`course-${course.id}`);
                      if (found) loadExistingLinks(course.id, v, found.title);
                    }}
                    error={courseInvalid}
                    placeholder={department && semester ? "Choose a course..." : "Select dept & semester first"}
                    searchable
                    className={!department || !semester ? 'opacity-50 pointer-events-none' : ''}
                    options={courseOptions}
                  />
                </div>
              )}
            </div>
          )}

          <FilePreview
            files={course.files}
            courseId={course.id}
            courseCode={course.selectedCourseCode || ''}
            category={category}
            isNotes={category === config.categories.notes.folder}
            isQuestions={category === config.categories.questions.folder}
            onRemoveFile={(cId, fi) => {
              const c = courses.find(cc => cc.id === cId);
              if (!c) return;
              updateCourse(cId, { files: c.files.filter((_, i) => i !== fi) });
            }}
            onUpdateFile={(cId, newFiles) => updateCourse(cId, { files: newFiles })}
            mergeDialogCourseId={mergeDialogCourseId}
            mergeImages={mergeImages}
            mergeSession={mergeSession}
            mergeYear={mergeYear}
            mergeMerging={mergeMerging}
            mergeOcr={mergeOcr}
            setMergeOcr={setMergeOcr}
            onMerge={handleMergeImages}
            onDismissMerge={dismissMerge}
            profile={profile}
            email={email}
          />
        </div>
        );
      })}

      {/* Add another course */}
      {/* Summary */}
      <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between text-[0.78rem]">
          <span className="text-dark-text2">
            <i className="fas fa-file mr-1"></i>{totalFiles} file{totalFiles !== 1 ? 's' : ''}
            {courses.reduce((sum, c) => sum + c.links.length, 0) > 0 && (
              <>, <i className="fas fa-link mr-1"></i>{courses.reduce((sum, c) => sum + c.links.length, 0)} link{courses.reduce((sum, c) => sum + c.links.length, 0) !== 1 ? 's' : ''}</>
            )}
            {' '}across {courses.filter(c => c.files.length > 0 || c.links.length > 0).length} course{courses.filter(c => c.files.length > 0 || c.links.length > 0).length !== 1 ? 's' : ''}
          </span>
          <span className={`font-semibold ${totalSizeMB > config.maxUploadSizeMB - 10 ? 'text-red-400' : 'text-qsis'}`}>
            {totalSizeMB.toFixed(1)} MB total
          </span>
        </div>
        <div className="w-full h-1.5 bg-dark-bg3 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-gradient-to-r from-qsis to-accent rounded-full transition-all" style={{ width: `${Math.min((totalSizeMB / config.maxUploadSizeMB) * 100, 100)}%` }}></div>
        </div>
      </div>

      {/* Auto-filled info */}
      <div className="bg-dark-bg3 border border-dark-border rounded-xl p-3 mb-4">
        <p className="text-[0.72rem] text-dark-text2 mb-2">Your info will be auto-included in the PR:</p>
        <div className="flex flex-wrap gap-2">
          {profile.universityId && <span className="px-2 py-1 rounded bg-dark-bg text-[0.7rem] font-mono">{profile.universityId}</span>}
          <span className="px-2 py-1 rounded bg-dark-bg text-[0.7rem] font-mono">{session?.user?.email || ''}</span>
          <span className="px-2 py-1 rounded bg-dark-bg text-[0.7rem] font-mono">{profile.name || (session as any)?.user?.name || ''}</span>
        </div>
      </div>

      {result?.error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
          <i className="fas fa-exclamation-circle mr-2"></i>{result.error}
          {(result.tokenExpired || result?.needsPAT) && (
            <div className="mt-3 space-y-2.5">
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,user:follow&description=IIUC-ARMS"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.82rem] cursor-pointer text-center hover:opacity-90 transition-opacity"
              >
                <i className="fas fa-sync-alt mr-2"></i>Regenerate Token
              </a>
              <p className="text-[0.6rem] text-dark-text3 text-center">
                Opens GitHub tokens → click <strong>IIUC-ARMS</strong> → Regenerate → set <strong>No expiration</strong> → copy & paste below
              </p>
              <p className="text-[0.7rem] text-dark-text2">Paste your new token:</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="ghp_xxxx or github_pat_xxxx"
                  className="flex-1 px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] font-mono outline-none focus:border-qsis"
                  value={patInputToken}
                  onChange={e => setPatInputToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSavePat()}
                />
                <button
                  className="px-3 py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                  onClick={handleSavePat}
                  disabled={patSaving || !patInputToken.trim()}
                >
                  {patSaving ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check"></i>}
                </button>
              </div>
              <button className="w-full py-2 rounded-lg bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.78rem] cursor-pointer hover:text-qsis hover:border-qsis transition-all" onClick={async () => {
                showToast('Opening GitHub...', 'info');
                const installResult = await installGitHubApp();
                if (installResult.error || !installResult.token) {
                  showToast(installResult.error || 'Connection cancelled', 'error');
                  return;
                }
                setGithubToken(installResult.token);
                fetch('/api/profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    githubLogin: installResult.login,
                    githubToken: installResult.token,
                    githubInstallationId: installResult.installationId,
                    githubAvatar: installResult.avatarUrl,
                  }),
                }).catch(() => {});
                showToast(`Connected as @${installResult.login}!`, 'success');
                window.location.reload();
              }}>
                <i className="fab fa-github mr-2"></i>Or continue with GitHub
              </button>
            </div>
          )}
        </div>
      )}

      <button
        className="w-full py-3 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleSubmitClick}
        disabled={uploading || !!compressing}
      >
        {(uploading || !!compressing) ? (
          <span className="flex flex-col items-center gap-1.5 w-full">
            <span className="flex items-center justify-center gap-2 w-full">
              <i className="fas fa-spinner fa-spin"></i>
              <span className="truncate">{uploading ? (uploadProgress?.label || 'Uploading...') : (compressing || 'Compressing...')}</span>
              {uploading && uploadProgress && uploadProgress.percent > 0 && (
                <span className="font-bold tabular-nums">{Math.round(uploadProgress.percent)}%</span>
              )}
            </span>
            {(uploading && uploadProgress && uploadProgress.percent > 0) && (
              <span className="w-full max-w-[340px] h-2 bg-white/20 rounded-full overflow-hidden">
                <span className="block h-full bg-white rounded-full transition-all" style={{ width: `${Math.max(3, uploadProgress.percent)}%` }}></span>
              </span>
            )}
          </span>
        ) : (
          <><i className="fas fa-paper-plane mr-2"></i>Submit {totalFiles} File{totalFiles !== 1 ? 's' : ''} for Review</>
        )}
      </button>
      {uploading && uploadSteps && uploadSteps.length > 0 && (
        <div className="mt-2 bg-dark-bg2/50 rounded-lg p-2 max-h-24 overflow-y-auto border border-dark-border/50">
          {uploadSteps.slice(-6).map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[0.65rem] text-dark-text3 leading-tight py-0.5">
              <i className="fas fa-check-circle text-qsis/70 shrink-0"></i>
              <span className="truncate">{s}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-[0.65rem] text-qsis leading-tight py-0.5 font-medium">
            <i className="fas fa-spinner fa-spin shrink-0"></i>
            <span className="truncate">{uploadProgress?.label || 'Working…'}</span>
          </div>
        </div>
      )}
      {uploading && (
        <p className="text-[0.68rem] text-dark-text3 text-center mt-2">
          <i className="fas fa-lock mr-1 text-qsis"></i> Upload in progress — close this dialog and your upload will continue in the background. Only one upload can run at a time.
        </p>
      )}
    </>
  );
}
