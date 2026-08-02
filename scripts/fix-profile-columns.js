#!/usr/bin/env node
/**
 * Add missing columns to Profile table.
 * Run once: node scripts/fix-profile-columns.js
 * Also run on Vercel build via: node scripts/fix-profile-columns.js
 */
require('dotenv/config');
async function main() {
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('@prisma/client');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const columns = [
    { name: 'phone', type: 'TEXT' },
    { name: 'telegramId', type: 'TEXT' },
    { name: 'telegramChatId', type: 'TEXT' },
    { name: 'batchId', type: 'TEXT' },
    { name: 'customPermissions', type: "JSONB DEFAULT '{}'" },
    { name: 'banReason', type: 'TEXT' },
    { name: 'bannedBy', type: 'TEXT' },
  ];

  for (const col of columns) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`);
      console.log(`✅ ${col.name}`);
    } catch (e) {
      console.log(`⏭ ${col.name}: ${e.message?.substring(0, 60)}`);
    }
  }

  const count = await prisma.profile.count();
  console.log(`\nTotal profiles: ${count}`);
  await prisma.$disconnect();
  console.log('Done!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
