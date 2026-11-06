import { NextRequest } from "next/server";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError, type SessionPayload } from "@/lib/session";
import { assertDepartmentAccess } from "@/lib/auth";
import { percentToGrade, resultPct, UGC_SCALE } from "@/lib/grades";
import { bdTodayISO, bdWeekday, bdDaysAgoISO, weekdayOfDate } from "@/lib/date-bd";
import { windowsOverlap } from "@/lib/time-utils";

/**
 * Teacher actions API.
 * GET /api/teacher/overview → own schedules + courses + rooms + timeSlots + stats
 * GET /api/teacher/attendance?scheduleId=&date= → roster + existing marks
 * GET /api/teacher/attendance-sheet?courseId= → master register per subject (all slots merged, all-time)
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
 * POST /api/teacher/class-change → cancel/reschedule/room/time/extra + auto notice + fan-out
 * GET /api/teacher/free-rooms?day=&timeSlotId= → room availability finder
 * GET /api/teacher/students?courseId=|programId=&semester=&q= → batch roster + attendance %
 * POST /api/teacher/students-move → move selected students to a semester (batch promote/hold)
 * POST /api/teacher/students-status → activate / deactivate selected students
 * GET /api/teacher/export?type=... → server-built CSV documents (COST GUARD: one small JSON)
 */

const ATT_STATUSES = ["present", "absent", "late", "excused"] as const;
type AttStatus = (typeof ATT_STATUSES)[number];

function isAttStatus(v: unknown): v is AttStatus {
  return typeof v === "string" && (ATT_STATUSES as readonly string[]).includes(v);
}
type Ctx = { params: Promise<{ action: string }> };

const DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];

function todayStr(): string {
 // Asia/Dhaka date — the old local-time version drifted a day for the
 // first 6 hours of the BD day (server clock runs UTC).
 return bdTodayISO();
}

const CHANGE_TYPES = [
 "cancelled",
 "rescheduled",
 "room_changed",
 "time_changed",
 "extra_class",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VALID_EXAM_TYPES = new Set(["ct1", "ct2", "midterm", "final", "assignment"]);
const VALID_NOTICE_CATEGORIES = new Set([
 "academic", "exam", "event", "general", "schedule_change", "assignment",
]);

/** Fan-out writes the documented Notification.type set (schema comment). */
const CHANGE_NOTIF_TYPE: Record<string, string> = {
 cancelled: "class_cancelled",
 rescheduled: "class_rescheduled",
 time_changed: "class_rescheduled",
 room_changed: "room_changed",
 extra_class: "extra_class",
};

/** Marks bounds: accept a custom scale (default 20) but keep it sane. */
function parseMaxMarks(v: unknown): number {
 const n = Number(v);
 if (!Number.isFinite(n) || n < 1 || n > 200)
 throw new ApiError(400, "Max marks must be between 1 and 200");
 return Math.round(n);
}

/** Letter grades this platform recognizes (UGC scale in lib/grades). */
const VALID_GRADES = new Set(UGC_SCALE.map((b) => b.letter));

/**
 * Runtime type guard for user-supplied string fields: `title: 123` used
 * to slip past truthiness checks and explode inside `.trim()` as a 500.
 */
function asStr(v: unknown, name: string): string {
 if (v === undefined || v === null) throw new ApiError(400, `${name} is required`);
 if (typeof v !== "string") throw new ApiError(400, `${name} must be text`);
 return v;
}

/** Query-param integer parse — "1.5" or "abc" must 400, not coerce. */
function parseIntParam(v: string | null, name: string): number | null {
 if (v === null || v.trim() === "") return null;
 const n = Number(v);
 if (!Number.isInteger(n)) throw new ApiError(400, `${name} must be a whole number`);
 return n;
}

/**
 * A teacher may only write against a course they actually teach —
 * ownership rides the Schedule linkage (any schedule row), while
 * dept_admin / super_admin keep full department scope.
 */
async function assertTeacherOwnsCourse(
 session: SessionPayload,
 courseId: string
): Promise<void> {
 if (session.role !== "teacher") return;
 const own = await db.schedule.findFirst({
 where: { courseId, teacherId: session.userId },
 select: { id: true },
 });
 if (!own) throw new ApiError(403, "You can only manage courses you teach");
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

 // When the class batch is empty, tell the teacher WHY: count active
 // students per semester of the same program (one tiny indexed groupBy,
 // only in the empty case — happy path pays nothing).
 let batchCounts: { semester: number | null; count: number }[] | undefined;
 if (students.length === 0) {
 const grouped = await db.user.groupBy({
 by: ["semester"],
 where: {
 departmentId: schedule.departmentId,
 role: "student",
 isActive: true,
 programId: schedule.programId,
 },
 _count: true,
 orderBy: { semester: "asc" },
 });
 batchCounts = grouped.map((g) => ({ semester: g.semester, count: g._count }));
 }

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
 batchCounts,
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

 if (action === "attendance-sheet") {
 // Master attendance sheet — ONE sheet per SUBJECT (course × batch),
 // not one per weekly slot. ICE-1101 may run on 5 weekly slots but the
 // batch has a single register: every class day from every slot of the
 // course accumulates as one date column, all-time (no month windows).
 // COST GUARD: 3 indexed queries; response is compact status letters.
 const courseId = searchParams.get("courseId");
 if (!courseId) throw new ApiError(400, "courseId is required");
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);

 // Every weekly slot of this subject in the department. For a teacher,
 // they must own at least one slot of the course; the sheet itself still
 // merges ALL slots (shared courses like ICE-2101 stay one register).
 const slots = await db.schedule.findMany({
 where: { courseId, departmentId: course.departmentId },
 select: {
 id: true, programId: true, semester: true, teacherId: true,
 teacherName: true, dayOfWeek: true, startTime: true, isActive: true,
 },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
 });
 if (slots.length === 0) throw new ApiError(404, "No classes found for this course");
 if (
 session.role === "teacher" &&
 !slots.some((s) => s.teacherId === session.userId)
 ) {
 throw new ApiError(403, "You can only view your own classes");
 }

 // Batch identity of the register (all slots of a course share it in practice)
 const programId = slots[0].programId;
 const semester = slots[0].semester;

 const [students, marks] = await Promise.all([
 db.user.findMany({
 where: {
 departmentId: course.departmentId,
 role: "student",
 isActive: true,
 programId,
 semester,
 },
 select: { id: true, fullName: true, rollNumber: true, studentIdNumber: true },
 orderBy: { rollNumber: "asc" },
 }),
 db.attendance.findMany({
 where: { scheduleId: { in: slots.map((s) => s.id) } },
 select: { studentId: true, scheduleId: true, date: true, status: true },
 orderBy: { date: "asc" },
 take: 6000, // bounded; a semester's worth of days × batch
 }),
 ]);

 // Columns = class MEETINGS. One column per date normally; when a subject
 // met twice on the same calendar date (morning + afternoon slot), each
 // meeting keeps its own column so no mark is lost.
 const slotById = new Map(slots.map((s) => [s.id, s]));
 const sidsByDate = new Map<string, Set<string>>();
 for (const m of marks) {
 let set = sidsByDate.get(m.date);
 if (!set) sidsByDate.set(m.date, (set = new Set()));
 set.add(m.scheduleId);
 }
 const columns: { key: string; date: string; slot?: string }[] = [];
 const keyFor = (scheduleId: string, date: string): string => {
 const ids = sidsByDate.get(date);
 return ids && ids.size > 1 ? `${date}::${scheduleId}` : date;
 };
 for (const date of [...sidsByDate.keys()].sort()) {
 const ids = [...(sidsByDate.get(date) ?? [])].sort((a, b) => {
 const sa = slotById.get(a)?.startTime ?? "";
 const sb = slotById.get(b)?.startTime ?? "";
 return sa.localeCompare(sb);
 });
 for (const sid of ids) {
 const slot = slotById.get(sid);
 columns.push({
 key: keyFor(sid, date),
 date,
 slot: ids.length > 1 && slot ? `${slot.dayOfWeek} ${slot.startTime}` : undefined,
 });
 }
 }

 const cells: Record<string, Record<string, string>> = {};
 const summary: Record<string, { present: number; absent: number; late: number; excused: number; total: number; pct: number }> = {};
 for (const st of students) {
 cells[st.id] = {};
 summary[st.id] = { present: 0, absent: 0, late: 0, excused: 0, total: 0, pct: 0 };
 }
 for (const m of marks) {
 const row = cells[m.studentId];
 const sum = summary[m.studentId];
 if (!row || !sum) continue; // marked student left the batch — keep grid clean
 row[keyFor(m.scheduleId, m.date)] = m.status;
 sum.total += 1;
 if (m.status in sum) sum[m.status as "present" | "absent" | "late" | "excused"] += 1;
 }
 for (const st of students) {
 const sum = summary[st.id];
 sum.pct = sum.total > 0 ? Math.round((sum.present / sum.total) * 100) : 0;
 }

 return {
 course: {
 courseCode: course.code,
 courseName: course.name,
 semester,
 slots: slots.length,
 teacherNames: [...new Set(slots.map((s) => s.teacherName).filter(Boolean))],
 },
 columns,
 students,
 cells,
 summary,
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
 const [schedules, courses, changes, rooms, timeSlots, taughtRows] = await Promise.all([
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
 take: 200,
 }),
 db.room.findMany({
 where: { departmentId: session.departmentId!, isActive: true },
 orderBy: { roomNumber: "asc" },
 }),
 db.timeSlot.findMany({
 where: { departmentId: session.departmentId!, isActive: true },
 orderBy: { slotOrder: "asc" },
 }),
 // Course ids this teacher actually teaches (Schedule linkage) —
 // one tiny indexed select used only for the teacher-scope filter.
 db.schedule.findMany({
 where: { teacherId: session.userId },
 select: { courseId: true },
 }),
 ]);
 // REALITY CHECK: the course catalogue dropdown must only list courses
 // the teacher can actually write against (same Schedule linkage the
 // ownership guard uses); dept_admin keeps seeing the whole department.
 const visibleCourses =
 session.role === "teacher"
 ? (() => {
 const taught = new Set(taughtRows.map((s) => s.courseId));
 return courses.filter((c) => taught.has(c.id));
 })()
 : courses;
 // Weekday in Asia/Dhaka (server clock may be UTC → wrong "today").
 const today = bdWeekday();
 const todayClasses = schedules.filter((s) => s.dayOfWeek === today).length;

 // Distinct (program, semester) batches taught → student reach (COST GUARD:
 // one indexed count query instead of loading student rows)
 const pairs = [
 ...new Set(schedules.map((s) => `${s.programId}|${s.semester}`)),
 ].map((p) => {
 const [programId, semester] = p.split("|");
 return { programId, semester: Number(semester) };
 });
 const myStudents = pairs.length
 ? await db.user.count({
 where: {
 departmentId: session.departmentId!,
 role: "student",
 isActive: true,
 OR: pairs,
 },
 })
 : 0;

 return {
 schedules,
 courses: visibleCourses,
 changes,
 rooms,
 timeSlots,
 stats: {
 totalClasses: schedules.length,
 todayClasses: DAYS.includes(today) ? todayClasses : 0,
 totalCourses: visibleCourses.length,
 myStudents,
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
 take: 300,
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
 take: 2500,
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

 if (action === "students") {
 // Batch roster with attendance % — scope: courseId OR programId+semester
 const courseId = searchParams.get("courseId");
 const programIdParam = searchParams.get("programId");
 const semesterParam = searchParams.get("semester");
 const q = (searchParams.get("q") ?? "").trim().slice(0, 60);

 let scopeProgramId = programIdParam;
 let scopeSemester = parseIntParam(semesterParam, "Semester");
 if (courseId) {
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);
 scopeProgramId = course.programId;
 scopeSemester = course.semester;
 }

 // Programs list (tiny) powers the batch selector in the UI
 const programs = await db.program.findMany({
 where: { departmentId: session.departmentId!, isActive: true },
 select: { id: true, name: true, shortName: true, semesterCount: true },
 orderBy: { shortName: "asc" },
 });

 if (!scopeProgramId || !scopeSemester) {
 return { students: [], attendancePct: {}, programs, batch: null };
 }

 const where = {
 departmentId: session.departmentId!,
 role: "student" as const,
 programId: scopeProgramId,
 semester: scopeSemester,
 ...(q
 ? {
 OR: [
 { fullName: { contains: q } },
 { rollNumber: { contains: q } },
 { studentIdNumber: { contains: q } },
 ],
 }
 : {}),
 };

 const students = await db.user.findMany({
 where,
 select: {
 id: true,
 fullName: true,
 rollNumber: true,
 studentIdNumber: true,
 section: true,
 phone: true,
 semester: true,
 isActive: true,
 programId: true,
 },
 orderBy: { rollNumber: "asc" },
 take: 500,
 });
 // Two grouped aggregates instead of N rows — COST GUARD.
 // Wrapped defensively: if the attendance aggregates ever fail
 // (e.g. stale client on a cold deploy), the roster itself must
 // still load — attendance % just degrades to "no data".
 let totals: { studentId: string; _count: { studentId: number } }[] = [];
 let presents: { studentId: string; _count: { studentId: number } }[] = [];
 try {
 [totals, presents] = await Promise.all([
 db.attendance.groupBy({
 by: ["studentId"],
 where: {
 departmentId: session.departmentId!,
 schedule: { programId: scopeProgramId, semester: scopeSemester },
 },
 _count: { studentId: true },
 }),
 db.attendance.groupBy({
 by: ["studentId"],
 where: {
 departmentId: session.departmentId!,
 status: { in: ["present", "late"] },
 schedule: { programId: scopeProgramId, semester: scopeSemester },
 },
 _count: { studentId: true },
 }),
 ]);
 } catch (aggErr) {
 console.error("[teacher/students] attendance aggregates failed, degrading to no-data:", aggErr);
 }

 const totalMap = new Map(totals.map((t) => [t.studentId, t._count.studentId]));
 const presentMap = new Map(presents.map((p) => [p.studentId, p._count.studentId]));
 const attendancePct: Record<string, number> = {};
 for (const st of students) {
 const total = totalMap.get(st.id) ?? 0;
 const present = presentMap.get(st.id) ?? 0;
 attendancePct[st.id] = total > 0 ? Math.round((present / total) * 100) : -1; // -1 = no data
 }

 return {
 students,
 attendancePct,
 programs,
 batch: { programId: scopeProgramId, semester: scopeSemester },
 };
 }

 if (action === "free-rooms") {
 // Room availability finder — one GET when the teacher opens the finder
 // (COST GUARD: on-demand, never polled)
 const day = searchParams.get("day");
 const timeSlotId = searchParams.get("timeSlotId");
 if (!day || !DAYS.includes(day)) throw new ApiError(400, "Valid day is required");
 if (!timeSlotId) throw new ApiError(400, "timeSlotId is required");
 assertDepartmentAccess(session, session.departmentId!);

 const [rooms, bookings] = await Promise.all([
 db.room.findMany({
 where: { departmentId: session.departmentId!, isActive: true },
 orderBy: { roomNumber: "asc" },
 }),
 db.schedule.findMany({
 where: {
 departmentId: session.departmentId!,
 isActive: true,
 dayOfWeek: day,
 timeSlotId,
 },
 select: {
 roomId: true,
 courseCode: true,
 teacherName: true,
 semester: true,
 },
 }),
 ]);
 const bookedMap = new Map(bookings.map((b) => [b.roomId, b]));
 return {
 day,
 timeSlotId,
 freeCount: rooms.filter((r) => !bookedMap.has(r.id)).length,
 rooms: rooms.map((r) => {
 const b = bookedMap.get(r.id);
 return {
 id: r.id,
 roomNumber: r.roomNumber,
 building: r.building,
 type: r.type,
 capacity: r.capacity,
 booked: b
 ? { courseCode: b.courseCode, teacherName: b.teacherName, semester: b.semester }
 : null,
 };
 }),
 };
 }

 if (action === "export") {
 // COST GUARD: CSV is built server-side as plain text and returned as one
 // small JSON — the client turns it into a .csv Blob download. One request,
 // one response, no paging, no polling. Excel opens it directly (UTF-8 BOM
 // is added client-side for Bangla names).
 const type = searchParams.get("type");
 const esc = (v: unknown) => {
 const s = String(v ?? "");
 return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
 };
 const toCsv = (rows: (string | number | null | undefined)[][]) =>
 rows.map((r) => r.map(esc).join(",")).join("\n");
 let filename = "export.csv";
 let csv = "";

 if (type === "schedule") {
 const rows = await db.schedule.findMany({
 where: { teacherId: session.userId, isActive: true },
 include: { program: { select: { shortName: true } } },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
 });
 filename = `my-weekly-schedule-${todayStr()}.csv`;
 csv = toCsv([
 ["Day", "Start", "End", "Course Code", "Course Name", "Type", "Room", "Program", "Semester"],
 ...rows.map((s) => [
 s.dayOfWeek, s.startTime, s.endTime, s.courseCode, s.courseName,
 s.classType, s.roomNumber, s.program?.shortName ?? "", s.semester,
 ]),
 ]);
 } else if (type === "students") {
 const courseId = searchParams.get("courseId");
 const programIdParam = searchParams.get("programId");
 const semesterParam = searchParams.get("semester");
 let scopeProgramId = programIdParam;
 let scopeSemester = parseIntParam(semesterParam, "Semester");
 let label = "batch";
 if (courseId) {
 const course = await db.course.findUnique({
 where: { id: courseId },
 include: { program: { select: { shortName: true } } },
 });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);
 scopeProgramId = course.programId;
 scopeSemester = course.semester;
 label = `${course.code}-sem${course.semester}`;
 } else if (scopeProgramId && scopeSemester) {
 const prog = await db.program.findUnique({ where: { id: scopeProgramId } });
 label = `${prog?.shortName ?? "prog"}-sem${scopeSemester}`;
 } else {
 throw new ApiError(400, "Provide courseId or programId+semester");
 }
 if (!scopeProgramId || !scopeSemester) throw new ApiError(400, "Scope required");
 const [students, prog] = await Promise.all([
 db.user.findMany({
 where: {
 departmentId: session.departmentId!,
 role: "student",
 programId: scopeProgramId,
 semester: scopeSemester,
 },
 select: {
 rollNumber: true, studentIdNumber: true, fullName: true,
 section: true, phone: true, semester: true, isActive: true,
 },
 orderBy: { rollNumber: "asc" },
 }),
 db.program.findUnique({ where: { id: scopeProgramId }, select: { shortName: true } }),
 ]);
 filename = `students-${label}-${todayStr()}.csv`;
 csv = toCsv([
 ["Roll", "Student ID", "Name", "Program", "Semester", "Section", "Phone", "Status"],
 ...students.map((s) => [
 s.rollNumber ?? "", s.studentIdNumber ?? "", s.fullName,
 prog?.shortName ?? "", s.semester ?? "", s.section ?? "", s.phone ?? "",
 s.isActive ? "Active" : "Inactive",
 ]),
 ]);
 } else if (type === "attendance-matrix") {
 // Excel-style master sheet: one row per student, one column per class date
 const scheduleId = searchParams.get("scheduleId");
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
 departmentId: schedule.departmentId, role: "student", isActive: true,
 programId: schedule.programId, semester: schedule.semester,
 },
 select: { id: true, fullName: true, rollNumber: true, studentIdNumber: true },
 orderBy: { rollNumber: "asc" },
 }),
 db.attendance.findMany({
 where: { scheduleId },
 select: { studentId: true, date: true, status: true },
 // Hard cap: a decades-old schedule could otherwise pull unlimited rows
 // into one CSV build (Excel handles ~16k columns anyway).
 take: 2000,
 }),
 ]);
 const dates = [...new Set(marks.map((m) => m.date))].sort();
 const cell = new Map<string, string>();
 for (const m of marks) cell.set(`${m.studentId}|${m.date}`, m.status);
 const letter: Record<string, string> = { present: "P", absent: "A", late: "L", excused: "E" };
 const rows: (string | number)[][] = [
 ["Roll", "Student ID", "Name", ...dates, "Present", "Total", "Attendance %"],
 ];
 for (const st of students) {
 const cells = dates.map((d) => letter[cell.get(`${st.id}|${d}`) ?? ""] ?? "-");
 const presentCount = cells.filter((c) => c === "P" || c === "L").length;
 const markedCount = cells.filter((c) => c !== "-").length;
 rows.push([
 st.rollNumber ?? "", st.studentIdNumber ?? "", st.fullName,
 ...cells,
 presentCount, markedCount,
 markedCount > 0 ? `${Math.round((presentCount / markedCount) * 100)}%` : "-",
 ]);
 }
 filename = `attendance-master-${schedule.courseCode}-${todayStr()}.csv`;
 csv = toCsv(rows);
 } else if (type === "attendance-day") {
 // One class · one date — classic day sheet
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
 departmentId: schedule.departmentId, role: "student", isActive: true,
 programId: schedule.programId, semester: schedule.semester,
 },
 select: { id: true, fullName: true, rollNumber: true, studentIdNumber: true },
 orderBy: { rollNumber: "asc" },
 }),
 db.attendance.findMany({
 where: { scheduleId, date },
 select: { studentId: true, status: true, markedByName: true },
 }),
 ]);
 const markMap = new Map(marks.map((m) => [m.studentId, m]));
 filename = `attendance-${schedule.courseCode}-${date}.csv`;
 csv = toCsv([
 ["Roll", "Student ID", "Name", "Status", "Marked By"],
 ...students.map((st) => {
 const m = markMap.get(st.id);
 return [
 st.rollNumber ?? "", st.studentIdNumber ?? "", st.fullName,
 m ? m.status.toUpperCase() : "NOT_MARKED", m?.markedByName ?? "",
 ];
 }),
 ]);
 } else if (type === "results") {
 const courseId = searchParams.get("courseId");
 if (!courseId) throw new ApiError(400, "courseId is required");
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);
 const results = await db.result.findMany({
 where: { courseId, enteredBy: session.userId },
 include: { student: { select: { fullName: true, rollNumber: true, studentIdNumber: true } } },
 orderBy: [{ examType: "asc" }, { createdAt: "asc" }],
 });
 filename = `results-${course.code}-${todayStr()}.csv`;
 csv = toCsv([
 ["Roll", "Student ID", "Name", "Exam", "Marks", "Max", "Grade", "Remarks"],
 ...results.map((r) => [
 r.student?.rollNumber ?? "", r.student?.studentIdNumber ?? "",
 r.student?.fullName ?? "", r.examType, r.marks, r.maxMarks, r.grade ?? "", r.remarks ?? "",
 ]),
 ]);
 } else if (type === "assignments") {
 const rows = await db.assignment.findMany({
 where: { teacherId: session.userId, isActive: true },
 include: { course: { select: { code: true, name: true } } },
 orderBy: { createdAt: "desc" },
 });
 filename = `assignments-${todayStr()}.csv`;
 csv = toCsv([
 ["Course", "Title", "Due Date", "Max Marks", "Created"],
 ...rows.map((a) => [
 a.course?.code ?? "", a.title,
 a.dueDate ? a.dueDate.toISOString().slice(0, 10) : "",
 a.maxMarks ?? "", a.createdAt.toISOString().slice(0, 10),
 ]),
 ]);
 } else if (type === "changes") {
 const rows = await db.scheduleChange.findMany({
 where: { teacherId: session.userId, isActive: true },
 orderBy: { createdAt: "desc" },
 take: 500,
 });
 filename = `class-change-history-${todayStr()}.csv`;
 csv = toCsv([
 ["Requested At", "Type", "Course", "Original", "New", "Effective Date", "Reason", "By"],
 ...rows.map((c) => [
 c.createdAt.toISOString().slice(0, 16).replace("T", " "), c.changeType,
 c.courseCode,
 `${c.originalDay ?? ""} ${c.originalStartTime ?? ""} ${c.originalRoomNumber ?? ""}`.trim(),
 [c.newDay, c.newStartTime, c.newRoomNumber].filter(Boolean).join(" ") || "—",
 c.effectiveDate, c.reason, c.changedByName,
 ]),
 ]);
 } else if (type === "notices") {
 const rows = await db.notice.findMany({
 where: { departmentId: session.departmentId!, postedBy: session.userId },
 orderBy: { createdAt: "desc" },
 take: 500,
 });
 filename = `my-notices-${todayStr()}.csv`;
 csv = toCsv([
 ["Date", "Title", "Category", "Audience", "Pinned", "Content"],
 ...rows.map((n) => [
 n.createdAt.toISOString().slice(0, 10), n.title, n.category,
 n.audience, n.isPinned ? "Yes" : "No", n.content,
 ]),
 ]);
 } else {
 throw new ApiError(400, "Unknown export type");
 }

 return { filename, csv };
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
 // REALITY CHECK: attendance can be filed for today or retroactively
 // (a teacher who forgot yesterday), never for a future date.
 if (classDate > todayStr()) {
 throw new ApiError(400, "Attendance cannot be marked for a future date");
 }
 // REALITY CHECK (age): anything older than a week is history, not a
 // missed register — retro-marking covers "I forgot yesterday", not
 // last month. Older corrections go through the dept admin.
 if (classDate < bdDaysAgoISO(7)) {
 throw new ApiError(
 400,
 "Attendance can only be filed for the last 7 days — contact your department admin for older records"
 );
 }
 const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
 if (!schedule) throw new ApiError(404, "Schedule not found");
 if (session.role === "teacher" && schedule.teacherId !== session.userId) {
 throw new ApiError(403, "You can only take attendance for your own classes");
 }
 assertDepartmentAccess(session, schedule.departmentId);

 // REALITY CHECK (cancelled): a class the department already cancelled
 // for that date cannot have a register filed against it.
 const cancelled = await db.scheduleChange.findFirst({
 where: {
 scheduleId,
 changeType: "cancelled",
 effectiveDate: classDate,
 isActive: true,
 },
 select: { id: true },
 });
 if (cancelled)
 throw new ApiError(400, "This class was cancelled on that date — attendance cannot be taken");
 // REALITY CHECK (weekday): registers follow the routine unless the day
 // was officially moved by a schedule change for that exact date.
 const hasMove = await db.scheduleChange.findFirst({
 where: {
 scheduleId,
 changeType: { in: ["rescheduled", "time_changed", "extra_class"] },
 effectiveDate: classDate,
 isActive: true,
 },
 select: { id: true },
 });
 if (!hasMove && weekdayOfDate(classDate) !== schedule.dayOfWeek) {
 throw new ApiError(
 400,
 `This class meets on ${schedule.dayOfWeek} — you cannot file a register for a different day`
 );
 }

 // Dedupe by studentId (last write wins) + hard cap. Duplicates previously
 // produced duplicate notifications and thousands of redundant upserts.
 if (entries.length > 500) throw new ApiError(400, "Too many entries in one save");
 const byStudent = new Map<string, { studentId: string; status: AttStatus }>();
 for (const e of entries) {
 if (!e.studentId || !isAttStatus(e.status)) continue;
 byStudent.set(e.studentId, { studentId: e.studentId, status: e.status });
 }
 const validEntries = [...byStudent.values()];

 // Previous statuses for this class-date — used to only notify students
 // whose status actually CHANGED on re-save (re-notify spam guard).
 const prevRows = await db.attendance.findMany({
 where: {
 scheduleId,
 date: classDate,
 studentId: { in: validEntries.map((e) => e.studentId) },
 },
 select: { studentId: true, status: true },
 });
 const prevStatus = new Map(prevRows.map((p) => [p.studentId, p.status]));

 // Roster validation — only students of this class batch may be marked.
 // (Same filter the roster GET uses: programId + semester + active.)
 const roster = await db.user.findMany({
 where: {
 departmentId: schedule.departmentId,
 role: "student",
 isActive: true,
 programId: schedule.programId,
 semester: schedule.semester,
 },
 select: { id: true },
 });
 const rosterIds = new Set(roster.map((s) => s.id));

 let saved = 0;
 const absentees: string[] = [];
 const ops: ReturnType<typeof db.attendance.upsert>[] = [];
 for (const e of validEntries) {
 if (!rosterIds.has(e.studentId)) {
 throw new ApiError(400, "Roster mismatch");
 }
 ops.push(
 db.attendance.upsert({
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
 })
 );
 saved++;
 // Notify only on a real status change (first-time absent included,
 // re-saves of an already-absent student are silent).
 if (e.status === "absent" && prevStatus.get(e.studentId) !== "absent") {
 absentees.push(e.studentId);
 }
 }

 // Batched upserts: chunked array-transactions instead of one await per
 // student (the libsql adapter handles modest batches well; chunks of 25
 // keep each transaction small).
 const CHUNK_SIZE = 25;
 for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
 await db.$transaction(ops.slice(i, i + CHUNK_SIZE));
 }

 // Notify absent students (skip when re-saving an already-marked day is fine —
 // upsert keeps one notification per save, which acts as a gentle reminder)
 if (absentees.length > 0) {
 await db.notification.createMany({
 data: absentees.map((studentId) => ({
 userId: studentId,
 title: `Absent marked: ${schedule.courseCode}`,
 body: `You were marked absent for ${schedule.courseCode} on ${classDate}. Contact your teacher if this is a mistake.`,
 type: "general",
 link: "/?view=dashboard",
 })),
 });
 }

 return {
 saved,
 absentNotified: absentees.length,
 // Summary counts the DEDUPED valid entries — the raw list could
 // double-count duplicates and exceed the number of saved rows.
 summary: {
 present: validEntries.filter((e) => e.status === "present").length,
 absent: absentees.length,
 late: validEntries.filter((e) => e.status === "late").length,
 excused: validEntries.filter((e) => e.status === "excused").length,
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

 // IDEMPOTENT + RACE-SAFE: roster read, absent sweep and session close
 // run inside ONE transaction; an already-closed session just reports
 // the stored state (double-tapping "Finalize" must not re-notify).
 const summary = await db.$transaction(async (tx) => {
 // Full roster of this class batch
 const roster = await tx.user.findMany({
 where: {
 departmentId: qr.departmentId,
 role: "student",
 isActive: true,
 programId: qr.schedule.programId,
 semester: qr.schedule.semester,
 },
 select: { id: true },
 });
 const alreadyMarked = await tx.attendance.findMany({
 where: { scheduleId: qr.scheduleId, date: qr.date },
 select: { studentId: true, status: true },
 });
 const markedIds = new Set(alreadyMarked.map((m) => m.studentId));
 const missing = roster.filter((st) => !markedIds.has(st.id));

 // Short-circuit: nothing missing OR the window was already finalized.
 if (!qr.closed && missing.length > 0) {
 // NOTE: no skipDuplicates — the SQLite connector does not support
 // it. Race safety comes from the serialized transaction: `missing`
 // is computed from rows read inside this same transaction.
 await tx.attendance.createMany({
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
 });
 await tx.notification.createMany({
 data: missing.map((st) => ({
 userId: st.id,
 title: `Absent marked: ${qr.schedule.courseCode}`,
 body: `You did not scan the QR check-in for ${qr.schedule.courseCode} on ${qr.date}, so you were marked absent. Contact your teacher if this is a mistake.`,
 type: "general",
 link: "/?view=dashboard",
 })),
 });
 }

 // Guarded close — a concurrent finalize may have closed it already.
 await tx.attendanceSession.updateMany({
 where: { id: qr.id, closed: false },
 data: { closed: true },
 });

 return {
 absentMarked: qr.closed ? 0 : missing.length,
 absentTotal:
 alreadyMarked.filter((m) => m.status === "absent").length +
 (qr.closed ? 0 : missing.length),
 present: alreadyMarked.filter((m) => m.status === "present").length,
 late: alreadyMarked.filter((m) => m.status === "late").length,
 excused: alreadyMarked.filter((m) => m.status === "excused").length,
 total: roster.length,
 };
 });

 return summary;
 }

 // ---------- Notices (teacher publishes to their department) ----------
 if (action === "notices") {
 // Type-guard user text first — a numeric title used to 500 inside .trim().
 const title = asStr(body.title, "Title");
 const content = asStr(body.content, "Content");
 const { category, audience, courseId, isPinned } = body as {
 category?: string;
 audience?: string;
 courseId?: string;
 isPinned?: boolean;
 };
 if (!title.trim() || !content.trim()) {
 throw new ApiError(400, "Title and content are required");
 }
 const audienceVal = ["all", "students", "teachers"].includes(String(audience))
 ? String(audience)
 : "all";
 const categoryVal =
 category && VALID_NOTICE_CATEGORIES.has(String(category))
 ? String(category)
 : "general";
 const titleVal = title.trim().slice(0, 150);
 const contentVal = content.trim().slice(0, 5000);

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
 title: titleVal,
 content: contentVal,
 category: categoryVal,
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
 const nTitle = `Notice: ${titleVal.slice(0, 60)}`;
 const nBody = `${scopeCode ? `[${scopeCode}] ` : ""}${contentVal.slice(0, 140)}`;
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
 effectiveDate,
 } = body as Record<string, string>;
 // Type-guard the free-text reason — a numeric reason used to 500.
 const reason = asStr(body.reason, "Reason");

 if (!scheduleId || !changeType || !reason.trim()) {
 throw new ApiError(400, "Schedule, change type and reason are required");
 }
 // Whitelist the change type (the route only supports these five modes),
 // the target day, and the effective date format.
 if (!(CHANGE_TYPES as readonly string[]).includes(changeType)) {
 throw new ApiError(400, "Invalid change type");
 }
 // REALITY CHECK: "rescheduled" with no new day/slot/room is a no-op
 // that used to produce a change record that changed nothing.
 if (changeType === "rescheduled" && !newDay && !newTimeSlotId && !newRoomId) {
 throw new ApiError(
 400,
 "A reschedule needs at least a new day, time slot or room"
 );
 }
 if (newDay && !DAYS.includes(newDay)) {
 throw new ApiError(400, "Invalid day of week");
 }
 if (effectiveDate && !DATE_RE.test(effectiveDate)) {
 throw new ApiError(400, "Date must be YYYY-MM-DD");
 }
 // REALITY CHECK: a class that already happened (yesterday or earlier)
 // cannot be cancelled/rescheduled today — changes apply from today on.
 if (effectiveDate && effectiveDate < todayStr()) {
 throw new ApiError(
 400,
 "You cannot change a class in the past — pick today or a future date"
 );
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

 // Room + teacher clash guard — the effective (day, time-window, room)
 // must be free AND the teacher must not already teach another class in
 // an overlapping window. Previously only exact same-slot matches were
 // caught, so 10:00-11:00 vs 10:30-11:30 slipped through both checks.
 if (changeType !== "cancelled") {
 const effDay = newDay ?? schedule.dayOfWeek;
 const effSlotId = newTimeSlotId ?? schedule.timeSlotId;
 const effRoomId = newRoomId ?? schedule.roomId;
 if (changeType === "extra_class" && !newTimeSlotId) {
 throw new ApiError(400, "Pick a time slot for the extra class");
 }
 const effStart = newTime?.startTime ?? schedule.startTime;
 const effEnd = newTime?.endTime ?? schedule.endTime;
 const sameDay = await db.schedule.findMany({
 where: {
 departmentId: schedule.departmentId,
 isActive: true,
 dayOfWeek: effDay,
 NOT: { id: schedule.id },
 },
 select: {
 id: true, courseId: true, courseCode: true, teacherId: true,
 teacherName: true, roomId: true, roomNumber: true, timeSlotId: true,
 startTime: true, endTime: true,
 },
 });
 const overlapping = sameDay.filter((s) =>
 windowsOverlap(s.startTime, s.endTime, effStart, effEnd, s.timeSlotId === effSlotId)
 );
 const roomClash = overlapping.find((s) => s.roomId === effRoomId);
 if (roomClash) {
 throw new ApiError(
 409,
 `Room ${roomClash.roomNumber} is already booked at that time by ${roomClash.courseCode} (${roomClash.teacherName}). Pick a free room from the finder.`
 );
 }
 const teacherClash = overlapping.find((s) => s.teacherId === schedule.teacherId);
 if (teacherClash) {
 throw new ApiError(
 409,
 `You already teach ${teacherClash.courseCode} in an overlapping slot on ${effDay} — pick a different time`
 );
 }
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
 reason: reason.trim().slice(0, 300),
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
 type: CHANGE_NOTIF_TYPE[changeType] ?? "general",
 link: `/?view=department&dept=${schedule.departmentId}`,
 })),
 {
 userId: schedule.teacherId,
 title: notifTitle,
 body: notifBody,
 type: CHANGE_NOTIF_TYPE[changeType] ?? "general",
 link: "/?view=dashboard",
 },
 ];
 await db.notification.createMany({ data: fanout });

 return { change, notice, notified: fanout.length };
 }

 // ---------- Assignments ----------
 if (action === "assignments") {
 // Type-guard user text first — a numeric title used to 500 inside .trim().
 const title = asStr(body.title, "Title");
 const description = asStr(body.description, "Description");
 const courseId = body.courseId as string | undefined;
 const dueDate = body.dueDate as string | undefined;
 const maxMarks = body.maxMarks as string | number | undefined;
 if (!courseId || !title.trim() || !description.trim()) {
 throw new ApiError(400, "Course, title and description are required");
 }
 // REALITY CHECK: a deadline in the past would mark every submission
 // overdue the moment it is published.
 if (dueDate) {
 const due = new Date(dueDate);
 if (Number.isNaN(due.getTime())) {
 throw new ApiError(400, "Due date is not a valid date");
 }
 if (due.getTime() < Date.now() - 60_000) {
 throw new ApiError(400, "Due date must be in the future");
 }
 }
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);
 // Ownership guard: teachers write only against their own courses.
 await assertTeacherOwnsCourse(session, courseId);

 const assignment = await db.assignment.create({
 data: {
 departmentId: course.departmentId,
 courseId,
 teacherId: session.userId,
 title: title.trim().slice(0, 150),
 description: description.trim().slice(0, 5000),
 dueDate: dueDate ? new Date(dueDate) : null,
 maxMarks: maxMarks ? parseMaxMarks(maxMarks) : null,
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
 // examType feeds analytics keyed on a fixed set — arbitrary values
 // silently dropped out of every breakdown before.
 if (!VALID_EXAM_TYPES.has(examType)) {
 throw new ApiError(400, "Exam type must be ct1, ct2, midterm, final or assignment");
 }
 if (entries.length > 500) throw new ApiError(400, "Too many entries in one save");
 const course = await db.course.findUnique({ where: { id: courseId } });
 if (!course) throw new ApiError(404, "Course not found");
 assertDepartmentAccess(session, course.departmentId);
 // Ownership guard: teachers publish results only for their own courses.
 await assertTeacherOwnsCourse(session, courseId);

 // Marks scale: default 20 (existing convention) — a custom maxMarks is
 // accepted so other scales don't corrupt the percentage math.
 const maxMarks = body.maxMarks !== undefined && body.maxMarks !== null && body.maxMarks !== ""
 ? parseMaxMarks(body.maxMarks)
 : 20;

 // Roster validation — same batch filter the results roster GET uses.
 const roster = await db.user.findMany({
 where: {
 departmentId: course.departmentId,
 role: "student",
 isActive: true,
 programId: course.programId,
 semester: course.semester,
 },
 select: { id: true },
 });
 const rosterIds = new Set(roster.map((s) => s.id));

 let saved = 0;
 const ops: ReturnType<typeof db.result.upsert>[] = [];
 const notifications: {
 userId: string;
 title: string;
 body: string;
 type: string;
 }[] = [];
 for (const e of entries) {
 if (e.marks === undefined || e.marks === null || !e.studentId) continue;
 if (!rosterIds.has(e.studentId)) {
 throw new ApiError(400, "Roster mismatch");
 }
 const marks = Number(e.marks);
 if (!Number.isFinite(marks) || marks < 0 || marks > maxMarks) {
 throw new ApiError(
 400,
 `Marks must be a number between 0 and ${maxMarks}`
 );
 }
 // Grade must be a real UGC letter — free-text grades corrupted the
 // analytics group-bys; unknown letters are rejected up-front.
 const gradeVal =
 e.grade === undefined || e.grade === null || e.grade === ""
 ? null
 : String(e.grade);
 if (gradeVal !== null && !VALID_GRADES.has(gradeVal)) {
 throw new ApiError(
 400,
 `Invalid grade "${gradeVal}" — valid grades are: ${[...VALID_GRADES].join(", ")}`
 );
 }
 // Remarks are an annotation, not an essay — cap at 500 chars.
 const remarksVal =
 e.remarks === undefined || e.remarks === null
 ? null
 : String(e.remarks).slice(0, 500);
 ops.push(
 db.result.upsert({
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
 marks,
 maxMarks,
 grade: gradeVal,
 remarks: remarksVal,
 },
 update: {
 marks,
 grade: gradeVal,
 remarks: remarksVal,
 },
 })
 );
 notifications.push({
 userId: e.studentId,
 title: `Result Published: ${course.code}`,
 body: `Your ${examType.toUpperCase()} result for ${course.code} is published: ${marks}/${maxMarks}${gradeVal ? ` (Grade ${gradeVal})` : ""}`,
 type: "result",
 });
 saved++;
 }

 // Batched upserts — chunked array-transactions (COST GUARD: no more
 // one-await-per-student round trips).
 const CHUNK_SIZE = 25;
 for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
 await db.$transaction(ops.slice(i, i + CHUNK_SIZE));
 }

 // ONE fan-out write instead of a per-student notification.create.
 if (notifications.length) {
 await db.notification.createMany({ data: notifications });
 }
 return { saved };
 }

 // ---------- Student batch controls: move to semester ----------
 if (action === "students-move") {
 // Covers all batch cases: promote all (select all), hold (no-op not sent),
 // promote/demote individuals, repeat a year — the UI sends an explicit list.
 const { studentIds, toSemester } = body as { studentIds?: string[]; toSemester?: number };
 if (!Array.isArray(studentIds) || studentIds.length === 0) {
 throw new ApiError(400, "Select at least one student");
 }
 const target = Number(toSemester);
 if (!Number.isInteger(target) || target < 1 || target > 12) {
 throw new ApiError(400, "Target semester must be between 1 and 12");
 }
 const students = await db.user.findMany({
 where: {
 id: { in: studentIds.slice(0, 500) },
 departmentId: session.departmentId!,
 role: "student",
 },
 select: {
 id: true,
 semester: true,
 program: { select: { shortName: true, semesterCount: true } },
 },
 });
 if (students.length === 0) throw new ApiError(404, "No students found in your department");
 const over = students.filter((s) => s.program && target > s.program.semesterCount);
 if (over.length > 0) {
 throw new ApiError(
 400,
 `Target semester ${target} exceeds program length (${over[0].program?.semesterCount} semesters) for ${over.length} student(s)`
 );
 }
 const moved = students.filter((s) => s.semester !== target);
 if (moved.length === 0) {
 return { moved: 0, toSemester: target, alreadyThere: students.length };
 }
 await db.user.updateMany({
 where: { id: { in: moved.map((s) => s.id) } },
 data: { semester: target },
 });
 // Gentle fan-out notification (one createMany — COST GUARD)
 await db.notification.createMany({
 data: moved.map((s) => ({
 userId: s.id,
 title: "Semester updated",
 body: `You have been moved to semester ${target}${target > (s.semester ?? 0) ? " — promoted" : ""}. Check your new routine and courses.`,
 type: "general",
 link: "/?view=dashboard",
 })),
 });
 return { moved: moved.length, toSemester: target, alreadyThere: students.length - moved.length };
 }

 // ---------- Student batch controls: activate / deactivate ----------
 if (action === "students-status") {
 const { studentIds, isActive } = body as { studentIds?: string[]; isActive?: boolean };
 if (!Array.isArray(studentIds) || studentIds.length === 0) {
 throw new ApiError(400, "Select at least one student");
 }
 if (typeof isActive !== "boolean") {
 throw new ApiError(400, "isActive must be true or false");
 }
 const result = await db.user.updateMany({
 where: {
 id: { in: studentIds.slice(0, 500) },
 departmentId: session.departmentId!,
 role: "student",
 },
 data: { isActive },
 });
 return { updated: result.count, isActive };
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
 // Cross-tenant guard: a dept_admin of ANOTHER department must not be
 // able to update this assignment just because of their role.
 assertDepartmentAccess(session, a.departmentId);
 const data: Record<string, unknown> = {};
 if (typeof body.title === "string" && body.title.trim())
 data.title = body.title.trim().slice(0, 150);
 if (typeof body.description === "string")
 data.description = body.description.trim().slice(0, 5000);
 if (body.dueDate !== undefined) {
 // Same validation POST applies: garbage dates 400 (a raw `new Date`
 // used to store Invalid Date → opaque Prisma 500) and the deadline
 // must still be in the future on edit.
 if (body.dueDate === null || body.dueDate === "") {
 data.dueDate = null;
 } else {
 const due = new Date(String(body.dueDate));
 if (Number.isNaN(due.getTime())) {
 throw new ApiError(400, "Due date is not a valid date");
 }
 if (due.getTime() < Date.now() - 60_000) {
 throw new ApiError(400, "Due date must be in the future");
 }
 data.dueDate = due;
 }
 }
 if (body.maxMarks !== undefined) {
 data.maxMarks =
 body.maxMarks === null || body.maxMarks === ""
 ? null
 : parseMaxMarks(body.maxMarks);
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
 // Cross-tenant guard (same as PUT) — role alone is not enough.
 assertDepartmentAccess(session, a.departmentId);
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
 // Cross-tenant guard — dept_admins may only touch their own dept.
 assertDepartmentAccess(session, n.departmentId);
 await db.notice.delete({ where: { id } });
 return { deleted: true };
 }
 throw new ApiError(404, "Unknown action");
 });
}
