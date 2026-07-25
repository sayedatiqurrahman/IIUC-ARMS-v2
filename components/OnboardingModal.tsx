'use client';

import { useState } from 'react';
import { config } from '@/lib/config';
import Image from 'next/image';
import { FACULTIES, getAllDepartments } from '@/lib/departments';

const ONBOARDING_KEY = 'qsis-onboarding';
const CANCEL_COUNT_KEY = 'qsis-onboard-cancel-count';
const CANCEL_FOREVER_KEY = 'qsis-onboard-cancel-forever';

export interface OnboardingData {
  gender: 'male' | 'female';
  department: string;
  semester: string;
  fileView: 'all-prioritized' | 'my-semester-only';
  completedAt: number;
}

export function getOnboardingData(): OnboardingData | null {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem(CANCEL_FOREVER_KEY) === 'true') return { gender: 'male', department: "Qur'anic Sciences and Islamic Studies", semester: '1st Semester', fileView: 'all-prioritized', completedAt: 0 };
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setOnboardingData(data: OnboardingData) {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data));
}

export function clearOnboardingData() {
  localStorage.removeItem(ONBOARDING_KEY);
}

function getCancelCount(): number {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem(CANCEL_COUNT_KEY) || '0', 10);
}

function incrementCancelCount(): number {
  const c = getCancelCount() + 1;
  localStorage.setItem(CANCEL_COUNT_KEY, String(c));
  return c;
}

export default function OnboardingModal({ onComplete, onClose }: { onComplete: (data: OnboardingData) => void; onClose: () => void }) {
  const allDepts = getAllDepartments();
  const defaultDept = allDepts.find(d => d.department.id === 'qsis');

  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [semester, setSemester] = useState(config.semesters[0]?.label || '1st Semester');
  const [fileView, setFileView] = useState<'all-prioritized' | 'my-semester-only'>('all-prioritized');
  const [step, setStep] = useState(0);
  const [selectedDeptId, setSelectedDeptId] = useState(defaultDept?.department.id || 'qsis');
  const [showCancelForever, setShowCancelForever] = useState(false);

  const handleClose = () => {
    const count = incrementCancelCount();
    if (count >= 3) {
      setShowCancelForever(true);
    } else {
      onClose();
    }
  };

  const handleCancelForever = () => {
    localStorage.setItem(CANCEL_FOREVER_KEY, 'true');
    onClose();
  };

  const selectedDept = allDepts.find(d => d.department.id === selectedDeptId);

  const handleSubmit = () => {
    const data: OnboardingData = {
      gender,
      department: selectedDept?.department.name || "Qur'anic Sciences and Islamic Studies",
      semester,
      fileView,
      completedAt: Date.now(),
    };
    setOnboardingData(data);
    onComplete(data);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
        {/* Close button */}
        <button onClick={handleClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-dark-bg3/80 hover:bg-dark-bg3 flex items-center justify-center text-dark-text2 hover:text-dark-text border-none cursor-pointer z-10 transition-colors" title="Close">
          <i className="fas fa-times text-sm"></i>
        </button>

        {showCancelForever && (
          <div className="px-6 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-yellow-500/15 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-hand-paper text-2xl text-yellow-500"></i>
            </div>
            <h3 className="text-lg font-bold text-dark-text mb-2">Skip permanently?</h3>
            <p className="text-[0.8rem] text-dark-text2 mb-6">You&apos;ve skipped this 3 times. Want to never see this again? You can always reset it from your browser settings.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelForever(false)} className="flex-1 py-2.5 rounded-xl border border-dark-border bg-dark-bg text-dark-text2 text-[0.85rem] font-medium cursor-pointer hover:bg-dark-bg3 transition-colors">
                Go Back
              </button>
              <button onClick={handleCancelForever} className="flex-1 py-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[0.85rem] font-semibold cursor-pointer hover:bg-yellow-500/25 transition-colors">
                Skip Forever
              </button>
            </div>
          </div>
        )}

        {!showCancelForever && step === 0 && (
          <>
            <div className="bg-gradient-to-br from-qsis/20 to-accent/10 px-6 py-8 text-center">
              <Image src="/arms-logo.png" alt="QSIS-ARMS" width={64} height={64} className="w-16 h-16 p-1 rounded-xl border-2 border-qsis object-contain bg-white mx-auto mb-4" />
              <h2 className="text-xl font-bold text-dark-text mb-1">Welcome to QSIS-ARMS</h2>
              <p className="text-[0.8rem] text-dark-text2">Let&apos;s personalize your experience. This helps us show you the most relevant files.</p>
            </div>
            <div className="px-6 py-6 space-y-5">
              <div>
                <label className="text-[0.78rem] font-semibold text-dark-text mb-2 block">I am a</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setGender('male')} className={`px-4 py-3 rounded-xl border-2 text-[0.85rem] font-medium cursor-pointer transition-all ${gender === 'male' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-dark-border bg-dark-bg text-dark-text2 hover:border-dark-border2'}`}>
                    <i className="fas fa-mars text-lg mb-1 block"></i> Male
                  </button>
                  <button onClick={() => setGender('female')} className={`px-4 py-3 rounded-xl border-2 text-[0.85rem] font-medium cursor-pointer transition-all ${gender === 'female' ? 'border-pink-500 bg-pink-500/10 text-pink-400' : 'border-dark-border bg-dark-bg text-dark-text2 hover:border-dark-border2'}`}>
                    <i className="fas fa-venus text-lg mb-1 block"></i> Female
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[0.78rem] font-semibold text-dark-text mb-2 block">Semester</label>
                <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis">
                  {config.semesters.map(s => <option key={s.id} value={s.label}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[0.78rem] font-semibold text-dark-text mb-2 block">Department</label>
                <select value={selectedDeptId} onChange={e => setSelectedDeptId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis">
                  {FACULTIES.map(f => (
                    <optgroup key={f.id} label={f.name}>
                      {f.departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6">
              <button onClick={() => setStep(1)} className="w-full py-3 rounded-xl bg-qsis text-white font-semibold text-[0.9rem] border-none cursor-pointer hover:opacity-90 transition-opacity">
                Continue <i className="fas fa-arrow-right ml-2"></i>
              </button>
            </div>
          </>
        )}

        {!showCancelForever && step === 1 && (
          <>
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-lg font-bold text-dark-text mb-1">File Visibility</h3>
              <p className="text-[0.78rem] text-dark-text2">How would you like to browse academic files?</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <button onClick={() => setFileView('all-prioritized')} className={`w-full px-4 py-4 rounded-xl border-2 text-left cursor-pointer transition-all ${fileView === 'all-prioritized' ? 'border-qsis bg-qsis/10' : 'border-dark-border bg-dark-bg hover:border-dark-border2'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${fileView === 'all-prioritized' ? 'border-qsis' : 'border-dark-border2'}`}>
                    {fileView === 'all-prioritized' && <div className="w-2.5 h-2.5 rounded-full bg-qsis"></div>}
                  </div>
                  <div>
                    <p className="text-[0.85rem] font-semibold text-dark-text">All Files — Prioritize My Semester</p>
                    <p className="text-[0.72rem] text-dark-text2 mt-0.5">See files from all semesters, but your {semester} files appear first</p>
                  </div>
                </div>
              </button>
              <button onClick={() => setFileView('my-semester-only')} className={`w-full px-4 py-4 rounded-xl border-2 text-left cursor-pointer transition-all ${fileView === 'my-semester-only' ? 'border-qsis bg-qsis/10' : 'border-dark-border bg-dark-bg hover:border-dark-border2'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${fileView === 'my-semester-only' ? 'border-qsis' : 'border-dark-border2'}`}>
                    {fileView === 'my-semester-only' && <div className="w-2.5 h-2.5 rounded-full bg-qsis"></div>}
                  </div>
                  <div>
                    <p className="text-[0.85rem] font-semibold text-dark-text">My Semester Only</p>
                    <p className="text-[0.72rem] text-dark-text2 mt-0.5">Only see files for {semester}</p>
                  </div>
                </div>
              </button>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setStep(0)} className="px-4 py-3 rounded-xl border border-dark-border bg-dark-bg text-dark-text2 text-[0.85rem] font-medium cursor-pointer hover:bg-dark-bg3 transition-colors">
                <i className="fas fa-arrow-left mr-2"></i> Back
              </button>
              <button onClick={handleSubmit} className="flex-1 py-3 rounded-xl bg-qsis text-white font-semibold text-[0.9rem] border-none cursor-pointer hover:opacity-90 transition-opacity">
                Get Started <i className="fas fa-check ml-2"></i>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
