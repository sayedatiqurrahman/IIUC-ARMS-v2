import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SHARIAH_DEPTS = ['qsis', 'dawah', 'hadith'];

const seedData: Record<string, { faculty: any[]; staff: any[] }> = {
  qsis: {
    faculty: [
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
      { name: 'Mafujur Rahman', title: 'Lecturer', email: 'hafezmahfuz@gmail.com', shortForm: 'MR', sortOrder: 17 },
      { name: 'Md Forquanul Hakim', title: 'Lecturer', email: 'fokanulhakim@hotmail.com', shortForm: 'FH', sortOrder: 18 },
      { name: 'Mohammad Jahedul Alam Chy', title: 'Lecturer', email: 'jahedul.csecu@gmail.com', shortForm: 'JC', sortOrder: 19 },
      { name: 'Md. Nesar Uddin', title: 'Lecturer', email: 'nesarjnueco30@gmail.com', shortForm: 'NU', sortOrder: 20 },
    ],
    staff: [
      { name: 'Mohammad Tofazzal Hossain Khan', title: 'Senior Assistant Director', email: 'mdtofazzal@yahoo.com', phone: '01714288210', shortForm: 'TK', sortOrder: 1 },
      { name: 'Nizam Uddin', title: 'Senior Lab Technician', email: 'niz79_binu@yahoo.com', phone: '01811686831', shortForm: 'NU', sortOrder: 2 },
      { name: 'Nosaifa Sama Tazkya Fatama', title: 'Administrative Officer', email: 'tajkianusaifa@gmail.com', phone: '01843638369', shortForm: 'NF', sortOrder: 3 },
      { name: 'Kamal Hossain', title: 'Lab Attendant', email: null, phone: '01829803718', shortForm: 'KH', sortOrder: 4 },
    ],
  },
  dawah: {
    faculty: [
      { name: 'Prof. Dr. Mohammad Shafi Uddin', title: 'Professor', email: 'shafimadani@yahoo.com', shortForm: 'SU', sortOrder: 1 },
      { name: 'Prof. Dr. Muhammad Aminul Hoque', title: 'Professor', email: 'aminulhoque.iiuc@gmail.com', shortForm: 'MH', sortOrder: 2 },
      { name: 'Dr. Shaker Alam Shaoque', title: 'Associate Professor', email: 'shakershaoq@gmail.com', shortForm: 'SS', sortOrder: 3 },
      { name: 'Md. Shahjalal', title: 'Assistant Professor', email: 'jalaldis@gmail.com', shortForm: 'SJ', sortOrder: 4 },
      { name: 'AFM Nuruzzaman', title: 'Assistant Professor', email: 'afmnur_dis@yahoo.co.uk', shortForm: 'NZ', sortOrder: 5 },
      { name: 'Zakia Binte Alam Hanna', title: 'Assistant Professor', email: 'dis_fc@yahoo.com', shortForm: 'ZH', sortOrder: 6 },
      { name: 'Dr. Saud Bin Mohammad', title: 'Assistant Professor', email: 'saudafif2014@gmail.com', shortForm: 'SM', sortOrder: 7 },
      { name: 'Dr. Mohammad Saiful Islam', title: 'Assistant Professor', email: 'saifulislambdiium@gmail.com', shortForm: 'SI', sortOrder: 8 },
      { name: 'Syed Mahmudul Hasan', title: 'Lecturer', email: 'syedhasan_iiuc@yahoo.com', shortForm: 'SH', sortOrder: 9 },
      { name: 'Mohammed Ammar', title: 'Lecturer', email: 'ammarzakaria300@gmail.com', shortForm: 'MA', sortOrder: 10 },
      { name: 'Md Asif Mahmud', title: 'Lecturer', email: 'asifmahmud.csecu@gmail.com', shortForm: 'AM', sortOrder: 11 },
      { name: 'Md Ridwan Ullah', title: 'Lecturer', email: 'ridwanullah88@gmail.com', shortForm: 'RU', sortOrder: 12 },
      { name: 'Salma Binte Mohammad Shafiqur Rahman', title: 'Lecturer', email: 'ummerawha83@gmail.com', shortForm: 'SR', sortOrder: 13 },
      { name: 'Mohammad', title: 'Lecturer', email: 'mohammadmakki121@gmail.com', shortForm: 'MD', sortOrder: 14 },
    ],
    staff: [
      { name: 'Gias Uddin', title: 'Assistant Director', email: null, phone: '01813167876', shortForm: 'GU', sortOrder: 1 },
      { name: 'Eshrat Jahan Bristy', title: 'Administrative Officer', email: 'eshratbristy123@gmail.com', phone: '01862105058', shortForm: 'EB', sortOrder: 2 },
    ],
  },
  hadith: {
    faculty: [
      { name: 'Prof. Dr. Md. Nazmul Hoque Nadwi', title: 'Professor', email: 'dmnhnadwi@yahoo.co.in', shortForm: 'NN', sortOrder: 1 },
      { name: 'Prof. Dr. Mohammad Shafiul Alam Bhuiyan', title: 'Professor', email: 'sabiiucdc@gmail.com', shortForm: 'SB', sortOrder: 2 },
      { name: 'Dr. Mohammad Abul Kalam', title: 'Associate Professor', email: 'kalam1981@yahoo.com', shortForm: 'AK', sortOrder: 3 },
      { name: 'Dr. Mohammed Solim Uddin', title: 'Associate Professor', email: 'salim_dis@yahoo.com', shortForm: 'SU', sortOrder: 4 },
      { name: 'Dr. Muhammad Nazmul Huda', title: 'Associate Professor', email: 'nazmuliiucbd@gmail.com', shortForm: 'NH', sortOrder: 5 },
      { name: 'Syed Nour', title: 'Assistant Professor', email: 'syednour@yahoo.com', shortForm: 'SN', sortOrder: 6 },
      { name: 'Mohammad Belal', title: 'Lecturer', email: 'mbelaldis_iiuc@yahoo.com', shortForm: 'MB', sortOrder: 7 },
      { name: 'Dr. Abu Talib Mohammad Monawer', title: 'Lecturer', email: 'monawer.azhar@gmail.com', shortForm: 'TM', sortOrder: 8 },
      { name: 'Shaikhul Azam Abrar', title: 'Lecturer', email: 'shaikhulabrar@gmail.com', shortForm: 'SA', sortOrder: 9 },
      { name: 'Somaiya Binte Lokman', title: 'Lecturer', email: 'somaiyalokman@gmail.com', shortForm: 'SL', sortOrder: 10 },
      { name: 'Mohammad Ridwan', title: 'Lecturer', email: 'm.ridwan.econ@gmail.com', shortForm: 'RW', sortOrder: 11 },
      { name: 'Afif Hossain Irfan', title: 'Lecturer', email: 'afifhossain.cse.1012@gmail.com', shortForm: 'AI', sortOrder: 12 },
    ],
    staff: [
      { name: 'Mr. Mohammad Nazrul Islam', title: 'Assistant Director', email: 'nazr76@yahoo.com', phone: '01811894959', shortForm: 'NI', sortOrder: 1 },
      { name: 'Miftahul Jannat', title: 'Administrative Assistant', email: 'miftah.jannat08@gmail.com', phone: '01835151208', shortForm: 'MJ', sortOrder: 2 },
    ],
  },
};

async function main() {
  console.log('=== Seeding Shariah Faculty (QSIS, DAWAH, HADITH) ===\n');

  for (const dept of SHARIAH_DEPTS) {
    const data = seedData[dept];
    console.log(`--- ${dept.toUpperCase()} ---`);

    // Delete existing members for this department only
    const deleted = await prisma.facultyMember.deleteMany({ where: { department: dept } });
    console.log(`  Removed ${deleted.count} old members`);

    // Insert faculty
    for (const m of data.faculty) {
      await prisma.facultyMember.create({
        data: { department: dept, name: m.name, title: m.title, email: m.email, shortForm: m.shortForm, memberType: 'faculty', sortOrder: m.sortOrder },
      });
    }
    console.log(`  Added ${data.faculty.length} faculty members`);

    // Insert staff
    for (const m of data.staff) {
      await prisma.facultyMember.create({
        data: { department: dept, name: m.name, title: m.title, email: m.email || null, phone: (m as any).phone || null, shortForm: m.shortForm, memberType: 'staff', sortOrder: m.sortOrder },
      });
    }
    console.log(`  Added ${data.staff.length} staff members`);
  }

  // Verify other departments untouched
  const otherDepts = await prisma.facultyMember.groupBy({ by: ['department'], _count: true });
  console.log('\n=== All departments after seed ===');
  for (const d of otherDepts) {
    console.log(`  ${d.department}: ${d._count} members`);
  }

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
