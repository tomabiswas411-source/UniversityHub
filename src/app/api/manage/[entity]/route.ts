import { NextRequest } from "next/server";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError, type SessionPayload } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { gradeDistribution, passRate, resultPct } from "@/lib/grades";

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
 }),
 db.user.findMany({
 where: { departmentId, role: "student" },
 include: { program: { select: { shortName: true } } },
 orderBy: { rollNumber: "asc" },
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
 return { teachers, students, courses, rooms, timeSlots, programs, notices, schedules };
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
 const dayMap: Record<string, string> = {
 saturday: "saturday",
 sunday: "sunday",
 monday: "monday",
 tuesday: "tuesday",
 wednesday: "wednesday",
 thursday: "thursday",
 };
 const today = dayMap[
 new Date()
 .toLocaleDateString("en-US", { weekday: "long" })
 .toLowerCase()
 ];
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
 const [results, schedulesForLoad, studentsForDist, coursesInfo, recentChanges, noticesCount, attendanceRows] =
 await Promise.all([
 db.result.findMany({
 where: { departmentId },
 select: { marks: true, maxMarks: true, examType: true, createdAt: true },
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
 db.attendance.findMany({
 where: { departmentId },
 select: { status: true, courseId: true, courseCode: true },
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

 // ---------- Attendance analytics ----------
 const attCounts = { present: 0, absent: 0, late: 0, excused: 0 };
 const attByCourse = new Map<
 string,
 { courseCode: string; present: number; late: number; absent: number; excused: number }
 >();
 for (const a of attendanceRows) {
 if (a.status === "present") attCounts.present++;
 else if (a.status === "absent") attCounts.absent++;
 else if (a.status === "late") attCounts.late++;
 else if (a.status === "excused") attCounts.excused++;
 const cur =
 attByCourse.get(a.courseId) ??
 { courseCode: a.courseCode, present: 0, late: 0, absent: 0, excused: 0 };
 if (a.status === "present") cur.present++;
 else if (a.status === "absent") cur.absent++;
 else if (a.status === "late") cur.late++;
 else if (a.status === "excused") cur.excused++;
 attByCourse.set(a.courseId, cur);
 }
 const attCounted = attCounts.present + attCounts.late + attCounts.absent;
 const attendanceAnalytics = {
 hasData: attendanceRows.length > 0,
 rate: attCounted === 0 ? 0 : Math.round(((attCounts.present + attCounts.late) / attCounted) * 100),
 totalMarked: attendanceRows.length,
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
 return db.user.findMany({
 where: { departmentId, role: "teacher" },
 orderBy: { fullName: "asc" },
 });

 case "students":
 return db.user.findMany({
 where: { departmentId, role: "student" },
 include: { program: { select: { shortName: true, name: true } } },
 orderBy: { rollNumber: "asc" },
 });

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
 const existing = await db.user.findFirst({
 where: { universityId: session.universityId, email },
 });
 if (existing)
 throw new ApiError(409, "A user with this email already exists");
 const hashed = await hashPassword(password);
 return db.user.create({
 data: {
 universityId: session.universityId!,
 departmentId,
 role: "teacher",
 fullName,
 email,
 password: hashed,
 designation: designation || "Lecturer",
 phone,
 officeRoom,
 bio,
 },
 });
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
 const existing = await db.user.findFirst({
 where: { universityId: session.universityId, studentIdNumber: String(studentIdNumber) },
 });
 if (existing)
 throw new ApiError(409, "A student with this ID number already exists");
 return db.user.create({
 data: {
 universityId: session.universityId!,
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
 return db.notice.create({
 data: {
 departmentId,
 title: String(title),
 content: String(content),
 category: String(category) || "general",
 audience: String(audience) || "all",
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

 const [course, teacher, room, timeSlot] = await Promise.all([
 db.course.findUnique({ where: { id: String(courseId) } }),
 db.user.findUnique({ where: { id: String(teacherId) } }),
 db.room.findUnique({ where: { id: String(roomId) } }),
 db.timeSlot.findUnique({ where: { id: String(timeSlotId) } }),
 ]);
 if (!course || !teacher || !room || !timeSlot)
 throw new ApiError(404, "Invalid course, teacher, room or time slot");

 // Conflict detection: room, teacher, batch at same day+slot
 const sameSlot = await db.schedule.findMany({
 where: {
 departmentId,
 dayOfWeek: String(dayOfWeek),
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
 (s) => s.programId === String(programId) && s.semester === Number(semester)
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
 programId: String(programId),
 semester: Number(semester) || 1,
 courseCode: course.code,
 courseName: course.name,
 teacherName: teacher.fullName,
 roomNumber: room.roomNumber,
 startTime: timeSlot.startTime,
 endTime: timeSlot.endTime,
 dayOfWeek: String(dayOfWeek),
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
 case "students":
 if (typeof body.password === "string" && body.password.length >= 4) {
 data.password = await hashPassword(body.password);
 }
 return db.user.update({ where: { id }, data });
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
 const day = (data.dayOfWeek as string) ?? existing.dayOfWeek;
 const timeSlotId =
 (data.timeSlotId as string) ?? existing.timeSlotId;
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
 const clash = sameSlot.find(
 (s) => s.roomId === roomId || s.teacherId === existing.teacherId
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
 return db.user.delete({ where: { id } });
 }
 case "courses": {
 const c = await db.course.findUnique({ where: { id } });
 if (!c) throw new ApiError(404, "Course not found");
 await assertDeptAccess(session, c.departmentId);
 await db.course.delete({ where: { id } });
 return { deleted: true };
 }
 case "rooms": {
 const r = await db.room.findUnique({ where: { id } });
 if (!r) throw new ApiError(404, "Room not found");
 await assertDeptAccess(session, r.departmentId);
 await db.room.delete({ where: { id } });
 return { deleted: true };
 }
 case "timeslots": {
 const t = await db.timeSlot.findUnique({ where: { id } });
 if (!t) throw new ApiError(404, "Time slot not found");
 await assertDeptAccess(session, t.departmentId);
 await db.timeSlot.delete({ where: { id } });
 return { deleted: true };
 }
 case "programs": {
 const p = await db.program.findUnique({ where: { id } });
 if (!p) throw new ApiError(404, "Program not found");
 await assertDeptAccess(session, p.departmentId);
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
