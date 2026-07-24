const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv/config');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const QSIS_FACULTY = [
  { name: 'Prof. Dr. Gias Uddin Hafiz', title: 'Professor', email: 'giashafiz@yahoo.co.in', shortForm: 'GH', sortOrder: 1 },
  { name: 'Prof. Dr. B. M. Mofizur Rahman', title: 'Professor', email: 'bmmofiz@yahoo.com', shortForm: 'MR', sortOrder: 2 },
  { name: 'Prof. Dr. Md. Mustafa Kamil', title: 'Professor', email: 'mkamil2015@gmail.com', shortForm: 'MK', sortOrder: 3 },
  { name: 'Prof. Dr. Mohammad Rashid zahed', title: 'Professor', email: 'mrzahed1@yahoo.com', shortForm: 'RZ', sortOrder: 4 },
  { name: 'Dr. Muhammad Sirajuddin', title: 'Associate Professor', email: 'dr.siraj14@gmail.com', shortForm: 'SJ', sortOrder: 5 },
  { name: 'Dr. Md. Ali Hossain', title: 'Associate Professor', email: 'alihossainiiuc@gmail.com', shortForm: 'AH', sortOrder: 6 },
  { name: 'Dr. Md.Numan Hasan', title: 'Associate Professor', email: 'numanhasan2000@gmail.com', shortForm: 'NH', sortOrder: 7 },
  { name: 'Dr. Md. Shafiqur Rahman', title: 'Assistant Professor', email: 'shafiqazhary2003@yahoo.com', shortForm: 'SR', sortOrder: 8 },
  { name: 'Md. Harunur Rashid', title: 'Assistant Professor', email: 'haruntai@gmail.com', shortForm: 'HR', sortOrder: 9 },
  { name: 'Mrs. Zaheda Khanam', title: 'Assistant Professor', email: 'zahedaqsis@yahoo.com', shortForm: 'ZK', sortOrder: 10 },
  { name: 'Dr. Md. Lutfur Rahman Al Azhari', title: 'Assistant Professor', email: 'md_lrahman786@yahoo.com', shortForm: 'LA', sortOrder: 11 },
  { name: 'Dr. Aflatun Al-Kausar', title: 'Assistant Professor', email: 'aflatun.kausar@gmail.com', shortForm: 'AK', sortOrder: 12 },
  { name: 'Md. Ershadur Rahman', title: 'Assistant Professor', email: 'alershad_71@yahoo.com', shortForm: 'ER', sortOrder: 13 },
  { name: 'Fatematuj Juhura', title: 'Lecturer', email: 'fjuhura1@gmail.com', shortForm: 'FJ', sortOrder: 14 },
  { name: 'Naziha Nowman Sanah', title: 'Lecturer', email: 'nazihamd.nowman@gmail.com', shortForm: 'NS', sortOrder: 15 },
  { name: 'Mohammad Nazim Uddin', title: 'Lecturer', email: 'nu0110719@gmail.com', shortForm: 'NU', sortOrder: 16 },
  { name: 'Mafujur Rahman', title: 'Lecturer', email: 'hafezmahfuz@gmail.com', shortForm: 'MR2', sortOrder: 17 },
  { name: 'Md Forquanul Hakim', title: 'Lecturer', email: 'fokanulhakim@hotmail.com', shortForm: 'FH', sortOrder: 18 },
  { name: 'Mohammad Jahedul Alam Chy', title: 'Lecturer', email: 'jahedul.csecu@gmail.com', shortForm: 'JC', sortOrder: 19 },
  { name: 'Md. Nesar Uddin', title: 'Lecturer', email: 'nesarjnueco30@gmail.com', shortForm: 'NU2', sortOrder: 20 },
];

const QSIS_STAFF = [
  { name: 'Mohammad Tofazzal Hossain Khan', title: 'Senior Assistant Director', phone: '01714288210', email: 'mdtofazzal@yahoo.com', shortForm: 'TK', sortOrder: 21 },
  { name: 'Nizam Uddin', title: 'Senior Lab Technician', phone: '01811686831', email: 'niz79_binu@yahoo.com', shortForm: 'NI', sortOrder: 22 },
  { name: 'Nosaifa Sama Tazkya Fatama', title: 'Administrative Officer', phone: '01843638369', email: 'tajkianusaifa@gmail.com', shortForm: 'NT', sortOrder: 23 },
  { name: 'Kamal Hossain', title: 'Lab Attendant', phone: '01829803718', email: null, shortForm: 'KH', sortOrder: 24 },
];

async function main() {
  const department = 'qsis';

  for (const f of QSIS_FACULTY) {
    await prisma.facultyMember.upsert({
      where: { id: `qsis-${f.shortForm}` },
      update: {},
      create: { id: `qsis-${f.shortForm}`, department, ...f, memberType: 'faculty' },
    }).catch(async () => {
      await prisma.facultyMember.create({ data: { id: `qsis-${f.shortForm}`, department, ...f, memberType: 'faculty' } });
    });
  }

  for (const s of QSIS_STAFF) {
    await prisma.facultyMember.upsert({
      where: { id: `qsis-${s.shortForm}` },
      update: {},
      create: { id: `qsis-${s.shortForm}`, department, ...s, memberType: 'staff' },
    }).catch(async () => {
      await prisma.facultyMember.create({ data: { id: `qsis-${s.shortForm}`, department, ...s, memberType: 'staff' } });
    });
  }

  console.log(`Seeded ${QSIS_FACULTY.length} faculty + ${QSIS_STAFF.length} staff for QSIS department`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
