/**
 * Incremental Turso migration — adds the Attendance table (idempotent).
 * Does NOT drop or alter any existing table, so live data is safe.
 * Usage: bun scripts/add-attendance-turso.ts
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment");
  process.exit(1);
}

const client = createClient({ url, authToken });

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'present',
    "markedBy" TEXT NOT NULL,
    "markedByName" TEXT,
    "courseCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attendance_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attendance_markedBy_fkey" FOREIGN KEY ("markedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`;

const INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_scheduleId_studentId_date_key" ON "Attendance"("scheduleId", "studentId", "date")`,
  `CREATE INDEX IF NOT EXISTS "Attendance_departmentId_date_idx" ON "Attendance"("departmentId", "date")`,
  `CREATE INDEX IF NOT EXISTS "Attendance_studentId_courseId_idx" ON "Attendance"("studentId", "courseId")`,
  `CREATE INDEX IF NOT EXISTS "Attendance_courseId_date_idx" ON "Attendance"("courseId", "date")`,
];

await client.execute(CREATE_TABLE);
console.log("✓ table Attendance ready");
for (const idx of INDEXES) {
  await client.execute(idx);
}
console.log("✓ indexes ready");

const check = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='Attendance'"
);
console.log(
  check.rows.length === 1
    ? "✓ Attendance table verified on Turso"
    : "✗ Attendance table NOT found — check credentials"
);
