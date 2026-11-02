/**
 * Session management — signed JWT stored in an httpOnly cookie.
 * Roles: super_admin | dept_admin | teacher | student
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type UserRole = "super_admin" | "dept_admin" | "teacher" | "student";

export interface SessionPayload {
  userId: string;
  role: UserRole;
  universityId: string | null;
  departmentId: string | null;
  name: string;
  /** for students: which program/semester they are in */
  programId?: string | null;
  semester?: number | null;
}

export const SESSION_COOKIE = "uh_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured in environment");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      userId: payload.userId as string,
      role: payload.role as UserRole,
      universityId: (payload.universityId as string | null) ?? null,
      departmentId: (payload.departmentId as string | null) ?? null,
      name: payload.name as string,
      programId: (payload.programId as string | null) ?? null,
      semester: (payload.semester as number | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/** Guard helpers for API routes */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new ApiError(401, "Authentication required");
  }
  return session;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw new ApiError(403, "You do not have permission to perform this action");
  }
  return session;
}

/** Custom error with HTTP status — API routes catch this */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
