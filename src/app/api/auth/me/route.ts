import { handle } from "@/lib/api-helpers";
import { getSession, clearSession, ApiError } from "@/lib/session";
import { loadSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
 return handle(async () => {
 const session = await getSession();
 if (!session) return { user: null };

 try {
 const user = await loadSessionUser(session);

 // Enrich with slug for client navigation
 let universitySlug: string | null = null;
 if (user.universityId) {
 const uni = await db.university.findUnique({
 where: { id: user.universityId },
 select: { slug: true },
 });
 universitySlug = uni?.slug ?? null;
 }

 return { user: { ...user, universitySlug } };
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
