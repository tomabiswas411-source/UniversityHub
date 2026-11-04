import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { runCleanup } from "@/lib/cleanup";

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
 const now = new Date();
 const monthBuckets = Array.from({ length: 12 }, (_, i) => ({
 start: new Date(now.getFullYear(), now.getMonth() - (11 - i), 1),
 end: new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 1),
 }));
 const [universities, plans, roleCounts, scheduleRows, userGrowthCounts] =
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
 // schedules live on departments — map them to universities here
 db.schedule.findMany({
 select: { department: { select: { universityId: true } } },
 }),
 Promise.all(
 monthBuckets.map((b) =>
 db.user.count({ where: { createdAt: { gte: b.start, lt: b.end } } })
 )
 ),
 ]);

 const schedulesByUni = new Map<string, number>();
 for (const s of scheduleRows) {
 const uid = s.department?.universityId;
 if (uid) schedulesByUni.set(uid, (schedulesByUni.get(uid) ?? 0) + 1);
 }

 // Growth: universities joined per month (last 8 months)
 const months: { label: string; value: number }[] = [];
 for (let i = 7; i >= 0; i--) {
 const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
 const label = d.toLocaleDateString("en-US", { month: "short" });
 const count = universities.filter((u) => {
 const c = new Date(u.createdAt);
 return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
 }).length;
 months.push({ label, value: count });
 }

 // User growth per month — new signups in each calendar month (last 12)
 const userMonths: { label: string; value: number }[] = monthBuckets.map(
 (b, i) => ({
 label: b.start.toLocaleDateString("en-US", { month: "short" }),
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
 const mrr = activeUnis.reduce((acc, u) => acc + (u.plan?.priceMonthly ?? 0), 0);
 const arr = mrr * 12;

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
 totalSchedules: scheduleRows.length,
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
 // in JS (SQLite contains is case-sensitive — 500-row cap keeps it safe).
 const role = searchParams.get("role");
 const universityId = searchParams.get("universityId");
 const active = searchParams.get("active");
 const q = (searchParams.get("q") ?? "").trim().toLowerCase();

 const where: Record<string, unknown> = {};
 if (role && ["super_admin", "dept_admin", "teacher", "student"].includes(role)) {
 where.role = role;
 }
 if (universityId) where.universityId = universityId;
 if (active === "true") where.isActive = true;
 if (active === "false") where.isActive = false;

 const users = await db.user.findMany({
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
 take: 500,
 });

 const filtered = q
 ? users.filter((u) =>
 [u.fullName, u.email, u.rollNumber, u.studentIdNumber]
 .some((v) => (v ?? "").toLowerCase().includes(q))
 )
 : users;

 return { users: filtered, total: filtered.length };
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
 const cleanSlug = slug
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9-]/g, "-");
 const existing = await db.university.findUnique({
 where: { slug: cleanSlug },
 });
 if (existing) throw new ApiError(409, "Slug already in use");

 const university = await db.university.create({
 data: {
 name,
 slug: cleanSlug,
 shortName: shortName || null,
 address: address || null,
 contactEmail: contactEmail || null,
 contactPhone: contactPhone || null,
 websiteURL: websiteURL || null,
 aboutText: aboutText || null,
 planId: planId || null,
 },
 });

 // default site settings
 await db.siteSettings.create({
 data: { universityId: university.id, siteName: name },
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
 if (password.length < 4) {
 throw new ApiError(400, "Password must be at least 4 characters");
 }

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
 for (const f of [
 "name",
 "shortName",
 "address",
 "contactEmail",
 "contactPhone",
 "websiteURL",
 "aboutText",
 ]) {
 if (body[f] !== undefined) data[f] = body[f] ? String(body[f]) : null;
 }
 if (body.planId !== undefined) data.planId = body.planId || null;
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 if (body.slug !== undefined) {
 const cleanSlug = String(body.slug)
 .toLowerCase()
 .trim()
 .replace(/[^a-z0-9-]/g, "-");
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
 if (body.role !== undefined) {
 const role = String(body.role);
 if (!["dept_admin", "teacher", "student"].includes(role)) {
 throw new ApiError(400, "role must be dept_admin, teacher or student");
 }
 if (role !== target.role && target.role === "student" && role !== "student") {
 // Students log in with ID+Roll, not email/password — promoting one
 // to staff without an email+password would lock them out.
 if (!target.email) {
 throw new ApiError(
 400,
 "This student has no staff email — provision a staff account instead"
 );
 }
 }
 data.role = role;
 }
 if (body.password !== undefined) {
 const pw = String(body.password);
 if (pw.length < 4) {
 throw new ApiError(400, "Password must be at least 4 characters");
 }
 data.password = await hashPassword(pw);
 }
 if (Object.keys(data).length === 0) {
 throw new ApiError(400, "Nothing to update");
 }
 const updated = await db.user.update({ where: { id }, data });
 const { password: _pw, ...safeUser } = updated;
 return { user: safeUser };
 }

 if (action === "plans") {
 if (!id) throw new ApiError(400, "id is required");
 const data: Record<string, unknown> = {};
 if (body.name !== undefined) data.name = String(body.name);
 if (body.tagline !== undefined)
 data.tagline = body.tagline == null ? null : String(body.tagline);
 if (body.priceMonthly !== undefined)
 data.priceMonthly = Number(body.priceMonthly);
 if (body.priceYearly !== undefined)
 data.priceYearly = Number(body.priceYearly);
 if (body.maxDepartments !== undefined)
 data.maxDepartments = Number(body.maxDepartments);
 if (body.maxStudents !== undefined)
 data.maxStudents = Number(body.maxStudents);
 if (body.maxTeachers !== undefined)
 data.maxTeachers = Number(body.maxTeachers);
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
 if (body.features !== undefined)
 data.features = JSON.stringify(body.features);
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

 throw new ApiError(404, "Unknown action");
 });
}
