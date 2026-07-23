'use client';

import { useState, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { config } from '@/lib/config';
import type { Profile } from '@/lib/store';

interface CourseGroup {
  id: number;
  code: string;
  title: string;
  files: File[];
}

interface UploadModalProps {
  session: any;
  status: string;
  profile: Profile;
  onLogin: () => void;
  onClose: () => void;
}

export default function UploadModal({ session, status, profile, onLogin, onClose }: UploadModalProps) {
  const [semester, setSemester] = useState(profile.semester || '');
  const [category, setCategory] = useState('');
  const [courses, setCourses] = useState<CourseGroup[]>([{ id: 1, code: '', title: '', files: [] }]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean } | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const hasGitHub = !!(session as any)?.accessToken;

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
    if (!semester || !category) return false;
    return courses.some(c => c.code.trim() && c.files.length > 0);
  }

  async function handleSubmit() {
    if (!semester || !category) {
      alert('Please select semester and category.');
      return;
    }

    const validCourses = courses.filter(c => c.code.trim() && c.files.length > 0);
    if (validCourses.length === 0) {
      alert('At least one course must have a code and files.');
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
          allFiles.push({
            path: `${semester}/${category}/${folderName}/${file.name}`,
            content: base64,
          });
        }
      }

      const courseList = validCourses.map(c => c.title.trim() ? `${c.code} - ${c.title}` : c.code).join(', ');

      const res = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: allFiles.map(f => ({ path: f.path, url: '', content: f.content })),
          message: `Add ${courseList} (${category}) — ${semester}`,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, prUrl: data.pr?.url });
        setCourses([{ id: 1, code: '', title: '', files: [] }]);
      } else {
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'AUTH_REQUIRED') {
          setResult({ success: false, error: data.error, tokenExpired: true });
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
            <button className="w-full py-3 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white border-none font-semibold cursor-pointer hover:opacity-90 transition-opacity" onClick={() => signIn('github', { callbackUrl: '/' })}>
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

  // Upload form
  return (
    <div className="modal active" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-base font-semibold"><i className="fas fa-upload"></i> Contribute Files</h2>
          <button className="text-dark-text2 cursor-pointer bg-transparent border-none" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">
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
              {/* Semester & Category — shared */}
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Semester *</label>
                    <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" value={semester} onChange={e => { setSemester(e.target.value); setCategory(''); }}>
                      <option value="">Select...</option>
                      {config.semesters.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      <option value={config.relatedKitabsFolder}>Related Kitabs</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.72rem] text-dark-text2 block mb-1">Category *</label>
                    <select className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" value={category} onChange={e => setCategory(e.target.value)}>
                      <option value="">Select...</option>
                      {semester === config.relatedKitabsFolder ? (
                        Object.entries(config.relatedKitabsCategories).map(([key, cat]) => (
                          <option key={key} value={key}>{cat.label}</option>
                        ))
                      ) : (
                        <>
                          <option value="sheet">Sheets</option>
                          <option value="question">Previous Questions</option>
                          <option value="note">Notes</option>
                          <option value="syllabus">Syllabus</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Course Groups */}
              {courses.map((course, idx) => (
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

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Code *</label>
                      <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. FSC-1208" value={course.code} onChange={e => updateCourse(course.id, { code: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Title</label>
                      <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. Islamic Studies" value={course.title} onChange={e => updateCourse(course.id, { title: e.target.value })} />
                    </div>
                  </div>

                  {/* File picker for this course */}
                  <input ref={el => { fileInputRefs.current[course.id] = el; }} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.csv" onChange={e => handleFilesForCourse(course.id, e)} />
                  <div className="border-2 border-dashed border-dark-border rounded-lg p-4 text-center cursor-pointer hover:border-qsis transition-colors" onClick={() => fileInputRefs.current[course.id]?.click()}>
                    <i className="fas fa-cloud-upload-alt text-xl text-dark-text2 mb-1 block"></i>
                    <p className="text-[0.78rem] text-dark-text2">Add files for this course</p>
                    <p className="text-[0.65rem] text-dark-text2">Max 5 files, {config.maxUploadSizeMB}MB each</p>
                  </div>

                  {course.files.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {course.files.map((file, fi) => (
                        <div key={fi} className="flex items-center gap-2 p-2 rounded-lg bg-dark-bg border border-dark-border">
                          <div className="text-[0.95rem] flex-shrink-0">{getFileIcon(file.name)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[0.75rem] font-semibold truncate">{file.name}</div>
                            <div className="text-[0.65rem] text-dark-text2">{formatSize(file.size)}</div>
                          </div>
                          <button className="w-5 h-5 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.65rem] hover:bg-red-500/20" onClick={() => removeFileFromCourse(course.id, fi)}>
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Add another course */}
              {courses.length < 5 && (
                <button className="w-full py-2.5 rounded-xl border-2 border-dashed border-dark-border text-dark-text2 text-[0.8rem] font-semibold bg-transparent cursor-pointer hover:border-qsis hover:text-qsis transition-all mb-4" onClick={addCourse}>
                  <i className="fas fa-plus mr-1.5"></i> Add Another Course
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
                    <button className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white border-none font-semibold text-[0.82rem] cursor-pointer" onClick={() => { onClose(); signIn('github', { callbackUrl: '/' }); }}>
                      <i className="fab fa-github mr-2"></i>Reconnect GitHub
                    </button>
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
