/**
 * Phase 3 (D38-39) — FK enforcement + orphan audit against Turso.
 *
 * 1. Verify `PRAGMA foreign_keys` is ON on the live Turso connection.
 *    Prisma with driver adapters delegates referential actions (cascade /
 *    restrict) to SQLite — if the pragma is OFF, every cascade in the
 *    schema is inert and hard-deletes would orphan child rows.
 * 2. Count actual orphan rows across the graph (left-join anti-joins).
 *
 * Read-only. Run: bun qa/phase3-integrity.ts
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error("TURSO env vars not set — load .env first (bun auto-loads .env).");
  process.exit(1);
}

const db = createClient({ url, authToken: token });

async function scalar(sql: string): Promise<number> {
  const r = await db.execute(sql);
  const v = r.rows[0]?.[0];
  return Number(v ?? 0);
}

async function main() {
  console.log("== 1. FK pragma on live Turso connection ==");
  const fk = await db.execute("PRAGMA foreign_keys;");
  console.log("  PRAGMA foreign_keys =", fk.rows[0]?.[0], "(1 = ON)");

  // libsql/hrana may not expose session pragmas — try to SET it as a probe.
  try {
    await db.execute("PRAGMA foreign_keys = ON;");
    const after = await db.execute("PRAGMA foreign_keys;");
    console.log("  after SET →", after.rows[0]?.[0]);
  } catch (e) {
    console.log("  SET probe failed (server-managed):", (e as Error).message);
  }

  console.log("\n== 2. Orphan counts (anti-joins) ==");
  const checks: Array<[string, string]> = [
    ["Attendance → missing Schedule", "SELECT COUNT(*) FROM Attendance a LEFT JOIN Schedule s ON s.id = a.scheduleId WHERE s.id IS NULL"],
    ["Attendance → missing student User", "SELECT COUNT(*) FROM Attendance a LEFT JOIN User u ON u.id = a.studentId WHERE u.id IS NULL"],
    ["AttendanceSession → missing Schedule", "SELECT COUNT(*) FROM AttendanceSession s2 LEFT JOIN Schedule s ON s.id = s2.scheduleId WHERE s.id IS NULL"],
    ["AssignmentSubmission → missing Assignment", "SELECT COUNT(*) FROM AssignmentSubmission x LEFT JOIN Assignment a ON a.id = x.assignmentId WHERE a.id IS NULL"],
    ["AssignmentSubmission → missing student", "SELECT COUNT(*) FROM AssignmentSubmission x LEFT JOIN User u ON u.id = x.studentId WHERE u.id IS NULL"],
    ["Assignment → missing Course", "SELECT COUNT(*) FROM Assignment a LEFT JOIN Course c ON c.id = a.courseId WHERE c.id IS NULL"],
    ["Result → missing Course", "SELECT COUNT(*) FROM Result r LEFT JOIN Course c ON c.id = r.courseId WHERE c.id IS NULL"],
    ["Result → missing student", "SELECT COUNT(*) FROM Result r LEFT JOIN User u ON u.id = r.studentId WHERE u.id IS NULL"],
    ["Schedule → missing Course", "SELECT COUNT(*) FROM Schedule s LEFT JOIN Course c ON c.id = s.courseId WHERE c.id IS NULL"],
    ["Schedule → missing teacher", "SELECT COUNT(*) FROM Schedule s LEFT JOIN User u ON u.id = s.teacherId WHERE u.id IS NULL"],
    ["Notification → missing User", "SELECT COUNT(*) FROM Notification n LEFT JOIN User u ON u.id = n.userId WHERE u.id IS NULL"],
    ["Notice → missing Department", "SELECT COUNT(*) FROM Notice n LEFT JOIN Department d ON d.id = n.departmentId WHERE d.id IS NULL"],
    ["ScheduleChange → missing Schedule", "SELECT COUNT(*) FROM ScheduleChange sc LEFT JOIN Schedule s ON s.id = sc.scheduleId WHERE s.id IS NULL"],
    ["User → missing University (non-null, university-less)", "SELECT COUNT(*) FROM User u LEFT JOIN University un ON un.id = u.universityId WHERE u.universityId IS NOT NULL AND un.id IS NULL"],
    ["User(dept) → missing Department", "SELECT COUNT(*) FROM User u LEFT JOIN Department d ON d.id = u.departmentId WHERE u.departmentId IS NOT NULL AND d.id IS NULL"],
    ["Department → missing University", "SELECT COUNT(*) FROM Department d LEFT JOIN University un ON un.id = d.universityId WHERE un.id IS NULL"],
    ["AcademicCalendar → missing University", "SELECT COUNT(*) FROM AcademicCalendar ac LEFT JOIN University un ON un.id = ac.universityId WHERE un.id IS NULL"],
  ];
  let totalOrphans = 0;
  for (const [label, sql] of checks) {
    const n = await scalar(sql);
    totalOrphans += n;
    console.log(`  ${n === 0 ? "OK  " : "WARN"} ${label}: ${n}`);
  }

  console.log("\n== 3. Uniqueness sanity ==");
  const dupEmails = await scalar(
    "SELECT COUNT(*) FROM (SELECT email, universityId, COUNT(*) c FROM User WHERE email IS NOT NULL AND universityId IS NOT NULL GROUP BY email, universityId HAVING c > 1)"
  );
  console.log(`  duplicate (university,email) pairs: ${dupEmails}`);
  const dupRolls = await scalar(
    "SELECT COUNT(*) FROM (SELECT rollNumber, departmentId, COUNT(*) c FROM User WHERE rollNumber IS NOT NULL AND departmentId IS NOT NULL GROUP BY rollNumber, departmentId HAVING c > 1)"
  );
  console.log(`  duplicate (department,roll) pairs: ${dupRolls}`);
  const openSessions = await scalar(
    "SELECT COUNT(*) FROM AttendanceSession WHERE closed = 0 AND expiresAt < datetime('now', '-1 hour')"
  );
  console.log(`  stale OPEN QR sessions (>1h past expiry): ${openSessions}`);

  console.log(`\nTOTAL orphan rows: ${totalOrphans}`);
  console.log(
    totalOrphans === 0
      ? "INTEGRITY: CLEAN"
      : "INTEGRITY: ISSUES FOUND — review WARN lines above"
  );
}

main().catch((e) => {
  console.error("audit failed:", e);
  process.exit(1);
});
