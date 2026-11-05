"use client";

/**
 * AttendanceSheetCard — the MASTER class register (Excel-style).
 *
 * ONE sheet per SUBJECT (course × batch), exactly as the user asked:
 * "ওই টিচারের ওই ব্যাচের ওই সাবজেক্টের সব দিনের … একটা সিটের মধ্যে".
 * A course that runs on several weekly slots (ICE-1101 has 5) still gets
 * a single register — every class day from every slot becomes one date
 * column, all-time. NOT one sheet per day, NOT month-scoped windows.
 *
 *   rows = students (roll order) · cols = class dates (all time)
 *   cells = P/A/L/E letter · last cols = totals + attendance %
 *
 * COST GUARD: ONE GET per class switch. The Excel download is assembled
 * locally from the data already on screen — zero extra server round-trip.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarRange,
  Download,
  Grid3x3,
  Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiGet } from "@/lib/api-client";
import { gradeTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bdTodayISO } from "@/lib/date-bd";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";

interface SheetResponse {
  course: {
    courseCode: string;
    courseName: string;
    semester: number;
    slots: number;
    teacherNames: string[];
  };
  /** One column per class MEETING — a date normally, date+slot when the
   *  subject met twice on the same calendar day. */
  columns: { key: string; date: string; slot?: string }[];
  students: { id: string; fullName: string; rollNumber: string | null; studentIdNumber: string | null }[];
  cells: Record<string, Record<string, string>>;
  summary: Record<string, { present: number; absent: number; late: number; excused: number; total: number; pct: number }>;
}

const CELL_STYLE: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  absent: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  late: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  excused: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const CELL_LETTER: Record<string, string> = {
  present: "P",
  absent: "A",
  late: "L",
  excused: "E",
};

/** Column header: day-of-month on the grid, full date on hover. */
function dayNum(iso: string): string {
  return iso.slice(8, 10);
}

export function AttendanceSheetCard({
  courseId,
  courseLabel,
  refreshSignal = 0,
}: {
  courseId: string;
  /** e.g. "ICE-1101" — shown while loading and in the empty state. */
  courseLabel?: string;
  /** Bump to force a reload (e.g. right after attendance is saved). */
  refreshSignal?: number;
}) {
  const [data, setData] = useState<SheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const reqSeq = useRef(0);

  const load = useCallback(async (cid: string) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const d = await apiGet<SheetResponse>(
        `/api/teacher/attendance-sheet?courseId=${encodeURIComponent(cid)}`
      );
      if (seq !== reqSeq.current) return;
      setData(d);
    } catch (err) {
      if (seq !== reqSeq.current) return;
      setData(null);
      toast({
        title: "Could not load the attendance sheet",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!courseId) {
      reqSeq.current += 1;
      setData(null);
      return;
    }
    void load(courseId);
  }, [courseId, refreshSignal, load]);

  const downloadCsv = useCallback(() => {
    if (!data) return;
    setDownloading(true);
    try {
      const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const lines: string[] = [
        [`Attendance sheet — ${data.course.courseCode} (${data.course.courseName}) — all class days, one register`].join(","),
        "",
        ["Roll", "Student ID", "Name", ...data.columns.map((c) => (c.slot ? `${c.date} (${c.slot})` : c.date)), "Present", "Absent", "Late", "Excused", "Marked", "Attendance %"].join(","),
      ];
      for (const st of data.students) {
        const s = data.summary[st.id];
        lines.push(
          [
            st.rollNumber ?? "",
            esc(st.studentIdNumber ?? ""),
            esc(st.fullName),
            ...data.columns.map((c) => (data.cells[st.id]?.[c.key] ? data.cells[st.id][c.key].toUpperCase() : "")),
            s?.present ?? 0,
            s?.absent ?? 0,
            s?.late ?? 0,
            s?.excused ?? 0,
            s?.total ?? 0,
            `${s?.pct ?? 0}%`,
          ].join(",")
        );
      }
      // UTF-8 BOM → Excel renders Bangla names correctly
      const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `attendance-sheet-${data.course.courseCode}-all-days.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }, [data]);

  const hasDates = !!data && data.columns.length > 0;

  return (
    <SectionCard
      title="Master Attendance Sheet"
      icon={Grid3x3}
      action={
        courseId && hasDates ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={downloadCsv}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            Excel sheet
          </Button>
        ) : undefined
      }
    >
      {!courseId ? (
        <EmptyState
          icon={Grid3x3}
          title="Select a class above"
          hint="One register per subject: every class day — from every weekly slot — accumulates as a date column in a single all-time sheet."
        />
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the sheet…
        </div>
      ) : !data || !hasDates ? (
        <EmptyState
          icon={CalendarRange}
          title={courseLabel ? `No attendance yet for ${courseLabel}` : "No attendance recorded yet"}
          hint="Once you take attendance (manually or via QR) for any slot of this subject, every date accumulates here in ONE sheet."
        />
      ) : (
        <div className="space-y-3">
          {/* register identity + scale */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-[11px] font-bold text-green">
              {data.course.courseCode} · Semester {data.course.semester}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
              <CalendarRange className="h-3.5 w-3.5" />
              {data.columns.length} class day{data.columns.length === 1 ? "" : "s"} · {data.students.length} students
            </span>
            {data.course.slots > 1 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-2.5 py-1 text-[11px] font-semibold text-[#7A6500] dark:text-gold">
                {data.course.slots} weekly slots merged
              </span>
            )}
            <span className="ml-auto hidden items-center gap-2 text-[10px] font-semibold text-muted-foreground sm:flex">
              <LegendDot cls="bg-emerald-500" label="P Present" />
              <LegendDot cls="bg-rose-500" label="A Absent" />
              <LegendDot cls="bg-amber-500" label="L Late" />
              <LegendDot cls="bg-slate-400" label="E Excused" />
            </span>
          </div>

          {/* the sheet */}
          <div className="max-h-[440px] overflow-auto rounded-xl border [scrollbar-width:thin]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-muted/95 backdrop-blur">
                  <th className="sticky left-0 z-30 min-w-[150px] border-r bg-muted/95 px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur sm:min-w-[190px]">
                    Student
                  </th>
                  {data.columns.map((c, i) => (
                    <th
                      key={c.key}
                      title={c.slot ? `${c.date} · ${c.slot}` : c.date}
                      className={cn(
                        "w-10 min-w-10 px-0 py-2 text-center text-[10px] font-bold text-muted-foreground",
                        i > 0 && c.date.slice(0, 7) !== data.columns[i - 1].date.slice(0, 7) && "border-l border-border/70",
                        c.date === bdTodayISO() && "bg-gold/40 text-[#241C15] dark:bg-gold/20 dark:text-gold"
                      )}
                    >
                      {dayNum(c.date)}
                    </th>
                  ))}
                  <th className="min-w-[74px] border-l px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Present
                  </th>
                  <th className="min-w-[46px] px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((st) => {
                  const s = data.summary[st.id];
                  return (
                    <tr key={st.id} className="border-t transition-colors hover:bg-muted/30">
                      <td className="sticky left-0 z-10 border-r bg-card px-2.5 py-1.5">
                        <p className="max-w-[150px] truncate text-[11px] font-semibold sm:max-w-[190px]">
                          {st.fullName}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          Roll {st.rollNumber || "—"}
                        </p>
                      </td>
                      {data.columns.map((c, i) => {
                        const status = data.cells[st.id]?.[c.key];
                        return (
                          <td
                            key={c.key}
                            className={cn(
                              "px-0.5 py-1 text-center",
                              i > 0 && c.date.slice(0, 7) !== data.columns[i - 1].date.slice(0, 7) && "border-l border-border/40"
                            )}
                          >
                            {status ? (
                              <span
                                title={`${c.date}${c.slot ? ` · ${c.slot}` : ""} · ${status}`}
                                className={cn(
                                  "inline-flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold",
                                  CELL_STYLE[status] ?? "bg-muted"
                                )}
                              >
                                {CELL_LETTER[status] ?? "?"}
                              </span>
                            ) : (
                              <span className="inline-flex h-6 w-6 items-center justify-center text-[10px] text-muted-foreground/30">
                                ·
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-l px-1.5 py-1.5 text-center">
                        <span className="text-[11px] font-bold tabular-nums">
                          {s?.present ?? 0}/{s?.total ?? 0}
                        </span>
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        <span
                          className={cn(
                            "inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                            gradeTone(s?.pct ?? 0)
                          )}
                        >
                          {s?.pct ?? 0}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            ONE register for this subject — every QR window and manual mark from every weekly slot lands in
            this same sheet, one row per student, one column per class day. The Excel download matches it exactly.
          </p>
        </div>
      )}
    </SectionCard>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-full", cls)} aria-hidden />
      {label}
    </span>
  );
}
