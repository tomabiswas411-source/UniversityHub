import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import type { PlanDTO, UniversityDTO } from "@/types";

/** Plan.features is a JSON string column — malformed data must not 500. */
function safeParseFeatures(raw: string | null | undefined): string[] {
 try {
 const parsed: unknown = JSON.parse(raw || "[]");
 return Array.isArray(parsed) ? (parsed as string[]) : [];
 } catch {
 return [];
 }
}

/** GET /api/portal — public platform data: universities, plans, stats */
export async function GET() {
 return handle(async () => {
 const [universities, plans] = await Promise.all([
 db.university.findMany({
 where: { isActive: true },
 include: {
 plan: { select: { name: true } },
 _count: {
 select: {
 departments: { where: { isActive: true } },
 users: { where: { isActive: true } },
 },
 },
 },
 orderBy: { name: "asc" },
 }),
 db.plan.findMany({
 where: { isActive: true },
 orderBy: { sortOrder: "asc" },
 }),
 ]);

 const uniIds = universities.map((u) => u.id);
 const [deptCount, teacherCount, studentCount, scheduleCount] =
 await Promise.all([
 db.department.count({ where: { universityId: { in: uniIds } } }),
 db.user.count({
 where: { role: "teacher", isActive: true, universityId: { in: uniIds } },
 }),
 db.user.count({
 where: { role: "student", isActive: true, universityId: { in: uniIds } },
 }),
 db.schedule.count({ where: { isActive: true } }),
 ]);

 const uniDTOs: (UniversityDTO & { planName?: string | null })[] =
 universities.map((u) => ({
 id: u.id,
 name: u.name,
 slug: u.slug,
 shortName: u.shortName,
 logoURL: u.logoURL,
 address: u.address,
 contactEmail: u.contactEmail,
 contactPhone: u.contactPhone,
 websiteURL: u.websiteURL,
 aboutText: u.aboutText,
 facebookURL: u.facebookURL,
 planId: u.planId,
 planName: u.plan?.name ?? null,
 isActive: u.isActive,
 _count: {
 departments: u._count.departments,
 users: u._count.users,
 },
 }));

 const planDTOs: PlanDTO[] = plans.map((p) => ({
 id: p.id,
 name: p.name,
 slug: p.slug,
 tagline: p.tagline,
 priceMonthly: p.priceMonthly,
 priceYearly: p.priceYearly,
 maxDepartments: p.maxDepartments,
 maxStudents: p.maxStudents,
 maxTeachers: p.maxTeachers,
 features: safeParseFeatures(p.features),
 isActive: p.isActive,
 sortOrder: p.sortOrder,
 }));

 return {
 universities: uniDTOs,
 plans: planDTOs,
 stats: {
 universities: uniDTOs.length,
 departments: deptCount,
 teachers: teacherCount,
 students: studentCount,
 schedules: scheduleCount,
 },
 };
 });
}
