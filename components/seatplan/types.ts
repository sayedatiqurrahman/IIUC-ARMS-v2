'use client';

export interface SeatPlanEntry {
  semester: string;
  date: string;
  slotId: string;
  room: string;
  teacher: string;
  gender: 'male' | 'female' | 'both';
  rollFrom: string;
  rollTo: string;
}

export interface SeatPlanDraft {
  id: string;
  semester: string;
  session: string;
  department: string;
  examType: string;
  entries: SeatPlanEntry[];
  createdAt: number;
  published?: boolean;
  publishedBy?: { name: string; title?: string; email?: string };
  publishedAt?: number;
  status?: string;
  type?: string;
}

export interface BatchConfig {
  id: string;
  name: string;
  prefix: string;
  rollStart: string;
  rollEnd: string;
  excludeRolls: string;
  semester: string;
  department: string;
  createdAt: number;
  lastPromoted: number;
}

export interface StudentResultGroup {
  semester: string;
  semesterLabel: string;
  maleEntries: { plan: SeatPlanDraft; entry: SeatPlanEntry }[];
  femaleEntries: { plan: SeatPlanDraft; entry: SeatPlanEntry }[];
}

export const LS_SEAT_PLAN_DRAFTS = 'qsis-seat-plan-drafts';
export const LS_BATCH_CONFIGS = 'qsis-batch-configs';
export const EXAM_TYPES = ['Midterm', 'Final', 'Quiz', 'Makeup', 'Practical'];
export const DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const SEM_GENDER_MAP: Record<string, 'male' | 'female'> = {
  '1st-semister': 'male', '2nd-semister': 'male', '3rd-semister': 'male', '4th-semister': 'male',
  '5th-semister': 'female', '6th-semister': 'female', '7th-semister': 'female', '8th-semister': 'female',
};

export function getDefaultSession(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return month < 6 ? `Spring - ${year}` : `Autumn - ${year}`;
}

export function generateRollIds(batch: BatchConfig): string[] {
  const prefix = batch.prefix.toUpperCase();
  const start = parseInt(batch.rollStart) || 1;
  const end = parseInt(batch.rollEnd) || 99;
  const excludes = new Set(
    batch.excludeRolls.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
  );
  const ids: string[] = [];
  for (let i = start; i <= end; i++) {
    const id = `${prefix}${String(i).padStart(3, '0')}`;
    if (!excludes.has(id)) ids.push(id);
  }
  return ids;
}

export function getRollCount(from: string, to: string): number {
  if (!from) return 0;
  const matchFrom = from.match(/^(.*?)(\d+)$/);
  const matchTo = (to || from).match(/^(.*?)(\d+)$/);
  if (!matchFrom || !matchTo || matchFrom[1] !== matchTo[1]) return 1;
  const start = parseInt(matchFrom[2]);
  const end = parseInt(matchTo[2]);
  return Math.max(1, end - start + 1);
}

export function rollInRange(roll: string, from: string, to: string): boolean {
  if (!from) return true;
  const r = roll.toUpperCase();
  const f = from.toUpperCase();
  const t = to ? to.toUpperCase() : '';
  if (t) return r >= f && r <= t;
  return r >= f;
}
