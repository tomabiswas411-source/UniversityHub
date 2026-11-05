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
