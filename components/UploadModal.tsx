'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getFacultyIdForDepartment } from '@/lib/departments';
import type { Profile } from '@/lib/store';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { installGitHubApp } from '@/lib/github-install';
import CustomSelect from '@/components/CustomSelect';
import { jsPDF } from 'jspdf';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_SEASON = CURRENT_MONTH >= 4 && CURRENT_MONTH <= 9 ? 'Spring' : 'Autumn';

function isPdf(name: string) { return name.toLowerCase().endsWith('.pdf'); }
function isImage(name: string) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(name); }
function isDocsOnly(name: string) { return /\.(pdf|doc|docx|ppt|pptx)$/i.test(name); }

interface FileWithMeta {
  file: File;
  year: string;
  yearRange: string;
}

interface Link {
  title: string;
  url: string;
}

interface CourseGroup {
  id: number;
  selectedCourseCode: string;
  selectedCourseTitle: string;
  files: FileWithMeta[];
  examSession: string;
  midFinal: string;
  links: Link[];
}

interface UploadModalProps {
  session: any;
  status: string;
  profile: Profile;
  onLogin: () => void;
  onClose: () => void;
}

const SESSION_OPTIONS = [
  { value: 'Autumn', label: `Autumn ${CURRENT_YEAR}`, icon: 'fa-leaf' },
  { value: 'Spring', label: `Spring ${CURRENT_YEAR}`, icon: 'fa-seedling' },
];

function extractYearFromTitle(title: string): number {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1]) : 0;
}

function sortLinksByYear(links: { title: string; url: string }[]): { title: string; url: string }[] {
  return [...links].sort((a, b) => extractYearFromTitle(b.title) - extractYearFromTitle(a.title));
}

function LinksEditor({ links, onAdd, onRemove, semesterLabel, authorName }: { links: Link[]; onAdd: (title: string, url: string) => void; onRemove: (idx: number) => void; semesterLabel?: string; authorName?: string }) {
  const [session, setSession] = useState(CURRENT_SEASON);
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [url, setUrl] = useState('');
  const [expanded, setExpanded] = useState(false);

  const autoTitle = useMemo(() => {
    if (!session || !year || !semesterLabel || !authorName) return '';
    return `${session} ${year} - ${semesterLabel} - ${authorName}`;
  }, [session, year, semesterLabel, authorName]);

  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const y = CURRENT_YEAR - i;
    return { value: String(y), label: String(y), icon: 'fa-calendar' };
  }), []);

  const sortedLinks = useMemo(() => sortLinksByYear(links), [links]);

  function handleAdd() {
    if (!autoTitle.trim() || !url.trim()) return;
    onAdd(autoTitle.trim(), url);
    setUrl('');
  }

  return (
    <div className="mb-3 bg-dark-bg3 border border-dark-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-transparent border-none cursor-pointer hover:bg-dark-bg2 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[0.75rem] font-semibold text-dark-text2 flex items-center gap-1.5">
          <i className="fas fa-link text-qsis"></i> Shared Links
          {links.length > 0 && <span className="text-[0.65rem] text-dark-text3">({links.length})</span>}
        </span>
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-[0.6rem] text-dark-text3`}></i>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-dark-border">
          {sortedLinks.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2 mb-2">
              {sortedLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border group">
                  <i className="fas fa-external-link-alt text-[0.6rem] text-dark-text3"></i>
                  <span className="text-[0.75rem] text-dark-text font-semibold truncate flex-1">{link.title}</span>
                  <span className="text-[0.6rem] text-dark-text3 truncate max-w-[150px]">{link.url.replace(/^https?:\/\//, '').slice(0, 40)}</span>
                  <button className="w-4 h-4 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.55rem] hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onRemove(i)}>
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
          {autoTitle && (
            <div className="px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border mb-2">
              <span className="text-[0.72rem] text-dark-text2">Title: </span>
              <span className="text-[0.72rem] text-qsis font-semibold">{autoTitle}</span>
            </div>
          )}
          <div className="flex gap-2 mt-1">
            <div className="w-[110px]">
              <CustomSelect value={session} onChange={setSession} placeholder="Session" options={SESSION_OPTIONS} />
            </div>
            <div className="w-[90px]">
              <CustomSelect value={year} onChange={setYear} placeholder="Year" options={yearOptions} />
            </div>
            <input
              type="url"
              placeholder="https://..."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none focus:border-qsis"
            />
            <button
              className="px-2.5 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
              onClick={handleAdd}
              disabled={!autoTitle.trim() || !url.trim()}
            >
              <i className="fas fa-plus"></i>
            </button>
          </div>
          <p className="text-[0.6rem] text-dark-text3 mt-1.5">Title: Autumn 2026 - 6th Semester - Author</p>
        </div>
      )}
    </div>
  );
}

export default function UploadModal({ session, status, profile, onLogin, onClose }: UploadModalProps) {
  const githubToken = useAppStore(s => s.githubToken);
  const setGithubToken = useAppStore(s => s.setGithubToken);
  const onboardData = useAppStore(s => s.onboardingData);
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);

  const email = (session as any)?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const canUploadAnyDept = effectiveRole === 'admin';

  const userDeptId = (() => {
    const deptVal = profile.department || onboardData?.department || '';
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

  const [department, setDepartment] = useState(userDeptId);
  const [semester, setSemester] = useState(profile.semester || '');
  const [category, setCategory] = useState('');
  const [courses, setCourses] = useState<CourseGroup[]>([{ id: 1, selectedCourseCode: '', selectedCourseTitle: '', files: [], examSession: '', midFinal: '', links: [] }]);
  const [uploading, setUploading] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [showNewCourse, setShowNewCourse] = useState<Record<number, boolean>>({});
  const [newCourseCode, setNewCourseCode] = useState<Record<number, string>>({});
  const [newCourseTitle, setNewCourseTitle] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean; needsPAT?: boolean } | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Merge images into PDF state
  const [mergeDialogCourseId, setMergeDialogCourseId] = useState<number | null>(null);
  const [mergeImages, setMergeImages] = useState<FileWithMeta[]>([]);
  const [mergeSession, setMergeSession] = useState('');
  const [mergeYear, setMergeYear] = useState('');
  const [mergeMerging, setMergeMerging] = useState(false);

  const hasGitHub = !!(session as any)?.accessToken || !!profile.githubLogin || !!githubToken || !!profile.githubToken;

  // PAT prompt skip tracking
  const [patDismissed, setPatDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pat_skip_dismissed') === '1';
  });
  const [patInputToken, setPatInputToken] = useState('');
  const [patSaving, setPatSaving] = useState(false);

  const isLoggedIn = !!(session as any)?.user;
  const showPatPrompt = isLoggedIn && !hasGitHub && !patDismissed;

  // Get tree length to force memo recomputation when tree refreshes
  const treeLength = useAppStore(s => s.tree.length);

  // Get existing courses from GitHub tree
  const existingCourses = useMemo(() => {
    if (!department || !semester || semester === config.relatedKitabsFolder || semester === config.relatedSourcesFolder) return [];
    return getSemesterCourses(semester, department);
  }, [department, semester, getSemesterCourses, treeLength]);

  // All known courses from all semesters for title auto-fill
  const allKnownCourses = useMemo(() => {
    if (!department) return [];
    const map = new Map<string, string>();
    for (const s of config.semesters) {
      const courses = getSemesterCourses(s.id, department);
      for (const c of courses) {
        if (!map.has(c.code)) map.set(c.code, c.title);
      }
    }
    return Array.from(map.entries()).map(([code, title]) => ({ code, title }));
  }, [department, getSemesterCourses, treeLength]);

  // Auto-fill from deep link params (dept, sem, course, mf, cat)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const dept = p.get('dept');
    const sem = p.get('sem');
    const course = p.get('course');
    const mf = p.get('mf');
    const cat = p.get('cat');
    if (dept) setDepartment(dept);
    if (sem) setSemester(sem);
    if (cat) {
      const catKey = Object.keys(config.categories).find(
        k => config.categories[k as keyof typeof config.categories].label.toLowerCase() === cat.toLowerCase() || k === cat
      );
      if (catKey) setCategory(catKey);
    }
    if (course) {
      const code = course.toUpperCase();
      const found = allKnownCourses.find(c => c.code.toUpperCase() === code);
      setCourses(prev => [{
        ...prev[0],
        selectedCourseCode: code,
        selectedCourseTitle: found?.title || '',
        midFinal: mf || '',
      }]);
    }
  }, [allKnownCourses]);

  const totalFiles = courses.reduce((sum, c) => sum + c.files.length, 0);
  const totalSizeMB = courses.reduce((sum, c) => sum + c.files.reduce((s, f) => s + f.file.size, 0), 0) / (1024 * 1024);

  function updateCourse(id: number, patch: Partial<CourseGroup>) {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function addLink(courseId: number, title: string, url: string) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    const finalUrl = url.startsWith('http') ? url : `https://${url}`;
    updateCourse(courseId, { links: [...course.links, { title: title.trim(), url: finalUrl }] });
  }

  function removeLink(courseId: number, linkIndex: number) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    updateCourse(courseId, { links: course.links.filter((_, i) => i !== linkIndex) });
  }

  async function loadExistingLinks(courseId: number, courseCode: string, courseTitle: string) {
    if (!courseCode || !department || !semester) return;
    const folder = `${department}/${semester}/${courseCode} - ${courseTitle}`;
    try {
      const res = await fetch(`/api/github/readme?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      if (data.content) {
        const links: Link[] = [];
        const lines = data.content.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*[-*]\s*\[(.+?)\]\((.+?)\)/);
          if (match) links.push({ title: match[1], url: match[2] });
        }
        if (links.length > 0) {
          updateCourse(courseId, { links });
        }
      }
    } catch {}
  }

  function linksToReadmeContent(links: Link[]): string {
    if (links.length === 0) return '';
    return links.map(l => `- [${l.title}](${l.url})`).join('\n') + '\n';
  }

  function handleSkipPat() {
    setPatDismissed(true);
    localStorage.setItem('pat_skip_dismissed', '1');
  }

  async function handleSavePat() {
    if (!patInputToken.trim()) return;
    setPatSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: patInputToken.trim() }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        showToast('GitHub connected! Your identity will show in contributor list.', 'success');
        setPatDismissed(true);
        localStorage.setItem('pat_skip_dismissed', '1');
        window.location.reload();
      } else {
        showToast(data.error || 'Invalid token', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setPatSaving(false);
    }
  }

  function addCourse() {
    if (courses.length >= 5) return;
    const newId = Math.max(0, ...courses.map(c => c.id)) + 1;
    setCourses(prev => [...prev, { id: newId, selectedCourseCode: '', selectedCourseTitle: '', files: [], examSession: '', midFinal: '', links: [] }]);
  }

  function removeCourse(id: number) {
    if (courses.length <= 1) return;
    setCourses(prev => prev.filter(c => c.id !== id));
  }

  function handleFilesForCourse(courseId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const course = courses.find(c => c.id === courseId);
    const currentCourseFiles = course?.files.length || 0;
    const isNotes = category === config.categories.notes.folder;
    const isQuestions = category === config.categories.questions.folder;

    let maxFiles = 5;
    if (isNotes) maxFiles = 1;
    else if (isQuestions) {
      const hasPdf = (course?.files || []).some(f => isPdf(f.file.name)) || selected.some(f => isPdf(f.name));
      maxFiles = hasPdf ? 1 : 5;
    }

    if (currentCourseFiles + selected.length > maxFiles) {
      if (isNotes) alert('Only 1 file allowed for Notes.');
      else if (isQuestions && maxFiles === 1) alert('PDF already selected. Only 1 file allowed for Previous Questions with PDF.');
      else alert(`Max ${maxFiles} files per course.`);
      return;
    }

    let filtered = selected;
    if (isNotes) {
      filtered = selected.filter(f => isDocsOnly(f.name));
      if (filtered.length < selected.length) alert('Notes only accept PDF, DOC/DOCX, PPT/PPTX files.');
    } else if (isQuestions) {
      filtered = selected.filter(f => isPdf(f.name) || isImage(f.name));
      if (filtered.length < selected.length) alert('Previous Questions only accept PDF or image files.');
    }

    const valid = filtered.filter(f => f.size <= config.maxUploadSizeMB * 1024 * 1024);
    if (valid.length < filtered.length) {
      alert(`${filtered.length - valid.length} file(s) exceeded ${config.maxUploadSizeMB}MB and were skipped.`);
    }

    const newTotal = totalFiles - currentCourseFiles + valid.length;
    if (newTotal > 10) {
      alert(`Max 10 files total across all courses. You can add ${10 - totalFiles + currentCourseFiles} more.`);
      return;
    }

    const newTotalSize = (totalSizeMB * 1024 * 1024 - (course?.files.reduce((s, f) => s + f.file.size, 0) || 0) + valid.reduce((s, f) => s + f.size, 0)) / (1024 * 1024);
    if (newTotalSize > 50) {
      alert('Total upload size cannot exceed 50MB.');
      return;
    }

    const newFiles: FileWithMeta[] = valid.map(f => {
      if (isNotes) {
        return { file: f, year: String(CURRENT_YEAR), yearRange: '' };
      }
      if (isQuestions) {
        if (isPdf(f.name)) {
          return { file: f, year: '', yearRange: `${CURRENT_YEAR}-${CURRENT_YEAR}` };
        }
        return { file: f, year: String(CURRENT_YEAR), yearRange: '' };
      }
      return { file: f, year: '', yearRange: '' };
    });

    const patch: Partial<CourseGroup> = { files: [...(course?.files || []), ...newFiles] };
    if ((isNotes || isQuestions) && !course?.examSession) {
      if (isQuestions && valid.length > 0 && isPdf(valid[0].name)) {
        patch.examSession = 'Both';
      } else {
        patch.examSession = CURRENT_SEASON;
      }
    }
    updateCourse(courseId, patch);
    if (fileInputRefs.current[courseId]) fileInputRefs.current[courseId]!.value = '';

    if (isQuestions && valid.some(f => isImage(f.name))) {
      setTimeout(() => checkForMergeableImages(courseId, newFiles), 100);
    }
  }

  function removeFileFromCourse(courseId: number, fileIndex: number) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    updateCourse(courseId, { files: course.files.filter((_, i) => i !== fileIndex) });
  }

  // Detect same-session+year images and offer merge
  function checkForMergeableImages(courseId: number, newFiles: FileWithMeta[]) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    const isQuestions = category === config.categories.questions.folder;
    if (!isQuestions) return;

    const allFiles = [...course.files, ...newFiles];
    const images = allFiles.filter(f => isImage(f.file.name) && f.year);
    if (images.length < 2) return;

    const groups = new Map<string, FileWithMeta[]>();
    for (const img of images) {
      const session = course.examSession || CURRENT_SEASON;
      const key = `${session}-${img.year}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(img);
    }

    for (const entry of Array.from(groups.entries())) {
      const [key, group] = entry;
      if (group.length >= 2) {
        const [session, year] = key.split('-');
        setMergeSession(session);
        setMergeYear(year);
        setMergeImages(group);
        setMergeDialogCourseId(courseId);
        return;
      }
    }
  }

  async function handleMergeImages(courseId: number) {
    if (mergeImages.length < 2) return;
    setMergeMerging(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      for (let i = 0; i < mergeImages.length; i++) {
        const imgFile = mergeImages[i].file;
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(imgFile);
        });

        const img = await new Promise<HTMLImageElement>((resolve) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.src = dataUrl;
        });

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 5;
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;
        const ratio = Math.min(availW / img.width, availH / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;

        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
      }

      const authorName = profile?.name || email.split('@')[0] || 'Unknown';
      const mergedName = `${mergeSession} ${mergeYear} - ${authorName}.pdf`;
      const blob = pdf.output('blob');
      const mergedFile = new File([blob], mergedName, { type: 'application/pdf' });

      const course = courses.find(c => c.id === courseId);
      if (!course) return;

      const nonImageFiles = course.files.filter(f => !mergeImages.some(m => m.file === f.file));
      const mergedMeta: FileWithMeta = { file: mergedFile, year: '', yearRange: `${mergeYear}-${mergeYear}` };

      updateCourse(courseId, {
        files: [...nonImageFiles, mergedMeta],
        examSession: mergeSession || course.examSession,
      });

      showToast(`Merged ${mergeImages.length} images into ${mergedName}`, 'success');
    } catch (err: any) {
      showToast('Failed to merge images: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setMergeMerging(false);
      setMergeDialogCourseId(null);
      setMergeImages([]);
    }
  }

  function dismissMerge() {
    setMergeDialogCourseId(null);
    setMergeImages([]);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return <i className="fas fa-file-image" style={{color:'#34d399'}}></i>;
    if (ext === 'pdf') return <i className="fas fa-file-pdf" style={{color:'#ef4444'}}></i>;
    if (['doc','docx'].includes(ext)) return <i className="fas fa-file-word" style={{color:'#3b82f6'}}></i>;
    if (['xls','xlsx','csv'].includes(ext)) return <i className="fas fa-file-excel" style={{color:'#22c55e'}}></i>;
    if (['ppt','pptx'].includes(ext)) return <i className="fas fa-file-powerpoint" style={{color:'#f97316'}}></i>;
    return <i className="fas fa-file" style={{color:'#94a3b8'}}></i>;
  }

  function canSubmit(): boolean {
    if (!department || !semester || !category) return false;
    const isExamSpecific = category === config.categories.notes.folder || category === config.categories.questions.folder;
    return courses.some(c => {
      const hasCourse = c.selectedCourseCode || (showNewCourse[c.id] && newCourseCode[c.id]?.trim());
      if (!hasCourse) return false;
      const hasContent = c.files.length > 0 || c.links.length > 0;
      if (!hasContent) return false;
      if (isExamSpecific && !c.midFinal) return false;
      if (category === config.categories.notes.folder && !c.examSession) return false;
      return true;
    });
  }

  async function handleCreateCourse(courseId: number) {
    const code = newCourseCode[courseId]?.trim();
    const title = newCourseTitle[courseId]?.trim();
    if (!code) {
      showToast('Course code is required', 'error');
      return;
    }
    setCreatingCourse(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, semester, code, title }),
      });
      const data = await res.json();
      if (data.success || res.status === 209) {
        updateCourse(courseId, { selectedCourseCode: code, selectedCourseTitle: title || code });
        setShowNewCourse(prev => ({ ...prev, [courseId]: false }));
        setNewCourseCode(prev => ({ ...prev, [courseId]: '' }));
        setNewCourseTitle(prev => ({ ...prev, [courseId]: '' }));
        showToast(`Course ${code} created!`, 'success');
        // Refresh tree
        useAppStore.getState().invalidateTreeCache();
        useAppStore.getState().loadTree(session?.accessToken || '');
      } else {
        showToast(data.error || 'Failed to create course', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setCreatingCourse(false);
    }
  }

  async function handleSubmit() {
    if (!department || !semester || !category) {
      alert('Please select department, semester, and category.');
      return;
    }

    const effectiveCategory = semester === config.relatedSourcesFolder ? config.relatedSourcesFolder : category;

    const validCourses = courses.filter(c => {
      const hasCourse = c.selectedCourseCode || (showNewCourse[c.id] && newCourseCode[c.id]?.trim());
      return hasCourse && (c.files.length > 0 || c.links.length > 0);
    });
    if (validCourses.length === 0) {
      alert('At least one course must be selected with files.');
      return;
    }

    const token = githubToken || profile.githubToken || (session as any)?.accessToken || '';
    if (!token) {
      setResult({ success: false, error: 'GitHub not connected. Please connect GitHub first.', tokenExpired: true });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const allFiles: { path: string; content: string }[] = [];

      for (const course of validCourses) {
        const courseCode = course.selectedCourseCode;
        const courseTitle = course.selectedCourseTitle || courseCode;
        const courseFolder = `${courseCode} - ${courseTitle}`;

        for (const fileMeta of course.files) {
          const base64 = await fileMeta.file.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
          });

          let filePath: string;
          const isExamSpecific = category === config.categories.notes.folder || category === config.categories.questions.folder;
          const midFinalPart = (isExamSpecific && course.midFinal) ? `/${course.midFinal}` : '';
          const authorName = profile?.name || email.split('@')[0] || 'Unknown';
          const ext = fileMeta.file.name.split('.').pop() || 'pdf';

          if (semester === config.relatedKitabsFolder) {
            const folderName = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
            filePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${folderName}/${fileMeta.file.name}`;
          } else if (semester === config.relatedSourcesFolder) {
            const facId = getFacultyIdForDepartment(department) || department;
            const folderName = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
            filePath = `${facId}/${config.relatedSourcesFolder}/${folderName}/${fileMeta.file.name}`;
          } else if (isExamSpecific && course.examSession) {
            const yearPart = isPdf(fileMeta.file.name) ? (fileMeta.yearRange || '') : (fileMeta.year || '');
            const renamedFile = `${course.examSession} ${CURRENT_YEAR} - ${authorName}.${ext}`;
            filePath = yearPart
              ? `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${yearPart}/${renamedFile}`
              : `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${renamedFile}`;
          } else {
            filePath = `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${fileMeta.file.name}`;
          }

          allFiles.push({ path: filePath, content: base64 });
        }

        // Include README.md if links exist
        if (course.links.length > 0) {
          const readmeContent = linksToReadmeContent(course.links);
          const readmeBase64 = btoa(unescape(encodeURIComponent(readmeContent)));
          let readmePath: string;
          if (semester === config.relatedKitabsFolder) {
            const folderName = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
            readmePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${folderName}/README.md`;
          } else if (semester === config.relatedSourcesFolder) {
            const facId = getFacultyIdForDepartment(department) || department;
            const folderName = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
            readmePath = `${facId}/${config.relatedSourcesFolder}/${folderName}/README.md`;
          } else {
            readmePath = `${department}/${semester}/${courseFolder}/README.md`;
          }
          allFiles.push({ path: readmePath, content: readmeBase64 });
        }
      }

      const courseList = validCourses.map(c => `${c.selectedCourseCode} - ${c.selectedCourseTitle || c.selectedCourseCode}`).join(', ');
      const message = `Add ${courseList} (${category}) — ${semester}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      const res = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: allFiles, message, githubToken: token }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();

      if (data.success) {
        setResult({ success: true, prUrl: data.pr?.url });
        setCourses([{ id: 1, selectedCourseCode: '', selectedCourseTitle: '', files: [], examSession: '', midFinal: '', links: [] }]);
        useAppStore.getState().invalidateTreeCache();
        useAppStore.getState().loadTree(session?.accessToken || '');
      } else {
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'AUTH_REQUIRED') {
          setResult({ success: false, error: data.error, tokenExpired: true });
        } else if (data.code === 'NEEDS_PAT' || data.code === 'TOKEN_NO_ACCESS') {
          setResult({ success: false, error: data.error, needsPAT: true });
        } else {
          setResult({ success: false, error: data.error || 'Upload failed' });
        }
      }
    } catch (err: any) {
      const msg = err?.name === 'AbortError'
        ? 'Upload timed out. The file may be too large or the server is slow. Try fewer files.'
        : err.message || 'Network error';
      const isAuthErr = /token expired|reconnect|401|403/i.test(msg);
      setResult({ success: false, error: msg, tokenExpired: isAuthErr });
    } finally {
      setUploading(false);
    }
  }

  const courseOptions = useMemo(() => {
    return existingCourses.map(c => ({
      value: c.code,
      label: `${c.code} — ${c.title}`,
      icon: 'fa-book',
    }));
  }, [existingCourses]);

  const isExamCategory = category === config.categories.notes.folder || category === config.categories.questions.folder;

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-dark-bg2 w-full max-w-[540px] max-h-[90vh] rounded-2xl border border-dark-border overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <div>
            <h2 className="text-[1.05rem] font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-cloud-upload-alt text-qsis"></i> Upload Files
            </h2>
            <p className="text-[0.72rem] text-dark-text3 mt-0.5">Select a course and upload files</p>
          </div>
          <button className="w-8 h-8 rounded-lg bg-dark-bg3 border border-dark-border flex items-center justify-center text-dark-text2 cursor-pointer hover:text-dark-text" onClick={onClose}>
            <i className="fas fa-times text-sm"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {result?.success ? (
            <div className="text-center py-8">
              <div className="mb-4">
                <i className="fas fa-check-circle text-2xl text-green-500"></i>
              </div>
              <h3 className="text-[1rem] font-bold mb-2">PR Created Successfully!</h3>
              <p className="text-[0.82rem] text-dark-text2 mb-4">Your files are pending review.</p>
              <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-qsis text-white font-semibold text-[0.85rem] hover:opacity-90 transition-opacity">
                <i className="fab fa-github"></i> View Pull Request
              </a>
              <button className="block mx-auto mt-3 px-4 py-2 text-qsis text-[0.82rem] font-semibold bg-transparent border-none cursor-pointer hover:underline" onClick={onClose}>Close</button>
            </div>
          ) : !isLoggedIn ? (
            /* ── NOT LOGGED IN ── */
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
          ) : showPatPrompt ? (
            /* ── GITHUB PAT PROMPT ── */
            <div className="py-6">
              <div className="text-center mb-5">
                <div className="mb-3">
                  <i className="fab fa-github text-3xl text-dark-text2"></i>
                </div>
                <h3 className="text-[1rem] font-bold text-dark-text mb-1">Connect GitHub</h3>
                <p className="text-[0.82rem] text-dark-text2 max-w-[360px] mx-auto">
                  Add a <strong>Personal Access Token (PAT)</strong> to appear in the contributor list.
                </p>
              </div>

              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
                <label className="text-[0.72rem] text-dark-text2 block mb-1.5">GitHub Personal Access Token</label>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxx"
                  className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] font-mono outline-none focus:border-qsis mb-3"
                  value={patInputToken}
                  onChange={e => setPatInputToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSavePat()}
                />
                <button
                  className="w-full py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                  onClick={handleSavePat}
                  disabled={patSaving || !patInputToken.trim()}
                >
                  {patSaving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fab fa-github mr-2"></i>Connect & Save</>}
                </button>

                <div className="mt-3 p-2.5 rounded-lg bg-dark-bg border border-dark-border">
                  <p className="text-[0.68rem] text-dark-text2 font-semibold mb-1.5"><i className="fas fa-info-circle text-qsis mr-1"></i>How to create a PAT:</p>
                  <ol className="text-[0.62rem] text-dark-text3 space-y-1 list-decimal list-inside">
                    <li>Go to <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline">github.com/settings/tokens/new</a></li>
                    <li>Name it <strong className="text-dark-text2">iiuc-arms</strong> (or any name)</li>
                    <li>Select <strong className="text-dark-text2">No expiration</strong> (or 90 days)</li>
                    <li>Check <strong className="text-dark-text2">repo</strong> scope (full control)</li>
                    <li>Click <strong className="text-dark-text2">Generate token</strong> and paste above</li>
                  </ol>
                </div>
              </div>

              <button
                className="w-full py-2.5 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-[0.82rem] font-semibold cursor-pointer hover:bg-dark-bg2 transition-colors"
                onClick={handleSkipPat}
              >
                Continue without PAT
              </button>
              <p className="text-[0.62rem] text-dark-text3 mt-2 text-center">
                <i className="fas fa-info-circle mr-1"></i>
                You can still upload files, but your name won&apos;t appear in the contributor list.
              </p>
            </div>
          ) : (
            <>
              {/* Department, Semester & Category */}
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
                <div className="grid grid-cols-3 gap-3">
                   <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Department *</label>
                    {canUploadAnyDept ? (
                      <CustomSelect value={department} onChange={v => { setDepartment(v); setSemester(''); setCategory(''); }} placeholder="Select..." options={[
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
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Semester *</label>
                    <CustomSelect value={semester} onChange={v => { setSemester(v); setCategory(''); }} placeholder="Select..." className={!department ? 'opacity-50 pointer-events-none' : ''} options={[
                      { value: '', label: 'Select...' },
                      ...config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' })),
                      { value: config.relatedSourcesFolder, label: 'Related Sources (Cross-Semester)', icon: 'fa-folder-open' },
                      ...(['qsis', 'dawah', 'hadith'].includes(userDeptId) ? [{ value: config.relatedKitabsFolder, label: 'Related Kitabs (Shariah Faculty)', icon: 'fa-book' }] : []),
                    ]} />
                  </div>
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Category *</label>
                    <CustomSelect value={category} onChange={setCategory} placeholder="Select..." className={!semester ? 'opacity-50 pointer-events-none' : ''} options={
                      semester === config.relatedKitabsFolder
                        ? Object.entries(config.relatedKitabsCategories).map(([key, cat]) => ({ value: key, label: cat.label, icon: 'fa-book' }))
                        : semester === config.relatedSourcesFolder
                          ? [{ value: config.relatedSourcesFolder, label: 'Related Sources', icon: 'fa-folder-open' }]
                          : [
                              { value: '', label: 'Select...' },
                              { value: config.categories.notes.folder, label: config.categories.notes.label, icon: 'fa-sticky-note', group: 'Exam Sections (inside Mid/Final)' },
                              { value: config.categories.questions.folder, label: config.categories.questions.label, icon: 'fa-question-circle', group: 'Exam Sections (inside Mid/Final)' },
                              { value: config.categories.sheet.folder, label: config.categories.sheet.label, icon: 'fa-scroll', group: 'Root Categories' },
                              { value: config.categories.syllabus.folder, label: config.categories.syllabus.label, icon: 'fa-graduation-cap', group: 'Root Categories' },
                              { value: config.categories.other.folder, label: config.categories.other.label, icon: 'fa-folder', group: 'Root Categories' },
                            ]
                    } />
                  </div>
                </div>
              </div>

              {/* Course Groups */}
              {courses.map((course, idx) => {
                const selectedCourse = existingCourses.find(c => c.code === course.selectedCourseCode);
                const isCreatingNew = !!showNewCourse[course.id];
                const courseFolder = course.selectedCourseCode
                  ? (course.selectedCourseTitle ? `${course.selectedCourseCode} - ${course.selectedCourseTitle}` : course.selectedCourseCode)
                  : '';

                return (
                <div key={course.id} className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-3">
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
                  {!isCreatingNew ? (
                    <div className="mb-2">
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">Select Course *</label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <CustomSelect
                            value={course.selectedCourseCode}
                            onChange={v => {
                              const found = existingCourses.find(c => c.code === v);
                              updateCourse(course.id, { selectedCourseCode: v, selectedCourseTitle: found?.title || '', links: [] });
                              if (found) loadExistingLinks(course.id, v, found.title);
                            }}
                            placeholder={department && semester ? "Choose a course..." : "Select dept & semester first"}
                            searchable
                            className={!department || !semester ? 'opacity-50 pointer-events-none' : ''}
                            options={courseOptions}
                          />
                        </div>
                        <button
                          className="px-3 py-1.5 rounded-lg border border-qsis/40 bg-qsis/5 text-qsis text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis/10 transition-colors flex items-center gap-1 whitespace-nowrap"
                          onClick={() => setShowNewCourse(prev => ({ ...prev, [course.id]: true }))}
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
                    </div>
                  ) : (
                    <div className="mb-2 p-3 rounded-lg bg-dark-bg border border-qsis/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[0.72rem] font-semibold text-dark-text">Create New Course</span>
                        <button className="text-dark-text3 hover:text-dark-text text-[0.7rem] cursor-pointer bg-transparent border-none" onClick={() => setShowNewCourse(prev => ({ ...prev, [course.id]: false }))}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          placeholder="Course Code (e.g. FSC-1208)"
                          className="px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
                          value={newCourseCode[course.id] || ''}
                          onChange={e => {
                            const code = e.target.value;
                            setNewCourseCode(prev => ({ ...prev, [course.id]: code }));
                            const match = allKnownCourses.find(c => c.code.toUpperCase() === code.trim().toUpperCase());
                            if (match) {
                              setNewCourseTitle(prev => ({ ...prev, [course.id]: match.title }));
                            }
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Course Title (optional)"
                          className="px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis"
                          value={newCourseTitle[course.id] || ''}
                          onChange={e => setNewCourseTitle(prev => ({ ...prev, [course.id]: e.target.value }))}
                        />
                      </div>
                      <button
                        className="w-full py-2 rounded-lg bg-qsis text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                        onClick={() => handleCreateCourse(course.id)}
                        disabled={creatingCourse || !newCourseCode[course.id]?.trim()}
                      >
                        {creatingCourse ? <><i className="fas fa-spinner fa-spin mr-1"></i>Creating...</> : <><i className="fas fa-plus mr-1"></i>Create & Select</>}
                      </button>
                    </div>
                  )}

                  {/* Exam Section & Session */}
                  {isExamCategory && (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Section *</label>
                        <CustomSelect value={course.midFinal} onChange={v => updateCourse(course.id, { midFinal: v })} placeholder="Select..." options={[
                          { value: '', label: 'Select...' },
                          { value: 'Mid', label: 'Mid', icon: 'fa-hourglass-half' },
                          { value: 'Final', label: 'Final', icon: 'fa-check-double' },
                        ]} />
                      </div>
                      <div>
                        <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Session *</label>
                        {category === config.categories.questions.folder ? (
                          <CustomSelect value={course.examSession} onChange={v => updateCourse(course.id, { examSession: v })} options={[
                            { value: 'Both', label: `Both (Autumn + Spring ${CURRENT_YEAR})`, icon: 'fa-layer-group' },
                            { value: 'Autumn', label: `Autumn ${CURRENT_YEAR}`, icon: 'fa-leaf' },
                            { value: 'Spring', label: `Spring ${CURRENT_YEAR}`, icon: 'fa-seedling' },
                          ]} />
                        ) : (
                          <CustomSelect value={course.examSession} onChange={v => updateCourse(course.id, { examSession: v })} placeholder="Select..." options={[
                            { value: '', label: 'Select...' },
                            { value: 'Autumn', label: `Autumn ${CURRENT_YEAR}`, icon: 'fa-leaf' },
                            { value: 'Spring', label: `Spring ${CURRENT_YEAR}`, icon: 'fa-seedling' },
                          ]} />
                        )}
                      </div>
                    </div>
                  )}

                  {isExamCategory && !course.midFinal && (
                    <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <p className="text-[0.68rem] text-orange-400"><i className="fas fa-exclamation-triangle mr-1"></i>Select exam section (Mid or Final).</p>
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
                              ? `${department}/${semester}/${courseFolder}/${course.midFinal ? course.midFinal + '/' : ''}${category}/${course.examSession}/...`
                              : `${department}/${semester}/${courseFolder}/${course.midFinal ? course.midFinal + '/' : ''}${category}/`
                        }
                      </span>
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
                  <input ref={el => { fileInputRefs.current[course.id] = el; }} type="file" multiple className="hidden" accept={category === config.categories.notes.folder ? '.pdf,.doc,.docx,.ppt,.pptx' : category === config.categories.questions.folder ? '.pdf,.jpg,.jpeg,.png,.gif,.webp' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.csv'} onChange={e => handleFilesForCourse(course.id, e)} />
                  <div className="border-2 border-dashed border-dark-border rounded-lg p-4 text-center cursor-pointer hover:border-qsis transition-colors" onClick={() => fileInputRefs.current[course.id]?.click()}>
                    <i className="fas fa-cloud-upload-alt text-xl text-dark-text2 mb-1 block"></i>
                    <p className="text-[0.78rem] text-dark-text2">Add files for this course</p>
                    <p className="text-[0.65rem] text-dark-text2">{isExamCategory ? '1 file only' : `Max 5 files, ${config.maxUploadSizeMB}MB each`}</p>
                  </div>

                  {course.files.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {course.files.map((fileMeta, fi) => {
                        const isNotes = category === config.categories.notes.folder;
                        const isQuestions = category === config.categories.questions.folder;
                        const fileIsPdf = isPdf(fileMeta.file.name);
                        return (
                          <div key={fi} className="p-2 rounded-lg bg-dark-bg border border-dark-border">
                            <div className="flex items-center gap-2">
                              <div className="text-[0.95rem] flex-shrink-0">{getFileIcon(fileMeta.file.name)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[0.75rem] font-semibold truncate">{fileMeta.file.name}</div>
                              </div>
                              <div className="text-[0.62rem] text-dark-text2 flex-shrink-0">{formatSize(fileMeta.file.size)}</div>
                              <button className="w-5 h-5 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.65rem] hover:bg-red-500/20" onClick={() => removeFileFromCourse(course.id, fi)}>
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                            {(isNotes || isQuestions) && (
                              <div className="mt-1.5">
                                {isQuestions && fileIsPdf ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[0.62rem] text-dark-text3 block mb-0.5">From Year</label>
                                      <input
                                        type="number"
                                        min={CURRENT_YEAR - 10}
                                        max={CURRENT_YEAR}
                                        className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={fileMeta.yearRange.split('-')[0] || ''}
                                        onChange={e => {
                                          const toYear = fileMeta.yearRange.split('-')[1] || String(CURRENT_YEAR);
                                          const newFiles = [...course.files];
                                          newFiles[fi] = { ...newFiles[fi], yearRange: `${e.target.value}-${toYear}` };
                                          updateCourse(course.id, { files: newFiles });
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[0.62rem] text-dark-text3 block mb-0.5">To Year</label>
                                      <input
                                        type="number"
                                        min={CURRENT_YEAR - 10}
                                        max={CURRENT_YEAR + 5}
                                        className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={fileMeta.yearRange.split('-')[1] || ''}
                                        onChange={e => {
                                          const fromYear = fileMeta.yearRange.split('-')[0] || String(CURRENT_YEAR);
                                          const newFiles = [...course.files];
                                          newFiles[fi] = { ...newFiles[fi], yearRange: `${fromYear}-${e.target.value}` };
                                          updateCourse(course.id, { files: newFiles });
                                        }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <label className="text-[0.62rem] text-dark-text3 block mb-0.5">Year</label>
                                    <input
                                      type="number"
                                      min={CURRENT_YEAR - 10}
                                      max={CURRENT_YEAR + 5}
                                      className="w-full px-2 py-1 rounded border border-dark-border bg-dark-bg3 text-dark-text text-[0.72rem] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      value={fileMeta.year}
                                      onChange={e => {
                                        const newFiles = [...course.files];
                                        newFiles[fi] = { ...newFiles[fi], year: e.target.value };
                                        updateCourse(course.id, { files: newFiles });
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Merge images dialog */}
                  {mergeDialogCourseId === course.id && mergeImages.length >= 2 && (
                    <div className="mt-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30">
                      <div className="flex items-start gap-2 mb-2">
                        <i className="fas fa-images text-blue-400 mt-0.5"></i>
                        <div className="flex-1">
                          <p className="text-[0.78rem] font-semibold text-blue-300">Merge {mergeImages.length} images into one PDF?</p>
                          <p className="text-[0.68rem] text-dark-text3 mt-0.5">
                            These images appear to be parts of the same question paper ({mergeSession} {mergeYear}).
                          </p>
                          <p className="text-[0.65rem] text-dark-text3 mt-0.5">
                            Will be saved as: <span className="text-blue-300 font-semibold">{mergeSession} {mergeYear} - {profile?.name || email.split('@')[0] || 'Unknown'}.pdf</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-5">
                        <button
                          className="px-3 py-1 rounded-lg bg-blue-500 text-white text-[0.72rem] font-semibold border-none cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
                          onClick={() => handleMergeImages(course.id)}
                          disabled={mergeMerging}
                        >
                          {mergeMerging ? <><i className="fas fa-spinner fa-spin mr-1"></i>Merging...</> : <><i className="fas fa-compress-alt mr-1"></i>Merge into PDF</>}
                        </button>
                        <button
                          className="px-3 py-1 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.72rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2 transition-colors"
                          onClick={dismissMerge}
                          disabled={mergeMerging}
                        >
                          Keep Separate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}

              {/* Add another course */}
              {courses.length < 5 && (
                <button className="w-full py-3 rounded-xl border-2 border-dashed border-qsis/40 bg-qsis/5 text-qsis text-[0.85rem] font-bold cursor-pointer hover:border-qsis hover:bg-qsis/10 transition-all mb-4" onClick={addCourse}>
                  <i className="fas fa-plus-circle mr-2 text-lg"></i> Add Another Course
                </button>
              )}

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
                  <span className={`font-semibold ${totalSizeMB > 40 ? 'text-red-400' : 'text-qsis'}`}>
                    {totalSizeMB.toFixed(1)} / 50 MB
                  </span>
                </div>
                <div className="w-full h-1.5 bg-dark-bg3 rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-gradient-to-r from-qsis to-accent rounded-full transition-all" style={{ width: `${Math.min((totalSizeMB / 50) * 100, 100)}%` }}></div>
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
                  {result.tokenExpired && (
                    <button className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.82rem] cursor-pointer" onClick={async () => {
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
                      <i className="fab fa-github mr-2"></i>Connect with GitHub
                    </button>
                  )}
                  {result?.needsPAT && (
                    <div className="mt-3">
                      <p className="text-[0.7rem] text-dark-text2 mb-2">Paste your PAT to retry:</p>
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
                      <p className="text-[0.6rem] text-dark-text3 mt-1.5">
                        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline">Create new PAT</a> → check <strong>repo</strong> scope → paste above
                      </p>
                    </div>
                  )}
                </div>
              )}

              <button
                className="w-full py-3 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleSubmit}
                disabled={uploading || !canSubmit()}
              >
                {uploading ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>Creating PR...</>
                ) : (
                  <><i className="fas fa-paper-plane mr-2"></i>Submit {totalFiles} File{totalFiles !== 1 ? 's' : ''} for Review</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
