/**
 * Precise cleanup of the class-action-dialog E2E test data from Turso.
 * Removes ONLY the two changes created during browser verification:
 *   - cmw243cv8000cnfx4vb6i7dez (rescheduled · Official meeting)
 *   - cmw240e7b0001nfx4djj1s3fi (cancelled · Sick leave)
 * plus their linked auto-notices and fan-out notifications
 * (type cancelled/rescheduled created in the test window, ICE-1104).
 * User data is never touched.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error("TURSO env vars missing");
  process.exit(1);
}
const db = createClient({ url, authToken: token });

const CHANGE_IDS = ["cmw243cv8000cnfx4vb6i7dez", "cmw240e7b0001nfx4djj1s3fi"];

// 1. Find auto notices linked to these changes
const ph = CHANGE_IDS.map(() => "?").join(",");
const notices = await db.execute({
  sql: `SELECT id, title FROM Notice WHERE scheduleChangeId IN (${ph})`,
  args: CHANGE_IDS,
});
console.log("linked notices:", notices.rows.map((r) => `${r.id} (${r.title})`));

// 2. Delete fan-out notifications created for these changes in the test
//    window (types cancelled/rescheduled, today, matching titles)
const notifTypes = ["cancelled", "rescheduled"];
for (const type of notifTypes) {
  const res = await db.execute({
    sql: `DELETE FROM Notification WHERE type = ? AND createdAt >= '2026-11-04' AND title IN ('Class Cancelled: ICE-1104', 'Class Rescheduled: ICE-1104')`,
    args: [type],
  });
  console.log(`notifications deleted (${type}):`, res.rowsAffected);
}

// 3. Delete the notices
for (const n of notices.rows) {
  const res = await db.execute({ sql: `DELETE FROM Notice WHERE id = ?`, args: [n.id] });
  console.log("notice deleted:", n.id, res.rowsAffected);
}

// 4. Delete the schedule changes
for (const id of CHANGE_IDS) {
  const res = await db.execute({ sql: `DELETE FROM ScheduleChange WHERE id = ?`, args: [id] });
  console.log("scheduleChange deleted:", id, res.rowsAffected);
}

// 5. Verify
const left = await db.execute({
  sql: `SELECT COUNT(*) AS n FROM ScheduleChange WHERE id IN (${ph})`,
  args: CHANGE_IDS,
});
console.log("remaining test changes (should be 0):", left.rows[0].n);
console.log("cleanup done");
