'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getFacultyIdForDepartment, getDepartmentFolder, resolveDepartmentId } from '@/lib/departments';
import type { Profile } from '@/lib/store';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import { UploadForm, CreateCourseModal, type CreateCourseResult } from '@/components/upload';
import { CURRENT_YEAR, CURRENT_SEASON, isPdf, isImage, isDocsOnly } from '@/components/upload/types';
import type { CourseGroup, FileWithMeta, Link, UploadModalProps } from '@/components/upload/types';
import DocumentScanner, { type CapturedPage, warmupScannerEngine } from '@/components/scanner/DocumentScanner';
import { FILTER_LABELS, FILTER_HINTS, type FilterMode } from '@/lib/image-enhance';
import { compressUploadFile } from '@/lib/compress';
import { buildSearchablePdf } from '@/lib/ocr';

// Files are ALWAYS uploaded from the browser to our backend, which stores the
// chunks (staging) and commits them to GitHub in one atomic commit. There is no
// browser → GitHub direct path, so a user's PAT never leaves the server and the
// bytes are verified before the commit.
// CHUNK_BYTES is an INTEGER (629145) — float slice boundaries (629145.6) round
// differently across browsers/Blob.slice() and were the historical cause of
// files landing truncated exactly at a chunk boundary.
const CHUNK_BYTES = Math.floor(0.6 * 1024 * 1024);

export interface UploadProgress {
  percent: number;
  label: string;
}

function buildUploadPaths(opts: {
  course: CourseGroup;
  category: string;
  semester: string;
  department: string;
  profile: Profile;
  email: string;
}): { files: { path: string; meta: FileWithMeta }[]; readmePath: string } {
  const { course, category, semester, department } = opts;
  const courseCode = course.selectedCourseCode;
  const courseTitle = course.selectedCourseTitle || courseCode;
  const courseFolder = `${courseCode} - ${courseTitle}`;
  const isExamSpecific = category === config.categories.notes.folder || category === config.categories.questions.folder;
  const midFinalPart = (isExamSpecific && course.midFinal) ? `/${course.midFinal}` : '';
  const authorName = opts.profile?.name || opts.email.split('@')[0] || 'Unknown';

  const files = course.files.map(fileMeta => {
    const ext = fileMeta.file.name.split('.').pop() || 'pdf';
    let filePath: string;
    if (semester === config.relatedKitabsFolder) {
      const fn = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
      filePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${fn}/${fileMeta.file.name}`;
    } else if (semester === config.relatedSourcesFolder) {
      const facId = getFacultyIdForDepartment(department) || department;
      const fn = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
      filePath = `${facId}/${config.relatedSourcesFolder}/${fn}/${fileMeta.file.name}`;
    } else if (isExamSpecific && course.examSession) {
      const yearPart = isPdf(fileMeta.file.name) ? (fileMeta.yearRange || '') : (fileMeta.year || '');
      const renamedFile = `${courseCode} ${course.examSession} ${CURRENT_YEAR} - ${authorName}.${ext}`;
      const deptFolder = getDepartmentFolder(department);
      filePath = yearPart
        ? `${deptFolder}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${yearPart}/${renamedFile}`
        : `${deptFolder}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${renamedFile}`;
    } else {
      filePath = `${getDepartmentFolder(department)}/${semester}/${courseFolder}${midFinalPart}/${category}/${fileMeta.file.name}`;
    }
    return { path: filePath, meta: fileMeta };
  });

  let readmePath = '';
  if (course.links.length > 0) {
    if (semester === config.relatedKitabsFolder) {
      const fn = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
      readmePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${fn}/README.md`;
    } else if (semester === config.relatedSourcesFolder) {
      const facId = getFacultyIdForDepartment(department) || department;
      const fn = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
      readmePath = `${facId}/${config.relatedSourcesFolder}/${fn}/README.md`;
    } else {
      readmePath = `${getDepartmentFolder(department)}/${semester}/${courseFolder}/README.md`;
    }
  }

  return { files, readmePath };
}

async function readUploadResponse(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  const text = await res.text();
  throw new Error(
    text.includes('Too Large') || text.includes('too large')
      ? 'Files too large. Try fewer or smaller files.'
      : text.includes('Entity')
        ? 'Upload failed — server rejected the request.'
        : `Unexpected server response (${res.status}). Please try again.`
  );
}

export default function UploadModal({ session, status, profile, onLogin, onClose }: UploadModalProps) {
  const githubToken = useAppStore(s => s.githubToken);
  const setGithubToken = useAppStore(s => s.setGithubToken);
  const onboardData = useAppStore(s => s.onboardingData);
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);
  const dbCourses = useAppStore(s => s.dbCourses);

  const email = (session as any)?.user?.email || profile.email || '';

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

  const [department, setDepartment] = useState(userDeptId);
  const [semester, setSemester] = useState(profile.semester || '');
  const [category, setCategory] = useState('');
  const [courses, setCourses] = useState<CourseGroup[]>([{ id: 1, selectedCourseCode: '', selectedCourseTitle: '', files: [], examSession: '', midFinal: '', links: [] }]);
  const [uploading, setUploading] = useState(false);
  const [createCourseFor, setCreateCourseFor] = useState<number | null>(null);
  const [recentlyCreated, setRecentlyCreated] = useState<{ code: string; title: string }[]>([]);
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean; needsPAT?: boolean; merged?: boolean; direct?: boolean } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [compressing, setCompressing] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [mergeDialogCourseId, setMergeDialogCourseId] = useState<number | null>(null);
  const [mergeImages, setMergeImages] = useState<FileWithMeta[]>([]);
  const [mergeSession, setMergeSession] = useState('');
  const [mergeYear, setMergeYear] = useState('');
  const [mergeMerging, setMergeMerging] = useState(false);
  const [mergeOcr, setMergeOcr] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCourseId, setScannerCourseId] = useState<number | null>(null);
  const [scannerFilter, setScannerFilter] = useState<FilterMode>('enhance');

  const [patInputToken, setPatInputToken] = useState('');
  const [patSaving, setPatSaving] = useState(false);

  const isLoggedIn = !!(session as any)?.user;
  const treeLength = useAppStore(s => s.tree.length);

  const existingCourses = useMemo(() => {
    if (!department || !semester || semester === config.relatedKitabsFolder || semester === config.relatedSourcesFolder) return [];
    return getSemesterCourses(semester, department);
  }, [department, semester, getSemesterCourses, treeLength]);

  const allKnownCourses = useMemo(() => {
    if (!department) return [];
    const map = new Map<string, string>();
    for (const s of config.semesters) {
      const cs = getSemesterCourses(s.id, department);
      for (const c of cs) { if (!map.has(c.code)) map.set(c.code, c.title); }
    }
    for (const c of dbCourses) { if (c.department === department && !map.has(c.code)) map.set(c.code, c.title); }
    for (const c of recentlyCreated) { if (!map.has(c.code)) map.set(c.code, c.title); }
    return Array.from(map.entries()).map(([code, title]) => ({ code, title }));
  }, [department, getSemesterCourses, treeLength, dbCourses, recentlyCreated]);

  useEffect(() => {
    useAppStore.getState().loadCourses();
  }, []);

  // Preload the scanner engine while the modal is open, so launching the camera
  // scanner doesn't stall on the "Preparing Scanner Engine…" step.
  useEffect(() => {
    warmupScannerEngine();
  }, []);

  useEffect(() => {
    setCreateCourseFor(null);
  }, [department, semester]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const dept = p.get('dept');
    const sem = p.get('sem');
    const course = p.get('course');
    const mf = p.get('mf');
    const cat = p.get('cat');
    if (dept) setDepartment(resolveDepartmentId(dept));
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
      setCourses(prev => [{ ...prev[0], selectedCourseCode: code, selectedCourseTitle: found?.title || '', midFinal: mf || '' }]);
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
    const folder = `${getDepartmentFolder(department)}/${semester}/${courseCode} - ${courseTitle}`;
    try {
      const res = await fetch(`/api/github/readme?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      if (data.content) {
        const links: Link[] = [];
        for (const line of data.content.split('\n')) {
          const match = line.match(/^\s*[-*]\s*\[(.+?)\]\((.+?)\)/);
          if (match) links.push({ title: match[1], url: match[2] });
        }
        if (links.length > 0) updateCourse(courseId, { links });
      }
    } catch {}
  }

  function linksToReadmeContent(links: Link[]): string {
    if (links.length === 0) return '';
    return links.map(l => `- [${l.title}](${l.url})`).join('\n') + '\n';
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
        showToast('GitHub connected!', 'success');
        window.location.reload();
      } else {
        showToast(data.error || 'Invalid token', 'error');
      }
    } catch { showToast('Network error', 'error'); }
    finally { setPatSaving(false); }
  }

  function removeCourse(id: number) {
    if (courses.length <= 1) return;
    setCourses(prev => prev.filter(c => c.id !== id));
  }

  async function handleFilesForCourse(courseId: number, e: React.ChangeEvent<HTMLInputElement>) {
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

    const valid = filtered.filter(f => f.size <= config.maxSingleFileUploadMB * 1024 * 1024);
    if (valid.length < filtered.length) alert(`${filtered.length - valid.length} file(s) exceeded ${config.maxSingleFileUploadMB}MB and were skipped.`);

    // Compress client-side before upload (images, large PDFs, DOCX/PPTX/EPUB).
    // Each file is isolated: a compression failure/hang on one file must never
    // block the rest — it just keeps the original and still gets added below.
    const valid2: File[] = [];
    let totalSaved = 0;
    setCompressing(`Compressing 0/${valid.length}...`);
    try {
      for (let i = 0; i < valid.length; i++) {
        setCompressing(`Compressing ${i + 1}/${valid.length} — ${valid[i].name}...`);
        try {
          const r = await compressUploadFile(valid[i]);
          valid2.push(r.file);
          totalSaved += r.saved;
        } catch {
          valid2.push(valid[i]);
        }
      }
    } finally {
      setCompressing(null);
    }
    if (totalSaved > 1024 * 1024) {
      showToast(`Compressed files — saved ${(totalSaved / (1024 * 1024)).toFixed(1)}MB`, 'info');
    }

    const newTotal = totalFiles - currentCourseFiles + valid2.length;
    if (newTotal > 10) { alert(`Max 10 files total across all courses. You can add ${10 - totalFiles + currentCourseFiles} more.`); return; }

    const newTotalSize = (totalSizeMB * 1024 * 1024 - (course?.files.reduce((s, f) => s + f.file.size, 0) || 0) + valid2.reduce((s, f) => s + f.size, 0)) / (1024 * 1024);
    if (newTotalSize > config.maxUploadSizeMB) { alert(`Total upload size cannot exceed ${config.maxUploadSizeMB}MB.`); return; }

    const newFiles: FileWithMeta[] = valid2.map(f => {
      if (isNotes) return { file: f, year: String(CURRENT_YEAR), yearRange: '' };
      if (isQuestions) {
        if (isPdf(f.name)) return { file: f, year: '', yearRange: `${CURRENT_YEAR}-${CURRENT_YEAR}` };
        return { file: f, year: String(CURRENT_YEAR), yearRange: '' };
      }
      return { file: f, year: '', yearRange: '' };
    });

    const patch: Partial<CourseGroup> = { files: [...(course?.files || []), ...newFiles] };
    if ((isNotes || isQuestions) && !course?.examSession) {
      patch.examSession = (isQuestions && valid2.length > 0 && isPdf(valid2[0].name)) ? 'Both' : CURRENT_SEASON;
    }
    updateCourse(courseId, patch);
    if (fileInputRefs.current[courseId]) fileInputRefs.current[courseId]!.value = '';
    if (isQuestions && valid2.some(f => isImage(f.name))) setTimeout(() => checkForMergeableImages(courseId, newFiles), 100);
    if (isQuestions && valid2.length > 0 && !valid2.some(f => isPdf(f.name))) {
      const totalImgs = (course?.files || []).filter(f => isImage(f.file.name)).length + valid2.filter(f => isImage(f.name)).length;
      if (totalImgs === 1) showToast('Questions often have 2 parts — select 2-3 images together and they auto-merge into one PDF', 'info');
    }
  }

  function checkForMergeableImages(courseId: number, newFiles: FileWithMeta[]) {
    const course = courses.find(c => c.id === courseId);
    if (!course || category !== config.categories.questions.folder) return;
    const images = [...course.files, ...newFiles].filter(f => isImage(f.file.name) && f.year);
    if (images.length < 2) return;
    const groups = new Map<string, FileWithMeta[]>();
    for (const img of images) {
      const key = `${course.examSession || CURRENT_SEASON}-${img.year}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(img);
    }
    for (const [key, group] of Array.from(groups.entries())) {
      if (group.length >= 2) {
        const [session, year] = key.split('-');
        setMergeSession(session); setMergeYear(year); setMergeImages(group); setMergeDialogCourseId(courseId);
        return;
      }
    }
  }

  async function handleMergeImages(courseId: number) {
    if (mergeImages.length < 2) return;
    setMergeMerging(true);
    try {
      const authorName = profile?.name || email.split('@')[0] || 'Unknown';
      const course = courses.find(c => c.id === courseId);
      if (!course) return;
      const mergedName = `${course.selectedCourseCode} ${mergeSession} ${mergeYear} - ${authorName}.pdf`;
      let mergedFile: File;

      if (mergeOcr) {
        showToast('Running OCR on merged pages...', 'info');
        const pages = await Promise.all(mergeImages.map(async m => {
          const dims = await getImageSize(m.file);
          return { blob: m.file, width: dims.w, height: dims.h };
        }));
        mergedFile = await buildSearchablePdf(pages, true, mergedName);
        showToast(`Merged ${mergeImages.length} images into ${mergedName} (with OCR text layer)`, 'success');
      } else {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        for (let i = 0; i < mergeImages.length; i++) {
          const dataUrl = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(mergeImages[i].file);
          });
          const img = await new Promise<HTMLImageElement>(resolve => { const el = new Image(); el.onload = () => resolve(el); el.src = dataUrl; });
          const pageW = pdf.internal.pageSize.getWidth(); const pageH = pdf.internal.pageSize.getHeight();
          const ratio = Math.min((pageW - 10) / img.width, (pageH - 10) / img.height);
          const w = img.width * ratio; const h = img.height * ratio;
          if (i > 0) pdf.addPage();
          const isPng = mergeImages[i].file.type.includes('png') || dataUrl.startsWith('data:image/png');
          pdf.addImage(dataUrl, isPng ? 'PNG' : 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
        }
        mergedFile = new File([pdf.output('blob')], mergedName, { type: 'application/pdf' });
        showToast(`Merged ${mergeImages.length} images into ${mergedName}`, 'success');
      }

      updateCourse(courseId, {
        files: [...course.files.filter(f => !mergeImages.some(m => m.file === f.file)), { file: mergedFile, year: '', yearRange: `${mergeYear}-${mergeYear}` }],
        examSession: mergeSession || course.examSession,
      });
    } catch (err: any) { showToast('Failed to merge: ' + (err.message || 'Unknown'), 'error'); }
    finally { setMergeMerging(false); setMergeDialogCourseId(null); setMergeImages([]); setMergeOcr(false); }
  }

  function getImageSize(file: File): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => reject(new Error('Invalid image'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('Read failed'));
      reader.readAsDataURL(file);
    });
  }

  function openScanner(courseId: number) {
    setScannerCourseId(courseId);
    setScannerOpen(true);
  }

  function handleScannerDone(pages: CapturedPage[]) {
    setScannerOpen(false);
    setScannerCourseId(null);
  }

  function handleScannerResult(file: File, usedOcr: boolean) {
    if (scannerCourseId === null) return;
    const course = courses.find(c => c.id === scannerCourseId);
    if (!course) return;
    const isQuestions = category === config.categories.questions.folder;

    if (isQuestions) {
      const hasPdf = course.files.some(f => isPdf(f.file.name)) || isPdf(file.name);
      if (hasPdf && course.files.length > 0) {
        showToast('Only 1 PDF allowed for Previous Questions — remove existing file first', 'error');
        return;
      }
      if (!hasPdf && course.files.length >= 5) {
        showToast('Max 5 images per course for Previous Questions', 'error');
        return;
      }
    }

    const isNotes = category === config.categories.notes.folder;
    const meta: FileWithMeta = isQuestions
      ? isPdf(file.name)
        ? { file, year: '', yearRange: `${CURRENT_YEAR}-${CURRENT_YEAR}` }
        : { file, year: String(CURRENT_YEAR), yearRange: '' }
      : isNotes
        ? { file, year: String(CURRENT_YEAR), yearRange: '' }
        : { file, year: '', yearRange: '' };

    const patch: Partial<CourseGroup> = { files: [...course.files, meta] };
    if ((isQuestions || category === config.categories.notes.folder) && !course.examSession) {
      patch.examSession = isQuestions && isPdf(file.name) ? 'Both' : CURRENT_SEASON;
    }
    updateCourse(scannerCourseId, patch);
    showToast(
      usedOcr
        ? 'Scanned PDF added with OCR text layer (text is selectable & copyable)'
        : isPdf(file.name)
          ? `Merged ${file.name} added`
          : 'Scanned image added (compressed)',
      'success'
    );
  }

  async function handleAddMarkdown(courseId: number, file: File): Promise<void> {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    const isNotes = category === config.categories.notes.folder;
    const isQuestions = config.categories.questions.folder;

    const maxFiles = isNotes ? 1 : isQuestions
      ? (course.files.some(f => isPdf(f.file.name)) ? 1 : 5)
      : 5;
    if (course.files.length + 1 > maxFiles) {
      if (isNotes) alert('Only 1 file allowed for Notes.');
      else if (isQuestions && maxFiles === 1) alert('PDF already selected. Only 1 file allowed for Previous Questions.');
      else alert(`Max ${maxFiles} files per course.`);
      return;
    }

    if (file.size > config.maxSingleFileUploadMB * 1024 * 1024) {
      alert(`File exceeds ${config.maxSingleFileUploadMB}MB and was skipped.`);
      return;
    }

    const newTotal = totalFiles + 1;
    if (newTotal > 10) { alert('Max 10 files total across all courses.'); return; }

    const newTotalSize = (totalSizeMB * 1024 * 1024 + file.size) / (1024 * 1024);
    if (newTotalSize > config.maxUploadSizeMB) { alert(`Total upload size cannot exceed ${config.maxUploadSizeMB}MB.`); return; }

    const meta: FileWithMeta = isQuestions
      ? isPdf(file.name)
        ? { file, year: '', yearRange: `${CURRENT_YEAR}-${CURRENT_YEAR}` }
        : { file, year: String(CURRENT_YEAR), yearRange: '' }
      : isNotes
        ? { file, year: String(CURRENT_YEAR), yearRange: '' }
        : { file, year: '', yearRange: '' };

    updateCourse(courseId, { files: [...course.files, meta] });
    showToast('Markdown file added', 'success');
  }

  async function handleCreateCourse(code: string, title: string): Promise<CreateCourseResult> {
    if (createCourseFor === null) return { success: false, error: 'Please try again' };
    try {
      const res = await useAppStore.getState().addCourse(department, semester, code, title);
      if (!res.success) return { success: false, error: res.error || 'Failed to create course' };
      const finalCode = res.course?.code || code.toUpperCase();
      const finalTitle = res.course?.title || title.trim() || finalCode;
      updateCourse(createCourseFor, { selectedCourseCode: finalCode, selectedCourseTitle: finalTitle, links: [] });
      setRecentlyCreated(prev => [...prev.filter(c => c.code !== finalCode), { code: finalCode, title: finalTitle }]);
      useAppStore.getState().invalidateCoursesCache();
      useAppStore.getState().loadCourses();
      useAppStore.getState().invalidateTreeCache();
      useAppStore.getState().loadTree(session?.accessToken || '');
      showToast(res.alreadyExisted ? `Course ${finalCode} already exists — selected` : `Course ${finalCode} created on GitHub`, res.alreadyExisted ? 'info' : 'success');
      return { success: true };
    } catch { return { success: false, error: 'Network error' }; }
  }

  async function handleSubmit() {
    if (!department || !semester || !category) return;
    const validCourses = courses.filter(c => c.selectedCourseCode && (c.files.length > 0 || c.links.length > 0));
    if (validCourses.length === 0) return;

    await doUpload();
  }

  async function uploadChunked(
    uploads: { course: CourseGroup; files: { path: string; meta: FileWithMeta }[]; readmePath: string }[],
    totalBytes: number,
    message: string,
    token: string,
    sizes?: Record<string, number>
  ): Promise<any> {
    const sessionId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let uploadedBytes = 0;
    for (const u of uploads) {
      for (const f of u.files) {
        const file = f.meta.file;
        const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_BYTES;
          const blob = file.slice(start, Math.min(file.size, start + CHUNK_BYTES));
          const fd = new FormData();
          fd.append('sessionId', sessionId);
          fd.append('path', f.path);
          fd.append('index', String(i));
          fd.append('total', String(totalChunks));
          fd.append('chunk', blob, file.name);
          const res = await fetch('/api/github/upload-chunk', { method: 'POST', body: fd });
          const cdata = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(cdata.error || `Failed to upload ${file.name}`);
          uploadedBytes += blob.size;
          setUploadProgress({
            percent: Math.min(90, Math.round((uploadedBytes / totalBytes) * 90)),
            label: `Uploading ${file.name} (${Math.round(((i + 1) / totalChunks) * 100)}%)...`,
          });
        }
      }
      if (u.readmePath) {
        const fd = new FormData();
        fd.append('sessionId', sessionId);
        fd.append('path', u.readmePath);
        fd.append('index', '0');
        fd.append('total', '1');
        fd.append('chunk', new Blob([linksToReadmeContent(u.course.links)], { type: 'text/markdown' }), u.readmePath.split('/').pop() || 'README.md');
        const res = await fetch('/api/github/upload-chunk', { method: 'POST', body: fd });
        const cdata = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(cdata.error || 'Failed to upload links');
      }
    }

    setUploadProgress({ percent: 95, label: 'Committing to GitHub...' });
    const res = await fetch('/api/github/upload-finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message, githubToken: token || undefined, sizes }),
    });
    return readUploadResponse(res);
  }

  async function doUpload(tokenOverride?: string) {
    const token = tokenOverride || githubToken || profile.githubToken || (session as any)?.accessToken || '';
    const validCourses = courses.filter(c => c.selectedCourseCode && (c.files.length > 0 || c.links.length > 0));

    setUploading(true); setResult(null); setUploadProgress(null);
    try {
      const message = `Add ${validCourses.map(c => `${c.selectedCourseCode} - ${c.selectedCourseTitle || c.selectedCourseCode}`).join(', ')} (${category}) — ${semester}`;

      const uploads = validCourses.map(course => {
        const built = buildUploadPaths({ course, category, semester, department, profile, email });
        return { course, files: built.files, readmePath: built.readmePath };
      });

      // Expected sizes per relative path — the server verifies each assembled
      // file matches this byte count before committing, so a truncated upload
      // can never reach GitHub.
      const sizes: Record<string, number> = {};
      for (const u of uploads) {
        for (const f of u.files) sizes[f.path] = f.meta.file.size;
        if (u.readmePath) sizes[u.readmePath] = new Blob([linksToReadmeContent(u.course.links)]).size;
      }

      const allFiles = uploads.flatMap(u => u.files);
      const totalBytes = allFiles.reduce((sum, f) => sum + f.meta.file.size, 0);
      const needsChunking = totalBytes > 0 && (allFiles.some(f => f.meta.file.size > CHUNK_BYTES) || totalBytes > CHUNK_BYTES * 2);

      // Browser-safe token from the server: PAT / NextAuth session / short-lived
      // App bot token. We only use this for the AUTH_REQUIRED UX — the actual
      // commit always happens server-side, so the secret never reaches the browser.
      const tokenRes = await fetch('/api/github/upload-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: token || undefined }),
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error) {
        if (tokenData.code === 'AUTH_REQUIRED') {
          setResult({ success: false, error: tokenData.error, tokenExpired: true });
          return;
        }
        throw new Error(tokenData.error || 'Failed to prepare upload');
      }

      let data: any;
      if (needsChunking) {
        data = await uploadChunked(uploads, totalBytes, message, token, sizes);
      } else {
        const formData = new FormData();
        for (const u of uploads) {
          for (const f of u.files) {
            formData.append('files', f.meta.file, f.path);
          }
          if (u.readmePath) {
            formData.append('files', new Blob([linksToReadmeContent(u.course.links)], { type: 'text/markdown' }), u.readmePath);
          }
        }
        formData.append('message', message);
        formData.append('sizes', JSON.stringify(sizes));
        if (token) formData.append('githubToken', token);

        setUploadProgress({ percent: 40, label: 'Uploading to GitHub...' });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 85000);
        const res = await fetch('/api/github/upload', { method: 'POST', body: formData, signal: controller.signal });
        clearTimeout(timeout);
        data = await readUploadResponse(res);
      }

      if (data.success) {
        setResult({ success: true, prUrl: data.pr?.url, direct: data.direct, merged: data.pr?.merged });
        setUploadProgress({ percent: 100, label: 'Done' });
        setCourses([{ id: 1, selectedCourseCode: '', selectedCourseTitle: '', files: [], examSession: '', midFinal: '', links: [] }]);
        useAppStore.getState().invalidateTreeCache();
        useAppStore.getState().loadTree(session?.accessToken || '');
      } else if (data.code === 'TOKEN_EXPIRED' || data.code === 'AUTH_REQUIRED') {
        setResult({ success: false, error: data.error, tokenExpired: true });
      } else if (data.code === 'NEEDS_PAT' || data.code === 'TOKEN_NO_ACCESS') {
        setResult({ success: false, error: data.error, needsPAT: true });
      } else { setResult({ success: false, error: data.error || 'Upload failed' }); }
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'Upload timed out. Try fewer files.' : err.message || 'Network error';
      setResult({ success: false, error: msg, tokenExpired: /token expired|reconnect|401|403/i.test(msg) });
    } finally { setUploading(false); }
  }

  const courseOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; icon: string }[] = [];
    const add = (code: string, title: string) => {
      const key = code.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      opts.push({ value: key, label: `${key} — ${title}`, icon: 'fa-book' });
    };
    for (const c of existingCourses) add(c.code, c.title);
    for (const c of dbCourses) { if (c.department === department && c.semester === semester) add(c.code, c.title); }
    for (const c of recentlyCreated) add(c.code, c.title);
    return opts;
  }, [existingCourses, dbCourses, department, semester, recentlyCreated]);

  return (
    <>
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

        <div className="px-5 py-2.5 border-b border-dark-border bg-dark-bg/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.7rem] font-medium text-dark-text2">Scan filter</span>
            <span className="text-[0.6rem] text-dark-text3">{FILTER_HINTS[scannerFilter]}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(FILTER_LABELS) as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setScannerFilter(m)}
                className={`px-2 py-1.5 rounded-lg text-[0.7rem] font-semibold border cursor-pointer transition-all ${
                  scannerFilter === m
                    ? 'bg-qsis/15 text-qsis border-qsis/40'
                    : 'bg-dark-bg3 text-dark-text2 border-dark-border hover:text-dark-text'
                }`}
              >
                {FILTER_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <UploadForm
            session={session} profile={profile} githubToken={githubToken} setGithubToken={setGithubToken}
            department={department} setDepartment={setDepartment} semester={semester} setSemester={setSemester}
            category={category} setCategory={setCategory}
            courses={courses} updateCourse={updateCourse} removeCourse={removeCourse}
            addLink={addLink} removeLink={removeLink} loadExistingLinks={loadExistingLinks}
            existingCourses={existingCourses} courseOptions={courseOptions}
            createCourseFor={createCourseFor} setCreateCourseFor={setCreateCourseFor}
            handleFilesForCourse={handleFilesForCourse} fileInputRefs={fileInputRefs} onOpenScanner={openScanner}
            totalFiles={totalFiles} totalSizeMB={totalSizeMB} uploading={uploading} result={result}
            compressing={compressing}
            uploadProgress={uploadProgress}
            handleSubmit={handleSubmit}
            patInputToken={patInputToken} setPatInputToken={setPatInputToken} patSaving={patSaving} handleSavePat={handleSavePat}
            mergeDialogCourseId={mergeDialogCourseId} mergeImages={mergeImages} mergeSession={mergeSession} mergeYear={mergeYear}
            mergeMerging={mergeMerging} mergeOcr={mergeOcr} setMergeOcr={setMergeOcr} handleMergeImages={handleMergeImages} dismissMerge={() => { setMergeDialogCourseId(null); setMergeImages([]); setMergeOcr(false); }}
            onAddMarkdown={handleAddMarkdown}
            isLoggedIn={isLoggedIn} onLogin={onLogin} onClose={onClose}
          />
        </div>
      </div>
    </div>
    {scannerOpen && scannerCourseId !== null && (
      <DocumentScanner
        onDone={handleScannerDone}
        onCancel={() => { setScannerOpen(false); setScannerCourseId(null); }}
        onResult={handleScannerResult}
        docOnly={category === config.categories.notes.folder}
        filterMode={scannerFilter}
      />
    )}
    {createCourseFor !== null && (
      <CreateCourseModal
        open
        department={department}
        semester={semester}
        knownCourses={allKnownCourses}
        onSubmit={handleCreateCourse}
        onClose={() => setCreateCourseFor(null)}
      />
    )}
    </>
  );
}
