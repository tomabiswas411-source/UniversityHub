import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
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
 * CONTRACT (C4): the response is
 *   { success: true, data: { ranAt, counts: {…all sweep counters…}, durationMs } }
 *
 * Responses are one tiny JSON line; the sweep itself is the cost saver.
 */

async function authorize(req: NextRequest): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    // Length-guarded constant-time compare — never leaks the secret's
    // length or comparison timing to a probing client.
    const a = Buffer.from(expected);
    const b = Buffer.from(header);
    if (a.length === b.length && timingSafeEqual(a, b)) return;
    // fall through — maybe a super_admin is triggering it manually
  }
  const session = await requireSession().catch(() => null);
  if (session?.role === "super_admin") return;
  throw new ApiError(401, "Cleanup endpoint requires the CRON_SECRET bearer token or a super_admin session");
}

async function sweep() {
  const startedAt = Date.now();
  const result = await runCleanup();
  const { ranAt, ...counts } = result;
  return {
    ranAt,
    counts,
    durationMs: Date.now() - startedAt,
  };
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
