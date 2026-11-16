/** Create the AuditLog table on Turso directly (db:push targets the local
 *  SQLite file; the running app uses the Turso driver adapter).
 *  Run: bun qa/create-auditlog-turso.ts
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";

const env = fs.readFileSync("/home/z/my-project/qa/env.master", "utf8");
const url = env.match(/TURSO_DATABASE_URL=(.+)/)?.[1]?.trim() ?? "";
const token = env.match(/TURSO_AUTH_TOKEN=(.+)/)?.[1]?.trim() ?? "";

const client = createClient({ url, authToken: token });

await client.batch(
  [
    `CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "actorId" TEXT,
  "actorName" TEXT,
  "actorRole" TEXT,
  "universityId" TEXT,
  "departmentId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "entityLabel" TEXT,
  "detail" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_universityId_createdAt_idx" ON "AuditLog"("universityId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt")`,
  ],
  "write"
);

const check = await client.execute("SELECT COUNT(*) as c FROM AuditLog");
console.log("AUDITLOG_READY rows:", check.rows[0]?.c);
