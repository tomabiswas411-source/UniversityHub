import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { bdTodayISO, bdDayStartUTC, weekdayOfDate } from "@/lib/date-bd";
import { percentToGrade, resultPct } from "@/lib/grades";
import { DAY_LABELS, type DayOfWeek } from "@/types";

/**
 * GET /api/student/export?type=<type>
 *
 * Student self-service documents — the student mirror of the teacher's
 * export endpoint. Everything a student can SEE in the dashboard they can
 * also DOWNLOAD as an Excel-ready CSV:
 *
 *   routine      → My Weekly Routine
 *   attendance   → My Attendance Ledger (summary + every class day, every subject)
 *   results      → My Marksheet (every exam result ever published)
 *   assignments  → My Assignments
 *   notices      → Department Notices
 *   calendar     → Academic Calendar (upcoming)
 *
 * COST GUARD: CSV is built server-side as one small text payload and
 * returned as JSON — the client turns it into a .csv Blob download.
 * One request per download, no polling. Every query is scoped to the
 * signed-in student (or their program/department) and bounded with take.
 */
export async function GET(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "student") {
 throw new ApiError(403, "Student access required");
 }
 const user = await db.user.findUnique({
 where: { id: session.userId },
 select: {
 departmentId: true,
 universityId: true,
 programId: true,
 semester: true,
 fullName: true,
 rollNumber: true,
 studentIdNumber: true,
 },
 });
 if (!user || !user.departmentId || !user.universityId) {
 throw new ApiError(404, "Student profile incomplete");
 }

 const type = req.nextUrl.searchParams.get("type");
 const esc = (v: unknown) => {
 const s = String(v ?? "");
 return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
 };
 const toCsv = (rows: (string | number | null | undefined)[][]) =>
 rows.map((r) => r.map(esc).join(",")).join("\n");
 const today = bdTodayISO();
 const dayLabel = (d: string | null) =>
 d ? (DAY_LABELS[d as DayOfWeek] ?? d) : "";
 let filename = `export-${today}.csv`;
 let csv = "";

 switch (type) {
 /* ---------------- My Weekly Routine ---------------- */
 case "routine": {
 const schedules = user.programId
 ? await db.schedule.findMany({
 where: {
 departmentId: user.departmentId,
 programId: user.programId,
 semester: user.semester ?? 1,
 isActive: true,
 },
 orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
 })
 : [];
 filename = `my-weekly-routine-${today}.csv`;
 csv = toCsv([
 ["Day", "Start", "End", "Course Code", "Course Name", "Type", "Room", "Teacher"],
 ...schedules.map((s) => [
 dayLabel(s.dayOfWeek),
 s.startTime,
 s.endTime,
 s.courseCode,
 s.courseName,
 s.classType,
 s.roomNumber,
 s.teacherName,
 ]),
 ]);
 break;
 }

 /* ---------------- My Attendance Ledger ----------------
 One row per class day per subject — filterable in Excel by
 course. Status letters: P present · L late · A absent ·
 E excused (matches the on-screen sheet). */
 case "attendance": {
 const [rows, courses] = await Promise.all([
 db.attendance.findMany({
 where: { studentId: session.userId },
 select: { courseId: true, courseCode: true, date: true, status: true, markedByName: true },
 orderBy: [{ date: "asc" }, { courseCode: "asc" }],
 take: 2000,
 }),
 db.course.findMany({
 where: { departmentId: user.departmentId },
 select: { id: true, name: true },
 }),
 ]);
 const nameById = new Map(courses.map((c) => [c.id, c.name]));
 // Per-course summary block comes first — students get the headline
 // numbers without needing a pivot table.
 const summary = new Map<string, { code: string; present: number; late: number; absent: number; excused: number }>();
 for (const r of rows) {
 const cur =
 summary.get(r.courseId) ??
 { code: r.courseCode, present: 0, late: 0, absent: 0, excused: 0 };
 if (r.status === "present") cur.present += 1;
 else if (r.status === "late") cur.late += 1;
 else if (r.status === "absent") cur.absent += 1;
 else if (r.status === "excused") cur.excused += 1;
 summary.set(r.courseId, cur);
 }
 const letter: Record<string, string> = {
 present: "P", absent: "A", late: "L", excused: "E",
 };
 filename = `my-attendance-ledger-${today}.csv`;
 const lines: string[] = [];
 lines.push("Course Code,Course Name,Present,Late,Absent,Excused,Counted Classes,Attendance %");
 for (const [courseId, s] of summary) {
 const counted = s.present + s.late + s.absent; // excused excluded, same as dashboard
 lines.push(
 toCsv([[
 s.code,
 nameById.get(courseId) ?? s.code,
 s.present,
 s.late,
 s.absent,
 s.excused,
 counted,
 counted > 0 ? `${Math.round(((s.present + s.late) / counted) * 100)}%` : "0%",
 ]])
 );
 }
 lines.push("");
 lines.push("Course Code,Course Name,Date,Day,Status,Marked By");
 for (const r of rows) {
 lines.push(
 toCsv([[
 r.courseCode,
 nameById.get(r.courseId) ?? r.courseCode,
 r.date,
 dayLabel(weekdayOfDate(r.date)),
 letter[r.status] ?? r.status,
 r.markedByName ?? "",
 ]])
 );
 }
 csv = lines.join("\n");
 break;
 }

 /* ---------------- My Marksheet ---------------- */
 case "results": {
 const results = await db.result.findMany({
 where: { studentId: session.userId },
 include: { course: { select: { code: true, name: true } } },
 orderBy: [{ createdAt: "desc" }],
 take: 500,
 });
 filename = `my-marksheet-${today}.csv`;
 csv = toCsv([
 ["Course Code", "Course Name", "Exam Type", "Marks", "Max Marks", "Percent", "Grade", "Remarks", "Published"],
 ...results.map((r) => [
 r.course?.code ?? "",
 r.course?.name ?? "",
 r.examType,
 r.marks,
 r.maxMarks,
 `${resultPct(r)}%`,
 r.grade ?? percentToGrade(resultPct(r)).letter,
 r.remarks ?? "",
 r.createdAt.toISOString().slice(0, 10),
 ]),
 ]);
 break;
 }

 /* ---------------- My Assignments ---------------- */
 case "assignments": {
 const assignments = await db.assignment.findMany({
 where: {
 departmentId: user.departmentId,
 isActive: true,
 course: {
 // Legacy students without a program get an honest empty feed —
 // never another program's assignments (same rule as dashboard).
 ...(user.programId
 ? { programId: user.programId }
 : { programId: user.programId ?? "__no_program__" }),
 ...(user.semester ? { semester: user.semester } : {}),
 },
 },
 include: {
 course: { select: { code: true, name: true } },
 teacher: { select: { fullName: true } },
 },
 orderBy: { createdAt: "desc" },
 take: 300,
 });
 filename = `my-assignments-${today}.csv`;
 csv = toCsv([
 ["Title", "Course Code", "Course Name", "Teacher", "Due Date", "Max Marks", "Posted", "Description"],
 ...assignments.map((a) => [
 a.title,
 a.course?.code ?? "",
 a.course?.name ?? "",
 a.teacher?.fullName ?? "",
 a.dueDate ? a.dueDate.toISOString().slice(0, 10) : "",
 a.maxMarks ?? "",
 a.createdAt.toISOString().slice(0, 10),
 a.description ?? "",
 ]),
 ]);
 break;
 }

 /* ---------------- Department Notices ---------------- */
 case "notices": {
 const notices = await db.notice.findMany({
 where: {
 departmentId: user.departmentId,
 audience: { in: ["all", "students"] },
 OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
 AND: [
 { OR: [{ programId: null }, { programId: user.programId }] },
 { OR: [{ semester: null }, { semester: user.semester }] },
 ],
 },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 300,
 });
 filename = `department-notices-${today}.csv`;
 csv = toCsv([
 ["Title", "Category", "Audience", "Pinned", "Posted By", "Posted On", "Expires", "Content"],
 ...notices.map((n) => [
 n.title,
 n.category,
 n.audience,
 n.isPinned ? "Yes" : "No",
 n.postedByName,
 n.createdAt.toISOString().slice(0, 10),
 n.expiryDate ? n.expiryDate.toISOString().slice(0, 10) : "Open-ended",
 n.content,
 ]),
 ]);
 break;
 }

 /* ---------------- Academic Calendar ---------------- */
 case "calendar": {
 const events = await db.academicCalendar.findMany({
 where: {
 universityId: user.universityId,
 OR: [{ departmentId: null }, { departmentId: user.departmentId }],
 date: { gte: bdDayStartUTC() },
 },
 orderBy: { date: "asc" },
 take: 200,
 });
 filename = `academic-calendar-${today}.csv`;
 csv = toCsv([
 ["Title", "Date", "End Date", "Type", "Scope", "Description"],
 ...events.map((e) => [
 e.title,
 e.date.toISOString().slice(0, 10),
 e.endDate ? e.endDate.toISOString().slice(0, 10) : "",
 e.eventType,
 e.departmentId ? "Department" : "University-wide",
 e.description ?? "",
 ]),
 ]);
 break;
 }

 default:
 throw new ApiError(400, "Unknown export type");
 }

 return { filename, csv };
 });
}
