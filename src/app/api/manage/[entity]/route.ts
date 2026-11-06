import { NextRequest } from "next/server";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError, type SessionPayload } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { gradeDistribution, passRate, resultPct } from "@/lib/grades";
import { bdWeekday } from "@/lib/date-bd";
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

/**
 * Plan-cap guard (fix 8e): counts ACTIVE rows with the same isActive
 * semantics as the rows about to be created; -1 = unlimited.
 */
async function assertPlanLimit(
 universityId: string,
 cap: "maxDepartments" | "maxTeachers" | "maxStudents",
 thing: string
): Promise<void> {
 const uni = await db.university.findUnique({
 where: { id: universityId },
 select: {
 plan: { select: { maxDepartments: true, maxTeachers: true, maxStudents: true } },
 },
 });
 const limit = uni?.plan?.[cap] ?? -1;
 if (limit < 0) return; // -1 = unlimited
 const activeCount =
 cap === "maxDepartments"
 ? await db.department.count({ where: { universityId, isActive: true } })
 : await db.user.count({
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
 */
async function assertProgramInDepartment(
 programId: string,
 departmentId: string
): Promise<void> {
 const program = await db.program.findUnique({ where: { id: programId } });
 if (!program) throw new ApiError(404, "Program not found");
 if (program.departmentId !== departmentId)
 throw new ApiError(403, "Program belongs to another department");
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
] as const;
type Entity = (typeof ENTITIES)[number];

export async function GET(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;
 const entity = raw as Entity;
 if (!ENTITIES.includes(entity)) return badRequest("Unknown entity");

 return handle(async () => {
 const session = await requireSession();
 if (!["super_admin", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Management access required");
 }

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
 }),
 db.room.findMany({ where: { departmentId }, orderBy: { roomNumber: "asc" } }),
 db.timeSlot.findMany({ where: { departmentId }, orderBy: { slotOrder: "asc" } }),
 db.program.findMany({ where: { departmentId }, orderBy: { shortName: "asc" } }),
 db.notice.findMany({
 where: { departmentId },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 50,
 }),
 db.schedule.findMany({
 where: { departmentId, isActive: true },
 orderBy: { startTime: "asc" },
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
 const [results, schedulesForLoad, studentsForDist, coursesInfo, recentChanges, noticesCount, attendanceGroups] =
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
 });

 case "rooms":
 return db.room.findMany({
 where: { departmentId },
 orderBy: { roomNumber: "asc" },
 });

 case "timeslots":
 return db.timeSlot.findMany({
 where: { departmentId },
 orderBy: { slotOrder: "asc" },
 });

 case "programs":
 return db.program.findMany({
 where: { departmentId },
 orderBy: { shortName: "asc" },
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
 }
 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;
 const entity = raw as Entity;
 if (!ENTITIES.includes(entity)) return badRequest("Unknown entity");

 return handle(async () => {
 const session = await requireSession();
 if (!["super_admin", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Management access required");
 }
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
 if (password.length < 6)
 throw new ApiError(400, "Password must be at least 6 characters");
 // universityId comes from the department row so a super_admin can
 // provision any department without creating an orphaned user.
 const universityId = await resolveUniversityId(departmentId);
 await assertPlanLimit(universityId, "maxTeachers", "teachers");
 const existing = await db.user.findFirst({
 where: { universityId, email: emailNorm },
 });
 if (existing)
 throw new ApiError(409, "A user with this email already exists");
 const hashed = await hashPassword(password);
 const created = await db.user.create({
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
 await assertPlanLimit(universityId, "maxStudents", "students");
 if (programId) {
 await assertProgramInDepartment(String(programId), departmentId);
 }
 const existing = await db.user.findFirst({
 where: { universityId, studentIdNumber: String(studentIdNumber) },
 });
 if (existing)
 throw new ApiError(409, "A student with this ID number already exists");
 const created = await db.user.create({
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
 return stripPassword(created);
 }

 case "courses": {
 const { code, name, creditHours, type, semester, programId } =
 body as Record<string, string | number>;
 if (!code || !name || !programId)
 throw new ApiError(400, "Code, name and program are required");
 // Tenant guard: the course's program must live in THIS department.
 await assertProgramInDepartment(String(programId), departmentId);
 return db.course.create({
 data: {
 departmentId,
 programId: String(programId),
 code: String(code),
 name: String(name),
 creditHours: Number(creditHours) || 3,
 type: String(type) || "theory",
 semester: Number(semester) || 1,
 },
 });
 }

 case "rooms": {
 const { roomNumber, building, type, capacity } =
 body as Record<string, string | number>;
 if (!roomNumber) throw new ApiError(400, "Room number is required");
 return db.room.create({
 data: {
 departmentId,
 roomNumber: String(roomNumber),
 building: building ? String(building) : null,
 type: String(type) || "classroom",
 capacity: Number(capacity) || 40,
 },
 });
 }

 case "timeslots": {
 const { label, startTime, endTime, slotOrder, isBreak } =
 body as Record<string, string | number | boolean>;
 if (!label || !startTime || !endTime)
 throw new ApiError(400, "Label, start and end time are required");
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
 return db.program.create({
 data: {
 departmentId,
 name: String(name),
 shortName: String(shortName),
 semesterCount: Number(semesterCount) || 8,
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
 return db.notice.create({
 data: {
 departmentId,
 title: cleanStr(title, 150),
 content: cleanStr(content, 5000),
 category: String(category) || "general",
 audience: audienceVal,
 programId: programId ? String(programId) : null,
 semester: semester ? Number(semester) : null,
 isPinned: Boolean(isPinned),
 postedBy: session.userId,
 postedByName: session.name,
 },
 });
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

 default:
 throw new ApiError(400, "Cannot create this entity");
 }
 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
 const { entity: raw } = await ctx.params;
 const entity = raw as Entity;
 return handle(async () => {
 const session = await requireSession();
 if (!["super_admin", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Management access required");
 }
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
 // Student PUT applies the same semester validation POST uses.
 if (entity === "students" && data.semester !== undefined) {
 validateSemester(data.semester);
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

 switch (entity) {
 case "teachers":
 case "students": {
 // Password policy: "" → skip (leave unchanged); <6 chars → 400;
 // 6+ → hash. (Previously short passwords were silently ignored.)
 if (typeof body.password === "string") {
 if (body.password.length === 0) {
 // empty string → skip password change
 } else if (body.password.length < 6) {
 throw new ApiError(400, "Password must be at least 6 characters");
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
 const clash = await db.user.findFirst({
 where: {
 email: emailNorm,
 universityId: target?.universityId ?? null,
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
 return stripPassword(updated);
 }
 case "courses": {
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
 return updated;
 }
 case "programs":
 return db.program.update({ where: { id }, data });
 case "notices": {
 if (data.programId) {
 await assertProgramInDepartment(String(data.programId), departmentId);
 }
 return db.notice.update({ where: { id }, data });
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
 const effStart = (data.startTime as string) ?? existing.startTime;
 const effEnd = (data.endTime as string) ?? existing.endTime;
 const clash = sameDay.find(
 (s) =>
 (s.roomId === roomId || s.teacherId === teacherId) &&
 windowsOverlap(s.startTime, s.endTime, effStart, effEnd, s.timeSlotId === timeSlotId)
 );
 if (clash)
 throw new ApiError(
 409,
 `Conflict with ${clash.courseCode} (${clash.teacherName}) at this time`
 );
 }
 return db.schedule.update({ where: { id }, data });
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
 const session = await requireSession();
 if (!["super_admin", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Management access required");
 }
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
 return { deleted: true };
 }
 case "rooms": {
 const r = await db.room.findUnique({ where: { id } });
 if (!r) throw new ApiError(404, "Room not found");
 await assertDeptAccess(session, r.departmentId);
 const scheduleCount = await db.schedule.count({ where: { roomId: id } });
 await assertNotReferenced([{ label: "schedule(s)", count: scheduleCount }]);
 await db.room.delete({ where: { id } });
 return { deleted: true };
 }
 case "timeslots": {
 const t = await db.timeSlot.findUnique({ where: { id } });
 if (!t) throw new ApiError(404, "Time slot not found");
 await assertDeptAccess(session, t.departmentId);
 const scheduleCount = await db.schedule.count({ where: { timeSlotId: id } });
 await assertNotReferenced([{ label: "schedule(s)", count: scheduleCount }]);
 await db.timeSlot.delete({ where: { id } });
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
 return { deleted: true };
 }
 case "notices": {
 const n = await db.notice.findUnique({ where: { id } });
 if (!n) throw new ApiError(404, "Notice not found");
 await assertDeptAccess(session, n.departmentId);
 await db.notice.delete({ where: { id } });
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
 return { deleted: true };
 }
 default:
 throw new ApiError(400, "Cannot delete this entity");
 }
 });
}
