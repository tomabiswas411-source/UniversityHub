import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";

/**
 * GET /api/student/attendance-sheet
 *
 * The student's own row of each subject's master register — ONE sheet
 * per course, every class day in date order (all weekly slots merged,
 * all-time). Powers the "My attendance sheet" expandable rows in the
 * Performance tab.
 *
 * COST GUARD: one indexed query on (studentId, courseId) + one tiny
 * course-name lookup. Runs only when the student opens Performance.
 */
export async function GET() {
 return handle(async () => {
 const session = await requireSession();
 if (session.role !== "student") {
 throw new ApiError(403, "Student access required");
 }

 const rows = await db.attendance.findMany({
 where: { studentId: session.userId },
 select: { courseId: true, courseCode: true, date: true, status: true },
 // Newest-first + cap: once a student passes the cap the sheet must keep
 // the NEWEST records (ascending order used to silently drop them).
 orderBy: [{ date: "desc" }],
 take: 600, // a semester batch — bounded like every list endpoint
 });

 if (rows.length === 0) {
 return { hasData: false, courses: [] };
 }
 rows.reverse(); // back to oldest → newest for display within the cap

 // Group per course, preserving date order
 const byCourse = new Map<string, { code: string; days: { date: string; status: string }[] }>();
 for (const r of rows) {
 let entry = byCourse.get(r.courseId);
 if (!entry) {
 entry = { code: r.courseCode, days: [] };
 byCourse.set(r.courseId, entry);
 }
 entry.days.push({ date: r.date, status: r.status });
 }

 // Course display names — one tiny query for the handful of course ids
 const names = await db.course.findMany({
 where: { id: { in: [...byCourse.keys()] } },
 select: { id: true, name: true },
 });
 const nameById = new Map(names.map((c) => [c.id, c.name]));

 const courses = [...byCourse.entries()].map(([courseId, entry]) => {
 let present = 0, absent = 0, late = 0, excused = 0;
 for (const d of entry.days) {
 if (d.status === "present") present += 1;
 else if (d.status === "absent") absent += 1;
 else if (d.status === "late") late += 1;
 else if (d.status === "excused") excused += 1;
 }
 const counted = present + late + absent; // excused excluded, same as Performance
 return {
 courseId,
 courseCode: entry.code,
 courseName: nameById.get(courseId) ?? entry.code,
 dates: entry.days,
 present,
 absent,
 late,
 excused,
 total: entry.days.length,
 pct: counted > 0 ? Math.round(((present + late) / counted) * 100) : 0,
 };
 });

 return { hasData: true, courses };
 });
}
