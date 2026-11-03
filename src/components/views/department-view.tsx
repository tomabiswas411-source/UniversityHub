"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
 AlertTriangle,
 ArrowLeft,
 ArrowRight,
 BookOpen,
 Building2,
 CalendarClock,
 CalendarDays,
 CalendarX2,
 ClipboardList,
 Clock,
 Coffee,
 DoorOpen,
 FlaskConical,
 GraduationCap,
 Info,
 Layers,
 LayoutGrid,
 List,
 Loader2,
 Mail,
 MapPin,
 PartyPopper,
 PenLine,
 Phone,
 Pin,
 RefreshCcw,
 RefreshCw,
 Sparkles,
 Users,
 type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
 DAYS_OF_WEEK,
 DAY_LABELS,
 type CourseDTO,
 type DayOfWeek,
 type DepartmentDTO,
 type NoticeDTO,
 type ProgramDTO,
 type ScheduleChangeDTO,
 type ScheduleDTO,
 type TimeSlotDTO,
 type UserDTO,
} from "@/types";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export type AppViewName =
 | "home"
 | "department"
 | "login"
 | "pricing"
 | "dashboard";
export type NavigateFn = (
 v: AppViewName,
 params?: Record<string, string>
) => void;

type ViewMode = "grid" | "cards" | "list";

interface DepartmentResponse {
 department: DepartmentDTO & {
 universityName: string;
 universitySlug: string;
 };
 programs: ProgramDTO[];
 selectedProgramId: string | null;
 semester: number;
 teachers: UserDTO[];
 notices: NoticeDTO[];
 timeSlots: TimeSlotDTO[];
 schedules: ScheduleDTO[];
 changes: ScheduleChangeDTO[];
 courses: CourseDTO[];
}

interface Selection {
 deptId: string | null;
 programId: string | null;
 semester: number | null;
}

// ------------------------------------------------------------------
// Constants & helpers
// ------------------------------------------------------------------
/** JS getDay() → Bangladesh class week (Saturday–Thursday, Friday = weekend) */
const JS_DAY_TO_DOW: Record<number, DayOfWeek | "friday"> = {
 6: "saturday",
 0: "sunday",
 1: "monday",
 2: "tuesday",
 3: "wednesday",
 4: "thursday",
 5: "friday",
};

const TODAY_LABELS: Record<DayOfWeek | "friday", string> = {
 ...DAY_LABELS,
 friday: "Friday",
};

interface CourseSkin {
 wrap: string;
 text: string;
 sub: string;
 dot: string;
}

const COURSE_SKINS: CourseSkin[] = [
 {
 wrap: "bg-green/[0.07] border-green/25",
 text: "text-heading",
 sub: "text-green/80",
 dot: "bg-gold/100",
 },
 {
 wrap: "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800/60",
 text: "text-amber-800 dark:text-amber-200",
 sub: "text-amber-700/80 dark:text-amber-300/80",
 dot: "bg-amber-500",
 },
 {
 wrap: "bg-gold/20 border-gold/60",
 text: "text-ink dark:text-gold",
 sub: "text-ink/70 dark:text-gold/80",
 dot: "bg-gold-deep",
 },
 {
 wrap: "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800/60",
 text: "text-emerald-800 dark:text-emerald-200",
 sub: "text-emerald-700/80 dark:text-emerald-300/80",
 dot: "bg-emerald-500",
 },
 {
 wrap: "bg-navy/[0.07] border-navy/25",
 text: "text-navy dark:text-[#9DB4D6]",
 sub: "text-navy/80 dark:text-[#9DB4D6]/80",
 dot: "bg-navy",
 },
 {
 wrap: "bg-rose-50/80 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800/60",
 text: "text-rose-800 dark:text-rose-200",
 sub: "text-rose-700/80 dark:text-rose-300/80",
 dot: "bg-rose-500",
 },
];

function courseSkin(code: string): CourseSkin {
 let h = 0;
 for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
 return COURSE_SKINS[h % COURSE_SKINS.length];
}

const CHANGE_STYLES: Record<ScheduleChangeDTO["changeType"], string> = {
 cancelled:
 "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/70",
 rescheduled:
 "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70",
 time_changed:
 "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70",
 room_changed:
 "bg-navy/10 text-navy dark:text-[#9DB4D6] border-navy/25",
 extra_class:
 "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/70",
};

function changeMeta(change: ScheduleChangeDTO): {
 label: string;
 icon: LucideIcon;
 cls: string;
} {
 switch (change.changeType) {
 case "cancelled":
 return { label: "Cancelled", icon: CalendarX2, cls: CHANGE_STYLES.cancelled };
 case "rescheduled":
 return {
 label: "Rescheduled",
 icon: CalendarClock,
 cls: CHANGE_STYLES.rescheduled,
 };
 case "time_changed":
 return { label: "Time changed", icon: Clock, cls: CHANGE_STYLES.time_changed };
 case "room_changed":
 return {
 label: `Room: ${change.newRoomNumber ?? "TBA"}`,
 icon: DoorOpen,
 cls: CHANGE_STYLES.room_changed,
 };
 case "extra_class":
 return { label: "Extra class", icon: Sparkles, cls: CHANGE_STYLES.extra_class };
 }
}

function dayLabel(day: string | null): string {
 if (!day) return "TBA";
 return DAY_LABELS[day as DayOfWeek] ?? day;
}

function describeChange(c: ScheduleChangeDTO): string {
 const range =
 c.newStartTime && c.newEndTime
 ? `${c.newStartTime}–${c.newEndTime}`
 : c.newStartTime ?? "";
 switch (c.changeType) {
 case "cancelled":
 return c.reason ? `Class cancelled — ${c.reason}` : "Class cancelled";
 case "rescheduled":
 return `Moved to ${dayLabel(c.newDay)} ${range}`.trim();
 case "time_changed":
 return `New time ${range}`.trim();
 case "room_changed":
 return `Room changed to ${c.newRoomNumber ?? "TBA"}`;
 case "extra_class":
 return `Extra class on ${dayLabel(c.newDay)} ${range}`.trim();
 }
}

function fmtDate(d: string): string {
 const dt = new Date(`${d}T00:00:00`);
 if (Number.isNaN(dt.getTime())) return d;
 return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateTime(iso: string): string {
 const dt = new Date(iso);
 if (Number.isNaN(dt.getTime())) return iso;
 return dt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function timeAgo(iso: string): string {
 const t = new Date(iso).getTime();
 if (Number.isNaN(t)) return "";
 const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
 if (mins < 1) return "Just now";
 if (mins < 60) return `${mins} min ago`;
 const hours = Math.floor(mins / 60);
 if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
 const days = Math.floor(hours / 24);
 if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
 const months = Math.floor(days / 30);
 return `${months} month${months > 1 ? "s" : ""} ago`;
}

function teacherInitials(name: string): string {
 const words = name
 .trim()
 .split(/\s+/)
 .filter((w) => w.length > 1 && !w.includes("."));
 const pick = (words.length > 0 ? words : name.trim().split(/\s+/)).slice(0, 2);
 const letters = pick.map((w) => w[0]).join("");
 return letters.toUpperCase() || "T";
}

const NOTICE_CATEGORIES: Record<
 NoticeDTO["category"],
 { label: string; icon: LucideIcon; chip: string }
> = {
 exam: {
 label: "Exam",
 icon: PenLine,
 chip: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
 },
 event: {
 label: "Event",
 icon: PartyPopper,
 chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
 },
 academic: {
 label: "Academic",
 icon: BookOpen,
 chip: "bg-green/10 text-green",
 },
 general: {
 label: "General",
 icon: Info,
 chip: "bg-slate-100 text-slate-700 dark:bg-slate-800/70 dark:text-slate-300",
 },
 schedule_change: {
 label: "Schedule",
 icon: RefreshCw,
 chip: "bg-navy/10 text-navy dark:text-[#9DB4D6]",
 },
 assignment: {
 label: "Assignment",
 icon: ClipboardList,
 chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 },
};

const VIEW_MODES: { key: ViewMode; icon: LucideIcon; label: string }[] = [
 { key: "grid", icon: LayoutGrid, label: "Weekly grid" },
 { key: "cards", icon: Layers, label: "Day cards" },
 { key: "list", icon: List, label: "Compact list" },
];

// ------------------------------------------------------------------
// Motion variants
// ------------------------------------------------------------------
const stagger: Variants = {
 hidden: {},
 show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const riseIn: Variants = {
 hidden: { opacity: 0, y: 20 },
 show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ------------------------------------------------------------------
// Small building blocks
// ------------------------------------------------------------------
function ChangePill({ change }: { change: ScheduleChangeDTO }) {
 const meta = changeMeta(change);
 return (
 <Tooltip>
 <TooltipTrigger asChild>
 <span
 className={cn(
 "mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
 meta.cls
 )}
 >
 <meta.icon className="h-3 w-3 shrink-0" />
 <span className="truncate">{meta.label}</span>
 </span>
 </TooltipTrigger>
 <TooltipContent className="max-w-[260px]">
 <p className="text-xs font-medium">{describeChange(change)}</p>
 <p className="text-[10px] opacity-75">Effective from {fmtDate(change.effectiveDate)}</p>
 </TooltipContent>
 </Tooltip>
 );
}

function EmptyState({
 icon: Icon,
 title,
 hint,
 action,
}: {
 icon: LucideIcon;
 title: string;
 hint?: string;
 action?: React.ReactNode;
}) {
 return (
 <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center ">
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35]/12 to-[#4A7C58]/12 dark:from-[#4A7C58]/22 dark:to-[#4A7C58]/22">
 <Icon className="h-7 w-7 text-green" />
 </div>
 <p className="mt-3 font-semibold">{title}</p>
 {hint ? (
 <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
 ) : null}
 {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
 </div>
 );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
 return (
 <motion.div
 initial={{ opacity: 0, y: 16 }}
 animate={{ opacity: 1, y: 0 }}
 className="rounded-2xl border border-red-200/70 bg-red-50/60 p-8 text-center dark:border-red-900/50 dark:bg-red-950/20"
 >
 <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/60">
 <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
 </div>
 <p className="mt-3 font-semibold text-red-900 dark:text-red-200">
 Couldn&apos;t load this department
 </p>
 <p className="mx-auto mt-1 max-w-sm text-sm text-red-700/80 dark:text-red-300/80">
 {message}
 </p>
 <Button
 onClick={onRetry}
 className="mt-5 h-11 rounded-xl bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] text-white shadow-lg shadow-[#2D4F35]/25 hover:from-[#233D2A] hover:to-[#3A6B47]"
 >
 <RefreshCcw className="h-4 w-4" /> Try again
 </Button>
 </motion.div>
 );
}

function DepartmentSkeleton() {
 return (
 <div className="space-y-4 sm:space-y-6">
 <Skeleton className="h-9 w-40 rounded-lg" />
 <Card className="gap-0 rounded-2xl py-0">
 <CardContent className="space-y-4 p-4 sm:p-6">
 <div className="flex items-start gap-4">
 <Skeleton className="h-14 w-14 rounded-2xl" />
 <div className="flex-1 space-y-2">
 <Skeleton className="h-6 w-2/3" />
 <Skeleton className="h-4 w-1/3" />
 </div>
 </div>
 <div className="flex flex-wrap gap-2">
 {Array.from({ length: 4 }).map((_, i) => (
 <Skeleton key={i} className="h-7 w-24 rounded-full" />
 ))}
 </div>
 </CardContent>
 </Card>
 <Skeleton className="h-12 rounded-xl" />
 <Skeleton className="h-16 rounded-2xl" />
 <Skeleton className="h-[420px] rounded-2xl" />
 </div>
 );
}

// ------------------------------------------------------------------
// Routine renderers
// ------------------------------------------------------------------
function GridClassCard({
 sched,
 change,
}: {
 sched: ScheduleDTO;
 change?: ScheduleChangeDTO;
}) {
 const skin = courseSkin(sched.courseCode);
 const cancelled = change?.changeType === "cancelled";
 return (
 <motion.div
 whileHover={{ scale: 1.02 }}
 className={cn(
 "mb-1.5 rounded-lg border p-2 shadow-sm transition-shadow last:mb-0 hover:shadow-md",
 skin.wrap,
 cancelled && "opacity-60"
 )}
 >
 <div className="flex items-center gap-1.5">
 <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", skin.dot)} />
 <span
 className={cn(
 "text-[11px] font-extrabold tracking-wide",
 skin.text,
 cancelled && "line-through"
 )}
 >
 {sched.courseCode}
 </span>
 {sched.classType === "lab" ? (
 <FlaskConical className={cn("ml-auto h-3 w-3 shrink-0", skin.text)} />
 ) : null}
 </div>
 <p
 className="mt-1 truncate text-xs font-medium leading-snug"
 title={sched.courseName}
 >
 {sched.courseName}
 </p>
 <p className={cn("mt-0.5 truncate text-[10px]", skin.sub)}>
 Room {sched.roomNumber} · {sched.teacherName}
 </p>
 {change ? <ChangePill change={change} /> : null}
 </motion.div>
 );
}

function DayClassCard({
 sched,
 change,
}: {
 sched: ScheduleDTO;
 change?: ScheduleChangeDTO;
}) {
 const skin = courseSkin(sched.courseCode);
 const cancelled = change?.changeType === "cancelled";
 return (
 <motion.div
 whileHover={{ y: -2 }}
 className={cn(
 "rounded-xl border p-3.5 shadow-sm transition-shadow hover:shadow-md",
 skin.wrap,
 cancelled && "opacity-60"
 )}
 >
 <div className="flex items-center justify-between gap-2">
 <div className="flex min-w-0 items-center gap-1.5">
 <span className={cn("h-2 w-2 shrink-0 rounded-full", skin.dot)} />
 <span
 className={cn(
 "text-xs font-extrabold tracking-wide",
 skin.text,
 cancelled && "line-through"
 )}
 >
 {sched.courseCode}
 </span>
 {sched.classType === "lab" ? (
 <FlaskConical className={cn("h-3.5 w-3.5 shrink-0", skin.text)} />
 ) : (
 <BookOpen className={cn("h-3.5 w-3.5 shrink-0", skin.text)} />
 )}
 </div>
 <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
 {sched.startTime}–{sched.endTime}
 </span>
 </div>
 <p className="mt-1.5 truncate text-sm font-semibold" title={sched.courseName}>
 {sched.courseName}
 </p>
 <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
 <span className="inline-flex min-w-0 items-center gap-1">
 <MapPin className="h-3.5 w-3.5 shrink-0" />
 <span className="truncate">Room {sched.roomNumber}</span>
 </span>
 <span className="inline-flex min-w-0 items-center gap-1">
 <Users className="h-3.5 w-3.5 shrink-0" />
 <span className="truncate">{sched.teacherName}</span>
 </span>
 </div>
 {change ? <ChangePill change={change} /> : null}
 </motion.div>
 );
}

function ListRow({ sched, change }: { sched: ScheduleDTO; change?: ScheduleChangeDTO }) {
 const skin = courseSkin(sched.courseCode);
 const cancelled = change?.changeType === "cancelled";
 return (
 <div className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
 <span className="w-[92px] shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
 {sched.startTime}–{sched.endTime}
 </span>
 <span
 className={cn(
 "shrink-0 text-xs font-extrabold tracking-wide",
 skin.text,
 cancelled && "line-through"
 )}
 >
 {sched.courseCode}
 </span>
 {sched.classType === "lab" ? (
 <FlaskConical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
 ) : null}
 <span className="min-w-[140px] flex-1 truncate font-medium" title={sched.courseName}>
 {sched.courseName}
 </span>
 <span className="shrink-0 text-xs text-muted-foreground">
 Room {change?.changeType === "room_changed" && change.newRoomNumber ? change.newRoomNumber : sched.roomNumber}
 </span>
 <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:block">
 {sched.teacherName}
 </span>
 {change ? <ChangePill change={change} /> : null}
 </div>
 );
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------
export function DepartmentView({
 departmentId,
 navigate,
}: {
 departmentId: string | null;
 navigate: NavigateFn;
}) {
 const [data, setData] = useState<DepartmentResponse | null>(null);
 const [dataDeptId, setDataDeptId] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [retryTick, setRetryTick] = useState(0);
 const [doneKey, setDoneKey] = useState<string | null>(null);

 const [selState, setSelState] = useState<Selection>({
 deptId: null,
 programId: null,
 semester: null,
 });
 const [viewMode, setViewMode] = useState<ViewMode>("grid");
 const [openNotice, setOpenNotice] = useState<NoticeDTO | null>(null);

 const selection: Selection =
 selState.deptId === departmentId
 ? selState
 : { deptId: departmentId, programId: null, semester: null };

 // A fetch is "pending" until the key it started with is marked done —
 // loading is derived, so effects never call setState synchronously.
 const fetchKey = `${departmentId ?? ""}|${selection.programId ?? ""}|${
 selection.semester ?? ""
 }|${retryTick}`;
 const loading = doneKey !== fetchKey;
 const current = data != null && dataDeptId === departmentId ? data : null;

 // ---- Fetch (refetches on program/semester change) ----
 useEffect(() => {
 if (!departmentId) return;
 const key = `${departmentId}|${selection.programId ?? ""}|${
 selection.semester ?? ""
 }|${retryTick}`;
 let cancelled = false;
 const params = new URLSearchParams({ id: departmentId });
 if (selection.programId) params.set("programId", selection.programId);
 if (selection.semester != null)
 params.set("semester", String(selection.semester));
 apiGet<DepartmentResponse>(`/api/department?${params.toString()}`)
 .then((d) => {
 if (cancelled) return;
 setData(d);
 setDataDeptId(departmentId);
 setDoneKey(key);
 setError(null);
 })
 .catch((e: unknown) => {
 if (cancelled) return;
 setError(
 e instanceof Error ? e.message : "Failed to load department data"
 );
 setDoneKey(key);
 });
 return () => {
 cancelled = true;
 };
 }, [departmentId, selState, retryTick]);

 const department = current?.department ?? null;
 const programs = current?.programs ?? [];
 const teachers = current?.teachers ?? [];
 const notices = current?.notices ?? [];
 const schedules = current?.schedules ?? [];
 const changes = current?.changes ?? [];
 const courses = current?.courses ?? [];

 const activeProgramId =
 selection.programId ?? current?.selectedProgramId ?? null;
 const activeSemester = selection.semester ?? current?.semester ?? 1;
 const activeProgram =
 programs.find((p) => p.id === activeProgramId) ?? programs[0] ?? null;
 const semesterCount = activeProgram?.semesterCount ?? 8;

 const changeProgram = (v: string) =>
 setSelState({ deptId: departmentId, programId: v, semester: 1 });
 const changeSemester = (v: string) =>
 setSelState({
 deptId: departmentId,
 programId: selection.programId ?? activeProgramId,
 semester: Number(v),
 });

 // ---- Latest change per schedule ----
 const changeByScheduleId = useMemo(() => {
 const m = new Map<string, ScheduleChangeDTO>();
 for (const c of changes) {
 if (!m.has(c.scheduleId)) m.set(c.scheduleId, c);
 }
 return m;
 }, [changes]);

 // ---- Time slots (with fallback derived from schedules) ----
 const displaySlots = useMemo<TimeSlotDTO[]>(() => {
 const slots = current?.timeSlots ?? [];
 if (slots.length > 0) return slots;
 const seen = new Map<string, TimeSlotDTO>();
 for (const s of schedules) {
 const key = `${s.startTime}-${s.endTime}`;
 if (!seen.has(key)) {
 seen.set(key, {
 id: `virtual-${key}`,
 departmentId: s.departmentId,
 label: "",
 startTime: s.startTime,
 endTime: s.endTime,
 slotOrder: 0,
 isBreak: false,
 isActive: true,
 });
 }
 }
 return Array.from(seen.values()).sort((a, b) =>
 a.startTime.localeCompare(b.startTime)
 );
 }, [current?.timeSlots, schedules]);

 // ---- scheduleId/day → cell map ----
 const cellMap = useMemo(() => {
 const map = new Map<string, ScheduleDTO[]>();
 const slotIdSet = new Set(displaySlots.map((sl) => sl.id));
 const slotById = new Map(displaySlots.map((sl) => [sl.id, sl] as const));
 const slotByStart = new Map<string, TimeSlotDTO>();
 for (const sl of displaySlots) {
 if (!slotByStart.has(sl.startTime)) slotByStart.set(sl.startTime, sl);
 }
 for (const s of schedules) {
 const slot = slotIdSet.has(s.timeSlotId)
 ? slotById.get(s.timeSlotId)
 : slotByStart.get(s.startTime);
 if (!slot) continue;
 const key = `${slot.id}|${s.dayOfWeek}`;
 const arr = map.get(key);
 if (arr) arr.push(s);
 else map.set(key, [s]);
 }
 return map;
 }, [displaySlots, schedules]);

 // ---- schedules grouped by day ----
 const byDay = useMemo(() => {
 const grouped: Record<DayOfWeek, ScheduleDTO[]> = {
 saturday: [],
 sunday: [],
 monday: [],
 tuesday: [],
 wednesday: [],
 thursday: [],
 };
 for (const s of schedules) {
 grouped[s.dayOfWeek]?.push(s);
 }
 for (const d of DAYS_OF_WEEK) {
 grouped[d].sort((a, b) => a.startTime.localeCompare(b.startTime));
 }
 return grouped;
 }, [schedules]);

 // ---- today ----
 const todayDow = JS_DAY_TO_DOW[new Date().getDay()] ?? "friday";
 const todaySchedules =
 todayDow !== "friday" ? byDay[todayDow] ?? [] : [];
 const todayCancelled = todaySchedules.filter(
 (s) => changeByScheduleId.get(s.id)?.changeType === "cancelled"
 ).length;
 const todayActive = todaySchedules.length - todayCancelled;

 // =========================== NO DEPARTMENT ===========================
 if (!departmentId) {
 return (
 <div className="py-10">
 <EmptyState
 icon={Building2}
 title="No department selected"
 hint="Go back and pick a university, then choose one of its departments."
 action={
 <Button
 onClick={() => navigate("home")}
 className="h-11 rounded-xl bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] px-6 text-white shadow-lg shadow-[#2D4F35]/25 hover:from-[#233D2A] hover:to-[#3A6B47]"
 >
 <ArrowLeft className="h-4 w-4" /> All Universities
 </Button>
 }
 />
 </div>
 );
 }

 // ========================= LOADING / ERROR ==========================
 if (loading && !current) return <DepartmentSkeleton />;
 if (error && !current && !loading)
 return (
 <div className="py-10">
 <ErrorState
 message={error}
 onRetry={() => setRetryTick((t) => t + 1)}
 />
 </div>
 );
 if (!current || !department) return null;

 const refreshing = loading && !!current;
 const hasRoutine = schedules.length > 0;

 const headerChips: { icon: LucideIcon; label: string; value: number }[] = [
 { icon: Users, label: "Teachers", value: teachers.length },
 ...(department._count?.students != null
 ? [
 {
 icon: GraduationCap,
 label: "Students",
 value: department._count.students,
 },
 ]
 : []),
 { icon: BookOpen, label: "Courses", value: courses.length },
 { icon: CalendarDays, label: "Weekly Classes", value: schedules.length },
 ];

 return (
 <motion.div
 variants={stagger}
 initial="hidden"
 animate="show"
 className="space-y-4 sm:space-y-6"
 >
 {/* ------------------------------ HEADER ------------------------------ */}
 <motion.div variants={riseIn}>
 <Button
 variant="ghost"
 onClick={() => navigate("home")}
 className="-ml-2 mb-3 h-10 rounded-lg text-muted-foreground hover:text-green "
 >
 <ArrowLeft className="h-4 w-4" /> All Universities
 </Button>

 <Card className="gap-0 overflow-hidden rounded-2xl border-border py-0 shadow-md shadow-[#2D4F35]/5 ">
 <CardContent className="p-4 sm:p-6">
 <div className="flex items-start gap-4">
 <div className="relative shrink-0">
 <div className="absolute inset-0 rounded-2xl bg-gold/40 blur-md" />
 <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-lg font-extrabold text-white shadow-lg shadow-[#2D4F35]/30">
 {department.shortName.slice(0, 4).toUpperCase()}
 </div>
 </div>
 <div className="min-w-0 flex-1">
 <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">
 {department.name}
 </h1>
 <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
 <span className="inline-flex items-center gap-1">
 <Building2 className="h-3.5 w-3.5 text-green" />
 <span className="truncate">{department.universityName}</span>
 </span>
 {department.building ? (
 <span className="inline-flex items-center gap-1">
 <MapPin className="h-3.5 w-3.5 text-green" />
 <span className="truncate">{department.building}</span>
 </span>
 ) : null}
 </div>
 {department.description ? (
 <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
 {department.description}
 </p>
 ) : null}
 </div>
 </div>

 <div className="mt-4 flex flex-wrap gap-2">
 {headerChips.map((chip) => (
 <span
 key={chip.label}
 className="inline-flex items-center gap-1.5 rounded-full border border-border bg-gold/15 px-3 py-1.5 text-xs font-semibold text-heading "
 >
 <chip.icon className="h-3.5 w-3.5" />
 {chip.value} {chip.label}
 </span>
 ))}
 </div>
 </CardContent>
 </Card>
 </motion.div>

 {/* ------------------------------ CONTROLS ------------------------------ */}
 <motion.div
 variants={riseIn}
 className="sticky top-16 z-30 -mx-3 border-b bg-background/85 px-3 py-2.5 backdrop-blur-md sm:static sm:mx-0 sm:rounded-2xl sm:border sm:border-border sm:px-4 sm:py-3 sm:backdrop-blur-0 "
 >
 <div className="flex flex-wrap items-center gap-2">
 {programs.length > 0 ? (
 <>
 <Select
 value={activeProgramId ?? ""}
 onValueChange={changeProgram}
 >
 <SelectTrigger className="h-10 min-h-[44px] w-[150px] rounded-xl bg-card sm:w-[230px]">
 <SelectValue placeholder="Program" />
 </SelectTrigger>
 <SelectContent>
 {programs.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.shortName} — {p.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Select
 value={String(activeSemester)}
 onValueChange={changeSemester}
 >
 <SelectTrigger className="h-10 min-h-[44px] w-[124px] rounded-xl bg-card">
 <SelectValue placeholder="Semester" />
 </SelectTrigger>
 <SelectContent>
 {Array.from({ length: semesterCount }).map((_, i) => (
 <SelectItem key={i + 1} value={String(i + 1)}>
 Semester {i + 1}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </>
 ) : (
 <span className="inline-flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
 <Info className="h-4 w-4" /> No programs configured yet
 </span>
 )}

 {refreshing ? (
 <Loader2 className="h-4 w-4 animate-spin text-green" />
 ) : null}

 <div className="ml-auto flex items-center gap-1 rounded-xl border border-border bg-secondary/50 p-1 ">
 {VIEW_MODES.map((m) => (
 <Tooltip key={m.key}>
 <TooltipTrigger asChild>
 <button
 type="button"
 aria-label={m.label}
 aria-pressed={viewMode === m.key}
 onClick={() => setViewMode(m.key)}
 className={cn(
 "flex h-9 w-11 items-center justify-center rounded-lg transition-all sm:h-8 sm:w-9",
 viewMode === m.key
 ? "bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/25"
 : "text-muted-foreground hover:bg-green/10 hover:text-green"
 )}
 >
 <m.icon className="h-4 w-4" />
 </button>
 </TooltipTrigger>
 <TooltipContent className="text-xs">{m.label}</TooltipContent>
 </Tooltip>
 ))}
 </div>
 </div>
 </motion.div>

 {/* ------------------------ REFRESH ERROR ------------------------ */}
 {error ? (
 <motion.div
 variants={riseIn}
 className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
 >
 <AlertTriangle className="h-4 w-4 shrink-0" />
 <span className="min-w-0 flex-1">
 Couldn&apos;t refresh data — showing the last loaded version. ({error})
 </span>
 <Button
 size="sm"
 variant="outline"
 onClick={() => setRetryTick((t) => t + 1)}
 className="h-9 shrink-0"
 >
 <RefreshCcw className="h-3.5 w-3.5" /> Retry
 </Button>
 </motion.div>
 ) : null}

 {/* ------------------------------ TODAY ------------------------------ */}
 <motion.div variants={riseIn}>
 {todayDow === "friday" || todaySchedules.length === 0 ? (
 <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 ">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D4F35]/12 to-[#4A7C58]/12 text-xl dark:from-[#4A7C58]/22 dark:to-[#4A7C58]/22">
 🎉
 </div>
 <div className="min-w-0">
 <p className="text-sm font-bold">
 Today: {TODAY_LABELS[todayDow]}
 {todayDow !== "friday" ? " — No classes today 🎉" : " — Weekend"}
 </p>
 <p className="text-xs text-muted-foreground">
 Enjoy the day off — check the weekly routine below.
 </p>
 </div>
 </div>
 ) : (
 <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] p-4 text-white shadow-lg shadow-[#2D4F35]/25">
 <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
 <CalendarDays className="h-6 w-6" />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-bold sm:text-base">
 Today: {TODAY_LABELS[todayDow]} — {todayActive} class
 {todayActive !== 1 ? "es" : ""}
 {todayCancelled > 0
 ? ` · ${todayCancelled} cancelled`
 : ""}
 </p>
 <p className="mt-0.5 truncate text-xs text-white/80">
 {todaySchedules
 .map((s) => s.courseCode)
 .join(" · ")}
 </p>
 </div>
 <Clock className="hidden h-5 w-5 shrink-0 text-white/70 sm:block" />
 </div>
 )}
 </motion.div>

 {/* --------------------------- ACTIVE CHANGES --------------------------- */}
 {changes.length > 0 ? (
 <motion.div variants={riseIn}>
 <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
 <div className="mb-3 flex items-center gap-2">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60">
 <CalendarClock className="h-4 w-4 text-amber-700 dark:text-amber-300" />
 </div>
 <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
 Active Schedule Changes
 </h3>
 <Badge className="rounded-full bg-amber-200/80 text-[11px] font-bold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
 {changes.length}
 </Badge>
 </div>
 <div className="flex gap-3 overflow-x-auto pb-1">
 {changes.map((c) => {
 const meta = changeMeta(c);
 return (
 <div
 key={c.id}
 className="min-w-[250px] max-w-[290px] shrink-0 rounded-xl border border-amber-200/80 bg-card p-3 shadow-sm dark:border-amber-900/50"
 >
 <div className="flex items-center justify-between gap-2">
 <span
 className={cn(
 "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
 meta.cls
 )}
 >
 <meta.icon className="h-3 w-3" /> {meta.label}
 </span>
 <span className="text-[10px] font-semibold text-muted-foreground">
 {fmtDate(c.effectiveDate)}
 </span>
 </div>
 <p className="mt-2 text-sm font-bold">
 <span className="text-green">
 {c.courseCode}
 </span>{" "}
 · {c.courseName}
 </p>
 <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
 {describeChange(c)}
 {c.reason ? ` — ${c.reason}` : ""}
 </p>
 </div>
 );
 })}
 </div>
 </div>
 </motion.div>
 ) : null}

 {/* ------------------------------ ROUTINE ------------------------------ */}
 <motion.div variants={riseIn}>
 <div
 className={cn(
 "transition-opacity",
 refreshing && "pointer-events-none opacity-50"
 )}
 >
 {programs.length === 0 ? (
 <EmptyState
 icon={BookOpen}
 title="No routine available"
 hint="This department hasn't configured any programs yet."
 />
 ) : !hasRoutine ? (
 <EmptyState
 icon={CalendarDays}
 title="No classes scheduled for this semester yet"
 hint={`Try selecting another ${
 activeProgram?.shortName ?? "program"
 } semester above.`}
 />
 ) : (
 <>
 <div className="mb-3 flex items-baseline justify-between gap-2">
 <h2 className="text-lg font-bold sm:text-xl">Weekly Routine</h2>
 <p className="text-xs text-muted-foreground">
 {activeProgram?.shortName} · Semester {activeSemester} ·{" "}
 {schedules.length} classes/week
 </p>
 </div>

 <AnimatePresence mode="wait" initial={false}>
 <motion.div
 key={viewMode}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -6 }}
 transition={{ duration: 0.18, ease: "easeOut" }}
 >
 {/* ---------- GRID MODE ---------- */}
 {viewMode === "grid" ? (
 <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm ">
 <table className="w-full min-w-[840px] border-collapse text-sm">
 <thead>
 <tr>
 <th className="sticky left-0 z-10 w-28 min-w-28 border-b bg-card px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
 Time
 </th>
 {DAYS_OF_WEEK.map((d) => (
 <th
 key={d}
 className={cn(
 "border-b px-2 py-3 text-center text-xs font-bold",
 d === todayDow
 ? "bg-gold/20 text-[#7A6500] dark:bg-gold/15 dark:text-gold"
 : "text-muted-foreground"
 )}
 >
 {DAY_LABELS[d]}
 {d === todayDow ? (
 <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold/100 align-middle" />
 ) : null}
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {displaySlots.map((slot) =>
 slot.isBreak ? (
 <tr key={slot.id}>
 <td
 colSpan={DAYS_OF_WEEK.length + 1}
 className="border-b bg-secondary/40 px-3 py-2 text-center text-xs font-medium text-muted-foreground"
 >
 <Coffee className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px" />
 {slot.label || "Break"} · {slot.startTime}
 –{slot.endTime}
 </td>
 </tr>
 ) : (
 <tr key={slot.id}>
 <td className="sticky left-0 z-10 border-b bg-card px-3 py-2 align-top">
 <div className="text-xs font-bold">
 {slot.label || "Class"}
 </div>
 <div className="text-[11px] tabular-nums text-muted-foreground">
 {slot.startTime}–{slot.endTime}
 </div>
 </td>
 {DAYS_OF_WEEK.map((day) => {
 const items =
 cellMap.get(`${slot.id}|${day}`) ?? [];
 return (
 <td
 key={day}
 className={cn(
 "border-b border-l px-1.5 py-1.5 align-top",
 day === todayDow &&
 "bg-green/[0.04]"
 )}
 >
 {items.map((sched) => (
 <GridClassCard
 key={sched.id}
 sched={sched}
 change={changeByScheduleId.get(
 sched.id
 )}
 />
 ))}
 </td>
 );
 })}
 </tr>
 )
 )}
 </tbody>
 </table>
 </div>
 ) : null}

 {/* ---------- CARDS MODE ---------- */}
 {viewMode === "cards" ? (
 <div className="space-y-5">
 {DAYS_OF_WEEK.map((day) => {
 const items = byDay[day];
 if (items.length === 0) return null;
 return (
 <div key={day}>
 <div className="mb-2.5 flex items-center gap-2">
 <span
 className={cn(
 "flex h-8 items-center rounded-lg px-3 text-sm font-bold",
 day === todayDow
 ? "bg-gradient-to-r from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/25"
 : "bg-secondary/70"
 )}
 >
 {DAY_LABELS[day]}
 </span>
 <span className="text-xs text-muted-foreground">
 {items.length} class{items.length !== 1 ? "es" : ""}
 </span>
 {day === todayDow ? (
 <Badge className="rounded-full bg-green/10 text-[10px] font-bold text-green ">
 TODAY
 </Badge>
 ) : null}
 </div>
 <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
 {items.map((sched) => (
 <DayClassCard
 key={sched.id}
 sched={sched}
 change={changeByScheduleId.get(sched.id)}
 />
 ))}
 </div>
 </div>
 );
 })}
 </div>
 ) : null}

 {/* ---------- LIST MODE ---------- */}
 {viewMode === "list" ? (
 <div className="space-y-5">
 {DAYS_OF_WEEK.map((day) => {
 const items = byDay[day];
 if (items.length === 0) return null;
 return (
 <div key={day}>
 <div className="mb-1.5 flex items-center gap-2">
 <h3 className="text-sm font-bold">
 {DAY_LABELS[day]}
 </h3>
 {day === todayDow ? (
 <Badge className="rounded-full bg-green/10 text-[10px] font-bold text-green ">
 TODAY
 </Badge>
 ) : null}
 </div>
 <div className="divide-y overflow-hidden rounded-xl border border-border bg-card shadow-sm ">
 {items.map((sched) => (
 <ListRow
 key={sched.id}
 sched={sched}
 change={changeByScheduleId.get(sched.id)}
 />
 ))}
 </div>
 </div>
 );
 })}
 </div>
 ) : null}
 </motion.div>
 </AnimatePresence>
 </>
 )}
 </div>
 </motion.div>

 {/* ------------------------------ NOTICES ------------------------------ */}
 <motion.section variants={riseIn}>
 <div className="mb-4 flex items-center gap-2.5">
 <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/25">
 <Info className="h-5 w-5" />
 </div>
 <h2 className="text-lg font-bold sm:text-xl">Notices</h2>
 {notices.length > 0 ? (
 <Badge
 variant="secondary"
 className="rounded-full text-[11px] font-bold"
 >
 {notices.length}
 </Badge>
 ) : null}
 </div>

 {notices.length === 0 ? (
 <EmptyState
 icon={Info}
 title="No notices right now"
 hint="Department announcements will appear here — check back later."
 />
 ) : (
 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 {notices.map((n) => {
 const cat = NOTICE_CATEGORIES[n.category] ?? NOTICE_CATEGORIES.general;
 const long = n.content.length > 180;
 return (
 <motion.div key={n.id} whileHover={{ y: -2 }}>
 <Card className="h-full gap-0 rounded-2xl border-border py-0 shadow-sm transition-shadow hover:shadow-lg hover:shadow-[#2D4F35]/10 ">
 <CardContent className="flex h-full flex-col p-4 sm:p-5">
 <div className="flex items-start gap-3">
 <span
 className={cn(
 "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
 cat.chip
 )}
 >
 <cat.icon className="h-4.5 w-4.5" />
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-center gap-1.5">
 {n.isPinned ? (
 <Badge className="rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
 <Pin className="h-3 w-3" /> Pinned
 </Badge>
 ) : null}
 <span
 className={cn(
 "rounded-full px-2 py-0.5 text-[10px] font-bold",
 cat.chip
 )}
 >
 {cat.label}
 </span>
 <span className="text-[11px] text-muted-foreground">
 {timeAgo(n.createdAt)}
 </span>
 </div>
 <h3 className="mt-1.5 font-bold leading-snug">
 {n.title}
 </h3>
 </div>
 </div>
 <p className="mt-2.5 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
 {n.content}
 </p>
 <div className="mt-3 flex items-center justify-between gap-2">
 <span className="truncate text-xs text-muted-foreground">
 By <span className="font-semibold text-foreground/80">{n.postedByName}</span>
 </span>
 {long ? (
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setOpenNotice(n)}
 className="-mr-2 h-8 shrink-0 text-green hover:bg-green/10 hover:text-green"
 >
 Read more <ArrowRight className="h-3.5 w-3.5" />
 </Button>
 ) : null}
 </div>
 </CardContent>
 </Card>
 </motion.div>
 );
 })}
 </div>
 )}
 </motion.section>

 {/* ------------------------------ TEACHERS ------------------------------ */}
 <motion.section variants={riseIn}>
 <div className="mb-4 flex items-center gap-2.5">
 <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-white shadow-md shadow-[#2D4F35]/25">
 <Users className="h-5 w-5" />
 </div>
 <h2 className="text-lg font-bold sm:text-xl">Faculty Members</h2>
 {teachers.length > 0 ? (
 <Badge
 variant="secondary"
 className="rounded-full text-[11px] font-bold"
 >
 {teachers.length}
 </Badge>
 ) : null}
 </div>

 {teachers.length === 0 ? (
 <EmptyState
 icon={Users}
 title="No faculty profiles yet"
 hint="Teachers of this department will be listed here."
 />
 ) : (
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {teachers.map((t) => (
 <motion.div key={t.id} whileHover={{ y: -3 }}>
 <Card className="h-full gap-0 rounded-2xl border-border py-0 shadow-sm transition-shadow hover:shadow-lg hover:shadow-[#2D4F35]/10 ">
 <CardContent className="flex h-full flex-col p-4 sm:p-5">
 <div className="flex items-center gap-3">
 <Avatar className="h-12 w-12 border-2 border-[#2D4F35]/45 shadow-md shadow-[#2D4F35]/15">
 {t.photoURL ? (
 <AvatarImage src={t.photoURL} alt={t.fullName} />
 ) : null}
 <AvatarFallback className="bg-gradient-to-br from-[#2D4F35] to-[#4A7C58] text-sm font-bold text-white">
 {teacherInitials(t.fullName)}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <h3 className="truncate font-bold" title={t.fullName}>
 {t.fullName}
 </h3>
 {t.designation ? (
 <Badge
 variant="secondary"
 className="mt-1 max-w-full rounded-full bg-green/10 text-[10px] font-semibold text-heading "
 >
 <span className="truncate">{t.designation}</span>
 </Badge>
 ) : null}
 </div>
 </div>
 {t.bio ? (
 <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
 {t.bio}
 </p>
 ) : null}
 <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
 {t.officeRoom ? (
 <p className="flex items-center gap-1.5">
 <MapPin className="h-3.5 w-3.5 shrink-0 text-green" />
 <span className="truncate">{t.officeRoom}</span>
 </p>
 ) : null}
 {t.email ? (
 <a
 href={`mailto:${t.email}`}
 className="flex min-h-[20px] items-center gap-1.5 transition-colors hover:text-green"
 >
 <Mail className="h-3.5 w-3.5 shrink-0 text-green" />
 <span className="truncate">{t.email}</span>
 </a>
 ) : null}
 {t.phone ? (
 <a
 href={`tel:${t.phone}`}
 className="flex min-h-[20px] items-center gap-1.5 transition-colors hover:text-green"
 >
 <Phone className="h-3.5 w-3.5 shrink-0 text-green" />
 <span className="truncate">{t.phone}</span>
 </a>
 ) : null}
 </div>
 </CardContent>
 </Card>
 </motion.div>
 ))}
 </div>
 )}
 </motion.section>

 {/* --------------------------- NOTICE DIALOG --------------------------- */}
 <Dialog
 open={!!openNotice}
 onOpenChange={(open) => {
 if (!open) setOpenNotice(null);
 }}
 >
 {openNotice ? (
 <DialogContent className="max-w-lg rounded-2xl">
 <DialogHeader>
 <div className="flex flex-wrap items-center gap-1.5">
 {(() => {
 const cat =
 NOTICE_CATEGORIES[openNotice.category] ??
 NOTICE_CATEGORIES.general;
 return (
 <span
 className={cn(
 "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
 cat.chip
 )}
 >
 <cat.icon className="h-3 w-3" /> {cat.label}
 </span>
 );
 })()}
 {openNotice.isPinned ? (
 <Badge className="rounded-full bg-amber-100 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
 <Pin className="h-3 w-3" /> Pinned
 </Badge>
 ) : null}
 </div>
 <DialogTitle className="text-left">{openNotice.title}</DialogTitle>
 <DialogDescription className="text-left">
 By {openNotice.postedByName} · {fmtDateTime(openNotice.createdAt)}
 </DialogDescription>
 </DialogHeader>
 <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
 {openNotice.content}
 </div>
 </DialogContent>
 ) : null}
 </Dialog>
 </motion.div>
 );
}
