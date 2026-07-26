'use client';

import { useState, useRef } from 'react';
import { config } from '@/lib/config';
import { FACULTIES, getFacultyIdForDepartment } from '@/lib/departments';
import type { Profile } from '@/lib/store';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { installGitHubApp } from '@/lib/github-install';

interface CourseGroup {
  id: number;
  code: string;
  title: string;
  files: File[];
  examSession?: string;
  yearRange?: string;
  sessionType?: string;
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
    const deptName = profile.department || onboardData?.department || '';
    if (!deptName) return '';
    for (const f of FACULTIES) {
      for (const d of f.departments) {
        if (d.name === deptName) return d.id;
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
  const [courses, setCourses] = useState<CourseGroup[]>([{ id: 1, code: '', title: '', files: [] }]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean; needsPAT?: boolean } | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [activeTab, setActiveTab] = useState<'repo' | 'direct'>('direct');

  const hasGitHub = !!(session as any)?.accessToken || !!profile.githubLogin || !!githubToken || !!profile.githubToken;
  const needsDepartment = !userDeptId;

  const totalFiles = courses.reduce((sum, c) => sum + c.files.length, 0);
  const totalSizeMB = courses.reduce((sum, c) => sum + c.files.reduce((s, f) => s + f.size, 0), 0) / (1024 * 1024);

  function updateCourse(id: number, patch: Partial<CourseGroup>) {
    setCourses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function addCourse() {
    if (courses.length >= 5) return;
    const newId = Math.max(0, ...courses.map(c => c.id)) + 1;
    setCourses(prev => [...prev, { id: newId, code: '', title: '', files: [] }]);
  }

  function removeCourse(id: number) {
    if (courses.length <= 1) return;
    setCourses(prev => prev.filter(c => c.id !== id));
  }

  function handleFilesForCourse(courseId: number, e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const course = courses.find(c => c.id === courseId);
    const currentCourseFiles = course?.files.length || 0;

    if (currentCourseFiles + selected.length > 5) {
      alert('Max 5 files per course.');
      return;
    }

    const valid = selected.filter(f => f.size <= config.maxUploadSizeMB * 1024 * 1024);
    if (valid.length < selected.length) {
      alert(`${selected.length - valid.length} file(s) exceeded ${config.maxUploadSizeMB}MB and were skipped.`);
    }

    const newTotal = totalFiles - currentCourseFiles + valid.length;
    if (newTotal > 10) {
      alert(`Max 10 files total across all courses. You can add ${10 - totalFiles + currentCourseFiles} more.`);
      return;
    }

    const newTotalSize = (totalSizeMB * 1024 * 1024 - (course?.files.reduce((s, f) => s + f.size, 0) || 0) + valid.reduce((s, f) => s + f.size, 0)) / (1024 * 1024);
    if (newTotalSize > 50) {
      alert('Total upload size cannot exceed 50MB.');
      return;
    }

    updateCourse(courseId, { files: [...(course?.files || []), ...valid] });
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
    return courses.some(c => c.code.trim() && c.files.length > 0);
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

        for (const file of course.files) {
          const base64 = await file.arrayBuffer().then(buf => {
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
          });

          let filePath: string;
          if (semester === config.relatedKitabsFolder) {
            // Related Kitabs: shariah/related-kitabs/{category}/{folder}/{file}
            filePath = `${config.relatedKitabsParent}/${config.relatedKitabsFolder}/${category}/${folderName}/${file.name}`;
          } else if (semester === config.relatedSourcesFolder) {
            // Related Sources: {faculty-id}/related-sources/{folder}/{file}
            const facId = getFacultyIdForDepartment(department) || department;
            filePath = `${facId}/${config.relatedSourcesFolder}/${folderName}/${file.name}`;
          } else if (category === config.categories.questions.folder && course.examSession) {
            // Previous Questions with session metadata: {dept}/{sem}/{cat}/{course}/{session}/{file}
            filePath = `${department}/${semester}/${category}/${folderName}/${course.examSession}/${file.name}`;
          } else {
            // Regular: {dept}/{sem}/{cat}/{folder}/{file}
            filePath = `${department}/${semester}/${category}/${folderName}/${file.name}`;
          }

          allFiles.push({ path: filePath, content: base64 });
        }
      }

      const courseList = validCourses.map(c => c.title.trim() ? `${c.code} - ${c.title}` : c.code).join(', ');
      const message = `Add ${courseList} (${category}) — ${semester}`;

      // Use server-side API route (uses GITHUB_TOKEN env for write access)
      const res = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: allFiles, message, githubToken: token }),
      });
      const data = await res.json();

      if (data.success) {
        setResult({ success: true, prUrl: data.pr?.url });
        setCourses([{ id: 1, code: '', title: '', files: [] }]);
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
      setResult({ success: false, error: err.message || 'Network error' });
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

        {/* Tabs */}
        <div className="flex border-b border-dark-border">
          <button className={`flex-1 py-2.5 text-[0.82rem] font-semibold border-none cursor-pointer transition-all ${activeTab === 'direct' ? 'bg-transparent text-qsis border-b-2 border-b-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text'}`} onClick={() => setActiveTab('direct')}>
            <i className="fas fa-cloud-upload-alt mr-1.5"></i>Direct Upload
          </button>
          <button className={`flex-1 py-2.5 text-[0.82rem] font-semibold border-none cursor-pointer transition-all ${activeTab === 'repo' ? 'bg-transparent text-qsis border-b-2 border-b-qsis' : 'bg-transparent text-dark-text2 hover:text-dark-text'}`} onClick={() => setActiveTab('repo')}>
            <i className="fab fa-github mr-1.5"></i>Upload from Repository
          </button>
        </div>

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

          {/* ═══════════ TAB 1: Upload from Repository ═══════════ */}
          {activeTab === 'repo' && (
            <div>
              <div className="text-center mb-4">
                <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-qsis/10 flex items-center justify-center">
                  <i className="fab fa-github text-2xl text-qsis"></i>
                </div>
                <h3 className="text-[1rem] font-bold mb-1">Upload Directly on GitHub</h3>
                <p className="text-[0.8rem] text-dark-text2">Upload files manually through GitHub&apos;s web interface. Perfect for small uploads or if you prefer full control.</p>
              </div>

              {/* Quick Links */}
              <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-4">
                <p className="text-[0.72rem] text-dark-text2 mb-2 font-semibold"><i className="fas fa-bolt text-qsis mr-1"></i> Quick Links</p>
                <div className="flex flex-wrap gap-2">
                  <a href="https://github.com/signup" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-[0.7rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all no-underline">
                    <i className="fab fa-github"></i> Create GitHub Account
                  </a>
                  <a href="https://github.com/login" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-[0.7rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all no-underline">
                    <i className="fas fa-sign-in-alt"></i> Sign In to GitHub
                  </a>
                  <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/fork" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-[0.7rem] text-dark-text2 hover:text-qsis hover:border-qsis transition-all no-underline">
                    <i className="fas fa-code-branch"></i> Fork Repository
                  </a>
                </div>
              </div>

              {/* Step by step guide */}
              <div className="space-y-4">
                {/* Step 1: Fork */}
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[0.72rem] font-bold text-qsis">1</span>
                    </div>
                    <h4 className="text-[0.85rem] font-semibold">Fork the Repository</h4>
                  </div>
                  <div className="ml-9 space-y-2">
                    <p className="text-[0.78rem] text-dark-text2">
                      You need your own copy of the repo to upload files. Click <strong>Fork</strong> to create a copy under your GitHub account.
                    </p>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-2.5 text-[0.72rem] text-dark-text2">
                      <i className="fas fa-info-circle text-qsis mr-1.5"></i>
                      <strong>Why fork?</strong> You can&apos;t upload directly to the main repo. Forking creates your personal copy, then you submit a Pull Request to share your files.
                    </div>
                    <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER/fork" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-qsis/10 border border-qsis/20 text-qsis text-[0.75rem] font-semibold hover:bg-qsis/20 transition-all no-underline">
                      <i className="fas fa-code-branch"></i> Fork Now
                    </a>
                  </div>
                </div>

                {/* Step 2: Open Your Fork */}
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[0.72rem] font-bold text-qsis">2</span>
                    </div>
                    <h4 className="text-[0.85rem] font-semibold">Open Your Fork</h4>
                  </div>
                  <div className="ml-9 space-y-2">
                    <p className="text-[0.78rem] text-dark-text2">
                      After forking, you&apos;ll be on your own copy (<code className="bg-dark-bg px-1 rounded text-qsis">github.com/YOUR-USERNAME/QSIS-ACADEMIC-FILES-MANAFGER</code>).
                    </p>
                    <p className="text-[0.78rem] text-dark-text2">
                      Click <strong>Add file</strong> &rarr; <strong>Upload files</strong>.
                    </p>
                  </div>
                </div>

                {/* Step 3: Folder Structure */}
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[0.72rem] font-bold text-qsis">3</span>
                    </div>
                    <h4 className="text-[0.85rem] font-semibold">Navigate to the Correct Folder</h4>
                  </div>
                  <p className="text-[0.78rem] text-dark-text2 ml-9 mb-2">
                    Your files must go inside the correct path. Follow this structure:
                  </p>
                  <div className="ml-9 bg-dark-bg border border-dark-border rounded-lg p-3 font-mono text-[0.72rem]">
                    <div className="text-qsis mb-1">upload_academic_files/</div>
                    <div className="pl-3 text-dark-text2 mb-1">└── <span className="text-orange-400">[your-department]/</span> <span className="text-dark-text3">(e.g. cse, qsis, eee)</span></div>
                    <div className="pl-6 text-dark-text2 mb-1">└── <span className="text-accent">[semester]/</span></div>
                    <div className="pl-9 text-dark-text2 mb-1">└── <span className="text-yellow-400">[category]/</span></div>
                    <div className="pl-12 text-dark-text2 mb-1">└── <span className="text-green-400">[CourseCode-CourseTitle]/</span></div>
                    <div className="pl-15 text-dark-text2">└── <span className="text-blue-400">your-file.pdf</span></div>
                  </div>
                </div>

                {/* Step 4: Choose Path + Create Folders */}
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[0.72rem] font-bold text-qsis">4</span>
                    </div>
                    <h4 className="text-[0.85rem] font-semibold">Choose the Correct Path &amp; Create Folders</h4>
                  </div>

                  {/* How to create folders */}
                  <div className="ml-9 mb-4">
                    <div className="p-2.5 rounded-lg bg-yellow-500/5 border border-yellow-500/20 mb-3">
                      <p className="text-[0.75rem] text-dark-text2">
                        <i className="fas fa-lightbulb text-yellow-500 mr-1.5"></i>
                        <strong>GitHub has no &quot;Create Folder&quot; button.</strong> Folders are created automatically when you type a path in the filename field.
                      </p>
                    </div>
                    <p className="text-[0.75rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-folder-plus text-qsis mr-1.5"></i>How to Create Folders:</p>
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-dark-bg border border-dark-border">
                        <p className="text-[0.72rem] font-semibold text-dark-text mb-1"><i className="fas fa-check-circle text-green-400 mr-1"></i> Method 1 — Upload with path (Recommended)</p>
                        <ol className="list-decimal ml-4 space-y-1 text-[0.72rem] text-dark-text2">
                          <li>Select your file(s) to upload</li>
                          <li>In the commit box, type the full path as the filename:</li>
                        </ol>
                        <div className="mt-1.5 bg-dark-bg3 border border-dark-border rounded-lg p-2 font-mono text-[0.68rem]">
                          <span className="text-orange-400">cse</span><span className="text-dark-text2">/</span><span className="text-qsis">3rd-semister</span><span className="text-dark-text2">/</span><span className="text-yellow-400">sheet</span><span className="text-dark-text2">/</span><span className="text-green-400">FSC-1208</span><span className="text-dark-text2">/</span><span className="text-blue-400">file.pdf</span>
                        </div>
                        <p className="text-[0.65rem] text-green-400 mt-1"><i className="fas fa-check mr-1"></i>GitHub creates all folders automatically!</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-dark-bg border border-dark-border">
                        <p className="text-[0.72rem] font-semibold text-dark-text mb-1"><i className="fas fa-check-circle text-green-400 mr-1"></i> Method 2 — Create empty folder first</p>
                        <ol className="list-decimal ml-4 space-y-1 text-[0.72rem] text-dark-text2">
                          <li>Click <strong>Add file</strong> &rarr; <strong>Create new file</strong></li>
                          <li>Type path + <code className="bg-dark-bg3 px-1 rounded">.gitkeep</code> as filename</li>
                        </ol>
                        <div className="mt-1.5 bg-dark-bg3 border border-dark-border rounded-lg p-2 font-mono text-[0.68rem]">
                          <span className="text-orange-400">cse</span><span className="text-dark-text2">/</span><span className="text-qsis">3rd-semister</span><span className="text-dark-text2">/</span><span className="text-yellow-400">sheet</span><span className="text-dark-text2">/</span><span className="text-green-400">FSC-1208</span><span className="text-dark-text2">/</span><span className="text-blue-400">.gitkeep</span>
                        </div>
                        <p className="text-[0.65rem] text-dark-text3 mt-1"><i className="fas fa-info-circle text-qsis mr-1"></i><code className="bg-dark-bg3 px-1 rounded">.gitkeep</code> is a placeholder that keeps the folder in Git.</p>
                      </div>
                    </div>
                  </div>

                  {/* Department */}
                  <div className="ml-9 mb-3">
                    <p className="text-[0.75rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-building text-orange-400 mr-1.5"></i>Department — pick yours first:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FACULTIES.flatMap(f => f.departments.map(d => (
                        <span key={d.id} className="px-2 py-1 rounded bg-dark-bg border border-dark-border text-[0.65rem] text-dark-text2 font-mono">{d.id}/</span>
                      )))}
                    </div>
                    <p className="text-[0.65rem] text-dark-text3 mt-1"><i className="fas fa-info-circle text-qsis mr-1"></i>Use the department short ID: cse, qsis, eee, ba, etc.</p>
                  </div>

                  {/* Semester */}
                  <div className="ml-9 mb-3">
                    <p className="text-[0.75rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-calendar text-accent mr-1.5"></i>Semester — pick yours:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {config.semesters.map(s => (
                        <span key={s.id} className="px-2 py-1 rounded bg-dark-bg border border-dark-border text-[0.65rem] text-dark-text2 font-mono">{s.id}/</span>
                      ))}
                    </div>
                  </div>

                  {/* Category */}
                  <div className="ml-9 mb-3">
                    <p className="text-[0.75rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-folder text-yellow-400 mr-1.5"></i>Category — choose what you&apos;re uploading:</p>
                    <div className="flex flex-col gap-1.5">
                      {Object.entries(config.categories).map(([key, cat]) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded bg-dark-bg border border-dark-border text-[0.65rem] text-dark-text2 font-mono w-[120px]">{key}/</span>
                          <span className="text-[0.72rem] text-dark-text2">{cat.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Course folder */}
                  <div className="ml-9 mb-3">
                    <p className="text-[0.75rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-book text-green-400 mr-1.5"></i>Course Folder — naming format:</p>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-2.5 font-mono text-[0.72rem]">
                      <span className="text-green-400">CourseCode-CourseTitle</span><span className="text-dark-text2">/</span>
                    </div>
                    <div className="mt-1.5 flex flex-col gap-1">
                      <p className="text-[0.7rem] text-dark-text2"><i className="fas fa-check text-green-400 mr-1.5"></i><code className="bg-dark-bg px-1 rounded text-qsis">FSC-1208-IslamicStudies/</code></p>
                      <p className="text-[0.7rem] text-dark-text2"><i className="fas fa-check text-green-400 mr-1.5"></i><code className="bg-dark-bg px-1 rounded text-qsis">MAT-1101/</code> <span className="text-dark-text3">(title optional)</span></p>
                      <p className="text-[0.7rem] text-dark-text2"><i className="fas fa-check text-green-400 mr-1.5"></i><code className="bg-dark-bg px-1 rounded text-qsis">ENG-2201-EnglishI/</code></p>
                    </div>
                  </div>

                  {/* Full example */}
                  <div className="ml-9">
                    <p className="text-[0.75rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-lightbulb text-yellow-400 mr-1.5"></i>Full Example — CSE dept, 3rd Semester sheets for FSC-1208:</p>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3 font-mono text-[0.72rem] leading-relaxed">
                      <span className="text-qsis">upload_academic_files</span><span className="text-dark-text2">/</span><span className="text-orange-400">cse</span><span className="text-dark-text2">/</span><span className="text-accent">3rd-semister</span><span className="text-dark-text2">/</span><span className="text-yellow-400">sheet</span><span className="text-dark-text2">/</span><span className="text-green-400">FSC-1208-IslamicStudies</span><span className="text-dark-text2">/</span><span className="text-blue-400">Midterm-Sheet.pdf</span>
                    </div>
                  </div>
                </div>

                {/* Step 5: Upload & Commit */}
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[0.72rem] font-bold text-qsis">5</span>
                    </div>
                    <h4 className="text-[0.85rem] font-semibold">Upload &amp; Commit</h4>
                  </div>
                  <div className="ml-9 space-y-2">
                    <p className="text-[0.78rem] text-dark-text2">
                      Drag &amp; drop your files or click <strong>choose your files</strong>. Then fill in the commit message:
                    </p>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-2.5 font-mono text-[0.72rem]">
                      <span className="text-dark-text2">Commit message:</span>{' '}
                      <span className="text-qsis">Add FSC-1208 (Sheets) — 3rd-semister</span>
                    </div>
                    <p className="text-[0.78rem] text-dark-text2">
                      Select <strong>&quot;Commit directly to the main branch&quot;</strong> and click <strong>Commit changes</strong>.
                    </p>
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-green-500/5 border border-green-500/20">
                      <i className="fas fa-check-circle text-green-400 text-[0.8rem]"></i>
                      <span className="text-[0.75rem] text-green-400">That&apos;s it! Your files will appear in the app within 5 minutes.</span>
                    </div>
                  </div>
                </div>

                {/* Supported files */}
                <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
                  <p className="text-[0.78rem] font-semibold mb-2"><i className="fas fa-info-circle text-qsis mr-1.5"></i>Supported File Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['PDF', 'DOC/DOCX', 'XLS/XLSX', 'PPT/PPTX', 'JPG/PNG', 'CSV'].map(t => (
                      <span key={t} className="px-2 py-0.5 rounded bg-dark-bg border border-dark-border text-[0.65rem] text-dark-text2">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ TAB 2: Direct Upload ═══════════ */}
          {activeTab === 'direct' && (
            <>
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
                          <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" value={department} onChange={e => { setDepartment(e.target.value); setSemester(''); setCategory(''); }}>
                            <option value="">Select...</option>
                            {FACULTIES.map(f => (
                              <optgroup key={f.id} label={`${f.shortName} — ${f.name}`}>
                                {f.departments.map(d => <option key={d.id} value={d.id}>{d.shortName} — {d.name}</option>)}
                              </optgroup>
                            ))}
                          </select>
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
                        <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" value={semester} onChange={e => { setSemester(e.target.value); setCategory(''); }} disabled={!department}>
                          <option value="">Select...</option>
                          {config.semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                          <option value={config.relatedSourcesFolder}>Related Sources (Cross-Semester)</option>
                          {['qsis', 'dawah', 'hadith'].includes(userDeptId) && (
                            <option value={config.relatedKitabsFolder}>Related Kitabs (Shariah Faculty)</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="text-[0.72rem] text-dark-text2 block mb-1">Category *</label>
                        <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" value={category} onChange={e => setCategory(e.target.value)} disabled={!semester}>
                          <option value="">Select...</option>
                          {semester === config.relatedKitabsFolder ? (
                            Object.entries(config.relatedKitabsCategories).map(([key, cat]) => (
                              <option key={key} value={key}>{cat.label}</option>
                            ))
                          ) : semester === config.relatedSourcesFolder ? (
                            <option value={config.relatedSourcesFolder}>Related Sources</option>
                          ) : (
                            <>
                              {Object.entries(config.categories).filter(([k]) => k !== 'other').map(([key, cat]) => (
                                <option key={key} value={cat.folder}>{cat.label}</option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Course Groups */}
                  {courses.map((course, idx) => {
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

                      {category === config.categories.questions.folder && (
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="text-[0.72rem] text-dark-text2 block mb-1">Exam Session *</label>
                            <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. Autumn2026, Spring2024" value={course.examSession || ''} onChange={e => updateCourse(course.id, { examSession: e.target.value })} />
                            <p className="text-[0.6rem] text-dark-text3 mt-0.5">Used to filter: Autumn2026, Spring2024, 2022-2025-Spring</p>
                          </div>
                          <div>
                            <label className="text-[0.72rem] text-dark-text2 block mb-1">Year Range (PDFs)</label>
                            <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. 2022-2025, 2026" value={course.yearRange || ''} onChange={e => updateCourse(course.id, { yearRange: e.target.value })} />
                            <p className="text-[0.6rem] text-dark-text3 mt-0.5">For PDFs: which years this covers</p>
                          </div>
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
                                : category === config.categories.questions.folder && course.examSession
                                  ? `${department}/${semester}/${category}/${folderPreview}/${course.examSession}/`
                                  : `${department}/${semester}/${category}/${folderPreview}/`
                            }
                            <span className="text-dark-text2">*.{/* files go here */}</span>
                          </span>
                        </div>
                      )}

                      <input ref={el => { fileInputRefs.current[course.id] = el; }} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.csv" onChange={e => handleFilesForCourse(course.id, e)} />
                      <div className="border-2 border-dashed border-dark-border rounded-lg p-4 text-center cursor-pointer hover:border-qsis transition-colors" onClick={() => fileInputRefs.current[course.id]?.click()}>
                        <i className="fas fa-cloud-upload-alt text-xl text-dark-text2 mb-1 block"></i>
                        <p className="text-[0.78rem] text-dark-text2">Add files for this course</p>
                        <p className="text-[0.65rem] text-dark-text2">Max 5 files, {config.maxUploadSizeMB}MB each</p>
                      </div>

                      {course.files.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {course.files.map((file, fi) => {
                            const folderName = course.title.trim()
                              ? `${course.code.trim()}-${course.title.trim()}`
                              : course.code.trim() || 'untitled';
                            const fullPath = `${department || '...'}/${semester || '...'}/${category || '...'}/${folderName}/${file.name}`;
                            return (
                              <div key={fi} className="flex items-center gap-2 p-2 rounded-lg bg-dark-bg border border-dark-border">
                                <div className="text-[0.95rem] flex-shrink-0">{getFileIcon(file.name)}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[0.75rem] font-semibold truncate">{file.name}</div>
                                  <div className="text-[0.62rem] text-qsis font-mono truncate mt-0.5">
                                    <i className="fas fa-folder-open mr-1 text-[0.55rem]"></i>{fullPath}
                                  </div>
                                </div>
                                <div className="text-[0.62rem] text-dark-text2 flex-shrink-0">{formatSize(file.size)}</div>
                              <button className="w-5 h-5 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.65rem] hover:bg-red-500/20" onClick={() => removeFileFromCourse(course.id, fi)}>
                                <i className="fas fa-times"></i>
                              </button>
                            </div>
                          )})}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
