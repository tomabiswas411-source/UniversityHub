import { NextRequest } from "next/server";
import { handle, getClientIp, rateLimit } from "@/lib/api-helpers";
import { findStudentForLogin, toSessionUser } from "@/lib/auth";
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

 const ip = getClientIp(req);

 // Brute-force guard #1: 10 attempts / 5 min per IP+ID-number pair.
 rateLimit(`${ip}:${String(studentIdNumber).trim().toLowerCase()}`);
 // Brute-force guard #2 (global): one IP can only try 30 student IDs
 // per 5 minutes ACROSS the whole platform — without this, an attacker
 // just rotates roll numbers to sidestep the per-pair bucket.
 rateLimit(`ip-global:${ip}`, 30);

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

 // Flat session-user shape (contract C1) — same fields as /api/auth/me.
 return { user: toSessionUser(student) };
 });
}
