import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, requireRole, ApiError, type SessionPayload } from "@/lib/session";
import { logAdminAction, auditActor } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { gradeDistribution, passRate, resultPct } from "@/lib/grades";
import { bdWeekday, bdEndOfDayUTC } from "@/lib/date-bd";
import { computeCoursePerformance, computeGPA, percentToGrade } from "@/lib/grades";
import { windowsOverlap } from "@/lib/time-utils";

/**
 * Department-scoped management API for dept_admin & super_admin.
 * GET /api/manage/:entity?departmentId=...
 * POST /api/manage/:entity { departmentId, ...payload }
 * PUT /api/manage/:entity?id=...
 * DELETE /api/manage/:entity?id=...
 */

type Ctx = { params: Promise<{ entity: string }> };

async function assertDeptAccess(session: SessionPayload, departmentId: string) {
 if (session.role === "super_admin") return;
 if (session.role === "dept_admin" && session.departmentId === departmentId)
 return;
 throw new ApiError(403, "You can only manage your own department");
}

async function getDeptId(
 session: SessionPayload,
 req: NextRequest,
 body?: Record<string, unknown>
): Promise<string> {
 const url = new URL(req.url);
 const q = url.searchParams.get("departmentId");
 const b = (body?.departmentId as string) ?? undefined;
 const departmentId = q ?? b ?? session.departmentId;
 if (!departmentId) throw new ApiError(400, "departmentId is required");
 await assertDeptAccess(session, departmentId);
 return departmentId;
}

/** Today in Asia/Dhaka as "YYYY-MM-DD" minus N days — for the string-date
 attendance trend window (the attendance date column is "YYYY-MM-DD"). */
function bdDateOnlyMinusDays(days: number): string {
 const shifted = new Date(Date.now() + (6 - days * 24) * 60 * 60 * 1000);
 return shifted.toISOString().slice(0, 10);
}

/**
 * Resolve the university a department belongs to. User rows are keyed by
 * universityId — deriving it from the department (instead of trusting
 * session.universityId) is what lets a super_admin create staff in any
 * department without producing orphaned users.
 */
async function resolveUniversityId(departmentId: string): Promise<string> {
 const dept = await db.department.findUnique({
 where: { id: departmentId },
 select: { universityId: true },
 });
 if (!dept) throw new ApiError(404, "Department not found");
 return dept.universityId;
}

/** Strip the password hash from any User-shaped row (incl. `include`s). */
function stripPassword<T extends { password?: string | null }>(
 row: T
): Omit<T, "password"> {
 const { password: _password, ...safe } = row;
 return safe;
}

const VALID_DAYS = new Set([
 "saturday",
 "sunday",
 "monday",
 "tuesday",
 "wednesday",
 "thursday",
]);

const VALID_CATEGORIES = new Set([
 "academic", "exam", "event", "general", "schedule_change", "assignment",
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimal CSV parser — quoted fields with "" escapes; CRLF-safe. */
function parseCsv(text: string): string[][] {
 const rows: string[][] = [];
 let row: string[] = [];
 let cell = "";
 let inQuotes = false;
 for (let i = 0; i < text.length; i++) {
 const ch = text[i];
 if (inQuotes) {
 if (ch === '"') {
 if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
 } else cell += ch;
 } else if (ch === '"') inQuotes = true;
 else if (ch === ",") { row.push(cell); cell = ""; }
 else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
 else if (ch === "\r") { /* CR inside line — ignore */ }
 else cell += ch;
 }
 if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
 return rows;
}

/** Trim + hard length cap — keeps free-text abuse from bloating rows. */
function cleanStr(v: unknown, max: number): string {
 return String(v).trim().slice(0, max);
}

/** Number coercion with a friendly 400 instead of an opaque Prisma 500. */
function cleanNum(v: unknown): number {
 const n = Number(v);
 if (!Number.isFinite(n)) throw new ApiError(400, "Invalid number value");
 return n;
}

function validateSemester(v: unknown, label = "Semester"): number {
 const n = Number(v);
 if (!Number.isInteger(n) || n < 1 || n > 12)
 throw new ApiError(400, `${label} must be a whole number between 1 and 12`);
 return n;
}

/** "08:00"-style 24h clock — the timetable and overlap math rely on it. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateTimeRange(startTime: unknown, endTime: unknown): void {
 for (const [label, v] of [
 ["Start time", startTime],
 ["End time", endTime],
 ] as const) {
 if (v !== undefined && v !== null && !TIME_RE.test(String(v)))
 throw new ApiError(400, `${label} must be a 24-hour HH:MM time (e.g. 08:00)`);
 }
}

/**
 * Plan-cap guard (fix 8e): counts ACTIVE rows with the same isActive
 * semantics as the rows about to be created; -1 = unlimited.
 */
async function assertPlanLimit(
 client: Prisma.TransactionClient,
 universityId: string,
 cap: "maxDepartments" | "maxTeachers" | "maxStudents",
 thing: string
): Promise<void> {
 const uni = await client.university.findUnique({
 where: { id: universityId },
 select: {
 plan: { select: { maxDepartments: true, maxTeachers: true, maxStudents: true } },
 },
 });
 const limit = uni?.plan?.[cap] ?? -1;
 if (limit < 0) return; // -1 = unlimited
 const activeCount =
 cap === "maxDepartments"
 ? await client.department.count({ where: { universityId, isActive: true } })
 : await client.user.count({
 where: {
 universityId,
 role: cap === "maxTeachers" ? "teacher" : "student",
 isActive: true,
 },
 });
 if (activeCount >= limit) {
 throw new ApiError(
 403,
 `Your plan limit for ${thing} is reached (limit ${limit}). Upgrade the plan to add more.`
 );
 }
}

/**
 * programId must reference a program of THIS department — a mismatched
 * or foreign programId previously produced confusing cross-dept data.
 * Returns the program so callers can apply its semesterCount bound.
 */
async function assertProgramInDepartment(
 programId: string,
 departmentId: string
) {
 const program = await db.program.findUnique({ where: { id: programId } });
 if (!program) throw new ApiError(404, "Program not found");
 if (program.departmentId !== departmentId)
 throw new ApiError(403, "Program belongs to another department");
 return program;
}

/** 409 with a friendly "in use" message when reference rows exist. */
async function assertNotReferenced(
 refs: { label: string; count: number }[]
): Promise<void> {
 const inUse = refs.filter((r) => r.count > 0);
 if (inUse.length > 0) {
 const detail = inUse.map((r) => `${r.count} ${r.label}`).join(", ");
 throw new ApiError(409, `Cannot delete: in use by ${detail}. Deactivate it instead.`);
 }
}

const ENTITIES = [
 "teachers",
 "students",
 "courses",
 "rooms",
 "timeslots",
 "programs",
 "notices",
 "schedules",
 "stats",
 "overview",
 "analytics",
 "changes",
 "attendance-report",
 "report-data",
 "notification-stats",
 "sessions",
 "activity",
 "import",
 "assignments",
 "results",
] as const;
type Entity = (typeof ENTITIES)[number];

/** Valid ScheduleChange types — mirrors the teacher class-change writer. */
const CHANGE_TYPE_SET = new Set([
 "cancelled",
 "rescheduled",
 "room_changed",
 "time_changed",
 "extra_class",
]);

export async function GET(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;

 return handle(async () => {
 // Phase 3 D40-41: auth FIRST — entity-name validation moved inside the
 // handler so unauthenticated callers cannot probe which entity slugs
 // exist (also aligns GET with PUT/DELETE, which validate post-auth).
 const session = await requireSession();
 if (!["super_admin", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Management access required");
 }
 const entity = raw as Entity;
 if (!ENTITIES.includes(entity)) throw new ApiError(400, "Unknown entity");

 const departmentId = await getDeptId(session, req);

 switch (entity) {
 case "overview": {
 const [
 teachers,
 students,
 courses,
 rooms,
 timeSlots,
 programs,
 notices,
 schedules,
 ] = await Promise.all([
 db.user.findMany({
 where: { departmentId, role: "teacher" },
 orderBy: { fullName: "asc" },
 take: 500,
 }),
 db.user.findMany({
 where: { departmentId, role: "student" },
 include: { program: { select: { shortName: true } } },
 orderBy: { rollNumber: "asc" },
 take: 500,
 }),
 db.course.findMany({
 where: { departmentId },
 include: { program: { select: { shortName: true } } },
 orderBy: { code: "asc" },
 take: 1000, // Phase 3 D40-41: hard cap (dept-scoped, never near it)
 }),
 db.room.findMany({ where: { departmentId }, orderBy: { roomNumber: "asc" }, take: 1000 }),
 db.timeSlot.findMany({ where: { departmentId }, orderBy: { slotOrder: "asc" }, take: 1000 }),
 db.program.findMany({ where: { departmentId }, orderBy: { shortName: "asc" }, take: 500 }),
 db.notice.findMany({
 where: { departmentId },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 50,
 }),
 db.schedule.findMany({
 where: { departmentId, isActive: true },
 orderBy: { startTime: "asc" },
 take: 1000, // Phase 3 D40-41: hard cap
 }),
 ]);
 return {
 // Password hashes must never leave the server.
 teachers: teachers.map(stripPassword),
 students: students.map(stripPassword),
 courses,
 rooms,
 timeSlots,
 programs,
 notices,
 schedules,
 };
 }

 case "stats": {
 const [totalTeachers, totalStudents, totalCourses, totalRooms, schedules] =
 await Promise.all([
 db.user.count({ where: { departmentId, role: "teacher", isActive: true } }),
 db.user.count({ where: { departmentId, role: "student", isActive: true } }),
 db.course.count({ where: { departmentId, isActive: true } }),
 db.room.count({ where: { departmentId, isActive: true } }),
 db.schedule.findMany({
 where: { departmentId, isActive: true },
 select: { dayOfWeek: true },
 }),
 ]);
 // Weekday in Asia/Dhaka — the server clock may be UTC.
 const today = bdWeekday();
 const todayClasses = schedules.filter((s) => s.dayOfWeek === today).length;
 return {
 totalTeachers,
 totalStudents,
 totalCourses,
 totalRooms,
 totalSchedules: schedules.length,
 todayClasses,
 };
 }

 case "analytics": {
 // Aggregated department insights — Day 41 + attendance loop
 const [results, schedulesForLoad, studentsForDist, coursesInfo, recentChanges, noticesCount, attendanceGroups, attendanceTrendGroups] =
 await Promise.all([
 // Cap + comment: results feed per-row percentage math (marks/max
 // varies), which aggregates can't express exactly — 5000 rows is
 // far beyond any department's real volume.
 db.result.findMany({
 where: { departmentId },
 select: { marks: true, maxMarks: true, examType: true, createdAt: true },
 take: 5000,
 }),
 db.schedule.findMany({
 where: { departmentId, isActive: true },
 select: { teacherId: true, teacherName: true, dayOfWeek: true, programId: true, semester: true },
 }),
 db.user.findMany({
 where: { departmentId, role: "student", isActive: true },
 select: { programId: true, program: { select: { shortName: true } }, semester: true },
 }),
 db.course.findMany({
 where: { departmentId, isActive: true },
 select: { semester: true, program: { select: { shortName: true } } },
 }),
 db.scheduleChange.count({
 where: {
 departmentId,
 createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
 },
 }),
 db.notice.count({ where: { departmentId } }),
 // One grouped count instead of loading every attendance row.
 db.attendance.groupBy({
 by: ["courseId", "courseCode", "status"],
 where: { departmentId },
 _count: true,
 }),
 // D43: weekly attendance-trend source — grouped by day × course × status
 // over the last 6 weeks. date is a "YYYY-MM-DD" string column, so the
 // window is a lexicographic string compare (safe for ISO dates).
 db.attendance.groupBy({
 by: ["date", "courseCode", "status"],
 where: {
 departmentId,
 date: { gte: bdDateOnlyMinusDays(42) },
 },
 _count: true,
 }),
 ]);

 const distribution = gradeDistribution(results);

 // Average % per exam type
 const examTypes = ["ct1", "ct2", "midterm", "final", "assignment"];
 const examAverages = examTypes
 .map((t) => {
 const rs = results.filter((r) => r.examType === t);
 return {
 label: t === "ct1" ? "CT-1" : t === "ct2" ? "CT-2" : t.charAt(0).toUpperCase() + t.slice(1),
 value: rs.length
 ? Math.round((rs.reduce((a, r) => a + resultPct(r), 0) / rs.length) * 10) / 10
 : 0,
 count: rs.length,
 };
 })
 .filter((e) => e.count > 0);

 // Teacher workload (schedules per teacher)
 const loadMap = new Map<string, { name: string; count: number }>();
 for (const s of schedulesForLoad) {
 const cur = loadMap.get(s.teacherId) ?? { name: s.teacherName, count: 0 };
 cur.count += 1;
 loadMap.set(s.teacherId, cur);
 }
 const teacherLoad = [...loadMap.values()]
 .sort((a, b) => b.count - a.count)
 .slice(0, 8)
 .map((t) => ({ label: t.name.length > 18 ? t.name.slice(0, 17) + "…" : t.name, value: t.count }));

 // Weekly class density
 const days = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];
 const dayLabels: Record<string, string> = {
 saturday: "Sat", sunday: "Sun", monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
 };
 const weeklyDensity = days.map((d) => ({
 label: dayLabels[d],
 value: schedulesForLoad.filter((s) => s.dayOfWeek === d).length,
 }));

 // Students per program
 const programMap = new Map<string, number>();
 for (const s of studentsForDist) {
 const key = s.program?.shortName ?? "Unassigned";
 programMap.set(key, (programMap.get(key) ?? 0) + 1);
 }
 const studentsPerProgram = [...programMap.entries()].map(([label, value]) => ({ label, value }));

 // Students per semester
 const semesterMap = new Map<number, number>();
 for (const s of studentsForDist) {
 const key = s.semester ?? 0;
 semesterMap.set(key, (semesterMap.get(key) ?? 0) + 1);
 }
 const studentsPerSemester = [...semesterMap.entries()]
 .sort((a, b) => a[0] - b[0])
 .map(([sem, value]) => ({ label: sem === 0 ? "N/A" : `S${sem}`, value }));

 // Courses per semester
 const coursesPerSemesterMap = new Map<number, number>();
 for (const c of coursesInfo) {
 coursesPerSemesterMap.set(c.semester, (coursesPerSemesterMap.get(c.semester) ?? 0) + 1);
 }
 const coursesPerSemester = [...coursesPerSemesterMap.entries()]
 .sort((a, b) => a[0] - b[0])
 .map(([sem, value]) => ({ label: `S${sem}`, value }));

 const avgPct = results.length
 ? Math.round((results.reduce((a, r) => a + resultPct(r), 0) / results.length) * 10) / 10
 : 0;

 // ---------- Attendance analytics (from grouped counts) ----------
 const attCounts = { present: 0, absent: 0, late: 0, excused: 0 };
 const attByCourse = new Map<
 string,
 { courseCode: string; present: number; late: number; absent: number; excused: number }
 >();
 let totalMarked = 0;
 for (const g of attendanceGroups) {
 const n = g._count;
 totalMarked += n;
 if (g.status === "present") attCounts.present += n;
 else if (g.status === "absent") attCounts.absent += n;
 else if (g.status === "late") attCounts.late += n;
 else if (g.status === "excused") attCounts.excused += n;
 const cur =
 attByCourse.get(g.courseId) ??
 { courseCode: g.courseCode, present: 0, late: 0, absent: 0, excused: 0 };
 if (g.status === "present") cur.present += n;
 else if (g.status === "absent") cur.absent += n;
 else if (g.status === "late") cur.late += n;
 else if (g.status === "excused") cur.excused += n;
 attByCourse.set(g.courseId, cur);
 }
 // ---------- D43: attendance-trend lines per course ----------
 // Bucket daily rows into Saturday-start weeks (the BD academic week),
 // rate = (present + late) / counted — the same math as every other rate
 // on the platform. Top 5 courses by volume keep the chart readable.
 const TREND_WEEKS = 6;
 const TREND_MAX_SERIES = 5;
 const weekKey = (dateStr: string): string => {
 const d = new Date(`${dateStr}T00:00:00Z`);
 if (Number.isNaN(d.getTime())) return "?";
 const offsetToSaturday = (d.getUTCDay() + 1) % 7; // Sat→0, Sun→1 …
 d.setUTCDate(d.getUTCDate() - offsetToSaturday);
 return d.toISOString().slice(0, 10);
 };
 const weekLabel = (key: string): string => {
 const d = new Date(`${key}T00:00:00Z`);
 if (Number.isNaN(d.getTime())) return key;
 return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
 };
 const trendByWeekCourse = new Map<string, Map<string, { attended: number; counted: number }>>();
 const trendCourseTotals = new Map<string, number>();
 for (const g of attendanceTrendGroups) {
 const wk = weekKey(g.date);
 if (wk === "?") continue;
 const n = g._count;
 if (g.status === "excused") continue; // excluded everywhere else
 const courseBucket = trendByWeekCourse.get(wk) ?? new Map();
 const cur = courseBucket.get(g.courseCode) ?? { attended: 0, counted: 0 };
 cur.counted += n;
 if (g.status === "present" || g.status === "late") cur.attended += n;
 courseBucket.set(g.courseCode, cur);
 trendByWeekCourse.set(wk, courseBucket);
 trendCourseTotals.set(g.courseCode, (trendCourseTotals.get(g.courseCode) ?? 0) + n);
 }
 const trendSeriesCodes = [...trendCourseTotals.entries()]
 .sort((a, b) => b[1] - a[1])
 .slice(0, TREND_MAX_SERIES)
 .map(([code]) => code);
 const trendRows = [...trendByWeekCourse.entries()]
 .sort((a, b) => a[0].localeCompare(b[0]))
 .slice(-TREND_WEEKS)
 .map(([wk, courses]) => {
 const row: Record<string, string | number> = { week: weekLabel(wk) };
 for (const code of trendSeriesCodes) {
 const c = courses.get(code);
 if (c && c.counted > 0) {
 row[code] = Math.round((c.attended / c.counted) * 100);
 }
 }
 return row;
 });
 const attendanceTrend = {
 hasData: trendRows.some((r) => Object.keys(r).length > 1),
 series: trendSeriesCodes,
 rows: trendRows,
 weeks: TREND_WEEKS,
 };

 // ---------- D45: teacher workload balance ----------
 // Fairness metric over the active timetable: 100 = perfectly even split,
 // lower = a few teachers carry most classes. Uses the same active-
 // schedule rows as the existing load chart, so no extra query.
 const workloadDetailed = [...loadMap.entries()].map(([id, v]) => ({
 id,
 name: v.name,
 classes: v.count,
 days: new Set(
 schedulesForLoad.filter((s) => s.teacherId === id).map((s) => s.dayOfWeek)
 ).size,
 }));
 const teacherCount = workloadDetailed.length;
 const meanLoad = teacherCount > 0
 ? schedulesForLoad.length / teacherCount
 : 0;
 const variance =
 teacherCount > 0 && meanLoad > 0
 ? workloadDetailed.reduce((acc, t) => acc + (t.classes - meanLoad) ** 2, 0) / teacherCount
 : 0;
 const balanceScore =
 teacherCount <= 1 || meanLoad === 0
 ? 100
 : Math.max(0, Math.min(100, Math.round(100 * (1 - Math.sqrt(variance) / meanLoad))));
 const sortedByLoad = [...workloadDetailed].sort((a, b) => b.classes - a.classes);
 const workload = {
 hasData: teacherCount > 0,
 balance: balanceScore,
 busiest: sortedByLoad[0]?.name ?? null,
 lightest: sortedByLoad[sortedByLoad.length - 1]?.name ?? null,
 avgLoad: Math.round(meanLoad * 10) / 10,
 teachers: teacherCount,
 };

 const attCounted = attCounts.present + attCounts.late + attCounts.absent;
 const attendanceAnalytics = {
 hasData: totalMarked > 0,
 rate: attCounted === 0 ? 0 : Math.round(((attCounts.present + attCounts.late) / attCounted) * 100),
 totalMarked,
 present: attCounts.present,
 absent: attCounts.absent,
 late: attCounts.late,
 excused: attCounts.excused,
 perCourse: [...attByCourse.entries()]
 .map(([courseId, c]) => {
 const counted = c.present + c.late + c.absent;
 return {
 courseId,
 label: c.courseCode,
 value: counted === 0 ? 0 : Math.round(((c.present + c.late) / counted) * 100),
 };
 })
 .sort((a, b) => a.value - b.value)
 .slice(0, 8),
 };

 return {
 hasData: results.length > 0,
 totalResults: results.length,
 avgPerformance: avgPct,
 passRate: passRate(results),
 recentChanges,
 noticesCount,
 gradeDistribution: distribution,
 examAverages,
 teacherLoad,
 weeklyDensity,
 studentsPerProgram,
 studentsPerSemester,
 coursesPerSemester,
 attendance: attendanceAnalytics,
 attendanceTrend,
 workload,
 };
 }

 case "teachers":
 return (await db.user.findMany({
 where: { departmentId, role: "teacher" },
 orderBy: { fullName: "asc" },
 take: 500,
 })).map(stripPassword);

 case "students":
 return (await db.user.findMany({
 where: { departmentId, role: "student" },
 include: { program: { select: { shortName: true, name: true } } },
 orderBy: { rollNumber: "asc" },
 take: 500,
 })).map(stripPassword);

 case "courses":
 return db.course.findMany({
 where: { departmentId },
 include: { program: { select: { shortName: true } } },
 orderBy: { code: "asc" },
 take: 1000, // Phase 3 D40-41: hard cap
 });

 case "rooms":
 return db.room.findMany({
 where: { departmentId },
 orderBy: { roomNumber: "asc" },
 take: 1000,
 });

 case "timeslots":
 return db.timeSlot.findMany({
 where: { departmentId },
 orderBy: { slotOrder: "asc" },
 take: 1000,
 });

 case "programs":
 return db.program.findMany({
 where: { departmentId },
 orderBy: { shortName: "asc" },
 take: 500,
 });

 case "notices":
 return db.notice.findMany({
 where: { departmentId },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 200,
 });

 case "schedules":
 return db.schedule.findMany({
 where: { departmentId },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
 take: 1000,
 });

 case "changes": {
 // Department-wide class-change audit — the dept head's oversight view
 // of every cancellation / reschedule / room-time move their teachers
 // filed. Rows are fully denormalized (courseCode, teacherName, reason),
 // so this is one indexed query, no joins.
 const url = new URL(req.url);
 const typeFilter = url.searchParams.get("type");
 const where: Prisma.ScheduleChangeWhereInput = { departmentId };
 if (typeFilter && CHANGE_TYPE_SET.has(typeFilter)) where.changeType = typeFilter;
 const [changes, grouped] = await Promise.all([
 db.scheduleChange.findMany({
 where,
 orderBy: { createdAt: "desc" },
 take: 200,
 }),
 db.scheduleChange.groupBy({
 by: ["changeType"],
 where: { departmentId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
 _count: true,
 }),
 ]);
 const counts: Record<string, number> = {};
 for (const g of grouped) counts[g.changeType] = g._count;
 return { changes, counts, windowDays: 30 };
 }

 case "attendance-report": {
 // Per-student attendance register across the whole department — the
 // shortage list a dept head actually chases (proctors, guardian calls,
 // exam permission). Late counts as attended, mirroring teacher/analytics
 // math so every rate on the platform tells the same story.
 const url = new URL(req.url);
 const semesterParam = url.searchParams.get("semester");
 const programFilter = url.searchParams.get("programId");
 const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

 const students = await db.user.findMany({
 where: {
 departmentId,
 role: "student",
 ...(semesterParam ? { semester: Number(semesterParam) } : {}),
 ...(programFilter ? { programId: programFilter } : {}),
 },
 select: {
 id: true, fullName: true, rollNumber: true, studentIdNumber: true,
 semester: true, isActive: true,
 program: { select: { shortName: true } },
 },
 orderBy: { rollNumber: "asc" },
 take: 500,
 });

 const qFiltered = q
 ? students.filter(
 (s) =>
 s.fullName.toLowerCase().includes(q) ||
 (s.rollNumber ?? "").toLowerCase().includes(q) ||
 (s.studentIdNumber ?? "").toLowerCase().includes(q)
 )
 : students;

 const grouped = qFiltered.length
 ? await db.attendance.groupBy({
 by: ["studentId", "status"],
 where: { departmentId, studentId: { in: qFiltered.map((s) => s.id) } },
 _count: true,
 })
 : [];

 const perStudent = new Map<
 string,
 { present: number; late: number; absent: number; excused: number }
 >();
 let totalMarked = 0;
 let totalPresentish = 0;
 for (const g of grouped) {
 const cur =
 perStudent.get(g.studentId) ??
 { present: 0, late: 0, absent: 0, excused: 0 };
 cur[g.status as "present" | "late" | "absent" | "excused"] = g._count;
 perStudent.set(g.studentId, cur);
 totalMarked += g._count;
 if (g.status === "present" || g.status === "late") totalPresentish += g._count;
 }

 const rows = qFiltered.map((s) => {
 const c = perStudent.get(s.id) ?? { present: 0, late: 0, absent: 0, excused: 0 };
 const counted = c.present + c.late + c.absent;
 return {
 studentId: s.id,
 fullName: s.fullName,
 rollNumber: s.rollNumber,
 studentIdNumber: s.studentIdNumber,
 programShort: s.program?.shortName ?? null,
 semester: s.semester,
 isActive: s.isActive,
 present: c.present,
 late: c.late,
 absent: c.absent,
 excused: c.excused,
 marked: counted,
 rate: counted === 0 ? null : Math.round(((c.present + c.late) / counted) * 100),
 };
 });
 // Worst attendance first — the list a dept head works down. Unmarked
 // students (rate null) sink to the bottom.
 rows.sort((a, b) => {
 if (a.rate === null && b.rate === null) return 0;
 if (a.rate === null) return 1;
 if (b.rate === null) return -1;
 return a.rate - b.rate;
 });

 const shortStudents = rows.filter((r) => r.rate !== null && r.rate < 75).length;
 // D46-48: tenant branding so the Report Center can print a branded sheet
 // without a second round-trip.
 const universityId = await resolveUniversityId(departmentId);
 const [uniRow, deptRow] = await Promise.all([
 db.university.findUnique({
 where: { id: universityId },
 select: { name: true, shortName: true, logoURL: true, address: true },
 }),
 db.department.findUnique({
 where: { id: departmentId },
 select: { name: true },
 }),
 ]);
 return {
 students: rows,
 branding: {
 universityName: uniRow?.name ?? "University",
 universityShort: uniRow?.shortName ?? null,
 logoURL: uniRow?.logoURL ?? null,
 address: uniRow?.address ?? null,
 departmentName: deptRow?.name ?? "Department",
 },
 summary: {
 totalStudents: rows.length,
 totalMarked,
 deptRate: totalMarked === 0 ? null : Math.round((totalPresentish / totalMarked) * 100),
 shortStudents,
 shortageLine: 75,
 },
 };
 }

 case "report-data": {
 // D46-48 Report Center source data. Two report types:
 // transcript (one student, all courses, credit-weighted GPA) and
 // batch-results (one course, every student, per-exam breakdown).
 // Branding comes from the tenant row so printed sheets carry the
 // university's own name/logo, not UniversityHub's.
 const url = new URL(req.url);
 const type = url.searchParams.get("type");
 const universityId = await resolveUniversityId(departmentId);
 const [university, department] = await Promise.all([
 db.university.findUnique({
 where: { id: universityId },
 select: { name: true, shortName: true, logoURL: true, address: true },
 }),
 db.department.findUnique({
 where: { id: departmentId },
 select: { name: true, shortName: true },
 }),
 ]);
 const branding = {
 universityName: university?.name ?? "University",
 universityShort: university?.shortName ?? null,
 logoURL: university?.logoURL ?? null,
 address: university?.address ?? null,
 departmentName: department?.name ?? "Department",
 };

 if (type === "transcript") {
 const studentId = url.searchParams.get("studentId");
 if (!studentId) throw new ApiError(400, "studentId is required for the transcript report");
 const student = await db.user.findFirst({
 where: { id: studentId, departmentId, role: "student" },
 select: {
 id: true, fullName: true, rollNumber: true, studentIdNumber: true,
 semester: true, section: true, programId: true,
 program: { select: { name: true, shortName: true } },
 },
 });
 if (!student) throw new ApiError(404, "Student not found in this department");
 const results = await db.result.findMany({
 where: { studentId, departmentId },
 select: {
 marks: true, maxMarks: true, examType: true,
 course: { select: { id: true, code: true, name: true, creditHours: true } },
 },
 orderBy: { createdAt: "asc" },
 take: 2000,
 });
 const byCourse = new Map<string, { course: (typeof results)[number]["course"]; entries: { marks: number; maxMarks: number; examType: string }[] }>();
 for (const r of results) {
 const cur = byCourse.get(r.course.id) ?? { course: r.course, entries: [] };
 cur.entries.push({ marks: r.marks, maxMarks: r.maxMarks, examType: r.examType });
 byCourse.set(r.course.id, cur);
 }
 const perf = [...byCourse.values()].map((c) =>
 computeCoursePerformance(c.course.code, c.course.name, c.entries, c.course.creditHours)
 );
 // keep course ids so the UI can key rows
 const rowsOut = perf.map((p, i) => ({
 ...p,
 courseId: [...byCourse.keys()][i],
 }));
 return {
 type: "transcript",
 branding,
 student: {
 id: student.id,
 fullName: student.fullName,
 rollNumber: student.rollNumber,
 studentIdNumber: student.studentIdNumber,
 semester: student.semester,
 section: student.section,
 programName: student.program?.name ?? null,
 programShort: student.program?.shortName ?? null,
 },
 rows: rowsOut,
 totalCredits: rowsOut.reduce((a, r) => a + r.creditHours, 0),
 gpa: computeGPA(perf),
 totalEntries: results.length,
 };
 }

 if (type === "batch-results") {
 const courseId = url.searchParams.get("courseId");
 if (!courseId) throw new ApiError(400, "courseId is required for the batch result sheet");
 const course = await db.course.findFirst({
 where: { id: courseId, departmentId },
 select: { id: true, code: true, name: true, creditHours: true, semester: true, type: true },
 });
 if (!course) throw new ApiError(404, "Course not found in this department");
 const results = await db.result.findMany({
 where: { courseId, departmentId },
 select: {
 marks: true, maxMarks: true, examType: true,
 student: {
 select: { id: true, fullName: true, rollNumber: true, studentIdNumber: true, semester: true },
 },
 },
 take: 5000,
 });
 const EXAMS = ["ct1", "ct2", "midterm", "final", "assignment"] as const;
 const perStudent = new Map<
 string,
 {
 student: (typeof results)[number]["student"];
 entries: Map<string, { marks: number; maxMarks: number }>;
 }
 >();
 for (const r of results) {
 const cur = perStudent.get(r.student.id) ?? { student: r.student, entries: new Map() };
 cur.entries.set(r.examType, { marks: r.marks, maxMarks: r.maxMarks });
 perStudent.set(r.student.id, cur);
 }
 const rowsOut = [...perStudent.values()]
 .map(({ student, entries }) => {
 const pctList = [...entries.values()].map((e) =>
 e.maxMarks > 0 ? (e.marks / e.maxMarks) * 100 : 0
 );
 const avg = pctList.length ? pctList.reduce((a, b) => a + b, 0) / pctList.length : null;
 const gradeLine = avg === null ? null : percentToGrade(avg).letter;
 const perExam: Record<string, string> = {};
 for (const ex of EXAMS) {
 const e = entries.get(ex);
 perExam[ex] = e ? `${e.marks}/${e.maxMarks}` : "—";
 }
 return {
 studentId: student.id,
 fullName: student.fullName,
 rollNumber: student.rollNumber,
 studentIdNumber: student.studentIdNumber,
 semester: student.semester,
 perExam,
 avgPct: avg === null ? null : Math.round(avg * 10) / 10,
 grade: gradeLine,
 examCount: entries.size,
 };
 })
 .sort((a, b) => (a.rollNumber ?? "").localeCompare(b.rollNumber ?? ""));
 const marked = rowsOut.filter((r) => r.avgPct !== null);
 const avgAll = marked.length
 ? Math.round((marked.reduce((a, r) => a + (r.avgPct ?? 0), 0) / marked.length) * 10) / 10
 : null;
 const passCount = marked.filter((r) => (r.avgPct ?? 0) >= 40).length;
 return {
 type: "batch-results",
 branding,
 course,
 rows: rowsOut,
 stats: {
 students: rowsOut.length,
 marked: marked.length,
 avgPct: avgAll,
 passRate: marked.length ? Math.round((passCount / marked.length) * 100) : null,
 },
 };
 }

 throw new ApiError(400, "type must be 'transcript' or 'batch-results'");
 }

 case "notification-stats": {
 // D51: notification delivery log — what actually reached this
 // department's people over the last 30 days. Notification rows are
 // per-user fan-outs, so a (title, type) group IS one delivery burst
 // and its row count is the recipient count.
 const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
 const rows = await db.notification.findMany({
 where: { user: { departmentId }, createdAt: { gte: since } },
 orderBy: { createdAt: "desc" },
 take: 1500,
 select: { id: true, title: true, type: true, createdAt: true, isRead: true },
 });
 const byType = new Map<string, number>();
 const bursts = new Map<
 string,
 { title: string; type: string; recipients: number; latest: string; read: number }
 >();
 let readRows = 0;
 for (const r of rows) {
 if (r.isRead) readRows += 1;
 const t = (r.type ?? "general").replace(/^class_/, "");
 byType.set(t, (byType.get(t) ?? 0) + 1);
 const key = `${t}::${r.title}`;
 const cur = bursts.get(key) ?? { title: r.title, type: t, recipients: 0, latest: r.createdAt.toISOString(), read: 0 };
 cur.recipients += 1;
 if (r.isRead) cur.read += 1;
 bursts.set(key, cur);
 }
 return {
 windowDays: 30,
 total: rows.length,
 read: readRows,
 byType: [...byType.entries()]
 .sort((a, b) => b[1] - a[1])
 .map(([label, value]) => ({ label, value })),
 deliveries: [...bursts.values()]
 .sort((a, b) => b.latest.localeCompare(a.latest))
 .slice(0, 12),
 };
 }

 case "assignments": {
 // D13: dept-wide assignment oversight — the teacher route lists only
 // the caller's own assignments, which is useless for a dept head.
 const url = new URL(req.url);
 const courseId = url.searchParams.get("courseId");
 const rows = await db.assignment.findMany({
 where: { departmentId, ...(courseId ? { courseId } : {}) },
 include: {
 course: { select: { code: true, name: true } },
 teacher: { select: { fullName: true } },
 },
 orderBy: { createdAt: "desc" },
 take: 300,
 });
 return { assignments: rows };
 }

 case "results": {
 // D13: dept-wide results oversight (read-only) — per course/exam with
 // student identity, feeding the Results tab table + CSV export.
 const url = new URL(req.url);
 const courseId = url.searchParams.get("courseId");
 const examType = url.searchParams.get("examType");
 const rows = await db.result.findMany({
 where: {
 departmentId,
 ...(courseId ? { courseId } : {}),
 ...(examType ? { examType } : {}),
 },
 include: {
 course: { select: { code: true, name: true } },
 student: {
 select: { fullName: true, rollNumber: true, studentIdNumber: true },
 },
 },
 orderBy: { updatedAt: "desc" },
 take: 2000,
 });
 return { results: rows };
 }

 case "activity": {
 // Dept-scoped audit trail (D8): own-department mutations plus
 // university-level actions taken on this tenant by super admins.
 const { searchParams: sp } = new URL(req.url);
 const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
 const pageSize = Math.min(
 100,
 Math.max(1, Math.floor(Number(sp.get("pageSize")) || 20))
 );
 const uniId = await resolveUniversityId(departmentId);
 const where: Record<string, unknown> = {
 OR: [{ departmentId }, { universityId: uniId, departmentId: null }],
 };
 const [logs, total] = await Promise.all([
 db.auditLog.findMany({
 where,
 orderBy: { createdAt: "desc" },
 skip: (page - 1) * pageSize,
 take: pageSize,
 }),
 db.auditLog.count({ where }),
 ]);
 return {
 logs,
 total,
 page,
 pages: Math.max(1, Math.ceil(total / pageSize)),
 };
 }

 case "sessions": {
 // Department-scoped live QR windows — the dept head's supervision view
 // (same kill-switch semantics the super admin has platform-wide, but
 // scoped so a head only touches their own teachers' windows).
 const now = new Date();
 const [active, closedToday] = await Promise.all([
 db.attendanceSession.findMany({
 where: { departmentId, closed: false, expiresAt: { gt: now } },
 select: {
 id: true, date: true, durationSec: true, startsAt: true,
 expiresAt: true, presentCount: true, geoRadiusM: true,
 schedule: { select: { courseCode: true, courseName: true, semester: true } },
 teacher: { select: { fullName: true } },
 },
 orderBy: { startsAt: "desc" },
 take: 100,
 }),
 db.attendanceSession.findMany({
 where: {
 departmentId,
 closed: true,
 expiresAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
 },
 select: {
 id: true, date: true, presentCount: true, expiresAt: true,
 schedule: { select: { courseCode: true } },
 teacher: { select: { fullName: true } },
 },
 orderBy: { expiresAt: "desc" },
 take: 50,
 }),
 ]);
 return { active, closedToday };
 }
 }
 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;

 return handle(async () => {
 // Phase 3 D40-41: auth first (parity with GET/PUT/DELETE).
 const session = await requireRole("super_admin", "dept_admin");
 const entity = raw as Entity;
 if (!ENTITIES.includes(entity)) throw new ApiError(400, "Unknown entity");
 const actor = auditActor(session);
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
 const departmentId = await getDeptId(session, req, body);

 switch (entity) {
 case "teachers": {
 const { fullName, email, password, designation, phone, officeRoom, bio } =
 body as Record<string, string>;
 if (!fullName || !email || !password)
 throw new ApiError(400, "Name, email and password are required");
 const emailNorm = email.trim().toLowerCase();
 if (!EMAIL_RE.test(emailNorm))
 throw new ApiError(400, "Please enter a valid email address");
 if (password.length < 8)
 throw new ApiError(400, "Password must be at least 8 characters");
 // universityId comes from the department row so a super_admin can
 // provision any department without creating an orphaned user.
 const universityId = await resolveUniversityId(departmentId);
 const hashed = await hashPassword(password);
 // Plan-limit count + duplicate check + create run inside ONE transaction
 // — SQLite serializes writers, so two concurrent creates can no longer
 // both pass the count check (TOCTOU).
 const created = await db.$transaction(async (tx) => {
 await assertPlanLimit(tx, universityId, "maxTeachers", "teachers");
 const existing = await tx.user.findFirst({
 where: { universityId, email: emailNorm },
 });
 if (existing)
 throw new ApiError(409, "A user with this email already exists");
 return tx.user.create({
 data: {
 universityId,
 departmentId,
 role: "teacher",
 fullName: cleanStr(fullName, 100),
 email: emailNorm,
 password: hashed,
 designation: cleanStr(designation || "Lecturer", 60),
 phone: phone ? cleanStr(phone, 30) : null,
 officeRoom: officeRoom ? cleanStr(officeRoom, 30) : null,
 bio: bio ? cleanStr(bio, 500) : null,
 },
 });
 });
 return stripPassword(created);
 }

 case "students": {
 const {
 fullName,
 studentIdNumber,
 rollNumber,
 programId,
 semester,
 section,
 phone,
 } = body as Record<string, string | number>;
 if (!fullName || !studentIdNumber || !rollNumber)
 throw new ApiError(400, "Name, ID number and roll number are required");
 const universityId = await resolveUniversityId(departmentId);
 if (programId) {
 await assertProgramInDepartment(String(programId), departmentId);
 }
 // Plan-limit count + duplicate check + create in one transaction (see
 // the teachers branch — SQLite serializes writers, closing the TOCTOU).
 const created = await db.$transaction(async (tx) => {
 await assertPlanLimit(tx, universityId, "maxStudents", "students");
 const existing = await tx.user.findFirst({
 where: { universityId, studentIdNumber: String(studentIdNumber) },
 });
 if (existing)
 throw new ApiError(409, "A student with this ID number already exists");
 return tx.user.create({
 data: {
 universityId,
 departmentId,
 role: "student",
 fullName: cleanStr(fullName, 100),
 studentIdNumber: cleanStr(studentIdNumber, 30),
 rollNumber: cleanStr(rollNumber, 30),
 programId: programId ? String(programId) : null,
 semester: semester ? validateSemester(semester, "Semester") : null,
 section: section ? cleanStr(section, 20) : null,
 phone: phone ? cleanStr(phone, 30) : null,
 },
 });
 });
 return stripPassword(created);
 }

 case "courses": {
 const { code, name, creditHours, type, semester, programId } =
 body as Record<string, string | number>;
 if (!code || !name || !programId)
 throw new ApiError(400, "Code, name and program are required");
 // Tenant guard: the course's program must live in THIS department.
 const program = await assertProgramInDepartment(String(programId), departmentId);
 const courseType = type ? String(type) : "theory";
 if (courseType !== "theory" && courseType !== "lab")
 throw new ApiError(400, "Course type must be theory or lab");
 const sem = Number(semester) || 1;
 if (!Number.isInteger(sem) || sem < 1)
 throw new ApiError(400, "Semester must be a positive whole number");
 if (sem > program.semesterCount)
 throw new ApiError(
 400,
 `Semester must be between 1 and ${program.semesterCount} for this program`
 );
 const creditNum =
 creditHours === undefined || creditHours === null || creditHours === ""
 ? 3
 : cleanNum(creditHours);
 if (creditNum <= 0 || creditNum > 30)
 throw new ApiError(400, "Credit hours must be greater than 0 and at most 30");
 return db.course.create({
 data: {
 departmentId,
 programId: String(programId),
 code: cleanStr(code, 30),
 name: cleanStr(name, 120),
 creditHours: creditNum,
 type: courseType,
 semester: sem,
 },
 });
 }

 case "rooms": {
 const { roomNumber, building, type, capacity } =
 body as Record<string, string | number>;
 if (!roomNumber) throw new ApiError(400, "Room number is required");
 // Int column: a fractional or sub-1 capacity used to pass through and
 // surface as an opaque Prisma 500 (or store a nonsensical room).
 const capacityNum =
 capacity === undefined || capacity === null || capacity === ""
 ? 40
 : cleanNum(capacity);
 if (!Number.isInteger(capacityNum) || capacityNum < 1)
 throw new ApiError(400, "Capacity must be a whole number of at least 1");
 return db.room.create({
 data: {
 departmentId,
 roomNumber: String(roomNumber),
 building: building ? String(building) : null,
 type: String(type) || "classroom",
 capacity: capacityNum,
 },
 });
 }

 case "timeslots": {
 const { label, startTime, endTime, slotOrder, isBreak } =
 body as Record<string, string | number | boolean>;
 if (!label || !startTime || !endTime)
 throw new ApiError(400, "Label, start and end time are required");
 // The timetable and clash math parse these strings — enforce HH:MM.
 validateTimeRange(startTime, endTime);
 return db.timeSlot.create({
 data: {
 departmentId,
 label: String(label),
 startTime: String(startTime),
 endTime: String(endTime),
 slotOrder: Number(slotOrder) || 1,
 isBreak: Boolean(isBreak),
 },
 });
 }

 case "programs": {
 const { name, shortName, semesterCount } =
 body as Record<string, string | number>;
 if (!name || !shortName)
 throw new ApiError(400, "Program name and short name are required");
 const semCount =
 semesterCount === undefined || semesterCount === null || semesterCount === ""
 ? 8
 : cleanNum(semesterCount);
 if (!Number.isInteger(semCount) || semCount < 1 || semCount > 12)
 throw new ApiError(
 400,
 "Semester count must be a whole number between 1 and 12"
 );
 return db.program.create({
 data: {
 departmentId,
 name: String(name),
 shortName: String(shortName),
 semesterCount: semCount,
 },
 });
 }

 case "notices": {
 const { title, content, category, audience, programId, semester, isPinned } =
 body as Record<string, string | number | boolean>;
 if (!title || !content)
 throw new ApiError(400, "Title and content are required");
 const audienceVal = audience ? String(audience) : "all";
 if (!["all", "students", "teachers"].includes(audienceVal)) {
 throw new ApiError(400, "Audience must be all, students or teachers");
 }
 if (category && !VALID_CATEGORIES.has(String(category))) {
 throw new ApiError(400, "Invalid notice category");
 }
 if (programId) {
 await assertProgramInDepartment(String(programId), departmentId);
 }
 // D6: expiry + attachment were schema-only — expose them to the UI.
 const attachmentURL =
 typeof body.attachmentURL === "string" ? body.attachmentURL.trim() : "";
 if (attachmentURL && !/^https?:\/\/.+/i.test(attachmentURL)) {
 throw new ApiError(400, "Attachment URL must start with http:// or https://");
 }
 let expiryDate: Date | null = null;
 if (typeof body.expiryDate === "string" && body.expiryDate.trim()) {
 // Phase 3 D34-35: date-only input previously parsed as UTC midnight
 // (06:00 Dhaka) so notices vanished six hours before the expiry day
 // actually ended. Anchor at 23:59:59 Asia/Dhaka.
 const d = bdEndOfDayUTC(body.expiryDate.trim());
 if (Number.isNaN(d.getTime()))
 throw new ApiError(400, "Expiry date must be a valid date");
 expiryDate = d;
 }
 const notice = await db.notice.create({
 data: {
 departmentId,
 title: cleanStr(title, 150),
 content: cleanStr(content, 5000),
 category: String(category) || "general",
 audience: audienceVal,
 programId: programId ? String(programId) : null,
 semester: semester ? Number(semester) : null,
 isPinned: Boolean(isPinned),
 attachmentURL: attachmentURL || null,
 expiryDate,
 postedBy: session.userId,
 postedByName: session.name,
 },
 });

 // Fan-out per-user notifications (mirrors the teacher notice route):
 // students honor the program/semester scope, teachers always hear about
 // department notices. Bounded at 1000 so createMany stays cheap.
 const noticeTitle = `Notice: ${notice.title.slice(0, 60)}`;
 const noticeBody = notice.content.slice(0, 140);
 const fanout: {
 userId: string; title: string; body: string; type: string; link: string;
 }[] = [];
 if (audienceVal !== "teachers") {
 const students = await db.user.findMany({
 where: {
 departmentId,
 role: "student",
 isActive: true,
 ...(notice.programId ? { programId: notice.programId } : {}),
 ...(notice.semester ? { semester: notice.semester } : {}),
 },
 select: { id: true },
 take: 1000,
 });
 for (const s of students) {
 fanout.push({ userId: s.id, title: noticeTitle, body: noticeBody, type: "notice", link: "/?view=dashboard" });
 }
 }
 if (audienceVal !== "students") {
 const teachers = await db.user.findMany({
 where: { departmentId, role: "teacher", isActive: true },
 select: { id: true },
 take: 1000,
 });
 for (const t of teachers) {
 fanout.push({ userId: t.id, title: noticeTitle, body: noticeBody, type: "notice", link: "/?view=dashboard" });
 }
 }
 if (fanout.length) await db.notification.createMany({ data: fanout });

 await logAdminAction({
 ...actor,
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "create",
 entity: "notice",
 entityId: notice.id,
 entityLabel: notice.title,
 });
 return notice;
 }

 case "schedules": {
 const {
 courseId,
 teacherId,
 roomId,
 timeSlotId,
 programId,
 semester,
 dayOfWeek,
 } = body as Record<string, string | number>;
 if (
 !courseId || !teacherId || !roomId || !timeSlotId ||
 !programId || !dayOfWeek
 )
 throw new ApiError(400, "All schedule fields are required");
 const day = String(dayOfWeek);
 if (!VALID_DAYS.has(day))
 throw new ApiError(400, "Invalid day of week");

 const [course, teacher, room, timeSlot, program] = await Promise.all([
 db.course.findUnique({ where: { id: String(courseId) } }),
 db.user.findUnique({ where: { id: String(teacherId) } }),
 db.room.findUnique({ where: { id: String(roomId) } }),
 db.timeSlot.findUnique({ where: { id: String(timeSlotId) } }),
 db.program.findUnique({ where: { id: String(programId) } }),
 ]);
 if (!course || !teacher || !room || !timeSlot || !program)
 throw new ApiError(404, "Invalid course, teacher, room, time slot or program");
 // The assignee must actually be an active teacher of this department —
 // previously a student or another admin could end up on the routine.
 if (teacher.role !== "teacher" || !teacher.isActive)
 throw new ApiError(400, "Selected assignee must be an active teacher");
 // Tenant guard: every referenced resource must belong to THIS department.
 if (
 course.departmentId !== departmentId ||
 teacher.departmentId !== departmentId ||
 room.departmentId !== departmentId ||
 timeSlot.departmentId !== departmentId ||
 program.departmentId !== departmentId
 ) {
 throw new ApiError(403, "Resource belongs to another department");
 }
 const sem = validateSemester(semester);

 // Conflict detection: room, teacher and batch — expanded to *overlapping*
 // time windows, since two different department slots can physically collide.
 const sameDay = await db.schedule.findMany({
 where: {
 departmentId,
 dayOfWeek: day,
 isActive: true,
 },
 });
 const overlapping = sameDay.filter((s) =>
 windowsOverlap(
 s.startTime,
 s.endTime,
 timeSlot.startTime,
 timeSlot.endTime,
 s.timeSlotId === timeSlot.id
 )
 );
 const roomClash = overlapping.find((s) => s.roomId === room.id);
 if (roomClash)
 throw new ApiError(
 409,
 `Room ${room.roomNumber} is occupied (${roomClash.courseCode}) at this time`
 );
 const teacherClash = overlapping.find((s) => s.teacherId === teacher.id);
 if (teacherClash)
 throw new ApiError(
 409,
 `${teacher.fullName} already has ${teacherClash.courseCode} at this time`
 );
 const batchClash = overlapping.find(
 (s) => s.programId === program.id && s.semester === sem
 );
 if (batchClash)
 throw new ApiError(
 409,
 `This batch already has ${batchClash.courseCode} at this time`
 );

 return db.schedule.create({
 data: {
 departmentId,
 courseId: course.id,
 teacherId: teacher.id,
 roomId: room.id,
 timeSlotId: timeSlot.id,
 programId: program.id,
 semester: sem,
 courseCode: course.code,
 courseName: course.name,
 teacherName: teacher.fullName,
 roomNumber: room.roomNumber,
 startTime: timeSlot.startTime,
 endTime: timeSlot.endTime,
 dayOfWeek: day,
 classType: course.type,
 createdBy: session.userId,
 },
 });
 }

 case "import": {
 // D10-11: bulk CSV import for teachers & students — dry-run preview,
 // per-row error report, plan-cap aware, atomic commit.
 const importEntity = String(body.entity || "");
 const dryRun = Boolean(body.dryRun);
 const csv = typeof body.csv === "string" ? body.csv.slice(0, 500_000) : "";
 if (importEntity !== "teachers" && importEntity !== "students")
 throw new ApiError(400, "entity must be teachers or students");
 if (!csv.trim()) throw new ApiError(400, "CSV content is required");
 const universityId = await resolveUniversityId(departmentId);
 const rows = parseCsv(csv);
 if (rows.length < 2)
 throw new ApiError(400, "CSV needs a header row and at least one data row");
 const header = rows[0].map((h) => h.trim().toLowerCase());
 const dataRows = rows
 .slice(1)
 .filter((r) => r.some((c) => c.trim() !== ""));
 const errors: { row: number; message: string }[] = [];
 const valid: Record<string, string | number | null>[] = [];

 if (importEntity === "teachers") {
 const col = (n: string) => header.indexOf(n);
 const iName = col("fullname"), iEmail = col("email"), iPw = col("password");
 const iDesig = col("designation"), iPhone = col("phone"), iOffice = col("officeroom");
 if (iName < 0 || iEmail < 0 || iPw < 0)
 throw new ApiError(400, "CSV must have fullname, email and password columns");
 const seenEmails = new Set<string>();
 for (let r = 0; r < dataRows.length; r++) {
 const rowNum = r + 2;
 const c = dataRows[r];
 const fullName = (c[iName] ?? "").trim();
 const email = (c[iEmail] ?? "").trim().toLowerCase();
 const password = (c[iPw] ?? "").trim();
 if (!fullName) { errors.push({ row: rowNum, message: "fullname is required" }); continue; }
 if (!EMAIL_RE.test(email)) { errors.push({ row: rowNum, message: `invalid email "${email}"` }); continue; }
 if (password.length < 8) { errors.push({ row: rowNum, message: "password must be at least 8 characters" }); continue; }
 if (seenEmails.has(email)) { errors.push({ row: rowNum, message: `duplicate email in file: ${email}` }); continue; }
 seenEmails.add(email);
 valid.push({
 fullName,
 email,
 password,
 designation: (c[iDesig] ?? "").trim() || "Lecturer",
 phone: (c[iPhone] ?? "").trim() || null,
 officeRoom: (c[iOffice] ?? "").trim() || null,
 });
 }
 // DB duplicates become row errors too — the commit only carries rows
 // that are valid AND new.
 const emails = valid.map((v) => String(v.email));
 const existing = emails.length
 ? await db.user.findMany({
 where: { universityId, email: { in: emails } },
 select: { email: true },
 })
 : [];
 const taken = new Set(existing.map((e) => e.email));
 for (let i = valid.length - 1; i >= 0; i--) {
 if (taken.has(String(valid[i].email))) {
 errors.push({ row: -1, message: `email already exists: ${valid[i].email}` });
 valid.splice(i, 1);
 }
 }
 // Hash before the transaction — bcrypt is deliberately slow.
 for (const v of valid) v.password = await hashPassword(String(v.password));
 } else {
 const col = (n: string) => header.indexOf(n);
 const iName = col("fullname"), iSid = col("studentidnumber"), iRoll = col("rollnumber");
 const iProg = col("program"), iSem = col("semester"), iSec = col("section"), iPhone = col("phone");
 if (iName < 0 || iSid < 0 || iRoll < 0)
 throw new ApiError(400, "CSV must have fullname, studentidnumber and rollnumber columns");
 const programs = await db.program.findMany({
 where: { departmentId, isActive: true },
 });
 const progByKey = new Map<string, { id: string; semesterCount: number }>();
 for (const p of programs) {
 progByKey.set(p.shortName.toLowerCase(), { id: p.id, semesterCount: p.semesterCount });
 progByKey.set(p.name.toLowerCase(), { id: p.id, semesterCount: p.semesterCount });
 }
 const seenSid = new Set<string>();
 const seenRoll = new Set<string>();
 for (let r = 0; r < dataRows.length; r++) {
 const rowNum = r + 2;
 const c = dataRows[r];
 const fullName = (c[iName] ?? "").trim();
 const sid = (c[iSid] ?? "").trim();
 const roll = (c[iRoll] ?? "").trim();
 if (!fullName) { errors.push({ row: rowNum, message: "fullname is required" }); continue; }
 if (!sid) { errors.push({ row: rowNum, message: "studentidnumber is required" }); continue; }
 if (!roll) { errors.push({ row: rowNum, message: "rollnumber is required" }); continue; }
 if (seenSid.has(sid)) { errors.push({ row: rowNum, message: `duplicate ID number in file: ${sid}` }); continue; }
 if (seenRoll.has(roll)) { errors.push({ row: rowNum, message: `duplicate roll in file: ${roll}` }); continue; }
 seenSid.add(sid);
 seenRoll.add(roll);
 let programId: string | null = null;
 let semester: number | null = null;
 const progRaw = (c[iProg] ?? "").trim();
 const semRaw = (c[iSem] ?? "").trim();
 if (progRaw) {
 const prog = progByKey.get(progRaw.toLowerCase());
 if (!prog) { errors.push({ row: rowNum, message: `program "${progRaw}" not found in this department` }); continue; }
 programId = prog.id;
 if (semRaw) {
 const n = Math.round(Number(semRaw));
 if (!Number.isInteger(n) || n < 1 || n > prog.semesterCount) {
 errors.push({ row: rowNum, message: `semester must be 1-${prog.semesterCount} for this program` });
 continue;
 }
 semester = n;
 }
 } else if (semRaw) {
 const n = Math.round(Number(semRaw));
 if (!Number.isInteger(n) || n < 1 || n > 12) { errors.push({ row: rowNum, message: "semester must be 1-12" }); continue; }
 semester = n;
 }
 valid.push({
 fullName,
 studentIdNumber: sid,
 rollNumber: roll,
 programId,
 semester,
 section: (c[iSec] ?? "").trim() || null,
 phone: (c[iPhone] ?? "").trim() || null,
 });
 }
 const sids = valid.map((v) => String(v.studentIdNumber));
 const rolls = valid.map((v) => String(v.rollNumber));
 const [exSid, exRoll] = await Promise.all([
 sids.length
 ? db.user.findMany({ where: { universityId, studentIdNumber: { in: sids } }, select: { studentIdNumber: true } })
 : [],
 rolls.length
 ? db.user.findMany({ where: { universityId, rollNumber: { in: rolls } }, select: { rollNumber: true } })
 : [],
 ]);
 const takenSid = new Set(exSid.map((e) => e.studentIdNumber));
 const takenRoll = new Set(exRoll.map((e) => e.rollNumber));
 for (let i = valid.length - 1; i >= 0; i--) {
 const v = valid[i];
 if (takenSid.has(String(v.studentIdNumber))) {
 errors.push({ row: -1, message: `student ID already exists: ${v.studentIdNumber}` });
 valid.splice(i, 1);
 } else if (takenRoll.has(String(v.rollNumber))) {
 errors.push({ row: -1, message: `roll already exists: ${v.rollNumber}` });
 valid.splice(i, 1);
 }
 }
 }

 let committed = false;
 if (!dryRun && valid.length > 0) {
 const cap = importEntity === "teachers" ? "maxTeachers" : "maxStudents";
 const role = importEntity === "teachers" ? "teacher" : "student";
 await db.$transaction(async (tx) => {
 const uni = await tx.university.findUnique({
 where: { id: universityId },
 select: { plan: { select: { maxTeachers: true, maxStudents: true } } },
 });
 const limit = uni?.plan?.[cap] ?? -1;
 const existingCount = await tx.user.count({
 where: { universityId, role, isActive: true },
 });
 if (limit >= 0 && existingCount + valid.length > limit) {
 throw new ApiError(
 403,
 `Plan limit: ${existingCount} active ${importEntity} + ${valid.length} imported would exceed the limit of ${limit}. Remove rows or upgrade the plan.`
 );
 }
 if (importEntity === "teachers") {
 await tx.user.createMany({
 data: valid.map((v) => ({
 universityId,
 departmentId,
 role: "teacher",
 fullName: String(v.fullName),
 email: String(v.email),
 password: String(v.password),
 designation: String(v.designation),
 phone: v.phone as string | null,
 officeRoom: v.officeRoom as string | null,
 isActive: true,
 })),
 });
 } else {
 await tx.user.createMany({
 data: valid.map((v) => ({
 universityId,
 departmentId,
 role: "student",
 fullName: String(v.fullName),
 studentIdNumber: String(v.studentIdNumber),
 rollNumber: String(v.rollNumber),
 programId: v.programId as string | null,
 semester: v.semester as number | null,
 section: v.section as string | null,
 phone: v.phone as string | null,
 isActive: true,
 })),
 });
 }
 });
 committed = true;
 }
 await logAdminAction({
 ...actor,
 universityId,
 departmentId,
 action: "import",
 entity: importEntity,
 detail: `dryRun=${dryRun} valid=${valid.length} errors=${errors.length} committed=${committed}`,
 });
 return {
 totalRows: dataRows.length,
 valid: valid.length,
 errors,
 committed,
 };
 }

 default:
 throw new ApiError(400, "Cannot create this entity");
 }
 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;
 const entity = raw as Entity;
 return handle(async () => {
 const session = await requireRole("super_admin", "dept_admin");
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id query param is required");
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 // Fetch record to verify access
 let departmentId: string | null = null;
 switch (entity) {
 case "teachers":
 case "students":
 departmentId = (await db.user.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 case "courses":
 departmentId = (await db.course.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 case "rooms":
 departmentId = (await db.room.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 case "timeslots":
 departmentId = (await db.timeSlot.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 case "programs":
 departmentId = (await db.program.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 case "notices":
 departmentId = (await db.notice.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 case "schedules":
 departmentId = (await db.schedule.findUnique({ where: { id } }))?.departmentId ?? null;
 break;
 }
 if (!departmentId) throw new ApiError(404, "Record not found");
 await assertDeptAccess(session, departmentId);

 // Per-entity field whitelist — previously a shared cross-entity list let
 // callers update fields that don't exist on the target model (e.g.
 // "capacity" on a course), which Prisma rejected with an opaque 500.
 const FIELD_POLICY: Record<
 string,
 { str: [string, number][]; num: string[]; bool: string[] }
 > = {
 teachers: {
 str: [["fullName", 100], ["designation", 60], ["phone", 30], ["officeRoom", 30], ["bio", 500]],
 num: [],
 bool: ["isActive"],
 },
 students: {
 str: [["fullName", 100], ["section", 20], ["phone", 30], ["studentIdNumber", 30], ["rollNumber", 30]],
 num: ["semester"],
 bool: ["isActive"],
 },
 courses: {
 str: [["code", 30], ["name", 120], ["type", 20]],
 num: ["creditHours", "semester"],
 bool: ["isActive"],
 },
 rooms: {
 str: [["roomNumber", 30], ["building", 60], ["type", 20]],
 num: ["capacity"],
 bool: ["isActive"],
 },
 timeslots: {
 str: [["label", 60], ["startTime", 10], ["endTime", 10]],
 num: ["slotOrder"],
 bool: ["isBreak", "isActive"],
 },
 programs: {
 str: [["name", 80], ["shortName", 20]],
 num: ["semesterCount"],
 bool: ["isActive"],
 },
 notices: {
 str: [["title", 150], ["content", 5000], ["category", 30]],
 num: ["semester"],
 bool: ["isPinned"],
 },
 schedules: {
 str: [["dayOfWeek", 10]],
 num: ["semester"],
 bool: ["isActive"],
 },
 };
 const policy = FIELD_POLICY[entity] ?? { str: [], num: [], bool: [] };
 const data: Record<string, unknown> = {};
 for (const [f, max] of policy.str) {
 const v = body[f];
 if (v !== undefined && v !== null) data[f] = cleanStr(v, max);
 }
 for (const f of policy.num) {
 const v = body[f];
 if (v !== undefined && v !== null && v !== "") data[f] = cleanNum(v);
 }
 for (const f of policy.bool) {
 if (body[f] !== undefined) data[f] = Boolean(body[f]);
 }
 // programId is only a real column on students/courses/notices/schedules —
 // letting it ride through for rooms/timeslots/programs hit Prisma with
 // an unknown argument (opaque 500), so it is dropped for those entities.
 const PROGRAM_ID_ENTITIES = new Set(["students", "courses", "notices", "schedules"]);
 if (body.programId !== undefined && PROGRAM_ID_ENTITIES.has(entity)) {
 data.programId = body.programId ? String(body.programId) : null;
 }
 // Student PUT applies the same semester validation POST uses, plus the
 // program-length bound — a semester past the program's semesterCount
 // used to write silently and break routine/course lookups.
 if (entity === "students" && data.semester !== undefined) {
 validateSemester(data.semester);
 const effProgramId =
 (data.programId as string | null | undefined) ??
 (await db.user.findUnique({ where: { id }, select: { programId: true } }))
 ?.programId ??
 null;
 if (effProgramId) {
 const prog = await db.program.findUnique({
 where: { id: effProgramId },
 select: { semesterCount: true },
 });
 if (prog && (data.semester as number) > prog.semesterCount) {
 throw new ApiError(
 400,
 `Semester must be between 1 and ${prog.semesterCount} for this program`
 );
 }
 }
 }
 // audience: enum whitelist on update too (POST already enforces this) —
 // previously it rode the generic string list and bypassed validation.
 if (entity === "notices" && body.audience !== undefined && body.audience !== null) {
 const audienceVal = String(body.audience);
 if (!["all", "students", "teachers"].includes(audienceVal))
 throw new ApiError(400, "Audience must be all, students or teachers");
 data.audience = audienceVal;
 }
 if (entity === "notices" && body.category !== undefined && body.category !== null) {
 if (!VALID_CATEGORIES.has(String(body.category)))
 throw new ApiError(400, "Invalid notice category");
 }
 // D6: expiry + attachment on update — validated like POST. Previously
 // these schema columns had no update path at all.
 if (entity === "notices" && body.attachmentURL !== undefined) {
 const a = body.attachmentURL ? String(body.attachmentURL).trim() : "";
 if (a && !/^https?:\/\/.+/i.test(a))
 throw new ApiError(400, "Attachment URL must start with http:// or https://");
 data.attachmentURL = a || null;
 }
 if (entity === "notices" && body.expiryDate !== undefined) {
 if (body.expiryDate === null || body.expiryDate === "") {
 data.expiryDate = null;
 } else {
 // Phase 3 D34-35: end-of-day Dhaka (parity with the POST branch).
 const d = bdEndOfDayUTC(String(body.expiryDate));
 if (Number.isNaN(d.getTime()))
 throw new ApiError(400, "Expiry date must be a valid date");
 data.expiryDate = d;
 }
 }

 // Numeric bounds on Int columns — fractions/oversized values previously
 // surfaced as opaque Prisma 500s; reject them with friendly 400s here.
 if (entity === "rooms" && data.capacity !== undefined) {
 if (!Number.isInteger(data.capacity) || (data.capacity as number) < 1)
 throw new ApiError(400, "Capacity must be a whole number of at least 1");
 }
 if (entity === "courses" && data.creditHours !== undefined) {
 const ch = data.creditHours as number;
 if (!Number.isFinite(ch) || ch <= 0 || ch > 30)
 throw new ApiError(400, "Credit hours must be greater than 0 and at most 30");
 }
 if (entity === "programs" && data.semesterCount !== undefined) {
 const sc = data.semesterCount as number;
 if (!Number.isInteger(sc) || sc < 1 || sc > 12)
 throw new ApiError(400, "Semester count must be a whole number between 1 and 12");
 }
 if (entity === "timeslots") {
 validateTimeRange(data.startTime, data.endTime);
 }

 switch (entity) {
 case "teachers":
 case "students": {
 // Password policy: "" → skip (leave unchanged); <6 chars → 400;
 // 6+ → hash. (Previously short passwords were silently ignored.)
 if (typeof body.password === "string") {
 if (body.password.length === 0) {
 // empty string → skip password change
 } else if (body.password.length < 8) {
 throw new ApiError(400, "Password must be at least 8 characters");
 } else {
 data.password = await hashPassword(body.password);
 }
 }
 // Email updates: normalize + format-check + per-university uniqueness.
 if (typeof body.email === "string" && body.email.trim()) {
 const emailNorm = body.email.trim().toLowerCase();
 if (!EMAIL_RE.test(emailNorm))
 throw new ApiError(400, "Please enter a valid email address");
 const target = await db.user.findUnique({
 where: { id },
 select: { universityId: true },
 });
 if (!target) throw new ApiError(404, "User not found");
 const clash = await db.user.findFirst({
 where: {
 email: emailNorm,
 // A corrupted null-university row must not silently compare against
 // the platform super-admin namespace — use an impossible sentinel.
 universityId: target.universityId ?? "__no_university__",
 id: { not: id },
 },
 select: { id: true },
 });
 if (clash)
 throw new ApiError(409, "A user with this email already exists");
 data.email = emailNorm;
 }
 // A reassigned program must belong to this department (null clears it).
 if (data.programId) {
 await assertProgramInDepartment(String(data.programId), departmentId);
 }
 const updated = await db.user.update({ where: { id }, data });
 await logAdminAction({
 ...auditActor(session),
 universityId: updated.universityId,
 departmentId: updated.departmentId,
 action: data.isActive === false ? "deactivate" : "update",
 entity: updated.role,
 entityId: updated.id,
 entityLabel: updated.email ?? updated.fullName,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return stripPassword(updated);
 }
 case "courses": {
 // programId is a required column — an empty value previously null'd it
 // and surfaced as an opaque Prisma 500 (mirrors the schedules branch).
 if (data.programId !== undefined && !data.programId) {
 throw new ApiError(400, "Program is required");
 }
 // A reassigned program must belong to this department — verified
 // BEFORE the write so a rejected request cannot half-apply.
 if (data.programId) {
 await assertProgramInDepartment(String(data.programId), departmentId);
 }
 const updated = await db.course.update({ where: { id }, data });
 // Denormalized label sync (best-effort): schedules cache code/name so
 // the timetable renders without a join — keep the cache honest.
 if (data.code !== undefined || data.name !== undefined) {
 try {
 await db.schedule.updateMany({
 where: { courseId: id },
 data: {
 ...(data.code !== undefined ? { courseCode: updated.code } : {}),
 ...(data.name !== undefined ? { courseName: updated.name } : {}),
 },
 });
 } catch (syncErr) {
 console.warn("[manage/courses] schedule label sync failed:", syncErr);
 }
 }
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "update",
 entity: "course",
 entityId: updated.id,
 entityLabel: updated.code,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return updated;
 }
 case "rooms": {
 const updated = await db.room.update({ where: { id }, data });
 // Denormalized label sync (best-effort): schedules cache roomNumber.
 if (data.roomNumber !== undefined) {
 try {
 await db.schedule.updateMany({
 where: { roomId: id },
 data: { roomNumber: updated.roomNumber },
 });
 } catch (syncErr) {
 console.warn("[manage/rooms] schedule label sync failed:", syncErr);
 }
 }
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "update",
 entity: "room",
 entityId: updated.id,
 entityLabel: updated.roomNumber,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return updated;
 }
 case "timeslots": {
 const updated = await db.timeSlot.update({ where: { id }, data });
 // Denormalized label sync (best-effort): schedules cache start/end.
 if (data.startTime !== undefined || data.endTime !== undefined) {
 try {
 await db.schedule.updateMany({
 where: { timeSlotId: id },
 data: {
 ...(data.startTime !== undefined ? { startTime: updated.startTime } : {}),
 ...(data.endTime !== undefined ? { endTime: updated.endTime } : {}),
 },
 });
 } catch (syncErr) {
 console.warn("[manage/timeslots] schedule label sync failed:", syncErr);
 }
 }
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "update",
 entity: "timeslot",
 entityId: updated.id,
 entityLabel: updated.label,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return updated;
 }
 case "programs": {
 const updatedProgram = await db.program.update({ where: { id }, data });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "update",
 entity: "program",
 entityId: updatedProgram.id,
 entityLabel: updatedProgram.name,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return updatedProgram;
 }
 case "notices": {
 if (data.programId) {
 await assertProgramInDepartment(String(data.programId), departmentId);
 }
 // Semester must stay bounded (1..12) AND tied to a program scope — a
 // bare semester without a program filtered nobody in fan-out lookups.
 if (data.semester !== undefined) {
 validateSemester(data.semester);
 const effProgramId =
 (data.programId as string | null | undefined) ??
 (await db.notice.findUnique({ where: { id }, select: { programId: true } }))
 ?.programId ??
 null;
 if (!effProgramId)
 throw new ApiError(400, "A program must be selected when a semester is set");
 }
 const updatedNotice = await db.notice.update({ where: { id }, data });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "update",
 entity: "notice",
 entityId: updatedNotice.id,
 entityLabel: updatedNotice.title,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return updatedNotice;
 }
 case "schedules": {
 // If slot/day changed, re-run conflict detection
 const existing = await db.schedule.findUnique({ where: { id } });
 if (!existing) throw new ApiError(404, "Schedule not found");
 if (data.semester !== undefined) {
 validateSemester(data.semester);
 }
 if (data.dayOfWeek === "") delete data.dayOfWeek;

 // Optional relation swaps — previously these fields were silently
 // dropped by the generic string-field mapper (the slot picker was a
 // no-op). Validate existence + department membership, then keep the
 // denormalized display columns in sync.
 if (
 typeof body.timeSlotId === "string" &&
 body.timeSlotId &&
 body.timeSlotId !== existing.timeSlotId
 ) {
 const slot = await db.timeSlot.findUnique({ where: { id: body.timeSlotId } });
 if (!slot) throw new ApiError(404, "Time slot not found");
 if (slot.departmentId !== departmentId)
 throw new ApiError(403, "Resource belongs to another department");
 // REALITY CHECK: a break slot is not a class slot — moving a class
 // into one is only rejected when the slot actually changes.
 if (slot.isBreak) {
 throw new ApiError(400, "A class cannot be scheduled in a break time slot");
 }
 data.timeSlotId = slot.id;
 data.startTime = slot.startTime;
 data.endTime = slot.endTime;
 }
 if (
 typeof body.roomId === "string" &&
 body.roomId &&
 body.roomId !== existing.roomId
 ) {
 const room = await db.room.findUnique({ where: { id: body.roomId } });
 if (!room) throw new ApiError(404, "Room not found");
 if (room.departmentId !== departmentId)
 throw new ApiError(403, "Resource belongs to another department");
 data.roomId = room.id;
 data.roomNumber = room.roomNumber;
 }
 if (
 typeof body.teacherId === "string" &&
 body.teacherId &&
 body.teacherId !== existing.teacherId
 ) {
 const teacher = await db.user.findUnique({ where: { id: body.teacherId } });
 if (!teacher) throw new ApiError(404, "Teacher not found");
 if (teacher.departmentId !== departmentId)
 throw new ApiError(403, "Resource belongs to another department");
 if (teacher.role !== "teacher" || !teacher.isActive)
 throw new ApiError(400, "Selected assignee must be an active teacher");
 data.teacherId = teacher.id;
 data.teacherName = teacher.fullName;
 }
 if (
 typeof body.courseId === "string" &&
 body.courseId &&
 body.courseId !== existing.courseId
 ) {
 const course = await db.course.findUnique({ where: { id: body.courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 if (course.departmentId !== departmentId)
 throw new ApiError(403, "Resource belongs to another department");
 data.courseId = course.id;
 data.courseCode = course.code;
 data.courseName = course.name;
 data.classType = course.type;
 }
 if (body.programId !== undefined && data.programId !== undefined) {
 if (!data.programId)
 throw new ApiError(400, "Program is required for a schedule");
 const program = await db.program.findUnique({
 where: { id: String(data.programId) },
 });
 if (!program) throw new ApiError(404, "Program not found");
 if (program.departmentId !== departmentId)
 throw new ApiError(403, "Resource belongs to another department");
 data.programId = program.id;
 }
 if (data.dayOfWeek !== undefined && !VALID_DAYS.has(String(data.dayOfWeek))) {
 throw new ApiError(400, "Invalid day of week");
 }

 // Clash re-check must see the NEW room/teacher values, not just the
 // existing row's — and compare *overlapping time windows*, not slot ids.
 // It runs when ANY of the fields the clashes depend on changes
 // (day/slot/room/teacher/semester/program), not just day+slot.
 const day = (data.dayOfWeek as string) ?? existing.dayOfWeek;
 const timeSlotId = (data.timeSlotId as string) ?? existing.timeSlotId;
 const changed = (field: string) =>
 data[field] !== undefined && data[field] !== existing[field as keyof typeof existing];
 if (
 changed("dayOfWeek") ||
 changed("timeSlotId") ||
 changed("roomId") ||
 changed("teacherId") ||
 changed("semester") ||
 changed("programId")
 ) {
 const sameDay = await db.schedule.findMany({
 where: {
 departmentId,
 dayOfWeek: day,
 isActive: true,
 id: { not: id },
 },
 });
 const roomId = (data.roomId as string) ?? existing.roomId;
 const teacherId = (data.teacherId as string) ?? existing.teacherId;
 // Batch clash (mirrors POST): two classes for the same program+semester
 // cannot share a window even when room and teacher are free.
 const programId = (data.programId as string) ?? existing.programId;
 const sem = (data.semester as number) ?? existing.semester;
 const effStart = (data.startTime as string) ?? existing.startTime;
 const effEnd = (data.endTime as string) ?? existing.endTime;
 const clash = sameDay.find(
 (s) =>
 (s.roomId === roomId ||
 s.teacherId === teacherId ||
 (s.programId === programId && s.semester === sem)) &&
 windowsOverlap(s.startTime, s.endTime, effStart, effEnd, s.timeSlotId === timeSlotId)
 );
 if (clash)
 throw new ApiError(
 409,
 `Conflict with ${clash.courseCode} (${clash.teacherName}) at this time`
 );
 }
 const updatedSchedule = await db.schedule.update({ where: { id }, data });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(departmentId),
 departmentId,
 action: "update",
 entity: "schedule",
 entityId: updatedSchedule.id,
 entityLabel: updatedSchedule.courseCode,
 detail: `fields=${Object.keys(data).join(",")}`,
 });
 return updatedSchedule;
 }
 default:
 throw new ApiError(400, "Cannot update this entity");
 }
 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;
 const entity = raw as Entity;
 return handle(async () => {
 const session = await requireRole("super_admin", "dept_admin");
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id query param is required");

 switch (entity) {
 case "teachers":
 case "students": {
 const user = await db.user.findUnique({ where: { id } });
 if (!user) throw new ApiError(404, "User not found");
 // REALITY CHECK: super admins anchor the platform and you must not be
 // able to lock yourself out of the panel with one misclick.
 if (user.role === "super_admin") {
 throw new ApiError(403, "Super admin accounts cannot be deleted here");
 }
 if (user.id === session.userId) {
 throw new ApiError(400, "You cannot delete your own account");
 }
 await assertDeptAccess(session, user.departmentId!);
 // Soft-delete: schedules/results/attendance reference users, so a
 // hard delete would either cascade-wipe history or fail with a 500.
 await db.user.update({ where: { id }, data: { isActive: false } });
 await logAdminAction({
 ...auditActor(session),
 universityId: user.universityId,
 departmentId: user.departmentId,
 action: "deactivate",
 entity: user.role,
 entityId: user.id,
 entityLabel: user.email ?? user.fullName,
 detail: "soft delete (isActive=false)",
 });
 return { deleted: true, deactivated: true };
 }
 case "courses": {
 const c = await db.course.findUnique({ where: { id } });
 if (!c) throw new ApiError(404, "Course not found");
 await assertDeptAccess(session, c.departmentId);
 const [scheduleCount, assignmentCount, resultCount] = await Promise.all([
 db.schedule.count({ where: { courseId: id } }),
 db.assignment.count({ where: { courseId: id } }),
 db.result.count({ where: { courseId: id } }),
 ]);
 await assertNotReferenced([
 { label: "schedule(s)", count: scheduleCount },
 { label: "assignment(s)", count: assignmentCount },
 { label: "result(s)", count: resultCount },
 ]);
 await db.course.delete({ where: { id } });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(c.departmentId),
 departmentId: c.departmentId,
 action: "delete",
 entity: "course",
 entityId: id,
 entityLabel: c.code,
 });
 return { deleted: true };
 }
 case "rooms": {
 const r = await db.room.findUnique({ where: { id } });
 if (!r) throw new ApiError(404, "Room not found");
 await assertDeptAccess(session, r.departmentId);
 const scheduleCount = await db.schedule.count({ where: { roomId: id } });
 await assertNotReferenced([{ label: "schedule(s)", count: scheduleCount }]);
 await db.room.delete({ where: { id } });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(r.departmentId),
 departmentId: r.departmentId,
 action: "delete",
 entity: "room",
 entityId: id,
 entityLabel: r.roomNumber,
 });
 return { deleted: true };
 }
 case "timeslots": {
 const t = await db.timeSlot.findUnique({ where: { id } });
 if (!t) throw new ApiError(404, "Time slot not found");
 await assertDeptAccess(session, t.departmentId);
 const scheduleCount = await db.schedule.count({ where: { timeSlotId: id } });
 await assertNotReferenced([{ label: "schedule(s)", count: scheduleCount }]);
 await db.timeSlot.delete({ where: { id } });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(t.departmentId),
 departmentId: t.departmentId,
 action: "delete",
 entity: "timeslot",
 entityId: id,
 entityLabel: t.label,
 });
 return { deleted: true };
 }
 case "programs": {
 const p = await db.program.findUnique({ where: { id } });
 if (!p) throw new ApiError(404, "Program not found");
 await assertDeptAccess(session, p.departmentId);
 const [scheduleCount, courseCount, studentCount] = await Promise.all([
 db.schedule.count({ where: { programId: id } }),
 db.course.count({ where: { programId: id } }),
 db.user.count({ where: { programId: id } }),
 ]);
 await assertNotReferenced([
 { label: "schedule(s)", count: scheduleCount },
 { label: "course(s)", count: courseCount },
 { label: "student(s)", count: studentCount },
 ]);
 await db.program.delete({ where: { id } });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(p.departmentId),
 departmentId: p.departmentId,
 action: "delete",
 entity: "program",
 entityId: id,
 entityLabel: p.name,
 });
 return { deleted: true };
 }
 case "notices": {
 const n = await db.notice.findUnique({ where: { id } });
 if (!n) throw new ApiError(404, "Notice not found");
 await assertDeptAccess(session, n.departmentId);
 await db.notice.delete({ where: { id } });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(n.departmentId),
 departmentId: n.departmentId,
 action: "delete",
 entity: "notice",
 entityId: id,
 entityLabel: n.title,
 });
 return { deleted: true };
 }
 case "schedules": {
 const s = await db.schedule.findUnique({ where: { id } });
 if (!s) throw new ApiError(404, "Schedule not found");
 await assertDeptAccess(session, s.departmentId);
 // A schedule delete would cascade-wipe its attendance history and QR
 // sessions — the permanent record must survive routine housekeeping.
 const [attendanceCount, sessionCount] = await Promise.all([
 db.attendance.count({ where: { scheduleId: id } }),
 db.attendanceSession.count({ where: { scheduleId: id } }),
 ]);
 await assertNotReferenced([
 { label: "attendance record(s)", count: attendanceCount },
 { label: "QR session(s)", count: sessionCount },
 ]);
 await db.scheduleChange.deleteMany({ where: { scheduleId: id } });
 await db.schedule.delete({ where: { id } });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(s.departmentId),
 departmentId: s.departmentId,
 action: "delete",
 entity: "schedule",
 entityId: id,
 entityLabel: s.courseCode,
 });
 return { deleted: true };
 }
 case "sessions": {
 // Force-close a live QR window in the department — the dept head's
 // kill-switch for a rogue/forgotten window (same flag the natural
 // expiry sets; the teacher's own finalize still computes absentees).
 const s = await db.attendanceSession.findUnique({
 where: { id },
 select: { departmentId: true, closed: true },
 });
 if (!s) throw new ApiError(404, "Attendance session not found");
 await assertDeptAccess(session, s.departmentId);
 if (s.closed) return { closed: true, already: true };
 await db.attendanceSession.update({
 where: { id },
 data: { closed: true },
 });
 await logAdminAction({
 ...auditActor(session),
 universityId: await resolveUniversityId(s.departmentId),
 departmentId: s.departmentId,
 action: "force_close",
 entity: "session",
 entityId: id,
 detail: "QR window force-closed by department head",
 });
 return { closed: true };
 }
 default:
 throw new ApiError(400, "Cannot delete this entity");
 }
 });
}
