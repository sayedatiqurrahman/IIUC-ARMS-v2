'use client';

import { useState, useRef } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getFacultyIdForDepartment } from '@/lib/departments';
import type { Profile } from '@/lib/store';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { installGitHubApp } from '@/lib/github-install';
import CustomSelect from '@/components/CustomSelect';

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

interface CourseGroup {
  id: number;
  code: string;
  title: string;
  files: FileWithMeta[];
  examSession: string;
  midFinal: string;
}

interface UploadModalProps {
  session: any;
  status: string;
  profile: Profile;
  onLogin: () => void;
  onClose: () => void;
}

export default function UploadModal({ session, status, profile, onLogin, onClose }: UploadModalProps) {
  const githubToken = useAppStore(s => s.githubToken);
  const setGithubToken = useAppStore(s => s.setGithubToken);
  const onboardData = useAppStore(s => s.onboardingData);

  const email = (session as any)?.user?.email || profile.email || '';
  const effectiveRole = config.getEffectiveRole(email, profile.role);
  const canUploadAnyDept = effectiveRole === 'admin';

  // Resolve user's department ID from profile or onboarding
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
  const [courses, setCourses] = useState<CourseGroup[]>([{ id: 1, code: '', title: '', files: [], examSession: '', midFinal: '' }]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean; needsPAT?: boolean } | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [activeTab, setActiveTab] = useState<'repo' | 'direct'>('direct');

  const hasGitHub = !!(session as any)?.accessToken || !!profile.githubLogin || !!githubToken || !!profile.githubToken;
  const needsDepartment = !userDeptId;

  const totalFiles = courses.reduce((sum, c) => sum + c.files.length, 0);
  const totalSizeMB = courses.reduce((sum, c) => sum + c.files.reduce((s, f) => s + f.file.size, 0), 0) / (1024 * 1024);

  function updateCourse(id: number, patch: Partial<CourseGroup>) {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function addCourse() {
    if (courses.length >= 5) return;
    const newId = Math.max(0, ...courses.map(c => c.id)) + 1;
    setCourses(prev => [...prev, { id: newId, code: '', title: '', files: [], examSession: '', midFinal: '' }]);
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
    const isLimitedCategory = isNotes || isQuestions;
    const maxFiles = isLimitedCategory ? 1 : 5;

    if (currentCourseFiles + selected.length > maxFiles) {
      alert(isLimitedCategory ? 'Only 1 file allowed for Previous Questions / Notes.' : `Max 5 files per course.`);
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

    const defaultSession = CURRENT_SEASON;
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
  }

  function removeFileFromCourse(courseId: number, fileIndex: number) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    updateCourse(courseId, { files: course.files.filter((_, i) => i !== fileIndex) });
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
      if (!c.code.trim() || c.files.length === 0) return false;
      if (isExamSpecific && !c.midFinal) return false;
      if (category === config.categories.notes.folder && !c.examSession) return false;
      return true;
    });
  }

  async function handleSubmit() {
    if (!department || !semester || !category) {
      alert('Please select department, semester, and category.');
      return;
    }

    // For related-sources, category is auto-set
    const effectiveCategory = semester === config.relatedSourcesFolder ? config.relatedSourcesFolder : category;

    const validCourses = courses.filter(c => c.code.trim() && c.files.length > 0);
    if (validCourses.length === 0) {
      alert('At least one course must have a code and files.');
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
        const folderName = course.title.trim()
          ? `${course.code.trim()}-${course.title.trim()}`
          : course.code.trim();

        for (const fileMeta of course.files) {
          const base64 = await fileMeta.file.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
          });

          let filePath: string;
          const courseFolder = course.title.trim() ? `${course.code} - ${course.title}` : course.code;
          // NOTES, Previous Questions → inside Mid/Final; sheet, Syllabus, Other → root of course
          const isExamSpecific = category === config.categories.notes.folder || category === config.categories.questions.folder;
          const midFinalPart = (isExamSpecific && course.midFinal) ? `/${course.midFinal}` : '';
          if (semester === config.relatedKitabsFolder) {
            filePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${folderName}/${fileMeta.file.name}`;
          } else if (semester === config.relatedSourcesFolder) {
            const facId = getFacultyIdForDepartment(department) || department;
            filePath = `${facId}/${config.relatedSourcesFolder}/${folderName}/${fileMeta.file.name}`;
          } else if (isExamSpecific && course.examSession) {
            const yearPart = isPdf(fileMeta.file.name) ? (fileMeta.yearRange || '') : (fileMeta.year || '');
            filePath = yearPart
              ? `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${yearPart}/${fileMeta.file.name}`
              : `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${course.examSession}/${fileMeta.file.name}`;
          } else {
            filePath = `${department}/${semester}/${courseFolder}${midFinalPart}/${category}/${fileMeta.file.name}`;
          }

          allFiles.push({ path: filePath, content: base64 });
        }
      }

      const courseList = validCourses.map(c => c.title.trim() ? `${c.code} - ${c.title}` : c.code).join(', ');
      const message = `Add ${courseList} (${category}) — ${semester}`;

      // Use server-side API route (uses GITHUB_TOKEN env for write access)
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
        setCourses([{ id: 1, code: '', title: '', files: [], examSession: '', midFinal: '' }]);
        // Refresh tree cache so newly uploaded files appear immediately
        try { localStorage.removeItem('qs_tree_cache'); } catch {}
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

  // Not logged in
  if (status !== 'authenticated') {
    return (
      <div className="modal active" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
            <h2 className="text-base font-semibold"><i className="fas fa-upload"></i> Contribute Files</h2>
            <button className="text-dark-text2 cursor-pointer bg-transparent border-none" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
          <div className="p-5">
            <div className="text-center mb-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-qsis/10 flex items-center justify-center">
                <i className="fas fa-cloud-upload-alt text-2xl text-qsis"></i>
              </div>
              <h3 className="text-[1rem] font-bold mb-1">Share Academic Files</h3>
              <p className="text-[0.82rem] text-dark-text2">Sign in with your IIUC email to upload notes, sheets, and previous questions.</p>
            </div>
            <button className="w-full py-3 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold cursor-pointer" onClick={onLogin}>
              <i className="fas fa-sign-in-alt mr-2"></i> Sign In to Upload
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged in but no GitHub
  if (!hasGitHub) {
    return (
      <div className="modal active" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
            <h2 className="text-base font-semibold"><i className="fas fa-upload"></i> Connect GitHub</h2>
            <button className="text-dark-text2 cursor-pointer bg-transparent border-none" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
          <div className="p-5">
            <div className="text-center mb-5">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-dark-bg3 flex items-center justify-center">
                <i className="fab fa-github text-2xl text-dark-text"></i>
              </div>
              <h3 className="text-[1rem] font-bold mb-1">Connect Your GitHub</h3>
              <p className="text-[0.82rem] text-dark-text2">We need GitHub to create a Pull Request with your files.</p>
            </div>
            <div className="mb-5">
              <div className="flex flex-col gap-3">
                {[
                  { n: '1', t: 'Sign in with Google', d: `Use your IIUC email (${profile.email || session?.user?.email || 'your email'})` },
                  { n: '2', t: 'Connect GitHub Account', d: 'One click to link your GitHub for PR submissions' },
                  { n: '3', t: 'Upload & Submit', d: 'Files are submitted as a Pull Request for review' },
                ].map(s => (
                  <div key={s.n} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[0.72rem] font-bold text-qsis">{s.n}</span>
                    </div>
                    <div>
                      <span className="text-[0.82rem] font-semibold block">{s.t}</span>
                      <span className="text-[0.72rem] text-dark-text2">{s.d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
              <p className="text-[0.78rem] text-dark-text2 mb-2"><i className="fas fa-question-circle text-qsis mr-1.5"></i>Don&apos;t have a GitHub account?</p>
              <a href="https://github.com/signup" target="_blank" rel="noopener noreferrer" className="text-[0.82rem] text-qsis font-semibold hover:underline">
                Create one free at github.com/signup <i className="fas fa-external-link-alt text-[0.65rem] ml-1"></i>
              </a>
            </div>
            <button className="w-full py-3 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white border-none font-semibold cursor-pointer hover:opacity-90 transition-opacity" onClick={async () => {
              showToast('Opening GitHub...', 'info');
              const result = await installGitHubApp();
              if (result.token && result.login) {
                setGithubToken(result.token);
                fetch('/api/profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    githubLogin: result.login,
                    githubToken: result.token,
                    githubInstallationId: result.installationId,
                    githubAvatar: result.avatarUrl,
                  }),
                }).catch(() => {});
                window.location.reload();
              } else {
                showToast(result.error || 'Connection cancelled', 'error');
              }
            }}>
              <i className="fab fa-github mr-2"></i> Connect GitHub Account
            </button>
            <div className="mt-4 p-3 rounded-lg bg-qsis/5 border border-qsis/10">
              <p className="text-[0.72rem] text-dark-text2 text-center">
                <i className="fas fa-info-circle text-qsis mr-1"></i>
                Files are stored in <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" rel="noopener noreferrer" className="text-qsis font-semibold hover:underline">QSIS-ACADEMIC-FILES-MANAFGER</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Upload form with tabs
  return (
    <div className="modal active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-base font-semibold"><i className="fas fa-upload"></i> Contribute Files</h2>
          <button className="text-dark-text2 cursor-pointer bg-transparent border-none" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        {/* Tabs - only show if repo tab has content */}

        <div className="p-5 max-h-[80vh] overflow-y-auto">

          {/* Block upload if department not set */}
          {needsDepartment && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/10 flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-2xl text-orange-400"></i>
              </div>
              <h3 className="text-[1rem] font-bold text-dark-text mb-2">Complete Your Profile First</h3>
              <p className="text-[0.82rem] text-dark-text2 mb-4 max-w-sm mx-auto">
                You need to set your <strong>department</strong> before uploading files. This ensures your files go to the right department folder.
              </p>
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 max-w-sm mx-auto mb-4">
                <p className="text-[0.75rem] text-dark-text2 mb-2">Go to your profile or run onboarding to set your department:</p>
                <ol className="list-decimal ml-4 space-y-1 text-[0.72rem] text-dark-text2 text-left">
                  <li>Click your avatar &rarr; <strong>Dashboard</strong></li>
                  <li>Update your <strong>Department</strong> field</li>
                  <li>Save and come back here</li>
                </ol>
              </div>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl bg-qsis text-white text-[0.82rem] font-semibold cursor-pointer border-none hover:opacity-90">
                <i className="fas fa-arrow-left mr-1.5"></i>Go Back &amp; Complete Profile
              </button>
            </div>
          )}


          {/* ═══════════ Direct Upload ═══════════ */}
          {result?.success ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                    <i className="fas fa-check-circle text-2xl text-green-500"></i>
                  </div>
                  <h3 className="text-[1rem] font-bold mb-2">PR Created Successfully!</h3>
                  <p className="text-[0.82rem] text-dark-text2 mb-4">Your files are pending review.</p>
                  <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-qsis text-white font-semibold text-[0.85rem] hover:opacity-90 transition-opacity">
                    <i className="fab fa-github"></i> View Pull Request
                  </a>
                  <button className="block mx-auto mt-3 px-4 py-2 text-qsis text-[0.82rem] font-semibold bg-transparent border-none cursor-pointer hover:underline" onClick={onClose}>Close</button>
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
                    const folderName = course.code.trim()
                      ? (course.title.trim() ? `${course.code.trim()}-${course.title.trim()}` : course.code.trim())
                      : '';
                    const isLimitedCategory = category === config.categories.questions.folder || category === config.categories.notes.folder;
                    const folderPreview = course.code.trim()
                      ? (course.title.trim() ? `${course.code.trim()}-${course.title.trim()}` : course.code.trim())
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

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Code *</label>
                          <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. FSC-1208" value={course.code} onChange={e => updateCourse(course.id, { code: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Title</label>
                          <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. Islamic Studies" value={course.title} onChange={e => updateCourse(course.id, { title: e.target.value })} />
                        </div>
                      </div>

                      {(category === config.categories.questions.folder || category === config.categories.notes.folder) && (
                        <div className="mb-2">
                          <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Section *</label>
                          <CustomSelect value={course.midFinal} onChange={v => updateCourse(course.id, { midFinal: v })} placeholder="Select exam section..." options={[
                            { value: '', label: 'Select exam section...' },
                            { value: 'Mid', label: 'Mid', icon: 'fa-hourglass-half' },
                            { value: 'Final', label: 'Final', icon: 'fa-check-double' },
                          ]} />
                        </div>
                      )}

                      {(category === config.categories.questions.folder || category === config.categories.notes.folder) && !course.midFinal && (
                        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                          <p className="text-[0.68rem] text-orange-400"><i className="fas fa-exclamation-triangle mr-1"></i>Please select an exam section (Mid or Final) for {category === config.categories.notes.folder ? 'Notes' : 'Previous Questions'}.</p>
                        </div>
                      )}

                      {category === config.categories.questions.folder && (
                        <div className="mb-2">
                          <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Session *</label>
                          <CustomSelect value={course.examSession} onChange={v => updateCourse(course.id, { examSession: v })} options={[
                            { value: 'Both', label: 'Both (Autumn + Spring)', icon: 'fa-layer-group' },
                            { value: 'Autumn', label: 'Autumn', icon: 'fa-leaf' },
                            { value: 'Spring', label: 'Spring', icon: 'fa-seedling' },
                          ]} />
                        </div>
                      )}
                      {category === config.categories.notes.folder && (
                        <div className="mb-2">
                          <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Session *</label>
                          <CustomSelect value={course.examSession} onChange={v => updateCourse(course.id, { examSession: v })} placeholder="Select session..." options={[
                            { value: '', label: 'Select session...' },
                            { value: 'Autumn', label: 'Autumn', icon: 'fa-leaf' },
                            { value: 'Spring', label: 'Spring', icon: 'fa-seedling' },
                          ]} />
                        </div>
                      )}

                      {folderPreview && department && semester && category && (
                        <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-qsis/5 border border-qsis/10">
                          <span className="text-[0.62rem] text-qsis font-mono">
                            <i className="fas fa-folder mr-1"></i>
                            {semester === config.relatedKitabsFolder
                              ? `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${folderPreview}/`
                                : semester === config.relatedSourcesFolder
                                  ? `${getFacultyIdForDepartment(department) || department}/${config.relatedSourcesFolder}/${folderPreview}/`
                                : (category === config.categories.questions.folder || category === config.categories.notes.folder) && course.examSession
                                  ? `${department}/${semester}/${folderPreview}/${course.midFinal ? course.midFinal + '/' : ''}${category}/${course.examSession}/...`
                                  : `${department}/${semester}/${folderPreview}/${course.midFinal ? course.midFinal + '/' : ''}${category}/`
                            }
                          </span>
                        </div>
                      )}

                      <input ref={el => { fileInputRefs.current[course.id] = el; }} type="file" multiple className="hidden" accept={category === config.categories.notes.folder ? '.pdf,.doc,.docx,.ppt,.pptx' : category === config.categories.questions.folder ? '.pdf,.jpg,.jpeg,.png,.gif,.webp' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.csv'} onChange={e => handleFilesForCourse(course.id, e)} />
                      <div className="border-2 border-dashed border-dark-border rounded-lg p-4 text-center cursor-pointer hover:border-qsis transition-colors" onClick={() => fileInputRefs.current[course.id]?.click()}>
                        <i className="fas fa-cloud-upload-alt text-xl text-dark-text2 mb-1 block"></i>
                        <p className="text-[0.78rem] text-dark-text2">Add files for this course</p>
                        <p className="text-[0.65rem] text-dark-text2">{isLimitedCategory ? '1 file only' : `Max 5 files, ${config.maxUploadSizeMB}MB each`}</p>
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
                        <i className="fas fa-file mr-1"></i>{totalFiles} file{totalFiles !== 1 ? 's' : ''} across {courses.filter(c => c.files.length > 0).length} course{courses.filter(c => c.files.length > 0).length !== 1 ? 's' : ''}
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
                        <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="mt-3 block text-center py-2.5 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white no-underline font-semibold text-[0.82rem]">
                          <i className="fas fa-key mr-2"></i>Create Personal Access Token
                        </a>
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
