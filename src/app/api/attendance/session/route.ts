import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";
import { assertDepartmentAccess } from "@/lib/auth";
import { isSaneCoords } from "@/lib/geo";
import { bdTodayISO, bdWeekday } from "@/lib/date-bd";

/**
 * QR attendance session management (teacher / dept_admin).
 *
 * COST GUARD: responses here are intentionally tiny.
 *  • POST creates the session row + returns the QR payload (~200 bytes)
 *  • GET ?id= is the teacher live-poll — reads a couple of rows and
 *    returns <200 bytes: {st, pc, exp, recent[≤3]}
 *  • GET ?scheduleId= returns the last 5 sessions for history chips
 *
 * GEO-FENCE: the teacher's browser sends ONE position fix when the
 * window opens; it is stored on the session row and every student scan
 * is distance-checked server-side. No extra requests, no tracking.
 */

export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession();
    if (!["teacher", "dept_admin"].includes(session.role)) {
      throw new ApiError(403, "Teacher access required");
    }
    const body = (await req.json().catch(() => ({}))) as {
      scheduleId?: string;
      date?: string;
      durationSec?: number;
      geoEnabled?: boolean;
      lat?: number;
      lng?: number;
      radiusM?: number;
    };

    if (!body.scheduleId) throw new ApiError(400, "Schedule is required");
    // Class date: prefer a validated body.date, else today in Asia/Dhaka
    // (the old UTC slice filed the first ~6 BD hours under the wrong date).
    const classDate =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : bdTodayISO();
    // REALITY CHECK: a QR window is a live classroom event — it can only
    // be opened for TODAY's class, never for a past or future date.
    if (classDate !== bdTodayISO()) {
      throw new ApiError(
        400,
        "QR check-in can only be opened for today's class — pick today's date"
      );
    }
    const duration = Math.min(Math.max(Number(body.durationSec) || 120, 30), 600);

    // Geo-fence inputs: enabled only when the teacher asked for it AND
    // the browser actually produced a usable position fix.
    let geo: { geoLat: number; geoLng: number; geoRadiusM: number } | null = null;
    if (body.geoEnabled && isSaneCoords(body.lat, body.lng)) {
      const radius = Math.min(Math.max(Math.round(Number(body.radiusM) || 150), 30), 2000);
      geo = { geoLat: body.lat as number, geoLng: body.lng as number, geoRadiusM: radius };
    }

    const schedule = await db.schedule.findUnique({ where: { id: body.scheduleId } });
    if (!schedule) throw new ApiError(404, "Schedule not found");
    if (session.role === "teacher" && schedule.teacherId !== session.userId) {
      throw new ApiError(403, "You can only open QR sessions for your own classes");
    }
    assertDepartmentAccess(session, schedule.departmentId);

    // REALITY CHECK: a cancelled class gets no QR window, and the routine
    // weekday must match today unless the class was officially moved.
    const cancelled = await db.scheduleChange.findFirst({
      where: {
        scheduleId: schedule.id,
        changeType: "cancelled",
        effectiveDate: classDate,
        isActive: true,
      },
      select: { id: true },
    });
    if (cancelled) {
      throw new ApiError(400, "This class is cancelled today — QR check-in cannot be opened");
    }
    const moved = await db.scheduleChange.findFirst({
      where: {
        scheduleId: schedule.id,
        changeType: { in: ["rescheduled", "time_changed", "extra_class"] },
        effectiveDate: classDate,
        isActive: true,
      },
      select: { id: true },
    });
    if (!moved && schedule.dayOfWeek !== bdWeekday()) {
      throw new ApiError(
        400,
        `This class meets on ${schedule.dayOfWeek} — no QR window on other days`
      );
    }

    // Close any still-open windows for this class+date. Before closing the
    // SUPERSEDED ones, run the same absent-sweep finalize the teacher's
    // manual finalize uses — students who never scanned those windows
    // still get their absent record instead of an abandoned session.
    // Close+create are one transaction so a parallel POST can never open
    // two live windows for the same class-date.
    const expiresAt = new Date(Date.now() + duration * 1000);
    const created = await db.$transaction(async (tx) => {
      const superseded = await tx.attendanceSession.findMany({
        where: { scheduleId: schedule.id, date: classDate, closed: false },
        select: { id: true },
      });
      if (superseded.length > 0) {
        // Every superseded window shares this schedule+date, so one sweep
        // covers them all: mark roster students with no attendance record
        // for the date+schedule as absent (skipDuplicates keeps races safe).
        const roster = await tx.user.findMany({
          where: {
            departmentId: schedule.departmentId,
            role: "student",
            isActive: true,
            programId: schedule.programId,
            semester: schedule.semester,
          },
          select: { id: true },
        });
        const marked = await tx.attendance.findMany({
          where: { scheduleId: schedule.id, date: classDate },
          select: { studentId: true },
        });
        const markedIds = new Set(marked.map((m) => m.studentId));
        const missing = roster.filter((st) => !markedIds.has(st.id));
        if (missing.length > 0) {
          // No skipDuplicates: the SQLite connector does not support it —
          // race safety comes from the serialized transaction re-reading
          // `marked` right before this insert.
          await tx.attendance.createMany({
            data: missing.map((st) => ({
              departmentId: schedule.departmentId,
              scheduleId: schedule.id,
              courseId: schedule.courseId,
              studentId: st.id,
              date: classDate,
              status: "absent",
              markedBy: session.userId,
              markedByName: "QR auto-close",
              courseCode: schedule.courseCode,
            })),
          });
        }
      }
      await tx.attendanceSession.updateMany({
        where: { scheduleId: schedule.id, date: classDate, closed: false },
        data: { closed: true },
      });
      return tx.attendanceSession.create({
        data: {
          departmentId: schedule.departmentId,
          scheduleId: schedule.id,
          courseId: schedule.courseId,
          teacherId: schedule.teacherId,
          token: randomBytes(16).toString("hex"),
          date: classDate,
          durationSec: duration,
          expiresAt,
          ...(geo ?? {}),
        },
      });
    });

    return {
      id: created.id,
      token: created.token,
      expiresAt: created.expiresAt.toISOString(),
      durationSec: created.durationSec,
      geo: geo ? { radiusM: geo.geoRadiusM } : null,
      url: `/?view=attend&k=${created.token}`,
    };
  });
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession();
    if (!["teacher", "dept_admin"].includes(session.role)) {
      throw new ApiError(403, "Teacher access required");
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const scheduleId = searchParams.get("scheduleId");

    if (id) {
      // ---- tiny live status: ONE session row + last 3 scan names ----
      const s = await db.attendanceSession.findUnique({
        where: { id },
        select: {
          departmentId: true,
          teacherId: true,
          scheduleId: true,
          date: true,
          presentCount: true,
          closed: true,
          expiresAt: true,
          geoRadiusM: true,
        },
      });
      if (!s) throw new ApiError(404, "Session not found");
      if (session.role === "teacher" && s.teacherId !== session.userId) {
        throw new ApiError(403, "Not your session");
      }
      assertDepartmentAccess(session, s.departmentId);

      const recent = await db.attendance.findMany({
        where: { scheduleId: s.scheduleId, date: s.date, status: "present" },
        orderBy: { updatedAt: "desc" },
        take: 3,
        select: { student: { select: { fullName: true, rollNumber: true } } },
      });

      const expired = Date.now() >= s.expiresAt.getTime();
      return {
        st: s.closed ? "closed" : expired ? "expired" : "active",
        pc: s.presentCount,
        exp: s.expiresAt.toISOString(),
        geo: s.geoRadiusM != null,
        recent: recent.map((r) => ({ n: r.student.fullName, r: r.student.rollNumber })),
      };
    }

    if (scheduleId) {
      // ---- history chips: last 5 sessions for this class ----
      // Tenant guard: verify the schedule belongs to the caller's
      // department (and to this teacher) before handing out tokens —
      // tokens are check-in credentials and must not leak cross-dept.
      const schedule = await db.schedule.findUnique({
        where: { id: scheduleId },
        select: { id: true, departmentId: true, teacherId: true },
      });
      if (!schedule) throw new ApiError(404, "Schedule not found");
      if (
        session.role === "teacher" &&
        schedule.teacherId !== session.userId
      ) {
        throw new ApiError(
          403,
          "You can only view QR history for your own classes"
        );
      }
      assertDepartmentAccess(session, schedule.departmentId);

      const list = await db.attendanceSession.findMany({
        where: {
          scheduleId,
          ...(session.role === "teacher" ? { teacherId: session.userId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          token: true,
          date: true,
          presentCount: true,
          closed: true,
          expiresAt: true,
          durationSec: true,
        },
      });
      return { sessions: list };
    }

    throw new ApiError(400, "id or scheduleId is required");
  });
}
