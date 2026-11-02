"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Award,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  CloudOff,
  Coffee,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Hash,
  MapPin,
  Megaphone,
  Pin,
  RefreshCw,
  Sunrise,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { apiGet } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import {
  CategoryBadge,
  ChangeTypeBadge,
  EmptyState,
  ExamTypeBadge,
  GRADIENT_BTN,
  PanelLoader,
  SectionCard,
  StatCard,
  TimetableGrid,
} from "@/components/dashboards/dashboard-shared";
import { timeAgo } from "@/components/shared/notification-bell";
import type {
  AcademicCalendarDTO,
  AssignmentDTO,
  DayOfWeek,
  NoticeDTO,
  ResultDTO,
  ScheduleChangeDTO,
  ScheduleDTO,
  TimeSlotDTO,
} from "@/types";
import { DAY_LABELS } from "@/types";
import { cn } from "@/lib/utils";

/* ============================================================
   StudentPanel — student home base (view-only)
   Design language: "Aurora Royale" (violet → fuchsia → amber)
   ============================================================ */

interface StudentProfile {
  fullName: string;
  rollNumber: string | null;
  studentIdNumber: string | null;
  semester: number | null;
  section: string | null;
  departmentName: string | null;
  departmentShortName: string | null;
  universityName: string | null;
  programId: string | null;
}

interface StudentDashboardData {
  profile: StudentProfile;
  schedules: ScheduleDTO[];
  changes: ScheduleChangeDTO[];
  notices: NoticeDTO[];
  assignments: AssignmentDTO[];
  results: ResultDTO[];
  timeSlots: TimeSlotDTO[];
  calendar: AcademicCalendarDTO[];
  unreadCount: number;
  todayClasses: number;
}

/* ---------------- local helpers ---------------- */

function currentDay(): DayOfWeek {
  return new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase() as DayOfWeek;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return (parts.map((w) => w[0]?.toUpperCase() ?? "").join("") || "S");
}

const CHANGE_BORDER: Record<string, string> = {
  cancelled: "border-l-rose-500",
  rescheduled: "border-l-amber-500",
  time_changed: "border-l-amber-500",
  room_changed: "border-l-amber-500",
  extra_class: "border-l-emerald-500",
};

const EVENT_BADGE: Record<string, string> = {
  holiday: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  exam: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  event: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

function gradeBadgeCls(grade: string | null): string {
  if (!grade) return "bg-muted text-muted-foreground";
  if (grade.startsWith("A+"))
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
  if (grade.startsWith("A"))
    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300";
  if (grade.startsWith("B"))
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
  if (grade.startsWith("F"))
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
  return "bg-muted text-muted-foreground"; // C / D
}

function dueChip(dueISO: string | null): { label: string; cls: string } {
  if (!dueISO) return { label: "No due date", cls: "bg-muted text-muted-foreground" };
  const due = new Date(dueISO);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);
  if (days < 0)
    return { label: "Overdue", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" };
  if (days <= 3)
    return {
      label: days === 0 ? "Due today" : `Due in ${days}d`,
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    };
  return { label: fmtDate(dueISO), cls: "bg-muted text-muted-foreground" };
}

/* ---------------- small local pieces ---------------- */

function HeroPill({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

function ChangeRow({ change }: { change: ScheduleChangeDTO }) {
  const details: string[] = [];
  if (change.newDay) details.push(DAY_LABELS[change.newDay as DayOfWeek] ?? change.newDay);
  if (change.newStartTime)
    details.push(
      `${fmtTime(change.newStartTime)}${change.newEndTime ? `–${fmtTime(change.newEndTime)}` : ""}`
    );
  if (change.newRoomNumber) details.push(`Room ${change.newRoomNumber}`);

  return (
    <div
      className={cn(
        "rounded-xl border bg-background/60 p-3 border-l-4 sm:p-4",
        CHANGE_BORDER[change.changeType] ?? "border-l-foreground/25"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChangeTypeBadge type={change.changeType} />
        <span className="text-sm font-bold">{change.courseCode}</span>
        {change.courseName && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">{change.courseName}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{change.reason}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" aria-hidden />
          Effective {fmtDate(change.effectiveDate)}
        </span>
        {details.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden />
            {details.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- main component ---------------- */

export function StudentPanel() {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNotices, setExpandedNotices] = useState<Record<string, boolean>>({});
  const authUser = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<StudentDashboardData>("/api/student/dashboard");
      setData(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      toast({
        title: "Couldn't load your dashboard",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---- profile (API is source of truth, auth store as fallback) ---- */
  const profile = data?.profile ?? null;
  const fullName = profile?.fullName || authUser?.fullName || "Student";
  const firstName = fullName.trim().split(/\s+/)[0] || "Student";
  const rollNumber = profile?.rollNumber ?? authUser?.rollNumber ?? null;
  const studentIdNumber = profile?.studentIdNumber ?? authUser?.studentIdNumber ?? null;
  const semester = profile?.semester ?? authUser?.semester ?? null;
  const section = profile?.section ?? authUser?.section ?? null;
  const deptShort = profile?.departmentShortName ?? null;
  const universityName = profile?.universityName ?? authUser?.universityName ?? null;
  const programLine = `${deptShort ? `${deptShort} · ` : ""}Semester ${semester ?? "–"}${
    section ? ` · Section ${section}` : ""
  }`;

  /* ---- derived data ---- */
  const today = currentDay();

  const todayList = useMemo(() => {
    return (data?.schedules ?? [])
      .filter((s) => s.dayOfWeek === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [data, today]);

  const uniqueCourses = useMemo(
    () => new Set((data?.schedules ?? []).map((s) => s.courseCode)).size,
    [data]
  );

  const sortedAssignments = useMemo(() => {
    return [...(data?.assignments ?? [])].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [data]);

  const soonestDue = sortedAssignments.find(
    (a) => a.dueDate && new Date(a.dueDate).getTime() >= Date.now()
  );
  const assignmentsSub = soonestDue?.dueDate
    ? `Next due ${fmtDate(soonestDue.dueDate)}`
    : sortedAssignments.length > 0
      ? "No upcoming due dates"
      : undefined;

  const sortedChanges = useMemo(() => {
    return [...(data?.changes ?? [])].sort(
      (a, b) =>
        new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime() ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [data]);
  const recentChanges = sortedChanges.slice(0, 6);

  const sortedCalendar = useMemo(() => {
    return [...(data?.calendar ?? [])].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [data]);

  const resultGroups = useMemo(() => {
    const map = new Map<string, { key: string; code: string; name: string; rows: ResultDTO[] }>();
    for (const r of data?.results ?? []) {
      const key = r.courseId || r.courseCode || "unknown";
      const entry = map.get(key) ?? {
        key,
        code: r.courseCode ?? "Course",
        name: r.courseName ?? "",
        rows: [],
      };
      entry.rows.push(r);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [data]);

  const todayLabel =
    DAY_LABELS[today] ?? today.charAt(0).toUpperCase() + today.slice(1);

  /* ---- loading / error ---- */
  if (loading && !data) {
    return <PanelLoader label="Loading your dashboard…" />;
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <EmptyState
          icon={CloudOff}
          title="Couldn't load your dashboard"
          hint={error}
        />
        <Button onClick={() => void load()} className={GRADIENT_BTN}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  const tabMotion = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3 },
  };

  return (
    <div className="space-y-6">
      {/* ---------- Hero banner ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-amber-600 p-5 text-white shadow-lg shadow-indigo-500/25 sm:p-7"
        aria-label="Student profile summary"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-amber-300/20 blur-3xl"
        />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Hi, {firstName} 👋
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {rollNumber && (
                <HeroPill icon={Hash}>
                  <span className="sr-only">Roll number </span>
                  {rollNumber}
                </HeroPill>
              )}
              {studentIdNumber && (
                <HeroPill icon={CreditCard}>
                  <span className="sr-only">Student ID </span>
                  {studentIdNumber}
                </HeroPill>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <HeroPill icon={GraduationCap}>{programLine}</HeroPill>
            </div>
            {universityName && (
              <p className="mt-3 text-xs font-medium text-white/75">{universityName}</p>
            )}
          </div>
          <div
            aria-hidden
            className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-indigo-500 text-2xl font-extrabold shadow-xl ring-4 ring-white/30 md:flex"
          >
            {initials(fullName)}
          </div>
        </div>
      </motion.section>

      {/* ---------- Stats row ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarClock}
          label="Today's Classes"
          value={data?.todayClasses ?? 0}
          tone="amber"
          delay={0}
        />
        <StatCard
          icon={BookOpen}
          label="Total Courses"
          value={uniqueCourses}
          sub="This semester"
          tone="violet"
          delay={0.05}
        />
        <StatCard
          icon={ClipboardList}
          label="Assignments"
          value={sortedAssignments.length}
          sub={assignmentsSub ?? "Nothing assigned"}
          tone="fuchsia"
          delay={0.1}
        />
        <StatCard
          icon={Bell}
          label="Unread Alerts"
          value={data?.unreadCount ?? 0}
          sub="See the Alerts tab"
          tone="rose"
          delay={0.15}
        />
      </div>

      {/* ---------- Tabs ---------- */}
      <Tabs defaultValue="routine">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-2xl bg-muted/60 p-1.5">
          <TabsTrigger value="routine" className="min-h-9 rounded-xl px-3 text-xs sm:text-sm">
            Today &amp; Routine
          </TabsTrigger>
          <TabsTrigger value="notices" className="min-h-9 rounded-xl px-3 text-xs sm:text-sm">
            Notices
          </TabsTrigger>
          <TabsTrigger value="assignments" className="min-h-9 rounded-xl px-3 text-xs sm:text-sm">
            Assignments
          </TabsTrigger>
          <TabsTrigger value="results" className="min-h-9 rounded-xl px-3 text-xs sm:text-sm">
            Results
          </TabsTrigger>
          <TabsTrigger value="alerts" className="min-h-9 rounded-xl px-3 text-xs sm:text-sm">
            Alerts
          </TabsTrigger>
        </TabsList>

        {/* ===== Today & Routine ===== */}
        <TabsContent value="routine" className="mt-4">
          <motion.div {...tabMotion} className="space-y-6">
            {/* Today's classes — timeline */}
            <SectionCard
              title="Today's Classes"
              icon={Sunrise}
              action={
                <span className="text-xs font-medium capitalize text-muted-foreground">
                  {todayLabel}
                </span>
              }
            >
              {todayList.length === 0 ? (
                <EmptyState
                  icon={Coffee}
                  title={today === ("friday" as string) ? "Weekend — no classes today" : "No classes today"}
                  hint="Enjoy the break — check your weekly routine below."
                />
              ) : (
                <ol className="space-y-0">
                  {todayList.map((s, i) => (
                    <li key={s.id} className="flex gap-3 sm:gap-4">
                      <div className="w-16 shrink-0 pt-0.5 text-right sm:w-20">
                        <p className="text-sm font-bold leading-tight">{fmtTime(s.startTime)}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtTime(s.endTime)}</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <span
                          aria-hidden
                          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-amber-500 shadow"
                        />
                        {i < todayList.length - 1 && (
                          <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2",
                          i < todayList.length - 1 && "pb-5"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold leading-snug">
                            {s.courseCode}
                            <span className="font-medium text-muted-foreground">
                              {" "}
                              · {s.courseName}
                            </span>
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {s.roomNumber}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" aria-hidden />
                              {s.teacherName}
                            </span>
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            s.classType === "lab" &&
                              "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          )}
                        >
                          {s.classType === "lab" ? "Lab" : "Theory"}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            {/* Full weekly routine */}
            <SectionCard title="Full Weekly Routine" icon={CalendarDays}>
              {(data?.schedules ?? []).length === 0 || (data?.timeSlots ?? []).length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No routine published yet"
                  hint="Your weekly class routine will appear here once scheduled."
                />
              ) : (
                <TimetableGrid schedules={data?.schedules ?? []} timeSlots={data?.timeSlots ?? []} />
              )}
            </SectionCard>

            {/* Active class changes (latest 6) */}
            <SectionCard
              title="Active Class Changes"
              icon={CalendarX2}
              action={
                sortedChanges.length > 0 ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    Latest {Math.min(6, sortedChanges.length)} of {sortedChanges.length}
                  </span>
                ) : undefined
              }
            >
              {recentChanges.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="No active class changes"
                  hint="Cancellations and reschedules will show up here."
                />
              ) : (
                <div className="space-y-3">
                  {recentChanges.map((c) => (
                    <ChangeRow key={c.id} change={c} />
                  ))}
                </div>
              )}
            </SectionCard>
          </motion.div>
        </TabsContent>

        {/* ===== Notices ===== */}
        <TabsContent value="notices" className="mt-4">
          <motion.div {...tabMotion}>
            <SectionCard
              title="Notices"
              icon={Megaphone}
              action={
                (data?.notices ?? []).length > 0 ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    {(data?.notices ?? []).length} notice
                    {(data?.notices ?? []).length === 1 ? "" : "s"}
                  </span>
                ) : undefined
              }
            >
              {(data?.notices ?? []).length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title="No notices yet"
                  hint="Department announcements will appear here."
                />
              ) : (
                <div className="max-h-96 divide-y overflow-y-auto pr-1">
                  {(data?.notices ?? []).map((n) => {
                    const isExpanded = !!expandedNotices[n.id];
                    const showToggle =
                      n.content.length > 180 || n.content.split("\n").length > 4;
                    return (
                      <article key={n.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {n.isPinned && (
                            <Pin
                              className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                              aria-label="Pinned notice"
                            />
                          )}
                          <CategoryBadge category={n.category} />
                          <h4 className="min-w-0 text-sm font-bold">{n.title}</h4>
                        </div>
                        <p
                          className={cn(
                            "mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground",
                            !isExpanded && "line-clamp-4"
                          )}
                        >
                          {n.content}
                        </p>
                        {showToggle && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedNotices((prev) => ({ ...prev, [n.id]: !prev[n.id] }))
                            }
                            className="mt-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {isExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                        <p className="mt-2 text-[11px] text-muted-foreground/80">
                          Posted by {n.postedByName} · {timeAgo(n.createdAt)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </motion.div>
        </TabsContent>

        {/* ===== Assignments ===== */}
        <TabsContent value="assignments" className="mt-4">
          <motion.div {...tabMotion}>
            <SectionCard
              title="Assignments"
              icon={BookOpen}
              action={
                sortedAssignments.length > 0 ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    {sortedAssignments.length} total
                  </span>
                ) : undefined
              }
            >
              {sortedAssignments.length === 0 ? (
                <EmptyState
                  icon={Bell}
                  title="No assignments yet"
                  hint="Assignments from your courses will appear here."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {sortedAssignments.map((a) => {
                    const chip = dueChip(a.dueDate);
                    return (
                      <article
                        key={a.id}
                        className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="min-w-0 text-sm font-bold leading-snug">{a.title}</h4>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-indigo-300 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
                          >
                            {a.courseCode ?? "Course"}
                          </Badge>
                        </div>
                        {a.courseName && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {a.courseName}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" aria-hidden />
                            {a.teacherName ?? "Faculty"}
                          </span>
                          {a.maxMarks != null && (
                            <span className="inline-flex items-center gap-1">
                              <Award className="h-3 w-3" aria-hidden />
                              Max {a.maxMarks} marks
                            </span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {a.description}
                        </p>
                        <div className="mt-auto pt-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              chip.cls
                            )}
                          >
                            <CalendarClock className="h-3 w-3" aria-hidden />
                            {chip.label}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </motion.div>
        </TabsContent>

        {/* ===== Results ===== */}
        <TabsContent value="results" className="mt-4">
          <motion.div {...tabMotion}>
            <SectionCard title="Exam Results" icon={Award}>
              {resultGroups.length === 0 ? (
                <EmptyState
                  icon={Award}
                  title="No results published yet"
                  hint="Your exam results will appear here once published."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {resultGroups.map((g) => (
                    <div key={g.key} className="rounded-2xl border bg-background/50 p-4">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-bold">{g.code}</p>
                        {g.name && (
                          <p className="min-w-0 truncate text-xs text-muted-foreground">{g.name}</p>
                        )}
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {g.rows.map((r) => (
                          <div
                            key={r.id}
                            className="flex flex-wrap items-center gap-2 text-sm"
                          >
                            <ExamTypeBadge examType={r.examType} />
                            <span className="font-semibold">
                              {r.marks}/{r.maxMarks}
                            </span>
                            {r.grade && (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                                  gradeBadgeCls(r.grade)
                                )}
                              >
                                {r.grade}
                              </span>
                            )}
                            {r.remarks && (
                              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                {r.remarks}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </motion.div>
        </TabsContent>

        {/* ===== Alerts ===== */}
        <TabsContent value="alerts" className="mt-4">
          <motion.div {...tabMotion}>
            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Class Changes"
                icon={CalendarX2}
                action={
                  sortedChanges.length > 0 ? (
                    <span className="text-xs font-medium text-muted-foreground">
                      {sortedChanges.length} active
                    </span>
                  ) : undefined
                }
              >
                {sortedChanges.length === 0 ? (
                  <EmptyState
                    icon={CalendarCheck}
                    title="No active class changes"
                    hint="Cancellations and reschedules will show up here."
                  />
                ) : (
                  <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {sortedChanges.map((c) => (
                      <ChangeRow key={c.id} change={c} />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Upcoming Calendar" icon={CalendarRange}>
                {sortedCalendar.length === 0 ? (
                  <EmptyState
                    icon={CalendarRange}
                    title="No upcoming events"
                    hint="Exams, holidays and events will appear here."
                  />
                ) : (
                  <div className="max-h-96 divide-y overflow-y-auto pr-1">
                    {sortedCalendar.map((e) => {
                      const d = new Date(e.date);
                      return (
                        <div key={e.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-center">
                            <span className="text-[10px] font-bold uppercase leading-none text-muted-foreground">
                              {d.toLocaleDateString("en-US", { month: "short" })}
                            </span>
                            <span className="mt-0.5 text-sm font-bold leading-none">
                              {d.getDate()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                                  EVENT_BADGE[e.eventType] ?? "bg-muted text-muted-foreground"
                                )}
                              >
                                {e.eventType}
                              </span>
                              <h4 className="min-w-0 text-sm font-bold">{e.title}</h4>
                            </div>
                            {e.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {e.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
