import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { getSession, requireSession, ApiError } from "@/lib/session";

/**
 * QR scan endpoints (student-facing).
 *
 * COST GUARD: every response is a handful of fields — a student's
 * scan is ONE GET (page info) + ONE POST (mark present). No fan-out,
 * no heavy joins, no notifications generated on the scan path.
 *
 * GET  /api/attendance/scan?token=  → public class info + my status
 * POST /api/attendance/scan {token} → mark me present (student only)
 */

const TOKEN_RE = /^[a-f0-9]{32}$/;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (!token || !TOKEN_RE.test(token)) {
      throw new ApiError(400, "Invalid QR code");
    }

    const s = await db.attendanceSession.findUnique({
      where: { token },
      select: {
        scheduleId: true,
        date: true,
        closed: true,
        expiresAt: true,
        presentCount: true,
        schedule: {
          select: {
            courseCode: true,
            courseName: true,
            startTime: true,
            endTime: true,
            teacherName: true,
            program: { select: { shortName: true } },
            department: {
              select: {
                shortName: true,
                university: { select: { slug: true, shortName: true } },
              },
            },
          },
        },
      },
    });
    if (!s) {
      throw new ApiError(404, "This QR code is not valid. Ask your teacher for a fresh one.");
    }

    const expired = Date.now() >= s.expiresAt.getTime();
    const state = s.closed ? "closed" : expired ? "expired" : "active";

    // If a student is logged in, include their current status (one tiny row)
    let myStatus: string | null = null;
    const session = await getSession();
    if (session?.role === "student") {
      const row = await db.attendance.findUnique({
        where: {
          scheduleId_studentId_date: {
            scheduleId: s.scheduleId,
            studentId: session.userId,
            date: s.date,
          },
        },
        select: { status: true },
      });
      myStatus = row?.status ?? null;
    }

    return {
      state,
      date: s.date,
      courseCode: s.schedule.courseCode,
      courseName: s.schedule.courseName,
      startTime: s.schedule.startTime,
      endTime: s.schedule.endTime,
      teacherName: s.schedule.teacherName,
      program: s.schedule.program?.shortName ?? null,
      department: s.schedule.department?.shortName ?? null,
      universitySlug: s.schedule.department?.university?.slug ?? null,
      universityName: s.schedule.department?.university?.shortName ?? null,
      presentCount: s.presentCount,
      expiresAt: s.expiresAt.toISOString(),
      myStatus,
      serverTime: new Date().toISOString(),
    };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession();
    if (session.role !== "student") {
      throw new ApiError(403, "Only students can self check-in via QR");
    }
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    const token = body.token;
    if (!token || !TOKEN_RE.test(token)) {
      throw new ApiError(400, "Invalid QR code");
    }

    const s = await db.attendanceSession.findUnique({
      where: { token },
      select: {
        id: true,
        scheduleId: true,
        departmentId: true,
        courseId: true,
        teacherId: true,
        date: true,
        closed: true,
        expiresAt: true,
        schedule: {
          select: { courseCode: true, programId: true, semester: true },
        },
      },
    });
    if (!s) throw new ApiError(404, "This QR code is not valid");
    if (s.closed) throw new ApiError(410, "This check-in window is closed");
    if (Date.now() >= s.expiresAt.getTime()) {
      throw new ApiError(410, "The check-in time is over");
    }

    // Cohort check — the student must belong to this class batch
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { departmentId: true, programId: true, semester: true },
    });
    if (!me) throw new ApiError(401, "Account not found");
    if (
      me.departmentId !== s.departmentId ||
      me.programId !== s.schedule.programId ||
      me.semester !== s.schedule.semester
    ) {
      throw new ApiError(403, "This QR is for a different class batch — you are not on this roster");
    }

    const key = {
      scheduleId_studentId_date: {
        scheduleId: s.scheduleId,
        studentId: session.userId,
        date: s.date,
      },
    } as const;

    const existing = await db.attendance.findUnique({
      where: key,
      select: { status: true },
    });

    if (existing) {
      if (existing.status === "present") {
        return { ok: true, already: true, status: "present" };
      }
      // teacher pre-marked something else → correct it to present
      await db.attendance.update({
        where: key,
        data: { status: "present", markedByName: "QR self check-in" },
      });
      return { ok: true, already: false, status: "present", corrected: true };
    }

    // First scan → create the present row + bump the tiny counter (atomic)
    const [,] = await db.$transaction([
      db.attendance.create({
        data: {
          departmentId: s.departmentId,
          scheduleId: s.scheduleId,
          courseId: s.courseId,
          studentId: session.userId,
          date: s.date,
          status: "present",
          markedBy: s.teacherId,
          markedByName: "QR self check-in",
          courseCode: s.schedule.courseCode,
        },
      }),
      db.attendanceSession.update({
        where: { id: s.id },
        data: { presentCount: { increment: 1 } },
      }),
    ]);

    return { ok: true, already: false, status: "present" };
  });
}
