'use client';

import { useState } from 'react';
import { config } from '@/lib/config';
import Image from 'next/image';
import { FACULTIES, getAllDepartments } from '@/lib/departments';
import CustomSelect from '@/components/CustomSelect';

const ONBOARDING_KEY = 'iiuc_arms-onboarding';
const CANCEL_COUNT_KEY = 'iiuc_arms-onboard-cancel-count';
const CANCEL_FOREVER_KEY = 'iiuc_arms-onboard-cancel-forever';

// Legacy keys used before the iiuc_arms- prefix (never used for redirects again).
const LEGACY_KEYS = {
  onboarding: 'qsis-onboarding',
  cancelCount: 'qsis-onboard-cancel-count',
  cancelForever: 'qsis-onboard-cancel-forever',
};

// One-time migration so users keep their personalization from the old keys.
function migrateLegacyOnboarding() {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      const legacy = localStorage.getItem(LEGACY_KEYS.onboarding);
      if (legacy) localStorage.setItem(ONBOARDING_KEY, legacy);
    }
    if (!localStorage.getItem(CANCEL_FOREVER_KEY)) {
      const legacy = localStorage.getItem(LEGACY_KEYS.cancelForever);
      if (legacy) localStorage.setItem(CANCEL_FOREVER_KEY, legacy);
    }
    if (!localStorage.getItem(CANCEL_COUNT_KEY)) {
      const legacy = localStorage.getItem(LEGACY_KEYS.cancelCount);
      if (legacy) localStorage.setItem(CANCEL_COUNT_KEY, legacy);
    }
  } catch {}
}

export interface OnboardingData {
  gender: 'male' | 'female';
  department: string;
  semester: string;
  fileView: 'all-prioritized' | 'my-semester-only';
  completedAt: number;
}

export function getOnboardingData(): OnboardingData | null {
  if (typeof window === 'undefined') return null;
  migrateLegacyOnboarding();
  try {
    const raw = localStorage.getItem(ONBOARDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function hasSkippedForever(): boolean {
  if (typeof window === 'undefined') return false;
  migrateLegacyOnboarding();
  return localStorage.getItem(CANCEL_FOREVER_KEY) === 'true';
}

export function setOnboardingData(data: OnboardingData) {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data));
}

export function clearOnboardingData() {
  localStorage.removeItem(ONBOARDING_KEY);
  localStorage.removeItem(CANCEL_COUNT_KEY);
  localStorage.removeItem(CANCEL_FOREVER_KEY);
  localStorage.removeItem(LEGACY_KEYS.onboarding);
  localStorage.removeItem(LEGACY_KEYS.cancelCount);
  localStorage.removeItem(LEGACY_KEYS.cancelForever);
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
  const [showDeptPicker, setShowDeptPicker] = useState(false);

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4">
      <div className="bg-dark-bg2 border border-dark-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative max-h-[90vh] flex flex-col">
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
              <Image src="/arms-logo-icon.png" alt="IIUC-ARMS" width={64} height={64} className="w-16 h-16 p-1 rounded-xl border-2 border-qsis object-contain bg-white mx-auto mb-4" />
              <h2 className="text-xl font-bold text-dark-text mb-1">Welcome to IIUC-ARMS</h2>
              <p className="text-[0.8rem] text-dark-text2">Let&apos;s personalize your experience. This helps us show you the most relevant files.</p>
            </div>
            <div className="px-6 py-6 space-y-5 overflow-y-auto flex-1 min-h-0">
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
                <CustomSelect
                  value={semester}
                  onChange={setSemester}
                  placeholder="Select semester..."
                  options={config.semesters.map(s => ({ value: s.label, label: s.label, icon: 'fa-graduation-cap' }))}
                  size="md"
                />
              </div>
              <div>
                <label className="text-[0.78rem] font-semibold text-dark-text mb-2 block">Department</label>
                <button type="button" onClick={() => setShowDeptPicker(true)} className="w-full px-3 py-2.5 rounded-xl border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] text-left flex items-center justify-between cursor-pointer hover:border-qsis transition-colors">
                  <span className="flex items-center gap-2 truncate">
                    {selectedDept && <i className={`fas ${selectedDept.department.icon || 'fa-building'} text-qsis text-[0.75rem]`}></i>}
                    <span className="truncate">{selectedDept ? `${selectedDept.department.shortName} — ${selectedDept.department.name}` : 'Select department'}</span>
                  </span>
                  <i className="fas fa-chevron-down text-dark-text3 text-[0.65rem] flex-shrink-0 ml-2"></i>
                </button>
                {selectedDept && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-bg3 border border-dark-border text-[0.75rem]">
                    <i className="fas fa-building text-qsis"></i>
                    <span className="text-dark-text2">{selectedDept.faculty.shortName} &rarr; <strong className="text-dark-text">{selectedDept.department.shortName}</strong></span>
                  </div>
                )}
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

        {/* Custom Department Picker Modal */}
        {showDeptPicker && (
          <div className="absolute inset-0 z-20 bg-dark-bg2 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
              <button onClick={() => setShowDeptPicker(false)} className="text-dark-text2 hover:text-dark-text text-sm cursor-pointer bg-transparent border-none">
                <i className="fas fa-arrow-left"></i>
              </button>
              <span className="text-sm font-semibold text-dark-text">Select Department</span>
              <div className="w-6"></div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {FACULTIES.map(f => (
                <div key={f.id}>
                  <div className="px-4 py-2 bg-dark-bg3/50 sticky top-0 z-10">
                    <span className="text-[0.7rem] font-bold text-dark-text3 uppercase tracking-wider">{f.shortName}</span>
                  </div>
                  {f.departments.map(d => (
                    <button
                      key={d.id}
                      onClick={() => { setSelectedDeptId(d.id); setShowDeptPicker(false); }}
                      className={`w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer border-none transition-colors ${selectedDeptId === d.id ? 'bg-qsis/10' : 'bg-transparent hover:bg-dark-bg3'}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-qsis to-accent flex items-center justify-center text-white text-[0.65rem] flex-shrink-0">
                        <i className={`fas ${d.icon || 'fa-building'}`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[0.82rem] font-semibold text-dark-text truncate">{d.shortName}</div>
                        <div className="text-[0.65rem] text-dark-text3 truncate">{d.name}</div>
                      </div>
                      {selectedDeptId === d.id && <i className="fas fa-check text-qsis text-[0.7rem] flex-shrink-0"></i>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
