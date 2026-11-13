"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
 ScanLine,
 Sunrise,
 TrendingUp,
 User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPatch } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth-store";
import {
 CategoryBadge,
 ChangeTypeBadge,
 DASHBOARD_SECTIONS,
 EmptyState,
 ExamTypeBadge,
 GRADIENT_BTN,
 MOBILE_TABS_LIST,
 MOBILE_TABS_FADE,
 MOBILE_TAB_TRIGGER,
 PanelLoader,
 SectionCard,
 StatCard,
 TimetableGrid,
} from "@/components/dashboards/dashboard-shared";
import {
 CHART_COLORS,
 ChartCard,
 MetricRing,
 PerfLineChart,
} from "@/components/dashboards/analytics-charts";
import { StudentAttendanceSheetCard } from "@/components/dashboards/student-attendance-sheet-card";
import { StudentDocumentsTab } from "@/components/dashboards/student-documents-tab";
import {
  StudentProfileTab,
  type StudentCourse,
  type StudentTeacher,
} from "@/components/dashboards/student-profile-tab";
import { initials, letterTone } from "@/lib/format";
import { daysUntilDate, parseDateOnly } from "@/lib/date-bd";
import {
 followNotificationLink,
 timeAgo,
 typeIcon,
} from "@/components/shared/notification-bell";
import type {
 AcademicCalendarDTO,
 AssignmentDTO,
 DayOfWeek,
 NoticeDTO,
 NotificationDTO,
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
 universityShortName?: string | null;
 programId: string | null;
 programName?: string | null;
 programShortName?: string | null;
 phone?: string | null;
 guardianPhone?: string | null;
 memberSince?: string;
 accountActive?: boolean;
}

interface StudentDashboardData {
 profile: StudentProfile;
 teachers?: StudentTeacher[];
 courses?: StudentCourse[];
 schedules: ScheduleDTO[];
 changes: ScheduleChangeDTO[];
 notices: NoticeDTO[];
 assignments: AssignmentDTO[];
 results: ResultDTO[];
 timeSlots: TimeSlotDTO[];
 calendar: AcademicCalendarDTO[];
 unreadCount: number;
 todayClasses: number;
 attendance?: StudentAttendance;
 analytics?: StudentAnalytics;
}

interface StudentAttendance {
 hasData: boolean;
 rate: number;
 attended: number;
 total: number;
 absent: number;
 excused: number;
 perCourse: {
 courseId: string;
 courseCode: string;
 attended: number;
 total: number;
 pct: number;
 }[];
}

interface StudentAnalytics {
 hasData: boolean;
 estimatedGPA: number;
 overallAvgPct: number;
 overallGrade: string;
 totalEntries: number;
 coursePerformance: {
 courseId: string;
 courseCode: string;
 courseName: string;
 avgPct: number;
 grade: string;
 gpaPoint: number;
 examCount: number;
 creditHours: number;
 }[];
 examTrend: { label: string; pct: number }[];
 upcomingDeadlines: AssignmentDTO[];
}

/* ---------------- local helpers ---------------- */

function currentDay(): DayOfWeek {
 // The API computes "today" on the server (Asia/Dhaka) — derive the
 // same weekday in the browser so the "Today's Classes" timeline and
 // stat card agree with the data no matter which timezone the
 // student's phone is set to. Weekday strings match the schedule's
 // dayOfWeek values ("saturday"…"friday").
 const weekday = new Intl.DateTimeFormat("en-US", {
 timeZone: "Asia/Dhaka",
 weekday: "long",
 }).format(new Date());
 return weekday.toLowerCase() as DayOfWeek;
}

function fmtDate(iso: string): string {
 return parseWhen(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTime(t: string): string {
 return t.length >= 5 ? t.slice(0, 5) : t;
}

/** Date-only strings ("2025-11-20") parse as a LOCAL calendar date —
 `new Date("2025-11-20")` is UTC and renders the previous day for
 UTC-negative visitors. Full timestamps pass through unchanged. */
function parseWhen(iso: string): Date {
 return iso.length === 10 ? parseDateOnly(iso) : new Date(iso);
}

const CHANGE_BORDER: Record<string, string> = {
 cancelled: "border-l-rose-500",
 rescheduled: "border-l-amber-500",
 time_changed: "border-l-amber-500",
 room_changed: "border-l-amber-500",
 extra_class: "border-l-emerald-500",
};

/* Bangladesh's official weekend days — typed loosely because the schedule
   type (DayOfWeek) deliberately omits "friday" (no classes ever land on it). */
const WEEKEND_DAYS: readonly string[] = ["friday", "saturday"];

const EVENT_BADGE: Record<string, string> = {
 holiday: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 exam: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
 event: "bg-green/10 text-green",
 class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

function dueChip(dueISO: string | null): { label: string; cls: string } {
 if (!dueISO) return { label: "No due date", cls: "bg-muted text-muted-foreground" };
 // Day-diff comes from the Dhaka calendar (daysUntilDate), not the
 // browser clock — labels match the teacher dashboard exactly. Slice
 // to the date part so full ISO timestamps resolve to the same day.
 const diff = daysUntilDate(dueISO.slice(0, 10));
 if (Number.isNaN(diff)) return { label: fmtDate(dueISO), cls: "bg-muted text-muted-foreground" };
 const text =
 diff < 0 ? "Overdue" : diff === 0 ? "Due today" : diff === 1 ? "Due tomorrow" : `Due in ${diff}d`;
 const cls =
 diff < 0
 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
 : diff <= 3
 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
 : "bg-muted text-muted-foreground";
 return { label: `${text} · ${fmtDate(dueISO)}`, cls };
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

export function StudentPanel({
 navigate,
 tab,
 onTabChange,
}: {
 /** Provided by DashboardView — used for the Scan QR quick action. */
 navigate?: (v: "home" | "department" | "login" | "pricing" | "dashboard" | "scan", params?: Record<string, string>) => void;
 /** Active section — mirrors the ?tab= URL param (sidebar rail). */
 tab?: string;
 onTabChange?: (tab: string) => void;
}) {
 const [data, setData] = useState<StudentDashboardData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [expandedNotices, setExpandedNotices] = useState<Record<string, boolean>>({});
 const authUser = useAuthStore((s) => s.user);
 const router = useRouter();

 /* Section state — URL-driven when valid (sidebar rail), local pill
    clicks sync back to the URL via onTabChange. */
 const [localTab, setLocalTab] = useState("routine");
 const activeTab =
 tab && DASHBOARD_SECTIONS.student.some((s) => s.value === tab)
 ? tab
 : localTab;
 const handleTabChange = (v: string) => {
 setLocalTab(v);
 onTabChange?.(v);
 };

 /* Request-sequence guard: a slow dashboard response landing after a
    newer load() (tab re-entry, manual retry) must never overwrite it. */
 const loadSeqRef = useRef(0);

 const load = useCallback(async () => {
 const seq = ++loadSeqRef.current;
 setLoading(true);
 setError(null);
 try {
 const res = await apiGet<StudentDashboardData>("/api/student/dashboard");
 if (seq !== loadSeqRef.current) return; // stale — drop
 setData(res);
 } catch (err) {
 if (seq !== loadSeqRef.current) return; // stale — drop
 // surfaced via the error card below — a toast on top of it is noise
 setError(err instanceof Error ? err.message : "Something went wrong");
 } finally {
 if (seq === loadSeqRef.current) setLoading(false);
 }
 }, []);

 useEffect(() => {
 void load();
 }, [load]);

 /* ---- notifications feed (Alerts tab + live unread count) ---- */
 const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
 const [notifUnread, setNotifUnread] = useState<number | null>(null);
 const [notifsLoading, setNotifsLoading] = useState(true);
 const [notifsErr, setNotifsErr] = useState<string | null>(null);
 const [markingAll, setMarkingAll] = useState(false);
 const [notifsHasMore, setNotifsHasMore] = useState(false);
 const [loadingOlder, setLoadingOlder] = useState(false);
 const notifsPageRef = useRef(1);
 /* Loaded-once latch for the Alerts tab: the feed loads on mount (the
    “Unread Alerts” stat card needs a fresh count) and re-loads each
    time the tab is RE-entered. Without the latch, mounting directly on
    /?tab=alerts would fire both the mount fetch and the activation
    fetch. */
 const alertsLoadedOnceRef = useRef(false);

 const loadNotifications = useCallback(async (page = 1) => {
 if (page === 1) setNotifsLoading(true);
 else setLoadingOlder(true);
 setNotifsErr(null);
 try {
 const res = await apiGet<{
 notifications: NotificationDTO[];
 unreadCount: number;
 total: number;
 hasMore: boolean;
 }>(`/api/notifications?page=${page}`);
 setNotifs((prev) => {
 if (page === 1) return res.notifications;
 // “Load older” appends — de-dupe by id in case a new notification
 // shifted the offset between page fetches.
 const seen = new Set(prev.map((n) => n.id));
 return [...prev, ...res.notifications.filter((n) => !seen.has(n.id))];
 });
 setNotifUnread(res.unreadCount);
 setNotifsHasMore(res.hasMore);
 notifsPageRef.current = page;
 } catch (err) {
 setNotifsErr(
 err instanceof Error ? err.message : "Couldn't load notifications"
 );
 } finally {
 if (page === 1) setNotifsLoading(false);
 else setLoadingOlder(false);
 }
 }, []);

 useEffect(() => {
 void loadNotifications();
 }, [loadNotifications]);

 // Refetch whenever the Alerts tab becomes active.
 useEffect(() => {
 if (activeTab !== "alerts") return;
 if (alertsLoadedOnceRef.current) void loadNotifications();
 alertsLoadedOnceRef.current = true;
 }, [activeTab, loadNotifications]);

 const markAllNotifsRead = useCallback(async () => {
 setMarkingAll(true);
 // Snapshot for the optimistic revert — if the API fails the feed must
 // go back to exactly what it showed before the flush.
 const prevNotifs = notifs;
 const prevUnread = notifUnread;
 setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
 setNotifUnread(0);
 try {
 await apiPatch("/api/notifications", { all: true });
 await loadNotifications(); // re-sync with the server
 } catch {
 // Revert the optimistic state and tell the student it didn't stick.
 setNotifs(prevNotifs);
 setNotifUnread(prevUnread);
 toast({
 title: "Couldn't mark all as read",
 description: "Please check your connection and try again.",
 variant: "destructive",
 });
 } finally {
 setMarkingAll(false);
 }
 }, [notifs, notifUnread, loadNotifications]);

 const markNotifRead = useCallback(
 async (id: string) => {
 const target = notifs.find((n) => n.id === id);
 if (!target || target.isRead) return;
 // Snapshot the PRE-optimistic values — the revert must restore what
 // was actually shown before the click (a blind “(c ?? 0) + 1” would
 // fabricate an unread the badge never had).
 const prevNotifs = notifs;
 const prevUnread = notifUnread;
 setNotifs((prev) =>
 prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
 );
 setNotifUnread((c) => Math.max(0, (c ?? 0) - 1));
 try {
 await apiPatch("/api/notifications", { ids: [id] });
 } catch {
 // Optimistic failure — revert to the exact pre-click state so the
 // badge and the unread highlight stay truthful.
 setNotifs(prevNotifs);
 setNotifUnread(prevUnread);
 toast({
 title: "Couldn't mark as read",
 description: "The notification stays unread — try again.",
 variant: "destructive",
 });
 }
 },
 [notifs, notifUnread]
 );

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
 // Dhaka-day math (daysUntilDate) — NOT raw Date.now(): the assignment
 // chips render "Due today" on the Dhaka calendar, so "Next due" must
 // agree with them in BD mornings too.
 (a) => a.dueDate && daysUntilDate(a.dueDate.slice(0, 10)) >= 0
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
 className="relative overflow-hidden rounded-2xl hero-gradient p-5 text-white shadow-lg shadow-[#241C15]/25 sm:p-7"
 aria-label="Student profile summary"
 >
 <div aria-hidden className="shimmer-line absolute inset-x-0 bottom-0 h-px" />
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
 {/* App-like quick action — in-app QR scanner for attendance */}
 <button
 type="button"
 onClick={() => navigate?.("scan")}
 className="btn-shine mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FFE01B] px-4 py-2 text-sm font-bold text-[#241C15] shadow-lg shadow-black/25 transition-transform hover:scale-[1.03] active:scale-95"
 >
 <ScanLine className="h-4 w-4" aria-hidden />
 Scan Attendance QR
 </button>
 </div>
 <div
 aria-hidden
 className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#FFE01B] text-2xl font-extrabold text-[#241C15] shadow-xl ring-4 ring-white/25 md:flex"
 >
 {initials(fullName)}
 </div>
 </div>
 </motion.section>

 {/* ---------- Stats row ---------- */}
 <div className="grid max-lg:[&>*:last-child]:col-span-2 grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-5">
 <StatCard
 icon={CalendarClock}
 label="Today's Classes"
 value={todayList.length}
 sub={todayLabel}
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
 icon={Award}
 label="Est. GPA / 4.00"
 value={data?.analytics?.hasData ? data.analytics.estimatedGPA.toFixed(2) : "—"}
 sub={data?.analytics?.hasData ? `Grade ${data.analytics.overallGrade} · ${data.analytics.overallAvgPct}%` : "Enter results first"}
 tone="emerald"
 delay={0.12}
 />
 <StatCard
 icon={Bell}
 label="Unread Alerts"
 value={notifUnread ?? data?.unreadCount ?? 0}
 sub="See the Alerts tab"
 tone="rose"
 delay={0.15}
 />
 </div>

 {/* ---------- Tabs ---------- */}
 <Tabs value={activeTab} onValueChange={handleTabChange}>
 {/* lg+: sidebar rail owns sections; below lg: one pill row */}
 <div className="relative">
 <TabsList className={MOBILE_TABS_LIST}>
 {DASHBOARD_SECTIONS.student.map((s) => (
 <TabsTrigger key={s.value} value={s.value} className={MOBILE_TAB_TRIGGER}>
 {s.label}
 </TabsTrigger>
 ))}
 </TabsList>
 <div className={MOBILE_TABS_FADE} />
 </div>

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
 /* BD weekend: Friday is the universal off day, and Saturday is part
 of the official weekend too (classes just rarely land on it — the
 empty state only shows when nothing is scheduled). */
 title={WEEKEND_DAYS.includes(today) ? "Weekend — no classes today" : "No classes today"}
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
 className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] shadow"
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
 title={
 (data?.schedules ?? []).length > 0
 ? "Timetable is being prepared — check back soon."
 : "No routine published yet"
 }
 hint={
 (data?.schedules ?? []).length > 0
 ? "Classes are scheduled — the weekly grid appears once time slots are set."
 : "Your weekly class routine will appear here once scheduled."
 }
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
 <div className="max-h-[60vh] divide-y overflow-y-auto pr-1 sm:max-h-96">
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
 className="mt-1 text-xs font-semibold text-green hover:underline "
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
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
 className="shrink-0 border-border text-green "
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
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
 letterTone(r.grade)
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

 {/* ===== Performance (Day 44 + attendance) ===== */}
 <TabsContent value="performance" className="mt-4">
 {/* Attendance — visible even before any results are published */}
 {data?.attendance?.hasData ? (
 <div className="mb-4 space-y-4">
 {/* ONE sheet per subject — every class day in order, like the teacher's register */}
 <StudentAttendanceSheetCard />
 <div className="flex flex-wrap items-center justify-around gap-4 rounded-xl border bg-card p-5 shadow-sm">
 <MetricRing
 pct={data.attendance.rate}
 label={`Attendance · ${data.attendance.attended}/${data.attendance.total} classes`}
 color={CHART_COLORS.green}
 delay={0}
 />
 <MetricRing
 pct={data.attendance.total > 0
 ? Math.round(((data.attendance.total - data.attendance.absent) / data.attendance.total) * 100)
 : 0}
 label={`Classes missed · ${data.attendance.absent}`}
 color={data.attendance.absent === 0 ? CHART_COLORS.green : CHART_COLORS.rust}
 delay={0.1}
 />
 </div>
 <SectionCard title="Course-wise attendance" icon={CalendarCheck}>
 <div className="space-y-2.5">
 {data.attendance.perCourse.map((c, i) => (
 <motion.div
 key={c.courseId}
 initial={{ opacity: 0, x: -12 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: i * 0.06 }}
 className="rounded-xl border p-3"
 >
 <div className="flex items-center justify-between gap-3">
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold">{c.courseCode}</p>
 <p className="text-[11px] text-muted-foreground">
 {c.attended}/{c.total} classes attended
 </p>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:w-28">
 <div
 className={cn(
 "h-full rounded-full bg-gradient-to-r",
 c.pct >= 75
 ? "from-[#2D4F35] to-[#4A7C58]"
 : "from-[#C8442E] to-[#E55A3F]"
 )}
 style={{ width: `${Math.min(100, c.pct)}%` }}
 />
 </div>
 <Badge
 variant="outline"
 className={cn(
 "w-12 justify-center text-xs font-bold",
 c.pct >= 75
 ? "text-green"
 : "border-[#C8442E]/40 text-[#C8442E]"
 )}
 >
 {c.pct}%
 </Badge>
 </div>
 </div>
 </motion.div>
 ))}
 </div>
 <p className="text-[11px] text-muted-foreground">
 Present and late both count as attended. Excused absences are excluded.
 75% attendance is usually required to sit for exams.
 </p>
 </SectionCard>
 </div>
 ) : null}

 {!data?.analytics?.hasData ? (
 <EmptyState
 icon={TrendingUp}
 title="No results to analyse yet"
 hint="Once your teachers publish CT, midterm or final results, your performance dashboard will light up here."
 />
 ) : (
 <div className="space-y-4">
 {/* GPA rings */}
 <div className="flex flex-wrap items-center justify-around gap-4 rounded-xl border bg-card p-5 shadow-sm">
 <MetricRing
 pct={data.analytics.overallAvgPct}
 label={`Overall · Grade ${data.analytics.overallGrade}`}
 color={CHART_COLORS.green}
 delay={0}
 />
 <MetricRing
 pct={(data.analytics.estimatedGPA / 4) * 100}
 label={`GPA ${data.analytics.estimatedGPA.toFixed(2)} / 4.00`}
 color={CHART_COLORS.gold}
 delay={0.1}
 />
 <MetricRing
 pct={data.analytics.coursePerformance.length > 0
 ? (data.analytics.coursePerformance.filter((c) => c.avgPct >= 40).length /
 data.analytics.coursePerformance.length) * 100
 : 0}
 label="Courses passed"
 color={CHART_COLORS.navy}
 delay={0.2}
 />
 </div>

 <ChartCard title="Average score by exam type" icon={TrendingUp} height={240}>
 <PerfLineChart data={data.analytics.examTrend} hint="Trend appears as more exam results arrive." />
 </ChartCard>

 <SectionCard title="Course-wise performance" icon={BookOpen}>
 <div className="space-y-2.5">
 {data.analytics.coursePerformance.map((c, i) => (
 <motion.div
 key={c.courseId}
 initial={{ opacity: 0, x: -12 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ delay: i * 0.06 }}
 className="rounded-xl border p-3"
 >
 <div className="flex items-center justify-between gap-3">
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold">
 {c.courseCode} · {c.courseName}
 </p>
 <p className="text-[11px] text-muted-foreground">
 {c.examCount} exam{c.examCount === 1 ? "" : "s"} · {c.creditHours} credits
 </p>
 </div>
 <div className="flex shrink-0 items-center gap-2">
 <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:w-28">
 <div
 className="h-full rounded-full bg-gradient-to-r from-[#2D4F35] to-[#4A7C58]"
 style={{ width: `${Math.min(100, c.avgPct)}%` }}
 />
 </div>
 <Badge
 variant="outline"
 className="font-display w-9 justify-center text-sm font-bold"
 >
 {c.grade}
 </Badge>
 </div>
 </div>
 </motion.div>
 ))}
 </div>
 </SectionCard>

 {data.analytics.upcomingDeadlines.length > 0 && (
 <SectionCard title="Upcoming deadlines" icon={CalendarClock}>
 <div className="relative space-y-3 pl-5">
 <span
 aria-hidden
 className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px bg-border"
 />
 {data.analytics.upcomingDeadlines.map((a) => (
 <div key={a.id} className="relative">
 <span
 aria-hidden
 className="absolute -left-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#2D4F35] bg-gold"
 />
 <div className="rounded-xl border p-3">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <p className="min-w-0 truncate text-sm font-semibold">
 {a.courseCode ? `${a.courseCode} · ` : ""}
 {a.title}
 </p>
 <Badge className="bg-gold/25 text-[#7A6500] hover:bg-gold/35 dark:text-gold">
 {a.dueDate
 ? parseWhen(a.dueDate).toLocaleDateString("en-US", {
 weekday: "short",
 month: "short",
 day: "numeric",
 })
 : "No due date"}
 </Badge>
 </div>
 {a.teacherName && (
 <p className="mt-1 text-[11px] text-muted-foreground">{a.teacherName}</p>
 )}
 </div>
 </div>
 ))}
 </div>
 </SectionCard>
 )}

 <p className="px-1 text-center text-[11px] text-muted-foreground">
 GPA is estimated on the Bangladesh UGC 4.00 scale from your entered marks —
 official transcripts may use different weightage.
 </p>
 </div>
 )}
 </TabsContent>

 {/* ===== Alerts ===== */}
 <TabsContent value="alerts" className="mt-4">
 <motion.div {...tabMotion} className="space-y-6">
 {/* Notifications — the list behind the "Unread Alerts" badge */}
 <SectionCard
 title="Notifications"
 icon={Bell}
 action={
 <Button
 variant="ghost"
 size="sm"
 className="h-8 rounded-full px-3 text-xs text-green hover:text-green"
 onClick={() => void markAllNotifsRead()}
 disabled={markingAll || (notifUnread ?? 0) === 0}
 >
 Mark all read
 </Button>
 }
 >
 {notifsLoading ? (
 <p className="py-6 text-center text-sm text-muted-foreground">
 Loading notifications…
 </p>
 ) : notifs.length === 0 && notifsErr ? (
 <div className="flex flex-col items-center gap-3 py-6 text-center">
 <p className="text-sm text-muted-foreground">{notifsErr}</p>
 <Button
 variant="outline"
 size="sm"
 onClick={() => void loadNotifications()}
 >
 <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Retry
 </Button>
 </div>
 ) : notifs.length === 0 ? (
 <EmptyState
 icon={Bell}
 title="No notifications yet"
 hint="Class changes, results and announcements will ping you here."
 />
 ) : (
 <div className="max-h-[60vh] divide-y overflow-y-auto pr-1 sm:max-h-96">
 {notifs.map((n) => {
 const { Icon, cls } = typeIcon(n.type);
 return (
 <button
 key={n.id}
 type="button"
 onClick={() => {
 void markNotifRead(n.id);
 // Deep-link through the Next router — SPA navigation instead of the
 // full page reload window.location.assign caused (same helper the
 // header bell uses).
 followNotificationLink(n.link, router);
 }}
 title={n.link ? "Open related page" : n.isRead ? undefined : "Mark as read"}
 className={cn(
 "flex w-full items-start gap-3 py-3 text-left transition-colors first:pt-0 last:pb-0 hover:bg-accent/40",
 !n.isRead && "bg-gold/5"
 )}
 >
 <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background shadow-sm">
 <Icon className={cn("h-4 w-4", cls)} aria-hidden />
 </span>
 <span className="min-w-0 flex-1">
 <span className="flex items-center gap-1.5">
 {!n.isRead && (
 <span
 className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
 aria-hidden
 />
 )}
 <span
 className={cn(
 "truncate text-sm",
 n.isRead
 ? "font-medium text-muted-foreground"
 : "font-semibold"
 )}
 >
 {n.title}
 </span>
 </span>
 <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
 {n.body}
 </span>
 <span className="mt-1 block text-[11px] text-muted-foreground/70">
 {timeAgo(n.createdAt)}
 </span>
 </span>
 {!n.isRead && <span className="sr-only">Unread</span>}
 </button>
 );
 })}
 </div>
 )}
 {notifsHasMore && !notifsLoading && (
 <div className="mt-3 flex justify-center">
 <Button
 variant="outline"
 size="sm"
 onClick={() => void loadNotifications(notifsPageRef.current + 1)}
 disabled={loadingOlder}
 >
 <RefreshCw
 className={cn("mr-2 h-4 w-4", loadingOlder && "animate-spin")}
 aria-hidden
 />
 {loadingOlder ? "Loading…" : "Load older"}
 </Button>
 </div>
 )}
 </SectionCard>

 <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
 <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 sm:max-h-96">
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
 <div className="max-h-[60vh] divide-y overflow-y-auto pr-1 sm:max-h-96">
 {sortedCalendar.map((e) => {
 const d = parseWhen(e.date);
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

 {/* ===== Documents ===== */}
 <TabsContent value="documents" className="mt-4">
 <motion.div {...tabMotion}>
 <StudentDocumentsTab />
 </motion.div>
 </TabsContent>

 {/* ===== Profile ===== */}
 <TabsContent value="profile" className="mt-4">
 <motion.div {...tabMotion}>
 <StudentProfileTab
 profile={{
 fullName,
 rollNumber,
 studentIdNumber,
 semester,
 section,
 departmentName: profile?.departmentName ?? null,
 universityName: profile?.universityName ?? null,
 programName: profile?.programName ?? null,
 phone: profile?.phone ?? null,
 guardianPhone: profile?.guardianPhone ?? null,
 memberSince: profile?.memberSince ?? new Date().toISOString(),
 accountActive: profile?.accountActive ?? true,
 }}
 teachers={data?.teachers ?? []}
 courses={data?.courses ?? []}
 />
 </motion.div>
 </TabsContent>
 </Tabs>
 </div>
 );
}
