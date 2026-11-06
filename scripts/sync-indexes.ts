/**
 * Idempotent index sync for Turso (production).
 * Creates the 6 new indexes added in schema.prisma (Task 1-a fix #4).
 * Safe to re-run: CREATE INDEX IF NOT EXISTS.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url, authToken: token });

const stmts = [
  `CREATE INDEX IF NOT EXISTS user_universityId_idx ON "User"("universityId")`,
  `CREATE INDEX IF NOT EXISTS schedulechange_teacherId_idx ON "ScheduleChange"("teacherId")`,
  `CREATE INDEX IF NOT EXISTS notice_expiryDate_idx ON "Notice"("expiryDate")`,
  `CREATE INDEX IF NOT EXISTS attendance_studentId_date_idx ON "Attendance"("studentId","date")`,
  `CREATE INDEX IF NOT EXISTS attendancesession_expiresAt_idx ON "AttendanceSession"("expiresAt")`,
  `CREATE INDEX IF NOT EXISTS result_enteredBy_idx ON "Result"("enteredBy")`,
];

for (const sql of stmts) {
  try {
    await db.execute(sql);
    console.log("OK :", sql.slice(0, 70));
  } catch (err) {
    console.error("ERR:", sql.slice(0, 70), "→", String(err).slice(0, 120));
    process.exitCode = 1;
  }
}

const check = await db.execute(
  `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx' ORDER BY name`
);
console.log("--- indexes present ---");
for (const r of check.rows) console.log(" •", r.name);
