export interface CustomDepartment {
  id: string;
  name: string;
  shortName: string;
  icon: string;
}

export interface CustomFaculty {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  departments: CustomDepartment[];
}

export interface FacultyDeptTabProps {
  effectiveRole: string;
  profile: any;
  canManage: boolean;
}
