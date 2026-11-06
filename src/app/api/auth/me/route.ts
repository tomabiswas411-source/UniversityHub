import { handle } from "@/lib/api-helpers";
import { getSession, clearSession, ApiError } from "@/lib/session";
import { loadSessionUser } from "@/lib/auth";

export async function GET() {
 return handle(async () => {
 const session = await getSession();
 if (!session) return { user: null };

 try {
 // Flat session-user shape (contract C1) — identical to what both
 // login routes return: universityName, universitySlug, departmentName,
 // departmentShortName, departmentId, universityId all flattened.
 const user = await loadSessionUser(session);
 return { user };
 } catch (err) {
 // Only auth-class failures (user deleted/deactivated → ApiError 401)
 // invalidate the cookie. Unexpected errors (DB outage etc.) must NOT
 // clear a perfectly valid session — surface a 500 instead.
 if (err instanceof ApiError) {
 await clearSession();
 return { user: null };
 }
 throw err;
 }
 });
}
