#!/usr/bin/env node
/**
 * Add missing columns to Profile table.
 * Run once: node scripts/fix-profile-columns.js
 * Also run on Vercel build via: node scripts/fix-profile-columns.js
 */
require('dotenv/config');
async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('⚠ No DATABASE_URL found — skipping column fixes (local build only).');
    return;
  }
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('@prisma/client');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const columns = [
    { name: 'phone', type: 'TEXT' },
    { name: 'telegramId', type: 'TEXT' },
    { name: 'telegramChatId', type: 'TEXT' },
    { name: 'batchId', type: 'TEXT' },
    { name: 'session', type: 'TEXT' },
    { name: 'customPermissions', type: "JSONB DEFAULT '{}'" },
    { name: 'banReason', type: 'TEXT' },
    { name: 'bannedBy', type: 'TEXT' },
    { name: 'accountStatus', type: "STRING DEFAULT 'active'" },
    { name: 'profileType', type: 'TEXT' },
    { name: 'hideWhatsapp', type: 'BOOL' },
    { name: 'hideUniversityId', type: 'BOOL' },
    { name: 'hideSemester', type: 'BOOL' },
    { name: 'hideEmail', type: 'BOOL' },
    { name: 'hideCompany', type: 'BOOL' },
    { name: 'hideFacebook', type: 'BOOL' },
    { name: 'hideTwitter', type: 'BOOL' },
    { name: 'hideLinkedin', type: 'BOOL' },
    { name: 'hideWebsite', type: 'BOOL' },
    { name: 'showInContributors', type: 'BOOL' },
    { name: 'totpEnabled', type: 'BOOL' },
    { name: 'totpMethods', type: "JSONB DEFAULT '[\"email\"]'" },
    { name: 'totpSecret', type: 'TEXT' },
  ];

  for (const col of columns) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`);
      console.log(`✅ ${col.name}`);
    } catch (e) {
      console.log(`⏭ ${col.name}: ${e.message?.substring(0, 60)}`);
    }
  }

  const settingsColumns = [
    { name: 'extraDepartments', table: 'SiteSettings', type: "JSONB DEFAULT '{}'" },
    { name: 'blockedTelegramChats', table: 'SiteSettings', type: "JSONB DEFAULT '[]'" },
    { name: 'blockedTelegramUsernames', table: 'SiteSettings', type: "JSONB DEFAULT '[]'" },
    { name: 'customRoles', table: 'SiteSettings', type: "JSONB DEFAULT '[]'" },
    { name: 'broadcastTargets', table: 'SiteSettings', type: "JSONB DEFAULT '[]'" },
  ];

  for (const col of settingsColumns) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${col.table}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`);
      console.log(`✅ ${col.table}.${col.name}`);
    } catch (e) {
      console.log(`⏭ ${col.table}.${col.name}: ${e.message?.substring(0, 60)}`);
    }
  }

  const count = await prisma.profile.count();
  console.log(`\nTotal profiles: ${count}`);

  // UploadChunk table for chunked large-file uploads (see prisma/schema.prisma).
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "UploadChunk" (
      "id" TEXT NOT NULL,
      "sessionId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "index" INTEGER NOT NULL,
      "total" INTEGER NOT NULL,
      "data" BYTEA NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UploadChunk_pkey" PRIMARY KEY ("id")
    )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UploadChunk_sessionId_userId_idx" ON "UploadChunk"("sessionId", "userId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UploadChunk_createdAt_idx" ON "UploadChunk"("createdAt")`);
    console.log('✅ UploadChunk');
  } catch (e) {
    console.log(`⏭ UploadChunk: ${e.message?.substring(0, 60)}`);
  }

  await prisma.$disconnect();
  console.log('Done!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
