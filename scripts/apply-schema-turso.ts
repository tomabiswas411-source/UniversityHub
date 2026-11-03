/**
 * Apply the Prisma-generated DDL to the remote Turso (LibSQL) database.
 * Idempotent: drops all tables first, then creates in FK-dependency order.
 * Usage: bun scripts/apply-schema-turso.ts
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment");
  process.exit(1);
}

const client = createClient({ url, authToken });

// Dependency order for CREATE (parents first). Reverse for DROP (children first).
const ORDER = [
  "Plan",
  "University",
  "Department",
  "Program",
  "User",
  "Course",
  "Room",
  "TimeSlot",
  "Schedule",
  "ScheduleChange",
  "Notice",
  "Notification",
  "Assignment",
  "Result",
  "Attendance",
  "SiteSettings",
  "AcademicCalendar",
];

// ---- 1. Wipe all existing tables (children first to avoid FK errors) ----
const existing = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'libsql%'"
);
const existingNames = existing.rows.map((r) => r.name as string);
existingNames.sort((a, b) => {
  const ia = ORDER.indexOf(a) === -1 ? 999 : ORDER.indexOf(a);
  const ib = ORDER.indexOf(b) === -1 ? 999 : ORDER.indexOf(b);
  return ib - ia; // reverse dependency order
});
for (const table of existingNames) {
  await client.execute(`DROP TABLE IF EXISTS "${table}"`);
  console.log(`dropped: ${table}`);
}

// ---- 2. Parse DDL statements ----
const sqlPath = path.join(process.cwd(), "scripts", "turso-schema.sql");
const raw = readFileSync(sqlPath, "utf-8");

function clean(stmt: string): string {
  return stmt
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .trim();
}

const createTables: { name: string; sql: string }[] = [];
const otherStatements: string[] = [];

for (const chunk of raw.split(";")) {
  const c = clean(chunk);
  if (!c) continue;
  const m = c.match(/CREATE TABLE "([^"]+)"/);
  if (m) {
    createTables.push({ name: m[1], sql: c });
  } else {
    otherStatements.push(c);
  }
}

// ---- 3. Sort CREATE TABLE in FK-dependency order ----
createTables.sort(
  (a, b) =>
    (ORDER.indexOf(a.name) === -1 ? 999 : ORDER.indexOf(a.name)) -
    (ORDER.indexOf(b.name) === -1 ? 999 : ORDER.indexOf(b.name))
);

// ---- 4. Execute ----
let applied = 0;
for (const t of createTables) {
  try {
    await client.execute(t.sql);
    applied++;
    console.log(`created: ${t.name}`);
  } catch (err) {
    console.error(
      "FAILED create for " + t.name + ":\n" + t.sql.slice(0, 150) + "\n",
      (err as Error).message
    );
    process.exit(1);
  }
}
for (const stmt of otherStatements) {
  try {
    await client.execute(stmt);
    applied++;
  } catch (err) {
    console.error("FAILED other statement:\n" + stmt.slice(0, 200) + "\n", (err as Error).message);
    process.exit(1);
  }
}
console.log(`✓ Applied ${applied} statements to Turso.`);

// ---- 5. Verify ----
const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'libsql%' ORDER BY name"
);
console.log(
  "Tables:",
  tables.rows.map((r) => r.name).join(", ")
);
