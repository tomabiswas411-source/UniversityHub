"use client";

/**
 * AttendanceSheetCard — the MASTER class register (Excel-style).
 *
 * WHY: QR sessions and daily rosters each capture one day; the teacher
 * wanted ONE organised sheet per class where every day accumulates —
 * "একটা সিটেই যেন তার জমা থাকে". This grid is that sheet:
 *   rows = students (roll order) · cols = class dates of the month
 *   cells = P/A/L/E letter · last cols = totals + attendance %
 *
 * COST GUARD: ONE GET per class/month switch. The CSV download is
 * assembled locally from the data already on screen — zero extra
 * server round-trip.
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, SectionCard } from "@/components/dashboards/dashboard-shared";

interface SheetResponse {
  month: string;
  months: string[];
  schedule: { courseCode: string; courseName: string; semester: number };
  dates: string[];
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

/** "2025-11-04" → "04" (column headers stay tiny) */
function dayNum(iso: string): string {
  return iso.slice(8, 10);
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function AttendanceSheetCard({
  scheduleId,
  refreshSignal = 0,
}: {
  scheduleId: string;
  /** Bump to force a reload (e.g. right after attendance is saved). */
  refreshSignal?: number;
}) {
  const [data, setData] = useState<SheetResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const reqSeq = useRef(0);

  const load = useCallback(
    async (sid: string, m: string) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ scheduleId: sid });
        if (m) qs.set("month", m);
        const d = await apiGet<SheetResponse>(`/api/teacher/attendance-sheet?${qs.toString()}`);
        if (seq !== reqSeq.current) return;
        setData(d);
        setMonth(d.month);
      } catch (err) {
        if (seq !== reqSeq.current) return;
        toast({
          title: "Could not load the attendance sheet",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!scheduleId) {
      reqSeq.current += 1;
      setData(null);
      setMonth("");
      return;
    }
    void load(scheduleId, "");
  }, [scheduleId, refreshSignal, load]);

  const downloadCsv = useCallback(() => {
    if (!data) return;
    setDownloading(true);
    try {
      const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const lines: string[] = [
        [`Attendance sheet — ${data.schedule.courseCode} (${data.schedule.courseName}) — ${monthLabel(data.month)}`].join(","),
        "",
        ["Roll", "Student ID", "Name", ...data.dates.map((d) => d), "Present", "Absent", "Late", "Excused", "Marked", "Attendance %"].join(","),
      ];
      for (const st of data.students) {
        const s = data.summary[st.id];
        lines.push(
          [
            st.rollNumber ?? "",
            esc(st.studentIdNumber ?? ""),
            esc(st.fullName),
            ...data.dates.map((d) => (data.cells[st.id]?.[d] ? data.cells[st.id][d].toUpperCase() : "")),
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
      a.download = `attendance-sheet-${data.schedule.courseCode}-${data.month}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setDownloading(false);
    }
  }, [data]);

  const hasDates = !!data && data.dates.length > 0;

  return (
    <SectionCard
      title="Master Attendance Sheet"
      icon={Grid3x3}
      action={
        scheduleId && hasDates ? (
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
      {!scheduleId ? (
        <EmptyState
          icon={Grid3x3}
          title="Select a class above"
          hint="The master sheet keeps every day's attendance for a class in one organised grid — students on rows, dates on columns."
        />
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building the sheet…
        </div>
      ) : !data || !hasDates ? (
        <div className="space-y-3">
          <EmptyState
            icon={CalendarRange}
            title="No attendance recorded yet"
            hint="Once you take attendance (manually or via QR) for this class, every date accumulates here in one sheet."
          />
          {data && data.months.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Past months with records:</span>
              {data.months.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void load(scheduleId, m)}
                  className="rounded-full border px-2.5 py-0.5 font-semibold text-[#2D4F35] transition-colors hover:bg-green/10 dark:text-[#7FB08F]"
                >
                  {monthLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* controls */}
          <div className="flex flex-wrap items-center gap-2">
            {data.months.length > 1 && (
              <Select
                value={data.month}
                onValueChange={(m) => void load(scheduleId, m)}
              >
                <SelectTrigger className="h-8 w-[180px]" aria-label="Pick month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">
              <CalendarRange className="h-3.5 w-3.5" />
              {data.dates.length} class day{data.dates.length === 1 ? "" : "s"} · {data.students.length} students
            </span>
            <span className="ml-auto hidden items-center gap-2 text-[10px] font-semibold text-muted-foreground sm:flex">
              <LegendDot cls="bg-emerald-500" label="P Present" />
              <LegendDot cls="bg-rose-500" label="A Absent" />
              <LegendDot cls="bg-amber-500" label="L Late" />
              <LegendDot cls="bg-slate-400" label="E Excused" />
            </span>
          </div>

          {/* the sheet */}
          <div className="max-h-[420px] overflow-auto rounded-xl border [scrollbar-width:thin]">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-muted/95 backdrop-blur">
                  <th className="sticky left-0 z-30 min-w-[150px] border-r bg-muted/95 px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur sm:min-w-[190px]">
                    Student
                  </th>
                  {data.dates.map((d) => (
                    <th
                      key={d}
                      title={d}
                      className={cn(
                        "w-9 min-w-9 px-0 py-2 text-center text-[10px] font-bold text-muted-foreground",
                        d === data.month + "-" + new Date().getDate().toString().padStart(2, "0") && "bg-gold/40 text-[#241C15] dark:bg-gold/20 dark:text-gold"
                      )}
                    >
                      {dayNum(d)}
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
                      {data.dates.map((d) => {
                        const status = data.cells[st.id]?.[d];
                        return (
                          <td key={d} className="px-0.5 py-1 text-center">
                            {status ? (
                              <span
                                title={`${d} · ${status}`}
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
                            (s?.pct ?? 0) >= 75
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : (s?.pct ?? 0) >= 60
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
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
            Every QR window and manual mark lands in this single sheet — one row per student,
            one column per class date. Scrolling works on phones; the Excel download matches it exactly.
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
