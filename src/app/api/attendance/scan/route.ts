import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { getSession, requireSession, ApiError } from "@/lib/session";
import { distanceMeters, isSaneCoords } from "@/lib/geo";

/**
 * QR scan endpoints (student-facing).
 *
 * COST GUARD: every response is a handful of fields — a student's
 * scan is ONE GET (page info) + ONE POST (mark present). No fan-out,
 * no heavy joins, no notifications generated on the scan path.
 *
 * GEO-FENCE (anti-fraud): when the teacher enabled the location check,
 * the POST must carry the student's coords; the server keeps them only
 * long enough to compute one distance and store the rounded meter
 * count on the attendance row (audit trail). Outside the radius →
 * rejected, so a friend cannot check you in from home.
 *
 * DEVICE GUARD: one phone can check in ONE student per class-date —
 * passing 5 friends' phones around stops here.
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
        geoRadiusM: true,
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
      geoRequired: s.geoRadiusM != null,
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
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      lat?: number;
      lng?: number;
      accuracy?: number;
      deviceId?: string;
    };
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
        geoLat: true,
        geoLng: true,
        geoRadiusM: true,
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

    // ---- GEO-FENCE: student must be inside the classroom area ----
    let distance: number | null = null;
    if (s.geoRadiusM != null) {
      if (!isSaneCoords(body.lat, body.lng)) {
        throw new ApiError(
          403,
          "Location permission is required for check-in. Sit inside the classroom, allow location access and try again."
        );
      }
      distance = distanceMeters(
        { lat: s.geoLat as number, lng: s.geoLng as number },
        { lat: body.lat as number, lng: body.lng as number }
      );
      if (distance > s.geoRadiusM) {
        throw new ApiError(
          403,
          `You appear to be ${Math.round(distance)}m away from the classroom — outside the check-in area (${s.geoRadiusM}m). Please be present in class.`
        );
      }
    }

    // ---- DEVICE GUARD: one phone = one student per class-date ----
    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length >= 8 && body.deviceId.length <= 64
        ? body.deviceId.slice(0, 64)
        : null;
    if (deviceId) {
      const clash = await db.attendance.findFirst({
        where: { scheduleId: s.scheduleId, date: s.date, deviceId, studentId: { not: session.userId } },
        select: { studentId: true },
      });
      if (clash) {
        throw new ApiError(
          403,
          "This phone has already checked in for another student of this class. Each student must use their own device."
        );
      }
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
        data: {
          status: "present",
          markedByName: "QR self check-in",
          ...(deviceId ? { deviceId } : {}),
          ...(distance != null ? { distanceM: Math.round(distance) } : {}),
        },
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
          ...(deviceId ? { deviceId } : {}),
          ...(distance != null ? { distanceM: Math.round(distance) } : {}),
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
