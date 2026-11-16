/** QA setup: temp super admin + temp dept admin for Phase-1 browser E2E.
 *  Run: bun qa/phase1-setup.ts  (bun auto-loads .env → Turso via app client)
 */
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

async function main() {
  const email = "qa-phase1-admin@qa.local";
  const deptEmail = "qa-phase1-dept@qa.local";
  const hash = await bcrypt.hash("QaAdmin@2025", 10);
  const deptHash = await bcrypt.hash("QaDept@2025", 10);

  await db.user.deleteMany({ where: { email: { in: [email, deptEmail] } } });

  const ice = await db.department.findFirst({
    where: { code: "ICE" },
    select: { id: true, universityId: true, name: true },
  });
  if (!ice) throw new Error("ICE department not found");

  await db.user.create({
    data: {
      email,
      password: hash,
      role: "super_admin",
      fullName: "QA Phase1 Admin",
      isActive: true,
    },
  });
  await db.user.create({
    data: {
      email: deptEmail,
      password: deptHash,
      role: "dept_admin",
      fullName: "QA Phase1 Dept Head",
      universityId: ice.universityId,
      departmentId: ice.id,
      isActive: true,
    },
  });
  console.log("QA_USERS_READY dept:", ice.id, "uni:", ice.universityId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
