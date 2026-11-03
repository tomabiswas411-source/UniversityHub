import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { findStaffByEmail, verifyPassword, toSafeUser } from "@/lib/auth";
import { createSession, ApiError } from "@/lib/session";

export async function POST(req: NextRequest) {
 return handle(async () => {
 const body = await req.json().catch(() => ({}));
 const { email, password } = body as { email?: string; password?: string };

 if (!email || !password) {
 throw new ApiError(400, "Email and password are required");
 }

 const user = await findStaffByEmail(email);
 if (!user || !user.password) {
 throw new ApiError(401, "Invalid email or password");
 }

 const valid = await verifyPassword(password, user.password);
 if (!valid) {
 throw new ApiError(401, "Invalid email or password");
 }

 await createSession({
 userId: user.id,
 role: user.role as "super_admin" | "dept_admin" | "teacher",
 universityId: user.universityId,
 departmentId: user.departmentId,
 name: user.fullName,
 });

 return { user: toSafeUser(user) };
 });
}
