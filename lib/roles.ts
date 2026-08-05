import { config } from './config';
import type { UserRole } from './config';

// Role auto-assigned at account creation purely from the email domain:
//   @iiuc.ac.bd       -> teacher  (faculty / staff)
//   @ugrad.iiuc.ac.bd -> student  (undergraduate)
//   others            -> 'user'   (no special role until an admin assigns one)
export function roleForEmail(email: string): UserRole {
  const lower = (email || '').toLowerCase();
  if (config.adminEmails.includes(lower)) return 'admin';
  if (/@iiuc\.ac\.bd$/i.test(lower) && !/@ugrad\.iiuc\.ac\.bd$/i.test(lower)) return 'teacher';
  if (/@ugrad\.iiuc\.ac\.bd$/i.test(lower)) return 'student';
  return 'user';
}

// "My Routine" is teacher-only: university teacher emails, profiles with a
// teacher role, or non-versity admins who selected the teacher info type.
export function isTeacherUser(email: string, profile?: { role?: string; profileType?: string }): boolean {
  const lower = (email || '').toLowerCase();
  const isVersityEmail = /@(?:ugrad\.)?iiuc\.ac\.bd$/i.test(lower);
  const isStudentEmail = /@ugrad\.iiuc\.ac\.bd$/i.test(lower);
  const isTeacherEmail = isVersityEmail && !isStudentEmail;
  const role = config.getEffectiveRole(lower, profile?.role);
  const isNonVersityAdmin = role === 'admin' && !isVersityEmail;
  if (role === 'teacher' || isTeacherEmail) return true;
  if (role === 'admin' || role === 'manager') return true;
  if (isNonVersityAdmin && profile?.profileType === 'teacher') return true;
  return false;
}
