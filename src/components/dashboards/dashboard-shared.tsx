"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScheduleDTO, TimeSlotDTO } from "@/types";
import { DAY_LABELS, DAYS_OF_WEEK } from "@/types";

/* ============================================================
   Shared building blocks for all role dashboards.
   Design language: "Campus Editorial" — Cavendish Yellow +
   Peppercorn ink on warm cream, white cards, Fraunces serif
   display numerals, forest green for primary actions.
   amber/emerald/rose reserved for semantics only.
   ============================================================ */

export const GRADIENT_BTN =
  "bg-[#2D4F35] hover:bg-[#3A6B47] text-white shadow-md shadow-[#2D4F35]/25";
export const GRADIENT_ICON =
  "bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/30";

/* ---------------- Stat card ----------------
   Mirrors the classic routine-hub layout:
   label + big serif numeral on the left, colored
   icon square on the right. */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "violet",
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone?: "violet" | "fuchsia" | "amber" | "emerald" | "rose";
  delay?: number;
}) {
  const tones: Record<string, string> = {
    violet: "from-[#2D4F35] to-[#4A7C58] text-white shadow-[#2D4F35]/30", // forest green
    fuchsia: "from-[#1B3358] to-[#3B5578] text-white shadow-[#1B3358]/30", // deep navy
    amber: "from-[#FFD60A] to-[#E6C800] text-[#241C15] shadow-[#E6C800]/40", // cavendish gold
    emerald: "from-[#E8A87C] to-[#F4C9A4] text-[#241C15] shadow-[#C8442E]/20", // warm peach
    rose: "from-[#C8442E] to-[#E55A3F] text-white shadow-[#C8442E]/30", // rust red
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="font-display text-3xl leading-tight text-heading">{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg",
            tones[tone]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/25">
        <Icon className="h-6 w-6 text-[#8A7000] dark:text-gold" />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------------- Section card ---------------- */
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/25">
              <Icon className="h-4 w-4 text-[#8A7000] dark:text-gold" />
            </span>
          )}
          <h3 className="text-sm font-bold sm:text-base">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/* ---------------- Weekly timetable grid ----------------
   Rows = time slots, Cols = 6 days (Sat–Thu).
   Cell shows course code + room + teacher.
   Theory = soft forest green · Lab = soft cavendish gold.
   ------------------------------------------------------ */
export function TimetableGrid({
  schedules,
  timeSlots,
  highlightToday = true,
  showTeacher = true,
}: {
  schedules: ScheduleDTO[];
  timeSlots: TimeSlotDTO[];
  highlightToday?: boolean;
  showTeacher?: boolean;
}) {
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase() as (typeof DAYS_OF_WEEK)[number];
  const isToday = (d: string) => highlightToday && d === today;

  if (timeSlots.length === 0 || schedules.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-xs sm:text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-24 bg-muted/80 px-2 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur sm:w-28 sm:px-3">
              Time
            </th>
            {DAYS_OF_WEEK.map((d) => (
              <th
                key={d}
                className={cn(
                  "px-2 py-2.5 text-center font-bold",
                  isToday(d)
                    ? "bg-gold/30 text-[#241C15] dark:bg-gold/15 dark:text-gold"
                    : "bg-muted/60 text-muted-foreground"
                )}
              >
                {DAY_LABELS[d]}
                {isToday(d) && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#8A7000] align-middle dark:bg-gold" />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr key={slot.id} className="border-t">
              <td
                className={cn(
                  "sticky left-0 z-10 bg-card px-2 py-2 align-middle backdrop-blur sm:px-3",
                  slot.isBreak && "bg-amber-50/70 dark:bg-amber-950/20"
                )}
              >
                <p className="text-[11px] font-semibold leading-tight sm:text-xs">
                  {slot.startTime}
                </p>
                <p className="text-[10px] text-muted-foreground sm:text-[11px]">
                  {slot.isBreak ? "Break" : slot.label}
                </p>
              </td>
              {DAYS_OF_WEEK.map((day) => {
                const cell = schedules.filter(
                  (s) => s.dayOfWeek === day && s.timeSlotId === slot.id
                );
                return (
                  <td
                    key={`${day}-${slot.id}`}
                    className={cn(
                      "border-l border-border/50 p-1 align-top",
                      slot.isBreak && "bg-amber-50/50 dark:bg-amber-950/10",
                      isToday(day) && "bg-gold/10"
                    )}
                  >
                    {cell.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "mb-1 rounded-lg px-2 py-1.5 text-[11px] leading-tight last:mb-0 sm:text-xs",
                          s.classType === "lab" ? "cell-lab" : "cell-theory"
                        )}
                      >
                        <p className="font-bold">{s.courseCode}</p>
                        <p className="truncate text-[10px] opacity-80 sm:text-[11px]">
                          {s.roomNumber}
                          {showTeacher && s.teacherName ? ` · ${s.teacherName}` : ""}
                        </p>
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Change type badge ---------------- */
export function ChangeTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
    rescheduled: { label: "Rescheduled", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    time_changed: { label: "Time Changed", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    room_changed: { label: "Room Changed", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    extra_class: { label: "Extra Class", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  };
  const item = map[type] ?? { label: type, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", item.cls)}>
      {item.label}
    </span>
  );
}

/* ---------------- Category badge (notices) ---------------- */
export function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    academic: { label: "Academic", cls: "bg-green/10 text-green" },
    exam: { label: "Exam", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
    event: { label: "Event", cls: "bg-gold/30 text-[#7A6500] dark:bg-gold/15 dark:text-gold" },
    general: { label: "General", cls: "bg-muted text-muted-foreground" },
    schedule_change: { label: "Schedule", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
    assignment: { label: "Assignment", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
  };
  const item = map[category] ?? map.general;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", item.cls)}>
      {item.label}
    </span>
  );
}

/* ---------------- Exam type badge ---------------- */
export function ExamTypeBadge({ examType }: { examType: string }) {
  const labels: Record<string, string> = {
    ct1: "CT-1",
    ct2: "CT-2",
    midterm: "Midterm",
    final: "Final",
    assignment: "Assignment",
  };
  return (
    <span className="inline-flex items-center rounded-full bg-navy/10 px-2 py-0.5 text-[11px] font-semibold text-navy dark:text-[#9DB4D6]">
      {labels[examType] ?? examType}
    </span>
  );
}

/* ---------------- Loading spinner block ---------------- */
export function PanelLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#2D4F35] border-t-transparent dark:border-[#7FB08F]" />
      {label}
    </div>
  );
}
