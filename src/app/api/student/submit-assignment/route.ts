import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireSession, ApiError } from "@/lib/session";

/**
 * POST /api/student/submit-assignment
 * Student submits (or re-submits) their answer for an assignment.
 *
 * Body: { assignmentId, text?, fileName?, fileData? }
 *  - fileData: a data URL (base64) — small document/image uploads only,
 *    guarded here AND client-side (no object store in this deployment).
 *  - A resubmission upserts the row (one per assignment per student) and
 *    clears nothing: grade/feedback stay visible until re-graded.
 */
const TEXT_MAX = 8000;
const FILE_BYTES_MAX = 2 * 1024 * 1024; // 2 MB decoded
const ALLOWED_MIME =
  /^(application\/pdf|application\/zip|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml|presentationml)\.document|text\/plain|image\/(png|jpeg|webp))$/;
const ALLOWED_EXT = /\.(pdf|zip|doc|docx|ppt|pptx|txt|png|jpe?g|webp)$/i;

export async function POST(req: NextRequest) {
 return handle(async () => {
  const session = await requireSession();
  if (session.role !== "student") {
   throw new ApiError(403, "Student access required");
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const assignmentId = String(body.assignmentId ?? "").trim();
  if (!assignmentId) throw new ApiError(400, "assignmentId is required");

  const student = await db.user.findUnique({ where: { id: session.userId } });
  if (!student || !student.isActive) {
   throw new ApiError(403, "Account is not active");
  }
  if (!student.departmentId || !student.universityId) {
   throw new ApiError(400, "Student profile incomplete");
  }

  const assignment = await db.assignment.findUnique({
   where: { id: assignmentId },
   include: {
    course: { select: { code: true, name: true, programId: true, semester: true } },
   },
  });
  if (!assignment || !assignment.isActive) {
   throw new ApiError(404, "Assignment not found");
  }
  // Cohort + tenant guards: only the batch this assignment was created
  // for (same department, program, semester) may submit.
  if (assignment.departmentId !== student.departmentId) {
   throw new ApiError(403, "This assignment belongs to another department");
  }
  if (
   student.programId &&
   assignment.course?.programId &&
   assignment.course.programId !== student.programId
  ) {
   throw new ApiError(403, "This assignment is not for your program");
  }
  if (
   student.semester != null &&
   assignment.course?.semester != null &&
   assignment.course.semester !== student.semester
  ) {
   throw new ApiError(403, "This assignment is not for your semester");
  }

  // ---------- payload guards ----------
  const text =
   body.text === undefined || body.text === null
    ? null
    : String(body.text).trim().slice(0, TEXT_MAX) || null;

  let fileName: string | null = null;
  let fileURL: string | null = null;
  if (body.fileData !== undefined && body.fileData !== null && body.fileData !== "") {
   const raw = String(body.fileData);
   const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(raw);
   if (!match) {
    throw new ApiError(400, "File must be uploaded as a data URL");
   }
   const [, mime, b64] = match;
   if (!ALLOWED_MIME.test(mime)) {
    throw new ApiError(400, "File type not allowed (pdf, doc, ppt, txt, image or zip)");
   }
   // Approx decoded size — base64 is ~4/3 of raw bytes.
   const approxBytes = Math.floor((b64.length * 3) / 4);
   if (approxBytes > FILE_BYTES_MAX) {
    throw new ApiError(400, "File is too large (max 2 MB)");
   }
   fileName = String(body.fileName ?? "submission")
    .trim()
    .slice(0, 120)
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "_");
   if (!ALLOWED_EXT.test(fileName)) {
    throw new ApiError(400, "File extension not allowed (pdf, doc, ppt, txt, image or zip)");
   }
   fileURL = raw;
  }

  if (!text && !fileURL) {
   throw new ApiError(400, "Write your answer or attach a file before submitting");
  }

  // Late flag (informational — teachers see it, students are still
  // allowed to submit; the deadline gate belongs to the teacher).
  const isLate = !!(assignment.dueDate && assignment.dueDate.getTime() < Date.now());

  const existing = await db.assignmentSubmission.findUnique({
   where: { assignmentId_studentId: { assignmentId, studentId: student.id } },
  });

  const submission = existing
   ? await db.assignmentSubmission.update({
     where: { id: existing.id },
     data: {
      text,
      fileName,
      fileURL,
      resubmitted: true,
      submittedAt: new Date(),
     },
    })
   : await db.assignmentSubmission.create({
     data: {
      assignmentId,
      studentId: student.id,
      departmentId: student.departmentId,
      text,
      fileName,
      fileURL,
     },
    });

  // Best-effort ping to the teacher — a submission is an event they
  // care about, but a notification failure must never fail the submit.
  try {
   await db.notification.create({
    data: {
     userId: assignment.teacherId,
     title: `Submission: ${assignment.title.slice(0, 60)}`,
     body: `${student.fullName} (Roll ${student.rollNumber ?? "—"}) submitted${existing ? " (re-submission)" : ""}${isLate ? " — LATE" : ""}`,
     type: "assignment",
     link: "/?view=dashboard&tab=assignments",
    },
   });
  } catch {
   // non-fatal
  }

  return {
   submission: {
    id: submission.id,
    assignmentId: submission.assignmentId,
    text: submission.text,
    fileName: submission.fileName,
    submittedAt: submission.submittedAt.toISOString(),
    resubmitted: submission.resubmitted,
    isLate,
   },
  };
 });
}
