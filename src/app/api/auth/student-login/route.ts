import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { findStudentForLogin, toSafeUser } from "@/lib/auth";
import { createSession, ApiError } from "@/lib/session";

/** Student login: university slug + ID number + roll number */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const { universitySlug, studentIdNumber, rollNumber } = body as {
      universitySlug?: string;
      studentIdNumber?: string;
      rollNumber?: string;
    };

    if (!universitySlug || !studentIdNumber || !rollNumber) {
      throw new ApiError(
        400,
        "University, ID Number and Roll Number are required"
      );
    }

    const student = await findStudentForLogin(
      universitySlug,
      studentIdNumber,
      rollNumber
    );

    await createSession({
      userId: student.id,
      role: "student",
      universityId: student.universityId,
      departmentId: student.departmentId,
      name: student.fullName,
      programId: student.programId,
      semester: student.semester,
    });

    return { user: toSafeUser(student) };
  });
}
