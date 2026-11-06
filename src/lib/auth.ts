/**
 * Server-side auth utilities — password hashing & user lookup.
 */
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ApiError, type SessionPayload } from "@/lib/session";
import type { User } from "@prisma/client";

export async function hashPassword(password: string): Promise<string> {
 return bcrypt.hash(password, 10);
}

export async function verifyPassword(
 password: string,
 hash: string
): Promise<boolean> {
 return bcrypt.compare(password, hash);
}

/** Safe user shape without password — always use this for API responses */
export function toSafeUser(user: User): Omit<User, "password"> {
 const { password: _password, ...safe } = user;
 return safe;
}
export type SafeUser = Omit<User, "password">;

/** Staff login: email + password */
export async function findStaffByEmail(email: string) {
 // Emails are stored normalized (trim + lowercase) — lookups must match
 // that or mixed-case input silently misses the account.
 const emailNorm = email.trim().toLowerCase();
 return db.user.findFirst({
 where: {
 email: { equals: emailNorm, },
 role: { in: ["super_admin", "dept_admin", "teacher"] },
 isActive: true,
 },
 include: { university: true, department: true },
 });
}

/** Student login: university slug + ID number + roll number */
export async function findStudentForLogin(
 universitySlug: string,
 studentIdNumber: string,
 rollNumber: string
) {
 const university = await db.university.findUnique({
 where: { slug: universitySlug },
 });
 if (!university || !university.isActive) {
 throw new ApiError(404, "University not found");
 }

 const student = await db.user.findFirst({
 where: {
 universityId: university.id,
 role: "student",
 studentIdNumber: studentIdNumber.trim(),
 isActive: true,
 },
 include: { university: true, department: true, program: true },
 });

 if (!student || student.rollNumber !== rollNumber.trim()) {
 throw new ApiError(401, "Invalid ID Number or Roll Number");
 }
 return student;
}

/** Load a full user record for a session (used by /api/auth/me) */
export async function loadSessionUser(
 session: SessionPayload
): Promise<ReturnType<typeof toSessionUser>> {
 const user = await db.user.findUnique({
 where: { id: session.userId },
 include: {
 university: { select: { name: true, slug: true } },
 department: { select: { name: true, shortName: true } },
 },
 });
 if (!user || !user.isActive) {
 throw new ApiError(401, "Session user no longer exists");
 }
 return toSessionUser(user);
}

/**
 * CONTRACT (C1): the ONE flat session-user shape shared by both login
 * routes and /api/auth/me — flat universitySlug, universityName,
 * departmentName, departmentShortName, departmentId, universityId fields
 * so the client SessionUser type always resolves the same way.
 */
export function toSessionUser(
 user: User & {
 university?: { name: string | null; slug: string | null } | null;
 department?: { name: string | null; shortName: string | null } | null;
 }
) {
 const safe = toSafeUser(user);
 return {
 ...safe,
 universityName: user.university?.name ?? null,
 universitySlug: user.university?.slug ?? null,
 departmentName: user.department?.name ?? null,
 departmentShortName: user.department?.shortName ?? null,
 };
}

/** Ensure a department-scoped session may touch the given department */
export function assertDepartmentAccess(
 session: SessionPayload,
 departmentId: string
): void {
 if (session.role === "super_admin") return;
 if (
 (session.role === "dept_admin" || session.role === "teacher") &&
 session.departmentId === departmentId
 )
 return;
 throw new ApiError(403, "Access denied for this department");
}

// Single source of truth for role display labels (client-safe consts).
// The duplicate literal that lived here drifted from the client copy.
export { ROLE_LABELS } from "@/lib/role-labels";
