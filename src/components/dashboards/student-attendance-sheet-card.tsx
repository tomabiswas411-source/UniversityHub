"use client";

/**
 * StudentAttendanceSheetCard — the student's own view of the master
 * register. ONE sheet per subject: every class day (from every weekly
 * slot, all-time) in date order with the student's own P/A/L/E mark.
 * Mirrors exactly what the teacher's Master Attendance Sheet holds for
 * the batch — the student simply sees their own row of it.
 *
 * COST GUARD: one GET when the Performance tab opens (this card only
 * mounts with the tab). No polling, no per-course round-trips.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Grid3x3, Loader2, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";

interface CourseSheet {
  courseId: string;
  courseCode: string;
  courseName: string;
  dates: { date: string; status: string }[];
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  pct: number;
}

const STATUS_STYLE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  absent: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  late: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  excused: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const STATUS_LETTER: Record<string, string> = {
  present: "P",
  absent: "A",
  late: "L",
  excused: "E",
};

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

export function StudentAttendanceSheetCard() {
  const [courses, setCourses] = useState<CourseSheet[] | null>(null);
  const [loading, setLoading] = useState(true);
  /* Load failure vs "no attendance yet" — a broken request gets its own
     retryable card instead of the misleading empty state. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ hasData: boolean; courses: CourseSheet[] }>(
        "/api/student/attendance-sheet"
      );
      setCourses(d.courses ?? []);
      setLoadError(null);
    } catch (err) {
      // Surfaced via the error card below — a toast on top of it is noise.
      setCourses(null);
      setLoadError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SectionCard
      title="My attendance sheet"
      icon={Grid3x3}
      action={
        <button
          type="button"
          aria-label="Refresh attendance sheet"
          onClick={() => void load()}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshIcon spinning={loading} />
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your sheet…
        </div>
      ) : loadError && !courses ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <p className="text-sm font-bold text-rose-800 dark:text-rose-200">Couldn&apos;t load your attendance sheet</p>
          <p className="max-w-sm text-xs text-rose-700/90 dark:text-rose-300/80">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-1" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : !courses || courses.length === 0 ? (
        <EmptyState
          icon={Grid3x3}
          title="No attendance recorded yet"
          hint="Once a teacher marks you present (or you scan a class QR), every subject keeps one sheet here — all class days in order."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            One register per subject — every class day of the semester in order, exactly like the
            teacher&apos;s master sheet. Tap a subject to unfold your row.
          </p>
          {courses.map((c) => {
            const open = openId === c.courseId;
            return (
              <div key={c.courseId} className="overflow-hidden rounded-xl border">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : c.courseId)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.courseCode}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.total} class day{c.total === 1 ? "" : "s"} · present {c.present} · absent {c.absent}
                      {c.late > 0 ? ` · late ${c.late}` : ""}
                      {c.excused > 0 ? ` · excused ${c.excused}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                      c.pct >= 75
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : c.pct >= 60
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    )}
                  >
                    {c.pct}%
                  </span>
                </button>
                {open && (
                  <div className="border-t bg-muted/20 px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.dates.map((d, i) => (
                        <span
                          key={`${d.date}-${i}`}
                          title={`${fmtDay(d.date)} · ${d.status}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold",
                            STATUS_STYLE[d.status] ?? "bg-muted"
                          )}
                        >
                          <span className="text-[9px] font-semibold opacity-80">
                            {d.date.slice(5).replace("-", "/")}
                          </span>
                          {STATUS_LETTER[d.status] ?? "?"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn("h-4 w-4", spinning && "animate-spin")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
