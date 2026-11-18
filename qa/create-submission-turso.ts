/** Create the AssignmentSubmission table on Turso directly (db:push targets
 *  the local SQLite file; the running app uses the Turso driver adapter).
 *  Run: bun qa/create-submission-turso.ts
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";

const env = fs.readFileSync("/home/z/my-project/qa/env.master", "utf8");
const url = env.match(/TURSO_DATABASE_URL=(.+)/)?.[1]?.trim() ?? "";
const token = env.match(/TURSO_AUTH_TOKEN=(.+)/)?.[1]?.trim() ?? "";

const client = createClient({ url, authToken: token });

await client.batch(
  [
    `CREATE TABLE IF NOT EXISTS "AssignmentSubmission" (
  "id" TEXT PRIMARY KEY,
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "text" TEXT,
  "fileName" TEXT,
  "fileURL" TEXT,
  "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "resubmitted" BOOLEAN NOT NULL DEFAULT false,
  "grade" REAL,
  "feedback" TEXT,
  "gradedBy" TEXT,
  "gradedByName" TEXT,
  "gradedAt" DATETIME,
  CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssignmentSubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AssignmentSubmission_assignmentId_studentId_key" ON "AssignmentSubmission"("assignmentId", "studentId")`,
    `CREATE INDEX IF NOT EXISTS "AssignmentSubmission_assignmentId_idx" ON "AssignmentSubmission"("assignmentId")`,
    `CREATE INDEX IF NOT EXISTS "AssignmentSubmission_studentId_idx" ON "AssignmentSubmission"("studentId")`,
    `CREATE INDEX IF NOT EXISTS "AssignmentSubmission_departmentId_idx" ON "AssignmentSubmission"("departmentId")`,
  ],
  "write"
);

const check = await client.execute(
  "SELECT sql FROM sqlite_master WHERE name = 'AssignmentSubmission'"
);
console.log(
  "SUBMISSION_TABLE:",
  check.rows.length > 0 ? "READY" : "MISSING"
);
