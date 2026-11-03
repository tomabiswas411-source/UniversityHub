"use client";

/* The dialog components intentionally hydrate their form state when the
 * controlled `open` prop flips — a deliberate sync-on-open pattern for every
 * editor dialog in this file. */
/* eslint-disable react-hooks/set-state-in-effect */

import {
 useCallback,
 useEffect,
 useMemo,
 useState,
 type ChangeEvent,
 type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
 BarChart3,
 BookOpen,
 CalendarDays,
 Clock,
 DoorOpen,
 GraduationCap,
 LayoutDashboard,
 LayoutGrid,
 Loader2,
 Megaphone,
 Pencil,
 Pin,
 Plus,
 Search,
 Trash2,
 Users,
} from "lucide-react";

import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
 EmptyState,
 GRADIENT_BTN,
 GRADIENT_ICON,
 PanelLoader,
 SectionCard,
 StatCard,
 TimetableGrid,
} from "@/components/dashboards/dashboard-shared";
import {
 CHART_COLORS,
 ChartCard,
 DonutChart,
 HBarChart,
 StatPill,
 VBarChart,
} from "@/components/dashboards/analytics-charts";
import { timeAgo } from "@/components/shared/notification-bell";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import type {
 CourseDTO,
 DayOfWeek,
 DeptStatsDTO,
 NoticeDTO,
 ProgramDTO,
 RoomDTO,
 ScheduleDTO,
 TimeSlotDTO,
 UserDTO,
} from "@/types";
import { DAYS_OF_WEEK, DAY_LABELS } from "@/types";

/* ============================================================
 DeptAdminPanel — "Aurora Royale" command center for a
 Department Head managing exactly ONE department.
 ============================================================ */

/* ---------------- local row / payload types ---------------- */

/** Students come back with a nested program object (shape may vary). */
type StudentRow = UserDTO & {
 program?: { shortName?: string | null } | null;
 programName?: string | null;
};

type CourseRow = CourseDTO & { programShortName?: string | null };

interface ManageOverview {
 teachers: UserDTO[];
 students: StudentRow[];
 courses: CourseRow[];
 rooms: RoomDTO[];
 timeSlots: TimeSlotDTO[];
 programs: ProgramDTO[];
 notices: NoticeDTO[];
 schedules: ScheduleDTO[];
}

interface DeptAnalytics {
 hasData: boolean;
 totalResults: number;
 avgPerformance: number;
 passRate: number;
 recentChanges: number;
 noticesCount: number;
 gradeDistribution: { letter: string; count: number }[];
 examAverages: { label: string; value: number; count: number }[];
 teacherLoad: { label: string; value: number }[];
 weeklyDensity: { label: string; value: number }[];
 studentsPerProgram: { label: string; value: number }[];
 studentsPerSemester: { label: string; value: number }[];
 coursesPerSemester: { label: string; value: number }[];
}

type ManageEntity =
 | "teachers"
 | "students"
 | "courses"
 | "rooms"
 | "timeslots"
 | "programs"
 | "notices"
 | "schedules";

interface TeacherPayload {
 fullName: string;
 email: string;
 password?: string;
 designation: string | null;
 phone: string | null;
 officeRoom: string | null;
 bio: string | null;
}

interface StudentPayload {
 fullName: string;
 studentIdNumber: string;
 rollNumber: string;
 programId: string | null;
 semester: number | null;
 section: string | null;
 phone: string | null;
}

interface CoursePayload {
 code: string;
 name: string;
 programId: string;
 semester: number;
 type: "theory" | "lab";
 creditHours?: number;
}

interface RoomPayload {
 roomNumber: string;
 building: string | null;
 type: "classroom" | "lab" | "seminar";
 capacity?: number;
}

interface SlotPayload {
 label: string;
 startTime: string;
 endTime: string;
 slotOrder?: number;
 isBreak: boolean;
}

interface ProgramPayload {
 name: string;
 shortName: string;
 semesterCount?: number;
}

interface NoticePayload {
 title: string;
 content: string;
 category: NoticeDTO["category"];
 audience: NoticeDTO["audience"];
 programId: string | null;
 semester: number | null;
 isPinned: boolean;
}

interface SchedulePayload {
 courseId: string;
 teacherId: string;
 roomId: string;
 timeSlotId: string;
 programId: string;
 semester: number;
 dayOfWeek: DayOfWeek;
}

interface ScheduleEditPayload {
 dayOfWeek: DayOfWeek;
 timeSlotId: string;
}

type DeleteTarget = {
 kind: ManageEntity;
 id: string;
 label: string;
};

/* ---------------- constants ---------------- */

const NOTICE_CATEGORIES: Array<{ value: NoticeDTO["category"]; label: string }> = [
 { value: "academic", label: "Academic" },
 { value: "exam", label: "Exam" },
 { value: "event", label: "Event" },
 { value: "general", label: "General" },
 { value: "schedule_change", label: "Schedule change" },
 { value: "assignment", label: "Assignment" },
];

const AUDIENCES: Array<{ value: NoticeDTO["audience"]; label: string }> = [
 { value: "all", label: "Everyone" },
 { value: "students", label: "Students only" },
 { value: "teachers", label: "Teachers only" },
];

const ROOM_TYPES: Array<{ value: RoomDTO["type"]; label: string }> = [
 { value: "classroom", label: "Classroom" },
 { value: "lab", label: "Lab" },
 { value: "seminar", label: "Seminar" },
];

const TABS = [
 { value: "overview", label: "Overview", icon: LayoutDashboard },
 { value: "analytics", label: "Analytics", icon: BarChart3 },
 { value: "schedule", label: "Schedule", icon: CalendarDays },
 { value: "teachers", label: "Teachers", icon: GraduationCap },
 { value: "students", label: "Students", icon: Users },
 { value: "courses", label: "Courses", icon: BookOpen },
 { value: "programs", label: "Programs", icon: LayoutGrid },
 { value: "rooms", label: "Rooms & Slots", icon: DoorOpen },
 { value: "notices", label: "Notices", icon: Megaphone },
] as const;

/* ---------------- helpers ---------------- */

function errMsg(err: unknown): string {
 return err instanceof Error ? err.message : "Something went wrong";
}

function initials(name: string): string {
 const chars = name
 .trim()
 .split(/\s+/)
 .map((p) => p.charAt(0))
 .join("")
 .slice(0, 2);
 return (chars || "?").toUpperCase();
}

function programShortOf(s: StudentRow): string {
 return s.program?.shortName ?? s.programName ?? "";
}

/* ---------------- tiny UI atoms ---------------- */

function Field({
 label,
 required,
 children,
}: {
 label: string;
 required?: boolean;
 children: ReactNode;
}) {
 return (
 <div className="space-y-1.5">
 <Label className="text-xs font-medium text-muted-foreground">
 {label}
 {required && <span className="text-rose-500"> *</span>}
 </Label>
 {children}
 </div>
 );
}

function NoticeCategoryBadge({ category }: { category: NoticeDTO["category"] }) {
 const map: Record<NoticeDTO["category"], { label: string; cls: string }> = {
 academic: {
 label: "Academic",
 cls: "bg-green/10 text-green",
 },
 exam: {
 label: "Exam",
 cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
 },
 event: {
 label: "Event",
 cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 },
 general: { label: "General", cls: "bg-muted text-muted-foreground" },
 schedule_change: {
 label: "Schedule",
 cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 },
 assignment: {
 label: "Assignment",
 cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
 },
 };
 const item = map[category] ?? map.general;
 return (
 <span
 className={cn(
 "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
 item.cls
 )}
 >
 {item.label}
 </span>
 );
}

function AudienceBadge({ audience }: { audience: NoticeDTO["audience"] }) {
 const map: Record<NoticeDTO["audience"], { label: string; cls: string }> = {
 all: {
 label: "Everyone",
 cls: "bg-green/10 text-green",
 },
 students: {
 label: "Students",
 cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
 },
 teachers: {
 label: "Teachers",
 cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 },
 };
 const item = map[audience] ?? map.all;
 return (
 <span
 className={cn(
 "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
 item.cls
 )}
 >
 {item.label}
 </span>
 );
}

function RoomTypeBadge({ type }: { type: RoomDTO["type"] }) {
 const map: Record<RoomDTO["type"], { label: string; cls: string }> = {
 classroom: {
 label: "Classroom",
 cls: "bg-green/10 text-green",
 },
 lab: {
 label: "Lab",
 cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 },
 seminar: {
 label: "Seminar",
 cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
 },
 };
 const item = map[type] ?? map.classroom;
 return (
 <span
 className={cn(
 "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
 item.cls
 )}
 >
 {item.label}
 </span>
 );
}

function ConfirmDialog({
 open,
 onOpenChange,
 title,
 description,
 loading = false,
 onConfirm,
}: {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 title: string;
 description: string;
 loading?: boolean;
 onConfirm: () => void;
}) {
 return (
 <AlertDialog open={open} onOpenChange={onOpenChange}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>{title}</AlertDialogTitle>
 <AlertDialogDescription>{description}</AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
 {/* preventDefault keeps the dialog open while the async delete runs */}
 <AlertDialogAction
 className="bg-rose-600 text-white hover:bg-rose-700"
 onClick={(e) => {
 e.preventDefault();
 onConfirm();
 }}
 disabled={loading}
 >
 {loading && <Loader2 className="h-4 w-4 animate-spin" />}
 Delete
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 );
}

/* ============================================================
 Main panel
 ============================================================ */

export function DeptAdminPanel() {
 const user = useAuthStore((s) => s.user);
 const departmentId = user?.departmentId ?? null;

 /* -------- data -------- */
 const [loading, setLoading] = useState(true);
 const [stats, setStats] = useState<DeptStatsDTO | null>(null);
 const [teachers, setTeachers] = useState<UserDTO[]>([]);
 const [students, setStudents] = useState<StudentRow[]>([]);
 const [courses, setCourses] = useState<CourseRow[]>([]);
 const [rooms, setRooms] = useState<RoomDTO[]>([]);
 const [slots, setSlots] = useState<TimeSlotDTO[]>([]);
 const [programs, setPrograms] = useState<ProgramDTO[]>([]);
 const [notices, setNotices] = useState<NoticeDTO[]>([]);
 const [schedules, setSchedules] = useState<ScheduleDTO[]>([]);
 const [analytics, setAnalytics] = useState<DeptAnalytics | null>(null);

 /* -------- dialogs -------- */
 const [teacherOpen, setTeacherOpen] = useState(false);
 const [editingTeacher, setEditingTeacher] = useState<UserDTO | null>(null);
 const [studentOpen, setStudentOpen] = useState(false);
 const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
 const [courseOpen, setCourseOpen] = useState(false);
 const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
 const [programOpen, setProgramOpen] = useState(false);
 const [editingProgram, setEditingProgram] = useState<ProgramDTO | null>(null);
 const [roomOpen, setRoomOpen] = useState(false);
 const [editingRoom, setEditingRoom] = useState<RoomDTO | null>(null);
 const [slotOpen, setSlotOpen] = useState(false);
 const [editingSlot, setEditingSlot] = useState<TimeSlotDTO | null>(null);
 const [noticeOpen, setNoticeOpen] = useState(false);
 const [addClassOpen, setAddClassOpen] = useState(false);
 const [editClassOpen, setEditClassOpen] = useState(false);
 const [editingSchedule, setEditingSchedule] = useState<ScheduleDTO | null>(null);
 const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
 const [deleting, setDeleting] = useState(false);

 /* -------- search -------- */
 const [teacherQuery, setTeacherQuery] = useState("");
 const [studentQuery, setStudentQuery] = useState("");

 /* ---------------- loaders ---------------- */

 const load = useCallback(
 async (silent = false) => {
 if (!departmentId) {
 setLoading(false);
 return;
 }
 if (!silent) setLoading(true);
 try {
 const q = `?departmentId=${departmentId}`;
 const [ov, st, an] = await Promise.all([
 apiGet<ManageOverview>(`/api/manage/overview${q}`),
 apiGet<DeptStatsDTO>(`/api/manage/stats${q}`),
 apiGet<DeptAnalytics>(`/api/manage/analytics${q}`).catch(() => null),
 ]);
 setTeachers(ov.teachers ?? []);
 setStudents(ov.students ?? []);
 setCourses(ov.courses ?? []);
 setRooms(ov.rooms ?? []);
 setSlots(ov.timeSlots ?? []);
 setPrograms(ov.programs ?? []);
 setNotices(ov.notices ?? []);
 setSchedules(ov.schedules ?? []);
 setStats(st ?? null);
 setAnalytics(an);
 } catch (err) {
 toast({
 title: "Failed to load department data",
 description: errMsg(err),
 variant: "destructive",
 });
 } finally {
 if (!silent) setLoading(false);
 }
 },
 [departmentId]
 );

 useEffect(() => {
 void load();
 }, [load]);

 /* ---------------- generic save / delete ---------------- */

 async function saveEntity<T>(
 entity: ManageEntity,
 payload: T,
 id: string | null,
 labels: { add: string; update: string; fail: string }
 ): Promise<boolean> {
 if (!departmentId) return false;
 try {
 if (id) {
 await apiPut(`/api/manage/${entity}?departmentId=${departmentId}&id=${id}`, payload);
 } else {
 await apiPost(`/api/manage/${entity}?departmentId=${departmentId}`, payload);
 }
 toast({ title: id ? labels.update : labels.add });
 await load(true);
 return true;
 } catch (err) {
 // 409 conflicts etc. surface the server's descriptive message here
 toast({ title: labels.fail, description: errMsg(err), variant: "destructive" });
 return false;
 }
 }

 async function confirmDelete() {
 if (!deleteTarget || !departmentId) return;
 const { kind, id, label } = deleteTarget;
 setDeleting(true);
 try {
 await apiDelete(`/api/manage/${kind}?departmentId=${departmentId}&id=${id}`);
 toast({ title: "Deleted", description: `${label} has been removed.` });
 setDeleteTarget(null);
 await load(true);
 } catch (err) {
 toast({ title: "Delete failed", description: errMsg(err), variant: "destructive" });
 } finally {
 setDeleting(false);
 }
 }

 /* ---------------- derived data ---------------- */

 const sortedSlots = useMemo(
 () =>
 [...slots].sort(
 (a, b) => a.slotOrder - b.slotOrder || a.startTime.localeCompare(b.startTime)
 ),
 [slots]
 );

 const programMap = useMemo(
 () => new Map(programs.map((p) => [p.id, p])),
 [programs]
 );

 const sortedNotices = useMemo(
 () =>
 [...notices].sort(
 (a, b) =>
 Number(b.isPinned) - Number(a.isPinned) ||
 new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
 ),
 [notices]
 );

 const pinnedNotices = useMemo(
 () => sortedNotices.filter((n) => n.isPinned).slice(0, 4),
 [sortedNotices]
 );

 const sortedSchedules = useMemo(() => {
 const dayIdx = new Map(DAYS_OF_WEEK.map((d, i) => [d, i] as const));
 return [...schedules].sort(
 (a, b) =>
 (dayIdx.get(a.dayOfWeek) ?? 0) - (dayIdx.get(b.dayOfWeek) ?? 0) ||
 a.startTime.localeCompare(b.startTime)
 );
 }, [schedules]);

 const filteredTeachers = useMemo(() => {
 const q = teacherQuery.trim().toLowerCase();
 if (!q) return teachers;
 return teachers.filter((t) =>
 [t.fullName, t.email, t.designation].some((v) =>
 (v ?? "").toLowerCase().includes(q)
 )
 );
 }, [teachers, teacherQuery]);

 const filteredStudents = useMemo(() => {
 const q = studentQuery.trim().toLowerCase();
 if (!q) return students;
 return students.filter((s) =>
 [s.fullName, s.rollNumber, s.studentIdNumber, s.section].some((v) =>
 (v ?? "").toLowerCase().includes(q)
 )
 );
 }, [students, studentQuery]);

 const quickCounts = [
 { label: "Teachers", value: teachers.length, icon: GraduationCap },
 { label: "Students", value: students.length, icon: Users },
 { label: "Courses", value: courses.length, icon: BookOpen },
 { label: "Rooms", value: rooms.length, icon: DoorOpen },
 { label: "Time Slots", value: slots.length, icon: Clock },
 { label: "Programs", value: programs.length, icon: LayoutGrid },
 ];

 /* ---------------- dialog openers ---------------- */

 const openAddTeacher = () => {
 setEditingTeacher(null);
 setTeacherOpen(true);
 };
 const openEditTeacher = (t: UserDTO) => {
 setEditingTeacher(t);
 setTeacherOpen(true);
 };
 const openAddStudent = () => {
 setEditingStudent(null);
 setStudentOpen(true);
 };
 const openEditStudent = (s: StudentRow) => {
 setEditingStudent(s);
 setStudentOpen(true);
 };
 const openAddCourse = () => {
 setEditingCourse(null);
 setCourseOpen(true);
 };
 const openEditCourse = (c: CourseRow) => {
 setEditingCourse(c);
 setCourseOpen(true);
 };
 const openAddProgram = () => {
 setEditingProgram(null);
 setProgramOpen(true);
 };
 const openEditProgram = (p: ProgramDTO) => {
 setEditingProgram(p);
 setProgramOpen(true);
 };
 const openAddRoom = () => {
 setEditingRoom(null);
 setRoomOpen(true);
 };
 const openEditRoom = (r: RoomDTO) => {
 setEditingRoom(r);
 setRoomOpen(true);
 };
 const openAddSlot = () => {
 setEditingSlot(null);
 setSlotOpen(true);
 };
 const openEditSlot = (sl: TimeSlotDTO) => {
 setEditingSlot(sl);
 setSlotOpen(true);
 };
 const openEditClass = (s: ScheduleDTO) => {
 setEditingSchedule(s);
 setEditClassOpen(true);
 };

 /* ============================================================
 Render
 ============================================================ */

 if (!departmentId) {
 return (
 <EmptyState
 icon={Users}
 title="No department linked to your account"
 hint="Ask the university super admin to attach your account to a department, then sign in again."
 />
 );
 }

 if (loading) {
 return <PanelLoader label="Loading department control panel…" />;
 }

 return (
 <div className="space-y-6">
 {/* ---------- header strip ---------- */}
 <motion.div
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.35 }}
 >
 <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#241C15] via-[#2D4F35] to-[#241C15] p-5 text-white shadow-lg shadow-[#2D4F35]/25 sm:p-6">
 <div
 aria-hidden
 className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"
 />
 <div
 aria-hidden
 className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl"
 />
 <div className="relative flex flex-wrap items-start justify-between gap-3">
 <div className="min-w-0">
 <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75">
 {user?.universityName ?? "University"} ·{" "}
 {user?.departmentName ?? "Department"}
 </p>
 <h1 className="mt-1 text-xl font-bold sm:text-2xl">
 Department Control Panel
 </h1>
 <p className="mt-1 text-sm text-white/85">
 Welcome back, {user?.fullName} — run your department from one place.
 </p>
 </div>
 <Badge className="border border-white/30 bg-white/15 px-3 py-1.5 text-white backdrop-blur">
 Department Head
 </Badge>
 </div>
 </header>
 </motion.div>

 {/* ---------- stats row ---------- */}
 <section
 aria-label="Department statistics"
 className="grid grid-cols-2 gap-4 lg:grid-cols-4"
 >
 <StatCard
 icon={GraduationCap}
 label="Teachers"
 value={stats?.totalTeachers ?? teachers.length}
 tone="violet"
 delay={0}
 />
 <StatCard
 icon={Users}
 label="Students"
 value={stats?.totalStudents ?? students.length}
 tone="fuchsia"
 delay={0.05}
 />
 <StatCard
 icon={BookOpen}
 label="Courses"
 value={stats?.totalCourses ?? courses.length}
 tone="amber"
 delay={0.1}
 />
 <StatCard
 icon={CalendarDays}
 label="Today's Classes"
 value={stats?.todayClasses ?? 0}
 tone="emerald"
 delay={0.15}
 />
 </section>

 {/* ---------- tabs ---------- */}
 <Tabs defaultValue="overview" className="gap-4">
 <TabsList className="no-scrollbar h-11 w-full justify-start overflow-x-auto rounded-xl p-1 sm:h-9">
 {TABS.map((t) => (
 <TabsTrigger key={t.value} value={t.value} className="shrink-0 gap-1.5 px-3">
 <t.icon className="h-3.5 w-3.5" />
 <span>{t.label}</span>
 </TabsTrigger>
 ))}
 </TabsList>

 {/* ===== Overview ===== */}
 <TabsContent value="overview" className="space-y-4">
 <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
 <SectionCard
 title="Weekly Timetable"
 icon={CalendarDays}
 className="xl:col-span-2"
 action={<Badge variant="outline">{schedules.length} classes</Badge>}
 >
 {schedules.length === 0 || sortedSlots.length === 0 ? (
 <EmptyState
 icon={CalendarDays}
 title="No classes scheduled yet"
 hint="Head to the Schedule tab to add your first class."
 />
 ) : (
 <TimetableGrid schedules={schedules} timeSlots={sortedSlots} />
 )}
 </SectionCard>

 <div className="space-y-4">
 <SectionCard title="Quick Counts" icon={LayoutGrid}>
 <div className="grid grid-cols-2 gap-2">
 {quickCounts.map((qc) => (
 <div
 key={qc.label}
 className="flex items-center gap-2 rounded-xl border p-2.5"
 >
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green/10 ">
 <qc.icon className="h-4 w-4 text-green" />
 </span>
 <div className="min-w-0">
 <p className="text-lg font-bold leading-none">{qc.value}</p>
 <p className="truncate text-[11px] text-muted-foreground">
 {qc.label}
 </p>
 </div>
 </div>
 ))}
 </div>
 </SectionCard>

 <SectionCard
 title="Pinned Notices"
 icon={Pin}
 action={
 <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
 {pinnedNotices.length}
 </Badge>
 }
 >
 {pinnedNotices.length === 0 ? (
 <EmptyState
 icon={Megaphone}
 title="No pinned notices"
 hint="Pin important notices from the Notices tab."
 />
 ) : (
 <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1">
 {pinnedNotices.map((n) => (
 <div key={n.id} className="rounded-xl border p-3">
 <div className="flex items-center gap-1.5">
 <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
 <p className="truncate text-sm font-semibold">{n.title}</p>
 </div>
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
 {n.content}
 </p>
 <div className="mt-2 flex flex-wrap items-center gap-1.5">
 <NoticeCategoryBadge category={n.category} />
 <span className="text-[11px] text-muted-foreground">
 {timeAgo(n.createdAt)}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}
 </SectionCard>
 </div>
 </div>
 </TabsContent>

 {/* ===== Analytics (Day 41) ===== */}
 <TabsContent value="analytics" className="space-y-4">
 {!analytics ? (
 <PanelLoader label="Crunching department numbers…" />
 ) : (
 <>
 {/* KPI row */}
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
 <StatPill label="Result Entries" value={analytics.totalResults} tone="navy" />
 <StatPill
 label="Avg Performance"
 value={`${analytics.avgPerformance}%`}
 tone={analytics.avgPerformance >= 60 ? "green" : analytics.avgPerformance >= 40 ? "gold" : "rust"}
 />
 <StatPill
 label="Pass Rate"
 value={`${analytics.passRate}%`}
 tone={analytics.passRate >= 70 ? "green" : "gold"}
 />
 <StatPill label="Schedule Changes (30d)" value={analytics.recentChanges} tone="gold" />
 </div>

 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 <ChartCard title="Grade Distribution" icon={BarChart3} height={280}>
 <VBarChart
 data={analytics.gradeDistribution.map((g) => ({ label: g.letter, value: g.count }))}
 color={CHART_COLORS.green}
 valueLabel="Students"
 hint="Grades appear here once teachers enter results."
 />
 </ChartCard>
 <ChartCard title="Average Score by Exam Type" icon={BarChart3} height={280}>
 <VBarChart
 data={analytics.examAverages}
 color={CHART_COLORS.gold}
 valueLabel="Avg %"
 hint="Shows once CT / midterm / final results are entered."
 />
 </ChartCard>
 <ChartCard title="Teacher Workload (classes per week)" icon={Users} height={300}>
 <HBarChart
 data={analytics.teacherLoad}
 color={CHART_COLORS.navy}
 hint="Add classes in the Schedule tab to see workload."
 />
 </ChartCard>
 <ChartCard title="Weekly Class Density" icon={CalendarDays} height={300}>
 <VBarChart
 data={analytics.weeklyDensity}
 color={CHART_COLORS.green}
 valueLabel="Classes"
 />
 </ChartCard>
 <ChartCard title="Students per Program" icon={GraduationCap} height={260}>
 <DonutChart
 data={analytics.studentsPerProgram}
 hint="Enroll students to see program distribution."
 />
 </ChartCard>
 <ChartCard title="Students per Semester" icon={LayoutGrid} height={260}>
 <VBarChart
 data={analytics.studentsPerSemester}
 color={CHART_COLORS.rust}
 valueLabel="Students"
 />
 </ChartCard>
 </div>

 <SectionCard title="How these numbers work" icon={BarChart3} className="text-xs text-muted-foreground">
 <p>
 Performance is the average of all entered marks as a percentage, graded on the
 Bangladesh UGC 4.00 scale (A+ ≥ 80%, A ≥ 75% … D ≥ 40%). Pass rate counts entries
 at D or above. Attendance analytics will join this page once the attendance module ships.
 </p>
 </SectionCard>
 </>
 )}
 </TabsContent>

 {/* ===== Schedule ===== */}
 <TabsContent value="schedule" className="space-y-4">
 <SectionCard
 title="Full Weekly Timetable"
 icon={CalendarDays}
 action={
 <Button
 size="sm"
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={() => setAddClassOpen(true)}
 >
 <Plus className="h-4 w-4" />
 Add Class
 </Button>
 }
 >
 {schedules.length === 0 || sortedSlots.length === 0 ? (
 <EmptyState
 icon={CalendarDays}
 title="Nothing on the timetable"
 hint="Add time slots first, then schedule classes into them."
 />
 ) : (
 <TimetableGrid schedules={schedules} timeSlots={sortedSlots} />
 )}
 </SectionCard>

 <SectionCard title={`All Classes (${schedules.length})`} icon={LayoutGrid}>
 <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
 {sortedSchedules.map((s, i) => (
 <motion.div
 key={s.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.25 }}
 className="flex items-center gap-3 rounded-xl border p-3"
 >
 <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/40 dark:to-amber-950/20">
 <span className="text-[10px] font-bold uppercase text-green">
 {DAY_LABELS[s.dayOfWeek].slice(0, 3)}
 </span>
 <span className="text-[11px] font-semibold">{s.startTime}</span>
 </div>
 <div className="min-w-0 flex-1">
 <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
 <span className="truncate">
 {s.courseCode} — {s.courseName}
 </span>
 {s.classType === "lab" && (
 <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
 Lab
 </Badge>
 )}
 </p>
 <p className="truncate text-xs text-muted-foreground">
 {s.teacherName} · {s.roomNumber} ·{" "}
 {programMap.get(s.programId)?.shortName ?? "—"} · Sem {s.semester}
 </p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit time for ${s.courseCode}`}
 className="h-10 w-10 sm:h-9 sm:w-9"
 onClick={() => openEditClass(s)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete ${s.courseCode} on ${DAY_LABELS[s.dayOfWeek]}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-9 sm:w-9"
 onClick={() =>
 setDeleteTarget({
 kind: "schedules",
 id: s.id,
 label: `${s.courseCode} (${DAY_LABELS[s.dayOfWeek]} ${s.startTime})`,
 })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </motion.div>
 ))}
 {schedules.length === 0 && (
 <EmptyState
 icon={CalendarDays}
 title="No classes scheduled"
 hint="Use “Add Class” to build the weekly routine."
 />
 )}
 </div>
 </SectionCard>
 </TabsContent>

 {/* ===== Teachers ===== */}
 <TabsContent value="teachers" className="space-y-4">
 <SectionCard
 title={`Teachers (${teachers.length})`}
 icon={GraduationCap}
 action={
 <Button
 size="sm"
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={openAddTeacher}
 >
 <Plus className="h-4 w-4" />
 Add Teacher
 </Button>
 }
 >
 <div className="space-y-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={teacherQuery}
 onChange={(e) => setTeacherQuery(e.target.value)}
 placeholder="Search by name, email or designation…"
 className="pl-9"
 aria-label="Search teachers"
 />
 </div>
 <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
 {filteredTeachers.map((t, i) => (
 <motion.div
 key={t.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.25 }}
 className="flex items-center gap-3 rounded-xl border p-3"
 >
 <span
 className={cn(
 "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
 GRADIENT_ICON
 )}
 >
 {initials(t.fullName)}
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <p className="truncate text-sm font-semibold">{t.fullName}</p>
 <span
 aria-label={t.isActive ? "Active" : "Inactive"}
 className={cn(
 "h-2 w-2 shrink-0 rounded-full",
 t.isActive ? "bg-emerald-500" : "bg-rose-400"
 )}
 />
 </div>
 <p className="truncate text-xs text-muted-foreground">
 {[t.designation, t.email].filter(Boolean).join(" · ") || "—"}
 </p>
 {(t.phone || t.officeRoom) && (
 <p className="truncate text-[11px] text-muted-foreground/80">
 {[t.phone, t.officeRoom ? `Office ${t.officeRoom}` : ""]
 .filter(Boolean)
 .join(" · ")}
 </p>
 )}
 </div>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit ${t.fullName}`}
 className="h-10 w-10 sm:h-9 sm:w-9"
 onClick={() => openEditTeacher(t)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete ${t.fullName}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-9 sm:w-9"
 onClick={() =>
 setDeleteTarget({ kind: "teachers", id: t.id, label: t.fullName })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </motion.div>
 ))}
 {filteredTeachers.length === 0 && (
 <EmptyState
 icon={GraduationCap}
 title={teacherQuery ? "No teachers match your search" : "No teachers yet"}
 hint={teacherQuery ? undefined : "Add faculty members so they can view and manage routines."}
 />
 )}
 </div>
 </div>
 </SectionCard>
 </TabsContent>

 {/* ===== Students ===== */}
 <TabsContent value="students" className="space-y-4">
 <SectionCard
 title={`Students (${students.length})`}
 icon={Users}
 action={
 <Button
 size="sm"
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={openAddStudent}
 >
 <Plus className="h-4 w-4" />
 Add Student
 </Button>
 }
 >
 <div className="space-y-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 value={studentQuery}
 onChange={(e) => setStudentQuery(e.target.value)}
 placeholder="Search by name, roll or ID number…"
 className="pl-9"
 aria-label="Search students"
 />
 </div>
 <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
 {filteredStudents.map((s, i) => {
 const prog = programShortOf(s);
 return (
 <motion.div
 key={s.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.25 }}
 className="flex items-center gap-3 rounded-xl border p-3"
 >
 <span
 className={cn(
 "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
 GRADIENT_ICON
 )}
 >
 {initials(s.fullName)}
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5">
 <p className="truncate text-sm font-semibold">{s.fullName}</p>
 <span
 aria-label={s.isActive ? "Active" : "Inactive"}
 className={cn(
 "h-2 w-2 shrink-0 rounded-full",
 s.isActive ? "bg-emerald-500" : "bg-rose-400"
 )}
 />
 </div>
 <p className="truncate text-xs text-muted-foreground">
 Roll {s.rollNumber ?? "—"} · ID {s.studentIdNumber ?? "—"}
 </p>
 <div className="mt-1 flex flex-wrap gap-1">
 {prog && (
 <Badge className="bg-green/10 text-green">
 {prog}
 </Badge>
 )}
 {typeof s.semester === "number" && (
 <Badge variant="outline">Sem {s.semester}</Badge>
 )}
 {s.section && <Badge variant="outline">Sec {s.section}</Badge>}
 </div>
 </div>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit ${s.fullName}`}
 className="h-10 w-10 sm:h-9 sm:w-9"
 onClick={() => openEditStudent(s)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete ${s.fullName}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-9 sm:w-9"
 onClick={() =>
 setDeleteTarget({
 kind: "students",
 id: s.id,
 label: s.fullName,
 })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </motion.div>
 );
 })}
 {filteredStudents.length === 0 && (
 <EmptyState
 icon={Users}
 title={studentQuery ? "No students match your search" : "No students yet"}
 hint={studentQuery ? undefined : "Enroll students — they sign in with ID number + roll."}
 />
 )}
 </div>
 </div>
 </SectionCard>
 </TabsContent>

 {/* ===== Courses ===== */}
 <TabsContent value="courses" className="space-y-4">
 <SectionCard
 title={`Courses (${courses.length})`}
 icon={BookOpen}
 action={
 <Button
 size="sm"
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={openAddCourse}
 >
 <Plus className="h-4 w-4" />
 Add Course
 </Button>
 }
 >
 {courses.length === 0 ? (
 <EmptyState
 icon={BookOpen}
 title="No courses yet"
 hint="Create courses per program and semester before scheduling classes."
 />
 ) : (
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
 {courses.map((c, i) => (
 <motion.div
 key={c.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.25 }}
 className="rounded-xl border p-3"
 >
 <div className="flex items-start justify-between gap-2">
 <Badge
 className="bg-green/10 font-mono text-green"
 >
 {c.code}
 </Badge>
 <div className="flex shrink-0 gap-1">
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit ${c.code}`}
 className="h-10 w-10 sm:h-8 sm:w-8"
 onClick={() => openEditCourse(c)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete ${c.code}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-8 sm:w-8"
 onClick={() =>
 setDeleteTarget({
 kind: "courses",
 id: c.id,
 label: `${c.code} — ${c.name}`,
 })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 <p className="mt-2 line-clamp-2 text-sm font-semibold">{c.name}</p>
 <div className="mt-2 flex flex-wrap items-center gap-1.5">
 <Badge variant="outline">
 {c.programShortName ?? programMap.get(c.programId)?.shortName ?? "—"}
 </Badge>
 <Badge variant="outline">Sem {c.semester}</Badge>
 <Badge
 className={cn(
 c.type === "lab"
 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
 : "bg-green/10 text-green"
 )}
 >
 {c.type === "lab" ? "Lab" : "Theory"}
 </Badge>
 <span className="text-[11px] text-muted-foreground">
 {c.creditHours} credits
 </span>
 </div>
 </motion.div>
 ))}
 </div>
 )}
 </SectionCard>
 </TabsContent>

 {/* ===== Programs ===== */}
 <TabsContent value="programs" className="space-y-4">
 <SectionCard
 title={`Programs (${programs.length})`}
 icon={LayoutGrid}
 action={
 <Button
 size="sm"
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={openAddProgram}
 >
 <Plus className="h-4 w-4" />
 Add Program
 </Button>
 }
 >
 {programs.length === 0 ? (
 <EmptyState
 icon={LayoutGrid}
 title="No programs yet"
 hint="Programs (e.g. BSc CSE) organise students, courses and routines."
 />
 ) : (
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
 {programs.map((p, i) => (
 <motion.div
 key={p.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.25 }}
 className="rounded-xl border p-3"
 >
 <div className="flex items-start justify-between gap-2">
 <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
 {p.shortName}
 </Badge>
 <div className="flex shrink-0 gap-1">
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit ${p.name}`}
 className="h-10 w-10 sm:h-8 sm:w-8"
 onClick={() => openEditProgram(p)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete ${p.name}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-8 sm:w-8"
 onClick={() =>
 setDeleteTarget({
 kind: "programs",
 id: p.id,
 label: `${p.name} (${p.shortName})`,
 })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 </div>
 <p className="mt-2 truncate text-sm font-semibold">{p.name}</p>
 <p className="mt-0.5 text-xs text-muted-foreground">
 {p.semesterCount} semesters
 </p>
 </motion.div>
 ))}
 </div>
 )}
 </SectionCard>
 </TabsContent>

 {/* ===== Rooms & Slots ===== */}
 <TabsContent value="rooms" className="space-y-4">
 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 <SectionCard
 title={`Rooms (${rooms.length})`}
 icon={DoorOpen}
 action={
 <Button
 size="sm"
 variant="outline"
 className="h-10 sm:h-8"
 onClick={openAddRoom}
 >
 <Plus className="h-3.5 w-3.5" />
 Add Room
 </Button>
 }
 >
 <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
 {rooms.map((r) => (
 <div
 key={r.id}
 className="flex items-center gap-3 rounded-xl border p-3"
 >
 <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green/10 ">
 <DoorOpen className="h-4 w-4 text-green" />
 </span>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold">{r.roomNumber}</p>
 <p className="truncate text-xs text-muted-foreground">
 {r.building ?? "—"} · {r.capacity || 0} seats
 </p>
 </div>
 <RoomTypeBadge type={r.type} />
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit room ${r.roomNumber}`}
 className="h-10 w-10 sm:h-8 sm:w-8"
 onClick={() => openEditRoom(r)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete room ${r.roomNumber}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-8 sm:w-8"
 onClick={() =>
 setDeleteTarget({
 kind: "rooms",
 id: r.id,
 label: `Room ${r.roomNumber}`,
 })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 ))}
 {rooms.length === 0 && (
 <EmptyState
 icon={DoorOpen}
 title="No rooms yet"
 hint="Add classrooms and labs so classes have somewhere to happen."
 />
 )}
 </div>
 </SectionCard>

 <SectionCard
 title={`Time Slots (${sortedSlots.length})`}
 icon={Clock}
 action={
 <Button
 size="sm"
 variant="outline"
 className="h-10 sm:h-8"
 onClick={openAddSlot}
 >
 <Plus className="h-3.5 w-3.5" />
 Add Slot
 </Button>
 }
 >
 <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
 {sortedSlots.map((sl) => (
 <div
 key={sl.id}
 className={cn(
 "flex items-center gap-3 rounded-xl border p-3",
 sl.isBreak &&
 "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
 )}
 >
 <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold">
 {sl.slotOrder}
 </span>
 <div className="min-w-0 flex-1">
 <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
 <span className="truncate">{sl.label}</span>
 {sl.isBreak && (
 <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
 Break
 </Badge>
 )}
 </p>
 <p className="text-xs text-muted-foreground">
 {sl.startTime} – {sl.endTime}
 </p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Edit slot ${sl.label}`}
 className="h-10 w-10 sm:h-8 sm:w-8"
 onClick={() => openEditSlot(sl)}
 >
 <Pencil className="h-4 w-4" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete slot ${sl.label}`}
 className="h-10 w-10 text-rose-600 hover:text-rose-700 sm:h-8 sm:w-8"
 onClick={() =>
 setDeleteTarget({
 kind: "timeslots",
 id: sl.id,
 label: `Slot ${sl.label} (${sl.startTime})`,
 })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 ))}
 {sortedSlots.length === 0 && (
 <EmptyState
 icon={Clock}
 title="No time slots yet"
 hint="Define the daily period structure first — classes slot into these."
 />
 )}
 </div>
 </SectionCard>
 </div>
 </TabsContent>

 {/* ===== Notices ===== */}
 <TabsContent value="notices" className="space-y-4">
 <SectionCard
 title={`Notices (${notices.length})`}
 icon={Megaphone}
 action={
 <Button
 size="sm"
 className={cn("h-10 sm:h-9", GRADIENT_BTN)}
 onClick={() => setNoticeOpen(true)}
 >
 <Plus className="h-4 w-4" />
 Add Notice
 </Button>
 }
 >
 <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
 {sortedNotices.map((n, i) => (
 <motion.div
 key={n.id}
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: Math.min(i * 0.03, 0.2), duration: 0.25 }}
 className={cn(
 "rounded-xl border p-3",
 n.isPinned && "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/10"
 )}
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <div className="flex items-center gap-1.5">
 {n.isPinned && (
 <Pin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
 )}
 <p className="truncate text-sm font-semibold">{n.title}</p>
 </div>
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
 {n.content}
 </p>
 </div>
 <Button
 variant="ghost"
 size="icon"
 aria-label={`Delete notice ${n.title}`}
 className="h-10 w-10 shrink-0 text-rose-600 hover:text-rose-700 sm:h-8 sm:w-8"
 onClick={() =>
 setDeleteTarget({ kind: "notices", id: n.id, label: n.title })
 }
 >
 <Trash2 className="h-4 w-4" />
 </Button>
 </div>
 <div className="mt-2 flex flex-wrap items-center gap-1.5">
 <NoticeCategoryBadge category={n.category} />
 <AudienceBadge audience={n.audience} />
 {n.programId && (
 <Badge variant="outline">
 {programMap.get(n.programId)?.shortName ?? "Program"}
 </Badge>
 )}
 {typeof n.semester === "number" && (
 <Badge variant="outline">Sem {n.semester}</Badge>
 )}
 <span className="ml-auto text-[11px] text-muted-foreground">
 {timeAgo(n.createdAt)}
 </span>
 </div>
 </motion.div>
 ))}
 {sortedNotices.length === 0 && (
 <EmptyState
 icon={Megaphone}
 title="No notices yet"
 hint="Publish academic, exam or event notices for students and teachers."
 />
 )}
 </div>
 </SectionCard>
 </TabsContent>
 </Tabs>

 {/* ---------- shared delete confirm ---------- */}
 <ConfirmDialog
 open={!!deleteTarget}
 onOpenChange={(open) => {
 if (!open) setDeleteTarget(null);
 }}
 title="Delete this item?"
 description={
 deleteTarget
 ? `${deleteTarget.label} will be permanently removed. This action cannot be undone.`
 : ""
 }
 loading={deleting}
 onConfirm={() => void confirmDelete()}
 />

 {/* ---------- teacher dialog ---------- */}
 <TeacherDialog
 open={teacherOpen}
 onOpenChange={setTeacherOpen}
 teacher={editingTeacher}
 onSubmit={(payload) =>
 saveEntity("teachers", payload, editingTeacher?.id ?? null, {
 add: "Teacher added",
 update: "Teacher updated",
 fail: "Could not save teacher",
 })
 }
 />

 {/* ---------- student dialog ---------- */}
 <StudentDialog
 open={studentOpen}
 onOpenChange={setStudentOpen}
 student={editingStudent}
 programs={programs}
 onSubmit={(payload) =>
 saveEntity("students", payload, editingStudent?.id ?? null, {
 add: "Student added",
 update: "Student updated",
 fail: "Could not save student",
 })
 }
 />

 {/* ---------- course dialog ---------- */}
 <CourseDialog
 open={courseOpen}
 onOpenChange={setCourseOpen}
 course={editingCourse}
 programs={programs}
 onSubmit={(payload) =>
 saveEntity("courses", payload, editingCourse?.id ?? null, {
 add: "Course added",
 update: "Course updated",
 fail: "Could not save course",
 })
 }
 />

 {/* ---------- program dialog ---------- */}
 <ProgramDialog
 open={programOpen}
 onOpenChange={setProgramOpen}
 program={editingProgram}
 onSubmit={(payload) =>
 saveEntity("programs", payload, editingProgram?.id ?? null, {
 add: "Program added",
 update: "Program updated",
 fail: "Could not save program",
 })
 }
 />

 {/* ---------- room dialog ---------- */}
 <RoomDialog
 open={roomOpen}
 onOpenChange={setRoomOpen}
 room={editingRoom}
 onSubmit={(payload) =>
 saveEntity("rooms", payload, editingRoom?.id ?? null, {
 add: "Room added",
 update: "Room updated",
 fail: "Could not save room",
 })
 }
 />

 {/* ---------- time slot dialog ---------- */}
 <SlotDialog
 open={slotOpen}
 onOpenChange={setSlotOpen}
 slot={editingSlot}
 onSubmit={(payload) =>
 saveEntity("timeslots", payload, editingSlot?.id ?? null, {
 add: "Time slot added",
 update: "Time slot updated",
 fail: "Could not save time slot",
 })
 }
 />

 {/* ---------- notice dialog ---------- */}
 <NoticeDialog
 open={noticeOpen}
 onOpenChange={setNoticeOpen}
 programs={programs}
 onSubmit={(payload) =>
 saveEntity("notices", payload, null, {
 add: "Notice published",
 update: "Notice published",
 fail: "Could not publish notice",
 })
 }
 />

 {/* ---------- add class dialog ---------- */}
 <AddScheduleDialog
 open={addClassOpen}
 onOpenChange={setAddClassOpen}
 programs={programs}
 courses={courses}
 teachers={teachers}
 rooms={rooms}
 slots={sortedSlots}
 onSubmit={(payload) =>
 saveEntity("schedules", payload, null, {
 add: "Class scheduled",
 update: "Class scheduled",
 fail: "Could not schedule class",
 })
 }
 />

 {/* ---------- edit class day/slot dialog ---------- */}
 <EditScheduleDialog
 open={editClassOpen && !!editingSchedule}
 onOpenChange={setEditClassOpen}
 schedule={editingSchedule}
 slots={sortedSlots}
 onSubmit={(payload) =>
 saveEntity("schedules", payload, editingSchedule?.id ?? null, {
 add: "Class updated",
 update: "Class updated",
 fail: "Could not update class",
 })
 }
 />
 </div>
 );
}

/* ============================================================
 Entity dialogs (local, self-contained)
 ============================================================ */

/* ---------------- Teacher ---------------- */

interface TeacherFormState {
 fullName: string;
 email: string;
 password: string;
 designation: string;
 phone: string;
 officeRoom: string;
 bio: string;
}

const EMPTY_TEACHER_FORM: TeacherFormState = {
 fullName: "",
 email: "",
 password: "",
 designation: "",
 phone: "",
 officeRoom: "",
 bio: "",
};

function TeacherDialog({
 open,
 onOpenChange,
 teacher,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 teacher: UserDTO | null;
 onSubmit: (payload: TeacherPayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<TeacherFormState>(EMPTY_TEACHER_FORM);
 const [saving, setSaving] = useState(false);
 const isEdit = !!teacher;

 useEffect(() => {
 if (open) {
 setForm(
 teacher
 ? {
 fullName: teacher.fullName ?? "",
 email: teacher.email ?? "",
 password: "",
 designation: teacher.designation ?? "",
 phone: teacher.phone ?? "",
 officeRoom: teacher.officeRoom ?? "",
 bio: teacher.bio ?? "",
 }
 : EMPTY_TEACHER_FORM
 );
 }
 }, [open, teacher]);

 const upd =
 (key: keyof TeacherFormState) =>
 (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
 setForm((f) => ({ ...f, [key]: e.target.value }));

 async function handleSave() {
 if (!form.fullName.trim() || !form.email.trim() || (!isEdit && !form.password.trim())) {
 toast({
 title: "Missing information",
 description: "Name, email and a password are required.",
 variant: "destructive",
 });
 return;
 }
 const payload: TeacherPayload = {
 fullName: form.fullName.trim(),
 email: form.email.trim(),
 designation: form.designation.trim() || null,
 phone: form.phone.trim() || null,
 officeRoom: form.officeRoom.trim() || null,
 bio: form.bio.trim() || null,
 };
 const pw = form.password.trim();
 if (!isEdit || pw) payload.password = pw;
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{isEdit ? "Edit Teacher" : "Add Teacher"}</DialogTitle>
 <DialogDescription>
 {isEdit
 ? "Update faculty details. Leave the password blank to keep the current one."
 : "The teacher will sign in with email + password."}
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Full name" required>
 <Input value={form.fullName} onChange={upd("fullName")} placeholder="Dr. Ayesha Rahman" />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Email" required>
 <Input type="email" value={form.email} onChange={upd("email")} placeholder="ayesha@university.edu" />
 </Field>
 <Field label={isEdit ? "Reset password (optional)" : "Password"} required={!isEdit}>
 <Input
 type="password"
 value={form.password}
 onChange={upd("password")}
 placeholder={isEdit ? "Leave blank to keep current" : "Set a login password"}
 />
 </Field>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Designation">
 <Input value={form.designation} onChange={upd("designation")} placeholder="Associate Professor" />
 </Field>
 <Field label="Phone">
 <Input value={form.phone} onChange={upd("phone")} placeholder="+880 1xxx xxxxxx" />
 </Field>
 </div>
 <Field label="Office room">
 <Input value={form.officeRoom} onChange={upd("officeRoom")} placeholder="Room 502, Building A" />
 </Field>
 <Field label="Bio">
 <Textarea
 rows={3}
 value={form.bio}
 onChange={upd("bio")}
 placeholder="Short public bio shown on teacher profiles…"
 />
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {isEdit ? "Save changes" : "Add teacher"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Student ---------------- */

interface StudentFormState {
 fullName: string;
 studentIdNumber: string;
 rollNumber: string;
 programId: string; // "" = none
 semester: string;
 section: string;
 phone: string;
}

const EMPTY_STUDENT_FORM: StudentFormState = {
 fullName: "",
 studentIdNumber: "",
 rollNumber: "",
 programId: "",
 semester: "",
 section: "",
 phone: "",
};

function StudentDialog({
 open,
 onOpenChange,
 student,
 programs,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 student: StudentRow | null;
 programs: ProgramDTO[];
 onSubmit: (payload: StudentPayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<StudentFormState>(EMPTY_STUDENT_FORM);
 const [saving, setSaving] = useState(false);
 const isEdit = !!student;

 useEffect(() => {
 if (open) {
 setForm(
 student
 ? {
 fullName: student.fullName ?? "",
 studentIdNumber: student.studentIdNumber ?? "",
 rollNumber: student.rollNumber ?? "",
 programId: student.programId ?? "",
 semester: student.semester != null ? String(student.semester) : "",
 section: student.section ?? "",
 phone: student.phone ?? "",
 }
 : EMPTY_STUDENT_FORM
 );
 }
 }, [open, student]);

 const upd =
 (key: keyof StudentFormState) =>
 (e: ChangeEvent<HTMLInputElement>) =>
 setForm((f) => ({ ...f, [key]: e.target.value }));

 async function handleSave() {
 if (!form.fullName.trim() || !form.studentIdNumber.trim() || !form.rollNumber.trim()) {
 toast({
 title: "Missing information",
 description: "Name, ID number and roll number are required.",
 variant: "destructive",
 });
 return;
 }
 const payload: StudentPayload = {
 fullName: form.fullName.trim(),
 studentIdNumber: form.studentIdNumber.trim(),
 rollNumber: form.rollNumber.trim(),
 programId: form.programId || null,
 semester: form.semester ? Number(form.semester) : null,
 section: form.section.trim() || null,
 phone: form.phone.trim() || null,
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{isEdit ? "Edit Student" : "Add Student"}</DialogTitle>
 <DialogDescription>
 Students sign in with their ID number + roll — no password needed.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Full name" required>
 <Input value={form.fullName} onChange={upd("fullName")} placeholder="Nafis Ahmed" />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="ID number" required>
 <Input value={form.studentIdNumber} onChange={upd("studentIdNumber")} placeholder="223015068" />
 </Field>
 <Field label="Roll number" required>
 <Input value={form.rollNumber} onChange={upd("rollNumber")} placeholder="68" />
 </Field>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Program">
 <Select
 value={form.programId || "none"}
 onValueChange={(v) => setForm((f) => ({ ...f, programId: v === "none" ? "" : v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select program" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">No program</SelectItem>
 {programs.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.shortName} — {p.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Semester">
 <Input type="number" min={1} value={form.semester} onChange={upd("semester")} placeholder="3" />
 </Field>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Section">
 <Input value={form.section} onChange={upd("section")} placeholder="A" />
 </Field>
 <Field label="Phone">
 <Input value={form.phone} onChange={upd("phone")} placeholder="+880 1xxx xxxxxx" />
 </Field>
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {isEdit ? "Save changes" : "Add student"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Course ---------------- */

interface CourseFormState {
 code: string;
 name: string;
 programId: string;
 semester: string;
 creditHours: string;
 type: "theory" | "lab";
}

const EMPTY_COURSE_FORM: CourseFormState = {
 code: "",
 name: "",
 programId: "",
 semester: "",
 creditHours: "3",
 type: "theory",
};

function CourseDialog({
 open,
 onOpenChange,
 course,
 programs,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 course: CourseRow | null;
 programs: ProgramDTO[];
 onSubmit: (payload: CoursePayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);
 const [saving, setSaving] = useState(false);
 const isEdit = !!course;

 useEffect(() => {
 if (open) {
 setForm(
 course
 ? {
 code: course.code ?? "",
 name: course.name ?? "",
 programId: course.programId ?? "",
 semester: course.semester != null ? String(course.semester) : "",
 creditHours: course.creditHours != null ? String(course.creditHours) : "3",
 type: course.type ?? "theory",
 }
 : EMPTY_COURSE_FORM
 );
 }
 }, [open, course]);

 async function handleSave() {
 if (!form.code.trim() || !form.name.trim() || !form.programId || !form.semester) {
 toast({
 title: "Missing information",
 description: "Code, name, program and semester are required.",
 variant: "destructive",
 });
 return;
 }
 const payload: CoursePayload = {
 code: form.code.trim(),
 name: form.name.trim(),
 programId: form.programId,
 semester: Number(form.semester),
 type: form.type,
 ...(form.creditHours !== "" ? { creditHours: Number(form.creditHours) } : {}),
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{isEdit ? "Edit Course" : "Add Course"}</DialogTitle>
 <DialogDescription>Courses feed directly into the weekly routine.</DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Course code" required>
 <Input
 value={form.code}
 onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
 placeholder="CSE 223"
 className="font-mono"
 />
 </Field>
 <Field label="Semester" required>
 <Input
 type="number"
 min={1}
 value={form.semester}
 onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
 placeholder="3"
 />
 </Field>
 </div>
 <Field label="Course name" required>
 <Input
 value={form.name}
 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
 placeholder="Data Structures & Algorithms"
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Program" required>
 <Select
 value={form.programId || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, programId: v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select program" />
 </SelectTrigger>
 <SelectContent>
 {programs.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.shortName} — {p.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Type">
 <Select
 value={form.type}
 onValueChange={(v) => setForm((f) => ({ ...f, type: v === "lab" ? "lab" : "theory" }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="theory">Theory</SelectItem>
 <SelectItem value="lab">Lab</SelectItem>
 </SelectContent>
 </Select>
 </Field>
 </div>
 <Field label="Credit hours">
 <Input
 type="number"
 min={0}
 step={0.5}
 value={form.creditHours}
 onChange={(e) => setForm((f) => ({ ...f, creditHours: e.target.value }))}
 />
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {isEdit ? "Save changes" : "Add course"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Program ---------------- */

interface ProgramFormState {
 name: string;
 shortName: string;
 semesterCount: string;
}

const EMPTY_PROGRAM_FORM: ProgramFormState = {
 name: "",
 shortName: "",
 semesterCount: "8",
};

function ProgramDialog({
 open,
 onOpenChange,
 program,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 program: ProgramDTO | null;
 onSubmit: (payload: ProgramPayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<ProgramFormState>(EMPTY_PROGRAM_FORM);
 const [saving, setSaving] = useState(false);
 const isEdit = !!program;

 useEffect(() => {
 if (open) {
 setForm(
 program
 ? {
 name: program.name ?? "",
 shortName: program.shortName ?? "",
 semesterCount:
 program.semesterCount != null ? String(program.semesterCount) : "8",
 }
 : EMPTY_PROGRAM_FORM
 );
 }
 }, [open, program]);

 async function handleSave() {
 if (!form.name.trim() || !form.shortName.trim()) {
 toast({
 title: "Missing information",
 description: "Program name and short name are required.",
 variant: "destructive",
 });
 return;
 }
 const payload: ProgramPayload = {
 name: form.name.trim(),
 shortName: form.shortName.trim(),
 ...(form.semesterCount !== "" ? { semesterCount: Number(form.semesterCount) } : {}),
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>{isEdit ? "Edit Program" : "Add Program"}</DialogTitle>
 <DialogDescription>Programs group students and courses into degrees.</DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Program name" required>
 <Input
 value={form.name}
 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
 placeholder="BSc in Computer Science & Engineering"
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Short name" required>
 <Input
 value={form.shortName}
 onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
 placeholder="CSE"
 />
 </Field>
 <Field label="Semesters">
 <Input
 type="number"
 min={1}
 value={form.semesterCount}
 onChange={(e) => setForm((f) => ({ ...f, semesterCount: e.target.value }))}
 />
 </Field>
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {isEdit ? "Save changes" : "Add program"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Room ---------------- */

interface RoomFormState {
 roomNumber: string;
 building: string;
 type: RoomDTO["type"];
 capacity: string;
}

const EMPTY_ROOM_FORM: RoomFormState = {
 roomNumber: "",
 building: "",
 type: "classroom",
 capacity: "40",
};

function RoomDialog({
 open,
 onOpenChange,
 room,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 room: RoomDTO | null;
 onSubmit: (payload: RoomPayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<RoomFormState>(EMPTY_ROOM_FORM);
 const [saving, setSaving] = useState(false);
 const isEdit = !!room;

 useEffect(() => {
 if (open) {
 setForm(
 room
 ? {
 roomNumber: room.roomNumber ?? "",
 building: room.building ?? "",
 type: room.type ?? "classroom",
 capacity: room.capacity != null ? String(room.capacity) : "40",
 }
 : EMPTY_ROOM_FORM
 );
 }
 }, [open, room]);

 async function handleSave() {
 if (!form.roomNumber.trim()) {
 toast({
 title: "Missing information",
 description: "Room number is required.",
 variant: "destructive",
 });
 return;
 }
 const payload: RoomPayload = {
 roomNumber: form.roomNumber.trim(),
 building: form.building.trim() || null,
 type: form.type,
 ...(form.capacity !== "" ? { capacity: Number(form.capacity) } : {}),
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>{isEdit ? "Edit Room" : "Add Room"}</DialogTitle>
 <DialogDescription>Rooms are where scheduled classes take place.</DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Room number" required>
 <Input
 value={form.roomNumber}
 onChange={(e) => setForm((f) => ({ ...f, roomNumber: e.target.value }))}
 placeholder="301"
 />
 </Field>
 <Field label="Capacity">
 <Input
 type="number"
 min={0}
 value={form.capacity}
 onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
 />
 </Field>
 </div>
 <Field label="Building">
 <Input
 value={form.building}
 onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))}
 placeholder="Building A"
 />
 </Field>
 <Field label="Type">
 <Select
 value={form.type}
 onValueChange={(v) =>
 setForm((f) => ({
 ...f,
 type: v === "lab" ? "lab" : v === "seminar" ? "seminar" : "classroom",
 }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {ROOM_TYPES.map((t) => (
 <SelectItem key={t.value} value={t.value}>
 {t.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {isEdit ? "Save changes" : "Add room"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Time slot ---------------- */

interface SlotFormState {
 label: string;
 startTime: string;
 endTime: string;
 slotOrder: string;
 isBreak: boolean;
}

const EMPTY_SLOT_FORM: SlotFormState = {
 label: "",
 startTime: "",
 endTime: "",
 slotOrder: "1",
 isBreak: false,
};

function SlotDialog({
 open,
 onOpenChange,
 slot,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 slot: TimeSlotDTO | null;
 onSubmit: (payload: SlotPayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<SlotFormState>(EMPTY_SLOT_FORM);
 const [saving, setSaving] = useState(false);
 const isEdit = !!slot;

 useEffect(() => {
 if (open) {
 setForm(
 slot
 ? {
 label: slot.label ?? "",
 startTime: slot.startTime ?? "",
 endTime: slot.endTime ?? "",
 slotOrder: slot.slotOrder != null ? String(slot.slotOrder) : "1",
 isBreak: slot.isBreak,
 }
 : EMPTY_SLOT_FORM
 );
 }
 }, [open, slot]);

 async function handleSave() {
 if (!form.label.trim() || !form.startTime || !form.endTime) {
 toast({
 title: "Missing information",
 description: "Label, start time and end time are required.",
 variant: "destructive",
 });
 return;
 }
 const payload: SlotPayload = {
 label: form.label.trim(),
 startTime: form.startTime,
 endTime: form.endTime,
 isBreak: form.isBreak,
 ...(form.slotOrder !== "" ? { slotOrder: Number(form.slotOrder) } : {}),
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>{isEdit ? "Edit Time Slot" : "Add Time Slot"}</DialogTitle>
 <DialogDescription>
 The daily period structure — classes are scheduled into these slots.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Label" required>
 <Input
 value={form.label}
 onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
 placeholder="Period 1 / Lunch break"
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Start time" required>
 <Input
 type="time"
 value={form.startTime}
 onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
 />
 </Field>
 <Field label="End time" required>
 <Input
 type="time"
 value={form.endTime}
 onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
 />
 </Field>
 </div>
 <Field label="Slot order">
 <Input
 type="number"
 min={0}
 value={form.slotOrder}
 onChange={(e) => setForm((f) => ({ ...f, slotOrder: e.target.value }))}
 />
 </Field>
 <div className="flex items-center justify-between rounded-xl border p-3">
 <div>
 <p className="text-sm font-medium">Break</p>
 <p className="text-xs text-muted-foreground">
 Breaks are highlighted amber on the timetable.
 </p>
 </div>
 <Switch
 checked={form.isBreak}
 onCheckedChange={(v) => setForm((f) => ({ ...f, isBreak: v }))}
 aria-label="Mark as break"
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 {isEdit ? "Save changes" : "Add slot"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Notice ---------------- */

interface NoticeFormState {
 title: string;
 content: string;
 category: NoticeDTO["category"];
 audience: NoticeDTO["audience"];
 programId: string; // "" = all programs
 semester: string;
 isPinned: boolean;
}

const EMPTY_NOTICE_FORM: NoticeFormState = {
 title: "",
 content: "",
 category: "general",
 audience: "all",
 programId: "",
 semester: "",
 isPinned: false,
};

function NoticeDialog({
 open,
 onOpenChange,
 programs,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 programs: ProgramDTO[];
 onSubmit: (payload: NoticePayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<NoticeFormState>(EMPTY_NOTICE_FORM);
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (open) setForm(EMPTY_NOTICE_FORM);
 }, [open]);

 async function handleSave() {
 if (!form.title.trim() || !form.content.trim()) {
 toast({
 title: "Missing information",
 description: "Title and content are required.",
 variant: "destructive",
 });
 return;
 }
 const payload: NoticePayload = {
 title: form.title.trim(),
 content: form.content.trim(),
 category: form.category,
 audience: form.audience,
 programId: form.programId || null,
 semester: form.semester ? Number(form.semester) : null,
 isPinned: form.isPinned,
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>Add Notice</DialogTitle>
 <DialogDescription>
 Pinned notices appear first for students and teachers.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Title" required>
 <Input
 value={form.title}
 onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
 placeholder="Midterm exam routine published"
 />
 </Field>
 <Field label="Content" required>
 <Textarea
 rows={4}
 value={form.content}
 onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
 placeholder="Write the full notice here…"
 />
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Category">
 <Select
 value={form.category}
 onValueChange={(v) =>
 setForm((f) => ({ ...f, category: v as NoticeDTO["category"] }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {NOTICE_CATEGORIES.map((c) => (
 <SelectItem key={c.value} value={c.value}>
 {c.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Audience">
 <Select
 value={form.audience}
 onValueChange={(v) =>
 setForm((f) => ({ ...f, audience: v as NoticeDTO["audience"] }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {AUDIENCES.map((a) => (
 <SelectItem key={a.value} value={a.value}>
 {a.label}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Program (optional)">
 <Select
 value={form.programId || "none"}
 onValueChange={(v) =>
 setForm((f) => ({ ...f, programId: v === "none" ? "" : v }))
 }
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="All programs" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="none">All programs</SelectItem>
 {programs.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.shortName} — {p.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Semester (optional)">
 <Input
 type="number"
 min={1}
 value={form.semester}
 onChange={(e) => setForm((f) => ({ ...f, semester: e.target.value }))}
 placeholder="All semesters"
 />
 </Field>
 </div>
 <div className="flex items-center justify-between rounded-xl border p-3">
 <div>
 <p className="text-sm font-medium">Pinned</p>
 <p className="text-xs text-muted-foreground">
 Pinned notices stay on top of everyone&apos;s feed.
 </p>
 </div>
 <Switch
 checked={form.isPinned}
 onCheckedChange={(v) => setForm((f) => ({ ...f, isPinned: v }))}
 aria-label="Pin notice"
 />
 </div>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 Publish notice
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Add class (schedule) ---------------- */

interface ScheduleFormState {
 programId: string;
 semester: string;
 courseId: string;
 teacherId: string;
 dayOfWeek: string;
 timeSlotId: string;
 roomId: string;
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
 programId: "",
 semester: "",
 courseId: "",
 teacherId: "",
 dayOfWeek: "",
 timeSlotId: "",
 roomId: "",
};

function AddScheduleDialog({
 open,
 onOpenChange,
 programs,
 courses,
 teachers,
 rooms,
 slots,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 programs: ProgramDTO[];
 courses: CourseRow[];
 teachers: UserDTO[];
 rooms: RoomDTO[];
 slots: TimeSlotDTO[];
 onSubmit: (payload: SchedulePayload) => Promise<boolean>;
}) {
 const [form, setForm] = useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM);
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (open) setForm(EMPTY_SCHEDULE_FORM);
 }, [open]);

 const courseOptions = courses.filter(
 (c) =>
 c.programId === form.programId &&
 (form.semester === "" || c.semester === Number(form.semester))
 );

 async function handleSave() {
 const missingLabels: string[] = [];
 if (!form.programId) missingLabels.push("program");
 if (!form.semester) missingLabels.push("semester");
 if (!form.courseId) missingLabels.push("course");
 if (!form.teacherId) missingLabels.push("teacher");
 if (!form.dayOfWeek) missingLabels.push("day");
 if (!form.timeSlotId) missingLabels.push("time slot");
 if (!form.roomId) missingLabels.push("room");
 if (missingLabels.length > 0) {
 toast({
 title: "Missing information",
 description: `Please choose: ${missingLabels.join(", ")}.`,
 variant: "destructive",
 });
 return;
 }
 const payload: SchedulePayload = {
 courseId: form.courseId,
 teacherId: form.teacherId,
 roomId: form.roomId,
 timeSlotId: form.timeSlotId,
 programId: form.programId,
 semester: Number(form.semester),
 dayOfWeek: form.dayOfWeek as DayOfWeek,
 };
 setSaving(true);
 const ok = await onSubmit(payload);
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>Add Class</DialogTitle>
 <DialogDescription>
 The server checks room / teacher conflicts and rejects overlaps.
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Program" required>
 <Select
 value={form.programId || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, programId: v, courseId: "" }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select program" />
 </SelectTrigger>
 <SelectContent>
 {programs.map((p) => (
 <SelectItem key={p.id} value={p.id}>
 {p.shortName} — {p.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Semester" required>
 <Select
 value={form.semester || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, semester: v, courseId: "" }))}
 disabled={!form.programId}
 >
 <SelectTrigger className="w-full">
 <SelectValue
 placeholder={form.programId ? "Select semester" : "Select program first"}
 />
 </SelectTrigger>
 <SelectContent>
 {(() => {
 const program = programs.find((p) => p.id === form.programId);
 const count = program?.semesterCount ?? 8;
 return Array.from({ length: count }, (_, i) => i + 1).map((n) => (
 <SelectItem key={n} value={String(n)}>
 Semester {n}
 </SelectItem>
 ));
 })()}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <Field label="Course" required>
 {/* Keyed by program+semester so the Radix select remounts and
 never shows a stale course after the filter changes. */}
 <Select
 key={`${form.programId}|${form.semester}`}
 value={form.courseId || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, courseId: v }))}
 disabled={!form.programId}
 >
 <SelectTrigger className="w-full">
 <SelectValue
 placeholder={form.programId ? "Select course" : "Select program first"}
 />
 </SelectTrigger>
 <SelectContent>
 {courseOptions.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.code} — {c.name}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 {form.programId && courseOptions.length === 0 && (
 <p className="text-[11px] text-rose-600">
 No course matches this program / semester — add one in the Courses tab.
 </p>
 )}
 </Field>
 <Field label="Teacher" required>
 <Select
 value={form.teacherId || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, teacherId: v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select teacher" />
 </SelectTrigger>
 <SelectContent>
 {teachers.map((t) => (
 <SelectItem key={t.id} value={t.id}>
 {t.fullName}
 {t.designation ? ` · ${t.designation}` : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <Field label="Day" required>
 <Select
 value={form.dayOfWeek || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select day" />
 </SelectTrigger>
 <SelectContent>
 {DAYS_OF_WEEK.map((d) => (
 <SelectItem key={d} value={d}>
 {DAY_LABELS[d]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Time slot" required>
 <Select
 value={form.timeSlotId || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, timeSlotId: v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select slot" />
 </SelectTrigger>
 <SelectContent>
 {slots.map((sl) => (
 <SelectItem key={sl.id} value={sl.id}>
 {sl.startTime} – {sl.endTime} · {sl.label}
 {sl.isBreak ? " (Break)" : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <Field label="Room" required>
 <Select
 value={form.roomId || undefined}
 onValueChange={(v) => setForm((f) => ({ ...f, roomId: v }))}
 >
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select room" />
 </SelectTrigger>
 <SelectContent>
 {rooms.map((r) => (
 <SelectItem key={r.id} value={r.id}>
 {r.roomNumber}
 {r.building ? ` · ${r.building}` : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 Schedule class
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}

/* ---------------- Edit class (day / slot only) ---------------- */

function EditScheduleDialog({
 open,
 onOpenChange,
 schedule,
 slots,
 onSubmit,
}: {
 open: boolean;
 onOpenChange: (v: boolean) => void;
 schedule: ScheduleDTO | null;
 slots: TimeSlotDTO[];
 onSubmit: (payload: ScheduleEditPayload) => Promise<boolean>;
}) {
 const [day, setDay] = useState<string>("");
 const [slotId, setSlotId] = useState<string>("");
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (open && schedule) {
 setDay(schedule.dayOfWeek);
 setSlotId(schedule.timeSlotId);
 }
 }, [open, schedule]);

 async function handleSave() {
 if (!day || !slotId) {
 toast({
 title: "Missing information",
 description: "Pick both a day and a time slot.",
 variant: "destructive",
 });
 return;
 }
 setSaving(true);
 const ok = await onSubmit({ dayOfWeek: day as DayOfWeek, timeSlotId: slotId });
 setSaving(false);
 if (ok) onOpenChange(false);
 }

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle>Edit Class Time</DialogTitle>
 <DialogDescription>
 {schedule
 ? `Move ${schedule.courseCode} to another day or time slot. Conflicts are rejected by the server.`
 : "Move this class to another day or time slot."}
 </DialogDescription>
 </DialogHeader>
 <div className="grid grid-cols-1 gap-3">
 <Field label="Day" required>
 <Select value={day || undefined} onValueChange={setDay}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select day" />
 </SelectTrigger>
 <SelectContent>
 {DAYS_OF_WEEK.map((d) => (
 <SelectItem key={d} value={d}>
 {DAY_LABELS[d]}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 <Field label="Time slot" required>
 <Select value={slotId || undefined} onValueChange={setSlotId}>
 <SelectTrigger className="w-full">
 <SelectValue placeholder="Select slot" />
 </SelectTrigger>
 <SelectContent>
 {slots.map((sl) => (
 <SelectItem key={sl.id} value={sl.id}>
 {sl.startTime} – {sl.endTime} · {sl.label}
 {sl.isBreak ? " (Break)" : ""}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </Field>
 </div>
 <DialogFooter className="gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Cancel
 </Button>
 <Button className={cn("h-10", GRADIENT_BTN)} onClick={() => void handleSave()} disabled={saving}>
 {saving && <Loader2 className="h-4 w-4 animate-spin" />}
 Save changes
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 );
}
