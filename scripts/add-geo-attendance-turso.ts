/**
 * Incremental Turso migration — geo-fence + anti-fraud columns (idempotent).
 *
 * Adds what the QR attendance feature needs on top of the original
 * add-attendance-turso.ts migration:
 *  • Attendance.deviceId / Attendance.distanceM   (device guard + audit)
 *  • AttendanceSession.geoLat / geoLng / geoRadiusM (classroom geo-fence)
 *  • unique index Attendance(scheduleId, date, deviceId)
 *
 * Never drops or rewrites existing data — safe to run on live Turso.
 * Usage: TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… bun scripts/add-geo-attendance-turso.ts
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment");
  process.exit(1);
}

const client = createClient({ url, authToken });

/** [table, column, sqliteType] — added only when missing. */
const COLUMNS: [string, string, string][] = [
  ["Attendance", "deviceId", "TEXT"],
  ["Attendance", "distanceM", "INTEGER"],
  ["AttendanceSession", "geoLat", "REAL"],
  ["AttendanceSession", "geoLng", "REAL"],
  ["AttendanceSession", "geoRadiusM", "INTEGER"],
];

const UNIQUE_DEVICE_INDEX =
  `CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_scheduleId_date_deviceId_key" ` +
  `ON "Attendance"("scheduleId", "date", "deviceId")`;

let added = 0;
for (const [table, col, type] of COLUMNS) {
  const info = await client.execute(`PRAGMA table_info("${table}")`);
  if (info.rows.length === 0) {
    console.error(`✗ table "${table}" not found — run add-attendance-turso.ts first`);
    process.exit(1);
  }
  const exists = info.rows.some((r) => r.name === col);
  if (exists) {
    console.log(`• ${table}.${col} already exists — skipped`);
    continue;
  }
  await client.execute(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${type}`);
  added++;
  console.log(`✓ ${table}.${col} ${type} added`);
}

await client.execute(UNIQUE_DEVICE_INDEX);
console.log("✓ unique index Attendance(scheduleId, date, deviceId) ready");

// Final verification dump
for (const t of ["Attendance", "AttendanceSession"]) {
  const info = await client.execute(`PRAGMA table_info("${t}")`);
  console.log(`\n${t}: ${info.rows.map((r) => r.name).join(", ")}`);
}
console.log(`\nDone — ${added} column(s) added.`);
