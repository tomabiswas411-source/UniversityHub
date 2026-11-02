import { handle } from "@/lib/api-helpers";
import { getSession, clearSession } from "@/lib/session";
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
    } catch {
      // stale/invalid session — clear cookie
      await clearSession();
      return { user: null };
    }
  });
}
