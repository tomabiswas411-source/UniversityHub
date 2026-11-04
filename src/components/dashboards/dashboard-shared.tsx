"use client";

import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  FileText,
  FolderDown,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/shared/motion-primitives";
import type { ScheduleChangeDTO, ScheduleDTO, TimeSlotDTO } from "@/types";
import { DAY_LABELS, DAYS_OF_WEEK } from "@/types";

/* ============================================================
   Shared building blocks for all role dashboards.
   Design language: "Campus Editorial" — Cavendish Yellow +
   Peppercorn ink on warm cream, white cards, Fraunces serif
   display numerals, forest green for primary actions.
   amber/emerald/rose reserved for semantics only.
   ============================================================ */

/* ---------------- Dashboard sections (single source of truth) ----------------
   The desktop sidebar rail renders these as the dashboard's section
   navigation; each role panel keeps identical tab values so the URL
   `?view=dashboard&tab=…` param drives both. The in-page tab strip is
   hidden on lg+ (the rail owns it) and collapses to a single scrollable
   pill row on phones. */
export interface DashboardSection {
  value: string;
  label: string;
  icon: LucideIcon;
}

export const DASHBOARD_SECTIONS = {
  super_admin: [
    { value: "universities", label: "Universities", icon: Building2 },
    { value: "users", label: "Platform Users", icon: Users },
    { value: "plans", label: "Plans & Billing", icon: CreditCard },
    { value: "analytics", label: "Analytics", icon: ChartNoAxesColumn },
    { value: "system", label: "System Control", icon: ShieldCheck },
  ],
  dept_admin: [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "analytics", label: "Analytics", icon: BarChart3 },
    { value: "schedule", label: "Schedule", icon: CalendarDays },
    { value: "teachers", label: "Teachers", icon: GraduationCap },
    { value: "students", label: "Students", icon: Users },
    { value: "courses", label: "Courses", icon: BookOpen },
    { value: "programs", label: "Programs", icon: LayoutGrid },
    { value: "rooms", label: "Rooms & Slots", icon: DoorOpen },
    { value: "notices", label: "Notices", icon: Megaphone },
  ],
  teacher: [
    { value: "schedule", label: "My Schedule", icon: CalendarDays },
    { value: "attendance", label: "Attendance", icon: ClipboardCheck },
    { value: "changes", label: "Class Changes", icon: ArrowLeftRight },
    { value: "students", label: "Students", icon: Users },
    { value: "assignments", label: "Assignments", icon: FileText },
    { value: "results", label: "Results", icon: Award },
    { value: "notices", label: "Notices", icon: Megaphone },
    { value: "documents", label: "Documents", icon: FolderDown },
    { value: "insights", label: "Insights", icon: ChartNoAxesColumn },
  ],
  student: [
    { value: "routine", label: "Today & Routine", icon: CalendarDays },
    { value: "notices", label: "Notices", icon: Megaphone },
    { value: "assignments", label: "Assignments", icon: FileText },
    { value: "results", label: "Results", icon: Award },
    { value: "performance", label: "Performance", icon: TrendingUp },
    { value: "alerts", label: "Alerts", icon: Bell },
  ],
} as const satisfies Record<string, readonly DashboardSection[]>;

export function dashboardSectionsFor(role: string): readonly DashboardSection[] {
  return DASHBOARD_SECTIONS[role as keyof typeof DASHBOARD_SECTIONS] ?? [];
}

/** Shared tab-strip styling: single scrollable pill row on phones,
    removed on lg+ where the sidebar rail carries the sections. */
export const MOBILE_TABS_LIST =
  "no-scrollbar h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1 sm:h-10 lg:hidden";
export const MOBILE_TAB_TRIGGER =
  "min-h-9 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-medium sm:text-sm";

export const GRADIENT_BTN =
  "btn-shine bg-[#2D4F35] hover:bg-[#3A6B47] text-white shadow-md shadow-[#2D4F35]/25";
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
  const tones: Record<string, { chip: string; bar: string }> = {
    violet: {
      chip: "from-[#2D4F35] to-[#4A7C58] text-white shadow-[#2D4F35]/30",
      bar: "from-[#2D4F35] to-[#4A7C58]",
    }, // forest green
    fuchsia: {
      chip: "from-[#1B3358] to-[#3B5578] text-white shadow-[#1B3358]/30",
      bar: "from-[#1B3358] to-[#3B5578]",
    }, // deep navy
    amber: {
      chip: "from-[#FFD60A] to-[#E6C800] text-[#241C15] shadow-[#E6C800]/40",
      bar: "from-[#FFD60A] to-[#E6C800]",
    }, // cavendish gold
    emerald: {
      chip: "from-[#E8A87C] to-[#F4C9A4] text-[#241C15] shadow-[#C8442E]/20",
      bar: "from-[#E8A87C] to-[#F4C9A4]",
    }, // warm peach
    rose: {
      chip: "from-[#C8442E] to-[#E55A3F] text-white shadow-[#C8442E]/30",
      bar: "from-[#C8442E] to-[#E55A3F]",
    }, // rust red
  };
  const t = tones[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      {/* tone hairline on top edge */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r opacity-80",
          t.bar
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="font-display text-3xl leading-tight text-heading">
            {typeof value === "number" ? <CountUp value={value} /> : value}
          </p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg",
            t.chip
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
   When the caller passes latestChangeBySchedule, live changes are
   surfaced in the cell itself: cancelled classes get struck through
   plus a tiny Cancelled/Moved/Room/Extra badge (same convention as
   the change lists).
   ------------------------------------------------------ */

const GRID_CHANGE_BADGES: Record<string, { label: string; cls: string }> = {
  cancelled: { label: "Cancelled", cls: "bg-rose-600/90 text-white" },
  rescheduled: { label: "Moved", cls: "bg-amber-400/90 text-[#241C15]" },
  time_changed: { label: "Moved", cls: "bg-amber-400/90 text-[#241C15]" },
  room_changed: { label: "Room", cls: "bg-amber-400/90 text-[#241C15]" },
  extra_class: { label: "Extra", cls: "bg-emerald-600/90 text-white" },
};

export function TimetableGrid({
  schedules,
  timeSlots,
  highlightToday = true,
  showTeacher = true,
  onClassClick,
  latestChangeBySchedule,
}: {
  schedules: ScheduleDTO[];
  timeSlots: TimeSlotDTO[];
  highlightToday?: boolean;
  showTeacher?: boolean;
  /** When provided, every class cell becomes a button (teacher manage mode). */
  onClassClick?: (schedule: ScheduleDTO) => void;
  /** scheduleId → live (effective-today) change; powers Cancelled/Moved badges. */
  latestChangeBySchedule?: Map<string, ScheduleChangeDTO>;
}) {
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase() as (typeof DAYS_OF_WEEK)[number];
  const isToday = (d: string) => highlightToday && d === today;

  if (timeSlots.length === 0 || schedules.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      {/* min-w shrinks on phones so the grid stays readable without
          excessive horizontal scrolling; the time column stays sticky. */}
      <table className="w-full min-w-[560px] border-collapse text-xs sm:min-w-[720px] sm:text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-[74px] bg-muted/95 px-1.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur sm:w-28 sm:px-3 sm:text-[11px]">
              Time
            </th>
            {DAYS_OF_WEEK.map((d) => (
              <th
                key={d}
                className={cn(
                  "px-1 py-2 text-center text-[11px] font-bold sm:px-2 sm:py-2.5 sm:text-xs",
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
                  "sticky left-0 z-10 bg-card px-1.5 py-1.5 align-middle backdrop-blur sm:px-3 sm:py-2",
                  slot.isBreak && "bg-amber-50/70 dark:bg-amber-950/20"
                )}
              >
                <p className="text-[10px] font-semibold leading-tight sm:text-xs">{slot.startTime}</p>
                <p className="text-[9px] text-muted-foreground sm:text-[11px]">
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
                      "border-l border-border/50 p-0.5 align-top sm:p-1",
                      slot.isBreak && "bg-amber-50/50 dark:bg-amber-950/10",
                      isToday(day) && "bg-gold/10"
                    )}
                  >
                    {cell.map((s) => {
                      const change = latestChangeBySchedule?.get(s.id);
                      const cancelled = change?.changeType === "cancelled";
                      const badge = change ? GRID_CHANGE_BADGES[change.changeType] : undefined;
                      const inner = (
                        <>
                          <p className={cn("font-bold", cancelled && "line-through decoration-rose-400/80 decoration-2")}>
                            {s.courseCode}
                          </p>
                          <p className="max-w-[92px] truncate text-[9px] opacity-80 sm:max-w-[140px] sm:text-[11px]">
                            {s.roomNumber}
                            {showTeacher && s.teacherName ? ` · ${s.teacherName}` : ""}
                          </p>
                          {badge && (
                            <span
                              className={cn(
                                "mt-0.5 inline-block rounded px-1 py-px text-[10px] font-bold leading-none",
                                badge.cls
                              )}
                            >
                              {badge.label}
                            </span>
                          )}
                        </>
                      );
                      if (onClassClick) {
                        return (
                          <button
                            key={s.id}
                            type="button"
                            aria-label={`Manage ${s.courseCode}, ${DAY_LABELS[s.dayOfWeek]} ${s.startTime}, room ${s.roomNumber}`}
                            onClick={() => onClassClick(s)}
                            className={cn(
                              "mb-1 block w-full cursor-pointer rounded-md px-1.5 py-1 text-left text-[10px] leading-tight transition-all last:mb-0 hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2D4F35] active:translate-y-0 sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-xs",
                              s.classType === "lab" ? "cell-lab" : "cell-theory",
                              "ring-0 ring-inset ring-[#2D4F35]/0 hover:ring-2 hover:ring-[#2D4F35]/40 dark:hover:ring-[#7FB08F]/40"
                            )}
                          >
                            {inner}
                          </button>
                        );
                      }
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "mb-1 rounded-md px-1.5 py-1 text-[10px] leading-tight last:mb-0 sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-xs",
                            s.classType === "lab" ? "cell-lab" : "cell-theory"
                          )}
                        >
                          {inner}
                        </div>
                      );
                    })}
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
