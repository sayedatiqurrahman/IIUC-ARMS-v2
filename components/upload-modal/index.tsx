'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getFacultyIdForDepartment } from '@/lib/departments';
import type { Profile } from '@/lib/store';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import { UploadForm } from '@/components/upload';
import { CURRENT_YEAR, CURRENT_SEASON, isPdf, isImage, isDocsOnly } from '@/components/upload/types';
import type { CourseGroup, FileWithMeta, Link, UploadModalProps } from '@/components/upload/types';
import MergeDialog from './MergeDialog';

export default function UploadModal({ session, status, profile, onLogin, onClose }: UploadModalProps) {
  const githubToken = useAppStore(s => s.githubToken);
  const setGithubToken = useAppStore(s => s.setGithubToken);
  const onboardData = useAppStore(s => s.onboardingData);
  const getSemesterCourses = useAppStore(s => s.getSemesterCourses);

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
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [showNewCourse, setShowNewCourse] = useState<Record<number, boolean>>({});
  const [newCourseCode, setNewCourseCode] = useState<Record<number, string>>({});
  const [newCourseTitle, setNewCourseTitle] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean; needsPAT?: boolean } | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [mergeDialogCourseId, setMergeDialogCourseId] = useState<number | null>(null);
  const [mergeImages, setMergeImages] = useState<FileWithMeta[]>([]);
  const [mergeSession, setMergeSession] = useState('');
  const [mergeYear, setMergeYear] = useState('');
  const [mergeMerging, setMergeMerging] = useState(false);

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
    return Array.from(map.entries()).map(([code, title]) => ({ code, title }));
  }, [department, getSemesterCourses, treeLength]);

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
    const folder = `${department}/${semester}/${courseCode} - ${courseTitle}`;
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
    if (valid.length < filtered.length) alert(`${filtered.length - valid.length} file(s) exceeded ${config.maxUploadSizeMB}MB and were skipped.`);

    const newTotal = totalFiles - currentCourseFiles + valid.length;
    if (newTotal > 10) { alert(`Max 10 files total across all courses. You can add ${10 - totalFiles + currentCourseFiles} more.`); return; }

    const newTotalSize = (totalSizeMB * 1024 * 1024 - (course?.files.reduce((s, f) => s + f.file.size, 0) || 0) + valid.reduce((s, f) => s + f.size, 0)) / (1024 * 1024);
    if (newTotalSize > config.maxUploadSizeMB) { alert(`Total upload size cannot exceed ${config.maxUploadSizeMB}MB.`); return; }

    const newFiles: FileWithMeta[] = valid.map(f => {
      if (isNotes) return { file: f, year: String(CURRENT_YEAR), yearRange: '' };
      if (isQuestions) {
        if (isPdf(f.name)) return { file: f, year: '', yearRange: `${CURRENT_YEAR}-${CURRENT_YEAR}` };
        return { file: f, year: String(CURRENT_YEAR), yearRange: '' };
      }
      return { file: f, year: '', yearRange: '' };
    });

    const patch: Partial<CourseGroup> = { files: [...(course?.files || []), ...newFiles] };
    if ((isNotes || isQuestions) && !course?.examSession) {
      patch.examSession = (isQuestions && valid.length > 0 && isPdf(valid[0].name)) ? 'Both' : CURRENT_SEASON;
    }
    updateCourse(courseId, patch);
    if (fileInputRefs.current[courseId]) fileInputRefs.current[courseId]!.value = '';
    if (isQuestions && valid.some(f => isImage(f.name))) setTimeout(() => checkForMergeableImages(courseId, newFiles), 100);
    if (isQuestions && valid.length > 0 && !valid.some(f => isPdf(f.name))) {
      const totalImgs = (course?.files || []).filter(f => isImage(f.file.name)).length + valid.filter(f => isImage(f.name)).length;
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
        pdf.addImage(dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
      }
      const authorName = profile?.name || email.split('@')[0] || 'Unknown';
      const course = courses.find(c => c.id === courseId);
      if (!course) return;
      const mergedName = `${course.selectedCourseCode} ${mergeSession} ${mergeYear} - ${authorName}.pdf`;
      const mergedFile = new File([pdf.output('blob')], mergedName, { type: 'application/pdf' });
      updateCourse(courseId, {
        files: [...course.files.filter(f => !mergeImages.some(m => m.file === f.file)), { file: mergedFile, year: '', yearRange: `${mergeYear}-${mergeYear}` }],
        examSession: mergeSession || course.examSession,
      });
      showToast(`Merged ${mergeImages.length} images into ${mergedName}`, 'success');
    } catch (err: any) { showToast('Failed to merge: ' + (err.message || 'Unknown'), 'error'); }
    finally { setMergeMerging(false); setMergeDialogCourseId(null); setMergeImages([]); }
  }

  function canSubmit(): boolean {
    if (!department || !semester || !category) return false;
    const isExamSpecific = category === config.categories.notes.folder || category === config.categories.questions.folder;
    return courses.some(c => {
      const hasCourse = c.selectedCourseCode || (showNewCourse[c.id] && newCourseCode[c.id]?.trim());
      if (!hasCourse || (c.files.length === 0 && c.links.length === 0)) return false;
      if (isExamSpecific && !c.midFinal) return false;
      if (category === config.categories.notes.folder && !c.examSession) return false;
      return true;
    });
  }

  async function handleCreateCourse(courseId: number) {
    const code = newCourseCode[courseId]?.trim();
    const title = newCourseTitle[courseId]?.trim();
    if (!code) { showToast('Course code is required', 'error'); return; }
    setCreatingCourse(true);
    try {
      const res = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ department, semester, code, title }) });
      const data = await res.json();
      if (data.success || res.status === 209) {
        updateCourse(courseId, { selectedCourseCode: code, selectedCourseTitle: title || code });
        setShowNewCourse(prev => ({ ...prev, [courseId]: false }));
        setNewCourseCode(prev => ({ ...prev, [courseId]: '' }));
        setNewCourseTitle(prev => ({ ...prev, [courseId]: '' }));
        showToast(`Course ${code} created!`, 'success');
        useAppStore.getState().invalidateTreeCache();
        useAppStore.getState().loadTree(session?.accessToken || '');
      } else { showToast(data.error || 'Failed to create course', 'error'); }
    } catch { showToast('Network error', 'error'); }
    finally { setCreatingCourse(false); }
  }

  async function handleSubmit() {
    if (!department || !semester || !category) { alert('Please select department, semester, and category.'); return; }
    const validCourses = courses.filter(c => {
      const hasCourse = c.selectedCourseCode || (showNewCourse[c.id] && newCourseCode[c.id]?.trim());
      return hasCourse && (c.files.length > 0 || c.links.length > 0);
    });
    if (validCourses.length === 0) { alert('At least one course must be selected with files.'); return; }

    await doUpload();
  }

  async function doUpload(tokenOverride?: string) {
    const token = tokenOverride || githubToken || profile.githubToken || (session as any)?.accessToken || '';
    const validCourses = courses.filter(c => {
      const hasCourse = c.selectedCourseCode || (showNewCourse[c.id] && newCourseCode[c.id]?.trim());
      return hasCourse && (c.files.length > 0 || c.links.length > 0);
    });

    setUploading(true); setResult(null);
    try {
      const formData = new FormData();
      const fileMetas: { path: string; isReadme: boolean }[] = [];

      for (const course of validCourses) {
        const courseCode = course.selectedCourseCode;
        const courseTitle = course.selectedCourseTitle || courseCode;
        const courseFolder = `${courseCode} - ${courseTitle}`;

        for (const fileMeta of course.files) {
          const isExamSpecific = category === config.categories.notes.folder || category === config.categories.questions.folder;
          const midFinalPart = (isExamSpecific && course.midFinal) ? `/${course.midFinal}` : '';
          const authorName = profile?.name || email.split('@')[0] || 'Unknown';
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
            filePath = yearPart
              ? `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${yearPart}/${renamedFile}`
              : `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${renamedFile}`;
          } else {
            filePath = `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${fileMeta.file.name}`;
          }
          formData.append('files', fileMeta.file, filePath);
          fileMetas.push({ path: filePath, isReadme: false });
        }

        if (course.links.length > 0) {
          const readmeContent = linksToReadmeContent(course.links);
          let readmePath: string;
          if (semester === config.relatedKitabsFolder) {
            const fn = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
            readmePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${fn}/README.md`;
          } else if (semester === config.relatedSourcesFolder) {
            const facId = getFacultyIdForDepartment(department) || department;
            const fn = courseTitle.trim() ? `${courseCode}-${courseTitle.trim()}` : courseCode;
            readmePath = `${facId}/${config.relatedSourcesFolder}/${fn}/README.md`;
          } else { readmePath = `${department}/${semester}/${courseFolder}/README.md`; }
          const readmeBlob = new Blob([readmeContent], { type: 'text/markdown' });
          formData.append('files', readmeBlob, readmePath);
          fileMetas.push({ path: readmePath, isReadme: true });
        }
      }

      const message = `Add ${validCourses.map(c => `${c.selectedCourseCode} - ${c.selectedCourseTitle || c.selectedCourseCode}`).join(', ')} (${category}) — ${semester}`;
      formData.append('message', message);
      if (token) formData.append('githubToken', token);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 85000);
      const res = await fetch('/api/github/upload', { method: 'POST', body: formData, signal: controller.signal });
      clearTimeout(timeout);

      let data: any;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text.includes('Too Large') || text.includes('too large')
          ? 'Files too large. Try fewer or smaller files.'
          : text.includes('Entity')
            ? 'Upload failed — server rejected the request.'
            : `Unexpected server response (${res.status}). Please try again.`);
      }

      if (data.success) {
        setResult({ success: true, prUrl: data.pr?.url });
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

  const courseOptions = useMemo(() => existingCourses.map(c => ({ value: c.code, label: `${c.code} — ${c.title}`, icon: 'fa-book' })), [existingCourses]);

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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <UploadForm
            session={session} profile={profile} githubToken={githubToken} setGithubToken={setGithubToken}
            department={department} setDepartment={setDepartment} semester={semester} setSemester={setSemester}
            category={category} setCategory={setCategory}
            courses={courses} updateCourse={updateCourse} addCourse={addCourse} removeCourse={removeCourse}
            addLink={addLink} removeLink={removeLink} loadExistingLinks={loadExistingLinks}
            existingCourses={existingCourses} courseOptions={courseOptions} allKnownCourses={allKnownCourses}
            showNewCourse={showNewCourse} setShowNewCourse={setShowNewCourse}
            newCourseCode={newCourseCode} setNewCourseCode={setNewCourseCode}
            newCourseTitle={newCourseTitle} setNewCourseTitle={setNewCourseTitle}
            handleCreateCourse={handleCreateCourse} creatingCourse={creatingCourse}
            handleFilesForCourse={handleFilesForCourse} fileInputRefs={fileInputRefs}
            totalFiles={totalFiles} totalSizeMB={totalSizeMB} uploading={uploading} result={result}
            handleSubmit={handleSubmit} canSubmit={canSubmit}
            patInputToken={patInputToken} setPatInputToken={setPatInputToken} patSaving={patSaving} handleSavePat={handleSavePat}
            mergeDialogCourseId={mergeDialogCourseId} mergeImages={mergeImages} mergeSession={mergeSession} mergeYear={mergeYear}
            mergeMerging={mergeMerging} handleMergeImages={handleMergeImages} dismissMerge={() => { setMergeDialogCourseId(null); setMergeImages([]); }}
            isLoggedIn={isLoggedIn} onLogin={onLogin} onClose={onClose}
          />
        </div>
      </div>
    </div>
    </>
  );
}
