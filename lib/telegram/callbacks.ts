// ─── Callback data builders ───────────────────────────────────────

export function catCallbackData(courseCode: string, category: string): string {
  return `cat:${courseCode}:${category}`;
}

export function deleteConfirmData(courseId: string): string {
  return `del_confirm:${courseId}`;
}

export function deleteRejectData(courseId: string): string {
  return `del_reject:${courseId}`;
}

export function delFileConfirmData(activityId: string): string {
  return `del_file_confirm:${activityId}`;
}

export function delFileRejectData(activityId: string): string {
  return `del_file_reject:${activityId}`;
}

export function broadcastCallbackData(action: 'confirm' | 'cancel'): string {
  return `broadcast:${action}`;
}

export function connectConfirmData(): string {
  return `connect_confirm`;
}

export function connectCancelData(): string {
  return `connect_cancel`;
}

export function parseCallbackData(data: string): { type: string; args: string[] } | null {
  const parts = data.split(':');
  if (parts[0] === 'cat' && parts.length === 3) {
    return { type: 'cat', args: [parts[1], parts[2]] };
  }
  if (parts[0] === 'search' && parts.length >= 2) {
    return { type: 'search', args: [parts.slice(1).join(':')] };
  }
  if (parts[0] === 'del_confirm' && parts.length === 2) {
    return { type: 'del_confirm', args: [parts[1]] };
  }
  if (parts[0] === 'del_reject' && parts.length === 2) {
    return { type: 'del_reject', args: [parts[1]] };
  }
  if (parts[0] === 'del_file_confirm' && parts.length === 2) {
    return { type: 'del_file_confirm', args: [parts[1]] };
  }
  if (parts[0] === 'del_file_reject' && parts.length === 2) {
    return { type: 'del_file_reject', args: [parts[1]] };
  }
  if (parts[0] === 'broadcast' && parts.length >= 2) {
    return { type: 'broadcast', args: [parts[1]] };
  }
  // Start menu callbacks
  if (data === 'start_faculties') return { type: 'start_faculties', args: [] };
  if (data === 'start_contributors') return { type: 'start_contributors', args: [] };
  if (data === 'start_devby') return { type: 'start_devby', args: [] };
  if (data === 'start_help') return { type: 'start_help', args: [] };
  // Connect flow callbacks
  if (data === 'connect_confirm') return { type: 'connect_confirm', args: [] };
  if (data === 'connect_cancel') return { type: 'connect_cancel', args: [] };
  return null;
}