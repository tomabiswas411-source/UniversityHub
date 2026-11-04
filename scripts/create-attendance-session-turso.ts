/**
 * Incremental Turso migration — AttendanceSession table (idempotent).
 *
 * Creates the QR self check-in session table exactly as defined by the
 * AttendanceSession model in prisma/schema.prisma (columns, defaults,
 * FKs and indexes). Safe to run on a live database and to re-run:
 * every statement is `CREATE … IF NOT EXISTS`.
 *
 * Never drops or rewrites existing data — safe to run on live Turso.
 * Usage: TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… bun scripts/create-attendance-session-turso.ts
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment");
  process.exit(1);
}

const client = createClient({ url, authToken });

// Mirrors prisma/schema.prisma → model AttendanceSession:
//   id, departmentId, scheduleId, courseId, teacherId, token (@unique),
//   date, durationSec (default 120), startsAt (default now), expiresAt,
//   closed (default false), presentCount (default 0),
//   geoLat/geoLng/geoRadiusM (nullable geo-fence), createdAt (default now).
// Relations: schedule (ON DELETE CASCADE), teacher (ON DELETE CASCADE).
const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS "AttendanceSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "departmentId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "durationSec" INTEGER NOT NULL DEFAULT 120,
  "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "closed" BOOLEAN NOT NULL DEFAULT false,
  "presentCount" INTEGER NOT NULL DEFAULT 0,
  "geoLat" REAL,
  "geoLng" REAL,
  "geoRadiusM" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceSession_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

// token @unique + the two @@index definitions on the model.
const INDEXES: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceSession_token_key" ON "AttendanceSession"("token")`,
  `CREATE INDEX IF NOT EXISTS "AttendanceSession_departmentId_createdAt_idx" ON "AttendanceSession"("departmentId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AttendanceSession_scheduleId_date_idx" ON "AttendanceSession"("scheduleId", "date")`,
];

await client.execute(CREATE_TABLE);
console.log('✓ table "AttendanceSession" ready');

for (const stmt of INDEXES) {
  await client.execute(stmt);
}
console.log("✓ indexes ready (token unique, departmentId+createdAt, scheduleId+date)");

// Final verification dump
const info = await client.execute(`PRAGMA table_info("AttendanceSession")`);
console.log(`\nAttendanceSession: ${info.rows.map((r) => r.name).join(", ")}`);
const idx = await client.execute(`PRAGMA index_list("AttendanceSession")`);
console.log(`indexes: ${idx.rows.map((r) => r.name).join(", ")}`);
console.log("\nDone.");
