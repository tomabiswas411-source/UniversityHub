/**
 * Bangladesh (Asia/Dhaka) date helpers — shared by attendance, schedules
 * and dashboards so "today" never depends on the server's UTC clock.
 *
 * BUG CONTEXT: routes used `new Date().toISOString().slice(0, 10)` and
 * `toLocaleDateString("en-US", { weekday: "long" })`, which follow UTC /
 * server-locale. Between 18:00 UTC and midnight UTC (00:00–06:00 in
 * Dhaka) the server sees "tomorrow"/the wrong weekday, so attendance was
 * filed under the wrong date and "today's classes" was wrong.
 */

/** YYYY-MM-DD for the current moment in Asia/Dhaka (en-CA formats as ISO). */
export function bdTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
  }).format(new Date());
}

/**
 * The current BD calendar day's midnight as an absolute UTC Date — i.e.
 * "00:00 Asia/Dhaka today" expressed as an instant. Comparing DateTime
 * columns against `new Date()` alone cut the day off 6 hours early
 * (UTC midnight = 06:00 Dhaka); anchor cutoffs at the Dhaka day start.
 */
export function bdDayStartUTC(): Date {
  const ymd = bdTodayISO(); // YYYY-MM-DD in Dhaka
  return new Date(`${ymd}T00:00:00+06:00`);
}

/**
 * Parse a date-only string ("2025-11-20") as the END of that calendar day
 * in Asia/Dhaka (23:59:59 local) expressed as an absolute UTC instant.
 *
 * BUG CONTEXT (Phase 3, D34-35): expiry-style date-only inputs (notice
 * expiry, plan subscription expiry) were parsed with `new Date("yyyy-mm-dd")`
 * → UTC midnight = 06:00 Dhaka, so anything expiring "on the 20th" actually
 * cut off at 06:00 Dhaka on the 20th — six hours before the day ended.
 * Anchoring at end-of-day Dhaka makes "valid through Nov 20" mean the whole
 * Nov 20 for Bangladeshi users, matching the assignment due-date convention.
 */
export function bdEndOfDayUTC(iso: string): Date {
  const ymd = iso.trim().slice(0, 10); // accept "yyyy-mm-dd" or full ISO
  return new Date(`${ymd}T23:59:59+06:00`);
}

/**
 * Absolute Date → "dd MMM yyyy, hh:mm AM/PM" in Asia/Dhaka. Use for any
 * user-facing timestamp (CSV cells, notification bodies) so the rendered
 * day never depends on the server's timezone (Vercel = UTC).
 */
export function bdDateTimeText(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Absolute Date → "dd MMM yyyy" calendar day in Asia/Dhaka (CSV date columns). */
export function bdDateOnlyText(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const BD_WEEKDAYS: Record<string, string> = {
  Saturday: "saturday",
  Sunday: "sunday",
  Monday: "monday",
  Tuesday: "tuesday",
  Wednesday: "wednesday",
  Thursday: "thursday",
  Friday: "friday", // BD week runs Saturday → Friday
};

/**
 * Current weekday in Asia/Dhaka as a lowercase string
 * ("saturday" … "friday"), matching Schedule.dayOfWeek values.
 */
export function bdWeekday(): string {
  const long = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    weekday: "long",
  }).format(new Date());
  return BD_WEEKDAYS[long] ?? long.toLowerCase();
}

/**
 * Parse a date-only string ("2025-11-20") as a LOCAL calendar date.
 * `new Date("2025-11-20")` parses as UTC midnight, so for any UTC-negative
 * visitor the same string renders as the previous day. Splitting the
 * Y/M/D parts keeps the calendar day stable in every timezone.
 */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** "2025-11-20" → "20 Nov 2025" — no timezone drift, consistent UI format. */
export function fmtDateOnly(iso: string): string {
  return parseDateOnly(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole days between today (Dhaka) and a date-only string. 0 = today. */
export function daysUntilDate(iso: string): number {
  const target = parseDateOnly(iso).getTime();
  const today = parseDateOnly(bdTodayISO()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** YYYY-MM-DD for N days ago in Asia/Dhaka (retention & retro-marking cutoffs). */
export function bdDaysAgoISO(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(
    new Date(Date.now() - days * 86_400_000)
  );
}

/**
 * Weekday ("monday"…) of a YYYY-MM-DD calendar date. Pure date math on a
 * locally-constructed Date — no timezone drift, since only the calendar
 * day matters (hours are zeroed at local midnight).
 */
export function weekdayOfDate(iso: string): string {
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][parseDateOnly(iso).getDay()];
}
