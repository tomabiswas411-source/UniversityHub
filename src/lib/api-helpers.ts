import { NextResponse, NextRequest } from "next/server";
import { ApiError } from "@/lib/session";

/** Standard JSON success response */
export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ success: true, data }, { status: init ?? 200 });
}

/**
 * Wrap a route handler: converts ApiError & unexpected errors to JSON.
 * Never leaks internals: unexpected errors are logged server-side and
 * replaced with a generic message; known Prisma errors map to friendly
 * 409/404 responses.
 */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }
    console.error("[api] unexpected error:", err);

    // Known Prisma error codes → friendly, non-leaking responses
    const code =
      typeof err === "object" && err !== null
        ? (err as { code?: string }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json(
        { success: false, error: "That value already exists (duplicate)" },
        { status: 409 }
      );
    }
    if (code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Record not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

/* ------------------------------------------------------------------ */
/* In-memory rate limiting (login endpoints) — no external deps.       */
/* ------------------------------------------------------------------ */

const RATE_LIMIT_MAX = 10; // attempts
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // per 5 minutes

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

/**
 * Sliding-window limiter keyed by "ip:identifier".
 * Throws ApiError(429) once the caller exceeds `max` attempts inside the
 * window. Expired buckets are cleaned up on access — no timers needed.
 */
export function rateLimit(
  key: string,
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): void {
  const now = Date.now();

  // Opportunistic cleanup keeps the map bounded on abusive traffic.
  if (rateBuckets.size > 500) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }

  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw new ApiError(429, "Too many attempts. Try again in a few minutes.");
  }
}

/** Best-effort client IP: first x-forwarded-for hop, else "unknown". */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || "unknown";
}
