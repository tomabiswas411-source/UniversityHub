import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { computeCoursePerformance, computeGPA, resultPct, percentToGrade } from "@/lib/grades";
import { bdWeekday } from "@/lib/date-bd";
import type {
 AssignmentDTO,
 NoticeDTO,
 ScheduleChangeDTO,
 ScheduleDTO,
 ResultDTO,
 AcademicCalendarDTO,
} from "@/types";

/** Attendance rate: present + late count as attended; excused excluded. */
function attendanceRate(present: number, late: number, absent: number, excused: number): number {
 const counted = present + late + absent;
 if (counted === 0) return 0;
 return Math.round(((present + late) / counted) * 100);
}

/**
 * GET /api/student/dashboard
 * Everything the student dashboard needs in one call.
 */
export async function GET() {
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "student") {
 throw new ApiError(403, "Student access required");
 }
 const user = await db.user.findUnique({ where: { id: session.userId } });
 if (!user || !user.departmentId || !user.universityId) {
 throw new ApiError(404, "Student profile incomplete");
 }
 const departmentId = user.departmentId;
 const programId = user.programId;
 const semester = user.semester;

 const department = await db.department.findUnique({
 where: { id: departmentId },
 include: {
 university: { select: { name: true, shortName: true, slug: true } },
 },
 });

 const [schedules, changes, notices, assignments, results, unreadCount, timeSlots, calendar, attByStatus, attByCourseGroups] =
 await Promise.all([
 programId
 ? db.schedule.findMany({
 where: {
 departmentId,
 programId,
 semester: semester ?? 1,
 isActive: true,
 },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
 })
 : Promise.resolve([] as Awaited<ReturnType<typeof db.schedule.findMany>>),
 db.scheduleChange.findMany({
 where: {
 departmentId,
 isActive: true,
 ...(programId ? { programId } : {}),
 ...(semester ? { semester } : {}),
 },
 orderBy: { effectiveDate: "desc" },
 take: 30,
 }),
 db.notice.findMany({
 where: {
 departmentId,
 audience: { in: ["all", "students"] },
 AND: [
 // program-targeted notices: null = all programs. No more
 // "none"-sentinel matching (which could never hit a real id).
 { OR: [{ programId: null }, { programId: user.programId }] },
 // semester-targeted notices: null = all semesters.
 { OR: [{ semester: null }, { semester: user.semester }] },
 ],
 },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 30,
 }),
 db.assignment.findMany({
 where: {
 departmentId,
 isActive: true,
 course: {
 ...(programId ? { programId } : {}),
 ...(semester ? { semester } : {}),
 },
 },
 include: {
 course: { select: { code: true, name: true } },
 teacher: { select: { fullName: true } },
 },
 orderBy: { createdAt: "desc" },
 take: 20,
 }),
 db.result.findMany({
 where: { departmentId, studentId: user.id },
 include: { course: { select: { code: true, name: true } } },
 orderBy: { createdAt: "desc" },
 take: 300,
 }),
 db.notification.count({
 where: { userId: user.id, isRead: false },
 }),
 db.timeSlot.findMany({
 where: { departmentId, isActive: true },
 orderBy: { slotOrder: "asc" },
 }),
 db.academicCalendar.findMany({
 where: {
 universityId: user.universityId,
 date: { gte: new Date() },
 },
 orderBy: { date: "asc" },
 take: 6,
 }),
 // ALL-TIME attendance summary — grouped counts instead of a row slice.
 // The old take-300 findMany made the % drift once history outgrew the
 // cap; a groupBy has no row limit and stays exact at any size.
 db.attendance.groupBy({
 by: ["status"],
 where: { studentId: user.id },
 _count: true,
 }),
 db.attendance.groupBy({
 by: ["courseId", "courseCode", "status"],
 where: { studentId: user.id },
 _count: true,
 }),
 ]);

 const scheduleDTOs: ScheduleDTO[] = schedules.map((s) => ({
 id: s.id,
 departmentId: s.departmentId,
 courseId: s.courseId,
 teacherId: s.teacherId,
 roomId: s.roomId,
 timeSlotId: s.timeSlotId,
 programId: s.programId,
 semester: s.semester,
 courseCode: s.courseCode,
 courseName: s.courseName,
 teacherName: s.teacherName,
 roomNumber: s.roomNumber,
 startTime: s.startTime,
 endTime: s.endTime,
 dayOfWeek: s.dayOfWeek as ScheduleDTO["dayOfWeek"],
 classType: s.classType as "theory" | "lab",
 isActive: s.isActive,
 }));

 const changeDTOs: ScheduleChangeDTO[] = changes.map((c) => ({
 id: c.id,
 departmentId: c.departmentId,
 scheduleId: c.scheduleId,
 changeType: c.changeType as ScheduleChangeDTO["changeType"],
 originalDay: c.originalDay,
 originalStartTime: c.originalStartTime,
 originalEndTime: c.originalEndTime,
 originalRoomNumber: c.originalRoomNumber,
 newDay: c.newDay,
 newStartTime: c.newStartTime,
 newEndTime: c.newEndTime,
 newRoomNumber: c.newRoomNumber,
 effectiveDate: c.effectiveDate,
 reason: c.reason,
 courseCode: c.courseCode,
 courseName: c.courseName,
 teacherName: c.teacherName,
 semester: c.semester,
 changedByName: c.changedByName,
 createdAt: c.createdAt.toISOString(),
 }));

 const noticeDTOs: NoticeDTO[] = notices.map((n) => ({
 id: n.id,
 departmentId: n.departmentId,
 title: n.title,
 content: n.content,
 category: n.category as NoticeDTO["category"],
 audience: n.audience as NoticeDTO["audience"],
 programId: n.programId,
 semester: n.semester,
 postedByName: n.postedByName,
 isPinned: n.isPinned,
 isAutoGenerated: n.isAutoGenerated,
 createdAt: n.createdAt.toISOString(),
 }));

 const assignmentDTOs: AssignmentDTO[] = assignments.map((a) => ({
 id: a.id,
 departmentId: a.departmentId,
 courseId: a.courseId,
 courseCode: a.course?.code,
 courseName: a.course?.name,
 teacherId: a.teacherId,
 teacherName: a.teacher?.fullName,
 title: a.title,
 description: a.description,
 dueDate: a.dueDate?.toISOString() ?? null,
 maxMarks: a.maxMarks,
 createdAt: a.createdAt.toISOString(),
 }));

 const resultDTOs: ResultDTO[] = results.map((r) => ({
 id: r.id,
 courseId: r.courseId,
 courseCode: r.course?.code,
 courseName: r.course?.name,
 studentId: r.studentId,
 examType: r.examType,
 marks: r.marks,
 maxMarks: r.maxMarks,
 grade: r.grade,
 remarks: r.remarks,
 createdAt: r.createdAt.toISOString(),
 }));

 const calendarDTOs: AcademicCalendarDTO[] = calendar.map((c) => ({
 id: c.id,
 universityId: c.universityId,
 departmentId: c.departmentId,
 title: c.title,
 date: c.date.toISOString(),
 endDate: c.endDate?.toISOString() ?? null,
 eventType: c.eventType as AcademicCalendarDTO["eventType"],
 description: c.description,
 }));

 // Weekday in Asia/Dhaka (server clock may be UTC → wrong "today").
 const today = bdWeekday();
 const todayClasses = scheduleDTOs.filter(
 (s) => s.dayOfWeek === today
 ).length;

 /* ---------- Day 44: student performance analytics ---------- */
 const byCourse = new Map<string, { code: string; name: string; credit: number; results: { marks: number; maxMarks: number; examType: string }[] }>();
 for (const r of results) {
 const cur = byCourse.get(r.courseId) ?? {
 code: r.course?.code ?? "—",
 name: r.course?.name ?? "",
 credit: 3,
 results: [],
 };
 cur.results.push({ marks: r.marks, maxMarks: r.maxMarks, examType: r.examType });
 byCourse.set(r.courseId, cur);
 }
 const coursePerformance = [...byCourse.entries()].map(([id, c]) => ({
 courseId: id,
 ...computeCoursePerformance(c.code, c.name, c.results, c.credit),
 }));
 coursePerformance.sort((a, b) => b.avgPct - a.avgPct);
 const estimatedGPA = computeGPA(coursePerformance);
 const overallAvgPct = results.length
 ? Math.round((results.reduce((a, r) => a + resultPct(r), 0) / results.length) * 10) / 10
 : 0;
 const overallGrade = results.length ? percentToGrade(overallAvgPct).letter : "—";

 const examTrend = ["ct1", "ct2", "midterm", "final", "assignment"]
 .map((t) => {
 const rs = results.filter((r) => r.examType === t);
 return {
 type: t,
 label: t === "ct1" ? "CT-1" : t === "ct2" ? "CT-2" : t.charAt(0).toUpperCase() + t.slice(1),
 pct: rs.length ? Math.round((rs.reduce((a, r) => a + resultPct(r), 0) / rs.length) * 10) / 10 : 0,
 };
 })
 .filter((e) => results.some((r) => r.examType === e.type))
 .map(({ label, pct }) => ({ label, pct }));

 const upcomingDeadlines = assignmentDTOs
 .filter((a) => a.dueDate && new Date(a.dueDate).getTime() > Date.now())
 .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
 .slice(0, 5);

 /* ---------- Attendance analytics (all-time grouped counts) ---------- */
 const attCounts = { present: 0, absent: 0, late: 0, excused: 0 };
 for (const g of attByStatus) {
 if (g.status === "present") attCounts.present += g._count;
 else if (g.status === "absent") attCounts.absent += g._count;
 else if (g.status === "late") attCounts.late += g._count;
 else if (g.status === "excused") attCounts.excused += g._count;
 }
 const attByCourse = new Map<
 string,
 { courseCode: string; present: number; late: number; absent: number; excused: number }
 >();
 let attTotal = 0;
 for (const g of attByCourseGroups) {
 const n = g._count;
 attTotal += n;
 const cur =
 attByCourse.get(g.courseId) ??
 { courseCode: g.courseCode, present: 0, late: 0, absent: 0, excused: 0 };
 if (g.status === "present") cur.present += n;
 else if (g.status === "absent") cur.absent += n;
 else if (g.status === "late") cur.late += n;
 else if (g.status === "excused") cur.excused += n;
 attByCourse.set(g.courseId, cur);
 }
 const attendanceAnalytics = {
 hasData: attTotal > 0,
 rate: attendanceRate(attCounts.present, attCounts.late, attCounts.absent, attCounts.excused),
 attended: attCounts.present + attCounts.late,
 total: attCounts.present + attCounts.late + attCounts.absent,
 absent: attCounts.absent,
 excused: attCounts.excused,
 perCourse: [...attByCourse.entries()]
 .map(([courseId, c]) => ({
 courseId,
 courseCode: c.courseCode,
 attended: c.present + c.late,
 total: c.present + c.late + c.absent,
 pct: attendanceRate(c.present, c.late, c.absent, c.excused),
 }))
 .sort((a, b) => a.pct - b.pct),
 };

 const analytics = {
 hasData: results.length > 0,
 estimatedGPA,
 overallAvgPct,
 overallGrade,
 totalEntries: results.length,
 coursePerformance,
 examTrend,
 upcomingDeadlines,
 };

 return {
 profile: {
 fullName: user.fullName,
 rollNumber: user.rollNumber,
 studentIdNumber: user.studentIdNumber,
 semester: user.semester,
 section: user.section,
 departmentName: department?.name ?? null,
 departmentShortName: department?.shortName ?? null,
 departmentId: department?.id ?? null,
 universityName: department?.university?.name ?? null,
 programId: user.programId,
 },
 schedules: scheduleDTOs,
 changes: changeDTOs,
 notices: noticeDTOs,
 assignments: assignmentDTOs,
 results: resultDTOs,
 timeSlots: timeSlots.map((t) => ({
 id: t.id,
 departmentId: t.departmentId,
 label: t.label,
 startTime: t.startTime,
 endTime: t.endTime,
 slotOrder: t.slotOrder,
 isBreak: t.isBreak,
 isActive: t.isActive,
 })),
 calendar: calendarDTOs,
 unreadCount,
 todayClasses,
 attendance: attendanceAnalytics,
 analytics,
 };
 });
}
