#!/usr/bin/env node
/**
 * Ensure all schema tables and columns exist on Turso (SQLite).
 * Creates missing tables + adds missing columns.
 * Runs on every Vercel build.
 */
require('dotenv/config');
async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('⚠ No DATABASE_URL — skipping (local build only).');
    return;
  }
  const { PrismaLibSql } = require('@prisma/adapter-libsql');
  const { PrismaClient } = require('@prisma/client');
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const prisma = new PrismaClient({ adapter });

  async function safeExec(sql, label) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`✅ ${label}`);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('already')) {
        console.log(`⏭ ${label}: exists`);
      } else {
        console.log(`⏭ ${label}: ${msg.substring(0, 100)}`);
      }
    }
  }

  // ── Create tables if they don't exist ──
  console.log('\n--- Creating tables ---');

  await safeExec(`CREATE TABLE IF NOT EXISTS "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "email" TEXT, "name" TEXT, "universityId" TEXT, "whatsapp" TEXT,
    "semester" TEXT, "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "facebook" TEXT, "githubLogin" TEXT,
    "hideUniversityId" INTEGER NOT NULL DEFAULT 0,
    "hideWhatsapp" INTEGER NOT NULL DEFAULT 0,
    "linkedin" TEXT, "twitter" TEXT, "website" TEXT,
    "githubToken" TEXT, "company" TEXT, "companyUrl" TEXT,
    "hideEmail" INTEGER NOT NULL DEFAULT 0,
    "hideSemester" INTEGER NOT NULL DEFAULT 0,
    "publicEmail" TEXT, "githubInstallationId" TEXT, "githubAvatar" TEXT,
    "role" TEXT DEFAULT 'user',
    "totpEnabled" INTEGER NOT NULL DEFAULT 0,
    "totpSecret" TEXT, "title" TEXT,
    "isBanned" INTEGER DEFAULT 0,
    "shortForm" TEXT, "department" TEXT,
    "isCR" INTEGER DEFAULT 0,
    "isACR" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT,
    "totpMethods" TEXT NOT NULL DEFAULT '["email"]',
    "hideCompany" INTEGER DEFAULT 0,
    "hideFacebook" INTEGER DEFAULT 0,
    "hideTwitter" INTEGER DEFAULT 0,
    "hideLinkedin" INTEGER DEFAULT 0,
    "hideWebsite" INTEGER DEFAULT 0,
    "banReason" TEXT, "bannedBy" TEXT,
    "customPermissions" TEXT NOT NULL DEFAULT '{}',
    "telegramId" TEXT, "batchId" TEXT,
    "telegramChatId" TEXT, "session" TEXT,
    "telegramVerified" INTEGER DEFAULT 0,
    "telegramOtp" TEXT, "telegramOtpExpiresAt" DATETIME,
    "telegramConnectState" TEXT,
    "linkedEmails" TEXT NOT NULL DEFAULT '[]',
    "showInContributors" INTEGER DEFAULT 1,
    "accountStatus" TEXT DEFAULT 'active',
    "profileType" TEXT DEFAULT ''
  )`, 'Profile');

  await safeExec(`CREATE INDEX IF NOT EXISTS "Profile_githubLogin_idx" ON "Profile"("githubLogin")`, 'Profile.githubLogin idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "Profile_email_idx" ON "Profile"("email")`, 'Profile.email idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY, "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL, "userName" TEXT, "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'ActivityLog');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ActivityLog_userId_idx" ON "ActivityLog"("userId")`, 'ActivityLog.userId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog"("action")`, 'ActivityLog.action idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt")`, 'ActivityLog.createdAt idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "FacultyMember" (
    "id" TEXT NOT NULL PRIMARY KEY, "department" TEXT NOT NULL,
    "name" TEXT NOT NULL, "title" TEXT, "email" TEXT, "phone" TEXT,
    "shortForm" TEXT, "memberType" TEXT NOT NULL DEFAULT 'faculty',
    "isCR" INTEGER NOT NULL DEFAULT 0, "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVisible" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT
  )`, 'FacultyMember');

  // Add claimedBy column to existing FacultyMember tables
  await safeExec(`ALTER TABLE "FacultyMember" ADD COLUMN "claimedBy" TEXT`, 'FacultyMember_claimedBy');

  await safeExec(`CREATE TABLE IF NOT EXISTS "Course" (
    "id" TEXT NOT NULL PRIMARY KEY, "department" TEXT NOT NULL,
    "semester" TEXT NOT NULL, "code" TEXT NOT NULL, "title" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'Course');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "Course_department_semester_code_key" ON "Course"("department", "semester", "code")`, 'Course unique idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "Course_department_idx" ON "Course"("department")`, 'Course.department idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "Course_semester_idx" ON "Course"("semester")`, 'Course.semester idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "UploadChunk" (
    "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL, "path" TEXT NOT NULL,
    "index" INTEGER NOT NULL, "total" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'UploadChunk');
  await safeExec(`CREATE INDEX IF NOT EXISTS "UploadChunk_sessionId_userId_idx" ON "UploadChunk"("sessionId", "userId")`, 'UploadChunk idx1');
  await safeExec(`CREATE INDEX IF NOT EXISTS "UploadChunk_createdAt_idx" ON "UploadChunk"("createdAt")`, 'UploadChunk createdAt idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'site-settings',
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraDepartments" TEXT DEFAULT '{}',
    "customFaculties" TEXT DEFAULT '[]',
    "contributorSettings" TEXT,
    "blockedTelegramChats" TEXT DEFAULT '[]',
    "blockedTelegramUsernames" TEXT DEFAULT '[]',
    "customRoles" TEXT DEFAULT '[]',
    "broadcastTargets" TEXT DEFAULT '[]',
    "supportConfig" TEXT,
    "postingChannels" TEXT,
    "telegramChats" TEXT,
    "emailSettings" TEXT,
    "deletedEmails" TEXT DEFAULT '[]'
  )`, 'SiteSettings');

  await safeExec(`CREATE TABLE IF NOT EXISTS "SemesterCourse" (
    "id" TEXT NOT NULL PRIMARY KEY, "semester" TEXT NOT NULL,
    "code" TEXT NOT NULL, "title" TEXT NOT NULL,
    "teacher" TEXT, "room" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'SemesterCourse');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "SemesterCourse_semester_code_key" ON "SemesterCourse"("semester", "code")`, 'SemesterCourse unique idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "SemesterCourse_semester_idx" ON "SemesterCourse"("semester")`, 'SemesterCourse semester idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "PublishedRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY, "routineId" TEXT NOT NULL,
    "semester" TEXT NOT NULL, "session" TEXT, "branch" TEXT,
    "gender" TEXT, "academicYear" TEXT, "department" TEXT,
    "university" TEXT, "room" TEXT,
    "periods" TEXT NOT NULL, "days" TEXT NOT NULL,
    "courses" TEXT NOT NULL, "slots" TEXT NOT NULL,
    "malePeriods" TEXT, "femalePeriods" TEXT,
    "maleSlots" TEXT, "femaleSlots" TEXT,
    "publishedBy" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "scheduledAt" DATETIME
  )`, 'PublishedRoutine');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedRoutine_routineId_idx" ON "PublishedRoutine"("routineId")`, 'PR.routineId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedRoutine_semester_idx" ON "PublishedRoutine"("semester")`, 'PR.semester idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedRoutine_expiresAt_idx" ON "PublishedRoutine"("expiresAt")`, 'PR.expiresAt idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedRoutine_status_idx" ON "PublishedRoutine"("status")`, 'PR.status idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "FacultyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY, "requesterId" TEXT NOT NULL,
    "department" TEXT NOT NULL, "name" TEXT NOT NULL,
    "title" TEXT, "email" TEXT, "phone" TEXT, "shortForm" TEXT,
    "memberType" TEXT NOT NULL DEFAULT 'faculty',
    "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT, "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'FacultyRequest');
  await safeExec(`CREATE INDEX IF NOT EXISTS "FacultyRequest_requesterId_idx" ON "FacultyRequest"("requesterId")`, 'FR.requesterId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "FacultyRequest_status_idx" ON "FacultyRequest"("status")`, 'FR.status idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "FacultyRequest_department_idx" ON "FacultyRequest"("department")`, 'FR.department idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "PublishedExamRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY, "examId" TEXT NOT NULL,
    "semester" TEXT NOT NULL, "session" TEXT, "department" TEXT,
    "examType" TEXT, "type" TEXT,
    "rows" TEXT NOT NULL, "slots" TEXT NOT NULL,
    "publishedBy" TEXT, "publishedByEmail" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "scheduledAt" DATETIME
  )`, 'PublishedExamRoutine');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedExamRoutine_examId_idx" ON "PublishedExamRoutine"("examId")`, 'PER.examId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedExamRoutine_semester_idx" ON "PublishedExamRoutine"("semester")`, 'PER.semester idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedExamRoutine_department_idx" ON "PublishedExamRoutine"("department")`, 'PER.department idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedExamRoutine_expiresAt_idx" ON "PublishedExamRoutine"("expiresAt")`, 'PER.expiresAt idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "PublishedExamRoutine_status_idx" ON "PublishedExamRoutine"("status")`, 'PER.status idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "Room" (
    "id" TEXT NOT NULL PRIMARY KEY, "department" TEXT NOT NULL,
    "name" TEXT NOT NULL, "capacity" INTEGER NOT NULL DEFAULT 40,
    "gender" TEXT NOT NULL DEFAULT 'both',
    "building" TEXT, "floor" TEXT,
    "numberOfColumns" INTEGER, "chairsPerColumn" INTEGER,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'Room');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "Room_department_name_key" ON "Room"("department", "name")`, 'Room unique idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "Room_department_idx" ON "Room"("department")`, 'Room.department idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY, "department" TEXT NOT NULL,
    "name" TEXT NOT NULL, "session" TEXT NOT NULL,
    "idRange" TEXT,
    "startSemester" TEXT NOT NULL DEFAULT '1st-semister',
    "currentSemester" TEXT NOT NULL DEFAULT '1st-semister',
    "isGraduated" INTEGER NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetEndDate" DATETIME NOT NULL,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'Batch');
  await safeExec(`CREATE INDEX IF NOT EXISTS "Batch_department_idx" ON "Batch"("department")`, 'Batch.department idx');
  await safeExec(`ALTER TABLE "Batch" ADD COLUMN "idRange" TEXT`, 'Batch.idRange col', true);
  await safeExec(`ALTER TABLE "Batch" ADD COLUMN "isGraduated" INTEGER NOT NULL DEFAULT 0`, 'Batch.isGraduated col', true);

  await safeExec(`CREATE TABLE IF NOT EXISTS "BatchStudent" (
    "id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL,
    "email" TEXT NOT NULL, "universityId" TEXT NOT NULL,
    "originalId" TEXT, "name" TEXT,
    "isReAdmission" INTEGER NOT NULL DEFAULT 0
  )`, 'BatchStudent');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "BatchStudent_batchId_universityId_key" ON "BatchStudent"("batchId", "universityId")`, 'BatchStudent unique idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "BatchStudent_batchId_idx" ON "BatchStudent"("batchId")`, 'BS.batchId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "BatchStudent_email_idx" ON "BatchStudent"("email")`, 'BS.email idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "TelegramNotification" (
    "id" TEXT NOT NULL PRIMARY KEY, "department" TEXT NOT NULL,
    "type" TEXT NOT NULL, "title" TEXT NOT NULL,
    "message" TEXT NOT NULL, "sentBy" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'TelegramNotification');
  await safeExec(`CREATE INDEX IF NOT EXISTS "TelegramNotification_department_idx" ON "TelegramNotification"("department")`, 'TN.department idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "TelegramNotification_sentAt_idx" ON "TelegramNotification"("sentAt")`, 'TN.sentAt idx');

  // ── Club System ──
  await safeExec(`CREATE TABLE IF NOT EXISTS "Club" (
    "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
    "department" TEXT NOT NULL, "description" TEXT, "logoUrl" TEXT, "coverUrl" TEXT,
    "createdBy" TEXT NOT NULL, "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'Club');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "Club_slug_idx" ON "Club"("slug")`, 'Club slug idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "Club_department_idx" ON "Club"("department")`, 'Club department idx');
  await safeExec(`ALTER TABLE "Club" ADD COLUMN "settings" TEXT`, 'Club.settings col');

  await safeExec(`CREATE TABLE IF NOT EXISTS "ClubMember" (
    "id" TEXT NOT NULL PRIMARY KEY, "clubId" TEXT NOT NULL, "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member', "assignedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'ClubMember');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "ClubMember_clubId_userId_idx" ON "ClubMember"("clubId", "userId")`, 'ClubMember unique idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubMember_clubId_idx" ON "ClubMember"("clubId")`, 'ClubMember clubId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubMember_userId_idx" ON "ClubMember"("userId")`, 'ClubMember userId idx');
  await safeExec(`ALTER TABLE "ClubMember" ADD COLUMN "isClubAdmin" INTEGER NOT NULL DEFAULT 0`, 'ClubMember.isClubAdmin col');
  await safeExec(`ALTER TABLE "ClubMember" ADD COLUMN "previousRole" TEXT`, 'ClubMember.previousRole col');
  await safeExec(`ALTER TABLE "ClubMember" ADD COLUMN "previousRoleSession" TEXT`, 'ClubMember.previousRoleSession col');
  await safeExec(`ALTER TABLE "ClubMember" ADD COLUMN "clubRoles" TEXT`, 'ClubMember.clubRoles col');

  await safeExec(`CREATE TABLE IF NOT EXISTS "ClubEvent" (
    "id" TEXT NOT NULL PRIMARY KEY, "clubId" TEXT NOT NULL, "title" TEXT NOT NULL,
    "description" TEXT, "eventDate" DATETIME, "venue" TEXT, "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'ClubEvent');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubEvent_clubId_idx" ON "ClubEvent"("clubId")`, 'ClubEvent clubId idx');

  await safeExec(`CREATE TABLE IF NOT EXISTS "ClubCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY, "certificateId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL, "eventId" TEXT, "memberName" TEXT NOT NULL,
    "universityId" TEXT NOT NULL, "department" TEXT NOT NULL, "session" TEXT,
    "post" TEXT, "eventName" TEXT, "issuedBy" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'ClubCertificate');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "ClubCertificate_certificateId_idx" ON "ClubCertificate"("certificateId")`, 'ClubCertificate certId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubCertificate_clubId_idx" ON "ClubCertificate"("clubId")`, 'ClubCertificate clubId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubCertificate_universityId_idx" ON "ClubCertificate"("universityId")`, 'ClubCertificate uniId idx');
  await safeExec(`ALTER TABLE "ClubCertificate" ADD COLUMN "servicePeriod" TEXT`, 'ClubCertificate.servicePeriod col');
  await safeExec(`ALTER TABLE "ClubCertificate" ADD COLUMN "signatories" TEXT`, 'ClubCertificate.signatories col');

  await safeExec(`CREATE TABLE IF NOT EXISTS "ClubClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL DEFAULT 'member',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'ClubClaim');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "ClubClaim_clubId_userId_idx" ON "ClubClaim"("clubId", "userId")`, 'ClubClaim unique idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubClaim_clubId_idx" ON "ClubClaim"("clubId")`, 'ClubClaim clubId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubClaim_userId_idx" ON "ClubClaim"("userId")`, 'ClubClaim userId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "ClubClaim_status_idx" ON "ClubClaim"("status")`, 'ClubClaim status idx');

  // ── Ensure default SiteSettings row ──
  await safeExec(`INSERT OR IGNORE INTO "SiteSettings" ("id", "permissions") VALUES ('site-settings', '{}')`, 'SiteSettings default row');

  // ── StudioOrganization table ──
  await safeExec(`CREATE TABLE IF NOT EXISTS "StudioOrganization" (
    "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'batch', "logoUrl" TEXT, "description" TEXT,
    "createdBy" TEXT NOT NULL, "memberCount" INTEGER NOT NULL DEFAULT 0,
    "certCount" INTEGER NOT NULL DEFAULT 0, "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'StudioOrganization table');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "StudioOrganization_slug_key" ON "StudioOrganization"("slug")`, 'StudioOrganization.slug unique');
  await safeExec(`CREATE INDEX IF NOT EXISTS "StudioOrganization_slug_idx" ON "StudioOrganization"("slug")`, 'StudioOrganization.slug idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "StudioOrganization_createdBy_idx" ON "StudioOrganization"("createdBy")`, 'StudioOrganization.createdBy idx');

  // ── StudioCertificate table ──
  await safeExec(`CREATE TABLE IF NOT EXISTS "StudioCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY, "certificateId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL, "memberName" TEXT NOT NULL, "universityId" TEXT NOT NULL,
    "department" TEXT NOT NULL, "session" TEXT, "post" TEXT, "eventName" TEXT,
    "servicePeriod" TEXT, "signatories" TEXT, "issuedBy" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioCertificate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "StudioOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`, 'StudioCertificate table');
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS "StudioCertificate_certificateId_key" ON "StudioCertificate"("certificateId")`, 'StudioCertificate.certificateId unique');
  await safeExec(`CREATE INDEX IF NOT EXISTS "StudioCertificate_orgId_idx" ON "StudioCertificate"("orgId")`, 'StudioCertificate.orgId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "StudioCertificate_certificateId_idx" ON "StudioCertificate"("certificateId")`, 'StudioCertificate.certificateId idx');
  await safeExec(`CREATE INDEX IF NOT EXISTS "StudioCertificate_universityId_idx" ON "StudioCertificate"("universityId")`, 'StudioCertificate.universityId idx');

  // ── TotpAccount table (per-email authenticator config, incl. linked emails) ──
  await safeExec(`CREATE TABLE IF NOT EXISTS "TotpAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "secret" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 0,
    "methods" TEXT NOT NULL DEFAULT '["email"]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`, 'TotpAccount');
  await safeExec(`CREATE INDEX IF NOT EXISTS "TotpAccount_email_idx" ON "TotpAccount"("email")`, 'TotpAccount.email idx');

  const count = await prisma.profile.count();
  console.log(`\nTotal profiles: ${count}`);

  await prisma.$disconnect();
  console.log('Done!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
