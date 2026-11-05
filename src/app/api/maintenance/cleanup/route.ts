import { NextRequest } from "next/server";
import { handle } from "@/lib/api-helpers";
import { runCleanup } from "@/lib/cleanup";
import { requireSession, ApiError } from "@/lib/session";

/**
 * POST|GET /api/maintenance/cleanup — data-retention sweep.
 *
 * Called by the Vercel Cron schedule (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET env var is
 * configured — that is the primary auth. A logged-in super_admin may
 * also trigger it manually from the platform dashboard.
 *
 * Responses are one tiny JSON line; the sweep itself is the cost saver.
 */

async function authorize(req: NextRequest): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (header === `Bearer ${secret}`) return;
    // fall through — maybe a super_admin is triggering it manually
  }
  const session = await requireSession().catch(() => null);
  if (session?.role === "super_admin") return;
  throw new ApiError(401, "Cleanup endpoint requires the CRON_SECRET bearer token or a super_admin session");
}

async function sweep() {
  const result = await runCleanup();
  const total =
    result.attendanceSessions +
    result.notificationsRead +
    result.notificationsUnread +
    result.scheduleChangesDeleted +
    result.autoNotices +
    result.expiredNotices +
    result.calendarEvents;
  return { ok: true, totalPurged: total, ...result };
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    await authorize(req);
    return sweep();
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    await authorize(req);
    return sweep();
  });
}
