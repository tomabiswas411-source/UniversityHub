import { NextRequest } from "next/server";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { assertDepartmentAccess } from "@/lib/auth";
import { percentToGrade, resultPct } from "@/lib/grades";

/**
 * Teacher actions API.
 * GET /api/teacher/overview → own schedules + courses + stats
 * GET /api/teacher/attendance?scheduleId=&date= → roster + existing marks
 * POST /api/teacher/attendance → bulk save (upsert per student)
 * GET /api/teacher/notices → own posted notices
 * POST /api/teacher/notices → publish (optional course scope + fan-out)
 * DELETE /api/teacher/notices?id=
 * GET /api/teacher/assignments?courseId= → list
 * POST /api/teacher/assignments → create
 * PUT /api/teacher/assignments?id= → update
 * DELETE /api/teacher/assignments?id=
 * GET /api/teacher/results?courseId=&examType= → results for a course
 * POST /api/teacher/results → bulk save
 * POST /api/teacher/class-change → cancel/reschedule/room/extra + auto notice + fan-out
 */

const ATT_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttStatus = (typeof ATT_STATUSES)[number];

function isAttStatus(v: unknown): v is AttStatus {
  return typeof v === "string" && (ATT_STATUSES as readonly string[]).includes(v);
}
type Ctx = { params: Promise<{ action: string }> };

const DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];

function todayStr(): string {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (!["teacher", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Teacher access required");
 }
 const { searchParams } = new URL(req.url);

 if (action === "insights") {
 // Day 42 — teacher performance insights
 const [myResults, myAssignments, mySchedules] = await Promise.all([
 db.result.findMany({
 where: { enteredBy: session.userId },
 include: {
 course: { select: { code: true, name: true, creditHours: true } },
 student: { select: { fullName: true, rollNumber: true } },
 },
 orderBy: { createdAt: "desc" },
 take: 500,
 }),
 db.assignment.findMany({
 where: { teacherId: session.userId, isActive: true },
 select: { id: true, courseId: true, title: true, dueDate: true },
 }),
 db.schedule.findMany({
 where: { teacherId: session.userId, isActive: true },
 select: { id: true, courseId: true, dayOfWeek: true },
 }),
 ]);

 // Group results by course
 const byCourse = new Map<
 string,
 {
 courseCode: string;
 courseName: string;
 creditHours: number;
 results: { marks: number; maxMarks: number; examType: string; studentName: string; rollNumber: string | null }[];
 }
 >();
 for (const r of myResults) {
 const key = r.courseId;
 const cur =
 byCourse.get(key) ??
 {
 courseCode: r.course?.code ?? "—",
 courseName: r.course?.name ?? "",
 creditHours: r.course?.creditHours ?? 3,
 results: [],
 };
 cur.results.push({
 marks: r.marks,
 maxMarks: r.maxMarks,
 examType: r.examType,
 studentName: r.student?.fullName ?? "Unknown",
 rollNumber: r.student?.rollNumber ?? null,
 });
 byCourse.set(key, cur);
 }

 const courseStats = [...byCourse.entries()].map(([courseId, c]) => {
 const avg =
 Math.round(
 (c.results.reduce((a, r) => a + resultPct(r), 0) / c.results.length) * 10
 ) / 10;
 const examTypes = ["ct1", "ct2", "midterm", "final", "assignment"];
 const examBreakdown = examTypes
 .map((t) => {
 const rs = c.results.filter((r) => r.examType === t);
 return {
 examType: t,
 count: rs.length,
 avgPct: rs.length
 ? Math.round((rs.reduce((a, r) => a + resultPct(r), 0) / rs.length) * 10) / 10
 : 0,
 };
 })
 .filter((e) => e.count > 0);

 // Per-student averages within this course (keyed by roll+name so
 // two students sharing a name are never merged)
 const perStudent = new Map<
 string,
 { name: string; roll: string | null; pcts: number[] }
 >();
 for (const r of c.results) {
 const key = `${r.rollNumber ?? "—"}|${r.studentName}`;
 const cur = perStudent.get(key) ?? { name: r.studentName, roll: r.rollNumber, pcts: [] };
 cur.pcts.push(resultPct(r));
 perStudent.set(key, cur);
 }
 const studentAvgs = [...perStudent.values()]
 .map((s) => ({
 name: s.name,
 roll: s.roll,
 avgPct: Math.round((s.pcts.reduce((a, b) => a + b, 0) / s.pcts.length) * 10) / 10,
 }))
 .sort((a, b) => b.avgPct - a.avgPct);

 const band = percentToGrade(avg);
 return {
 courseId,
 courseCode: c.courseCode,
 courseName: c.courseName,
 creditHours: c.creditHours,
 totalEntries: c.results.length,
 avgPct: avg,
 grade: band.letter,
 gpaPoint: band.gpa,
 examBreakdown,
 topStudents: studentAvgs.filter((s) => s.avgPct >= 70).slice(0, 5),
 atRiskStudents: studentAvgs
 .filter((s) => s.avgPct < 40)
 .sort((a, b) => a.avgPct - b.avgPct)
 .slice(0, 10),
 };
 });
 courseStats.sort((a, b) => b.totalEntries - a.totalEntries);

 // Assignments per course + upcoming deadlines
 const upcomingAssignments = myAssignments
 .filter((a) => a.dueDate && new Date(a.dueDate).getTime() > Date.now())
 .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
 .slice(0, 5)
 .map((a) => ({
 id: a.id,
 title: a.title,
 dueDate: a.dueDate?.toISOString() ?? null,
 }));

 const weeklyLoad = DAYS.map((d) => ({
 label: d.charAt(0).toUpperCase() + d.slice(1, 3),
 value: mySchedules.filter((s) => s.dayOfWeek === d).length,
 }));

 return {
 hasData: myResults.length > 0 || courseStats.length > 0,
 totalEntries: myResults.length,
 courseCount: courseStats.length,
 assignmentCount: myAssignments.length,
 weeklyLoad,
 courseStats,
 upcomingAssignments,
 };
 }

 if (action === "attendance") {
 const scheduleId = searchParams.get("scheduleId");
 const date = searchParams.get("date") ?? todayStr();
 if (!scheduleId) throw new ApiError(400, "scheduleId is required");
 const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
 if (!schedule) throw new ApiError(404, "Schedule not found");
 if (session.role === "teacher" && schedule.teacherId !== session.userId) {
 throw new ApiError(403, "You can only take attendance for your own classes");
 }
 assertDepartmentAccess(session, schedule.departmentId);

 const [students, existing, history] = await Promise.all([
 db.user.findMany({
 where: {
 departmentId: schedule.departmentId,
 role: "student",
 isActive: true,
 programId: schedule.programId,
 semester: schedule.semester,
 },
 select: { id: true, fullName: true, rollNumber: true, studentIdNumber: true },
 orderBy: { rollNumber: "asc" },
 }),
 db.attendance.findMany({
 where: { scheduleId, date },
 select: { studentId: true, status: true },
 }),
 db.attendance.findMany({
 where: { scheduleId, date: { not: date } },
 select: { date: true },
 distinct: ["date"],
 orderBy: { date: "desc" },
 take: 5,
 }),
 ]);
 const existingMap: Record<string, string> = {};
 for (const e of existing) existingMap[e.studentId] = e.status;
 return {
 schedule: {
 id: schedule.id,
 courseId: schedule.courseId,
 courseCode: schedule.courseCode,
 courseName: schedule.courseName,
 startTime: schedule.startTime,
 endTime: schedule.endTime,
 dayOfWeek: schedule.dayOfWeek,
 programId: schedule.programId,
 semester: schedule.semester,
 },
 students,
 existing: existingMap,
 markedCount: existing.length,
 recentDates: history.map((h) => h.date),
 };
 }

 if (action === "attendance-export") {
 // COST GUARD: CSV is built server-side as plain text and returned as
 // one small JSON string — client turns it into a .csv Blob download.
 // Excel opens it directly (UTF-8 BOM added client-side for Bangla names).
 const scheduleId = searchParams.get("scheduleId");
 const date = searchParams.get("date") ?? todayStr();
 if (!scheduleId) throw new ApiError(400, "scheduleId is required");
 const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
 if (!schedule) throw new ApiError(404, "Schedule not found");
 if (session.role === "teacher" && schedule.teacherId !== session.userId) {
 throw new ApiError(403, "You can only export your own classes");
 }
 assertDepartmentAccess(session, schedule.departmentId);

 const [students, marks] = await Promise.all([
 db.user.findMany({
 where: {
 departmentId: schedule.departmentId,
 role: "student",
 isActive: true,
 programId: schedule.programId,
 semester: schedule.semester,
 },
 select: { id: true, fullName: true, rollNumber: true, studentIdNumber: true },
 orderBy: { rollNumber: "asc" },
 }),
 db.attendance.findMany({
 where: { scheduleId, date },
 select: { studentId: true, status: true, markedByName: true, updatedAt: true },
 }),
 ]);
 const markMap = new Map(marks.map((m) => [m.studentId, m]));
 const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

 const lines: string[] = [
 ["Roll", "Student ID", "Name", "Status", "Marked By", "Marked At"].join(","),
 ];
 for (const st of students) {
 const m = markMap.get(st.id);
 lines.push(
 [
 st.rollNumber ?? "",
 esc(st.studentIdNumber ?? ""),
 esc(st.fullName),
 m ? m.status.toUpperCase() : "NOT_MARKED",
 m ? esc(m.markedByName ?? "") : "",
 m ? m.updatedAt.toISOString() : "",
 ].join(",")
 );
 }

 return {
 filename: `attendance-${schedule.courseCode}-${date}.csv`,
 csv: lines.join("\n"),
 total: students.length,
 marked: marks.length,
 };
 }

 if (action === "notices") {
 const notices = await db.notice.findMany({
 where: { departmentId: session.departmentId!, postedBy: session.userId },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 50,
 });
 return { notices };
 }

 if (action === "overview") {
 const [schedules, courses, changes] = await Promise.all([
 db.schedule.findMany({
 where: { teacherId: session.userId, isActive: true },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
 }),
 db.course.findMany({
 where: {
 departmentId: session.departmentId!,
 isActive: true,
 },
 include: { program: { select: { shortName: true } } },
 orderBy: { code: "asc" },
 }),
 db.scheduleChange.findMany({
 where: { teacherId: session.userId, isActive: true },
 orderBy: { createdAt: "desc" },
 take: 20,
 }),
 ]);
 const today = new Date()
 .toLocaleDateString("en-US", { weekday: "long" })
 .toLowerCase();
 const todayClasses = schedules.filter((s) => s.dayOfWeek === today).length;
 return {
 schedules,
 courses,
 changes,
 stats: {
 totalClasses: schedules.length,
 todayClasses: DAYS.includes(today) ? todayClasses : 0,
 totalCourses: courses.length,
 },
 };
 }

 if (action === "assignments") {
 const courseId = searchParams.get("courseId");
 const assignments = await db.assignment.findMany({
 where: {
 teacherId: session.userId,
 ...(courseId ? { courseId } : {}),
 },
 include: { course: { select: { code: true, name: true } } },
 orderBy: { createdAt: "desc" },
 });
 return { assignments };
 }

 if (action === "results") {
 const courseId = searchParams.get("courseId");
 if (!courseId) throw new ApiError(400, "courseId is required");
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);

 const results = await db.result.findMany({
 where: { courseId, enteredBy: session.userId },
 include: {
 student: {
 select: { fullName: true, rollNumber: true, studentIdNumber: true },
 },
 },
 orderBy: { createdAt: "desc" },
 });
 const students = await db.user.findMany({
 where: {
 departmentId: course.departmentId,
 role: "student",
 isActive: true,
 programId: course.programId,
 semester: course.semester,
 },
 select: {
 id: true,
 fullName: true,
 rollNumber: true,
 studentIdNumber: true,
 },
 orderBy: { rollNumber: "asc" },
 });
 return { results, students, course };
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function POST(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (!["teacher", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Teacher access required");
 }
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 // ---------- Attendance (bulk save) ----------
 if (action === "attendance") {
 const { scheduleId, date, entries } = body as {
 scheduleId?: string;
 date?: string;
 entries?: { studentId: string; status: string }[];
 };
 if (!scheduleId || !entries?.length) {
 throw new ApiError(400, "Schedule and at least one entry are required");
 }
 const classDate = date || todayStr();
 if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
 throw new ApiError(400, "Date must be YYYY-MM-DD");
 }
 const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
 if (!schedule) throw new ApiError(404, "Schedule not found");
 if (session.role === "teacher" && schedule.teacherId !== session.userId) {
 throw new ApiError(403, "You can only take attendance for your own classes");
 }
 assertDepartmentAccess(session, schedule.departmentId);

 let saved = 0;
 const absentees: string[] = [];
 for (const e of entries) {
 if (!e.studentId || !isAttStatus(e.status)) continue;
 await db.attendance.upsert({
 where: {
 scheduleId_studentId_date: {
 scheduleId,
 studentId: e.studentId,
 date: classDate,
 },
 },
 create: {
 departmentId: schedule.departmentId,
 scheduleId,
 courseId: schedule.courseId,
 studentId: e.studentId,
 date: classDate,
 status: e.status,
 markedBy: session.userId,
 markedByName: session.name,
 courseCode: schedule.courseCode,
 },
 update: { status: e.status, markedBy: session.userId, markedByName: session.name },
 });
 saved++;
 if (e.status === "absent") absentees.push(e.studentId);
 }

 // Notify absent students (skip when re-saving an already-marked day is fine —
 // upsert keeps one notification per save, which acts as a gentle reminder)
 if (absentees.length > 0) {
 await db.notification.createMany({
 data: absentees.map((studentId) => ({
 userId: studentId,
 title: `Absent marked: ${schedule.courseCode}`,
 body: `You were marked absent for ${schedule.courseCode} on ${classDate}. Contact your teacher if this is a mistake.`,
 type: "attendance",
 link: "/?view=dashboard",
 })),
 });
 }

 return {
 saved,
 absentNotified: absentees.length,
 summary: {
 present: entries.filter((e) => e.status === "present").length,
 absent: absentees.length,
 late: entries.filter((e) => e.status === "late").length,
 excused: entries.filter((e) => e.status === "excused").length,
 },
 };
 }

 // ---------- QR session finalize: mark everyone who did NOT scan as absent ----------
 if (action === "attendance-finalize") {
 const { sessionId } = body as { sessionId?: string };
 if (!sessionId) throw new ApiError(400, "sessionId is required");

 const qr = await db.attendanceSession.findUnique({
 where: { id: sessionId },
 select: {
 id: true,
 departmentId: true,
 scheduleId: true,
 courseId: true,
 teacherId: true,
 date: true,
 closed: true,
 schedule: {
 select: {
 courseCode: true,
 programId: true,
 semester: true,
 },
 },
 },
 });
 if (!qr) throw new ApiError(404, "QR session not found");
 if (session.role === "teacher" && qr.teacherId !== session.userId) {
 throw new ApiError(403, "Not your QR session");
 }
 assertDepartmentAccess(session, qr.departmentId);

 // Full roster of this class batch
 const roster = await db.user.findMany({
 where: {
 departmentId: qr.departmentId,
 role: "student",
 isActive: true,
 programId: qr.schedule.programId,
 semester: qr.schedule.semester,
 },
 select: { id: true },
 });
 const alreadyMarked = await db.attendance.findMany({
 where: { scheduleId: qr.scheduleId, date: qr.date },
 select: { studentId: true, status: true },
 });
 const markedIds = new Set(alreadyMarked.map((m) => m.studentId));
 const missing = roster.filter((st) => !markedIds.has(st.id));

 if (missing.length > 0) {
 await db.$transaction([
 db.attendance.createMany({
 data: missing.map((st) => ({
 departmentId: qr.departmentId,
 scheduleId: qr.scheduleId,
 courseId: qr.courseId,
 studentId: st.id,
 date: qr.date,
 status: "absent",
 markedBy: session.userId,
 markedByName: "QR auto-close",
 courseCode: qr.schedule.courseCode,
 })),
 }),
 db.notification.createMany({
 data: missing.map((st) => ({
 userId: st.id,
 title: `Absent marked: ${qr.schedule.courseCode}`,
 body: `You did not scan the QR check-in for ${qr.schedule.courseCode} on ${qr.date}, so you were marked absent. Contact your teacher if this is a mistake.`,
 type: "attendance",
 link: "/?view=dashboard",
 })),
 }),
 ]);
 }

 await db.attendanceSession.update({
 where: { id: qr.id },
 data: { closed: true },
 });

 return {
 absentMarked: missing.length,
 absentTotal: alreadyMarked.filter((m) => m.status === "absent").length + missing.length,
 present: alreadyMarked.filter((m) => m.status === "present").length,
 late: alreadyMarked.filter((m) => m.status === "late").length,
 excused: alreadyMarked.filter((m) => m.status === "excused").length,
 total: roster.length,
 };
 }

 // ---------- Notices (teacher publishes to their department) ----------
 if (action === "notices") {
 const { title, content, category, audience, courseId, isPinned } = body as {
 title?: string;
 content?: string;
 category?: string;
 audience?: string;
 courseId?: string;
 isPinned?: boolean;
 };
 if (!title?.trim() || !content?.trim()) {
 throw new ApiError(400, "Title and content are required");
 }
 const audienceVal = ["all", "students", "teachers"].includes(String(audience))
 ? String(audience)
 : "all";

 // Optional course scope → target that batch
 let scopeProgramId: string | null = null;
 let scopeSemester: number | null = null;
 let scopeCode: string | null = null;
 if (courseId) {
 const course = await db.course.findUnique({ where: { id: String(courseId) } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);
 scopeProgramId = course.programId;
 scopeSemester = course.semester;
 scopeCode = course.code;
 }

 const notice = await db.notice.create({
 data: {
 departmentId: session.departmentId!,
 title: title.trim(),
 content: content.trim(),
 category: String(category) || "general",
 audience: audienceVal,
 programId: scopeProgramId,
 semester: scopeSemester,
 isPinned: Boolean(isPinned),
 postedBy: session.userId,
 postedByName: session.name,
 },
 });

 // Fan-out notifications
 const fanout: { userId: string; title: string; body: string; type: string; link: string }[] = [];
 const nTitle = `Notice: ${title.trim().slice(0, 60)}`;
 const nBody = `${scopeCode ? `[${scopeCode}] ` : ""}${content.trim().slice(0, 140)}`;
 if (audienceVal !== "teachers") {
 const students = await db.user.findMany({
 where: {
 departmentId: session.departmentId!,
 role: "student",
 isActive: true,
 ...(scopeProgramId ? { programId: scopeProgramId } : {}),
 ...(scopeSemester ? { semester: scopeSemester } : {}),
 },
 select: { id: true },
 });
 for (const s of students) {
 fanout.push({ userId: s.id, title: nTitle, body: nBody, type: "notice", link: "/?view=dashboard" });
 }
 }
 if (audienceVal !== "students") {
 const teachers = await db.user.findMany({
 where: { departmentId: session.departmentId!, role: "teacher", isActive: true },
 select: { id: true },
 });
 for (const t of teachers) {
 fanout.push({ userId: t.id, title: nTitle, body: nBody, type: "notice", link: "/?view=dashboard" });
 }
 }
 if (fanout.length) await db.notification.createMany({ data: fanout });

 return { notice, notified: fanout.length };
 }

 // ---------- Class change (cancel / reschedule / room change / extra) ----------
 if (action === "class-change") {
 const {
 scheduleId,
 changeType,
 newDay,
 newTimeSlotId,
 newRoomId,
 reason,
 effectiveDate,
 } = body as Record<string, string>;

 if (!scheduleId || !changeType || !reason?.trim()) {
 throw new ApiError(400, "Schedule, change type and reason are required");
 }
 const schedule = await db.schedule.findUnique({
 where: { id: scheduleId },
 });
 if (!schedule) throw new ApiError(404, "Schedule not found");
 if (session.role === "teacher" && schedule.teacherId !== session.userId) {
 throw new ApiError(403, "You can only change your own classes");
 }
 assertDepartmentAccess(session, schedule.departmentId);

 let newTime: { startTime: string; endTime: string } | null = null;
 let newRoomNumber: string | null = null;
 if (newTimeSlotId) {
 const ts = await db.timeSlot.findUnique({ where: { id: newTimeSlotId } });
 if (ts) newTime = { startTime: ts.startTime, endTime: ts.endTime };
 }
 if (newRoomId) {
 const rm = await db.room.findUnique({ where: { id: newRoomId } });
 if (rm) newRoomNumber = rm.roomNumber;
 }

 const change = await db.scheduleChange.create({
 data: {
 departmentId: schedule.departmentId,
 scheduleId: schedule.id,
 changeType,
 originalDay: schedule.dayOfWeek,
 originalTimeSlotId: schedule.timeSlotId,
 originalStartTime: schedule.startTime,
 originalEndTime: schedule.endTime,
 originalRoomId: schedule.roomId,
 originalRoomNumber: schedule.roomNumber,
 newDay:
 changeType === "extra_class"
 ? newDay ?? schedule.dayOfWeek
 : newDay ?? null,
 newTimeSlotId: newTimeSlotId ?? null,
 newStartTime: newTime?.startTime ?? null,
 newEndTime: newTime?.endTime ?? null,
 newRoomId: newRoomId ?? null,
 newRoomNumber,
 effectiveDate: effectiveDate || todayStr(),
 reason: reason.trim(),
 courseCode: schedule.courseCode,
 courseName: schedule.courseName,
 teacherId: schedule.teacherId,
 teacherName: schedule.teacherName,
 programId: schedule.programId,
 semester: schedule.semester,
 changedBy: session.userId,
 changedByName: session.name,
 },
 });

 // Auto-notice
 const changeTitle: Record<string, string> = {
 cancelled: `Class Cancelled: ${schedule.courseCode}`,
 rescheduled: `Class Rescheduled: ${schedule.courseCode}`,
 room_changed: `Room Changed: ${schedule.courseCode}`,
 time_changed: `Time Changed: ${schedule.courseCode}`,
 extra_class: `Extra Class: ${schedule.courseCode}`,
 };
 const notice = await db.notice.create({
 data: {
 departmentId: schedule.departmentId,
 title: changeTitle[changeType] ?? `Class Update: ${schedule.courseCode}`,
 content: `${schedule.courseName} (${schedule.courseCode}) — ${reason.trim()}`,
 category: "schedule_change",
 audience: "all",
 changeType,
 scheduleChangeId: change.id,
 programId: schedule.programId,
 semester: schedule.semester,
 postedBy: session.userId,
 postedByName: session.name,
 isAutoGenerated: true,
 },
 });

 // Fan-out notifications to affected students + the teacher
 const affected = await db.user.findMany({
 where: {
 departmentId: schedule.departmentId,
 role: "student",
 isActive: true,
 programId: schedule.programId,
 semester: schedule.semester,
 },
 select: { id: true },
 });
 const notifTitle = changeTitle[changeType] ?? "Class Update";
 const notifBody =
 changeType === "cancelled"
 ? `${schedule.courseCode} on ${schedule.dayOfWeek} (${schedule.startTime}) is cancelled. Reason: ${reason.trim()}`
 : changeType === "rescheduled" || changeType === "time_changed"
 ? `${schedule.courseCode} moved to ${newDay ?? change.newDay ?? "another day"}${newTime ? ` at ${newTime.startTime}` : ""}. Reason: ${reason.trim()}`
 : changeType === "room_changed"
 ? `${schedule.courseCode} room changed to ${newRoomNumber ?? "TBA"}. Reason: ${reason.trim()}`
 : `Extra class for ${schedule.courseCode} added on ${newDay ?? schedule.dayOfWeek}${newTime ? ` at ${newTime.startTime}` : ""}.`;

 const fanout = [
 ...affected.map((s) => ({
 userId: s.id,
 title: notifTitle,
 body: notifBody,
 type: changeType,
 link: `/?view=department&dept=${schedule.departmentId}`,
 })),
 {
 userId: schedule.teacherId,
 title: notifTitle,
 body: notifBody,
 type: changeType,
 link: "/?view=dashboard",
 },
 ];
 await db.notification.createMany({ data: fanout });

 return { change, notice, notified: fanout.length };
 }

 // ---------- Assignments ----------
 if (action === "assignments") {
 const { courseId, title, description, dueDate, maxMarks } =
 body as Record<string, string>;
 if (!courseId || !title?.trim() || !description?.trim()) {
 throw new ApiError(400, "Course, title and description are required");
 }
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);

 const assignment = await db.assignment.create({
 data: {
 departmentId: course.departmentId,
 courseId,
 teacherId: session.userId,
 title: title.trim(),
 description: description.trim(),
 dueDate: dueDate ? new Date(dueDate) : null,
 maxMarks: maxMarks ? Number(maxMarks) : null,
 },
 });

 // Notify students of this course's batch
 const students = await db.user.findMany({
 where: {
 departmentId: course.departmentId,
 role: "student",
 isActive: true,
 programId: course.programId,
 semester: course.semester,
 },
 select: { id: true },
 });
 if (students.length) {
 await db.notification.createMany({
 data: students.map((s) => ({
 userId: s.id,
 title: `New Assignment: ${course.code}`,
 body: `${title.trim()}${dueDate ? ` — due ${new Date(dueDate).toLocaleDateString()}` : ""}`,
 type: "assignment",
 })),
 });
 }
 return { assignment, notified: students.length };
 }

 // ---------- Results (bulk) ----------
 if (action === "results") {
 const { courseId, examType, entries } = body as {
 courseId?: string;
 examType?: string;
 entries?: { studentId: string; marks: number; grade?: string; remarks?: string }[];
 };
 if (!courseId || !examType || !entries?.length) {
 throw new ApiError(400, "Course, exam type and entries are required");
 }
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);

 let saved = 0;
 for (const e of entries) {
 if (e.marks === undefined || e.marks === null) continue;
 await db.result.upsert({
 where: {
 courseId_studentId_examType: {
 courseId,
 studentId: e.studentId,
 examType,
 },
 },
 create: {
 departmentId: course.departmentId,
 courseId,
 studentId: e.studentId,
 enteredBy: session.userId,
 examType,
 marks: Number(e.marks),
 maxMarks: 20,
 grade: e.grade ?? null,
 remarks: e.remarks ?? null,
 },
 update: {
 marks: Number(e.marks),
 grade: e.grade ?? null,
 remarks: e.remarks ?? null,
 },
 });
 saved++;

 // notify the student
 await db.notification.create({
 data: {
 userId: e.studentId,
 title: `Result Published: ${course.code}`,
 body: `Your ${examType.toUpperCase()} result for ${course.code} is published: ${e.marks}/20${e.grade ? ` (Grade ${e.grade})` : ""}`,
 type: "result",
 },
 });
 }
 return { saved };
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (!["teacher", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Teacher access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 // ---------- Update assignment ----------
 if (action === "assignments") {
 if (!id) throw new ApiError(400, "id query param is required");
 const a = await db.assignment.findUnique({ where: { id } });
 if (!a) throw new ApiError(404, "Assignment not found");
 if (a.teacherId !== session.userId && session.role !== "dept_admin") {
 throw new ApiError(403, "Not your assignment");
 }
 const data: Record<string, unknown> = {};
 if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
 if (typeof body.description === "string") data.description = body.description.trim();
 if (body.dueDate !== undefined) {
 data.dueDate = body.dueDate ? new Date(String(body.dueDate)) : null;
 }
 if (body.maxMarks !== undefined) {
 data.maxMarks = body.maxMarks === null || body.maxMarks === "" ? null : Number(body.maxMarks);
 }
 const updated = await db.assignment.update({ where: { id }, data });

 // Notify the batch about the update
 const course = await db.course.findUnique({ where: { id: a.courseId } });
 if (course) {
 const students = await db.user.findMany({
 where: {
 departmentId: course.departmentId,
 role: "student",
 isActive: true,
 programId: course.programId,
 semester: course.semester,
 },
 select: { id: true },
 });
 if (students.length) {
 await db.notification.createMany({
 data: students.map((s) => ({
 userId: s.id,
 title: `Assignment Updated: ${course.code}`,
 body: `${updated.title}${updated.dueDate ? ` — due ${updated.dueDate.toLocaleDateString()}` : ""}`,
 type: "assignment",
 })),
 });
 }
 }
 return { assignment: updated };
 }

 throw new ApiError(404, "Unknown action");
 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
 const { action } = await ctx.params;
 return handle(async () => {
 const session = await requireSession();
 if (!["teacher", "dept_admin"].includes(session.role)) {
 throw new ApiError(403, "Teacher access required");
 }
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");

 if (action === "assignments") {
 if (!id) throw new ApiError(400, "id is required");
 const a = await db.assignment.findUnique({ where: { id } });
 if (!a) throw new ApiError(404, "Assignment not found");
 if (a.teacherId !== session.userId && session.role !== "dept_admin") {
 throw new ApiError(403, "Not your assignment");
 }
 await db.assignment.delete({ where: { id } });
 return { deleted: true };
 }

 if (action === "notices") {
 if (!id) throw new ApiError(400, "id is required");
 const n = await db.notice.findUnique({ where: { id } });
 if (!n) throw new ApiError(404, "Notice not found");
 if (n.postedBy !== session.userId && session.role !== "dept_admin") {
 throw new ApiError(403, "You can only delete your own notices");
 }
 await db.notice.delete({ where: { id } });
 return { deleted: true };
 }
 throw new ApiError(404, "Unknown action");
 });
}
