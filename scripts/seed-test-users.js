const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');
require('dotenv/config');

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

const TEST_USERS = [
  {
    userId: 'test-teacher@iiuc.ac.bd',
    email: 'test-teacher@iiuc.ac.bd',
    name: 'Dr. Test Teacher',
    title: 'Assistant Professor',
    shortForm: 'TT',
    department: 'qsis',
    role: 'teacher',
    isCR: false,
    isACR: false,
    universityId: null,
    semester: null,
    whatsapp: '01700000001',
  },
  {
    userId: 'test-manager@ugrad.iiuc.ac.bd',
    email: 'test-manager@ugrad.iiuc.ac.bd',
    name: 'Test Manager',
    title: 'Student Manager',
    shortForm: 'TM',
    department: 'qsis',
    role: 'manager',
    isCR: false,
    isACR: false,
    universityId: 'q230001',
    semester: '5th Semester',
    whatsapp: '01700000002',
  },
  {
    userId: 'test-cr@ugrad.iiuc.ac.bd',
    email: 'test-cr@ugrad.iiuc.ac.bd',
    name: 'Test CR',
    title: 'Class Representative',
    shortForm: 'TC',
    department: 'qsis',
    role: 'student',
    isCR: true,
    isACR: false,
    universityId: 'q230002',
    semester: '3rd Semester',
    whatsapp: '01700000003',
  },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const user of TEST_USERS) {
    const existing = await prisma.profile.findUnique({ where: { userId: user.userId } });
    if (existing) {
      await prisma.profile.update({ where: { userId: user.userId }, data: user });
      updated++;
      console.log(`  Updated: ${user.userId} (role=${user.role}, isCR=${user.isCR})`);
    } else {
      await prisma.profile.create({ data: user });
      created++;
      console.log(`  Created: ${user.userId} (role=${user.role}, isCR=${user.isCR})`);
    }
  }

  console.log(`\nDone: ${created} created, ${updated} updated`);
  console.log('\nTest accounts:');
  console.log('  Teacher:  test-teacher@iiuc.ac.bd');
  console.log('  Manager:  test-manager@ugrad.iiuc.ac.bd');
  console.log('  CR:       test-cr@ugrad.iiuc.ac.bd');
  console.log('\nNote: These are DB profiles only. To login, either:');
  console.log('  1. Add these emails to Firebase Auth, OR');
  console.log('  2. Add them to adminEmails in config.ts temporarily');
}

main().catch(console.error).finally(() => prisma.$disconnect());
