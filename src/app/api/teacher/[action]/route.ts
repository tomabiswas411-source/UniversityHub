import { NextRequest } from "next/server";
import { handle, badRequest } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { assertDepartmentAccess } from "@/lib/auth";

/**
 * Teacher actions API.
 * GET  /api/teacher/overview                       → own schedules + courses + stats
 * GET  /api/teacher/assignments?courseId=          → list
 * POST /api/teacher/assignments                    → create
 * DELETE /api/teacher/assignments?id=
 * GET  /api/teacher/results?courseId=&examType=    → results for a course
 * POST /api/teacher/results                        → bulk save
 * POST /api/teacher/class-change                   → cancel/reschedule/room/extra + auto notice + fan-out
 */
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
    throw new ApiError(404, "Unknown action");
  });
}
