import { getDepartmentDisplayName, normalizeMemberType } from '@/lib/departments';

// ETE (Electronic and Telecommunication Engineering) roster that was never
// imported into the database. Safe to run repeatedly: anyone whose email
// already exists, or whose name is already in the ETE department, is skipped,
// so this can never duplicate members.
export const ETE_MEMBERS: { name: string; title: string; email: string | null; phone: string | null; memberType: string }[] = [
  { name: 'Dr. Engr. Abdul Gafur', title: 'Associate Professor', email: 'engr.abdul.gafur@gmail.com', phone: null, memberType: 'faculty' },
  { name: 'Mr. Mohammed Jashim Uddin', title: 'Associate Professor', email: 'jashimcuet@yahoo.com', phone: null, memberType: 'faculty' },
  { name: 'Engr. Syed Zahidur Rashid', title: 'Assistant Professor', email: 'szrashidcce@yahoo.com', phone: null, memberType: 'faculty' },
  { name: 'Md. Ibrahim', title: 'Assistant Professor', email: 'ahm.ibrahim.r@gmail.com', phone: null, memberType: 'faculty' },
  { name: 'Mr. Md. Mostafa Amir Faisal', title: 'Assistant Professor', email: 'oranta68@yahoo.com', phone: null, memberType: 'faculty' },
  { name: 'Mr. Mohammad Woli Ullah', title: 'Assistant Professor', email: 'woli1@yahoo.com', phone: null, memberType: 'faculty' },
  { name: 'Abu Zafar Md. Imran', title: 'Lecturer', email: 'azmimran28@gmail.com', phone: null, memberType: 'faculty' },
  { name: 'Mr. Ahmad', title: 'Lecturer', email: 'ahmadcse0@gmail.com', phone: null, memberType: 'faculty' },
  { name: 'Mr. Tanzeem Tahmeed Reza', title: 'Lecturer', email: 'tanzeemcuet19@gmail.com', phone: null, memberType: 'faculty' },
  { name: 'Dr. Md. Deloar Hossain', title: 'Lecturer', email: 'deloarku11@gmail.com', phone: null, memberType: 'faculty' },
  { name: 'Md.Shahab Uddin', title: 'Senior Assistant Director', email: 'shahab.ete@iiuc.ac.bd', phone: '01819647321', memberType: 'staff' },
  { name: 'Muhammed Zahid Hossain', title: 'Assistant Technical Officer', email: 'zahidsae@gmail.com', phone: '01558612556', memberType: 'staff' },
  { name: 'Md.Ebrahim Khalil', title: 'Assistant Technical Officer', email: 'ebrahim8125726@yahoo.com', phone: '01831163447', memberType: 'staff' },
  { name: 'Mr. Md. Abdul Alim', title: 'Senior Lab Technician', email: 'md_alim2009@yahoo.com', phone: '01790787408', memberType: 'staff' },
  { name: 'Mohammad Alauddin', title: 'Lab Attendant', email: 'aladinctg72@yahoo.com', phone: '01937908408', memberType: 'staff' },
  { name: 'A.K.M Abdullahil Mamun', title: 'Lab Attendant', email: 'abdullahil.mamun@yahoo.com', phone: '01742310564', memberType: 'staff' },
];

export async function importEteMembers(prisma: any): Promise<{ inserted: number; skipped: number; department: string }> {
  const storedDept = getDepartmentDisplayName('ete');

  const existingDept = await prisma.facultyMember.findMany({
    where: { department: storedDept },
    select: { email: true, name: true },
  });
  const deptEmails = new Set(existingDept.map((m: any) => m.email?.toLowerCase()).filter(Boolean));
  const deptNames = new Set(existingDept.map((m: any) => m.name?.toLowerCase().trim()).filter(Boolean));

  const existingAnywhere = await prisma.facultyMember.findMany({
    where: { email: { in: ETE_MEMBERS.map(m => m.email).filter((e): e is string => !!e) } },
    select: { email: true },
  });
  const emailsAnywhere = new Set(existingAnywhere.map((m: any) => m.email?.toLowerCase()).filter(Boolean));

  let inserted = 0;
  let skipped = 0;

  for (const m of ETE_MEMBERS) {
    const emailKey = m.email?.toLowerCase();
    const nameKey = m.name.toLowerCase().trim();
    if (deptEmails.has(emailKey ?? '') || deptNames.has(nameKey) || emailsAnywhere.has(emailKey ?? '')) {
      skipped++;
      continue;
    }

    const maxSort = await prisma.facultyMember.aggregate({
      where: { department: storedDept },
      _max: { sortOrder: true },
    });
    await prisma.facultyMember.create({
      data: {
        department: storedDept,
        name: m.name,
        title: m.title,
        email: m.email,
        phone: m.phone,
        memberType: normalizeMemberType(m.memberType),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    inserted++;
    if (emailKey) deptEmails.add(emailKey);
    deptNames.add(nameKey);
  }

  if (inserted > 0) {
    // Keep the cloud data repo in sync.
    try { const { mirrorDepartmentToCloud } = await import('@/lib/faculty-data'); await mirrorDepartmentToCloud(storedDept); } catch {}
  }

  return { inserted, skipped, department: storedDept };
}