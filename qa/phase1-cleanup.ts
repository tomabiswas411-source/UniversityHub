/** QA cleanup: remove every Phase-1 test artifact.
 *  Run: bun qa/phase1-cleanup.ts
 */
import { db } from "../src/lib/db";

async function main() {
  // 1. QA users
  const delUsers = await db.user.deleteMany({
    where: { email: { in: ["qa-phase1-admin@qa.local", "qa-phase1-dept@qa.local"] } },
  });

  // 2. QA students created via import commit (ID numbers 2103999 + 'bademail')
  const delStudents = await db.user.deleteMany({
    where: {
      role: "student",
      OR: [
        { studentIdNumber: "2103999" },
        { studentIdNumber: "bademail" },
        { fullName: { startsWith: "QA " } },
        { fullName: "UI Test Student" },
      ],
    },
  });

  // 3. Reset ru subscription expiry (QA set it +10 days for the banner test)
  const ru = await db.university.update({
    where: { slug: "ru" },
    data: { planExpiresAt: null },
    select: { id: true, planExpiresAt: true },
  });

  // 4. QA audit logs
  const delLogs = await db.auditLog.deleteMany({
    where: { actorName: { startsWith: "QA Phase1" } },
  });

  console.log(
    `CLEANUP_OK users=${delUsers.count} students=${delStudents.count} logs=${delLogs.count} ruExpiry=${ru.planExpiresAt}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
