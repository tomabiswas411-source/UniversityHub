import { NextRequest } from "next/server";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError, type SessionPayload } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { gradeDistribution, passRate, resultPct } from "@/lib/grades";
import { bdWeekday } from "@/lib/date-bd";

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
 });

 case "schedules":
 return db.schedule.findMany({
 where: { departmentId },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
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
 if (password.length < 4)
 throw new ApiError(400, "Password must be at least 4 characters");
 // universityId comes from the department row so a super_admin can
 // provision any department without creating an orphaned user.
 const universityId = await resolveUniversityId(departmentId);
 const emailNorm = email.trim().toLowerCase();
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
 fullName,
 email: emailNorm,
 password: hashed,
 designation: designation || "Lecturer",
 phone,
 officeRoom,
 bio,
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
 fullName: String(fullName),
 studentIdNumber: String(studentIdNumber),
 rollNumber: String(rollNumber),
 programId: programId ? String(programId) : null,
 semester: semester ? Number(semester) : null,
 section: section ? String(section) : null,
 phone: phone ? String(phone) : null,
 },
 });
 return stripPassword(created);
 }

 case "courses": {
 const { code, name, creditHours, type, semester, programId } =
 body as Record<string, string | number>;
 if (!code || !name || !programId)
 throw new ApiError(400, "Code, name and program are required");
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
 return db.notice.create({
 data: {
 departmentId,
 title: String(title),
 content: String(content),
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

 // Conflict detection: room, teacher, batch at same day+slot
 const sameSlot = await db.schedule.findMany({
 where: {
 departmentId,
 dayOfWeek: day,
 timeSlotId: String(timeSlotId),
 isActive: true,
 },
 });
 const roomClash = sameSlot.find((s) => s.roomId === room.id);
 if (roomClash)
 throw new ApiError(
 409,
 `Room ${room.roomNumber} is occupied (${roomClash.courseCode}) at this time`
 );
 const teacherClash = sameSlot.find((s) => s.teacherId === teacher.id);
 if (teacherClash)
 throw new ApiError(
 409,
 `${teacher.fullName} already has ${teacherClash.courseCode} at this time`
 );
 const batchClash = sameSlot.find(
 (s) => s.programId === program.id && s.semester === Number(semester)
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
 semester: Number(semester) || 1,
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

 const data: Record<string, unknown> = {};
 const stringFields = [
 "fullName", "designation", "phone", "officeRoom", "bio", "section",
 "code", "name", "type", "building", "label", "startTime", "endTime",
 "title", "content", "category", "audience", "dayOfWeek", "studentIdNumber",
 "rollNumber", "shortName",
 ];
 for (const f of stringFields) {
 if (body[f] !== undefined && body[f] !== null) data[f] = String(body[f]);
 }
 const numberFields = [
 "semester", "capacity", "slotOrder", "creditHours", "semesterCount",
 ];
 for (const f of numberFields) {
 if (body[f] !== undefined && body[f] !== null && body[f] !== "")
 data[f] = Number(body[f]);
 }
 if (body.programId !== undefined)
 data.programId = body.programId ? String(body.programId) : null;
 if (body.isPinned !== undefined) data.isPinned = Boolean(body.isPinned);
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

 switch (entity) {
 case "teachers":
 case "students": {
 // Password policy: "" → skip (leave unchanged); 1-3 chars → 400;
 // 4+ → hash. (Previously short passwords were silently ignored.)
 if (typeof body.password === "string") {
 if (body.password.length === 0) {
 // empty string → skip password change
 } else if (body.password.length < 4) {
 throw new ApiError(400, "Password must be at least 4 characters");
 } else {
 data.password = await hashPassword(body.password);
 }
 }
 // Email updates: normalize + per-university uniqueness.
 if (typeof body.email === "string" && body.email.trim()) {
 const emailNorm = body.email.trim().toLowerCase();
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
 const updated = await db.user.update({ where: { id }, data });
 return stripPassword(updated);
 }
 case "courses":
 return db.course.update({ where: { id }, data });
 case "rooms":
 return db.room.update({ where: { id }, data });
 case "timeslots":
 return db.timeSlot.update({ where: { id }, data });
 case "programs":
 return db.program.update({ where: { id }, data });
 case "notices":
 return db.notice.update({ where: { id }, data });
 case "schedules": {
 // If slot/day changed, re-run conflict detection
 const existing = await db.schedule.findUnique({ where: { id } });
 if (!existing) throw new ApiError(404, "Schedule not found");

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
 // existing row's.
 const day = (data.dayOfWeek as string) ?? existing.dayOfWeek;
 const timeSlotId = (data.timeSlotId as string) ?? existing.timeSlotId;
 if (
 (data.timeSlotId && data.timeSlotId !== existing.timeSlotId) ||
 (data.dayOfWeek && data.dayOfWeek !== existing.dayOfWeek)
 ) {
 const sameSlot = await db.schedule.findMany({
 where: {
 departmentId,
 dayOfWeek: day,
 timeSlotId,
 isActive: true,
 id: { not: id },
 },
 });
 const roomId = (data.roomId as string) ?? existing.roomId;
 const teacherId = (data.teacherId as string) ?? existing.teacherId;
 const clash = sameSlot.find(
 (s) => s.roomId === roomId || s.teacherId === teacherId
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
 await db.scheduleChange.deleteMany({ where: { scheduleId: id } });
 await db.schedule.delete({ where: { id } });
 return { deleted: true };
 }
 default:
 throw new ApiError(400, "Cannot delete this entity");
 }
 });
}
