'use client';

import { useState, useRef } from 'react';
import { signIn } from 'next-auth/react';
import { config } from '@/lib/config';
import type { Profile } from '@/lib/store';

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
  const [courseName, setCourseName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; prUrl?: string; error?: string; tokenExpired?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasGitHub = !!(session as any)?.accessToken;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter(f => f.size <= config.maxUploadSizeMB * 1024 * 1024);
    if (valid.length < selected.length) {
      alert(`${selected.length - valid.length} file(s) exceeded ${config.maxUploadSizeMB}MB limit and were skipped.`);
    }
    setFiles(prev => [...prev, ...valid].slice(0, config.maxFilesPerUpload));
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
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

  async function handleSubmit() {
    if (!semester || !category || !courseName.trim()) {
      alert('Please fill in semester, category, and course name.');
      return;
    }
    if (files.length === 0) {
      alert('Please select at least one file.');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const uploadedFiles = [];
      for (const file of files) {
        const base64 = await file.arrayBuffer().then(buf => {
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return btoa(binary);
        });
        uploadedFiles.push({
          path: `${semester}/${category}/${courseName.trim()}/${file.name}`,
          content: base64,
        });
      }

      const res = await fetch('/api/github/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: uploadedFiles.map(f => ({ path: f.path, url: '', content: f.content })),
          message: `Add ${courseName} - ${category} (${semester})`,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, prUrl: data.pr?.url });
        setFiles([]);
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

  // Logged in but no GitHub connected
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

            {/* Steps */}
            <div className="mb-5">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[0.72rem] font-bold text-qsis">1</span>
                  </div>
                  <div>
                    <span className="text-[0.82rem] font-semibold block">Sign in with Google</span>
                    <span className="text-[0.72rem] text-dark-text2">Use your IIUC email ({profile.email || session?.user?.email || 'your email'})</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[0.72rem] font-bold text-qsis">2</span>
                  </div>
                  <div>
                    <span className="text-[0.82rem] font-semibold block">Connect GitHub Account</span>
                    <span className="text-[0.72rem] text-dark-text2">One click to link your GitHub for PR submissions</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[0.72rem] font-bold text-qsis">3</span>
                  </div>
                  <div>
                    <span className="text-[0.82rem] font-semibold block">Upload & Submit</span>
                    <span className="text-[0.72rem] text-dark-text2">Files are submitted as a Pull Request for review</span>
                  </div>
                </div>
              </div>
            </div>

            {/* No GitHub account? */}
            <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
              <p className="text-[0.78rem] text-dark-text2 mb-2"><i className="fas fa-question-circle text-qsis mr-1.5"></i>Don&apos;t have a GitHub account?</p>
              <a href="https://github.com/signup" target="_blank" rel="noopener noreferrer" className="text-[0.82rem] text-qsis font-semibold hover:underline">
                Create one free at github.com/signup <i className="fas fa-external-link-alt text-[0.65rem] ml-1"></i>
              </a>
              <p className="text-[0.7rem] text-dark-text2 mt-2">It takes 2 minutes. Then come back and connect here.</p>
            </div>

            {/* Connect Button */}
            <button className="w-full py-3 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 text-white border-none font-semibold cursor-pointer hover:opacity-90 transition-opacity" onClick={() => signIn('github', { callbackUrl: '/' })}>
              <i className="fab fa-github mr-2"></i> Connect GitHub Account
            </button>

            {/* Data repo info */}
            <div className="mt-4 p-3 rounded-lg bg-qsis/5 border border-qsis/10">
              <p className="text-[0.72rem] text-dark-text2 text-center">
                <i className="fas fa-info-circle text-qsis mr-1"></i>
                Files are stored in <a href="https://github.com/sayedatiqurrahman/QSIS-ACADEMIC-FILES-MANAFGER" target="_blank" rel="noopener noreferrer" className="text-qsis font-semibold hover:underline">QSIS-ACADEMIC-FILES-MANAFGER</a> &mdash; fork it to contribute directly.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in with GitHub - show upload form
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
              <button className="block mx-auto mt-3 px-4 py-2 text-qsis text-[0.82rem] font-semibold bg-transparent border-none cursor-pointer hover:underline" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <>
              {/* How it works */}
              <div className="mb-5">
                <h4 className="text-[0.88rem] font-semibold mb-3">How it works:</h4>
                <div className="flex flex-col gap-3">
                  {[
                    { num: '1', title: 'Select Location', desc: 'Choose semester, category, and course' },
                    { num: '2', title: 'Pick Files', desc: 'Select academic files to upload' },
                    { num: '3', title: 'Submit for Review', desc: 'Auto PR created with your profile info' },
                  ].map(s => (
                    <div key={s.num} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-qsis/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[0.72rem] font-bold text-qsis">{s.num}</span>
                      </div>
                      <div>
                        <span className="text-[0.82rem] font-semibold block">{s.title}</span>
                        <span className="text-[0.72rem] text-dark-text2">{s.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upload Form */}
              <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
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
                <div className="mb-3">
                  <label className="text-[0.72rem] text-dark-text2 block mb-1">Course Name *</label>
                  <input type="text" className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none" placeholder="e.g. FSC-1208" value={courseName} onChange={e => setCourseName(e.target.value)} />
                </div>

                {/* File Input */}
                <input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.csv" onChange={handleFileChange} />
                <div className="border-2 border-dashed border-dark-border rounded-lg p-6 text-center cursor-pointer hover:border-qsis transition-colors" onClick={() => fileInputRef.current?.click()}>
                  <i className="fas fa-cloud-upload-alt text-2xl text-dark-text2 mb-2 block"></i>
                  <p className="text-[0.82rem] text-dark-text2">Drop files here or click to browse</p>
                  <p className="text-[0.68rem] text-dark-text2 mt-1">PDF, DOC, XLS, PPT, Images (max {config.maxUploadSizeMB}MB each, {config.maxFilesPerUpload} files max)</p>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {files.map((file, i) => (
                      <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-dark-bg border border-dark-border">
                        <div className="text-[1.1rem] flex-shrink-0">{getFileIcon(file.name)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[0.8rem] font-semibold truncate">{file.name}</div>
                          <div className="text-[0.68rem] text-dark-text2">{formatSize(file.size)}</div>
                        </div>
                        <button className="w-6 h-6 rounded bg-red-500/10 text-red-400 border-none cursor-pointer flex items-center justify-center text-[0.7rem] hover:bg-red-500/20" onClick={() => removeFile(i)}>
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Auto-filled info */}
              <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-4">
                <p className="text-[0.72rem] text-dark-text2 mb-2">Your info will be auto-included in the PR:</p>
                <div className="flex flex-wrap gap-2">
                  {profile.universityId && <span className="px-2 py-1 rounded bg-dark-bg3 text-[0.7rem] font-mono">{profile.universityId}</span>}
                  {!profile.universityId && <span className="px-2 py-1 rounded bg-dark-bg3 text-[0.7rem] font-mono text-dark-text2">ID not set</span>}
                  <span className="px-2 py-1 rounded bg-dark-bg3 text-[0.7rem] font-mono">{session?.user?.email || ''}</span>
                  <span className="px-2 py-1 rounded bg-dark-bg3 text-[0.7rem] font-mono">{profile.name || (session as any)?.user?.name || ''}</span>
                </div>
                {!profile.universityId && (
                  <p className="text-[0.68rem] text-yellow-500 mt-2"><i className="fas fa-exclamation-triangle mr-1"></i>Set your University ID in Dashboard first.</p>
                )}
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
                disabled={uploading || files.length === 0 || !semester || !category || !courseName.trim()}
              >
                {uploading ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>Creating PR...</>
                ) : (
                  <><i className="fas fa-paper-plane mr-2"></i>Submit for Review</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
