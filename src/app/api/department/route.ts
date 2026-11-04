import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { ApiError, requireSession } from "@/lib/session";
import type {
 CourseDTO,
 DepartmentDTO,
 NoticeDTO,
 ProgramDTO,
 ScheduleChangeDTO,
 ScheduleDTO,
 TimeSlotDTO,
 UserDTO,
} from "@/types";

function todayStr(): string {
 const d = new Date();
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 return `${y}-${m}-${day}`;
}

/**
 * GET /api/department?id=...&programId=...&semester=...
 * Public department detail: info, programs, teachers, notices, routine.
 * Hidden when the department OR its parent university is deactivated.
 */
export async function GET(req: NextRequest) {
 return handle(async () => {
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 const programId = searchParams.get("programId");
 const semesterParam = searchParams.get("semester");

 if (!id) throw new ApiError(400, "Department id is required");

 const department = await db.department.findUnique({
 where: { id },
 include: {
 university: {
 select: { id: true, name: true, slug: true, shortName: true, isActive: true },
 },
 },
 });
 if (!department || !department.isActive || !department.university.isActive) {
 throw new ApiError(404, "Department not found");
 }

 const [programs, teachers, notices, timeSlots] = await Promise.all([
 db.program.findMany({
 where: { departmentId: id, isActive: true },
 orderBy: { name: "asc" },
 }),
 db.user.findMany({
 where: { departmentId: id, role: "teacher", isActive: true },
 orderBy: { fullName: "asc" },
 }),
 db.notice.findMany({
 where: {
 departmentId: id,
 OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
 },
 orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
 take: 30,
 }),
 db.timeSlot.findMany({
 where: { departmentId: id, isActive: true },
 orderBy: { slotOrder: "asc" },
 }),
 ]);

 // Resolve default program/semester if not provided
 const selectedProgramId =
 programId && programs.some((p) => p.id === programId)
 ? programId
 : programs[0]?.id ?? null;
 const selectedProgram = programs.find((p) => p.id === selectedProgramId);
 const maxSem = selectedProgram?.semesterCount ?? 8;
 const semester = semesterParam
 ? Math.min(Math.max(parseInt(semesterParam, 10) || 1, 1), maxSem)
 : 1;

 let schedules: ScheduleDTO[] = [];
 let changes: ScheduleChangeDTO[] = [];
 let courses: CourseDTO[] = [];

 if (selectedProgramId) {
 const [rawSchedules, rawChanges, rawCourses] = await Promise.all([
 db.schedule.findMany({
 where: {
 departmentId: id,
 programId: selectedProgramId,
 semester,
 isActive: true,
 },
 orderBy: { startTime: "asc" },
 }),
 db.scheduleChange.findMany({
 where: {
 departmentId: id,
 isActive: true,
 effectiveDate: { gte: todayStr() },
 programId: selectedProgramId,
 semester,
 },
 orderBy: { createdAt: "desc" },
 take: 50,
 }),
 db.course.findMany({
 where: {
 departmentId: id,
 programId: selectedProgramId,
 semester,
 isActive: true,
 },
 orderBy: { code: "asc" },
 }),
 ]);

 schedules = rawSchedules.map((s) => ({
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

 changes = rawChanges.map((c) => ({
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

 courses = rawCourses.map((c) => ({
 id: c.id,
 departmentId: c.departmentId,
 programId: c.programId,
 code: c.code,
 name: c.name,
 creditHours: c.creditHours,
 type: c.type as "theory" | "lab",
 semester: c.semester,
 isActive: c.isActive,
 }));
 }

 const departmentDTO: DepartmentDTO & { universityName: string; universitySlug: string } = {
 id: department.id,
 universityId: department.universityId,
 name: department.name,
 shortName: department.shortName,
 code: department.code,
 logoURL: department.logoURL,
 description: department.description,
 building: department.building,
 contactEmail: department.contactEmail,
 contactPhone: department.contactPhone,
 facebookURL: department.facebookURL,
 isActive: department.isActive,
 universityName: department.university.name,
 universitySlug: department.university.slug,
 };

 const teacherDTOs: UserDTO[] = teachers.map((t) => ({
 id: t.id,
 universityId: t.universityId,
 departmentId: t.departmentId,
 role: "teacher",
 fullName: t.fullName,
 email: t.email,
 designation: t.designation,
 phone: t.phone,
 photoURL: t.photoURL,
 bio: t.bio,
 officeRoom: t.officeRoom,
 studentIdNumber: null,
 rollNumber: null,
 section: null,
 semester: null,
 programId: null,
 isActive: t.isActive,
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

 const timeSlotDTOs: TimeSlotDTO[] = timeSlots.map((t) => ({
 id: t.id,
 departmentId: t.departmentId,
 label: t.label,
 startTime: t.startTime,
 endTime: t.endTime,
 slotOrder: t.slotOrder,
 isBreak: t.isBreak,
 isActive: t.isActive,
 }));

 const programDTOs: ProgramDTO[] = programs.map((p) => ({
 id: p.id,
 departmentId: p.departmentId,
 name: p.name,
 shortName: p.shortName,
 semesterCount: p.semesterCount,
 isActive: p.isActive,
 }));

 return {
 department: departmentDTO,
 programs: programDTOs,
 selectedProgramId,
 semester,
 teachers: teacherDTOs,
 notices: noticeDTOs,
 timeSlots: timeSlotDTOs,
 schedules,
 changes,
 courses,
 };
 });
}

/* ============================================================
 Super-admin department CRUD — used by the Super Admin panel.
 POST /api/department { universityId, name, shortName?, code?, ... }
 PUT /api/department?id=... { name?, shortName?, code?, ... }
 DELETE /api/department?id=... (safe delete — refuses when in use)
 All three are super_admin-only, matching the admin panel usage.
 ============================================================ */

/** Trimmed string or null — treats "" / whitespace-only as absent. */
function optStr(v: unknown): string | null {
 if (typeof v !== "string") return null;
 const s = v.trim();
 return s ? s : null;
}

/** Guard: only super_admin may create/update/delete departments. */
async function requireSuperAdmin() {
 const session = await requireSession();
 if (session.role !== "super_admin") {
 throw new ApiError(403, "Super admin access required");
 }
 return session;
}

/** Names and codes are unique per university (case-insensitive). */
async function assertNoDeptConflict(
 universityId: string,
 opts: { name: string; code: string; excludeId?: string }
) {
 const siblings = await db.department.findMany({
 where: {
 universityId,
 ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
 },
 select: { name: true, code: true },
 });
 const lowerName = opts.name.toLowerCase();
 const lowerCode = opts.code.toLowerCase();
 if (siblings.some((d) => d.name.toLowerCase() === lowerName)) {
 throw new ApiError(
 409,
 "A department with this name already exists in this university"
 );
 }
 if (siblings.some((d) => d.code.toLowerCase() === lowerCode)) {
 throw new ApiError(
 409,
 "A department with this code already exists in this university"
 );
 }
}

export async function POST(req: NextRequest) {
 return handle(async () => {
 await requireSuperAdmin();
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
 const universityId =
 typeof body.universityId === "string" ? body.universityId.trim() : "";
 const name = optStr(body.name);
 if (!universityId || !name) {
 throw new ApiError(400, "universityId and name are required");
 }

 const university = await db.university.findUnique({
 where: { id: universityId },
 });
 if (!university) throw new ApiError(404, "University not found");

 // shortName/code are schema-required — derive a sensible default
 const shortName =
 optStr(body.shortName) ||
 name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() ||
 "DEPT";
 const code = optStr(body.code) || shortName.toUpperCase();

 await assertNoDeptConflict(universityId, { name, code });

 const department = await db.department.create({
 data: {
 universityId,
 name,
 shortName,
 code,
 description: optStr(body.description),
 building: optStr(body.building),
 contactEmail: optStr(body.contactEmail),
 contactPhone: optStr(body.contactPhone),
 },
 });
 return { department };
 });
}

export async function PUT(req: NextRequest) {
 return handle(async () => {
 await requireSuperAdmin();
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id query param is required");
 const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

 const existing = await db.department.findUnique({ where: { id } });
 if (!existing) throw new ApiError(404, "Department not found");

 const data: Record<string, unknown> = {};
 // Schema-required fields fall back to current values when cleared
 const name = optStr(body.name) ?? existing.name;
 const shortName = optStr(body.shortName) ?? existing.shortName;
 const code = optStr(body.code) ?? existing.code;
 if (name !== existing.name) data.name = name;
 if (shortName !== existing.shortName) data.shortName = shortName;
 if (code !== existing.code) data.code = code;

 if (body.description !== undefined) data.description = optStr(body.description);
 if (body.building !== undefined) data.building = optStr(body.building);
 if (body.contactEmail !== undefined) data.contactEmail = optStr(body.contactEmail);
 if (body.contactPhone !== undefined) data.contactPhone = optStr(body.contactPhone);
 if (body.facebookURL !== undefined) data.facebookURL = optStr(body.facebookURL);
 if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

 const nameChanged = typeof data.name === "string" && data.name !== existing.name;
 const codeChanged = typeof data.code === "string" && data.code !== existing.code;
 if (nameChanged || codeChanged) {
 await assertNoDeptConflict(existing.universityId, {
 name: typeof data.name === "string" ? data.name : existing.name,
 code: typeof data.code === "string" ? data.code : existing.code,
 excludeId: id,
 });
 }

 const department = await db.department.update({ where: { id }, data });
 return { department };
 });
}

export async function DELETE(req: NextRequest) {
 return handle(async () => {
 await requireSuperAdmin();
 const { searchParams } = new URL(req.url);
 const id = searchParams.get("id");
 if (!id) throw new ApiError(400, "id query param is required");

 const existing = await db.department.findUnique({ where: { id } });
 if (!existing) throw new ApiError(404, "Department not found");

 // Safe delete — refuse while the department still holds content that
 // would be cascade-destroyed (users / courses / schedules / notices /
 // programs / rooms / time slots).
 const [users, courses, schedules, notices, programs, rooms, timeSlots] =
 await Promise.all([
 db.user.count({ where: { departmentId: id } }),
 db.course.count({ where: { departmentId: id } }),
 db.schedule.count({ where: { departmentId: id } }),
 db.notice.count({ where: { departmentId: id } }),
 db.program.count({ where: { departmentId: id } }),
 db.room.count({ where: { departmentId: id } }),
 db.timeSlot.count({ where: { departmentId: id } }),
 ]);
 const blocks: string[] = [];
 if (users) blocks.push(`${users} user${users === 1 ? "" : "s"}`);
 if (courses) blocks.push(`${courses} course${courses === 1 ? "" : "s"}`);
 if (schedules) blocks.push(`${schedules} schedule${schedules === 1 ? "" : "s"}`);
 if (notices) blocks.push(`${notices} notice${notices === 1 ? "" : "s"}`);
 if (programs) blocks.push(`${programs} program${programs === 1 ? "" : "s"}`);
 if (rooms) blocks.push(`${rooms} room${rooms === 1 ? "" : "s"}`);
 if (timeSlots) blocks.push(`${timeSlots} time slot${timeSlots === 1 ? "" : "s"}`);
 if (blocks.length > 0) {
 throw new ApiError(
 409,
 `Department has ${blocks.join(", ")} — reassign or deactivate instead`
 );
 }

 await db.department.delete({ where: { id } });
 return { deleted: true };
 });
}
