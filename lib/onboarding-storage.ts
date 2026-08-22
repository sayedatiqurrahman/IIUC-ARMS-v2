const ONBOARDING_KEY = 'iiuc_arms-onboarding';
const DISMISSED_KEY = 'iiuc_arms-onboard-dismissed';

// Legacy keys used before the iiuc_arms- prefix (never used for redirects again).
const LEGACY_KEYS = {
  onboarding: 'qsis-onboarding',
  cancelCount: 'qsis-onboard-cancel-count',
  cancelForever: 'qsis-onboard-cancel-forever',
};

// One-time migration so users keep their personalization from the old keys,
// and anyone who previously skipped/closed the modal is treated as dismissed
// (so they are never nagged again after a deployment/update).
function migrateLegacyOnboarding() {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      const legacy = localStorage.getItem(LEGACY_KEYS.onboarding);
      if (legacy) localStorage.setItem(ONBOARDING_KEY, legacy);
    }
    const hadLegacySkip =
      localStorage.getItem(LEGACY_KEYS.cancelForever) === 'true' ||
      parseInt(localStorage.getItem(LEGACY_KEYS.cancelCount) || '0', 10) > 0;
    if (hadLegacySkip && !localStorage.getItem(DISMISSED_KEY)) {
      localStorage.setItem(DISMISSED_KEY, 'true');
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

export function hasDismissedOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  migrateLegacyOnboarding();
  return localStorage.getItem(DISMISSED_KEY) === 'true';
}

export function dismissOnboarding(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISMISSED_KEY, 'true');
}

export function setOnboardingData(data: OnboardingData) {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(data));
}

export function clearOnboardingData() {
  localStorage.removeItem(ONBOARDING_KEY);
  localStorage.removeItem(DISMISSED_KEY);
  localStorage.removeItem(LEGACY_KEYS.onboarding);
  localStorage.removeItem(LEGACY_KEYS.cancelCount);
  localStorage.removeItem(LEGACY_KEYS.cancelForever);
}
