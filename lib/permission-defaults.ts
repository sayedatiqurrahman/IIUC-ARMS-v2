const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  addCourse: ['admin', 'manager', 'teacher', 'cr', 'student', 'user'],
  addToAnySemester: [],
  editCourse: ['admin', 'manager', 'teacher', 'cr'],
  deleteCourse: ['admin', 'manager', 'teacher'],
  uploadFile: ['admin', 'manager', 'teacher', 'cr', 'student'],
  requireGithubForUpload: ['admin', 'manager', 'teacher', 'cr', 'student'],
  manageFaculty: ['admin', 'manager', 'teacher'],
  manageFacultyDepts: ['admin', 'manager'],
  publishRoutine: ['admin', 'manager', 'teacher', 'cr'],
  manageBatches: ['admin', 'manager', 'teacher', 'cr', 'acr'],
  manageUsers: ['admin', 'manager'],
  manageSettings: ['admin'],
  moveFile: ['admin'],
  copyFile: ['admin'],
  renameFile: ['admin'],
  deleteFile: ['admin'],
  editLinks: ['admin', 'manager', 'teacher', 'cr'],
  saveCourseToGitHub: ['admin', 'manager', 'teacher', 'cr'],
  manageRooms: ['admin', 'manager', 'teacher'],
  viewExternalUsers: ['admin', 'manager'],
};

export { DEFAULT_PERMISSIONS };
