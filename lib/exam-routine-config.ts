export interface ExamSlot {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
  order: number;
}

export const DEFAULT_EXAM_SLOTS: ExamSlot[] = [
  { id: 'slot-1', name: '1st Slot', startTime: '09:30 AM', endTime: '12:00 PM', enabled: true, order: 1 },
  { id: 'slot-2', name: '2nd Slot', startTime: '01:30 PM', endTime: '04:00 PM', enabled: true, order: 2 },
  { id: 'slot-3', name: '3rd Slot', startTime: '04:30 PM', endTime: '07:00 PM', enabled: false, order: 3 },
];

const LS_KEY = 'qsis-exam-slots';

export function loadExamSlots(): ExamSlot[] {
  if (typeof window === 'undefined') return DEFAULT_EXAM_SLOTS;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_EXAM_SLOTS;
}

export function saveExamSlots(slots: ExamSlot[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(slots));
}

export function getEnabledSlots(slots?: ExamSlot[]): ExamSlot[] {
  return (slots || loadExamSlots()).filter(s => s.enabled).sort((a, b) => a.order - b.order);
}
