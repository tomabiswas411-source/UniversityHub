import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { requireSession, ApiError } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Global search (Phase 4, D52-54) — one endpoint, role-scoped results.
 * GET /api/search?q=<min 2 chars>
 *
 * Scoping:
 *  - super_admin  → universities, platform users, courses, notices
 *  - dept_admin   → own department's students, teachers, courses, notices, schedules
 *  - teacher      → own department's students, own courses, notices, schedule
 *  - student      → department notices + courses + classes on the timetable
 *
 * Every list is hard-capped; the response is grouped so the header
 * dialog can render "students / courses / notices …" sections.
 */

interface SearchItem {
 id: string;
 title: string;
 subtitle: string | null;
 tab: string;
}

interface SearchGroup {
 type: string;
 label: string;
 items: SearchItem[];
}

const TAKE = 5;

export async function GET(req: NextRequest) {
 return handle(async () => {
 const session = await requireSession();
 const url = new URL(req.url);
 const q = (url.searchParams.get("q") ?? "").trim();
 if (q.length < 2) {
 throw new ApiError(400, "Type at least 2 characters to search");
 }
 const like = q.slice(0, 80);
 const groups: SearchGroup[] = [];

 if (session.role === "super_admin") {
 const [universities, users, courses, notices] = await Promise.all([
 db.university.findMany({
 where: {
 OR: [{ name: { contains: like } }, { shortName: { contains: like } }, { slug: { contains: like } }],
 },
 select: { id: true, name: true, shortName: true, isActive: true },
 orderBy: { name: "asc" },
 take: TAKE,
 }),
 db.user.findMany({
 where: {
 OR: [
 { fullName: { contains: like } },
 { email: { contains: like } },
 { rollNumber: { contains: like } },
 { studentIdNumber: { contains: like } },
 ],
 },
 select: { id: true, fullName: true, email: true, rollNumber: true, role: true, isActive: true },
 orderBy: { fullName: "asc" },
 take: TAKE,
 }),
 db.course.findMany({
 where: { OR: [{ code: { contains: like } }, { name: { contains: like } }] },
 select: { id: true, code: true, name: true, semester: true },
 orderBy: { code: "asc" },
 take: TAKE,
 }),
 db.notice.findMany({
 where: { title: { contains: like } },
 select: { id: true, title: true, department: { select: { shortName: true } } },
 orderBy: { createdAt: "desc" },
 take: TAKE,
 }),
 ]);
 if (universities.length)
 groups.push({
 type: "universities",
 label: "Universities",
 items: universities.map((u) => ({
 id: u.id,
 title: u.name,
 subtitle: u.isActive ? u.shortName : `${u.shortName ?? ""} (inactive)`.trim(),
 tab: "universities",
 })),
 });
 if (users.length)
 groups.push({
 type: "users",
 label: "Platform users",
 items: users.map((u) => ({
 id: u.id,
 title: u.fullName,
 subtitle: `${u.role}${u.rollNumber ? ` · ${u.rollNumber}` : ""}${u.isActive ? "" : " · inactive"}`,
 tab: "users",
 })),
 });
 if (courses.length)
 groups.push({
 type: "courses",
 label: "Courses",
 items: courses.map((c) => ({
 id: c.id,
 title: `${c.code} — ${c.name}`,
 subtitle: c.semester ? `Semester ${c.semester}` : null,
 tab: "universities",
 })),
 });
 if (notices.length)
 groups.push({
 type: "notices",
 label: "Notices",
 items: notices.map((n) => ({
 id: n.id,
 title: n.title,
 subtitle: n.department?.shortName ?? null,
 tab: "universities",
 })),
 });
 } else {
 // university member — everything is department-scoped
 const departmentId = session.departmentId;
 if (departmentId) {
 const staffOnly = session.role !== "student";
 const [students, teachers, courses, notices, schedules] = await Promise.all([
 // students (staff-only)
 staffOnly
 ? db.user.findMany({
 where: {
 departmentId,
 role: "student",
 OR: [
 { fullName: { contains: like } },
 { rollNumber: { contains: like } },
 { studentIdNumber: { contains: like } },
 ],
 },
 select: {
 id: true, fullName: true, rollNumber: true,
 studentIdNumber: true, semester: true, isActive: true,
 },
 orderBy: { rollNumber: "asc" },
 take: TAKE,
 })
 : Promise.resolve([] as Array<{
 id: string; fullName: string; rollNumber: string | null;
 studentIdNumber: string | null; semester: number | null; isActive: boolean;
 }>),
 // teachers (dept-admin only)
 session.role === "dept_admin"
 ? db.user.findMany({
 where: { departmentId, role: "teacher", fullName: { contains: like } },
 select: { id: true, fullName: true, designation: true, isActive: true },
 orderBy: { fullName: "asc" },
 take: TAKE,
 })
 : Promise.resolve([] as Array<{
 id: string; fullName: string; designation: string | null; isActive: boolean;
 }>),
 db.course.findMany({
 where: { departmentId, OR: [{ code: { contains: like } }, { name: { contains: like } }] },
 select: { id: true, code: true, name: true, semester: true },
 orderBy: { code: "asc" },
 take: TAKE,
 }),
 db.notice.findMany({
 where: { departmentId, title: { contains: like } },
 select: { id: true, title: true, category: true },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: TAKE,
 }),
 db.schedule.findMany({
 where: {
 departmentId,
 isActive: true,
 OR: [
 { courseCode: { contains: like } },
 { courseName: { contains: like } },
 ...(session.role === "student" ? [{ teacherName: { contains: like } }] : []),
 ],
 },
 select: {
 id: true,
 courseCode: true,
 courseName: true,
 teacherName: true,
 dayOfWeek: true,
 startTime: true,
 semester: true,
 },
 orderBy: { courseCode: "asc" },
 take: TAKE,
 }),
 ]);

 if (students.length)
 groups.push({
 type: "students",
 label: "Students",
 items: students.map((s) => ({
 id: s.id,
 title: s.fullName,
 subtitle:
 [s.rollNumber, s.semester ? `S${s.semester}` : null, s.isActive ? null : "inactive"]
 .filter(Boolean)
 .join(" · ") || null,
 tab: "students",
 })),
 });
 if (teachers.length)
 groups.push({
 type: "teachers",
 label: "Teachers",
 items: teachers.map((t) => ({
 id: t.id,
 title: t.fullName,
 subtitle: t.designation ?? (t.isActive ? null : "inactive"),
 tab: "teachers",
 })),
 });
 if (courses.length)
 groups.push({
 type: "courses",
 label: "Courses",
 items: courses.map((c) => ({
 id: c.id,
 title: `${c.code} — ${c.name}`,
 subtitle: c.semester ? `Semester ${c.semester}` : null,
 tab: session.role === "student" ? "routine" : "courses",
 })),
 });
 if (notices.length)
 groups.push({
 type: "notices",
 label: "Notices",
 items: notices.map((n) => ({
 id: n.id,
 title: n.title,
 subtitle: n.category,
 tab: "notices",
 })),
 });
 if (schedules.length)
 groups.push({
 type: "schedules",
 label: "Classes",
 items: schedules.map((s) => ({
 id: s.id,
 title: `${s.courseCode} — ${s.courseName}`,
 subtitle: `${s.teacherName} · ${s.dayOfWeek.charAt(0).toUpperCase() + s.dayOfWeek.slice(1)} ${s.startTime}`,
 tab: session.role === "student" ? "routine" : "schedule",
 })),
 });
 }
 }

 return { q: like, groups };
 });
}
