-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tagline" TEXT,
    "priceMonthly" REAL NOT NULL DEFAULT 0,
    "priceYearly" REAL NOT NULL DEFAULT 0,
    "maxDepartments" INTEGER NOT NULL DEFAULT 1,
    "maxStudents" INTEGER NOT NULL DEFAULT 100,
    "maxTeachers" INTEGER NOT NULL DEFAULT 5,
    "features" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortName" TEXT,
    "logoURL" TEXT,
    "address" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "websiteURL" TEXT,
    "aboutText" TEXT,
    "facebookURL" TEXT,
    "planId" TEXT,
    "planExpiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "University_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logoURL" TEXT,
    "description" TEXT,
    "building" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "facebookURL" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Department_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "universityId" TEXT,
    "departmentId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "email" TEXT,
    "password" TEXT,
    "fullName" TEXT NOT NULL,
    "designation" TEXT,
    "phone" TEXT,
    "photoURL" TEXT,
    "bio" TEXT,
    "officeRoom" TEXT,
    "studentIdNumber" TEXT,
    "rollNumber" TEXT,
    "guardianPhone" TEXT,
    "section" TEXT,
    "programId" TEXT,
    "semester" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "semesterCount" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Program_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditHours" REAL NOT NULL DEFAULT 3.0,
    "type" TEXT NOT NULL DEFAULT 'theory',
    "semester" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Course_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "building" TEXT,
    "type" TEXT NOT NULL DEFAULT 'classroom',
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Room_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotOrder" INTEGER NOT NULL DEFAULT 1,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeSlot_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "classType" TEXT NOT NULL DEFAULT 'theory',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Schedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "originalDay" TEXT,
    "originalTimeSlotId" TEXT,
    "originalStartTime" TEXT,
    "originalEndTime" TEXT,
    "originalRoomId" TEXT,
    "originalRoomNumber" TEXT,
    "newDay" TEXT,
    "newTimeSlotId" TEXT,
    "newStartTime" TEXT,
    "newEndTime" TEXT,
    "newRoomId" TEXT,
    "newRoomNumber" TEXT,
    "effectiveDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "programId" TEXT,
    "semester" INTEGER,
    "changedBy" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleChange_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleChange_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "audience" TEXT NOT NULL DEFAULT 'all',
    "changeType" TEXT,
    "scheduleChangeId" TEXT,
    "programId" TEXT,
    "semester" INTEGER,
    "postedBy" TEXT NOT NULL,
    "postedByName" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "attachmentURL" TEXT,
    "expiryDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notice_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notice_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" DATETIME,
    "maxMarks" REAL,
    "attachmentURL" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Assignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enteredBy" TEXT NOT NULL,
    "examType" TEXT NOT NULL DEFAULT 'final',
    "marks" REAL NOT NULL,
    "maxMarks" REAL NOT NULL DEFAULT 100,
    "grade" TEXT,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Result_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_enteredBy_fkey" FOREIGN KEY ("enteredBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'general',
    "universityId" TEXT NOT NULL,
    "siteName" TEXT,
    "heroText" TEXT,
    "academicSession" TEXT,
    "noticeBanner" TEXT,
    "primaryColor" TEXT,
    "logoURL" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "aboutText" TEXT,
    "facebookURL" TEXT,
    "websiteURL" TEXT,
    "developerName" TEXT,
    "developerURL" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SiteSettings_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AcademicCalendar" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "universityId" TEXT NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "endDate" DATETIME,
    "eventType" TEXT NOT NULL DEFAULT 'event',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AcademicCalendar_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "University_slug_key" ON "University"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Department_universityId_code_key" ON "Department"("universityId", "code");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_universityId_email_key" ON "User"("universityId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_universityId_studentIdNumber_key" ON "User"("universityId", "studentIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Program_departmentId_shortName_key" ON "Program"("departmentId", "shortName");

-- CreateIndex
CREATE UNIQUE INDEX "Course_departmentId_code_key" ON "Course"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Room_departmentId_roomNumber_key" ON "Room"("departmentId", "roomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_departmentId_label_key" ON "TimeSlot"("departmentId", "label");

-- CreateIndex
CREATE INDEX "Schedule_departmentId_dayOfWeek_idx" ON "Schedule"("departmentId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Schedule_teacherId_idx" ON "Schedule"("teacherId");

-- CreateIndex
CREATE INDEX "ScheduleChange_departmentId_effectiveDate_idx" ON "ScheduleChange"("departmentId", "effectiveDate");

-- CreateIndex
CREATE INDEX "Notice_departmentId_createdAt_idx" ON "Notice"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Assignment_departmentId_courseId_idx" ON "Assignment"("departmentId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_courseId_studentId_examType_key" ON "Result"("courseId", "studentId", "examType");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_universityId_key" ON "SiteSettings"("universityId");

-- CreateIndex
CREATE INDEX "AcademicCalendar_universityId_date_idx" ON "AcademicCalendar"("universityId", "date");

