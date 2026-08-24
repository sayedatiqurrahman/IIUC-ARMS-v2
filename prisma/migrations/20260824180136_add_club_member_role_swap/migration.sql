-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "universityId" TEXT,
    "whatsapp" TEXT,
    "semester" TEXT,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "facebook" TEXT,
    "githubLogin" TEXT,
    "hideUniversityId" BOOLEAN NOT NULL DEFAULT false,
    "hideWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "linkedin" TEXT,
    "twitter" TEXT,
    "website" TEXT,
    "githubToken" TEXT,
    "company" TEXT,
    "companyUrl" TEXT,
    "hideEmail" BOOLEAN NOT NULL DEFAULT false,
    "hideSemester" BOOLEAN NOT NULL DEFAULT false,
    "publicEmail" TEXT,
    "githubInstallationId" TEXT,
    "githubAvatar" TEXT,
    "role" TEXT DEFAULT 'user',
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "title" TEXT,
    "isBanned" BOOLEAN DEFAULT false,
    "shortForm" TEXT,
    "department" TEXT,
    "isCR" BOOLEAN DEFAULT false,
    "isACR" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT,
    "totpMethods" TEXT NOT NULL DEFAULT '["email"]',
    "hideCompany" BOOLEAN DEFAULT false,
    "hideFacebook" BOOLEAN DEFAULT false,
    "hideTwitter" BOOLEAN DEFAULT false,
    "hideLinkedin" BOOLEAN DEFAULT false,
    "hideWebsite" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "bannedBy" TEXT,
    "customPermissions" JSONB DEFAULT {},
    "telegramId" TEXT,
    "batchId" TEXT,
    "telegramChatId" TEXT,
    "session" TEXT,
    "telegramVerified" BOOLEAN DEFAULT false,
    "telegramOtp" TEXT,
    "telegramOtpExpiresAt" DATETIME,
    "telegramConnectState" TEXT,
    "linkedEmails" TEXT NOT NULL DEFAULT '[]',
    "showInContributors" BOOLEAN DEFAULT true,
    "accountStatus" TEXT DEFAULT 'active',
    "profileType" TEXT DEFAULT ''
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FacultyMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "shortForm" TEXT,
    "memberType" TEXT NOT NULL DEFAULT 'faculty',
    "isCR" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "claimedBy" TEXT
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UploadChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "data" BLOB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'site-settings',
    "permissions" JSONB NOT NULL DEFAULT {},
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraDepartments" JSONB DEFAULT {},
    "customFaculties" JSONB DEFAULT [],
    "contributorSettings" JSONB,
    "blockedTelegramChats" JSONB DEFAULT [],
    "blockedTelegramUsernames" JSONB DEFAULT [],
    "customRoles" JSONB DEFAULT [],
    "broadcastTargets" JSONB DEFAULT []
);

-- CreateTable
CREATE TABLE "SemesterCourse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "semester" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teacher" TEXT,
    "room" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PublishedRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routineId" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "session" TEXT,
    "branch" TEXT,
    "gender" TEXT,
    "academicYear" TEXT,
    "department" TEXT,
    "university" TEXT,
    "room" TEXT,
    "periods" JSONB NOT NULL,
    "days" JSONB NOT NULL,
    "courses" JSONB NOT NULL,
    "slots" JSONB NOT NULL,
    "malePeriods" JSONB,
    "femalePeriods" JSONB,
    "maleSlots" JSONB,
    "femaleSlots" JSONB,
    "publishedBy" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "scheduledAt" DATETIME
);

-- CreateTable
CREATE TABLE "FacultyRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "shortForm" TEXT,
    "memberType" TEXT NOT NULL DEFAULT 'faculty',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PublishedExamRoutine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "examId" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "session" TEXT,
    "department" TEXT,
    "examType" TEXT,
    "type" TEXT,
    "rows" JSONB NOT NULL,
    "slots" JSONB NOT NULL,
    "publishedBy" TEXT,
    "publishedByEmail" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "scheduledAt" DATETIME
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "gender" TEXT NOT NULL DEFAULT 'both',
    "building" TEXT,
    "floor" TEXT,
    "numberOfColumns" INTEGER,
    "chairsPerColumn" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "idRange" TEXT,
    "startSemester" TEXT NOT NULL DEFAULT '1st-semister',
    "currentSemester" TEXT NOT NULL DEFAULT '1st-semister',
    "isGraduated" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetEndDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BatchStudent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "originalId" TEXT,
    "name" TEXT,
    "isReAdmission" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "TelegramNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentBy" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClubMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "assignedBy" TEXT,
    "previousRole" TEXT,
    "previousRoleSession" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubMember_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" DATETIME,
    "venue" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClubEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certificateId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "eventId" TEXT,
    "memberName" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "session" TEXT,
    "post" TEXT,
    "eventName" TEXT,
    "servicePeriod" TEXT,
    "signatories" TEXT,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubCertificate_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClubClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL DEFAULT 'member',
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubClaim_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Profile_githubLogin_idx" ON "Profile"("githubLogin");

-- CreateIndex
CREATE INDEX "Profile_email_idx" ON "Profile"("email");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "FacultyMember_claimedBy_idx" ON "FacultyMember"("claimedBy");

-- CreateIndex
CREATE INDEX "Course_department_idx" ON "Course"("department");

-- CreateIndex
CREATE INDEX "Course_semester_idx" ON "Course"("semester");

-- CreateIndex
CREATE UNIQUE INDEX "Course_department_semester_code_key" ON "Course"("department", "semester", "code");

-- CreateIndex
CREATE INDEX "UploadChunk_sessionId_userId_idx" ON "UploadChunk"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "UploadChunk_userId_idx" ON "UploadChunk"("userId");

-- CreateIndex
CREATE INDEX "UploadChunk_createdAt_idx" ON "UploadChunk"("createdAt");

-- CreateIndex
CREATE INDEX "SemesterCourse_semester_idx" ON "SemesterCourse"("semester");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterCourse_semester_code_key" ON "SemesterCourse"("semester", "code");

-- CreateIndex
CREATE INDEX "PublishedRoutine_routineId_idx" ON "PublishedRoutine"("routineId");

-- CreateIndex
CREATE INDEX "PublishedRoutine_semester_idx" ON "PublishedRoutine"("semester");

-- CreateIndex
CREATE INDEX "PublishedRoutine_expiresAt_idx" ON "PublishedRoutine"("expiresAt");

-- CreateIndex
CREATE INDEX "PublishedRoutine_status_idx" ON "PublishedRoutine"("status");

-- CreateIndex
CREATE INDEX "FacultyRequest_requesterId_idx" ON "FacultyRequest"("requesterId");

-- CreateIndex
CREATE INDEX "FacultyRequest_status_idx" ON "FacultyRequest"("status");

-- CreateIndex
CREATE INDEX "FacultyRequest_department_idx" ON "FacultyRequest"("department");

-- CreateIndex
CREATE INDEX "PublishedExamRoutine_examId_idx" ON "PublishedExamRoutine"("examId");

-- CreateIndex
CREATE INDEX "PublishedExamRoutine_semester_idx" ON "PublishedExamRoutine"("semester");

-- CreateIndex
CREATE INDEX "PublishedExamRoutine_department_idx" ON "PublishedExamRoutine"("department");

-- CreateIndex
CREATE INDEX "PublishedExamRoutine_expiresAt_idx" ON "PublishedExamRoutine"("expiresAt");

-- CreateIndex
CREATE INDEX "PublishedExamRoutine_status_idx" ON "PublishedExamRoutine"("status");

-- CreateIndex
CREATE INDEX "Room_department_idx" ON "Room"("department");

-- CreateIndex
CREATE UNIQUE INDEX "Room_department_name_key" ON "Room"("department", "name");

-- CreateIndex
CREATE INDEX "Batch_department_idx" ON "Batch"("department");

-- CreateIndex
CREATE INDEX "BatchStudent_batchId_idx" ON "BatchStudent"("batchId");

-- CreateIndex
CREATE INDEX "BatchStudent_email_idx" ON "BatchStudent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BatchStudent_batchId_universityId_key" ON "BatchStudent"("batchId", "universityId");

-- CreateIndex
CREATE INDEX "TelegramNotification_department_idx" ON "TelegramNotification"("department");

-- CreateIndex
CREATE INDEX "TelegramNotification_sentAt_idx" ON "TelegramNotification"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "Club_department_idx" ON "Club"("department");

-- CreateIndex
CREATE INDEX "Club_slug_idx" ON "Club"("slug");

-- CreateIndex
CREATE INDEX "ClubMember_clubId_idx" ON "ClubMember"("clubId");

-- CreateIndex
CREATE INDEX "ClubMember_userId_idx" ON "ClubMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubMember_clubId_userId_key" ON "ClubMember"("clubId", "userId");

-- CreateIndex
CREATE INDEX "ClubEvent_clubId_idx" ON "ClubEvent"("clubId");

-- CreateIndex
CREATE INDEX "ClubEvent_eventDate_idx" ON "ClubEvent"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "ClubCertificate_certificateId_key" ON "ClubCertificate"("certificateId");

-- CreateIndex
CREATE INDEX "ClubCertificate_clubId_idx" ON "ClubCertificate"("clubId");

-- CreateIndex
CREATE INDEX "ClubCertificate_certificateId_idx" ON "ClubCertificate"("certificateId");

-- CreateIndex
CREATE INDEX "ClubCertificate_universityId_idx" ON "ClubCertificate"("universityId");

-- CreateIndex
CREATE INDEX "ClubClaim_clubId_idx" ON "ClubClaim"("clubId");

-- CreateIndex
CREATE INDEX "ClubClaim_userId_idx" ON "ClubClaim"("userId");

-- CreateIndex
CREATE INDEX "ClubClaim_status_idx" ON "ClubClaim"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClubClaim_clubId_userId_key" ON "ClubClaim"("clubId", "userId");
