import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/session";
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
        university: { select: { id: true, name: true, slug: true, shortName: true } },
      },
    });
    if (!department || !department.isActive) {
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
