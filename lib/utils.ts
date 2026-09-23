// Re-export helper utilities. The canonical definitions live in ./utils.tsx
// (this file exists for resolve-order safety — some bundlers pick the .tsx).
export {
  getFileIcon,
  getMimeFromExt,
  getFileIconByType,
  esc,
  timeAgo,
  makeId,
  getRawUrl,
  extractYear,
  showToast,
  safeJson,
  getSemesterOptions,
  getDepartmentOptions,
  getDefaultSession,
  normalizeUniversityId,
  extractYearFromTitle,
  sortLinksByYear,
  type SelectOption,
} from './utils.tsx';