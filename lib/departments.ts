export interface Department {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  folder?: string;
}

export interface Faculty {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  departments: Department[];
}

export const FACULTIES: Faculty[] = [
  {
    id: 'shariah',
    name: 'Faculty of Shariah and Islamic Studies',
    shortName: 'FSIS',
    icon: 'fa-book-quran',
    departments: [
      { id: 'qsis', name: "Qur'anic Sciences and Islamic Studies", shortName: 'QSIS', icon: 'fa-book-quran' },
      { id: 'dawah', name: "Da'wah and Islamic Studies", shortName: 'DIS', icon: 'fa-mosque', folder: 'DIS' },
      { id: 'hadith', name: 'Science of Hadith and Islamic Studies', shortName: 'SHIS', icon: 'fa-book', folder: 'SHIS' },
    ],
  },
  {
    id: 'science',
    name: 'Faculty of Science and Engineering',
    shortName: 'FSE',
    icon: 'fa-microchip',
    departments: [
      { id: 'cse', name: 'Computer Science and Engineering', shortName: 'CSE', icon: 'fa-laptop-code' },
      { id: 'cce', name: 'Computer and Communication Engineering', shortName: 'CCE', icon: 'fa-wifi' },
      { id: 'eee', name: 'Electrical and Electronic Engineering', shortName: 'EEE', icon: 'fa-bolt' },
      { id: 'ete', name: 'Electronic and Telecommunication Engineering', shortName: 'ETE', icon: 'fa-tower-broadcast' },
      { id: 'civil', name: 'Civil Engineering', shortName: 'CE', icon: 'fa-building' },
      { id: 'pharmacy', name: 'Pharmacy', shortName: 'PHM', icon: 'fa-pills', folder: 'PHM' },
    ],
  },
  {
    id: 'business',
    name: 'Faculty of Business Studies',
    shortName: 'FBS',
    icon: 'fa-chart-line',
    departments: [
      { id: 'bba', name: 'Business Administration', shortName: 'BBA', icon: 'fa-briefcase', folder: 'BBA' },
      { id: 'finance', name: 'Department of Finance', shortName: 'FIN', icon: 'fa-coins', folder: 'FIN' },
    ],
  },
  {
    id: 'arts',
    name: 'Faculty of Arts and Humanities',
    shortName: 'FAH',
    icon: 'fa-pen-fancy',
    departments: [
      { id: 'ell', name: 'English Language and Literature', shortName: 'ELL', icon: 'fa-language' },
      { id: 'all', name: 'Arabic Language and Literature', shortName: 'ALL', icon: 'fa-font' },
      { id: 'lis', name: 'Library and Information Science', shortName: 'LIS', icon: 'fa-book-open' },
    ],
  },
  {
    id: 'law',
    name: 'Faculty of Law',
    shortName: 'FL',
    icon: 'fa-gavel',
    departments: [
      { id: 'law', name: 'Department of Law', shortName: 'LAW', icon: 'fa-scale-balanced' },
    ],
  },
  {
    id: 'social',
    name: 'Faculty of Social Science',
    shortName: 'FSS',
    icon: 'fa-users',
    departments: [
      { id: 'eb', name: 'Economics & Banking', shortName: 'EB', icon: 'fa-money-bill-trend-up' },
    ],
  },
  {
    id: 'cge',
    name: 'Center for General Education',
    shortName: 'CGED',
    icon: 'fa-graduation-cap',
    departments: [
      { id: 'cge', name: 'General Education', shortName: 'CGED', icon: 'fa-school' },
    ],
  },
];

export const TEACHER_TITLES = [
  'Professor',
  'Associate Professor',
  'Assistant Professor',
  'Senior Lecturer',
  'Lecturer',
  'Adjunct Professor',
  'Visiting Professor',
  'Faculty',
  'Instructor',
];

export const STAFF_DESIGNATIONS = [
  'Office Assistant',
  'Lab Assistant',
  'Librarian',
  'Accountant',
  'Data Entry Operator',
  'Technician',
  'Administrative Officer',
  'Secretary',
  'Student Counselor',
  'Staff',
];

export function findDepartment(deptId: string): { faculty: Faculty; department: Department } | null {
  if (!deptId) return null;
  for (const faculty of FACULTIES) {
    const dept = faculty.departments.find(d => d.id === deptId || (d.folder && d.folder === deptId));
    if (dept) return { faculty, department: dept };
  }
  for (const faculty of FACULTIES) {
    const dept = faculty.departments.find(d => d.name === deptId || d.shortName === deptId);
    if (dept) return { faculty, department: dept };
  }
  return null;
}

// GitHub folder name for a department id (short form is the standard).
export function getDepartmentFolder(deptId: string): string {
  if (!deptId) return deptId;
  const found = findDepartment(deptId);
  if (found) return found.department.folder || found.department.id;
  return deptId;
}

// Resolve a GitHub folder name (or canonical id) back to the canonical department id.
export function getDepartmentIdByFolder(folder: string): string {
  if (!folder) return folder;
  // Backward-compat: old 'BA'/'ba' folder → new 'bba'
  if (folder === 'BA' || folder === 'ba') return 'bba';
  const found = findDepartment(folder);
  if (found) return found.department.id;
  return folder;
}

// Resolve any id/folder to the canonical department id.
export function resolveDepartmentId(idOrFolder: string): string {
  return getDepartmentIdByFolder(idOrFolder);
}

// Resolve a department value (which may be an id, a folder, a short name, or a
// full display name — e.g. profile.department is stored as a name) to its
// canonical department id. Falls back to the input if nothing matches.
export function resolveDepartment(input: string): string {
  if (!input) return input;
  // Backward-compat: old 'ba' id → new 'bba'
  if (input === 'ba') return 'bba';
  const found = findDepartment(input);
  if (found) return found.department.id;
  const all = getAllDepartments();
  for (const { department } of all) {
    if (
      department.id === input ||
      department.folder === input ||
      department.name === input ||
      department.shortName === input
    ) {
      return department.id;
    }
  }
  // Fuzzy match for variants like "Department of Qur'anic Sciences & Islamic
  // Studies" or "Center for General Education" (normalize: strip common
  // prefixes, "&" -> "and", non-alpha -> space).
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/department\s+of\s+/g, '')
      .replace(/center\s+for\s+|centre\s+for\s+|faculty\s+of\s+|school\s+of\s+|institute\s+of\s+/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  const nInput = norm(input);
  if (nInput) {
    for (const { department } of all) {
      if (norm(department.name) === nInput || norm(department.shortName) === nInput) {
        return department.id;
      }
    }
  }
  return input;
}

// Full display name for a department value (id, folder, short name, or full
// name variant). Falls back to the input when nothing matches.
export function getDepartmentDisplayName(input: string): string {
  if (!input) return input;
  const id = resolveDepartment(input);
  const found = findDepartment(id);
  if (found) return found.department.name;
  return input;
}

export interface DepartmentSelectOption {
  value: string;
  label: string;
  icon?: string;
  group?: string;
}

// Options for a department selector that show both the short form and the full
// form, grouped by faculty and searchable by either (typing "CSE" reveals
// "CSE — Computer Science and Engineering").
export function getDepartmentSelectOptions(): DepartmentSelectOption[] {
  const out: DepartmentSelectOption[] = [];
  for (const faculty of FACULTIES) {
    for (const dept of faculty.departments) {
      out.push({
        value: dept.id,
        label: `${dept.shortName} — ${dept.name}`,
        icon: dept.icon,
        group: faculty.shortName,
      });
    }
  }
  return out;
}

export function isShariahDepartmentId(id: string): boolean {
  const canonical = resolveDepartmentId(id);
  return canonical === 'shariah' || canonical === 'qsis' || canonical === 'dawah' || canonical === 'hadith';
}

// Normalize a member-type value (e.g. user-entered "staf" typo) to a valid choice.
export function normalizeMemberType(type?: string | null): string {
  const t = (type || '').trim().toLowerCase();
  if (t === 'staff' || t === 'staf') return 'staff';
  return 'faculty';
}

export function findFaculty(facultyId: string): Faculty | undefined {
  return FACULTIES.find(f => f.id === facultyId);
}

export function getAllDepartments(): { faculty: Faculty; department: Department }[] {
  const result: { faculty: Faculty; department: Department }[] = [];
  for (const faculty of FACULTIES) {
    for (const dept of faculty.departments) {
      result.push({ faculty, department: dept });
    }
  }
  return result;
}

export function getDepartmentLabel(deptId: string): string {
  const found = findDepartment(deptId);
  if (!found) return deptId;
  return `${found.department.shortName} — ${found.faculty.shortName}`;
}

export function getFacultyIdForDepartment(deptId: string): string | null {
  const found = findDepartment(deptId);
  return found?.faculty.id ?? null;
}

export function getAllFacultyIds(): string[] {
  return FACULTIES.map(f => f.id);
}

// All recognized top-level GitHub folder names (faculty ids + dept ids + folder short forms).
export function getAllFolderNames(): Set<string> {
  const set = new Set<string>();
  for (const faculty of FACULTIES) {
    set.add(faculty.id);
    for (const dept of faculty.departments) {
      set.add(dept.id);
      if (dept.folder) set.add(dept.folder);
    }
  }
  set.add('shariah');
  return set;
}
