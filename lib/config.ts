import { FACULTIES } from './departments';

export type UserRole = 'admin' | 'manager' | 'teacher' | 'student' | 'user' | 'external';

export const APP_VERSION = '2.4.0';

export const config = {
  owner: 'sayedatiqurrahman',
  repo: 'QSIS-ACADEMIC-FILES-MANAFGER',
  branch: 'main',
  uploadPath: 'upload_academic_files',
  relatedKitabsFolder: 'related-kitabs',
  relatedKitabsParent: 'shariah',
  relatedSourcesFolder: 'related-sources',
  founderName: 'Sayed Atiqur Rahman',
  founderAgency: 'Programming Light',
  adobeClientId: process.env.NEXT_PUBLIC_ADOBE_CLIENT_ID || '',
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
  emailRegex: /^[^@]+@(?:ugrad\.)?iiuc\.ac\.bd$/i,
  adminEmails: [
    's.atiqurrahman2003@gmail.com',
    'quranicsciencesclub@gmail.com',
    'iiucqsisclub@gmail.com',
    'q233099@ugrad.iiuc.ac.bd',
  ],
  ownerEmails: [
    'quranicsciencesclub@gmail.com',
    's.atiqurrahman2003@gmail.com',
    'q233099@ugrad.iiuc.ac.bd',
  ],
  detectRole: (email: string): UserRole => {
    const lower = email.toLowerCase();
    if (config.adminEmails.includes(lower)) return 'admin';
    if (/@iiuc\.ac\.bd$/i.test(lower) && !/@ugrad\.iiuc\.ac\.bd$/i.test(lower)) return 'teacher';
    if (/@ugrad\.iiuc\.ac\.bd$/i.test(lower)) return 'student';
    // Non-university emails (gmail, yahoo, etc.) are external users
    if (!/@iiuc\.ac\.bd$/i.test(lower)) return 'external';
    return 'user';
  },
  getEffectiveRole: (email: string, profileRole?: string): UserRole => {
    const base = config.detectRole(email);
    if (base === 'admin') return 'admin';
    if (profileRole === 'admin') return 'admin';
    if (profileRole === 'manager') return 'manager';
    if (profileRole === 'teacher') return 'teacher';
    return base;
  },
  isManager: (email: string, profileRole?: string): boolean => {
    return config.getEffectiveRole(email, profileRole) === 'manager';
  },
  isAdminOrAbove: (email: string, profileRole?: string): boolean => {
    const r = config.getEffectiveRole(email, profileRole);
    return r === 'admin';
  },
  canManageAdmins: (email: string): boolean => {
    return config.ownerEmails.includes(email.toLowerCase());
  },
  canPromoteManager: (email: string, profileRole?: string): boolean => {
    const r = config.getEffectiveRole(email, profileRole);
    return r === 'admin';
  },
  canPublishRoutine: (email: string, profile?: { role?: string; isCR?: boolean }): boolean => {
    const role = config.getEffectiveRole(email, profile?.role);
    if (role === 'admin' || role === 'manager' || role === 'teacher') return true;
    if (profile?.isCR) return true;
    return false;
  },
  maxFilesPerUpload: 10,
  maxUploadSizeMB: 50,
  academicExtensions: ['pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png','webp','csv'],
  githubStarRepos: [
    { owner: 'sayedatiqurrahman', repo: 'QSIS-ACADEMIC-FILES-MANAFGER', label: 'QSIS Academic Files' },
    { owner: 'sayedatiqurrahman', repo: 'QSIS-ARMS-v2', label: 'IIUC-ARMS Source Code' },
  ],
  semesters: [
    { id: '1st-semister', label: '1st Semester' },
    { id: '2nd-semister', label: '2nd Semester' },
    { id: '3rd-semister', label: '3rd Semester' },
    { id: '4th-semister', label: '4th Semester' },
    { id: '5th-semister', label: '5th Semester' },
    { id: '6th-semister', label: '6th Semester' },
    { id: '7th-semister', label: '7th Semester' },
    { id: '8th-semister', label: '8th Semester' },
  ],
  categories: {
    sheet: { label: 'Sheets', icon: 'scroll', color: '#3b82f6', folder: 'sheet' },
    notes: { label: 'Notes', icon: 'sticky-note', color: '#22c55e', folder: 'NOTES' },
    questions: { label: 'Previous Questions', icon: 'question-circle', color: '#f59e0b', folder: 'Previous Questions' },
    syllabus: { label: 'Syllabus', icon: 'graduation-cap', color: '#8b5cf6', folder: 'Syllabus' },
    other: { label: 'Other', icon: 'folder', color: '#94a3b8', folder: 'Other' },
  },
  relatedKitabsCategories: {
    'quran-tafsir': { label: 'Quran & Tafsir', icon: 'book-quran', color: '#10b981' },
    'hadith': { label: 'Hadith', icon: 'book', color: '#f97316' },
    'fiqh': { label: 'Fiqh', icon: 'balance-scale', color: '#6366f1' },
    'aqeedah': { label: 'Aqeedah', icon: 'mosque', color: '#ec4899' },
    'seerah': { label: 'Seerah', icon: 'user-graduate', color: '#14b8a6' },
    'general': { label: 'General', icon: 'folder-open', color: '#94a3b8' },
  },

  // ─── Department folder helpers ──────────────────────────────────
  allDepartmentIds: (() => {
    const ids = new Set<string>();
    ids.add('shariah'); // special: Shariah faculty combined folder
    for (const f of FACULTIES) {
      for (const d of f.departments) ids.add(d.id);
    }
    return ids;
  })(),

  isDepartmentId: (id: string): boolean => {
    return config.allDepartmentIds.has(id);
  },

  isSemesterId: (id: string): boolean => {
    return config.semesters.some(s => s.id === id) || id === config.relatedKitabsFolder || id === config.relatedSourcesFolder;
  },
};
