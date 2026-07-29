export interface Department {
  id: string;
  name: string;
  shortName: string;
  icon: string;
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
      { id: 'dawah', name: "Da'wah and Islamic Studies", shortName: 'DIS', icon: 'fa-mosque' },
      { id: 'hadith', name: 'Science of Hadith and Islamic Studies', shortName: 'SHIS', icon: 'fa-book' },
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
      { id: 'pharmacy', name: 'Pharmacy', shortName: 'PHM', icon: 'fa-pills' },
    ],
  },
  {
    id: 'business',
    name: 'Faculty of Business Studies',
    shortName: 'FBS',
    icon: 'fa-chart-line',
    departments: [
      { id: 'ba', name: 'Business Administration', shortName: 'BA', icon: 'fa-briefcase' },
      { id: 'finance', name: 'Department of Finance', shortName: 'FIN', icon: 'fa-coins' },
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
  for (const faculty of FACULTIES) {
    const dept = faculty.departments.find(d => d.id === deptId);
    if (dept) return { faculty, department: dept };
  }
  return null;
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
