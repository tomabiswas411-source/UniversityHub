/**
 * Class-time window helpers shared by the manage & teacher routes.
 * Department time slots are arbitrary windows, so conflict detection must
 * compare physical time overlaps — not just equal timeSlotIds.
 */

/** "HH:MM" → minutes since midnight; null when unparsable. */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/**
 * True when two class time windows physically collide. Two DIFFERENT slots
 * (10:00-11:00 vs 10:30-11:30) can double-book a room/teacher/batch even
 * though their ids differ. Falls back to exact-slot equality when either
 * window has unparsable times.
 */
export function windowsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
  sameSlot: boolean
): boolean {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return sameSlot;
  return as < be && bs < ae;
}
