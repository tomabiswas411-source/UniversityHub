import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { runCleanup } from "@/lib/cleanup";

/** Trimmed, hard-capped string — long-field caps keep free-text abuse
    from bloating university rows (2000 chars max, 200 for short ones). */
function cleanStr(v: unknown, maxLen: number): string {
  return String(v).trim().slice(0, maxLen);
}

const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72; // bcrypt only hashes the first 72 bytes

function validatePassword(pw: string): void {
  if (pw.length < PASSWORD_MIN) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  if (pw.length > PASSWORD_MAX) {
    throw new ApiError(
      400,
      "Password must be at most 72 characters (bcrypt limit)"
    );
  }
}

/**
 * Super Admin API.
 * GET /api/admin/overview → platform stats + universities + plans
 * GET /api/admin/users?role=&universityId=&active=&q= → platform user directory
 * PUT /api/admin/users?id= → activate/deactivate · change role · reset password
 * GET /api/admin/system → every model's row count (platform health)
 * POST /api/admin/system-cleanup → run the retention sweep now
 * POST /api/admin/universities → create university
 * PUT /api/admin/universities?id=
 * DELETE /api/admin/universities?id=
 * POST /api/admin/plans → create/update plan
 */
type Ctx = { params: Promise<{ action: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const { searchParams } = new URL(req.url);

 if (action === "overview") {
 const [universities, plans] = await Promise.all([
 db.university.findMany({
 include: {
 plan: { select: { name: true, slug: true } },
 _count: {
 select: {
 departments: true,
 users: { where: { isActive: true } },
 },
 },
 },
 orderBy: { createdAt: "desc" },
 }),
 db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
 ]);

 const [totalTeachers, totalStudents, totalSchedules] = await Promise.all([
 db.user.count({ where: { role: "teacher", isActive: true } }),
 db.user.count({ where: { role: "student", isActive: true } }),
 db.schedule.count({ where: { isActive: true } }),
 ]);

 return {
 stats: {
 totalUniversities: universities.length,
 activeUniversities: universities.filter((u) => u.isActive).length,
 totalDepartments: universities.reduce(
 (acc, u) => acc + u._count.departments,
 0
 ),
 totalTeachers,
 totalStudents,
 totalSchedules,
 totalUsers: universities.reduce((acc, u) => acc + u._count.users, 0),
 },
 universities: universities.map((u) => ({
 ...u,
 planName: u.plan?.name ?? null,
 })),
 plans,
 };
 }

 if (action === "analytics") {
 // Day 43 — platform growth & revenue insights
 // Month buckets for "new users per month" — 12 bounded count() queries
 // instead of a take-limited findMany, which undercounts at scale.
 // Buckets split at Dhaka midnight (+06:00, no DST): the old local-clock
 // `new Date(y, m, 1)` bounds filed 00:00–06:00 Dhaka signups under the
 // previous month whenever the server ran UTC.
 const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
 const dhakaNow = new Date(Date.now() + DHAKA_OFFSET_MS);
 const baseYear = dhakaNow.getUTCFullYear();
 const baseMonth = dhakaNow.getUTCMonth();
 const dhakaMonthStart = (m0: number) => {
 const year = baseYear + Math.floor(m0 / 12);
 const month = ((m0 % 12) + 12) % 12;
 return {
 date: new Date(`${year}-${String(month + 1).padStart(2, "0")}-01T00:00:00+06:00`),
 year,
 month,
 };
 };
 const monthBuckets = Array.from({ length: 12 }, (_, i) => {
 const start = dhakaMonthStart(baseMonth - (11 - i));
 const end = dhakaMonthStart(baseMonth - (11 - i) + 1);
 return { start: start.date, end: end.date };
 });
 const [universities, plans, roleCounts, scheduleGroups, deptUniRows, userGrowthCounts] =
 await Promise.all([
 db.university.findMany({
 include: {
 plan: { select: { name: true, slug: true, priceMonthly: true, priceYearly: true } },
 _count: {
 select: {
 departments: true,
 users: { where: { isActive: true } },
 },
 },
 },
 orderBy: { createdAt: "asc" },
 }),
 db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
 db.user.groupBy({
 by: ["role"],
 _count: { role: true },
 where: { isActive: true },
 }),
 // schedules live on departments — map them to universities here via a
 // groupBy (the old full findMany loaded every schedule row and grew
 // linearly with platform size).
 db.schedule.groupBy({
 by: ["departmentId"],
 _count: { departmentId: true },
 }),
 db.department.findMany({ select: { id: true, universityId: true } }),
 Promise.all(
 monthBuckets.map((b) =>
 db.user.count({ where: { createdAt: { gte: b.start, lt: b.end } } })
 )
 ),
 ]);

 const uniByDept = new Map(
 deptUniRows.map((d) => [d.id, d.universityId])
 );
 const schedulesByUni = new Map<string, number>();
 let totalSchedules = 0;
 for (const g of scheduleGroups) {
 totalSchedules += g._count.departmentId;
 const uid = uniByDept.get(g.departmentId);
 if (uid) {
 schedulesByUni.set(
 uid,
 (schedulesByUni.get(uid) ?? 0) + g._count.departmentId
 );
 }
 }

 // Growth: universities joined per month (last 8 months) — Dhaka months,
 // matching the signup buckets above.
 const months: { label: string; value: number }[] = [];
 for (let i = 7; i >= 0; i--) {
 const d = dhakaMonthStart(baseMonth - i);
 const label = d.date.toLocaleDateString("en-US", {
 month: "short",
 timeZone: "Asia/Dhaka",
 });
 const count = universities.filter((u) => {
 // Shift createdAt into the Dhaka calendar, then compare UTC fields.
 const c = new Date(new Date(u.createdAt).getTime() + DHAKA_OFFSET_MS);
 return c.getUTCFullYear() === d.year && c.getUTCMonth() === d.month;
 }).length;
 months.push({ label, value: count });
 }

 // User growth per month — new signups in each calendar month (last 12)
 const userMonths: { label: string; value: number }[] = monthBuckets.map(
 (b, i) => ({
 label: b.start.toLocaleDateString("en-US", {
 month: "short",
 timeZone: "Asia/Dhaka",
 }),
 value: userGrowthCounts[i],
 })
 );

 // Plan distribution + MRR
 const planDist = plans.map((p) => ({
 label: p.name,
 value: universities.filter((u) => u.planId === p.id).length,
 }));
 const unassignedCount = universities.filter((u) => !u.planId).length;
 if (unassignedCount > 0) planDist.push({ label: "No plan", value: unassignedCount });

 const activeUnis = universities.filter((u) => u.isActive);
 // Money aggregates drift into float dust (e.g. 3 × 19.99 → 59.97000…);
 // round MRR/ARR to 2dp so the dashboard shows clean currency values.
 const mrr =
 Math.round(
 activeUnis.reduce((acc, u) => acc + (u.plan?.priceMonthly ?? 0), 0) * 100
 ) / 100;
 const arr = Math.round(mrr * 12 * 100) / 100;

 // Per-university usage
 const perUniversity = universities
 .map((u) => ({
 id: u.id,
 name: u.shortName || u.name,
 plan: u.plan?.name ?? "—",
 departments: u._count.departments,
 users: u._count.users,
 schedules: schedulesByUni.get(u.id) ?? 0,
 isActive: u.isActive,
 }))
 .sort((a, b) => b.users - a.users);

 const roles = roleCounts.map((r) => ({
 label: r.role.replace("_", " "),
 value: r._count.role,
 }));

 return {
 hasData: universities.length > 0,
 growthMonths: months,
 userGrowth: userMonths,
 planDistribution: planDist,
 mrr,
 arr,
 payingUniversities: activeUnis.filter((u) => (u.plan?.priceMonthly ?? 0) > 0).length,
 perUniversity,
 roles,
 totalSchedules,
 };
 }

 if (action === "university") {
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id is required");
 const university = await db.university.findUnique({
 where: { id },
 include: {
 plan: true,
 departments: {
 include: {
 _count: {
 select: {
 users: { where: { role: "teacher", isActive: true } },
 schedules: { where: { isActive: true } },
 },
 },
 },
 },
 users: {
 where: { role: "dept_admin" },
 select: {
 id: true,
 fullName: true,
 email: true,
 departmentId: true,
 isActive: true,
 },
 },
 },
 });
 if (!university) throw new ApiError(404, "University not found");
 return { university };
 }

 if (action === "users") {
 // Platform-wide user directory — the super admin's control panel for
 // every account on the platform. Filters are optional; q is matched
 // inside the Prisma WHERE so counts reflect matching rows. Results are
 // paginated (?page=, 1-based; default page size 100, max 500) — the
 // old silent take-500 cap hid rows past the ceiling with no signal.
 const role = searchParams.get("role");
 const universityId = searchParams.get("universityId");
 const active = searchParams.get("active");
 const q = (searchParams.get("q") ?? "").trim();
 const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
 const pageSize = Math.min(
 500,
 Math.max(1, Math.floor(Number(searchParams.get("pageSize")) || 100))
 );

 const where: Record<string, unknown> = {};
 if (role && ["super_admin", "dept_admin", "teacher", "student"].includes(role)) {
 where.role = role;
 }
 if (universityId) where.universityId = universityId;
 // C3: active=true → only active, false → only inactive, absent/all → everyone.
 if (active === "true") where.isActive = true;
 if (active === "false") where.isActive = false;
 if (q) {
 where.OR = [
 { fullName: { contains: q } },
 { email: { contains: q } },
 { rollNumber: { contains: q } },
 { studentIdNumber: { contains: q } },
 ];
 }

 const [users, total] = await Promise.all([
 db.user.findMany({
 where,
 select: {
 id: true,
 fullName: true,
 email: true,
 role: true,
 isActive: true,
 studentIdNumber: true,
 rollNumber: true,
 semester: true,
 designation: true,
 createdAt: true,
 university: { select: { id: true, name: true, shortName: true, slug: true } },
 department: { select: { id: true, name: true, shortName: true } },
 },
 orderBy: { createdAt: "desc" },
 skip: (page - 1) * pageSize,
 take: pageSize,
 }),
 // Real total (not users.length) — the client paginates against it.
 db.user.count({ where }),
 ]);

 return { users, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
 }

 if (action === "system") {
 // Platform health — one count per model. Bounded, indexed counts only.
 const [
 universities, departments, users, teachers, students,
 schedules, notices, assignments, results, attendance,
 attendanceSessions, notifications, scheduleChanges,
 ] = await Promise.all([
 db.university.count(),
 db.department.count(),
 db.user.count(),
 db.user.count({ where: { role: "teacher", isActive: true } }),
 db.user.count({ where: { role: "student", isActive: true } }),
 db.schedule.count({ where: { isActive: true } }),
 db.notice.count(),
 db.assignment.count(),
 db.result.count(),
 db.attendance.count(),
 db.attendanceSession.count(),
 db.notification.count(),
 db.scheduleChange.count(),
 ]);
 return {
 counts: {
 universities, departments, users, teachers, students,
 schedules, notices, assignments, results, attendance,
 attendanceSessions, notifications, scheduleChanges,
 },
 retention: {
 attendanceSessionDays: 30,
 notificationsReadDays: 14,
 notificationsUnreadDays: 90,
 scheduleChangeDays: 180,
 autoNoticeDays: 60,
 expiredNoticeDays: 30,
 calendarDays: 180,
 },
 };
 }

 if (action === "sessions") {
 // Active QR attendance windows, platform-wide — the super admin's
 // kill-switch for a rogue/forgotten window (the teacher UI cannot
 // close another teacher's session).
 const now = new Date();
 const [active, closedToday] = await Promise.all([
 db.attendanceSession.findMany({
 where: { closed: false, expiresAt: { gt: now } },
 select: {
 id: true,
 date: true,
 durationSec: true,
 startsAt: true,
 expiresAt: true,
 presentCount: true,
 geoRadiusM: true,
 schedule: {
 select: {
 courseCode: true,
 courseName: true,
 semester: true,
 department: { select: { name: true, shortName: true, university: { select: { shortName: true, name: true } } } },
 },
 },
 teacher: { select: { fullName: true } },
 },
 orderBy: { startsAt: "desc" },
 take: 100,
 }),
 db.attendanceSession.findMany({
 where: { closed: true, expiresAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
 select: {
 id: true,
 date: true,
 closed: true,
 presentCount: true,
 expiresAt: true,
 schedule: { select: { courseCode: true, department: { select: { shortName: true } } } },
 },
 orderBy: { expiresAt: "desc" },
 take: 50,
 }),
 ]);
 return { active, closedToday };
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 if (action === "universities") {
 const {
 name,
 slug,
 shortName,
 address,
 contactEmail,
 contactPhone,
 websiteURL,
 aboutText,
 planId,
 } = body as Record<string, string>;
 if (!name || !slug) {
 throw new ApiError(400, "University name and slug are required");
 }
 // Hard caps: short fields 200, long free-text fields 2000.
 const cleanName = cleanStr(name, 200);
 const cleanShort = shortName ? cleanStr(shortName, 200) : null;
 const cleanAddress = address ? cleanStr(address, 2000) : null;
 const cleanEmail = contactEmail ? cleanStr(contactEmail, 200) : null;
 const cleanPhone = contactPhone ? cleanStr(contactPhone, 200) : null;
 const cleanWebsite = websiteURL ? cleanStr(websiteURL, 2000) : null;
 const cleanAbout = aboutText ? cleanStr(aboutText, 2000) : null;
 const cleanSlug = slug
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/-{2,}/g, "-")
 .replace(/^-+|-+$/g, "")
 .slice(0, 100);
 if (!cleanSlug || cleanSlug === "-") {
 throw new ApiError(400, "Slug must contain letters or numbers");
 }
 // Same format rules as the manage route — a typo'd email/URL used to
 // land in the DB and render straight onto the public portal page.
 const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 if (cleanEmail && !EMAIL_RE.test(cleanEmail)) {
 throw new ApiError(400, "Contact email is not a valid email address");
 }
 if (cleanWebsite && !/^https?:\/\/.+/i.test(cleanWebsite)) {
 throw new ApiError(400, "Website URL must start with http:// or https://");
 }
 const existing = await db.university.findUnique({
 where: { slug: cleanSlug },
 });
 if (existing) throw new ApiError(409, "Slug already in use");
 // planId must reference a real plan — an invalid one used to surface
 // as an opaque Prisma FK 500.
 if (planId) {
 const plan = await db.plan.findUnique({ where: { id: planId }, select: { id: true } });
 if (!plan) throw new ApiError(400, "Selected plan does not exist");
 }

 // University + its default SiteSettings row are born together — one
 // transaction so a half-created tenant (no settings) can never exist.
 // P2002 on the slug (concurrent create) → friendly 409.
 const { university } = await db
 .$transaction(async (tx) => {
 const university = await tx.university.create({
 data: {
 name: cleanName,
 slug: cleanSlug,
 shortName: cleanShort,
 address: cleanAddress,
 contactEmail: cleanEmail,
 contactPhone: cleanPhone,
 websiteURL: cleanWebsite,
 aboutText: cleanAbout,
 planId: planId || null,
 },
 });
 await tx.siteSettings.create({
 data: { universityId: university.id, siteName: cleanName },
 });
 return { university };
 })
 .catch((err) => {
 if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
 throw new ApiError(409, "Slug already in use");
 }
 throw err;
 });

 return { university };
 }

 if (action === "users") {
 // Provision a Department Head or Teacher account inside a department
 const { name, email, password, departmentId, role } =
 body as Record<string, string>;
 const cleanName = typeof name === "string" ? name.trim() : "";
 const cleanEmail = typeof email === "string" ? email.trim() : "";
 if (!cleanName || !cleanEmail || !password || !departmentId) {
 throw new ApiError(400, "name, email, password and departmentId are required");
 }
 if (role !== "dept_admin" && role !== "teacher") {
 throw new ApiError(400, "role must be dept_admin or teacher");
 }
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
 throw new ApiError(400, "Please provide a valid email address");
 }
 validatePassword(password);

 const department = await db.department.findUnique({
 where: { id: departmentId },
 });
 if (!department) throw new ApiError(404, "Department not found");

 // Per-university email uniqueness (User.@@unique([universityId, email]))
 const existing = await db.user.findFirst({
 where: { universityId: department.universityId, email: cleanEmail },
 });
 if (existing) {
 throw new ApiError(
 409,
 "A user with this email already exists in this university"
 );
 }

 const hashed = await hashPassword(password);
 const user = await db.user.create({
 data: {
 universityId: department.universityId,
 departmentId: department.id,
 role, // "dept_admin" | "teacher"
 fullName: cleanName,
 email: cleanEmail,
 password: hashed,
 isActive: true,
 },
 });
 const { password: _pw, ...safeUser } = user;
 return { user: safeUser };
 }

 if (action === "system-cleanup") {
 // Run the retention sweep NOW from the System Control tab.
 // Same idempotent sweep the daily cron uses — safe to repeat.
 const result = await runCleanup();
 return { cleanup: result };
 }

 if (action === "plans") {
 // Create a plan — previously edit-only, so super admins could never
 // add pricing tiers without a DB console.
 const { name, tagline, priceMonthly, priceYearly, maxDepartments, maxStudents, maxTeachers, features, isActive, sortOrder } =
 body as Record<string, unknown>;
 const cleanName = typeof name === "string" ? name.trim() : "";
 if (!cleanName) throw new ApiError(400, "Plan name is required");
 const slug = cleanName
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/-{2,}/g, "-")
 .replace(/^-+|-+$/g, "");
 if (!slug) throw new ApiError(400, "Plan name must contain letters or numbers");
 const existing = await db.plan.findUnique({ where: { slug } });
 if (existing) throw new ApiError(409, "A plan with this name already exists");
 const intLimit = (v: unknown, label: string, fallback: number): number => {
 if (v === undefined || v === null || v === "") return fallback;
 const n = Math.round(Number(v));
 if (!Number.isInteger(n) || n < -1 || n > 2147483647) {
 throw new ApiError(400, `${label} must be an integer (-1 = unlimited)`);
 }
 return n;
 };
 const featureList = Array.isArray(features)
 ? features.filter((f): f is string => typeof f === "string").slice(0, 20).map((f) => f.slice(0, 100))
 : [];
 const plan = await db.plan.create({
 data: {
 name: cleanStr(cleanName, 60),
 slug,
 tagline: typeof tagline === "string" ? cleanStr(tagline, 200) : null,
 priceMonthly: Math.max(0, Math.round(Number(priceMonthly ?? 0) * 100) / 100),
 priceYearly: Math.max(0, Math.round(Number(priceYearly ?? 0) * 100) / 100),
 maxDepartments: intLimit(maxDepartments, "Max departments", 1),
 maxStudents: intLimit(maxStudents, "Max students", 100),
 maxTeachers: intLimit(maxTeachers, "Max teachers", 5),
 features: JSON.stringify(featureList),
 isActive: isActive === undefined ? true : Boolean(isActive),
 sortOrder: Math.max(0, Math.round(Number(sortOrder ?? 0))),
 },
 });
 return { plan };
 }

 if (action === "broadcast") {
 // Platform-wide announcement — fans out Notification rows to every
 // active user (optionally scoped to one university / role). Department
 // notices cannot reach across tenants; this is the super admin's only
 // way to talk to the whole platform (downtimes, policy updates).
 const { title, message, link, universityId, audience } = body as Record<string, unknown>;
 const cleanTitle = typeof title === "string" ? title.trim() : "";
 const cleanMessage = typeof message === "string" ? message.trim() : "";
 if (!cleanTitle || !cleanMessage) {
 throw new ApiError(400, "Title and message are required");
 }
 const roles =
 audience === "students"
 ? ["student" as const]
 : audience === "teachers"
 ? ["teacher" as const]
 : audience === "admins"
 ? ["dept_admin" as const]
 : ["student", "teacher", "dept_admin"] as const;
 const recipients = await db.user.findMany({
 where: {
 isActive: true,
 role: { in: [...roles] },
 ...(typeof universityId === "string" && universityId ? { universityId } : {}),
 },
 select: { id: true },
 take: 2000,
 orderBy: { createdAt: "asc" },
 });
 if (recipients.length === 0) {
 throw new ApiError(400, "No active users match this broadcast scope");
 }
 await db.notification.createMany({
 data: recipients.map((r) => ({
 userId: r.id,
 type: "general",
 title: cleanStr(cleanTitle, 150),
 body: cleanStr(cleanMessage, 500),
 link: typeof link === "string" && link.startsWith("/") ? link.slice(0, 200) : "/?view=dashboard",
 })),
 });
 return { sent: recipients.length };
 }


 throw new ApiError(404, "Unknown action");
 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 if (action === "universities") {
 if (!id) throw new ApiError(400, "id is required");
 const data: Record<string, unknown> = {};
 // Hard caps per field — short fields 200, long free-text 2000.
 const STRING_CAPS: Record<string, number> = {
 name: 200,
 shortName: 200,
 address: 2000,
 contactEmail: 200,
 contactPhone: 200,
 websiteURL: 2000,
 aboutText: 2000,
 };
 for (const f of Object.keys(STRING_CAPS)) {
 if (body[f] !== undefined)
 data[f] = body[f] ? cleanStr(body[f], STRING_CAPS[f]) : null;
 }
 if (body.planId !== undefined) {
 if (body.planId) {
 const plan = await db.plan.findUnique({
 where: { id: String(body.planId) },
 select: { id: true },
 });
 if (!plan) throw new ApiError(400, "Selected plan does not exist");
 }
 data.planId = body.planId || null;
 }
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 if (body.slug !== undefined) {
 const cleanSlug = String(body.slug)
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9-]/g, "-")
 .slice(0, 100);
 const existing = await db.university.findFirst({
 where: { slug: cleanSlug, id: { not: id } },
 });
 if (existing) throw new ApiError(409, "Slug already in use");
 data.slug = cleanSlug;
 }
 return db.university.update({ where: { id }, data });
 }

 if (action === "users") {
 // Platform user control: activate/deactivate · change role · reset password.
 // GUARDS: super_admin accounts are untouchable; you cannot lock
 // yourself out; passwords must be hashed.
 if (!id) throw new ApiError(400, "id is required");
 const target = await db.user.findUnique({ where: { id } });
 if (!target) throw new ApiError(404, "User not found");
 if (target.role === "super_admin") {
 throw new ApiError(400, "Super admin accounts cannot be modified here");
 }
 if (target.id === session.userId) {
 throw new ApiError(400, "You cannot modify your own account from here");
 }

 const data: Record<string, unknown> = {};
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 // Optional student identity fields (trimmed, length-capped like the
 // manage route). Needed when converting a staff account to a student —
 // the student login is ID + Roll, not email + password.
 const sidInput = typeof body.studentIdNumber === "string" ? body.studentIdNumber.trim() : "";
 const rollInput = typeof body.rollNumber === "string" ? body.rollNumber.trim() : "";
 if (sidInput) data.studentIdNumber = sidInput.slice(0, 30);
 if (rollInput) data.rollNumber = rollInput.slice(0, 30);
 if (body.role !== undefined) {
 const role = String(body.role);
 if (!["dept_admin", "teacher", "student"].includes(role)) {
 throw new ApiError(400, "role must be dept_admin, teacher or student");
 }
 if (role !== target.role && target.role === "student" && role !== "student") {
 // Students log in with ID+Roll, not email/password — promoting one
 // to staff without BOTH an email and a password would lock them out
 // of the staff login entirely.
 if (!target.email || !target.password) {
 throw new ApiError(
 400,
 "This student has no staff email/password — provision a staff account instead"
 );
 }
 }
 if (role !== target.role && target.role !== "student" && role === "student") {
 // Demoting staff to student: the student login needs ID+Roll.
 // Accept them from the request body; fall back to stored values.
 const effSid = sidInput || target.studentIdNumber || "";
 const effRoll = rollInput || target.rollNumber || "";
 if (!effSid || !effRoll) {
 throw new ApiError(
 400,
 "Set a student ID number and roll number before converting this account to a student"
 );
 }
 }
 data.role = role;
 }
 if (body.password !== undefined) {
 const pw = String(body.password);
 validatePassword(pw);
 data.password = await hashPassword(pw);
 }
 if (Object.keys(data).length === 0) {
 throw new ApiError(400, "Nothing to update");
 }
 let updated;
 try {
 updated = await db.user.update({ where: { id }, data });
 } catch (err) {
 // The new per-university unique constraints (ID number / roll number /
 // email) are the source of truth for duplicates — map the Prisma
 // violation to a friendly 409 instead of an opaque 500.
 if ((err as { code?: string })?.code === "P2002") {
 throw new ApiError(
 409,
 "Another user in this university already has that email, student ID number or roll number"
 );
 }
 throw err;
 }
 const { password: _pw, ...safeUser } = updated;
 return { user: safeUser };
 }

 if (action === "plans") {
 if (!id) throw new ApiError(400, "id is required");
 const num = (
 v: unknown,
 label: string,
 opts: { min?: number; max?: number; int?: boolean } = {}
 ): number => {
 const n = Number(v);
 if (!Number.isFinite(n)) throw new ApiError(400, `${label} must be a number`);
 if (opts.min !== undefined && n < opts.min)
 throw new ApiError(400, `${label} must be at least ${opts.min}`);
 if (opts.max !== undefined && n > opts.max)
 throw new ApiError(400, `${label} must be at most ${opts.max}`);
 const rounded = Math.round(n * 100) / 100;
 // Plan limits are Int columns — a fractional or > int32 value used to
 // surface as an opaque Prisma 500; reject with a friendly 400 instead.
 if (opts.int) {
 if (!Number.isInteger(rounded))
 throw new ApiError(400, `${label} must be a whole number`);
 if (rounded > 2147483647)
 throw new ApiError(400, `${label} is too large`);
 }
 return rounded;
 };
 const data: Record<string, unknown> = {};
 if (body.name !== undefined) data.name = String(body.name);
 if (body.tagline !== undefined)
 data.tagline = body.tagline == null ? null : String(body.tagline);
 if (body.priceMonthly !== undefined)
 data.priceMonthly = num(body.priceMonthly, "Monthly price", { min: 0 });
 if (body.priceYearly !== undefined)
 data.priceYearly = num(body.priceYearly, "Yearly price", { min: 0 });
 if (body.maxDepartments !== undefined)
 data.maxDepartments = num(body.maxDepartments, "Max departments", { min: -1, int: true });
 if (body.maxStudents !== undefined)
 data.maxStudents = num(body.maxStudents, "Max students", { min: -1, int: true });
 if (body.maxTeachers !== undefined)
 data.maxTeachers = num(body.maxTeachers, "Max teachers", { min: -1, int: true });
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 if (body.features !== undefined) {
 // Contract C5: features arrive as an array of strings OR as a JSON
 // string of one — normalize here so the column is stringify-once.
 let features: unknown = body.features;
 if (typeof features === "string") {
 try {
 features = JSON.parse(features);
 } catch {
 throw new ApiError(
 400,
 "features must be an array of strings (or a JSON array string)"
 );
 }
 }
 if (
 !Array.isArray(features) ||
 features.some((f) => typeof f !== "string")
 ) {
 throw new ApiError(
 400,
 "features must be an array of strings (or a JSON array string)"
 );
 }
 data.features = JSON.stringify(features);
 }
 return db.plan.update({ where: { id }, data });
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id is required");

 if (action === "universities") {
 // Soft delete: deactivate (keeps data for audit)
 const university = await db.university.update({
 where: { id },
 data: { isActive: false },
 });
 return { university };
 }

 if (action === "sessions") {
 // Force-close a live QR window platform-wide. The teacher's own
 // finalize still computes absentees; closing here only stops NEW
 // check-ins (same flag the natural expiry sets).
 const session = await db.attendanceSession.findUnique({
 where: { id },
 select: { closed: true },
 });
 if (!session) throw new ApiError(404, "Attendance session not found");
 if (session.closed) return { closed: true, already: true };
 const updated = await db.attendanceSession.update({
 where: { id },
 data: { closed: true },
 select: { id: true, closed: true },
 });
 return { closed: true, session: updated };
 }

 if (action === "plans") {
 // Hard delete a plan — refused while universities are subscribed so
 // pricing history never silently vanishes; reassign them first.
 const inUse = await db.university.count({ where: { planId: id } });
 if (inUse > 0) {
 throw new ApiError(
 409,
 `${inUse} universit${inUse === 1 ? "y is" : "ies are"} still on this plan — move them to another plan first`
 );
 }
 await db.plan.delete({ where: { id } });
 return { deleted: true };
 }

 throw new ApiError(404, "Unknown action");
 });
}
