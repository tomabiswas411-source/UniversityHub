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

 // Grid cells stay a bounded fetch (take 600) — the newest rows keep the
 // sheet readable — but the per-course summary/% come from grouped counts
 // so the ALL-TIME percentages stay exact no matter how large the history.
 const [rows, summaryGroups] = await Promise.all([
 db.attendance.findMany({
 where: { studentId: session.userId },
 select: { courseId: true, courseCode: true, date: true, status: true },
 // Newest-first + cap: once a student passes the cap the sheet must keep
 // the NEWEST records (ascending order used to silently drop them).
 orderBy: [{ date: "desc" }],
 take: 600, // a semester batch — bounded like every list endpoint
 }),
 db.attendance.groupBy({
 by: ["courseId", "courseCode", "status"],
 where: { studentId: session.userId },
 _count: true,
 }),
 ]);

 if (rows.length === 0 && summaryGroups.length === 0) {
 return { hasData: false, courses: [] };
 }
 rows.reverse(); // back to oldest → newest for display within the cap

 // All-time per-course totals from the groupBy (no row-slice limits).
 // Accumulate with += — a courseCode can change mid-history, so the SAME
 // course can appear as multiple groupBy rows and `=` would overwrite
 // the earlier counts (same pattern as student/dashboard's per-course rollup).
 const totals = new Map<
 string,
 { code: string; present: number; absent: number; late: number; excused: number }
 >();
 for (const g of summaryGroups) {
 const cur =
 totals.get(g.courseId) ??
 { code: g.courseCode, present: 0, absent: 0, late: 0, excused: 0 };
 if (g.status === "present") cur.present += g._count;
 else if (g.status === "absent") cur.absent += g._count;
 else if (g.status === "late") cur.late += g._count;
 else if (g.status === "excused") cur.excused += g._count;
 totals.set(g.courseId, cur);
 }

 // Group grid cells per course, preserving date order
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
 where: { id: { in: [...totals.keys()] } },
 select: { id: true, name: true },
 });
 const nameById = new Map(names.map((c) => [c.id, c.name]));

 // Union: courses with all-time rows even if their grid rows fell
 // outside the 600-cell cap.
 const courseIds = new Set([...byCourse.keys(), ...totals.keys()]);
 const courses = [...courseIds].map((courseId) => {
 const entry = byCourse.get(courseId);
 const t = totals.get(courseId) ?? { code: "", present: 0, absent: 0, late: 0, excused: 0 };
 const counted = t.present + t.late + t.absent; // excused excluded, same as Performance
 return {
 courseId,
 courseCode: entry?.code ?? t.code,
 courseName: nameById.get(courseId) ?? entry?.code ?? t.code,
 dates: entry?.days ?? [],
 present: t.present,
 absent: t.absent,
 late: t.late,
 excused: t.excused,
 total: t.present + t.absent + t.late + t.excused,
 pct: counted > 0 ? Math.round(((t.present + t.late) / counted) * 100) : 0,
 };
 });

 return { hasData: true, courses };
 });
}
